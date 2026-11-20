import type { ServerResponse } from 'node:http';
import type { Activity, ActivityKind } from './types.ts';

// What Taurus is doing, as it happens (owner, November 1, 2026): every pull, AI call, tool, browser step and action,
// streamed to the Activity terminal and the "Taurus is working" line. Kept in memory only, the last 300 lines.

const MAX = 300;
const entries: Activity[] = [];
const listeners = new Set<ServerResponse>();
const lastSeen = new Map<string, number>();
let seq = 0;

function emit(entry: Activity) {
  const at = entries.findIndex(e => e.id === entry.id);
  if (at >= 0) entries[at] = entry; else { entries.push(entry); if (entries.length > MAX) entries.shift(); }
  const line = `data: ${JSON.stringify(entry)}\n\n`;
  for (const res of listeners) res.write(line);
}

// A one-off line: "Waiting for your OK: Reply to Sam".
export function note(kind: ActivityKind, text: string, extra: Partial<Pick<Activity, 'detail' | 'by'>> = {}) {
  emit({ id: ++seq, at: new Date().toISOString(), kind, text, state: 'note', ...extra });
}

export interface Step { done: (text?: string, detail?: string) => void; fail: (error: unknown) => void }
const quiet: Step = { done: () => undefined, fail: () => undefined };

// A line that starts running and then finishes in place. `every` skips repeats of the same key inside that window,
// so widgets that poll every minute don't flood the log.
export function begin(kind: ActivityKind, text: string, options: { every?: number; key?: string; by?: 'taurus' | 'you' } = {}): Step {
  if (options.every) {
    const key = options.key ?? `${kind}:${text}`;
    const last = lastSeen.get(key) ?? 0;
    if (Date.now() - last < options.every) return quiet;
    lastSeen.set(key, Date.now());
  }
  const started = Date.now();
  const entry: Activity = { id: ++seq, at: new Date().toISOString(), kind, text, state: 'running', ...(options.by ? { by: options.by } : {}) };
  emit(entry);
  let finished = false;
  return {
    done(after, detail) { if (finished) return; finished = true; emit({ ...entry, text: after ?? entry.text, state: 'done', ms: Date.now() - started, ...(detail ? { detail } : {}) }); },
    fail(error) { if (finished) return; finished = true; emit({ ...entry, state: 'failed', ms: Date.now() - started, detail: error instanceof Error ? error.message : String(error) }); },
  };
}

export const recent = () => entries.slice(-200);

export function stream(res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(`event: hello\ndata: ${JSON.stringify(recent())}\n\n`);
  listeners.add(res);
  const keep = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  res.on('close', () => { clearInterval(keep); listeners.delete(res); });
}

// For tests.
export function resetActivity() { entries.length = 0; lastSeen.clear(); }
