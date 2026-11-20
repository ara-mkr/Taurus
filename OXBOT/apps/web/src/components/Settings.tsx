import { useState } from 'react';
import { api, type Background, type Board, type Prefs, type Profile, type Tint, type Tone, type WidgetSize, type WidgetType } from '../api';
import { Catalog, newWidget, Sheet, sizeNames, WidgetSettings } from './Board';
import { canListen, inDesktop, type VoiceSettings } from './Voice';
import { TaurusVoice } from './TaurusVoice';
import { catalog } from './widgets';
import { hudDefaults } from './CloudDashboard';

export type Appearance = 'auto' | 'light' | 'dark';
export const settingsPages = { settings: 'Tabs and widgets', look: 'Personalize', connections: 'Connections', ai: 'AI', skills: 'Skills', schedule: 'Scheduled', scans: 'Scans', actions: 'Actions', phone: 'Phone', notch: 'Notch' } as const;

export function SettingsNav({ page }: { page: string }) {
  return <nav className="subnav" aria-label="Settings">
    {(Object.keys(settingsPages) as (keyof typeof settingsPages)[]).map(key => <a key={key} href={`#${key}`} aria-current={page === key ? 'page' : undefined}>{settingsPages[key]}</a>)}
  </nav>;
}

const tintNames: Record<Tint, string> = { graphite: 'Graphite', ember: 'Ember', ocean: 'Ocean', moss: 'Moss', dusk: 'Dusk', aurora: 'Aurora', sunset: 'Sunset', rose: 'Rose', midnight: 'Midnight' };

// A photo for your profile, cropped square and shrunk on this device before it is saved.
export async function shrink(file: File, size = 192): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('That picture couldn’t be read.')); i.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    canvas.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

const tones: Record<Tone, [string, string]> = { witty: ['Witty', 'Sharp and quick, with dry jokes and the odd curse. Jarvis with attitude.'], brief: ['Brief', 'The fewest words that carry the answer.'], warm: ['Warm', 'Still short, with a little more care.'], direct: ['Direct', 'Blunt. The hard thing first.'] };
const kinds: Record<Background['kind'], string> = { field: 'Moving light', color: 'One colour', image: 'Your photo or video', link: 'A picture from the web' };

export function Look({ prefs, setPrefs, appearance, setAppearance, voice, setVoice }: { prefs: Prefs; setPrefs: (u: (p: Prefs) => Prefs) => void; appearance: Appearance; setAppearance: (a: Appearance) => void; voice: VoiceSettings; setVoice: (v: VoiceSettings) => void }) {
  const hears = canListen();
  const [note, setNote] = useState('');
  const [link, setLink] = useState(prefs.background.url ?? '');
  const profile = prefs.profile;
  const bg = prefs.background;
  const setProfile = (next: Partial<Profile>) => setPrefs(p => ({ ...p, profile: { ...p.profile, ...next } }));
  const setBg = (next: Partial<Background>) => setPrefs(p => ({ ...p, background: { ...p.background, ...next } }));
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 40_000_000) { setNote('That file is too big. Pick one under 40 MB.'); return; }
    setNote('Uploading');
    try { const { file: version, video } = await api.background(file); setBg({ kind: 'image', file: version, video }); setNote(''); } catch (e) { setNote((e as Error).message); }
  }
  const applyLink = () => { const url = link.trim(); if (/^https:\/\/\S+$/.test(url)) { setBg({ kind: 'link', url }); setNote(''); } else setNote('Paste a picture’s address that starts with https://'); };

  return <main id="main" tabIndex={-1} className="settings-page">
    <div className="page-head"><h1>Personalize</h1></div>

    <fieldset className="choice">
      <legend>Home</legend>
      {([['hud', 'Dashboard', 'Taurus in the sky, your day around him'], ['board', 'Tiles', 'A grid of cards']] as const).map(([k, name, what]) => <label key={k} className="check">
        <input type="radio" name="home-view" checked={(prefs.hud?.start ?? 'hud') === k} onChange={() => { setPrefs(p => ({ ...p, hud: { ...(p.hud ?? hudDefaults()), start: k } })); try { localStorage.setItem('taurus-start', k); } catch { /* storage blocked: the saved preference still applies */ } }} />
        <span><strong>{name}</strong> <span className="muted">{what}</span></span></label>)}
    </fieldset>

    <fieldset className="choice">
      <legend>How Taurus talks to you</legend>
      {(Object.keys(tones) as Tone[]).map(t => <label key={t} className="check"><input type="radio" name="tone" checked={profile.tone === t} onChange={() => setProfile({ tone: t })} /><span><strong>{tones[t][0]}</strong> <span className="muted">{tones[t][1]}</span></span></label>)}
    </fieldset>

    <fieldset className="choice">
      <legend>Background</legend>
      <div className="bg-kinds">{(Object.keys(kinds) as Background['kind'][]).map(k => <label key={k} className="check"><input type="radio" name="bg-kind" checked={bg.kind === k}
        onChange={() => { if (k === 'image' && !bg.file) document.getElementById('bg-file')?.click(); else if (k === 'link' && !bg.url) document.getElementById('bg-link')?.focus(); else setBg({ kind: k }); }} />{kinds[k]}</label>)}</div>
      {bg.kind === 'field' && <div className="tints">{(Object.keys(tintNames) as Tint[]).map(t => <label key={t} className={`tint-option tint-${t}`}>
        <input type="radio" name="tint" checked={prefs.tint === t} onChange={() => setPrefs(p => ({ ...p, tint: t }))} />
        <span className="swatch" aria-hidden="true" /><span>{tintNames[t]}</span>
      </label>)}</div>}
      {bg.kind === 'color' && <label className="inline-field">Colour<input type="color" value={bg.color} onChange={e => setBg({ color: e.target.value })} /></label>}
      <div className="actions">
        <label className="button file-button">{bg.file ? 'Choose another photo or video' : 'Choose a photo or video'}<input id="bg-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime" onChange={e => void upload(e.target.files?.[0])} /></label>
      </div>
      <div className="inline">
        <label className="sr-only" htmlFor="bg-link">Picture address</label>
        <input id="bg-link" type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https:// address of any picture" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }} />
        <button type="button" onClick={applyLink}>Use picture</button>
      </div>
      {note && <p className={note === 'Uploading' ? 'muted' : 'problem'} role="status">{note}</p>}
      <label className="range">Dim the background <span className="muted">{bg.dim}%</span><input type="range" min={0} max={85} value={bg.dim} onChange={e => setBg({ dim: Number(e.target.value) })} /></label>
      {(bg.kind === 'image' || bg.kind === 'link') && <label className="range">Soften it <span className="muted">{bg.blur} px</span><input type="range" min={0} max={40} value={bg.blur} onChange={e => setBg({ blur: Number(e.target.value) })} /></label>}
      <label className="check"><input type="checkbox" checked={bg.daylight} onChange={e => setBg({ daylight: e.target.checked })} />Light follows the time of day: warm at dawn and dusk, cool at night</label>
    </fieldset>

    <fieldset className="choice">
      <legend>Appearance</legend>
      {(['dark', 'light', 'auto'] as Appearance[]).map(a => <label key={a} className="check"><input type="radio" name="appearance" checked={appearance === a} onChange={() => setAppearance(a)} />{a === 'auto' ? 'Follow the system' : a === 'dark' ? 'Dark' : 'Light'}</label>)}
      <label className="check"><input type="checkbox" checked={profile.large} onChange={e => setProfile({ large: e.target.checked })} />Larger text</label>
    </fieldset>
    <fieldset className="choice">
      <legend>Motion</legend>
      <label className="check"><input type="checkbox" checked={prefs.ambient} onChange={e => setPrefs(p => ({ ...p, ambient: e.target.checked }))} />Slowly moving light behind the cards</label>
      <label className="check"><input type="checkbox" checked={prefs.taurus !== false} onChange={e => setPrefs(p => ({ ...p, taurus: e.target.checked }))} />Taurus walks around your boards and tells you what matters</label>
      <p className="muted">Turns off by itself when your Mac asks for reduced motion.</p>
    </fieldset>
    <fieldset className="choice">
      <legend>Voice</legend>
      <label className="check"><input type="checkbox" checked={voice.wake} disabled={!hears} onChange={e => setVoice({ ...voice, wake: e.target.checked })} />Listen for “Hey Taurus” while Taurus is open</label>
      {hears && voice.wake && <p className="muted">“Yo Taurus”, “Hi Taurus”, “Taurus” and “Taurus” work too.</p>}
      <label className="check"><input type="checkbox" checked={voice.clap === true} disabled={!hears} onChange={e => setVoice({ ...voice, clap: e.target.checked })} />Clap or snap twice to talk</label>
      {hears && voice.clap && <p className="muted">Only how loud the room is gets measured, here in the browser, while this tab is showing. No sound is recorded or sent.</p>}
      {hears && inDesktop() && (voice.wake || voice.clap) && <p className="muted">In the desktop app these keep listening while Taurus is hidden or behind other apps, on this Mac only, and Taurus comes to the app you’re in. Esc sends him away. Nothing is recorded or saved.</p>}
      <label className="check"><input type="checkbox" checked={voice.speak} onChange={e => setVoice({ ...voice, speak: e.target.checked })} />Taurus reads his answers out loud</label>
      <p className="muted">{hears ? 'Talk in the chat bar works without either. Speech goes through your browser’s own recognition: Google in Chrome, Apple in Safari. Listening stops when this tab is hidden, and nothing is recorded or saved.' : 'This browser has no speech recognition. Talk works in Chrome and Safari.'}</p>
    </fieldset>
    <TaurusVoice />
  </main>;
}

export function Tabs({ prefs, setPrefs, onReset }: { prefs: Prefs; setPrefs: (u: (p: Prefs) => Prefs) => void; onReset: () => void }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ board: string; widget: string } | null>(null);
  const change = (id: string, fn: (b: Board) => Board) => setPrefs(p => ({ ...p, boards: p.boards.map(b => b.id === id ? fn(b) : b) }));
  const moveBoard = (from: number, to: number) => setPrefs(p => { if (to < 0 || to >= p.boards.length) return p; const boards = [...p.boards]; const [b] = boards.splice(from, 1); boards.splice(to, 0, b); return { ...p, boards }; });
  const addTab = () => { const b: Board = { id: crypto.randomUUID().slice(0, 8), name: name.trim() || 'New tab', widgets: [] }; setPrefs(p => ({ ...p, boards: [...p.boards, b] })); setName(''); };
  const editingBoard = prefs.boards.find(b => b.id === editing?.board);
  const editingWidget = editingBoard?.widgets.find(w => w.id === editing?.widget);

  return <main id="main" tabIndex={-1} className="settings-page">
    <div className="page-head"><h1>Tabs and widgets</h1></div>
    <p className="lede">Each tab is a board of cards. The first tab opens when you start Taurus. On any board, Build dashboard makes a tab from a sentence.</p>

    <ol className="tab-list">
      {prefs.boards.map((b, i) => <li key={b.id}>
        <details>
          <summary>
            <span className="tab-name">{b.name}</span>
            <span className="muted">{b.widgets.length} {b.widgets.length === 1 ? 'widget' : 'widgets'}{i === 0 ? ' · opens first' : ''}</span>
          </summary>
          <div className="tab-body">
            <div className="tab-controls">
              <label>Name<input type="text" defaultValue={b.name} maxLength={40} onBlur={e => e.target.value.trim() && change(b.id, x => ({ ...x, name: e.target.value.trim() }))} /></label>
              <div className="actions">
                <a className="button" href={`#b/${b.id}`}>Open</a>
                <button disabled={i === 0} onClick={() => moveBoard(i, i - 1)}>Move left</button>
                <button disabled={i === prefs.boards.length - 1} onClick={() => moveBoard(i, i + 1)}>Move right</button>
                <button className="danger" disabled={prefs.boards.length === 1} onClick={() => { if (confirm(`Delete the ${b.name} tab and its widgets?`)) setPrefs(p => ({ ...p, boards: p.boards.filter(x => x.id !== b.id) })); }}>Delete tab</button>
              </div>
            </div>
            <ul className="widget-list">
              {b.widgets.map((w, j) => <li key={w.id}>
                <span>{w.title ?? catalog[w.type as WidgetType].name}{w.title && <span className="muted"> · {catalog[w.type].name}</span>}</span>
                <span className="row-actions">
                  <label className="sr-only" htmlFor={`s-${w.id}`}>Size of {w.title ?? catalog[w.type].name}</label>
                  <select id={`s-${w.id}`} value={w.size} onChange={e => change(b.id, x => ({ ...x, widgets: x.widgets.map(y => y.id === w.id ? { ...y, size: e.target.value as WidgetSize } : y) }))}>{(Object.keys(sizeNames) as WidgetSize[]).map(s => <option key={s} value={s}>{sizeNames[s]}</option>)}</select>
                  <button className="text-button" disabled={j === 0} onClick={() => change(b.id, x => { const ws = [...x.widgets]; [ws[j - 1], ws[j]] = [ws[j], ws[j - 1]]; return { ...x, widgets: ws }; })}>Up</button>
                  <button className="text-button" onClick={() => setEditing({ board: b.id, widget: w.id })}>Settings</button>
                  <button className="text-button danger" onClick={() => change(b.id, x => ({ ...x, widgets: x.widgets.filter(y => y.id !== w.id) }))}>Remove</button>
                </span>
              </li>)}
            </ul>
            <button className="text-button" onClick={() => setAdding(b.id)}>Add a widget to {b.name}</button>
          </div>
        </details>
      </li>)}
    </ol>

    <form className="add-tab" onSubmit={e => { e.preventDefault(); addTab(); }}>
      <label htmlFor="new-tab">New tab</label>
      <div className="inline"><input id="new-tab" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name, for example Investors" maxLength={40} /><button type="submit" className="primary">Add tab</button></div>
    </form>

    <section className="danger-zone">
      <h2>Start over</h2>
      <p className="muted">Puts back the Home, Health and Markets tabs. Your to-dos and people stay.</p>
      <button className="danger" onClick={() => { if (confirm('Replace every tab with the default layout?')) onReset(); }}>Reset tabs</button>
    </section>

    {adding && <Sheet title="Add a widget" onClose={() => setAdding(null)}><Catalog onPick={type => { change(adding, x => ({ ...x, widgets: [...x.widgets, newWidget(type)] })); setAdding(null); }} /></Sheet>}
    {editingBoard && editingWidget && <Sheet title={editingWidget.title ?? catalog[editingWidget.type].name} onClose={() => setEditing(null)}>
      <WidgetSettings widget={editingWidget} onChange={w => change(editingBoard.id, x => ({ ...x, widgets: x.widgets.map(y => y.id === w.id ? w : y) }))} />
    </Sheet>}
  </main>;
}
