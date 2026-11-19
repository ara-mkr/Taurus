import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Ox anywhere (owner, November 16, 2026; docs/21-ox-anywhere.md). The real desktop app on a throwaway OXBOT_HOME and
// port 8793, so the owner's ~/.oxbot and any OXBOT on 8787 are never touched. The wake word is simulated the way the
// web app reports it ("listening" to /api/voice/presence); the question is a timer, which needs no AI.
const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, '../../../qa-local/oxbot/ox-anywhere');
const main = join(here, '../dist/main.mjs');
const port = 8793;
const local = `http://127.0.0.1:${port}`;
let home: string, app: ElectronApplication, ox: Page;

const post = (path: string, body: unknown) => fetch(`${local}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-oxbot': '1' }, body: JSON.stringify(body) });
const state = () => app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().endsWith('ox-anywhere.html'));
  const service = (globalThis as unknown as { oxAnywhere: { shown: boolean; phase: string } }).oxAnywhere;
  return { visible: w?.isVisible() ?? false, onTop: w?.isAlwaysOnTop() ?? false, everySpace: w?.isVisibleOnAllWorkspaces() ?? false, focusable: w?.isFocusable() ?? true, bounds: w?.getBounds(), shown: service.shown, phase: service.phase };
});
const shot = async (name: string) => {
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().endsWith('ox-anywhere.html'))!;
    return (await w.webContents.capturePage()).toPNG().toString('base64');
  });
  writeFileSync(join(shots, `${name}.png`), Buffer.from(png, 'base64'));
};
const eye = () => ox.evaluate(() => document.querySelector<SVGElement>('.ox-eye-l')!.style.transform);

test.describe('Ox anywhere, in the desktop app', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });
  test.beforeAll(async () => {
    mkdirSync(shots, { recursive: true });
    home = mkdtempSync(join(tmpdir(), 'oxbot-anywhere-'));
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ ringMeetings: false, ringVip: false }));
    writeFileSync(join(home, 'prefs.json'), JSON.stringify({ tint: 'graphite', ambient: false, ox: true, todos: [], people: [], boards: [{ id: 'home', name: 'Home', widgets: [{ id: 'w1', type: 'brief', size: 'wide' }] }] }));
    const env = { ...process.env, OXBOT_HOME: home, OXBOT_PORT: String(port), OXBOT_BROKER_URL: '', OXBOT_DESKTOP_HIDDEN: '1', OXBOT_NOTCH_TEST: '1', OXBOT_ANYWHERE_TEST: '1', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', OPENROUTER_API_KEY: '' } as Record<string, string>;
    app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron') as unknown as string, args: [main], env });
    await expect.poll(async () => (await fetch(`${local}/api/health`).then(r => r.json(), () => ({})) as { app?: string }).app, { timeout: 30_000 }).toBe('oxbot');
    await expect.poll(() => app.windows().some(p => p.url().startsWith(`http://localhost:${port}`)), { timeout: 30_000 }).toBe(true);
  });
  test.afterAll(async () => {
    await Promise.race([app?.close(), new Promise(r => setTimeout(r, 20_000))]);
    try { app?.process().kill('SIGKILL'); } catch { /* already gone */ }
    rmSync(home, { recursive: true, force: true });
  });

  test('"Hey Ox" over another app: he charges in, looks where the mouse is, nods, answers, and leaves', async () => {
    expect((await state()).visible).toBe(false);
    // The wake word, as the web app reports it, while OXBOT's own window is hidden.
    const woke = Date.now();
    expect((await post('/api/voice/presence', { phase: 'listening' })).status).toBe(200);
    await expect.poll(async () => (await state()).visible, { timeout: 10_000 }).toBe(true);
    await expect.poll(() => app.windows().some(p => p.url().endsWith('ox-anywhere.html')), { timeout: 10_000 }).toBe(true);
    ox = app.windows().find(p => p.url().endsWith('ox-anywhere.html'))!;
    await expect(ox.locator('body')).toHaveAttribute('data-phase', 'listening');
    console.log(`    wake to Ox on screen: ${Date.now() - woke} ms`);
    const s = await state();
    // Above everything, on every Space, never takes focus; clicks fall through (setIgnoreMouseEvents in the service).
    expect(s).toMatchObject({ onTop: true, everySpace: true, focusable: false, shown: true });
    // He lands beside the mouse, then walks to the bottom right of the screen with the mouse (November 19, 2026);
    // under test the walk takes no time.
    const d = await app.evaluate(({ screen }) => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea);
    await expect.poll(async () => { const b = (await state()).bounds!; return [b.x + b.width, b.y + b.height]; }).toEqual([d.x + d.width - 20, d.y + d.height - 20]);
    await expect(ox.locator('#bubble')).toHaveText('Listening.');
    await ox.waitForTimeout(800);
    await shot('1-appear-listening');

    // Looking where you're looking: the mouse up and to the left of him moves his eyes up and left, then right.
    const look = (x: number, y: number) => app.evaluate(({ BrowserWindow }, p) => {
      BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('ox-anywhere.html'))!.webContents.send('ox-anywhere', { kind: 'look', ...p });
    }, { x, y });
    await look(-900, -500);
    await ox.waitForTimeout(700);
    const [lx, ly] = (await eye()).match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/)!.slice(1).map(Number);
    expect(lx).toBeLessThan(-10);
    expect(ly).toBeLessThan(-6);
    await shot('2-look-up-left');
    await look(430, 360);
    await ox.waitForTimeout(700);
    const [rx] = (await eye()).match(/translate\((-?[\d.]+)px/)!.slice(1).map(Number);
    expect(rx).toBeGreaterThan(5);

    // The question is accepted: a nod, then thinking, then the answer beside him.
    await ox.evaluate(() => {
      const svg = document.querySelector('svg.ox')!, seen: string[] = [];
      Object.assign(window, { gestures: seen });
      new MutationObserver(() => { const g = svg.getAttribute('data-gesture'); if (g) seen.push(g); }).observe(svg, { attributes: true, attributeFilter: ['data-gesture'] });
    });
    const asked = Date.now();
    const answer = post('/api/ask', { turns: [{ role: 'user', text: 'set a 2 minute tea timer' }], via: 'talk' });
    await expect.poll(() => ox.evaluate(() => (window as unknown as { gestures: string[] }).gestures), { timeout: 5_000, intervals: [20] }).toContain('nod');
    await ox.waitForTimeout(110);
    await shot('3-nod');
    expect((await answer).status).toBe(200);
    await expect(ox.locator('#bubble')).toContainText('2 minutes for tea');
    console.log(`    question to answer beside Ox: ${Date.now() - asked} ms`);
    await ox.waitForTimeout(700);
    await shot('4-answer');

    // Esc (here, the same call the Esc shortcut makes) sends him off the way he came, and the window goes.
    await app.evaluate(() => (globalThis as unknown as { oxAnywhere: { dismiss(): void } }).oxAnywhere.dismiss());
    await expect(ox.locator('body')).toHaveAttribute('data-state', 'out');
    await ox.waitForTimeout(150);
    await shot('5-dismiss');
    await expect.poll(async () => (await state()).visible, { timeout: 5_000 }).toBe(false);
  });

  test('he leaves by himself after an empty "Hey Ox", and a question without the microphone doesn\'t call him', async () => {
    await post('/api/voice/presence', { phase: 'listening' });
    await expect.poll(async () => (await state()).visible, { timeout: 10_000 }).toBe(true);
    await post('/api/voice/presence', { phase: 'idle' });
    await expect.poll(async () => (await state()).visible, { timeout: 5_000 }).toBe(false);
    // Typed into the notch: thinking and an answer, but the microphone never opened, so he stays away.
    await post('/api/ask', { turns: [{ role: 'user', text: 'set a 3 minute egg timer' }], via: 'talk' });
    await new Promise(r => setTimeout(r, 600));
    expect((await state()).visible).toBe(false);
  });

  test('with "Hey Ox" or the clap on, the desktop window keeps hearing in the background; only its own page can ask', async () => {
    // Driven by Playwright, a hidden window always reports itself visible, so this checks the switch itself; the
    // live run in docs/21-ox-anywhere.md checks document.visibilityState over plain CDP.
    const page = app.windows().find(p => p.url().startsWith(`http://localhost:${port}`))!;
    const throttled = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(x => x.webContents.getURL().startsWith('http://localhost'))!.webContents.getBackgroundThrottling());
    const keep = (on: boolean) => page.evaluate(v => (window as unknown as { oxbotDesktop: { keepHearing(on: boolean): void } }).oxbotDesktop.keepHearing(v), on);
    await keep(false);
    await expect.poll(throttled).toBe(true);
    await keep(true);
    await expect.poll(throttled).toBe(false);
    await keep(false);
    await expect.poll(throttled).toBe(true);
    // Which settings ask for it is tested in apps/web/tests/hearing.spec.ts, with a fake microphone.
    // The overlay's page reaches nothing but its listen-only bridge.
    expect(await ox.evaluate(p => fetch(`http://127.0.0.1:${p}/api/health`).then(() => 'reached', () => 'blocked'), port)).toBe('blocked');
    expect(await ox.evaluate(() => Object.keys((window as unknown as { oxAnywhere: object }).oxAnywhere))).toEqual(['on']);
  });
});
