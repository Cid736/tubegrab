// Podcasts (desktop app): subscribe to a feed (RSS) and new episodes are
// downloaded by themselves, saved with the show's cover, their own title,
// date and — when the feed has them — chapters. Feeds and episodes are
// fetched through netfetch (public addresses only).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const netfetch = require('./netfetch');
const { INTERVALS_H } = require('./subscriptions');

const MAX_PODCASTS = 100;
const MAX_SEEN = 2000;
const MAX_EPISODE_BYTES = 2 * 1024 * 1024 * 1024;
const TICK_MS = 5 * 60 * 1000;
const AUDIO_EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'video/mp4': 'mp4', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
    });
}
const plain = (s, max = 300) => decode(s).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const tag = (xml, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? m[1] : ''; };
const attr = (xml, name, a) => {
  const m = new RegExp(`<${name}\\s[^>]*\\b${a}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(xml);
  return m ? decode(m[2] ?? m[3] ?? '') : '';
};
const okUrl = (u, allowHttp = true) => { try { const x = new URL(u); return (x.protocol === 'https:' || (allowHttp && x.protocol === 'http:')) && !x.username && !x.password ? x.toString() : null; } catch { return null; } };

/** "01:02:03" / "3723" → seconds, or null. */
function parseDuration(raw) {
  const v = String(raw || '').trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v));
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(v)) return v.split(':').reduce((a, p) => a * 60 + Number(p), 0);
  return null;
}

/** An RSS feed → { title, image, episodes: [{ guid, title, url, type, date, duration, image, chapters }] } (newest first). */
function parseFeed(xml) {
  const text = String(xml || '');
  if (!/<rss[\s>]|<channel[\s>]/i.test(text)) throw new Error('Esa dirección no es un podcast (no es un feed RSS).');
  const channel = tag(text, 'channel') || text;
  const head = channel.split(/<item[\s>]/i)[0];
  const title = plain(tag(head, 'title'), 150) || 'Podcast';
  const image = okUrl(attr(head, 'itunes:image', 'href') || plain(tag(tag(head, 'image'), 'url'), 1000), false);
  const episodes = [];
  const items = channel.split(/<item[\s>]/i).slice(1);
  for (const raw of items.slice(0, 1000)) {
    const item = raw.split(/<\/item>/i)[0];
    const url = okUrl(attr(item, 'enclosure', 'url'));
    if (!url) continue;
    const type = attr(item, 'enclosure', 'type').toLowerCase();
    const guid = plain(tag(item, 'guid'), 300) || url;
    const date = Date.parse(plain(tag(item, 'pubDate'), 100));
    episodes.push({
      guid,
      title: plain(tag(item, 'title'), 250) || 'Episodio',
      url,
      type: Object.prototype.hasOwnProperty.call(AUDIO_EXT, type) ? type : '',
      date: Number.isFinite(date) ? date : null,
      duration: parseDuration(plain(tag(item, 'itunes:duration'), 20)),
      image: okUrl(attr(item, 'itunes:image', 'href'), false),
      chapters: okUrl(attr(item, 'podcast:chapters', 'url'), false),
    });
  }
  episodes.sort((a, b) => (b.date || 0) - (a.date || 0));
  return { title, image, episodes };
}

async function readFeed(url) {
  return parseFeed(await netfetch.text(url, { allowHttp: true, maxBytes: 15 * 1024 * 1024, headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } }));
}

/** ffmetadata text with escaping (= ; # \ and line breaks). */
function ffmeta(tags, chapters = []) {
  const esc = (v) => String(v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/([=;#\\\n])/g, '\\$1');
  const lines = [';FFMETADATA1'];
  for (const [k, v] of Object.entries(tags)) if (v) lines.push(`${k}=${esc(v)}`);
  chapters.forEach((c, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1].start : c.end;
    if (!(end > c.start)) return;
    lines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.start * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${esc(c.title)}`);
  });
  return `${lines.join('\n')}\n`;
}

/** Podcasting 2.0 chapters (JSON) → [{ start, title, end }]. */
function parseChapters(json, duration) {
  const list = json && Array.isArray(json.chapters) ? json.chapters : [];
  const out = list.filter((c) => c && Number.isFinite(Number(c.startTime)) && c.toc !== false)
    .map((c) => ({ start: Math.max(0, Number(c.startTime)), title: plain(c.title, 120) || 'Capítulo' }))
    .sort((a, b) => a.start - b.start)
    .slice(0, 500);
  for (const c of out) c.end = duration || c.start + 1;
  return out;
}

/** Streams `url` into `file`, reporting progress; stops when the job is cancelled or paused. */
async function fetchToFile(url, file, ctx, { maxBytes = MAX_EPISODE_BYTES } = {}) {
  const res = await netfetch.get(url, { allowHttp: true, timeoutMs: 30000 });
  if (res.status < 200 || res.status >= 300) { res.stream.resume(); throw new Error(`El servidor del podcast respondió ${res.status}.`); }
  const total = Number(res.headers['content-length']) || 0;
  if (total > maxBytes) { res.stream.destroy(); throw new Error('El episodio es demasiado grande.'); }
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file, { flags: 'wx' });
    let got = 0;
    let last = 0;
    let lastBytes = 0;
    let lastAt = Date.now();
    const fail = (err) => { res.stream.destroy(); out.destroy(); reject(err); };
    res.stream.on('data', (c) => {
      if (ctx.isCanceled()) { fail(new Error('Cancelado')); return; }
      got += c.length;
      if (got > maxBytes) { fail(new Error('El episodio es demasiado grande.')); return; }
      const now = Date.now();
      if (now - last > 500) {
        const speed = ((got - lastBytes) / (now - lastAt)) * 1000;
        last = now; lastAt = now; lastBytes = got;
        ctx.update({ status: 'running', stage: 'Descargando', progress: total ? Math.min(99, Math.round((got / total) * 100)) : null, speed: Math.round(speed), eta: total && speed > 0 ? Math.round((total - got) / speed) : null });
      }
    });
    res.stream.on('error', fail);
    out.on('error', fail);
    out.on('finish', resolve);
    res.stream.pipe(out);
  });
}

function ffmpeg(ffmpegPath, args, ctx) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true });
    ctx.setProcess(p);
    p.stderr.resume();
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg falló'))));
  });
}

/** A job runner for one episode: downloads it, then adds the cover, tags and chapters. */
function runEpisode({ episode, podcast, ffmpegPath }) {
  return async (job, ctx) => {
    const { outputBaseName, INPUT_DEMUXERS } = require('./convert');
    const ext = AUDIO_EXT[episode.type] || (/\.(mp3|m4a|aac|ogg|opus|mp4|wav)(\?|$)/i.exec(episode.url) || [])[1]?.toLowerCase() || 'mp3';
    const day = episode.date ? new Date(episode.date).toISOString().slice(0, 10) : '';
    const base = outputBaseName(`${day ? `${day} - ` : ''}${episode.title}.x`);
    const raw = path.join(ctx.dir, `episode.${ext}`);
    ctx.update({ status: 'running', stage: 'Conectando…', progress: null });
    await fetchToFile(episode.url, raw, ctx);
    if (ctx.isCanceled()) throw new Error('Cancelado');
    const out = path.join(ctx.dir, `${base}.${ext}`);
    ctx.update({ status: 'processing', stage: 'Añadiendo portada y capítulos…', progress: null, speed: null, eta: null });
    try {
      let cover = null;
      const coverUrl = episode.image || podcast.image;
      if (coverUrl && ['mp3', 'm4a', 'mp4'].includes(ext)) {
        const img = path.join(ctx.dir, 'cover.img');
        try {
          await fetchToFile(coverUrl, img, ctx, { maxBytes: 8 * 1024 * 1024 });
          cover = img;
        } catch { /* no cover */ }
      }
      let chapters = [];
      if (episode.chapters) {
        try { chapters = parseChapters(await netfetch.json(episode.chapters, { maxBytes: 2 * 1024 * 1024 }), episode.duration); } catch { /* none */ }
      }
      const meta = path.join(ctx.dir, 'meta.txt');
      fs.writeFileSync(meta, ffmeta({ title: episode.title, album: podcast.title, artist: podcast.title, genre: 'Podcast', date: day }, chapters), 'utf8');
      const SAFE = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS];
      const args = [...SAFE, '-i', raw, '-f', 'ffmetadata', '-protocol_whitelist', 'file', '-i', meta];
      if (cover) args.push('-protocol_whitelist', 'file', '-format_whitelist', 'png_pipe,jpeg_pipe,webp_pipe', '-i', cover);
      args.push('-map', '0:a:0', ...(cover ? ['-map', '2:v:0', '-c:v', 'mjpeg', '-vf', "scale='min(1400,iw)':-2", '-disposition:v', 'attached_pic'] : []),
        '-map_metadata', '1', '-map_chapters', '1', '-c:a', 'copy', ...(ext === 'mp3' ? ['-id3v2_version', '3'] : []), out);
      await ffmpeg(ffmpegPath, args, ctx);
      fs.rmSync(raw, { force: true });
    } catch (err) {
      if (ctx.isCanceled()) throw err;
      // Tags are a bonus: the episode itself is kept as it came.
      fs.rmSync(out, { force: true });
      fs.renameSync(raw, out);
    }
    for (const f of ['cover.img', 'meta.txt']) fs.rmSync(path.join(ctx.dir, f), { force: true });
    return out;
  };
}

class Podcasts {
  /** `enqueue(podcast, episodes)` queues the downloads; `read(url)` → parsed feed (tests can swap it). */
  constructor({ file, enqueue, read = readFeed }) {
    this.file = file;
    this.enqueue = enqueue;
    this.read = read;
    this.checking = new Set();
    this.list = [];
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(raw)) this.list = raw.filter((p) => p && /^[a-f0-9]{16}$/.test(p.id) && okUrl(p.url));
    } catch { /* first run */ }
    this.timer = setInterval(() => this.checkDue(), TICK_MS);
    this.timer.unref();
    setTimeout(() => this.checkDue(), 45_000).unref();
  }

  save() {
    try { fs.writeFileSync(this.file, JSON.stringify(this.list, null, 2)); } catch { /* not fatal */ }
  }

  view(p) {
    const { id, url, title, image, interval, enabled, lastCheck, lastNew, lastError, count } = p;
    return { id, url, title, image, interval, enabled, lastCheck, lastNew, lastError, count: count || 0, checking: this.checking.has(id) };
  }

  listFor(clientId) { return this.list.filter((p) => p.clientId === clientId).map((p) => this.view(p)); }
  get(id, clientId) { return this.list.find((p) => p.id === id && p.clientId === clientId) || null; }

  async add({ clientId, url, interval, backfill }) {
    const feedUrl = okUrl(url);
    if (!feedUrl) throw new Error('Pega la dirección del feed (RSS) del podcast.');
    if (this.list.length >= MAX_PODCASTS) throw new Error('Has llegado al máximo de podcasts.');
    if (this.list.some((p) => p.clientId === clientId && p.url === feedUrl)) throw new Error('Ya estás suscrito a ese podcast.');
    const feed = await this.read(feedUrl);
    if (!feed.episodes.length) throw new Error('Ese podcast no tiene episodios.');
    const n = Math.max(0, Math.min(10, Number(backfill) || 0));
    const p = {
      id: crypto.randomBytes(8).toString('hex'), clientId, url: feedUrl, title: feed.title, image: feed.image,
      interval: INTERVALS_H.includes(Number(interval)) ? Number(interval) : 6, enabled: true,
      seen: feed.episodes.map((e) => e.guid).slice(0, MAX_SEEN), lastCheck: Date.now(), lastNew: null, lastError: null, count: feed.episodes.length,
    };
    this.list.push(p);
    this.save();
    const first = feed.episodes.slice(0, n);
    if (first.length) { p.lastNew = Date.now(); this.enqueue(p, first.reverse()); }
    return this.view(p);
  }

  update(p, patch) {
    if (typeof patch.enabled === 'boolean') p.enabled = patch.enabled;
    if (INTERVALS_H.includes(Number(patch.interval))) p.interval = Number(patch.interval);
    this.save();
    return this.view(p);
  }

  remove(p) { this.list = this.list.filter((x) => x !== p); this.save(); }

  async check(p) {
    if (this.checking.has(p.id)) return 0;
    this.checking.add(p.id);
    try {
      let feed;
      try { feed = await this.read(p.url); } catch (err) { p.lastError = err.message; return 0; } finally { p.lastCheck = Date.now(); }
      p.lastError = null;
      p.title = feed.title || p.title;
      p.image = feed.image || p.image;
      p.count = feed.episodes.length;
      const seen = new Set(p.seen);
      const fresh = feed.episodes.filter((e) => !seen.has(e.guid));
      if (fresh.length) {
        p.seen = [...fresh.map((e) => e.guid), ...p.seen].slice(0, MAX_SEEN);
        p.lastNew = Date.now();
        // At most 10 at once (a feed that renamed every episode must not flood the queue).
        this.enqueue(p, fresh.slice(0, 10).reverse());
      }
      return fresh.length;
    } finally {
      this.checking.delete(p.id);
      this.save();
    }
  }

  /** The latest episodes, to pick by hand. */
  async episodes(p) {
    const feed = await this.read(p.url);
    return feed.episodes.slice(0, 100);
  }

  checkDue() {
    const now = Date.now();
    for (const p of this.list) if (p.enabled && now - (p.lastCheck || 0) >= p.interval * 3600 * 1000) this.check(p).catch(() => {});
  }
}

module.exports = { Podcasts, parseFeed, readFeed, parseChapters, ffmeta, runEpisode, parseDuration };
