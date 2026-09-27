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

// The latest release's binary is only installed if its SHA-256 matches the
// sum list published with it (same check `yt-dlp -U` does).
const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const ALLOWED_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const crypto = require('crypto');

function get(u, redirectsLeft) {
  return new Promise((resolve, reject) => {
    const url = new URL(u);
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return reject(new Error(`origen no permitido: ${url.hostname}`));
    https.get(url, { headers: { 'User-Agent': 'tubegrab-postinstall' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return get(new URL(res.headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  try {
    const [bin, sums] = await Promise.all([get(`${BASE}/yt-dlp`, 5), get(`${BASE}/SHA2-256SUMS`, 5)]);
    const line = sums.toString('utf8').split('\n').find((l) => /\syt-dlp$/.test(l.trim()));
    const expected = line && line.trim().split(/\s+/)[0].toLowerCase();
    const actual = crypto.createHash('sha256').update(bin).digest('hex');
    if (!expected || expected !== actual) throw new Error('la huella SHA-256 no coincide con la publicada');
    fs.writeFileSync(destPath, bin, { mode: 0o755 });
    console.log('[postinstall] yt-dlp descargado y verificado (SHA-256).');
  } catch (err) {
    // Don't fail the whole install; the server falls back to yt-dlp on PATH.
    console.error('[postinstall] No se pudo instalar yt-dlp:', err.message);
  }
})();
