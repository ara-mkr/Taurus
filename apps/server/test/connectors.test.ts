// The connectors added October 31, 2026, against mocked provider responses only. No real account, no network:
// every outside request goes to a fake fetch, and an unexpected one fails the test.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-connectors-'));
process.env.TAURUS_BROKER_URL = '';
const { connectorDefs, connectorInfo } = await import('../src/connectors.ts');
const { readScopes } = await import('../src/providers.ts');
const { moreFixtures, morePosts } = await import('./more-fixtures.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake provider payloads */
const now = Date.now(), HOUR = 3_600_000;
const iso = (offset: number) => new Date(now + offset).toISOString();
const today = new Date().toLocaleDateString('en-CA');

interface Call { method: string; url: string; headers: Headers; body?: string }
type Route = [RegExp, unknown | ((call: Call) => unknown)];
interface Fixture { fields?: Record<string, string>; routes: Route[]; check: (pull: any) => void }

// Reads that providers only offer as POST. Anything else must be a GET.
const readPosts = [/\/jmap\/api\/?$/, /api\.monday\.com\/v2$/, /conversations\/search$/, /:runReport$/, /\/admin\/api\/[\d-]+\/graphql\.json$/, /\/2\/files\/list_folder$/, /backend\.composio\.dev\/api\/v3\.1\/tools\/execute\/proxy$/, ...morePosts];

const tmp = process.env.TAURUS_HOME!;
const healthFile = join(tmp, 'export.xml');
const day = (offset: number) => new Date(now + offset).toISOString().replace('T', ' ').slice(0, 19) + ' +0000';
writeFileSync(healthFile, `<?xml version="1.0"?>\n<HealthData>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" startDate="${day(-30 * HOUR)}" endDate="${day(-30 * HOUR)}" value="55"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" startDate="${day(-6 * HOUR)}" endDate="${day(-6 * HOUR)}" value="51"/>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" startDate="${day(-7 * HOUR)}" endDate="${day(-7 * HOUR)}" value="61.4"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" unit="lb" startDate="${day(-5 * HOUR)}" endDate="${day(-5 * HOUR)}" value="170"/>
 <Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="${day(-HOUR)}" endDate="${day(-HOUR)}" value="4000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="${day(-HOUR)}" endDate="${day(-HOUR)}" value="2500"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="${day(-12 * HOUR)}" endDate="${day(-8 * HOUR)}" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="${day(-8 * HOUR)}" endDate="${day(-5 * HOUR)}" value="HKCategoryValueSleepAnalysisAsleepREM"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="${day(-5 * HOUR)}" endDate="${day(-4.5 * HOUR)}" value="HKCategoryValueSleepAnalysisAwake"/>
</HealthData>\n`);
const vault = join(tmp, 'Example vault');
mkdirSync(join(vault, 'Projects'), { recursive: true });
mkdirSync(join(vault, '.obsidian'));
writeFileSync(join(vault, 'Projects/Board deck.md'), `# Board deck\n- [ ] Send deck to the board 📅 ${today}\n- [ ] Book venue 📅 2099-01-01\n- [x] Draft outline 📅 2020-01-01\n`);
writeFileSync(join(vault, 'Inbox.md'), '- [ ] Call Dana 📅 2020-02-02 ⏫\n');
writeFileSync(join(vault, '.obsidian/workspace.md'), '- [ ] hidden 📅 2020-01-01\n');

// What each app would answer through Composio's proxy, keyed by Composio's toolkit slug, from each app's API docs.
type Mock = [RegExp, unknown | ((query: Record<string, string>) => unknown)];
const s = (offset: number) => Math.floor((now + offset) / 1000);
const composioMocks: Record<string, Mock[]> = {
  clickup: [[/\/v2\/user$/, { user: { id: 7 } }], [/\/v2\/team$/, { teams: [{ id: 'T1' }] }], [/\/team\/T1\/task$/, (q: any) => { assert.equal(q['assignees[]'], '7'); return { tasks: [{ id: 'k1', name: 'Sign the lease', due_date: String(now - HOUR), url: 'https://app.clickup.com/t/k1', list: { name: 'Office' } }, { id: 'k2', name: 'No date' }] }; }]],
  shortcut: [[/\/member$/, { mention_name: 'akhil' }], [/\/search\/stories$/, { data: [{ id: 1, name: 'Fix login', deadline: iso(-HOUR), updated_at: iso(-HOUR), app_url: 'https://app.shortcut.com/s/1' }, { id: 2, name: 'Later', deadline: iso(9 * 24 * HOUR) }] }]],
  wrike: [[/\/contacts$/, { data: [{ id: 'ME' }] }], [/\/tasks$/, { data: [{ id: 'w1', title: 'Approve budget', dates: { due: iso(-HOUR) }, importance: 'High', permalink: 'https://www.wrike.com/open.htm?id=1' }] }]],
  toggl: [[/time_entries$/, [{ duration: 7200 }, { duration: 3600 }, { duration: -(s(0) - 1800) }]]],
  coda: [[/\/docs$/, { items: [{ id: 'd1', name: 'Q4 plan', updatedAt: iso(-HOUR), browserLink: 'https://coda.io/d/1' }] }]],
  miro: [[/\/boards$/, { data: [{ id: 'b1', name: 'Roadmap', modifiedAt: iso(-HOUR), modifiedBy: { name: 'Priya' }, viewLink: 'https://miro.com/app/board/b1' }] }]],
  canva: [[/\/designs$/, { items: [{ id: 'c1', title: 'Deck cover', updated_at: s(-HOUR), urls: { view_url: 'https://www.canva.com/d/c1' } }] }]],
  webflow: [[/\/sites$/, { sites: [{ id: 's1', displayName: 'Marketing site', lastPublished: iso(-HOUR) }, { id: 's2', displayName: 'Draft' }] }]],
  pipedrive: [[/^\/v1\/deals$/, { data: [{ value: 100000, currency: 'USD', expected_close_date: today }, { value: 50000, currency: 'USD', expected_close_date: '2099-01-01' }] }]],
  salesforce: [[/^\/services\/data\/v62\.0\/query$/, (q: any) => { assert.match(q.q, /^SELECT Amount, CloseDate FROM Opportunity/); return { records: [{ Amount: 80000, CloseDate: today }] }; }]],
  close: [[/\/opportunity\/$/, { data: [{ value: 1200000, value_currency: 'USD', expected_date: today }] }]],
  zendesk: [[/^\/api\/v2\/search\.json$/, { results: [{ id: 88, subject: 'Refund request', priority: 'high', updated_at: iso(-HOUR) }] }]],
  freshdesk: [[/^\/api\/v2\/tickets$/, [{ id: 5, subject: 'Login broken', priority: 4, updated_at: iso(-HOUR) }]]],
  help_scout: [[/\/users\/me$/, { id: 3 }], [/\/conversations$/, { _embedded: { conversations: [{ id: 9, subject: 'Invoice question', preview: 'Hi…', userUpdatedAt: iso(-HOUR), primaryCustomer: { first: 'Sam', email: 'Sam@example.com' } }] } }]],
  vercel: [[/\/v6\/deployments$/, (q: any) => { assert.equal(q.state, 'ERROR'); return { deployments: [{ uid: 'dpl1', name: 'web', url: 'web-abc.vercel.app', created: now - HOUR, state: 'ERROR' }] }; }]],
  datadog: [[/^\/api\/v1\/monitor$/, [{ id: 1, name: 'API p99 latency', overall_state: 'Alert', modified: iso(-HOUR) }, { id: 2, name: 'Disk', overall_state: 'OK' }]]],
  cal: [[/\/v2\/bookings$/, { data: [{ uid: 'u1', title: 'Intro call', start: iso(HOUR), end: iso(1.5 * HOUR), meetingUrl: 'https://cal.com/video/u1' }, { uid: 'u2', title: 'Next month', start: iso(30 * 24 * HOUR), end: iso(30 * 24 * HOUR) }] }]],
  typeform: [[/\/forms$/, { items: [{ id: 'f1', title: 'Waitlist', _links: { display: 'https://example.typeform.com/to/f1' } }, { id: 'f2', title: 'Quiet form' }] }], [/\/forms\/f1\/responses$/, { total_items: 3 }], [/\/forms\/f2\/responses$/, { total_items: 0 }]],
  mailchimp: [[/^\/3\.0\/lists$/, { lists: [{ stats: { member_count: 1200 } }, { stats: { member_count: 300 } }] }]],
  youtube: [[/\/youtube\/v3\/channels$/, { items: [{ statistics: { subscriberCount: '15400', viewCount: '2000000' } }] }]],
  twitter: [[/\/2\/users\/me$/, { data: { id: '42', public_metrics: { followers_count: 9876 } } }], [/\/2\/users\/42\/mentions$/, { data: [{ id: 't1', text: '@akhil this is great', created_at: iso(-HOUR) }] }]],
  instagram: [[/graph\.instagram\.com\/v21\.0\/me$/, { followers_count: 4200, media_count: 81 }]],
  reddit: [[/\/message\/unread$/, { data: { children: [{ data: { name: 't1_a', subject: 'comment reply', author: 'founder22', body: 'Agreed.', created_utc: s(-HOUR), context: '/r/startups/comments/x/y/z' } }] } }]],
  brex: [[/\/v2\/accounts\/cash$/, { items: [{ current_balance: { amount: 25000000, currency: 'USD' } }] }]],
  ramp: [[/\/transactions$/, { data: [{ amount: 120.5, currency_code: 'USD' }, { amount: 79.5, currency_code: 'USD' }] }]],
  paypal: [[/\/reporting\/balances$/, { balances: [{ currency: 'USD', primary: true, total_balance: { value: '1530.00' } }] }]],
  square: [[/\/v2\/payments$/, { payments: [{ status: 'COMPLETED', amount_money: { amount: 4000, currency: 'USD' } }, { status: 'FAILED', amount_money: { amount: 999, currency: 'USD' } }] }]],
  gumroad: [[/\/v2\/sales$/, { success: true, sales: [{ price: 1500 }, { price: 1500 }] }]],
  lemon_squeezy: [[/\/v1\/orders$/, { data: [{ attributes: { status: 'paid', total: 2900, currency: 'USD', created_at: iso(-HOUR) } }, { attributes: { status: 'refunded', total: 2900, currency: 'USD', created_at: iso(-HOUR) } }] }]],
};

const fixtures: Record<string, Fixture> = {
  fastmail: {
    fields: { FASTMAIL_TOKEN: 'fm-test' },
    routes: [
      [/api\.fastmail\.com\/jmap\/session$/, { apiUrl: 'https://api.fastmail.com/jmap/api/', primaryAccounts: { 'urn:ietf:params:jmap:mail': 'u1' } }],
      [/api\.fastmail\.com\/jmap\/api\/$/, (c: Call) => JSON.parse(c.body!).methodCalls[0][0] === 'Mailbox/query'
        ? { methodResponses: [['Mailbox/query', { ids: ['inbox1'] }, 'q'], ['Mailbox/get', { list: [{ id: 'inbox1', unreadEmails: 9 }] }, 'g']] }
        : { methodResponses: [['Email/query', { ids: ['m1', 'm2'] }, 'q'], ['Email/get', { list: [
          { id: 'm1', threadId: 't1', subject: 'Board seat terms', from: [{ name: 'Dana Whitfield', email: 'Dana@example.com' }], preview: 'They accepted.', receivedAt: iso(-HOUR) },
          { id: 'm2', threadId: 't2', subject: 'Weekly digest', from: [{ name: 'News', email: 'newsletter@example.com' }], preview: '…', receivedAt: iso(-2 * HOUR) },
        ] }, 'g']] }],
    ],
    check: p => { assert.equal(p.inbox[0].unread, 9); assert.equal(p.needs.length, 1); assert.equal(p.needs[0].from, 'dana@example.com'); },
  },
  calendly: {
    fields: { CALENDLY_TOKEN: 'cal-test' },
    routes: [
      [/api\.calendly\.com\/users\/me$/, { resource: { uri: 'https://api.calendly.com/users/U1' } }],
      [/api\.calendly\.com\/scheduled_events\?/, { collection: [{ uri: 'https://api.calendly.com/scheduled_events/E1', name: 'Intro: Northgate', start_time: iso(2 * HOUR), end_time: iso(2.5 * HOUR), location: { type: 'zoom', join_url: 'https://zoom.example.com/j/1' } }] }],
    ],
    check: p => { assert.equal(p.schedule[0].title, 'Intro: Northgate'); assert.equal(p.schedule[0].joinUrl, 'https://zoom.example.com/j/1'); },
  },
  zoom: {
    routes: [
      [/api\.zoom\.us\/v2\/users\/me\/meetings\?/, { meetings: [{ id: 1, topic: 'Investor update', start_time: iso(HOUR), duration: 45, join_url: 'https://zoom.example.com/j/2' }, { id: 2, topic: 'Next week', start_time: iso(7 * 24 * HOUR) }] }],
      [/api\.zoom\.us\/v2\/users\/me\/recordings\?/, { meetings: [{ uuid: 'r1', topic: 'All hands', start_time: iso(-20 * HOUR), share_url: 'https://zoom.example.com/rec/1' }] }],
    ],
    check: p => { assert.equal(p.schedule.length, 1); assert.equal(p.schedule[0].end, iso(HOUR + 45 * 60_000)); assert.match(p.updates[0].title, /All hands/); },
  },
  discord: {
    fields: { DISCORD_BOT_TOKEN: 'bot-test', DISCORD_CHANNEL_IDS: '111, 222', DISCORD_USER_ID: '42' },
    routes: [
      [/discord\.com\/api\/v10\/channels\/111$/, { id: '111', name: 'founders', guild_id: '9' }],
      [/discord\.com\/api\/v10\/channels\/222$/, { id: '222', name: 'random', guild_id: '9' }],
      [/channels\/111\/messages\?/, [{ id: 'a', content: '<@42> can you look at the deck?', timestamp: iso(-HOUR), mentions: [{ id: '42' }], author: { global_name: 'Priya' } }, { id: 'b', content: 'lunch?', timestamp: iso(-HOUR), mentions: [] }]],
      [/channels\/222\/messages\?/, [{ id: 'c', content: 'old <@42>', timestamp: iso(-9 * 24 * HOUR), mentions: [{ id: '42' }] }]],
    ],
    check: p => { assert.equal(p.needs.length, 1); assert.equal(p.needs[0].title, '@you can you look at the deck?'); assert.equal(p.needs[0].url, 'https://discord.com/channels/9/111/a'); },
  },
  telegram: {
    fields: { TELEGRAM_BOT_TOKEN: '123:test' },
    routes: [[/api\.telegram\.org\/bot123:test\/getUpdates\?/, { ok: true, result: [
      { update_id: 1, message: { message_id: 5, date: Math.floor((now - HOUR) / 1000), text: 'Are we still on for 3?', chat: { id: 7, type: 'private' }, from: { first_name: 'Sam', last_name: 'Okafor' } } },
      { update_id: 2, message: { message_id: 6, date: Math.floor((now - 3 * 24 * HOUR) / 1000), text: 'old', chat: { id: 7, type: 'private' } } },
    ] }]],
    check: p => { assert.equal(p.needs.length, 1); assert.equal(p.needs[0].who, 'Sam Okafor'); assert.equal(p.inbox[0].unread, 1); },
  },
  teams: {
    routes: [
      [/graph\.microsoft\.com\/v1\.0\/me\?\$select=id$/, { id: 'me' }],
      [/graph\.microsoft\.com\/v1\.0\/me\/chats\?/, { value: [
        { id: 'c1', chatType: 'oneOnOne', webUrl: 'https://teams.example.com/c1', lastMessagePreview: { createdDateTime: iso(-HOUR), from: { user: { id: 'u2', displayName: 'Dana' } }, body: { content: '<p>Quick call?</p>' } }, viewpoint: { lastMessageReadDateTime: iso(-2 * HOUR) } },
        { id: 'c2', chatType: 'group', lastMessagePreview: { createdDateTime: iso(-HOUR), from: { user: { id: 'me' } }, body: { content: 'mine' } } },
        { id: 'c3', chatType: 'group', topic: 'Board', lastMessagePreview: { createdDateTime: iso(-HOUR), from: { user: { id: 'u3' } }, body: { content: 'read' } }, viewpoint: { lastMessageReadDateTime: iso(0) } },
      ] }],
    ],
    check: p => { assert.equal(p.needs.length, 1); assert.equal(p.needs[0].title, 'Quick call?'); assert.equal(p.inbox[0].unread, 1); },
  },
  todoist: {
    routes: [[/api\.todoist\.com\/api\/v1\/tasks\/filter\?/, { results: [{ id: 't1', content: 'Low thing', priority: 1, due: { date: today } }, { id: 't2', content: 'Sign offer letter', priority: 4, due: { date: '2020-01-01' } }] }]],
    check: p => { assert.equal(p.needs[0].title, 'Sign offer letter'); assert.equal(p.needs[0].detail, 'Priority 1 · Overdue'); },
  },
  asana: {
    routes: [
      [/app\.asana\.com\/api\/1\.0\/users\/me\?/, { data: { workspaces: [{ gid: 'w1' }] } }],
      [/app\.asana\.com\/api\/1\.0\/tasks\?/, { data: [{ gid: 'a1', name: 'Approve budget', due_on: today, permalink_url: 'https://app.asana.com/0/1/a1', modified_at: iso(-HOUR) }, { gid: 'a2', name: 'Later', due_on: '2099-01-01' }] }],
    ],
    check: p => { assert.equal(p.needs.length, 1); assert.equal(p.needs[0].detail, 'Due today'); },
  },
  trello: {
    fields: { TRELLO_KEY: 'k', TRELLO_TOKEN: 'read-token' },
    routes: [[/api\.trello\.com\/1\/members\/me\/cards\?/, (c: Call) => {
      assert.match(c.headers.get('authorization')!, /oauth_token="read-token"/, 'token goes in a header, not the URL');
      return [{ id: 'c1', name: 'Ship pricing page', due: iso(-HOUR), dueComplete: false, url: 'https://trello.example.com/c1', dateLastActivity: iso(-HOUR) }, { id: 'c2', name: 'Done', due: iso(-HOUR), dueComplete: true }];
    }]],
    check: p => { assert.equal(p.needs.length, 1); assert.equal(p.needs[0].detail, 'Overdue'); },
  },
  jira: {
    routes: [
      [/api\.atlassian\.com\/oauth\/token\/accessible-resources$/, [{ id: 'cloud1', url: 'https://example.atlassian.net' }]],
      [/api\.atlassian\.com\/ex\/jira\/cloud1\/rest\/api\/3\/search\/jql\?/, { issues: [{ id: '1', key: 'TAURUS-7', fields: { summary: 'Checkout outage', priority: { name: 'Highest' }, status: { name: 'In Progress' }, updated: iso(-HOUR) } }] }],
    ],
    check: p => { assert.equal(p.needs[0].title, 'TAURUS-7 Checkout outage'); assert.equal(p.needs[0].url, 'https://example.atlassian.net/browse/TAURUS-7'); },
  },
  monday: {
    routes: [[/api\.monday\.com\/v2$/, (c: Call) => {
      assert.doesNotMatch(JSON.parse(c.body!).query, /mutation/, 'queries only');
      return { data: { me: { id: 1, name: 'Akhil Example' }, boards: [{ name: 'Launch', items_page: { items: [
        { id: 'i1', name: 'Press list', updated_at: iso(-HOUR), url: 'https://monday.example.com/i1', column_values: [{ type: 'people', text: 'Akhil Example' }, { type: 'status', text: 'Working on it' }] },
        { id: 'i2', name: 'Done item', column_values: [{ type: 'people', text: 'Akhil Example' }, { type: 'status', text: 'Done' }] },
        { id: 'i3', name: 'Someone else', column_values: [{ type: 'people', text: 'Dana' }] },
      ] } }] } };
    }]],
    check: p => { assert.equal(p.needs.length, 1); assert.equal(p.needs[0].detail, 'Launch · Working on it'); },
  },
  'google-tasks': {
    routes: [
      [/tasks\.googleapis\.com\/tasks\/v1\/users\/@me\/lists\?/, { items: [{ id: 'L1', title: 'Personal' }] }],
      [/tasks\.googleapis\.com\/tasks\/v1\/lists\/L1\/tasks\?/, { items: [{ id: 'g1', title: 'Renew passport', due: '2020-01-01T00:00:00.000Z', updated: iso(-HOUR), webViewLink: 'https://tasks.example.com/g1' }] }],
    ],
    check: p => { assert.equal(p.needs[0].detail, 'Personal · Overdue'); },
  },
  'microsoft-todo': {
    routes: [
      [/graph\.microsoft\.com\/v1\.0\/me\/todo\/lists$/, { value: [{ id: 'T1', displayName: 'Tasks' }] }],
      [/graph\.microsoft\.com\/v1\.0\/me\/todo\/lists\/T1\/tasks\?/, { value: [{ id: 'x1', title: 'Call lawyer', importance: 'high' }, { id: 'x2', title: 'Due later', importance: 'normal', dueDateTime: { dateTime: '2099-01-01T00:00:00.0000000' } }, { id: 'x3', title: 'Due before', importance: 'normal', dueDateTime: { dateTime: '2020-01-01T00:00:00.0000000' } }] }],
    ],
    check: p => { assert.deepEqual(p.needs.map((n: any) => n.title), ['Call lawyer', 'Due before']); },
  },
  gitlab: {
    fields: { GITLAB_TOKEN: 'glpat-test' },
    routes: [
      [/gitlab\.com\/api\/v4\/user$/, (c: Call) => { assert.equal(c.headers.get('private-token'), 'glpat-test'); return { username: 'akhil' }; }],
      [/gitlab\.com\/api\/v4\/merge_requests\?.*reviewer_username=akhil/, [{ id: 9, title: 'Add pricing page', author: { username: 'mk' }, references: { full: 'acme/web!12' }, updated_at: iso(-HOUR), web_url: 'https://gitlab.example.com/mr/12' }]],
    ],
    check: p => { assert.equal(p.needs[0].detail, 'Review requested · acme/web!12'); },
  },
  // Canvas LMS: token + school address, GET only. Synthetic school and course data (test/canvas.test.ts covers the edge cases).
  canvas: {
    fields: { CANVAS_URL: 'https://school.instructure.com', CANVAS_TOKEN: 'canvas-test-token' },
    routes: [
      [/school\.instructure\.com\/api\/v1\/courses\?enrollment_state=active/, (c: Call) => { assert.equal(c.headers.get('authorization'), 'Bearer canvas-test-token'); return [{ id: 11, name: 'Biology 101' }, { id: 12, name: 'Calculus II' }]; }],
      [/school\.instructure\.com\/api\/v1\/planner\/items\?.*filter=incomplete_items/, [
        { plannable_type: 'assignment', plannable_id: '6', course_id: 12, html_url: '/courses/12/assignments/6#submit', submissions: { submitted: false, missing: false }, plannable: { id: 6, title: 'Problem set 7', due_at: iso(6 * HOUR) } },
        { plannable_type: 'assignment', plannable_id: '8', course_id: 12, submissions: { submitted: true }, plannable: { id: 8, title: 'Already handed in', due_at: iso(5 * HOUR) } },
        { plannable_type: 'assignment', plannable_id: '9', course_id: 12, planner_override: { marked_complete: true }, submissions: false, plannable: { id: 9, title: 'Marked done', due_at: iso(5 * HOUR) } },
        { plannable_type: 'planner_note', plannable_id: '3', plannable: { title: 'Buy a lab coat', todo_date: iso(HOUR) } },
        { plannable_type: 'calendar_event', plannable_id: '4', plannable: { title: 'Office hours', start_at: iso(HOUR) } },
      ]],
      [/school\.instructure\.com\/api\/v1\/users\/self\/todo/, [{ type: 'submitting', context_name: 'Biology 101', html_url: 'https://school.instructure.com/courses/11/assignments/5#submit', assignment: { id: 5, name: 'Lab report 3', due_at: iso(30 * HOUR), course_id: 11 } }]],
      [/school\.instructure\.com\/api\/v1\/users\/self\/missing_submissions\?filter\[\]=submittable/, [{ id: 4, name: 'Reading quiz', due_at: iso(-20 * HOUR), course_id: 11, html_url: 'https://school.instructure.com/courses/11/assignments/4' }]],
      [/school\.instructure\.com\/api\/v1\/announcements\?context_codes\[\]=course_11&context_codes\[\]=course_12/, [{ id: 90, title: 'Exam moved', message: '<p>The midterm is now <b>Friday</b>.</p>', posted_at: iso(-2 * HOUR), context_code: 'course_12', html_url: 'https://school.instructure.com/courses/12/discussion_topics/90' }]],
    ],
    check: p => {
      assert.deepEqual(p.needs.map((n: any) => n.title), ['Reading quiz', 'Problem set 7', 'Lab report 3']);
      assert.match(p.needs[0].detail, /^Overdue, was due .* · Biology 101$/);
      assert.equal(p.needs[1].who, 'Calculus II');
      assert.equal(p.needs[1].url, 'https://school.instructure.com/courses/12/assignments/6#submit');
      assert.match(p.updates[0].detail, /^Calculus II · The midterm is now\s+Friday\s*\.$/);
    },
  },
  sentry: {
    fields: { SENTRY_TOKEN: 's-test', SENTRY_ORG: 'acme' },
    routes: [[/sentry\.io\/api\/0\/organizations\/acme\/issues\/\?/, [{ id: '5', title: 'TypeError: cart is undefined', count: '412', project: { slug: 'web' }, lastSeen: iso(-HOUR), permalink: 'https://sentry.example.com/5' }]]],
    check: p => { assert.equal(p.needs[0].detail, '412 events today · web'); },
  },
  pagerduty: {
    fields: { PAGERDUTY_TOKEN: 'pd-test' },
    routes: [[/api\.pagerduty\.com\/incidents\?/, (c: Call) => { assert.equal(c.headers.get('authorization'), 'Token token=pd-test'); return { incidents: [
      { id: 'P1', title: 'Disk 90%', urgency: 'low', status: 'acknowledged', created_at: iso(-HOUR) },
      { id: 'P2', title: 'Checkout down', urgency: 'high', status: 'triggered', service: { summary: 'Checkout' }, created_at: iso(-HOUR), html_url: 'https://pd.example.com/P2' },
    ] }; }]],
    check: p => { assert.equal(p.needs[0].title, 'Checkout down'); assert.equal(p.needs[0].detail, 'High urgency · triggered · Checkout'); },
  },
  intercom: {
    fields: { INTERCOM_TOKEN: 'ic-test' },
    routes: [
      [/api\.intercom\.io\/me$/, { id: '77' }],
      [/api\.intercom\.io\/conversations\/search$/, (c: Call) => { assert.equal(JSON.parse(c.body!).query.value[1].value, '77'); return { conversations: [{ id: 'cv1', title: null, source: { subject: '', body: '<p>Refund for order 1042?</p>', author: { name: 'Lee Example' } }, updated_at: Math.floor(now / 1000) }] }; }],
    ],
    check: p => { assert.equal(p.needs[0].title, 'Refund for order 1042?'); assert.equal(p.needs[0].who, 'Lee Example'); },
  },
  airtable: {
    fields: { AIRTABLE_TOKEN: 'pat-test', AIRTABLE_BASE: 'appEX', AIRTABLE_TABLE: 'KPIs' },
    routes: [[/api\.airtable\.com\/v0\/appEX\/KPIs\?/, { records: [{ fields: { Metric: 'ARR', Value: '$4.1M', Change: '+3%' } }, { fields: { metric: 'NPS', value: 61 } }, { fields: { Notes: 'no metric' } }] }]],
    check: p => { assert.deepEqual(p.numbers.map((n: any) => [n.label, n.value, n.change]), [['ARR', '$4.1M', '+3%'], ['NPS', '61', undefined]]); },
  },
  'google-analytics': {
    fields: { GA4_PROPERTY_ID: '123456' },
    routes: [[/analyticsdata\.googleapis\.com\/v1beta\/properties\/123456:runReport$/, { rows: [{ dimensionValues: [{ value: 'now' }], metricValues: [{ value: '1200' }, { value: '3000' }] }, { dimensionValues: [{ value: 'before' }], metricValues: [{ value: '1000' }, { value: '3000' }] }] }]],
    check: p => { assert.deepEqual(p.numbers[0], { label: 'Active users, 7 days', value: '1,200', change: '+20.0%', source: 'Google Analytics' }); },
  },
  shopify: {
    fields: { SHOPIFY_STORE: 'https://example-store.myshopify.com/admin', SHOPIFY_TOKEN: 'shpat_test' },
    routes: [[/example-store\.myshopify\.com\/admin\/api\/2025-10\/graphql\.json$/, (c: Call) => {
      assert.doesNotMatch(JSON.parse(c.body!).query, /mutation/);
      return { data: { orders: { nodes: [{ createdAt: iso(-HOUR), totalPriceSet: { shopMoney: { amount: '120.00', currencyCode: 'USD' } } }, { createdAt: iso(-3 * 24 * HOUR), totalPriceSet: { shopMoney: { amount: '80.00', currencyCode: 'USD' } } }] } } };
    }]],
    check: p => { assert.equal(p.numbers[0].value, String(Date.parse(iso(-HOUR)) >= new Date().setHours(0, 0, 0, 0) ? 1 : 0)); assert.equal(p.numbers[1].value, '$200'); },
  },
  xero: {
    routes: [
      [/api\.xero\.com\/connections$/, [{ tenantId: 'tenant-1' }]],
      [/api\.xero\.com\/api\.xro\/2\.0\/Reports\/ProfitAndLoss\?/, (c: Call) => { assert.equal(c.headers.get('xero-tenant-id'), 'tenant-1'); return { Reports: [{ Rows: [{ Rows: [{ Cells: [{ Value: 'Total Income' }, { Value: '50000' }] }] }, { Rows: [{ Cells: [{ Value: 'Net Profit' }, { Value: '12000' }] }] }] }] }; }],
    ],
    check: p => { assert.deepEqual(p.numbers.map((n: any) => n.value), ['$50,000', '$12,000']); },
  },
  mercury: {
    fields: { MERCURY_TOKEN: 'mercury-read-test' },
    routes: [[/api\.mercury\.com\/api\/v1\/accounts$/, { accounts: [{ availableBalance: 1000000.5, status: 'active' }, { availableBalance: 250000, status: 'active' }, { availableBalance: 99, status: 'archived' }] }]],
    check: p => { assert.equal(p.numbers[0].value, '$1,250,001'); },
  },
  'apple-health': {
    fields: { APPLE_HEALTH_EXPORT: tmp },
    routes: [],
    check: p => { assert.deepEqual(p.body, { restingHr: 51, hrv: 61, sleepMinutes: 420, steps: 6500, weightKg: 77.1 }); },
  },
  withings: {
    routes: [
      [/wbsapi\.withings\.net\/measure\?action=getmeas/, { status: 0, body: { measuregrps: [{ date: 1, measures: [{ type: 1, value: 80000, unit: -3 }] }, { date: 2, measures: [{ type: 1, value: 7905, unit: -2 }] }] } }],
      [/wbsapi\.withings\.net\/v2\/sleep\?action=getsummary/, { status: 0, body: { series: [{ enddate: 5, data: { total_sleep_time: 25200, hr_min: 49 } }] } }],
    ],
    check: p => { assert.deepEqual(p.body, { weightKg: 79.1, sleepMinutes: 420, restingHr: 49 }); },
  },
  'google-drive': {
    routes: [[/www\.googleapis\.com\/drive\/v3\/files\?/, { files: [{ id: 'd1', name: 'Board deck Q4', modifiedTime: iso(-HOUR), webViewLink: 'https://docs.example.com/d1', lastModifyingUser: { displayName: 'Dana', me: false } }] }]],
    check: p => { assert.equal(p.updates[0].detail, 'Edited by Dana'); },
  },
  dropbox: {
    fields: { DROPBOX_FOLDER: '/Work/' },
    routes: [[/api\.dropboxapi\.com\/2\/files\/list_folder$/, (c: Call) => { assert.equal(JSON.parse(c.body!).path, '/Work'); return { entries: [
      { '.tag': 'folder', name: 'Old' }, { '.tag': 'file', id: 'id:1', name: 'old.pdf', path_display: '/Work/old.pdf', server_modified: '2020-01-01T00:00:00Z' },
      { '.tag': 'file', id: 'id:2', name: 'term sheet.pdf', path_display: '/Work/term sheet.pdf', server_modified: iso(-HOUR) },
    ] }; }]],
    check: p => { assert.equal(p.updates[0].title, 'term sheet.pdf'); assert.equal(p.updates.length, 2); },
  },
  box: {
    routes: [[/api\.box\.com\/2\.0\/recent_items\?/, { entries: [{ item: { type: 'file', id: '9', name: 'Contract.docx', modified_at: iso(-HOUR), modified_by: { name: 'Lee' } } }, { item: { type: 'folder', id: '1', name: 'x' } }] }]],
    check: p => { assert.equal(p.updates.length, 1); assert.equal(p.updates[0].url, 'https://app.box.com/file/9'); },
  },
  onedrive: {
    routes: [[/graph\.microsoft\.com\/v1\.0\/me\/drive\/recent\?/, { value: [{ id: 'o1', name: 'Budget.xlsx', lastModifiedDateTime: iso(-HOUR), webUrl: 'https://onedrive.example.com/o1', lastModifiedBy: { user: { displayName: 'Priya' } } }] }]],
    check: p => { assert.equal(p.updates[0].detail, 'Changed by Priya'); },
  },
  obsidian: {
    fields: { OBSIDIAN_VAULT: vault },
    routes: [],
    check: p => {
      assert.deepEqual(p.needs.map((n: any) => n.title).sort(), ['Call Dana', 'Send deck to the board']);
      assert.ok(p.needs.every((n: any) => n.url.startsWith('obsidian://open?vault=Example%20vault')));
      assert.ok(!p.updates.some((u: any) => u.title === 'workspace'), 'skips the .obsidian folder');
    },
  },
  spotify: {
    routes: [
      [/api\.spotify\.com\/v1\/me\/player\/currently-playing$/, { is_playing: true, item: { id: 's1', name: 'Song A', artists: [{ name: 'Artist A' }], external_urls: { spotify: 'https://open.spotify.example.com/s1' } } }],
      [/api\.spotify\.com\/v1\/me\/player\/recently-played\?/, { items: [{ played_at: iso(-HOUR), track: { id: 's2', name: 'Song B', artists: [{ name: 'B' }, { name: 'C' }] } }] }],
    ],
    check: p => { assert.equal(p.updates[0].title, 'Playing: Song A · Artist A'); assert.equal(p.updates[1].title, 'Song B · B, C'); },
  },
  rss: {
    fields: { RSS_URLS: 'https://blog.example.com/feed.xml\nhttps://news.example.com/atom.xml' },
    routes: [
      [/blog\.example\.com\/feed\.xml$/, '<?xml version="1.0"?><rss><channel><title>Example Blog</title><item><title><![CDATA[Fundraising &amp; you]]></title><link>https://blog.example.com/1</link><pubDate>Fri, 30 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'],
      [/news\.example\.com\/atom\.xml$/, '<feed><title>Example News</title><entry><title>Newer post</title><link href="https://news.example.com/2"/><updated>2026-10-31T08:00:00Z</updated></entry></feed>'],
    ],
    check: p => { assert.deepEqual(p.updates.map((u: any) => [u.title, u.detail, u.url]), [['Newer post', 'Example News', 'https://news.example.com/2'], ['Fundraising & you', 'Example Blog', 'https://blog.example.com/1']]); },
  },
  weather: {
    fields: { WEATHER_PLACE: 'Oakland', WEATHER_UNITS: 'fahrenheit' },
    routes: [
      [/geocoding-api\.open-meteo\.com\/v1\/search\?name=Oakland/, { results: [{ name: 'Oakland', admin1: 'California', latitude: 37.8, longitude: -122.27 }] }],
      [/api\.open-meteo\.com\/v1\/forecast\?latitude=37\.8&longitude=-122\.27.*temperature_unit=fahrenheit/, { current: { time: '2026-11-02T15:30', temperature_2m: 64.2, apparent_temperature: 58.9, weather_code: 61 }, daily: { temperature_2m_max: [70.4], temperature_2m_min: [52.1], precipitation_probability_max: [40] } }],
    ],
    check: p => { assert.equal(p.updates[0].title, '64°F, rain, feels like 59°F'); assert.equal(p.updates[0].detail, 'High 70°F, low 52°F, rain 40% · Oakland, California · forecast model at 15:30'); },
  },
  'hacker-news': {
    fields: { HACKER_NEWS_ON: '1' },
    routes: [
      [/hacker-news\.firebaseio\.com\/v0\/topstories\.json$/, [1, 2, 3, 4, 5, 6]],
      [/hacker-news\.firebaseio\.com\/v0\/item\/(\d)\.json$/, (c: Call) => { const n = Number(c.url.match(/item\/(\d)/)![1]); return { id: n, title: `Story ${n}`, score: 100 + n, descendants: n, time: Math.floor(now / 1000) }; }],
    ],
    check: p => { assert.equal(p.updates.length, 5); assert.equal(p.updates[0].detail, '101 points · 1 comments'); },
  },
  composio: {
    fields: { COMPOSIO_API_KEY: 'cmp-test', COMPOSIO_USER_ID: 'akhil' },
    routes: [
      [/backend\.composio\.dev\/api\/v3\.1\/connected_accounts\?/, (c: Call) => {
        assert.equal(c.headers.get('x-api-key'), 'cmp-test');
        assert.match(c.url, /user_ids=akhil/);
        // Every app Taurus has a reader for, one that fails, and one it can't read yet.
        return { items: [...Object.keys(composioMocks).map(slug => ({ id: `ca_${slug}`, toolkit: { slug: slug.toUpperCase() }, state: { val: { subdomain: 'acme' } } })), { id: 'ca_attio', toolkit: { slug: 'attio' }, state: { val: {} } }] };
      }],
      [/backend\.composio\.dev\/api\/v3\.1\/tools\/execute\/proxy$/, (c: Call) => {
        const body = JSON.parse(c.body!);
        const slug = body.connected_account_id.slice(3);
        const query = Object.fromEntries(body.parameters.filter((x: any) => x.type === 'query').map((x: any) => [x.name, x.value]));
        const route = composioMocks[slug].find(([pattern]) => pattern.test(body.endpoint));
        if (!route) return { status: 404, data: { error: `no mock for ${slug} ${body.endpoint}` } };
        return { status: 200, data: typeof route[1] === 'function' ? (route[1] as (q: Record<string, string>) => unknown)(query) : route[1] };
      }],
    ],
    check: p => {
      const source = (name: string) => [...p.needs, ...p.schedule, ...p.numbers, ...p.updates].filter((x: any) => x.source === name);
      for (const name of ['ClickUp', 'Shortcut', 'Wrike', 'Toggl', 'Coda', 'Miro', 'Canva', 'Webflow', 'Pipedrive', 'Salesforce', 'Close', 'Zendesk', 'Freshdesk', 'Help Scout', 'Vercel', 'Datadog', 'Cal.com', 'Typeform', 'Mailchimp', 'YouTube', 'X', 'Instagram', 'Reddit', 'Brex', 'Ramp', 'PayPal', 'Square', 'Gumroad', 'Lemon Squeezy']) assert.ok(source(name).length > 0, `${name} returned nothing`);
      assert.equal(source('ClickUp')[0].title, 'Sign the lease');
      assert.equal(source('Shortcut').length, 1);
      assert.equal(source('Pipedrive')[0].value, '$150,000');
      assert.equal(source('Pipedrive')[1].value, '1');
      assert.equal(source('Close')[0].value, '$12,000');
      assert.equal(source('Zendesk')[0].url, 'https://acme.zendesk.com/agent/tickets/88');
      assert.equal(source('Cal.com').length, 1);
      assert.equal(source('Toggl')[0].value, '3.5');
      assert.equal(source('Brex')[0].value, '$250,000');
      assert.equal(source('Square')[0].value, '$40');
      assert.equal(source('Lemon Squeezy')[0].value, '$29');
      assert.equal(source('Typeform')[0].detail, '3 new responses today');
      assert.equal(source('Reddit')[0].url, 'https://www.reddit.com/r/startups/comments/x/y/z');
    },
  },
};

const realFetch = globalThis.fetch;
async function run(id: string, fixture: Fixture) {
  const def = connectorDefs().find(d => d.id === id)!;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = { method: (init?.method ?? 'GET').toUpperCase(), url: String(input instanceof Request ? input.url : input), headers: new Headers(init?.headers), body: init?.body ? String(init.body) : undefined };
    calls.push(call);
    const route = fixture.routes.find(([pattern]) => pattern.test(call.url));
    if (!route) throw new Error(`${id}: unexpected request ${call.method} ${call.url}`);
    const reply = typeof route[1] === 'function' ? (route[1] as (c: Call) => unknown)(call) : route[1];
    return typeof reply === 'string' ? new Response(reply, { headers: { 'Content-Type': 'application/xml' } }) : Response.json(reply);
  }) as typeof fetch;
  try {
    const pull = await def.pull!({ token: async () => `${id}-access-token`, field: key => fixture.fields?.[key] });
    fixture.check(pull);
  } finally { globalThis.fetch = realFetch; }
  for (const call of calls) {
    assert.ok(call.method === 'GET' || (call.method === 'POST' && readPosts.some(r => r.test(call.url))), `${id}: ${call.method} ${call.url} is not a read`);
    assert.equal(new URL(call.url).protocol, 'https:', `${id}: ${call.url} is not https`);
    if (call.body) assert.doesNotMatch(call.body, /\bmutation\b/, `${id}: sends a GraphQL mutation`);
    // Composio: reading the board only ever GETs through the proxy. Running a tool is an action, and actions run
    // only after the owner approves them (test/actions.test.ts fails any write made without an approval).
    if (call.url.includes('backend.composio.dev')) {
      assert.doesNotMatch(call.url, /\/tools\/execute\/(?!proxy$)/, `${id}: runs a Composio tool while reading the board`);
      if (call.method === 'POST') assert.equal(JSON.parse(call.body!).method, 'GET', `${id}: proxies a ${JSON.parse(call.body!).method}`);
    }
  }
}

// November 6, 2026: the hundred-odd more connectors' fixtures live in more-fixtures.ts.
Object.assign(fixtures, moreFixtures);
const added = connectorDefs().filter(d => d.mockOnly);

test('every connector added October 31 or later has a mocked test', () => {
  assert.ok(added.length >= 30, `only ${added.length} new connectors`);
  assert.deepEqual(added.map(d => d.id).filter(id => !fixtures[id]), []);
});

for (const def of added) {
  test(`${def.name} reads its documented response, with reads only`, () => run(def.id, fixtures[def.id]));
}

test('every OAuth connector asks only for scopes on the read-only list', () => {
  for (const def of connectorDefs()) {
    if (!def.oauth) continue;
    for (const scope of def.oauth.scopes) {
      assert.ok(readScopes[def.oauth.app].includes(scope), `${def.id}: ${scope} is not in readScopes.${def.oauth.app}`);
      assert.doesNotMatch(scope, /write|send|modify|manage|delete|admin|full|\.ReadWrite/i, `${def.id}: ${scope}`);
    }
  }
  for (const [app, scopes] of Object.entries(readScopes)) for (const scope of scopes) assert.doesNotMatch(scope, /write|send|modify|manage|delete|\.ReadWrite/i, `${app}: ${scope}`);
});

test('with nothing saved, every new connector shows as not connected, with setup steps', () => {
  const info = connectorInfo();
  for (const def of added) {
    const c = info.find(x => x.id === def.id)!;
    assert.equal(c.connected, false, `${def.id} should not be connected`);
    assert.equal(c.mockOnly, true);
    assert.ok(c.setup.length > 20 && c.setupUrl.startsWith('https://'), `${def.id} needs plain setup steps`);
  }
  assert.equal(info.find(x => x.id === 'hacker-news')!.auth, 'switch');
  assert.equal(new Set(info.map(c => c.id)).size, info.length, 'ids are unique');
});

test('every Composio reader has a mocked response', async () => {
  const { readers } = await import('../src/connectors/composio.ts');
  assert.deepEqual(Object.keys(readers).filter(slug => !composioMocks[slug]), []);
  assert.ok(Object.keys(readers).length >= 25);
});

test('the Connections page lists Composio apps Taurus cannot read yet, and errors per app', async () => {
  const { composioApps } = await import('../src/connectors/composio.ts');
  const apps = composioApps();
  assert.equal(apps.find(a => a.slug === 'attio')?.reads, undefined);
  assert.ok(apps.filter(a => a.reads).every(a => !a.error), apps.filter(a => a.error).map(a => `${a.name}: ${a.error}`).join('; '));
});
