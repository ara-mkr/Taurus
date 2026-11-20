import { onConnect, send } from './ring.ts';
import type { TaurusWindow } from './types.ts';

// Taurus windows (owner, November 4, 2026): the glass window that pops up on every open screen when Taurus does something
// you asked for out loud, so you see it happened. Kept in memory only. The ones still open (music, running timers,
// due reminders) come back when a screen connects; closing one closes it on every screen.

const open = new Map<string, TaurusWindow>();
const MAX = 12;

// Omit spread over each kind, so every kind keeps its own fields.
type Showing = TaurusWindow extends infer W ? W extends TaurusWindow ? Omit<W, 'at'> & { at?: string } : never : never;
export function show(win: Showing): TaurusWindow {
  const full = { ...win, at: win.at ?? new Date().toISOString() } as TaurusWindow;
  open.delete(full.id);
  open.set(full.id, full);
  while (open.size > MAX) open.delete(open.keys().next().value!);
  send('window', full);
  return full;
}

export function close(id: string) {
  open.delete(id);
  send('window-closed', { id });
}

export const shown = (id: string) => open.get(id);
export const openWindows = () => [...open.values()];
// For tests.
export const resetWindows = () => open.clear();

// Notes and opened links are moments, not state: a screen that connects later doesn't need them.
onConnect(() => openWindows().filter(w => w.kind === 'music' || w.kind === 'timer' || w.kind === 'reminder').map(data => ({ event: 'window', data })));
