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
    if (e.target.tagName === 'INPUT' && e.key !== ' ' && e.key !== 'Escape') return;
    const cmd = { ' ': 'toggle', MediaPlayPause: 'toggle', ArrowRight: e.shiftKey ? 'next' : 'seekf', ArrowLeft: e.shiftKey ? 'prev' : 'seekb',
      ArrowUp: 'volup', ArrowDown: 'voldown', m: 'mute', M: 'mute', MediaTrackNext: 'next', MediaTrackPrevious: 'prev', s: 'stop' }[e.key];
    if (cmd) { e.preventDefault(); api.miniCommand(cmd); }
    if (e.key === 'Escape') api.miniCommand('close');
  });
  api.miniCommand('hello');
})();
