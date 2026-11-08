import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, type ConnectorInfo, type Device, type Grant, type HomeState, type Proposal } from '../api';
import { Connector } from './Connections';

// House (owner, November 5, 2026: "connect it to like smart lights or curtains to make it like a smart home controlled
// by ox"). Every light, curtain, plug, fan, thermostat and lock, by room, with the scenes on top. A tap changes it at
// once; locks and garage doors open an approval card instead. Say it to Ox and the same tiles pop up in a window.

const word = (d: Device) => {
  switch (d.kind) {
    case 'light': case 'fan': return d.on ? (d.brightness !== undefined ? `On, ${d.brightness}%` : 'On') : 'Off';
    case 'cover': return (d.position ?? 0) >= 100 ? 'Open' : (d.position ?? 0) <= 0 ? 'Closed' : `${d.position}% open`;
    case 'climate': return d.temperature !== undefined ? `${Math.round(d.temperature)}° now` : d.reading ?? '';
    case 'lock': return d.locked ? 'Locked' : 'Unlocked';
    case 'media': return d.on ? d.reading || 'On' : 'Off';
    case 'sensor': return d.reading ?? '';
    default: return d.on ? 'On' : 'Off';
  }
};
const toggles = (d: Device) => d.kind === 'light' || d.kind === 'switch' || d.kind === 'fan' || d.kind === 'media' || (d.kind === 'cover' && !d.secure);
const isOn = (d: Device) => d.kind === 'cover' ? (d.position ?? 0) > 0 : Boolean(d.on);
// A light that's on lights its own tile in its own colour: the colour is the state.
const glow = (d: Device): CSSProperties | undefined => d.kind === 'light' && d.on ? { '--lamp': d.color ?? '#ffd9a0', '--lamp-strength': `${Math.round(16 + (d.brightness ?? 100) * 0.3)}%` } as CSSProperties : undefined;

type Change = { on?: boolean; brightness?: number; position?: number; target?: number; activate?: boolean };
type Send = (ids: string[], change: Change) => Promise<void>;
const patch = (d: Device, c: Change): Device => ({
  ...d, ...(c.on !== undefined ? { on: c.on } : {}), ...(c.brightness !== undefined ? { brightness: c.brightness, on: true } : {}),
  ...(c.position !== undefined ? { position: c.position, on: c.position > 0 } : {}), ...(c.target !== undefined ? { target: c.target } : {}),
});
const secureVerb = (d: Device) => d.kind === 'lock' ? (d.locked ? 'unlock' : 'lock') : (d.on ? 'close' : 'open');

// One device, as a glass tile. The name and state is the button; a slider or two buttons sit under it.
export function DeviceTile({ d, send, onSecure, compact = false }: { d: Device; send: Send; onSecure: (d: Device) => void; compact?: boolean }) {
  const [level, setLevel] = useState<number | null>(null);
  const timer = useRef(0);
  const slide = (value: number, key: 'brightness' | 'position') => {
    setLevel(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void send([d.id], { [key]: value }).finally(() => setLevel(null)); }, 220);
  };
  const shownLevel = level ?? (d.kind === 'cover' ? d.position ?? 0 : d.brightness ?? 100);
  const flip = () => d.kind === 'cover' ? send([d.id], { position: (d.position ?? 0) > 0 ? 0 : 100 }) : send([d.id], { on: !d.on });
  return <article className={`tile tile-${d.kind} ${isOn(d) ? 'is-on' : ''} ${compact ? 'compact' : ''}`} style={glow(d)}>
    {toggles(d) ? <button type="button" className="tile-main" aria-pressed={isOn(d)} onClick={() => void flip()}>
      <span className="tile-name">{d.name}</span>
      <span className="tile-state">{word(d)}</span>
    </button> : <div className="tile-main">
      <span className="tile-name">{d.name}</span>
      <span className={`tile-state ${d.kind === 'lock' && !d.locked ? 'problem' : ''}`}>{word(d)}</span>
    </div>}
    {(d.kind === 'light' || d.kind === 'fan') && d.on && <input className="tile-slider" type="range" min={1} max={100} value={shownLevel} aria-label={`${d.name} ${d.kind === 'fan' ? 'speed' : 'brightness'}`} onChange={e => slide(Number(e.target.value), 'brightness')} />}
    {d.kind === 'cover' && !d.secure && <input className="tile-slider" type="range" min={0} max={100} step={5} value={shownLevel} aria-label={`${d.name}, how far open`} onChange={e => slide(Number(e.target.value), 'position')} />}
    {d.kind === 'climate' && <div className="tile-row">
      <button type="button" onClick={() => void send([d.id], { target: (d.target ?? 70) - 1 })} aria-label={`${d.name} one degree cooler`}>Cooler</button>
      <span className="tile-target" aria-live="polite">{d.target !== undefined ? `Set ${d.target}°` : ''}</span>
      <button type="button" onClick={() => void send([d.id], { target: (d.target ?? 70) + 1 })} aria-label={`${d.name} one degree warmer`}>Warmer</button>
    </div>}
    {d.secure && <div className="tile-row"><button type="button" onClick={() => onSecure(d)}>{secureVerb(d).replace(/^./, c => c.toUpperCase())}</button></div>}
  </article>;
}

// The house, kept fresh, with each change shown before the hub confirms it.
export function useHome() {
  const [home, setHome] = useState<HomeState | null>(null);
  const [error, setError] = useState('');
  const load = useCallback((refresh = false) => api.home(refresh).then(h => { setHome(h); setError(''); }).catch(e => setError(e.message)), []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => window.clearInterval(t);
  }, [load]);
  const send: Send = useCallback(async (ids, change) => {
    setHome(h => h && { ...h, devices: h.devices.map(d => ids.includes(d.id) ? patch(d, change) : d) });
    try { const r = await api.homeChange({ ids, ...change }); setHome(r.home); setError(''); }
    catch (e) { setError((e as Error).message); void load(true); }
  }, [load]);
  return { home, error, send, load };
}

const asRow = (g: Grant): ConnectorInfo => ({
  id: g.id, name: g.name, group: 'Home', reads: g.does, auth: g.auth, mockOnly: true, connected: g.allowed, ready: g.ready, oneClick: false,
  missing: g.missing, fields: g.fields, setup: g.setup, setupUrl: g.setupUrl, redirectUri: g.redirectUri, lastError: g.lastError,
});

export function House({ onProposal }: { onProposal: (p: Proposal) => void }) {
  const { home, error, send, load } = useHome();
  const [hubs, setHubs] = useState<Grant[]>([]);
  const [note, setNote] = useState('');
  const [pairing, setPairing] = useState(false);
  const loadHubs = useCallback(() => api.actions().then(a => setHubs(a.grants.filter(g => g.app === 'Home' || g.id === 'mac-control'))).catch(() => undefined), []);
  useEffect(() => { void loadHubs(); }, [loadHubs]);

  const secure = (d: Device) => {
    api.secure([d.id], secureVerb(d)).then(r => { onProposal(r.proposal); setNote(`${r.proposal.title}: waiting for your OK.`); }).catch(e => setNote((e as Error).message));
  };
  const pair = () => {
    setPairing(true); setNote('');
    api.pairHue().then(r => { setNote(`Paired with the Hue bridge at ${r.bridge}.`); void loadHubs(); void load(true); }).catch(e => setNote((e as Error).message)).finally(() => setPairing(false));
  };

  const devices = home?.devices ?? [];
  const rooms = [...new Set(devices.map(d => d.room))].sort((a, b) => (a === 'Home' ? 1 : b === 'Home' ? -1 : a.localeCompare(b)));
  const lights = devices.filter(d => d.kind === 'light');
  const lit = lights.filter(d => d.on).length;
  const climate = devices.find(d => d.kind === 'climate');
  const locks = devices.filter(d => d.kind === 'lock');
  const summary = home ? [
    lit ? `${lit} light${lit === 1 ? '' : 's'} on.` : 'Every light is off.',
    climate?.temperature !== undefined ? `${Math.round(climate.temperature)}° inside.` : '',
    locks.length ? (locks.every(l => l.locked) ? `${locks.length === 1 ? locks[0].name : 'Every door'} locked.` : `${locks.filter(l => !l.locked).map(l => l.name).join(', ')} unlocked.`) : '',
  ].filter(Boolean).join(' ') : 'Looking around the house.';
  const mac = hubs.find(g => g.id === 'mac-control');

  return <main id="main" tabIndex={-1} className="connections house">
    <div className="page-head"><h1>House</h1>{home?.sample && <span className="muted">Sample</span>}</div>
    <p className="house-summary" aria-live="polite">{summary}</p>
    {home?.sample && <p className="lede muted">A sample house, so you can try it: tap a light, or say “Hey Ox, movie time”. Connect Home Assistant, Hue or LIFX below and these become your real rooms.</p>}
    {(error || note) && <p className={error ? 'problem' : 'muted'} role="status">{error || note}</p>}

    {(home?.scenes.length ?? 0) > 0 && <section aria-labelledby="h-scenes">
      <h2 id="h-scenes">Scenes</h2>
      <div className="house-scenes">
        {home!.scenes.map(s => <button key={s.id} type="button" className="scene" onClick={() => void send([s.id], { activate: true })}>{s.name}</button>)}
        {lights.length > 1 && <button type="button" className="scene" onClick={() => void send(lights.map(d => d.id), { on: lit === 0 })}>{lit ? 'All lights off' : 'All lights on'}</button>}
      </div>
    </section>}

    {rooms.map(room => <section key={room} aria-labelledby={`room-${room.replace(/\W+/g, '-')}`}>
      <h2 id={`room-${room.replace(/\W+/g, '-')}`}>{room}</h2>
      <div className="house-grid">{devices.filter(d => d.room === room).map(d => <DeviceTile key={d.id} d={d} send={send} onSecure={secure} />)}</div>
    </section>)}

    <section aria-labelledby="h-connect">
      <h2 id="h-connect">Connect your home</h2>
      <p className="muted house-note">Lights, plugs, curtains, fans, the thermostat and scenes change the moment you ask. Locks, garage doors and gates always wait for your OK.</p>
      {hubs.filter(g => g.id !== 'mac-control').map(g => <Connector key={g.id} c={asRow(g)} allow onChange={() => { void loadHubs(); void load(true); }} />)}
      <div className="house-pair">
        <button type="button" onClick={pair} disabled={pairing}>{pairing ? 'Looking for the bridge' : 'Pair a Hue bridge'}</button>
        <span className="muted">Press the round button on the bridge first.</span>
      </div>
      <details className="connector">
        <summary><span className="connector-name">Apple Home</span><span className={`connector-status ${mac?.allowed ? 'on' : ''}`}>{mac?.allowed ? 'Through Shortcuts' : 'Needs Control this Mac'}</span></summary>
        <div className="connector-body">
          <p>Apple doesn’t let other apps reach HomeKit directly, so Ox goes through Shortcuts. In the Shortcuts app, make a folder named Home and add a Shortcut for each scene (for “Movie time”: Control Home, then pick the scene). Each one shows up here as a scene, and Ox runs it when you say its name.</p>
          <p><a href="#actions">Allow Control this Mac</a> in Actions first.</p>
        </div>
      </details>
    </section>
  </main>;
}

// The tiles inside an Ox window. A new window remounts this (keyed by when it opened), so the list starts fresh.
export function DeviceList({ devices, sample }: { devices: Device[]; sample?: boolean }) {
  const [list, setList] = useState(devices);
  const [problem, setProblem] = useState('');
  const send: Send = async (ids, change) => {
    setList(l => l.map(d => ids.includes(d.id) ? patch(d, change) : d));
    try { const r = await api.homeChange({ ids, ...change }); setList(l => l.map(d => r.home.devices.find(x => x.id === d.id) ?? d)); setProblem(''); }
    catch (e) { setProblem((e as Error).message); }
  };
  const secure = (d: Device) => { api.secure([d.id], secureVerb(d)).catch(e => setProblem((e as Error).message)); };
  return <>
    <div className="oxwin-tiles">{list.slice(0, 4).map(d => <DeviceTile key={d.id} d={d} send={send} onSecure={secure} compact />)}</div>
    <div className="oxwin-actions">
      <a className="button" href="#house">All rooms</a>
      {sample && <span className="oxwin-sample muted">Sample house</span>}
    </div>
    {problem && <p className="oxwin-problem" role="alert">{problem}</p>}
  </>;
}
