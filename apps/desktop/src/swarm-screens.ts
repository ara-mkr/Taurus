import { BrowserWindow, ipcMain, screen, type Display } from 'electron';
import { join } from 'node:path';

// Helpers on every screen (owner, November 5, 2026: "kinda like if u have multipe monitors it will like travel through
// the different screens pull up tabs and all that stuff"). Off by default, a switch in the tray menu. While a swarm is
// out, each other display gets a transparent, click-through window above everything that draws the helpers working
// there: their cursor, and a card with the picture of their own page in Taurus's browser. The windows only draw. They
// can't be clicked, take focus or read anything: no screen capture, no real mouse, no other app touched. Their data
// comes from the local server's /api/swarm/stream, through this process; the page itself reaches nothing.

// Which screen a helper works on: -1 is the one with Taurus's window. Same rule as apps/web/src/components/Swarm.tsx.
export const screenFor = (n: number, others: number) => (others ? ((n - 1) % (others + 1)) - 1 : -1);

interface Swarm { id: string; state: string; helpers: { id: string; n: number; state: string }[] }
type Message = { event: string; data: unknown };

const centre = (d: Display) => ({ x: d.bounds.x + d.bounds.width / 2, y: d.bounds.y + d.bounds.height / 2 });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function swarmScreens(options: { here: string; local: string; on: () => boolean; main: () => BrowserWindow | null; quitting: () => boolean; origin?: () => Electron.Rectangle | undefined }) {
  const overlays = new Map<number, BrowserWindow>();
  let swarm: Swarm | null = null;
  const frames = new Map<string, string>();
  let following = false;
  let watched: BrowserWindow | null = null;
  let stream: AbortController | undefined;
  let closing: NodeJS.Timeout | undefined;

  const home = () => { const w = options.main(); return w && !w.isDestroyed() ? screen.getDisplayMatching(w.getBounds()) : screen.getPrimaryDisplay(); };
  const others = () => { const h = home(); return screen.getAllDisplays().filter(d => d.id !== h.id); };
  const targets = () => { const m = options.main(); return [...others(), ...(!m || !m.isVisible() || m.isMinimized() ? [home()] : [])]; };
  // From this screen, which way each other one lies.
  const away = () => { const h = centre(home()); return options.on() ? others().map(d => ({ dx: centre(d).x - h.x, dy: centre(d).y - h.y })) : []; };

  const tell = () => { const w = options.main(); if (w && !w.isDestroyed()) w.webContents.send('swarm-screens', away()); };
  ipcMain.handle('swarm-screens', () => away());

  function greet(win: BrowserWindow, d: Display, index: number, count: number) {
    const h = centre(home()), c = centre(d);
    const anchor = options.origin?.();
    const origin = d.id === home().id ? { x: anchor ? anchor.x + anchor.width / 2 - d.bounds.x : d.bounds.width / 2, y: anchor ? anchor.y + anchor.height - d.bounds.y : 0 } : undefined;
    win.webContents.send('swarm-overlay', { event: 'hello', data: { index, others: count, toHome: { dx: h.x - c.x, dy: h.y - c.y }, origin, swarm, frames: Object.fromEntries(frames) } });
  }
  function overlayFor(d: Display, index: number, count: number) {
    const win = new BrowserWindow({
      ...d.bounds, transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      focusable: false, skipTaskbar: true, show: false, backgroundColor: '#00000000', title: 'Taurus helpers',
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: false, preload: join(options.here, 'overlay-preload.cjs') },
    });
    // Clicks fall through to whatever is underneath; it sits above full-screen apps and on every Space.
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.once('did-finish-load', () => { if (!win.isDestroyed()) { win.showInactive(); greet(win, d, index, count); } });
    void win.loadFile(join(options.here, 'overlay.html'));
    overlays.set(d.id, win);
  }
  function closeAll() {
    clearTimeout(closing); closing = undefined;
    for (const win of overlays.values()) if (!win.isDestroyed()) win.destroy();
    overlays.clear();
  }

  function forward(message: Message) {
    if (message.event === 'swarm') {
      const next = message.data as Swarm | null;
      if (!next || next.id !== swarm?.id) frames.clear();
      swarm = next;
    } else if (message.event === 'helper' && swarm) {
      const h = message.data as Swarm['helpers'][number];
      swarm.helpers = swarm.helpers.map(x => (x.id === h.id ? h : x));
    } else if (message.event === 'frame') {
      const f = message.data as { id: string; frame: string };
      frames.set(f.id, f.frame);
    }
    const list = targets();
    for (const [id, win] of overlays) if (!list.some(d => d.id === id)) { win.destroy(); overlays.delete(id); }
    const busy = swarm?.state === 'running' || swarm?.state === 'merging';
    if (busy && options.on() && list.length) {
      clearTimeout(closing); closing = undefined;
      list.forEach(d => { if (!overlays.has(d.id)) overlayFor(d, d.id === home().id ? -1 : others().findIndex(x => x.id === d.id), others().length); });
    } else if (overlays.size && !closing) {
      // Time for the last helpers to leave each screen and head home.
      closing = setTimeout(() => { closing = undefined; if (!(swarm?.state === 'running' || swarm?.state === 'merging')) closeAll(); }, 4500);
    }
    for (const win of overlays.values()) if (!win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send('swarm-overlay', message);
  }

  // Follows the swarm while the switch is on.
  async function follow() {
    if (following) return;
    following = true;
    while (options.on() && !options.quitting()) {
      try {
        stream = new AbortController();
        const response = await fetch(`${options.local}/api/swarm/stream`, { signal: stream.signal, headers: { Accept: 'text/event-stream' } });
        if (!response.ok || !response.body) throw new Error(String(response.status));
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done || !options.on()) break;
          buffer += value;
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const event = block.match(/^event: (\w+)$/m)?.[1];
            const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
            if (event && data) { try { forward({ event, data: JSON.parse(data) }); } catch { /* malformed event */ } }
          }
        }
        await reader.cancel().catch(() => undefined);
      } catch { /* server restarting or not up yet */ }
      if (options.on()) await sleep(2000);
    }
    following = false;
    closeAll();
  }

  // Screens come and go: tell the dashboard which way they lie now, and drop an overlay whose screen is gone.
  const changed = () => {
    tell();
    for (const [id, win] of overlays) if (!screen.getAllDisplays().some(d => d.id === id)) { win.destroy(); overlays.delete(id); }
  };
  screen.on('display-added', changed);
  screen.on('display-removed', changed);
  screen.on('display-metrics-changed', changed);
  return {
    // After the switch changes or the window loads.
    sync() {
      tell();
      const m = options.main();
      if (m && m !== watched) {
        watched = m;
        // Electron can emit show/hide before isVisible settles; reconcile on the next turn.
        const visibility = () => setImmediate(() => forward({ event: 'visibility', data: null }));
        m.on('show', visibility); m.on('hide', visibility); m.on('minimize', visibility); m.on('restore', visibility);
      }
      if (options.on()) { void follow(); forward({ event: 'visibility', data: null }); }
      else { stream?.abort(); closeAll(); }
    },
    closeAll() { stream?.abort(); closeAll(); },
  };
}
