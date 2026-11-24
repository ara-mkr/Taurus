import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api, clock, type CalendarEvent, type Dashboard, type MusicState, type TaurusWindow, type Reminder, type Timer } from '../api';
import { Taurus } from './Taurus';
import { countdown, useChime } from './TaurusWindows';

// Taurus becomes the widget (owner, November 5, 2026: "make it so if u say let me lock in for 30 mins like the center where
// taurus is becomes a count down timer or something cool make him become interactive widgets when needed like if u say
// whats the weather his circle becomes a cloud with rain if its rainy or something with the temperature"). On Hud,
// Taurus's disc turns into what you just asked for, then turns back into Taurus:
// - a focus block or a timer: a countdown ring (from the instant command's window);
// - a timer going off or a reminder due: the alert, with its buttons;
// - "what's the weather": the sky in the disc, with rain, snow, sun or a storm, and the temperature;
// - "what's my recovery / heart rate / how did I sleep": a recovery ring with HRV, resting heart rate and sleep;
// - "what's next", or a meeting starting within ten minutes: a countdown to it, with Join;
// - Spotify playing: the record, turning, with the song's progress round the edge.
// While he listens or thinks he is Taurus again; "Back to Taurus" puts him back until the next thing.

export interface Asked { text: string; at: number }
type Intent = 'weather' | 'body' | 'meeting';

export function intentOf(text: string): Intent | null {
  const t = text.toLowerCase();
  if (/\b(weather|temperature|forecast|rain(ing|y)?|umbrella|snow(ing|y)?|how (hot|cold|warm)|jacket|sunny|degrees)\b/.test(t)) return 'weather';
  if (/\b(heart ?rate|hrv|recovery|recovered|resting hr|readiness|strain|sleep score|how did i sleep|how'?d i sleep|my sleep)\b/.test(t)) return 'body';
  if (/\b(next meeting|what'?s next|when'?s my next|next call|next event|my next)\b/.test(t)) return 'meeting';
  return null;
}

export type Center =
  | { kind: 'timer'; key: string; win: string; timer: Timer; done: boolean; more: number }
  | { kind: 'reminder'; key: string; win: string; reminder: Reminder }
  | { kind: 'music'; key: string; win: string; music: MusicState }
  | { kind: 'weather'; key: string }
  | { kind: 'body'; key: string }
  | { kind: 'meeting'; key: string; event: CalendarEvent };

const ASKED_FOR = 45_000;
const SOON = 10 * 60_000;
const winKey = (w: TaurusWindow) => `${w.id}@${w.at}`;
const nextEvent = (data: Dashboard | null, now: number) => data?.schedule.find(e => !e.allDay && Date.parse(e.end) > now);

// What Taurus shows in his place right now, most urgent first. Nothing means he is just Taurus.
export function pickCenter(wins: TaurusWindow[], asked: Asked | null, data: Dashboard | null, now: number, dismissed: Set<string>): Center | null {
  const open = wins.filter(w => !dismissed.has(winKey(w)));
  const due = open.find((w): w is Extract<TaurusWindow, { kind: 'reminder' }> => w.kind === 'reminder' && w.due);
  if (due) return { kind: 'reminder', key: winKey(due), win: due.id, reminder: due.reminder };
  const timers = open.filter((w): w is Extract<TaurusWindow, { kind: 'timer' }> => w.kind === 'timer')
    .sort((a, b) => Number(Boolean(b.done)) - Number(Boolean(a.done)) || Date.parse(a.timer.endsAt) - Date.parse(b.timer.endsAt));
  const ring = timers.find(t => t.done);
  if (ring) return { kind: 'timer', key: winKey(ring), win: ring.id, timer: ring.timer, done: true, more: timers.length - 1 };
  const intent = asked && now - asked.at < ASKED_FOR && !dismissed.has(`ask@${asked.at}`) ? intentOf(asked.text) : null;
  if (intent === 'weather' || intent === 'body') return { kind: intent, key: `ask@${asked!.at}` };
  const next = nextEvent(data, now);
  if (intent === 'meeting' && next) return { kind: 'meeting', key: `ask@${asked!.at}`, event: next };
  const running = timers.find(t => Date.parse(t.timer.endsAt) > now - 2000);
  if (running) return { kind: 'timer', key: winKey(running), win: running.id, timer: running.timer, done: false, more: timers.length - 1 };
  if (next && Date.parse(next.start) > now && Date.parse(next.start) - now <= SOON && !dismissed.has(`meet@${next.id}`)) return { kind: 'meeting', key: `meet@${next.id}`, event: next };
  const music = [...open].reverse().find((w): w is Extract<TaurusWindow, { kind: 'music' }> => w.kind === 'music' && Boolean(w.music.track) && !w.music.embed && !w.music.setup);
  if (music) return { kind: 'music', key: winKey(music), win: music.id, music: music.music };
  return null;
}

// ---------- Live pieces ----------

export function useTick(every: number, on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return; const t = window.setInterval(() => setNow(Date.now()), every); return () => window.clearInterval(t); }, [every, on]);
  return now;
}

// The song as Spotify has it: read again every few seconds while Taurus shows it, and after every button.
export function useLiveMusic(start: MusicState | null) {
  const [music, setMusic] = useState(start);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [seen, setSeen] = useState(start);
  if (start !== seen) { setSeen(start); setMusic(start); }
  const on = Boolean(start);
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => { if (!document.hidden) api.music().then(m => setMusic(old => old && { ...m, context: old.context })).catch(() => undefined); }, 8000);
    return () => window.clearInterval(t);
  }, [on]);
  const press = useCallback(async (what: string) => {
    setBusy(true); setProblem('');
    try { const r = await api.musicControl(what); setMusic(old => ({ ...r.music, context: old?.context })); } catch (e) { setProblem((e as Error).message); } finally { setBusy(false); }
  }, []);
  return { music, busy, problem, press };
}

// ---------- Weather ----------

export interface Weather { temp: string; sky: string; feels?: string; high?: string; low?: string; rain?: number; place?: string }
type Scene = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow' | 'storm';

// The Weather connector's line: "12°C, rain showers, feels like 10°C" and "High 14°C, low 8°C, rain 70% · Oakland · ...".
export function weatherOf(data: Dashboard | null): Weather | null {
  const u = data?.updates?.find(x => x.source === 'Weather');
  if (!u) return null;
  const m = u.title.match(/^(-?\d+)°[CF]?,\s*([^,]+?)(?:,\s*feels like\s*(-?\d+)°[CF]?)?$/i);
  const d = u.detail ?? '';
  const rain = d.match(/rain (\d+)%/i);
  return {
    temp: m ? `${m[1]}°` : u.title, sky: m ? m[2].trim() : '', feels: m?.[3] ? `${m[3]}°` : undefined,
    high: d.match(/High (-?\d+)°/i)?.[1], low: d.match(/low (-?\d+)°/i)?.[1], rain: rain ? Number(rain[1]) : undefined, place: d.split(' · ')[1],
  };
}
const sceneOf = (sky: string): Scene => /thunder/i.test(sky) ? 'storm' : /snow/i.test(sky) ? 'snow' : /rain|drizzle|shower/i.test(sky) ? 'rain' : /partly/i.test(sky) ? 'partly' : /clear|sun/i.test(sky) ? 'clear' : 'cloudy';
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SkyScene({ scene, night }: { scene: Scene; night: boolean }) {
  const drops = scene === 'rain' || scene === 'storm' ? 9 : scene === 'snow' ? 8 : 0;
  const cx = scene === 'clear' ? 50 : 38, cy = scene === 'clear' ? 34 : 30;
  return <svg className={`cw-sky scene-${scene}`} viewBox="0 0 100 100" aria-hidden="true">
    {(scene === 'clear' || scene === 'partly') && (night
      ? <path className="cw-moon" d={`M${cx + 4} ${cy - 12}a12 12 0 1 0 8 20a10 10 0 1 1 -8 -20Z`} />
      : <g className="cw-sun" style={{ transformOrigin: `${cx}px ${cy}px` } as CSSProperties}>
        <circle cx={cx} cy={cy} r="10" />
        {Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return <line key={i} x1={cx + Math.cos(a) * 14} y1={cy + Math.sin(a) * 14} x2={cx + Math.cos(a) * 18} y2={cy + Math.sin(a) * 18} />; })}
      </g>)}
    {scene !== 'clear' && <path className="cw-cloud" d="M31 50a10 10 0 0 1 1.6-19.9A13.5 13.5 0 0 1 58 25.6a11 11 0 0 1 12.6 10A7.3 7.3 0 0 1 69 50Z" />}
    {scene === 'storm' && <path className="cw-bolt" d="M53 51 46 63h6l-4 11 11-15h-6l4-8Z" />}
    {Array.from({ length: drops }, (_, i) => {
      const x = 34 + (i % 5) * 8 + (i > 4 ? 4 : 0);
      return scene === 'snow'
        ? <circle key={i} className="cw-flake" cx={x} cy="55" r="1.6" style={{ '--d': `${((i * 0.37) % 1.6).toFixed(2)}s` } as CSSProperties} />
        : <line key={i} className="cw-drop" x1={x} y1="53" x2={x - 2.5} y2="61" style={{ '--d': `${((i * 0.23) % 1).toFixed(2)}s` } as CSSProperties} />;
    })}
  </svg>;
}

// ---------- The disc ----------

function Ring({ value, signal }: { value: number; signal?: boolean }) {
  return <svg className={`cw-ring ${signal ? 'signal' : ''}`} viewBox="0 0 100 100" aria-hidden="true">
    <circle className="cw-track" cx="50" cy="50" r="47" />
    <circle className="cw-arc" cx="50" cy="50" r="47" pathLength={100} strokeDasharray={`${Math.max(0, Math.min(100, value * 100)).toFixed(2)} 100`} />
  </svg>;
}

const hm = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`;

// What goes inside Taurus's disc. Decorative: the line under the disc says the same in words.
export function CenterFace({ center, data, music, now }: { center: Center; data: Dashboard | null; music: MusicState | null; now: number }) {
  switch (center.kind) {
    case 'timer': {
      const { timer, done } = center;
      const left = Date.parse(timer.endsAt) - now;
      const total = timer.minutes * 60_000 || 1;
      return <div className={`cw cw-timer ${done ? 'is-done' : ''}`}>
        <Ring value={done ? 1 : 1 - left / total} signal={done} />
        <Taurus size={30} mood={done ? 'alert' : 'idle'} />
        <span className="cw-big">{done ? '0:00' : countdown(left)}</span>
        <span className="cw-small">{done ? 'Time’s up' : timer.focus ? 'Locked in' : capital(timer.label)}</span>
      </div>;
    }
    case 'reminder': return <div className="cw cw-reminder is-done"><Ring value={1} signal /><span className="cw-small">Reminder</span><span className="cw-text">{center.reminder.text}</span></div>;
    case 'music': {
      const m = music ?? center.music, t = m.track!;
      const elapsed = Math.min(t.durationMs, m.progressMs + (m.playing ? Math.max(0, now - Date.parse(m.at)) : 0));
      return <div className={`cw cw-music ${m.playing ? 'is-playing' : ''}`}>
        <Ring value={t.durationMs ? elapsed / t.durationMs : 0} />
        {t.art ? <img className="cw-record" src={t.art} alt="" /> : <span className="cw-record" />}
      </div>;
    }
    case 'weather': {
      const w = weatherOf(data);
      const h = new Date(now).getHours();
      return <div className="cw cw-weather">
        <SkyScene scene={w ? sceneOf(w.sky) : 'cloudy'} night={h < 6 || h >= 19} />
        <span className="cw-big">{w ? w.temp : '–'}</span>
      </div>;
    }
    case 'body': {
      const b = data?.body;
      const value = b?.recovery ?? b?.readiness;
      return <div className="cw cw-body">
        <Ring value={(value ?? 0) / 100} />
        <span className="cw-big">{value !== undefined ? `${value}%` : b?.restingHr !== undefined ? `${b.restingHr}` : '–'}</span>
        <span className="cw-small">{b?.recovery !== undefined ? 'Recovery' : b?.readiness !== undefined ? 'Readiness' : b?.restingHr !== undefined ? 'Resting bpm' : 'No body data'}</span>
      </div>;
    }
    case 'meeting': {
      const start = Date.parse(center.event.start);
      const started = start <= now;
      return <div className="cw cw-meeting">
        <Ring value={started ? 1 : 1 - Math.min(1, (start - now) / SOON)} />
        <span className="cw-small">{started ? 'Started at' : 'Starts in'}</span>
        <span className="cw-big">{started ? clock(center.event.start) : countdown(start - now)}</span>
      </div>;
    }
  }
}

function Chime({ title, body, tag }: { title: string; body: string; tag: string }) { useChime(true, title, body, tag); return null; }

interface LineProps { center: Center; data: Dashboard | null; live: ReturnType<typeof useLiveMusic>; back: () => void; closeWin: (id: string) => void }

// The words under the disc, and the one or two buttons that matter.
export function CenterLine({ center, data, live, back, closeWin }: LineProps) {
  const backButton = <button type="button" className="text-button cw-back" onClick={back}>Back to Taurus</button>;
  let text: ReactNode = null, actions: ReactNode = backButton;
  switch (center.kind) {
    case 'timer': {
      const { timer, done } = center;
      if (done) {
        text = <><Chime title={timer.focus ? 'Focus block done' : `${timer.label}: done`} body="Taurus timer" tag={timer.id} /><strong className="cw-alert">{timer.focus ? 'Focus block done.' : `${capital(timer.label)} is done.`}</strong>{timer.focus ? ' VIP mail rings again.' : ''}</>;
        actions = <button type="button" className="primary" onClick={() => closeWin(center.win)}>Stop</button>;
      } else {
        text = <>{timer.focus ? 'Focus' : capital(timer.label)} until {clock(timer.endsAt)}.{timer.focus ? ' VIP mail waits; meetings still ring.' : ''}{center.more > 0 ? ` ${center.more} more ${center.more === 1 ? 'timer' : 'timers'} running.` : ''}</>;
        actions = <><button type="button" onClick={() => api.cancelTimer(timer.id).catch(() => undefined)}>{timer.focus ? 'End focus' : 'Cancel timer'}</button>{backButton}</>;
      }
      break;
    }
    case 'reminder': {
      const r = center.reminder;
      text = <><Chime title="Reminder" body={r.text} tag={r.id} /><strong className="cw-alert">Reminder:</strong> {r.text}</>;
      actions = <>
        <button type="button" className="primary" onClick={() => { api.reminderDone(r.id).catch(() => undefined); closeWin(center.win); }}>Done</button>
        <button type="button" onClick={() => api.snooze(r.id, 10).catch(() => undefined)}>In 10 minutes</button>
      </>;
      break;
    }
    case 'music': {
      const m = live.music ?? center.music, t = m.track!;
      text = <><strong>{t.title}</strong> · {t.artist}{m.device ? ` · on ${m.device}` : ''}{live.problem && <span className="cw-problem"> {live.problem}</span>}</>;
      actions = <>
        <button type="button" onClick={() => live.press('previous')} disabled={live.busy}>Back</button>
        <button type="button" className="primary" aria-pressed={m.playing} onClick={() => live.press(m.playing ? 'pause' : 'resume')} disabled={live.busy}>{m.playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={() => live.press('next')} disabled={live.busy}>Skip</button>
        {backButton}
      </>;
      break;
    }
    case 'weather': {
      const w = weatherOf(data);
      text = w ? <><strong>{w.temp} and {w.sky || 'clear'}</strong>{w.feels ? `, feels like ${w.feels}` : ''}{w.high ? ` · High ${w.high}°, low ${w.low}°` : ''}{w.rain !== undefined ? ` · Rain ${w.rain}%` : ''}{w.place ? ` · ${w.place}` : ''}</>
        : <>Weather isn’t connected. <a href="#connections/weather">Add your city</a></>;
      break;
    }
    case 'body': {
      const b = data?.body;
      const bits = [b?.hrv !== undefined && `HRV ${b.hrv} ms`, b?.restingHr !== undefined && `Resting heart rate ${b.restingHr}`, b?.sleepMinutes !== undefined && `Slept ${hm(b.sleepMinutes)}`].filter(Boolean);
      const sample = data ? !data.sections.body.live : false;
      text = bits.length ? <>{bits.join(' · ')}{sample ? ' · Sample' : ''}</> : <>No health app connected. <a href="#connections">Connect one</a></>;
      break;
    }
    case 'meeting': {
      const e = center.event;
      text = <><strong>{e.title}</strong> at {clock(e.start)}{e.location ? ` · ${e.location}` : ''}</>;
      actions = <>{e.joinUrl && <a className="button primary" href={e.joinUrl} target="_blank" rel="noreferrer">Join</a>}{backButton}</>;
      break;
    }
  }
  return <div className="cloud-widget-line">
    <p className="cw-line">{text}</p>
    <div className="cw-actions">{actions}</div>
  </div>;
}

// What a screen reader hears for the disc, in place of the decorative drawing.
export function centerLabel(center: Center) {
  switch (center.kind) {
    case 'timer': return center.done ? 'Timer done' : center.timer.focus ? 'Focus countdown' : `${capital(center.timer.label)} countdown`;
    case 'reminder': return 'Reminder due';
    case 'music': return 'Spotify';
    case 'weather': return 'Weather';
    case 'body': return 'Recovery';
    case 'meeting': return `Next: ${center.event.title}`;
  }
}
