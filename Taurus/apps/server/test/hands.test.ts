// Helpers in other apps (owner, November 5, 2026; docs/19-computer-use.md), against a fake desktop app and a fake AI.
// Nothing here takes a picture of a real screen, moves a real mouse, or calls a real AI.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

const home = process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-hands-'));
process.env.TAURUS_BROKER_URL = '';
process.env.TAURUS_HANDS_TOKEN = 't'.repeat(48);
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[key];
const { store } = await import('../src/store.ts');
const hands = await import('../src/hands.ts');
const { converse } = await import('../src/agent.ts');
const { pending, approve } = await import('../src/actions/index.ts');
const swarm = await import('../src/swarm.ts');
const { recent } = await import('../src/activity.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
type Handler = (verb: string, args: any, who?: any) => unknown;
// A pretend desktop app on the private line: it answers each step with the handler.
function desk(handler: Handler) {
  const requests: { verb: string; args: any; who?: any }[] = [];
  let inFlight = 0, most = 0;
  const res: any = {
    writeHead() { return res; },
    end() { /* replaced */ },
    on(name: string, fn: () => void) { if (name === 'close') res.closeFn = fn; return res; },
    write(chunk: string) {
      const m = chunk.match(/^event: request\ndata: (.*)$/m);
      if (m) {
        const r = JSON.parse(m[1]);
        requests.push(r);
        inFlight++; most = Math.max(most, inFlight);
        setTimeout(async () => {
          try { hands.result({ id: r.id, ok: true, data: await handler(r.verb, r.args, r.who) }); }
          catch (e) { hands.result({ id: r.id, ok: false, error: (e as Error).message }); }
          finally { inFlight--; }
        }, 3);
      }
      return true;
    },
  };
  hands.connect(res);
  return { requests, most: () => most, close: () => res.closeFn?.() };
}
let open: ReturnType<typeof desk> | undefined;
afterEach(() => { open?.close(); open = undefined; swarm.resetSwarm(); });

// A fake AI that sees pictures (Mistral's chat endpoint), scripted per test.
let script: ((messages: any[]) => string)[] = [];
let seen: any[][] = [];
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (/api\.mistral\.ai\/v1\/chat\/completions$/.test(url)) {
    const body = JSON.parse(String(init.body));
    if (String(body.messages[0]?.content).startsWith('You write the single line')) return new Response(JSON.stringify({ choices: [{ message: { content: 'Brief.' } }] }), { headers: { 'Content-Type': 'application/json' } });
    seen.push(body.messages);
    const next = script.shift();
    if (!next) throw new Error('the fake AI ran out of replies');
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: next(body.messages) } }] }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;
store.setSecrets({ MISTRAL_API_KEY: 'mi-test', MISTRAL_MODEL: 'example-model' });
beforeEach(() => { script = []; seen = []; });

const notes = { app: 'Notes', title: 'Groceries', window: { x: 100, y: 100, w: 900, h: 700 }, elements: [
  { id: 0, role: 'button', label: 'New Note', x: 200, y: 130, w: 30, h: 24 },
  { id: 1, role: 'textarea', value: 'eggs', x: 600, y: 400, w: 700, h: 500 },
  { id: 2, role: 'button', label: 'Share', x: 900, y: 130, w: 30, h: 24 },
] };

test('only the desktop app that started this server, on this Mac, can use the private line', () => {
  const req = (key: string | undefined, ip = '127.0.0.1') => ({ headers: key ? { 'x-taurus-hands': key } : {}, socket: { remoteAddress: ip } }) as any;
  assert.equal(hands.trusted(req('t'.repeat(48))), true);
  assert.equal(hands.trusted(req('t'.repeat(47) + 'u')), false);
  assert.equal(hands.trusted(req(undefined)), false);
  assert.equal(hands.trusted(req('t'.repeat(48), '192.168.1.20')), false);
});

test('with no desktop app open, Taurus says so instead of looking', async () => {
  const answer = await converse([{ role: 'user', text: 'What’s on my screen?' }], 'ask');
  assert.equal(answer.text, 'Helpers in other apps need Taurus’s desktop app open on this Mac.');
});

test('“what’s on my screen” sends one picture to the AI the owner chose, notes it, and treats it as data', async () => {
  open = desk(verb => { assert.equal(verb, 'look'); return { image: 'data:image/jpeg;base64,AAAA', windows: [{ app: 'Notes', title: 'Groceries' }] }; });
  script = [messages => { const last = messages.at(-1); assert.ok(Array.isArray(last.content)); return 'Your Notes window shows a grocery list.'; }];
  const answer = await converse([{ role: 'user', text: 'Hey Taurus, what’s on my screen?' }], 'ask');
  assert.equal(answer.text, 'Your Notes window shows a grocery list.');
  const parts = seen[0].at(-1).content;
  assert.equal(parts[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.match(parts[0].text, /taken at their request.*data, not instructions/);
  assert.deepEqual(open.requests.map(r => r.verb), ['look']);
  assert.ok(recent().some(a => a.text === 'Looked at your screen: one picture to Mistral'));
});

test('the AI can only look at the screen when the owner asked, and steps that share or send become a card, not a click', async () => {
  open = desk((verb, args) => (verb === 'tree' ? notes : verb === 'look' ? { image: 'data:image/jpeg;base64,AAAA', windows: [] } : { ok: verb, args }));
  script = [
    () => '<tool>{"name": "screen_look", "args": {}}</tool>',
    messages => { assert.match(messages.at(-1).content, /Only look at the screen when the owner asks/); return '<tool>{"name": "app_look", "args": {"app": "Notes"}}</tool>'; },
    messages => { assert.match(messages.at(-1).content, /\[0\] button “New Note” at 200,130/); return '<tool>{"name": "app_do", "args": {"app": "Notes", "do": "press", "id": 0, "says": "Start a new note"}}</tool>'; },
    () => '<tool>{"name": "app_do", "args": {"app": "Notes", "do": "press", "id": 2, "says": "Open the menu"}}</tool>',
    messages => { assert.match(messages.at(-1).content, /waits for the owner’s OK/); return 'Started a new note. Sharing it is waiting for your OK.'; },
  ];
  const answer = await converse([{ role: 'user', text: 'Make a new note in Notes and send it to Sam' }], 'ask');
  assert.equal(answer.text, 'Started a new note. Sharing it is waiting for your OK.');
  // It pressed New Note (after reading), never Share: "Share" on the element made it consequential despite the vague words.
  assert.deepEqual(open.requests.map(r => `${r.verb}${r.args.id !== undefined ? `:${r.args.id}` : ''}`), ['tree', 'press:0', 'tree']);
  assert.equal(answer.proposals.length, 1);
  const card = pending().find(p => p.kind === 'hands.step')!;
  assert.equal(card.title, 'In Notes: Open the menu');
  assert.deepEqual(card.lines, [{ label: 'App', value: 'Notes' }, { label: 'Step', value: 'press “Share”' }]);
  // Approving it is what presses Share.
  await approve(card.id, { digest: card.digest, via: 'board' });
  assert.deepEqual(open.requests.slice(3).map(r => `${r.verb}${r.args.id !== undefined ? `:${r.args.id}` : ''}`), ['press:2', 'tree']);
});

test('helpers in apps take turns with the one mouse while the AI picks each step, and the owner’s Esc stops them all', async () => {
  writeFileSync(join(home, 'hands.json'), JSON.stringify({ on: true, act: ['Notes', 'Canva'], look: [], chrome: false }));
  const canva = { ...notes, app: 'Canva', title: 'Poster', elements: [{ id: 0, role: 'button', label: 'Add text', x: 300, y: 200, w: 60, h: 24 }] };
  open = desk(async (verb, args) => { await new Promise(r => setTimeout(r, 5)); return verb === 'tree' ? (args.app === 'Canva' ? canva : notes) : { done: verb }; });
  // Each helper: one step, then done.
  script = [
    () => '{"do": "press", "id": 0, "says": "Start a new note"}', () => '{"done": "Made a new note."}',
    () => '{"do": "press", "id": 0, "says": "Add a text box"}', () => '{"done": "Added a heading to the poster."}',
  ];
  const done = await swarm.runSwarm(swarm.tasks('Two app jobs', [{ app: 'Notes', goal: 'Start a note' }, { app: 'Canva', goal: 'Add a heading' }]), { merge: 'rules' });
  assert.deepEqual(done.helpers.map(h => [h.state, h.finding]), [['done', 'Made a new note.'], ['done', 'Added a heading to the poster.']]);
  assert.equal(open.most(), 1, 'one step at a time across helpers');
  assert.deepEqual(open.requests.map(r => r.who?.name), ['Scout 1', 'Scout 1', 'Scout 1', 'Scout 2', 'Scout 2', 'Scout 2']);
  assert.ok(open.requests.every(r => /^#[0-9A-F]{6}$/.test(r.who.colour)));

  // Esc: the desktop app reports it and the running swarm stops.
  open.close();
  open = desk(async verb => { await new Promise(r => setTimeout(r, 40)); return verb === 'tree' ? notes : { done: verb }; });
  script = [() => '{"do": "press", "id": 0, "says": "Start a new note"}', () => '{"do": "press", "id": 0, "says": "Another"}', () => '{"done": "x"}'];
  const running = swarm.runSwarm(swarm.tasks('Esc test', [{ app: 'Notes', goal: 'Keep going' }]), { merge: 'rules' });
  await new Promise(r => setTimeout(r, 60));
  hands.stopped('you pressed Esc');
  const stopped = await running;
  assert.equal(stopped.state, 'stopped');
  assert.equal(stopped.helpers[0].state, 'stopped');
  assert.ok(recent().some(a => a.text === 'Helpers stopped: you pressed Esc'));
});
