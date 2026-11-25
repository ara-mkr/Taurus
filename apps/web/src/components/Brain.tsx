import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ForceGraph from 'force-graph';
import { api, type BrainGraph, type BrainNode, type BrainNote, type BrainSuggestion } from '../api';
import { BrainMemory } from './BrainMemory';
import type { Extras } from './ChatBar';
import '../styles/brain.css';

// The Brain (owner, November 16, 2026: "a mindmap like obsidian of everything it remembers about u ... under certain
// dots like job, there will be files like resume and shit u can just pull from"). The notes in ~/.taurus/brain drawn
// as a force graph (force-graph by vasturiano, MIT; docs/23-brain-and-profinder.md says why).
// Click a dot to read its note and its files; search, zoom, add and edit notes, drop files on a note.

const hubPalette = {
  Me: ['#3D526F', '#A3B9D9'],
  Personality: ['#7350A0', '#BE9CEC'],
  Career: ['#305F9A', '#7AA9F1'],
  School: ['#08717D', '#6CD4D9'],
  Friends: ['#9B426C', '#E99ABA'],
  Family: ['#AE5C34', '#F1AD85'],
  Hobbies: ['#8C660F', '#E1C472'],
  Projects: ['#437342', '#9ECE87'],
} as const;
type Hub = keyof typeof hubPalette;
type GNode = BrainNode & { x?: number; y?: number; hub?: Hub };
type GLink = { source: string | GNode; target: string | GNode };
const idOf = (end: string | GNode) => typeof end === 'string' ? end : end.id;
const namedHub = (title: string): title is Hub => Object.hasOwn(hubPalette, title);

function graphHubs(nodes: BrainNode[]) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  return new Map(nodes.map(node => {
    let current: BrainNode | undefined = node;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.kind === 'hub' && namedHub(current.title)) return [node.id, current.title] as const;
      visited.add(current.id);
      current = current.up ? byId.get(current.up) : undefined;
    }
    return [node.id, undefined] as const;
  }));
}

function useInk() {
  const read = () => {
    const root = document.documentElement;
    const css = getComputedStyle(root);
    const dark = root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    return { ink: css.getPropertyValue('--ink').trim() || '#ECEBE6', font: getComputedStyle(document.body).fontFamily, dark };
  };
  const [ink, setInk] = useState(read);
  useEffect(() => {
    const update = () => setInk(read());
    const watch = new MutationObserver(update);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => { watch.disconnect(); media.removeEventListener('change', update); };
  }, []);
  return ink;
}

// #hex to rgba, for one ink at different strengths.
const alpha = (hex: string, a: number) => {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : hex;
};

function Graph({ graph, selected, query, onPick }: { graph: BrainGraph; selected: string; query: string; onPick: (n: BrainNode) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraph<GNode, GLink> | null>(null);
  const hover = useRef<string | null>(null);
  const { ink, font, dark } = useInk();
  const state = useRef({ selected, query: '', ink, font, dark });
  const groups = useMemo(() => graphHubs(graph.nodes), [graph.nodes]);
  const pick = useRef(onPick);
  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of graph.links) { m.set(l.source, (m.get(l.source) ?? new Set()).add(l.target)); m.set(l.target, (m.get(l.target) ?? new Set()).add(l.source)); }
    return m;
  }, [graph]);
  const near = useRef(neighbours);
  useEffect(() => { state.current = { selected, query: query.trim().toLowerCase(), ink, font, dark }; pick.current = onPick; near.current = neighbours; fg.current?.resumeAnimation(); });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const focusOf = () => hover.current ?? state.current.selected;
    const lit = (n: string) => { const h = focusOf(); return !h || n === h || Boolean(near.current.get(h)?.has(n)); };
    const onLink = (l: GLink) => { const h = focusOf(); return Boolean(h) && (idOf(l.source) === h || idOf(l.target) === h); };
    // Draw small dots at a nearly constant screen size. Use the hub color for its notes and attachments.
    const degree = (n: GNode) => near.current.get(n.id)?.size ?? 0;
    const screenR = (n: GNode) => n.kind === 'hub' ? Math.min(4.3, 3.2 + Math.sqrt(degree(n)) * 0.24)
      : Math.min(2.8, 1.65 + Math.sqrt(degree(n)) * 0.24);
    const radius = (n: GNode, scale: number) => screenR(n) * Math.min(1.15, Math.max(0.85, scale)) / scale;
    const colorOf = (hub?: Hub) => hub ? hubPalette[hub][state.current.dark ? 1 : 0] : state.current.ink;

    // Where the cursor is over the canvas, so the dots can bend away from it (owner, November 17, 2026: "make it
    // interact with ur cursor like bend around it"). Kept in canvas pixels; turned into graph coordinates each tick.
    const ptr = { x: 0, y: 0, on: false };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true; };
    const onLeave = () => { ptr.on = false; };
    if (!reduce) { el.addEventListener('pointermove', onMove); el.addEventListener('pointerleave', onLeave); }

    const g = new ForceGraph<GNode, GLink>(el)
      .backgroundColor('rgba(0,0,0,0)')
      .nodeId('id')
      .nodeVal(1)
      .nodeRelSize(2)
      // Never cool down, so the web keeps breathing and reacts to the cursor; velocity damping keeps it calm, not drifting.
      .cooldownTicks(reduce ? 0 : Infinity)
      .warmupTicks(reduce ? 220 : 60)
      .d3AlphaDecay(reduce ? 0.0228 : 0)
      .d3VelocityDecay(0.55)
      .linkCurvature(0)
      .linkWidth(0)
      .linkCanvasObjectMode(() => 'replace')
      .linkCanvasObject((l, ctx, scale) => {
        const a = l.source as GNode, b = l.target as GNode;
        if (a.x === undefined || b.x === undefined) return;
        const h = focusOf();
        ctx.beginPath(); ctx.moveTo(a.x, a.y!); ctx.lineTo(b.x, b.y!);
        ctx.lineWidth = (onLink(l) ? 1.2 : 0.7) / scale;
        const color = a.hub && a.hub === b.hub ? colorOf(a.hub) : state.current.ink;
        ctx.strokeStyle = alpha(color, onLink(l) ? 0.65 : h || state.current.query ? 0.07 : 0.23);
        ctx.stroke();
      })
      .nodeCanvasObject((n, ctx, scale) => {
        const s = state.current;
        const match = Boolean(s.query) && n.title.toLowerCase().includes(s.query);
        const on = s.query ? match : lit(n.id);
        const focused = focusOf() === n.id || n.id === s.selected;
        const strength = focused || match ? 1 : on ? (n.kind === 'missing' ? 0.35 : 0.95) : 0.17;
        const r = radius(n, scale);
        if (focused) {
          ctx.beginPath(); ctx.arc(n.x!, n.y!, r + 3 / scale, 0, 2 * Math.PI);
          ctx.strokeStyle = alpha(s.ink, 0.8); ctx.lineWidth = 1 / scale; ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
        // Files are small rings hanging off their note; links to notes not written yet are faint rings.
        if (n.kind === 'file' || n.kind === 'missing') { ctx.lineWidth = 1 / scale; ctx.strokeStyle = alpha(colorOf(n.hub), strength); ctx.stroke(); }
        else { ctx.fillStyle = alpha(colorOf(n.hub), strength); ctx.fill(); }
        // Label hubs at the overview scale. Other labels appear on selection, search, and closer zoom.
        const h = focusOf();
        const fade = Math.max(0, Math.min(1, (scale - 2.15) / 0.8));
        const wide = el.clientWidth >= 560;
        const show = focused || n.kind === 'hub' || (wide && (match || (h && lit(n.id)) || fade > 0));
        if (!show) return;
        const textA = focused || match || (h && lit(n.id)) ? 0.98 : n.kind === 'hub' ? (on ? 0.82 : 0.3) : fade * (on ? 0.76 : 0.15);
        if (textA <= 0.02) return;
        ctx.font = `${focused || n.kind === 'hub' ? 600 : 400} ${13 / scale}px ${s.font}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = alpha(s.ink, textA);
        ctx.fillText(n.title, n.x!, n.y! + r + (focused ? 6 : 4) / scale);
      })
      .nodePointerAreaPaint((n, color, ctx, scale) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x!, n.y!, Math.max(radius(n, scale) + 4 / scale, 9 / scale), 0, 2 * Math.PI); ctx.fill(); })
      .onNodeHover(n => { hover.current = n?.id ?? null; el.style.cursor = n ? 'pointer' : ''; })
      .onNodeClick(n => pick.current(n));
    (g.d3Force('link') as unknown as { distance?: (v: number) => void } | undefined)?.distance?.(34);
    (g.d3Force('charge') as unknown as { strength?: (v: number) => void } | undefined)?.strength?.(-70);

    // The cursor force: dots inside a small radius are pushed straight away from the pointer; the other forces ease them
    // back the moment it moves on, so the web bends around the cursor. Added to velocity directly, so it works even
    // when the layout has otherwise settled.
    if (!reduce) {
      let simNodes: GNode[] = [];
      const cursor = ((): (() => void) & { initialize?: (nodes: GNode[]) => void } => {
        const force = () => {
          if (!ptr.on) return;
          const p = g.screen2GraphCoords(ptr.x, ptr.y);
          const R = 48;
          for (const n of simNodes) {
            const dx = (n.x ?? 0) - p.x, dy = (n.y ?? 0) - p.y, d2 = dx * dx + dy * dy;
            if (d2 > 0.0001 && d2 < R * R) { const d = Math.sqrt(d2), push = (1 - d / R) ** 2 * 2.2; const v = n as GNode & { vx: number; vy: number }; v.vx += (dx / d) * push; v.vy += (dy / d) * push; }
          }
        };
        force.initialize = (nodes: GNode[]) => { simNodes = nodes; };
        return force;
      })();
      g.d3Force('cursor', cursor as unknown as Parameters<typeof g.d3Force>[1]);
    }
    fg.current = g;
    const size = () => g.width(el.clientWidth).height(el.clientHeight);
    size();
    const watch = new ResizeObserver(size);
    watch.observe(el);
    return () => { watch.disconnect(); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); g._destructor(); fg.current = null; };
  }, []);

  // New data keeps the dots already placed where they were.
  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    const old = new Map(g.graphData().nodes.map(n => [n.id, n]));
    const nodes = graph.nodes.map(n => Object.assign(old.get(n.id) ?? {}, n, { hub: groups.get(n.id) }));
    const first = old.size === 0;
    g.graphData({ nodes, links: graph.links.map(l => ({ ...l })) });
    // The web keeps simulating, so there is no "engine stop" to wait for: give it a beat to spread, then frame it.
    if (first) { const t = setTimeout(() => { g.zoomToFit(500, 60); setTimeout(() => { if (g.zoom() > 2.2) g.zoom(2.2, 300); }, 520); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 60 : 900); return () => clearTimeout(t); }
  }, [graph, groups]);

  // Picking a dot brings it to the middle.
  useEffect(() => {
    const g = fg.current;
    const n = g?.graphData().nodes.find(x => x.id === selected);
    if (g && n?.x !== undefined) { g.centerAt(n.x, n.y, 500); if (g.zoom() < 1.4) g.zoom(1.6, 500); }
  }, [selected]);

  const zoom = (by: number) => { const g = fg.current; if (g) g.zoom(g.zoom() * by, 250); };
  return <div className="brain-graph-wrap">
    <ul className="brain-legend" aria-label="Note groups">
      {graph.nodes.filter(n => n.kind === 'hub' && namedHub(n.title)).map(n => <li key={n.id}>
        <button type="button" className="text-button" aria-current={selected === n.id ? 'true' : undefined} onClick={() => onPick(n)}>
          <span aria-hidden="true" style={{ background: hubPalette[n.title as Hub][dark ? 1 : 0] }} />{n.title}
        </button>
      </li>)}
    </ul>
    <div className="brain-viewport">
      <div ref={box} className="brain-graph" role="img" aria-label={`Brain graph: ${graph.nodes.filter(n => n.kind === 'hub' || n.kind === 'note').length} notes and ${graph.nodes.filter(n => n.kind === 'file').length} files. Every note is also listed beside it.`} />
      <div className="brain-zoom">
        <button type="button" className="glass-button" onClick={() => zoom(1.4)} aria-label="Zoom in">+</button>
        <button type="button" className="glass-button" onClick={() => zoom(1 / 1.4)} aria-label="Zoom out">−</button>
        <button type="button" className="glass-button" onClick={() => { const g = fg.current; if (!g) return; g.zoomToFit(400, 60); setTimeout(() => { if (g.zoom() > 2.2) g.zoom(2.2, 250); }, 420); }}>Fit</button>
      </div>
    </div>
  </div>;
}

// Note text, read like a page: headings, bullets, paragraphs; [[links]] open that note; block ids are hidden.
function Body({ text, open }: { text: string; open: (title: string) => void }) {
  const inline = (line: string, key: string): ReactNode[] => line.replace(/\s\^m-[a-f0-9]{8}$/, '').split(/(\[\[[^\]]+\]\])/g).map((part, i) => {
    const m = part.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/);
    return m ? <button key={`${key}-${i}`} type="button" className="text-button brain-link" onClick={() => open(m[1].trim())}>{m[2] ?? m[1]}</button> : part;
  });
  const lines = text.replace(/^## Files\n(?:!\[\[[^\]]+\]\]\n?)*/m, '').split('\n').filter(l => !/^!\[\[[^\]]+\]\]$/.test(l.trim()));
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) { const list = bullets, at = out.length; out.push(<ul key={`u${at}`}>{list.map((b, i) => <li key={i}>{inline(b, `b${at}-${i}`)}</li>)}</ul>); bullets = []; } };
  lines.forEach((l, i) => {
    const t = l.trim();
    if (/^[-*]\s+/.test(t)) { bullets.push(t.replace(/^[-*]\s+/, '')); return; }
    flush();
    if (!t) return;
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    out.push(h ? <h3 key={i}>{h[2]}</h3> : <p key={i}>{inline(t, `p${i}`)}</p>);
  });
  flush();
  return out.length ? <div className="brain-body">{out}</div> : <p className="muted">Nothing written here yet.</p>;
}

const readable = /\.(txt|md|csv|json|pdf)$/i;

export function BrainPage({ onAsk }: { onAsk: (question: string, frame?: string, extras?: Extras) => void }) {
  const [graph, setGraph] = useState<BrainGraph | null>(null);
  const [suggestions, setSuggestions] = useState<BrainSuggestion[]>([]);
  const [folder, setFolder] = useState('');
  const [note, setNote] = useState<BrainNote | null>(null);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ title: string; body: string; up: string; was?: string; hub?: boolean } | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const open = useCallback((title: string) => {
    setProblem(''); setEditing(null);
    api.brainNote(title).then(r => { setNote(r.note); setSelected(r.note.title); history.replaceState(null, '', `#brain/${encodeURIComponent(r.note.title)}`); })
      .catch(e => { setNote(null); setProblem((e as Error).message); });
  }, []);
  useEffect(() => {
    api.brain().then(b => { setGraph(b.graph); setSuggestions(b.suggestions); setFolder(b.folder); }).catch(e => setProblem((e as Error).message));
    // A #brain/<note> link opens that note.
    const linked = location.hash.match(/^#brain\/(.+)$/)?.[1];
    if (linked) api.brainNote(decodeURIComponent(linked)).then(r => { setNote(r.note); setSelected(r.note.title); }).catch(e => setProblem((e as Error).message));
  }, []);

  const notes = useMemo(() => (graph?.nodes ?? []).filter(n => n.kind === 'hub' || n.kind === 'note'), [graph]);
  const hubs = notes.filter(n => n.kind === 'hub');
  const under = (hub: string) => notes.filter(n => n.kind === 'note' && n.up === hub).sort((a, b) => a.title.localeCompare(b.title));
  const loose = notes.filter(n => n.kind === 'note' && !hubs.some(h => h.title === n.up));
  const q = query.trim().toLowerCase();
  const found = q ? notes.filter(n => n.title.toLowerCase().includes(q)) : [];

  const pick = (n: BrainNode) => { if (n.kind === 'file') { if (n.up) open(n.up); } else open(n.title); };
  async function save() {
    if (!editing) return;
    setBusy('Saving'); setProblem('');
    try { const r = await api.saveNote({ title: editing.title, body: editing.body, up: editing.up, was: editing.was }); setGraph(r.graph); setNote(r.note); setSelected(r.note.title); setEditing(null); }
    catch (e) { setProblem((e as Error).message); }
    finally { setBusy(''); }
  }
  async function upload(files: FileList | null) {
    if (!note || !files?.length) return;
    setBusy('Adding'); setProblem('');
    try { for (const f of [...files].slice(0, 5)) { const r = await api.attachFile(note.title, f); setNote(r.note); setGraph(r.graph); } }
    catch (e) { setProblem((e as Error).message); }
    finally { setBusy(''); if (fileInput.current) fileInput.current.value = ''; }
  }
  async function askAbout(name: string) {
    setBusy('Reading'); setProblem('');
    try { const { text } = await api.fileText(name); onAsk(`Use my ${name} from the Brain.`, undefined, { files: [{ name, text }], names: [name] }); }
    catch (e) { setProblem((e as Error).message); }
    finally { setBusy(''); }
  }
  async function decide(s: BrainSuggestion, add: boolean) {
    try { const r = await api.decideSuggestion(s.id, add); setSuggestions(r.suggestions); setGraph(r.graph); if (add && note?.title === s.note) open(s.note); }
    catch (e) { setProblem((e as Error).message); }
  }
  async function remove() {
    if (!note || note.hub || !confirm(`Move ${note.title} to the Brain’s trash?`)) return;
    try { const r = await api.removeNote(note.title); setGraph(r.graph); setNote(null); setSelected(''); history.replaceState(null, '', '#brain'); }
    catch (e) { setProblem((e as Error).message); }
  }
  const fileCount = graph?.nodes.filter(n => n.kind === 'file').length ?? 0;
  const item = (n: BrainNode, strong = false) => <button type="button" className={`text-button ${strong ? 'strong' : ''}`} aria-current={n.title === selected ? 'true' : undefined} onClick={() => open(n.title)}>{n.title}</button>;

  return <main id="main" tabIndex={-1} className="brain">
    <div className="page-head">
      <h1>Brain</h1>
      <div className="brain-tools">
        <label className="sr-only" htmlFor="brain-find">Find a note</label>
        <input id="brain-find" type="search" placeholder="Find a note" value={query} autoComplete="off"
          onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && found[0]) open(found[0].title); }} />
        <button type="button" className="glass-button" onClick={() => { setProblem(''); setEditing({ title: '', body: '', up: note ? (note.hub ? note.title : note.up ?? 'Me') : 'Me' }); }}>New note</button>
      </div>
    </div>
    {suggestions.length > 0 && <section className="brain-suggest glass" aria-labelledby="brain-suggest-h">
      <h2 id="brain-suggest-h">{suggestions.length === 1 ? 'Taurus learned one thing. Add it to your Brain?' : `Taurus learned ${suggestions.length} things. Add them to your Brain?`}</h2>
      <ul>{suggestions.map(s => <li key={s.id}>
        <span className="brain-suggest-fact">{s.fact}</span><span className="muted">Under {s.note}</span>
        <span className="brain-suggest-do"><button type="button" onClick={() => decide(s, true)}>Add</button><button type="button" className="text-button" onClick={() => decide(s, false)}>Not now</button></span>
      </li>)}</ul>
    </section>}
    <div className="brain-layout">
      <section className="brain-map glass" aria-label="Graph">
        <h2 className="brain-map-title">Map</h2>
        {graph ? <Graph graph={graph} selected={selected} query={query} onPick={pick} /> : <p className="board-note">Loading.</p>}
        <p className="brain-foot muted">{graph && `${notes.length} notes, ${fileCount} file${fileCount === 1 ? '' : 's'}`}{folder && <> in {folder}. Open that folder in Obsidian to see the same graph.</>}</p>
      </section>
      <aside className={`brain-side glass ${dragging ? 'dragging' : ''}`} aria-label="Note"
        onDragOver={e => { if (note && !editing) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}>
        {problem && <p className="problem" role="alert">{problem}</p>}
        {editing ? <form className="brain-edit" onSubmit={e => { e.preventDefault(); void save(); }}>
          <h2>{editing.was ? `Edit ${editing.was}` : 'New note'}</h2>
          <label htmlFor="brain-title">Title</label>
          <input id="brain-title" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} disabled={editing.hub} required />
          <label htmlFor="brain-up">Under</label>
          <select id="brain-up" value={editing.up} onChange={e => setEditing({ ...editing, up: e.target.value })} disabled={editing.hub}>
            <option value="">Nothing</option>
            {notes.filter(n => n.title !== editing.was).map(n => <option key={n.id} value={n.title}>{n.title}</option>)}
          </select>
          <label htmlFor="brain-text">Note</label>
          <textarea id="brain-text" rows={12} value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} placeholder="Write anything. Link another note with [[its title]]." />
          <div className="brain-actions"><button type="submit" className="primary" disabled={Boolean(busy) || !editing.title.trim()}>{busy || 'Save'}</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel</button></div>
        </form> : note ? <article className="brain-note" aria-labelledby="brain-note-h">
          <p className="brain-crumb muted">{note.up ? <>Under <button type="button" className="text-button brain-link" onClick={() => open(note.up!)}>{note.up}</button></> : 'Where everything starts'}</p>
          <h2 id="brain-note-h">{note.title}</h2>
          <Body text={note.body} open={open} />
          <h3 className="brain-files-h">Files</h3>
          {note.files.length ? <ul className="brain-files">{note.files.map(f => <li key={f}>
            <span className="brain-file-name">{f}</span>
            <span className="brain-file-do">
              <a href={`/api/brain/file?name=${encodeURIComponent(f)}`} download={f}>Download</a>
              {readable.test(f) && <button type="button" className="text-button" onClick={() => askAbout(f)}>Ask Taurus about it</button>}
              <button type="button" className="text-button" onClick={() => api.detachFile(note.title, f).then(r => { setNote(r.note); setGraph(r.graph); }).catch(e => setProblem((e as Error).message))}>Remove</button>
            </span>
          </li>)}</ul> : <p className="muted">No files yet.</p>}
          <div className="brain-drop">
            <input ref={fileInput} id="brain-file" type="file" className="sr-only" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.json,.doc,.docx,.pptx" onChange={e => void upload(e.target.files)} />
            <label htmlFor="brain-file">{busy === 'Adding' ? 'Adding' : 'Drop a file here, or choose one'}</label>
          </div>
          <div className="brain-actions">
            <button type="button" onClick={() => setEditing({ title: note.title, body: note.body, up: note.up ?? '', was: note.title, hub: note.hub })}>Edit</button>
            {!note.hub && <button type="button" className="text-button" onClick={() => void remove()}>Move to trash</button>}
          </div>
        </article> : <p className="brain-hint">Pick a dot to read what Taurus knows about you. It’s all plain notes on this Mac.</p>}
        {!editing && <nav className="brain-outline" aria-label="All notes">
          <h3>{q ? `${found.length} found` : 'All notes'}</h3>
          {q ? <ul>{found.map(n => <li key={n.id}>{item(n)}</li>)}</ul>
            : <ul>{hubs.map(h => <li key={h.id}>{item(h, true)}
              {under(h.title).length > 0 && <ul>{under(h.title).map(n => <li key={n.id}>{item(n)}</li>)}</ul>}
            </li>)}{loose.map(n => <li key={n.id}>{item(n)}</li>)}</ul>}
        </nav>}
      </aside>
    </div>
    <BrainMemory open={open} />
  </main>;
}
