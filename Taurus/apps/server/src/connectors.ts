import { createHash, randomBytes } from 'node:crypto';
import { aiFields, providers as aiProviders } from './ai.ts';
import { newHandoffKey, openSealed } from './handoff.ts';
import { apps, authorizeUrl, tokenRequest as exchange, writeScopes, type App, type AppName, type TokenSet } from './providers.ts';
import { begin } from './activity.ts';
import { api, store, type Tokens } from './store.ts';
import type { CalendarEvent, ConnectorInfo, Grant, Group } from './types.ts';

import { appFields, DAY, iso, startOfToday, toggleField, type Def, type Field, type Pull } from './connectors/kit.ts';
import { workDefs } from './connectors/work.ts';
import { numbersBodyDefs } from './connectors/numbers-body.ts';
import { filesFeedsDefs } from './connectors/files-feeds.ts';
import { composioDefs } from './connectors/composio.ts';
import { moreDefs } from './connectors/more.ts';
import { canvasDefs } from './connectors/canvas.ts';
export type { Pull };

const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (text = '') => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, match => entities[match]);
function parseFrom(value = '') {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  return match ? { name: match[1] || match[2], email: match[2].toLowerCase() } : { name: value, email: value.toLowerCase() };
}
// Mail written by a person, to you, beats mail sent to a list. VIPs and account-security mail always pass.
const robotSender = /^(no-?reply|do-?not-?reply|notifications?|newsletters?|news|marketing|updates?|info|hello|team|digest|mailer-daemon|bounces?)[@+.-]/i;
const mustSee = /security alert|sign-?in|password|verification code|suspicious/i;
function isBulk(mail: { from?: string; subject?: string; headers?: Record<string, string | undefined>; labels?: string[] }) {
  const from = mail.from ?? '';
  if (store.settings().vipSenders.some(v => { const vip = v.trim().toLowerCase(); return vip && (vip.startsWith('@') ? from.endsWith(vip) : from === vip); })) return false;
  if (mustSee.test(mail.subject ?? '')) return false;
  const h = mail.headers ?? {};
  if (h['List-Unsubscribe'] || h['List-Id'] || /bulk|list|junk/i.test(h.Precedence ?? '') || /auto-generated/i.test(h['Auto-Submitted'] ?? '')) return true;
  if (mail.labels?.some(l => /^CATEGORY_(PROMOTIONS|SOCIAL|UPDATES|FORUMS)$/.test(l))) return true;
  return robotSender.test(from);
}
const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
const percent = (now: number, before: number) => before ? `${now >= before ? '+' : ''}${(((now - before) / before) * 100).toFixed(1)}%` : undefined;

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const coreDefs: Def[] = [
  {
    id: 'gmail', name: 'Gmail', group: 'Mail', reads: 'Unread primary inbox from the last three days: sender, subject, preview.',
    oauth: { app: 'google', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] }, fields: appFields('google'),
    setup: 'Create an OAuth client (type Web application) in Google Cloud, enable the Gmail API, add yourself as a test user.', setupUrl: 'https://console.cloud.google.com/apis/credentials',
    async pull({ token }) {
      const t = await token();
      const gmail = (path: string) => api<any>(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { token: t });
      // Updates stay in the query so isBulk can still rescue security mail from that category.
      const query = 'is:unread in:inbox newer_than:3d -category:promotions -category:social -category:forums';
      const [list, inbox] = await Promise.all([gmail(`messages?maxResults=30&q=${encodeURIComponent(query)}`), gmail('labels/INBOX')]);
      const wanted = ['From', 'Subject', 'List-Unsubscribe', 'List-Id', 'Precedence', 'Auto-Submitted'].map(h => `metadataHeaders=${h}`).join('&');
      const messages = await Promise.all((list.messages ?? []).map((m: any) => gmail(`messages/${m.id}?format=metadata&${wanted}`)));
      return {
        inbox: [{ source: 'Gmail', unread: inbox.messagesUnread ?? 0, label: 'unread', url: 'https://mail.google.com/mail/u/0/#inbox' }],
        needs: messages.flatMap((m: any) => {
          const headers: Record<string, string> = Object.fromEntries((m.payload?.headers ?? []).map((h: any) => [h.name, h.value]));
          const from = parseFrom(headers.From);
          if (isBulk({ from: from.email, subject: headers.Subject, headers, labels: m.labelIds })) return [];
          return [{ id: `gmail:${m.id}`, title: headers.Subject || '(no subject)', who: from.name, from: from.email, detail: decode(m.snippet), source: 'Gmail', at: iso(Number(m.internalDate)), url: `https://mail.google.com/mail/u/0/#inbox/${m.threadId}` }];
        }).slice(0, 8),
      };
    },
  },
  {
    id: 'outlook-mail', name: 'Outlook Mail', group: 'Mail', reads: 'Unread Focused inbox from the last three days: sender, subject, preview.',
    oauth: { app: 'microsoft', scopes: ['offline_access', 'User.Read', 'Mail.Read'] }, fields: appFields('microsoft'),
    setup: 'Register an app in Microsoft Entra (accounts in any org and personal), platform Web, and create a client secret.', setupUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    async pull({ token }) {
      const t = await token();
      const filter = encodeURIComponent(`receivedDateTime ge ${iso(Date.now() - 3 * DAY)} and isRead eq false`);
      const [list, folder] = await Promise.all([
        api<any>(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime%20desc&$top=12&$select=id,subject,from,receivedDateTime,bodyPreview,webLink,inferenceClassification`, { token: t }),
        api<any>('https://graph.microsoft.com/v1.0/me/mailFolders/inbox?$select=unreadItemCount', { token: t }),
      ]);
      return {
        inbox: [{ source: 'Outlook', unread: folder.unreadItemCount ?? 0, label: 'unread', url: 'https://outlook.office.com/mail/' }],
        needs: (list.value ?? []).filter((m: any) => m.inferenceClassification !== 'other' && !isBulk({ from: m.from?.emailAddress?.address?.toLowerCase(), subject: m.subject })).slice(0, 8).map((m: any) => ({
          id: `outlook:${m.id}`, title: m.subject || '(no subject)', who: m.from?.emailAddress?.name, from: m.from?.emailAddress?.address?.toLowerCase(),
          detail: m.bodyPreview, source: 'Outlook', at: m.receivedDateTime, url: m.webLink,
        })),
      };
    },
  },
  {
    id: 'google-calendar', name: 'Google Calendar', group: 'Calendar', reads: 'Every calendar you have switched on, today and tomorrow, so it matches Notion Calendar too. Declined events are skipped.',
    oauth: { app: 'google', scopes: ['https://www.googleapis.com/auth/calendar.readonly'] }, fields: appFields('google'),
    setup: 'Same Google OAuth client as Gmail. Enable the Google Calendar API.', setupUrl: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
    // Every calendar you have switched on in Google Calendar, not only the main one (owner, November 20, 2026: "make it
    // take ... notion calender"). Notion Calendar has no feed of its own: it shows the Google calendars you add to it, so
    // this reads the same ones. An event on two of your calendars shows once.
    async pull({ token }) {
      const from = startOfToday();
      const t = await token();
      const list = await api<any>('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50', { token: t }).catch(() => ({ items: [{ id: 'primary', selected: true }] }));
      const calendars = (list.items ?? []).filter((c: any) => c.primary || c.selected).slice(0, 15);
      const pages = await Promise.all((calendars.length ? calendars : [{ id: 'primary' }]).map((c: any) =>
        api<any>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?timeMin=${iso(from)}&timeMax=${iso(from + 2 * DAY)}&singleEvents=true&orderBy=startTime&maxResults=50`, { token: t }).catch((e: unknown) => { if (c.primary || c.id === 'primary') throw e; return { items: [] }; })));
      const seen = new Set<string>();
      const data = { items: pages.flatMap(p => p.items ?? []).filter((e: any) => { const k = e.iCalUID ?? e.id; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a: any, b: any) => String(a.start?.dateTime ?? a.start?.date).localeCompare(String(b.start?.dateTime ?? b.start?.date))) };
      return {
        schedule: (data.items ?? [])
          .filter((e: any) => e.status !== 'cancelled' && e.attendees?.find((a: any) => a.self)?.responseStatus !== 'declined')
          .map((e: any) => ({
            id: `gcal:${e.id}`, title: e.summary ?? 'Busy', start: e.start.dateTime ?? e.start.date, end: e.end.dateTime ?? e.end.date, allDay: !e.start.dateTime,
            location: e.location, joinUrl: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri, url: e.htmlLink, source: 'Google Calendar',
          })),
      };
    },
  },
  {
    id: 'outlook-calendar', name: 'Outlook Calendar', group: 'Calendar', reads: 'Your default calendar, today and tomorrow. Cancelled and declined events are skipped.',
    oauth: { app: 'microsoft', scopes: ['offline_access', 'User.Read', 'Calendars.Read'] }, fields: appFields('microsoft'),
    setup: 'Same Microsoft app as Outlook Mail.', setupUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    async pull({ token }) {
      const from = startOfToday();
      const data = await api<any>(`https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${iso(from)}&endDateTime=${iso(from + 2 * DAY)}&$orderby=start/dateTime&$top=50&$select=id,subject,start,end,isAllDay,location,webLink,onlineMeeting,isCancelled,responseStatus`, { token: await token(), headers: { Prefer: 'outlook.timezone="UTC"' } });
      return {
        schedule: (data.value ?? []).filter((e: any) => !e.isCancelled && e.responseStatus?.response !== 'declined').map((e: any) => ({
          id: `ocal:${e.id}`, title: e.subject || 'Busy', start: `${e.start.dateTime.slice(0, 19)}Z`, end: `${e.end.dateTime.slice(0, 19)}Z`, allDay: e.isAllDay,
          location: e.location?.displayName || undefined, joinUrl: e.onlineMeeting?.joinUrl, url: e.webLink, source: 'Outlook',
        })),
      };
    },
  },
  {
    // Apple Calendar with nothing to paste (owner, November 20, 2026: "can u make it take apple and notion calender"):
    // the Calendar app's events on this Mac, which include iCloud and any account added in System Settings (mac.ts).
    id: 'apple-calendar', name: 'Apple Calendar on this Mac', group: 'Calendar', toggle: true,
    reads: 'Every calendar in the Calendar app on this Mac (iCloud, and any Google, Exchange or subscribed calendar you added there), today and tomorrow. Read only.',
    fields: [toggleField('apple-calendar')],
    setup: 'Turn it on. macOS asks once whether Taurus may see your calendars.', setupUrl: 'https://support.apple.com/guide/calendar/welcome/mac',
    async pull() {
      const { macCalendar } = await import('./mac.ts');
      const from = startOfToday();
      const events = await macCalendar(from, from + 2 * DAY);
      return {
        schedule: events.map(e => ({ id: `acal:${e.id}`, title: e.title || 'Busy', start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString(), allDay: e.allDay,
          location: e.location, url: e.url, source: e.calendar ? `Apple Calendar · ${e.calendar}` : 'Apple Calendar' })),
      };
    },
  },
  {
    id: 'ics', name: 'Apple Calendar and others (ICS)', group: 'Calendar', reads: 'Any private calendar feed URL: iCloud, Fastmail, Proton, Fantastical. For Apple Calendar with nothing to paste, use Apple Calendar on this Mac.',
    fields: [{ key: 'ICS_URLS', label: 'Calendar feed URLs, comma separated', secret: true, placeholder: 'webcal://p01-caldav.icloud.com/published/2/…' }],
    setup: 'In Apple Calendar on iCloud.com, share a calendar as Public and copy the link. Other apps call it "secret address in iCal format".', setupUrl: 'https://www.icloud.com/calendar/',
    async pull({ field }) {
      const urls = (field('ICS_URLS') ?? '').split(/[\s,]+/).filter(Boolean).map(url => url.replace(/^webcal:/, 'https:'));
      const from = startOfToday();
      const feeds = await Promise.all(urls.map(async url => {
        const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
        if (!response.ok) throw new Error(`Calendar feed ${response.status}`);
        return parseIcs(await response.text(), from, from + 2 * DAY);
      }));
      return { schedule: feeds.flat() };
    },
  },
  {
    id: 'slack', name: 'Slack', group: 'Chat', reads: 'Messages that mention you, newest first.',
    oauth: { app: 'slack', scopes: ['search:read'] },
    fields: [...appFields('slack'), { key: 'SLACK_USER_TOKEN', label: 'User OAuth token (xoxp-…)', secret: true, instead: true }],
    setup: 'Create a Slack app with user scope search:read and redirect URL below, or install it and copy its User OAuth Token.', setupUrl: 'https://api.slack.com/apps',
    async pull(ctx) {
      const token = await ctx.token();
      const me = await api<any>('https://slack.com/api/auth.test', { token, method: 'POST' });
      if (!me.ok) throw new Error(`Slack: ${me.error}`);
      const found = await api<any>(`https://slack.com/api/search.messages?query=${encodeURIComponent(`<@${me.user_id}>`)}&sort=timestamp&count=15`, { token });
      if (!found.ok) throw new Error(`Slack: ${found.error}`);
      const recent = (found.messages?.matches ?? []).filter((m: any) => Number(m.ts) * 1000 > Date.now() - 3 * DAY);
      const clean = (text: string) => decode(text.replace(/<@[A-Z0-9]+(\|([^>]+))?>/g, (_, __, name) => `@${name ?? 'you'}`).replace(/<([^|>]+)\|([^>]+)>/g, '$2').replace(/<([^>]+)>/g, '$1'));
      return {
        inbox: [{ source: 'Slack', unread: recent.filter((m: any) => Number(m.ts) * 1000 > startOfToday()).length, label: 'mentions today', url: `${me.url}` }],
        needs: recent.slice(0, 6).map((m: any) => ({
          id: `slack:${m.channel?.id}:${m.ts}`, title: clean(m.text).slice(0, 160), who: m.username, detail: m.channel?.is_im ? 'Direct message' : `#${m.channel?.name}`,
          source: 'Slack', at: iso(Number(m.ts) * 1000), url: m.permalink,
        })),
      };
    },
  },
  {
    id: 'github', name: 'GitHub', group: 'Code', reads: 'Open pull requests waiting on your review.',
    // Signed in, Taurus reads only your notifications (review requests), never code: GitHub's sign-in has no
    // read-only access to private repositories, so it asks for none. A personal token reads the same through search.
    oauth: { app: 'github', scopes: ['notifications', 'read:user'] },
    fields: [...appFields('github'), { key: 'GITHUB_TOKEN', label: 'Fine-grained personal access token', secret: true, instead: true }],
    setup: 'Register an OAuth app with the redirect URL below, or create a fine-grained token with read access to pull requests.', setupUrl: 'https://github.com/settings/developers',
    async pull({ token, signedIn }) {
      const t = await token();
      const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
      if (signedIn) {
        const list = await api<any[]>('https://api.github.com/notifications?participating=true&per_page=50', { token: t, headers });
        const web = (url?: string) => url ? url.replace('https://api.github.com/repos/', 'https://github.com/').replace('/pulls/', '/pull/') : 'https://github.com/notifications';
        return {
          needs: (list ?? []).filter(n => n.reason === 'review_requested' && n.subject?.type === 'PullRequest').slice(0, 10)
            .map(n => ({ id: `gh:n:${n.id}`, title: n.subject.title, detail: `Review requested · ${n.repository?.full_name ?? ''}`, source: 'GitHub', at: n.updated_at, url: web(n.subject.url) })),
        };
      }
      const data = await api<any>(`https://api.github.com/search/issues?q=${encodeURIComponent('is:open is:pr review-requested:@me archived:false')}&sort=updated&per_page=10`, { token: t, headers });
      return {
        needs: (data.items ?? []).map((pr: any) => ({ id: `gh:${pr.id}`, title: pr.title, who: pr.user?.login, detail: `Review requested · ${pr.repository_url.split('/').slice(-2).join('/')}`, source: 'GitHub', at: pr.updated_at, url: pr.html_url })),
      };
    },
  },
  {
    id: 'linear', name: 'Linear', group: 'Tasks', reads: 'Urgent and high-priority issues assigned to you that are not done.',
    oauth: { app: 'linear', scopes: ['read'] },
    fields: [...appFields('linear'), { key: 'LINEAR_API_KEY', label: 'Personal API key', secret: true, instead: true }],
    setup: 'Create an OAuth app with the redirect URL below, or a personal API key in Settings → Account → Security & access.', setupUrl: 'https://linear.app/settings/api',
    async pull({ token, signedIn }) {
      const t = await token();
      const query = '{ viewer { assignedIssues(first: 10, filter: { priority: { gte: 1, lte: 2 }, state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id identifier title url priority updatedAt state { name } } } } }';
      const data = await api<any>('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: signedIn ? `Bearer ${t}` : t, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      if (data.errors) throw new Error(`Linear: ${data.errors[0]?.message}`);
      return {
        needs: data.data.viewer.assignedIssues.nodes.map((i: any) => ({ id: `linear:${i.id}`, title: `${i.identifier} ${i.title}`, detail: `${i.priority === 1 ? 'Urgent' : 'High'} · ${i.state.name}`, source: 'Linear', at: i.updatedAt, url: i.url })),
      };
    },
  },
  {
    id: 'notion', name: 'Notion', group: 'Tasks', reads: 'Open items from one task database you choose, and its items dated today or tomorrow on your schedule.',
    // Notion's own sign-in screen asks which pages Taurus may see; with no database named, it reads the first one shared.
    oauth: { app: 'notion', scopes: ['pages'] },
    fields: [...appFields('notion'), { key: 'NOTION_TOKEN', label: 'Internal integration secret', secret: true, instead: true }, { key: 'NOTION_DATABASE_ID', label: 'Task database ID', optional: true, placeholder: 'The first database you share' }],
    setup: 'Create a public integration with the redirect URL below, or an internal one and share your task database with it (••• → Connections).', setupUrl: 'https://www.notion.so/profile/integrations',
    async pull({ token, field }) {
      const t = await token();
      const headers = { 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
      let database = field('NOTION_DATABASE_ID');
      if (!database) {
        const found = await api<any>('https://api.notion.com/v1/search', { method: 'POST', token: t, headers, body: JSON.stringify({ filter: { property: 'object', value: 'database' }, page_size: 1 }) });
        database = found.results?.[0]?.id;
        if (!database) return {};
      }
      const data = await api<any>(`https://api.notion.com/v1/databases/${database}/query`, {
        method: 'POST', token: t, headers,
        body: JSON.stringify({ page_size: 25, sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }] }),
      });
      const done = /^(done|complete|completed|shipped|archived|cancel)/i;
      // Items with a date today or tomorrow go on your schedule, the way Notion Calendar shows them (November 20, 2026).
      const from = startOfToday();
      const schema = await api<any>(`https://api.notion.com/v1/databases/${database}`, { token: t, headers }).catch(() => undefined);
      const dateProp = Object.entries(schema?.properties ?? {}).find(([, p]: [string, any]) => p.type === 'date')?.[0];
      const dated = dateProp ? await api<any>(`https://api.notion.com/v1/databases/${database}/query`, { method: 'POST', token: t, headers,
        body: JSON.stringify({ page_size: 25, filter: { and: [{ property: dateProp, date: { on_or_after: iso(from).slice(0, 10) } }, { property: dateProp, date: { before: iso(from + 2 * DAY).slice(0, 10) } }] } }) }).catch(() => ({ results: [] })) : { results: [] };
      const schedule = (dated.results ?? []).flatMap((page: any) => {
        const props = page.properties ?? {};
        const d = props[dateProp!]?.date;
        if (!d?.start) return [];
        const title = (Object.values(props) as any[]).find(p => p.type === 'title')?.title?.map((x: any) => x.plain_text).join('') || 'Untitled';
        const allDay = !/T/.test(d.start);
        return [{ id: `notion-date:${page.id}`, title, start: d.start, end: d.end ?? d.start, allDay, url: page.url, source: 'Notion' }];
      });
      return {
        schedule,
        needs: (data.results ?? []).map((page: any) => {
          const props = Object.values(page.properties ?? {}) as any[];
          const title = props.find(p => p.type === 'title')?.title?.map((t: any) => t.plain_text).join('') || 'Untitled';
          const status = props.find(p => p.type === 'status')?.status?.name ?? props.find(p => p.type === 'select')?.select?.name;
          return { id: `notion:${page.id}`, title, detail: status, source: 'Notion', at: page.last_edited_time, url: page.url, status };
        }).filter((item: any) => !done.test(item.status ?? '')).slice(0, 6).map(({ status: _status, ...item }: any) => item),
      };
    },
  },
  {
    id: 'google-sheets', name: 'Google Sheets', group: 'Numbers', reads: 'One range you choose, as rows of metric, value, change. Your company numbers, your way.',
    oauth: { app: 'google', scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] },
    fields: [...appFields('google'), { key: 'SHEET_ID', label: 'Spreadsheet ID (from its URL)' }, { key: 'SHEET_RANGE', label: 'Range', optional: true, placeholder: 'Taurus!A1:C12' }],
    setup: 'Same Google OAuth client. Enable the Google Sheets API. Put metrics in three columns: name, value, change.', setupUrl: 'https://console.cloud.google.com/apis/library/sheets.googleapis.com',
    async pull({ token, field }) {
      const range = encodeURIComponent(field('SHEET_RANGE') || 'A1:C12');
      const data = await api<any>(`https://sheets.googleapis.com/v4/spreadsheets/${field('SHEET_ID')}/values/${range}`, { token: await token() });
      const rows = (data.values ?? []) as string[][];
      return {
        numbers: rows.filter((row, i) => row[0] && row[1] && !(i === 0 && /^(metric|name|label|kpi)$/i.test(row[0])))
          .map(row => ({ label: row[0], value: row[1], change: row[2] || undefined, source: 'Sheets' })),
      };
    },
  },
  {
    id: 'stripe', name: 'Stripe', group: 'Money', reads: 'Revenue over the last 30 days against the 30 before, and available balance.',
    fields: [{ key: 'STRIPE_KEY', label: 'Restricted key, read-only (rk_live_…)', secret: true }],
    setup: 'Developers → API keys → Create restricted key. Give Read on Balance and Charges, nothing else.', setupUrl: 'https://dashboard.stripe.com/apikeys',
    async pull({ field }) {
      const key = field('STRIPE_KEY');
      const now = Math.floor(Date.now() / 1000), month = 30 * 86_400;
      const stripe = (path: string) => api<any>(`https://api.stripe.com/v1/${path}`, { token: key });
      const [balance, current, previous] = await Promise.all([
        stripe('balance'), stripe(`charges?limit=100&created[gte]=${now - month}`), stripe(`charges?limit=100&created[gte]=${now - 2 * month}&created[lt]=${now - month}`),
      ]);
      const total = (list: any) => list.data.filter((c: any) => c.paid && c.status === 'succeeded').reduce((sum: number, c: any) => sum + c.amount - c.amount_refunded, 0);
      const currency = balance.available?.[0]?.currency ?? current.data[0]?.currency ?? 'usd';
      const capped = current.has_more || previous.has_more;
      return {
        numbers: [
          { label: 'Revenue, 30 days', value: money(total(current), currency) + (current.has_more ? '+' : ''), change: capped ? undefined : percent(total(current), total(previous)), source: 'Stripe' },
          { label: 'Available balance', value: money(balance.available?.reduce((s: number, b: any) => s + (b.currency === currency ? b.amount : 0), 0) ?? 0, currency), source: 'Stripe' },
        ],
      };
    },
  },
  {
    id: 'hubspot', name: 'HubSpot', group: 'Sales', reads: 'Open pipeline value and deals due to close this week.',
    fields: [{ key: 'HUBSPOT_TOKEN', label: 'Private app access token', secret: true }],
    setup: 'Settings → Integrations → Private apps. Scope: crm.objects.deals.read.', setupUrl: 'https://app.hubspot.com/private-apps/',
    async pull({ field }) {
      const data = await api<any>('https://api.hubapi.com/crm/v3/objects/deals/search', {
        method: 'POST', token: field('HUBSPOT_TOKEN'), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' }] }], properties: ['amount', 'closedate', 'dealname'], limit: 100 }),
      });
      const deals = data.results ?? [];
      const pipeline = deals.reduce((sum: number, d: any) => sum + Number(d.properties.amount || 0), 0);
      const week = deals.filter((d: any) => { const close = Date.parse(d.properties.closedate); return close >= Date.now() - DAY && close <= Date.now() + 7 * DAY; });
      return {
        numbers: [
          { label: 'Open pipeline', value: money(pipeline * 100, 'usd') + (data.total > 100 ? '+' : ''), source: 'HubSpot' },
          { label: 'Deals closing this week', value: String(week.length), source: 'HubSpot' },
        ],
      };
    },
  },
  {
    id: 'whoop', name: 'WHOOP', group: 'Body', reads: 'Latest scored recovery, HRV, resting heart rate, sleep and day strain.',
    oauth: { app: 'whoop', scopes: ['offline', 'read:recovery', 'read:sleep', 'read:cycles'] }, fields: appFields('whoop'),
    setup: 'Create an app in the WHOOP developer dashboard. Add the redirect URL below.', setupUrl: 'https://developer-dashboard.whoop.com/',
    async pull({ token }) {
      const t = await token();
      const whoop = (path: string) => api<any>(`https://api.prod.whoop.com/developer/v2/${path}?limit=1`, { token: t });
      const [recovery, sleep, cycle] = await Promise.all([whoop('recovery'), whoop('activity/sleep'), whoop('cycle')]);
      const r = recovery.records?.[0]?.score, s = sleep.records?.[0]?.score, c = cycle.records?.[0]?.score;
      const stages = s?.stage_summary;
      return {
        body: {
          recovery: r?.recovery_score, hrv: r?.hrv_rmssd_milli && Math.round(r.hrv_rmssd_milli), restingHr: r?.resting_heart_rate,
          sleepScore: s?.sleep_performance_percentage, sleepMinutes: stages && Math.round((stages.total_in_bed_time_milli - stages.total_awake_time_milli) / 60_000),
          strain: c?.strain && Math.round(c.strain * 10) / 10,
        },
      };
    },
  },
  {
    id: 'oura', name: 'Oura', group: 'Body', reads: 'Readiness, sleep score, sleep time, HRV and lowest heart rate from last night.',
    oauth: { app: 'oura', scopes: ['daily', 'heartrate'] }, fields: appFields('oura'),
    setup: 'Create an OAuth application in Oura’s developer portal. Add the redirect URL below.', setupUrl: 'https://cloud.ouraring.com/oauth/applications',
    async pull({ token }) {
      const t = await token();
      const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
      const oura = (path: string) => api<any>(`https://api.ouraring.com/v2/usercollection/${path}?start_date=${day(-2)}&end_date=${day(1)}`, { token: t });
      const [readiness, dailySleep, sleep] = await Promise.all([oura('daily_readiness'), oura('daily_sleep'), oura('sleep')]);
      const last = (list: any) => list.data?.at(-1);
      const night = (sleep.data ?? []).filter((x: any) => x.type === 'long_sleep').at(-1) ?? last(sleep);
      return { body: { readiness: last(readiness)?.score, sleepScore: last(dailySleep)?.score, sleepMinutes: night && Math.round(night.total_sleep_duration / 60), hrv: night?.average_hrv, restingHr: night?.lowest_heart_rate } };
    },
  },
  {
    id: 'strava', name: 'Strava', group: 'Body', reads: 'Your latest activity and distance over the last seven days.',
    oauth: { app: 'strava', scopes: ['read', 'activity:read_all'] }, fields: appFields('strava'),
    setup: 'Create an API application. Set Authorization Callback Domain to localhost.', setupUrl: 'https://www.strava.com/settings/api',
    async pull({ token }) {
      const t = await token();
      const week = await api<any[]>(`https://www.strava.com/api/v3/athlete/activities?after=${Math.floor((Date.now() - 7 * DAY) / 1000)}&per_page=50`, { token: t });
      const latest = week.at(-1) ?? (await api<any[]>('https://www.strava.com/api/v3/athlete/activities?per_page=1', { token: t }))[0];
      return {
        body: {
          weekKm: Math.round(week.reduce((sum, a) => sum + (a.distance ?? 0), 0) / 100) / 10,
          lastWorkout: latest && { name: latest.name, km: latest.distance ? Math.round(latest.distance / 100) / 10 : undefined, minutes: Math.round(latest.moving_time / 60), at: latest.start_date, url: `https://www.strava.com/activities/${latest.id}` },
        },
      };
    },
  },
  {
    id: 'google-health', name: 'Google Health (Fitbit, Pixel Watch)', group: 'Body', reads: 'Resting heart rate, HRV and last night’s sleep. Replaces the Fitbit Web API, which shuts down November 2, 2026.',
    oauth: { app: 'google', scopes: ['https://www.googleapis.com/auth/googlehealth.sleep.readonly', 'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly'] },
    fields: appFields('google'),
    setup: 'Same Google OAuth client. Enable the Google Health API and link your Fitbit or Pixel account to Google Health.', setupUrl: 'https://developers.google.com/health',
    async pull({ token }) {
      const t = await token();
      const points = (type: string) => api<any>(`https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints?pageSize=14`, { token: t }).then(r => (r.dataPoints ?? []) as any[]);
      const [resting, hrv, sleep] = await Promise.all([points('daily-resting-heart-rate'), points('daily-heart-rate-variability'), points('sleep')]);
      const dateKey = (d: any) => d ? d.year * 10_000 + d.month * 100 + d.day : 0;
      const newest = <T,>(list: T[], key: (x: T) => number) => list.reduce<T | undefined>((best, x) => !best || key(x) > key(best) ? x : best, undefined);
      const r = newest(resting, p => dateKey(p.dailyRestingHeartRate?.date))?.dailyRestingHeartRate;
      const h = newest(hrv, p => dateKey(p.dailyHeartRateVariability?.date))?.dailyHeartRateVariability;
      const s = newest(sleep, p => Date.parse(p.sleep?.interval?.endTime ?? '') || 0)?.sleep;
      return { body: { restingHr: r && Number(r.beatsPerMinute), hrv: h?.averageHeartRateVariabilityMilliseconds && Math.round(h.averageHeartRateVariabilityMilliseconds), sleepMinutes: s?.summary && Number(s.summary.minutesAsleep) } };
    },
  },
  // Every AI provider from ai.ts. They read nothing on their own: Taurus sends the question and your dashboard's facts.
  ...aiProviders.map((p): Def => ({
    id: p.id, name: p.free ? `${p.name} (${p.maker})` : p.local ? `${p.name} (${p.maker})` : p.name === p.maker ? p.name : `${p.name} (${p.maker})`, group: 'AI',
    reads: p.local ? 'Nothing. Writes your brief and answers questions on this Mac.' : p.plan ? 'Nothing. Answers with your own plan, with the facts on your dashboard, sent when you ask.' : 'Nothing. Writes your brief and answers questions with the facts on your dashboard, sent when you ask.',
    fields: aiFields(p), ...(p.kind === 'cli' ? { toggle: true } : {}),
    setup: p.kind === 'cli' ? `${p.note} Install it, run it once in Terminal and sign in with your plan, then switch this on.` : p.plan ? `${p.note} Paste it here, then pick it in Settings, then AI.` : p.free ? `${p.note} Easiest: Settings, then AI, then Sign in with OpenRouter. Or paste a key.` : `${p.note} Create a key, paste it here, and pick it in Settings, then AI.`, setupUrl: p.keyUrl,
  })),
  {
    id: 'twilio', name: 'Phone call (Twilio)', group: 'Phone', reads: 'Nothing. Places a real call to your phone when Taurus rings and you have not answered.',
    fields: [
      { key: 'TWILIO_ACCOUNT_SID', label: 'Account SID' }, { key: 'TWILIO_AUTH_TOKEN', label: 'Auth token', secret: true },
      { key: 'TWILIO_FROM', label: 'Twilio number', placeholder: '+15551230000' }, { key: 'MY_PHONE', label: 'Your mobile number', placeholder: '+15557654321' },
    ],
    setup: 'A free trial is enough to start: sign up with your own mobile (Twilio verifies it), then Get a phone number. Paste the Account SID and auth token from the console’s front page. On your iPhone, save the Twilio number as a contact named Taurus and add it to Favorites so it rings through Focus. Trial calls start with a short Twilio message: press any key to hear Taurus.', setupUrl: 'https://console.twilio.com/',
  },
  {
    id: 'ntfy', name: 'Push (ntfy)', group: 'Phone', reads: 'Nothing. Sends an urgent push to the ntfy app the moment Taurus rings.',
    fields: [{ key: 'NTFY_TOPIC', label: 'Private topic name', secret: true, placeholder: 'taurus-7f3k9q…' }, { key: 'NTFY_SERVER', label: 'Server', optional: true, placeholder: 'https://ntfy.sh' }],
    setup: 'Install ntfy on your phone, subscribe to a long random topic name, paste the same name here.', setupUrl: 'https://ntfy.sh/',
  },
];
// The connectors added October 31, 2026 (read-only, tested only against mocks) follow the ones above.
const defs: Def[] = [...coreDefs, ...workDefs, ...numbersBodyDefs, ...filesFeedsDefs, ...moreDefs, ...canvasDefs, ...composioDefs];
// For tests: every definition, with its pull function.
export const connectorDefs = (): readonly Def[] => defs;

// Write grants (owner, November 1, 2026): what Taurus may do once you approve each action. Each is its own sign-in
// or token, separate from the read-only connection, so reading never carries the power to send.
const switchField = (key: string): Field => ({ key, label: 'On' });
const grants: Def[] = [
  { id: 'gmail-send', name: 'Gmail', group: 'Mail', write: true, reads: 'Sends and replies to email you approve, from your Gmail.',
    oauth: { app: 'google', scopes: writeScopes.google! }, fields: appFields('google'),
    setup: 'Sending needs your own Google OAuth client (Taurus’s one-click sign-in only ever asks to read). Use the same client as Gmail, enable the Gmail API, then Allow. Google asks only for “Send email on your behalf”.', setupUrl: 'https://console.cloud.google.com/apis/credentials' },
  { id: 'outlook-send', name: 'Outlook Mail', group: 'Mail', write: true, reads: 'Sends and replies to email you approve, from Outlook.',
    oauth: { app: 'microsoft', scopes: writeScopes.microsoft! }, fields: appFields('microsoft'),
    setup: 'Use your own Microsoft Entra app (the same one as Outlook Mail), add the delegated permission Mail.Send, then Allow.', setupUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade' },
  { id: 'slack-act', name: 'Slack', group: 'Chat', write: true, reads: 'Posts, replies in threads and reacts, as you, when you approve.',
    fields: [{ key: 'SLACK_ACTION_TOKEN', label: 'User OAuth token with chat:write and reactions:write', secret: true }],
    setup: 'In your Slack app, add the user scopes chat:write and reactions:write, reinstall it, and paste the new User OAuth Token here. Keep the read token on the Connections page as it is.', setupUrl: 'https://api.slack.com/apps' },
  { id: 'github-act', name: 'GitHub', group: 'Code', write: true, reads: 'Approves, comments on or requests changes to pull requests, when you approve.',
    fields: [{ key: 'GITHUB_ACTION_TOKEN', label: 'Fine-grained token with Pull requests: Read and write', secret: true }],
    setup: 'Create a second fine-grained token with Pull requests set to Read and write on the repos you review. The read token stays read-only.', setupUrl: 'https://github.com/settings/personal-access-tokens/new' },
  { id: 'linear-act', name: 'Linear', group: 'Tasks', write: true, reads: 'Comments on issues and moves them to another status, when you approve.',
    fields: [{ key: 'LINEAR_ACTION_KEY', label: 'API key with Write access', secret: true }],
    setup: 'Settings, Account, Security & access, New API key, with Read and Write. Keep the read key as it is.', setupUrl: 'https://linear.app/settings/account/security' },
  { id: 'twilio-act', name: 'Calls and texts (Twilio)', group: 'Phone', write: true, toggle: true, reads: 'Texts people, and calls them through your phone, from your Twilio number, when you approve.',
    fields: [switchField('TWILIO_ACTIONS_ON')],
    setup: 'Uses the Twilio account on the Phone page. A call rings your mobile first and connects you, so you do the talking. A trial account can only reach numbers you verified with Twilio.', setupUrl: 'https://console.twilio.com/' },
  { id: 'composio-act', name: 'Apps through Composio', group: 'Hub', write: true, toggle: true, reads: 'Runs actions in the apps you connected in Composio (Canva, Notion, HubSpot and up to 1,694 more), when you approve each one.',
    fields: [switchField('COMPOSIO_ACTIONS_ON')],
    setup: 'Uses the Composio key on the Connections page. Reads that Composio marks read-only run without asking; everything else waits for your OK.', setupUrl: 'https://platform.composio.dev/' },
];
// Spotify playback (owner, November 4, 2026): instant, no approval card, because it only changes what your own
// Spotify plays. Its own sign-in with your own Spotify app keys; the read-only Spotify connection stays read-only.
grants.push({ id: 'spotify-play', name: 'Spotify', group: 'Media', write: true, mockOnly: true, reads: 'Plays, pauses and skips music on your Spotify when you ask out loud, and shows it in a window. Starting music needs Spotify Premium.',
  oauth: { app: 'spotify', scopes: writeScopes.spotify! }, fields: appFields('spotify'),
  setup: 'Use the same Spotify app as the Spotify connection (Spotify for Developers, then your app, with this redirect URL), then Allow. Spotify asks to control playback and read your library and playlists.', setupUrl: 'https://developer.spotify.com/dashboard' });
grants.push({ id: 'voice-in', name: 'Call Taurus from your phone', group: 'Phone', write: true, reads: 'Answers when you call your Twilio number from your own mobile and type your PIN, then does what you say after reading it back and hearing yes.',
  fields: [{ key: 'VOICE_PIN', label: 'PIN, 4 to 8 digits, typed on the keypad', secret: true }, { key: 'TAURUS_VOICE_URL', label: 'Public address that reaches this Mac', placeholder: 'https://taurus-voice.example.com' }],
  setup: 'Needs a public address for this Mac so Twilio can reach it, for example a Cloudflare Tunnel that you set up. That address only ever answers /api/voice, and only to requests signed by your Twilio account. Then in Twilio, set your number’s “A call comes in” webhook to that address plus /api/voice/incoming (HTTP POST).', setupUrl: 'https://console.twilio.com/' });
// Home and this Mac (owner, November 5, 2026: "connect it to like smart lights or curtains" and "agentic actions on like
// all ur apps"). Connecting a hub lets Taurus change lights, plugs, curtains, fans, the thermostat and scenes the moment
// you ask; locks, garage doors and gates always wait for an approval card. See home.ts and mac.ts.
grants.push(
  { id: 'home-assistant', name: 'Home Assistant', group: 'Home', write: true, mockOnly: true, reads: 'Turns lights, plugs, curtains, fans, the thermostat and scenes on and off when you ask. Locks and garage doors wait for your OK.',
    fields: [{ key: 'HA_URL', label: 'Home Assistant address', placeholder: 'http://homeassistant.local:8123' }, { key: 'HA_TOKEN', label: 'Long-lived access token', secret: true }],
    setup: 'Home Assistant connects to almost every smart home brand. In Home Assistant open your profile (bottom left), then Security, then Long-lived access tokens, Create token, and paste it here with the address you open Home Assistant at.', setupUrl: 'https://www.home-assistant.io/docs/authentication/#your-account-profile' },
  { id: 'hue', name: 'Philips Hue', group: 'Home', write: true, mockOnly: true, reads: 'Turns your Hue lights on and off, dims them, changes their colour and runs Hue scenes when you ask.',
    fields: [{ key: 'HUE_BRIDGE', label: 'Bridge address', placeholder: '192.168.1.20' }, { key: 'HUE_KEY', label: 'Bridge key (Pair fills this in)', secret: true }],
    setup: 'Press the round button on top of your Hue bridge, then Pair on the Home page within 30 seconds. Taurus finds the bridge by itself; if it can’t, type its address from the Hue app (Settings, Bridges).', setupUrl: 'https://developers.meethue.com/develop/get-started-2/' },
  { id: 'lifx', name: 'LIFX', group: 'Home', write: true, mockOnly: true, reads: 'Turns your LIFX lights on and off, dims them, changes their colour and runs LIFX scenes when you ask.',
    fields: [{ key: 'LIFX_TOKEN', label: 'Personal access token', secret: true }],
    setup: 'Sign in at cloud.lifx.com, open Settings, Generate New Token, and paste it here.', setupUrl: 'https://cloud.lifx.com/settings' },
  // November 6, 2026: more brands (home-more.ts). Everything else reaches Taurus through Home Assistant.
  { id: 'govee', name: 'Govee', group: 'Home', write: true, mockOnly: true, reads: 'Turns Govee lights, light strips, plugs, fans and heaters on and off, dims them and changes their colour when you ask.',
    fields: [{ key: 'GOVEE_API_KEY', label: 'Govee API key', secret: true }],
    setup: 'In the Govee Home app open Profile, then Settings, then Apply for API Key. Govee emails the key; paste it here.', setupUrl: 'https://developer.govee.com/docs/getting-started' },
  { id: 'switchbot', name: 'SwitchBot', group: 'Home', write: true, mockOnly: true, reads: 'Opens and closes SwitchBot curtains, roller shades and blinds, and turns plugs, Bots and bulbs on and off when you ask. Locks wait for your OK.',
    fields: [{ key: 'SWITCHBOT_TOKEN', label: 'Token', secret: true }, { key: 'SWITCHBOT_SECRET', label: 'Secret key', secret: true }],
    setup: 'In the SwitchBot app open Profile, then Preferences, tap App Version ten times, then Developer Options. Copy the token and the secret key here. Devices need a SwitchBot Hub for cloud control.', setupUrl: 'https://github.com/OpenWonderLabs/SwitchBotAPI' },
  { id: 'smartthings', name: 'SmartThings', group: 'Home', write: true, mockOnly: true, reads: 'Anything in your SmartThings home, Matter and Zigbee devices included: lights, plugs, shades and the thermostat, when you ask. Locks wait for your OK.',
    fields: [{ key: 'SMARTTHINGS_TOKEN', label: 'Personal access token', secret: true }],
    setup: 'Create a personal access token at account.smartthings.com/tokens with Devices (list, see, control) and Locations (see). Paste it here.', setupUrl: 'https://account.smartthings.com/tokens' },
  { id: 'shelly', name: 'Shelly', group: 'Home', write: true, mockOnly: true, reads: 'Shelly plugs, relays, dimmers and roller-shutter covers on your Wi-Fi, switched straight from this Mac.',
    fields: [{ key: 'SHELLY_HOSTS', label: 'Devices, one per line', placeholder: 'Desk lamp=192.168.1.40' }],
    setup: 'Give each Shelly a name and its address from the Shelly app (Device, Settings, Device information). Gen2 and later devices.', setupUrl: 'https://shelly-api-docs.shelly.cloud/gen2/' },
  { id: 'nanoleaf', name: 'Nanoleaf', group: 'Home', write: true, mockOnly: true, reads: 'Turns your Nanoleaf panels on and off, dims them, changes their colour and plays their effects.',
    fields: [{ key: 'NANOLEAF_HOST', label: 'Panels’ address', placeholder: '192.168.1.50' }, { key: 'NANOLEAF_TOKEN', label: 'Auth token', secret: true }],
    setup: 'Hold the power button on the controller for 5 to 7 seconds until the lights flash, then within 30 seconds ask Taurus to pair (or use any Nanoleaf token tool) and paste the token.', setupUrl: 'https://nanoleaf.atlassian.net/wiki/spaces/nlapid/pages/1474592/Nanoleaf+Open+API' },
  { id: 'wiz', name: 'WiZ', group: 'Home', write: true, mockOnly: true, reads: 'WiZ bulbs and lamps (including Philips WiZ) on your Wi-Fi: on, off, brightness, colour and white.',
    fields: [{ key: 'WIZ_HOSTS', label: 'Bulbs, one per line', placeholder: 'Bedroom lamp=192.168.1.61' }],
    setup: 'Find each bulb’s address in the WiZ app (Settings, Lights, the bulb, Model) and allow local communication in Settings, Security.', setupUrl: 'https://www.wizconnected.com/' },
  { id: 'yeelight', name: 'Yeelight', group: 'Home', write: true, mockOnly: true, reads: 'Yeelight bulbs and strips on your Wi-Fi: on, off, brightness, colour and white.',
    fields: [{ key: 'YEELIGHT_HOSTS', label: 'Bulbs, one per line', placeholder: 'Desk strip=192.168.1.70' }],
    setup: 'In the Yeelight app open each light, then Settings, and switch on LAN Control. Its address is in Device info.', setupUrl: 'https://www.yeelight.com/download/Yeelight_Inter-Operation_Spec.pdf' },
  { id: 'mac-control', name: 'Control this Mac', group: 'Mac', write: true, toggle: true, mockOnly: true, reads: 'Opens and switches apps, sets the volume, dark mode and display, and runs Shortcuts in your “Taurus” and “Home” folders when you ask. Quitting apps, iMessages, notes and other Shortcuts wait for your OK.',
    fields: [switchField('MAC_CONTROL_ON')],
    setup: 'macOS asks once per app the first time Taurus controls it (Privacy & Security, Automation). Shortcuts in a folder named Home also show up as scenes on the Home page, which is how Apple Home scenes reach Taurus.', setupUrl: 'https://support.apple.com/guide/shortcuts-mac/welcome/mac' },
);
export const grantDefs = (): readonly Def[] => grants;

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- ICS ----------

type Prop = { params: string; value: string };
function tzOffset(ms: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(ms).map(p => [p.type, Number(p.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - ms;
}
function icsTime({ params, value }: Prop): { ms: number; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { ms: NaN, allDay: false };
  const [y, mo, d, h = '0', mi = '0', s = '0'] = m.slice(1, 7);
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (!m[4]) return { ms: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
  if (m[7]) return { ms: asUtc, allDay: false };
  const tz = params.match(/TZID=("?)([^;:"]+)\1/)?.[2];
  try { if (tz) return { ms: asUtc - tzOffset(asUtc, tz), allDay: false }; } catch { /* unknown zone name: fall back to local time */ }
  return { ms: new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime(), allDay: false };
}
function parseIcs(text: string, from: number, to: number): CalendarEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: CalendarEvent[] = [];
  let event: Record<string, Prop> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') event = {};
    else if (line === 'END:VEVENT' && event) {
      if (event.DTSTART && event.STATUS?.value !== 'CANCELLED') out.push(...occurrences(event, from, to));
      event = null;
    } else if (event) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (m && !(m[1] in event)) event[m[1]] = { params: m[2], value: m[3] };
    }
  }
  return out;
}
// Expands DAILY and WEEKLY rules (the common meeting patterns) into today and tomorrow.
function occurrences(e: Record<string, Prop>, from: number, to: number): CalendarEvent[] {
  const start = icsTime(e.DTSTART);
  const length = e.DTEND ? icsTime(e.DTEND).ms - start.ms : start.allDay ? DAY : 3_600_000;
  const text = (p?: Prop) => p?.value.replace(/\\n/g, ' ').replace(/\\([,;\\])/g, '$1');
  const make = (ms: number): CalendarEvent => ({ id: `ics:${e.UID?.value ?? ms}:${ms}`, title: text(e.SUMMARY) || 'Busy', start: start.allDay ? new Date(ms).toLocaleDateString('en-CA') : iso(ms), end: iso(ms + length), allDay: start.allDay, location: text(e.LOCATION), source: 'Calendar' });
  const rule = Object.fromEntries((e.RRULE?.value ?? '').split(';').filter(Boolean).map(part => part.split('=')));
  if (!rule.FREQ) return start.ms < to && start.ms + length > from ? [make(start.ms)] : [];
  if (rule.FREQ !== 'DAILY' && rule.FREQ !== 'WEEKLY') return [];
  const until = rule.UNTIL ? icsTime({ params: '', value: rule.UNTIL }).ms : Infinity;
  const interval = Number(rule.INTERVAL || 1);
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const byDay: string[] = rule.BYDAY ? rule.BYDAY.split(',').map((d: string) => d.slice(-2)) : [days[new Date(start.ms).getDay()]];
  const excluded = new Set((e.EXDATE?.value ?? '').split(',').filter(Boolean).map(value => icsTime({ params: e.EXDATE!.params, value }).ms));
  const out: CalendarEvent[] = [];
  for (let k = Math.floor((from - start.ms) / DAY); k <= Math.ceil((to - start.ms) / DAY); k++) {
    const ms = start.ms + k * DAY;
    if (k < 0 || ms > until || ms >= to || ms + length <= from || excluded.has(ms)) continue;
    if (rule.FREQ === 'DAILY' && k % interval === 0) out.push(make(ms));
    if (rule.FREQ === 'WEEKLY' && byDay.includes(days[new Date(ms).getDay()]) && Math.floor(k / 7) % interval === 0) out.push(make(ms));
  }
  return out;
}

// ---------- OAuth ----------

let publicUrl = 'http://localhost:8787';
export const setPublicUrl = (url: string) => { publicUrl = url.replace(/\/$/, ''); };
const redirectUri = () => `${publicUrl}/api/oauth/callback`;
// Taurus's own sign-in service. Set TAURUS_BROKER_URL to another deployment, or to empty to turn it off.
const DEFAULT_BROKER = 'https://oxbot-signin.oxbot-signin.workers.dev';
const brokerUrl = () => (process.env.TAURUS_BROKER_URL ?? DEFAULT_BROKER).replace(/\/$/, '');
let brokerApps: Partial<Record<AppName, boolean>> = {};
// Asks the sign-in service which providers it holds keys for; refreshed every 10 minutes.
export async function checkBroker() {
  if (!brokerUrl()) { brokerApps = {}; return; }
  try { brokerApps = await api<Partial<Record<AppName, boolean>>>(`${brokerUrl()}/providers`); }
  catch (error) { console.warn('sign-in service:', error instanceof Error ? error.message : error); }
}
// A sign-in in flight. `ids` is set when one sign-in connects several connectors at once (a provider bundle, below).
// outside: started from the desktop app, so it finishes in the default browser, which then only needs closing.
const pending = new Map<string, { id: string; verifier: string; created: number; handoff?: CryptoKey; ids?: string[]; outside?: boolean; add?: boolean }>();
export const startedOutside = (key: string) => Boolean(pending.get(key)?.outside);
const errors = new Map<string, string>();

const byId = (id: string) => {
  const def = defs.find(d => d.id === id) ?? grants.find(d => d.id === id);
  if (!def) throw new Error(`Unknown connector ${id}`);
  return def;
};
const ownKeys = (app: App) => Boolean(store.secret(app.id) && store.secret(app.secret));
// Write grants never go through the sign-in service: it only ever asks providers for read access.
const oneClick = (def: Def) => Boolean(!def.write && def.oauth && !ownKeys(apps[def.oauth.app]) && brokerUrl() && brokerApps[def.oauth.app]);
const requiredFields = (def: Def) => (def.fields ?? []).filter(f => !f.optional && !f.instead && !(f.appKey && oneClick(def)));
const missing = (def: Def) => requiredFields(def).filter(f => !store.secret(f.key)).map(f => f.label);
// Connected with a personal key instead of signing in: every key it needs, plus the rest of its own fields.
const keyed = (def: Def) => {
  const keys = (def.fields ?? []).filter(f => f.instead && !f.optional);
  return keys.length > 0 && keys.every(f => store.secret(f.key)) && requiredFields(def).filter(f => !f.appKey).every(f => store.secret(f.key));
};
export const isConnected = (id: string) => { const def = byId(id); return def.oauth ? (Boolean(store.tokens(id)) && missing(def).length === 0) || keyed(def) : missing(def).length === 0; };

export function connectorInfo(): ConnectorInfo[] {
  return defs.map(def => ({
    id: def.id, name: def.name, group: def.group, reads: def.reads, auth: def.oauth ? 'oauth' : def.toggle ? 'switch' : 'fields', mockOnly: Boolean(def.mockOnly),
    connected: isConnected(def.id), ready: missing(def).length === 0, missing: missing(def), oneClick: oneClick(def),
    fields: (def.fields ?? []).map(f => ({ key: f.key, label: f.label, secret: Boolean(f.secret), appKey: Boolean(f.appKey), instead: f.instead || undefined, set: Boolean(store.secret(f.key)), value: f.secret ? undefined : store.secret(f.key), placeholder: f.placeholder })),
    setup: def.setup, setupUrl: def.setupUrl, redirectUri: def.oauth ? redirectUri() : undefined, lastError: errors.get(def.id),
    accounts: def.oauth ? accounts(def.id).map(a => ({ key: a.key, account: a.account, primary: a.primary })) : undefined,
  }));
}

export function grantInfo(): Grant[] {
  return grants.map(def => ({
    id: def.id, name: def.name, app: def.group, does: def.reads, auth: def.oauth ? 'oauth' : def.toggle ? 'switch' : 'fields',
    allowed: isConnected(def.id), ready: missing(def).length === 0, missing: missing(def), redirectUri: def.oauth ? redirectUri() : undefined,
    fields: (def.fields ?? []).map(f => ({ key: f.key, label: f.label, secret: Boolean(f.secret), appKey: Boolean(f.appKey), set: Boolean(store.secret(f.key)), value: f.secret ? undefined : store.secret(f.key), placeholder: f.placeholder })),
    setup: def.setup, setupUrl: def.setupUrl, lastError: errors.get(def.id),
  }));
}

export function saveFields(id: string, values: Record<string, string>) {
  const allowed = new Set((byId(id).fields ?? []).map(f => f.key));
  const accepted = Object.fromEntries(Object.entries(values).filter(([key, value]) => allowed.has(key) && typeof value === 'string' && value.length < 4000));
  store.setSecrets(accepted);
  errors.delete(id);
}

export function disconnect(id: string, key?: string) {
  const def = byId(id);
  // One more account: only it goes.
  if (key && key !== id) { if (key.startsWith(`${id}${SEP}`)) store.removeTokens(key); return; }
  // The first account, with more still signed in: the next one takes its place.
  const next = accounts(id).find(a => !a.primary);
  if (next && def.oauth) { store.setTokens(id, store.tokens(next.key)!); store.removeTokens(next.key); errors.delete(id); return; }
  store.removeTokens(id);
  if (!def.oauth) store.setSecrets(Object.fromEntries(requiredFields(def).map(f => [f.key, ''])));
  const keys = (def.fields ?? []).filter(f => f.instead);
  if (keys.length) store.setSecrets(Object.fromEntries(keys.map(f => [f.key, ''])));
  errors.delete(id);
}

function remember(id: string, entry: { verifier: string; handoff?: CryptoKey; ids?: string[]; outside?: boolean; add?: boolean }) {
  for (const [key, value] of pending) if (Date.now() - value.created > 600_000) pending.delete(key);
  const state = randomBytes(24).toString('base64url');
  pending.set(state, { id, created: Date.now(), ...entry });
  return state;
}

export async function startOAuth(id: string, outside = false, add = false): Promise<string> {
  const def = byId(id);
  if (!def.oauth) throw new Error(`${def.name} uses a token, not sign-in`);
  const app = apps[def.oauth.app];
  // One click: Taurus's sign-in service holds the app keys and returns tokens encrypted to this Mac.
  if (oneClick(def)) {
    const handoff = await newHandoffKey();
    const nonce = remember(id, { verifier: '', handoff: handoff.privateKey, outside, add });
    const params = new URLSearchParams({ provider: def.oauth.app, scopes: def.oauth.scopes.join(' '), return_to: `${publicUrl}/api/oauth/handoff`, nonce, key: handoff.publicKey });
    return `${brokerUrl()}/start?${params}`;
  }
  const clientId = store.secret(app.id);
  if (!clientId || !store.secret(app.secret)) throw new Error(`Add the ${app.name} client ID and secret first`);
  const verifier = randomBytes(48).toString('base64url');
  const state = remember(id, { verifier, outside, add });
  return authorizeUrl(app, clientId, redirectUri(), def.oauth.scopes, state, createHash('sha256').update(verifier).digest('base64url'));
}

// One sign-in, your whole account (owner, November 17, 2026: "a lot of things r sign in with gmail or apple account").
// Google and Microsoft each hand out mail and calendar from a single consent, so Taurus asks for both scopes at once and
// saves the one token under each connector. Read-only, same scopes as the separate sign-ins — just one tap instead of two.
export const providerBundles: { provider: AppName; name: string; ids: string[] }[] = [
  { provider: 'google', name: 'Google', ids: ['gmail', 'google-calendar'] },
  { provider: 'microsoft', name: 'Microsoft', ids: ['outlook-mail', 'outlook-calendar'] },
];

// For the web: which bundles there are, whether they're fully connected, and whether they can start with one tap.
export function bundleInfo() {
  return providerBundles.map(b => {
    const app = apps[b.provider];
    const picked = b.ids.map(byId);
    const hasOwnKeys = Boolean(store.secret(app.id) && store.secret(app.secret));
    return {
      provider: b.provider, name: b.name, ids: b.ids,
      connected: picked.every(d => isConnected(d.id)),
      oneClick: picked.every(d => oneClick(d)),
      ready: picked.every(d => oneClick(d)) || hasOwnKeys,
    };
  });
}

export async function startOAuthBundle(provider: string, outside = false, add = false): Promise<string> {
  const bundle = providerBundles.find(b => b.provider === provider);
  if (!bundle) throw new Error(`No one-tap sign-in for ${provider}`);
  const app = apps[bundle.provider];
  const picked = bundle.ids.map(byId).filter(d => d.oauth?.app === bundle.provider && !d.write);
  if (!picked.length) throw new Error(`Nothing to connect for ${bundle.name}`);
  const scopes = [...new Set(picked.flatMap(d => d.oauth!.scopes))];
  const ids = picked.map(d => d.id);
  const primary = picked[0].id;
  // One click through Taurus's sign-in service, exactly like a single connector, but with the combined scopes and id list.
  if (!ownKeys(app) && brokerUrl() && brokerApps[bundle.provider]) {
    const handoff = await newHandoffKey();
    const nonce = remember(primary, { verifier: '', handoff: handoff.privateKey, ids, outside, add });
    const params = new URLSearchParams({ provider: bundle.provider, scopes: scopes.join(' '), return_to: `${publicUrl}/api/oauth/handoff`, nonce, key: handoff.publicKey });
    return `${brokerUrl()}/start?${params}`;
  }
  const clientId = store.secret(app.id);
  if (!clientId || !store.secret(app.secret)) throw new Error(`Add the ${app.name} client ID and secret first`);
  const verifier = randomBytes(48).toString('base64url');
  const state = remember(primary, { verifier, ids, outside, add });
  return authorizeUrl(app, clientId, redirectUri(), scopes, state, createHash('sha256').update(verifier).digest('base64url'));
}

const ownKeyExchange = (app: App, body: Record<string, string>) => exchange(app, store.secret(app.id)!, store.secret(app.secret)!, body);
const take = (state: string) => {
  const entry = pending.get(state);
  pending.delete(state);
  if (!entry || Date.now() - entry.created > 600_000) throw new Error('Sign-in expired or was not started here. Try again.');
  return entry;
};

export async function finishOAuth(state: string, code: string): Promise<{ name: string; page: string }> {
  const entry = take(state);
  const def = byId(entry.id), app = apps[def.oauth!.app];
  const tokens = await ownKeyExchange(app, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(), ...(app.pkce ? { code_verifier: entry.verifier } : {}) });
  // A bundle saves the one token under each connector it covers; a single sign-in is just the one id.
  await keep(entry.ids ?? [def.id], tokens, Boolean(entry.add));
  const bundle = entry.ids && entry.ids.length > 1 ? providerBundles.find(b => b.provider === def.oauth!.app) : undefined;
  return { name: bundle?.name ?? def.name, page: def.write ? 'actions' : 'connections' };
}

export async function finishHandoff(nonce: string, payload: string): Promise<string> {
  const entry = take(nonce);
  if (!entry.handoff) throw new Error('Sign-in was not started through the Taurus sign-in service.');
  const tokens = await openSealed<TokenSet>(entry.handoff, payload);
  if (!tokens.access_token) throw new Error('The sign-in service returned no token.');
  await keep(entry.ids ?? [entry.id], { ...tokens, meta: { via: 'broker' } }, Boolean(entry.add));
  const def = byId(entry.id);
  const bundle = entry.ids && entry.ids.length > 1 ? providerBundles.find(b => b.provider === def.oauth!.app) : undefined;
  return bundle?.name ?? def.name;
}

async function accessToken(def: Def, key = def.id): Promise<string> {
  const tokens = store.tokens(key);
  if (!tokens) throw new Error('Not signed in');
  if (!tokens.expires_at || tokens.expires_at > Date.now() + 60_000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('Sign-in expired. Connect again.');
  const app = apps[def.oauth!.app];
  const fresh = tokens.meta?.via === 'broker'
    ? await api<TokenSet>(`${brokerUrl()}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: def.oauth!.app, refresh_token: tokens.refresh_token, scopes: def.oauth!.scopes }) })
    : await ownKeyExchange(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, ...(app.refreshScope ? { scope: def.oauth!.scopes.join(app.sep) } : {}) });
  store.setTokens(key, { ...tokens, ...fresh, refresh_token: fresh.refresh_token ?? tokens.refresh_token });
  return fresh.access_token;
}

// For actions and live answers: a fresh token for a connection or a write grant.
export const tokenFor = (id: string, key = id) => accessToken(byId(id), key);

// ---------- More than one account (owner, November 20, 2026: "make it so u can connect multiple gmails or multiple
// accounts") ----------
// The first account stays under the connector's own id, so everything that reads one account works as before. Each
// more account is saved under "<id>@@<its email>", found by asking the provider who signed in (Gmail's profile, the
// primary calendar, Microsoft's /me). Signing in again as an account already here refreshes it instead of adding twice.
const SEP = '@@';
export interface Account { key: string; account?: string; primary: boolean }
export function accounts(id: string): Account[] {
  const all = store.allTokens();
  const out: Account[] = all[id] ? [{ key: id, account: all[id].meta?.account, primary: true }] : [];
  for (const [key, t] of Object.entries(all)) if (key.startsWith(`${id}${SEP}`)) out.push({ key, account: t.meta?.account ?? key.slice(id.length + SEP.length), primary: false });
  return out;
}
async function whoAmI(ids: string[], token: string): Promise<string | undefined> {
  try {
    if (ids.includes('gmail')) return (await api<any>('https://gmail.googleapis.com/gmail/v1/users/me/profile', { token })).emailAddress;
    if (ids.includes('google-calendar')) return (await api<any>('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', { token })).id;
    if (ids.some(i => i.startsWith('outlook'))) { const me = await api<any>('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { token }); return me.mail ?? me.userPrincipalName; }
  } catch { /* the account just has no name then */ }
  return undefined;
}
async function keep(ids: string[], tokens: Tokens, add: boolean): Promise<string | undefined> {
  const account = await whoAmI(ids, tokens.access_token);
  for (const id of ids) {
    const have = accounts(id);
    const same = account ? have.find(a => a.account?.toLowerCase() === account.toLowerCase()) : undefined;
    const key = same?.key ?? (!add || !have.length ? id : `${id}${SEP}${account ?? `account ${have.length + 1}`}`);
    store.setTokens(key, { ...tokens, meta: { ...(tokens.meta ?? {}), ...(account ? { account } : {}) } });
    errors.delete(id);
  }
  return account;
}
// One account's items, marked with which account they came from: "Gmail · sam@example.com", ids carry the account
// ("gmail@sam@example.com:<message>") so a reply knows which mailbox it belongs to, and Gmail links open that account.
function markAccount(pull: Pull, a: Account): Pull {
  if (!a.account) return pull;
  const out: Record<string, unknown> = {};
  for (const [section, value] of Object.entries(pull as Record<string, unknown>)) {
    out[section] = Array.isArray(value) ? value.map(item => {
      if (!item || typeof item !== 'object') return item;
      const x = { ...(item as Record<string, unknown>) };
      if (typeof x.source === 'string') x.source = `${x.source} · ${a.account}`;
      if (!a.primary && typeof x.id === 'string') x.id = x.id.replace(/^([a-z-]+):/, `$1@${a.account}:`);
      if (!a.primary && typeof x.url === 'string') x.url = x.url.replace('https://mail.google.com/mail/u/0/#', `https://mail.google.com/mail/?authuser=${encodeURIComponent(a.account!)}#`);
      return x;
    }) : value;
  }
  return out as Pull;
}
function mergePulls(pulls: Pull[]): Pull {
  const out: Record<string, unknown> = {};
  for (const p of pulls) for (const [section, value] of Object.entries(p as Record<string, unknown>)) {
    if (Array.isArray(value)) out[section] = [...((out[section] as unknown[] | undefined) ?? []), ...value];
    else if (!(section in out)) out[section] = value;
  }
  return out as Pull;
}
export const noteError = (id: string, message: string) => errors.set(id, message);

export interface PullResult { id: string; name: string; group: Group; pull?: Pull; error?: string }

export async function pullAll(only?: (def: Def) => boolean): Promise<PullResult[]> {
  const live = defs.filter(def => def.pull && isConnected(def.id) && (!only || only(def)));
  const names = live.map(d => d.name);
  const step = live.length ? begin('read', `Checking ${names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', ')}`) : undefined;
  const results = await Promise.all(live.map(async def => {
    try {
      const signedIn = Boolean(def.oauth && store.tokens(def.id));
      const key = (def.fields ?? []).find(f => f.instead && store.secret(f.key));
      const token = () => signedIn || !key ? accessToken(def) : Promise.resolve(store.secret(key.key)!);
      const several = def.oauth ? accounts(def.id) : [];
      // More than one account: each is read on its own and the results are put together, marked by account. One that
      // fails doesn't hide the others; its error is noted.
      const pull = several.length > 1
        ? mergePulls((await Promise.all(several.map(a => def.pull!({ token: () => accessToken(def, a.key), field: k => store.secret(k), signedIn: true })
          .then(p => markAccount(p, a)).catch(e => { if (a.primary) throw e; errors.set(`${def.id}${SEP}${a.key}`, (e as Error).message); return undefined; }))))
          .filter((p): p is Pull => Boolean(p)))
        : await def.pull!({ token, field: k => store.secret(k), signedIn });
      errors.delete(def.id);
      return { id: def.id, name: def.name, group: def.group, pull };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.set(def.id, message);
      return { id: def.id, name: def.name, group: def.group, error: message };
    }
  }));
  const failed = results.filter(r => r.error);
  step?.done(`Checked ${live.length === 1 ? names[0] : `${live.length} apps`}${failed.length ? `, ${failed.length} didn’t answer` : ''}`, failed.map(r => `${r.name}: ${r.error}`).join('; ') || undefined);
  return results;
}
