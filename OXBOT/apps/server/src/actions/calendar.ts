import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMac, openWithMac } from '../mac.ts';
import { HttpError, store } from '../store.ts';
import { register, type Args } from './approvals.ts';

// Calendar changes from a scan (November 16, 2026). Calendar writes were never allowed without the owner's OK, and
// this keeps it so: a scan proposes everything it found as one approval card, and only after the owner approves does
// OXBOT write one .ics file into ~/.oxbot/calendar and hand it to the Mac's Calendar app, which then shows its own
// add dialog. OXBOT holds no calendar write scope and changes no calendar itself.

/* eslint-disable @typescript-eslint/no-explicit-any -- event arguments come from the AI as JSON */
export interface NewEvent { title: string; start: string; end?: string; location?: string; why?: string }
const oneLine = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const ics = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const when = (ms: number) => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function cleanEvents(list: unknown): NewEvent[] {
  if (!Array.isArray(list)) return [];
  const out: NewEvent[] = [];
  for (const e of list.slice(0, 8) as any[]) {
    const title = oneLine(e?.title, 160), start = Date.parse(String(e?.start ?? ''));
    if (!title || !Number.isFinite(start)) continue;
    // Never a date in the past or more than a year out: those are misreadings.
    if (start < Date.now() - 3_600_000 || start > Date.now() + 366 * 86_400_000) continue;
    const endMs = Date.parse(String(e?.end ?? ''));
    const end = Number.isFinite(endMs) && endMs > start ? endMs : start + 30 * 60_000;
    out.push({ title, start: new Date(start).toISOString(), end: new Date(end).toISOString(), location: oneLine(e?.location, 160) || undefined, why: oneLine(e?.why, 200) || undefined });
  }
  return out;
}

export function icsFor(events: NewEvent[]): string {
  const now = stamp(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OXBOT//Scans//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${randomBytes(9).toString('hex')}@oxbot.local`, `DTSTAMP:${now}`, `DTSTART:${stamp(Date.parse(e.start))}`, `DTEND:${stamp(Date.parse(e.end ?? e.start))}`, `SUMMARY:${ics(e.title)}`);
    if (e.location) lines.push(`LOCATION:${ics(e.location)}`);
    if (e.why) lines.push(`DESCRIPTION:${ics(`Found by an OXBOT scan: ${e.why}`)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

register({
  kind: 'calendar.add', app: 'Calendar', ttlMinutes: 24 * 60,
  help: 'Add events to the owner’s calendar. Args: events ([{title, start (ISO date and time), end, location, why}], up to 8). The Mac’s Calendar app opens them.',
  missing: () => isMac() ? undefined : 'Adding to your calendar only works when OXBOT runs on a Mac.',
  async prepare(args: Args) {
    const events = cleanEvents(args.events);
    if (!events.length) throw new HttpError(400, 'No event with a clear title and a date and time to add.');
    return {
      title: events.length === 1 ? `Add “${events[0].title}” to your calendar` : `Add ${events.length} events to your calendar`,
      lines: events.map(e => ({ label: when(Date.parse(e.start)), value: [e.title, e.location, e.why && `(${e.why})`].filter(Boolean).join(' · ') })),
      caution: 'Your Mac’s Calendar app opens them and may ask which calendar to use.',
      payload: { events },
    };
  },
  async run(p) {
    const dir = join(store.dir, 'calendar');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, `oxbot-${Date.now()}.ics`);
    writeFileSync(file, icsFor(p.events), { mode: 0o600 });
    await openWithMac(file);
    return `Opened ${p.events.length === 1 ? 'the event' : `${p.events.length} events`} in Calendar.`;
  },
});
