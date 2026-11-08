import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/swarm.css';

// The swarm (owner, November 5, 2026): "a bunch of different colored cursors go around and do things ... they all
// leave the dashboard and start doing stuff and then they come back and nest into the center and disapear". When Ox
// splits a job across helpers (apps/server/src/swarm.ts), each one is drawn as its own coloured cursor. They burst
// out of Ox, the ones waiting for a page leave the screen, the ones at work fly to their live page in the Swarm
// panel and point, scroll and click there where the server says they are acting, and when a helper is done it
// streams back and folds into Ox. Under Reduce Motion they fade in and out where they are instead of travelling.
// The cursors only draw what OXBOT's own browser pages are doing; nothing on your screen is read or moved.

type HelperState = 'waiting' | 'opening' | 'working' | 'done' | 'failed' | 'stopped';
export interface SwarmHelper {
  id: string; n: number; name: string; colour: string; label: string; doing: string; state: HelperState;
  url?: string; host?: string; title?: string; point?: { x: number; y: number }; act?: 'look' | 'read' | 'scroll' | 'click' | 'search';
  moves: number; finding?: string; price?: number; error?: string; at: string;
}
export interface SwarmData {
  id: string; job: string; kind: 'research' | 'prices' | 'tasks'; state: 'running' | 'merging' | 'done' | 'stopped' | 'failed';
  helpers: SwarmHelper[]; answer?: string; startedAt: string; endedAt?: string; width: number; height: number; parallel: number;
}
// Inside the desktop app with "Helpers on every screen" on, the directions of the other displays from this one.
type Away = { dx: number; dy: number }[];
type Desktop = { onSwarmScreens?: (cb: (away: Away) => void) => () => void };

const out = (s: HelperState) => s === 'done' || s === 'failed' || s === 'stopped';
const atWork = (s: HelperState) => s === 'opening' || s === 'working';
// Which screen a helper works on: the same rule as apps/desktop/src/main.ts. -1 is this one.
export const screenFor = (n: number, others: number) => (others ? ((n - 1) % (others + 1)) - 1 : -1);

function useSwarm() {
  const [swarm, setSwarm] = useState<SwarmData | null>(null);
  const [frames, setFrames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/swarm/stream');
    let id = '';
    source.addEventListener('swarm', e => {
      try {
        const next = JSON.parse((e as MessageEvent).data) as SwarmData | null;
        // A new swarm starts with no pictures; the same one keeps them across reconnects.
        if (next && next.id !== id) { id = next.id; setFrames({}); }
        setSwarm(next);
      } catch { /* malformed snapshot: wait for the next one */ }
    });
    source.addEventListener('helper', e => {
      try {
        const h = JSON.parse((e as MessageEvent).data) as SwarmHelper;
        setSwarm(s => (s ? { ...s, helpers: s.helpers.map(x => (x.id === h.id ? h : x)) } : s));
      } catch { /* skip */ }
    });
    source.addEventListener('frame', e => {
      try { const { id, frame } = JSON.parse((e as MessageEvent).data) as { id: string; frame: string }; setFrames(f => ({ ...f, [id]: frame })); } catch { /* skip */ }
    });
    return () => source.close();
  }, []);
  return { swarm, frames };
}

function useAway() {
  const [away, setAway] = useState<Away>([]);
  useEffect(() => {
    const desktop = (window as { oxbotDesktop?: Desktop }).oxbotDesktop;
    return desktop?.onSwarmScreens?.(setAway);
  }, []);
  return away;
}

// Where Ox is: the cloud dashboard's centre mark, else Ox himself, else the middle of the window.
function oxCentre() {
  const el = document.querySelector('[data-ox-center]') ?? document.querySelector('.ox-buddy .ox-button') ?? document.querySelector('.ox-buddy');
  const r = el?.getBoundingClientRect();
  if (r && r.width && r.bottom > 0 && r.top < innerHeight) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return { x: innerWidth / 2, y: innerHeight / 2 };
}
// Just past the edge of the window, along a direction from a point.
function offscreen(from: { x: number; y: number }, dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const tx = ux > 0 ? (innerWidth + 70 - from.x) / ux : ux < 0 ? (-70 - from.x) / ux : Infinity;
  const ty = uy > 0 ? (innerHeight + 70 - from.y) / uy : uy < 0 ? (-70 - from.y) / uy : Infinity;
  const t = Math.min(tx, ty);
  return { x: from.x + ux * t, y: from.y + uy * t };
}

interface Body {
  x: number; y: number; vx: number; vy: number; o: number; s: number; k: number; angle: number; born: number;
  via: { x: number; y: number } | null; aim: { x: number; y: number } | null;
  home: number; nest: number; gone: boolean; moves: number; loud: number;
}

// Coming home (owner, November 6, 2026: "make it so they all gorup together before flying back to the main ox circle
// and then they js hit the center one after the other and disapear ... they all fly together like a flock after").
// A helper that finishes early roosts in a loose, slowly turning flock above Ox. When the job ends, every cursor
// gathers there, the flock flies in to Ox as one, and then they dive into his centre one after another.
interface Flock { phase: 'none' | 'gather' | 'travel' | 'dive'; from: { x: number; y: number }; at: number; order: string[] }
// A sunflower: each cursor's place in the flock, close but never on top of another.
const slot = (k: number, spread = 17) => { const r = spread * Math.sqrt(k + 0.6), a = k * 2.39996; return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.72 }; };
// Where they roost: above Ox, kept on screen.
const roostFor = (c: { x: number; y: number }) => ({ x: Math.max(90, Math.min(innerWidth - 90, c.x)), y: Math.max(90, c.y - Math.min(230, innerHeight * 0.27)) });
const ease = (p: number) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const TRAVEL_MS = 950, DIVE_GAP_MS = 120;

// A helper's page slot in the panel, kept while it works so tiles don't jump about.
function assign(prev: (string | null)[], want: SwarmHelper[], parallel: number) {
  const ids = new Set(want.map(h => h.id));
  const next = Array.from({ length: Math.max(parallel, prev.length) }, (_, i) => prev[i] ?? null).map(id => (id && ids.has(id) ? id : null));
  for (const h of want) if (!next.includes(h.id)) { const free = next.indexOf(null); if (free >= 0) next[free] = h.id; else next.push(h.id); }
  return next;
}
function useSlots(helpers: SwarmHelper[], parallel: number, home: (h: SwarmHelper) => boolean) {
  const [slots, setSlots] = useState<(string | null)[]>([]);
  const next = assign(slots, helpers.filter(h => atWork(h.state) && home(h)), parallel);
  if (next.length !== slots.length || next.some((id, i) => id !== slots[i])) setSlots(next);
  return next;
}

// Tiles are a window on the helper's page that pans to where it is acting, as a share of the page's height.
const WINDOW = 11 / 16;
function pan(h: SwarmHelper, s: Pick<SwarmData, 'width' | 'height'>) {
  const shown = WINDOW / (s.height / s.width);
  const y = (h.point?.y ?? 0) / s.height;
  return Math.max(0, Math.min(1 - shown, y - shown / 2));
}

// The pointer (owner, November 5, 2026: "make it so the agent swarm cursors are slightly curved and look modern"):
// softly rounded corners, gently drawn-in sides and a white rim, tip still at (2, 2). The same path is in the desktop
// overlay (apps/desktop/src/overlay.ts).
const ARROW = 'M3.2 2.4C2.5 1.9 1.7 2.5 1.9 3.3Q3.8 11.3 5.2 19.9C5.4 21 6.8 21.3 7.4 20.3L10.9 14.9C11.3 14.3 11.9 13.9 12.6 13.8L18.6 12.9C19.7 12.7 20 11.3 19 10.7Q10.8 7.1 3.2 2.4Z';
const Arrow = ({ colour }: { colour: string }) => <svg className="swarm-arrow" width="22" height="24" viewBox="0 0 22 24" aria-hidden="true">
  <path d={ARROW} fill={colour} stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" />
</svg>;

export function Swarm() {
  const { swarm, frames } = useSwarm();
  const away = useAway();
  const [hidden, setHidden] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef({ swarm, away });
  useEffect(() => { latest.current = { swarm, away }; }, [swarm, away]);
  const cursors = useRef(new Map<string, HTMLDivElement>());
  const bodies = useRef(new Map<string, Body>());
  const rings = useRef<HTMLSpanElement[]>([]);
  const ringAt = useRef(0);
  const nextHome = useRef(0);
  const flock = useRef<Flock>({ phase: 'none', from: { x: 0, y: 0 }, at: 0, order: [] });
  const swarmId = useRef('');
  const top = useRef(1);
  const [gone, setGone] = useState<{ swarm: string; ids: string[] }>({ swarm: '', ids: [] });

  const busy = swarm?.state === 'running' || swarm?.state === 'merging';
  const isHome = useCallback((h: SwarmHelper) => screenFor(h.n, away.length) < 0, [away.length]);
  const slots = useSlots(swarm?.helpers ?? [], swarm?.parallel ?? 6, isHome);

  // A finished swarm's panel stays a little while with the answer, then goes.
  useEffect(() => {
    if (!swarm || busy) return;
    const t = window.setTimeout(() => setHidden(swarm.id), 45_000);
    return () => window.clearTimeout(t);
  }, [swarm, busy]);

  // The motion: a spring per cursor, a curve through a waypoint on long trips, and a fold into Ox at the end.
  useEffect(() => {
    if (!swarm) return;
    let frame = 0, last = performance.now();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      // Real time, in small steps, so a slow frame doesn't turn into slow motion.
      const elapsed = Math.min(0.25, Math.max(0, (t - last) / 1000));
      last = t;
      const { swarm: s, away: screens } = latest.current;
      if (!s) return;
      if (swarmId.current !== s.id) { swarmId.current = s.id; bodies.current.clear(); nextHome.current = 0; flock.current = { phase: 'none', from: { x: 0, y: 0 }, at: 0, order: [] }; }
      const centre = oxCentre();
      const ending = s.state !== 'running';
      const goneNow: string[] = [];
      const roost = roostFor(centre);
      const f = flock.current;
      const live = s.helpers.filter(h => { const b = bodies.current.get(h.id); return b && !b.gone && t >= b.born; });
      // The flock's own clock: gather everyone, fly in together, then dive one by one.
      if (!reduce && ending && f.phase === 'none') { f.phase = 'gather'; f.at = t; }
      if (f.phase === 'gather') {
        const settled = live.every((h, k) => { const b = bodies.current.get(h.id)!, p = slot(k); return Math.hypot(b.x - (roost.x + p.x), b.y - (roost.y + p.y)) < 46; });
        if ((settled && t - f.at > 450) || t - f.at > 2600) { f.phase = 'travel'; f.at = t; f.from = roost; }
      }
      if (f.phase === 'travel' && t - f.at > TRAVEL_MS) {
        f.phase = 'dive'; f.at = t;
        // Closest to Ox goes first, so they file into him like a queue.
        f.order = live.map(h => h.id).sort((a, b) => { const A = bodies.current.get(a)!, B = bodies.current.get(b)!; return Math.hypot(A.x - centre.x, A.y - centre.y) - Math.hypot(B.x - centre.x, B.y - centre.y); });
      }
      const flockAt = f.phase === 'travel' ? (() => { const p = ease(Math.min(1, (t - f.at) / TRAVEL_MS)); const bend = Math.sin(p * Math.PI) * 60; return { x: f.from.x + (centre.x - f.from.x) * p + bend, y: f.from.y + (centre.y - f.from.y) * p }; })() : null;
      // Each live cursor's place in the flock, by its order among the ones still flying.
      const place = new Map(live.map((h, k) => [h.id, k]));
      s.helpers.forEach((h, i) => {
        const el = cursors.current.get(h.id);
        if (!el) return;
        let b = bodies.current.get(h.id);
        const angle = (i / s.helpers.length) * Math.PI * 2 - Math.PI / 2 + Math.sin(i * 7.1) * 0.35;
        if (!b) {
          const speed = 900 + (i % 5) * 140;
          b = { x: centre.x, y: centre.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, o: 0, s: 0.4, k: 95 + (i % 7) * 14, angle, born: t + i * 22, via: null, aim: null, home: 0, nest: 0, gone: false, moves: h.moves, loud: 0 };
          bodies.current.set(h.id, b);
          el.dataset.from = `${Math.round(centre.x)},${Math.round(centre.y)}`;
        }
        if (b.gone) return;
        if (t < b.born) { el.style.opacity = '0'; return; }

        // Where it should be now.
        const returning = out(h.state) || ending;
        const k = place.get(h.id) ?? i;
        if (reduce && returning && !b.home) { b.home = Math.max(t, nextHome.current + 110); nextHome.current = b.home; }
        if (!reduce && f.phase === 'dive' && !b.home) { const turn = f.order.indexOf(h.id); b.home = f.at + Math.max(0, turn) * DIVE_GAP_MS; }
        const homing = b.home > 0 && t >= b.home;
        let target: { x: number; y: number };
        let tile: DOMRect | undefined;
        const screen = screenFor(h.n, screens.length);
        let flocking = false;
        if (homing) target = centre;
        else if (!reduce && returning && f.phase !== 'dive' && t - b.born >= 420) {
          // Roosting or gathering: a place in the flock above Ox, the whole flock slowly turning.
          flocking = true;
          const p = slot(k), turn = f.phase === 'none' ? t / 2400 : 0, cos = Math.cos(turn), sin = Math.sin(turn);
          const o = flockAt ?? roost, squeeze = flockAt ? 1 - ease(Math.min(1, (t - f.at) / TRAVEL_MS)) * 0.45 : 1;
          target = { x: o.x + (p.x * cos - p.y * sin) * squeeze + Math.sin(t / 310 + i) * 3, y: o.y + (p.x * sin + p.y * cos) * squeeze + Math.cos(t / 360 + i * 1.7) * 3 };
        } else if (!reduce && f.phase === 'dive') { const p = slot(k, 13); target = { x: centre.x + p.x, y: centre.y + p.y - 4 }; flocking = true; }
        else if (!reduce && t - b.born < 420) target = { x: centre.x + Math.cos(b.angle) * (130 + (i % 5) * 24), y: centre.y + Math.sin(b.angle) * (130 + (i % 5) * 24) };
        else if (atWork(h.state) && screen >= 0) target = offscreen(centre, screens[screen].dx, screens[screen].dy);
        else if (atWork(h.state) && (tile = document.querySelector(`[data-tile="${h.id}"] .swarm-page`)?.getBoundingClientRect()) && tile.width) {
          const p = h.point ?? { x: s.width / 2, y: s.height * 0.3 };
          const wob = reduce ? 0 : Math.sin(t / 380 + i) * 2.2;
          const pageH = tile.width * (s.height / s.width);
          target = { x: tile.left + (p.x / s.width) * tile.width + wob, y: tile.top + (p.y / s.height - pan(h, s)) * pageH + (reduce ? 0 : Math.cos(t / 420 + i) * 1.6) };
        } else if (b.home) target = { x: b.x, y: b.y };
        else target = offscreen(centre, Math.cos(b.angle), Math.sin(b.angle));

        // A click: a ring at the tip. (A scroll shows as the page panning under the cursor.)
        if (h.moves !== b.moves) {
          b.moves = h.moves;
          // Clicking, searching or opening a page: its full tag shows for a moment, on top of the others.
          if (h.act === 'click' || h.act === 'search' || h.state === 'opening') { b.loud = t + 1700; el.style.zIndex = String(++top.current); }
          if (h.act === 'click') { const ring = el.querySelector<HTMLElement>('.swarm-click'); ring?.classList.remove('ping'); void ring?.offsetWidth; ring?.classList.add('ping'); }
        }

        if (reduce) {
          const visible = target.x > -20 && target.x < innerWidth + 20 && target.y > -20 && target.y < innerHeight + 20;
          if (!homing) { b.x = target.x; b.y = target.y; }
          const want = homing ? 0 : visible ? 1 : 0;
          b.o += (want - b.o) * Math.min(1, elapsed * 6);
          b.s = 1;
          if (homing && b.o < 0.03) { b.gone = true; goneNow.push(h.id); }
        } else {
          // Long trips curve through a point off to one side, like a hand moving a mouse.
          if (!b.aim || Math.hypot(target.x - b.aim.x, target.y - b.aim.y) > 160) {
            const d = Math.hypot(target.x - b.x, target.y - b.y);
            if (d > 220 && !flocking && !homing) {
              const side = i % 2 ? 1 : -1, mx = (b.x + target.x) / 2, my = (b.y + target.y) / 2;
              b.via = { x: mx - ((target.y - b.y) / d) * d * 0.2 * side, y: my + ((target.x - b.x) / d) * d * 0.2 * side };
            } else b.via = null;
          }
          b.aim = target;
          for (let left = elapsed; left > 0; left -= 1 / 120) {
            const dt = Math.min(1 / 120, left);
            const goal = b.via ?? target;
            if (b.via && Math.hypot(b.via.x - b.x, b.via.y - b.y) < 70) b.via = null;
            // Flying as a flock they hold formation tightly; diving in, they snap to Ox's centre.
            const k = homing ? b.k * 2.2 : flocking ? b.k * (f.phase === 'travel' ? 1.9 : 1.2) : b.k, c = 2 * Math.sqrt(k) * (flocking ? 0.8 : 0.6);
            b.vx += (k * (goal.x - b.x) - c * b.vx) * dt;
            b.vy += (k * (goal.y - b.y) - c * b.vy) * dt;
            // Birds keep a little space: neighbours push apart when they bunch up.
            if (flocking) for (const other of live) {
              if (other.id === h.id) continue;
              const ob = bodies.current.get(other.id)!; const dx = b.x - ob.x, dy = b.y - ob.y, d = Math.hypot(dx, dy);
              if (d > 0.1 && d < 22) { const push = (22 - d) * 40 * dt; b.vx += (dx / d) * push; b.vy += (dy / d) * push; }
            }
            const speed = Math.hypot(b.vx, b.vy);
            if (speed > 2600) { b.vx *= 2600 / speed; b.vy *= 2600 / speed; }
            b.x += b.vx * dt; b.y += b.vy * dt;
          }
          b.o = Math.min(1, b.o + elapsed * 5);
          b.s += (1 - b.s) * Math.min(1, elapsed * 8);
          // Home: it slows into Ox, shrinks and fades.
          if (homing && Math.hypot(centre.x - b.x, centre.y - b.y) < 22) {
            b.nest = Math.min(1, b.nest + elapsed * 7);
            if (b.nest >= 1) { b.gone = true; goneNow.push(h.id); }
          }
        }
        if (b.gone) {
          el.style.opacity = '0';
          el.dataset.phase = 'gone';
          // Each one that folds in sends a ring through Ox in its colour.
          const ring = rings.current[ringAt.current++ % rings.current.length];
          if (ring && !reduce) { ring.style.setProperty('--c', h.colour); ring.style.left = `${centre.x}px`; ring.style.top = `${centre.y}px`; ring.classList.remove('ping'); void ring.offsetWidth; ring.classList.add('ping'); }
          return;
        }
        const lean = reduce ? 0 : Math.max(-16, Math.min(16, b.vx * 0.012));
        const scale = b.s * (1 - b.nest * 0.75);
        el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
        el.style.setProperty('--lean', `${lean.toFixed(1)}deg`);
        el.style.opacity = (b.o * (1 - b.nest)).toFixed(3);
        el.dataset.x = b.x.toFixed(0); el.dataset.y = b.y.toFixed(0);
        el.dataset.phase = homing ? 'home' : flocking ? (f.phase === 'none' ? 'roost' : f.phase) : atWork(h.state) ? (screen >= 0 ? 'away' : 'work') : t - b.born < 420 ? 'burst' : 'out';
        // On the way to its page, and for a moment after a click, the whole tag; resting on its page, just the name.
        const travelling = Math.hypot(target.x - b.x, target.y - b.y) > 48;
        el.dataset.tag = !atWork(h.state) || homing || screen >= 0 ? 'none' : travelling || t < b.loud ? 'full' : 'name';
        // Near the right edge of the panel or the window, the tag hangs to the left of the cursor.
        el.dataset.flip = String(b.x > Math.min(innerWidth - 240, (document.querySelector('.swarm-tiles')?.getBoundingClientRect().right ?? innerWidth) - 150));
      });
      if (goneNow.length) setGone(g => ({ swarm: s.id, ids: g.swarm === s.id ? [...g.ids, ...goneNow] : goneNow }));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [swarm?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- one loop per swarm; it reads the latest state from a ref

  const stop = async () => {
    setStopping(true); setError('');
    try {
      const r = await fetch('/api/swarm/stop', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-oxbot': '1' }, body: '{}' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'The helpers didn’t stop.');
    } catch (e) { setError((e as Error).message); }
    finally { setStopping(false); }
  };

  if (!swarm) return null;
  const helpers = swarm.helpers;
  const working = helpers.filter(h => atWork(h.state)).length;
  const back = helpers.filter(h => out(h.state)).length;
  const elsewhere = helpers.filter(h => atWork(h.state) && !isHome(h)).length;
  const panel = hidden !== swarm.id;
  const status = swarm.state === 'running' ? `${working} at work${elsewhere ? `, ${elsewhere} on your other ${away.length === 1 ? 'screen' : 'screens'}` : ''} · ${back} of ${helpers.length} done`
    : swarm.state === 'merging' ? 'Ox is putting it together' : swarm.state === 'stopped' ? `Stopped · ${back} of ${helpers.length} back` : `Done · ${helpers.length} helpers back`;
  const byId = new Map(helpers.map(h => [h.id, h]));
  const allGone = gone.swarm === swarm.id && helpers.every(h => gone.ids.includes(h.id));

  return <>
    <div className="swarm-layer" aria-hidden="true" data-state={swarm.state}>
      {!allGone && helpers.map(h => <div key={`${swarm.id}-${h.id}`} className="swarm-cursor" data-helper={h.id} data-state={h.state} data-act={h.act ?? ''} style={{ ['--c' as string]: h.colour }}
        ref={el => { if (el) cursors.current.set(h.id, el); else cursors.current.delete(h.id); }}>
        <Arrow colour={h.colour} />
        <span className="swarm-click" />
        <span className="swarm-tag"><span>{h.name}</span><span className="swarm-tag-doing"> · {h.doing}</span></span>
      </div>)}
      {Array.from({ length: 6 }, (_, i) => <span key={i} className="swarm-nest" ref={el => { if (el) rings.current[i] = el; }} />)}
    </div>
    {panel && <section className="swarm-panel" aria-label="Swarm" data-state={swarm.state}>
      <div className="swarm-head">
        <h2>Swarm</h2>
        <p className="swarm-status" aria-live="polite">{status}</p>
        {busy ? <button type="button" className="text-button swarm-stop" onClick={stop} disabled={stopping || swarm.state !== 'running'}>{stopping ? 'Stopping' : 'Stop all'}</button>
          : <button type="button" className="text-button" onClick={() => setHidden(swarm.id)}>Close</button>}
      </div>
      <p className="swarm-job">{swarm.job}</p>
      {error && <p className="problem">{error}</p>}
      {busy && <div className="swarm-tiles">
        {slots.map((id, i) => {
          const h = id ? byId.get(id) : undefined;
          if (!h) return <div key={`slot-${i}`} className="swarm-tile empty"><div className="swarm-page" /></div>;
          const shot = frames[h.id];
          return <figure key={`slot-${i}`} className="swarm-tile" data-tile={h.id} data-state={h.state} style={{ ['--c' as string]: h.colour }}>
            <div className="swarm-page">{shot ? <img src={shot} alt="" draggable={false} style={{ transform: `translateY(${(-pan(h, swarm) * 100).toFixed(2)}%)` }} /> : <span className="swarm-loading">{h.host ?? 'Opening'}</span>}</div>
            <figcaption><span>{h.name}</span> {h.host ?? h.label}</figcaption>
          </figure>;
        })}
      </div>}
      {swarm.answer && !busy && <div className="swarm-answer">{swarm.answer.split(/\n{2,}/).slice(0, 5).map((p, i) => <p key={i}>{p}</p>)}</div>}
      <ol className="swarm-list" aria-label="Helpers" tabIndex={0}>
        {helpers.map(h => <li key={h.id} data-state={h.state}>
          <Arrow colour={h.colour} />
          <span className="swarm-who">{h.name}</span>
          <span className="swarm-doing">{h.state === 'done' && h.finding ? (h.price !== undefined ? `${h.finding.split(':')[0]} on ${h.host}` : `Read ${h.host}`) : h.state === 'failed' ? `Couldn’t open ${h.host ?? h.label}` : h.doing}</span>
        </li>)}
      </ol>
    </section>}
  </>;
}
