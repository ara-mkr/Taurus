import { randomBytes } from 'node:crypto';
import { note } from './activity.ts';
import { holdQuiet } from './ring.ts';
import { store } from './store.ts';
import type { Reminder, Timer } from './types.ts';
import { close, show } from './windows.ts';

// Timers, reminders and focus (owner, November 4, 2026). The things people ask a voice assistant for most, and the
// ones Siri gets wrong: several named timers you can cancel by name, reminders in plain words ("at 6", "tomorrow at
// 9am", "every weekday at 8:30"), and a focus block that keeps Taurus quiet. Saved in ~/.taurus so a restart keeps
// them; each one pops up as a Taurus window when it's done or due.

const id = (p: string) => `${p}-${randomBytes(4).toString('hex')}`;
const TIMERS = 'timers.json', REMINDERS = 'reminders.json';

// ---------- Plain-words time ----------

const small: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90, couple: 2, 'a couple': 2, 'a couple of': 2, few: 3, 'a few': 3 };
const num = (w: string) => { const n = Number(w); return Number.isFinite(n) ? n : small[w.trim()] ?? NaN; };
const unitMs = (u: string) => /^s/.test(u) ? 1_000 : /^h/.test(u) ? 3_600_000 : 60_000;
const NUM = String.raw`\d+(?:\.\d+)?|a couple(?: of)?|a few|forty[- ]five|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety|couple|few`;
const UNIT = String.raw`seconds?|secs?|minutes?|mins?|hours?|hrs?`;
const PIECE = String.raw`(?:${NUM})\s*(?:${UNIT})(?:\s+and\s+a\s+half)?`;
export const DURATION = String.raw`(?:half an hour|an hour and a half|${PIECE}(?:\s*(?:and\s+)?${PIECE})*)`;

// "10 minutes", "an hour and a half", "1 hour 30 minutes", "90 seconds" → milliseconds.
export function duration(text: string): number | undefined {
  const t = text.toLowerCase();
  if (/half an hour/.test(t)) return 30 * 60_000;
  if (/an hour and a half/.test(t)) return 90 * 60_000;
  let total = 0;
  for (const m of t.matchAll(new RegExp(String.raw`\b(${NUM})\s*(${UNIT})\b(\s+and\s+a\s+half)?`, 'gi'))) {
    const n = num(m[1]);
    if (Number.isFinite(n)) total += (n + (m[3] ? 0.5 : 0)) * unitMs(m[2]);
  }
  return total > 0 ? Math.round(total) : undefined;
}

const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const CLOCK = String.raw`(?:noon|midnight|\d{1,2}(?::\d{2})?(?:\s*(?:am|pm|a\.m\.|p\.m\.))?)`;
// Everything a reminder's time can be said as, so it can be cut out of the sentence.
export const WHEN = new RegExp(String.raw`\b(?:in\s+${DURATION}|(?:every\s+(?:day|weekday|morning|night|${days.join('|')})|tomorrow(?:\s+(?:morning|night|evening|afternoon))?|tonight|this\s+(?:morning|afternoon|evening)|(?:on\s+)?(?:${days.join('|')}))(?:\s+at\s+${CLOCK})?|at\s+${CLOCK}(?:\s+(?:tomorrow|tonight|today))?)(?![\w:])`, 'i');

interface Clock { h: number; m: number; meridiem: boolean }
function clock(text: string): Clock | undefined {
  const t = text.toLowerCase().replace(/\./g, '');
  if (/noon/.test(t)) return { h: 12, m: 0, meridiem: true };
  if (/midnight/.test(t)) return { h: 0, m: 0, meridiem: true };
  const c = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!c) return undefined;
  let h = Number(c[1]); const m = Number(c[2] ?? 0);
  if (h > 23 || m > 59) return undefined;
  if (c[3] === 'pm' && h < 12) h += 12;
  if (c[3] === 'am' && h === 12) h = 0;
  return { h, m, meridiem: Boolean(c[3]) || h > 12 || h === 0 };
}

const at = (base: Date, h: number, m: number) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// The next time the clock shows h:m. Without am or pm, "at 6" is whichever 6 comes next.
function next(now: Date, c: Clock, dayOffset = 0): Date {
  const base = addDays(now, dayOffset);
  if (c.meridiem) { const d = at(base, c.h, c.m); return !dayOffset && d <= now ? addDays(d, 1) : d; }
  for (const h of [c.h, c.h + 12]) { const d = at(base, h % 24, c.m); if (dayOffset || d > now) return d; }
  return addDays(at(base, c.h, c.m), 1);
}
// Morning words get am, evening words pm; a bare hour on its own stays "whichever comes next".
const evening = (c: Clock): Clock => c.meridiem ? c : { ...c, h: c.h < 12 ? c.h + 12 : c.h, meridiem: true };
const daytime = (c: Clock): Clock => c.meridiem ? c : { ...c, h: c.h < 7 ? c.h + 12 : c.h, meridiem: true };

// "in 20 minutes", "at 6pm", "tomorrow at 9", "tonight", "every weekday at 8:30", "on friday at noon".
export function when(text: string, now = new Date()): { dueAt: Date; repeat?: Reminder['repeat'] } | undefined {
  const t = text.toLowerCase().trim();
  if (/^in\s/.test(t)) { const ms = duration(t); return ms ? { dueAt: new Date(now.getTime() + ms) } : undefined; }
  const said = clock(t.match(new RegExp(`at\\s+(${CLOCK})`, 'i'))?.[1] ?? '');
  const or = (h: number): Clock => said ?? { h, m: 0, meridiem: true };
  const every = t.match(/every\s+(day|weekday|morning|night|\w+day)/);
  if (every) {
    const word = every[1];
    const c = word === 'night' ? evening(or(21)) : daytime(or(word === 'morning' ? 8 : 9));
    let d = next(now, c);
    if (word === 'weekday') { while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1); return { dueAt: d, repeat: 'weekdays' }; }
    const day = days.indexOf(word);
    if (day >= 0) { while (d.getDay() !== day) d = addDays(d, 1); return { dueAt: d, repeat: 'weekly' }; }
    return { dueAt: d, repeat: 'daily' };
  }
  if (/tomorrow/.test(t)) {
    const c = /night|evening/.test(t) ? evening(or(20)) : /afternoon/.test(t) ? evening(or(15)) : daytime(or(9));
    return { dueAt: next(now, c, 1) };
  }
  if (/tonight|this evening/.test(t)) return { dueAt: next(now, evening(or(20))) };
  if (/this afternoon/.test(t)) return { dueAt: next(now, evening(or(15))) };
  if (/this morning/.test(t)) return { dueAt: next(now, daytime(or(9))) };
  const day = days.findIndex(d => t.includes(d));
  if (day >= 0) {
    const c = daytime(or(9));
    let offset = (day - now.getDay() + 7) % 7;
    if (offset === 0 && at(now, c.h, c.m) <= now) offset = 7;
    return { dueAt: at(addDays(now, offset), c.h, c.m) };
  }
  if (said) return { dueAt: next(now, said) };
  return undefined;
}

export const spokenTime = (d: Date, now = new Date()) => {
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  if (d.toDateString() === now.toDateString()) return `at ${time}`;
  if (addDays(now, 1).toDateString() === d.toDateString()) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`;
};
export const spokenDuration = (ms: number) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h && `${h} hour${h > 1 ? 's' : ''}`, m && `${m} minute${m > 1 ? 's' : ''}`, !h && sec && `${sec} second${sec > 1 ? 's' : ''}`].filter(Boolean).join(' ') || '0 seconds';
};

// ---------- Timers ----------

let timers: Timer[] = store.doc<Timer[]>(TIMERS, []).filter(t => Date.parse(t.endsAt) > Date.now() - 3_600_000);
const handles = new Map<string, NodeJS.Timeout>();
const saveTimers = () => store.saveDoc(TIMERS, timers);

function arm(t: Timer) {
  clearTimeout(handles.get(t.id));
  const ms = Math.max(0, Date.parse(t.endsAt) - Date.now());
  handles.set(t.id, setTimeout(() => ring(t), Math.min(ms, 2_147_000_000)).unref());
}
function ring(t: Timer) {
  handles.delete(t.id);
  timers = timers.filter(x => x.id !== t.id); saveTimers();
  note('ring', t.focus ? 'Focus block done' : `Timer done: ${t.label}`, { by: 'taurus' });
  show({ id: t.id, kind: 'timer', timer: t, done: true });
}
for (const t of timers) { if (Date.parse(t.endsAt) <= Date.now()) ring(t); else arm(t); }

export const runningTimers = () => timers.slice().sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
export function startTimer(ms: number, label = '', options: { focus?: boolean; said?: string } = {}): Timer {
  const t: Timer = { id: id('t'), label: label.trim().slice(0, 60) || spokenDuration(ms), minutes: Math.max(1, Math.round(ms / 60_000)), endsAt: new Date(Date.now() + ms).toISOString(), ...(options.focus ? { focus: true } : {}) };
  timers.push(t); saveTimers(); arm(t);
  show({ id: t.id, kind: 'timer', timer: t, said: options.said });
  return t;
}
function stop(list: Timer[]) {
  for (const t of list) { clearTimeout(handles.get(t.id)); handles.delete(t.id); close(t.id); }
  timers = timers.filter(t => !list.includes(t)); saveTimers();
  return list;
}
// Cancels by name ("the pasta timer"), all of them, or else the one ending soonest. Returns what was cancelled.
export function cancelTimer(which = '', all = false): Timer[] {
  const q = which.toLowerCase().replace(/\b(the|my|timers?)\b/g, '').trim();
  if (all) return stop([...timers]);
  if (q) return stop(timers.filter(t => t.label.toLowerCase().includes(q) || (/^\d+$/.test(q) && String(t.minutes) === q)));
  return stop(runningTimers().slice(0, 1));
}
export const cancelTimerById = (timerId: string) => { stop(timers.filter(t => t.id === timerId)); close(timerId); };

// ---------- Focus ----------

export const focusing = () => timers.some(t => t.focus && Date.parse(t.endsAt) > Date.now());
holdQuiet(focusing);
export function startFocus(ms: number, said?: string) {
  stop(timers.filter(t => t.focus));
  return startTimer(ms, 'Focus', { focus: true, said });
}

// ---------- Reminders ----------

let reminders: Reminder[] = store.doc<Reminder[]>(REMINDERS, []);
const saveReminders = () => store.saveDoc(REMINDERS, reminders);
export const upcoming = () => reminders.filter(r => !r.firedAt).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
export const showReminders = (said?: string) => show({ id: 'reminders', kind: 'reminders', reminders: upcoming(), said });

export function remind(text: string, due: { dueAt: Date; repeat?: Reminder['repeat'] }, said?: string): Reminder {
  const r: Reminder = { id: id('r'), text: text.trim().replace(/[.!?]+$/, '').slice(0, 200), dueAt: due.dueAt.toISOString(), ...(due.repeat ? { repeat: due.repeat } : {}) };
  reminders.push(r); saveReminders();
  showReminders(said);
  return r;
}

function following(r: Reminder): string | undefined {
  if (!r.repeat) return undefined;
  let d = new Date(r.dueAt);
  do d = addDays(d, r.repeat === 'weekly' ? 7 : 1); while (r.repeat === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6));
  // A Mac that slept through several days skips ahead instead of firing every missed one.
  while (d.getTime() <= Date.now()) d = addDays(d, r.repeat === 'weekly' ? 7 : 1);
  return d.toISOString();
}

export function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const r of reminders) {
    if (r.firedAt || Date.parse(r.dueAt) > now) continue;
    changed = true;
    note('ring', `Reminder: ${r.text}`, { by: 'taurus' });
    show({ id: r.id, kind: 'reminder', reminder: { ...r }, due: true });
    const again = following(r);
    if (again) r.dueAt = again; else r.firedAt = new Date().toISOString();
  }
  // Fired one-offs are kept a day, so a screen that opens later still shows them.
  const before = reminders.length;
  reminders = reminders.filter(r => !r.firedAt || now - Date.parse(r.firedAt) < 86_400_000);
  if (changed || before !== reminders.length) saveReminders();
}
setInterval(checkReminders, 10_000).unref();
setTimeout(checkReminders, 2_000).unref();

// Done: a one-off reminder goes away; a repeating one keeps its next time.
export function doneReminder(reminderId: string) {
  reminders = reminders.filter(r => r.id !== reminderId || Boolean(r.repeat)); saveReminders(); close(reminderId);
}
export function snoozeReminder(reminderId: string, minutes = 10): Reminder | undefined {
  const r = reminders.find(x => x.id === reminderId);
  close(reminderId);
  if (!r) return undefined;
  if (!r.repeat) reminders = reminders.filter(x => x.id !== reminderId);
  const again: Reminder = { id: id('r'), text: r.text, dueAt: new Date(Date.now() + minutes * 60_000).toISOString() };
  reminders.push(again); saveReminders();
  return again;
}
export function cancelReminder(which: string): Reminder[] {
  const q = which.toLowerCase().replace(/\b(the|my|reminders?|about|to)\b/g, '').trim();
  const gone = upcoming().filter(r => which === 'all' || (q && r.text.toLowerCase().includes(q)));
  reminders = reminders.filter(r => !gone.includes(r)); saveReminders();
  for (const r of gone) close(r.id);
  return gone;
}
export function cancelReminderById(reminderId: string) { reminders = reminders.filter(r => r.id !== reminderId); saveReminders(); close(reminderId); showReminders(); }
// For tests.
export function resetTimers() { for (const h of handles.values()) clearTimeout(h); handles.clear(); timers = []; reminders = []; }
