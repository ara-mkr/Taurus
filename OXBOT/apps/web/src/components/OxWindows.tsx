import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { api, clock, type Memory, type MusicState, type OxWindow, type Reminder } from '../api';
import { chime } from './Ringing';
import { DeviceList } from './House';

// Ox windows (owner, November 4, 2026): "when u say ... hey ox play juice wrld on spotify it will pull up a simple
// liquid glass window up on the main dashboard with spotify playing so it shows that it did it". Every instant
// command (music, timers, reminders, focus, memory, opening apps) pops one in at the top right, on every screen.
// Each shows what Ox heard, what he did, and the one or two buttons that matter. Drag one by its top line.

export function useOxWindows() {
  const [wins, setWins] = useState<OxWindow[]>([]);
  useEffect(() => {
    const source = new EventSource('/api/ring/stream', { withCredentials: true });
    source.addEventListener('window', event => {
      const next = JSON.parse((event as MessageEvent).data) as OxWindow;
      setWins(all => [...all.filter(w => w.id !== next.id), next]);
    });
    source.addEventListener('window-closed', event => {
      const { id } = JSON.parse((event as MessageEvent).data) as { id: string };
      setWins(all => all.filter(w => w.id !== id));
    });
    return () => source.close();
  }, []);
  const drop = useCallback((id: string) => setWins(all => all.filter(w => w.id !== id)), []);
  return { wins, drop };
}

const two = (n: number) => String(n).padStart(2, '0');
export const countdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
};
const useNow = (every = 1000, on = true) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return; const t = window.setInterval(() => setNow(Date.now()), every); return () => window.clearInterval(t); }, [every, on]);
  return now;
};
const when = (iso: string, now: number) => {
  const d = new Date(iso), today = new Date(now).toDateString(), tomorrow = new Date(now + 86_400_000).toDateString();
  return d.toDateString() === today ? clock(iso) : d.toDateString() === tomorrow ? `Tomorrow ${clock(iso)}` : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${clock(iso)}`;
};
const notify = (title: string, body: string, tag: string) => {
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag });
};

// Windows that only confirm something close by themselves unless you're pointing at them.
const brief = (w: OxWindow) => w.kind === 'open' || w.kind === 'note' || w.kind === 'mac' || w.kind === 'home' || (w.kind === 'memory' && Boolean(w.added || w.removed));
// A link opens once, even when React mounts twice in development.
const opened = new Set<string>();

// On Taurus the window Ox is showing in his own place stays out of the corner (`hide`).
export function OxWindows({ wins, drop, hide }: ReturnType<typeof useOxWindows> & { hide?: string }) {
  const list = wins.filter(w => w.id !== hide);
  if (!list.length) return null;
  // Newest on top; at most four (two on a phone), the music window always kept.
  const max = innerWidth <= 700 ? 2 : 4;
  const shown = [...list].reverse().filter((w, i) => i < max || w.kind === 'music');
  return <section className="oxwins" aria-label="What Ox just did" aria-live="polite">
    {shown.map(w => <Win key={w.id} win={w} drop={drop} />)}
  </section>;
}

function Win({ win, drop }: { win: OxWindow; drop: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const hover = useRef(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => drop(win.id), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
    api.closeWindow(win.id).catch(() => undefined);
  }, [drop, win.id]);
  useEffect(() => {
    if (!brief(win)) return;
    let t = 0;
    const check = () => { if (hover.current) t = window.setTimeout(check, 1500); else close(); };
    t = window.setTimeout(check, 9000);
    return () => window.clearTimeout(t);
  }, [win, close]);

  const down = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a')) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current; if (!d) return;
    setOffset({ x: Math.max(-innerWidth + 120, Math.min(80, d.ox + e.clientX - d.x)), y: Math.max(-40, Math.min(innerHeight - 160, d.oy + e.clientY - d.y)) });
  };
  const up = () => { drag.current = null; };

  const urgent = (win.kind === 'timer' && win.done) || (win.kind === 'reminder' && win.due);
  return <article className={`oxwin oxwin-${win.kind} ${urgent ? 'urgent' : ''} ${leaving ? 'leaving' : ''}`} aria-label={label(win)} style={offset.x || offset.y ? { translate: `${offset.x}px ${offset.y}px` } : undefined}
    onPointerEnter={() => { hover.current = true; }} onPointerLeave={() => { hover.current = false; }} onFocus={() => { hover.current = true; }} onBlur={() => { hover.current = false; }}>
    {win.kind === 'music' && win.music.track?.art && <img className="oxwin-wash" src={win.music.track.art} alt="" aria-hidden="true" />}
    <header className="oxwin-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <p className="oxwin-said">{win.said ? `“${win.said.replace(/^["“]|["”]$/g, '')}”` : label(win)}</p>
      <button type="button" className="text-button oxwin-close" onClick={close} aria-label={`Close ${label(win)}`}>Close</button>
    </header>
    <div className="oxwin-body">
      {win.kind === 'music' && <Music key={win.at} music={win.music} />}
      {win.kind === 'timer' && <TimerWin win={win} close={close} />}
      {win.kind === 'reminder' && <ReminderWin reminder={win.reminder} close={close} />}
      {win.kind === 'reminders' && <Reminders list={win.reminders} />}
      {win.kind === 'memory' && <MemoryWin key={win.at} memories={win.memories} added={win.added} removed={win.removed} />}
      {win.kind === 'open' && <Open id={win.id} name={win.name} url={win.url} />}
      {win.kind === 'note' && <><h3 className="oxwin-title">{win.title}</h3><p className="oxwin-text">{win.text}</p></>}
      {win.kind === 'home' && <><h3 className="oxwin-title">{win.text}</h3><DeviceList key={win.at} devices={win.devices} sample={win.sample} /></>}
      {win.kind === 'mac' && <><p className="oxwin-kicker">This Mac</p><h3 className="oxwin-title">{win.title}</h3><p className="oxwin-text">{win.text}</p></>}
    </div>
  </article>;
}

function label(w: OxWindow) {
  switch (w.kind) {
    case 'music': return 'Spotify';
    case 'timer': return w.timer.focus ? 'Focus' : 'Timer';
    case 'reminder': return 'Reminder';
    case 'reminders': return 'Reminders';
    case 'memory': return 'Memory';
    case 'open': return w.name;
    case 'note': return w.title;
    case 'home': return 'House';
    case 'mac': return w.title;
  }
}

function Row({ children }: { children: ReactNode }) { return <div className="oxwin-actions">{children}</div>; }

// ---------- Music ----------

function Music({ music: start }: { music: MusicState }) {
  const [music, setMusic] = useState(start);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState('');
  const live = Boolean(music.track && !music.embed && !music.setup);
  const now = useNow(1000, live && music.playing);
  // Spotify is the truth: read it again every few seconds while the window is open.
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => { if (!document.hidden) api.music().then(m => setMusic(old => ({ ...m, context: old.context }))).catch(() => undefined); }, 8000);
    return () => window.clearInterval(t);
  }, [live]);
  const press = async (what: string) => {
    setBusy(what); setProblem('');
    try { const r = await api.musicControl(what); setMusic(old => ({ ...r.music, context: old.context })); } catch (e) { setProblem((e as Error).message); } finally { setBusy(''); }
  };

  if (music.setup) return <>
    <h3 className="oxwin-title">{music.context ? `Play ${music.context.name}` : 'Spotify'}</h3>
    <p className="oxwin-text">{music.problem}</p>
    <Row>
      <a className="button primary" href="#actions">Set up Spotify</a>
      {music.context?.url && <a className="button" href={music.context.url} target="_blank" rel="noreferrer">Open in Spotify</a>}
    </Row>
  </>;
  if (music.embed) return <>
    <h3 className="oxwin-title">{music.context?.name ?? 'Spotify'}</h3>
    <p className="oxwin-text">{music.problem}</p>
    <iframe className="oxwin-embed" title={`Spotify player: ${music.context?.name ?? 'music'}`} src={music.embed} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
  </>;
  if (!music.track) return <><h3 className="oxwin-title">Nothing playing</h3><p className="oxwin-text">{music.problem ?? 'Say “play” and an artist, song or playlist.'}</p></>;

  const t = music.track;
  const elapsed = Math.min(t.durationMs, music.progressMs + (music.playing ? Math.max(0, now - Date.parse(music.at)) : 0));
  // The artist is already on the line above, so an artist station shows the album instead.
  const from = music.context && music.context.kind !== 'track' && music.context.name !== t.artist ? music.context.name : t.album;
  return <>
    <div className="oxwin-track">
      {t.art ? <img className="oxwin-art" src={t.art} alt={`${t.album ?? t.title} cover`} width={76} height={76} /> : <span className="oxwin-art" aria-hidden="true" />}
      <div className="oxwin-track-text">
        <h3 className="oxwin-title">{t.title}</h3>
        <p className="oxwin-artist">{t.artist}</p>
        <p className="oxwin-from">{[from, music.device && `on ${music.device}`].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
    <div className="oxwin-progress" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={Math.round(t.durationMs / 1000)} aria-valuenow={Math.round(elapsed / 1000)}>
      <span style={{ width: `${t.durationMs ? (elapsed / t.durationMs) * 100 : 0}%` }} />
    </div>
    <p className="oxwin-times"><span>{countdown(elapsed)}</span><span>{countdown(t.durationMs)}</span></p>
    <Row>
      <button type="button" onClick={() => press('previous')} disabled={Boolean(busy)}>Back</button>
      <button type="button" className="primary" onClick={() => press(music.playing ? 'pause' : 'resume')} disabled={Boolean(busy)} aria-pressed={music.playing}>{music.playing ? 'Pause' : 'Play'}</button>
      <button type="button" onClick={() => press('next')} disabled={Boolean(busy)}>Skip</button>
      {t.url && <a className="text-button oxwin-link" href={t.url} target="_blank" rel="noreferrer">Spotify</a>}
    </Row>
    {problem && <p className="oxwin-problem" role="alert">{problem}</p>}
  </>;
}

// ---------- Timers and reminders ----------

// Chimes when it goes off and every few seconds after, for a minute or until you close it.
export function useChime(on: boolean, title: string, body: string, tag: string) {
  useEffect(() => {
    if (!on) return;
    chime(); notify(title, body, tag);
    navigator.vibrate?.([200, 100, 200]);
    let n = 0;
    const t = window.setInterval(() => { if (++n > 12) { window.clearInterval(t); return; } chime(); }, 5000);
    return () => window.clearInterval(t);
  }, [on, title, body, tag]);
}

function TimerWin({ win, close }: { win: Extract<OxWindow, { kind: 'timer' }>; close: () => void }) {
  const { timer, done } = win;
  const now = useNow(250, !done);
  const left = Date.parse(timer.endsAt) - now;
  const total = timer.minutes * 60_000 || 1;
  useChime(Boolean(done), timer.focus ? 'Focus block done' : `${timer.label}: done`, 'OXBOT timer', timer.id);
  if (done) return <>
    <h3 className="oxwin-title oxwin-alert">{timer.focus ? 'Focus block done' : 'Time’s up'}</h3>
    <p className="oxwin-text">{timer.focus ? 'Nice work. VIP mail rings again.' : timer.label}</p>
    <Row><button type="button" className="primary" onClick={close}>Stop</button></Row>
  </>;
  return <>
    <h3 className="oxwin-title">{timer.focus ? 'Locked in' : timer.label}</h3>
    <p className="oxwin-count">{countdown(left)}</p>
    <div className="oxwin-progress" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, 100 - (left / total) * 100))}%` }} /></div>
    <p className="oxwin-times"><span>{timer.focus ? 'VIP mail waits; meetings still ring' : 'Ends'}</span><span>{clock(timer.endsAt)}</span></p>
    <Row><button type="button" onClick={() => api.cancelTimer(timer.id).catch(() => undefined)}>{timer.focus ? 'End focus' : 'Cancel'}</button></Row>
  </>;
}

function ReminderWin({ reminder, close }: { reminder: Reminder; close: () => void }) {
  useChime(true, 'Reminder', reminder.text, reminder.id);
  const snooze = (m: number) => api.snooze(reminder.id, m).catch(() => undefined);
  return <>
    <h3 className="oxwin-title big">{reminder.text}</h3>
    <Row>
      <button type="button" className="primary" onClick={() => { api.reminderDone(reminder.id).catch(() => undefined); close(); }}>Done</button>
      <button type="button" onClick={() => snooze(10)}>In 10 minutes</button>
      <button type="button" onClick={() => snooze(60)}>In an hour</button>
    </Row>
  </>;
}

const repeatWords = { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Every week' } as const;
function Reminders({ list }: { list: Reminder[] }) {
  const now = useNow(30_000);
  if (!list.length) return <><h3 className="oxwin-title">No reminders</h3><p className="oxwin-text">Say “remind me at 6 to call Mom”.</p></>;
  return <>
    <h3 className="oxwin-title">Coming up</h3>
    <ul className="oxwin-list">
      {list.slice(0, 8).map(r => <li key={r.id}>
        <span className="oxwin-when">{r.repeat ? `${repeatWords[r.repeat]}, ${clock(r.dueAt)}` : when(r.dueAt, now)}</span>
        <span className="oxwin-what">{r.text}</span>
        <button type="button" className="text-button" onClick={() => api.cancelReminder(r.id).catch(() => undefined)} aria-label={`Cancel reminder: ${r.text}`}>Cancel</button>
      </li>)}
    </ul>
  </>;
}

// ---------- Memory and opening things ----------

function MemoryWin({ memories, added, removed }: { memories: Memory[]; added?: string; removed?: string }) {
  const [list, setList] = useState(memories);
  if (added) return <><p className="oxwin-kicker">Remembered</p><h3 className="oxwin-title">{added}</h3><p className="oxwin-text">{list.length === 1 ? 'The first thing I know about you.' : `${list.length} things I know about you. Ask “what do you know about me” to see them.`}</p></>;
  if (removed) return <><p className="oxwin-kicker">Forgotten</p><h3 className="oxwin-title">{removed}</h3></>;
  if (!list.length) return <><h3 className="oxwin-title">Nothing yet</h3><p className="oxwin-text">Say “remember that I take my coffee black”. I use what you tell me in every answer.</p></>;
  return <>
    <h3 className="oxwin-title">What I know about you</h3>
    <ul className="oxwin-list">
      {[...list].reverse().map(m => <li key={m.id}>
        <span className="oxwin-what">{m.text}</span>
        <button type="button" className="text-button" onClick={() => api.forget(m.id).then(r => setList(r.memories)).catch(() => undefined)} aria-label={`Forget: ${m.text}`}>Forget</button>
      </li>)}
    </ul>
  </>;
}

function Open({ id, name, url }: { id: string; name: string; url: string }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (opened.has(id)) return;
    opened.add(id);
    // Browsers block a tab that wasn't opened by a tap; then the button does it. (With "noopener" the browser
    // always returns null, so the opener is cut by hand instead.)
    const tab = window.open(url, '_blank');
    if (tab) tab.opener = null; else window.setTimeout(() => setBlocked(true));
  }, [id, url]);
  return <>
    <h3 className="oxwin-title">{blocked ? name : `Opened ${name}`}</h3>
    <p className="oxwin-text">{blocked ? 'Your browser held the new tab back. Tap to open it.' : new URL(url).host}</p>
    <Row><a className={`button ${blocked ? 'primary' : ''}`} href={url} target="_blank" rel="noreferrer">Open {name}</a></Row>
  </>;
}
