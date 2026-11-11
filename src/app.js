'use strict';

const state = {
  entries: [],
  analyses: new Map(),
  settings: null,
  jobs: [],
  analyzing: false,
  trimEnabled: false,
  duration: 0,
  trimStart: 0,
  trimEnd: 0,
  drag: null,
  bridge: null,
};

const $ = (id) => document.getElementById(id);

function uid() {
  return `e_${Math.random().toString(36).slice(2, 10)}`;
}

function shortPath(p) {
  if (!p) return 'Not set';
  if (p.length <= 48) return p;
  return `…${p.slice(-46)}`;
}

function setMessage(text, type) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `message${type ? ` ${type}` : ''}`;
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatClock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function parseClock(text) {
  const parts = String(text || '')
    .trim()
    .split(':')
    .map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function validEntries() {
  const seen = new Set();
  const out = [];
  for (const entry of state.entries) {
    const url = entry.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...entry, url });
  }
  return out;
}

function ensureTrailingEmpty() {
  const last = state.entries[state.entries.length - 1];
  if (!last || last.url.trim()) {
    state.entries.push({ id: uid(), url: '', status: 'empty' });
  }
}

function statusClass(entry, analysis) {
  if (!entry.url.trim()) return '';
  if (entry.status === 'analyzing') return 'warn';
  if (analysis?.ok) return 'ok';
  if (analysis && !analysis.ok) return 'err';
  return 'warn';
}

function statusText(entry, analysis) {
  if (!entry.url.trim()) return 'Waiting for URL';
  if (entry.status === 'analyzing') return 'Analyzing…';
  if (analysis?.ok) return 'Ready';
  if (analysis && !analysis.ok) return 'Unavailable';
  return 'Pending analysis';
}

function readyInfos() {
  return validEntries()
    .map((e) => state.analyses.get(e.url))
    .filter((a) => a?.ok)
    .map((a) => a.info);
}

function primaryInfo() {
  return readyInfos()[0] || null;
}

function updateDownloadButton() {
  const n = readyInfos().length;
  $('download').disabled = n === 0 || state.analyzing;
  if (state.trimEnabled && n === 1) {
    $('downloadLabel').textContent = 'Download selection';
  } else {
    $('downloadLabel').textContent = n <= 1 ? 'Download' : `Download ${n} videos`;
  }
}

function renderFields() {
  const root = $('videoFields');
  root.innerHTML = '';
  state.entries.forEach((entry, index) => {
    const analysis = state.analyses.get(entry.url.trim());
    const wrap = document.createElement('div');
    wrap.className = 'video-entry';
    wrap.innerHTML = `
      <div class="entry-header">
        <span class="url-index">VIDEO ${String(index + 1).padStart(2, '0')}</span>
        <span class="url-status ${statusClass(entry, analysis)}">${statusText(entry, analysis)}</span>
        ${state.entries.length > 1 ? `<button type="button" class="remove-url" data-id="${entry.id}">Remove</button>` : ''}
      </div>
      <input type="url" spellcheck="false" placeholder="https://www.youtube.com/watch?v=…" data-id="${entry.id}" value="${escapeAttr(entry.url)}" />
      <div class="entry-meta" data-meta="${entry.id}"></div>
    `;
    root.appendChild(wrap);
    const meta = wrap.querySelector(`[data-meta="${entry.id}"]`);
    if (analysis?.ok) {
      const info = analysis.info;
      meta.innerHTML = `
        <span class="chip">${escapeHtml(info.title).slice(0, 56)}</span>
        ${(info.qualities || []).filter((q) => q.value !== 'best').slice(0, 4).map((q) => `<span class="chip">${escapeHtml(q.label)}</span>`).join('')}
      `;
    } else if (analysis && !analysis.ok) {
      meta.innerHTML = `<span class="chip err-chip">${escapeHtml(analysis.error)}</span>`;
    }
  });
  $('countLabel').textContent = `${validEntries().length} ADDED`;
  updateDownloadButton();
}

function refreshStatusOnly() {
  $('countLabel').textContent = `${validEntries().length} ADDED`;
  state.entries.forEach((entry) => {
    const input = $('videoFields').querySelector(`input[data-id="${entry.id}"]`);
    if (!input) return;
    const status = input.closest('.video-entry')?.querySelector('.url-status');
    const analysis = state.analyses.get(entry.url.trim());
    if (status) {
      status.className = `url-status ${statusClass(entry, analysis)}`;
      status.textContent = statusText(entry, analysis);
    }
  });
  const before = state.entries.length;
  ensureTrailingEmpty();
  if (state.entries.length !== before) renderFields();
  updateDownloadButton();
}

function updateSubtitleOptions() {
  const langMap = new Map();
  for (const info of readyInfos()) {
    for (const sub of info.subtitles || []) {
      if (!sub.value) continue;
      if (!langMap.has(sub.value)) langMap.set(sub.value, sub);
    }
  }
  const current = $('subtitle').value;
  $('subtitle').innerHTML = '<option value="">N/A — no subtitles</option>';
  for (const sub of langMap.values()) {
    const opt = document.createElement('option');
    opt.value = sub.value;
    opt.textContent = sub.label;
    $('subtitle').appendChild(opt);
  }
  $('subtitle').value = langMap.has(current) ? current : '';
  $('subtitleHint').textContent = langMap.size
    ? `${langMap.size} subtitle language(s) detected.`
    : 'N/A by default. Languages appear after analysis.';
}

function updateQualityOptions() {
  const heightMap = new Map();
  for (const info of readyInfos()) {
    for (const q of info.qualities || []) {
      if (q.value === 'best') continue;
      heightMap.set(q.value, q);
    }
  }
  if (!heightMap.size) return;
  const preferred = String(state.settings?.quality || '1080');
  const current = $('quality').value;
  const list = [...heightMap.values()].sort((a, b) => Number(b.value) - Number(a.value));
  $('quality').innerHTML = '<option value="best">Best available</option>';
  for (const q of list) {
    const opt = document.createElement('option');
    opt.value = q.value;
    opt.textContent = q.label;
    $('quality').appendChild(opt);
  }
  if (current === 'best' || heightMap.has(current)) $('quality').value = current;
  else if (heightMap.has(preferred)) $('quality').value = preferred;
  else $('quality').value = 'best';
}

function buildWaveform() {
  const svg = $('waveform');
  const bars = [];
  for (let i = 0; i < 80; i += 1) {
    const x = (i / 80) * 1000;
    const h = 10 + Math.abs(Math.sin(i * 0.55) * 18) + (i % 5) * 2;
    bars.push(`<rect x="${x}" y="${60 - h}" width="8" height="${h}" rx="2" fill="#60a5fa" opacity="0.85"/>`);
  }
  svg.innerHTML = bars.join('');
}

function buildFilmstrip(thumb) {
  const strip = $('filmstrip');
  strip.innerHTML = '';
  for (let i = 0; i < 12; i += 1) {
    const cell = document.createElement('span');
    if (thumb) cell.style.backgroundImage = `url("${thumb}")`;
    strip.appendChild(cell);
  }
}

function buildRuler(duration) {
  const ruler = $('trimRuler');
  const marks = 5;
  const parts = [];
  for (let i = 0; i < marks; i += 1) {
    const t = (duration * i) / (marks - 1);
    parts.push(`<span>${formatClock(t)}</span>`);
  }
  ruler.innerHTML = parts.join('');
}

function syncTrimUi() {
  const duration = state.duration || 0;
  const startPct = duration ? (state.trimStart / duration) * 100 : 0;
  const endPct = duration ? (state.trimEnd / duration) * 100 : 100;
  const sel = $('selection');
  sel.style.left = `${startPct}%`;
  sel.style.width = `${Math.max(1, endPct - startPct)}%`;
  $('trimStartInput').value = formatClock(state.trimStart);
  $('trimEndInput').value = formatClock(state.trimEnd);
  const span = Math.max(0, state.trimEnd - state.trimStart);
  $('trimRangePill').textContent = `${Math.round(span)}s selected`;
  updateDownloadButton();
}

function setTrimBounds(start, end) {
  const duration = state.duration || 0;
  let s = Math.max(0, Math.min(start, duration));
  let e = Math.max(0, Math.min(end, duration));
  if (e - s < 1) {
    if (state.drag === 'start') s = Math.max(0, e - 1);
    else e = Math.min(duration, s + 1);
  }
  state.trimStart = s;
  state.trimEnd = e;
  syncTrimUi();
}

function updatePreview() {
  const info = primaryInfo();
  if (!info) {
    $('previewThumb').hidden = true;
    $('previewEmpty').hidden = false;
    $('previewMeta').hidden = true;
    $('previewDuration').textContent = '—';
    $('trimmerPanel').hidden = true;
    return;
  }
  $('previewEmpty').hidden = true;
  $('previewMeta').hidden = false;
  if (info.thumbnail) {
    $('previewThumb').src = info.thumbnail;
    $('previewThumb').hidden = false;
  } else {
    $('previewThumb').hidden = true;
  }
  $('previewTitle').textContent = info.title;
  $('previewSub').textContent = `${info.uploader || info.extractor || 'Source'} · ${info.duration || 'Unknown length'}`;
  $('previewDuration').textContent = info.duration || '—';

  state.duration = Number(info.durationSeconds) || 0;
  if (!state.duration) {
    $('trimmerPanel').hidden = true;
    return;
  }
  if (state.trimEnd <= 0 || state.trimEnd > state.duration) {
    state.trimStart = 0;
    state.trimEnd = state.duration;
  }
  buildFilmstrip(info.thumbnail);
  buildWaveform();
  buildRuler(state.duration);
  syncTrimUi();
  $('trimmerPanel').hidden = !state.trimEnabled;
}

function setTrimEnabled(on) {
  state.trimEnabled = !!on;
  $('trimToggle').setAttribute('aria-pressed', state.trimEnabled ? 'true' : 'false');
  $('trimToggle').textContent = '';
  $('trimToggle').innerHTML = `<span class="trim-dot"></span>${state.trimEnabled ? 'Trimmer on' : 'Enable Trimmer'}`;
  updatePreview();
  updateDownloadButton();
}

async function analyzeEntry(entry) {
  const url = entry.url.trim();
  if (!url) return;
  entry.status = 'analyzing';
  renderFields();
  setMessage('Analyzing media…');
  state.analyzing = true;
  updateDownloadButton();
  try {
    const info = await window.framegrab.analyze(url);
    state.analyses.set(url, { ok: true, info });
    entry.status = 'ready';
    setMessage(`Ready: ${info.title}`, 'success');
  } catch (err) {
    state.analyses.set(url, { ok: false, error: err.message || String(err) });
    entry.status = 'error';
    setMessage(err.message || String(err), 'error');
  } finally {
    state.analyzing = false;
    ensureTrailingEmpty();
    renderFields();
    updateSubtitleOptions();
    updateQualityOptions();
    updatePreview();
    updateDownloadButton();
  }
}

function scheduleAnalyze(entry) {
  clearTimeout(entry._timer);
  entry._timer = setTimeout(() => analyzeEntry(entry), 550);
}

function applySettings(settings) {
  state.settings = settings;
  if (!settings) return;
  $('format').value = settings.format || 'MP4';
  if ([...$('quality').options].some((o) => o.value === String(settings.quality))) {
    $('quality').value = String(settings.quality);
  }
  $('subtitle').value = settings.subtitle || '';
  $('setFormat').value = settings.format || 'MP4';
  if ([...$('setQuality').options].some((o) => o.value === String(settings.quality))) {
    $('setQuality').value = String(settings.quality);
  }
  $('setConcurrency').value = String(settings.concurrency || 1);
  $('folderPath').textContent = shortPath(settings.downloadDir);
  $('setFolderPath').textContent = shortPath(settings.downloadDir);
  $('bridgeToken').value = settings.bridgeToken || '';
  $('bridgePortLabel').textContent = String(settings.bridgePort || 17831);
}

function applyBridge(bridge) {
  state.bridge = bridge;
  if (!bridge) return;
  const text = bridge.running
    ? `Listening on 127.0.0.1:${bridge.port}`
    : `Offline${bridge.error ? ` — ${bridge.error}` : ''}`;
  $('bridgeStatus').textContent = text;
  $('bridgeDetail').textContent = text;
}

function renderQueue() {
  const jobs = state.jobs;
  const queued = jobs.filter((j) => j.status === 'queued').length;
  const active = jobs.filter((j) => ['downloading', 'analyzing', 'processing'].includes(j.status)).length;
  const done = jobs.filter((j) => j.status === 'complete').length;
  $('mQueued').textContent = String(queued);
  $('mActive').textContent = String(active);
  $('mDone').textContent = String(done);
  $('queueCount').textContent = String(queued + active);

  const list = $('jobList');
  if (!jobs.length) {
    list.innerHTML = '<div class="empty">No downloads yet.</div>';
    return;
  }

  list.innerHTML = jobs
    .map((job) => {
      const pct = Math.max(0, Math.min(100, Math.round(job.percent || 0)));
      const qualityLabel = job.quality === 'best' ? 'best' : `${job.quality}p`;
      const trimLabel =
        job.trimEnabled && Number.isFinite(job.trimStart) && Number.isFinite(job.trimEnd)
          ? ` · trim ${formatClock(job.trimStart)}–${formatClock(job.trimEnd)}`
          : '';
      return `<div class="job-card">
        <div class="job-main">
          ${job.thumbnail ? `<img class="job-thumb" src="${escapeAttr(job.thumbnail)}" alt="" />` : '<div class="job-thumb placeholder"></div>'}
          <div class="job-copy">
            <strong>${escapeHtml(job.title)}</strong>
            <span>${escapeHtml(job.url)}</span>
            <span class="job-meta">${escapeHtml(job.format)} · ${escapeHtml(qualityLabel)}${trimLabel}${job.speed ? ` · ${escapeHtml(job.speed)}` : ''}</span>
            ${job.error ? `<span class="job-error">${escapeHtml(job.error)}</span>` : ''}
          </div>
          <span class="status-pill ${job.status}">${escapeHtml(job.status)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="job-actions">
          <span class="progress-text">${pct}%</span>
          <div class="actions">
            ${['queued', 'downloading', 'processing'].includes(job.status) ? `<button class="table-action" data-act="cancel" data-id="${job.id}">Cancel</button>` : ''}
            ${['failed', 'cancelled'].includes(job.status) ? `<button class="table-action" data-act="retry" data-id="${job.id}">Retry</button>` : ''}
            ${job.outputDir ? `<button class="table-action" data-act="folder" data-id="${job.id}">Folder</button>` : ''}
            <button class="table-action" data-act="remove" data-id="${job.id}">Remove</button>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

function applySnapshot(snapshot) {
  state.jobs = snapshot.jobs || [];
  if (snapshot.settings) applySettings(snapshot.settings);
  if (snapshot.bridge) applyBridge(snapshot.bridge);
  if (snapshot.bins) {
    const ok = snapshot.bins.ytDlpOk && snapshot.bins.ffmpegOk;
    $('binStatus').textContent = ok ? 'yt-dlp · FFmpeg ready' : 'Binaries missing — run npm run fetch-bins';
  }
  renderQueue();
}

function switchView(name) {
  document.querySelectorAll('.nav').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach((view) => {
    const active = view.id === `view-${name}`;
    view.hidden = !active;
  });
}

async function startDownload() {
  const ready = validEntries().filter((e) => state.analyses.get(e.url)?.ok);
  if (!ready.length) {
    setMessage('Analyze at least one valid URL first.', 'error');
    return;
  }
  if (state.trimEnabled && ready.length > 1) {
    setMessage('Trimmer works on one video at a time. Keep a single ready URL, or turn trimmer off for batch.', 'error');
    return;
  }
  if (state.trimEnabled && (!state.duration || state.trimEnd <= state.trimStart)) {
    setMessage('Set a valid start/end range on the timeline.', 'error');
    return;
  }

  const items = ready.map((entry) => {
    const info = state.analyses.get(entry.url).info;
    return {
      url: entry.url,
      title: info.title,
      thumbnail: info.thumbnail,
      format: $('format').value,
      quality: $('quality').value,
      subtitle: $('subtitle').value,
      trimEnabled: state.trimEnabled,
      trimStart: state.trimEnabled ? state.trimStart : null,
      trimEnd: state.trimEnabled ? state.trimEnd : null,
    };
  });

  try {
    await window.framegrab.enqueue({
      items,
      outputDir: state.settings?.downloadDir || null,
    });
    setMessage(
      state.trimEnabled
        ? `Queued trimmed clip (${formatClock(state.trimStart)} → ${formatClock(state.trimEnd)}).`
        : `Queued ${items.length} download${items.length > 1 ? 's' : ''}.`,
      'success'
    );
    switchView('queue');
  } catch (err) {
    setMessage(err.message || String(err), 'error');
  }
}

async function pasteClipboard() {
  const text = await window.framegrab.readClipboardUrl();
  if (!text) {
    setMessage('Clipboard does not contain an http(s) URL.', 'error');
    return;
  }
  let target = state.entries.find((e) => !e.url.trim());
  if (!target) {
    ensureTrailingEmpty();
    target = state.entries[state.entries.length - 1];
  }
  target.url = text;
  renderFields();
  await analyzeEntry(target);
}

function bindTimeline() {
  const timeline = $('timeline');

  const posToTime = (clientX) => {
    const rect = timeline.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return pct * state.duration;
  };

  timeline.addEventListener('pointerdown', (e) => {
    if (!state.trimEnabled || !state.duration) return;
    const handle = e.target.closest('.handle');
    state.drag = handle ? handle.dataset.handle : 'end';
    timeline.setPointerCapture(e.pointerId);
    const t = posToTime(e.clientX);
    if (state.drag === 'start') setTrimBounds(t, state.trimEnd);
    else setTrimBounds(state.trimStart, t);
  });

  timeline.addEventListener('pointermove', (e) => {
    if (!state.drag) return;
    const t = posToTime(e.clientX);
    if (state.drag === 'start') setTrimBounds(t, state.trimEnd);
    else setTrimBounds(state.trimStart, t);
  });

  const endDrag = () => {
    state.drag = null;
  };
  timeline.addEventListener('pointerup', endDrag);
  timeline.addEventListener('pointercancel', endDrag);

  $('trimStartInput').addEventListener('change', () => {
    const t = parseClock($('trimStartInput').value);
    if (t == null) return syncTrimUi();
    setTrimBounds(t, state.trimEnd);
  });
  $('trimEndInput').addEventListener('change', () => {
    const t = parseClock($('trimEndInput').value);
    if (t == null) return syncTrimUi();
    setTrimBounds(state.trimStart, t);
  });
  $('trimReset').addEventListener('click', () => {
    setTrimBounds(0, state.duration);
  });
  $('trimPlay').addEventListener('click', () => {
    setMessage(`Selection length: ${Math.round(state.trimEnd - state.trimStart)} seconds`, 'success');
  });
}

function bindEvents() {
  document.querySelectorAll('.nav').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  $('trimToggle').addEventListener('click', () => {
    if (!state.trimEnabled && !primaryInfo()?.durationSeconds) {
      setMessage('Analyze a video with a known duration before enabling the trimmer.', 'error');
      return;
    }
    setTrimEnabled(!state.trimEnabled);
  });

  $('addVideo').addEventListener('click', () => {
    ensureTrailingEmpty();
    renderFields();
    $('videoFields').querySelector('.video-entry:last-child input')?.focus();
  });

  $('videoFields').addEventListener('input', (e) => {
    const input = e.target.closest('input[data-id]');
    if (!input) return;
    const entry = state.entries.find((x) => x.id === input.dataset.id);
    if (!entry) return;
    entry.url = input.value;
    entry.status = entry.url.trim() ? 'pending' : 'empty';
    refreshStatusOnly();
    if (entry.url.trim()) scheduleAnalyze(entry);
  });

  $('videoFields').addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-url');
    if (!btn) return;
    state.entries = state.entries.filter((x) => x.id !== btn.dataset.id);
    ensureTrailingEmpty();
    renderFields();
    updateSubtitleOptions();
    updateQualityOptions();
    updatePreview();
  });

  $('download').addEventListener('click', startDownload);
  $('pasteClipboard').addEventListener('click', pasteClipboard);
  $('pickFolder').addEventListener('click', () => window.framegrab.pickFolder());
  $('setPickFolder').addEventListener('click', () => window.framegrab.pickFolder());
  $('openFolder').addEventListener('click', async () => {
    const dir = state.settings?.downloadDir;
    if (dir) await window.framegrab.openPath(dir);
  });
  $('clearFinished').addEventListener('click', () => window.framegrab.clearFinished());

  $('saveSettings').addEventListener('click', async () => {
    await window.framegrab.updateSettings({
      format: $('setFormat').value,
      quality: $('setQuality').value,
      concurrency: Number($('setConcurrency').value) || 1,
    });
    $('settingsMsg').textContent = 'Preferences saved.';
  });

  $('copyToken').addEventListener('click', async () => {
    const token = $('bridgeToken').value;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      $('settingsMsg').textContent = 'Bridge token copied.';
    } catch (_) {
      $('bridgeToken').select();
      $('settingsMsg').textContent = 'Select the token and copy manually.';
    }
  });

  $('regenToken').addEventListener('click', async () => {
    const token = await window.framegrab.regenerateToken();
    $('bridgeToken').value = token;
    $('settingsMsg').textContent = 'New bridge token generated.';
  });

  $('jobList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { id, act } = btn.dataset;
    if (act === 'cancel') await window.framegrab.cancel(id);
    if (act === 'retry') await window.framegrab.retry(id);
    if (act === 'remove') await window.framegrab.remove(id);
    if (act === 'folder') {
      const job = state.jobs.find((j) => j.id === id);
      if (job?.outputPath) await window.framegrab.showItem(job.outputPath);
      else if (job?.outputDir) await window.framegrab.openPath(job.outputDir);
    }
  });

  bindTimeline();
}

async function boot() {
  ensureTrailingEmpty();
  bindEvents();
  renderFields();
  switchView('add');
  window.framegrab.onStateChanged(applySnapshot);
  const snapshot = await window.framegrab.getState();
  applySnapshot(snapshot);
  const clip = await window.framegrab.readClipboardUrl();
  if (clip && /youtube\.com|youtu\.be/i.test(clip) && !state.entries[0].url.trim()) {
    state.entries[0].url = clip;
    renderFields();
    await analyzeEntry(state.entries[0]);
  }
}

boot().catch((err) => setMessage(err.message || String(err), 'error'));
