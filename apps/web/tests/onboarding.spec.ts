import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mock, prefs, shots } from './fixtures';

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });

test('the start page gates even a deep link until the optional name is saved', async ({ page }) => {
  await mock(page);
  await page.route('**/api/ai', route => route.fulfill({ json: { using: null, providers: [], free: [], chosen: '', freeModel: '' } }));
  await page.route('**/api/ai/plans*', route => route.fulfill({ json: { plans: [] } }));
  let requests = 0;
  let profile: { name?: string } = {};
  await page.route('**/api/prefs', route => {
    if (route.request().method() === 'POST') profile = route.request().postDataJSON().profile;
    return route.fulfill({ json: { ...prefs, profile } });
  });
  page.on('request', request => { if (request.url().includes('/api/dashboard')) requests++; });
  await page.goto('/#ai');
  const welcome = page.getByRole('main', { name: 'Welcome to Taurus' });
  await expect(welcome).toBeVisible();
  await expect(page.locator('.shell')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(welcome).toBeVisible();
  expect(requests).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: `${shots}/welcome-taurus-1440.png` });

  const name = welcome.getByRole('textbox', { name: 'What should I call you?' });
  await name.fill('Taylor');
  await name.press('Enter');
  await expect(page.getByRole('heading', { name: 'AI', exact: true })).toBeVisible();
  expect(profile.name).toBe('Taylor');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'AI', exact: true })).toBeVisible();
  await expect(welcome).toHaveCount(0);
});

test('skip opens Taurus at phone width without saving a profile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  let saved = false;
  await page.route('**/api/prefs', route => {
    if (route.request().method() === 'POST') saved = true;
    return route.fulfill({ json: prefs });
  });
  await page.goto('/');
  const welcome = page.getByRole('main', { name: 'Welcome to Taurus' });
  expect(await welcome.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/welcome-taurus-390.png` });
  await welcome.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page.locator('.shell')).toBeVisible();
  expect(saved).toBe(false);
});
