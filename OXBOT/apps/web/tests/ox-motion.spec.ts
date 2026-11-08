import { writeFileSync, mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { mock, prefs, shots } from './fixtures';

// Ox's charge, logged every 80 ms with frames, for checking turn, pinch, launch, ease-out and upright arrival by eye:
//   MOTION=1 pnpm exec playwright test ox-motion --workers=1
test.skip(!process.env.MOTION, 'Motion log runs only with MOTION=1');
test.use({ deviceScaleFactor: 2 });
const out = `${shots}/motion`;

test('Ox charge: turn, pinch, launch, ease out, upright', async ({ page }) => {
  mkdirSync(out, { recursive: true });
  await page.addInitScript(() => localStorage.setItem('oxbot-appearance', 'dark'));
  await mock(page);
  // Headless Chromium renders in software here; the drifting light field alone drops it to a few frames a second.
  await page.route('**/api/prefs', r => r.fulfill({ json: { ...prefs, ambient: false } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Needs you/ })).toBeVisible();
  await page.waitForTimeout(2_200);
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.ox-buddy')!, w = window as unknown as { log: object[] };
    const horn = el.querySelector<SVGPathElement>('.ox-horn-l')!, eye = el.querySelector<SVGPathElement>('.ox-eye-l')!;
    const t0 = performance.now();
    w.log = [];
    window.setInterval(() => w.log.push({
      ms: Math.round(performance.now() - t0), phase: el.dataset.phase, mood: el.querySelector('svg')!.dataset.mood,
      x: Number(el.dataset.x), y: Number(el.dataset.y), heading: Number(el.dataset.heading), speed: Number(el.dataset.speed),
      horn: getComputedStyle(horn).transform, eye: getComputedStyle(eye).transform,
    }), 80);
  });

  // Leg 1, logged without screenshots so the timing is real: from the bottom right corner up and left to the Calendar card.
  const calendar = (await page.getByRole('article', { name: 'Calendar', exact: true }).boundingBox())!;
  const health = (await page.getByRole('article', { name: 'Health', exact: true }).boundingBox())!;
  await page.mouse.click(calendar.x + 60, calendar.y + calendar.height - 12);
  await expect(page.locator('.ox-buddy')).toHaveAttribute('data-phase', 'rest', { timeout: 8_000 });
  await page.waitForTimeout(400);
  const log = await page.evaluate(() => (window as unknown as { log: object[] }).log.splice(0));

  // Leg 2, in frames: pause his animation loop at each stage (the CSS horn pinch keeps running) and take a picture.
  await page.evaluate(() => {
    const w = window as unknown as { hold: boolean; queue: FrameRequestCallback[] }, raf = window.requestAnimationFrame.bind(window);
    w.hold = false; w.queue = [];
    window.requestAnimationFrame = cb => { if (w.hold) { w.queue.push(cb); return 0; } return raf(cb); };
  });
  const hold = (on: boolean) => page.evaluate(on => { const w = window as unknown as { hold: boolean; queue: FrameRequestCallback[] }; w.hold = on; if (!on) w.queue.splice(0).forEach(cb => requestAnimationFrame(cb)); }, on);
  const ox = page.locator('.ox-buddy');
  const frame = async (name: string) => {
    await page.waitForTimeout(320);
    const b = (await page.locator('.ox-rotor').boundingBox())!;
    await page.screenshot({ path: `${out}/${name}.png`, clip: { x: Math.max(0, b.x + b.width / 2 - 130), y: Math.max(0, b.y + b.height / 2 - 110), width: 260, height: 220 } });
  };
  const at = async (name: string, test: string) => {
    await page.waitForFunction(test, undefined, { polling: 'raf', timeout: 6_000 });
    await hold(true); await frame(name); await hold(false);
  };
  await page.mouse.click(health.x + health.width - 60, health.y + health.height - 12);
  await at('1-turn', `(() => { const d = document.querySelector('.ox-buddy').dataset; return d.phase === 'turn' && Math.abs(+d.heading) > 40; })()`);
  await at('2-launch', `(() => { const d = document.querySelector('.ox-buddy').dataset; return d.phase === 'run' && +d.speed > 500; })()`);
  await at('3-ease-out', `(() => { const d = document.querySelector('.ox-buddy').dataset; return d.phase === 'run' && document.querySelector('.ox-buddy svg').dataset.mood === 'settle'; })()`);
  await expect(ox).toHaveAttribute('data-phase', 'rest', { timeout: 8_000 });
  await frame('4-upright');
  await page.screenshot({ path: `${out}/board-after.png` });

  writeFileSync(`${out}/log.json`, JSON.stringify(log, null, 1));
  const rows = log as { phase: string; mood: string; heading: number; speed: number; eye: string; horn: string }[];
  // The sequence the brief asks for: turn while pinching, run, settle while slowing, upright at rest; the eyes never change.
  expect(rows.some(r => r.phase === 'turn' && r.mood === 'charge')).toBe(true);
  expect(rows.some(r => r.phase === 'run' && Math.abs(r.heading) > 20)).toBe(true);
  expect(rows.some(r => r.phase === 'run' && r.mood === 'settle')).toBe(true);
  expect(rows.at(-1)!.phase).toBe('rest');
  expect(rows.at(-1)!.heading).toBe(0);
  // Eyes have no charge pose: once he is moving they are exactly at rest (a smile from a bubble just before may still be relaxing during the turn).
  expect(new Set(rows.filter(r => r.phase === 'run' || r.phase === 'arrive').map(r => r.eye.replace('matrix(1, 0, 0, 1, 0, 0)', 'none')))).toEqual(new Set(['none']));
});
