'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ps5', {
  init: () => ipcRenderer.invoke('init'),
  launch: (id, opts) => ipcRenderer.invoke('launch', id, opts || {}),
  quit: (mode) => ipcRenderer.invoke('quit', mode),
  kill: () => ipcRenderer.invoke('kill'),
  pick: (kind, current) => ipcRenderer.invoke('pick', kind, current),
  saveGame: (draft) => ipcRenderer.invoke('game-save', draft),
  moveGame: (id, delta) => ipcRenderer.invoke('game-move', id, delta),
  deleteGame: (id) => ipcRenderer.invoke('game-delete', id),
  saveState: (p) => ipcRenderer.invoke('save-state', p),
  setSetting: (k, v) => ipcRenderer.invoke('set-setting', k, v),
  hideGame: (id) => ipcRenderer.invoke('hide-game', id),
  open: (what, id) => ipcRenderer.invoke('open', what, id),
  window: (cmd) => ipcRenderer.invoke('window', cmd),
  power: (cmd) => ipcRenderer.invoke('power', cmd),
  capture: (file) => ipcRenderer.invoke('capture', file),
  captureDone: () => ipcRenderer.send('capture-done'),
  on: (ch, fn) => { const ok = ['game-started', 'game-exited', 'game-error', 'game-handoff', 'game-returning', 'game-resumed', 'show-home', 'game-paused', 'confirm-quit', 'launch-progress']; if (ok.includes(ch)) ipcRenderer.on(ch, (_e, d) => fn(d)); },
});
