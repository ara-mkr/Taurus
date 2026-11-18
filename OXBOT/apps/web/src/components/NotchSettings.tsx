import { useEffect, useState } from 'react';

// Settings > Notch (owner, November 17, 2026: "the settings shouldnt all js show up in the notch it should open up to
// the oxbot app and theres all ther settings"). Every setting of Ox's notch, the native one ported from Vorssaint
// (apps/notch-mac) and the Electron one it falls back to. Only in the desktop app, which keeps them in
// ~/.oxbot/desktop.json and applies each change straight away.

type Native = {
  size: 'compact' | 'spacious' | 'custom'; customWidth: number; customHeight: number; glass: boolean; shape: 'capsule' | 'notch';
  capsuleWidth: number; capsuleHeight: number; capsuleDrop: number; cameraWidth: number; cameraHeight: number; outline: boolean;
  agents: string[]; limitDisplay: 'remaining' | 'used'; limitFocus: 'mostUsed' | 'session' | 'weekly'; live: boolean;
  readout: 'elapsed' | 'tokens' | 'limit'; finishAlert: boolean; finishMinimum: number; limitAlert: boolean; limitThreshold: number;
};
type Settings = {
  on: boolean; display: 'automatic' | 'builtin' | 'main' | 'all'; open: 'hover' | 'click'; hoverDelay: number; closeDelay: number;
  mascotSide: 'left' | 'right'; idle: 'ox' | 'nothing'; show: { answer: boolean; music: boolean; timers: boolean; ask: boolean };
  overFullScreen: boolean; inCaptures: boolean; noNotch: 'pill' | 'hidden'; native?: Partial<Native>; nativeNotch?: boolean;
};
type Bridge = { get(): Promise<Settings | null>; set(partial: Partial<Settings>): Promise<Settings | null> };

// The same defaults as apps/notch-mac (Model.swift, NotchSettings.Native).
const nativeDefaults: Native = {
  size: 'spacious', customWidth: 440, customHeight: 480, glass: false, shape: 'capsule', capsuleWidth: 0, capsuleHeight: 0, capsuleDrop: 0,
  cameraWidth: 0, cameraHeight: 0, outline: false, agents: ['claude', 'codex', 'opencode', 'copilot'], limitDisplay: 'remaining',
  limitFocus: 'mostUsed', live: true, readout: 'elapsed', finishAlert: true, finishMinimum: 1, limitAlert: true, limitThreshold: 90,
};
const agentNames: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', copilot: 'GitHub Copilot' };

function Choice<T extends string | number | boolean>({ legend, name, value, options, onPick }: { legend: string; name: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return <fieldset className="choice">
    <legend>{legend}</legend>
    <div className="bg-kinds">{options.map(([v, label]) => <label key={String(v)} className="check"><input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} />{label}</label>)}</div>
  </fieldset>;
}

function Range({ label, value, min, max, step, unit, onPick }: { label: string; value: number; min: number; max: number; step: number; unit: string; onPick: (v: number) => void }) {
  return <label className="range">{label} <span className="muted">{step < 1 ? value.toFixed(2) : value}{unit}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onPick(Number(e.target.value))} />
  </label>;
}

export function NotchPage() {
  const bridge = (window as { oxbotDesktop?: { notch?: Bridge } }).oxbotDesktop?.notch;
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => { void bridge?.get().then(setS).catch(() => undefined); }, [bridge]);

  if (!bridge) return <main id="main" tabIndex={-1} className="settings-page">
    <div className="page-head"><h1>Notch</h1></div>
    <p className="muted">Ox’s notch is part of OXBOT’s desktop app on your Mac. Open OXBOT there to change it.</p>
  </main>;
  if (!s) return <main id="main" tabIndex={-1} className="settings-page"><div className="page-head"><h1>Notch</h1></div><p className="muted">Loading</p></main>;

  const save = (partial: Partial<Settings>) => { setS({ ...s, ...partial }); void bridge.set(partial).then(next => { if (next) setS(next); }); };
  const n: Native = { ...nativeDefaults, ...(s.native ?? {}) };
  const setN = (partial: Partial<Native>) => save({ native: { ...n, ...partial } });
  const without = s.noNotch === 'hidden' ? 'nothing' : n.shape;

  return <main id="main" tabIndex={-1} className="settings-page">
    <div className="page-head"><h1>Notch</h1></div>
    <p className="muted">{s.nativeNotch ? 'Ox’s native notch is running. Changes show straight away.' : 'Changes show straight away in Ox’s notch.'}</p>

    <fieldset className="choice">
      <legend>Ox in the notch</legend>
      <label className="check"><input type="checkbox" checked={s.on} onChange={e => save({ on: e.target.checked })} />Show Ox at the top of the screen</label>
    </fieldset>
    <Choice legend="Screens" name="display" value={s.display} onPick={display => save({ display })}
      options={[['automatic', 'Automatic: the notched screen, else the main one'], ['builtin', 'Built-in'], ['main', 'Main'], ['all', 'Every screen']]} />
    <Choice legend="Screens without a notch" name="without" value={without} onPick={v => v === 'nothing' ? save({ noNotch: 'hidden' }) : save({ noNotch: 'pill', native: { ...n, shape: v } })}
      options={[['capsule', 'A capsule in the menu bar'], ['notch', 'A notch shape from the top edge'], ['nothing', 'Nothing']]} />
    <fieldset className="choice">
      <legend>Opening</legend>
      <div className="bg-kinds">{(['hover', 'click'] as const).map(o => <label key={o} className="check"><input type="radio" name="open" checked={s.open === o} onChange={() => save({ open: o })} />{o === 'hover' ? 'On hover' : 'On click'}</label>)}</div>
      <Range label="Open after" value={s.hoverDelay / 1000} min={0.1} max={1} step={0.05} unit=" s" onPick={v => save({ hoverDelay: Math.round(v * 1000) })} />
      <Range label="Close after" value={s.closeDelay / 1000} min={0.1} max={2} step={0.05} unit=" s" onPick={v => save({ closeDelay: Math.round(v * 1000) })} />
    </fieldset>
    <fieldset className="choice">
      <legend>Size when open</legend>
      <div className="bg-kinds">{(['compact', 'spacious', 'custom'] as const).map(z => <label key={z} className="check"><input type="radio" name="size" checked={n.size === z} onChange={() => setN({ size: z })} />{z === 'compact' ? 'Compact' : z === 'spacious' ? 'Spacious' : 'Custom'}</label>)}</div>
      {n.size === 'custom' && <>
        <Range label="Width" value={n.customWidth} min={360} max={600} step={10} unit=" pt" onPick={customWidth => setN({ customWidth })} />
        <Range label="Maximum height" value={n.customHeight} min={260} max={640} step={10} unit=" pt" onPick={customHeight => setN({ customHeight })} />
      </>}
    </fieldset>
    <fieldset className="choice">
      <legend>Look</legend>
      <div className="bg-kinds">{([false, true] as const).map(g => <label key={String(g)} className="check"><input type="radio" name="glass" checked={n.glass === g} onChange={() => setN({ glass: g })} />{g ? 'Glass' : 'Black'}</label>)}</div>
      <label className="check"><input type="checkbox" checked={n.outline} onChange={e => setN({ outline: e.target.checked })} />Outline</label>
      <div className="bg-kinds">{(['left', 'right'] as const).map(side => <label key={side} className="check"><input type="radio" name="side" checked={s.mascotSide === side} onChange={() => save({ mascotSide: side })} />Ox on the {side}</label>)}</div>
      <label className="check"><input type="checkbox" checked={s.idle === 'ox'} onChange={e => save({ idle: e.target.checked ? 'ox' : 'nothing' })} />Show Ox while nothing is happening</label>
      <label className="check"><input type="checkbox" checked={s.overFullScreen} onChange={e => save({ overFullScreen: e.target.checked })} />Over full-screen apps</label>
      <label className="check"><input type="checkbox" checked={s.inCaptures} onChange={e => save({ inCaptures: e.target.checked })} />In screenshots and screen sharing</label>
    </fieldset>
    <fieldset className="choice">
      <legend>Fit</legend>
      <p className="muted">Nudge these until no edge of the real camera housing, or the menu bar, shows around Ox.</p>
      <Range label="Camera width" value={n.cameraWidth} min={-10} max={10} step={1} unit=" pt" onPick={cameraWidth => setN({ cameraWidth })} />
      <Range label="Camera height" value={n.cameraHeight} min={-6} max={6} step={0.5} unit=" pt" onPick={cameraHeight => setN({ cameraHeight })} />
      {without === 'capsule' && <>
        <Range label="Capsule width" value={n.capsuleWidth} min={-40} max={40} step={1} unit=" pt" onPick={capsuleWidth => setN({ capsuleWidth })} />
        <Range label="Capsule height" value={n.capsuleHeight} min={-4} max={4} step={1} unit=" pt" onPick={capsuleHeight => setN({ capsuleHeight })} />
        <Range label="Capsule from the top" value={n.capsuleDrop} min={0} max={20} step={1} unit=" pt" onPick={capsuleDrop => setN({ capsuleDrop })} />
      </>}
    </fieldset>
    <fieldset className="choice">
      <legend>What it shows</legend>
      {(['answer', 'music', 'timers', 'ask'] as const).map(k => <label key={k} className="check"><input type="checkbox" checked={s.show[k]} onChange={e => save({ show: { ...s.show, [k]: e.target.checked } })} />{{ answer: 'Ox’s answers', music: 'Now playing', timers: 'Timers', ask: 'Ask' }[k]}</label>)}
    </fieldset>
    <fieldset className="choice">
      <legend>Agents</legend>
      {Object.keys(agentNames).map(a => <label key={a} className="check"><input type="checkbox" checked={n.agents.includes(a)} onChange={e => setN({ agents: e.target.checked ? [...n.agents, a] : n.agents.filter(x => x !== a) })} />{agentNames[a]}</label>)}
      <p className="muted">Read from the logs these apps keep on this Mac. Nothing is copied or sent.</p>
      <label className="check"><input type="checkbox" checked={n.live} onChange={e => setN({ live: e.target.checked })} />Show a working agent in the closed notch</label>
    </fieldset>
    <Choice legend="Beside a working agent’s logo" name="readout" value={n.readout} onPick={readout => setN({ readout })}
      options={[['elapsed', 'How long it has worked'], ['tokens', 'Tokens today'], ['limit', 'Its plan limit']]} />
    <Choice legend="Plan limits" name="limitDisplay" value={n.limitDisplay} onPick={limitDisplay => setN({ limitDisplay })} options={[['remaining', 'What’s left'], ['used', 'What’s used']]} />
    <Choice legend="Which limit" name="limitFocus" value={n.limitFocus} onPick={limitFocus => setN({ limitFocus })} options={[['mostUsed', 'The most used'], ['session', 'The 5-hour window'], ['weekly', 'The week']]} />
    <fieldset className="choice">
      <legend>Notices</legend>
      <label className="check"><input type="checkbox" checked={n.finishAlert} onChange={e => setN({ finishAlert: e.target.checked })} />When an agent finishes</label>
      {n.finishAlert && <div className="bg-kinds">{[0, 1, 5, 15].map(m => <label key={m} className="check"><input type="radio" name="finishMinimum" checked={n.finishMinimum === m} onChange={() => setN({ finishMinimum: m })} />{m === 0 ? 'Any turn' : `After ${m} min`}</label>)}</div>}
      <label className="check"><input type="checkbox" checked={n.limitAlert} onChange={e => setN({ limitAlert: e.target.checked })} />When a plan is nearly used</label>
      {n.limitAlert && <div className="bg-kinds">{[75, 90, 95].map(t => <label key={t} className="check"><input type="radio" name="limitThreshold" checked={n.limitThreshold === t} onChange={() => setN({ limitThreshold: t })} />At {t}%</label>)}</div>}
    </fieldset>
  </main>;
}
