import { join } from 'node:path';
import { note } from './activity.ts';
import { voiceModules } from './speech.ts';
import { HttpError, store } from './store.ts';

// Ox's ears in the desktop app (owner, November 7, 2026: "i said hey ox nothing happened ... the clapping or snapping
// then also when i clcik the big ox circle"). The desktop window's Chromium has no speech service, so the window
// sends short stretches of speech (16 kHz, 16-bit, mono) to this Mac's own server, and Moonshine tiny (MIT, Useful
// Sensors; ONNX build by onnx-community) turns them into words on this Mac's CPU with the same library as Ox's voice.
// Moonshine over Whisper: Whisper pads every clip to 30 s and took 3 to 10 s a phrase here; Moonshine took 0.3 to
// 0.6 s with the Mac at load 33 (measured November 7, 2026). The model (about 110 MB) downloads once from Hugging Face into ~/.oxbot/models; after that nothing leaves the Mac.
// Audio is held in memory for the one request and never stored or logged.

const MODEL = 'onnx-community/moonshine-tiny-ONNX';
export const RATE = 16_000;
export const MAX_SECONDS = 15;

export interface Ears { (audio: Float32Array): Promise<string> }
let override: (() => Promise<Ears>) | undefined;
let ears: Promise<Ears> | undefined;
let queue: Promise<unknown> = Promise.resolve();

// Tests swap in a fake so nothing downloads.
export function useEars(make?: () => Promise<Ears>) { override = make; ears = undefined; }

async function load(): Promise<Ears> {
  if (override) return override();
  const [, { env, pipeline }] = await voiceModules();
  env.cacheDir = join(store.dir, 'models');
  env.allowLocalModels = false;
  const started = Date.now();
  const asr = await pipeline('automatic-speech-recognition', MODEL, { dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, device: 'cpu' });
  note('voice', `Ox can hear in the desktop app (${Math.max(1, Math.round((Date.now() - started) / 1000))} s to load)`, { by: 'ox' });
  return async audio => {
    // transformers.js caps Moonshine at 6 tokens per whole second, which cut "open my notes app" to "open my notes".
    const out = await asr(audio, { max_new_tokens: Math.ceil(audio.length / RATE * 13) + 8 }) as { text?: string } | { text?: string }[];
    return (Array.isArray(out) ? out[0]?.text : out.text) ?? '';
  };
}

// Loads once; the first call waits for the download.
export function prepareEars(): Promise<Ears> {
  ears ??= load().catch(error => { ears = undefined; throw error; });
  return ears;
}

// Speech models fill silence and noise with stock phrases. Those are nothing, not words.
const filler = /^(?:\[[^\]]*\]|\([^)]*\)|thank you\.?|thanks for watching!?|you\.?|bye\.?|\.+|okay\.?)$/i;
export function cleanHeard(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  return filler.test(t) ? '' : t;
}

export function pcm(body: Buffer): Float32Array {
  if (body.length < 2 || body.length % 2) throw new HttpError(400, 'Send 16-bit mono audio at 16 kHz.');
  if (body.length > RATE * 2 * MAX_SECONDS) throw new HttpError(413, `Send at most ${MAX_SECONDS} seconds at a time.`);
  const samples = new Float32Array(body.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = body.readInt16LE(i * 2) / 32768;
  return samples;
}

// One stretch at a time: the CPU is shared with Ox's voice.
export async function hear(body: Buffer): Promise<string> {
  const audio = pcm(body);
  const listen = await prepareEars();
  const job = queue.then(() => listen(audio));
  queue = job.catch(() => undefined);
  return cleanHeard(await job);
}
