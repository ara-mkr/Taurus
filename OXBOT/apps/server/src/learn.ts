import { store } from './store.ts';
import type { Proposal } from './types.ts';

// Learning from your answers (owner, November 19, 2026, from Luke's 3-day Jarvis build: "If I tell you to send it, go
// ahead and send it. Remember my feedback, as eventually I want you to be able to respond to emails on your own").
// When you change a draft before approving it, or decline one, Taurus keeps a short lesson: what he wrote and what
// you sent instead, or that you said no. The latest lessons go into his instructions, so the next drafts sound more
// like you. This only shapes drafts: every send still waits for your OK. Saved in ~/.taurus/lessons.json, the last 40.

export interface Lesson { at: string; how: 'edited' | 'declined'; app: string; title: string; to?: string; before?: string; after?: string }

const FILE = 'lessons.json';
const MAX = 40;
const list = () => store.doc<Lesson[]>(FILE, []);
const clip = (text: string | undefined, n: number) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function keep(lesson: Lesson) { store.saveDoc(FILE, [...list(), lesson].slice(-MAX)); }

export function learnEdit(p: Proposal, before: string | undefined, after: string) {
  if (!before || clip(before, 2000) === clip(after, 2000)) return;
  keep({ at: new Date().toISOString(), how: 'edited', app: p.app, title: clip(p.title, 120), ...(p.to ? { to: clip(p.to, 120) } : {}), before: clip(before, 400), after: clip(after, 400) });
}

export function learnDecline(p: Proposal) {
  keep({ at: new Date().toISOString(), how: 'declined', app: p.app, title: clip(p.title, 120), ...(p.to ? { to: clip(p.to, 120) } : {}), ...(p.text ? { before: clip(p.text, 240) } : {}) });
}

export const lessons = () => list();
export const forgetLessons = () => store.saveDoc(FILE, []);

// For the AI's instructions: the newest dozen, plainly.
export function lessonsText(): string {
  const recent = list().slice(-12);
  if (!recent.length) return '';
  const lines = recent.map(l => l.how === 'edited'
    ? `- ${l.app}${l.to ? ` to ${l.to}` : ''}: you drafted "${l.before}". The owner sent this instead: "${l.after}".`
    : `- ${l.app}${l.to ? ` to ${l.to}` : ''}: the owner declined "${l.title}"${l.before ? ` (your draft: "${l.before}")` : ''}.`);
  return `What the owner changed or turned down in your past drafts (newest last). Match their wording, length and tone from these when you draft, and don't propose what they keep declining:\n${lines.join('\n')}`;
}
