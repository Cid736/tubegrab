// Subscriptions (desktop app): channels or playlists checked every few hours;
// new videos are queued with the options chosen when subscribing.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const INTERVALS_H = [1, 3, 6, 12, 24];
// Mirror mode is for playlists (a channel's whole history isn't a list to copy).
const PLAYLIST_URL = /[?&]list=|\/playlist\b|\/sets\/|\/album\//i;
const MAX_SUBSCRIPTIONS = 100;
const MAX_SEEN = 1000;
const TICK_MS = 5 * 60 * 1000;
const MAX_MINUTES = 24 * 60;
const MAX_WORDS = 20;

// Filters: what a channel publishes that you don't want (Shorts, trailers,
// three-hour streams…) is skipped, though still marked as seen.
const fold = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** "live, trailer" → ['live', 'trailer'] (folded, no empties). */
const words = (raw) => fold(raw).replace(/[\u0000-\u001f\u007f]/g, ' ').split(',').map((w) => w.replace(/\s+/g, ' ').trim().slice(0, 50)).filter(Boolean).slice(0, MAX_WORDS);
const minutes = (raw) => {
  const n = Number(raw);
  return raw !== '' && raw !== null && Number.isFinite(n) && n > 0 && n <= MAX_MINUTES ? Math.round(n * 10) / 10 : null;
};
/** The filters from a request, or null when none is set. */
function parseFilters(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const f = {
    noShorts: raw.noShorts === true,
    minMinutes: minutes(raw.minMinutes),
    maxMinutes: minutes(raw.maxMinutes),
    include: words(raw.include),
    exclude: words(raw.exclude),
  };
  if (f.minMinutes !== null && f.maxMinutes !== null && f.maxMinutes <= f.minMinutes) f.maxMinutes = null;
  return f.noShorts || f.minMinutes !== null || f.maxMinutes !== null || f.include.length || f.exclude.length ? f : null;
}
/** Whether an entry ({ url, title, duration }) gets through. An unknown length passes the length filters. */
function passes(entry, f) {
  if (!f) return true;
  const d = Number.isFinite(entry.duration) ? entry.duration : null;
  if (f.noShorts && (/\/shorts\//.test(String(entry.url || '')) || (d !== null && d <= 60))) return false;
  if (d !== null && f.minMinutes !== null && d < f.minMinutes * 60) return false;
  if (d !== null && f.maxMinutes !== null && d > f.maxMinutes * 60) return false;
  const title = fold(entry.title);
  if (f.include.length && !f.include.some((w) => title.includes(w))) return false;
  return !f.exclude.some((w) => title.includes(w));
}

class Subscriptions {
  /**
   * `latest(url)` → { title, entries: [{ id, url, title }] } | null (newest first).
   * `full(url)` → the same with every entry, in the playlist's order (mirror mode).
   * `enqueue(sub, entries)` queues downloads for new entries.
   * `onMirror(sub, entries)` after each check of a mirrored playlist (its whole list).
   */
  constructor({ file, latest, full = latest, enqueue, onMirror = () => {} }) {
    this.file = file;
    this.latest = latest;
    this.full = full;
    this.enqueue = enqueue;
    this.onMirror = onMirror;
    this.checking = new Set();
    this.subs = [];
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(raw)) this.subs = raw.filter((s) => s && typeof s.id === 'string' && typeof s.url === 'string');
    } catch { /* first run */ }
    this.timer = setInterval(() => this.checkDue(), TICK_MS);
    this.timer.unref();
    setTimeout(() => this.checkDue(), 30_000).unref();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.subs, null, 2));
    } catch (err) {
      console.error('[Subscriptions] save failed:', err.message);
    }
  }

  view(sub) {
    const { id, url, title, options, interval, lastCheck, lastNew, lastError, enabled, detail } = sub;
    return { id, url, title, options, interval, lastCheck, lastNew, lastError, enabled, detail, mirror: sub.mirror === true, filters: sub.filters || null, checking: this.checking.has(id) };
  }

  list(clientId) {
    return this.subs.filter((s) => s.clientId === clientId).map((s) => this.view(s));
  }

  get(id, clientId) {
    return this.subs.find((s) => s.id === id && s.clientId === clientId) || null;
  }

  /** Subscribes and marks what's already there as seen, except the newest `backfill`. */
  async add({ clientId, url, options, detail, interval, backfill, mirror = false, filters = null }) {
    if (this.subs.length >= MAX_SUBSCRIPTIONS) throw new Error('Has llegado al máximo de suscripciones.');
    if (this.subs.some((s) => s.clientId === clientId && s.url === url)) throw new Error('Ya estás suscrito a ese canal o playlist.');
    if (mirror && !PLAYLIST_URL.test(url)) throw new Error('El modo espejo es para playlists: pega el enlace de una playlist.');
    const result = await (mirror ? this.full(url) : this.latest(url));
    if (!result || !result.entries.length) throw new Error('No se encontraron vídeos en ese enlace (¿es un canal o una playlist?).');
    const sub = {
      id: crypto.randomBytes(8).toString('hex'),
      clientId, url, options, detail,
      title: result.title,
      interval: INTERVALS_H.includes(Number(interval)) ? Number(interval) : 6,
      enabled: true,
      seen: [],
      lastCheck: Date.now(), lastNew: null, lastError: null,
      mirror: mirror === true,
      // A mirror copies the whole playlist: no filters.
      filters: mirror ? null : parseFilters(filters),
    };
    // A mirror starts with the whole playlist; otherwise only the newest `backfill` that pass the filters.
    const n = mirror ? result.entries.length : Math.max(0, Math.min(10, Number(backfill) || 0));
    const toGet = mirror ? result.entries : result.entries.filter((e) => passes(e, sub.filters)).slice(0, n);
    sub.seen = result.entries.map((e) => e.id || e.url).slice(0, MAX_SEEN);
    this.subs.push(sub);
    this.save();
    if (toGet.length) {
      sub.lastNew = Date.now();
      this.enqueue(sub, toGet);
    }
    return this.view(sub);
  }

  update(sub, patch) {
    if (typeof patch.enabled === 'boolean') sub.enabled = patch.enabled;
    if (INTERVALS_H.includes(Number(patch.interval))) sub.interval = Number(patch.interval);
    if (Object.prototype.hasOwnProperty.call(patch, 'filters') && !sub.mirror) sub.filters = parseFilters(patch.filters);
    this.save();
    return this.view(sub);
  }

  remove(sub) {
    this.subs = this.subs.filter((s) => s !== sub);
    this.save();
  }

  /** Looks for new videos now; resolves with how many were queued. */
  async check(sub) {
    if (this.checking.has(sub.id)) return 0;
    this.checking.add(sub.id);
    try {
      const result = await (sub.mirror ? this.full(sub.url) : this.latest(sub.url));
      sub.lastCheck = Date.now();
      if (!result) {
        sub.lastError = 'No se pudo comprobar (¿sin conexión?).';
        return 0;
      }
      sub.lastError = null;
      const seen = new Set(sub.seen);
      const fresh = result.entries.filter((e) => !seen.has(e.id || e.url));
      // A mirror lists the whole playlist: everything in it stays "seen".
      if (sub.mirror) sub.seen = [...new Set([...result.entries.map((e) => e.id || e.url), ...sub.seen])].slice(0, MAX_SEEN);
      if (fresh.length && !sub.mirror) sub.seen = [...fresh.map((e) => e.id || e.url), ...sub.seen].slice(0, MAX_SEEN);
      // What the filters leave out stays seen, so it's never looked at again.
      const wanted = sub.mirror ? fresh : fresh.filter((e) => passes(e, sub.filters));
      if (wanted.length) {
        sub.lastNew = Date.now();
        // Oldest first, so they land in the queue in publishing order (a
        // mirror keeps the playlist's own order).
        this.enqueue(sub, sub.mirror ? wanted : wanted.reverse());
      }
      if (sub.mirror) this.onMirror(sub, result.entries);
      return wanted.length;
    } finally {
      this.checking.delete(sub.id);
      this.save();
    }
  }

  checkDue() {
    const now = Date.now();
    for (const sub of this.subs) {
      if (sub.enabled && now - (sub.lastCheck || 0) >= sub.interval * 3600 * 1000) {
        this.check(sub).catch(() => {});
      }
    }
  }
}

module.exports = { Subscriptions, INTERVALS_H, PLAYLIST_URL, parseFilters, passes };
