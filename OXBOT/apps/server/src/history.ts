import { store } from './store.ts';
import type { Body, Dashboard, History, HistoryDay, TrendMetric } from './types.ts';

// One point per day for the trend charts, written only from live data.
const FILE = 'history.json';
const KEEP_DAYS = 400;
const metrics: TrendMetric[] = ['recovery', 'readiness', 'sleepMinutes', 'sleepScore', 'hrv', 'restingHr', 'strain', 'weekKm'];

const day = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };
// "$1,284,300" -> 1284300, "21 months" -> 21, "-3.0%" -> -3.
export const numeric = (value: string) => { const m = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : undefined; };

export function record(d: Pick<Dashboard, 'body' | 'numbers' | 'sections'>) {
  if (!d.sections.body.live && !d.sections.numbers.live) return;
  const days = store.doc<HistoryDay[]>(FILE, []);
  const today = day();
  const entry: HistoryDay = days.find(x => x.date === today) ?? { date: today };
  if (d.sections.body.live) for (const m of metrics) { const v = (d.body as Body)[m]; if (typeof v === 'number') entry[m] = v; }
  if (d.sections.numbers.live) {
    entry.numbers = { ...entry.numbers };
    for (const metric of d.numbers) { const v = numeric(metric.value); if (v !== undefined) entry.numbers[metric.label] = v; }
  }
  const next = [...days.filter(x => x.date !== today), entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-KEEP_DAYS);
  store.saveDoc(FILE, next);
}

// Repeatable day-to-day noise over a slow drift, so sample charts look like a month of real life.
const noise = (i: number, seed: number) => { const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
const wave = (i: number, seed: number) => Math.sin(i * 0.23 + seed * 2) * 0.35 + noise(i, seed) * 0.65;

function sample(): HistoryDay[] {
  return Array.from({ length: 45 }, (_, k) => {
    const i = 44 - k;
    const round = (n: number, places = 0) => Number(n.toFixed(places));
    return {
      date: day(-i),
      recovery: Math.max(18, Math.min(97, round(64 + wave(i, 1) * 22))),
      readiness: round(76 + wave(i, 4) * 11),
      sleepMinutes: round(412 + wave(i, 2) * 48),
      sleepScore: round(81 + wave(i, 3) * 9),
      hrv: round(58 + wave(i, 1.3) * 11),
      restingHr: round(52 - wave(i, 1.1) * 4),
      strain: round(9.8 + wave(i, 5) * 4, 1),
      weekKm: round(31 + wave(i * 0.4, 6) * 9, 1),
      numbers: { 'Revenue, 30 days': round(1_284_300 * (0.86 + (44 - i) * 0.0033 + wave(i, 7) * 0.01)), 'Monthly burn': round(612_000 * (1.04 - (44 - i) * 0.001)), 'Open pipeline': round(3_900_000 * (0.9 + wave(i * 0.5, 8) * 0.08 + (44 - i) * 0.002)) },
    };
  });
}

// Live history once it exists; sample only while nothing body- or numbers-related has ever been recorded.
export function history(): History {
  const days = store.doc<HistoryDay[]>(FILE, []);
  return days.length ? { sample: false, days } : { sample: true, days: sample() };
}
