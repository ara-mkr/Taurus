import { api } from '../store.ts';
import type { CalendarEvent, Metric, Need, Update } from '../types.ts';
import { DAY, decode, iso, list, money, startOfToday, stripTags, type Def, type Field } from './kit.ts';

// A hundred more connections (owner, November 6, 2026: "find atleast 100 moreconnections to put in we only have 68").
// Every one only reads, with the owner's own key or a public feed, through each service's documented API: support
// desks, dev and ops, analytics, sales and hiring, money and stores, social and media, news and life trackers. Each
// sends one or two GETs (or the read-only POST queries a few APIs use for searches) and turns the answer into the
// board's needs, updates and numbers. Built from each provider's documentation and tested only against mocked
// responses; none has been tried with a real account.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const ago = (days: number) => Date.now() - days * DAY;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const n = (v: number) => new Intl.NumberFormat('en-US').format(Math.round(v));
const secret = (key: string, label: string, placeholder?: string): Field => ({ key, label, secret: true, ...(placeholder ? { placeholder } : {}) });
const plain = (key: string, label: string, placeholder?: string, optional?: boolean): Field => ({ key, label, ...(placeholder ? { placeholder } : {}), ...(optional ? { optional } : {}) });
const basic = (user: string, pass = '') => ({ Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` });
const host = (raw = '') => raw.trim().replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://');
const updates = (source: string, items: any[], map: (x: any) => Omit<Update, 'source'> | undefined): { updates: Update[] } => ({ updates: items.map(map).filter(Boolean).slice(0, 8).map(u => ({ ...u!, source })) });
// A need with no time of its own is stamped now, when OXBOT saw it.
const needs = (source: string, items: any[], map: (x: any) => (Omit<Need, 'source' | 'at'> & { at?: string }) | undefined): { needs: Need[] } => ({ needs: items.map(map).filter(Boolean).slice(0, 8).map(x => ({ at: iso(Date.now()), ...x!, source }) as Need) });
const numbers = (source: string, rows: [string, string, string?][]): { numbers: Metric[] } => ({ numbers: rows.map(([label, value, change]) => ({ label, value, source, ...(change ? { change } : {}) })) });
const event = (e: Omit<CalendarEvent, 'allDay'> & { allDay?: boolean }) => ({ allDay: false, ...e }) as CalendarEvent;
const xmlItems = (xml: string) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({ title: decode(m[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? ''), link: m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim(), date: m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] }));
const text = async (url: string, headers: Record<string, string> = {}) => { const r = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) }); if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`); return r.text(); };

const support: Def[] = [
  { id: 'zendesk', name: 'Zendesk', group: 'Chat', mockOnly: true, reads: 'Open tickets assigned to you: subject, priority.',
    fields: [plain('ZENDESK_SUBDOMAIN', 'Subdomain', 'yourcompany'), plain('ZENDESK_EMAIL', 'Your Zendesk email'), secret('ZENDESK_TOKEN', 'API token')],
    setup: 'Admin Center, Apps and integrations, Zendesk API, Add API token.', setupUrl: 'https://support.zendesk.com/hc/en-us/articles/4408889192858',
    async pull({ field }) {
      const r = await api<any>(`https://${field('ZENDESK_SUBDOMAIN')}.zendesk.com/api/v2/search.json?query=${encodeURIComponent('type:ticket status<solved assignee:me')}&sort_by=updated_at`, { headers: basic(`${field('ZENDESK_EMAIL')}/token`, field('ZENDESK_TOKEN')) });
      return needs('Zendesk', r.results ?? [], t => ({ id: `zendesk:${t.id}`, title: t.subject, detail: `${t.priority ?? 'normal'} priority · ${t.status}`, at: t.updated_at, url: `https://${field('ZENDESK_SUBDOMAIN')}.zendesk.com/agent/tickets/${t.id}` }));
    } },
  { id: 'freshdesk', name: 'Freshdesk', group: 'Chat', mockOnly: true, reads: 'Your new and open tickets.',
    fields: [plain('FRESHDESK_DOMAIN', 'Domain', 'yourcompany'), secret('FRESHDESK_KEY', 'API key')],
    setup: 'Profile settings, View API key.', setupUrl: 'https://support.freshdesk.com/support/solutions/articles/215517',
    async pull({ field }) {
      const r = await api<any[]>(`https://${field('FRESHDESK_DOMAIN')}.freshdesk.com/api/v2/tickets?filter=new_and_my_open&order_by=updated_at`, { headers: basic(field('FRESHDESK_KEY')!, 'X') });
      return needs('Freshdesk', r, t => ({ id: `freshdesk:${t.id}`, title: t.subject, detail: t.priority >= 3 ? 'High priority' : 'Open', at: t.updated_at, url: `https://${field('FRESHDESK_DOMAIN')}.freshdesk.com/a/tickets/${t.id}` }));
    } },
  { id: 'front', name: 'Front', group: 'Chat', mockOnly: true, reads: 'Conversations waiting in your shared inboxes.',
    fields: [secret('FRONT_TOKEN', 'API token')], setup: 'Settings, Developers, API tokens, Create API token with read scopes.', setupUrl: 'https://dev.frontapp.com/docs/create-and-revoke-api-tokens',
    async pull({ field }) {
      const r = await api<any>('https://api2.frontapp.com/conversations?q[statuses][]=unassigned&q[statuses][]=assigned&limit=15', { token: field('FRONT_TOKEN') });
      return needs('Front', r._results ?? [], c => ({ id: `front:${c.id}`, title: c.subject || '(no subject)', who: c.recipient?.name ?? c.recipient?.handle, detail: c.status, at: iso((c.last_message?.created_at ?? c.created_at) * 1000), url: `https://app.frontapp.com/open/${c.id}` }));
    } },
  { id: 'gorgias', name: 'Gorgias', group: 'Chat', mockOnly: true, reads: 'Open customer tickets, newest first.',
    fields: [plain('GORGIAS_DOMAIN', 'Domain', 'yourstore'), plain('GORGIAS_EMAIL', 'Your email'), secret('GORGIAS_KEY', 'API key')],
    setup: 'Settings, REST API, copy the key.', setupUrl: 'https://developers.gorgias.com/reference/introduction',
    async pull({ field }) {
      const r = await api<any>(`https://${field('GORGIAS_DOMAIN')}.gorgias.com/api/tickets?limit=30&order_by=created_datetime:desc`, { headers: basic(field('GORGIAS_EMAIL')!, field('GORGIAS_KEY')) });
      return needs('Gorgias', (r.data ?? []).filter((t: any) => t.status === 'open'), t => ({ id: `gorgias:${t.id}`, title: t.subject || 'Customer ticket', who: t.customer?.name, at: t.updated_datetime }));
    } },
  { id: 'mattermost', name: 'Mattermost', group: 'Chat', mockOnly: true, reads: 'Unread messages and mentions across your teams.',
    fields: [plain('MATTERMOST_URL', 'Server address', 'https://chat.example.com'), secret('MATTERMOST_TOKEN', 'Personal access token')],
    setup: 'Profile, Security, Personal access tokens, Create token.', setupUrl: 'https://developers.mattermost.com/integrate/reference/personal-access-token/',
    async pull({ field }) {
      const r = await api<any[]>(`${host(field('MATTERMOST_URL'))}/api/v4/users/me/teams/unread`, { token: field('MATTERMOST_TOKEN') });
      return { inbox: [{ source: 'Mattermost', unread: r.reduce((a, t) => a + (t.msg_count ?? 0), 0), label: `unread, ${r.reduce((a, t) => a + (t.mention_count ?? 0), 0)} mentions`, url: host(field('MATTERMOST_URL')) }] };
    } },
  { id: 'rocketchat', name: 'Rocket.Chat', group: 'Chat', mockOnly: true, reads: 'Unread messages in your rooms.',
    fields: [plain('ROCKETCHAT_URL', 'Server address'), plain('ROCKETCHAT_USER_ID', 'User ID'), secret('ROCKETCHAT_TOKEN', 'Personal access token')],
    setup: 'My Account, Personal Access Tokens, Add. Copy the token and user ID.', setupUrl: 'https://docs.rocket.chat/',
    async pull({ field }) {
      const r = await api<any>(`${host(field('ROCKETCHAT_URL'))}/api/v1/subscriptions.get`, { headers: { 'X-User-Id': field('ROCKETCHAT_USER_ID')!, 'X-Auth-Token': field('ROCKETCHAT_TOKEN')! } });
      return { inbox: [{ source: 'Rocket.Chat', unread: (r.update ?? []).reduce((a: number, s: any) => a + (s.unread ?? 0), 0), label: 'unread', url: host(field('ROCKETCHAT_URL')) }] };
    } },
  { id: 'zulip', name: 'Zulip', group: 'Chat', mockOnly: true, reads: 'Your unread direct messages.',
    fields: [plain('ZULIP_SITE', 'Organization address', 'https://you.zulipchat.com'), plain('ZULIP_EMAIL', 'Your Zulip email'), secret('ZULIP_KEY', 'API key')],
    setup: 'Personal settings, Account and privacy, API key.', setupUrl: 'https://zulip.com/api/api-keys',
    async pull({ field }) {
      const narrow = encodeURIComponent(JSON.stringify([{ operator: 'is', operand: 'unread' }, { operator: 'is', operand: 'dm' }]));
      const r = await api<any>(`${host(field('ZULIP_SITE'))}/api/v1/messages?anchor=newest&num_before=15&num_after=0&narrow=${narrow}`, { headers: basic(field('ZULIP_EMAIL')!, field('ZULIP_KEY')) });
      return needs('Zulip', [...(r.messages ?? [])].reverse(), m => ({ id: `zulip:${m.id}`, title: stripTags(m.content).slice(0, 120), who: m.sender_full_name, at: iso(m.timestamp * 1000) }));
    } },
  { id: 'webex', name: 'Webex', group: 'Calendar', mockOnly: true, reads: 'Your Webex meetings for today.',
    fields: [secret('WEBEX_TOKEN', 'Access token')], setup: 'Sign in at developer.webex.com and copy your personal access token, or create an integration.', setupUrl: 'https://developer.webex.com/docs/getting-started',
    async pull({ field }) {
      const r = await api<any>(`https://webexapis.com/v1/meetings?from=${encodeURIComponent(iso(startOfToday()))}&to=${encodeURIComponent(iso(startOfToday() + DAY))}&meetingType=scheduledMeeting`, { token: field('WEBEX_TOKEN') });
      return { schedule: (r.items ?? []).map((m: any) => event({ id: `webex:${m.id}`, title: m.title, start: m.start, end: m.end, source: 'Webex', joinUrl: m.webLink })) };
    } },
  { id: 'cal-com', name: 'Cal.com', group: 'Calendar', mockOnly: true, reads: 'Upcoming bookings people made with you.',
    fields: [secret('CALCOM_KEY', 'API key')], setup: 'Settings, Developer, API keys, Create.', setupUrl: 'https://app.cal.com/settings/developer/api-keys',
    async pull({ field }) {
      const r = await api<any>('https://api.cal.com/v2/bookings?status=upcoming&take=20', { token: field('CALCOM_KEY'), headers: { 'cal-api-version': '2024-08-13' } });
      return { schedule: (r.data ?? []).map((b: any) => event({ id: `calcom:${b.uid ?? b.id}`, title: b.title, start: b.start, end: b.end, source: 'Cal.com', joinUrl: b.meetingUrl })) };
    } },
  { id: 'savvycal', name: 'SavvyCal', group: 'Calendar', mockOnly: true, reads: 'Upcoming meetings booked through your links.',
    fields: [secret('SAVVYCAL_TOKEN', 'Personal token')], setup: 'Settings, Developers, Create a token.', setupUrl: 'https://savvycal.com/docs/api',
    async pull({ field }) {
      const r = await api<any>('https://api.savvycal.com/v1/events?state=confirmed&period=upcoming', { token: field('SAVVYCAL_TOKEN') });
      return { schedule: (r.entries ?? []).map((e: any) => event({ id: `savvycal:${e.id}`, title: e.summary ?? e.link?.name ?? 'Meeting', start: e.start_at, end: e.end_at, source: 'SavvyCal', joinUrl: e.conferencing?.join_url })) };
    } },
  { id: 'fireflies', name: 'Fireflies', group: 'Calendar', mockOnly: true, reads: 'Your latest meeting notes: titles and dates, never the transcripts.',
    fields: [secret('FIREFLIES_KEY', 'API key')], setup: 'Integrations, Fireflies API, copy your key.', setupUrl: 'https://docs.fireflies.ai/fundamentals/authorization',
    async pull({ field }) {
      const r = await api<any>('https://api.fireflies.ai/graphql', { method: 'POST', token: field('FIREFLIES_KEY'), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ transcripts(limit: 6) { id title date transcript_url } }' }) });
      return updates('Fireflies', r.data?.transcripts ?? [], t => ({ id: `fireflies:${t.id}`, title: t.title, detail: 'Meeting notes ready', at: iso(Number(t.date)), url: t.transcript_url }));
    } },
  { id: 'fathom-video', name: 'Fathom (meetings)', group: 'Calendar', mockOnly: true, reads: 'Your latest recorded meetings.',
    fields: [secret('FATHOM_VIDEO_KEY', 'API key')], setup: 'Fathom settings, API Access, Generate API key.', setupUrl: 'https://developers.fathom.ai/',
    async pull({ field }) {
      const r = await api<any>('https://api.fathom.ai/external/v1/meetings?limit=6', { headers: { 'X-Api-Key': field('FATHOM_VIDEO_KEY')! } });
      return updates('Fathom', r.items ?? [], m => ({ id: `fathom:${m.recording_id ?? m.url}`, title: m.title ?? m.meeting_title, detail: 'Recorded', at: m.created_at, url: m.share_url ?? m.url }));
    } },
  { id: 'gong', name: 'Gong', group: 'Sales', mockOnly: true, reads: 'Calls recorded in the last two days: titles and length.',
    fields: [plain('GONG_KEY', 'Access key'), secret('GONG_SECRET', 'Access key secret')], setup: 'Company settings, Ecosystem, API, Create.', setupUrl: 'https://help.gong.io/docs/receive-access-to-the-api',
    async pull({ field }) {
      const r = await api<any>(`https://api.gong.io/v2/calls?fromDateTime=${encodeURIComponent(iso(ago(2)))}`, { headers: basic(field('GONG_KEY')!, field('GONG_SECRET')) });
      return updates('Gong', r.calls ?? [], c => ({ id: `gong:${c.id}`, title: c.title, detail: `${Math.round((c.duration ?? 0) / 60)} min call`, at: c.started, url: c.url }));
    } },
];

const work: Def[] = [
  { id: 'clickup', name: 'ClickUp', group: 'Tasks', mockOnly: true, reads: 'Your tasks due today or overdue.',
    fields: [secret('CLICKUP_TOKEN', 'Personal API token')], setup: 'Settings, Apps, API Token, Generate.', setupUrl: 'https://app.clickup.com/settings/apps',
    async pull({ field }) {
      const h = { Authorization: field('CLICKUP_TOKEN')! };
      const [{ user }, { teams }] = await Promise.all([api<any>('https://api.clickup.com/api/v2/user', { headers: h }), api<any>('https://api.clickup.com/api/v2/team', { headers: h })]);
      const lists = await Promise.all((teams ?? []).slice(0, 3).map((t: any) => api<any>(`https://api.clickup.com/api/v2/team/${t.id}/task?assignees[]=${user.id}&due_date_lt=${startOfToday() + DAY}&order_by=due_date`, { headers: h })));
      return needs('ClickUp', lists.flatMap(l => l.tasks ?? []).filter((t: any) => t.due_date), t => ({ id: `clickup:${t.id}`, title: t.name, detail: Number(t.due_date) < startOfToday() ? 'Overdue' : 'Due today', at: iso(Number(t.due_date)), url: t.url }));
    } },
  { id: 'shortcut', name: 'Shortcut', group: 'Tasks', mockOnly: true, reads: 'Stories you own that are due or overdue.',
    fields: [secret('SHORTCUT_TOKEN', 'API token')], setup: 'Settings, Your account, API tokens.', setupUrl: 'https://app.shortcut.com/settings/account/api-tokens',
    async pull({ field }) {
      const h = { 'Shortcut-Token': field('SHORTCUT_TOKEN')! };
      const me = await api<any>('https://api.app.shortcut.com/api/v3/member', { headers: h });
      const r = await api<any>(`https://api.app.shortcut.com/api/v3/search/stories?query=${encodeURIComponent(`owner:${me.mention_name} !is:done !is:archived`)}&page_size=25`, { headers: h });
      return needs('Shortcut', (r.data ?? []).filter((s: any) => s.deadline && Date.parse(s.deadline) < startOfToday() + DAY), s => ({ id: `shortcut:${s.id}`, title: s.name, detail: Date.parse(s.deadline) < startOfToday() ? 'Overdue' : 'Due today', at: s.updated_at, url: s.app_url }));
    } },
  { id: 'youtrack', name: 'YouTrack', group: 'Tasks', mockOnly: true, reads: 'Unresolved issues assigned to you.',
    fields: [plain('YOUTRACK_URL', 'Address', 'https://you.youtrack.cloud'), secret('YOUTRACK_TOKEN', 'Permanent token')], setup: 'Profile, Account security, New token.', setupUrl: 'https://www.jetbrains.com/help/youtrack/cloud/Manage-Permanent-Token.html',
    async pull({ field }) {
      const r = await api<any[]>(`${host(field('YOUTRACK_URL'))}/api/issues?query=${encodeURIComponent('for: me #Unresolved sort by: updated')}&fields=idReadable,summary,updated&$top=15`, { token: field('YOUTRACK_TOKEN') });
      return needs('YouTrack', r, i => ({ id: `youtrack:${i.idReadable}`, title: `${i.idReadable} ${i.summary}`, at: iso(i.updated), url: `${host(field('YOUTRACK_URL'))}/issue/${i.idReadable}` }));
    } },
  { id: 'wrike', name: 'Wrike', group: 'Tasks', mockOnly: true, reads: 'Active tasks assigned to you, due today or earlier.',
    fields: [secret('WRIKE_TOKEN', 'Permanent access token')], setup: 'Apps and integrations, API, Create new, then Obtain token.', setupUrl: 'https://developers.wrike.com/oauth-20-authorization/',
    async pull({ field }) {
      const me = (await api<any>('https://www.wrike.com/api/v4/contacts?me=true', { token: field('WRIKE_TOKEN') })).data?.[0];
      const r = await api<any>(`https://www.wrike.com/api/v4/tasks?responsibles=${encodeURIComponent(JSON.stringify([me?.id]))}&status=Active&dueDate=${encodeURIComponent(JSON.stringify({ end: day(Date.now()) }))}`, { token: field('WRIKE_TOKEN') });
      return needs('Wrike', r.data ?? [], t => ({ id: `wrike:${t.id}`, title: t.title, detail: t.importance === 'High' ? 'High importance' : 'Due', at: t.updatedDate, url: t.permalink }));
    } },
  { id: 'coda', name: 'Coda', group: 'Files', mockOnly: true, reads: 'Names of your most recently changed docs, never their contents.',
    fields: [secret('CODA_TOKEN', 'API token')], setup: 'Account settings, API settings, Generate API token (read-only).', setupUrl: 'https://coda.io/account',
    async pull({ field }) { const r = await api<any>('https://coda.io/apis/v1/docs?limit=25', { token: field('CODA_TOKEN') }); return updates('Coda', (r.items ?? []).sort((a: any, b: any) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), d => ({ id: `coda:${d.id}`, title: d.name, detail: 'Doc changed', at: d.updatedAt, url: d.browserLink })); } },
  { id: 'smartsheet', name: 'Smartsheet', group: 'Files', mockOnly: true, reads: 'Sheets changed most recently: names only.',
    fields: [secret('SMARTSHEET_TOKEN', 'API access token')], setup: 'Account, Apps and integrations, API access, Generate new access token.', setupUrl: 'https://help.smartsheet.com/articles/2482389',
    async pull({ field }) { const r = await api<any>('https://api.smartsheet.com/2.0/sheets?includeAll=true', { token: field('SMARTSHEET_TOKEN') }); return updates('Smartsheet', (r.data ?? []).sort((a: any, b: any) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt)), s => ({ id: `smartsheet:${s.id}`, title: s.name, detail: 'Sheet changed', at: s.modifiedAt, url: s.permalink })); } },
  { id: 'miro', name: 'Miro', group: 'Files', mockOnly: true, reads: 'Boards changed most recently.',
    fields: [secret('MIRO_TOKEN', 'Access token')], setup: 'Create an app in Miro’s developer settings with boards:read, install it to your team, and copy the access token.', setupUrl: 'https://developers.miro.com/docs/rest-api-build-your-first-hello-world-app',
    async pull({ field }) { const r = await api<any>('https://api.miro.com/v2/boards?sort=last_modified&limit=10', { token: field('MIRO_TOKEN') }); return updates('Miro', r.data ?? [], b => ({ id: `miro:${b.id}`, title: b.name, detail: 'Board changed', at: b.modifiedAt, url: b.viewLink })); } },
  { id: 'figma', name: 'Figma', group: 'Files', mockOnly: true, reads: 'Files in your team’s projects changed most recently.',
    fields: [secret('FIGMA_TOKEN', 'Personal access token'), plain('FIGMA_TEAM_ID', 'Team ID (from the team page’s address)')], setup: 'Settings, Security, Personal access tokens, with File content and Projects read scopes.', setupUrl: 'https://www.figma.com/developers/api#access-tokens',
    async pull({ field }) {
      const h = { 'X-Figma-Token': field('FIGMA_TOKEN')! };
      const { projects } = await api<any>(`https://api.figma.com/v1/teams/${field('FIGMA_TEAM_ID')}/projects`, { headers: h });
      const files = (await Promise.all((projects ?? []).slice(0, 6).map((p: any) => api<any>(`https://api.figma.com/v1/projects/${p.id}/files`, { headers: h }).then(r => r.files ?? [])))).flat();
      return updates('Figma', files.sort((a: any, b: any) => Date.parse(b.last_modified) - Date.parse(a.last_modified)), f => ({ id: `figma:${f.key}`, title: f.name, detail: 'Design changed', at: f.last_modified, url: `https://www.figma.com/file/${f.key}` }));
    } },
  { id: 'readwise', name: 'Readwise', group: 'Files', mockOnly: true, reads: 'Your newest highlights.',
    fields: [secret('READWISE_TOKEN', 'Access token')], setup: 'Copy your token at readwise.io/access_token.', setupUrl: 'https://readwise.io/access_token',
    async pull({ field }) { const r = await api<any>('https://readwise.io/api/v2/highlights/?page_size=8', { headers: { Authorization: `Token ${field('READWISE_TOKEN')}` } }); return updates('Readwise', r.results ?? [], h => ({ id: `readwise:${h.id}`, title: String(h.text).slice(0, 140), detail: 'Highlight', at: h.highlighted_at ?? h.updated, url: h.url ?? undefined })); } },
  { id: 'readwise-reader', name: 'Readwise Reader', group: 'Files', mockOnly: true, reads: 'How many saved articles are waiting in your Inbox.',
    fields: [secret('READER_TOKEN', 'Access token')], setup: 'The same token as Readwise, from readwise.io/access_token.', setupUrl: 'https://readwise.io/reader_api',
    async pull({ field }) { const r = await api<any>('https://readwise.io/api/v3/list/?location=new', { headers: { Authorization: `Token ${field('READER_TOKEN')}` } }); return numbers('Reader', [['Articles to read', n(r.count ?? (r.results ?? []).length)]]); } },
  { id: 'raindrop', name: 'Raindrop.io', group: 'Files', mockOnly: true, reads: 'Bookmarks you saved most recently.',
    fields: [secret('RAINDROP_TOKEN', 'Test token')], setup: 'Settings, Integrations, Create new app, then Create test token.', setupUrl: 'https://app.raindrop.io/settings/integrations',
    async pull({ field }) { const r = await api<any>('https://api.raindrop.io/rest/v1/raindrops/0?perpage=8&sort=-created', { token: field('RAINDROP_TOKEN') }); return updates('Raindrop', r.items ?? [], b => ({ id: `raindrop:${b._id}`, title: b.title, detail: b.domain, at: b.created, url: b.link })); } },
  { id: 'feedly', name: 'Feedly', group: 'Feeds', mockOnly: true, reads: 'Unread counts across your feeds.',
    fields: [secret('FEEDLY_TOKEN', 'Developer access token')], setup: 'Feedly Pro: feedly.com/i/team/api, Create a token.', setupUrl: 'https://feedly.com/i/team/api',
    async pull({ field }) { const r = await api<any>('https://cloud.feedly.com/v3/markers/counts', { token: field('FEEDLY_TOKEN') }); const all = (r.unreadcounts ?? []).find((u: any) => /global\.all$/.test(u.id)); return { inbox: [{ source: 'Feedly', unread: all?.count ?? 0, label: 'unread articles', url: 'https://feedly.com/i/my' }] }; } },
  { id: 'pinboard', name: 'Pinboard', group: 'Files', mockOnly: true, reads: 'Your most recent bookmarks.',
    fields: [secret('PINBOARD_TOKEN', 'API token', 'user:ABC123')], setup: 'Settings, Password, API token.', setupUrl: 'https://pinboard.in/settings/password',
    async pull({ field }) { const r = await api<any>(`https://api.pinboard.in/v1/posts/recent?format=json&count=8&auth_token=${encodeURIComponent(field('PINBOARD_TOKEN')!)}`); return updates('Pinboard', r.posts ?? [], p => ({ id: `pinboard:${p.hash}`, title: p.description, at: p.time, url: p.href })); } },
  { id: 'linkding', name: 'linkding', group: 'Files', mockOnly: true, reads: 'Recent bookmarks from your own linkding.',
    fields: [plain('LINKDING_URL', 'Address'), secret('LINKDING_TOKEN', 'REST API token')], setup: 'Settings, Integrations, REST API token.', setupUrl: 'https://linkding.link/api/',
    async pull({ field }) { const r = await api<any>(`${host(field('LINKDING_URL'))}/api/bookmarks/?limit=8`, { headers: { Authorization: `Token ${field('LINKDING_TOKEN')}` } }); return updates('linkding', r.results ?? [], b => ({ id: `linkding:${b.id}`, title: b.title || b.url, at: b.date_added, url: b.url })); } },
  { id: 'toggl', name: 'Toggl Track', group: 'Numbers', mockOnly: true, reads: 'Hours you tracked today and this week.',
    fields: [secret('TOGGL_TOKEN', 'API token')], setup: 'Profile settings, API Token.', setupUrl: 'https://track.toggl.com/profile',
    async pull({ field }) {
      const r = await api<any[]>(`https://api.track.toggl.com/api/v9/me/time_entries?start_date=${encodeURIComponent(iso(ago(7)))}&end_date=${encodeURIComponent(iso(Date.now()))}`, { headers: basic(field('TOGGL_TOKEN')!, 'api_token') });
      const secs = (entries: any[]) => entries.reduce((a, e) => a + (e.duration < 0 ? Date.now() / 1000 + e.duration : e.duration), 0);
      return numbers('Toggl', [['Tracked today', `${(secs(r.filter(e => Date.parse(e.start) >= startOfToday())) / 3600).toFixed(1)} h`], ['Tracked, 7 days', `${(secs(r) / 3600).toFixed(1)} h`]]);
    } },
  { id: 'harvest', name: 'Harvest', group: 'Numbers', mockOnly: true, reads: 'Hours logged this week, and the billable share.',
    fields: [plain('HARVEST_ACCOUNT', 'Account ID'), secret('HARVEST_TOKEN', 'Personal access token')], setup: 'Developers, Create new personal access token.', setupUrl: 'https://id.getharvest.com/developers',
    async pull({ field }) {
      const r = await api<any>(`https://api.harvestapp.com/v2/time_entries?from=${day(ago(6))}&to=${day(Date.now())}&per_page=200`, { token: field('HARVEST_TOKEN'), headers: { 'Harvest-Account-Id': field('HARVEST_ACCOUNT')!, 'User-Agent': 'OXBOT' } });
      const e = r.time_entries ?? []; const all = e.reduce((a: number, x: any) => a + x.hours, 0), bill = e.filter((x: any) => x.billable).reduce((a: number, x: any) => a + x.hours, 0);
      return numbers('Harvest', [['Hours, 7 days', all.toFixed(1), all ? `${Math.round((bill / all) * 100)}% billable` : undefined]]);
    } },
  { id: 'clockify', name: 'Clockify', group: 'Numbers', mockOnly: true, reads: 'Hours tracked in the last seven days.',
    fields: [secret('CLOCKIFY_KEY', 'API key')], setup: 'Profile settings, API, Generate.', setupUrl: 'https://app.clockify.me/user/preferences#advanced',
    async pull({ field }) {
      const h = { 'X-Api-Key': field('CLOCKIFY_KEY')! };
      const me = await api<any>('https://api.clockify.me/api/v1/user', { headers: h });
      const r = await api<any[]>(`https://api.clockify.me/api/v1/workspaces/${me.activeWorkspace}/user/${me.id}/time-entries?start=${encodeURIComponent(iso(ago(7)))}&page-size=200`, { headers: h });
      const ms = r.reduce((a, e) => a + ((e.timeInterval?.end ? Date.parse(e.timeInterval.end) : Date.now()) - Date.parse(e.timeInterval?.start)), 0);
      return numbers('Clockify', [['Hours, 7 days', (ms / 3_600_000).toFixed(1)]]);
    } },
  { id: 'rescuetime', name: 'RescueTime', group: 'Numbers', mockOnly: true, reads: 'Yesterday’s productivity pulse and screen time.',
    fields: [secret('RESCUETIME_KEY', 'API key')], setup: 'API and integrations, Create a new API key.', setupUrl: 'https://www.rescuetime.com/anapi/manage',
    async pull({ field }) { const r = await api<any[]>(`https://www.rescuetime.com/anapi/daily_summary_feed?key=${encodeURIComponent(field('RESCUETIME_KEY')!)}`); const d = r[0]; return d ? numbers('RescueTime', [['Productivity pulse', String(d.productivity_pulse)], ['Screen time', `${Number(d.total_hours).toFixed(1)} h`]]) : {}; } },
  { id: 'wakatime', name: 'WakaTime', group: 'Numbers', mockOnly: true, reads: 'Time you spent coding in the last seven days.',
    fields: [secret('WAKATIME_KEY', 'Secret API key')], setup: 'Settings, Account, Secret API key.', setupUrl: 'https://wakatime.com/settings/account',
    async pull({ field }) { const r = await api<any>('https://wakatime.com/api/v1/users/current/stats/last_7_days', { headers: basic(field('WAKATIME_KEY')!) }); return numbers('WakaTime', [['Coding, 7 days', r.data?.human_readable_total ?? '0 mins', r.data?.languages?.[0]?.name]]); } },
  { id: 'habitica', name: 'Habitica', group: 'Tasks', mockOnly: true, reads: 'Dailies you haven’t checked off today.',
    fields: [plain('HABITICA_USER', 'User ID'), secret('HABITICA_KEY', 'API token')], setup: 'Settings, Site data, API.', setupUrl: 'https://habitica.com/user/settings/siteData',
    async pull({ field }) { const r = await api<any>('https://habitica.com/api/v3/tasks/user?type=dailys', { headers: { 'x-api-user': field('HABITICA_USER')!, 'x-api-key': field('HABITICA_KEY')!, 'x-client': `${field('HABITICA_USER')}-OXBOT` } }); return needs('Habitica', (r.data ?? []).filter((t: any) => t.isDue && !t.completed), t => ({ id: `habitica:${t.id}`, title: t.text, detail: 'Daily' })); } },
  { id: 'beeminder', name: 'Beeminder', group: 'Tasks', mockOnly: true, reads: 'Goals that derail within two days.',
    fields: [secret('BEEMINDER_TOKEN', 'Auth token')], setup: 'Copy your token at beeminder.com/api/v1/auth_token.json while signed in.', setupUrl: 'https://www.beeminder.com/api/v1/auth_token.json',
    async pull({ field }) { const r = await api<any[]>(`https://www.beeminder.com/api/v1/users/me/goals.json?auth_token=${encodeURIComponent(field('BEEMINDER_TOKEN')!)}`); return needs('Beeminder', r.filter(g => g.losedate * 1000 < Date.now() + 2 * DAY), g => ({ id: `beeminder:${g.slug}`, title: g.title || g.slug, detail: g.limsum, at: iso(g.losedate * 1000), url: `https://www.beeminder.com/me/${g.slug}` })); } },
  { id: 'exist', name: 'Exist', group: 'Body', mockOnly: true, reads: 'Yesterday’s mood and steps from Exist.',
    fields: [secret('EXIST_TOKEN', 'Access token')], setup: 'Create a personal token at exist.io/account/apps.', setupUrl: 'https://developer.exist.io/',
    async pull({ field }) {
      const r = await api<any>('https://exist.io/api/2/attributes/with-values/?attributes=mood,steps&days=1', { headers: { Authorization: `Token ${field('EXIST_TOKEN')}` } });
      const v = (name: string) => (r.results ?? []).find((a: any) => a.name === name)?.values?.[0]?.value;
      return numbers('Exist', [['Mood', v('mood') != null ? `${v('mood')} of 9` : '—'], ['Steps', v('steps') != null ? n(v('steps')) : '—']]);
    } },
  { id: 'anki', name: 'Anki', group: 'Tasks', mockOnly: true, reads: 'How many cards are due today, from Anki on this Mac.',
    fields: [plain('ANKI_URL', 'AnkiConnect address', 'http://127.0.0.1:8765')], setup: 'Install the AnkiConnect add-on in Anki (code 2055492159) and keep Anki open.', setupUrl: 'https://foosoft.net/projects/anki-connect/',
    async pull({ field }) { const r = await api<any>(field('ANKI_URL') || 'http://127.0.0.1:8765', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'findCards', version: 6, params: { query: 'is:due' } }) }); return numbers('Anki', [['Cards due', n((r.result ?? []).length)]]); } },
  { id: 'n8n', name: 'n8n', group: 'Code', mockOnly: true, reads: 'Workflow runs that failed in the last day.',
    fields: [plain('N8N_URL', 'Address'), secret('N8N_KEY', 'API key')], setup: 'Settings, n8n API, Create an API key.', setupUrl: 'https://docs.n8n.io/api/authentication/',
    async pull({ field }) { const r = await api<any>(`${host(field('N8N_URL'))}/api/v1/executions?status=error&limit=10`, { headers: { 'X-N8N-API-KEY': field('N8N_KEY')! } }); return needs('n8n', (r.data ?? []).filter((e: any) => Date.parse(e.startedAt) > ago(1)), e => ({ id: `n8n:${e.id}`, title: `Workflow ${e.workflowId} failed`, at: e.startedAt, url: `${host(field('N8N_URL'))}/workflow/${e.workflowId}/executions/${e.id}` })); } },
];

const dev: Def[] = [
  { id: 'bitbucket', name: 'Bitbucket', group: 'Code', mockOnly: true, reads: 'Open pull requests you wrote.',
    fields: [plain('BITBUCKET_USER', 'Username'), secret('BITBUCKET_TOKEN', 'App password (read)')], setup: 'Personal settings, App passwords, Create, with Pull requests: Read.', setupUrl: 'https://bitbucket.org/account/settings/app-passwords/',
    async pull({ field }) { const r = await api<any>(`https://api.bitbucket.org/2.0/pullrequests/${encodeURIComponent(field('BITBUCKET_USER')!)}?state=OPEN`, { headers: basic(field('BITBUCKET_USER')!, field('BITBUCKET_TOKEN')) }); return updates('Bitbucket', r.values ?? [], p => ({ id: `bitbucket:${p.id}`, title: p.title, detail: `${p.destination?.repository?.full_name ?? ''} · open`, at: p.updated_on, url: p.links?.html?.href })); } },
  { id: 'vercel', name: 'Vercel', group: 'Code', mockOnly: true, reads: 'Deployments that failed today, and the latest ones.',
    fields: [secret('VERCEL_TOKEN', 'Access token')], setup: 'Account settings, Tokens, Create.', setupUrl: 'https://vercel.com/account/tokens',
    async pull({ field }) {
      const d = (await api<any>('https://api.vercel.com/v6/deployments?limit=15', { token: field('VERCEL_TOKEN') })).deployments ?? [];
      return { ...needs('Vercel', d.filter((x: any) => x.state === 'ERROR' && x.created > startOfToday()), x => ({ id: `vercel:${x.uid}`, title: `${x.name} deploy failed`, at: iso(x.created), url: `https://${x.url}` })), ...updates('Vercel', d.filter((x: any) => x.state === 'READY').slice(0, 4), x => ({ id: `vercel-ok:${x.uid}`, title: `${x.name} deployed`, at: iso(x.created), url: `https://${x.url}` })) };
    } },
  { id: 'netlify', name: 'Netlify', group: 'Code', mockOnly: true, reads: 'Your sites’ latest deploys and any that failed.',
    fields: [secret('NETLIFY_TOKEN', 'Personal access token')], setup: 'User settings, Applications, New access token.', setupUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
    async pull({ field }) { const r = await api<any[]>('https://api.netlify.com/api/v1/sites?filter=all&per_page=20', { token: field('NETLIFY_TOKEN') }); return updates('Netlify', r.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)), s => ({ id: `netlify:${s.id}`, title: s.name, detail: s.published_deploy?.state === 'error' ? 'Deploy failed' : 'Published', at: s.updated_at, url: s.admin_url })); } },
  { id: 'cloudflare', name: 'Cloudflare', group: 'Code', mockOnly: true, reads: 'Your zones and whether each is active.',
    fields: [secret('CLOUDFLARE_TOKEN', 'API token (read)')], setup: 'My Profile, API Tokens, Create Token from the Read all resources template.', setupUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    async pull({ field }) { const z = (await api<any>('https://api.cloudflare.com/client/v4/zones?per_page=20', { token: field('CLOUDFLARE_TOKEN') })).result ?? []; return { ...numbers('Cloudflare', [['Zones active', `${z.filter((x: any) => x.status === 'active').length} of ${z.length}`]]), ...needs('Cloudflare', z.filter((x: any) => x.status !== 'active' && !x.paused), x => ({ id: `cf:${x.id}`, title: `${x.name} is ${x.status}` })) }; } },
  { id: 'render', name: 'Render', group: 'Code', mockOnly: true, reads: 'Your services and any that are suspended.',
    fields: [secret('RENDER_KEY', 'API key')], setup: 'Account settings, API keys, Create API key.', setupUrl: 'https://dashboard.render.com/u/settings#api-keys',
    async pull({ field }) { const r = await api<any[]>('https://api.render.com/v1/services?limit=20', { token: field('RENDER_KEY') }); return updates('Render', r.map(x => x.service ?? x), s => ({ id: `render:${s.id}`, title: s.name, detail: s.suspended === 'suspended' ? 'Suspended' : s.type, at: s.updatedAt, url: s.dashboardUrl })); } },
  { id: 'fly', name: 'Fly.io', group: 'Code', mockOnly: true, reads: 'Your apps and machines.',
    fields: [secret('FLY_TOKEN', 'Access token'), plain('FLY_ORG', 'Organization', 'personal', true)], setup: 'Run fly tokens create readonly, or Dashboard, Tokens.', setupUrl: 'https://fly.io/docs/security/tokens/',
    async pull({ field }) { const r = await api<any>(`https://api.machines.dev/v1/apps?org_slug=${encodeURIComponent(field('FLY_ORG') || 'personal')}`, { token: field('FLY_TOKEN') }); return numbers('Fly.io', [['Apps', String(r.total_apps ?? (r.apps ?? []).length)], ['Machines', n((r.apps ?? []).reduce((a: number, x: any) => a + (x.machine_count ?? 0), 0))]]); } },
  { id: 'heroku', name: 'Heroku', group: 'Code', mockOnly: true, reads: 'Your apps, most recently released first.',
    fields: [secret('HEROKU_KEY', 'API key')], setup: 'Account settings, API Key, Reveal.', setupUrl: 'https://dashboard.heroku.com/account',
    async pull({ field }) { const r = await api<any[]>('https://api.heroku.com/apps', { token: field('HEROKU_KEY'), headers: { Accept: 'application/vnd.heroku+json; version=3' } }); return updates('Heroku', r.sort((a, b) => Date.parse(b.released_at) - Date.parse(a.released_at)), a => ({ id: `heroku:${a.id}`, title: a.name, detail: 'Released', at: a.released_at, url: a.web_url })); } },
  { id: 'digitalocean', name: 'DigitalOcean', group: 'Code', mockOnly: true, reads: 'Droplets running and this month’s bill so far.',
    fields: [secret('DO_TOKEN', 'Personal access token (read)')], setup: 'API, Tokens, Generate New Token with Read scope.', setupUrl: 'https://cloud.digitalocean.com/account/api/tokens',
    async pull({ field }) { const [d, b] = await Promise.all([api<any>('https://api.digitalocean.com/v2/droplets?per_page=50', { token: field('DO_TOKEN') }), api<any>('https://api.digitalocean.com/v2/customers/my/balance', { token: field('DO_TOKEN') }).catch(() => ({}))]); return numbers('DigitalOcean', [['Droplets', String((d.droplets ?? []).length)], ...(b.month_to_date_usage ? [['Spent this month', money(Number(b.month_to_date_usage))] as [string, string]] : [])]); } },
  { id: 'supabase', name: 'Supabase', group: 'Code', mockOnly: true, reads: 'Your projects and any that aren’t healthy.',
    fields: [secret('SUPABASE_TOKEN', 'Personal access token')], setup: 'Account, Access tokens, Generate new token.', setupUrl: 'https://supabase.com/dashboard/account/tokens',
    async pull({ field }) { const r = await api<any[]>('https://api.supabase.com/v1/projects', { token: field('SUPABASE_TOKEN') }); return { ...numbers('Supabase', [['Projects', String(r.length)]]), ...needs('Supabase', r.filter(p => p.status && !/ACTIVE_HEALTHY|INACTIVE/.test(p.status)), p => ({ id: `supabase:${p.id}`, title: `${p.name}: ${String(p.status).toLowerCase().replace(/_/g, ' ')}`, url: `https://supabase.com/dashboard/project/${p.id}` })) }; } },
  { id: 'neon', name: 'Neon', group: 'Code', mockOnly: true, reads: 'Your Postgres projects and their storage.',
    fields: [secret('NEON_KEY', 'API key')], setup: 'Account settings, API keys, Generate new API key.', setupUrl: 'https://console.neon.tech/app/settings/api-keys',
    async pull({ field }) { const p = (await api<any>('https://console.neon.tech/api/v2/projects', { token: field('NEON_KEY') })).projects ?? []; return numbers('Neon', [['Projects', String(p.length)], ['Storage', `${(p.reduce((a: number, x: any) => a + (x.synthetic_storage_size ?? 0), 0) / 1e9).toFixed(2)} GB`]]); } },
  { id: 'datadog', name: 'Datadog', group: 'Code', mockOnly: true, reads: 'Monitors that are alerting right now.',
    fields: [plain('DATADOG_SITE', 'Site', 'datadoghq.com', true), secret('DATADOG_API_KEY', 'API key'), secret('DATADOG_APP_KEY', 'Application key (read scopes)')], setup: 'Organization settings, API keys and Application keys.', setupUrl: 'https://app.datadoghq.com/organization-settings/api-keys',
    async pull({ field }) { const site = field('DATADOG_SITE') || 'datadoghq.com'; const r = await api<any[]>(`https://api.${site}/api/v1/monitor?group_states=alert`, { headers: { 'DD-API-KEY': field('DATADOG_API_KEY')!, 'DD-APPLICATION-KEY': field('DATADOG_APP_KEY')! } }); return needs('Datadog', r.filter(m => m.overall_state === 'Alert'), m => ({ id: `datadog:${m.id}`, title: m.name, detail: 'Alerting', url: `https://app.${site}/monitors/${m.id}` })); } },
  { id: 'grafana', name: 'Grafana', group: 'Code', mockOnly: true, reads: 'Alerts firing in your Grafana.',
    fields: [plain('GRAFANA_URL', 'Address'), secret('GRAFANA_TOKEN', 'Service account token (Viewer)')], setup: 'Administration, Service accounts, Add, role Viewer, Add token.', setupUrl: 'https://grafana.com/docs/grafana/latest/administration/service-accounts/',
    async pull({ field }) { const r = await api<any[]>(`${host(field('GRAFANA_URL'))}/api/alertmanager/grafana/api/v2/alerts?active=true&silenced=false`, { token: field('GRAFANA_TOKEN') }); return needs('Grafana', r, a => ({ id: `grafana:${a.fingerprint}`, title: a.labels?.alertname ?? 'Alert', detail: a.annotations?.summary, at: a.startsAt, url: a.generatorURL })); } },
  { id: 'betterstack', name: 'Better Stack', group: 'Code', mockOnly: true, reads: 'Monitors that are down.',
    fields: [secret('BETTERSTACK_TOKEN', 'Uptime API token')], setup: 'Uptime, Integrations, API tokens.', setupUrl: 'https://betterstack.com/docs/uptime/api/getting-started-with-uptime-api/',
    async pull({ field }) { const m = (await api<any>('https://uptime.betterstack.com/api/v2/monitors', { token: field('BETTERSTACK_TOKEN') })).data ?? []; return { ...numbers('Better Stack', [['Monitors up', `${m.filter((x: any) => x.attributes?.status === 'up').length} of ${m.length}`]]), ...needs('Better Stack', m.filter((x: any) => x.attributes?.status === 'down'), x => ({ id: `betterstack:${x.id}`, title: `${x.attributes.pronounceable_name ?? x.attributes.url} is down`, url: x.attributes.url })) }; } },
  { id: 'uptimerobot', name: 'UptimeRobot', group: 'Code', mockOnly: true, reads: 'Monitors that are down.',
    fields: [secret('UPTIMEROBOT_KEY', 'Read-only API key')], setup: 'Integrations and API, Read-only API key.', setupUrl: 'https://dashboard.uptimerobot.com/integrations',
    async pull({ field }) { const m = (await api<any>('https://api.uptimerobot.com/v2/getMonitors', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ api_key: field('UPTIMEROBOT_KEY')!, format: 'json' }) })).monitors ?? []; return { ...numbers('UptimeRobot', [['Monitors up', `${m.filter((x: any) => x.status === 2).length} of ${m.length}`]]), ...needs('UptimeRobot', m.filter((x: any) => x.status === 8 || x.status === 9), x => ({ id: `uptimerobot:${x.id}`, title: `${x.friendly_name} is down`, url: x.url })) }; } },
  { id: 'opsgenie', name: 'Opsgenie', group: 'Code', mockOnly: true, reads: 'Open alerts.',
    fields: [secret('OPSGENIE_KEY', 'API key (read)')], setup: 'Settings, API key management, Add new API key with Read access.', setupUrl: 'https://support.atlassian.com/opsgenie/docs/api-key-management/',
    async pull({ field }) { const r = await api<any>('https://api.opsgenie.com/v2/alerts?query=status%3Aopen&limit=15', { headers: { Authorization: `GenieKey ${field('OPSGENIE_KEY')}` } }); return needs('Opsgenie', r.data ?? [], a => ({ id: `opsgenie:${a.id}`, title: a.message, detail: a.priority, at: a.createdAt })); } },
  { id: 'incident-io', name: 'incident.io', group: 'Code', mockOnly: true, reads: 'Live incidents.',
    fields: [secret('INCIDENTIO_KEY', 'API key (view only)')], setup: 'Settings, API keys, Add new, with View data only.', setupUrl: 'https://app.incident.io/settings/api-keys',
    async pull({ field }) { const r = await api<any>('https://api.incident.io/v2/incidents?page_size=25&status_category[one_of]=live', { token: field('INCIDENTIO_KEY') }); return needs('incident.io', r.incidents ?? [], i => ({ id: `incidentio:${i.id}`, title: i.name, detail: i.severity?.name, at: i.created_at, url: i.permalink })); } },
  { id: 'circleci', name: 'CircleCI', group: 'Code', mockOnly: true, reads: 'Your latest pipelines.',
    fields: [secret('CIRCLECI_TOKEN', 'Personal API token'), plain('CIRCLECI_ORG', 'Org slug', 'gh/your-org')], setup: 'User settings, Personal API tokens, Create.', setupUrl: 'https://app.circleci.com/settings/user/tokens',
    async pull({ field }) { const r = await api<any>(`https://circleci.com/api/v2/pipeline/mine?org-slug=${encodeURIComponent(field('CIRCLECI_ORG')!)}`, { headers: { 'Circle-Token': field('CIRCLECI_TOKEN')! } }); return updates('CircleCI', r.items ?? [], p => ({ id: `circleci:${p.id}`, title: `${String(p.project_slug).split('/').pop()} #${p.number}`, detail: p.vcs?.commit?.subject ?? p.state, at: p.updated_at ?? p.created_at })); } },
  { id: 'buildkite', name: 'Buildkite', group: 'Code', mockOnly: true, reads: 'Builds that failed in the last day.',
    fields: [secret('BUILDKITE_TOKEN', 'API access token (read_builds)')], setup: 'Personal settings, API access tokens, New, with read_builds.', setupUrl: 'https://buildkite.com/user/api-access-tokens',
    async pull({ field }) { const r = await api<any[]>(`https://api.buildkite.com/v2/builds?state=failed&created_from=${encodeURIComponent(iso(ago(1)))}&per_page=10`, { token: field('BUILDKITE_TOKEN') }); return needs('Buildkite', r, b => ({ id: `buildkite:${b.id}`, title: `${b.pipeline?.name} #${b.number} failed`, detail: b.message, at: b.finished_at ?? b.created_at, url: b.web_url })); } },
  { id: 'npm', name: 'npm downloads', group: 'Numbers', mockOnly: true, reads: 'Last week’s downloads of the packages you name. Public numbers; no account.',
    fields: [plain('NPM_PACKAGES', 'Packages, comma separated', 'react, your-package')], setup: 'Type your package names. npm’s download counts are public.', setupUrl: 'https://github.com/npm/registry/blob/master/docs/download-counts.md',
    async pull({ field }) { const pk = list(field('NPM_PACKAGES')).slice(0, 6); const r = await Promise.all(pk.map(p => api<any>(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(p)}`).catch(() => undefined))); return numbers('npm', r.flatMap((x, i) => x ? [[`${pk[i]}, 7 days`, n(x.downloads)] as [string, string]] : [])); } },
  { id: 'pypi', name: 'PyPI downloads', group: 'Numbers', mockOnly: true, reads: 'Last week’s downloads of the Python packages you name. Public numbers.',
    fields: [plain('PYPI_PACKAGES', 'Packages, comma separated', 'requests')], setup: 'Type your package names. Numbers come from pypistats.org.', setupUrl: 'https://pypistats.org/api/',
    async pull({ field }) { const pk = list(field('PYPI_PACKAGES')).slice(0, 6); const r = await Promise.all(pk.map(p => api<any>(`https://pypistats.org/api/packages/${encodeURIComponent(p.toLowerCase())}/recent`).catch(() => undefined))); return numbers('PyPI', r.flatMap((x, i) => x ? [[`${pk[i]}, 7 days`, n(x.data?.last_week ?? 0)] as [string, string]] : [])); } },
  { id: 'huggingface', name: 'Hugging Face', group: 'Numbers', mockOnly: true, reads: 'Downloads and likes of your models. Public numbers.',
    fields: [plain('HF_AUTHOR', 'Your username or org')], setup: 'Type your Hugging Face username. Model numbers are public.', setupUrl: 'https://huggingface.co/docs/hub/api',
    async pull({ field }) { const r = await api<any[]>(`https://huggingface.co/api/models?author=${encodeURIComponent(field('HF_AUTHOR')!)}&sort=downloads&limit=20`); return numbers('Hugging Face', [['Model downloads, 30 days', n(r.reduce((a, m) => a + (m.downloads ?? 0), 0))], ['Likes', n(r.reduce((a, m) => a + (m.likes ?? 0), 0))]]); } },
];

const growth: Def[] = [
  { id: 'pipedrive', name: 'Pipedrive', group: 'Sales', mockOnly: true, reads: 'Open deals: pipeline value and what closes this week.',
    fields: [secret('PIPEDRIVE_TOKEN', 'API token')], setup: 'Personal preferences, API, copy your token.', setupUrl: 'https://app.pipedrive.com/settings/api',
    async pull({ field }) { const d = (await api<any>(`https://api.pipedrive.com/v1/deals?status=open&limit=200&api_token=${encodeURIComponent(field('PIPEDRIVE_TOKEN')!)}`)).data ?? []; const week = day(Date.now() + 7 * DAY); return numbers('Pipedrive', [['Open pipeline', money(d.reduce((a: number, x: any) => a + (x.value ?? 0), 0), d[0]?.currency ?? 'USD')], ['Closing this week', String(d.filter((x: any) => x.expected_close_date && x.expected_close_date <= week).length)]]); } },
  { id: 'close', name: 'Close', group: 'Sales', mockOnly: true, reads: 'Active opportunities and their value.',
    fields: [secret('CLOSE_KEY', 'API key')], setup: 'Settings, Developer, API keys, New API key.', setupUrl: 'https://app.close.com/settings/developer/',
    async pull({ field }) { const o = (await api<any>('https://api.close.com/api/v1/opportunity/?status_type=active&_limit=200', { headers: basic(field('CLOSE_KEY')!) })).data ?? []; return numbers('Close', [['Active opportunities', String(o.length)], ['Pipeline value', money(o.reduce((a: number, x: any) => a + (x.value ?? 0), 0) / 100)]]); } },
  { id: 'attio', name: 'Attio', group: 'Sales', mockOnly: true, reads: 'How many deals are in your workspace.',
    fields: [secret('ATTIO_TOKEN', 'Access token (read)')], setup: 'Workspace settings, Developers, New access token with Record read.', setupUrl: 'https://developers.attio.com/docs/authentication',
    async pull({ field }) { const r = await api<any>('https://api.attio.com/v2/objects/deals/records/query', { method: 'POST', token: field('ATTIO_TOKEN'), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 200 }) }); return numbers('Attio', [['Deals', String((r.data ?? []).length)]]); } },
  { id: 'typeform', name: 'Typeform', group: 'Sales', mockOnly: true, reads: 'New responses to your forms this week.',
    fields: [secret('TYPEFORM_TOKEN', 'Personal token')], setup: 'Account, Personal tokens, Generate a new token with Responses: read and Forms: read.', setupUrl: 'https://admin.typeform.com/user/tokens',
    async pull({ field }) {
      const forms = (await api<any>('https://api.typeform.com/forms?page_size=10', { token: field('TYPEFORM_TOKEN') })).items ?? [];
      const counts = await Promise.all(forms.map((f: any) => api<any>(`https://api.typeform.com/forms/${f.id}/responses?since=${encodeURIComponent(iso(ago(7)))}&page_size=1`, { token: field('TYPEFORM_TOKEN') }).then(r => r.total_items ?? 0).catch(() => 0)));
      return numbers('Typeform', [['Form responses, 7 days', n(counts.reduce((a: number, b: number) => a + b, 0))]]);
    } },
  { id: 'jotform', name: 'Jotform', group: 'Sales', mockOnly: true, reads: 'Newest form submissions.',
    fields: [secret('JOTFORM_KEY', 'API key (read)')], setup: 'Settings, API, Create new key with Read access.', setupUrl: 'https://www.jotform.com/myaccount/api',
    async pull({ field }) { const r = await api<any>(`https://api.jotform.com/user/submissions?limit=8&orderby=created_at&apiKey=${encodeURIComponent(field('JOTFORM_KEY')!)}`); return updates('Jotform', r.content ?? [], s => ({ id: `jotform:${s.id}`, title: 'New form submission', at: s.created_at })); } },
  { id: 'surveymonkey', name: 'SurveyMonkey', group: 'Sales', mockOnly: true, reads: 'Responses to your surveys.',
    fields: [secret('SURVEYMONKEY_TOKEN', 'Access token')], setup: 'Create a private app in the developer portal and copy its access token.', setupUrl: 'https://developer.surveymonkey.com/apps/',
    async pull({ field }) { const r = await api<any>('https://api.surveymonkey.com/v3/surveys?include=response_count&per_page=20', { token: field('SURVEYMONKEY_TOKEN') }); return numbers('SurveyMonkey', [['Survey responses', n((r.data ?? []).reduce((a: number, s: any) => a + (s.response_count ?? 0), 0))]]); } },
  { id: 'canny', name: 'Canny', group: 'Sales', mockOnly: true, reads: 'Newest feedback posts from your users.',
    fields: [secret('CANNY_KEY', 'API key')], setup: 'Settings, API, copy the secret key.', setupUrl: 'https://developers.canny.io/api-reference',
    async pull({ field }) { const r = await api<any>('https://canny.io/api/v1/posts/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: field('CANNY_KEY'), limit: 8, sort: 'newest' }) }); return updates('Canny', r.posts ?? [], p => ({ id: `canny:${p.id}`, title: p.title, detail: `${p.score ?? 0} votes`, at: p.created, url: p.url })); } },
  { id: 'productboard', name: 'Productboard', group: 'Sales', mockOnly: true, reads: 'Newest customer notes in your insights inbox.',
    fields: [secret('PRODUCTBOARD_TOKEN', 'Public API token')], setup: 'Workspace settings, Integrations, Public API, Generate token.', setupUrl: 'https://developer.productboard.com/',
    async pull({ field }) { const r = await api<any>('https://api.productboard.com/notes?pageLimit=8', { token: field('PRODUCTBOARD_TOKEN'), headers: { 'X-Version': '1' } }); return updates('Productboard', r.data ?? [], x => ({ id: `productboard:${x.id}`, title: x.title, detail: 'Customer note', at: x.createdAt, url: x.displayUrl })); } },
  { id: 'mailchimp', name: 'Mailchimp', group: 'Numbers', mockOnly: true, reads: 'Audience size and your last campaign’s open rate.',
    fields: [secret('MAILCHIMP_KEY', 'API key', 'abc123-us21')], setup: 'Profile, Extras, API keys, Create A Key.', setupUrl: 'https://us1.admin.mailchimp.com/account/api/',
    async pull({ field }) {
      const key = field('MAILCHIMP_KEY')!, dc = key.split('-').pop(), h = basic('oxbot', key);
      const [lists, camps] = await Promise.all([api<any>(`https://${dc}.api.mailchimp.com/3.0/lists?count=10`, { headers: h }), api<any>(`https://${dc}.api.mailchimp.com/3.0/campaigns?status=sent&sort_field=send_time&sort_dir=DESC&count=1`, { headers: h })]);
      const last = camps.campaigns?.[0];
      return numbers('Mailchimp', [['Subscribers', n((lists.lists ?? []).reduce((a: number, l: any) => a + (l.stats?.member_count ?? 0), 0))], ...(last ? [['Last open rate', `${Math.round((last.report_summary?.open_rate ?? 0) * 100)}%`] as [string, string]] : [])]);
    } },
  { id: 'kit', name: 'Kit (ConvertKit)', group: 'Numbers', mockOnly: true, reads: 'Your subscriber count.',
    fields: [secret('KIT_SECRET', 'API secret')], setup: 'Settings, Developer, API secret.', setupUrl: 'https://app.kit.com/account_settings/developer_settings',
    async pull({ field }) { const r = await api<any>(`https://api.convertkit.com/v3/subscribers?api_secret=${encodeURIComponent(field('KIT_SECRET')!)}`); return numbers('Kit', [['Subscribers', n(r.total_subscribers ?? 0)]]); } },
  { id: 'beehiiv', name: 'beehiiv', group: 'Numbers', mockOnly: true, reads: 'Subscribers and open rate of your newsletter.',
    fields: [secret('BEEHIIV_KEY', 'API key')], setup: 'Settings, Integrations, API, Create new API key.', setupUrl: 'https://developers.beehiiv.com/',
    async pull({ field }) { const p = (await api<any>('https://api.beehiiv.com/v2/publications?expand[]=stats', { token: field('BEEHIIV_KEY') })).data?.[0]; return p ? numbers('beehiiv', [['Subscribers', n(p.stats?.active_subscriptions ?? 0)], ['Open rate', `${Math.round(p.stats?.average_open_rate ?? 0)}%`]]) : {}; } },
  { id: 'buttondown', name: 'Buttondown', group: 'Numbers', mockOnly: true, reads: 'Your newsletter’s subscriber count.',
    fields: [secret('BUTTONDOWN_KEY', 'API key')], setup: 'Settings, Programming, API key.', setupUrl: 'https://buttondown.com/settings/programming',
    async pull({ field }) { const r = await api<any>('https://api.buttondown.com/v1/subscribers?type=regular', { headers: { Authorization: `Token ${field('BUTTONDOWN_KEY')}` } }); return numbers('Buttondown', [['Subscribers', n(r.count ?? 0)]]); } },
  { id: 'ghost', name: 'Ghost', group: 'Feeds', mockOnly: true, reads: 'Your latest published posts.',
    fields: [plain('GHOST_URL', 'Site address'), secret('GHOST_CONTENT_KEY', 'Content API key')], setup: 'Settings, Integrations, Add custom integration, copy the Content API key.', setupUrl: 'https://ghost.org/docs/content-api/',
    async pull({ field }) { const r = await api<any>(`${host(field('GHOST_URL'))}/ghost/api/content/posts/?limit=6&key=${encodeURIComponent(field('GHOST_CONTENT_KEY')!)}`); return updates('Ghost', r.posts ?? [], p => ({ id: `ghost:${p.id}`, title: p.title, detail: 'Published', at: p.published_at, url: p.url })); } },
  { id: 'wordpress', name: 'WordPress', group: 'Feeds', mockOnly: true, reads: 'The latest posts on your WordPress site. Public; no account.',
    fields: [plain('WORDPRESS_URL', 'Site address')], setup: 'Type your site’s address. Published posts are public through its REST API.', setupUrl: 'https://developer.wordpress.org/rest-api/',
    async pull({ field }) { const r = await api<any[]>(`${host(field('WORDPRESS_URL'))}/wp-json/wp/v2/posts?per_page=6&_fields=id,title,date_gmt,link`); return updates('WordPress', r, p => ({ id: `wp:${p.id}`, title: stripTags(p.title?.rendered), at: `${p.date_gmt}Z`, url: p.link })); } },
  { id: 'webflow', name: 'Webflow', group: 'Feeds', mockOnly: true, reads: 'Your sites and when each was last published.',
    fields: [secret('WEBFLOW_TOKEN', 'Site token (read)')], setup: 'Site settings, Apps and integrations, API access, Generate API token with read scopes.', setupUrl: 'https://developers.webflow.com/data/reference/authentication',
    async pull({ field }) { const r = await api<any>('https://api.webflow.com/v2/sites', { token: field('WEBFLOW_TOKEN') }); return updates('Webflow', r.sites ?? [], s => ({ id: `webflow:${s.id}`, title: s.displayName, detail: 'Published', at: s.lastPublished })); } },
  { id: 'plausible', name: 'Plausible', group: 'Numbers', mockOnly: true, reads: 'Visitors and pageviews for the last seven days.',
    fields: [plain('PLAUSIBLE_SITE', 'Site', 'example.com'), secret('PLAUSIBLE_KEY', 'Stats API key'), plain('PLAUSIBLE_URL', 'Address if self-hosted', 'https://plausible.io', true)], setup: 'Account settings, API keys, New API key (Stats API).', setupUrl: 'https://plausible.io/settings/api-keys',
    async pull({ field }) { const v = (await api<any>(`${host(field('PLAUSIBLE_URL') || 'https://plausible.io')}/api/v1/stats/aggregate?site_id=${encodeURIComponent(field('PLAUSIBLE_SITE')!)}&period=7d&metrics=visitors,pageviews&compare=previous_period`, { token: field('PLAUSIBLE_KEY') })).results ?? {}; return numbers('Plausible', [['Visitors, 7 days', n(v.visitors?.value ?? 0), v.visitors?.change != null ? `${v.visitors.change > 0 ? '+' : ''}${v.visitors.change}%` : undefined], ['Pageviews, 7 days', n(v.pageviews?.value ?? 0)]]); } },
  { id: 'fathom-analytics', name: 'Fathom Analytics', group: 'Numbers', mockOnly: true, reads: 'Visits and pageviews for the last seven days.',
    fields: [plain('FATHOM_SITE', 'Site ID'), secret('FATHOM_KEY', 'API key')], setup: 'Settings, API, Create new (site read access).', setupUrl: 'https://app.usefathom.com/api',
    async pull({ field }) { const r = await api<any[]>(`https://api.usefathom.com/v1/aggregations?entity=pageview&entity_id=${encodeURIComponent(field('FATHOM_SITE')!)}&aggregates=visits,pageviews&date_from=${day(ago(7))}`, { token: field('FATHOM_KEY') }); return numbers('Fathom', [['Visits, 7 days', n(Number(r[0]?.visits ?? 0))], ['Pageviews, 7 days', n(Number(r[0]?.pageviews ?? 0))]]); } },
  { id: 'simple-analytics', name: 'Simple Analytics', group: 'Numbers', mockOnly: true, reads: 'Visitors and pageviews for the last seven days.',
    fields: [plain('SA_SITE', 'Site', 'example.com'), secret('SA_KEY', 'API key')], setup: 'Account, API keys, Create.', setupUrl: 'https://docs.simpleanalytics.com/api',
    async pull({ field }) { const r = await api<any>(`https://simpleanalytics.com/${encodeURIComponent(field('SA_SITE')!)}.json?version=5&fields=pageviews,visitors&start=${day(ago(7))}`, { headers: { 'Api-Key': field('SA_KEY')! } }); return numbers('Simple Analytics', [['Visitors, 7 days', n(r.visitors ?? 0)], ['Pageviews, 7 days', n(r.pageviews ?? 0)]]); } },
  { id: 'umami', name: 'Umami', group: 'Numbers', mockOnly: true, reads: 'Visitors and pageviews for the last seven days.',
    fields: [plain('UMAMI_URL', 'Address', 'https://api.umami.is'), plain('UMAMI_SITE', 'Website ID'), secret('UMAMI_KEY', 'API key')], setup: 'Umami Cloud: Settings, API keys.', setupUrl: 'https://umami.is/docs/api',
    async pull({ field }) { const r = await api<any>(`${host(field('UMAMI_URL'))}/v1/websites/${field('UMAMI_SITE')}/stats?startAt=${ago(7)}&endAt=${Date.now()}`, { headers: { 'x-umami-api-key': field('UMAMI_KEY')! } }); const v = (x: any) => typeof x === 'object' ? x?.value : x; return numbers('Umami', [['Visitors, 7 days', n(v(r.visitors) ?? 0)], ['Pageviews, 7 days', n(v(r.pageviews) ?? 0)]]); } },
  { id: 'posthog', name: 'PostHog', group: 'Numbers', mockOnly: true, reads: 'Events and people active in the last seven days.',
    fields: [plain('POSTHOG_URL', 'Address', 'https://us.posthog.com'), plain('POSTHOG_PROJECT', 'Project ID'), secret('POSTHOG_KEY', 'Personal API key (query read)')], setup: 'Settings, Personal API keys, with Query: Read.', setupUrl: 'https://posthog.com/docs/api',
    async pull({ field }) { const r = await api<any>(`${host(field('POSTHOG_URL'))}/api/projects/${field('POSTHOG_PROJECT')}/query/`, { method: 'POST', token: field('POSTHOG_KEY'), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: { kind: 'HogQLQuery', query: 'select count(), count(distinct person_id) from events where timestamp > now() - interval 7 day' } }) }); const [events, people] = r.results?.[0] ?? [0, 0]; return numbers('PostHog', [['Active people, 7 days', n(people)], ['Events, 7 days', n(events)]]); } },
  { id: 'amplitude', name: 'Amplitude', group: 'Numbers', mockOnly: true, reads: 'Active users yesterday.',
    fields: [plain('AMPLITUDE_KEY', 'API key'), secret('AMPLITUDE_SECRET', 'Secret key')], setup: 'Organization settings, Projects, your project, API key and Secret key.', setupUrl: 'https://amplitude.com/docs/apis/analytics/dashboard-rest',
    async pull({ field }) { const d = day(ago(1)).replace(/-/g, ''); const r = await api<any>(`https://amplitude.com/api/2/users?start=${d}&end=${d}`, { headers: basic(field('AMPLITUDE_KEY')!, field('AMPLITUDE_SECRET')) }); return numbers('Amplitude', [['Active users yesterday', n(r.data?.series?.[0]?.[0] ?? 0)]]); } },
];

const moneyDefs: Def[] = [
  { id: 'paddle', name: 'Paddle', group: 'Money', mockOnly: true, reads: 'Completed transactions in the last seven days.',
    fields: [secret('PADDLE_KEY', 'API key (read)')], setup: 'Developer tools, Authentication, New API key with read permissions.', setupUrl: 'https://developer.paddle.com/api-reference/about/authentication',
    async pull({ field }) { const t = (await api<any>(`https://api.paddle.com/transactions?status=completed&billed_at[GTE]=${encodeURIComponent(iso(ago(7)))}&per_page=200`, { token: field('PADDLE_KEY') })).data ?? []; return numbers('Paddle', [['Sales, 7 days', money(t.reduce((a: number, x: any) => a + Number(x.details?.totals?.grand_total ?? 0), 0) / 100, t[0]?.currency_code ?? 'USD'), `${t.length} orders`]]); } },
  { id: 'lemonsqueezy', name: 'Lemon Squeezy', group: 'Money', mockOnly: true, reads: 'Orders and revenue in the last seven days.',
    fields: [secret('LEMONSQUEEZY_KEY', 'API key')], setup: 'Settings, API, Create API key.', setupUrl: 'https://app.lemonsqueezy.com/settings/api',
    async pull({ field }) { const o = ((await api<any>('https://api.lemonsqueezy.com/v1/orders?page[size]=100&sort=-createdAt', { token: field('LEMONSQUEEZY_KEY'), headers: { Accept: 'application/vnd.api+json' } })).data ?? []).filter((x: any) => Date.parse(x.attributes?.created_at) > ago(7) && x.attributes?.status === 'paid'); return numbers('Lemon Squeezy', [['Sales, 7 days', money(o.reduce((a: number, x: any) => a + (x.attributes?.total_usd ?? 0), 0) / 100), `${o.length} orders`]]); } },
  { id: 'gumroad', name: 'Gumroad', group: 'Money', mockOnly: true, reads: 'Sales in the last seven days.',
    fields: [secret('GUMROAD_TOKEN', 'Access token')], setup: 'Settings, Advanced, Applications, Create application, Generate access token.', setupUrl: 'https://app.gumroad.com/settings/advanced',
    async pull({ field }) { const s = (await api<any>(`https://api.gumroad.com/v2/sales?after=${day(ago(7))}&access_token=${encodeURIComponent(field('GUMROAD_TOKEN')!)}`)).sales ?? []; return numbers('Gumroad', [['Sales, 7 days', money(s.reduce((a: number, x: any) => a + (x.price ?? 0), 0) / 100), `${s.length} sales`]]); } },
  { id: 'chargebee', name: 'Chargebee', group: 'Money', mockOnly: true, reads: 'Active subscriptions and their monthly revenue.',
    fields: [plain('CHARGEBEE_SITE', 'Site', 'yourcompany'), secret('CHARGEBEE_KEY', 'Read-only API key')], setup: 'Settings, Configure Chargebee, API keys, Add API key, Read-only key.', setupUrl: 'https://www.chargebee.com/docs/2.0/api_keys.html',
    async pull({ field }) { const r = await api<any>(`https://${field('CHARGEBEE_SITE')}.chargebee.com/api/v2/subscriptions?status[is]=active&limit=100`, { headers: basic(field('CHARGEBEE_KEY')!) }); const s = r.list ?? []; return numbers('Chargebee', [['Active subscriptions', `${s.length}${r.next_offset ? '+' : ''}`], ['MRR', money(s.reduce((a: number, x: any) => a + (x.subscription?.mrr ?? 0), 0) / 100)]]); } },
  { id: 'square', name: 'Square', group: 'Money', mockOnly: true, reads: 'Payments taken today and in the last seven days.',
    fields: [secret('SQUARE_TOKEN', 'Access token')], setup: 'Developer dashboard, your app, Credentials, Production access token.', setupUrl: 'https://developer.squareup.com/apps',
    async pull({ field }) { const p = ((await api<any>(`https://connect.squareup.com/v2/payments?begin_time=${encodeURIComponent(iso(ago(7)))}&limit=100`, { token: field('SQUARE_TOKEN'), headers: { 'Square-Version': '2025-10-16' } })).payments ?? []).filter((x: any) => x.status === 'COMPLETED'); const sum = (l: any[]) => l.reduce((a, x) => a + (x.amount_money?.amount ?? 0), 0) / 100; return numbers('Square', [['Taken today', money(sum(p.filter((x: any) => Date.parse(x.created_at) >= startOfToday())))], ['Taken, 7 days', money(sum(p))]]); } },
  { id: 'woocommerce', name: 'WooCommerce', group: 'Money', mockOnly: true, reads: 'Orders and sales in the last seven days.',
    fields: [plain('WOO_URL', 'Store address'), plain('WOO_KEY', 'Consumer key'), secret('WOO_SECRET', 'Consumer secret')], setup: 'WooCommerce, Settings, Advanced, REST API, Add key with Read permission.', setupUrl: 'https://woocommerce.com/document/woocommerce-rest-api/',
    async pull({ field }) { const r = await api<any[]>(`${host(field('WOO_URL'))}/wp-json/wc/v3/orders?after=${encodeURIComponent(iso(ago(7)))}&per_page=100&status=completed,processing`, { headers: basic(field('WOO_KEY')!, field('WOO_SECRET')) }); return numbers('WooCommerce', [['Sales, 7 days', money(r.reduce((a, o) => a + Number(o.total ?? 0), 0), r[0]?.currency ?? 'USD'), `${r.length} orders`]]); } },
  { id: 'bigcommerce', name: 'BigCommerce', group: 'Money', mockOnly: true, reads: 'Orders and sales in the last seven days.',
    fields: [plain('BIGCOMMERCE_STORE', 'Store hash'), secret('BIGCOMMERCE_TOKEN', 'Access token (Orders read-only)')], setup: 'Settings, API accounts, Create API account, Orders: read-only.', setupUrl: 'https://developer.bigcommerce.com/docs/start/authentication/api-accounts',
    async pull({ field }) { const r = await api<any[]>(`https://api.bigcommerce.com/stores/${field('BIGCOMMERCE_STORE')}/v2/orders?min_date_created=${encodeURIComponent(new Date(ago(7)).toUTCString())}&limit=250`, { headers: { 'X-Auth-Token': field('BIGCOMMERCE_TOKEN')! } }); const o = Array.isArray(r) ? r : []; return numbers('BigCommerce', [['Sales, 7 days', money(o.reduce((a, x) => a + Number(x.total_inc_tax ?? 0), 0)), `${o.length} orders`]]); } },
  { id: 'wise', name: 'Wise', group: 'Money', mockOnly: true, reads: 'Your balances in each currency.',
    fields: [secret('WISE_TOKEN', 'Personal API token (read only)')], setup: 'Settings, Integrations and tools, API tokens, Add new token, Read only.', setupUrl: 'https://wise.com/settings/api-tokens',
    async pull({ field }) {
      const profiles = await api<any[]>('https://api.wise.com/v2/profiles', { token: field('WISE_TOKEN') });
      const p = profiles.find(x => /business/i.test(x.type)) ?? profiles[0];
      const b = await api<any[]>(`https://api.wise.com/v4/profiles/${p.id}/balances?types=STANDARD`, { token: field('WISE_TOKEN') });
      return numbers('Wise', b.filter(x => x.amount?.value).slice(0, 4).map(x => [`Wise ${x.currency}`, money(x.amount.value, x.currency)] as [string, string]));
    } },
  { id: 'brex', name: 'Brex', group: 'Money', mockOnly: true, reads: 'Cash account balances.',
    fields: [secret('BREX_TOKEN', 'User token (read)')], setup: 'Developer, Create token, with Accounts: read.', setupUrl: 'https://developer.brex.com/docs/authentication/',
    async pull({ field }) { const r = await api<any>('https://platform.brexapis.com/v2/accounts/cash', { token: field('BREX_TOKEN') }); return numbers('Brex', (r.items ?? []).slice(0, 3).map((a: any) => [`Brex ${a.name ?? 'cash'}`, money((a.current_balance?.amount ?? 0) / 100, a.current_balance?.currency ?? 'USD')] as [string, string])); } },
  { id: 'coingecko', name: 'Crypto prices (CoinGecko)', group: 'Money', mockOnly: true, reads: 'Prices and 24-hour change of the coins you name. Public; no account.',
    fields: [plain('COINGECKO_COINS', 'Coins, comma separated', 'bitcoin, ethereum, solana')], setup: 'Type CoinGecko coin ids (the name in the coin page’s address).', setupUrl: 'https://www.coingecko.com/en/api',
    async pull({ field }) { const ids = list(field('COINGECKO_COINS')).slice(0, 6).map(s => s.toLowerCase()); const r = await api<any>(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd&include_24hr_change=true`); return numbers('CoinGecko', ids.filter(i => r[i]).map(i => [i.charAt(0).toUpperCase() + i.slice(1), money(r[i].usd), `${r[i].usd_24h_change >= 0 ? '+' : ''}${Number(r[i].usd_24h_change).toFixed(1)}%`] as [string, string, string])); } },
  { id: 'exchange-rates', name: 'Exchange rates', group: 'Money', mockOnly: true, reads: 'Today’s rates for the currencies you name, from the European Central Bank. Public.',
    fields: [plain('FX_BASE', 'From', 'USD'), plain('FX_TO', 'To, comma separated', 'EUR, GBP, INR')], setup: 'Type currency codes. Rates come from frankfurter.app (ECB data).', setupUrl: 'https://frankfurter.dev/',
    async pull({ field }) { const base = (field('FX_BASE') || 'USD').toUpperCase(); const r = await api<any>(`https://api.frankfurter.app/latest?from=${base}&to=${list(field('FX_TO')).map(s => s.toUpperCase()).join(',')}`); return numbers('ECB', Object.entries<number>(r.rates ?? {}).map(([k, v]) => [`${base} to ${k}`, v.toFixed(v < 10 ? 4 : 2)] as [string, string])); } },
  { id: 'aftership', name: 'AfterShip', group: 'Money', mockOnly: true, reads: 'Packages out for delivery or held up.',
    fields: [secret('AFTERSHIP_KEY', 'API key')], setup: 'Settings, API keys, Generate API key.', setupUrl: 'https://admin.aftership.com/settings/api-keys',
    async pull({ field }) { const r = await api<any>('https://api.aftership.com/tracking/2024-04/trackings?limit=20', { headers: { 'as-api-key': field('AFTERSHIP_KEY')! } }); return needs('AfterShip', (r.data?.trackings ?? []).filter((t: any) => /OutForDelivery|Exception|AttemptFail|AvailableForPickup/.test(t.tag)), t => ({ id: `aftership:${t.id}`, title: t.title || t.tracking_number, detail: String(t.tag).replace(/([a-z])([A-Z])/g, '$1 $2'), at: t.updated_at })); } },
];

const people: Def[] = [
  { id: 'greenhouse', name: 'Greenhouse', group: 'Sales', mockOnly: true, reads: 'New applications this week.',
    fields: [secret('GREENHOUSE_KEY', 'Harvest API key (read)')], setup: 'Configure, Dev Center, API credential management, Create new, Harvest, with GET on Applications.', setupUrl: 'https://developers.greenhouse.io/harvest.html',
    async pull({ field }) { const r = await api<any[]>(`https://harvest.greenhouse.io/v1/applications?status=active&per_page=500&created_after=${encodeURIComponent(iso(ago(7)))}`, { headers: basic(field('GREENHOUSE_KEY')!) }); return numbers('Greenhouse', [['New applications, 7 days', n(r.length)]]); } },
  { id: 'lever', name: 'Lever', group: 'Sales', mockOnly: true, reads: 'Candidates added this week.',
    fields: [secret('LEVER_KEY', 'API key (read)')], setup: 'Settings, Integrations and API, API credentials, Generate new key with read endpoints.', setupUrl: 'https://hire.lever.co/developer/documentation',
    async pull({ field }) { const r = await api<any>(`https://api.lever.co/v1/opportunities?created_at_start=${ago(7)}&limit=100`, { headers: basic(field('LEVER_KEY')!) }); return numbers('Lever', [['New candidates, 7 days', `${(r.data ?? []).length}${r.hasNext ? '+' : ''}`]]); } },
  { id: 'ashby', name: 'Ashby', group: 'Sales', mockOnly: true, reads: 'Active applications.',
    fields: [secret('ASHBY_KEY', 'API key (read)')], setup: 'Admin, Integrations, API keys, New, with Candidates read.', setupUrl: 'https://developers.ashbyhq.com/',
    async pull({ field }) { const r = await api<any>('https://api.ashbyhq.com/application.list', { method: 'POST', headers: { ...basic(field('ASHBY_KEY')!), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Active', limit: 100 }) }); return numbers('Ashby', [['Active applications', `${(r.results ?? []).length}${r.moreDataAvailable ? '+' : ''}`]]); } },
  { id: 'workable', name: 'Workable', group: 'Sales', mockOnly: true, reads: 'Candidates who applied in the last seven days.',
    fields: [plain('WORKABLE_SUBDOMAIN', 'Subdomain'), secret('WORKABLE_TOKEN', 'Access token (r_candidates)')], setup: 'Settings, Integrations, Generate API token with r_jobs and r_candidates.', setupUrl: 'https://workable.readme.io/reference/generate-an-access-token',
    async pull({ field }) { const r = await api<any>(`https://${field('WORKABLE_SUBDOMAIN')}.workable.com/spi/v3/candidates?created_after=${encodeURIComponent(iso(ago(7)))}&limit=100`, { token: field('WORKABLE_TOKEN') }); return numbers('Workable', [['New candidates, 7 days', n((r.candidates ?? []).length)]]); } },
  { id: 'bamboohr', name: 'BambooHR', group: 'Calendar', mockOnly: true, reads: 'Who’s out this week.',
    fields: [plain('BAMBOO_SUBDOMAIN', 'Company subdomain'), secret('BAMBOO_KEY', 'API key')], setup: 'Your name (top right), API keys, Add new key.', setupUrl: 'https://documentation.bamboohr.com/docs/getting-started',
    async pull({ field }) { const r = await api<any[]>(`https://api.bamboohr.com/api/gateway.php/${field('BAMBOO_SUBDOMAIN')}/v1/time_off/whos_out/?end=${day(Date.now() + 7 * DAY)}`, { headers: basic(field('BAMBOO_KEY')!, 'x') }); return updates('BambooHR', r, w => ({ id: `bamboo:${w.id}`, title: `${w.name} out`, detail: `${w.start} to ${w.end}`, at: `${w.start}T09:00:00` })); } },
  { id: 'deel', name: 'Deel', group: 'Money', mockOnly: true, reads: 'Active contracts on your team.',
    fields: [secret('DEEL_TOKEN', 'API token (read)')], setup: 'Apps and integrations, Developer center, Generate new token with contracts:read.', setupUrl: 'https://developer.deel.com/docs/api-tokens-1',
    async pull({ field }) { const r = await api<any>('https://api.letsdeel.com/rest/v2/contracts?statuses[]=in_progress&limit=100', { token: field('DEEL_TOKEN') }); return numbers('Deel', [['Active contracts', n(r.page?.total_rows ?? (r.data ?? []).length)]]); } },
];

const social: Def[] = [
  { id: 'youtube', name: 'YouTube channel', group: 'Media', mockOnly: true, reads: 'Your channel’s subscribers and views.',
    fields: [plain('YOUTUBE_CHANNEL', 'Channel ID', 'UC…'), secret('YOUTUBE_KEY', 'Google API key (YouTube Data API)')], setup: 'Google Cloud, enable YouTube Data API v3, Credentials, Create API key.', setupUrl: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
    async pull({ field }) { const s = (await api<any>(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(field('YOUTUBE_CHANNEL')!)}&key=${encodeURIComponent(field('YOUTUBE_KEY')!)}`)).items?.[0]?.statistics ?? {}; return numbers('YouTube', [['Subscribers', n(Number(s.subscriberCount ?? 0))], ['Channel views', n(Number(s.viewCount ?? 0))]]); } },
  { id: 'bluesky', name: 'Bluesky', group: 'Media', mockOnly: true, reads: 'Your followers and latest posts. Public; no password.',
    fields: [plain('BLUESKY_HANDLE', 'Handle', 'you.bsky.social')], setup: 'Type your handle. Profiles and posts are public.', setupUrl: 'https://docs.bsky.app/',
    async pull({ field }) { const h = encodeURIComponent(field('BLUESKY_HANDLE')!.replace(/^@/, '')); const [p, f] = await Promise.all([api<any>(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${h}`), api<any>(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${h}&limit=5&filter=posts_no_replies`)]); return { ...numbers('Bluesky', [['Bluesky followers', n(p.followersCount ?? 0)]]), ...updates('Bluesky', f.feed ?? [], x => ({ id: `bsky:${x.post?.cid}`, title: String(x.post?.record?.text ?? '').slice(0, 140), detail: `${x.post?.likeCount ?? 0} likes`, at: x.post?.indexedAt })) }; } },
  { id: 'mastodon', name: 'Mastodon', group: 'Media', mockOnly: true, reads: 'Your newest mentions.',
    fields: [plain('MASTODON_URL', 'Server', 'https://mastodon.social'), secret('MASTODON_TOKEN', 'Access token (read:notifications)')], setup: 'Preferences, Development, New application, scope read:notifications, then copy the access token.', setupUrl: 'https://docs.joinmastodon.org/client/token/',
    async pull({ field }) { const r = await api<any[]>(`${host(field('MASTODON_URL'))}/api/v1/notifications?limit=10&types[]=mention`, { token: field('MASTODON_TOKEN') }); return updates('Mastodon', r, x => ({ id: `mastodon:${x.id}`, title: stripTags(x.status?.content ?? '').slice(0, 140), detail: `@${x.account?.acct}`, at: x.created_at, url: x.status?.url })); } },
  { id: 'x', name: 'X (Twitter)', group: 'Media', mockOnly: true, reads: 'Your follower count.',
    fields: [plain('X_USERNAME', 'Username'), secret('X_BEARER', 'Bearer token')], setup: 'Developer portal, your project, Keys and tokens, Bearer token.', setupUrl: 'https://developer.x.com/en/portal/dashboard',
    async pull({ field }) { const m = (await api<any>(`https://api.x.com/2/users/by/username/${encodeURIComponent(field('X_USERNAME')!.replace(/^@/, ''))}?user.fields=public_metrics`, { token: field('X_BEARER') })).data?.public_metrics ?? {}; return numbers('X', [['X followers', n(m.followers_count ?? 0)]]); } },
  { id: 'devto', name: 'DEV', group: 'Media', mockOnly: true, reads: 'Views and reactions on your DEV posts.',
    fields: [secret('DEVTO_KEY', 'API key')], setup: 'Settings, Extensions, DEV Community API Keys, Generate.', setupUrl: 'https://dev.to/settings/extensions',
    async pull({ field }) { const r = await api<any[]>('https://dev.to/api/articles/me?per_page=30', { headers: { 'api-key': field('DEVTO_KEY')! } }); return numbers('DEV', [['Post views', n(r.reduce((a, x) => a + (x.page_views_count ?? 0), 0))], ['Reactions', n(r.reduce((a, x) => a + (x.public_reactions_count ?? 0), 0))]]); } },
  { id: 'lastfm', name: 'Last.fm', group: 'Media', mockOnly: true, reads: 'What you’re listening to and just played.',
    fields: [plain('LASTFM_USER', 'Username'), secret('LASTFM_KEY', 'API key')], setup: 'Create an API account at last.fm/api/account/create and copy the key.', setupUrl: 'https://www.last.fm/api/account/create',
    async pull({ field }) { const r = await api<any>(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(field('LASTFM_USER')!)}&api_key=${encodeURIComponent(field('LASTFM_KEY')!)}&format=json&limit=5`); return updates('Last.fm', r.recenttracks?.track ?? [], t => ({ id: `lastfm:${t.name}:${t.date?.uts ?? 'now'}`, title: `${t.name}, ${t.artist?.['#text']}`, detail: t['@attr']?.nowplaying ? 'Playing now' : 'Played', at: t.date ? iso(Number(t.date.uts) * 1000) : iso(Date.now()), url: t.url })); } },
  { id: 'letterboxd', name: 'Letterboxd', group: 'Media', mockOnly: true, reads: 'Films you logged lately. Public feed.',
    fields: [plain('LETTERBOXD_USER', 'Username')], setup: 'Type your Letterboxd username; your diary feed is public.', setupUrl: 'https://letterboxd.com/',
    async pull({ field }) { const items = xmlItems(await text(`https://letterboxd.com/${encodeURIComponent(field('LETTERBOXD_USER')!)}/rss/`)); return updates('Letterboxd', items, i => ({ id: `letterboxd:${i.link}`, title: i.title, at: i.date ? new Date(i.date).toISOString() : undefined, url: i.link })); } },
  { id: 'trakt', name: 'Trakt', group: 'Media', mockOnly: true, reads: 'Shows and films you watched lately.',
    fields: [plain('TRAKT_USER', 'Username'), secret('TRAKT_CLIENT', 'Client ID')], setup: 'Settings, Your API apps, New application; copy the Client ID. Your history must be public.', setupUrl: 'https://trakt.tv/oauth/applications',
    async pull({ field }) { const r = await api<any[]>(`https://api.trakt.tv/users/${encodeURIComponent(field('TRAKT_USER')!)}/history?limit=6`, { headers: { 'trakt-api-version': '2', 'trakt-api-key': field('TRAKT_CLIENT')! } }); return updates('Trakt', r, h => ({ id: `trakt:${h.id}`, title: h.episode ? `${h.show?.title}: ${h.episode.title}` : h.movie?.title, detail: 'Watched', at: h.watched_at })); } },
  { id: 'plex', name: 'Plex', group: 'Media', mockOnly: true, reads: 'What’s playing on your Plex server right now.',
    fields: [plain('PLEX_URL', 'Server address', 'http://192.168.1.10:32400'), secret('PLEX_TOKEN', 'X-Plex-Token')], setup: 'Find your token from any item’s Get Info, View XML (the X-Plex-Token in the address).', setupUrl: 'https://support.plex.tv/articles/204059436',
    async pull({ field }) { const r = await api<any>(`${field('PLEX_URL')!.replace(/\/+$/, '')}/status/sessions`, { headers: { 'X-Plex-Token': field('PLEX_TOKEN')!, Accept: 'application/json' } }); return updates('Plex', r.MediaContainer?.Metadata ?? [], m => ({ id: `plex:${m.sessionKey}`, title: m.grandparentTitle ? `${m.grandparentTitle}: ${m.title}` : m.title, detail: `Playing for ${m.User?.title ?? 'someone'}` })); } },
  { id: 'jellyfin', name: 'Jellyfin', group: 'Media', mockOnly: true, reads: 'What’s playing on your Jellyfin server right now.',
    fields: [plain('JELLYFIN_URL', 'Server address'), secret('JELLYFIN_KEY', 'API key')], setup: 'Dashboard, API keys, add one for OXBOT.', setupUrl: 'https://jellyfin.org/docs/',
    async pull({ field }) { const r = await api<any[]>(`${field('JELLYFIN_URL')!.replace(/\/+$/, '')}/Sessions?activeWithinSeconds=600`, { headers: { 'X-Emby-Token': field('JELLYFIN_KEY')! } }); return updates('Jellyfin', r.filter(s => s.NowPlayingItem), s => ({ id: `jellyfin:${s.Id}`, title: s.NowPlayingItem.Name, detail: `Playing for ${s.UserName}` })); } },
  { id: 'twitch', name: 'Twitch', group: 'Media', mockOnly: true, reads: 'Whether the channels you name are live.',
    fields: [plain('TWITCH_CHANNELS', 'Channels, comma separated'), plain('TWITCH_CLIENT', 'Client ID'), secret('TWITCH_TOKEN', 'App access token')], setup: 'Register an app at dev.twitch.tv/console, then get an app access token (client credentials).', setupUrl: 'https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow',
    async pull({ field }) { const r = await api<any>(`https://api.twitch.tv/helix/streams?${list(field('TWITCH_CHANNELS')).slice(0, 10).map(c => `user_login=${encodeURIComponent(c)}`).join('&')}`, { token: field('TWITCH_TOKEN'), headers: { 'Client-Id': field('TWITCH_CLIENT')! } }); return updates('Twitch', r.data ?? [], s => ({ id: `twitch:${s.id}`, title: `${s.user_name} is live`, detail: s.title, at: s.started_at, url: `https://twitch.tv/${s.user_login}` })); } },
];

const world: Def[] = [
  { id: 'newsapi', name: 'NewsAPI', group: 'Feeds', mockOnly: true, reads: 'Top headlines for your country.',
    fields: [secret('NEWSAPI_KEY', 'API key'), plain('NEWSAPI_COUNTRY', 'Country code', 'us', true)], setup: 'Get a free key at newsapi.org/register.', setupUrl: 'https://newsapi.org/register',
    async pull({ field }) { const r = await api<any>(`https://newsapi.org/v2/top-headlines?country=${encodeURIComponent(field('NEWSAPI_COUNTRY') || 'us')}&pageSize=8`, { headers: { 'X-Api-Key': field('NEWSAPI_KEY')! } }); return updates('NewsAPI', r.articles ?? [], a => ({ id: `newsapi:${a.url}`, title: a.title, detail: a.source?.name, at: a.publishedAt, url: a.url })); } },
  { id: 'guardian', name: 'The Guardian', group: 'Feeds', mockOnly: true, reads: 'The Guardian’s newest stories.',
    fields: [secret('GUARDIAN_KEY', 'API key')], setup: 'Register for a free developer key.', setupUrl: 'https://open-platform.theguardian.com/access/',
    async pull({ field }) { const r = await api<any>(`https://content.guardianapis.com/search?order-by=newest&page-size=8&api-key=${encodeURIComponent(field('GUARDIAN_KEY')!)}`); return updates('Guardian', r.response?.results ?? [], a => ({ id: `guardian:${a.id}`, title: a.webTitle, detail: a.sectionName, at: a.webPublicationDate, url: a.webUrl })); } },
  { id: 'nytimes', name: 'New York Times', group: 'Feeds', mockOnly: true, reads: 'Top stories on the home page.',
    fields: [secret('NYT_KEY', 'API key')], setup: 'Create an app at developer.nytimes.com with the Top Stories API and copy its key.', setupUrl: 'https://developer.nytimes.com/get-started',
    async pull({ field }) { const r = await api<any>(`https://api.nytimes.com/svc/topstories/v2/home.json?api-key=${encodeURIComponent(field('NYT_KEY')!)}`); return updates('NYT', r.results ?? [], a => ({ id: `nyt:${a.uri}`, title: a.title, detail: a.section, at: a.published_date, url: a.url })); } },
  { id: 'wikipedia', name: 'Wikipedia today', group: 'Feeds', mockOnly: true, toggle: true, reads: 'In the news and on this day, from Wikipedia. Public.',
    fields: [{ key: 'WIKIPEDIA_ON', label: 'On' }], setup: 'Switch it on. No account.', setupUrl: 'https://api.wikimedia.org/wiki/Feed_API',
    async pull() { const d = new Date(); const r = await api<any>(`https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`); return updates('Wikipedia', [...(r.news ?? []).slice(0, 4), ...(r.onthisday ?? []).slice(0, 2)], x => ({ id: `wiki:${String(x.story ?? x.text).slice(0, 60)}`, title: stripTags(x.story ?? `${x.year}: ${x.text}`), detail: x.story ? 'In the news' : 'On this day' })); } },
  { id: 'nasa-apod', name: 'NASA picture of the day', group: 'Feeds', mockOnly: true, reads: 'Today’s astronomy picture and its title.',
    fields: [secret('NASA_KEY', 'API key (DEMO_KEY works)')], setup: 'Get a free key at api.nasa.gov, or type DEMO_KEY.', setupUrl: 'https://api.nasa.gov/',
    async pull({ field }) { const r = await api<any>(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(field('NASA_KEY')!)}`); return updates('NASA', [r], a => ({ id: `apod:${a.date}`, title: a.title, detail: 'Picture of the day', at: `${a.date}T12:00:00Z`, url: a.hdurl ?? a.url })); } },
  { id: 'air-quality', name: 'Air quality', group: 'Feeds', mockOnly: true, reads: 'The air quality index where you are. No account.',
    fields: [plain('AQ_PLACE', 'Latitude,longitude', '37.80,-122.27')], setup: 'Type where you are as latitude,longitude. Data from Open-Meteo.', setupUrl: 'https://open-meteo.com/en/docs/air-quality-api',
    async pull({ field }) { const [lat, lon] = (field('AQ_PLACE') ?? '').split(',').map(s => Number(s.trim())); const c = (await api<any>(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5`)).current ?? {}; return numbers('Open-Meteo', [['Air quality (US AQI)', String(c.us_aqi ?? '—')], ['PM2.5', `${c.pm2_5 ?? '—'} µg/m³`]]); } },
  { id: 'earthquakes', name: 'Earthquakes (USGS)', group: 'Feeds', mockOnly: true, toggle: true, reads: 'Significant earthquakes worldwide in the last day. Public.',
    fields: [{ key: 'EARTHQUAKES_ON', label: 'On' }], setup: 'Switch it on. No account.', setupUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    async pull() { const r = await api<any>('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'); return updates('USGS', r.features ?? [], f => ({ id: `usgs:${f.id}`, title: f.properties?.title, at: iso(f.properties?.time), url: f.properties?.url })); } },
  { id: 'holidays', name: 'Public holidays', group: 'Calendar', mockOnly: true, reads: 'Public holidays in the next two weeks where you live. Public.',
    fields: [plain('HOLIDAY_COUNTRY', 'Country code', 'US')], setup: 'Type a two-letter country code. Data from Nager.Date.', setupUrl: 'https://date.nager.at/',
    async pull({ field }) { const r = await api<any[]>(`https://date.nager.at/api/v3/NextPublicHolidays/${encodeURIComponent((field('HOLIDAY_COUNTRY') || 'US').toUpperCase())}`); return { schedule: r.filter(h => Date.parse(h.date) < Date.now() + 14 * DAY).slice(0, 3).map(h => event({ id: `holiday:${h.date}`, title: h.localName === h.name ? h.name : `${h.name} (${h.localName})`, start: `${h.date}T00:00:00`, end: `${h.date}T23:59:00`, allDay: true, source: 'Holidays' })) }; } },
  { id: 'sports', name: 'Your team (TheSportsDB)', group: 'Feeds', mockOnly: true, reads: 'Your team’s last results and next game. Public.',
    fields: [plain('SPORTS_TEAM_ID', 'Team ID', '133604')], setup: 'Find your team on thesportsdb.com; the number in its page’s address is the ID.', setupUrl: 'https://www.thesportsdb.com/',
    async pull({ field }) {
      const id = encodeURIComponent(field('SPORTS_TEAM_ID')!);
      const [last, next] = await Promise.all([api<any>(`https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${id}`), api<any>(`https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${id}`)]);
      return updates('TheSportsDB', [...(next.events ?? []).slice(0, 1), ...(last.results ?? []).slice(0, 3)], e => ({ id: `sports:${e.idEvent}`, title: e.intHomeScore != null ? `${e.strHomeTeam} ${e.intHomeScore}–${e.intAwayScore} ${e.strAwayTeam}` : `${e.strEvent}, ${e.dateEvent}`, detail: e.intHomeScore != null ? 'Final' : 'Next game', at: e.strTimestamp ? `${e.strTimestamp}Z` : undefined }));
    } },
  { id: 'show-hn', name: 'Hacker News: Show HN', group: 'Feeds', mockOnly: true, toggle: true, reads: 'The newest Show HN launches. Public.',
    fields: [{ key: 'SHOWHN_ON', label: 'On' }], setup: 'Switch it on. No account.', setupUrl: 'https://hn.algolia.com/api',
    async pull() { const r = await api<any>('https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=8'); return updates('Show HN', r.hits ?? [], h => ({ id: `showhn:${h.objectID}`, title: h.title, detail: `${h.points ?? 0} points`, at: h.created_at, url: `https://news.ycombinator.com/item?id=${h.objectID}` })); } },
  { id: 'github-rising', name: 'GitHub rising repos', group: 'Feeds', mockOnly: true, toggle: true, reads: 'Repositories created this week that are gaining stars fastest. Public.',
    fields: [{ key: 'GH_RISING_ON', label: 'On' }], setup: 'Switch it on. Uses GitHub’s public search.', setupUrl: 'https://docs.github.com/en/rest/search/search',
    async pull() { const r = await api<any>(`https://api.github.com/search/repositories?q=${encodeURIComponent(`created:>${day(ago(7))}`)}&sort=stars&order=desc&per_page=6`, { headers: { 'User-Agent': 'OXBOT' } }); return updates('GitHub', r.items ?? [], x => ({ id: `ghrise:${x.id}`, title: x.full_name, detail: `${n(x.stargazers_count)} stars · ${String(x.description ?? '').slice(0, 80)}`, at: x.created_at, url: x.html_url })); } },
  { id: 'arxiv', name: 'arXiv', group: 'Feeds', mockOnly: true, reads: 'Newest papers on the topics you name. Public.',
    fields: [plain('ARXIV_QUERY', 'Topics', 'large language models')], setup: 'Type a topic. Results come from arXiv’s public API.', setupUrl: 'https://info.arxiv.org/help/api/',
    async pull({ field }) { const xml = await text(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:"${field('ARXIV_QUERY')}"`)}&sortBy=submittedDate&sortOrder=descending&max_results=6`); const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => ({ title: decode(m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''), id: m[1].match(/<id>([\s\S]*?)<\/id>/)?.[1], at: m[1].match(/<published>([\s\S]*?)<\/published>/)?.[1] })); return updates('arXiv', entries, e => ({ id: `arxiv:${e.id}`, title: e.title, detail: 'New paper', at: e.at, url: e.id })); } },
];

export const moreDefs: Def[] = [...support, ...work, ...dev, ...growth, ...moneyDefs, ...people, ...social, ...world];
