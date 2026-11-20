import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { note } from './activity.ts';
import { register, type Spec } from './actions/approvals.ts';
import { HttpError, store } from './store.ts';

// Helpers in other apps (owner, November 5, 2026: "Yes, plan it", then "just do everything in sequential order";
// docs/19-computer-use.md). The server never touches the screen itself. The desktop app runs the fixed-verb
// taurus-hands program and listens here for steps; this side asks for them, checks what is consequential (that becomes
// an approval card, never a click), and hands the results to the AI. Only the desktop app that started this server
// holds the token, so nothing else can pose as it.

const token = process.env.TAURUS_HANDS_TOKEN ?? '';
let desk: ServerResponse | undefined;
const waiting = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
const stopListeners = new Set<(reason: string) => void>();

export interface HandsSettings { on: boolean; act: string[]; look: string[]; chrome: boolean }
const defaults: HandsSettings = { on: false, act: ['Canva', 'Notes'], look: ['Google Chrome'], chrome: false };
// The desktop app writes ~/.taurus/hands.json from its tray menu; here it is only read.
export function handsSettings(): HandsSettings {
  try { return { ...defaults, ...JSON.parse(readFileSync(join(store.dir, 'hands.json'), 'utf8')) }; } catch { return { ...defaults }; }
}

export const handsReady = () => Boolean(desk);
const loopback = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
export function trusted(req: IncomingMessage) {
  const offered = String(req.headers['x-taurus-hands'] ?? '');
  return Boolean(token) && loopback(req) && offered.length === token.length && offered === token;
}

// The desktop app's end of the line: steps go out as SSE, results come back by POST.
export function connect(res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(': hands\n\n');
  desk?.end();
  desk = res;
  const keep = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  res.on('close', () => {
    clearInterval(keep);
    if (desk !== res) return;
    desk = undefined;
    for (const [id, w] of waiting) { clearTimeout(w.timer); w.reject(new Error('Taurus’s desktop app went away.')); waiting.delete(id); }
  });
}
export function result(body: { id?: string; ok?: boolean; data?: unknown; error?: string }) {
  const w = body.id ? waiting.get(body.id) : undefined;
  if (!w) return false;
  clearTimeout(w.timer);
  waiting.delete(body.id!);
  if (body.ok) w.resolve(body.data); else w.reject(new HttpError(409, String(body.error ?? 'That didn’t work.').slice(0, 300)));
  return true;
}
// Esc, touching the mouse, Lock: the desktop app says so and every helper in an app stops.
export function stopped(reason: string) {
  note('mac', `Helpers stopped: ${reason}`, { by: 'you' });
  for (const fn of stopListeners) fn(reason);
}
export function onStopped(fn: (reason: string) => void) { stopListeners.add(fn); return () => { stopListeners.delete(fn); }; }

export interface Who { name: string; colour: string }
export async function hands<T = Record<string, unknown>>(verb: string, args: Record<string, unknown> = {}, who?: Who): Promise<T> {
  if (!desk) throw new HttpError(409, 'Helpers in other apps need Taurus’s desktop app open on this Mac.');
  const id = randomUUID();
  const out = desk;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new HttpError(504, 'The step took too long; whether it happened is unknown, so it won’t be repeated.')); }, verb === 'look' ? 25_000 : 30_000);
    waiting.set(id, { resolve: v => resolve(v as T), reject, timer });
    out.write(`event: request\ndata: ${JSON.stringify({ id, verb, args, who })}\n\n`);
  });
}

// One real pointer: helpers take turns with it.
let line: Promise<unknown> = Promise.resolve();
export function turn<T>(work: () => Promise<T>): Promise<T> {
  const mine = line.then(work, work);
  line = mine.catch(() => undefined);
  return mine;
}

// ---------- Reading, and deciding what is consequential ----------

export interface Element { id: number; role: string; label?: string; value?: string; x: number; y: number; w: number; h: number; secure?: boolean }
export interface Tree { app: string; title: string; window?: { x: number; y: number; w: number; h: number }; elements: Element[] }
const last = new Map<string, Tree>();
export async function readApp(app: string, who?: Who): Promise<Tree> {
  const t = await hands<Tree>('tree', { app }, who);
  last.set(app.toLowerCase(), t);
  return t;
}
// What the AI sees of an app: one line per element. Field values are shown, never passwords.
export function treeText(t: Tree) {
  return `${t.app}: ${t.title || '(untitled window)'}\n` + t.elements.slice(0, 220).map(e => `[${e.id}] ${e.role}${e.label ? ` “${e.label}”` : ''}${e.value !== undefined ? ` = “${String(e.value).slice(0, 80)}”` : ''} at ${e.x},${e.y}`).join('\n');
}

const weighty = /\b(send|sent|post|publish|share|invite|buy|purchase|pay|order|check ?out|delete|remove|trash|sign ?in|log ?in|login|sign ?up|submit|transfer|subscribe|book|reserve|confirm|accept|unsubscribe|empty)\b/i;
export interface Step { app: string; do: string; id?: number; x?: number; y?: number; toX?: number; toY?: number; text?: string; key?: string; dy?: number; says?: string }
const acts = ['front', 'press', 'focus', 'move', 'click', 'drag', 'scroll', 'type', 'key'];
// A step is consequential when what it says it does, the element it touches, or what it types sounds like sending,
// posting, sharing, buying, deleting, inviting or signing in.
export function consequential(step: Step): string {
  const t = last.get(step.app.toLowerCase());
  const el = step.id !== undefined ? t?.elements.find(e => e.id === step.id) : undefined;
  const near = step.x !== undefined && step.y !== undefined ? t?.elements.find(e => Math.abs(e.x - step.x!) <= e.w / 2 && Math.abs(e.y - step.y!) <= e.h / 2) : undefined;
  const words = [step.says, el?.label, near?.label, step.do === 'key' && step.key === 'return' ? 'submit' : ''].filter(Boolean).join(' · ');
  return weighty.test(words) ? words : '';
}

export async function doStep(step: Step, who?: Who): Promise<Tree | undefined> {
  if (!acts.includes(step.do)) throw new HttpError(400, `do must be one of ${acts.join(', ')}.`);
  const args: Record<string, unknown> = { app: step.app };
  for (const k of ['id', 'x', 'y', 'toX', 'toY', 'text', 'key', 'dy'] as const) if (step[k] !== undefined) args[k] = step[k];
  await hands(step.do, args, who);
  note('mac', `${who?.name ?? 'Taurus'} in ${step.app}: ${step.says ?? step.do}`.slice(0, 160), { by: 'taurus' });
  await new Promise(r => setTimeout(r, 350));
  return readApp(step.app, who).catch(() => undefined);
}

register({
  kind: 'hands.step', app: 'This Mac', ttlMinutes: 5,
  help: 'A step in another app that sends, posts, shares, buys, deletes, invites or signs in (Canva Share, a Send button, Place order). Args: app, do (press, click, type, key), id or x and y from app_look, text, says (what the step does, in words). The owner sees the app, the element and the words first.',
  missing: () => (desk ? undefined : 'Taurus’s desktop app isn’t open.'),
  async prepare(args) {
    const step = args as unknown as Step;
    if (!step.app || !acts.includes(step.do)) throw new HttpError(400, 'Say which app and which step.');
    const el = step.id !== undefined ? last.get(step.app.toLowerCase())?.elements.find(e => e.id === step.id) : undefined;
    return {
      title: `In ${step.app}: ${String(step.says ?? step.do).slice(0, 80)}`,
      lines: [{ label: 'App', value: step.app }, { label: 'Step', value: `${step.do}${el?.label ? ` “${el.label}”` : step.x !== undefined ? ` at ${step.x},${step.y}` : ''}` },
        ...(step.text ? [{ label: 'Types', value: String(step.text).slice(0, 200) }] : [])],
      caution: 'This clicks or types in your app for real. Check the app is showing what you expect.',
      payload: { ...step },
    };
  },
  async run(payload) {
    const step = payload as unknown as Step;
    await turn(() => doStep(step));
    return `Done in ${step.app}: ${step.says ?? step.do}.`;
  },
} satisfies Spec);

// ---------- Looking at the screen when the owner asks ----------

export function lookPhrase(text: string) {
  return /\b(?:what(?:'s| is)(?: this)? on my screen|look at (?:my|the) screen|what am i looking at|see my screen|check my screen|read my screen|what(?:'s| is) (?:this|that) (?:error|window|thing) on (?:my|the) screen)\b/i.test(text.replace(/[’]/g, '\''));
}
export async function lookAtScreen(app?: string): Promise<{ image: string; windows: { app: string; title: string }[] }> {
  return hands('look', app ? { app, maxWidth: 1440 } : { maxWidth: 1440 });
}
