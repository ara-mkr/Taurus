import { expect, test } from '@playwright/test';
import { mock } from './fixtures';

// The home-screen phone app: icons, the service worker, and the screen for when the Mac can't be reached.
const pngSize = (bytes: Buffer) => `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;

test('the manifest lists PNG icons, and they load at their stated sizes', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone' });
  const pngs = (manifest.icons as { src: string; sizes: string; type: string; purpose?: string }[]).filter(i => i.type === 'image/png');
  expect(pngs.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(pngs.some(i => i.purpose === 'maskable')).toBe(true);
  for (const icon of pngs) {
    const response = await request.get(icon.src);
    expect(response.ok(), icon.src).toBe(true);
    expect(pngSize(await response.body())).toBe(icon.sizes);
  }
  await mock(page);
  await page.goto('/');
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(pngSize(await (await request.get(touch!)).body())).toBe('180x180');
});

test('with the server unreachable it says so, with Ox asleep, and recovers on retry', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Can’t reach your Mac.' })).toBeVisible();
  await expect(page.getByText('OXBOT runs on your Mac; open it there, then pull to retry.')).toBeVisible();
  await expect(page.locator('main.unreachable svg.ox[data-mood="sleep"]')).toBeVisible();
  await page.unrouteAll();
  await mock(page);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByText('Can’t reach your Mac.')).toHaveCount(0);
});

test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('registers on localhost and never stores an /api/ response', async ({ page, context }) => {
    await mock(context);
    await page.goto('/');
    expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe('http://127.0.0.1:5173/');
    // Once it controls the page, every request passes it: load the board and the Phone page through it.
    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(page.getByText('Dana needs a call on the board seat')).toBeVisible();
    await page.goto('/#phone');
    await expect(page.getByRole('heading', { name: 'Phone', exact: true })).toBeVisible();
    const stored = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) urls.push(...(await (await caches.open(name)).keys()).map(r => r.url));
      return urls;
    });
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.filter(url => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
  });
});
