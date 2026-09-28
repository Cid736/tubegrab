const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const convert = require('../lib/convert');
const { ffmpegPath } = require('./helpers');

test('parseTimestamp', () => {
  assert.equal(convert.parseTimestamp(''), null);
  assert.equal(convert.parseTimestamp('90'), 90);
  assert.equal(convert.parseTimestamp('1:30'), 90);
  assert.equal(convert.parseTimestamp('0:01:30.5'), 90.5);
  for (const bad of ['-5', '1:60', 'abc', '1;rm', '99999:00:00', '1e3', '1:2:3:4']) {
    assert.ok(Number.isNaN(convert.parseTimestamp(bad)), bad);
  }
});

test('formatFor only knows real formats (no prototype keys)', () => {
  assert.equal(convert.formatFor('mp3').kind, 'audio');
  assert.equal(convert.formatFor('gif').kind, 'video');
  for (const bad of ['__proto__', 'constructor', 'toString', 'exe', '']) assert.equal(convert.formatFor(bad), null, bad);
});

test('user values never reach ffmpeg unless they are on a fixed list', () => {
  const evil = {
    audioBitrate: '320k -i /etc/passwd', sampleRate: '1;x', channels: '9', speed: '3',
    resolution: '720,drawtext=textfile=/etc/passwd', quality: 'x', fps: '1000', rotate: '__proto__', removeAudio: 'yes',
  };
  const audio = convert.buildAudioArgs(convert.formatFor('mp3').config, evil).join(' ');
  const video = convert.buildVideoArgs(convert.formatFor('mp4').config, evil).join(' ');
  for (const args of [audio, video]) {
    assert.doesNotMatch(args, /passwd|drawtext|1000|;|__proto__/);
  }
  assert.match(video, /-crf 23/); // default quality
});

test('video filters for rotate / speed / resolution', () => {
  const args = convert.buildVideoArgs(convert.formatFor('mp4').config, { rotate: '90', speed: '2', resolution: '720' });
  const vf = args[args.indexOf('-vf') + 1];
  assert.match(vf, /^transpose=1,setpts=PTS\/2,scale=-2:'min\(720/);
  assert.equal(args[args.indexOf('-af') + 1], 'atempo=2');
  const gif = convert.buildVideoArgs(convert.formatFor('gif').config, { fps: '60' });
  assert.match(gif.join(' '), /fps=30,.*palettegen/, 'GIF fps is capped');
});

// ---- Real ffmpeg runs ------------------------------------------------------
const ffmpeg = ffmpegPath();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-convert-test-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

function makeSamples() {
  const audio = path.join(work, 'tono.wav');
  const video = path.join(work, 'clip.mp4');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', audio]);
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=660:duration=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
  return { audio, video };
}

async function run(inputPath, targetFormat, body = {}, originalName = path.basename(inputPath)) {
  const dir = fs.mkdtempSync(path.join(work, 'out-'));
  const updates = [];
  const file = await convert.runConvert({ inputPath, originalName, targetFormat, body, ffmpegPath: ffmpeg })(
    {}, { dir, update: (p) => updates.push(p), setProcess() {}, isCanceled: () => false },
  );
  return { file, updates, dir };
}

test('converts to every audio and video format with real ffmpeg', { skip: !ffmpeg && 'ffmpeg not found', timeout: 600_000 }, async (t) => {
  const { audio, video } = makeSamples();
  for (const fmt of Object.keys(convert.AUDIO_CONVERT_FORMATS)) {
    await t.test(`audio → ${fmt}`, async () => {
      const { file } = await run(video, fmt, { audioBitrate: '128' });
      assert.ok(fs.statSync(file).size > 1000);
      assert.equal(path.extname(file).slice(1), convert.AUDIO_CONVERT_FORMATS[fmt].ext);
    });
  }
  for (const fmt of Object.keys(convert.VIDEO_CONVERT_FORMATS)) {
    await t.test(`video → ${fmt}`, async () => {
      const { file } = await run(video, fmt, { resolution: '240', quality: 'baja' });
      assert.ok(fs.statSync(file).size > 1000);
    });
  }
  await t.test('trim + speed + normalize + mono', async () => {
    const { file, updates } = await run(audio, 'mp3', { trimStart: '0.5', trimEnd: '1.5', speed: '2', normalize: 'true', channels: '1' });
    assert.ok(fs.statSync(file).size > 500);
    assert.ok(updates.some((u) => typeof u.progress === 'number'), 'reports progress');
  });
  await t.test('rotate + fps + remove audio', async () => {
    const { file } = await run(video, 'mkv', { rotate: '90', fps: '15', removeAudio: 'true' });
    // `ffmpeg -i` with no output exits 1 but prints the stream list.
    const info = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
    assert.doesNotMatch(info, /Audio:/);
    assert.match(info, /240x320/, 'rotated 90°');
    assert.match(info, /15 fps/);
  });
  await t.test('output named after the upload, even a Windows device name', async () => {
    const { file } = await run(audio, 'flac', {}, 'CON.wav');
    assert.equal(path.basename(file), '_CON.flac');
  });
  await t.test('a file that is not media fails cleanly', async () => {
    const junk = path.join(work, 'junk.mp4');
    fs.writeFileSync(junk, 'esto no es un vídeo');
    await assert.rejects(run(junk, 'mp3'), /No se pudo convertir/);
  });
});

test('GPU arguments: libx264/libx265 swapped for the vendor encoder, others untouched', () => {
  const mp4 = convert.buildVideoArgs(convert.formatFor('mp4').config, { quality: 'alta' });
  const nv = convert.toHardware(mp4, 'nvidia');
  assert.equal(nv[nv.indexOf('-c:v') + 1], 'h264_nvenc');
  assert.equal(nv[nv.indexOf('-cq') + 1], '18');
  assert.equal(nv[nv.indexOf('-pix_fmt') + 1], 'nv12');
  const hevc = convert.toHardware(convert.buildVideoArgs(convert.formatFor('hevc').config, {}), 'amd');
  assert.equal(hevc[hevc.indexOf('-c:v') + 1], 'hevc_amf');
  assert.ok(!hevc.includes('fast'), 'libx265 preset dropped');
  assert.ok(hevc.includes('hvc1'), 'Apple tag kept');
  assert.equal(convert.toHardware(convert.buildVideoArgs(convert.formatFor('webm').config, {}), 'nvidia'), null);
  assert.equal(convert.toHardware(mp4, 'nope'), null);
});

test('target size parsing', () => {
  assert.equal(convert.parseTargetMb('25'), 25);
  assert.equal(convert.parseTargetMb('8,5'), 8.5);
  for (const bad of ['0', '-3', '5000', 'abc', '', '1e9']) assert.equal(convert.parseTargetMb(bad), null, bad);
});

test('compress, extract an image and merge with real ffmpeg', { skip: !ffmpeg && 'ffmpeg not found', timeout: 300_000 }, async (t) => {
  const clip = path.join(work, 'c.mp4');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=10', '-f', 'lavfi', '-i', 'sine=d=10',
    '-shortest', '-c:v', 'libx264', '-b:v', '6M', '-c:a', 'aac', clip]);
  // A 3 s song with embedded cover art (audio first, then the cover added as a copy).
  const bare = path.join(work, 'bare.mp3');
  const cover = path.join(work, 'cover.jpg');
  const song = path.join(work, 's.mp3');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=d=3', '-c:a', 'libmp3lame', bare]);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:s=200x200', '-frames:v', '1', cover]);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', bare, '-i', cover, '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v', 'attached_pic', song]);
  const ctx = () => ({ dir: fs.mkdtempSync(path.join(work, 'n-')), update() {}, setProcess() {}, isCanceled: () => false });

  await t.test('compress lands close to the target', async () => {
    const out = await convert.runCompress({ inputPath: clip, originalName: 'c.mp4', targetMb: 2, ffmpegPath: ffmpeg })({}, ctx());
    const mb = fs.statSync(out).size / 1048576;
    // Never over the target (a test pattern compresses so well it can land well under).
    assert.ok(mb <= 2.05 && mb > 0.5, `${mb.toFixed(2)} MB`);
  });
  await t.test('too small for the length is refused with the minimum', async () => {
    await assert.rejects(convert.runCompress({ inputPath: clip, originalName: 'c.mp4', targetMb: 0.05, ffmpegPath: ffmpeg })({}, ctx()), /al menos/);
  });
  await t.test('frame and cover images', async () => {
    const frame = await convert.runImage({ inputPath: clip, originalName: 'c.mp4', targetFormat: 'png', body: { imageMode: 'frame', time: '4' }, ffmpegPath: ffmpeg })({}, ctx());
    assert.match(path.basename(frame), /\(4 s\)\.png$/);
    const cover = await convert.runImage({ inputPath: song, originalName: 's.mp3', targetFormat: 'jpg', body: { imageMode: 'cover' }, ffmpegPath: ffmpeg })({}, ctx());
    assert.ok(fs.statSync(cover).size > 100);
    await assert.rejects(convert.runImage({ inputPath: clip, originalName: 'c.mp4', targetFormat: 'jpg', body: { imageMode: 'frame', time: '99' }, ffmpegPath: ffmpeg })({}, ctx()), /fuera/);
  });
  await t.test('merge video + song, and two songs', async () => {
    const v = await convert.runMerge({ inputs: [{ path: clip, name: 'c.mp4' }, { path: song, name: 's.mp3' }], targetFormat: 'mp4', body: {}, ffmpegPath: ffmpeg })({}, ctx());
    const info = await convert.probe(ffmpeg, v);
    assert.ok(Math.abs(info.duration - 13) < 0.3 && info.hasVideo && info.hasAudio, JSON.stringify(info));
    assert.deepEqual([info.width, info.height], [1280, 720], 'size of the first clip');
    const songInfo = await convert.probe(ffmpeg, song);
    assert.ok(songInfo.hasCover && !songInfo.hasVideo, 'a cover is not a video');
    const a = await convert.runMerge({ inputs: [{ path: song, name: 's.mp3' }, { path: song, name: 's.mp3' }], targetFormat: 'flac', body: {}, ffmpegPath: ffmpeg })({}, ctx());
    const ainfo = await convert.probe(ffmpeg, a);
    assert.ok(Math.abs(ainfo.duration - 6) < 0.3 && !ainfo.hasVideo);
  });
});

test('uploads posing as media cannot make ffmpeg read other files or URLs', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async (t) => {
  const secret = path.join(work, 'secret.txt');
  fs.writeFileSync(secret, 'SECRET-TOKEN-12345\n');
  const s = secret.split(path.sep).join('/');
  const payloads = {
    'hls.mp4': `#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nfile:///${s}\n#EXT-X-ENDLIST\n`,
    'concat.mp4': `ffconcat version 1.0\nfile 'file:${s}'\n`,
    'hls-net.mp4': '#EXTM3U\n#EXTINF:10.0,\nhttps://example.com/x.ts\n#EXT-X-ENDLIST\n',
    'subfile.mp4': `#EXTM3U\n#EXTINF:1,\nsubfile,,start,0,end,0,,:${s}\n#EXT-X-ENDLIST\n`,
    'ffmetadata.mp3': `;FFMETADATA1\ntitle=x\n[CHAPTER]\nTIMEBASE=1/1\nSTART=0\nEND=1\n`,
  };
  for (const [name, content] of Object.entries(payloads)) {
    await t.test(name, async () => {
      const input = path.join(work, name);
      fs.writeFileSync(input, content);
      let leaked = false;
      try {
        const { file } = await run(input, 'wav');
        leaked = fs.readFileSync(file).includes('SECRET-TOKEN');
      } catch { /* rejected: good */ }
      assert.equal(leaked, false);
    });
  }
});

test('parseSegments sorts, joins and refuses nonsense', () => {
  assert.deepEqual(convert.parseSegments('[[30,41],[0,12.5],[12,14]]'), [[0, 14], [30, 41]]);
  for (const bad of ['', '[]', '{}', '[[1]]', '[[5,2]]', '[[-1,3]]', '[["0","3"]]', '[[0,1e9]]', '[[0,0.01]]', 'x',
    JSON.stringify(Array.from({ length: 201 }, (_, i) => [i, i + 0.5]))]) {
    assert.equal(convert.parseSegments(bad), null, bad);
  }
});

test('originalFormat keeps the container, audio-only videos become M4A', () => {
  assert.equal(convert.originalFormat('a.MKV', true), 'mkv');
  assert.equal(convert.originalFormat('song.mp4', false), 'm4a');
  assert.equal(convert.originalFormat('x.flac', false), 'flac');
  assert.equal(convert.originalFormat('x.3gp', true), 'mp4');
});

test('editor keeps only the chosen parts', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async (t) => {
  const clip = path.join(work, 'edit-src.mp4');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=10',
    '-f', 'lavfi', '-i', 'sine=frequency=500:duration=10', '-shortest', '-c:v', 'libx264', '-g', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);
  const ctx = () => ({ dir: fs.mkdtempSync(path.join(work, 'e-')), update() {}, setProcess() {}, isCanceled: () => false });
  const edit = (opts) => convert.runEdit({ inputPath: clip, originalName: 'mi clip.mp4', body: {}, ffmpegPath: ffmpeg, ...opts })({}, ctx());

  await t.test('exact: two parts joined, same container', async () => {
    const out = await edit({ segments: [[1, 3], [6, 7.5]], targetFormat: 'original', mode: 'exact' });
    assert.equal(path.basename(out), 'mi clip (editado).mp4');
    const info = await convert.probe(ffmpeg, out);
    assert.ok(Math.abs(info.duration - 3.5) < 0.15 && info.hasVideo && info.hasAudio, JSON.stringify(info));
  });
  await t.test('exact: to another format, audio only', async () => {
    const out = await edit({ segments: [[0, 2]], targetFormat: 'mp3', mode: 'exact' });
    const info = await convert.probe(ffmpeg, out);
    assert.ok(out.endsWith('.mp3') && !info.hasVideo && Math.abs(info.duration - 2) < 0.15, JSON.stringify(info));
  });
  await t.test('fast: stream copy of several parts', async () => {
    const out = await edit({ segments: [[0, 2], [5, 8]], targetFormat: 'original', mode: 'fast' });
    const info = await convert.probe(ffmpeg, out);
    assert.ok(Math.abs(info.duration - 5) < 0.6 && info.hasVideo && info.hasAudio, JSON.stringify(info));
    assert.deepEqual(fs.readdirSync(path.dirname(out)), [path.basename(out)], 'parts cleaned up');
  });
  await t.test('parts past the end are dropped; nothing left is an error', async () => {
    await assert.rejects(edit({ segments: [[20, 30]], targetFormat: 'original', mode: 'exact' }), /vacío/);
  });
});

test('editor adjustments: only fixed values, and they need exact cuts', () => {
  const fx = convert.parseEditEffects({ fade: '1', volume: 'mute', aspect: '9:16', rotate: '90', separate: 'true' });
  assert.deepEqual(fx, { fade: 1, volume: 0, aspect: '9:16', rotate: '90', separate: true });
  const evil = convert.parseEditEffects({ fade: '1;x', volume: '99', aspect: '__proto__', rotate: 'toString', separate: 'yes' });
  assert.deepEqual(evil, { fade: 0, volume: null, aspect: null, rotate: null, separate: false });
  assert.equal(convert.needsEncoding(evil), false);
  assert.equal(convert.needsEncoding({ ...evil, separate: true }), false, 'separate files work with fast cuts');
  assert.equal(convert.needsEncoding(fx), true);
});

test('editor: vertical crop with fades, mute, and one file per clip', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async (t) => {
  const clip = path.join(work, 'edit-fx.mp4');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=500:duration=8', '-shortest', '-c:v', 'libx264', '-g', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);
  const ctx = () => ({ dir: fs.mkdtempSync(path.join(work, 'fx-')), update() {}, setProcess() {}, isCanceled: () => false });
  const edit = (opts) => convert.runEdit({ inputPath: clip, originalName: 'fx.mp4', ffmpegPath: ffmpeg, targetFormat: 'original', mode: 'exact', ...opts })({}, ctx());

  await t.test('9:16 + fades + no sound', async () => {
    const out = await edit({ segments: [[0, 3], [5, 7]], body: { aspect: '9:16', fade: '0.5', volume: 'mute' } });
    const info = await convert.probe(ffmpeg, out);
    assert.ok(info.hasVideo && !info.hasAudio && Math.abs(info.duration - 5) < 0.15, JSON.stringify(info));
    assert.ok(info.width < info.height && Math.abs(info.width / info.height - 9 / 16) < 0.02, `${info.width}x${info.height}`);
  });
  await t.test('square + rotated + louder', async () => {
    const out = await edit({ segments: [[1, 2]], body: { aspect: '1:1', rotate: '90', volume: '2' } });
    const info = await convert.probe(ffmpeg, out);
    assert.equal(info.width, info.height);
    assert.ok(info.hasAudio);
  });
  for (const mode of ['exact', 'fast']) {
    await t.test(`separate files (${mode})`, async () => {
      const outs = await edit({ segments: [[0, 2], [4, 6], [6.5, 8]], mode, body: { separate: 'true' } });
      assert.deepEqual(outs.map((f) => path.basename(f)), ['fx (tramo 1).mp4', 'fx (tramo 2).mp4', 'fx (tramo 3).mp4']);
      assert.deepEqual(fs.readdirSync(path.dirname(outs[0])).sort(), outs.map((f) => path.basename(f)).sort(), 'no leftovers');
    });
  }
});
