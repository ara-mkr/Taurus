// More than one account per app (owner, November 20, 2026: "make it so u can connect multiple gmails or multiple
// accounts", "i have multipe emails"). Mocked Google only, example.com addresses; nothing real is read.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-accounts-'));
process.env.TAURUS_BROKER_URL = '';
const { store } = await import('../src/store.ts');
const c = await import('../src/connectors.ts');
const { searchMail } = await import('../src/live.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
// Each code signs in as one person; each token reads that person's mailbox.
const people: Record<string, { email: string; messages: { id: string; subject: string }[] }> = {
  'tok-a': { email: 'alex@example.com', messages: [{ id: 'a1', subject: 'Lunch Friday?' }] },
  'tok-b': { email: 'alex.work@example.com', messages: [{ id: 'b1', subject: 'Board deck draft' }, { id: 'b2', subject: 'Offer letter' }] },
  'tok-a2': { email: 'alex@example.com', messages: [] },
};
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (url === 'https://oauth2.googleapis.com/token') {
    const code = new URLSearchParams(String(init.body)).get('code')!;
    return json({ access_token: code.replace('code-', 'tok-'), refresh_token: `r-${code}`, expires_in: 3600, scope: 'https://www.googleapis.com/auth/gmail.readonly' });
  }
  const token = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '') ?? '';
  const who = people[token];
  if (!who) return new Response(JSON.stringify({ error: { message: 'bad token' } }), { status: 401 });
  if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/profile') return json({ emailAddress: who.email });
  if (url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) return json({ messages: who.messages.map(m => ({ id: m.id, threadId: `t-${m.id}` })) });
  if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX') return json({ messagesUnread: who.messages.length });
  const one = url.match(/users\/me\/messages\/([a-z0-9]+)\?/);
  if (one) {
    const m = who.messages.find(x => x.id === one[1])!;
    return json({ id: m.id, threadId: `t-${m.id}`, snippet: 'Preview', internalDate: String(Date.now()), labelIds: ['INBOX', 'UNREAD'], payload: { headers: [{ name: 'From', value: 'Sam Example <sam@example.com>' }, { name: 'Subject', value: m.subject }] } });
  }
  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;

store.setSecrets({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' });
const signIn = async (code: string, add: boolean) => {
  const start = new URL(await c.startOAuth('gmail', false, add));
  return c.finishOAuth(start.searchParams.get('state')!, code);
};

test('Google asks which account every time', async () => {
  const start = new URL(await c.startOAuth('gmail'));
  assert.equal(start.searchParams.get('prompt'), 'select_account consent');
});

test('a second Gmail is added under its own address; the same one again just refreshes', async () => {
  await signIn('code-a', false);
  assert.deepEqual(c.accounts('gmail'), [{ key: 'gmail', account: 'alex@example.com', primary: true }]);
  await signIn('code-b', true);
  assert.deepEqual(c.accounts('gmail').map(a => a.account), ['alex@example.com', 'alex.work@example.com']);
  assert.equal(c.accounts('gmail')[1].key, 'gmail@@alex.work@example.com');
  await signIn('code-a2', true);
  assert.equal(c.accounts('gmail').length, 2, 'signing in as an account already here refreshes it');
  assert.equal(store.tokens('gmail')?.access_token, 'tok-a2');
  assert.equal(c.isConnected('gmail'), true);
  store.setTokens('gmail', { ...store.tokens('gmail')!, access_token: 'tok-a' });
});

test('every account is read and marked: sources, reply ids and Gmail links name the account', async () => {
  const [r] = await c.pullAll(d => d.id === 'gmail');
  assert.equal(r.error, undefined);
  const needs = (r.pull as any).needs;
  assert.deepEqual(needs.map((n: any) => n.source).sort(), ['Gmail · alex.work@example.com', 'Gmail · alex.work@example.com', 'Gmail · alex@example.com']);
  assert.equal(needs.find((n: any) => n.title === 'Lunch Friday?').id, 'gmail:a1', 'the first account keeps plain ids');
  const work = needs.find((n: any) => n.title === 'Board deck draft');
  assert.equal(work.id, 'gmail@alex.work@example.com:b1');
  assert.equal(work.url, 'https://mail.google.com/mail/?authuser=alex.work%40example.com#inbox/t-b1');
  assert.equal((r.pull as any).inbox.length, 2, 'one unread count per account');
  const found = await searchMail('board');
  assert.deepEqual((found as any).results.map((x: any) => x.source).sort(), ['Gmail · alex.work@example.com', 'Gmail · alex.work@example.com', 'Gmail · alex@example.com']);
});

test('remove one account, or the first one and the next takes its place', () => {
  c.disconnect('gmail', 'gmail@@alex.work@example.com');
  assert.deepEqual(c.accounts('gmail').map(a => a.account), ['alex@example.com']);
  store.setTokens('gmail@@alex.work@example.com', { access_token: 'tok-b', meta: { account: 'alex.work@example.com' } });
  c.disconnect('gmail');
  assert.deepEqual(c.accounts('gmail'), [{ key: 'gmail', account: 'alex.work@example.com', primary: true }]);
  c.disconnect('gmail');
  assert.deepEqual(c.accounts('gmail'), []);
  assert.equal(c.isConnected('gmail'), false);
});

test('by voice: "add another Gmail account" opens Connections and says what to tap', async () => {
  const { instant } = await import('../src/instant.ts');
  assert.match((await instant('Hey Taurus, add another Gmail account', 'talk'))!.text, /^Tap Gmail, then Add another Gmail account/);
  assert.match((await instant('connect my other outlook', 'talk'))!.text, /^Tap Outlook Mail/);
  assert.match((await instant('add another email', 'talk'))!.text, /^Tap Gmail/);
});
