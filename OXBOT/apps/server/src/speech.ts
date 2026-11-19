import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { note } from './activity.ts';
import { allGreetings } from './greetings.ts';
import { HttpError, store } from './store.ts';
import type { SpeechState, SpeechVoice } from './types.ts';

// Ox's voice (owner, November 5, 2026: "find an opensource text to speech for when it talks to u ... no money ... not
// monotonous and roboticy"). Kokoro-82M (Apache-2.0, hexgrad/Kokoro-82M, ONNX build by onnx-community), run by
// kokoro-js on this Mac's CPU. The model (about 90 MB) downloads once from Hugging Face into ~/.oxbot/models the
// first time you turn it on; after that every word is made on this Mac, offline, and nothing is sent anywhere.
// The same engine Ultron used in the browser, moved to the server so the Mac, the desktop app and the phone all
// hear the same voice without each one downloading the model.

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const MAX_TEXT = 700;

// The voices worth hearing, best first. Grades are Kokoro's own (VOICES.md on the model card).
export const VOICES: SpeechVoice[] = [
  { id: 'am_michael', name: 'Michael', accent: 'American', gender: 'Male', note: 'Calm, low and steady.' },
  { id: 'af_heart', name: 'Heart', accent: 'American', gender: 'Female', note: 'Warm and natural. Kokoro’s best.' },
  { id: 'bm_george', name: 'George', accent: 'British', gender: 'Male', note: 'Butler energy.' },
  { id: 'af_bella', name: 'Bella', accent: 'American', gender: 'Female', note: 'Bright and expressive.' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'American', gender: 'Male', note: 'Deep, a little dramatic.' },
  { id: 'bf_emma', name: 'Emma', accent: 'British', gender: 'Female', note: 'Clear and composed.' },
  { id: 'am_puck', name: 'Puck', accent: 'American', gender: 'Male', note: 'Upbeat and quick.' },
  { id: 'af_nicole', name: 'Nicole', accent: 'American', gender: 'Female', note: 'Soft and close.' },
  { id: 'bm_fable', name: 'Fable', accent: 'British', gender: 'Male', note: 'A storyteller.' },
  { id: 'af_aoede', name: 'Aoede', accent: 'American', gender: 'Female', note: 'Relaxed, conversational.' },
];
export const DEFAULT_VOICE = 'am_michael';

// Tests swap in a fake engine so nothing downloads.
export interface Engine { generate(text: string, options: { voice: string; speed: number }): Promise<{ toWav(): ArrayBuffer }> }
let override: (() => Promise<Engine>) | undefined;
let model: Promise<Engine> | undefined;
const state: SpeechState = { status: 'off', progress: 0 };
const files = new Map<string, { loaded: number; total: number }>();
const cache = new Map<string, Buffer>();
// Short lines are kept on disk as well (November 18, 2026: the owner's Mac choked at every launch while Ox re-made
// the same greetings on the CPU), so each one is made once ever instead of once per start, without the model loaded.
const diskDir = () => join(store.dir, 'speech-cache');
const diskFile = (key: string) => join(diskDir(), `${createHash('sha1').update(key).digest('hex')}.wav`);
function fromDisk(key: string) { try { return readFileSync(diskFile(key)); } catch { return undefined; } }
function toDisk(key: string, wav: Buffer) {
  try { mkdirSync(diskDir(), { recursive: true }); writeFileSync(diskFile(key), wav); } catch { /* a full disk only costs speed */ }
}
const greetingKey = (text: string) => `${DEFAULT_VOICE}|1|${speakable(text).slice(0, MAX_TEXT)}`;
const greetingsMissing = () => allGreetings.filter(text => !existsSync(diskFile(greetingKey(text))));
// Downloaded once already: the model loads the first time Ox has something new to say, not at every start.
const downloaded = () => existsSync(join(store.dir, 'models', MODEL));
let queue: Promise<unknown> = Promise.resolve();

export function useEngine(make?: () => Promise<Engine>) {
  override = make; model = undefined; cache.clear();
  Object.assign(state, { status: 'off', progress: 0, error: undefined });
}

// The desktop app bundles the server but leaves Kokoro outside (native files). Run from source, it has no
// node_modules of its own with Kokoro in it, so main.ts points OXBOT_VOICE_MODULES at apps/server, which does.
type VoiceModules = [typeof import('kokoro-js'), typeof import('@huggingface/transformers')];
export async function voiceModules(): Promise<VoiceModules> {
  try {
    return await Promise.all([import('kokoro-js'), import('@huggingface/transformers')]);
  } catch (error) {
    const dir = process.env.OXBOT_VOICE_MODULES;
    if (!dir || (error as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw error;
    // Their CommonJS builds, required: import() of them loses the named exports. Kokoro's own copy of transformers,
    // so the cache folder set by the caller is the one Kokoro reads.
    const fromServer = createRequire(join(dir, 'package.json'));
    const kokoro = fromServer.resolve('kokoro-js');
    const fromKokoro = createRequire(kokoro);
    return [fromServer(kokoro), fromKokoro(fromKokoro.resolve('@huggingface/transformers'))] as VoiceModules;
  }
}

async function load(): Promise<Engine> {
  if (override) return override();
  const [{ KokoroTTS }, { env }] = await voiceModules();
  env.cacheDir = join(store.dir, 'models');
  env.allowLocalModels = false;
  return KokoroTTS.from_pretrained(MODEL, {
    dtype: 'q8', device: 'cpu',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      const all = [...files.values()], total = all.reduce((s, f) => s + f.total, 0);
      state.progress = total ? Math.min(0.99, all.reduce((s, f) => s + f.loaded, 0) / total) : 0;
    },
  }) as unknown as Engine;
}

// Starts the one-time download, or returns the model that's already loaded.
export function prepare(): Promise<Engine> {
  if (model) return model;
  Object.assign(state, { status: 'loading', progress: 0, error: undefined });
  const started = Date.now();
  model = load().then(engine => {
    Object.assign(state, { status: 'ready', progress: 1 });
    note('voice', `Ox’s voice is ready (${Math.max(1, Math.round((Date.now() - started) / 1000))} s)`, { by: 'ox' });
    if (!override) void warmGreetings();
    return engine;
  }, error => {
    model = undefined;
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    Object.assign(state, { status: 'error', error: /fetch|network|ENOTFOUND|EAI_AGAIN|ECONN/i.test(message) ? 'Couldn’t download the voice. Check the internet and try again; it’s only needed once.' : message });
    throw error;
  });
  return model;
}

export function speechState(): SpeechState {
  const on = store.doc<{ on?: boolean }>('speech.json', {}).on === true;
  // On and downloaded but not loaded yet counts as ready: the first new sentence loads it.
  return { ...state, status: on && state.status === 'off' && !override && downloaded() ? 'ready' : state.status, on, voices: VOICES };
}

// Words, not markdown: no links, ids, bullets or symbols read out loud.
export function speakable(text: string) {
  return text
    .replace(/<tool>[\s\S]*?<\/tool>/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, '')
    .replace(/[*_`#>|~]/g, '')
    .replace(/\s*\n+\s*/g, '. ').replace(/([.!?])\s*\./g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Short phrases repeat ("Okay.", "Opening Spotify."): the last few come back instantly.
export async function speak(input: { text?: unknown; voice?: unknown; speed?: unknown }): Promise<Buffer> {
  const text = speakable(String(input.text ?? '')).slice(0, MAX_TEXT);
  if (!text) throw new HttpError(400, 'Nothing to say.');
  const voice = VOICES.some(v => v.id === input.voice) ? String(input.voice) : DEFAULT_VOICE;
  const speed = Math.max(0.7, Math.min(1.4, Number(input.speed) || 1));
  const key = `${voice}|${speed}|${text}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const saved = text.length <= 160 ? fromDisk(key) : undefined;
  if (saved) { cache.set(key, saved); while (cache.size > 90) cache.delete(cache.keys().next().value!); return saved; }
  if (state.status !== 'ready' && state.status !== 'loading' && !speechState().on) throw new HttpError(409, 'Ox’s voice isn’t on yet. Turn it on in Settings, Look, Voice.');
  const engine = await prepare();
  // One sentence at a time: the CPU is shared, and the next sentence waits right behind this one.
  const job = queue.then(async () => Buffer.from((await engine.generate(text, { voice, speed })).toWav()));
  queue = job.catch(() => undefined);
  const wav = await job;
  if (text.length <= 160) { cache.set(key, wav); toDisk(key, wav); while (cache.size > 90) cache.delete(cache.keys().next().value!); }
  return wav;
}

// "Hey." and the other hellos, made ahead so the first "Hey Ox" is answered out loud at once (November 7, 2026).
// One line at a time, so anything Ox is asked to say meanwhile waits for at most one short line.
// It waits until startup has settled and rests between lines, so it never holds up a real answer.
async function warmGreetings() {
  const rest = (ms: number) => new Promise(r => setTimeout(r, ms));
  await rest(20_000);
  for (const text of greetingsMissing()) {
    try { await speak({ text }); } catch { return; }
    await rest(400);
  }
}

// Turned on once in Settings: the choice is remembered, and the model loads again when the server starts.
export function startSpeech() {
  if (speechState().on && (!downloaded() || greetingsMissing().length)) void prepare().catch(() => undefined);
}
export function setSpeech(on: boolean) {
  store.saveDoc('speech.json', { on });
  if (on) void prepare().catch(() => undefined);
  return speechState();
}
