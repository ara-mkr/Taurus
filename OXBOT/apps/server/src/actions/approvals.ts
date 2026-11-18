import { createHash, randomUUID } from 'node:crypto';
import { note } from '../activity.ts';
import { onConnect, send } from '../ring.ts';
import { HttpError, store } from '../store.ts';
import type { ApprovedVia, Proposal } from '../types.ts';

// The approval system (owner, November 1, 2026): OXBOT proposes one concrete action, the owner approves, edits or
// declines it, and only then does it run. Nothing here runs an action on its own. Every proposal and its outcome
// is kept in ~/.oxbot/actions.json, owner-only, never in the repo.

/* eslint-disable @typescript-eslint/no-explicit-any -- action arguments come from the AI as JSON */
export type Args = Record<string, any>;

// What an action shows before it runs. payload is exactly what run() receives; the digest covers both.
export interface Prepared {
  title: string; to?: string; text?: string;
  lines?: { label: string; value: string }[];
  purchase?: Proposal['purchase']; caution?: string; open?: string;
  items?: Proposal['items'];
  payload: Args;
}
export interface Spec {
  kind: string; app: string;
  // What the AI is told this action does, and the arguments it takes.
  help: string;
  // undefined when ready; otherwise what to set up, in words.
  missing: () => string | undefined;
  prepare: (args: Args) => Promise<Prepared>;
  // Returns a short receipt. Throws HttpError when the provider answered no; any other error means "unknown".
  run: (payload: Args) => Promise<string>;
  // The text can be edited before approving; editing prepares the action again with the new text.
  editable?: boolean;
  ttlMinutes?: number;
  // A batch: the payload for only the items the owner left checked (a subset of what they saw).
  narrow?: (payload: Args, keep: string[]) => Args;
}

const specs = new Map<string, Spec>();
export const register = (...list: Spec[]) => { for (const s of list) specs.set(s.kind, s); };
export const spec = (kind: string) => specs.get(kind);
export const allSpecs = () => [...specs.values()];

interface Stored extends Proposal { args: Args; payload: Args }
const LOG = 'actions.json';
const MAX_PENDING = 12;
const load = () => store.doc<Stored[]>(LOG, []);
let all: Stored[] = load();
const save = () => store.saveDoc(LOG, all.slice(-500));

// Only what the owner sees; the arguments and payload stay on the server.
const shown = ({ args: _a, payload: _p, ...p }: Stored): Proposal => p;
const digestOf = (p: Pick<Stored, 'kind' | 'payload' | 'title' | 'to' | 'text' | 'purchase' | 'items'>) =>
  createHash('sha256').update(JSON.stringify([p.kind, p.payload, p.title, p.to ?? '', p.text ?? '', p.purchase ?? null, ...(p.items ? [p.items] : [])])).digest('hex').slice(0, 32);

function expire() {
  const now = Date.now();
  for (const p of all) if (p.state === 'pending' && Date.parse(p.expiresAt) <= now) { p.state = 'expired'; p.decidedAt = new Date().toISOString(); save(); send('approval', shown(p)); }
}
setInterval(expire, 15_000).unref();
onConnect(() => { expire(); return all.filter(p => p.state === 'pending').map(p => ({ event: 'approval', data: shown(p) })); });

export const pending = () => { expire(); return all.filter(p => p.state === 'pending').map(shown); };
export const log = (limit = 60) => { expire(); return all.slice(-limit).reverse().map(shown); };
export const get = (id: string) => { expire(); const p = all.find(x => x.id === id); return p && shown(p); };
// For the test guard: is an approved action running right now?
let running = 0;
export const runningNow = () => running;

// Has OXBOT ever finished an action to this exact address before? A first time is worth a second look.
const seen = (kind: string, to?: string) => Boolean(to && all.some(p => p.state === 'done' && p.to === to && p.kind.split('.')[0] === kind.split('.')[0]));

export async function propose(kind: string, args: Args, from: Proposal['from']): Promise<Proposal> {
  const s = specs.get(kind);
  if (!s) throw new HttpError(400, `OXBOT has no action called ${kind}.`);
  const missing = s.missing();
  if (missing) throw new HttpError(409, missing);
  expire();
  if (all.filter(p => p.state === 'pending').length >= MAX_PENDING) throw new HttpError(429, 'Twelve actions are already waiting for you. Approve or decline some first.');
  const ready = await s.prepare(args);
  // Only for people: an address or number that came from a message OXBOT read is worth a second look.
  const first = ready.to && /^(email|text|call)\./.test(kind) && !seen(kind, ready.to) ? `First time OXBOT contacts ${ready.to}.` : undefined;
  const now = Date.now();
  const p: Stored = {
    id: randomUUID(), kind, app: s.app, title: ready.title, to: ready.to, text: ready.text, lines: ready.lines ?? [], purchase: ready.purchase,
    caution: [ready.caution, first].filter(Boolean).join(' ') || undefined, open: ready.open, ...(ready.items ? { items: ready.items } : {}), editable: Boolean(s.editable && ready.text !== undefined), from,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + (s.ttlMinutes ?? (ready.purchase ? 10 : 15)) * 60_000).toISOString(),
    state: 'pending', digest: '', args, payload: ready.payload,
  };
  p.digest = digestOf(p);
  all.push(p); save(); send('approval', shown(p));
  note('action', `Waiting for your OK: ${p.title}`);
  return shown(p);
}

export function decline(id: string, via: ApprovedVia = 'board'): Proposal {
  expire();
  const p = all.find(x => x.id === id);
  if (!p) throw new HttpError(404, 'No such action.');
  if (p.state !== 'pending') throw new HttpError(409, `That action is already ${p.state}.`);
  Object.assign(p, { state: 'declined', decidedAt: new Date().toISOString(), via });
  save(); send('approval', shown(p));
  note('action', `You declined: ${p.title}`);
  return shown(p);
}

// The one door to every action. digest must be the version the owner saw; an edited text prepares the action
// again and that new version is what runs, because the owner approved exactly what they typed.
export async function approve(id: string, input: { digest: string; text?: string; via?: ApprovedVia; keep?: string[] }): Promise<Proposal> {
  expire();
  const p = all.find(x => x.id === id);
  if (!p) throw new HttpError(404, 'No such action.');
  if (p.state === 'expired') throw new HttpError(410, 'That approval expired. Ask again and OXBOT will check everything afresh.');
  if (p.state !== 'pending') throw new HttpError(409, `That action is already ${p.state}.`);
  if (!input.digest || input.digest !== p.digest) throw new HttpError(409, 'That action changed after you saw it. Look at it again before approving.');
  const s = specs.get(p.kind)!;
  // A batch runs only the items left checked, each one of those the owner saw on the card.
  let keep: string[] | undefined;
  if (input.keep !== undefined) {
    const ids = new Set((p.items ?? []).map(i => i.id));
    keep = [...new Set(input.keep.map(String))];
    if (!s.narrow || !p.items) throw new HttpError(400, 'This action has nothing to uncheck.');
    if (!keep.length) throw new HttpError(400, 'Nothing is checked. Decline it instead.');
    if (keep.some(k => !ids.has(k))) throw new HttpError(409, 'That item wasn’t on the card you saw.');
  }
  // Claim it before anything awaits, so a second tap (or a second screen) can never run it twice.
  p.state = 'running';
  p.decidedAt = new Date().toISOString(); p.via = input.via ?? 'board';
  save(); send('approval', shown(p));
  try {
    const missing = s.missing();
    if (missing) throw new HttpError(409, missing);
    if (typeof input.text === 'string' && input.text.trim() && input.text !== p.text) {
      if (!p.editable) throw new HttpError(400, 'This action can’t be edited.');
      const again = await s.prepare({ ...p.args, text: input.text.trim().slice(0, 8000) });
      Object.assign(p, { title: again.title, to: again.to, text: again.text, lines: again.lines ?? [], payload: again.payload });
      p.digest = digestOf(p);
    }
    if (keep && s.narrow) { p.payload = s.narrow(p.payload, keep); p.kept = keep; }
    else if (p.items) p.kept = p.items.map(i => i.id);
    running++;
    try { p.result = await s.run(p.payload); } finally { running--; }
    p.state = 'done';
  } catch (error) {
    // A provider that answered "no" failed cleanly. Anything else (timeout, dropped connection) may have gone
    // through, so OXBOT never retries it on its own: the owner checks and asks again if it didn't.
    const said = error instanceof HttpError && error.status < 500;
    p.state = said ? 'failed' : 'unknown';
    p.result = said ? (error as Error).message : `OXBOT can’t tell whether this went through (${(error as Error).message}). Check ${p.app} before trying again.`;
  }
  save(); send('approval', shown(p));
  note('action', `${p.state === 'done' ? 'Done' : p.state === 'failed' ? 'Failed' : 'Not sure it went through'}: ${p.title}`, p.result ? { detail: p.result.slice(0, 300) } : {});
  return shown(p);
}

// Plain words for reading an action aloud on a phone call.
export function spoken(p: Proposal) {
  const parts = [p.title.replace(/\.$/, '')];
  if (p.purchase) parts.push(`${p.purchase.item} from ${p.purchase.place}, ${p.purchase.total}`);
  if (p.text) parts.push(`saying: ${p.text.slice(0, 500)}`);
  const said = parts.map(x => x.trim().replace(/[.!?]+$/, '')).join('. ');
  return `${said}.`;
}
