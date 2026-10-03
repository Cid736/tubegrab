// Play on the TV (desktop app): finds Chromecasts (mDNS) and DLNA/UPnP media
// renderers (SSDP) on the local network, and tells one of them to play a
// link served by our own LAN share server. Only private network addresses
// are ever contacted; replies are read with size limits and timeouts, and
// nothing in them is ever run or followed elsewhere.
const dgram = require('dgram');
const http = require('http');
const tls = require('tls');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const DISCOVERY_MS = 3500;
const MAX_XML = 256 * 1024;
const MAX_DEVICES = 30;

/** 10.x, 172.16–31.x, 192.168.x (and not ourselves on loopback). */
function isPrivateIPv4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip));
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (m.slice(1).some((x) => Number(x) > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

const xmlUnescape = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const cleanLabel = (s) => xmlUnescape(String(s || '')).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);

/** A small GET/POST to a device on the LAN; resolves with the body (capped) or rejects. */
function lanRequest(urlString, { method = 'GET', headers = {}, body = null, timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlString); } catch { return reject(new Error('bad url')); }
    if (u.protocol !== 'http:' || !isPrivateIPv4(u.hostname)) return reject(new Error('not on the local network'));
    const req = http.request({ host: u.hostname, port: u.port || 80, path: `${u.pathname}${u.search}`, method, headers, timeout }, (res) => {
      let size = 0;
      const chunks = [];
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_XML) { req.destroy(); return reject(new Error('too big')); }
        chunks.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

// ---- DLNA / UPnP ----------------------------------------------------------
const SSDP_ADDR = '239.255.255.250';
const AVTRANSPORT = 'urn:schemas-upnp-org:service:AVTransport:1';

/** "LOCATION: http://…" from an SSDP answer. */
function ssdpLocation(text) {
  const m = /^location:\s*(\S+)/im.exec(String(text));
  return m ? m[1].trim() : null;
}

/** The friendly name and the AVTransport control URL of a device description. */
function parseDescription(xml, base) {
  const name = /<friendlyName>([^<]{1,200})<\/friendlyName>/i.exec(xml);
  const services = String(xml).split(/<service>/i).slice(1);
  for (const svc of services) {
    if (!svc.includes(AVTRANSPORT)) continue;
    const ctl = /<controlURL>([^<]{1,500})<\/controlURL>/i.exec(svc);
    if (!ctl) continue;
    let control;
    try { control = new URL(xmlUnescape(ctl[1].trim()), base).toString(); } catch { continue; }
    return { name: cleanLabel(name ? name[1] : 'TV'), control };
  }
  return null;
}

function searchDlna(address, ms = DISCOVERY_MS) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const pending = [];
    const done = () => { try { sock.close(); } catch { /* closed */ } Promise.allSettled(pending).then(() => resolve([...found.values()])); };
    sock.on('error', done);
    sock.on('message', (msg, rinfo) => {
      if (!isPrivateIPv4(rinfo.address) || found.size >= MAX_DEVICES) return;
      const loc = ssdpLocation(msg.toString('utf8'));
      let u;
      try { u = new URL(loc); } catch { return; }
      // The description must come from the device that answered.
      if (u.hostname !== rinfo.address || found.has(loc)) return;
      found.set(loc, null);
      pending.push(lanRequest(loc).then((r) => {
        const d = r.status === 200 ? parseDescription(r.body, loc) : null;
        if (d && new URL(d.control).hostname === rinfo.address) found.set(loc, { id: `dlna:${crypto.createHash('sha1').update(d.control).digest('hex').slice(0, 16)}`, kind: 'dlna', name: d.name, control: d.control, host: rinfo.address });
        else found.delete(loc);
      }, () => found.delete(loc)));
    });
    sock.bind({ address, port: 0 }, () => {
      const q = Buffer.from(['M-SEARCH * HTTP/1.1', `HOST: ${SSDP_ADDR}:1900`, 'MAN: "ssdp:discover"', 'MX: 2', 'ST: urn:schemas-upnp-org:device:MediaRenderer:1', '', ''].join('\r\n'));
      sock.send(q, 1900, SSDP_ADDR);
      setTimeout(() => sock.send(q, 1900, SSDP_ADDR), 600);
      setTimeout(done, ms);
    });
  }).then((list) => list.filter(Boolean));
}

function soap(device, action, args) {
  const body = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
    + `<s:Body><u:${action} xmlns:u="${AVTRANSPORT}"><InstanceID>0</InstanceID>${Object.entries(args).map(([k, v]) => `<${k}>${xmlEscape(v)}</${k}>`).join('')}</u:${action}></s:Body></s:Envelope>`;
  return lanRequest(device.control, {
    method: 'POST', body,
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${AVTRANSPORT}#${action}"`, 'Content-Length': Buffer.byteLength(body) },
  }).then((r) => { if (r.status !== 200) throw new Error(`La tele respondió ${r.status}`); return r.body; });
}

function didl(url, title, type) {
  const cls = type.startsWith('video') ? 'object.item.videoItem' : 'object.item.audioItem.musicTrack';
  return '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">'
    + `<item id="0" parentID="-1" restricted="1"><dc:title>${xmlEscape(title)}</dc:title><upnp:class>${cls}</upnp:class>`
    + `<res protocolInfo="http-get:*:${xmlEscape(type)}:*">${xmlEscape(url)}</res></item></DIDL-Lite>`;
}

const hms = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const dlna = {
  async play(device, { url, title, contentType }) {
    await soap(device, 'Stop', {}).catch(() => {});
    await soap(device, 'SetAVTransportURI', { CurrentURI: url, CurrentURIMetaData: didl(url, title, contentType) });
    await soap(device, 'Play', { Speed: '1' });
  },
  pause: (device) => soap(device, 'Pause', {}),
  resume: (device) => soap(device, 'Play', { Speed: '1' }),
  stop: (device) => soap(device, 'Stop', {}),
  seek: (device, sec) => soap(device, 'Seek', { Unit: 'REL_TIME', Target: hms(sec) }),
};

// ---- Chromecast (CASTV2 over TLS on port 8009) -----------------------------
// mDNS question for "_googlecast._tcp.local" (PTR), answered by each device.
function mdnsQuery() {
  const labels = ['_googlecast', '_tcp', 'local'];
  const name = Buffer.concat([...labels.map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])), Buffer.from([0])]);
  const header = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([header, name, Buffer.from([0, 12, 0, 1])]); // QTYPE PTR, QCLASS IN
}

/** Reads a (possibly compressed) DNS name at `off`; returns [name, next offset]. */
function readName(buf, off, depth = 0) {
  const labels = [];
  let pos = off;
  let next = null;
  for (let guard = 0; guard < 64; guard++) {
    if (pos >= buf.length) throw new Error('bad name');
    const len = buf[pos];
    if (len === 0) { pos += 1; break; }
    if ((len & 0xc0) === 0xc0) {
      if (depth > 8 || pos + 1 >= buf.length) throw new Error('bad pointer');
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1];
      if (next === null) next = pos + 2;
      const [rest] = readName(buf, ptr, depth + 1);
      if (rest) labels.push(rest);
      pos = -1;
      break;
    }
    labels.push(buf.toString('utf8', pos + 1, pos + 1 + len));
    pos += 1 + len;
  }
  return [labels.join('.'), next !== null ? next : pos];
}

/** An mDNS answer → { name (friendly), port } of a Chromecast, or null. */
function parseMdns(buf) {
  try {
    const counts = [4, 6, 8, 10].map((i) => buf.readUInt16BE(i));
    let off = 12;
    for (let i = 0; i < counts[0]; i++) { off = readName(buf, off)[1] + 4; }
    let port = 8009;
    let friendly = null;
    let isCast = false;
    const total = counts[1] + counts[2] + counts[3];
    for (let i = 0; i < total && off < buf.length; i++) {
      const [name, after] = readName(buf, off);
      const type = buf.readUInt16BE(after);
      const len = buf.readUInt16BE(after + 8);
      const data = after + 10;
      if (/_googlecast\._tcp\.local$/i.test(name)) isCast = true;
      if (type === 33 && len >= 6) port = buf.readUInt16BE(data + 4); // SRV
      if (type === 16) { // TXT: "fn=Living room TV"
        let p = data;
        while (p < data + len) {
          const l = buf[p];
          const kv = buf.toString('utf8', p + 1, p + 1 + l);
          if (kv.startsWith('fn=')) friendly = kv.slice(3);
          p += 1 + l;
        }
      }
      off = data + len;
    }
    return isCast ? { name: cleanLabel(friendly || 'Chromecast'), port: port > 0 && port < 65536 ? port : 8009 } : null;
  } catch {
    return null;
  }
}

function searchCast(address, ms = DISCOVERY_MS) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => { try { sock.close(); } catch { /* closed */ } resolve([...found.values()]); };
    sock.on('error', done);
    sock.on('message', (msg, rinfo) => {
      if (!isPrivateIPv4(rinfo.address) || found.size >= MAX_DEVICES || found.has(rinfo.address)) return;
      const d = parseMdns(msg);
      if (d) found.set(rinfo.address, { id: `cast:${rinfo.address}`, kind: 'cast', name: d.name, host: rinfo.address, port: d.port });
    });
    // A question from a port other than 5353 is a "legacy unicast" query:
    // devices answer straight back to it (no need to share port 5353 with
    // Windows' own mDNS service).
    sock.bind({ address, port: 0 }, () => {
      try { sock.setMulticastInterface(address); } catch { /* default interface */ }
      const q = mdnsQuery();
      sock.send(q, 5353, '224.0.0.251');
      setTimeout(() => sock.send(q, 5353, '224.0.0.251'), 700);
      setTimeout(done, ms);
    });
  });
}

// CastMessage protobuf: 1 protocol_version (0), 2 source_id, 3 destination_id,
// 4 namespace, 5 payload_type (0 = string), 6 payload_utf8.
function varint(n) {
  const out = [];
  let v = n;
  do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v);
  return Buffer.from(out);
}
function encodeCast({ source, destination, namespace, data }) {
  const str = (field, s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([Buffer.from([(field << 3) | 2]), varint(b.length), b]); };
  const msg = Buffer.concat([Buffer.from([0x08, 0x00]), str(2, source), str(3, destination), str(4, namespace), Buffer.from([0x28, 0x00]), str(6, JSON.stringify(data))]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(msg.length);
  return Buffer.concat([len, msg]);
}
function decodeCast(msg) {
  const out = {};
  let p = 0;
  const readVarint = () => { let r = 0; let s = 0; for (;;) { const b = msg[p++]; r |= (b & 0x7f) << s; if (!(b & 0x80)) return r >>> 0; s += 7; if (s > 28) throw new Error('varint'); } };
  while (p < msg.length) {
    const key = readVarint();
    const field = key >> 3;
    const wire = key & 7;
    if (wire === 0) { readVarint(); continue; }
    if (wire !== 2) throw new Error('wire');
    const len = readVarint();
    const val = msg.toString('utf8', p, p + len);
    p += len;
    if (field === 2) out.source = val;
    else if (field === 3) out.destination = val;
    else if (field === 4) out.namespace = val;
    else if (field === 6) out.payload = val;
  }
  return out;
}

const NS = {
  conn: 'urn:x-cast:com.google.cast.tp.connection',
  heartbeat: 'urn:x-cast:com.google.cast.tp.heartbeat',
  receiver: 'urn:x-cast:com.google.cast.receiver',
  media: 'urn:x-cast:com.google.cast.media',
};
const DEFAULT_MEDIA_RECEIVER = 'CC1AD845';

/** One connection to a Chromecast: launches the default media player and sends it media commands. */
class CastSession extends EventEmitter {
  constructor(device, { connect = (opts) => tls.connect(opts) } = {}) {
    super();
    this.device = device;
    this.connect = connect;
    this.requestId = 1;
    this.waiting = new Map();
    this.transportId = null;
    this.mediaSessionId = null;
    this.buf = Buffer.alloc(0);
  }

  open() {
    return new Promise((resolve, reject) => {
      // The device's certificate is self-signed by Google: we only ever talk
      // to an address on the local network that answered as a Chromecast.
      this.sock = this.connect({ host: this.device.host, port: this.device.port || 8009, rejectUnauthorized: false, timeout: 8000 });
      this.sock.once('error', reject);
      this.sock.once('secureConnect', () => {
        this.sock.removeListener('error', reject);
        this.sock.on('error', () => this.close());
        this.send('receiver-0', NS.conn, { type: 'CONNECT' });
        this.heartbeat = setInterval(() => this.send('receiver-0', NS.heartbeat, { type: 'PING' }), 5000);
        this.heartbeat.unref?.();
        resolve();
      });
      this.sock.on('data', (c) => this.onData(c));
      this.sock.on('close', () => this.close());
    });
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (this.buf.length > 1024 * 1024) { this.close(); return; }
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0);
      if (len > 512 * 1024) { this.close(); return; }
      if (this.buf.length < 4 + len) return;
      let msg;
      try { msg = decodeCast(this.buf.subarray(4, 4 + len)); } catch { msg = null; }
      this.buf = this.buf.subarray(4 + len);
      if (!msg || !msg.payload) continue;
      let data;
      try { data = JSON.parse(msg.payload); } catch { continue; }
      if (msg.namespace === NS.heartbeat && data.type === 'PING') this.send(msg.source, NS.heartbeat, { type: 'PONG' });
      if (data.type === 'MEDIA_STATUS' && Array.isArray(data.status) && data.status[0]) {
        this.mediaSessionId = data.status[0].mediaSessionId;
        this.emit('status', { state: data.status[0].playerState, time: data.status[0].currentTime });
      }
      const w = this.waiting.get(data.requestId);
      if (w) { this.waiting.delete(data.requestId); w(data); }
    }
  }

  send(destination, namespace, data) {
    if (!this.sock || this.sock.destroyed) return;
    this.sock.write(encodeCast({ source: 'sender-0', destination, namespace, data }));
  }

  request(destination, namespace, data, ms = 10000) {
    const requestId = this.requestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting.delete(requestId); reject(new Error('La tele no responde.')); }, ms);
      this.waiting.set(requestId, (d) => { clearTimeout(timer); resolve(d); });
      this.send(destination, namespace, { ...data, requestId });
    });
  }

  async play({ url, title, contentType }) {
    if (!this.transportId) {
      const status = await this.request('receiver-0', NS.receiver, { type: 'LAUNCH', appId: DEFAULT_MEDIA_RECEIVER }, 20000);
      const app = status.status && Array.isArray(status.status.applications) && status.status.applications.find((a) => a.appId === DEFAULT_MEDIA_RECEIVER);
      if (!app || typeof app.transportId !== 'string') throw new Error('La tele no abrió el reproductor.');
      this.transportId = app.transportId;
      this.send(this.transportId, NS.conn, { type: 'CONNECT' });
    }
    const res = await this.request(this.transportId, NS.media, {
      type: 'LOAD', autoplay: true, currentTime: 0,
      media: { contentId: url, contentType, streamType: 'BUFFERED', metadata: { metadataType: 0, title } },
    }, 20000);
    if (res.type === 'LOAD_FAILED' || res.type === 'INVALID_REQUEST') throw new Error('La tele no pudo abrir el archivo.');
  }

  media(type, extra = {}) {
    if (!this.transportId || this.mediaSessionId === null) return Promise.resolve();
    return this.request(this.transportId, NS.media, { type, mediaSessionId: this.mediaSessionId, ...extra }).catch(() => {});
  }

  close() {
    clearInterval(this.heartbeat);
    if (this.sock && !this.sock.destroyed) this.sock.destroy();
    for (const w of this.waiting.values()) w({});
    this.waiting.clear();
    this.emit('closed');
  }
}

// ---- One manager for both kinds --------------------------------------------
class CastManager {
  constructor({ lanAddressFn, share, unshare, connect }) {
    this.lanAddressFn = lanAddressFn;
    this.shareFn = share;        // (file, name) → { url, token, contentType } on the LAN share server
    this.unshareFn = unshare;
    this.connect = connect;
    this.devices = new Map();
    this.current = null;         // { device, session, token, title }
  }

  async discover() {
    const address = this.lanAddressFn();
    if (!address) throw new Error('No estás conectado a una red WiFi o local.');
    const [a, b] = await Promise.all([searchCast(address).catch(() => []), searchDlna(address).catch(() => [])]);
    this.devices = new Map([...a, ...b].map((d) => [d.id, d]));
    return [...this.devices.values()].map(({ id, kind, name }) => ({ id, kind, name }));
  }

  async play(deviceId, file, title) {
    const device = this.devices.get(String(deviceId));
    if (!device) throw new Error('No se encuentra esa tele; búscala otra vez.');
    if (!this.current || this.current.device.id !== device.id) await this.stop();
    const share = await this.shareFn(file, title);
    const media = { url: share.url, title: String(title || '').slice(0, 200), contentType: share.contentType };
    if (this.current && this.current.token) this.unshareFn(this.current.token);
    if (device.kind === 'dlna') {
      await dlna.play(device, media);
      this.current = { device, token: share.token, title: media.title };
    } else {
      let session = this.current && this.current.session;
      if (!session) {
        session = new CastSession(device, this.connect ? { connect: this.connect } : undefined);
        await session.open();
        session.on('closed', () => { if (this.current && this.current.session === session) this.current = null; });
      }
      this.current = { device, session, token: share.token, title: media.title };
      await session.play(media);
    }
    return this.state();
  }

  async control(action, value) {
    const c = this.current;
    if (!c) throw new Error('No hay nada enviado a la tele.');
    if (action === 'stop') return this.stop();
    if (c.device.kind === 'dlna') {
      if (action === 'pause') await dlna.pause(c.device);
      else if (action === 'resume') await dlna.resume(c.device);
      else if (action === 'seek' && Number.isFinite(value)) await dlna.seek(c.device, value);
    } else if (action === 'pause') await c.session.media('PAUSE');
    else if (action === 'resume') await c.session.media('PLAY');
    else if (action === 'seek' && Number.isFinite(value)) await c.session.media('SEEK', { currentTime: value });
    return this.state();
  }

  async stop() {
    const c = this.current;
    this.current = null;
    if (!c) return this.state();
    if (c.device.kind === 'dlna') await dlna.stop(c.device).catch(() => {});
    else { await c.session.media('STOP'); c.session.close(); }
    if (c.token) this.unshareFn(c.token);
    return this.state();
  }

  state() {
    return this.current ? { casting: true, device: this.current.device.name, kind: this.current.device.kind, title: this.current.title } : { casting: false };
  }
}

module.exports = {
  CastManager, CastSession, isPrivateIPv4, parseDescription, ssdpLocation, parseMdns, mdnsQuery, encodeCast, decodeCast, didl, readName,
};
