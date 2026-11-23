import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { clock, type Activity, type PanelSize, type Prefs, type Profile, type Hud, type HudPanel, type Widget, type WidgetType } from '../api';
import { useSpeaking } from '../speech';
import { useHome } from './House';
import { ParticleOrb, type OrbState } from './ParticleOrb';
import type { Mood } from './Taurus';
import { CenterFace, CenterLine, centerLabel, useLiveMusic, useTick, type Center } from './TaurusWidget';
import { BackgroundMenu, Choice, TextSize, useBackgroundMenu } from './Popup';
import { ProfileMenu } from './Shell';
import type { Voice } from './Voice';
import { catalog, ConfigFields, WidgetView, type Ctx } from './widgets';

// Hud (owner, November 5, 2026: "a rlly cool cloud looking jarvis dashboard where taurus is in the center with clouds
// surrounding him some nice liquid glass panels in on the side ... call it some cool name not jarvis tho ... make this
// new one the main one thats their default and make it so u can customize what u see and customize the size"). Hud
// is the bull in the sky: volumetric clouds drifting at three depths, Taurus in the middle inside a slowly turning ring and
// a ring of his own clouds, the day under him, and any of the board's widgets in liquid glass on either side. The
// clouds lean away from the cursor and part while Taurus listens or talks. Customize picks the panels, their size, side
// and order, the clouds and Taurus's size, and whether Taurus opens here or on the board.

export const hudDefaults = (): Hud => ({
  panels: [
    { id: 't-needs', type: 'needs', size: 'medium', side: 'left', title: 'Priority' },
    { id: 't-todo', type: 'todo', size: 'medium', side: 'left' },
    { id: 't-health', type: 'health', size: 'medium', side: 'right' },
    { id: 't-schedule', type: 'schedule', size: 'medium', side: 'right', title: 'Up next' },
    { id: 't-house', type: 'house', size: 'small', side: 'right' },
  ],
  clouds: 'calm', taurusSize: 'medium', chips: true, facts: true, start: 'hud',
});

// ---------- The sky ----------

// November 19, 2026: the sky is the HUD's backdrop now (styles/hud.css), a faint grid under a slow radar sweep.
// "Clouds" in Customize still sets how much it moves: calm, lively, or still.

export function Sky({ parted, clouds = 'calm' }: { parted: number; clouds?: Hud['clouds'] }) {
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
  return <div className="sky hud-sky hud-page-sky" ref={ref} aria-hidden="true" data-clouds={clouds} style={{ '--part': parted.toFixed(3) } as CSSProperties}>
    <div className="hud-grid" />
    <div className="hud-sweep" />
    <div className="hud-scan" />
    <div className="hud-vignette" />
  </div>;
}

// How far the clouds part: a little while Taurus thinks, more while he listens, with his voice while he talks.
export function useParted(voice: Voice) {
  const speaking = useSpeaking();
  const phase = voice.view.phase;
  return phase === 'listening' ? 1 : speaking.active ? 0.5 + speaking.level * 0.5 : phase === 'thinking' ? 0.4 : 0;
}

// ---------- Panels ----------

const sizeNames: Record<PanelSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
const configurable = new Set<WidgetType>(['clock', 'stocks', 'chart', 'news', 'trend', 'note', 'ai']);
// What a panel can be: the House, or any of the board's widgets except the board's own summary line.
const choices: { type: HudPanel['type']; name: string; about: string }[] = [
  { type: 'house', name: 'House', about: 'Lights on, and your scenes, one tap each.' },
  ...(Object.keys(catalog) as WidgetType[]).filter(t => t !== 'brief').map(t => ({ type: t, name: catalog[t].name, about: catalog[t].about })),
];
const nameOf = (p: HudPanel) => p.title ?? (p.type === 'house' ? 'House' : catalog[p.type].name);
const asWidget = (p: HudPanel): Widget => ({ id: p.id, type: p.type as WidgetType, size: p.size === 'small' ? 'small' : p.size === 'large' ? 'tall' : 'medium', ...(p.title ? { title: p.title } : {}), ...(p.config ? { config: p.config } : {}) });
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
  p: HudPanel; i: number; ctx: Ctx; editing: boolean; first: boolean; last: boolean; dragging: boolean;
  change: (next: HudPanel) => void; remove: () => void; move: (by: -1 | 1) => void; swap: () => void;
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

// The rail's "Customize" asks Hud to open its editing mode.
export const customizeHud = () => window.dispatchEvent(new Event('taurus:customize'));

interface Props {
  ctx: Ctx; voice: Voice; profile: Profile;
  // Taurus's disc as a widget: what to show, putting him back, and closing the window it came from.
  center: Center | null; onBack: (key: string) => void; closeWin: (id: string) => void; onLanguage?: (code: string) => void;
  // What Taurus is doing, live (/api/activity/stream), for the HUD's log under the orb.
  log?: Activity[];
}

// The HUD's ring: 120 ticks, every tenth a long one.
const TICKS = Array.from({ length: 120 }, (_, i) => {
  const a = (i / 120) * Math.PI * 2, major = i % 10 === 0, r1 = major ? 182 : 188, r2 = 196;
  return { major, x1: 200 + Math.cos(a) * r1, y1: 200 + Math.sin(a) * r1, x2: 200 + Math.cos(a) * r2, y2: 200 + Math.sin(a) * r2 };
});
const logKinds: Record<Activity['kind'], string> = { read: 'read', ai: 'think', tool: 'tool', browser: 'web', action: 'act', ring: 'ring', feed: 'watch', voice: 'voice', home: 'home', mac: 'mac' };
const logTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const two = (n: number) => String(n).padStart(2, '0');

export function CloudDashboard({ ctx, voice, profile, center, onBack, closeWin, onLanguage, log = [] }: Props) {
  const { data, now, prefs, setPrefs } = ctx;
  const t = prefs.hud ?? hudDefaults();
  const speaking = useSpeaking();
  const parted = useParted(voice);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<'left' | 'right' | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const menu = useBackgroundMenu();
  const [menuAdd, setMenuAdd] = useState(false);
  const phase = voice.view.phase;
  const mood: Mood = phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : phase === 'error' ? 'confused' : speaking.active ? 'talking' : 'idle';
  // The orb is the Taurus sign at rest and a ball whenever he listens, thinks or talks.
  const orb: OrbState = mood === 'listening' ? 'listen' : mood === 'thinking' ? 'think' : mood === 'talking' ? 'talk' : 'rest';
  const mode = mood === 'listening' ? 'Listening' : mood === 'thinking' ? 'Thinking' : mood === 'talking' ? 'Speaking' : mood === 'confused' ? 'Error' : 'Standby';
  const secs = useTick(1000, true);
  // The disc counts down every second while it shows a clock.
  const tick = useTick(1000, Boolean(center));
  const live = useLiveMusic(center?.kind === 'music' ? center.music : null);
  useEffect(() => {
    const open = () => { setEditing(true); setAdding(null); };
    window.addEventListener('taurus:customize', open);
    return () => window.removeEventListener('taurus:customize', open);
  }, []);
  useEffect(() => {
    if (!editing) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setEditing(false); setAdding(null); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [editing]);

  const setT = (fn: (t: Hud) => Hud) => setPrefs((p: Prefs) => ({ ...p, hud: fn(p.hud ?? hudDefaults()) }));
  const setPanels = (fn: (list: HudPanel[]) => HudPanel[]) => setT(x => ({ ...x, panels: fn(x.panels) }));
  const change = (next: HudPanel) => setPanels(list => list.map(p => p.id === next.id ? next : p));
  const remove = (id: string) => setPanels(list => list.filter(p => p.id !== id));
  // Moves within its own side: swaps with the neighbour above or below on that side.
  const move = (id: string, by: -1 | 1) => setPanels(list => {
    const p = list.find(x => x.id === id)!; const side = list.filter(x => x.side === p.side);
    const other = side[side.indexOf(p) + by]; if (!other) return list;
    const a = list.indexOf(p), b = list.indexOf(other); const out = [...list]; [out[a], out[b]] = [out[b], out[a]]; return out;
  });
  const swap = (id: string) => setPanels(list => { const p = list.find(x => x.id === id)!; return [...list.filter(x => x.id !== id), { ...p, side: p.side === 'left' ? 'right' : 'left' }]; });
  // Dragging over another panel puts the dragged one in its place, on its side.
  const dragOnto = (target: HudPanel) => {
    if (!dragId || dragId === target.id) return;
    setPanels(list => { const p = list.find(x => x.id === dragId); if (!p) return list; const rest = list.filter(x => x.id !== dragId); const at = rest.findIndex(x => x.id === target.id); rest.splice(at, 0, { ...p, side: target.side }); return rest; });
  };
  const dragToSide = (side: 'left' | 'right') => (e: DragEvent) => {
    if (!dragId || (e.target as HTMLElement).closest('.cloud-panel')) return;
    e.preventDefault();
    setPanels(list => { const p = list.find(x => x.id === dragId); return p && p.side !== side ? [...list.filter(x => x.id !== dragId), { ...p, side }] : list; });
  };
  const add = (type: HudPanel['type'], side: 'left' | 'right') => {
    const fresh: HudPanel = { id: newId(), type, size: 'medium', side, ...(type !== 'house' && catalog[type].config ? { config: catalog[type].config } : {}) };
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
  // He is Taurus while he listens and thinks; otherwise he can be the widget.
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

  const shown = new Date(secs);
  const needs = data?.needs.length;
  const body = data?.body.recovery !== undefined ? `${data.body.recovery}%` : data?.body.readiness !== undefined ? `${data.body.readiness}%` : '--';
  const lines = log.filter(e => e.kind !== 'feed').slice(-5);

  return <main id="main" tabIndex={-1} className={`cloud-dash hud-page ${editing ? 'is-editing' : ''} ${dragId ? 'is-dragging' : ''}`} data-phase={phase} data-taurus={t.taurusSize} data-widget={widget?.kind}
    style={{ '--part': parted.toFixed(3) } as CSSProperties} {...menu.handlers}>
    {column('left')}

    <section className="cloud-center" aria-label="Taurus">
      <div className="cloud-top">
        <p className="hud-status"><span className="hud-dot" aria-hidden="true" /><span className="hud-name">Taurus</span><span>{mode}</span></p>
        <ProfileMenu profile={profile} onLanguage={onLanguage} />
      </div>
      <p className="hud-clock" aria-label={`It is ${clock(shown.toISOString())}`}>{two(shown.getHours())}:{two(shown.getMinutes())}<small>{two(shown.getSeconds())}</small></p>
      <p className="hud-date">{today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
      <h1 className="cloud-hello">{hello(hour)}{name ? `, ${name.split(' ')[0]}` : ''}.</h1>
      <div className="cloud-core">
        <svg className="hud-ring" viewBox="0 0 400 400" aria-hidden="true">
          <g className="ticks">{TICKS.map((k, i) => <line key={i} className={`tick${k.major ? ' major' : ''}`} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} />)}</g>
          <circle className="hr-edge" cx="200" cy="200" r="199" />
          <circle className="hr-arc-a" cx="200" cy="200" r="174" />
          <circle className="hr-arc-b" cx="200" cy="200" r="164" />
          <circle className="hr-inner" cx="200" cy="200" r="150" />
        </svg>
        <p className={`hud-readout nw${needs ? ' signal' : ''}`}><span>Needs you</span><strong>{needs === undefined ? '--' : two(needs)}</strong></p>
        <p className="hud-readout ne"><span>Next</span><strong>{next ? clock(next.start) : 'Clear'}</strong></p>
        <p className="hud-readout sw"><span>Body</span><strong>{body}</strong></p>
        <p className="hud-readout se"><span>Mode</span><strong>{mode}</strong></p>
        <ParticleOrb state={orb} level={speaking.level} />
        <button type="button" className="cloud-taurus" data-taurus-center aria-pressed={phase === 'listening'} aria-label={phase === 'listening' ? 'Taurus is listening. Tap to stop' : 'Talk to Taurus'}
          aria-describedby={widget ? 'cloud-widget-name' : undefined} {...voice.talkButton}>
        </button>
        {/* The widget sits over the button, letting taps through to it, so tapping still talks to Taurus. */}
        {widget && <div className="cw-layer" aria-hidden="true"><CenterFace key={widget.key} center={widget} data={data} music={live.music} now={tick} /></div>}
        {widget && <span id="cloud-widget-name" className="sr-only">{centerLabel(widget)}</span>}
      </div>
      {/* Same id as the roaming Taurus's bubble (never shown on Hud), so the desktop app's checks find his words here. */}
      {said && <p className="cloud-said" id="taurus-says" aria-live="polite">{said}
        {phase === 'error' && voice.view.browser && <> <a href={location.origin} target="_blank" rel="noreferrer" onClick={voice.view.dismiss}>Open in browser</a></>}</p>}
      {(phase === 'answer' || phase === 'error') && <button type="button" className="text-button cloud-dismiss" onClick={voice.view.dismiss}>Done</button>}
      {widget && <CenterLine center={widget} data={data} live={live} back={() => onBack(widget.key)} closeWin={closeWin} />}

      {editing ? <section className="card cloud-panel cloud-settings" aria-labelledby="hud-settings">
        <div className="card-head"><h2 id="hud-settings">HUD</h2><button type="button" className="primary cloud-edit" onClick={() => { setEditing(false); setAdding(null); }}>Done</button></div>
        <div className="card-body">
          <fieldset><legend>Backdrop</legend>
            {(['calm', 'lively', 'off'] as const).map(c => <label key={c} className="check"><input type="radio" name="t-clouds" checked={t.clouds === c} onChange={() => setT(x => ({ ...x, clouds: c }))} />{c === 'calm' ? 'Slow sweep' : c === 'lively' ? 'Fast sweep' : 'Still'}</label>)}
          </fieldset>
          <fieldset><legend>Orb size</legend>
            {(Object.keys(sizeNames) as PanelSize[]).map(s => <label key={s} className="check"><input type="radio" name="t-taurus" checked={t.taurusSize === s} onChange={() => setT(x => ({ ...x, taurusSize: s }))} />{sizeNames[s]}</label>)}
          </fieldset>
          <fieldset><legend>Under Taurus</legend>
            <label className="check"><input type="checkbox" checked={t.facts} onChange={e => setT(x => ({ ...x, facts: e.target.checked }))} />Today in one line</label>
          </fieldset>
          <p className="cloud-settings-note">Drag panels to move them. Double-click or right-click the background for more. <button type="button" className="text-button" onClick={() => setT(() => ({ ...hudDefaults(), start: t.start }))}>Reset HUD</button></p>
        </div>
      </section> : !widget && t.facts && facts.length > 0 && <p className="cloud-facts">{facts.join('  ·  ')}</p>}
      {!editing && <ol className="hud-log" aria-label="What Taurus is doing">
        {lines.length ? lines.map(e => <li key={e.id} className={e.state}>
          <time dateTime={e.at}>{logTime(e.at)}</time><span className="kind">{logKinds[e.kind]}</span><span className="text">{e.text}</span>
        </li>) : <li className="empty">All quiet.</li>}
      </ol>}
    </section>

    {column('right')}

    {menu.at && <BackgroundMenu at={menu.at} onClose={closeMenu} label="HUD options">
      {menuAdd ? <>
        <div className="bg-menu-head"><p>Add a panel on the {menuSide}</p><button type="button" className="text-button" onClick={() => setMenuAdd(false)}>Back</button></div>
        <ul className="bg-menu-list">{choices.map(c => <li key={c.type}><button type="button" onClick={() => { add(c.type, menuSide); closeMenu(); }}>{c.name}</button></li>)}</ul>
      </> : <>
        <div className="bg-menu-actions">
          <button type="button" onClick={() => setMenuAdd(true)}>Add a panel</button>
          <button type="button" onClick={() => { setEditing(true); closeMenu(); }}>Customize</button>
        </div>
        <TextSize prefs={prefs} setPrefs={setPrefs} />
        <Choice label="Backdrop" value={t.clouds} options={[['calm', 'Slow'], ['lively', 'Fast'], ['off', 'Still']]} onChange={c => setT(x => ({ ...x, clouds: c }))} />
        <Choice label="Orb size" value={t.taurusSize} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} onChange={s => setT(x => ({ ...x, taurusSize: s }))} />
        <Choice label="Today line" value={t.facts ? 'on' : 'off'} options={[['on', 'Show'], ['off', 'Hide']]} onChange={v => setT(x => ({ ...x, facts: v === 'on' }))} />
      </>}
    </BackgroundMenu>}
  </main>;
}
