// Ox's face (November 16, 2026; docs/21-ox-anywhere.md). One driver for every Ox: the web app's <Ox> and the desktop
// overlay that appears over other apps both run this file, so his expressions can't drift apart.
//
// The mark is fixed (design/logo/ox-mascot.svg): an upturned horn crescent over two triangle eyes, nothing else. Every
// expression is made only from what the mark already has: eye shape and position, blinks, horn tilt and lift, and the
// whole head's tilt, lift and scale. No mouth, brows, colour or extra strokes.
//
// No motion library: the face needs springs that retarget every frame as the cursor moves (eyes, lean) plus a few
// short keyframed gestures (nod, hop, charge). That is a small spring integrator and an interpolator here, about the
// size of the glue `motion` would have needed, and nothing new to bundle into the overlay's locked-down page.

export const OX_VIEWBOX = '455 738 1138 857';
export const OX_ASPECT = 1138 / 857;
// The horn crescent is split at its middle so each horn can turn inward on its own when he charges.
export const OX_PATHS = {
  hornL: 'M477 760A547 547 0 0 0 1024 1307L1024 1185A425 425 0 0 1 599 760Z',
  hornR: 'M1571 760A547 547 0 0 1 1024 1307L1024 1185A425 425 0 0 0 1449 760Z',
  eyeL: 'M543 1301H647A133 133 0 0 1 780 1434V1525A57 57 0 0 1 683 1563L507 1394A54 54 0 0 1 543 1301Z',
  eyeR: 'M1505 1301H1401A133 133 0 0 0 1268 1434V1525A57 57 0 0 0 1365 1563L1541 1394A54 54 0 0 0 1505 1301Z',
} as const;

// The same SVG as <Ox>, as markup, for pages without React (the desktop overlay).
export function oxMarkup() {
  const p = OX_PATHS;
  return `<svg class="ox" viewBox="${OX_VIEWBOX}" aria-hidden="true">`
    + '<g class="ox-all" fill="currentColor"><g class="ox-horns" stroke="currentColor" stroke-width="24" stroke-linejoin="round">'
    + `<path class="ox-horn ox-horn-l" d="${p.hornL}"/><path class="ox-horn ox-horn-r" d="${p.hornR}"/></g>`
    + `<path class="ox-eye ox-eye-l" d="${p.eyeL}"/><path class="ox-eye ox-eye-r" d="${p.eyeR}"/></g></svg>`;
}

export type Expression = 'idle' | 'curious' | 'listening' | 'thinking' | 'happy' | 'confused' | 'sleep' | 'alert' | 'walk' | 'charge' | 'settle' | 'talking';
export type Gesture = 'nod' | 'hop' | 'charge-in' | 'charge-out';

// Timings the overlay's travel shares with the face, so the lean and the run line up.
export const CHARGE_IN_MS = 640;
export const CHARGE_OUT_MS = 380;
export const NOD_MS = 560;

// ---------- Poses ----------
// Units are the SVG's own (the mark is 1138 wide). Pinch is degrees each horn turns inward; tilt is the head's lean.
interface Pose {
  lsx: number; lsy: number; rsx: number; rsy: number; // eye shape (scale)
  ex: number; ey: number;                             // both eyes moved together
  pinchL: number; pinchR: number; hornY: number;      // horns
  tilt: number; y: number; scale: number;             // whole head
}
type Offset = Partial<Pose> & { hornTilt?: number };
interface Look extends Partial<Pose> { gaze?: number; blink?: boolean }
const REST: Pose = { lsx: 1, lsy: 1, rsx: 1, rsy: 1, ex: 0, ey: 0, pinchL: 0, pinchR: 0, hornY: 0, tilt: 0, y: 0, scale: 1 };
const KEYS = Object.keys(REST) as (keyof Pose)[];

// gaze: how much the eyes and lean follow what he's looking at. blink: whether he blinks on his own.
export const LOOKS: Record<Expression, Look> = {
  idle: { gaze: 1, blink: true },
  curious: { lsx: 1.1, lsy: 1.14, rsx: 1.02, rsy: 1.04, ey: -14, pinchL: 4, pinchR: -3, hornY: -22, tilt: 6, gaze: 1, blink: true },
  listening: { lsx: 1.12, lsy: 1.12, rsx: 1.12, rsy: 1.12, hornY: -46, scale: 1.02, gaze: 0.6, blink: true },
  thinking: { lsy: 0.82, rsy: 0.82, ey: -22, gaze: 0, blink: true },
  happy: { lsx: 1.04, lsy: 0.5, rsx: 1.04, rsy: 0.5, y: -6, gaze: 0.4 },
  confused: { lsx: 0.95, lsy: 0.72, rsx: 1.1, rsy: 1.12, pinchL: -8, pinchR: 10, hornY: -10, tilt: -8, gaze: 0.3, blink: true },
  sleep: { lsy: 0.14, rsy: 0.14, hornY: 10 },
  alert: { lsx: 1.18, lsy: 1.18, rsx: 1.18, rsy: 1.18 },
  // Moving: the eyes stay exactly as drawn (owner, October 31: "the eyes never change" while he charges).
  walk: {},
  charge: { pinchL: 15, pinchR: 15 },
  settle: {},
  talking: { gaze: 0.5, blink: true },
};

// ---------- Loops: what keeps going while an expression holds ----------
type Track = [number, number][];
// Piecewise between keys (progress 0..1, value), smoothed so each key is eased into and out of.
function track(keys: Track, p: number) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (p <= t1) { const [t0, v0] = keys[i - 1]; const k = (p - t0) / (t1 - t0 || 1); return v0 + (v1 - v0) * k * k * (3 - 2 * k); }
  }
  return keys[keys.length - 1][1];
}
const wave = (t: number, period: number) => Math.sin((t / period) * Math.PI * 2);
const swell = (t: number, period: number) => (1 - Math.cos((t / period) * Math.PI * 2)) / 2;
const GLANCE: Track = [[0, 0], [0.3, -46], [0.45, -46], [0.65, 46], [0.8, 46], [1, 0]];
const LOOPS: Partial<Record<Expression, (t: number) => Offset>> = {
  idle: t => ({ y: 12 * swell(t, 4.5), scale: -0.01 * swell(t, 4.5) }),
  sleep: t => ({ y: 12 * swell(t, 5), scale: -0.01 * swell(t, 5) }),
  curious: t => ({ tilt: 1.5 * wave(t, 3.2) }),
  listening: t => ({ hornY: -6 * swell(t, 1.6) }),
  // Eyes glance left, then right, while the horns rock: working it out.
  thinking: t => ({ ex: track(GLANCE, (t % 2.4) / 2.4), hornTilt: 5 * wave(t, 2.4) }),
  confused: t => ({ tilt: 2 * wave(t, 2.8) }),
  alert: t => ({ y: -40 * Math.abs(wave(t, 0.32)), tilt: 7 * wave(t, 0.32) }),
  walk: t => ({ y: -50 * Math.sin((t / 0.46) * Math.PI) ** 2, hornTilt: 5 * wave(t, 0.92) }),
};

// ---------- Gestures: short, then back to the expression ----------
interface GestureDef { ms: number; tracks: Partial<Record<keyof Offset, Track>> }
function gestures(dir: number): Record<Gesture, GestureDef> {
  return {
    // "Got it": the horns dip first and the head follows, twice, the second smaller. Front-on, a dip reads as a nod.
    nod: { ms: NOD_MS, tracks: {
      y: [[0, 0], [0.2, 34], [0.44, -4], [0.66, 16], [1, 0]],
      hornY: [[0, 0], [0.16, 30], [0.42, -6], [0.62, 14], [1, 0]],
      ey: [[0, 0], [0.22, 10], [0.46, 0], [0.68, 5], [1, 0]],
      lsy: [[0, 0], [0.2, -0.12], [0.44, 0], [1, 0]], rsy: [[0, 0], [0.2, -0.12], [0.44, 0], [1, 0]],
    } },
    hop: { ms: 840, tracks: { y: [[0, 0], [0.22, -110], [0.5, 0], [0.72, -80], [1, 0]] } },
    // Charge in: turn towards where he's going and pinch the horns, run, then ease out and straighten up past upright.
    'charge-in': { ms: CHARGE_IN_MS, tracks: {
      tilt: [[0, 0], [0.14, 14 * dir], [0.62, 12 * dir], [0.84, -3 * dir], [1, 0]],
      pinchL: [[0, 0], [0.14, 15], [0.6, 15], [0.9, 0], [1, 0]], pinchR: [[0, 0], [0.14, 15], [0.6, 15], [0.9, 0], [1, 0]],
      y: [[0, 0], [0.14, 18], [0.6, 10], [0.86, -8], [1, 0]],
    } },
    // Charge out: the same turn and pinch, quicker, and he's gone (leaving is quicker than arriving).
    'charge-out': { ms: CHARGE_OUT_MS, tracks: {
      tilt: [[0, 0], [0.25, 14 * dir], [1, 16 * dir]],
      pinchL: [[0, 0], [0.25, 15], [1, 15]], pinchR: [[0, 0], [0.25, 15], [1, 15]],
      y: [[0, 0], [0.25, 18], [1, 12]],
    } },
  };
}
// Under Reduce Motion the head stays put; a nod is one slow blink instead, so "understood" still shows.
const REDUCED_NOD: GestureDef = { ms: 360, tracks: { lsy: [[0, 0], [0.5, -0.6], [1, 0]], rsy: [[0, 0], [0.5, -0.6], [1, 0]] } };

// ---------- Springs ----------
interface Spring { x: number; v: number; to: number }
const spring = (x: number): Spring => ({ x, v: 0, to: x });
function stepSpring(s: Spring, dt: number, k: number, zeta: number) {
  // Sub-stepped so a slow frame can't make it explode.
  for (let left = dt; left > 0; left -= 1 / 240) {
    const h = Math.min(1 / 240, left);
    s.v += (k * (s.to - s.x) - 2 * Math.sqrt(k) * zeta * s.v) * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.to - s.x) < 0.002 && Math.abs(s.v) < 0.02) { s.x = s.to; s.v = 0; }
}

// ---------- One ticker for every face on the page ----------
const faces = new Set<{ step(dt: number, now: number): void; calm(): boolean }>();
// A calm Ox (idle or asleep: only a slow breath and the odd blink) moves 20 times a second, not 60. Every write
// repaints him and the glass around him, in every window he is in (owner, November 18, 2026: OXBOT ran the Mac hot).
const CALM_MS = 50;
// Between calm ticks it waits on a timer rather than asking for every frame, so the window has nothing to draw.
let raf = 0, wait = 0, last = 0;
function loop(t: number) {
  raf = 0;
  const dt = last ? Math.min(0.05, Math.max(0, (t - last) / 1000)) : 0;
  last = t;
  for (const f of faces) f.step(dt, t);
  if (!faces.size) { last = 0; return; }
  if ([...faces].every(f => f.calm())) wait = window.setTimeout(() => { wait = 0; if (!raf) raf = requestAnimationFrame(loop); }, CALM_MS);
  else raf = requestAnimationFrame(loop);
}
// Anything that moves him starts the next frame now instead of after the calm wait.
function wake() {
  if (wait) { window.clearTimeout(wait); wait = 0; }
  if (!raf && faces.size) raf = requestAnimationFrame(loop);
}

export interface Face {
  readonly expression: Expression;
  set(expression: Expression): void;
  // Where to look, in screen pixels from the middle of his face (right and down positive); null looks ahead.
  look(dx: number | null, dy?: number): void;
  play(gesture: Gesture, dir?: number): Promise<void>;
  talk(level: number): void;
  destroy(): void;
}

const fmt = (n: number) => (Math.abs(n) < 0.005 ? '0' : n.toFixed(2));

export function oxFace(svg: SVGSVGElement, options: { expression?: Expression; reduce?: boolean } = {}): Face {
  const q = (s: string) => svg.querySelector<SVGElement>(s);
  const all = q('.ox-all'), horns = q('.ox-horns'), hornL = q('.ox-horn-l'), hornR = q('.ox-horn-r'), eyeL = q('.ox-eye-l'), eyeR = q('.ox-eye-r');
  for (const [el, origin] of [[all, '50% 100%'], [horns, '50% 100%'], [hornL, '100% 100%'], [hornR, '0% 100%'], [eyeL, '50% 50%'], [eyeR, '50% 50%']] as const) {
    if (!el) continue;
    el.style.transformBox = 'fill-box';
    el.style.transformOrigin = origin;
  }
  const reduce = options.reduce ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let expression: Expression = options.expression ?? 'idle';
  const start = { ...REST, ...LOOKS[expression] };
  const pose = Object.fromEntries(KEYS.map(k => [k, spring(start[k])])) as Record<keyof Pose, Spring>;
  const gx = spring(0), gy = spring(0);
  let gazeAt: { dx: number; dy: number } | null = null;
  let talkLevel = 0;
  let since = performance.now();
  let blinkAt = since + 1800 + Math.random() * 2400, again = false;
  let active: { def: GestureDef; start: number; done: () => void } | null = null;
  const written = new Map<SVGElement, string>();
  const write = (el: SVGElement | null, value: string) => { if (el && written.get(el) !== value) { written.set(el, value); el.style.transform = value; } };

  function aim() {
    const look = { ...REST, ...LOOKS[expression] };
    if (expression === 'talking') {
      look.lsx = look.rsx = 1 + talkLevel * 0.1;
      look.lsy = look.rsy = 1 + talkLevel * 0.22;
      look.hornY = -38 * talkLevel;
    }
    for (const k of KEYS) pose[k].to = look[k];
  }

  const self = {
    calm: () => !active && talkLevel === 0 && (expression === 'idle' || expression === 'sleep') && Math.abs(gx.to - gx.x) < 0.5 && Math.abs(gy.to - gy.x) < 0.5,
    step(dt: number, now: number) {
      // Stiffer while talking, so the eyes keep up with the voice.
      const k = expression === 'talking' ? 900 : 320;
      for (const key of KEYS) stepSpring(pose[key], dt, k, 0.78);
      const gaze = reduce ? 0 : LOOKS[expression].gaze ?? 0;
      // Saturates: a cursor across the screen pins the eyes near the edge of where they can go, never past it.
      const d = gazeAt ? Math.hypot(gazeAt.dx, gazeAt.dy, 260) : 1;
      gx.to = gazeAt ? (78 * gazeAt.dx / d) * gaze : 0;
      gy.to = gazeAt ? (52 * gazeAt.dy / d) * gaze : 0;
      stepSpring(gx, dt, 140, 0.82); stepSpring(gy, dt, 140, 0.82);

      const o: Offset = reduce ? {} : LOOPS[expression]?.((now - since) / 1000) ?? {};
      let g: Offset = {};
      if (active) {
        const p = Math.min(1, (now - active.start) / active.def.ms);
        g = Object.fromEntries(Object.entries(active.def.tracks).map(([key, keys]) => [key, track(keys!, p)]));
        if (p >= 1) { const done = active.done; active = null; svg.removeAttribute('data-gesture'); done(); }
      }
      // Blinks every 2.6 to 6 s, one in five of them twice.
      let blink = 1;
      if (LOOKS[expression].blink && !active && now > blinkAt) {
        const into = now - blinkAt;
        blink = into < 70 ? 1 - 0.92 * (into / 70) : into < 160 ? 0.08 + 0.92 * ((into - 70) / 90) : 1;
        if (into >= 160) { again = !again && Math.random() < 0.2; blinkAt = now + (again ? 90 : 2600 + Math.random() * 3400); }
      }
      const v = (key: keyof Pose) => pose[key].x + (o[key] ?? 0) + (g[key] ?? 0);
      const lean = gx.x / 13;
      const head = `translate(${fmt(gx.x * 0.12)}px, ${fmt(v('y'))}px) rotate(${fmt(v('tilt') + lean)}deg) scale(${v('scale').toFixed(4)})`;
      write(all, head === 'translate(0px, 0px) rotate(0deg) scale(1.0000)' ? '' : head);
      const top = `translate(${fmt(gx.x * 0.3)}px, ${fmt(v('hornY') + gy.x * 0.3)}px) rotate(${fmt(o.hornTilt ?? 0)}deg)`;
      write(horns, top === 'translate(0px, 0px) rotate(0deg)' ? '' : top);
      write(hornL, Math.abs(v('pinchL')) > 0.005 ? `rotate(${fmt(v('pinchL'))}deg)` : '');
      write(hornR, Math.abs(v('pinchR')) > 0.005 ? `rotate(${fmt(-v('pinchR'))}deg)` : '');
      const eye = (sx: number, sy: number) => {
        const s = `translate(${fmt(v('ex') + gx.x)}px, ${fmt(v('ey') + gy.x)}px) scale(${sx.toFixed(3)}, ${(sy * blink).toFixed(3)})`;
        return s === 'translate(0px, 0px) scale(1.000, 1.000)' ? '' : s;
      };
      write(eyeL, eye(v('lsx'), v('lsy')));
      write(eyeR, eye(v('rsx'), v('rsy')));
    },
  };

  aim();
  faces.add(self);
  wake();

  const face: Face = {
    get expression() { return expression; },
    set(next) {
      if (next === expression) return;
      const was = expression;
      expression = next;
      since = performance.now();
      aim(); wake();
      if (next === 'happy' && was !== 'happy') void face.play('hop');
    },
    look(dx, dy = 0) { gazeAt = dx === null || !Number.isFinite(dx) ? null : { dx, dy: Number.isFinite(dy) ? dy : 0 }; wake(); },
    play(name, dir = 1) {
      if (active) { const done = active.done; active = null; done(); }
      if (reduce && name !== 'nod') return Promise.resolve();
      const def = reduce ? REDUCED_NOD : gestures(dir < 0 ? -1 : 1)[name];
      svg.dataset.gesture = name;
      return new Promise<void>(resolve => { active = { def, start: performance.now(), done: resolve }; wake(); });
    },
    talk(level) { talkLevel = Math.max(0, Math.min(1, level || 0)); if (expression === 'talking') aim(); wake(); },
    destroy() { faces.delete(self); if (active) { const done = active.done; active = null; done(); } },
  };
  return face;
}
