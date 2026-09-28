// Loaded synchronously in <head>: applies the saved appearance before first
// paint (no flash of the wrong theme) and exposes window.tgPrefs to app.js.
(function () {
  var KEY = 'tubegrab_prefs';
  var UI_KEY = 'tubegrab_ui';
  var DEFAULTS = {
    uiDefault: 'windows', lang: 'es', rateLimit: '', theme: 'auto', accent: 'blue', wall: 'aurora', glass: 'tinted', size: 'medium',
    remember: true, notify: true, sound: false,
  };
  // Every stored value is checked against a fixed list: prefs end up in
  // attributes and CSS, so nothing arbitrary from storage is ever applied.
  var ALLOWED = {
    uiDefault: ['windows', 'mac'],
    lang: ['es', 'en'],
    rateLimit: ['', '500K', '1M', '2M', '5M', '10M', '20M'],
    theme: ['auto', 'light', 'dark'],
    accent: ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'graphite'],
    wall: ['aurora', 'ocean', 'sunset', 'forest', 'graphite', 'none'],
    glass: ['clear', 'tinted', 'solid'],
    size: ['small', 'medium', 'large'],
  };

  function sanitize(raw) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = raw ? raw[k] : undefined;
      var ok = ALLOWED[k] ? ALLOWED[k].indexOf(v) !== -1 : typeof v === 'boolean';
      out[k] = ok ? v : DEFAULTS[k];
    });
    out.last = raw && raw.last && typeof raw.last === 'object' && !Array.isArray(raw.last) ? raw.last : {};
    return out;
  }

  function load() {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return sanitize(null); }
  }

  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var prefs = load();

  // Interface in use: the toolbar switch changes it for this session only
  // (survives reloads); each launch starts with the favourite, prefs.uiDefault.
  var ui = prefs.uiDefault;
  try {
    var sessionUi = sessionStorage.getItem(UI_KEY);
    if (ALLOWED.uiDefault.indexOf(sessionUi) !== -1) ui = sessionUi;
  } catch (e) { /* storage unavailable */ }

  function applyUi() {
    document.documentElement.setAttribute('data-ui', ui);
    if (window.desktop && window.desktop.setUi) window.desktop.setUi(ui);
  }
  applyUi();

  function apply(p) {
    var root = document.documentElement;
    var dark = p.theme === 'dark' || (p.theme === 'auto' && media.matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-accent', p.accent);
    root.setAttribute('data-wall', p.wall);
    root.setAttribute('data-glass', p.glass);
    root.setAttribute('data-size', p.size);
    root.setAttribute('lang', p.lang);
    // Desktop app: make the native window (acrylic, scrollbars, menus) match.
    if (window.desktop && window.desktop.setTheme) window.desktop.setTheme(p.theme);
  }

  apply(prefs);
  media.addEventListener('change', function () { if (prefs.theme === 'auto') apply(prefs); });

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ }
  }

  window.tgPrefs = {
    ALLOWED: ALLOWED,
    get: function () { return prefs; },
    getUi: function () { return ui; },
    setUi: function (value) {
      if (ALLOWED.uiDefault.indexOf(value) === -1) return ui;
      ui = value;
      try { sessionStorage.setItem(UI_KEY, ui); } catch (e) { /* storage unavailable */ }
      applyUi();
      return ui;
    },
    set: function (patch) {
      prefs = sanitize(Object.assign({}, prefs, patch));
      save();
      apply(prefs);
      return prefs;
    },
    resetAppearance: function () {
      return this.set({ theme: DEFAULTS.theme, accent: DEFAULTS.accent, wall: DEFAULTS.wall, glass: DEFAULTS.glass, size: DEFAULTS.size });
    },
  };
})();
