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
  if (isSearchUrl(url)) return true;
  const host = new URL(url).hostname.toLowerCase();
  return ['youtube.com', 'youtu.be', 'youtube-nocookie.com'].some((d) => host === d || host.endsWith(`.${d}`));
}

// A song from an imported Spotify / Apple Music list: the first YouTube
// result for "Artist - Title" (yt-dlp's own search, YouTube only).
const SEARCH_PREFIX = 'ytsearch1:';
/** "Artist - Title" → "ytsearch1:Artist - Title" (plain text, one line), or null. */
function searchUrl(query) {
  const q = String(query || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q || q.length > 200) return null;
  return `${SEARCH_PREFIX}${q}`;
}
const isSearchUrl = (url) => typeof url === 'string' && url.startsWith(SEARCH_PREFIX) && url.length <= SEARCH_PREFIX.length + 200 && !/[\u0000-\u001f]/.test(url);

// A proxy for every connection to the sites: http(s):// or socks5:// with a
// host and port, optionally a user and password. Nothing else gets to yt-dlp.
const PROXY_RE = /^(https?|socks5h?|socks4a?):\/\/(?:[A-Za-z0-9._~%!$&'()*+,;=-]{1,100}(?::[A-Za-z0-9._~%!$&'()*+,;=-]{0,100})?@)?(?:[A-Za-z0-9.-]{1,253}|\[[0-9a-fA-F:.]{2,45}\]):\d{2,5}\/?$/;
const parseProxy = (raw) => {
  const v = String(raw || '').trim();
  if (!v || v.length > 400 || !PROXY_RE.test(v)) return null;
  const port = Number(/:(\d{2,5})\/?$/.exec(v)[1]);
  return port >= 1 && port <= 65535 ? v : null;
};
const SPONSOR_MODES = ['remove', 'mark'];

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
    // Cut the sponsored parts out, or keep them marked as chapters.
    sponsorMode: SPONSOR_MODES.includes(body.sponsorMode) ? body.sponsorMode : 'remove',
    playlist: body.playlist === true,
    music: body.music === true && mode === 'audio',
    // v3.13: a music video → its official audio (same song, without the clip's intro or ending).
    official: body.music === true && mode === 'audio' && body.official !== false,
    lyrics: body.lyrics === true && mode === 'audio',
    nameTemplate: nameTemplate(body.nameTemplate) ? String(body.nameTemplate).trim() : null,
    chapters: body.chapters === true,
    sectionStart: parseTimestamp(body.sectionStart),
    sectionEnd: parseTimestamp(body.sectionEnd),
    rateLimit: RATE_LIMITS.includes(body.rateLimit) ? body.rateLimit : null,
    // Same loudness for every file (re-encodes the sound once more).
    normalize: body.normalize === true,
    // Tempo and key written into the song's tags (MP3, FLAC, OGG, OPUS).
    bpm: body.bpm === true && mode === 'audio',
    // A live stream recorded from its very beginning (YouTube), not from now.
    live: body.live === true,
    // A .nfo sheet and a poster next to the video, for Jellyfin / Kodi / Plex.
    nfo: body.nfo === true && mode === 'video',
  };
}

/** Error message for invalid options, or null. */
function validateOptions(opts) {
  const { sectionStart: s, sectionEnd: e } = opts;
  if (Number.isNaN(s) || Number.isNaN(e) || (s !== null && e !== null && e <= s)) {
    return 'Tramo no válido. Usa segundos o mm:ss, y que "Hasta" sea mayor que "Desde".';
  }
  if (opts.chapters && (s !== null || e !== null)) return 'No se puede recortar y dividir por capítulos a la vez.';
  if (opts.live && (opts.chapters || s !== null || e !== null || opts.playlist)) return 'Un directo se graba entero: sin tramos, capítulos ni playlist.';
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
  if (opts.sponsorblock) text += opts.sponsorMode === 'mark' ? ' · patrocinios marcados' : ' · sin patrocinios';
  if (opts.lyrics) text += ' · letras';
  if (opts.normalize) text += ' · volumen igualado';
  if (opts.bpm) text += ' · BPM y tonalidad';
  if (opts.live) text += ' · directo';
  if (opts.nfo) text += ' · ficha NFO';
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
    '--print', 'after_move:TGMETA %(.{artist,album,album_artist,track,uploader,title,duration,release_year,id,extractor_key,channel,upload_date,webpage_url})j',
    // The description on its own line (only for the .nfo sheet), as JSON so line breaks survive.
    ...(opts.nfo ? ['--print', 'after_move:TGDESC %(description)j'] : []),
    // Music mode: "Artist - Title" (the artist parsed out of the title, or
    // YouTube Music's own), otherwise just the title.
    // A template of the user's own, or music mode's "Artist - Title", or the title.
    '-o', path.join(env.dir, opts.nameTemplate ? `${nameTemplate(opts.nameTemplate)}.%(ext)s`
      : opts.music ? '%(artist&{} - |)s%(title).150B.%(ext)s' : '%(title).150B.%(ext)s'),
  ];
  if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
  if (env.cookiesPath) args.push('--cookies', env.cookiesPath);
  if (parseProxy(env.proxy)) args.push('--proxy', parseProxy(env.proxy));
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
  if (opts.sponsorblock && isYouTube(url)) {
    // Marked: chapters named "Sponsor", "Self-promotion"… you can skip in any player.
    if (opts.sponsorMode === 'mark') args.push('--sponsorblock-mark', 'sponsor,selfpromo,interaction,intro,outro', '--embed-chapters');
    else args.push('--sponsorblock-remove', 'sponsor,selfpromo,interaction');
  }
  if (opts.live) {
    // From the first second of the stream (YouTube keeps it), and in a form
    // that is still playable if the recording is stopped half-way.
    if (isYouTube(url)) args.push('--live-from-start');
    args.push('--hls-use-mpegts');
  }
  // The poster for the .nfo sheet: the video's thumbnail kept as a JPG next to it.
  if (opts.nfo) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
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
    // A music video, in music mode: the song's official audio instead, if there's one.
    if (opts.official && !opts.playlist && !opts.sectionStart && !opts.sectionEnd && isYouTube(url)) {
      ctx.update({ stage: 'Buscando el audio oficial…' });
      const better = await officialAudio(url, env).catch(() => null);
      if (better && !ctx.isCanceled()) { url = better; meta.officialAudio = true; }
    }
    try {
      files = await downloadOnce(url, opts, env, job, ctx, meta);
    } catch (err) {
      // "Stop and save" on a live recording: keep what was recorded so far.
      if (ctx.isStopping && ctx.isStopping()) return salvageLive(ctx, opts, env, job);
      if (ctx.isCanceled() || typeof err.stderr !== 'string' || PERMANENT_ERROR.test(lastErrorLine(err.stderr))) throw err;
      ctx.update({ stage: 'Reintentando…', progress: null, speed: null, eta: null });
      await new Promise((r) => setTimeout(r, AUTO_RETRY_DELAY_MS));
      if (ctx.isCanceled()) throw new Error('Cancelado');
      files = await downloadOnce(url, opts, env, job, ctx, meta);
    }
    // Whole? (opens, lasts what it should, its end decodes) Else once more.
    if (!opts.chapters && !opts.live && !opts.sectionStart && !opts.sectionEnd && files[0] && env.ffmpegPath) {
      ctx.update({ status: 'processing', stage: 'Comprobando el archivo…', progress: null, speed: null, eta: null });
      const check = () => require('./verify').checkMedia({ ffmpegPath: env.ffmpegPath, file: files[0], expected: meta.duration, probe: require('./convert').probe, demuxers: require('./convert').INPUT_DEMUXERS });
      if (!(await check()).ok && !ctx.isCanceled()) {
        ctx.update({ stage: 'El archivo llegó dañado: bajándolo otra vez…', progress: null });
        for (const f of files) fs.rmSync(f, { force: true });
        files = await downloadOnce(url, opts, env, job, ctx, meta);
        const again = await check();
        if (!again.ok) meta.checkFailed = again.reason;
      }
    }
    return finishDownload(files, opts, env, ctx, meta);
  };
}

// "Official Video", "Video oficial", "(MV)"… : a clip, maybe with an intro or a story.
const CLIP_RE = /\b(official\s+(music\s+)?video|music\s+video|v[ií]deo\s+(oficial|musical)|videoclip|lyric\s+video|v[ií]deo\s+con\s+letra|\bm\/?v\b)/i;
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*[([][^)\]]*[)\]]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** The info of one video (title, channel, length; nothing downloaded). */
function videoInfo(url, env) {
  return new Promise((resolve) => {
    const args = ['--ignore-config', '--encoding', 'utf-8', '-J', '--no-playlist', '--skip-download', '--no-warnings', '--ies', 'youtube'];
    if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
    if (env.cookiesPath) args.push('--cookies', env.cookiesPath);
    args.push('--', url);
    execFile(env.ytDlpPath, args, { windowsHide: true, timeout: 45_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}
/**
 * A music video → the official audio of that song: a "- Topic" upload or an
 * "Official Audio", with the same name and no longer than the clip. Or null.
 */
async function officialAudio(url, env, { info = videoInfo, find = search } = {}) {
  const d = await info(url, env);
  if (!d || !CLIP_RE.test(String(d.title || '')) || /\s-\sTopic$/.test(String(d.channel || ''))) return null;
  const parts = /^(.+?)\s+[-–—]\s+(.+)$/.exec(String(d.title || ''));
  const artist = d.artist || (parts && parts[1]) || String(d.channel || '').replace(/VEVO$/i, '');
  const track = d.track || (parts ? parts[2] : d.title);
  const want = fold(track);
  const who = fold(artist);
  if (!want || !who) return null;
  const results = (await find(`${artist} - ${String(track).replace(/\s*[([][^)\]]*[)\]]/g, '')}`, env, 10)) || [];
  const dur = Number(d.duration) || null;
  const pick = results.find((r) => {
    if (!r || !/^[\w-]{11}$/.test(String(r.id)) || r.id === d.id) return false;
    const title = String(r.title || '');
    const channel = String(r.channel || '');
    // Brackets may only say it's the official audio, remastered, HQ… never another version (live, remix, piano…).
    const brackets = [...title.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => fold(m[1]));
    if (!brackets.every((b) => !b || NOISE_ONLY.test(b))) return false;
    const topic = /\s-\sTopic$/.test(channel) && fold(channel.replace(/\s-\sTopic$/, '')).includes(who.split(' ')[0]);
    const officialHere = /(official\s+audio|audio\s+oficial|\(audio\))/i.test(title) && fold(channel) === fold(d.channel);
    // Or the artist's own channel's upload of the song that isn't a clip ("… (2022 Remaster)").
    const ownAudio = fold(channel) === fold(d.channel) && !CLIP_RE.test(title) && !/\b(video|v[ií]deo|live|directo|performance|lyrics?|letra)\b/i.test(title);
    if (!topic && !officialHere && !ownAudio) return false;
    // The same song: its name alone (a "Topic" upload) or "Artist - name".
    const name = fold(title.replace(/[([][^)\]]*[)\]]/g, ' '));
    if (name !== want && name !== `${who} ${want}`) return false;
    return !dur || !Number.isFinite(r.duration) || (r.duration <= dur + 5 && r.duration >= dur * 0.6);
  });
  return pick ? `https://www.youtube.com/watch?v=${pick.id}` : null;
}
const NOISE_ONLY = /^(?:(?:official|oficial|audio|hq|hd|remaster(?:ed)?|remasterizad[oa]|\d{4}|version|versi[oó]n|original|explicit|clean|from|of|the|album|single|mix|stereo|mono)(?:\s+|$))+$/;

/**
 * The optional steps after yt-dlp: same loudness, tempo and key, lyrics, the
 * .nfo sheet. None of them can lose the download: if one fails, the file
 * stays as it was.
 */
async function finishDownload(files, opts, env, ctx, meta) {
  const single = files.length >= 1 && !opts.chapters;
  const main = files[0];
  const processing = (stage) => ctx.update({ status: 'processing', stage, progress: null, speed: null, eta: null });
  if (opts.normalize) {
    const { normalizeFile, supports } = require('./loudness');
    const targets = (opts.chapters ? files : [main]).filter(supports);
    for (let i = 0; i < targets.length; i++) {
      if (ctx.isCanceled()) throw new Error('Cancelado');
      processing(targets.length > 1 ? `Igualando el volumen ${i + 1}/${targets.length}` : 'Igualando el volumen…');
      try {
        await normalizeFile({ ffmpegPath: env.ffmpegPath, file: targets[i], bitrate: opts.mode === 'audio' ? opts.audioBitrate : null, setProcess: ctx.setProcess });
      } catch (err) {
        if (ctx.isCanceled()) throw err;
      }
    }
  }
  if (opts.bpm && single) {
    processing('Calculando BPM y tonalidad…');
    try {
      const found = await require('./tags').addTempoAndKey({ ffmpegPath: env.ffmpegPath, file: main, duration: meta.duration });
      Object.assign(meta, { bpm: found.bpm, key: found.key, camelot: found.camelot });
      ctx.update({ meta: { ...meta, description: undefined } });
    } catch { /* no clear beat or pitch: nothing written */ }
  }
  if (opts.lyrics && files.length === 1 && !opts.chapters) {
    processing('Buscando letra…');
    // The artist yt-dlp found (music mode, YouTube Music) or, failing that,
    // "Artist - Title" in the video title; the channel as a last resort.
    const split = /^(.+?)\s+[-–—]\s+(.+)$/.exec(meta.title || '');
    const artist = meta.artist || (split && split[1]) || meta.uploader;
    const title = meta.artist ? meta.title : (split ? split[2] : meta.title);
    try {
      const lrc = await require('./tags').addLyrics({
        ffmpegPath: env.ffmpegPath, file: main, artist, title, album: meta.album, duration: meta.duration, fetchImpl: env.fetchImpl,
      });
      if (lrc) files.push(lrc);
    } catch { /* no lyrics (offline, not found…): the song is still there */ }
  }
  if (opts.nfo && single) {
    processing('Preparando la ficha…');
    try { files.push(...writeNfo(main, meta, ctx.dir)); } catch { /* the video is still there */ }
  }
  return files;
}

const xml = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/**
 * A Kodi/Jellyfin .nfo sheet next to the video (title, channel, date,
 * description, the video's id), and its thumbnail renamed as the poster.
 * Returns the files written.
 */
function writeNfo(videoFile, meta, dir) {
  const base = videoFile.slice(0, videoFile.length - path.extname(videoFile).length);
  const date = /^\d{8}$/.test(meta.upload_date || '') ? `${meta.upload_date.slice(0, 4)}-${meta.upload_date.slice(4, 6)}-${meta.upload_date.slice(6, 8)}` : '';
  const who = meta.channel || meta.uploader || '';
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<movie>',
    `  <title>${xml(meta.title || path.basename(base))}</title>`,
    meta.description ? `  <plot>${xml(meta.description)}</plot>` : '',
    who ? `  <studio>${xml(who)}</studio>` : '',
    who ? `  <director>${xml(who)}</director>` : '',
    date ? `  <premiered>${date}</premiered>` : '',
    date ? `  <year>${date.slice(0, 4)}</year>` : '',
    meta.duration ? `  <runtime>${Math.max(1, Math.round(meta.duration / 60))}</runtime>` : '',
    meta.id ? `  <uniqueid type="${xml(String(meta.extractor_key || 'youtube').toLowerCase())}" default="true">${xml(meta.id)}</uniqueid>` : '',
    '  <genre>TubeGrab</genre>',
    '</movie>',
  ].filter(Boolean);
  const nfo = `${base}.nfo`;
  fs.writeFileSync(nfo, `${lines.join('\n')}\n`, 'utf8');
  const out = [nfo];
  // The thumbnail yt-dlp kept (same name as the video) → "<name>-poster.jpg".
  const thumb = [`${base}.jpg`, `${base}.jpeg`].find((p) => fs.existsSync(p))
    || filesIn(dir, /\.jpe?g$/i).find((p) => !p.endsWith('-poster.jpg'));
  if (thumb) {
    const poster = `${base}-poster.jpg`;
    fs.renameSync(thumb, poster);
    out.push(poster);
  }
  return out;
}

/**
 * A live recording stopped on purpose: yt-dlp was killed half-way, so its
 * pieces (video and sound, or one MPEG-TS stream) are joined into one file.
 */
async function salvageLive(ctx, opts, env, job) {
  ctx.update({ status: 'processing', stage: 'Guardando la grabación…', progress: null, speed: null, eta: null });
  await new Promise((r) => setTimeout(r, 1500)); // let the killed process release its files
  const { probe, outputBaseName, INPUT_DEMUXERS } = require('./convert');
  const SAFE = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS];
  const pieces = [];
  let names = [];
  try { names = fs.readdirSync(ctx.dir); } catch { /* nothing */ }
  for (const n of names) {
    if (/\.(ytdl|jpe?g|png|webp|json|srt|vtt)$/i.test(n)) continue;
    const p = path.join(ctx.dir, n);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile() || st.size < 1024) continue;
    const info = await probe(env.ffmpegPath, p);
    if (info && info.ok) pieces.push({ path: p, size: st.size, ...info });
  }
  const video = pieces.filter((x) => x.hasVideo).sort((a, b) => b.size - a.size)[0] || null;
  const audio = pieces.filter((x) => x.hasAudio && x !== video).sort((a, b) => b.size - a.size)[0] || (video && video.hasAudio ? video : null);
  if (!video && !audio) throw new Error('No se grabó nada todavía.');
  const name = `${outputBaseName(`${job.title || 'directo'}.x`)} (directo)`;
  let out;
  const args = [];
  if (opts.mode === 'video' && video) {
    out = path.join(ctx.dir, `${name}.${opts.container === 'webm' ? 'webm' : 'mkv'}`);
    args.push(...SAFE, '-i', video.path);
    if (audio && audio !== video) args.push(...SAFE, '-i', audio.path);
    args.push('-map', '0:v:0');
    if (audio) args.push('-map', audio === video ? '0:a:0' : '1:a:0');
    args.push('-c', 'copy', out);
  } else {
    const src = audio || video;
    const f = AUDIO_FORMATS[opts.audioFormat];
    const [codec, ext] = { mp3: ['libmp3lame', 'mp3'], m4a: ['aac', 'm4a'], opus: ['libopus', 'opus'], vorbis: ['libvorbis', 'ogg'], flac: ['flac', 'flac'], wav: ['pcm_s16le', 'wav'] }[f.ytdlp] || ['aac', 'm4a'];
    out = path.join(ctx.dir, `${name}.${ext}`);
    args.push(...SAFE, '-i', src.path, '-map', '0:a:0', '-vn', '-c:a', codec, ...(f.lossy ? ['-b:a', `${opts.audioBitrate}k`] : []), out);
  }
  await new Promise((resolve, reject) => {
    const p = spawn(env.ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true });
    ctx.setProcess(p);
    p.on('error', reject);
    p.on('close', (code) => (code === 0 && fs.existsSync(out) ? resolve() : reject(new Error('No se pudo guardar la grabación.'))));
  });
  for (const x of pieces) if (x.path !== out) fs.rmSync(x.path, { force: true });
  return [out];
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
const META_FIELDS = ['artist', 'album', 'album_artist', 'track', 'uploader', 'title', 'duration', 'release_year',
  'id', 'extractor_key', 'channel', 'upload_date', 'webpage_url'];
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
  // The link is only kept if it's one we'd download from anyway.
  if (meta.webpage_url && !normalizeMediaUrl(meta.webpage_url)) delete meta.webpage_url;
  if (meta.id && !/^[\w-]{1,100}$/.test(meta.id)) delete meta.id;
  if (meta.extractor_key && !/^\w{1,40}$/.test(meta.extractor_key)) delete meta.extractor_key;
  return meta;
}

/** The TGDESC line (a JSON string) → the description as plain text, line breaks kept, or ''. */
function parseDescription(json) {
  let v;
  try { v = JSON.parse(json); } catch { return ''; }
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, 5000) : '';
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
            stage: opts.live ? 'Grabando el directo' : what ? `Descargando ${what}` : 'Descargando',
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
        } else if (line.startsWith('TGDESC ')) {
          metaOut.description = parseDescription(line.slice(7));
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
    if (parseProxy(env.proxy)) args.push('--proxy', parseProxy(env.proxy));
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
          channelUrl: typeof e.channel_url === 'string' && /^https:\/\/www\.youtube\.com\/channel\/UC[\w-]{22}$/.test(e.channel_url) ? e.channel_url : null,
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

/**
 * Only the picture: the video's largest thumbnail, as JPG or PNG (no video
 * is downloaded). A job runner, like runDownload.
 */
const THUMB_FORMATS = ['jpg', 'png', 'webp'];
function runThumbnail(url, format, env) {
  const fmt = THUMB_FORMATS.includes(format) ? format : 'jpg';
  return (job, ctx) => new Promise((resolve, reject) => {
    const args = ['--ignore-config', ...UTF8, '--no-playlist', '--ies', 'default,-generic', '--ffmpeg-location', env.ffmpegPath,
      '--skip-download', '--write-thumbnail', '--convert-thumbnails', fmt, '--no-warnings', '--quiet', '--no-simulate',
      '--print', 'before_dl:TGTITLE %(title)s',
      '-o', `thumbnail:${path.join(ctx.dir, '%(title).150B.%(ext)s')}`];
    if (env.jsRuntime) args.push('--js-runtimes', `node:${env.jsRuntime}`);
    if (env.cookiesPath) args.push('--cookies', env.cookiesPath);
    if (parseProxy(env.proxy)) args.push('--proxy', parseProxy(env.proxy));
    args.push('--', url);
    ctx.update({ stage: 'Descargando la miniatura…', progress: null });
    const proc = spawn(env.ytDlpPath, args, { windowsHide: true });
    ctx.setProcess(proc);
    let stderr = '';
    proc.stdout.on('data', (c) => {
      for (const line of c.toString('utf8').split(/\r?\n/)) if (line.startsWith('TGTITLE ')) ctx.update({ title: line.slice(8).trim() || job.title });
    });
    proc.stderr.on('data', (c) => { stderr = (stderr + c.toString('utf8')).slice(-8000); });
    proc.on('error', (err) => reject(new Error(`No se pudo iniciar yt-dlp: ${err.message}`)));
    proc.on('close', (code) => {
      if (ctx.isCanceled()) return reject(new Error('Cancelado'));
      const pics = filesIn(ctx.dir, new RegExp(`\\.${fmt}$`, 'i'));
      if (code === 0 && pics.length) return resolve(pics[0]);
      reject(new Error(code === 0 ? 'Este vídeo no tiene miniatura.' : friendlyError(stderr)));
    });
  });
}

module.exports = {
  searchUrl, isSearchUrl, parseProxy, runThumbnail, THUMB_FORMATS, SPONSOR_MODES,
  ALLOWED_SITES, SUB_LANGS, RATE_LIMITS, normalizeMediaUrl, parseDownloadOptions, validateOptions, describeOptions, parseTimestamp,
  runDownload, expandPlaylist, search, officialAudio, CLIP_RE, latestEntries, subscriptionTarget, buildArgs, friendlyError, parseMeta, parseDescription, formatSizes, nameTemplate,
  writeNfo, finishDownload, isYouTube, AUDIO_FORMATS, flatList, NOISE_ONLY,
};
