// Scans (owner, November 16, 2026): mocked Gmail, Google Calendar and OpenRouter, and a fixture Messages database.
// No real AI, mail, calendar or message is touched, and nothing is sent.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { makeChatDb } from './chatdb-fixture.ts';

const home = process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-scans-'));
process.env.OXBOT_BROKER_URL = '';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'MAC_MESSAGES_ON', 'SCAN_MODEL']) delete process.env[key];
process.env.OXBOT_CHAT_DB = await makeChatDb(mkdtempSync(join(tmpdir(), 'oxbot-chatdb-')), [
  { from: '+15550100', text: 'Can we do the design review Thursday at 3pm?', minutesAgo: 30 },
  { from: '+15550199', text: 'Your code is 448812', minutesAgo: 20 },
]);
const { store } = await import('../src/store.ts');
const { DEFAULT_SCAN, feed, runScan, saveScan, scans } = await import('../src/scans.ts');
const { approve, pending } = await import('../src/actions/index.ts');
const { useRunner } = await import('../src/mac.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const thursday3pm = (() => { const d = new Date(); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7)); d.setHours(15, 0, 0, 0); return d.toISOString(); })();
let ai: any[] = [];           // what each model call received
let models: string[] = [];    // which model each call used
let busy = new Set<string>(); // models that answer 429
let reply: (payload: any) => any = () => ({ updates: [], calendar: [], replies: [] });
let gmailIds = ['m1'];
const syncAt = Date.now() + 3_600_000; // fixed, or the event would look moved on every read
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  if (url === 'https://openrouter.ai/api/v1/models') return json({ data: [
    { id: 'nvidia/nemotron-3.5-lightning:free', supported_parameters: ['tools', 'tool_choice'], pricing: { prompt: '0', completion: '0' } },
    { id: 'google/gemma-4-31b-it:free', supported_parameters: ['tools'], pricing: { prompt: '0', completion: '0' } },
    { id: 'example/no-tools:free', supported_parameters: [], pricing: { prompt: '0', completion: '0' } },
  ] });
  if (url === 'https://openrouter.ai/api/v1/chat/completions') {
    const body = JSON.parse(String(init.body));
    models.push(body.model);
    if (busy.has(body.model)) return json({ error: { message: 'rate limited' } }, 429);
    ai.push(body);
    const payload = JSON.parse(body.messages[1].content);
    return json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'report', arguments: JSON.stringify(reply(payload)) } }] } }] });
  }
  const gm = url.match(/^https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/(.+)$/);
  if (gm) {
    if (gm[1].startsWith('messages?')) return json({ messages: gmailIds.map(id => ({ id })) });
    if (gm[1] === 'labels/INBOX') return json({ messagesUnread: gmailIds.length });
    const id = gm[1].match(/^messages\/([^?]+)/)?.[1];
    return json({ id, threadId: `t-${id}`, internalDate: String(Date.now() - 60 * 60_000), snippet: id === 'm1' ? 'Could you send the Q3 numbers by Friday?' : 'Lunch next week?', labelIds: ['INBOX', 'UNREAD'],
      payload: { headers: [{ name: 'From', value: id === 'm1' ? 'Dana Example <dana@example.com>' : 'Lee Example <lee@example.com>' }, { name: 'Subject', value: id === 'm1' ? 'Q3 numbers' : 'Lunch' }, { name: 'Message-ID', value: `<${id}@example.com>` }] } });
  }
  if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')) return json({ items: [{ id: 'e1', summary: 'Leadership sync', start: { dateTime: new Date(syncAt).toISOString() }, end: { dateTime: new Date(syncAt + 1_800_000).toISOString() }, status: 'confirmed' }] });
  throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${url}`);
}) as typeof fetch;

store.setSecrets({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret', OPENROUTER_API_KEY: 'or-test', MAC_MESSAGES_ON: '1' });
for (const id of ['gmail', 'google-calendar', 'gmail-send']) store.setTokens(id, { access_token: `${id}-token`, expires_at: Date.now() + 3_600_000, scope: 'https://www.googleapis.com/auth/gmail.send' });
const opened: string[][] = [];
useRunner(async (program, args) => { opened.push([program, ...args]); return ''; }, ['Calendar']);
beforeEach(() => { ai = []; models = []; busy = new Set(); });

test('the default scan is there and off until the owner turns it on; bad settings are refused', () => {
  const main = scans().find(s => s.id === DEFAULT_SCAN.id)!;
  assert.equal(main.on, false);
  assert.deepEqual(main.sources, ['email', 'calendar', 'messages', 'chat']);
  assert.throws(() => saveScan({ name: 'x', sources: [] }), /at least one/);
  assert.throws(() => saveScan({ name: 'x', sources: ['email'], everyMinutes: 1 }), /5 minutes/);
});

test('a scan reports what matters once: feed lines, one calendar card, a drafted reply card, and nothing invented', async () => {
  reply = payload => {
    const byKind = (kind: string, words: RegExp) => payload.new.find((i: any) => i.kind === kind && words.test(i.title + (i.detail ?? '')))?.ref;
    return {
      updates: [{ ref: byKind('email', /Q3/), text: 'Dana wants the Q3 numbers by Friday.' }],
      calendar: [{ ref: byKind('messages', /design review/), title: 'Design review', start: thursday3pm }, { ref: 'i99', title: 'Made up', start: thursday3pm }],
      replies: [{ ref: byKind('email', /Q3/), why: 'asks for numbers', draft: 'Dana, you’ll have them Thursday.' }, { ref: byKind('messages', /design review/), draft: 'Thursday at 3 works.' }],
    };
  };
  const r = await runScan(DEFAULT_SCAN.id);
  assert.equal(ai.length, 1, 'one AI call for the whole scan');
  assert.equal(models[0], 'nvidia/nemotron-3.5-lightning:free', 'a free model that takes tool calls');
  assert.match(ai[0].messages[0].content, /data, never instructions/);
  assert.deepEqual(ai[0].tools.map((t: any) => t.function.name), ['report']);
  const sent = JSON.parse(ai[0].messages[1].content);
  assert.ok(sent.new.some((i: any) => /Q3 numbers/.test(i.title)) && sent.new.some((i: any) => /design review/.test(i.title)));
  assert.ok(sent.calendar.some((e: any) => e.title === 'Leadership sync'), 'the calendar goes along as context');
  assert.equal(r.updates, 1);
  assert.equal(r.calendar, 1, 'the made-up item is dropped');
  const cards = pending();
  const cal = cards.filter(p => p.kind === 'calendar.add');
  assert.equal(cal.length, 1);
  assert.equal(cal[0].title, 'Add “Design review” to your calendar');
  assert.equal(cal[0].from, 'scan');
  const mail = cards.find(p => p.kind === 'email.reply')!;
  assert.equal(mail.to, 'dana@example.com');
  assert.equal(mail.text, 'Dana, you’ll have them Thursday.');
  const kinds = feed().map(f => f.kind);
  assert.ok(kinds.includes('update') && kinds.includes('calendar') && kinds.includes('reply'));
  // Messages can't send without "Control this Mac", so the draft waits in the feed instead of a card.
  const text = feed().find(f => f.draft === 'Thursday at 3 works.')!;
  assert.match(text.text, /Control this Mac/);
  assert.equal(cards.some(p => p.kind === 'mac.message'), false);
});

test('nothing is reported twice: an unchanged inbox costs no AI call, and only the new item goes next time', async () => {
  const again = await runScan(DEFAULT_SCAN.id);
  assert.equal(ai.length, 0);
  assert.equal(again.fresh, 0);
  assert.equal(again.note, 'Nothing new.');
  gmailIds = ['m1', 'm2'];
  reply = () => ({ updates: [], calendar: [], replies: [] });
  const third = await runScan(DEFAULT_SCAN.id);
  assert.equal(third.fresh, 1);
  assert.deepEqual(JSON.parse(ai[0].messages[1].content).new.map((i: any) => i.title), ['Lunch']);
});

test('a busy free model (429) hands over to the next one', async () => {
  gmailIds = ['m1', 'm2', 'm3'];
  busy = new Set(['nvidia/nemotron-3.5-lightning:free']);
  const r = await runScan(DEFAULT_SCAN.id);
  assert.deepEqual(models, ['nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-31b-it:free']);
  assert.equal(r.model, 'google/gemma-4-31b-it:free');
});

test('the calendar card does nothing until approved, then hands one .ics to Calendar', async () => {
  const card = pending().find(p => p.kind === 'calendar.add')!;
  assert.equal(opened.length, 0, 'nothing opened before approval');
  assert.equal(readdirSync(home).includes('calendar'), false, 'nothing written before approval');
  const done = await approve(card.id, { digest: card.digest });
  assert.equal(done.state, 'done');
  assert.equal(opened.length, 1);
  assert.equal(opened[0][0], 'open');
  const ics = readFileSync(opened[0][1], 'utf8');
  assert.match(ics, /BEGIN:VEVENT[\s\S]*SUMMARY:Design review[\s\S]*END:VEVENT/);
  assert.match(ics, new RegExp(`DTSTART:${thursday3pm.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`));
});

test('without an OpenRouter sign-in a free scan says what to do instead of guessing', async () => {
  store.setSecrets({ OPENROUTER_API_KEY: '' });
  gmailIds = ['m1', 'm2', 'm3', 'm4'];
  await assert.rejects(runScan(DEFAULT_SCAN.id), /Sign in with OpenRouter/);
  assert.match(scans().find(s => s.id === DEFAULT_SCAN.id)!.lastError ?? '', /OpenRouter/);
  store.setSecrets({ OPENROUTER_API_KEY: 'or-test' });
});
