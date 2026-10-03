// "You already have it": what each client has downloaded, by the video's own
// id (site + id), so a link is recognised again whatever its form (youtu.be,
// watch?v=, shorts, a playlist entry…). The desktop app keeps it on disk; a
// web instance only in memory, and only per visitor.
const fs = require('fs');
const path = require('path');

const MAX_PER_CLIENT = 20000;
const MAX_CLIENTS = 500;
const YT_ID = /^[\w-]{11}$/;

/** A YouTube link → 'youtube:<id>' (the only site whose ids are in the link itself); otherwise null. */
function keyFromUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    const m = /^\/(shorts|live|embed|v)\/([\w-]{11})/.exec(u.pathname);
    if (!id && m) id = m[2];
  }
  return id && YT_ID.test(id) ? `youtube:${id}` : null;
}

/** yt-dlp's extractor key + id → our key (YouTube's own links give the same one). */
function keyFromMeta(extractor, id) {
  const ex = String(extractor || '').toLowerCase();
  const vid = String(id || '');
  if (!/^\w{1,40}$/.test(ex) || !/^[\w-]{1,100}$/.test(vid)) return null;
  return `${ex}:${vid}`;
}

class SeenIndex {
  constructor({ file = null } = {}) {
    this.file = file;
    this.byClient = new Map(); // clientId -> Map(key -> { title, at, modes })
    if (file) this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [client, entries] of Object.entries(raw || {}).slice(0, MAX_CLIENTS)) {
        if (!/^[a-f0-9]{32}$/.test(client) || !entries || typeof entries !== 'object') continue;
        const map = new Map();
        for (const [key, e] of Object.entries(entries).slice(-MAX_PER_CLIENT)) {
          if (!/^\w{1,40}:[\w-]{1,100}$/.test(key) || !e || typeof e !== 'object') continue;
          map.set(key, {
            title: typeof e.title === 'string' ? e.title.slice(0, 300) : '',
            at: Number.isFinite(e.at) ? e.at : 0,
            modes: Array.isArray(e.modes) ? e.modes.filter((m) => m === 'audio' || m === 'video') : [],
          });
        }
        this.byClient.set(client, map);
      }
    } catch { /* none yet */ }
  }

  save() {
    if (!this.file) return;
    clearTimeout(this.timer);
    // Several downloads finishing together write once.
    this.timer = setTimeout(() => {
      const out = {};
      for (const [client, map] of this.byClient) out[client] = Object.fromEntries(map);
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(out));
      } catch { /* not fatal */ }
    }, 500);
    this.timer.unref?.();
  }

  /** Remembers a finished download. */
  add(clientId, key, { title = '', mode = 'audio' } = {}) {
    if (!/^[a-f0-9]{32}$/.test(String(clientId)) || !key) return;
    let map = this.byClient.get(clientId);
    if (!map) {
      if (this.byClient.size >= MAX_CLIENTS) this.byClient.delete(this.byClient.keys().next().value);
      map = new Map();
      this.byClient.set(clientId, map);
    }
    const prev = map.get(key);
    map.delete(key);
    const modes = new Set(prev ? prev.modes : []);
    if (mode === 'audio' || mode === 'video') modes.add(mode);
    map.set(key, { title: String(title || '').slice(0, 300), at: Date.now(), modes: [...modes] });
    while (map.size > MAX_PER_CLIENT) map.delete(map.keys().next().value);
    this.save();
  }

  get(clientId, key) {
    const map = this.byClient.get(clientId);
    return (key && map && map.get(key)) || null;
  }

  /** Links → { link: record } for the ones this client already downloaded. */
  check(clientId, urls) {
    const out = {};
    for (const url of urls) {
      const hit = this.get(clientId, keyFromUrl(url));
      if (hit) out[url] = hit;
    }
    return out;
  }

  clear(clientId) {
    this.byClient.delete(clientId);
    this.save();
  }
}

module.exports = { SeenIndex, keyFromUrl, keyFromMeta };
