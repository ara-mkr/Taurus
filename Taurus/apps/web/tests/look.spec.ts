import { expect, test } from '@playwright/test';
import { mock, shots } from './fixtures';

// Look (owner, November 1, 2026): Chromium's fake camera, a moving test pattern. Its own file because these launch
// flags start a separate browser. Every /api call is mocked; the frame goes nowhere but the mocked /api/ask.
test.use({ reducedMotion: 'reduce', permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test('the camera is on only while Look is open, and one frame goes with the question', async ({ page }) => {
  await mock(page);
  let sent: { image?: string; turns: { text: string }[] } | undefined;
  await page.route('**/api/ask', r => { sent = r.request().postDataJSON(); return r.fulfill({ json: { provider: 'Claude', text: 'A whiteboard. Revenue is circled.', proposals: [] } }); });
  await page.goto('/#ask');
  // November 6, 2026: the camera is in the chat bar's + menu, with files and screen sharing.
  await page.getByRole('button', { name: 'Attach' }).click();
  await page.getByRole('menuitem', { name: 'Camera' }).click();
  const sheet = page.getByRole('dialog', { name: 'Look' });
  await expect(sheet.getByText('The camera is on until you send or close.', { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (document.querySelector('.camera-view') as HTMLVideoElement)?.videoWidth ?? 0)).toBeGreaterThan(0);
  await page.screenshot({ path: `${shots}/actions-look-1440.png` });
  await sheet.getByLabel('Question').fill('What is on this whiteboard?');
  await sheet.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('A whiteboard. Revenue is circled.')).toBeVisible();
  expect(sent!.image).toMatch(/^data:image\/jpeg;base64,/);
  expect(sent!.turns.at(-1)!.text).toBe('What is on this whiteboard?');
  await expect(page.locator('.turn-attached', { hasText: 'Camera frame' })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('video'))).toBeNull();
});
