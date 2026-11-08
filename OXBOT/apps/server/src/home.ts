import { begin } from './activity.ts';
import { isConnected } from './connectors.ts';
import { propose, register, type Spec } from './actions/approvals.ts';
import { macAllowed, runShortcut, shortcuts } from './mac.ts';
import { api, HttpError, store } from './store.ts';
import type { Device, DeviceKind, HomeSource, HomeState } from './types.ts';
import { show } from './windows.ts';
import { moreHome } from './home-more.ts';

// Home (owner, November 5, 2026: "make it so u can even connect it to like smart lights or curtains to make it like a
// smart home controlled by ox"). Four ways in, all with your own keys:
//   Home Assistant  the open-source hub that already talks to nearly every brand (lights, blinds, plugs, thermostats,
//                   locks). Its REST API on your network, with a long-lived token from your HA profile.
//   Philips Hue     the bridge's local API, paired by pressing its button.
//   LIFX            LIFX's cloud API with your personal token.
//   Apple Home      through Shortcuts: every Shortcut in a folder named "Home" becomes a scene Ox can run.
// Like Spotify playback, lights, plugs, curtains, fans, the thermostat and scenes change the moment you ask: they're
// yours, undone with one word, and connecting a hub is the permission. Locks, garage doors and gates never change
// without an approval card (a tap, or a spoken yes after the read-back on a phone call), the way Alexa and Google
// ask for a PIN. With nothing connected, a sample home, labelled as one, shows how it works and changes nothing real.
// Built from each provider's documentation; tested only against mocked responses.

/* eslint-disable @typescript-eslint/no-explicit-any -- hub payloads are untyped JSON */
export interface Change { on?: boolean; brightness?: number; rgb?: [number, number, number]; kelvin?: number; position?: number; target?: number; lock?: boolean; activate?: boolean }

// ---------- Colours ----------

const colours: Record<string, [number, number, number] | number> = {
  red: [255, 30, 20], orange: [255, 120, 0], yellow: [255, 210, 0], green: [40, 220, 60], teal: [0, 200, 180], cyan: [0, 220, 255], blue: [30, 80, 255],
  purple: [140, 40, 255], violet: [150, 60, 255], pink: [255, 80, 170], magenta: [255, 0, 200],
  white: 4000, 'warm white': 2700, warm: 2700, 'soft white': 2700, candlelight: 2000, cozy: 2200, cosy: 2200, cool: 5500, 'cool white': 5500, daylight: 6500,
};
export const colourWords = Object.keys(colours).sort((a, b) => b.length - a.length).join('|');
const hex = (rgb: number[]) => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
// Kelvin to an approximate RGB, for showing a white on screen.
function kelvinRgb(k: number): [number, number, number] {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305;
  return [r, g, b].map(v => Math.max(0, Math.min(255, v))) as [number, number, number];
}
// Hue bridges take CIE xy.
function toXy([r, g, b]: number[]): [number, number] {
  const lin = (c: number) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028, Y = R * 0.283881 + G * 0.668433 + B * 0.047685, Z = R * 0.000088 + G * 0.07231 + B * 0.986039;
  const sum = X + Y + Z || 1;
  return [Number((X / sum).toFixed(4)), Number((Y / sum).toFixed(4))];
}
export function colourChange(word: string): Pick<Change, 'rgb' | 'kelvin'> | undefined {
  const c = colours[word.toLowerCase().trim()];
  if (c === undefined) return undefined;
  return typeof c === 'number' ? { kelvin: c } : { rgb: c };
}

// ---------- Home Assistant ----------

const haUrl = () => (store.secret('HA_URL') ?? '').replace(/\/+$/, '');
function ha<T>(path: string, body?: unknown) {
  const base = haUrl();
  if (!/^https?:\/\/[^/\s]+/.test(base)) throw new HttpError(400, 'Home Assistant’s address must start with http:// or https://, like http://homeassistant.local:8123');
  return api<T>(`${base}/api/${path}`, { method: body === undefined ? 'GET' : 'POST', token: store.secret('HA_TOKEN'), headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
}
// Which room each entity is in, from Home Assistant's own areas.
const AREAS = '{% set ns = namespace(d={}) %}{% for s in states %}{% set a = area_name(s.entity_id) %}{% if a %}{% set ns.d = dict(ns.d, **{s.entity_id: a}) %}{% endif %}{% endfor %}{{ ns.d | tojson }}';
const haDomains = new Set(['light', 'switch', 'input_boolean', 'fan', 'cover', 'climate', 'lock', 'scene', 'script', 'media_player', 'sensor']);

async function pullHa(): Promise<Device[]> {
  const [states, areas] = await Promise.all([
    ha<any[]>('states'),
    ha<unknown>('template', { template: AREAS }).then(t => (typeof t === 'string' ? JSON.parse(t) : t) as Record<string, string>).catch(() => ({} as Record<string, string>)),
  ]);
  const out: Device[] = [];
  for (const s of states) {
    const [domain] = String(s.entity_id).split('.');
    const a = s.attributes ?? {};
    if (!haDomains.has(domain) || s.state === 'unavailable') continue;
    if (domain === 'sensor' && !['temperature', 'humidity'].includes(a.device_class)) continue;
    const base = { id: `ha:${s.entity_id}`, name: String(a.friendly_name ?? s.entity_id), room: areas[s.entity_id] ?? 'Home', source: 'Home Assistant' };
    if (domain === 'light') out.push({ ...base, kind: 'light', on: s.state === 'on', brightness: a.brightness != null ? Math.round(a.brightness / 2.55) : undefined, color: a.rgb_color ? hex(a.rgb_color) : undefined });
    else if (domain === 'switch' || domain === 'input_boolean') out.push({ ...base, kind: 'switch', on: s.state === 'on' });
    else if (domain === 'fan') out.push({ ...base, kind: 'fan', on: s.state === 'on', brightness: a.percentage ?? undefined });
    else if (domain === 'cover') out.push({ ...base, kind: 'cover', on: s.state === 'open' || s.state === 'opening', position: a.current_position ?? (s.state === 'open' ? 100 : 0), secure: ['garage', 'gate', 'door'].includes(a.device_class) });
    else if (domain === 'climate') out.push({ ...base, kind: 'climate', on: s.state !== 'off', temperature: a.current_temperature, target: a.temperature, unit: '°', reading: s.state });
    else if (domain === 'lock') out.push({ ...base, kind: 'lock', locked: s.state === 'locked', secure: true });
    else if (domain === 'scene' || domain === 'script') out.push({ ...base, kind: 'scene' });
    else if (domain === 'media_player') out.push({ ...base, kind: 'media', on: !['off', 'standby', 'idle'].includes(s.state), reading: a.media_title });
    else out.push({ ...base, kind: 'sensor', reading: `${s.state}${a.unit_of_measurement ?? ''}` });
  }
  return out;
}

async function setHa(d: Device, c: Change) {
  const entity = d.id.slice(3), [domain] = entity.split('.');
  const call = (service: string, extra: Record<string, unknown> = {}) => ha(`services/${domain}/${service}`, { entity_id: entity, ...extra });
  if (c.activate) return call('turn_on');
  if (c.lock !== undefined) return call(c.lock ? 'lock' : 'unlock');
  if (domain === 'cover') return c.position !== undefined && c.position !== 0 && c.position !== 100 ? call('set_cover_position', { position: c.position }) : call((c.position ?? (c.on ? 100 : 0)) > 0 ? 'open_cover' : 'close_cover');
  if (domain === 'climate') return c.target !== undefined ? call('set_temperature', { temperature: c.target }) : call(c.on ? 'turn_on' : 'turn_off');
  if (domain === 'fan' && c.brightness !== undefined) return call('set_percentage', { percentage: c.brightness });
  if (domain === 'light' && c.on !== false && (c.brightness !== undefined || c.rgb || c.kelvin)) {
    return call('turn_on', { ...(c.brightness !== undefined ? { brightness_pct: c.brightness } : {}), ...(c.rgb ? { rgb_color: c.rgb } : {}), ...(c.kelvin ? { color_temp_kelvin: c.kelvin } : {}) });
  }
  return call(c.on ? 'turn_on' : 'turn_off');
}

// ---------- Philips Hue ----------

const bridgeHost = (raw: string) => raw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const hueBase = () => `http://${bridgeHost(store.secret('HUE_BRIDGE') ?? '')}/api/${encodeURIComponent(store.secret('HUE_KEY') ?? '')}`;
const hue = <T>(path: string, body?: unknown) => api<T>(`${hueBase()}/${path}`, { method: body === undefined ? 'GET' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(6000) });
const hueError = (reply: any) => { const e = Array.isArray(reply) ? reply.find((r: any) => r.error)?.error : undefined; if (e) throw new HttpError(409, `Hue: ${e.description}`); };

async function pullHue(): Promise<Device[]> {
  const [lights, groups, scenes] = await Promise.all([hue<any>('lights'), hue<Record<string, any>>('groups'), hue<Record<string, any>>('scenes').catch(() => ({}))]);
  hueError(lights);
  const roomOf = new Map<string, string>();
  for (const g of Object.values(groups)) if (g.type === 'Room') for (const id of g.lights ?? []) if (!roomOf.has(id)) roomOf.set(id, g.name);
  const out: Device[] = Object.entries(lights as Record<string, any>).filter(([, l]) => l.state?.reachable !== false).map(([id, l]) => ({
    id: `hue:${id}`, name: String(l.name), room: roomOf.get(id) ?? 'Home', source: 'Hue', kind: 'light' as const, on: Boolean(l.state?.on),
    brightness: l.state?.bri != null ? Math.round(l.state.bri / 2.54) : undefined,
  }));
  for (const [id, s] of Object.entries(scenes)) if (s.type === 'GroupScene' && s.group) out.push({ id: `hue-scene:${s.group}:${id}`, name: String(s.name), room: groups[s.group]?.name ?? 'Home', source: 'Hue', kind: 'scene' });
  return out;
}
async function setHue(d: Device, c: Change) {
  if (d.kind === 'scene') { const [, group, scene] = d.id.split(':'); return hueError(await hue(`groups/${group}/action`, { scene })); }
  const body: Record<string, unknown> = { on: c.on !== false };
  if (c.brightness !== undefined) body.bri = Math.max(1, Math.round(c.brightness * 2.54));
  if (c.rgb) body.xy = toXy(c.rgb);
  if (c.kelvin) body.ct = Math.max(153, Math.min(500, Math.round(1_000_000 / c.kelvin)));
  hueError(await hue(`lights/${d.id.slice(4)}/state`, body));
}
// Press the bridge's round button, then Pair, within 30 seconds.
export async function pairHue(bridge?: string) {
  let ip = bridgeHost(String(bridge ?? '') || store.secret('HUE_BRIDGE') || '');
  if (!ip) {
    const found = await api<{ internalipaddress: string }[]>('https://discovery.meethue.com/').catch(() => []);
    ip = found[0]?.internalipaddress ?? '';
    if (!ip) throw new HttpError(404, 'OXBOT couldn’t find a Hue bridge. Type its address from the Hue app: Settings, Bridges, then the i next to yours.');
  }
  const reply = await api<any[]>(`http://${ip}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ devicetype: 'oxbot#mac' }), signal: AbortSignal.timeout(6000) });
  const key = reply.find(r => r.success)?.success?.username;
  if (!key) throw new HttpError(409, reply.find(r => r.error)?.error?.type === 101 ? 'Press the round button on top of the Hue bridge, then Pair again within 30 seconds.' : 'The bridge said no. Try again.');
  store.setSecrets({ HUE_BRIDGE: ip, HUE_KEY: key });
  cached = undefined;
  return { bridge: ip };
}

// ---------- LIFX ----------

const lifx = <T>(path: string, body?: unknown) => api<T>(`https://api.lifx.com/v1/${path}`, { method: body === undefined ? 'GET' : 'PUT', token: store.secret('LIFX_TOKEN'), headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
async function pullLifx(): Promise<Device[]> {
  const [lights, scenes] = await Promise.all([lifx<any[]>('lights/all'), lifx<any[]>('scenes').catch(() => [])]);
  return [
    ...lights.filter(l => l.connected !== false).map(l => ({
      id: `lifx:${l.id}`, name: String(l.label), room: String(l.group?.name ?? 'Home'), source: 'LIFX', kind: 'light' as const, on: l.power === 'on', brightness: Math.round((l.brightness ?? 0) * 100),
      color: l.color && l.color.saturation > 0.1 ? undefined : hex(kelvinRgb(l.color?.kelvin ?? 3500)),
    })),
    ...scenes.map(s => ({ id: `lifx-scene:${s.uuid}`, name: String(s.name), room: 'Home', source: 'LIFX', kind: 'scene' as const })),
  ];
}
async function setLifx(d: Device, c: Change) {
  if (d.kind === 'scene') return lifx(`scenes/scene_id:${d.id.slice(11)}/activate`, {});
  const body: Record<string, unknown> = { power: c.on === false ? 'off' : 'on', duration: 0.4 };
  if (c.brightness !== undefined) body.brightness = c.brightness / 100;
  if (c.rgb) body.color = hex(c.rgb);
  if (c.kelvin) body.color = `kelvin:${c.kelvin}`;
  return lifx(`lights/id:${d.id.slice(5)}/state`, body);
}

// ---------- Apple Home, through Shortcuts ----------

async function pullApple(): Promise<Device[]> {
  if (!macAllowed()) return [];
  return (await shortcuts()).filter(s => s.folder === 'Home').map(s => ({ id: `apple:${s.name}`, name: s.name, room: 'Home', source: 'Apple Home', kind: 'scene' as const }));
}

// ---------- The sample home ----------

const sampleStart = (): Device[] => [
  { id: 'sample:living-ceiling', name: 'Ceiling lights', room: 'Living room', kind: 'light', on: true, brightness: 80, color: hex(kelvinRgb(2700)), source: 'Sample' },
  { id: 'sample:living-lamp', name: 'Floor lamp', room: 'Living room', kind: 'light', on: false, brightness: 60, color: hex(kelvinRgb(2400)), source: 'Sample' },
  { id: 'sample:living-curtains', name: 'Curtains', room: 'Living room', kind: 'cover', on: true, position: 100, source: 'Sample' },
  { id: 'sample:living-tv', name: 'TV', room: 'Living room', kind: 'media', on: false, source: 'Sample' },
  { id: 'sample:bed-lamp', name: 'Bedside lamp', room: 'Bedroom', kind: 'light', on: true, brightness: 30, color: hex(kelvinRgb(2200)), source: 'Sample' },
  { id: 'sample:bed-blinds', name: 'Blinds', room: 'Bedroom', kind: 'cover', on: false, position: 0, source: 'Sample' },
  { id: 'sample:bed-fan', name: 'Ceiling fan', room: 'Bedroom', kind: 'fan', on: false, brightness: 40, source: 'Sample' },
  { id: 'sample:kitchen-pendants', name: 'Pendants', room: 'Kitchen', kind: 'light', on: true, brightness: 100, color: hex(kelvinRgb(3000)), source: 'Sample' },
  { id: 'sample:kitchen-coffee', name: 'Coffee machine', room: 'Kitchen', kind: 'switch', on: false, source: 'Sample' },
  { id: 'sample:office-desk', name: 'Desk lamp', room: 'Office', kind: 'light', on: true, brightness: 70, color: hex(kelvinRgb(5000)), source: 'Sample' },
  { id: 'sample:office-thermostat', name: 'Thermostat', room: 'Office', kind: 'climate', on: true, temperature: 71, target: 70, unit: '°', reading: 'heat', source: 'Sample' },
  { id: 'sample:front-lock', name: 'Front door', room: 'Entry', kind: 'lock', locked: true, secure: true, source: 'Sample' },
  ...['Movie time', 'Goodnight', 'Good morning', 'Focus', 'Away'].map(name => ({ id: `sample-scene:${name}`, name, room: 'Home', kind: 'scene' as const, source: 'Sample' })),
];
let sample = sampleStart();
const sampleScenes: Record<string, [string, Change][]> = {
  'Movie time': [['living-ceiling', { on: false }], ['living-lamp', { on: true, brightness: 25 }], ['living-curtains', { position: 0 }], ['living-tv', { on: true }]],
  Goodnight: [['living-ceiling', { on: false }], ['living-lamp', { on: false }], ['kitchen-pendants', { on: false }], ['office-desk', { on: false }], ['bed-lamp', { on: true, brightness: 10 }], ['bed-blinds', { position: 0 }], ['living-tv', { on: false }]],
  'Good morning': [['bed-blinds', { position: 100 }], ['living-curtains', { position: 100 }], ['kitchen-coffee', { on: true }], ['kitchen-pendants', { on: true, brightness: 100 }]],
  Focus: [['office-desk', { on: true, brightness: 100, kelvin: 5500 }], ['living-tv', { on: false }]],
  Away: [['living-ceiling', { on: false }], ['living-lamp', { on: false }], ['kitchen-pendants', { on: false }], ['office-desk', { on: false }], ['bed-lamp', { on: false }], ['kitchen-coffee', { on: false }], ['bed-fan', { on: false }], ['living-tv', { on: false }]],
};
function setSample(d: Device, c: Change) {
  if (d.kind === 'scene') { for (const [id, next] of sampleScenes[d.name] ?? []) { const t = sample.find(x => x.id === `sample:${id}`); if (t) setSample(t, next); } return; }
  const t = sample.find(x => x.id === d.id);
  if (!t) return;
  if (c.on !== undefined) t.on = c.on;
  if (c.brightness !== undefined) { t.brightness = c.brightness; t.on = c.brightness > 0; }
  if (c.rgb) { t.color = hex(c.rgb); t.on = true; }
  if (c.kelvin) { t.color = hex(kelvinRgb(c.kelvin)); t.on = true; }
  if (t.kind === 'cover') { if (c.position !== undefined) t.position = c.position; else if (c.on !== undefined) t.position = c.on ? 100 : 0; t.on = (t.position ?? 0) > 0; }
  if (c.target !== undefined) t.target = c.target;
  if (c.lock !== undefined) t.locked = c.lock;
}

// ---------- Reading and changing ----------

let cached: HomeState | undefined;
export const resetHome = () => { sample = sampleStart(); cached = undefined; };
export const sources = (): HomeSource[] => [
  { id: 'home-assistant', name: 'Home Assistant', connected: isConnected('home-assistant') },
  { id: 'hue', name: 'Philips Hue', connected: isConnected('hue') },
  { id: 'lifx', name: 'LIFX', connected: isConnected('lifx') },
  // November 6, 2026: Govee, SwitchBot, SmartThings, Shelly, Nanoleaf, WiZ and Yeelight (home-more.ts).
  ...moreHome.map(p => ({ id: p.id, name: p.name, connected: isConnected(p.id) })),
];
const pullers: Record<string, () => Promise<Device[]>> = { 'home-assistant': pullHa, hue: pullHue, lifx: pullLifx, ...Object.fromEntries(moreHome.map(p => [p.id, p.pull])) };

export async function homeState(fresh = false): Promise<HomeState> {
  if (!fresh && cached && Date.now() - Date.parse(cached.at) < 5000) return cached;
  const list = sources();
  const pulled = await Promise.all(list.map(async s => {
    if (!s.connected) return [];
    try { return await pullers[s.id](); } catch (error) { s.error = error instanceof Error ? error.message.slice(0, 160) : String(error); return []; }
  }));
  const apple = await pullApple().catch(() => []);
  const live = list.some(s => s.connected) || apple.length > 0;
  const all = live ? [...pulled.flat(), ...apple] : sample.map(d => ({ ...d }));
  cached = { devices: all.filter(d => d.kind !== 'scene'), scenes: all.filter(d => d.kind === 'scene'), sources: list, sample: !live, at: new Date().toISOString() };
  return cached;
}

async function set(d: Device, c: Change) {
  if (d.id.startsWith('apple:')) return runShortcut(d.id.slice(6));
  if (d.id.startsWith('ha:')) return setHa(d, c);
  if (d.id.startsWith('hue')) return setHue(d, c);
  if (d.id.startsWith('lifx')) return setLifx(d, c);
  const more = moreHome.find(p => d.id.startsWith(p.prefix));
  if (more) return more.set(d, c);
  if (d.id.startsWith('sample')) return setSample(d, c);
  throw new HttpError(400, `OXBOT can’t change ${d.name}.`);
}
// Locks, garage doors and gates wait for an approval card.
const guarded = (d: Device, c: Change) => Boolean(d.secure && (c.lock !== undefined || c.on !== undefined || c.position !== undefined));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function describe(devices: Device[], c: Change): string {
  const sameRoom = devices.every(d => d.room === devices[0].room), sameKind = devices.every(d => d.kind === devices[0].kind);
  const plural = devices[0].kind === 'light' ? 'lights' : devices[0].kind === 'cover' ? 'shades' : 'devices';
  const whatAll = sameKind && sameRoom && devices[0].room !== 'Home' ? `the ${devices[0].room.toLowerCase()} ${plural}` : sameKind ? `${devices.length} ${plural}` : `${devices.length} things`;
  const what = devices.length === 1 ? devices[0].name : sameKind && sameRoom && devices[0].room !== 'Home' ? `the ${devices[0].room.toLowerCase()} ${plural}` : sameKind ? `${devices.length} ${plural}` : `${devices.length} things`;
  if (c.activate) return `${devices[0].name}.`;
  if (c.lock !== undefined) return `${c.lock ? 'Locked' : 'Unlocked'} ${what}.`;
  if (c.target !== undefined) return `${cap(what)} set to ${c.target}°.`;
  if (devices.every(d => d.kind === 'cover')) {
    const to = c.position ?? (c.on ? 100 : 0);
    const what = devices.length === 1 ? `the ${devices[0].name.toLowerCase()}` : whatAll;
    return to === 0 ? `Closing ${what}.` : to === 100 ? `Opening ${what}.` : `${cap(what)} to ${to}%.`;
  }
  if (c.rgb || c.kelvin) return 'Done.';
  if (c.brightness !== undefined) return `${cap(what)} at ${c.brightness}%.`;
  return `${cap(what)} ${c.on ? 'on' : 'off'}.`;
}

// The one door for changing things at home. Secure devices only come through approve(), with allowSecure.
export async function change(ids: string[], c: Change, heard = '', allowSecure = false): Promise<{ text: string; devices: Device[]; sample: boolean }> {
  const state = await homeState();
  const devices = [...state.devices, ...state.scenes].filter(d => ids.includes(d.id));
  if (!devices.length) throw new HttpError(404, 'I couldn’t find that at home.');
  if (!allowSecure && devices.some(d => guarded(d, c))) throw new HttpError(409, 'Locks, garage doors and gates need your OK first.');
  const step = begin('home', describe(devices, c).replace(/\.$/, ''), { by: 'ox' });
  const failed: string[] = [];
  await Promise.all(devices.map(d => Promise.resolve().then(() => set(d, c)).catch(error => { failed.push(`${d.name}: ${error instanceof Error ? error.message : error}`); })));
  if (failed.length === devices.length) { step.fail(failed.join('; ')); throw new HttpError(409, failed[0]); }
  step.done();
  cached = undefined;
  // Hubs take a moment to report the new state.
  if (!state.sample) await new Promise(r => setTimeout(r, 350));
  const after = await homeState(true);
  const shownDevices = c.activate ? after.devices.filter(d => d.kind !== 'sensor' && d.kind !== 'lock').slice(0, 8) : after.devices.filter(d => ids.includes(d.id));
  const text = describe(devices, c) + (failed.length ? ` Couldn’t reach ${failed.map(f => f.split(':')[0]).join(', ')}.` : '');
  show({ id: c.activate ? 'home-scene' : `home-${ids.slice(0, 3).join('|')}`, kind: 'home', text, devices: shownDevices, sample: after.sample, said: heard });
  return { text, devices: shownDevices, sample: after.sample };
}

// ---------- Understanding what you said ----------

const kindWords: [RegExp, DeviceKind[]][] = [
  [/\b(?:lights?|lamps?|bulbs?|lighting|pendants?|leds?)\b/, ['light']],
  [/\b(?:curtains?|blinds?|shades?|drapes?|shutters?)\b/, ['cover']],
  [/\bfans?\b/, ['fan']],
  [/\b(?:plugs?|outlets?|switch(?:es)?|sockets?)\b/, ['switch']],
  [/\b(?:tv|television|telly)\b/, ['media']],
  [/\b(?:thermostat|heat(?:ing|er)?|ac|air conditioning|temperature|temp)\b/, ['climate']],
  [/\b(?:locks?|doors?|deadbolt)\b/, ['lock', 'cover']],
  [/\b(?:garage|gate)\b/, ['cover']],
];
const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const homeish = new RegExp(`\\b(?:lights?|lamps?|bulbs?|lighting|pendants?|curtains?|blinds?|shades?|drapes?|shutters?|fans?|plugs?|outlets?|thermostat|heating|heat|ac|air conditioning|temperature|degrees|locks?|unlock|door|garage|gate|scene|tv|television|warmer|cooler|colder|hotter|freezing|dim|brighten|home|house|everything|${colourWords})\\b`);

// The devices you meant, most specific first: a name, then a room and a kind, then a room, then every one of a kind.
export function targets(words: string, all: Device[], allow?: DeviceKind[]): Device[] {
  const w = ` ${n(words).replace(/\b(?:the|my|all|every|of|in|all of|room)\b/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const pool = all.filter(d => d.kind !== 'scene' && d.kind !== 'sensor' && (!allow || allow.includes(d.kind)));
  const kinds = kindWords.filter(([re]) => re.test(w)).flatMap(([, k]) => k);
  const byKind = (list: Device[]) => kinds.length ? list.filter(d => kinds.includes(d.kind)) : list;
  const named = pool.filter(d => w.includes(` ${n(d.name)} `) || w.includes(` ${n(`${d.room} ${d.name}`)} `));
  if (named.length) return named;
  const rooms = [...new Set(pool.map(d => d.room))].filter(r => n(r) !== 'home' && (w.includes(` ${n(r)} `) || w.includes(` ${n(r).replace(/ room$/, '')} `)));
  if (rooms.length) { const inRoom = byKind(pool.filter(d => rooms.includes(d.room))); if (inRoom.length) return inRoom; }
  const partial = pool.filter(d => n(d.name).length > 3 && n(d.name).split(' ').filter(p => p.length > 2).some(p => w.includes(` ${p} `)) && !/^(?:lights?|lamp)$/.test(n(d.name)));
  if (partial.length && !kinds.length) return partial;
  if (kinds.length) return byKind(pool);
  if (/^\s*(?:everything|all|house|whole house|it all)\s*$/.test(w)) return pool.filter(d => d.kind === 'light' || d.kind === 'switch' || d.kind === 'media' || d.kind === 'fan');
  return [];
}
export function findScene(words: string, scenes: Device[]) {
  const w = n(words).replace(/^(?:activate|run|start|set|turn on|switch to|put on|go to|do|it s|its)\s+/, '').replace(/^the\s+/, '').replace(/\s+(?:scene|mode)$/, '').trim();
  if (!w) return undefined;
  return scenes.find(s => n(s.name) === w) ?? scenes.find(s => n(s.name).replace(/\s/g, '') === w.replace(/\s/g, ''));
}

const toPercent = (s: string) => Math.max(0, Math.min(100, Number(s)));
const safe = (list: Device[]) => list.filter(d => !d.secure);

export async function homeCommand(said: string, heard: string): Promise<{ text: string } | null> {
  // Only short phrases can be a scene's name ("movie time"); questions and other commands skip the hubs entirely.
  if (!homeish.test(said) && !/^what(?:'s| is) on\b/.test(said) && (said.split(' ').length > 4 || /^(?:play|pause|skip|next|previous|resume|remind|open|launch|close|quit|search|find|what|who|how|why|when|where|is|are|do|does|can|tell|show|stop|cancel|send|text|call|email|reply|mute|unmute)\b/.test(said))) return null;
  const state = await homeState();
  const everything = [...state.devices, ...state.scenes];
  const run = async (devices: Device[], c: Change) => devices.length ? { text: (await change(devices.map(d => d.id), c, heard)).text } : null;

  // Scenes: "movie time", "goodnight", "activate the focus scene".
  const scene = findScene(said, state.scenes);
  if (scene) return run([scene], { activate: true });

  // What's on at home.
  if (/^(?:show|open|pull up)(?: me)? (?:my |the )?(?:home|house|smart home|devices|lights)$|^what(?:'s| is) on(?: at home| in the house)?$|^are (?:the|my|any) lights on$|^(?:how'?s|what'?s up with) (?:my |the )?(?:home|house)$/.test(said)) {
    const lights = state.devices.filter(d => d.kind === 'light' && d.on);
    const on = state.devices.filter(d => d.kind !== 'sensor' && (d.on || d.kind === 'climate' || d.kind === 'lock'));
    const text = lights.length ? `${lights.length} light${lights.length === 1 ? ' is' : 's are'} on: ${lights.slice(0, 4).map(l => l.name.toLowerCase()).join(', ')}.` : 'Every light is off.';
    show({ id: 'home-status', kind: 'home', text, devices: (on.length ? on : state.devices).slice(0, 10), sample: state.sample, said: heard });
    return { text };
  }
  if (!homeish.test(said)) return null;

  // Locks, garage doors and gates: an approval card, never straight away.
  const lock = said.match(/^(lock|unlock)\s*(?:up\s+)?(?:the\s+)?(.*)$/) ?? said.match(/^(open|close|shut)\s+(?:the\s+)?(garage(?: door)?|gate|front door|back door)$/);
  if (lock) {
    const verb = lock[1] === 'shut' ? 'close' : lock[1];
    const words = lock[2].trim();
    let found = targets(words || 'door', everything, verb === 'lock' || verb === 'unlock' ? ['lock'] : ['cover', 'lock']).filter(d => d.secure);
    if (!found.length && /^(?:|up|everything|the house|house|all|doors|the doors|all the doors)$/.test(words)) found = state.devices.filter(d => d.kind === 'lock');
    // Only what would actually change: "lock up" with every door locked has nothing to ask.
    const already = found.filter(d => d.kind === 'lock' ? d.locked === (verb === 'lock') : Boolean(d.on) === (verb === 'open'));
    found = found.filter(d => !already.includes(d));
    if (!found.length && already.length) return { text: already.length === 1 ? `${already[0].name} is already ${verb === 'lock' ? 'locked' : verb === 'unlock' ? 'unlocked' : verb === 'open' ? 'open' : 'closed'}.` : `They’re already ${verb === 'lock' ? 'locked' : verb === 'unlock' ? 'unlocked' : verb === 'open' ? 'open' : 'closed'}.` };
    if (found.length) {
      const p = await propose('home.secure', { ids: found.map(d => d.id), do: verb }, 'talk');
      return { text: `${p.title.replace(/\.$/, '')}? Tap OK when you’re sure.` };
    }
  }

  // On and off: "turn off the lights", "kitchen lights on", "kill the lights", "switch the fan off".
  const onoff = said.match(/^(?:turn|switch|shut|flip|put)\s+(on|off)\s+(.+)$/) ?? said.match(/^(?:turn|switch|shut|flip|put)\s+(.+?)\s+(on|off)$/) ?? said.match(/^(.+?)\s+(on|off)$/) ?? said.match(/^(kill|cut)\s+(?:the\s+)?(.+)$/);
  if (onoff) {
    const [a, b] = [onoff[1], onoff[2]];
    const on = a === 'on' || b === 'on';
    const words = a === 'on' || a === 'off' || a === 'kill' || a === 'cut' ? b : a;
    const found = safe(targets(words, everything));
    if (found.length) return run(found, found.every(d => d.kind === 'cover') ? { position: on ? 100 : 0 } : { on });
  }

  // Curtains and blinds: "open the curtains", "close the bedroom blinds halfway".
  const cover = said.match(/^(open|close|raise|lower|draw|pull up|pull down|shut)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(halfway|half way|half|partway|a little|a bit|all the way))?$/);
  if (cover) {
    const found = safe(targets(cover[2], everything, ['cover']));
    if (found.length) {
      const opening = /^(?:open|raise|pull up)$/.test(cover[1]);
      const part = cover[3] && /half|part/.test(cover[3]) ? 50 : cover[3] && /little|bit/.test(cover[3]) ? (opening ? 25 : 75) : undefined;
      return run(found, { position: part ?? (opening ? 100 : 0) });
    }
  }

  // Levels: "dim the living room to 30", "set the bedroom lights to 20 percent", "set the blinds to 40%".
  const level = said.match(/^(?:set|put|turn|bring|dim|brighten)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to|at|down to|up to)\s+(\d{1,3})\s*(?:%|percent)?(?:\s+brightness)?$/);
  if (level && !/thermostat|heat|temperature|temp\b|\bac\b|air/.test(level[1])) {
    const found = safe(targets(level[1], everything));
    if (found.length && found.every(d => d.kind === 'cover')) return run(found, { position: toPercent(level[2]) });
    const lights = found.some(d => d.kind === 'light') ? found.filter(d => d.kind === 'light') : found.filter(d => d.kind === 'fan');
    if (lights.length) return run(lights, { brightness: toPercent(level[2]) });
  }
  const dim = said.match(/^(dim|brighten)\s+(?:the\s+|my\s+)?(.+)$/) ?? (() => { const m = said.match(/^(?:make|turn)\s+(?:the\s+|my\s+)?(.+?)\s+(brighter|dimmer|darker)$/); return m && [m[0], m[2], m[1]]; })();
  if (dim) {
    const up = /^(?:brighten|brighter)$/.test(dim[1]);
    const found = targets(dim[2], everything, ['light']);
    if (found.length) {
      const now = Math.round(found.reduce((s, d) => s + (d.on ? d.brightness ?? 100 : 0), 0) / found.length);
      return run(found, { brightness: Math.max(5, Math.min(100, up ? Math.max(now + 30, 50) : Math.min(now - 30, 30))) });
    }
  }

  // Colours: "make the living room blue", "set the lamp to warm white", "purple lights".
  const tint = said.match(new RegExp(`^(?:make|turn|set|change|switch)\\s+(?:the\\s+|my\\s+)?(.+?)\\s+(?:to\\s+|into\\s+)?(${colourWords})$`)) ?? (() => { const m = said.match(new RegExp(`^(${colourWords})\\s+(.+)$`)); return m && [m[0], m[2], m[1]]; })();
  if (tint) {
    const colour = colourChange(tint[2]);
    const found = targets(tint[1], everything, ['light']);
    if (colour && found.length) return run(found, { on: true, ...colour });
  }

  // The thermostat: "set the thermostat to 70", "make it warmer", "I'm freezing".
  const heat = said.match(/^(?:set|turn|put)\s+(?:the\s+)?(?:thermostat|heat|heating|ac|a\/c|air(?: conditioning)?|temperature|temp)(?:\s+in\s+(?:the\s+)?(.+?))?\s+(?:to|at)\s+(\d{2})(?:\s*degrees)?$/);
  const nudge = said.match(/^(?:make it|turn it|i'?m|it'?s)\s+(warmer|cooler|colder|hotter|freezing|cold|hot|too hot|too cold)(?: in here)?$/);
  if (heat || nudge) {
    const climate = state.devices.filter(d => d.kind === 'climate');
    const found = heat?.[1] ? targets(heat[1], climate) : climate;
    if (!found.length) return { text: 'I don’t see a thermostat at home.' };
    const up = Boolean(nudge && /^(?:warmer|hotter|freezing|cold|too cold)$/.test(nudge[1]));
    const target = heat ? Number(heat[2]) : Math.round((found[0].target ?? 70) + (up ? 2 : -2));
    return run(found, { target });
  }
  return null;
}

// ---------- The approval card for locks, garage doors and gates ----------

register({
  kind: 'home.secure', app: 'Home', ttlMinutes: 3,
  help: 'Lock or unlock a door, or open or close a garage door or gate. Args: ids (device ids from the home tool), do ("lock", "unlock", "open" or "close").',
  missing: () => undefined,
  async prepare(args) {
    const state = await homeState(true);
    const ids: string[] = Array.isArray(args.ids) ? args.ids.map(String) : [];
    const found = state.devices.filter(d => ids.includes(d.id) && d.secure);
    if (!found.length) throw new HttpError(404, 'I couldn’t find that lock or door.');
    const verb = ['lock', 'unlock', 'open', 'close'].includes(args.do) ? String(args.do) : 'lock';
    return {
      title: `${cap(verb)} ${found.map(d => d.name.toLowerCase()).join(', ')}`,
      lines: found.map(d => ({ label: d.name, value: d.kind === 'lock' ? (d.locked ? 'Locked now' : 'Unlocked now') : (d.on ? 'Open now' : 'Closed now') })),
      caution: [verb === 'unlock' || verb === 'open' ? 'Anyone at the door can walk in once this runs.' : '', state.sample ? 'This is the sample home: nothing real changes.' : ''].filter(Boolean).join(' ') || undefined,
      payload: { ids: found.map(d => d.id), do: verb },
    };
  },
  async run(p) {
    const c: Change = p.do === 'lock' || p.do === 'unlock' ? { lock: p.do === 'lock' } : { position: p.do === 'open' ? 100 : 0 };
    return (await change(p.ids, c, '', true)).text;
  },
} satisfies Spec);
