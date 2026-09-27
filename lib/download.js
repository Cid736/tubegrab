// yt-dlp download jobs: URL allowlist, option -> argv mapping, progress parsing.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Only sites with a dedicated yt-dlp extractor; the generic extractor is also
// disabled (--ies default,-generic) so a URL can never make yt-dlp fetch an
// arbitrary host (SSRF when self-hosted).
const ALLOWED_SITES = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com',
  'vimeo.com', 'soundcloud.com', 'twitter.com', 'x.com', 'tiktok.com',
  'instagram.com', 'facebook.com', 'fb.watch', 'twitch.tv', 'dailymotion.com', 'dai.ly',
  'reddit.com', 'redd.it', 'bandcamp.com', 'mixcloud.com', 'bilibili.com',
  'streamable.com', 'rumble.com', 'odysee.com', 'bsky.app',
];

const AUDIO_FORMATS = {
  best: { label: 'Original', ytdlp: 'best', lossy: false, thumbnail: false },
  mp3: { label: 'MP3', ytdlp: 'mp3', lossy: true, thumbnail: true },
  m4a: { label: 'M4A', ytdlp: 'm4a', lossy: true, thumbnail: true },
  opus: { label: 'OPUS', ytdlp: 'opus', lossy: true, thumbnail: true },
  ogg: { label: 'OGG', ytdlp: 'vorbis', lossy: true, thumbnail: true },
  flac: { label: 'FLAC', ytdlp: 'flac', lossy: false, thumbnail: true },
  wav: { label: 'WAV', ytdlp: 'wav', lossy: false, thumbnail: false },
};
const AUDIO_BITRATES = ['96', '128', '160', '192', '256', '320'];
const VIDEO_QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360'];
const VIDEO_CONTAINERS = {
  mp4: { sort: 'vcodec:h264,acodec:m4a', format: 'bv*+ba/b', thumbnail: true },
  mkv: { sort: '', format: 'bv*+ba/b', thumbnail: true },
  webm: { sort: 'vcodec:vp9,acodec:opus', format: 'bv*[ext=webm]+ba[ext=webm]/bv*+ba/b', thumbnail: false },
};
const MAX_PLAYLIST_ITEMS = 300;

function normalizeMediaUrl(raw) {
  let value = String(raw || '').trim();
  if (!value || value.length > 2048) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!ALLOWED_SITES.some((d) => host === d || host.endsWith(`.${d}`))) return null;
  return url.toString();
}

function isYouTube(url) {
  const host = new URL(url).hostname.toLowerCase();
  return ['youtube.com', 'youtu.be', 'youtube-nocookie.com'].some((d) => host === d || host.endsWith(`.${d}`));
}

/** Validated, normalized options from the request body (unknown values fall back to defaults). */
function parseDownloadOptions(body) {
  const mode = body.mode === 'video' ? 'video' : 'audio';
  const audioFormat = Object.prototype.hasOwnProperty.call(AUDIO_FORMATS, body.audioFormat) ? body.audioFormat : 'mp3';
  const audioBitrate = AUDIO_BITRATES.includes(String(body.audioBitrate)) ? String(body.audioBitrate) : '192';
  const quality = VIDEO_QUALITIES.includes(String(body.quality)) ? String(body.quality) : '1080';
  const container = Object.prototype.hasOwnProperty.call(VIDEO_CONTAINERS, body.container) ? body.container : 'mp4';
  return {
    mode, audioFormat, audioBitrate, quality, container,
    metadata: body.metadata !== false,
    subtitles: body.subtitles === true && mode === 'video',
    sponsorblock: body.sponsorblock === true,
    playlist: body.playlist === true,
  };
}

function describeOptions(opts) {
  if (opts.mode === 'audio') {
    const f = AUDIO_FORMATS[opts.audioFormat];
    return f.lossy ? `${f.label} ${opts.audioBitrate} kbps` : f.label;
  }
  const q = opts.quality === 'best' ? 'Mejor calidad' : `${opts.quality}p`;
  return `${opts.container.toUpperCase()} ${q}`;
}

function buildArgs(url, opts, env) {
  const args = [
    // Never pick up a yt-dlp config file from the machine (it could add --exec etc.).
    '--ignore-config',
    '--no-playlist', '--ies', 'default,-generic',
    '--ffmpeg-location', env.ffmpegPath,
    '--newline', '--no-colors', '--progress', '--quiet', '--no-simulate', '--no-mtime',
    '--socket-timeout', '30', '--retries', '5',
    '--progress-template', 'download:TGP %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s',
    '--print', 'before_dl:TGTITLE %(title)s',
    // A bare word would be read as a field name (printing "NA"); needs a template.
    '--print', 'post_process:TGPOST %(id)s',
    '--print', 'after_move:TGFILE %(filepath)s',
    '-o', path.join(env.dir, '%(title).150B.%(ext)s'),
  ];
  if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
  if (env.cookiesPath) args.push('--cookies', env.cookiesPath);

  if (opts.mode === 'audio') {
    const f = AUDIO_FORMATS[opts.audioFormat];
    args.push('-f', 'ba/b', '-x', '--audio-format', f.ytdlp, '--audio-quality', f.lossy ? `${opts.audioBitrate}K` : '0');
    if (opts.metadata) {
      args.push('--embed-metadata');
      if (f.thumbnail) args.push('--embed-thumbnail');
    }
  } else {
    const c = VIDEO_CONTAINERS[opts.container];
    const res = opts.quality === 'best' ? 'res' : `res:${opts.quality}`;
    args.push('-f', c.format, '-S', [res, 'fps', c.sort].filter(Boolean).join(','), '--merge-output-format', opts.container);
    if (opts.metadata) {
      args.push('--embed-metadata', '--embed-chapters');
      if (c.thumbnail) args.push('--embed-thumbnail');
    }
    if (opts.subtitles) args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'es,es-419,en', '--embed-subs');
  }
  if (opts.sponsorblock && isYouTube(url)) args.push('--sponsorblock-remove', 'sponsor,selfpromo,interaction');
  // '--' ends option parsing: the URL can never be read as a flag.
  args.push('--', url);
  return args;
}

const num = (v) => (v === undefined || v === 'NA' || v === 'None' ? null : Number(v));

function friendlyError(stderr) {
  const line = stderr.split('\n').reverse().find((l) => l.startsWith('ERROR:')) || '';
  if (/Sign in to confirm|age-restricted|confirm your age|login required/i.test(line)) return 'El sitio pide iniciar sesión (vídeo con restricción de edad o anti-bots). Coloca un cookies.txt junto a la app.';
  if (/Private video|private/i.test(line)) return 'El vídeo es privado.';
  if (/HTTP Error 403/.test(line)) return 'El sitio bloqueó la descarga (403). Prueba a actualizar el motor de descargas.';
  if (/Unsupported URL/i.test(line)) return 'Enlace no soportado.';
  if (/Video unavailable|not available/i.test(line)) return 'El vídeo no está disponible.';
  if (/Requested format is not available/i.test(line)) return 'Esa calidad o formato no está disponible para este vídeo.';
  const clean = line.replace(/^ERROR:\s*/, '').replace(/\[[^\]]+\]\s*/g, '').trim();
  return clean ? clean.slice(0, 200) : 'La descarga falló.';
}

function runDownload(url, opts, env) {
  return (job, ctx) => new Promise((resolve, reject) => {
    const args = buildArgs(url, opts, { ...env, dir: ctx.dir });
    const proc = spawn(env.ytDlpPath, args, { windowsHide: true });
    ctx.setProcess(proc);

    let stderr = '';
    let finalPath = null;
    let lastBytes = -1;
    let stream = 1;
    const twoStreams = opts.mode === 'video';
    let buffer = '';

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('TGP ')) {
          const [downloaded, total, estimate, speed, eta] = line.slice(4).split(' ').map(num);
          const size = total || estimate;
          if (downloaded !== null && downloaded < lastBytes) stream += 1;
          lastBytes = downloaded ?? lastBytes;
          const what = twoStreams ? (stream === 1 ? 'vídeo' : 'audio') : '';
          ctx.update({
            status: 'running',
            stage: what ? `Descargando ${what}` : 'Descargando',
            progress: size && downloaded !== null ? Math.min(99, Math.round((downloaded / size) * 100)) : null,
            speed: speed !== null ? Math.round(speed) : null,
            eta: eta !== null ? Math.round(eta) : null,
          });
        } else if (line.startsWith('TGTITLE ')) {
          ctx.update({ title: line.slice(8).trim() || job.title });
        } else if (line.startsWith('TGPOST')) {
          ctx.update({ status: 'processing', stage: opts.mode === 'audio' ? 'Convirtiendo audio…' : 'Uniendo vídeo y audio…', progress: null, speed: null, eta: null });
        } else if (line.startsWith('TGFILE ')) {
          finalPath = line.slice(7).trim();
        }
      }
    });
    proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-8000); });
    proc.on('error', (err) => reject(new Error(`No se pudo iniciar yt-dlp: ${err.message}`)));
    proc.on('close', (code) => {
      if (ctx.isCanceled()) return reject(new Error('Cancelado'));
      // Only accept a file that really lives inside this job's own directory.
      const resolved = finalPath && path.resolve(finalPath);
      if (code === 0 && resolved && resolved.startsWith(path.resolve(ctx.dir) + path.sep) && fs.existsSync(resolved)) {
        return resolve(resolved);
      }
      reject(new Error(friendlyError(stderr)));
    });
  });
}

/** Expands a playlist URL into its entries (flat, no download). */
function expandPlaylist(url, env) {
  return new Promise((resolve) => {
    const args = ['--ignore-config', '--flat-playlist', '-J', '--ies', 'default,-generic', '--playlist-end', String(MAX_PLAYLIST_ITEMS), '--no-warnings'];
    if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
    if (env.cookiesPath) args.push('--cookies', env.cookiesPath);
    args.push('--', url);
    execFile(env.ytDlpPath, args, { windowsHide: true, timeout: 90_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      let data;
      try { data = JSON.parse(stdout); } catch { return resolve(null); }
      if (data._type !== 'playlist' || !Array.isArray(data.entries)) return resolve(null);
      const entries = data.entries
        .map((e) => ({ url: normalizeMediaUrl(e.url || e.webpage_url || ''), title: String(e.title || '').slice(0, 300) }))
        .filter((e) => e.url)
        .slice(0, MAX_PLAYLIST_ITEMS);
      resolve({ title: String(data.title || 'Playlist').slice(0, 300), entries });
    });
  });
}

module.exports = {
  ALLOWED_SITES, normalizeMediaUrl, parseDownloadOptions, describeOptions, runDownload, expandPlaylist, buildArgs,
};
