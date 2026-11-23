import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';

// A drawing of the helper that currently owns the real pointer. The bridge is listen-only:
// no screen capture, network, keyboard or input authority lives in this window.
export function workCursor(o: { here: string; origin: () => Rectangle | undefined }) {
  let win: BrowserWindow | null = null;
  let ready = Promise.resolve();
  let closing: NodeJS.Timeout | undefined;
  let active = false;
  let revision = 0;
  const send = (data: unknown) => {
    const w = win;
    void ready.then(() => { if (w && !w.isDestroyed()) w.webContents.send('taurus-work-cursor', data); }).catch(() => undefined);
  };
  function start(name: string, colour: string, app: string) {
    clearTimeout(closing);
    const rev = ++revision;
    active = true;
    const pointer = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(pointer);
    const bounds = display.bounds;
    if (!win || win.isDestroyed()) {
      const w = new BrowserWindow({ ...bounds, title: 'Taurus working', transparent: true, frame: false, hasShadow: false,
        resizable: false, movable: false, focusable: false, skipTaskbar: true, show: false,
        backgroundColor: '#00000000', ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false,
          preload: join(o.here, 'work-cursor-preload.cjs') } });
      w.setIgnoreMouseEvents(true);
      w.setAlwaysOnTop(true, 'screen-saver');
      w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      ready = w.loadFile(join(o.here, 'work-cursor.html'));
      win = w;
    }
    win.setBounds(bounds);
    const anchor = o.origin();
    // On another display the cursor arrives from the edge facing the menu bar.
    const origin = { x: Math.max(0, Math.min(bounds.width - 24, (anchor ? anchor.x + anchor.width / 2 : bounds.x + bounds.width / 2) - bounds.x)),
      y: Math.max(0, Math.min(bounds.height - 24, (anchor ? anchor.y + anchor.height : bounds.y) - bounds.y)) };
    send({ kind: 'start', name, colour, app, origin, point: { x: pointer.x - bounds.x, y: pointer.y - bounds.y } });
    const w = win;
    void ready.then(() => { if (active && rev === revision && !w.isDestroyed()) w.showInactive(); }).catch(() => undefined);
  }
  function point(p: { x: number; y: number }) {
    if (!active || !win || win.isDestroyed()) return;
    const display = screen.getDisplayNearestPoint(p);
    const current = win.getBounds();
    const switched = current.x !== display.bounds.x || current.y !== display.bounds.y || current.width !== display.bounds.width || current.height !== display.bounds.height;
    if (switched) win.setBounds(display.bounds);
    const b = win.getBounds();
    const anchor = switched ? o.origin() : undefined;
    const origin = anchor ? { x: Math.max(0, Math.min(b.width - 24, anchor.x + anchor.width / 2 - b.x)), y: Math.max(0, Math.min(b.height - 24, anchor.y + anchor.height - b.y)) } : undefined;
    send({ kind: 'point', origin, point: { x: p.x - b.x, y: p.y - b.y } });
  }
  function finish(status = 'Finished') {
    clearTimeout(closing);
    active = false;
    ++revision;
    send({ kind: 'finish', status });
    closing = setTimeout(() => { if (!active && win && !win.isDestroyed()) win.hide(); }, 650);
  }
  return { start, point, finish, close() { clearTimeout(closing); active = false; ++revision; win?.destroy(); win = null; } };
}
