'use strict';

const state = {
  entries: [],
  analyses: new Map(),
  settings: null,
  jobs: [],
  analyzing: false,
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

function updateDownloadButton() {
  const n = readyInfos().length;
  $('download').disabled = n === 0 || state.analyzing;
  $('downloadLabel').textContent = n <= 1 ? 'Download' : `Download ${n} videos`;
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
    : 'N/A by default. After analysis, available languages appear.';
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
      return `<div class="job-card">
        <div class="job-main">
          ${job.thumbnail ? `<img class="job-thumb" src="${escapeAttr(job.thumbnail)}" alt="" />` : '<div class="job-thumb placeholder"></div>'}
          <div class="job-copy">
            <strong>${escapeHtml(job.title)}</strong>
            <span>${escapeHtml(job.url)}</span>
            <span class="job-meta">${escapeHtml(job.format)} · ${escapeHtml(qualityLabel)}${job.speed ? ` · ${escapeHtml(job.speed)}` : ''}${job.eta ? ` · ETA ${escapeHtml(job.eta)}` : ''}</span>
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
  if (snapshot.bins) {
    const ok = snapshot.bins.ytDlpOk && snapshot.bins.ffmpegOk;
    $('binStatus').textContent = ok
      ? 'yt-dlp · FFmpeg ready'
      : 'Binaries missing — run npm run fetch-bins';
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
    view.classList.toggle('active', active);
  });
}

async function startDownload() {
  const ready = validEntries().filter((e) => state.analyses.get(e.url)?.ok);
  if (!ready.length) {
    setMessage('Analyze at least one valid URL first.', 'error');
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
    };
  });
  try {
    await window.framegrab.enqueue({
      items,
      outputDir: state.settings?.downloadDir || null,
    });
    setMessage(`Queued ${items.length} download${items.length > 1 ? 's' : ''}.`, 'success');
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

function bindEvents() {
  document.querySelectorAll('.nav').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
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
