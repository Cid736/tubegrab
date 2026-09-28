// public/theme-init.js runs in the page before first paint; run it in a
// minimal fake browser to check what it applies from (possibly tampered) storage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'theme-init.js'), 'utf8');

function boot({ local = {}, session = {}, dark = false } = {}) {
  const attrs = {};
  const calls = [];
  const store = (init) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
  };
  const localStorage = store(local);
  const sessionStorage = store(session);
  const window = {
    matchMedia: () => ({ matches: dark, addEventListener() {} }),
    desktop: { setTheme: (t) => calls.push(['theme', t]), setUi: (u) => calls.push(['ui', u]) },
  };
  const document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
  vm.runInNewContext(SRC, { window, document, localStorage, sessionStorage, JSON, Object });
  return { attrs, calls, prefs: window.tgPrefs, localStorage, sessionStorage };
}

test('defaults: Windows interface, automatic theme', () => {
  const { attrs, calls } = boot({ dark: true });
  assert.equal(attrs['data-ui'], 'windows');
  assert.equal(attrs['data-theme'], 'dark');
  assert.equal(attrs['data-accent'], 'blue');
  assert.deepEqual(calls, [['ui', 'windows'], ['theme', 'auto']]);
});

test('the favourite interface opens at launch; the switch only lasts the session', () => {
  const b = boot({ local: { tubegrab_prefs: JSON.stringify({ uiDefault: 'mac' }) } });
  assert.equal(b.attrs['data-ui'], 'mac');
  b.prefs.setUi('windows');
  assert.equal(b.attrs['data-ui'], 'windows');
  assert.equal(b.sessionStorage.getItem('tubegrab_ui'), 'windows');
  assert.equal(b.prefs.get().uiDefault, 'mac', 'switching does not change the favourite');
  // Same session (reload) keeps the switch; a new launch goes back to the favourite.
  assert.equal(boot({ local: { tubegrab_prefs: JSON.stringify({ uiDefault: 'mac' }) }, session: { tubegrab_ui: 'windows' } }).attrs['data-ui'], 'windows');
});

test('tampered storage never reaches the page', () => {
  const evil = {
    uiDefault: '<img src=x onerror=alert(1)>', theme: 'dark;background:url(//evil)', accent: '__proto__',
    wall: 'javascript:alert(1)', glass: {}, size: 'huge', remember: 'yes', notify: 1, sound: null, last: [1, 2],
  };
  const { attrs, prefs } = boot({ local: { tubegrab_prefs: JSON.stringify(evil) }, session: { tubegrab_ui: 'evil' } });
  assert.deepEqual({ ...attrs }, {
    'data-ui': 'windows', 'data-theme': 'light', 'data-accent': 'blue', 'data-wall': 'aurora', 'data-glass': 'tinted', 'data-size': 'medium',
    lang: 'es',
  });
  const p = prefs.get();
  assert.equal(p.remember, true);
  assert.equal(p.notify, true);
  assert.equal(p.sound, false);
  assert.equal(JSON.stringify(p.last), '{}');
  assert.equal(prefs.setUi('linux'), 'windows', 'unknown interface refused');
  prefs.set({ accent: 'red', theme: '"><script>' });
  assert.equal(attrs['data-accent'], 'red');
  assert.equal(attrs['data-theme'], 'light');
});

test('language and speed limit only take listed values', () => {
  const ok = boot({ local: { tubegrab_prefs: JSON.stringify({ lang: 'en', rateLimit: '2M' }) } });
  assert.equal(ok.attrs.lang, 'en');
  assert.equal(ok.prefs.get().rateLimit, '2M');
  const bad = boot({ local: { tubegrab_prefs: JSON.stringify({ lang: '"><x', rateLimit: '999999999M; rm' }) } });
  assert.equal(bad.attrs.lang, 'es');
  assert.equal(bad.prefs.get().rateLimit, '');
});

test('broken JSON in storage falls back to defaults', () => {
  const { attrs } = boot({ local: { tubegrab_prefs: '{not json' } });
  assert.equal(attrs['data-ui'], 'windows');
});
