import { BrowserWindow, ipcMain, screen, type Display, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { cleanNotch, geometry, notchScreens, type Geometry, type NotchSettings, type NotchState, type Screen } from './notch-settings';

// Ox in the notch (owner, November 6, 2026). A black pill hugging the MacBook's camera notch, with Ox beside it; on
// hover or click it opens into a small assistant: Ox listening, thinking and his last answer, what's playing, timers,
// and a box to ask him something. On a screen without a notch it is a small pill at the top centre.
//
// Each chosen screen gets one transparent window above the menu bar, on every Space. Clicks fall through it except
// on the pill itself. Its page reaches nothing on its own: the main process reads OXBOT's local stream, hands it
// what to draw, and asks OXBOT's local server for it. Nothing here sends, posts or buys: asking goes through the same
// /api/ask as Talk, with the same approval cards.

const mac = process.platform === 'darwin';
// Tests draw the notch but keep it invisible on the screen of whoever runs them and never let it take the real mouse;
// Electron still captures its content for screenshots (owner, November 6, 2026: a test's stand-in wallpaper showed up).
const testing = process.env.OXBOT_NOTCH_TEST === '1';
type Voice = NotchState['voice'];
interface Options {
  here: string; local: string;
  load: () => unknown; save: (s: NotchSettings) => void;
  openDashboard: () => void; changed: () => void;
}

export function notchService(o: Options) {
  let settings = cleanNotch(o.load());
  const windows = new Map<number, { win: BrowserWindow; geometry: Geometry }>();
  let voice: Voice = null;
  let music: NotchState['music'] = null;
  const timers = new Map<string, NotchState['timers'][number]>();
  let connected = false;
  // A few turns, so "and tomorrow?" follows on from the last question asked here.
  let turns: { role: 'user' | 'assistant'; text: string }[] = [];

  // The native notch (November 17, 2026, docs/20-native-notch.md): OxNotch, ported from Vorssaint, once it has been
  // built (apps/notch-mac/build.sh). It follows OXBOT's local streams itself, over loopback; this process only starts
  // it, hands it the settings, and opens the dashboard or saves settings when it asks. If it isn't built, tests are
  // running, OXBOT_NATIVE_NOTCH=0, or it dies on start three times, the Electron notch below draws Ox instead.
  let nativeFile = mac && !testing && process.env.OXBOT_NATIVE_NOTCH !== '0' ? findNative(o.here) : undefined;
  let native: ChildProcess | null = null;
  let nativeFailures = 0, closed = false;
  const tellNative = (message: unknown) => { if (native?.stdin?.writable) native.stdin.write(`${JSON.stringify(message)}\n`); };
  function startNative(file: string) {
    const child = spawn(file, ['--managed', '--server', o.local, '--settings', JSON.stringify(settings)], { stdio: ['pipe', 'pipe', 'inherit'] });
    native = child;
    const started = Date.now();
    let buffer = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const m = JSON.parse(line) as { do?: string; settings?: unknown };
          if (m.do === 'dashboard') openOxbot((m as { page?: string }).page === 'notch' ? 'notch' : undefined);
          else if (m.do === 'save') { update(m.settings); tellNative({ settings }); }
        } catch { /* not a request */ }
      }
    });
    child.on('error', () => undefined);
    child.on('exit', () => {
      if (native !== child) return;
      native = null;
      if (Date.now() - started < 10_000 && ++nativeFailures >= 3) nativeFile = undefined;
      if (!closed) setTimeout(sync, 1000);
    });
  }
  function stopNative() { const child = native; native = null; child?.stdin?.end(); child?.kill(); }

  const toScreen = (d: Display): Screen => ({ id: d.id, internal: d.internal, primary: d.id === screen.getPrimaryDisplay().id, bounds: d.bounds, workArea: d.workArea });
  const stateFor = (g: Geometry): NotchState => ({ settings, geometry: g, voice, music, timers: [...timers.values()], connected });
  function tell() {
    for (const { win, geometry: g } of windows.values()) if (!win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send('notch:state', stateFor(g));
  }
  const apply = (win: BrowserWindow) => {
    // skipTransformProcessType: without it Electron turns the whole app into a background helper with no Dock icon
    // (owner, November 7, 2026: "why can i not see the app icon in the bottom"). A panel floats over full-screen
    // apps on its own.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: settings.overFullScreen, skipTransformProcessType: true });
    win.setAlwaysOnTop(true, 'screen-saver');
    // "Show in screenshots and recordings" off hides it from captures and screen sharing.
    win.setContentProtection(!settings.inCaptures);
  };

  function make(s: Screen) {
    const g = geometry(s, settings);
    const win = new BrowserWindow({
      ...g.window, transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, show: false, backgroundColor: '#00000000', title: 'Ox', enableLargerThanScreen: true, roundedCorners: false,
      // A panel on macOS floats over full-screen apps and takes typing without bringing OXBOT's main window forward.
      ...(mac ? { type: 'panel' as const } : {}),
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: false, preload: join(o.here, 'notch-preload.cjs') },
    });
    win.setIgnoreMouseEvents(true, { forward: true });
    if (testing) win.setOpacity(0);
    apply(win);
    // Over the menu bar, flush with the top of the screen, where the camera is.
    win.setBounds(g.window);
    win.webContents.once('did-finish-load', () => { if (!win.isDestroyed()) { win.showInactive(); win.webContents.send('notch:state', stateFor(g)); } });
    void win.loadFile(join(o.here, 'notch.html'));
    windows.set(s.id, { win, geometry: g });
  }

  function sync() {
    if (closed) return;
    if (nativeFile) {
      for (const { win } of windows.values()) if (!win.isDestroyed()) win.destroy();
      windows.clear();
      if (!settings.on) stopNative(); else if (!native) startNative(nativeFile); else tellNative({ settings });
      return;
    }
    const screens = screen.getAllDisplays().map(toScreen);
    const want = notchScreens(screens, settings);
    for (const [id, { win }] of windows) if (!want.some(s => s.id === id)) { if (!win.isDestroyed()) win.destroy(); windows.delete(id); }
    for (const s of want) {
      const have = windows.get(s.id);
      if (!have || have.win.isDestroyed()) { make(s); continue; }
      have.geometry = geometry(s, settings);
      have.win.setBounds(have.geometry.window);
      apply(have.win);
    }
    tell();
  }

  // Only the notch's own pages may use these.
  const mine = (e: IpcMainEvent | IpcMainInvokeEvent) => [...windows.values()].find(w => !w.win.isDestroyed() && w.win.webContents.id === e.sender.id)?.win;
  ipcMain.on('notch:hit', (e, on: unknown) => { if (!testing) mine(e)?.setIgnoreMouseEvents(on !== true, { forward: true }); });
  ipcMain.on('notch:focus', e => { const w = mine(e); if (w && !testing) { w.setIgnoreMouseEvents(false); w.focus(); } });
  ipcMain.on('notch:open', e => { if (mine(e)) o.openDashboard(); });
  // From either notch's own settings page: merged, checked field by field, saved.
  function update(partial: unknown) {
    const p = (partial && typeof partial === 'object' ? partial : {}) as Partial<NotchSettings>;
    settings = cleanNotch({ ...settings, ...p, show: { ...settings.show, ...(p.show ?? {}) } }, settings);
    o.save(settings);
    sync();
    o.changed();
    return settings;
  }
  ipcMain.handle('notch:save', (e, partial: unknown) => (mine(e) ? update(partial) : settings));

  // Settings > Notch in OXBOT's own window (November 17, 2026): only that page, on OXBOT's origin, may read or
  // change these. The native notch's Settings button opens it.
  const oxbotPage = (url: string) => {
    try { const u = new URL(url), l = new URL(o.local); return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === l.port && u.protocol === 'http:'; } catch { return false; }
  };
  ipcMain.handle('notch:settings', (e, partial?: unknown) => {
    if (!oxbotPage(e.sender.getURL())) return null;
    if (partial !== undefined) update(partial);
    return { ...settings, nativeNotch: Boolean(native) };
  });
  function openOxbot(page?: 'notch') {
    o.openDashboard();
    if (!page) return;
    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && oxbotPage(w.webContents.getURL()));
    void win?.webContents.executeJavaScript(`location.hash = ${JSON.stringify(page)}`).catch(() => undefined);
  }
  async function ask(text: string, via: 'talk' | 'ask', remember: boolean): Promise<{ text: string } | { error: string }> {
    const question = text.trim().slice(0, 500);
    if (!question) return { error: 'Ask something.' };
    const next = [...(remember ? turns : []), { role: 'user' as const, text: question }];
    try {
      const r = await fetch(`${o.local}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-oxbot': '1' }, body: JSON.stringify({ turns: next, via }), signal: AbortSignal.timeout(90_000) });
      const body = await r.json().catch(() => ({})) as { text?: string; error?: string };
      if (!r.ok || typeof body.text !== 'string') return { error: body.error ?? `OXBOT said ${r.status}.` };
      if (remember) turns = [...next, { role: 'assistant' as const, text: body.text }].slice(-6);
      return { text: body.text };
    } catch { return { error: 'OXBOT isn’t answering. Is it still running?' }; }
  }
  // A question typed into the notch counts as spoken: OXBOT tells every notch it's thinking, then the answer.
  ipcMain.handle('notch:ask', (e, text: unknown) => (mine(e) ? ask(String(text ?? ''), 'talk', true) : { error: 'Not allowed.' }));
  // The music and timer buttons say the same words you would: "pause", "next", "cancel the pasta timer".
  ipcMain.handle('notch:say', (e, text: unknown) => {
    const t = String(text ?? '');
    if (!mine(e) || !/^(?:pause|resume|next|previous|cancel the .{1,80} timer)$/.test(t)) return { error: 'Not allowed.' };
    return ask(t, 'ask', false);
  });

  screen.on('display-added', sync);
  screen.on('display-removed', sync);
  screen.on('display-metrics-changed', sync);

  return {
    sync,
    get settings() { return settings; },
    set(partial: Partial<NotchSettings>) { settings = cleanNotch({ ...settings, ...partial }, settings); o.save(settings); sync(); },
    // Opens the notch on the first screen at its settings (from the tray menu).
    showSettings() {
      if (!settings.on) { settings = { ...settings, on: true }; o.save(settings); sync(); }
      // With the native notch, its settings live in OXBOT's own window.
      if (nativeFile) { openOxbot('notch'); return; }
      const first = windows.values().next().value;
      if (!first) return;
      const go = () => { if (!testing) { first.win.setIgnoreMouseEvents(false); first.win.focus(); } first.win.webContents.send('notch:command', 'settings'); };
      if (first.win.webContents.isLoading()) first.win.webContents.once('did-finish-load', () => setTimeout(go, 50)); else go();
    },
    // From OXBOT's local stream, which the main process already follows for rings.
    connection(on: boolean) { if (connected !== on) { connected = on; tell(); } },
    event(name: string, data: unknown) {
      const d = data as Record<string, unknown>;
      if (name === 'voice') {
        const phase = d.phase as NonNullable<Voice>['phase'];
        // The microphone closing after an answer leaves the answer up.
        if (phase === 'idle' && voice && voice.phase !== 'listening') return;
        voice = { phase, said: typeof d.said === 'string' ? d.said : undefined, text: typeof d.text === 'string' ? d.text : undefined, at: String(d.at ?? new Date().toISOString()) };
      } else if (name === 'window') {
        if (d.kind === 'music') {
          const m = d.music as { playing?: boolean; track?: { title?: string; artist?: string } | null };
          music = m?.track ? { playing: Boolean(m.playing), title: String(m.track.title ?? ''), artist: String(m.track.artist ?? '') } : null;
        } else if (d.kind === 'timer') {
          const t = d.timer as { label?: string; endsAt?: string; focus?: boolean };
          if (d.done) timers.delete(String(d.id)); else timers.set(String(d.id), { id: String(d.id), label: String(t?.label ?? 'Timer'), endsAt: String(t?.endsAt ?? ''), focus: Boolean(t?.focus) });
        } else if (d.kind === 'mac' || d.kind === 'open' || d.kind === 'note') {
          // What an instant command did ("Opening Notes."), when it didn't come with a spoken answer of its own.
          if (!voice || Date.now() - Date.parse(voice.at) > 3000) voice = { phase: 'answer', said: typeof d.said === 'string' ? d.said : undefined, text: String(d.kind === 'open' ? `Opening ${d.name}.` : d.text ?? d.title ?? ''), at: new Date().toISOString() };
        } else return;
      } else if (name === 'window-closed') {
        const id = String(d.id);
        if (id === 'music') music = null; else if (!timers.delete(id)) return;
      } else return;
      tell();
    },
    closeAll() { closed = true; stopNative(); for (const { win } of windows.values()) if (!win.isDestroyed()) win.destroy(); windows.clear(); },
  };
}
export type Notch = ReturnType<typeof notchService>;

// OxNotch beside the bundled main process (copied there by scripts/bundle.mjs, outside the asar when packaged), or
// straight from apps/notch-mac's build when running from source.
function findNative(here: string) {
  const unpacked = here.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
  return [join(unpacked, 'OxNotch'), join(here, '../../notch-mac/.build/release/OxNotch')].find(file => existsSync(file));
}
