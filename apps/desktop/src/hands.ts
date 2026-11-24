import { workCursor } from './work-cursor';
import { BrowserWindow, globalShortcut, powerMonitor, screen, type MenuItemConstructorOptions } from 'electron';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { acting, check, defaults, never, type HandsSettings, type Window } from './hands-policy';

// Helpers in other apps (owner, November 5, 2026: "Yes, plan it", then "just do everything in sequential order";
// docs/19-computer-use.md). This process runs taurus-hands, the fixed-verb program that reads and drives other apps,
// and takes steps from the Taurus server over a private line only it holds the token for. Every step is checked against
// the owner's allow list (hands-policy.ts). While a helper has the mouse a banner says who, Esc or touching the mouse
// stops every helper at once, and so do Lock and sleep. The owner switches Screen Recording and Accessibility on
// himself; the tray item only opens macOS's own prompts.

type Request = { id: string; verb: string; args: Record<string, unknown>; who?: { name: string; colour: string } };
const mac = process.platform === 'darwin';
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function handsService(o: { here: string; local: string; home: string; token: string; quitting: () => boolean; changed: () => void; origin: () => Electron.Rectangle | undefined }) {
  const cursor = workCursor(o);
  const file = join(o.home, 'hands.json');
  const helper = join(o.here, 'taurus-hands').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
  let proc: ChildProcessWithoutNullStreams | undefined;
  let seq = 0, buffer = '';
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  const windows = new Map<string, Window>();
  let running: string[] = [];

  function settings(): HandsSettings { try { return { ...defaults, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { return { ...defaults }; } }
  function save(s: HandsSettings) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });
    chmodSync(file, 0o600);
    o.changed();
  }

  function program() {
    if (proc) return proc;
    if (!mac || !existsSync(helper)) throw new Error('Helpers in other apps need taurus-hands, which is built on a Mac with the desktop app.');
    const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const r = JSON.parse(line) as { id: number; ok: boolean; data?: unknown; error?: string };
          const w = pending.get(r.id);
          if (!w) continue;
          clearTimeout(w.timer); pending.delete(r.id);
          if (r.ok) w.resolve(r.data); else w.reject(new Error(r.error ?? 'That didn’t work.'));
        } catch { /* not a reply */ }
      }
    });
    child.on('exit', () => {
      if (proc === child) proc = undefined;
      for (const w of pending.values()) { clearTimeout(w.timer); w.reject(new Error('taurus-hands stopped.')); }
      pending.clear();
    });
    proc = child;
    return child;
  }
  function call<T = Record<string, unknown>>(verb: string, args: Record<string, unknown> = {}, ms = 20_000): Promise<T> {
    const child = program();
    const id = ++seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('taurus-hands took too long.')); }, ms);
      pending.set(id, { resolve: v => resolve(v as T), reject, timer });
      child.stdin.write(`${JSON.stringify({ id, verb, args })}\n`);
    });
  }

  // ---------- Who has the mouse ----------

  let lease: { who: string; colour: string; app: string } | null = null;
  let stepping = false, stoppedUntil = 0, generation = 0;
  let expected: { x: number; y: number } | null = null;
  let watch: NodeJS.Timeout | undefined, idle: NodeJS.Timeout | undefined;
  let banner: BrowserWindow | null = null;

  function overlay(bounds: Electron.Rectangle, html: string) {
    const w = new BrowserWindow({ ...bounds, transparent: true, frame: false, hasShadow: false, resizable: false, movable: false, focusable: false, skipTaskbar: true, show: false,
      backgroundColor: '#00000000', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
    w.setIgnoreMouseEvents(true);
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const page = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><body style="margin:0;background:transparent;font:600 14px -apple-system,system-ui,sans-serif;overflow:hidden">${html}`;
    void w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`).then(() => { if (!w.isDestroyed()) w.showInactive(); });
    return w;
  }
  function take(who: string, colour: string, app: string) {
    clearTimeout(idle);
    idle = setTimeout(() => release('Stopped waiting'), 30000);
    if (lease && lease.who === who && lease.app === app) return;
    banner?.destroy();
    lease = { who, colour, app };
    cursor.start(who, colour, app);
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = 560;
    banner = overlay({ x: Math.round(d.x + (d.width - width) / 2), y: d.y + 8, width, height: 46 },
      `<div style="margin:4px auto;width:max-content;max-width:540px;padding:9px 16px;border-radius:14px;background:rgba(20,21,25,.92);color:#F2F1EC;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 0 0 2px ${escapeHtml(colour)}99;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(who)} has the mouse in ${escapeHtml(app)} · Esc to stop</div>`);
    globalShortcut.register('Escape', () => stop('you pressed Esc'));
    clearInterval(watch);
    watch = setInterval(() => {
      const at = screen.getCursorScreenPoint();
      cursor.point(at);
      // The owner moving the mouse between steps takes it back.
      if (!stepping && expected && Math.hypot(at.x - expected.x, at.y - expected.y) > 6) stop('you moved the mouse');
    }, 33);
  }
  function release(status = 'Finished') {
    cursor.finish(status);
    lease = null; expected = null;
    clearInterval(watch); clearTimeout(idle);
    if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape');
    banner?.destroy(); banner = null;
  }
  function stop(reason: string) {
    if (!lease) return;
    release('Stopped');
    generation++;
    stoppedUntil = Date.now() + 3000;
    void post('/api/hands/stopped', { reason });
  }
  powerMonitor.on('lock-screen', () => stop('the Mac was locked'));
  powerMonitor.on('suspend', () => stop('the Mac went to sleep'));

  // ---------- Steps from the server ----------

  async function handle(r: Request): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    if (!mac) return { ok: false, error: 'Helpers in other apps work on a Mac only.' };
    const app = typeof r.args.app === 'string' ? r.args.app : '';
    const why = check(r.verb, r.args, settings(), windows.get(app.toLowerCase()));
    if (why) return { ok: false, error: why };
    try {
      if (acting.has(r.verb)) {
        if (Date.now() < stoppedUntil) return { ok: false, error: 'Stopped: you took the mouse back.' };
        take(r.who?.name ?? 'Taurus', /^#[0-9a-f]{6}$/i.test(r.who?.colour ?? '') ? r.who!.colour : '#ECEBE6', app);
        // Let the cursor emerge from the menu bar before the native pointer moves.
        await sleep(210);
        if (!lease || Date.now() < stoppedUntil) return { ok: false, error: 'Stopped before that step.' };
        stepping = true;
        // Escape typed into the app mustn't count as the owner's Esc.
        const ownEscape = r.verb === 'key' && String(r.args.key).toLowerCase() === 'escape';
        if (ownEscape) globalShortcut.unregister('Escape');
        let data: unknown;
        try {
          if (r.verb !== 'front') await call('front', { app });
          if (!lease || Date.now() < stoppedUntil) return { ok: false, error: 'Stopped before that step.' };
          const stillAllowed = check(r.verb, r.args, settings(), windows.get(app.toLowerCase()));
          if (stillAllowed) { release('Permission changed'); return { ok: false, error: stillAllowed }; }
          data = await call(r.verb, r.args);
        } finally {
          stepping = false;
          if (ownEscape && lease) globalShortcut.register('Escape', () => stop('you pressed Esc'));
        }
        if (!lease) return { ok: false, error: 'Stopped: you took the mouse back. That step may already have happened.' };
        expected = await call<{ x: number; y: number }>('where');
        cursor.point(expected);
        clearTimeout(idle); idle = setTimeout(() => release(), 700);
        return { ok: true, data };
      }
      const data = await call<Record<string, unknown>>(r.verb, r.args, r.verb === 'look' ? 25_000 : 20_000);
      if (r.verb === 'tree' && data.window) windows.set(app.toLowerCase(), data.window as Window);
      return { ok: true, data };
    } catch (error) { release('Could not finish'); return { ok: false, error: (error as Error).message }; }
  }

  async function post(path: string, body: unknown) {
    try {
      await fetch(`${o.local}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-taurus': '1', 'x-taurus-hands': o.token }, body: JSON.stringify(body) });
    } catch { /* server restarting */ }
  }

  // One step at a time, in order.
  let queue: Promise<void> = Promise.resolve();
  async function follow() {
    while (!o.quitting()) {
      try {
        const response = await fetch(`${o.local}/api/hands/stream`, { headers: { Accept: 'text/event-stream', 'x-taurus-hands': o.token } });
        if (!response.ok || !response.body) throw new Error(String(response.status));
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let text = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          text += value;
          let end: number;
          while ((end = text.indexOf('\n\n')) >= 0) {
            const block = text.slice(0, end); text = text.slice(end + 2);
            const data = block.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
            if (!/^event: request$/m.test(block) || !data) continue;
            let request: Request;
            try { request = JSON.parse(data) as Request; } catch { continue; }
            const accepted = generation;
            queue = queue.then(async () => post('/api/hands/result', { id: request.id, ...(accepted === generation ? await handle(request) : { ok: false, error: 'Stopped: that queued step was cancelled.' }) }));
          }
        }
      } catch { /* server restarting or not up yet */ }
      await sleep(2000);
    }
  }

  // The apps open now, for "Add an app" in the menu.
  async function refreshApps() {
    try {
      const { apps } = await call<{ apps: { name: string }[] }>('apps');
      const names = [...new Set(apps.map(a => a.name).filter(n => n && !never(n)))].sort((a, b) => a.localeCompare(b));
      if (names.join('|') !== running.join('|')) { running = names; o.changed(); }
    } catch { /* no helper */ }
  }

  function openChrome() {
    execFile('/usr/bin/open', ['-na', 'Google Chrome', '--args', `--user-data-dir=${join(o.home, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check'], () => undefined);
  }

  function menu(): MenuItemConstructorOptions {
    const s = settings();
    const toggle = (list: 'act' | 'look', app: string) => save({ ...s, [list]: s[list].some(a => same(a, app)) ? s[list].filter(a => !same(a, app)) : [...s[list], app] });
    const listed = (app: string) => s.act.some(a => same(a, app)) || s.look.some(a => same(a, app));
    const ready = mac && Boolean(o.token) && existsSync(helper);
    return {
      label: 'Helpers in other apps', enabled: mac,
      submenu: [
        { label: 'Let helpers act in other apps', type: 'checkbox', checked: s.on, enabled: ready, click: item => save({ ...s, on: item.checked }),
          toolTip: ready ? undefined : 'Needs the desktop app to have started Taurus itself, on a Mac.' },
        { label: 'Switch on Screen Recording and Accessibility…', enabled: ready, click: () => void call('ask', { screen: true, accessibility: true }).catch(() => undefined) },
        { type: 'separator' },
        { label: 'May act', enabled: false },
        ...s.act.map(a => ({ label: a, type: 'checkbox' as const, checked: true, click: () => toggle('act', a) })),
        { label: 'May look', enabled: false },
        ...s.look.map(a => ({ label: a, type: 'checkbox' as const, checked: true, click: () => toggle('look', a) })),
        { label: 'Add an app', enabled: running.some(a => !listed(a)), submenu: running.filter(a => !listed(a)).slice(0, 40).map(a => ({
          label: a, submenu: [{ label: 'May act', click: () => toggle('act', a) }, { label: 'May look', click: () => toggle('look', a) }],
        })) },
        { type: 'separator' },
        { label: 'Helpers use the Taurus Chrome profile', type: 'checkbox', checked: s.chrome, click: item => save({ ...s, chrome: item.checked }) },
        { label: 'Open Taurus Chrome to sign in to sites', enabled: mac, click: openChrome },
      ],
    };
  }

  return {
    start() {
      if (!mac || !o.token || !existsSync(helper)) return;
      void follow();
      void refreshApps();
      setInterval(() => void refreshApps(), 60_000).unref();
    },
    menu,
    // At start (owner, November 23, 2026: "right as u open it make it hit u with all the stuff"): macOS's own prompts
    // for whichever of Screen Recording and Accessibility are still off. The owner still flips the switch in Settings.
    async askMissing() {
      if (!mac || !existsSync(helper)) return;
      const now = await call<{ screen?: boolean; accessibility?: boolean }>('status').catch(() => undefined);
      if (!now || (now.screen && now.accessibility)) return;
      await call('ask', { screen: !now.screen, accessibility: !now.accessibility }).catch(() => undefined);
    },
    quit() { release(); cursor.close(); proc?.kill(); },
  };
}
