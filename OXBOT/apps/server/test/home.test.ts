// Home, this Mac and Taurus's voice (owner, November 5, 2026). Against a mocked Home Assistant, Hue bridge and LIFX, a fake
// macOS runner and a fake speech engine only: no light changes, no app opens, no model downloads.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

process.env.TAURUS_HOME = mkdtempSync(join(tmpdir(), 'taurus-home-'));
process.env.TAURUS_BROKER_URL = '';
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'HA_URL', 'HA_TOKEN', 'HUE_BRIDGE', 'HUE_KEY', 'LIFX_TOKEN', 'MAC_CONTROL_ON']) delete process.env[key];
const { store } = await import('../src/store.ts');
const { converse } = await import('../src/agent.ts');
const { homeState, resetHome, targets, pairHue } = await import('../src/home.ts');
const { useRunner, findApp } = await import('../src/mac.ts');
const { speak, speakable, useEngine, setSpeech, speechState } = await import('../src/speech.ts');
const { pending, approve, propose } = await import('../src/actions/index.ts');
const { openWindows, resetWindows } = await import('../src/windows.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
interface Call { method: string; url: string; body: any; auth?: string }
let calls: Call[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const haStates = () => [
  { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen lights', brightness: 255 } },
  { entity_id: 'light.bedroom_lamp', state: 'off', attributes: { friendly_name: 'Bedroom lamp' } },
  { entity_id: 'cover.living_curtains', state: 'closed', attributes: { friendly_name: 'Curtains', current_position: 0 } },
  { entity_id: 'cover.garage', state: 'closed', attributes: { friendly_name: 'Garage door', device_class: 'garage' } },
  { entity_id: 'lock.front', state: 'locked', attributes: { friendly_name: 'Front door' } },
  { entity_id: 'climate.hall', state: 'heat', attributes: { friendly_name: 'Thermostat', current_temperature: 68, temperature: 69 } },
  { entity_id: 'scene.movie_time', state: 'scening', attributes: { friendly_name: 'Movie time' } },
  { entity_id: 'sensor.cpu', state: '40', attributes: { friendly_name: 'CPU' } },
];
globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input), method = init.method ?? 'GET';
  const body = init.body ? (() => { try { return JSON.parse(String(init.body)); } catch { return String(init.body); } })() : undefined;
  calls.push({ method, url, body, auth: new Headers(init.headers).get('Authorization') ?? undefined });
  if (url === 'http://ha.example.com:8123/api/states') return json(haStates());
  if (url === 'http://ha.example.com:8123/api/template') return json({ 'light.kitchen': 'Kitchen', 'light.bedroom_lamp': 'Bedroom', 'cover.living_curtains': 'Living room' });
  if (url.startsWith('http://ha.example.com:8123/api/services/')) return json([]);
  if (url === 'http://192.0.2.10/api/hue-key/lights') return json({ 1: { name: 'Desk', state: { on: false, bri: 127, reachable: true } } });
  if (url === 'http://192.0.2.10/api/hue-key/groups') return json({ 1: { name: 'Office', type: 'Room', lights: ['1'] } });
  if (url === 'http://192.0.2.10/api/hue-key/scenes') return json({ abc: { name: 'Relax', type: 'GroupScene', group: '1' } });
  if (url.startsWith('http://192.0.2.10/api/hue-key/')) return json([{ success: {} }]);
  if (url === 'http://192.0.2.10/api') return json([{ success: { username: 'new-key' } }]);
  if (url === 'https://api.lifx.com/v1/lights/all') return json([{ id: 'd1', label: 'Strip', power: 'off', brightness: 0.5, connected: true, group: { name: 'Studio' }, color: { saturation: 0, kelvin: 3500 } }]);
  if (url === 'https://api.lifx.com/v1/scenes') return json([]);
  if (url.startsWith('https://api.lifx.com/')) return json({ results: [] });
  throw new Error(`unexpected request ${method} ${url}`);
}) as typeof fetch;

const ask = (text: string) => converse([{ role: 'user', text }], 'talk');
const services = () => calls.filter(c => c.url.includes('/api/services/') || c.method === 'PUT');
const noMac = async () => '';

beforeEach(() => {
  calls = []; resetHome(); resetWindows(); useRunner(noMac, []);
  store.setSecrets({ HA_URL: '', HA_TOKEN: '', HUE_BRIDGE: '', HUE_KEY: '', LIFX_TOKEN: '', MAC_CONTROL_ON: '' });
});

// ---------- The sample home ----------

test('with nothing connected, the sample home answers and says it is the sample', async () => {
  assert.equal((await homeState()).sample, true);
  const r = await ask('hey taurus turn off the kitchen lights');
  assert.equal(r.text, 'Pendants off.');
  assert.equal(calls.length, 0, 'the sample home makes no requests');
  const win = openWindows().find(w => w.kind === 'home') as any;
  assert.ok(win.sample);
  assert.equal(win.devices[0].on, false);
});

test('scenes, curtains, levels, colours and the thermostat by voice', async () => {
  assert.equal((await ask('movie time')).text, 'Movie time.');
  let h = await homeState(true);
  assert.equal(h.devices.find(d => d.name === 'Curtains')!.position, 0);
  assert.equal(h.devices.find(d => d.name === 'TV')!.on, true);
  assert.equal((await ask('open the curtains halfway')).text, 'The curtains to 50%.');
  assert.equal((await ask('dim the bedroom to 20 percent')).text, 'Bedside lamp at 20%.');
  assert.equal((await ask('make the living room blue')).text, 'Done.');
  h = await homeState(true);
  assert.equal(h.devices.find(d => d.name === 'Ceiling lights')!.color, '#1e50ff');
  assert.equal((await ask('set the thermostat to 72')).text, 'Thermostat set to 72°.');
  assert.equal((await ask("i'm freezing")).text, 'Thermostat set to 74°.');
  assert.match((await ask('turn off everything')).text, /off\.$/);
  h = await homeState(true);
  assert.ok(h.devices.filter(d => d.kind === 'light').every(d => !d.on));
});

test('the front door never unlocks without an approval card', async () => {
  const r = await ask('unlock the front door');
  assert.match(r.text, /^Unlock front door\? Tap OK/);
  let h = await homeState(true);
  assert.equal(h.devices.find(d => d.kind === 'lock')!.locked, true, 'still locked while it waits');
  const card = pending().find(p => p.kind === 'home.secure')!;
  assert.match(card.caution ?? '', /walk in/);
  const done = await approve(card.id, { digest: card.digest });
  assert.equal(done.state, 'done');
  h = await homeState(true);
  assert.equal(h.devices.find(d => d.kind === 'lock')!.locked, false);
});

test('locking a door that is already locked asks nothing', async () => {
  assert.equal((await ask('lock up')).text, 'Front door is already locked.');
  assert.ok(!pending().some(p => p.kind === 'home.secure' && p.title === 'Lock front door'));
});

test('words that are not about the house fall through', async () => {
  const h = await homeState();
  assert.deepEqual(targets('notifications', h.devices), []);
  assert.deepEqual(targets('spotify', h.devices), []);
});

// ---------- Home Assistant, Hue and LIFX ----------

test('Home Assistant: devices by room, and the exact service calls', async () => {
  store.setSecrets({ HA_URL: 'http://ha.example.com:8123/', HA_TOKEN: 'ha-token' });
  const h = await homeState(true);
  assert.equal(h.sample, false);
  assert.equal(h.devices.find(d => d.id === 'ha:light.kitchen')!.room, 'Kitchen');
  assert.equal(h.devices.find(d => d.id === 'ha:light.kitchen')!.brightness, 100);
  assert.ok(h.devices.find(d => d.id === 'ha:cover.garage')!.secure);
  assert.ok(!h.devices.some(d => d.id === 'ha:sensor.cpu'), 'only temperature and humidity sensors');
  assert.equal(calls[0].auth, 'Bearer ha-token');

  const path = (c: Call) => c.url.replace('http://ha.example.com:8123', '');
  calls = [];
  await ask('turn on the bedroom lamp');
  assert.deepEqual(services().map(c => [path(c), c.body]), [['/api/services/light/turn_on', { entity_id: 'light.bedroom_lamp' }]]);
  calls = [];
  await ask('open the curtains');
  assert.deepEqual(services().map(path), ['/api/services/cover/open_cover']);
  calls = [];
  await ask('set the kitchen lights to 40%');
  assert.deepEqual(services()[0].body, { entity_id: 'light.kitchen', brightness_pct: 40 });
  calls = [];
  await ask('movie time');
  assert.deepEqual(services().map(path), ['/api/services/scene/turn_on']);
  calls = [];
  await ask('open the garage');
  assert.equal(services().length, 0, 'the garage waits for a card');
  assert.ok(pending().some(p => p.kind === 'home.secure' && p.title === 'Open garage door'));
});

test('Hue pairs with the button and changes lights by xy and brightness', async () => {
  assert.equal((await pairHue('192.0.2.10')).bridge, '192.0.2.10');
  assert.equal(store.secret('HUE_KEY'), 'new-key');
  store.setSecrets({ HUE_KEY: 'hue-key' });
  const h = await homeState(true);
  assert.equal(h.devices[0].room, 'Office');
  assert.ok(h.scenes.some(s => s.name === 'Relax'));
  calls = [];
  await ask('make the desk red');
  const put = calls.find(c => c.method === 'PUT')!;
  assert.equal(put.url, 'http://192.0.2.10/api/hue-key/lights/1/state');
  assert.equal(put.body.on, true);
  assert.equal(put.body.xy.length, 2);
  calls = [];
  await ask('relax');
  assert.equal(calls.find(c => c.method === 'PUT')!.url, 'http://192.0.2.10/api/hue-key/groups/1/action');
});

test('LIFX takes power, brightness and kelvin', async () => {
  store.setSecrets({ LIFX_TOKEN: 'lifx-token' });
  await homeState(true);
  calls = [];
  await ask('set the strip to warm white');
  const put = calls.find(c => c.method === 'PUT')!;
  assert.equal(put.url, 'https://api.lifx.com/v1/lights/id:d1/state');
  assert.deepEqual([put.body.power, put.body.color], ['on', 'kelvin:2700']);
  assert.equal(put.auth, 'Bearer lifx-token');
});

// ---------- This Mac ----------

test('Mac control: nothing runs until it is allowed, then only fixed programs with arguments', async () => {
  const ran: [string, string[]][] = [];
  useRunner(async (program, args) => {
    ran.push([program, args]);
    if (program !== 'shortcuts') return '';
    if (args[1] === '--folder-name') return args[2] === 'Taurus' ? 'Coffee order' : '';
    return 'Coffee order\nSend ETA';
  }, ['Spotify', 'Google Chrome', 'Safari', 'Messages']);
  assert.match((await ask('mute')).text, /Allow “Control this Mac”/);
  assert.equal(ran.length, 0);

  store.setSecrets({ MAC_CONTROL_ON: '1' });
  assert.equal((await ask('open chrome')).text, 'Opening Google Chrome.');
  assert.deepEqual(ran.at(-1), ['open', ['-a', 'Google Chrome']]);
  assert.equal((await ask('set the mac volume to 30')).text, 'This Mac’s volume is at 30.');
  assert.deepEqual(ran.at(-1), ['osascript', ['-e', 'set volume output volume 30']]);
  assert.equal((await ask('dark mode')).text, 'Dark mode on.');
  assert.equal((await ask('run my coffee order shortcut')).text, 'Done: Coffee order.');
  assert.deepEqual(ran.at(-1), ['shortcuts', ['run', 'Coffee order']]);

  const acted = () => ran.filter(r => !(r[0] === 'shortcuts' && r[1][0] === 'list')).length;
  const before = acted();
  assert.match((await ask('run send eta')).text, /waiting for your OK/);
  assert.match((await ask('quit safari')).text, /^Quit Safari\?/);
  assert.equal(acted(), before, 'quitting and Shortcuts outside the Taurus folder wait');
  const quit = pending().find(p => p.kind === 'mac.quit')!;
  await approve(quit.id, { digest: quit.digest });
  assert.deepEqual(ran.at(-1), ['osascript', ['-e', 'on run argv\n  tell application (item 1 of argv) to quit\nend run', 'Safari']]);
});

test('an iMessage passes the words as an argument, never inside the script', async () => {
  const ran: [string, string[]][] = [];
  useRunner(async (program, args) => { ran.push([program, args]); return ''; }, ['Messages']);
  store.setSecrets({ MAC_CONTROL_ON: '1' });
  const p = await propose('mac.message', { to: '+1 (555) 010-0000', text: '" end tell do shell script "rm -rf ~' }, 'ask');
  await approve(p.id, { digest: p.digest });
  const [, args] = ran.at(-1)!;
  assert.ok(!args[1].includes('rm -rf'), 'the script itself is fixed');
  assert.deepEqual(args.slice(2), ['+15550100000', '" end tell do shell script "rm -rf ~']);
});

test('app names are found the way people say them', () => {
  const apps = ['Google Chrome', 'Visual Studio Code', 'Spotify', 'System Settings'];
  assert.equal(findApp('chrome', apps), 'Google Chrome');
  assert.equal(findApp('the spotify app', apps), 'Spotify');
  assert.equal(findApp('vs code', apps), 'Visual Studio Code');
  assert.equal(findApp('settings', apps), 'System Settings');
  assert.equal(findApp('photoshop', apps), undefined);
});

// ---------- Taurus's voice ----------

test('the voice speaks plain words, caches short phrases and stays off until turned on', async () => {
  let made = 0;
  useEngine(async () => ({ generate: async (text: string, o: { voice: string; speed: number }) => { made++; return { toWav: () => new TextEncoder().encode(`${o.voice}:${o.speed}:${text}`).buffer as ArrayBuffer }; } }));
  await assert.rejects(speak({ text: 'Hello' }), /isn’t on yet/);
  setSpeech(true);
  assert.equal(speechState().on, true);
  const a = await speak({ text: '**Done.** See [the doc](https://example.com/x)', voice: 'bm_george', speed: 1.1 });
  assert.equal(a.toString(), 'bm_george:1.1:Done. See the doc');
  await speak({ text: '**Done.** See [the doc](https://example.com/x)', voice: 'bm_george', speed: 1.1 });
  assert.equal(made, 1, 'the second time comes from the cache');
  assert.equal((await speak({ text: 'Hi', voice: 'not-a-voice' })).toString(), 'am_michael:1:Hi');
  assert.equal(speakable('- one\n- two\n<tool>{"name":"x"}</tool>'), 'one. two.');
  setSpeech(false);
});

// ---------- Hud, the cloud dashboard's layout ----------

test('Hud layouts are kept tidy: known panels only, sizes and sides checked, older prefs get the default', async () => {
  const { sanitize, hudDefaults } = await import('../src/boards.ts');
  assert.deepEqual(sanitize({}).hud, hudDefaults());
  const t = sanitize({ hud: { panels: [
    { id: 'a', type: 'stocks', size: 'large', side: 'right', config: { symbols: ['AAPL', 'NVDA'] } },
    { id: 'b', type: 'house', size: 'enormous', side: 'middle' },
    { id: 'c', type: 'shell', size: 'small', side: 'left' },
  ], clouds: 'lively', taurusSize: 'large', chips: false, facts: true, start: 'board' } as any }).hud;
  assert.deepEqual(t.panels.map(p => [p.id, p.type, p.size, p.side]), [['a', 'stocks', 'large', 'right'], ['b', 'house', 'medium', 'left']]);
  assert.deepEqual(t.panels[0].config?.symbols, ['AAPL', 'NVDA'], 'a panel keeps its settings');
  assert.deepEqual([t.clouds, t.taurusSize, t.chips, t.start], ['lively', 'large', false, 'board']);
});
