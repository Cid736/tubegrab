// ffmpeg conversion jobs: target formats, option -> argv mapping, progress parsing.
const { spawn } = require('child_process');
const fs = require('fs');
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

const parseClock = (s) => s.split(':').reduce((acc, p) => acc * 60 + parseFloat(p), 0);

/**
 * Returns a job runner. `inputPath` is the uploaded temp file; the output is
 * named after the original file with the target extension.
 */
function runConvert({ inputPath, originalName, targetFormat, body, ffmpegPath }) {
  const { kind, config } = formatFor(targetFormat);
  const trimStart = parseTimestamp(body.trimStart);
  const trimEnd = parseTimestamp(body.trimEnd);
  const speed = Number(pick(body.speed, SPEEDS) || 1);

  return (job, ctx) => new Promise((resolve, reject) => {
    // Strip path separators and characters Windows forbids; keeps unicode names.
    const baseName = (originalName.replace(/\.[^/.\\]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/^[.\s]+|[.\s]+$/g, '') || 'archivo').slice(0, 150);
    const outputPath = path.join(ctx.dir, `${baseName}.${config.ext}`);

    const args = ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1'];
    if (trimStart !== null) args.push('-ss', String(trimStart));
    if (trimEnd !== null) args.push('-to', String(trimEnd));
    // An upload can pose as a video while really being a playlist (HLS,
    // concat…) that points ffmpeg at other local files or URLs. Only real
    // media demuxers, and no network protocols, may open the input.
    args.push('-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS);
    args.push('-i', inputPath, '-map_metadata', '-1');
    args.push(...(kind === 'audio' ? buildAudioArgs(config, body) : buildVideoArgs(config, body)));
    args.push(outputPath);

    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    ctx.setProcess(proc);
    ctx.update({ stage: 'Convirtiendo', progress: 0 });

    let duration = null;
    let stderr = '';
    let buffer = '';
    const startedAt = Date.now();

    proc.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-8000);
      if (duration === null) {
        const m = /Duration: (\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(stderr);
        if (m) {
          const full = parseClock(m[1]);
          const end = trimEnd !== null ? Math.min(trimEnd, full) : full;
          duration = Math.max(0.1, (end - (trimStart || 0)) / speed);
        }
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
        const pct = Math.min(99, Math.round((outTime / duration) * 100));
        const elapsed = (Date.now() - startedAt) / 1000;
        const eta = pct > 2 ? Math.round((elapsed / pct) * (100 - pct)) : null;
        ctx.update({ progress: pct, eta });
      }
    });
    proc.on('error', (err) => reject(new Error(`No se pudo iniciar ffmpeg: ${err.message}`)));
    proc.on('close', (code) => {
      if (ctx.isCanceled()) return reject(new Error('Cancelado'));
      if (code === 0 && fs.existsSync(outputPath)) return resolve(outputPath);
      console.error('[CONVERT ERROR]', stderr.split('\n').slice(-4).join(' | '));
      reject(new Error('No se pudo convertir el archivo. Verifica que sea un archivo de audio/vídeo válido.'));
    });
  });
}

module.exports = {
  AUDIO_CONVERT_FORMATS, VIDEO_CONVERT_FORMATS, formatFor, parseTimestamp,
  buildAudioArgs, buildVideoArgs, describeConvert, runConvert,
};
