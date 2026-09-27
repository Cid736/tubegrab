// Loaded synchronously in <head>: applies the saved appearance before first
// paint (no flash of the wrong theme) and exposes window.tgPrefs to app.js.
(function () {
  var KEY = 'tubegrab_prefs';
  var DEFAULTS = {
    theme: 'auto', accent: 'blue', wall: 'aurora', glass: 'tinted', size: 'medium',
    remember: true, notify: true, sound: false,
  };
  // Every stored value is checked against a fixed list: prefs end up in
  // attributes and CSS, so nothing arbitrary from storage is ever applied.
  var ALLOWED = {
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

  function apply(p) {
    var root = document.documentElement;
    var dark = p.theme === 'dark' || (p.theme === 'auto' && media.matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-accent', p.accent);
    root.setAttribute('data-wall', p.wall);
    root.setAttribute('data-glass', p.glass);
    root.setAttribute('data-size', p.size);
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
