import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { clock, type Activity, type Background, type Board, type BrowserState, type Dashboard, type OxWindow, type Prefs, type Profile, type Tint } from '../api';
import { Logo } from './Logo';
import { Ox } from './Ox';
import type { DockTab } from './Live';

// November 2, 2026 (owner: "why is there like titles over tabs ... that js makes the little profile icon on the top right
// useless"): the rail is where you go (your tabs, then what Ox does, split by a rule, no titles); the profile menu at
// the top right is you and your setup (settings, connections, phone, standby).
// The shell (owner, November 1, 2026: "have tabs on the left side ... put a little profile icon in the top right
// corner ... make so u can make the background anything"). A left rail of tabs (a drawer on the phone), a top bar
// that greets you and shows what Ox is doing, your profile at the top right, and whatever background you chose.

export const daypart = (hour: number) => hour < 5 ? 'night' : hour < 9 ? 'dawn' : hour < 17 ? 'day' : hour < 21 ? 'dusk' : 'night';
export function greeting(now: number, name: string) {
  const h = new Date(now).getHours();
  const hello = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late';
  return name ? `${hello}, ${name.split(/\s+/)[0]}` : hello;
}

// Which mark stands for OXBOT on your screen (owner, November 6, 2026: "make it so u can also choose what icon u want like
// the ox mascot or the O X letter logo and what color u want just simple black white, or certain colors").
export const brandColors: [string, string][] = [['white', '#FFFFFF'], ['black', '#0B0B0C'], ['silver', '#C9CDD4'], ['sky', '#7FB4FF'], ['ember', '#FF8A4C'], ['moss', '#7BC88F'], ['gold', '#E8C26A'], ['rose', '#FF7A9C']];
export const brandStyle = (p: Pick<Profile, 'iconColor'>): CSSProperties | undefined => {
  const hex = brandColors.find(([k]) => k === p.iconColor)?.[1];
  return hex && p.iconColor !== 'white' ? { color: hex } : undefined;
};
export function BrandMark({ profile, height = 20 }: { profile: Pick<Profile, 'icon'>; height?: number }) {
  return profile.icon === 'mascot' ? <Ox size={height * 1.15} label="OXBOT" /> : <Logo height={height} />;
}

export const initials = (name: string) => name.replace(/<[^>]*>|\(.*?\)/g, '').trim().split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';

export function Avatar({ name, photo, size = 34 }: { name: string; photo?: string; size?: number }) {
  return <span className="avatar" style={{ '--size': `${size}px` } as CSSProperties} aria-hidden="true">
    {photo ? <img src={photo} alt="" /> : name ? initials(name) : 'You'}
  </span>;
}

interface RailProps {
  boards: Board[]; current?: string; page: string; dock: DockTab | null; setDock: (t: DockTab | null) => void; open: boolean; onClose: () => void;
  // Home is the view picked in Settings, Personalize: Taurus (the dashboard) or the first board's tiles (owner,
  // November 19, 2026: "make it just in settings either tile view or dashboard view and then home becomes that").
  home: string; homeIsTaurus: boolean; onCustomize: () => void; doing: Doing[]; brand: Profile;
}

// Quick access to what Ox is doing right now (owner, November 5, 2026: "on the left side tab u can also see current
// tasks its doing or tabs it has open, just quick access, or like spotify if its doing something on that").
export interface Doing { id: string; text: string; go: () => void; extra?: { label: string; run: () => void } }

export function nowDoing({ entries, browser, wins, now, setDock, music }: { entries: Activity[]; browser: BrowserState | null; wins: OxWindow[]; now: number; setDock: (t: DockTab) => void; music: (what: string) => void }): Doing[] {
  const out: Doing[] = [];
  for (const e of [...entries].reverse().filter(x => x.state === 'running' && now - Date.parse(x.at) < 90_000).slice(0, 3)) out.push({ id: `a${e.id}`, text: e.text, go: () => setDock('activity') });
  for (const w of wins) {
    if (w.kind === 'timer' && !w.done) { const m = Math.max(1, Math.round((Date.parse(w.timer.endsAt) - Math.max(now, Date.now())) / 60_000)); out.push({ id: w.id, text: `${w.timer.focus ? 'Focus' : w.timer.label}: ${m} min left`, go: () => { location.hash = 'taurus'; } }); }
    if (w.kind === 'music' && w.music.track && !w.music.setup) out.push({ id: w.id, text: `Spotify: ${w.music.track.title}, ${w.music.track.artist}`, go: () => { location.hash = 'taurus'; }, extra: w.music.embed ? undefined : { label: w.music.playing ? 'Pause' : 'Play', run: () => music(w.music.playing ? 'pause' : 'resume') } });
  }
  if (browser?.open) { let where = browser.title || browser.url || 'a page'; try { if (!browser.title && browser.url) where = new URL(browser.url).host; } catch { /* keep the raw address */ } out.push({ id: 'browser', text: `Browser: ${where}`, go: () => setDock('browser') }); }
  return out;
}

export function Rail({ boards, current, page, dock, setDock, open, onClose, home, homeIsTaurus, onCustomize, doing, brand }: RailProps) {
  const toggle = (t: DockTab) => { setDock(dock === t ? null : t); onClose(); };
  return <>
    {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}
    <nav className={`rail ${open ? 'open' : ''}`} aria-label="Main" id="rail">
      <div className="rail-panel">
        <a className="brand" href={home} onClick={onClose} style={brandStyle(brand)}><BrandMark profile={brand} height={20} /></a>
        <ul className="rail-list" aria-label="Tabs">
          <li><a href={home} aria-current={(homeIsTaurus ? page === 'taurus' : current === boards[0]?.id) ? 'page' : undefined} onClick={onClose}>Home</a></li>
          {boards.slice(1).map(b => <li key={b.id}><a href={`#b/${b.id}`} aria-current={current === b.id ? 'page' : undefined} onClick={onClose}>{b.name}</a></li>)}
        </ul>
        <ul className="rail-list rail-ox" aria-label="Ox">
          <li><a href="#ask" aria-current={page === 'ask' ? 'page' : undefined} onClick={onClose}>Ask Ox</a></li>
          <li><a href="#house" aria-current={page === 'house' ? 'page' : undefined} onClick={onClose}>House</a></li>
          <li><a href="#brain" aria-current={page === 'brain' ? 'page' : undefined} onClick={onClose}>Brain</a></li>
          <li><a href="#profinder" aria-current={page === 'profinder' ? 'page' : undefined} onClick={onClose}>ProFinder</a></li>
          <li><button type="button" aria-pressed={dock === 'browser'} onClick={() => toggle('browser')}>Browser</button></li>
          <li><button type="button" aria-pressed={dock === 'activity'} onClick={() => toggle('activity')}>Activity</button></li>
        </ul>
        {doing.length > 0 && <ul className="rail-list rail-now" aria-label="What Ox is doing now">
          {doing.map(d => <li key={d.id} className="rail-doing">
            <button type="button" onClick={() => { d.go(); onClose(); }} title={d.text}><span className="rail-doing-text">{d.text}</span></button>
            {d.extra && <button type="button" className="rail-doing-extra" onClick={d.extra.run}>{d.extra.label}</button>}
          </li>)}
        </ul>}
        <ul className="rail-list rail-foot" aria-label="Settings">
          {page === 'taurus' && <li><button type="button" onClick={() => { onCustomize(); onClose(); }}>Customize</button></li>}
          <li><a href="#settings" aria-current={page === 'settings' ? 'page' : undefined} onClick={onClose}>Settings</a></li>
        </ul>
      </div>
    </nav>
  </>;
}

// The profile menu (owner, November 6, 2026: "make the clicking ur profile pic just says settings, and language, and that
// kinda simple stuff not just all the setting tabs, and seperate ur profile from settings").
export const languages: [string, string][] = [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'],
  ['nl', 'Nederlands'], ['hi', 'हिन्दी'], ['ta', 'தமிழ்'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어'], ['ar', 'العربية'], ['ru', 'Русский'], ['tr', 'Türkçe']];

export function ProfileMenu({ profile, onLanguage }: { profile: Profile; onLanguage?: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [langs, setLangs] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Any move to another page closes it, however the page changed.
  useEffect(() => { const close = () => setOpen(false); window.addEventListener('hashchange', close); return () => window.removeEventListener('hashchange', close); }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const lang = languages.find(([k]) => k === (profile.language ?? 'en'))?.[1] ?? 'English';
  return <div className="profile" ref={box}>
    <button type="button" className="profile-button" aria-expanded={open} aria-controls="profile-menu" onClick={() => { setOpen(o => !o); setLangs(false); }}>
      <Avatar name={profile.name} photo={profile.photo} /><span className="sr-only">Profile and settings</span>
    </button>
    {open && <div className="profile-menu" id="profile-menu">
      <a className="profile-who" href="#profile" onClick={() => setOpen(false)}>
        <Avatar name={profile.name} photo={profile.photo} size={44} />
        <div><p className="strong">{profile.name || 'Your profile'}</p><p className="muted">{profile.email || 'Name, email and photo'}</p></div>
      </a>
      {langs ? <ul className="profile-langs" aria-label="Language">
        {languages.map(([code, name]) => <li key={code}><button type="button" aria-pressed={(profile.language ?? 'en') === code} onClick={() => { onLanguage?.(code); setLangs(false); }}>{name}</button></li>)}
      </ul> : <ul aria-label="Menu">
        <li><a href="#profile" onClick={() => setOpen(false)}>Profile</a></li>
        <li><a href="#settings" onClick={() => setOpen(false)}>Settings</a></li>
        {onLanguage && <li><button type="button" className="profile-row" onClick={() => setLangs(true)}><span>Language</span><span className="muted">{lang}</span></button></li>}
        <li><a href="#ring" onClick={() => setOpen(false)}>Standby clock</a></li>
      </ul>}
    </div>}
  </div>;
}

// The one plain line at the top right, where the status pill was (owner, November 5, 2026: "remove the 'checked two
// apps just now' status bar thing, just make that like the nothing needs u part or the late night part").
export function dayLine(data: Dashboard | null, now: number) {
  if (!data) return '';
  const h = new Date(now).getHours();
  if (h >= 22 || h < 5) {
    const first = data.schedule.find(e => !e.allDay && Date.parse(e.start) > now);
    if (!first) return 'It’s late. Nothing early tomorrow.';
    return new Date(first.start).toDateString() === new Date(now).toDateString() ? `It’s late. ${first.title} at ${clock(first.start)}.` : `It’s late. Tomorrow starts with ${first.title}.`;
  }
  return data.needs.length ? `${data.needs.length} ${data.needs.length === 1 ? 'thing needs' : 'things need'} you` : 'Nothing needs you';
}

interface TopProps { profile: Profile; now: number; line: string; onTabs: () => void; tabsOpen: boolean; onLanguage?: (code: string) => void }

export function TopBar({ profile, now, line, onTabs, tabsOpen, onLanguage }: TopProps) {
  const date = new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const time = new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return <header className="topbar">
    <button type="button" className="tabs-button" aria-expanded={tabsOpen} aria-controls="rail" onClick={onTabs} style={brandStyle(profile)}><BrandMark profile={profile} height={18} /><span className="sr-only">Tabs</span></button>
    <div className="hello">
      <p className="hello-line">{profile.greet ? greeting(now, profile.name) : date}</p>
      <p className="hello-date">{profile.greet ? `${date} · ${time}` : time}</p>
    </div>
    {line && <p className="top-line">{line}</p>}
    <ProfileMenu profile={profile} onLanguage={onLanguage} />
  </header>;
}

// People in view: who is waiting on you and who you meant to catch up with, so the board has faces on it.
interface Face { name: string; why: string; ask: string }
const cleanName = (s: string) => s.replace(/<[^>]*>/g, '').replace(/["']/g, '').trim();

export function people(data: Dashboard | null, prefs: Prefs, now: number): Face[] {
  const faces: Face[] = [];
  const seen = new Set<string>();
  const add = (f: Face) => { const k = f.name.toLowerCase(); if (f.name && !seen.has(k)) { seen.add(k); faces.push(f); } };
  for (const n of data?.needs ?? []) {
    const name = cleanName(n.who ?? n.from ?? '');
    if (name) add({ name, why: n.title, ask: `What does ${name} need from me?` });
  }
  for (const p of prefs.people) {
    const due = p.everyDays && (!p.last || now - Date.parse(p.last) > p.everyDays * 86_400_000);
    if (due) add({ name: p.name, why: p.last ? `Last talked ${Math.round((now - Date.parse(p.last)) / 86_400_000)} days ago` : 'Time to catch up', ask: `Draft a short check-in to ${p.name}.` });
  }
  return faces.slice(0, 8);
}

export function PeopleStrip({ data, prefs, now, onAsk }: { data: Dashboard | null; prefs: Prefs; now: number; onAsk: (q: string) => void }) {
  const faces = people(data, prefs, now);
  if (!data) return null;
  return <section className="people-strip" aria-label="People">
    {faces.length === 0 ? <p className="muted">Nobody is waiting on you right now.</p> : <ul>
      {faces.map((f, i) => <li key={f.name} style={{ '--i': i } as CSSProperties}>
        <button type="button" onClick={() => onAsk(f.ask)} title={f.ask}>
          <Avatar name={f.name} size={36} />
          <span className="face-text"><span className="face-name">{f.name}</span><span className="face-why">{f.why}</span></span>
        </button>
      </li>)}
    </ul>}
  </section>;
}

export function Backdrop({ background, tint }: { background: Background; tint: Tint }) {
  const media = background.kind === 'image' && background.file ? `/api/background?v=${background.file}` : background.kind === 'link' ? background.url : undefined;
  const style = { '--dim': background.dim / 100, '--blur': `${background.blur}px`, ...(background.kind === 'color' ? { backgroundColor: background.color } : {}) } as CSSProperties;
  return <div className={`backdrop kind-${background.kind}`} data-tint={tint} style={style} aria-hidden="true">
    {background.kind === 'field' && <><span /><span /><span /></>}
    {media && (background.kind === 'image' && background.video
      ? <video className="backdrop-media" src={media} autoPlay muted loop playsInline />
      : <div className="backdrop-media" style={{ backgroundImage: `url("${media.replace(/"/g, '%22')}")` }} />)}
    <div className="backdrop-dim" />
    <div className="backdrop-light" />
  </div>;
}
