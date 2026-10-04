// Song tags from MusicBrainz: the song is recognised by its sound (an
// AcoustID fingerprint, with the user's own free AcoustID key and the fpcalc
// tool) or, without them, looked up by the title and artist it already has.
// Gives back artist, title, album, year, track number and the release, whose
// cover comes from the Cover Art Archive.
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const netfetch = require('./netfetch');

const MB = 'https://musicbrainz.org/ws/2';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_RE = /^[A-Za-z0-9]{6,40}$/;
const clean = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

// MusicBrainz asks for at most one request a second from each app. A few
// dozen waiting at most: past that, "busy" rather than an endless backlog.
let queue = Promise.resolve();
let waiting = 0;
const MAX_WAITING = 40;
function politely(fn) {
  if (waiting >= MAX_WAITING) return Promise.reject(new Error('MusicBrainz está ocupado ahora mismo; inténtalo en un minuto.'));
  waiting += 1;
  const run = queue.then(fn, fn);
  const done = () => { waiting -= 1; return new Promise((r) => setTimeout(r, 1100)); };
  queue = run.then(done, done);
  return run;
}

/**
 * fpcalc → { duration, fingerprint } (the first two minutes are enough).
 * fpcalc opens files with its own FFmpeg and no limits, so it never sees the
 * upload: our ffmpeg (only real media demuxers, no network) turns the first
 * two minutes into a plain WAV next to it, and fpcalc reads that.
 */
function fingerprint(fpcalcPath, file, ffmpegPath) {
  return new Promise((resolve, reject) => {
    if (!fpcalcPath || !fs.existsSync(fpcalcPath)) { reject(new Error('Falta fpcalc.')); return; }
    if (!ffmpegPath) { reject(new Error('Falta ffmpeg.')); return; }
    const { INPUT_DEMUXERS } = require('./convert');
    const wav = path.join(path.dirname(file), `${path.basename(file)}.fp.wav`);
    const p = spawn(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS,
      '-i', file, '-map', '0:a:0', '-t', '120', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', '-f', 'wav', wav], { windowsHide: true });
    p.stderr.resume();
    p.on('error', () => reject(new Error('No se pudo escuchar la canción.')));
    p.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(wav)) { fs.rm(wav, { force: true }, () => {}); reject(new Error('No se pudo escuchar la canción.')); return; }
      execFile(fpcalcPath, ['-json', '-length', '120', wav], { windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
        fs.rm(wav, { force: true }, () => {});
        if (err) return reject(new Error('No se pudo escuchar la canción.'));
        try {
          const d = JSON.parse(stdout);
          if (typeof d.fingerprint !== 'string' || !/^[A-Za-z0-9_-]{20,20000}$/.test(d.fingerprint) || !(d.duration > 0)) throw new Error();
          resolve({ duration: Math.round(d.duration), fingerprint: d.fingerprint });
        } catch { reject(new Error('No se pudo escuchar la canción.')); }
      });
    });
  });
}

/** One release → our fields. */
function fromRecording(rec, release, score = 0) {
  const artists = (rec['artist-credit'] || rec.artists || []).map((a) => (a && (a.name || (a.artist && a.artist.name))) || '').filter(Boolean);
  const joins = (rec['artist-credit'] || []).map((a) => (a && a.joinphrase) || '');
  const artist = (rec['artist-credit'] || []).length ? artists.map((n, i) => n + (joins[i] || '')).join('').trim() : artists.join(', ');
  const out = { title: clean(rec.title), artist: clean(artist), album: '', album_artist: '', date: '', track: '', releaseId: null, score: Math.round(score * 100) };
  if (UUID.test(String(rec.id))) Object.defineProperty(out, 'recordingId', { value: rec.id, enumerable: false });
  if (Number.isFinite(rec.length)) Object.defineProperty(out, 'length', { value: Math.round(rec.length / 1000), enumerable: false });
  if (release) {
    out.album = clean(release.title);
    const ra = (release['artist-credit'] || release.artists || []).map((a) => (a && (a.name || (a.artist && a.artist.name))) || '').filter(Boolean).join(', ');
    out.album_artist = clean(ra);
    const year = /^(\d{4})/.exec(String(release.date || (release['release-group'] && release['release-group']['first-release-date']) || ''));
    out.date = year ? year[1] : '';
    const media = (release.media || release.mediums || [])[0];
    const tr = media && (media.track || media.tracks || [])[0];
    const pos = tr && (tr.number || tr.position);
    const count = media && (media['track-count'] || media.track_count);
    if (pos && /^\d{1,3}$/.test(String(pos))) out.track = count ? `${pos}/${count}` : String(pos);
    if (UUID.test(String(release.id))) out.releaseId = release.id;
  }
  return out;
}

/** The best release for a recording: an official album first, then the earliest. */
function pickRelease(list) {
  const rs = (list || []).filter(Boolean);
  const kind = (r) => {
    const g = r['release-group'] || r.releasegroup || {};
    const type = g['primary-type'] || g.type || '';
    const sec = g['secondary-types'] || g.secondarytypes || [];
    const various = (r['artist-credit'] || []).some((a) => /^various artists$/i.test((a && (a.name || (a.artist && a.artist.name))) || ''));
    return (type === 'Album' && !sec.length ? 0 : type === 'Album' ? 1 : type === 'Single' || type === 'EP' ? 2 : 3) + (r.status && r.status !== 'Official' ? 2 : 0) + (various ? 3 : 0);
  };
  return rs.sort((a, b) => kind(a) - kind(b) || String(a.date || '9999').localeCompare(String(b.date || '9999')))[0] || null;
}

/** By fingerprint (AcoustID): the best match, or null. */
async function byFingerprint({ key, fpcalcPath, file, ffmpegPath, duration = null }) {
  if (!KEY_RE.test(String(key || ''))) return null;
  const fp = await fingerprint(fpcalcPath, file, ffmpegPath);
  // The whole song's length (the WAV only has its first two minutes).
  const secs = Math.round(duration || fp.duration);
  const body = new URLSearchParams({ client: key, format: 'json', meta: 'recordings releases releasegroups tracks', duration: String(secs), fingerprint: fp.fingerprint }).toString();
  const res = await netfetch.get('https://api.acoustid.org/v2/lookup', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } });
  const text = await new Promise((resolve, reject) => {
    let s = '';
    res.stream.on('data', (c) => { s += c; if (s.length > 4 * 1024 * 1024) res.stream.destroy(); });
    res.stream.on('end', () => resolve(s));
    res.stream.on('error', reject);
  });
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('AcoustID no respondió bien.'); }
  if (data.status !== 'ok') throw new Error(data.error && data.error.code === 4 ? 'La clave de AcoustID no es válida.' : 'AcoustID no respondió bien.');
  const best = (data.results || []).filter((r) => r && r.score > 0.5 && Array.isArray(r.recordings) && r.recordings.length).sort((a, b) => b.score - a.score)[0];
  if (!best) return null;
  const rec = best.recordings.find((r) => r.title) || best.recordings[0];
  return fromRecording(rec, pickRelease(rec.releases), best.score);
}

/** One MusicBrainz search (politely, one retry when it's busy). */
async function mbSearch(query, limit) {
  const url = `${MB}/recording?fmt=json&limit=${limit}&query=${encodeURIComponent(query)}`;
  try {
    return await politely(() => netfetch.json(url, { maxBytes: 4 * 1024 * 1024 }));
  } catch (err) {
    if (!/503/.test(err.message)) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    return politely(() => netfetch.json(url, { maxBytes: 4 * 1024 * 1024 }));
  }
}

/**
 * By name: MusicBrainz's search for "title" by "artist". Official studio
 * albums first (a famous song has dozens of live and bootleg versions), then
 * anything; the length, when known, has to be close.
 */
async function byName({ title, artist, duration = null }) {
  const t = clean(title, 200);
  if (!t) return null;
  const q = (s) => `"${s.replace(/["\\]/g, ' ')}"`;
  const parts = [`recording:${q(t)}`];
  if (artist) parts.push(`artist:${q(clean(artist, 200))}`);
  const near = (r) => !duration || !r.length || Math.abs(r.length / 1000 - duration) <= 12;
  // The very title first ("Despacito", not "Despacito (Versión Pop)"), the
  // best score, then the earliest proper release among them.
  const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const choose = (pool) => {
    const top = pool.filter((r) => r.score >= pool[0].score - 5);
    const options = top.flatMap((r) => (r.releases || []).map((rel) => ({ r, rel })));
    const best = pickRelease(options.map((o) => o.rel));
    const chosen = options.find((o) => o.rel === best) || { r: top[0], rel: null };
    return fromRecording(chosen.r, chosen.rel, (chosen.r.score || 0) / 100);
  };
  let fallback = null;
  for (const strict of [true, false]) {
    const query = strict ? [...parts, 'status:official', 'primarytype:album', 'NOT secondarytype:live', 'NOT secondarytype:compilation'].join(' AND ') : parts.join(' AND ');
    const data = await mbSearch(query, 25);
    const all = ((data && data.recordings) || []).filter((r) => r.score >= 85 && !/\blive\b/i.test(r.disambiguation || ''));
    // Of about the same length when there are such (a video clip may be cut short).
    const close = all.filter(near);
    const recs = close.length ? close : all;
    const exact = recs.filter((r) => fold(r.title) === fold(t));
    if (exact.length) return choose(exact);
    if (recs.length && !fallback) fallback = recs;
  }
  return fallback ? choose(fallback) : null;
}

/** Tags for one song: by its sound when possible, else by name. */
async function identify({ file, hints = {}, key = null, fpcalcPath = null, ffmpegPath = null }) {
  let found = null;
  let how = null;
  if (key && fpcalcPath) {
    try { found = await byFingerprint({ key, fpcalcPath, file, ffmpegPath, duration: hints.duration }); how = found ? 'sound' : null; } catch (err) { if (/clave/.test(err.message)) throw err; }
  }
  if (!found) { found = await byName(hints); how = found ? 'name' : null; }
  return found ? { ...found, how } : null;
}

/**
 * An album's songs, to see which ones are missing: the official release of
 * "album" by "artist" (an album first, the earliest), with its tracks in order.
 * → { release: { id, title, artist, date }, tracks: [{ disc, n, title, length }] } or null.
 */
async function albumTracks({ artist, album }, { fetchJson = (url) => politely(() => netfetch.json(url, { maxBytes: 4 * 1024 * 1024 })) } = {}) {
  const a = clean(artist, 200);
  const al = clean(album, 200);
  if (!a || !al) return null;
  const q = (s) => `"${s.replace(/["\\]/g, ' ')}"`;
  const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const data = await fetchJson(`${MB}/release?fmt=json&limit=15&query=${encodeURIComponent(`release:${q(al)} AND artist:${q(a)} AND status:official`)}`);
  const all = ((data && data.releases) || []).filter((r) => r && UUID.test(String(r.id)) && (r.score || 0) >= 85 && fold(r.title) === fold(al));
  if (!all.length) return null;
  const kind = (r) => (r['release-group'] && r['release-group']['primary-type']) || '';
  const pool = all.filter((r) => kind(r) === 'Album');
  const best = (pool.length ? pool : all).slice().sort((x, y) => String(x.date || '9999').localeCompare(String(y.date || '9999')))[0];
  const rel = await fetchJson(`${MB}/release/${best.id}?fmt=json&inc=recordings`);
  const tracks = [];
  for (const [d, m] of ((rel && rel.media) || []).entries()) {
    for (const tr of (m && m.tracks) || []) {
      const title = clean((tr && (tr.title || (tr.recording && tr.recording.title))) || '', 300);
      if (title) tracks.push({ disc: d + 1, n: Number(tr.position) || tracks.length + 1, title, length: Number.isFinite(tr.length) ? Math.round(tr.length / 1000) : null });
      if (tracks.length >= 200) break;
    }
  }
  if (!tracks.length) return null;
  const credit = (best['artist-credit'] || []).map((c) => (c && (c.name || (c.artist && c.artist.name))) || '').join('') || a;
  return { release: { id: best.id, title: clean(best.title, 200), artist: clean(credit, 200), date: clean(best.date, 10) }, tracks };
}

/** A recording's length in seconds (to be sure a song found by name is that very one). */
async function recordingLength(id, { fetchJson = (url) => politely(() => netfetch.json(url, { maxBytes: 1024 * 1024 })) } = {}) {
  if (!UUID.test(String(id))) return null;
  const r = await fetchJson(`${MB}/recording/${id}?fmt=json`);
  return r && Number.isFinite(r.length) ? Math.round(r.length / 1000) : null;
}

/** The front cover of a release (Cover Art Archive), up to 5 MB: { type, data } or null. */
async function coverArt(releaseId) {
  if (!UUID.test(String(releaseId))) return null;
  try {
    const res = await netfetch.get(`https://coverartarchive.org/release/${releaseId}/front-500`, { allowHttp: false, timeoutMs: 20000 });
    if (res.status !== 200) { res.stream.resume(); return null; }
    const type = String(res.headers['content-type'] || '').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) { res.stream.resume(); return null; }
    const chunks = [];
    let size = 0;
    await new Promise((resolve, reject) => {
      res.stream.on('data', (c) => { size += c.length; if (size > 5 * 1024 * 1024) { res.stream.destroy(); reject(new Error('big')); } else chunks.push(c); });
      res.stream.on('end', resolve);
      res.stream.on('error', reject);
    });
    return { type, data: Buffer.concat(chunks) };
  } catch { return null; }
}

module.exports = { identify, byName, byFingerprint, fingerprint, coverArt, fromRecording, pickRelease, albumTracks, recordingLength, KEY_RE, UUID };
