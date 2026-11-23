import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('taurusWorkCursor', Object.freeze({
  on(cb: (data: unknown) => void) { ipcRenderer.on('taurus-work-cursor', (_event, data: unknown) => cb(data)); },
}));
