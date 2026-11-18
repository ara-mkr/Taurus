// Canvas LMS connector, against mocked Canvas responses only. Fake school host, synthetic data, no real token, no network:
// every outside request goes to a fake fetch, and an unexpected one fails the test.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-canvas-'));
process.env.OXBOT_BROKER_URL = '';
const { canvasBase, canvasPull } = await import('../src/connectors/canvas.ts');
const { connectorInfo } = await import('../src/connectors.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake provider payloads */
const HOUR = 3_600_000;
const now = Date.now();
const iso = (offset: number) => new Date(now + offset).toISOString();
const BASE = 'https://fake-school.instructure.com';
const TOKEN = 'fake-canvas-token-123';

interface Seen { method: string; url: string; auth: string | null; redirect?: string }
type Handler = (url: string) => Response | undefined;

async function withFetch<T>(handler: Handler, run: (seen: Seen[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push({ method: (init?.method ?? 'GET').toUpperCase(), url, auth: new Headers(init?.headers).get('authorization'), redirect: init?.redirect });
    const reply = handler(url);
    if (!reply) throw new Error(`unexpected request ${url}`);
    return reply;
  }) as typeof fetch;
  try { return await run(seen); } finally { globalThis.fetch = real; }
}
const ok = (body: unknown) => Response.json(body);

const courses = [{ id: 1, name: 'Biology 101' }, { id: 2, name: 'Calculus II' }];
const standard: Handler = url => {
  if (url.includes('/courses?enrollment_state=active')) return ok(courses);
  if (url.includes('/users/self/todo')) return ok([{ type: 'submitting', context_name: 'Biology 101', assignment: { id: 10, name: 'Lab report', due_at: iso(5 * HOUR), course_id: 1, html_url: `${BASE}/courses/1/assignments/10` } }, { type: 'grading', assignment: { id: 99, name: 'Someone else’s grading', due_at: iso(HOUR), course_id: 1 } }]);
  if (url.includes('/users/self/upcoming_events')) return ok([]);
  if (url.includes('/users/self/missing_submissions')) return ok([]);
  if (url.includes('/announcements?')) return ok([]);
  return undefined;
};

test('the address is normalised to a bare https origin', () => {
  assert.equal(canvasBase('https://School.Instructure.com/courses/1?x=1#y'), 'https://school.instructure.com');
  assert.equal(canvasBase('  canvas.state.edu  '), 'https://canvas.state.edu');
  assert.equal(canvasBase('https://canvas.state.edu:443/'), 'https://canvas.state.edu');
});

test('addresses OXBOT must not send a token to are refused with a plain sentence', () => {
  for (const bad of ['', 'http://school.instructure.com', 'https://localhost', 'https://canvas.localhost', 'https://printer.local', 'https://wiki.internal', 'https://127.0.0.1', 'https://10.0.0.5', 'https://192.168.1.20', 'https://169.254.169.254', 'https://[::1]', 'https://intranet', 'https://user:pass@school.instructure.com', 'https://school.instructure.com:8443', 'ftp://school.instructure.com', 'not a url']) {
    assert.throws(() => canvasBase(bad), /^Error: Canvas: /, `should refuse ${JSON.stringify(bad)}`);
  }
});

test('reads documented endpoints with GET and a Bearer token, and shapes assignments', async () => {
  const pull = await withFetch(url => {
    if (url.includes('/users/self/upcoming_events')) return ok([{ id: 'assignment_11', title: 'Problem set', type: 'assignment', html_url: `${BASE}/courses/2/assignments/11`, assignment: { id: 11, name: 'Problem set', due_at: iso(2 * HOUR), course_id: 2 } }, { id: 'event_3', title: 'Office hours', type: 'event' }]);
    if (url.includes('/users/self/missing_submissions')) return ok([{ id: 7, name: 'Reading quiz', due_at: iso(-30 * HOUR), course_id: 1 }]);
    if (url.includes('/announcements?')) {
      assert.match(url, /context_codes\[\]=course_1&context_codes\[\]=course_2/);
      return ok([{ id: 50, title: 'Exam moved', message: '<p>Midterm is <b>Friday</b>.</p>', posted_at: iso(-HOUR), context_code: 'course_2', html_url: `${BASE}/courses/2/discussion_topics/50` }]);
    }
    return standard(url);
  }, async seen => {
    const result = await canvasPull(`${BASE}/`, TOKEN, now);
    assert.ok(seen.length >= 5);
    for (const call of seen) {
      assert.equal(call.method, 'GET');
      assert.equal(call.auth, `Bearer ${TOKEN}`);
      assert.equal(call.redirect, 'manual');
      assert.ok(call.url.startsWith(`${BASE}/api/v1/`), call.url);
    }
    return result;
  });
  // Oldest due date first; the overdue one is flagged; teacher "grading" items and non-assignment events are dropped.
  assert.deepEqual(pull.needs!.map(n => [n.id, n.title, n.who]), [['canvas:7', 'Reading quiz', 'Biology 101'], ['canvas:11', 'Problem set', 'Calculus II'], ['canvas:10', 'Lab report', 'Biology 101']]);
  assert.match(pull.needs![0].detail!, /^Overdue, was due /);
  assert.match(pull.needs![1].detail!, /^Due .* · Calculus II$/);
  assert.equal(pull.needs![2].at, iso(5 * HOUR));
  assert.equal(pull.needs![2].url, `${BASE}/courses/1/assignments/10`);
  assert.equal(pull.updates!.length, 1);
  assert.equal(pull.updates![0].title, 'Exam moved');
  assert.match(pull.updates![0].detail!, /^Calculus II · Midterm is\s+Friday\s*\.$/);
  assert.equal(pull.updates![0].source, 'Canvas');
});

test('a 401 says to check the token, and never repeats it', async () => {
  await withFetch(() => new Response('{"errors":[{"message":"Invalid access token."}]}', { status: 401 }), async () => {
    await assert.rejects(canvasPull(BASE, TOKEN, now), (error: Error) => /check/i.test(error.message) && /token/i.test(error.message) && !error.message.includes(TOKEN));
  });
});

test('a token that fails on a later read is still reported, not hidden by the best-effort reads', async () => {
  await withFetch(url => (url.includes('/users/self/todo') ? new Response('{}', { status: 401 }) : standard(url)), async () => {
    await assert.rejects(canvasPull(BASE, TOKEN, now), /token/);
  });
});

test('a school that hides one list still shows the rest', async () => {
  const pull = await withFetch(url => (url.includes('/missing_submissions') || url.includes('/announcements') ? new Response('nope', { status: 500 }) : standard(url)), () => canvasPull(BASE, TOKEN, now));
  assert.deepEqual(pull.needs!.map(n => n.title), ['Lab report']);
  assert.deepEqual(pull.updates, []);
});

test('a redirect is an error, never followed', async () => {
  await withFetch(() => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } }), async () => {
    await assert.rejects(canvasPull(BASE, TOKEN, now), /somewhere else/);
  });
});

test('items are capped', async () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, name: `Task ${i}`, due_at: iso((i + 1) * HOUR), course_id: 1 }));
  const notices = Array.from({ length: 20 }, (_, i) => ({ id: i, title: `Notice ${i}`, message: 'x'.repeat(500), posted_at: iso(-i * HOUR), context_code: 'course_1' }));
  const pull = await withFetch(url => {
    if (url.includes('/missing_submissions')) return ok(many);
    if (url.includes('/announcements?')) return ok(notices);
    return standard(url);
  }, () => canvasPull(BASE, TOKEN, now));
  assert.equal(pull.needs!.length, 10);
  assert.equal(pull.updates!.length, 5);
  assert.ok(pull.updates!.every(u => u.detail!.length <= 'Biology 101 · '.length + 140));
});

test('a missing address or token fails before any request', async () => {
  await withFetch(() => undefined, async seen => {
    await assert.rejects(canvasPull('', TOKEN, now), /address/);
    await assert.rejects(canvasPull(BASE, '  ', now), /token/);
    await assert.rejects(canvasPull('https://localhost', TOKEN, now), /public Canvas site/);
    assert.equal(seen.length, 0);
  });
});

test('Canvas is listed with Connections as a Tasks connector with a secret token field', () => {
  const canvas = connectorInfo().find(c => c.id === 'canvas')!;
  assert.ok(canvas, 'canvas is in the connectors list');
  assert.equal(canvas.name, 'Canvas');
  assert.equal(canvas.group, 'Tasks');
  assert.equal(canvas.auth, 'fields');
  assert.equal(canvas.mockOnly, true);
  assert.equal(canvas.connected, false);
  assert.equal(canvas.fields.find(f => f.key === 'CANVAS_TOKEN')?.secret, true);
  assert.ok(!canvas.fields.find(f => f.key === 'CANVAS_URL')?.secret);
});
