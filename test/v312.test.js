// v3.12: chapters. (The lists' tests moved with them to Escuchar.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseChapters, readChapters, cleanChapters, fromYouTube } = require('../lib/chapters');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tg-v312-'));

test('chapters: read from ffmpeg\'s description, cleaned; YouTube\'s too', () => {
  const stderr = `Input #0, mov,mp4,m4a, from 'x.m4a':
  Duration: 00:16:00.00, start: 0.000000, bitrate: 65 kb/s
  Chapters:
    Chapter #0:0: start 0.000000, end 300.000000
      Metadata:
        title           : Capítulo uno
    Chapter #0:1: start 300.000000, end 600.000000
      Metadata:
        title           : Dos\u0007 <b>
    Chapter #0:2: start 600.000000, end 960.000000
  Stream #0:0[0x1](und): Audio: aac (LC)
      Metadata:
        title           : not a chapter`;
  assert.deepEqual(parseChapters(stderr), [
    { start: 0, end: 300, title: 'Capítulo uno' }, { start: 300, end: 600, title: 'Dos <b>' }, { start: 600, end: 960, title: '3' },
  ]);
  assert.deepEqual(parseChapters('Duration: 00:03:00.00'), [], 'none');
  assert.deepEqual(cleanChapters([{ start: 5, end: 9, title: 'only one' }]), [], 'a single chapter is no chapters');
  assert.deepEqual(cleanChapters([{ start: 'x' }, { start: -1 }, { start: 1e9 }, { start: 30, end: 10, title: 'b' }, { start: 0, title: 'a' }]), [{ start: 0, end: null, title: 'a' }, { start: 30, end: null, title: 'b' }]);
  assert.deepEqual(fromYouTube([{ start_time: 0, end_time: 61.234, title: 'Intro' }, { start_time: 61.234, end_time: 120, title: 'Parte 1' }]), [{ start: 0, end: 61.2, title: 'Intro' }, { start: 61.2, end: 120, title: 'Parte 1' }]);
  assert.deepEqual(fromYouTube(null), []);
});

test('chapters: a real file with chapters, read with ffmpeg', async (t) => {
  let ffmpeg;
  try { ffmpeg = require('../lib/convert') && path.join(__dirname, '..', 'bin', 'ffmpeg.exe'); } catch { ffmpeg = null; }
  if (!ffmpeg || !fs.existsSync(ffmpeg)) { t.skip('no ffmpeg'); return; }
  const dir = tmp();
  try {
    const meta = path.join(dir, 'meta.txt');
    fs.writeFileSync(meta, ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1\nSTART=0\nEND=2\ntitle=Uno\n[CHAPTER]\nTIMEBASE=1/1\nSTART=2\nEND=4\ntitle=Dos\n');
    const file = path.join(dir, 'libro.m4a');
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=duration=4', '-i', meta, '-map_metadata', '1', '-map_chapters', '1', file]);
    const ch = await readChapters(ffmpeg, file, ['-protocol_whitelist', 'file']);
    assert.deepEqual(ch.map((c) => [c.start, c.title]), [[0, 'Uno'], [2, 'Dos']]);
    assert.deepEqual(await readChapters(ffmpeg, path.join(dir, 'missing.m4a'), []), []);
    assert.deepEqual(await readChapters(path.join(dir, 'no-ffmpeg.exe'), file, []), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
