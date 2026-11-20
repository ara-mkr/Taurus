// Taurus's ears in the desktop app (November 7, 2026). A fake engine stands in for Moonshine, so nothing downloads. The
// last test runs the real model on a phrase spoken by macOS `say`, only with TAURUS_TEST_EARS=1 (it downloads about
// 110 MB once into TAURUS_HOME/models).
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

process.env.TAURUS_HOME ??= mkdtempSync(join(tmpdir(), 'taurus-hearing-'));
const { cleanHeard, hear, pcm, useEars, RATE, MAX_SECONDS } = await import('../src/hearing.ts');

const int16 = (samples: number[]) => { const b = Buffer.alloc(samples.length * 2); samples.forEach((s, i) => b.writeInt16LE(s, i * 2)); return b; };

test('16-bit audio becomes samples between -1 and 1, and bad sizes are refused', () => {
  const out = pcm(int16([0, 16384, -32768, 32767]));
  assert.deepEqual([...out].map(v => Math.round(v * 100) / 100), [0, 0.5, -1, 1]);
  assert.throws(() => pcm(Buffer.alloc(3)), /16-bit/);
  assert.throws(() => pcm(Buffer.alloc(0)), /16-bit/);
  assert.throws(() => pcm(Buffer.alloc(RATE * 2 * MAX_SECONDS + 2)), /at most 15 seconds/);
});

test('the stock phrases speech models make out of silence count as nothing', () => {
  for (const junk of ['[BLANK_AUDIO]', '(wind blowing)', 'Thank you.', 'you', '...', 'Thanks for watching!']) assert.equal(cleanHeard(junk), '', junk);
  assert.equal(cleanHeard('  Hey Taurus,   open my notes app. '), 'Hey Taurus, open my notes app.');
  assert.equal(cleanHeard('Thank you, Taurus'), 'Thank you, Taurus');
});

test('one stretch at a time, in the order they arrived', async () => {
  const order: number[] = [];
  useEars(async () => async audio => { const n = audio.length; await new Promise(r => setTimeout(r, n === 2 ? 30 : 1)); order.push(n); return `heard ${n}`; });
  const [a, b] = await Promise.all([hear(int16([1, 2])), hear(int16([1, 2, 3]))]);
  assert.deepEqual([a, b], ['heard 2', 'heard 3']);
  assert.deepEqual(order, [2, 3]);
  useEars();
});

// The route, on a real server with its own home.
const port = 8835;
const base = `http://127.0.0.1:${port}`;
let server: ReturnType<typeof spawn>;
before(async () => {
  server = spawn(process.execPath, [join(import.meta.dirname, '../src/index.ts')], { env: { ...process.env, TAURUS_HOME: mkdtempSync(join(tmpdir(), 'taurus-hear-route-')), TAURUS_PORT: String(port), TAURUS_BROKER_URL: '', TAURUS_NO_SCHEDULER: '1', TAURUS_WEB_ROOT: tmpdir() }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { await fetch(`${base}/api/health`); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
});
after(() => { server?.kill(); });

test('/api/voice/hear needs the Taurus header, whole samples and at most 15 seconds', async () => {
  const post = (body: Buffer, headers: Record<string, string> = { 'x-taurus': '1' }) => fetch(`${base}/api/voice/hear`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...headers }, body });
  assert.equal((await post(int16([1, 2]), {})).status, 403);
  assert.equal((await post(Buffer.alloc(3))).status, 400);
  assert.equal((await post(Buffer.alloc(RATE * 2 * MAX_SECONDS + 4))).status, 413);
});

test('the real model hears “Hey Taurus, open my notes app” in well under a second', { skip: process.env.TAURUS_TEST_EARS !== '1' || process.platform !== 'darwin' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'taurus-say-'));
  execFileSync('say', ['-o', join(dir, 'p.aiff'), 'Hey Taurus, open my notes app.']);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', join(dir, 'p.aiff'), join(dir, 'p.wav')]);
  const wav = readFileSync(join(dir, 'p.wav'));
  const body = wav.subarray(wav.indexOf('data') + 8);
  await hear(body);                                   // loads the model
  const started = performance.now();
  const text = await hear(body);
  const ms = performance.now() - started;
  console.log(`heard "${text}" in ${ms.toFixed(0)} ms`);
  assert.match(text.toLowerCase(), /taurus.*open my notes app/);
  assert.ok(ms < 1500, `${ms} ms`);
});
