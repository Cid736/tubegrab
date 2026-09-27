const express = require('express');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap-extended').default;
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
// Bind to localhost only by default (this app is meant to run as a local/desktop
// tool). Any container/host deployment (Docker, Render, Railway...) must set
// HOST=0.0.0.0 itself — inside a container, binding to 127.0.0.1 is unreachable
// from outside even with host-level port publishing restricted to localhost.
const HOST = process.env.HOST || '127.0.0.1';

// Initialize yt-dlp and ffmpeg paths
let ytDlpPath;
let currentFfmpegPath = ffmpegPath;

// Check if running inside pkg
const isPkg = typeof process.pkg !== 'undefined';
const isWindows = process.platform === 'win32';

if (isPkg) {
  try {
    console.log('[INIT] Ejecutando en modo standalone. Preparando herramientas...');
    
    // Extract yt-dlp.exe
    const ytDlpTemp = path.join(os.tmpdir(), isWindows ? 'yt-dlp.exe' : 'yt-dlp');
    if (!fs.existsSync(ytDlpTemp)) {
      const source = path.join(__dirname, isWindows ? 'yt-dlp.exe' : 'yt-dlp');
      console.log(`[INIT] Extrayendo yt-dlp desde ${source}...`);
      fs.writeFileSync(ytDlpTemp, fs.readFileSync(source));
      if (!isWindows) fs.chmodSync(ytDlpTemp, 0o755);
    }
    ytDlpPath = ytDlpTemp;

    // Extract ffmpeg.exe
    const ffmpegFileName = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
    const ffmpegTemp = path.join(os.tmpdir(), ffmpegFileName);
    if (!fs.existsSync(ffmpegTemp)) {
      const bundledFfmpeg = path.join(__dirname, 'node_modules', 'ffmpeg-static', ffmpegFileName);
      if (fs.existsSync(bundledFfmpeg)) {
        console.log(`[INIT] Extrayendo ffmpeg desde ${bundledFfmpeg}...`);
        fs.writeFileSync(ffmpegTemp, fs.readFileSync(bundledFfmpeg));
        if (!isWindows) fs.chmodSync(ffmpegTemp, 0o755);
      } else {
        console.warn('[WARN] No se encontró ffmpeg en el paquete. Las conversiones podrían fallar.');
      }
    }
    currentFfmpegPath = ffmpegTemp;
  } catch (err) {
    console.error('[FATAL] Error crítico al inicializar herramientas:', err.message);
    if (isWindows) {
      process.stdin.resume(); // Keep window open
      setTimeout(() => process.exit(1), 10000);
    }
  }
} else {
  // If not in pkg, use local .exe on Windows, or system path on Linux
  if (isWindows) {
    ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
  } else {
    // On Linux hosts (Render, Railway, Docker), scripts/postinstall.js downloads
    // a local yt-dlp binary at npm-install time. Fall back to PATH if missing.
    const localYtDlp = path.join(__dirname, 'yt-dlp');
    ytDlpPath = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
    // ffmpeg-static usually handles the path correctly on Linux too
  }
}

const ytDlpWrap = new YTDlpWrap(ytDlpPath);

// yt-dlp-wrap's own getVideoInfo() doesn't forward spawn options, so it can't
// take windowsHide — reimplement it here (same logic) using execPromise
// directly so metadata lookups never flash a console window either.
async function getVideoInfo(args) {
  if (!args.includes('-f') && !args.includes('--format')) args = args.concat(['-f', 'best']);
  const stdout = await ytDlpWrap.execPromise(args.concat(['--dump-json']), { windowsHide: true });
  return JSON.parse(stdout);
}

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Render/Railway/most PaaS put the app behind a reverse proxy; trust its
// X-Forwarded-For so express-rate-limit and req.ip work correctly there.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.use(helmet());

// DNS-rebinding guard: when bound to localhost, a malicious site could point its
// own domain at 127.0.0.1 and then read this server's responses from the
// browser. Only answer requests actually addressed to localhost.
if (HOST === '127.0.0.1') {
  const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
  app.use((req, res, next) => {
    if (!allowedHosts.has(String(req.headers.host || '').toLowerCase())) {
      return res.status(403).send('Forbidden');
    }
    next();
  });
}

// Cross-site request guard: any web page the user visits can fire requests at
// this server (e.g. a multipart POST to /api/convert or a GET to /api/stream).
// Browsers attach Origin to those; reject any that isn't this same host.
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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const _apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please wait a minute.' }
});
app.use('/api/', _apiLimiter);

// === Format conversion (local file upload) ===
// Keys are what the client sends as targetFormat; `ext` is the output file
// extension (several formats share one, e.g. m4a for both AAC and ALAC).
const AUDIO_CONVERT_FORMATS = {
  mp3: { ext: 'mp3', codec: 'libmp3lame', contentType: 'audio/mpeg', lossy: true },
  aac: { ext: 'aac', codec: 'aac', contentType: 'audio/aac', lossy: true },
  m4a: { ext: 'm4a', codec: 'aac', contentType: 'audio/mp4', lossy: true },
  ogg: { ext: 'ogg', codec: 'libvorbis', contentType: 'audio/ogg', lossy: true },
  // libopus only accepts its own sample rates; ffmpeg resamples automatically
  // as long as we don't force -ar.
  opus: { ext: 'opus', codec: 'libopus', contentType: 'audio/opus', lossy: true, fixedSampleRate: true },
  wma: { ext: 'wma', codec: 'wmav2', contentType: 'audio/x-ms-wma', lossy: true },
  ac3: { ext: 'ac3', codec: 'ac3', contentType: 'audio/ac3', lossy: true },
  flac: { ext: 'flac', codec: 'flac', contentType: 'audio/flac', lossy: false },
  alac: { ext: 'm4a', codec: 'alac', contentType: 'audio/mp4', lossy: false },
  wav: { ext: 'wav', codec: 'pcm_s16le', contentType: 'audio/wav', lossy: false },
  aiff: { ext: 'aiff', codec: 'pcm_s16be', contentType: 'audio/aiff', lossy: false },
};
// `family` selects how the quality setting maps onto the encoder's own scale.
const VIDEO_CONVERT_FORMATS = {
  mp4: { ext: 'mp4', vcodec: 'libx264', acodec: 'aac', family: 'x264', contentType: 'video/mp4', extra: ['-pix_fmt', 'yuv420p', '-movflags', '+faststart'] },
  hevc: { ext: 'mp4', vcodec: 'libx265', acodec: 'aac', family: 'x265', contentType: 'video/mp4', extra: ['-preset', 'fast', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-movflags', '+faststart'] },
  webm: { ext: 'webm', vcodec: 'libvpx-vp9', acodec: 'libopus', family: 'vp9', contentType: 'video/webm', extra: ['-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4'] },
  mkv: { ext: 'mkv', vcodec: 'libx264', acodec: 'aac', family: 'x264', contentType: 'video/x-matroska', extra: ['-pix_fmt', 'yuv420p'] },
  mov: { ext: 'mov', vcodec: 'libx264', acodec: 'aac', family: 'x264', contentType: 'video/quicktime', extra: ['-pix_fmt', 'yuv420p'] },
  avi: { ext: 'avi', vcodec: 'mpeg4', acodec: 'libmp3lame', family: 'qscale', contentType: 'video/x-msvideo' },
  wmv: { ext: 'wmv', vcodec: 'wmv2', acodec: 'wmav2', family: 'qscale', contentType: 'video/x-ms-wmv' },
  flv: { ext: 'flv', vcodec: 'libx264', acodec: 'aac', family: 'x264', contentType: 'video/x-flv', extra: ['-pix_fmt', 'yuv420p'] },
  // MPEG-2 only allows a fixed set of frame rates.
  mpg: { ext: 'mpg', vcodec: 'mpeg2video', acodec: 'mp2', family: 'qscale', contentType: 'video/mpeg', allowedFps: ['24', '30', '60'], defaultFps: '25' },
  '3gp': { ext: '3gp', vcodec: 'libx264', acodec: 'aac', family: 'x264', contentType: 'video/3gpp', extra: ['-pix_fmt', 'yuv420p'] },
  ogv: { ext: 'ogv', vcodec: 'libtheora', acodec: 'libvorbis', family: 'theora', contentType: 'video/ogg' },
  gif: { ext: 'gif', vcodec: 'gif', acodec: null, family: 'gif', contentType: 'image/gif' },
};
const VIDEO_QUALITY_SCALES = {
  x264: { alta: ['-crf', '18'], media: ['-crf', '23'], baja: ['-crf', '28'] },
  x265: { alta: ['-crf', '22'], media: ['-crf', '28'], baja: ['-crf', '32'] },
  vp9: { alta: ['-crf', '24'], media: ['-crf', '32'], baja: ['-crf', '40'] },
  qscale: { alta: ['-q:v', '2'], media: ['-q:v', '5'], baja: ['-q:v', '10'] },
  theora: { alta: ['-q:v', '9'], media: ['-q:v', '7'], baja: ['-q:v', '5'] },
};
const AUDIO_BITRATES = ['64', '96', '128', '160', '192', '256', '320'];
const SAMPLE_RATES = ['44100', '48000'];
const CHANNELS = ['1', '2'];
const RESOLUTIONS = ['2160', '1440', '1080', '720', '480', '360', '240'];
const QUALITIES = ['alta', 'media', 'baja'];
const FPS_VALUES = ['60', '30', '24', '15', '10'];
const GIF_MAX_FPS = 30;
const MAX_CONVERT_SIZE = 300 * 1024 * 1024; // 300MB

const pick = (value, allowed) => (allowed.includes(String(value)) ? String(value) : null);

/** "90", "1:30", "0:01:30.5" -> seconds; '' -> null; anything else -> NaN. */
function parseTimestamp(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (!/^\d{1,5}(:[0-5]?\d){0,2}(\.\d{1,3})?$/.test(value)) return NaN;
  const seconds = value.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
  return seconds <= 24 * 3600 ? seconds : NaN;
}

// Reject uploads that are clearly not media before they ever reach ffmpeg.
// The client-supplied mimetype isn't cryptographically trustworthy, and
// browsers/tools are inconsistent about setting it for less common audio/
// video formats (some send 'application/octet-stream' even for a real .mp3
// or .mkv) — so an empty/generic mimetype is allowed through as long as the
// extension matches a format this app actually supports, rather than
// rejecting legitimate files. This still blocks the obvious case (a .txt,
// .exe, .pdf, etc. with its own real mimetype) from ever reaching ffmpeg.
// See BUGLOG.md, revisión 5.
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  'mp3', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'wma', 'ac3', 'flac', 'wav', 'aiff', 'aif', 'amr', 'mka',
  'mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ogv', 'ts', 'mts', 'gif',
]);
const GENERIC_MIMETYPES = new Set(['application/octet-stream', 'application/x-matroska', '']);

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_CONVERT_SIZE, files: 1 },
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

function buildAudioArgs(config, body) {
  const args = ['-vn', '-c:a', config.codec];
  const bitrate = config.lossy ? pick(body.audioBitrate, AUDIO_BITRATES) : null;
  if (bitrate) args.push('-b:a', `${bitrate}k`);
  let sampleRate = config.fixedSampleRate ? null : pick(body.sampleRate, SAMPLE_RATES);
  if (body.normalize === 'true') {
    args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
    // loudnorm works at 192 kHz internally; bring it back to a normal rate.
    if (!sampleRate && !config.fixedSampleRate) sampleRate = '44100';
  }
  if (sampleRate) args.push('-ar', sampleRate);
  const channels = pick(body.channels, CHANNELS);
  if (channels) args.push('-ac', channels);
  return args;
}

function buildVideoArgs(config, body) {
  const resolution = pick(body.resolution, RESOLUTIONS);
  let fps = pick(body.fps, FPS_VALUES);

  if (config.family === 'gif') {
    const gifFps = Math.min(Number(fps || 12), GIF_MAX_FPS);
    const scale = resolution
      ? `scale=-2:'min(${resolution},ih)':flags=lanczos`
      : `scale='min(480,iw)':-2:flags=lanczos`;
    // Two-pass palette in one graph: far better colours than GIF's default palette.
    return ['-vf', `fps=${gifFps},${scale},split[a][b];[a]palettegen[p];[b][p]paletteuse`, '-loop', '0', '-an'];
  }

  // Most encoders need even dimensions; never upscale when a height is chosen.
  const scale = resolution
    ? `scale=-2:'min(${resolution},trunc(ih/2)*2)'`
    : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  if (config.allowedFps) fps = fps && config.allowedFps.includes(fps) ? fps : config.defaultFps;
  const quality = pick(body.quality, QUALITIES) || 'media';

  const args = ['-vf', scale];
  if (fps) args.push('-r', fps);
  args.push('-c:v', config.vcodec, ...VIDEO_QUALITY_SCALES[config.family][quality], ...(config.extra || []));
  if (body.removeAudio === 'true') args.push('-an');
  else args.push('-c:a', config.acodec);
  return args;
}

app.post('/api/convert', upload.single('file'), (req, res) => {
  const cleanupInput = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  const body = req.body || {};

  const targetFormat = String(body.targetFormat || '').toLowerCase();
  const audioConfig = Object.prototype.hasOwnProperty.call(AUDIO_CONVERT_FORMATS, targetFormat) ? AUDIO_CONVERT_FORMATS[targetFormat] : null;
  const videoConfig = Object.prototype.hasOwnProperty.call(VIDEO_CONVERT_FORMATS, targetFormat) ? VIDEO_CONVERT_FORMATS[targetFormat] : null;
  if (!audioConfig && !videoConfig) {
    cleanupInput();
    return res.status(400).json({ error: 'Formato de destino no soportado.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  }

  const trimStart = parseTimestamp(body.trimStart);
  const trimEnd = parseTimestamp(body.trimEnd);
  if (Number.isNaN(trimStart) || Number.isNaN(trimEnd) || (trimStart !== null && trimEnd !== null && trimEnd <= trimStart)) {
    cleanupInput();
    return res.status(400).json({ error: 'Tiempo de recorte no válido. Usa segundos o mm:ss, y que "Hasta" sea mayor que "Desde".' });
  }

  const config = audioConfig || videoConfig;
  const outId = `convert_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const outputPath = path.join(os.tmpdir(), `${outId}.${config.ext}`);

  const originalName = (req.file.originalname || (audioConfig ? 'audio' : 'video')).replace(/[^\w\s.-]/gi, '').trim() || 'archivo';
  const baseName = originalName.replace(/\.[^/.]+$/, '') || 'archivo';
  const outputFilename = `${baseName}.${config.ext}`;
  const contentType = config.contentType;

  const args = ['-y'];
  if (trimStart !== null) args.push('-ss', String(trimStart));
  if (trimEnd !== null) args.push('-to', String(trimEnd));
  args.push('-i', req.file.path, '-map_metadata', '-1');
  args.push(...(audioConfig ? buildAudioArgs(audioConfig, body) : buildVideoArgs(videoConfig, body)));
  args.push(outputPath);

  console.log(`[CONVERT] ${originalName} -> ${targetFormat}`);

  // HEVC/VP9 on long videos can take a while.
  execFile(currentFfmpegPath, args, { timeout: 30 * 60 * 1000, windowsHide: true }, (err) => {
    cleanupInput();

    if (err) {
      console.error('[CONVERT ERROR]', err.message);
      fs.unlink(outputPath, () => {});
      if (!res.headersSent) {
        res.status(500).json({ error: 'No se pudo convertir el archivo. Verifica que sea un archivo de audio/vídeo válido.' });
      }
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(outputFilename)}`);

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);
    fileStream.on('close', () => fs.unlink(outputPath, () => {}));
    fileStream.on('error', (streamErr) => {
      console.error('[CONVERT STREAM ERROR]', streamErr.message);
      fs.unlink(outputPath, () => {});
      if (!res.headersSent) res.status(500).json({ error: 'Error al enviar el archivo convertido.' });
    });
  });
});

// Video metadata preview (title, thumbnail, duration) before downloading
app.post('/api/info', async (req, res) => {
  const { url } = req.body || {};
  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+/i;
  if (!url || !ytRegex.test(url)) {
    return res.status(400).json({ error: 'URL inválida' });
  }

  try {
    const metadataArgs = [
      '--no-playlist',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    if (fs.existsSync(path.join(__dirname, 'cookies.txt'))) {
      metadataArgs.push('--cookies', path.join(__dirname, 'cookies.txt'));
    }
    const metadata = await getVideoInfo([url, ...metadataArgs]);
    return res.json({
      title: metadata.title || 'Sin título',
      thumbnail: metadata.thumbnail || null,
      duration: metadata.duration || null,
      uploader: metadata.uploader || null,
    });
  } catch (err) {
    console.error('[INFO ERROR]', err.message);
    return res.status(500).json({ error: 'No se pudo obtener información del vídeo.' });
  }
});


// Main API endpoint to verify URL and get metadata
app.post('/api/download', async (req, res) => {
  const { url, mode, quality, audioBitrate, audioFormat } = req.body;
  if (!['audio', 'video'].includes(mode))
    return res.status(400).json({ error: 'Invalid mode. Use audio or video.' });

  const VALID_AUDIO_FORMATS = ['mp3', 'ogg'];
  const safeAudioFormat = VALID_AUDIO_FORMATS.includes(audioFormat) ? audioFormat : 'mp3';

  if (!url) {
    return res.status(400).json({ error: 'URL es requerida' });
  }

  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+/i;
  if (!ytRegex.test(url)) {
    return res.status(400).json({ error: 'Por favor, introduce una URL válida de YouTube' });
  }

  try {
    console.log(`[INFO] Obteniendo info para: ${url}`);
    
    // Get metadata to confirm it's valid and get a filename
    // Get metadata with stealth flags
    const metadataArgs = [
      '--no-playlist',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    if (fs.existsSync(path.join(__dirname, 'cookies.txt'))) {
      metadataArgs.push('--cookies', path.join(__dirname, 'cookies.txt'));
    }
    
    const metadata = await getVideoInfo([url, ...metadataArgs]);
    const title = metadata.title || 'video';
    
    // Clean filename
    const safeTitle = title.replace(/[^\w\s-]/gi, '').trim();
    const ext = mode === 'audio' ? safeAudioFormat : 'mp4';
    const filename = `${safeTitle}.${ext}`;

    // Return a URL that the frontend will use to start the stream
    const streamUrl = `/api/stream?url=${encodeURIComponent(url)}&mode=${mode}&quality=${quality}&bitrate=${audioBitrate}&format=${safeAudioFormat}&filename=${encodeURIComponent(filename)}`;

    return res.json({
      success: true,
      downloadUrl: streamUrl,
      filename: filename,
      status: 'ready',
      instance: 'Local (yt-dlp)'
    });
  } catch (err) {
    console.error('[ERROR] Metadata fetch failed:', err.message);
    return res.status(500).json({ 
      error: 'No se pudo obtener información del video. YouTube podría estar bloqueando peticiones temporales.',
      suggestion: 'Intenta de nuevo en unos momentos.'
    });
  }
});

// Streaming endpoint
app.get('/api/stream', async (req, res) => {
  const VALID_QUALITIES = ['360', '480', '720', '1080', '1440', '2160'];
  const VALID_BITRATES  = ['64', '96', '128', '192', '256', '320'];
  const VALID_AUDIO_FORMATS = ['mp3', 'ogg'];
  const { url, mode } = req.query;
  const quality = VALID_QUALITIES.includes(req.query.quality) ? req.query.quality : '1080';
  const bitrate = VALID_BITRATES.includes(req.query.bitrate)   ? req.query.bitrate  : '128';
  const audioFormat = VALID_AUDIO_FORMATS.includes(req.query.format) ? req.query.format : 'mp3';
  const rawFilename = req.query.filename || '';
  const filename = rawFilename.replace(/[^\w\s.\-]/gi, '').trim() || 'download';

  if (!url) return res.status(400).send('URL missing');
  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+/i;
  if (!ytRegex.test(url)) return res.status(400).send('Invalid URL');
  if (!['audio', 'video'].includes(mode)) return res.status(400).send('Invalid mode');

  console.log(`[STREAM] Iniciando descarga: ${filename} (${mode})`);

  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const hasCookies = fs.existsSync(cookiesPath);

  // ── AUDIO MODE: download + extract to a temp file, then send ──
  // yt-dlp's -x/--audio-format post-processing (the actual mp3/ogg re-encode)
  // does not run when the output goes to stdout ('-o -'); it silently returns
  // the raw stream instead (e.g. opus/webm mislabeled as .mp3). Writing to a
  // real file first lets ffmpeg post-processing run correctly, same as video.
  if (mode === 'audio') {
    const tmpDir = os.tmpdir();
    const tmpId = `tubegrab_audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpTemplate = path.join(tmpDir, `${tmpId}.%(ext)s`);
    const tmpFile = path.join(tmpDir, `${tmpId}.${audioFormat}`);

    let args = [
      url,
      '--no-playlist',
      '--ffmpeg-location', currentFfmpegPath,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', 'https://www.google.com/',
      '-x', '--audio-format', audioFormat, '--audio-quality', bitrate || '128',
      '-o', tmpTemplate,
    ];
    if (hasCookies) args.push('--cookies', cookiesPath);

    console.log(`[AUDIO] Descargando a archivo temporal: ${tmpFile}`);

    let clientDisconnected = false;
    req.on('close', () => { clientDisconnected = true; });

    try {
      await ytDlpWrap.execPromise(args, { windowsHide: true });

      if (clientDisconnected) {
        console.log('[AUDIO] Cliente desconectó durante la descarga, limpiando temp...');
        fs.unlink(tmpFile, () => {});
        return;
      }

      if (!fs.existsSync(tmpFile)) {
        console.error('[AUDIO] Archivo temporal no encontrado tras descarga');
        if (!res.headersSent) res.status(500).send('Error: el archivo de audio no se generó');
        return;
      }

      const AUDIO_CONTENT_TYPES = { mp3: 'audio/mpeg', ogg: 'audio/ogg' };
      const stat = fs.statSync(tmpFile);
      res.setHeader('Content-Type', AUDIO_CONTENT_TYPES[audioFormat]);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Content-Length', stat.size);

      const fileStream = fs.createReadStream(tmpFile);
      fileStream.pipe(res);
      fileStream.on('end', () => fs.unlink(tmpFile, () => {}));
      fileStream.on('error', (streamErr) => {
        console.error('[AUDIO FILE ERROR]', streamErr.message);
        fs.unlink(tmpFile, () => {});
        if (!res.headersSent) res.status(500).send('Error al leer archivo de audio');
      });
    } catch (err) {
      console.error('[ERROR] Audio download failed:', err.message);
      fs.unlink(tmpFile, () => {});
      if (!res.headersSent) res.status(500).send('Error al descargar el audio.');
    }
    return;
  }

  // ── VIDEO MODE: download to temp file, then send ──
  // yt-dlp cannot merge bestvideo+bestaudio to stdout, so we write to a temp file first.
  const tmpDir = os.tmpdir();
  const tmpId = `tubegrab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpFile = path.join(tmpDir, `${tmpId}.mp4`);

  const h = quality || '1080';
  let args = [
    url,
    '--no-playlist',
    '--ffmpeg-location', currentFfmpegPath,
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--referer', 'https://www.google.com/',
    '-f', `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[ext=mp4]/best`,
    '--merge-output-format', 'mp4',
    '-o', tmpFile
  ];
  if (hasCookies) args.push('--cookies', cookiesPath);

  console.log(`[VIDEO] Descargando a archivo temporal: ${tmpFile}`);

  let clientDisconnected = false;
  req.on('close', () => { clientDisconnected = true; });

  try {
    // Use exec instead of execStream so yt-dlp can write to a file
    await ytDlpWrap.execPromise(args, { windowsHide: true });

    if (clientDisconnected) {
      console.log('[VIDEO] Cliente desconectó durante la descarga, limpiando temp...');
      fs.unlink(tmpFile, () => {});
      return;
    }

    if (!fs.existsSync(tmpFile)) {
      console.error('[VIDEO] Archivo temporal no encontrado tras descarga');
      if (!res.headersSent) res.status(500).send('Error: el archivo de vídeo no se generó');
      return;
    }

    const stat = fs.statSync(tmpFile);
    console.log(`[VIDEO] Descarga completada (${(stat.size / 1024 / 1024).toFixed(1)} MB). Enviando al cliente...`);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', stat.size);

    const fileStream = fs.createReadStream(tmpFile);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      console.log('[VIDEO] Envío completado, eliminando temporal...');
      fs.unlink(tmpFile, (err) => { if (err) console.warn('[CLEANUP]', err.message); });
    });

    fileStream.on('error', (err) => {
      console.error('[VIDEO FILE ERROR]', err.message);
      fs.unlink(tmpFile, () => {});
      if (!res.headersSent) res.status(500).send('Error al leer archivo de vídeo');
    });

  } catch (err) {
    console.error('[ERROR] Video download failed:', err.message);
    fs.unlink(tmpFile, () => {}); // cleanup on failure
    if (!res.headersSent) {
      res.status(500).send('Error al descargar el vídeo. Intenta con una calidad menor.');
    }
  }
});


app.use((err, req, res, next) => {
  if (err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ error: 'Solo se admiten archivos de audio o vídeo.' });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo es demasiado grande (máx. 300MB).' });
    }
    return res.status(400).json({ error: 'Error al subir el archivo.' });
  }
  console.error('[UNHANDLED ERROR]', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor.' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\n🎵 TubeGrab Pro (yt-dlp) corriendo en http://localhost:${PORT}`);
  console.log(HOST === '0.0.0.0'
    ? '🔒 Modo despliegue: accesible externamente (contenedor/proxy).\n'
    : '🔒 Máxima seguridad: Ejecución local, solo accesible desde esta máquina.\n');
  
  // Only auto-open the system browser for the standalone console build.
  // The Electron desktop app forks this file itself and already shows its
  // own native window pointed at this same URL — opening a browser tab on
  // top of that would be a redundant, distinctly un-premium duplicate.
  if (isWindows && !process.env.TUBEGRAB_ELECTRON) {
    execFile('cmd', ['/c', 'start', `http://localhost:${PORT}`], (err) => {
      if (err) console.warn('[WARN] Could not open browser:', err.message);
    });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] El puerto ${PORT} ya está siendo usado por otra aplicación.`);
    console.error(`[SOLUCIÓN] Cierra cualquier otra terminal o servidor que tengas abierto y vuelve a intentarlo.\n`);
  } else {
    console.error(`\n[ERROR] No se pudo iniciar el servidor:`, err.message);
  }
  
  if (isPkg) {
    console.log('Esta ventana se cerrará en 15 segundos...');
    setTimeout(() => process.exit(1), 15000);
  }
});
