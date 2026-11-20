import { accounts, isConnected, pullAll, tokenFor } from './connectors.ts';
import { bodyPriority, feeders } from './dashboard.ts';
import { api } from './store.ts';
import type { Section } from './types.ts';

// Live answers (owner, November 1, 2026): when you ask "what's my heart rate right now", the AI calls these and
// Taurus asks the connector again, instead of answering from the board's cached pull. Read-only, like every pull.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const MIN = 60_000;
interface Sample { bpm: number; at: string; source: string }

// Oura keeps heart rate in five-minute samples; Google Health (Fitbit, Pixel Watch) keeps samples too.
// WHOOP's API has no live heart rate at all, only the resting rate from the last scored sleep.
async function latestHeartRate(): Promise<Sample | undefined> {
  const found: Sample[] = [];
  const since = new Date(Date.now() - 3 * 60 * MIN).toISOString(), until = new Date(Date.now() + 5 * MIN).toISOString();
  await Promise.all([
    isConnected('oura') && (async () => {
      const data = await api<any>(`https://api.ouraring.com/v2/usercollection/heartrate?${new URLSearchParams({ start_datetime: since, end_datetime: until })}`, { token: await tokenFor('oura') });
      const last = (data.data ?? []).at(-1);
      if (last?.bpm) found.push({ bpm: Number(last.bpm), at: new Date(last.timestamp).toISOString(), source: 'Oura' });
    })().catch(() => undefined),
    isConnected('google-health') && (async () => {
      const data = await api<any>('https://health.googleapis.com/v4/users/me/dataTypes/heart-rate/dataPoints?pageSize=20', { token: await tokenFor('google-health') });
      for (const p of data.dataPoints ?? []) {
        const hr = p.heartRate ?? p;
        const at = Date.parse(hr.sampleTime?.physicalTime ?? hr.time ?? p.endTime ?? '');
        if (hr.beatsPerMinute && at) found.push({ bpm: Number(hr.beatsPerMinute), at: new Date(at).toISOString(), source: 'Google Health' });
      }
    })().catch(() => undefined),
  ]);
  return found.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
}

const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / MIN); return m < 1 ? 'just now' : m < 60 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`; };

export async function bodyNow() {
  const [heart, pulls] = await Promise.all([latestHeartRate(), pullAll(def => def.group === 'Body')]);
  const body: Record<string, unknown> = {};
  const sources: string[] = [], errors: string[] = [];
  for (const r of [...pulls].sort((a, b) => bodyPriority.indexOf(a.id) - bodyPriority.indexOf(b.id))) {
    if (r.error) { errors.push(`${r.name}: ${r.error}`); continue; }
    if (!r.pull?.body) continue;
    sources.push(r.name);
    for (const [k, v] of Object.entries(r.pull.body)) if (v !== undefined && v !== null && body[k] === undefined) body[k] = v;
  }
  if (!heart && !sources.length) return { connected: false, note: errors.length ? `Couldn’t read: ${errors.join('; ')}` : 'No health app is connected. Connect WHOOP, Oura, Google Health or another under Connections, Body.' };
  return {
    connected: true, fetchedAt: new Date().toISOString(),
    heartRateNow: heart ? { bpm: heart.bpm, measured: ago(heart.at), source: heart.source } : undefined,
    note: heart ? undefined : `None of ${sources.join(', ')} gives a live heart rate through its API${sources.includes('WHOOP') ? ' (WHOOP shares only the resting rate from your last scored sleep)' : ''}. Say which number you have and how old it is.`,
    latest: body, sources, errors,
  };
}

// A fresh pull of only the connectors that feed one part of the board.
export async function fresh(section: Section) {
  const results = await pullAll(def => feeders[section].includes(def.group));
  return {
    fetchedAt: new Date().toISOString(),
    items: results.flatMap(r => (r.pull?.[section] as unknown[] | undefined) ?? []).slice(0, 25),
    sources: results.filter(r => r.pull).map(r => r.name),
    errors: results.filter(r => r.error).map(r => `${r.name}: ${r.error}`),
  };
}

// Mail search (November 1, 2026): so "email Sam the deck" can find Sam's address, or the thread to reply to, beyond
// the few items on the board. Read-only, through the same Gmail and Outlook sign-ins the board reads with.
export async function searchMail(query: string) {
  const q = String(query ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  if (!q) return { error: 'Say what to search for, like from:sam or "board deck".' };
  const found: { id: string; from: string; subject: string; preview: string; at: string; source: string }[] = [];
  const errors: string[] = [];
  await Promise.all([
    // Every Gmail signed in (November 20, 2026), each result marked with its account.
    ...(isConnected('gmail') ? accounts('gmail') : []).map(a => (async () => {
      const token = await tokenFor('gmail', a.key);
      const list = await api<any>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=${encodeURIComponent(q)}`, { token });
      const messages = await Promise.all((list.messages ?? []).map((m: any) => api<any>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { token })));
      for (const m of messages) {
        const h = Object.fromEntries((m.payload?.headers ?? []).map((x: any) => [x.name, x.value]));
        found.push({ id: a.primary ? `gmail:${m.id}` : `gmail@${a.account}:${m.id}`, from: h.From ?? '', subject: h.Subject ?? '', preview: String(m.snippet ?? '').slice(0, 160), at: new Date(Number(m.internalDate)).toISOString(), source: a.account && accounts('gmail').length > 1 ? `Gmail · ${a.account}` : 'Gmail' });
      }
    })().catch(e => { errors.push(`Gmail${a.account ? ` (${a.account})` : ''}: ${(e as Error).message}`); })),
    isConnected('outlook-mail') && (async () => {
      const data = await api<any>(`https://graph.microsoft.com/v1.0/me/messages?$search=${encodeURIComponent(`"${q.replace(/"/g, '')}"`)}&$top=8&$select=id,subject,from,receivedDateTime,bodyPreview`, { token: await tokenFor('outlook-mail') });
      for (const m of data.value ?? []) found.push({ id: `outlook:${m.id}`, from: `${m.from?.emailAddress?.name ?? ''} <${m.from?.emailAddress?.address ?? ''}>`, subject: m.subject ?? '', preview: String(m.bodyPreview ?? '').slice(0, 160), at: m.receivedDateTime, source: 'Outlook' });
    })().catch(e => { errors.push(`Outlook: ${(e as Error).message}`); }),
  ]);
  if (!isConnected('gmail') && !isConnected('outlook-mail')) return { error: 'No mail is connected. Connect Gmail or Outlook under Connections.' };
  return { results: found.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), errors };
}
