import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Helpers on every screen (owner, November 5, 2026): the overlay drawn on another display, in plain Chromium with a
// fake listen-only bridge standing in for Electron's, so it runs on a Mac with one screen. Twelve mocked helpers;
// with one other screen, the even-numbered six work here. Fictional example.com shops; nothing leaves this page.
const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, '../../../qa-local/taurus');
let dir: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'taurus-overlay-'));
  await build({ bundle: true, platform: 'browser', target: 'chrome130', format: 'iife', logLevel: 'warning', entryPoints: [join(here, '../src/overlay.ts')], outfile: join(dir, 'overlay.js') });
  copyFileSync(join(here, '../src/overlay.html'), join(dir, 'overlay.html'));
});
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

const palette = ['#FF8A5B', '#5BC0FF', '#7BE08A', '#FFD25B', '#C79BFF', '#FF7EB6', '#4FE3D0', '#FFB35C', '#9DB4FF', '#E2F07A', '#FF9E9E', '#8FF0B4'];
const helper = (n: number, state: string) => ({ id: `h${n}`, n, name: `Scout ${n}`, colour: palette[n - 1], state, moves: 1, label: `shop${n}.example.com`,
  host: `shop${n}.example.com`, title: 'Desk lamps', doing: state === 'working' ? `reading shop${n}.example.com` : state, act: 'read', point: { x: 240 + n * 20, y: 300 + n * 30 } });
const art = (n: number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#F6F5F1"/><rect width="800" height="84" fill="#20232A"/><text x="32" y="54" font-family="Helvetica" font-size="30" fill="#fff">shop${n}.example.com</text>${[0, 1, 2, 3, 4].map(r => `<rect x="32" y="${130 + r * 170}" width="140" height="130" rx="10" fill="#DAD7CE"/><rect x="200" y="${150 + r * 170}" width="420" height="22" rx="4" fill="#B9B6AD"/><text x="200" y="${225 + r * 170}" font-family="Helvetica" font-size="34" fill="#20232A">$${30 + n * 3 + r * 7}</text>`).join('')}</svg>`)}`;
const swarm = (state: string, s: string) => ({ id: 'sw', state, width: 800, height: 1000, helpers: Array.from({ length: 12 }, (_, i) => helper(i + 1, i < 6 ? s : 'waiting')) });

async function open(page: Page) {
  await page.addInitScript(() => { (window as unknown as { taurusOverlay: unknown }).taurusOverlay = { on(cb: unknown) { (window as unknown as { send: unknown }).send = cb; } }; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pathToFileURL(join(dir, 'overlay.html')).href);
  // A plain stand-in for the wallpaper behind the transparent window, for the screenshots only.
  await page.addStyleTag({ content: 'html { background: #2A3446; }' });
  const send = (event: string, data: unknown) => page.evaluate(([e, d]) => (window as unknown as { send: (m: unknown) => void }).send({ event: e, data: d }), [event, data] as const);
  // Taurus's own screen is to the left of this one.
  await send('hello', { index: 0, others: 1, toHome: { dx: -1440, dy: 0 }, swarm: swarm('running', 'working'), frames: Object.fromEntries([2, 4, 6].map(n => [`h${n}`, art(n)])) });
  return send;
}

test('helpers working on another screen come in from Taurus’s side, read their page cards, and leave the way they came', async ({ page }) => {
  const send = await open(page);
  // Only this screen's helpers: 2, 4, 6 at work (cards and cursors); 8, 10, 12 waiting (cursors kept off screen).
  await expect(page.locator('.card')).toHaveCount(3);
  await expect(page.locator('.cursor')).toHaveCount(6);
  await expect(page.locator('.card', { hasText: 'Scout 2' })).toContainText('Scout 2 shop2.example.com · Desk lamps');
  await page.waitForTimeout(150);
  // They enter from the left, where Taurus's screen is.
  const early = await page.locator('.cursor').evaluateAll(els => els.map(el => Number((el as HTMLElement).dataset.x)));
  expect(Math.min(...early)).toBeLessThan(500);
  await page.screenshot({ path: `${shots}/swarm-screen-1-arrive.png` });
  await page.waitForTimeout(1500);
  for (const [i, n] of [2, 4, 6].entries()) {
    const c = page.locator('.cursor').nth(i);
    const box = (await page.locator('.card', { hasText: `Scout ${n} ` }).locator('.page').boundingBox())!;
    const x = Number(await c.getAttribute('data-x')), y = Number(await c.getAttribute('data-y'));
    expect(x, `Scout ${n}`).toBeGreaterThan(box.x); expect(x).toBeLessThan(box.x + box.width);
    expect(y, `Scout ${n}`).toBeGreaterThan(box.y); expect(y).toBeLessThan(box.y + box.height);
    expect(await c.getAttribute('data-tag')).toBe('name');
  }
  const waiting = await page.locator('.cursor').nth(3).evaluate(el => Number(getComputedStyle(el).opacity));
  expect(waiting).toBeLessThan(0.05);
  const small = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(n => [...n.childNodes].some(c => c.nodeType === 3 && c.textContent!.trim()) && parseFloat(getComputedStyle(n).fontSize) < 13).map(n => n.textContent));
  expect(small).toEqual([]);
  await page.screenshot({ path: `${shots}/swarm-screen-2-work.png` });

  // Done: the cards go and the cursors head back to Taurus's screen.
  await send('swarm', swarm('merging', 'done'));
  await expect(page.locator('.card')).toHaveCount(0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/swarm-screen-3-leave.png` });
  await page.waitForTimeout(1500);
  const gone = await page.locator('.cursor').evaluateAll(els => els.map(el => ({ x: Number((el as HTMLElement).dataset.x), o: Number(getComputedStyle(el).opacity) })));
  for (const c of gone) { expect(c.x).toBeLessThan(0); expect(c.o).toBeLessThan(0.05); }
});

test('the overlay page can reach nothing: no network and no way to send a message back', async ({ page }) => {
  await open(page);
  const fetched = await page.evaluate(() => fetch('http://127.0.0.1:8787/api/health').then(() => 'reached', () => 'blocked'));
  expect(fetched).toBe('blocked');
  expect(await page.evaluate(() => Object.keys((window as unknown as { taurusOverlay: object }).taurusOverlay))).toEqual(['on']);
});
