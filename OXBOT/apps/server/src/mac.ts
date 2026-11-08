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
// OXBOT runs four fixed programs (open, osascript, shortcuts, pmset) with fixed scripts, and what you said only ever
// travels as an argument, never as code. With "Control this Mac" allowed, opening and switching apps, the volume,
// dark mode, sleeping the display and Shortcuts in your "OXBOT" or "Home" folder happen the moment you ask, because
// they change nothing anyone else sees and one word undoes them. Quitting an app, sending an iMessage, writing a note
// and running any other Shortcut wait for your OK in an approval card. Apple's Shortcuts app is the bridge to
// everything else on the Mac: anything an app offers Shortcuts, Ox can run.

type Program = 'open' | 'osascript' | 'shortcuts' | 'pmset';
type Runner = (program: Program, args: string[]) => Promise<string>;
const plain = (error: string) => {
  if (/-1743|not authori[sz]ed|Not authorised/i.test(error)) return 'macOS blocked it. Allow OXBOT (or Terminal, in development) in System Settings, Privacy & Security, Automation, then ask again.';
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
export const macAllowed = () => isMac() && isConnected('mac-control');
const need = () => {
  if (!isMac()) throw new HttpError(409, 'Controlling apps only works when OXBOT runs on a Mac.');
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
// Where an app lives, when OXBOT found it on disk.
export const appPath = (name: string) => appCache?.paths.get(name);

export async function openApp(name: string, heard = '') {
  need();
  const step = begin('mac', `Opening ${name}`, { by: 'ox' });
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
  for (const folder of ['OXBOT', 'Home']) for (const name of lines(await runner('shortcuts', ['list', '--folder-name', folder]).catch(() => ''))) trusted.set(name, folder);
  shortcutCache = { at: Date.now(), list: all.map(name => ({ name, folder: trusted.get(name) })) };
  return shortcutCache.list;
}
export async function findShortcut(said: string) {
  const n = norm(said.replace(/\s+shortcut$/i, '').replace(/^(?:my|the)\s+/i, ''));
  if (!n) return undefined;
  const list = await shortcuts();
  return list.find(s => norm(s.name) === n) ?? (n.length > 3 ? list.find(s => norm(s.name).includes(n)) : undefined);
}
// Your "OXBOT" and "Home" folders in Shortcuts hold the ones you've said Ox may run without asking.
export const trustedShortcut = (s: { folder?: string }) => s.folder === 'OXBOT' || s.folder === 'Home';
export async function runShortcut(name: string, heard = '') {
  need();
  const step = begin('mac', `Running the “${name}” Shortcut`, { by: 'ox' });
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
const ready = () => !isMac() ? 'Only works when OXBOT runs on a Mac.' : !isConnected('mac-control') ? 'Allow “Control this Mac” first: Settings, then Actions.' : undefined;
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
      const title = oneLine(args.title, 120) || 'From Ox';
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
      return { title: `Run the “${found.name}” Shortcut`, caution: 'A Shortcut does whatever it was built to do. Put it in a folder named OXBOT in Shortcuts and it runs without asking next time.', payload: { name: found.name } };
    },
    async run(p) { need(); await runner('shortcuts', ['run', p.name]); return `Ran “${p.name}”.`; },
  },
];
register(...specs);
