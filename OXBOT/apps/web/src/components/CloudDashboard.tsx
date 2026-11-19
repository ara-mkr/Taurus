import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { clock, type PanelSize, type Prefs, type Profile, type Taurus, type TaurusPanel, type Widget, type WidgetType } from '../api';
import { useSpeaking } from '../speech';
import { useHome } from './House';
import { Ox, type Mood } from './Ox';
import { CenterFace, CenterLine, centerLabel, useLiveMusic, useTick, type Center } from './OxWidget';
import { BackgroundMenu, Choice, TextSize, useBackgroundMenu } from './Popup';
import { ProfileMenu } from './Shell';
import type { Voice } from './Voice';
import { catalog, ConfigFields, WidgetView, type Ctx } from './widgets';

// Taurus (owner, November 5, 2026: "a rlly cool cloud looking jarvis dashboard where ox is in the center with clouds
// surrounding him some nice liquid glass panels in on the side ... call it some cool name not jarvis tho ... make this
// new one the main one thats their default and make it so u can customize what u see and customize the size"). Taurus
// is the bull in the sky: volumetric clouds drifting at three depths, Ox in the middle inside a slowly turning ring and
// a ring of his own clouds, the day under him, and any of the board's widgets in liquid glass on either side. The
// clouds lean away from the cursor and part while Ox listens or talks. Customize picks the panels, their size, side
// and order, the clouds and Ox's size, and whether OXBOT opens here or on the board.

export const taurusDefaults = (): Taurus => ({
  panels: [
    { id: 't-needs', type: 'needs', size: 'medium', side: 'left', title: 'Priority' },
    { id: 't-todo', type: 'todo', size: 'medium', side: 'left' },
    { id: 't-health', type: 'health', size: 'medium', side: 'right' },
    { id: 't-schedule', type: 'schedule', size: 'medium', side: 'right', title: 'Up next' },
    { id: 't-house', type: 'house', size: 'small', side: 'right' },
  ],
  clouds: 'calm', oxSize: 'medium', chips: true, facts: true, start: 'taurus',
});

// ---------- The sky ----------

// Each cloud: where it sits (percent of the sky), how wide (vw), how deep (0 far, 2 near), its noise seed, how long one
// drift takes, and where in that drift it starts.
interface Puff { x: number; y: number; w: number; depth: 0 | 1 | 2; seed: number; drift: number; delay: number }
const puffs: Puff[] = [
  { x: -8, y: 4, w: 46, depth: 0, seed: 3, drift: 140, delay: 0 },
  { x: 58, y: 0, w: 52, depth: 0, seed: 7, drift: 170, delay: -40 },
  { x: 24, y: 14, w: 34, depth: 0, seed: 11, drift: 150, delay: -90 },
  { x: -14, y: 52, w: 48, depth: 1, seed: 5, drift: 110, delay: -20 },
  { x: 70, y: 46, w: 46, depth: 1, seed: 13, drift: 120, delay: -60 },
  { x: 30, y: 72, w: 40, depth: 1, seed: 17, drift: 130, delay: -10 },
  { x: -22, y: 80, w: 62, depth: 2, seed: 19, drift: 90, delay: -30 },
  { x: 62, y: 82, w: 64, depth: 2, seed: 23, drift: 95, delay: -70 },
  { x: 6, y: 30, w: 26, depth: 2, seed: 29, drift: 100, delay: -50 },
  { x: 80, y: 22, w: 28, depth: 2, seed: 31, drift: 105, delay: -15 },
];

export function Sky({ parted, clouds = 'calm' }: { parted: number; clouds?: Taurus['clouds'] }) {
  const ref = useRef<HTMLDivElement>(null);
  // The clouds lean a little away from the pointer: three depths, three distances.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = ref.current; if (!el) return;
        el.style.setProperty('--px', ((e.clientX / innerWidth) - 0.5).toFixed(3));
        el.style.setProperty('--py', ((e.clientY / innerHeight) - 0.5).toFixed(3));
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(frame); };
  }, []);
  return <div className="sky" ref={ref} aria-hidden="true" data-clouds={clouds} style={{ '--part': parted.toFixed(3) } as CSSProperties}>
    <svg className="sky-defs" width="0" height="0">
      {/* Fractal noise pushes a soft blob's edge around until it reads as a cloud. One filter per seed, so no two match. */}
      {puffs.map(p => <filter key={p.seed} id={`cloud-${p.seed}`} x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed={p.seed} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="140" xChannelSelector="R" yChannelSelector="G" result="shape" />
        <feGaussianBlur in="shape" stdDeviation="7" />
      </filter>)}
    </svg>
    <div className="sky-glow" />
    <div className="sky-stars" />
    {clouds !== 'off' && ([0, 1, 2] as const).map(depth => <div key={depth} className={`sky-layer depth-${depth}`}>
      {puffs.filter(p => p.depth === depth).map(p => <div key={p.seed} className={`cloud ${p.x + p.w / 2 < 50 ? 'on-left' : 'on-right'}`}
        style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}vw`, '--drift': `${clouds === 'lively' ? Math.round(p.drift * 0.35) : p.drift}s`, '--delay': `${p.delay}s` } as CSSProperties}>
        <span style={{ filter: `url(#cloud-${p.seed})` }} />
      </div>)}
    </div>)}
    <div className="sky-haze" />
  </div>;
}

// How far the clouds part: a little while Ox thinks, more while he listens, with his voice while he talks.
export function useParted(voice: Voice) {
  const speaking = useSpeaking();
  const phase = voice.view.phase;
  return phase === 'listening' ? 1 : speaking.active ? 0.5 + speaking.level * 0.5 : phase === 'thinking' ? 0.4 : 0;
}

// ---------- Panels ----------

const sizeNames: Record<PanelSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
const oxPx: Record<PanelSize, number> = { small: 80, medium: 100, large: 124 };
const configurable = new Set<WidgetType>(['clock', 'stocks', 'chart', 'news', 'trend', 'note', 'ai']);
// What a panel can be: the House, or any of the board's widgets except the board's own summary line.
const choices: { type: TaurusPanel['type']; name: string; about: string }[] = [
  { type: 'house', name: 'House', about: 'Lights on, and your scenes, one tap each.' },
  ...(Object.keys(catalog) as WidgetType[]).filter(t => t !== 'brief').map(t => ({ type: t, name: catalog[t].name, about: catalog[t].about })),
];
const nameOf = (p: TaurusPanel) => p.title ?? (p.type === 'house' ? 'House' : catalog[p.type].name);
const asWidget = (p: TaurusPanel): Widget => ({ id: p.id, type: p.type as WidgetType, size: p.size === 'small' ? 'small' : p.size === 'large' ? 'tall' : 'medium', ...(p.title ? { title: p.title } : {}), ...(p.config ? { config: p.config } : {}) });
const newId = () => `t-${crypto.randomUUID().slice(0, 6)}`;
// A drag starts anywhere on a panel except its controls, fields and charts, which keep working as usual.
const grabbable = (e: ReactPointerEvent<HTMLElement>) => { e.currentTarget.draggable = !(e.target as HTMLElement).closest('button, a, input, textarea, select, label, svg, [contenteditable]'); };

function HousePanel({ title }: { title: string }) {
  const { home, send } = useHome();
  const lights = home?.devices.filter(d => d.kind === 'light') ?? [];
  const lit = lights.filter(d => d.on).length;
  return <>
    <div className="card-head"><h2>{title}</h2>{home?.sample && <span className="source">Sample</span>}</div>
    <div className="card-body">
      <p className="cloud-house-line">{home ? (lit ? `${lit} of ${lights.length} lights on` : 'All lights off') : 'Looking around.'}</p>
      <div className="cloud-house-actions">
        {lights.length > 0 && <button type="button" onClick={() => void send(lights.map(d => d.id), { on: lit === 0 })}>{lit ? 'Lights off' : 'Lights on'}</button>}
        {home?.scenes.slice(0, 3).map(s => <button key={s.id} type="button" onClick={() => void send([s.id], { activate: true })}>{s.name}</button>)}
        <a className="text-button" href="#house">All rooms</a>
      </div>
    </div>
  </>;
}

interface PanelProps {
  p: TaurusPanel; i: number; ctx: Ctx; editing: boolean; first: boolean; last: boolean; dragging: boolean;
  change: (next: TaurusPanel) => void; remove: () => void; move: (by: -1 | 1) => void; swap: () => void;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void;
}
function Panel({ p, i, ctx, editing, first, last, dragging, change, remove, move, swap, onDragStart, onDragEnter, onDragEnd }: PanelProps) {
  const [settings, setSettings] = useState(false);
  const name = nameOf(p);
  // A panel whose content runs longer than its share of the column scrolls inside; keyboard users can reach it too.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return;
    // Writes only on a change: this runs after every render, and each write made the page restyle.
    const check = () => el.querySelectorAll<HTMLElement>('.card-body').forEach(b => {
      const scrolls = b.scrollHeight > b.clientHeight + 1;
      if (scrolls && b.getAttribute('tabindex') !== '0') b.tabIndex = 0;
      else if (!scrolls && b.hasAttribute('tabindex')) b.removeAttribute('tabindex');
    });
    const watch = new ResizeObserver(check);
    watch.observe(el); el.querySelectorAll('.card-body').forEach(b => watch.observe(b));
    check();
    return () => watch.disconnect();
  });
  // Drag a panel by any quiet part of it, editing or not (owner: "make it so u can simply drag widgets around").
  return <article ref={ref} className={`card cloud-panel type-${p.type} ${dragging ? 'dragging' : ''}`} data-size={p.size} aria-label={name} style={{ '--i': i } as CSSProperties}
    draggable onPointerDown={grabbable} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); onDragStart(); }}
    onDragEnter={onDragEnter} onDragOver={e => e.preventDefault()} onDragEnd={onDragEnd} onDrop={e => { e.preventDefault(); onDragEnd(); }}>
    {editing && <div className="panel-tools" role="group" aria-label={`Arrange ${name}`}>
      <div className="panel-sizes" role="radiogroup" aria-label={`${name} size`}>
        {(Object.keys(sizeNames) as PanelSize[]).map(s => <button key={s} type="button" role="radio" aria-checked={p.size === s} onClick={() => change({ ...p, size: s })}>{sizeNames[s]}</button>)}
      </div>
      <div className="panel-moves">
        <button type="button" onClick={() => move(-1)} disabled={first} aria-label={`Move ${name} up`}>Up</button>
        <button type="button" onClick={() => move(1)} disabled={last} aria-label={`Move ${name} down`}>Down</button>
        <button type="button" onClick={swap} aria-label={`Move ${name} to ${p.side === 'left' ? 'right' : 'left'}`}>{p.side === 'left' ? 'To right' : 'To left'}</button>
        <button type="button" aria-expanded={settings} onClick={() => setSettings(s => !s)}>Edit</button>
        <button type="button" className="panel-remove" onClick={remove} aria-label={`Remove ${name}`}>Remove</button>
      </div>
      {settings && <div className="panel-settings">
        <label>Name<input type="text" defaultValue={p.title ?? ''} placeholder={p.type === 'house' ? 'House' : catalog[p.type].name} maxLength={60} onBlur={e => change({ ...p, title: e.target.value.trim() || undefined })} /></label>
        {p.type !== 'house' && configurable.has(p.type) && <ConfigFields widget={asWidget(p)} onChange={config => change({ ...p, config })} />}
      </div>}
    </div>}
    <div className="card-content" inert={editing}>
      {p.type === 'house' ? <HousePanel title={name} /> : <WidgetView widget={asWidget(p)} ctx={ctx} update={config => change({ ...p, config })} />}
    </div>
  </article>;
}

// ---------- The page ----------

const hello = (h: number) => h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Late night';
const span = (ms: number) => { const m = Math.max(1, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };

// The rail's "Customize" asks Taurus to open its editing mode.
export const customizeTaurus = () => window.dispatchEvent(new Event('oxbot:customize'));

interface Props {
  ctx: Ctx; voice: Voice; profile: Profile;
  // Ox's disc as a widget: what to show, putting him back, and closing the window it came from.
  center: Center | null; onBack: (key: string) => void; closeWin: (id: string) => void; onLanguage?: (code: string) => void;
}

export function CloudDashboard({ ctx, voice, profile, center, onBack, closeWin, onLanguage }: Props) {
  const { data, now, prefs, setPrefs } = ctx;
  const t = prefs.taurus ?? taurusDefaults();
  const speaking = useSpeaking();
  const parted = useParted(voice);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'left' | 'right' | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const menu = useBackgroundMenu();
  const [menuAdd, setMenuAdd] = useState(false);
  const phase = voice.view.phase;
  const mood: Mood = phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : phase === 'error' ? 'confused' : speaking.active ? 'talking' : 'idle';
  // The disc counts down every second while it shows a clock.
  const tick = useTick(1000, Boolean(center));
  const live = useLiveMusic(center?.kind === 'music' ? center.music : null);
  useEffect(() => {
    const open = () => { setEditing(true); setAdding(null); };
    window.addEventListener('oxbot:customize', open);
    return () => window.removeEventListener('oxbot:customize', open);
  }, []);
  useEffect(() => {
    if (!editing) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setEditing(false); setAdding(null); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [editing]);

  const setT = (fn: (t: Taurus) => Taurus) => setPrefs((p: Prefs) => ({ ...p, taurus: fn(p.taurus ?? taurusDefaults()) }));
  const setPanels = (fn: (list: TaurusPanel[]) => TaurusPanel[]) => setT(x => ({ ...x, panels: fn(x.panels) }));
  const change = (next: TaurusPanel) => setPanels(list => list.map(p => p.id === next.id ? next : p));
  const remove = (id: string) => setPanels(list => list.filter(p => p.id !== id));
  // Moves within its own side: swaps with the neighbour above or below on that side.
  const move = (id: string, by: -1 | 1) => setPanels(list => {
    const p = list.find(x => x.id === id)!; const side = list.filter(x => x.side === p.side);
    const other = side[side.indexOf(p) + by]; if (!other) return list;
    const a = list.indexOf(p), b = list.indexOf(other); const out = [...list]; [out[a], out[b]] = [out[b], out[a]]; return out;
  });
  const swap = (id: string) => setPanels(list => { const p = list.find(x => x.id === id)!; return [...list.filter(x => x.id !== id), { ...p, side: p.side === 'left' ? 'right' : 'left' }]; });
  // Dragging over another panel puts the dragged one in its place, on its side.
  const dragOnto = (target: TaurusPanel) => {
    if (!dragId || dragId === target.id) return;
    setPanels(list => { const p = list.find(x => x.id === dragId); if (!p) return list; const rest = list.filter(x => x.id !== dragId); const at = rest.findIndex(x => x.id === target.id); rest.splice(at, 0, { ...p, side: target.side }); return rest; });
  };
  const dragToSide = (side: 'left' | 'right') => (e: DragEvent) => {
    if (!dragId || (e.target as HTMLElement).closest('.cloud-panel')) return;
    e.preventDefault();
    setPanels(list => { const p = list.find(x => x.id === dragId); return p && p.side !== side ? [...list.filter(x => x.id !== dragId), { ...p, side }] : list; });
  };
  const add = (type: TaurusPanel['type'], side: 'left' | 'right') => {
    const fresh: TaurusPanel = { id: newId(), type, size: 'medium', side, ...(type !== 'house' && catalog[type].config ? { config: catalog[type].config } : {}) };
    setPanels(list => [...list, fresh]); setAdding(null);
    requestAnimationFrame(() => document.querySelector(`[aria-label="${nameOf(fresh)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  const today = new Date(now);
  const hour = today.getHours();
  const next = useMemo(() => data?.schedule.find(e => !e.allDay && Date.parse(e.end) > now), [data, now]);
  // Today in one line. Late at night it says how tomorrow starts instead of counting hours.
  const late = hour >= 22 || hour < 5;
  const facts = [
    data ? (data.needs.length ? `${data.needs.length} ${data.needs.length === 1 ? 'thing needs' : 'things need'} you` : 'Nothing needs you') : '',
    next ? (Date.parse(next.start) <= now ? `${next.title}, now` : new Date(next.start).toDateString() === today.toDateString() ? `${next.title} in ${span(Date.parse(next.start) - now)}` : `${late ? 'Tomorrow starts with ' : ''}${next.title}${late ? ` at ${clock(next.start)}` : `, tomorrow ${clock(next.start)}`}`) : '',
    data?.body.recovery !== undefined ? `Recovery ${data.body.recovery}%` : data?.body.readiness !== undefined ? `Readiness ${data.body.readiness}%` : '',
  ].filter(Boolean);
  const said = phase === 'listening' ? (voice.view.text || 'Listening.') : phase === 'thinking' ? `“${voice.view.text}”` : phase === 'idle' ? '' : voice.view.text;
  // He is Ox while he listens and thinks; otherwise he can be the widget.
  const widget = center && phase !== 'listening' && phase !== 'thinking' ? center : null;
  const name = profile.name;
  const menuSide: 'left' | 'right' = menu.at && menu.at.x > innerWidth / 2 + 120 ? 'right' : 'left';
  const closeMenu = () => { menu.close(); setMenuAdd(false); };

  const column = (side: 'left' | 'right') => {
    const list = t.panels.filter(p => p.side === side);
    return <div className={`cloud-side cloud-${side}`} onDragOver={dragToSide(side)} onDrop={e => { e.preventDefault(); setDragId(null); }}>
      {list.map((p, i) => <Panel key={p.id} p={p} i={i + (side === 'right' ? 2 : 0)} ctx={ctx} editing={editing} first={i === 0} last={i === list.length - 1} dragging={dragId === p.id}
        change={change} remove={() => remove(p.id)} move={by => move(p.id, by)} swap={() => swap(p.id)}
        onDragStart={() => setDragId(p.id)} onDragEnter={() => dragOnto(p)} onDragEnd={() => setDragId(null)} />)}
      {editing && (adding === side
        ? <div className="card cloud-panel cloud-add" role="dialog" aria-label={`Add a panel on the ${side}`}>
          <div className="cloud-add-head"><h2>Add a panel</h2><button type="button" className="text-button" onClick={() => setAdding(null)}>Cancel</button></div>
          <ul>{choices.map(c => <li key={c.type}><button type="button" onClick={() => add(c.type, side)}><strong>{c.name}</strong><span>{c.about}</span></button></li>)}</ul>
        </div>
        : <button type="button" className="cloud-add-button" onClick={() => setAdding(side)}>Add a panel</button>)}
      {list.length === 0 && adding !== side && <p className="cloud-empty-side">{editing ? 'Drag a panel here.' : ''}</p>}
    </div>;
  };

  return <main id="main" tabIndex={-1} className={`cloud-dash ${editing ? 'is-editing' : ''} ${dragId ? 'is-dragging' : ''}`} data-phase={phase} data-ox={t.oxSize} data-widget={widget?.kind}
    style={{ '--part': parted.toFixed(3) } as CSSProperties} {...menu.handlers}>
    {column('left')}

    <section className="cloud-center" aria-label="Ox">
      <div className="cloud-top">
        <p className="cloud-time"><span>{today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span><span>{clock(today.toISOString())}</span></p>
        <ProfileMenu profile={profile} onLanguage={onLanguage} />
      </div>
      <h1 className="cloud-hello">{hello(hour)}{name ? `, ${name.split(' ')[0]}` : ''}.</h1>
      <div className="cloud-core">
        <svg className="cloud-ring" viewBox="0 0 400 400" aria-hidden="true">
          <circle className="ring-a" cx="200" cy="200" r="190" />
          <circle className="ring-b" cx="200" cy="200" r="172" />
          <circle className="ring-c" cx="200" cy="200" r="154" />
        </svg>
        {/* A ring of small clouds hugs Ox and drifts back when he listens or talks. */}
        {t.clouds !== 'off' && <div className="core-clouds" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map(i => <span key={i} className="core-cloud" style={{ '--a': `${i * 51.4 + 12}deg`, '--s': (0.75 + (i % 3) * 0.2).toFixed(2), '--t': `${7 + (i % 4) * 1.7}s` } as CSSProperties}>
            <span style={{ filter: `url(#cloud-${puffs[i].seed})` }} />
          </span>)}
        </div>}
        <span className="cloud-pulse" style={{ '--level': speaking.level.toFixed(3) } as CSSProperties} aria-hidden="true" />
        <button type="button" className="cloud-ox" data-ox-center aria-pressed={phase === 'listening'} aria-label={phase === 'listening' ? 'Ox is listening. Tap to stop' : 'Talk to Ox'}
          aria-describedby={widget ? 'cloud-widget-name' : undefined} {...voice.talkButton}>
          {!widget && <Ox size={oxPx[t.oxSize]} mood={mood} talk={mood === 'talking' ? speaking.level : undefined} gaze nod={phase === 'thinking' ? voice.view.text : undefined} />}
        </button>
        {/* The widget sits over the button, letting taps through to it, so tapping still talks to Ox. */}
        {widget && <div className="cw-layer" aria-hidden="true"><CenterFace key={widget.key} center={widget} data={data} music={live.music} now={tick} /></div>}
        {widget && <span id="cloud-widget-name" className="sr-only">{centerLabel(widget)}</span>}
      </div>
      {/* Same id as the roaming Ox's bubble (never shown on Taurus), so the desktop app's checks find his words here. */}
      {said && <p className="cloud-said" id="ox-says" aria-live="polite">{said}
        {phase === 'error' && voice.view.browser && <> <a href={location.origin} target="_blank" rel="noreferrer" onClick={voice.view.dismiss}>Open in browser</a></>}</p>}
      {(phase === 'answer' || phase === 'error') && <button type="button" className="text-button cloud-dismiss" onClick={voice.view.dismiss}>Done</button>}
      {widget && <CenterLine center={widget} data={data} live={live} back={() => onBack(widget.key)} closeWin={closeWin} />}

      {editing ? <section className="card cloud-panel cloud-settings" aria-labelledby="taurus-settings">
        <div className="card-head"><h2 id="taurus-settings">Taurus</h2><button type="button" className="primary cloud-edit" onClick={() => { setEditing(false); setAdding(null); }}>Done</button></div>
        <div className="card-body">
          <fieldset><legend>Clouds</legend>
            {(['calm', 'lively', 'off'] as const).map(c => <label key={c} className="check"><input type="radio" name="t-clouds" checked={t.clouds === c} onChange={() => setT(x => ({ ...x, clouds: c }))} />{c === 'calm' ? 'Calm' : c === 'lively' ? 'Lively' : 'Clear sky'}</label>)}
          </fieldset>
          <fieldset><legend>Ox</legend>
            {(Object.keys(sizeNames) as PanelSize[]).map(s => <label key={s} className="check"><input type="radio" name="t-ox" checked={t.oxSize === s} onChange={() => setT(x => ({ ...x, oxSize: s }))} />{sizeNames[s]}</label>)}
          </fieldset>
          <fieldset><legend>Under Ox</legend>
            <label className="check"><input type="checkbox" checked={t.facts} onChange={e => setT(x => ({ ...x, facts: e.target.checked }))} />Today in one line</label>
          </fieldset>
          <fieldset><legend>OXBOT opens to</legend>
            <label className="check"><input type="radio" name="t-start" checked={t.start === 'taurus'} onChange={() => setT(x => ({ ...x, start: 'taurus' }))} />Taurus</label>
            <label className="check"><input type="radio" name="t-start" checked={t.start === 'board'} onChange={() => setT(x => ({ ...x, start: 'board' }))} />The board</label>
          </fieldset>
          <p className="cloud-settings-note">Drag panels to move them. Double-click or right-click the sky for more. <button type="button" className="text-button" onClick={() => setT(() => ({ ...taurusDefaults(), start: t.start }))}>Reset Taurus</button></p>
        </div>
      </section> : !widget && t.facts && facts.length > 0 && <p className="cloud-facts">{facts.join('  ·  ')}</p>}
    </section>

    {column('right')}

    {menu.at && <BackgroundMenu at={menu.at} onClose={closeMenu} label="Taurus options">
      {menuAdd ? <>
        <div className="bg-menu-head"><p>Add a panel on the {menuSide}</p><button type="button" className="text-button" onClick={() => setMenuAdd(false)}>Back</button></div>
        <ul className="bg-menu-list">{choices.map(c => <li key={c.type}><button type="button" onClick={() => { add(c.type, menuSide); closeMenu(); }}>{c.name}</button></li>)}</ul>
      </> : <>
        <div className="bg-menu-actions">
          <button type="button" onClick={() => setMenuAdd(true)}>Add a panel</button>
          <button type="button" onClick={() => { setEditing(true); closeMenu(); }}>Customize</button>
        </div>
        <TextSize prefs={prefs} setPrefs={setPrefs} />
        <Choice label="Clouds" value={t.clouds} options={[['calm', 'Calm'], ['lively', 'Lively'], ['off', 'Clear']]} onChange={c => setT(x => ({ ...x, clouds: c }))} />
        <Choice label="Ox size" value={t.oxSize} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} onChange={s => setT(x => ({ ...x, oxSize: s }))} />
        <Choice label="Today line" value={t.facts ? 'on' : 'off'} options={[['on', 'Show'], ['off', 'Hide']]} onChange={v => setT(x => ({ ...x, facts: v === 'on' }))} />
      </>}
    </BackgroundMenu>}
  </main>;
}
