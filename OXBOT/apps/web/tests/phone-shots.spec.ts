import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';

// Phone screenshots against the real server and the production build (pnpm --dir apps/web build first):
//   SHOTS=1 pnpm exec playwright test phone-shots
// Chromium at iPhone size stands in for the iOS Simulator, which needs Xcode. Temporary OXBOT_HOME, sample data,
// port 8799, so nothing touches ~/.oxbot or a running OXBOT.
test.skip(!process.env.SHOTS, 'SHOTS=1 only');
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });

const out = '../../qa-local/oxbot/phone';
const port = 8799;
let home: string;
let server: ChildProcess | null = null;

async function start(host = '127.0.0.1') {
  server = spawn(process.execPath, ['../server/src/index.ts'], { env: { ...process.env, OXBOT_HOME: home, OXBOT_PORT: String(port), OXBOT_HOST: host, OXBOT_BROKER_URL: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 200)); }
  throw new Error('server did not start');
}
async function stop() { const s = server; server = null; if (!s) return; await new Promise(r => { s.on('exit', r); s.kill(); }); }
const quiet = (page: Page) => Promise.all([
  page.route('**/api/markets*', r => r.fulfill({ json: { quotes: [] } })),
  page.route('**/api/news*', r => r.fulfill({ json: { topics: [] } })),
]);

test.beforeAll(() => {
  mkdirSync(out, { recursive: true });
  home = mkdtempSync(join(tmpdir(), 'oxbot-phone-'));
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ ringMeetings: false, ringVip: false }));
});
test.afterAll(async () => { await stop(); rmSync(home, { recursive: true, force: true }); });

// Chromium can't emulate display-mode: standalone, so this is the board at phone size in a tab.
test('phone: board, standby, offline screen', async ({ page }) => {
  test.setTimeout(90_000);
  await start();
  await quiet(page);
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Chat with Ox' })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/board.png` });
  await page.goto(`http://localhost:${port}/#phone`);
  await expect(page.getByRole('heading', { name: 'Phone', exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/settings-phone.png`, fullPage: true });
  await page.goto(`http://localhost:${port}/#ring`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/standby.png` });

  // Mac off: the saved shell loads and says so.
  await stop();
  await page.goto(`http://localhost:${port}/`);
  await expect(page.getByRole('heading', { name: 'Can’t reach your Mac.' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/offline.png` });
  const cached = await page.evaluate(async () => { const urls: string[] = []; for (const n of await caches.keys()) urls.push(...(await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname)); return urls; });
  expect(cached.filter(p => p.startsWith('/api/'))).toEqual([]);
  console.log('Cached on the phone:', cached.join(', '));
});

test('phone: an unpaired home-screen app is asked for the key', async ({ page }) => {
  const lan = Object.values(networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal)?.address;
  test.skip(!lan, 'needs a network address');
  await start('0.0.0.0');
  await page.goto(`http://${lan}:${port}/`);
  await expect(page.getByRole('heading', { name: 'Pair this phone' })).toBeVisible();
  await page.screenshot({ path: `${out}/pair.png` });
  await page.getByRole('textbox').fill('wrong-key');
  await page.getByRole('button', { name: 'Pair' }).click();
  await expect(page.getByText('That key didn’t match.')).toBeVisible();
  await stop();
});
