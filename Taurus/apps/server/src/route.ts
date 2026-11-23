import { store } from './store.ts';
import type { Tier } from './speed.ts';

// Who answers what (owner, November 17, 2026: "u should be able to set like all free, all claude which ones which and if
// u tell taurus to change settings it will from u just sayig it"). Each kind of ask (quick, everyday, big job) goes to Taurus's
// free models or to one AI the owner connected. Set on the AI page, or by saying "use Claude for big jobs".

export type Route = Partial<Record<Tier, string>>;
export const tiers: Tier[] = ['simple', 'medium', 'hard'];
export const tierNames: Record<Tier, string> = { simple: 'Quick asks', medium: 'Everyday asks', hard: 'Big jobs' };
export const getRoute = (): Route => store.settings().aiRoute ?? {};
export function saveRoute(next: Route) {
  const clean: Route = {};
  for (const t of tiers) if (typeof next[t] === 'string' && next[t]!.trim()) clean[t] = next[t]!.trim().slice(0, 40);
  store.saveSettings({ aiRoute: clean });
  return clean;
}

// ---------- Saying it ----------

export type Brand = 'free' | 'claude' | 'chatgpt' | 'gemini';
export interface SettingsCommand { route?: { brand: Brand; tiers: Tier[] }[]; scans?: { on?: boolean; every?: number } }

const brandOf = (s: string): Brand | undefined =>
  /\b(claude|anthropic)\b/i.test(s) ? 'claude' : /\b(chat ?gpt|gpt|openai|codex)\b/i.test(s) ? 'chatgpt' : /\bgemini\b/i.test(s) ? 'gemini' : /\b(taurus|free|the free (one|ones|models?))\b/i.test(s) ? 'free' : undefined;
// The kind of ask must follow "for" ("for big jobs", "for everything"), so "use Claude for this long email" is a request,
// not a settings change.
const FOR = String.raw`\bfor (?:the |all (?:the )?|my |any )?`;
const tiersOf = (s: string): Tier[] | undefined => {
  if (new RegExp(`${FOR}(everything|every ?thing|all|every (ask|question))\\b`, 'i').test(s) || /\b(always use|all (of )?it)\b/i.test(s)) return [...tiers];
  const found = new Set<Tier>();
  if (new RegExp(`${FOR}(quick|simple|easy|small|short|light)\\b`, 'i').test(s)) found.add('simple');
  if (new RegExp(`${FOR}(everyday|medium|normal|regular|usual|middle)\\b`, 'i').test(s)) found.add('medium');
  if (new RegExp(`${FOR}(hard|big|complex|difficult|heavy|long|serious|deep)\\b`, 'i').test(s)) found.add('hard');
  return found.size ? [...found] : undefined;
};

// Only the owner's own words reach here, never a page or a tool result. A request that merely names an AI ("use Claude
// to write the email") is not a settings change: it needs a kind of ask ("for big jobs", "for everything") or a plain
// "switch to Claude".
export function settingsCommand(raw: string): SettingsCommand | null {
  const said = raw.toLowerCase().replace(/[’']/g, "'").replace(/[.!?]+$/, '').replace(/^(hey |yo |hi |ok |okay )?(taurus|torus|tauris|tarus)[, ]+/, '').trim();
  if (!said || said.length > 160) return null;
  const scan = said.match(/^(?:please )?(?:(turn|switch) (on|off) (?:the |my )?(?:scans?|scanning)|(start|stop|pause|resume) (?:the |my )?(?:scans?|scanning)|(?:turn|switch) (?:the |my )?(?:scans?|scanning) (on|off))$/);
  if (scan) {
    const word = scan[2] ?? scan[3] ?? scan[4];
    return { scans: { on: word === 'on' || word === 'start' || word === 'resume' } };
  }
  const every = said.match(/^(?:please )?(?:scan|check|run (?:the |my )?scans?) every (\d{1,4}) ?(?:minutes?|mins?|m)$/);
  if (every) return { scans: { every: Number(every[1]) } };
  if (!/\b(use|switch|set|change|make|put|go|move)\b/.test(said)) return null;
  // "switch to Claude", "change the AI to ChatGPT", "make it all free".
  const whole = said.match(/^(?:please )?(?:switch|change|set|go|move)(?: (?:the )?(?:ai|model|brain))? (?:over )?to ([a-z ]+?)(?: for everything| for all)?$/);
  if (whole) { const brand = brandOf(whole[1]); return brand ? { route: [{ brand, tiers: [...tiers] }] } : null; }
  const parts: { brand: Brand; tiers: Tier[] }[] = [];
  for (const clause of said.split(/,|;|\band\b|\bbut\b/)) {
    const brand = brandOf(clause), which = tiersOf(clause);
    if (brand && which) parts.push({ brand, tiers: which });
    else if (brand && /\bmake it\b/.test(clause)) parts.push({ brand, tiers: [...tiers] });
  }
  return parts.length ? { route: parts } : null;
}
