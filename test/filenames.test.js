const test = require('node:test');
const assert = require('node:assert/strict');
const { safeSaveName } = require('../lib/filenames');
const { outputBaseName } = require('../lib/convert');

test('safeSaveName keeps normal media names (unicode included)', () => {
  assert.equal(safeSaveName('Canción — Artista.mp3'), 'Canción — Artista.mp3');
  assert.equal(safeSaveName('video.MKV'), 'video.MKV');
});

test('safeSaveName never lets a non-media file land in the folder', () => {
  for (const name of ['evil.exe', 'x.lnk', 'run.bat', 'a.mp3.exe', 'setup.msi', 'noext', 'x.ps1', 'x.scr']) {
    assert.match(safeSaveName(name), /\.bin$/, name);
  }
});

test('safeSaveName strips paths, forbidden characters and dot tricks', () => {
  assert.equal(safeSaveName('../../Windows/System32/x.mp3'), 'x.mp3');
  assert.equal(safeSaveName('..\\..\\x.mp3'), 'x.mp3');
  assert.equal(safeSaveName('a<b>c:d"e|f?g*h.mp3'), 'a_b_c_d_e_f_g_h.mp3');
  assert.equal(safeSaveName('...hidden.mp3'), 'hidden.mp3');
  assert.equal(safeSaveName(''), 'descarga.bin');
  assert.ok(safeSaveName(`${'a'.repeat(500)}.mp3`).length <= 204);
});

test('subtitles and images next to media are allowed; folders are single names', () => {
  const { safeFolderName } = require('../lib/filenames');
  assert.equal(safeSaveName('video.es.srt'), 'video.es.srt');
  assert.equal(safeSaveName('portada.jpg'), 'portada.jpg');
  assert.equal(safeFolderName('Álbum: Lo mejor / 2024'), 'Álbum_ Lo mejor _ 2024');
  assert.equal(safeFolderName('AC/DC - Live'), 'AC_DC - Live');
  assert.equal(safeFolderName('../../Windows'), '_.._Windows', 'one folder, never a path');
  assert.equal(safeFolderName('..\\..\\x'), '_.._x');
  assert.equal(safeFolderName('...'), 'TubeGrab');
  assert.equal(safeFolderName('CON'), '_CON');
  assert.equal(safeFolderName('Carpeta.'), 'Carpeta');
  assert.ok(safeFolderName('x'.repeat(300)).length <= 100);
});

test('Windows device names are never used as file names', () => {
  for (const name of ['CON.mp3', 'nul.mp4', 'Com1.flac', 'lpt9.wav', 'aux']) {
    assert.match(safeSaveName(name), /^_/, name);
  }
  assert.equal(safeSaveName('console.mp3'), 'console.mp3');
  assert.equal(outputBaseName('CON.wav'), '_CON');
  assert.equal(outputBaseName('nul'), '_nul');
  assert.equal(outputBaseName('concierto.wav'), 'concierto');
  assert.equal(outputBaseName('../../etc/passwd.mp4'), '....etcpasswd'.replace(/^[.\s]+/, ''));
  assert.equal(outputBaseName('...'), 'archivo');
});
