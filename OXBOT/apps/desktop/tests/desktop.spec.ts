import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The desktop app against a throwaway TAURUS_HOME on port 8790, so the real ~/.taurus and any running
// Taurus on 8787 are never touched. Fictional settings only; every address is example.com.
const here = dirname(fileURLToPath(import.meta.url));
const main = join(here, '../dist/main.mjs');
const electronBinary = createRequire(import.meta.url)('electron') as unknown as string;
const port = 8790;
const origin = `http://localhost:${port}`;
const local = `http://127.0.0.1:${port}`;

let home: string;
let app: ElectronApplication;
let page: Page;
let env: Record<string, string>;

const windowState = () => app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().startsWith('http://localhost'));
  return w ? { visible: w.isVisible(), focused: w.isFocused(), onTop: w.isAlwaysOnTop(), full: process.platform === 'darwin' ? w.isSimpleFullScreen() : w.isFullScreen(), everySpace: w.isVisibleOnAllWorkspaces(), destroyed: w.isDestroyed() } : null;
});
const hide = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.hide()));
const windowUrl = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http'))?.webContents.getURL());
const opened = () => app.evaluate(() => (globalThis as { opened?: string[] }).opened ?? []);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'taurus-desktop-'));
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ vipSenders: ['dana@example.com'], ringMeetings: false, ringVip: false }));
  // A board without market or news widgets, so the server makes no outside calls.
  writeFileSync(join(home, 'prefs.json'), JSON.stringify({ tint: 'graphite', ambient: false, taurus: true, todos: [], people: [], boards: [{ id: 'home', name: 'Home', widgets: [
    { id: 'w1', type: 'brief', size: 'wide' }, { id: 'w2', type: 'needs', size: 'tall' }, { id: 'w3', type: 'schedule', size: 'tall' }, { id: 'w4', type: 'todo', size: 'medium' },
  ] }] }));
  env = { ...process.env, TAURUS_HOME: home, TAURUS_PORT: String(port), TAURUS_BROKER_URL: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' } as Record<string, string>;
  app = await electron.launch({ args: [main], env });
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  // Past the first-run welcome, which covers the window until it's done (the web tests start past it the same way).
  await page.evaluate(() => localStorage.setItem('taurus-onboarded', '1'));
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  // Every link that leaves the app goes through shell.openExternal; record instead of opening a browser.
  await app.evaluate(({ shell }) => {
    const g = globalThis as { opened?: string[] };
    g.opened = [];
    shell.openExternal = async (url: string) => { g.opened!.push(url); };
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

// Since November 5, 2026 Taurus opens to Hud, Taurus among the clouds, with the boards in the rail.
test('the window opens on Hud', async () => {
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.locator('[data-taurus-center]')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as { taurusDesktop?: { platform: string } }).taurusDesktop?.platform)).toBe(process.platform);
  expect(await page.evaluate(() => typeof (window as { require?: unknown }).require)).toBe('undefined');
  expect((await windowState())?.visible).toBe(true);
});

test('an external link opens in the default browser, not in the window', async () => {
  const before = (await opened()).length;
  await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: 'https://example.com/report', target: '_blank', textContent: 'Report' });
    document.body.append(a);
    a.click();
    a.remove();
  });
  await expect.poll(opened).toContain('https://example.com/report');
  expect((await opened()).length).toBe(before + 1);
  // Taurus in the notch and Taurus anywhere are windows of their own (local files); the link opened no other page.
  expect(app.windows().filter(p => p.url().startsWith('http')).length).toBe(1);
  await expect(page).toHaveURL(`${origin}/`);
});

// Since November 7, 2026 the microphone alone may open without a tap ("Hey Taurus" and double clap in the desktop app);
// it is not asked for here, so no macOS prompt appears during tests. The camera still needs a tap, and the two
// together never open.
test('an unprompted camera, camera with microphone, screen, location and notifications are denied', async () => {
  const result = await page.evaluate(async () => {
    const media = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c).then(() => 'granted', (e: Error) => e.name);
    const where = await new Promise<string>(resolve => navigator.geolocation.getCurrentPosition(() => resolve('granted'), e => resolve(`denied ${e.code}`), { timeout: 3000 }));
    return { camera: await media({ video: true }), both: await media({ video: true, audio: true }), screen: await navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => 'granted', (e: Error) => e.name), where, notifications: await Notification.requestPermission() };
  });
  expect(result.camera).not.toBe('granted');
  expect(result.both).not.toBe('granted');
  expect(result.screen).not.toBe('granted');
  expect(result.where).not.toBe('granted');
  expect(result.notifications).toBe('denied');
});

test('Talk listens on this Mac and says plainly when macOS blocks the microphone', async () => {
  // The desktop window now hears through the local server (November 7, 2026), not "use the browser". Fake macOS
  // saying no, so the test never opens the real microphone.
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })); });
  // Talk is on the chat bar; on Hud, Taurus's words appear under him (#taurus-says).
  await page.getByRole('complementary', { name: 'Chat with Taurus' }).getByRole('button', { name: 'Talk' }).click();
  await expect(page.locator('#taurus-says')).toContainText('macOS is blocking the microphone');
  await expect(page.locator('#taurus-says')).not.toContainText('Voice needs Chrome or Safari');
});

test('a ring takes over the screen from a hidden window, and "I\'m on it" gives it back', async () => {
  const before = { x: 120, y: 90, width: 1100, height: 760 };
  await app.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http'))!.setBounds(b), before);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http'))!.getBounds())).toEqual(before);
  await hide();
  expect((await windowState())?.visible).toBe(false);
  const response = await fetch(`${local}/api/ring`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-taurus': '1' }, body: '{}' });
  const { ring } = await response.json() as { ring: { id: string } };
  await expect.poll(windowState).toMatchObject({ visible: true, onTop: true, full: true, everySpace: true });
  if (process.platform === 'darwin') await expect.poll(async () => (await windowState())?.focused).toBe(true);
  await expect(page.getByRole('alertdialog')).toContainText('Test ring');
  await page.getByRole('button', { name: 'I’m on it' }).click();
  await expect.poll(windowState).toMatchObject({ onTop: false, full: false, everySpace: false });
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('http'))!.getBounds())).toEqual(before);
  expect(ring.id).toBeTruthy();
});

test('closing the window keeps the server answering', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.close()));
  await expect.poll(async () => (await windowState())?.visible).toBe(false);
  expect((await windowState())?.destroyed).toBe(false);
  const health = await (await fetch(`${local}/api/health`)).json();
  expect(health).toMatchObject({ app: 'taurus' });
});

test('a second launch focuses the first window and exits', async () => {
  await hide();
  const second = spawn(electronBinary, [main], { env, stdio: 'ignore' });
  const code = await new Promise<number | null>(resolve => second.on('exit', resolve));
  expect(code).toBe(0);
  await expect.poll(async () => (await windowState())?.visible).toBe(true);
});

test('another program on the port gets a plain message, not a second server', async () => {
  const other = createServer((_req, res) => res.end('not taurus'));
  await new Promise<void>(resolve => other.listen(8791, '127.0.0.1', resolve));
  const busyHome = mkdtempSync(join(tmpdir(), 'taurus-busy-'));
  const busy = await electron.launch({ args: [main], env: { ...env, TAURUS_HOME: busyHome, TAURUS_PORT: '8791' } });
  try {
    const page = await busy.firstWindow();
    await expect(page.locator('body')).toContainText('Port 8791 is in use by another program. Close it and reopen Taurus.');
  } finally {
    await busy.close();
    other.close();
    rmSync(busyHome, { recursive: true, force: true });
  }
});

// Last: Playwright treats a navigation the app refused as still pending, so the page takes no more actions.
test('navigation to another origin is blocked', async () => {
  await page.evaluate(() => { location.href = 'https://example.com/elsewhere'; });
  await expect.poll(opened).toContain('https://example.com/elsewhere');
  await page.evaluate(() => { location.href = 'file:///etc/hosts'; });
  await page.waitForTimeout(400);
  expect(await windowUrl()).toBe(`${origin}/`);
  expect(await opened()).not.toContain('file:///etc/hosts');
});
