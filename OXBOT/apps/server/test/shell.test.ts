// The new shell's server parts (owner, November 1, 2026): OXBOT's read-only browser walls, the activity log, and
// the profile and background kept in prefs. Nothing here opens a browser or contacts anything outside this Mac.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-shell-'));
const { refuse, toUrl } = await import('../src/browser.ts');
const { begin, note, recent, resetActivity } = await import('../src/activity.ts');
const { sanitize } = await import('../src/boards.ts');

test('the browser opens only public web pages', () => {
  for (const ok of ['https://example.com/a?b=c', 'http://news.example.org', 'https://93.184.215.14/']) assert.equal(refuse(ok), '', ok);
  for (const no of ['http://localhost:8787/api/dashboard', 'http://127.0.0.1:8787', 'http://192.168.1.10', 'http://10.0.0.2', 'http://172.20.0.1', 'http://169.254.169.254/latest',
    'http://[::1]:8787', 'http://mac.local', 'http://app.localhost', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'not a url']) assert.notEqual(refuse(no), '', no);
});

test('words become a search, a bare name becomes https', () => {
  assert.equal(toUrl('example.com/news'), 'https://example.com/news');
  assert.equal(toUrl('https://example.com'), 'https://example.com');
  assert.match(toUrl('best ramen near soho'), /^https:\/\/duckduckgo\.com\/html\/\?q=best%20ramen%20near%20soho$/);
});

test('activity lines finish in place, and repeats inside the window are skipped', () => {
  resetActivity();
  const step = begin('read', 'Checking Gmail');
  assert.equal(recent().at(-1)!.state, 'running');
  step.done('Checked Gmail');
  assert.equal(recent().length, 1);
  assert.equal(recent()[0].text, 'Checked Gmail');
  assert.equal(recent()[0].state, 'done');
  begin('feed', 'Watching markets', { every: 60_000 }).done();
  begin('feed', 'Watching markets', { every: 60_000 }).done();
  assert.equal(recent().filter(e => e.kind === 'feed').length, 1);
  begin('ai', 'Thinking').fail(new Error('No AI'));
  note('action', 'Waiting for your OK: Reply to Sam');
  assert.deepEqual(recent().slice(-2).map(e => e.state), ['failed', 'note']);
});

test('profile and background are kept tidy', () => {
  const p = sanitize({ profile: { name: '  Akhil  ', tone: 'loud' as never, greet: false, large: true, photo: 'https://example.com/x.png' },
    background: { kind: 'link', color: 'red', url: 'javascript:alert(1)', dim: 400, blur: -3, daylight: false } });
  assert.deepEqual(p.profile, { name: 'Akhil', tone: 'witty', greet: false, large: true });
  assert.equal(p.background.kind, 'field', 'a link background without a safe https URL falls back');
  assert.equal(p.background.color, '#14161B');
  assert.equal(p.background.dim, 85);
  assert.equal(p.background.blur, 0);
  const q = sanitize({ background: { kind: 'link', color: '#112233', url: 'https://images.example.com/sky.jpg', dim: 20, blur: 4, daylight: true } });
  assert.equal(q.background.kind, 'link');
  assert.equal(q.background.url, 'https://images.example.com/sky.jpg');
  const photo = sanitize({ profile: { name: '', tone: 'warm', greet: true, large: false, photo: 'data:image/jpeg;base64,AAAA' } });
  assert.equal(photo.profile.photo, 'data:image/jpeg;base64,AAAA');
  assert.equal(sanitize({}).profile.tone, 'witty'); // the default since November 7, 2026
});
