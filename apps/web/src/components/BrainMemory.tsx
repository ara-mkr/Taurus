import { useCallback, useEffect, useState } from 'react';
import { api, type BrainMemory as Memory, type RecallFact } from '../api';

// Core memory and recall (Luke's Day 2, November 20, 2026: "more memory makes your agent worse and costs you more").
// The Brain page's Memory panel: what goes with every question (core memory, against its 3,000 character budget),
// what the last question actually sent out of everything saved, a box to try a question, and a copy of the memory to
// paste into Claude or ChatGPT. The same works by voice: "always ...", "pin ...", "unpin ...", "how much memory are you
// using", "what do you know about my ...".

const fmt = (n: number) => n.toLocaleString('en-US');
const tokens = (chars: number) => fmt(Math.round(chars / 4));

function Facts({ facts, open }: { facts: RecallFact[]; open: (title: string) => void }) {
  return <ul className="brain-mem-facts">{facts.map(f => <li key={f.id}>
    <span>{f.text}</span>
    {f.from === 'note' && f.where ? <button type="button" className="text-button brain-link muted" onClick={() => open(f.where!.split(',')[0])}>{f.where}</button>
      : <span className="muted">{f.from === 'memory' ? 'Something you asked me to remember' : f.where}</span>}
  </li>)}</ul>;
}

export function BrainMemory({ open }: { open: (title: string) => void }) {
  const [m, setM] = useState<Memory | null>(null);
  const [text, setText] = useState('');
  const [trial, setTrial] = useState('');
  const [tried, setTried] = useState<{ q: string; facts: RecallFact[]; pool: number; sentChars: number; poolChars: number } | null>(null);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const [showKey, setShowKey] = useState(false);

  const load = useCallback(() => { api.brainMemory().then(setM).catch(e => setProblem((e as Error).message)); }, []);
  useEffect(() => {
    load();
    const again = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [load]);

  async function pin() {
    if (!text.trim()) return;
    setProblem('');
    try { setM(await api.pinCore(text)); setText(''); } catch (e) { setProblem((e as Error).message); }
  }
  async function unpin(id: string) {
    try { setM(await api.unpinCore(id)); } catch (e) { setProblem((e as Error).message); }
  }
  async function tryIt() {
    if (!trial.trim()) return;
    try { setTried({ q: trial.trim(), ...(await api.recallPreview(trial)) }); } catch (e) { setProblem((e as Error).message); }
  }
  async function copy() {
    setProblem(''); setSaid('');
    try { const { text: block } = await api.memoryExport(); await navigator.clipboard.writeText(block); setSaid('Copied. Paste it into Claude’s or ChatGPT’s custom instructions, or a Claude Project.'); }
    catch (e) { setProblem((e as Error).message || 'Copying didn’t work here.'); }
  }

  async function toggle(what: 'picker' | 'sharing', on: boolean) {
    setProblem('');
    try { setM(await (what === 'picker' ? api.setRecallPicker(on) : api.setMemorySharing(on))); } catch (e) { setProblem((e as Error).message); }
  }
  async function copyText(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); setSaid(done); } catch { setProblem('Copying didn’t work here. Select the text and copy it.'); }
  }
  const sh = m?.sharing;
  const claudeCommand = sh?.key ? `claude mcp add --transport http taurus-memory ${sh.url} --header "Authorization: Bearer ${sh.key}"` : '';

  const last = m?.stats.last;
  const saved = m && m.stats.charsAll > m.stats.charsSent ? m.stats.charsAll - m.stats.charsSent : 0;
  return <section className="brain-memory glass" aria-labelledby="brain-mem-h">
    <div className="brain-mem-head">
      <h2 id="brain-mem-h">Memory</h2>
      <p className="muted">Taurus sends core memory with every question, and only the saved facts that fit it. Everything else stays on this Mac.</p>
    </div>
    {problem && <p className="problem" role="alert">{problem}</p>}
    <div className="brain-mem-cols">
      <div className="brain-mem-col">
        <h3>Core memory</h3>
        {m && <p className="brain-mem-meter">
          <label htmlFor="brain-core-meter">{fmt(m.used)} of {fmt(m.budget)} characters</label>
          <meter id="brain-core-meter" min={0} max={m.budget} high={m.budget * 0.9} value={m.used}>{fmt(m.used)}</meter>
        </p>}
        {m && (m.core.length ? <ul className="brain-mem-core">{m.core.map(c => <li key={c.id}>
          <span>{c.text}</span>
          <span className="muted">{c.kind === 'rule' ? 'Rule' : 'Fact'}</span>
          <button type="button" className="text-button" aria-label={`Unpin ${c.text}`} onClick={() => void unpin(c.id)}>Unpin</button>
        </li>)}</ul> : <p className="muted">Nothing pinned. Pin the few things that matter in every answer, like your name, your job, and how you sign emails.</p>)}
        <form className="brain-mem-add" onSubmit={e => { e.preventDefault(); void pin(); }}>
          <label htmlFor="brain-core-new" className="sr-only">Pin a rule or fact</label>
          <input id="brain-core-new" type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Always sign emails as …" maxLength={400} autoComplete="off" />
          <button type="submit" disabled={!text.trim()}>Pin</button>
        </form>
        <p className="muted brain-mem-say">Or say “always …”, “never …”, “pin …” or “unpin …”.</p>
      </div>
      <div className="brain-mem-col">
        <h3>What Taurus sends</h3>
        {m && <p>{fmt(m.facts)} facts saved, {fmt(m.chars)} characters.{m.stats.questions > 0 && saved > 0 && <> Across {fmt(m.stats.questions)} question{m.stats.questions === 1 ? '' : 's'}, about {tokens(saved)} tokens not sent.</>}</p>}
        {last ? <>
          <p className="muted">Last question, “{last.asked}”: {last.facts.length} of {fmt(last.pool)} facts, {fmt(last.sentChars)} characters{last.poolChars ? ` instead of ${fmt(last.poolChars)}` : ''}.</p>
          {last.facts.length > 0 && <Facts facts={last.facts} open={open} />}
        </> : <p className="muted">Ask Taurus something and you’ll see here what it sent.</p>}
        <form className="brain-mem-add" onSubmit={e => { e.preventDefault(); void tryIt(); }}>
          <label htmlFor="brain-recall-try" className="sr-only">Try a question</label>
          <input id="brain-recall-try" type="search" value={trial} onChange={e => setTrial(e.target.value)} placeholder="Try a question" autoComplete="off" />
          <button type="submit" disabled={!trial.trim()}>Try</button>
        </form>
        {tried && <div aria-live="polite">
          <p className="muted">{tried.facts.length ? `For “${tried.q}”, Taurus would send ${tried.facts.length} of ${fmt(tried.pool)} facts, ${fmt(tried.sentChars)} characters.` : `Nothing saved fits “${tried.q}”. Only core memory would go.`}</p>
          {tried.facts.length > 0 && <Facts facts={tried.facts} open={open} />}
        </div>}
        {m && <label className="brain-mem-switch switch-label">
          <span><strong>Sharper recall</strong><span className="muted">When lots of saved facts fit, your fastest AI picks the few that help. Say “turn off sharper recall” to stop.</span></span>
          <input type="checkbox" role="switch" checked={m.picker} onChange={e => void toggle('picker', e.target.checked)} />
        </label>}
        <div className="brain-actions">
          <button type="button" className="glass-button" onClick={() => void copy()}>Copy for other AIs</button>
          {said && <span className="muted" role="status">{said}</span>}
        </div>
      </div>
    </div>
    {sh && <div className="brain-mem-share">
      <label className="brain-mem-switch switch-label">
        <span><strong>Use this memory in your other AI apps</strong><span className="muted">Claude Code, Claude Desktop, Cursor and other apps on this Mac can search it and suggest additions, which wait for your Add. Nothing on your network or the internet can reach it. Or say “let Claude use my memory”.</span></span>
        <input type="checkbox" role="switch" checked={sh.on} onChange={e => void toggle('sharing', e.target.checked)} />
      </label>
      {sh.on && sh.key && <dl className="brain-mem-conn">
        <dt>Address</dt><dd><code>{sh.url}</code></dd>
        <dt>Key</dt><dd><code>{showKey ? sh.key : `${sh.key.slice(0, 6)}…`}</code> <button type="button" className="text-button" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</button></dd>
        <dt>Claude Code</dt><dd><button type="button" className="glass-button" onClick={() => void copyText(claudeCommand, 'Copied. Paste it in Terminal; Claude Code then has your memory in every chat.')}>Copy the command</button></dd>
        <dt>Used</dt><dd>{sh.uses ? `${fmt(sh.uses)} time${sh.uses === 1 ? '' : 's'}${sh.lastUse ? `, last by ${sh.lastUse.app}` : ''}` : 'Not yet'}</dd>
      </dl>}
    </div>}
  </section>;
}
