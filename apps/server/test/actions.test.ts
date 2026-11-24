// Actions and approvals (owner, November 1, 2026), against mocked provider responses only. No real account, no
// real send, call or purchase: every outside request goes to a fake fetch, and an unexpected one fails the test.
// The guard below fails any request that changes something unless an approved action is running at that moment.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-actions-'));
process.env.TAURUS_BROKER_URL = '';
const { store } = await import('../src/store.ts');
const actions = await import('../src/actions/index.ts');
const { grantDefs, connectorDefs } = await import('../src/connectors.ts');
const { readScopes, writeScopes } = await import('../src/providers.ts');
const { dashboard } = await import('../src/dashboard.ts');
const { choose, parseReceipt } = await import('../src/actions/food.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake provider payloads */
interface Call { method: string; url: string; headers: Headers; body: string }
let calls: Call[] = [];
let failNext: ((c: Call) => Response | 'throw' | undefined) | undefined;
const now = Date.now(), HOUR = 3_600_000;
const sid = `AC${'0123456789abcdef'.repeat(2)}`;
const readOnlyTools = new Set(['CANVA_LIST_DESIGNS']);

// Requests that change something. Each must happen while an approved action is running.
const writes: [RegExp, (c: Call) => boolean][] = [
  [/gmail\.googleapis\.com\/.*\/messages\/send$/, () => true],
  [/graph\.microsoft\.com\/v1\.0\/me\/(sendMail|messages\/[^/]+\/reply)$/, () => true],
  [/slack\.com\/api\/(chat\.postMessage|reactions\.add)$/, () => true],
  [/api\.twilio\.com\/.*\/(Messages|Calls)\.json$/, () => true],
  [/api\.github\.com\/repos\/.*\/reviews$/, c => c.method === 'POST'],
  [/api\.linear\.app\/graphql$/, c => /\bmutation\b/.test(c.body)],
  [/backend\.composio\.dev\/api\/v3\.1\/tools\/execute\/(?!proxy$)/, c => !readOnlyTools.has(c.url.split('/').pop()!)],
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function reply(c: Call): Response {
  const u = c.url;
  // Reads the board pulls: Gmail and Slack, so there are live items to reply to.
  if (/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\?/.test(u)) return json(u.includes('doordash') ? { messages: [{ id: 'r1' }, { id: 'r2' }] } : u.includes(encodeURIComponent('from:sam')) ? { messages: [{ id: 'm9' }] } : { messages: [{ id: 'm1' }] });
  if (/\/messages\/m9\?format=metadata/.test(u)) return json({ id: 'm9', threadId: 't9', internalDate: String(now - 9 * 24 * HOUR), snippet: 'Can you send the deck?', payload: { headers: [{ name: 'From', value: 'Sam Okafor <sam@example.com>' }, { name: 'Subject', value: 'Deck' }, { name: 'Message-ID', value: '<deck@mail.example.com>' }] } });
  if (/\/messages\/not-on-board\?format=metadata/.test(u)) return json({ error: { code: 404, message: 'Requested entity was not found.' } }, 404);
  if (/\/labels\/INBOX$/.test(u)) return json({ messagesUnread: 3 });
  if (/\/messages\/m1\?format=metadata/.test(u)) return json({ id: 'm1', threadId: 't1', internalDate: String(now - HOUR), snippet: 'Can you confirm Thursday?', payload: { headers: [{ name: 'From', value: 'Dana Whitfield <dana@example.com>' }, { name: 'Subject', value: 'Board seat' }, { name: 'Message-ID', value: '<abc@mail.example.com>' }] } });
  if (/\/messages\/r1\?format=metadata/.test(u)) return json({ id: 'r1', internalDate: String(now - 6 * HOUR), snippet: '1x Harvest Bowl $14.95 Total: $18.45', payload: { headers: [{ name: 'From', value: 'DoorDash <no-reply@doordash.com>' }, { name: 'Subject', value: 'Order Confirmation for Sam from Example Greens' }] } });
  if (/\/messages\/r2\?format=metadata/.test(u)) return json({ id: 'r2', internalDate: String(now - 50 * HOUR), snippet: 'Total: $31.20', payload: { headers: [{ name: 'From', value: 'Uber Eats <uber@uber.com>' }, { name: 'Subject', value: 'Your Uber Eats order with Example Burgers' }] } });
  if (/slack\.com\/api\/auth\.test$/.test(u)) return json({ ok: true, user_id: 'U1', url: 'https://example.slack.com/' });
  if (/slack\.com\/api\/search\.messages/.test(u)) return json({ ok: true, messages: { matches: [{ ts: String((now - HOUR) / 1000), text: '<@U1> approve the plan?', username: 'priya', channel: { id: 'C0LEAD', name: 'leadership' }, permalink: 'https://example.slack.com/x' }] } });
  if (/gmail\.googleapis\.com\/.*\/messages\/send$/.test(u)) return json({ id: 'sent1' });
  if (/graph\.microsoft\.com/.test(u)) return new Response('', { status: 202 });
  if (/slack\.com\/api\/(chat\.postMessage|reactions\.add)$/.test(u)) return json({ ok: true, ts: '1.2' });
  if (/api\.twilio\.com/.test(u)) return json({ sid: 'SM1' }, 201);
  if (/api\.github\.com/.test(u)) return json({ id: 9 });
  if (/api\.linear\.app\/graphql$/.test(u)) return json(/mutation/.test(c.body) ? { data: { ok: { success: true } } } : { data: { issue: { id: 'uuid-412', identifier: 'TAURUS-412', title: 'Checkout outage', state: { name: 'In Review' }, team: { states: { nodes: [{ id: 's-done', name: 'Done' }, { id: 's-rev', name: 'In Review' }] } } } } });
  if (/composio\.dev\/api\/v3\.1\/connected_accounts/.test(u)) return json({ items: u.includes('toolkit_slugs=canva') ? [{ id: 'ca_canva', toolkit: { slug: 'canva' } }] : [] });
  if (/composio\.dev\/api\/v3\.1\/tools\/CANVA_CREATE_DESIGN$/.test(u)) return json({ slug: 'CANVA_CREATE_DESIGN', name: 'Create design', toolkit: { slug: 'canva', name: 'Canva' }, tags: ['createHint'], input_parameters: { properties: { title: { type: 'string' } } } });
  if (/composio\.dev\/api\/v3\.1\/tools\/CANVA_DELETE_DESIGN$/.test(u)) return json({ slug: 'CANVA_DELETE_DESIGN', name: 'Delete design', toolkit: { slug: 'canva', name: 'Canva' }, tags: ['destructiveHint'] });
  if (/composio\.dev\/api\/v3\.1\/tools\/CANVA_LIST_DESIGNS$/.test(u)) return json({ slug: 'CANVA_LIST_DESIGNS', name: 'List designs', toolkit: { slug: 'canva', name: 'Canva' }, tags: ['readOnlyHint'] });
  if (/composio\.dev\/api\/v3\.1\/tools\?/.test(u)) return json({ items: [{ slug: 'CANVA_CREATE_DESIGN', name: 'Create design', toolkit: { slug: 'canva', name: 'Canva' }, tags: ['createHint'], input_parameters: { properties: { title: { type: 'string', description: 'Design title' } }, required: ['title'] } }] });
  if (/composio\.dev\/api\/v3\.1\/tools\/execute\//.test(u)) return json({ successful: true, error: null, data: { design: { url: 'https://www.canva.com/design/example' } } });
  throw new Error(`Unexpected request: ${c.method} ${u}`);
}
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const c: Call = { method: (init.method ?? 'GET').toUpperCase(), url: String(input), headers: new Headers(init.headers), body: init.body ? String(init.body) : '' };
  calls.push(c);
  const write = writes.find(([pattern, when]) => pattern.test(c.url) && when(c));
  assert.ok(!write || actions.runningNow() > 0, `${c.method} ${c.url} changes something with no approved action running`);
  assert.equal(new URL(c.url).protocol, 'https:', `${c.url} is not https`);
  const forced = failNext?.(c);
  if (forced === 'throw') { failNext = undefined; throw new TypeError('fetch failed'); }
  if (forced) { failNext = undefined; return forced; }
  return reply(c);
}) as typeof fetch;

store.setSecrets({
  GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret', MICROSOFT_CLIENT_ID: 'm-id', MICROSOFT_CLIENT_SECRET: 'm-secret',
  SLACK_USER_TOKEN: 'xoxp-read', SLACK_ACTION_TOKEN: 'xoxp-write', GITHUB_ACTION_TOKEN: 'ghp-write', LINEAR_ACTION_KEY: 'lin-write',
  TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: 'tw-token', TWILIO_FROM: '+15551230000', MY_PHONE: '+15557654321', TWILIO_ACTIONS_ON: '1',
  COMPOSIO_API_KEY: 'cmp-test', COMPOSIO_ACTIONS_ON: '1',
});
for (const id of ['gmail', 'gmail-send', 'outlook-mail', 'outlook-send']) store.setTokens(id, { access_token: `${id}-token` });
const board = await dashboard(true);
const sent = (pattern: RegExp) => calls.filter(c => pattern.test(c.url) && c.method === 'POST');
beforeEach(() => { calls = []; failNext = undefined; });

test('the board has live items to act on, and pulling it changed nothing', () => {
  assert.ok(board.needs.some(n => n.id === 'gmail:m1'));
  assert.ok(board.needs.some(n => n.id.startsWith('slack:C0LEAD:')));
});

test('a proposal shows exactly what will go out, and sends nothing until approved', async () => {
  const p = await actions.propose('email.send', { to: 'Dana@Example.com', subject: 'Thursday', text: 'Thursday at 10 works.' }, 'ask');
  assert.equal(p.state, 'pending');
  assert.equal(p.to, 'dana@example.com');
  assert.equal(p.text, 'Thursday at 10 works.');
  assert.deepEqual(p.lines.map(l => l.value), ['Thursday', 'Gmail']);
  assert.match(p.caution ?? '', /First time Taurus contacts dana@example\.com/);
  assert.ok(Date.parse(p.expiresAt) - Date.parse(p.createdAt) === 15 * 60_000);
  assert.equal(sent(/messages\/send$/).length, 0);
  assert.ok(actions.pending().some(x => x.id === p.id));
  const done = await actions.approve(p.id, { digest: p.digest });
  assert.equal(done.state, 'done');
  const raw = Buffer.from(JSON.parse(sent(/messages\/send$/)[0].body).raw, 'base64url').toString();
  assert.match(raw, /^To: dana@example\.com\r\nSubject: Thursday\r\n/);
  assert.equal(Buffer.from(raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString(), 'Thursday at 10 works.');
  assert.equal(actions.log().find(x => x.id === p.id)?.state, 'done');
  assert.equal(store.doc<any[]>('actions.json', []).find(x => x.id === p.id)?.state, 'done', 'logged in ~/.taurus');
});

test('approval is bound to the version you saw, runs once, and never after it expires', async () => {
  const p = await actions.propose('text.send', { to: '(555) 222-0100', name: 'Sam', text: 'Running 5 late.' }, 'ask');
  await assert.rejects(actions.approve(p.id, { digest: 'not-it' }), /changed after you saw it/);
  const [a, b] = await Promise.allSettled([actions.approve(p.id, { digest: p.digest }), actions.approve(p.id, { digest: p.digest })]);
  assert.equal([a, b].filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(sent(/Messages\.json$/).length, 1, 'two taps, one text');
  assert.equal(new URLSearchParams(sent(/Messages\.json$/)[0].body).get('To'), '+15552220100');
  const late = await actions.propose('text.send', { to: '+15552220100', text: 'Later.' }, 'ask');
  const real = Date.now;
  Date.now = () => real() + 16 * 60_000;
  try { await assert.rejects(actions.approve(late.id, { digest: late.digest }), /expired/); } finally { Date.now = real; }
  assert.equal(actions.get(late.id)?.state, 'expired');
  assert.equal(sent(/Messages\.json$/).length, 1);
});

test('declining sends nothing, and an edited text is what goes out', async () => {
  const p = await actions.propose('email.reply', { need: 'gmail:m1', text: 'Yes.' }, 'ask');
  assert.equal(p.to, 'dana@example.com');
  assert.equal(actions.decline(p.id).state, 'declined');
  await assert.rejects(actions.approve(p.id, { digest: p.digest }), /already declined/);
  const q = await actions.propose('email.reply', { need: 'gmail:m1', text: 'Yes.' }, 'ask');
  const done = await actions.approve(q.id, { digest: q.digest, text: 'Yes, Thursday at 10.' });
  assert.equal(done.text, 'Yes, Thursday at 10.');
  const body = JSON.parse(sent(/messages\/send$/)[0].body);
  assert.equal(body.threadId, 't1');
  const raw = Buffer.from(body.raw, 'base64url').toString();
  assert.match(raw, /Subject: Re: Board seat/);
  assert.match(raw, /In-Reply-To: <abc@mail\.example\.com>/);
  assert.equal(Buffer.from(raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString(), 'Yes, Thursday at 10.');
});

test('a dropped connection is "unknown" and is never retried on its own', async () => {
  const p = await actions.propose('call.connect', { to: '+15552220100', name: 'Sam' }, 'ask');
  failNext = c => /Calls\.json$/.test(c.url) ? 'throw' : undefined;
  const done = await actions.approve(p.id, { digest: p.digest });
  assert.equal(done.state, 'unknown');
  assert.match(done.result ?? '', /can’t tell whether this went through/);
  assert.equal(sent(/Calls\.json$/).length, 1);
  await assert.rejects(actions.approve(p.id, { digest: p.digest }), /already unknown/);
});

test('a provider that says no is "failed", in its own words', async () => {
  const p = await actions.propose('slack.post', { channel: '#leadership', text: 'Plan approved.' }, 'ask');
  failNext = c => /chat\.postMessage$/.test(c.url) ? json({ ok: false, error: 'not_in_channel' }) : undefined;
  const done = await actions.approve(p.id, { digest: p.digest });
  assert.equal(done.state, 'failed');
  assert.equal(done.result, 'Slack said: not_in_channel');
});

test('Outlook, Slack, Twilio, GitHub and Linear build the documented requests', async () => {
  const run = async (kind: string, args: Record<string, unknown>) => { const p = await actions.propose(kind, args, 'ask'); return actions.approve(p.id, { digest: p.digest }); };
  await run('email.send', { to: 'priya@example.com', subject: 'Plan', text: 'Approved.', account: 'outlook' });
  assert.deepEqual(JSON.parse(sent(/sendMail$/)[0].body).message.toRecipients, [{ emailAddress: { address: 'priya@example.com' } }]);
  const slackId = board.needs.find(n => n.id.startsWith('slack:'))!.id;
  await run('slack.reply', { need: slackId, text: 'Approved.' });
  assert.equal(JSON.parse(sent(/chat\.postMessage$/)[0].body).thread_ts, slackId.split(':')[2]);
  assert.equal(sent(/chat\.postMessage$/)[0].headers.get('Authorization'), 'Bearer xoxp-write', 'writes use the action token, never the read token');
  await run('slack.react', { need: slackId, emoji: ':white_check_mark:' });
  assert.equal(JSON.parse(sent(/reactions\.add$/)[0].body).name, 'white_check_mark');
  const call = await run('call.connect', { to: '+15552220100', name: 'Sam' });
  const form = new URLSearchParams(sent(/Calls\.json$/)[0].body);
  assert.equal(form.get('To'), '+15557654321', 'your phone rings first');
  assert.match(form.get('Twiml')!, /<Dial callerId="\+15551230000">\+15552220100<\/Dial>/);
  assert.equal(call.state, 'done');
  await run('github.review', { pr: 'https://github.com/example/web/pull/7', event: 'approve' });
  assert.match(sent(/reviews$/)[0].url, /repos\/example\/web\/pulls\/7\/reviews$/);
  assert.equal(JSON.parse(sent(/reviews$/)[0].body).event, 'APPROVE');
  const moved = await run('linear.status', { issue: 'TAURUS-412', status: 'done' });
  assert.equal(moved.title, 'Move TAURUS-412 to Done');
  assert.deepEqual(JSON.parse(sent(/linear\.app/).at(-1)!.body).variables, { id: 'uuid-412', input: { stateId: 's-done' } });
});

test('mail search finds someone beyond the board, and a reply to what it found goes to the right thread', async () => {
  const { searchMail } = await import('../src/live.ts');
  const found = await searchMail('from:sam') as { results: { id: string; from: string; subject: string }[] };
  assert.deepEqual(found.results.map(r => [r.id, r.from, r.subject]), [['gmail:m9', 'Sam Okafor <sam@example.com>', 'Deck']]);
  assert.ok(!board.needs.some(n => n.id === 'gmail:m9'), 'not on the board');
  assert.ok(calls.every(c => c.method === 'GET'), 'searching only reads');
  const p = await actions.propose('email.reply', { need: 'gmail:m9', text: 'Here it is.' }, 'ask');
  assert.equal(p.to, 'sam@example.com');
  await actions.approve(p.id, { digest: p.digest });
  assert.equal(JSON.parse(sent(/messages\/send$/)[0].body).threadId, 't9');
});

test('a robot-voice call says so before you approve it', async () => {
  const p = await actions.propose('call.message', { to: '+15552220100', text: 'The meeting moved to 3.' }, 'ask');
  assert.match(p.caution ?? '', /computer voice.*prior consent/);
  actions.decline(p.id);
});

test('bad input is refused before anything is proposed', async () => {
  await assert.rejects(actions.propose('email.send', { to: 'Dana', subject: 'x', text: 'y' }, 'ask'), /isn’t an email address/);
  await assert.rejects(actions.propose('text.send', { to: '765-4321', text: 'y' }, 'ask'), /isn’t a phone number/);
  await assert.rejects(actions.propose('email.reply', { need: 'gmail:not-on-board', text: 'y' }, 'ask'), /Gmail can’t find that email/);
  await assert.rejects(actions.propose('nope.nothing', {}, 'ask'), /no action called/);
  const subject = await actions.propose('email.send', { to: 'dana@example.com', subject: 'Hi\r\nBcc: evil@example.com', text: 'y' }, 'ask');
  assert.equal(subject.lines[0].value, 'Hi Bcc: evil@example.com', 'a subject can never add a header');
  actions.decline(subject.id);
});

test('Composio: read-only tools run, everything else waits for approval', async () => {
  const found = await actions.findTools('canva', 'new design');
  assert.equal(found[0].slug, 'CANVA_CREATE_DESIGN');
  assert.equal(found[0].readOnly, false);
  assert.deepEqual(await actions.readTool('CANVA_LIST_DESIGNS'), { design: { url: 'https://www.canva.com/design/example' } });
  await assert.rejects(actions.readTool('CANVA_CREATE_DESIGN'), /needs your approval/);
  assert.equal(calls.filter(c => /execute\/CANVA_CREATE_DESIGN$/.test(c.url)).length, 0);
  const p = await actions.propose('app.action', { tool: 'CANVA_CREATE_DESIGN', arguments: { title: 'Board deck' }, summary: 'Create a Canva design called Board deck' }, 'ask');
  assert.deepEqual(p.lines, [{ label: 'App', value: 'Canva' }, { label: 'Action', value: 'Create design' }, { label: 'title', value: 'Board deck' }]);
  const done = await actions.approve(p.id, { digest: p.digest });
  assert.equal(done.result, 'Done in Canva. https://www.canva.com/design/example');
  assert.deepEqual(JSON.parse(sent(/execute\/CANVA_CREATE_DESIGN$/)[0].body), { connected_account_id: 'ca_canva', user_id: 'default', arguments: { title: 'Board deck' } });
  const del = await actions.propose('app.action', { tool: 'CANVA_DELETE_DESIGN', arguments: { id: 'd1' } }, 'ask');
  assert.match(del.caution ?? '', /deletes or replaces something in Canva/);
  actions.decline(del.id);
});

test('food: one pick with item, place and total, and approving only opens the app', async () => {
  const p = await actions.propose('food.order', {}, 'talk');
  assert.equal(p.purchase?.place, 'Example Burgers', 'not what you had in the last 20 hours');
  assert.equal(p.purchase?.total, 'About $31.20');
  assert.equal(Date.parse(p.expiresAt) - Date.parse(p.createdAt), 10 * 60_000, 'purchases expire sooner');
  assert.match(p.caution ?? '', /No delivery app lets Taurus place an order/);
  assert.equal(p.open, 'https://www.ubereats.com/search?q=Example%20Burgers');
  const done = await actions.approve(p.id, { digest: p.digest });
  assert.match(done.result ?? '', /Tap Place order/);
  assert.equal(store.doc<any[]>('food.json', []).at(-1).place, 'Example Burgers');
  assert.ok(calls.every(c => c.method === 'GET'), 'no order was placed anywhere');
});

test('food picks light when recovery is low, and reads receipts the way the apps write them', () => {
  assert.deepEqual(parseReceipt('Order Confirmation for Sam from Example Greens', 'DoorDash <no-reply@doordash.com>', '1x Harvest Bowl $14.95 Total: $18.45', 1), { place: 'Example Greens', app: 'DoorDash', at: 1, item: 'Harvest Bowl', total: '$18.45' });
  const orders = [{ place: 'Example Burgers', app: 'Uber Eats', at: now - 72 * HOUR }, { place: 'Example Burgers', app: 'Uber Eats', at: now - 96 * HOUR }, { place: 'Example Poke Bowl', app: 'DoorDash', at: now - 120 * HOUR }];
  assert.equal(choose(orders, new Date(now))!.order.place, 'Example Burgers');
  const tired = choose(orders, new Date(now), { recovery: 25 })!;
  assert.equal(tired.order.place, 'Example Poke Bowl');
  assert.equal(tired.why, 'Your usual lunch, light because recovery is low.'.replace('lunch', new Date(now).getHours() < 11 ? 'breakfast' : new Date(now).getHours() < 16 ? 'lunch' : 'dinner'));
});

test('write scopes: only for action connectors, each its own sign-in, never through the sign-in service', () => {
  for (const def of grantDefs()) {
    assert.equal(def.write, true);
    if (!def.oauth) continue;
    for (const scope of def.oauth.scopes) assert.ok(writeScopes[def.oauth.app]!.includes(scope), `${def.id}: ${scope}`);
  }
  for (const scopes of Object.values(readScopes)) assert.ok(!scopes.some(s => /send|write/i.test(s)), 'the sign-in service still asks only to read');
  assert.ok(connectorDefs().every(d => !d.write), 'read connectors carry no write power');
  // Spotify playback joined on November 4, 2026 (owner: "hey taurus play juice wrld on spotify").
  assert.deepEqual(Object.keys(writeScopes).sort(), ['google', 'microsoft', 'spotify']);
});
