// === DOM Elements ===
const urlInput = document.getElementById('urlInput');
const btnClear = document.getElementById('btnClear');
const audioBitrate = document.getElementById('audioBitrate');
const btnDownload = document.getElementById('btnDownload');
const statusMessage = document.getElementById('statusMessage');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

// === URL Input Events ===
urlInput.addEventListener('input', () => {
  btnClear.classList.toggle('visible', urlInput.value.length > 0);
});

btnClear.addEventListener('click', () => {
  urlInput.value = '';
  btnClear.classList.remove('visible');
  urlInput.focus();
  clearStatus();
});

// Paste from clipboard on focus if input is empty
urlInput.addEventListener('focus', async () => {
  if (urlInput.value) return;
  try {
    const text = await navigator.clipboard.readText();
    if (isYouTubeUrl(text)) {
      urlInput.value = text;
      btnClear.classList.add('visible');
      showStatus('URL detectada en el portapapeles ✨', 'success');
    }
  } catch (e) { /* clipboard permission denied, ignore */ }
});

// === Download ===
btnDownload.addEventListener('click', handleDownload);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleDownload();
});

async function handleDownload() {
  const url = urlInput.value.trim();
  if (!url) {
    showStatus('Pega un link de YouTube primero', 'error');
    shakeInput();
    return;
  }
  if (!isYouTubeUrl(url)) {
    showStatus('Eso no parece un link válido de YouTube', 'error');
    shakeInput();
    return;
  }

  setLoading(true);
  clearStatus();
  showProgress();

  try {
    const body = {
      url,
      mode: 'audio',
      audioFormat: 'mp3',
      audioBitrate: audioBitrate.value,
    };

    showStatus('Conectando con servidor seguro...', '');
    animateProgress(30);

    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || data.suggestion || 'Error desconocido');
    }

    animateProgress(60);
    showStatus('Preparando archivo de audio...', 'success');

    if (data.downloadUrl) {
      animateProgress(90);
      
      const downloadUrl = data.downloadUrl.startsWith('/api/') 
        ? data.downloadUrl 
        : `/api/proxy-download?url=${encodeURIComponent(data.downloadUrl)}&filename=${encodeURIComponent(data.filename || 'audio.mp3')}`;
      
      showStatus('¡Descarga iniciada! 🎉', 'success');
      animateProgress(100);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = data.filename || 'audio.mp3';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    setLoading(false);
    setTimeout(hideProgress, 2000);
  }
}

// === Helpers ===
function isYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com|m\.youtube\.com)\/.+/i.test(url);
}

function showStatus(msg, type) {
  statusMessage.textContent = msg;
  statusMessage.className = 'status-message' + (type ? ` ${type}` : '');
}

function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.className = 'status-message';
}

function setLoading(loading) {
  btnDownload.classList.toggle('loading', loading);
}

function showProgress() {
  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
}

function hideProgress() {
  progressBar.classList.add('hidden');
}

function animateProgress(percent) {
  progressFill.style.width = percent + '%';
}

function shakeInput() {
  const wrapper = document.querySelector('.input-wrapper');
  wrapper.style.animation = 'shake 0.4s ease';
  setTimeout(() => wrapper.style.animation = '', 400);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    50% { transform: translateX(6px); }
    75% { transform: translateX(-4px); }
  }
`;
document.head.appendChild(style);
