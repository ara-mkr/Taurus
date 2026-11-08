import { useEffect, useRef, useState } from 'react';
import { api, type Proposal } from '../api';

// One action OXBOT wants to take, shown exactly as it will go out (owner, November 1, 2026). Nothing runs until
// Approve is pressed here, on the phone, on the ring screen, or with a spoken yes on a call.

const left = (iso: string, now: number) => {
  const minutes = Math.ceil((Date.parse(iso) - now) / 60_000);
  return minutes <= 0 ? 'Expired' : minutes === 1 ? '1 minute left' : `${minutes} minutes left`;
};
const outcome: Record<string, string> = { done: 'Done', failed: 'Didn’t go through', unknown: 'Not sure it went through', declined: 'Declined', expired: 'Expired', running: 'Working' };
const verb = (p: Proposal) => p.purchase ? 'Approve' : /^(email|text|slack\.(post|reply))\./.test(p.kind) ? 'Approve and send' : p.kind.startsWith('call.') ? 'Approve and call' : 'Approve';

// level: the heading level that fits where the card sits (2 right under a page title, 3 under a section).
export function ApprovalCard({ p, via = 'board', onChange, level = 3 }: { p: Proposal; via?: 'board' | 'phone' | 'ring'; onChange?: (p: Proposal) => void; level?: 2 | 3 }) {
  const Title = level === 2 ? 'h2' : 'h3';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.text ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(t); }, []);
  useEffect(() => { if (editing) box.current?.focus(); }, [editing]);
  const open = p.state === 'pending' && Date.parse(p.expiresAt) > now;

  async function decide(approve: boolean) {
    setBusy(true); setProblem('');
    try {
      const { proposal } = approve ? await api.approve(p, editing && draft !== p.text ? draft : undefined, via) : await api.decline(p, via);
      onChange?.(proposal); setEditing(false);
      // Food has no ordering API: once approved, the delivery app opens at the place, ready to place.
      if (proposal.state === 'done' && proposal.open) window.open(proposal.open, '_blank', 'noopener');
    } catch (error) { setProblem((error as Error).message); }
    finally { setBusy(false); }
  }

  return <article className={`approval approval-${p.state}`} aria-labelledby={`ap-${p.id}`}>
    <p className="approval-meta"><span>{p.app}</span><span>{open ? left(p.expiresAt, now) : p.state === 'pending' ? 'Expired' : outcome[p.state] ?? p.state}</span></p>
    <Title id={`ap-${p.id}`} className="approval-title">{p.title}</Title>
    {p.purchase && <dl className="approval-lines purchase">
      <div><dt>Item</dt><dd>{p.purchase.item}</dd></div>
      <div><dt>Place</dt><dd>{p.purchase.place}</dd></div>
      <div><dt>Total</dt><dd className="strong">{p.purchase.total}</dd></div>
    </dl>}
    {p.text !== undefined && (editing
      ? <><label className="sr-only" htmlFor={`ed-${p.id}`}>Text to send</label><textarea id={`ed-${p.id}`} ref={box} className="approval-edit" rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))} value={draft} onChange={e => setDraft(e.target.value)} /></>
      : p.text && <blockquote className="approval-text">{p.text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</blockquote>)}
    {p.lines.length > 0 && <dl className="approval-lines">{p.lines.map((l, i) => <div key={i}><dt>{l.label}</dt><dd>{l.value}</dd></div>)}</dl>}
    {p.caution && open && <p className="approval-caution">{p.caution}</p>}
    {open ? <div className="approval-actions">
      <button type="button" className="primary" onClick={() => decide(true)} disabled={busy || (editing && !draft.trim())}>{busy ? 'Working' : editing ? 'Approve edited' : verb(p)}</button>
      {p.editable && <button type="button" onClick={() => { setDraft(p.text ?? ''); setEditing(!editing); }} disabled={busy}>{editing ? 'Undo edit' : 'Edit'}</button>}
      <button type="button" className="text-button" onClick={() => decide(false)} disabled={busy}>Decline</button>
    </div> : p.result && <p className={p.state === 'done' ? 'approval-result' : 'problem'} role="status">{p.result}{p.state === 'done' && p.open && <> <a href={p.open} target="_blank" rel="noreferrer">Open it again</a></>}</p>}
    {problem && <p className="problem" role="alert">{problem}</p>}
  </article>;
}

// Waiting actions float above every page, so one tap answers them wherever you are.
export function ApprovalTray({ waiting, hide = [], onChange }: { waiting: Proposal[]; hide?: string[]; onChange: (p: Proposal) => void }) {
  const [open, setOpen] = useState(true);
  const shown = waiting.filter(p => !hide.includes(p.id));
  if (!shown.length) return null;
  return <aside className="approval-tray" aria-label="Waiting for your OK">
    <div className="approval-tray-head">
      <h2>{shown.length === 1 ? 'Waiting for your OK' : `${shown.length} waiting for your OK`}</h2>
      <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
    </div>
    {open && <div className="approval-tray-list">{shown.map(p => <ApprovalCard key={p.id} p={p} onChange={onChange} />)}</div>}
  </aside>;
}
