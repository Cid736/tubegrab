// The desktop app's library: the media files in the user's download folder,
// listed and played back by the page, and shared to a phone over the local
// network with a QR code. Only ever files inside that folder, found by the
// scan itself — the page names an id, never a path.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { pipeline } = require('stream');
const os = require('os');
const path = require('path');
const { safeFolderName } = require('./filenames');

const AUDIO = new Set(['mp3', 'm4a', 'aac', 'opus', 'ogg', 'oga', 'flac', 'wav', 'aiff', 'wma', 'weba']);
const VIDEO = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'wmv', 'flv', 'mpg', '3gp', 'ogv', 'ts']);
const MAX_DEPTH = 5;
const MAX_FILES = 5000;

const MAX_META = 20000;
const MAX_PLAYLISTS = 200;
const MAX_PLAYLIST_ITEMS = 2000;
const MAX_LRC_BYTES = 512 * 1024;

const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);

class Library {
  constructor({ rootFn, metaFile = null, playlistsFile = null }) {
    this.rootFn = rootFn;                         // () => current download folder (absolute) or null
    this.secret = crypto.randomBytes(32);         // ids can't be guessed, and change every run
    this.byId = new Map();                        // id -> relative path (from the last scan)
    this.lastFiles = [];                          // the last scan's entries
    this.metaFile = metaFile;                     // favourites, stars and plays, by relative path
    this.meta = this.loadMeta();
    this.playlistsFile = playlistsFile;           // the user's own lists, by relative path
    this.playlists = this.loadPlaylists();
  }

  loadMeta() {
    const out = new Map();
    if (!this.metaFile) return out;
    try {
      const raw = JSON.parse(fs.readFileSync(this.metaFile, 'utf8'));
      for (const [rel, m] of Object.entries(raw).slice(0, MAX_META)) {
        if (typeof rel !== 'string' || rel.length > 1000 || !m || typeof m !== 'object') continue;
        const fav = m.fav === true;
        const rating = Number.isInteger(m.rating) && m.rating >= 1 && m.rating <= 5 ? m.rating : 0;
        const plays = Number.isInteger(m.plays) && m.plays > 0 ? Math.min(m.plays, 1e6) : 0;
        const lastPlayed = Number.isFinite(m.lastPlayed) && m.lastPlayed > 0 ? m.lastPlayed : 0;
        if (fav || rating || plays) out.set(rel, { fav, rating, plays, lastPlayed });
      }
    } catch { /* none yet */ }
    return out;
  }

  saveMeta() {
    while (this.meta.size > MAX_META) this.meta.delete(this.meta.keys().next().value);
    if (this.metaFile) {
      try { fs.writeFileSync(this.metaFile, JSON.stringify(Object.fromEntries(this.meta))); } catch { /* not fatal */ }
    }
  }

  /**
   * Marks a file of the last scan: fav (boolean), rating (0–5) and/or
   * played (true: one more play). Returns its meta, or null.
   */
  setMeta(id, patch) {
    const rel = /^[a-f0-9]{32}$/.test(String(id)) ? this.byId.get(id) : null;
    if (!rel || !patch || typeof patch !== 'object') return null;
    const cur = { fav: false, rating: 0, plays: 0, lastPlayed: 0, ...(this.meta.get(rel.toLowerCase()) || {}) };
    if (typeof patch.fav === 'boolean') cur.fav = patch.fav;
    if (Number.isInteger(patch.rating) && patch.rating >= 0 && patch.rating <= 5) cur.rating = patch.rating;
    if (patch.played === true) { cur.plays = Math.min(1e6, (cur.plays || 0) + 1); cur.lastPlayed = Date.now(); }
    if (cur.fav || cur.rating || cur.plays) this.meta.set(rel.toLowerCase(), cur); else this.meta.delete(rel.toLowerCase());
    this.saveMeta();
    return cur;
  }

  idFor(rel) {
    return crypto.createHmac('sha256', this.secret).update(rel.toLowerCase()).digest('hex').slice(0, 32);
  }

  /** Media files under the folder: newest first, without following links or entering hidden folders. */
  scan() {
    const root = this.rootFn();
    const out = [];
    const lrcs = new Set();
    this.byId = new Map();
    if (!root) { this.lastFiles = out; return { root: null, files: out, truncated: false }; }
    let truncated = false;
    const walk = (dir, rel, depth) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= MAX_FILES) { truncated = true; return; }
        if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (depth < MAX_DEPTH) walk(full, childRel, depth + 1);
          continue;
        }
        if (!e.isFile()) continue;
        const ext = path.extname(e.name).slice(1).toLowerCase();
        if (ext === 'lrc') { lrcs.add(childRel.slice(0, -4).toLowerCase()); continue; }
        const kind = AUDIO.has(ext) ? 'audio' : VIDEO.has(ext) ? 'video' : null;
        if (!kind) continue;
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        const id = this.idFor(childRel);
        this.byId.set(id, childRel);
        const m = this.meta.get(childRel.toLowerCase());
        out.push({
          id, name: e.name, folder: rel, size: st.size, mtime: st.mtimeMs, kind, rel: childRel,
          fav: Boolean(m && m.fav), rating: (m && m.rating) || 0, plays: (m && m.plays) || 0, lastPlayed: (m && m.lastPlayed) || 0,
        });
      }
    };
    walk(root, '', 0);
    for (const f of out) f.lrc = lrcs.has(f.rel.slice(0, f.rel.length - path.extname(f.rel).length).toLowerCase());
    out.sort((a, b) => b.mtime - a.mtime);
    this.lastFiles = out;
    // The relative path stays here: the page only ever gets ids.
    return { root, files: out.map(({ rel, ...f }) => f), truncated };
  }

  /**
   * id → absolute path of a file from the last scan, only if it is still a
   * regular file whose real location is inside the folder; otherwise null.
   */
  resolve(id) {
    if (!/^[a-f0-9]{32}$/.test(String(id))) return null;
    const rel = this.byId.get(id);
    const root = this.rootFn();
    if (!rel || !root) return null;
    try {
      const realRoot = fs.realpathSync(root);
      const real = fs.realpathSync(path.join(root, ...rel.split('/')));
      if (!real.startsWith(realRoot + path.sep) || !fs.statSync(real).isFile()) return null;
      return real;
    } catch {
      return null;
    }
  }

  relOf(id) {
    return /^[a-f0-9]{32}$/.test(String(id)) ? this.byId.get(id) || null : null;
  }

  /** The synced lyrics next to a song ("song.lrc"): [{ t, text }], or null. */
  syncedLyrics(id) {
    const file = this.resolve(id);
    if (!file) return null;
    const lrc = file.slice(0, file.length - path.extname(file).length) + '.lrc';
    try {
      const st = fs.lstatSync(lrc);
      if (!st.isFile() || st.size > MAX_LRC_BYTES) return null;
      return parseLrc(fs.readFileSync(lrc, 'utf8'));
    } catch { return null; }
  }

  // ---- Own playlists (by relative path, so they survive restarts) ----
  loadPlaylists() {
    if (!this.playlistsFile) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(this.playlistsFile, 'utf8'));
      return (Array.isArray(raw) ? raw : []).slice(0, MAX_PLAYLISTS).map((p) => ({
        id: /^[a-f0-9]{16}$/.test(String(p && p.id)) ? p.id : crypto.randomBytes(8).toString('hex'),
        name: cleanName(p && p.name) || 'Lista',
        items: (Array.isArray(p && p.items) ? p.items : []).filter((r) => typeof r === 'string' && r.length <= 1000 && !r.includes('\0')).slice(0, MAX_PLAYLIST_ITEMS),
      }));
    } catch { return []; }
  }

  savePlaylists() {
    if (!this.playlistsFile) return;
    try { fs.writeFileSync(this.playlistsFile, JSON.stringify(this.playlists, null, 2)); } catch { /* not fatal */ }
  }

  /** The lists, each item as the id of the last scan (null when the file is gone). */
  listPlaylists() {
    return this.playlists.map((p) => ({ id: p.id, name: p.name, items: p.items.map((rel) => (this.byId.has(this.idFor(rel)) ? this.idFor(rel) : null)) }));
  }

  playlist(id) {
    return this.playlists.find((p) => p.id === id) || null;
  }

  createPlaylist(name) {
    if (this.playlists.length >= MAX_PLAYLISTS) throw new Error('Has llegado al máximo de listas.');
    const p = { id: crypto.randomBytes(8).toString('hex'), name: cleanName(name) || 'Lista nueva', items: [] };
    this.playlists.push(p);
    this.savePlaylists();
    return p;
  }

  /** { name?, add?: [ids], remove?: index, move?: [from, to], items?: [ids] } */
  updatePlaylist(id, patch) {
    const p = this.playlist(id);
    if (!p || !patch || typeof patch !== 'object') return null;
    if (typeof patch.name === 'string' && cleanName(patch.name)) p.name = cleanName(patch.name);
    if (Array.isArray(patch.add)) {
      for (const fid of patch.add.slice(0, 500)) {
        const rel = this.relOf(fid);
        if (rel && p.items.length < MAX_PLAYLIST_ITEMS) p.items.push(rel);
      }
    }
    if (Number.isInteger(patch.remove) && patch.remove >= 0 && patch.remove < p.items.length) p.items.splice(patch.remove, 1);
    if (Array.isArray(patch.move) && patch.move.length === 2) {
      const [a, b] = patch.move;
      if ([a, b].every((n) => Number.isInteger(n) && n >= 0 && n < p.items.length)) p.items.splice(b, 0, p.items.splice(a, 1)[0]);
    }
    this.savePlaylists();
    return p;
  }

  removePlaylist(id) {
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this.savePlaylists();
  }

  /**
   * Writes the list as "<name>.m3u8" in the download folder (paths relative
   * to it), replacing only an earlier export of ours. Returns its file name.
   */
  exportPlaylist(id) {
    const p = this.playlist(id);
    const root = this.rootFn();
    if (!p || !root) return null;
    const lines = ['#EXTM3U', '#PLAYLIST:' + p.name.replace(/[\r\n]/g, ' '), '#EXTENC:UTF-8', '# TubeGrab'];
    // One line per entry, whatever a file is called (no line break can add entries).
    const oneLine = (s) => String(s).replace(/[\r\n\u0000-\u001f]/g, ' ');
    for (const rel of p.items) lines.push(oneLine(`#EXTINF:-1,${path.basename(rel).replace(/\.[^.]+$/, '')}`), oneLine(rel.split('/').join(path.sep)));
    let name = `${safeFolderName(p.name)}.m3u8`;
    const ours = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').slice(0, 4).includes('# TubeGrab'); } catch { return false; } };
    for (let i = 2; fs.existsSync(path.join(root, name)) && !ours(path.join(root, name)); i++) name = `${safeFolderName(p.name)} (${i}).m3u8`;
    fs.writeFileSync(path.join(root, name), `${lines.join('\n')}\n`, 'utf8');
    return name;
  }

  /**
   * Copies of the same file (same size and the same first and last 256 KB),
   * and files with the same name in different folders: [{ kind, ids }].
   */
  duplicates() {
    const files = this.lastFiles;
    const groups = [];
    const bySize = new Map();
    for (const f of files) {
      if (f.size < 1024) continue;
      if (!bySize.has(f.size)) bySize.set(f.size, []);
      bySize.get(f.size).push(f);
    }
    const inSame = new Set();
    for (const list of bySize.values()) {
      if (list.length < 2) continue;
      const byHash = new Map();
      for (const f of list.slice(0, 50)) {
        const h = quickHash(this.resolve(f.id), f.size);
        if (!h) continue;
        if (!byHash.has(h)) byHash.set(h, []);
        byHash.get(h).push(f);
      }
      for (const same of byHash.values()) {
        if (same.length > 1) { groups.push({ kind: 'same', ids: same.map((f) => f.id) }); same.forEach((f) => inSame.add(f.id)); }
      }
    }
    // "Song (1).mp3" next to "Song.mp3", or the same song in two folders.
    const norm = (n) => n.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/\s*\[[\w-]{6,}\]$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const byName = new Map();
    for (const f of files) {
      const k = `${f.kind}:${norm(f.name)}`;
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(f);
    }
    for (const list of byName.values()) {
      const rest = list.filter((f) => !inSame.has(f.id));
      if (list.length > 1 && rest.length) groups.push({ kind: 'name', ids: list.map((f) => f.id) });
    }
    return groups.slice(0, 500);
  }
}

/** "[mm:ss.xx] text" lines → [{ t, text }] sorted by time (other lines ignored). */
function parseLrc(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/).slice(0, 5000)) {
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const words = line.replace(/\[[^\]]*\]/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 300);
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text: words });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Size + the first and last 256 KB, hashed (enough to tell real copies apart). */
function quickHash(file, size) {
  if (!file) return null;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const span = Math.min(256 * 1024, size);
    const head = Buffer.alloc(span);
    const tail = Buffer.alloc(span);
    fs.readSync(fd, head, 0, span, 0);
    fs.readSync(fd, tail, 0, span, Math.max(0, size - span));
    return crypto.createHash('sha256').update(String(size)).update(head).update(tail).digest('hex');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// ---- Sharing to a phone on the same network ---------------------------------
const SHARE_TTL_MS = 30 * 60 * 1000;
const MAX_SHARES = 20;
const MAX_CONNECTIONS = 32;

/** This computer's address on the local network (private IPv4 ranges only), or null. */
function lanAddress(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      const [x, y] = a.address.split('.').map(Number);
      const isPrivate = x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
      if (!isPrivate) continue;
      // Virtual adapters (Hyper-V, WSL, VirtualBox, VPNs) last: the phone isn't on those.
      const virtual = /vethernet|virtual|vmware|vbox|wsl|hyper-v|docker|tailscale|zerotier|vpn|loopback/i.test(name);
      candidates.push({ address: a.address, score: (virtual ? 0 : 2) + (x === 192 ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].address : null;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * A tiny HTTP server on the local network that serves only shared files, by
 * token: GET /s/<token> (a page with a download button) and /s/<token>/file.
 * Nothing else of the app is reachable from it. It stops when nothing is shared.
 */
class ShareServer {
  constructor({ lanAddressFn = lanAddress, now = () => Date.now() } = {}) {
    this.shares = new Map(); // token -> { path, name, size, expires }
    this.server = null;
    this.port = null;
    this.address = null;   // the one local-network address we listen on
    this.lanAddressFn = lanAddressFn;
    this.now = now;
    this.sweeper = null;
  }

  prune() {
    for (const [token, s] of this.shares) if (s.expires <= this.now()) this.shares.delete(token);
    if (!this.shares.size) this.stop();
  }

  /**
   * `stream`: for a TV (Chromecast / DLNA) rather than a phone: the file is
   * served as media (its own type, seekable with Range) at /m/<token>, for
   * as long as a film may last.
   */
  async share(filePath, name, { stream = false } = {}) {
    this.prune();
    const address = this.lanAddressFn();
    if (!address) throw new Error('No estás conectado a una red WiFi o local.');
    if (this.shares.size >= MAX_SHARES) throw new Error('Hay demasiados archivos compartidos; deja de compartir alguno.');
    // The network changed (another WiFi…): links on the old address can't work anyway.
    if (this.server && this.address !== address) { this.shares.clear(); this.stop(); }
    await this.start(address);
    const token = crypto.randomBytes(16).toString('hex');
    const size = fs.statSync(filePath).size;
    const expires = this.now() + (stream ? STREAM_TTL_MS : SHARE_TTL_MS);
    this.shares.set(token, { path: filePath, name, size, expires, stream });
    return { token, url: `http://${address}:${this.port}/${stream ? 'm' : 's'}/${token}`, expires, contentType: mediaType(name) };
  }

  unshare(token) {
    this.shares.delete(String(token));
    if (!this.shares.size) this.stop();
  }

  start(address) {
    if (this.server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.headersTimeout = 15000;
      server.requestTimeout = 0; // big files take a while on WiFi
      server.keepAliveTimeout = 5000;
      server.maxConnections = MAX_CONNECTIONS;
      server.once('error', reject);
      // Only the local-network address the QR points at: not every interface
      // (VPNs, a public adapter…).
      server.listen(0, address, () => {
        this.server = server;
        this.address = address;
        this.port = server.address().port;
        this.sweeper = setInterval(() => this.prune(), 60 * 1000);
        this.sweeper.unref();
        resolve();
      });
    });
  }

  stop() {
    clearInterval(this.sweeper);
    this.sweeper = null;
    if (this.server) {
      this.server.close();
      this.server.closeAllConnections?.();
    }
    this.server = null;
    this.port = null;
    this.address = null;
  }

  handle(req, res) {
    const security = {
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store',
    };
    const deny = (code, text) => { res.writeHead(code, { ...security, 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return deny(405, 'Método no permitido');
    const pathname = new URL(req.url, 'http://x').pathname;
    const media = /^\/m\/([a-f0-9]{32})$/.exec(pathname);
    if (media) return this.serveMedia(req, res, media[1], security, deny);
    const m = /^\/s\/([a-f0-9]{32})(\/file)?$/.exec(pathname);
    const share = m && this.shares.get(m[1]);
    if (!share || share.stream || share.expires <= this.now()) return deny(404, 'Este enlace ha caducado o no existe.');
    if (!m[2]) {
      const mb = (share.size / 1048576).toFixed(1).replace('.', ',');
      const page = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TubeGrab</title><style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center}
a{display:inline-block;margin-top:18px;padding:14px 26px;border-radius:12px;background:#0a84ff;color:#fff;text-decoration:none;font-weight:600;font-size:17px}p{color:#aaa;font-size:14px}h1{font-size:18px;word-break:break-word}</style></head>
<body><main><h1>${escapeHtml(share.name)}</h1><p>${mb} MB · desde TubeGrab</p><a href="/s/${m[1]}/file" download>Descargar</a></main></body></html>`;
      res.writeHead(200, { ...security, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
      return res.end(req.method === 'HEAD' ? undefined : page);
    }
    let size;
    try { size = fs.statSync(share.path).size; } catch { return deny(404, 'El archivo ya no está.'); }
    const headers = {
      ...security,
      'Content-Type': 'application/octet-stream',
      'Content-Length': size,
      'Content-Disposition': `attachment; filename="${share.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(share.name)}`,
    };
    // HEAD: headers only, the file is never opened.
    if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
    const stream = fs.createReadStream(share.path);
    stream.once('open', () => res.writeHead(200, headers));
    // pipeline closes the file whatever happens (the phone hangs up, an error…).
    return pipeline(stream, res, (err) => { if (err && !res.headersSent) deny(404, 'El archivo ya no está.'); });
  }

  /** A shared file for a TV: its media type, inline, and one byte range at a time. */
  serveMedia(req, res, token, security, deny) {
    const share = this.shares.get(token);
    if (!share || !share.stream || share.expires <= this.now()) return deny(404, 'Este enlace ha caducado o no existe.');
    let size;
    try { size = fs.statSync(share.path).size; } catch { return deny(404, 'El archivo ya no está.'); }
    const headers = { ...security, 'Content-Type': mediaType(share.name), 'Accept-Ranges': 'bytes', 'transferMode.dlna.org': 'Streaming', 'contentFeatures.dlna.org': 'DLNA.ORG_OP=01;DLNA.ORG_CI=0' };
    let start = 0;
    let end = size - 1;
    let status = 200;
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (req.headers.range && !range) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); return res.end(); }
    if (range) {
      if (range[1] === '' && range[2] !== '') { start = Math.max(0, size - Number(range[2])); } else {
        start = Number(range[1] || 0);
        if (range[2] !== '') end = Math.min(size - 1, Number(range[2]));
      }
      if (!Number.isFinite(start) || start > end || start >= size) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); return res.end(); }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = end - start + 1;
    if (req.method === 'HEAD') { res.writeHead(status, headers); return res.end(); }
    const stream = fs.createReadStream(share.path, { start, end });
    stream.once('open', () => res.writeHead(status, headers));
    return pipeline(stream, res, (err) => { if (err && !res.headersSent) deny(404, 'El archivo ya no está.'); });
  }
}

const MEDIA_TYPES = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav',
  weba: 'audio/webm', mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', ts: 'video/mp2t',
};
const mediaType = (name) => MEDIA_TYPES[path.extname(String(name)).slice(1).toLowerCase()] || 'application/octet-stream';
const STREAM_TTL_MS = 4 * 60 * 60 * 1000;

module.exports = { Library, ShareServer, lanAddress, parseLrc, mediaType, AUDIO, VIDEO, MAX_FILES, SHARE_TTL_MS, STREAM_TTL_MS };
