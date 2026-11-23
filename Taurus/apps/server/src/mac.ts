import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { begin } from './activity.ts';
import { isConnected } from './connectors.ts';
import { register, type Spec } from './actions/approvals.ts';
import { HttpError } from './store.ts';
import type { MacState } from './types.ts';
import { show } from './windows.ts';

// This Mac (owner, November 5, 2026: "make it so it can do agentic actions on like all ur apps"). Still no shell:
// Taurus runs four fixed programs (open, osascript, shortcuts, pmset) with fixed scripts, and what you said only ever
// travels as an argument, never as code. With "Control this Mac" allowed, opening and switching apps, the volume,
// dark mode, sleeping the display and Shortcuts in your "Taurus" or "Home" folder happen the moment you ask, because
// they change nothing anyone else sees and one word undoes them. Quitting an app, sending an iMessage, writing a note
// and running any other Shortcut wait for your OK in an approval card. Apple's Shortcuts app is the bridge to
// everything else on the Mac: anything an app offers Shortcuts, Taurus can run.

type Program = 'open' | 'osascript' | 'shortcuts' | 'pmset';
type Runner = (program: Program, args: string[]) => Promise<string>;
const plain = (error: string) => {
  if (/-1743|not authori[sz]ed|Not authorised/i.test(error)) return 'macOS blocked it. Allow Taurus (or Terminal, in development) in System Settings, Privacy & Security, Automation, then ask again.';
  if (/-1728|Can’t get application|Unable to find application|can't find/i.test(error)) return 'That app isn’t on this Mac.';
  if (/couldn’t find shortcut|could not find shortcut|shortcut .* not found/i.test(error)) return 'There’s no Shortcut with that name.';
  return error.split('\n').filter(Boolean).at(-1)?.replace(/^.*execution error: /, '').slice(0, 200) || 'macOS said no.';
};
const real: Runner = (program, args) => new Promise((resolve, reject) => {
  execFile(`/usr/bin/${program}`, args, { timeout: 15_000, maxBuffer: 1_000_000 }, (error, stdout, stderr) => {
    if (error) reject(new HttpError(409, plain(String(stderr || error.message))));
    else resolve(String(stdout).trim());
  });
});
let runner: Runner = real;
// Installed apps by name, with where each one lives, so "open Notes" goes straight to its bundle (November 6, 2026:
// "it wil literally open in like half a second"). Opening by path skips macOS's name lookup, which on this Mac took
// up to half a second by itself; by path it is about 70 ms.
let appCache: { at: number; names: string[]; paths: Map<string, string> } | undefined;
const APPS_FRESH = 10 * 60_000;
let shortcutCache: { at: number; list: { name: string; folder?: string }[] } | undefined;
// For tests: nothing runs on the Mac.
export const useRunner = (r?: Runner, apps?: string[]) => {
  runner = r ?? real; shortcutCache = undefined;
  appCache = apps ? { at: Date.now() + 3_600_000, names: apps, paths: new Map() } : undefined;
};

export const isMac = () => process.platform === 'darwin' || runner !== real;
// Hands one file Taurus wrote to its Mac app (November 16, 2026: an approved calendar card's .ics goes to Calendar).
export const openWithMac = (path: string) => { if (!isMac()) throw new HttpError(409, 'Only works when Taurus runs on a Mac.'); return runner('open', [path]); };
export const macAllowed = () => isMac() && isConnected('mac-control');
const need = () => {
  if (!isMac()) throw new HttpError(409, 'Controlling apps only works when Taurus runs on a Mac.');
  if (!isConnected('mac-control')) throw new HttpError(409, 'Allow “Control this Mac” first: Settings, then Actions.');
};
const oneLine = (text: unknown, max = 200) => String(text ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

// ---------- Apps ----------

function scanApps() {
  const paths = new Map<string, string>();
  for (const dir of ['/Applications', '/System/Applications', '/System/Applications/Utilities', '/Applications/Utilities', join(homedir(), 'Applications')]) {
    try { for (const f of readdirSync(dir)) if (f.endsWith('.app') && !paths.has(f.slice(0, -4))) paths.set(f.slice(0, -4), join(dir, f)); } catch { /* not there on this Mac */ }
  }
  appCache = { at: Date.now(), names: [...paths.keys()].sort((a, b) => a.localeCompare(b)), paths };
}
// Served from memory; a list older than ten minutes is used once more while a fresh one is read right after, so
// asking never waits on the disk. An app installed a moment ago is found on the next ask.
export function installedApps(): string[] {
  if (!appCache) scanApps();
  else if (Date.now() - appCache.at > APPS_FRESH) { appCache.at = Date.now(); setImmediate(scanApps); }
  return appCache!.names;
}
// Read the list once at start, so the first "open Notes" is as quick as the rest.
if (process.platform === 'darwin') setImmediate(() => { if (!appCache) scanApps(); });
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const aliases: Record<string, string> = {
  chrome: 'Google Chrome', vscode: 'Visual Studio Code', 'vs code': 'Visual Studio Code', settings: 'System Settings', 'system preferences': 'System Settings',
  imessage: 'Messages', texts: 'Messages', 'text messages': 'Messages', word: 'Microsoft Word', excel: 'Microsoft Excel', powerpoint: 'Microsoft PowerPoint', teams: 'Microsoft Teams',
  'apple notes': 'Notes', note: 'Notes', 'sticky notes': 'Stickies', 'apple music': 'Music', itunes: 'Music', 'app store': 'App Store', 'apple mail': 'Mail', 'my mail': 'Mail',
  'calc': 'Calculator', 'facetime': 'FaceTime', 'find my': 'Find My', photo: 'Photos', 'my photos': 'Photos', 'activity monitor': 'Activity Monitor',
};
// "spotify", "the spotify app", "my notes app", "vs code" -> the app's real name, when it's installed.
export function findApp(said: string, list = installedApps()): string | undefined {
  const t = said.toLowerCase().replace(/[’]/g, '\'').replace(/^(?:up\s+)?(?:the\s+|my\s+)?/, '')
    .replace(/\s+(?:for me|real quick|quick|quickly|right now|now|rn)$/, '')
    .replace(/\s+(?:app|application)(?: on (?:my|the|this) (?:mac|computer|laptop))?$/, '').replace(/\s+on (?:my|the|this) (?:mac|computer|laptop)$/, '').replace(/'s$/, '').trim();
  const n = norm(aliases[t] ?? t);
  if (!n) return undefined;
  return list.find(a => norm(a) === n) ?? list.find(a => norm(a).replace(/^(?:microsoft|google|adobe|apple)/, '') === n);
}
// Where an app lives, when Taurus found it on disk.
export const appPath = (name: string) => appCache?.paths.get(name);

export async function openApp(name: string, heard = '') {
  need();
  const step = begin('mac', `Opening ${name}`, { by: 'taurus' });
  // By its bundle's path when known: the fixed program /usr/bin/open, the app as an argument, no name lookup.
  try { await runner('open', ['-a', appPath(name) ?? name]); step.done(`Opened ${name}`); }
  catch (error) { step.fail(error); throw error; }
  show({ id: `mac-${Date.now()}`, kind: 'mac', title: name, text: 'Opened on this Mac.', app: name, said: heard });
  return `Opening ${name}.`;
}

export async function runningApps(): Promise<string[]> {
  if (!isMac()) return [];
  const out = await runner('osascript', ['-e', 'tell application "System Events" to get name of every application process whose background only is false']).catch(() => '');
  return out.split(/,\s*/).map(s => s.trim()).filter(Boolean);
}

// ---------- Sound, screen, appearance ----------

export async function volume(level: number | 'mute' | 'unmute', heard = '') {
  need();
  const script = level === 'mute' ? 'set volume with output muted' : level === 'unmute' ? 'set volume without output muted' : `set volume output volume ${Math.max(0, Math.min(100, Math.round(level)))}`;
  await runner('osascript', ['-e', script]);
  const text = level === 'mute' ? 'Muted this Mac.' : level === 'unmute' ? 'Sound’s back on.' : `This Mac’s volume is at ${Math.max(0, Math.min(100, Math.round(level)))}.`;
  show({ id: 'mac-volume', kind: 'mac', title: 'Volume', text, said: heard });
  return text;
}
export async function appearance(dark: boolean | 'toggle', heard = '') {
  need();
  const to = dark === 'toggle' ? 'not dark mode' : String(dark);
  await runner('osascript', ['-e', `tell application "System Events" to tell appearance preferences to set dark mode to ${to}`]);
  const text = dark === 'toggle' ? 'Switched light and dark.' : dark ? 'Dark mode on.' : 'Light mode on.';
  show({ id: 'mac-look', kind: 'mac', title: 'Appearance', text, said: heard });
  return text;
}
export async function sleepDisplay() { need(); await runner('pmset', ['displaysleepnow']); return 'Display off.'; }

// ---------- Shortcuts ----------

export async function shortcuts(): Promise<{ name: string; folder?: string }[]> {
  if (!isMac()) return [];
  if (shortcutCache && Date.now() - shortcutCache.at < 60_000) return shortcutCache.list;
  const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
  const all = lines(await runner('shortcuts', ['list']).catch(() => ''));
  const trusted = new Map<string, string>();
  for (const folder of ['Taurus', 'Home']) for (const name of lines(await runner('shortcuts', ['list', '--folder-name', folder]).catch(() => ''))) trusted.set(name, folder);
  shortcutCache = { at: Date.now(), list: all.map(name => ({ name, folder: trusted.get(name) })) };
  return shortcutCache.list;
}
export async function findShortcut(said: string) {
  const n = norm(said.replace(/\s+shortcut$/i, '').replace(/^(?:my|the)\s+/i, ''));
  if (!n) return undefined;
  const list = await shortcuts();
  return list.find(s => norm(s.name) === n) ?? (n.length > 3 ? list.find(s => norm(s.name).includes(n)) : undefined);
}
// Your "Taurus" and "Home" folders in Shortcuts hold the ones you've said Taurus may run without asking.
export const trustedShortcut = (s: { folder?: string }) => s.folder === 'Taurus' || s.folder === 'Home';
export async function runShortcut(name: string, heard = '') {
  need();
  const step = begin('mac', `Running the “${name}” Shortcut`, { by: 'taurus' });
  try { await runner('shortcuts', ['run', name]); step.done(`Ran “${name}”`); }
  catch (error) { step.fail(error); throw error; }
  show({ id: `mac-${Date.now()}`, kind: 'mac', title: name, text: 'Shortcut ran.', app: 'Shortcuts', said: heard });
  return `Done: ${name}.`;
}

export async function macState(): Promise<MacState> {
  if (!isMac()) return { mac: false, allowed: false, apps: [], running: [], shortcuts: [] };
  const [running, list] = await Promise.all([runningApps(), shortcuts()]);
  return { mac: true, allowed: macAllowed(), apps: installedApps(), running, shortcuts: list };
}

// ---------- Actions that wait for your OK ----------

// AppleScript reads what you said from argv: it is never pasted into the script.
const SEND = `on run argv
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    send (item 2 of argv) to participant (item 1 of argv) of svc
  end tell
end run`;
const NOTE = `on run argv
  tell application "Notes" to make new note with properties {name:(item 1 of argv), body:(item 2 of argv)}
end run`;
const QUIT = `on run argv
  tell application (item 1 of argv) to quit
end run`;
const ready = () => !isMac() ? 'Only works when Taurus runs on a Mac.' : !isConnected('mac-control') ? 'Allow “Control this Mac” first: Settings, then Actions.' : undefined;
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

const specs: Spec[] = [
  {
    kind: 'mac.message', app: 'Messages', editable: true, ttlMinutes: 10,
    help: 'Send an iMessage from this Mac’s Messages app. Args: to (phone number with country code, or Apple ID email), text.',
    missing: ready,
    async prepare(args) {
      const to = oneLine(args.to, 120);
      if (!/^\+?[\d\s().-]{7,}$/.test(to) && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) throw new HttpError(400, 'Messages needs a phone number or an Apple ID email, not a name.');
      const text = String(args.text ?? '').trim().slice(0, 2000);
      if (!text) throw new HttpError(400, 'What should the message say?');
      return { title: `iMessage ${to}`, to, text, payload: { to: to.replace(/[\s().-]/g, ''), text } };
    },
    async run(p) { need(); await runner('osascript', ['-e', SEND, p.to, p.text]); return 'Sent from Messages on this Mac.'; },
  },
  {
    kind: 'mac.note', app: 'Notes', editable: true,
    help: 'Write a new note in Apple Notes. Args: title, text.',
    missing: ready,
    async prepare(args) {
      const title = oneLine(args.title, 120) || 'From Taurus';
      const text = String(args.text ?? '').trim().slice(0, 8000);
      return { title: `New note: ${title}`, text, payload: { title, text } };
    },
    async run(p) { need(); await runner('osascript', ['-e', NOTE, p.title, html(p.text)]); return 'Saved in Notes.'; },
  },
  {
    kind: 'mac.quit', app: 'This Mac', ttlMinutes: 5,
    help: 'Quit an app on this Mac. Args: app (its name).',
    missing: ready,
    async prepare(args) {
      const name = findApp(String(args.app ?? ''));
      if (!name) throw new HttpError(404, 'That app isn’t on this Mac.');
      return { title: `Quit ${name}`, caution: 'If something isn’t saved, the app asks you first.', payload: { app: name } };
    },
    async run(p) { need(); await runner('osascript', ['-e', QUIT, p.app]); return `Quit ${p.app}.`; },
  },
  {
    kind: 'mac.shortcut', app: 'Shortcuts', ttlMinutes: 10,
    help: 'Run one of the owner’s Apple Shortcuts by its exact name (see the shortcuts tool). A Shortcut can do anything it was built to do.',
    missing: ready,
    async prepare(args) {
      const found = await findShortcut(String(args.name ?? ''));
      if (!found) throw new HttpError(404, 'There’s no Shortcut with that name.');
      return { title: `Run the “${found.name}” Shortcut`, caution: 'A Shortcut does whatever it was built to do. Put it in a folder named Taurus in Shortcuts and it runs without asking next time.', payload: { name: found.name } };
    },
    async run(p) { need(); await runner('shortcuts', ['run', p.name]); return `Ran “${p.name}”.`; },
  },
];
register(...specs);

// ---------- Music apps already open (owner, November 20, 2026) ----------
// "it should look for sign ins it can use like just apps in general like spotify without u having to connect to it like
// how vorrsaint sees when spotify is running and can skip". Spotify and Apple Music on this Mac answer to their own
// AppleScript, so when one is open Taurus plays, pauses, skips, sets its volume and shuffle and reads what's playing,
// with no sign-in and without the "Control this Mac" switch: it changes only what the owner's own app plays, like
// Spotify playback (November 4). One fixed script per app; the action is picked from a fixed list and the volume is
// a number, both passed as arguments, never as code. An app that isn't open is never launched (the script checks
// "is running" first), and an app that isn't installed is never named to AppleScript, so macOS never asks where it is.
// The first time, macOS asks once whether Taurus may control Spotify (or Music).
export type MediaApp = 'Spotify' | 'Music';
export type MediaAct = 'now' | 'pause' | 'resume' | 'next' | 'previous' | 'volume' | 'shuffle';
export interface MediaNow { app: MediaApp; playing: boolean; title?: string; artist?: string; album?: string; durationMs: number; positionMs: number; volume?: number; shuffle?: boolean; art?: string; uri?: string }
const MEDIA: MediaApp[] = ['Spotify', 'Music'];
const mediaScript = (app: MediaApp) => {
  const shuffle = app === 'Spotify' ? 'shuffling' : 'shuffle enabled';
  return `on run argv
  if not (application "${app}" is running) then return "off"
  set act to item 1 of argv
  tell application "${app}"
    if act is "pause" then pause
    if act is "resume" then play
    if act is "next" then next track
    if act is "previous" then previous track
    if act is "volume" then set sound volume to ((item 2 of argv) as integer)
    if act is "shuffle" then set ${shuffle} to ((item 2 of argv) is "on")
    if act is "next" or act is "previous" then delay 0.4
    set s to (player state as text)
    if s is "stopped" then return "stopped"
    set t to current track
    set out to s & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & ((duration of t) as text) & tab & ((player position) as text) & tab & ((sound volume) as text) & tab & ((${shuffle}) as text)
    ${app === 'Spotify' ? 'set out to out & tab & (artwork url of t) & tab & (spotify url of t)' : ''}
    return out
  end tell
end run`;
};
// Tests never touch the owner's real apps: under node --test only a stand-in runner may answer.
const underTest = () => Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.some(a => /\.test\.ts$/.test(a));
const mediaAllowed = () => isMac() && !(runner === real && underTest());
const num = (v?: string) => Number(String(v ?? '').replace(',', '.')) || 0;
function readMedia(app: MediaApp, out: string): MediaNow | undefined {
  if (!out || out === 'off') return undefined;
  if (out === 'stopped') return { app, playing: false, durationMs: 0, positionMs: 0 };
  const [s, title, artist, album, duration, position, volume, shuffle, art, uri] = out.split('\t');
  return { app, playing: s === 'playing', title, artist, album, durationMs: app === 'Spotify' ? num(duration) : num(duration) * 1000, positionMs: num(position) * 1000,
    volume: Math.round(num(volume)), shuffle: shuffle === 'true', art: art || undefined, uri: uri || undefined };
}
async function askMedia(app: MediaApp, act: MediaAct, value = ''): Promise<MediaNow | undefined> {
  return readMedia(app, await runner('osascript', ['-e', mediaScript(app), act, value]));
}
// The music app that's open: the one playing, else one that's open and paused. Undefined when none is open.
export async function mediaNow(): Promise<MediaNow | undefined> {
  if (!mediaAllowed()) return undefined;
  const have = installedApps();
  const open = (await Promise.all(MEDIA.filter(a => have.includes(a)).map(a => askMedia(a, 'now').catch(() => undefined)))).filter((m): m is MediaNow => Boolean(m));
  return open.find(m => m.playing) ?? open[0];
}
export async function mediaControl(act: MediaAct, value?: number | boolean): Promise<MediaNow | undefined> {
  const now = await mediaNow();
  if (!now || act === 'now') return now;
  const arg = act === 'volume' ? String(Math.max(0, Math.min(100, Math.round(Number(value) || 0)))) : act === 'shuffle' ? (value ? 'on' : 'off') : '';
  const step = begin('action', `${now.app} on this Mac: ${act}`, { by: 'taurus' });
  try { const after = await askMedia(now.app, act, arg); step.done(); return after; } catch (error) { step.fail(error); throw error; }
}
// "Play juice wrld" with no Spotify sign-in: Spotify's own search opens in the app, where one tap plays it.
export async function openInSpotify(query: string): Promise<boolean> {
  if (!mediaAllowed() || !installedApps().includes('Spotify')) return false;
  await runner('open', [`spotify:search:${query.replace(/[\r\n]+/g, ' ').trim().slice(0, 120)}`]);
  return true;
}

// ---------- The Calendar app on this Mac (owner, November 20, 2026: "can u make it take apple and notion calender") ----
// Apple Calendar with no link to paste: Apple's own calendar framework (EventKit), through one fixed JavaScript for
// Automation script, reads today's and tomorrow's events from every calendar this Mac already shows: iCloud, and any
// Google, Exchange or subscribed calendar added in System Settings. Read only; the Calendar app isn't opened. The two
// times are passed as arguments. The first time, macOS asks the owner whether Taurus may see his calendars.
const CALENDAR = `function run(argv) {
  ObjC.import('EventKit');
  const store = $.EKEventStore.alloc.init;
  let status = Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent));
  if (status === 0 && argv[2] === 'ask') {
    let done = false;
    const answered = () => { done = true; };
    if (store.respondsToSelector('requestFullAccessToEventsWithCompletion:')) store.requestFullAccessToEventsWithCompletion(answered);
    else store.requestAccessToEntityTypeCompletion($.EKEntityTypeEvent, answered);
    const until = $.NSDate.dateWithTimeIntervalSinceNow(90);
    while (!done && $.NSDate.date.compare(until) < 0) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2));
    status = Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent));
  }
  if (status !== 3) return JSON.stringify({ status: status });
  const from = $.NSDate.dateWithTimeIntervalSince1970(Number(argv[0]) / 1000), to = $.NSDate.dateWithTimeIntervalSince1970(Number(argv[1]) / 1000);
  const events = store.eventsMatchingPredicate(store.predicateForEventsWithStartDateEndDateCalendars(from, to, $()));
  const out = [];
  const text = v => (v && !v.isNil()) ? ObjC.unwrap(v) : undefined;
  for (let i = 0; i < Number(events.count); i++) {
    const e = events.objectAtIndex(i);
    if (Number(e.status) === 3) continue;
    let declined = false;
    const people = e.attendees;
    if (people && !people.isNil()) for (let j = 0; j < Number(people.count); j++) { const p = people.objectAtIndex(j); if (p.isCurrentUser && Number(p.participantStatus) === 3) declined = true; }
    if (declined) continue;
    out.push({ id: text(e.eventIdentifier), title: text(e.title), start: Number(e.startDate.timeIntervalSince1970) * 1000, end: Number(e.endDate.timeIntervalSince1970) * 1000,
      allDay: Boolean(e.allDay), location: text(e.location), calendar: text(e.calendar.title), url: e.URL && !e.URL.isNil() ? text(e.URL.absoluteString) : undefined });
  }
  return JSON.stringify({ status: 3, events: out });
}`;
export interface MacEvent { id: string; title?: string; start: number; end: number; allDay: boolean; location?: string; calendar?: string; url?: string }
export async function macCalendar(fromMs: number, toMs: number, ask = true): Promise<MacEvent[]> {
  if (!isMac()) throw new HttpError(409, 'Apple Calendar on this Mac works only when Taurus runs on a Mac.');
  if (runner === real && underTest()) throw new HttpError(409, 'Not in tests.');
  const out = JSON.parse(await runner('osascript', ['-l', 'JavaScript', '-e', CALENDAR, String(fromMs), String(toMs), ask ? 'ask' : 'check']) || '{}') as { status?: number | string; events?: MacEvent[] };
  out.status = Number(out.status);
  if (out.status !== 3) throw new HttpError(409, out.status === 0 ? 'macOS hasn’t asked yet. Turn Apple Calendar off and on to see its question.' : 'macOS isn’t letting Taurus see your calendars. Allow Taurus in System Settings, Privacy & Security, Calendars (Full Access).');
  return out.events ?? [];
}
