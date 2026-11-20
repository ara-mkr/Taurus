import { contextBridge, ipcRenderer } from 'electron';

// Taurus anywhere (November 16, 2026; docs/21-taurus-anywhere.md). The overlay page only listens: it hears what to draw from
// Taurus's main process (summon, the voice phase and its words, where the mouse is, dismiss). It can't send anything,
// open anything or read the screen.
contextBridge.exposeInMainWorld('taurusAnywhere', Object.freeze({
  on(cb: (message: Record<string, unknown>) => void) { ipcRenderer.on('taurus-anywhere', (_event, message) => cb(message)); },
}));
