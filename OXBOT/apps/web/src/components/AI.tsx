import { useEffect, useState } from 'react';
import { api, type AiInfo, type ConnectorInfo } from '../api';
import { Connector } from './Connections';

// Which AI writes the brief, builds boards and answers Ask. OXBOT Free is OpenRouter's free models on your own
// free account; every other lab takes your own key. Owner, October 31, 2026.
export function AI() {
  const [info, setInfo] = useState<AiInfo | null>(null);
  const [list, setList] = useState<ConnectorInfo[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () => Promise.all([api.ai(), api.connectors()]).then(([a, c]) => { setInfo(a); setList(c.connectors); }).catch(e => setError(e.message));
    void load();
    // Sign-in finishes in the browser: show it when you come back.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  async function save(next: { provider?: string; freeModel?: string }) {
    setBusy(true); setError('');
    // Show the choice at once; the server's answer replaces it a moment later.
    setInfo(i => i && { ...i, chosen: next.provider ?? i.chosen, freeModel: next.freeModel ?? i.freeModel });
    try { setInfo(await api.saveAi(next)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function connectorsChanged(next: ConnectorInfo[]) { setList(next); setInfo(await api.ai()); }

  const free = info?.providers.find(p => p.free);
  const connected = info?.providers.filter(p => p.connected) ?? [];
  const planIds = new Set(info?.providers.filter(p => p.plan).map(p => p.id) ?? []);
  const plans = list.filter(c => planIds.has(c.id));
  const others = list.filter(c => c.group === 'AI' && c.id !== 'openrouter' && !planIds.has(c.id));
  const n = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
  // What each app reported about the plan's own limits, in words; anything we can't read is left out rather than guessed.
  const limitLine = (limits: unknown): string => {
    if (!limits || typeof limits !== 'object') return '';
    const l = limits as Record<string, { used_percent?: number; window_minutes?: number } | number | string>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(l)) {
      if (v && typeof v === 'object' && typeof v.used_percent === 'number') parts.push(`${Math.round(v.used_percent)}% of the ${v.window_minutes ? (v.window_minutes >= 1440 ? 'weekly' : `${Math.round(v.window_minutes / 60)}-hour`) : k} limit used`);
      else if (k === 'utilization' && typeof v === 'number') parts.push(`${Math.round(v <= 1 ? v * 100 : v)}% of the limit used`);
      else if (k === 'status' && typeof v === 'string') parts.push(`Limit status: ${v.replace(/_/g, ' ')}`);
    }
    return parts.join(' · ');
  };
  const onMac = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  return <main id="main" tabIndex={-1} className="connections ai">
    <div className="page-head"><h1>AI</h1></div>
    {info && <p className="lede">{info.using
      ? <>Writing with <strong>{info.using.name}</strong>, model <code>{info.using.model}</code>. It writes your brief, builds boards from a sentence, and answers Ask.</>
      : <>No AI is connected, so your brief is written by simple rules. OXBOT Free costs nothing and takes a minute.</>}</p>}
    {error && <p className="problem">{error}</p>}

    {/* Plans you already pay for (owner, November 6, 2026: "directly use ur existing claude, openai, or gemini, kimi, glm
        subscription with this not just api key and if u do that u can see how much of ur usage u have"). */}
    {info && plans.length > 0 && <section aria-labelledby="plans">
      <h2 id="plans">Use a plan you already pay for</h2>
      <p>No API key. Claude, ChatGPT and Gemini plans work through each company’s own app on this Mac, signed in with your plan: Claude Code, Codex and Gemini CLI. OXBOT runs them with their tools off, so they only answer. Kimi and GLM coding plans use the key from your plan.</p>
      {plans.map(c => { const p = info.providers.find(x => x.id === c.id); return <div key={c.id} className="plan-row">
        <Connector c={c} onChange={connectorsChanged} />
        {p?.installed === false && <p className="muted plan-note">{c.name.split(' (')[0]} needs its app on this Mac first: <a href={p.keyUrl} target="_blank" rel="noreferrer">install it</a>, open Terminal, run it once and sign in.</p>}
      </div>; })}
      {info.usage && info.usage.length > 0 && <div className="plan-usage">
        <h3>How much you’ve used through OXBOT</h3>
        <table><thead><tr><th scope="col">Plan</th><th scope="col">Today</th><th scope="col">7 days</th><th scope="col">30 days</th><th scope="col">Plan limits</th></tr></thead>
          <tbody>{info.usage.map(u => <tr key={u.id}>
            <th scope="row">{info.providers.find(p => p.id === u.id)?.name ?? u.name}</th>
            <td>{u.today.calls} asks{u.today.input + u.today.output ? `, ${n(u.today.input + u.today.output)} tokens` : ''}</td>
            <td>{u.week.calls} asks{u.week.input + u.week.output ? `, ${n(u.week.input + u.week.output)} tokens` : ''}</td>
            <td>{u.month.calls} asks{u.month.cost ? `, worth $${u.month.cost.toFixed(2)} at API prices` : ''}</td>
            <td>{limitLine(u.limits) || 'Not reported'}</td>
          </tr>)}</tbody>
        </table>
        <p className="muted">Counted from what each app reports back for OXBOT’s questions. Your plan’s full usage, including what you use elsewhere, is in that company’s own app or account page.</p>
      </div>}
    </section>}

    {info && free && <section aria-labelledby="free">
      <h2 id="free">OXBOT Free</h2>
      <p>Free models, including NVIDIA’s Nemotron 3 Ultra, through your own free OpenRouter account. There’s no OXBOT account and nothing to pay. Free models have daily limits.</p>
      <p className="muted">Free models are run by companies that may keep what you send and use it to improve their models. Each time, OXBOT sends your question and the facts on your board: names, email subjects, meetings and health numbers. If that matters, use a paid lab below.</p>
      {!free.connected ? <div className="actions">
        {onMac ? <a className="button primary" href="/api/ai/openrouter/start">Sign in with OpenRouter</a>
          : <p className="muted">Sign in on your Mac: Settings, then AI. This phone uses the same AI afterwards.</p>}
      </div> : <>
        <label className="ai-model">Free model
          <select value={info.freeModel || info.free[0]?.id || ''} disabled={busy} onChange={e => save({ freeModel: e.target.value })}>
            {info.free.map(m => <option key={m.id} value={m.id}>{m.name}{m.context ? ` · ${Math.round(m.context / 1000)}k context` : ''}</option>)}
            {info.freeModel && !info.free.some(m => m.id === info.freeModel) && <option value={info.freeModel}>{info.freeModel}</option>}
          </select>
        </label>
        <div className="actions">
          {info.using?.id !== 'openrouter' && <button type="button" className="primary" disabled={busy} onClick={() => save({ provider: 'openrouter' })}>Use OXBOT Free</button>}
          <button type="button" className="text-button" disabled={busy} onClick={async () => { if (confirm('Sign out of OpenRouter? OXBOT forgets the key. You can sign in again any time.')) await connectorsChanged((await api.disconnect('openrouter')).connectors); }}>Sign out</button>
        </div>
      </>}
    </section>}

    {info && connected.length > 1 && <section aria-labelledby="pick">
      <h2 id="pick">Which one writes</h2>
      <fieldset className="ai-pick" disabled={busy}>
        <legend className="sr-only">Which AI writes</legend>
        <label className="check"><input type="radio" name="ai" checked={!info.chosen || !connected.some(p => p.id === info.chosen)} onChange={() => save({ provider: '' })} /> Whichever is connected, paid labs first</label>
        {connected.map(p => <label key={p.id} className="check"><input type="radio" name="ai" checked={info.chosen === p.id} onChange={() => save({ provider: p.id })} /> {p.name}{p.maker !== p.name ? ` (${p.maker})` : ''}</label>)}
      </fieldset>
    </section>}

    <section aria-labelledby="labs">
      <h2 id="labs">Your own AI</h2>
      <p className="muted">Paste a key from any lab below. You pay that lab for what you use; OXBOT adds nothing. Keys stay on this Mac.</p>
      {others.map(c => <Connector key={c.id} c={c} onChange={connectorsChanged} />)}
    </section>
  </main>;
}
