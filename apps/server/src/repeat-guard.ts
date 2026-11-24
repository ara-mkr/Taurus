import { createHash } from 'node:crypto';

// Keeping Taurus's tool loop honest (owner, November 16, 2026: "look at openmausbot repo and look at the code they use for
// ai to actually do agentic actions"). Adapted from OpenMausBot (Copyright 2026 Milind Soni and OpenMausBot
// contributors, Apache License 2.0): server/drivers/chat-repeat-guard.ts and the English rules of
// server/drivers/chat-announcement.ts. See NOTICE at the Taurus root. Changes: Taurus's wording, a smaller stop limit
// for Taurus's shorter loop, and no Chinese-language rules.

// A model that is stuck says so by repeating itself: the same call, the same answer. Counted per call rather than back
// to back, so taking turns between two stuck calls is still stuck. A different answer starts the count over.
const REFUSE_AFTER_FAILURES = 3;
const REFUSALS_BEFORE_STOP = 2;
const SAME_ANSWER_NOTE_AT = 3;
const SAME_ANSWER_STOP_AT = 6;

interface Seen { ok: boolean; answer: string; streak: number }

// The same arguments in another key order are the same call.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(source).sort().map(key => [key, canonical(source[key])]));
}
const callKey = (name: string, args: unknown) => `${name}:${JSON.stringify(canonical(args))}`;
const digest = (text: string) => createHash('sha256').update(text).digest('base64');

export class RepeatGuard {
  private readonly seen = new Map<string, Seen>();
  private refusals = 0;
  private stuck: string | null = null;

  // Why this call must not run again, or null. Asked before it runs.
  refuses(name: string, args: unknown): string | null {
    const seen = this.seen.get(callKey(name, args));
    if (!seen || seen.ok || seen.streak < REFUSE_AFTER_FAILURES) return null;
    if (++this.refusals >= REFUSALS_BEFORE_STOP) this.stuck = `I kept trying ${name} the same way and it kept failing, so I stopped. Ask me again a different way.`;
    return `Not run: this exact call already failed ${seen.streak} times the same way. Use different inputs, try another way, or say what is blocking.`;
  }

  // A note to add to a result the model has seen before. A picture is never the same answer.
  noteAfter(name: string, args: unknown, result: { ok: boolean; text: string; image?: boolean }): string | undefined {
    const key = callKey(name, args);
    if (result.image) { this.seen.delete(key); return undefined; }
    const answer = digest(result.text);
    const before = this.seen.get(key);
    const streak = before && before.ok === result.ok && before.answer === answer ? before.streak + 1 : 1;
    this.seen.set(key, { ok: result.ok, answer, streak });
    if (!result.ok) return streak === REFUSE_AFTER_FAILURES ? `This exact call has now failed ${streak} times the same way, so it won’t run again. Change approach, or say what is blocking.` : undefined;
    if (streak >= SAME_ANSWER_STOP_AT) this.stuck = `I kept getting the same answer from ${name}, so I stopped there.`;
    return streak >= SAME_ANSWER_NOTE_AT ? `This call has returned the same result ${streak} times. Use it, try something else, or answer.` : undefined;
  }

  // Set once the loop should end: the words to end it with.
  get stopped(): string | null { return this.stuck; }
}

// A reply that says what it will do next ("Let me check your calendar.") but calls no tool. Smaller models end their
// turn like that; the loop nudges them once or twice to actually do it.
export function announcesAction(text: string): boolean {
  const reply = text.trim();
  if (!reply || reply.length > 4_000 || reply.includes('?')) return false;
  if (reply.length > 400) {
    const tail = reply.split(/\n\s*\n/).at(-1)!.trim();
    return tail.length <= 400 && /^(?:let me|i['’]ll|i will|i(?:['’]m| am) going to)\s+(?:now\s+)?(?:execute|send|type|press|launch|open|check|inspect|read|fetch|run|create|write|verify|look|search|find|pull)\b/i.test(tail);
  }
  // Taurus's persona says defaults out loud ("I'll tell Dana Thursday at 10 works."), so "I'll" alone is not an
  // announcement here: only "I'll check / look / pull …", the -ing openers, and a reply that trails off.
  return /(?:[:—–]|\.\.\.|…)$/.test(reply) ||
    /^(?:checking|let me(?! know\b)|(?:i'll|i’ll|i will|i'm going to|i’m going to|i am going to)\s+(?:now\s+)?(?:check|look|pull|search|open|read|fetch|find|grab|see|browse)|opening|pulling|looking|searching|navigating|reading|fetching|loading|one sec|hang on|now (?:let me|opening|checking|pulling|reading))\b/i.test(reply);
}
