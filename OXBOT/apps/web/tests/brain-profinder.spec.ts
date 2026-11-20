import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// The Brain and ProFinder (owner, November 16, 2026). Fictional notes, files, companies and people, mocked /api only:
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
  const memory = () => ({
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

  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/brain-memory-1440-dark.png`, fullPage: true });
  const axe = await new AxeBuilder({ page }).include('.brain-memory').analyze();
  expect(axe.violations).toEqual([]);
});

// ---------- ProFinder ----------

const job = (id: string, title: string, company: string, stage: string, score: number, extra: Record<string, unknown> = {}) => ({
  id, title, company, location: 'San Francisco, CA', remote: false, url: `https://jobs.example.com/${id}`, applyUrl: `https://jobs.example.com/${id}/apply`, sources: ['Greenhouse'], kind: 'internship',
  posted: iso(-60 * 24 * 3), text: '', score, why: ['Role fits', 'Internship', 'Shares python, sql, aws'], stage, foundAt: iso(-60), updatedAt: iso(-30), ...extra,
});
const jobs = [
  job('a00000000001', 'Software Engineering Intern', 'Example Corp', 'ready', 92),
  job('a00000000002', 'Backend Engineer Intern', 'Example Labs', 'ready', 86, { location: 'Remote, US', remote: true, sources: ['Lever'] }),
  job('a00000000003', 'Data Engineering Intern', 'Example Analytics', 'ready', 81, { sources: ['Ashby', 'Simplify'], pay: '$48/hr' }),
  job('a00000000004', 'Software Engineer Intern', 'Example Robotics', 'needs-you', 77, { needs: 'This site wants you to sign in. Taurus doesn’t sign in or make accounts: apply there yourself, then mark it applied.', sources: ['Simplify'], location: 'Austin, TX' }),
  job('a00000000005', 'Platform Engineering Intern', 'Example Cloud', 'shortlisted', 79),
  job('a00000000006', 'Machine Learning Intern', 'Example AI', 'shortlisted', 74, { location: 'New York, NY' }),
  job('a00000000007', 'Software Engineer Intern', 'Example Health', 'applied', 83, { appliedAt: iso(-60 * 24 * 2) }),
  job('a00000000008', 'Infrastructure Intern', 'Example Bank', 'response', 71, { appliedAt: iso(-60 * 24 * 9) }),
  job('a00000000009', 'Frontend Engineer Intern', 'Example Studio', 'found', 58),
  job('a00000000010', 'Software Engineer Intern, Mobile', 'Example Travel', 'found', 52, { location: 'Seattle, WA' }),
];
const info = {
  prefs: { roles: ['Software engineer intern', 'Data engineer intern'], kinds: ['internship'], locations: ['San Francisco', 'New York'], remote: 'yes', start: 'June 2027', pay: '', boards: ['greenhouse:examplecorp', 'lever:examplelabs', 'ashby:exampleanalytics'], simplify: true, adzuna: false, country: 'us', keywords: [], avoid: [], shortlistAt: 70, aiScoring: true },
  answers: { 'First name': 'Alex', 'Last name': 'Example', Email: 'alex@example.com', 'Work authorization': 'Yes', 'Needs sponsorship': 'No' },
  answerKeys: ['First name', 'Last name', 'Email', 'Phone', 'Work authorization', 'Needs sponsorship'],
  resume: { file: 'Alex Example Resume.pdf', words: 412 }, jobs,
  counts: { found: 2, shortlisted: 2, ready: 3, 'needs-you': 1, applied: 1, response: 1, skipped: 0 },
  lastRun: { at: iso(-25), seen: 38, added: 10, shortlisted: 6, errors: [], ai: 'OpenRouter free model' }, busy: '',
  log: [{ at: iso(-60 * 24 * 2), jobId: 'a00000000007', title: 'Software Engineer Intern', company: 'Example Health', url: 'https://jobs.example.com/a00000000007/apply', outcome: 'applied' }],
  schedule: { on: true, when: 'every day at 8am' },
};
const lines = (company: string) => [{ label: 'Site', value: 'example.com' }, { label: 'First Name', value: 'Alex' }, { label: 'Last Name', value: 'Example' }, { label: 'Email', value: 'alex@example.com' }, { label: 'Resume/CV', value: 'Alex Example Resume.pdf (file)' }, { label: 'Cover note', value: `I’d like to join ${company} to build reliable data services.` }, { label: 'Button', value: 'Submit application' }];
const batch = {
  id: '0b6f3c1e-2222-4000-8000-000000000002', kind: 'profinder.batch', app: 'ProFinder', title: 'Send 3 job applications', lines: [], editable: false, from: 'board', createdAt: iso(-1), expiresAt: iso(59), state: 'pending', digest: 'digest-batch',
  caution: 'Each checked application goes to that company exactly as shown. Uncheck any you don’t want.',
  items: jobs.filter(j => j.stage === 'ready').map(j => ({ id: j.id, title: `${j.title} at ${j.company}`, link: j.applyUrl, lines: lines(j.company) })),
};

test('ProFinder shows the pipeline and one batch card that sends only the checked jobs', async ({ page }) => {
  await mock(page, false, [batch]);
  let approved: { keep: string[] } | undefined;
  await page.route('**/api/profinder', r => r.fulfill({ json: info }));
  await page.route(`**/api/approvals/${batch.id}/approve`, r => { approved = r.request().postDataJSON(); return r.fulfill({ json: { proposal: { ...batch, state: 'done', kept: approved!.keep, result: 'Sending 2 applications, one at a time.' } } }); });
  await page.goto('/#profinder');
  await expect(page.getByRole('heading', { name: 'ProFinder', level: 1 })).toBeVisible();
  await expect(page.getByText('2 matches shortlisted. 3 ready to send. 1 needs you. 1 applied.')).toBeVisible();
  await expect(page.getByText(/: 38 fitting postings, 10 new\. AI scoring OpenRouter free model\. Searches every day at 8am\./)).toBeVisible();
  const board = page.getByRole('region', { name: 'Pipeline' });
  for (const [name, n] of [['Needs you', 1], ['Shortlisted', 2], ['Ready to send', 3], ['Applied', 1], ['Heard back', 1], ['Found', 2]] as const) await expect(board.getByRole('heading', { name: `${name} ${n}` })).toBeVisible();
  await expect(board.getByText(/This site wants you to sign in/)).toBeVisible();
  // The card is on this page once, not again in the floating tray.
  await expect(page.getByRole('complementary', { name: 'Waiting for your OK' })).toHaveCount(0);
  const card = page.getByRole('article', { name: 'Send 3 job applications' });
  await expect(card.getByRole('checkbox')).toHaveCount(3);
  await expect(card.getByText('Uncheck any you don’t want.', { exact: false })).toBeVisible();
  await card.getByText('What will be sent').first().click();
  await expect(card.getByText('Alex Example Resume.pdf (file)').first()).toBeVisible();
  expect(await smallest(page)).toBeGreaterThanOrEqual(13);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: `${shots}/profinder-1440-dark.png`, fullPage: true });

  await card.getByRole('checkbox', { name: 'Backend Engineer Intern at Example Labs' }).uncheck();
  await card.getByRole('button', { name: 'Approve and send 2' }).click();
  await expect.poll(() => approved).toEqual({ digest: 'digest-batch', via: 'board', keep: ['a00000000001', 'a00000000003'] });
});

test('ProFinder on a phone, light, fits the screen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'light'));
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, false, [batch]);
  await page.route('**/api/profinder', r => r.fulfill({ json: info }));
  await page.goto('/#profinder');
  await expect(page.getByRole('heading', { name: 'ProFinder', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: `${shots}/profinder-390-light.png`, fullPage: true });
});
