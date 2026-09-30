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
// Subtitle languages offered (yt-dlp --sub-langs patterns).
const SUB_LANGS = {
  es: 'es,es-419,es-ES', en: 'en,en-US,en-GB', 'es,en': 'es,es-419,es-ES,en,en-US,en-GB',
  fr: 'fr,fr-FR', de: 'de,de-DE', it: 'it,it-IT', pt: 'pt,pt-BR,pt-PT', ja: 'ja', ko: 'ko',
};
const SUB_MODES = ['embed', 'file'];
const RATE_LIMITS = ['500K', '1M', '2M', '5M', '10M', '20M'];
// "Artist - Title (Official Video)" → artist / title, without the noise.
const TITLE_NOISE = String.raw`(?i)\s*[\(\[][^\)\]]*\b(official|oficial|video|v[ií]deo|audio|lyrics?|letra|visuali[sz]er|hd|4k|remaster(ed)?|mv)\b[^\)\]]*[\)\]]`;
// On Windows yt-dlp writes to a pipe in the ANSI code page: "Canción" came
// out as "Canci�n" and "IF⧸ELSE" as "IFELSE", so titles were garbled and the
// printed file path didn't exist (the download "failed" at the very end).
const UTF8 = ['--encoding', 'utf-8'];

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

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** "90", "1:30", "0:01:30.5" -> seconds; '' -> null; anything else -> NaN. */
function parseTimestamp(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (!/^\d{1,5}(:[0-5]?\d){0,2}(\.\d{1,3})?$/.test(value)) return NaN;
  const seconds = value.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
  return seconds <= 24 * 3600 ? seconds : NaN;
}

/**
 * Validated, normalized options from the request body (unknown values fall
 * back to defaults). `sectionStart/End` may come back NaN: the caller rejects.
 */
// File-name template: our own tags only, turned into a yt-dlp template here.
// No "/" "\\" ":" "%"… can get in, so a name can never leave the job folder
// nor reach other yt-dlp fields.
const NAME_TOKENS = {
  title: '%(title).150B',
  artist: '%(artist,creator,uploader|Desconocido).80B',
  channel: '%(channel,uploader|).80B',
  album: '%(album|).80B',
  date: '%(upload_date>%Y-%m-%d|)s',
  year: '%(upload_date>%Y|)s',
  track: '%(track_number,playlist_index|)s',
  id: '%(id)s',
};
const NAME_LITERAL = /^[\p{L}\p{N} _\-.,()[\]!&'+#@]*$/u;
/** '{artist} - {title}' → a yt-dlp output template (without extension), or null if it isn't valid. */
function nameTemplate(raw) {
  const tpl = String(raw || '').trim();
  // No leading dot and no "..": never a hidden or look-alike parent name.
  if (!tpl || tpl.length > 120 || !/\{(title|id)\}/.test(tpl) || /^\.|\.\./.test(tpl)) return null;
  const parts = tpl.split(/(\{[a-z]+\})/);
  let out = '';
  for (const part of parts) {
    const token = /^\{([a-z]+)\}$/.exec(part);
    if (token) {
      if (!has(NAME_TOKENS, token[1])) return null;
      out += NAME_TOKENS[token[1]];
    } else {
      if (!NAME_LITERAL.test(part)) return null;
      out += part;
    }
  }
  return out;
}

function parseDownloadOptions(body) {
  const mode = body.mode === 'video' ? 'video' : 'audio';
  const audioFormat = has(AUDIO_FORMATS, body.audioFormat) ? body.audioFormat : 'mp3';
  const audioBitrate = AUDIO_BITRATES.includes(String(body.audioBitrate)) ? String(body.audioBitrate) : '192';
  const quality = VIDEO_QUALITIES.includes(String(body.quality)) ? String(body.quality) : '1080';
  const container = has(VIDEO_CONTAINERS, body.container) ? body.container : 'mp4';
  const subtitles = body.subtitles === true && mode === 'video';
  return {
    mode, audioFormat, audioBitrate, quality, container,
    metadata: body.metadata !== false,
    subtitles,
    subLangs: subtitles && has(SUB_LANGS, body.subLangs) ? body.subLangs : 'es,en',
    subMode: subtitles && SUB_MODES.includes(body.subMode) ? body.subMode : 'embed',
    sponsorblock: body.sponsorblock === true,
    playlist: body.playlist === true,
    music: body.music === true && mode === 'audio',
    lyrics: body.lyrics === true && mode === 'audio',
    nameTemplate: nameTemplate(body.nameTemplate) ? String(body.nameTemplate).trim() : null,
    chapters: body.chapters === true,
    sectionStart: parseTimestamp(body.sectionStart),
    sectionEnd: parseTimestamp(body.sectionEnd),
    rateLimit: RATE_LIMITS.includes(body.rateLimit) ? body.rateLimit : null,
  };
}

/** Error message for invalid options, or null. */
function validateOptions(opts) {
  const { sectionStart: s, sectionEnd: e } = opts;
  if (Number.isNaN(s) || Number.isNaN(e) || (s !== null && e !== null && e <= s)) {
    return 'Tramo no válido. Usa segundos o mm:ss, y que "Hasta" sea mayor que "Desde".';
  }
  if (opts.chapters && (s !== null || e !== null)) return 'No se puede recortar y dividir por capítulos a la vez.';
  return null;
}

const clock = (sec) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

function describeOptions(opts) {
  let text;
  if (opts.mode === 'audio') {
    const f = AUDIO_FORMATS[opts.audioFormat];
    text = f.lossy ? `${f.label} ${opts.audioBitrate} kbps` : f.label;
  } else {
    const q = opts.quality === 'best' ? 'Mejor calidad' : `${opts.quality}p`;
    text = `${opts.container.toUpperCase()} ${q}`;
  }
  if (opts.sectionStart !== null || opts.sectionEnd !== null) {
    text += ` · ${clock(opts.sectionStart || 0)}–${opts.sectionEnd !== null ? clock(opts.sectionEnd) : 'fin'}`;
  }
  if (opts.chapters) text += ' · por capítulos';
  if (opts.lyrics) text += ' · letras';
  return text;
}

function buildArgs(url, opts, env) {
  const args = [
    // Never pick up a yt-dlp config file from the machine (it could add --exec etc.).
    '--ignore-config',
    ...UTF8,
    '--no-playlist', '--ies', 'default,-generic',
    '--ffmpeg-location', env.ffmpegPath,
    '--newline', '--no-colors', '--progress', '--quiet', '--no-simulate', '--no-mtime',
    '--socket-timeout', '30', '--retries', '5',
    '--progress-template', 'download:TGP %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s',
    '--print', 'before_dl:TGTITLE %(title)s',
    // A bare word would be read as a field name (printing "NA"); needs a template.
    '--print', 'post_process:TGPOST %(id)s',
    '--print', 'after_move:TGFILE %(filepath)s',
    // Artist / album… as JSON (missing fields are left out), for folders and lyrics.
    '--print', 'after_move:TGMETA %(.{artist,album,album_artist,track,uploader,title,duration,release_year})j',
    // Music mode: "Artist - Title" (the artist parsed out of the title, or
    // YouTube Music's own), otherwise just the title.
    // A template of the user's own, or music mode's "Artist - Title", or the title.
    '-o', path.join(env.dir, opts.nameTemplate ? `${nameTemplate(opts.nameTemplate)}.%(ext)s`
      : opts.music ? '%(artist&{} - |)s%(title).150B.%(ext)s' : '%(title).150B.%(ext)s'),
  ];
  if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
  if (env.cookiesPath) args.push('--cookies', env.cookiesPath);
  if (opts.rateLimit) args.push('--limit-rate', opts.rateLimit);

  if (opts.mode === 'audio') {
    const f = AUDIO_FORMATS[opts.audioFormat];
    args.push('-f', 'ba/b', '-x', '--audio-format', f.ytdlp, '--audio-quality', f.lossy ? `${opts.audioBitrate}K` : '0');
    if (opts.metadata || opts.music) {
      args.push('--embed-metadata');
      if (f.thumbnail) args.push('--embed-thumbnail');
    }
    if (opts.music) {
      // "Artist - Title (Official Video)" → artist + clean title (also in the
      // file name); YouTube Music's own artist/track fields win when present.
      args.push(
        '--parse-metadata', 'title:(?P<artist>.+?) - (?P<title>.+)',
        '--replace-in-metadata', 'title', TITLE_NOISE, '',
        '--parse-metadata', '%(track|)s:(?P<title>.+)',
      );
      // Square cover art, like an album sleeve.
      if (f.thumbnail) {
        args.push('--convert-thumbnails', 'jpg', '--ppa',
          `ThumbnailsConvertor+FFmpeg_o:-c:v mjpeg -qmin 1 -qscale:v 2 -vf crop="'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'"`);
      }
    }
  } else {
    const c = VIDEO_CONTAINERS[opts.container];
    const res = opts.quality === 'best' ? 'res' : `res:${opts.quality}`;
    args.push('-f', c.format, '-S', [res, 'fps', c.sort].filter(Boolean).join(','), '--merge-output-format', opts.container);
    if (opts.metadata) {
      args.push('--embed-metadata', '--embed-chapters');
      if (c.thumbnail) args.push('--embed-thumbnail');
    }
    if (opts.subtitles) {
      args.push('--write-subs', '--write-auto-subs', '--sub-langs', SUB_LANGS[opts.subLangs]);
      // As a separate .srt file, or inside the video.
      args.push(...(opts.subMode === 'file' ? ['--convert-subs', 'srt'] : ['--embed-subs']));
    }
  }
  if (opts.sectionStart !== null || opts.sectionEnd !== null) {
    const end = opts.sectionEnd !== null ? opts.sectionEnd : 'inf';
    // Exact cuts (re-encodes around them); without it the piece starts at the
    // previous keyframe, several seconds early.
    args.push('--download-sections', `*${opts.sectionStart || 0}-${end}`, '--force-keyframes-at-cuts');
  }
  if (opts.chapters) {
    args.push('--split-chapters', '-o', `chapter:${path.join(env.dir, 'capitulos', '%(section_number)02d - %(section_title).120B.%(ext)s')}`);
  }
  if (opts.sponsorblock && isYouTube(url)) args.push('--sponsorblock-remove', 'sponsor,selfpromo,interaction');
  // '--' ends option parsing: the URL can never be read as a flag.
  args.push('--', url);
  return args;
}

const num = (v) => (v === undefined || v === 'NA' || v === 'None' ? null : Number(v));

// Errors that retrying can't fix (anything else — 403s, dropped connections —
// is often YouTube throttling parallel downloads and worth one more try).
const PERMANENT_ERROR = /Sign in|logged-in|log in|login required|--cookies|age-restricted|confirm your age|Private video|video is private|unavailable|not available|Unsupported URL|Requested format|members-only|copyright/i;

function lastErrorLine(stderr) {
  return stderr.split('\n').reverse().find((l) => l.startsWith('ERROR:')) || '';
}

function friendlyError(stderr) {
  const line = lastErrorLine(stderr);
  if (/Sign in to confirm|age-restricted|confirm your age|login required|logged-in|--cookies/i.test(line)) return 'El sitio pide iniciar sesión (restricción de edad o anti-bots). Añade un archivo cookies.txt: en la app, Ajustes → Descargas → Cookies.';
  if (/Private video|video is private/i.test(line)) return 'El vídeo es privado.';
  if (/HTTP Error 403/.test(line)) return 'El sitio bloqueó la descarga (403). Prueba a actualizar el motor de descargas.';
  if (/Unsupported URL/i.test(line)) return 'Enlace no soportado.';
  if (/unavailable|not available/i.test(line)) return 'El vídeo no está disponible.';
  if (/Requested format is not available/i.test(line)) return 'Esa calidad o formato no está disponible para este vídeo.';
  const clean = line.replace(/^ERROR:\s*/, '').replace(/\[[^\]]+\]\s*/g, '').trim();
  return clean ? clean.slice(0, 200) : 'La descarga falló.';
}

const AUTO_RETRY_DELAY_MS = 4000;

function runDownload(url, opts, env) {
  return async (job, ctx) => {
    const meta = {};
    let files;
    try {
      files = await downloadOnce(url, opts, env, job, ctx, meta);
    } catch (err) {
      if (ctx.isCanceled() || typeof err.stderr !== 'string' || PERMANENT_ERROR.test(lastErrorLine(err.stderr))) throw err;
      ctx.update({ stage: 'Reintentando…', progress: null, speed: null, eta: null });
      await new Promise((r) => setTimeout(r, AUTO_RETRY_DELAY_MS));
      if (ctx.isCanceled()) throw new Error('Cancelado');
      files = await downloadOnce(url, opts, env, job, ctx, meta);
    }
    if (opts.lyrics && files.length === 1 && !opts.chapters) {
      ctx.update({ status: 'processing', stage: 'Buscando letra…', progress: null, speed: null, eta: null });
      // The artist yt-dlp found (music mode, YouTube Music) or, failing that,
      // "Artist - Title" in the video title; the channel as a last resort.
      const split = /^(.+?)\s+[-–—]\s+(.+)$/.exec(meta.title || '');
      const artist = meta.artist || (split && split[1]) || meta.uploader;
      const title = meta.artist ? meta.title : (split ? split[2] : meta.title);
      try {
        const lrc = await require('./tags').addLyrics({
          ffmpegPath: env.ffmpegPath, file: files[0], artist, title, album: meta.album, duration: meta.duration, fetchImpl: env.fetchImpl,
        });
        if (lrc) files.push(lrc);
      } catch { /* no lyrics (offline, not found…): the song is still there */ }
    }
    return files;
  };
}

/**
 * yt-dlp's format list → rough sizes for the size estimate before downloading:
 * { audio: bytes of the best audio-only stream, video: { height: bytes of the
 * best video at that height } } (streams that carry sound count as video).
 * Only numbers leave here.
 */
function formatSizes(info) {
  const out = { audio: null, video: {} };
  const duration = Number(info && info.duration) || 0;
  const sizeOf = (f) => {
    const n = Number(f.filesize) || Number(f.filesize_approx) || (Number(f.tbr) && duration ? Number(f.tbr) * duration * 125 : 0);
    return Number.isFinite(n) && n > 0 && n < 1e12 ? Math.round(n) : 0;
  };
  for (const f of Array.isArray(info && info.formats) ? info.formats.slice(0, 500) : []) {
    if (!f || typeof f !== 'object') continue;
    const size = sizeOf(f);
    if (!size) continue;
    const hasVideo = f.vcodec && f.vcodec !== 'none';
    const hasAudio = f.acodec && f.acodec !== 'none';
    const height = Number(f.height);
    if (hasVideo && Number.isInteger(height) && height > 0 && height <= 4320) {
      if (!out.video[height] || size > out.video[height]) out.video[height] = size;
    } else if (hasAudio && !hasVideo && (!out.audio || size > out.audio)) {
      out.audio = size;
    }
  }
  return out;
}

// Only these fields, as short plain strings/numbers, ever leave the TGMETA line.
const META_FIELDS = ['artist', 'album', 'album_artist', 'track', 'uploader', 'title', 'duration', 'release_year'];
function parseMeta(json) {
  let raw;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const meta = {};
  for (const k of META_FIELDS) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) meta[k] = v;
    else if (typeof v === 'string' && v.trim()) meta[k] = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  }
  return meta;
}

function downloadOnce(url, opts, env, job, ctx, metaOut = {}) {
  return new Promise((resolve, reject) => {
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
        } else if (line.startsWith('TGMETA ')) {
          const meta = parseMeta(line.slice(7));
          if (meta) { Object.assign(metaOut, meta); ctx.update({ meta }); }
        }
      }
    });
    proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-8000); });
    proc.on('error', (err) => reject(new Error(`No se pudo iniciar yt-dlp: ${err.message}`)));
    proc.on('close', (code) => {
      if (ctx.isCanceled()) return reject(new Error('Cancelado'));
      if (code === 0) {
        // Only accept a file that really lives inside this job's own directory.
        const resolved = finalPath && path.resolve(finalPath);
        let main = resolved && resolved.startsWith(path.resolve(ctx.dir) + path.sep) && fs.existsSync(resolved) ? resolved : null;
        // Safety net: the job's folder holds only this download, so if the
        // printed path doesn't match, the one finished file in it is the result.
        if (!main) main = finishedFile(ctx.dir);
        const extra = opts.subtitles && opts.subMode === 'file' ? filesIn(ctx.dir, /\.srt$/i) : [];
        const chapters = opts.chapters ? filesIn(path.join(ctx.dir, 'capitulos'), /./) : [];
        if (chapters.length) {
          ctx.update({ status: 'processing', stage: 'Etiquetando capítulos…', progress: null });
          return tagChapters(chapters, env.ffmpegPath, job.title).then(() => resolve(chapters), () => resolve(chapters));
        }
        if (main) return resolve([main, ...extra]);
      }
      const err = new Error(friendlyError(stderr));
      err.stderr = stderr;
      reject(err);
    });
  });
}

/** The single finished media file in a job folder (ignores partials, thumbnails, subtitles). */
function finishedFile(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return null; }
  const media = names.filter((n) => !/\.(part|ytdl|temp|tmp|jpe?g|png|webp|vtt|srt|ass|json|description)$/i.test(n) && !/\.f\d+\./.test(n))
    .map((n) => path.join(dir, n))
    .filter((p) => fs.statSync(p).isFile());
  return media.length === 1 ? media[0] : null;
}

/**
 * Chapter files inherit the whole video's tags; give each its own title and
 * track number (album = the video), by remuxing without re-encoding.
 */
async function tagChapters(files, ffmpegPath, album) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = path.extname(file);
    const title = path.basename(file, ext).replace(/^\d+ - /, '');
    const tmp = `${file}.tag${ext}`;
    const ok = await new Promise((resolve) => {
      const p = spawn(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0', '-c', 'copy',
        '-metadata', `title=${title}`, '-metadata', `track=${i + 1}/${files.length}`, '-metadata', `album=${album}`, tmp], { windowsHide: true });
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
    });
    if (ok) fs.renameSync(tmp, file); else fs.rmSync(tmp, { force: true });
  }
}

/** Finished files in `dir` whose name matches `re`, sorted by name. */
function filesIn(dir, re) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => re.test(n) && !/\.(part|ytdl|temp|tmp)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((n) => path.join(dir, n))
    .filter((p) => fs.statSync(p).isFile());
}

const httpsThumb = (e) => {
  const list = Array.isArray(e.thumbnails) ? e.thumbnails : [];
  const pick = list.filter((t) => t && typeof t.url === 'string' && t.url.startsWith('https://'))
    .sort((a, b) => (a.width || 0) - (b.width || 0));
  const mid = pick.find((t) => (t.width || 0) >= 300) || pick[pick.length - 1];
  if (mid) return mid.url;
  return typeof e.thumbnail === 'string' && e.thumbnail.startsWith('https://') ? e.thumbnail : null;
};

/** Runs yt-dlp -J --flat-playlist on `target`; resolves with { title, entries } or null. */
function flatList(target, env, limit) {
  return new Promise((resolve) => {
    const args = ['--ignore-config', ...UTF8, '--flat-playlist', '-J', '--ies', 'default,-generic', '--playlist-end', String(limit), '--no-warnings'];
    if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
    if (env.cookiesPath) args.push('--cookies', env.cookiesPath);
    args.push('--', target);
    execFile(env.ytDlpPath, args, { windowsHide: true, timeout: 90_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      let data;
      try { data = JSON.parse(stdout); } catch { return resolve(null); }
      if (data._type !== 'playlist' || !Array.isArray(data.entries)) return resolve(null);
      const entries = data.entries
        .filter((e) => e && typeof e === 'object')
        .map((e) => ({
          id: String(e.id || '').slice(0, 100),
          url: normalizeMediaUrl(e.url || e.webpage_url || ''),
          title: String(e.title || '').slice(0, 300),
          duration: Number.isFinite(e.duration) ? e.duration : null,
          channel: String(e.channel || e.uploader || '').slice(0, 120) || null,
          thumbnail: httpsThumb(e),
        }))
        .filter((e) => e.url)
        .slice(0, limit);
      resolve({ title: String(data.title || 'Playlist').slice(0, 300), entries });
    });
  });
}

/** Expands a playlist URL into its entries (flat, no download). */
function expandPlaylist(url, env) {
  return flatList(url, env, MAX_PLAYLIST_ITEMS);
}

/** YouTube search: up to `n` results for free text (no URL needed). */
async function search(query, env, n = 15) {
  const q = String(query || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);
  if (!q) return [];
  const result = await flatList(`ytsearch${n}:${q}`, env, n);
  return result ? result.entries : null;
}

/**
 * Channel / playlist URL for a subscription: a channel's home page lists
 * tabs (Videos, Shorts, Live) rather than videos, so point at its videos.
 */
function subscriptionTarget(url) {
  const u = new URL(url);
  if (isYouTube(url) && /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/.test(u.pathname)) {
    u.pathname = `${u.pathname.replace(/\/$/, '')}/videos`;
  }
  return u.toString();
}

/** Newest entries of a channel/playlist (for subscriptions). */
function latestEntries(url, env, n = 15) {
  return flatList(subscriptionTarget(url), env, n);
}

module.exports = {
  ALLOWED_SITES, SUB_LANGS, RATE_LIMITS, normalizeMediaUrl, parseDownloadOptions, validateOptions, describeOptions, parseTimestamp,
  runDownload, expandPlaylist, search, latestEntries, subscriptionTarget, buildArgs, friendlyError, parseMeta, formatSizes, nameTemplate,
};
