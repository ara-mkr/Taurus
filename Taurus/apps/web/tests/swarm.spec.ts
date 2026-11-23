import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mock, shots } from './fixtures';

// The swarm (owner, November 5, 2026): "a bunch of different colored cursors go around and do things ... then they
// come back and nest into the center and disapear". A mocked swarm of twelve helpers on fictional example.com shops,
// fed through /api/swarm/stream in stages. Nothing reaches a real site.

const palette = ['#FF8A5B', '#5BC0FF', '#7BE08A', '#FFD25B', '#C79BFF', '#FF7EB6', '#4FE3D0', '#FFB35C', '#9DB4FF', '#E2F07A', '#FF9E9E', '#8FF0B4'];
const iso = () => new Date().toISOString();
const W = 800, H = 1000;
type Helper = Record<string, unknown> & { id: string; n: number };
const helper = (n: number, patch: Record<string, unknown> = {}): Helper => ({
  id: `h${n}`, n, name: `Scout ${n}`, colour: palette[n - 1], label: `Desk lamp on shop${n}.example.com`, doing: 'waiting for a page', state: 'waiting', moves: 0, at: iso(), ...patch,
});
const working = (n: number, moves = 1, patch: Record<string, unknown> = {}) => helper(n, {
  state: 'working', host: `shop${n}.example.com`, url: `https://shop${n}.example.com/search?q=desk+lamp`, title: `Desk lamps · Shop ${n}`,
  doing: `reading shop${n}.example.com`, act: 'read', point: { x: 160 + (n % 3) * 180, y: 220 + (n % 4) * 140 }, moves, ...patch,
});
const swarm = (state: string, helpers: Helper[], answer?: string) => ({ id: 'sw-1', job: 'Compare prices for a desk lamp', kind: 'prices', state, helpers, answer, startedAt: iso(), width: W, height: H, parallel: 6 });
const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
// A drawn page for each shop: a header, a title and a few product rows. Fictional.
const pageArt = (n: number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#F6F5F1"/><rect width="${W}" height="84" fill="#20232A"/><text x="32" y="54" font-family="Helvetica" font-size="30" fill="#fff">shop${n}.example.com</text><text x="32" y="150" font-family="Helvetica" font-size="40" fill="#20232A">Desk lamps</text>${[0, 1, 2, 3].map(r => `<rect x="32" y="${200 + r * 190}" width="160" height="150" rx="10" fill="#DAD7CE"/><rect x="220" y="${220 + r * 190}" width="420" height="22" rx="4" fill="#B9B6AD"/><text x="220" y="${300 + r * 190}" font-family="Helvetica" font-size="34" fill="#20232A">$${(30 + n * 3 + r * 7).toFixed(2)}</text>`).join('')}</svg>`)}`;

// The stream, one stage per connection: each stage is sent and closed, and EventSource comes back for the next.
function stream(page: Page) {
  const queue: string[] = [];
  let waiting: ((body: string) => void) | null = null;
  void page.route('**/api/swarm/stream', async route => {
    const body = queue.shift() ?? await new Promise<string>(resolve => { waiting = resolve; });
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `retry: 30\n${body}` }).catch(() => undefined);
  });
  return (body: string) => { if (waiting) { const w = waiting; waiting = null; w(body); } else queue.push(body); };
}

async function start(page: Page) {
  await mock(page);
  const send = stream(page);
  // On a board: on Home (the Deck) the bots sit in boxes around Taurus and the Swarm panel steps aside (deck.spec.ts).
  await page.goto('/#b/home');
  await expect(page.locator('[data-taurus-center], .taurus-buddy').first()).toBeVisible();
  await page.waitForTimeout(700);
  return send;
}
// Where Taurus is, as the overlay finds him.
const centre = (page: Page) => page.evaluate(() => {
  const r = (document.querySelector('[data-taurus-center]') ?? document.querySelector('.taurus-buddy .taurus-button') ?? document.querySelector('.taurus-buddy'))!.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const cursorAt = (page: Page, id: string) => page.locator(`.swarm-cursor[data-helper="${id}"]`).evaluate(el => ({ x: Number((el as HTMLElement).dataset.x), y: Number((el as HTMLElement).dataset.y), phase: (el as HTMLElement).dataset.phase, opacity: Number(getComputedStyle(el).opacity) }));
const tileBox = (page: Page, id: string) => page.locator(`[data-tile="${id}"] .swarm-page`).boundingBox();
const small = (page: Page, selector: string) => page.locator(selector).evaluate(root => [...root.querySelectorAll('*')]
  .filter(n => [...n.childNodes].some(c => c.nodeType === 3 && c.textContent!.trim()) && parseFloat(getComputedStyle(n).fontSize) < 13).map(n => n.textContent));

const twelve = () => Array.from({ length: 12 }, (_, i) => (i < 6 ? working(i + 1) : helper(i + 1)));
const frames = () => [1, 2, 3, 4, 5, 6].map(n => ev('frame', { id: `h${n}`, frame: pageArt(n) })).join('');

test('twelve helpers burst out of Taurus, work on their pages, then flock home together and fold into him one by one', async ({ page }) => {
  // The homecoming gathers, flies and files in, so this one takes longer than the default.
  test.setTimeout(60_000);
  const send = await start(page);
  const taurus = await centre(page);
  send(ev('swarm', swarm('running', twelve())) + frames());

  // The burst: twelve cursors, twelve colours, all leaving from Taurus.
  const panel = page.getByRole('region', { name: 'Swarm' });
  await expect(panel.getByRole('heading', { name: 'Swarm' })).toBeVisible();
  await expect(page.locator('.swarm-cursor')).toHaveCount(12);
  const colours = await page.locator('.swarm-cursor').evaluateAll(els => els.map(el => getComputedStyle(el).getPropertyValue('--c').trim()));
  expect(new Set(colours).size).toBe(12);
  await page.waitForTimeout(90);
  await page.screenshot({ path: `${shots}/swarm-1-burst-1440-dark.png` });
  // Every one of them set off from Taurus.
  const from = await page.locator('.swarm-cursor').evaluateAll(els => els.map(el => (el as HTMLElement).dataset.from!.split(',').map(Number)));
  for (const [x, y] of from) expect(Math.hypot(x - taurus.x, y - taurus.y)).toBeLessThan(12);

  // At work: the six with pages sit on their live page in the panel; the six waiting have left the screen.
  await expect(panel).toContainText('6 at work · 0 of 12 done');
  await expect(panel.locator('.swarm-tile img')).toHaveCount(6);
  await expect(panel.getByRole('list', { name: 'Helpers' }).getByRole('listitem')).toHaveCount(12);
  await page.waitForTimeout(1600);
  for (const n of [1, 3, 6]) {
    const c = await cursorAt(page, `h${n}`), box = (await tileBox(page, `h${n}`))!;
    expect(c.phase).toBe('work');
    expect(c.x).toBeGreaterThan(box.x - 6); expect(c.x).toBeLessThan(box.x + box.width + 6);
    expect(c.y).toBeGreaterThan(box.y - 6); expect(c.y).toBeLessThan(box.y + box.height + 6);
  }
  for (const n of [7, 10, 12]) {
    const c = await cursorAt(page, `h${n}`);
    expect(c.x < 0 || c.y < 0 || c.x > 1440 || c.y > 1000, `Scout ${n} left the screen`).toBe(true);
  }
  // Resting on its page a cursor shows its name; its tag reads in full on the way and when it clicks.
  const tag = page.locator('.swarm-cursor[data-helper="h3"] .swarm-tag');
  await expect(tag).toHaveText('Scout 3 · reading shop3.example.com');
  await expect(tag).toHaveCSS('opacity', '1');
  await expect(page.locator('.swarm-cursor[data-helper="h3"]')).toHaveAttribute('data-tag', 'name');

  // A click and a scroll show on the page where the server says they happened.
  send(ev('helper', working(2, 2, { act: 'click', point: { x: 420, y: 330 }, doing: 'clicking shop2.example.com' })) + ev('helper', working(4, 2, { act: 'scroll', point: { x: 400, y: 780 }, doing: 'scrolling shop4.example.com' })));
  await expect(page.locator('.swarm-cursor[data-helper="h2"] .swarm-click.ping')).toHaveCount(1);
  await expect(page.locator('.swarm-cursor[data-helper="h2"]')).toHaveAttribute('data-tag', 'full');
  await expect(page.locator('.swarm-cursor[data-helper="h2"] .swarm-tag')).toHaveText('Scout 2 · clicking shop2.example.com');
  // The scroll: h4's page pans down to where it is reading now.
  await expect(page.locator('[data-tile="h4"] img')).toHaveAttribute('style', /translateY\(-45(\.0+)?%\)/);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/swarm-2-work-1440-dark.png` });

  const axe = await new AxeBuilder({ page }).include('.swarm-panel').analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`)).toEqual([]);
  expect(await small(page, '.swarm-panel')).toEqual([]);
  expect(await small(page, '.swarm-layer')).toEqual([]);
  expect(await page.locator('.swarm-layer').getAttribute('aria-hidden')).toBe('true');

  // Some finish early and head home on their own, then the rest are done and Taurus merges.
  const done = (n: number) => helper(n, { state: 'done', host: `shop${n}.example.com`, doing: `found $${30 + n * 3}`, price: 30 + n * 3, finding: `$${30 + n * 3}: Example desk lamp`, moves: 9 });
  send(ev('swarm', swarm('running', [done(1), ...twelve().slice(1, 6), working(7), working(8), ...twelve().slice(8)])));
  // November 6, 2026 (owner: "they all gorup together before flying back to the main taurus circle and then they js hit the
  // center one after the other"): an early finisher roosts above Taurus, it doesn't dive in alone.
  await page.waitForTimeout(1200);
  const early = await cursorAt(page, 'h1');
  expect(early.phase).toBe('roost');
  expect(early.y).toBeLessThan(taurus.y - 120);
  const answer = 'Lowest for a desk lamp: $33 on shop1.example.com. Then $36 on shop2.example.com, $39 on shop3.example.com. These are the search pages’ top matches, so check it’s the same item before you buy.';
  // Note when each cursor reaches Taurus, so "one after another" is measured, not sampled.
  await page.evaluate(() => {
    const w = window as unknown as { arrivals: number[] };
    w.arrivals = [];
    new MutationObserver(list => { for (const m of list) if ((m.target as HTMLElement).dataset.phase === 'gone' && m.oldValue !== 'gone') w.arrivals.push(performance.now()); })
      .observe(document.querySelector('.swarm-layer')!, { subtree: true, attributes: true, attributeFilter: ['data-phase'], attributeOldValue: true });
  });
  send(ev('swarm', swarm('done', Array.from({ length: 12 }, (_, i) => done(i + 1)), answer)));
  await expect(panel).toContainText('Done · 12 helpers back');
  await expect(panel).toContainText('Lowest for a desk lamp: $33 on shop1.example.com.');
  const phases = () => page.locator('.swarm-cursor').evaluateAll(els => els.map(el => (el as HTMLElement).dataset.phase));
  const spots = () => page.locator('.swarm-cursor').evaluateAll(els => els.filter(el => (el as HTMLElement).dataset.phase !== 'gone').map(el => [Number((el as HTMLElement).dataset.x), Number((el as HTMLElement).dataset.y)]));
  // They gather, then fly in together: every one in the flock, close to the others.
  await expect.poll(async () => (await phases()).every(p => p === 'travel'), { timeout: 5000, intervals: [50] }).toBe(true);
  const flock = await spots();
  const spread = Math.max(...flock.flatMap(([x1, y1]) => flock.map(([x2, y2]) => Math.hypot(x1 - x2, y1 - y2))));
  expect(spread, 'the flock flies as one group').toBeLessThan(260);
  await page.screenshot({ path: `${shots}/swarm-3-return-1440-dark.png` });
  // Then all of them have folded into Taurus and the cursors are gone.
  await expect(page.locator('.swarm-cursor')).toHaveCount(0, { timeout: 8000 });
  // One after another: twelve arrivals, spread out in a queue rather than all at once.
  const arrivals = await page.evaluate(() => (window as unknown as { arrivals: number[] }).arrivals);
  expect(arrivals).toHaveLength(12);
  expect(arrivals.at(-1)! - arrivals[0], 'they file in over time').toBeGreaterThan(700);
  await page.screenshot({ path: `${shots}/swarm-4-home-1440-dark.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/swarm-4-home-1440-light.png` });
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
});

test('Stop all asks the server to call every helper back', async ({ page }) => {
  const send = await start(page);
  const posted: string[] = [];
  await page.route('**/api/swarm/stop', r => { posted.push(r.request().headers()['x-taurus']); return r.fulfill({ json: { swarm: swarm('running', twelve()) } }); });
  send(ev('swarm', swarm('running', twelve())) + frames());
  const panel = page.getByRole('region', { name: 'Swarm' });
  await panel.getByRole('button', { name: 'Stop all' }).click();
  await expect.poll(() => posted).toEqual(['1']);
  send(ev('swarm', swarm('stopped', twelve().map(h => ({ ...h, state: 'stopped', doing: 'stopped' })), '12 helpers went out for a desk lamp but couldn’t read anything useful. You stopped them early.')));
  await expect(panel).toContainText('Stopped · 12 of 12 back');
  await expect(page.locator('.swarm-cursor')).toHaveCount(0, { timeout: 6000 });
});

test('with Reduce Motion the cursors fade in on their pages and fade out where they are, without travelling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const send = await start(page);
  send(ev('swarm', swarm('running', twelve())) + frames());
  await expect(page.locator('.swarm-cursor')).toHaveCount(12);
  // Past the moment a moving swarm would still be bursting, the cursor is already exactly on its page.
  await page.waitForTimeout(700);
  const c = await cursorAt(page, 'h3'), box = (await tileBox(page, 'h3'))!;
  // Its tile is a window on the page, panned so the point it is reading (y 640 of 1000) sits in view.
  const p = working(3).point as { x: number; y: number }, panned = p.y / H - (11 / 16 / (H / W)) / 2;
  expect(Math.abs(c.x - (box.x + p.x / W * box.width))).toBeLessThan(1.5);
  expect(Math.abs(c.y - (box.y + (p.y / H - panned) * box.width * (H / W)))).toBeLessThan(1.5);
  // A waiting helper isn't drawn flying off: it is simply not shown.
  expect((await cursorAt(page, 'h9')).opacity).toBeLessThan(0.05);
  await page.screenshot({ path: `${shots}/swarm-reduced-1440-dark.png` });
  send(ev('swarm', swarm('done', twelve().map(h => ({ ...h, state: 'done' })), 'Done.')));
  await page.waitForTimeout(250);
  const fading = await cursorAt(page, 'h3');
  expect(Math.abs(fading.x - c.x)).toBeLessThan(2);
  expect(Math.abs(fading.y - c.y)).toBeLessThan(2);
  await expect(page.locator('.swarm-cursor')).toHaveCount(0, { timeout: 6000 });
});

test('on a phone the panel sits above the chat bar, full width, and nothing is under 13 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const send = await start(page);
  send(ev('swarm', swarm('running', twelve())) + frames());
  const panel = page.getByRole('region', { name: 'Swarm' });
  await expect(panel.locator('.swarm-tile img')).toHaveCount(6);
  await page.waitForTimeout(1500);
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeGreaterThan(350);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await small(page, '.swarm-panel')).toEqual([]);
  await page.screenshot({ path: `${shots}/swarm-390-dark.png` });
});
