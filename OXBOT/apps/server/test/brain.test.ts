// The Brain (owner, November 16, 2026): an Obsidian-style vault in a temp folder, with fictional notes and files only.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-brain-'));
process.env.TAURUS_BROKER_URL = '';
process.env.TAURUS_NO_SCHEDULER = '1';
const brain = await import('../src/brain.ts');
const { remember } = await import('../src/memory.ts');
const { toolCalls } = await import('../src/agent.ts');

// A one-page PDF with one line of text, built by hand so the test needs no file on disk.
export function tinyPdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('frontmatter reads scalars, inline lists, block lists and link properties, and writes back the same', () => {
  const text = '---\nkind: hub\nup: "[[Me]]"\ntags: [school, grades]\naliases:\n  - Uni\n  - College\nupdated: 2026-11-16T09:00:00.000Z\n---\nClasses and grades.\n';
  const { meta, body } = brain.parseNote(text);
  assert.deepEqual(meta, { kind: 'hub', up: '[[Me]]', tags: ['school', 'grades'], aliases: ['Uni', 'College'], updated: '2026-11-16T09:00:00.000Z' });
  assert.equal(body, 'Classes and grades.\n');
  const again = brain.parseNote(brain.writeNote(meta, body));
  assert.deepEqual(again.meta, meta);
  assert.equal(again.body, body);
  assert.deepEqual(brain.parseNote('No frontmatter here.'), { meta: {}, body: 'No frontmatter here.' });
});

test('links: plain, aliased, to a heading, embedded files, and nothing inside code', () => {
  const r = brain.parseLinks('See [[Career]] and [[Resume|my resume]], [[School#Grades]] and [[Notes.md]].\n![[resume.pdf]] [[transcript.pdf|transcript]] ![[Hobbies]]\n`[[Not a link]]`\n```\n[[Also not]]\n```\n[[ ]]');
  assert.deepEqual(r.links.sort(), ['Career', 'Hobbies', 'Notes', 'Resume', 'School']);
  assert.deepEqual(r.files.sort(), ['resume.pdf', 'transcript.pdf']);
});

test('the vault starts with the main dots, and a child note lands in its hub’s folder as plain markdown', () => {
  const titles = brain.notes().map(n => n.title);
  for (const h of ['Me', 'Personality', 'Career', 'School', 'Friends', 'Family', 'Hobbies', 'Projects']) assert.ok(titles.includes(h), h);
  assert.match(readFileSync(join(brain.brainDir(), 'Career.md'), 'utf8'), /^---\nkind: hub\nup: "\[\[Me\]\]"\nupdated: /);
  const n = brain.saveNote({ title: 'Resume', up: 'Career', body: 'Example resume text.\n', tags: ['career'] });
  assert.equal(n.path, join('Career', 'Resume.md'));
  const raw = readFileSync(join(brain.brainDir(), 'Career', 'Resume.md'), 'utf8');
  assert.match(raw, /^---\nup: "\[\[Career\]\]"\ntags: \[career\]\nupdated: \S+\n---\nExample resume text\.\n$/);
  // Titles can't escape the vault or carry the characters links use.
  assert.equal(brain.cleanTitle('../../etc/passwd'), '.. etc passwd');
  assert.equal(brain.cleanTitle('A [[weird]] #title'), 'A weird title');
  assert.throws(() => brain.cleanTitle('   '), /title/);
});

test('the graph links notes to their hub, hubs to Me, files to their note, and shows missing links faintly', () => {
  brain.saveNote({ title: 'Chess', up: 'Hobbies', body: 'Plays with [[Sam Example]] on Sundays.' });
  const g = brain.graph();
  const has = (a: string, b: string) => g.links.some(l => (l.source === a && l.target === b) || (l.source === b && l.target === a));
  assert.ok(has('Resume', 'Career'));
  assert.ok(has('Career', 'Me'));
  assert.ok(has('Chess', 'Hobbies'));
  assert.equal(g.nodes.find(n => n.id === 'Sam Example')?.kind, 'missing');
  assert.equal(g.nodes.find(n => n.id === 'Career')?.kind, 'hub');
  // No edge twice.
  assert.equal(new Set(g.links.map(l => [l.source, l.target].sort().join('|'))).size, g.links.length);
});

test('renaming a note rewrites every link to it; hubs keep their names', () => {
  brain.saveNote({ title: 'Weekend', up: 'Hobbies', body: 'Usually [[Chess]], sometimes [[Chess|a game]].' });
  brain.saveNote({ title: 'Chess club', was: 'Chess' });
  assert.equal(brain.getNote('Weekend').body.trim(), 'Usually [[Chess club]], sometimes [[Chess club|a game]].');
  assert.throws(() => brain.getNote('Chess'), /no note/);
  assert.throws(() => brain.saveNote({ title: 'Work', was: 'Career' }), /keeps its name/);
  assert.throws(() => brain.saveNote({ title: 'Resume', was: 'Weekend' }), /already exists/);
});

test('files attach under a note, are read for a prompt (PDFs too), and come off into the trash', async () => {
  const r = brain.attach('School', 'transcript.pdf', tinyPdf('Transcript: GPA 3.9, Example State University'));
  assert.equal(r.file, 'transcript.pdf');
  assert.ok(brain.getNote('School').files.includes('transcript.pdf'));
  assert.match(brain.getNote('School').body, /## Files\n!\[\[transcript\.pdf\]\]/);
  assert.equal(await brain.fileText('transcript.pdf'), 'Transcript: GPA 3.9, Example State University');
  // Same name again gets a number; a path in the name is dropped; other types are refused.
  assert.equal(brain.attach('School', '../../transcript.pdf', tinyPdf('Second')).file, 'transcript 2.pdf');
  assert.ok(existsSync(join(brain.brainDir(), 'attachments', 'transcript 2.pdf')));
  assert.throws(() => brain.attach('School', 'run.sh', Buffer.from('echo hi')), /Add a PDF/);
  assert.throws(() => brain.attach('School', 'empty.txt', Buffer.alloc(0)), /empty/);
  assert.throws(() => brain.filePath('../memory.json'), /Add a PDF|No file/);
  brain.detach('School', 'transcript 2.pdf');
  assert.ok(!brain.getNote('School').files.includes('transcript 2.pdf'));
  assert.ok(!existsSync(join(brain.brainDir(), 'attachments', 'transcript 2.pdf')));
  assert.ok(readdirSync(join(brain.brainDir(), '.trash')).some(f => f.endsWith('transcript 2.pdf')));
});

test('memories go under the dot they fit, once each, and search and Taurus’s tools find them', async () => {
  remember('my GPA is 3.9 at Example State University');
  remember('I take my coffee black');
  remember('my sister Maya Example has a birthday on March 3');
  assert.equal(brain.syncMemories(), 3);
  assert.equal(brain.syncMemories(), 0);
  assert.match(brain.getNote('School').body, /## Remembered\n- my GPA is 3\.9 at Example State University \^m-[a-f0-9]{8}/);
  assert.match(brain.getNote('Personality').body, /coffee black/);
  assert.match(brain.getNote('Family').body, /Maya Example/);
  assert.equal(brain.search("what's my gpa")[0].title, 'School');
  const found = await brain.brainTool('brain_search', { query: 'gpa' }) as { results: { title: string }[] };
  assert.equal(found.results[0].title, 'School');
  const read = await brain.brainTool('brain_read', { note: 'School', file: 'transcript.pdf' }) as { text: string };
  assert.match(read.text, /GPA 3\.9/);
  assert.match(String((await brain.brainTool('brain_read', { note: 'School', file: 'other.pdf' }) as { error: string }).error), /isn’t on School/);
  // The AI asks for them in the plain-text tool protocol every model can use.
  assert.deepEqual(toolCalls('<tool>{"name": "brain_search", "args": {"query": "gpa"}}</tool>'), [{ name: 'brain_search', args: { query: 'gpa' } }]);
});

test('“Add to Brain?”: what Taurus picked up waits for a yes, then lands under the note it fits', () => {
  const s = brain.suggest('Plays chess at the Example Club on Sundays', 'Chess club', 'Said it while planning the weekend');
  assert.equal(brain.suggest('plays chess at the example club on sundays').id, s.id);
  assert.ok(!brain.getNote('Chess club').body.includes('Example Club'));
  brain.decide(s.id, true);
  assert.match(brain.getNote('Chess club').body, /## Learned\n- Plays chess at the Example Club on Sundays/);
  const other = brain.suggest('Thinks about moving to Example City');
  assert.equal(other.note, 'Personality');
  brain.decide(other.id, false);
  assert.equal(brain.suggestions().length, 0);
  assert.ok(!brain.getNote('Personality').body.includes('Example City'));
});

test('removing a note moves it to the trash; the main dots stay', () => {
  brain.removeNote('Weekend');
  assert.throws(() => brain.getNote('Weekend'), /no note/);
  assert.ok(readdirSync(join(brain.brainDir(), '.trash')).some(f => f.startsWith('Weekend.')));
  assert.throws(() => brain.removeNote('Family'), /stays/);
});
