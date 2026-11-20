import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-learn-'));
process.env.TAURUS_BROKER_URL = '';
process.env.TAURUS_NO_SCHEDULER = '1';
const { learnDecline, learnEdit, lessons, lessonsText } = await import('../src/learn.ts');
const { emailRoutine, EMAIL_TASK } = await import('../src/routines.ts');
const { schedules } = await import('../src/schedule.ts');
const { tidy } = await import('../src/instant.ts');

// Luke's Day 1, November 19, 2026: drafts you edit or decline teach Taurus, and one line sets up the email routine.
const draft = { id: 'p1', kind: 'gmail.reply', app: 'Gmail', title: 'Reply to Sam', to: 'sam@example.com', text: 'Dear Sam, thank you kindly for your note.' } as any;

test('an edited draft and a declined one become lessons for the next draft', () => {
  learnEdit(draft, draft.text, 'yo sam, sounds good');
  learnEdit(draft, 'same', 'same');
  learnDecline({ ...draft, title: 'Reply to the newsletter' });
  assert.equal(lessons().length, 2, 'an unchanged draft teaches nothing');
  const text = lessonsText();
  assert.match(text, /yo sam, sounds good/);
  assert.match(text, /declined "Reply to the newsletter"/);
});

test('"check my email twice a day" sets up weekdays at 8 and 4 once, and stops on request', () => {
  assert.match(emailRoutine(tidy('Hey Taurus, check my email twice a day.'))!.text, /8 and 4/);
  emailRoutine(tidy('set up my email routine'));
  const mine = schedules().filter(s => s.task === EMAIL_TASK);
  assert.deepEqual(mine.map(s => s.when).sort(), ['every weekday at 4pm', 'every weekday at 8am'], 'two checks, never duplicated');
  assert.equal(emailRoutine(tidy('what is in my email')), null);
  assert.match(emailRoutine(tidy('stop the email routine'))!.text, /off/);
  assert.equal(schedules().filter(s => s.task === EMAIL_TASK).length, 0);
});
