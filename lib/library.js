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

const AUDIO = new Set(['mp3', 'm4a', 'aac', 'opus', 'ogg', 'oga', 'flac', 'wav', 'aiff', 'wma', 'weba']);
const VIDEO = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'wmv', 'flv', 'mpg', '3gp', 'ogv', 'ts']);
const MAX_DEPTH = 5;
const MAX_FILES = 5000;

const MAX_META = 20000;

class Library {
  constructor({ rootFn, metaFile = null }) {
    this.rootFn = rootFn;                         // () => current download folder (absolute) or null
    this.secret = crypto.randomBytes(32);         // ids can't be guessed, and change every run
    this.byId = new Map();                        // id -> relative path (from the last scan)
    this.metaFile = metaFile;                     // favourites and stars, by relative path
    this.meta = this.loadMeta();
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
        if (fav || rating) out.set(rel, { fav, rating });
      }
    } catch { /* none yet */ }
    return out;
  }

  /** Marks a file of the last scan: fav (boolean) and/or rating (0–5). Returns its meta, or null. */
  setMeta(id, patch) {
    const rel = /^[a-f0-9]{32}$/.test(String(id)) ? this.byId.get(id) : null;
    if (!rel || !patch || typeof patch !== 'object') return null;
    const cur = { fav: false, rating: 0, ...(this.meta.get(rel.toLowerCase()) || {}) };
    if (typeof patch.fav === 'boolean') cur.fav = patch.fav;
    if (Number.isInteger(patch.rating) && patch.rating >= 0 && patch.rating <= 5) cur.rating = patch.rating;
    if (cur.fav || cur.rating) this.meta.set(rel.toLowerCase(), cur); else this.meta.delete(rel.toLowerCase());
    while (this.meta.size > MAX_META) this.meta.delete(this.meta.keys().next().value);
    if (this.metaFile) {
      try { fs.writeFileSync(this.metaFile, JSON.stringify(Object.fromEntries(this.meta))); } catch { /* not fatal */ }
    }
    return cur;
  }

  idFor(rel) {
    return crypto.createHmac('sha256', this.secret).update(rel.toLowerCase()).digest('hex').slice(0, 32);
  }

  /** Media files under the folder: newest first, without following links or entering hidden folders. */
  scan() {
    const root = this.rootFn();
    const out = [];
    this.byId = new Map();
    if (!root) return { root: null, files: out, truncated: false };
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
        const kind = AUDIO.has(ext) ? 'audio' : VIDEO.has(ext) ? 'video' : null;
        if (!kind) continue;
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        const id = this.idFor(childRel);
        this.byId.set(id, childRel);
        const m = this.meta.get(childRel.toLowerCase());
        out.push({ id, name: e.name, folder: rel, size: st.size, mtime: st.mtimeMs, kind, fav: Boolean(m && m.fav), rating: (m && m.rating) || 0 });
      }
    };
    walk(root, '', 0);
    out.sort((a, b) => b.mtime - a.mtime);
    return { root, files: out, truncated };
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

  async share(filePath, name) {
    this.prune();
    const address = this.lanAddressFn();
    if (!address) throw new Error('No estás conectado a una red WiFi o local.');
    if (this.shares.size >= MAX_SHARES) throw new Error('Hay demasiados archivos compartidos; deja de compartir alguno.');
    // The network changed (another WiFi…): links on the old address can't work anyway.
    if (this.server && this.address !== address) { this.shares.clear(); this.stop(); }
    await this.start(address);
    const token = crypto.randomBytes(16).toString('hex');
    const size = fs.statSync(filePath).size;
    const expires = this.now() + SHARE_TTL_MS;
    this.shares.set(token, { path: filePath, name, size, expires });
    return { token, url: `http://${address}:${this.port}/s/${token}`, expires };
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
    const m = /^\/s\/([a-f0-9]{32})(\/file)?$/.exec(new URL(req.url, 'http://x').pathname);
    const share = m && this.shares.get(m[1]);
    if (!share || share.expires <= this.now()) return deny(404, 'Este enlace ha caducado o no existe.');
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
}

module.exports = { Library, ShareServer, lanAddress, AUDIO, VIDEO, MAX_FILES, SHARE_TTL_MS };
