import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Scan, type ScanSource, type ScansInfo } from '../api';

// Scans (owner, November 16, 2026: "make it so like a scan of whatever u want and u can set it make it default like a
// scan of ur emails and stuff to update ur schedule and looks for ur messages and constantly gives u updates"). Ox reads
// the sources you pick every few minutes, on a free model, and tells you only what's new. Anything that would send a
// reply or change your calendar waits for your OK in Actions.

const sourceNames: Record<ScanSource, string> = { email: 'Email', calendar: 'Calendar', messages: 'Messages on this Mac', chat: 'Chat (Slack, Teams)' };
const blank: Partial<Scan> = { name: '', sources: ['email', 'calendar'], everyMinutes: 30, instruction: '', ai: 'free', on: true };
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function Scans() {
  const [info, setInfo] = useState<ScansInfo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [edit, setEdit] = useState<Partial<Scan> | null>(null);
  const load = useCallback(() => api.scans().then(setInfo).catch(e => setError((e as Error).message)), []);
  useEffect(() => {
    void load();
    // New feed lines arrive while the page is open.
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const run = async (what: string, job: () => Promise<unknown>) => {
    setBusy(what); setError('');
    try {
      const next = await job();
      if (next && typeof next === 'object' && 'scans' in next) { setInfo(next as ScansInfo); if ((next as ScansInfo).error) setError((next as ScansInfo).error!); }
      else await load();
      return true;
    } catch (e) { setError((e as Error).message); return false; } finally { setBusy(''); }
  };
  const save = async (e: FormEvent) => { e.preventDefault(); if (edit && await run('save', () => api.saveScan(edit))) setEdit(null); };
  const toggleSource = (s: ScanSource) => setEdit(x => x && { ...x, sources: x.sources?.includes(s) ? x.sources.filter(y => y !== s) : [...(x.sources ?? []), s] });
  const m = info?.messages;

  return <main id="main" tabIndex={-1} className="settings-page skills-page scans-page">
    <div className="page-head"><h1>Scans</h1></div>
    <p className="muted">Every few minutes Ox reads what you pick, keeps only what he hasn’t told you before, and posts it below. He catches meetings and deadlines for your calendar and drafts replies to people waiting on you. Replies and calendar changes wait for your OK in Actions. Scans use OXBOT Free, so they cost nothing; when nothing is new, no AI is asked at all.</p>
    {error && <p className="problem" role="alert">{error}</p>}

    <section aria-labelledby="scans-h">
      <div className="section-row"><h2 id="scans-h">Your scans</h2>
        <button type="button" className="text-button" onClick={() => setEdit({ ...blank })}>Add a scan</button>
      </div>
      {edit && <form className="scan-edit skill-edit" onSubmit={save} aria-label={edit.id ? 'Edit scan' : 'New scan'}>
        <label>Name<input type="text" required maxLength={80} value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Investor emails" /></label>
        <fieldset className="scan-sources"><legend>What to read</legend>
          {(info?.sources ?? ['email', 'calendar', 'messages', 'chat'] as ScanSource[]).map(s => <label key={s} className="check"><input type="checkbox" checked={Boolean(edit.sources?.includes(s))} onChange={() => toggleSource(s)} /> {sourceNames[s]}</label>)}
        </fieldset>
        <label>Every<span className="scan-every"><input type="number" min={5} max={1440} step={5} required value={edit.everyMinutes ?? 30} onChange={e => setEdit({ ...edit, everyMinutes: Number(e.target.value) })} /> minutes</span></label>
        <label>What Ox should look for<textarea rows={3} maxLength={1000} value={edit.instruction ?? ''} onChange={e => setEdit({ ...edit, instruction: e.target.value })} placeholder="Anything from investors, and anything due this week" /></label>
        <label>Which AI<select value={edit.ai ?? 'free'} onChange={e => setEdit({ ...edit, ai: e.target.value === 'mine' ? 'mine' : 'free' })}>
          <option value="free">OXBOT Free (costs nothing)</option>
          <option value="mine">The AI you picked for Ask</option>
        </select></label>
        <div className="actions">
          <button type="submit" className="primary" disabled={busy === 'save' || !edit.sources?.length}>{busy === 'save' ? 'Saving' : 'Save'}</button>
          <button type="button" className="text-button" onClick={() => setEdit(null)}>Cancel</button>
        </div>
      </form>}
      <ul className="row-list">{info?.scans.map(s => <li key={s.id} className="row">
        <div className="row-main">
          <p className="strong">{s.name}</p>
          <p className="muted">{s.sources.map(x => sourceNames[x]).join(', ')} · every {s.everyMinutes} minutes · {s.ai === 'free' ? 'OXBOT Free' : 'your AI'}</p>
          {s.lastRunAt && <p className="muted">Last ran {when(s.lastRunAt)}: {s.lastNote}</p>}
          {s.lastError && <p className="problem">{s.lastError}</p>}
        </div>
        <label className="switch-label"><input type="checkbox" role="switch" checked={s.on} onChange={e => void run(s.id, () => api.saveScan({ id: s.id, on: e.target.checked }))} /><span className="sr-only">{s.name} on</span></label>
        <button type="button" className="text-button" disabled={busy === `run-${s.id}`} onClick={() => void run(`run-${s.id}`, () => api.runScan(s.id))}>{busy === `run-${s.id}` ? 'Scanning' : 'Run now'}</button>
        <span className="row-actions">
          <button type="button" className="text-button" onClick={() => setEdit({ ...s })}>Edit</button>
          {s.id !== 's-default' && <button type="button" className="text-button" onClick={() => { if (confirm(`Remove the scan “${s.name}”?`)) void run(s.id, () => api.removeScan(s.id)); }}>Remove</button>}
        </span>
      </li>)}</ul>
    </section>

    <section aria-labelledby="messages-h">
      <h2 id="messages-h">Messages on this Mac</h2>
      <p className="muted">Lets Ox read your iMessages and texts, read-only, for scans and when you ask about them. He can’t send anything without your OK. Off until you switch it on.</p>
      {m && <>
        <label className="switch-label messages-switch"><input type="checkbox" role="switch" checked={m.on} onChange={e => void run('messages', () => api.setMessages(e.target.checked))} disabled={m.state === 'not-mac'} /> Read Messages</label>
        {m.state === 'ready' && <p>Ox can read Messages{m.newest ? `. Newest message ${when(m.newest)}.` : '.'}</p>}
        {m.state === 'not-mac' && <p className="muted">{m.detail}</p>}
        {m.state === 'missing' && <p className="problem">{m.detail}</p>}
        {m.state === 'no-access' && <div className="messages-setup">
          <p className="problem">{m.detail} macOS keeps Messages private until you allow it once:</p>
          <ol>{m.steps?.map(step => <li key={step}>{step}</li>)}</ol>
          <p className="muted">Full Disk Access lets that app read any file on this Mac. OXBOT itself only opens the Messages database, read-only.</p>
          <button type="button" disabled={busy === 'check'} onClick={() => void run('check', () => api.scans())}>{busy === 'check' ? 'Checking' : 'Check again'}</button>
        </div>}
      </>}
    </section>

    <section aria-labelledby="feed-h">
      <h2 id="feed-h">What Ox noticed</h2>
      {info && info.feed.length === 0 && <p className="muted">Nothing yet. Switch a scan on, or press Run now.</p>}
      <ul className="row-list feed-list">{info?.feed.map(f => <li key={f.id} className="row feed-row">
        <div className="row-main">
          <p>{f.text}</p>
          <p className="muted">{when(f.at)}{f.source ? ` · ${f.source}` : ''}{f.url && <> · <a href={f.url} target="_blank" rel="noreferrer">Open</a></>}{f.proposal && <> · <a href="#actions">Review in Actions</a></>}</p>
          {f.draft && <details><summary>Drafted reply</summary><p className="schedule-last">{f.draft}</p></details>}
        </div>
      </li>)}</ul>
    </section>
  </main>;
}
