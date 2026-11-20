import { propose } from './actions/approvals.ts';
import { note } from './activity.ts';
import { prefs } from './boards.ts';
import { greeting } from './greetings.ts';
import { go } from './go.ts';
import { send } from './ring.ts';
import { emailRoutine } from './routines.ts';
import { brainCommand } from './recall.ts';
import { homeCommand } from './home.ts';
import { appearance, findApp, findShortcut, macAllowed, isMac, openApp, runningApps, runShortcut, sleepDisplay, trustedShortcut, volume } from './mac.ts';
import { forget, remember, showMemory } from './memory.ts';
import { canPlay, control, play, type Control } from './music.ts';
import { cancelReminder, cancelTimer, DURATION, duration, remind, runningTimers, showReminders, spokenDuration, spokenTime, startFocus, startTimer, upcoming, WHEN, when } from './timers.ts';
import { close, openWindows, show } from './windows.ts';

// Instant commands (owner, November 4, 2026). "Hey Taurus, play Juice WRLD on Spotify", "set a 10 minute pasta timer",
// "remind me at 6 to call mom", "lock in", "remember I hate early meetings", "open YouTube". Recognized here
// without the AI, so they work in a fraction of a second, with no AI set up, and the same from Talk, Ask and a phone
// call; each one shows a Taurus window. Anything not recognized goes to the AI as before, which has the same powers as
// tools for when you put it some other way. Nothing here sends, posts or buys: those still need an approval card.

type Via = 'ask' | 'talk' | 'phone';
export interface Instant { text: string }

// "Hey Taurus", "Yo Taurus", "Hi Taurus", "Hello there Taurus", "Taurus" (owner, November 6, 2026: "anything like that not just hey taurus").
const wake = /^(?:(?:hey|hi|hiya|hello|yo|ayo|ay|aye|oi|okay|ok|sup|what'?s up)[\s,]+(?:there[\s,]+)?)?(?:taurus|torus|tauris|taurous|tarus|toros|torres)(?:'s)?(?:\s*bot)?\b[\s,.!?]*/;
const polite = /^(?:(?:can|could|would|will) you\s+|please\s+|i want you to\s+|go ahead and\s+|just\s+)+/;
// What the owner said, ready to match: no wake word, no "please", no end punctuation.
export function tidy(text: string) {
  return text.trim().toLowerCase().replace(/[“”"]/g, '').replace(/[’]/g, '\'').replace(wake, '').replace(polite, '').replace(/[\s,.!?]+$/, '').replace(/\s+please$/, '').replace(/\s+/g, ' ').trim();
}
// The same words as the owner typed or said them, capitals and all, when they can be found.
function original(raw: string, part: string) {
  const at = raw.replace(/[’]/g, '\'').toLowerCase().lastIndexOf(part);
  return at >= 0 ? raw.slice(at, at + part.length) : part;
}

// ---------- Opening apps and sites ----------

const sites: Record<string, [string, string]> = {
  youtube: ['YouTube', 'https://www.youtube.com'], 'youtube music': ['YouTube Music', 'https://music.youtube.com'], gmail: ['Gmail', 'https://mail.google.com'], 'my email': ['Gmail', 'https://mail.google.com'],
  calendar: ['Google Calendar', 'https://calendar.google.com'], 'google calendar': ['Google Calendar', 'https://calendar.google.com'], drive: ['Google Drive', 'https://drive.google.com'],
  'google drive': ['Google Drive', 'https://drive.google.com'], docs: ['Google Docs', 'https://docs.google.com'], sheets: ['Google Sheets', 'https://sheets.google.com'],
  maps: ['Google Maps', 'https://maps.google.com'], 'google maps': ['Google Maps', 'https://maps.google.com'], google: ['Google', 'https://www.google.com'],
  netflix: ['Netflix', 'https://www.netflix.com'], spotify: ['Spotify', 'https://open.spotify.com'], x: ['X', 'https://x.com'], twitter: ['X', 'https://x.com'],
  instagram: ['Instagram', 'https://www.instagram.com'], linkedin: ['LinkedIn', 'https://www.linkedin.com'], github: ['GitHub', 'https://github.com'], notion: ['Notion', 'https://www.notion.so'],
  chatgpt: ['ChatGPT', 'https://chatgpt.com'], claude: ['Claude', 'https://claude.ai'], reddit: ['Reddit', 'https://www.reddit.com'], amazon: ['Amazon', 'https://www.amazon.com'],
  slack: ['Slack', 'https://app.slack.com'], figma: ['Figma', 'https://www.figma.com'], linear: ['Linear', 'https://linear.app'], discord: ['Discord', 'https://discord.com/app'],
  whatsapp: ['WhatsApp', 'https://web.whatsapp.com'], outlook: ['Outlook', 'https://outlook.office.com/mail/'], twitch: ['Twitch', 'https://www.twitch.tv'], tiktok: ['TikTok', 'https://www.tiktok.com'],
  canva: ['Canva', 'https://www.canva.com'], 'hacker news': ['Hacker News', 'https://news.ycombinator.com'], doordash: ['DoorDash', 'https://www.doordash.com'], uber: ['Uber', 'https://m.uber.com'],
};
function site(target: string): [string, string] | undefined {
  const t = target.replace(/^(?:up\s+)?(?:the\s+)?/, '').replace(/\s+(?:app|website|site|for me|in a new tab|in the browser)$/, '').trim();
  if (sites[t]) return sites[t];
  if (sites[t.replace(/^my\s+/, '')]) return sites[t.replace(/^my\s+/, '')];
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(t)) return [t, `https://${t}`];
  return undefined;
}

// ---------- Music ----------

const controlWords: [RegExp, Control][] = [
  [/^(?:pause|stop)(?: the)?(?: music| song| spotify| it| playback| playing)?$/, 'pause'],
  [/^(?:resume|unpause|continue|keep playing|play)(?: the)?(?: music| song| spotify| it| playback)?$|^(?:hit )?play again$/, 'resume'],
  [/^(?:skip|next)(?: this| it| the)?(?: song| track| one)?$|^(?:play )?(?:the )?next (?:song|track)$/, 'next'],
  [/^(?:previous|go back|back)(?: song| track)?$|^(?:play )?(?:the )?(?:previous|last) (?:song|track)$|^play that again$/, 'previous'],
  [/^(?:turn (?:it |the music |the volume )?up|louder|volume up|crank it(?: up)?)$/, 'louder'],
  [/^(?:turn (?:it |the music |the volume )?down|quieter|softer|volume down)$/, 'quieter'],
  [/^what(?:'s| is) (?:this|playing|this song|the song|that song|this track)(?: called)?$|^what song is (?:this|playing|on)$|^who (?:sings|is singing|made) this$/, 'now'],
  [/^(?:shuffle(?: on)?|turn on shuffle|shuffle it)$/, 'shuffle'],
  [/^(?:shuffle off|turn off shuffle|stop shuffling)$/, 'unshuffle'],
];
// "play chess with me" and "play devil's advocate" are not music.
const notMusic = /^(?:a game|games?|chess|the role|devil|along|it cool|it safe|back the|with me|20 questions|twenty questions|pretend)/;

async function music(said: string, heard: string): Promise<Instant | null> {
  const volume = said.match(/^(?:set |turn )?(?:the )?volume (?:to |at )?(\d{1,3})(?: percent| %)?$/);
  if (volume) return control('volume', Number(volume[1]), heard);
  for (const [pattern, what] of controlWords) if (pattern.test(said)) return control(what, undefined, heard);
  const ask = said.match(/^(?:play|put on|throw on|queue up|bump|blast|spin|listen to|i want to (?:hear|listen to)|let'?s hear)\s+(.+)$/);
  if (!ask) return null;
  const query = ask[1].trim();
  if (!/\bspotify\b/.test(query) && (notMusic.test(query) || query.split(' ').length > 9)) return null;
  return play(query, heard);
}

// ---------- This Mac ----------

const notAllowed = { text: 'I can’t touch this Mac yet. Allow “Control this Mac” in Settings, then Actions.' };
async function macCommand(said: string, heard: string, via: Via): Promise<Instant | null> {
  const ok = macAllowed();
  const mute = said.match(/^(mute|unmute)(?: (?:the |my )?(?:mac|computer|laptop|sound|audio|volume|everything))?$/);
  if (mute) return ok ? { text: await volume(mute[1] as 'mute' | 'unmute', heard) } : notAllowed;
  const level = said.match(/^(?:set |turn |put )?(?:the |my )?(?:mac'?s?|computer'?s?|laptop'?s?|system) (?:volume|sound)(?: to| at)? (\d{1,3})(?: percent| %)?$/);
  if (level) return ok ? { text: await volume(Number(level[1]), heard) } : notAllowed;
  if (/^(?:turn on |switch to |go |enable |use )?dark mode(?: on)?$|^(?:make it|go) dark$/.test(said)) return ok ? { text: await appearance(true, heard) } : notAllowed;
  if (/^(?:turn on |switch to |go |enable |use )?light mode$|^(?:turn off |disable )dark mode$|^dark mode off$/.test(said)) return ok ? { text: await appearance(false, heard) } : notAllowed;
  if (/^(?:turn off|sleep|put to sleep|switch off)(?: the| my)? (?:display|screen|monitor)s?$/.test(said)) return ok ? { text: await sleepDisplay() } : notAllowed;
  if (/^what apps (?:are|do i have) (?:open|running)$|^what'?s (?:open|running) on (?:my|the|this) (?:mac|computer|laptop)$/.test(said)) {
    if (!isMac()) return { text: 'Taurus isn’t running on a Mac.' };
    const list = await runningApps();
    return { text: list.length ? `Open now: ${list.slice(0, 8).join(', ')}${list.length > 8 ? `, and ${list.length - 8} more` : ''}.` : 'I can’t see which apps are open. macOS may need you to allow Taurus under Automation.' };
  }
  const shortcut = said.match(/^run (?:my |the )?(?:shortcut |shortcuts )?(?:called |named )?(.+?)(?: shortcut)?$/);
  if (shortcut) {
    if (!ok) return notAllowed;
    const found = await findShortcut(shortcut[1]);
    if (!found) return null;
    if (trustedShortcut(found)) return { text: await runShortcut(found.name, heard) };
    const p = await propose('mac.shortcut', { name: found.name }, via);
    return { text: `${p.title}? It’s waiting for your OK.` };
  }
  const quit = said.match(/^(?:quit|close|exit|kill|force quit|shut down)\s+(?:the\s+|my\s+)?(.+?)(?:\s+app)?$/);
  if (quit && isMac()) {
    const app = findApp(quit[1]);
    if (!app) return null;
    if (!ok) return notAllowed;
    const p = await propose('mac.quit', { app }, via);
    return { text: `${p.title}? Tap OK and it closes.` };
  }
  const swap = said.match(/^(?:switch to|go to|bring up|focus on|jump to)\s+(.+)$/);
  if (swap && ok && via !== 'phone') { const app = findApp(swap[1]); if (app) return { text: await openApp(app, heard) }; }
  return null;
}

// ---------- The router ----------

export async function instant(raw: string, via: Via): Promise<Instant | null> {
  const said = tidy(raw);
  // "Hey Taurus", "yo Taurus, what's up", "how's it going": a hello back at once, no AI (November 7, 2026).
  const hello = greeting(said, prefs().profile.tone);
  if (hello) return { text: hello };
  if (!said || said.length > 220) return null;
  const heard = raw.trim().slice(0, 200);
  try { return await route(said, heard, via); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    show({ id: 'note', kind: 'note', title: 'That didn’t work', text: message, said: heard });
    return { text: message };
  }
}

// "Open up my notes app", "pull up notes", "launch spotify for me", "switch to chrome".
const OPEN_APP = /^(?:open(?: up)?|launch|pull up|bring up|fire up|boot up|switch to|jump to|go to|take me to)\s+(.+)$/;

async function route(said: string, heard: string, via: Via): Promise<Instant | null> {
  // Taurus's own pages come before Mac apps (November 19, 2026): "open the brain map", "show me my profile".
  const page = go(said, via);
  if (page) return page;
  const routine = emailRoutine(said);
  if (routine) return routine;
  // Another account (November 20, 2026: "make it so u can connect multiple gmails or multiple accounts"). The sign-in
  // itself happens in the company's own window, so this opens Connections and says what to tap.
  const another = said.match(/^(?:add|connect|link|sign (?:me )?in(?: to| with)?)(?: (?:another|a second|one more|my other|another one of my))(?: (gmail|google|email|e-mail|mail|outlook|calendar|google calendar))?(?: (?:account|address|inbox))?s?$/);
  if (another) {
    const what = /outlook/.test(another[1] ?? '') ? 'Outlook Mail' : /calendar/.test(another[1] ?? '') ? 'Google Calendar' : 'Gmail';
    if (via !== 'phone') send('go', { hash: '#connections', name: 'Connections', via });
    return { text: `Tap ${what}, then Add another ${what.split(' ')[0]} account, and pick the account in its sign-in window. Every account is read together after that.` };
  }
  // Opening an app on this Mac comes first (owner, November 6, 2026: "hey taurus open up my notes app and it wil literally
  // open in like half a second"). Nothing else is checked before it: no smart-home hubs, no Shortcuts list, no AI.
  const appWanted = said.match(OPEN_APP);
  if (appWanted && via !== 'phone' && !/\b(?:website|site|in the browser|on the web|tab)\b/.test(appWanted[1])) {
    const app = findApp(appWanted[1]);
    // Not allowed yet: say so at once instead of asking the AI, which took 19 s to say the same (November 7, 2026).
    if (app) return { text: macAllowed() ? await openApp(app, heard) : `I can open ${app} once you allow “Control this Mac” in Settings, then Actions.` };
  }
  // Done ringing: "stop", "okay", "got it" close the timer or reminder that's going off.
  if (/^(?:stop|ok|okay|thanks|thank you|got it|dismiss|done|silence|quiet)$/.test(said)) {
    const ringing = openWindows().filter(w => (w.kind === 'timer' && w.done) || (w.kind === 'reminder' && w.due));
    if (ringing.length) { ringing.forEach(w => close(w.id)); return { text: 'Okay.' }; }
  }

  // Memory
  // ProFinder (November 16, 2026): "run ProFinder", which is also what its daily scheduled task says.
  if (/^(?:\(a task the owner scheduled[^)]*\)\s*)?(?:run|start) (?:pro ?finder|the job search)$|^(?:search|look) for (?:new )?(?:jobs|internships)(?: now)?$/.test(said)) {
    const r = await (await import('./profinder.ts')).runSearch();
    return { text: `ProFinder: ${r.added ? `${r.added} new match${r.added === 1 ? '' : 'es'}` : 'no new matches'}${r.shortlisted ? `, ${r.shortlisted} shortlisted` : ''}.` };
  }
  // Core memory and recall (Luke's Day 2, November 20, 2026): "always sign my emails as Akhil", "unpin the email
  // thing", "what's in your core memory", "how much memory are you using", "what do you know about my sister".
  const brain = brainCommand(said, original(heard, said), via);
  if (brain) return brain;
  const keep = said.match(/^(?:remember|note|don'?t forget|keep in mind|make a note)(?: that| this:?)?\s+(.{3,})$/);
  if (keep && !/^(?:when|what|who|how|me to)\b/.test(keep[1])) { remember(original(heard, keep[1]), heard); return { text: 'Got it. I’ll remember that.' }; }
  const drop = said.match(/^(?:forget|stop remembering|delete the memory)(?: about| that| the)?\s+(.{3,})$/);
  if (drop && !/^(?:it|that|this|everything)$/.test(drop[1])) { const m = forget(drop[1], heard); return { text: m ? `Forgotten: ${m.text}.` : 'I don’t have anything like that saved.' }; }
  if (/^what do you (?:know|remember) about me$|^what have i (?:told|asked) you to remember$|^(?:show|open)(?: me)? (?:your|my) memor(?:y|ies)$|^what do you remember$/.test(said)) {
    showMemory(heard);
    return { text: 'Here’s everything you’ve asked me to remember.' };
  }

  // Focus
  // "let me lock in for 30 mins" is the owner's own wording (November 5, 2026).
  const focus = said.match(/^(?:let'?s |let me |time to |i need to |i want to |i wanna |i'm gonna |i'm going to |gonna |help me )?(?:lock in|focus|deep work|start (?:a )?focus(?: session| block)?|focus mode|get in the zone)(?: mode)?(?: for (.+))?$/);
  if (focus) {
    const ms = (focus[1] && duration(focus[1])) || 50 * 60_000;
    startFocus(ms, heard);
    let music = '';
    if (canPlay()) { try { await play('playlist deep focus', heard); music = ' Focus music is on.'; } catch { /* the focus block still runs */ } }
    note('ring', `Focus for ${spokenDuration(ms)}: VIP mail waits, meetings still ring`, { by: 'taurus' });
    return { text: `Locked in for ${spokenDuration(ms)}. I’ll hold VIP mail until you’re done; meetings still ring.${music}` };
  }
  if (/^(?:stop|end|cancel|quit) (?:the )?focus(?: mode| session| block)?$|^unlock$|^i'?m done focusing$/.test(said)) {
    const gone = cancelTimer('focus');
    return { text: gone.length ? 'Focus ended. VIP mail rings again.' : 'You weren’t in a focus block.' };
  }

  // Timers
  if (/^(?:cancel|stop|delete|remove|kill|clear|end)\b.*\btimers?$/.test(said)) {
    const name = said.replace(/^(?:cancel|stop|delete|remove|kill|clear|end)\s+/, '').replace(/\b(the|my|all|timers?)\b/g, '').trim();
    const gone = cancelTimer(name, /\ball\b/.test(said));
    return { text: gone.length ? (gone.length === 1 ? `Cancelled the ${gone[0].label} timer.` : `Cancelled ${gone.length} timers.`) : 'There’s no timer like that running.' };
  }
  if (/^how (?:much time|long)(?: is)?(?: left| remaining)?(?: on (?:the |my )?.*timer)?$|^(?:what'?s|how'?s) (?:the|my) timer$|^(?:show|any) (?:my )?timers$/.test(said)) {
    const list = runningTimers();
    if (!list.length) return { text: 'No timers running.' };
    list.forEach(t => show({ id: t.id, kind: 'timer', timer: t }));
    return { text: list.map(t => `${t.label}: ${spokenDuration(Date.parse(t.endsAt) - Date.now())} left`).join('. ') + '.' };
  }
  const wakeMe = said.match(new RegExp(`^wake me(?: up)? in (${DURATION})$`, 'i'));
  if (wakeMe) { const ms = duration(wakeMe[1])!; startTimer(ms, 'Wake up', { said: heard }); return { text: `I’ll wake you in ${spokenDuration(ms)}.` }; }
  if (/\btimer\b/.test(said) && !/^remind/.test(said)) {
    const ms = duration(said);
    if (ms) {
      if (ms > 24 * 3_600_000) return { text: 'Timers go up to 24 hours. For longer, ask me to remind you.' };
      const label = said.replace(new RegExp(DURATION, 'i'), ' ').replace(/\b(?:set|start|make|put|on|up|a|an|me|timer|for|called|named|countdown|of|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
      const t = startTimer(ms, label && original(heard, label), { said: heard });
      return { text: `${spokenDuration(ms)}${label ? ` for ${t.label}` : ''}, starting now.` };
    }
  }

  // Reminders
  if (/^(?:what are|what'?s|show|list|read)(?: me)? (?:my |the )?(?:upcoming )?reminders$|^(?:do i have )?any reminders$/.test(said)) {
    showReminders(heard);
    const list = upcoming();
    return { text: list.length ? `${list.length} coming up. Next: ${list[0].text}, ${spokenTime(new Date(list[0].dueAt))}.` : 'No reminders set.' };
  }
  const cancel = said.match(/^(?:cancel|delete|remove|clear)(?: the| my)?( all)?(?: my)? reminders?(?: (?:about|to|for) (.+))?$/);
  if (cancel) {
    const gone = cancelReminder(cancel[1] ? 'all' : cancel[2] ?? '');
    return { text: gone.length ? (gone.length === 1 ? `Cancelled: ${gone[0].text}.` : `Cancelled ${gone.length} reminders.`) : cancel[2] ? 'I couldn’t find that reminder.' : 'Which reminder? Say what it was about.' };
  }
  if (/^(?:remind me|set (?:a |me a )?reminder|don'?t let me forget)\b/.test(said)) {
    const rest = said.replace(/^(?:remind me|set (?:a |me a )?reminder|don'?t let me forget)\b\s*/, '');
    const time = rest.match(WHEN);
    const due = time ? when(time[0]) : undefined;
    const task = (time ? rest.replace(time[0], ' ') : rest).replace(/\s+/g, ' ').trim().replace(/^(?:to|that|about|of|for)\s+/, '').replace(/\s+(?:to|that)$/, '').trim();
    if (!task) return { text: 'What should I remind you about?' };
    const shown = original(heard, task);
    if (!due) return { text: `When should I remind you to ${task}?` };
    const r = remind(shown.charAt(0).toUpperCase() + shown.slice(1), due, heard);
    const repeat = r.repeat === 'daily' ? ', every day' : r.repeat === 'weekdays' ? ', every weekday' : r.repeat === 'weekly' ? ', every week' : '';
    return { text: `I’ll remind you ${spokenTime(due.dueAt)}${repeat}: ${task.replace(/\bmy\b/g, 'your')}.` };
  }

  // Home (November 5, 2026): lights, curtains, plugs, fans, the thermostat, scenes; locks get an approval card.
  const home = await homeCommand(said, heard);
  if (home) return home;

  // This Mac (November 5, 2026): apps, sound, screen, Shortcuts.
  const mac = await macCommand(said, heard, via);
  if (mac) return mac;

  // Opening apps and sites. On a phone call there's no screen in front of you, so it waits on the screen.
  const opening = said.match(/^(?:open|launch|go to|pull up|bring up|take me to)\s+(.+)$/);
  if (opening) {
    const app = macAllowed() && via !== 'phone' && !/\b(?:website|site|in the browser|on the web|tab)\b/.test(opening[1]) ? findApp(opening[1]) : undefined;
    if (app) return { text: await openApp(app, heard) };
    const found = site(opening[1]);
    if (found) {
      show({ id: `open-${Date.now()}`, kind: 'open', name: found[0], url: found[1], said: heard });
      return { text: via === 'phone' ? `${found[0]} is waiting on your screen.` : `Opening ${found[0]}.` };
    }
  }

  return music(said, heard);
}
