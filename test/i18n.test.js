// The English table: no key defined twice (the later one silently wins), and
// every piece of Spanish the editor's panel shows has an English version.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'public', 'i18n.js'), 'utf8');
const start = src.indexOf('var EN = {');
const body = src.slice(start, src.indexOf('\n  };', start));
const keys = [...body.matchAll(/(?:^|[{,])\s*'((?:[^'\\]|\\.)*)'\s*:/gm)].map((m) => m[1].replace(/\\'/g, "'"));

test('no duplicated keys in the English table', () => {
  const seen = new Map();
  for (const k of keys) seen.set(k, (seen.get(k) || 0) + 1);
  assert.deepEqual([...seen].filter(([, n]) => n > 1).map(([k]) => k), []);
  assert.ok(keys.length > 300, `${keys.length} keys`);
});

test('the editor panel is fully translated', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const a = html.indexOf('id="editSection"');
  const section = html.slice(a, html.indexOf('</section>', a));
  const texts = new Set();
  for (const m of section.matchAll(/>([^<>]+)</g)) {
    const text = m[1].trim();
    if (/[a-záéíóúñ]{3}/i.test(text) && !/^[\d:.\s/]+$/.test(text)) texts.add(text);
  }
  for (const m of section.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)) if (/[a-z]{3}/i.test(m[1])) texts.add(m[1]);
  const known = new Set(keys);
  const same = new Set(['MP4', 'MKV', 'MOV', 'WEBM', 'V1', 'A1', 'Original', 'Logo', 'Editor', '4:5 (Instagram)', '9:16 vertical (TikTok, Reels, Shorts)']);
  const missing = [...texts].filter((x) => !known.has(x) && !same.has(x));
  assert.deepEqual(missing, []);
});
