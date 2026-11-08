import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dashboard, NewsTopic, Prefs, Quote, Widget } from '../api';
import { catalog, label, pct, seen } from './widgets';
import type { VoiceView } from './Voice';
import { useSpeaking } from '../speech';

// Ox, the OXBOT mascot, from design/logo/ox-mascot.svg: two eyes under upturned horns, nothing else.
// The crescent is drawn as a left and a right horn so each can turn inward on its own when he charges.
export type Mood = 'idle' | 'happy' | 'thinking' | 'sleep' | 'alert' | 'walk' | 'charge' | 'settle' | 'listening' | 'talking';

export function Ox({ size = 96, mood = 'idle', label: name, className = '', talk }: { size?: number; mood?: Mood; label?: string; className?: string; talk?: number }) {
  return <svg className={`ox ${className}`} data-mood={mood} style={talk === undefined ? undefined : { '--talk': talk.toFixed(3) } as React.CSSProperties} viewBox="455 738 1138 857" width={Math.round(size * 1138 / 857)} height={size}
    role={name ? 'img' : undefined} aria-label={name} aria-hidden={name ? undefined : true}>
    <g className="ox-all" fill="currentColor">
      <g className="ox-horns" stroke="currentColor" strokeWidth="24" strokeLinejoin="round">
        <path className="ox-horn ox-horn-l" d="M477 760A547 547 0 0 0 1024 1307L1024 1185A425 425 0 0 1 599 760Z" />
        <path className="ox-horn ox-horn-r" d="M1571 760A547 547 0 0 1 1024 1307L1024 1185A425 425 0 0 0 1449 760Z" />
      </g>
      <path className="ox-eye ox-eye-l" d="M543 1301H647A133 133 0 0 1 780 1434V1525A57 57 0 0 1 683 1563L507 1394A54 54 0 0 1 543 1301Z" />
      <path className="ox-eye ox-eye-r" d="M1505 1301H1401A133 133 0 0 0 1268 1434V1525A57 57 0 0 0 1365 1563L1541 1394A54 54 0 0 0 1505 1301Z" />
    </g>
  </svg>;
}

// ---------- What Ox says on the boards ----------

export interface Line { text: string; href?: string; cta?: string }
const span = (ms: number) => { const m = Math.max(1, Math.round(ms / 60_000)), h = Math.floor(m / 60); return m < 60 ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : m % 60 ? `${h} h ${m % 60} min` : `${h} ${h === 1 ? 'hour' : 'hours'}`; };
const hm = (n: number) => `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m`;
const recoveryLine = (r: number) => r < 34 ? `Recovery is ${r}%. Keep today light if you can.` : r >= 67 ? `Recovery ${r}%. A good day for the hard things.` : `Recovery ${r}%. A steady day.`;
const sampleLine = (what: string): Line => ({ text: `This ${what} is sample data. Connect it and I'll read the real thing.`, href: '#connections', cta: 'Connect' });

// Short, plain lines from the live day. Sample sections are never quoted as fact.
export function oxLines(data: Dashboard | null, prefs: Prefs, now: number): Line[] {
  if (!data) return [{ text: 'Getting your day together.' }];
  const lines: Line[] = [];
  const live = data.sections;
  const hour = new Date(now).getHours();
  const next = live.schedule.live ? data.schedule.find(e => !e.allDay && Date.parse(e.start) > now && Date.parse(e.start) - now < 3 * 3_600_000) : undefined;
  if (next) lines.push({ text: `${next.title} in ${span(Date.parse(next.start) - now)}.`, href: next.joinUrl ?? next.url, cta: next.joinUrl ? 'Join' : next.url ? 'Open' : undefined });
  if (live.needs.live) {
    const vip = data.needs.find(n => n.vip);
    if (vip) lines.push({ text: `${vip.who ?? vip.from ?? 'A VIP'} is waiting on you: ${vip.title}`, href: vip.url, cta: vip.url ? 'Open' : undefined });
    else if (data.needs.length) lines.push({ text: `${data.needs.length} ${data.needs.length === 1 ? 'thing needs' : 'things need'} you. Top one: ${data.needs[0].title}`, href: data.needs[0].url, cta: data.needs[0].url ? 'Open' : undefined });
    else lines.push({ text: 'Nothing is waiting on you. Rare. Enjoy it.' });
  }
  const todo = prefs.todos.find(t => !t.done);
  if (todo) lines.push({ text: `First on your list: ${todo.text}.` });
  if (live.body.live) {
    const r = data.body.recovery;
    if (r !== undefined) lines.push({ text: recoveryLine(r) });
    if (data.body.sleepMinutes !== undefined && data.body.sleepMinutes < 360) lines.push({ text: `You slept ${hm(data.body.sleepMinutes)}. Protect tonight.` });
  }
  const overdue = prefs.people.find(p => p.everyDays && (!p.last || now - Date.parse(p.last) > p.everyDays * 86_400_000));
  if (overdue) lines.push({ text: `It has been a while since you talked to ${overdue.name}.` });
  if (live.inbox.live) { const total = data.inbox.reduce((s, i) => s + i.unread, 0); if (total > 50) lines.push({ text: `${total.toLocaleString('en-US')} unread across your inboxes. I only show you the ones from people.` }); }
  if (hour >= 23 || hour < 5) {
    const first = data.schedule.find(e => !e.allDay && Date.parse(e.start) > now);
    lines.push({ text: first ? `It's late. Tomorrow starts with ${first.title}.` : `It's late. Nothing early tomorrow.` });
  }
  const samples = Object.values(live).filter(s => !s.live).length;
  if (samples >= 2) lines.push({ text: `${samples} of your sections are sample data. Connect them and I'll know your real day.`, href: '#connections', cta: 'Connect' });
  if (!lines.length) lines.push({ text: 'All quiet. Ask me anything about your day.', href: '#ask', cta: 'Ask' });
  return lines;
}

// One line about the card Ox is sitting on, from the same live data the card shows.
export function cardLine(widget: Widget, data: Dashboard | null, prefs: Prefs, now: number): Line | null {
  if (!data) return { text: 'Still getting your day together.' };
  const live = data.sections;
  const config = { ...catalog[widget.type].config, ...widget.config };
  switch (widget.type) {
    case 'schedule': case 'focus': {
      if (!live.schedule.live) return sampleLine('calendar');
      const next = data.schedule.find(e => !e.allDay && Date.parse(e.start) > now);
      if (widget.type === 'focus' && !next && live.needs.live && data.needs[0]) return { text: `Top thing waiting on you: ${data.needs[0].title}`, href: data.needs[0].url, cta: data.needs[0].url ? 'Open' : undefined };
      return next ? { text: `Next up: ${next.title} in ${span(Date.parse(next.start) - now)}.`, href: next.joinUrl ?? next.url, cta: next.joinUrl ? 'Join' : next.url ? 'Open' : undefined } : { text: 'Nothing else on your calendar today.' };
    }
    case 'health': case 'trend': {
      if (!live.body.live) return sampleLine('health card');
      const { recovery, sleepMinutes } = data.body;
      if (recovery !== undefined) return { text: recoveryLine(recovery) };
      return sleepMinutes !== undefined ? { text: `You slept ${hm(sleepMinutes)}.` } : { text: 'No recovery score yet today.' };
    }
    case 'needs': {
      if (!live.needs.live) return sampleLine('list');
      const top = data.needs.find(n => n.vip) ?? data.needs[0];
      return top ? { text: `${data.needs.length} waiting. Start with ${top.who ?? top.from ?? 'this'}: ${top.title}`, href: top.url, cta: top.url ? 'Open' : undefined } : { text: 'Nothing is waiting on you.' };
    }
    case 'inbox': {
      if (!live.inbox.live) return sampleLine('inbox count');
      const total = data.inbox.reduce((s, i) => s + i.unread, 0);
      return { text: `${total.toLocaleString('en-US')} unread across ${data.inbox.length} ${data.inbox.length === 1 ? 'account' : 'accounts'}.` };
    }
    case 'numbers': {
      if (!live.numbers.live) return sampleLine('card');
      const m = data.numbers[0];
      return m ? { text: `${m.label}: ${m.value}${m.change ? `, ${m.change}` : ''}.` } : null;
    }
    case 'todo': { const t = prefs.todos.find(x => !x.done); return { text: t ? `First on your list: ${t.text}.` : 'Your list is clear.' }; }
    case 'people': {
      const overdue = prefs.people.find(p => p.everyDays && (!p.last || now - Date.parse(p.last) > p.everyDays * 86_400_000));
      return { text: overdue ? `It has been a while since you talked to ${overdue.name}.` : 'You are caught up with everyone you track.' };
    }
    case 'stocks': {
      const value = seen.get(`markets:${(config.symbols ?? []).join(',')}`) as { quotes: Quote[] } | undefined;
      const mover = value?.quotes.filter(q => q.changePct !== undefined).sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))[0];
      return mover ? { text: `Biggest mover today: ${label(mover)}, ${pct(mover.changePct)}.` } : { text: 'Prices are still loading.' };
    }
    case 'chart': {
      const value = seen.get(`chart:${config.symbol}:${config.range}`) as { quotes: Quote[] } | undefined;
      const q = value?.quotes[0], first = q?.points[0]?.v, last = q?.price ?? q?.points.at(-1)?.v;
      return q && first && last !== undefined ? { text: `${label(q)} is ${last >= first ? 'up' : 'down'} ${pct(((last - first) / first) * 100).slice(1)} over this range.` } : { text: 'The chart is still loading.' };
    }
    case 'news': {
      const value = seen.get(`news:${(config.topics ?? []).join('|')}`) as { topics: NewsTopic[] } | undefined;
      const top = value?.topics.flatMap(t => t.items).sort((a, b) => Date.parse(b.at ?? '0') - Date.parse(a.at ?? '0'))[0];
      return top ? { text: `Top headline: ${top.title}`, href: top.url, cta: 'Read' } : { text: 'No headlines yet.' };
    }
    case 'updates': {
      const items = data.updates ?? [];
      const weather = items.find(u => u.source === 'Weather');
      if (weather) return { text: `${weather.title} out there. ${weather.detail?.split(' · ')[0] ?? ''}.`.replace(/\.\.$/, '.') };
      return items[0] ? { text: `Latest from ${items[0].source}: ${items[0].title}`, href: items[0].url, cta: 'Open' } : { text: 'Connect weather, feeds or files and I’ll keep an eye on them.' };
    }
    case 'clock': return { text: `It's ${new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.` };
    case 'brief': return oxLines(data, prefs, now)[0];
    default: return null;
  }
}

// ---------- Ox on the boards ----------
// He steers like a cart whose front wheels sit at his horn tips: turn toward the target around the tips,
// pinch the horns, accelerate along the heading, ease out while straightening up, then speak.

const SIZE = 60, BW = Math.round(SIZE * 1138 / 857) + 8, BH = SIZE + 8, PIV = 6;
type Spot = { x: number; y: number };
interface Plan { to: Spot; phase: 'turn' | 'run' | 'arrive'; t: number; vmax: number; then?: () => void; settled: boolean }
const wrap = (a: number) => ((a + 540) % 360) - 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const smooth = (t: number) => t * t * (3 - 2 * t);
const rad = Math.PI / 180;

// The parts of the screen Ox keeps clear of: the tabs rail, the top bar, the chat bar and the side panel.
function safe() {
  const box = (sel: string) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width && r.height && r.right > 0 && r.left < window.innerWidth ? r : undefined; };
  const rail = box('.rail-panel'), top = box('.topbar'), bar = box('.composer-bar'), dock = box('.dock');
  const dockSide = dock && dock.left > window.innerWidth / 2 ? dock.left : window.innerWidth;
  return { left: (rail?.right ?? 0) + 8, right: dockSide - 12, top: (top?.bottom ?? 4) + 8, bottom: Math.min(window.innerHeight - 8, bar?.top ?? Infinity) - 8 };
}
// Where a card sits once its hover lift and entrance animation are over.
const settled = (card: HTMLElement) => {
  const r = card.getBoundingClientRect(), t = new DOMMatrix(getComputedStyle(card).transform);
  return { left: r.left - t.m41, right: r.right - t.m41, top: r.top - t.m42, width: r.width };
};
// Ox lives in #root's coordinates, so he scrolls with the board he is sitting on.
const layer = () => document.getElementById('root')!.getBoundingClientRect();
// His pivot (between the horn tips) when his box's top-left corner is at a viewport point.
const pivotAt = (left: number, top: number): Spot => { const r = layer(); return { x: left - r.left + BW / 2, y: top - r.top + PIV }; };

export function OxBuddy({ lines, lineFor, voice, roam = true }: { lines: Line[]; lineFor?: (widgetId: string) => Line | null; voice?: VoiceView; roam?: boolean }) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [mood, setMood] = useState<Mood>('idle');
  const [flight, setFlight] = useState<'charge' | 'settle' | null>(null);
  const [say, setSay] = useState<Line | null>(null);
  const [resting, setResting] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const rotor = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const pos = useRef<Spot>({ x: 0, y: 0 });
  const heading = useRef(0), steer = useRef(0), speed = useRef(0);
  const plan = useRef<Plan | null>(null);
  const frame = useRef(0), last = useRef(0);
  const anchor = useRef<{ id: string; fx: number } | null>(null);
  const turn = useRef(0);
  const latest = useRef({ lines, lineFor });
  useEffect(() => { latest.current = { lines, lineFor }; }, [lines, lineFor]);

  const paint = useCallback(() => {
    const el = box.current, r = rotor.current;
    if (!el || !r) return;
    el.style.transform = `translate(${pos.current.x - BW / 2}px, ${pos.current.y - PIV}px)`;
    r.style.transform = `rotate(${heading.current.toFixed(2)}deg)`;
    el.dataset.x = pos.current.x.toFixed(1); el.dataset.y = pos.current.y.toFixed(1);
    el.dataset.heading = heading.current.toFixed(1); el.dataset.speed = speed.current.toFixed(0);
    el.dataset.phase = plan.current?.phase ?? 'rest';
  }, []);

  // One small step of the motion model; returns true when he has arrived and straightened up.
  const advance = useCallback((p: Plan, dt: number) => {
    p.t += dt;
    const dx = p.to.x - pos.current.x, dy = p.to.y - pos.current.y, d = Math.hypot(dx, dy);
    const bearing = Math.atan2(dx, -dy) / rad;
    if (p.phase === 'turn') {
      // Wind-up: swing round the horn tips until they point at the target while the horns pinch in.
      steer.current = wrap(steer.current + wrap(bearing - steer.current) * (1 - Math.exp(-dt * 13)));
      heading.current = steer.current;
      if (p.t > 0.34) { p.phase = 'run'; p.t = 0; }
    } else if (p.phase === 'run') {
      const off = wrap(bearing - steer.current), rate = 240 + 9000 / Math.max(d, 30);
      steer.current = wrap(steer.current + clamp(off, -rate * dt, rate * dt));
      // Accelerate along the heading, brake so he eases out at the target, and slow for tight turns.
      const brake = Math.sqrt(2 * 1500 * d), corner = rate * rad * d / (2 * Math.max(0.05, Math.sin(Math.abs(off) * rad)));
      speed.current = Math.min(speed.current + 2600 * dt, p.vmax, brake, corner);
      const stride = Math.min(speed.current * dt, d);
      pos.current = { x: pos.current.x + Math.sin(steer.current * rad) * stride, y: pos.current.y - Math.cos(steer.current * rad) * stride };
      // Near the end he straightens up and the horns open again while he slows.
      heading.current = steer.current * smooth(Math.min(1, d / 120));
      if (!p.settled && d < 90) { p.settled = true; setFlight('settle'); }
      if (d < 1.5 || (d < 8 && speed.current < 50) || p.t > 5) { pos.current = p.to; speed.current = 0; p.phase = 'arrive'; p.t = 0; }
    } else {
      heading.current *= Math.exp(-dt * 16);
      if (p.t > 0.16 && Math.abs(heading.current) < 0.4) { heading.current = 0; return true; }
    }
    return false;
  }, []);

  // Fixed small steps, so the motion runs in real time even when frames are slow.
  const tick = useCallback(function step(t: number) {
    const p = plan.current;
    if (!p) return;
    let left = Math.min(0.25, last.current ? (t - last.current) / 1000 : 1 / 60);
    last.current = t;
    while (left > 0) {
      const dt = Math.min(left, 1 / 120);
      left -= dt;
      if (advance(p, dt)) {
        plan.current = null; paint();
        setFlight(null); setMood('idle'); setResting(n => n + 1); p.then?.();
        return;
      }
    }
    paint();
    frame.current = requestAnimationFrame(step);
  }, [advance, paint]);

  const go = useCallback((to: Spot, then?: () => void) => {
    setSay(null);
    if (reduce) {
      // No travel: fade out and reappear at the spot.
      plan.current = null; box.current?.classList.add('ox-away');
      window.setTimeout(() => { pos.current = to; heading.current = 0; paint(); box.current?.classList.remove('ox-away'); setResting(n => n + 1); then?.(); }, 200);
      return;
    }
    const d = Math.hypot(to.x - pos.current.x, to.y - pos.current.y);
    const p = plan.current;
    // Already running: steer onto the new target without stopping.
    if (p && p.phase === 'run') { Object.assign(p, { to, then, vmax: clamp(d * 1.8, 420, 1300), settled: false, t: 0 }); setFlight('charge'); return; }
    if (d < 4) { then?.(); return; }
    cancelAnimationFrame(frame.current);
    plan.current = { to, then, phase: 'turn', t: 0, vmax: clamp(d * 1.8, 420, 1300), settled: false };
    speed.current = 0; steer.current = heading.current; last.current = 0;
    setFlight('charge'); paint();
    frame.current = requestAnimationFrame(tick);
  }, [reduce, paint, tick]);

  const speak = useCallback((line?: Line | null) => {
    if (plan.current) return;
    const all = latest.current.lines;
    const next = line ?? (all.length ? all[turn.current++ % all.length] : null);
    if (!next) return;
    setSay(next); setMood('happy');
  }, []);

  // A spot on a card: on its top edge near the click, above the text inside it.
  const perch = useCallback((card: HTMLElement, clientX: number) => {
    const r = settled(card), s = safe();
    const left = clamp(clientX - BW / 2, r.left + 10, r.right - BW - 10);
    return pivotAt(clamp(left, s.left, s.right - BW), clamp(r.top - BH + 12, s.top, s.bottom - BH));
  }, []);
  const free = useCallback((clientX: number, clientY: number) => {
    const s = safe();
    return pivotAt(clamp(clientX - BW / 2, s.left, s.right - BW), clamp(clientY - BH + 10, s.top, s.bottom - BH));
  }, []);
  const toCard = useCallback((card: HTMLElement, clientX: number) => {
    const r = settled(card), id = card.id.replace(/^w-/, '');
    anchor.current = { id: card.id, fx: (clamp(clientX - BW / 2, r.left + 10, r.right - BW - 10) - r.left) / Math.max(1, r.width) };
    go(perch(card, clientX), () => speak(latest.current.lineFor?.(id) ?? null));
  }, [go, perch, speak]);

  // Start in the bottom right corner. Keep his spot when the window or the board reflows.
  useLayoutEffect(() => {
    const s = safe();
    pos.current = pivotAt(s.right - BW - 16, s.bottom - BH);
    paint();
    const reflow = () => {
      if (plan.current) return;
      const a = anchor.current, card = a && document.getElementById(a.id);
      if (a && card) { const r = settled(card); pos.current = perch(card, r.left + a.fx * r.width + BW / 2); }
      else { const r = layer(), s2 = safe(); pos.current = { x: clamp(pos.current.x, s2.left - r.left + BW / 2, s2.right - r.left - BW / 2), y: pos.current.y }; }
      paint();
    };
    const observer = new ResizeObserver(reflow);
    observer.observe(document.body);
    window.addEventListener('resize', reflow);
    return () => { observer.disconnect(); window.removeEventListener('resize', reflow); cancelAnimationFrame(frame.current); };
  }, [paint, perch]);

  // Clicking a card's empty area or the board background sends him there. Controls and charts keep their own clicks.
  useEffect(() => {
    if (!roam) return;
    const click = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (e.defaultPrevented || e.button !== 0 || !target || document.querySelector('.board.is-editing')) return;
      if (target.closest('a, button, input, select, textarea, label, summary, dialog, svg, canvas, [role], [contenteditable], .ox-buddy, .topbar, .rail, .chatbar, .dock, .people-strip, .board-bar, .builder')) return;
      if (String(window.getSelection() ?? '')) return;
      const card = target.closest<HTMLElement>('.card');
      if (card) { toCard(card, e.clientX); return; }
      if (!target.closest('main.board') && target !== document.body && target !== document.documentElement && target.id !== 'root') return;
      anchor.current = null;
      go(free(e.clientX, e.clientY));
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [roam, go, free, toCard]);

  // On his own: say hello, then every 20 to 40 seconds charge to a card on screen and talk about it.
  useEffect(() => {
    if (!roam) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
    const wander = () => {
      later(wander, 20_000 + Math.random() * 20_000);
      if (document.hidden || plan.current || box.current?.dataset.busy === 'true') return;
      if (reduce) { speak(); return; }
      const s = safe();
      const cards = [...document.querySelectorAll<HTMLElement>('.board .card')].filter(c => { const r = c.getBoundingClientRect(); return r.top - BH > s.top && r.top < s.bottom - 40; });
      const card = cards[Math.floor(Math.random() * cards.length)];
      if (card) { const r = card.getBoundingClientRect(); toCard(card, r.left + 20 + Math.random() * Math.max(0, r.width - 40)); }
    };
    later(() => { if (!box.current?.querySelector('.ox-bubble') && box.current?.dataset.phase !== 'run') speak(); }, 1_500);
    later(wander, 20_000 + Math.random() * 20_000);
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [roam, reduce, speak, toCard]);

  useEffect(() => { if (!say) return; const t = window.setTimeout(() => { setSay(null); setMood('idle'); }, 9_000); return () => window.clearTimeout(t); }, [say]);

  // Voice: he perks up and comes to sit just above Talk, at the left end of the chat bar, while listening.
  const phase = voice?.phase ?? 'idle';
  useEffect(() => {
    if (phase !== 'listening') return;
    const talk = document.querySelector<HTMLElement>('.composer-bar .fn-talk');
    if (!talk?.offsetParent) return;
    const r = talk.getBoundingClientRect(), s = safe();
    const left = clamp(r.left + r.width / 2 - BW / 2, s.left, s.right - BW);
    const top = r.top - BH - 14;
    anchor.current = null;
    go(pivotAt(left, clamp(top, 4, window.innerHeight - BH - 8)));
  }, [phase, go]);

  const voiceLine: Line | null = !voice || phase === 'idle' ? null
    : phase === 'listening' ? { text: voice.text || (voice.woke ? 'Yes?' : 'Listening.') }
    : phase === 'thinking' ? { text: `“${voice.text}”` }
    : { text: voice.text };
  const shown = voiceLine ?? say;
  // While he talks (November 5, 2026), his horns nod and his eyes open with the loudness of his own voice.
  const speaking = useSpeaking();
  const face: Mood = flight ?? (phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : speaking.active ? 'talking' : mood);

  // Keep the bubble inside the viewport: centred on him, nudged in from the edges, below him when the top is too close.
  useLayoutEffect(() => {
    const b = bubble.current, el = box.current;
    if (!b || !el) return;
    b.style.left = '0px'; b.style.top = '0px';
    const me = el.getBoundingClientRect(), mine = b.getBoundingClientRect(), s = safe();
    const left = clamp(me.left + BW / 2 - mine.width / 2, s.left, s.right - mine.width);
    const above = me.top - mine.height - 8 >= s.top;
    b.style.left = `${left - me.left}px`;
    b.style.top = above ? `${-mine.height - 8}px` : `${BH + 8}px`;
  }, [shown?.text, resting, phase]);

  return <aside className="ox-buddy" aria-label="Ox" ref={box} data-busy={phase !== 'idle'}>
    {shown && <div className="ox-bubble" id="ox-says" ref={bubble} role={phase === 'idle' ? undefined : 'status'} data-voice={phase}>
      {shown.text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
      {voice && (phase === 'answer' || phase === 'error') ? <p className="ox-bubble-actions">
        {voice.answered && <a href="#ask" onClick={voice.dismiss}>Open in Ask</a>}
        {voice.browser && <a href={location.origin} target="_blank" rel="noreferrer" onClick={voice.dismiss}>Open in browser</a>}
        <button className="text-button" onClick={voice.dismiss}>Close</button>
      </p> : phase === 'idle' && <p className="ox-bubble-actions">{shown.href && shown.cta && <a href={shown.href} target={shown.href.startsWith('#') ? undefined : '_blank'} rel="noreferrer">{shown.cta}</a>}<a href="#ask">Ask Ox</a></p>}
    </div>}
    <div className="ox-rotor" ref={rotor}>
      <button className="ox-button" onClick={() => speak()} aria-label="Ox. Tap to hear what matters now" aria-describedby={shown ? 'ox-says' : undefined}>
        <Ox size={SIZE} mood={face} talk={face === 'talking' ? speaking.level : undefined} />
      </button>
    </div>
  </aside>;
}
