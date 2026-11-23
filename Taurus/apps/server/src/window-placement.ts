// A fixed command path: no model call, shell, coordinates supplied by a model or saved replay.
export function windowPlacement(text: string): { app: string; side: 'left' | 'right' | 'maximize' } | null {
  const match = text.match(/^(?:move|put|snap|tile)\s+(.+?)\s+(?:over\s+)?(?:to|on)\s+(?:the\s+)?(left|right)(?:\s+(?:hand\s+)?(?:side|half))?(?:\s+of\s+(?:(?:my|the|this)\s+)?(?:screen|monitor|display))?$/i);
  const full = text.match(/^(?:maximize|full screen)\s+(.+?)(?:\s+window)?$/i);
  if (!match && !full) return null;
  const app = (match?.[1] ?? full![1]).replace(/^(?:the|my)\s+/i, '').replace(/\s+(?:app|window)$/i, '').trim();
  if (!app || app.length > 80 || /\b(and|then|after|before)\b/i.test(app)) return null;
  return { app, side: match ? match[2].toLowerCase() as 'left' | 'right' : 'maximize' };
}
