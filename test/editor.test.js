// Editor (v2.9): speed per part, titles, logo, noise reduction, GIF and
// stickers — and that nothing the user types or uploads becomes ffmpeg syntax.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const convert = require('../lib/convert');
const { ffmpegPath } = require('./helpers');

const ffmpeg = ffmpegPath();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-editor-test-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

test('parseSegments: speeds from the list only; joins only equal speeds', () => {
  assert.deepEqual(convert.parseSegments('[[0,2],[2,4,2],[4,5,2]]'), [[0, 2, 1], [2, 5, 2]]);
  for (const bad of ['[[0,2,3]]', '[[0,2,0]]', '[[0,2,-1]]', '[[0,2,"2"]]', '[[0,4,1],[2,6,2]]', '[[0,2,1,9]]']) {
    assert.equal(convert.parseSegments(bad), null, bad);
  }
});

test('parseTexts: up to 5 short texts, fixed positions and sizes, control characters removed', () => {
  assert.deepEqual(convert.parseTexts(''), []);
  const ok = JSON.stringify([{ text: ` Hola${String.fromCharCode(7)}\tmundo `, pos: 'top', size: 'l', from: 1, to: 3 }]);
  assert.deepEqual(convert.parseTexts(ok), [{ text: 'Holamundo', pos: 'top', size: 'l', from: 1, to: 3, anim: 'none' }]);
  assert.deepEqual(convert.parseTexts(JSON.stringify([{ text: '   ', pos: 'top', size: 'l' }])), [], 'empty texts are dropped');
  const t = (o) => JSON.stringify([{ text: 'x', pos: 'bottom', size: 'm', ...o }]);
  for (const bad of ['x', '{}', '[1]', '[[]]', t({ pos: 'left' }), t({ size: 'xl' }), t({ size: '__proto__' }), t({ from: -1 }), t({ from: 5, to: 5 }),
    t({ to: '3' }), t({ anim: 'spin' }), t({ anim: 'constructor' }), t({ text: 'a'.repeat(201) }), t({ text: 'a\nb\nc\nd' }), JSON.stringify(Array(6).fill({ text: 'x', pos: 'top', size: 's' }))]) {
    assert.equal(convert.parseTexts(bad), null, bad);
  }
});

test('resultRanges: a source range follows cuts and speed', () => {
  assert.deepEqual(convert.resultRanges([[0, 2, 1], [4, 8, 2]], 1, 6), [[1, 2], [2, 3]]);
  assert.deepEqual(convert.resultRanges([[10, 20, 1]], 0, 5), [], 'outside what is kept');
  assert.deepEqual(convert.resultRanges([[10, 20, 0.5]], null, null), [[0, 20]]);
});

test('what the user types never becomes filter syntax', () => {
  const hostile = "50% %{pts} %{eif:1:d} ' : \\ , ; [x] drawtext=textfile=/etc/passwd:enable='1'";
  const fx = convert.parseEditEffects({
    texts: JSON.stringify([{ text: hostile, pos: 'center', size: 'm', from: 0, to: 2 }]), logoPos: 'tr', logoSize: 'x', logoOpacity: '9',
  });
  assert.equal(fx.texts[0].text, hostile);
  assert.deepEqual(fx.logo, { pos: 'tr', size: 0.16, opacity: 1 }, 'unknown size/opacity fall back');
  const a = convert.editArgs({
    inputPath: 'in.mp4', segs: [[0, 4, 1]], withVideo: true, withAudio: true, config: convert.formatFor('mp4').config,
    body: {}, fx, out: 'out.mp4', size: { w: 1280, h: 720 }, logoPath: 'logo.png',
  });
  const graph = a.graph.join(';');
  assert.ok(!graph.includes('%{') && !graph.includes('passwd') && !graph.includes('50%'), graph);
  assert.match(graph, /drawtext=fontfile=font\.ttf:textfile=text0\.txt:expansion=none/);
  assert.match(a.head.join(' '), /-format_whitelist png_pipe,jpeg_pipe,webp_pipe -i logo\.png/);
  assert.equal(convert.needsEncoding(convert.parseEditEffects({}), [[0, 1, 2]]), true, 'speed needs exact cuts');
  for (const bad of [{ logoPos: 'center' }, { denoise: 'max' }, { denoise: '__proto__' }]) {
    const f = convert.parseEditEffects(bad);
    assert.equal(f.logo, null);
    assert.equal(f.denoise, null);
  }
});

test('with real ffmpeg', { skip: !ffmpeg && 'ffmpeg not found', timeout: 300_000 }, async (t) => {
  const clip = path.join(work, 'v29.mp4');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-shortest', '-c:v', 'libx264', '-g', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);
  const logo = path.join(work, 'logo.png');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=200x100:d=1', '-frames:v', '1', logo]);
  const ctx = () => ({ dir: fs.mkdtempSync(path.join(work, 'out-')), update() {}, setProcess() {}, isCanceled: () => false });
  const edit = (opts) => convert.runEdit({
    inputPath: clip, originalName: 'v29.mp4', ffmpegPath: ffmpeg, targetFormat: 'original', mode: 'exact', body: {}, ...opts,
  })({}, ctx());
  const frameAt = (file, sec) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(sec), '-i', file,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  // Mean difference per channel (0–255): re-encoding alone leaves ~1.
  const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };

  await t.test('speed: 2× halves, 0.25× quadruples (with sound)', async () => {
    const fast = await convert.probe(ffmpeg, await edit({ segments: [[0, 4, 2]] }));
    assert.ok(Math.abs(fast.duration - 2) < 0.15 && fast.hasAudio, JSON.stringify(fast));
    const slow = await convert.probe(ffmpeg, await edit({ segments: [[0, 1, 0.25]] }));
    assert.ok(Math.abs(slow.duration - 4) < 0.2 && slow.hasAudio, JSON.stringify(slow));
    const mixed = await convert.probe(ffmpeg, await edit({ segments: [[0, 2, 1], [4, 6, 0.5]] }));
    assert.ok(Math.abs(mixed.duration - 6) < 0.2, JSON.stringify(mixed));
  });
  await t.test('title with hostile characters is drawn, and only while asked', async () => {
    const hostile = "50% %{pts} ' : \\ , ; [x]\nsegunda línea ñ";
    const texts = JSON.stringify([{ text: hostile, pos: 'center', size: 'l', from: 1, to: 3 }]);
    const plain = await edit({ segments: [[0, 6]] });
    const titled = await edit({ segments: [[0, 6]], body: { texts } });
    const during = diff(frameAt(titled, 2), frameAt(plain, 2));
    const after = diff(frameAt(titled, 4.5), frameAt(plain, 4.5));
    assert.ok(during > 3, `text visible at 2 s (difference ${during.toFixed(2)})`);
    assert.ok(after < 1.5, `gone after 3 s (difference ${after.toFixed(2)})`);
    assert.deepEqual(fs.readdirSync(path.dirname(titled)), [path.basename(titled)], 'font, text and graph files removed');
  });
  await t.test('logo in a corner, only there', async () => {
    const plain = await edit({ segments: [[0, 2]] });
    const withLogo = await edit({ segments: [[0, 2]], body: { logoPos: 'br', logoSize: 'l', logoOpacity: '1' }, logoPath: logo });
    const a = frameAt(plain, 1);
    const b = frameAt(withLogo, 1);
    const px = (buf, x, y) => [...buf.subarray((y * 640 + x) * 3, (y * 640 + x) * 3 + 3)];
    assert.deepEqual(px(b, 640 - 40, 360 - 30).map((v) => v > 180), [true, false, false], 'bottom-right is red');
    assert.ok(px(b, 20, 20).every((v, i) => Math.abs(v - px(a, 20, 20)[i]) < 12), 'top-left untouched');
  });
  await t.test('noise reduction runs', async () => {
    const info = await convert.probe(ffmpeg, await edit({ segments: [[0, 3]], body: { denoise: 'strong' } }));
    assert.ok(info.hasAudio && Math.abs(info.duration - 3) < 0.15);
  });
  await t.test('GIF, WhatsApp sticker and Telegram sticker', async () => {
    const gif = await edit({ segments: [[0, 2]], targetFormat: 'gif', body: { texts: JSON.stringify([{ text: 'GIF', pos: 'top', size: 's' }]) } });
    assert.ok(gif.endsWith('(editado).gif'));
    const g = await convert.probe(ffmpeg, gif);
    assert.ok(g.hasVideo && !g.hasAudio && g.width <= 480, JSON.stringify(g));
    const webp = await edit({ segments: [[0, 2]], targetFormat: 'sticker' });
    assert.ok(webp.endsWith('(sticker).webp') && fs.statSync(webp).size > 1000);
    const head = fs.readFileSync(webp).subarray(0, 64).toString('latin1');
    assert.equal(head.slice(8, 12), 'WEBP');
    assert.match(head, /VP8X/, 'extended (animated) WebP');
    const tg = await convert.probe(ffmpeg, await edit({ segments: [[0, 6]], targetFormat: 'tgsticker' }));
    assert.ok(Math.max(tg.width, tg.height) === 512 && !tg.hasAudio && tg.duration <= 3.1, JSON.stringify(tg));
  });
});
