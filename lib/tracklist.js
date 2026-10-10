// A long mix, DJ set or full album split with a tracklist you paste (the one
// in a comment, say: "0:00 Intro / 3:21 Artist - Song"…). Each track is cut
// out of the downloaded file without re-encoding and tagged on its own.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_TEXT = 20_000;
const MAX_TRACKS = 300;
const MAX_LINE = 300;
// "3:21", "03:21", "1:03:21" (also "[3:21]", "(3:21)"), not part of a longer number.
const TIMESTAMP = /(?:^|[^\d:])((?:\d{1,2}:)?\d{1,3}:[0-5]\d)(?![\d:])/;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const toSeconds = (ts) => ts.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
// What joins a time to its name: "0:00 - Intro", "Intro | 0:00", "• 0:00 › Intro"…
const SEPARATORS = new Set([...' \t-–—|:•·*>›']);
/** Drops separators at both ends (a loop, not a regex: no backtracking on long lines). */
function trimSeparators(s) {
  let a = 0;
  let b = s.length;
  while (a < b && SEPARATORS.has(s[a])) a++;
  while (b > a && SEPARATORS.has(s[b - 1])) b--;
  return s.slice(a, b);
}

/** The pasted text, kept as text (for the queue to survive a restart), or null. */
function cleanTracklistText(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').slice(0, MAX_TEXT).trim();
  return text || null;
}

/**
 * Text → [{ start, title, artist }] in order, from the lines that carry a
 * time; at least two tracks, or [].
 */
function parseTracklist(raw) {
  const text = cleanTracklistText(raw);
  if (!text) return [];
  const byStart = new Map();
  for (const full of text.split('\n')) {
    const line = full.slice(0, MAX_LINE);
    const m = TIMESTAMP.exec(line);
    if (!m) continue;
    const start = toSeconds(m[1]);
    if (!Number.isFinite(start) || start > 24 * 3600 || byStart.has(start)) continue;
    const at = m.index + m[0].length - m[1].length;
    let name = `${line.slice(0, at)} ${line.slice(at + m[1].length)}`
      .replace(/[([]\s*[)\]]/g, ' ') // the brackets the time was in
      .replace(/^\s*\d{1,3}[.)]\s+/, ''); // "1." / "01)" numbering
    name = clean(trimSeparators(name), 150);
    const pair = /^(.+?)\s+[-–—]\s+(.+)$/.exec(name);
    byStart.set(start, { start, artist: pair ? clean(pair[1], 100) : '', title: pair ? clean(pair[2], 150) : name });
    if (byStart.size >= MAX_TRACKS) break;
  }
  const tracks = [...byStart.values()].sort((a, b) => a.start - b.start);
  tracks.forEach((t, i) => { if (!t.title) t.title = `Pista ${i + 1}`; });
  return tracks.length > 1 ? tracks : [];
}

/** "03 - Artist - Song.mp3": a plain file name (no path, nothing Windows refuses). */
function trackFileName(i, track, ext) {
  const label = track.artist ? `${track.artist} - ${track.title}` : track.title;
  const safe = label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 150) || `Pista ${i + 1}`;
  return `${String(i + 1).padStart(2, '0')} - ${safe}${ext}`;
}

/**
 * Cuts `file` into one file per track in `<dir>/pistas`, copying the streams
 * (cover art included). Tracks that start past the end are left out.
 * Resolves with the files written, in order.
 */
async function splitTracks({ ffmpegPath, file, tracks, duration = null, album = '', dir, setProcess = () => {}, onTrack = () => {}, isCanceled = () => false }) {
  const usable = tracks.filter((t) => !duration || t.start < duration - 1);
  if (usable.length < 2) throw new Error('La lista de pistas no encaja con la duración del archivo.');
  const outDir = path.join(dir, 'pistas');
  fs.mkdirSync(outDir, { recursive: true });
  const ext = path.extname(file);
  const out = [];
  for (let i = 0; i < usable.length; i++) {
    if (isCanceled()) throw new Error('Cancelado');
    onTrack(i, usable.length);
    const t = usable[i];
    const next = usable[i + 1];
    const target = path.join(outDir, trackFileName(i, t, ext));
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(t.start), '-i', file];
    if (next) args.push('-t', String(next.start - t.start));
    // The whole video's chapters mean nothing inside one track.
    args.push('-map', '0', '-map_chapters', '-1', '-c', 'copy', '-metadata', `title=${t.title}`, '-metadata', `track=${i + 1}/${usable.length}`);
    if (t.artist) args.push('-metadata', `artist=${t.artist}`);
    if (album) args.push('-metadata', `album=${clean(album, 200)}`);
    args.push(target);
    const ok = await new Promise((resolve) => {
      const p = spawn(ffmpegPath, args, { windowsHide: true });
      setProcess(p);
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
    });
    if (!ok || !fs.existsSync(target)) throw new Error(`No se pudo cortar la pista ${i + 1}.`);
    out.push(target);
  }
  return out;
}

module.exports = { parseTracklist, cleanTracklistText, splitTracks, trackFileName, MAX_TEXT };
