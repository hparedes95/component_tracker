const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  fetchPrice: (url) => ipcRenderer.invoke('price:fetch', url),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onAutoRefresh: (cb) => ipcRenderer.on('auto-refresh', cb)
});
