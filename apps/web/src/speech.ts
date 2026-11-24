import { useSyncExternalStore } from 'react';

// Taurus's voice in the app (owner, November 5, 2026: "find a good voice ... not monotonous and roboticy"). The words go to
// Taurus on this Mac, which speaks them with Kokoro and sends back audio; nothing goes anywhere else. The first sentence
// is sent alone so Taurus starts talking in about a second, and the rest follows while it plays. If Taurus's voice isn't on
// (or the Mac can't be reached) the browser's own best voice reads it instead. Tapping Talk, or anything new to say,
// cuts him off, the way you'd interrupt a person.

export interface SpeechPrefs { voice: string; speed: number }
const key = 'taurus-speech';
export function readSpeech(): SpeechPrefs {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<SpeechPrefs>; return { voice: typeof v.voice === 'string' ? v.voice : 'am_michael', speed: typeof v.speed === 'number' ? v.speed : 1 }; }
  catch { return { voice: 'am_michael', speed: 1 }; }
}
export function saveSpeech(v: SpeechPrefs) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: lasts this visit */ } }

// ---------- What's being said, for Taurus's face ----------

export interface Speaking { active: boolean; level: number; text: string; engine: 'taurus' | 'browser' | '' }
let now: Speaking = { active: false, level: 0, text: '', engine: '' };
const listeners = new Set<() => void>();
// For the microphone (hearing.ts): while Taurus talks, and a moment after, what it picks up is mostly his own voice.
let quietAt = 0;
export const speakingNow = () => now.active || Date.now() < quietAt;
const emit = (next: Partial<Speaking>) => { if (now.active && next.active === false) quietAt = Date.now() + 700; now = { ...now, ...next }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useSpeaking = () => useSyncExternalStore(subscribe, () => now, () => now);

// ---------- Audio ----------

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
const playing = new Set<AudioBufferSourceNode>();
let run = 0;
let aborts: AbortController[] = [];
let meter = 0;

function audio() {
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.connect(ctx.destination);
  }
  return ctx;
}
// Browsers only allow sound after a tap: the first tap anywhere wakes the audio up.
export function unlockAudio() { const c = audio(); if (c?.state === 'suspended') void c.resume().catch(() => undefined); }

function watchLevel(id: number) {
  if (!analyser) return;
  const data = new Uint8Array(analyser.fftSize);
  const tick = () => {
    if (id !== run || !analyser) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
    const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
    // Smoothed, so the eyes breathe with the words instead of flickering.
    const smoothed = now.level * 0.6 + level * 0.4;
    if (Math.abs(smoothed - now.level) > 0.02) emit({ level: smoothed });
    meter = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(meter);
  meter = requestAnimationFrame(tick);
}

// Pieces small enough that each is ready before the one before it finishes playing (November 23, 2026: the second
// sentence of a preview took 5 s to make, so the voice paused mid-thought). Kokoro on the Mac makes speech in about
// 0.6 of the time it takes to play, so each piece may be about 1.5 times the one before it: the first is a short
// clause, the rest grow. Cut at sentence ends first, then at commas and dashes, then between words.
const CAPS = [48, 72, 110, 165, 250, 380];
export function chunks(text: string): string[] {
  const clean = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g)?.map(x => x.trim()).filter(Boolean) ?? [];
  // Clauses: a sentence split after commas, semicolons, colons and dashes.
  const clauses = sentences.flatMap(x => x.split(/(?<=[,;:–—])\s+/).filter(Boolean).map((c, i, all) => ({ text: c, end: i === all.length - 1 })));
  const out: string[] = [];
  let cur = '';
  const cap = () => CAPS[Math.min(out.length, CAPS.length - 1)];
  const push = () => { if (cur) { out.push(cur); cur = ''; } };
  for (const c of clauses) {
    let piece = c.text;
    // A clause longer than the cap is cut between words.
    while (piece.length > cap()) {
      if (cur) push();
      const room = cap(), at = piece.lastIndexOf(' ', room);
      const cut = at > room * 0.5 ? at : room;
      out.push(piece.slice(0, cut).trim()); piece = piece.slice(cut).trim();
    }
    if (cur && (cur + ' ' + piece).length > cap()) push();
    cur = cur ? `${cur} ${piece}` : piece;
    // Sentence ends are the most natural place to start the next piece once this one is a fair size.
    if (c.end && cur.length >= cap() * 0.6) push();
  }
  push();
  return out.slice(0, 14);
}

export function stopSpeaking() {
  run++;
  aborts.forEach(a => a.abort()); aborts = [];
  for (const s of playing) { try { s.stop(); } catch { /* already done */ } }
  playing.clear();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  cancelAnimationFrame(meter);
  if (now.active) emit({ active: false, level: 0, text: '', engine: '' });
}

// The browser's own voice, the best one it has: Apple's Premium and Enhanced voices first.
function browserVoice() {
  const rank = (v: SpeechSynthesisVoice) => (/premium/i.test(v.name) ? 0 : /enhanced|natural|neural/i.test(v.name) ? 1 : /^(?:Ava|Zoe|Evan|Nathan|Samantha|Daniel|Google US English|Google UK English Male)/.test(v.name) ? 2 : 3);
  return speechSynthesis.getVoices().filter(v => v.lang.startsWith('en')).sort((a, b) => rank(a) - rank(b))[0];
}
function sayInBrowser(text: string, id: number, speed: number): Promise<void> {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 900));
    const v = browserVoice();
    if (v) u.voice = v;
    u.rate = speed;
    // No audio to measure here, so the eyes get a small pulse per word instead.
    u.onboundary = () => { if (id === run) { emit({ level: 0.7 }); window.setTimeout(() => { if (id === run) emit({ level: 0.15 }); }, 120); } };
    u.onend = u.onerror = () => resolve();
    emit({ active: true, text, engine: 'browser', level: 0.2 });
    speechSynthesis.speak(u);
  });
}

async function fetchChunk(text: string, prefs: SpeechPrefs, signal: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch('/api/speech/say', { method: 'POST', credentials: 'same-origin', signal, headers: { 'Content-Type': 'application/json', 'x-taurus': '1' }, body: JSON.stringify({ text, voice: prefs.voice, speed: prefs.speed }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Voice failed (${r.status})`);
  return r.arrayBuffer();
}

// Says it out loud. Resolves when he's finished, or was cut off.
export async function say(text: string, prefs: SpeechPrefs = readSpeech()): Promise<void> {
  stopSpeaking();
  const id = run;
  const parts = chunks(text);
  if (!parts.length) return;
  const c = audio();
  if (!c) return sayInBrowser(text, id, prefs.speed);
  if (c.state === 'suspended') await c.resume().catch(() => undefined);
  // Every sentence is asked for now; Taurus makes them in order, so the next is ready while one plays.
  const jobs = parts.map(part => { const a = new AbortController(); aborts.push(a); return fetchChunk(part, prefs, a.signal); });
  jobs.forEach(j => j.catch(() => undefined));
  let at = c.currentTime, last: Promise<void> = Promise.resolve();
  try {
    for (let i = 0; i < parts.length; i++) {
      const data = await jobs[i];
      if (id !== run) return;
      const buffer = await c.decodeAudioData(data);
      if (id !== run) return;
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser ?? c.destination);
      playing.add(source);
      const start = Math.max(at, c.currentTime + 0.02);
      source.start(start);
      at = start + buffer.duration;
      last = new Promise(resolve => { source.onended = () => { playing.delete(source); resolve(); }; });
      if (i === 0) { emit({ active: true, text, engine: 'taurus' }); watchLevel(id); }
    }
    await last;
  } catch (error) {
    if (id !== run || (error as Error).name === 'AbortError') return;
    // Taurus's own voice is off or failed before a word: the browser reads it instead.
    if (!playing.size) await sayInBrowser(parts.join(' '), id, prefs.speed);
  } finally {
    if (id === run) { cancelAnimationFrame(meter); emit({ active: false, level: 0, text: '', engine: '' }); aborts = []; }
  }
}
