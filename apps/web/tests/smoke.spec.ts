import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mock, ring, shots } from './fixtures';

// Cards fade in on load; measure contrast at rest.
test.use({ reducedMotion: 'reduce' });

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`Deck ${scheme} ${width} replaces saved tile and classic preferences`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('taurus-ui-version', 'v1');
        localStorage.setItem('taurus-start', 'board');
        localStorage.setItem('taurus-appearance', 'auto');
      });
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 });
      await mock(page);
      await page.goto('/');
      await expect(page.locator('main.deck')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-ui', 'v2');
      await page.goto('/#b/markets');
      await expect(page.locator('main.deck')).toBeVisible();
      await expect(page.locator('main.board')).toHaveCount(0);
      await expect(page.locator('.rail a[href^="#b/"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations.map(v => v.id)).toEqual([]);
    });
  }
}

test('Settings opens Personalize and hides the retired dashboard and interface choices', async ({ page }) => {
  await mock(page);
  await page.goto('/#settings');
  await expect(page.getByRole('heading', { name: 'Personalize' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tabs and widgets' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Interface' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Tiles/ })).toHaveCount(0);
  await page.screenshot({ path: `${shots}/look-1440.png`, fullPage: true });
});

test('connections and phone pages render', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'light'));
  await mock(page);
  await page.goto('/#connections');
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await expect(page.getByText('1 of 2 connected')).toBeVisible();
  await page.screenshot({ path: `${shots}/connections-light-1440.png`, fullPage: true });
  await page.locator('.app-tile', { hasText: 'Gmail' }).click();
  // The redirect URL is for your own developer app, so it waits behind that link.
  await page.getByRole('dialog', { name: 'Gmail' }).getByText('Use your own developer app').click();
  await expect(page.getByRole('dialog', { name: 'Gmail' }).getByText('http://localhost:8787/api/oauth/callback')).toBeVisible();
  await page.getByRole('dialog', { name: 'Gmail' }).getByRole('button', { name: 'Done' }).click();
  await page.locator('.app-tile', { hasText: 'WHOOP' }).click();
  const body = page.getByRole('dialog', { name: 'WHOOP' });
  await expect(body.getByRole('link', { name: 'Sign in with WHOOP' })).toHaveAttribute('href', '/api/oauth/start/whoop');
  await expect(body.getByLabel('WHOOP client secret')).toBeHidden();
  await body.getByText('Use your own developer app').click();
  await expect(body.getByLabel('WHOOP client secret')).toBeVisible();
  await body.getByRole('button', { name: 'Done' }).click();
  await page.goto('/#phone');
  await expect(page.getByRole('button', { name: 'Ring me now' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: `${shots}/phone-light-1440.png`, fullPage: true });
});

// November 6, 2026: the standby clock is only the clock until a click, tap or key; moving the mouse never shows the rest.
for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`standby clock fills the screen at ${width} and shows Taurus only on a tap`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mock(page);
    await page.goto('/#ring');
    const main = page.locator('main.standby');
    const panels = page.locator('.flip-panel');
    await expect(panels).toHaveCount(2);
    // The two panels cover most of the screen, and each number is most of its panel's height or width.
    const box = await panels.evaluateAll(els => els.map(el => el.getBoundingClientRect()).map(r => ({ w: r.width, h: r.height })));
    const area = box.reduce((s, b) => s + b.w * b.h, 0) / (width * height);
    expect(area).toBeGreaterThan(0.8);
    const digits = await page.locator('.flip-top .flip-digits > span').last().evaluate(el => { const r = el.getBoundingClientRect(), p = el.closest('.flip-panel')!.getBoundingClientRect(); return { w: r.width / p.width, h: parseFloat(getComputedStyle(el).fontSize) / p.height, inside: r.left >= p.left - 1 && r.right <= p.right + 1 }; });
    expect(digits.inside).toBe(true);
    expect(Math.max(digits.w, digits.h)).toBeGreaterThan(0.6);
    await expect(main).toHaveAttribute('data-chrome', 'off');
    await expect(page.getByRole('link', { name: 'Open the dashboard' })).toBeHidden();
    await page.screenshot({ path: `${shots}/standby-clock-${width}.png` });
    // Moving the mouse does nothing.
    await page.mouse.move(width / 3, height / 3);
    await page.mouse.move(width / 2, height / 2, { steps: 8 });
    await expect(main).toHaveAttribute('data-chrome', 'off');
    // A click shows Taurus, centred, and the rest; another click hides them.
    await page.mouse.click(width / 2, height / 2);
    await expect(main).toHaveAttribute('data-chrome', 'on');
    await expect(page.getByRole('link', { name: 'Open the dashboard' })).toBeVisible();
    const taurus = await page.locator('.standby-taurus').evaluate(el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
    expect(Math.abs(taurus - width / 2)).toBeLessThan(1);
    await page.screenshot({ path: `${shots}/standby-shown-${width}.png` });
    await page.mouse.click(width / 2, height / 2);
    await expect(main).toHaveAttribute('data-chrome', 'off');
    // A key shows them too; Escape hides them.
    await page.keyboard.press('Space');
    await expect(main).toHaveAttribute('data-chrome', 'on');
    await page.keyboard.press('Escape');
    await expect(main).toHaveAttribute('data-chrome', 'off');
  });
}

test('standby extras hide by themselves after a few seconds', async ({ page }) => {
  await page.clock.install();
  await mock(page);
  await page.goto('/#ring');
  const main = page.locator('main.standby');
  await page.locator('.flip-panel').first().click();
  await expect(main).toHaveAttribute('data-chrome', 'on');
  await page.clock.runFor(8_000);
  await expect(main).toHaveAttribute('data-chrome', 'off');
});

for (const width of [1440, 390]) {
  test(`ring screen takes over at ${width} and clears on answer`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await mock(page, true);
    await page.goto('/#ring');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: ring.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'I’m on it' })).toBeFocused();
    await page.screenshot({ path: `${shots}/ring-${width}.png` });
    await page.getByRole('button', { name: 'I’m on it' }).click();
    await expect(dialog).toBeHidden();
    await page.screenshot({ path: `${shots}/standby-${width}.png` });
  });
}
