const express = require('express');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap-extended').default;
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

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
    // In Docker/Linux, we'll install it in the system path
    ytDlpPath = 'yt-dlp';
    // ffmpeg-static usually handles the path correctly on Linux too
  }
}

const ytDlpWrap = new YTDlpWrap(ytDlpPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Main API endpoint to verify URL and get metadata
app.post('/api/download', async (req, res) => {
  const { url, mode, quality, audioBitrate } = req.body;

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
    
    const metadata = await ytDlpWrap.getVideoInfo([url, ...metadataArgs]);
    const title = metadata.title || 'video';
    
    // Clean filename
    const safeTitle = title.replace(/[^\w\s-]/gi, '').trim();
    const ext = mode === 'audio' ? 'mp3' : 'mp4';
    const filename = `${safeTitle}.${ext}`;

    // Return a URL that the frontend will use to start the stream
    const streamUrl = `/api/stream?url=${encodeURIComponent(url)}&mode=${mode}&quality=${quality}&bitrate=${audioBitrate}&filename=${encodeURIComponent(filename)}`;

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
  const { url, mode } = req.query;
  const quality = VALID_QUALITIES.includes(req.query.quality) ? req.query.quality : '1080';
  const bitrate = VALID_BITRATES.includes(req.query.bitrate)   ? req.query.bitrate  : '128';
  const rawFilename = req.query.filename || '';
  const filename = rawFilename.replace(/[^\w\s.\-]/gi, '').trim() || 'download';

  if (!url) return res.status(400).send('URL missing');
  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+/i;
  if (!ytRegex.test(url)) return res.status(400).send('Invalid URL');

  console.log(`[STREAM] Iniciando descarga: ${filename} (${mode})`);

  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const hasCookies = fs.existsSync(cookiesPath);

  // ── AUDIO MODE: pipe directly to response (no merge needed) ──
  if (mode === 'audio') {
    let args = [
      url,
      '--no-playlist',
      '--ffmpeg-location', currentFfmpegPath,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', 'https://www.google.com/',
      '-o', '-',
      '-x', '--audio-format', 'mp3', '--audio-quality', bitrate || '128'
    ];
    if (hasCookies) args.push('--cookies', cookiesPath);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    try {
      const ytDlpProcess = ytDlpWrap.execStream(args);

      ytDlpProcess.on('error', (err) => {
        console.error('[STREAM ERROR]', err);
        if (!res.headersSent) {
          res.status(500).send('Error durante el procesamiento del audio');
        }
      });

      ytDlpProcess.pipe(res);

      req.on('close', () => {
        console.log('[STREAM] Cliente desconectado, deteniendo yt-dlp');
        if (ytDlpProcess.ytDlpProcess) ytDlpProcess.ytDlpProcess.kill();
      });
    } catch (err) {
      console.error('[ERROR] Audio stream failed:', err.message);
      if (!res.headersSent) res.status(500).send('Error al iniciar la descarga de audio');
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
    await ytDlpWrap.execPromise(args);

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


const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 TubeGrab Pro (yt-dlp) corriendo en http://localhost:${PORT}`);
  console.log(`🔒 Máxima seguridad: Ejecución local, IP protegida por tu propia conexión.\n`);
  
  // Abrir el navegador automáticamente (compatible con pkg)
  execFile('cmd', ['/c', 'start', `http://localhost:${PORT}`]);
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
