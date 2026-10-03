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
    return { id, url, title, options, interval, lastCheck, lastNew, lastError, enabled, detail, mirror: sub.mirror === true, checking: this.checking.has(id) };
  }

  list(clientId) {
    return this.subs.filter((s) => s.clientId === clientId).map((s) => this.view(s));
  }

  get(id, clientId) {
    return this.subs.find((s) => s.id === id && s.clientId === clientId) || null;
  }

  /** Subscribes and marks what's already there as seen, except the newest `backfill`. */
  async add({ clientId, url, options, detail, interval, backfill, mirror = false }) {
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
    };
    // A mirror starts with the whole playlist; otherwise only the newest `backfill`.
    const n = mirror ? result.entries.length : Math.max(0, Math.min(10, Number(backfill) || 0));
    const toGet = mirror ? result.entries : result.entries.slice(0, n);
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
      if (fresh.length) {
        if (!sub.mirror) sub.seen = [...fresh.map((e) => e.id || e.url), ...sub.seen].slice(0, MAX_SEEN);
        sub.lastNew = Date.now();
        // Oldest first, so they land in the queue in publishing order (a
        // mirror keeps the playlist's own order).
        this.enqueue(sub, sub.mirror ? fresh : fresh.reverse());
      }
      if (sub.mirror) this.onMirror(sub, result.entries);
      return fresh.length;
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

module.exports = { Subscriptions, INTERVALS_H, PLAYLIST_URL };
