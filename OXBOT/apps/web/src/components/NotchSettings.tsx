import { useEffect, useState } from 'react';

// Settings > Notch (owner, November 17, 2026: "the settings shouldnt all js show up in the notch it should open up to
// the oxbot app and theres all ther settings", then "same settings options"). Vorssaint's Dynamic Island settings, in
// its order and words (UI/Settings/NotchSettings.swift and NotchAgentsSettings.swift, GPL-3.0), for Ox's notch
// (apps/notch-mac), plus the few that are OXBOT's own. Only in the desktop app, which keeps them in
// ~/.oxbot/desktop.json and applies each change straight away.

type Native = {
  size: 'compact' | 'spacious' | 'custom'; customWidth: number; customHeight: number; glass: boolean; shape: 'capsule' | 'notch';
  capsuleWidth: number; capsuleHeight: number; capsuleDrop: number; cameraWidth: number; cameraHeight: number; outline: boolean;
  agents: string[]; limitDisplay: 'remaining' | 'used'; limitFocus: 'mostUsed' | 'session' | 'weekly'; live: boolean;
  readout: 'elapsed' | 'tokens' | 'limit'; finishAlert: boolean; finishMinimum: number; limitAlert: boolean; limitThreshold: number;
  resting: 'none' | 'music' | 'battery' | 'agents';
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
  limitFocus: 'mostUsed', live: true, readout: 'elapsed', finishAlert: true, finishMinimum: 1, limitAlert: true, limitThreshold: 90, resting: 'none',
};
const agentNames: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', copilot: 'GitHub Copilot' };

function Choice<T extends string | number | boolean>({ legend, name, value, options, onPick, hint }: { legend: string; name: string; value: T; options: [T, string][]; onPick: (v: T) => void; hint?: string }) {
  return <fieldset className="choice">
    <legend>{legend}</legend>
    <div className="bg-kinds">{options.map(([v, label]) => <label key={String(v)} className="check"><input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} />{label}</label>)}</div>
    {hint && <p className="muted">{hint}</p>}
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

  return <main id="main" tabIndex={-1} className="settings-page">
    <div className="page-head"><h1>Notch</h1></div>
    <fieldset className="choice">
      <legend>Dynamic Island</legend>
      <label className="check"><input type="checkbox" checked={s.on} onChange={e => save({ on: e.target.checked })} />Enable Dynamic Island</label>
      <p className="muted">Ox, your music, agents and everyday tools, together at the top of your screen.{s.nativeNotch ? ' The native notch is running; changes show straight away.' : ''}</p>
    </fieldset>

    <fieldset className="choice">
      <legend>Size</legend>
      <div className="bg-kinds">{(['compact', 'spacious', 'custom'] as const).map(z => <label key={z} className="check"><input type="radio" name="size" checked={n.size === z} onChange={() => setN({ size: z })} />{{ compact: 'Compact', spacious: 'Spacious', custom: 'Custom' }[z]}</label>)}</div>
      {n.size === 'custom' && <>
        <Range label="Width" value={n.customWidth} min={360} max={600} step={10} unit=" pt" onPick={customWidth => setN({ customWidth })} />
        <Range label="Maximum height" value={n.customHeight} min={260} max={640} step={10} unit=" pt" onPick={customHeight => setN({ customHeight })} />
      </>}
      <p className="muted">Controls stay compact. Longer lists use up to this height.</p>
    </fieldset>

    <fieldset className="choice">
      <legend>Background</legend>
      <label className="check"><input type="checkbox" checked={n.glass} onChange={e => setN({ glass: e.target.checked })} />Translucent background</label>
      <p className="muted">When open, Dynamic Island blurs what is behind it with the system’s own material.</p>
    </fieldset>

    <Choice legend="Displays without a notch" name="shape" value={s.noNotch === 'hidden' ? 'none' : n.shape}
      onPick={v => v === 'none' ? save({ noNotch: 'hidden' }) : save({ noNotch: 'pill', native: { ...n, shape: v } })}
      options={[['capsule', 'Pill'], ['notch', 'Notch'], ['none', 'Nothing']]} />
    {s.noNotch !== 'hidden' && n.shape === 'capsule' && <fieldset className="choice">
      <legend>Capsule fit</legend>
      <Range label="Width" value={n.capsuleWidth} min={-40} max={40} step={1} unit=" pt" onPick={capsuleWidth => setN({ capsuleWidth })} />
      <Range label="Height" value={n.capsuleHeight} min={-4} max={4} step={1} unit=" pt" onPick={capsuleHeight => setN({ capsuleHeight })} />
      <Range label="From top" value={n.capsuleDrop} min={0} max={20} step={1} unit=" pt" onPick={capsuleDrop => setN({ capsuleDrop })} />
      <p className="muted">Resizes the capsule and lowers it from the top of the screen on displays without a notch.</p>
    </fieldset>}

    <fieldset className="choice">
      <legend>Outline</legend>
      <label className="check"><input type="checkbox" checked={n.outline} onChange={e => setN({ outline: e.target.checked })} />Show outline</label>
    </fieldset>

    <fieldset className="choice">
      <legend>Notch fit</legend>
      <Range label="Width" value={n.cameraWidth} min={-10} max={10} step={1} unit=" pt" onPick={cameraWidth => setN({ cameraWidth })} />
      <Range label="Height" value={n.cameraHeight} min={-6} max={6} step={0.5} unit=" pt" onPick={cameraHeight => setN({ cameraHeight })} />
      <p className="muted">If an edge of the notch shows around Dynamic Island, adjust these values until it disappears.</p>
    </fieldset>

    <fieldset className="choice">
      <legend>At rest</legend>
      <label className="check"><input type="checkbox" checked={s.idle === 'ox'} onChange={e => save({ idle: e.target.checked ? 'ox' : 'nothing' })} />Show Ox beside the camera</label>
      <div className="bg-kinds">{(['left', 'right'] as const).map(side => <label key={side} className="check"><input type="radio" name="side" checked={s.mascotSide === side} onChange={() => save({ mascotSide: side })} />{side === 'left' ? 'Left' : 'Right'}</label>)}</div>
      <div className="bg-kinds">{(['none', 'music', 'battery', 'agents'] as const).map(r => <label key={r} className="check"><input type="radio" name="resting" checked={n.resting === r} onChange={() => setN({ resting: r })} />{{ none: 'Nothing', music: 'Music', battery: 'Battery', agents: 'AI Agents' }[r]}</label>)}</div>
    </fieldset>

    <fieldset className="choice">
      <legend>Opening</legend>
      <div className="bg-kinds">{(['click', 'hover'] as const).map(o => <label key={o} className="check"><input type="radio" name="open" checked={s.open === o} onChange={() => save({ open: o })} />{o === 'click' ? 'Click to open' : 'Expand on hover'}</label>)}</div>
      <Range label="Hover delay" value={s.hoverDelay / 1000} min={0.1} max={1} step={0.05} unit=" s" onPick={v => save({ hoverDelay: Math.round(v * 1000) })} />
      <Range label="Close delay" value={s.closeDelay / 1000} min={0.1} max={2} step={0.05} unit=" s" onPick={v => save({ closeDelay: Math.round(v * 1000) })} />
    </fieldset>

    <fieldset className="choice">
      <legend>Display</legend>
      <div className="bg-kinds">{([['automatic', 'Automatic'], ['builtin', 'Built-in display'], ['main', 'Main display'], ['all', 'All displays']] as const).map(([d, label]) => <label key={d} className="check"><input type="radio" name="display" checked={s.display === d} onChange={() => save({ display: d })} />{label}</label>)}</div>
      <label className="check"><input type="checkbox" checked={!s.overFullScreen} onChange={e => save({ overFullScreen: !e.target.checked })} />Hide content in full screen</label>
    </fieldset>

    <fieldset className="choice">
      <legend>Privacy</legend>
      <label className="check"><input type="checkbox" checked={s.inCaptures} onChange={e => save({ inCaptures: e.target.checked })} />Show in screenshots and videos</label>
    </fieldset>

    <fieldset className="choice">
      <legend>Ox</legend>
      {(['answer', 'music', 'timers', 'ask'] as const).map(k => <label key={k} className="check"><input type="checkbox" checked={s.show[k]} onChange={e => save({ show: { ...s.show, [k]: e.target.checked } })} />{{ answer: 'Show Ox’s answers', music: 'Show what’s playing', timers: 'Show timers', ask: 'Ask Ox from the island' }[k]}</label>)}
    </fieldset>

    <h2>AI Agents</h2>
    <p className="muted">Reads the usage Claude Code, Codex, OpenCode and GitHub Copilot record on this Mac. Prompts, replies and files are never kept.</p>
    <fieldset className="choice">
      <legend>Agents</legend>
      {Object.keys(agentNames).map(a => <label key={a} className="check"><input type="checkbox" checked={n.agents.includes(a)} onChange={e => setN({ agents: e.target.checked ? [...n.agents, a] : n.agents.filter(x => x !== a) })} />{agentNames[a]}</label>)}
    </fieldset>
    <Choice legend="Show limits as" name="limitDisplay" value={n.limitDisplay} onPick={limitDisplay => setN({ limitDisplay })} options={[['remaining', 'Left'], ['used', 'Used']]} />
    <Choice legend="Limit to show" name="limitFocus" value={n.limitFocus} onPick={limitFocus => setN({ limitFocus })} options={[['mostUsed', 'Most used'], ['session', 'Session'], ['weekly', 'Week']]} />
    <fieldset className="choice">
      <legend>While an agent works</legend>
      <label className="check"><input type="checkbox" checked={n.live} onChange={e => setN({ live: e.target.checked })} />Show it in the closed Dynamic Island</label>
    </fieldset>
    <Choice legend="Beside the camera" name="readout" value={n.readout} onPick={readout => setN({ readout })} options={[['elapsed', 'Time'], ['tokens', 'Tokens'], ['limit', 'Limit']]} />
    <fieldset className="choice">
      <legend>Alerts</legend>
      <label className="check"><input type="checkbox" checked={n.finishAlert} onChange={e => setN({ finishAlert: e.target.checked })} />When a task finishes</label>
      {n.finishAlert && <div className="bg-kinds"><span className="muted">For tasks longer than</span>{[0, 1, 5, 15].map(m => <label key={m} className="check"><input type="radio" name="finishMinimum" checked={n.finishMinimum === m} onChange={() => setN({ finishMinimum: m })} />{m === 0 ? 'Any length' : `${m} min`}</label>)}</div>}
      <label className="check"><input type="checkbox" checked={n.limitAlert} onChange={e => setN({ limitAlert: e.target.checked })} />Near a plan limit</label>
      {n.limitAlert && <div className="bg-kinds"><span className="muted">Warn at</span>{[75, 90, 95].map(t => <label key={t} className="check"><input type="radio" name="limitThreshold" checked={n.limitThreshold === t} onChange={() => setN({ limitThreshold: t })} />{t}%</label>)}</div>}
    </fieldset>
  </main>;
}
