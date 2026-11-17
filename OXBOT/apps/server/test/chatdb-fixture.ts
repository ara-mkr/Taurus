// A small stand-in for ~/Library/Messages/chat.db, with the same tables and columns OXBOT reads. Example numbers
// and addresses only. One message keeps its words only in attributedBody, the way newer macOS stores them.
import { join } from 'node:path';

export interface FixtureMessage { text?: string; body?: string; from: string; me?: boolean; minutesAgo: number; chat?: string; group?: boolean; reaction?: boolean }

// Apple's typedstream layout around the words: ... NSString, a few bytes, '+', the length, then UTF-8.
export function attributedBody(text: string): Buffer {
  const words = Buffer.from(text, 'utf8');
  const len = words.length < 0x80 ? Buffer.from([words.length]) : Buffer.concat([Buffer.from([0x81]), (() => { const b = Buffer.alloc(2); b.writeUInt16LE(words.length); return b; })()]);
  return Buffer.concat([Buffer.from([0x04, 0x0b]), Buffer.from('streamtyped'), Buffer.from([0x81, 0xe8, 0x03, 0x84, 0x01, 0x40, 0x84, 0x84, 0x84]), Buffer.from('NSAttributedString'), Buffer.from([0x00, 0x84, 0x84]), Buffer.from('NSObject'), Buffer.from([0x00, 0x85, 0x92, 0x84, 0x84, 0x84]), Buffer.from('NSString'), Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]), len, words, Buffer.from([0x86, 0x84])]);
}

export async function makeChatDb(dir: string, messages: FixtureMessage[]): Promise<string> {
  const { DatabaseSync } = await import('node:sqlite');
  const file = join(dir, 'chat.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT, service TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, chat_identifier TEXT, display_name TEXT, style INTEGER);
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY, guid TEXT, text TEXT, attributedBody BLOB, handle_id INTEGER, is_from_me INTEGER, date INTEGER, service TEXT, associated_message_type INTEGER DEFAULT 0);
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);`);
  const handles = new Map<string, number>(), chats = new Map<string, number>();
  const appleNs = (ms: number) => BigInt(Math.round(ms - 978_307_200_000)) * 1_000_000n;
  messages.forEach((m, n) => {
    const who = m.from === 'me' ? (m.chat ?? 'chat') : m.from;
    if (!handles.has(who)) { handles.set(who, handles.size + 1); db.prepare('INSERT INTO handle (ROWID, id, service) VALUES (?, ?, ?)').run(handles.get(who)!, who, 'iMessage'); }
    const chatKey = m.chat ?? who;
    if (!chats.has(chatKey)) { chats.set(chatKey, chats.size + 1); db.prepare('INSERT INTO chat (ROWID, chat_identifier, display_name, style) VALUES (?, ?, ?, ?)').run(chats.get(chatKey)!, chatKey, m.group ? chatKey : '', m.group ? 43 : 45); }
    const rowid = n + 1;
    db.prepare('INSERT INTO message (ROWID, guid, text, attributedBody, handle_id, is_from_me, date, service, associated_message_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(rowid, `GUID-${rowid}`, m.text ?? null, m.body ? attributedBody(m.body) : null, handles.get(who)!, m.me ? 1 : 0, appleNs(Date.now() - m.minutesAgo * 60_000), 'iMessage', m.reaction ? 2000 : 0);
    db.prepare('INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)').run(chats.get(chatKey)!, rowid);
  });
  db.close();
  return file;
}
