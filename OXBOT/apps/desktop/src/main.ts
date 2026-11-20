import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, nativeTheme, screen, session, shell, utilityProcess, type MenuItemConstructorOptions, type UtilityProcess } from 'electron';
import { createServer } from 'node:net';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { swarmScreens } from './swarm-screens';
import { handsService } from './hands';
import { notchService, type Notch } from './notch';
import { taurusAnywhere, type TaurusAnywhere } from './taurus-anywhere';
import { randomBytes } from 'node:crypto';

// Taurus on the desktop (owner decision, October 31, 2026, docs/decision-log.md): the same local server and
// dashboard, in one window, with a menu bar or tray item that keeps it ringing after the window closes.
// Unsigned, personal builds. No auto-update, crash reporting or telemetry.

const here = dirname(fileURLToPath(import.meta.url));
const mac = process.platform === 'darwin';
// 8787 always, so OAuth redirects registered at http://localhost:8787 keep working. Tests set another port.
// Renamed from OXBOT (November 19, 2026): old OXBOT_* settings still count, ~/.oxbot moves to ~/.taurus, and the
// window profile (saved sign-ins, settings, window size) moves from the old app's folder, all on the first start.
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith('OXBOT_') && process.env[`TAURUS_${k.slice(6)}`] === undefined) process.env[`TAURUS_${k.slice(6)}`] = v;
}
if (!process.env.TAURUS_HOME) {
  const moveOnce = (from: string, to: string) => { if (!existsSync(to) && existsSync(from)) { try { renameSync(from, to); } catch { /* starts fresh */ } } };
  moveOnce(join(homedir(), '.oxbot'), join(homedir(), '.taurus'));
  moveOnce(join(app.getPath('appData'), 'OXBOT'), app.getPath('userData'));
}
const port = Number(process.env.TAURUS_PORT || 8787);
const origin = `http://localhost:${port}`;
const local = `http://127.0.0.1:${port}`;
const home = process.env.TAURUS_HOME || join(homedir(), '.taurus');
const webRoot = app.isPackaged ? join(process.resourcesPath, 'web') : join(here, '../../web/dist');
// A temporary TAURUS_HOME (tests) gets its own browser profile too, so nothing touches the real one.
if (process.env.TAURUS_HOME) app.setPath('userData', join(process.env.TAURUS_HOME, 'desktop-profile'));

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let server: UtilityProcess | null = null;
let owned = false;
let quitting = false;
let restarting = false;
let lastGesture = 0;
let ringing: { id: string; bounce?: number; note?: Notification; bounds?: Electron.Rectangle } | null = null;

function readJson<T>(file: string, fallback: T): T { try { return { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { return fallback; } }
function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}
// "Let my phone connect" lives with the rest of Taurus's data, shared with pnpm start.
const desktopFile = join(home, 'desktop.json');
const lanOn = () => readJson(desktopFile, { lan: false }).lan === true;
// "Helpers on every screen" (November 5, 2026): off until switched on in the tray menu.
const swarmOn = () => readJson(desktopFile, { swarmScreens: false }).swarmScreens === true;
let swarms: ReturnType<typeof swarmScreens> | null = null;
// Helpers in other apps (November 5, 2026): only the server this app starts gets the token for its private line.
const handsToken = randomBytes(24).toString('hex');
let hands: ReturnType<typeof handsService> | null = null;
// Taurus in the notch (November 6, 2026): on until switched off in its settings or the tray menu.
let notch: Notch | null = null;
// Taurus anywhere (November 16, 2026): Taurus over the app in front when "Hey Taurus" or a double clap wakes him.
let anywhere: TaurusAnywhere | null = null;
interface Bounds { x?: number; y?: number; width: number; height: number; background?: string }
const windowFile = () => join(app.getPath('userData'), 'window.json');

const sameOrigin = (url: string) => { try { return new URL(url).origin === origin; } catch { return false; } };
// Only http and https leave the app, and only to the default browser. Every other scheme is dropped.
function openOutside(url: string) {
  try { const u = new URL(url); if (u.protocol === 'http:' || u.protocol === 'https:') void shell.openExternal(u.toString()); } catch { /* not a URL */ }
}
// Sign-in runs in the browser, where the provider session already lives; the callback returns to Taurus there.
const isSignIn = (url: string) => { try { const path = new URL(url).pathname; return path.startsWith('/api/oauth/start/') || path === '/api/ai/openrouter/start'; } catch { return false; } };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function health(): Promise<{ app?: string } | null> {
  try {
    const r = await fetch(`${local}/api/health`, { signal: AbortSignal.timeout(1500) });
    return await r.json().catch(() => ({}));
  } catch { return null; }
}
const portFree = () => new Promise<boolean>(resolve => {
  const probe = createServer();
  probe.once('error', () => resolve(false));
  probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});

// The server runs as a child process, never inside the window.
function startServer(lan: boolean): Promise<boolean> {
  const child = utilityProcess.fork(join(here, 'server.mjs'), [], {
    serviceName: 'Taurus server', stdio: 'pipe',
    env: { ...process.env, TAURUS_HOST: lan ? '0.0.0.0' : '127.0.0.1', TAURUS_PORT: String(port), TAURUS_PUBLIC_URL: origin, TAURUS_WEB_ROOT: webRoot, TAURUS_APP_URL: '', TAURUS_HANDS_TOKEN: handsToken,
      // Run from source, Taurus's voice (Kokoro) is installed under apps/server, not beside the bundled server.
      ...(app.isPackaged ? {} : { TAURUS_VOICE_MODULES: join(here, '../../server') }) },
  });
  child.stdout?.on('data', data => process.stdout.write(data));
  child.stderr?.on('data', data => process.stderr.write(data));
  server = child; owned = true;
  let exited = false;
  child.once('exit', code => {
    exited = true;
    if (server !== child) return;
    server = null;
    if (quitting || restarting) return;
    console.error(`Taurus server stopped (${code}); starting it again.`);
    setTimeout(() => { if (!quitting && !server) void startServer(lanOn()); }, 1500);
  });
  return (async () => {
    for (let i = 0; i < 75 && !exited; i++) { if ((await health())?.app === 'taurus') return true; await sleep(200); }
    return false;
  })();
}
async function stopServer() {
  const child = server;
  if (!child) return;
  server = null;
  await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill(); setTimeout(resolve, 3000); });
}
async function restartServer(lan: boolean) {
  restarting = true;
  await stopServer();
  await startServer(lan);
  restarting = false;
  win?.webContents.reload();
}

function busyWindow() {
  const page = `<!doctype html><meta charset="utf-8"><title>Taurus</title><body style="font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:48px 32px;background:#07080A;color:#ECEBE6"><h1 style="font-size:20px;margin:0 0 12px">Taurus can’t start</h1><p>Port ${port} is in use by another program. Close it and reopen Taurus.</p>`;
  const busy = new BrowserWindow({ width: 460, height: 260, resizable: false, backgroundColor: '#07080A', title: 'Taurus', webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  void busy.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
  busy.on('closed', () => app.quit());
}

function onScreen(b: Bounds) {
  if (b.x === undefined || b.y === undefined) return false;
  return screen.getAllDisplays().some(({ workArea: a }) => b.x! < a.x + a.width - 80 && b.x! + b.width > a.x + 80 && b.y! >= a.y - 20 && b.y! < a.y + a.height - 80);
}

function createWindow() {
  const saved = readJson<Bounds>(windowFile(), { width: 1280, height: 860 });
  const position = onScreen(saved) ? { x: saved.x, y: saved.y } : {};
  win = new BrowserWindow({
    ...position, width: Math.max(390, saved.width), height: Math.max(640, saved.height), minWidth: 390, minHeight: 640,
    show: false, title: 'Taurus',
    // The page's own background, remembered from last time, so the window never flashes white.
    backgroundColor: saved.background ?? (nativeTheme.shouldUseDarkColors ? '#07080A' : '#E8E6E1'),
    ...(mac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 22, y: 30 } } : {}),
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: false,
      preload: join(here, 'preload.cjs'),
      // The alarm must sound when a ring arrives, without a tap first.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.once('ready-to-show', () => { if (!process.env.TAURUS_DESKTOP_HIDDEN) win?.show(); });
  let saveTimer: NodeJS.Timeout | undefined;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      const background = await win.webContents.executeJavaScript('getComputedStyle(document.body).backgroundColor', false).catch(() => undefined);
      writeJson(windowFile(), { ...win.getNormalBounds(), background: hex(background) ?? saved.background });
    }, 400);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.webContents.on('did-finish-load', saveBounds);
  // The dashboard learns which way your other screens lie, so helpers leave towards them.
  win.webContents.on('did-finish-load', () => swarms?.sync());
  let moved: NodeJS.Timeout | undefined;
  win.on('move', () => { clearTimeout(moved); moved = setTimeout(() => swarms?.sync(), 500); });
  // Closing the window keeps Taurus running in the menu bar or tray, so it can still ring.
  win.on('close', event => { if (!quitting) { event.preventDefault(); win?.hide(); } });
  win.on('closed', () => { win = null; });
  win.webContents.on('input-event', (_event, input) => { if (input.type === 'mouseDown' || input.type === 'keyDown' || input.type === 'rawKeyDown' || input.type === 'touchStart') lastGesture = Date.now(); });
  void win.loadURL(origin);
}
// rgb(7, 8, 10) -> #07080A
function hex(css?: string) {
  const m = css?.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m || m[4] === '0') return undefined;
  return `#${[m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function showWindow() {
  if (!win) createWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (mac) app.focus({ steal: true });
}

// Every window and frame obeys the same rules: stay on Taurus's origin, open real links in the browser.
function guard() {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
    contents.on('will-navigate', event => {
      if (event.url.startsWith('data:') && !contents.getURL()) return;
      if (!sameOrigin(event.url) || isSignIn(event.url)) { event.preventDefault(); openOutside(event.url); }
    });
    contents.on('will-redirect', event => { if (!sameOrigin(event.url)) { event.preventDefault(); openOutside(event.url); } });
    contents.on('will-attach-webview', event => event.preventDefault());
  });
  const ses = session.defaultSession;
  // The microphone (the Talk button) and, since November 1, 2026, the camera (Look in Ask), each for Taurus's own
  // page and only right after a tap or key. Never both in one request, so Look can't open the microphone. Nothing
  // else: no screen, location, notifications prompts, MIDI, USB, HID or serial.
  // Since November 7, 2026 the microphone alone may also open without a tap, for "Hey Taurus" and double clap when they
  // are switched on in Settings (owner: "i said hey taurus nothing happened"); the camera still needs one.
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const types = 'mediaTypes' in details ? details.mediaTypes ?? [] : [];
    const audio = types.length > 0 && types.every(t => t === 'audio'), video = types.length > 0 && types.every(t => t === 'video');
    callback(permission === 'media' && sameOrigin(details.requestingUrl) && (audio || (video && Date.now() - lastGesture < 5000)));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => permission === 'media' && sameOrigin(requestingOrigin) && (details.mediaType === 'audio' || details.mediaType === 'video'));
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}

// The main process listens for rings itself, so a hidden window still comes forward.
async function listen() {
  while (!quitting) {
    try {
      const response = await fetch(`${local}/api/ring/stream`, { headers: { Accept: 'text/event-stream' } });
      if (!response.ok || !response.body) throw new Error(String(response.status));
      notch?.connection(true);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
          const name = block.match(/^event: ([\w-]+)$/m)?.[1];
          if (!name || !data) continue;
          // Rings bring the window forward; Taurus's windows and voice go to the notch.
          // "Open the brain map" said anywhere on the Mac brings the dashboard forward on that page.
          try { if (name === 'go') { if (JSON.parse(data).via !== 'phone') showWindow(); } else if (name === 'ring') onRing(JSON.parse(data)); else { const d = JSON.parse(data); notch?.event(name, d); anywhere?.event(name, d); } } catch { /* malformed event */ }
        }
      }
    } catch { /* server restarting or not up yet */ }
    notch?.connection(false);
    await sleep(2000);
  }
}

interface Ring { id: string; title: string; detail?: string; state: string }
function onRing(ring: Ring) {
  if (ring.state === 'ringing' || ring.state === 'escalated') {
    if (ringing?.id === ring.id) return;
    endRing();
    showWindow();
    ringing = { id: ring.id, bounds: win?.getBounds() };
    takeOver(true);
    if (mac) ringing.bounce = app.dock?.bounce('critical');
    else win?.flashFrame(true);
    if (Notification.isSupported()) {
      const note = new Notification({ title: ring.title, body: ring.detail ?? '', urgency: 'critical' });
      note.on('click', showWindow);
      note.show();
      ringing.note = note;
    }
  } else if (ringing?.id === ring.id) endRing();
}
// "I'm on it" on any device ends it here too.
function endRing() {
  if (!ringing) return;
  if (ringing.bounce !== undefined) app.dock?.cancelBounce(ringing.bounce);
  ringing.note?.close();
  win?.flashFrame(false);
  takeOver(false, ringing.bounds);
  ringing = null;
}

// A ring fills the whole screen, above full-screen apps and on every Space, like an incoming call.
function takeOver(on: boolean, bounds?: Electron.Rectangle) {
  if (!win || win.isDestroyed()) return;
  win.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(on, 'screen-saver');
  if (mac) win.setSimpleFullScreen(on);
  else win.setFullScreen(on);
  if (on) { win.moveTop(); win.focus(); if (mac) app.focus({ steal: true }); }
  // macOS settles the frame after leaving simple full screen, so set the old size again once it has.
  else if (bounds) { win.setBounds(bounds); setTimeout(() => { if (win && !win.isDestroyed() && !ringing) win.setBounds(bounds); }, 250); }
}

async function ringTest() {
  try { await fetch(`${local}/api/ring`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-taurus': '1' }, body: '{}' }); }
  catch { /* server down: the tray still works */ }
}

function trayMenu() {
  const items: MenuItemConstructorOptions[] = [
    { label: 'Open Taurus', click: showWindow },
    { label: 'Ring test', click: () => void ringTest() },
    { type: 'separator' },
    {
      label: 'Let my phone connect', type: 'checkbox', checked: owned && lanOn(), enabled: owned,
      toolTip: owned ? undefined : 'Taurus was already running from the terminal; restart it there with TAURUS_HOST=0.0.0.0.',
      click: item => { writeJson(desktopFile, { ...readJson(desktopFile, {}), lan: item.checked }); void restartServer(item.checked).then(trayMenu); },
    },
  ];
  if (hands) items.push(hands.menu());
  if (notch) items.push(
    { label: 'Taurus in the notch', type: 'checkbox', checked: notch.settings.on, click: item => { notch?.set({ on: item.checked }); trayMenu(); } },
    { label: 'Notch settings…', click: () => notch?.showSettings() },
  );
  items.push({
    label: 'Helpers on every screen', type: 'checkbox', checked: swarmOn(),
    toolTip: 'When Taurus splits a job across helpers, draw them working on your other displays too. It only draws; nothing on those screens is read or clicked.',
    click: item => { writeJson(desktopFile, { ...readJson(desktopFile, {}), swarmScreens: item.checked }); swarms?.sync(); trayMenu(); },
  });
  // Login items exist on macOS and Windows only.
  if (process.platform !== 'linux') items.push({ label: 'Start at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: item => { app.setLoginItemSettings({ openAtLogin: item.checked }); trayMenu(); } });
  items.push({ type: 'separator' }, { label: 'Quit Taurus', click: () => app.quit() });
  tray?.setContextMenu(Menu.buildFromTemplate(items));
}
function createTray() {
  const image = nativeImage.createFromPath(join(here, mac ? 'trayTemplate.png' : 'tray.png'));
  if (mac) image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Taurus');
  // Main-process only, for tests/shots.spec.ts to open the menu; the page can't reach it.
  Object.assign(globalThis, { taurusTray: tray });
  if (!mac) tray.on('click', showWindow);
  trayMenu();
}

function appMenu() {
  if (!mac) { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
}

async function start() {
  guard();
  appMenu();
  // Run from source the app is Electron's own bundle, with Electron's icon; show Taurus's in the Dock instead.
  if (mac && !app.isPackaged) app.dock?.setIcon(join(here, '../assets/icon-512.png'));
  // One Taurus, whichever way it was opened: reuse a server already on the port.
  if ((await health())?.app !== 'taurus') {
    if (!(await portFree()) || !(await startServer(lanOn()))) { busyWindow(); return; }
  }
  swarms = swarmScreens({ here, local, on: swarmOn, main: () => win, quitting: () => quitting });
  hands = handsService({ here, local, home, token: owned ? handsToken : '', quitting: () => quitting, changed: () => trayMenu() });
  createWindow();
  anywhere = taurusAnywhere({ here, main: () => win });
  notch = notchService({
    here, local,
    load: () => readJson<{ notch?: unknown }>(desktopFile, {}).notch,
    save: settings => writeJson(desktopFile, { ...readJson(desktopFile, {}), notch: settings }),
    openDashboard: showWindow, changed: () => trayMenu(),
  });
  // Once the main window has loaded, so it stays Taurus's first window and the notch never slows its start.
  let notchStarted = false;
  const startNotch = () => { if (!notchStarted && !quitting) { notchStarted = true; notch?.sync(); } };
  win?.webContents.once('did-finish-load', startNotch);
  setTimeout(startNotch, 8000);
  createTray();
  void listen();
  swarms.sync();
  hands.start();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', () => { quitting = true; endRing(); swarms?.closeAll(); hands?.quit(); notch?.closeAll(); anywhere?.closeAll(); });
  app.on('will-quit', event => { if (server) { event.preventDefault(); void stopServer().then(() => app.quit()); } });
  app.on('window-all-closed', () => { /* stays in the tray */ });
  void app.whenReady().then(start);
}
