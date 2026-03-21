const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('peonBridge', {
  onEvent: (callback) => ipcRenderer.on('peon-event', (_e, data) => callback(data)),
  onSessionUpdate: (callback) => ipcRenderer.on('session-update', (_e, data) => callback(data)),
  startDrag: () => ipcRenderer.send('drag-start'),
  stopDrag: () => ipcRenderer.send('drag-stop'),
  onConfig: (callback) => ipcRenderer.on('peon-config', (_e, data) => callback(data)),
});
