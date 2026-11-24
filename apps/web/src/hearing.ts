// Speech recognition for the desktop app (owner, November 7, 2026: "i said hey taurus nothing happened"). The desktop
// window's Chromium has no speech service, so this stands in for it with the same shape as the browser's own
// SpeechRecognition: it listens to the microphone, cuts out each stretch of speech by loudness, and sends it to this
// Mac's Taurus server (/api/voice/hear), which turns it into words with Moonshine on the Mac's CPU. Audio goes only to
// localhost, is kept in memory for one stretch, and is never stored.

import { speakingNow } from './speech';

interface Alternative { transcript: string }
interface Result { isFinal: boolean; length: number; [i: number]: Alternative }

const RATE = 16_000;
const FRAME = 1024;                     // 64 ms at 16 kHz
const FRAME_MS = (FRAME / RATE) * 1000;
const PRE_ROLL = 4;                     // keep 256 ms before the voice starts, so first sounds aren't clipped
const END_SILENCE_MS = 480;             // a pause this long ends the phrase
const MIN_VOICED = 3;                   // ignore clicks and taps shorter than about 200 ms
const MAX_SECONDS = 14;
const NO_SPEECH_MS = 8_000;             // like the browser: one phrase, and nothing heard for 8 s, gives up

let warmed = false;
// Starts the one-time model download before the first word, so the first answer isn't slow.
export function warmEars() {
  if (warmed) return;
  warmed = true;
  void fetch('/api/voice/hear?warm', { method: 'POST', credentials: 'same-origin', headers: { 'x-taurus': '1' } }).catch(() => { warmed = false; });
}

export function toPcm16(frames: Float32Array[]): ArrayBuffer {
  const length = frames.reduce((n, f) => n + f.length, 0);
  const out = new DataView(new ArrayBuffer(length * 2));
  let at = 0;
  for (const f of frames) for (let i = 0; i < f.length; i++, at += 2) out.setInt16(at, Math.max(-1, Math.min(1, f[i])) * 0x7fff, true);
  return out.buffer;
}

// Loudness-based phrase cutting. Kept apart from the microphone so tests can feed it frames.
export function phraseCutter(onPhrase: (frames: Float32Array[]) => void, onVoice?: () => void) {
  let floor = 0.004, voiced = 0, quiet = 0, speaking = false;
  let pre: Float32Array[] = [], phrase: Float32Array[] = [];
  const flush = () => {
    const got = phrase; phrase = []; speaking = false; quiet = 0;
    if (voiced >= MIN_VOICED) onPhrase(got);
    voiced = 0;
  };
  return {
    get speaking() { return speaking; },
    feed(frame: Float32Array) {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      const rms = Math.sqrt(sum / frame.length);
      if (!speaking) {
        if (rms > Math.max(0.012, floor * 3)) { speaking = true; phrase = [...pre, frame]; pre = []; voiced = 1; quiet = 0; onVoice?.(); return; }
        floor = Math.max(0.002, floor * 0.95 + rms * 0.05);
        pre.push(frame); if (pre.length > PRE_ROLL) pre.shift();
        return;
      }
      phrase.push(frame);
      if (rms > Math.max(0.008, floor * 2)) { voiced++; quiet = 0; } else quiet += FRAME_MS;
      if (quiet >= END_SILENCE_MS || phrase.length * FRAME >= MAX_SECONDS * RATE) flush();
    },
    // Stop: whatever was being said still counts.
    flush() { if (speaking) flush(); },
  };
}

const micError = (e: unknown) => {
  const name = (e as { name?: string }).name;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : 'audio-capture';
};

export class LocalRecognition {
  lang = 'en-US';
  continuous = false;
  interimResults = false;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  private results: Result[] = [];
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private cutter = phraseCutter(frames => this.send(frames), () => { if (this.silence) { clearTimeout(this.silence); this.silence = 0; } });
  private sending: Promise<void> = Promise.resolve();
  private silence = 0;
  private ended = false;
  private stopping = false;

  start() {
    warmEars();
    if (!this.continuous) this.silence = window.setTimeout(() => { this.onerror?.({ error: 'no-speech' }); this.end(); }, NO_SPEECH_MS);
    void (async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (e) { this.onerror?.({ error: micError(e) }); this.end(); return; }
      if (this.ended) { this.release(); return; }
      const context = new AudioContext({ sampleRate: RATE });
      this.context = context;
      const source = context.createMediaStreamSource(this.stream);
      // ScriptProcessor rather than an AudioWorklet: the page's CSP allows no inline or blob modules, and 64 ms
      // frames are plenty for cutting phrases.
      const tap = context.createScriptProcessor(FRAME, 1, 1);
      const mute = context.createGain(); mute.gain.value = 0;
      tap.onaudioprocess = e => { if (!this.stopping) this.cutter.feed(new Float32Array(e.inputBuffer.getChannelData(0))); };
      source.connect(tap); tap.connect(mute); mute.connect(context.destination);
      if (context.state === 'suspended') await context.resume().catch(() => undefined);
    })();
  }

  // Ends listening; a phrase already started is still sent and answered.
  stop() {
    if (this.ended || this.stopping) return;
    this.stopping = true;
    this.cutter.flush();
    void this.sending.then(() => this.end());
  }

  abort() { this.stopping = true; this.end(); }

  // Phrases waiting for the Mac to turn into words; in continuous listening, more than two waiting are dropped.
  private waiting = 0;

  private send(frames: Float32Array[]) {
    // Always-on listening (November 23, 2026: "it will randomly just stop listening"): Taurus's own voice coming back
    // through the microphone isn't sent, and a backlog of noise is dropped instead of queueing up behind itself.
    if (this.continuous && (speakingNow() || this.waiting >= 2)) return;
    const body = toPcm16(frames);
    this.waiting++;
    this.sending = this.sending.then(async () => {
      if (this.ended) return;
      try {
        const res = await fetch('/api/voice/hear', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'x-taurus': '1' }, body });
        const data = await res.json().catch(() => ({})) as { text?: string; error?: string };
        if (this.ended) return;
        // One phrase the Mac couldn't handle (busy, or still loading the model) is skipped; it no longer ends
        // always-on listening, which used to give up for good after a few of those in a row.
        if (!res.ok) { if (this.continuous) return; this.onerror?.({ error: data.error ?? 'I couldn’t make out the words.' }); this.end(); return; }
        const text = (data.text ?? '').trim();
        if (!text) return;
        this.results.push(Object.assign([{ transcript: text }], { isFinal: true }) as unknown as Result);
        this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
        if (!this.continuous) this.end();
      } catch {
        if (!this.ended && !this.continuous) { this.onerror?.({ error: 'I lost touch with Taurus on this Mac.' }); this.end(); }
      } finally { this.waiting--; }
    });
  }

  private release() {
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    void this.context?.close().catch(() => undefined); this.context = null;
  }

  private end() {
    if (this.ended) return;
    this.ended = true;
    if (this.silence) clearTimeout(this.silence);
    this.release();
    // Like the browser's: onend comes after the current event, never inside start() or stop().
    setTimeout(() => this.onend?.(), 0);
  }
}
