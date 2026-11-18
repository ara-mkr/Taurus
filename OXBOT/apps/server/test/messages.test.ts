// Messages on this Mac (owner, November 16, 2026): read-only, off by default, against a fixture chat.db only.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { attributedBody, makeChatDb } from './chatdb-fixture.ts';

process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-messages-'));
delete process.env.MAC_MESSAGES_ON;
const dir = mkdtempSync(join(tmpdir(), 'oxbot-chatdb-'));
const long = 'Running late, the 405 is a parking lot again. '.repeat(4).trim();
process.env.OXBOT_CHAT_DB = await makeChatDb(dir, [
  { from: '+15550100', text: 'Dinner Friday at 7?', minutesAgo: 90 },
  { from: '+15550101', body: 'Can you sign the offer letter today?', minutesAgo: 60 },
  { from: '+15550100', text: 'Loved “Dinner Friday at 7?”', minutesAgo: 59, reaction: true },
  { from: 'me', chat: '+15550100', me: true, text: 'Yes, 7 works', minutesAgo: 50 },
  { from: '+15550102', chat: 'Founders', group: true, body: long, minutesAgo: 5 },
]);
const { store } = await import('../src/store.ts');
const { appleDate, bodyText, messagesStatus, readMessages } = await import('../src/messages.ts');

test('words kept only in attributedBody are decoded, short and long', () => {
  assert.equal(bodyText(attributedBody('Hi there')), 'Hi there');
  assert.equal(bodyText(attributedBody(long)), long);
  assert.equal(bodyText(Buffer.from('no string here')), '');
  assert.equal(bodyText(null), '');
});

test('Apple dates count from 2001, in nanoseconds or seconds', () => {
  assert.equal(appleDate(0), '2001-01-01T00:00:00.000Z');
  assert.equal(appleDate(86_400), '2001-01-02T00:00:00.000Z');
  assert.equal(appleDate(86_400_000_000_000), '2001-01-02T00:00:00.000Z');
});

test('off by default: nothing is read until the owner switches it on', async () => {
  assert.equal((await messagesStatus()).state, 'off');
  await assert.rejects(readMessages(), /Reading Messages is off/);
});

test('switched on, it reads newest first, skips reactions and knows the owner’s own messages and groups', async () => {
  store.setSecrets({ MAC_MESSAGES_ON: '1' });
  const status = await messagesStatus();
  assert.equal(status.state, 'ready');
  assert.ok(Math.abs(Date.parse(status.newest!) - (Date.now() - 5 * 60_000)) < 5_000, 'nanosecond dates come out right');
  const all = await readMessages();
  assert.deepEqual(all.map(m => m.text.slice(0, 20)), [long.slice(0, 20), 'Yes, 7 works', 'Can you sign the off', 'Dinner Friday at 7?']);
  assert.equal(all.some(m => /^Loved/.test(m.text)), false, 'reactions are left out');
  assert.equal(all[0].group, true);
  assert.equal(all[0].chat, 'Founders');
  assert.equal(all[1].fromMe, true);
  assert.equal(all[1].from, 'me');
  assert.equal(all[3].from, '+15550100');
  assert.match(all[3].id, /^mac:GUID-/);
});

test('it filters by who, by words (even words only in attributedBody), and by what came after a row', async () => {
  assert.deepEqual((await readMessages({ from: '5550101' })).map(m => m.text), ['Can you sign the offer letter today?']);
  assert.deepEqual((await readMessages({ query: 'offer letter' })).map(m => m.from), ['+15550101']);
  assert.deepEqual((await readMessages({ sinceRowid: 4 })).map(m => m.rowid), [5]);
  assert.equal((await readMessages({ incomingOnly: true })).some(m => m.fromMe), false);
});

test('it opens the database read-only and never changes it', async () => {
  const before = readFileSync(process.env.OXBOT_CHAT_DB!);
  await readMessages({ limit: 50 });
  assert.deepEqual(readFileSync(process.env.OXBOT_CHAT_DB!), before);
  const src = readFileSync(new URL('../src/messages.ts', import.meta.url), 'utf8');
  assert.match(src, /readOnly: true/);
  assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
});

test('without Full Disk Access it says so with the steps, instead of failing quietly', async () => {
  process.env.OXBOT_CHAT_DB = join(dir, 'locked.db');
  const locked = await messagesStatus();
  assert.equal(locked.state, 'no-access');
  assert.match(locked.steps!.join(' '), /Full Disk Access/);
  await assert.rejects(readMessages(), /hasn’t given OXBOT access/);
});
