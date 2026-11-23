// What helpers may do in other apps (owner, November 5, 2026; docs/19-computer-use.md). Pure rules, no Electron, so
// they are tested on their own. The desktop app checks every step against these before taurus-hands runs it, and
// taurus-hands refuses the never-list again on its own.

export interface HandsSettings { on: boolean; act: string[]; look: string[]; chrome: boolean }
// The owner's first choices: Canva and Notes may act, Google Chrome may only be looked at. Acting is off until he
// switches it on in the tray.
export const defaults: HandsSettings = { on: false, act: ['Canva', 'Notes'], look: ['Google Chrome'], chrome: false };

const neverNames = ['1Password', '1Password 7', 'Bitwarden', 'LastPass', 'Dashlane', 'Keychain Access', 'Passwords', 'System Settings', 'System Preferences',
  'Terminal', 'iTerm', 'iTerm2', 'Warp', 'Ghostty', 'Taurus'];
const money = /\b(bank|banking|wallet|venmo|paypal|cash ?app|zelle|robinhood|coinbase|kraken|binance|schwab|fidelity|vanguard|chase|wells ?fargo|amex|revolut|wise|crypto|ledger|metamask|trading|brokerage|quickbooks)\b/i;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Apps helpers never touch, whatever the list says.
export const never = (app: string) => neverNames.some(n => same(n, app)) || money.test(app);
export const mayAct = (app: string, s: HandsSettings) => s.on && !never(app) && s.act.some(a => same(a, app));
export const mayLook = (app: string, s: HandsSettings) => !never(app) && (s.act.some(a => same(a, app)) || s.look.some(a => same(a, app)));

export interface Window { x: number; y: number; w: number; h: number }
export const inside = (win: Window | undefined, x: unknown, y: unknown) =>
  Boolean(win) && typeof x === 'number' && typeof y === 'number' && x >= win!.x && x <= win!.x + win!.w && y >= win!.y && y <= win!.y + win!.h;

const reading = new Set(['status', 'apps', 'where']);
const pointing = new Set(['move', 'click', 'drag', 'scroll']);
export const acting = new Set(['front', 'press', 'focus', 'move', 'click', 'drag', 'scroll', 'type', 'key', 'arrange']);

// '' when the step may run; otherwise why not, in plain words. `ask` (macOS's permission prompts) never comes from the
// server: only the owner's own tap in the tray asks.
export function check(verb: string, args: Record<string, unknown>, s: HandsSettings, win?: Window): string {
  const app = typeof args.app === 'string' ? args.app.trim() : '';
  if (reading.has(verb)) return '';
  if (verb === 'look') return !app || mayLook(app, s) ? '' : `${app || 'That app'} isn’t on your list of apps helpers may look at.`;
  if (verb === 'tree') return app && mayLook(app, s) ? '' : `${app || 'That app'} isn’t on your list of apps helpers may use.`;
  if (!acting.has(verb)) return `Helpers can’t ${verb}.`;
  if (!app) return 'Say which app.';
  if (never(app)) return `Taurus never works in ${app}.`;
  if (!s.on) return 'Helpers in other apps are switched off (Taurus’s menu, Helpers in other apps).';
  if (!mayAct(app, s)) return `${app} isn’t on your list of apps helpers may act in.`;
  if (verb === 'arrange' && !['left', 'right', 'maximize'].includes(String(args.side))) return 'Choose left, right or maximize.';
  if (pointing.has(verb)) {
    if (!win) return `Read ${app} first, so Taurus knows where its window is.`;
    if (!inside(win, args.x, args.y) || (verb === 'drag' && !inside(win, args.toX, args.toY))) return `That spot is outside ${app}’s window.`;
  }
  return '';
}
