// Song lyrics from LRCLIB (https://lrclib.net): free, no account, no key.
// Only ever talks to that one host, with a timeout and a size cap, and
// everything that comes back is cleaned before it goes near a file.
const LRCLIB = 'https://lrclib.net';
const TIMEOUT_MS = 10000;
const MAX_BYTES = 512 * 1024;
const MAX_LYRICS = 20000;
const { version } = require('../package.json');

const USER_AGENT = `TubeGrab/${version} (https://github.com/Cid736/tubegrab)`;

// "(Official Video)", "[Lyrics]", "ft. X"… don't help finding the song.
const NOISE = /\s*[([][^)\]]*(official|video|audio|lyric|letra|visualizer|remaster|hd|4k|mv)[^)\]]*[)\]]/gi;

/** Printable text only: keeps line breaks, drops other control characters, caps the length. */
function cleanText(value, max = MAX_LYRICS) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
}

const cleanTitle = (title) => cleanText(title, 300).replace(NOISE, '').replace(/\s+(ft\.?|feat\.?)\s.*$/i, '').trim();

/** `LRC` lines only ("[mm:ss.xx] text"), so a stray answer can't write anything else into the .lrc file. */
function cleanSynced(lrc) {
  return cleanText(lrc).split('\n').filter((l) => /^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(l)).join('\n');
}

async function getJson(path, params, fetchImpl) {
  const url = new URL(path, LRCLIB);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB respondió ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('Respuesta demasiado grande');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Respuesta demasiado grande');
  return JSON.parse(text);
}

/**
 * { artist, title, album?, duration? } → { plain, synced } (either may be ''),
 * or null when there are none. Throws only on network trouble.
 */
async function findLyrics({ artist, title, album, duration }, { fetchImpl = fetch } = {}) {
  const track = cleanTitle(title);
  const who = cleanText(artist, 300);
  if (!track || !who) return null;
  const secs = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Math.round(Number(duration)) : null;
  let hit = await getJson('/api/get', { artist_name: who, track_name: track, album_name: cleanText(album, 300), duration: secs }, fetchImpl);
  if (!hit) {
    const list = await getJson('/api/search', { artist_name: who, track_name: track }, fetchImpl);
    if (Array.isArray(list)) {
      hit = list.find((x) => x && !x.instrumental && (x.plainLyrics || x.syncedLyrics)
        && (secs === null || !Number.isFinite(x.duration) || Math.abs(x.duration - secs) <= 5)) || null;
    }
  }
  if (!hit || typeof hit !== 'object' || hit.instrumental) return null;
  const plain = cleanText(hit.plainLyrics);
  const synced = cleanSynced(hit.syncedLyrics);
  if (!plain && !synced) return null;
  // Players that only read plain lyrics get the synced text without the times.
  return { plain: plain || synced.replace(/^\[[^\]]+\]\s?/gm, ''), synced };
}

module.exports = { findLyrics, cleanText, cleanTitle, cleanSynced, USER_AGENT };
