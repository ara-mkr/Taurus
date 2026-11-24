import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { api, type BrainNote } from '../api';
import { PixelIcon } from './PixelIcon';

// Legal (owner, November 22, 2026: "completely remove profinder ... just make a tab called Legal u put resume and all
// stuff legal ... corporate"). Your resume, contracts, company papers, taxes and IDs, each section a note under "Legal"
// in the Brain (~/.taurus/brain on this Mac) with the files attached to it. Nothing new is stored and nothing leaves the
// Mac: it is the Brain's own notes and attachments, shown as folders. The resume ProFinder kept ("Resume", under Career)
// is the Resume section here, and moves under Legal the first time you add to it.

const HUB = 'Legal';
const SECTIONS: { title: string; about: string }[] = [
  { title: 'Resume', about: 'Your current resume and older versions.' },
  { title: 'Contracts', about: 'Offer letters, NDAs, leases and anything else you signed.' },
  { title: 'Company papers', about: 'Incorporation, operating agreement, cap table, EIN letter, minutes.' },
  { title: 'Taxes', about: 'Returns, W-2s, 1099s and receipts.' },
  { title: 'IDs and licenses', about: 'Scans of IDs, licenses and certificates.' },
];
const MAX_FILES = 10;
const extOf = (name: string) => (name.split('.').pop() ?? '').slice(0, 4).toUpperCase() || 'FILE';
const intro = (about: string) => `${about}\n`;

function Section({ title, about, note, onChange }: { title: string; about: string; note: BrainNote | null; onChange: (n: BrainNote) => void }) {
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [over, setOver] = useState(false);
  const [confirm, setConfirm] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const headId = useId();
  const files = note?.files ?? [];
  useEffect(() => { if (!confirm) return; const t = window.setTimeout(() => setConfirm(''), 4000); return () => window.clearTimeout(t); }, [confirm]);

  const add = async (list: FileList | File[]) => {
    const picked = [...list].slice(0, MAX_FILES);
    if (!picked.length) return;
    setProblem('');
    try {
      // The hub and this section are made the first time something goes in; the resume moves under Legal then.
      if (!note || note.up !== HUB) {
        await api.saveNote({ title: HUB, body: 'Your resume, contracts and company papers. Each section is a note here with its files.\n' }).catch(() => undefined);
        await api.saveNote({ title, up: HUB, body: note?.body || intro(about) });
      }
      let last: BrainNote | null = null;
      for (const [i, f] of picked.entries()) { setBusy(`Adding ${i + 1} of ${picked.length}`); last = (await api.attachFile(title, f)).note; }
      if (last) onChange(last);
    } catch (e) { setProblem((e as Error).message); }
    finally { setBusy(''); if (input.current) input.current.value = ''; }
  };
  const remove = async (name: string) => {
    if (confirm !== name) { setConfirm(name); return; }
    setConfirm(''); setProblem('');
    try { onChange((await api.detachFile(title, name)).note); } catch (e) { setProblem((e as Error).message); }
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) void add(e.dataTransfer.files); };

  return <section className={`deck-win legal-section ${over ? 'drop-over' : ''}`} aria-labelledby={headId}
    onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={drop}>
    <header className="deck-bar"><h2 id={headId}>{title}</h2><span className="deck-count">{files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'}` : 'Empty'}</span></header>
    <div className="legal-body">
      <p className="legal-about">{about}</p>
      {files.length > 0 && <ul className="legal-files">
        {files.map(f => <li key={f}>
          <span className="legal-ext" aria-hidden="true">{extOf(f)}</span>
          <a className="legal-name" href={`/api/brain/file?name=${encodeURIComponent(f)}`} download={f}>{f}</a>
          <button type="button" className="legal-remove" onClick={() => void remove(f)} aria-label={confirm === f ? `Remove ${f} for good` : `Remove ${f}`}>{confirm === f ? 'Sure?' : 'Remove'}</button>
        </li>)}
      </ul>}
      <div className="legal-add">
        <button type="button" className="deck-chip" onClick={() => input.current?.click()} disabled={Boolean(busy)}>{busy || 'Add files'}</button>
        <span className="legal-hint">or drop them here</span>
        <input ref={input} type="file" multiple hidden onChange={e => e.target.files && void add(e.target.files)} />
      </div>
      {problem && <p className="legal-problem" role="alert">{problem}</p>}
    </div>
  </section>;
}

async function fetchSections() {
  const { graph } = await api.brain();
  const exists = new Set(graph.nodes.filter(n => n.kind !== 'missing' && n.kind !== 'file').map(n => n.title));
  // Your own sections: any other note filed under Legal.
  const mine = graph.nodes.filter(n => n.up === HUB && n.kind !== 'file' && !SECTIONS.some(s => s.title === n.title)).map(n => n.title);
  const titles = [...SECTIONS.map(s => s.title), ...mine];
  const got = await Promise.all(titles.map(t => exists.has(t) ? api.brainNote(t).then(r => r.note).catch(() => null) : Promise.resolve(null)));
  return { notes: Object.fromEntries(titles.map((t, i) => [t, got[i]])) as Record<string, BrainNote | null>, mine };
}

export function LegalPage() {
  const [notes, setNotes] = useState<Record<string, BrainNote | null>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState('');
  const [naming, setNaming] = useState('');

  // Read every section's note from the Brain; the state is set only once the answers are back.
  const load = useCallback(() => fetchSections().then(r => { setNotes(r.notes); setExtra(r.mine); setProblem(''); })
    .catch(e => setProblem((e as Error).message)).finally(() => setLoaded(true)), []);
  useEffect(() => { let live = true; fetchSections().then(r => { if (live) { setNotes(r.notes); setExtra(r.mine); } })
    .catch(e => { if (live) setProblem((e as Error).message); }).finally(() => { if (live) setLoaded(true); }); return () => { live = false; }; }, []);

  const addSection = async () => {
    const title = naming.trim().slice(0, 60);
    if (!title || title === HUB || title in notes) { setNaming(''); return; }
    try {
      await api.saveNote({ title: HUB, body: 'Your resume, contracts and company papers. Each section is a note here with its files.\n' }).catch(() => undefined);
      const { note } = await api.saveNote({ title, up: HUB, body: '\n' });
      setNotes(n => ({ ...n, [title]: note })); setExtra(x => [...x, title]); setNaming('');
    } catch (e) { setProblem((e as Error).message); }
  };
  const total = Object.values(notes).reduce((sum, n) => sum + (n?.files.length ?? 0), 0);

  return <main id="main" tabIndex={-1} className="legal deck-look">
    <header className="legal-head">
      <p className="legal-kicker"><PixelIcon name="book" /> Legal</p>
      <h1>Your papers, in one place.</h1>
      <p className="legal-sub">Resume, contracts, company papers, taxes and IDs. They stay on this Mac in your Brain, under Legal{loaded ? ` · ${total} ${total === 1 ? 'file' : 'files'}` : ''}.</p>
    </header>
    {problem && <p className="legal-problem" role="alert">{problem} <button type="button" className="deck-chip" onClick={() => void load()}>Try again</button></p>}
    {!loaded ? <p className="legal-sub">Opening your papers.</p> : <div className="legal-grid">
      {SECTIONS.map(s => <Section key={s.title} title={s.title} about={s.about} note={notes[s.title] ?? null} onChange={n => setNotes(x => ({ ...x, [s.title]: n }))} />)}
      {extra.map(t => <Section key={t} title={t} about="Your own section." note={notes[t] ?? null} onChange={n => setNotes(x => ({ ...x, [t]: n }))} />)}
      <form className="deck-win legal-new" onSubmit={e => { e.preventDefault(); void addSection(); }}>
        <header className="deck-bar"><h2>New section</h2></header>
        <div className="legal-body">
          <label className="legal-about" htmlFor="legal-new-name">A folder of your own, like Insurance or Immigration.</label>
          <div className="legal-add">
            <input id="legal-new-name" type="text" value={naming} maxLength={60} placeholder="Name" onChange={e => setNaming(e.target.value)} />
            <button type="submit" className="deck-chip" disabled={!naming.trim()}>Add</button>
          </div>
        </div>
      </form>
    </div>}
  </main>;
}
