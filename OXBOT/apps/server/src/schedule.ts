import { randomBytes } from 'node:crypto';
import { begin } from './activity.ts';
import { store } from './store.ts';
import { spokenTime, when } from './timers.ts';
import type { Reminder } from './types.ts';
import { show } from './windows.ts';

// Scheduled tasks (owner, November 6, 2026: "allow schedhuled tasks for ox to do u csn voice it to it or set it up in
// settings"). A task is something to ask Ox at a time, once or again and again ("every weekday at 8: brief me on the
// day", "Friday at 4: sum up the week's numbers"). At that time Ox does it the way he would if you had asked: he reads,
// browses and answers, and the answer pops up on screen. Anything that sends, posts, buys or changes something still
// becomes an approval card and waits for you; a schedule never approves anything. Saved in ~/.oxbot/schedules.json.

export interface Scheduled { id: string; task: string; when: string; repeat?: Reminder['repeat']; nextAt: string; on: boolean; lastAt?: string; last?: string; error?: string }
const FILE = 'schedules.json';
const list = () => store.doc<Scheduled[]>(FILE, []);
const save = (all: Scheduled[]) => store.saveDoc(FILE, all);
export const schedules = () => list().sort((a, b) => Date.parse(a.nextAt) - Date.parse(b.nextAt));

export function addSchedule(task: string, whenText: string, id?: string): Scheduled {
  const text = String(task ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) throw new Error('Say what Ox should do.');
  const due = when(String(whenText ?? ''));
  if (!due) throw new Error('Say when, like “every weekday at 8am”, “tomorrow at 9”, “every Friday at 4pm” or “in 2 hours”.');
  const all = list();
  if (id && !all.some(x => x.id === id)) throw new Error('No such scheduled task.');
  if (!id && all.length >= 50) throw new Error('Up to 50 scheduled tasks.');
  const s: Scheduled = { id: id ?? `j-${randomBytes(3).toString('hex')}`, task: text, when: String(whenText).trim().slice(0, 80), ...(due.repeat ? { repeat: due.repeat } : {}), nextAt: due.dueAt.toISOString(), on: true };
  save(id ? all.map(x => x.id === id ? { ...s, lastAt: x.lastAt, last: x.last } : x) : [...all, s]);
  return s;
}
export function setScheduleOn(id: string, on: boolean) { save(list().map(s => s.id === id ? { ...s, on } : s)); }
export function removeSchedule(id: string) { save(list().filter(s => s.id !== id)); }

const DAY = 86_400_000;
function following(s: Scheduled): string | undefined {
  if (!s.repeat) return undefined;
  let d = new Date(s.nextAt);
  const step = () => { d = new Date(d.getTime() + (s.repeat === 'weekly' ? 7 : 1) * DAY); };
  do step(); while (s.repeat === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6));
  while (d.getTime() <= Date.now() || (s.repeat === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6))) step();
  return d.toISOString();
}

export const nextLine = (s: Scheduled) => { const when = spokenTime(new Date(s.nextAt)).replace(/^at /, 'today at '); return s.repeat ? `${s.repeat === 'weekdays' ? 'Every weekday' : s.repeat === 'weekly' ? `Every ${new Date(s.nextAt).toLocaleDateString('en-US', { weekday: 'long' })}` : 'Every day'}, next ${when}` : when.charAt(0).toUpperCase() + when.slice(1); };

let running = false;
// "Run now" from Settings: does it once without moving its next time.
export async function runNow(id: string) {
  const s = list().find(x => x.id === id);
  if (!s) return;
  const step = begin('ai', `Running now: ${s.task.slice(0, 60)}`, { by: 'ox' });
  try {
    const answer = (await (await import('./agent.ts')).converse([{ role: 'user', text: s.task }], 'ask')).text;
    step.done('Done'); show({ id: `sched-${s.id}`, kind: 'note', title: s.task.slice(0, 80), text: answer.slice(0, 2000) });
    save(list().map(x => x.id === id ? { ...x, lastAt: new Date().toISOString(), last: answer.slice(0, 2000), error: undefined } : x));
  } catch (e) { step.fail(e); show({ id: `sched-${s.id}`, kind: 'note', title: s.task.slice(0, 80), text: `Couldn’t do it: ${(e as Error).message.slice(0, 200)}` }); }
}

// Runs what is due, one at a time. A Mac that slept through a time runs it once when it wakes, not once per miss.
export async function runDue(now = Date.now(), ask?: (task: string) => Promise<string>) {
  if (running) return;
  running = true;
  try {
    for (const s of list().filter(x => x.on && Date.parse(x.nextAt) <= now)) {
      const step = begin('ai', `Scheduled: ${s.task.slice(0, 60)}`, { by: 'ox' });
      let last = '', error: string | undefined;
      try {
        const answer = ask ? await ask(s.task) : (await (await import('./agent.ts')).converse([{ role: 'user', text: `(A task the owner scheduled: ${s.when}.) ${s.task}` }], 'ask')).text;
        last = answer.slice(0, 2000);
        step.done('Scheduled task done');
        show({ id: `sched-${s.id}`, kind: 'note', title: s.task.slice(0, 80), text: last });
      } catch (e) { error = (e as Error).message.slice(0, 200); step.fail(e); show({ id: `sched-${s.id}`, kind: 'note', title: s.task.slice(0, 80), text: `Couldn’t do it: ${error}` }); }
      const again = following(s);
      save(list().map(x => x.id === s.id ? { ...x, lastAt: new Date().toISOString(), last, error, ...(again ? { nextAt: again } : { on: false }) } : x));
    }
  } finally { running = false; }
}
if (!process.env.OXBOT_NO_SCHEDULER) { setInterval(() => void runDue(), 30_000).unref(); setTimeout(() => void runDue(), 5_000).unref(); }
