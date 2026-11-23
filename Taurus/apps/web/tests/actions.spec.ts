import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { food, mock, reply, shots } from './fixtures';

// Approvals, the Actions page and Look (owner, November 1, 2026). Every /api call is mocked; nothing is sent.
test.use({ reducedMotion: 'reduce' });

const checks = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('body *')].filter(el => el.childNodes[0]?.nodeType === 3 && (el as HTMLElement).offsetParent).map(el => parseFloat(getComputedStyle(el).fontSize))));
  expect(smallest).toBeGreaterThanOrEqual(13);
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
};

for (const scheme of ['dark', 'light'] as const) {
  test(`Ask proposes a reply, shows it exactly, and sends only on Approve (${scheme})`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'auto'));
    await page.emulateMedia({ colorScheme: scheme });
    await mock(page);
    const approvals: unknown[] = [];
    await page.route('**/api/ask', r => r.fulfill({ json: { provider: 'Claude', text: 'Dana needs a yes on Thursday. I wrote it; it’s waiting for your OK.', proposals: [reply] } }));
    await page.route(`**/api/approvals/${reply.id}/approve`, r => { approvals.push(r.request().postDataJSON()); return r.fulfill({ json: { proposal: { ...reply, state: 'done', via: 'board', result: 'Sent from Gmail (message 18c).' } } }); });
    await page.goto('/#ask');
    await page.getByLabel('Message').fill('Reply to Dana that Thursday works');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const card = page.getByRole('article', { name: 'Reply to dana@example.com' });
    await expect(card).toBeVisible();
    await expect(card.getByText('Thursday at 10 works. I’ll bring the revised board-seat language.')).toBeVisible();
    await expect(card.getByText('Re: Term sheet redlines')).toBeVisible();
    await expect(card.getByText('14 minutes left')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Waiting for your OK' })).toHaveCount(0);
    await checks(page);
    await page.screenshot({ path: `${shots}/actions-ask-${scheme}-1440.png`, fullPage: true });
    expect(approvals).toEqual([]);
    await card.getByRole('button', { name: 'Edit' }).click();
    await card.getByLabel('Text to send').fill('Thursday at 10 works.');
    await card.getByRole('button', { name: 'Approve edited' }).click();
    await expect(card.getByText('Sent from Gmail (message 18c).')).toBeVisible();
    expect(approvals).toEqual([{ digest: 'digest-reply', text: 'Thursday at 10 works.', via: 'board' }]);
  });
}

for (const width of [1440, 390]) {
  test(`waiting actions float above the board at ${width}, with item, place and total`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 });
    await mock(page, false, [food]);
    await page.goto('/');
    const tray = page.getByRole('complementary', { name: 'Waiting for your OK' });
    await expect(tray).toBeVisible();
    const card = tray.getByRole('article', { name: 'Order from Example Greens' });
    await expect(card.getByText('Harvest Bowl')).toBeVisible();
    await expect(card.getByText('About $18.45')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Approve', exact: true })).toBeInViewport();
    await expect(card.getByText(/No delivery app lets Taurus place an order/)).toBeVisible();
    // The whole card, caution included, reads without scrolling inside the tray, and stays clear of the top bar.
    expect(await tray.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
    expect((await tray.boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator('header.topbar').boundingBox())!.y + (await page.locator('header.topbar').boundingBox())!.height);
    // and sits above the chat bar, never under it.
    expect((await tray.boundingBox())!.y + (await tray.boundingBox())!.height).toBeLessThanOrEqual((await page.locator('.composer-bar').boundingBox())!.y);
    await expect(card.getByText(/tap Place order\.$/)).toBeInViewport({ ratio: 1 });
    await expect(card.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await checks(page);
    await page.screenshot({ path: `${shots}/actions-tray-${width}.png` });
    let declined = false;
    await page.route(`**/api/approvals/${food.id}/decline`, r => { declined = true; return r.fulfill({ json: { proposal: { ...food, state: 'declined' } } }); });
    await card.getByRole('button', { name: 'Decline' }).click();
    await expect.poll(() => declined).toBe(true);
  });
}

test('the ring screen offers waiting actions in one tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, true, [reply]);
  await page.goto('/#ring');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Also waiting for your OK' })).toBeVisible();
  let via = '';
  await page.route(`**/api/approvals/${reply.id}/approve`, r => { via = r.request().postDataJSON().via; return r.fulfill({ json: { proposal: { ...reply, state: 'done', result: 'Sent from Gmail.' } } }); });
  await page.screenshot({ path: `${shots}/actions-ring-390.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Approve and send' }).click();
  await expect.poll(() => via).toBe('ring');
});

test('Settings, Actions lists each permission and what Taurus did', async ({ page }) => {
  await mock(page);
  await page.goto('/#actions');
  await expect(page.getByRole('heading', { level: 1, name: 'Actions' })).toBeVisible();
  await expect(page.getByText('2 of 4 allowed')).toBeVisible();
  await expect(page.locator('.connector', { hasText: 'Slack' }).getByText('Not allowed')).toBeVisible();
  await expect(page.locator('.connector', { hasText: 'Gmail' }).getByText('Allowed', { exact: true })).toBeVisible();
  await expect(page.getByText('Done, by voice')).toBeVisible();
  await expect(page.getByText('Slack said: not_in_channel')).toBeVisible();
  await page.locator('.connector', { hasText: 'Calls and texts' }).locator('summary').click();
  await expect(page.getByRole('button', { name: 'Allow', exact: true })).toBeVisible();
  await checks(page);
  await page.screenshot({ path: `${shots}/actions-settings-1440.png`, fullPage: true });
});
