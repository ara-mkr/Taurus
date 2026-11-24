import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { isMadeBot, makeBot, stateNames, tellBot, timeOf, useBots, type Bot, type BotLine } from '../bots';
import { Logo } from './Logo';
import { inkOn, Mascot } from './Mascot';

// Bots (owner, November 23, 2026: "a new tab on the left called Bots, and then u see a list of all the bots and like the
// openmaus ui of the entire chat with each bot"). Left, every bot working for you this session, live ones first, each
// with its last line and a status light; right, one bot's whole history the way the owner's OpenMausBot shows a chat:
// compact rows for each step ("✓ did this"), long runs of steps folded under "Worked for 3 min", answers and findings as
// cards, your own messages on the right, and a message box at the bottom. Messages go to Taurus; about a helper, they ask
// Taurus about that helper (helpers take their jobs only from him). History comes from bots.ts and lasts this session.

const alone: Bot = { id: 'taurus', name: 'Taurus', role: 'Chief of staff', colour: 'var(--ink)', state: 'idle', doing: 'Standing by.', live: true, lines: [] };
const idFromHash = () => decodeURIComponent(location.hash.replace(/^#bots\/?/, '')) || 'taurus';
const took = (from: string, to: string) => { const s = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`; };

function Avatar({ bot, size = 34 }: { bot: Bot; size?: number }) {
  return <span className={`bots-avatar ${bot.id === 'taurus' ? 'is-taurus' : ''}`} style={{ '--c': bot.colour, '--s': `${size}px`, ...(bot.id === 'taurus' ? {} : { color: inkOn(bot.colour) }) } as CSSProperties} aria-hidden="true">
    {bot.id === 'taurus' ? <Logo height={Math.round(size * 0.5)} /> : <Mascot id={bot.id} size={Math.round(size * 0.72)} />}
  </span>;
}

// Steps in a row stay together; anything said (an answer, a finding, your message) stands on its own.
type Group = { kind: 'work'; lines: BotLine[] } | { kind: 'say'; line: BotLine };
const said = (l: BotLine) => l.kind === 'you' || l.kind === 'reply' || l.kind === 'result';
function grouped(lines: BotLine[]): Group[] {
  const out: Group[] = [];
  for (const l of lines) {
    if (said(l)) { out.push({ kind: 'say', line: l }); continue; }
    const last = out.at(-1);
    if (last?.kind === 'work') last.lines.push(l); else out.push({ kind: 'work', lines: [l] });
  }
  return out;
}
const mark = (l: BotLine) => l.kind === 'fail' ? '✕' : l.running ? '•' : l.kind === 'thought' ? '…' : '✓';

function Steps({ lines }: { lines: BotLine[] }) {
  return <ul className="bots-steps">{lines.map((l, i) => <li key={`${l.ref ?? ''}${i}`} className="bots-step" data-kind={l.kind} data-running={l.running || undefined}>
    <span className="bots-mark" aria-hidden="true">{mark(l)}</span><span className="bots-step-text">{l.text}</span><time dateTime={l.at}>{timeOf(l.at)}</time>
  </li>)}</ul>;
}

function Work({ lines, last }: { lines: BotLine[]; last: boolean }) {
  if (lines.length <= 3) return <Steps lines={lines} />;
  // A long run folds away, like OpenMausBot's "Worked for 9m 44s"; the latest run stays open.
  return <details className="bots-worked" open={last}>
    <summary>Worked for {took(lines[0].at, lines.at(-1)!.at)} · {lines.length} steps</summary>
    <Steps lines={lines} />
  </details>;
}

export function BotsPage({ onAsk, pending }: { onAsk: (question: string) => void; pending: boolean }) {
  const all = useBots();
  const bots = all.length ? all : [alone];
  const [chosen, setChosen] = useState(idFromHash);
  useEffect(() => {
    const follow = () => { if (location.hash.startsWith('#bots')) setChosen(idFromHash()); };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  const bot = bots.find(b => b.id === chosen) ?? bots[0];
  const [draft, setDraft] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [bot.id, bot.lines.length]);
  const groups = grouped(bot.lines);
  const mine = isMadeBot(bot.id);
  const busy = mine ? bot.state === 'working' : pending;
  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (mine) void tellBot(bot.id, text);
    else onAsk(bot.id === 'taurus' ? text : `About ${bot.name} (${bot.role}${bot.where ? `, on ${bot.where}` : ''}): ${text}`);
    setDraft('');
  };
  // A new bot: a name and a job, then it starts (owner, November 23, 2026: "in bots u cant create a new bot").
  const [making, setMaking] = useState(false);
  const [newName, setNewName] = useState('');
  const [newJob, setNewJob] = useState('');
  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!newJob.trim()) return;
    const id = makeBot(newName, newJob);
    setMaking(false); setNewName(''); setNewJob('');
    location.hash = `#bots/${encodeURIComponent(id)}`;
  };
  const enter = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  return <main id="main" tabIndex={-1} className="bots deck-look">
    <nav className="deck-win bots-list" aria-label="Bots">
      <header className="deck-bar"><h2>Bots</h2><span className="deck-count">{bots.filter(b => b.live && b.state === 'working').length} working</span></header>
      <div className="bots-new">
        {!making ? <button type="button" className="primary" onClick={() => setMaking(true)}>New bot</button>
          : <form className="bots-new-form" onSubmit={create} aria-label="New bot">
            <label>Name<input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Inbox Zero" maxLength={40} autoFocus /></label>
            <label>What should it do?<textarea rows={3} value={newJob} onChange={e => setNewJob(e.target.value)} placeholder="Go through my inbox and tell me what needs a reply today" maxLength={200} /></label>
            <div className="bots-new-actions"><button type="submit" className="primary" disabled={!newJob.trim()}>Start</button><button type="button" onClick={() => setMaking(false)}>Cancel</button></div>
          </form>}
      </div>
      <ul>
        {bots.map(b => { const last = b.lines.at(-1); return <li key={b.id}>
          <a className="bots-item" href={`#bots/${encodeURIComponent(b.id)}`} aria-current={b.id === bot.id ? 'page' : undefined}>
            <Avatar bot={b} />
            <span className="bots-item-text"><strong>{b.name}</strong><span>{last?.text ?? b.doing}</span></span>
            <span className="bots-item-meta">{last && <time dateTime={last.at}>{timeOf(last.at)}</time>}
              <span className="bot-light" data-state={b.state} role="img" aria-label={stateNames[b.state]} /></span>
          </a>
        </li>; })}
      </ul>
    </nav>

    <section className="deck-win bots-chat" aria-labelledby="bots-name">
      <header className="bots-head">
        <Avatar bot={bot} size={40} />
        <div><h1 id="bots-name">{bot.name}</h1><p><span className="bots-role">{bot.role}</span> {stateNames[bot.state]}{bot.where ? ` · ${bot.where}` : ''}</p></div>
      </header>
      <div className="bots-timeline" role="log" aria-label={`Everything ${bot.name} did`} tabIndex={0}>
        {bot.frame && <figure className="bots-screen"><img src={bot.frame} alt={bot.where ? `What ${bot.name} sees on ${bot.where}` : `What ${bot.name} sees`} draggable={false} />
          <figcaption>Live{bot.where ? ` · ${bot.where}` : ''}</figcaption></figure>}
        {groups.length ? groups.map((g, i) => g.kind === 'work' ? <Work key={`w${i}`} lines={g.lines} last={i === groups.length - 1 || i === groups.length - 2} />
          : <article key={`s${i}`} className={`bots-say is-${g.line.kind}`} aria-label={g.line.kind === 'you' ? 'You' : bot.name}>
            <p>{g.line.text}</p><time dateTime={g.line.at}>{g.line.kind === 'you' ? 'You' : g.line.kind === 'result' ? 'Found' : bot.name} · {timeOf(g.line.at)}</time>
          </article>)
          : <p className="bots-empty">Nothing yet. Every step {bot.name} takes shows here as it happens.</p>}
        <div ref={end} />
      </div>
      <form className="bots-composer" onSubmit={send}>
        <label className="sr-only" htmlFor="bots-message">{bot.id === 'taurus' ? 'Message Taurus' : mine ? `Message ${bot.name}` : `Ask Taurus about ${bot.name}`}</label>
        <textarea id="bots-message" rows={1} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={enter}
          placeholder={bot.id === 'taurus' ? 'Message Taurus' : mine ? `Message ${bot.name}` : `Ask Taurus about ${bot.name}`} />
        <button type="submit" className="primary" disabled={!draft.trim() || busy}>Send</button>
      </form>
    </section>
  </main>;
}
