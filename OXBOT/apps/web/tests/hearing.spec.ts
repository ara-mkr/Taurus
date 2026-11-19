import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from './fixtures';

// The desktop app's own ears (November 7, 2026: "i said hey ox nothing happened"). Chromium's fake microphone plays a
// phrase spoken by macOS `say` on a loop; the page is told it is the desktop app, so it uses ../src/hearing.ts. The
// words are faked at /api/voice/hear (the real model is tested in apps/server/test/hearing.test.ts), but the audio
// that reaches it is real: cut from the microphone by loudness and sent as 16 kHz, 16-bit PCM.
const dir = mkdtempSync(join(tmpdir(), 'oxbot-mic-'));
const wav = join(dir, 'hey-ox.wav');
if (process.platform === 'darwin') {
  execFileSync('say', ['-o', join(dir, 'p.aiff'), '[[slnc 1200]] Hey Ox, open my notes app. [[slnc 3000]]']);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', join(dir, 'p.aiff'), wav]);
}
test.skip(!existsSync(wav), 'needs macOS say to make the spoken phrase');
test.describe.configure({ timeout: 60_000 });
test.use({ permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] } });

const answer = 'Opening Notes.';
async function open(page: import('@playwright/test').Page, voice: string) {
  await page.addInitScript(v => { localStorage.setItem('oxbot-voice', v); Object.assign(window, { oxbotDesktop: { platform: 'darwin', ...(window as { oxbotDesktop?: object }).oxbotDesktop } }); }, voice);
  await mock(page);
  const asked: string[] = [], heard: number[] = [];
  await page.route('**/api/ask', r => { asked.push((r.request().postDataJSON().turns as { text: string }[]).at(-1)!.text); return r.fulfill({ json: { provider: 'Claude', text: answer } }); });
  await page.route('**/api/voice/presence', r => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/voice/hear*', r => {
    if (r.request().url().includes('warm')) return r.fulfill({ json: { ready: true } });
    const bytes = r.request().postDataBuffer()?.length ?? 0;
    heard.push(bytes);
    // The phrase is about 2 s: anything that long is it, anything shorter is a stray noise.
    return r.fulfill({ json: { text: bytes > 16_000 * 2 ? 'Hey Ox, open my notes app.' : '' } });
  });
  await page.goto('/');
  return { asked, heard };
}

test('in the desktop app, “Hey Ox” is heard on this Mac and the rest goes to Ask', async ({ page }) => {
  const { asked, heard } = await open(page, '{"wake":true}');
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(asked[0].replace(/[.!?]$/, '')).toBe('open my notes app');
  // Whole phrases of 16-bit samples at 16 kHz: about 1.5 to 4 s each, never the whole loop.
  const phrase = heard.find(b => b > 32_000)!;
  expect(phrase % 2).toBe(0);
  expect(phrase / 32_000).toBeGreaterThan(1.2);
  expect(phrase / 32_000).toBeLessThan(4.5);
});

test('in the desktop app, Talk listens on this Mac instead of saying to use a browser', async ({ page }) => {
  const { asked } = await open(page, '{}');
  await page.getByRole('button', { name: 'Talk', exact: true }).first().click();
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBe(1);
  // Push-to-talk sends everything said, wake word and all; Ask gets it as spoken.
  expect(asked[0]).toBe('Hey Ox, open my notes app.');
  await expect(page.getByText('Voice needs Chrome or Safari')).toHaveCount(0);
});

test('phrases are cut by loudness: a pause ends one, a click is ignored', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/hearing.ts';
    const { phraseCutter, toPcm16 } = await import(/* @vite-ignore */ path) as typeof import('../src/hearing');
    const out: number[] = [];
    const cut = phraseCutter(frames => out.push(frames.length));
    const frame = (level: number) => { const f = new Float32Array(1024); for (let i = 0; i < f.length; i++) f[i] = Math.sin(i / 3) * level * Math.SQRT2; return f; };
    const feed = (level: number, n: number) => { for (let i = 0; i < n; i++) cut.feed(frame(level)); };
    feed(0.002, 20);              // room noise
    feed(0.2, 1); feed(0.002, 12); // a click: one loud frame
    feed(0.1, 20); feed(0.002, 12); // a phrase of 1.3 s, then a pause
    feed(0.1, 5); cut.flush();     // stopped mid-word: still counts
    return { out, pcm: toPcm16([new Float32Array([0, 0.5, -1, 1])]).byteLength };
  });
  expect(result.out.length).toBe(2);
  // The phrase keeps 256 ms from before the voice and ends after about half a second of quiet.
  expect(result.out[0]).toBeGreaterThanOrEqual(20 + 4);
  expect(result.out[0]).toBeLessThanOrEqual(20 + 4 + 9);
  expect(result.pcm).toBe(8);
});

// November 19, 2026: "anything with ox in it", and nothing without it.
test('the Mac’s run-together forms of “Ox” wake him, and sound-alikes without “ox” do not', async ({ page }) => {
  await page.goto('/');
  const got = await page.evaluate(async () => {
    const path = '/src/components/Voice.tsx';
    const { afterWake } = await import(/* @vite-ignore */ path) as typeof import('../src/components/Voice');
    return ['Yoox, what’s next?', 'I ox.', 'Iox, open notes', 'Yo-Ox, open notes', 'Hey, Ox, open my notes app.', 'Oxbot, pause', 'Hey ox bot next song',
      '6. Ochs set a timer for 5 minutes.', 'Hey box what is next', 'Box.', 'Ax', 'Okay, ox in a box', 'Oxford is lovely', 'I think so', 'Oh.'].map(afterWake);
  });
  expect(got).toEqual(['what’s next?', '', 'open notes', 'open notes', 'open my notes app.', 'pause', 'next song',
    null, null, null, null, 'in a box', null, null, null]);
});

// Ox anywhere (November 16, 2026; docs/21-ox-anywhere.md): with "Hey Ox" or the clap on, the desktop window asks to keep
// hearing while it is hidden or behind other apps; with both off, it asks to rest again.
test('the desktop window keeps hearing in the background only while “Hey Ox” or the clap is on', async ({ page, context }) => {
  const watch = (p: import('@playwright/test').Page) => p.addInitScript(() => {
    const calls: boolean[] = [];
    Object.assign(window, { keepCalls: calls, oxbotDesktop: { platform: 'darwin', keepHearing: (on: boolean) => calls.push(on) } });
  });
  // The distinct values asked for (React's development mode runs the effect twice).
  const calls = (p: import('@playwright/test').Page) => p.evaluate(() => [...new Set((window as unknown as { keepCalls: boolean[] }).keepCalls)]);
  await watch(page);
  await open(page, JSON.stringify({ wake: true, speak: false, clap: false }));
  await expect.poll(() => calls(page)).toEqual([true]);
  const clap = await context.newPage();
  await watch(clap);
  await open(clap, JSON.stringify({ wake: false, speak: false, clap: true }));
  await expect.poll(() => calls(clap)).toEqual([true]);
  const off = await context.newPage();
  await watch(off);
  await open(off, JSON.stringify({ wake: false, speak: false, clap: false }));
  await expect.poll(() => calls(off)).toEqual([false]);
});
