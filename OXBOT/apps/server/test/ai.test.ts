// The AI providers added October 31, 2026, against mocked responses only. No real account, no network:
// every outside request goes to a fake fetch, and an unexpected one fails the test.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-ai-'));
process.env.OXBOT_BROKER_URL = '';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY']) delete process.env[key];
const ai = await import('../src/ai.ts');
const { store } = await import('../src/store.ts');
const { connectorInfo } = await import('../src/connectors.ts');

interface Call { method: string; url: string; headers: Headers; body?: any } // eslint-disable-line @typescript-eslint/no-explicit-any
let calls: Call[] = [];
let routes: [RegExp, (call: Call) => unknown][] = [];
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  const call = { method: init.method ?? 'GET', url, headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : undefined };
  calls.push(call);
  const route = routes.find(([pattern]) => pattern.test(url));
  if (!route) throw new Error(`Unexpected request: ${call.method} ${url}`);
  return new Response(JSON.stringify(route[1](call)), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const reply = (text: string) => ({ choices: [{ message: { role: 'assistant', content: text } }] });
const allKeys = ai.providers.flatMap(p => [p.key, p.model, p.urlField].filter(Boolean) as string[]);
beforeEach(() => {
  calls = []; routes = [];
  store.setSecrets(Object.fromEntries(allKeys.map(k => [k, ''])));
  store.saveSettings({ aiProvider: '' });
});

test('nothing is connected by default, and asking says how to connect one', async () => {
  assert.equal(ai.current(), undefined);
  await assert.rejects(ai.ask('system', [{ role: 'user', text: 'hi' }]), /Settings, then AI/);
  const listed = connectorInfo().filter(c => c.group === 'AI');
  assert.equal(listed.length, ai.providers.length);
  assert.ok(listed.every(c => !c.connected));
  assert.ok(listed.some(c => c.name === 'OXBOT Free (OpenRouter)'));
});

test('OXBOT Free lists only free text models, Nemotron 3 Ultra first', async () => {
  routes.push([/openrouter\.ai\/api\/v1\/models$/, () => ({ data: [
    { id: 'openai/gpt-sol', name: 'GPT Sol', pricing: { prompt: '0.000002', completion: '0.00001' }, context_length: 400000 },
    { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)', pricing: { prompt: '0', completion: '0' }, context_length: 262144 },
    { id: 'nvidia/nemotron-3.5-content-safety:free', name: 'Safety', pricing: { prompt: '0', completion: '0' }, context_length: 128000 },
    { id: 'google/lyria-3-pro-preview', name: 'Lyria', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['audio'] } },
    { id: 'openrouter/free', name: 'Free Models Router', pricing: { prompt: '0', completion: '0' }, context_length: 200000 },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA: Nemotron 3 Ultra (free)', pricing: { prompt: '0', completion: '0' }, context_length: 1000000 },
  ] })]);
  const free = await ai.freeModels();
  assert.deepEqual(free.map(m => m.id), ['nvidia/nemotron-3-ultra-550b-a55b:free', 'openrouter/free', 'google/gemma-4-31b-it:free']);
  assert.equal(free[0].name, 'NVIDIA: Nemotron 3 Ultra');
  assert.ok(calls.every(c => c.method === 'GET' && !c.headers.has('Authorization')), 'the public model list needs no key');
});

test('Sign in with OpenRouter is PKCE with S256, comes back to this Mac, and saves your own key', async () => {
  const start = new URL(ai.openRouterSignIn('http://localhost:8787/api/ai/openrouter/callback'));
  assert.equal(start.origin + start.pathname, 'https://openrouter.ai/auth');
  assert.equal(start.searchParams.get('callback_url'), 'http://localhost:8787/api/ai/openrouter/callback');
  assert.equal(start.searchParams.get('code_challenge_method'), 'S256');
  routes.push([/openrouter\.ai\/api\/v1\/auth\/keys$/, call => {
    assert.equal(call.method, 'POST');
    assert.equal(call.body.code, 'code-from-openrouter');
    assert.equal(call.body.code_challenge_method, 'S256');
    assert.equal(createHash('sha256').update(call.body.code_verifier).digest('base64url'), start.searchParams.get('code_challenge'));
    return { key: 'sk-or-test-key' };
  }]);
  await assert.rejects(ai.openRouterFinish('a-state-we-never-made', 'code-from-openrouter'), /expired/);
  await ai.openRouterFinish(start.searchParams.get('state')!, 'code-from-openrouter');
  assert.equal(store.secret('OPENROUTER_API_KEY'), 'sk-or-test-key');
  assert.equal(store.settings().aiProvider, 'openrouter');
  assert.equal(ai.current()?.id, 'openrouter');
  await assert.rejects(ai.openRouterFinish(start.searchParams.get('state')!, 'code-from-openrouter'), /expired/, 'a state is single use');
});

test('OXBOT Free asks the chosen free model with your key', async () => {
  store.setSecrets({ OPENROUTER_API_KEY: 'sk-or-test-key', OPENROUTER_MODEL: 'google/gemma-4-31b-it:free' });
  routes.push([/openrouter\.ai\/api\/v1\/chat\/completions$/, () => reply('<think>planning</think>Your 10:00 with Dana is next.')]);
  const answer = await ai.ask('You are OXBOT.', [{ role: 'user', text: 'What is next?' }]);
  assert.deepEqual(answer, { provider: 'OXBOT Free', text: 'Your 10:00 with Dana is next.' });
  const [call] = calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.get('Authorization'), 'Bearer sk-or-test-key');
  assert.equal(call.headers.get('X-Title'), 'OXBOT');
  assert.equal(call.body.model, 'google/gemma-4-31b-it:free');
  assert.deepEqual(call.body.messages, [{ role: 'system', content: 'You are OXBOT.' }, { role: 'user', content: 'What is next?' }]);
});

test('every OpenAI-compatible lab gets its own address, key and model', async () => {
  const chat = ai.providers.filter(p => p.kind === 'chat' && p.key && !p.free && !p.urlField);
  assert.ok(chat.length >= 10);
  for (const p of chat) {
    calls = []; routes = [];
    store.setSecrets(Object.fromEntries(allKeys.map(k => [k, ''])));
    store.setSecrets({ [p.key!]: `key-${p.id}`, [p.model]: `model-${p.id}` });
    store.saveSettings({ aiProvider: p.id });
    routes.push([/\/chat\/completions$/, () => reply(`hello from ${p.id}`)]);
    assert.equal((await ai.ask('s', [{ role: 'user', text: 'q' }])).text, `hello from ${p.id}`);
    assert.equal(calls.length, 1, p.id);
    assert.equal(calls[0].url, `${p.base}/chat/completions`, p.id);
    assert.ok(calls[0].url.startsWith('https://'), `${p.id} uses https`);
    assert.equal(calls[0].headers.get('Authorization'), `Bearer key-${p.id}`);
    assert.equal(calls[0].body.model, `model-${p.id}`);
  }
});

test('with no model saved, Gemini picks the newest from Google’s own list', async () => {
  store.setSecrets({ GEMINI_API_KEY: 'key-gemini' });
  routes.push([/generativelanguage\.googleapis\.com\/v1beta\/openai\/models$/, () => ({ data: [
    { id: 'models/gemini-2.5-flash' }, { id: 'models/gemini-3.1-flash' }, { id: 'models/gemini-3.1-pro' }, { id: 'models/gemini-3.1-pro-preview-tts' }, { id: 'models/embedding-001' },
  ] })]);
  routes.push([/\/chat\/completions$/, () => reply('ok')]);
  await ai.ask('s', [{ role: 'user', text: 'q' }]);
  assert.equal(calls.at(-1)!.body.model, 'gemini-3.1-pro');
});

test('Ollama runs on this Mac with no key, and a custom address can be any OpenAI-style service', async () => {
  store.setSecrets({ OLLAMA_MODEL: 'llama3.2' });
  routes.push([/\/chat\/completions$/, () => reply('local')]);
  await ai.ask('s', [{ role: 'user', text: 'q' }]);
  assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(calls[0].headers.get('Authorization'), null);

  calls = [];
  store.setSecrets({ OLLAMA_MODEL: '', CUSTOM_AI_URL: 'https://llm.example.com/v1/', CUSTOM_AI_MODEL: 'house-model', CUSTOM_AI_KEY: 'key-custom' });
  await ai.ask('s', [{ role: 'user', text: 'q' }]);
  assert.equal(calls[0].url, 'https://llm.example.com/v1/chat/completions');
  assert.equal(calls[0].body.model, 'house-model');
});

test('your pick wins when it is connected; otherwise a paid lab is used before the free plan', () => {
  store.setSecrets({ OPENROUTER_API_KEY: 'sk-or', MISTRAL_API_KEY: 'key-mistral' });
  assert.equal(ai.current()?.id, 'mistral');
  store.saveSettings({ aiProvider: 'openrouter' });
  assert.equal(ai.current()?.id, 'openrouter');
  store.saveSettings({ aiProvider: 'grok' });
  assert.equal(ai.current()?.id, 'mistral', 'Grok is picked but has no key');
});
