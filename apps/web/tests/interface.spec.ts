import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { dashboard, food, hud, mock, prefs, shots } from './fixtures';

test.use({ reducedMotion: 'reduce' });

test('Personalize defaults to UI V2 and switches versions with the keyboard across reloads', async ({ page }) => {
  await mock(page);
  await page.goto('/#look');
  const root = page.locator('html');
  const classic = page.getByRole('radio', { name: 'UI V1 Classic Deck' });
  const soft = page.getByRole('radio', { name: 'UI V2 Soft dashboard' });
  await expect(soft).toBeChecked();
  await expect(root).toHaveAttribute('data-ui', 'v2');
  await soft.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(classic).toBeChecked();
  await expect(root).toHaveAttribute('data-ui', 'v1');
  await page.reload();
  await expect(classic).toBeChecked();
  await page.goto('/#hud');
  await expect(page.locator('.deck-sky')).toBeAttached();
  await expect(page.locator('.rail .pixel-icon').first()).toBeVisible();
  await page.goto('/#look');
  await soft.check();
  await page.reload();
  await expect(soft).toBeChecked();
});

for (const [width, height] of [[1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`UI V2 renders at ${width}px in ${theme} mode`, async ({ page }) => {
      await mock(page);
      await page.route('**/api/prefs', route => route.fulfill({ json: { ...prefs, hud: { ...hud, start: 'hud' } } }));
      await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'auto'));
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height });
      await page.goto('/#hud');
      await expect(page.locator('html')).toHaveAttribute('data-ui', 'v2');
      await expect(page.locator('.deck-sky')).toHaveCount(0);
      await expect(page.locator('.deck-status')).toBeVisible();
      await expect(page.locator('.deck-agents')).toBeVisible();
      await expect(page.locator('.deck-status')).toHaveCSS('border-top-left-radius', '32px');
      await expect(page.locator('.deck-identity')).toHaveCSS('border-top-left-radius', '15px');
      await expect(page.locator('.profile-button:visible')).toHaveCSS('border-top-width', '0px');
      await expect(page.locator('.deck-facts')).toHaveCount(0);
      const calendarCard = page.locator('.deck-side .events > li').first();
      await expect(calendarCard).toHaveCSS('border-top-left-radius', '18px');
      await expect(calendarCard).toHaveCSS('border-bottom-width', '0px');
      const hourLabels = await page.locator('.daystrip-marks span').allTextContents();
      expect(hourLabels.length).toBeGreaterThan(0);
      for (const label of hourLabels) expect(label).toMatch(/^\d{1,2} [AP]M$/);
      await expect(page.locator('body')).toHaveCSS('background-color', theme === 'light' ? 'rgb(245, 244, 240)' : 'rgb(25, 26, 25)');
      const composer = page.locator('.composer-bar');
      const talk = composer.getByRole('button', { name: 'Talk', exact: true });
      await expect(talk).toHaveCSS('border-radius', '50%');
      await expect(talk).toHaveCSS('width', '46px');
      const attach = composer.getByRole('button', { name: 'Attach' });
      await attach.focus();
      await page.keyboard.press('Tab');
      await expect(composer.getByRole('textbox', { name: 'Message Taurus' })).toBeFocused();
      await attach.focus();
      await page.keyboard.press('ArrowDown');
      const photos = composer.getByRole('menuitem', { name: 'Photos and files' });
      await expect(photos).toBeInViewport();
      await expect(photos).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(composer.getByRole('menuitem', { name: 'Share a window or screen' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(composer.getByRole('menu')).toHaveCount(0);
      await expect(attach).toBeFocused();
      await attach.blur();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const axe = await new AxeBuilder({ page }).include(['main', '.chatbar']).analyze();
      expect(axe.violations.map(v => v.id)).toEqual([]);
      await page.screenshot({ path: `${shots}/interface-v2-home-${theme}-${width}.png`, fullPage: true });

      await page.goto('/#look');
      await expect(page.getByRole('radio', { name: /UI V2/ })).toBeChecked();
      const settingsAxe = await new AxeBuilder({ page }).include('.settings-layout').analyze();
      expect(settingsAxe.violations.map(v => v.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `${shots}/interface-v2-personalize-${theme}-${width}.png`, fullPage: true });
    });
  }
}

test('Talk remains reachable with the activity dock open on a tablet', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1100, height: 820 });
  await page.goto('/#hud');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Activity' }).click();
  await expect(page.locator('.dock')).toBeVisible();
  await page.locator('.composer-bar').getByRole('button', { name: 'Talk', exact: true }).click({ trial: true });
});

test('the mobile approval tray stays above a multiline draft', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mock(page, false, [food]);
  await page.goto('/#hud');
  const composer = page.locator('.composer-bar');
  const tray = page.getByRole('complementary', { name: 'Waiting for your OK' });
  await expect(tray).toBeVisible();
  await expect(tray.getByText('About $18.45')).toBeVisible();
  await composer.getByRole('textbox', { name: 'Message Taurus' }).fill('A draft message with several lines. '.repeat(16));
  await expect.poll(async () => {
    const [card, bar] = await Promise.all([tray.boundingBox(), composer.boundingBox()]);
    return Boolean(card && bar && card.y + card.height <= bar.y);
  }).toBe(true);
});

test('UI V2 starts with a large icon rail that can expand and remembers the choice', async ({ page }) => {
  await mock(page);
  await page.goto('/#hud');
  const rail = page.getByRole('navigation', { name: 'Main' });
  const homeIcon = rail.getByRole('link', { name: 'Home', exact: true }).locator('svg');
  await expect(rail).toHaveCSS('width', '82px');
  await expect(homeIcon).toHaveCSS('width', '28px');
  const browserButton = rail.getByRole('button', { name: 'Browser', exact: true });
  await expect(browserButton).toHaveCSS('border-top-width', '0px');
  await expect(browserButton).toHaveCSS('box-shadow', 'none');
  await browserButton.hover();
  await expect(browserButton).not.toHaveCSS('box-shadow', 'none');
  await rail.getByRole('button', { name: 'Expand sidebar' }).press('Enter');
  await expect(rail.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true');
  await expect(rail).toHaveCSS('width', '168px');
  await page.reload();
  await expect(rail.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  await rail.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(rail).toHaveCSS('width', '82px');
});

test('UI V2 replaces sample calendar, inbox and health data with a connection state', async ({ page }) => {
  await mock(page);
  const sections = Object.fromEntries(Object.keys(dashboard.sections).map(section =>
    [section, { live: false, sources: [], errors: [] }]));
  await page.route('**/api/dashboard*', route => route.fulfill({ json: { ...dashboard, sections } }));
  await page.goto('/#hud');
  const calendar = page.getByRole('region', { name: 'Calendar' });
  await expect(calendar.getByText('Not connected yet.')).toBeVisible();
  await expect(page.getByText(/Investor call|Reading Gmail/)).toHaveCount(0);
  await page.screenshot({ path: `${shots}/interface-v2-disconnected.png` });
  await calendar.getByRole('link', { name: 'Connect', exact: true }).click();
  await expect(page).toHaveURL(/#connections$/);

  await page.goto('/#b/home');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not connected yet.');
  const health = page.getByRole('article', { name: 'Health', exact: true });
  await expect(health.getByText('Not connected yet.')).toBeVisible();
  await expect(health.getByRole('link', { name: 'Connect', exact: true })).toBeVisible();
  await expect(page.getByText('Dana Whitfield')).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'To do', exact: true }).getByText('Send board deck')).toBeVisible();
  await expect(page.getByText('Sample', { exact: true })).toHaveCount(0);
});

test('UI V2 keeps rounded rows when the side widget changes', async ({ page }) => {
  await mock(page);
  await page.addInitScript(() => localStorage.setItem('taurus-deck-config', JSON.stringify({ stocks: { symbols: ['EXA'] } })));
  await page.setViewportSize({ width: 1100, height: 820 });
  await page.goto('/#hud');
  const side = page.locator('.deck-side');
  const picker = side.getByRole('button', { name: /^What this window shows/ });
  await picker.click();
  await side.getByRole('option', { name: 'Needs you' }).click();
  await expect(side.locator('.needs > li').first()).toHaveCSS('border-top-left-radius', '18px');
  await expect(side.getByText('Term sheet redlines: board seat clause needs your call')).toBeVisible();
  await picker.click();
  await side.getByRole('option', { name: 'To do' }).click();
  await expect(side.locator('.todos > li').first()).toHaveCSS('border-top-left-radius', '18px');
  await expect(side.getByText('Send board deck')).toBeVisible();
  await picker.click();
  await side.getByRole('option', { name: 'Watchlist' }).click();
  const quote = side.locator('.quotes > li').first();
  await expect(quote).toHaveCSS('border-top-left-radius', '18px');
  await expect(quote.locator('.q-name')).toBeVisible();
  expect(await quote.evaluate(row => row.scrollWidth)).toBeLessThanOrEqual(await quote.evaluate(row => row.clientWidth));
});
