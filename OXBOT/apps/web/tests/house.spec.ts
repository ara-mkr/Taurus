import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// House and Ox's voice (owner, November 5, 2026). Fictional devices and mocked /api only: no hub, no lights, no model.
const devices = [
  { id: 'sample:lamp', name: 'Floor lamp', room: 'Living room', kind: 'light', on: true, brightness: 60, color: '#ffc58a', source: 'Sample' },
  { id: 'sample:curtains', name: 'Curtains', room: 'Living room', kind: 'cover', on: true, position: 100, source: 'Sample' },
  { id: 'sample:thermo', name: 'Thermostat', room: 'Office', kind: 'climate', on: true, temperature: 71, target: 70, source: 'Sample' },
  { id: 'sample:door', name: 'Front door', room: 'Entry', kind: 'lock', locked: true, secure: true, source: 'Sample' },
];
const scenes = [{ id: 'sample-scene:Movie time', name: 'Movie time', room: 'Home', kind: 'scene', source: 'Sample' }];
const home = { devices, scenes, sources: [], sample: true, at: new Date().toISOString() };
const smallest = (page: Page) => page.evaluate(() => Math.min(...[...document.querySelectorAll('main *')].filter(el => el.childNodes[0]?.nodeType === 3 && (el as HTMLElement).offsetParent).map(el => parseFloat(getComputedStyle(el).fontSize))));

test('the House page shows rooms, changes a light at once, and a lock only asks', async ({ page }) => {
  await mock(page);
  const posted: unknown[] = [];
  await page.route('**/api/home?**', r => r.fulfill({ json: home }));
  await page.route('**/api/home', r => {
    if (r.request().method() !== 'POST') return r.fulfill({ json: home });
    posted.push(r.request().postDataJSON());
    return r.fulfill({ json: { text: 'Floor lamp off.', devices: [], home: { ...home, devices: devices.map(d => d.id === 'sample:lamp' ? { ...d, on: false } : d) } } });
  });
  let secure: unknown;
  await page.route('**/api/home/secure', r => { secure = r.request().postDataJSON(); return r.fulfill({ json: { proposal: { id: 'p1', kind: 'home.secure', app: 'Home', title: 'Unlock front door', lines: [], from: 'board', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 180_000).toISOString(), state: 'pending', digest: 'x', editable: false } } }); });
  await page.goto('/#house');
  await expect(page.getByRole('heading', { name: 'House', level: 1 })).toBeVisible();
  await expect(page.getByText('1 light on. 71° inside. Front door locked.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Living room' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/house-1440-dark.png`, fullPage: true });

  await page.getByRole('button', { name: /Floor lamp/ }).click();
  await expect(page.getByRole('button', { name: /Floor lamp/ })).toHaveAttribute('aria-pressed', 'false');
  expect(posted).toEqual([{ ids: ['sample:lamp'], on: false }]);

  await page.getByRole('button', { name: 'Movie time' }).click();
  await expect.poll(() => posted.at(-1)).toEqual({ ids: ['sample-scene:Movie time'], activate: true });

  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Unlock front door: waiting for your OK.')).toBeVisible();
  expect(secure).toEqual({ ids: ['sample:door'], do: 'unlock' });

  expect(await smallest(page)).toBeGreaterThanOrEqual(13);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
});

test('a home window shows the tiles Ox changed', async ({ page }) => {
  await mock(page);
  const win = { id: 'home-1', kind: 'home', at: new Date().toISOString(), said: 'Hey Ox, movie time', text: 'Movie time.', devices: devices.slice(0, 3), sample: true };
  await page.route('**/api/ring/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `retry: 600000\nevent: window\ndata: ${JSON.stringify(win)}\n\n` }));
  await page.goto('/');
  const box = page.getByRole('article', { name: 'House' });
  await expect(box.getByRole('heading', { name: 'Movie time.' })).toBeVisible();
  await expect(box).toContainText('Sample house');
  await expect(box.getByRole('button', { name: /Floor lamp/ })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/house-window-1440-dark.png` });
});

test('Ox’s voice can be turned on and a voice picked', async ({ page }) => {
  await mock(page);
  let on = false;
  const voices = [{ id: 'am_michael', name: 'Michael', accent: 'American', gender: 'Male', note: 'Calm, low and steady.' }, { id: 'af_heart', name: 'Heart', accent: 'American', gender: 'Female', note: 'Warm and natural.' }];
  await page.route('**/api/speech', r => {
    if (r.request().method() === 'POST') on = r.request().postDataJSON().on;
    return r.fulfill({ json: { status: on ? 'ready' : 'off', progress: on ? 1 : 0, on, voices } });
  });
  await page.goto('/#look');
  const box = page.getByRole('group', { name: 'Ox’s voice' });
  await expect(box).toContainText('Off');
  await box.getByRole('button', { name: 'Turn on' }).click();
  await expect(box).toContainText('Ready');
  await box.getByRole('radio', { name: /Heart/ }).check();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('oxbot-speech') ?? '{}').voice)).toBe('af_heart');
  await expect(box.getByRole('button', { name: 'Hear Heart' })).toBeEnabled();
  expect(await smallest(page)).toBeGreaterThanOrEqual(13);
  const axe = await new AxeBuilder({ page }).include('.ox-voice').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
});
