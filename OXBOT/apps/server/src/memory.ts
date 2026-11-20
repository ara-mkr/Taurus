import { randomBytes } from 'node:crypto';
import { store } from './store.ts';
import type { Memory } from './types.ts';
import { show } from './windows.ts';

// What Taurus remembers about you (owner, November 4, 2026), the feature people say makes OpenClaw feel like theirs:
// "remember I take my coffee black", "forget the gym thing", "what do you know about me". Only what you tell it
// to remember, in your words, saved in ~/.taurus/memory.json and sent to your chosen AI with each question.

const FILE = 'memory.json';
const MAX = 200;
let all: Memory[] = store.doc<Memory[]>(FILE, []);
const save = () => store.saveDoc(FILE, all.slice(-MAX));

export const memories = () => all.slice();
const window = (extra: { added?: string; removed?: string } = {}, said?: string) => show({ id: 'memory', kind: 'memory', memories: memories(), said, ...extra });

export function remember(text: string, said?: string): Memory {
  const clean = text.trim().replace(/^(that|this:?)\s+/i, '').replace(/[.!]+$/, '').slice(0, 300);
  const same = all.find(m => m.text.toLowerCase() === clean.toLowerCase());
  if (same) { window({ added: same.text }, said); return same; }
  const m: Memory = { id: `m-${randomBytes(4).toString('hex')}`, text: clean, at: new Date().toISOString() };
  all.push(m); save(); window({ added: m.text }, said);
  return m;
}

// The memory that shares the most words with what you said.
export function forget(what: string, said?: string): Memory | undefined {
  const words = what.toLowerCase().replace(/^(that|about|the)\s+/, '').split(/\W+/).filter(w => w.length > 2);
  if (!words.length) return undefined;
  const hit = all.map(m => ({ m, score: words.filter(w => m.text.toLowerCase().includes(w)).length })).filter(s => s.score > 0).sort((a, b) => b.score - a.score)[0]?.m;
  if (hit) { all = all.filter(m => m !== hit); save(); window({ removed: hit.text }, said); }
  return hit;
}
export function forgetById(id: string) { const hit = all.find(m => m.id === id); all = all.filter(m => m.id !== id); save(); if (hit) window({ removed: hit.text }); }
export const showMemory = (said?: string) => window({}, said);

// For the AI's system prompt.
export const memoryText = () => all.length ? `What the owner asked you to remember (their words, newest last):\n${all.slice(-60).map(m => `- ${m.text}`).join('\n')}` : '';
// For tests.
export const resetMemory = () => { all = []; };
