import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, defaults } from '../src/hands-policy';

let dir: string;
const shots = join(import.meta.dirname, '../../../qa-local/taurus');
test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'taurus-work-cursor-'));
  mkdirSync(shots, { recursive: true });
  await build({ bundle: true, platform: 'browser', format: 'iife', entryPoints: [join(import.meta.dirname, '../src/work-cursor-view.ts')], outfile: join(dir, 'work-cursor.js') });
  copyFileSync(join(import.meta.dirname, '../src/work-cursor.html'), join(dir, 'work-cursor.html'));
});
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

for (const reducedMotion of ['no-preference', 'reduce'] as const) test(`cursor follows actual positions and retires after a stop (${reducedMotion})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    (window as unknown as { taurusWorkCursor: unknown }).taurusWorkCursor = { on(cb: unknown) { (window as unknown as { sendCursor: unknown }).sendCursor = cb; } };
  });
  await page.goto(pathToFileURL(join(dir, 'work-cursor.html')).href);
  await page.addStyleTag({ content: 'html { background:#171e2b; }' });
  const send = (data: unknown) => page.evaluate(d => (window as unknown as { sendCursor: (v: unknown) => void }).sendCursor(d), data);
  await send({ kind: 'start', origin: { x: 1240, y: 28 }, point: { x: 720, y: 210 }, name: 'Taurus', colour: '#A9D6FF', app: 'Notes' });
  await expect(page.locator('#cursor')).toHaveAttribute('data-phase', 'working');
  await expect(page.getByRole('status')).toContainText('Working in Notes · Esc to stop');
  await send({ kind: 'point', point: { x: 1405, y: 865 }, origin: { x: 980, y: 28 } });
  await expect(page.locator('#cursor')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 1405, 865)');
  const rect = await page.locator('#label').boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(1440);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(900);
  if (reducedMotion === 'no-preference') await page.screenshot({ path: join(shots, 'menu-bar-work-cursor.png') });
  await send({ kind: 'finish', status: 'Stopped' });
  await expect(page.getByRole('status')).toContainText('Stopped');
  await expect(page.locator('#cursor')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('#cursor')).toHaveCSS('opacity', '0');
  await expect(page.locator('#cursor')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 980, 28)');
  expect(await page.evaluate(() => typeof (window as { require?: unknown }).require)).toBe('undefined');
});

test('window placement retains allow lists, off switch and fixed-side validation', () => {
  expect(check('arrange', { app: 'Notes', side: 'right' }, defaults)).toContain('switched off');
  const enabled = { ...defaults, on: true };
  expect(check('arrange', { app: 'Notes', side: 'right' }, enabled)).toBe('');
  expect(check('arrange', { app: 'Terminal', side: 'right' }, enabled)).toContain('never');
  expect(check('arrange', { app: 'Google Chrome', side: 'right' }, enabled)).toContain('isn’t on your list');
  expect(check('arrange', { app: 'Notes', side: 'delete' }, enabled)).toContain('Choose left');
});
