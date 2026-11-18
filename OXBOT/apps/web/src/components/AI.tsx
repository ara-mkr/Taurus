import { useEffect, useState } from 'react';
import { api, type AiInfo, type ConnectorInfo, type PlanStatus } from '../api';
import { Connector } from './Connections';

// Asks that one AI to say hello, so you know it really answers, and how fast (November 16, 2026).
function TestAnswer({ id }: { id: string }) {
  const [state, setState] = useState<{ busy?: boolean; text?: string; error?: string }>({});
  return <p className="plan-status">
    <button type="button" className="text-button" disabled={state.busy} onClick={async () => {
      setState({ busy: true });
      try { const r = await api.aiTest(id); setState(r.ok ? { text: `Answered in ${(r.ms / 1000).toFixed(1)} s: “${r.text}”` } : { error: r.error }); }
      catch (e) { setState({ error: (e as Error).message }); }
    }}>{state.busy ? 'Asking' : 'Test it'}</button>
    {state.text && <span className="muted"> {state.text}</span>}
    {state.error && <span className="problem"> {state.error}</span>}
  </p>;
}

// Which AI writes the brief, builds boards and answers Ask. OXBOT (once called OXBOT Free) is OpenRouter's free models on your own
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
  async function connectorsChanged(next: ConnectorInfo[]) { setList(next); setInfo(await api.ai()); setStatus((await api.aiPlans(true).catch(() => ({ plans: [] }))).plans); }
  const [status, setStatus] = useState<PlanStatus[]>([]);
  useEffect(() => { api.aiPlans().then(r => setStatus(r.plans)).catch(() => undefined); }, []);

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
      : <>No AI is connected, so your brief is written by simple rules. OXBOT costs nothing and takes a minute.</>}</p>}
    {error && <p className="problem">{error}</p>}

    {/* Plans you already pay for (owner, November 6, 2026: "directly use ur existing claude, openai, or gemini, kimi, glm
        subscription with this not just api key and if u do that u can see how much of ur usage u have"). */}
    {info && plans.length > 0 && <section aria-labelledby="plans">
      <h2 id="plans">Use a plan you already pay for</h2>
      <p>No API key. Claude, ChatGPT and Gemini plans work through each company’s own app on this Mac, signed in with your plan: Claude Code, Codex and Gemini CLI. OXBOT runs them with their tools off, so they only answer. Kimi and GLM coding plans use the key from your plan.</p>
      {plans.map(c => { const p = info.providers.find(x => x.id === c.id); const s = status.find(x => x.id === c.id); return <div key={c.id} className="plan-row">
        <Connector c={c} onChange={connectorsChanged} />
        {p?.installed === false && <p className="muted plan-note">{c.name.split(' (')[0]} needs its app on this Mac first: <a href={p.keyUrl} target="_blank" rel="noreferrer">install it</a>, open Terminal, run it once and sign in.</p>}
        {/* The plan app's own sign-in, read from the app itself (November 16, 2026). */}
        {s?.installed && <p className="muted plan-status">{s.signedIn
          ? `Signed in with ${s.how ?? 'your account'}${s.plan ? ` (${s.plan} plan)` : ''}.`
          : s.signedIn === undefined ? (p?.connected ? 'Switched on. Press Test it to check it answers with your plan.' : `${c.name.split(' (')[0]} is installed. Switch it on and press Test it to check it answers with your plan.`)
          : <>Not signed in yet. Open Terminal, type <code>{c.id === 'claude-plan' ? 'claude' : 'codex login'}</code>, press Return and sign in with your {c.id === 'claude-plan' ? 'Claude' : 'ChatGPT'} account. Then come back here.</>}</p>}
        {p?.connected && <TestAnswer id={c.id} />}
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
      <h2 id="free">OXBOT</h2>
      <p>Free models, including NVIDIA’s Nemotron 3 Ultra, through your own free OpenRouter account. There’s no OXBOT account and nothing to pay. Free models have daily limits.</p>
      <p className="muted">Free models are run by companies that may keep what you send and use it to improve their models. Each time, OXBOT sends your question and the facts on your board: names, email subjects, meetings and health numbers. If that matters, use a paid lab below.</p>
      {!free.connected ? <div className="actions">
        {onMac ? <a className="button primary" href="/api/ai/openrouter/start">Sign in with OpenRouter</a>
          : <p className="muted">Sign in on your Mac: Settings, then AI. This phone uses the same AI afterwards.</p>}
      </div> : <>
        <label className="ai-model">Free model
          <select value={info.freeModel || ''} disabled={busy} onChange={e => save({ freeModel: e.target.value })}>
            <option value="">Fastest for each ask (recommended)</option>
            {info.free.map(m => <option key={m.id} value={m.id}>{m.name}{m.context ? ` · ${Math.round(m.context / 1000)}k context` : ''}</option>)}
            {info.freeModel && !info.free.some(m => m.id === info.freeModel) && <option value={info.freeModel}>{info.freeModel}</option>}
          </select>
        </label>
        <div className="actions">
          {info.using?.id !== 'openrouter' && <button type="button" className="primary" disabled={busy} onClick={() => save({ provider: 'openrouter' })}>Use OXBOT</button>}
          <button type="button" className="text-button" disabled={busy} onClick={async () => { if (confirm('Sign out of OpenRouter? OXBOT forgets the key. You can sign in again any time.')) await connectorsChanged((await api.disconnect('openrouter')).connectors); }}>Sign out</button>
        </div>
      </>}
    </section>}

    {info && connected.length > 0 && <Route info={info} onChange={setInfo} />}

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
      {others.map(c => <div key={c.id}>
        <Connector c={c} onChange={connectorsChanged} />
        {info?.providers.find(p => p.id === c.id)?.connected && (c.id === 'claude' || c.id === 'chatgpt') && <TestAnswer id={c.id} />}
      </div>)}
    </section>
  </main>;
}

// Who answers what (owner, November 17, 2026: "u should be able to set like all free, all claude which ones which").
// Quick asks, everyday asks and big jobs each go to OXBOT's free models or to one AI you connected. You can also just
// say it: "use Claude for big jobs", "make it all free".
const tierKeys = ['simple', 'medium', 'hard'] as const;
const tierHelp: Record<typeof tierKeys[number], string> = { simple: 'Hi, a quick fact, a joke. No tools.', medium: 'Your day, mail, messages, music, the house.', hard: 'Plans, research, drafts, working in your apps.' };
const shortModel = (id: string) => id.replace(/^[^/]+\//, '').replace(/:free$/, '').replace(/-/g, ' ');
function Route({ info, onChange }: { info: AiInfo; onChange: (next: AiInfo) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const route = info.route ?? {};
  const names = info.tierNames ?? { simple: 'Quick asks', medium: 'Everyday asks', hard: 'Big jobs' };
  const free = info.providers.find(p => p.free && p.connected);
  const others = info.providers.filter(p => p.connected && !p.free);
  const has = (re: RegExp) => info.providers.some(p => re.test(p.id) && (p.connected || p.installed));
  const go = async (body: { preset?: string; route?: Record<string, string> }) => {
    setBusy(true); setError('');
    try { onChange(await api.aiRoute(body)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const presets: [string, string][] = [
    ...(free ? [['all-free', 'All OXBOT (free)']] as [string, string][] : []),
    ...(has(/^claude/) ? [['all-claude', 'All Claude'], ...(free ? [['mixed-claude', 'OXBOT for quick, Claude for big jobs']] as [string, string][] : [])] as [string, string][] : []),
    ...(has(/^chatgpt/) ? [['all-chatgpt', 'All ChatGPT'], ...(free ? [['mixed-chatgpt', 'OXBOT for quick, ChatGPT for big jobs']] as [string, string][] : [])] as [string, string][] : []),
  ];
  const fastest = (info.speeds ?? []).filter(s => /\//.test(s.model) && !s.busy).slice(0, 3);
  return <section aria-labelledby="route-h">
    <h2 id="route-h">Who answers what</h2>
    <p className="muted">Pick one for everything, or a different AI for each kind of ask. You can also just tell Ox: “use Claude for big jobs”, “make it all free”.</p>
    {error && <p className="problem" role="alert">{error}</p>}
    {presets.length > 0 && <div className="actions route-presets">{presets.map(([id, label]) => <button key={id} type="button" disabled={busy} onClick={() => void go({ preset: id })}>{label}</button>)}</div>}
    <div className="route-rows">{tierKeys.map(t => <label key={t} className="route-row">
      <span><strong>{names[t]}</strong><span className="muted"> {tierHelp[t]}</span></span>
      <select value={route[t] ?? ''} disabled={busy} onChange={e => void go({ route: { ...route, [t]: e.target.value } })}>
        <option value="">Whichever writes ({info.using?.name ?? 'none yet'})</option>
        {free && <option value="free">OXBOT (free, fastest model right now)</option>}
        {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>)}</div>
    {fastest.length > 0 && <p className="muted">OXBOT’s free models lately, first word in: {fastest.map(s => `${shortModel(s.model)} ${(s.firstWordMs / 1000).toFixed(1)} s`).join(' · ')}. Quick asks go to the fastest, with no thinking first.</p>}
  </section>;
}
