import { contextBridge, ipcRenderer } from 'electron';

// Taurus in the notch (November 6, 2026). The page hears what to draw and can ask for exactly these things: let the
// mouse in over the pill, take typing, ask Taurus one question, say one of the fixed music or timer words, save its own
// settings, and bring the Taurus window forward. It can't reach the network, files or anything else.
contextBridge.exposeInMainWorld('taurusNotch', Object.freeze({
  onState(cb: (state: unknown) => void) { ipcRenderer.on('notch:state', (_event, state) => cb(state)); },
  onCommand(cb: (command: string) => void) { ipcRenderer.on('notch:command', (_event, command) => cb(String(command))); },
  hit(on: boolean) { ipcRenderer.send('notch:hit', on === true); },
  focus() { ipcRenderer.send('notch:focus'); },
  ask(text: string) { return ipcRenderer.invoke('notch:ask', String(text).slice(0, 500)); },
  say(text: string) { return ipcRenderer.invoke('notch:say', String(text).slice(0, 120)); },
  save(partial: unknown) { return ipcRenderer.invoke('notch:save', partial); },
  openDashboard() { ipcRenderer.send('notch:open'); },
}));
