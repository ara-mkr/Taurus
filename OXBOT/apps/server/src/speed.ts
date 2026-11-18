import { store } from './store.ts';

// How fast each AI really is, right now (owner, November 17, 2026: "it should choose the best free model like fastest in
// real time super snappy to create the fastest response like if its js a simple ask or a medium ask or a high ask").
// Every answer records how long its first word took. Quick asks go to whichever free model has been fastest lately;
// a model that answers "busy" (429) rests for two minutes. OpenRouter publishes no latency for its free endpoints, so
// OXBOT measures its own.

export type Tier = 'simple' | 'medium' | 'hard';
const SPEED = 'ai-speed.json';
const KEEP = 8;
interface Samples { ms: number[]; busyUntil?: number }
let all: Record<string, Samples> | undefined;
const load = () => (all ??= store.doc<Record<string, Samples>>(SPEED, {}));
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const save = () => { if (!saveTimer) { saveTimer = setTimeout(() => { saveTimer = undefined; store.saveDoc(SPEED, load()); }, 2_000); saveTimer.unref(); } };

export function recordFirstWord(model: string, ms: number) {
  if (!model || !Number.isFinite(ms) || ms <= 0) return;
  const s = load()[model] ??= { ms: [] };
  s.ms = [...s.ms, Math.round(ms)].slice(-KEEP);
  save();
}
export function markBusy(model: string, forMs = 120_000) { (load()[model] ??= { ms: [] }).busyUntil = Date.now() + forMs; save(); }
export const isBusy = (model: string) => (load()[model]?.busyUntil ?? 0) > Date.now();
export function typical(model: string): number | undefined {
  const ms = [...(load()[model]?.ms ?? [])].sort((a, b) => a - b);
  return ms.length ? ms[Math.floor(ms.length / 2)] : undefined;
}
export const speeds = () => Object.entries(load()).filter(([, s]) => s.ms.length).map(([model, s]) => ({ model, firstWordMs: typical(model)!, samples: s.ms.length, busy: (s.busyUntil ?? 0) > Date.now() })).sort((a, b) => a.firstWordMs - b.firstWordMs);

// Which free models suit each kind of ask, and how much each should think first. Measured on November 17, 2026: with
// thinking on, Nemotron 3 Ultra's first word took 2.9 s (it thought silently from 0.66 s) and Nemotron 3.5 Lightning
// spent 200 tokens thinking without a word; with thinking off, 0.43 s and 0.13 s. With the full board and tools prompt,
// Ultra thinking a little took 7 to 12.5 s to its first word and 0.56 to 1.0 s not thinking, and still wrote correct
// tool lines; Super VL not thinking was as quick but wrote broken tool lines, and Lightning misread a meeting's time.
// So quick asks go to the fastest model lately, everyday asks to Ultra, neither thinks first; big jobs think freely.
export const LIGHTNING = 'nvidia/nemotron-3.5-lightning:free', SUPER = 'nvidia/nemotron-3.5-super-vl:free', ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b:free', GEMMA = 'google/gemma-4-31b-it:free';
export const freeTiers: Record<Tier, { models: string[]; reasoning?: { effort: string } }> = {
  simple: { models: [LIGHTNING, SUPER, ULTRA], reasoning: { effort: 'none' } },
  medium: { models: [ULTRA, SUPER, LIGHTNING], reasoning: { effort: 'none' } },
  hard: { models: [ULTRA, SUPER, GEMMA] },
};
// What each model's first word took on November 17, until OXBOT has measured it here.
const guess: Record<string, number> = { [LIGHTNING]: 150, [SUPER]: 800, [ULTRA]: 450, [GEMMA]: 1500 };

// The order to try free models in for this kind of ask: busy ones last; for quick asks, the fastest lately first.
export function freeOrder(tier: Tier, available?: string[]): string[] {
  const list = freeTiers[tier].models.filter(m => !available?.length || available.includes(m));
  const ranked = tier === 'simple' ? [...list].sort((a, b) => (typical(a) ?? guess[a] ?? 2000) - (typical(b) ?? guess[b] ?? 2000)) : list;
  return [...ranked.filter(m => !isBusy(m)), ...ranked.filter(isBusy)];
}

// For tests.
export const resetSpeeds = () => { all = {}; };
