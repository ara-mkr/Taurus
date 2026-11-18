import { contextBridge, ipcRenderer } from 'electron';

// Ox anywhere (November 16, 2026; docs/21-ox-anywhere.md). The overlay page only listens: it hears what to draw from
// OXBOT's main process (summon, the voice phase and its words, where the mouse is, dismiss). It can't send anything,
// open anything or read the screen.
contextBridge.exposeInMainWorld('oxAnywhere', Object.freeze({
  on(cb: (message: Record<string, unknown>) => void) { ipcRenderer.on('ox-anywhere', (_event, message) => cb(message)); },
}));
