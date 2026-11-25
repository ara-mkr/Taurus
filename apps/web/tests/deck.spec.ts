import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, prefs, shots, hud } from './fixtures';

// The Deck (owner, November 22, 2026), Home since the Jarvis HUD was retired: tabs on the left, Taurus's window with his
// status in the centre, the agents carousel above a panel you choose on the right, the chat bar under the centre, light or
// dark; and Legal in the rail where ProFinder and Ask Taurus were. Fictional data and mocked /api only.
const opensToHome = { ...prefs, hud: { ...hud, start: 'hud' } };
const now = () => new Date().toISOString();
const stream = (body: string) => ({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `retry: 600000\n${body}` });
const box = (page: Page, selector: string) => page.locator(selector).first().boundingBox().then(b => b!);

async function home(page: Page, { browser = false, swarm = false } = {}) {
  await mock(page);
  await page.route('**/api/prefs', r => r.fulfill({ json: r.request().method() === 'POST' ? r.request().postDataJSON() : opensToHome }));
  await page.route('**/api/activity/stream', r => r.fulfill(stream(`event: hello\ndata: ${JSON.stringify([{ id: 4, at: now(), kind: 'read', state: 'running', text: 'Reading Gmail', by: 'taurus' }])}\n\n`)));
  if (browser) await page.route('**/api/browser/stream', r => r.fulfill(stream(`data: ${JSON.stringify({ open: true, url: 'https://www.example.com/flights', title: 'Example Flights', by: 'taurus', loading: false, width: 1280, height: 800 })}\n\n`)));
  const helpers = [1, 2].map(n => ({ id: `h${n}`, n, name: `Helper ${n}`, colour: n === 1 ? '#FF6FB5' : '#FFC93C', label: `example${n}.com`, doing: `Reading example${n}.com`, state: 'working', host: `example${n}.com`, moves: 0, at: now() }));
  await page.route('**/api/swarm/stream', r => r.fulfill(stream(swarm ? `event: swarm\ndata: ${JSON.stringify({ id: 's1', job: 'Compare lamps', kind: 'research', state: 'running', helpers, startedAt: now(), width: 800, height: 1000, parallel: 2 })}\n\n` : ': idle\n\n')));
}

test('Home is the Deck: rail on the left, Taurus in the centre, agents above your panel on the right, one screen, chat bar under the centre', async ({ page }) => {
  await home(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const main = page.locator('main.deck');
  await expect(main).toBeVisible();
  await expect(page.getByRole('button', { name: 'Talk to Taurus' })).toBeVisible();
  // What he's doing right now is the headline and the first status line.
  await expect(page.locator('#taurus-says')).toHaveText('Reading Gmail');
  await expect(page.getByRole('list', { name: 'What Taurus did last' })).toContainText('Reading Gmail');
  await expect(page.getByRole('region', { name: 'Agents' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'What this window shows: Calendar' })).toBeVisible();
  // One screen: no page scroll, and the right column ends inside the window.
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= innerHeight + 1)).toBe(true);
  const rail = await box(page, '.rail'), centre = await box(page, '.deck-center'), right = await box(page, '.deck-right'), bar = await box(page, '.composer-bar');
  expect(rail.x + rail.width).toBeLessThanOrEqual(centre.x + 1);
  expect(centre.x + centre.width).toBeLessThanOrEqual(right.x);
  expect(right.y + right.height).toBeLessThanOrEqual(900);
  // The chat bar sits under the centre and never under the right column.
  expect(bar.x).toBeGreaterThanOrEqual(centre.x - 40);
  expect(bar.x + bar.width).toBeLessThanOrEqual(right.x);
  await expect(page.locator('.deck-sky')).toHaveCount(0);
  // Gone with the HUD: the ticked ring, Customize and the old sky.
  await expect(page.locator('.hud-ring')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Customize' })).toHaveCount(0);
  await expect(page.locator('.sky')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await page.screenshot({ path: `${shots}/deck-1440-light.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
});

test('the agents window steps through every agent with its arrows and the arrow keys', async ({ page }) => {
  await home(page, { browser: true, swarm: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const agents = page.getByRole('region', { name: 'Agents' });
  // Taurus, his browser, and the two swarm helpers.
  await expect(agents.locator('.deck-count')).toHaveText('1 / 4');
  await expect(agents.getByRole('group')).toHaveAccessibleName('Taurus, 1 of 4');
  await agents.getByRole('button', { name: 'Next agent' }).click();
  await expect(agents.getByRole('group')).toHaveAccessibleName('Browser, 2 of 4');
  await expect(agents).toContainText('www.example.com');
  await agents.getByRole('button', { name: 'Next agent' }).click();
  await expect(agents).toContainText('Helper 1');
  await expect(agents).toContainText('Working');
  await agents.getByRole('button', { name: 'Previous agent' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(agents.getByRole('group')).toHaveAccessibleName('Browser, 2 of 4');
  // Round the end and back to the start.
  await agents.getByRole('button', { name: 'Previous agent' }).click();
  await agents.getByRole('button', { name: 'Previous agent' }).click();
  await expect(agents.getByRole('group')).toHaveAccessibleName('Helper 2, 4 of 4');
});

test('the right panel is yours to choose and stays chosen; light and dark switch from the top', async ({ page }) => {
  await home(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  // Our own square menu, not the Mac's: opens on click, arrows and Enter pick, Esc closes.
  await page.getByRole('button', { name: /^What this window shows/ }).click();
  await expect(page.getByRole('listbox', { name: 'What this window shows' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('button', { name: /^What this window shows/ }).click();
  await page.getByRole('option', { name: 'Inbox' }).click();
  await expect(page.locator('.deck-side')).toContainText(/unread|Inbox|inbox/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'What this window shows: Inbox' })).toBeVisible();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: `${shots}/deck-1440-dark.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('on a phone Taurus comes first, then status, agents and your panel, and nothing runs off the side', async ({ page }) => {
  await home(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const taurus = await box(page, '.deck-logo-win'), status = await box(page, '.deck-status'), agents = await box(page, '.deck-agents'), side = await box(page, '.deck-side');
  expect(taurus.y).toBeLessThan(status.y);
  expect(status.y).toBeLessThan(agents.y);
  expect(agents.y).toBeLessThan(side.y);
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth)).toBe(true);
  // One profile button, the top bar's.
  await expect(page.locator('.profile-button:visible')).toHaveCount(1);
  await page.screenshot({ path: `${shots}/deck-390-light.png`, fullPage: true });
});

test('the compact rail labels its icons on hover and keyboard focus', async ({ page }) => {
  await home(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'Main' });
  const tooltip = rail.locator('.rail-tooltip');
  for (const name of ['Home', 'Bots', 'Brain', 'Legal', 'Settings']) {
    await rail.getByRole('link', { name, exact: true }).hover();
    await expect(tooltip).toHaveText(name);
    await expect(tooltip).toBeVisible();
  }
  const settings = rail.getByRole('link', { name: 'Settings' });
  expect(await settings.locator('svg path').getAttribute('d')).toContain('a2.3 2.3');
  await page.mouse.move(500, 50);
  await expect(tooltip).toHaveCount(0);
  await settings.focus();
  await expect(tooltip).toHaveText('Settings');
  expect((await tooltip.boundingBox())!.x).toBeGreaterThan((await rail.boundingBox())!.width);
  await expect(page.locator('.composer-bar .fn-talk')).toHaveCSS('background-color', 'rgb(173, 216, 245)');
  await page.screenshot({ path: `${shots}/deck-settings-tooltip.png` });
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Personalize' })).toBeVisible();
});

test('Legal keeps your papers as Brain notes: add a file, open it, remove it after a second tap', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'light'));
  await home(page);
  const notes: Record<string, { title: string; up?: string; body: string; files: string[] }> = {};
  const note = (title: string) => ({ title, path: `${title}.md`, hub: false, tags: [], updated: now(), links: [], up: notes[title]?.up, body: notes[title]?.body ?? '', files: notes[title]?.files ?? [] });
  const graph = () => ({ nodes: Object.values(notes).map(n => ({ id: n.title, title: n.title, kind: 'note', up: n.up, size: 1 })), links: [] });
  await page.route('**/api/brain', r => r.fulfill({ json: { graph: graph(), suggestions: [], added: 0, folder: '~/.taurus/brain' } }));
  await page.route('**/api/brain/note*', r => {
    if (r.request().method() === 'POST') { const b = r.request().postDataJSON(); notes[b.title] = { title: b.title, up: b.up, body: b.body ?? '', files: notes[b.title]?.files ?? [] }; return r.fulfill({ json: { note: note(b.title), graph: graph() } }); }
    const title = new URL(r.request().url()).searchParams.get('title')!;
    return r.fulfill({ json: { note: note(title) } });
  });
  await page.route('**/api/brain/file*', r => {
    const u = new URL(r.request().url()), title = u.searchParams.get('note')!, name = u.searchParams.get('name')!;
    if (r.request().method() === 'POST') { notes[title].files.push(name); return r.fulfill({ json: { note: note(title), file: name, graph: graph() } }); }
    if (r.request().method() === 'DELETE') { notes[title].files = notes[title].files.filter(f => f !== name); return r.fulfill({ json: { note: note(title), graph: graph() } }); }
    return r.fulfill({ body: 'Alex Example', contentType: 'text/plain' });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#legal');
  await expect(page.getByRole('heading', { name: 'Legal', level: 1 })).toBeVisible();
  for (const name of ['Resume', 'Contracts', 'Company papers', 'Taxes', 'IDs and licenses']) await expect(page.getByRole('region', { name })).toBeVisible();
  const resume = page.getByRole('region', { name: 'Resume' });
  await resume.locator('input[type=file]').setInputFiles({ name: 'alex-example-resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fictional') });
  await expect(resume.getByRole('link', { name: 'alex-example-resume.pdf' })).toHaveAttribute('href', '/api/brain/file?name=alex-example-resume.pdf');
  await expect(resume.locator('.deck-count')).toHaveText('1 file');
  // Filed under Legal in the Brain.
  expect(notes.Resume.up).toBe('Legal');
  expect(notes.Legal).toBeTruthy();
  await page.screenshot({ path: `${shots}/legal-1440-light.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await resume.getByRole('button', { name: 'Remove alex-example-resume.pdf' }).click();
  await expect(resume.getByRole('link', { name: 'alex-example-resume.pdf' })).toBeVisible();
  await resume.getByRole('button', { name: 'Remove alex-example-resume.pdf for good' }).click();
  await expect(resume.locator('.deck-count')).toHaveText('Empty');
  // Your own section.
  await page.getByLabel('A folder of your own, like Insurance or Immigration.').fill('Insurance');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Insurance' })).toBeVisible();
});

// ---------- Bots (owner, November 23, 2026) ----------
// A swarm of n fictional helpers on example.com pages, each a step into its job.
const crew = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `h${i + 1}`, n: i + 1, name: `Helper ${i + 1}`, colour: ['#7FC1EE', '#FF9CC5', '#FF8A3D', '#5B6B80'][i % 4],
  label: `example${i + 1}.com`, doing: `Reading example${i + 1}.com`, state: i === 1 ? 'done' : 'working', finding: i === 1 ? 'Lamp B is $49 on example2.com' : undefined, host: `example${i + 1}.com`, moves: 0, at: now() }));
async function swarmOf(page: Page, n: number) {
  await mock(page);
  await page.route('**/api/prefs', r => r.fulfill({ json: r.request().method() === 'POST' ? r.request().postDataJSON() : opensToHome }));
  await page.route('**/api/swarm/stream', r => r.fulfill(stream(`event: swarm\ndata: ${JSON.stringify({ id: 's1', job: 'Compare desk lamps', kind: 'research', state: 'running', helpers: crew(n), startedAt: now(), width: 800, height: 1000, parallel: n })}\n\n`)));
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('bots working for you sit in boxes around Taurus, big when few; a click shows one in Agents with its thoughts, and Expand opens it in Bots', async ({ page }) => {
  await swarmOf(page, 5);
  await page.goto('/');
  const ring = page.getByRole('group', { name: '5 bots working' });
  const boxes = ring.locator('.bot-box');
  await expect(boxes).toHaveCount(5);
  // Tilted a little, so the box's frame is a touch wider than 60.
  expect((await boxes.first().boundingBox())!.width).toBeGreaterThan(58);
  expect((await boxes.first().boundingBox())!.width).toBeLessThan(66);
  // Loosely around Taurus's window, on both sides, never on top of it, and not lined up in a grid.
  const win = await box(page, '.deck-logo-win');
  const spots = await Promise.all((await boxes.all()).map(b => b.boundingBox().then(r => r!)));
  const overlaps = (a: typeof win, b: typeof win) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const s of spots) expect(overlaps(s, win)).toBe(false);
  expect(spots.some(s => s.x + s.width <= win.x)).toBe(true);
  expect(spots.some(s => s.x >= win.x + win.width)).toBe(true);
  expect(new Set(spots.map(s => Math.round(s.x))).size).toBeGreaterThan(2);
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(overlaps(spots[i], spots[j])).toBe(false);
  // Each wears its own little Taurus.
  await expect(boxes.locator('.bot-mascot')).toHaveCount(5);
  // A working bot's light pulses; the finished one's doesn't.
  await expect(page.getByRole('button', { name: /^Helper 1, Working/ }).locator('.bot-light')).toHaveCSS('animation-name', 'bot-pulse');
  await expect(page.getByRole('button', { name: /^Helper 2, Done/ }).locator('.bot-light')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: /^Helper 3, Working/ }).click();
  const agents = page.getByRole('region', { name: 'Agents' });
  await expect(agents.getByRole('group')).toHaveAccessibleName(/^Helper 3,/);
  await expect(page.getByRole('list', { name: 'What Helper 3 is thinking' })).toContainText('Reading example3.com');
  await expect(page.getByRole('button', { name: /^Helper 3, Working/ })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${shots}/deck-bots-5-1440-light.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  await agents.getByRole('link', { name: 'Expand' }).click();
  await expect(page).toHaveURL(/#bots\/h-h3$/);
  await expect(page.getByRole('heading', { name: 'Helper 3', level: 1 })).toBeVisible();
});

test('at most fifteen boxes, smaller as more bots work', async ({ page }) => {
  await swarmOf(page, 18);
  await page.goto('/');
  const boxes = page.locator('.bot-ring .bot-box');
  await expect(boxes).toHaveCount(15);
  expect((await boxes.first().boundingBox())!.width).toBeGreaterThan(30);
  expect((await boxes.first().boundingBox())!.width).toBeLessThan(40);
  const win = await box(page, '.deck-logo-win');
  for (const b of await boxes.all()) { const r = (await b.boundingBox())!; expect(r.x < win.x + win.width && win.x < r.x + r.width && r.y < win.y + win.height && win.y < r.y + r.height).toBe(false); }
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.screenshot({ path: `${shots}/deck-bots-15-1440-dark.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
});

test('Bots lists every bot and shows one bot\'s whole chat; the message box asks Taurus about it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'light'));
  await swarmOf(page, 4);
  const asked: string[] = [];
  await page.route('**/api/ask', r => { asked.push(r.request().postDataJSON().turns.at(-1).text); return r.fulfill({ json: { provider: '', text: 'Helper 2 found Lamp B for $49.', proposals: [] } }); });
  await page.goto('/#bots/h-h2');
  const list = page.getByRole('navigation', { name: 'Bots' });
  for (const name of ['Taurus', 'Helper 1', 'Helper 2', 'Helper 4']) await expect(list.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(list.getByRole('link', { name: /^Helper 2/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Helper 2', level: 1 })).toBeVisible();
  await expect(page.locator('.bots-role')).toHaveText('Helper · Compare desk lamps');
  const log = page.getByRole('log', { name: 'Everything Helper 2 did' });
  await expect(log).toContainText('Lamp B is $49 on example2.com');
  await expect(log.locator('.bots-say').first()).toHaveCSS('border-top-left-radius', '20px');
  await expect(page.locator('.bots-composer')).toHaveCSS('border-top-left-radius', '27px');
  await page.screenshot({ path: `${shots}/bots-1440-light.png` });
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  const draft = page.getByLabel('Ask Taurus about Helper 2');
  await draft.fill('which lamp is cheapest?');
  await draft.press('Enter');
  await expect.poll(() => asked).toEqual(['About Helper 2 (Helper · Compare desk lamps, on example2.com): which lamp is cheapest?']);
  // Taurus's own chat holds the conversation.
  await list.getByRole('link', { name: /^Taurus/ }).click();
  await expect(page.getByRole('log', { name: 'Everything Taurus did' })).toContainText('Helper 2 found Lamp B for $49.');
  // The page-wide chat bar steps aside here.
  await expect(page.locator('.chatbar')).toBeHidden();
  // So does the floating Swarm panel: this page already shows every bot.
  await expect(page.locator('.swarm-panel')).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Taurus', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeInViewport();
  await expect(list).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/bots-390-light.png`, fullPage: true });
  await page.getByRole('link', { name: 'All bots' }).click();
  await expect(list).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toHaveCount(0);
});

test('Light mode redraws Taurus in dark ink so he never disappears', async ({ page }) => {
  await home(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await page.waitForTimeout(400);
  // The orb's canvas has dark pixels on the light window once Light is on.
  const dark = await page.locator('.deck-logo .particle-orb').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 120 && d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 110) n++;
    return n;
  });
  expect(dark).toBeGreaterThan(50);
});
