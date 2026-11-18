import { isIP } from 'node:net';
import { DAY, iso, stripTags, type Def, type Pull } from './kit.ts';

// Canvas LMS (Instructure): coursework for students. Read-only, GET only, built from Canvas's documented REST API v1
// (https://canvas.instructure.com/doc/api/) and tested only against mocked responses.
//
// Canvas OAuth needs a developer key issued by each school, so OXBOT's one-click sign-in cannot serve it. The student
// pastes their school's Canvas address and a personal access token they generate themselves (Account → Settings →
// "New Access Token"). Nothing is ever submitted, posted, marked or changed. The only reads are
//   GET /api/v1/courses, /planner/items, /users/self/todo, /users/self/missing_submissions, /announcements.
//
// Why these and not /users/self/upcoming_events: that endpoint ignores its parameters and lists work you have already
// handed in. The Planner API is what Canvas's own student dashboard uses, and `filter=incomplete_items` leaves out
// submitted, excused and marked-complete work. /todo and /missing_submissions fill in what the planner window misses.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const MAX_ASSIGNMENTS = 10;
const MAX_ANNOUNCEMENTS = 5;
const MAX_COURSES = 10; // /announcements accepts at most ten context_codes[] per request.
const AHEAD_DAYS = 7; // Coming up: the next week.
const BEHIND_DAYS = 14; // Overdue: the last two weeks, so a term's worth of old misses doesn't bury today.

// "https://school.instructure.com/anything" -> "https://school.instructure.com". Throws a plain sentence when the
// address is not one OXBOT should send a token to: https only, a real public domain, no credentials, no odd port.
export function canvasBase(input: string | undefined): string {
  const text = (input ?? '').trim();
  if (!text) throw new Error('Canvas: add your school’s Canvas address, like https://yourschool.instructure.com.');
  let url: URL;
  try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { throw new Error('Canvas: that isn’t a web address. Use something like https://yourschool.instructure.com.'); }
  if (url.protocol !== 'https:') throw new Error('Canvas: the address must start with https://, so your token is never sent in the clear.');
  if (url.username || url.password) throw new Error('Canvas: leave the user name and password out of the address.');
  if (url.port && url.port !== '443') throw new Error('Canvas: use your school’s normal Canvas address, without a port number.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const real = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/.test(host);
  if (isIP(host.replace(/^\[|\]$/g, '')) || !real || /(^|\.)(localhost|local|internal|localdomain|lan|home|corp|test|invalid|example)$/.test(host)) {
    throw new Error('Canvas: that address isn’t a public Canvas site. Use the one you sign in to, like https://yourschool.instructure.com.');
  }
  return `https://${host}`;
}

// One GET to the Canvas API. Never follows a redirect (a sign-in redirect would otherwise carry us to another host).
async function get<T>(base: string, token: string, path: string): Promise<T> {
  const response = await fetch(`${base}/api/v1/${path}`, {
    method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (response.status === 401) throw new Error('Canvas didn’t accept that token. Check it was copied in full and hasn’t expired or been deleted (Canvas → Account → Settings → Approved Integrations).');
  if (response.status === 403) throw new Error('Canvas refused that request. Your school may not allow access tokens; ask your school’s Canvas admin.');
  if (response.status >= 300 && response.status < 400) throw new Error('Canvas sent us somewhere else. Check the address is the one you sign in to.');
  const text = (await response.text()).replace(/^\s*while\(1\);/, '');
  if (!response.ok) throw new Error(`Canvas ${response.status}: ${text.slice(0, 160)}`);
  return (text ? JSON.parse(text) : []) as T;
}
// The assignment lists are nice to have: a school that hides one of them should not blank the others.
const optional = <T>(read: Promise<T>, fallback: T): Promise<T> => read.catch(error => {
  if (error instanceof Error && /token|refused/.test(error.message)) throw error;
  return fallback;
});

const when = (at: string) => new Date(at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const day = (ms: number) => iso(ms).slice(0, 10);
const asList = (value: unknown): any[] => (Array.isArray(value) ? value : []);

// Planner items that are coursework with a due date. Notes, calendar events, announcements and pages are not.
const coursework = new Set(['assignment', 'quiz', 'discussion_topic', 'sub_assignment']);

export async function canvasPull(baseField: string | undefined, token: string | undefined, now = Date.now()): Promise<Pull> {
  const base = canvasBase(baseField);
  if (!token?.trim()) throw new Error('Canvas: paste your access token (Canvas → Account → Settings → New Access Token).');
  const t = token.trim();
  // Canvas hands back paths like "/courses/1/assignments/2"; only ever link to the school's own site.
  const link = (href: unknown): string | undefined => {
    if (typeof href !== 'string' || !href) return undefined;
    try { const url = new URL(href, base); return url.origin === base ? url.href : undefined; } catch { return undefined; }
  };

  const courses = asList(await get<any[]>(base, t, 'courses?enrollment_state=active&per_page=50'));
  const names = new Map<number, string>(courses.map(c => [Number(c.id), c.name || c.course_code || `Course ${c.id}`]));
  const courseName = (id?: unknown, fallback?: string) => (id !== undefined && id !== null && names.get(Number(id))) || fallback || '';

  const codes = courses.slice(0, MAX_COURSES).map(c => `context_codes[]=course_${c.id}`).join('&');
  const planner = `planner/items?start_date=${day(now - BEHIND_DAYS * DAY)}&end_date=${day(now + (AHEAD_DAYS + 1) * DAY)}&filter=incomplete_items&per_page=50`;
  const [plan, todo, missing, notices] = await Promise.all([
    optional(get<any[]>(base, t, planner), []),
    optional(get<any[]>(base, t, 'users/self/todo?per_page=30'), []),
    optional(get<any[]>(base, t, 'users/self/missing_submissions?filter[]=submittable&filter[]=current_grading_period&per_page=30'), []),
    codes ? optional(get<any[]>(base, t, `announcements?${codes}&active_only=true&start_date=${day(now - 7 * DAY)}&per_page=20`), []) : Promise.resolve([]),
  ]);

  // The same work can arrive from several lists; keep the first. Planner goes first because it knows what is handed in.
  const seen = new Set<string>();
  const items: { id: string; title: string; course: string; due: string; url?: string; overdue: boolean }[] = [];
  const add = (key: string, title: string | undefined, course: string, dueAt: unknown, url?: string) => {
    const due = Date.parse(String(dueAt ?? ''));
    if (Number.isNaN(due) || due > now + AHEAD_DAYS * DAY || due < now - BEHIND_DAYS * DAY) return;
    const same = `${(title ?? '').trim().toLowerCase()}|${due}`;
    if (seen.has(key) || seen.has(same)) return;
    seen.add(key); seen.add(same);
    items.push({ id: key, title: title || 'Assignment', course, due: new Date(due).toISOString(), url, overdue: due < now });
  };

  for (const p of asList(plan)) {
    const type = String(p.plannable_type ?? '');
    if (!coursework.has(type) || !p.plannable) continue;
    const s = p.submissions && typeof p.submissions === 'object' ? p.submissions : {};
    if (p.planner_override?.marked_complete || p.planner_override?.dismissed || s.submitted || s.excused || s.graded) continue;
    add(`${type}:${p.plannable_id ?? p.plannable.id}`, p.plannable.title ?? p.plannable.name, courseName(p.course_id, p.context_name), p.plannable.due_at ?? p.plannable_date, link(p.html_url));
  }
  // To-dos for a teacher or TA ("grading") are other people's work.
  for (const item of asList(todo)) {
    const work = item.assignment ?? item.quiz;
    if (item.type !== 'submitting' || !work) continue;
    add(`${item.assignment ? 'assignment' : 'quiz'}:${work.id}`, work.name ?? work.title, courseName(work.course_id ?? item.course_id, item.context_name), work.due_at, link(item.html_url ?? work.html_url));
  }
  for (const work of asList(missing)) add(`assignment:${work.id}`, work.name, courseName(work.course_id), work.due_at, link(work.html_url));

  items.sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  return {
    needs: items.slice(0, MAX_ASSIGNMENTS).map(i => ({
      id: `canvas:${i.id}`, title: i.title, who: i.course || undefined,
      detail: `${i.overdue ? 'Overdue, was due' : 'Due'} ${when(i.due)}${i.course ? ` · ${i.course}` : ''}`,
      // The board shows `at` as time since it arrived, so a future due date would read as "now" and sort ahead of
      // everything. Overdue work keeps its due date (how long it has been late); coming work counts from now.
      source: 'Canvas', at: i.overdue ? i.due : iso(now), url: i.url,
    })),
    updates: asList(notices).slice(0, MAX_ANNOUNCEMENTS).map(n => ({
      id: `canvas-announcement:${n.id}`, title: n.title || 'Announcement',
      detail: [courseName(String(n.context_code ?? '').replace('course_', '') || undefined), short(stripTags(n.message ?? ''), 140)].filter(Boolean).join(' · '),
      source: 'Canvas', at: n.posted_at ?? n.created_at, url: link(n.html_url ?? n.url),
    })),
  };
}

export const canvasDefs: Def[] = [
  {
    id: 'canvas', name: 'Canvas', group: 'Tasks', mockOnly: true,
    reads: 'Your coursework that is overdue or due in the next week, with the course and due date, and the last week of course announcements. Work you have handed in is left out. Read only: OXBOT never submits or posts anything.',
    fields: [
      { key: 'CANVAS_URL', label: 'Your school’s Canvas address', placeholder: 'https://yourschool.instructure.com' },
      { key: 'CANVAS_TOKEN', label: 'Access token', secret: true },
    ],
    setup: 'Sign in to Canvas → Account → Settings → Approved Integrations → New Access Token. Name it OXBOT, leave the expiry as you like, and copy the token (Canvas shows it once). Paste it with the address you sign in at.',
    setupUrl: 'https://community.canvaslms.com/t5/Canvas-Basics-Guide/How-do-I-manage-API-access-tokens-in-my-user-account/ta-p/615312',
    pull: ({ field }) => canvasPull(field('CANVAS_URL'), field('CANVAS_TOKEN')),
  },
];
