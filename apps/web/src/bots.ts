import { useEffect, useSyncExternalStore } from 'react';
import { api, type Activity, type BrowserState } from './api';
import type { ChatTurn } from './components/Ask';
import { useSwarm } from './components/Swarm';

// Bots (owner, November 23, 2026: "small boxes ... around the taurus box ... depending on how many primary bots r working
// ... when u click on it ... a chat box ... of its thoughts ... a new tab on the left called Bots ... the entire chat with
// each bot"). Everyone who works for you: Taurus himself, his browser, and each helper of a swarm. App records what each
// one does into this store as it streams in (activity lines, your chat with Taurus, every step a helper takes), so a
// bot's history survives moving between pages. It lives in this window's memory only and is gone on reload; nothing is
// written anywhere. The Deck draws the boxes and the Agents window from it, the Bots page the full chat.

export type BotState = 'working' | 'waiting' | 'done' | 'failed' | 'idle';
export interface BotLine { at: string; kind: 'act' | 'thought' | 'result' | 'fail' | 'you' | 'reply'; text: string; ref?: string; running?: boolean }
export interface Bot {
  id: string; name: string; role: string; colour: string; state: BotState; doing: string; where?: string; frame?: string;
  // Working right now (drawn around Taurus), as opposed to remembered from earlier this session.
  live: boolean; lines: BotLine[];
}

const MAX_LINES = 300;
const lines = new Map<string, BotLine[]>();
const known = new Map<string, Omit<Bot, 'lines' | 'live'>>();
const listeners = new Set<() => void>();
let current: Bot[] = [];
let base: Bot[] = [];

function add(id: string, line: BotLine) {
  const list = lines.get(id) ?? [];
  // A line with the same ref is the same thing updating (a running step finishing, Taurus's answer streaming in).
  const same = line.ref ? list.findIndex(l => l.ref === line.ref) : -1;
  if (same >= 0) { const was = list[same]; if (was.text === line.text && was.kind === line.kind && was.running === line.running) return false; list[same] = { ...line, at: was.at }; }
  else { const last = list.at(-1); if (!line.ref && last && last.text === line.text && last.kind === line.kind) return false; list.push(line); }
  if (list.length > MAX_LINES) list.splice(0, list.length - MAX_LINES);
  lines.set(id, list);
  return true;
}
const hostOf = (url?: string) => { try { return url ? new URL(url).host : ''; } catch { return url ?? ''; } };

// Called once, from App: keeps every bot's history and the current list up to date.
export function useBotRecorder(log: Activity[], browser: BrowserState | null, turns: ChatTurn[], now: number) {
  const { swarm, frames } = useSwarm();
  useEffect(() => {
    const at = new Date().toISOString();
    for (const e of log) {
      if (e.kind === 'feed') continue;
      add(e.kind === 'browser' ? 'browser' : 'taurus', { at: e.at, kind: e.state === 'failed' ? 'fail' : e.kind === 'ai' ? 'thought' : 'act', text: e.text, ref: `a${e.id}`, running: e.state === 'running' });
    }
    turns.forEach((t, i) => { if (t.text) add('taurus', { at, kind: t.role === 'user' ? 'you' : 'reply', text: t.text, ref: `t${i}` }); });
    if (browser?.open && browser.title) add('browser', { at, kind: 'act', text: `On ${browser.title}${browser.url ? ` (${hostOf(browser.url)})` : ''}` });

    const running = [...log].reverse().find(e => e.state === 'running' && e.kind !== 'feed' && now - Date.parse(e.at) < 90_000);
    const last = [...log].reverse().find(e => e.kind !== 'feed');
    const live: Omit<Bot, 'lines' | 'live'>[] = [{ id: 'taurus', name: 'Taurus', role: 'Chief of staff', colour: 'var(--ink)', state: running ? 'working' : 'idle', doing: running?.text ?? (last ? `Last: ${last.text}` : 'Standing by.') }];
    if (browser?.open) live.push({ id: 'browser', name: 'Browser', role: 'Taurus’s browser', colour: '#7FC1EE', state: browser.loading || browser.by === 'taurus' ? 'working' : 'idle',
      doing: browser.title || 'Opening a page', where: hostOf(browser.url), frame: browser.frame });
    const fresh = swarm && (swarm.state === 'running' || swarm.state === 'merging' || (swarm.endedAt && now - Date.parse(swarm.endedAt) < 5 * 60_000));
    if (swarm) for (const h of swarm.helpers) {
      const id = `h-${h.id}`;
      const state: BotState = h.state === 'opening' || h.state === 'working' ? 'working' : h.state === 'waiting' ? 'waiting' : h.state === 'done' ? 'done' : 'failed';
      const doing = h.state === 'done' && h.finding ? h.finding : h.state === 'failed' ? (h.error ?? `Couldn’t open ${h.host ?? h.label}`) : h.doing;
      add(id, { at: h.at || at, kind: h.state === 'done' && h.finding ? 'result' : h.state === 'failed' || h.state === 'stopped' ? 'fail' : h.act === 'look' || h.act === 'read' ? 'thought' : 'act', text: doing });
      const bot = { id, name: h.name, role: `Helper · ${swarm.job}`, colour: h.colour, state, doing, where: h.host, frame: frames[h.id] };
      if (fresh) live.push(bot); else known.set(id, { ...bot, frame: undefined, state: state === 'working' || state === 'waiting' ? 'idle' : state });
    }
    for (const b of live) known.set(b.id, b);
    const liveIds = new Set(live.map(b => b.id));
    base = [...live.map(b => ({ ...b, live: true, lines: [...(lines.get(b.id) ?? [])] })),
      ...[...known.values()].filter(b => !liveIds.has(b.id)).map(b => ({ ...b, live: false, state: (b.state === 'working' ? 'idle' : b.state) as BotState, lines: [...(lines.get(b.id) ?? [])] }))];
    publish();
  }, [log, browser, turns, swarm, frames, now]);
}

// ---------- Bots you make (owner, November 23, 2026: "in bots u cant create a new bot") ----------
// A bot you make has a name and a job. It works on the job on its own, through Taurus (the same tools, approvals and
// rules), in its own conversation, so its steps and answers show in its own chat and you can keep talking to it there.
// Like the rest of this store it lasts until the window reloads.
interface Made { id: string; name: string; job: string; colour: string; state: BotState; doing: string; turns: { role: 'user' | 'assistant'; text: string }[] }
const made = new Map<string, Made>();
const madeColours = ['#F57EB6', '#7FC1EE', '#FFB454', '#9BE38A', '#C79BFF', '#FF7A6B', '#5FE0D0', '#F2E46B'];
let madeCount = 0;
function publish() {
  const mine = [...made.values()].map(m => ({ id: m.id, name: m.name, role: `Your bot · ${m.job}`, colour: m.colour, state: m.state, doing: m.doing, live: m.state === 'working', lines: [...(lines.get(m.id) ?? [])] }));
  current = [...base.slice(0, 1), ...mine, ...base.slice(1)];
  listeners.forEach(l => l());
}
export const isMadeBot = (id: string) => made.has(id);
export function makeBot(name: string, job: string): string {
  const id = `mine-${++madeCount}`;
  made.set(id, { id, name: name.trim().slice(0, 40) || `Bot ${madeCount}`, job: job.trim().slice(0, 200), colour: madeColours[(madeCount - 1) % madeColours.length], state: 'idle', doing: 'Starting', turns: [] });
  void tellBot(id, job);
  return id;
}
export async function tellBot(id: string, text: string) {
  const m = made.get(id);
  if (!m || !text.trim() || m.state === 'working') return;
  const at = () => new Date().toISOString();
  const n = m.turns.length;
  m.turns.push({ role: 'user', text: text.trim() });
  add(id, { at: at(), kind: 'you', text: text.trim(), ref: `u${n}` });
  m.state = 'working'; m.doing = 'Working on it'; publish();
  let reply = '', steps = 0;
  const intro = m.turns.length === 1 ? `You are "${m.name}", one of the owner's bots in Taurus. Your job: ${m.job}. Work on it now and answer briefly.

` : '';
  try {
    const answer = await api.askStream(m.turns.map((t, i) => i === 0 ? { ...t, text: intro + t.text } : t), { via: 'ask' }, {
      step: s => { add(id, { at: at(), kind: 'act', text: s, ref: `s${n}-${steps++}` }); m.doing = s; publish(); },
      text: d => { reply += d; add(id, { at: at(), kind: 'reply', text: reply, ref: `r${n}` }); publish(); },
      reset: () => { reply = ''; },
    });
    const said = answer.text || reply || 'Done.';
    m.turns.push({ role: 'assistant', text: said });
    add(id, { at: at(), kind: 'reply', text: said, ref: `r${n}` });
    m.state = 'done'; m.doing = said.split('\n')[0].slice(0, 120);
  } catch (e) {
    add(id, { at: at(), kind: 'fail', text: (e as Error).message || 'That didn’t work.', ref: `f${n}` });
    m.state = 'failed'; m.doing = 'Stopped';
  }
  publish();
}

// Everyone, Taurus first: the bots working now, then the ones remembered from earlier this session.
export function useBots(): Bot[] {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => current);
}

export const stateNames: Record<BotState, string> = { working: 'Working', waiting: 'Waiting', done: 'Done', failed: 'Stopped', idle: 'Idle' };
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
