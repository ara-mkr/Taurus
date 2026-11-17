// The plan, act, check loop (November 16, 2026; ideas from OpenMausBot, see NOTICE): plans, ok/false results, the
// repeat guard, the nudge, simple turns and streaming. A scripted fake AI and mocked providers only.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-loop-'));
process.env.OXBOT_BROKER_URL = '';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'MAC_MESSAGES_ON']) delete process.env[key];
const { store } = await import('../src/store.ts');
const { converse, Holdback, simpleTurn } = await import('../src/agent.ts');
const { RepeatGuard, announcesAction } = await import('../src/repeat-guard.ts');
const { recent } = await import('../src/activity.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
let script: ((messages: any[]) => string | string[])[] = [];
let seen: any[][] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
// A reply given as a list of pieces is streamed as server-sent events, the way OpenRouter streams.
const sse = (pieces: string[]) => new Response(pieces.map(p => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (/openrouter\.ai\/api\/v1\/chat\/completions$/.test(url)) {
    const body = JSON.parse(String(init.body));
    if (String(body.messages[0]?.content).startsWith('You write the single line')) return json({ choices: [{ message: { content: 'Brief.' } }] });
    seen.push(body.messages);
    const next = script.shift();
    if (!next) throw new Error('the fake AI ran out of replies');
    const out = next(body.messages);
    return Array.isArray(out) ? sse(out) : json({ choices: [{ message: { role: 'assistant', content: out } }] });
  }
  throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${url}`);
}) as typeof fetch;
store.setSecrets({ OPENROUTER_API_KEY: 'or-test', OPENROUTER_MODEL: 'example/model:free' });
const results = (messages: any[]) => JSON.parse(messages.at(-1).content.split('\n').slice(1).join('\n').replace(/\nAnswer the owner now.*$/s, ''));
beforeEach(() => { script = []; seen = []; });

test('plan, act, check: the plan is noted, each result says ok, and the answer comes after the results', async () => {
  script = [
    () => '<plan>1. read who is waiting 2. answer</plan>\n<tool>{"name": "refresh", "args": {"section": "needs"}}</tool>',
    messages => { const r = results(messages); assert.equal(r[0].ok, true); return 'Nothing is waiting on you.'; },
  ];
  const r = await converse([{ role: 'user', text: 'anyone waiting on me?' }], 'ask');
  assert.equal(r.text, 'Nothing is waiting on you.');
  assert.ok(recent().some(a => /^Plan: 1\. read who is waiting/.test(a.text)));
  assert.match(seen[0][0].content, /How to work \(plan, act, check\)/);
});

test('a failed call is marked ok false, and the same failing call is refused after three tries', async () => {
  const bad = '<tool>{"name": "refresh", "args": {"section": "nonsense"}}</tool>';
  script = [() => bad, () => bad, () => bad, messages => {
    assert.equal(results(messages)[0].ok, false);
    assert.match(results(messages)[0].note, /failed 3 times the same way/);
    return bad;
  }, messages => {
    assert.match(results(messages)[0].result.error, /^Not run: this exact call already failed 3 times/);
    return 'I can’t read that part of the board.';
  }];
  const r = await converse([{ role: 'user', text: 'refresh my board' }], 'ask');
  assert.equal(r.text, 'I can’t read that part of the board.');
});

test('a reply that only says what it will do gets a nudge, then works; a second empty promise ends the loop', async () => {
  script = [
    () => 'Let me check your board.',
    messages => { assert.match(messages.at(-1).content, /You said what you would do next but called no tool/); return '<tool>{"name": "refresh", "args": {"section": "schedule"}}</tool>'; },
    () => 'Your afternoon is clear.',
  ];
  assert.equal((await converse([{ role: 'user', text: 'what is on my schedule' }], 'ask')).text, 'Your afternoon is clear.');
  script = [() => 'Checking now…', () => 'Checking now…'];
  const stuck = await converse([{ role: 'user', text: 'what is on my schedule' }], 'ask');
  assert.equal(seen.length, 5, 'one nudge, then it stops instead of looping');
  assert.equal(stuck.text, 'Checking now…');
});

test('Ox saying a default out loud is not an empty promise', () => {
  assert.equal(announcesAction('I’ll tell Dana Thursday at 10 works.'), false);
  assert.equal(announcesAction('Let me check your calendar.'), true);
  assert.equal(announcesAction('I’ll look at your inbox now.'), true);
  assert.equal(announcesAction('Do you want me to check?'), false);
});

test('the repeat guard counts the same call in any key order, and a new answer starts over', () => {
  const g = new RepeatGuard();
  for (let n = 0; n < 3; n++) g.noteAfter('x', { a: 1, b: 2 }, { ok: false, text: 'nope' });
  assert.match(g.refuses('x', { b: 2, a: 1 }) ?? '', /already failed 3 times/);
  assert.equal(g.refuses('x', { a: 2 }), null);
  const h = new RepeatGuard();
  h.noteAfter('y', {}, { ok: false, text: 'nope' }); h.noteAfter('y', {}, { ok: false, text: 'different' }); h.noteAfter('y', {}, { ok: false, text: 'nope' });
  assert.equal(h.refuses('y', {}), null);
});

test('a simple question gets a short prompt with no tools or board; one that needs data asks for them', async () => {
  assert.equal(simpleTurn([{ role: 'user', text: 'what is 15% of 80' }]), true);
  assert.equal(simpleTurn([{ role: 'user', text: 'what is on my calendar' }]), false);
  assert.equal(simpleTurn([{ role: 'user', text: 'tell Sam I am running late' }]), false);
  script = [() => '12.'];
  assert.equal((await converse([{ role: 'user', text: 'what is 15% of 80' }], 'ask')).text, '12.');
  assert.equal(seen.length, 1);
  assert.doesNotMatch(seen[0][0].content, /Dashboard:|<tool>/);
  assert.ok(seen[0][0].content.length < 6000, `short prompt (${seen[0][0].content.length} characters)`);
  script = [() => '<need-tools/>', () => 'It’s 12, and nothing on your board changes that.'];
  const r = await converse([{ role: 'user', text: 'what is 15% of 80' }], 'ask');
  assert.equal(seen.length, 3);
  assert.match(seen[2][0].content, /Dashboard:/);
  assert.equal(r.text, 'It’s 12, and nothing on your board changes that.');
});

test('answers stream piece by piece; tool lines never reach the screen, and working notes are taken back', async () => {
  const pieces: string[] = []; let resets = 0; const steps: string[] = [];
  script = [
    () => ['One moment. ', '<to', 'ol>{"name": "refresh", "args": {"section": "needs"}}</tool>'],
    () => ['Nothing ', 'needs ', 'you before 2.'],
  ];
  const r = await converse([{ role: 'user', text: 'anything waiting on me?' }], 'ask', { onText: d => pieces.push(d), onReset: () => { resets++; pieces.push('|reset|'); }, onStep: s => steps.push(s) });
  assert.equal(r.text, 'Nothing needs you before 2.');
  assert.deepEqual(pieces, ['One moment. ', '|reset|', 'Nothing ', 'needs ', 'you before 2.']);
  assert.equal(resets, 1);
  assert.deepEqual(steps, ['Re-reading needs']);
});

test('the holdback lets a lone < through and holds a tag split across pieces', () => {
  const out: string[] = [];
  const h = new Holdback(d => out.push(d));
  for (const p of ['2 <', ' 3 is ', 'true. <pl', 'an>x</plan>']) h.feed(p);
  assert.equal(out.join(''), '2 < 3 is true. ');
  assert.equal(h.mode, 'tools');
});

test('Messages are read only when the owner asked about messages', async () => {
  script = [
    () => '<tool>{"name": "mac_messages", "args": {}}</tool>',
    messages => { assert.match(results(messages)[0].result.error, /Only read the owner’s Messages when they ask/); return 'Done.'; },
  ];
  await converse([{ role: 'user', text: 'what is on my board today' }], 'ask');
});
