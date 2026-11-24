import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { CHARGE_OUT_MS } from '../../web/src/taurus-face';

// Taurus anywhere (owner, November 16, 2026: "when u say taurus on a random app open on screen the taurus mascot should appear and
// look like its looking at what ur looking at and nods when understood, it should reply fast"; docs/21-taurus-anywhere.md).
//
// When "Hey Taurus" or a double clap opens the microphone while another app is in front, Taurus charges in beside the mouse on
// the screen you're using, then walks to its bottom right, in a transparent window that clicks fall through. His eyes
// follow the mouse. When Taurus accepts the question he nods, thinks, and his answer appears beside him the moment the
// local server has it. He leaves by himself a few seconds after, or on Esc.
//
// It only draws. Everything comes from Taurus's local stream, which the main process already follows: the voice
// events the notch uses ("listening", "thinking", the answer). The page can't send anything or reach the network.
// The mouse position is read here with Electron's screen API and handed over as a point; nothing on screen is read.

const testing = process.env.TAURUS_ANYWHERE_TEST === '1';
const SIZE = { width: 440, height: 380 };
const MARGIN = 20;
type Phase = 'listening' | 'thinking' | 'answer' | 'error' | 'idle';
interface Options { here: string; main: () => BrowserWindow | null }

export function taurusAnywhere(o: Options) {
  let win: BrowserWindow | null = null;
  let ready: Promise<void> = Promise.resolve();
  let shown = false, leaving: NodeJS.Timeout | undefined, idle: NodeJS.Timeout | undefined, gaze: NodeJS.Timeout | undefined;
  let phase: Phase = 'idle';
  let ownEscape = false;
  let lastPoint = { x: NaN, y: NaN };

  const send = (message: Record<string, unknown>) => { if (win && !win.isDestroyed()) void ready.then(() => win?.webContents.send('taurus-anywhere', message)); };

  function make() {
    const w = new BrowserWindow({
      ...SIZE, transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      focusable: false, skipTaskbar: true, show: false, backgroundColor: '#00000000', title: 'Taurus', roundedCorners: false,
      // A panel floats over full-screen apps without bringing Taurus's own window forward.
      ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: false, preload: join(o.here, 'taurus-anywhere-preload.cjs') },
    });
    w.setIgnoreMouseEvents(true);
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    // Tests draw him but keep him off the screen of whoever runs them; Electron still captures the page.
    if (testing) w.setOpacity(0);
    ready = new Promise(resolve => w.webContents.once('did-finish-load', () => resolve()));
    void w.loadFile(join(o.here, 'taurus-anywhere.html'));
    w.on('closed', () => { if (win === w) { win = null; shown = false; } });
    win = w;
    return w;
  }

  // Taurus's own window in front means the dashboard's Taurus is already the one listening.
  function taurusInFront() {
    const m = o.main();
    return Boolean(m && !m.isDestroyed() && m.isVisible() && m.isFocused());
  }

  // He comes in beside the mouse on the screen you're using, then walks off to that screen's bottom corner (owner,
  // November 19, 2026: "if u have multiple screens it should pop up to wherever u are kinda at near ur cursor but then
  // moves to the side on that monitor"). He is drawn at the bottom right of his window (taurus-anywhere.html).
  const OX_AT = { x: SIZE.width - 22 - 124, y: SIZE.height - 16 - 120 };
  let walk: NodeJS.Timeout | undefined, toSide: NodeJS.Timeout | undefined;
  let displayId = -1;
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)));
  function place(w: BrowserWindow) {
    clearInterval(walk); clearTimeout(toSide);
    const c = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(c), d = display.workArea;
    displayId = display.id;
    const side = { x: Math.round(d.x + d.width - SIZE.width - MARGIN), y: Math.round(d.y + d.height - SIZE.height - MARGIN) };
    const near = { x: clamp(c.x + 28 - OX_AT.x, d.x, d.x + d.width - SIZE.width), y: clamp(c.y + 28 - OX_AT.y, d.y, d.y + d.height - SIZE.height) };
    w.setBounds({ ...near, ...SIZE });
    // After he has landed, an eased walk to the corner, a frame at a time.
    toSide = setTimeout(() => {
      const from = near, start = Date.now(), ms = testing ? 0 : 650;
      const step = () => {
        if (!shown || w.isDestroyed()) { clearInterval(walk); return; }
        const t = ms ? Math.min(1, (Date.now() - start) / ms) : 1, e = 1 - (1 - t) ** 3;
        w.setBounds({ x: Math.round(from.x + (side.x - from.x) * e), y: Math.round(from.y + (side.y - from.y) * e), ...SIZE });
        if (t >= 1) clearInterval(walk);
      };
      walk = setInterval(step, 16); step();
    }, testing ? 0 : 1_100);
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
    // Already here: he only moves if you've gone to another screen.
    if (shown) { if (screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id !== displayId) place(w); return; }
    shown = true;
    place(w);
    lastPoint = { x: NaN, y: NaN };
    send({ kind: 'summon' });
    // Placed again once showing: macOS can put a hidden window back on the screen it was made on.
    void ready.then(() => { if (shown && !w.isDestroyed()) { const b = w.getBounds(); w.showInactive(); w.setBounds(b); } });
    follow();
    escape(true);
  }

  function dismiss() {
    clearTimeout(idle);
    if (!shown) return;
    shown = false; phase = 'idle';
    clearInterval(gaze); clearInterval(walk); clearTimeout(toSide);
    escape(false);
    send({ kind: 'dismiss' });
    clearTimeout(leaving);
    leaving = setTimeout(() => {
      if (shown || !win || win.isDestroyed()) return;
      win.hide();
      // Gone for two minutes: his window is closed, so its renderer's memory goes back to the Mac.
      const w = win;
      leaving = setTimeout(() => { if (!shown && win === w && !w.isDestroyed()) { w.destroy(); win = null; } }, 120_000);
    }, CHARGE_OUT_MS + 260);
  }

  // He goes once nothing more is coming: soon after an empty "Hey Taurus", later after an answer, by its length.
  const leaveIn = (ms: number) => { clearTimeout(idle); idle = setTimeout(dismiss, ms); };

  // Only the desktop window's own page may ask to keep hearing while Taurus is hidden or behind other apps, and only
  // while "Hey Taurus" or the double clap is switched on there. Electron keeps a page "visible" (its timers, the clap's
  // loudness checks, the wake word) while background throttling is off.
  ipcMain.on('taurus-anywhere:hearing', (e, on: unknown) => {
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
        if (!shown && taurusInFront()) return;
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
    closeAll() { clearInterval(gaze); clearInterval(walk); clearTimeout(toSide); clearTimeout(idle); clearTimeout(leaving); escape(false); if (win && !win.isDestroyed()) win.destroy(); win = null; shown = false; },
  };
  // Made the first time he is called, not at start: a hidden page held its own renderer (about 90 MB) for nothing.
  if (testing) setTimeout(() => { if (!win) make(); }, 3_000);
  // Main-process only, for tests/taurus-anywhere.spec.ts; the pages can't reach it.
  if (testing) Object.assign(globalThis, { taurusAnywhere: api });
  return api;
}
export type TaurusAnywhere = ReturnType<typeof taurusAnywhere>;
