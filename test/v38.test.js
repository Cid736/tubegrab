// v3.8: the lyrics' translation (lib/translate.js), with a fake translator.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Translator, cleanLines, MAX_LINES } = require('../lib/translate');

/** A fake Google endpoint: "translates" by upper-casing, line breaks kept (or not). */
function fake({ keepBreaks = true, from = 'en' } = {}) {
  const seen = [];
  const fetchText = async (url) => {
    const u = new URL(url);
    seen.push(u);
    const q = u.searchParams.get('q');
    const segs = keepBreaks ? q.split('\n').map((l, i, all) => [`${l.toUpperCase()}${i < all.length - 1 ? '\n' : ''}`, l]) : [[q.replace(/\n/g, ' ').toUpperCase(), q]];
    return JSON.stringify([segs, null, from]);
  };
  return { seen, fetchText };
}

test('translate: only short lists of short strings', () => {
  assert.deepEqual(cleanLines(['  hola\u0000 ', '', 'x']), ['hola', '', 'x']);
  for (const bad of [null, 'hola', [], [5], ['x'.repeat(301)], Array(MAX_LINES + 1).fill('a'), Array(100).fill('a'.repeat(200))]) assert.equal(cleanLines(bad), null, JSON.stringify(bad).slice(0, 40));
});

test('translate: each different line once, back in order, empty lines kept, remembered on disk', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-tr-'));
  const file = path.join(dir, 'tr.json');
  try {
    const f = fake();
    const tr = new Translator({ file, fetchText: f.fetchText });
    const lines = ['never gonna', '', 'give you up', 'never gonna', '♪', 'give you up'];
    const r = await tr.translate(lines, 'es');
    assert.deepEqual(r, { lines: ['NEVER GONNA', '', 'GIVE YOU UP', 'NEVER GONNA', '', 'GIVE YOU UP'], from: 'en' });
    assert.equal(f.seen.length, 1);
    assert.equal(f.seen[0].hostname, 'translate.googleapis.com');
    assert.equal(f.seen[0].searchParams.get('tl'), 'es');
    assert.equal(f.seen[0].searchParams.get('q'), 'never gonna\ngive you up', 'the chorus and the music note go once / not at all');
    // Next run: from the file, no request.
    const again = new Translator({ file, fetchText: () => { throw new Error('should not ask'); } });
    assert.deepEqual(await again.translate(lines, 'es'), r);
    await assert.rejects(tr.translate(lines, 'xx'), /Idioma/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('translate: long lyrics go in chunks; lost line breaks → one line at a time', async () => {
  const f = fake();
  const many = Array.from({ length: 120 }, (_, i) => `line number ${i} of a long song`);
  const r = await new Translator({ fetchText: f.fetchText }).translate(many, 'es');
  assert.ok(f.seen.length >= 3, `${f.seen.length} requests`);
  assert.ok(f.seen.every((u) => u.searchParams.get('q').length <= 1500));
  assert.equal(r.lines[119], 'LINE NUMBER 119 OF A LONG SONG');
  const g = fake({ keepBreaks: false });
  const r2 = await new Translator({ fetchText: g.fetchText }).translate(['one', 'two', 'three'], 'es');
  assert.deepEqual(r2.lines, ['ONE', 'TWO', 'THREE']);
  assert.equal(g.seen.length, 4, 'one try together, then one each');
});

test('translate: a broken answer is an error, not garbage', async () => {
  await assert.rejects(new Translator({ fetchText: async () => '<html>nope' }).translate(['hello'], 'es'), /no se entiende/);
  await assert.rejects(new Translator({ fetchText: async () => '{"a":1}' }).translate(['hello'], 'es'), /no se entiende/);
  const ctrl = await new Translator({ fetchText: async () => JSON.stringify([[['ho\u001bla\u0000', 'x']]]) }).translate(['hello'], 'es');
  assert.deepEqual(ctrl.lines, ['ho la']);
});
