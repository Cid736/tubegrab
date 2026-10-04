const test = require('node:test');
const assert = require('node:assert/strict');
const download = require('../lib/download');

const env = { ffmpegPath: '/ff/ffmpeg', dir: '/tmp/job', jsRuntime: '/usr/bin/node', cookiesPath: null };

test('normalizeMediaUrl accepts supported sites, with or without scheme/www', () => {
  assert.equal(download.normalizeMediaUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw'), 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  assert.equal(download.normalizeMediaUrl('youtu.be/jNQXAC9IVRw'), 'https://youtu.be/jNQXAC9IVRw');
  assert.equal(download.normalizeMediaUrl('  https://m.youtube.com/watch?v=x  '), 'https://m.youtube.com/watch?v=x');
  assert.ok(download.normalizeMediaUrl('https://soundcloud.com/a/b'));
  assert.ok(download.normalizeMediaUrl('https://vimeo.com/1'));
  assert.ok(download.normalizeMediaUrl('https://www.youtube.com./watch?v=x'), 'trailing dot');
});

test('normalizeMediaUrl rejects anything that is not a supported site', () => {
  for (const bad of [
    '', null, undefined, 'not a url',
    'https://evil.example.com/x',
    'https://youtube.com.evil.com/watch?v=x', // suffix trick
    'https://evilyoutube.com/watch?v=x', // no dot boundary
    'https://user:pass@youtube.com/watch?v=x', // credentials
    'https://youtube.com:8443/watch?v=x', // port
    'file:///c:/windows/win.ini',
    'javascript:alert(1)',
    'ftp://youtube.com/x',
    'http://127.0.0.1:3000/',
    'http://[::1]/',
    `https://youtube.com/${'a'.repeat(2100)}`, // too long
  ]) {
    assert.equal(download.normalizeMediaUrl(bad), null, String(bad).slice(0, 60));
  }
});

test('parseDownloadOptions falls back to safe defaults for unknown values', () => {
  const o = download.parseDownloadOptions({
    mode: 'x', audioFormat: '__proto__', audioBitrate: '999', quality: '1080;rm', container: 'constructor',
    subtitles: 'true', sponsorblock: 1, playlist: 'yes', metadata: 0,
  });
  assert.deepEqual(o, {
    mode: 'audio', audioFormat: 'mp3', audioBitrate: '192', quality: '1080', container: 'mp4',
    metadata: true, subtitles: false, subLangs: 'es,en', subMode: 'embed', sponsorblock: false, sponsorMode: 'remove', playlist: false,
    music: false, official: false, lyrics: false, nameTemplate: null, chapters: false, sectionStart: null, sectionEnd: null, rateLimit: null,
    normalize: false, bpm: false, live: false, nfo: false,
  });
  assert.equal(download.parseDownloadOptions({ mode: 'audio', lyrics: 'true' }).lyrics, false, 'only a real true');
  assert.equal(download.parseDownloadOptions({ mode: 'video', lyrics: true }).lyrics, false, 'audio only');
  assert.equal(download.parseDownloadOptions({ mode: 'audio', lyrics: true }).lyrics, true);
  assert.equal(download.parseDownloadOptions({ mode: 'video', subtitles: true }).subtitles, true);
  assert.equal(download.parseDownloadOptions({ mode: 'audio', subtitles: true }).subtitles, false);
  // v3.13: the official audio, only in music mode (on unless turned off).
  assert.equal(download.parseDownloadOptions({ mode: 'audio', music: true }).official, true);
  assert.equal(download.parseDownloadOptions({ mode: 'audio', music: true, official: false }).official, false);
  assert.equal(download.parseDownloadOptions({ mode: 'audio', official: true }).official, false, 'not without music mode');
  assert.equal(download.parseDownloadOptions({ mode: 'video', music: true, official: true }).official, false);
});

test('buildArgs: hardening flags, and the URL is always after "--"', () => {
  const url = 'https://www.youtube.com/watch?v=x';
  const args = download.buildArgs(url, download.parseDownloadOptions({ mode: 'audio' }), env);
  assert.ok(args.includes('--ignore-config'));
  assert.equal(args[args.indexOf('--encoding') + 1], 'utf-8', 'titles with accents / ⧸ survive the pipe');
  assert.equal(args[args.indexOf('--ies') + 1], 'default,-generic');
  assert.deepEqual(args.slice(-2), ['--', url]);
  assert.ok(!args.includes('--exec'));
  assert.equal(args[args.indexOf('--js-runtimes') + 1], 'node:/usr/bin/node');
});

test('buildArgs maps every audio format and video container', () => {
  for (const audioFormat of ['mp3', 'm4a', 'opus', 'ogg', 'flac', 'wav', 'best']) {
    const args = download.buildArgs('https://youtu.be/x', download.parseDownloadOptions({ mode: 'audio', audioFormat }), env);
    assert.ok(args.includes('-x'), audioFormat);
  }
  for (const container of ['mp4', 'mkv', 'webm']) {
    const args = download.buildArgs('https://youtu.be/x', download.parseDownloadOptions({ mode: 'video', container, quality: '720' }), env);
    assert.equal(args[args.indexOf('--merge-output-format') + 1], container);
    assert.match(args[args.indexOf('-S') + 1], /^res:720/);
  }
});

test('new options: part of a video, chapters, music mode, subtitles, speed limit', () => {
  const part = download.parseDownloadOptions({ sectionStart: '1:20', sectionEnd: '3:45', rateLimit: '2M' });
  assert.equal(download.validateOptions(part), null);
  let args = download.buildArgs('https://youtu.be/x', part, env);
  assert.equal(args[args.indexOf('--download-sections') + 1], '*80-225');
  assert.ok(args.includes('--force-keyframes-at-cuts'));
  assert.equal(args[args.indexOf('--limit-rate') + 1], '2M');
  assert.match(download.describeOptions(part), /1:20–3:45/);

  for (const bad of [{ sectionStart: '50', sectionEnd: '10' }, { sectionStart: 'x' }, { sectionEnd: '1;rm' }, { chapters: true, sectionStart: '5' }]) {
    assert.ok(download.validateOptions(download.parseDownloadOptions(bad)), JSON.stringify(bad));
  }
  assert.equal(download.parseDownloadOptions({ rateLimit: '999G' }).rateLimit, null);

  args = download.buildArgs('https://youtu.be/x', download.parseDownloadOptions({ chapters: true }), env);
  assert.ok(args.includes('--split-chapters'));
  assert.match(args.find((a) => a.startsWith('chapter:')), /capitulos/);

  args = download.buildArgs('https://youtu.be/x', download.parseDownloadOptions({ mode: 'audio', music: true }), env);
  assert.ok(args.includes('--parse-metadata') && args.includes('--replace-in-metadata'));
  assert.match(args[args.indexOf('-o') + 1], /%\(artist&\{\} - \|\)s/);
  assert.ok(args.some((a) => a.startsWith('ThumbnailsConvertor+FFmpeg_o:') && a.includes('crop=')), 'square cover');
  assert.equal(download.parseDownloadOptions({ mode: 'video', music: true }).music, false, 'music mode is audio only');

  const subs = download.parseDownloadOptions({ mode: 'video', subtitles: true, subLangs: 'fr', subMode: 'file' });
  args = download.buildArgs('https://youtu.be/x', subs, env);
  assert.equal(args[args.indexOf('--sub-langs') + 1], 'fr,fr-FR');
  assert.ok(args.includes('--convert-subs') && !args.includes('--embed-subs'));
  const bogus = download.parseDownloadOptions({ mode: 'video', subtitles: true, subLangs: 'all,--exec x', subMode: 'x' });
  assert.equal(bogus.subLangs, 'es,en');
  assert.equal(bogus.subMode, 'embed');
});

test('subscriptions point at a channel\'s videos, not its tabs', () => {
  assert.equal(download.subscriptionTarget('https://www.youtube.com/@jawed'), 'https://www.youtube.com/@jawed/videos');
  assert.equal(download.subscriptionTarget('https://www.youtube.com/channel/UC123/'), 'https://www.youtube.com/channel/UC123/videos');
  assert.equal(download.subscriptionTarget('https://www.youtube.com/playlist?list=PL1'), 'https://www.youtube.com/playlist?list=PL1');
  assert.equal(download.subscriptionTarget('https://soundcloud.com/artist'), 'https://soundcloud.com/artist');
});

test('SponsorBlock is only requested for YouTube', () => {
  const opts = download.parseDownloadOptions({ sponsorblock: true });
  assert.ok(download.buildArgs('https://youtu.be/x', opts, env).includes('--sponsorblock-remove'));
  assert.ok(!download.buildArgs('https://vimeo.com/1', opts, env).includes('--sponsorblock-remove'));
});

test('friendlyError turns yt-dlp errors into readable messages', () => {
  assert.match(download.friendlyError('ERROR: [youtube] x: Private video. Sign in'), /privado|sesión/);
  assert.match(download.friendlyError('ERROR: [youtube] x: Video unavailable'), /no está disponible/);
  assert.match(download.friendlyError('ERROR: [youtube] aaaaaaaaaaa: This video is unavailable'), /no está disponible/);
  assert.match(download.friendlyError('ERROR: unable to download: HTTP Error 403: Forbidden'), /403/);
  // "private" inside an unrelated message must not claim the video is private
  assert.doesNotMatch(download.friendlyError('ERROR: [generic] could not reach private network host'), /privado/);
  assert.equal(download.friendlyError(''), 'La descarga falló.');
  assert.match(download.friendlyError('ERROR: [vimeo] 1: The web client only works when logged-in. Use --cookies'), /iniciar sesión/);
});

test('a failed download is retried once automatically, unless the error is permanent', async (t) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-dl-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // A fake "yt-dlp": a Node script that fails with the given stderr, or
  // succeeds and prints TGFILE, depending on a counter file.
  const fake = path.join(dir, 'fake-ytdlp.js');
  fs.writeFileSync(fake, `
    const fs = require('fs'); const path = require('path');
    const dir = ${JSON.stringify(dir)}; const counter = path.join(dir, 'count');
    const n = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1;
    fs.writeFileSync(counter, String(n));
    const mode = process.env.FAKE_MODE;
    if (mode === 'ok-second' && n >= 2) {
      const out = path.join(dir, 'job', 'song.mp3'); fs.writeFileSync(out, 'x');
      console.log('TGFILE ' + out); process.exit(0);
    }
    console.error(mode === 'private' ? 'ERROR: [youtube] x: Private video' : 'ERROR: unable to download video data: HTTP Error 403: Forbidden');
    process.exit(1);`);
  fs.mkdirSync(path.join(dir, 'job'));
  const ctx = () => ({ dir: path.join(dir, 'job'), updates: [], update(p) { this.updates.push(p); }, setProcess() {}, isCanceled: () => false });
  // lib/download spawns env.ytDlpPath; load a fresh copy whose spawn runs
  // `node fake-ytdlp.js <args>` instead.
  const cp = require('child_process');
  const origSpawn = cp.spawn;
  cp.spawn = (cmd, args, o) => origSpawn(process.execPath, [fake, ...args], o);
  delete require.cache[require.resolve('../lib/download')];
  const dl = require('../lib/download');
  cp.spawn = origSpawn;
  t.after(() => { delete require.cache[require.resolve('../lib/download')]; });
  const env = { ytDlpPath: 'yt-dlp', ffmpegPath: 'ffmpeg', jsRuntime: null, cookiesPath: null };
  const opts = download.parseDownloadOptions({});

  process.env.FAKE_MODE = 'ok-second';
  const c1 = ctx();
  const files = await dl.runDownload('https://youtu.be/x', opts, env)({ title: 't' }, c1);
  assert.deepEqual(files.map((f) => path.basename(f)), ['song.mp3']);
  assert.ok(c1.updates.some((u) => u.stage === 'Reintentando…'));

  fs.rmSync(path.join(dir, 'count'));
  process.env.FAKE_MODE = 'private';
  const c2 = ctx();
  await assert.rejects(dl.runDownload('https://youtu.be/x', opts, env)({ title: 't' }, c2), /privado/);
  assert.equal(fs.readFileSync(path.join(dir, 'count'), 'utf8'), '1', 'permanent errors are not retried');
  delete process.env.FAKE_MODE;
});

test('formatSizes: rough sizes per height and for audio; odd data ignored', () => {
  const sizes = download.formatSizes({
    duration: 100,
    formats: [
      { vcodec: 'avc1', acodec: 'none', height: 1080, filesize: 5e7 },
      { vcodec: 'vp9', acodec: 'none', height: 1080, filesize_approx: 6e7 },
      { vcodec: 'vp9', acodec: 'none', height: 720, tbr: 1500 },
      { vcodec: 'none', acodec: 'opus', filesize: 2e6 },
      { vcodec: 'h264', acodec: 'aac', height: 360, filesize: 9e6 },
      { vcodec: 'x', acodec: 'none', height: '<script>', filesize: 1 },
      { vcodec: 'x', acodec: 'none', height: 99999, filesize: 1 },
      { vcodec: 'x', acodec: 'none', height: 480, filesize: -5 },
      'x', null,
    ],
  });
  assert.deepEqual(sizes, { audio: 2e6, video: { 360: 9e6, 720: 18750000, 1080: 6e7 } });
  assert.deepEqual(download.formatSizes({}), { audio: null, video: {} });
  assert.deepEqual(download.formatSizes({ formats: 'nope' }), { audio: null, video: {} });
});

test('file-name templates: our tags only, nothing that can leave the folder', () => {
  assert.equal(download.nameTemplate('{artist} - {title}'), '%(artist,creator,uploader|Desconocido).80B - %(title).150B');
  assert.equal(download.nameTemplate('{date} {title} [{id}]'), '%(upload_date>%Y-%m-%d|)s %(title).150B [%(id)s]');
  for (const bad of ['', 'sin etiquetas', '{artist}', '{title}/x', '..\{title}', '{title}%(uploader)s', '{title} {evil}', '{channel}: {title}',
    '{title}?', '{title}*', '{title}<>', `${'a'.repeat(120)}{title}`, '{title}\nx', '{Title}', '..{title}', '.{title}']) {
    assert.equal(download.nameTemplate(bad), null, JSON.stringify(bad));
  }
  const opts = download.parseDownloadOptions({ mode: 'audio', nameTemplate: '{artist} - {title}' });
  const args = download.buildArgs('https://www.youtube.com/watch?v=x', opts, env);
  assert.match(args[args.indexOf('-o') + 1], /%\(artist,creator,uploader\|Desconocido\)\.80B - %\(title\)\.150B\.%\(ext\)s$/);
  assert.equal(download.parseDownloadOptions({ nameTemplate: '{title}/../../x' }).nameTemplate, null);
});
