// Lyrics translated line by line (the player's "Traducir"), with Google
// Translate's free web endpoint. Only the words of the song go out (no file
// names, nothing about the user); repeated lines (choruses) are sent once,
// and every answer is kept on disk so a song is translated only once.
const crypto = require('crypto');
const fs = require('fs');
const netfetch = require('./netfetch');

const LANGS = ['es', 'en', 'fr', 'de', 'it', 'pt', 'ca'];
const MAX_LINES = 250;
const MAX_LINE = 300;
const MAX_TOTAL = 15000;
const CHUNK = 1500;          // characters per request (they go in the address)
const MAX_CACHE = 300;
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

const cleanLine = (v, max = MAX_LINE) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** The lines the page sent, checked: an array of short strings. Null when it isn't. */
function cleanLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES) return null;
  if (!lines.every((l) => typeof l === 'string' && l.length <= MAX_LINE)) return null;
  const out = lines.map((l) => cleanLine(l));
  return out.reduce((a, l) => a + l.length, 0) <= MAX_TOTAL ? out : null;
}

/** One request: a few lines joined by line breaks → the same number of lines back, or null. */
async function askOnce(lines, to, fetchText) {
  const url = `${ENDPOINT}?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(lines.join('\n'))}`;
  const body = await fetchText(url, { timeoutMs: 15000, maxBytes: 1024 * 1024 });
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('El traductor respondió algo que no se entiende.'); }
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('El traductor respondió algo que no se entiende.');
  const text = data[0].map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('');
  const back = text.split('\n').map((l) => cleanLine(l, MAX_LINE * 2));
  return { lines: back.length === lines.length ? back : null, from: typeof data[2] === 'string' ? data[2].slice(0, 10) : null };
}

class Translator {
  constructor({ file = null, fetchText = netfetch.text } = {}) {
    this.file = file;
    this.fetchText = fetchText;
    this.cache = new Map();
    if (file) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const [k, v] of Object.entries(raw).slice(-MAX_CACHE)) {
          if (/^[a-f0-9]{40}$/.test(k) && v && Array.isArray(v.lines) && v.lines.every((l) => typeof l === 'string')) this.cache.set(k, { lines: v.lines.map((l) => cleanLine(l, MAX_LINE * 2)), from: typeof v.from === 'string' ? v.from.slice(0, 10) : null });
        }
      } catch { /* none yet */ }
    }
  }

  save() {
    if (!this.file) return;
    while (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value);
    try { fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.cache))); } catch { /* not fatal */ }
  }

  /** lines (already cleaned) → { lines, from } with one translation per line ('' for empty ones). */
  async translate(lines, to) {
    if (!LANGS.includes(to)) throw new Error('Idioma no válido.');
    const key = crypto.createHash('sha1').update(`${to}\n${lines.join('\n')}`).digest('hex');
    if (this.cache.has(key)) return this.cache.get(key);
    // Each different line once (a chorus is sung many times).
    const unique = [...new Set(lines.filter((l) => l && /[\p{L}]/u.test(l)))];
    const done = new Map();
    let from = null;
    let chunk = [];
    let size = 0;
    const flush = async () => {
      if (!chunk.length) return;
      let r = await askOnce(chunk, to, this.fetchText);
      from = from || r.from;
      // The line breaks didn't survive: one line at a time (a short chunk only).
      if (!r.lines) {
        const one = [];
        for (const l of chunk.slice(0, 40)) { r = await askOnce([l], to, this.fetchText); one.push(r.lines ? r.lines[0] : ''); }
        r = { lines: chunk.map((_, i) => one[i] || '') };
      }
      chunk.forEach((l, i) => done.set(l, r.lines[i] || ''));
      chunk = [];
      size = 0;
    };
    for (const l of unique) {
      if (size + l.length + 1 > CHUNK) await flush();
      chunk.push(l);
      size += l.length + 1;
    }
    await flush();
    const result = { lines: lines.map((l) => done.get(l) || ''), from };
    this.cache.set(key, result);
    this.save();
    return result;
  }
}

module.exports = { Translator, cleanLines, LANGS, MAX_LINES };
