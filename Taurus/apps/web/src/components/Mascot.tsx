import type { ReactElement } from 'react';

// Each bot's own little Taurus (owner, November 23, 2026: "give it like custom taurus logos like different shape horns or
// something"). The same family as Taurus's horns-over-eyes mark (Logo.tsx), with one of eight horn shapes and one of
// four kinds of eyes, picked from the bot's id so a bot keeps its face. Square line caps, to match the hard edges.

const HORNS = [
  'M5 7 Q16 27 27 7', // crescent, like Taurus
  'M8 3 Q9 16 16 17 Q23 16 24 3', // tall
  'M5 13 Q3 4 10 5 Q13 6 11 9 M27 13 Q29 4 22 5 Q19 6 21 9', // curled
  'M5 5 L13 15 M27 5 L19 15', // vee
  'M9 8 L11 14 M23 8 L21 14 M11 14 L21 14', // stubs
  'M3 14 Q8 5 14 12 M29 14 Q24 5 18 12', // swept
  'M11 13 A5 5 0 1 1 6 7 M21 13 A5 5 0 1 0 26 7', // ram
  'M10 16 L8 5 M8 10 L4 7 M22 16 L24 5 M24 10 L28 7', // antlers
];
const EYES: ((x: number) => ReactElement)[] = [
  x => <path key={x} d={`M${x - 3} 20 L${x + 3} 20 L${x + 1} 25 Z`} />, // the original's slanted drops
  x => <circle key={x} cx={x} cy={22} r={2.2} />, // dots
  x => <rect key={x} x={x - 3} y={21} width={6} height={2} />, // slits
  x => <rect key={x} x={x - 1.75} y={20.25} width={3.5} height={3.5} />, // squares
];
export const hashOf = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export function Mascot({ id, size = 24 }: { id: string; size?: number }) {
  const h = hashOf(id), horns = HORNS[h % HORNS.length], eye = EYES[(h >>> 4) % EYES.length];
  return <svg className="bot-mascot" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
    <path d={horns} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="square" strokeLinejoin="miter" />
    <g fill="currentColor">{eye(11)}{eye(21)}</g>
  </svg>;
}

// Dark or light marks, whichever reads on the bot's colour.
export function inkOn(colour: string) {
  const m = /^#([\da-f]{6})$/i.exec(colour);
  if (!m) return 'var(--bg)';
  const n = parseInt(m[1], 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#1E2A38' : '#F4F7FA';
}
