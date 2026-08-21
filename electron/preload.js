// Preload script. Runs before the page loads, in an isolated world that shares
// the DOM with the renderer but not its JavaScript globals.
//
// contextBridge is the ONLY way to move things across that boundary. Assigning
// window.storage = {...} directly here would set it on the preload's own
// window object and the React app would never see it.
const { contextBridge, ipcRenderer } = require('electron');

// --- window.storage -------------------------------------------------
// Shape copied exactly from what PromptBench.jsx calls:
//   await window.storage.get(LIB_KEY, false)   -> { value }
//   await window.storage.set(LIB_KEY, str, false) -> truthy
// Exposed under its own global (not nested) because the component checks
// `!!window.storage` at module scope to decide whether saving is available.
contextBridge.exposeInMainWorld('storage', {
  get: (key, isGlobal = false) => ipcRenderer.invoke('storage:get', key, isGlobal),
  set: (key, value, isGlobal = false) => ipcRenderer.invoke('storage:set', key, value, isGlobal),
});

// --- the API bridge -------------------------------------------------
// Only a single narrow method is exposed. The renderer can ask for a
// completion; it cannot read the API key, reach other IPC channels, or touch
// the filesystem. src/host-bridge.js is what turns this into a fetch() shim.
contextBridge.exposeInMainWorld('electronAPI', {
  sendMessages: (body) => ipcRenderer.invoke('anthropic:messages', body),
});
