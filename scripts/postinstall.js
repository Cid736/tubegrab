// Downloads the Linux yt-dlp binary during `npm install` on non-Windows hosts
// (e.g. Render, Railway, Docker). On Windows we keep using the local yt-dlp.exe
// that the developer already has, so this script does nothing there.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const isWindows = process.platform === 'win32';
if (isWindows) {
  console.log('[postinstall] Windows detectado, se omite la descarga de yt-dlp (usa yt-dlp.exe local).');
  require('./fetch-ffmpeg');
  return;
}

// The Dockerfile already installs yt-dlp system-wide via apt/curl — don't
// re-download it if it's already reachable on PATH.
try {
  execSync('command -v yt-dlp', { stdio: 'ignore' });
  console.log('[postinstall] yt-dlp ya está disponible en PATH, se omite la descarga.');
  process.exit(0);
} catch (e) { /* not on PATH, continue to download */ }

const destPath = path.join(__dirname, '..', 'yt-dlp');
if (fs.existsSync(destPath)) {
  console.log('[postinstall] yt-dlp ya existe, se omite la descarga.');
  process.exit(0);
}

const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function download(u, redirectsLeft) {
  https.get(u, (res) => {
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
      res.resume();
      download(res.headers.location, redirectsLeft - 1);
      return;
    }
    if (res.statusCode !== 200) {
      console.error(`[postinstall] Descarga de yt-dlp falló con código ${res.statusCode}`);
      process.exit(0); // don't fail the whole install; server falls back to PATH lookup
      return;
    }
    const fileStream = fs.createWriteStream(destPath);
    res.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close(() => {
        fs.chmodSync(destPath, 0o755);
        console.log('[postinstall] yt-dlp descargado correctamente.');
      });
    });
  }).on('error', (err) => {
    console.error('[postinstall] Error al descargar yt-dlp:', err.message);
    process.exit(0);
  });
}

download(url, 5);
