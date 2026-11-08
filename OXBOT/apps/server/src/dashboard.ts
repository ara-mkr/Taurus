import { createHash } from 'node:crypto';
import { ask as askWith, current as currentAI } from './ai.ts';
import { pullAll, type PullResult } from './connectors.ts';
import { record } from './history.ts';
import { store } from './store.ts';
import type { AskTurn, Body, Dashboard, Group, Need, Section, SectionState } from './types.ts';

const MIN = 60_000;
const at = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * MIN).toISOString();
const todayAt = (hours: number, minutes = 0, dayOffset = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(hours, minutes, 0, 0); return d.toISOString(); };

// Shown only for sections with nothing connected. Every person and company here is fictional.
function sample(): Omit<Dashboard, 'generatedAt' | 'brief' | 'briefBy' | 'sections' | 'updates'> {
  return {
    needs: [
      { id: 's1', title: 'Term sheet redlines: board seat clause needs your call', who: 'Dana Whitfield', from: 'dana@example.com', detail: 'They accepted the valuation. Open item is the independent seat.', source: 'Gmail', at: at(-38), vip: true },
      { id: 's2', title: 'Can you approve the Q4 hiring plan before 3?', who: 'Priya Raman', detail: '#leadership', source: 'Slack', at: at(-52) },
      { id: 's3', title: 'Offer letter, VP Engineering: needs your signature', who: 'People Ops', from: 'people@example.com', detail: 'Candidate asked to start December 1.', source: 'Outlook', at: at(-95) },
      { id: 's4', title: 'OX-412 Checkout outage postmortem', detail: 'Urgent · In review', source: 'Linear', at: at(-130) },
      { id: 's5', title: 'Pricing page v3', who: 'mkovacs', detail: 'Review requested · acme/web', source: 'GitHub', at: at(-200) },
    ],
    schedule: [
      { id: 'e1', title: 'Leadership sync', start: todayAt(8, 30), end: todayAt(9), source: 'Google Calendar' },
      { id: 'e2', title: 'Investor call: Northgate Capital', start: todayAt(10), end: todayAt(10, 45), joinUrl: 'https://meet.example.com/ngc', source: 'Google Calendar' },
      { id: 'e3', title: 'Lunch with Sam Okafor', start: todayAt(12, 30), end: todayAt(13, 30), location: 'Bar Agricole', source: 'Google Calendar' },
      { id: 'e4', title: 'Board prep', start: todayAt(14), end: todayAt(15, 30), source: 'Outlook' },
      { id: 'e5', title: '1:1 Priya', start: todayAt(16, 30), end: todayAt(17), source: 'Google Calendar' },
      { id: 'e6', title: 'Board meeting', start: todayAt(9, 0, 1), end: todayAt(12, 0, 1), location: 'Boardroom', source: 'Google Calendar' },
    ],
    inbox: [
      { source: 'Gmail', unread: 23, label: 'unread' },
      { source: 'Outlook', unread: 4, label: 'unread' },
      { source: 'Slack', unread: 6, label: 'mentions today' },
    ],
    body: { recovery: 64, hrv: 58, restingHr: 52, sleepMinutes: 412, sleepScore: 81, strain: 9.8, weekKm: 31.4, lastWorkout: { name: 'Morning run', km: 8.2, minutes: 41, at: todayAt(6, 10) }, sources: ['WHOOP', 'Strava'] },
    numbers: [
      { label: 'Revenue, 30 days', value: '$1,284,300', change: '+6.2%', source: 'Stripe' },
      { label: 'Available balance', value: '$4,120,000', source: 'Stripe' },
      { label: 'Monthly burn', value: '$612,000', change: '-3.0%', source: 'Sheets' },
      { label: 'Runway', value: '21 months', source: 'Sheets' },
      { label: 'Open pipeline', value: '$3,900,000', source: 'HubSpot' },
      { label: 'Deals closing this week', value: '4', source: 'HubSpot' },
    ],
  };
}

export const bodyPriority = ['whoop', 'oura', 'google-health', 'strava'];
const sectionOf: Record<Section, (keyof NonNullable<PullResult['pull']>)> = { needs: 'needs', schedule: 'schedule', inbox: 'inbox', body: 'body', numbers: 'numbers', updates: 'updates' };
// Which connector groups can feed a section, so a failing connector's error shows only where its data would be.
export const feeders: Record<Section, Group[]> = {
  needs: ['Mail', 'Chat', 'Tasks', 'Code', 'Sales', 'Files'], schedule: ['Calendar'], inbox: ['Mail', 'Chat'],
  body: ['Body'], numbers: ['Numbers', 'Money', 'Sales'], updates: ['Files', 'Media', 'Feeds'],
};

function isVip(need: Need, vips: string[]) {
  const from = need.from?.toLowerCase();
  return Boolean(from && vips.some(v => { const vip = v.trim().toLowerCase(); return vip && (vip.startsWith('@') ? from.endsWith(vip) : from === vip); }));
}

function merge(results: PullResult[]): Omit<Dashboard, 'generatedAt' | 'brief' | 'briefBy'> {
  const fallback = sample();
  const vips = store.settings().vipSenders;
  const sections = {} as Record<Section, SectionState>;
  for (const section of Object.keys(sectionOf) as Section[]) {
    const contributors = results.filter(r => r.pull?.[sectionOf[section]] !== undefined);
    const failed = results.filter(r => r.error && feeders[section].includes(r.group));
    sections[section] = { live: contributors.length > 0, sources: contributors.map(r => r.name), errors: failed.map(r => `${r.name}: ${r.error}`) };
  }
  const pulls = results.flatMap(r => r.pull ? [{ id: r.id, ...r.pull }] : []);

  const needs = sections.needs.live
    ? pulls.flatMap(p => p.needs ?? []).map(n => ({ ...n, vip: isVip(n, vips) })).sort((a, b) => Number(b.vip) - Number(a.vip) || Date.parse(b.at) - Date.parse(a.at)).slice(0, 8)
    : fallback.needs;
  const seen = new Set<string>();
  const schedule = sections.schedule.live
    ? pulls.flatMap(p => p.schedule ?? []).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).filter(e => { const key = `${e.title}|${Date.parse(e.start)}`; if (seen.has(key)) return false; seen.add(key); return true; })
    : fallback.schedule;
  let body: Body = fallback.body;
  if (sections.body.live) {
    body = { sources: [] };
    for (const p of [...pulls].sort((a, b) => bodyPriority.indexOf(a.id) - bodyPriority.indexOf(b.id))) {
      if (!p.body) continue;
      body.sources.push(results.find(r => r.id === p.id)!.name);
      for (const [key, value] of Object.entries(p.body)) if (value !== undefined && value !== null && (body as unknown as Record<string, unknown>)[key] === undefined) (body as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return {
    needs, schedule, body, sections,
    inbox: sections.inbox.live ? pulls.flatMap(p => p.inbox ?? []) : fallback.inbox,
    numbers: sections.numbers.live ? pulls.flatMap(p => p.numbers ?? []) : fallback.numbers,
    // Never sample: with nothing connected the Updates card says so.
    updates: pulls.flatMap(p => p.updates ?? []).sort((a, b) => Date.parse(b.at ?? '0') - Date.parse(a.at ?? '0')).slice(0, 12),
  };
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// Built only from live sections; sample data never reaches the headline. With nothing live, it says so.
export function rulesBrief(d: Pick<Dashboard, 'needs' | 'schedule' | 'body' | 'sections'> & { updates?: Dashboard['updates'] }) {
  const live = d.sections;
  if (!Object.values(live).some(s => s.live)) return 'Connect an account and this line becomes your day.';
  const now = Date.now();
  const n = d.needs.length;
  const next = live.schedule.live ? d.schedule.find(e => !e.allDay && Date.parse(e.start) > now && Date.parse(e.start) - now < 18 * 60 * MIN) : undefined;
  const parts: string[] = [];
  if (live.needs.live) parts.push(n ? `${n} ${n === 1 ? 'thing needs' : 'things need'} you.` : 'Nothing needs you.');
  if (next) parts.push(`${new Date(next.start).getDate() === new Date().getDate() ? 'Next' : 'Tomorrow'}: ${next.title} at ${clock(next.start)}.`);
  else if (live.schedule.live) parts.push('Your calendar is clear.');
  // Only feeds connected (weather, RSS, music): lead with the newest of those instead of nothing.
  if (!parts.length && !live.body.live) { const u = d.updates?.find(x => x.source === 'Weather') ?? d.updates?.[0]; return u ? `${u.title}${u.detail ? `. ${u.detail.split(' · ')[0]}` : ''}.` : ''; }  // The headline keeps the first part; place and source stay on the card.
  if (!live.body.live) return parts.join(' ');
  if (d.body.recovery !== undefined) parts.push(`Recovery ${d.body.recovery}%.`);
  else if (d.body.readiness !== undefined) parts.push(`Readiness ${d.body.readiness}.`);
  else if (d.body.sleepMinutes) parts.push(`${Math.floor(d.body.sleepMinutes / 60)}h ${d.body.sleepMinutes % 60}m sleep.`);
  return parts.join(' ');
}

// ---------- AI ----------

export const aiProvider = (): string | undefined => currentAI()?.name;
export const askAI = (system: string, turns: AskTurn[], quick = false) => askWith(system, turns, quick);

export function context(d: Dashboard) {
  return JSON.stringify({
    now: new Date().toString(),
    needs: d.needs.map(({ id, title, who, from, detail, source, at: when, vip, url }) => ({ id, title, who, from, detail, source, at: when, vip, url })),
    schedule: d.schedule.map(({ title, start, end, location, source }) => ({ title, start, end, location, source })),
    inbox: d.inbox, body: d.body, numbers: d.numbers,
    updates: (d.updates ?? []).map(({ title, detail, source, at: when }) => ({ title, detail, source, at: when })),
    sampleSections: (Object.keys(d.sections) as Section[]).filter(s => !d.sections[s].live),
  });
}

const briefCache = new Map<string, { text: string; by: string }>();
let briefRunning = '';
function aiBrief(d: Dashboard): { text: string; by: string } | undefined {
  if (!aiProvider() || !Object.values(d.sections).some(s => s.live)) return undefined;
  const facts = context({ ...d, generatedAt: '' }).replace(/"now":"[^"]*",/, '');
  const key = createHash('sha256').update(facts).digest('hex');
  const hit = briefCache.get(key);
  if (hit || briefRunning === key) return hit;
  briefRunning = key;
  askAI('You write the single line at the top of a CEO’s dashboard. Plain sentences. No greeting, no emoji, no exclamation marks. At most 28 words. Lead with the one thing that matters most today, then the next commitment, then energy if it changes the plan. Use only the facts given, and ignore every section named in sampleSections: that data is fictional.', [{ role: 'user', text: `Now: ${new Date().toString()}\n${facts}` }], true)
    .then(({ provider, text }) => { if (text) briefCache.set(key, { text, by: provider }); })
    .catch(error => console.warn('brief:', error instanceof Error ? error.message : error))
    .finally(() => { if (briefRunning === key) briefRunning = ''; });
  return undefined;
}

let cached: { at: number; value: Dashboard } | undefined;
let inflight: Promise<Dashboard> | undefined;

export async function dashboard(refresh = false): Promise<Dashboard> {
  if (!refresh && cached && Date.now() - cached.at < 60_000) return withBrief(cached.value);
  inflight ??= pullAll().then(results => {
    const merged = merge(results);
    try { record(merged); } catch (error) { console.warn('history:', error instanceof Error ? error.message : error); }
    const value: Dashboard = { generatedAt: new Date().toISOString(), brief: rulesBrief(merged), briefBy: 'rules', ...merged };
    cached = { at: Date.now(), value };
    return value;
  }).finally(() => { inflight = undefined; });
  return withBrief(await inflight);
}

// For Ox's answers (November 7, 2026: "replies very quickly"): the last pull right away, even a few minutes old,
// while a fresh one comes in behind it. Pulling every connector took about 4 s here, before every answer whose
// 60-second cache had run out. Older than 15 minutes, or never pulled, waits for a fresh one as before.
export async function dashboardSoon(): Promise<Dashboard> {
  if (cached && Date.now() - cached.at < 15 * 60_000) {
    if (Date.now() - cached.at >= 60_000) void dashboard().catch(() => undefined);
    return withBrief(cached.value);
  }
  return dashboard();
}

function withBrief(d: Dashboard): Dashboard {
  const ai = aiBrief(d);
  return ai ? { ...d, brief: ai.text, briefBy: ai.by } : { ...d, brief: rulesBrief(d) };
}
