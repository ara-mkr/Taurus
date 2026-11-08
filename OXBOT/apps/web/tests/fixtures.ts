import type { BrowserContext, Page } from '@playwright/test';

// Fictional data shared by the smoke tests and the device screenshots. Every address is example.com.
export const shots = '../../qa-local/oxbot';
const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const section = (live: boolean, sources: string[] = []) => ({ live, sources, errors: [] as string[] });

export const dashboard = {
  generatedAt: iso(0), brief: 'Dana needs a call on the board seat before the investor call at 10:00. Recovery 64%.', briefBy: 'Claude',
  needs: [
    { id: 'n1', title: 'Term sheet redlines: board seat clause needs your call', who: 'Dana Whitfield', from: 'dana@example.com', detail: 'They accepted the valuation. Open item is the independent seat.', source: 'Gmail', at: iso(-38), vip: true, url: 'https://mail.example.com/1' },
    { id: 'n2', title: 'Can you approve the Q4 hiring plan before 3?', who: 'Priya Raman', detail: '#leadership', source: 'Slack', at: iso(-52) },
    { id: 'n3', title: 'A very long subject line that keeps going to make sure nothing overflows its column at narrow widths on a phone screen', who: 'Someone With A Long Name', source: 'Outlook', at: iso(-300) },
  ],
  schedule: [
    { id: 'e1', title: 'Leadership sync', start: iso(-90), end: iso(-60), source: 'Google Calendar' },
    { id: 'e2', title: 'Investor call: Northgate Capital', start: iso(-10), end: iso(35), joinUrl: 'https://meet.example.com/x', source: 'Google Calendar' },
    { id: 'e3', title: 'Board prep', start: iso(120), end: iso(180), location: 'Room 4', source: 'Outlook' },
  ],
  inbox: [{ source: 'Gmail', unread: 23, label: 'unread' }, { source: 'Slack', unread: 6, label: 'mentions today' }],
  body: { recovery: 64, hrv: 58, restingHr: 52, sleepMinutes: 412, sleepScore: 81, lastWorkout: { name: 'Run', km: 8.2, minutes: 41, at: iso(-600) }, weekKm: 31.4, sources: ['WHOOP', 'Strava'] },
  numbers: [{ label: 'Revenue, 30 days', value: '$1,284,300', change: '+6.2%', source: 'Stripe' }, { label: 'Runway', value: '21 months', source: 'Sheets' }],
  sections: { needs: section(true, ['Gmail', 'Slack', 'Outlook Mail']), schedule: section(true, ['Google Calendar', 'Outlook Calendar']), inbox: section(true, ['Gmail', 'Slack']), body: section(true, ['WHOOP', 'Strava']), numbers: section(false) },
};
const connectors = [
  { id: 'gmail', name: 'Gmail', group: 'Mail', reads: 'Unread primary inbox.', auth: 'oauth', connected: true, ready: true, missing: [], fields: [{ key: 'GOOGLE_CLIENT_ID', label: 'Google client ID', secret: false, set: true, value: 'abc.apps.googleusercontent.com' }], setup: 'Create an OAuth client.', setupUrl: 'https://console.cloud.google.com', redirectUri: 'http://localhost:8787/api/oauth/callback' },
  { id: 'whoop', name: 'WHOOP', group: 'Body', reads: 'Latest scored recovery, HRV, resting heart rate, sleep and day strain.', auth: 'oauth', connected: false, ready: true, oneClick: true, missing: [], fields: [{ key: 'WHOOP_CLIENT_ID', label: 'WHOOP client ID', secret: false, appKey: true, set: false }, { key: 'WHOOP_CLIENT_SECRET', label: 'WHOOP client secret', secret: true, appKey: true, set: false }], setup: 'Create an app.', setupUrl: 'https://developer-dashboard.whoop.com/', redirectUri: 'http://localhost:8787/api/oauth/callback' },
];
export const ring = { id: '6f1c1d2e-0000-4000-8000-000000000001', title: 'Investor call: Northgate Capital', detail: 'Starts in 10 minutes.', reason: 'meeting', at: iso(0), state: 'ringing', channels: ['2 open screens'], url: 'https://meet.example.com/x' };

const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };
const history = { sample: false, days: Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), recovery: 50 + ((i * 37) % 40), hrv: 50 + ((i * 13) % 20), sleepMinutes: 380 + ((i * 29) % 90) })) };
// Older specs test the board at '/', so these prefs open there; the Taurus specs ask for Taurus.
export const taurus = { panels: [
  { id: 't-needs', type: 'needs', size: 'medium', side: 'left', title: 'Priority' }, { id: 't-todo', type: 'todo', size: 'medium', side: 'left' },
  { id: 't-health', type: 'health', size: 'medium', side: 'right' }, { id: 't-schedule', type: 'schedule', size: 'medium', side: 'right', title: 'Up next' }, { id: 't-house', type: 'house', size: 'small', side: 'right' },
], clouds: 'calm', oxSize: 'medium', chips: true, facts: true, start: 'board' };
export const prefs = { taurus, tint: 'graphite', ambient: true, people: [{ id: 'p1', name: 'Sam Okafor', everyDays: 14 }], todos: [{ id: 't1', text: 'Send board deck', done: false, at: iso(-60) }], boards: [
  { id: 'home', name: 'Home', widgets: [
    { id: 'w1', type: 'brief', size: 'wide' }, { id: 'w2', type: 'focus', size: 'medium' }, { id: 'w3', type: 'needs', size: 'tall' }, { id: 'w4', type: 'schedule', size: 'tall' },
    { id: 'w5', type: 'health', size: 'tall' }, { id: 'w6', type: 'todo', size: 'medium' }, { id: 'w7', type: 'people', size: 'medium' }, { id: 'w8', type: 'trend', size: 'medium', config: { metric: 'recovery', days: 30 } },
    { id: 'w9', type: 'stocks', size: 'large', config: { symbols: ['EXA', 'EXB'] } }, { id: 'w10', type: 'news', size: 'large', config: { topics: ['Example Corp'] } },
  ] },
  { id: 'markets', name: 'Markets', widgets: [{ id: 'm1', type: 'chart', size: 'wide', config: { symbol: 'EXA', range: '1mo' } }] },
] };
const points = (base: number) => Array.from({ length: 22 }, (_, i) => ({ t: Date.now() - (21 - i) * 86_400_000, v: base + Math.sin(i / 3) * base * 0.04 }));
const quotes = [
  { symbol: 'EXA', name: 'Example A Inc.', currency: 'USD', price: 104.2, change: 1.3, changePct: 1.26, points: points(100) },
  { symbol: 'EXB', name: 'Example B Corp.', currency: 'USD', price: 51.1, change: -0.8, changePct: -1.54, points: points(52) },
];
const news = { topics: [{ topic: 'Example Corp', items: [{ title: 'Example Corp opens a second office', url: 'https://news.example.com/1', source: 'Example News', at: iso(-120) }, { title: 'Example Corp hires a new CFO', url: 'https://news.example.com/2', source: 'Example Daily', at: iso(-400) }] }] };

// Actions waiting for approval (November 1, 2026). Fictional people, example.com addresses, nothing real is sent.
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
export const reply = {
  id: '0b6f3c1e-1111-4000-8000-000000000001', kind: 'email.reply', app: 'Email', title: 'Reply to dana@example.com', to: 'dana@example.com',
  text: 'Thursday at 10 works. I’ll bring the revised board-seat language.', lines: [{ label: 'Subject', value: 'Re: Term sheet redlines' }, { label: 'From', value: 'Gmail, in the same thread' }],
  editable: true, from: 'ask', createdAt: iso(-1), expiresAt: later(14), state: 'pending', digest: 'digest-reply',
};
export const food = {
  id: '0b6f3c1e-2222-4000-8000-000000000002', kind: 'food.order', app: 'Food', title: 'Order from Example Greens', to: 'Example Greens',
  lines: [{ label: 'Why', value: 'Your usual lunch, light because recovery is low.' }, { label: 'App', value: 'DoorDash' }],
  purchase: { item: 'Harvest Bowl', place: 'Example Greens', total: 'About $18.45' },
  caution: 'No delivery app lets OXBOT place an order. Approving opens DoorDash at Example Greens, where you check the final total and tap Place order.',
  open: 'https://www.doordash.com/search/store/Example%20Greens/', editable: false, from: 'talk', createdAt: iso(-1), expiresAt: later(9), state: 'pending', digest: 'digest-food',
};
const grants = [
  { id: 'gmail-send', name: 'Gmail', app: 'Mail', does: 'Sends and replies to email you approve, from your Gmail.', auth: 'oauth', allowed: true, ready: true, missing: [], fields: [{ key: 'GOOGLE_CLIENT_ID', label: 'Google client ID', secret: false, appKey: true, set: true, value: 'abc.apps.googleusercontent.com' }], setup: 'Use your own Google OAuth client.', setupUrl: 'https://console.cloud.google.com/apis/credentials', redirectUri: 'http://localhost:8787/api/oauth/callback' },
  { id: 'slack-act', name: 'Slack', app: 'Chat', does: 'Posts, replies in threads and reacts, as you, when you approve.', auth: 'fields', allowed: false, ready: false, missing: ['User OAuth token'], fields: [{ key: 'SLACK_ACTION_TOKEN', label: 'User OAuth token with chat:write and reactions:write', secret: true, appKey: false, set: false }], setup: 'Add chat:write and reactions:write.', setupUrl: 'https://api.slack.com/apps' },
  { id: 'twilio-act', name: 'Calls and texts (Twilio)', app: 'Phone', does: 'Texts people, and calls them through your phone, from your Twilio number, when you approve.', auth: 'switch', allowed: false, ready: true, missing: [], fields: [{ key: 'TWILIO_ACTIONS_ON', label: 'On', secret: false, appKey: false, set: false }], setup: 'Uses the Twilio account on the Phone page.', setupUrl: 'https://console.twilio.com/' },
  { id: 'composio-act', name: 'Apps through Composio', app: 'Hub', does: 'Runs actions in the apps you connected in Composio (Canva, Notion, HubSpot and up to 1,694 more), when you approve each one.', auth: 'switch', allowed: true, ready: true, missing: [], fields: [{ key: 'COMPOSIO_ACTIONS_ON', label: 'On', secret: false, appKey: false, set: true, value: '1' }], setup: 'Uses the Composio key.', setupUrl: 'https://platform.composio.dev/' },
];
const log = [
  { ...reply, id: '0b6f3c1e-3333-4000-8000-000000000003', title: 'Text +15552220100', kind: 'text.send', app: 'Text message', text: 'Running ten minutes late.', state: 'done', via: 'voice', decidedAt: iso(-40), result: 'Texted +•••••••0100.' },
  { ...reply, id: '0b6f3c1e-4444-4000-8000-000000000004', title: 'Post in #leadership', kind: 'slack.post', app: 'Slack', state: 'failed', via: 'board', decidedAt: iso(-90), result: 'Slack said: not_in_channel' },
];

// A context routes requests the service worker makes too; tests that allow the worker pass the context.
export async function mock(page: Page | BrowserContext, ringing = false, waiting: unknown[] = []) {
  await page.route('**/api/approvals', r => r.fulfill({ json: { pending: waiting } }));
  await page.route('**/api/actions', r => r.fulfill({ json: { grants, log: [...waiting, ...log], vision: { name: 'Claude', sees: true } } }));
  await page.route('**/api/dashboard*', r => r.fulfill({ json: dashboard }));
  await page.route('**/api/prefs', r => r.fulfill({ json: r.request().method() === 'POST' ? r.request().postDataJSON() : prefs }));
  await page.route('**/api/history', r => r.fulfill({ json: history }));
  await page.route('**/api/markets*', r => r.fulfill({ json: { quotes: quotes.filter(q => new URL(r.request().url()).searchParams.get('symbols')!.split(',').includes(q.symbol)) } }));
  await page.route('**/api/news*', r => r.fulfill({ json: news }));
  await page.route('**/api/connectors', r => r.fulfill({ json: { connectors, redirectUri: 'http://localhost:8787/api/oauth/callback', home: '~/.oxbot' } }));
  await page.route('**/api/phone', r => r.fulfill({ json: { settings: { leadMinutes: 10, escalateAfterSeconds: 60, vipSenders: [], quietStart: '22:30', quietEnd: '06:30', ringMeetings: true, ringVip: true, aiProvider: 'claude' }, channels: { screens: 1, ntfy: false, call: false }, ai: 'Claude', bound: '127.0.0.1', pairing: [], lanReady: false } }));
  await page.route('**/api/ring/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: (ringing ? `event: ring\ndata: ${JSON.stringify(ring)}\n\n` : ': idle\n\n') + waiting.map(p => `event: approval\ndata: ${JSON.stringify(p)}\n\n`).join('') }));
  await page.route(`**/api/ring/${ring.id}/ack`, r => r.fulfill({ json: { ring: { ...ring, state: 'acknowledged' } } }));
  // Ox's activity and his browser stay quiet unless a test says otherwise, so nothing reads a real server.
  await page.route('**/api/activity/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'retry: 600000\nevent: hello\ndata: []\n\n' }));
  await page.route('**/api/browser/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'retry: 600000\n: idle\n\n' }));
}

