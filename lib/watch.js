// Watch folder (desktop app): every audio or video file dropped into a folder
// the user chose is converted with a preset, and the result goes to the
// download folder like any other job. Only the folder's top level, only
// media files, never links; each file once (remembered by name, size and
// date), and only after it stopped growing (still being copied).
const fs = require('fs');
const path = require('path');
const { isLocalFolderPath } = require('./filenames');

const MEDIA = /\.(mp3|aac|m4a|ogg|oga|opus|wma|ac3|flac|wav|aiff|aif|amr|mka|mp4|m4v|webm|mkv|mov|avi|wmv|flv|mpg|mpeg|3gp|ogv|ts|mts)$/i;
const SCAN_MS = 5000;
const STABLE_MS = 4000;
const MAX_DONE = 5000;
const MAX_FILE = 4096 * 1024 * 1024;
const MAX_PER_SCAN = 20;

class WatchFolder {
  /**
   * `configFile`: { enabled, dir, clientId, fields: { targetFormat, … }, moveOriginals }.
   * `enqueue(clientId, { path, name }, fields)` queues one conversion; returns false if the queue is full.
   */
  constructor({ configFile, enqueue, now = () => Date.now() }) {
    this.configFile = configFile;
    this.enqueue = enqueue;
    this.now = now;
    this.config = this.load();
    this.seen = new Map(); // name -> { size, mtime, since }
    this.timer = null;
    this.lastError = null;
    if (this.config.enabled) this.start();
  }

  load() {
    const out = { enabled: false, dir: null, clientId: null, fields: null, moveOriginals: false, done: [] };
    try {
      const c = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      out.enabled = c.enabled === true;
      out.dir = isLocalFolderPath(c.dir) ? c.dir : null;
      out.clientId = /^[a-f0-9]{32}$/.test(String(c.clientId)) ? c.clientId : null;
      out.fields = c.fields && typeof c.fields === 'object' && !Array.isArray(c.fields) ? c.fields : null;
      out.moveOriginals = c.moveOriginals === true;
      out.done = Array.isArray(c.done) ? c.done.filter((k) => typeof k === 'string' && k.length < 600).slice(-MAX_DONE) : [];
    } catch { /* first time */ }
    if (!out.dir || !out.clientId || !out.fields) out.enabled = false;
    return out;
  }

  save() {
    try { fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2)); } catch { /* not fatal */ }
  }

  view() {
    const { enabled, dir, fields, moveOriginals } = this.config;
    return { enabled, dir, fields, moveOriginals, error: this.lastError };
  }

  /** Settings from the page; `dir` only from the app's own folder picker (the main process). */
  set({ enabled, dir, clientId, fields, moveOriginals }) {
    if (dir !== undefined) {
      if (dir !== null && !isLocalFolderPath(dir)) throw new Error('Elige una carpeta de este equipo.');
      this.config.dir = dir;
      this.config.done = [];
    }
    if (clientId !== undefined && /^[a-f0-9]{32}$/.test(String(clientId))) this.config.clientId = clientId;
    if (fields !== undefined) this.config.fields = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : null;
    if (typeof moveOriginals === 'boolean') this.config.moveOriginals = moveOriginals;
    if (typeof enabled === 'boolean') this.config.enabled = enabled;
    if (this.config.enabled && (!this.config.dir || !this.config.fields || !this.config.clientId)) this.config.enabled = false;
    this.save();
    this.lastError = null;
    if (this.config.enabled) this.start(); else this.stop();
    return this.view();
  }

  start() {
    this.stop();
    // What's already there when it's turned on counts as done (only new files).
    this.markExisting();
    this.timer = setInterval(() => this.scan(), SCAN_MS);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.seen.clear();
  }

  key(name, st) {
    return `${name.toLowerCase()}|${st.size}|${Math.round(st.mtimeMs)}`;
  }

  entries() {
    const dir = this.config.dir;
    let list = [];
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch {
      this.lastError = 'No se puede leer la carpeta vigilada.';
      return [];
    }
    this.lastError = null;
    return list.filter((e) => e.isFile() && !e.isSymbolicLink() && !e.name.startsWith('.') && MEDIA.test(e.name)).map((e) => e.name);
  }

  markExisting() {
    if (!this.config.dir) return;
    const done = new Set(this.config.done);
    for (const name of this.entries()) {
      try { done.add(this.key(name, fs.statSync(path.join(this.config.dir, name)))); } catch { /* gone */ }
    }
    this.config.done = [...done].slice(-MAX_DONE);
    this.save();
  }

  /** One pass: queues files that are new and have stopped changing. Returns how many. */
  scan() {
    const { dir, clientId, fields } = this.config;
    if (!this.config.enabled || !dir) return 0;
    const done = new Set(this.config.done);
    let queued = 0;
    const present = new Set();
    for (const name of this.entries()) {
      present.add(name);
      if (queued >= MAX_PER_SCAN) break;
      const full = path.join(dir, name);
      let st;
      try { st = fs.lstatSync(full); } catch { continue; }
      if (!st.isFile() || st.size === 0 || st.size > MAX_FILE) continue;
      const key = this.key(name, st);
      if (done.has(key)) continue;
      // Still being copied? Wait until size and date hold still.
      const prev = this.seen.get(name);
      if (!prev || prev.size !== st.size || prev.mtime !== st.mtimeMs) {
        this.seen.set(name, { size: st.size, mtime: st.mtimeMs, since: this.now() });
        continue;
      }
      if (this.now() - prev.since < STABLE_MS) continue;
      if (!this.enqueue(clientId, { path: full, name }, fields)) break; // queue full: next time
      this.seen.delete(name);
      done.add(key);
      this.config.done.push(key);
      queued += 1;
    }
    for (const name of this.seen.keys()) if (!present.has(name)) this.seen.delete(name);
    if (queued) { this.config.done = this.config.done.slice(-MAX_DONE); this.save(); }
    return queued;
  }

  /** After a conversion: moves the original into "<folder>/Convertidos" when asked. */
  finished(file) {
    if (!this.config.moveOriginals || !this.config.dir) return;
    const root = path.resolve(this.config.dir);
    if (path.dirname(path.resolve(file)) !== root) return;
    const dest = path.join(root, 'Convertidos');
    try {
      fs.mkdirSync(dest, { recursive: true });
      let target = path.join(dest, path.basename(file));
      const ext = path.extname(target);
      for (let i = 1; fs.existsSync(target); i++) target = path.join(dest, `${path.basename(file, ext)} (${i})${ext}`);
      fs.renameSync(file, target);
    } catch { /* in use: it stays */ }
  }
}

module.exports = { WatchFolder, MEDIA };
