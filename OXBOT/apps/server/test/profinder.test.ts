// ProFinder (owner, November 16, 2026): job search, scoring, dedupe and the one-tap batch card, against mocked job
// boards, a mocked free model and a fake form filler. Fictional companies and example.com people only: no real board is
// called and no application is sent. Any request the mock doesn't know fails the test.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-profinder-'));
process.env.TAURUS_BROKER_URL = '';
process.env.TAURUS_NO_SCHEDULER = '1';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY']) delete process.env[key];
const { store } = await import('../src/store.ts');
const pf = await import('../src/profinder.ts');
const brain = await import('../src/brain.ts');
const actions = await import('../src/actions/index.ts');
const { instant } = await import('../src/instant.ts');

const now = Date.now(), DAY = 86_400_000;
const calls: { method: string; url: string; body: string }[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input), method = (init.method ?? 'GET').toUpperCase(), body = init.body ? String(init.body) : '';
  calls.push({ method, url, body });
  if (url === 'https://boards-api.greenhouse.io/v1/boards/examplecorp/jobs?content=true') return json({ jobs: [
    { id: 101, title: 'Software Engineering Intern', company_name: 'Example Corp', absolute_url: 'https://boards.greenhouse.io/examplecorp/jobs/101', location: { name: 'San Francisco, CA' }, first_published: new Date(now - 2 * DAY).toISOString(), content: '&lt;p&gt;Build services in Python and SQL on AWS. Docker a plus.&lt;/p&gt;' },
    { id: 102, title: 'Senior Software Engineer', company_name: 'Example Corp', absolute_url: 'https://boards.greenhouse.io/examplecorp/jobs/102', location: { name: 'San Francisco, CA' }, content: 'Python' },
    { id: 103, title: 'Marketing Intern', company_name: 'Example Corp', absolute_url: 'https://boards.greenhouse.io/examplecorp/jobs/103', location: { name: 'Remote' }, content: 'Social media' },
  ] });
  if (url === 'https://api.lever.co/v0/postings/examplelabs?mode=json') return json([
    { text: 'Software Engineer Intern, Summer 2027', hostedUrl: 'https://jobs.lever.co/examplelabs/aaa', applyUrl: 'https://jobs.lever.co/examplelabs/aaa/apply', workplaceType: 'remote', categories: { location: 'Remote, US', commitment: 'Intern' }, createdAt: now - 40 * DAY, descriptionPlain: 'React and TypeScript.' },
  ]);
  if (url === 'https://api.ashbyhq.com/posting-api/job-board/exampleai?includeCompensation=true') return json({ jobs: [
    { title: 'Software Engineer, Intern', location: 'New York, NY', employmentType: 'Intern', jobUrl: 'https://jobs.ashbyhq.com/exampleai/bbb', applyUrl: 'https://jobs.ashbyhq.com/exampleai/bbb/application', descriptionPlain: 'Java and Kotlin.', isListed: true, compensation: { compensationTierSummary: '$50/hr' } },
    { title: 'Software Engineer, Intern (unlisted)', location: 'New York, NY', employmentType: 'Intern', jobUrl: 'https://jobs.ashbyhq.com/exampleai/ccc', applyUrl: 'https://jobs.ashbyhq.com/exampleai/ccc/application', isListed: false },
  ] });
  if (url === pf.SIMPLIFY.internship) return json([
    // The same Example Corp job, listed again: it must merge, not repeat.
    { company_name: 'Example Corp, Inc.', title: 'Software Engineering Intern', locations: ['San Francisco, CA'], url: 'https://example.com/careers/101', date_posted: Math.floor((now - 3 * DAY) / 1000), active: true, is_visible: true, terms: ['Summer 2027'] },
    { company_name: 'Example Robotics', title: 'Software Engineer Intern', locations: ['Austin, TX'], url: 'https://careers.example.com/robotics/7', date_posted: Math.floor((now - 5 * DAY) / 1000), active: true, is_visible: true, terms: ['Summer 2027'] },
    { company_name: 'Old Example', title: 'Software Engineer Intern', locations: ['Austin, TX'], url: 'https://careers.example.com/old/1', date_posted: Math.floor((now - 200 * DAY) / 1000), active: true, is_visible: true },
    { company_name: 'Closed Example', title: 'Software Engineer Intern', locations: ['Austin, TX'], url: 'https://careers.example.com/closed/1', date_posted: Math.floor((now - 2 * DAY) / 1000), active: false, is_visible: true },
  ]);
  if (url === 'https://openrouter.ai/api/v1/models') return json({ data: [{ id: 'example/free-model:free', name: 'Example (free)', context_length: 8000, pricing: { prompt: '0', completion: '0' } }] });
  if (url === 'https://openrouter.ai/api/v1/chat/completions') return json({ choices: [{ message: { content: '{"score": 90, "why": "Strong Python and AWS overlap."}' } }] });
  return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
}) as typeof fetch;

const RESUME = 'Alex Example. alex@example.com, +1 415 555 0100, https://example.com/alex\nComputer science student at Example State University. Built data pipelines in Python and SQL, deployed on AWS with Docker. Wrote a React dashboard in TypeScript. Teaching assistant for Data Structures. GPA 3.8.';

function setup() {
  brain.saveNote({ title: 'Me', meta: { name: 'Alex Example' } });
  pf.savePrefs({ roles: ['Software engineer intern'], kinds: ['internship'], locations: ['San Francisco'], remote: 'yes', boards: ['greenhouse:examplecorp', 'lever:examplelabs', 'ashby:exampleai'], simplify: true, adzuna: false, shortlistAt: 70, aiScoring: true });
  brain.saveNote({ title: 'Resume', up: 'Career', body: RESUME });
  pf.saveAnswers({ 'First name': 'Alex', 'Last name': 'Example', Email: 'alex@example.com', Phone: '+1 415 555 0100', 'Work authorization': 'Yes', 'Needs sponsorship': 'No', 'Why this team': 'I like building data tools.' });
}

test('roles match whole words; kinds, keys and scores explain themselves', () => {
  assert.ok(pf.roleMatch('Software Engineering Intern', ['software engineer intern']));
  assert.ok(pf.roleMatch('Software Engineer, Intern (Summer 2027)', ['Software engineer intern']));
  assert.ok(!pf.roleMatch('Marketing Intern', ['software engineer intern']));
  assert.equal(pf.kindOf('Data Science Co-op'), 'internship');
  assert.equal(pf.kindOf('Software Engineer'), 'full-time');
  assert.equal(pf.keyOf({ company: 'Example Corp, Inc.', title: 'Software Engineering Intern', location: 'San Francisco, CA' }), pf.keyOf({ company: 'Example Corp', title: 'Software  Engineering Intern!', location: 'San Francisco · New York' }));
  const prefs = { roles: ['Software engineer intern'], kinds: ['internship'] as ('internship' | 'full-time')[], locations: ['San Francisco'], remote: 'yes' as const, start: '', pay: '', boards: [], simplify: false, adzuna: false, country: 'us', keywords: [], avoid: ['clearance'], shortlistAt: 70, aiScoring: false };
  const good = pf.score({ title: 'Software Engineering Intern', location: 'San Francisco, CA', remote: false, kind: 'internship', posted: new Date(now - DAY).toISOString(), text: 'Python, SQL, AWS, Docker, React, TypeScript' }, prefs, RESUME);
  assert.equal(good.score, 100);
  assert.deepEqual(good.why.slice(0, 3), ['Role fits', 'Internship', 'In San Francisco']);
  assert.match(good.why[3], /^Shares /);
  for (const skill of ['python', 'sql', 'aws']) assert.ok(good.why[3].includes(skill), skill);
  assert.equal(pf.score({ title: 'Software Engineer Intern', location: 'Austin', remote: false, kind: 'internship', text: 'Requires clearance' }, prefs, RESUME).score, 0);
  assert.ok(pf.score({ title: 'Senior Software Engineer Intern', location: 'Austin', remote: false, kind: 'internship', text: '' }, prefs, RESUME).why.includes('Senior role'));
  const red = pf.redact(RESUME);
  assert.ok(!red.includes('alex@example.com') && !red.includes('555 0100') && !red.includes('https://'));
});

test('a search reads every board, keeps only fitting roles, merges duplicates, and an AI pass sees no contact details', async () => {
  pf.resetProfinder();
  setup();
  store.setSecrets({ OPENROUTER_API_KEY: 'sk-or-example' });
  const run = await pf.runSearch();
  assert.deepEqual(run.errors, []);
  const jobs = pf.pipeline().jobs;
  assert.deepEqual(jobs.map(j => `${j.company}: ${j.title}`).sort(), ['Example Corp: Software Engineering Intern', 'Example Robotics: Software Engineer Intern', 'exampleai: Software Engineer, Intern', 'examplelabs: Software Engineer Intern, Summer 2027']);
  const merged = jobs.find(j => j.company === 'Example Corp')!;
  assert.deepEqual(merged.sources.sort(), ['Greenhouse', 'Simplify']);
  // The board's own page wins, because its form can be filled.
  assert.equal(merged.applyUrl, 'https://job-boards.greenhouse.io/examplecorp/jobs/101');
  assert.equal(merged.text, 'Build services in Python and SQL on AWS. Docker a plus.');
  assert.equal(merged.stage, 'shortlisted');
  assert.equal(merged.ai?.score, 90);
  assert.ok(merged.why.includes('Strong Python and AWS overlap.'));
  assert.equal(jobs.find(j => j.company === 'exampleai')!.pay, '$50/hr');
  const chats = calls.filter(c => c.url.endsWith('/chat/completions'));
  assert.ok(chats.length >= 1);
  for (const c of chats) assert.ok(!c.body.includes('alex@example.com') && !c.body.includes('555 0100') && !c.body.includes('https://example.com/alex'));
  // Nothing but reads went to the job boards.
  assert.ok(calls.filter(c => !c.url.includes('openrouter.ai')).every(c => c.method === 'GET'));
  // A second run finds nothing new.
  const again = await pf.runSearch();
  assert.equal(again.added, 0);
  assert.equal(pf.pipeline().jobs.length, 4);
  store.setSecrets({ OPENROUTER_API_KEY: '' });
});

test('a board that fails is reported and the rest still count; “run ProFinder” works without the AI', async () => {
  pf.resetProfinder();
  setup();
  pf.savePrefs({ boards: ['greenhouse:examplecorp', 'lever:nobody'], aiScoring: false });
  const r = await instant('Hey Taurus, run ProFinder', 'ask');
  assert.match(r!.text, /^ProFinder: \d+ new match/);
  assert.equal(pf.pipeline().lastRun!.errors.length, 1);
  assert.match(pf.pipeline().lastRun!.errors[0], /^lever:nobody/);
  // The scheduled task says the same words with its time in front.
  pf.resetProfinder(); setup(); pf.savePrefs({ aiScoring: false });
  assert.match((await instant('(A task the owner scheduled: every day at 8am.) Run ProFinder', 'ask'))!.text, /^ProFinder:/);
});

// ---------- Preparing and the batch card ----------

interface Shape { url: string; host: string; fields: { index: number; label: string; type: string; required: boolean; options?: string[]; group?: string }[]; buttons: string[]; login: boolean; captcha: boolean; text: string }
const form = (url: string, host: string): Shape => ({ url, host, login: false, captcha: false, text: '', buttons: ['Submit application'], fields: [
  { index: 0, label: 'First Name', type: 'text', required: true }, { index: 1, label: 'Last Name', type: 'text', required: true },
  { index: 2, label: 'Email', type: 'email', required: true }, { index: 3, label: 'Resume/CV', type: 'file', required: true },
  { index: 4, label: 'Are you legally authorized to work in the United States?', type: 'select', required: true, options: ['Select...', 'Yes', 'No'] },
  { index: 5, label: 'Gender', type: 'select', required: false, options: ['Male', 'Female', 'Decline to self-identify'] },
  { index: 6, label: 'Why this team?', type: 'textarea', required: false },
  { index: 7, label: 'Twitter', type: 'text', required: false },
] });
const fake = { filled: [] as { url: string; label: string; value: string; file?: string }[], submitted: [] as { button: string; host: string }[], current: '', confirm: true, shapes: new Map<string, Shape>() };
pf.useFiller({
  async open(url) { fake.current = url; return fake.shapes.get(url) ?? form(url, new URL(url).hostname.split('.').slice(-2).join('.')); },
  async fill(f) { fake.filled.push({ url: fake.current, label: f.label, value: f.value, file: f.file }); },
  async submit(button, host) { fake.submitted.push({ button, host }); return fake.confirm ? 'Thank you for applying! We have received your application.' : 'Something went wrong.'; },
});

async function readyThree() {
  pf.resetProfinder();
  setup();
  pf.savePrefs({ aiScoring: false, shortlistAt: 0 });
  // The resume note keeps its text and its PDF, the way the owner would leave it.
  writeFileSync(join(store.dir, 'brain', 'attachments', 'Alex Example Resume.pdf'), '%PDF-1.4 fictional resume');
  brain.saveNote({ title: 'Resume', body: `${RESUME}\n\n## Files\n![[Alex Example Resume.pdf]]\n` });
  await pf.runSearch();
  const jobs = pf.pipeline().jobs;
  const robotics = jobs.find(j => j.company === 'Example Robotics')!;
  fake.shapes.clear();
  fake.shapes.set(robotics.applyUrl, { ...form(robotics.applyUrl, 'example.com'), login: true });
  Object.assign(fake, { filled: [], submitted: [], confirm: true });
  return jobs;
}

beforeEach(() => { calls.length = 0; });

test('preparing fills each form with the owner’s own answers, sends nothing, and hands back a sign-in', async () => {
  const jobs = await readyThree();
  const out = await pf.prepare(jobs.map(j => j.id));
  assert.equal(fake.submitted.length, 0);
  const robotics = out.find(j => j.company === 'Example Robotics')!;
  assert.equal(robotics.stage, 'needs-you');
  assert.match(robotics.needs!, /sign in/);
  const corp = out.find(j => j.company === 'Example Corp')!;
  assert.equal(corp.stage, 'ready');
  assert.deepEqual(Object.fromEntries(corp.plan!.fields.map(f => [f.label, f.value])), { 'First Name': 'Alex', 'Last Name': 'Example', Email: 'alex@example.com', 'Resume/CV': 'Alex Example Resume.pdf', 'Are you legally authorized to work in the United States?': 'Yes', Gender: 'Decline to self-identify', 'Why this team?': 'I like building data tools.' });
  assert.equal(corp.plan!.button, 'Submit application');
  // The resume comes from the Brain's own attachments, never anywhere else.
  assert.ok(fake.filled.some(f => f.file));
  assert.ok(fake.filled.filter(f => f.file).every(f => f.file!.startsWith(join(store.dir, 'brain', 'attachments'))));
  assert.equal(pf.summary().counts.ready, 3);
});

test('the batch card lists every ready job and sends only the ones left checked, once', async () => {
  const jobs = await readyThree();
  await pf.prepare(jobs.map(j => j.id));
  const p = await pf.proposeBatch();
  assert.equal(p.kind, 'profinder.batch');
  assert.equal(p.title, 'Send 3 job applications');
  assert.equal(p.items!.length, 3);
  const corp = p.items!.find(i => i.title === 'Software Engineering Intern at Example Corp')!;
  assert.equal(corp.link, 'https://job-boards.greenhouse.io/examplecorp/jobs/101');
  assert.deepEqual(corp.lines.map(l => l.label), ['Site', 'First Name', 'Last Name', 'Email', 'Resume/CV', 'Are you legally authorized to work in the United States?', 'Gender', 'Why this team?', 'Button']);
  assert.equal(corp.lines.find(l => l.label === 'Resume/CV')!.value, 'Alex Example Resume.pdf (file)');
  // Nothing goes until the owner approves; an item that wasn't on the card, or none at all, is refused.
  assert.equal(fake.submitted.length, 0);
  await assert.rejects(actions.approve(p.id, { digest: p.digest, keep: ['ffffffffffff'] }), /wasn’t on the card/);
  await assert.rejects(actions.approve(p.id, { digest: p.digest, keep: [] }), /Nothing is checked/);
  await assert.rejects(actions.approve(p.id, { digest: 'stale', keep: [corp.id] }), /changed after you saw it/);
  const lever = p.items!.find(i => i.title.includes('examplelabs'))!;
  const done = await actions.approve(p.id, { digest: p.digest, keep: [corp.id, lever.id] });
  assert.equal(done.state, 'done');
  assert.deepEqual(done.kept, [corp.id, lever.id]);
  await pf.sending();
  assert.deepEqual(fake.submitted, [{ button: 'Submit application', host: 'greenhouse.io' }, { button: 'Submit application', host: 'lever.co' }]);
  const after = pf.pipeline().jobs;
  assert.equal(after.find(j => j.id === corp.id)!.stage, 'applied');
  assert.equal(after.find(j => j.id === lever.id)!.stage, 'applied');
  assert.equal(after.filter(j => j.stage === 'ready').length, 1);
  const log = pf.submissions();
  assert.deepEqual(log.map(l => [l.company, l.outcome]), [['Example Corp', 'applied'], ['examplelabs', 'applied']]);
  assert.ok(log[0].sent.some(s => s.label === 'Email' && s.value === 'alex@example.com'));
  assert.match(brain.getNote('Career').body, /## Applied\n- Software Engineering Intern at Example Corp/);
  // A second tap does nothing, and an applied job can't be put on a new card.
  await assert.rejects(actions.approve(p.id, { digest: p.digest }), /already done/);
  const next = await pf.proposeBatch();
  assert.equal(next.items!.length, 1);
  assert.ok(!next.items!.some(i => i.id === corp.id));
});

test('no confirmation means “needs you”, never a second press; a changed resume or a new CAPTCHA holds a job back', async () => {
  const jobs = await readyThree();
  await pf.prepare(jobs.map(j => j.id));
  const [a, b, c] = pf.pipeline().jobs.filter(j => j.stage === 'ready');
  fake.confirm = false;
  fake.shapes.set(b.plan!.url, { ...form(b.plan!.url, b.plan!.host), captcha: true });
  const p = await pf.proposeBatch([a.id, b.id]);
  await actions.approve(p.id, { digest: p.digest });
  await pf.sending();
  const after = pf.pipeline().jobs;
  const ja = after.find(j => j.id === a.id)!, jb = after.find(j => j.id === b.id)!;
  assert.equal(ja.stage, 'needs-you');
  assert.equal(ja.unconfirmed, true);
  assert.match(ja.needs!, /didn’t confirm/);
  assert.equal(jb.stage, 'needs-you');
  assert.match(jb.needs!, /CAPTCHA/);
  assert.equal(fake.submitted.length, 1);
  assert.deepEqual(pf.submissions().map(l => l.outcome), ['unconfirmed', 'needs-you']);
  // An unconfirmed job can't be prepared again by Taurus; the owner marks it applied after checking.
  await assert.rejects(pf.prepare([a.id]), /Pick shortlisted jobs/);
  pf.setStage(a.id, 'applied');
  assert.equal(pf.pipeline().jobs.find(j => j.id === a.id)!.stage, 'applied');
  // The resume changes after preparing: that job is held, not sent with a file the owner didn't see.
  fake.confirm = true;
  const p2 = await pf.proposeBatch([c.id]);
  writeFileSync(join(store.dir, 'brain', 'attachments', 'Alex Example Resume.pdf'), '%PDF-1.4 a different resume');
  await actions.approve(p2.id, { digest: p2.digest });
  await pf.sending();
  const jc = pf.pipeline().jobs.find(j => j.id === c.id)!;
  assert.equal(jc.stage, 'needs-you');
  assert.match(jc.needs!, /resume changed/);
  assert.equal(fake.submitted.length, 1);
});

test('the owner’s moves follow the pipeline', async () => {
  const jobs = await readyThree();
  const j = jobs[0];
  assert.throws(() => pf.setStage(j.id, 'response'), /can’t move/);
  pf.setStage(j.id, 'skipped');
  pf.setStage(j.id, 'shortlisted');
  assert.equal(pf.pipeline().jobs.find(x => x.id === j.id)!.stage, 'shortlisted');
  assert.throws(() => pf.setStage('000000000000', 'skipped'), /No such job/);
});
