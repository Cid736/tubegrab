const express = require('express');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap-extended').default;
const ffmpegPath = require('ffmpeg-static');
const { exec } = require('child_process');
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
  const { url, mode, quality, bitrate, filename } = req.query;

  if (!url) return res.status(400).send('URL missing');

  console.log(`[STREAM] Iniciando descarga: ${filename} (${mode})`);

  let args = [
    url,
    '--no-playlist',
    '--ffmpeg-location', currentFfmpegPath,
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--referer', 'https://www.google.com/',
    '-o', '-' 
  ];

  // Si existe un archivo cookies.txt en la raíz, usarlo
  if (fs.existsSync(path.join(__dirname, 'cookies.txt'))) {
    args.push('--cookies', path.join(__dirname, 'cookies.txt'));
  }

  if (mode === 'audio') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', bitrate || '128');
    res.setHeader('Content-Type', 'audio/mpeg');
  } else {
    // For video, we try to get the requested quality
    // 'bestvideo[height<=?1080]+bestaudio/best'
    const h = quality || '1080';
    args.push('-f', `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`);
    res.setHeader('Content-Type', 'video/mp4');
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  try {
    const ytDlpProcess = ytDlpWrap.execStream(args);
    
    ytDlpProcess.on('error', (err) => {
      console.error('[STREAM ERROR]', err);
      if (!res.headersSent) {
        res.status(500).send('Error durante el procesamiento del video');
      }
    });

    // Pipe the stdout of yt-dlp to the express response
    ytDlpProcess.pipe(res);

    // Handle client disconnect
    req.on('close', () => {
      console.log('[STREAM] Cliente desconectado, deteniendo yt-dlp');
      // ytDlpProcess is a Readable stream wrapping the process
      if (ytDlpProcess.ytDlpProcess) {
        ytDlpProcess.ytDlpProcess.kill();
      }
    });

  } catch (err) {
    console.error('[ERROR] Stream failed:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Error al iniciar la descarga');
    }
  }
});

// Proxy-download is now redundant but we'll keep it as a wrapper for /api/stream if needed 
// or just point the frontend directly to /api/stream
app.get('/api/proxy-download', (req, res) => {
  const { url } = req.query;
  // If it's already a relative /api/stream URL, redirect to it
  if (url && url.startsWith('/api/stream')) {
    return res.redirect(url);
  }
  res.status(404).send('Not found');
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 TubeGrab Pro (yt-dlp) corriendo en http://localhost:${PORT}`);
  console.log(`🔒 Máxima seguridad: Ejecución local, IP protegida por tu propia conexión.\n`);
  
  // Abrir el navegador automáticamente (compatible con pkg)
  exec(`cmd /c start http://localhost:${PORT}`);
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
