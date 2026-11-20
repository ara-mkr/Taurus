import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConnectorInfo } from '../src/api';
import { mock } from './fixtures';

// The Connections page with the real list of connectors from the server (a throwaway TAURUS_HOME with nothing
// saved and the sign-in service off), so every one must read "Not connected". Nothing is signed in and no
// provider is called; the one switch that is flipped is answered by a mock.
const out = '../../qa-local/taurus/connections';
const port = 8798;
let home: string;
let server: ChildProcess;
let connectors: ConnectorInfo[];

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  mkdirSync(out, { recursive: true });
  home = mkdtempSync(join(tmpdir(), 'taurus-connections-'));
  server = spawn(process.execPath, ['../server/src/index.ts'], { env: { ...process.env, TAURUS_HOME: home, TAURUS_PORT: String(port), TAURUS_PUBLIC_URL: 'http://localhost:8787', TAURUS_BROKER_URL: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50 && !connectors; i++) {
    try { connectors = (await (await fetch(`http://127.0.0.1:${port}/api/connectors`)).json()).connectors; } catch { await new Promise(r => setTimeout(r, 200)); }
  }
});
test.afterAll(() => { server?.kill(); rmSync(home, { recursive: true, force: true }); });

async function open(page: Page) {
  await mock(page);
  await page.route('**/api/connectors', r => r.fulfill({ json: { connectors, redirectUri: 'http://localhost:8787/api/oauth/callback', home: '~/.taurus' } }));
  await page.goto('/#connections');
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
}

test('every connector is a tile with its mark, name and one line, in plain groups, and none claims to be connected', async ({ page }) => {
  expect(connectors.length).toBeGreaterThanOrEqual(50);
  await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'light'));
  await open(page);
  await expect(page.getByText(`0 of ${connectors.length} connected`)).toBeVisible();
  const headings = await page.locator('main.connections section > h2').allInnerTexts();
  expect(headings).toEqual(['Mail', 'Calendar and meetings', 'Chat', 'Tasks and projects', 'Code and incidents', 'Docs and files', 'Sales and support', 'Money', 'Company numbers', 'Health', 'Media', 'News, feeds and weather', 'Hundreds more apps, through Composio', 'AI', 'Ringing']);
  await expect(page.locator('.app-tile')).toHaveCount(connectors.length);
  await expect(page.locator('.app-tile .app-logo')).toHaveCount(connectors.length);
  for (const state of await page.locator('.app-state').allInnerTexts()) expect(state).not.toMatch(/Connected|attention/);
  for (const name of ['Notion', 'Todoist', 'Trello', 'Asana', 'Jira', 'GitLab', 'Discord', 'Telegram', 'Microsoft Teams', 'Zoom', 'Dropbox', 'Box', 'OneDrive and SharePoint files', 'Google Drive and Docs', 'Airtable', 'Spotify', 'Apple Health (export file)', 'RSS and Atom feeds', 'Weather (Open-Meteo)', 'Obsidian']) {
    await expect(page.locator('.app-name', { hasText: name }).first()).toBeVisible();
  }
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: `${out}/connections-light-1440.png`, fullPage: true });

  // A sign-in connector opens as a sheet: one Sign in button, which says plainly when Taurus's app isn't ready yet.
  // Developer keys only appear behind "Use your own developer app" (owner, November 19, 2026: no "bs auth").
  await page.locator('.app-tile', { has: page.locator('.app-name', { hasText: /^Todoist$/ }) }).click();
  const sheet = page.getByRole('dialog', { name: 'Todoist' });
  await expect(page).toHaveURL(/#connections\/todoist$/);
  await expect(sheet.getByText('Not yet tried with a real account.')).toBeVisible();
  await expect(sheet.getByText('Sign in with Todoist')).toHaveAttribute('aria-disabled', 'true');
  await expect(sheet.getByText('Signing in with Todoist isn’t ready yet.')).toBeVisible();
  await expect(sheet.getByLabel('Todoist client secret')).toBeHidden();
  await expect(sheet.getByText('Todoist App Management Console')).toBeHidden();
  await sheet.getByText('Use your own developer app').click();
  await expect(sheet.getByText('Todoist App Management Console')).toBeVisible();
  await expect(sheet.getByLabel('Todoist client secret')).toHaveAttribute('type', 'password');
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
  const small = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()) && (el as HTMLElement).offsetParent && parseFloat(getComputedStyle(el).fontSize) < 13).map(el => el.textContent!.slice(0, 40)));
  expect(small).toEqual([]);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/#connections$/);
});

test('search and filters narrow the tiles, and a public feed turns on with one switch', async ({ page }) => {
  await open(page);
  const find = page.getByRole('searchbox', { name: 'Find a connection' });
  await find.fill('spotify');
  await expect(page.locator('.app-name')).toHaveText(['Spotify']);
  await find.fill('open-meteo');
  await expect(page.locator('.app-name')).toHaveText(['Weather (Open-Meteo)']);
  await find.fill('nothing like this');
  await expect(page.getByText('Nothing matches “nothing like this”.')).toBeVisible();
  await find.fill('');
  const show = page.getByRole('toolbar', { name: 'Show' });
  // Media holds music, video and social apps (Spotify, YouTube, Bluesky, Plex...), not music alone.
  await show.getByRole('button', { name: /^Media/ }).click();
  await expect(page.locator('.app-name').filter({ hasText: /^Spotify$/ })).toHaveCount(1);
  await expect(page.locator('.app-name').filter({ hasText: /^Gmail$/ })).toHaveCount(0);
  await show.getByRole('button', { name: /^Connected/ }).click();
  await expect(page.getByText(/Nothing connected yet/)).toBeVisible();
  await show.getByRole('button', { name: /^All/ }).click();
  await page.locator('h1').click();
  await page.keyboard.press('/');
  await expect(find).toBeFocused();
  await find.fill('hacker');

  let saved: Record<string, string> | undefined;
  await page.route('**/api/connectors/hacker-news/fields', r => { saved = r.request().postDataJSON().values; return r.fulfill({ json: { connectors: connectors.map(c => c.id === 'hacker-news' ? { ...c, connected: true, ready: true } : c) } }); });
  await page.locator('.app-tile', { has: page.locator('.app-name', { hasText: /^Hacker News$/ }) }).click();
  const sheet = page.getByRole('dialog', { name: 'Hacker News', exact: true });
  await sheet.getByRole('button', { name: 'Turn on' }).click();
  await expect(sheet.locator('.connector-status')).toHaveText('Connected');
  expect(saved).toEqual({ HACKER_NEWS_ON: '1' });
  await expect(sheet.getByRole('button', { name: 'Turn off' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.app-tile', { has: page.locator('.app-name', { hasText: /^Hacker News$/ }) }).locator('.app-state')).toHaveText('Connected');
});

test('a QR code opens one app on the phone, and says plainly when the phone can’t reach the Mac', async ({ page }) => {
  await open(page);
  await page.goto('/#connections/notion');
  const sheet = page.getByRole('dialog', { name: 'Notion' });
  await sheet.getByRole('tab', { name: 'With your phone' }).click();
  await expect(sheet.getByText('Your phone can’t reach Taurus yet')).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();

  await page.route('**/api/phone', r => r.fulfill({ json: { settings: {}, channels: {}, ai: null, bound: '0.0.0.0', pairing: ['http://192.0.2.10:8787/?key=examplekey'], lanReady: true } }));
  await page.locator('.app-tile', { has: page.locator('.app-name', { hasText: /^Notion$/ }) }).click();
  await sheet.getByRole('tab', { name: 'With your phone' }).click();
  await expect(sheet.getByRole('img', { name: 'QR code that opens Notion in Taurus on your phone' })).toBeVisible();
  await page.screenshot({ path: `${out}/connections-qr-1440.png` });
});

test('Find my apps reads only the website column of a password export and keeps only app ids', async ({ page }) => {
  await open(page);
  await page.route('**/api/composio', r => r.fulfill({ json: { catalog: [['Pipedrive', 'pipedrive'], ['Vercel', 'vercel']], readers: {}, apps: [] } }));
  await page.getByRole('button', { name: 'Find my apps' }).click();
  const sheet = page.getByRole('dialog', { name: 'Find the apps you already use' });
  await expect(sheet.getByText(/never reads, saves or sends a password/)).toBeVisible();
  const csv = 'name,url,username,password,note\nNotion,https://www.notion.so/login,me@example.com,"hunter,2 ""quoted""",\nSlack,https://app.slack.com/,me@example.com,example-secret,\nSpotify,android://abc==@com.spotify.music/,me@example.com,example-secret,\nPipedrive,https://app.pipedrive.com/auth,me@example.com,example-secret,\nShop,https://shop.example,me@example.com,example-secret,\n';
  await sheet.locator('input[type=file]').setInputFiles({ name: 'Passwords.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(sheet.locator('.found-line')).toHaveText('You have accounts at 5 sites. 3 connect to Taurus directly. 1 more are in Composio.');
  await expect(sheet.getByText('Delete the exported file now.', { exact: false })).toBeVisible();
  await expect(sheet.locator('.app-name')).toHaveText(['Slack', 'Notion', 'Spotify'].sort((a, b) => connectors.findIndex(c => c.name === a) - connectors.findIndex(c => c.name === b)));
  const kept = await page.evaluate(() => localStorage.getItem('taurus-found') ?? '');
  expect(kept).not.toMatch(/secret|hunter|example\.com|notion\.so/);
  await page.screenshot({ path: `${out}/connections-find-1440.png` });
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'You already use these' })).toBeVisible();
});

test('connections at phone size, dark', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'dark'));
  await open(page);
  await page.getByRole('region', { name: 'News, feeds and weather' }).getByText('Weather (Open-Meteo)').click();
  await expect(page.getByRole('dialog', { name: 'Weather (Open-Meteo)' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${out}/connections-dark-390.png`, fullPage: true });
});
