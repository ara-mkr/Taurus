import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// Taurus moving where you click, the function bar, and voice with a fake SpeechRecognition (no real microphone in tests).
const answer = 'Read Dana’s redlines before the investor call.';

// endDelay: how long the fake takes to close the microphone after its last words, like a slow real browser.
async function fakeSpeech(page: Page, deny = false, endDelay = 0) {
  await page.addInitScript(([deny, endDelay]) => {
    type Handler = ((e: unknown) => void) | null;
    class FakeRecognition {
      lang = ''; continuous = false; interimResults = false; running = false;
      onresult: Handler = null; onerror: Handler = null; onend: (() => void) | null = null;
      results: { isFinal: boolean; length: number; 0: { transcript: string } }[] = [];
      start() {
        const w = window as unknown as { speech: { started: { continuous: boolean }[]; active?: FakeRecognition } };
        w.speech.started.push({ continuous: this.continuous });
        if (deny) { setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }); return; }
        this.running = true; this.results = []; w.speech.active = this;
      }
      stop() { if (!this.running) return; this.running = false; setTimeout(() => this.onend?.(), endDelay); }
      abort() { this.stop(); }
      say(transcript: string, isFinal: boolean) {
        const last = this.results.at(-1), index = last && !last.isFinal ? this.results.length - 1 : this.results.length;
        this.results[index] = { isFinal, length: 1, 0: { transcript } };
        this.onresult?.({ resultIndex: index, results: this.results });
        if (isFinal && !this.continuous) this.stop();
      }
    }
    const w = window as unknown as Record<string, unknown>;
    w.speech = { started: [], say: (t: string, f: boolean) => (w.speech as { active?: FakeRecognition }).active?.say(t, f) };
    w.webkitSpeechRecognition = FakeRecognition; w.SpeechRecognition = FakeRecognition;
  }, [deny, endDelay] as const);
}
const say = (page: Page, text: string, final = true) => page.evaluate(([t, f]) => (window as unknown as { speech: { say: (t: string, f: boolean) => void } }).speech.say(t as string, f as boolean), [text, final] as const);

async function open(page: Page, init?: string) {
  if (init) await page.addInitScript(v => localStorage.setItem('taurus-voice', v), init);
  await mock(page);
  const asked: string[] = [];
  await page.route('**/api/ask', r => { const turns = r.request().postDataJSON().turns as { text: string }[]; asked.push(turns.at(-1)!.text); return r.fulfill({ json: { provider: 'Claude', text: answer } }); });
  await page.goto('/#profile');
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  return asked;
}

// The little Taurus that walked to cards is gone (owner, November 23, 2026: "the mini taurus should never show up inside
// the app dashboard, NEVER"); voice shows in a plain strip above the chat bar instead.
test('no little Taurus anywhere in the app, even while talking', async ({ page }) => {
  await fakeSpeech(page);
  await open(page);
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(page.locator('.voice-strip')).toHaveText('Listening.');
  await expect(page.locator('.taurus-buddy, .taurus-button')).toHaveCount(0);
});

for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['tablet', { width: 1180, height: 820 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`chat bar and push-to-talk on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await fakeSpeech(page);
    const asked = await open(page);
    const talk = page.getByRole('button', { name: 'Talk', exact: true });
    await expect(talk).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Chat with Taurus' }).getByRole('button', { name: 'Talk', exact: true })).toBeVisible();
    await talk.click();
    await expect(talk).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.voice-strip')).toHaveText('Listening.');
    await say(page, 'what should I do', false);
    await expect(page.locator('.voice-strip')).toHaveText('what should I do');
    await page.screenshot({ path: `${shots}/taurus-listening-${name}.png` });
    await say(page, 'what should I do before the investor call', true);
    await expect(page.locator('.voice-strip')).toContainText(answer);
    expect(asked).toEqual(['what should I do before the investor call']);
    // Cards fade in; under load the lowest ones can still be half transparent, which axe reads as low contrast.
    await page.waitForFunction(() => document.getAnimations().every(a => (a as CSSAnimation).animationName !== 'rise' || a.playState === 'finished'));
    expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
    await page.getByRole('link', { name: 'Open in Ask' }).click();
    await expect(page.getByRole('heading', { name: 'Ask Taurus' })).toBeVisible();
    await expect(page.locator('.turn.user')).toContainText('what should I do before the investor call');
    await expect(page.locator('.turn.assistant')).toContainText(answer);
  });
}

// November 6, 2026: "open up my notes app ... in like half a second". Talk sends the words the moment the browser
// settles on them, even when it is slow to close the microphone afterwards.
test('Talk sends the question as soon as the words are final, not when the microphone closes', async ({ page }) => {
  await fakeSpeech(page, false, 3_000);
  const asked = await open(page);
  const talk = page.getByRole('button', { name: 'Talk', exact: true });
  await talk.click();
  await expect(talk).toHaveAttribute('aria-pressed', 'true');
  await say(page, 'open up my notes app', false);
  const started = Date.now();
  await say(page, 'open up my notes app', true);
  await expect.poll(() => asked.length, { timeout: 1_000 }).toBe(1);
  console.log(`    final words to /api/ask: ${Date.now() - started} ms (the fake microphone closes after 3000 ms)`);
  expect(asked).toEqual(['open up my notes app']);
  await expect(page.locator('.voice-strip')).toContainText(answer);
  // The late end of the microphone doesn't send it twice.
  await page.waitForTimeout(3_300);
  expect(asked).toEqual(['open up my notes app']);
});

test('the wake word is off by default and turns on in Settings', async ({ page }) => {
  await fakeSpeech(page);
  await open(page);
  expect(await page.evaluate(() => (window as unknown as { speech: { started: unknown[] } }).speech.started.length)).toBe(0);
  const chat = page.getByRole('textbox', { name: 'Message Taurus' });
  await expect(chat).not.toHaveAttribute('placeholder', /Hey Taurus/);
  await page.getByRole('button', { name: 'Profile and settings' }).click();
  await page.locator('#profile-menu').getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Listen for “Hey Taurus” while Taurus is open').check();
  await expect(chat).toHaveAttribute('placeholder', 'Say “Hey Taurus”');
  expect(await page.evaluate(() => localStorage.getItem('taurus-voice'))).toBe('{"wake":true,"speak":false,"clap":false}');
  await page.screenshot({ path: `${shots}/look-voice-1440.png`, fullPage: true });
});

test('“Hey Taurus” wakes him only at the start of a phrase and the rest goes to Ask', async ({ page }) => {
  await fakeSpeech(page);
  const asked = await open(page, '{"wake":true}');
  await expect(page.getByRole('textbox', { name: 'Message Taurus' })).toHaveAttribute('placeholder', 'Say “Hey Taurus”');
  // One continuous recognizer (React's dev double-mount may start and abort an extra one), and it isn't restarting in a loop.
  const started = () => page.evaluate(() => (window as unknown as { speech: { started: { continuous: boolean }[] } }).speech.started);
  const first = await started();
  expect(first.every(s => s.continuous)).toBe(true);
  await page.waitForTimeout(1_500);
  expect((await started()).length).toBe(first.length);
  await say(page, 'I think the taurus is fine');
  await page.waitForTimeout(200);
  expect(asked).toEqual([]);
  // November 19, 2026: a sound-alike without "taurus" no longer wakes him.
  await say(page, 'hey box what is next');
  await page.waitForTimeout(200);
  expect(asked).toEqual([]);
  await say(page, 'hey taurus', false);
  await say(page, 'hey taurus what is next');
  await expect(page.locator('.voice-strip')).toContainText(answer);
  expect(asked).toEqual(['what is next']);
  await page.getByRole('button', { name: 'Close' }).click();
  await say(page, 'okay taurus');
  // November 7, 2026: a bare "Hey Taurus" gets a hello back ("I say hey taurus it says hey back within a second").
  await expect(page.locator('.voice-strip')).toHaveText(/^(?:Hey\.|Yo\.|Talk to me\.|What’s up\?|Here\. Go\.)$/);
  await say(page, 'who is waiting on me');
  await expect(page.locator('.voice-strip')).toContainText(answer);
  expect(asked).toEqual(['what is next', 'who is waiting on me']);
  // November 6, 2026: "yo taurus, hi taurus, TAURUS, taurus, anything like that not just hey taurus".
  for (const [phrase, rest] of [['yo taurus open notes', 'open notes'], ['hi taurus what time is it', 'what time is it'], ['Taurus pause', 'pause'], ['hello there taurus, next song', 'next song'], ['taurus what is next', 'what is next']]) {
    await page.getByRole('button', { name: 'Close' }).click();
    await say(page, phrase);
    await expect.poll(() => asked.at(-1), { message: phrase }).toBe(rest);
  }
  // "Oxford" isn't Taurus.
  const before = asked.length;
  await page.getByRole('button', { name: 'Close' }).click();
  await say(page, 'oxford is lovely');
  await page.waitForTimeout(200);
  expect(asked.length).toBe(before);
});

test('no browser support and a blocked microphone are said plainly', async ({ page }) => {
  await page.addInitScript(() => { const w = window as unknown as Record<string, unknown>; delete w.webkitSpeechRecognition; delete w.SpeechRecognition; });
  await open(page);
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(page.locator('.voice-strip')).toContainText('This browser can’t listen. Voice works in Chrome and Safari.');
  await page.getByRole('button', { name: 'Close' }).click();

  await fakeSpeech(page, true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(page.locator('.voice-strip')).toContainText('the microphone is blocked for this page');
});
