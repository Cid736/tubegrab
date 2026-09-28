// Private-instance login (TUBEGRAB_USERS): parsing fails closed, and the
// credential check never lets anything but an exact user + password through.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUsers, checkCredentials, MIN_PASSWORD } = require('../lib/auth');

const basic = (raw) => `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;

test('parseUsers: valid lists, passwords may contain colons', () => {
  const { users, problems } = parseUsers(' ana:clave-larga , luis:otra:con:dos ');
  assert.deepEqual(problems, []);
  assert.deepEqual([...users], [['ana', 'clave-larga'], ['luis', 'otra:con:dos']]);
  assert.deepEqual(parseUsers('').problems, [], 'unset → open, no error');
  assert.equal(parseUsers('').users.size, 0);
});

test('parseUsers: anything broken is a problem (the server then refuses to start)', () => {
  for (const bad of ['solousuario', 'ana:', ':clave-larga', 'ana:corta', ' , ', 'ana:clave-larga,', 'ana:clave-larga,ana:otra-larga', ',']) {
    assert.ok(parseUsers(bad).problems.length > 0, JSON.stringify(bad));
  }
  assert.equal(MIN_PASSWORD, 8);
});

test('parseUsers: problems never echo a password', () => {
  const { problems } = parseUsers('ana:corta1,luis:Secreto!,luis:Secreto!2');
  const text = problems.join(' ');
  for (const secret of ['corta1', 'Secreto!']) assert.ok(!text.includes(secret), text);
});

test('checkCredentials: only the exact pair passes', () => {
  const { users } = parseUsers('ana:clave-larga,luis:pässwörd-ñ:x');
  assert.equal(checkCredentials(users, basic('ana:clave-larga')), true);
  assert.equal(checkCredentials(users, basic('luis:pässwörd-ñ:x')), true, 'unicode and colons in the password');
  assert.equal(checkCredentials(users, `basic   ${Buffer.from('ana:clave-larga').toString('base64')}`), true, 'scheme is case-insensitive');
  for (const header of [
    undefined, '', 'Basic', 'Basic ', 'Bearer abc', basic('ana:clave-larg'), basic('ana:clave-larga '), basic('ANA:clave-larga'),
    basic('nadie:clave-larga'), basic('anaclave-larga'), basic(':clave-larga'), basic('ana:'), 'Basic !!!!', 'Basic YW5h', // "ana", no colon
    `Basic ${'A'.repeat(100000)}`, basic('__proto__:x'), basic('constructor:clave-larga'),
  ]) {
    assert.equal(checkCredentials(users, header), false, String(header).slice(0, 60));
  }
});

test('checkCredentials: prototype keys are not users', () => {
  const { users } = parseUsers('ana:clave-larga');
  for (const u of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(checkCredentials(users, basic(`${u}:clave-larga`)), false, u);
  }
});
