// The mini player window (desktop app): shows what the main window's player
// is playing and sends it play / pause / next / previous / seek. It plays
// nothing itself.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.desktop;
  if (!api || !api.onPlayerState) return;
  const en = (() => { try { return JSON.parse(localStorage.getItem('tubegrab_prefs')).lang === 'en'; } catch { return false; } })();
  if (en) {
    $('sub').textContent = 'Nothing playing';
    for (const [id, label] of [['open', 'Open TubeGrab'], ['close', 'Close'], ['prev', 'Previous'], ['play', 'Play / pause'], ['next', 'Next']]) {
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
        img.onload = () => { icon.style.display = 'none'; box.appendChild(img); };
        img.src = coverSrc;
      }
    }
  });
  $('play').addEventListener('click', () => api.miniCommand('toggle'));
  $('next').addEventListener('click', () => api.miniCommand('next'));
  $('prev').addEventListener('click', () => api.miniCommand('prev'));
  $('open').addEventListener('click', () => api.miniCommand('open'));
  $('close').addEventListener('click', () => api.miniCommand('close'));
  $('seek').addEventListener('input', () => { seeking = true; });
  $('seek').addEventListener('change', () => { api.miniCommand({ cmd: 'seek', value: Number($('seek').value) }); seeking = false; });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); api.miniCommand('toggle'); }
    if (e.key === 'Escape') api.miniCommand('close');
  });
  api.miniCommand('hello');
})();
