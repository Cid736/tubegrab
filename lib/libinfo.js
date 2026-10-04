// "Revisar la biblioteca" (desktop app): what each song really is — its
// quality, its tags, whether it has a cover and lyrics, where it came from —
// read once with ffmpeg (in the background, one file at a time) and kept
// (library-info.json) until the file changes. Only for the review: nothing
// here is ever written into the files.
const fs = require('fs');
const { spawn } = require('child_process');

const MAX = 20000;
const clean = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Below this, a lossy song is "low quality" (kb/s).
const LOW = { mp3: 128, aac: 112, opus: 80, vorbis: 96 };
const COVER_EXT = new Set(['mp3', 'm4a', 'flac', 'mp4', 'm4b']);

/** ffmpeg -i … -f ffmetadata - : stdout has the tags, stderr the streams. */
function parseInfo(stdout, stderr) {
  const tags = {};
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_ ]{1,40})=(.*)$/.exec(line);
    if (m && !(m[1].toLowerCase() in tags)) tags[m[1].toLowerCase()] = m[2];
  }
  const err = String(stderr || '');
  const d = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)[^\n]*?bitrate: (\d+) kb\/s/.exec(err) || /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(err);
  const audio = /Stream #\d+:\d+[^\n]*?: Audio: (\w+)[^\n]*?(\d+) Hz(?:[^\n]*?, (\d+) kb\/s)?/.exec(err);
  const stream = audio && audio[3] ? Number(audio[3]) : null;
  const total = d && d[4] ? Number(d[4]) : null;
  const url = [tags.purl, tags.comment, tags.description, tags.synopsis].map((v) => clean(v, 500)).find((v) => /^https:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be|soundcloud\.com)\//.test(v)) || null;
  return {
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
    codec: audio ? audio[1].toLowerCase() : null,
    rate: audio ? Number(audio[2]) : null,
    // The audio stream's own rate when known (a cover inflates the total).
    bitrate: stream || total,
    cover: /Stream #\d+:\d+[^\n]*: Video: [^\n]*\(attached pic\)/.test(err) || /Stream #\d+:\d+[^\n]*: Video: (mjpeg|png)/.test(err),
    title: clean(tags.title, 300), artist: clean(tags.artist, 200), album: clean(tags.album, 200), albumArtist: clean(tags.album_artist || tags['album artist'] || tags.albumartist, 200),
    track: clean(tags.track, 10), lyrics: Boolean(clean(tags.lyrics || tags['unsyncedlyrics'] || tags['lyrics-eng'] || '', 10)),
    source: url,
  };
}

/** What's wrong with a song, from its info: low quality, no artist or title, no cover, no lyrics. */
function issuesOf(info, file) {
  const out = [];
  if (!info) return out;
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  const codecKey = info.codec === 'mp3' || info.codec === 'mp3float' ? 'mp3' : info.codec === 'aac' ? 'aac' : info.codec === 'opus' ? 'opus' : info.codec === 'vorbis' ? 'vorbis' : null;
  if (codecKey && info.bitrate && info.bitrate < LOW[codecKey]) out.push('quality');
  if (!info.artist || !info.title) out.push('tags');
  if (!info.cover && COVER_EXT.has(ext)) out.push('cover');
  if (!info.lyrics && !file.lrc) out.push('lyrics');
  return out;
}

function inspect(ffmpegPath, file, safeInput) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let p;
    try { p = spawn(ffmpegPath, ['-hide_banner', ...safeInput, '-i', file, '-f', 'ffmetadata', '-'], { windowsHide: true }); } catch { resolve(null); return; }
    const timer = setTimeout(() => p.kill(), 20000);
    p.stdout.on('data', (c) => { out = (out + c.toString('utf8')).slice(0, 200000); });
    p.stderr.on('data', (c) => { err = (err + c.toString('utf8')).slice(-100000); });
    p.on('error', () => { clearTimeout(timer); resolve(null); });
    p.on('close', () => { clearTimeout(timer); resolve(/Duration:/.test(err) ? parseInfo(out, err) : null); });
  });
}

class LibInfo {
  constructor(file, { ffmpegPath, safeInput, inspectFn = inspect } = {}) {
    this.file = file;
    this.ffmpegPath = ffmpegPath; // a function: the ffmpeg in use now
    this.safeInput = safeInput;
    this.inspectFn = inspectFn;
    this.cache = new Map(); // rel (lowercase) -> { sig, info }
    this.running = null;
    this.progress = { done: 0, total: 0 };
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [k, v] of Object.entries(raw || {}).slice(0, MAX)) if (v && typeof v.sig === 'string' && v.info && typeof v.info === 'object') this.cache.set(k, v);
    } catch { /* none yet */ }
  }

  save() {
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.cache)));
      fs.renameSync(tmp, this.file);
    } catch { /* not fatal */ }
  }

  static sig(f) { return `${f.size}|${Math.round(f.mtime)}`; }

  get(f) {
    const hit = this.cache.get(String(f.rel).toLowerCase());
    return hit && hit.sig === LibInfo.sig(f) ? hit.info : null;
  }

  /**
   * Reads the songs not read yet (or changed since), one at a time. `files`:
   * [{ rel, full, size, mtime, kind }]. Returns at once; `progress` tells how far.
   */
  refresh(files) {
    if (this.running) return this.running;
    const todo = files.filter((f) => f.kind === 'audio' && !this.get(f)).slice(0, MAX);
    this.progress = { done: 0, total: todo.length };
    // Forget songs no longer there.
    const live = new Set(files.map((f) => String(f.rel).toLowerCase()));
    let gone = 0;
    for (const k of [...this.cache.keys()]) if (!live.has(k)) { this.cache.delete(k); gone++; }
    if (!todo.length) { if (gone) this.save(); return Promise.resolve(); }
    this.running = (async () => {
      let since = 0;
      for (const f of todo) {
        const info = await this.inspectFn(this.ffmpegPath(), f.full, this.safeInput).catch(() => null);
        if (info) this.cache.set(String(f.rel).toLowerCase(), { sig: LibInfo.sig(f), info });
        this.progress.done++;
        if (++since >= 40) { since = 0; this.save(); }
      }
      this.save();
    })().finally(() => { this.running = null; });
    return this.running;
  }

  /** Re-read one song now (after it was fixed). */
  forget(rel) { this.cache.delete(String(rel).toLowerCase()); }
}

module.exports = { LibInfo, parseInfo, issuesOf, inspect, LOW };
