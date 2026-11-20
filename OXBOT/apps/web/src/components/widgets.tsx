import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ago, api, clock, type AiCard, type CalendarEvent, type Dashboard, type History, type MarketRange, type Person, type Prefs, type Quote, type Section, type TrendMetric, type Widget, type WidgetConfig, type WidgetSize, type WidgetType } from '../api';
import { Bars, LineChart, Ring, Sparkline } from './charts';

export interface Ctx {
  data: Dashboard | null;
  history: History | null;
  prefs: Prefs;
  setPrefs: (update: (p: Prefs) => Prefs) => void;
  now: number;
  onAsk: (question: string) => void;
}
interface Props { widget: Widget; ctx: Ctx; update: (config: WidgetConfig) => void }

export const catalog: Record<WidgetType, { name: string; about: string; size: WidgetSize; config?: WidgetConfig }> = {
  brief: { name: 'Summary', about: 'The day in one sentence, with the Ask box.', size: 'wide' },
  focus: { name: 'Right now', about: 'Next meeting with a countdown, the top thing waiting on you, your first to-do.', size: 'medium' },
  clock: { name: 'Clock', about: 'Your time and date, plus world clocks.', size: 'medium', config: { zones: ['London=Europe/London', 'New York=America/New_York', 'Tokyo=Asia/Tokyo'] } },
  needs: { name: 'Needs you', about: 'Mail, messages, reviews and issues waiting on you.', size: 'tall' },
  todo: { name: 'To do', about: 'Your own list. Add and tick things off.', size: 'medium' },
  schedule: { name: 'Calendar', about: 'Today on a timeline, then tomorrow.', size: 'tall' },
  people: { name: 'People', about: 'Who is waiting on you, who you meet today, who you keep in touch with.', size: 'medium' },
  health: { name: 'Health', about: 'Recovery, sleep, HRV, heart rate, strain and workouts.', size: 'medium' },
  trend: { name: 'Health trend', about: 'One body metric charted over weeks.', size: 'large', config: { metric: 'recovery', days: 30 } },
  inbox: { name: 'Inbox', about: 'Unread counts for each account.', size: 'small' },
  numbers: { name: 'Company numbers', about: 'Revenue, burn, runway, pipeline with trend lines.', size: 'wide' },
  stocks: { name: 'Watchlist', about: 'Prices and day change for any tickers, indexes or crypto.', size: 'medium', config: { symbols: ['^GSPC', 'AAPL', 'NVDA', 'BTC-USD'] } },
  chart: { name: 'Price chart', about: 'One ticker charted over a day to a year.', size: 'large', config: { symbol: '^GSPC', range: '1mo' } },
  news: { name: 'News tracker', about: 'Headlines about companies, people, or you.', size: 'large', config: { topics: ['Artificial intelligence'] } },
  note: { name: 'Note', about: 'Free text you can edit in place.', size: 'small', config: { text: '' } },
  ai: { name: 'Custom AI card', about: 'Describe anything; the AI draws it from your data.', size: 'large', config: { prompt: '' } },
  updates: { name: 'From your apps', about: 'Recent files, music, feeds and today’s weather from the apps you connect.', size: 'large' },
};

// ---------- shared pieces ----------

const newId = () => crypto.randomUUID().slice(0, 8);
const sameDay = (iso: string, offset: number) => {
  const day = new Date(); day.setDate(day.getDate() + offset);
  return iso.length === 10 ? iso === day.toLocaleDateString('en-CA') : new Date(iso).toDateString() === day.toDateString();
};
const hm = (n?: number) => n === undefined ? undefined : `${Math.floor(n / 60)}h ${String(Math.round(n % 60)).padStart(2, '0')}m`;
const span = (ms: number) => { const m = Math.max(1, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const money = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2, minimumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
export const pct = (v?: number) => v === undefined ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
const delta = (v?: number) => v === undefined ? undefined : v >= 0 ? 'gain' : 'loss';

function Head({ title, note, children }: { title: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return <header className="card-head"><h2>{title}</h2>{children}{note !== undefined && <span className="source">{note}</span>}</header>;
}
function sourceNote(data: Dashboard | null, section: Section) {
  if (!data) return '';
  const s = data.sections[section];
  if (!s) return '';
  return s.live ? s.sources.join(', ') : <a href="#connections">Sample</a>;
}
function Problems({ data, section }: { data: Dashboard | null; section: Section }) {
  return <>{data?.sections[section]?.errors.map(e => <p key={e} className="problem">{e} <a href="#connections">Reconnect</a></p>)}</>;
}

// Fetch on mount and on an interval; keeps the last good value while refreshing.
// The last live value of each remote feed, so Taurus can talk about the card it is sitting on.
export const seen = new Map<string, unknown>();

function useRemote<T>(key: string, load: () => Promise<T>, everyMs: number) {
  const [state, setState] = useState<{ key: string; value?: T; error?: string }>({ key });
  useEffect(() => {
    let alive = true;
    const run = () => load().then(value => { seen.set(key, value); if (alive) setState({ key, value }); }).catch((e: Error) => { if (alive) setState(s => ({ key, value: s.key === key ? s.value : undefined, error: e.message })); });
    run();
    const timer = window.setInterval(run, everyMs);
    return () => { alive = false; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures everything `load` depends on
  }, [key, everyMs]);
  return state.key === key ? state : { key, value: undefined, error: undefined };
}

// ---------- widgets ----------

function BriefW({ ctx }: Props) {
  const { data, now } = ctx;
  const date = new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const sampleCount = data ? Object.values(data.sections).filter(s => !s.live).length : 0;
  const sectionCount = data ? Object.keys(data.sections).length : 0;
  return <div className="brief-card">
    <p className="date">{date}</p>
    <h1 className="brief">{data?.brief ?? 'Loading.'}</h1>
    {sampleCount > 0 && <p className="sample-note">{sampleCount === sectionCount ? 'Everything here is sample data.' : `${sampleCount} of ${sectionCount} sections show sample data.`} <a href="#connections">Connect your accounts</a></p>}
    {data && <p className="footnote">Updated {clock(data.generatedAt)}{data.briefBy !== 'rules' && ` · Summary by ${data.briefBy}`}</p>}
  </div>;
}

function FocusW({ widget, ctx }: Props) {
  const { data, now, prefs } = ctx;
  const next = data?.schedule.find(e => !e.allDay && Date.parse(e.end) > now && Date.parse(e.start) - now < 14 * 3_600_000);
  const ongoing = next && Date.parse(next.start) <= now;
  const top = data?.needs[0];
  const todo = prefs.todos.find(t => !t.done);
  return <>
    <Head title={widget.title ?? 'Right now'} />
    <div className="card-body focus">
      {next ? <div className="focus-next">
        <p className={`focus-when ${ongoing ? 'live' : ''}`}>{ongoing ? `Now, ${span(Date.parse(next.end) - now)} left` : `In ${span(Date.parse(next.start) - now)}`}</p>
        <p className="focus-title">{next.title}</p>
        <p className="muted">{clock(next.start)} to {clock(next.end)}{next.location && ` · ${next.location}`} {(next.joinUrl || next.url) && <a href={next.joinUrl ?? next.url} target="_blank" rel="noreferrer">{next.joinUrl ? 'Join' : 'Open'}</a>}</p>
      </div> : <p className="focus-when">No more meetings today</p>}
      <dl className="focus-rows">
        {top && <div><dt>Top</dt><dd>{top.url ? <a href={top.url} target="_blank" rel="noreferrer">{top.title}</a> : top.title}<span className="muted">{top.who ? ` · ${top.who}` : ''}</span></dd></div>}
        <div><dt>To do</dt><dd>{todo ? todo.text : <span className="muted">Nothing on your list</span>}</dd></div>
      </dl>
    </div>
  </>;
}

const zoneLabel = (z: string) => z.split('/').at(-1)!.replace(/_/g, ' ');
function ClockW({ widget }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 5_000); return () => window.clearInterval(t); }, []);
  const d = new Date(now);
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localDay = d.toLocaleDateString('en-CA');
  const zones = (widget.config?.zones ?? catalog.clock.config!.zones!).flatMap(entry => {
    const [label, zone] = entry.includes('=') ? entry.split('=').map(s => s.trim()) : [zoneLabel(entry.trim()), entry.trim()];
    if (zone === here) return [];
    try {
      const time = d.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
      const day = d.toLocaleDateString('en-CA', { timeZone: zone });
      return [{ label, time, day: day === localDay ? '' : day > localDay ? 'Tomorrow' : 'Yesterday' }];
    } catch { return [{ label, time: 'Unknown zone', day: '' }]; }
  });
  return <div className="clock-card">
    <p className="clock-time">{d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/, '')}<span>{d.getHours() < 12 ? 'AM' : 'PM'}</span></p>
    <p className="clock-date">{d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    {zones.length > 0 && <dl className="zones">{zones.map(z => <div key={z.label}><dt>{z.label}</dt><dd>{z.time}{z.day && <span className="unit"> {z.day}</span>}</dd></div>)}</dl>}
  </div>;
}

function NeedsW({ widget, ctx }: Props) {
  const { data } = ctx;
  return <>
    <Head title={<>{widget.title ?? 'Needs you'}{data && data.needs.length > 0 && <span className="count">{data.needs.length}</span>}</>} note={sourceNote(data, 'needs')} />
    <div className="card-body">
      <Problems data={data} section="needs" />
      {!data ? null : data.needs.length === 0 ? <p className="empty">Nothing is waiting on you.</p> : <ol className="needs">
        {data.needs.map(n => <li key={n.id} className={n.vip ? 'vip' : undefined}>
          <p className="need-meta"><span>{n.who ? `${n.who} · ` : ''}{n.source}{n.vip && ' · VIP'}</span><span>{ago(n.at)}</span></p>
          <p className="need-title">{n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a> : n.title}</p>
          {n.detail && <p className="need-detail">{n.detail}</p>}
        </li>)}
      </ol>}
    </div>
  </>;
}

function TodoW({ widget, ctx }: Props) {
  const [text, setText] = useState('');
  const { prefs, setPrefs } = ctx;
  const done = prefs.todos.filter(t => t.done).length;
  const add = (e: FormEvent) => { e.preventDefault(); const t = text.trim(); if (!t) return; setPrefs(p => ({ ...p, todos: [{ id: newId(), text: t, done: false, at: new Date().toISOString() }, ...p.todos] })); setText(''); };
  const toggle = (id: string) => setPrefs(p => ({ ...p, todos: p.todos.map(t => t.id === id ? { ...t, done: !t.done } : t) }));
  const open = prefs.todos.filter(t => !t.done), closed = prefs.todos.filter(t => t.done);
  return <>
    <Head title={widget.title ?? 'To do'} note={done > 0 ? <button className="text-button" onClick={() => setPrefs(p => ({ ...p, todos: p.todos.filter(t => !t.done) }))}>Clear {done} done</button> : undefined} />
    <div className="card-body">
      <form className="inline-add" onSubmit={add}>
        <label className="sr-only" htmlFor={`todo-${widget.id}`}>Add a to-do</label>
        <input type="text" id={`todo-${widget.id}`} value={text} onChange={e => setText(e.target.value)} placeholder="Add a to-do" maxLength={300} autoComplete="off" />
      </form>
      {prefs.todos.length > 0 && <ul className="todos">
        {[...open, ...closed].map(t => <li key={t.id} className={t.done ? 'done' : undefined}>
          <label><input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} /><span>{t.text}</span></label>
        </li>)}
      </ul>}
    </div>
  </>;
}

function DayStrip({ events, now }: { events: CalendarEvent[]; now: number }) {
  const timed = events.filter(e => !e.allDay);
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const hour = (iso: string) => (Date.parse(iso) - day.getTime()) / 3_600_000;
  const from = Math.max(0, Math.min(8, ...timed.map(e => Math.floor(hour(e.start)))));
  const to = Math.min(24, Math.max(20, ...timed.map(e => Math.ceil(hour(e.end)))));
  const pos = (h: number) => `${((Math.max(from, Math.min(to, h)) - from) / (to - from)) * 100}%`;
  const nowH = (now - day.getTime()) / 3_600_000;
  const marks = Array.from({ length: Math.floor((to - from) / 3) + 1 }, (_, i) => from + i * 3).filter(h => h < to);
  return <div className="daystrip" aria-hidden="true">
    <div className="daystrip-track">
      {timed.map(e => <span key={e.id} className={`daystrip-event ${Date.parse(e.end) < now ? 'past' : ''}`} style={{ left: pos(hour(e.start)), width: `calc(${pos(hour(e.end))} - ${pos(hour(e.start))})` }} title={e.title} />)}
      {nowH >= from && nowH <= to && <span className="daystrip-now" style={{ left: pos(nowH) }} />}
    </div>
    <div className="daystrip-marks">{marks.map(h => <span key={h} style={{ left: pos(h) }}>{h === 0 || h === 24 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}</span>)}</div>
  </div>;
}

function ScheduleW({ widget, ctx }: Props) {
  const { data, now } = ctx;
  if (!data) return <Head title={widget.title ?? 'Today'} />;
  const today = data.schedule.filter(e => sameDay(e.start, 0)), tomorrow = data.schedule.filter(e => sameDay(e.start, 1));
  const row = (e: CalendarEvent) => {
    const past = !e.allDay && Date.parse(e.end) < now;
    const live = !e.allDay && Date.parse(e.start) <= now && Date.parse(e.end) > now;
    return <li key={e.id} className={`event ${past ? 'past' : ''} ${live ? 'live' : ''}`}>
      <time dateTime={e.start}>{e.allDay ? 'All day' : clock(e.start)}</time>
      <span className="event-title">{e.title}{e.location && <span className="muted"> · {e.location}</span>}</span>
      {(e.joinUrl || e.url) && !past && <a className="event-link" href={e.joinUrl ?? e.url} target="_blank" rel="noreferrer">{e.joinUrl ? 'Join' : 'Open'}</a>}
    </li>;
  };
  const nowIndex = today.findIndex(e => !e.allDay && Date.parse(e.start) > now);
  const rows = today.map(row);
  if (today.length) rows.splice(nowIndex === -1 ? today.length : nowIndex, 0, <li key="now" className="now-line" aria-label={`Now, ${clock(new Date(now).toISOString())}`}><time>{clock(new Date(now).toISOString())}</time><span /></li>);
  return <>
    <Head title={widget.title ?? 'Today'} note={sourceNote(data, 'schedule')} />
    <div className="card-body">
      <Problems data={data} section="schedule" />
      <DayStrip events={today} now={now} />
      {today.length ? <ol className="events">{rows}</ol> : <p className="empty">Nothing else today.</p>}
      {tomorrow.length > 0 && <><h3 className="subhead">Tomorrow</h3><ol className="events">{tomorrow.map(row)}</ol></>}
    </div>
  </>;
}

const meetingName = /(?:\bwith\b|\bw\/|\b1:1\b|\b1-1\b|<>)\s*([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)/;
function PeopleW({ widget, ctx }: Props) {
  const [name, setName] = useState('');
  const { data, prefs, setPrefs, now } = ctx;
  const waiting = new Map<string, { source: string; at: string; vip?: boolean }>();
  for (const n of data?.needs ?? []) if (n.who && !waiting.has(n.who)) waiting.set(n.who, { source: n.source, at: n.at, vip: n.vip });
  const meeting = new Map<string, string>();
  for (const e of (data?.schedule ?? []).filter(e => sameDay(e.start, 0) && Date.parse(e.end) > now)) { const m = e.title.match(meetingName); if (m && !meeting.has(m[1])) meeting.set(m[1], clock(e.start)); }
  const dueIn = (p: Person) => p.everyDays ? (p.last ? Date.parse(p.last) + p.everyDays * 86_400_000 - now : -1) : Infinity;
  const keep = [...prefs.people].sort((a, b) => dueIn(a) - dueIn(b));
  const add = (e: FormEvent) => { e.preventDefault(); const n = name.trim(); if (!n) return; setPrefs(p => ({ ...p, people: [...p.people, { id: newId(), name: n, everyDays: 14 }] })); setName(''); };
  const talked = (id: string) => setPrefs(p => ({ ...p, people: p.people.map(x => x.id === id ? { ...x, last: new Date().toISOString() } : x) }));
  const remove = (id: string) => setPrefs(p => ({ ...p, people: p.people.filter(x => x.id !== id) }));
  return <>
    <Head title={widget.title ?? 'People'} note={data && !data.sections.needs.live ? <a href="#connections">Sample</a> : undefined} />
    <div className="card-body people">
      {waiting.size > 0 && <><h3 className="subhead first">Waiting on you</h3><ul className="rows">{[...waiting].map(([who, w]) => <li key={who}><span className={w.vip ? 'strong' : undefined}>{who}</span><span className="muted">{w.source} · {ago(w.at)}</span></li>)}</ul></>}
      {meeting.size > 0 && <><h3 className="subhead">Seeing today</h3><ul className="rows">{[...meeting].map(([who, at]) => <li key={who}><span>{who}</span><span className="muted">{at}</span></li>)}</ul></>}
      <h3 className="subhead">Keep in touch</h3>
      <ul className="rows">{keep.map(p => { const due = dueIn(p); return <li key={p.id}>
        <span>{p.name}{p.note && <span className="muted"> · {p.note}</span>}</span>
        <span className="row-actions">
          <span className={due < 0 ? 'overdue' : 'muted'}>{!p.last ? 'Due' : due < 0 ? `${Math.ceil(-due / 86_400_000)}d overdue` : `Talked ${ago(p.last)} ago`}</span>
          <button className="text-button" onClick={() => talked(p.id)}>Talked</button>
          <button className="text-button" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
        </span>
      </li>; })}</ul>
      <form className="inline-add" onSubmit={add}>
        <label className="sr-only" htmlFor={`person-${widget.id}`}>Add someone to keep in touch with</label>
        <input type="text" id={`person-${widget.id}`} value={name} onChange={e => setName(e.target.value)} placeholder="Add someone, every 2 weeks" maxLength={80} autoComplete="off" />
      </form>
    </div>
  </>;
}

const metricMeta: Record<TrendMetric, { name: string; format: (v: number) => string }> = {
  recovery: { name: 'Recovery', format: v => `${Math.round(v)}%` },
  readiness: { name: 'Readiness', format: v => `${Math.round(v)}` },
  sleepMinutes: { name: 'Sleep', format: v => hm(v)! },
  sleepScore: { name: 'Sleep score', format: v => `${Math.round(v)}` },
  hrv: { name: 'HRV', format: v => `${Math.round(v)} ms` },
  restingHr: { name: 'Resting heart rate', format: v => `${Math.round(v)} bpm` },
  strain: { name: 'Strain', format: v => v.toFixed(1) },
  weekKm: { name: 'Distance, 7 days', format: v => `${v.toFixed(1)} km` },
};
const series = (h: History | null, metric: TrendMetric, days: number) => (h?.days ?? []).slice(-days).flatMap(d => typeof d[metric] === 'number' ? [{ t: Date.parse(`${d.date}T12:00:00`), v: d[metric] as number }] : []);

function HealthW({ widget, ctx }: Props) {
  const { data, history } = ctx;
  if (!data) return <Head title={widget.title ?? 'Health'} />;
  const b = data.body;
  const score = b.recovery ?? b.readiness;
  const spark = series(history, b.recovery !== undefined ? 'recovery' : 'readiness', 14).map(p => p.v);
  const stats: [string, string | undefined][] = [
    ['Sleep', hm(b.sleepMinutes)], ['HRV', b.hrv !== undefined ? `${b.hrv} ms` : undefined],
    ['Resting HR', b.restingHr !== undefined ? `${b.restingHr} bpm` : undefined], ['Strain', b.strain?.toString()],
    ['Sleep score', b.recovery !== undefined || b.readiness !== undefined ? b.sleepScore?.toString() : undefined], ['7 days', b.weekKm !== undefined ? `${b.weekKm} km` : undefined],
  ];
  return <>
    <Head title={widget.title ?? 'Health'} note={sourceNote(data, 'body')} />
    <div className="card-body health">
      <Problems data={data} section="body" />
      <div className="health-top">
        {score !== undefined && <Ring value={score} size={112} caption={b.recovery !== undefined ? 'Recovery' : 'Readiness'} />}
        <dl className="stats">{stats.filter(([, v]) => v).slice(0, 4).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </div>
      {spark.length > 1 && <div className="health-spark"><Sparkline values={spark} height={36} /><span className="muted">{b.recovery !== undefined ? 'Recovery' : 'Readiness'}, 14 days</span></div>}
      {b.lastWorkout && <p className="muted workout">Last workout: {[b.lastWorkout.km !== undefined ? `${b.lastWorkout.km} km ${b.lastWorkout.name.toLowerCase()}` : b.lastWorkout.name, `${b.lastWorkout.minutes} min`, `${ago(b.lastWorkout.at)} ago`].join(' · ')}</p>}
    </div>
  </>;
}

const chartHeight: Record<WidgetSize, number> = { small: 60, medium: 132, tall: 260, large: 150, wide: 150, banner: 60, full: 170 };

function TrendW({ widget, ctx }: Props) {
  const metric = widget.config?.metric ?? 'recovery', days = widget.config?.days ?? 30;
  const meta = metricMeta[metric];
  const points = series(ctx.history, metric, days);
  const last = points.at(-1)?.v;
  const avg = points.length ? points.reduce((s, p) => s + p.v, 0) / points.length : undefined;
  return <>
    <Head title={widget.title ?? meta.name} note={!ctx.history ? '' : ctx.history.sample ? <a href="#connections">Sample</a> : `${days} days`} />
    <div className="card-body trend">
      {points.length < 2 ? <p className="empty">{points.length ? 'One day so far.' : 'Fills in a day at a time.'}</p> : <>
        <p className="big">{meta.format(last!)}<span className="unit">{avg !== undefined && ` ${days}-day average ${meta.format(avg)}`}</span></p>
        {widget.size === 'small' || widget.size === 'banner' ? <Sparkline values={points.map(p => p.v)} height={chartHeight[widget.size]} /> : <LineChart points={points} label={`${meta.name}, ${days} days`} format={meta.format} height={chartHeight[widget.size]} />}
      </>}
    </div>
  </>;
}

function InboxW({ widget, ctx }: Props) {
  const { data } = ctx;
  return <>
    <Head title={widget.title ?? 'Inbox'} note={sourceNote(data, 'inbox')} />
    <div className="card-body">
      <Problems data={data} section="inbox" />
      {data && <Bars items={data.inbox.map(i => ({ label: i.source, value: i.unread, href: i.url, note: i.label }))} />}
    </div>
  </>;
}

function NumbersW({ widget, ctx }: Props) {
  const { data, history } = ctx;
  return <>
    <Head title={widget.title ?? 'Numbers'} note={sourceNote(data, 'numbers')} />
    <div className="card-body">
      <Problems data={data} section="numbers" />
      {data && (data.numbers.length === 0 ? <p className="empty">No rows in your sheet yet.</p> : <ul className="tiles">
        {data.numbers.map(m => {
          const trend = (history?.days ?? []).slice(-30).flatMap(d => d.numbers?.[m.label] !== undefined ? [d.numbers[m.label]] : []);
          return <li key={`${m.source}${m.label}`}>
            <p className="tile-label">{m.label}</p>
            <p className="tile-value">{m.value}</p>
            {m.change && <p className={`tile-change ${m.change.startsWith('-') ? 'loss' : 'gain'}`}>{m.change.replace('-', '−')}</p>}
            {trend.length > 1 && <Sparkline values={trend} height={28} />}
          </li>;
        })}
      </ul>)}
    </div>
  </>;
}

export const label = (q: Quote) => q.symbol.startsWith('^') || q.symbol.includes('-') || q.symbol.includes('=') ? q.name ?? q.symbol : q.symbol;

function StocksW({ widget }: Props) {
  const symbols = widget.config?.symbols?.length ? widget.config.symbols : catalog.stocks.config!.symbols!;
  const { value, error } = useRemote(`markets:${symbols.join(',')}`, () => api.markets(symbols, '1mo'), 120_000);
  return <>
    <Head title={widget.title ?? 'Watchlist'} note="Day change" />
    <div className="card-body">
      {error && !value && <p className="problem">{error}</p>}
      {!value ? <p className="empty">Loading prices.</p> : <ul className="quotes">
        {value.quotes.map(q => <li key={q.symbol}>
          <span className="q-name"><strong>{label(q)}</strong><span className="muted">{label(q) === q.symbol ? q.name ?? '' : q.symbol.replace('^', '')}</span></span>
          {q.error ? <span className="muted q-error">{q.error}</span> : <>
            <span className={`q-spark ${delta(q.change)}`}><Sparkline values={q.points.map(p => p.v)} height={26} /></span>
            <span className="q-price">{q.price !== undefined ? money(q.price) : ''}</span>
            <span className={`q-change ${delta(q.change)}`}>{pct(q.changePct)}</span>
          </>}
        </li>)}
      </ul>}
    </div>
  </>;
}

const rangeNames: Record<MarketRange, string> = { '1d': '1D', '5d': '5D', '1mo': '1M', '6mo': '6M', '1y': '1Y' };
function ChartW({ widget, update }: Props) {
  const symbol = widget.config?.symbol ?? '^GSPC', range = widget.config?.range ?? '1mo';
  const { value, error } = useRemote(`chart:${symbol}:${range}`, () => api.markets([symbol], range), range === '1d' ? 60_000 : 300_000);
  const q = value?.quotes[0];
  const first = q?.points[0]?.v, last = q?.price ?? q?.points.at(-1)?.v;
  const change = first !== undefined && last !== undefined ? last - first : undefined;
  return <>
    <Head title={widget.title ?? (q ? label(q) : symbol)}>
      <span className="ranges" role="group" aria-label="Range">{(Object.keys(rangeNames) as MarketRange[]).map(r => <button key={r} className="text-button" aria-pressed={r === range} onClick={() => update({ ...widget.config, range: r })}>{rangeNames[r]}</button>)}</span>
    </Head>
    <div className="card-body trend">
      {(error || q?.error) && <p className="problem">{q?.error ?? error}</p>}
      {q && !q.error && last !== undefined && <>
        <p className="big">{money(last)}<span className={`unit ${delta(change)}`}> {change !== undefined && first ? `${change >= 0 ? '+' : '−'}${money(Math.abs(change))} (${pct((change / first) * 100)})` : ''}</span></p>
        <div className={delta(change)}><LineChart points={q.points} label={`${label(q)}, ${rangeNames[range]}`} format={money} time={range === '1d' ? 'time' : range === '1y' ? 'month' : 'date'} height={chartHeight[widget.size]} /></div>
      </>}
      {!value && !error && <p className="empty">Loading chart.</p>}
    </div>
  </>;
}

function NewsW({ widget }: Props) {
  const topics = widget.config?.topics?.length ? widget.config.topics : catalog.news.config!.topics!;
  const [only, setOnly] = useState<string | null>(null);
  const { value, error } = useRemote(`news:${topics.join('|')}`, () => api.news(topics), 15 * 60_000);
  const seen = new Set<string>();
  const items = (value?.topics ?? []).filter(t => !only || t.topic === only).flatMap(t => t.items.map(i => ({ ...i, topic: t.topic })))
    .sort((a, b) => Date.parse(b.at ?? '0') - Date.parse(a.at ?? '0')).filter(i => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
  const failed = value?.topics.filter(t => t.error) ?? [];
  return <>
    <Head title={widget.title ?? 'News'} note="Google News" />
    <div className="card-body">
      {topics.length > 1 && <div className="filters" role="group" aria-label="Topic">
        <button className="text-button" aria-pressed={!only} onClick={() => setOnly(null)}>All</button>
        {topics.map(t => <button key={t} className="text-button" aria-pressed={only === t} onClick={() => setOnly(t)}>{t}</button>)}
      </div>}
      {error && !value && <p className="problem">{error}</p>}
      {failed.map(t => <p key={t.topic} className="problem">{t.topic}: {t.error}</p>)}
      {!value && !error ? <p className="empty">Loading headlines.</p> : <ol className="news">
        {items.map(i => <li key={i.url}>
          <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a>
          <p className="muted">{[i.source, i.at && `${ago(i.at)}${ago(i.at).length < 4 ? ' ago' : ''}`, topics.length > 1 && !only ? i.topic : ''].filter(Boolean).join(' · ')}</p>
        </li>)}
      </ol>}
    </div>
  </>;
}

// Live only: with nothing connected it says so instead of showing sample rows.
function UpdatesW({ widget, ctx }: Props) {
  const { data } = ctx;
  const items = data?.updates ?? [];
  return <>
    <Head title={widget.title ?? catalog.updates.name} note={data?.sections.updates?.live ? data.sections.updates.sources.join(', ') : undefined} />
    <div className="card-body">
      <Problems data={data} section="updates" />
      {!data ? <p className="empty">Loading.</p> : !items.length ? <p className="empty"><a href="#connections">Connect</a> weather, feeds or music.</p> : <ol className="news">
        {items.map(i => <li key={i.id}>
          {i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a> : <span>{i.title}</span>}
          <p className="muted">{[i.source, i.detail, i.at && i.source !== 'Weather' && `${ago(i.at)}${ago(i.at).length < 4 ? ' ago' : ''}`].filter(Boolean).join(' · ')}</p>
        </li>)}
      </ol>}
    </div>
  </>;
}

function NoteW({ widget, update }: Props) {
  const [text, setText] = useState(widget.config?.text ?? '');
  return <>
    <Head title={widget.title ?? 'Note'} />
    <div className="card-body note">
      <label className="sr-only" htmlFor={`note-${widget.id}`}>{widget.title ?? 'Note'}</label>
      <textarea id={`note-${widget.id}`} value={text} onChange={e => setText(e.target.value)} onBlur={() => text !== (widget.config?.text ?? '') && update({ ...widget.config, text })} placeholder="Write anything" maxLength={4000} />
    </div>
  </>;
}

function AiBody({ card, size }: { card: AiCard; size: WidgetSize }) {
  switch (card.kind) {
    case 'stat': return <div className="ai-stat"><p className="big">{card.value}</p>{card.caption && <p className="muted">{card.caption}</p>}</div>;
    case 'list': return <ul className="rows">{(card.items ?? []).map((i, n) => <li key={n}><span>{i.label}{i.detail && <span className="muted"> · {i.detail}</span>}</span>{i.value && <strong>{i.value}</strong>}</li>)}</ul>;
    case 'bars': return <Bars items={(card.series ?? []).map(s => ({ label: s.label, value: s.value }))} format={v => v.toLocaleString('en-US', { maximumFractionDigits: 2 })} />;
    case 'line': {
      const s = card.series ?? [];
      return <LineChart points={s.map((p, i) => ({ t: i, v: p.value }))} label={card.title} format={v => v.toLocaleString('en-US', { maximumFractionDigits: 1 })} formatT={t => s[Math.round(t)]?.label ?? ''} height={chartHeight[size]} />;
    }
    case 'table': return <table className="ai-table">{card.columns && <thead><tr>{card.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>}<tbody>{(card.rows ?? []).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>;
    default: return <p className="ai-text">{card.text ?? card.caption}</p>;
  }
}

function AiW({ widget, update }: Props) {
  const prompt = widget.config?.prompt ?? '';
  const [draft, setDraft] = useState(prompt);
  const [round, setRound] = useState(0);
  const { value, error } = useRemote(prompt ? `card:${prompt}:${round}` : 'card:none', () => prompt ? api.card(prompt) : Promise.resolve(undefined), 30 * 60_000);
  if (!prompt) return <>
    <Head title={widget.title ?? 'Custom card'} />
    <form className="card-body ai-ask" onSubmit={e => { e.preventDefault(); if (draft.trim()) update({ ...widget.config, prompt: draft.trim() }); }}>
      <label htmlFor={`ai-${widget.id}`}>What should this card show, and how?</label>
      <textarea id={`ai-${widget.id}`} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Bar chart of my unread counts. Or: my sleep this week as a line. Or: the three people I owe a reply, oldest first." maxLength={600} />
      <button type="submit" className="primary">Make card</button>
    </form>
  </>;
  return <>
    <Head title={widget.title ?? value?.title ?? 'Custom card'} note={<button className="text-button" onClick={() => setRound(r => r + 1)}>{value ? `By ${value.provider} · Redo` : 'Redo'}</button>} />
    <div className="card-body">
      {error && <p className="problem">{error} {/Connect/.test(error) && <a href="#connections">Connections</a>}</p>}
      {value ? <AiBody card={value} size={widget.size} /> : !error && <p className="empty">Working on it.</p>}
    </div>
  </>;
}

const views: Record<WidgetType, (p: Props) => ReactNode> = {
  brief: BriefW, focus: FocusW, clock: ClockW, needs: NeedsW, todo: TodoW, schedule: ScheduleW, people: PeopleW, health: HealthW,
  trend: TrendW, inbox: InboxW, numbers: NumbersW, stocks: StocksW, chart: ChartW, news: NewsW, note: NoteW, ai: AiW, updates: UpdatesW,
};
export function WidgetView(props: Props) { const View = views[props.widget.type]; return <View {...props} />; }

// ---------- per-widget settings ----------

export function ConfigFields({ widget, onChange }: { widget: Widget; onChange: (config: WidgetConfig) => void }) {
  const c = widget.config ?? {};
  const set = (next: Partial<WidgetConfig>) => onChange({ ...c, ...next });
  switch (widget.type) {
    case 'clock': return <label>World clocks, one per line as Name=Time zone<textarea rows={4} defaultValue={(c.zones ?? catalog.clock.config!.zones!).join('\n')} onBlur={e => set({ zones: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} /></label>;
    case 'stocks': return <label>Tickers, separated by commas<input type="text" defaultValue={(c.symbols ?? catalog.stocks.config!.symbols!).join(', ')} onBlur={e => set({ symbols: e.target.value.toUpperCase().split(/[\s,]+/).filter(Boolean) })} placeholder="AAPL, ^GSPC, BTC-USD" /></label>;
    case 'chart': return <>
      <label>Ticker<input type="text" defaultValue={c.symbol ?? '^GSPC'} onBlur={e => set({ symbol: e.target.value.trim().toUpperCase() })} /></label>
      <label>Range<select value={c.range ?? '1mo'} onChange={e => set({ range: e.target.value as MarketRange })}>{(Object.keys(rangeNames) as MarketRange[]).map(r => <option key={r} value={r}>{rangeNames[r]}</option>)}</select></label>
    </>;
    case 'news': return <label>Companies, people or topics to track, one per line. Add your own name to track yourself.<textarea rows={4} defaultValue={(c.topics ?? catalog.news.config!.topics!).join('\n')} onBlur={e => set({ topics: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} /></label>;
    case 'trend': return <>
      <label>Metric<select value={c.metric ?? 'recovery'} onChange={e => set({ metric: e.target.value as TrendMetric })}>{(Object.keys(metricMeta) as TrendMetric[]).map(m => <option key={m} value={m}>{metricMeta[m].name}</option>)}</select></label>
      <label>Days<select value={c.days ?? 30} onChange={e => set({ days: Number(e.target.value) })}>{[7, 14, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d}</option>)}</select></label>
    </>;
    case 'note': return <label>Text<textarea rows={5} defaultValue={c.text ?? ''} onBlur={e => set({ text: e.target.value })} /></label>;
    case 'ai': return <label>What should this card show, and how?<textarea rows={4} defaultValue={c.prompt ?? ''} onBlur={e => set({ prompt: e.target.value.trim() })} /></label>;
    default: return null;
  }
}
