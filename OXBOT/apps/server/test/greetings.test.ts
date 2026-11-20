// November 7, 2026: "Hey Taurus" answers at once, with no AI, and Taurus's default voice is the witty one.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-greet-'));
process.env.TAURUS_BROKER_URL = '';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[key];

const { greeting, allGreetings } = await import('../src/greetings.ts');
const { instant } = await import('../src/instant.ts');
const { persona } = await import('../src/ai.ts');
const { prefs } = await import('../src/boards.ts');

const noon = new Date(2026, 10, 7, 12, 0);

test('a bare hello is a greeting; a question is not', () => {
  for (const said of ['', 'hey', 'yo', 'what\'s up', 'you there', 'good morning', 'how are you', 'how\'s it going']) assert.ok(greeting(said, 'witty', noon), said);
  for (const said of ['hey what time is it', 'open notes', 'how are you going to fix this', 'hello world app']) assert.equal(greeting(said, 'witty', noon), null, said);
});

test('the time of day shows in the witty hello, and the plain tones stay plain', () => {
  const late = new Date(2026, 10, 7, 2, 30), early = new Date(2026, 10, 7, 7, 0);
  assert.match(greeting('', 'witty', late)!, /asleep|middle of the night/i);
  assert.match(greeting('', 'witty', early)!, /^Morning/);
  assert.ok(['Hey. What do you need?', 'Here.', 'Yes?'].includes(greeting('', 'brief', late)!));
  // Never the same line twice in a row.
  const lines = Array.from({ length: 20 }, () => greeting('', 'witty', noon));
  assert.ok(lines.every((l, i) => i === 0 || l !== lines[i - 1]));
  assert.ok(allGreetings.every(l => l.split(/\s+/).length <= 8), 'short enough to say at once');
});

test('“Hey Taurus” and “yo Taurus, what’s up” are answered instantly, with no AI', async () => {
  for (const raw of ['Hey Taurus', 'Hey, Taurus.', 'yo taurus what\'s up', 'Taurus', 'hi taurus how are you']) {
    const started = performance.now();
    const reply = await instant(raw, 'talk');
    const ms = performance.now() - started;
    assert.ok(reply?.text, raw);
    assert.ok(ms < 250, `${raw}: ${ms} ms`);
  }
  assert.equal(await instant('hey taurus what is on my calendar', 'talk'), null);
});

test('Taurus is witty by default; Brief, Warm and Direct keep the calm voice', () => {
  assert.equal(prefs().profile.tone, 'witty');
  const sharp = persona('22:00', '07:00', { name: '', tone: 'witty' });
  assert.match(sharp, /Jarvis/);
  assert.match(sharp, /lazy bitch/);
  assert.match(sharp, /At most one curse/);
  assert.match(sharp, /no swearing and no jokes at the reader's expense/);
  assert.match(sharp, /no jokes and no swearing when they are stressed/);
  const calm = persona('22:00', '07:00', { name: '', tone: 'brief' });
  assert.doesNotMatch(calm, /Jarvis|swear|curse/);
  assert.match(calm, /calm, warm and steady/);
  assert.match(calm, /No exclamation marks/);
});
