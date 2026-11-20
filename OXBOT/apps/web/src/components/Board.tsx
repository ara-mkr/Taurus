import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { api, type Board, type Widget, type WidgetConfig, type WidgetSize, type WidgetType } from '../api';
import { BackgroundMenu, TextSize, useBackgroundMenu } from './Popup';
import { catalog, ConfigFields, WidgetView, type Ctx } from './widgets';

export const sizeNames: Record<WidgetSize, string> = { small: 'Small', medium: 'Medium', tall: 'Tall', large: 'Large', wide: 'Wide', banner: 'Banner', full: 'Full width' };
const configurable = new Set<WidgetType>(['clock', 'stocks', 'chart', 'news', 'trend', 'note', 'ai']);
export const newWidget = (type: WidgetType): Widget => ({ id: crypto.randomUUID().slice(0, 8), type, size: catalog[type].size, ...(catalog[type].config ? { config: { ...catalog[type].config } } : {}) });

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return <dialog ref={ref} className="sheet" aria-labelledby="sheet-title" onClose={onClose} onClick={e => { if (e.target === ref.current) ref.current.close(); }}>
    <div className="sheet-head"><h2 id="sheet-title">{title}</h2><button className="text-button" onClick={() => ref.current?.close()}>Done</button></div>
    <div className="sheet-body">{children}</div>
  </dialog>;
}

export function WidgetSettings({ widget, onChange }: { widget: Widget; onChange: (w: Widget) => void }) {
  return <div className="form">
    <label>Title<input type="text" defaultValue={widget.title ?? ''} placeholder={catalog[widget.type].name} maxLength={60} onBlur={e => onChange({ ...widget, title: e.target.value.trim() || undefined })} /></label>
    <label>Size<select value={widget.size} onChange={e => onChange({ ...widget, size: e.target.value as WidgetSize })}>{(Object.keys(sizeNames) as WidgetSize[]).map(s => <option key={s} value={s}>{sizeNames[s]}</option>)}</select></label>
    <ConfigFields widget={widget} onChange={config => onChange({ ...widget, config })} />
  </div>;
}

export function Catalog({ onPick }: { onPick: (type: WidgetType) => void }) {
  return <ul className="catalog">{(Object.keys(catalog) as WidgetType[]).map(type => <li key={type}>
    <button onClick={() => onPick(type)}><strong>{catalog[type].name}</strong><span>{catalog[type].about}</span></button>
  </li>)}</ul>;
}

export function BoardView({ board, ctx }: { board: Board; ctx: Ctx }) {
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState<'' | 'new' | 'replace'>('');
  const [note, setNote] = useState('');
  const menu = useBackgroundMenu();

  const change = (fn: (widgets: Widget[]) => Widget[]) => ctx.setPrefs(p => ({ ...p, boards: p.boards.map(b => b.id === board.id ? { ...b, widgets: fn(b.widgets) } : b) }));
  const replace = (w: Widget) => change(ws => ws.map(x => x.id === w.id ? w : x));
  const move = (id: string, to: number) => change(ws => { const from = ws.findIndex(x => x.id === id); if (from < 0 || to < 0 || to >= ws.length || from === to) return ws; const next = [...ws]; const [it] = next.splice(from, 1); next.splice(to, 0, it); return next; });
  const add = (type: WidgetType) => { const w = newWidget(type); change(ws => [...ws, w]); setAdding(false); if (configurable.has(type) && type !== 'ai' && type !== 'note') setConfiguring(w.id); requestAnimationFrame(() => document.getElementById(`w-${w.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })); };

  async function build(mode: 'new' | 'replace', e?: FormEvent) {
    e?.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(mode); setNote('');
    try {
      const { board: made, by } = await api.buildBoard(prompt.trim(), mode === 'replace' ? board : undefined);
      if (mode === 'new') { ctx.setPrefs(p => ({ ...p, boards: [...p.boards, made] })); location.hash = `b/${made.id}`; }
      else ctx.setPrefs(p => ({ ...p, boards: p.boards.map(b => b.id === board.id ? { ...b, widgets: made.widgets } : b) }));
      setPrompt(''); setBuilding(false);
      if (by === 'rules') setNote('Built from keywords. Connect an AI in Settings, then AI, for boards that follow any description. Taurus Free costs nothing.');
    } catch (error) { setNote((error as Error).message); }
    finally { setBusy(''); }
  }

  const target = board.widgets.find(w => w.id === configuring);
  return <main id="main" tabIndex={-1} className={`board ${editing ? 'is-editing' : ''}`} {...menu.handlers}>
    {!board.widgets.some(w => w.type === 'brief') && <h1 className="sr-only">{board.name}</h1>}
    <div className="board-bar">
      <div className="board-tools">
        <button className="glass-button" aria-expanded={building} onClick={() => setBuilding(b => !b)}>Build dashboard</button>
        <button className="glass-button" onClick={() => setAdding(true)}>Add widget</button>
        <button className={`glass-button ${editing ? 'on' : ''}`} aria-pressed={editing} onClick={() => setEditing(e => !e)}>{editing ? 'Done' : 'Edit'}</button>
      </div>
    </div>
    {building && <form className="builder" onSubmit={e => build('new', e)}>
      <label htmlFor="build-prompt">Describe the dashboard you want, or how to change this one</label>
      <textarea id="build-prompt" rows={2} value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={600} autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) void build('new', e); }}
        placeholder="A markets tab with NVDA, TSLA and Bitcoin, news about Tesla, and my sleep this week as a bar chart" />
      <div className="actions">
        <button type="submit" className="primary" disabled={!prompt.trim() || Boolean(busy)}>{busy === 'new' ? 'Building' : 'Build as a new tab'}</button>
        <button type="button" disabled={!prompt.trim() || Boolean(busy)} onClick={() => build('replace')}>{busy === 'replace' ? 'Reworking' : `Rework ${board.name}`}</button>
      </div>
    </form>}
    {note && <p className="board-note">{note}</p>}
    {ctx.data === null && <p className="board-note">Loading your day.</p>}

    {board.widgets.length === 0 ? <div className="board-empty">
      <p>This tab is empty.</p>
      <div className="actions"><button className="primary" onClick={() => setAdding(true)}>Add widget</button><button onClick={() => setBuilding(true)}>Build dashboard</button></div>
    </div> : <div className="grid" onPointerMove={e => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
      if (!card || e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`); card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }}>
      {board.widgets.map((w, i) => <article key={w.id} id={`w-${w.id}`} aria-label={w.title ?? catalog[w.type].name}
        className={`card size-${w.size} type-${w.type} ${dragId === w.id ? 'dragging' : ''}`} style={{ '--i': i } as CSSProperties}
        // Drag a card by any quiet part of it, editing or not (owner, November 5, 2026: "make it so u can simply drag
        // widgets around"). Controls, fields and charts inside keep working.
        draggable onPointerDown={e => { e.currentTarget.draggable = editing || !(e.target as HTMLElement).closest('button, a, input, textarea, select, label, svg, [contenteditable]'); }}
        onDragStart={e => { setDragId(w.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); }}
        onDragEnter={() => { if (dragId && dragId !== w.id) move(dragId, i); }}
        onDragOver={e => { if (dragId) e.preventDefault(); }}
        onDragEnd={() => setDragId(null)} onDrop={e => { e.preventDefault(); setDragId(null); }}>
        <div className="card-content" inert={editing}><WidgetView widget={w} ctx={ctx} update={(config: WidgetConfig) => replace({ ...w, config })} /></div>
        {editing && <div className="card-tools">
          <span className="grip">Drag to move</span>
          <span className="tool-row">
            <button className="text-button" disabled={i === 0} onClick={() => move(w.id, i - 1)}>Earlier</button>
            <button className="text-button" disabled={i === board.widgets.length - 1} onClick={() => move(w.id, i + 1)}>Later</button>
            <label className="sr-only" htmlFor={`size-${w.id}`}>Size</label>
            <select id={`size-${w.id}`} value={w.size} onChange={e => replace({ ...w, size: e.target.value as WidgetSize })}>{(Object.keys(sizeNames) as WidgetSize[]).map(s => <option key={s} value={s}>{sizeNames[s]}</option>)}</select>
            <button className="text-button" onClick={() => setConfiguring(w.id)}>Settings</button>
            <button className="text-button danger" onClick={() => change(ws => ws.filter(x => x.id !== w.id))}>Remove</button>
          </span>
        </div>}
      </article>)}
    </div>}

    {menu.at && <BackgroundMenu at={menu.at} onClose={menu.close} label={`${board.name} options`}>
      <div className="bg-menu-actions">
        <button type="button" onClick={() => { setAdding(true); menu.close(); }}>Add widget</button>
        <button type="button" onClick={() => { setEditing(e => !e); menu.close(); }}>{editing ? 'Done editing' : 'Edit layout'}</button>
        <button type="button" onClick={() => { setBuilding(true); menu.close(); }}>Build dashboard</button>
      </div>
      <TextSize prefs={ctx.prefs} setPrefs={ctx.setPrefs} />
    </BackgroundMenu>}
    {adding && <Sheet title={`Add to ${board.name}`} onClose={() => setAdding(false)}><Catalog onPick={add} /></Sheet>}
    {target && <Sheet title={target.title ?? catalog[target.type].name} onClose={() => setConfiguring(null)}><WidgetSettings widget={target} onChange={replace} /></Sheet>}
  </main>;
}
