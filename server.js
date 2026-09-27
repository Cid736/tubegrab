const express = require('express');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const { JobManager } = require('./lib/jobs');
const download = require('./lib/download');
const convert = require('./lib/convert');

const app = express();
const PORT = process.env.PORT || 3000;
// Bind to localhost only by default (this app is meant to run as a local/desktop
// tool). Any container/host deployment (Docker, Render, Railway...) must set
// HOST=0.0.0.0 itself — inside a container, binding to 127.0.0.1 is unreachable
// from outside even with host-level port publishing restricted to localhost.
const HOST = process.env.HOST || '127.0.0.1';
const IS_DESKTOP = Boolean(process.env.TUBEGRAB_ELECTRON);

// Initialize yt-dlp and ffmpeg paths
let ytDlpPath;
const isWindows = process.platform === 'win32';

// Windows: scripts/fetch-ffmpeg.js keeps a current, SHA-256-pinned ffmpeg (and
// ffprobe beside it) in bin/; ffmpeg-static's own binary is only a fallback.
// Elsewhere FFMPEG_BIN points at a system ffmpeg (the Docker image sets
// /usr/bin/ffmpeg, which is current and has ffprobe next to it).
const pinnedFfmpeg = path.join(__dirname, 'bin', 'ffmpeg.exe');
const envFfmpeg = process.env.FFMPEG_BIN;
const currentFfmpegPath = envFfmpeg && path.isAbsolute(envFfmpeg) && fs.existsSync(envFfmpeg) ? envFfmpeg
  : isWindows && fs.existsSync(pinnedFfmpeg) ? pinnedFfmpeg : ffmpegPath;

if (process.env.TUBEGRAB_YTDLP && fs.existsSync(process.env.TUBEGRAB_YTDLP)) {
  // Desktop app: a self-updating copy kept in the user's app-data folder.
  ytDlpPath = process.env.TUBEGRAB_YTDLP;
} else if (isWindows) {
  ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
} else {
  // On Linux hosts (Render, Railway, Docker), scripts/postinstall.js downloads
  // a local yt-dlp binary at npm-install time. Fall back to PATH if missing.
  const localYtDlp = path.join(__dirname, 'yt-dlp');
  ytDlpPath = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
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
  ytDlpPath,
  ffmpegPath: currentFfmpegPath,
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
    // Video thumbnails come from the source site's CDN.
    directives: { 'img-src': ["'self'", 'data:', 'https:'] },
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

  execFile(ytDlpPath, args, { windowsHide: true, timeout: 60_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
    infoSlots.release();
    if (err) return res.status(500).json({ error: 'No se pudo obtener información del enlace.' });
    try {
      const data = JSON.parse(stdout);
      const thumbnail = typeof data.thumbnail === 'string' && data.thumbnail.startsWith('https://') ? data.thumbnail : null;
      return res.json({
        title: data.title || 'Sin título',
        thumbnail,
        duration: data.duration || null,
        uploader: data.uploader || data.channel || null,
        site: data.extractor_key || null,
      });
    } catch {
      return res.status(500).json({ error: 'No se pudo obtener información del enlace.' });
    }
  });
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

  const onUpdate = (clientId, job) => { if (clientId === req.clientId) send('job', job); };
  const onRemoved = (clientId, id) => { if (clientId === req.clientId) send('removed', { id }); };
  jobs.on('update', onUpdate);
  jobs.on('removed', onRemoved);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    jobs.off('update', onUpdate);
    jobs.off('removed', onRemoved);
    const left = (sseConnections.get(req.clientId) || 1) - 1;
    if (left > 0) sseConnections.set(req.clientId, left); else sseConnections.delete(req.clientId);
    sseTotal -= 1;
  });
});

app.post('/api/jobs/download', createLimiter, requireClient, async (req, res) => {
  const body = req.body || {};
  const opts = download.parseDownloadOptions(body);
  // Each playlist is a yt-dlp run of up to 90 s before anything is queued.
  const maxUrls = opts.playlist ? (IS_DESKTOP ? 10 : 3) : (IS_DESKTOP ? 100 : 20);
  const rawUrls = Array.isArray(body.urls) ? body.urls.slice(0, maxUrls) : [];
  const urls = [];
  const rejected = [];
  for (const raw of rawUrls) {
    const url = download.normalizeMediaUrl(raw);
    if (url) urls.push(url); else rejected.push(String(raw).slice(0, 200));
  }
  if (!urls.length) {
    return res.status(400).json({ error: 'Ningún enlace válido. Sitios soportados: YouTube, Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp y más.', rejected });
  }

  const env = ytEnv();
  const items = [];
  if (opts.playlist && !playlistSlots.take()) return res.status(429).json(BUSY);
  try {
    for (const url of urls) {
      const expanded = opts.playlist ? await download.expandPlaylist(url, env) : null;
      if (expanded && expanded.entries.length) {
        for (const entry of expanded.entries) items.push({ url: entry.url, title: entry.title || entry.url });
      } else {
        items.push({ url, title: url });
      }
    }
  } finally {
    if (opts.playlist) playlistSlots.release();
  }
  if (!jobs.canCreate(req.clientId, items.length)) {
    return res.status(429).json({ error: 'Hay demasiados trabajos en la cola. Elimina algunos terminados e inténtalo de nuevo.' });
  }

  const detail = download.describeOptions(opts);
  for (const item of items) {
    jobs.create({
      clientId: req.clientId,
      type: 'download',
      title: item.title,
      detail,
      run: download.runDownload(item.url, opts, env),
      retryable: true,
    });
  }
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

const upload = multer({
  // Browsers send the file name as UTF-8; multer's default (latin1) turned
  // "Canción.wav" into "CanciÃ³n.mp3".
  defParamCharset: 'utf8',
  // Inside this process's job folder: swept on the next start if the server
  // is killed mid-upload/conversion, instead of piling up in %TEMP%.
  dest: path.join(jobs.dir, 'uploads'),
  limits: { fileSize: MAX_UPLOAD_SIZE, files: 1, fields: 30 },
  fileFilter: (req, file, cb) => {
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

app.post('/api/jobs/convert', createLimiter, requireClient, upload.single('file'), (req, res) => {
  const discard = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  const body = req.body || {};
  const targetFormat = String(body.targetFormat || '').toLowerCase();
  const format = convert.formatFor(targetFormat);
  if (!format) {
    discard();
    return res.status(400).json({ error: 'Formato de destino no soportado.' });
  }
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });

  const trimStart = convert.parseTimestamp(body.trimStart);
  const trimEnd = convert.parseTimestamp(body.trimEnd);
  if (Number.isNaN(trimStart) || Number.isNaN(trimEnd) || (trimStart !== null && trimEnd !== null && trimEnd <= trimStart)) {
    discard();
    return res.status(400).json({ error: 'Tiempo de recorte no válido. Usa segundos o mm:ss, y que "Hasta" sea mayor que "Desde".' });
  }
  if (!jobs.canCreate(req.clientId)) {
    discard();
    return res.status(429).json({ error: 'Hay demasiados trabajos en la cola. Elimina algunos terminados e inténtalo de nuevo.' });
  }

  const originalName = String(req.file.originalname || 'archivo').slice(0, 255);
  const job = jobs.create({
    clientId: req.clientId,
    type: 'convert',
    title: originalName,
    detail: convert.describeConvert(format.kind, format.config, body),
    run: convert.runConvert({ inputPath: req.file.path, originalName, targetFormat, body, ffmpegPath: currentFfmpegPath }),
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

app.delete('/api/jobs/:id', requireClient, requireJob, (req, res) => {
  jobs.remove(req.job);
  res.json({ ok: true });
});

app.delete('/api/jobs/:id/file', requireClient, requireJob, (req, res) => {
  jobs.releaseFile(req.job);
  res.json({ ok: true });
});

app.get('/api/jobs/:id/file', requireClient, requireJob, (req, res) => {
  const filePath = jobs.filePath(req.job);
  if (!filePath) return res.status(404).json({ error: 'El archivo ya no está disponible.' });
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
});

// Download engine version (shown in the desktop app's settings).
app.get('/api/engine', (req, res) => {
  execFile(ytDlpPath, ['--version'], { windowsHide: true, timeout: 30_000 }, (err, stdout) => {
    res.json({ ytDlp: err ? null : stdout.trim() });
  });
});

app.use((err, req, res, next) => {
  if (err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ error: 'Solo se admiten archivos de audio o vídeo.' });
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
