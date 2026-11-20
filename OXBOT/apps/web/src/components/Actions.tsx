import { useCallback, useEffect, useState } from 'react';
import { api, ago, type ActionsInfo, type ConnectorInfo, type Grant, type Proposal } from '../api';
import { ApprovalCard } from './Approval';
import { Connector } from './Connections';

// Settings, then Actions (owner, November 1, 2026): what Taurus may do, each permission its own step, and
// everything it proposed and did. Reading stays on the Connections page.

const asRow = (g: Grant): ConnectorInfo => ({
  id: g.id, name: g.name, group: 'Hub', reads: g.does, auth: g.auth, mockOnly: true, connected: g.allowed, ready: g.ready, oneClick: false,
  missing: g.missing, fields: g.fields, setup: g.setup, setupUrl: g.setupUrl, redirectUri: g.redirectUri, lastError: g.lastError,
});
const states: Record<Proposal['state'], string> = { pending: 'Waiting', running: 'Working', done: 'Done', failed: 'Failed', unknown: 'Unknown', declined: 'Declined', expired: 'Expired' };

export function Actions({ onChange }: { onChange: (p: Proposal) => void }) {
  const [info, setInfo] = useState<ActionsInfo | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.actions().then(setInfo).catch(e => setError(e.message)), []);
  useEffect(() => { void load(); window.addEventListener('focus', load); return () => window.removeEventListener('focus', load); }, [load]);
  const allowed = info?.grants.filter(g => g.allowed).length ?? 0;
  const waiting = info?.log.filter(p => p.state === 'pending') ?? [];
  const past = info?.log.filter(p => !waiting.includes(p)) ?? [];

  return <main id="main" tabIndex={-1} className="connections actions-page">
    <div className="page-head"><h1>Actions</h1>{info && <span className="muted">{allowed} of {info.grants.length} allowed</span>}</div>
    <p className="lede">Taurus does something only after you approve that exact action: who it goes to, the words, and for food the item, place and total. Approvals expire after 15 minutes, food after 10. Every action is kept in the list below.</p>
    {error && <p className="problem">{error}</p>}
    {waiting.length > 0 && <section aria-labelledby="a-waiting">
      <h2 id="a-waiting">Waiting for your OK</h2>
      {waiting.map(p => <ApprovalCard key={p.id} p={p} onChange={next => { onChange(next); void load(); }} />)}
    </section>}
    {info && <section aria-labelledby="a-may">
      <h2 id="a-may">What Taurus may do</h2>
      <p className="muted">Each is separate from reading. Taking one away never touches the connection it reads with.</p>
      {info.grants.map(g => <Connector key={g.id} c={asRow(g)} allow onChange={() => void load()} />)}
    </section>}
    {info && <section aria-labelledby="a-log">
      <h2 id="a-log">What it did</h2>
      {past.length === 0 ? <p className="muted">Nothing yet. Ask Taurus to reply, text, call or order, and it shows here.</p>
        : <ul className="action-log">{past.map(p => <li key={p.id}>
          <span className="action-log-title">{p.title}</span>
          <span className={p.state === 'failed' || p.state === 'unknown' ? 'problem' : 'muted'}>{states[p.state]}{p.via && p.state !== 'expired' ? `, ${p.via === 'voice' ? 'by voice' : `on the ${p.via === 'board' ? 'board' : p.via === 'ring' ? 'ring screen' : 'phone'}`}` : ''} · {ago(p.decidedAt ?? p.createdAt)}</span>
          {p.result && <span className="muted action-log-result">{p.result}</span>}
        </li>)}</ul>}
    </section>}
  </main>;
}
