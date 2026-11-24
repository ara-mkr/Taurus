// Music apps already open, with nothing connected (owner, November 20, 2026: "like spotify without u having to connect
// to it like how vorrsaint sees when spotify is running and can skip"). A stand-in plays macOS; no real app is touched.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-media-'));
process.env.TAURUS_BROKER_URL = '';
process.env.TAURUS_FAST = '1';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[key];
const mac = await import('../src/mac.ts');
const { converse } = await import('../src/agent.ts');
const music = await import('../src/music.ts');

// The pretend Mac: which apps are open, and what each is playing.
interface App { open: boolean; state: 'playing' | 'paused' | 'stopped'; track: number; volume: number; shuffle: boolean }
const tracks = [['Lucid Dreams', 'Juice WRLD', 'Goodbye & Good Riddance'], ['Robbery', 'Juice WRLD', 'Death Race for Love'], ['Wishing Well', 'Juice WRLD', 'Legends Never Die']];
let apps: Record<string, App> = {};
let ran: { program: string; args: string[] }[] = [];
const fake = async (program: string, args: string[]) => {
  ran.push({ program, args });
  if (program === 'open') return '';
  const script = args[1], act = args[2], value = args[3];
  assert.match(script, /if not \(application "(Spotify|Music)" is running\) then return "off"/, 'checks it is open before anything else');
  const name = script.match(/application "(Spotify|Music)"/)![1];
  const a = apps[name];
  if (!a?.open) return 'off';
  if (act === 'pause') a.state = 'paused';
  if (act === 'resume') a.state = 'playing';
  if (act === 'next') a.track = (a.track + 1) % tracks.length;
  if (act === 'previous') a.track = (a.track + tracks.length - 1) % tracks.length;
  if (act === 'volume') a.volume = Number(value);
  if (act === 'shuffle') a.shuffle = value === 'on';
  if (a.state === 'stopped') return 'stopped';
  const [title, artist, album] = tracks[a.track];
  const base = [a.state, title, artist, album, name === 'Spotify' ? '239836' : '239.8', '12,5', String(a.volume), String(a.shuffle)];
  return (name === 'Spotify' ? [...base, 'https://i.scdn.co/image/example', 'spotify:track:tr1'] : base).join('\t');
};
const talk = async (text: string) => (await converse([{ role: 'user', text }], 'talk')).text;

beforeEach(() => {
  ran = [];
  apps = { Spotify: { open: true, state: 'playing', track: 0, volume: 60, shuffle: false }, Music: { open: false, state: 'paused', track: 2, volume: 40, shuffle: false } };
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- the stand-in runner's program type */
  mac.useRunner(fake as any, ['Spotify', 'Music', 'Notes']);
});

test('Spotify open with no sign-in: skip, pause, what’s playing, volume and shuffle, by voice', async () => {
  assert.equal(await talk('Hey Taurus, skip this song'), 'Robbery by Juice WRLD.');
  assert.deepEqual(ran.filter(r => r.args[2] === 'next').map(r => r.args[1].match(/application "(\w+)"/)![1]), ['Spotify']);
  assert.equal(await talk('pause'), 'Paused.');
  assert.equal(apps.Spotify.state, 'paused');
  assert.equal(await talk('what song is this'), 'Paused on Robbery by Juice WRLD, in Spotify.');
  assert.equal(await talk('turn it up'), 'Volume 75.');
  assert.equal(await talk('set the volume to 30'), 'Volume 30.');
  assert.equal(await talk('shuffle'), 'Shuffle on.');
  const now = await music.state();
  assert.equal(now.device, 'Spotify on this Mac');
  assert.equal(now.track?.url, 'https://open.spotify.com/track/tr1');
  assert.equal(now.progressMs, 12_500, 'a comma decimal from macOS still reads');
});

test('the app that is playing wins; Apple Music works the same way', async () => {
  apps.Spotify.state = 'paused';
  apps.Music = { open: true, state: 'playing', track: 2, volume: 40, shuffle: false };
  assert.equal(await talk('what’s playing'), 'This is Wishing Well by Juice WRLD, in Music.');
  assert.equal(await talk('next song'), 'Lucid Dreams by Juice WRLD.');
  assert.equal((await music.state()).track?.durationMs, 239_800, 'Music gives seconds, Spotify milliseconds');
});

test('nothing open: it says how to connect, and never opens an app to control it', async () => {
  apps.Spotify.open = false;
  assert.match(await talk('skip'), /can’t control Spotify yet/);
  assert.equal(ran.filter(r => r.program === 'open').length, 0);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- the stand-in runner's program type */
  mac.useRunner(fake as any, ['Notes']);
  ran = [];
  assert.match(await talk('pause the music'), /can’t control Spotify yet/);
  assert.equal(ran.length, 0, 'an app that isn’t installed is never named to AppleScript');
});

test('"play juice wrld" with no sign-in opens Spotify’s own search in the app', async () => {
  const text = await talk('play juice wrld on spotify');
  assert.match(text, /^Juice Wrld is up in Spotify\. Tap play there\./);
  assert.deepEqual(ran.find(r => r.program === 'open')?.args, ['spotify:search:juice wrld']);
});

test('under the test runner the real Mac is never touched', async () => {
  mac.useRunner();
  assert.equal(await mac.mediaNow(), undefined);
});
