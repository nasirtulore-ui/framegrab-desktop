'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { QueueStore } = require('./queue');
const { YtDlpEngine } = require('./engine/ytdlp');
const { resolveYtDlp, resolveFfmpeg, iconPath } = require('./paths');

let mainWindow = null;
let store = null;
let engine = null;
let pumping = false;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function broadcastState() {
  send('state:changed', {
    settings: store.getSettings(),
    jobs: store.listJobs(),
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: 'FrameGrab',
    backgroundColor: '#eef3ef',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function pumpQueue() {
  if (pumping) return;
  pumping = true;
  try {
    while (true) {
      const settings = store.getSettings();
      const limit = Math.max(1, Number(settings.concurrency) || 1);
      if (store.activeCount() >= limit) break;
      const job = store.nextQueued();
      if (!job) break;
      store.updateJob(job.id, { status: 'downloading', percent: 0, error: null });
      broadcastState();
      try {
        if (!job.outputDir) {
          throw new Error('No download folder selected.');
        }
        await engine.download(job, {
          onProgress: (p) => {
            store.updateJob(job.id, {
              status: 'downloading',
              percent: p.percent ?? 0,
              speed: p.speed,
              eta: p.eta,
            });
            broadcastState();
          },
        });
        store.updateJob(job.id, {
          status: 'complete',
          percent: 100,
          speed: null,
          eta: null,
        });
      } catch (err) {
        if (err && err.cancelled) {
          store.updateJob(job.id, { status: 'cancelled', error: 'Cancelled' });
        } else {
          store.updateJob(job.id, {
            status: 'failed',
            error: err.message || String(err),
          });
        }
      }
      broadcastState();
    }
  } finally {
    pumping = false;
    if (store.nextQueued() && store.activeCount() < (store.getSettings().concurrency || 1)) {
      setImmediate(pumpQueue);
    }
  }
}

function registerIpc() {
  ipcMain.handle('app:getState', () => ({
    settings: store.getSettings(),
    jobs: store.listJobs(),
    bins: {
      ytDlp: resolveYtDlp(),
      ffmpeg: resolveFfmpeg(),
      ytDlpOk: fs.existsSync(resolveYtDlp()),
      ffmpegOk: fs.existsSync(resolveFfmpeg()),
    },
  }));

  ipcMain.handle('settings:update', (_e, patch) => {
    const next = store.updateSettings(patch || {});
    broadcastState();
    return next;
  });

  ipcMain.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose download folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const dir = result.filePaths[0];
    store.updateSettings({ downloadDir: dir });
    broadcastState();
    return dir;
  });

  ipcMain.handle('clipboard:readUrl', () => {
    const text = (clipboard.readText() || '').trim();
    if (/^https?:\/\//i.test(text)) return text;
    return null;
  });

  ipcMain.handle('media:analyze', async (_e, url) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('Enter a valid http(s) URL.');
    }
    try {
      return await engine.analyze(String(url).trim());
    } catch (err) {
      throw new Error(err.message || String(err));
    }
  });

  ipcMain.handle('queue:enqueue', async (_e, payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) throw new Error('No videos to download.');
    let outputDir = payload.outputDir || store.getSettings().downloadDir;
    if (!outputDir) {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose where to save downloads',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (picked.canceled || !picked.filePaths[0]) {
        throw new Error('Download cancelled — no folder selected.');
      }
      outputDir = picked.filePaths[0];
      store.updateSettings({ downloadDir: outputDir });
    }
    const created = store.addJobs(
      items.map((it) => ({
        ...it,
        outputDir,
        format: it.format || store.getSettings().format,
        quality: it.quality || store.getSettings().quality,
        subtitle: it.subtitle ?? store.getSettings().subtitle,
      }))
    );
    broadcastState();
    setImmediate(pumpQueue);
    return created;
  });

  ipcMain.handle('queue:cancel', (_e, id) => {
    engine.cancel(id);
    const job = store.getJob(id);
    if (job && (job.status === 'queued' || job.status === 'downloading')) {
      store.updateJob(id, { status: 'cancelled', error: 'Cancelled' });
      broadcastState();
    }
    return true;
  });

  ipcMain.handle('queue:retry', (_e, id) => {
    const job = store.getJob(id);
    if (!job) return false;
    store.updateJob(id, {
      status: 'queued',
      percent: 0,
      error: null,
      speed: null,
      eta: null,
    });
    broadcastState();
    setImmediate(pumpQueue);
    return true;
  });

  ipcMain.handle('queue:remove', (_e, id) => {
    engine.cancel(id);
    store.removeJob(id);
    broadcastState();
    return true;
  });

  ipcMain.handle('queue:clearFinished', () => {
    store.clearFinished();
    broadcastState();
    return true;
  });

  ipcMain.handle('shell:openPath', async (_e, target) => {
    if (!target) return false;
    await shell.openPath(target);
    return true;
  });

  ipcMain.handle('shell:showItem', (_e, target) => {
    if (!target || !fs.existsSync(target)) return false;
    shell.showItemInFolder(target);
    return true;
  });

  ipcMain.handle('engine:update', async () => {
    await engine.selfUpdate();
    return true;
  });
}

app.whenReady().then(() => {
  store = new QueueStore(app.getPath('userData'));
  if (!store.getSettings().downloadDir) {
    store.updateSettings({
      downloadDir: path.join(app.getPath('downloads'), 'FrameGrab'),
    });
  }
  engine = new YtDlpEngine({
    ytDlpPath: resolveYtDlp(),
    ffmpegPath: resolveFfmpeg(),
  });
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
