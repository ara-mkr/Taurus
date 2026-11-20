// Who answers what, the fastest free model right now, and changing settings by saying so (owner, November 17, 2026).
// Mocked OpenRouter and OpenAI only.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-route-'));
process.env.TAURUS_BROKER_URL = '';
// No plan apps on this "Mac", so Claude and ChatGPT mean their API keys here.
process.env.TAURUS_CLI_DIR = mkdtempSync(join(tmpdir(), 'taurus-no-cli-'));
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL']) delete process.env[key];
const { store } = await import('../src/store.ts');
const { settingsCommand, getRoute } = await import('../src/route.ts');
const { freeOrder, recordFirstWord, markBusy, resetSpeeds, LIGHTNING, SUPER, ULTRA } = await import('../src/speed.ts');
const { ask } = await import('../src/ai.ts');
const { applySettings, bigJob, converse } = await import('../src/agent.ts');
const { scans } = await import('../src/scans.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
let sent: any[] = [];
let busy = new Set<string>();
let openai: any[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (url === 'https://openrouter.ai/api/v1/models') return json({ data: [LIGHTNING, SUPER, ULTRA].map(id => ({ id, name: id, pricing: { prompt: '0', completion: '0' } })) });
  if (url === 'https://openrouter.ai/api/v1/chat/completions') {
    const body = JSON.parse(String(init.body));
    if (String(body.messages[0]?.content).startsWith('You write the single line')) return json({ choices: [{ message: { content: 'Brief.' } }] });
    sent.push(body);
    if (busy.has(body.model)) return json({ error: { message: 'busy' } }, 429);
    return json({ choices: [{ message: { role: 'assistant', content: `From ${body.model}.` } }] });
  }
  if (url === 'https://api.openai.com/v1/responses') { openai.push(JSON.parse(String(init.body))); return json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'From ChatGPT.' }] }] }); }
  throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${url}`);
}) as typeof fetch;
store.setSecrets({ OPENROUTER_API_KEY: 'or-test' });
beforeEach(() => { sent = []; busy = new Set(); openai = []; resetSpeeds(); store.saveSettings({ aiRoute: {} }); });

test('saying it: who answers what, and the main scan', () => {
  assert.deepEqual(settingsCommand('use claude for everything'), { route: [{ brand: 'claude', tiers: ['simple', 'medium', 'hard'] }] });
  assert.deepEqual(settingsCommand('Hey Taurus, use the free ones for quick stuff and ChatGPT for big jobs.'), { route: [{ brand: 'free', tiers: ['simple'] }, { brand: 'chatgpt', tiers: ['hard'] }] });
  assert.deepEqual(settingsCommand('make it all free'), { route: [{ brand: 'free', tiers: ['simple', 'medium', 'hard'] }] });
  assert.deepEqual(settingsCommand('switch to chatgpt'), { route: [{ brand: 'chatgpt', tiers: ['simple', 'medium', 'hard'] }] });
  assert.deepEqual(settingsCommand('turn off scans'), { scans: { on: false } });
  assert.deepEqual(settingsCommand('scan every 10 minutes'), { scans: { every: 10 } });
  // Requests that only name an AI are not settings.
  for (const ask of ['use claude to write this email', 'use claude for this long email', 'what does chatgpt think about my plan', 'switch to the next song']) assert.equal(settingsCommand(ask), null, ask);
});

test('a setting said out loud changes at once, with no AI; an AI that isn’t connected says how to connect it', async () => {
  store.setSecrets({ OPENAI_API_KEY: 'sk-test' });
  const r = await converse([{ role: 'user', text: 'use free for quick asks and chatgpt for big jobs' }], 'talk');
  assert.equal(r.text, 'Done. Taurus takes quick asks; ChatGPT takes big jobs.');
  assert.equal(sent.length + openai.length, 0, 'no AI was asked');
  assert.deepEqual(getRoute(), { simple: 'free', hard: 'chatgpt' });
  assert.match(applySettings('use claude for everything')!, /Claude isn’t connected yet/);
  assert.deepEqual(getRoute(), { simple: 'free', hard: 'chatgpt' }, 'nothing changed');
  assert.equal(applySettings('turn on scans'), 'Scans are on. I’ll check every 15 minutes.');
  assert.equal(scans()[0].on, true);
  applySettings('turn off the scans');
  assert.equal(scans()[0].on, false);
  store.setSecrets({ OPENAI_API_KEY: '' });
});

test('quick asks go to the fastest free model lately, with thinking off; busy models go last', () => {
  assert.equal(freeOrder('simple')[0], LIGHTNING, 'fastest measured on November 17');
  for (const ms of [900, 950, 1000]) recordFirstWord(LIGHTNING, ms);
  for (const ms of [300, 320]) recordFirstWord(SUPER, ms);
  assert.deepEqual(freeOrder('simple').slice(0, 2), [SUPER, ULTRA], 'the measured slowdown moves Lightning down');
  markBusy(SUPER);
  assert.equal(freeOrder('simple').at(-1), SUPER);
  assert.equal(freeOrder('medium')[0], ULTRA, 'everyday asks keep the stronger model first');
});

test('each kind of ask thinks as much as it needs, and a busy free model hands over to the next', async () => {
  const quick = await ask('sys', [{ role: 'user', text: 'what is 15% of 80' }], false, { tier: 'simple' });
  assert.equal(quick.model, LIGHTNING);
  assert.deepEqual(sent[0].reasoning, { effort: 'none' });
  sent = [];
  await ask('sys', [{ role: 'user', text: 'what is on my calendar' }], false, { tier: 'medium' });
  assert.deepEqual([sent[0].model, sent[0].reasoning], [ULTRA, { effort: 'none' }]);
  sent = [];
  await ask('sys', [{ role: 'user', text: 'plan my week' }], false, { tier: 'hard' });
  assert.equal(sent[0].reasoning, undefined, 'a big job thinks as much as the model likes');
  sent = []; resetSpeeds();
  busy = new Set([LIGHTNING]);
  const handed = await ask('sys', [{ role: 'user', text: 'hi' }], false, { tier: 'simple' });
  assert.equal(sent[0].model, LIGHTNING);
  assert.notEqual(sent[1].model, LIGHTNING);
  assert.equal(handed.model, sent[1].model);
  assert.equal(freeOrder('simple').at(-1), LIGHTNING, 'the busy one rests');
});

test('a big job goes where the owner routed it', async () => {
  store.setSecrets({ OPENAI_API_KEY: 'sk-test' });
  store.saveSettings({ aiRoute: { simple: 'free', medium: 'free', hard: 'chatgpt' } });
  assert.equal(bigJob([{ role: 'user', text: 'research the best CRM for a 10 person team and compare prices' }]), true);
  assert.equal(bigJob([{ role: 'user', text: 'what is on my calendar' }]), false);
  const big = await converse([{ role: 'user', text: 'draft a plan for the board meeting' }], 'ask');
  assert.equal(big.provider, 'ChatGPT');
  assert.equal(openai.length, 1);
  const everyday = await converse([{ role: 'user', text: 'what is on my calendar today' }], 'ask');
  assert.equal(everyday.provider, 'Taurus');
  store.setSecrets({ OPENAI_API_KEY: '' });
});

test('when the day’s free asks are used up, Taurus says so plainly and doesn’t try every other free model', async () => {
  const real = globalThis.fetch;
  let tries = 0;
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    if (String(input) === 'https://openrouter.ai/api/v1/chat/completions') { tries++; return json({ error: { message: 'Rate limit exceeded: free-models-per-day. Add 5 credits to unlock 1000 free model requests per day', code: 429 } }, 429); }
    return real(input, init);
  }) as typeof fetch;
  await assert.rejects(ask('sys', [{ role: 'user', text: 'hi' }], false, { tier: 'simple' }), /free Taurus asks are used up.*50 a day.*use Claude for everything/s);
  assert.equal(tries, 1);
  globalThis.fetch = real;
});

test('the AI sees each meeting’s local day and time written out, not only UTC', async () => {
  const { context } = await import('../src/dashboard.ts');
  const start = new Date(2026, 10, 17, 8, 30), end = new Date(2026, 10, 17, 9, 0);
  const c = JSON.parse(context({ generatedAt: '', brief: '', briefBy: '', needs: [], inbox: [], body: { sources: [] }, numbers: [], updates: [], sections: {} as never,
    schedule: [{ id: 'e1', title: 'Leadership sync', start: start.toISOString(), end: end.toISOString(), source: 'Google Calendar' }] }));
  assert.equal(c.schedule[0].when, 'Tue, Nov 17, 8:30 AM–9:00 AM local time');
});
