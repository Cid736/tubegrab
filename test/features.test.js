// v3.4.0: tempo/key, loudness, "already have it", profiles and rules,
// subtitles, the editor's new effects, TV casting, watch folder, playlists,
// duplicates, lyrics, live recordings, .nfo sheets and the command line.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { ffmpegPath } = require('./helpers');

const ffmpeg = ffmpegPath();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-features-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

// ---- tempo and key ----
const analysis = require('../lib/analysis');
const R = analysis.RATE;
function clicks(bpm, secs) {
  const s = new Float32Array(R * secs);
  const period = (60 / bpm) * R;
  for (let b = 0; b * period < s.length; b++) {
    const st = Math.round(b * period);
    for (let i = 0; i < 400 && st + i < s.length; i++) s[st + i] += Math.sin(i * 0.3) * Math.exp(-i / 80) * (b % 4 === 0 ? 1 : 0.6);
  }
  return s;
}
function chords(list) {
  const parts = list.map((notes) => {
    const s = new Float32Array(R * 3);
    for (const f of notes) for (let i = 0; i < s.length; i++) s[i] += Math.sin((2 * Math.PI * f * i) / R) * 0.2;
    return s;
  });
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

test('BPM: steady beats from 90 to 174 are found exactly; silence gives none', () => {
  for (const bpm of [90, 100, 120, 128, 140, 174]) assert.equal(analysis.detectBpm(clicks(bpm, 30)), bpm, String(bpm));
  assert.equal(analysis.detectBpm(new Float32Array(R * 20)), null);
});

test('key: a C major and an A minor progression', () => {
  const [C4, E4, G4, A3, D4, F4, B3] = [261.63, 329.63, 392, 220, 293.66, 349.23, 246.94];
  assert.deepEqual(analysis.detectKey(chords([[C4, E4, G4], [F4, A3 * 2, C4 * 2], [G4, B3 * 2, D4 * 2], [C4, E4, G4]])), { key: 'C', camelot: '8B' });
  assert.deepEqual(analysis.detectKey(chords([[A3, C4, E4], [D4, F4, A3 * 2], [E4, G4 * 1.0595, B3 * 2], [A3, C4, E4]])), { key: 'Am', camelot: '8A' });
  assert.equal(analysis.detectKey(new Float32Array(R * 5)), null);
});

test('tempo and key written into an MP3 and read back', { skip: !ffmpeg && 'ffmpeg not found', timeout: 60_000 }, async () => {
  const wav = path.join(work, 'beat.wav');
  const buf = Buffer.alloc(44 + R * 2 * 30);
  const s = clicks(120, 30);
  for (let i = 0; i < s.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s[i] * 20000))), 44 + i * 2);
  // A bare WAV header (mono, 16-bit).
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + s.length * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(R, 24); buf.writeUInt32LE(R * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(s.length * 2, 40);
  fs.writeFileSync(wav, buf);
  const mp3 = path.join(work, 'beat.mp3');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-b:a', '192k', mp3]);
  const tags = require('../lib/tags');
  const found = await tags.addTempoAndKey({ ffmpegPath: ffmpeg, file: mp3 });
  assert.equal(found.bpm, 120);
  const read = await tags.readTags(ffmpeg, mp3, 'beat.mp3');
  assert.equal(read.tags.bpm, '120');
});

// ---- loudness ----
test('loudness: two passes bring a quiet song to the target; cover and tags stay', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async () => {
  const { normalizeFile, parseMeasure, supports } = require('../lib/loudness');
  assert.equal(parseMeasure('junk'), null);
  assert.equal(parseMeasure('x { "input_i": "-inf" }'), null);
  assert.equal(supports('a.mp3'), true);
  assert.equal(supports('a.exe'), false);
  const f = path.join(work, 'quiet.mp3');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=440:d=6,volume=0.05', '-f', 'lavfi', '-i', 'color=red:s=64x64:d=1',
    '-map', '0', '-map', '1', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic', '-metadata', 'title=Quieta', f]);
  const before = await normalizeFile({ ffmpegPath: ffmpeg, file: f });
  assert.ok(before < -30, `was ${before} LUFS`);
  assert.equal(await normalizeFile({ ffmpegPath: ffmpeg, file: f }), null, 'already right the second time');
  const info = execFileSync(ffmpeg, ['-hide_banner', '-i', f, '-f', 'ffmetadata', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(info, /title=Quieta/);
  assert.deepEqual(fs.readdirSync(work).filter((n) => n.startsWith('norm-tmp')), [], 'no leftovers');
});

// ---- already downloaded ----
test('seen: YouTube links in any form are the same video; per client; tampered file cleaned', () => {
  const { SeenIndex, keyFromUrl, keyFromMeta } = require('../lib/seen');
  const id = 'dQw4w9WgXcQ';
  for (const u of [`https://www.youtube.com/watch?v=${id}&t=5`, `https://youtu.be/${id}`, `https://m.youtube.com/shorts/${id}`, `https://music.youtube.com/watch?v=${id}`]) {
    assert.equal(keyFromUrl(u), `youtube:${id}`, u);
  }
  assert.equal(keyFromUrl('https://vimeo.com/123'), null);
  assert.equal(keyFromUrl('https://youtube.com/watch?v=../../etc'), null);
  assert.equal(keyFromMeta('Youtube', id), `youtube:${id}`);
  assert.equal(keyFromMeta('Bad Key!', id), null);
  const file = path.join(work, 'seen.json');
  const a = 'a'.repeat(32);
  const b = 'b'.repeat(32);
  const idx = new SeenIndex({ file });
  idx.add(a, `youtube:${id}`, { title: 'Song', mode: 'audio' });
  idx.add(a, `youtube:${id}`, { title: 'Song', mode: 'video' });
  assert.deepEqual(idx.get(a, `youtube:${id}`).modes, ['audio', 'video']);
  assert.equal(idx.get(b, `youtube:${id}`), null, 'another client');
  assert.deepEqual(Object.keys(idx.check(a, [`https://youtu.be/${id}`, 'https://youtu.be/xxxxxxxxxxx'])), [`https://youtu.be/${id}`]);
  fs.writeFileSync(file, JSON.stringify({ [a]: { '<script>': { title: 1 }, [`youtube:${id}`]: { title: 'ok', at: 1, modes: ['audio', 'evil'] } }, 'not-a-client': {} }));
  const again = new SeenIndex({ file });
  assert.deepEqual(again.get(a, `youtube:${id}`).modes, ['audio']);
  assert.equal(again.byClient.size, 1);
});

// ---- profiles and rules ----
test('profiles: options go through the download validation; rules need a profile or a folder', () => {
  const { ProfileStore, matchRule } = require('../lib/profiles');
  const file = path.join(work, 'profiles.json');
  const c = 'c'.repeat(32);
  const store = new ProfileStore({ file });
  const p = store.saveProfile(c, { name: '  Música FLAC\n', options: { mode: 'audio', audioFormat: 'flac', normalize: true, playlist: true, sectionStart: '1:00', audioBitrate: '9999' }, both: true });
  assert.equal(p.name, 'Música FLAC');
  assert.equal(p.options.audioFormat, 'flac');
  assert.equal(p.options.audioBitrate, '192', 'unknown values fall back');
  assert.equal(p.options.playlist, undefined, 'per-download choices are not kept');
  assert.equal(p.both, true);
  assert.throws(() => store.saveProfile(c, { name: '' }), /nombre/);
  assert.throws(() => store.saveRule(c, { match: 'Lofi' }), /perfil o una carpeta/);
  const r = store.saveRule(c, { match: 'Lofi Girl', profile: p.id, folder: '../../Windows' });
  assert.equal(r.folder, '_.._Windows', 'one folder name, never a path');
  assert.equal(matchRule(store.list(c).rules, { channel: 'lofi girl — beats' }).id, r.id);
  assert.equal(matchRule(store.list(c).rules, { channel: 'Otro canal' }), null);
  store.removeProfile(c, p.id);
  assert.deepEqual(store.list(c).rules.map((x) => x.profile), [''], 'the rule keeps its folder');
  assert.equal(new ProfileStore({ file }).list(c).rules.length, 1, 'kept on disk');
});

// ---- subtitles ----
test('whisper: words, lines, .srt and .ass; nothing typed can become ASS codes', () => {
  const w = require('../lib/whisper');
  const json = { transcription: [
    { offsets: { from: 0, to: 200 }, text: '' },
    { offsets: { from: 200, to: 500 }, text: ' Hola,' },
    { offsets: { from: 500, to: 900 }, text: ' {\\an8}mundo.' },
    { offsets: { from: 900, to: 1000 }, text: ' [MÚSICA]' },
    { offsets: { from: 2500, to: 3000 }, text: ' Adiós' },
  ] };
  const words = w.parseWords(json);
  assert.deepEqual(words.map((x) => x.text), ['Hola,', '{\\an8}mundo.', 'Adiós']);
  const lines = w.toLines(words);
  assert.deepEqual(lines.map((l) => l.text), ['Hola, {\\an8}mundo.', 'Adiós']);
  assert.match(w.toSrt(lines), /^1\n00:00:00,200 --> 00:00:00,900\n/);
  const ass = w.toAss(words, { style: 'big', width: 1080, height: 1920 });
  assert.ok(!ass.includes('\\an8'), 'override codes from the words are dropped');
  assert.match(ass, /\{\\c&H00E5FF&\}HOLA,\{\\c&HFFFFFF&\}/, 'the word being said is lit');
  assert.deepEqual(w.parseWords('not json'), []);
  assert.equal(w.status(path.join(work, 'nothing')).available, false);
});

test('whisper: pinned engine and models', () => {
  const w = require('../lib/whisper');
  assert.match(w.ENGINE.url, /^https:\/\/github\.com\/ggml-org\/whisper\.cpp\/releases\/download\//);
  assert.match(w.ENGINE.sha256, /^[a-f0-9]{64}$/);
  for (const m of Object.keys(w.MODELS)) {
    assert.match(w.MODELS[m].sha256, /^[a-f0-9]{64}$/);
    assert.match(w.modelUrl(m), /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/main\/ggml-\w+\.bin$/);
  }
  assert.ok(w.ENGINE.files.test('whisper-cli.exe') && !w.ENGINE.files.test('wchess.exe'), 'only the program and its libraries are kept');
});

// ---- editor ----
const convert = require('../lib/convert');
test('editor: reframe points, timelines and the follow-the-subject crop', () => {
  assert.equal(convert.parseReframe('[[0,1.5]]'), null, 'x is 0–1');
  assert.equal(convert.parseReframe('[[0,0.5],"x"]'), null);
  assert.deepEqual(convert.parseReframe('[[5,0.8],[0,0.2]]'), [[0, 0.2], [5, 0.8]]);
  const segs = [[0, 4, 1], [5, 9, 2]];
  assert.equal(convert.resultTime(segs, 2), 2);
  assert.equal(convert.resultTime(segs, 4.5), null, 'removed');
  assert.equal(convert.resultTime(segs, 7), 5);
  const words = convert.wordsInResult([{ start: 1, end: 1.5, text: 'a' }, { start: 4.4, end: 4.6, text: 'gone' }, { start: 7, end: 8, text: 'b' }], segs);
  assert.deepEqual(words.map((w) => [w.text, w.start, w.end]), [['a', 1, 1.5], ['b', 5, 5.5]]);
  const x = convert.reframeX([[0, 0.2], [5, 0.8], [9, 0.5]], segs);
  assert.match(x, /^clip\(\(.*\)\*iw-ow\/2,0,iw-ow\)$/);
  assert.ok(!/[;\[\]]/.test(x), 'no filter-graph syntax in the expression');
  const fx = convert.parseEditEffects({ aspects: '9:16,1:1,__proto__,9:16', musicVolume: 'mid', musicDuck: 'true', captions: 'big', reframe: '[[0,0.3]]' });
  assert.deepEqual(fx.aspects, ['9:16', '1:1']);
  assert.equal(fx.aspect, '9:16');
  assert.deepEqual(fx.music, { volume: 0.3, duck: true });
  assert.deepEqual(fx.captions, { style: 'big', lang: 'auto' });
  assert.equal(convert.parseEditEffects({ reframe: '[[0,0.3]]' }).reframe, null, 'only with a narrower shape');
  assert.equal(convert.needsEncoding(fx), true);
});

test('editor with real ffmpeg: music with ducking, three shapes, reframed', { skip: !ffmpeg && 'ffmpeg not found', timeout: 180_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(work, 'edit-'));
  const input = path.join(work, 'talk.mp4');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=d=6:s=320x180', '-f', 'lavfi', '-i', 'sine=330:d=6', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input]);
  const music = path.join(work, 'song.mp3');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=220:d=2', music]);
  const ctx = { dir, update() {}, setProcess() {}, isCanceled: () => false };
  const out = await convert.runEdit({
    inputPath: input, originalName: 'talk.mp4', segments: [[0, 2, 1], [3, 6, 2]], targetFormat: 'mp4', mode: 'exact', ffmpegPath: ffmpeg, musicPath: music,
    body: { aspects: '9:16,1:1,16:9', musicVolume: 'low', musicDuck: 'true', reframe: '[[0,0.1],[5,0.9]]', quality: 'baja' },
  })({}, ctx);
  assert.deepEqual(out.map((f) => path.basename(f)), ['talk (editado) (9x16).mp4', 'talk (editado) (1x1).mp4', 'talk (editado) (16x9).mp4']);
  const info = await convert.probe(ffmpeg, out[0]);
  assert.ok(info.hasAudio && info.hasVideo);
  assert.ok(Math.abs(info.duration - 3.5) < 0.2, `duration ${info.duration}`);
  assert.ok(info.width < info.height, 'vertical');
  assert.deepEqual(fs.readdirSync(dir).sort(), out.map((f) => path.basename(f)).sort(), 'no leftovers');
});

test('scenes: a cut between two different pictures is found', { skip: !ffmpeg && 'ffmpeg not found', timeout: 60_000 }, async () => {
  const f = path.join(work, 'two-shots.mp4');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=2,format=yuv420p', '-f', 'lavfi', '-i', 'testsrc=d=2:s=160x90,format=yuv420p',
    '-filter_complex', '[0][1]concat=n=2:v=1:a=0', '-c:v', 'libx264', f]);
  const times = await convert.detectScenes(ffmpeg, f);
  assert.equal(times.length, 1);
  assert.ok(Math.abs(times[0] - 2) < 0.2, String(times[0]));
});

// ---- TV casting ----
const cast = require('../lib/cast');
test('cast: only private network addresses; descriptions and mDNS answers parsed safely', () => {
  for (const ip of ['192.168.1.20', '10.0.0.5', '172.16.3.4']) assert.equal(cast.isPrivateIPv4(ip), true, ip);
  for (const ip of ['8.8.8.8', '127.0.0.1', '172.32.0.1', '192.168.1.300', 'localhost', '::1']) assert.equal(cast.isPrivateIPv4(ip), false, ip);
  assert.equal(cast.ssdpLocation('HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.9:1400/xml/desc.xml\r\n'), 'http://192.168.1.9:1400/xml/desc.xml');
  const xml = '<root><device><friendlyName>Salón &amp; TV</friendlyName><serviceList><service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/rc</controlURL></service>'
    + '<service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/MediaRenderer/AVTransport/Control</controlURL></service></serviceList></device></root>';
  assert.deepEqual(cast.parseDescription(xml, 'http://192.168.1.9:1400/xml/desc.xml'), { name: 'Salón & TV', control: 'http://192.168.1.9:1400/MediaRenderer/AVTransport/Control' });
  assert.equal(cast.parseDescription('<root>nothing</root>', 'http://192.168.1.9/'), null);
  assert.match(cast.didl('http://192.168.1.2:5000/m/x', 'A & <B>', 'audio/mpeg'), /A &amp; &lt;B&gt;/);
  // CASTV2 framing round-trips.
  const msg = cast.encodeCast({ source: 'sender-0', destination: 'receiver-0', namespace: 'urn:x', data: { type: 'PING', t: 'ñ' } });
  assert.equal(msg.readUInt32BE(0), msg.length - 4);
  assert.deepEqual(JSON.parse(cast.decodeCast(msg.subarray(4)).payload), { type: 'PING', t: 'ñ' });
  // A Chromecast's mDNS answer: PTR + TXT (fn=) + SRV.
  const name = (labels) => Buffer.concat([...labels.map((l) => Buffer.concat([Buffer.from([Buffer.byteLength(l)]), Buffer.from(l)])), Buffer.from([0])]);
  const rr = (n, type, data) => { const h = Buffer.alloc(10); h.writeUInt16BE(type, 0); h.writeUInt16BE(1, 2); h.writeUInt32BE(120, 4); h.writeUInt16BE(data.length, 8); return Buffer.concat([n, h, data]); };
  const inst = name(['Chromecast-abc', '_googlecast', '_tcp', 'local']);
  const txt = Buffer.concat([Buffer.from([16]), Buffer.from('fn=Tele del salón'.slice(0, 16))]);
  const srv = Buffer.concat([Buffer.from([0, 0, 0, 0, 0x1f, 0x49]), name(['abc', 'local'])]);
  const header = Buffer.from([0, 0, 0x84, 0, 0, 0, 0, 3, 0, 0, 0, 0]);
  const packet = Buffer.concat([header, rr(name(['_googlecast', '_tcp', 'local']), 12, inst), rr(inst, 16, txt), rr(inst, 33, srv)]);
  const d = cast.parseMdns(packet);
  assert.equal(d.port, 8009);
  assert.match(d.name, /^Tele del sal/);
  assert.equal(cast.parseMdns(Buffer.from([1, 2, 3])), null);
});

test('cast: a DLNA TV gets SetAVTransportURI + Play; a Chromecast gets LAUNCH + LOAD', async (t) => {
  const { lanAddress } = require('../lib/library');
  const lan = lanAddress();
  if (!lan) { t.skip('no local network address'); return; }
  const calls = [];
  const tv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { calls.push({ action: req.headers.soapaction, body }); res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end('<ok/>'); });
  });
  await new Promise((r) => tv.listen(0, lan, r));
  const control = `http://${lan}:${tv.address().port}/AVTransport/Control`;
  const shared = [];
  const mgr = new cast.CastManager({ lanAddressFn: () => lan, share: async () => ({ url: `http://${lan}:1/m/${'a'.repeat(32)}`, token: 't1', contentType: 'audio/mpeg' }), unshare: (tok) => shared.push(tok) });
  mgr.devices.set('dlna:x', { id: 'dlna:x', kind: 'dlna', name: 'TV', control, host: lan });
  const st = await mgr.play('dlna:x', '/x/song.mp3', 'Canción <1>');
  assert.equal(st.casting, true);
  assert.deepEqual(calls.map((c) => c.action.replace(/.*#|"/g, '')), ['Stop', 'SetAVTransportURI', 'Play']);
  assert.match(calls[1].body, /Canci&amp;oacute;n|Canción &lt;1&gt;|Canci/);
  await mgr.control('pause');
  await mgr.stop();
  assert.deepEqual(calls.slice(-2).map((c) => c.action.replace(/.*#|"/g, '')), ['Pause', 'Stop']);
  assert.deepEqual(shared, ['t1'], 'the link is unshared when it stops');
  tv.close();

  // A fake Chromecast on a duplex stream (no TLS needed to check the protocol).
  const { PassThrough } = require('stream');
  const sock = new PassThrough();
  sock.destroyed = false;
  const sent = [];
  sock.write = (buf) => {
    const m = cast.decodeCast(buf.subarray(4));
    const data = JSON.parse(m.payload);
    sent.push(data.type);
    const reply = (ns, d) => setImmediate(() => sock.emit('data', cast.encodeCast({ source: m.destination, destination: 'sender-0', namespace: ns, data: { ...d, requestId: data.requestId } })));
    if (data.type === 'LAUNCH') reply(m.namespace, { type: 'RECEIVER_STATUS', status: { applications: [{ appId: 'CC1AD845', transportId: 'web-1' }] } });
    if (data.type === 'LOAD') reply(m.namespace, { type: 'MEDIA_STATUS', status: [{ mediaSessionId: 7, playerState: 'PLAYING' }] });
    if (data.type === 'PAUSE') reply(m.namespace, { type: 'MEDIA_STATUS', status: [{ mediaSessionId: 7, playerState: 'PAUSED' }] });
    return true;
  };
  sock.destroy = () => { sock.destroyed = true; };
  const session = new cast.CastSession({ host: '192.168.1.50', port: 8009 }, { connect: () => { setImmediate(() => sock.emit('secureConnect')); return sock; } });
  await session.open();
  await session.play({ url: 'http://192.168.1.2:5000/m/x', title: 'x', contentType: 'video/mp4' });
  await session.media('PAUSE');
  session.close();
  assert.deepEqual(sent.filter((x) => x !== 'PING'), ['CONNECT', 'LAUNCH', 'CONNECT', 'LOAD', 'PAUSE']);
});

// ---- streaming to the TV: our share server answers byte ranges ----
test('share server: media links are seekable (Range) and typed; phone links unchanged', async (t) => {
  const { ShareServer, lanAddress } = require('../lib/library');
  const lan = lanAddress();
  if (!lan) { t.skip('no local network address'); return; }
  const f = path.join(work, 'tone.mp3');
  fs.writeFileSync(f, Buffer.from('0123456789abcdef'));
  const shares = new ShareServer({ lanAddressFn: () => lan });
  const s = await shares.share(f, 'tone.mp3', { stream: true });
  assert.match(s.url, /\/m\/[a-f0-9]{32}$/);
  const get = (url, headers = {}) => new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); }).on('error', reject);
  });
  const all = await get(s.url);
  assert.equal(all.status, 200);
  assert.equal(all.headers['content-type'], 'audio/mpeg');
  assert.equal(all.headers['accept-ranges'], 'bytes');
  const part = await get(s.url, { Range: 'bytes=4-7' });
  assert.deepEqual([part.status, part.body, part.headers['content-range']], [206, '4567', 'bytes 4-7/16']);
  const tail = await get(s.url, { Range: 'bytes=-3' });
  assert.equal(tail.body, 'def');
  assert.equal((await get(s.url, { Range: 'bytes=99-' })).status, 416);
  assert.equal((await get(s.url.replace('/m/', '/s/'))).status, 404, 'a media link is not a phone page');
  shares.stop();
});

// ---- watch folder ----
test('watch folder: only new, finished media files, each once; originals moved when asked', () => {
  const { WatchFolder } = require('../lib/watch');
  const dir = fs.mkdtempSync(path.join(work, 'watch-'));
  fs.writeFileSync(path.join(dir, 'old.mp3'), 'x');
  let now = 0;
  const queued = [];
  const w = new WatchFolder({ configFile: path.join(work, `watch-${Date.now()}.json`), enqueue: (c, file) => { queued.push(file.name); return true; }, now: () => now });
  w.set({ enabled: true, dir, clientId: 'd'.repeat(32), fields: { targetFormat: 'mp3' }, moveOriginals: true });
  fs.writeFileSync(path.join(dir, 'new.wav'), 'abc');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'deep.mp3'), 'x');
  assert.equal(w.scan(), 0, 'first seen: wait until it stops growing');
  now += 5000;
  assert.equal(w.scan(), 1);
  assert.deepEqual(queued, ['new.wav'], 'not the old one, nor text, nor subfolders');
  now += 5000;
  assert.equal(w.scan(), 0, 'once');
  w.finished(path.join(dir, 'new.wav'));
  assert.ok(fs.existsSync(path.join(dir, 'Convertidos', 'new.wav')));
  w.finished(path.join(work, 'elsewhere.mp3'));
  w.stop();
  assert.throws(() => w.set({ dir: '\\\\server\\share' }), /carpeta de este equipo/);
});

// ---- library: lyrics, playlists, duplicates, plays ----
test('library: synced lyrics, own playlists with .m3u8, duplicates and plays', () => {
  const { Library, parseLrc } = require('../lib/library');
  assert.deepEqual(parseLrc('[ar:x]\n[00:01.50]Hola\n[00:00.20][00:03.00]Otra\nbasura'), [{ t: 0.2, text: 'Otra' }, { t: 1.5, text: 'Hola' }, { t: 3, text: 'Otra' }]);
  const root = fs.mkdtempSync(path.join(work, 'lib-'));
  const put = (rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
  const big = Buffer.alloc(300 * 1024, 7);
  put('a.mp3', big);
  put('copia/a.mp3', big);
  put('a.lrc', '[00:01.00]Línea');
  put('Canción (1).mp3', 'x'.repeat(2000));
  put('Canción.mp3', 'y'.repeat(3000));
  const lib = new Library({ rootFn: () => root, metaFile: path.join(root, '.meta.json'), playlistsFile: path.join(work, `pl-${Date.now()}.json`) });
  const { files } = lib.scan();
  const a = files.find((f) => f.name === 'a.mp3' && !f.folder);
  assert.equal(a.lrc, true);
  assert.deepEqual(lib.syncedLyrics(a.id), [{ t: 1, text: 'Línea' }]);
  const groups = lib.duplicates();
  assert.ok(groups.some((g) => g.kind === 'same' && g.ids.length === 2), 'identical copies');
  assert.ok(groups.some((g) => g.kind === 'name' && g.ids.length === 2), 'same name');
  assert.equal(lib.setMeta(a.id, { played: true }).plays, 1);
  const pl = lib.createPlaylist('Para correr');
  lib.updatePlaylist(pl.id, { add: [a.id, 'f'.repeat(32), files.find((f) => f.name === 'Canción.mp3').id] });
  assert.equal(lib.playlist(pl.id).items.length, 2, 'unknown ids are ignored');
  lib.updatePlaylist(pl.id, { move: [1, 0] });
  assert.deepEqual(lib.playlist(pl.id).items, ['Canción.mp3', 'a.mp3']);
  const name = lib.exportPlaylist(pl.id);
  assert.equal(name, 'Para correr.m3u8');
  assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /^#EXTM3U\n#PLAYLIST:Para correr\n#EXTENC:UTF-8\n# TubeGrab\n/);
  fs.writeFileSync(path.join(root, 'Mia.m3u8'), 'mine');
  const mine = lib.createPlaylist('Mia');
  assert.equal(lib.exportPlaylist(mine.id), 'Mia (2).m3u8', "someone else's file is never overwritten");
  assert.equal(fs.readFileSync(path.join(root, 'Mia.m3u8'), 'utf8'), 'mine');
});

// ---- downloads: live, .nfo, new metadata ----
const download = require('../lib/download');
test('download: live recordings from the start, .nfo poster, normalize and BPM flags', () => {
  const env = { ytDlpPath: 'yt-dlp', ffmpegPath: 'ffmpeg', jsRuntime: null, cookiesPath: null, dir: '/tmp/job' };
  const live = download.buildArgs('https://www.youtube.com/watch?v=x', download.parseDownloadOptions({ mode: 'video', live: true }), env);
  assert.ok(live.includes('--live-from-start') && live.includes('--hls-use-mpegts'));
  assert.equal(download.validateOptions(download.parseDownloadOptions({ live: true, playlist: true })), 'Un directo se graba entero: sin tramos, capítulos ni playlist.');
  const nfo = download.buildArgs('https://vimeo.com/1', download.parseDownloadOptions({ mode: 'video', nfo: true }), env);
  assert.ok(nfo.includes('--write-thumbnail'));
  assert.ok(nfo.some((a) => a.startsWith('after_move:TGDESC')));
  assert.equal(download.parseDownloadOptions({ mode: 'audio', nfo: true }).nfo, false, 'video only');
  assert.equal(download.parseDownloadOptions({ mode: 'video', bpm: true }).bpm, false, 'audio only');
  const meta = download.parseMeta(JSON.stringify({ id: '../x', extractor_key: 'Youtube', webpage_url: 'https://evil.example/x', channel: 'Canal' }));
  assert.deepEqual(meta, { extractor_key: 'Youtube', channel: 'Canal' }, 'odd ids and foreign links are dropped');
  assert.equal(download.parseDescription(JSON.stringify('Línea 1\r\nLínea\u0007 2')), 'Línea 1\nLínea 2');
});

test('nfo: the sheet is escaped XML and the thumbnail becomes the poster', () => {
  const dir = fs.mkdtempSync(path.join(work, 'nfo-'));
  const video = path.join(dir, 'Vídeo.mp4');
  fs.writeFileSync(video, 'v');
  fs.writeFileSync(path.join(dir, 'Vídeo.jpg'), 'j');
  const out = download.writeNfo(video, { title: 'A <b> & "c"', description: 'x]]><script>', channel: 'Canal', upload_date: '20240131', id: 'abc', extractor_key: 'Youtube', duration: 125 }, dir);
  assert.deepEqual(out.map((f) => path.basename(f)), ['Vídeo.nfo', 'Vídeo-poster.jpg']);
  const xml = fs.readFileSync(out[0], 'utf8');
  assert.match(xml, /<title>A &lt;b&gt; &amp; &quot;c&quot;<\/title>/);
  assert.ok(!xml.includes('<script>'));
  assert.match(xml, /<premiered>2024-01-31<\/premiered>/);
  assert.match(xml, /<uniqueid type="youtube" default="true">abc<\/uniqueid>/);
});

// ---- subscriptions: mirror mode ----
test('subscriptions: a mirror takes the whole playlist, in order, and reports it on every check', async () => {
  const { Subscriptions } = require('../lib/subscriptions');
  const enq = [];
  const mirrors = [];
  let list = [{ id: 'a', url: 'https://youtu.be/a', title: 'A' }, { id: 'b', url: 'https://youtu.be/b', title: 'B' }];
  const subs = new Subscriptions({
    file: path.join(work, `subs-${Date.now()}.json`),
    latest: async () => ({ title: 'x', entries: list }),
    full: async () => ({ title: 'Mi lista', entries: list }),
    enqueue: (sub, entries) => enq.push(entries.map((e) => e.id)),
    onMirror: (sub, entries) => mirrors.push(entries.map((e) => e.id)),
  });
  clearInterval(subs.timer);
  await assert.rejects(subs.add({ clientId: 'e'.repeat(32), url: 'https://youtube.com/@canal', options: {}, mirror: true }), /playlists/);
  const sub = await subs.add({ clientId: 'e'.repeat(32), url: 'https://youtube.com/playlist?list=PL1', options: {}, mirror: true });
  assert.equal(sub.mirror, true);
  assert.deepEqual(enq, [['a', 'b']]);
  list = [{ id: 'b', url: 'https://youtu.be/b', title: 'B' }, { id: 'c', url: 'https://youtu.be/c', title: 'C' }];
  assert.equal(await subs.check(subs.get(sub.id, 'e'.repeat(32))), 1);
  assert.deepEqual(enq[1], ['c']);
  assert.deepEqual(mirrors.at(-1), ['b', 'c'], 'the app gets the whole list to bring the folder in line');
});

// ---- command line ----
test('cli: options', () => {
  const { parseArgs } = require('../cli');
  assert.deepEqual(parseArgs(['https://youtu.be/x', '--flac', '--normalize']), { mode: 'audio', audioFormat: 'flac', urls: ['https://youtu.be/x'], out: process.cwd(), normalize: true });
  const v = parseArgs(['u', '--video=720', '--webm', '--out=dest']);
  assert.deepEqual([v.mode, v.quality, v.container, v.out], ['video', '720', 'webm', path.resolve('dest')]);
  assert.equal(parseArgs(['u', '--rm-rf']).bad, '--rm-rf');
});
