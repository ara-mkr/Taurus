import { contextBridge, ipcRenderer } from 'electron';

// The helpers' overlay on another screen (November 5, 2026) only listens: it hears the swarm from Taurus's main process
// and draws it. It can't send anything back, open anything or read the screen.
contextBridge.exposeInMainWorld('taurusOverlay', Object.freeze({
  on(cb: (message: { event: string; data: unknown }) => void) { ipcRenderer.on('swarm-overlay', (_event, message) => cb(message)); },
}));
