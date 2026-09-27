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
