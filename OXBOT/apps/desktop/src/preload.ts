import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

declare const __OXBOT_VERSION__: string;

// The page learns only that it runs inside the desktop app. Nothing here can touch files or the shell.
// Since November 5, 2026 it also hears which way your other screens lie when "Helpers on every screen" is on, so the
// swarm's cursors leave the dashboard towards them. Directions only; nothing about what is on those screens.
type Away = { dx: number; dy: number }[];
contextBridge.exposeInMainWorld('oxbotDesktop', Object.freeze({
  platform: process.platform, version: __OXBOT_VERSION__,
  onSwarmScreens(cb: (away: Away) => void) {
    const listener = (_event: IpcRendererEvent, away: Away) => cb(away);
    ipcRenderer.on('swarm-screens', listener);
    void ipcRenderer.invoke('swarm-screens').then(cb).catch(() => undefined);
    return () => { ipcRenderer.removeListener('swarm-screens', listener); };
  },
  // Settings > Notch (November 17, 2026): read and change Ox's notch settings, nothing else.
  notch: Object.freeze({
    get: () => ipcRenderer.invoke('notch:settings'),
    set: (partial: unknown) => ipcRenderer.invoke('notch:settings', partial),
  }),
}));
