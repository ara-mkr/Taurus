import { contextBridge, ipcRenderer } from 'electron';

// The helpers' overlay on another screen (November 5, 2026) only listens: it hears the swarm from OXBOT's main process
// and draws it. It can't send anything back, open anything or read the screen.
contextBridge.exposeInMainWorld('oxbotOverlay', Object.freeze({
  on(cb: (message: { event: string; data: unknown }) => void) { ipcRenderer.on('swarm-overlay', (_event, message) => cb(message)); },
}));
