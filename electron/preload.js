'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('framegrab', {
  getState: () => ipcRenderer.invoke('app:getState'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  readClipboardUrl: () => ipcRenderer.invoke('clipboard:readUrl'),
  analyze: (url) => ipcRenderer.invoke('media:analyze', url),
  enqueue: (payload) => ipcRenderer.invoke('queue:enqueue', payload),
  cancel: (id) => ipcRenderer.invoke('queue:cancel', id),
  retry: (id) => ipcRenderer.invoke('queue:retry', id),
  remove: (id) => ipcRenderer.invoke('queue:remove', id),
  clearFinished: () => ipcRenderer.invoke('queue:clearFinished'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  updateEngine: () => ipcRenderer.invoke('engine:update'),
  onStateChanged: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on('state:changed', handler);
    return () => ipcRenderer.removeListener('state:changed', handler);
  },
});
