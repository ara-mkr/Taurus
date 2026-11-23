import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dashboard, mock, prefs, shots, hud } from './fixtures';

// Taurus becomes the widget, in his window on the Deck since November 22, 2026 (owner, November 5, 2026: "if u say let me lock in for 30 mins like the center where taurus is
// becomes a count down timer ... if u say whats the weather his circle becomes a cloud with rain"). Instant-command
// windows arrive on the mocked ring stream; the weather and body come from the mocked dashboard. Fictional data only.
const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const opensToHud = { ...prefs, hud: { ...hud, start: 'hud' } };
const sse = (wins: unknown[]) => wins.map(w => `event: window\ndata: ${JSON.stringify(w)}\n\n`).join('');
const focus = { id: 'focus', kind: 'timer', at: iso(0), said: 'let me lock in for 30 mins', timer: { id: 'focus', label: 'Focus', minutes: 30, endsAt: iso(29.5), focus: true } };
const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#2B3A67"/><circle cx="210" cy="96" r="70" fill="#E07A5F"/></svg>')}`;
const music = { id: 'music', kind: 'music', at: iso(0), said: 'play Example Artist', music: { playing: true, progressMs: 61_000, at: iso(0), device: 'Example MacBook',
  track: { title: 'Northern Lights', artist: 'Example Artist', album: 'Long Night Drive', art: cover, durationMs: 214_000 } } };
const weather = { ...dashboard, updates: [{ id: 'weather:today', title: '12°C, rain showers, feels like 10°C', detail: 'High 14°C, low 8°C, rain 70% · Oakland · forecast model at 18:00', source: 'Weather' }] };

async function hudWith(page: Page, wins: unknown[], data: unknown = dashboard) {
  await mock(page);
  await page.route('**/api/prefs', r => r.fulfill({ json: r.request().method() === 'POST' ? r.request().postDataJSON() : opensToHud }));
  await page.route('**/api/dashboard*', r => r.fulfill({ json: data }));
  await page.route('**/api/home', r => r.fulfill({ json: { devices: [], scenes: [], sources: [], sample: true, at: iso(0) } }));
  await page.route('**/api/ring/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `retry: 600000\n${sse(wins)}` }));
  await page.route('**/api/windows/close', r => r.fulfill({ json: { ok: true } }));
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('"let me lock in for 30 mins": Taurus becomes a focus countdown, with End focus, and the rail shows it', async ({ page }) => {
  await hudWith(page, [focus]);
  const cancelled: unknown[] = [];
  await page.route('**/api/timers/cancel', r => { cancelled.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  await page.goto('/');
  const disc = page.locator('.deck-logo-win .cw-timer');
  await expect(disc).toBeVisible();
  await expect(disc).toContainText('Locked in');
  await expect(disc.locator('.cw-big')).toHaveText(/^29:\d\d$/);
  await expect(page.getByRole('button', { name: 'Talk to Taurus' })).toHaveAccessibleDescription('Focus countdown');
  await expect(page.locator('.cloud-widget-line')).toContainText('VIP mail waits');
  // Shown in Taurus's place, so not again in the corner; the rail has it under what Taurus is doing.
  await expect(page.locator('.oxwin')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'What Taurus is doing now' })).toContainText(/Focus: (29|30) min left/);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/hud-focus-1440-dark.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'End focus' }).click();
  expect(cancelled).toEqual([{ id: 'focus' }]);
  // Back to Taurus puts him back, and the window returns to the corner.
  await page.getByRole('button', { name: 'Back to Taurus' }).click();
  await expect(page.locator('.deck-logo-win .cw')).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Focus' })).toBeVisible();
});

test('"what\'s the weather": Taurus\'s circle becomes the sky, with rain and the temperature', async ({ page }) => {
  await hudWith(page, [], weather);
  await page.route('**/api/ask', r => r.fulfill({ json: { provider: '', text: 'Rain showers, 12 degrees.', proposals: [] } }));
  await page.goto('/');
  await page.getByLabel('Message Taurus').fill('what’s the weather');
  await page.getByLabel('Message Taurus').press('Enter');
  const disc = page.locator('.deck-logo-win .cw-weather');
  await expect(disc).toBeVisible();
  await expect(disc.locator('.cw-sky')).toHaveClass(/scene-rain/);
  await expect(disc.locator('.cw-drop')).toHaveCount(9);
  await expect(disc.locator('.cw-big')).toHaveText('12°');
  await expect(page.locator('.cloud-widget-line')).toContainText('12° and rain showers, feels like 10° · High 14°, low 8° · Rain 70% · Oakland');
  await page.getByRole('button', { name: 'Hide' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/hud-weather-1440-dark.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/hud-weather-1440-light.png` });
  const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.deck-center *')].filter(el => el.childNodes[0]?.nodeType === 3 && (el as HTMLElement).offsetParent).map(el => parseFloat(getComputedStyle(el).fontSize))));
  expect(smallest).toBeGreaterThanOrEqual(13);
});

test('"what\'s my recovery" shows the recovery ring; Spotify playing shows the record with its buttons', async ({ page }) => {
  await hudWith(page, [music]);
  const posted: unknown[] = [];
  await page.route('**/api/music', r => { if (r.request().method() === 'POST') { posted.push(r.request().postDataJSON()); return r.fulfill({ json: { text: 'Paused.', music: { ...music.music, playing: false } } }); } return r.fulfill({ json: music.music }); });
  await page.route('**/api/ask', r => r.fulfill({ json: { provider: '', text: 'Recovery 64%.', proposals: [] } }));
  await page.goto('/');
  const record = page.locator('.deck-logo-win .cw-music');
  await expect(record).toBeVisible();
  await expect(page.locator('.cloud-widget-line')).toContainText('Northern Lights · Example Artist · on Example MacBook');
  await expect(page.getByRole('list', { name: 'What Taurus is doing now' })).toContainText('Spotify: Northern Lights, Example Artist');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/hud-music-1440-dark.png` });
  await page.locator('.cloud-widget-line').getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('.cloud-widget-line').getByRole('button', { name: 'Play' })).toBeVisible();
  expect(posted).toEqual([{ do: 'pause' }]);

  await page.getByLabel('Message Taurus').fill('what’s my recovery');
  await page.getByLabel('Message Taurus').press('Enter');
  const body = page.locator('.deck-logo-win .cw-body');
  await expect(body).toBeVisible();
  await expect(body.locator('.cw-big')).toHaveText('64%');
  await expect(page.locator('.cloud-widget-line')).toContainText('HRV 58 ms · Resting heart rate 52 · Slept 6 h 52 min');
});

test('a meeting starting within ten minutes counts down in Taurus\'s place, with Join', async ({ page }) => {
  const soon = { ...dashboard, schedule: [{ id: 'e9', title: 'Investor call: Northgate Capital', start: iso(6), end: iso(40), joinUrl: 'https://meet.example.com/x', source: 'Google Calendar' }] };
  await hudWith(page, [], soon);
  await page.goto('/');
  const disc = page.locator('.deck-logo-win .cw-meeting');
  await expect(disc).toBeVisible();
  await expect(disc.locator('.cw-big')).toHaveText(/^[56]:\d\d$/);
  await expect(page.locator('.cloud-widget-line').getByRole('link', { name: 'Join' })).toHaveAttribute('href', 'https://meet.example.com/x');
});
