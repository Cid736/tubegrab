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
  const styles = {};
  const document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, style: { setProperty: (k, v) => { styles[k] = v; }, removeProperty: (k) => { delete styles[k]; } } } };
  vm.runInNewContext(SRC, { window, document, localStorage, sessionStorage, JSON, Object });
  return { attrs, calls, styles, prefs: window.tgPrefs, localStorage, sessionStorage };
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
    font: 'Comic Sans; } * { x', density: 9, corners: ['round'], bold: 'on', navIcons: 'rainbow', sidebarSide: 'top', sidebarWidth: '9999px',
    scrollbar: null, contentWidth: '100vw', showSubtitle: 0, showUiSwitch: 'false',
  };
  const { attrs, prefs } = boot({ local: { tubegrab_prefs: JSON.stringify(evil) }, session: { tubegrab_ui: 'evil' } });
  assert.deepEqual({ ...attrs }, {
    'data-ui': 'windows', 'data-theme': 'light', 'data-accent': 'blue', 'data-wall': 'aurora', 'data-glass': 'tinted', 'data-size': 'medium',
    'data-contrast': 'normal', 'data-motion': 'normal', lang: 'es',
    'data-wallblur': 'off', 'data-font': 'system', 'data-density': 'normal', 'data-corners': 'normal', 'data-bold': 'off', 'data-navicons': 'auto',
    'data-side': 'left', 'data-navwidth': 'normal', 'data-scrollbar': 'normal', 'data-content': 'normal', 'data-subtitle': 'on', 'data-uiswitch': 'on',
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

test('own colour: only #rrggbb reaches the CSS, with readable text on it', () => {
  const b = boot({ local: { tubegrab_prefs: JSON.stringify({ accent: 'custom', accentColor: '#ffee00' }) } });
  assert.equal(b.attrs['data-accent'], 'custom');
  assert.equal(b.styles['--accent'], '#ffee00');
  assert.equal(b.styles['--on-accent'], 'rgba(0, 0, 0, 0.85)', 'dark text on a light colour');
  for (const evil of ['red; } body { display:none', 'url(javascript:alert(1))', '#12345', '#1234567', 'expression(alert(1))']) {
    const e = boot({ local: { tubegrab_prefs: JSON.stringify({ accent: 'custom', accentColor: evil }) } });
    assert.equal(e.prefs.get().accentColor, '#0a84ff', evil);
  }
  b.prefs.set({ accent: 'green' });
  assert.equal(b.styles['--accent'], undefined, 'back to the preset colours');
});

test('own background: only a base64 JPEG the page made, else a normal background', () => {
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const ok = boot({ local: { tubegrab_prefs: JSON.stringify({ wall: 'custom' }), tubegrab_wallpaper: jpeg } });
  assert.equal(ok.attrs['data-wall'], 'custom');
  assert.equal(ok.styles['--wall-image'], `url("${jpeg}")`);
  for (const evil of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,abc") ; background: url("http://evil', 'https://evil.example/x.jpg', 'x'.repeat(10)]) {
    const e = boot({ local: { tubegrab_prefs: JSON.stringify({ wall: 'custom' }), tubegrab_wallpaper: evil } });
    assert.equal(e.styles['--wall-image'], undefined, evil.slice(0, 40));
    assert.equal(e.attrs['data-wall'], 'aurora', 'custom without a valid picture falls back');
  }
  const b = boot();
  assert.equal(b.prefs.setWallpaper('data:text/html;base64,PGgxPg=='), false);
  assert.equal(b.prefs.setWallpaper('data:image/jpeg;base64,' + 'A'.repeat(4 * 1024 * 1024)), false, 'too big');
  assert.ok(b.prefs.setWallpaper(jpeg));
  assert.equal(b.attrs['data-wall'], 'custom');
});

test('accessibility: high contrast and fewer animations, booleans only', () => {
  const b = boot({ local: { tubegrab_prefs: JSON.stringify({ highContrast: true, reduceMotion: true }) } });
  assert.equal(b.attrs['data-contrast'], 'high');
  assert.equal(b.attrs['data-motion'], 'reduce');
  const e = boot({ local: { tubegrab_prefs: JSON.stringify({ highContrast: 'yes', reduceMotion: 1 }) } });
  assert.equal(e.attrs['data-contrast'], 'normal');
  assert.equal(e.attrs['data-motion'], 'normal');
});

test('file-name template pref: tags and safe characters only', () => {
  const ok = boot({ local: { tubegrab_prefs: JSON.stringify({ nameTemplate: '{artist} - {title}' }) } });
  assert.equal(ok.prefs.get().nameTemplate, '{artist} - {title}');
  for (const evil of ['{title}/../x', '{title}%(uploader)s', '<img src=x>{title}', 'no tags', 'x'.repeat(130)]) {
    assert.equal(boot({ local: { tubegrab_prefs: JSON.stringify({ nameTemplate: evil }) } }).prefs.get().nameTemplate, '', evil);
  }
});

test('v3.6 look options: listed values only, numbers in range, colours and times checked', () => {
  const ok = boot({ local: { tubegrab_prefs: JSON.stringify({
    font: 'serif', density: 'compact', corners: 'round', bold: true, navIcons: 'color', sidebarSide: 'right', sidebarWidth: 'icons',
    scrollbar: 'thin', contentWidth: 'full', showSubtitle: false, showUiSwitch: false, size: 'xlarge', wallDim: 70, wallBlur: 12,
    wall: 'colors', wallColors: '#ff0000,#00ff00,#0000ff',
  }) } });
  const a = ok.attrs;
  assert.deepEqual([a['data-font'], a['data-density'], a['data-corners'], a['data-bold'], a['data-navicons'], a['data-side'], a['data-navwidth'], a['data-scrollbar'], a['data-content'], a['data-subtitle'], a['data-uiswitch'], a['data-size']],
    ['serif', 'compact', 'round', 'on', 'color', 'right', 'icons', 'thin', 'full', 'off', 'off', 'xlarge']);
  assert.equal(ok.styles['--wall-dim'], '0.7');
  assert.equal(ok.styles['--wall-blur'], '12px');
  assert.equal(a['data-wall'], 'colors');
  assert.deepEqual([ok.styles['--w1'], ok.styles['--w2'], ok.styles['--w3']], ['#ff0000', '#00ff00', '#0000ff']);
  assert.equal(a['data-wallblur'], 'off', 'no picture, nothing to blur');
  ok.prefs.set({ wall: 'ocean' });
  assert.equal(ok.styles['--w1'], undefined, 'own colours only for that background');

  for (const [k, v] of [['wallDim', 91], ['wallDim', -1], ['wallDim', 4.5], ['wallDim', '50'], ['wallBlur', 31], ['wallBlur', '9px'],
    ['wallColors', '#fff,#000,#123456'], ['wallColors', '#ff0000,#00ff00,#0000ff;x'], ['wallColors', 'red,green,blue'],
    ['darkFrom', '24:00'], ['darkFrom', '7:00'], ['darkTo', '07:00; x'], ['startView', 'set-appearance'], ['startView', '__proto__']]) {
    const e = boot({ local: { tubegrab_prefs: JSON.stringify({ [k]: v }) } });
    assert.equal(e.prefs.get()[k], e.prefs.DEFAULTS[k], `${k}=${v}`);
  }
  assert.equal(boot({ local: { tubegrab_prefs: JSON.stringify({ startView: 'library' }) } }).prefs.get().startView, 'library');
});

test('side menu pages: known pages only, no repeats, never all hidden', () => {
  const ok = boot({ local: { tubegrab_prefs: JSON.stringify({ navHidden: ['stats', 'cv-image'], navOrder: ['library', 'dl-link'] }) } });
  assert.deepEqual([...ok.prefs.get().navHidden], ['stats', 'cv-image']);
  assert.deepEqual([...ok.prefs.get().navOrder], ['library', 'dl-link']);
  for (const evil of [['stats', 'stats'], ['<img>'], 'stats', [{}], ['set-appearance'], new Array(40).fill('stats')]) {
    const e = boot({ local: { tubegrab_prefs: JSON.stringify({ navHidden: evil, navOrder: evil }) } });
    assert.deepEqual([...e.prefs.get().navHidden], [], JSON.stringify(evil).slice(0, 40));
    assert.deepEqual([...e.prefs.get().navOrder], []);
  }
  const all = ok.prefs.NAV.slice();
  assert.deepEqual([...ok.prefs.set({ navHidden: all }).navHidden], [], 'hiding every page brings them all back');
});

test('dark mode by schedule, also across midnight', () => {
  const RealDate = Date;
  const at = (h, m) => { global.Date = class extends RealDate { constructor() { super(2026, 9, 4, h, m); } }; };
  try {
    // theme-init runs in its own context: give it a clock through the sandbox's Date.
    const run = (h, m, from, to) => {
      at(h, m);
      const attrs = {};
      const prefsJson = JSON.stringify({ theme: 'schedule', darkFrom: from, darkTo: to });
      const ls = { getItem: (k) => (k === 'tubegrab_prefs' ? prefsJson : null), setItem() {} };
      const calls = [];
      vm.runInNewContext(SRC, {
        window: { matchMedia: () => ({ matches: false, addEventListener() {} }), desktop: { setTheme: (t) => calls.push(t), setUi() {} } },
        document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, style: { setProperty() {}, removeProperty() {} } } },
        localStorage: ls, sessionStorage: ls, JSON, Object, Date: global.Date,
      });
      return [attrs['data-theme'], calls[0]];
    };
    assert.deepEqual(run(21, 0, '20:00', '07:00'), ['dark', 'dark']);
    assert.deepEqual(run(3, 30, '20:00', '07:00'), ['dark', 'dark']);
    assert.deepEqual(run(7, 0, '20:00', '07:00'), ['light', 'light']);
    assert.deepEqual(run(12, 0, '20:00', '07:00'), ['light', 'light']);
    assert.deepEqual(run(10, 0, '09:00', '17:00'), ['dark', 'dark']);
    assert.deepEqual(run(18, 0, '09:00', '17:00'), ['light', 'light']);
  } finally { global.Date = RealDate; }
});

test('a shared style code carries only the look, checked like everything else', () => {
  const a = boot({ local: { tubegrab_prefs: JSON.stringify({ font: 'mono', corners: 'square', accent: 'custom', accentColor: '#123456', rateLimit: '2M', lang: 'en' }) } });
  const style = a.prefs.exportStyle();
  assert.equal(style.font, 'mono');
  assert.equal(style.accentColor, '#123456');
  assert.equal(style.rateLimit, undefined, 'download settings are not part of a style');
  assert.equal(style.lang, undefined);
  const b = boot();
  assert.ok(b.prefs.importStyle(JSON.parse(JSON.stringify(style))));
  assert.equal(b.attrs['data-font'], 'mono');
  assert.equal(b.attrs['data-corners'], 'square');
  assert.equal(b.prefs.get().accentColor, '#123456');
  // Only style keys, each validated: nothing else gets in.
  const c = boot();
  assert.ok(c.prefs.importStyle({ font: 'x; }', corners: 'round', rateLimit: '20M', remember: false, nameTemplate: '{title}', __proto__: { polluted: 1 } }));
  assert.equal(c.attrs['data-font'], 'system');
  assert.equal(c.attrs['data-corners'], 'round');
  assert.equal(c.prefs.get().rateLimit, '');
  assert.equal(c.prefs.get().remember, true);
  assert.equal(c.prefs.get().nameTemplate, '');
  assert.equal(({}).polluted, undefined);
  for (const bad of [null, 'x', [1], {}, { evil: 1 }]) assert.equal(c.prefs.importStyle(bad), false);
  // Without a picture of its own, a "custom" background is left as it was.
  assert.ok(c.prefs.importStyle({ wall: 'custom', glass: 'solid' }));
  assert.equal(c.attrs['data-wall'], 'aurora');
  // Restablecer brings every piece of the look back.
  c.prefs.set({ density: 'comfy', navHidden: ['stats'], sidebarSide: 'right' });
  c.prefs.resetAppearance();
  assert.equal(c.attrs['data-density'], 'normal');
  assert.equal(c.attrs['data-side'], 'left');
  assert.deepEqual([...c.prefs.get().navHidden], []);
});
