import { createHmac, timingSafeEqual } from 'node:crypto';
import { approve, decline, get, spoken } from './actions/index.ts';
import { converse } from './agent.ts';
import type { Turn } from './ai.ts';
import { phoneNumber, xml } from './ring.ts';
import { store } from './store.ts';

// Calling OXBOT from your phone (owner, November 1, 2026). Twilio answers your Twilio number, turns your speech into
// text and posts it here; OXBOT answers with the same AI, tools and approvals as Ask, reads any action back word for
// word, and runs it only when you say yes. Three locks: Twilio's signature on every request, your own mobile as the
// caller, and a PIN typed on the keypad (caller ID alone can be faked). Needs a public address for this Mac,
// which is the owner's decision (docs/decision-log.md). Tested only against mocked Twilio requests.

interface Session { at: number; turns: Turn[]; pending?: string; asked: number }
const sessions = new Map<string, Session>();
const SESSION_MS = 20 * 60_000;
export const voiceUrl = () => (store.secret('OXBOT_VOICE_URL') ?? '').replace(/\/$/, '');

// Twilio's documented scheme: HMAC-SHA1, keyed with the auth token, over the full URL plus each POST field name
// and value, sorted by name, then base64.
export function twilioSignature(token: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  return createHmac('sha1', token).update(data, 'utf8').digest('base64');
}
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const say = (text: string) => `<Say>${xml(text)}</Say>`;
const doc = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
const hangUp = (text: string) => doc(`${say(text)}<Hangup/>`);
const listen = (prompt: string, action = '/api/voice/turn') =>
  doc(`<Gather input="speech" action="${action}" method="POST" speechTimeout="auto" actionOnEmptyResult="true">${say(prompt)}</Gather>${say('I didn’t hear anything. Call back any time.')}<Hangup/>`);

// A yes counts only when it is the whole answer: "yes, but make it Friday" is not a yes.
const yes = /^(yes|yeah|yep|yup|sure|do it|send it|go ahead|confirm|approve|approved|okay|ok)( (please|do it|send it|go ahead|thanks|thank you))?$/;
const no = /^(no|nope|dont|cancel|stop|wait|never mind)\b/;
const words = (text: string) => text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const bye = /^(that'?s (all|it)|goodbye|bye|hang up|nothing( else)?)\b/i;

export async function voice(path: string, params: Record<string, string>, signature: string): Promise<{ status: number; twiml: string }> {
  const token = (store.secret('TWILIO_AUTH_TOKEN') ?? '').trim(), base = voiceUrl();
  if (!token || !base || !signature || !equal(signature, twilioSignature(token, base + path, params))) return { status: 403, twiml: hangUp('Not allowed.') };
  const mine = phoneNumber(store.secret('MY_PHONE') ?? '');
  if (!mine || phoneNumber(params.From ?? '') !== mine) return { status: 200, twiml: hangUp('This number takes calls only from its owner.') };
  for (const [sid, s] of sessions) if (Date.now() - s.at > SESSION_MS) sessions.delete(sid);
  const sid = params.CallSid ?? '';
  const route = path.split('?')[0];

  if (route === '/api/voice/incoming') {
    const pin = store.secret('VOICE_PIN') ?? '';
    if (!/^\d{4,8}$/.test(pin)) return { status: 200, twiml: hangUp('Set a voice PIN on the Phone page in OXBOT first.') };
    return { status: 200, twiml: doc(`<Gather input="dtmf" numDigits="${pin.length}" action="/api/voice/pin" method="POST" timeout="10">${say('OXBOT. Enter your PIN.')}</Gather>${say('No PIN. Goodbye.')}<Hangup/>`) };
  }
  if (route === '/api/voice/pin') {
    const pin = store.secret('VOICE_PIN') ?? '';
    if (!pin || !equal(params.Digits ?? '', pin)) return { status: 200, twiml: hangUp('That PIN is wrong. Goodbye.') };
    sessions.set(sid, { at: Date.now(), turns: [], asked: 0 });
    return { status: 200, twiml: listen('Go ahead.') };
  }

  const session = sessions.get(sid);
  if (!session) return { status: 200, twiml: hangUp('Call again and enter your PIN.') };
  session.at = Date.now();
  const said = (params.SpeechResult ?? '').trim();

  if (route === '/api/voice/turn') {
    if (!said) return { status: 200, twiml: listen('I’m listening.') };
    if (bye.test(said)) { sessions.delete(sid); return { status: 200, twiml: hangUp('Okay.') }; }
    session.turns.push({ role: 'user', text: said });
    try {
      const answer = await converse(session.turns.slice(-12), 'phone');
      session.turns.push({ role: 'assistant', text: answer.text });
      const p = answer.proposals.at(-1);
      if (!p) return { status: 200, twiml: listen(answer.text) };
      session.pending = p.id; session.asked = 0;
      return { status: 200, twiml: listen(`Here is exactly what I’ll do. ${spoken(p)} Say yes to do it, or no.`, '/api/voice/confirm') };
    } catch (error) {
      return { status: 200, twiml: listen(`I couldn’t do that: ${(error as Error).message}. Anything else?`) };
    }
  }

  if (route === '/api/voice/confirm') {
    const p = session.pending ? get(session.pending) : undefined;
    if (!p || p.state !== 'pending') { session.pending = undefined; return { status: 200, twiml: listen(p ? `That one is already ${p.state}. Anything else?` : 'Nothing is waiting. What else?') }; }
    if (yes.test(words(said))) {
      session.pending = undefined;
      const done = await approve(p.id, { digest: p.digest, via: 'voice' }).catch((error: Error) => ({ state: 'failed', result: error.message }));
      return { status: 200, twiml: listen(`${done.state === 'done' ? 'Done.' : 'That didn’t go through.'} ${done.result ?? ''} Anything else?`) };
    }
    if (no.test(words(said))) { session.pending = undefined; decline(p.id, 'voice'); return { status: 200, twiml: listen('Okay, I won’t. Anything else?') }; }
    // One more chance to hear a clear yes or no; then it waits on your screen instead.
    if (++session.asked < 2) return { status: 200, twiml: listen('Say yes to do it, or no to cancel.', '/api/voice/confirm') };
    session.pending = undefined;
    return { status: 200, twiml: listen('I’ll leave it waiting on your screen. Anything else?') };
  }
  return { status: 404, twiml: hangUp('Not found.') };
}
