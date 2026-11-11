'use strict';

const BRIDGE = 'http://127.0.0.1:17831';

const els = {
  token: document.getElementById('token'),
  url: document.getElementById('url'),
  check: document.getElementById('check'),
  send: document.getElementById('send'),
  status: document.getElementById('status'),
};

function setStatus(text, type) {
  els.status.textContent = text || '';
  els.status.className = `status${type ? ` ${type}` : ''}`;
}

async function load() {
  const saved = await chrome.storage.local.get(['bridgeToken']);
  if (saved.bridgeToken) els.token.value = saved.bridgeToken;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  els.url.value = tab?.url || '';
}

async function saveToken() {
  await chrome.storage.local.set({ bridgeToken: els.token.value.trim() });
}

async function api(path, options = {}) {
  const token = els.token.value.trim();
  const res = await fetch(`${BRIDGE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-FrameGrab-Token': token,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

els.check.addEventListener('click', async () => {
  try {
    const health = await fetch(`${BRIDGE}/health`).then((r) => r.json());
    if (!health.ok) throw new Error('Bridge unhealthy');
    setStatus(`Desktop bridge online on port 17831.`, 'ok');
  } catch (_) {
    setStatus('FrameGrab Desktop is not reachable. Open the app first.', 'error');
  }
});

els.send.addEventListener('click', async () => {
  try {
    await saveToken();
    const url = els.url.value.trim();
    if (!url) throw new Error('No tab URL found.');
    if (!els.token.value.trim()) throw new Error('Paste the bridge token from FrameGrab Settings.');

    setStatus('Analyzing via desktop engine…');
    const analyzed = await api('/analyze', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });

    await api('/enqueue', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          {
            url,
            title: analyzed.info?.title || url,
            thumbnail: analyzed.info?.thumbnail || null,
            format: 'MP4',
            quality: '1080',
            subtitle: '',
          },
        ],
      }),
    });

    setStatus(`Queued: ${analyzed.info?.title || url}`, 'ok');
  } catch (err) {
    setStatus(err.message || String(err), 'error');
  }
});

els.token.addEventListener('change', saveToken);
load().catch((err) => setStatus(err.message || String(err), 'error'));
