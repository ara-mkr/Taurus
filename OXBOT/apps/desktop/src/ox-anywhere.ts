import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { CHARGE_OUT_MS } from '../../web/src/ox-face';

// Ox anywhere (owner, November 16, 2026: "when u say ox on a random app open on screen the ox mascot should appear and
// look like its looking at what ur looking at and nods when understood, it should reply fast"; docs/21-ox-anywhere.md).
//
// When "Hey Ox" or a double clap opens the microphone while another app is in front, Ox charges in at the bottom right
// of the screen you're using (the one with the mouse), in a transparent window that clicks fall through. His eyes
// follow the mouse. When OXBOT accepts the question he nods, thinks, and his answer appears beside him the moment the
// local server has it. He leaves by himself a few seconds after, or on Esc.
//
// It only draws. Everything comes from OXBOT's local stream, which the main process already follows: the voice
// events the notch uses ("listening", "thinking", the answer). The page can't send anything or reach the network.
// The mouse position is read here with Electron's screen API and handed over as a point; nothing on screen is read.

const testing = process.env.OXBOT_ANYWHERE_TEST === '1';
const SIZE = { width: 440, height: 380 };
const MARGIN = 20;
type Phase = 'listening' | 'thinking' | 'answer' | 'error' | 'idle';
interface Options { here: string; main: () => BrowserWindow | null }

export function oxAnywhere(o: Options) {
  let win: BrowserWindow | null = null;
  let ready: Promise<void> = Promise.resolve();
  let shown = false, leaving: NodeJS.Timeout | undefined, idle: NodeJS.Timeout | undefined, gaze: NodeJS.Timeout | undefined;
  let phase: Phase = 'idle';
  let ownEscape = false;
  let lastPoint = { x: NaN, y: NaN };

  const send = (message: Record<string, unknown>) => { if (win && !win.isDestroyed()) void ready.then(() => win?.webContents.send('ox-anywhere', message)); };

  function make() {
    const w = new BrowserWindow({
      ...SIZE, transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      focusable: false, skipTaskbar: true, show: false, backgroundColor: '#00000000', title: 'Ox', roundedCorners: false,
      // A panel floats over full-screen apps without bringing OXBOT's own window forward.
      ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: false, preload: join(o.here, 'ox-anywhere-preload.cjs') },
    });
    w.setIgnoreMouseEvents(true);
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    // Tests draw him but keep him off the screen of whoever runs them; Electron still captures the page.
    if (testing) w.setOpacity(0);
    ready = new Promise(resolve => w.webContents.once('did-finish-load', () => resolve()));
    void w.loadFile(join(o.here, 'ox-anywhere.html'));
    w.on('closed', () => { if (win === w) { win = null; shown = false; } });
    win = w;
    return w;
  }

  // OXBOT's own window in front means the dashboard's Ox is already the one listening.
  function oxbotInFront() {
    const m = o.main();
    return Boolean(m && !m.isDestroyed() && m.isVisible() && m.isFocused());
  }

  function place(w: BrowserWindow) {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    w.setBounds({ x: Math.round(d.x + d.width - SIZE.width - MARGIN), y: Math.round(d.y + d.height - SIZE.height - MARGIN), ...SIZE });
  }

  function follow() {
    clearInterval(gaze);
    gaze = setInterval(() => {
      if (!win || win.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      if (p.x === lastPoint.x && p.y === lastPoint.y) return;
      lastPoint = p;
      const b = win.getBounds();
      send({ kind: 'look', x: p.x - b.x, y: p.y - b.y });
    }, 33);
  }

  function escape(on: boolean) {
    if (testing) return;
    // Helpers in other apps own Esc while one has the mouse; never take it from them.
    if (on && !ownEscape && !globalShortcut.isRegistered('Escape')) ownEscape = globalShortcut.register('Escape', () => dismiss());
    if (!on && ownEscape) { globalShortcut.unregister('Escape'); ownEscape = false; }
  }

  function summon() {
    clearTimeout(leaving);
    const w = win && !win.isDestroyed() ? win : make();
    if (shown) return;
    place(w);
    shown = true;
    lastPoint = { x: NaN, y: NaN };
    send({ kind: 'summon' });
    void ready.then(() => { if (shown && !w.isDestroyed()) w.showInactive(); });
    follow();
    escape(true);
  }

  function dismiss() {
    clearTimeout(idle);
    if (!shown) return;
    shown = false; phase = 'idle';
    clearInterval(gaze);
    escape(false);
    send({ kind: 'dismiss' });
    clearTimeout(leaving);
    leaving = setTimeout(() => { if (!shown && win && !win.isDestroyed()) win.hide(); }, CHARGE_OUT_MS + 260);
  }

  // He goes once nothing more is coming: soon after an empty "Hey Ox", later after an answer, by its length.
  const leaveIn = (ms: number) => { clearTimeout(idle); idle = setTimeout(dismiss, ms); };

  // Only the desktop window's own page may ask to keep hearing while OXBOT is hidden or behind other apps, and only
  // while "Hey Ox" or the double clap is switched on there. Electron keeps a page "visible" (its timers, the clap's
  // loudness checks, the wake word) while background throttling is off.
  ipcMain.on('ox-anywhere:hearing', (e, on: unknown) => {
    const m = o.main();
    if (!m || m.isDestroyed() || e.sender.id !== m.webContents.id) return;
    m.webContents.setBackgroundThrottling(on !== true);
  });

  const api = {
    get shown() { return shown; },
    get phase() { return phase; },
    event(name: string, data: unknown) {
      if (name !== 'voice') return;
      const d = (data ?? {}) as { phase?: string; said?: unknown; text?: unknown };
      const next = d.phase as Phase;
      if (!['listening', 'thinking', 'answer', 'error', 'idle'].includes(next)) return;
      const said = typeof d.said === 'string' ? d.said.slice(0, 200) : '';
      const text = typeof d.text === 'string' ? d.text.slice(0, 600) : '';
      if (next === 'listening') {
        if (!shown && oxbotInFront()) return;
        summon();
        phase = 'listening';
        send({ kind: 'phase', phase, said, text });
        // An open microphone closes on its own after 8 s; he stays a little past that, counted from when he's on screen.
        void ready.then(() => { if (shown && phase === 'listening') leaveIn(12_000); });
        return;
      }
      // Questions typed into the notch or the dashboard don't summon him; they only move him on once he's here.
      if (!shown) return;
      if (next === 'idle') {
        // The microphone closing after a question leaves him thinking or answering.
        if (phase === 'listening') leaveIn(1_400);
        return;
      }
      phase = next;
      send({ kind: 'phase', phase, said, text });
      if (next === 'thinking') leaveIn(90_000);
      else leaveIn(Math.min(18_000, 5_000 + text.length * 45));
    },
    dismiss,
    closeAll() { clearInterval(gaze); clearTimeout(idle); clearTimeout(leaving); escape(false); if (win && !win.isDestroyed()) win.destroy(); win = null; shown = false; },
  };
  // Loaded ahead, hidden, so "Hey Ox" brings him up at once instead of waiting for a page to load.
  setTimeout(() => { if (!win) make(); }, 3_000);
  // Main-process only, for tests/ox-anywhere.spec.ts; the pages can't reach it.
  if (testing) Object.assign(globalThis, { oxAnywhere: api });
  return api;
}
export type OxAnywhere = ReturnType<typeof oxAnywhere>;
