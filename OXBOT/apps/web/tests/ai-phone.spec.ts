import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// The AI page (OXBOT, once OXBOT Free, and the big labs), the phone tab bar in the home-screen app, and the new backgrounds.
// Every /api/ai answer is mocked: no real key, no OpenRouter.
const free = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA: Nemotron 3 Ultra', context: 1_000_000 },
  { id: 'openrouter/free', name: 'Free Models Router', context: 200_000 },
  { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B', context: 262_144 },
];
const providers = [
  ['openrouter', 'OXBOT', 'OpenRouter', true], ['claude', 'Claude', 'Anthropic'], ['chatgpt', 'ChatGPT', 'OpenAI'], ['gemini', 'Gemini', 'Google'],
  ['grok', 'Grok', 'xAI'], ['mistral', 'Mistral', 'Mistral AI'], ['deepseek', 'DeepSeek', 'DeepSeek'], ['ollama', 'Ollama', 'on this Mac'],
] as const;
const info = (signedIn: boolean, chosen = '') => ({
  using: signedIn ? { id: 'openrouter', name: 'OXBOT', model: free[0].id } : null, chosen,
  providers: providers.map(([id, name, maker, isFree]) => ({ id, name, maker, note: '', keyUrl: 'https://example.com', free: Boolean(isFree), local: id === 'ollama', connected: signedIn && (id === 'openrouter' || id === 'mistral') })),
  free, freeModel: '',
});
const aiConnectors = providers.filter(([id]) => id !== 'openrouter').map(([id, name, maker]) => ({
  id, name: name === maker ? name : `${name} (${maker})`, group: 'AI', reads: 'Nothing. Writes your brief and answers questions with the facts on your dashboard, sent when you ask.', auth: 'fields', mockOnly: false,
  connected: false, ready: false, missing: ['key'], oneClick: false, setup: 'Create a key, paste it here.', setupUrl: 'https://example.com',
  fields: [{ key: `${id.toUpperCase()}_API_KEY`, label: `${maker} key`, secret: true, appKey: false, set: false }, { key: `${id.toUpperCase()}_MODEL`, label: 'Model', secret: false, appKey: false, set: false, placeholder: 'default' }],
}));

async function open(page: Page, signedIn: boolean) {
  await mock(page);
  let current = info(signedIn);
  const posts: unknown[] = [];
  await page.route('**/api/ai', r => {
    if (r.request().method() === 'POST') { const body = r.request().postDataJSON(); posts.push(body); current = { ...current, ...(body.provider !== undefined ? { chosen: body.provider } : {}), ...(body.freeModel ? { freeModel: body.freeModel } : {}) }; }
    return r.fulfill({ json: current });
  });
  await page.route('**/api/connectors', r => r.fulfill({ json: { connectors: aiConnectors, redirectUri: '', home: '~/.oxbot' } }));
  await page.goto('/#ai');
  await expect(page.getByRole('heading', { name: 'AI', exact: true })).toBeVisible();
  return posts;
}

test('with nothing connected, OXBOT offers one-click sign-in and says what free models may keep', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oxbot-appearance', 'light'));
  await open(page, false);
  await expect(page.getByText('No AI is connected')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with OpenRouter' })).toHaveAttribute('href', '/api/ai/openrouter/start');
  await expect(page.getByText(/may keep what you send/)).toBeVisible();
  for (const name of ['Claude (Anthropic)', 'ChatGPT (OpenAI)', 'Gemini (Google)', 'Grok (xAI)', 'Mistral (Mistral AI)', 'DeepSeek', 'Ollama (on this Mac)']) await expect(page.locator('.connector-name', { hasText: name })).toBeVisible();
  await expect(page.getByRole('link', { name: 'AI', exact: true })).toHaveAttribute('aria-current', 'page');
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
  const small = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()) && (el as HTMLElement).offsetParent && parseFloat(getComputedStyle(el).fontSize) < 13).map(el => el.textContent!.slice(0, 40)));
  expect(small).toEqual([]);
  await page.screenshot({ path: `${shots}/ai/ai-light-1440.png`, fullPage: true });
});

test('signed in: pick the free model, and choose which connected AI writes', async ({ page }) => {
  const posts = await open(page, true);
  await expect(page.getByText(/Writing with/)).toContainText('OXBOT');
  const model = page.getByLabel('Free model');
  // November 17, 2026: by default OXBOT picks the fastest free model for each ask.
  await expect(model).toHaveValue('');
  await model.selectOption('google/gemma-4-31b-it:free');
  await page.getByRole('radio', { name: 'Mistral (Mistral AI)' }).check();
  await expect.poll(() => posts).toEqual([{ freeModel: 'google/gemma-4-31b-it:free' }, { provider: 'mistral' }]);
  await expect(page.getByRole('radio', { name: 'Mistral (Mistral AI)' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('phone home-screen app: the chat bar stays put while the page scrolls, and the tabs slide in from the left', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); localStorage.setItem('oxbot-appearance', 'dark'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.dataset.shell)).toBe('app');
  const bar = page.getByRole('complementary', { name: 'Chat with Ox' });
  await expect(bar).toBeVisible();
  const before = await bar.boundingBox();
  expect(before!.y + before!.height).toBeGreaterThan(780);
  const scrolled = await page.evaluate(async () => {
    const root = document.getElementById('root')!;
    root.scrollTo(0, 900);
    await new Promise(r => setTimeout(r, 300));
    return { root: root.scrollTop, page: window.scrollY };
  });
  expect(scrolled.root).toBeGreaterThan(400);
  expect(scrolled.page).toBe(0);
  expect(await bar.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${shots}/phone/chatbar-scrolled.png` });
  // The tabs live in a drawer: closed until you tap the mark, then on screen, then gone again with Escape.
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await expect(tabs).toBeHidden();
  await page.getByRole('button', { name: 'Tabs' }).click();
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('link').nth(1)).toBeInViewport();
  await page.screenshot({ path: `${shots}/phone/tabs-drawer.png` });
  await page.keyboard.press('Escape');
  await expect(tabs).toBeHidden();
});

test('nine backgrounds to choose from, and picking one changes the page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oxbot-appearance', 'dark'));
  await mock(page);
  await page.goto('/#look');
  await expect(page.getByRole('radio', { name: 'Moving light' })).toBeChecked();
  const options = page.locator('.tint-option');
  await expect(options).toHaveCount(9);
  await expect(options).toHaveText(['Graphite', 'Ember', 'Ocean', 'Moss', 'Dusk', 'Aurora', 'Sunset', 'Rose', 'Midnight']);
  await page.getByRole('radio', { name: 'Sunset' }).check();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tint)).toBe('sunset');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--glow-a').trim())).toBe('#B4502A');
  await page.locator('.tints').screenshot({ path: `${shots}/look/backgrounds.png` });
});

test('with Twilio connected, Call me now places a test call and shows what happened', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('oxbot-appearance', 'light'));
  await mock(page);
  let lastCall: { at: string; ok: boolean; message: string } | null = null;
  let answers = [{ status: 409, json: { error: 'A Twilio trial account can only call numbers you’ve verified.' } }, { status: 200, json: { at: new Date().toISOString(), ok: true, message: 'Called +•••••••4321.' } }];
  await page.route('**/api/phone', r => r.fulfill({ json: { settings: { leadMinutes: 10, escalateAfterSeconds: 60, vipSenders: [], quietStart: '22:30', quietEnd: '06:30', ringMeetings: true, ringVip: true }, channels: { screens: 1, ntfy: false, call: true, lastCall }, ai: null, bound: '127.0.0.1', pairing: [], lanReady: false } }));
  await page.route('**/api/ring/test-call', r => {
    const [next, ...rest] = answers; answers = rest;
    lastCall = next.status === 200 ? next.json as typeof lastCall : { at: new Date().toISOString(), ok: false, message: (next.json as { error: string }).error };
    return r.fulfill({ status: next.status, json: next.json });
  });
  await page.goto('/#phone');
  await expect(page.getByText('Twilio is connected.')).toBeVisible();
  await page.getByRole('button', { name: 'Call me now' }).click();
  await expect(page.getByRole('status')).toContainText('trial account can only call numbers you’ve verified');
  await expect(page.locator('.call-last')).toContainText('Last call');
  await page.getByRole('button', { name: 'Call me now' }).click();
  await expect(page.getByRole('status')).toContainText('Called +•••••••4321. Your phone should ring in a few seconds.');
  await expect(page.locator('.call-last')).not.toHaveClass(/problem/);
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
  await page.locator('.ladder').screenshot({ path: `${shots}/phone/call-me-now.png` });
});
