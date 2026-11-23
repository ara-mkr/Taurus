import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { note as activity } from './activity.ts';
import { prefs } from './boards.ts';
import { memories } from './memory.ts';
import { HttpError, store } from './store.ts';

// The Brain (owner, November 16, 2026: "make it have a mindmap like obsidian of everything it remembers about u from ur
// personality to job, friends, hobbies ... under certain dots like job, there will be files like resume and shit u can
// just pull from, so u never forget"). A folder of plain markdown notes in ~/.taurus/brain, the way Obsidian keeps a
// vault: one note per thing, YAML frontmatter on top, [[links]] between notes, and files in attachments/ embedded with
// ![[file]]. The owner can open the folder in Obsidian and see the same graph. Nothing here leaves this Mac.

export const HUBS: { title: string; about: string }[] = [
  { title: 'Me', about: 'Everything Taurus knows about you starts here.' },
  { title: 'Personality', about: 'How you like to work, talk and decide.' },
  { title: 'Career', about: 'Jobs, internships, your resume, and how applications should be answered.' },
  { title: 'School', about: 'Classes, grades, transcripts and what you study.' },
  { title: 'Friends', about: 'The people you are close to.' },
  { title: 'Family', about: 'Family, birthdays and what matters to them.' },
  { title: 'Hobbies', about: 'What you do for fun.' },
  { title: 'Projects', about: 'Things you are building.' },
];
const FILE_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.doc': 'application/msword', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export const MAX_FILE = 25_000_000;
export const fileType = (name: string) => FILE_TYPES[extname(name).toLowerCase()];

export type Meta = Record<string, string | string[]>;
export interface Note {
  title: string; path: string; hub: boolean; up?: string; tags: string[]; updated: string; source?: string;
  meta: Meta; body: string; links: string[]; files: string[];
}
export interface GraphNode { id: string; title: string; kind: 'hub' | 'note' | 'file' | 'missing'; up?: string; size: number }
export interface Graph { nodes: GraphNode[]; links: { source: string; target: string }[] }
export interface Suggestion { id: string; fact: string; note: string; at: string; why?: string }

const root = () => join(store.dir, 'brain');
const attachments = () => join(root(), 'attachments');
const trash = () => join(root(), '.trash');

// ---------- Markdown, frontmatter and links ----------

const yamlValue = (raw: string): string | string[] => {
  const v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']') && !v.startsWith('[[')) return v.slice(1, -1).split(',').map(x => unquote(x.trim())).filter(Boolean);
  return unquote(v);
};
function unquote(v: string) {
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) { try { return String(JSON.parse(v)); } catch { return v.slice(1, -1); } }
  if (v.startsWith('\'') && v.endsWith('\'') && v.length >= 2) return v.slice(1, -1).replace(/''/g, '\'');
  return v;
}

// The small part of YAML notes use: key: value, key: [a, b], and a key followed by "- item" lines.
export function parseNote(text: string): { meta: Meta; body: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: src };
  const meta: Meta = {};
  let listKey = '';
  for (const line of m[1].split('\n')) {
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) { const list = meta[listKey]; meta[listKey] = [...(Array.isArray(list) ? list : []), unquote(item[1].trim())]; continue; }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    listKey = kv[2].trim() ? '' : kv[1];
    meta[kv[1]] = kv[2].trim() ? yamlValue(kv[2]) : [];
  }
  return { meta, body: src.slice(m[0].length) };
}

const quote = (v: string) => /^[\w .@/+-]*$/.test(v) && v.trim() === v && v !== '' && !/^(true|false|null|yes|no|\d[\d.]*)$/i.test(v) ? v : JSON.stringify(v);
export function writeNote(meta: Meta, body: string): string {
  const lines = Object.entries(meta).filter(([, v]) => Array.isArray(v) ? v.length : v !== '').map(([k, v]) => Array.isArray(v) ? `${k}: [${v.map(quote).join(', ')}]` : `${k}: ${quote(v)}`);
  return `${lines.length ? `---\n${lines.join('\n')}\n---\n` : ''}${body.replace(/^\n+/, '')}`;
}

// [[Note]], [[Note|shown words]], [[Note#heading]], ![[file.pdf]]. Links inside code are not links.
export function parseLinks(text: string): { links: string[]; files: string[] } {
  const plain = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const links = new Set<string>(), files = new Set<string>();
  for (const m of plain.matchAll(/(!?)\[\[([^\]\n]+?)\]\]/g)) {
    const target = m[2].split('|')[0].split('#')[0].trim();
    if (!target) continue;
    const ext = extname(target).toLowerCase();
    if (ext && ext !== '.md' && fileType(target)) files.add(target);
    else links.add(target.replace(/\.md$/i, ''));
  }
  return { links: [...links], files: [...files] };
}

// A title becomes a file name Obsidian accepts: no slashes, colons or the characters links use.
export function cleanTitle(raw: string) {
  const t = String(raw ?? '').replace(/[\\/:*?"<>|#^[\]\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80).trim();
  if (!t) throw new HttpError(400, 'Give the note a title.');
  return t;
}
export function cleanFileName(raw: string) {
  const name = String(raw ?? '').split(/[\\/]/).pop()!.replace(/[^\w .()+-]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 100);
  if (!name || !fileType(name)) throw new HttpError(415, 'Add a PDF, picture, text, Word or PowerPoint file.');
  return name;
}
const inside = (base: string, path: string) => { const rel = relative(base, path); return Boolean(rel) && !rel.startsWith('..') && !rel.startsWith(sep); };

// ---------- The vault on disk ----------

function writeFile(path: string, text: string) {
  const tmp = `${path}.${randomBytes(3).toString('hex')}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}
const mkdir = (path: string) => mkdirSync(path, { recursive: true, mode: 0o700 });

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'attachments') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const metaText = (meta: Meta, key: string) => { const v = meta[key]; return Array.isArray(v) ? v[0] ?? '' : v ?? ''; };
const linkTarget = (v: string) => v.match(/\[\[([^\]|#]+)/)?.[1].trim() ?? (v.trim() || undefined);

function load(path: string): Note {
  const { meta, body } = parseNote(readFileSync(path, 'utf8'));
  const title = path.split(sep).pop()!.replace(/\.md$/, '');
  // Links in properties count too, the way Obsidian draws them: up: "[[Career]]".
  const inMeta = parseLinks(Object.values(meta).flat().join('\n'));
  const inBody = parseLinks(body);
  const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [];
  return {
    title, path: relative(root(), path), hub: metaText(meta, 'kind') === 'hub', up: linkTarget(metaText(meta, 'up')), tags,
    updated: metaText(meta, 'updated') || statSync(path).mtime.toISOString(), source: metaText(meta, 'source') || undefined,
    meta, body, links: [...new Set([...inMeta.links, ...inBody.links])], files: [...new Set([...inMeta.files, ...inBody.files])],
  };
}

let seeded = false;
function ensure() {
  mkdir(root()); mkdir(attachments());
  if (seeded) return;
  seeded = true;
  for (const h of HUBS) {
    const path = join(root(), `${h.title}.md`);
    if (existsSync(path)) continue;
    const meta: Meta = { kind: 'hub', ...(h.title === 'Me' ? {} : { up: '[[Me]]' }), updated: new Date().toISOString() };
    writeFile(path, writeNote(meta, `${h.about}\n`));
  }
}

export function notes(): Note[] {
  ensure();
  return walk(root()).map(load).sort((a, b) => a.title.localeCompare(b.title));
}
const find = (title: string) => { const t = title.trim().toLowerCase(); return notes().find(n => n.title.toLowerCase() === t); };
export function getNote(title: string): Note {
  const n = find(String(title ?? ''));
  if (!n) throw new HttpError(404, `There’s no note called ${title} in the Brain.`);
  return n;
}
export const hasNote = (title: string) => Boolean(find(title));

// Create or change a note. A note under a hub lives in that hub's folder; renaming updates every link to it.
export function saveNote(input: { title: string; body?: string; up?: string; tags?: string[]; was?: string; meta?: Meta; source?: string }): Note {
  ensure();
  const title = cleanTitle(input.title);
  const old = input.was ? find(input.was) : find(title);
  if (input.was && !old) throw new HttpError(404, `There’s no note called ${input.was} in the Brain.`);
  const clash = find(title);
  if (clash && old && clash.path !== old.path) throw new HttpError(409, `A note called ${title} already exists.`);
  if (old?.hub && old.title !== title) throw new HttpError(400, `${old.title} is one of the Brain’s main dots and keeps its name.`);
  const upTitle = input.up !== undefined ? (input.up ? cleanTitle(input.up) : '') : old?.up ?? '';
  if (upTitle && upTitle.toLowerCase() === title.toLowerCase()) throw new HttpError(400, 'A note can’t sit under itself.');
  const meta: Meta = { ...(old?.meta ?? {}), ...(input.meta ?? {}) };
  if (upTitle) meta.up = `[[${upTitle}]]`; else delete meta.up;
  if (input.tags) meta.tags = input.tags.map(t => t.replace(/[^\w/-]/g, '')).filter(Boolean).slice(0, 12);
  if (input.source && !old) meta.source = input.source;
  meta.updated = new Date().toISOString();
  const body = input.body !== undefined ? String(input.body).slice(0, 200_000) : old?.body ?? '';
  // Notes under a main dot live in its folder (Career/Resume.md); deeper notes sit next to their parent.
  const parent = upTitle ? find(upTitle) : undefined;
  const folder = !parent ? '' : parent.hub ? parent.title : parent.path.split(sep).slice(0, -1).join(sep);
  const path = old?.hub ? join(root(), old.path) : join(root(), folder, `${title}.md`);
  if (!inside(root(), path)) throw new HttpError(400, 'That note would land outside the Brain.');
  mkdir(join(path, '..'));
  writeFile(path, writeNote(meta, body.endsWith('\n') || !body ? body : `${body}\n`));
  if (old && join(root(), old.path) !== path) {
    unlinkSync(join(root(), old.path));
    if (old.title !== title) relink(old.title, title);
  }
  return load(path);
}

function relink(from: string, to: string) {
  const pattern = new RegExp(`\\[\\[${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\]|#])`, 'gi');
  for (const n of notes()) {
    const path = join(root(), n.path);
    const text = readFileSync(path, 'utf8');
    const next = text.replace(pattern, `[[${to}`);
    if (next !== text) writeFile(path, next);
  }
}

// Removing a note moves it to .trash inside the vault: nothing is lost by a wrong tap.
export function removeNote(title: string) {
  const n = getNote(title);
  if (n.hub) throw new HttpError(400, `${n.title} is one of the Brain’s main dots and stays.`);
  mkdir(trash());
  renameSync(join(root(), n.path), join(trash(), `${n.title}.${Date.now()}.md`));
}

// Appends one line under a heading, adding the heading when it isn't there yet.
export function addLine(title: string, heading: string, line: string, source?: string): Note {
  const n = find(title) ?? saveNote({ title, up: 'Me', body: '', source });
  const head = `## ${heading}`;
  const body = n.body.replace(/\s+$/, '');
  const lines = body.split('\n');
  const at = lines.findIndex(l => l.trim() === head);
  if (at < 0) return saveNote({ title: n.title, body: `${body}${body ? '\n\n' : ''}${head}\n${line}` });
  let end = at + 1;
  while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
  while (end > at + 1 && !lines[end - 1].trim()) end--;
  lines.splice(end, 0, line);
  return saveNote({ title: n.title, body: lines.join('\n') });
}

// ---------- Files under a note ----------

export function attach(title: string, rawName: string, data: Buffer): { note: Note; file: string } {
  const n = getNote(title);
  if (data.length > MAX_FILE) throw new HttpError(413, 'That file is too big. Pick one under 25 MB.');
  if (!data.length) throw new HttpError(400, 'That file is empty.');
  let name = cleanFileName(rawName);
  const ext = extname(name), stem = name.slice(0, -ext.length);
  for (let i = 2; existsSync(join(attachments(), name)); i++) name = `${stem} ${i}${ext}`;
  writeFileSync(join(attachments(), name), data, { mode: 0o600 });
  activity('tool', `Added ${name} to ${n.title} in the Brain`);
  warm([name]);
  return { note: addLine(n.title, 'Files', `![[${name}]]`), file: name };
}

export function filePath(rawName: string): string {
  ensure();
  const name = cleanFileName(rawName);
  const path = join(attachments(), name);
  if (!inside(attachments(), path) || !existsSync(path)) throw new HttpError(404, `No file called ${name} in the Brain.`);
  return path;
}

// Takes a file off a note. The file itself goes to .trash once no other note embeds it.
export function detach(title: string, rawName: string): Note {
  const n = getNote(title);
  const name = cleanFileName(rawName);
  const pattern = new RegExp(`^.*!?\\[\\[${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\|[^\\]]*)?\\]\\].*\\n?`, 'gm');
  const next = saveNote({ title: n.title, body: n.body.replace(pattern, '') });
  if (!notes().some(x => x.files.includes(name)) && existsSync(join(attachments(), name))) { mkdir(trash()); renameSync(join(attachments(), name), join(trash(), `${Date.now()}-${name}`)); }
  return next;
}

// A file's words, for a prompt: text files as they are, PDFs through unpdf (MIT). Pictures have no words here.
// Cached by modification time and size (November 22, 2026; adapted from Nus's context-pack cache, potlakai/nus-desktop,
// MIT, see NOTICE): a PDF is parsed once and read from memory until the file changes, so asking about a resume or a
// lease twice doesn't parse it twice. At most 64 files are kept, the least recently used dropped first. Only the words
// are kept, in this process's memory; nothing is written anywhere.
const TEXT_MAX = 20_000, TEXT_FILES = 64;
const readable = (ext: string) => ['.txt', '.md', '.csv', '.json', '.pdf'].includes(ext);
const wordsCache = new Map<string, { mtimeMs: number; size: number; text: string }>();
async function extract(path: string, ext: string): Promise<string> {
  if (ext !== '.pdf') return readFileSync(path, 'utf8').slice(0, TEXT_MAX);
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, TEXT_MAX);
}
// The cached words when they are still current, without reading the file.
function cachedWords(path: string): string | undefined {
  const hit = wordsCache.get(path);
  if (!hit) return undefined;
  try { const st = statSync(path); if (st.mtimeMs === hit.mtimeMs && st.size === hit.size) return hit.text; } catch { /* gone: drop it */ }
  wordsCache.delete(path);
  return undefined;
}
export async function fileText(rawName: string, limit = TEXT_MAX): Promise<string> {
  const path = filePath(rawName);
  const ext = extname(path).toLowerCase();
  if (!readable(ext)) throw new HttpError(415, `${rawName} has no text Taurus can read. Open it instead.`);
  const cached = cachedWords(path);
  if (cached !== undefined) { const hit = wordsCache.get(path)!; wordsCache.delete(path); wordsCache.set(path, hit); return cached.slice(0, limit); }
  const st = statSync(path);
  const text = await extract(path, ext);
  wordsCache.set(path, { mtimeMs: st.mtimeMs, size: st.size, text });
  while (wordsCache.size > TEXT_FILES) wordsCache.delete(wordsCache.keys().next().value!);
  return text.slice(0, limit);
}
// Reads files' words in the background, one at a time, so search can look inside them next time. Never throws.
let warming = Promise.resolve();
function warm(names: string[]) {
  for (const name of names) {
    if (!readable(extname(name).toLowerCase())) continue;
    warming = warming.then(() => fileText(name)).then(() => undefined, () => undefined);
  }
}
const fileWords = (name: string) => { try { return cachedWords(filePath(name)); } catch { return undefined; } };

// ---------- The graph ----------

export function graph(): Graph {
  const all = notes();
  const byTitle = new Map(all.map(n => [n.title.toLowerCase(), n]));
  const nodes = new Map<string, GraphNode>();
  const links: Graph['links'] = [];
  const seen = new Set<string>();
  const degree = new Map<string, number>();
  const edge = (a: string, b: string) => {
    const key = [a, b].sort().join('\u0000');
    if (a === b || seen.has(key)) return;
    seen.add(key); links.push({ source: a, target: b });
    degree.set(a, (degree.get(a) ?? 0) + 1); degree.set(b, (degree.get(b) ?? 0) + 1);
  };
  for (const n of all) nodes.set(n.title, { id: n.title, title: n.title, kind: n.hub ? 'hub' : 'note', up: n.up, size: 1 });
  for (const n of all) {
    for (const l of n.links) {
      const hit = byTitle.get(l.toLowerCase());
      // Links to notes that don't exist yet show faintly, the way Obsidian shows them.
      if (!hit && !nodes.has(l)) nodes.set(l, { id: l, title: l, kind: 'missing', size: 1 });
      edge(n.title, hit?.title ?? l);
    }
    for (const f of n.files) { const id = `file:${f}`; if (!nodes.has(id)) nodes.set(id, { id, title: f, kind: 'file', up: n.title, size: 1 }); edge(n.title, id); }
  }
  for (const node of nodes.values()) node.size = node.kind === 'hub' ? 6 + Math.min(6, (degree.get(node.id) ?? 0) / 2) : node.kind === 'file' ? 1.5 : 2 + Math.min(3, (degree.get(node.id) ?? 0) / 2);
  return { nodes: [...nodes.values()], links };
}

// ---------- Search, for the Brain page and for Taurus ----------

const STOP = new Set(['my', 'the', 'is', 'what', 'whats', 'of', 'an', 'and', 'do', 'does', 'me', 'about', 'for', 'to', 'in', 'on', 'did', 'are', 'was', 'who', 'where', 'when', 'how']);
const words = (q: string) => q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !STOP.has(w));
export function search(query: string, limit = 8): { title: string; up?: string; snippet: string; files: string[]; score: number }[] {
  const q = words(query);
  if (!q.length) return [];
  const all = notes();
  // The words inside attached files count too, once they've been read (November 22, 2026): a lease in Legal answers
  // "what does my lease say about pets". Files not read yet are read in the background for next time.
  warm(all.flatMap(n => n.files).filter(f => fileWords(f) === undefined));
  return all.map(n => {
    const title = n.title.toLowerCase(), body = n.body.toLowerCase(), tags = n.tags.join(' ').toLowerCase(), files = n.files.join(' ').toLowerCase();
    const inside = n.files.map(f => ({ f, text: fileWords(f) ?? '' })).filter(x => x.text);
    const score = q.reduce((s, w) => s + (title.includes(w) ? 5 : 0) + (tags.includes(w) ? 3 : 0) + (files.includes(w) ? 3 : 0) + Math.min(3, body.split(w).length - 1)
      + Math.min(3, inside.reduce((c, x) => c + x.text.toLowerCase().split(w).length - 1, 0)), 0);
    const at = q.map(w => body.indexOf(w)).filter(i => i >= 0).sort((a, b) => a - b)[0];
    let snippet = n.body.slice(Math.max(0, (at ?? 0) - 80), (at ?? 0) + 220).replace(/\s+/g, ' ').trim();
    // Nothing in the note's own words: show where a file mentions it.
    if (at === undefined) for (const x of inside) { const low = x.text.toLowerCase(); const i = q.map(w => low.indexOf(w)).filter(j => j >= 0).sort((a, b) => a - b)[0]; if (i !== undefined) { snippet = `${x.f}: ${x.text.slice(Math.max(0, i - 80), i + 220).replace(/\s+/g, ' ').trim()}`; break; } }
    return { title: n.title, up: n.up, snippet, files: n.files, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- What Taurus already knows, and what he learns ----------

// Memories are the owner's own words ("remember I take my coffee black"), so they go straight in, each under the main
// dot it fits, marked with its id so it lands once. Nothing Taurus only guessed is added this way.
const homes: [RegExp, string][] = [
  [/\b(job|work|intern|internship|career|resume|cv|boss|manager|salary|interview|recruiter|linkedin|offer|employer)\b/i, 'Career'],
  [/\b(school|class|classes|gpa|major|minor|university|college|semester|professor|course|degree|exam|transcript|grades?)\b/i, 'School'],
  [/\b(friend|friends|buddy|bestie|roommate)\b/i, 'Friends'],
  [/\b(mom|mum|dad|mother|father|sister|brother|sibling|grandma|grandpa|aunt|uncle|cousin|wife|husband|son|daughter|family|parents)\b/i, 'Family'],
  [/\b(hobby|hobbies|gym|running|lift|basketball|soccer|football|guitar|piano|gaming|reading|cooking|hiking|chess|drawing|painting|surf|climbing)\b/i, 'Hobbies'],
  [/\b(project|side project|startup|repo|building)\b/i, 'Projects'],
];
export const hubFor = (fact: string) => homes.find(([re]) => re.test(fact))?.[1] ?? 'Personality';

export function syncMemories(): number {
  ensure();
  const vault = notes().map(n => n.body).join('\n');
  let added = 0;
  for (const m of memories()) {
    if (vault.includes(`^${m.id}`)) continue;
    addLine(hubFor(m.text), 'Remembered', `- ${m.text.replace(/\n/g, ' ')} ^${m.id}`);
    added++;
  }
  // The name from your profile, once, on the Me note.
  const name = prefs().profile?.name?.trim();
  const me = find('Me');
  if (name && me && !me.meta.name) saveNote({ title: 'Me', meta: { name } });
  return added;
}

const SUGGESTIONS = 'brain-suggestions.json';
export const suggestions = () => store.doc<Suggestion[]>(SUGGESTIONS, []);
// "Add to Brain?": something Taurus picked up that the owner didn't ask him to remember waits here for a yes.
export function suggest(fact: string, noteTitle?: string, why?: string): Suggestion {
  const text = String(fact ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) throw new HttpError(400, 'Say what to add.');
  const all = suggestions();
  const same = all.find(s => s.fact.toLowerCase() === text.toLowerCase());
  if (same) return same;
  let target = noteTitle ? cleanTitle(noteTitle) : hubFor(text);
  if (!hasNote(target)) target = hubFor(text);
  const s: Suggestion = { id: `s-${randomBytes(4).toString('hex')}`, fact: text, note: target, at: new Date().toISOString(), ...(why ? { why: String(why).slice(0, 200) } : {}) };
  store.saveDoc(SUGGESTIONS, [...all, s].slice(-50));
  activity('tool', `Taurus wants to add to ${target}: ${text.slice(0, 60)}`, { by: 'taurus' });
  return s;
}
export function decide(id: string, add: boolean, noteTitle?: string): Note | undefined {
  const all = suggestions();
  const s = all.find(x => x.id === id);
  if (!s) throw new HttpError(404, 'That suggestion is gone.');
  store.saveDoc(SUGGESTIONS, all.filter(x => x.id !== id));
  if (!add) return undefined;
  return addLine(noteTitle ? cleanTitle(noteTitle) : s.note, 'Learned', `- ${s.fact}`);
}

// For tests.
export const brainDir = root;
export const resetBrain = () => { seeded = false; };

// ---------- Taurus's tools ----------

export const brainToolsText = `- brain_search {"query": what to look for, like "gpa", "mom birthday", "resume"}: searches the owner's Brain, the notes Taurus keeps about them (personality, career, school, friends, family, hobbies, projects) and the files on those notes, like their resume or transcript. Use it first for any question about the owner's own life or details ("what's my GPA", "when is my sister's birthday", "what did I study").
- brain_read {"note": a note title from brain_search, "file": optional, a file name on that note}: the whole note, or the words of one of its files (PDF or text).
- brain_suggest {"fact": one fact about the owner in plain words, "note": the note it belongs under}: suggests adding something you learned about the owner to the Brain. It waits for the owner's yes on the Brain page. Use it for things they told you but didn't ask you to remember.`;

/* eslint-disable @typescript-eslint/no-explicit-any -- tool arguments come from the AI as JSON */
export async function brainTool(name: string, args: Record<string, any>): Promise<unknown> {
  if (name === 'brain_search') {
    const results = search(String(args.query ?? ''), 6);
    return results.length ? { results, note: 'From the owner’s own Brain.' } : { results: [], note: 'Nothing in the Brain matches. Say you don’t know rather than guess.' };
  }
  if (name === 'brain_read') {
    const n = getNote(String(args.note ?? ''));
    if (args.file) {
      const file = String(args.file);
      if (!n.files.includes(file)) return { error: `${file} isn’t on ${n.title}. Its files: ${n.files.join(', ') || 'none'}.` };
      return { note: n.title, file, text: await fileText(file, 12_000) };
    }
    return { title: n.title, under: n.up, tags: n.tags, text: n.body.slice(0, 8000), files: n.files, links: n.links };
  }
  if (name === 'brain_suggest') { const s = suggest(String(args.fact ?? ''), args.note ? String(args.note) : undefined); return { suggested: s.fact, under: s.note, note: 'Waiting for the owner’s yes on the Brain page. Not added yet.' }; }
  return undefined;
}
