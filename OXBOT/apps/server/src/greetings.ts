import type { Tone } from './types.ts';

// "Hey Taurus" on its own answers at once, with no AI (owner, November 7, 2026: "like I say hey taurus it says hey back
// within a second"). Short lines, so Taurus's voice can say them as fast as it shows them; the witty set is the default.

const GREETING = /^(?:|hey|hi|hiya|hello|yo|ayo|sup|what'?s up|wassup|whaddup|hey there|you there|are you there|you up|are you up|wake up|morning|good (?:morning|afternoon|evening))$/;
const HOW = /^(?:how are you(?: doing)?|how'?s it going|how you doing|how are things|you good|you alright)$/;

const witty = ['Hey.', 'Yo.', 'Hey. What do you need?', 'Talk to me.', 'What’s up?', 'Here. Go.', 'At your service. Mostly.', 'Hey. What are we breaking today?'];
const plain = ['Hey. What do you need?', 'Here.', 'Yes?'];
const wittyHow = ['Running at full speed. You?', 'Better than your sleep schedule. What’s up?', 'Never better. What do you need?'];
const plainHow = ['All good. What do you need?'];
const lateNight = ['Hey. Shouldn’t you be asleep?', 'Middle of the night. What are we doing?'];
const earlyMorning = ['Morning. What’s first?', 'Morning. Coffee first, then what?'];

let last = '';
function pick(lines: string[], random: () => number) {
  const options = lines.length > 1 ? lines.filter(l => l !== last) : lines;
  last = options[Math.floor(random() * options.length)] ?? lines[0];
  return last;
}

// What was said once the wake word, "please" and punctuation are gone; null when it isn't just a hello.
export function greeting(said: string, tone: Tone = 'witty', now = new Date(), random = Math.random): string | null {
  const how = HOW.test(said);
  if (!how && !GREETING.test(said)) return null;
  const sharp = tone === 'witty';
  if (how) return pick(sharp ? wittyHow : plainHow, random);
  const hour = now.getHours();
  if (sharp && hour >= 1 && hour < 5) return pick(lateNight, random);
  if (sharp && hour >= 5 && hour < 9) return pick(earlyMorning, random);
  return pick(sharp ? witty : plain, random);
}

// Every line it can say, so Taurus's voice can have them ready before the first "Hey Taurus".
export const allGreetings = [...new Set([...witty, ...plain, ...wittyHow, ...plainHow, ...lateNight, ...earlyMorning])];
