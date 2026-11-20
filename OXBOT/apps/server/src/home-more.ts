import { createHmac, randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { Socket } from 'node:net';
import { api, HttpError, store } from './store.ts';
import type { Device, DeviceKind } from './types.ts';

// More of the house (owner, November 6, 2026: "for the home it should be abe to connect to more than just a few things
// like make it connect to all the smart plugs and that kinda dtuff, lights, govee, automatic curtains, all that
// stuff"). Seven more brands, each with the owner's own key or on the home network:
//   Govee        cloud Developer API (key from the Govee Home app): lights, strips, plugs, fans, heaters, purifiers
//   SwitchBot    cloud API v1.1 (token and secret from the app): Curtain, Roller Shade, Blind Tilt, Plug, Bot, bulbs
//   SmartThings  cloud API (personal access token): anything in SmartThings, including Matter and Zigbee devices
//   Shelly       each device's local RPC API (Gen2 and later): relays, plugs, dimmers, roller-shutter covers
//   Nanoleaf     the panels' local API (token from holding the power button): power, brightness, colour, effects
//   WiZ          each bulb's local UDP API (port 38899): power, brightness, colour, white
//   Yeelight     each bulb's local LAN control (port 55443, switched on in the Yeelight app)
// Everything else (Kasa, Tuya and Smart Life, Wemo, Meross, Ecobee, Nest, Lutron, Aqara, Somfy, IKEA, Matter) comes in
// through Home Assistant. The same rules as home.ts: lights, plugs, curtains and fans change when asked; locks never
// change here. Built from each provider's published documentation and tested only against mocked responses.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
export interface Change { on?: boolean; brightness?: number; rgb?: [number, number, number]; kelvin?: number; position?: number; target?: number; lock?: boolean; activate?: boolean }
export interface Provider { id: string; name: string; prefix: string; ready: () => boolean; pull: () => Promise<Device[]>; set: (d: Device, c: Change) => Promise<unknown> }

const rgbInt = ([r, g, b]: number[]) => (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
// "Desk lamp=192.168.1.20" lines, or bare addresses.
export const hostList = (raw = '') => raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(line => {
  const [a, b] = line.includes('=') ? line.split('=') : ['', line];
  const host = (b ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return { name: a.trim() || host, host };
}).filter(h => /^[a-z0-9.-]+(:\d+)?$/i.test(h.host)).slice(0, 40);

// ---------- Govee ----------

const GOVEE = 'https://openapi.api.govee.com/router/api/v1';
const govee = <T>(path: string, body?: unknown) => api<T>(`${GOVEE}/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Govee-API-Key': store.secret('GOVEE_API_KEY') ?? '', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const goveeKind = (type = ''): DeviceKind => /light/.test(type) ? 'light' : /socket|plug/.test(type) ? 'switch' : /fan|purifier/.test(type) ? 'fan' : /heater|thermostat/.test(type) ? 'climate' : 'switch';
const goveeP: Provider = {
  id: 'govee', name: 'Govee', prefix: 'govee:', ready: () => Boolean(store.secret('GOVEE_API_KEY')),
  async pull() {
    const r = await govee<any>('user/devices');
    return (r.data ?? []).map((d: any): Device => ({ id: `govee:${d.sku}|${d.device}`, name: String(d.deviceName || d.sku), room: 'Home', source: 'Govee', kind: goveeKind(d.type) }));
  },
  async set(d, c) {
    const [sku, device] = d.id.slice(6).split('|');
    const send = (type: string, instance: string, value: unknown) => govee('device/control', { requestId: randomUUID(), payload: { sku, device, capability: { type, instance, value } } });
    if (c.on === false) return send('devices.capabilities.on_off', 'powerSwitch', 0);
    if (c.brightness !== undefined) await send('devices.capabilities.range', 'brightness', clamp(c.brightness, 1, 100));
    if (c.rgb) await send('devices.capabilities.color_setting', 'colorRgb', rgbInt(c.rgb));
    if (c.kelvin) await send('devices.capabilities.color_setting', 'colorTemperatureK', clamp(c.kelvin, 2000, 9000));
    if (c.on || (c.brightness === undefined && !c.rgb && !c.kelvin)) return send('devices.capabilities.on_off', 'powerSwitch', 1);
  },
};

// ---------- SwitchBot ----------

// Every request is signed: HMAC-SHA256 of token + time + nonce with your secret, base64, upper case.
export function switchbotHeaders(token: string, secret: string, t = Date.now(), nonce: string = randomUUID()) {
  const sign = createHmac('sha256', secret).update(`${token}${t}${nonce}`).digest('base64').toUpperCase();
  return { Authorization: token, sign, t: String(t), nonce, 'Content-Type': 'application/json; charset=utf8' };
}
const switchbot = <T>(path: string, body?: unknown) => api<T>(`https://api.switch-bot.com/v1.1/${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: switchbotHeaders(store.secret('SWITCHBOT_TOKEN') ?? '', store.secret('SWITCHBOT_SECRET') ?? ''), body: body === undefined ? undefined : JSON.stringify(body),
});
const sbKind = (type = ''): DeviceKind | undefined => /curtain|shade|blind|roller/i.test(type) ? 'cover' : /bulb|strip|light/i.test(type) ? 'light' : /plug|bot|relay|switch/i.test(type) ? 'switch' : /fan/i.test(type) ? 'fan' : /lock/i.test(type) ? 'lock' : undefined;
const switchbotP: Provider = {
  id: 'switchbot', name: 'SwitchBot', prefix: 'switchbot:', ready: () => Boolean(store.secret('SWITCHBOT_TOKEN') && store.secret('SWITCHBOT_SECRET')),
  async pull() {
    const r = await switchbot<any>('devices');
    if (r.statusCode !== undefined && r.statusCode !== 100) throw new HttpError(409, `SwitchBot: ${r.message ?? r.statusCode}`);
    return (r.body?.deviceList ?? []).flatMap((d: any): Device[] => {
      const kind = sbKind(d.deviceType); if (!kind) return [];
      return [{ id: `switchbot:${d.deviceId}`, name: String(d.deviceName), room: 'Home', source: 'SwitchBot', kind, ...(kind === 'lock' ? { secure: true } : {}), reading: d.deviceType }];
    });
  },
  async set(d, c) {
    const id = d.id.slice(10);
    const cmd = (command: string, parameter: unknown = 'default') => switchbot(`devices/${id}/commands`, { command, parameter, commandType: 'command' });
    if (d.kind === 'cover') {
      // SwitchBot counts 0 as open; Taurus counts 0 as closed.
      const to = c.position ?? (c.on ? 100 : 0);
      return /blind tilt/i.test(d.reading ?? '') ? cmd('setPosition', `up;${clamp(to, 0, 100)}`) : cmd('setPosition', `0,ff,${clamp(100 - to, 0, 100)}`);
    }
    if (c.on === false) return cmd('turnOff');
    if (c.brightness !== undefined && d.kind === 'light') await cmd('setBrightness', clamp(c.brightness, 1, 100));
    if (c.rgb && d.kind === 'light') await cmd('setColor', c.rgb.map(v => clamp(v, 0, 255)).join(':'));
    if (c.kelvin && d.kind === 'light') await cmd('setColorTemperature', clamp(c.kelvin, 2700, 6500));
    if (d.reading === 'Bot') return cmd('press');
    return cmd('turnOn');
  },
};

// ---------- SmartThings ----------

const st = <T>(path: string, body?: unknown) => api<T>(`https://api.smartthings.com/v1/${path}`, { method: body === undefined ? 'GET' : 'POST', token: store.secret('SMARTTHINGS_TOKEN'), headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
function stKind(caps: string[]): DeviceKind | undefined {
  if (caps.includes('lock')) return 'lock';
  if (caps.includes('windowShade') || caps.includes('windowShadeLevel')) return 'cover';
  if (caps.includes('thermostatHeatingSetpoint') || caps.includes('thermostatCoolingSetpoint') || caps.includes('thermostatMode')) return 'climate';
  if (caps.includes('fanSpeed')) return 'fan';
  if (caps.includes('colorControl') || caps.includes('colorTemperature') || (caps.includes('switchLevel') && caps.includes('switch'))) return 'light';
  if (caps.includes('switch')) return 'switch';
  return undefined;
}
// SmartThings wants hue and saturation in percent.
function hueSat([r, g, b]: number[]): [number, number] {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [Math.round(((h * 60 + 360) % 360) / 3.6), Math.round(max ? (d / max) * 100 : 0)];
}
const smartthingsP: Provider = {
  id: 'smartthings', name: 'SmartThings', prefix: 'st:', ready: () => Boolean(store.secret('SMARTTHINGS_TOKEN')),
  async pull() {
    const [devices, rooms] = await Promise.all([st<any>('devices'), st<any>('locations').then(async l => {
      const names = new Map<string, string>();
      for (const loc of (l.items ?? []).slice(0, 3)) for (const r of (await st<any>(`locations/${loc.locationId}/rooms`).catch(() => ({ items: [] }))).items ?? []) names.set(r.roomId, r.name);
      return names;
    }).catch(() => new Map<string, string>())]);
    const list = (devices.items ?? []).flatMap((d: any) => {
      const caps = (d.components?.find((x: any) => x.id === 'main')?.capabilities ?? []).map((x: any) => x.id);
      const kind = stKind(caps); return kind ? [{ d, kind }] : [];
    }).slice(0, 40);
    return Promise.all(list.map(async ({ d, kind }: { d: any; kind: DeviceKind }): Promise<Device> => {
      const s = await st<any>(`devices/${d.deviceId}/status`).then(x => x.components?.main ?? {}).catch(() => ({}));
      const base = { id: `st:${d.deviceId}`, name: String(d.label || d.name), room: rooms.get(d.roomId) ?? 'Home', source: 'SmartThings', kind };
      if (kind === 'lock') return { ...base, locked: s.lock?.lock?.value === 'locked', secure: true };
      if (kind === 'cover') return { ...base, position: s.windowShadeLevel?.shadeLevel?.value ?? (s.windowShade?.windowShade?.value === 'open' ? 100 : 0), on: s.windowShade?.windowShade?.value !== 'closed' };
      if (kind === 'climate') return { ...base, temperature: s.temperatureMeasurement?.temperature?.value, target: s.thermostatHeatingSetpoint?.heatingSetpoint?.value ?? s.thermostatCoolingSetpoint?.coolingSetpoint?.value, unit: '°', on: s.thermostatMode?.thermostatMode?.value !== 'off' };
      return { ...base, on: s.switch?.switch?.value === 'on', brightness: s.switchLevel?.level?.value };
    }));
  },
  async set(d, c) {
    const commands: { component: string; capability: string; command: string; arguments?: unknown[] }[] = [];
    const add = (capability: string, command: string, args?: unknown[]) => commands.push({ component: 'main', capability, command, ...(args ? { arguments: args } : {}) });
    if (d.kind === 'cover') { const to = c.position ?? (c.on ? 100 : 0); if (to > 0 && to < 100) add('windowShadeLevel', 'setShadeLevel', [to]); else add('windowShade', to > 0 ? 'open' : 'close'); }
    else if (d.kind === 'climate' && c.target !== undefined) add('thermostatHeatingSetpoint', 'setHeatingSetpoint', [c.target]);
    else if (c.on === false) add('switch', 'off');
    else {
      if (c.brightness !== undefined) add('switchLevel', 'setLevel', [clamp(c.brightness, 0, 100)]);
      if (c.kelvin) add('colorTemperature', 'setColorTemperature', [clamp(c.kelvin, 2000, 6500)]);
      if (c.rgb) { const [h, s] = hueSat(c.rgb); add('colorControl', 'setColor', [{ hue: h, saturation: s }]); }
      add('switch', 'on');
    }
    return st(`devices/${d.id.slice(3)}/commands`, { commands });
  },
};

// ---------- Shelly (local, Gen2 and later) ----------

const shellyGet = <T>(host: string, method: string, params: Record<string, string | number | boolean> = {}) =>
  api<T>(`http://${host}/rpc/${method}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`, { signal: AbortSignal.timeout(4000) });
const shellyP: Provider = {
  id: 'shelly', name: 'Shelly', prefix: 'shelly:', ready: () => hostList(store.secret('SHELLY_HOSTS')).length > 0,
  async pull() {
    const out: Device[] = [];
    await Promise.all(hostList(store.secret('SHELLY_HOSTS')).map(async ({ name, host }) => {
      const s = await shellyGet<any>(host, 'Shelly.GetStatus').catch(() => undefined);
      if (!s) return;
      for (const key of Object.keys(s)) {
        const [kind, n] = key.split(':'); const v = s[key];
        if (!['switch', 'light', 'cover'].includes(kind)) continue;
        const label = Object.keys(s).filter(k => k.startsWith(`${kind}:`)).length > 1 ? `${name} ${Number(n) + 1}` : name;
        const base = { id: `shelly:${host}|${kind}|${n}`, name: label, room: 'Home', source: 'Shelly' };
        if (kind === 'switch') out.push({ ...base, kind: 'switch', on: Boolean(v.output) });
        if (kind === 'light') out.push({ ...base, kind: 'light', on: Boolean(v.output), brightness: v.brightness });
        if (kind === 'cover') out.push({ ...base, kind: 'cover', position: v.current_pos ?? (v.state === 'open' ? 100 : 0), on: v.state !== 'closed' });
      }
    }));
    return out;
  },
  async set(d, c) {
    const [host, kind, id] = d.id.slice(7).split('|');
    if (kind === 'cover') { const to = c.position ?? (c.on ? 100 : 0); return to > 0 && to < 100 ? shellyGet(host, 'Cover.GoToPosition', { id, pos: to }) : shellyGet(host, to > 0 ? 'Cover.Open' : 'Cover.Close', { id }); }
    if (kind === 'light') return shellyGet(host, 'Light.Set', { id, on: c.on !== false, ...(c.brightness !== undefined ? { brightness: clamp(c.brightness, 0, 100) } : {}) });
    return shellyGet(host, 'Switch.Set', { id, on: c.on !== false });
  },
};

// ---------- Nanoleaf (local) ----------

const nanoBase = () => `http://${hostList(store.secret('NANOLEAF_HOST'))[0]?.host.replace(/:\d+$/, '') ?? ''}:16021/api/v1/${encodeURIComponent(store.secret('NANOLEAF_TOKEN') ?? '')}`;
const nano = <T>(path: string, body?: unknown) => api<T>(`${nanoBase()}${path}`, { method: body === undefined ? 'GET' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000) });
const nanoleafP: Provider = {
  id: 'nanoleaf', name: 'Nanoleaf', prefix: 'nanoleaf', ready: () => Boolean(store.secret('NANOLEAF_HOST') && store.secret('NANOLEAF_TOKEN')),
  async pull() {
    const info = await nano<any>('/');
    return [
      { id: 'nanoleaf:panels', name: String(info.name ?? 'Nanoleaf'), room: 'Home', source: 'Nanoleaf', kind: 'light' as const, on: Boolean(info.state?.on?.value), brightness: info.state?.brightness?.value },
      ...((info.effects?.effectsList ?? []) as string[]).slice(0, 12).map(e => ({ id: `nanoleaf-scene:${e}`, name: e, room: 'Home', source: 'Nanoleaf', kind: 'scene' as const })),
    ];
  },
  async set(d, c) {
    if (d.kind === 'scene') return nano('/effects', { select: d.id.slice(15) });
    const state: Record<string, unknown> = { on: { value: c.on !== false } };
    if (c.brightness !== undefined) state.brightness = { value: clamp(c.brightness, 0, 100) };
    if (c.kelvin) state.ct = { value: clamp(c.kelvin, 1200, 6500) };
    if (c.rgb) { const [h, s] = hueSat(c.rgb); state.hue = { value: Math.round(h * 3.6) }; state.sat = { value: s }; }
    return nano('/state', state);
  },
};

// ---------- WiZ (local UDP) ----------

export function wizSend(host: string, message: object, timeoutMs = 1500): Promise<any> {
  return new Promise((resolve, reject) => {
    const sock = createSocket('udp4');
    const timer = setTimeout(() => { sock.close(); reject(new HttpError(504, `No answer from ${host}.`)); }, timeoutMs);
    sock.on('message', m => { clearTimeout(timer); sock.close(); try { resolve(JSON.parse(String(m))); } catch { resolve({}); } });
    sock.on('error', e => { clearTimeout(timer); sock.close(); reject(e); });
    sock.send(JSON.stringify(message), 38899, host.replace(/:\d+$/, ''));
  });
}
const wizP: Provider = {
  id: 'wiz', name: 'WiZ', prefix: 'wiz:', ready: () => hostList(store.secret('WIZ_HOSTS')).length > 0,
  async pull() {
    const found = await Promise.all(hostList(store.secret('WIZ_HOSTS')).map(async ({ name, host }) => {
      const r = await wizSend(host, { method: 'getPilot', params: {} }).catch(() => undefined);
      return r ? [{ id: `wiz:${host}`, name, room: 'Home', source: 'WiZ', kind: 'light' as const, on: Boolean(r.result?.state), brightness: r.result?.dimming }] : [];
    }));
    return found.flat();
  },
  set(d, c) {
    const params: Record<string, unknown> = { state: c.on !== false };
    if (c.brightness !== undefined) params.dimming = clamp(c.brightness, 10, 100);
    if (c.rgb) Object.assign(params, { r: clamp(c.rgb[0], 0, 255), g: clamp(c.rgb[1], 0, 255), b: clamp(c.rgb[2], 0, 255) });
    if (c.kelvin) params.temp = clamp(c.kelvin, 2200, 6500);
    return wizSend(d.id.slice(4), { method: 'setPilot', params });
  },
};

// ---------- Yeelight (local LAN control) ----------

export function yeelightSend(host: string, method: string, params: unknown[], timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const sock = new Socket();
    let buf = '';
    const timer = setTimeout(() => done(() => reject(new HttpError(504, `No answer from ${host}.`))), timeoutMs);
    function done(fn: () => void) { clearTimeout(timer); sock.destroy(); fn(); }
    sock.on('data', d => { buf += d; const line = buf.split('\r\n').find(l => l.includes('"id":1')); if (line) done(() => { try { resolve(JSON.parse(line)); } catch { resolve({}); } }); });
    sock.on('error', e => done(() => reject(e)));
    sock.connect(55443, host.replace(/:\d+$/, ''), () => sock.write(`${JSON.stringify({ id: 1, method, params })}\r\n`));
  });
}
const yeelightP: Provider = {
  id: 'yeelight', name: 'Yeelight', prefix: 'yeelight:', ready: () => hostList(store.secret('YEELIGHT_HOSTS')).length > 0,
  async pull() {
    const found = await Promise.all(hostList(store.secret('YEELIGHT_HOSTS')).map(async ({ name, host }) => {
      const r = await yeelightSend(host, 'get_prop', ['power', 'bright']).catch(() => undefined);
      return r ? [{ id: `yeelight:${host}`, name, room: 'Home', source: 'Yeelight', kind: 'light' as const, on: r.result?.[0] === 'on', brightness: Number(r.result?.[1]) || undefined }] : [];
    }));
    return found.flat();
  },
  async set(d, c) {
    const host = d.id.slice(9);
    if (c.on === false) return yeelightSend(host, 'set_power', ['off', 'smooth', 300]);
    await yeelightSend(host, 'set_power', ['on', 'smooth', 300]);
    if (c.brightness !== undefined) await yeelightSend(host, 'set_bright', [clamp(c.brightness, 1, 100), 'smooth', 300]);
    if (c.rgb) await yeelightSend(host, 'set_rgb', [rgbInt(c.rgb), 'smooth', 300]);
    if (c.kelvin) await yeelightSend(host, 'set_ct_abx', [clamp(c.kelvin, 1700, 6500), 'smooth', 300]);
  },
};

export const moreHome: Provider[] = [goveeP, switchbotP, smartthingsP, shellyP, nanoleafP, wizP, yeelightP];
