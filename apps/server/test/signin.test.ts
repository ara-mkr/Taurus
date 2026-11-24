// Sign in with Slack, GitHub, Notion and Linear (owner, November 19, 2026: "make it just bring into the actual
// companies sign in login page"). Mocked provider responses only: no real account, no network.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-signin-'));
process.env.TAURUS_BROKER_URL = '';
const { apps, authorizeUrl, tokenRequest } = await import('../src/providers.ts');
const { connectorDefs, connectorInfo, isConnected, saveFields, disconnect } = await import('../src/connectors.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake provider payloads */
interface Call { method: string; url: string; headers: Headers; body?: string }
const realFetch = globalThis.fetch;
async function withFetch<T>(reply: (call: Call) => unknown, run: (calls: Call[]) => Promise<T>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { method: (init?.method ?? 'GET').toUpperCase(), url: String(input), headers: new Headers(init?.headers), body: init?.body ? String(init.body) : undefined };
    calls.push(call);
    return Response.json(reply(call));
  }) as typeof fetch;
  try { return await run(calls); } finally { globalThis.fetch = realFetch; }
}
const def = (id: string) => connectorDefs().find(d => d.id === id)!;

test('each sign-in link goes to the company’s own page, with only read access', () => {
  const slack = new URL(authorizeUrl(apps.slack, 'id', 'https://example.com/cb', ['search:read'], 'st'));
  assert.equal(slack.origin + slack.pathname, 'https://slack.com/oauth/v2/authorize');
  assert.equal(slack.searchParams.get('user_scope'), 'search:read');
  assert.equal(slack.searchParams.get('scope'), null);
  const notion = new URL(authorizeUrl(apps.notion, 'id', 'https://example.com/cb', ['pages'], 'st'));
  assert.equal(notion.searchParams.get('owner'), 'user');
  assert.equal(notion.searchParams.get('scope'), null);
  const github = new URL(authorizeUrl(apps.github, 'id', 'https://example.com/cb', ['notifications', 'read:user'], 'st'));
  assert.equal(github.host, 'github.com');
  assert.equal(github.searchParams.get('scope'), 'notifications read:user');
  const linear = new URL(authorizeUrl(apps.linear, 'id', 'https://example.com/cb', ['read'], 'st'));
  assert.equal(linear.host, 'linear.app');
  assert.equal(linear.searchParams.get('scope'), 'read');
});

test('Slack’s user token comes out of authed_user, and a refusal reads as words', async () => {
  const tokens = await withFetch(() => ({ ok: true, authed_user: { access_token: 'xoxp-user', scope: 'search:read' } }), () => tokenRequest(apps.slack, 'id', 'secret', { grant_type: 'authorization_code', code: 'c' }));
  assert.equal(tokens.access_token, 'xoxp-user');
  await assert.rejects(withFetch(() => ({ ok: false, error: 'invalid_code' }), () => tokenRequest(apps.slack, 'id', 'secret', { code: 'c' })), /Slack sign-in expired\./);
});

test('Notion swaps the code with JSON and its client ID and secret in Basic auth', async () => {
  await withFetch(() => ({ access_token: 'ntn-token', bot_id: 'b' }), async calls => {
    const tokens = await tokenRequest(apps.notion, 'id', 'secret', { grant_type: 'authorization_code', code: 'c', redirect_uri: 'https://example.com/cb' });
    assert.equal(tokens.access_token, 'ntn-token');
    assert.equal(calls[0].headers.get('content-type'), 'application/json');
    assert.equal(calls[0].headers.get('authorization'), `Basic ${btoa('id:secret')}`);
    assert.deepEqual(JSON.parse(calls[0].body!), { grant_type: 'authorization_code', code: 'c', redirect_uri: 'https://example.com/cb' });
  });
});

test('signed in, GitHub reads review requests from notifications, never code', async () => {
  const notes = [
    { id: '1', reason: 'review_requested', updated_at: '2026-11-19T10:00:00Z', subject: { title: 'Fix the login', type: 'PullRequest', url: 'https://api.github.com/repos/acme/app/pulls/12' }, repository: { full_name: 'acme/app' } },
    { id: '2', reason: 'mention', updated_at: '2026-11-19T09:00:00Z', subject: { title: 'Chatter', type: 'Issue', url: 'https://api.github.com/repos/acme/app/issues/3' }, repository: { full_name: 'acme/app' } },
  ];
  const pull = await withFetch(() => notes, async calls => {
    const p = await def('github').pull!({ token: async () => 'gho_x', field: () => undefined, signedIn: true });
    assert.match(calls[0].url, /^https:\/\/api\.github\.com\/notifications\?/);
    assert.equal(calls[0].headers.get('authorization'), 'Bearer gho_x');
    return p;
  });
  assert.deepEqual(pull.needs?.map(n => [n.title, n.url]), [['Fix the login', 'https://github.com/acme/app/pull/12']]);
});

test('with a personal token instead, GitHub still searches review requests', async () => {
  await withFetch(() => ({ items: [] }), async calls => {
    await def('github').pull!({ token: async () => 'github_pat_x', field: () => undefined, signedIn: false });
    assert.match(calls[0].url, /\/search\/issues\?/);
  });
});

test('Linear sends a signed-in token as Bearer and a personal key as it is', async () => {
  const empty = { data: { viewer: { assignedIssues: { nodes: [] } } } };
  for (const [signedIn, header] of [[true, 'Bearer lin_oauth'], [false, 'lin_oauth']] as const) {
    await withFetch(() => empty, async calls => {
      await def('linear').pull!({ token: async () => 'lin_oauth', field: () => undefined, signedIn });
      assert.equal(calls[0].headers.get('authorization'), header);
    });
  }
});

test('Notion with no database named reads the first one shared on its sign-in screen', async () => {
  const pull = await withFetch(call => call.url.endsWith('/v1/search')
    ? { results: [{ id: 'db-1', object: 'database' }] }
    : { results: [{ id: 'p1', url: 'https://www.notion.so/p1', last_edited_time: '2026-11-19T10:00:00Z', properties: { Name: { type: 'title', title: [{ plain_text: 'Write the brief' }] }, Status: { type: 'status', status: { name: 'In progress' } } } }] },
  async calls => {
    const p = await def('notion').pull!({ token: async () => 'ntn', field: () => undefined, signedIn: true });
    assert.match(calls[1].url, /\/v1\/databases\/db-1\/query$/);
    return p;
  });
  assert.equal(pull.needs?.[0].title, 'Write the brief');
});

test('a personal key still connects, and its box is marked as the fallback', () => {
  assert.equal(isConnected('slack'), false);
  saveFields('slack', { SLACK_USER_TOKEN: 'xoxp-example' });
  assert.equal(isConnected('slack'), true);
  const slack = connectorInfo().find(c => c.id === 'slack')!;
  assert.equal(slack.auth, 'oauth');
  assert.equal(slack.fields.find(f => f.key === 'SLACK_USER_TOKEN')?.instead, true);
  disconnect('slack');
  assert.equal(isConnected('slack'), false);
});
