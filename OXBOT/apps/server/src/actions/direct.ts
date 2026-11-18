import { isConnected, tokenFor } from '../connectors.ts';
import { dashboard } from '../dashboard.ts';
import { phoneNumber, trialRefused, twilioErrors, viaEcho, xml } from '../ring.ts';
import { api, HttpError, store } from '../store.ts';
import type { Need } from '../types.ts';
import { register, type Args, type Spec } from './approvals.ts';

// Actions straight against each provider's documented API (owner, November 1, 2026). Each one runs only from
// approve() in approvals.ts. Built from the providers' documentation, tested only against mocked responses.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const oneLine = (text: unknown, max = 300) => String(text ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const body = (text: unknown) => String(text ?? '').replace(/\r\n/g, '\n').trim().slice(0, 8000);
const email = (value: unknown) => {
  const v = oneLine(value, 254).toLowerCase();
  if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/.test(v)) throw new HttpError(400, `“${oneLine(value, 80)}” isn’t an email address. Use the exact address, not a name.`);
  return v;
};
const need = async (id: unknown, prefix: string): Promise<Need> => {
  const d = await dashboard();
  const found = d.sections.needs.live ? d.needs.find(n => n.id === id) : undefined;
  if (!found || !String(id).startsWith(prefix)) throw new HttpError(400, `OXBOT can’t find that ${prefix.replace(':', '')} item on your live board. Ask again after it refreshes.`);
  return found;
};
const missing = (...pairs: [boolean, string][]) => pairs.find(([ok]) => !ok)?.[1];
const missingMail = (app: string) => (error: unknown) => {
  if (error instanceof HttpError && (error.status === 404 || error.status === 400)) throw new HttpError(404, `${app} can’t find that email. Search for it again.`);
  throw error;
};

// ---------- Email: Gmail and Outlook ----------

const mailFrom = (args: Args) => {
  const choice = args.account === 'outlook' ? 'outlook-send' : args.account === 'gmail' ? 'gmail-send' : isConnected('gmail-send') ? 'gmail-send' : 'outlook-send';
  if (!isConnected(choice)) throw new HttpError(409, `${choice === 'gmail-send' ? 'Gmail' : 'Outlook'} isn’t allowed to send yet. Settings, then Actions.`);
  return choice;
};
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
// RFC 2822 with UTF-8 everywhere; headers are single lines, so a subject can never add a header.
function rfc822(h: { to: string; subject: string; inReplyTo?: string }, text: string) {
  const subject = /^[\x20-\x7e]*$/.test(h.subject) ? h.subject : `=?UTF-8?B?${b64(h.subject)}?=`;
  return [`To: ${h.to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64',
    ...(h.inReplyTo ? [`In-Reply-To: ${h.inReplyTo}`, `References: ${h.inReplyTo}`] : []), '', b64(text).replace(/.{76}/g, '$&\r\n')].join('\r\n');
}
const gmailSend = async (raw: string, threadId?: string) => {
  const sent = await api<any>('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', token: await tokenFor('gmail-send'), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url'), ...(threadId ? { threadId } : {}) }),
  });
  return `Sent from Gmail (message ${sent.id ?? 'id not returned'}).`;
};
const graph = async (path: string, payload: unknown) => {
  await api('https://graph.microsoft.com/v1.0' + path, { method: 'POST', token: await tokenFor('outlook-send'), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
};

const mail: Spec[] = [
  {
    kind: 'email.send', app: 'Email', editable: true,
    help: 'Send a new email. Args: to (exact address), subject, text, account ("gmail" or "outlook", optional).',
    missing: () => missing([isConnected('gmail-send') || isConnected('outlook-send'), 'Allow Gmail or Outlook to send first: Settings, then Actions.']),
    async prepare(args) {
      const account = mailFrom(args), to = email(args.to), subject = oneLine(args.subject, 200) || '(no subject)', text = body(args.text);
      if (!text) throw new HttpError(400, 'The email has no text.');
      return { title: `Email ${to}`, to, text, lines: [{ label: 'Subject', value: subject }, { label: 'From', value: account === 'gmail-send' ? 'Gmail' : 'Outlook' }], payload: { account, to, subject, text } };
    },
    async run(p) {
      if (p.account === 'gmail-send') return gmailSend(rfc822({ to: p.to, subject: p.subject }, p.text));
      await graph('/me/sendMail', { message: { subject: p.subject, body: { contentType: 'Text', content: p.text }, toRecipients: [{ emailAddress: { address: p.to } }] }, saveToSentItems: true });
      return 'Sent from Outlook.';
    },
  },
  {
    // Any real message: one on the board, or one search_mail found. Fetching it with the read sign-in proves it exists.
    kind: 'email.reply', app: 'Email', editable: true,
    help: 'Reply to an email: one on the board or one found with search_mail. Args: need (its id, like "gmail:…" or "outlook:…"), text.',
    missing: () => missing([isConnected('gmail-send') || isConnected('outlook-send'), 'Allow Gmail or Outlook to send first: Settings, then Actions.']),
    async prepare(args) {
      const text = body(args.text);
      if (!text) throw new HttpError(400, 'The reply has no text.');
      if (String(args.need).startsWith('gmail:')) {
        if (!isConnected('gmail-send')) throw new HttpError(409, 'Gmail isn’t allowed to send yet. Settings, then Actions.');
        const id = String(args.need).slice(6);
        const m = await api<any>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Reply-To`, { token: await tokenFor('gmail') }).catch(missingMail('Gmail'));
        const h: Record<string, string> = Object.fromEntries((m.payload?.headers ?? []).map((x: any) => [x.name.toLowerCase(), x.value]));
        const to = email((h['reply-to'] ?? h.from ?? '').match(/<([^>]+)>/)?.[1] ?? h['reply-to'] ?? h.from);
        const subject = /^re:/i.test(h.subject ?? '') ? h.subject : `Re: ${h.subject ?? ''}`.trim();
        return { title: `Reply to ${to}`, to, text, lines: [{ label: 'Subject', value: oneLine(subject, 200) }, { label: 'From', value: 'Gmail, in the same thread' }], payload: { account: 'gmail-send', to, subject: oneLine(subject, 200), text, threadId: m.threadId, inReplyTo: oneLine(h['message-id'], 300) } };
      }
      if (String(args.need).startsWith('outlook:')) {
        if (!isConnected('outlook-send')) throw new HttpError(409, 'Outlook isn’t allowed to send yet. Settings, then Actions.');
        const id = String(args.need).slice(8);
        const m = await api<any>(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}?$select=subject,from`, { token: await tokenFor('outlook-mail') }).catch(missingMail('Outlook'));
        const to = email(m.from?.emailAddress?.address);
        return { title: `Reply to ${to}`, to, text, lines: [{ label: 'Subject', value: oneLine(`Re: ${m.subject ?? ''}`, 200) }, { label: 'From', value: 'Outlook, in the same thread' }], payload: { account: 'outlook-send', id, to, text } };
      }
      throw new HttpError(400, 'Reply needs the id of a Gmail or Outlook email on the board.');
    },
    async run(p) {
      if (p.account === 'gmail-send') return gmailSend(rfc822({ to: p.to, subject: p.subject, inReplyTo: p.inReplyTo || undefined }, p.text), p.threadId);
      await graph(`/me/messages/${encodeURIComponent(p.id)}/reply`, { comment: p.text });
      return 'Replied from Outlook.';
    },
  },
];

// ---------- Slack ----------

const slack = async (method: string, payload: Args) => {
  const reply = await api<any>(`https://slack.com/api/${method}`, { method: 'POST', token: store.secret('SLACK_ACTION_TOKEN'), headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
  if (!reply.ok) throw new HttpError(400, `Slack said: ${reply.error}`);
  return reply;
};
const slackNeed = async (id: unknown) => {
  const n = await need(id, 'slack:');
  const [, channel, ts] = String(id).split(':');
  return { n, channel, ts, where: n.detail === 'Direct message' ? `${n.who ?? 'a direct message'}` : n.detail ?? channel };
};
const slackReady = () => missing([isConnected('slack-act'), 'Allow Slack to post first: Settings, then Actions.']);
const chat: Spec[] = [
  {
    kind: 'slack.post', app: 'Slack', editable: true, missing: slackReady,
    help: 'Post a message in a Slack channel. Args: channel (channel ID or #name), text.',
    async prepare(args) {
      const channel = oneLine(args.channel, 80), text = body(args.text).slice(0, 3000);
      if (!/^(#[\w.-]+|[CDG][A-Z0-9]{6,})$/.test(channel)) throw new HttpError(400, 'Name the Slack channel exactly, like #leadership.');
      if (!text) throw new HttpError(400, 'The message has no text.');
      return { title: `Post in ${channel}`, to: channel, text, payload: { channel, text } };
    },
    async run(p) { const r = await slack('chat.postMessage', { channel: p.channel, text: p.text }); return `Posted in Slack (${r.ts}).`; },
  },
  {
    kind: 'slack.reply', app: 'Slack', editable: true, missing: slackReady,
    help: 'Reply in the thread of a Slack message on the board. Args: need (its id, "slack:…"), text.',
    async prepare(args) {
      const { n, channel, ts, where } = await slackNeed(args.need);
      const text = body(args.text).slice(0, 3000);
      if (!text) throw new HttpError(400, 'The reply has no text.');
      return { title: `Reply in ${where}`, to: where, text, lines: [{ label: 'Replying to', value: oneLine(n.title, 160) }], payload: { channel, thread_ts: ts, text } };
    },
    async run(p) { await slack('chat.postMessage', p); return 'Replied in the Slack thread.'; },
  },
  {
    kind: 'slack.react', app: 'Slack', missing: slackReady,
    help: 'Add an emoji reaction to a Slack message on the board. Args: need ("slack:…"), emoji (a Slack name like "white_check_mark").',
    async prepare(args) {
      const { n, channel, ts, where } = await slackNeed(args.need);
      const name = oneLine(args.emoji, 60).replace(/:/g, '');
      if (!/^[\w+-]+$/.test(name)) throw new HttpError(400, 'Use a Slack emoji name like thumbsup.');
      return { title: `React :${name}: in ${where}`, to: where, lines: [{ label: 'On', value: oneLine(n.title, 160) }], payload: { channel, timestamp: ts, name } };
    },
    async run(p) { await slack('reactions.add', p); return 'Reaction added.'; },
  },
];

// ---------- Texts and calls through Twilio ----------

const twilioReady = () => missing([isConnected('twilio'), 'Set up Twilio on the Phone page first.'], [isConnected('twilio-act'), 'Allow calls and texts first: Settings, then Actions.']);
const number = (value: unknown) => {
  const n = phoneNumber(oneLine(value, 40));
  if (!n) throw new HttpError(400, `“${oneLine(value, 40)}” isn’t a phone number OXBOT can dial. Use the + and country code.`);
  return n;
};
const masked = (n: string) => `${n.slice(0, -4).replace(/\d/g, '•')}${n.slice(-4)}`;
async function twilio(path: 'Messages' | 'Calls', form: Record<string, string>) {
  const sid = store.secret('TWILIO_ACCOUNT_SID')!.trim(), token = store.secret('TWILIO_AUTH_TOKEN')!.trim();
  const post = (fields: Record<string, string>) => fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${path}.json`, {
    method: 'POST', signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: phoneNumber(store.secret('TWILIO_FROM') ?? ''), ...fields }),
  });
  let response = await post(form);
  let data = await response.json().catch(() => ({})) as { sid?: string; code?: number; message?: string };
  if (path === 'Calls' && trialRefused(response.status, data.message)) {
    response = await post(viaEcho(form));
    data = await response.json().catch(() => ({})) as { sid?: string; code?: number; message?: string };
  }
  if (!response.ok) throw new HttpError(response.status, (data.code && twilioErrors[data.code]) || `Twilio said: ${data.message ?? response.status}`);
  return data.sid ?? '';
}
const phone: Spec[] = [
  {
    kind: 'text.send', app: 'Text message', editable: true, missing: twilioReady,
    help: 'Text someone from your Twilio number. Args: to (phone number with country code), name (optional), text.',
    async prepare(args) {
      const to = number(args.to), text = body(args.text).slice(0, 1200), name = oneLine(args.name, 60);
      if (!text) throw new HttpError(400, 'The text has no words.');
      return { title: `Text ${name || to}`, to, text, lines: name ? [{ label: 'Number', value: to }] : [], payload: { to, text } };
    },
    async run(p) { await twilio('Messages', { To: p.to, Body: p.text }); return `Texted ${masked(p.to)}.`; },
  },
  {
    // The call rings your mobile first and then dials them, so you are the one talking: no robot voice to anyone else.
    kind: 'call.connect', app: 'Phone call',
    help: 'Call someone: OXBOT rings your mobile, then connects you to them. Args: to (phone number), name (optional).',
    missing: twilioReady,
    async prepare(args) {
      const to = number(args.to), name = oneLine(args.name, 60), mine = phoneNumber(store.secret('MY_PHONE') ?? '');
      if (!mine) throw new HttpError(409, 'Add your mobile number on the Phone page first.');
      if (to === mine) throw new HttpError(400, 'That’s your own number.');
      return { title: `Call ${name || to}`, to, lines: [{ label: 'Number', value: to }, { label: 'How', value: 'Your phone rings first, then OXBOT connects you.' }], payload: { to, name, mine } };
    },
    async run(p) {
      const twiml = `<Response><Say>Connecting you to ${xml(p.name || 'your call')}.</Say><Dial callerId="${xml(phoneNumber(store.secret('TWILIO_FROM') ?? ''))}">${xml(p.to)}</Dial></Response>`;
      await twilio('Calls', { To: p.mine, Twiml: twiml, Timeout: '30' });
      return `Calling your phone now, then ${p.name || masked(p.to)}.`;
    },
  },
  {
    kind: 'call.message', app: 'Phone call', editable: true, missing: twilioReady,
    help: 'Call someone and have OXBOT read them a message. Only when you asked for that. Args: to, name (optional), text.',
    async prepare(args) {
      const to = number(args.to), text = body(args.text).slice(0, 600), name = oneLine(args.name, 60);
      if (!text) throw new HttpError(400, 'The message is empty.');
      return { title: `Call ${name || to} and read a message`, to, text, caution: 'A computer voice will speak. In the US that needs the person’s prior consent.', lines: [{ label: 'Number', value: to }], payload: { to, text } };
    },
    async run(p) {
      const words = xml(p.text);
      await twilio('Calls', { To: p.to, Twiml: `<Response><Pause length="1"/><Say>This is a message sent by OXBOT, an assistant. ${words}</Say><Pause length="1"/><Say>Again. ${words}</Say></Response>`, Timeout: '30' });
      return `Calling ${masked(p.to)} with your message.`;
    },
  },
];

// ---------- GitHub reviews and Linear updates ----------

const pr = async (ref: unknown) => {
  const url = String(ref ?? '').startsWith('gh:') ? (await need(ref, 'gh:')).url ?? '' : String(ref ?? '');
  const m = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
  if (!m) throw new HttpError(400, 'Name the pull request by its GitHub link or its item on the board.');
  return { owner: m[1], repo: m[2], number: Number(m[3]), url: m[0] };
};
const reviewVerb: Record<string, [string, string]> = { APPROVE: ['Approve', 'Approved'], COMMENT: ['Comment on', 'Commented on'], REQUEST_CHANGES: ['Request changes on', 'Requested changes on'] };
const linear = async (query: string, variables: Args) => {
  const data = await api<any>('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: store.secret('LINEAR_ACTION_KEY')!, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  if (data.errors) throw new HttpError(400, `Linear said: ${data.errors[0]?.message}`);
  return data.data;
};
const issue = async (ref: unknown) => {
  const id = String(ref ?? '').replace(/^linear:/, '');
  if (!/^([\w-]{8,}|[A-Z][A-Z0-9]*-\d+)$/.test(id)) throw new HttpError(400, 'Name the Linear issue by its key, like OX-412.');
  const found = (await linear('query($id: String!) { issue(id: $id) { id identifier title state { name } team { states { nodes { id name } } } } }', { id })).issue;
  if (!found) throw new HttpError(404, `Linear has no issue ${id}.`);
  return found;
};
const work: Spec[] = [
  {
    kind: 'github.review', app: 'GitHub', editable: true,
    help: 'Review a pull request. Args: pr (its board id "gh:…" or link), event ("APPROVE", "COMMENT" or "REQUEST_CHANGES"), text (the review comment; optional for APPROVE).',
    missing: () => missing([isConnected('github-act'), 'Allow GitHub reviews first: Settings, then Actions.']),
    async prepare(args) {
      const target = await pr(args.pr), event = String(args.event ?? '').toUpperCase();
      if (!reviewVerb[event]) throw new HttpError(400, 'A review is APPROVE, COMMENT or REQUEST_CHANGES.');
      const text = body(args.text);
      if (event !== 'APPROVE' && !text) throw new HttpError(400, 'That review needs a comment.');
      return { title: `${reviewVerb[event][0]} ${target.owner}/${target.repo}#${target.number}`, to: target.url, text, lines: [{ label: 'Pull request', value: target.url }], payload: { ...target, event, text } };
    },
    async run(p) {
      await api(`https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.number}/reviews`, {
        method: 'POST', token: store.secret('GITHUB_ACTION_TOKEN'), headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: p.event, ...(p.text ? { body: p.text } : {}) }),
      });
      return `${reviewVerb[p.event][1]} ${p.owner}/${p.repo}#${p.number}.`;
    },
  },
  {
    kind: 'linear.comment', app: 'Linear', editable: true,
    help: 'Comment on a Linear issue. Args: issue (its key like "OX-412" or board id "linear:…"), text.',
    missing: () => missing([isConnected('linear-act'), 'Allow Linear updates first: Settings, then Actions.']),
    async prepare(args) {
      const found = await issue(args.issue), text = body(args.text);
      if (!text) throw new HttpError(400, 'The comment is empty.');
      return { title: `Comment on ${found.identifier}`, to: found.identifier, text, lines: [{ label: 'Issue', value: oneLine(`${found.identifier} ${found.title}`, 160) }], payload: { issueId: found.id, text } };
    },
    async run(p) { await linear('mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }', { input: { issueId: p.issueId, body: p.text } }); return 'Comment added in Linear.'; },
  },
  {
    kind: 'linear.status', app: 'Linear',
    help: 'Move a Linear issue to another status. Args: issue, status (the status name, like "Done").',
    missing: () => missing([isConnected('linear-act'), 'Allow Linear updates first: Settings, then Actions.']),
    async prepare(args) {
      const found = await issue(args.issue), want = oneLine(args.status, 60).toLowerCase();
      const state = found.team?.states?.nodes?.find((s: any) => s.name.toLowerCase() === want);
      if (!state) throw new HttpError(400, `${found.identifier}’s team has no status called “${oneLine(args.status, 60)}”. It has: ${(found.team?.states?.nodes ?? []).map((s: any) => s.name).join(', ')}.`);
      return { title: `Move ${found.identifier} to ${state.name}`, to: found.identifier, lines: [{ label: 'Issue', value: oneLine(`${found.identifier} ${found.title}`, 160) }, { label: 'From', value: found.state?.name ?? '' }, { label: 'To', value: state.name }], payload: { id: found.id, stateId: state.id, name: state.name } };
    },
    async run(p) { await linear('mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }', { id: p.id, input: { stateId: p.stateId } }); return `Moved to ${p.name}.`; },
  },
];

register(...mail, ...chat, ...phone, ...work);
