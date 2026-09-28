// ffmpeg conversion jobs: target formats, option -> argv mapping, progress parsing.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Keys are what the client sends as targetFormat; `ext` is the output file
// extension (several formats share one, e.g. m4a for both AAC and ALAC).
const AUDIO_CONVERT_FORMATS = {
  mp3: { ext: 'mp3', codec: 'libmp3lame', label: 'MP3', lossy: true },
  aac: { ext: 'aac', codec: 'aac', label: 'AAC', lossy: true },
  m4a: { ext: 'm4a', codec: 'aac', label: 'M4A', lossy: true },
  ogg: { ext: 'ogg', codec: 'libvorbis', label: 'OGG', lossy: true },
  // libopus only accepts its own sample rates; ffmpeg resamples automatically
  // as long as we don't force -ar.
  opus: { ext: 'opus', codec: 'libopus', label: 'OPUS', lossy: true, fixedSampleRate: true },
  wma: { ext: 'wma', codec: 'wmav2', label: 'WMA', lossy: true },
  ac3: { ext: 'ac3', codec: 'ac3', label: 'AC3', lossy: true },
  flac: { ext: 'flac', codec: 'flac', label: 'FLAC', lossy: false },
  alac: { ext: 'm4a', codec: 'alac', label: 'ALAC', lossy: false },
  wav: { ext: 'wav', codec: 'pcm_s16le', label: 'WAV', lossy: false },
  aiff: { ext: 'aiff', codec: 'pcm_s16be', label: 'AIFF', lossy: false },
};
// `family` selects how the quality setting maps onto the encoder's own scale.
const VIDEO_CONVERT_FORMATS = {
  mp4: { ext: 'mp4', vcodec: 'libx264', acodec: 'aac', family: 'x264', label: 'MP4', extra: ['-pix_fmt', 'yuv420p', '-movflags', '+faststart'] },
  hevc: { ext: 'mp4', vcodec: 'libx265', acodec: 'aac', family: 'x265', label: 'MP4 H.265', extra: ['-preset', 'fast', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-movflags', '+faststart'] },
  webm: { ext: 'webm', vcodec: 'libvpx-vp9', acodec: 'libopus', family: 'vp9', label: 'WEBM', extra: ['-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4'] },
  mkv: { ext: 'mkv', vcodec: 'libx264', acodec: 'aac', family: 'x264', label: 'MKV', extra: ['-pix_fmt', 'yuv420p'] },
  mov: { ext: 'mov', vcodec: 'libx264', acodec: 'aac', family: 'x264', label: 'MOV', extra: ['-pix_fmt', 'yuv420p'] },
  avi: { ext: 'avi', vcodec: 'mpeg4', acodec: 'libmp3lame', family: 'qscale', label: 'AVI' },
  wmv: { ext: 'wmv', vcodec: 'wmv2', acodec: 'wmav2', family: 'qscale', label: 'WMV' },
  flv: { ext: 'flv', vcodec: 'libx264', acodec: 'aac', family: 'x264', label: 'FLV', extra: ['-pix_fmt', 'yuv420p'] },
  // MPEG-2 only allows a fixed set of frame rates.
  mpg: { ext: 'mpg', vcodec: 'mpeg2video', acodec: 'mp2', family: 'qscale', label: 'MPG', allowedFps: ['24', '30', '60'], defaultFps: '25' },
  '3gp': { ext: '3gp', vcodec: 'libx264', acodec: 'aac', family: 'x264', label: '3GP', extra: ['-pix_fmt', 'yuv420p'] },
  ogv: { ext: 'ogv', vcodec: 'libtheora', acodec: 'libvorbis', family: 'theora', label: 'OGV' },
  gif: { ext: 'gif', vcodec: 'gif', acodec: null, family: 'gif', label: 'GIF' },
};
const VIDEO_QUALITY_SCALES = {
  x264: { alta: ['-crf', '18'], media: ['-crf', '23'], baja: ['-crf', '28'] },
  x265: { alta: ['-crf', '22'], media: ['-crf', '28'], baja: ['-crf', '32'] },
  vp9: { alta: ['-crf', '24'], media: ['-crf', '32'], baja: ['-crf', '40'] },
  qscale: { alta: ['-q:v', '2'], media: ['-q:v', '5'], baja: ['-q:v', '10'] },
  theora: { alta: ['-q:v', '9'], media: ['-q:v', '7'], baja: ['-q:v', '5'] },
};
const AUDIO_BITRATES = ['64', '96', '128', '160', '192', '256', '320'];
const SAMPLE_RATES = ['44100', '48000'];
const CHANNELS = ['1', '2'];
const RESOLUTIONS = ['2160', '1440', '1080', '720', '480', '360', '240'];
const QUALITIES = ['alta', 'media', 'baja'];
const FPS_VALUES = ['60', '30', '24', '15', '10'];
const SPEEDS = ['0.5', '0.75', '1.25', '1.5', '2'];
const ROTATIONS = {
  90: 'transpose=1',
  180: 'transpose=1,transpose=1',
  270: 'transpose=2',
  hflip: 'hflip',
  vflip: 'vflip',
};
const GIF_MAX_FPS = 30;
const INPUT_DEMUXERS = [
  'mov', 'mp4', 'matroska', 'webm', 'avi', 'asf', 'flv', 'mpeg', 'mpegts', 'mpegvideo', 'm4v', 'h264', 'hevc',
  'mp3', 'aac', 'ac3', 'eac3', 'ogg', 'flac', 'wav', 'w64', 'aiff', 'amr', 'amrnb', 'amrwb', 'caf', 'wv', 'ape', 'gif',
].join(',');

const pick = (value, allowed) => (allowed.includes(String(value)) ? String(value) : null);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function formatFor(targetFormat) {
  if (has(AUDIO_CONVERT_FORMATS, targetFormat)) return { kind: 'audio', config: AUDIO_CONVERT_FORMATS[targetFormat] };
  if (has(VIDEO_CONVERT_FORMATS, targetFormat)) return { kind: 'video', config: VIDEO_CONVERT_FORMATS[targetFormat] };
  return null;
}

/** "90", "1:30", "0:01:30.5" -> seconds; '' -> null; anything else -> NaN. */
function parseTimestamp(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (!/^\d{1,5}(:[0-5]?\d){0,2}(\.\d{1,3})?$/.test(value)) return NaN;
  const seconds = value.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
  return seconds <= 24 * 3600 ? seconds : NaN;
}

function buildAudioArgs(config, body) {
  const args = ['-vn', '-c:a', config.codec];
  const bitrate = config.lossy ? pick(body.audioBitrate, AUDIO_BITRATES) : null;
  if (bitrate) args.push('-b:a', `${bitrate}k`);
  let sampleRate = config.fixedSampleRate ? null : pick(body.sampleRate, SAMPLE_RATES);
  const filters = [];
  const speed = pick(body.speed, SPEEDS);
  if (speed) filters.push(`atempo=${speed}`);
  if (body.normalize === 'true') {
    filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    // loudnorm works at 192 kHz internally; bring it back to a normal rate.
    if (!sampleRate && !config.fixedSampleRate) sampleRate = '44100';
  }
  if (filters.length) args.push('-af', filters.join(','));
  if (sampleRate) args.push('-ar', sampleRate);
  const channels = pick(body.channels, CHANNELS);
  if (channels) args.push('-ac', channels);
  return args;
}


// ---- Hardware (GPU) encoding ---------------------------------------------------
// H.264/H.265 on the graphics card: several times faster than libx264/x265.
// `q` maps the x264/x265 CRF of the chosen quality onto each encoder's scale.
const HW_ENCODERS = {
  nvidia: { h264: 'h264_nvenc', hevc: 'hevc_nvenc', q: (crf) => ['-rc', 'vbr', '-cq', crf, '-b:v', '0', '-preset', 'p5'] },
  intel: { h264: 'h264_qsv', hevc: 'hevc_qsv', q: (crf) => ['-global_quality', crf, '-preset', 'medium'] },
  amd: { h264: 'h264_amf', hevc: 'hevc_amf', q: (crf) => ['-rc', 'cqp', '-qp_i', crf, '-qp_p', crf, '-quality', 'balanced'] },
};
const hwCache = new Map(); // ffmpegPath -> Promise<vendor|null>

/** Which GPU encoder actually works here (tries a 1-frame encode with each). */
function detectHwEncoder(ffmpegPath) {
  // Not cached while ffmpeg isn't there yet (the light build downloads it
  // after start-up): the next call detects for real.
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) return Promise.resolve(null);
  if (!hwCache.has(ffmpegPath)) {
    hwCache.set(ffmpegPath, (async () => {
      for (const [vendor, enc] of Object.entries(HW_ENCODERS)) {
        const ok = await new Promise((resolve) => {
          const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2',
            '-frames:v', '1', '-c:v', enc.h264, '-pix_fmt', 'nv12', '-f', 'null', '-'], { windowsHide: true });
          const timer = setTimeout(() => { p.kill(); resolve(false); }, 15_000);
          p.on('error', () => { clearTimeout(timer); resolve(false); });
          p.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
        });
        if (ok) return vendor;
      }
      return null;
    })());
  }
  return hwCache.get(ffmpegPath);
}

/** Swaps libx264/libx265 for the GPU encoder in an argument list (or returns null if not applicable). */
function toHardware(args, vendor) {
  const enc = HW_ENCODERS[vendor];
  const i = args.indexOf('-c:v');
  if (!enc || i === -1) return null;
  const codec = args[i + 1] === 'libx264' ? enc.h264 : args[i + 1] === 'libx265' ? enc.hevc : null;
  if (!codec) return null;
  const out = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '-c:v') { out.push('-c:v', codec); k += 1; continue; }
    if (a === '-crf') { out.push(...enc.q(args[k + 1])); k += 1; continue; }
    if (a === '-preset') { k += 1; continue; } // libx265's preset names don't apply
    if (a === '-pix_fmt') { out.push('-pix_fmt', 'nv12'); k += 1; continue; }
    out.push(a);
  }
  return out;
}

function buildVideoArgs(config, body) {
  const resolution = pick(body.resolution, RESOLUTIONS);
  const speed = pick(body.speed, SPEEDS);
  const rotation = has(ROTATIONS, body.rotate) ? ROTATIONS[body.rotate] : null;
  let fps = pick(body.fps, FPS_VALUES);
  const pre = [rotation, speed ? `setpts=PTS/${speed}` : null].filter(Boolean);

  if (config.family === 'gif') {
    const gifFps = Math.min(Number(fps || 12), GIF_MAX_FPS);
    const scale = resolution
      ? `scale=-2:'min(${resolution},ih)':flags=lanczos`
      : `scale='min(480,iw)':-2:flags=lanczos`;
    // Two-pass palette in one graph: far better colours than GIF's default palette.
    const chain = [...pre, `fps=${gifFps}`, scale].join(',');
    return ['-vf', `${chain},split[a][b];[a]palettegen[p];[b][p]paletteuse`, '-loop', '0', '-an'];
  }

  // Most encoders need even dimensions; never upscale when a height is chosen.
  const scale = resolution
    ? `scale=-2:'min(${resolution},trunc(ih/2)*2)'`
    : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  if (config.allowedFps) fps = fps && config.allowedFps.includes(fps) ? fps : config.defaultFps;
  const quality = pick(body.quality, QUALITIES) || 'media';

  const args = ['-vf', [...pre, scale].join(',')];
  if (fps) args.push('-r', fps);
  args.push('-c:v', config.vcodec, ...VIDEO_QUALITY_SCALES[config.family][quality], ...(config.extra || []));
  if (body.removeAudio === 'true') {
    args.push('-an');
  } else {
    args.push('-c:a', config.acodec);
    if (speed) args.push('-af', `atempo=${speed}`);
  }
  return args;
}

function describeConvert(kind, config, body) {
  const parts = [config.label];
  if (kind === 'audio' && config.lossy && pick(body.audioBitrate, AUDIO_BITRATES)) parts.push(`${body.audioBitrate} kbps`);
  if (kind === 'video' && pick(body.resolution, RESOLUTIONS)) parts.push(`${body.resolution}p`);
  if (pick(body.speed, SPEEDS)) parts.push(`${body.speed}x`);
  return parts.join(' · ');
}

/**
 * Output file name (without extension) from the uploaded file's name: strips
 * path separators and characters Windows forbids, keeps unicode, and avoids
 * device names like CON or NUL that Windows can't create as files.
 */
function outputBaseName(originalName) {
  const base = (String(originalName).replace(/\.[^/.\\]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/^[.\s]+|[.\s]+$/g, '') || 'archivo').slice(0, 150);
  return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(base) ? `_${base}` : base;
}

const parseClock = (s) => s.split(':').reduce((acc, p) => acc * 60 + parseFloat(p), 0);

// An upload can pose as a video while really being a playlist (HLS, concat…)
// that points ffmpeg at other local files or URLs. Only real media demuxers,
// and no network protocols, may open an input.
const SAFE_INPUT = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS];

/** Duration, and which streams an input has (real video vs. an embedded cover). */
function probe(ffmpegPath, inputPath) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ['-hide_banner', ...SAFE_INPUT, '-i', inputPath], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (c) => { err = (err + c.toString('utf8')).slice(-20000); });
    p.on('error', () => resolve(null));
    p.on('close', () => {
      const d = /Duration: (\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(err);
      const lines = err.split('\n').filter((l) => /Stream #\d+:\d+/.test(l));
      const video = lines.find((l) => / Video: /.test(l) && !/attached pic/.test(l));
      // Drop codec tags like "0x31637661" first — but not the "0x720" inside "1280x720".
      const size = video && /\b(\d{2,5})x(\d{2,5})\b/.exec(video.replace(/\b0x[0-9a-f]+\b/gi, ''));
      resolve({
        duration: d ? parseClock(d[1]) : null,
        hasVideo: Boolean(video),
        hasCover: lines.some((l) => / Video: /.test(l) && /attached pic/.test(l)),
        hasAudio: lines.some((l) => / Audio: /.test(l)),
        width: size ? Number(size[1]) : null,
        height: size ? Number(size[2]) : null,
        ok: lines.length > 0,
      });
    });
  });
}

/**
 * Runs one ffmpeg process, reporting progress against `duration` mapped onto
 * [from, to] percent. Resolves when it exits 0; rejects otherwise.
 */
function runFfmpeg(ffmpegPath, args, ctx, { duration = null, from = 0, to = 99, stage = 'Convirtiendo' } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1', ...args], { windowsHide: true });
    ctx.setProcess(proc);
    ctx.update({ stage, progress: from });
    let stderr = '';
    let buffer = '';
    const startedAt = Date.now();
    proc.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-8000);
      if (duration === null) {
        const m = /Duration: (\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(stderr);
        if (m) duration = parseClock(m[1]);
      }
    });
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      let outTime = null;
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'out_time_us' && /^\d+$/.test(value)) outTime = Number(value) / 1e6;
      }
      if (outTime !== null && duration) {
        const frac = Math.min(1, outTime / duration);
        const pct = Math.min(99, Math.round(from + (to - from) * frac));
        const elapsed = (Date.now() - startedAt) / 1000;
        const eta = frac > 0.02 ? Math.round((elapsed / frac) * (1 - frac)) : null;
        ctx.update({ progress: pct, eta });
      }
    });
    proc.on('error', (err) => reject(new Error(`No se pudo iniciar ffmpeg: ${err.message}`)));
    proc.on('close', (code) => {
      if (ctx.isCanceled()) return reject(new Error('Cancelado'));
      if (code === 0) return resolve();
      console.error('[CONVERT ERROR]', stderr.split('\n').slice(-4).join(' | '));
      const err = new Error('No se pudo convertir el archivo. Verifica que sea un archivo de audio/vídeo válido.');
      err.stderr = stderr;
      reject(err);
    });
  });
}

/**
 * Returns a job runner. `inputPath` is the uploaded temp file; the output is
 * named after the original file with the target extension. `hw`: GPU vendor
 * to try first (falls back to the CPU encoder if the GPU run fails).
 */
function runConvert({ inputPath, originalName, targetFormat, body, ffmpegPath, hw = null }) {
  const { kind, config } = formatFor(targetFormat);
  const trimStart = parseTimestamp(body.trimStart);
  const trimEnd = parseTimestamp(body.trimEnd);
  const speed = Number(pick(body.speed, SPEEDS) || 1);

  return async (job, ctx) => {
    const outputPath = path.join(ctx.dir, `${outputBaseName(originalName)}.${config.ext}`);
    const info = await probe(ffmpegPath, inputPath);
    let duration = null;
    if (info && info.duration) {
      const end = trimEnd !== null ? Math.min(trimEnd, info.duration) : info.duration;
      duration = Math.max(0.1, (end - (trimStart || 0)) / speed);
    }
    const head = [];
    if (trimStart !== null) head.push('-ss', String(trimStart));
    if (trimEnd !== null) head.push('-to', String(trimEnd));
    head.push(...SAFE_INPUT, '-i', inputPath, '-map_metadata', '-1');
    const cpu = kind === 'audio' ? buildAudioArgs(config, body) : buildVideoArgs(config, body);
    const gpu = hw && kind === 'video' ? toHardware(cpu, hw) : null;
    if (gpu) {
      try {
        await runFfmpeg(ffmpegPath, [...head, ...gpu, outputPath], ctx, { duration, stage: 'Convirtiendo (GPU)' });
        if (fs.existsSync(outputPath)) return outputPath;
      } catch (err) {
        if (ctx.isCanceled()) throw err;
        // The GPU encoder refused this input/size: do it on the CPU instead.
      }
    }
    await runFfmpeg(ffmpegPath, [...head, ...cpu, outputPath], ctx, { duration });
    if (!fs.existsSync(outputPath)) throw new Error('No se pudo convertir el archivo.');
    return outputPath;
  };
}

// ---- Compress to a target size -------------------------------------------------
const MAX_TARGET_MB = 4000;

function parseTargetMb(raw) {
  const n = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 1 && n <= MAX_TARGET_MB ? Math.round(n * 10) / 10 : null;
}

/**
 * Re-encodes so the result weighs about `targetMb` (H.264 two-pass for video,
 * MP3 for audio). Lower budgets also lower the resolution, which looks far
 * better than a tiny bitrate at full size.
 */
function runCompress({ inputPath, originalName, targetMb, ffmpegPath }) {
  return async (job, ctx) => {
    ctx.update({ stage: 'Analizando…', progress: null });
    const info = await probe(ffmpegPath, inputPath);
    if (!info || !info.duration) throw new Error('No se pudo leer la duración del archivo.');
    const totalKbps = ((targetMb * 8192) / info.duration) * 0.96; // room for the container
    const base = outputBaseName(originalName);
    const label = String(targetMb).replace('.', ',');

    if (!info.hasVideo) {
      const kbps = Math.round(Math.min(320, totalKbps));
      if (kbps < 24) throw new Error(`No cabe en ${label} MB: para esta duración hacen falta al menos ${Math.ceil((24 * info.duration) / 8192 / 0.96)} MB.`);
      const out = path.join(ctx.dir, `${base} (${label} MB).mp3`);
      await runFfmpeg(ffmpegPath, [...SAFE_INPUT, '-i', inputPath, '-vn', '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, out], ctx,
        { duration: info.duration, stage: 'Comprimiendo' });
      return out;
    }

    const audioKbps = !info.hasAudio ? 0 : totalKbps > 800 ? 128 : totalKbps > 300 ? 96 : 64;
    const videoKbps = Math.floor(totalKbps - audioKbps);
    if (videoKbps < 80) {
      const need = Math.ceil(((80 + audioKbps) * info.duration) / 8192 / 0.96);
      throw new Error(`No cabe en ${label} MB con una calidad aceptable: para esta duración hacen falta al menos ${need} MB (o recórtalo antes).`);
    }
    const maxHeight = videoKbps < 500 ? 480 : videoKbps < 1200 ? 720 : videoKbps < 3000 ? 1080 : 2160;
    const out = path.join(ctx.dir, `${base} (${label} MB).mp4`);
    const passlog = path.join(ctx.dir, 'pass');
    const video = ['-vf', `scale=-2:'min(${maxHeight},trunc(ih/2)*2)'`, '-c:v', 'libx264', '-preset', 'medium',
      '-b:v', `${videoKbps}k`, '-pix_fmt', 'yuv420p', '-passlogfile', passlog];
    await runFfmpeg(ffmpegPath, [...SAFE_INPUT, '-i', inputPath, ...video, '-pass', '1', '-an', '-f', 'null', os.devNull], ctx,
      { duration: info.duration, from: 0, to: 45, stage: 'Analizando (1/2)' });
    await runFfmpeg(ffmpegPath, [...SAFE_INPUT, '-i', inputPath, ...video, '-pass', '2',
      ...(audioKbps ? ['-c:a', 'aac', '-b:a', `${audioKbps}k`] : ['-an']), '-movflags', '+faststart', out], ctx,
    { duration: info.duration, from: 45, to: 99, stage: 'Comprimiendo (2/2)' });
    for (const f of fs.readdirSync(ctx.dir)) if (f.startsWith('pass')) fs.rmSync(path.join(ctx.dir, f), { force: true });
    return out;
  };
}

// ---- Image from a video / cover from a song --------------------------------------
const IMAGE_FORMATS = {
  jpg: { ext: 'jpg', label: 'JPG', args: ['-q:v', '2'] },
  png: { ext: 'png', label: 'PNG', args: [] },
  webp: { ext: 'webp', label: 'WEBP', args: ['-c:v', 'libwebp', '-quality', '90'] },
};

function runImage({ inputPath, originalName, targetFormat, body, ffmpegPath }) {
  const fmt = IMAGE_FORMATS[targetFormat];
  const cover = body.imageMode === 'cover';
  const at = parseTimestamp(body.time) || 0;
  return async (job, ctx) => {
    const info = await probe(ffmpegPath, inputPath);
    if (!info || !info.ok) throw new Error('No se pudo leer el archivo.');
    if (cover && !info.hasCover && !info.hasVideo) throw new Error('Este archivo no tiene carátula.');
    if (!cover && !info.hasVideo) throw new Error('Este archivo no tiene imagen de vídeo; prueba con "Carátula".');
    if (!cover && info.duration && at >= info.duration) throw new Error('Ese momento está fuera del vídeo.');
    const suffix = cover ? 'carátula' : `${String(at).replace('.', ',')} s`;
    const out = path.join(ctx.dir, `${outputBaseName(originalName)} (${suffix}).${fmt.ext}`);
    const seek = !cover && at ? ['-ss', String(at)] : [];
    await runFfmpeg(ffmpegPath, [...seek, ...SAFE_INPUT, '-i', inputPath, '-map', '0:v:0', '-frames:v', '1', ...fmt.args, out], ctx,
      { stage: 'Extrayendo imagen' });
    if (!fs.existsSync(out)) throw new Error(cover ? 'Este archivo no tiene carátula.' : 'Ese momento está fuera del vídeo.');
    return out;
  };
}

// ---- Merge several files into one -----------------------------------------------
const MAX_MERGE = 50;

/**
 * Joins inputs one after another. Video: every clip is fitted (letterboxed)
 * into one size and frame rate; clips without sound get silence, audio files
 * get a black picture. Audio: tracks are simply chained.
 */
function runMerge({ inputs, targetFormat, body, ffmpegPath }) {
  const { kind, config } = formatFor(targetFormat);
  return async (job, ctx) => {
    ctx.update({ stage: 'Analizando archivos…', progress: null });
    const infos = [];
    for (const input of inputs) {
      const info = await probe(ffmpegPath, input.path);
      if (!info || !info.duration) throw new Error(`No se pudo leer "${input.name}".`);
      infos.push(info);
    }
    const total = infos.reduce((acc, i) => acc + i.duration, 0);
    const args = [];
    for (const input of inputs) args.push(...SAFE_INPUT, '-i', input.path);
    const graph = [];
    const labels = [];
    const stereo = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';

    if (kind === 'audio') {
      infos.forEach((info, i) => {
        if (!info.hasAudio) throw new Error(`"${inputs[i].name}" no tiene sonido.`);
        graph.push(`[${i}:a:0]${stereo}[a${i}]`);
        labels.push(`[a${i}]`);
      });
      graph.push(`${labels.join('')}concat=n=${inputs.length}:v=0:a=1[out]`);
      const audio = buildAudioArgs(config, { audioBitrate: body.audioBitrate }).filter((a) => a !== '-vn');
      args.push('-filter_complex', graph.join(';'), '-map', '[out]', ...audio);
    } else {
      const firstVideo = infos.find((i) => i.hasVideo);
      const chosen = Number(pick(body.resolution, RESOLUTIONS)) || null;
      const height = chosen || (firstVideo && firstVideo.height) || 720;
      const width = !chosen && firstVideo && firstVideo.width ? firstVideo.width : Math.round((height * 16) / 9);
      const W = Math.max(2, Math.floor(width / 2) * 2);
      const H = Math.max(2, Math.floor(height / 2) * 2);
      const fps = pick(body.fps, FPS_VALUES) || '30';
      infos.forEach((info, i) => {
        const d = info.duration.toFixed(3);
        graph.push(info.hasVideo
          ? `[${i}:v:0]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`
          : `color=c=black:s=${W}x${H}:r=${fps}:d=${d},format=yuv420p[v${i}]`);
        graph.push(info.hasAudio
          ? `[${i}:a:0]${stereo}[a${i}]`
          : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
        labels.push(`[v${i}][a${i}]`);
      });
      graph.push(`${labels.join('')}concat=n=${inputs.length}:v=1:a=1[vout][aout]`);
      const quality = pick(body.quality, QUALITIES) || 'media';
      args.push('-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]',
        '-c:v', config.vcodec, ...VIDEO_QUALITY_SCALES[config.family][quality], ...(config.extra || []), '-c:a', config.acodec);
    }
    const out = path.join(ctx.dir, `${outputBaseName(inputs[0].name)} (unido).${config.ext}`);
    await runFfmpeg(ffmpegPath, [...args, out], ctx, { duration: total, stage: `Uniendo ${inputs.length} archivos` });
    return out;
  };
}

// ---- Editor: keep several parts of one file ---------------------------------------
const MAX_SEGMENTS = 200;
const MIN_SEGMENT = 0.05;
// "Same as the original": the input's extension → a format of ours. Also the
// only extensions the fast (stream copy) mode writes.
const ORIGINAL_FORMATS = {
  mp4: 'mp4', m4v: 'mp4', mov: 'mov', mkv: 'mkv', webm: 'webm', avi: 'avi', flv: 'flv', wmv: 'wmv', mpg: 'mpg', mpeg: 'mpg', ogv: 'ogv',
  mp3: 'mp3', m4a: 'm4a', aac: 'aac', ogg: 'ogg', opus: 'opus', flac: 'flac', wav: 'wav', aiff: 'aiff', aif: 'aiff', wma: 'wma', ac3: 'ac3',
};

/**
 * '[[0,12.5],[30,41]]' → sorted, non-overlapping [[start, end], …] in seconds
 * (touching or overlapping parts are joined); null if anything is off.
 */
function parseSegments(raw) {
  let list;
  try { list = JSON.parse(String(raw || '')); } catch { return null; }
  if (!Array.isArray(list) || !list.length || list.length > MAX_SEGMENTS) return null;
  const segs = [];
  for (const seg of list) {
    if (!Array.isArray(seg) || seg.length !== 2) return null;
    const [s, e] = seg;
    if (typeof s !== 'number' || typeof e !== 'number' || !Number.isFinite(s) || !Number.isFinite(e)) return null;
    if (s < 0 || e > 24 * 3600 || e - s < MIN_SEGMENT) return null;
    segs.push([Math.round(s * 1000) / 1000, Math.round(e * 1000) / 1000]);
  }
  segs.sort((x, y) => x[0] - y[0]);
  const out = [segs[0]];
  for (const [s, e] of segs.slice(1)) {
    const last = out[out.length - 1];
    if (s <= last[1] + 0.001) last[1] = Math.max(last[1], e); else out.push([s, e]);
  }
  return out;
}

const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();

/** The format "original" stands for with this input (null: none of ours). */
function originalFormat(originalName, hasVideo) {
  const key = ORIGINAL_FORMATS[extOf(originalName)] || null;
  if (!key) return hasVideo ? 'mp4' : 'mp3';
  // A video container holding only sound (e.g. an .mp4 song) stays audio.
  if (!hasVideo && has(VIDEO_CONVERT_FORMATS, key)) return 'm4a';
  return key;
}

// Output adjustments of the editor. Every value comes from these fixed lists.
const EDIT_FADES = ['0.5', '1', '2'];
const EDIT_VOLUMES = { mute: 0, '0.5': 0.5, '0.75': 0.75, '1.5': 1.5, '2': 2 };
const EDIT_ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 };

/** body → { fade, volume, aspect, rotate, separate } (null / false = untouched). */
function parseEditEffects(body = {}) {
  return {
    fade: EDIT_FADES.includes(String(body.fade)) ? Number(body.fade) : 0,
    volume: has(EDIT_VOLUMES, String(body.volume)) ? EDIT_VOLUMES[String(body.volume)] : null,
    aspect: has(EDIT_ASPECTS, String(body.aspect)) ? String(body.aspect) : null,
    rotate: has(ROTATIONS, String(body.rotate)) ? String(body.rotate) : null,
    separate: body.separate === 'true',
  };
}
/** Anything that needs re-encoding (the fast mode only copies). */
const needsEncoding = (fx) => Boolean(fx.fade || fx.volume !== null || fx.aspect || fx.rotate);

/**
 * ffmpeg arguments that keep `segs` (seconds of the input), joined, with the
 * adjustments applied to the joined result. The input is seeked to the first
 * kept moment and trimmed relative to it. With `graphFile` the filter graph is
 * read from that file (-/filter_complex): with many parts it would not fit in
 * Windows' 32 767-character command line.
 */
function editArgs({ inputPath, segs, withVideo, withAudio, config, body, fx, out, graphFile = null }) {
  const from = segs[0][0];
  const to = segs[segs.length - 1][1];
  const n = segs.length;
  const total = segs.reduce((acc, [s, e]) => acc + (e - s), 0);
  const fade = Math.min(fx.fade, total / 3);
  const graph = [];
  if (withVideo) graph.push(n > 1 ? `[0:v:0]split=${n}${segs.map((_, i) => `[vs${i}]`).join('')}` : '[0:v:0]null[vs0]');
  if (withAudio) graph.push(n > 1 ? `[0:a:0]asplit=${n}${segs.map((_, i) => `[as${i}]`).join('')}` : '[0:a:0]anull[as0]');
  const labels = [];
  segs.forEach(([s, e], i) => {
    const a = (s - from).toFixed(3);
    const b = (e - from).toFixed(3);
    if (withVideo) graph.push(`[vs${i}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}]`);
    if (withAudio) graph.push(`[as${i}]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}]`);
    labels.push(`${withVideo ? `[v${i}]` : ''}${withAudio ? `[a${i}]` : ''}`);
  });
  const outs = `${withVideo ? '[vc]' : ''}${withAudio ? '[ac]' : ''}`;
  graph.push(`${labels.join('')}concat=n=${n}:v=${withVideo ? 1 : 0}:a=${withAudio ? 1 : 0}${outs}`);
  const fadeOutAt = (total - fade).toFixed(3);

  let codec;
  if (withVideo) {
    const chain = [];
    if (fx.rotate) chain.push(ROTATIONS[fx.rotate]);
    if (fx.aspect) {
      // Centre crop to the chosen shape (vertical for TikTok/Reels, square…).
      const r = EDIT_ASPECTS[fx.aspect].toFixed(6);
      chain.push(`crop=w='if(gt(iw/ih,${r}),ih*${r},iw)':h='if(gt(iw/ih,${r}),ih,iw/${r})'`);
    }
    if (fade) chain.push(`fade=t=in:st=0:d=${fade.toFixed(3)}`, `fade=t=out:st=${fadeOutAt}:d=${fade.toFixed(3)}`);
    chain.push('scale=trunc(iw/2)*2:trunc(ih/2)*2', 'setsar=1');
    graph.push(`[vc]${chain.join(',')}[vout]`);
    const quality = pick(body.quality, QUALITIES) || 'alta';
    codec = ['-map', '[vout]', ...(withAudio ? ['-map', '[aout]'] : []),
      '-c:v', config.vcodec, ...VIDEO_QUALITY_SCALES[config.family][quality], ...(config.extra || [])];
    if (config.allowedFps) codec.push('-r', config.defaultFps);
    codec.push(...(withAudio ? ['-c:a', config.acodec] : ['-an']));
  } else {
    codec = ['-map', '[aout]', ...buildAudioArgs(config, { audioBitrate: body.audioBitrate || '192' })];
  }
  if (withAudio) {
    const chain = [];
    if (fx.volume !== null && fx.volume !== 1) chain.push(`volume=${fx.volume}`);
    if (fade) chain.push(`afade=t=in:st=0:d=${fade.toFixed(3)}`, `afade=t=out:st=${fadeOutAt}:d=${fade.toFixed(3)}`);
    graph.push(`[ac]${chain.length ? chain.join(',') : 'anull'}[aout]`);
  }
  const head = ['-ss', String(from), '-to', String(to), ...SAFE_INPUT, '-i', inputPath, '-map_metadata', '-1'];
  const graphArgs = graphFile ? ['-/filter_complex', graphFile] : ['-filter_complex', graph.join(';')];
  return { total, cpu: [...head, ...graphArgs, ...codec, out], codec, head, graph, graphArgs };
}

/**
 * Keeps `segments` of the input, joined in order (or each one as its own file
 * with fx.separate). mode 'exact' re-encodes (cuts on the exact frame, and can
 * apply fades, volume, shape and rotation); 'fast' copies the streams (no
 * quality loss, but each part starts at the keyframe before its start) and
 * needs targetFormat 'original'.
 */
function runEdit({ inputPath, originalName, segments, targetFormat, mode, body, ffmpegPath, hw = null }) {
  const fx = parseEditEffects(body);
  return async (job, ctx) => {
    ctx.update({ stage: 'Analizando…', progress: null });
    const info = await probe(ffmpegPath, inputPath);
    if (!info || !info.duration) throw new Error('No se pudo leer la duración del archivo.');
    const segs = segments
      .map(([s, e]) => [s, Math.min(e, info.duration)])
      .filter(([s, e]) => e - s >= MIN_SEGMENT);
    if (!segs.length) throw new Error('El resultado quedaría vacío: no queda ningún tramo dentro del archivo.');
    const total = segs.reduce((acc, [s, e]) => acc + (e - s), 0);
    const name = outputBaseName(originalName);
    const base = `${name} (editado)`;
    const partName = (i) => `${name} (tramo ${String(i + 1).padStart(segs.length >= 10 ? 2 : 1, '0')})`;
    const separate = fx.separate && segs.length > 1;

    if (mode === 'fast') {
      const ext = ORIGINAL_FORMATS[extOf(originalName)] ? extOf(originalName) : null;
      if (!ext) throw new Error('El modo rápido solo funciona con el formato original de archivos MP4, MKV, MOV, WEBM, MP3…');
      const copy = ['-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-map_metadata', '-1'];
      if (segs.length === 1) {
        const [s, e] = segs[0];
        const out = path.join(ctx.dir, `${base}.${ext}`);
        await runFfmpeg(ffmpegPath, ['-ss', String(s), '-to', String(e), ...SAFE_INPUT, '-i', inputPath, ...copy, out], ctx,
          { duration: e - s, stage: 'Recortando' });
        return out;
      }
      const parts = [];
      let done = 0;
      const upTo = separate ? 99 : 90;
      for (let i = 0; i < segs.length; i++) {
        const [s, e] = segs[i];
        const part = path.join(ctx.dir, separate ? `${partName(i)}.${ext}` : `part${i}.${ext}`);
        await runFfmpeg(ffmpegPath, ['-ss', String(s), '-to', String(e), ...SAFE_INPUT, '-i', inputPath, ...copy, part], ctx, {
          duration: e - s, from: Math.round((done / total) * upTo), to: Math.round(((done + e - s) / total) * upTo),
          stage: `Cortando tramo ${i + 1}/${segs.length}`,
        });
        done += e - s;
        parts.push(part);
      }
      if (separate) return parts;
      // Our own list of our own part files (plain names, next to the list):
      // the concat demuxer's safe mode accepts nothing else.
      const out = path.join(ctx.dir, `${base}.${ext}`);
      const list = path.join(ctx.dir, 'parts.txt');
      fs.writeFileSync(list, parts.map((p) => `file '${path.basename(p)}'`).join('\n'));
      await runFfmpeg(ffmpegPath, ['-f', 'concat', '-protocol_whitelist', 'file', '-i', list, '-map', '0', '-c', 'copy', out], ctx,
        { duration: total, from: 90, to: 99, stage: 'Uniendo tramos' });
      for (const p of [...parts, list]) fs.rmSync(p, { force: true });
      return out;
    }

    const key = targetFormat === 'original' ? originalFormat(originalName, info.hasVideo) : targetFormat;
    const { kind, config } = formatFor(key);
    if (kind === 'video' && !info.hasVideo) throw new Error('Este archivo no tiene vídeo; elige un formato de audio.');
    const withVideo = kind === 'video';
    const withAudio = info.hasAudio && fx.volume !== 0;
    if (!withVideo && !withAudio) throw new Error(fx.volume === 0 ? 'Sin sonido y sin vídeo no queda nada que exportar.' : 'Este archivo no tiene sonido.');

    // One output (all parts joined) or one per part.
    const outputs = separate
      ? segs.map((seg, i) => ({ segs: [seg], out: path.join(ctx.dir, `${partName(i)}.${config.ext}`) }))
      : [{ segs, out: path.join(ctx.dir, `${base}.${config.ext}`) }];
    const results = [];
    let done = 0;
    for (let i = 0; i < outputs.length; i++) {
      const o = outputs[i];
      const graphFile = path.join(ctx.dir, 'graph.txt');
      const a = editArgs({ inputPath, segs: o.segs, withVideo, withAudio, config, body, fx, out: o.out, graphFile });
      fs.writeFileSync(graphFile, a.graph.join(';'));
      const range = { duration: a.total, from: Math.round((done / total) * 99), to: Math.round(((done + a.total) / total) * 99) };
      const label = outputs.length > 1 ? ` ${i + 1}/${outputs.length}` : '';
      const gpuCodec = hw && withVideo ? toHardware(a.codec, hw) : null;
      let ok = false;
      if (gpuCodec) {
        try {
          await runFfmpeg(ffmpegPath, [...a.head, ...a.graphArgs, ...gpuCodec, o.out], ctx, { ...range, stage: `Editando (GPU)${label}` });
          ok = fs.existsSync(o.out);
        } catch (err) {
          if (ctx.isCanceled()) throw err;
        }
      }
      try {
        if (!ok) await runFfmpeg(ffmpegPath, a.cpu, ctx, { ...range, stage: `Editando${label}` });
      } finally {
        fs.rmSync(graphFile, { force: true });
      }
      if (!fs.existsSync(o.out)) throw new Error('No se pudo convertir el archivo.');
      results.push(o.out);
      done += a.total;
    }
    return results.length === 1 ? results[0] : results;
  };
}

module.exports = {
  AUDIO_CONVERT_FORMATS, VIDEO_CONVERT_FORMATS, IMAGE_FORMATS, MAX_MERGE, MAX_SEGMENTS, formatFor, parseTimestamp, parseTargetMb,
  buildAudioArgs, buildVideoArgs, toHardware, detectHwEncoder, describeConvert, probe,
  runConvert, runCompress, runImage, runMerge, runEdit, editArgs, parseSegments, parseEditEffects, needsEncoding, originalFormat, ORIGINAL_FORMATS, outputBaseName, INPUT_DEMUXERS,
};
