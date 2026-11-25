import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// The AI page (Taurus, once Taurus Free, and the big labs), the phone tab bar in the home-screen app, and the new backgrounds.
// Every /api/ai answer is mocked: no real key, no OpenRouter.
const free = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA: Nemotron 3 Ultra', context: 1_000_000 },
  { id: 'openrouter/free', name: 'Free Models Router', context: 200_000 },
  { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B', context: 262_144 },
];
const providers = [
  ['openrouter', 'Taurus', 'OpenRouter', true], ['chatgpt-plan', 'ChatGPT plan', 'OpenAI'], ['claude', 'Claude', 'Anthropic'], ['chatgpt', 'ChatGPT', 'OpenAI'], ['gemini', 'Gemini', 'Google'],
  ['grok', 'Grok', 'xAI'], ['mistral', 'Mistral', 'Mistral AI'], ['deepseek', 'DeepSeek', 'DeepSeek'], ['ollama', 'Ollama', 'on this Mac'],
] as const;
const info = (signedIn: boolean, chosen = '') => ({
  using: signedIn ? { id: 'openrouter', name: 'Taurus', model: free[0].id } : null, chosen,
  providers: providers.map(([id, name, maker, isFree]) => ({ id, name, maker, note: '', keyUrl: 'https://example.com', free: Boolean(isFree), local: id === 'ollama', connected: signedIn && (id === 'openrouter' || id === 'mistral'),
    ...(id === 'chatgpt-plan' ? { plan: true, installed: true } : {}) })),
  free, freeModel: '',
});
const aiConnectors = providers.map(([id, name, maker]) => ({
  id, name: name === maker ? name : `${name} (${maker})`, group: 'AI', reads: 'Nothing. Writes your brief and answers questions with the facts on your dashboard, sent when you ask.', auth: id === 'chatgpt-plan' ? 'switch' : 'fields', mockOnly: false,
  connected: false, ready: false, missing: ['key'], oneClick: false, setup: 'Create a key, paste it here.', setupUrl: 'https://example.com',
  fields: id === 'chatgpt-plan' ? [{ key: 'CHATGPT_PLAN_ON', label: 'On', secret: false, appKey: false, set: false }, { key: 'CHATGPT_PLAN_MODEL', label: 'Model', secret: false, appKey: false, set: false }]
    : [{ key: `${id.toUpperCase()}_API_KEY`, label: `${maker} key`, secret: true, appKey: false, set: false }, { key: `${id.toUpperCase()}_MODEL`, label: 'Model', secret: false, appKey: false, set: false, placeholder: 'default' }],
}));

async function open(page: Page, signedIn: boolean) {
  await mock(page);
  let current = info(signedIn);
  const posts: unknown[] = [];
  await page.route('**/api/ai', r => {
    if (r.request().method() === 'POST') { const body = r.request().postDataJSON(); posts.push(body); current = { ...current, ...(body.provider !== undefined ? { chosen: body.provider } : {}), ...(body.freeModel ? { freeModel: body.freeModel } : {}) }; }
    return r.fulfill({ json: current });
  });
  await page.route('**/api/ai/plans*', r => r.fulfill({ json: { plans: [{ id: 'chatgpt-plan', installed: true, signedIn: false }] } }));
  await page.route('**/api/ai/plans/login', r => { posts.push({ login: r.request().postDataJSON().id }); return r.fulfill({ json: { ok: true } }); });
  await page.route('**/api/connectors/*/fields', r => { posts.push({ fields: r.request().url().split('/').at(-2), values: r.request().postDataJSON().values }); return r.fulfill({ json: { connectors: aiConnectors } }); });
  await page.route('**/api/connectors', r => r.fulfill({ json: { connectors: aiConnectors, redirectUri: '', home: '~/.taurus' } }));
  await page.goto('/#ai');
  await expect(page.getByRole('heading', { name: 'AI', exact: true })).toBeVisible();
  return posts;
}

// November 19, 2026: cards with each lab's logo on three tabs, Plans, API keys and Who answers; each card opens a sheet
// where you sign in or paste the key right there.
test('with nothing connected: tabs of logo cards, an OpenRouter key pasted right on its card, and ChatGPT signs in through the browser', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'light'));
  const posts = await open(page, false);
  await expect(page.getByText('Nothing connected yet')).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'AI' });
  for (const name of ['Plans', 'API keys', 'Who answers']) await expect(tabs.getByRole('tab', { name })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: 'Plans' })).toHaveAttribute('aria-selected', 'true');
  // ChatGPT's plan app is on this Mac but not signed in: one button opens OpenAI's own sign-in, no Terminal.
  const chatgpt = page.getByRole('tabpanel').getByRole('button', { name: /ChatGPT/ });
  await expect(chatgpt).toContainText('Not signed in');
  await chatgpt.click();
  await page.getByRole('dialog', { name: 'ChatGPT' }).getByRole('button', { name: 'Sign in with ChatGPT' }).click();
  await expect(page.getByRole('dialog', { name: 'ChatGPT' })).toContainText('Finish signing in with ChatGPT in your browser');
  await page.getByRole('dialog', { name: 'ChatGPT' }).getByRole('button', { name: 'Done' }).click();

  await tabs.getByRole('tab', { name: 'API keys' }).click();
  const grid = page.getByRole('tabpanel');
  for (const name of ['OpenRouter', 'Claude', 'ChatGPT', 'Gemini', 'Grok', 'Mistral', 'DeepSeek', 'Ollama']) await expect(grid.locator('.app-name', { hasText: new RegExp(`^${name}$`) })).toBeVisible();
  await expect(grid.locator('.app-logo')).toHaveCount(providers.length - 1);
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => v.id)).toEqual([]);
  const small = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()) && (el as HTMLElement).offsetParent && parseFloat(getComputedStyle(el).fontSize) < 13).map(el => el.textContent!.slice(0, 40)));
  expect(small).toEqual([]);
  await page.screenshot({ path: `${shots}/ai/ai-light-1440.png`, fullPage: true });

  await grid.getByRole('button', { name: /OpenRouter/ }).click();
  const sheet = page.getByRole('dialog', { name: 'OpenRouter' });
  await expect(sheet.getByRole('link', { name: 'Sign in with OpenRouter' })).toHaveAttribute('href', '/api/ai/openrouter/start');
  await expect(sheet.getByText(/may keep what you send/)).toBeVisible();
  await sheet.getByLabel('Or paste an OpenRouter key').fill('sk-or-v1-example');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => posts).toEqual([{ login: 'chatgpt-plan' }, { fields: 'openrouter', values: { OPENROUTER_API_KEY: 'sk-or-v1-example' } }]);
  await expect(page.getByRole('link', { name: 'AI', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('signed in: pick the free model on OpenRouter\'s card, and choose which AI writes under Who answers', async ({ page }) => {
  const posts = await open(page, true);
  await expect(page.locator('.ai-using')).toContainText('Taurus');
  await expect(page.getByRole('tab', { name: 'API keys' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tabpanel').getByRole('button', { name: /OpenRouter/ }).click();
  const sheet = page.getByRole('dialog', { name: 'OpenRouter' });
  const model = sheet.getByLabel('Model');
  // November 17, 2026: by default Taurus picks the fastest free model for each ask.
  await expect(model).toHaveValue('');
  await model.selectOption('google/gemma-4-31b-it:free');
  await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('tab', { name: 'Who answers' }).click();
  await page.getByRole('radio', { name: 'Mistral (Mistral AI)' }).check();
  await expect.poll(() => posts).toEqual([{ freeModel: 'google/gemma-4-31b-it:free' }, { provider: 'mistral' }]);
  await expect(page.getByRole('radio', { name: 'Mistral (Mistral AI)' })).toBeChecked();
});

test('phone home-screen app: the chat bar stays put while the page scrolls, and the tabs slide in from the left', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); localStorage.setItem('taurus-appearance', 'dark'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page);
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.dataset.shell)).toBe('app');
  const bar = page.getByRole('complementary', { name: 'Chat with Taurus' });
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

// November 23, 2026 (owner: "only add simple color options like black or white ... the pink and blue ... red crimson"):
// five colour sets replace the nine moving backgrounds, and the choice stays on this device.
test('UI V1 has five colours to choose from, and picking one changes the whole app', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('taurus-ui-version', 'v1');
    localStorage.setItem('taurus-appearance', 'light');
  });
  await mock(page);
  await page.goto('/#look');
  const colours = page.getByRole('group', { name: 'Colours' });
  await expect(colours.getByRole('radio')).toHaveCount(5);
  await expect(colours.locator('.palette strong')).toHaveText(['Slate', 'Black', 'White', 'Pink and blue', 'Crimson']);
  await expect(colours.getByRole('radio', { name: /^Slate/ })).toBeChecked();
  await colours.getByRole('radio', { name: /^Crimson/ }).check();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'crimson');
  await expect(page.locator('.rail-panel')).toHaveCSS('background-color', 'rgb(122, 22, 38)');
  expect(await page.evaluate(() => localStorage.getItem('taurus-palette'))).toBe('crimson');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'crimson');
  await page.getByRole('group', { name: 'Colours' }).screenshot({ path: `${shots}/look/colours.png` });
  await colours.getByRole('radio', { name: /^Slate/ }).check();
  await expect(page.locator('html')).not.toHaveAttribute('data-palette', /./);
});

test('with Twilio connected, Call me now places a test call and shows what happened', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('taurus-appearance', 'light'));
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
