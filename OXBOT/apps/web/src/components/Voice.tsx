import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { say, stopSpeaking } from '../speech';
import { useDoubleClap } from '../clap';
import { LocalRecognition, warmEars } from '../hearing';

// Talking to Taurus. Authorized by the owner on October 31, 2026 (docs/decision-log.md): the browser's own speech
// recognition, which sends audio to Google in Chrome and to Apple in Safari. Taurus records and stores nothing;
// transcripts live only in memory, like the Ask turns. In the desktop app (November 7, 2026) the words come from
// Moonshine on this Mac instead (../hearing.ts), because the desktop window's Chromium has no speech service.

interface Alternative { transcript: string }
interface Result { isFinal: boolean; length: number; [i: number]: Alternative }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionClass = new () => Recognition;
const engine = (): RecognitionClass | undefined => { if (inDesktop()) return LocalRecognition; const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }; return w.SpeechRecognition ?? w.webkitSpeechRecognition; };
export const canListen = () => typeof window !== 'undefined' && Boolean(engine());

export interface VoiceSettings { wake: boolean; speak: boolean; clap?: boolean }
const key = 'taurus-voice';
export function readVoice(): VoiceSettings {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<VoiceSettings>; return { wake: v.wake === true, speak: v.speak === true, clap: v.clap === true }; } catch { return { wake: false, speak: false, clap: false }; }
}
export function saveVoice(v: VoiceSettings) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: the setting lasts this visit */ } }

// "Hey Taurus", "Yo Taurus", "Hi Taurus", "Hello Taurus", "Okay Taurus", "Taurus", "Taurus" and the usual mishearings, only at the start of
// a phrase (owner, November 6, 2026: "say like yo taurus, hi taurus, TAURUS, taurus, anything like that not just hey taurus").
// Returns what was said after the wake word, or null when the phrase did not start with one.
// Run-together forms from Moonshine on the Mac (November 7, 2026) too: "Yoox", "I taurus", "Iox", "Yo-Taurus". The name always
// has "taurus" in it (owner, November 19, 2026: "only come when ... i call his name which is anything with taurus in it"), so
// sound-alikes such as "box", "ax" and "Ochs", which noise and other talk turn into, no longer wake him.
// Renamed to Taurus (November 19, 2026). Speech engines also write it as torus, tauris, taurous, tarus, toros or
// torres; those count only at the very start of a phrase, like the name itself.
// Moonshine on the Mac also runs them together ("Heytaurus", "Yotaurus"), so those count too.
const wakeWord = /^(?:(?:hey|hi|hiya|hello|yo|ayo|ay|aye|oi|okay|ok|sup|what'?s up|i)[\s,]+(?:there[\s,]+)?|(?:hey|hi|yo|i)(?=t(?:au|o|a)r))?(?:taurus|torus|tauris|taurous|tarus|toros|torres)(?:'s)?(?:\s*bot)?(?![a-z])[\s,.!?]*/;
const hellos = ['Hey.', 'Yo.', 'Talk to me.', 'What’s up?', 'Here. Go.'];
const words = (t: string) => t.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const sameWords = (a: string, b: string) => { const x = words(a), y = words(b); return Boolean(x) && (x === y || y.includes(x)); };

export function afterWake(phrase: string): string | null {
  const said = phrase.trim().toLowerCase().replace(/[“”"]/g, '').replace(/-/g, ' ').replace(/^[^a-z]+/, '');
  const m = said.match(wakeWord);
  return m ? said.slice(m[0].length).trim() : null;
}

const problems: Record<string, string> = {
  'not-allowed': 'I can’t hear you: the microphone is blocked for this page. Allow it in the browser’s site settings, then tap Talk.',
  'service-not-allowed': 'This browser won’t let me use its speech service here. Try Chrome or Safari.',
  'audio-capture': 'I can’t find a microphone.',
  'no-speech': 'I didn’t hear anything. Tap Talk and try again.',
  network: 'Speech recognition needs the internet and couldn’t reach it.',
};
const unsupported = 'This browser can’t listen. Voice works in Chrome and Safari.';
// The desktop app's Chromium has no speech service key, so there the words come from this Mac (../hearing.ts).
export function inDesktop() { return typeof window !== 'undefined' && Boolean((window as { taurusDesktop?: unknown }).taurusDesktop); }
// Speech recognition needs a secure page: this Mac (localhost) or HTTPS. A phone on plain Wi-Fi http has neither.
const insecure = 'I can’t listen on this connection. Your phone reaches the Mac over plain Wi-Fi, and browsers only allow the microphone on secure pages. Talk to me on the Mac instead.';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'answer' | 'error';
// What Taurus shows in his bubble.
export interface VoiceView { phase: VoicePhase; text: string; woke: boolean; answered: boolean; browser: boolean; dismiss: () => void }

export function useVoice(settings: VoiceSettings, onAsk: (question: string) => Promise<string>) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [text, setText] = useState('');
  const [woke, setWoke] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [browser, setBrowser] = useState(false);
  const [waking, setWaking] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const talking = useRef<Recognition | null>(null);
  const heardRef = useRef('');
  const armed = useRef<{ from: number; timer: number } | null>(null);
  // While the wake word is on, "Talk" arms the recognizer that is already listening instead of starting a second one.
  const wakeArm = useRef<(() => void) | null>(null);
  const phaseRef = useRef(phase);
  const askRef = useRef(onAsk);
  const speakRef = useRef(settings.speak);
  useEffect(() => { phaseRef.current = phase; askRef.current = onAsk; speakRef.current = settings.speak; }, [phase, onAsk, settings.speak]);
  useEffect(() => { const v = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', v); return () => document.removeEventListener('visibilitychange', v); }, []);

  // In the desktop app, with "Hey Taurus" or the double clap on, the window keeps hearing while it is hidden or behind other
  // apps, and Taurus comes to the app in front (November 16, 2026; docs/21-taurus-anywhere.md). Moonshine on this Mac, as before.
  const listensAnywhere = inDesktop() && (settings.wake || settings.clap === true);
  useEffect(() => { (window as { taurusDesktop?: { keepHearing?: (on: boolean) => void } }).taurusDesktop?.keepHearing?.(listensAnywhere); }, [listensAnywhere]);

  const show = useCallback((next: VoicePhase, words: string) => { phaseRef.current = next; setPhase(next); setText(words); }, []);
  // Taurus in the Mac's notch (November 6, 2026) shows him listening while the microphone is open here. Only that it is
  // open or closed goes to the server; the words go only with the question, as before. The server reports thinking
  // and the answer itself.
  const told = useRef<'listening' | 'idle'>('idle');
  useEffect(() => {
    const now = phase === 'listening' ? 'listening' : phase === 'idle' || phase === 'error' ? 'idle' : null;
    if (!now || now === told.current) return;
    told.current = now;
    void fetch('/api/voice/presence', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-taurus': '1' }, body: JSON.stringify({ phase: now }) }).catch(() => undefined);
  }, [phase]);
  const fail = useCallback((message: string) => { show('error', message); setAnswered(false); setBrowser(false); }, [show]);
  // The desktop app's own recognizer reports problems in words already.
  const failHere = useCallback((error: string) => {
    if (inDesktop() && error === 'not-allowed') { fail('I can’t hear you: macOS is blocking the microphone. Allow it for Taurus in System Settings, Privacy & Security, Microphone.'); return; }
    fail(problems[error] ?? (inDesktop() ? error : `Listening stopped: ${error}.`));
  }, [fail]);
  const submit = useCallback(async (question: string) => {
    if (!question.trim()) { fail(problems['no-speech']); return; }
    show('thinking', question.trim());
    try {
      const answer = await askRef.current(question.trim());
      show('answer', answer); setAnswered(true);
      // Taurus's own voice (November 5, 2026): Kokoro on this Mac, or the browser's best voice when it's off.
      if (speakRef.current) void say(answer);
    } catch (e) { fail((e as Error).message); }
  }, [fail, show]);

  const disarm = useCallback(() => { if (armed.current) { window.clearTimeout(armed.current.timer); armed.current = null; } }, []);
  const dismiss = useCallback(() => {
    const rec = talking.current; talking.current = null; rec?.abort();
    disarm();
    stopSpeaking();
    show('idle', ''); setWoke(false);
  }, [disarm, show]);

  // Push-to-talk: one phrase, sent to Ask when it ends.
  const start = useCallback(() => {
    // Talking over Taurus cuts him off.
    stopSpeaking();
    if (wakeArm.current) { wakeArm.current(); return; }
    const Engine = engine();
    if (!window.isSecureContext) { fail(insecure); return; }
    if (!Engine) { fail(unsupported); return; }
    talking.current?.abort();
    const rec = new Engine();
    rec.lang = navigator.language || 'en-US'; rec.continuous = false; rec.interimResults = true;
    let heard = '', failed = false;
    rec.onresult = e => {
      heard = Array.from(e.results).map(r => r[0].transcript).join(' ').trim(); heardRef.current = heard; setText(heard);
      // Send the moment the browser settles on the words, not when it gets round to closing the microphone, which
      // can take a few hundred milliseconds more (November 6, 2026: "open up my notes app ... in like half a second").
      if (e.results[e.results.length - 1]?.isFinal && heard && talking.current === rec && phaseRef.current === 'listening') {
        talking.current = null; rec.stop(); void submit(heard);
      }
    };
    rec.onerror = e => { failed = true; if (e.error !== 'aborted') failHere(e.error); };
    rec.onend = () => { if (talking.current !== rec) return; talking.current = null; if (!failed && phaseRef.current === 'listening') void submit(heard); };
    talking.current = rec; heardRef.current = '';
    show('listening', ''); setWoke(false); setAnswered(false); setBrowser(false);
    try { rec.start(); } catch (e) { talking.current = null; fail((e as Error).message); }
  }, [fail, failHere, show, submit]);
  const stop = useCallback(() => { if (talking.current) talking.current.stop(); else dismiss(); }, [dismiss]);

  // Two claps or snaps start Talk, like tapping it (November 6, 2026). Same rules as the wake word: switched on in
  // Settings and only while this tab or window is showing.
  useDoubleClap(settings.clap === true && visible && Boolean(engine()), useCallback(() => {
    if (phaseRef.current === 'listening' || phaseRef.current === 'thinking') return;
    start();
  }, [start]));

  // Tap to talk (it stops by itself when you pause), or hold it while you speak and let go when you're done.
  const pressed = useRef(0);
  const talkButton = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      if (phaseRef.current === 'listening') { pressed.current = 0; stop(); } else { pressed.current = Date.now(); start(); }
    },
    onPointerUp: () => { if (pressed.current && Date.now() - pressed.current > 450 && heardRef.current && talking.current) stop(); pressed.current = 0; },
    onClick: (e: { detail: number }) => { if (e.detail === 0) { if (phaseRef.current === 'listening') stop(); else start(); } },
  };

  // The wake word: one continuous recognizer while the setting is on and this tab is visible.
  useEffect(() => {
    const Engine = engine();
    if (!settings.wake || !visible || !Engine || !window.isSecureContext) return;
    if (inDesktop()) warmEars();
    let alive = true, rec: Recognition | null = null, restarts = 0, since = Date.now(), seen = 0;
    const arm = (byWord: boolean, from: number) => {
      disarm();
      armed.current = { from, timer: window.setTimeout(() => { armed.current = null; if (phaseRef.current === 'listening') dismiss(); }, 8_000) };
      show('listening', ''); setWoke(byWord); setAnswered(false);
    };
    wakeArm.current = () => arm(false, seen);
    // "Hey Taurus" on its own: a hello back at once, out loud when Taurus's voice is on (November 7, 2026: "I say hey taurus it
    // says hey back within a second"). The lines are ones the server has ready in Taurus's voice.
    let greeted = -1;
    const echo = { text: '', until: 0 };
    const hello = (i: number) => {
      if (greeted === i) return;
      greeted = i;
      const line = hellos[Math.floor(Math.random() * hellos.length)];
      setText(line);
      if (speakRef.current) { echo.text = line; echo.until = Date.now() + 3_000; void say(line); }
    };
    const run = () => {
      if (!alive) return;
      const r = new Engine();
      rec = r;
      r.lang = navigator.language || 'en-US'; r.continuous = true; r.interimResults = true;
      r.onresult = e => {
        if (phaseRef.current === 'thinking') return;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i], said = result[0].transcript;
          if (result.isFinal) seen = i + 1;
          if (!armed.current) {
            const rest = afterWake(said);
            if (rest === null) continue;
            arm(true, i);
            if (rest) setText(rest);
            else if (result.isFinal) hello(i);
            if (result.isFinal && rest) { disarm(); void submit(rest); }
            continue;
          }
          if (i < armed.current.from) continue;
          const asked = i === armed.current.from ? afterWake(said) ?? said.trim() : said.trim();
          if (!asked) { if (result.isFinal && i === armed.current.from) hello(i); continue; }
          // Taurus's own "Hey." coming back through the microphone isn't a question.
          if (Date.now() < echo.until && sameWords(asked, echo.text)) continue;
          setText(asked);
          if (result.isFinal && asked) { disarm(); void submit(asked); }
        }
      };
      r.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') { alive = false; setWaking(false); fail(problems[e.error]); }
      };
      r.onend = () => {
        if (!alive) return;
        // Browsers end long sessions on their own: start again, but give up if it keeps failing.
        if (Date.now() - since > 10_000) { since = Date.now(); restarts = 0; }
        if (++restarts > 6) { alive = false; setWaking(false); fail('Listening for “Hey Taurus” keeps stopping, so I paused it. Reload to try again.'); return; }
        seen = 0;
        window.setTimeout(run, 300);
      };
      try { r.start(); setWaking(true); } catch (e) { alive = false; setWaking(false); fail((e as Error).message); }
    };
    run();
    return () => { alive = false; disarm(); wakeArm.current = null; rec?.abort(); setWaking(false); };
  }, [settings.wake, visible, disarm, dismiss, fail, show, submit]);

  useEffect(() => () => { talking.current?.abort(); stopSpeaking(); }, []);

  const view: VoiceView = { phase, text, woke, answered, browser, dismiss };
  return { view, waking, talkButton };
}
export type Voice = ReturnType<typeof useVoice>;

// The small glass bar of quick functions. "Talk" first, with room for more later.
// In the header it is a group; floating above the phone tab bar it is its own landmark.
export function FunctionBar({ voice, floating = false }: { voice: Voice; floating?: boolean }) {
  const on = voice.view.phase === 'listening';
  const items = <>
    <button type="button" className={`fn-talk ${on ? 'on' : ''}`} aria-pressed={on} {...voice.talkButton}>Talk</button>
    {voice.waking && <span className="fn-note">Listening for “Hey Taurus”</span>}
  </>;
  return floating ? <aside className="fnbar fnbar-float" aria-label="Quick functions">{items}</aside> : <div className="fnbar" role="group" aria-label="Quick functions">{items}</div>;
}
