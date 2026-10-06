const express = require('express');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const { JobManager } = require('./lib/jobs');
const download = require('./lib/download');
const convert = require('./lib/convert');
const { Subscriptions, INTERVALS_H } = require('./lib/subscriptions');
const { parseUsers, basicAuth } = require('./lib/auth');
const tags = require('./lib/tags');
const { Library, ShareServer } = require('./lib/library');
const { isLocalFolderPath } = require('./lib/filenames');
const { RemoteServer } = require('./lib/remote');
const whisper = require('./lib/whisper');
const { SeenIndex, keyFromUrl, keyFromMeta } = require('./lib/seen');
const { ProfileStore } = require('./lib/profiles');
const { CastManager } = require('./lib/cast');
const { WatchFolder } = require('./lib/watch');
const { pendingSpecs } = require('./lib/jobs');
const { Podcasts, runEpisode } = require('./lib/podcasts');
const { Recurring } = require('./lib/recurring');
const importlist = require('./lib/importlist');
const musicbrainz = require('./lib/musicbrainz');
const { detectHighlights } = require('./lib/highlights');
const { srtToVtt, MAX_BATCH } = require('./lib/library');
const { lanAddress } = require('./lib/library');
const { safeFolderName } = require('./lib/filenames');
const http = require('http');
const qrcode = require('qrcode-generator');
const { EventEmitter } = require('events');

// App-wide notifications for open event streams (e.g. subscriptions changed).
const events = new EventEmitter();
events.setMaxListeners(0);

const app = express();
const PORT = process.env.PORT || 3000;
// Bind to localhost only by default (this app is meant to run as a local/desktop
// tool). Any container/host deployment (Docker, Render, Railway...) must set
// HOST=0.0.0.0 itself — inside a container, binding to 127.0.0.1 is unreachable
// from outside even with host-level port publishing restricted to localhost.
const HOST = process.env.HOST || '127.0.0.1';
const IS_DESKTOP = Boolean(process.env.TUBEGRAB_ELECTRON);

const isWindows = process.platform === 'win32';

// Both binaries are looked up on every use: the light desktop build downloads
// them into its data folder after the server has already started.
//
// ffmpeg — FFMPEG_BIN (the desktop app's copy, or the Docker image's
// /usr/bin/ffmpeg, which has ffprobe next to it), else the SHA-256-pinned
// bin/ffmpeg.exe from scripts/fetch-ffmpeg.js; ffmpeg-static is a last resort.
const pinnedFfmpeg = path.join(__dirname, 'bin', 'ffmpeg.exe');
function currentFfmpegPath() {
  const env = process.env.FFMPEG_BIN;
  if (env && path.isAbsolute(env) && fs.existsSync(env)) return env;
  if (isWindows && fs.existsSync(pinnedFfmpeg)) return pinnedFfmpeg;
  return ffmpegPath;
}

// yt-dlp — the desktop app's self-updating copy in its data folder, else the
// one next to this file (Windows) / from postinstall (Linux), else PATH.
function currentYtDlpPath() {
  const env = process.env.TUBEGRAB_YTDLP;
  if (env && fs.existsSync(env)) return env;
  if (isWindows) return path.join(__dirname, 'yt-dlp.exe');
  const localYtDlp = path.join(__dirname, 'yt-dlp');
  return fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
}

// Optional cookies.txt (age-restricted / sign-in videos). The desktop app
// passes its data folder: the portable .exe's own folder is a temp copy
// re-extracted on every launch, so nothing placed "next to the app" survives.
const dataDir = process.env.TUBEGRAB_DATA_DIR && path.isAbsolute(process.env.TUBEGRAB_DATA_DIR) ? process.env.TUBEGRAB_DATA_DIR : __dirname;
const cookiesPath = path.join(dataDir, 'cookies.txt');
// YouTube needs a JavaScript runtime to solve its player challenges. Whatever
// runs this server (Node, or Electron acting as Node inside the desktop app —
// ELECTRON_RUN_AS_NODE is inherited by yt-dlp's child) is one.
const ytEnv = () => ({
  ytDlpPath: currentYtDlpPath(),
  ffmpegPath: currentFfmpegPath(),
  jsRuntime: process.execPath,
  cookiesPath: fs.existsSync(cookiesPath) ? cookiesPath : null,
  // The desktop app's proxy setting (validated when saved, and again by download.js).
  proxy: IS_DESKTOP && download.parseProxy(config.proxy) ? config.proxy : null,
});
// fpcalc (AcoustID's fingerprint tool), downloaded by the desktop app on demand.
const fpcalcPath = () => {
  const p = process.env.TUBEGRAB_FPCALC;
  return p && path.isAbsolute(p) && fs.existsSync(p) ? p : null;
};

const jobs = new JobManager(IS_DESKTOP ? { maxPerClient: 1000, maxTotal: 1000 } : { maxPerClient: 50, maxTotal: 300 });

// Render/Railway/most PaaS put the app behind a reverse proxy; trust its
// X-Forwarded-For so express-rate-limit and req.ip work correctly there.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    // Video thumbnails come from the source site's CDN; the trim preview
    // plays the chosen local file, and the editor shows the chosen logo,
    // through blob: URLs (only ever created by the page from the user's files).
    // Search and playlist previews: only YouTube's privacy-enhanced player, framed.
    directives: { 'img-src': ["'self'", 'data:', 'https:', 'blob:'], 'media-src': ["'self'", 'blob:'], 'frame-src': ['https://www.youtube-nocookie.com'] },
  },
}));

// DNS-rebinding guard: when bound to localhost, a malicious site could point its
// own domain at 127.0.0.1 and then read this server's responses from the
// browser. Only answer requests actually addressed to localhost.
if (HOST === '127.0.0.1') {
  const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
  app.use((req, res, next) => {
    if (!allowedHosts.has(String(req.headers.host || '').toLowerCase())) {
      return res.status(403).send('Forbidden');
    }
    next();
  });
}

// Private instance: TUBEGRAB_USERS="user:password,…" asks for a login on every
// request (page included). Failed attempts are rate-limited per IP.
// A set-but-broken TUBEGRAB_USERS stops the server instead of leaving it open.
const authSpec = IS_DESKTOP ? '' : String(process.env.TUBEGRAB_USERS || '');
const { users: authUsers, problems: authProblems } = parseUsers(authSpec);
if (authProblems.length) {
  console.error(`❌ TUBEGRAB_USERS no es válida; el servidor no arranca para no quedar abierto:\n  - ${authProblems.join('\n  - ')}\n  Formato: usuario:contraseña,otro:contraseña (mín. 8 caracteres, sin comas).`);
  process.exit(1);
}
if (authUsers.size) {
  app.use(rateLimit({
    windowMs: 15 * 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
    skipSuccessfulRequests: true,
    message: 'Demasiados intentos fallidos, espera 15 minutos.',
  }));
  app.use(basicAuth(authUsers));
}

// Cross-site request guard: any web page the user visits can fire requests at
// this server (e.g. a multipart POST). Browsers attach Origin to those; reject
// any that isn't this same host.
app.use('/api/', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    let originHost = null;
    try { originHost = new URL(origin).host; } catch { /* malformed → rejected below */ }
    if (originHost !== req.headers.host) {
      return res.status(403).json({ error: 'Origen no permitido.' });
    }
  }
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = (max) => rateLimit({
  windowMs: 60_000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, espera un minuto.' },
});
app.use('/api/', limiter(600));
const createLimiter = limiter(IS_DESKTOP ? 600 : 60);
const infoLimiter = limiter(IS_DESKTOP ? 300 : 40);

// Each browser/app instance generates its own random id; jobs are only ever
// visible to the id that created them (matters when self-hosted publicly).
const CLIENT_ID_RE = /^[a-f0-9]{32}$/;
function clientIdFrom(req) {
  const id = String(req.get('x-client-id') || req.query.client || '');
  return CLIENT_ID_RE.test(id) ? id : null;
}
function requireClient(req, res, next) {
  req.clientId = clientIdFrom(req);
  if (!req.clientId) return res.status(400).json({ error: 'Falta el identificador de cliente.' });
  next();
}
function requireJob(req, res, next) {
  const job = /^[a-f0-9]{32}$/.test(req.params.id) ? jobs.get(req.params.id, req.clientId) : null;
  if (!job) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  req.job = job;
  next();
}

// Each preview and playlist read is a yt-dlp process; the per-IP rate limits
// don't bound how many run at once across everyone (self-hosted instance).
function slots(max) {
  let busy = 0;
  return {
    take() { if (busy >= max) return false; busy += 1; return true; },
    release() { busy = Math.max(0, busy - 1); },
  };
}
const infoSlots = slots(IS_DESKTOP ? 4 : 8);
const playlistSlots = slots(IS_DESKTOP ? 3 : 4);
const BUSY = { error: 'El servidor está ocupado, inténtalo en unos segundos.' };

// === Settings the desktop app can change (persisted in its data folder) ===
const CONFIG_FILE = path.join(dataDir, 'server-config.json');
const config = { downloadConcurrency: 3, convertConcurrency: 1, hwAccel: 'auto', proxy: '', acoustidKey: '' };
if (IS_DESKTOP) {
  try { Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); } catch { /* defaults */ }
}
function applyConfig() {
  jobs.setConcurrency('download', config.downloadConcurrency);
  jobs.setConcurrency('convert', config.convertConcurrency);
  config.downloadConcurrency = jobs.concurrency.download;
  config.convertConcurrency = jobs.concurrency.convert;
  if (!['auto', 'off'].includes(config.hwAccel)) config.hwAccel = 'auto';
  if (!download.parseProxy(config.proxy)) config.proxy = '';
  if (!musicbrainz.KEY_RE.test(String(config.acoustidKey || ''))) config.acoustidKey = '';
}
applyConfig();
const configView = () => ({ ...config, gpu: gpuVendor, desktop: IS_DESKTOP, whisper: whisper.status(), fpcalc: Boolean(fpcalcPath()) });

// GPU encoder, detected once in the background (a 1-frame test encode).
// Cached per ffmpeg binary; retried while ffmpeg is still being downloaded.
let gpuVendor = null;
const detectGpu = () => convert.detectHwEncoder(currentFfmpegPath()).then((v) => { gpuVendor = v; return v; }, () => null);
detectGpu();
const hwFor = () => {
  if (!gpuVendor) detectGpu(); // ready for the next conversion
  return config.hwAccel === 'auto' ? gpuVendor : null;
};

app.get('/api/config', async (req, res) => {
  if (!gpuVendor) await detectGpu();
  res.json(IS_DESKTOP ? configView() : { ...configView(), proxy: '', acoustidKey: '' });
});

// The desktop app's downloads (the web page's "Descargar"): their sizes, from
// the latest GitHub release, asked at most once an hour. Names and sizes only.
const APP_FILES = ['TubeGrab-Setup.exe', 'TubeGrab.exe', 'TubeGrab-Lite.exe'];
let appRelease = { at: 0, data: null };
app.get('/api/desktop/latest', infoLimiter, async (req, res) => {
  if (!appRelease.data || Date.now() - appRelease.at > 3600e3) {
    try {
      const r = await require('./lib/netfetch').json('https://api.github.com/repos/Cid736/tubegrab/releases/latest', { timeoutMs: 8000, headers: { Accept: 'application/vnd.github+json' } });
      const sizes = {};
      for (const a of Array.isArray(r && r.assets) ? r.assets : []) {
        if (a && APP_FILES.includes(a.name) && Number.isFinite(a.size) && a.size > 0) sizes[a.name] = a.size;
      }
      const version = typeof r.tag_name === 'string' && /^v?\d+\.\d+\.\d+$/.test(r.tag_name) ? r.tag_name.replace(/^v/, '') : null;
      appRelease = { at: Date.now(), data: { version, sizes } };
    } catch {
      // Not reachable now: the page shows rough sizes, asked again in 5 minutes.
      appRelease = { at: Date.now() - 3300e3, data: appRelease.data || { version: null, sizes: {} } };
    }
  }
  res.json(appRelease.data);
});

app.post('/api/config', (req, res) => {
  if (!IS_DESKTOP) return res.status(403).json({ error: 'Solo en la app de escritorio.' });
  const body = req.body || {};
  if (body.downloadConcurrency !== undefined) config.downloadConcurrency = Number(body.downloadConcurrency);
  if (body.convertConcurrency !== undefined) config.convertConcurrency = Number(body.convertConcurrency);
  if (['auto', 'off'].includes(body.hwAccel)) config.hwAccel = body.hwAccel;
  if (typeof body.proxy === 'string') {
    if (body.proxy.trim() && !download.parseProxy(body.proxy)) return res.status(400).json({ error: 'Proxy no válido. Usa http://servidor:puerto o socks5://servidor:puerto.' });
    config.proxy = body.proxy.trim();
  }
  if (typeof body.acoustidKey === 'string') {
    if (body.acoustidKey.trim() && !musicbrainz.KEY_RE.test(body.acoustidKey.trim())) return res.status(400).json({ error: 'Esa clave de AcoustID no es válida.' });
    config.acoustidKey = body.acoustidKey.trim();
  }
  applyConfig();
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch { /* not fatal */ }
  res.json(configView());
});

// === "You already have it": what this client downloaded, by video id ===
const seen = new SeenIndex({ file: IS_DESKTOP ? path.join(dataDir, 'downloaded.json') : null });
const recorded = new Set();
jobs.on('update', (clientId, job) => {
  if (job.type !== 'download' || job.status !== 'done' || recorded.has(job.id)) return;
  recorded.add(job.id);
  if (recorded.size > 5000) recorded.delete(recorded.values().next().value);
  const meta = job.meta || {};
  const key = keyFromMeta(meta.extractor_key, meta.id) || keyFromUrl(job.source);
  if (key) seen.add(clientId, key, { title: meta.title || job.title, mode: job.request && job.request.mode });
});
app.post('/api/seen', requireClient, (req, res) => {
  const urls = Array.isArray((req.body || {}).urls) ? req.body.urls.slice(0, 500).filter((u) => typeof u === 'string' && u.length <= 2048) : [];
  res.json({ found: seen.check(req.clientId, urls) });
});
app.delete('/api/seen', requireClient, (req, res) => {
  seen.clear(req.clientId);
  res.json({ ok: true });
});
const alreadyFor = (clientId, url) => (clientId ? seen.get(clientId, keyFromUrl(url)) : null);

// === Media info preview (title, thumbnail, duration) ===
app.post('/api/info', infoLimiter, (req, res) => {
  const url = download.normalizeMediaUrl((req.body || {}).url);
  if (!url) return res.status(400).json({ error: 'Enlace no válido o sitio no soportado.' });
  if (!infoSlots.take()) return res.status(429).json(BUSY);

  const env = ytEnv();
  const args = ['--ignore-config', '--encoding', 'utf-8', '--no-playlist', '--ies', 'default,-generic', '--dump-json', '--skip-download', '--no-warnings'];
  if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
  if (env.cookiesPath) args.push('--cookies', env.cookiesPath);
  if (env.proxy) args.push('--proxy', env.proxy);
  args.push('--', url);

  execFile(env.ytDlpPath, args, { windowsHide: true, timeout: 60_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
    infoSlots.release();
    if (err) return res.status(500).json({ error: 'No se pudo obtener información del enlace.' });
    try {
      const data = JSON.parse(stdout);
      const thumbnail = typeof data.thumbnail === 'string' && data.thumbnail.startsWith('https://') ? data.thumbnail : null;
      const chapters = Array.isArray(data.chapters) ? data.chapters.length : 0;
      const clientId = clientIdFrom(req);
      const key = keyFromMeta(data.extractor_key, data.id);
      const short = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) : null);
      return res.json({
        title: data.title || 'Sin título',
        thumbnail,
        duration: data.duration || null,
        uploader: short(data.uploader) || short(data.channel) || null,
        channel: short(data.channel) || null,
        site: data.extractor_key || null,
        chapters,
        isPlaylist: false,
        // On air right now (or about to be): it can be recorded from the start.
        isLive: data.is_live === true || data.live_status === 'is_live' || data.live_status === 'is_upcoming',
        sizes: download.formatSizes(data),
        already: clientId && key ? seen.get(clientId, key) : null,
      });
    } catch {
      return res.status(500).json({ error: 'No se pudo obtener información del enlace.' });
    }
  });
});

// === Search (YouTube, free text) ===
app.post('/api/search', infoLimiter, async (req, res) => {
  const query = String((req.body || {}).query || '').trim();
  if (!query || query.length > 200) return res.status(400).json({ error: 'Escribe qué quieres buscar (máx. 200 caracteres).' });
  if (!infoSlots.take()) return res.status(429).json(BUSY);
  try {
    const results = await download.search(query, ytEnv(), 15);
    if (!results) return res.status(502).json({ error: 'No se pudo buscar ahora mismo. Inténtalo de nuevo.' });
    const clientId = clientIdFrom(req);
    res.json({ results: results.map((e) => ({ ...e, already: alreadyFor(clientId, e.url) })) });
  } finally {
    infoSlots.release();
  }
});

// === Playlist contents (to pick which videos to download) ===
app.post('/api/playlist', infoLimiter, async (req, res) => {
  const url = download.normalizeMediaUrl((req.body || {}).url);
  if (!url) return res.status(400).json({ error: 'Enlace no válido o sitio no soportado.' });
  if (!playlistSlots.take()) return res.status(429).json(BUSY);
  try {
    const list = await download.expandPlaylist(url, ytEnv());
    if (!list || !list.entries.length) return res.status(404).json({ error: 'Ese enlace no es una playlist, o está vacía.' });
    const clientId = clientIdFrom(req);
    res.json({ ...list, entries: list.entries.map((e) => ({ ...e, already: alreadyFor(clientId, e.url) })) });
  } finally {
    playlistSlots.release();
  }
});

// === Jobs ===
const sseConnections = new Map(); // clientId -> open count
let sseTotal = 0;
const SSE_MAX_PER_CLIENT = 5;
const SSE_MAX_TOTAL = IS_DESKTOP ? 20 : 500;

app.get('/api/jobs/events', requireClient, (req, res) => {
  const mine = sseConnections.get(req.clientId) || 0;
  if (mine >= SSE_MAX_PER_CLIENT || sseTotal >= SSE_MAX_TOTAL) {
    return res.status(429).json({ error: 'Demasiadas conexiones abiertas.' });
  }
  sseConnections.set(req.clientId, mine + 1);
  sseTotal += 1;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('snapshot', jobs.listFor(req.clientId));
  if (IS_DESKTOP) send('schedule', { until: jobs.holdUntil });

  const onUpdate = (clientId, job) => { if (clientId === req.clientId) send('job', job); };
  const onRemoved = (clientId, id) => { if (clientId === req.clientId) send('removed', { id }); };
  const onSubs = (clientId) => { if (clientId === req.clientId) send('subscriptions', {}); };
  const onMirror = (clientId, info) => { if (clientId === req.clientId) send('mirror', info); };
  const onHold = (until) => send('schedule', { until });
  if (IS_DESKTOP) jobs.on('hold', onHold);
  jobs.on('update', onUpdate);
  jobs.on('removed', onRemoved);
  events.on('subscriptions', onSubs);
  events.on('mirror', onMirror);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    jobs.off('update', onUpdate);
    jobs.off('removed', onRemoved);
    events.off('subscriptions', onSubs);
    events.off('mirror', onMirror);
    jobs.off('hold', onHold);
    const left = (sseConnections.get(req.clientId) || 1) - 1;
    if (left > 0) sseConnections.set(req.clientId, left); else sseConnections.delete(req.clientId);
    sseTotal -= 1;
  });
});

const TOO_MANY_JOBS = { error: 'Hay demasiados trabajos en la cola. Elimina algunos terminados e inténtalo de nuevo.' };

const PRIORITY_NAMES = ['high', 'normal', 'low'];
const priorityOf = (v) => (PRIORITY_NAMES.includes(v) ? v : 'normal');

/**
 * One download-type job from its description (also how the queue comes back
 * after a restart): { kind: 'download', url, opts } | { kind: 'thumb', url,
 * format } | { kind: 'podcast', episode, podcast }. Only ever valid ones:
 * everything is checked again here.
 */
function createFromSpec(clientId, spec, { title = null, priority = 'normal', paused = false, saveFolder = null } = {}) {
  const env = ytEnv();
  if (spec.kind === 'download') {
    const url = download.isSearchUrl(spec.url) ? spec.url : download.normalizeMediaUrl(spec.url);
    if (!url) return null;
    const opts = download.parseDownloadOptions(spec.opts || {});
    if (download.validateOptions(opts)) return null;
    return jobs.create({
      clientId, type: 'download', title: title || (download.isSearchUrl(url) ? url.slice(10) : url), detail: download.describeOptions(opts),
      source: download.isSearchUrl(url) ? null : url, request: opts, run: download.runDownload(url, opts, env),
      retryable: true, live: opts.live, saveFolder, priority, paused,
      persist: { kind: 'download', url, opts },
    });
  }
  if (spec.kind === 'thumb') {
    const url = download.normalizeMediaUrl(spec.url);
    if (!url) return null;
    const format = download.THUMB_FORMATS.includes(spec.format) ? spec.format : 'jpg';
    return jobs.create({
      clientId, type: 'download', title: title || url, detail: `Miniatura · ${format.toUpperCase()}`, source: url, request: null,
      run: download.runThumbnail(url, format, env), retryable: true, priority, paused, persist: { kind: 'thumb', url, format },
    });
  }
  if (spec.kind === 'podcast' && spec.episode && spec.podcast) {
    const e = spec.episode;
    const ok = (u) => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.toString() : null; } catch { return null; } };
    const episode = {
      guid: String(e.guid || '').slice(0, 300), title: String(e.title || 'Episodio').slice(0, 250), url: ok(e.url), type: String(e.type || '').slice(0, 40),
      date: Number.isFinite(e.date) ? e.date : null, duration: Number.isFinite(e.duration) ? e.duration : null,
      image: e.image && ok(e.image) && ok(e.image).startsWith('https:') ? ok(e.image) : null,
      chapters: e.chapters && ok(e.chapters) && ok(e.chapters).startsWith('https:') ? ok(e.chapters) : null,
    };
    if (!episode.url) return null;
    const podcast = { title: String(spec.podcast.title || 'Podcast').slice(0, 150), image: spec.podcast.image && ok(spec.podcast.image) && ok(spec.podcast.image).startsWith('https:') ? ok(spec.podcast.image) : null };
    return jobs.create({
      clientId, type: 'download', title: title || episode.title, detail: `Podcast · ${podcast.title}`, source: null, request: null,
      run: runEpisode({ episode, podcast, ffmpegPath: currentFfmpegPath() }), retryable: true, priority, paused,
      saveFolder: saveFolder || safeFolderName(podcast.title), persist: { kind: 'podcast', episode, podcast },
    });
  }
  return null;
}

/**
 * Queues one download job per item ({ url, title }) with validated options.
 * `saveFolder`: one folder name inside the downloads folder (mirrored playlists).
 */
function queueDownloads(clientId, items, opts, { saveFolder = null, priority = 'normal' } = {}) {
  let n = 0;
  for (const item of items) {
    if (createFromSpec(clientId, { kind: 'download', url: item.url, opts }, { title: item.title || item.url, priority, saveFolder })) n += 1;
  }
  return n;
}

// === The queue survives a restart (desktop): what hadn't finished is queued again ===
const QUEUE_FILE = path.join(dataDir, 'queue.json');
let queueTimer = null;
function saveQueueSoon() {
  if (!IS_DESKTOP || queueTimer) return;
  queueTimer = setTimeout(() => {
    queueTimer = null;
    try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(pendingSpecs(jobs).slice(0, 1000))); } catch { /* not fatal */ }
  }, 1500);
}
function restoreQueue() {
  if (!IS_DESKTOP) return 0;
  let list = [];
  try { list = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch { return 0; }
  let n = 0;
  for (const s of Array.isArray(list) ? list.slice(0, 1000) : []) {
    if (!s || typeof s !== 'object' || !CLIENT_ID_RE.test(String(s.clientId)) || !jobs.canCreate(s.clientId)) continue;
    const title = typeof s.title === 'string' ? s.title.slice(0, 300) : null;
    const saveFolder = typeof s.saveFolder === 'string' && s.saveFolder ? safeFolderName(s.saveFolder) : null;
    if (createFromSpec(s.clientId, s, { title, priority: priorityOf(s.priority), paused: s.paused === true, saveFolder })) n += 1;
  }
  return n;
}
jobs.on('update', saveQueueSoon);
jobs.on('removed', saveQueueSoon);

app.post('/api/jobs/download', createLimiter, requireClient, async (req, res) => {
  const body = req.body || {};
  const opts = download.parseDownloadOptions(body);
  const invalid = download.validateOptions(opts);
  if (invalid) return res.status(400).json({ error: invalid });

  // Either links (urls) or picked results with their titles (items: search / playlist picker).
  const maxUrls = opts.playlist ? (IS_DESKTOP ? 10 : 3) : (IS_DESKTOP ? 300 : 20);
  // Songs of an imported Spotify / Apple Music list come as { query, title }:
  // the first YouTube result for it is downloaded.
  const raw = Array.isArray(body.items)
    ? body.items.slice(0, maxUrls).map((i) => ({
      url: i && typeof i.query === 'string' ? download.searchUrl(i.query) : i && i.url,
      title: i && typeof i.title === 'string' ? i.title.slice(0, 300) : null,
    }))
    : (Array.isArray(body.urls) ? body.urls.slice(0, maxUrls) : []).map((url) => ({ url, title: null }));
  const picked = [];
  const rejected = [];
  for (const entry of raw) {
    const url = download.isSearchUrl(entry.url) ? entry.url : download.normalizeMediaUrl(entry.url);
    if (url && !(opts.playlist && download.isSearchUrl(url))) picked.push({ url, title: entry.title }); else rejected.push(String(entry.url).slice(0, 200));
  }
  if (!picked.length) {
    return res.status(400).json({ error: 'Ningún enlace válido. Sitios soportados: YouTube, Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp y más.', rejected });
  }

  const items = [];
  if (opts.playlist && !playlistSlots.take()) return res.status(429).json(BUSY);
  try {
    for (const item of picked) {
      const expanded = opts.playlist ? await download.expandPlaylist(item.url, ytEnv()) : null;
      if (expanded && expanded.entries.length) {
        for (const entry of expanded.entries) items.push({ url: entry.url, title: entry.title || entry.url });
      } else {
        items.push(item);
      }
    }
  } finally {
    if (opts.playlist) playlistSlots.release();
  }
  if (!jobs.canCreate(req.clientId, items.length)) return res.status(429).json(TOO_MANY_JOBS);
  const created = queueDownloads(req.clientId, items, opts, { priority: priorityOf(body.priority) });
  res.json({ created, rejected });
});

// Only the picture of a video (its largest thumbnail).
app.post('/api/jobs/thumbnail', createLimiter, requireClient, (req, res) => {
  const body = req.body || {};
  const urls = (Array.isArray(body.urls) ? body.urls : [body.url]).slice(0, IS_DESKTOP ? 100 : 10).map((u) => download.normalizeMediaUrl(u)).filter(Boolean);
  if (!urls.length) return res.status(400).json({ error: 'Enlace no válido o sitio no soportado.' });
  if (!jobs.canCreate(req.clientId, urls.length)) return res.status(429).json(TOO_MANY_JOBS);
  let created = 0;
  for (const url of urls) if (createFromSpec(req.clientId, { kind: 'thumb', url, format: body.format }, { title: typeof body.title === 'string' && urls.length === 1 ? body.title.slice(0, 300) : null })) created += 1;
  res.json({ created });
});

// === Import a Spotify / Apple Music list (its songs, to look for on YouTube) ===
const importSlots = slots(2);
app.post('/api/import', infoLimiter, requireClient, async (req, res) => {
  if (!importSlots.take()) return res.status(429).json(BUSY);
  try {
    const list = await importlist.readImport((req.body || {}).url);
    res.json(list);
  } catch (err) {
    res.status(400).json({ error: err.message && err.message.length < 200 ? err.message : 'No se pudo leer esa lista.' });
  } finally {
    importSlots.release();
  }
});

const MAX_UPLOAD_SIZE = (IS_DESKTOP ? 4096 : 300) * 1024 * 1024;
// Reject uploads that are clearly not media before they ever reach ffmpeg.
// The client-supplied mimetype isn't trustworthy, and browsers are
// inconsistent for less common formats (some send 'application/octet-stream'
// even for a real .mkv) — so a generic mimetype is allowed through only when
// the extension matches a supported media format. See BUGLOG.md, revisión 5.
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  'mp3', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'wma', 'ac3', 'flac', 'wav', 'aiff', 'aif', 'amr', 'mka',
  'mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ogv', 'ts', 'mts', 'gif',
]);
const GENERIC_MIMETYPES = new Set(['application/octet-stream', 'application/x-matroska', '']);

// Still pictures a form may carry next to the media (the editor's logo).
const IMAGE_MIMETYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const uploader = (files, { imageFields = [] } = {}) => multer({
  // Browsers send the file name as UTF-8; multer's default (latin1) turned
  // "Canción.wav" into "CanciÃ³n.mp3".
  defParamCharset: 'utf8',
  // Inside this process's job folder: swept on the next start if the server
  // is killed mid-upload/conversion, instead of piling up in %TEMP%.
  dest: path.join(jobs.dir, 'uploads'),
  limits: { fileSize: MAX_UPLOAD_SIZE, files, fields: 30 },
  fileFilter: (req, file, cb) => {
    if (imageFields.includes(file.fieldname)) {
      const ext = (file.originalname.split('.').pop() || '').toLowerCase();
      return IMAGE_MIMETYPES.has(file.mimetype) && IMAGE_EXTENSIONS.has(ext) ? cb(null, true) : cb(new Error('INVALID_IMAGE_TYPE'));
    }
    // Animated GIFs are accepted as a video source (e.g. GIF -> MP4).
    const isMediaMime = /^(audio|video)\//.test(file.mimetype) || file.mimetype === 'image/gif';
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const isGenericButKnownExt = GENERIC_MIMETYPES.has(file.mimetype) && ALLOWED_UPLOAD_EXTENSIONS.has(ext);
    if (!isMediaMime && !isGenericButKnownExt) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});
const upload = uploader(1);
const uploadEdit = uploader(3, { imageFields: ['logo'] }).fields([{ name: 'file', maxCount: 1 }, { name: 'logo', maxCount: 1 }, { name: 'music', maxCount: 1 }]);
const MAX_TAG_FILES = IS_DESKTOP ? tags.MAX_FILES : 10;
const uploadTagsRead = uploader(MAX_TAG_FILES).array('files', MAX_TAG_FILES);
const uploadTags = uploader(MAX_TAG_FILES + 1, { imageFields: ['cover'] }).fields([{ name: 'files', maxCount: MAX_TAG_FILES }, { name: 'cover', maxCount: 1 }]);
const tagExt = (f) => (String(f.originalname).split('.').pop() || '').toLowerCase();
const MAX_MERGE_FILES = IS_DESKTOP ? convert.MAX_MERGE : 10;
const uploadMany = uploader(MAX_MERGE_FILES);

const nameOf = (file) => String(file.originalname || 'archivo').slice(0, 255);

/** Shared by the single-file endpoints: validates, then queues `makeRun(file)`. */
function singleUpload(req, res, { check, detail, makeRun, extraFiles = [] }) {
  const discard = () => { for (const f of [req.file, ...extraFiles]) if (f) fs.unlink(f.path, () => {}); };
  const problem = check(req.body || {});
  if (problem) {
    discard();
    return res.status(400).json({ error: problem });
  }
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  if (!jobs.canCreate(req.clientId)) {
    discard();
    return res.status(429).json(TOO_MANY_JOBS);
  }
  const job = jobs.create({
    clientId: req.clientId,
    type: 'convert',
    title: nameOf(req.file),
    detail: detail(req.body || {}),
    run: makeRun(req.file, req.body || {}),
    cleanupInput: discard,
  });
  res.json({ id: job.id });
}

app.post('/api/jobs/convert', createLimiter, requireClient, upload.single('file'), (req, res) => {
  const targetFormat = String((req.body || {}).targetFormat || '').toLowerCase();
  const format = convert.formatFor(targetFormat);
  singleUpload(req, res, {
    check: (body) => {
      if (!format) return 'Formato de destino no soportado.';
      const s = convert.parseTimestamp(body.trimStart);
      const e = convert.parseTimestamp(body.trimEnd);
      if (Number.isNaN(s) || Number.isNaN(e) || (s !== null && e !== null && e <= s)) {
        return 'Tiempo de recorte no válido. Usa segundos o mm:ss, y que "Hasta" sea mayor que "Desde".';
      }
      return null;
    },
    detail: (body) => convert.describeConvert(format.kind, format.config, body),
    makeRun: (file, body) => convert.runConvert({
      inputPath: file.path, originalName: nameOf(file), targetFormat, body, ffmpegPath: currentFfmpegPath(), hw: hwFor(),
    }),
  });
});

app.post('/api/jobs/compress', createLimiter, requireClient, upload.single('file'), (req, res) => {
  const targetMb = convert.parseTargetMb((req.body || {}).targetMb);
  singleUpload(req, res, {
    check: () => (targetMb ? null : 'Indica un tamaño entre 1 y 4000 MB.'),
    detail: () => `Comprimir a ${String(targetMb).replace('.', ',')} MB`,
    makeRun: (file) => convert.runCompress({ inputPath: file.path, originalName: nameOf(file), targetMb, ffmpegPath: currentFfmpegPath() }),
  });
});

app.post('/api/jobs/image', createLimiter, requireClient, upload.single('file'), (req, res) => {
  const targetFormat = String((req.body || {}).targetFormat || '').toLowerCase();
  singleUpload(req, res, {
    check: (body) => {
      if (!Object.prototype.hasOwnProperty.call(convert.IMAGE_FORMATS, targetFormat)) return 'Formato de imagen no soportado.';
      if (!['frame', 'cover'].includes(body.imageMode)) return 'Elige fotograma o carátula.';
      if (body.imageMode === 'frame' && Number.isNaN(convert.parseTimestamp(body.time))) return 'Momento no válido. Usa segundos o mm:ss.';
      return null;
    },
    detail: (body) => `${convert.IMAGE_FORMATS[targetFormat].label} · ${body.imageMode === 'cover' ? 'carátula' : `fotograma ${body.time || '0'}`}`,
    makeRun: (file, body) => convert.runImage({ inputPath: file.path, originalName: nameOf(file), targetFormat, body, ffmpegPath: currentFfmpegPath() }),
  });
});

app.post('/api/jobs/edit', createLimiter, requireClient, uploadEdit, (req, res) => {
  req.file = (req.files && req.files.file && req.files.file[0]) || null;
  const logo = (req.files && req.files.logo && req.files.logo[0]) || null;
  const music = (req.files && req.files.music && req.files.music[0]) || null;
  const body = req.body || {};
  const targetFormat = String(body.targetFormat || '').toLowerCase();
  const mode = body.mode === 'fast' ? 'fast' : 'exact';
  const segments = convert.parseSegments(body.segments);
  const fx = convert.parseEditEffects(body);
  const animated = Object.prototype.hasOwnProperty.call(convert.EDIT_ANIMATED, targetFormat) ? convert.EDIT_ANIMATED[targetFormat] : null;
  singleUpload(req, res, {
    extraFiles: [logo, music],
    check: () => {
      if (!segments) return 'Tramos no válidos.';
      if (fx.music && !music) return 'Falta el archivo de la música de fondo.';
      if (fx.captions && !whisper.status().available) return 'Para los subtítulos automáticos, instala primero el motor en Ajustes → Conversión.';
      if (body.reframe && fx.aspect && !fx.reframe) return 'Encuadre no válido.';
      if (targetFormat !== 'original' && !animated && (!convert.formatFor(targetFormat) || targetFormat === 'gif')) return 'Formato de destino no soportado.';
      if (mode === 'fast' && targetFormat !== 'original') return 'El modo rápido solo funciona con el formato original.';
      if (!fx.texts) return 'Textos no válidos: hasta 5, de hasta 200 caracteres y 3 líneas.';
      if (fx.logo && !logo) return 'Falta la imagen del logo.';
      if (logo && logo.size > MAX_IMAGE_SIZE) return 'El logo es demasiado grande (máx. 5 MB).';
      if (mode === 'fast' && convert.needsEncoding(fx, segments)) return 'Velocidad, texto, logo, ruido, fundidos, volumen, formato de pantalla y girar necesitan cortes exactos.';
      return null;
    },
    detail: () => {
      const kept = Math.round(segments.reduce((acc, [s, e, speed]) => acc + (e - s) / speed, 0));
      const label = targetFormat === 'original' ? 'original' : animated ? animated.label : convert.formatFor(targetFormat).config.label;
      const clock = `${Math.floor(kept / 60)}:${String(kept % 60).padStart(2, '0')}`;
      const extras = [
        fx.separate && segments.length > 1 ? 'por separado' : '',
        segments.some((sg) => sg[2] !== 1) ? 'velocidad' : '',
        fx.texts && fx.texts.length ? 'texto' : '',
        fx.logo ? 'logo' : '',
        fx.denoise ? 'sin ruido' : '',
        fx.fade ? 'fundidos' : '',
        fx.volume === 0 ? 'sin sonido' : fx.volume !== null ? `volumen ${Math.round(fx.volume * 100)} %` : '',
        fx.aspects.length ? fx.aspects.join(' + ') : (fx.aspect || ''),
        fx.reframe ? 'encuadre automático' : '',
        fx.rotate ? 'girado' : '',
        fx.music ? 'música de fondo' : '',
        fx.captions ? 'subtítulos' : '',
        mode === 'fast' ? 'rápido' : '',
      ].filter(Boolean);
      return [`Editar · ${segments.length} ${segments.length === 1 ? 'tramo' : 'tramos'} · ${clock} · ${label}`, ...extras].join(' · ');
    },
    makeRun: (file, b) => convert.runEdit({
      inputPath: file.path, originalName: nameOf(file), segments, targetFormat, mode, body: b, ffmpegPath: currentFfmpegPath(), hw: hwFor(),
      logoPath: fx.logo && logo ? logo.path : null,
      musicPath: fx.music && music ? music.path : null,
    }),
  });
});

// === Convertir → Subtítulos (Whisper, on this computer) ===
app.post('/api/jobs/transcribe', createLimiter, requireClient, upload.single('file'), (req, res) => {
  const LANG_NAMES = { auto: 'idioma automático', es: 'español', en: 'inglés' };
  singleUpload(req, res, {
    check: (body) => {
      if (!whisper.status().available) return 'Instala primero el motor de subtítulos en Ajustes → Conversión.';
      if (!whisper.OUTPUTS.includes(body.output)) return 'Elige qué quieres: .srt, texto o vídeo con subtítulos.';
      return null;
    },
    detail: (body) => ['Subtítulos', LANG_NAMES[body.lang] || body.lang, { srt: '.srt', txt: 'texto', burn: 'en el vídeo', both: 'vídeo + .srt' }[body.output],
      body.translate === 'true' ? 'traducidos al inglés' : ''].filter(Boolean).join(' · '),
    makeRun: (file, body) => whisper.runTranscribe({ inputPath: file.path, originalName: nameOf(file), body, ffmpegPath: currentFfmpegPath(), hw: hwFor() }),
  });
});

// === Editor helpers: scene changes, tempo and key (answered right away) ===
const analyzeSlots = slots(IS_DESKTOP ? 2 : 1);
app.post('/api/analyze/scenes', infoLimiter, requireClient, upload.single('file'), async (req, res) => {
  const file = req.file;
  const discard = () => { if (file) fs.unlink(file.path, () => {}); };
  if (!file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  if (!analyzeSlots.take()) { discard(); return res.status(429).json(BUSY); }
  let proc = null;
  req.on('close', () => { if (!res.writableEnded && proc) proc.kill(); });
  try {
    const times = await convert.detectScenes(currentFfmpegPath(), file.path, { setProcess: (p) => { proc = p; } });
    res.json({ times });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    analyzeSlots.release();
    discard();
  }
});

// Best moments (loudest, busiest stretches) for a summary or a short.
app.post('/api/analyze/highlights', infoLimiter, requireClient, upload.single('file'), async (req, res) => {
  const file = req.file;
  const discard = () => { if (file) fs.unlink(file.path, () => {}); };
  if (!file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  if (!analyzeSlots.take()) { discard(); return res.status(429).json(BUSY); }
  let proc = null;
  req.on('close', () => { if (!res.writableEnded && proc) proc.kill(); });
  const clip = Math.min(60, Math.max(3, Math.round(Number((req.body || {}).clip) || 10)));
  const count = Math.min(20, Math.max(1, Math.round(Number((req.body || {}).count) || 5)));
  try {
    res.json({ moments: await detectHighlights(currentFfmpegPath(), file.path, { clip, count, setProcess: (p) => { proc = p; } }) });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    analyzeSlots.release();
    discard();
  }
});

// Tags from MusicBrainz (by the sound with an AcoustID key, else by title and artist).
const uploadIdentify = uploader(MAX_TAG_FILES).array('files', MAX_TAG_FILES);
app.post('/api/tags/identify', infoLimiter, requireClient, uploadIdentify, async (req, res) => {
  const files = req.files || [];
  const discard = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  if (!files.length) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  let hints = [];
  try { hints = JSON.parse(String((req.body || {}).hints || '[]')); } catch { hints = []; }
  if (!Array.isArray(hints)) hints = [];
  if (!analyzeSlots.take()) { discard(); return res.status(429).json(BUSY); }
  try {
    const out = [];
    for (let i = 0; i < files.length; i++) {
      const h = hints[i] && typeof hints[i] === 'object' ? hints[i] : {};
      const str = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');
      let duration = null;
      try { duration = (await convert.probe(currentFfmpegPath(), files[i].path) || {}).duration || null; } catch { /* unknown */ }
      try {
        out.push(await musicbrainz.identify({
          file: files[i].path, hints: { title: str(h.title), artist: str(h.artist), duration }, key: IS_DESKTOP ? config.acoustidKey || null : null, fpcalcPath: fpcalcPath(), ffmpegPath: currentFfmpegPath(),
        }));
      } catch (err) {
        if (/clave/.test(err.message)) return res.status(400).json({ error: err.message });
        out.push(null);
      }
    }
    res.json({ results: out });
  } finally {
    analyzeSlots.release();
    discard();
  }
});
app.get('/api/tags/coverart', infoLimiter, requireClient, async (req, res) => {
  const art = await musicbrainz.coverArt(String(req.query.release || ''));
  if (!art) return res.status(404).json({ error: 'Ese disco no tiene carátula.' });
  res.set({ 'Content-Type': art.type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.end(art.data);
});

app.post('/api/tags/analyze', infoLimiter, requireClient, uploadTagsRead, async (req, res) => {
  const files = req.files || [];
  const discard = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  if (!files.length) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  if (!analyzeSlots.take()) { discard(); return res.status(429).json(BUSY); }
  try {
    const out = [];
    for (const f of files) {
      try { out.push(await require('./lib/analysis').analyzeFile(currentFfmpegPath(), f.path)); } catch { out.push({ bpm: null, key: null, camelot: null }); }
    }
    res.json({ results: out });
  } finally {
    analyzeSlots.release();
    discard();
  }
});

// === Tag editor ===
// Reads the tags of the chosen songs (nothing is kept: the files are deleted right away).
app.post('/api/tags/read', infoLimiter, requireClient, uploadTagsRead, async (req, res) => {
  const files = req.files || [];
  const discard = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  try {
    if (!files.length) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    if (files.some((f) => !tags.TAG_FORMATS.has(tagExt(f)))) return res.status(400).json({ error: 'Las etiquetas solo se pueden editar en MP3, M4A, FLAC, OGG y OPUS.' });
    const list = [];
    for (const f of files) list.push(await tags.readTags(currentFfmpegPath(), f.path, nameOf(f)));
    return res.json({ files: list });
  } catch {
    return res.status(500).json({ error: 'No se pudieron leer las etiquetas.' });
  } finally {
    discard();
  }
});

app.post('/api/jobs/tags', createLimiter, requireClient, uploadTags, (req, res) => {
  const files = (req.files && req.files.files) || [];
  const cover = (req.files && req.files.cover && req.files.cover[0]) || null;
  const discard = () => [...files, cover].forEach((f) => { if (f) fs.unlink(f.path, () => {}); });
  const body = req.body || {};
  const fail = (status, error) => { discard(); return res.status(status).json({ error }); };
  if (!files.length) return fail(400, 'No se recibió ningún archivo.');
  if (files.some((f) => !tags.TAG_FORMATS.has(tagExt(f)))) return fail(400, 'Las etiquetas solo se pueden editar en MP3, M4A, FLAC, OGG y OPUS.');
  const tagList = tags.parseTagList(body.tags, files.length);
  if (!tagList) return fail(400, 'Etiquetas no válidas.');
  if (cover && cover.size > MAX_IMAGE_SIZE) return fail(400, 'La carátula es demasiado grande (máx. 5 MB).');
  if (!jobs.canCreate(req.clientId)) return fail(429, TOO_MANY_JOBS.error);
  const inputs = files.map((f) => ({ path: f.path, name: nameOf(f) }));
  const albums = [...new Set(tagList.map((t) => t.album).filter(Boolean))];
  const extras = [cover ? 'carátula' : '', body.lyrics === 'true' ? 'letras' : '', body.rename === 'true' ? 'renombrar' : ''].filter(Boolean);
  const job = jobs.create({
    clientId: req.clientId,
    type: 'convert',
    title: albums.length === 1 ? albums[0] : inputs.length === 1 ? inputs[0].name : `${inputs[0].name} + ${inputs.length - 1} más`,
    detail: [`Etiquetas · ${inputs.length} ${inputs.length === 1 ? 'archivo' : 'archivos'}`, ...extras].join(' · '),
    run: tags.runTags({
      inputs, tagList, coverPath: cover ? cover.path : null, rename: body.rename === 'true', lyrics: body.lyrics === 'true', ffmpegPath: currentFfmpegPath(),
    }),
    cleanupInput: discard,
  });
  return res.json({ id: job.id });
});

// === Scheduled downloads (desktop only: in a shared web instance one visitor
// must not be able to hold everybody's queue) ===
app.get('/api/schedule', (req, res) => {
  if (!IS_DESKTOP) return res.status(404).json({ error: 'Solo en la app de escritorio.' });
  res.json({ until: jobs.holdUntil });
});
app.post('/api/schedule', (req, res) => {
  if (!IS_DESKTOP) return res.status(404).json({ error: 'Solo en la app de escritorio.' });
  const at = (req.body || {}).at;
  if (at === null || at === '') return res.json({ until: jobs.setHold(null) });
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(at));
  if (!m) return res.status(400).json({ error: 'Hora no válida (hh:mm).' });
  // The next time the clock shows hh:mm: today, or tomorrow if it has passed.
  const when = new Date();
  when.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
  res.json({ until: jobs.setHold(when.getTime()) });
});

// === Library & sharing to a phone (desktop app only) ===
// The download folder is the one the desktop app saves into: read from its
// settings every time (so a new folder applies at once), never from a request.
function libraryRoot() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(process.env.TUBEGRAB_DATA_DIR || '', 'settings.json'), 'utf8'));
    if (isLocalFolderPath(settings.downloadDir)) return settings.downloadDir;
  } catch { /* no settings yet: the default folder */ }
  const fallback = process.env.TUBEGRAB_DEFAULT_DOWNLOADS;
  return isLocalFolderPath(fallback) ? fallback : null;
}
const library = new Library({
  rootFn: libraryRoot,
  metaFile: IS_DESKTOP && process.env.TUBEGRAB_DATA_DIR ? path.join(process.env.TUBEGRAB_DATA_DIR, 'library.json') : null,
  playlistsFile: IS_DESKTOP && process.env.TUBEGRAB_DATA_DIR ? path.join(process.env.TUBEGRAB_DATA_DIR, 'playlists.json') : null,
});
const shares = new ShareServer();
const requireDesktop = (req, res, next) => (IS_DESKTOP ? next() : res.status(404).json({ error: 'Solo en la app de escritorio.' }));

app.get('/api/library', requireDesktop, requireClient, infoLimiter, (req, res) => {
  const { files, truncated } = library.scan();
  res.json({ files, truncated });
});

app.post('/api/library/meta', requireDesktop, requireClient, createLimiter, (req, res) => {
  const body = req.body || {};
  const meta = library.setMeta(body.id, { fav: body.fav, rating: body.rating, played: body.played === true });
  if (!meta) return res.status(404).json({ error: 'No se encuentra el archivo.' });
  return res.json(meta);
});

// Lyrics for the player: the synced .lrc next to the song, else the words in
// its tags, else (when asked, v3.8) LRCLIB by the song's artist and title,
// like a song from YouTube.
// === Revisar la biblioteca (desktop): low quality, missing tags, covers or lyrics, albums with songs missing ===
const { LibInfo, issuesOf } = require('./lib/libinfo');
const SAFE_IN = ['-protocol_whitelist', 'file', '-format_whitelist', convert.INPUT_DEMUXERS];
const libInfo = IS_DESKTOP ? new LibInfo(path.join(dataDir, 'library-info.json'), { ffmpegPath: () => currentFfmpegPath(), safeInput: SAFE_IN }) : null;
const libEntry = (id) => (/^[a-f0-9]{32}$/.test(String(id)) ? (library.lastFiles || []).find((f) => f.id === id) || null : null);
// "(Official Video)", "[4K Remaster]"…: not part of the song's name.
const NAME_NOISE = /\s*[([][^)\]]*\b(official|oficial|video|v[ií]deo|audio|lyrics?|letra|visuali[sz]er|hd|4k|remaster(ed)?|mv)\b[^)\]]*[)\]]/gi;
/**
 * The song's artist and name, to look it up: from its tags, or its file name.
 * A download without music mode has the video's title ("Artist - Song (Official
 * Video)") as its title and the channel ("Queen Official") as its artist.
 */
function songNames(f, info) {
  const base = f.name.replace(/\.[^.]+$/, '').replace(/\s*\[[\w-]{6,}\]$/, '').replace(/^\d{1,3}[\s.\-_]+/, '');
  let artist = (info && info.artist) || '';
  let title = ((info && info.title) || base).replace(NAME_NOISE, '').trim();
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title);
  if (m) { artist = m[1].trim(); title = m[2].trim(); }
  artist = artist.replace(/\s*-\s*Topic$/i, '').replace(/\s*VEVO$/i, '').replace(/\s+Official$/i, '').trim();
  title = title.replace(/\s+(ft\.?|feat\.?|featuring)\s.+$/i, '').trim();
  return { artist, title, album: (info && info.album) || '' };
}
app.get('/api/library/review', requireDesktop, requireClient, infoLimiter, (req, res) => {
  if (!library.lastFiles || !library.lastFiles.length) library.scan();
  const audio = (library.lastFiles || []).filter((f) => f.kind === 'audio');
  if (!libInfo.running) libInfo.refresh(audio.map((f) => ({ ...f, full: library.resolve(f.id) })).filter((f) => f.full));
  const files = [];
  for (const f of audio) {
    const info = libInfo.get(f);
    if (!info) continue;
    files.push({
      id: f.id, name: f.name, size: f.size, issues: issuesOf(info, f), bitrate: info.bitrate, codec: info.codec, duration: info.duration,
      artist: info.artist, title: info.title, album: info.album, albumArtist: info.albumArtist, track: info.track, source: Boolean(info.source),
      label: ((n) => (n.artist ? `${n.artist} - ${n.title}` : n.title))(songNames(f, info)),
    });
  }
  res.json({ indexing: Boolean(libInfo.running), done: libInfo.progress.done, total: libInfo.progress.total, files });
});
const reviewIds = (b, max) => (Array.isArray(b && b.ids) ? [...new Set(b.ids.filter((x) => /^[a-f0-9]{32}$/.test(String(x))))].slice(0, max) : []);
let fixing = false; // one fixing round at a time (they rewrite files)
async function oneAtATime(res, fn) {
  if (fixing) return res.status(429).json({ error: 'Ya se están arreglando canciones; espera a que acabe.' });
  fixing = true;
  try { res.json(await fn()); } catch (err) { res.status(500).json({ error: err.message }); } finally { fixing = false; }
}
// Lyrics for songs without them (LRCLIB), written into the file (+ .lrc when synced).
app.post('/api/library/review/lyrics', requireDesktop, requireClient, createLimiter, (req, res) => {
  const ids = reviewIds(req.body, 10);
  if (!ids.length) return res.status(400).json({ error: 'No hay canciones que revisar.' });
  oneAtATime(res, async () => {
    let done = 0;
    let missing = 0;
    for (const id of ids) {
      const f = libEntry(id);
      const file = f && library.resolve(id);
      if (!file) { missing++; continue; }
      const info = libInfo.get(f);
      const n = songNames(f, info);
      try {
        await tags.addLyrics({ ffmpegPath: currentFfmpegPath(), file, artist: n.artist, title: n.title, album: n.album, duration: info && info.duration });
        const after = fs.existsSync(file.slice(0, file.length - path.extname(file).length) + '.lrc');
        libInfo.forget(f.rel);
        if (after || (await tags.readTags(currentFfmpegPath(), file, f.name).catch(() => null) || { tags: {} }).tags.lyrics) done++; else missing++;
      } catch { missing++; }
    }
    library.scan();
    return { done, missing };
  });
});
// Artist, title, album, year, track and the cover from MusicBrainz, written into the file.
app.post('/api/library/review/fix', requireDesktop, requireClient, createLimiter, (req, res) => {
  const ids = reviewIds(req.body, 10);
  if (!ids.length) return res.status(400).json({ error: 'No hay canciones que revisar.' });
  oneAtATime(res, async () => {
    let done = 0;
    let missing = 0;
    for (const id of ids) {
      const f = libEntry(id);
      const file = f && library.resolve(id);
      if (!file) { missing++; continue; }
      const info = libInfo.get(f);
      const n = songNames(f, info);
      let found = null;
      try { found = await musicbrainz.byName({ title: n.title, artist: n.artist, duration: info && info.duration }); } catch { found = null; }
      if (!found || !found.title) { missing++; continue; }
      // Only that very song: same length (a live or another cut lasts something else).
      const len = found.length || await musicbrainz.recordingLength(found.recordingId).catch(() => null);
      if (!info || !info.duration || !len || Math.abs(len - info.duration) > 15) { missing++; continue; }
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!tags.TAG_FORMATS.has(ext)) { missing++; continue; }
      // Only what it doesn't have yet (what you wrote yourself stays).
      const newTags = {};
      for (const k of ['artist', 'title', 'album', 'album_artist', 'date', 'track']) {
        const mine = info ? { artist: info.artist, title: info.title, album: info.album, album_artist: info.albumArtist, track: info.track }[k] : '';
        if (!mine && found[k]) newTags[k] = String(found[k]).slice(0, 300);
      }
      let cover = null;
      if (info && !info.cover && found.releaseId && tags.COVER_FORMATS.has(ext)) {
        const art = await musicbrainz.coverArt(found.releaseId).catch(() => null);
        if (art) { cover = path.join(os.tmpdir(), `tg-cover-${crypto.randomBytes(6).toString('hex')}.${art.type === 'image/png' ? 'png' : 'jpg'}`); fs.writeFileSync(cover, art.data); }
      }
      if (!Object.keys(newTags).length && !cover) { missing++; continue; }
      const tmp = path.join(path.dirname(file), `.tg-fix-${crypto.randomBytes(4).toString('hex')}.${ext}`);
      try {
        await tags.writeTags({ ffmpegPath: currentFfmpegPath(), inputPath: file, ext, tags: newTags, coverPath: cover, out: tmp });
        // The new one has to be the same song (same length) before it replaces the old one.
        const a = await convert.probe(currentFfmpegPath(), tmp);
        const b = await convert.probe(currentFfmpegPath(), file);
        if (!a || !a.ok || !b || Math.abs((a.duration || 0) - (b.duration || 0)) > 1.5) throw new Error('bad');
        fs.renameSync(tmp, file);
        libInfo.forget(f.rel);
        done++;
      } catch { missing++; } finally {
        fs.rmSync(tmp, { force: true });
        if (cover) fs.rmSync(cover, { force: true });
      }
    }
    library.scan();
    return { done, missing };
  });
});
// Low quality: the same song again from where it came from (or found by name), as good as YouTube has it.
app.post('/api/library/review/upgrade', requireDesktop, requireClient, createLimiter, (req, res) => {
  const ids = reviewIds(req.body, 100);
  const b = req.body || {};
  const opts = download.parseDownloadOptions({ ...(b.opts && typeof b.opts === 'object' ? b.opts : {}), mode: 'audio', audioBitrate: '320', playlist: false, chapters: false, sectionStart: '', sectionEnd: '', live: false });
  const invalid = download.validateOptions(opts);
  if (invalid) return res.status(400).json({ error: invalid });
  const items = [];
  for (const id of ids) {
    const f = libEntry(id);
    const info = f ? libInfo.get(f) : null;
    if (!f) continue;
    const n = songNames(f, info);
    const from = info && info.source ? download.normalizeMediaUrl(info.source) : null;
    const url = from || download.searchUrl(n.artist ? `${n.artist} - ${n.title}` : n.title);
    if (url) items.push({ url, title: n.artist ? `${n.artist} - ${n.title}` : n.title });
  }
  if (!items.length) return res.status(400).json({ error: 'No hay canciones que revisar.' });
  if (!jobs.canCreate(req.clientId, items.length)) return res.status(429).json(TOO_MANY_JOBS);
  res.json({ queued: queueDownloads(req.clientId, items, opts) });
});
// An album: its songs on MusicBrainz, and which of them you have.
app.post('/api/library/review/album', requireDesktop, requireClient, infoLimiter, async (req, res) => {
  const b = req.body || {};
  const artist = String(b.artist || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  const album = String(b.album || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  if (!artist || !album) return res.status(400).json({ error: 'Falta el artista o el álbum.' });
  let found = null;
  try { found = await musicbrainz.albumTracks({ artist, album }); } catch (err) { return res.status(502).json({ error: err.message }); }
  if (!found) return res.status(404).json({ error: 'No se encuentra ese álbum en MusicBrainz.' });
  const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*[([][^)\]]*[)\]]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const mine = new Set();
  for (const f of (library.lastFiles || []).filter((x) => x.kind === 'audio')) {
    const info = libInfo.get(f);
    if (info && fold(info.album) === fold(album)) mine.add(fold(info.title || songNames(f, info).title));
  }
  res.json({ release: found.release, tracks: found.tracks.map((t) => ({ ...t, have: mine.has(fold(t.title)) })) });
});

// The chapters of a long file (audiobooks, courses): read once per version of the file.
const chapterCache = new Map(); // full path -> { mtime, chapters }
app.get('/api/library/chapters', requireDesktop, requireClient, infoLimiter, async (req, res) => {
  const file = library.resolve(req.query.id);
  if (!file) return res.status(404).json({ error: 'No se encuentra el archivo.' });
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { return res.status(404).json({ error: 'No se encuentra el archivo.' }); }
  const hit = chapterCache.get(file);
  if (hit && hit.mtime === mtime) return res.json({ chapters: hit.chapters });
  const chapters = await require('./lib/chapters').readChapters(currentFfmpegPath(), file, ['-protocol_whitelist', 'file', '-format_whitelist', convert.INPUT_DEMUXERS]);
  chapterCache.set(file, { mtime, chapters });
  if (chapterCache.size > 300) chapterCache.delete(chapterCache.keys().next().value);
  res.json({ chapters });
});
const onlineLyrics = new Map(); // full path -> { synced, plain, duration } | null
app.get('/api/library/lyrics', requireDesktop, requireClient, infoLimiter, async (req, res) => {
  const file = library.resolve(req.query.id);
  if (!file) return res.status(404).json({ error: 'No se encuentra el archivo.' });
  const synced = library.syncedLyrics(req.query.id);
  if (synced && synced.length) return res.json({ synced, plain: null });
  let t = null;
  try { t = await tags.readTags(currentFfmpegPath(), file, path.basename(file)); } catch { t = null; }
  if (t && t.tags.lyrics) return res.json({ synced: null, plain: t.tags.lyrics });
  if (req.query.online !== '1') return res.json({ synced: null, plain: null });
  if (onlineLyrics.has(file)) return res.json(onlineLyrics.get(file) || { synced: null, plain: null });
  // Artist and title from the tags, else from "Artist - Title.mp3".
  const base = path.basename(file).replace(/\.[^.]+$/, '').replace(/\s*\[[\w-]{6,}\]$/, '').replace(/^\d{1,3}[\s.\-_]+/, '');
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
  const artist = ((t && t.tags.artist) || (m ? m[1] : '')).split(/[,;&]/)[0].trim();
  const title = (t && t.tags.title) || (m ? m[2] : '');
  if (!artist || !title) return res.json({ synced: null, plain: null });
  try {
    const { findLyrics } = require('./lib/lyrics');
    const d = t && Number(t.duration) > 0 ? Number(t.duration) : null;
    const found = await findLyrics({ artist, title, album: t && t.tags.album, duration: d }) || await findLyrics({ artist, title });
    const lrc = found && found.synced ? require('./lib/library').parseLrc(found.synced) : null;
    const out = found ? { synced: lrc && lrc.length ? lrc : null, plain: found.plain || null, duration: found.duration || null, online: true } : null;
    onlineLyrics.set(file, out);
    if (onlineLyrics.size > 500) onlineLyrics.delete(onlineLyrics.keys().next().value);
    return res.json(out || { synced: null, plain: null });
  } catch {
    // No connection: asked again next time.
    return res.json({ synced: null, plain: null });
  }
});

// The lyrics in your language, line by line (the player's "Traducir").
const { Translator, cleanLines, LANGS: TR_LANGS } = require('./lib/translate');
const translator = IS_DESKTOP ? new Translator({ file: path.join(dataDir, 'lyrics-translations.json') }) : null;
const translateSlots = slots(2);
app.post('/api/lyrics/translate', requireDesktop, requireClient, infoLimiter, async (req, res) => {
  const body = req.body || {};
  const lines = cleanLines(body.lines);
  if (!lines) return res.status(400).json({ error: 'Letra no válida.' });
  if (!TR_LANGS.includes(body.to)) return res.status(400).json({ error: 'Idioma no válido.' });
  if (!translateSlots.take()) return res.status(429).json(BUSY);
  try {
    return res.json(await translator.translate(lines, body.to));
  } catch (err) {
    return res.status(502).json({ error: `No se pudo traducir: ${err.message && err.message.length < 150 ? err.message : 'sin conexión'}` });
  } finally { translateSlots.release(); }
});

// Cover art of a song (its embedded picture), small, for the player.
const covers = new Map(); // id -> Buffer | null
// A few ffmpeg processes at most, however many covers the page asks for.
const coverSlots = slots(2);
app.get('/api/library/cover', requireDesktop, requireClient, async (req, res) => {
  const id = String(req.query.id || '');
  const file = library.resolve(id);
  if (!file) return res.status(404).end();
  let jpg = covers.get(id);
  if (jpg === undefined) {
    if (!coverSlots.take()) return res.status(429).end();
    jpg = await new Promise((resolve) => {
      const p = require('child_process').spawn(currentFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file', '-format_whitelist', convert.INPUT_DEMUXERS,
        '-i', file, '-map', '0:v:0', '-frames:v', '1', '-vf', "scale='min(400,iw)':-2", '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1'], { windowsHide: true });
      const chunks = [];
      let size = 0;
      p.stdout.on('data', (c) => { size += c.length; if (size < 2 * 1024 * 1024) chunks.push(c); });
      p.stderr.resume();
      const timer = setTimeout(() => p.kill(), 15000);
      p.on('error', () => { clearTimeout(timer); resolve(null); });
      p.on('close', (code) => { clearTimeout(timer); resolve(code === 0 && size && size < 2 * 1024 * 1024 ? Buffer.concat(chunks) : null); });
    }).finally(() => coverSlots.release());
    covers.set(id, jpg);
    if (covers.size > 300) covers.delete(covers.keys().next().value);
  }
  if (!jpg) return res.status(404).end();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  return res.end(jpg);
});

// The subtitles next to a video, as WebVTT for the player.
app.get('/api/library/subs', requireDesktop, requireClient, (req, res) => {
  const list = library.subtitlesFor(req.query.id);
  if (req.query.n === undefined) return res.json({ tracks: list.map((s, n) => ({ n, lang: s.lang, kind: s.kind })) });
  const s = /^\d{1,2}$/.test(String(req.query.n)) ? list[Number(req.query.n)] : null;
  if (!s) return res.status(404).end();
  let text;
  try { text = fs.readFileSync(s.path, 'utf8'); } catch { return res.status(404).end(); }
  res.set({ 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  return res.end(s.kind === 'vtt' ? text : srtToVtt(text));
});

// Songs by a line of their lyrics (the words are indexed in the background, once).
const LYRICS_INDEX = IS_DESKTOP ? path.join(dataDir, 'lyrics-index.json') : null;
app.get('/api/library/lyrics-search', requireDesktop, requireClient, infoLimiter, (req, res) => {
  if (!library.lastFiles.length) library.scan();
  const progress = library.indexLyrics(async (file) => (await tags.readTags(currentFfmpegPath(), file, path.basename(file))).tags.lyrics || '', LYRICS_INDEX);
  res.json({ ...progress, results: library.searchLyrics(String(req.query.q || '').slice(0, 100)) });
});

// Several songs to a phone at once (a list, a selection): one QR.
app.post('/api/library/share-many', requireDesktop, requireClient, createLimiter, async (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.slice(0, MAX_BATCH) : [];
  const files = ids.map((id) => library.resolve(id)).filter(Boolean).map((p) => ({ path: p, name: path.basename(p) }));
  if (!files.length) return res.status(404).json({ error: 'No se encuentran esos archivos.' });
  try {
    const share = await shares.shareMany(files, String((req.body || {}).title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120) || 'TubeGrab');
    const qr = qrcode(0, 'M');
    qr.addData(share.url);
    qr.make();
    res.json({ ...share, qr: `data:image/svg+xml;base64,${Buffer.from(qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true })).toString('base64')}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/library/duplicates', requireDesktop, requireClient, infoLimiter, (req, res) => {
  library.scan();
  res.json({ groups: library.duplicates() });
});

// Own playlists.
const PL_ID = /^[a-f0-9]{16}$/;
app.get('/api/library/playlists', requireDesktop, requireClient, (req, res) => res.json({ playlists: library.listPlaylists() }));
app.post('/api/library/playlists', requireDesktop, requireClient, createLimiter, (req, res) => {
  try {
    const p = library.createPlaylist((req.body || {}).name);
    const add = (req.body || {}).add;
    if (Array.isArray(add)) library.updatePlaylist(p.id, { add });
    res.json({ playlists: library.listPlaylists(), id: p.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/library/playlists/:id', requireDesktop, requireClient, createLimiter, (req, res) => {
  if (!PL_ID.test(req.params.id) || !library.updatePlaylist(req.params.id, req.body || {})) return res.status(404).json({ error: 'No se encuentra esa lista.' });
  res.json({ playlists: library.listPlaylists() });
});
app.delete('/api/library/playlists/:id', requireDesktop, requireClient, (req, res) => {
  library.removePlaylist(String(req.params.id));
  res.json({ playlists: library.listPlaylists() });
});
app.post('/api/library/playlists/:id/export', requireDesktop, requireClient, createLimiter, (req, res) => {
  const name = PL_ID.test(req.params.id) ? library.exportPlaylist(req.params.id) : null;
  if (!name) return res.status(404).json({ error: 'No se encuentra esa lista.' });
  res.json({ file: name });
});

// === Play on the TV (Chromecast / DLNA), from the library ===
const caster = IS_DESKTOP ? new CastManager({
  lanAddressFn: lanAddress,
  share: (file, name) => shares.share(file, path.basename(file), { stream: true }).then((s) => ({ ...s, name })),
  unshare: (token) => shares.unshare(token),
}) : null;
app.get('/api/cast', requireDesktop, requireClient, (req, res) => res.json(caster.state()));
app.post('/api/cast/devices', requireDesktop, requireClient, infoLimiter, async (req, res) => {
  try { res.json({ devices: await caster.discover() }); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/cast/play', requireDesktop, requireClient, createLimiter, async (req, res) => {
  const body = req.body || {};
  const file = library.resolve(body.id);
  if (!file) return res.status(404).json({ error: 'No se encuentra el archivo.' });
  try {
    res.json(await caster.play(body.device, file, path.basename(file).replace(/\.[^.]+$/, '')));
  } catch (err) {
    res.status(502).json({ error: err && err.message && err.message.length < 200 ? err.message : 'La tele no respondió.' });
  }
});
app.post('/api/cast/control', requireDesktop, requireClient, async (req, res) => {
  const { action, value } = req.body || {};
  if (!['pause', 'resume', 'stop', 'seek'].includes(action)) return res.status(400).json({ error: 'Acción no válida.' });
  try { res.json(await caster.control(action, Number(value))); } catch (err) { res.status(409).json({ error: err.message }); }
});

app.get('/api/library/file', requireDesktop, requireClient, (req, res) => {
  const file = library.resolve(req.query.id);
  if (!file) return res.status(404).json({ error: 'No se encuentra el archivo.' });
  // sendFile answers Range requests, so the player can seek.
  return res.sendFile(file, { dotfiles: 'deny', headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

app.post('/api/library/share', requireDesktop, requireClient, createLimiter, async (req, res) => {
  const file = library.resolve((req.body || {}).id);
  if (!file) return res.status(404).json({ error: 'No se encuentra el archivo.' });
  try {
    const share = await shares.share(file, path.basename(file));
    const qr = qrcode(0, 'M');
    qr.addData(share.url);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
    return res.json({ ...share, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/library/share/:token', requireDesktop, requireClient, (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.token)) return res.status(400).json({ error: 'Enlace no válido.' });
  shares.unshare(req.params.token);
  return res.json({ ok: true });
});

// === Download profiles and rules (kept on disk by the desktop app; in
// memory, per visitor, on a web instance) ===
const profiles = new ProfileStore({ file: IS_DESKTOP ? path.join(dataDir, 'profiles.json') : null });
const PROFILE_ID = /^[a-f0-9]{16}$/;
app.get('/api/profiles', requireClient, (req, res) => res.json(profiles.list(req.clientId)));
app.post('/api/profiles', createLimiter, requireClient, (req, res) => {
  try { profiles.saveProfile(req.clientId, req.body || {}); res.json(profiles.list(req.clientId)); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/profiles/:id', requireClient, (req, res) => {
  if (PROFILE_ID.test(req.params.id)) profiles.removeProfile(req.clientId, req.params.id);
  res.json(profiles.list(req.clientId));
});
app.post('/api/rules', createLimiter, requireClient, (req, res) => {
  try { profiles.saveRule(req.clientId, req.body || {}); res.json(profiles.list(req.clientId)); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/rules/:id', requireClient, (req, res) => {
  if (PROFILE_ID.test(req.params.id)) profiles.removeRule(req.clientId, req.params.id);
  res.json(profiles.list(req.clientId));
});

// === Watch folder (desktop app): new files in it are converted by themselves ===
// The folder itself is only ever chosen in the app's own folder dialog (the
// main process writes it and tells us to reload); the page sends the rest.
const watcher = IS_DESKTOP ? new WatchFolder({
  configFile: path.join(dataDir, 'watch.json'),
  enqueue: (clientId, file, fields) => {
    const targetFormat = String(fields.targetFormat || '').toLowerCase();
    const format = convert.formatFor(targetFormat);
    if (!format || !jobs.canCreate(clientId)) return false;
    const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => typeof v === 'string' && v.length <= 20));
    const job = jobs.create({
      clientId,
      type: 'convert',
      title: file.name,
      detail: `${convert.describeConvert(format.kind, format.config, body)} · carpeta vigilada`,
      // The original is read in place and never deleted.
      run: convert.runConvert({ inputPath: file.path, originalName: file.name, targetFormat, body, ffmpegPath: currentFfmpegPath(), hw: hwFor() }),
    });
    const onDone = (cid, j) => {
      if (j.id !== job.id || !['done', 'error', 'canceled'].includes(j.status)) return;
      jobs.off('update', onDone);
      if (j.status === 'done') watcher.finished(file.path);
    };
    jobs.on('update', onDone);
    return true;
  },
}) : null;
app.get('/api/watch', requireDesktop, requireClient, (req, res) => res.json(watcher.view()));
app.post('/api/watch', requireDesktop, requireClient, (req, res) => {
  const body = req.body || {};
  const fields = body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields) ? body.fields : undefined;
  if (fields && !convert.formatFor(String(fields.targetFormat || '').toLowerCase())) return res.status(400).json({ error: 'Formato de destino no soportado.' });
  try {
    res.json(watcher.set({ enabled: body.enabled, clientId: req.clientId, fields, moveOriginals: body.moveOriginals }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});
// === A file from the Explorer's right-click menu (desktop): the main process
// passes it here with a one-time pass the page gets; nothing else can name a
// path. Ten minutes to use it. ===
const localFiles = new Map(); // pass -> { file, at }
const LOCAL_EXT = /\.(mp3|m4a|wav|flac|ogg|opus|aac|wma|mp4|mkv|webm|mov|avi|wmv|m4v)$/i;
function takeLocal(token, { keep = false } = {}) {
  for (const [k, v] of localFiles) if (Date.now() - v.at > 10 * 60 * 1000) localFiles.delete(k);
  const hit = /^[a-f0-9]{32}$/.test(String(token)) ? localFiles.get(token) : null;
  if (!hit) return null;
  if (!keep) localFiles.delete(token);
  try { if (!fs.statSync(hit.file).isFile()) return null; } catch { return null; }
  return hit.file;
}
const MEDIA_TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', aac: 'audio/aac', wma: 'audio/x-ms-wma', mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', m4v: 'video/mp4' };
// For Comprimir / the editor: the file itself, once.
app.get('/api/local/file', requireDesktop, requireClient, (req, res) => {
  const file = takeLocal(req.query.token);
  if (!file) return res.status(404).json({ error: 'Ese archivo ya no está disponible; vuelve a elegirlo en el Explorador.' });
  res.setHeader('Content-Type', MEDIA_TYPES[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', String(fs.statSync(file).size));
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
});
// "Convertir a MP3": read in place (never changed), like the watch folder.
app.post('/api/local/convert', requireDesktop, requireClient, createLimiter, (req, res) => {
  const file = takeLocal((req.body || {}).token);
  if (!file) return res.status(404).json({ error: 'Ese archivo ya no está disponible; vuelve a elegirlo en el Explorador.' });
  if (!jobs.canCreate(req.clientId)) return res.status(429).json(TOO_MANY_JOBS);
  const format = convert.formatFor('mp3');
  const body = { audioBitrate: '192' };
  const job = jobs.create({
    clientId: req.clientId, type: 'convert', title: path.basename(file), detail: `${convert.describeConvert(format.kind, format.config, body)} · Explorador`,
    run: convert.runConvert({ inputPath: file, originalName: path.basename(file), targetFormat: 'mp3', body, ffmpegPath: currentFfmpegPath(), hw: hwFor() }),
  });
  res.json({ ok: Boolean(job) });
});

// From the main process: the folder was chosen in its dialog.
process.on('message', (msg) => {
  // A file from the Explorer's menu (only a real local media file).
  if (msg && msg.type === 'local-file' && IS_DESKTOP) {
    const file = String(msg.file || '');
    if (/^[a-f0-9]{32}$/.test(String(msg.token)) && path.isAbsolute(file) && LOCAL_EXT.test(file) && !/[\u0000-\u001f]/.test(file)) {
      localFiles.set(msg.token, { file, at: Date.now() });
      while (localFiles.size > 20) localFiles.delete(localFiles.keys().next().value);
    }
    return;
  }
  // What the app's player is playing (for the phone's music page).
  if (msg && msg.type === 'player-state' && remote) { remote.setPlayer(msg.state); return; }
  if (msg && msg.type === 'watch-reload' && watcher) {
    const enabled = watcher.config.enabled;
    watcher.config = watcher.load();
    watcher.config.enabled = enabled && Boolean(watcher.config.dir && watcher.config.fields && watcher.config.clientId);
    watcher.save();
    if (watcher.config.enabled) watcher.start(); else watcher.stop();
  }
});

// === Podcasts (desktop app): RSS feeds, new episodes downloaded by themselves ===
const podcasts = IS_DESKTOP ? new Podcasts({
  file: path.join(dataDir, 'podcasts.json'),
  enqueue: (p, episodes) => {
    for (const e of episodes) {
      if (!jobs.canCreate(p.clientId)) break;
      createFromSpec(p.clientId, { kind: 'podcast', episode: e, podcast: { title: p.title, image: p.image } });
    }
    events.emit('subscriptions', p.clientId);
  },
}) : null;
const requirePodcast = (req, res, next) => {
  req.podcast = /^[a-f0-9]{16}$/.test(req.params.id) ? podcasts.get(req.params.id, req.clientId) : null;
  return req.podcast ? next() : res.status(404).json({ error: 'Podcast no encontrado.' });
};
app.get('/api/podcasts', requireDesktop, requireClient, (req, res) => res.json({ podcasts: podcasts.listFor(req.clientId) }));
app.post('/api/podcasts', requireDesktop, requireClient, createLimiter, async (req, res) => {
  const body = req.body || {};
  try { res.json(await podcasts.add({ clientId: req.clientId, url: body.url, interval: body.interval, backfill: body.backfill })); } catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/podcasts/:id', requireDesktop, requireClient, requirePodcast, (req, res) => res.json(podcasts.update(req.podcast, req.body || {})));
app.delete('/api/podcasts/:id', requireDesktop, requireClient, requirePodcast, (req, res) => { podcasts.remove(req.podcast); res.json({ ok: true }); });
app.post('/api/podcasts/:id/check', requireDesktop, requireClient, createLimiter, requirePodcast, async (req, res) => {
  const found = await podcasts.check(req.podcast);
  res.json({ found, podcast: podcasts.view(req.podcast) });
});
app.get('/api/podcasts/:id/episodes', requireDesktop, requireClient, infoLimiter, requirePodcast, async (req, res) => {
  try {
    const list = await podcasts.episodes(req.podcast);
    res.json({ episodes: list.map(({ guid, title, date, duration }) => ({ guid, title, date, duration })) });
  } catch (err) { res.status(502).json({ error: err.message }); }
});
app.post('/api/podcasts/:id/download', requireDesktop, requireClient, createLimiter, requirePodcast, async (req, res) => {
  const want = new Set((Array.isArray((req.body || {}).guids) ? req.body.guids : []).slice(0, 100).map(String));
  try {
    const list = (await podcasts.episodes(req.podcast)).filter((e) => want.has(e.guid));
    if (!jobs.canCreate(req.clientId, list.length)) return res.status(429).json(TOO_MANY_JOBS);
    for (const e of list) createFromSpec(req.clientId, { kind: 'podcast', episode: e, podcast: { title: req.podcast.title, image: req.podcast.image } });
    res.json({ created: list.length });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// === Repeating tasks and the download window (desktop app) ===
const recurring = IS_DESKTOP ? new Recurring({
  file: path.join(dataDir, 'recurring.json'),
  run: (task) => {
    const opts = download.parseDownloadOptions(task.options || {});
    return postDownload(task.clientId, { ...opts, urls: [task.url], sectionStart: '', sectionEnd: '' });
  },
  // Downloads held outside the window start when it opens.
  onTick: () => jobs.schedule(),
}) : null;
if (recurring) jobs.windowOpen = () => recurring.windowOpen();
app.get('/api/recurring', requireDesktop, requireClient, (req, res) => res.json({ ...recurring.view(req.clientId), open: recurring.windowOpen() }));
app.post('/api/recurring', requireDesktop, requireClient, createLimiter, (req, res) => {
  const body = req.body || {};
  const url = download.normalizeMediaUrl(body.url);
  if (!url) return res.status(400).json({ error: 'Enlace no válido o sitio no soportado.' });
  const opts = download.parseDownloadOptions({ ...(body.options || {}), chapters: false, sectionStart: '', sectionEnd: '', live: false });
  try {
    recurring.add(req.clientId, { url, options: opts, detail: download.describeOptions(opts), time: body.time, days: body.days, name: body.name });
    res.json({ ...recurring.view(req.clientId), open: recurring.windowOpen() });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/recurring/:id', requireDesktop, requireClient, (req, res) => {
  try {
    if (!/^[a-f0-9]{16}$/.test(req.params.id) || !recurring.update(req.clientId, req.params.id, req.body || {})) return res.status(404).json({ error: 'Tarea no encontrada.' });
    res.json({ ...recurring.view(req.clientId), open: recurring.windowOpen() });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/recurring/:id', requireDesktop, requireClient, (req, res) => {
  recurring.remove(req.clientId, String(req.params.id));
  res.json({ ...recurring.view(req.clientId), open: recurring.windowOpen() });
});
app.post('/api/recurring/window', requireDesktop, requireClient, (req, res) => {
  try {
    recurring.setWindow(req.body || {});
    jobs.schedule();
    res.json({ ...recurring.view(req.clientId), open: recurring.windowOpen() });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// === Control from the phone (desktop app only) ===
// The phone's page sends links here; they go through the very same download
// API (and its checks) as the app's own requests, for the app's client id.
/** One request to our own download API, for the app's client id. */
function postDownload(clientId, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: '/api/jobs/download', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-client-id': clientId, Host: `localhost:${PORT}` },
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200 ? 'ok' : res.statusCode === 400 ? 'invalid' : res.statusCode === 429 ? 'busy' : 'failed');
    });
    req.on('error', () => resolve('failed'));
    req.setTimeout(20000, () => { req.destroy(); resolve('failed'); });
    req.end(body);
  });
}
async function addDownloadsFromPhone(clientId, urls, { mode, audioFormat, quality, profile = null }) {
  // A profile of the app's own: its options (and "audio and video at once").
  const p = profile ? profiles.profile(clientId, profile) : null;
  if (!p) return postDownload(clientId, { urls, mode, audioFormat, quality });
  const first = await postDownload(clientId, { ...p.options, urls });
  if (first !== 'ok' || !p.both) return first;
  return postDownload(clientId, { ...p.options, mode: p.options.mode === 'audio' ? 'video' : 'audio', urls });
}
const remote = IS_DESKTOP ? new RemoteServer({
  file: path.join(process.env.TUBEGRAB_DATA_DIR || jobs.dir, 'remote.json'),
  addDownloads: addDownloadsFromPhone,
  listJobs: (clientId) => jobs.listFor(clientId),
  listProfiles: (clientId) => profiles.list(clientId).profiles.map((p) => ({ id: p.id, name: p.name })),
  // The music: asked of the app (the main process checks it again and hands it to the player).
  playerCommand: (cmd) => {
    if (!process.send || !process.connected) return false;
    process.send({ type: 'player-command', cmd });
    return true;
  },
  // Your library, to play on the phone (read again at most once a minute).
  listLibrary: () => {
    if (!library.lastFiles || !library.lastFiles.length || Date.now() - (library.scannedAt || 0) > 60 * 1000) { library.scan(); library.scannedAt = Date.now(); }
    return (library.lastFiles || []).map((f) => ({ id: f.id, name: f.name, folder: f.folder, kind: f.kind }));
  },
  libraryFile: (id) => library.resolve(id),
}) : null;
async function remoteView(state) {
  if (!state.pairUrl) return state;
  const qr = qrcode(0, 'M');
  qr.addData(state.pairUrl);
  qr.make();
  const { pairUrl, ...rest } = state;
  return { ...rest, qr: `data:image/svg+xml;base64,${Buffer.from(qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true })).toString('base64')}` };
}
app.get('/api/remote', requireDesktop, requireClient, async (req, res) => res.json(await remoteView(await remote.status())));
app.post('/api/remote', requireDesktop, requireClient, async (req, res) => {
  try {
    const state = (req.body || {}).enabled === true ? await remote.enable(req.clientId) : remote.disable();
    res.json(await remoteView(state));
  } catch (err) {
    res.status(500).json({ error: 'No se pudo activar el control desde el móvil.' });
  }
});
app.post('/api/remote/reset', requireDesktop, requireClient, async (req, res) => res.json(await remoteView(await remote.reset())));

app.post('/api/jobs/merge', createLimiter, requireClient, uploadMany.array('files', MAX_MERGE_FILES), (req, res) => {
  const files = req.files || [];
  const discard = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  const body = req.body || {};
  const targetFormat = String(body.targetFormat || '').toLowerCase();
  const format = convert.formatFor(targetFormat);
  if (!format || targetFormat === 'gif') {
    discard();
    return res.status(400).json({ error: 'Formato de destino no soportado para unir.' });
  }
  if (files.length < 2) {
    discard();
    return res.status(400).json({ error: 'Elige al menos dos archivos para unir.' });
  }
  if (!jobs.canCreate(req.clientId)) {
    discard();
    return res.status(429).json(TOO_MANY_JOBS);
  }
  const inputs = files.map((f) => ({ path: f.path, name: nameOf(f) }));
  const job = jobs.create({
    clientId: req.clientId,
    type: 'convert',
    title: `${inputs[0].name} + ${inputs.length - 1} más`,
    detail: `Unir ${inputs.length} archivos · ${format.config.label}`,
    run: convert.runMerge({ inputs, targetFormat, body, ffmpegPath: currentFfmpegPath() }),
    cleanupInput: discard,
  });
  res.json({ id: job.id });
});

app.post('/api/jobs/:id/cancel', requireClient, requireJob, (req, res) => {
  jobs.cancel(req.job);
  res.json({ ok: true });
});

app.post('/api/jobs/:id/retry', createLimiter, requireClient, requireJob, (req, res) => {
  if (!jobs.retry(req.job)) return res.status(409).json({ error: 'Este trabajo no se puede reintentar ahora.' });
  res.json({ ok: true });
});

// A live recording: stop now and keep what was recorded.
app.post('/api/jobs/:id/stop', requireClient, requireJob, (req, res) => {
  if (!jobs.stop(req.job)) return res.status(409).json({ error: 'Esta descarga no es una grabación en curso.' });
  res.json({ ok: true });
});

app.post('/api/jobs/:id/pause', requireClient, requireJob, (req, res) => {
  if (!jobs.pause(req.job)) return res.status(409).json({ error: 'Este trabajo no se puede pausar.' });
  res.json({ ok: true });
});

app.post('/api/jobs/:id/resume', requireClient, requireJob, (req, res) => {
  if (!jobs.resume(req.job)) return res.status(409).json({ error: 'Este trabajo no está en pausa.' });
  res.json({ ok: true });
});

// Desktop only: on a shared web instance it would let one visitor start every
// job at once, past the limits that keep the server usable for everybody.
app.post('/api/jobs/:id/now', requireDesktop, requireClient, requireJob, (req, res) => {
  if (!jobs.startNow(req.job)) return res.status(409).json({ error: 'Ese trabajo ya no está esperando.' });
  res.json({ ok: true });
});

app.post('/api/jobs/:id/priority', requireClient, requireJob, (req, res) => {
  if (!jobs.setPriority(req.job, String((req.body || {}).priority || ''))) return res.status(409).json({ error: 'No se puede cambiar la prioridad de ese trabajo.' });
  res.json({ ok: true });
});

app.post('/api/jobs/:id/move', requireClient, requireJob, (req, res) => {
  const where = String((req.body || {}).where || '');
  if (!jobs.move(req.job, where)) return res.status(409).json({ error: 'No se puede mover ese trabajo.' });
  res.json({ ok: true });
});

/** Pause or resume every download of this client at once. */
app.post('/api/jobs/pause-all', requireClient, (req, res) => {
  const resume = (req.body || {}).resume === true;
  let n = 0;
  for (const job of [...jobs.jobs.values()]) {
    if (job.clientId !== req.clientId) continue;
    if (resume ? jobs.resume(job, { schedule: false }) : jobs.pause(job)) n += 1;
  }
  jobs.schedule();
  res.json({ changed: n });
});

app.delete('/api/jobs/:id', requireClient, requireJob, (req, res) => {
  jobs.remove(req.job);
  res.json({ ok: true });
});

app.delete('/api/jobs/:id/file', requireClient, requireJob, (req, res) => {
  jobs.releaseFile(req.job);
  res.json({ ok: true });
});

app.get('/api/jobs/:id/file', requireClient, requireJob, (req, res) => {
  const n = /^\d{1,4}$/.test(String(req.query.n || '0')) ? Number(req.query.n || 0) : -1;
  const filePath = n >= 0 ? jobs.filePath(req.job, n) : null;
  if (!filePath) return res.status(404).json({ error: 'El archivo ya no está disponible.' });
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
});

// === Subscriptions (desktop app only: they need the app running to check) ===
// A mirrored playlist is saved in a folder of its own, each file named with
// its video id, so the app can tell which files left the playlist.
const MIRROR_TEMPLATE = '{title} [{id}]';
const subscriptions = IS_DESKTOP ? new Subscriptions({
  file: path.join(dataDir, 'subscriptions.json'),
  latest: (url) => download.latestEntries(url, ytEnv(), 30),
  full: (url) => download.expandPlaylist(url, ytEnv()),
  enqueue: (sub, entries) => {
    const opts = download.parseDownloadOptions({ ...(sub.options || {}), ...(sub.mirror ? { nameTemplate: MIRROR_TEMPLATE } : {}) });
    const items = entries.map((e) => ({ url: e.url, title: e.title }));
    const room = Math.max(0, jobs.maxPerClient - jobs.countFor(sub.clientId));
    const take = items.slice(0, Math.min(items.length, room));
    if (take.length) queueDownloads(sub.clientId, take, opts, { saveFolder: sub.mirror ? safeFolderName(sub.title) : null });
    events.emit('subscriptions', sub.clientId);
  },
  // The page asks the app to bring the folder in line (and write the .m3u8).
  onMirror: (sub, entries) => events.emit('mirror', sub.clientId, {
    folder: safeFolderName(sub.title),
    title: sub.title,
    ids: entries.map((e) => e.id).filter((id) => /^[\w-]{1,100}$/.test(id)),
  }),
}) : null;

function requireSubs(req, res, next) {
  if (!subscriptions) return res.status(404).json({ error: 'Las suscripciones solo están en la app de escritorio.' });
  next();
}
function requireSub(req, res, next) {
  req.sub = subscriptions.get(String(req.params.id), req.clientId);
  if (!req.sub) return res.status(404).json({ error: 'Suscripción no encontrada.' });
  next();
}

app.get('/api/subscriptions', requireSubs, requireClient, (req, res) => {
  res.json({ subscriptions: subscriptions.list(req.clientId), intervals: INTERVALS_H });
});

app.post('/api/subscriptions', createLimiter, requireSubs, requireClient, async (req, res) => {
  const body = req.body || {};
  const url = download.normalizeMediaUrl(body.url);
  if (!url) return res.status(400).json({ error: 'Enlace no válido o sitio no soportado.' });
  const opts = download.parseDownloadOptions({ ...(body.options || {}), playlist: false, chapters: false, sectionStart: '', sectionEnd: '' });
  if (!playlistSlots.take()) return res.status(429).json(BUSY);
  try {
    const sub = await subscriptions.add({
      clientId: req.clientId, url, options: opts, detail: `${download.describeOptions(opts)}${body.mirror === true ? ' · espejo' : ''}`,
      interval: body.interval, backfill: body.backfill, mirror: body.mirror === true,
    });
    res.json(sub);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    playlistSlots.release();
  }
});

app.patch('/api/subscriptions/:id', requireSubs, requireClient, requireSub, (req, res) => {
  res.json(subscriptions.update(req.sub, req.body || {}));
});

app.post('/api/subscriptions/:id/check', createLimiter, requireSubs, requireClient, requireSub, async (req, res) => {
  const found = await subscriptions.check(req.sub);
  res.json({ found, subscription: subscriptions.view(req.sub) });
});

app.delete('/api/subscriptions/:id', requireSubs, requireClient, requireSub, (req, res) => {
  subscriptions.remove(req.sub);
  res.json({ ok: true });
});

// Download engine version (shown in the desktop app's settings).
app.get('/api/engine', (req, res) => {
  execFile(currentYtDlpPath(), ['--version'], { windowsHide: true, timeout: 30_000 }, (err, stdout) => {
    res.json({ ytDlp: err ? null : stdout.trim() });
  });
});

app.use((err, req, res, next) => {
  if (err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ error: 'Solo se admiten archivos de audio o vídeo.' });
  }
  if (err.message === 'INVALID_IMAGE_TYPE') {
    return res.status(400).json({ error: 'El logo tiene que ser una imagen PNG, JPG o WEBP.' });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `El archivo es demasiado grande (máx. ${MAX_UPLOAD_SIZE / 1024 / 1024} MB).` });
    }
    return res.status(400).json({ error: 'Error al subir el archivo.' });
  }
  if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Petición no válida.' });
  }
  console.error('[UNHANDLED ERROR]', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor.' });
});

function onListenError(err) {
  if (err.code === 'EADDRINUSE' && process.send) {
    process.send({ type: 'port-in-use' }, () => process.exit(1));
    return;
  }
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] El puerto ${PORT} ya está siendo usado por otra aplicación.`);
    console.error('[SOLUCIÓN] Cierra cualquier otra terminal o servidor que tengas abierto y vuelve a intentarlo.\n');
  } else {
    console.error('\n[ERROR] No se pudo iniciar el servidor:', err.message);
  }
  process.exitCode = 1;
}

// "localhost" resolves to IPv6 (::1) as well as 127.0.0.1, and browsers try
// both: hold the port on ::1 too, so no other program can sit there and
// answer for http://localhost:PORT in our place.
function claimIpv6Loopback(done) {
  if (HOST !== '127.0.0.1') return done(null);
  app.listen(PORT, '::1', (err) => {
    if (err && err.code !== 'EADDRINUSE') return done(null); // this machine has no IPv6 loopback
    done(err || null);
  });
}

// Express 5 calls this back on failure too (e.g. port in use), with the error.
const server = app.listen(PORT, HOST, (err) => {
  if (err) return onListenError(err);
  claimIpv6Loopback((err6) => {
    if (err6) {
      server.close();
      return onListenError(err6);
    }
    onListening();
  });
});

function onListening() {
  // Desktop app: tell the Electron process (our parent) that *this* server is
  // the one listening, so it never loads a page from another program.
  if (process.send) process.send({ type: 'listening', port: server.address().port });
  if (remote) remote.autoStart();
  // What was waiting when the app closed is queued again.
  const restored = restoreQueue();
  if (restored) console.log(`↺ ${restored} descarga(s) pendiente(s) de la última vez, de vuelta en la cola.`);
  console.log(`\n🎵 TubeGrab Pro (yt-dlp) corriendo en http://localhost:${PORT}`);
  console.log(HOST === '0.0.0.0'
    ? '🔒 Modo despliegue: accesible externamente (contenedor/proxy).\n'
    : '🔒 Máxima seguridad: Ejecución local, solo accesible desde esta máquina.\n');
  if (authUsers.size) {
    console.log(`🔑 Acceso privado: ${authUsers.size} usuario(s) en TUBEGRAB_USERS.\n`);
    // Behind a proxy without TRUST_PROXY every visitor shares the proxy's IP,
    // so one attacker's failed attempts would lock everybody out.
    if (HOST !== '127.0.0.1' && !process.env.TRUST_PROXY) console.log('⚠️  Si hay un proxy delante (Render, Nginx…), pon TRUST_PROXY=true para que el límite de intentos sea por visitante.\n');
  }
  else if (HOST !== '127.0.0.1') console.log('⚠️  Sin TUBEGRAB_USERS: cualquiera con el enlace puede usar esta instancia.\n');

  // Only auto-open the system browser for the standalone console build.
  // The Electron desktop app forks this file itself and already shows its
  // own native window pointed at this same URL; any other parent process
  // (e.g. the test suite) doesn't want a browser either.
  if (isWindows && !IS_DESKTOP && !process.send) {
    execFile('cmd', ['/c', 'start', `http://localhost:${PORT}`], (err2) => {
      if (err2) console.warn('[WARN] Could not open browser:', err2.message);
    });
  }
}
