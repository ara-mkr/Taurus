import { api } from '../store.ts';
import { appFields, DAY, endOfToday, iso, list, startOfToday, stripTags, type Def } from './kit.ts';

// Mail, calendar, chat, tasks, code and support connectors added October 31, 2026 (owner's yes, docs/decision-log.md).
// All read-only. Built from each provider's documented API and tested only against mocked responses
// (apps/server/test/connectors.test.ts); none has been tried with a real account yet.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const recent = (at: string | number | undefined, days = 3) => at !== undefined && Date.parse(String(at)) > Date.now() - days * DAY;
const dueBy = (date: string | undefined, by = endOfToday()) => Boolean(date) && Date.parse(date!.length === 10 ? `${date}T00:00:00` : date!) < by;

export const workDefs: Def[] = [
  {
    id: 'fastmail', name: 'Fastmail', group: 'Mail', mockOnly: true,
    reads: 'Unread inbox mail from the last three days: sender, subject, preview. Inbox unread count.',
    fields: [{ key: 'FASTMAIL_TOKEN', label: 'API token, read-only, Mail scope', secret: true }],
    setup: 'Fastmail → Settings → Privacy & Security → Integrations → New API token. Tick "Read-only access" and the Email scope only.', setupUrl: 'https://app.fastmail.com/settings/security/tokens',
    async pull({ field }) {
      const token = field('FASTMAIL_TOKEN');
      const session = await api<any>('https://api.fastmail.com/jmap/session', { token });
      const accountId = session.primaryAccounts?.['urn:ietf:params:jmap:mail'];
      // JMAP sends every read as a POST of method calls; only /get and /query methods are used here.
      const jmap = (methodCalls: unknown[]) => api<any>(session.apiUrl, { method: 'POST', token, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'], methodCalls }) });
      const boxes = await jmap([['Mailbox/query', { accountId, filter: { role: 'inbox' } }, 'q'], ['Mailbox/get', { accountId, '#ids': { resultOf: 'q', name: 'Mailbox/query', path: '/ids' }, properties: ['id', 'unreadEmails'] }, 'g']]);
      const inbox = boxes.methodResponses.find((r: any) => r[0] === 'Mailbox/get')?.[1]?.list?.[0];
      const mail = await jmap([
        ['Email/query', { accountId, filter: { inMailbox: inbox?.id, notKeyword: '$seen', after: iso(Date.now() - 3 * DAY) }, sort: [{ property: 'receivedAt', isAscending: false }], limit: 12 }, 'q'],
        ['Email/get', { accountId, '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' }, properties: ['id', 'subject', 'from', 'preview', 'receivedAt', 'threadId'] }, 'g'],
      ]);
      const emails = mail.methodResponses.find((r: any) => r[0] === 'Email/get')?.[1]?.list ?? [];
      return {
        inbox: [{ source: 'Fastmail', unread: inbox?.unreadEmails ?? 0, label: 'unread', url: 'https://app.fastmail.com/mail/Inbox/' }],
        needs: emails.filter((m: any) => !/no-?reply|notifications?@|newsletter/i.test(m.from?.[0]?.email ?? '')).slice(0, 8).map((m: any) => ({
          id: `fastmail:${m.id}`, title: m.subject || '(no subject)', who: m.from?.[0]?.name || m.from?.[0]?.email, from: m.from?.[0]?.email?.toLowerCase(),
          detail: m.preview, source: 'Fastmail', at: m.receivedAt, url: `https://app.fastmail.com/mail/Inbox/${m.threadId}.${m.id}`,
        })),
      };
    },
  },
  {
    id: 'calendly', name: 'Calendly', group: 'Calendar', mockOnly: true,
    reads: 'Meetings people booked with you, today and tomorrow.',
    fields: [{ key: 'CALENDLY_TOKEN', label: 'Personal access token', secret: true }],
    setup: 'Calendly → Integrations & apps → API and webhooks → Personal access tokens → Generate. If it offers scopes, choose only scheduled events: read and users: read.', setupUrl: 'https://calendly.com/integrations/api_webhooks',
    async pull({ field }) {
      const token = field('CALENDLY_TOKEN');
      const me = await api<any>('https://api.calendly.com/users/me', { token });
      const from = startOfToday();
      const data = await api<any>(`https://api.calendly.com/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&status=active&sort=start_time:asc&count=50&min_start_time=${iso(from)}&max_start_time=${iso(from + 2 * DAY)}`, { token });
      return {
        schedule: (data.collection ?? []).map((e: any) => ({
          id: `calendly:${e.uri.split('/').pop()}`, title: e.name, start: e.start_time, end: e.end_time,
          location: e.location?.type === 'physical' ? e.location.location : undefined, joinUrl: e.location?.join_url, source: 'Calendly',
        })),
      };
    },
  },
  {
    id: 'zoom', name: 'Zoom', group: 'Calendar', mockOnly: true,
    reads: 'Your upcoming Zoom meetings today and tomorrow, and cloud recordings from the last three days.',
    oauth: { app: 'zoom', scopes: ['meeting:read:list_meetings', 'cloud_recording:read:list_user_recordings', 'user:read:user'] }, fields: appFields('zoom'),
    setup: 'Zoom App Marketplace → Develop → Build app → General app (user-managed). Add the redirect URL and only these scopes: meeting:read:list_meetings, cloud_recording:read:list_user_recordings, user:read:user.', setupUrl: 'https://marketplace.zoom.us/develop/create',
    async pull({ token }) {
      const t = await token();
      const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const [meetings, recordings] = await Promise.all([
        api<any>('https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=30', { token: t }),
        api<any>(`https://api.zoom.us/v2/users/me/recordings?from=${day(Date.now() - 3 * DAY)}&to=${day(Date.now())}&page_size=10`, { token: t }),
      ]);
      const until = startOfToday() + 2 * DAY;
      return {
        schedule: (meetings.meetings ?? []).filter((m: any) => m.start_time && Date.parse(m.start_time) < until).map((m: any) => ({
          id: `zoom:${m.id}:${m.start_time}`, title: m.topic || 'Zoom meeting', start: m.start_time, end: iso(Date.parse(m.start_time) + (m.duration ?? 30) * 60_000), joinUrl: m.join_url, source: 'Zoom',
        })),
        updates: (recordings.meetings ?? []).map((r: any) => ({ id: `zoom-rec:${r.uuid}`, title: `Recording ready: ${r.topic}`, source: 'Zoom', at: r.start_time, url: r.share_url })),
      };
    },
  },
  {
    id: 'discord', name: 'Discord', group: 'Chat', mockOnly: true,
    reads: 'Messages that mention you in the channels you list, from the last three days.',
    fields: [
      { key: 'DISCORD_BOT_TOKEN', label: 'Bot token', secret: true },
      { key: 'DISCORD_CHANNEL_IDS', label: 'Channel IDs, comma separated' },
      { key: 'DISCORD_USER_ID', label: 'Your user ID' },
    ],
    setup: 'Discord has no read-only token, so Taurus uses a bot that can only read: Developer Portal → New Application → Bot → copy the token and turn on Message Content Intent. Invite it with only View Channels and Read Message History. Turn on Developer Mode to copy channel and user IDs. Taurus only reads; it never posts.', setupUrl: 'https://discord.com/developers/applications',
    async pull({ field }) {
      const auth = { Authorization: `Bot ${field('DISCORD_BOT_TOKEN')}` };
      const me = field('DISCORD_USER_ID')!;
      const channels = await Promise.all(list(field('DISCORD_CHANNEL_IDS')).slice(0, 10).map(async id => {
        const [channel, messages] = await Promise.all([
          api<any>(`https://discord.com/api/v10/channels/${id}`, { headers: auth }),
          api<any[]>(`https://discord.com/api/v10/channels/${id}/messages?limit=50`, { headers: auth }),
        ]);
        return messages.filter(m => recent(m.timestamp) && (m.mentions ?? []).some((u: any) => u.id === me)).map(m => ({
          id: `discord:${m.id}`, title: (m.content ?? '').replace(/<@!?(\d+)>/g, (_: string, uid: string) => uid === me ? '@you' : '@someone').slice(0, 160) || '(attachment)',
          who: m.author?.global_name ?? m.author?.username, detail: `#${channel.name}`, source: 'Discord', at: m.timestamp,
          url: channel.guild_id ? `https://discord.com/channels/${channel.guild_id}/${id}/${m.id}` : undefined,
        }));
      }));
      const mentions = channels.flat().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      return { needs: mentions.slice(0, 6), inbox: [{ source: 'Discord', unread: mentions.filter(m => Date.parse(m.at) > startOfToday()).length, label: 'mentions today' }] };
    },
  },
  {
    id: 'telegram', name: 'Telegram', group: 'Chat', mockOnly: true,
    reads: 'Messages people sent to your own Taurus bot, or in groups you added it to, from the last day.',
    fields: [{ key: 'TELEGRAM_BOT_TOKEN', label: 'Bot token from @BotFather', secret: true }],
    setup: 'Telegram only lets apps read through a bot, and bot tokens have no read-only option. In Telegram, message @BotFather, send /newbot, and paste the token here. People reach you by messaging that bot. Taurus only calls getUpdates and never sends.', setupUrl: 'https://core.telegram.org/bots/tutorial#obtain-your-bot-token',
    async pull({ field }) {
      // No offset is sent, so reading never marks anything as handled; Telegram keeps updates for 24 hours.
      const data = await api<any>(`https://api.telegram.org/bot${field('TELEGRAM_BOT_TOKEN')}/getUpdates?limit=100&allowed_updates=${encodeURIComponent('["message"]')}`);
      if (!data.ok) throw new Error(`Telegram: ${data.description}`);
      const messages = (data.result ?? []).map((u: any) => u.message).filter((m: any) => m?.text && m.date * 1000 > Date.now() - DAY);
      return {
        inbox: [{ source: 'Telegram', unread: messages.length, label: 'messages today' }],
        needs: messages.reverse().slice(0, 6).map((m: any) => ({
          id: `telegram:${m.chat.id}:${m.message_id}`, title: m.text.slice(0, 160), who: [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username,
          detail: m.chat.type === 'private' ? 'Direct message' : m.chat.title, source: 'Telegram', at: iso(m.date * 1000),
          url: m.chat.username ? `https://t.me/${m.chat.username}/${m.message_id}` : undefined,
        })),
      };
    },
  },
  {
    id: 'teams', name: 'Microsoft Teams', group: 'Chat', mockOnly: true,
    reads: 'Chats with a new message you haven’t read, from the last three days.',
    oauth: { app: 'microsoft', scopes: ['offline_access', 'User.Read', 'Chat.Read'] }, fields: appFields('microsoft'),
    setup: 'Same Microsoft app as Outlook. Add the delegated permission Chat.Read. Work tenants may need an admin to approve it.', setupUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    async pull({ token }) {
      const t = await token();
      const [me, chats] = await Promise.all([
        api<any>('https://graph.microsoft.com/v1.0/me?$select=id', { token: t }),
        api<any>('https://graph.microsoft.com/v1.0/me/chats?$expand=lastMessagePreview&$top=25&$orderby=lastMessagePreview/createdDateTime%20desc', { token: t }),
      ]);
      const unread = (chats.value ?? []).filter((c: any) => {
        const last = c.lastMessagePreview;
        if (!last || last.from?.user?.id === me.id || !recent(last.createdDateTime)) return false;
        const read = c.viewpoint?.lastMessageReadDateTime;
        return !read || Date.parse(read) < Date.parse(last.createdDateTime);
      });
      return {
        inbox: [{ source: 'Teams', unread: unread.length, label: 'unread chats', url: 'https://teams.microsoft.com/' }],
        needs: unread.slice(0, 6).map((c: any) => ({
          id: `teams:${c.id}`, title: stripTags(c.lastMessagePreview.body?.content).slice(0, 160) || '(attachment)', who: c.lastMessagePreview.from?.user?.displayName,
          detail: c.topic ?? (c.chatType === 'oneOnOne' ? 'Direct message' : 'Group chat'), source: 'Teams', at: c.lastMessagePreview.createdDateTime, url: c.webUrl,
        })),
      };
    },
  },
  {
    id: 'todoist', name: 'Todoist', group: 'Tasks', mockOnly: true,
    reads: 'Tasks due today or overdue, highest priority first.',
    oauth: { app: 'todoist', scopes: ['data:read'] }, fields: appFields('todoist'),
    setup: 'Todoist App Management Console → Create a new app. Add the redirect URL. Taurus asks only for data:read.', setupUrl: 'https://developer.todoist.com/appconsole.html',
    async pull({ token }) {
      const data = await api<any>(`https://api.todoist.com/api/v1/tasks/filter?query=${encodeURIComponent('today | overdue')}&limit=50`, { token: await token() });
      const tasks = (data.results ?? []).sort((a: any, b: any) => b.priority - a.priority || String(a.due?.date).localeCompare(String(b.due?.date)));
      return {
        needs: tasks.slice(0, 8).map((task: any) => ({
          id: `todoist:${task.id}`, title: task.content, detail: [task.priority === 4 ? 'Priority 1' : task.priority === 3 ? 'Priority 2' : '', dueBy(task.due?.date, startOfToday()) ? 'Overdue' : 'Due today'].filter(Boolean).join(' · '),
          source: 'Todoist', at: task.updated_at ?? task.added_at ?? iso(Date.now()), url: `https://app.todoist.com/app/task/${task.id}`,
        })),
      };
    },
  },
  {
    id: 'asana', name: 'Asana', group: 'Tasks', mockOnly: true,
    reads: 'Your incomplete tasks due today or earlier, in your first workspace.',
    oauth: { app: 'asana', scopes: ['tasks:read', 'projects:read', 'users:read', 'workspaces:read'] }, fields: appFields('asana'),
    setup: 'Asana developer console → Create new app. Add the redirect URL and choose only read scopes (tasks, projects, users, workspaces).', setupUrl: 'https://app.asana.com/0/my-apps',
    async pull({ token }) {
      const t = await token();
      const me = await api<any>('https://app.asana.com/api/1.0/users/me?opt_fields=workspaces.gid', { token: t });
      const workspace = me.data?.workspaces?.[0]?.gid;
      if (!workspace) return { needs: [] };
      const data = await api<any>(`https://app.asana.com/api/1.0/tasks?assignee=me&workspace=${workspace}&completed_since=now&limit=50&opt_fields=name,due_on,due_at,permalink_url,modified_at`, { token: t });
      return {
        needs: (data.data ?? []).filter((task: any) => dueBy(task.due_at ?? task.due_on)).slice(0, 8).map((task: any) => ({
          id: `asana:${task.gid}`, title: task.name, detail: dueBy(task.due_at ?? task.due_on, startOfToday()) ? 'Overdue' : 'Due today', source: 'Asana', at: task.modified_at, url: task.permalink_url,
        })),
      };
    },
  },
  {
    id: 'trello', name: 'Trello', group: 'Tasks', mockOnly: true,
    reads: 'Open cards on your boards that are due within a day or overdue.',
    fields: [{ key: 'TRELLO_KEY', label: 'API key' }, { key: 'TRELLO_TOKEN', label: 'Read-only token', secret: true }],
    setup: 'Create a Power-Up to get an API key, then open https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key=YOUR_KEY and allow it. That token can only read.', setupUrl: 'https://trello.com/power-ups/admin',
    async pull({ field }) {
      const auth = { Authorization: `OAuth oauth_consumer_key="${field('TRELLO_KEY')}", oauth_token="${field('TRELLO_TOKEN')}"` };
      const cards = await api<any[]>('https://api.trello.com/1/members/me/cards?filter=open&fields=name,due,dueComplete,url,dateLastActivity', { headers: auth });
      return {
        needs: cards.filter(c => c.due && !c.dueComplete && Date.parse(c.due) < Date.now() + DAY).sort((a, b) => Date.parse(a.due) - Date.parse(b.due)).slice(0, 8).map(c => ({
          id: `trello:${c.id}`, title: c.name, detail: Date.parse(c.due) < Date.now() ? 'Overdue' : 'Due soon', source: 'Trello', at: c.dateLastActivity, url: c.url,
        })),
      };
    },
  },
  {
    id: 'jira', name: 'Jira', group: 'Tasks', mockOnly: true,
    reads: 'Issues assigned to you that are high priority or due within a day and not done.',
    oauth: { app: 'atlassian', scopes: ['read:jira-work', 'read:jira-user', 'offline_access'] }, fields: appFields('atlassian'),
    setup: 'Atlassian developer console → Create → OAuth 2.0 integration. Add the redirect URL, then under Permissions add Jira API with only read:jira-work and read:jira-user.', setupUrl: 'https://developer.atlassian.com/console/myapps/',
    async pull({ token }) {
      const t = await token();
      const sites = await api<any[]>('https://api.atlassian.com/oauth/token/accessible-resources', { token: t });
      const site = sites[0];
      if (!site) return { needs: [] };
      const jql = 'assignee = currentUser() AND statusCategory != Done AND (priority in (Highest, High) OR duedate <= 1d) ORDER BY updated DESC';
      const data = await api<any>(`https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,priority,status,duedate,updated&maxResults=10`, { token: t });
      return {
        needs: (data.issues ?? []).map((i: any) => ({
          id: `jira:${i.id}`, title: `${i.key} ${i.fields.summary}`, detail: [i.fields.priority?.name, i.fields.status?.name, i.fields.duedate && `due ${i.fields.duedate}`].filter(Boolean).join(' · '),
          source: 'Jira', at: i.fields.updated, url: `${site.url}/browse/${i.key}`,
        })),
      };
    },
  },
  {
    id: 'monday', name: 'monday.com', group: 'Tasks', mockOnly: true,
    reads: 'Items assigned to you on your ten most used boards that aren’t marked done.',
    oauth: { app: 'monday', scopes: ['me:read', 'boards:read'] }, fields: appFields('monday'),
    setup: 'monday.com → Developers → Build app → OAuth. Add the redirect URL and only the scopes me:read and boards:read.', setupUrl: 'https://auth.monday.com/developers',
    async pull({ token }) {
      // monday.com has only a GraphQL API; this is a query, never a mutation.
      const query = '{ me { id name } boards(limit: 10, order_by: used_at) { name items_page(limit: 50) { items { id name updated_at url column_values { type text } } } } }';
      const data = await api<any>('https://api.monday.com/v2', { method: 'POST', token: await token(), headers: { 'Content-Type': 'application/json', 'API-Version': '2025-10' }, body: JSON.stringify({ query }) });
      if (data.errors?.length) throw new Error(`monday.com: ${data.errors[0].message}`);
      const me = data.data.me.name;
      const items = (data.data.boards ?? []).flatMap((b: any) => (b.items_page?.items ?? []).map((i: any) => ({ ...i, board: b.name })))
        .filter((i: any) => i.column_values.some((c: any) => c.type === 'people' && (c.text ?? '').includes(me)) && !i.column_values.some((c: any) => c.type === 'status' && /^done|complete/i.test(c.text ?? '')));
      return {
        needs: items.slice(0, 8).map((i: any) => ({ id: `monday:${i.id}`, title: i.name, detail: [i.board, i.column_values.find((c: any) => c.type === 'status')?.text].filter(Boolean).join(' · '), source: 'monday.com', at: i.updated_at, url: i.url })),
      };
    },
  },
  {
    id: 'google-tasks', name: 'Google Tasks', group: 'Tasks', mockOnly: true,
    reads: 'Tasks due today or earlier from all your task lists.',
    oauth: { app: 'google', scopes: ['https://www.googleapis.com/auth/tasks.readonly'] }, fields: appFields('google'),
    setup: 'Same Google OAuth client as Gmail. Enable the Google Tasks API.', setupUrl: 'https://console.cloud.google.com/apis/library/tasks.googleapis.com',
    async pull({ token }) {
      const t = await token();
      const lists = await api<any>('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=10', { token: t });
      const tasks = await Promise.all((lists.items ?? []).map((l: any) => api<any>(`https://tasks.googleapis.com/tasks/v1/lists/${l.id}/tasks?showCompleted=false&maxResults=20&dueMax=${encodeURIComponent(iso(endOfToday()))}`, { token: t }).then(r => (r.items ?? []).map((task: any) => ({ ...task, list: l.title })))));
      return {
        needs: tasks.flat().filter((task: any) => task.title).slice(0, 8).map((task: any) => ({
          id: `gtasks:${task.id}`, title: task.title, detail: [task.list, task.due && Date.parse(task.due) < startOfToday() ? 'Overdue' : 'Due today'].join(' · '), source: 'Google Tasks', at: task.updated, url: task.webViewLink,
        })),
      };
    },
  },
  {
    id: 'microsoft-todo', name: 'Microsoft To Do', group: 'Tasks', mockOnly: true,
    reads: 'Open tasks that are due today or earlier, or marked important.',
    oauth: { app: 'microsoft', scopes: ['offline_access', 'User.Read', 'Tasks.Read'] }, fields: appFields('microsoft'),
    setup: 'Same Microsoft app as Outlook. Add the delegated permission Tasks.Read.', setupUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    async pull({ token }) {
      const t = await token();
      const lists = await api<any>('https://graph.microsoft.com/v1.0/me/todo/lists', { token: t });
      const tasks = await Promise.all((lists.value ?? []).slice(0, 10).map((l: any) => api<any>(`https://graph.microsoft.com/v1.0/me/todo/lists/${l.id}/tasks?$filter=${encodeURIComponent("status ne 'completed'")}&$top=25`, { token: t }).then(r => (r.value ?? []).map((task: any) => ({ ...task, list: l.displayName })))));
      return {
        needs: tasks.flat().filter((task: any) => task.importance === 'high' || dueBy(task.dueDateTime?.dateTime && `${task.dueDateTime.dateTime.slice(0, 19)}Z`)).slice(0, 8).map((task: any) => ({
          id: `todo:${task.id}`, title: task.title, detail: [task.list, task.importance === 'high' ? 'Important' : 'Due'].join(' · '), source: 'To Do', at: task.lastModifiedDateTime, url: 'https://to-do.office.com/tasks/',
        })),
      };
    },
  },
  {
    id: 'gitlab', name: 'GitLab', group: 'Code', mockOnly: true,
    reads: 'Open merge requests waiting on your review.',
    fields: [{ key: 'GITLAB_TOKEN', label: 'Personal access token, read_api scope', secret: true }, { key: 'GITLAB_URL', label: 'GitLab address', optional: true, placeholder: 'https://gitlab.com' }],
    setup: 'GitLab → Preferences → Access tokens → Add new token. Tick only read_api.', setupUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
    async pull({ field }) {
      const base = (field('GITLAB_URL') || 'https://gitlab.com').replace(/\/$/, '');
      const headers = { 'PRIVATE-TOKEN': field('GITLAB_TOKEN')! };
      const me = await api<any>(`${base}/api/v4/user`, { headers });
      const mrs = await api<any[]>(`${base}/api/v4/merge_requests?scope=all&state=opened&reviewer_username=${encodeURIComponent(me.username)}&per_page=10`, { headers });
      return { needs: mrs.map(mr => ({ id: `gitlab:${mr.id}`, title: mr.title, who: mr.author?.username, detail: `Review requested · ${mr.references?.full ?? ''}`.trim(), source: 'GitLab', at: mr.updated_at, url: mr.web_url })) };
    },
  },
  {
    id: 'sentry', name: 'Sentry', group: 'Code', mockOnly: true,
    reads: 'The five unresolved issues with the most events in the last day.',
    fields: [{ key: 'SENTRY_TOKEN', label: 'Auth token (event:read, project:read, org:read)', secret: true }, { key: 'SENTRY_ORG', label: 'Organization slug' }, { key: 'SENTRY_URL', label: 'Sentry address', optional: true, placeholder: 'https://sentry.io' }],
    setup: 'Sentry → Settings → Account → Personal Tokens → Create. Give only event:read, project:read and org:read.', setupUrl: 'https://sentry.io/settings/account/api/auth-tokens/',
    async pull({ field }) {
      const base = (field('SENTRY_URL') || 'https://sentry.io').replace(/\/$/, '');
      const issues = await api<any[]>(`${base}/api/0/organizations/${encodeURIComponent(field('SENTRY_ORG')!)}/issues/?query=${encodeURIComponent('is:unresolved')}&statsPeriod=24h&sort=freq&limit=5`, { token: field('SENTRY_TOKEN') });
      return { needs: issues.map(i => ({ id: `sentry:${i.id}`, title: i.title, detail: `${i.count} events today · ${i.project?.slug ?? ''}`.trim(), source: 'Sentry', at: i.lastSeen, url: i.permalink })) };
    },
  },
  {
    id: 'pagerduty', name: 'PagerDuty', group: 'Code', mockOnly: true,
    reads: 'Incidents that are triggered or acknowledged right now.',
    fields: [{ key: 'PAGERDUTY_TOKEN', label: 'Read-only API key', secret: true }],
    setup: 'PagerDuty → Integrations → API Access Keys → Create New API Key. Tick "Read-only API Key".', setupUrl: 'https://support.pagerduty.com/main/docs/api-access-keys',
    async pull({ field }) {
      const data = await api<any>('https://api.pagerduty.com/incidents?statuses[]=triggered&statuses[]=acknowledged&limit=10&sort_by=created_at:desc', { headers: { Authorization: `Token token=${field('PAGERDUTY_TOKEN')}`, Accept: 'application/vnd.pagerduty+json;version=2' } });
      return {
        needs: (data.incidents ?? []).sort((a: any, b: any) => Number(b.urgency === 'high') - Number(a.urgency === 'high')).map((i: any) => ({
          id: `pagerduty:${i.id}`, title: i.title, detail: [i.urgency === 'high' ? 'High urgency' : 'Low urgency', i.status, i.service?.summary].filter(Boolean).join(' · '), source: 'PagerDuty', at: i.created_at, url: i.html_url,
        })),
      };
    },
  },
  {
    id: 'intercom', name: 'Intercom', group: 'Sales', mockOnly: true,
    reads: 'Open customer conversations assigned to you.',
    fields: [{ key: 'INTERCOM_TOKEN', label: 'Access token (Read conversations, Read admins)', secret: true }],
    setup: 'Intercom Developer Hub → New app → Authentication. Under permissions keep only "Read conversations" and "Read admins", then copy the access token.', setupUrl: 'https://app.intercom.com/a/apps/_/developer-hub',
    async pull({ field }) {
      const headers = { 'Intercom-Version': '2.11', 'Content-Type': 'application/json' };
      const token = field('INTERCOM_TOKEN');
      const me = await api<any>('https://api.intercom.io/me', { token, headers });
      // Intercom's search is a POST that reads; it changes nothing.
      const data = await api<any>('https://api.intercom.io/conversations/search', {
        method: 'POST', token, headers,
        body: JSON.stringify({ query: { operator: 'AND', value: [{ field: 'open', operator: '=', value: true }, { field: 'admin_assignee_id', operator: '=', value: me.id }] }, pagination: { per_page: 10 } }),
      });
      return {
        needs: (data.conversations ?? []).map((c: any) => ({
          id: `intercom:${c.id}`, title: c.title || stripTags(c.source?.subject) || stripTags(c.source?.body).slice(0, 160) || 'Conversation', who: c.source?.author?.name,
          detail: 'Open conversation', source: 'Intercom', at: new Date((c.updated_at ?? c.created_at) * 1000).toISOString(), url: `https://app.intercom.com/a/inbox/_/inbox/conversation/${c.id}`,
        })),
      };
    },
  },
];
