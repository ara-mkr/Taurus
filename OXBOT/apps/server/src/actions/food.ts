import { isConnected, tokenFor } from '../connectors.ts';
import { dashboard } from '../dashboard.ts';
import { api, HttpError, store } from '../store.ts';
import { register } from './approvals.ts';

// "Order me some food" (owner, November 1, 2026): OXBOT picks one good option and asks once, with the item, the
// place and the total. No questionnaire. It learns from past delivery receipts in Gmail (read-only) and from orders
// you approved here. No delivery app offers an ordering API (Composio lists none of DoorDash, Uber Eats, Grubhub,
// Postmates or Instacart), so approving opens the order in the app and you tap Place order there.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
export interface Order { place: string; item?: string; total?: string; app: string; at: number }
const HOUR = 3_600_000;
const apps: [RegExp, string][] = [[/doordash/i, 'DoorDash'], [/uber/i, 'Uber Eats'], [/grubhub|seamless/i, 'Grubhub'], [/postmates/i, 'Postmates'], [/caviar/i, 'Caviar']];
export const orderLink = (app: string, place: string) => {
  const q = encodeURIComponent(place);
  return app === 'Uber Eats' || app === 'Postmates' ? `https://www.ubereats.com/search?q=${q}` : app === 'Grubhub' ? `https://www.grubhub.com/search?queryText=${q}` : `https://www.doordash.com/search/store/${q}/`;
};

// Receipt subjects as each app writes them: "Order Confirmation for Sam from Sweetgreen", "Your Uber Eats order with Sweetgreen".
export function parseReceipt(subject: string, from: string, snippet: string, at: number): Order | undefined {
  const app = apps.find(([pattern]) => pattern.test(from))?.[1];
  const place = subject.match(/(?:order (?:with|from)|confirmation for .+? from|receipt from)\s+(.+?)(?:\s*[-–|(]|$)/i)?.[1]?.trim();
  if (!app || !place || place.length > 60) return undefined;
  const total = snippet.match(/total[^$\d]{0,12}\$\s?([\d,]+\.\d{2})/i)?.[1];
  const item = snippet.match(/\b\d+\s?[x×]\s+([A-Z][\w'&\- ]{2,40}?)(?=\s+\$|\s{2}|,|\.|$)/)?.[1]?.trim();
  return { place, app, at, item, total: total ? `$${total}` : undefined };
}

async function fromGmail(): Promise<Order[]> {
  if (!isConnected('gmail')) return [];
  const token = await tokenFor('gmail');
  const q = 'from:(doordash.com OR uber.com OR grubhub.com OR postmates.com OR seamless.com OR trycaviar.com) newer_than:180d (subject:order OR subject:receipt)';
  const list = await api<any>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(q)}`, { token });
  const found = await Promise.all((list.messages ?? []).map((m: any) => api<any>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { token })));
  return found.flatMap((m: any) => {
    const h = Object.fromEntries((m.payload?.headers ?? []).map((x: any) => [x.name, x.value]));
    const order = parseReceipt(h.Subject ?? '', h.From ?? '', m.snippet ?? '', Number(m.internalDate));
    return order ? [order] : [];
  });
}

const remembered = () => store.doc<Order[]>('food.json', []);
const light = /bowl|salad|poke|soup|greens|grain|mediterranean|sweetgreen|cava|juice|sushi/i;

// One pick: the place you order from most at this time of day, not the one you had in the last 20 hours,
// and something light when recovery or sleep is low. Returns why in one short line.
export function choose(orders: Order[], now: Date, body: { recovery?: number; sleepMinutes?: number } = {}, hint = '') {
  const tired = (body.recovery !== undefined && body.recovery < 34) || (body.sleepMinutes !== undefined && body.sleepMinutes < 360);
  const wanted = hint.trim().toLowerCase();
  const byPlace = new Map<string, { last: Order; score: number; recent: boolean }>();
  for (const o of orders) {
    const hourGap = Math.abs(new Date(o.at).getHours() - now.getHours());
    const entry = byPlace.get(o.place.toLowerCase()) ?? { last: o, score: 0, recent: false };
    entry.score += 1 + (Math.min(hourGap, 24 - hourGap) <= 2 ? 1 : 0) + (tired && light.test(`${o.place} ${o.item ?? ''}`) ? 3 : 0) + (wanted && `${o.place} ${o.item ?? ''}`.toLowerCase().includes(wanted) ? 5 : 0);
    if (o.at > entry.last.at) entry.last = o;
    if (now.getTime() - o.at < 20 * HOUR) entry.recent = true;
    byPlace.set(o.place.toLowerCase(), entry);
  }
  const ranked = [...byPlace.values()].sort((a, b) => Number(a.recent) - Number(b.recent) || b.score - a.score || b.last.at - a.last.at);
  const pick = ranked[0];
  if (!pick) return undefined;
  const meal = now.getHours() < 11 ? 'breakfast' : now.getHours() < 16 ? 'lunch' : 'dinner';
  const why = [
    `Your usual ${meal}`,
    tired && light.test(`${pick.last.place} ${pick.last.item ?? ''}`) ? 'light because recovery is low' : '',
    ranked.length > 1 && ranked[1].recent && !pick.recent ? 'not what you had yesterday' : '',
  ].filter(Boolean).join(', ');
  return { order: pick.last, why: `${why}.` };
}

register({
  kind: 'food.order', app: 'Food',
  help: 'Find food to order. Picks one option itself from past orders, time of day and recovery; never ask the owner to choose first. Args: hint (optional: a place or dish the owner named), place and item (optional: only if the owner named them).',
  missing: () => undefined,
  async prepare(args) {
    const orders = [...remembered(), ...await fromGmail().catch(() => [])];
    const place = String(args.place ?? '').trim().slice(0, 60);
    if (!orders.length && !place) throw new HttpError(409, 'I don’t know what you like yet. Connect Gmail so I can see your delivery receipts, or tell me one place once and I’ll remember it.');
    const d = await dashboard();
    const picked = place ? { order: orders.find(o => o.place.toLowerCase() === place.toLowerCase()) ?? { place, app: 'DoorDash', at: Date.now() }, why: 'The place you named.' }
      : choose(orders, new Date(), d.sections.body.live ? d.body : {}, String(args.hint ?? ''));
    if (!picked) throw new HttpError(409, 'No past orders to go on.');
    const o = picked.order, item = String(args.item ?? '').trim().slice(0, 80) || o.item || 'Your last order there';
    return {
      title: `Order from ${o.place}`, to: o.place,
      purchase: { item, place: o.place, total: o.total ? `About ${o.total}` : `Shown in ${o.app}` },
      lines: [{ label: 'Why', value: picked.why }, { label: 'App', value: o.app }],
      caution: `No delivery app lets OXBOT place an order. Approving opens ${o.app} at ${o.place}, where you check the final total and tap Place order.`,
      open: orderLink(o.app, o.place),
      payload: { place: o.place, item, total: o.total, app: o.app },
    };
  },
  async run(p) {
    // Remembered so the next pick knows what you chose, even without Gmail.
    store.saveDoc('food.json', [...remembered().slice(-99), { place: p.place, item: p.item, total: p.total, app: p.app, at: Date.now() }]);
    return `Opening ${p.app} at ${p.place}. Tap Place order there.`;
  },
});
