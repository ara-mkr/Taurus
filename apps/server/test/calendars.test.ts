// Apple Calendar on this Mac, every Google calendar (what Notion Calendar shows) and Notion's dated items (owner,
// November 20, 2026: "can u make it take apple and notion calender"). Mocked Google and Notion and a stand-in for
// macOS; no real calendar is read.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-calendars-'));
process.env.TAURUS_BROKER_URL = '';
const { store } = await import('../src/store.ts');
const c = await import('../src/connectors.ts');
const mac = await import('../src/mac.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
const today = new Date(); today.setHours(0, 0, 0, 0);
const at = (h: number) => new Date(today.getTime() + h * 3_600_000).toISOString();
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const asked: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  asked.push(url);
  if (url.startsWith('https://www.googleapis.com/calendar/v3/users/me/calendarList')) return json({ items: [
    { id: 'alex@example.com', primary: true, selected: true }, { id: 'team@example.com', selected: true }, { id: 'holidays@example.com', selected: false },
  ] });
  const cal = url.match(/calendars\/([^/]+)\/events/);
  if (cal) {
    const id = decodeURIComponent(cal[1]);
    if (id === 'alex@example.com') return json({ items: [{ id: 'e1', iCalUID: 'shared-1', summary: 'Standup', start: { dateTime: at(9) }, end: { dateTime: at(9.5) } }] });
    if (id === 'team@example.com') return json({ items: [
      { id: 'e1-copy', iCalUID: 'shared-1', summary: 'Standup', start: { dateTime: at(9) }, end: { dateTime: at(9.5) } },
      { id: 'e2', iCalUID: 'team-2', summary: 'Design review', start: { dateTime: at(8) }, end: { dateTime: at(8.5) } },
    ] });
    throw new Error(`calendar not switched on was read: ${id}`);
  }
  if (url === 'https://api.notion.com/v1/databases/db1') return json({ properties: { Name: { type: 'title' }, Due: { type: 'date' }, Status: { type: 'status' } } });
  if (url === 'https://api.notion.com/v1/databases/db1/query') {
    const body = JSON.parse(String(init.body));
    if (body.filter) {
      assert.equal(body.filter.and[0].property, 'Due');
      return json({ results: [
        { id: 'p1', url: 'https://www.notion.so/p1', properties: { Name: { type: 'title', title: [{ plain_text: 'Ship the deck' }] }, Due: { type: 'date', date: { start: today.toISOString().slice(0, 10) } } } },
        { id: 'p2', url: 'https://www.notion.so/p2', properties: { Name: { type: 'title', title: [{ plain_text: 'Call Sam' }] }, Due: { type: 'date', date: { start: at(15), end: at(15.5) } } } },
      ] });
    }
    return json({ results: [] });
  }
  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;

test('Google Calendar reads every calendar switched on, once per event, in time order', async () => {
  store.setSecrets({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' });
  store.setTokens('google-calendar', { access_token: 't', expires_at: Date.now() + 3_600_000 });
  const [r] = await c.pullAll(d => d.id === 'google-calendar');
  assert.equal(r.error, undefined);
  assert.deepEqual((r.pull as any).schedule.map((e: any) => e.title), ['Design review', 'Standup'], 'the shared standup shows once');
  assert.ok(!asked.some(u => u.includes('holidays')), 'a calendar switched off is not read');
});

test('Notion items dated today or tomorrow go on the schedule', async () => {
  store.setSecrets({ NOTION_TOKEN: 'secret_x', NOTION_DATABASE_ID: 'db1' });
  const [r] = await c.pullAll(d => d.id === 'notion');
  assert.equal(r.error, undefined);
  const schedule = (r.pull as any).schedule;
  assert.deepEqual(schedule.map((e: any) => [e.title, e.allDay]), [['Ship the deck', true], ['Call Sam', false]]);
  assert.equal(schedule[0].source, 'Notion');
});

test('Apple Calendar on this Mac: switched on, it reads the Calendar app’s events through EventKit', async () => {
  const ran: string[][] = [];
  mac.useRunner((async (_program: string, args: string[]) => {
    ran.push(args);
    return JSON.stringify({ status: '3', events: [{ id: 'x1', title: 'Dentist', start: Date.parse(at(11)), end: Date.parse(at(12)), allDay: false, location: 'Example Dental', calendar: 'Home' }] });
  }) as any, []);
  assert.equal(c.isConnected('apple-calendar'), false, 'off until switched on');
  store.setSecrets({ APPLE_CALENDAR_ON: '1' });
  const [r] = await c.pullAll(d => d.id === 'apple-calendar');
  assert.equal(r.error, undefined);
  assert.deepEqual((r.pull as any).schedule, [{ id: 'acal:x1', title: 'Dentist', start: at(11), end: at(12), allDay: false, location: 'Example Dental', url: undefined, source: 'Apple Calendar · Home' }]);
  assert.deepEqual(ran[0].slice(0, 2), ['-l', 'JavaScript']);
  assert.equal(ran[0][2], '-e');
  assert.match(ran[0][3], /EKEventStore/);

  mac.useRunner((async () => JSON.stringify({ status: 2 })) as any, []);
  const [denied] = await c.pullAll(d => d.id === 'apple-calendar');
  assert.match(denied.error ?? '', /Privacy & Security, Calendars/);
  mac.useRunner();
});
