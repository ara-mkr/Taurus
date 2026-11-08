import { expect, test, type Page } from '@playwright/test';
import { mock } from './fixtures';

// Phone and tablet design captures from the real app with fictional data:
//   CAPTURE=1 pnpm exec playwright test devices --workers=1
const out = '../../design/screens';
const devices = { phone: { width: 390, height: 844 }, 'tablet-portrait': { width: 820, height: 1180 }, 'tablet-landscape': { width: 1180, height: 820 } } as const;
test.use({ deviceScaleFactor: 2, reducedMotion: 'reduce' });
test.skip(!process.env.CAPTURE, 'Design captures run only with CAPTURE=1');

async function open(page: Page, hash: string, size: { width: number; height: number }, ringing = false) {
  await page.addInitScript(() => localStorage.setItem('oxbot-appearance', 'dark'));
  await page.setViewportSize(size);
  await mock(page, ringing);
  await page.route('**/api/ask', r => r.fulfill({ json: { provider: 'Claude', text: 'Dana is waiting on the board seat clause, and the investor call starts at 10:00.\n\nRead her redlines first. I drafted a reply that accepts the valuation and asks for one independent seat chosen together. Want it shorter?' } }));
  await page.goto(`/${hash}`);
}

for (const [name, size] of Object.entries(devices)) {
  test(`${name}: board with Ox`, async ({ page }) => {
    await open(page, '', size);
    await expect(page.getByRole('heading', { name: /Needs you/ })).toBeVisible();
    await page.getByRole('button', { name: /^Ox\./ }).click();
    await expect(page.locator('.ox-bubble')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${out}/${name}-board.png`, animations: 'disabled' });
  });

  test(`${name}: Ask Ox`, async ({ page }) => {
    await open(page, '#ask', size);
    await page.getByLabel('Message').fill('What should I do before the investor call?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText(/I drafted a reply/)).toBeVisible();
    await page.screenshot({ path: `${out}/${name}-ask.png`, animations: 'disabled' });
  });
}

test('phone: Ox calling', async ({ page }) => {
  await open(page, '#ring', devices.phone, true);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.screenshot({ path: `${out}/phone-ring.png`, animations: 'disabled' });
});

test('phone: standby clock', async ({ page }) => {
  await open(page, '#ring', devices.phone);
  await expect(page.locator('.flip-clock')).toBeVisible();
  await page.screenshot({ path: `${out}/phone-standby.png`, animations: 'disabled' });
});

test('phone: settings', async ({ page }) => {
  await open(page, '#look', devices.phone);
  await expect(page.getByRole('heading', { name: 'Personalize' })).toBeVisible();
  await page.screenshot({ path: `${out}/phone-look.png`, animations: 'disabled' });
});
