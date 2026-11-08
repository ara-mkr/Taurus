import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Screenshots of the real app for the website (apps/site/shots), with fictional data and a fixed clock:
//   SITE_SHOTS=1 pnpm exec playwright test site-shots
//   cd ../site/shots && for f in *.jpg; do cwebp -quiet -q 80 "$f" -o "${f%.jpg}.webp"; done && rm *.jpg
//   for f in board-dark board-light ask tint-ember approve-reply; do cwebp -quiet -q 80 -resize 1600 0 $f.webp -o $f-1600.webp; done
//   cwebp -quiet -q 82 -crop 1180 640 1700 1380 board-food.webp -o food-card.webp && rm board-food.webp
// ring.jpg isn't used by the site; it's there to check the desktop ring screen by eye.
// Every /api request is answered here, so nothing from a real OXBOT home can reach a picture.
test.skip(!process.env.SITE_SHOTS, 'SITE_SHOTS=1 only');
test.use({ timezoneId: 'America/New_York', deviceScaleFactor: 2 });

const out = '../site/shots';
const now = new Date('2026-11-03T09:48:00-05:00');
// Rings go off 10 minutes before the 10:00 call.
const ringTime = new Date('2026-11-03T09:50:00-05:00');
const iso = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
const at = (hhmm: string) => new Date(`2026-11-03T${hhmm}:00-05:00`).toISOString();
const section = (sources: string[]) => ({ live: true, sources, errors: [] as string[] });

const dashboard = {
  generatedAt: iso(-1), briefBy: 'Claude',
  brief: 'Dana needs your call on the board seat before Northgate at 10:00. Recovery 64%.',
  needs: [
    { id: 'n1', title: 'Term sheet redlines: board seat clause needs your call', who: 'Dana Whitfield', from: 'dana@example.com', detail: 'They accepted the valuation. Open item is the independent seat.', source: 'Gmail', at: iso(-38), vip: true, url: 'https://mail.example.com/1' },
    { id: 'n2', title: 'Can you approve the Q4 hiring plan before 3?', who: 'Priya Raman', detail: '#leadership', source: 'Slack', at: iso(-52) },
    { id: 'n3', title: 'Checkout fails on Safari for saved cards', who: 'Marcus Lee', detail: 'Urgent, assigned to you', source: 'Linear', at: iso(-71) },
  ],
  schedule: [
    { id: 'e1', title: 'Leadership sync', start: at('08:30'), end: at('09:00'), source: 'Google Calendar' },
    { id: 'e2', title: 'Investor call: Northgate Capital', start: at('10:00'), end: at('10:45'), joinUrl: 'https://meet.example.com/x', source: 'Google Calendar' },
    { id: 'e3', title: 'Board prep', start: at('13:00'), end: at('14:00'), location: 'Room 4', source: 'Outlook' },
    { id: 'e4', title: '1:1 with Priya', start: at('15:30'), end: at('16:00'), source: 'Google Calendar' },
  ],
  inbox: [{ source: 'Gmail', unread: 23, label: 'unread' }, { source: 'Slack', unread: 6, label: 'mentions today' }],
  body: { recovery: 64, hrv: 58, restingHr: 52, sleepMinutes: 412, sleepScore: 81, lastWorkout: { name: 'Run', km: 8.2, minutes: 41, at: iso(-900) }, weekKm: 31.4, sources: ['WHOOP', 'Strava'] },
  numbers: [{ label: 'Revenue, 30 days', value: '$184,200', change: '+6.2%', source: 'Stripe' }, { label: 'Runway', value: '21 months', source: 'Google Sheets' }],
  sections: { needs: section(['Gmail', 'Slack', 'Linear']), schedule: section(['Google Calendar', 'Outlook']), inbox: section(['Gmail', 'Slack']), body: section(['WHOOP', 'Strava']), numbers: section(['Stripe', 'Google Sheets']) },
};
const day = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };
const history = { sample: false, days: Array.from({ length: 30 }, (_, i) => ({ date: day(i - 29), recovery: Math.round(66 + Math.sin(i / 2.3) * 14 + Math.cos(i / 5) * 6), hrv: 52 + Math.round(Math.sin(i / 3) * 8), sleepMinutes: 400 + Math.round(Math.cos(i / 4) * 40) })) };
const prefs = (ox = false, tint = 'graphite') => ({ tint, ambient: true, ox, people: [{ id: 'p1', name: 'Sam Okafor', everyDays: 14 }], todos: [{ id: 't1', text: 'Send board deck to Dana', done: false, at: iso(-60) }, { id: 't2', text: 'Book flights for the offsite', done: false, at: iso(-30) }], boards: [
  { id: 'home', name: 'Home', widgets: [
    { id: 'w1', type: 'brief', size: 'wide' }, { id: 'w2', type: 'focus', size: 'medium' }, { id: 'w3', type: 'needs', size: 'tall' }, { id: 'w4', type: 'schedule', size: 'tall' },
    { id: 'w5', type: 'health', size: 'tall' }, { id: 'w6', type: 'numbers', size: 'medium' }, { id: 'w7', type: 'people', size: 'medium' }, { id: 'w8', type: 'trend', size: 'medium', config: { metric: 'recovery', days: 30 } },
  ] },
  { id: 'work', name: 'Work', widgets: [{ id: 'k1', type: 'needs', size: 'tall' }] },
] });
const ring = { id: '6f1c1d2e-0000-4000-8000-000000000001', title: 'Investor call: Northgate Capital', detail: 'Starts in 10 minutes.', reason: 'meeting', at: iso(0), state: 'ringing', channels: ['2 open screens'], url: 'https://meet.example.com/x' };
const later = (minutes: number) => iso(minutes);
const reply = {
  id: '0b6f3c1e-1111-4000-8000-000000000001', kind: 'email.reply', app: 'Email', title: 'Reply to dana@example.com', to: 'dana@example.com',
  text: 'Thursday at 10 works. I’ll bring the revised board-seat language.', lines: [{ label: 'Subject', value: 'Re: Term sheet redlines' }, { label: 'From', value: 'Gmail, in the same thread' }],
  editable: true, from: 'ask', createdAt: iso(-1), expiresAt: later(14), state: 'pending', digest: 'digest-reply',
};
const food = {
  id: '0b6f3c1e-2222-4000-8000-000000000002', kind: 'food.order', app: 'Food', title: 'Order from Larkspur Kitchen', to: 'Larkspur Kitchen',
  lines: [{ label: 'Why', value: 'Your usual lunch, light because recovery is 64%.' }, { label: 'App', value: 'DoorDash' }],
  purchase: { item: 'Harvest Bowl', place: 'Larkspur Kitchen', total: 'About $18.45' },
  caution: 'No delivery app lets OXBOT place an order. Approving opens DoorDash at Larkspur Kitchen, where you check the final total and tap Place order.',
  open: 'https://www.doordash.com/', editable: false, from: 'talk', createdAt: iso(-1), expiresAt: later(9), state: 'pending', digest: 'digest-food',
};
const answer = 'Two things before 10:00. Dana’s board seat clause is the only open item on the term sheet, and Priya needs the Q4 hiring plan approved by 3. Recovery is 64%, so keep the run for tomorrow.';

async function setup(page: Page, opts: { light?: boolean; ox?: boolean; tint?: string; ringing?: boolean; waiting?: unknown[] } = {}) {
  const waiting = opts.waiting ?? [];
  await page.clock.setFixedTime(now);
  await page.addInitScript(light => { try { localStorage.setItem('oxbot-appearance', light ? 'light' : 'dark'); } catch { /* blocked */ } }, Boolean(opts.light));
  // Registered first so it is matched last: anything not answered below gets a 404, never the real server.
  await page.route('**/api/**', r => r.fulfill({ status: 404, json: { error: 'not in the screenshot set' } }));
  await page.route('**/api/dashboard*', r => r.fulfill({ json: dashboard }));
  await page.route('**/api/prefs', r => r.fulfill({ json: r.request().method() === 'POST' ? r.request().postDataJSON() : prefs(opts.ox, opts.tint) }));
  await page.route('**/api/history', r => r.fulfill({ json: history }));
  await page.route('**/api/approvals', r => r.fulfill({ json: { pending: waiting } }));
  await page.route('**/api/ask', r => r.fulfill({ json: { provider: 'Claude', text: answer } }));
  await page.route('**/api/ring/stream', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: (opts.ringing ? `event: ring\ndata: ${JSON.stringify(ring)}\n\n` : ': idle\n\n') + waiting.map(p => `event: approval\ndata: ${JSON.stringify(p)}\n\n`).join('') }));
}
const jpeg = (page: Page, name: string) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 86 });

test.beforeAll(() => mkdirSync(out, { recursive: true }));

test('board, dark and light, desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1010 });
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(dashboard.brief);
  await page.waitForTimeout(1500);
  await jpeg(page, 'board-dark');
  await setup(page, { light: true });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(dashboard.brief);
  await page.waitForTimeout(1500);
  await jpeg(page, 'board-light');
});

test('board in the Ember tint', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1010 });
  for (const tint of ['ember']) {
    await setup(page, { tint });
    await page.goto(`/?${tint}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(dashboard.brief);
    await page.waitForTimeout(1500);
    await jpeg(page, `tint-${tint}`);
  }
});

test('ask', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, { ox: true });
  await page.goto('/#ask');
  await page.getByRole('textbox').fill('What do I need to do before the investor call?');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Two things before 10:00.')).toBeVisible();
  await page.waitForTimeout(1200);
  await jpeg(page, 'ask');
});

test('an email reply waiting for approval, in Ask', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.route('**/api/ask', r => r.fulfill({ json: { provider: 'Claude', text: 'Drafted. It goes to Dana in the same thread once you approve.', proposals: [reply] } }));
  await page.goto('/#ask');
  await page.getByLabel('Message').fill('Tell Dana Thursday at 10 works');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Reply to dana@example.com' })).toBeVisible();
  await page.waitForTimeout(1000);
  await jpeg(page, 'approve-reply');
});

test('lunch picked, waiting for one tap, desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1010 });
  await setup(page, { waiting: [food] });
  await page.goto('/');
  await expect(page.getByRole('complementary', { name: 'Waiting for your OK' }).getByText('Harvest Bowl')).toBeVisible();
  await page.waitForTimeout(1500);
  await jpeg(page, 'board-food');
});

test('ringing, desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, { ringing: true });
  await page.clock.setFixedTime(ringTime);
  await page.goto('/#ring');
  await expect(page.getByRole('alertdialog').getByRole('heading', { name: ring.title })).toBeVisible();
  await page.waitForTimeout(800);
  await jpeg(page, 'ring');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test('board and ringing on a phone', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(dashboard.brief);
    await page.waitForTimeout(1500);
    await jpeg(page, 'phone-board');
    await setup(page, { ringing: true });
    await page.clock.setFixedTime(ringTime);
    await page.goto('/#ring');
    await expect(page.getByRole('alertdialog').getByRole('heading', { name: ring.title })).toBeVisible();
    await page.waitForTimeout(800);
    await jpeg(page, 'phone-ring');
  });

});
