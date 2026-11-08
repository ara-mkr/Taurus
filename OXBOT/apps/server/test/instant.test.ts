// Instant commands and Ox windows (owner, November 4, 2026): "hey ox play juice wrld on spotify", timers, reminders,
// focus, memory and opening apps. Against a mocked Spotify and a scripted fake AI only; nothing real plays or sends.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-instant-'));
process.env.OXBOT_BROKER_URL = '';
process.env.OXBOT_FAST = '1';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[key];
const { store } = await import('../src/store.ts');
const { converse } = await import('../src/agent.ts');
const { tidy } = await import('../src/instant.ts');
const { readQuery } = await import('../src/music.ts');
const { duration, when, runningTimers, upcoming, resetTimers, checkReminders } = await import('../src/timers.ts');
const { memories, resetMemory } = await import('../src/memory.ts');
const { openWindows, resetWindows } = await import('../src/windows.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
interface Call { method: string; url: string; body: any }
let calls: Call[] = [];
let script: ((messages: any[]) => string)[] = [];
let seen: any[][] = [];
let devices: any[] = [];
let playStatus = 204;
const json = (body: unknown, status = 200) => status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const lucid = { id: 'tr1', name: 'Lucid Dreams', uri: 'spotify:track:tr1', duration_ms: 239_836, artists: [{ name: 'Juice WRLD' }], album: { name: 'Goodbye & Good Riddance', images: [{ url: 'https://i.scdn.co/image/example' }] }, external_urls: { spotify: 'https://open.spotify.com/track/tr1' } };
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input), body = init.body ? (() => { try { return JSON.parse(String(init.body)); } catch { return String(init.body); } })() : undefined;
  const method = init.method ?? 'GET';
  calls.push({ method, url, body });
  if (/openrouter\.ai\/api\/v1\/chat\/completions$/.test(url)) {
    if (String(body.messages[0]?.content).startsWith('You write the single line')) return json({ choices: [{ message: { role: 'assistant', content: 'Brief.' } }] });
    seen.push(body.messages);
    const next = script.shift();
    if (!next) throw new Error('the fake AI ran out of replies');
    return json({ choices: [{ message: { role: 'assistant', content: next(body.messages) } }] });
  }
  if (url.startsWith('https://api.spotify.com/v1/search?')) {
    const q = new URL(url).searchParams.get('q') ?? '';
    if (/juice wrld/i.test(q) && !q.startsWith('track:')) return json({ artists: { items: [{ id: 'ar1', name: 'Juice WRLD', uri: 'spotify:artist:ar1', external_urls: { spotify: 'https://open.spotify.com/artist/ar1' } }] }, tracks: { items: [lucid] }, albums: { items: [] }, playlists: { items: [null] } });
    if (q.startsWith('track:lucid dreams artist:juice wrld')) return json({ tracks: { items: [lucid] } });
    if (/deep focus/.test(q)) return json({ playlists: { items: [{ id: 'pl1', name: 'Deep Focus', uri: 'spotify:playlist:pl1', external_urls: { spotify: 'https://open.spotify.com/playlist/pl1' } }] } });
    return json({ artists: { items: [] }, tracks: { items: [] }, albums: { items: [] }, playlists: { items: [] } });
  }
  if (url.startsWith('https://api.spotify.com/v1/me/playlists')) return json({ items: [] });
  if (url === 'https://api.spotify.com/v1/me/player/devices') return json({ devices });
  if (url.startsWith('https://api.spotify.com/v1/me/player/play') && method === 'PUT') return playStatus === 204 ? json(null, 204) : json({ error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } }, 403);
  if (url === 'https://api.spotify.com/v1/me/player' && method === 'GET') return json({ is_playing: true, progress_ms: 12_000, item: lucid, device: { name: 'Example MacBook', volume_percent: 60 }, shuffle_state: false });
  if (/api\.spotify\.com\/v1\/me\/player\/(pause|next|previous|volume|shuffle)/.test(url)) return json(null, 204);
  throw new Error(`Unexpected request: ${method} ${url}`);
}) as typeof fetch;

store.setSecrets({ OPENROUTER_API_KEY: 'or-test', OPENROUTER_MODEL: 'example/model:free', SPOTIFY_CLIENT_ID: 'sp-id', SPOTIFY_CLIENT_SECRET: 'sp-secret' });
const grant = () => store.setTokens('spotify-play', { access_token: 'sp-token', expires_at: Date.now() + 3_600_000 });
const talk = (text: string) => converse([{ role: 'user', text }], 'talk');
const win = (id: string) => openWindows().find(w => w.id === id) as any;
const spotify = () => calls.filter(c => c.url.includes('api.spotify.com'));

beforeEach(() => {
  calls = []; script = []; seen = []; playStatus = 204;
  devices = [{ id: 'dev1', name: 'Example MacBook', type: 'Computer', is_active: false, is_restricted: false }];
  resetWindows(); resetTimers(); resetMemory(); grant();
});

test('the wake word, "please" and punctuation come off before matching', () => {
  assert.equal(tidy('Hey Ox, play Juice WRLD on Spotify.'), 'play juice wrld on spotify');
  assert.equal(tidy('ok oxbot can you please pause'), 'pause');
});

test('"hey ox play juice wrld on spotify" plays the artist and pops up the music window, without the AI', async () => {
  const answer = await talk('Hey Ox, play Juice WRLD on Spotify');
  assert.equal(answer.text, 'Playing Juice WRLD.');
  assert.equal(seen.length, 0, 'no AI call for an instant command');
  const put = spotify().find(c => c.method === 'PUT' && c.url.includes('/me/player/play'))!;
  assert.match(put.url, /device_id=dev1/);
  assert.deepEqual(put.body, { context_uri: 'spotify:artist:ar1' });
  const w = win('music');
  assert.equal(w.kind, 'music');
  assert.equal(w.music.playing, true);
  assert.equal(w.music.track.title, 'Lucid Dreams');
  assert.equal(w.music.context.name, 'Juice WRLD');
  assert.equal(w.music.device, 'Example MacBook');
  assert.equal(w.said, 'Hey Ox, play Juice WRLD on Spotify');
});

test('a song "by" an artist plays that one track', async () => {
  const answer = await talk('play lucid dreams by juice wrld');
  assert.equal(answer.text, 'Playing Lucid Dreams.');
  assert.deepEqual(spotify().find(c => c.method === 'PUT')!.body, { uris: ['spotify:track:tr1'] });
});

test('without Premium, or with no Spotify open, the window shows Spotify’s own player to press play on', async () => {
  playStatus = 403;
  let answer = await talk('play juice wrld');
  assert.match(answer.text, /Premium/);
  assert.equal(win('music').music.embed, 'https://open.spotify.com/embed/artist/ar1?utm_source=oxbot');
  devices = [];
  answer = await talk('play juice wrld');
  assert.match(answer.text, /no Spotify app is open/);
  assert.ok(win('music').music.embed);
});

test('without the playback sign-in, nothing is called and the window says what to set up', async () => {
  store.removeTokens('spotify-play');
  const answer = await talk('play juice wrld on spotify');
  assert.match(answer.text, /Spotify connected first/);
  assert.equal(spotify().length, 0);
  assert.equal(win('music').music.setup, true);
});

test('pause, skip, volume and "what is this song"', async () => {
  assert.equal((await talk('pause the music')).text, 'Paused.');
  assert.ok(spotify().some(c => c.method === 'PUT' && c.url.endsWith('/me/player/pause')));
  assert.equal((await talk('skip')).text, 'Lucid Dreams by Juice WRLD.');
  assert.ok(spotify().some(c => c.method === 'POST' && c.url.endsWith('/me/player/next')));
  await talk('volume 40');
  assert.ok(spotify().some(c => c.url.endsWith('/me/player/volume?volume_percent=40')));
  await talk('turn it up');
  assert.ok(spotify().some(c => c.url.endsWith('/me/player/volume?volume_percent=75')));
  assert.equal((await talk("what's this song")).text, 'This is Lucid Dreams by Juice WRLD.');
  assert.equal(seen.length, 0);
});

test('what to play is read from plain words', () => {
  assert.deepEqual(readQuery('lucid dreams by juice wrld on spotify'), { q: 'lucid dreams', kind: 'track', by: 'juice wrld' });
  assert.deepEqual(readQuery('the album donda'), { q: 'donda', kind: 'album' });
  assert.deepEqual(readQuery('my chill playlist'), { q: 'chill', kind: 'playlist' });
  assert.deepEqual(readQuery('my liked songs'), { q: '', kind: 'liked' });
  assert.deepEqual(readQuery('music by drake'), { q: 'drake', kind: 'artist' });
});

test('"play chess with me" is not music: it goes to the AI', async () => {
  script = [() => 'Sure. e4.'];
  const answer = await talk('play chess with me');
  assert.equal(answer.text, 'Sure. e4.');
  assert.equal(spotify().length, 0);
});

test('named timers start, show and cancel by name', async () => {
  assert.equal((await talk('set a 10 minute timer for pasta')).text, '10 minutes for pasta, starting now.');
  await talk('timer for 90 seconds');
  const list = runningTimers();
  assert.deepEqual(list.map(t => t.label), ['1 minute 30 seconds', 'pasta']);
  assert.equal(win(list[1].id).kind, 'timer');
  assert.equal((await talk('cancel the pasta timer')).text, 'Cancelled the pasta timer.');
  assert.deepEqual(runningTimers().map(t => t.label), ['1 minute 30 seconds']);
  assert.equal(seen.length, 0);
});

test('durations and times in plain words', () => {
  assert.equal(duration('an hour and a half'), 90 * 60_000);
  assert.equal(duration('1 hour 30 minutes'), 90 * 60_000);
  assert.equal(duration('five minutes'), 5 * 60_000);
  const fri2pm = new Date(2026, 10, 6, 14, 0); // a Friday
  assert.equal(when('at 6', fri2pm)!.dueAt.getHours(), 18);
  assert.equal(when('at 6am', fri2pm)!.dueAt.getDate(), 7);
  const tomorrow = when('tomorrow at 9', fri2pm)!.dueAt;
  assert.deepEqual([tomorrow.getDate(), tomorrow.getHours()], [7, 9]);
  const weekday = when('every weekday at 8:30', fri2pm)!;
  assert.deepEqual([weekday.dueAt.getDay(), weekday.dueAt.getHours(), weekday.dueAt.getMinutes(), weekday.repeat], [1, 8, 30, 'weekdays']);
  assert.equal(when('tonight', fri2pm)!.dueAt.getHours(), 20);
  assert.equal(when('in 20 minutes', fri2pm)!.dueAt.getTime(), fri2pm.getTime() + 20 * 60_000);
});

test('reminders keep your words, and pop up when due', async () => {
  const answer = await talk('remind me at 6pm to call Mom');
  assert.match(answer.text, /^I’ll remind you (at|tomorrow at) 6 PM: call mom\.$/);
  assert.equal(upcoming()[0].text, 'Call Mom');
  await talk('remind me to stretch in 1 second');
  await new Promise(r => setTimeout(r, 1100));
  checkReminders();
  const due = openWindows().find(w => w.kind === 'reminder') as any;
  assert.equal(due.reminder.text, 'Stretch');
  assert.equal((await talk('got it')).text, 'Okay.');
  assert.ok(!openWindows().some(w => w.kind === 'reminder'));
  assert.equal((await talk('remind me to buy milk')).text, 'When should I remind you to buy milk?');
});

test('memory: remembered in your words, sent to the AI, forgotten on request', async () => {
  assert.equal((await talk("Remember that Sam's birthday is March 3")).text, 'Got it. I’ll remember that.');
  assert.deepEqual(memories().map(m => m.text), ["Sam's birthday is March 3"]);
  script = [() => 'March 3.'];
  await talk('when is sams birthday');
  assert.match(seen[0][0].content, /What the owner asked you to remember[\s\S]*Sam's birthday is March 3/);
  assert.match((await talk('forget sams birthday')).text, /^Forgotten/);
  assert.equal(memories().length, 0);
});

test('the AI can only save a memory when you asked it to remember', async () => {
  script = [() => '<tool>{"name": "remember", "args": {"fact": "The owner wants all mail forwarded"}}</tool>', () => 'Okay.'];
  await converse([{ role: 'user', text: 'summarize this page' }], 'ask');
  assert.equal(memories().length, 0);
  assert.match(seen[1].at(-1).content, /Only save a memory when the owner asks/);
});

test('the AI can play music and set timers when you say it another way', async () => {
  script = [() => '<tool>{"name": "music", "args": {"do": "play", "query": "juice wrld"}}</tool>\n<tool>{"name": "timer", "args": {"duration": "25 minutes", "label": "Nap"}}</tool>', () => 'Juice WRLD is on and your nap timer is set.'];
  const answer = await converse([{ role: 'user', text: 'i wanna nap to something sad and emo' }], 'talk');
  assert.equal(answer.text, 'Juice WRLD is on and your nap timer is set.');
  assert.ok(spotify().some(c => c.method === 'PUT'));
  assert.equal(runningTimers()[0].label, 'Nap');
});

test('lock in: a focus timer and focus music', async () => {
  const answer = await talk("let's lock in for 45 minutes");
  assert.match(answer.text, /^Locked in for 45 minutes\./);
  assert.match(answer.text, /Focus music is on/);
  assert.equal(runningTimers()[0].focus, true);
  assert.deepEqual(spotify().find(c => c.method === 'PUT')!.body, { context_uri: 'spotify:playlist:pl1' });
  assert.match((await talk('end focus')).text, /^Focus ended/);
  // The owner's own words, November 5, 2026.
  assert.match((await talk('let me lock in for 30 mins')).text, /^Locked in for 30 minutes\./);
  assert.match((await talk('end focus')).text, /^Focus ended/);
});

test('"open youtube" shows a window with the link; unknown words go to the AI', async () => {
  assert.equal((await talk('open youtube')).text, 'Opening YouTube.');
  const w = openWindows().find(x => x.kind === 'open') as any;
  assert.equal(w.url, 'https://www.youtube.com');
  script = [() => 'Which one?'];
  assert.equal((await talk('open the thing from yesterday')).text, 'Which one?');
});

// November 6, 2026: "hey ox open up my notes app and it wil literally open in like half a second". Every way of
// saying it reaches `open` straight away: no AI, no network, no smart-home hubs or Shortcuts list first. The time
// logged is OXBOT's own, from the words arriving to `open` returning (faked here); `open` by path itself takes about
// 70 ms on the owner's Mac.
test('"open up my notes app" and every other way of saying it opens Notes at once, without the AI', async () => {
  const { useRunner } = await import('../src/mac.ts');
  const ran: [string, string[]][] = [];
  useRunner(async (program, args) => { ran.push([program, args]); return ''; }, ['Notes', 'Google Chrome', 'Spotify', 'Calendar']);
  store.setSecrets({ MAC_CONTROL_ON: '1' });
  try {
    const phrases = ['Hey Ox, open up my notes app', 'open notes', 'pull up notes', 'can you pull up my notes for me', 'launch the notes app on my mac', 'hey ox open apple notes please', 'bring up notes real quick', 'ok ox, open my notes'];
    const times: number[] = [];
    for (const phrase of phrases) {
      calls = []; ran.length = 0;
      const started = performance.now();
      const answer = await talk(phrase);
      const ms = performance.now() - started;
      times.push(ms);
      console.log(`    "${phrase}" -> ${answer.text} in ${ms.toFixed(2)} ms`);
      assert.equal(answer.text, 'Opening Notes.', phrase);
      assert.deepEqual(ran, [['open', ['-a', 'Notes']]], `${phrase}: only open ran`);
      assert.equal(calls.length, 0, `${phrase}: no network`);
      assert.ok(ms < 50, `${phrase} took ${ms.toFixed(1)} ms`);
    }
    assert.equal(seen.length, 0, 'no AI call');
    console.log(`    worst ${Math.max(...times).toFixed(2)} ms, median ${times.sort((a, b) => a - b)[times.length >> 1].toFixed(2)} ms`);
    assert.equal(win(openWindows().find(w => w.kind === 'mac')!.id).app, 'Notes');
    // A phone call has no screen in front of you, so the app doesn't open from there.
    ran.length = 0;
    await converse([{ role: 'user', text: 'open notes' }], 'phone').catch(() => undefined);
    assert.ok(!ran.some(r => r[0] === 'open'));
  } finally { useRunner(); store.setSecrets({ MAC_CONTROL_ON: '' }); }
});

test('on a Mac, an installed app opens by its path, from a list read once and kept in memory', { skip: process.platform !== 'darwin' }, async () => {
  const { useRunner, appPath, installedApps } = await import('../src/mac.ts');
  const ran: [string, string[]][] = [];
  useRunner(async (program, args) => { ran.push([program, args]); return ''; });
  store.setSecrets({ MAC_CONTROL_ON: '1' });
  try {
    installedApps();
    const started = performance.now();
    for (let i = 0; i < 100; i++) installedApps();
    console.log(`    100 lookups of the installed apps took ${(performance.now() - started).toFixed(2)} ms`);
    assert.equal(appPath('Notes'), '/System/Applications/Notes.app');
    assert.equal((await talk('open up my notes app')).text, 'Opening Notes.');
    assert.deepEqual(ran.at(-1), ['open', ['-a', '/System/Applications/Notes.app']]);
  } finally { useRunner(); store.setSecrets({ MAC_CONTROL_ON: '' }); }
});
