// Lists to listen to without downloading (desktop app): your Spotify or
// Apple Music playlists brought in by their link, lists made from search
// results, or what was playing. Only titles, artists and YouTube ids are kept
// (stream-lists.json); each song is looked up on YouTube when it plays, and
// the video found is remembered for next time.
const crypto = require('crypto');
const fs = require('fs');

const MAX_LISTS = 100;
const MAX_TRACKS = 500;
const ID_RE = /^[a-f0-9]{16}$/;
const YT_RE = /^[A-Za-z0-9_-]{11}$/;
const SOURCES = ['spotify', 'apple', 'youtube', 'own'];
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function cleanTrack(t) {
  if (!t || typeof t !== 'object') return null;
  const title = clean(t.title, 300);
  if (!title) return null;
  const out = { title, artist: clean(t.artist, 200) };
  if (Number.isFinite(t.duration) && t.duration > 0 && t.duration < 86400) out.duration = Math.round(t.duration);
  if (YT_RE.test(String(t.yt || ''))) out.yt = String(t.yt);
  const query = clean(t.query, 200);
  if (query) out.query = query;
  if (!out.yt && !out.query) out.query = clean(out.artist ? `${out.artist.split(',')[0]} - ${title}` : title, 200);
  if (typeof t.thumbnail === 'string' && /^https:\/\/i\d?\.ytimg\.com\/[\w\-/.]{1,200}(\?[\w\-=&%.]{0,300})?$/.test(t.thumbnail)) out.thumbnail = t.thumbnail;
  return out;
}

function cleanList(l) {
  if (!l || typeof l !== 'object' || !ID_RE.test(String(l.id))) return null;
  const tracks = (Array.isArray(l.tracks) ? l.tracks : []).slice(0, MAX_TRACKS).map(cleanTrack).filter(Boolean);
  let url = null;
  try { const u = new URL(String(l.url || '')); if (u.protocol === 'https:' && /(^|\.)(spotify\.com|apple\.com|youtube\.com)$/.test(u.hostname)) url = u.toString(); } catch { /* none */ }
  return {
    id: l.id, name: clean(l.name, 150) || 'Lista', source: SOURCES.includes(l.source) ? l.source : 'own', url,
    createdAt: Number.isFinite(l.createdAt) ? l.createdAt : Date.now(), updatedAt: Number.isFinite(l.updatedAt) ? l.updatedAt : Date.now(), tracks,
    // v3.9: a folder of your own, and "keep it up to date" for lists from a link.
    folder: clean(l.folder, 60) || null,
    sync: Boolean(url) && l.sync === true,
    syncedAt: Number.isFinite(l.syncedAt) ? l.syncedAt : null,
  };
}

class StreamLists {
  constructor(file) {
    this.file = file;
    this.lists = [];
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.lists = (Array.isArray(raw) ? raw : []).slice(0, MAX_LISTS).map(cleanList).filter(Boolean);
    } catch { this.lists = []; }
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.lists));
    fs.renameSync(tmp, this.file);
  }

  /** Without the tracks: what the list of lists shows. */
  summary() {
    return this.lists.map((l) => {
      // Up to four different covers, for a mosaic.
      const thumbs = [...new Set(l.tracks.map((t) => t.thumbnail).filter(Boolean))].slice(0, 4);
      return {
        id: l.id, name: l.name, source: l.source, url: l.url, count: l.tracks.length, updatedAt: l.updatedAt,
        thumbnail: thumbs[0] || null, thumbs, folder: l.folder, sync: l.sync, syncedAt: l.syncedAt,
      };
    });
  }

  /** Lists from a link with "keep it up to date" on, not read again for `maxAgeMs`. */
  dueForSync(now = Date.now(), maxAgeMs = 12 * 3600 * 1000) {
    return this.lists.filter((l) => l.url && l.sync && (l.syncedAt || l.createdAt) < now - maxAgeMs).map((l) => l.id);
  }

  get(id) { return this.lists.find((l) => l.id === id) || null; }

  create({ name, source = 'own', url = null, tracks = [] }) {
    if (this.lists.length >= MAX_LISTS) throw new Error('Has llegado al máximo de listas.');
    // From a link: kept up to date by default.
    const list = cleanList({ id: crypto.randomBytes(8).toString('hex'), name, source, url, tracks, createdAt: Date.now(), updatedAt: Date.now(), sync: Boolean(url), syncedAt: url ? Date.now() : null });
    if (!list.tracks.length) throw new Error('La lista no tiene canciones.');
    this.lists.unshift(list);
    this.save();
    return list;
  }

  update(id, patch) {
    const l = this.get(id);
    if (!l) return null;
    if (patch.name !== undefined) l.name = clean(patch.name, 150) || l.name;
    if (typeof patch.folder === 'string') l.folder = clean(patch.folder, 60) || null;
    if (typeof patch.sync === 'boolean') l.sync = Boolean(l.url) && patch.sync;
    if (Array.isArray(patch.tracks)) {
      const tracks = patch.tracks.slice(0, MAX_TRACKS).map(cleanTrack).filter(Boolean);
      // Re-read from Spotify: keep the YouTube videos already found.
      const known = new Map(l.tracks.filter((t) => t.yt).map((t) => [`${t.artist}|${t.title}`, t]));
      for (const t of tracks) { const k = known.get(`${t.artist}|${t.title}`); if (k && !t.yt) { t.yt = k.yt; if (k.thumbnail) t.thumbnail = k.thumbnail; } }
      l.tracks = tracks;
      l.syncedAt = Date.now();
    }
    if (Array.isArray(patch.add)) {
      for (const t of patch.add.map(cleanTrack).filter(Boolean)) if (l.tracks.length < MAX_TRACKS) l.tracks.push(t);
    }
    l.updatedAt = Date.now();
    this.save();
    return l;
  }

  /** The video found for track n (so it isn't looked up again). */
  remember(id, n, found) {
    const l = this.get(id);
    const t = l && Number.isInteger(n) ? l.tracks[n] : null;
    if (!t || !YT_RE.test(String(found.id || ''))) return;
    t.yt = found.id;
    if (found.thumbnail) { const c = cleanTrack({ ...t, thumbnail: found.thumbnail }); if (c && c.thumbnail) t.thumbnail = c.thumbnail; }
    try { this.save(); } catch { /* not fatal */ }
  }

  removeTrack(id, n) {
    const l = this.get(id);
    if (!l || !Number.isInteger(n) || !l.tracks[n]) return null;
    l.tracks.splice(n, 1);
    l.updatedAt = Date.now();
    this.save();
    return l;
  }

  remove(id) {
    const before = this.lists.length;
    this.lists = this.lists.filter((l) => l.id !== id);
    if (this.lists.length !== before) this.save();
    return this.lists.length !== before;
  }
}

/**
 * Of a few YouTube results for "artist - title", the song itself: the one
 * whose length matches (an "- Topic" upload, the album audio, first), so the
 * lyrics line up; else the first.
 */
function pickVideo(results, duration) {
  const rs = (results || []).filter((r) => r && YT_RE.test(String(r.id)));
  if (!rs.length) return null;
  if (duration) {
    const close = rs.filter((r) => Number.isFinite(r.duration) && Math.abs(r.duration - duration) <= 3);
    const topic = close.find((r) => /\s-\sTopic$/.test(r.channel || ''));
    if (topic || close[0]) return topic || close[0];
    const near = rs.filter((r) => Number.isFinite(r.duration) && Math.abs(r.duration - duration) <= 12);
    if (near[0]) return near[0];
  }
  return rs[0];
}

module.exports = { StreamLists, cleanTrack, cleanList, pickVideo, MAX_LISTS, MAX_TRACKS, ID_RE };
