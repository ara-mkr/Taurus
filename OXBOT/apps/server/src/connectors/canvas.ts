import { isIP } from 'node:net';
import { DAY, iso, stripTags, type Def, type Pull } from './kit.ts';

// Canvas LMS (Instructure): coursework for students. Read-only, GET only, built from Canvas's documented REST API v1
// (https://developerdocs.instructure.com/services/canvas) and tested only against mocked responses.
//
// Canvas OAuth needs a developer key issued by each school, so OXBOT's one-click sign-in cannot serve it. The student
// pastes their school's Canvas address and a personal access token they generate themselves (Account → Settings →
// "New Access Token"). Nothing is ever submitted, posted, marked or changed: the only reads are
//   GET /api/v1/users/self/todo, /upcoming_events, /missing_submissions, /courses, /announcements.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const MAX_ASSIGNMENTS = 10;
const MAX_ANNOUNCEMENTS = 5;
const MAX_COURSES = 10; // /announcements accepts at most ten context_codes[] per request.

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

export async function canvasPull(baseField: string | undefined, token: string | undefined, now = Date.now()): Promise<Pull> {
  const base = canvasBase(baseField);
  if (!token?.trim()) throw new Error('Canvas: paste your access token (Canvas → Account → Settings → New Access Token).');
  const t = token.trim();

  const courses = await get<any[]>(base, t, 'courses?enrollment_state=active&per_page=50');
  const names = new Map<number, string>(courses.map(c => [c.id, c.name || c.course_code || `Course ${c.id}`]));
  const courseName = (id?: number, fallback?: string) => (id !== undefined && names.get(id)) || fallback || '';

  const codes = courses.slice(0, MAX_COURSES).map(c => `context_codes[]=course_${c.id}`).join('&');
  const [todo, upcoming, missing, notices] = await Promise.all([
    optional(get<any[]>(base, t, 'users/self/todo?per_page=30'), []),
    optional(get<any[]>(base, t, 'users/self/upcoming_events?per_page=30'), []),
    optional(get<any[]>(base, t, 'users/self/missing_submissions?per_page=30'), []),
    codes ? optional(get<any[]>(base, t, `announcements?${codes}&active_only=true&start_date=${iso(now - 7 * DAY).slice(0, 10)}&per_page=20`), []) : Promise.resolve([]),
  ]);

  // The same assignment can arrive from several lists; keep the first, which carries the course name.
  const seen = new Set<string>();
  const items: { id: string; title: string; course: string; due: string; url?: string; overdue: boolean }[] = [];
  const add = (assignment: any, course: string, url?: string) => {
    if (!assignment?.id || !assignment.due_at || seen.has(String(assignment.id))) return;
    seen.add(String(assignment.id));
    items.push({ id: String(assignment.id), title: assignment.name || 'Assignment', course, due: assignment.due_at, url: url ?? assignment.html_url, overdue: Date.parse(assignment.due_at) < now });
  };
  for (const item of todo) if (item.type === 'submitting') add(item.assignment, courseName(item.assignment?.course_id ?? item.course_id, item.context_name), item.html_url);
  for (const event of upcoming) {
    if (event.assignment) add(event.assignment, courseName(event.assignment.course_id, event.context_name), event.html_url);
  }
  for (const assignment of missing) add(assignment, courseName(assignment.course_id), assignment.html_url);

  items.sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  return {
    needs: items.slice(0, MAX_ASSIGNMENTS).map(i => ({
      id: `canvas:${i.id}`, title: i.title, who: i.course || undefined,
      detail: `${i.overdue ? 'Overdue, was due' : 'Due'} ${when(i.due)}${i.course ? ` · ${i.course}` : ''}`,
      source: 'Canvas', at: i.due, url: i.url,
    })),
    updates: notices.slice(0, MAX_ANNOUNCEMENTS).map(n => ({
      id: `canvas-announcement:${n.id}`, title: n.title || 'Announcement',
      detail: [courseName(Number(String(n.context_code ?? '').replace('course_', '')) || undefined), short(stripTags(n.message ?? ''), 140)].filter(Boolean).join(' · '),
      source: 'Canvas', at: n.posted_at, url: n.html_url,
    })),
  };
}

export const canvasDefs: Def[] = [
  {
    id: 'canvas', name: 'Canvas', group: 'Tasks', mockOnly: true,
    reads: 'Your assignments that are overdue or coming up, with the course and due date, and the last week of course announcements. Read only: OXBOT never submits or posts anything.',
    fields: [
      { key: 'CANVAS_URL', label: 'Your school’s Canvas address', placeholder: 'https://yourschool.instructure.com' },
      { key: 'CANVAS_TOKEN', label: 'Access token', secret: true },
    ],
    setup: 'Sign in to Canvas → Account → Settings → Approved Integrations → New Access Token. Name it OXBOT, leave the expiry as you like, and copy the token (Canvas shows it once). Paste it with the address you sign in at.',
    setupUrl: 'https://community.canvaslms.com/t5/Canvas-Basics-Guide/How-do-I-manage-API-access-tokens-in-my-user-account/ta-p/615312',
    pull: ({ field }) => canvasPull(field('CANVAS_URL'), field('CANVAS_TOKEN')),
  },
];
