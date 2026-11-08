import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { Prefs } from '../api';

// The background popup (owner, November 5, 2026: "double click or like two finger click the background to add a widget
// or something like formatting settings when u deep click the background like a tiny little popup with some things
// like add new widget or like font size"). A double click, a right click or a two-finger click on empty background
// opens a small glass card where the pointer is. Esc, a click elsewhere or any choice closes it.

// Anything you can use or read is not background: cards, controls, Ox, the chat bar, other popups.
const solid = '.card, .cloud-panel, .cloud-core, .cloud-said, .cloud-facts, .cloud-hello, .cloud-time, .cloud-widget-line, button, a, input, textarea, select, label, [role="dialog"], .bg-menu, .board-bar, .builder, .people-strip';

export interface Spot { x: number; y: number }

export function useBackgroundMenu() {
  const [at, setAt] = useState<Spot | null>(null);
  const open = useCallback((e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(solid)) return;
    // A double click would also select the word under it.
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    setAt({ x: e.clientX, y: e.clientY });
  }, []);
  const close = useCallback(() => setAt(null), []);
  return { at, close, handlers: { onContextMenu: open, onDoubleClick: open } };
}

export function BackgroundMenu({ at, onClose, label, children }: { at: Spot; onClose: () => void; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: at.x, top: at.y });
  // Opens where you clicked, nudged inside the window.
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPlace({ left: Math.max(12, Math.min(at.x, innerWidth - r.width - 12)), top: Math.max(12, Math.min(at.y, innerHeight - r.height - 12)) });
  }, [at.x, at.y, children]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    // Wait for the click that opened it to finish.
    const t = window.setTimeout(() => document.addEventListener('pointerdown', away), 0);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('hashchange', onClose);
    window.addEventListener('resize', onClose);
    return () => { window.clearTimeout(t); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc, true); window.removeEventListener('hashchange', onClose); window.removeEventListener('resize', onClose); };
  }, [onClose]);
  return <div ref={box} className="bg-menu" role="dialog" aria-label={label} style={{ left: place.left, top: place.top }}>{children}</div>;
}

// One row of choices, the current one filled in.
export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="bg-choice" role="radiogroup" aria-label={label}>
    <span className="bg-choice-label" aria-hidden="true">{label}</span>
    <span className="bg-choice-options">{options.map(([v, name]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{name}</button>)}</span>
  </div>;
}

// Text size is the one formatting choice every page shares; it is the profile's "Large text".
export function TextSize({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (fn: (p: Prefs) => Prefs) => void }) {
  return <Choice label="Text size" value={prefs.profile?.large ? 'large' : 'default'} options={[['default', 'Default'], ['large', 'Large']]}
    onChange={v => setPrefs(p => ({ ...p, profile: { ...p.profile, large: v === 'large' } }))} />;
}
