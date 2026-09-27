// Windows: installs a current ffmpeg + ffprobe into bin/ (gyan.dev
// "essentials" build, published on GitHub), pinned by SHA-256.
// ffmpeg parses untrusted input (uploads to convert, downloaded media), so it
// is kept current here instead of relying on ffmpeg-static's older binary.
// yt-dlp finds ffprobe next to the ffmpeg it's given.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSION = '9.0.2';
const ZIP_URL = `https://github.com/GyanD/codexffmpeg/releases/download/${VERSION}/ffmpeg-${VERSION}-essentials_build.zip`;
const ZIP_SHA256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba';
const ALLOWED_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

const binDir = path.join(__dirname, '..', 'bin');
const stamp = path.join(binDir, 'ffmpeg.version');

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === `${VERSION} ${ZIP_SHA256}`
  && fs.existsSync(path.join(binDir, 'ffmpeg.exe')) && fs.existsSync(path.join(binDir, 'ffprobe.exe'))) {
  console.log(`[ffmpeg] ${VERSION} ya instalado.`);
  process.exit(0);
}

function download(url, dest, redirects) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) return reject(new Error(`origen no permitido: ${u.hostname}`));
    https.get(u, { headers: { 'User-Agent': 'tubegrab-postinstall' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return download(new URL(res.headers.location, u).toString(), dest, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tubegrab-ffmpeg-'));
  try {
    const zip = path.join(work, 'ffmpeg.zip');
    console.log(`[ffmpeg] descargando ${VERSION}…`);
    await download(ZIP_URL, zip, 5);
    const got = sha256File(zip);
    if (got !== ZIP_SHA256) throw new Error(`la huella SHA-256 no coincide (${got})`);

    // Windows' own tar (bsdtar) reads zip; Git Bash's GNU tar would not.
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(tar, ['-xf', zip, '-C', work], { stdio: 'ignore' });

    const src = path.join(work, `ffmpeg-${VERSION}-essentials_build`, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) fs.copyFileSync(path.join(src, exe), path.join(binDir, exe));
    fs.writeFileSync(stamp, `${VERSION} ${ZIP_SHA256}\n`);
    console.log(`[ffmpeg] ${VERSION} instalado en ${binDir}`);
  } catch (err) {
    console.error('[ffmpeg] no se pudo instalar:', err.message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
})();
