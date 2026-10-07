// What CodeQL found in its first scan of TubeGrab (2026-10-07), fixed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileAtomic } = require('../lib/atomic');
const { NOISE_ONLY } = require('../lib/download');
const { srtToVtt } = require('../lib/library');
const { parseApple } = require('../lib/importlist');
const { SeenIndex } = require('../lib/seen');

test('"official audio" words: the same answers, and no runaway matching on long repeated text', () => {
  for (const ok of ['official audio', 'remastered 2011', 'hq', 'audio oficial', 'official ']) assert.ok(NOISE_ONLY.test(ok), ok);
  for (const no of ['live', 'piano version 2', 'official video', 'remix']) assert.ok(!NOISE_ONLY.test(no), no);
  const evil = `${'of'.repeat(5000)}!`;
  const t0 = Date.now();
  assert.equal(NOISE_ONLY.test(evil), false);
  assert.ok(Date.now() - t0 < 200, 'answers at once');
});

test('subtitles: tags other than <b>, <i>, <u> gone even when nested; a stray "<" stays text', () => {
  const vtt = srtToVtt('1\n00:00:01,000 --> 00:00:02,000\n<<b>script>alert(1)<</b>/script> <i>ok</i> 1 < 2\n');
  assert.ok(!/<script/i.test(vtt), vtt);
  assert.ok(!/<\/script/i.test(vtt), vtt);
  assert.ok(vtt.includes('<i>ok</i>'));
  assert.ok(vtt.includes('1 &lt; 2'));
  assert.ok(vtt.startsWith('WEBVTT'));
});

test('Apple Music titles: entities decoded once', () => {
  assert.equal(parseApple('<meta property="og:title" content="A &amp;quot;B&amp;quot; &amp; C on Apple Music">').title, 'A &quot;B&quot; & C');
});

test('"already downloaded?": "__proto__" is just a link, never the answer\'s prototype', () => {
  const seen = new SeenIndex();
  const client = 'a'.repeat(32);
  const out = seen.check(client, ['__proto__', 'constructor', 'https://youtu.be/dQw4w9WgXcQ']);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.deepEqual(Object.keys(out), []);
});

test('saving: a fresh random temporary file, created exclusively, nothing left behind', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-atomic-'));
  try {
    const file = path.join(dir, 'remote.json');
    fs.writeFileSync(`${file}.tmp`, 'planted');
    writeFileAtomic(file, '{"ok":true}');
    assert.equal(fs.readFileSync(file, 'utf8'), '{"ok":true}');
    assert.deepEqual(fs.readdirSync(dir).sort(), ['remote.json', 'remote.json.tmp']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
