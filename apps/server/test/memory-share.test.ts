// What was first left out of Luke's Day 2 (owner, November 20, 2026: "add all the stuff from left out"): the memory
// shared with other AI apps over MCP, the AI picker on top of word matching, words that mean the same thing, and the
// voice switches. Fictional facts, a scripted fake AI, a server on this Mac only.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-share-'));
process.env.TAURUS_BROKER_URL = '';
process.env.TAURUS_FAST = '1';
process.env.TAURUS_NO_SCHEDULER = '1';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[key];
const realFetch = globalThis.fetch;
const { store } = await import('../src/store.ts');
const { converse } = await import('../src/agent.ts');
const { memories, remember, resetMemory } = await import('../src/memory.ts');
const { suggestions } = await import('../src/brain.ts');
const r = await import('../src/recall.ts');
const { setSharing, sharing, shareRoute } = await import('../src/memory-share.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
let script: ((messages: any[]) => string)[] = [];
let seen: any[][] = [];
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
  if (/openrouter\.ai\/api\/v1\/chat\/completions$/.test(url)) {
    const body = JSON.parse(String(init.body));
    if (String(body.messages[0]?.content).startsWith('You write the single line')) return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Brief.' } }] }), { headers: { 'Content-Type': 'application/json' } });
    seen.push(body.messages);
    const next = script.shift();
    if (!next) throw new Error('the fake AI ran out of replies');
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: next(body.messages) } }] }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;
store.setSecrets({ OPENROUTER_API_KEY: 'or-test', OPENROUTER_MODEL: 'example/model:free' });
const talk = (text: string) => converse([{ role: 'user', text }], 'talk');

beforeEach(() => {
  resetMemory(); seen = []; script = [];
  store.saveDoc('memory.json', []); store.saveDoc('core-memory.json', []); store.saveDoc('brain-suggestions.json', []); r.setPicker(true);
});

test('words that mean the same thing: "sibling" finds the sister, the owner’s own word ranks first', () => {
  remember('My sister Maya Example studies law at Example State');
  remember('Takes coffee black');
  assert.equal(r.recall('where does my sibling go to school').facts[0]?.text, 'My sister Maya Example studies law at Example State');
  assert.equal(r.recall('what is my mother’s phone').facts.length, 0, 'nothing about mom saved, nothing sent');
  remember('Mom’s phone is 555-0100');
  assert.equal(r.recall('what is my mum’s number').facts[0]?.text, 'Mom’s phone is 555-0100');
});

test('the AI picker chooses among many fitting facts, and only then', async () => {
  for (let i = 1; i <= 12; i++) remember(`Example Corp project ${i}: ${['billing', 'search', 'onboarding', 'payments', 'reports', 'alerts', 'exports', 'auth', 'mobile', 'api', 'pricing', 'support'][i - 1]} work`);
  script = [
    msgs => { assert.match(msgs[0].content, /You choose which saved facts/); assert.match(msgs[1].content, /Question:\nwhich example corp projects matter for my review/); const num = (w: string) => String(msgs[1].content).match(new RegExp(`^(\\d+)\\. [^\\n]*${w}`, 'm'))![1]; return `${num('payments')}, ${num('billing')}`; },
    () => 'You led payments.',
  ];
  assert.equal((await talk('which example corp projects matter for my review')).text, 'You led payments.');
  const sys = String(seen.at(-1)![0].content);
  assert.match(sys, /- Example Corp project 4: payments work\n- Example Corp project 1: billing work\n/);
  assert.doesNotMatch(sys, /project 7: exports/);

  // "none" sends nothing; switched off, there's no extra call at all.
  script = [() => 'none', () => 'Okay.'];
  await talk('tell me about my example corp projects');
  assert.match(String(seen.at(-1)![0].content), /None of the 12 facts/);
  assert.match((await talk('turn off sharper recall')).text, /^Sharper recall is off/);
  seen = []; script = [() => 'Okay.'];
  await talk('which example corp projects matter for my review');
  assert.equal(seen.length, 1, 'one call: the answer, no picker');

  // When word matching already finds the one that fits, there's no picker either.
  r.setPicker(true); seen = []; script = [() => 'Payments.'];
  await talk('what did I do on payments at example corp');
  assert.equal(seen.length, 1);
  assert.match(String(seen[0][0].content), /- Example Corp project 4: payments work\n/);

  // A few fitting facts never call the picker.
  r.setPicker(true); store.saveDoc('memory.json', []); resetMemory();
  remember('Example Corp is in Example City');
  seen = []; script = [() => 'Example City.'];
  await talk('where is example corp');
  assert.equal(seen.length, 1);
});

// A fake request and response for the /mcp route.
function call(body: unknown, { key = sharing().key, loopback = true, headers = {} as Record<string, string>, method = 'POST' } = {}) {
  const req: any = { method, headers: { 'user-agent': 'claude-code/2.0', ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers } };
  let status = 0, text = '';
  const res: any = { writeHead: (s: number) => { status = s; }, end: (t = '') => { text = t; } };
  return shareRoute(req, res, loopback, async () => JSON.stringify(body)).then(() => ({ status, json: text ? JSON.parse(text) : undefined }));
}

test('memory sharing over MCP: off by default, this Mac only, a key, no web pages, and adds wait for the owner', async () => {
  remember('Takes coffee black');
  r.pin('Always reply in short sentences');
  assert.equal((await call({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { key: 'x' })).status, 404, 'off until turned on');
  setSharing(true);
  const key = sharing().key;
  assert.match(key, /^[a-f0-9]{48}$/);
  assert.equal((await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { loopback: false })).status, 404, 'never from the network');
  assert.equal((await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { key: '' })).status, 401);
  assert.equal((await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { key: 'f'.repeat(48) })).status, 401);
  assert.equal((await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { headers: { origin: 'https://example.com' } })).status, 403);
  assert.equal((await call({}, { method: 'GET' })).status, 405);

  const init = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2' } } });
  assert.equal(init.json.result.protocolVersion, '2025-06-18');
  assert.equal(init.json.result.serverInfo.name, 'taurus-memory');
  assert.equal((await call({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const tools = (await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json.result.tools;
  assert.deepEqual(tools.map((t: any) => t.name), ['memory_search', 'memory_core', 'memory_add']);
  const found = (await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'memory_search', arguments: { query: 'how do I take my coffee' } } })).json.result;
  assert.equal(found.content[0].text, '- Takes coffee black');
  const coreRead = (await call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'memory_core', arguments: {} } })).json.result;
  assert.match(coreRead.content[0].text, /Always reply in short sentences/);
  const added = (await call({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'memory_add', arguments: { fact: 'Is learning to surf' } } })).json.result;
  assert.match(added.content[0].text, /waits for the user's yes/);
  assert.equal(memories().length, 1, 'nothing is saved by another app');
  assert.equal(suggestions().at(-1)?.fact, 'Is learning to surf');
  assert.equal(suggestions().at(-1)?.why, 'Suggested by claude-code');
  assert.equal((await call({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'run_shell', arguments: {} } })).json.error.code, -32602);
  assert.equal(sharing().uses.length, 3);

  // Off again: the key is gone and the route is closed.
  setSharing(false);
  assert.equal((await call({ jsonrpc: '2.0', id: 7, method: 'tools/list' }, { key })).status, 404);
  assert.equal(sharing().key, '');
});

test('by voice: let Claude use my memory, stop sharing my memory', async () => {
  assert.match((await talk('Hey Taurus, let Claude use my memory')).text, /^Memory sharing is on/);
  assert.equal(sharing().on, true);
  assert.match((await talk('share my memory with claude')).text, /Memory sharing is on too/);
  assert.match((await talk('stop sharing my memory')).text, /^Memory sharing is off/);
  assert.equal(sharing().on, false);
});

// On a real server: /mcp answers without the x-taurus header, only with the key.
const port = 8857;
const base = `http://127.0.0.1:${port}`;
let server: ReturnType<typeof spawn>;
const home = mkdtempSync(join(tmpdir(), 'taurus-share-route-'));
const KEY = 'a'.repeat(48);
before(async () => {
  writeFileSync(join(home, 'memory-share.json'), JSON.stringify({ on: true, key: KEY, uses: [] }));
  server = spawn(process.execPath, [join(import.meta.dirname, '../src/index.ts')], { env: { ...process.env, TAURUS_HOME: home, TAURUS_PORT: String(port), TAURUS_BROKER_URL: '', TAURUS_NO_SCHEDULER: '1', TAURUS_WEB_ROOT: tmpdir() }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { await realFetch(`${base}/api/health`); return; } catch { await new Promise(res => setTimeout(res, 100)); } }
});
after(() => { server?.kill(); });

test('/mcp on the real server: the key opens it, a web page can’t', async () => {
  const post = (headers: Record<string, string>) => realFetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal((await post({})).status, 401);
  assert.equal((await post({ Authorization: `Bearer ${KEY}`, Origin: 'http://127.0.0.1:5173' })).status, 403);
  const ok = await post({ Authorization: `Bearer ${KEY}` });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as any).result.tools.length, 3);
});
