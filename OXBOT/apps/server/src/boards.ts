import { createHash, randomUUID } from 'node:crypto';
import { aiProvider, askAI, context, dashboard } from './dashboard.ts';
import { cleanSymbol, quotes } from './feeds.ts';
import { history } from './history.ts';
import { store } from './store.ts';
import type { AiCard, Background, Board, MarketRange, PanelSize, Person, Prefs, Profile, Hud, HudPanel, Tint, Todo, TrendMetric, Widget, WidgetConfig, WidgetSize, WidgetType } from './types.ts';

const FILE = 'prefs.json';
const id = () => randomUUID().slice(0, 8);

export const widgetTypes: Record<WidgetType, string> = {
  brief: 'The one-line summary of the day with the Ask box.',
  focus: 'Right now: the next meeting with a countdown, the top thing waiting on you, and your first open to-do.',
  clock: 'Local time and date, plus world clocks. config.zones: ["London=Europe/London", ...].',
  needs: 'Messages, reviews and issues waiting on you, VIPs first.',
  todo: 'Your own to-do list. You add and tick items.',
  schedule: 'Today on a timeline with a now line, then tomorrow.',
  people: 'People to talk to: who is waiting on you, who you meet today, and people you keep in touch with.',
  health: 'Recovery ring, sleep, HRV, resting heart rate, strain and the last workout.',
  trend: 'Line chart of one body metric over time. config.metric: recovery | readiness | sleepMinutes | sleepScore | hrv | restingHr | strain | weekKm. config.days: 7-90.',
  inbox: 'Unread counts per mail and chat account as bars.',
  numbers: 'Company numbers from Stripe, Sheets, HubSpot, Airtable, Shopify, Xero, Mercury and Google Analytics with sparklines.',
  stocks: 'Watchlist with price, day change and a sparkline. config.symbols: ["AAPL", "^GSPC", "BTC-USD"].',
  chart: 'One large price chart. config.symbol and config.range: 1d | 5d | 1mo | 6mo | 1y.',
  news: 'Headlines for tracked companies, people or topics (the owner can track themself). config.topics: ["OpenAI", "Jane Doe"].',
  note: 'A free-text note. config.text.',
  ai: 'A custom card the AI fills from the live data, drawn exactly the way a prompt asks. config.prompt.',
  updates: 'From your apps: recently changed files (Drive, Dropbox, Box, OneDrive, Obsidian), music, RSS posts, Hacker News and today’s weather. Empty until one is connected.',
};
const sizes: WidgetSize[] = ['small', 'medium', 'tall', 'large', 'wide', 'banner', 'full'];
const ranges: MarketRange[] = ['1d', '5d', '1mo', '6mo', '1y'];
const metrics: TrendMetric[] = ['recovery', 'readiness', 'sleepMinutes', 'sleepScore', 'hrv', 'restingHr', 'strain', 'weekKm'];
const tints: Tint[] = ['graphite', 'ember', 'ocean', 'moss', 'dusk', 'aurora', 'sunset', 'rose', 'midnight'];

const w = (type: WidgetType, size: WidgetSize, config?: WidgetConfig, title?: string): Widget => ({ id: id(), type, size, ...(title ? { title } : {}), ...(config ? { config } : {}) });

// Hud out of the box: what needs you and your list on the left, your body, your day and the house on the right.
export const hudDefaults = (): Hud => ({
  panels: [
    { id: 't-needs', type: 'needs', size: 'medium', side: 'left', title: 'Priority' },
    { id: 't-todo', type: 'todo', size: 'medium', side: 'left' },
    { id: 't-health', type: 'health', size: 'medium', side: 'right' },
    { id: 't-schedule', type: 'schedule', size: 'medium', side: 'right', title: 'Up next' },
    { id: 't-house', type: 'house', size: 'small', side: 'right' },
  ],
  clouds: 'calm', taurusSize: 'medium', chips: true, facts: true, start: 'hud',
});
const panelSizes: PanelSize[] = ['small', 'medium', 'large'];
function hud(raw: Partial<Hud> | undefined): Hud {
  const base = hudDefaults();
  if (!raw || typeof raw !== 'object') return base;
  const panels = Array.isArray(raw.panels) ? raw.panels.flatMap((p): HudPanel[] => {
    if (!p || (p.type !== 'house' && !(p.type in widgetTypes))) return [];
    const title = text(p.title, 60)?.trim();
    const conf = config(p.config);
    return [{ id: text(p.id, 24) || id(), type: p.type, size: panelSizes.includes(p.size) ? p.size : 'medium', side: p.side === 'right' ? 'right' : 'left', ...(title ? { title } : {}), ...(conf ? { config: conf } : {}) }];
  }).slice(0, 16) : base.panels;
  return {
    panels, clouds: (['calm', 'lively', 'off'] as const).find(c => c === raw.clouds) ?? base.clouds, taurusSize: panelSizes.includes(raw.taurusSize!) ? raw.taurusSize! : base.taurusSize,
    chips: typeof raw.chips === 'boolean' ? raw.chips : base.chips, facts: typeof raw.facts === 'boolean' ? raw.facts : base.facts, start: raw.start === 'board' ? 'board' : 'hud',
  };
}

export function defaults(): Prefs {
  return {
    hud: hudDefaults(),
    tint: 'graphite', ambient: true, taurus: true, todos: [], people: [],
    profile: { name: '', tone: 'witty', greet: true, large: false },
    background: { kind: 'field', color: '#14161B', dim: 0, blur: 0, daylight: true },
    boards: [
      { id: 'home', name: 'Home', widgets: [
        w('brief', 'wide'), w('focus', 'medium'),
        w('needs', 'tall'), w('schedule', 'tall'), w('health', 'tall'),
        w('clock', 'medium'), w('todo', 'medium'), w('people', 'medium'),
        w('stocks', 'large', { symbols: ['^GSPC', '^IXIC', 'AAPL', 'NVDA', 'BTC-USD'] }), w('news', 'large', { topics: ['Artificial intelligence', 'Startups'] }),
        w('numbers', 'wide'), w('inbox', 'medium'),
      ] },
      { id: 'health', name: 'Health', widgets: [
        w('health', 'large'), w('trend', 'large', { metric: 'recovery', days: 30 }),
        w('trend', 'medium', { metric: 'sleepMinutes', days: 30 }), w('trend', 'medium', { metric: 'hrv', days: 30 }), w('trend', 'medium', { metric: 'restingHr', days: 30 }),
        w('trend', 'wide', { metric: 'weekKm', days: 45 }), w('note', 'medium', { text: 'Bed by 11. Zone 2 three times a week.' }, 'Plan'),
      ] },
      { id: 'markets', name: 'Markets', widgets: [
        w('chart', 'wide', { symbol: '^GSPC', range: '6mo' }), w('stocks', 'tall', { symbols: ['^GSPC', '^IXIC', '^DJI', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'BTC-USD'] }),
        w('chart', 'medium', { symbol: 'NVDA', range: '1mo' }), w('chart', 'medium', { symbol: 'AAPL', range: '1mo' }),
        w('news', 'wide', { topics: ['Stock market', 'Federal Reserve'] }),
      ] },
    ],
  };
}

const text = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : undefined;
const list = (v: unknown, max: number, each: number) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, max).map(x => x.trim().slice(0, each)) : undefined;
const iso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : undefined;

function config(raw: unknown): WidgetConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const out: WidgetConfig = {
    symbols: list(c.symbols, 16, 15)?.map(cleanSymbol).filter(Boolean),
    symbol: typeof c.symbol === 'string' ? cleanSymbol(c.symbol) || undefined : undefined,
    range: ranges.includes(c.range as MarketRange) ? c.range as MarketRange : undefined,
    topics: list(c.topics, 8, 120),
    zones: list(c.zones, 8, 80),
    metric: metrics.includes(c.metric as TrendMetric) ? c.metric as TrendMetric : undefined,
    days: typeof c.days === 'number' ? Math.max(7, Math.min(365, Math.round(c.days))) : undefined,
    text: text(c.text, 4000),
    prompt: text(c.prompt, 600),
  };
  const kept = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length ? kept : undefined;
}

function widget(raw: unknown): Widget | undefined {
  const x = raw as Partial<Widget> | undefined;
  if (!x || !x.type || !(x.type in widgetTypes)) return undefined;
  return { id: text(x.id, 24) || id(), type: x.type, size: sizes.includes(x.size!) ? x.size! : 'medium', ...(text(x.title, 60)?.trim() ? { title: text(x.title, 60)!.trim() } : {}), ...(config(x.config) ? { config: config(x.config) } : {}) };
}

export function board(raw: unknown): Board | undefined {
  const b = raw as Partial<Board> | undefined;
  if (!b || typeof b !== 'object') return undefined;
  return { id: text(b.id, 24) || id(), name: text(b.name, 40)?.trim() || 'Board', widgets: (Array.isArray(b.widgets) ? b.widgets : []).map(widget).filter((x): x is Widget => Boolean(x)).slice(0, 40) };
}

export function sanitize(raw: Partial<Prefs>): Prefs {
  const base = defaults();
  const boards = (Array.isArray(raw.boards) ? raw.boards : base.boards).map(board).filter((x): x is Board => Boolean(x)).slice(0, 12);
  const todos: Todo[] = (Array.isArray(raw.todos) ? raw.todos : []).filter(t => t && typeof t.text === 'string' && t.text.trim()).slice(0, 200)
    .map(t => ({ id: text(t.id, 24) || id(), text: t.text.trim().slice(0, 300), done: Boolean(t.done), at: iso(t.at) ?? new Date().toISOString() }));
  const people: Person[] = (Array.isArray(raw.people) ? raw.people : []).filter(p => p && typeof p.name === 'string' && p.name.trim()).slice(0, 100)
    .map(p => ({ id: text(p.id, 24) || id(), name: p.name.trim().slice(0, 80), ...(text(p.note, 200)?.trim() ? { note: p.note!.trim().slice(0, 200) } : {}), ...(typeof p.everyDays === 'number' && p.everyDays > 0 ? { everyDays: Math.min(365, Math.round(p.everyDays)) } : {}), ...(iso(p.last) ? { last: p.last } : {}) }));
  // Saved before the rename (November 19, 2026), prefs.json held the dashboard layout under "taurus" (with "oxSize"
  // and start "taurus") and the show-the-assistant switch under "ox". Read those so nothing set up is lost.
  const old = raw as Partial<Prefs> & { ox?: boolean; taurus?: unknown };
  const oldHud = old.taurus && typeof old.taurus === 'object' ? old.taurus as Partial<Hud> & { oxSize?: Hud['taurusSize']; start?: string } : undefined;
  const hudRaw = raw.hud ?? (oldHud ? { ...oldHud, taurusSize: oldHud.taurusSize ?? oldHud.oxSize, start: oldHud.start === 'board' ? 'board' as const : 'hud' as const } : undefined);
  const shown = typeof old.taurus === 'boolean' ? old.taurus : typeof old.ox === 'boolean' ? old.ox : base.taurus;
  return { boards: boards.length ? boards : base.boards, todos, people, tint: tints.includes(raw.tint!) ? raw.tint! : base.tint, ambient: raw.ambient ?? base.ambient, taurus: shown,
    profile: profile(raw.profile, base.profile), background: background(raw.background, base.background), hud: hud(hudRaw) };
}

// A small photo the web app already shrank, kept inside prefs; anything else is dropped.
const photo = (v: unknown) => typeof v === 'string' && v.length < 200_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : undefined;
const clamp = (v: unknown, lo: number, hi: number, d: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;

function profile(raw: Partial<Profile> | undefined, base: Profile): Profile {
  const p = raw && typeof raw === 'object' ? raw : {};
  const tone = (['witty', 'brief', 'warm', 'direct'] as const).find(t => t === p.tone) ?? base.tone;
  const pic = photo(p.photo);
  const email = typeof p.email === 'string' && /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}$/.test(p.email.trim()) ? p.email.trim() : undefined;
  const language = typeof p.language === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(p.language) ? p.language : undefined;
  const icon = p.icon === 'mascot' ? 'mascot' as const : undefined;
  const iconColor = typeof p.iconColor === 'string' && /^[a-z]{3,10}$/.test(p.iconColor) ? p.iconColor : undefined;
  return { name: (text(p.name, 60) ?? '').trim(), ...(email ? { email } : {}), ...(pic ? { photo: pic } : {}), tone, greet: typeof p.greet === 'boolean' ? p.greet : base.greet, large: Boolean(p.large),
    ...(language && language !== 'en' ? { language } : {}), ...(icon ? { icon } : {}), ...(iconColor ? { iconColor } : {}) };
}

function background(raw: Partial<Background> | undefined, base: Background): Background {
  const b = raw && typeof raw === 'object' ? raw : {};
  const kind = (['field', 'color', 'image', 'link'] as const).find(k => k === b.kind) ?? base.kind;
  const color = typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : base.color;
  const url = typeof b.url === 'string' && /^https:\/\/[^\s"'()<>\\]{4,1000}$/.test(b.url) ? b.url : undefined;
  const file = typeof b.file === 'string' && /^\d{1,15}$/.test(b.file) ? b.file : undefined;
  return {
    kind: kind === 'link' && !url ? 'field' : kind === 'image' && !file ? 'field' : kind, color, ...(url ? { url } : {}), ...(file ? { file, video: Boolean(b.video) } : {}),
    dim: clamp(b.dim, 0, 85, base.dim), blur: clamp(b.blur, 0, 40, base.blur), daylight: typeof b.daylight === 'boolean' ? b.daylight : base.daylight,
  };
}

// The first read saves the defaults, so widget ids stay stable from then on.
export const prefs = () => { const saved = store.doc<Partial<Prefs> | null>(FILE, null); return saved ? sanitize(saved) : savePrefs(defaults()); };
export const savePrefs = (raw: Partial<Prefs>) => { const clean = sanitize(raw); store.saveDoc(FILE, clean); return clean; };

// ---------- AI ----------

function json<T>(reply: string): T {
  const start = reply.indexOf('{'), end = reply.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI did not return a layout. Try rewording.');
  return JSON.parse(reply.slice(start, end + 1)) as T;
}

const notTickers = new Set(['I', 'A', 'AI', 'CEO', 'VIP', 'HRV', 'OK', 'US', 'UK', 'EU', 'Q1', 'Q2', 'Q3', 'Q4', 'KPI', 'ETF', 'IPO', 'PM', 'AM', 'ME', 'MY']);
const tickers = (prompt: string) => [...new Set([...prompt.matchAll(/(?:^|[\s,(])\$?([A-Z]{1,5}(?:[.-][A-Z]{1,3})?|\^[A-Z]{2,5})(?=$|[\s,.)])/g)].map(m => m[1]).filter(t => !notTickers.has(t)))].slice(0, 8);

// Used when no AI is connected: understands the common asks well enough to be useful.
function rulesBoard(prompt: string): Board {
  const p = prompt.toLowerCase();
  const widgets: Widget[] = [];
  const syms = tickers(prompt);
  const about = [...prompt.matchAll(/(?:news|headlines|track|tracking|follow)\s+(?:on|about|for)?\s*([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*)/g)].map(m => m[1]).filter(t => !syms.includes(t));
  if (/stock|market|price|ticker|portfolio|crypto/.test(p) || syms.length) {
    const charted = (syms.length ? syms : ['^GSPC']).slice(0, 3);
    widgets.push(w('stocks', 'large', { symbols: syms.length ? syms : ['^GSPC', '^IXIC', 'AAPL', 'NVDA'] }));
    for (const s of charted) widgets.push(w('chart', 'large', { symbol: s, range: '1mo' }));
    if (charted.length % 2 === 0) widgets.push(w('focus', 'large'));
  }
  if (/health|sleep|recovery|hrv|heart|fitness|workout|run|body/.test(p)) {
    widgets.push(w('health', 'large'));
    for (const m of ['recovery', 'sleepMinutes', 'hrv'] as TrendMetric[]) widgets.push(w('trend', 'medium', { metric: m, days: 30 }));
  }
  if (/calendar|schedule|meeting|today/.test(p)) widgets.push(w('schedule', 'tall'));
  if (/todo|to-do|task/.test(p)) widgets.push(w('todo', 'medium'));
  if (/people|person|talk|contact|team/.test(p)) widgets.push(w('people', 'medium'));
  if (/news|headline|track|follow/.test(p) || about.length) widgets.push(w('news', 'full', { topics: about.length ? about : ['Business'] }));
  if (/revenue|burn|runway|pipeline|number|metric|kpi/.test(p)) widgets.push(w('numbers', 'wide'));
  if (/file|doc|drive|dropbox|music|spotify|rss|feed|blog|weather|hacker news/.test(p)) widgets.push(w('updates', 'large'));
  if (!widgets.length) widgets.push(w('focus', 'medium'), w('needs', 'tall'), w('schedule', 'tall'));
  const name = prompt.match(/(?:called|named)\s+"?([^".]{2,30})/i)?.[1] ?? prompt.match(/^(?:make\s+|build\s+)?(?:me\s+)?(?:an?\s+)?([\w&' -]{2,24}?)\s+(?:tab|board|page|dashboard)\b/i)?.[1].replace(/^\w/, c => c.toUpperCase()) ?? (syms.length ? 'Markets' : /health|sleep|body/.test(p) ? 'Health' : 'New board');
  return { id: id(), name, widgets };
}

export async function generateBoard(prompt: string, current?: Board): Promise<{ board: Board; by: string }> {
  const ask = prompt.trim().slice(0, 600);
  if (!ask) throw new Error('Describe the board you want.');
  if (!aiProvider()) return { board: { ...rulesBoard(ask), ...(current ? { id: current.id, name: current.name } : {}) }, by: 'rules' };
  const system = `You design boards for Taurus, a CEO's personal dashboard. Reply with JSON only, no prose:
{"name": string (1-3 words), "widgets": [{"type": string, "size": string, "title"?: string, "config"?: object}]}
Widget types:
${Object.entries(widgetTypes).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Sizes on a 12-column grid (columns x rows): small 3x1, medium 4x2, tall 4x3, large 6x2, wide 8x2, banner 12x1, full 12x2. Pack rows so they sum to 12 columns.
Use 3 to 10 widgets. Use real ticker symbols (indexes like ^GSPC, crypto like BTC-USD). When the person wants something shown a specific way that no widget covers, use an "ai" widget whose config.prompt restates exactly what to show and how. Titles are plain words, no emoji.`;
  const turn = current ? `Current board, to change:\n${JSON.stringify({ name: current.name, widgets: current.widgets.map(({ type, size, title, config: c }) => ({ type, size, title, config: c })) })}\n\nRequest: ${ask}` : `Request: ${ask}`;
  const { text: reply, provider } = await askAI(system, [{ role: 'user', text: turn }], true);
  const made = board(json(reply));
  if (!made?.widgets.length) throw new Error('The AI returned an empty board. Try rewording.');
  return { board: { ...made, id: current?.id ?? id() }, by: provider };
}

const cardCache = new Map<string, AiCard>();
export async function aiCard(prompt: string): Promise<AiCard> {
  const ask = prompt.trim().slice(0, 600);
  if (!ask) throw new Error('Write what this card should show.');
  const d = await dashboard();
  const syms = tickers(ask);
  const market = syms.length ? (await quotes(syms, '1mo')).map(q => ({ symbol: q.symbol, name: q.name, price: q.price, dayChangePct: q.changePct && Number(q.changePct.toFixed(2)), monthCloses: q.points.map(p => Number(p.v.toFixed(2))), error: q.error })) : undefined;
  const h = history();
  const facts = `${context(d)}\nhistory${h.sample ? ' (SAMPLE, fictional)' : ''}: ${JSON.stringify(h.days.slice(-30))}${market ? `\nmarket: ${JSON.stringify(market)}` : ''}`;
  const key = createHash('sha256').update(ask + facts.replace(/"now":"[^"]*",/, '')).digest('hex');
  const hit = cardCache.get(key);
  if (hit && Date.now() - Date.parse(hit.at) < 10 * 60_000) return hit;
  const system = `You fill one card on a CEO's dashboard from the facts given. Reply with JSON only:
{"title": string (max 5 words), "kind": "stat" | "list" | "bars" | "line" | "table" | "text", "value"?: string, "caption"?: string, "items"?: [{"label": string, "value"?: string, "detail"?: string}], "series"?: [{"label": string, "value": number}], "columns"?: string[], "rows"?: string[][], "text"?: string}
stat: one big value with a caption. list: up to 8 items. bars or line: up to 30 series points in order. table: up to 8 rows. text: at most 60 words.
Pick the kind the request asks for; otherwise the clearest one. Use only the facts. Sections named in sampleSections and history marked SAMPLE are fictional: say "Sample" in the caption if you use them. If the facts cannot answer, use kind "text" and say what is missing. Plain words, no emoji, no exclamation marks.`;
  const { text: reply, provider } = await askAI(system, [{ role: 'user', text: `Card request: ${ask}\n\nFacts:\n${facts}` }], true);
  const raw = json<Partial<AiCard>>(reply);
  const kinds: AiCard['kind'][] = ['stat', 'list', 'bars', 'line', 'table', 'text'];
  const card: AiCard = {
    title: text(raw.title, 60) || 'Card', kind: kinds.includes(raw.kind!) ? raw.kind! : 'text',
    value: text(raw.value, 40), caption: text(raw.caption, 200), text: text(raw.text, 800),
    items: Array.isArray(raw.items) ? raw.items.slice(0, 8).map(i => ({ label: String(i.label ?? '').slice(0, 120), value: text(i.value, 40), detail: text(i.detail, 160) })) : undefined,
    series: Array.isArray(raw.series) ? raw.series.filter(s => typeof s.value === 'number').slice(0, 30).map(s => ({ label: String(s.label ?? '').slice(0, 30), value: s.value })) : undefined,
    columns: list(raw.columns, 6, 40), rows: Array.isArray(raw.rows) ? raw.rows.slice(0, 8).map(r => (Array.isArray(r) ? r : []).slice(0, 6).map(c => String(c).slice(0, 60))) : undefined,
    provider, at: new Date().toISOString(),
  };
  cardCache.set(key, card);
  return card;
}
