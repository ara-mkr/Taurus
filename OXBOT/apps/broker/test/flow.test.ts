// End-to-end: OXBOT on a Mac signs in to WHOOP through the sign-in service, with WHOOP faked.
// Run: node apps/broker/test/flow.test.ts
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle, type Env } from '../src/worker.ts';

const BROKER = 'https://signin.oxbot.test';
const env: Env = { STATE_SECRET: 'x'.repeat(40), BROKER_URL: BROKER, WHOOP_CLIENT_ID: 'oxbot-whoop-id', WHOOP_CLIENT_SECRET: 'oxbot-whoop-secret' };
process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-test-'));
process.env.OXBOT_BROKER_URL = BROKER;
for (const key of ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET']) delete process.env[key];

let refreshes = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(BROKER)) return handle(new Request(url, init), env);
  if (url === 'https://api.prod.whoop.com/oauth/oauth2/token') {
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('client_secret'), 'oxbot-whoop-secret', 'only the service knows the secret');
    if (body.get('grant_type') === 'authorization_code') {
      assert.equal(body.get('code'), 'CODE-123');
      assert.equal(body.get('redirect_uri'), `${BROKER}/callback`);
      return Response.json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: 'offline read:recovery' });
    }
    assert.equal(body.get('refresh_token'), 'refresh-1');
    refreshes++;
    return Response.json({ access_token: 'access-2', expires_in: 3600 });
  }
  if (url.startsWith('https://api.prod.whoop.com/developer/v2/')) {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer access-2', 'uses the refreshed token');
    if (url.includes('/recovery')) return Response.json({ records: [{ score: { recovery_score: 71, hrv_rmssd_milli: 62.4, resting_heart_rate: 49 } }] });
    if (url.includes('/activity/sleep')) return Response.json({ records: [{ score: { sleep_performance_percentage: 88, stage_summary: { total_in_bed_time_milli: 28_800_000, total_awake_time_milli: 1_800_000 } } }] });
    if (url.includes('/cycle')) return Response.json({ records: [{ score: { strain: 11.26 } }] });
  }
  return realFetch(input, init);
}) as typeof fetch;

const { checkBroker, connectorInfo, finishHandoff, pullAll, startOAuth } = await import('../../server/src/connectors.ts');
const { store } = await import('../../server/src/store.ts');

// 1. OXBOT learns the service has a WHOOP app, so WHOOP becomes one click.
await checkBroker();
const whoop = connectorInfo().find(c => c.id === 'whoop')!;
assert.equal(whoop.oneClick, true);
assert.equal(whoop.ready, true);
assert.equal(connectorInfo().find(c => c.id === 'oura')!.oneClick, false, 'providers the service lacks still need own keys');

// 2. Sign-in goes to the service, then to WHOOP with OXBOT's client ID.
const start = new URL(await startOAuth('whoop'));
assert.equal(start.origin + start.pathname, `${BROKER}/start`);
const toWhoop = await handle(new Request(start), env);
assert.equal(toWhoop.status, 302);
const authorize = new URL(toWhoop.headers.get('Location')!);
assert.equal(authorize.origin + authorize.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
assert.equal(authorize.searchParams.get('client_id'), 'oxbot-whoop-id');
assert.equal(authorize.searchParams.get('scope'), 'offline read:recovery read:sleep read:cycles');

// 3. WHOOP sends the user back to the service; the service hands tokens to this Mac, encrypted.
const back = await handle(new Request(`${BROKER}/callback?code=CODE-123&state=${encodeURIComponent(authorize.searchParams.get('state')!)}`), env);
const handoff = new URL(back.headers.get('Location')!);
assert.equal(handoff.origin + handoff.pathname, 'http://localhost:8787/api/oauth/handoff');
assert.ok(!handoff.href.includes('access-1') && !handoff.href.includes('refresh-1'), 'tokens never appear in the clear');
assert.equal(await finishHandoff(handoff.searchParams.get('nonce')!, handoff.searchParams.get('payload')!), 'WHOOP');
assert.equal(store.tokens('whoop')?.access_token, 'access-1');
await assert.rejects(finishHandoff(handoff.searchParams.get('nonce')!, handoff.searchParams.get('payload')!), /expired|not started/, 'a handoff works once');

// 4. When the token expires, OXBOT refreshes through the service, then reads WHOOP.
store.setTokens('whoop', { ...store.tokens('whoop')!, expires_at: Date.now() - 1 });
const result = (await pullAll()).find(r => r.id === 'whoop')!;
assert.equal(result.error, undefined, result.error);
assert.deepEqual(result.pull?.body, { recovery: 71, hrv: 62, restingHr: 49, sleepScore: 88, sleepMinutes: 450, strain: 11.3 });
assert.equal(refreshes, 1);
assert.equal(store.tokens('whoop')?.refresh_token, 'refresh-1', 'keeps the refresh token when none is returned');

// 5. The service refuses anything that could leak tokens or widen access.
const startWith = (changes: Record<string, string>) => { const u = new URL(start); for (const [k, v] of Object.entries(changes)) u.searchParams.set(k, v); return handle(new Request(u), env); };
assert.equal((await startWith({ return_to: 'https://evil.example/steal' })).status, 400, 'never returns to another website');
assert.equal((await startWith({ scopes: 'offline read:recovery write:everything' })).status, 400, 'read-only scopes only');
assert.equal((await startWith({ provider: 'oura' })).status, 501, 'unconfigured provider says so');
assert.equal((await handle(new Request(`${BROKER}/callback?code=x&state=forged.value`), env)).status, 400, 'forged state is rejected');
assert.equal((await handle(new Request(`${BROKER}/`), { ...env, STATE_SECRET: 'short' })).status, 500, 'refuses to run with a weak secret');

console.log('sign-in service flow: all checks passed');
