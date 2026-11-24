// DeepSeek V4 Flash for everyday asks, the Claude app for big jobs (owner, November 20, 2026: "i wil just be using
// deepseek v4 flash cus its cheap ash and fast and good enough and for any other big work it can just tap into my
// claude app"). Mocked DeepSeek only; no plan apps on this pretend Mac, so Claude here means its key.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-deepseek-'));
process.env.TAURUS_BROKER_URL = '';
process.env.TAURUS_CLI_DIR = mkdtempSync(join(tmpdir(), 'taurus-no-cli-'));
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL']) delete process.env[key];
const { store } = await import('../src/store.ts');
const { settingsCommand, getRoute } = await import('../src/route.ts');
const { ask } = await import('../src/ai.ts');
const { applySettings } = await import('../src/agent.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
const sent: { url: string; auth: string | null; body: any }[] = [];
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (url === 'https://api.deepseek.com/chat/completions') {
    sent.push({ url, auth: new Headers(init.headers).get('Authorization'), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'From DeepSeek.' } }] }), { headers: { 'Content-Type': 'application/json' } });
  }
  if (url === 'https://openrouter.ai/api/v1/models') return new Response(JSON.stringify({ data: [{ id: 'google/gemma-4-31b-it:free', name: 'Gemma', pricing: { prompt: '0', completion: '0' }, context_length: 128000 }] }), { headers: { 'Content-Type': 'application/json' } });
  if (url === 'https://openrouter.ai/api/v1/chat/completions') {
    sent.push({ url, auth: new Headers(init.headers).get('Authorization'), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'From OpenRouter.' } }] }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;

test('saying it: DeepSeek for everything, Claude for big jobs', () => {
  assert.deepEqual(settingsCommand('Hey Taurus, use DeepSeek for everything and Claude for big jobs'), { route: [{ brand: 'deepseek', tiers: ['simple', 'medium', 'hard'] }, { brand: 'claude', tiers: ['hard'] }] });
  assert.deepEqual(settingsCommand('switch to deepseek v4 flash'), { route: [{ brand: 'deepseek', tiers: ['simple', 'medium', 'hard'] }] });
  assert.deepEqual(settingsCommand('use deep seek for quick stuff'), { route: [{ brand: 'deepseek', tiers: ['simple'] }] });
  assert.equal(settingsCommand('ask deepseek what the weather is'), null, 'naming an AI in a request is not a settings change');
});

test('with no OpenRouter or DeepSeek key it says where to paste one, and changes nothing', () => {
  assert.match(applySettings('use deepseek for everything')!, /Paste your OpenRouter key first/);
  assert.deepEqual(getRoute(), {});
});

// The owner's setup: "btw i use my openrouter for deepseek".
test('with only an OpenRouter key, DeepSeek means DeepSeek V4 Flash on OpenRouter, thinking off for quick asks', async () => {
  store.setSecrets({ OPENROUTER_API_KEY: 'sk-or-test', ANTHROPIC_API_KEY: 'sk-ant-test' });
  assert.equal(applySettings('use DeepSeek for everything and Claude for big jobs'), 'Done. DeepSeek V4 Flash on OpenRouter answers everything; Claude takes big jobs.');
  assert.deepEqual(getRoute(), { simple: 'free', medium: 'free', hard: 'claude' });
  assert.equal(store.secret('OPENROUTER_MODEL'), 'deepseek/deepseek-v4-flash');
  const quick = await ask('You are Taurus.', [{ role: 'user', text: 'What time is it in Tokyo?' }], true, { tier: 'simple' });
  assert.equal(quick.text, 'From OpenRouter.');
  assert.equal(sent[0].auth, 'Bearer sk-or-test');
  assert.equal(sent[0].body.model, 'deepseek/deepseek-v4-flash');
  assert.deepEqual(sent[0].body.reasoning, { effort: 'none' });
  sent.length = 0;
  store.setSecrets({ OPENROUTER_API_KEY: '', OPENROUTER_MODEL: '', ANTHROPIC_API_KEY: '' });
  store.saveSettings({ aiRoute: {} });
});

test('quick and everyday asks go to deepseek-flash without thinking; big jobs go to Claude', async () => {
  store.setSecrets({ DEEPSEEK_API_KEY: 'sk-ds-test', ANTHROPIC_API_KEY: 'sk-ant-test' });
  assert.equal(applySettings('use DeepSeek for everything and Claude for big jobs'), 'Done. DeepSeek answers everything; Claude takes big jobs.');
  assert.deepEqual(getRoute(), { simple: 'deepseek', medium: 'deepseek', hard: 'claude' });

  const quick = await ask('You are Taurus.', [{ role: 'user', text: 'What time is it in Tokyo?' }], true, { tier: 'simple' });
  assert.equal(quick.text, 'From DeepSeek.');
  assert.equal(sent[0].auth, 'Bearer sk-ds-test');
  assert.equal(sent[0].body.model, 'deepseek-flash');
  assert.deepEqual(sent[0].body.thinking, { type: 'disabled' });
  await ask('You are Taurus.', [{ role: 'user', text: 'Summarize my day.' }], false, { tier: 'medium' });
  assert.deepEqual(sent[1].body.thinking, { type: 'disabled' });
  // DeepSeek asked for a big job directly (the AI page's Test, say) thinks first.
  await ask('You are Taurus.', [{ role: 'user', text: 'Plan my week.' }], false, { tier: 'hard', provider: 'deepseek' });
  assert.deepEqual(sent[2].body.thinking, { type: 'enabled' });

  // A model the owner pinned wins over the default.
  store.setSecrets({ DEEPSEEK_MODEL: 'deepseek-v4-pro' });
  await ask('You are Taurus.', [{ role: 'user', text: 'Hi' }], true, { tier: 'simple' });
  assert.equal(sent[3].body.model, 'deepseek-v4-pro');
});
