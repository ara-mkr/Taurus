import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// Ox moving where you click, the function bar, and voice with a fake SpeechRecognition (no real microphone in tests).
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
  if (init) await page.addInitScript(v => localStorage.setItem('oxbot-voice', v), init);
  await mock(page);
  const asked: string[] = [];
  await page.route('**/api/ask', r => { const turns = r.request().postDataJSON().turns as { text: string }[]; asked.push(turns.at(-1)!.text); return r.fulfill({ json: { provider: 'Claude', text: answer } }); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Needs you/ })).toBeVisible();
  return asked;
}
const ox = (page: Page) => page.locator('.ox-buddy');
const rest = (page: Page) => expect(ox(page)).toHaveAttribute('data-phase', 'rest', { timeout: 8_000 });
// After a click, first see him set off (React paints the first frame a moment after the click), then see him stop.
const travel = async (page: Page) => { await expect(ox(page)).not.toHaveAttribute('data-phase', 'rest'); await rest(page); };

test('clicking a card sends Ox there and he talks about it', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const w = window as unknown as { seen: string[] }, el = document.querySelector<HTMLElement>('.ox-buddy')!;
    w.seen = [];
    new MutationObserver(() => { const s = `${el.dataset.phase}/${el.querySelector('svg')!.dataset.mood}`; if (w.seen.at(-1) !== s) w.seen.push(s); }).observe(el, { attributes: true, subtree: true });
  });
  const card = page.getByRole('article', { name: 'Health', exact: true });
  await card.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await rest(page);
  const box = (await card.boundingBox())!;
  await page.mouse.click(box.x + box.width - 14, box.y + box.height - 10);
  await travel(page);
  // Turn with the horns pinched, run, settle as he slows, then stand still.
  const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
  expect(seen).toContain('turn/charge');
  expect(seen).toContain('run/charge');
  expect(seen).toContain('run/settle');
  expect(seen.at(-1)).toMatch(/^rest\//);
  const me = (await page.locator('.ox-button').boundingBox())!, now = (await card.boundingBox())!;
  expect(Math.abs(me.y + me.height - now.y)).toBeLessThan(20);
  expect(me.x).toBeGreaterThanOrEqual(now.x);
  expect(me.x + me.width).toBeLessThanOrEqual(now.x + now.width);
  expect(Number(await ox(page).getAttribute('data-heading'))).toBe(0);
  await expect(page.locator('.ox-bubble')).toContainText('Recovery 64%. A steady day.');
  await page.screenshot({ path: `${shots}/ox-perched-1440.png` });

  // The board background moves him too; links, buttons and charts keep their own clicks.
  const before = await ox(page).getAttribute('data-x');
  await page.getByRole('img', { name: /^Recovery, 30 days/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(300);
  expect(await ox(page).getAttribute('data-phase')).toBe('rest');
  expect(await ox(page).getAttribute('data-x')).toBe(before);
  const grid = (await page.locator('.board-bar').boundingBox())!;
  await page.mouse.click(grid.x + 40, grid.y + grid.height + 6);
  await travel(page);
  expect(await ox(page).getAttribute('data-x')).not.toBe(before);
});

test('clicking a card also works on a phone and keeps clear of the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const card = page.getByRole('article', { name: 'Right now', exact: true });
  const box = (await card.boundingBox())!;
  await page.mouse.click(box.x + box.width - 16, box.y + box.height / 2);
  await travel(page);
  await expect(page.locator('.ox-bubble')).toContainText(/Next up: Board prep/);
  const bubble = (await page.locator('.ox-bubble').boundingBox())!;
  expect(bubble.x).toBeGreaterThanOrEqual(0);
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('Ox fades to the clicked card instead of travelling', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const w = window as unknown as { phases: string[] }; w.phases = []; new MutationObserver(() => w.phases.push(document.querySelector<HTMLElement>('.ox-buddy')!.dataset.phase!)).observe(document.querySelector('.ox-buddy')!, { attributes: true }); });
    const card = page.getByRole('article', { name: 'Calendar', exact: true });
    await card.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await rest(page);
    const box = (await card.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 10);
    await expect(page.locator('.ox-bubble')).toContainText('Next up: Board prep');
    const me = (await page.locator('.ox-button').boundingBox())!;
    expect(Math.abs(me.y + me.height - box.y)).toBeLessThan(20);
    expect(await page.evaluate(() => (window as unknown as { phases: string[] }).phases.filter(p => p !== 'rest'))).toEqual([]);
  });
});

for (const [name, size] of [['desktop', { width: 1440, height: 1000 }], ['tablet', { width: 1180, height: 820 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`chat bar and push-to-talk on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await fakeSpeech(page);
    const asked = await open(page);
    const talk = page.getByRole('button', { name: 'Talk', exact: true });
    await expect(talk).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Chat with Ox' }).getByRole('button', { name: 'Talk', exact: true })).toBeVisible();
    await talk.click();
    await expect(talk).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ox-buddy svg')).toHaveAttribute('data-mood', 'listening');
    await expect(page.locator('.ox-bubble')).toHaveText('Listening.');
    await say(page, 'what should I do', false);
    await expect(page.locator('.ox-bubble')).toHaveText('what should I do');
    await rest(page);
    const bar = (await talk.boundingBox())!, me = (await page.locator('.ox-button').boundingBox())!;
    expect(Math.hypot(me.x + me.width / 2 - (bar.x + bar.width / 2), me.y + me.height / 2 - (bar.y + bar.height / 2))).toBeLessThan(120);
    await page.screenshot({ path: `${shots}/ox-listening-${name}.png` });
    await say(page, 'what should I do before the investor call', true);
    await expect(page.locator('.ox-bubble')).toContainText(answer);
    expect(asked).toEqual(['what should I do before the investor call']);
    // Cards fade in; under load the lowest ones can still be half transparent, which axe reads as low contrast.
    await page.waitForFunction(() => document.getAnimations().every(a => (a as CSSAnimation).animationName !== 'rise' || a.playState === 'finished'));
    expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
    await page.getByRole('link', { name: 'Open in Ask' }).click();
    await expect(page.getByRole('heading', { name: 'Ask Ox' })).toBeVisible();
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
  await expect(page.locator('.ox-bubble')).toContainText(answer);
  // The late end of the microphone doesn't send it twice.
  await page.waitForTimeout(3_300);
  expect(asked).toEqual(['open up my notes app']);
});

test('the wake word is off by default and turns on in Settings', async ({ page }) => {
  await fakeSpeech(page);
  await open(page);
  expect(await page.evaluate(() => (window as unknown as { speech: { started: unknown[] } }).speech.started.length)).toBe(0);
  const chat = page.getByRole('textbox', { name: 'Message Ox' });
  await expect(chat).not.toHaveAttribute('placeholder', /Hey Ox/);
  await page.getByRole('button', { name: 'Profile and settings' }).click();
  // November 6, 2026: the profile menu is short now; Settings opens Tabs and widgets.
  await page.locator('#profile-menu').getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Personalize' }).click();
  await page.getByLabel('Listen for “Hey Ox” while OXBOT is open').check();
  await expect(chat).toHaveAttribute('placeholder', 'Ask Ox, or say “Hey Ox”');
  expect(await page.evaluate(() => localStorage.getItem('oxbot-voice'))).toBe('{"wake":true,"speak":false,"clap":false}');
  await page.screenshot({ path: `${shots}/look-voice-1440.png`, fullPage: true });
});

test('“Hey Ox” wakes him only at the start of a phrase and the rest goes to Ask', async ({ page }) => {
  await fakeSpeech(page);
  const asked = await open(page, '{"wake":true}');
  await expect(page.getByRole('textbox', { name: 'Message Ox' })).toHaveAttribute('placeholder', 'Ask Ox, or say “Hey Ox”');
  // One continuous recognizer (React's dev double-mount may start and abort an extra one), and it isn't restarting in a loop.
  const started = () => page.evaluate(() => (window as unknown as { speech: { started: { continuous: boolean }[] } }).speech.started);
  const first = await started();
  expect(first.every(s => s.continuous)).toBe(true);
  await page.waitForTimeout(1_500);
  expect((await started()).length).toBe(first.length);
  await say(page, 'I think the ox is fine');
  await page.waitForTimeout(200);
  expect(asked).toEqual([]);
  await expect(page.locator('.ox-buddy svg')).not.toHaveAttribute('data-mood', 'listening');
  // November 19, 2026: a sound-alike without "ox" no longer wakes him.
  await say(page, 'hey box what is next');
  await page.waitForTimeout(200);
  expect(asked).toEqual([]);
  await expect(page.locator('.ox-buddy svg')).not.toHaveAttribute('data-mood', 'listening');
  await say(page, 'hey ox', false);
  await expect(page.locator('.ox-buddy svg')).toHaveAttribute('data-mood', 'listening');
  await say(page, 'hey ox what is next');
  await expect(page.locator('.ox-bubble')).toContainText(answer);
  expect(asked).toEqual(['what is next']);
  await page.getByRole('button', { name: 'Close' }).click();
  await say(page, 'okay ox');
  // November 7, 2026: a bare "Hey Ox" gets a hello back ("I say hey ox it says hey back within a second").
  await expect(page.locator('.ox-bubble')).toHaveText(/^(?:Hey\.|Yo\.|Talk to me\.|What’s up\?|Here\. Go\.)$/);
  await say(page, 'who is waiting on me');
  await expect(page.locator('.ox-bubble')).toContainText(answer);
  expect(asked).toEqual(['what is next', 'who is waiting on me']);
  // November 6, 2026: "yo ox, hi ox, OX, oxbot, anything like that not just hey ox".
  for (const [phrase, rest] of [['yo ox open notes', 'open notes'], ['hi ox what time is it', 'what time is it'], ['OXBOT pause', 'pause'], ['hello there ox, next song', 'next song'], ['ox what is next', 'what is next']]) {
    await page.getByRole('button', { name: 'Close' }).click();
    await say(page, phrase);
    await expect.poll(() => asked.at(-1), { message: phrase }).toBe(rest);
  }
  // "Oxford" isn't Ox.
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
  await expect(page.locator('.ox-bubble')).toContainText('This browser can’t listen. Voice works in Chrome and Safari.');
  await page.getByRole('button', { name: 'Close' }).click();

  await fakeSpeech(page, true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Needs you/ })).toBeVisible();
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(page.locator('.ox-bubble')).toContainText('the microphone is blocked for this page');
});
