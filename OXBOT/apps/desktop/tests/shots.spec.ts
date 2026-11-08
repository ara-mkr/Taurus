import { _electron as electron, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Screenshots of the packaged Mac app, for the owner: window light and dark, the menu bar menu, the ring screen.
//   SHOTS=1 pnpm exec playwright test shots
// Uses a temporary OXBOT_HOME (sample data only) on port 8790, so a running OXBOT on 8787 is never touched.
const here = dirname(fileURLToPath(import.meta.url));
const executable = join(here, '../release/mac-arm64/OXBOT.app/Contents/MacOS/OXBOT');
const out = join(here, '../../../qa-local/oxbot/desktop');
test.skip(!process.env.SHOTS || process.platform !== 'darwin' || !existsSync(executable), 'SHOTS=1 on a Mac with release/mac-arm64 built');

test('packaged Mac app screenshots', async () => {
  test.setTimeout(120_000);
  mkdirSync(out, { recursive: true });
  const home = mkdtempSync(join(tmpdir(), 'oxbot-shots-'));
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ ringMeetings: false, ringVip: false }));
  const app = await electron.launch({ executablePath: executable, env: { ...process.env, OXBOT_HOME: home, OXBOT_PORT: '8790', OXBOT_BROKER_URL: '' } as Record<string, string> });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds({ width: 1280, height: 820 }); w.center(); });
  // News and markets would call Yahoo and Google News; fill them with fictional rows instead.
  await page.route('**/api/markets*', r => r.fulfill({ json: { quotes: [] } }));
  await page.route('**/api/news*', r => r.fulfill({ json: { topics: [] } }));
  const windowId = async () => (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMediaSourceId())).split(':')[1];
  const shoot = async (name: string) => { await page.waitForTimeout(1200); execFileSync('screencapture', ['-x', '-o', `-l${await windowId()}`, join(out, name)]); };

  // Since November 7, 2026 Talk listens on this Mac (Moonshine via the local server); in a quiet room it ends with
  // "didn't hear", and without macOS microphone access it says so. Record what it says.
  await page.getByRole('group', { name: 'Quick functions' }).getByRole('button', { name: 'Talk' }).click();
  await expect(page.locator('#ox-says')).toContainText(/didn’t hear|microphone|couldn’t|lost touch|Yes\?/, { timeout: 20_000 });
  console.log('Talk in the packaged app says:', await page.locator('#ox-says').innerText());
  await page.locator('#ox-says').getByRole('button', { name: 'Close' }).click();

  await page.evaluate(() => localStorage.setItem('oxbot-appearance', 'dark'));
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await shoot('mac-window-dark.png');
  await page.evaluate(() => localStorage.setItem('oxbot-appearance', 'light'));
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await shoot('mac-window-light.png');
  await page.evaluate(() => localStorage.setItem('oxbot-appearance', 'dark'));
  await page.reload();

  // The menu bar menu: open it, capture the area under the icon, close it.
  const bounds = await app.evaluate(() => {
    const tray = (globalThis as { oxbotTray?: Electron.Tray }).oxbotTray!;
    setTimeout(() => tray.popUpContextMenu(), 100);
    setTimeout(() => tray.closeContextMenu(), 2500);
    return tray.getBounds();
  });
  await new Promise(resolve => setTimeout(resolve, 1200));
  // Just the menu, below the menu bar, so nothing else on the screen is captured.
  execFileSync('screencapture', ['-x', `-R${Math.max(0, bounds.x - 4)},30,176,166`, join(out, 'mac-menu-bar-menu.png')]);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Ring test, the same request the menu's "Ring test" sends.
  await fetch('http://127.0.0.1:8790/api/ring', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-oxbot': '1' }, body: '{}' });
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await shoot('mac-ring.png');
  await page.getByRole('button', { name: 'I’m on it' }).click();

  await app.close();
  rmSync(home, { recursive: true, force: true });
});
