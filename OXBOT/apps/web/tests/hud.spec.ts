import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, prefs, shots, hud } from './fixtures';

// Hud (owner, November 5, 2026): the cloud dashboard with Taurus in the middle, where Taurus opens. Fictional data and
// mocked /api only.
const home = { devices: [{ id: 'sample:lamp', name: 'Floor lamp', room: 'Living room', kind: 'light', on: true, brightness: 60, source: 'Sample' }],
  scenes: [{ id: 'sample-scene:Movie time', name: 'Movie time', room: 'Home', kind: 'scene', source: 'Sample' }], sources: [], sample: true, at: new Date().toISOString() };

const opensToHud = { ...prefs, hud: { ...hud, start: 'hud' } };
const box = (page: Page, selector: string) => page.locator(selector).first().boundingBox().then(b => b!);
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('Taurus opens to Hud: one screen, Taurus between two columns that meet the top and bottom of the window', async ({ page }) => {
  await mock(page);
  await page.route('**/api/prefs', r => r.fulfill({ json: r.request().method() === 'POST' ? r.request().postDataJSON() : opensToHud }));
  await page.route('**/api/home', r => r.fulfill({ json: home }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('[data-taurus-center]')).toBeVisible();
  // November 19, 2026: no Hud switch in the side bar; Home is Hud when Settings says Dashboard.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('switch')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Talk to Taurus' })).toBeVisible();
  for (const name of ['Priority', 'To do', 'Health', 'Up next', 'House']) await expect(page.getByRole('article', { name })).toBeVisible();
  // November 19, 2026: the HUD's grid backdrop, the ticked ring and the particle orb instead of clouds.
  await expect(page.locator('.sky .hud-grid')).toHaveCount(1);
  await expect(page.locator('.hud-ring .tick')).toHaveCount(120);
  await expect(page.locator('.particle-orb')).toBeVisible();
  await expect(page.locator('.taurus-buddy')).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'House' })).toContainText('1 of 1 lights on');

  // Gone (owner: "remove the sample questions ... remove the tap taurus or say hey taurus and the parts of this are sample data"):
  // the quick commands, the hint, the sample note, the Hud | Board switch, Customize up top and the status pill.
  await expect(page.locator('main')).not.toContainText('Lock in for 50 minutes');
  await expect(page.locator('main')).not.toContainText('Hey Taurus');
  await expect(page.locator('main')).not.toContainText('Parts of this are sample data');
  await expect(page.getByRole('navigation', { name: 'View' })).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: 'Customize' })).toHaveCount(0);
  await expect(page.locator('.taurus-status')).toHaveCount(0);
  await expect(page.locator('.cloud-facts')).toContainText('things need you');

  // One screen: nothing to scroll.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900);
  // Taurus sits between the columns.
  const taurus = await box(page, '[data-taurus-center]');
  const left = await box(page, '.cloud-left'), right = await box(page, '.cloud-right');
  expect(taurus.x).toBeGreaterThan(left.x + left.width);
  expect(taurus.x + taurus.width).toBeLessThan(right.x);
  // The rail and both columns start the same small gap from the top and end the same gap from the bottom.
  const rail = await box(page, '.rail-panel');
  const firstLeft = await box(page, '.cloud-left .cloud-panel'), firstRight = await box(page, '.cloud-right .cloud-panel');
  const lastLeft = await box(page, '.cloud-left .cloud-panel:last-of-type'), lastRight = await box(page, '.cloud-right .cloud-panel:last-of-type');
  for (const b of [rail, firstLeft, firstRight]) expect(Math.round(b.y)).toBe(12);
  for (const b of [rail, lastLeft, lastRight]) expect(Math.round(900 - (b.y + b.height))).toBe(12);
  // Same corner on every panel.
  const radii = await page.evaluate(() => [...document.querySelectorAll('.rail-panel, .cloud-panel, .composer-bar')].map(el => getComputedStyle(el).borderTopLeftRadius));
  expect(new Set(radii)).toEqual(new Set(['22px']));
  // The chat bar sits under Taurus and covers no panel.
  const bar = await box(page, '.composer-bar');
  for (const panel of await page.locator('.cloud-panel').all()) expect(overlaps(bar, (await panel.boundingBox())!)).toBe(false);

  await page.screenshot({ path: `${shots}/hud-1440-dark.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/hud-1440-light.png` });

  const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('main *, .rail *')].filter(el => el.childNodes[0]?.nodeType === 3 && (el as HTMLElement).offsetParent).map(el => parseFloat(getComputedStyle(el).fontSize))));
  expect(smallest).toBeGreaterThanOrEqual(13);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
});

test('on a phone, Taurus comes first and the panels stack under him', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.route('**/api/home', r => r.fulfill({ json: home }));
  await page.goto('/#hud');
  const taurus = await box(page, '[data-taurus-center]');
  const first = (await page.getByRole('article', { name: 'Priority' }).boundingBox())!;
  expect(taurus.y).toBeLessThan(first.y);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${shots}/hud-390-dark.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/hud-390-light.png` });
  const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('main *')].filter(el => el.childNodes[0]?.nodeType === 3 && (el as HTMLElement).offsetParent).map(el => parseFloat(getComputedStyle(el).fontSize))));
  expect(smallest).toBeGreaterThanOrEqual(13);
});

test('Customize, from the rail, resizes, moves, adds and removes panels, and it is saved', async ({ page }) => {
  await mock(page);
  await page.route('**/api/home', r => r.fulfill({ json: home }));
  let saved: { hud: typeof hud } | undefined;
  await page.route('**/api/prefs', r => { if (r.request().method() === 'POST') { saved = r.request().postDataJSON(); return r.fulfill({ json: saved }); } return r.fulfill({ json: opensToHud }); });
  await page.goto('/#hud');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('group', { name: 'Arrange Health' }).getByRole('radio', { name: 'Large' }).click();
  await page.getByRole('button', { name: 'Move To do to right' }).click();
  await page.getByRole('button', { name: 'Remove House' }).click();
  await page.locator('.cloud-left').getByRole('button', { name: 'Add a panel' }).click();
  await page.getByRole('dialog', { name: 'Add a panel on the left' }).getByRole('button', { name: /^Watchlist/ }).click();
  const settings = page.locator('.cloud-settings');
  await settings.getByLabel('Still').check();
  await settings.getByRole('group', { name: 'Orb size' }).getByLabel('Large').check();
  await expect(page.locator('.cloud-left .cloud-panel')).toHaveCount(2);
  await expect.poll(() => saved?.hud.panels.map(p => `${p.type}:${p.side}:${p.size}`)).toEqual(['needs:left:medium', 'health:right:large', 'schedule:right:medium', 'todo:right:medium', 'stocks:left:medium']);
  await expect.poll(() => [saved?.hud.clouds, saved?.hud.taurusSize]).toEqual(['off', 'large']);
  await expect(page.locator('.sky')).toHaveAttribute('data-clouds', 'off');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/hud-customize-1440-dark.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.cloud-settings')).toHaveCount(0);
  // Home doesn't turn Hud off (owner, November 19, 2026): it is Hud.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.locator('[data-taurus-center]')).toBeVisible();
  await expect(page.locator('main.board')).toHaveCount(0);
});

test('drag a panel onto another without Customize, and the order is saved', async ({ page }) => {
  await mock(page);
  await page.route('**/api/home', r => r.fulfill({ json: home }));
  let saved: { hud: typeof hud } | undefined;
  await page.route('**/api/prefs', r => { if (r.request().method() === 'POST') { saved = r.request().postDataJSON(); return r.fulfill({ json: saved }); } return r.fulfill({ json: opensToHud }); });
  await page.goto('/#hud');
  await page.waitForTimeout(1500);
  await page.getByRole('article', { name: 'House' }).locator('.card-head h2').dragTo(page.getByRole('article', { name: 'Health' }).locator('.card-head h2'));
  await expect.poll(() => saved?.hud.panels.filter(p => p.side === 'right').map(p => p.type)).toEqual(['house', 'health', 'schedule']);
});

test('double-click or right-click the sky: a small popup adds a panel and sets text size, clouds and Taurus', async ({ page }) => {
  await mock(page);
  await page.route('**/api/home', r => r.fulfill({ json: home }));
  let saved: (typeof opensToHud & { profile?: { large?: boolean } }) | undefined;
  await page.route('**/api/prefs', r => { if (r.request().method() === 'POST') { saved = r.request().postDataJSON(); return r.fulfill({ json: saved }); } return r.fulfill({ json: opensToHud }); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#hud');
  // Empty sky, between Taurus and the right column, under the facts line.
  const right = await box(page, '.cloud-right');
  await page.mouse.dblclick(right.x - 60, 700);
  const menu = page.getByRole('dialog', { name: 'HUD options' });
  await expect(menu).toBeVisible();
  await menu.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: 'Large' }).click();
  await menu.getByRole('radiogroup', { name: 'Backdrop' }).getByRole('radio', { name: 'Always' }).click();
  await expect.poll(() => [saved?.profile?.large, saved?.hud.clouds]).toEqual([true, 'lively']);
  await page.screenshot({ path: `${shots}/hud-popup-1440-dark.png` });
  const axe = await new AxeBuilder({ page }).include('.bg-menu').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // A right-click (or a two-finger click) on the right half adds the panel on the right.
  await page.mouse.click(right.x - 60, 700, { button: 'right' });
  await menu.getByRole('button', { name: 'Add a panel' }).click();
  await menu.getByRole('button', { name: 'Watchlist' }).click();
  await expect(menu).toHaveCount(0);
  await expect.poll(() => saved?.hud.panels.at(-1)).toMatchObject({ type: 'stocks', side: 'right' });
  // Clicking a panel is not the background: no popup.
  await page.getByRole('article', { name: 'Priority' }).dblclick({ position: { x: 20, y: 14 } });
  await expect(menu).toHaveCount(0);
});
