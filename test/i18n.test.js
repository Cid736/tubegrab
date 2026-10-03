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

// Every visible piece of Spanish in these parts of the page has an English version.
const SECTIONS = ['id="editSection"', 'id="subsTranscribe"', 'id="statsSection"', 'data-views="set-convert"', ['id="askModal"', '<div class="modal hidden" id="keysModal"'], 'id="tagsSection"', 'id="queueSection"', 'data-views="set-downloads"', 'id="mainCard"',
  'id="librarySection"', 'data-views="set-system"', 'id="settingsSection"', 'data-views="set-about"', ['class="view hidden settings-search"', '</section>'], ['id="keysModal"', '<div class="modal hidden" id="tourModal"'], ['id="player"', '<!-- '], ['id="shareModal"', '<div class="modal hidden" id="tourModal"'], ['id="tourModal"', '<script']];
test('the editor, tags, queue, download settings and download form are fully translated', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const known = new Set(keys);
  const same = new Set(['MP4', 'MKV', 'MOV', 'WEBM', 'MP3', 'M4A', 'V1', 'A1', 'Original', 'Logo', 'Editor', 'SponsorBlock', 'cookies.txt',
    '4:5 (Instagram)', '9:16 vertical (TikTok, Reels, Shorts)', '1', '2', '3', '4', '5', '6', 'M4A (AAC)', 'OPUS', 'OGG', '48 kHz', '44,1 kHz', 'English', 'Mac', 'Windows', 'TubeGrab', 'GitHub', 'https://ntfy.sh', 'Ctrl', 'Esc', 'Supr', '?', '{artist} - {title}',
    'BPM', '9:16', '1:1', '4:5', '16:9', 'tubegrab "https://youtu.be/…" --mp3', 'tubegrab "https://youtu.be/…" --video=1080 --out=D:\\Vídeos']);
  const missing = [];
  for (const entry of SECTIONS) {
    const [marker, end] = Array.isArray(entry) ? entry : [entry, '</section>'];
    const a = html.indexOf(marker);
    assert.ok(a > 0, marker);
    const section = html.slice(a, html.indexOf(end, a + marker.length));
    const texts = new Set();
    for (const m of section.matchAll(/>([^<>]+)</g)) {
      const text = m[1].trim();
      if (/[a-záéíóúñ]{3}/i.test(text)) texts.add(text);
    }
    for (const m of section.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)) if (/[a-z]{3}/i.test(m[1])) texts.add(m[1]);
    for (const x of texts) if (!known.has(x) && !same.has(x) && !/^[\d\s.,:/()%KMB-]+$/.test(x) && !/kbps|KB\/s|MB\/s/.test(x)) missing.push(`${marker}: ${x}`);
  }
  assert.deepEqual(missing, []);
});
