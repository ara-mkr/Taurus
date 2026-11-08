import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// Ox windows (owner, November 4, 2026): "hey ox play juice wrld on spotify" pops up a liquid glass window with the
// music playing. Fictional data, a drawn cover and mocked /api only; nothing reaches Spotify.
const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#2B3A67"/><circle cx="210" cy="96" r="70" fill="#E07A5F"/><rect x="30" y="170" width="240" height="90" fill="#F2CC8F"/></svg>')}`;
const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const music = {
  id: 'music', kind: 'music', at: iso(0), said: 'Hey Ox, play Example Artist on Spotify',
  music: { playing: true, progressMs: 61_000, at: iso(0), device: 'Example MacBook', volume: 60,
    track: { title: 'Northern Lights', artist: 'Example Artist', album: 'Long Night Drive', art: cover, url: 'https://open.spotify.com/track/example', durationMs: 214_000 },
    context: { kind: 'artist', name: 'Example Artist', url: 'https://open.spotify.com/artist/example' } },
};
const timer = { id: 't-1', kind: 'timer', at: iso(0), said: 'Set a 10 minute timer for pasta', timer: { id: 't-1', label: 'pasta', minutes: 10, endsAt: iso(8.4) } };
const reminder = { id: 'r-1', kind: 'reminder', at: iso(0), due: true, reminder: { id: 'r-1', text: 'Call Mom', dueAt: iso(0) } };
const sse = (wins: unknown[]) => wins.map(w => `event: window\ndata: ${JSON.stringify(w)}\n\n`).join('');

async function withWindows(page: Page, wins: unknown[]) {
  await mock(page);
  await page.route('**/api/ring/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `retry: 600000\n${sse(wins)}` }));
  await page.route('**/api/windows/close', r => r.fulfill({ json: { ok: true } }));
}

test('the music window shows what Ox heard, the song, and works its buttons', async ({ page }) => {
  await withWindows(page, [music]);
  const posted: unknown[] = [];
  await page.route('**/api/music', r => { if (r.request().method() === 'POST') { posted.push(r.request().postDataJSON()); return r.fulfill({ json: { text: 'Paused.', music: { ...music.music, playing: false } } }); } return r.fulfill({ json: music.music }); });
  await page.goto('/');
  const win = page.getByRole('article', { name: 'Spotify' });
  await expect(win).toContainText('“Hey Ox, play Example Artist on Spotify”');
  await expect(win.getByRole('heading', { name: 'Northern Lights' })).toBeVisible();
  await expect(win).toContainText('Long Night Drive · on Example MacBook');
  await expect(win.getByRole('progressbar', { name: 'Song progress' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/windows-music-1440-dark.png` });
  await win.getByRole('button', { name: 'Pause' }).click();
  await expect(win.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(posted).toEqual([{ do: 'pause' }]);
  const axe = await new AxeBuilder({ page }).include('.oxwins').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await win.getByRole('button', { name: 'Close Spotify' }).click();
  await expect(win).toHaveCount(0);
});

test('timers count down, a due reminder rings in red, and they stack', async ({ page }) => {
  await withWindows(page, [music, timer, reminder]);
  await page.route('**/api/music', r => r.fulfill({ json: music.music }));
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Timer' })).toContainText(/8:\d\d/);
  const due = page.getByRole('article', { name: 'Reminder' });
  await expect(due.getByRole('heading', { name: 'Call Mom' })).toBeVisible();
  await expect(due.getByRole('button', { name: 'In 10 minutes' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/windows-stack-1440-dark.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/windows-stack-1440-light.png` });
});

test('on a phone the windows sit under the header, full width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withWindows(page, [music, timer]);
  await page.route('**/api/music', r => r.fulfill({ json: music.music }));
  await page.goto('/');
  await expect(page.getByRole('article', { name: 'Spotify' })).toBeVisible();
  await page.waitForTimeout(600);
  const box = await page.getByRole('article', { name: 'Spotify' }).boundingBox();
  expect(box!.width).toBeGreaterThan(350);
  const small = await page.locator('.oxwins').evaluate(el => [...el.querySelectorAll('*')].filter(n => [...n.childNodes].some(c => c.nodeType === 3 && c.textContent!.trim()) && parseFloat(getComputedStyle(n).fontSize) < 13).map(n => n.textContent));
  expect(small).toEqual([]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/windows-390-dark.png` });
});

test('typing the command in the chat bar sends it to Ox', async ({ page }) => {
  await withWindows(page, []);
  let asked = '';
  await page.route('**/api/ask', r => { asked = r.request().postDataJSON().turns.at(-1).text; return r.fulfill({ json: { provider: '', text: 'Playing Example Artist.', proposals: [] } }); });
  await page.goto('/');
  await page.getByLabel('Message Ox').fill('hey ox play example artist on spotify');
  await page.getByLabel('Message Ox').press('Enter');
  await expect(page.getByRole('region', { name: 'Conversation with Ox' })).toContainText('Playing Example Artist.');
  expect(asked).toBe('hey ox play example artist on spotify');
});
