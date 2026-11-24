import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// The Brain (owner, November 16, 2026; ProFinder was removed November 22, 2026). Fictional notes, files, companies and people, mocked /api only:
// nothing reads a real vault, searches a real board or sends an application.

test.use({ reducedMotion: 'reduce' });
const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const smallest = (page: Page) => page.evaluate(() => Math.min(...[...document.querySelectorAll('main *')].filter(el => el.childNodes[0]?.nodeType === 3 && (el as HTMLElement).offsetParent).map(el => parseFloat(getComputedStyle(el).fontSize))));

const hubs = ['Me', 'Personality', 'Career', 'School', 'Friends', 'Family', 'Hobbies', 'Projects'];
const children: [string, string][] = [['Resume', 'Career'], ['Job preferences', 'Career'], ['Application answers', 'Career'], ['Example Corp internship', 'Career'],
  ['Data Structures', 'School'], ['Grades', 'School'], ['Sam Example', 'Friends'], ['Riley Example', 'Friends'], ['Maya Example', 'Family'],
  ['Chess club', 'Hobbies'], ['Climbing', 'Hobbies'], ['Trail notes app', 'Projects'], ['How I like to work', 'Personality']];
const files: [string, string][] = [['Alex Example Resume.pdf', 'Resume'], ['transcript.pdf', 'Grades'], ['portfolio.pdf', 'Career']];
const graph = {
  nodes: [
    ...hubs.map(t => ({ id: t, title: t, kind: 'hub', up: t === 'Me' ? undefined : 'Me', size: t === 'Me' ? 10 : 8 })),
    ...children.map(([t, up]) => ({ id: t, title: t, kind: 'note', up, size: 2.5 })),
    ...files.map(([f, up]) => ({ id: `file:${f}`, title: f, kind: 'file', up, size: 1.5 })),
    { id: 'Example Climbing Gym', title: 'Example Climbing Gym', kind: 'missing', up: undefined, size: 1 },
  ],
  links: [
    ...hubs.filter(t => t !== 'Me').map(t => ({ source: t, target: 'Me' })),
    ...children.map(([t, up]) => ({ source: t, target: up })),
    ...files.map(([f, up]) => ({ source: up, target: `file:${f}` })),
    { source: 'Climbing', target: 'Example Climbing Gym' }, { source: 'Sam Example', target: 'Chess club' }, { source: 'Example Corp internship', target: 'Resume' },
  ],
};
const note = (title: string, up: string | undefined, body: string, files: string[] = []) => ({ title, path: `${up ?? ''}/${title}.md`, hub: hubs.includes(title), up, tags: [], updated: iso(-60), body, links: [], files });
const notes: Record<string, ReturnType<typeof note>> = {
  Resume: note('Resume', 'Career', 'Alex Example, computer science at Example State University.\n\n## Experience\n- Data intern at [[Example Corp internship|Example Corp]]\n- Teaching assistant, [[Data Structures]]\n\n## Files\n![[Alex Example Resume.pdf]]\n', ['Alex Example Resume.pdf']),
  Career: note('Career', 'Me', 'Jobs, internships, your resume, and how applications should be answered.\n\n## Remembered\n- Wants a backend internship for summer 2027 ^m-1a2b3c4d\n', ['portfolio.pdf']),
  Grades: note('Grades', 'School', 'GPA 3.8. Dean’s list twice.\n', ['transcript.pdf']),
};

async function mockBrain(page: Page) {
  const posted: { url: string; body: unknown }[] = [];
  await page.route('**/api/brain', r => r.fulfill({ json: { graph, suggestions: [{ id: 's-0a1b2c3d', fact: 'Plays chess at the Example Club on Sundays', note: 'Chess club', at: iso(-5) }], added: 0, folder: '~/.taurus/brain' } }));
  await page.route('**/api/brain/note?**', r => { const t = new URL(r.request().url()).searchParams.get('title')!; return r.fulfill({ json: { note: notes[t] ?? note(t, graph.nodes.find(n => n.id === t)?.up, `Notes about ${t}.\n`) } }); });
  await page.route('**/api/brain/file?**', r => { posted.push({ url: r.request().url(), body: r.request().method() }); return r.fulfill({ json: { note: { ...notes.Resume, files: [...notes.Resume.files, 'cover.txt'] }, file: 'cover.txt', graph } }); });
  await page.route('**/api/brain/suggestions/*', r => { posted.push({ url: r.request().url(), body: r.request().postDataJSON() }); return r.fulfill({ json: { suggestions: [], graph } }); });
  await mockMemory(page, posted);
  return posted;
}

// Core memory and recall (Luke's Day 2, November 20, 2026). A pretend vault of 48 facts; nothing is real.
const recalled = [
  { id: 'Grades#0', text: 'GPA 3.8. Dean’s list twice.', from: 'note', where: 'Grades' },
  { id: 'transcript.pdf#2', text: 'Data Structures: A. Algorithms: A-.', from: 'file', where: 'transcript.pdf on Grades' },
];
async function mockMemory(page: Page, posted: { url: string; body: unknown }[]) {
  let core = [{ id: 'c-0a1b2c3d', text: 'Always sign emails as Alex', kind: 'rule', at: iso(-90) }, { id: 'c-1a2b3c4d', text: 'Studies computer science at Example State', kind: 'fact', at: iso(-80) }];
  let picker = true, sharingOn = false;
  const KEY = '0123456789abcdef'.repeat(3);
  const memory = () => ({
    picker, sharing: sharingOn ? { on: true, url: 'http://127.0.0.1:8787/mcp', key: KEY, uses: 2, lastUse: { at: iso(-1), app: 'claude-code', tool: 'memory_search' } } : { on: false, url: 'http://127.0.0.1:8787/mcp', uses: 0 },
    core, used: core.reduce((n, c) => n + c.text.length + 3, 0), budget: 3000, facts: 48, chars: 6210,
    report: '', stats: { questions: 12, factsSent: 30, charsSent: 2400, charsAll: 74520, last: { at: iso(-2), asked: 'what was my gpa last semester', facts: recalled, pool: 48, poolChars: 6210, sentChars: 64 } },
  });
  await page.route('**/api/brain/memory', r => r.fulfill({ json: memory() }));
  await page.route('**/api/brain/core**', r => {
    const req = r.request();
    posted.push({ url: req.url(), body: req.method() === 'POST' ? req.postDataJSON() : req.method() });
    if (req.method() === 'POST') core = [...core, { id: 'c-2b3c4d5e', text: String(req.postDataJSON().text), kind: /^always|^never/i.test(req.postDataJSON().text) ? 'rule' : 'fact', at: iso(0) }];
    else core = core.filter(c => c.id !== new URL(req.url()).searchParams.get('id'));
    return r.fulfill({ json: memory() });
  });
  await page.route('**/api/brain/recall?**', r => r.fulfill({ json: { facts: [{ id: 'Maya Example#1', text: 'Birthday: June 4', from: 'note', where: 'Maya Example, Basics' }], pool: 48, poolChars: 6210, sentChars: 16 } }));
  await page.route('**/api/brain/sharing', r => { sharingOn = r.request().postDataJSON().on; posted.push({ url: r.request().url(), body: r.request().postDataJSON() }); return r.fulfill({ json: memory() }); });
  await page.route('**/api/brain/picker', r => { picker = r.request().postDataJSON().on; posted.push({ url: r.request().url(), body: r.request().postDataJSON() }); return r.fulfill({ json: memory() }); });
  await page.route('**/api/brain/export', r => r.fulfill({ json: { text: 'About me (from Taurus, my assistant):\n- Studies computer science at Example State' } }));
}

test('the Brain draws every note as a dot, opens a note with its files, finds, adds and takes a file', async ({ page }) => {
  await mock(page);
  const posted = await mockBrain(page);
  await page.goto('/#brain');
  await expect(page.getByRole('heading', { name: 'Brain', level: 1 })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Brain graph: 21 notes and 3 files. Every note is also listed beside it.' })).toBeVisible();
  await expect(page.locator('.brain-graph canvas').first()).toBeVisible();
  await expect(page.getByText('21 notes, 3 files in ~/.taurus/brain.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Taurus learned one thing. Add it to your Brain?' })).toBeVisible();

  // The whole map, fitted, before any note is open.
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${shots}/brain-graph-1440-dark.png` });

  const outline = page.getByRole('navigation', { name: 'All notes' });
  await outline.getByRole('button', { name: 'Resume', exact: true }).click();
  const side = page.getByRole('complementary', { name: 'Note' });
  await expect(side.getByRole('heading', { name: 'Resume', level: 2 })).toBeVisible();
  await expect(side.getByRole('button', { name: 'Example Corp', exact: true })).toBeVisible();
  await expect(side.getByText('Alex Example Resume.pdf')).toBeVisible();
  await expect(side.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/api/brain/file?name=Alex%20Example%20Resume.pdf');
  await expect(side.getByRole('button', { name: 'Ask Taurus about it' })).toBeVisible();
  await expect(page).toHaveURL(/#brain\/Resume$/);
  await page.waitForTimeout(1500);
  expect(await smallest(page)).toBeGreaterThanOrEqual(13);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: `${shots}/brain-note-1440-dark.png` });

  // Search narrows the list and the dots; Enter opens the first match.
  const find = page.getByRole('searchbox', { name: 'Find a note' });
  await find.fill('grad');
  await expect(outline.getByRole('heading', { name: '1 found' })).toBeVisible();
  await find.press('Enter');
  await expect(side.getByRole('heading', { name: 'Grades', level: 2 })).toBeVisible();
  await expect(side.getByText('GPA 3.8. Dean’s list twice.')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/brain-search-1440-dark.png` });

  // A file chosen (or dropped) goes up under the open note.
  await find.fill('');
  await outline.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(side.getByRole('heading', { name: 'Resume', level: 2 })).toBeVisible();
  await page.locator('#brain-file').setInputFiles({ name: 'cover.txt', mimeType: 'text/plain', buffer: Buffer.from('A fictional cover note.') });
  await expect(side.getByText('cover.txt')).toBeVisible();
  expect(posted.some(p => p.url.includes('/api/brain/file?note=Resume&name=cover.txt') && p.body === 'POST')).toBe(true);

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Taurus learned/ })).toHaveCount(0);
  expect(posted.at(-1)).toEqual({ url: expect.stringContaining('/api/brain/suggestions/s-0a1b2c3d'), body: { add: true } });
});

test('the Brain on a phone stacks the graph over the note', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await mockBrain(page);
  await page.goto('/#brain/Career');
  await expect(page.getByRole('complementary', { name: 'Note' }).getByRole('heading', { name: 'Career', level: 2 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${shots}/brain-390-dark.png`, fullPage: true });
});

test('Memory: core memory against its budget, what the last question sent, try a question, copy for other AIs', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mock(page);
  const posted = await mockBrain(page);
  await page.goto('/#brain');
  const panel = page.getByRole('region', { name: 'Memory' });
  await expect(panel.getByText('Taurus sends core memory with every question, and only the saved facts that fit it.', { exact: false })).toBeVisible();
  await expect(panel.getByText('73 of 3,000 characters')).toBeVisible();
  await expect(panel.getByRole('meter')).toHaveAttribute('value', '73');
  await expect(panel.getByText('Always sign emails as Alex')).toBeVisible();
  await expect(panel.getByText('48 facts saved, 6,210 characters. Across 12 questions, about 18,030 tokens not sent.')).toBeVisible();
  await expect(panel.getByText('Last question, “what was my gpa last semester”: 2 of 48 facts, 64 characters instead of 6,210.')).toBeVisible();
  await expect(panel.getByText('GPA 3.8. Dean’s list twice.')).toBeVisible();

  await panel.getByLabel('Pin a rule or fact').fill('Never book meetings before 10am');
  await panel.getByRole('button', { name: 'Pin', exact: true }).click();
  await expect(panel.getByText('Never book meetings before 10am')).toBeVisible();
  expect(posted.at(-1)).toEqual({ url: expect.stringContaining('/api/brain/core'), body: { text: 'Never book meetings before 10am' } });
  await panel.getByRole('button', { name: 'Unpin Always sign emails as Alex' }).click();
  await expect(panel.getByText('Always sign emails as Alex')).toHaveCount(0);

  await panel.getByLabel('Try a question').fill('when is maya birthday');
  await panel.getByRole('button', { name: 'Try', exact: true }).click();
  await expect(panel.getByText('For “when is maya birthday”, Taurus would send 1 of 48 facts, 16 characters.')).toBeVisible();
  await panel.getByRole('button', { name: 'Maya Example, Basics' }).click();
  await expect(page.getByRole('complementary', { name: 'Note' }).getByRole('heading', { name: 'Maya Example', level: 2 })).toBeVisible();

  await panel.getByRole('button', { name: 'Copy for other AIs' }).click();
  await expect(panel.getByRole('status')).toHaveText(/Copied\. Paste it into Claude’s or ChatGPT’s custom instructions/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Studies computer science at Example State');

  // Sharper recall can be switched off; memory sharing turns on with an address, a hidden key and the Claude Code command.
  await panel.getByRole('switch', { name: /Sharper recall/ }).click();
  await expect(panel.getByRole('switch', { name: /Sharper recall/ })).not.toBeChecked();
  expect(posted.at(-1)).toEqual({ url: expect.stringContaining('/api/brain/picker'), body: { on: false } });
  const share = panel.getByRole('switch', { name: /Use this memory in your other AI apps/ });
  await expect(share).not.toBeChecked();
  await share.click();
  await expect(panel.getByText('http://127.0.0.1:8787/mcp')).toBeVisible();
  await expect(share).toBeChecked();
  expect(posted.at(-1)).toEqual({ url: expect.stringContaining('/api/brain/sharing'), body: { on: true } });
  await expect(panel.getByText('012345…')).toBeVisible();
  await expect(panel.getByText('0123456789abcdef0123456789abcdef0123456789abcdef')).toHaveCount(0);
  await expect(panel.getByText('2 times, last by claude-code')).toBeVisible();
  await panel.getByRole('button', { name: 'Copy the command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('claude mcp add --transport http taurus-memory http://127.0.0.1:8787/mcp --header "Authorization: Bearer 0123456789abcdef0123456789abcdef0123456789abcdef"');

  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/brain-memory-1440-dark.png`, fullPage: true });
  const axe = await new AxeBuilder({ page }).include('.brain-memory').analyze();
  expect(axe.violations).toEqual([]);
});
