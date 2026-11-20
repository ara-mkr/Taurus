// Luke's Day 2, November 20, 2026 ("Build your AI agent's brain"): core memory sent every time, and only the saved facts
// that fit each question. Fictional people and facts, a scripted fake AI only; nothing leaves the test.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-recall-'));
process.env.TAURUS_BROKER_URL = '';
process.env.TAURUS_FAST = '1';
process.env.TAURUS_NO_SCHEDULER = '1';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[key];
const { store } = await import('../src/store.ts');
const { converse } = await import('../src/agent.ts');
const { remember, resetMemory } = await import('../src/memory.ts');
const brain = await import('../src/brain.ts');
const r = await import('../src/recall.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
let script: (() => string)[] = [];
let seen: any[][] = [];
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (/openrouter\.ai\/api\/v1\/chat\/completions$/.test(url)) {
    const body = JSON.parse(String(init.body));
    if (String(body.messages[0]?.content).startsWith('You write the single line')) return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Brief.' } }] }), { headers: { 'Content-Type': 'application/json' } });
    seen.push(body.messages);
    const next = script.shift();
    if (!next) throw new Error('the fake AI ran out of replies');
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: next() } }] }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;
store.setSecrets({ OPENROUTER_API_KEY: 'or-test', OPENROUTER_MODEL: 'example/model:free' });
const talk = (text: string) => converse([{ role: 'user', text }], 'talk');
const system = () => String(seen.at(-1)?.[0]?.content ?? '');

const filler = ['Likes oat milk lattes', 'Parks on level 3 at work', 'Watches Formula 1 on Sundays', 'Has a dentist in Example City', 'Uses a standing desk',
  'Prefers window seats on flights', 'Reads sci-fi before bed', 'Drives a blue hatchback', 'Plays pickleball on Thursdays', 'Waters the plants on Mondays',
  'Allergic to cats', 'Keeps receipts in a shoebox', 'Wakes up at 6:30', 'Learning Spanish on weekends', 'Has a sourdough starter named Bubbles'];

beforeEach(() => {
  resetMemory(); seen = []; script = [];
  store.saveDoc('memory.json', []); store.saveDoc('core-memory.json', []); r.resetRecallStats();
});

test('recall sends only the facts that fit the question, not every memory', async () => {
  for (const f of filler) remember(f);
  remember("Sam's birthday is March 3");
  remember('My sister Maya Example studies law at Example State');
  script = [() => 'March 3.'];
  await talk('when is sams birthday');
  const sys = system();
  assert.match(sys, /What the owner asked you to remember[\s\S]*Sam's birthday is March 3/);
  assert.doesNotMatch(sys, /oat milk|sourdough|pickleball/, 'facts that don’t fit the question stay on this Mac');
  assert.match(sys, /picked from 17 saved facts/);
  const s = r.recallStats();
  assert.equal(s.questions, 1);
  assert.equal(s.last?.facts.length, 1);
  assert.ok(s.charsAll > s.charsSent * 10, 'sending one fact is far smaller than sending all of them');

  // "where?" right after asking about the sister still finds her: the question before counts too.
  const two = r.recall(['what does my sister study', 'where?'].join('\n'));
  assert.equal(two.facts[0].text, 'My sister Maya Example studies law at Example State');
});

test('Brain notes and the words of their files join the pool, and the note a line sits in counts', async () => {
  brain.resetBrain();
  brain.saveNote({ title: 'Maya Example', up: 'Family', body: '## Basics\n- Birthday: June 4\n- Loves climbing\n' });
  brain.saveNote({ title: 'Grades', up: 'School', body: 'GPA 3.8. Dean’s list twice.\n' });
  brain.attach('Grades', 'advisor.txt', Buffer.from('Advisor: Dr. Example. Office hours are Tuesdays at 2 in Example Hall.\n\nThesis topic: graph search.'));
  r.pool(); await r.filesRead();
  const bday = r.recall('when is maya birthday');
  assert.equal(bday.facts[0].text, 'Birthday: June 4');
  assert.equal(bday.facts[0].where, 'Maya Example, Basics');
  const gpa = r.recall('what is my gpa');
  assert.match(gpa.facts[0].text, /GPA 3.8/);
  const office = r.recall('when are my advisor office hours');
  assert.equal(office.facts[0].from, 'file');
  assert.match(office.facts[0].text, /Tuesdays at 2/);
  assert.equal(r.recall('what is the capital of France').facts.length, 0, 'a general question recalls nothing');
  // Hub blurbs are not facts.
  assert.ok(!r.pool().some(f => /Everything Taurus knows about you/.test(f.text)));
});

test('core memory goes with every question, rules first-class, inside a 3,000 character budget', async () => {
  r.pin('Always sign emails as Alex');
  r.pin('Lives in Example City');
  r.pin('always sign emails as alex');
  assert.equal(r.core().length, 2, 'the same thing is pinned once');
  assert.deepEqual(r.core().map(c => c.kind), ['rule', 'fact']);
  for (const f of filler) remember(f);
  script = [() => 'Hello.'];
  await talk('write a haiku about rain');
  assert.match(system(), /Core memory[\s\S]*Lives in Example City[\s\S]*Rules:\n- Always sign emails as Alex/);
  assert.doesNotMatch(system(), /oat milk/);

  for (let i = 0; r.coreChars() < r.CORE_BUDGET - 400; i++) r.pin(`Example fact number ${i} ${'x'.repeat(300)}`);
  assert.throws(() => r.pin(`One more ${'y'.repeat(390)}`), /Core memory is full/);
  assert.ok(r.coreChars() <= r.CORE_BUDGET);
  assert.match(r.unpin('sign emails')!.text, /Always sign emails as Alex/);
  assert.ok(!r.core().some(c => /sign emails/.test(c.text)));
});

test('by voice: always, never, pin, unpin, show, how much, what do you know about my …', async () => {
  remember('My sister Maya Example studies law at Example State');
  assert.match((await talk('Hey Taurus, always sign my emails as Akhil.')).text, /^Pinned\. I’ll always sign your emails as Akhil, every time\.$/);
  assert.equal(r.core()[0].text, 'Always sign my emails as Akhil', 'the owner’s capitals are kept');
  assert.equal(r.core()[0].kind, 'rule');
  assert.match((await talk('never book meetings before 10am')).text, /I’ll never book meetings before 10am/);
  assert.match((await talk('pin that I am vegetarian')).text, /^Pinned to core memory: I am vegetarian/);
  assert.equal(r.core().find(c => /vegetarian/.test(c.text))?.kind, 'fact');
  assert.match((await talk("what's in your core memory")).text, /^3 pinned: Always sign my emails as Akhil; Never book meetings before 10am; I am vegetarian\.$/);
  assert.match((await talk('unpin the meetings rule')).text, /^Unpinned: Never book meetings/);
  assert.match((await talk('how much memory are you using')).text, /^Core memory: 2 pinned, \d+ of 3,000 characters\. Your Brain holds \d+ facts/);
  assert.match((await talk('what do you know about my sister')).text, /^From your Brain: My sister Maya Example studies law/);
  assert.match((await talk('share my memory with claude')).text, /Copy for other AIs/);
  // Not commands: these go to the AI as before.
  for (const said of ['never mind', 'always on time?', 'what do you know about quantum physics']) {
    script = [() => 'AI answer.'];
    assert.equal((await talk(said)).text, 'AI answer.', `"${said}" is not a memory command`);
  }
  assert.equal(r.core().length, 2);
});

test('copy for other AIs: core memory and memories as one block to paste', () => {
  r.pin('Always reply in short sentences');
  r.pin('Works at Example Corp');
  remember('Takes coffee black');
  const text = r.exportText();
  assert.match(text, /^About me \(from Taurus, my assistant\):\n- Works at Example Corp\n- Takes coffee black\n\nHow I want things done, every time:\n- Always reply in short sentences$/);
});
