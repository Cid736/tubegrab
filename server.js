const express = require('express');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const { JobManager } = require('./lib/jobs');
const download = require('./lib/download');
const convert = require('./lib/convert');
const { Subscriptions, INTERVALS_H } = require('./lib/subscriptions');
const { parseUsers, basicAuth } = require('./lib/auth');
const tags = require('./lib/tags');
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
});

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
    directives: { 'img-src': ["'self'", 'data:', 'https:', 'blob:'], 'media-src': ["'self'", 'blob:'] },
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
const config = { downloadConcurrency: 3, convertConcurrency: 1, hwAccel: 'auto' };
if (IS_DESKTOP) {
  try { Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); } catch { /* defaults */ }
}
function applyConfig() {
  jobs.setConcurrency('download', config.downloadConcurrency);
  jobs.setConcurrency('convert', config.convertConcurrency);
  config.downloadConcurrency = jobs.concurrency.download;
  config.convertConcurrency = jobs.concurrency.convert;
  if (!['auto', 'off'].includes(config.hwAccel)) config.hwAccel = 'auto';
}
applyConfig();

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
  res.json({ ...config, gpu: gpuVendor, desktop: IS_DESKTOP });
});

app.post('/api/config', (req, res) => {
  if (!IS_DESKTOP) return res.status(403).json({ error: 'Solo en la app de escritorio.' });
  const body = req.body || {};
  if (body.downloadConcurrency !== undefined) config.downloadConcurrency = Number(body.downloadConcurrency);
  if (body.convertConcurrency !== undefined) config.convertConcurrency = Number(body.convertConcurrency);
  if (['auto', 'off'].includes(body.hwAccel)) config.hwAccel = body.hwAccel;
  applyConfig();
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch { /* not fatal */ }
  res.json({ ...config, gpu: gpuVendor, desktop: IS_DESKTOP });
});

// === Media info preview (title, thumbnail, duration) ===
app.post('/api/info', infoLimiter, (req, res) => {
  const url = download.normalizeMediaUrl((req.body || {}).url);
  if (!url) return res.status(400).json({ error: 'Enlace no válido o sitio no soportado.' });
  if (!infoSlots.take()) return res.status(429).json(BUSY);

  const env = ytEnv();
  const args = ['--ignore-config', '--encoding', 'utf-8', '--no-playlist', '--ies', 'default,-generic', '--dump-json', '--skip-download', '--no-warnings'];
  if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
  if (env.cookiesPath) args.push('--cookies', env.cookiesPath);
  args.push('--', url);

  execFile(env.ytDlpPath, args, { windowsHide: true, timeout: 60_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
    infoSlots.release();
    if (err) return res.status(500).json({ error: 'No se pudo obtener información del enlace.' });
    try {
      const data = JSON.parse(stdout);
      const thumbnail = typeof data.thumbnail === 'string' && data.thumbnail.startsWith('https://') ? data.thumbnail : null;
      const chapters = Array.isArray(data.chapters) ? data.chapters.length : 0;
      return res.json({
        title: data.title || 'Sin título',
        thumbnail,
        duration: data.duration || null,
        uploader: data.uploader || data.channel || null,
        site: data.extractor_key || null,
        chapters,
        isPlaylist: false,
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
    res.json({ results });
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
    res.json(list);
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
  const onHold = (until) => send('schedule', { until });
  if (IS_DESKTOP) jobs.on('hold', onHold);
  jobs.on('update', onUpdate);
  jobs.on('removed', onRemoved);
  events.on('subscriptions', onSubs);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    jobs.off('update', onUpdate);
    jobs.off('removed', onRemoved);
    events.off('subscriptions', onSubs);
    jobs.off('hold', onHold);
    const left = (sseConnections.get(req.clientId) || 1) - 1;
    if (left > 0) sseConnections.set(req.clientId, left); else sseConnections.delete(req.clientId);
    sseTotal -= 1;
  });
});

const TOO_MANY_JOBS = { error: 'Hay demasiados trabajos en la cola. Elimina algunos terminados e inténtalo de nuevo.' };

/** Queues one download job per item ({ url, title }) with validated options. */
function queueDownloads(clientId, items, opts) {
  const env = ytEnv();
  const detail = download.describeOptions(opts);
  for (const item of items) {
    jobs.create({
      clientId,
      type: 'download',
      title: item.title || item.url,
      detail,
      source: item.url,
      request: opts,
      run: download.runDownload(item.url, opts, env),
      retryable: true,
    });
  }
}

app.post('/api/jobs/download', createLimiter, requireClient, async (req, res) => {
  const body = req.body || {};
  const opts = download.parseDownloadOptions(body);
  const invalid = download.validateOptions(opts);
  if (invalid) return res.status(400).json({ error: invalid });

  // Either links (urls) or picked results with their titles (items: search / playlist picker).
  const maxUrls = opts.playlist ? (IS_DESKTOP ? 10 : 3) : (IS_DESKTOP ? 300 : 20);
  const raw = Array.isArray(body.items)
    ? body.items.slice(0, maxUrls).map((i) => ({ url: i && i.url, title: i && typeof i.title === 'string' ? i.title.slice(0, 300) : null }))
    : (Array.isArray(body.urls) ? body.urls.slice(0, maxUrls) : []).map((url) => ({ url, title: null }));
  const picked = [];
  const rejected = [];
  for (const entry of raw) {
    const url = download.normalizeMediaUrl(entry.url);
    if (url) picked.push({ url, title: entry.title }); else rejected.push(String(entry.url).slice(0, 200));
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
  queueDownloads(req.clientId, items, opts);
  res.json({ created: items.length, rejected });
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
const uploadEdit = uploader(2, { imageFields: ['logo'] }).fields([{ name: 'file', maxCount: 1 }, { name: 'logo', maxCount: 1 }]);
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
  const body = req.body || {};
  const targetFormat = String(body.targetFormat || '').toLowerCase();
  const mode = body.mode === 'fast' ? 'fast' : 'exact';
  const segments = convert.parseSegments(body.segments);
  const fx = convert.parseEditEffects(body);
  const animated = Object.prototype.hasOwnProperty.call(convert.EDIT_ANIMATED, targetFormat) ? convert.EDIT_ANIMATED[targetFormat] : null;
  singleUpload(req, res, {
    extraFiles: [logo],
    check: () => {
      if (!segments) return 'Tramos no válidos.';
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
        fx.aspect || '',
        fx.rotate ? 'girado' : '',
        mode === 'fast' ? 'rápido' : '',
      ].filter(Boolean);
      return [`Editar · ${segments.length} ${segments.length === 1 ? 'tramo' : 'tramos'} · ${clock} · ${label}`, ...extras].join(' · ');
    },
    makeRun: (file, b) => convert.runEdit({
      inputPath: file.path, originalName: nameOf(file), segments, targetFormat, mode, body: b, ffmpegPath: currentFfmpegPath(), hw: hwFor(),
      logoPath: fx.logo && logo ? logo.path : null,
    }),
  });
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

app.post('/api/jobs/:id/pause', requireClient, requireJob, (req, res) => {
  if (!jobs.pause(req.job)) return res.status(409).json({ error: 'Este trabajo no se puede pausar.' });
  res.json({ ok: true });
});

app.post('/api/jobs/:id/resume', requireClient, requireJob, (req, res) => {
  if (!jobs.resume(req.job)) return res.status(409).json({ error: 'Este trabajo no está en pausa.' });
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
const subscriptions = IS_DESKTOP ? new Subscriptions({
  file: path.join(dataDir, 'subscriptions.json'),
  latest: (url) => download.latestEntries(url, ytEnv(), 30),
  enqueue: (sub, entries) => {
    const opts = download.parseDownloadOptions(sub.options || {});
    const items = entries.map((e) => ({ url: e.url, title: e.title }));
    if (jobs.canCreate(sub.clientId, items.length)) queueDownloads(sub.clientId, items, opts);
    events.emit('subscriptions', sub.clientId);
  },
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
      clientId: req.clientId, url, options: opts, detail: download.describeOptions(opts),
      interval: body.interval, backfill: body.backfill,
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
