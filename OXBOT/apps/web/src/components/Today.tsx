import { useState, type FormEvent, type ReactNode } from 'react';
import { ago, clock, type CalendarEvent, type Dashboard, type Section } from '../api';

interface Props { data: Dashboard | null; error: string; onAsk: (question: string) => void; now: number }

function Heading({ title, data, section, extra }: { title: string; data: Dashboard; section: Section; extra?: ReactNode }) {
  const state = data.sections[section];
  return <>
    <div className="section-head">
      <h2 id={section}>{title}{extra}</h2>
      <span className="source">{state.live ? state.sources.join(', ') : <a href="#connections">Sample</a>}</span>
    </div>
    {state.errors.map(error => <p key={error} className="problem">{error} <a href="#connections">Fix</a></p>)}
  </>;
}

const sameDay = (iso: string, offset: number) => {
  const day = new Date(); day.setDate(day.getDate() + offset);
  return iso.length === 10 ? iso === day.toLocaleDateString('en-CA') : new Date(iso).toDateString() === day.toDateString();
};
const minutes = (n?: number) => n === undefined ? undefined : `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m`;

function Schedule({ events, now }: { events: CalendarEvent[]; now: number }) {
  const today = events.filter(e => sameDay(e.start, 0)), tomorrow = events.filter(e => sameDay(e.start, 1));
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
  const nowLine = <li key="now" className="now-line" aria-label={`Now, ${clock(new Date(now).toISOString())}`}><time>{clock(new Date(now).toISOString())}</time><span /></li>;
  const todayRows = today.map(row);
  if (today.length) todayRows.splice(nowIndex === -1 ? today.length : nowIndex, 0, nowLine);
  return <>
    {today.length ? <ol className="events">{todayRows}</ol> : <p className="empty">Nothing else today.</p>}
    {tomorrow.length > 0 && <><h3 className="subhead">Tomorrow</h3><ol className="events">{tomorrow.map(row)}</ol></>}
  </>;
}

export function Today({ data, error, onAsk, now }: Props) {
  const [question, setQuestion] = useState('');
  const date = new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (!data) return <main id="main" tabIndex={-1} className="today"><p className="date">{date}</p><h1 className="brief">{error || 'Loading.'}</h1></main>;

  const sampleCount = Object.values(data.sections).filter(s => !s.live).length;
  const submit = (event: FormEvent) => { event.preventDefault(); if (question.trim()) { onAsk(question.trim()); setQuestion(''); } };
  const b = data.body;
  const bodyRows: [string, string | undefined][] = [
    ['Recovery', b.recovery !== undefined ? `${b.recovery}%` : undefined],
    ['Readiness', b.readiness?.toString()],
    ['Sleep', minutes(b.sleepMinutes) && `${minutes(b.sleepMinutes)}${b.sleepScore ? `, score ${b.sleepScore}` : ''}`],
    ['HRV', b.hrv !== undefined ? `${b.hrv} ms` : undefined],
    ['Resting heart rate', b.restingHr !== undefined ? `${b.restingHr} bpm` : undefined],
    ['Strain', b.strain?.toString()],
    ['Last workout', b.lastWorkout && [b.lastWorkout.km !== undefined ? `${b.lastWorkout.km} km` : b.lastWorkout.name, `${b.lastWorkout.minutes} min`, `${ago(b.lastWorkout.at)} ago`].join(' · ')],
    ['Last 7 days', b.weekKm !== undefined ? `${b.weekKm} km` : undefined],
  ];

  return <main id="main" tabIndex={-1} className="today">
    <p className="date">{date}</p>
    <h1 className="brief">{data.brief}</h1>
    {sampleCount > 0 && <p className="sample-note">{sampleCount === 5 ? 'Everything below is sample data.' : `${sampleCount} of 5 sections show sample data.`} <a href="#connections">Connect your accounts</a></p>}
    {error && <p className="problem">{error}</p>}

    <form className="ask-line" onSubmit={submit}>
      <label className="sr-only" htmlFor="ask-today">Ask OXBOT</label>
      <input id="ask-today" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask OXBOT anything about your day" autoComplete="off" maxLength={2000} />
      <button type="submit">Ask</button>
    </form>

    <div className="columns">
      <div>
        <section aria-labelledby="needs">
          <Heading title="Needs you" data={data} section="needs" extra={data.needs.length > 0 && <span className="count">{data.needs.length}</span>} />
          {data.needs.length === 0 ? <p className="empty">Nothing is waiting on you.</p> : <ol className="needs">
            {data.needs.map(n => <li key={n.id} className={n.vip ? 'vip' : undefined}>
              <p className="need-meta"><span>{n.who ? `${n.who} · ` : ''}{n.source}{n.vip && ' · VIP'}</span><span>{ago(n.at)}</span></p>
              <p className="need-title">{n.url ? <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a> : n.title}</p>
              {n.detail && <p className="need-detail">{n.detail}</p>}
            </li>)}
          </ol>}
        </section>
        <section aria-labelledby="schedule">
          <Heading title="Schedule" data={data} section="schedule" />
          <Schedule events={data.schedule} now={now} />
        </section>
      </div>
      <div>
        <section aria-labelledby="body">
          <Heading title="Body" data={data} section="body" />
          <dl className="figures">{bodyRows.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </section>
        <section aria-labelledby="numbers">
          <Heading title="Numbers" data={data} section="numbers" />
          {data.numbers.length === 0 ? <p className="empty">No rows in your sheet yet.</p> : <dl className="figures">{data.numbers.map(m => <div key={`${m.source}${m.label}`}><dt>{m.label}</dt><dd>{m.value}{m.change && <span className="change">{m.change}</span>}</dd></div>)}</dl>}
        </section>
        <section aria-labelledby="inbox">
          <Heading title="Inbox" data={data} section="inbox" />
          <dl className="figures">{data.inbox.map(i => <div key={i.source}><dt>{i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.source}</a> : i.source}</dt><dd>{i.unread} <span className="unit">{i.label}</span></dd></div>)}</dl>
        </section>
      </div>
    </div>
    <p className="footnote">Updated {clock(data.generatedAt)}{data.briefBy !== 'rules' && ` · Summary by ${data.briefBy}`}</p>
  </main>;
}
