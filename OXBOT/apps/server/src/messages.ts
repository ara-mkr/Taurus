import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { note } from './activity.ts';
import { store } from './store.ts';

// Messages on this Mac (owner, November 16, 2026: "it should literally be able to take agentic control and see
// messages on macbook ... its like an assistant he can see everything that ppl r saying to u"). Read-only: OXBOT opens
// Apple's own Messages database (~/Library/Messages/chat.db) with SQLite in read-only mode and never writes to it.
// Off until the owner switches it on, and macOS only lets it read once the owner gives the app that runs OXBOT Full
// Disk Access himself. Sending stays an approval card through mac.ts ("mac.message"). See docs/22-agent-brain.md.

export const MESSAGES_SWITCH = 'MAC_MESSAGES_ON';
export const messagesOn = () => store.secret(MESSAGES_SWITCH) === '1';
// A test points this at a fixture database.
export const chatDb = () => process.env.OXBOT_CHAT_DB || join(homedir(), 'Library/Messages/chat.db');

export interface MacMessage {
  id: string; rowid: number; text: string;
  // The other person's phone number or Apple ID email (Messages keeps names in Contacts, which OXBOT doesn't read).
  from: string; fromMe: boolean;
  chat: string; group: boolean; at: string; service: string;
}

export interface MessagesStatus { on: boolean; state: 'off' | 'ready' | 'no-access' | 'missing' | 'not-mac'; detail?: string; steps?: string[]; newest?: string }

// What the owner does once, in his own words on the Scans page.
export const accessSteps = [
  'Open System Settings, then Privacy & Security, then Full Disk Access.',
  'Turn on the app that runs OXBOT: OXBOT itself if you use the desktop app, or Terminal (or iTerm) if you start OXBOT with pnpm dev from there.',
  'Quit that app and open it again, so macOS applies the change.',
  'Come back here and press Check again.',
];

/* eslint-disable @typescript-eslint/no-explicit-any -- SQLite rows are untyped */
type Db = { prepare(sql: string): { all(...args: unknown[]): any[]; get(...args: unknown[]): any }; close(): void };
async function open(): Promise<Db> {
  // Loaded only when Messages is on: node:sqlite still prints an experimental warning on Node 22.
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(chatDb(), { readOnly: true }) as unknown as Db;
}
const noAccess = (e: unknown) => /unable to open|authori[sz]|not permitted|EPERM|EACCES|SQLITE_CANTOPEN|disk I\/O|operation not permitted/i.test(String((e as Error)?.message ?? e));

// Newer macOS keeps a message's words only in attributedBody, an NSAttributedString in Apple's typedstream format.
// The words follow the NSString class name: a '+' marker, a length (one byte, or 0x81 then two bytes little-endian,
// or 0x82 then three), then UTF-8.
export function bodyText(blob: Uint8Array | null | undefined): string {
  if (!blob) return '';
  const b = Buffer.from(blob);
  const at = b.indexOf('NSString');
  if (at < 0) return '';
  const plus = b.indexOf(0x2b, at + 8);
  if (plus < 0 || plus > at + 20) return '';
  let p = plus + 1, len = b[p++];
  if (len === 0x81) { len = b.readUInt16LE(p); p += 2; } else if (len === 0x82) { len = b.readUIntLE(p, 3); p += 3; }
  if (!len || p + len > b.length) return '';
  return b.subarray(p, p + len).toString('utf8');
}

// Apple counts from January 1, 2001, in nanoseconds since macOS 10.13 (seconds before that).
const APPLE_EPOCH = 978_307_200;
export const appleDate = (n: number | bigint) => { const v = Number(n); return new Date((APPLE_EPOCH + (v > 1e12 ? v / 1e9 : v)) * 1000).toISOString(); };
// Nanosecond dates are too big for a JavaScript number, so SQLite turns them into seconds before they come out.
const SECS = (col: string) => `(CASE WHEN ${col} > 1000000000000 THEN ${col} / 1000000000.0 ELSE ${col} END)`;

export async function messagesStatus(): Promise<MessagesStatus> {
  const on = messagesOn();
  if (platform() !== 'darwin' && !process.env.OXBOT_CHAT_DB) return { on, state: 'not-mac', detail: 'Messages is only on a Mac.' };
  if (!on) return { on, state: 'off' };
  let db: Db | undefined;
  try {
    db = await open();
    const row = db.prepare(`SELECT ${SECS('MAX(date)')} AS d FROM message`).get();
    return { on, state: 'ready', newest: row?.d ? appleDate(row.d) : undefined };
  } catch (e) {
    if (!existsSync(join(chatDb(), '..')) && !noAccess(e)) return { on, state: 'missing', detail: 'This Mac has no Messages history yet. Open Messages and sign in first.' };
    return { on, state: 'no-access', detail: 'macOS hasn’t given OXBOT access to Messages yet.', steps: accessSteps };
  } finally { db?.close(); }
}

export interface ReadOptions { sinceRowid?: number; limit?: number; query?: string; from?: string; incomingOnly?: boolean }

// The newest messages first. Reactions ("Liked …") are left out. Each read is noted in Activity.
export async function readMessages(o: ReadOptions = {}): Promise<MacMessage[]> {
  if (!messagesOn()) throw new Error('Reading Messages is off. Switch it on in Settings, Scans, under Messages on this Mac.');
  let db: Db;
  try { db = await open(); } catch (e) { throw new Error(noAccess(e) ? 'macOS hasn’t given OXBOT access to Messages yet: Settings, Scans, Messages on this Mac shows the steps.' : `Couldn’t open Messages: ${(e as Error).message.slice(0, 160)}`); }
  try {
    const limit = Math.max(1, Math.min(200, Math.round(o.limit ?? 30)));
    const where = ['m.ROWID > ?', '(m.associated_message_type IS NULL OR m.associated_message_type = 0)'];
    const args: unknown[] = [Math.max(0, Math.round(o.sinceRowid ?? 0))];
    if (o.incomingOnly) where.push('m.is_from_me = 0');
    if (o.from) { where.push('(h.id LIKE ? OR c.display_name LIKE ? OR c.chat_identifier LIKE ?)'); const f = `%${o.from.replace(/[%_]/g, '')}%`; args.push(f, f, f); }
    // Words kept only in attributedBody can't be searched in SQL, so a search reads more and filters after decoding.
    const rows = db.prepare(`SELECT m.ROWID AS rowid, m.guid, m.text, m.attributedBody AS body, m.is_from_me AS me, ${SECS('m.date')} AS date, m.service,
        h.id AS handle, c.display_name AS name, c.chat_identifier AS ident, c.style
      FROM message m
      LEFT JOIN handle h ON h.ROWID = m.handle_id
      LEFT JOIN chat_message_join j ON j.message_id = m.ROWID
      LEFT JOIN chat c ON c.ROWID = j.chat_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.ROWID DESC LIMIT ?`).all(...args, o.query ? limit * 5 : limit);
    const q = o.query?.toLowerCase().trim();
    const out = rows.map((r): MacMessage => ({
      id: `mac:${r.guid ?? r.rowid}`, rowid: Number(r.rowid), text: String(r.text || bodyText(r.body) || '').slice(0, 2000),
      from: r.me ? 'me' : String(r.handle ?? r.ident ?? 'unknown'), fromMe: Boolean(r.me),
      chat: String(r.name || r.ident || r.handle || ''), group: Number(r.style) === 43, at: appleDate(r.date ?? 0), service: String(r.service ?? 'iMessage'),
    })).filter(m => m.text && (!q || m.text.toLowerCase().includes(q))).slice(0, limit);
    note('read', `Read ${out.length} message${out.length === 1 ? '' : 's'} from Messages on this Mac`, { by: 'ox' });
    return out;
  } finally { db.close(); }
}
