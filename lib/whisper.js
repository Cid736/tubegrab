// Automatic subtitles with Whisper (whisper.cpp), on this computer: the sound
// goes to a 16 kHz WAV, whisper-cli writes the words with their times, and
// from those we make an .srt, a plain transcript, or subtitles burnt into
// the video (classic lines, or big "TikTok" words with the one being said lit).
// The engine and the models are downloaded on demand by the desktop app
// (pinned by SHA-256) into one folder: TUBEGRAB_WHISPER_DIR.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { INPUT_DEMUXERS, probe, outputBaseName, findFont, toHardware } = require('./convert');

const ENGINE = {
  version: 'b5130',
  url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip',
  sha256: 'f9ec6c52a2e949b62ab51fa21d0d497958f9e41c3010c157c4e42932d5316f3c',
  size: 8573270,
  // What we keep from the zip (folder "Release"): the program and its libraries.
  files: /^(whisper-cli\.exe|whisper\.dll|ggml[\w-]*\.dll)$/i,
};
const MODELS = {
  tiny: { file: 'ggml-tiny.bin', size: 77691713, sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21' },
  base: { file: 'ggml-base.bin', size: 147951465, sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe' },
  small: { file: 'ggml-small.bin', size: 487601967, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b' },
};
const modelUrl = (name) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODELS[name].file}`;
const LANGS = ['auto', 'es', 'en', 'fr', 'de', 'it', 'pt', 'ca', 'gl', 'eu', 'nl', 'ja', 'ko', 'zh', 'ru', 'ar', 'hi', 'tr', 'pl'];
const STYLES = ['classic', 'big'];
const OUTPUTS = ['srt', 'burn', 'both', 'txt'];
const SAFE_INPUT = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS];

function whisperDir() {
  const dir = process.env.TUBEGRAB_WHISPER_DIR;
  return dir && path.isAbsolute(dir) ? dir : null;
}

/** What's installed: { engine: bool, models: ['base', …] }. */
function status(dir = whisperDir()) {
  if (!dir) return { available: false, engine: false, models: [] };
  const engine = fs.existsSync(path.join(dir, 'whisper-cli.exe')) || fs.existsSync(path.join(dir, 'whisper-cli'));
  const models = Object.keys(MODELS).filter((m) => {
    try { return fs.statSync(path.join(dir, MODELS[m].file)).size === MODELS[m].size; } catch { return false; }
  });
  return { available: engine && models.length > 0, engine, models };
}

function cliPath(dir) {
  const exe = path.join(dir, 'whisper-cli.exe');
  return fs.existsSync(exe) ? exe : path.join(dir, 'whisper-cli');
}

/** The best model installed among the ones asked for (or any). */
function pickModel(dir, wanted) {
  const have = status(dir).models;
  if (MODELS[wanted] && have.includes(wanted)) return wanted;
  return ['base', 'small', 'tiny'].find((m) => have.includes(m)) || null;
}

function run(cmd, args, ctx, onLine, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, cwd });
    if (ctx) ctx.setProcess(p);
    let err = '';
    let buf = '';
    const feed = (c) => {
      const text = c.toString('utf8');
      err = (err + text).slice(-8000);
      buf += text;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      if (onLine) lines.forEach(onLine);
    };
    p.stdout.on('data', feed);
    p.stderr.on('data', feed);
    p.on('error', (e) => reject(new Error(`No se pudo iniciar ${path.basename(cmd)}: ${e.message}`)));
    p.on('close', (code) => {
      if (ctx && ctx.isCanceled()) return reject(new Error('Cancelado'));
      return code === 0 ? resolve(err) : reject(Object.assign(new Error('No se pudo transcribir el audio.'), { stderr: err }));
    });
  });
}

/** whisper-cli's JSON → words [{ start, end, text }] in seconds (empty and odd entries dropped). */
function parseWords(json) {
  let data;
  try { data = typeof json === 'string' ? JSON.parse(json) : json; } catch { return []; }
  const list = data && Array.isArray(data.transcription) ? data.transcription : [];
  const out = [];
  for (const seg of list.slice(0, 200000)) {
    if (!seg || !seg.offsets) continue;
    const start = Number(seg.offsets.from) / 1000;
    const end = Number(seg.offsets.to) / 1000;
    const text = String(seg.text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
    // Whisper's own markers ("[MÚSICA]", "(risas)", "[_BEG_]") aren't words said.
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || /^[[(].*[\])]$/.test(text)) continue;
    out.push({ start, end: Math.max(end, start + 0.05), text });
  }
  return out;
}

/** Words → subtitle lines: a sentence each, at most ~42 characters and 6 s. */
function toLines(words, { maxChars = 42, maxSeconds = 6, maxWords = 0 } = {}) {
  const lines = [];
  let cur = null;
  for (const w of words) {
    const gap = cur ? w.start - cur.end : 0;
    const tooLong = cur && ((`${cur.text} ${w.text}`).length > maxChars || w.end - cur.start > maxSeconds || (maxWords && cur.words.length >= maxWords));
    if (!cur || gap > 0.8 || tooLong) {
      if (cur) lines.push(cur);
      cur = { start: w.start, end: w.end, text: w.text, words: [w] };
    } else {
      cur.text += ` ${w.text}`;
      cur.end = w.end;
      cur.words.push(w);
    }
    // A sentence ends here.
    if (!maxWords && /[.!?…]$/.test(w.text)) { lines.push(cur); cur = null; }
  }
  if (cur) lines.push(cur);
  return lines;
}

const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
};

function toSrt(lines) {
  return `${lines.map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${l.text}\n`).join('\n')}`;
}

const assTime = (s) => {
  const cs = Math.max(0, Math.round(s * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor((cs % 360000) / 6000)).padStart(2, '0')}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
// Text never carries ASS override codes: braces and backslashes are dropped.
const assText = (s) => String(s).replace(/[{}\\]/g, '').replace(/\n/g, ' ');

/**
 * An .ass subtitle file for burning in. 'classic': white lines with a dark
 * outline at the bottom; 'big': up to three words at a time, large, in the
 * lower third, the word being said in yellow.
 */
function toAss(words, { style = 'classic', width = 1280, height = 720, font = 'Arial' } = {}) {
  const big = style === 'big';
  // By the shorter side, so a vertical video's lines still fit across.
  const size = Math.round(big ? Math.min(height * 0.085, width * 0.075) : Math.min(height * 0.05, width * 0.045));
  const outline = Math.max(2, Math.round(size / (big ? 9 : 14)));
  const marginV = Math.round(height * (big ? 0.22 : 0.06));
  const head = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},${big ? 0 : 1},2,${Math.round(width * 0.06)},${Math.round(width * 0.06)},${marginV},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = [];
  if (!big) {
    for (const l of toLines(words)) events.push(`Dialogue: 0,${assTime(l.start)},${assTime(l.end)},Default,,0,0,0,,${assText(l.text)}`);
  } else {
    for (const chunk of toLines(words, { maxWords: 3, maxChars: 22, maxSeconds: 3 })) {
      chunk.words.forEach((w, i) => {
        const next = chunk.words[i + 1];
        const end = next ? next.start : chunk.end;
        const text = chunk.words.map((x, k) => (k === i ? `{\\c&H00E5FF&}${assText(x.text).toUpperCase()}{\\c&HFFFFFF&}` : assText(x.text).toUpperCase())).join(' ');
        events.push(`Dialogue: 0,${assTime(w.start)},${assTime(Math.max(end, w.start + 0.05))},Default,,0,0,0,,${text}`);
      });
    }
  }
  return `${[...head, ...events].join('\n')}\n`;
}

/**
 * Transcribes `input` (any audio/video file): resolves with its words.
 * Progress goes from `from` to `to` percent.
 */
async function transcribe({ ffmpegPath, input, lang = 'auto', translate = false, model = 'base', ctx, from = 0, to = 90, dir = whisperDir() }) {
  if (!dir || !status(dir).engine) throw new Error('Falta el motor de subtítulos: instálalo en Ajustes → Conversión.');
  const chosen = pickModel(dir, model);
  if (!chosen) throw new Error('Falta un modelo de subtítulos: descárgalo en Ajustes → Conversión.');
  const info = await probe(ffmpegPath, input);
  if (!info || !info.hasAudio) throw new Error('Este archivo no tiene sonido que transcribir.');
  const wav = path.join(ctx.dir, 'speech.wav');
  ctx.update({ stage: 'Preparando el audio…', progress: from });
  await run(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...SAFE_INPUT, '-i', input, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], ctx);
  const base = path.join(ctx.dir, 'speech');
  const threads = String(Math.max(1, Math.min(8, os.cpus().length)));
  const args = ['-m', path.join(dir, MODELS[chosen].file), '-f', wav, '-l', LANGS.includes(lang) ? lang : 'auto', '-t', threads,
    '-oj', '-ml', '1', '-sow', '-pp', '-of', base];
  if (translate) args.push('-tr');
  const span = to - from;
  ctx.update({ stage: 'Escuchando y escribiendo…', progress: from + Math.round(span * 0.05) });
  await run(cliPath(dir), args, ctx, (line) => {
    const m = /progress\s*=\s*(\d+)%/.exec(line);
    if (m) ctx.update({ progress: Math.min(to, from + Math.round(span * (0.05 + 0.95 * (Number(m[1]) / 100)))) });
  }, ctx.dir);
  let words = [];
  try { words = parseWords(fs.readFileSync(`${base}.json`, 'utf8')); } finally {
    fs.rmSync(wav, { force: true });
    fs.rmSync(`${base}.json`, { force: true });
  }
  return { words, duration: info.duration, hasVideo: info.hasVideo, width: info.width, height: info.height, model: chosen };
}

/** Burns subtitles (.ass made from `words`) into a copy of `input` at `out`. */
async function burn({ ffmpegPath, input, out, words, style, width, height, ctx, duration, hw = null, from = 90, to = 99 }) {
  const font = findFont();
  const fontsdir = path.join(ctx.dir, 'fonts');
  fs.mkdirSync(fontsdir, { recursive: true });
  if (font) fs.copyFileSync(font, path.join(fontsdir, path.basename(font)));
  fs.writeFileSync(path.join(ctx.dir, 'subs.ass'), toAss(words, { style, width: width || 1280, height: height || 720, font: 'Arial' }), 'utf8');
  const { runFfmpeg, VIDEO_CONVERT_FORMATS } = require('./convert');
  const ext = path.extname(out).slice(1).toLowerCase();
  const fmt = ext === 'webm' ? VIDEO_CONVERT_FORMATS.webm : ext === 'mkv' ? VIDEO_CONVERT_FORMATS.mkv : VIDEO_CONVERT_FORMATS.mp4;
  // Plain names inside the job folder (ffmpeg runs there): nothing to escape.
  const head = [...SAFE_INPUT, '-i', input, '-map', '0:v:0', '-map', '0:a?', '-vf', 'subtitles=subs.ass:fontsdir=fonts,scale=trunc(iw/2)*2:trunc(ih/2)*2'];
  const cpu = ['-c:v', fmt.vcodec, '-crf', fmt.family === 'vp9' ? '30' : '20', ...(fmt.extra || []), '-c:a', 'copy'];
  const gpu = hw ? toHardware(cpu, hw) : null;
  const opts = { duration, from, to, stage: 'Poniendo los subtítulos…', cwd: ctx.dir };
  try {
    if (gpu) {
      try {
        await runFfmpeg(ffmpegPath, [...head, ...gpu, out], ctx, { ...opts, stage: 'Poniendo los subtítulos (GPU)…' });
        if (fs.existsSync(out)) return out;
      } catch (err) { if (ctx.isCanceled()) throw err; }
    }
    await runFfmpeg(ffmpegPath, [...head, ...cpu, out], ctx, opts);
    return out;
  } finally {
    fs.rmSync(path.join(ctx.dir, 'subs.ass'), { force: true });
    fs.rmSync(fontsdir, { recursive: true, force: true });
  }
}

/** Job runner for Convertir → Subtítulos. */
function runTranscribe({ inputPath, originalName, body, ffmpegPath, hw = null }) {
  const lang = LANGS.includes(body.lang) ? body.lang : 'auto';
  const output = OUTPUTS.includes(body.output) ? body.output : 'srt';
  const style = STYLES.includes(body.style) ? body.style : 'classic';
  return async (job, ctx) => {
    const wantsBurn = output === 'burn' || output === 'both';
    const t = await transcribe({ ffmpegPath, input: inputPath, lang, translate: body.translate === 'true', model: body.model, ctx, from: 0, to: wantsBurn ? 60 : 97 });
    if (!t.words.length) throw new Error('No se ha oído ninguna palabra en este archivo.');
    const name = outputBaseName(originalName);
    const results = [];
    if (output === 'srt' || output === 'both') {
      const srt = path.join(ctx.dir, `${name}.srt`);
      fs.writeFileSync(srt, toSrt(toLines(t.words)), 'utf8');
      results.push(srt);
    }
    if (output === 'txt') {
      const txt = path.join(ctx.dir, `${name} (transcripción).txt`);
      fs.writeFileSync(txt, `${toLines(t.words, { maxChars: 400, maxSeconds: 60 }).map((l) => l.text).join('\n')}\n`, 'utf8');
      results.push(txt);
    }
    if (wantsBurn) {
      if (!t.hasVideo) throw new Error('Este archivo no tiene imagen: elige «Archivo .srt» o «Texto».');
      const ext = ['mkv', 'webm'].includes(path.extname(originalName).slice(1).toLowerCase()) ? path.extname(originalName).slice(1).toLowerCase() : 'mp4';
      const out = path.join(ctx.dir, `${name} (subtitulado).${ext}`);
      await burn({ ffmpegPath, input: inputPath, out, words: t.words, style, width: t.width, height: t.height, ctx, duration: t.duration, hw, from: 60, to: 99 });
      results.unshift(out);
    }
    return results.length === 1 ? results[0] : results;
  };
}

module.exports = {
  ENGINE, MODELS, LANGS, STYLES, OUTPUTS, modelUrl, whisperDir, status, pickModel, parseWords, toLines, toSrt, toAss, transcribe, burn, runTranscribe,
};
