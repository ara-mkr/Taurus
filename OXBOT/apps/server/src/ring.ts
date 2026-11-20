import { note } from './activity.ts';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { isConnected } from './connectors.ts';
import { dashboard } from './dashboard.ts';
import { store } from './store.ts';
import type { Ring } from './types.ts';

// The escalation ladder: every open Taurus screen rings at once and ntfy pushes;
// if nobody answers within escalateAfterSeconds, Twilio places a real phone call.
const listeners = new Set<ServerResponse>();
const rings = new Map<string, Ring>();
const timers = new Map<string, NodeJS.Timeout>();
let publicUrl = 'http://localhost:8787';
export const setRingUrl = (url: string) => { publicUrl = url; };

function broadcast(ring: Ring) { send('ring', ring); }

// Other events on the same stream (approvals, since November 1, 2026), and what a newly opened screen should catch up on.
export function send(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const listener of listeners) listener.write(message);
}
const catchUps: (() => { event: string; data: unknown }[])[] = [];
export const onConnect = (fn: () => { event: string; data: unknown }[]) => { catchUps.push(fn); };

export function listen(res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  for (const ring of rings.values()) if (ring.state === 'ringing' || ring.state === 'escalated') res.write(`event: ring\ndata: ${JSON.stringify(ring)}\n\n`);
  for (const { event, data } of catchUps.flatMap(fn => fn())) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  listeners.add(res);
  const heartbeat = setInterval(() => res.write(': beat\n\n'), 25_000);
  res.on('close', () => { clearInterval(heartbeat); listeners.delete(res); });
}

export const activeRing = () => [...rings.values()].reverse().find(r => r.state === 'ringing' || r.state === 'escalated');
export const listenerCount = () => listeners.size;

export const xml = (text: string) => text.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

async function push(ring: Ring) {
  const topic = store.secret('NTFY_TOPIC');
  if (!topic) return false;
  const server = (store.secret('NTFY_SERVER') || 'https://ntfy.sh').replace(/\/$/, '');
  const response = await fetch(`${server}/${encodeURIComponent(topic)}`, {
    method: 'POST', body: ring.detail || ring.title,
    headers: { Title: `Taurus: ${ring.title}`.slice(0, 200), Priority: 'urgent', Click: `${publicUrl}/#ring` },
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
}

// Twilio wants +15557654321. Accept what people type: spaces, dashes, brackets, or ten US digits.
export function phoneNumber(input: string) {
  const digits = input.replace(/[\s().-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return '';
}

// What Twilio says when a call can't go out, in words that say what to change. Codes from Twilio's error list.
export const twilioErrors: Record<number, string> = {
  20003: 'Twilio didn’t accept the Account SID and auth token. Copy both again from the front page of the Twilio console.',
  21210: 'The Twilio number isn’t one of the numbers on this Twilio account. Copy it from Phone Numbers, then Active numbers.',
  21212: 'The Twilio number isn’t one of the numbers on this Twilio account. Copy it from Phone Numbers, then Active numbers.',
  21211: 'Your mobile number doesn’t look right. Use the + and country code, like +15557654321.',
  21219: 'A Twilio trial account can only call numbers you’ve verified. Add your mobile under Phone Numbers, then Verified Caller IDs.',
  21215: 'Twilio blocks calls to that country until you allow it: Voice, then Settings, then Geo permissions.',
  13227: 'Twilio blocks calls to that country until you allow it: Voice, then Settings, then Geo permissions.',
  20429: 'Twilio is busy. Taurus will try again on the next ring.',
};
// Twilio's Limited trial (owner's account, November 18, 2026) refuses the Twiml and Timeout fields on a call with
// "trial accounts have limited parameter access", but still takes a Url. On that refusal the same TwiML goes again
// through Twilio's own echo Twimlet, which hands it straight back to Twilio. No other service sees the words.
export const trialRefused = (status: number, message = '') => status === 400 && /limited parameter access/i.test(message);
export function viaEcho(form: Record<string, string>) {
  const { Twiml, Timeout: _timeout, ...rest } = form;
  return Twiml ? { ...rest, Url: `https://twimlets.com/echo?Twiml=${encodeURIComponent(Twiml)}` } : rest;
}
export interface TwilioReply { sid?: string; code?: number; message?: string }
// Once Twilio has refused, the account is a trial until Taurus restarts, so later calls skip the refused try.
let trialAccount = false;
export async function placeCall(post: (form: Record<string, string>) => Promise<Response>, form: Record<string, string>) {
  let response = await post(trialAccount ? viaEcho(form) : form);
  let body = await response.json().catch(() => ({})) as TwilioReply;
  if (!trialAccount && trialRefused(response.status, body.message)) {
    trialAccount = true;
    response = await post(viaEcho(form));
    body = await response.json().catch(() => ({})) as TwilioReply;
  }
  return { response, body };
}
export interface CallResult { at: string; ok: boolean; message: string }
let lastCall: CallResult | null = null;

async function call(ring: Pick<Ring, 'title' | 'detail'>): Promise<CallResult> {
  const sid = (store.secret('TWILIO_ACCOUNT_SID') ?? '').trim(), token = (store.secret('TWILIO_AUTH_TOKEN') ?? '').trim();
  const from = phoneNumber(store.secret('TWILIO_FROM') ?? ''), to = phoneNumber(store.secret('MY_PHONE') ?? '');
  const done = (ok: boolean, message: string) => (lastCall = { at: new Date().toISOString(), ok, message });
  if (!sid || !token || !store.secret('TWILIO_FROM') || !store.secret('MY_PHONE')) return done(false, 'Twilio isn’t set up yet.');
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) return done(false, 'The Account SID starts with AC and has 34 characters. Copy it from the front page of the Twilio console.');
  if (!from) return done(false, 'The Twilio number doesn’t look right. Use the + and country code, like +15551230000.');
  if (!to) return done(false, twilioErrors[21211]);
  const words = xml(`${ring.title}. ${ring.detail}`.slice(0, 400));
  const twiml = `<Response><Pause length="1"/><Say>This is Taurus. ${words}</Say><Pause length="1"/><Say>Again. ${words}</Say></Response>`;
  const post = (form: Record<string, string>) => fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(20_000),
  });
  try {
    const { response, body } = await placeCall(post, { To: to, From: from, Twiml: twiml, Timeout: '30' });
    if (response.ok) return done(true, `Called ${to.slice(0, -4).replace(/\d/g, '•')}${to.slice(-4)}.`);
    console.warn('twilio:', response.status, body.code ?? '', (body.message ?? '').slice(0, 200));
    return done(false, (body.code && twilioErrors[body.code]) || `Twilio said: ${body.message ?? `error ${response.status}`}`);
  } catch (error) {
    return done(false, `Couldn’t reach Twilio: ${(error as Error).message}`);
  }
}

// "Call me now" on the Phone page: the same call a ring makes, straight away, so you know it works before you need it.
export async function testCall() {
  const result = await call({ title: 'Test call', detail: 'If you can hear this, Taurus can reach you.' });
  if (!result.ok) throw new Error(result.message);
  return result;
}

export async function ring(input: Pick<Ring, 'title' | 'detail' | 'reason'> & { url?: string }): Promise<Ring> {
  const current = activeRing();
  if (current && current.title === input.title) return current;
  const r: Ring = { id: randomUUID(), at: new Date().toISOString(), state: 'ringing', channels: [], ...input };
  rings.set(r.id, r);
  note('ring', `Ringing you: ${r.title}`);
  if (listeners.size) r.channels.push(`${listeners.size} open ${listeners.size === 1 ? 'screen' : 'screens'}`);
  broadcast(r);
  push(r).then(ok => { if (ok) { r.channels.push('ntfy push'); broadcast(r); } }).catch(error => console.warn('ntfy:', error.message));
  const wait = store.settings().escalateAfterSeconds * 1000;
  timers.set(r.id, setTimeout(async () => {
    if (r.state !== 'ringing') return;
    if ((await call(r)).ok) { r.state = 'escalated'; r.channels.push('phone call'); broadcast(r); }
  }, listeners.size || store.secret('NTFY_TOPIC') ? wait : 0));
  return r;
}

export function answer(id: string, action: 'ack' | 'snooze') {
  const r = rings.get(id);
  if (!r) throw new Error('No such ring');
  clearTimeout(timers.get(id));
  r.state = action === 'ack' ? 'acknowledged' : 'snoozed';
  broadcast(r);
  if (action === 'snooze') timers.set(id, setTimeout(() => { if (r.state === 'snoozed') ring({ title: r.title, detail: r.detail, reason: r.reason, url: r.url }); }, 5 * 60_000));
  return r;
}

// ---------- Automatic triggers (live data only, never sample data) ----------

const announced = new Set<string>();
let primed = false;

// A focus block (November 4, 2026) holds VIP mail until it ends; a meeting starting still rings, it can't wait.
const holds: (() => boolean)[] = [];
export const holdQuiet = (fn: () => boolean) => { holds.push(fn); };
const holding = () => holds.some(fn => fn());
export function quiet(now = new Date()) {
  const { quietStart, quietEnd } = store.settings();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = quietStart.split(':').map(Number), [eh, em] = quietEnd.split(':').map(Number);
  const start = sh * 60 + sm, end = eh * 60 + em;
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

async function tick() {
  const settings = store.settings();
  const d = await dashboard();
  const now = Date.now();
  if (d.sections.schedule.live && settings.ringMeetings && !quiet()) {
    for (const e of d.schedule) {
      const start = Date.parse(e.start), key = `meeting:${e.id}:${start}`;
      if (e.allDay || announced.has(key) || start < now - 60_000 || start - now > settings.leadMinutes * 60_000) continue;
      announced.add(key);
      const minutes = Math.max(0, Math.round((start - now) / 60_000));
      await ring({ title: e.title, detail: minutes ? `Starts in ${minutes} minutes${e.location ? `, ${e.location}` : ''}.` : 'Starting now.', reason: 'meeting', url: e.joinUrl ?? e.url });
    }
  }
  if (d.sections.needs.live) {
    for (const n of d.needs.filter(n => n.vip)) {
      const key = `vip:${n.id}`;
      if (announced.has(key) || (primed && holding())) continue;
      announced.add(key);
      // The first pass only records what already exists, so a restart never rings for old mail.
      if (primed && settings.ringVip) await ring({ title: `${n.who ?? 'VIP'}: ${n.title}`, detail: n.detail ?? '', reason: 'vip', url: n.url });
    }
  }
  primed = true;
}

export function startScheduler() {
  const run = () => tick().catch(error => console.warn('scheduler:', error instanceof Error ? error.message : error));
  setTimeout(run, 3_000);
  setInterval(run, 30_000);
}

// number: Taurus's own Twilio number, so the Phone page can offer it as a contact card (owner, November 2, 2026).
export const channelStatus = () => ({ screens: listeners.size, ntfy: isConnected('ntfy'), call: isConnected('twilio'), lastCall,
  number: isConnected('twilio') ? phoneNumber(store.secret('TWILIO_FROM') ?? '') || null : null });
