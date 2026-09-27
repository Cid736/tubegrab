// Windows: puts ffprobe.exe next to ffmpeg-static's ffmpeg.exe. yt-dlp looks
// for ffprobe beside the ffmpeg it's given; without it, embedding a cover in
// MKV and SponsorBlock cutting fail. Same release (and build) as the ffmpeg
// that ffmpeg-static ships, pinned by SHA-256.
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const URL_GZ = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-win32-x64.gz';
const SHA256 = '3a7e2dc003dc2cd1472827e4c7c4f056ae1ae0ae7c5bbc580c99b49827351ba4';
const ALLOWED_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

const dest = path.join(path.dirname(require.resolve('ffmpeg-static')), 'ffprobe.exe');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (fs.existsSync(dest) && sha256(dest) === SHA256) {
  console.log('[ffprobe] ya instalado y verificado.');
  process.exit(0);
}

function get(url, redirects) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
    console.error(`[ffprobe] origen no permitido: ${u.hostname}`);
    process.exit(1);
  }
  https.get(u, { headers: { 'User-Agent': 'tubegrab-postinstall' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
      res.resume();
      get(new URL(res.headers.location, u).toString(), redirects - 1);
      return;
    }
    if (res.statusCode !== 200) {
      console.error(`[ffprobe] descarga falló (${res.statusCode}).`);
      process.exit(1);
    }
    const tmp = `${dest}.download`;
    const out = fs.createWriteStream(tmp);
    res.pipe(zlib.createGunzip()).pipe(out);
    out.on('finish', () => {
      const got = sha256(tmp);
      if (got !== SHA256) {
        fs.rmSync(tmp, { force: true });
        console.error(`[ffprobe] la huella SHA-256 no coincide (${got}); se descarta.`);
        process.exit(1);
      }
      fs.renameSync(tmp, dest);
      console.log(`[ffprobe] instalado en ${dest}`);
    });
  }).on('error', (err) => {
    console.error('[ffprobe] error de red:', err.message);
    process.exit(1);
  });
}

get(URL_GZ, 5);
