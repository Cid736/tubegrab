#!/usr/bin/env node
// TubeGrab from a terminal: downloads one or more links into a folder,
// showing the progress, with the same engine as the app. It starts its own
// private server on a free local port and stops it when done.
//
//   tubegrab "https://youtu.be/…" --mp3
//   tubegrab enlace1 enlace2 --video=720 --out D:\Vídeos
const { fork } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { safeSaveName } = require('./lib/filenames');

const HELP = `TubeGrab — descarga desde la terminal

Uso: tubegrab <enlace> [más enlaces] [opciones]

  --mp3 | --m4a | --opus | --flac | --wav   audio en ese formato (por defecto: MP3)
  --audio[=formato]                          audio (mp3, m4a, opus, ogg, flac, wav, best)
  --kbps=192                                 calidad del audio (96–320)
  --video[=1080]                             vídeo (best, 2160, 1440, 1080, 720, 480, 360)
  --mp4 | --mkv | --webm                     vídeo en ese formato
  --music                                    modo música (artista y título limpios)
  --lyrics                                   añade la letra (LRCLIB)
  --normalize                                iguala el volumen
  --playlist                                 la playlist entera
  --subs                                     subtítulos (vídeo)
  --out=CARPETA                              dónde guardar (por defecto: aquí)
  -h, --help                                 esta ayuda
`;

function parseArgs(argv) {
  const opts = { mode: 'audio', audioFormat: 'mp3', urls: [], out: process.cwd() };
  for (const a of argv) {
    const m = /^--([a-z0-9]+)(?:=(.*))?$/.exec(a);
    if (a === '-h' || a === '--help') opts.help = true;
    else if (!m && a.startsWith('-')) opts.bad = a;
    else if (!m) opts.urls.push(a);
    else if (['mp3', 'm4a', 'opus', 'flac', 'wav'].includes(m[1])) { opts.mode = 'audio'; opts.audioFormat = m[1]; }
    else if (m[1] === 'audio') { opts.mode = 'audio'; if (m[2]) opts.audioFormat = m[2]; }
    else if (m[1] === 'video') { opts.mode = 'video'; if (m[2]) opts.quality = m[2]; }
    else if (['mp4', 'mkv', 'webm'].includes(m[1])) { opts.mode = 'video'; opts.container = m[1]; }
    else if (m[1] === 'kbps') opts.audioBitrate = m[2];
    else if (m[1] === 'out' && m[2]) opts.out = path.resolve(m[2]);
    else if (['music', 'lyrics', 'normalize', 'playlist'].includes(m[1])) opts[m[1]] = true;
    else if (m[1] === 'subs') opts.subtitles = true;
    else { opts.bad = a; }
  }
  return opts;
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

/** The desktop app's own up-to-date engine, when it's installed on this PC. */
function appEngine() {
  const p = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'tubegrab', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return fs.existsSync(p) ? p : null;
}

const fmtBytes = (n) => (!n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.urls.length) { process.stdout.write(HELP); return opts.help ? 0 : 1; }
  if (opts.bad) { process.stderr.write(`Opción desconocida: ${opts.bad}\n\n${HELP}`); return 1; }
  fs.mkdirSync(opts.out, { recursive: true });

  const port = await freePort();
  const engine = appEngine();
  const server = fork(path.join(__dirname, 'server.js'), [], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TUBEGRAB_ELECTRON: '', ...(engine ? { TUBEGRAB_YTDLP: engine } : {}) },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const stop = () => { try { server.kill(); } catch { /* gone */ } };
  process.on('SIGINT', () => { stop(); process.exit(130); });
  await new Promise((resolve, reject) => {
    server.once('message', (m) => (m && m.type === 'listening' ? resolve() : reject(new Error('no arrancó'))));
    server.once('exit', () => reject(new Error('el servidor se cerró')));
  });

  const base = `http://localhost:${port}`;
  const client = crypto.randomBytes(16).toString('hex');
  const headers = { 'x-client-id': client, 'content-type': 'application/json' };
  const { urls, out, help, bad, ...options } = opts;
  const res = await fetch(`${base}/api/jobs/download`, { method: 'POST', headers, body: JSON.stringify({ ...options, urls }) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) { process.stderr.write(`✗ ${answer.error || `Error ${res.status}`}\n`); stop(); return 1; }
  for (const r of answer.rejected || []) process.stderr.write(`✗ Enlace no soportado: ${r}\n`);

  // Follow the jobs until every one has finished.
  const jobs = new Map();
  const saved = new Set();
  let failed = 0;
  const tty = process.stdout.isTTY;
  const line = (text) => { if (tty) process.stdout.write(`\r\x1b[2K${text.slice(0, (process.stdout.columns || 100) - 1)}`); };
  const events = await fetch(`${base}/api/jobs/events?client=${client}`);
  const reader = events.body.getReader();
  let buf = '';
  const finished = () => jobs.size >= answer.created && [...jobs.values()].every((j) => ['done', 'error', 'canceled'].includes(j.status) && (j.status !== 'done' || saved.has(j.id)));
  while (!finished()) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += Buffer.from(value).toString('utf8');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (\w+)/m.exec(block);
      const data = /^data: (.*)$/m.exec(block);
      if (!ev || !data) continue;
      const list = ev[1] === 'snapshot' ? JSON.parse(data[1]) : ev[1] === 'job' ? [JSON.parse(data[1])] : [];
      for (const job of list) {
        jobs.set(job.id, job);
        if (['running', 'processing', 'queued'].includes(job.status)) {
          const n = [...jobs.keys()].indexOf(job.id) + 1;
          line(`[${n}/${answer.created}] ${job.title} — ${job.stage}${job.progress !== null && job.progress !== undefined ? ` ${job.progress}%` : ''}${job.speed ? ` · ${fmtBytes(job.speed)}/s` : ''}`);
        } else if (job.status === 'done' && !saved.has(job.id)) {
          saved.add(job.id);
          for (let n = 0; n < (job.files || []).length; n++) {
            const r = await fetch(`${base}/api/jobs/${job.id}/file?client=${client}&n=${n}`);
            if (!r.ok) continue;
            let target = path.join(out, safeSaveName(job.files[n].name));
            const ext = path.extname(target);
            const data = Buffer.from(await r.arrayBuffer());
            for (let k = 1; ; k++) {
              try { fs.writeFileSync(target, data, { flag: 'wx' }); break; } catch (err) { if (err.code !== 'EEXIST' || k > 999) throw err; }
              target = path.join(out, `${path.basename(job.files[n].name, ext)} (${k})${ext}`);
            }
            line('');
            process.stdout.write(`${tty ? '\r' : ''}✓ ${target}\n`);
          }
        } else if (job.status === 'error' && !saved.has(job.id)) {
          saved.add(job.id);
          failed += 1;
          line('');
          process.stdout.write(`${tty ? '\r' : ''}✗ ${job.title}: ${job.error}\n`);
        }
      }
    }
  }
  stop();
  return failed ? 2 : 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code), (err) => { process.stderr.write(`✗ ${err.message}\n`); process.exit(1); });
}

module.exports = { parseArgs };
