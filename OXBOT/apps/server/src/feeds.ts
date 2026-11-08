import { note } from './activity.ts';
import type { Headline, MarketRange, NewsTopic, Quote } from './types.ts';

// Public, keyless, read-only feeds for the stock and news widgets. Nothing about the user is sent
// except the ticker or topic being looked up. Owner-approved October 31, 2026 (docs/decision-log.md).

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

const agent = { 'User-Agent': 'Mozilla/5.0 (Macintosh) OXBOT/0.2', Accept: '*/*' };
async function get(url: string) {
  const response = await fetch(url, { headers: agent, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
  return response.text();
}

export const cleanSymbol = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9.^=-]/g, '').slice(0, 15);
const intervals: Record<MarketRange, string> = { '1d': '5m', '5d': '30m', '1mo': '1d', '6mo': '1d', '1y': '1wk' };

export function quote(symbol: string, range: MarketRange = '1mo'): Promise<Quote> {
  const sym = cleanSymbol(symbol);
  return cached(`quote:${sym}:${range}`, range === '1d' ? 60_000 : 180_000, async () => {
    try {
      const text = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${intervals[range]}&includePrePost=false`);
      const result = JSON.parse(text)?.chart?.result?.[0];
      if (!result) throw new Error('No such symbol');
      const meta = result.meta ?? {};
      const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
      const points = (result.timestamp as number[] ?? []).map((t, i) => ({ t: t * 1000, v: closes[i] })).filter((p): p is { t: number; v: number } => typeof p.v === 'number');
      const price: number | undefined = meta.regularMarketPrice ?? points.at(-1)?.v;
      // Day change: against yesterday's close. Daily ranges carry it as the second-to-last point.
      const previous: number | undefined = range === '1d' ? meta.chartPreviousClose ?? meta.previousClose : points.length > 1 ? points.at(-2)!.v : meta.chartPreviousClose;
      const change = price !== undefined && previous ? price - previous : undefined;
      return { symbol: sym, name: meta.shortName ?? meta.longName, currency: meta.currency, price, change, changePct: change !== undefined && previous ? (change / previous) * 100 : undefined, points };
    } catch (error) {
      return { symbol: sym, points: [], error: error instanceof Error ? error.message : 'Unavailable' };
    }
  });
}

let lastWatch = 0;
export const quotes = (symbols: string[], range: MarketRange = '1mo') => {
  if (Date.now() - lastWatch > 10 * 60_000) { lastWatch = Date.now(); note('feed', `Watching markets: ${symbols.slice(0, 4).map(cleanSymbol).join(', ')}${symbols.length > 4 ? ` and ${symbols.length - 4} more` : ''}`); }
  return Promise.all(symbols.map(cleanSymbol).filter(Boolean).slice(0, 16).map(s => quote(s, range)));
};

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (text = '') => text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : entities[e] ?? m).trim();
const tag = (xml: string, name: string) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);

export function news(topic: string): Promise<NewsTopic> {
  const q = topic.trim().slice(0, 120);
  return cached(`news:${q.toLowerCase()}`, 15 * 60_000, async () => {
    try {
      const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
      const items: Headline[] = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12).map(([, item]) => {
        const source = tag(item, 'source') || undefined;
        let title = tag(item, 'title');
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -source.length - 3);
        const date = Date.parse(tag(item, 'pubDate'));
        return { title, url: tag(item, 'link'), source, at: Number.isNaN(date) ? undefined : new Date(date).toISOString() };
      }).filter(h => h.title && /^https?:\/\//.test(h.url));
      return { topic: q, items };
    } catch (error) {
      return { topic: q, items: [], error: error instanceof Error ? error.message : 'Unavailable' };
    }
  });
}
