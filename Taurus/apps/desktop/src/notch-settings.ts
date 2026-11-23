// Taurus in the notch: its settings, and where the pill goes on a screen (owner, November 6, 2026: "make it so its also
// on ur notch like look at vorssaint ... make it the ai assistant like version of the notch have all the notch
// settings similar to vorssaint settings"). The list of settings follows the ideas in Vorssaint's own notch settings
// (display, hover or click, delays, size, which side the mascot sits, what shows while idle, what appears, full
// screen, screenshots, displays without a notch, notch fit). Vorssaint is GPL-3.0 Swift; none of its code is used
// here. See docs/decision-log.md, November 6, 2026.

export type NotchDisplay = 'automatic' | 'builtin' | 'main' | 'all';
export interface NotchSettings {
  on: boolean;
  // Which screens: the one with a notch (or the main one when none has), the built-in one, the main one, or all.
  display: NotchDisplay;
  open: 'hover' | 'click';
  hoverDelay: number;
  closeDelay: number;
  size: 'compact' | 'comfortable' | 'spacious';
  mascotSide: 'left' | 'right';
  // While nothing is happening: Taurus beside the notch, or nothing, so the pill disappears into the notch.
  idle: 'taurus' | 'nothing';
  show: { answer: boolean; music: boolean; timers: boolean; ask: boolean };
  overFullScreen: boolean;
  inCaptures: boolean;
  // Screens without a notch get a small black pill at the top centre, or nothing.
  noNotch: 'pill' | 'hidden';
  dropFromTop: number;
  // How wide the camera housing is, in points; nudge it until no edge of the real notch shows.
  fitWidth: number;
  // The native notch's own settings (apps/notch-mac, November 17, 2026): sizes, fits and agents, ported from
  // Vorssaint. Kept as they came; TaurusNotch checks each field itself (Model.swift, NotchSettings.Native).
  native?: Record<string, unknown>;
}

export const notchDefaults: NotchSettings = {
  on: true, display: 'automatic', open: 'hover', hoverDelay: 150, closeDelay: 450, size: 'comfortable', mascotSide: 'left', idle: 'taurus',
  show: { answer: true, music: true, timers: true, ask: true }, overFullScreen: true, inCaptures: true, noNotch: 'pill', dropFromTop: 0, fitWidth: 196,
};

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? value as T : fallback);
const num = (value: unknown, min: number, max: number, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

// Whatever comes from disk or the notch's page is checked field by field; anything unknown is dropped.
export function cleanNotch(raw: unknown, base: NotchSettings = notchDefaults): NotchSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const show = (r.show && typeof r.show === 'object' ? r.show : {}) as Record<string, unknown>;
  return {
    on: bool(r.on, base.on),
    display: pick(r.display, ['automatic', 'builtin', 'main', 'all'] as const, base.display),
    open: pick(r.open, ['hover', 'click'] as const, base.open),
    hoverDelay: num(r.hoverDelay, 0, 1000, base.hoverDelay),
    closeDelay: num(r.closeDelay, 0, 2000, base.closeDelay),
    size: pick(r.size, ['compact', 'comfortable', 'spacious'] as const, base.size),
    mascotSide: pick(r.mascotSide, ['left', 'right'] as const, base.mascotSide),
    idle: pick(r.idle, ['taurus', 'nothing'] as const, base.idle),
    show: { answer: bool(show.answer, base.show.answer), music: bool(show.music, base.show.music), timers: bool(show.timers, base.show.timers), ask: bool(show.ask, base.show.ask) },
    overFullScreen: bool(r.overFullScreen, base.overFullScreen),
    inCaptures: bool(r.inCaptures, base.inCaptures),
    noNotch: pick(r.noNotch, ['pill', 'hidden'] as const, base.noNotch),
    dropFromTop: num(r.dropFromTop, 0, 24, base.dropFromTop),
    fitWidth: num(r.fitWidth, 150, 260, base.fitWidth),
    ...nativeOf(r.native, base.native),
  };
}
const nativeOf = (value: unknown, fallback?: Record<string, unknown>) => {
  const ok = value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(value).length <= 8192;
  const kept = ok ? value as Record<string, unknown> : fallback;
  return kept ? { native: kept } : {};
};

export interface Screen { id: number; internal: boolean; primary: boolean; bounds: { x: number; y: number; width: number; height: number }; workArea: { x: number; y: number; width: number; height: number } }
// A Mac's built-in screen with a notch has a taller menu bar (about 32 to 38 points) than one without (24 or 25).
export const menuBar = (s: Screen) => Math.max(0, s.workArea.y - s.bounds.y);
export const hasNotch = (s: Screen, mac = process.platform === 'darwin') => mac && s.internal && menuBar(s) >= 30;

export function notchScreens(screens: Screen[], settings: NotchSettings, mac = process.platform === 'darwin'): Screen[] {
  if (!settings.on || !screens.length) return [];
  const primary = screens.find(s => s.primary) ?? screens[0];
  let chosen: Screen[];
  if (settings.display === 'all') chosen = screens;
  else if (settings.display === 'main') chosen = [primary];
  else if (settings.display === 'builtin') chosen = [screens.find(s => s.internal) ?? primary];
  else chosen = [screens.find(s => hasNotch(s, mac)) ?? primary];
  return chosen.filter(s => hasNotch(s, mac) || settings.noNotch === 'pill');
}

// The window is a fixed transparent strip at the top centre, wide and tall enough for the open panel; the page draws
// the pill or the panel at its top middle and lets clicks fall through everywhere else.
export const panelWidth = { compact: 440, comfortable: 520, spacious: 620 } as const;
export const WINDOW_HEIGHT = 480;
export interface Geometry { notch: boolean; notchWidth: number; notchHeight: number; drop: number; window: { x: number; y: number; width: number; height: number } }
export function geometry(s: Screen, settings: NotchSettings, mac = process.platform === 'darwin'): Geometry {
  const notch = hasNotch(s, mac);
  const width = panelWidth.spacious + 60;
  return {
    notch,
    notchWidth: notch ? settings.fitWidth : 0,
    notchHeight: notch ? menuBar(s) : 30,
    drop: notch ? 0 : settings.dropFromTop,
    window: { x: Math.round(s.bounds.x + (s.bounds.width - width) / 2), y: s.bounds.y, width, height: WINDOW_HEIGHT },
  };
}

// What the page is told.
export interface NotchState {
  settings: NotchSettings;
  geometry: Geometry;
  voice: { phase: 'listening' | 'thinking' | 'answer' | 'error' | 'idle'; said?: string; text?: string; at: string } | null;
  music: { playing: boolean; title: string; artist: string } | null;
  timers: { id: string; label: string; endsAt: string; focus?: boolean }[];
  // Something new worth a look (November 19, 2026): a message a scan found, a card waiting for your OK, a timer or
  // reminder going off, a task finished, a list you asked to see. The notch opens for a few seconds to show it.
  news: { id: string; title: string; text: string; at: string } | null;
  connected: boolean;
}
