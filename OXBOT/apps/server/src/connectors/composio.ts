import { readFileSync } from 'node:fs';
import { api } from '../store.ts';
import type { CalendarEvent, Metric, Need, Update } from '../types.ts';
import { DAY, endOfToday, iso, money, startOfToday, type Def, type Pull } from './kit.ts';

// Composio (added November 1, 2026 at the owner's request, docs/decision-log.md): one key reaches the apps you
// connect in your own Composio project, about 1,700 of them. Composio keeps those sign-ins in its cloud; OXBOT keeps
// only your Composio API key. Reading the board never runs a Composio tool: it lists your connected accounts and sends
// each app one documented read through Composio's proxy, always GET (the test fails otherwise). Since November 1,
// 2026, Composio tools run as actions (src/actions/composio.ts), and only after the owner approves each one.
// Built from Composio's and each app's published API documentation, tested only against mocked responses.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const BASE = 'https://backend.composio.dev/api/v3.1';

// Every app Composio lists (name, slug), from docs.composio.dev/toolkits on November 1, 2026.
export const composioCatalog: [name: string, slug: string][] = JSON.parse(readFileSync(new URL('./composio-catalog.json', import.meta.url), 'utf8'));

interface Account { id: string; slug: string; val: Record<string, any> }
type Get = (endpoint: string, query?: Record<string, string>, headers?: Record<string, string>) => Promise<any>;
interface Reader { name: string; reads: string; read: (get: Get, account: Account) => Promise<Pull> }

const day = (ms: number) => new Date(ms).toLocaleDateString('en-CA');
const ago = (days: number) => Date.now() - days * DAY;
const due = (ms: number) => ms < startOfToday() ? 'Overdue' : 'Due today';
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
const count = (n: number) => new Intl.NumberFormat('en-US').format(n);
const host = (val: Record<string, any>) => String(val.subdomain ?? val.domain ?? val['your-domain'] ?? '').replace(/^https?:\/\//, '').split('.')[0] || undefined;
const pipeline = (source: string, deals: { value: number; close?: string }[], currency = 'USD'): Metric[] => {
  const weekEnd = day(startOfToday() + 7 * DAY);
  return [
    { label: 'Open pipeline', value: money(sum(deals.map(d => d.value)), currency), source },
    { label: 'Closing this week', value: String(deals.filter(d => d.close && d.close <= weekEnd).length), source },
  ];
};
const sevenDays = (source: string, label: string, amounts: number[], currency = 'USD'): Metric => ({ label, value: money(sum(amounts), currency), change: `${amounts.length} in 7 days`, source });

// One reader per app OXBOT understands, keyed by Composio's toolkit slug. Each one only reads.
export const readers: Record<string, Reader> = {
  clickup: {
    name: 'ClickUp', reads: 'Your open tasks due today or overdue',
    async read(get) {
      const [{ user }, { teams }] = await Promise.all([get('https://api.clickup.com/api/v2/user'), get('https://api.clickup.com/api/v2/team')]);
      const lists = await Promise.all((teams ?? []).slice(0, 3).map((t: any) => get(`https://api.clickup.com/api/v2/team/${t.id}/task`, { 'assignees[]': String(user.id), due_date_lt: String(endOfToday()), order_by: 'due_date', subtasks: 'true' })));
      return { needs: lists.flatMap(l => l.tasks ?? []).filter((t: any) => t.due_date).slice(0, 8).map((t: any): Need => ({ id: `clickup:${t.id}`, title: t.name, detail: `${due(Number(t.due_date))} · ${t.list?.name ?? 'ClickUp'}`, source: 'ClickUp', at: iso(Number(t.due_date)), url: t.url })) };
    },
  },
  shortcut: {
    name: 'Shortcut', reads: 'Stories you own that are due today or overdue',
    async read(get) {
      const me = await get('https://api.app.shortcut.com/api/v3/member');
      const found = await get('https://api.app.shortcut.com/api/v3/search/stories', { query: `owner:${me.mention_name} !is:done !is:archived`, page_size: '25' });
      return { needs: (found.data ?? []).filter((s: any) => s.deadline && Date.parse(s.deadline) < endOfToday()).slice(0, 8).map((s: any): Need => ({ id: `shortcut:${s.id}`, title: s.name, detail: due(Date.parse(s.deadline)), source: 'Shortcut', at: s.updated_at, url: s.app_url })) };
    },
  },
  wrike: {
    name: 'Wrike', reads: 'Active tasks assigned to you, due today or earlier',
    async read(get) {
      const me = (await get('https://www.wrike.com/api/v4/contacts', { me: 'true' })).data?.[0];
      const data = await get('https://www.wrike.com/api/v4/tasks', { responsibles: JSON.stringify([me.id]), status: 'Active', dueDate: JSON.stringify({ end: day(startOfToday()) }) });
      return { needs: (data.data ?? []).slice(0, 8).map((t: any): Need => ({ id: `wrike:${t.id}`, title: t.title, detail: `${due(Date.parse(t.dates?.due))}${t.importance === 'High' ? ' · High' : ''}`, source: 'Wrike', at: t.updatedDate ?? iso(Date.now()), url: t.permalink })) };
    },
  },
  toggl: {
    name: 'Toggl Track', reads: 'Hours you tracked in the last seven days',
    async read(get) {
      const entries = await get('https://api.track.toggl.com/api/v9/me/time_entries', { start_date: iso(ago(7)), end_date: iso(Date.now()) });
      // A running entry has a negative duration: minus its start time in seconds.
      const seconds = sum((entries ?? []).map((e: any) => e.duration < 0 ? Date.now() / 1000 + e.duration : e.duration));
      return { numbers: [{ label: 'Hours tracked, 7 days', value: (seconds / 3600).toFixed(1), source: 'Toggl' }] };
    },
  },
  coda: {
    name: 'Coda', reads: 'Names of the docs changed most recently, never their contents',
    async read(get) {
      const data = await get('https://coda.io/apis/v1/docs', { limit: '25' });
      return { updates: (data.items ?? []).sort((a: any, b: any) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 6).map((d: any): Update => ({ id: `coda:${d.id}`, title: d.name, detail: 'Doc changed', source: 'Coda', at: d.updatedAt, url: d.browserLink })) };
    },
  },
  miro: {
    name: 'Miro', reads: 'Boards changed most recently and who changed them',
    async read(get) {
      const data = await get('https://api.miro.com/v2/boards', { sort: 'last_modified', limit: '6' });
      return { updates: (data.data ?? []).map((b: any): Update => ({ id: `miro:${b.id}`, title: b.name, detail: b.modifiedBy?.name ? `Edited by ${b.modifiedBy.name}` : 'Board edited', source: 'Miro', at: b.modifiedAt, url: b.viewLink })) };
    },
  },
  canva: {
    name: 'Canva', reads: 'Designs changed most recently',
    async read(get) {
      const data = await get('https://api.canva.com/rest/v1/designs', { sort_by: 'modified_descending' });
      return { updates: (data.items ?? []).slice(0, 6).map((d: any): Update => ({ id: `canva:${d.id}`, title: d.title || 'Untitled design', detail: 'Design edited', source: 'Canva', at: iso(d.updated_at * 1000), url: d.urls?.view_url })) };
    },
  },
  webflow: {
    name: 'Webflow', reads: 'Your sites and when each was last published',
    async read(get) {
      const data = await get('https://api.webflow.com/v2/sites');
      return { updates: (data.sites ?? []).filter((s: any) => s.lastPublished).map((s: any): Update => ({ id: `webflow:${s.id}`, title: s.displayName, detail: 'Site published', source: 'Webflow', at: s.lastPublished, url: s.previewUrl })) };
    },
  },
  pipedrive: {
    name: 'Pipedrive', reads: 'Open deals: pipeline value and deals closing this week',
    async read(get) {
      // Relative paths go to the account's own company domain, which Composio knows.
      const data = await get('/v1/deals', { status: 'open', limit: '500' });
      const deals = data.data ?? [];
      return { numbers: pipeline('Pipedrive', deals.map((d: any) => ({ value: Number(d.value) || 0, close: d.expected_close_date })), deals[0]?.currency) };
    },
  },
  salesforce: {
    name: 'Salesforce', reads: 'Open opportunities: pipeline value and deals closing this week',
    async read(get) {
      const data = await get('/services/data/v62.0/query', { q: 'SELECT Amount, CloseDate FROM Opportunity WHERE IsClosed = false LIMIT 2000' });
      return { numbers: pipeline('Salesforce', (data.records ?? []).map((r: any) => ({ value: Number(r.Amount) || 0, close: r.CloseDate }))) };
    },
  },
  close: {
    name: 'Close', reads: 'Active opportunities: pipeline value and deals closing this week',
    async read(get) {
      const data = await get('https://api.close.com/api/v1/opportunity/', { status_type: 'active', _limit: '200' });
      const opps = data.data ?? [];
      // Close keeps money in cents.
      return { numbers: pipeline('Close', opps.map((o: any) => ({ value: (Number(o.value) || 0) / 100, close: o.expected_date })), opps[0]?.value_currency) };
    },
  },
  zendesk: {
    name: 'Zendesk', reads: 'Unsolved tickets assigned to you',
    async read(get, account) {
      const data = await get('/api/v2/search.json', { query: 'type:ticket status<solved assignee:me', sort_by: 'updated_at', sort_order: 'desc' });
      const sub = host(account.val);
      return { needs: (data.results ?? []).slice(0, 8).map((t: any): Need => ({ id: `zendesk:${t.id}`, title: t.subject || `Ticket ${t.id}`, detail: `Ticket ${t.id}${t.priority ? ` · ${t.priority}` : ''}`, source: 'Zendesk', at: t.updated_at, url: sub ? `https://${sub}.zendesk.com/agent/tickets/${t.id}` : undefined })) };
    },
  },
  freshdesk: {
    name: 'Freshdesk', reads: 'New tickets and open tickets assigned to you',
    async read(get, account) {
      const tickets = await get('/api/v2/tickets', { filter: 'new_and_my_open', order_by: 'updated_at' });
      const sub = host(account.val);
      const priority = ['', 'Low', 'Medium', 'High', 'Urgent'];
      return { needs: (tickets ?? []).slice(0, 8).map((t: any): Need => ({ id: `freshdesk:${t.id}`, title: t.subject, detail: `Ticket ${t.id} · ${priority[t.priority] ?? 'Open'}`, source: 'Freshdesk', at: t.updated_at, url: sub ? `https://${sub}.freshdesk.com/a/tickets/${t.id}` : undefined })) };
    },
  },
  help_scout: {
    name: 'Help Scout', reads: 'Active conversations assigned to you',
    async read(get) {
      const me = await get('https://api.helpscout.net/v2/users/me');
      const data = await get('https://api.helpscout.net/v2/conversations', { status: 'active', assigned_to: String(me.id) });
      return { needs: (data._embedded?.conversations ?? []).slice(0, 8).map((c: any): Need => ({ id: `helpscout:${c.id}`, title: c.subject || '(no subject)', who: [c.primaryCustomer?.first, c.primaryCustomer?.last].filter(Boolean).join(' ') || undefined, from: c.primaryCustomer?.email?.toLowerCase(), detail: c.preview, source: 'Help Scout', at: c.userUpdatedAt, url: `https://secure.helpscout.net/conversation/${c.id}` })) };
    },
  },
  vercel: {
    name: 'Vercel', reads: 'Deployments that failed in the last day',
    async read(get) {
      const data = await get('https://api.vercel.com/v6/deployments', { state: 'ERROR', since: String(ago(1)), limit: '10' });
      return { needs: (data.deployments ?? []).map((d: any): Need => ({ id: `vercel:${d.uid}`, title: `Deploy failed: ${d.name}`, detail: d.meta?.githubCommitMessage ?? d.url, source: 'Vercel', at: iso(d.created), url: d.inspectorUrl ?? `https://${d.url}` })) };
    },
  },
  datadog: {
    name: 'Datadog', reads: 'Monitors that are alerting now',
    async read(get) {
      const monitors = await get('/api/v1/monitor', { group_states: 'alert' });
      return { needs: (monitors ?? []).filter((m: any) => m.overall_state === 'Alert').slice(0, 8).map((m: any): Need => ({ id: `datadog:${m.id}`, title: m.name, detail: 'Monitor alerting', source: 'Datadog', at: m.overall_state_modified ?? m.modified, url: `https://app.datadoghq.com/monitors/${m.id}` })) };
    },
  },
  cal: {
    name: 'Cal.com', reads: 'Upcoming bookings today and tomorrow',
    async read(get) {
      const data = await get('https://api.cal.com/v2/bookings', { status: 'upcoming', take: '50' }, { 'cal-api-version': '2024-08-13' });
      const until = startOfToday() + 2 * DAY;
      return { schedule: (data.data ?? []).filter((b: any) => Date.parse(b.start) < until).map((b: any): CalendarEvent => ({ id: `cal:${b.uid}`, title: b.title, start: b.start, end: b.end, location: b.location, joinUrl: b.meetingUrl, source: 'Cal.com' })) };
    },
  },
  typeform: {
    name: 'Typeform', reads: 'How many responses each recent form got in the last day',
    async read(get) {
      const forms = (await get('https://api.typeform.com/forms', { page_size: '5', sort_by: 'last_updated_at', order_by: 'desc' })).items ?? [];
      const counts = await Promise.all(forms.map((f: any) => get(`https://api.typeform.com/forms/${f.id}/responses`, { since: iso(ago(1)), page_size: '1' })));
      return { updates: forms.map((f: any, i: number) => ({ form: f, n: counts[i].total_items ?? 0 })).filter((x: any) => x.n > 0).map(({ form, n }: any): Update => ({ id: `typeform:${form.id}`, title: form.title, detail: `${n} new ${n === 1 ? 'response' : 'responses'} today`, source: 'Typeform', url: form._links?.display })) };
    },
  },
  mailchimp: {
    name: 'Mailchimp', reads: 'Subscribers across your audiences',
    async read(get) {
      const data = await get('/3.0/lists', { count: '20', fields: 'lists.name,lists.stats.member_count' });
      return { numbers: [{ label: 'Email subscribers', value: count(sum((data.lists ?? []).map((l: any) => l.stats?.member_count ?? 0))), source: 'Mailchimp' }] };
    },
  },
  youtube: {
    name: 'YouTube', reads: 'Your channel’s subscribers and total views',
    async read(get) {
      const channel = (await get('https://www.googleapis.com/youtube/v3/channels', { part: 'statistics', mine: 'true' })).items?.[0];
      const n = (v: unknown) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(Number(v) || 0);
      return { numbers: channel ? [{ label: 'YouTube subscribers', value: n(channel.statistics.subscriberCount), source: 'YouTube' }, { label: 'YouTube views', value: n(channel.statistics.viewCount), source: 'YouTube' }] : [] };
    },
  },
  twitter: {
    name: 'X (Twitter)', reads: 'Your follower count and posts that mention you, last three days',
    async read(get) {
      const me = (await get('https://api.twitter.com/2/users/me', { 'user.fields': 'public_metrics' })).data;
      const mentions = await get(`https://api.twitter.com/2/users/${me.id}/mentions`, { max_results: '10', start_time: iso(ago(3)), 'tweet.fields': 'created_at' });
      return {
        numbers: [{ label: 'X followers', value: count(me.public_metrics?.followers_count ?? 0), source: 'X' }],
        updates: (mentions.data ?? []).map((t: any): Update => ({ id: `x:${t.id}`, title: t.text.slice(0, 160), detail: 'Mentioned you', source: 'X', at: t.created_at, url: `https://x.com/i/web/status/${t.id}` })),
      };
    },
  },
  instagram: {
    name: 'Instagram', reads: 'Followers and post count on your professional account',
    async read(get) {
      const me = await get('https://graph.instagram.com/v21.0/me', { fields: 'username,followers_count,media_count' });
      return { numbers: [{ label: 'Instagram followers', value: count(me.followers_count ?? 0), change: `${me.media_count ?? 0} posts`, source: 'Instagram' }] };
    },
  },
  reddit: {
    name: 'Reddit', reads: 'Unread replies and messages',
    async read(get) {
      const data = await get('https://oauth.reddit.com/message/unread', { limit: '10' }, { 'User-Agent': 'OXBOT/0.2 (read-only dashboard)' });
      return { needs: (data.data?.children ?? []).map(({ data: m }: any): Need => ({ id: `reddit:${m.name}`, title: m.subject, who: m.author, detail: String(m.body ?? '').slice(0, 160), source: 'Reddit', at: iso(m.created_utc * 1000), url: m.context ? `https://www.reddit.com${m.context}` : 'https://www.reddit.com/message/unread/' })) };
    },
  },
  brex: {
    name: 'Brex', reads: 'Cash balance across your Brex accounts',
    async read(get) {
      const accounts = (await get('https://platform.brexapis.com/v2/accounts/cash')).items ?? [];
      return { numbers: [{ label: 'Brex cash', value: money(sum(accounts.map((a: any) => a.current_balance?.amount ?? 0)) / 100, accounts[0]?.current_balance?.currency), source: 'Brex' }] };
    },
  },
  ramp: {
    name: 'Ramp', reads: 'Card spend over the last seven days',
    async read(get) {
      const tx = (await get('https://api.ramp.com/developer/v1/transactions', { from_date: iso(ago(7)), page_size: '100' })).data ?? [];
      return { numbers: [sevenDays('Ramp', 'Card spend, 7 days', tx.map((t: any) => Number(t.amount) || 0), tx[0]?.currency_code)] };
    },
  },
  paypal: {
    name: 'PayPal', reads: 'Your PayPal balance',
    async read(get) {
      const data = await get('https://api-m.paypal.com/v1/reporting/balances');
      const main = (data.balances ?? []).find((b: any) => b.primary) ?? data.balances?.[0];
      return { numbers: main ? [{ label: 'PayPal balance', value: money(Number(main.total_balance?.value) || 0, main.currency), source: 'PayPal' }] : [] };
    },
  },
  square: {
    name: 'Square', reads: 'Completed payments over the last seven days',
    async read(get) {
      const paid = ((await get('https://connect.squareup.com/v2/payments', { begin_time: iso(ago(7)), limit: '100' })).payments ?? []).filter((p: any) => p.status === 'COMPLETED');
      return { numbers: [sevenDays('Square', 'Square sales, 7 days', paid.map((p: any) => (p.amount_money?.amount ?? 0) / 100), paid[0]?.amount_money?.currency)] };
    },
  },
  gumroad: {
    name: 'Gumroad', reads: 'Sales over the last seven days',
    async read(get) {
      const data = await get('https://api.gumroad.com/v2/sales', { after: day(ago(7)) });
      return { numbers: [sevenDays('Gumroad', 'Gumroad sales, 7 days', (data.sales ?? []).map((s: any) => (Number(s.price) || 0) / 100))] };
    },
  },
  lemon_squeezy: {
    name: 'Lemon Squeezy', reads: 'Paid orders over the last seven days',
    async read(get) {
      const paid = ((await get('https://api.lemonsqueezy.com/v1/orders', { 'page[size]': '100' })).data ?? []).map((o: any) => o.attributes).filter((o: any) => o.status === 'paid' && Date.parse(o.created_at) > ago(7));
      return { numbers: [sevenDays('Lemon Squeezy', 'Lemon Squeezy sales, 7 days', paid.map((o: any) => o.total / 100), paid[0]?.currency)] };
    },
  },
};

// What the Connections page shows about your Composio apps after the last pull.
export interface ComposioApp { slug: string; name: string; reads?: string; error?: string }
let lastApps: ComposioApp[] = [];
export const composioApps = () => lastApps;
const nameOf = (slug: string) => readers[slug]?.name ?? composioCatalog.find(([, s]) => s === slug)?.[0] ?? slug;

export const composioDefs: Def[] = [{
  id: 'composio', name: 'Composio', group: 'Hub', mockOnly: true,
  reads: `Lists the apps you connected in your Composio project and reads ${Object.keys(readers).length} of them: tasks, tickets, deals, money, failed deploys, followers. Any other of Composio’s ${count(composioCatalog.length)} apps you connect shows here as connected, not read yet.`,
  fields: [
    { key: 'COMPOSIO_API_KEY', label: 'Project API key', secret: true },
    { key: 'COMPOSIO_USER_ID', label: 'User ID you connected apps under', optional: true, placeholder: 'default' },
  ],
  setup: 'Sign in at platform.composio.dev, connect the apps you want under one user ID (blank here means "default"), then copy the project API key from Settings → Project Settings. Composio keeps those sign-ins in its cloud and may ask an app for more than read access; OXBOT only ever sends reads through it.',
  setupUrl: 'https://platform.composio.dev/',
  async pull({ field }) {
    const user = field('COMPOSIO_USER_ID') || 'default';
    const headers = { 'x-api-key': field('COMPOSIO_API_KEY')!, 'Content-Type': 'application/json' };
    const list = await api<any>(`${BASE}/connected_accounts?${new URLSearchParams({ user_ids: user, statuses: 'ACTIVE', limit: '100' })}`, { headers });
    const accounts: Account[] = (list.items ?? []).map((a: any) => ({ id: a.id, slug: String(a.toolkit?.slug ?? '').toLowerCase(), val: a.state?.val ?? {} }));
    const apps: ComposioApp[] = [];
    const pulls = await Promise.all(accounts.map(async (account): Promise<Pull> => {
      const reader = readers[account.slug];
      const app: ComposioApp = { slug: account.slug, name: nameOf(account.slug), reads: reader?.reads };
      apps.push(app);
      if (!reader) return {};
      const get: Get = async (endpoint, query = {}, extra = {}) => {
        const parameters = [...Object.entries(query).map(([name, value]) => ({ name, value, type: 'query' })), ...Object.entries(extra).map(([name, value]) => ({ name, value, type: 'header' }))];
        // Always GET: OXBOT reads through Composio and never asks it to change anything.
        const reply = await api<any>(`${BASE}/tools/execute/proxy`, { method: 'POST', headers, body: JSON.stringify({ connected_account_id: account.id, user_id: user, endpoint, method: 'GET', parameters }) });
        if (reply.status >= 400) throw new Error(`${reader.name} ${reply.status}: ${JSON.stringify(reply.data ?? '').slice(0, 160)}`);
        return reply.data ?? {};
      };
      // One app failing never hides the others; the Connections page shows its error.
      try { return await reader.read(get, account); }
      catch (error) { app.error = error instanceof Error ? error.message : String(error); return {}; }
    }));
    lastApps = apps.sort((a, b) => Number(!a.reads) - Number(!b.reads) || a.name.localeCompare(b.name));
    const read = apps.filter(a => a.reads);
    if (read.length && read.every(a => a.error)) throw new Error(read[0].error);
    return {
      needs: pulls.flatMap(p => p.needs ?? []), schedule: pulls.flatMap(p => p.schedule ?? []),
      numbers: pulls.flatMap(p => p.numbers ?? []), updates: pulls.flatMap(p => p.updates ?? []),
    };
  },
}];
