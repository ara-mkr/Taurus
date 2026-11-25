import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mock, prefs, shots, hud } from './fixtures';

// The owner's November 5, 2026 list beyond Hud itself: drag widgets on the board and a background popup, the
// navigation audit (pink background, Settings looking like the board), the status pill gone, brand marks on every
// connection, and what Taurus is doing in the rail. Fictional data and mocked /api only.
const opensToHud = { ...prefs, hud: { ...hud, start: 'hud' } };
const home = { devices: [], scenes: [], sources: [], sample: true, at: new Date().toISOString() };

test.skip('legacy tile board: drag a widget without Edit, and double-click the background for a small popup', async ({ page }) => {
  await mock(page);
  let saved: typeof prefs & { profile?: { large?: boolean } } | undefined;
  await page.route('**/api/prefs', r => { if (r.request().method() === 'POST') { saved = r.request().postDataJSON(); return r.fulfill({ json: saved }); } return r.fulfill({ json: prefs }); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#b/home');
  await expect(page.locator('#w-w4')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.locator('#w-w4 .card-head h2').dragTo(page.locator('#w-w2 .card-head h2'));
  await expect.poll(() => saved?.boards[0].widgets.map(w => w.id).slice(0, 4)).toEqual(['w1', 'w4', 'w2', 'w3']);

  // Empty background between the tools and the first card.
  const grid = (await page.locator('.grid').boundingBox())!;
  await page.mouse.dblclick(grid.x + grid.width - 20, grid.y - 8);
  const menu = page.getByRole('dialog', { name: 'Home options' });
  await expect(menu).toBeVisible();
  await menu.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: 'Large' }).click();
  await expect.poll(() => saved?.profile?.large).toBe(true);
  await page.screenshot({ path: `${shots}/board-popup-1440-dark.png` });
  const axe = await new AxeBuilder({ page }).include('.bg-menu').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await menu.getByRole('button', { name: 'Add widget' }).click();
  await expect(page.getByRole('dialog', { name: 'Add to Home' })).toBeVisible();
});

test('navigation audit: Deck and Settings share the same look, and Home returns to Deck', async ({ page }) => {
  await mock(page);
  await page.route('**/api/prefs', r => r.fulfill({ json: r.request().method() === 'POST' ? r.request().postDataJSON() : opensToHud }));
  await page.route('**/api/home', r => r.fulfill({ json: home }));
  await page.goto('/');
  await expect(page.locator('main.deck')).toBeVisible();
  const rail = page.getByRole('navigation', { name: 'Main' });
  // No logo at the top of the rail any more (owner, November 23, 2026); Home goes home.
  await expect(rail.getByRole('link', { name: 'Taurus', exact: true })).toHaveCount(0);
  // November 22, 2026 (owner: "why does going into settings completely bring back the old ui"): Settings has the same
  // cream page and navy ink as Home, and no old sky or moving backdrop shows anywhere.
  const look = () => page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()]);
  const onHome = await look();
  await page.goto('/#look');
  expect(await look()).toEqual(onHome);
  await expect(page.locator('.sky')).toHaveCount(0);
  await expect(page.locator('.backdrop:visible')).toHaveCount(0);
  await rail.getByRole('button', { name: 'Browser' }).click();
  expect(await look()).toEqual(onHome);
  // Home is Hud: going Home never turns it off (owner, November 19, 2026).
  await expect(rail.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '#hud');
  await expect(rail.getByRole('switch')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Tiles/ })).toHaveCount(0);
  await rail.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.locator('main.deck')).toBeVisible();
});

test('the status pill is gone: one plain line at the top right, and the rail shows what Taurus is doing', async ({ page }) => {
  await mock(page);
  const now = new Date().toISOString();
  await page.route('**/api/activity/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' },
    body: `retry: 600000\nevent: hello\ndata: ${JSON.stringify([{ id: 7, at: now, kind: 'read', state: 'running', text: 'Reading Gmail', by: 'taurus' }])}\n\n` }));
  await page.route('**/api/browser/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' },
    body: `retry: 600000\ndata: ${JSON.stringify({ open: true, url: 'https://www.example.com/flights', title: 'Example Flights', by: 'taurus', loading: false })}\n\n` }));
  await page.goto('/#look');
  await expect(page.locator('.taurus-status')).toHaveCount(0);
  await expect(page.locator('.top-line')).toHaveText(/^(3 things need you|It’s late\. .+)$/);
  const doing = page.getByRole('list', { name: 'What Taurus is doing now' });
  await expect(doing).toContainText('Reading Gmail');
  await expect(doing).toContainText('Browser: Example Flights');
  await doing.getByRole('button', { name: 'Browser: Example Flights' }).click();
  await expect(page.getByRole('complementary', { name: 'Taurus at work' })).toBeVisible();
  await page.screenshot({ path: `${shots}/rail-now-1440-dark.png` });
});

test('every connection has a mark, Outlook, Teams and Slack included', async ({ page }) => {
  await mock(page);
  const row = (id: string, name: string, group: string) => ({ id, name, group, reads: 'Example.', auth: 'oauth', connected: false, ready: true, missing: [], fields: [], setup: 'Example.', setupUrl: 'https://example.com' });
  await page.route('**/api/connectors', r => r.fulfill({ json: { connectors: [row('outlook-mail', 'Outlook Mail', 'Mail'), row('teams', 'Microsoft Teams', 'Chat'), row('slack', 'Slack', 'Chat'), row('onedrive', 'OneDrive', 'Files'), row('weather', 'Weather (Open-Meteo)', 'Feeds')], redirectUri: 'http://localhost:8787/api/oauth/callback', home: '~/.taurus' } }));
  await page.goto('/#connections');
  await expect(page.locator('.app-tile .app-logo')).toHaveCount(5);
  await expect(page.locator('.app-tile .app-logo svg')).toHaveCount(5);
  await expect(page.locator('.app-tile .app-logo.letters')).toHaveCount(0);
  await page.locator('.app-tile').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/connections-marks-1440-dark.png` });
});
