// The Twilio phone call, against mocked responses only. No real account, no real call:
// every outside request goes to a fake fetch, and an unexpected one fails the test.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-call-'));
process.env.OXBOT_BROKER_URL = '';
const { channelStatus, phoneNumber, ring, testCall } = await import('../src/ring.ts');
const { store } = await import('../src/store.ts');

const sid = `AC${'0123456789abcdef'.repeat(2)}`;
interface Call { method: string; url: string; headers: Headers; body: URLSearchParams }
let calls: Call[] = [];
let reply: { status: number; body: unknown } = { status: 201, body: { sid: 'CA-test' } };
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (!url.startsWith('https://api.twilio.com/')) throw new Error(`Unexpected request: ${url}`);
  calls.push({ method: init.method ?? 'GET', url, headers: new Headers(init.headers), body: new URLSearchParams(String(init.body)) });
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

beforeEach(() => {
  calls = []; reply = { status: 201, body: { sid: 'CA-test' } };
  store.setSecrets({ TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: 'token-test', TWILIO_FROM: '+15551230000', MY_PHONE: '(555) 765-4321', NTFY_TOPIC: '' });
});

test('numbers are accepted the way people type them', () => {
  assert.equal(phoneNumber('+1 555 765 4321'), '+15557654321');
  assert.equal(phoneNumber('(555) 765-4321'), '+15557654321');
  assert.equal(phoneNumber('1-555-765-4321'), '+15557654321');
  assert.equal(phoneNumber('+44 20 7946 0000'), '+442079460000');
  assert.equal(phoneNumber('765-4321'), '');
});

test('Call me now places one call from your Twilio number to your mobile and reads the message', async () => {
  const result = await testCall();
  assert.equal(calls.length, 1);
  const [c] = calls;
  assert.equal(c.method, 'POST');
  assert.equal(c.url, `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`);
  assert.equal(c.headers.get('Authorization'), `Basic ${Buffer.from(`${sid}:token-test`).toString('base64')}`);
  assert.equal(c.body.get('To'), '+15557654321');
  assert.equal(c.body.get('From'), '+15551230000');
  assert.match(c.body.get('Twiml')!, /<Say>This is OXBOT\. Test call\. If you can hear this, OXBOT can reach you\.<\/Say>/);
  assert.equal(result.message, 'Called +•••••••4321.');
  assert.equal(channelStatus().lastCall?.ok, true);
});

test('a Twilio refusal comes back as what to change, and is shown as the last call', async () => {
  reply = { status: 400, body: { code: 21219, message: 'The number +15557654321 is unverified.' } };
  await assert.rejects(testCall(), /trial account can only call numbers you’ve verified/);
  reply = { status: 401, body: { code: 20003, message: 'Authenticate' } };
  await assert.rejects(testCall(), /Account SID and auth token/);
  reply = { status: 400, body: { code: 99999, message: 'Something new' } };
  await assert.rejects(testCall(), /Twilio said: Something new/);
  assert.deepEqual({ ok: channelStatus().lastCall?.ok, message: channelStatus().lastCall?.message }, { ok: false, message: 'Twilio said: Something new' });
});

test('a mistyped Account SID or number is caught before anything is sent', async () => {
  store.setSecrets({ TWILIO_ACCOUNT_SID: 'SK123' });
  await assert.rejects(testCall(), /starts with AC/);
  store.setSecrets({ TWILIO_ACCOUNT_SID: sid, MY_PHONE: '765-4321' });
  await assert.rejects(testCall(), /mobile number doesn’t look right/);
  assert.equal(calls.length, 0);
});

test('with no screen open and no push, a ring calls straight away and is marked as escalated', async () => {
  const r = await ring({ title: 'Board call', detail: 'Starts in 5 minutes.', reason: 'manual' });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.get('Twiml')!, /Board call\. Starts in 5 minutes\./);
  assert.equal(r.state, 'escalated');
  assert.ok(r.channels.includes('phone call'));
});

test('a Limited trial account that refuses Twiml gets the same words through the echo Twimlet, without Timeout', async () => {
  const replies = [
    { status: 400, body: { code: 0, message: 'Invalid or disallowed parameters provided - trial accounts have limited parameter access, upgrade your account to unlock full functionality' } },
    { status: 201, body: { sid: 'CA-test' } },
  ];
  const mock = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { reply = replies.shift()!; return mock(input, init); }) as typeof fetch;
  try {
    const result = await testCall();
    assert.equal(calls.length, 2);
    const [first, second] = calls;
    assert.ok(first.body.get('Twiml'));
    assert.equal(second.body.get('Twiml'), null);
    assert.equal(second.body.get('Timeout'), null);
    const url = new URL(second.body.get('Url')!);
    assert.equal(url.origin + url.pathname, 'https://twimlets.com/echo');
    assert.equal(url.searchParams.get('Twiml'), first.body.get('Twiml'));
    assert.equal(result.message, 'Called +•••••••4321.');
  } finally { globalThis.fetch = mock; }
});
