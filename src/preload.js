const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('longroll', {
  getInitial: () => ipcRenderer.invoke('viewer:get-initial'),
  openPath: (target) => ipcRenderer.invoke('viewer:open-path', target),
  openDialog: (opts) => ipcRenderer.invoke('viewer:open-dialog', opts),
  goEpisode: (fromPath, delta) => ipcRenderer.invoke('viewer:go-episode', fromPath, delta),
  pathForFile: (file) => webUtils.getPathForFile(file),
  toggleFullscreen: () => ipcRenderer.invoke('viewer:toggle-fullscreen'),
  exitFullscreen: () => ipcRenderer.invoke('viewer:exit-fullscreen'),
  onOpen: (callback) => ipcRenderer.on('viewer:open', (_e, state) => callback(state)),
  onNav: (callback) => ipcRenderer.on('viewer:nav', (_e, delta) => callback(delta)),
});
