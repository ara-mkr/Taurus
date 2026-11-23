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
  return posted;
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
