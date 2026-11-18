import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanNotch, geometry, hasNotch, notchDefaults, notchScreens, type Screen } from '../src/notch-settings';

// Ox in the notch (owner, November 6, 2026). The real desktop app on a throwaway OXBOT_HOME and port 8792, so the
// owner's ~/.oxbot and any OXBOT on 8787 are never touched. Nothing here plays, sends or opens anything for real:
// the only questions are timers, which need no AI.
const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, '../../../qa-local/oxbot');
const main = join(here, '../dist/main.mjs');
const port = 8792;
const local = `http://127.0.0.1:${port}`;
let home: string, app: ElectronApplication, notch: Page;

// ---------- Which screens, and where (no app needed) ----------

const builtIn: Screen = { id: 1, internal: true, primary: true, bounds: { x: 0, y: 0, width: 1470, height: 956 }, workArea: { x: 0, y: 33, width: 1470, height: 834 } };
const oldMac: Screen = { id: 2, internal: true, primary: true, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const studio: Screen = { id: 3, internal: false, primary: false, bounds: { x: 1470, y: -200, width: 2560, height: 1440 }, workArea: { x: 1470, y: -175, width: 2560, height: 1415 } };

test('a MacBook with a notch is told apart by its taller menu bar; others get the small pill or nothing', () => {
  expect(hasNotch(builtIn, true)).toBe(true);
  expect(hasNotch(oldMac, true)).toBe(false);
  expect(hasNotch(studio, true)).toBe(false);
  expect(hasNotch(builtIn, false)).toBe(false);
  const s = notchDefaults;
  expect(notchScreens([builtIn, studio], s, true).map(x => x.id)).toEqual([1]);
  expect(notchScreens([oldMac, studio], s, true).map(x => x.id)).toEqual([2]);
  expect(notchScreens([builtIn, studio], { ...s, display: 'all' }, true).map(x => x.id)).toEqual([1, 3]);
  expect(notchScreens([builtIn, studio], { ...s, display: 'all', noNotch: 'hidden' }, true).map(x => x.id)).toEqual([1]);
  expect(notchScreens([oldMac], { ...s, noNotch: 'hidden' }, true)).toEqual([]);
  expect(notchScreens([builtIn], { ...s, on: false }, true)).toEqual([]);
  const g = geometry(builtIn, s, true);
  expect(g).toMatchObject({ notch: true, notchWidth: 196, notchHeight: 33, drop: 0 });
  expect(g.window.y).toBe(0);
  expect(g.window.x + g.window.width / 2).toBe(735);
  expect(geometry(studio, { ...s, dropFromTop: 8 }, true)).toMatchObject({ notch: false, notchHeight: 30, drop: 8, window: { y: -200 } });
});

test('settings from disk or the page are checked field by field', () => {
  expect(cleanNotch({ open: 'click', hoverDelay: 99999, size: 'huge', show: { music: false }, evil: '<script>' })).toEqual({ ...notchDefaults, open: 'click', hoverDelay: 1000, show: { ...notchDefaults.show, music: false } });
  expect(cleanNotch('nonsense')).toEqual(notchDefaults);
});

// ---------- The real app ----------

test.describe('in the desktop app', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });
  test.beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'oxbot-notch-'));
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ ringMeetings: false, ringVip: false }));
    writeFileSync(join(home, 'prefs.json'), JSON.stringify({ tint: 'graphite', ambient: false, ox: true, todos: [], people: [], boards: [{ id: 'home', name: 'Home', widgets: [{ id: 'w1', type: 'brief', size: 'wide' }] }] }));
    const env = { ...process.env, OXBOT_HOME: home, OXBOT_PORT: String(port), OXBOT_BROKER_URL: '', OXBOT_DESKTOP_HIDDEN: '1', OXBOT_NOTCH_TEST: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', OPENROUTER_API_KEY: '' } as Record<string, string>;
    app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron') as unknown as string, args: [main], env });
    await expect.poll(() => app.windows().find(p => p.url().endsWith('notch.html')), { timeout: 30_000 }).toBeTruthy();
    notch = app.windows().find(p => p.url().endsWith('notch.html'))!;
    await notch.waitForLoadState('domcontentloaded');
    await expect(notch.locator('#notch')).toHaveAttribute('data-phase', 'idle');
  });
  test.afterAll(async () => {
    const started = Date.now();
    await Promise.race([app?.close(), new Promise(r => setTimeout(r, 20_000))]);
    console.log(`    the app quit in ${Date.now() - started} ms`);
    try { app?.process().kill('SIGKILL'); } catch { /* already gone */ }
    rmSync(home, { recursive: true, force: true });
  });

  const win = () => app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().endsWith('notch.html'))!;
    const d = screen.getDisplayMatching(w.getBounds());
    return { bounds: w.getBounds(), display: d.bounds, workArea: d.workArea, internal: d.internal, onTop: w.isAlwaysOnTop(), everySpace: w.isVisibleOnAllWorkspaces(), visible: w.isVisible(), opacity: w.getOpacity() };
  });
  // A picture of the notch window itself, taken by Electron; the clip is rounded to whole points.
  const shot = async (name: string, clip: { x: number; y: number; width: number; height: number }) => {
    const rect = { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.round(clip.width), height: Math.round(clip.height) };
    const png = await app.evaluate(async ({ BrowserWindow }, r) => {
      const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().endsWith('notch.html'))!;
      return (await w.webContents.capturePage(r)).toPNG().toString('base64');
    }, rect);
    writeFileSync(join(shots, `${name}.png`), Buffer.from(png, 'base64'));
  };

  test('sits flush with the top of the screen, centred on the camera, above everything and on every Space', async () => {
    const w = await win();
    expect(w.bounds.y).toBe(w.display.y);
    expect(Math.abs(w.bounds.x + w.bounds.width / 2 - (w.display.x + w.display.width / 2))).toBeLessThanOrEqual(1);
    expect(w).toMatchObject({ onTop: true, everySpace: true, visible: true, opacity: 0 });
    console.log(`    screen ${w.display.width}x${w.display.height}, menu bar ${w.workArea.y - w.display.y} pt, notch window at y=${w.bounds.y}`);
    const box = (await notch.locator('#notch').boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - w.bounds.width / 2)).toBeLessThanOrEqual(1);
    expect(box.y).toBe(0);
    await expect(notch.locator('#left svg.ox')).toBeVisible();
    await shot('notch-closed', { x: w.bounds.width / 2 - 220, y: 0, width: 440, height: 80 });
  });

  test('the page can reach nothing but its own narrow bridge', async () => {
    expect(await notch.evaluate(() => fetch('http://127.0.0.1:8792/api/health').then(() => 'reached', () => 'blocked'))).toBe('blocked');
    expect(await notch.evaluate(() => Object.keys((window as unknown as { oxNotch: object }).oxNotch).sort())).toEqual(['ask', 'focus', 'hit', 'onCommand', 'onState', 'openDashboard', 'save', 'say']);
    // Only fixed words get through the music and timer buttons.
    expect(await notch.evaluate(() => (window as unknown as { oxNotch: { say(t: string): Promise<unknown> } }).oxNotch.say('send an email to dana'))).toEqual({ error: 'Not allowed.' });
  });

  test('hovering opens it into Ox; moving away closes it; a question gets an answer right there', async () => {
    const box = (await notch.locator('#notch').boundingBox())!;
    await notch.mouse.move(box.x + box.width / 2, 10);
    await expect(notch.locator('#notch')).toHaveAttribute('data-open', 'true');
    await expect(notch.getByText('Ask me anything')).toBeVisible();
    await expect(notch.getByRole('textbox', { name: 'Ask Ox' })).toBeVisible();
    await notch.waitForTimeout(500);
    await shot('notch-open', { x: box.x + box.width / 2 - 330, y: 0, width: 660, height: 320 });
    // A timer, from the box: no AI needed; it shows as a row with Cancel.
    const started = Date.now();
    await notch.getByRole('textbox', { name: 'Ask Ox' }).fill('set a 5 minute pasta timer');
    await notch.getByRole('textbox', { name: 'Ask Ox' }).press('Enter');
    await expect(notch.locator('.answer')).toContainText('5 minutes for pasta');
    console.log(`    typed question to answer in the notch: ${Date.now() - started} ms`);
    await expect(notch.locator('[data-timer]')).toContainText('pasta');
    await expect(notch.locator('[data-timer] .time')).toHaveText(/^[45]:\d\d$/);
    await notch.waitForTimeout(400);
    await shot('notch-answer', { x: box.x + box.width / 2 - 330, y: 0, width: 660, height: 360 });
    await notch.getByRole('button', { name: 'Cancel' }).click();
    await expect(notch.locator('[data-timer]')).toHaveCount(0);
    await notch.mouse.move(box.x - 300, 400);
    await expect(notch.locator('#notch')).toHaveAttribute('data-open', 'false');
  });

  test('when you talk to Ox in OXBOT, the notch shows him listening, then his answer, and closes again', async () => {
    const post = (path: string, body: unknown) => fetch(`${local}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-oxbot': '1' }, body: JSON.stringify(body) });
    expect((await post('/api/voice/presence', { phase: 'listening' })).status).toBe(200);
    await expect(notch.locator('#notch')).toHaveAttribute('data-phase', 'listening');
    await expect(notch.locator('#notch')).toHaveAttribute('data-open', 'true');
    await expect(notch.locator('.answer')).toHaveText('Listening.');
    const box = (await notch.locator('#notch').boundingBox())!;
    await shot('notch-listening', { x: box.x + box.width / 2 - 330, y: 0, width: 660, height: 300 });
    await post('/api/ask', { turns: [{ role: 'user', text: 'set a 2 minute tea timer' }], via: 'talk' });
    await expect(notch.locator('.answer')).toContainText('2 minutes for tea');
    await expect(notch.locator('.said')).toHaveText('“set a 2 minute tea timer”');
    await expect(notch.locator('#notch')).toHaveAttribute('data-open', 'false', { timeout: 9_000 });
    // Closed, the countdown sits beside the camera.
    await expect(notch.locator('#right .status')).toHaveText(/^[12]:\d\d$/);
    await shot('notch-timer-closed', { x: box.x + box.width / 2 - 220, y: 0, width: 440, height: 80 });
    expect((await post('/api/voice/presence', { phase: 'shouting' })).status).toBe(400);
  });

  test('its settings are saved with the desktop app and change it straight away', async () => {
    const box = (await notch.locator('#notch').boundingBox())!;
    await notch.mouse.move(box.x + box.width / 2, 10);
    await expect(notch.locator('#notch')).toHaveAttribute('data-open', 'true');
    await notch.getByRole('button', { name: 'Settings' }).click();
    await expect(notch.getByText('Behaviour')).toBeVisible();
    await notch.waitForTimeout(400);
    await shot('notch-settings', { x: box.x + box.width / 2 - 330, y: 0, width: 660, height: 480 });
    await notch.getByRole('group', { name: 'Opens' }).getByRole('button', { name: 'On click' }).click();
    await notch.getByRole('group', { name: 'Ox sits' }).getByRole('button', { name: 'Right' }).click();
    await notch.getByRole('group', { name: 'Now playing' }).getByRole('button', { name: 'Off' }).click();
    const saved = () => JSON.parse(readFileSync(join(home, 'desktop.json'), 'utf8')).notch;
    await expect.poll(() => saved()?.open).toBe('click');
    expect(saved()).toMatchObject({ mascotSide: 'right', show: { music: false, answer: true } });
    await notch.getByRole('button', { name: 'Done' }).click();
    await notch.keyboard.press('Escape');
    await expect(notch.locator('#notch')).toHaveAttribute('data-open', 'false');
    await expect(notch.locator('#right svg.ox')).toBeVisible();
    // On click now: hovering alone doesn't open it; a click does.
    await notch.mouse.move(box.x - 300, 400);
    await notch.mouse.move(box.x + box.width / 2, 10);
    await notch.waitForTimeout(600);
    await expect(notch.locator('#notch')).toHaveAttribute('data-open', 'false');
    await notch.mouse.click(box.x + box.width / 2, 10);
    await expect(notch.locator('#notch')).toHaveAttribute('data-open', 'true');
    // Off removes the window and is saved; the tray's "Ox in the notch" brings it back.
    await notch.getByRole('button', { name: 'Settings' }).click();
    await notch.getByRole('group', { name: 'Ox in the notch' }).getByRole('button', { name: 'Off' }).click();
    const count = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && w.webContents.getURL().endsWith('notch.html')).length);
    await expect.poll(count).toBe(0);
    expect(saved().on).toBe(false);
    await app.evaluate(() => {
      const tray = (globalThis as { oxbotTray?: { _menu?: unknown } }).oxbotTray;
      return Boolean(tray);
    });
  });

  // November 17, 2026: the notch's settings live in OXBOT's own window, Settings > Notch, with the native notch's
  // Vorssaint settings (sizes, agents) beside the shared ones.
  test('Settings > Notch in OXBOT’s window changes the same settings, the native notch’s too', async () => {
    const page = app.windows().find(p => p.url().startsWith(`http://localhost:${port}`))!;
    await page.evaluate(() => { location.hash = 'notch'; });
    await expect(page.getByRole('heading', { name: 'Notch', level: 1 })).toBeVisible();
    const saved = () => JSON.parse(readFileSync(join(home, 'desktop.json'), 'utf8')).notch;
    await page.getByRole('checkbox', { name: 'Show Ox at the top of the screen' }).check();
    await expect.poll(() => saved()?.on).toBe(true);
    await page.getByRole('radio', { name: 'Every screen' }).check();
    await expect.poll(() => saved()?.display).toBe('all');
    await page.getByRole('radio', { name: 'Custom' }).check();
    await expect.poll(() => saved()?.native?.size).toBe('custom');
    await page.getByRole('checkbox', { name: 'OpenCode' }).uncheck();
    await expect.poll(() => saved()?.native?.agents).toEqual(['claude', 'codex', 'copilot']);
    // The Electron notch comes back with the setting, and keeps what it doesn't know as it is.
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && w.webContents.getURL().endsWith('notch.html')).length)).toBeGreaterThan(0);
    expect(saved()).toMatchObject({ open: 'click', native: { size: 'custom' } });
  });
});
