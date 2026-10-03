// Song tags (title, artist, album, track…), cover art and lyrics, written by
// remuxing with ffmpeg: the audio itself is copied, never re-encoded.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { probe, outputBaseName, INPUT_DEMUXERS } = require('./convert');
const { findLyrics, cleanText } = require('./lyrics');

const TAG_FIELDS = ['title', 'artist', 'album', 'album_artist', 'track', 'disc', 'date', 'genre', 'lyrics', 'bpm', 'key'];
// Tempo and key go under each format's own tag name (MP4 has none ffmpeg writes).
const EXTRA_TAG_NAMES = {
  mp3: { bpm: 'TBPM', key: 'TKEY' },
  flac: { bpm: 'BPM', key: 'INITIALKEY' },
  ogg: { bpm: 'BPM', key: 'INITIALKEY' },
  opus: { bpm: 'BPM', key: 'INITIALKEY' },
};
const KEY_RE = /^[A-G][b#]?m?$/;
const MAX_TAG = 300;
const MAX_FILES = 50;
// Formats whose tags we write; the cover can only go into the first three.
const TAG_FORMATS = new Set(['mp3', 'm4a', 'flac', 'ogg', 'opus']);
const COVER_FORMATS = new Set(['mp3', 'm4a', 'flac']);
const SAFE_INPUT = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS];
const SAFE_IMAGE = ['-protocol_whitelist', 'file', '-format_whitelist', 'png_pipe,jpeg_pipe,webp_pipe'];

const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function run(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-y', '-hide_banner', '-nostats', '-loglevel', 'error', ...args], { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (c) => { out = (out + c.toString('utf8')).slice(-400000); });
    p.stderr.on('data', (c) => { err = (err + c.toString('utf8')).slice(-4000); });
    p.on('error', (e) => reject(new Error(`No se pudo iniciar ffmpeg: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(Object.assign(new Error('No se pudieron escribir las etiquetas.'), { stderr: err }))));
  });
}

/** ffmpeg's ffmetadata text (escaped with backslashes) → { key: value } of the global section. */
function parseFfmetadata(text) {
  const tags = {};
  const lines = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) { cur += text[i + 1] === '\n' ? '\n' : `\\${text[i + 1]}`; i += 1; continue; }
    if (c === '\n') { lines.push(cur); cur = ''; continue; }
    cur += c;
  }
  lines.push(cur);
  for (const line of lines) {
    if (line.startsWith('[')) break; // [STREAM] / [CHAPTER] sections: not ours
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    let key = '';
    let i = 0;
    for (; i < line.length && line[i] !== '='; i++) key += line[i] === '\\' ? line[++i] : line[i];
    if (i >= line.length) continue;
    const value = line.slice(i + 1).replace(/\\(.)/g, '$1');
    tags[key.toLowerCase()] = value;
  }
  return tags;
}

/** The tags we show for one file (every field a string), plus duration and cover. */
async function readTags(ffmpegPath, inputPath, originalName) {
  const ext = extOf(originalName);
  // Ogg/Opus keep their tags on the audio stream, not the container.
  const from = ext === 'ogg' || ext === 'opus' ? ['-map_metadata', '0:s:a:0'] : [];
  const text = await run(ffmpegPath, [...SAFE_INPUT, '-i', inputPath, ...from, '-f', 'ffmetadata', '-']).catch(() => '');
  const raw = parseFfmetadata(text);
  const info = await probe(ffmpegPath, inputPath);
  const tags = {};
  for (const f of TAG_FIELDS) {
    const alias = {
      album_artist: ['album_artist', 'albumartist', 'album artist'], date: ['date', 'year'], track: ['track', 'tracknumber'], disc: ['disc', 'discnumber'],
      bpm: ['tbpm', 'bpm'], key: ['tkey', 'initialkey', 'key'],
    }[f] || [f];
    const found = alias.map((a) => raw[a]).find((v) => v !== undefined);
    tags[f] = cleanText(found || '', f === 'lyrics' ? 20000 : MAX_TAG);
  }
  return { name: originalName, tags, duration: info && info.duration, hasCover: Boolean(info && info.hasCover), coverOk: COVER_FORMATS.has(ext) };
}

/**
 * '[{"title":"…","artist":"…"}, …]' (one object per file, in order) → the
 * validated list, or null. Unknown keys are dropped; empty strings clear a tag.
 */
function parseTagList(raw, count) {
  let list;
  try { list = JSON.parse(String(raw || '')); } catch { return null; }
  if (!Array.isArray(list) || list.length !== count) return null;
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const tags = {};
    for (const f of TAG_FIELDS) {
      if (!has(item, f)) continue;
      if (typeof item[f] !== 'string') return null;
      const v = f === 'lyrics' ? cleanText(item[f]) : cleanText(item[f], MAX_TAG).replace(/\n/g, ' ');
      if (item[f].length > (f === 'lyrics' ? 20000 : MAX_TAG)) return null;
      if ((f === 'track' || f === 'disc') && v && !/^\d{1,3}(\/\d{1,3})?$/.test(v)) return null;
      if (f === 'date' && v && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(v)) return null;
      if (f === 'bpm' && v && !/^\d{2,3}$/.test(v)) return null;
      if (f === 'key' && v && !KEY_RE.test(v)) return null;
      tags[f] = v;
    }
    out.push(tags);
  }
  return out;
}

/** Writes `tags` (+ optional cover) into a copy of the input at `out`. */
async function writeTags({ ffmpegPath, inputPath, ext, tags, coverPath = null, out }) {
  const withCover = coverPath && COVER_FORMATS.has(ext);
  const args = [...SAFE_INPUT, '-i', inputPath];
  if (withCover) args.push(...SAFE_IMAGE, '-i', coverPath);
  // New cover: audio + the picture (as JPEG, up to 1000 px); otherwise every stream as is.
  if (withCover) {
    args.push('-map', '0:a', '-map', '1:0', '-c:a', 'copy', '-c:v', 'mjpeg', '-q:v', '2',
      '-vf', "scale='min(1000,iw)':-2", '-disposition:v:0', 'attached_pic');
  } else {
    args.push('-map', '0', '-c', 'copy');
  }
  args.push('-map_metadata', '0');
  // Ogg/Opus keep tags on the audio stream (the old ones would win otherwise).
  const target = ext === 'ogg' || ext === 'opus' ? '-metadata:s:a:0' : '-metadata';
  for (const [k, v] of Object.entries(tags)) {
    if (!TAG_FIELDS.includes(k)) continue;
    if (k === 'bpm' || k === 'key') {
      const name = EXTRA_TAG_NAMES[ext] && EXTRA_TAG_NAMES[ext][k];
      if (name) args.push(target, `${name}=${v}`);
      continue;
    }
    args.push(target, `${k}=${v}`);
  }
  if (ext === 'mp3') args.push('-id3v2_version', '3');
  args.push(out);
  await run(ffmpegPath, args);
}

/**
 * Works out the tempo and key of `file` and writes them into it (in place,
 * where the format has tags for them). Returns { bpm, key, camelot }.
 */
async function addTempoAndKey({ ffmpegPath, file, duration = null }) {
  const found = await require('./analysis').analyzeFile(ffmpegPath, file, duration);
  const ext = extOf(file);
  const tags = {};
  if (found.bpm) tags.bpm = String(found.bpm);
  if (found.key) tags.key = found.key;
  if (EXTRA_TAG_NAMES[ext] && Object.keys(tags).length) {
    const tmp = path.join(path.dirname(file), `bpm-tmp.${ext}`);
    try {
      await writeTags({ ffmpegPath, inputPath: file, ext, tags, out: tmp });
      fs.renameSync(tmp, file);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  return found;
}

/** Adds lyrics found online to `file` in place (+ a .lrc next to it when synced). Returns the .lrc path or null. */
async function addLyrics({ ffmpegPath, file, artist, title, album, duration, fetchImpl }) {
  const found = await findLyrics({ artist, title, album, duration }, fetchImpl ? { fetchImpl } : undefined);
  if (!found) return null;
  const ext = extOf(file);
  const tmp = path.join(path.dirname(file), `lyrics-tmp.${ext}`);
  await writeTags({ ffmpegPath, inputPath: file, ext, tags: { lyrics: found.plain }, out: tmp });
  fs.renameSync(tmp, file);
  if (!found.synced) return null;
  const lrc = file.slice(0, file.length - path.extname(file).length) + '.lrc';
  fs.writeFileSync(lrc, `${found.synced}\n`, 'utf8');
  return lrc;
}

/**
 * Job runner: writes each file's tags (and the shared cover), optionally
 * renames to "Artist - Title" and looks up lyrics for songs without them.
 */
function runTags({ inputs, tagList, coverPath = null, rename = false, lyrics = false, ffmpegPath, fetchImpl }) {
  return async (job, ctx) => {
    const outputs = [];
    const used = new Set();
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const ext = extOf(input.name);
      const tags = tagList[i];
      ctx.update({ stage: `Etiquetando ${i + 1}/${inputs.length}`, progress: Math.round((i / inputs.length) * 100) });
      const wanted = rename && tags.artist && tags.title ? `${tags.artist} - ${tags.title}` : input.name.replace(/\.[^.]+$/, '');
      let base = outputBaseName(`${wanted}.x`);
      for (let n = 2; used.has(base.toLowerCase()); n++) base = `${outputBaseName(`${wanted}.x`)} (${n})`;
      used.add(base.toLowerCase());
      const out = path.join(ctx.dir, `${base}.${ext}`);
      await writeTags({ ffmpegPath, inputPath: input.path, ext, tags, coverPath, out });
      outputs.push(out);
      if (lyrics && !tags.lyrics && tags.artist && tags.title) {
        ctx.update({ stage: `Buscando letra ${i + 1}/${inputs.length}` });
        try {
          const info = await probe(ffmpegPath, out);
          const lrc = await addLyrics({ ffmpegPath, file: out, artist: tags.artist, title: tags.title, album: tags.album, duration: info && info.duration, fetchImpl });
          if (lrc) outputs.push(lrc);
        } catch { /* no lyrics (offline, not found…): the tags are still written */ }
      }
    }
    return outputs;
  };
}

module.exports = {
  EXTRA_TAG_NAMES, KEY_RE, TAG_FIELDS, TAG_FORMATS, COVER_FORMATS, MAX_FILES, parseFfmetadata, readTags, parseTagList, writeTags, addLyrics, addTempoAndKey, runTags,
};
