import { send } from './ring.ts';
import type { Via } from './agent.ts';

// Every page by voice (owner, November 19, 2026: "just make it all voice commands like hey taurus open the brain map and
// show me it"). "Open the brain map", "show me my profile", "pull up Legal", "take me home", "go back": Taurus
// sends a "go" event and the screens move there at once, no AI. The asking device moves: the Mac's screens (dashboard,
// desktop app) for things said or typed on the Mac, the phone for the phone. Only these exact page names count, so
// "open up my notes app" still opens the Notes app.

export interface Page { hash: string; name: string }

const pages: [RegExp, Page][] = [
  [/^(?:home|home ?screen|main ?screen|hud|the hud|dashboard|main dashboard|jarvis|command center)$/, { hash: '#hud', name: 'Home' }],
  [/^(?:brain|brain ?map|mind ?map|memory ?map|knowledge ?(?:map|graph)|graph|the map|what you know(?: about me)?)$/, { hash: '#brain', name: 'Brain map' }],
  // Legal (owner, November 22, 2026: "make a tab called Legal u put resume and all stuff legal ... corporate"), where ProFinder was.
  [/^(?:legal|legal (?:stuff|tab|page|documents|docs|papers)|my (?:legal )?(?:documents|docs|papers)|(?:my )?resume|contracts|corporate (?:stuff|documents|docs))$/, { hash: '#legal', name: 'Legal' }],
  [/^(?:chat|ask|conversation|our chat|chat history)$/, { hash: '#ask', name: 'Chat' }],
  [/^(?:house|smart home|home controls|lights and devices|devices)$/, { hash: '#house', name: 'House' }],
  [/^(?:profile|me|about me)$/, { hash: '#profile', name: 'Profile' }],
  [/^(?:boards?|board view|widgets)$/, { hash: '#b/home', name: 'Board' }],
  [/^(?:standby|ring ?screen|alarm screen)$/, { hash: '#ring', name: 'Standby' }],
  [/^(?:settings|preferences|taurus settings|tabs and widgets)$/, { hash: '#settings', name: 'Settings' }],
  [/^(?:personali[sz]e|look|appearance|theme|wallpaper)$/, { hash: '#look', name: 'Personalize' }],
  [/^(?:connections|integrations|connected apps|accounts)$/, { hash: '#connections', name: 'Connections' }],
  [/^(?:ai|ai settings|models|ai models|plans|api keys)$/, { hash: '#ai', name: 'AI' }],
  [/^(?:skills|plugins|mcp(?: servers)?)$/, { hash: '#skills', name: 'Skills' }],
  [/^(?:schedule|scheduled(?: tasks)?|routines|my routines)$/, { hash: '#schedule', name: 'Scheduled' }],
  [/^(?:scans)$/, { hash: '#scans', name: 'Scans' }],
  [/^(?:actions|approvals|drafts|things to approve|pending actions)$/, { hash: '#actions', name: 'Actions' }],
  [/^(?:phone|phone settings|pairing)$/, { hash: '#phone', name: 'Phone' }],
  [/^(?:notch|notch settings)$/, { hash: '#notch', name: 'Notch' }],
];

const VERB = /^(?:(?:can you |could you |go ahead and |i want to |let me )?(?:open(?: up)?|show(?: me)?|pull up|bring up|go to|go back to|take me to|switch to|jump to|display|see|view|head to|navigate to|get me to)\s+)/;
const ARTICLE = /^(?:the |my |your |our |taurus'?s? )+/;
const TAIL = /\s+(?:page|tab|screen|view|section|panel|window|for me|again|now|real quick|rn)$/;

// "said" is already tidied: lower case, no wake word, no trailing punctuation or please.
export function pageFor(said: string): Page | 'back' | null {
  const s = said.trim();
  if (/^(?:go back|back|previous page|take me back)$/.test(s)) return 'back';
  if (/^(?:go home|take me home|back home|home)$/.test(s)) return pages[0][1];
  const verb = s.match(VERB);
  if (!verb) return null;
  let rest = s.slice(verb[0].length).replace(ARTICLE, '');
  for (let i = 0; i < 2; i++) rest = rest.replace(TAIL, '');
  rest = rest.trim();
  for (const [rx, page] of pages) if (rx.test(rest)) return page;
  return null;
}

export function go(said: string, via: Via): { text: string } | null {
  const page = pageFor(said);
  if (!page) return null;
  if (page === 'back') { send('go', { hash: 'back', via }); return { text: 'Back.' }; }
  send('go', { ...page, via });
  return { text: `${page.name}.` };
}
