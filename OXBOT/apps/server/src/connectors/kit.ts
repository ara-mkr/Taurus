import { apps, type AppName } from '../providers.ts';
import type { Body, CalendarEvent, Group, InboxCount, Metric, Need, Update } from '../types.ts';

// What a connector contributes to the dashboard. Every field is optional.
export interface Pull { needs?: Need[]; schedule?: CalendarEvent[]; inbox?: InboxCount[]; body?: Omit<Body, 'sources'>; numbers?: Metric[]; updates?: Update[] }

export interface Field { key: string; label: string; secret?: boolean; optional?: boolean; appKey?: boolean; placeholder?: string }
export interface Ctx { token: () => Promise<string>; field: (key: string) => string | undefined }
export interface Def {
  id: string; name: string; group: Group; reads: string;
  oauth?: { app: AppName; scopes: string[] };
  fields?: Field[];
  // No account or key: a public feed you switch on. Its one field holds "1" while it is on.
  toggle?: boolean;
  // Built from the provider's documentation and tested only against mocked responses, never a real account.
  mockOnly?: boolean;
  // A write grant (November 1, 2026): lets OXBOT carry out actions you approve. Never offered through the read-only sign-in service.
  write?: boolean;
  setup: string; setupUrl: string;
  pull?: (ctx: Ctx) => Promise<Pull>;
}

// Own-app keys are optional when OXBOT's sign-in service (OXBOT_BROKER_URL) has that provider.
export const appFields = (app: AppName): Field[] => [
  { key: apps[app].id, label: `${apps[app].name} client ID`, appKey: true },
  { key: apps[app].secret, label: `${apps[app].name} client secret`, secret: true, appKey: true },
];
export const toggleField = (id: string): Field => ({ key: `${id.toUpperCase().replace(/-/g, '_')}_ON`, label: 'On' });

export const DAY = 86_400_000;
export const iso = (ms: number) => new Date(ms).toISOString();
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfToday = () => startOfToday() + DAY;
const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&apos;': "'" };
export const decode = (text = '') => text.replace(/&(amp|lt|gt|quot|#39|nbsp|apos);/g, match => entities[match]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
export const stripTags = (html = '') => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// "a, b\nc" -> ['a', 'b', 'c']
export const list = (value?: string) => (value ?? '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
export const money = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount);
