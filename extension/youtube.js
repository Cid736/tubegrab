// A small "Download with TubeGrab" button on YouTube videos and Shorts. It
// lives in a closed shadow root so the page's styles and scripts can't touch it.
(() => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;display:none';
  const root = host.attachShadow({ mode: 'closed' });
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = chrome.i18n.getMessage('buttonLabel');
  button.title = chrome.i18n.getMessage('actionTitle');
  const style = document.createElement('style');
  style.textContent = `button{all:initial;cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;
    background:#0a84ff;color:#fff;font:600 14px system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35)}
    button:hover{background:#0070e0}button::before{content:'';width:16px;height:16px;background:no-repeat center/16px
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round'%3E%3Cpath d='M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14'/%3E%3C/svg%3E")}`;
  root.append(style, button);
  button.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'tubegrab' }));
  document.documentElement.appendChild(host);

  // YouTube changes pages without reloading: show the button only on a video.
  const onVideo = () => /^\/(watch|shorts\/)/.test(location.pathname) || (location.hostname === 'music.youtube.com' && /[?&]v=/.test(location.search));
  let last = '';
  const refresh = () => {
    if (location.href === last) return;
    last = location.href;
    host.style.display = onVideo() ? 'block' : 'none';
  };
  refresh();
  setInterval(refresh, 1000);
})();
