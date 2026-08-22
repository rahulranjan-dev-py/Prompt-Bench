// Preload for the settings window only. A separate, much smaller surface than
// the main app's preload: this window has no business reaching window.storage
// or the provider proxy.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (cfg) => ipcRenderer.invoke('settings:save', cfg),
  close: () => ipcRenderer.send('settings:close'),
});
