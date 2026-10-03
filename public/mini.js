// The mini player window (desktop app): shows what the main window's player
// is playing and sends it play / pause / next / previous / seek / mute. It
// plays nothing itself. Drag it by any part that isn't a button.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.desktop;
  if (!api || !api.onPlayerState) return;
  const en = (() => { try { return JSON.parse(localStorage.getItem('tubegrab_prefs')).lang === 'en'; } catch { return false; } })();
  if (en) {
    $('sub').textContent = 'Nothing playing';
    for (const [id, label] of [['open', 'Open TubeGrab'], ['close', 'Close'], ['prev', 'Previous'], ['play', 'Play / pause'], ['next', 'Next'], ['mute', 'Mute']]) {
      $(id).title = label;
      $(id).setAttribute('aria-label', label);
    }
  }
  let seeking = false;
  let coverSrc = null;
  api.onPlayerState((s) => {
    $('title').textContent = s.title || 'TubeGrab';
    $('sub').textContent = s.sub || (s.title ? '' : (en ? 'Nothing playing' : 'Nada sonando'));
    $('play').classList.toggle('playing', s.playing);
    $('mute').classList.toggle('muted', s.muted === true);
    $('mute').setAttribute('aria-pressed', String(s.muted === true));
    if (!seeking) {
      $('seek').max = String(s.duration || 1);
      $('seek').value = String(s.time || 0);
    }
    if (s.cover !== coverSrc) {
      coverSrc = s.cover;
      const box = $('cover');
      const icon = box.querySelector('svg');
      box.querySelectorAll('img').forEach((img) => img.remove());
      icon.style.display = '';
      if (coverSrc) {
        const img = new Image();
        img.alt = '';
        img.draggable = false;
        img.onload = () => { icon.style.display = 'none'; box.appendChild(img); };
        img.src = coverSrc;
      }
    }
  });
  $('play').addEventListener('click', () => api.miniCommand('toggle'));
  $('next').addEventListener('click', () => api.miniCommand('next'));
  $('prev').addEventListener('click', () => api.miniCommand('prev'));
  $('mute').addEventListener('click', () => api.miniCommand('mute'));
  $('open').addEventListener('click', () => api.miniCommand('open'));
  $('close').addEventListener('click', () => api.miniCommand('close'));
  $('seek').addEventListener('input', () => { seeking = true; });
  $('seek').addEventListener('change', () => { api.miniCommand({ cmd: 'seek', value: Number($('seek').value) }); seeking = false; });

  // Moving the window: how far the pointer went, on screen, sent as it moves.
  const box = $('mini');
  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, input')) return;
    drag = { x: e.screenX, y: e.screenY, id: e.pointerId };
    box.setPointerCapture(e.pointerId);
    box.classList.add('dragging');
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.screenX - drag.x;
    const dy = e.screenY - drag.y;
    if (!dx && !dy) return;
    drag.x = e.screenX;
    drag.y = e.screenY;
    api.miniMove(dx, dy);
  });
  const end = () => { drag = null; box.classList.remove('dragging'); };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'q' && e.key !== 'Escape') return;
    if (e.target.tagName === 'INPUT' && e.key !== ' ' && e.key !== 'Escape') return;
    const cmd = { ' ': 'toggle', MediaPlayPause: 'toggle', ArrowRight: e.shiftKey ? 'next' : 'seekf', ArrowLeft: e.shiftKey ? 'prev' : 'seekb',
      ArrowUp: 'volup', ArrowDown: 'voldown', m: 'mute', M: 'mute', MediaTrackNext: 'next', MediaTrackPrevious: 'prev', s: 'stop' }[e.key];
    if (cmd) { e.preventDefault(); api.miniCommand(cmd); }
    if (e.key === 'Escape') { if (open) setOpen(false); else api.miniCommand('close'); }
  });
  // ---- Search and "Up next": the window grows downwards to show them ----
  // Songs found here play straight from YouTube, without being saved.
  const L = en ? {
    more: 'Search and up next', search: 'Search', next: 'Up next', ph: 'Search for a song or an artist…', note: 'Plays straight from YouTube, nothing is downloaded.',
    searching: 'Searching…', none: 'Nothing found.', fail: "Couldn't search right now.", empty: 'Nothing else in the list.', add: 'Add to the list', playAll: 'Play from here',
  } : {
    more: 'Buscar y lo que viene', search: 'Buscar', next: 'A continuación', ph: 'Busca una canción o un artista…', note: 'Suena directo desde YouTube, sin descargar nada.',
    searching: 'Buscando…', none: 'No se encontró nada.', fail: 'No se pudo buscar ahora mismo.', empty: 'No hay nada más en la lista.', add: 'Añadir a la lista', playAll: 'Escuchar desde aquí',
  };
  $('more').title = L.more;
  $('more').setAttribute('aria-label', L.more);
  $('tabSearch').textContent = L.search;
  $('tabNext').textContent = L.next;
  $('q').placeholder = L.ph;
  $('q').setAttribute('aria-label', L.ph);
  $('note').textContent = L.note;
  let open = false;
  let results = [];
  let upNext = [];
  const ADD_SVG = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  function setOpen(v) {
    open = v;
    $('drawer').classList.toggle('hidden', !open);
    $('more').setAttribute('aria-expanded', String(open));
    $('more').classList.toggle('on', open);
    api.miniCommand({ cmd: 'expand', value: open });
    if (open) setTimeout(() => $('q').focus(), 50);
  }
  $('more').addEventListener('click', () => setOpen(!open));
  function tab(which) {
    const search = which === 'search';
    $('tabSearch').classList.toggle('on', search);
    $('tabNext').classList.toggle('on', !search);
    $('tabSearch').setAttribute('aria-selected', String(search));
    $('tabNext').setAttribute('aria-selected', String(!search));
    $('searchForm').classList.toggle('hidden', !search);
    $('results').classList.toggle('hidden', !search);
    $('upnext').classList.toggle('hidden', search);
    $('note').classList.toggle('hidden', !search);
    if (!search) renderNext();
  }
  $('tabSearch').addEventListener('click', () => tab('search'));
  $('tabNext').addEventListener('click', () => tab('next'));
  const fmt = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');
  function row(title, sub, thumb, onPlay, onAdd) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item';
    if (thumb) {
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.loading = 'lazy';
      img.src = thumb;
      b.appendChild(img);
    }
    const text = document.createElement('span');
    text.className = 'item-text';
    const t1 = document.createElement('span');
    t1.className = 'item-title';
    t1.textContent = title;
    const t2 = document.createElement('span');
    t2.className = 'item-sub';
    t2.textContent = sub;
    text.append(t1, t2);
    b.appendChild(text);
    b.title = L.playAll;
    b.addEventListener('click', onPlay);
    li.appendChild(b);
    if (onAdd) {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'icon add';
      a.innerHTML = ADD_SVG;
      a.title = L.add;
      a.setAttribute('aria-label', `${L.add}: ${title}`);
      a.addEventListener('click', onAdd);
      li.appendChild(a);
    }
    return li;
  }
  function message(ul, text) {
    ul.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'msg';
    li.textContent = text;
    ul.appendChild(li);
  }
  const ytThumb = (u) => (typeof u === 'string' && /^https:\/\/i\d?\.ytimg\.com\//.test(u) ? u : null);
  function renderResults() {
    const ul = $('results');
    ul.innerHTML = '';
    results.forEach((r, i) => {
      ul.appendChild(row(r.title, [r.channel, fmt(r.duration)].filter(Boolean).join(' · '), ytThumb(r.thumbnail),
        () => api.miniCommand({ cmd: 'stream', items: results, index: i }),
        () => api.miniCommand({ cmd: 'enqueue', items: [r] })));
    });
  }
  function renderNext() {
    const ul = $('upnext');
    if (!upNext.length) { message(ul, L.empty); return; }
    ul.innerHTML = '';
    for (const x of upNext) ul.appendChild(row(x.title, x.sub, null, () => api.miniCommand({ cmd: 'jump', value: x.n }), null));
  }
  const clientId = (() => { try { const id = localStorage.getItem('tubegrab_client'); return /^[a-f0-9]{32}$/.test(id || '') ? id : null; } catch { return null; } })();
  $('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = $('q').value.trim();
    if (!query) return;
    message($('results'), L.searching);
    try {
      const r = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(clientId ? { 'X-Client-Id': clientId } : {}) }, body: JSON.stringify({ query }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      results = (data.results || []).filter((x) => /^[A-Za-z0-9_-]{11}$/.test(String(x.id))).map((x) => ({ id: x.id, title: x.title, channel: x.channel, duration: x.duration, thumbnail: ytThumb(x.thumbnail) }));
      if (!results.length) message($('results'), L.none); else renderResults();
    } catch { message($('results'), L.fail); }
  });
  api.onPlayerState((s) => {
    upNext = Array.isArray(s.upNext) ? s.upNext : [];
    if (open && !$('upnext').classList.contains('hidden')) renderNext();
  });
  api.miniCommand('hello');
})();
