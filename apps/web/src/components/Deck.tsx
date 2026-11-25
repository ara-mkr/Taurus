import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { clock, type Activity, type Profile, type Widget, type WidgetType } from '../api';
import { stateNames, timeOf, useBots, type Bot } from '../bots';
import { useSpeaking } from '../speech';
import { hashOf, inkOn, Mascot } from './Mascot';
import type { Appearance, UiVersion } from './Settings';
import { ParticleOrb, type OrbState } from './ParticleOrb';
import { ProfileMenu } from './Shell';
import { CenterFace, CenterLine, centerLabel, useLiveMusic, useTick, type Center } from './TaurusWidget';
import type { Voice } from './Voice';
import { catalog, WidgetView, type Ctx } from './widgets';

// The Deck (owner, November 22, 2026: "rework the dashboard so its super clean like a professional ai startup software
// like light colored, cool pink blue pixelated accent like heavy inspo from the typesafe.ai website, simply on the left
// side is the same tabs, then on the right is your schedule or whatever is connected and u can choose, above it on the
// right is a lil window of what an agent is currently doing and theres right arrow and left arrow on the sides of it ...
// In the center u have the little taurus logo with what its currently doing like status updates, u have a lil type bar
// at the bottom ... either light mode or dark mode"). It replaces the Jarvis HUD as Home. The look borrows the reference's
// language, not its artwork or colours: a baby-blue sky dithered with pale and slate clouds, a little pink and orange specks,
// drawn once on a tiny canvas; hard square windows with slate title bars; monospace labels. Styles in styles/deck.css.
// Since November 23, 2026 the bots working for you sit in small boxes around Taurus (bots.ts keeps their history).

// ---------- The pixel sky ----------

// An 8x8 ordered-dither matrix: each pixel is either fully a colour or fully the page, which gives the halftone look.
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map(v => (v + 0.5) / 64);
// Clouds on both sides, open sky in the middle: x and y as a share of the canvas, r as a share of its width.
// Two banks of billows hugging the sides, open sky in the middle so Taurus's window sits in clear blue. x is a share of
// the width; y and r are shares of the height, so the clouds keep their shape however wide the column is.
// Baby blue leads (owner, November 23, 2026): the big banks are pale blue and slate; pink only tips a few small billows.
const CLOUDS: { x: number; y: number; r: number; c: 'pink' | 'violet' | 'rose' }[] = [
  { x: 0, y: 0.12, r: 0.42, c: 'rose' }, { x: 0.06, y: 0.5, r: 0.3, c: 'violet' }, { x: 0.15, y: 0.06, r: 0.2, c: 'pink' }, { x: 0.2, y: 0.32, r: 0.2, c: 'rose' }, { x: 0.02, y: 0.7, r: 0.2, c: 'violet' },
  { x: 1, y: 0.1, r: 0.42, c: 'rose' }, { x: 0.94, y: 0.46, r: 0.3, c: 'violet' }, { x: 0.85, y: 0.04, r: 0.18, c: 'pink' }, { x: 0.8, y: 0.3, r: 0.18, c: 'rose' }, { x: 0.98, y: 0.68, r: 0.2, c: 'violet' },
];
const hex = (s: string): [number, number, number] => { const m = /^#?([\da-f]{6})$/i.exec(s.trim()); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16, (n >> 8) & 255, n & 255]; };

function PixelSky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const S = 3; // one dither pixel per 3 screen pixels, scaled up crisp
    // The sky ends just under Taurus's window, so no text ever sits on its dots.
    const logo = () => canvas.parentElement?.querySelector<HTMLElement>('.deck-logo-win');
    const draw = () => {
      const win = logo();
      if (win) { const want = `${Math.round(win.offsetTop + win.offsetHeight * 0.75)}px`; if (canvas.style.height !== want) canvas.style.height = want; }
      const box = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.ceil(box.width / S)), h = Math.max(1, Math.ceil(box.height / S));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const css = getComputedStyle(canvas);
      const pal = { bg: hex(css.getPropertyValue('--px-bg')), sky: hex(css.getPropertyValue('--px-sky')), pink: hex(css.getPropertyValue('--px-pink')), violet: hex(css.getPropertyValue('--px-violet')), rose: hex(css.getPropertyValue('--px-rose')), spark: hex(css.getPropertyValue('--px-spark')) };
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const img = ctx.createImageData(w, h); const px = img.data;
      // On a narrow column the banks pull in to the edges, so the middle stays open sky.
      const narrow = Math.min(1, w / (h * 3));
      for (let y = 0; y < h; y++) {
        const fy = y / h;
        // Everything fades out towards the bottom, so the windows and text below sit on plain page.
        const fade = Math.max(0, Math.min(1, (1 - fy) * 1.5 - 0.15));
        const sky = Math.max(0, (0.9 - fy) * 1.6) * fade;
        for (let x = 0; x < w; x++) {
          const t = BAYER[(y & 7) * 8 + (x & 7)];
          // A little low-frequency wobble so cloud edges are lumpy, not circles.
          const wobble = (Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) + Math.sin(y * 0.13 + x * 0.035)) * 0.09;
          let best = 0, colour = pal.pink;
          for (const c of CLOUDS) {
            const dx = (x - c.x * w) / (c.r * h * 1.25 * narrow), dy = (y - c.y * h) / (c.r * h);
            const v = (1 - (dx * dx + dy * dy)) + wobble;
            if (v > best) { best = v; colour = pal[c.c]; }
          }
          const cloud = Math.min(1, best * 1.15) * fade;
          // A few orange specks in the clouds and sky (owner: "orange specs"), fixed in place by a hash, not random.
          const spark = (((x >> 1) * 73856093) ^ ((y >> 1) * 19349663)) >>> 0; // 2 x 2 blocks, so each reads as a speck
          const rgb = cloud > t * 0.6 && spark % 53 === 0 ? pal.spark : cloud > t ? colour : sky > t ? (spark % 41 === 0 ? pal.spark : pal.sky) : pal.bg;
          const i = (y * w + x) * 4;
          px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    let frame = 0;
    const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    later();
    // Redrawn only when its size or the theme changes: no animation, so an open Taurus costs nothing at rest.
    const size = new ResizeObserver(later); size.observe(canvas); if (canvas.parentElement) size.observe(canvas.parentElement);
    const theme = new MutationObserver(later); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const scheme = matchMedia('(prefers-color-scheme: dark)'); scheme.addEventListener('change', later);
    return () => { cancelAnimationFrame(frame); size.disconnect(); theme.disconnect(); scheme.removeEventListener('change', later); };
  }, []);
  return <canvas ref={ref} className="deck-sky" aria-hidden="true" />;
}

// ---------- Agents ----------

// Before the first bots arrive, Taurus is the one agent.
const alone: Bot = { id: 'taurus', name: 'Taurus', role: 'Chief of staff', colour: 'var(--ink)', state: 'idle', doing: 'Standing by.', live: true, lines: [] };

// The Agents window (owner, November 22: arrows to step through every agent; November 23: "when u click on it ... pulls
// up a chat box at the bottom with a screen or just text of its thoughts ... and u can expand it"). Which bot shows is
// chosen here or by clicking its box around Taurus; Thoughts opens the bot's latest lines; Expand opens it on the Bots page.
function Agents({ bots, picked, onPick, open, setOpen }: { bots: Bot[]; picked: string; onPick: (id: string) => void; open: boolean; setOpen: (o: boolean) => void }) {
  const n = bots.length, at = Math.max(0, bots.findIndex(b => b.id === picked)), a = bots[at];
  const go = (by: -1 | 1) => onPick(bots[(at + by + n) % n].id);
  const keys = (e: KeyboardEvent) => { if (n < 2 || (e.target as HTMLElement).closest('.deck-thoughts')) return; if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } };
  const feed = a.lines.slice(-8);
  return <section className="deck-win deck-agents" aria-roledescription="carousel" aria-label="Agents" onKeyDown={keys}>
    <header className="deck-bar"><h2>Agents</h2><span className="deck-count">{at + 1} / {n}</span></header>
    <div className="deck-agent-row">
      <button type="button" className="deck-arrow" onClick={() => go(-1)} disabled={n < 2} aria-label="Previous agent">←</button>
      <div className="deck-agent" role="group" aria-roledescription="slide" aria-label={`${a.name}, ${at + 1} of ${n}`} data-state={a.state}>
        <div className="deck-screen" data-empty={!a.frame || undefined}>
          {a.frame ? <img src={a.frame} alt={a.where ? `What ${a.name} sees on ${a.where}` : `What ${a.name} sees`} draggable={false} />
            : <p className="deck-screen-empty">{a.state === 'working' ? 'Working without a screen' : 'Nothing on screen'}</p>}
        </div>
        <p className="deck-agent-name">
          {a.id !== 'taurus' && <span className="deck-swatch" style={{ background: a.colour }} aria-hidden="true" />}
          <strong>{a.name}</strong>{a.where && <span className="deck-where">{a.where}</span>}
          <span className="deck-state">{stateNames[a.state]}</span>
        </p>
        <p className="deck-agent-doing" aria-live="polite">{a.doing}</p>
      </div>
      <button type="button" className="deck-arrow" onClick={() => go(1)} disabled={n < 2} aria-label="Next agent">→</button>
    </div>
    <div className="deck-thoughts-bar">
      <button type="button" className="deck-chip" aria-expanded={open} aria-controls="deck-thoughts" onClick={() => setOpen(!open)}>{open ? 'Hide thoughts' : 'Thoughts'}</button>
      <a className="deck-chip" href={`#bots/${encodeURIComponent(a.id)}`}>Expand</a>
    </div>
    {open && <ol id="deck-thoughts" className="deck-thoughts" aria-label={`What ${a.name} is thinking`} tabIndex={0}>
      {feed.length ? feed.map((l, i) => <li key={`${l.ref ?? i}-${i}`} data-kind={l.kind}><time dateTime={l.at}>{timeOf(l.at)}</time><span>{l.text}</span></li>)
        : <li className="deck-quiet">Nothing yet. Its thoughts show here as it works.</li>}
    </ol>}
  </section>;
}

// ---------- The bots around Taurus ----------

// The owner's "grokbot" boxes: one small square per bot working for you, up to 15, loosely bubbled around Taurus's window
// (owner, November 23, 2026: "kinda form a circle/bubble around it not like perfect circle ... not in a perfect grid").
// They share the way around the window, above and below too, each nudged and tilted a little. Five or fewer are big; up to ten, medium; more, small. Each wears its own little Taurus
// (Mascot.tsx) and a light: a pulse while it works, steady when done, red when it stopped. Clicking one shows it in the
// Agents window with its thoughts.
export const MAX_BOXES = 15;
const boxSize = (n: number) => n <= 5 ? 60 : n <= 10 ? 46 : 34;
// Each box gets its own share of the way around Taurus's window (owner, November 23, 2026: "nicely spaced out kinda uneven
// forming a bubble around it, it can also be above and below"), nudged a little in angle and in distance, then walks out
// from the window's middle along that angle until it clears the window, plus a small gap. All from the bot's id and its
// place in the list, so nothing jumps between renders.
function placed(bots: Bot[], win: { w: number; h: number }, size: number) {
  const spots = new Map<string, CSSProperties>();
  const step = 360 / Math.max(1, bots.length), start = -100;
  bots.forEach((b, i) => {
    const h = hashOf(b.id);
    const angle = (start + step * i + ((h % 100) / 100 - 0.5) * step * 0.45) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle), gap = 14 + ((h >>> 8) % 100) / 100 * 22;
    const reach = Math.min((win.w / 2 + size / 2 + gap) / Math.max(Math.abs(cos), 1e-3), (win.h / 2 + size / 2 + gap) / Math.max(Math.abs(sin), 1e-3));
    spots.set(b.id, { '--x': `${(cos * reach).toFixed(1)}px`, '--y': `${(sin * reach).toFixed(1)}px`, '--tilt': `${(((((h >>> 16) % 100) / 100) - 0.5) * 7).toFixed(1)}deg`,
      '--c': b.colour, color: inkOn(b.colour) } as CSSProperties);
  });
  return spots;
}

function BotRing({ bots, picked, onPick, children }: { bots: Bot[]; picked: string; onPick: (id: string) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState({ w: 234, h: 260 });
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.deck-logo-win');
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setWin(w => (w.w === el.offsetWidth && w.h === el.offsetHeight ? w : { w: el.offsetWidth, h: el.offsetHeight })));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const size = boxSize(bots.length), spots = placed(bots, win, size);
  return <div ref={ref} className="bot-ring" data-bots={bots.length} style={{ '--box': `${size}px` } as CSSProperties}
    role={bots.length ? 'group' : undefined} aria-label={bots.length ? `${bots.length} ${bots.length === 1 ? 'bot' : 'bots'} working` : undefined}>
    {children}
    {bots.map(b => <button key={b.id} type="button" className="bot-box" data-state={b.state} aria-pressed={picked === b.id} data-tile={b.id.startsWith('h-') ? b.id.slice(2) : undefined}
      title={`${b.name}: ${b.doing}`} style={spots.get(b.id)} onClick={() => onPick(b.id)}>
      <span className="sr-only">{b.name}, {stateNames[b.state]}: {b.doing}</span>
      {/* A swarm helper's cursor (Swarm.tsx) points into its own box here, as it did into the old Swarm panel's tiles. */}
      {b.id.startsWith('h-') && <span className="swarm-page bot-page" aria-hidden="true" />}
      <Mascot id={b.id} size={Math.round(size * 0.62)} />
      <span className="bot-light" aria-hidden="true" />
    </button>)}
  </div>;
}

// ---------- What you see on the right ----------

// The owner picks what fills the window under the agents; it is remembered on this device.
const panelChoices: WidgetType[] = ['schedule', 'needs', 'inbox', 'todo', 'focus', 'health', 'people', 'updates', 'news', 'stocks', 'clock', 'note'];
const read = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: the choice lasts this visit */ } };

// The window's own menu, square like the rest of the Deck (owner, November 23, 2026: the native select opened "a apple
// native ui type drop down make it hard and like our style"). A button and a listbox: arrows, Home and End move, Enter
// or a click picks, Esc or a click outside closes.
function Pick({ value, choices, label, onPick }: { value: WidgetType; choices: WidgetType[]; label: string; onPick: (t: WidgetType) => void }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(() => Math.max(0, choices.indexOf(value)));
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  useEffect(() => { list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' }); }, [at, open]);
  const choose = (i: number) => { onPick(choices[i]); setOpen(false); button.current?.focus(); };
  const keys = (e: KeyboardEvent) => {
    const last = choices.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(last, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setAt(0); }
    else if (e.key === 'End') { e.preventDefault(); setAt(last); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(at); }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); if (e.key === 'Escape') button.current?.focus(); }
  };
  return <div className="deck-pick" ref={box}>
    <button type="button" ref={button} className="deck-pick-button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${catalog[value].name}`}
      onClick={() => { setAt(Math.max(0, choices.indexOf(value))); setOpen(o => !o); }}
      onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(0, choices.indexOf(value))); setOpen(true); } }}>
      {catalog[value].name}<span className="deck-pick-caret" aria-hidden="true" />
    </button>
    {open && <ul className="deck-pick-list" role="listbox" ref={list} tabIndex={-1} aria-label={label} aria-activedescendant={`deck-pick-${choices[at]}`} onKeyDown={keys}>
      {choices.map((t, i) => <li key={t} id={`deck-pick-${t}`} role="option" data-i={i} aria-selected={t === value} data-active={i === at || undefined}
        onPointerMove={() => setAt(i)} onClick={() => choose(i)}>{catalog[t].name}</li>)}
    </ul>}
  </div>;
}

function Side({ ctx }: { ctx: Ctx }) {
  const [type, setType] = useState<WidgetType>(() => { const v = read<string>('taurus-deck-panel', 'schedule'); return (panelChoices as string[]).includes(v) ? v as WidgetType : 'schedule'; });
  const [configs, setConfigs] = useState<Partial<Record<WidgetType, Widget['config']>>>(() => read('taurus-deck-config', {}));
  const pick = (t: WidgetType) => { setType(t); write('taurus-deck-panel', t); };
  const widget: Widget = { id: `deck-${type}`, type, size: 'tall', config: configs[type] ?? catalog[type].config };
  return <section className="deck-win deck-side" aria-labelledby="deck-side-name">
    <header className="deck-bar">
      <span className="sr-only" id="deck-side-name">{catalog[type].name}</span>
      <Pick value={type} choices={panelChoices} label="What this window shows" onPick={pick} />
    </header>
    <div className="deck-side-body">
      <WidgetView widget={widget} ctx={ctx} update={config => setConfigs(c => { const next = { ...c, [type]: config }; write('taurus-deck-config', next); return next; })} />
    </div>
  </section>;
}

// ---------- The page ----------

const hello = (h: number) => h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late';
const kinds: Record<Activity['kind'], string> = { read: 'read', ai: 'think', tool: 'tool', browser: 'web', action: 'act', ring: 'ring', feed: 'watch', voice: 'voice', home: 'home', mac: 'mac' };
const at = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

interface Props {
  uiVersion: UiVersion; ctx: Ctx; voice: Voice; profile: Profile; log: Activity[];
  appearance: Appearance; setAppearance: (a: Appearance) => void; onLanguage?: (code: string) => void;
  // Taurus's window as a widget (a countdown, the weather, your recovery, what's playing): what to show, putting him back,
  // and closing the window it came from. Chosen in App by pickCenter, as on the old HUD.
  center: Center | null; onBack: (key: string) => void; closeWin: (id: string) => void;
}

export function Deck({ uiVersion, ctx, voice, profile, log, appearance, setAppearance, onLanguage, center, onBack, closeWin }: Props) {
  const { data, now } = ctx;
  const speaking = useSpeaking();
  const all = useBots();
  const bots = all.length ? all : [alone];
  // The boxes around Taurus: the bots working now, not Taurus himself, at most fifteen.
  const boxes = bots.filter(b => b.live && b.id !== 'taurus').slice(0, MAX_BOXES);
  const [picked, setPicked] = useState('taurus');
  const [thoughts, setThoughts] = useState(false);
  const pickBox = (id: string) => { setPicked(id); setThoughts(true); };
  const phase = voice.view.phase;
  const talking = speaking.active && phase !== 'listening' && phase !== 'thinking';
  const orb: OrbState = phase === 'listening' ? 'listen' : phase === 'thinking' ? 'think' : talking ? 'talk' : 'rest';
  const running = useMemo(() => [...log].reverse().find(e => e.state === 'running' && e.kind !== 'feed' && now - Date.parse(e.at) < 90_000), [log, now]);
  const first = profile.name ? profile.name.split(/\s+/)[0] : '';
  const today = new Date(now);
  const next = data?.schedule.find(e => !e.allDay && Date.parse(e.end) > now);
  const needs = data?.needs.length ?? 0;

  // The headline is what Taurus is doing this moment; with nothing going on it greets you.
  const mode = phase === 'listening' ? 'Listening' : phase === 'thinking' ? 'Thinking' : talking ? 'Speaking' : phase === 'error' ? 'Problem' : running ? 'Working' : 'Standing by';
  const headline = phase === 'listening' ? (voice.view.text || 'Listening.')
    : phase === 'thinking' ? `“${voice.view.text}”`
    : (phase === 'answer' || phase === 'error') && voice.view.text ? voice.view.text
    : running ? running.text : `${hello(today.getHours())}${first ? `, ${first}` : ''}.`;
  const facts = [
    data ? (needs ? `${needs} ${needs === 1 ? 'thing needs' : 'things need'} you` : 'Nothing needs you') : '',
    next ? (Date.parse(next.start) <= now ? `${next.title}, now` : `${next.title} at ${clock(next.start)}`) : '',
  ].filter(Boolean);
  const lines = log.filter(e => e.kind !== 'feed').slice(-6).reverse();
  // He is Taurus while he listens and thinks; otherwise his window can be the widget. Its clock ticks every second.
  const widget = center && phase !== 'listening' && phase !== 'thinking' ? center : null;
  const tick = useTick(1000, Boolean(widget));
  const live = useLiveMusic(widget?.kind === 'music' ? widget.music : null);
  const dark = appearance === 'dark' || (appearance === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);

  return <main id="main" tabIndex={-1} className="deck deck-look" data-phase={phase}>
    <section className="deck-center" aria-label="Taurus">
      {uiVersion === 'v1' && <PixelSky />}
      <div className="deck-top">
        <div className="deck-tools">
          <span className="deck-date">{today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {clock(today.toISOString())}</span>
          <div className="deck-theme" role="radiogroup" aria-label="Appearance">
            <button type="button" role="radio" aria-checked={!dark} onClick={() => setAppearance('light')}>Light</button>
            <button type="button" role="radio" aria-checked={dark} onClick={() => setAppearance('dark')}>Dark</button>
          </div>
          <ProfileMenu profile={profile} onLanguage={onLanguage} />
        </div>
      </div>

      <div className="deck-hero">
        <BotRing bots={boxes} picked={picked} onPick={pickBox}>
        <div className="deck-win deck-logo-win">
          <header className="deck-bar deck-identity"><h2>Taurus</h2><span className="deck-count" aria-live="polite">{mode}</span></header>
          <button type="button" className="deck-logo" data-taurus-center aria-pressed={phase === 'listening'} data-widget={widget?.kind}
            aria-label={phase === 'listening' ? 'Taurus is listening. Tap to stop' : 'Talk to Taurus'} aria-describedby={widget ? 'deck-widget-name' : undefined} {...voice.talkButton}>
            <ParticleOrb state={orb} level={speaking.level} />
          </button>
          {/* The widget sits over the button and lets taps through, so tapping still talks to Taurus. */}
          {widget && <div className="cw-layer deck-cw" aria-hidden="true"><CenterFace key={widget.key} center={widget} data={data} music={live.music} now={tick} /></div>}
          {widget && <span id="deck-widget-name" className="sr-only">{centerLabel(widget)}</span>}
        </div>
        </BotRing>
        <h1 className="deck-headline" id="taurus-says" aria-live="polite" data-kind={phase === 'idle' && running ? 'doing' : undefined}>{headline}</h1>
        {(phase === 'answer' || phase === 'error') && <button type="button" className="deck-chip" onClick={voice.view.dismiss}>Done</button>}
        {widget ? <CenterLine center={widget} data={data} live={live} back={() => onBack(widget.key)} closeWin={closeWin} />
          : uiVersion === 'v1' && phase === 'idle' && !running && facts.length > 0 && <p className="deck-facts">{facts.join('  ·  ')}</p>}
      </div>

      <section className="deck-win deck-status" aria-labelledby="deck-status-name">
        <header className="deck-bar"><h2 id="deck-status-name">Status</h2><span className="deck-count">{running ? 'Live' : 'Quiet'}</span></header>
        <ol className="deck-log" aria-label="What Taurus did last">
          {lines.length ? lines.map(e => <li key={e.id} data-state={e.state}>
            <time dateTime={e.at}>{at(e.at)}</time><span className="deck-kind">{kinds[e.kind]}</span><span className="deck-text">{e.text}</span>
          </li>) : <li className="deck-quiet">{uiVersion === 'v2' ? 'Nothing yet.' : 'Nothing yet. Every time Taurus reads, thinks, browses or acts, a line appears here.'}</li>}
        </ol>
      </section>
    </section>

    <aside className="deck-right" aria-label="Agents and your day">
      <Agents bots={bots} picked={picked} onPick={setPicked} open={thoughts} setOpen={setThoughts} />
      <Side ctx={ctx} />
    </aside>
  </main>;
}
