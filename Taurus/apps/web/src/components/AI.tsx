import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AiInfo, type ConnectorInfo, type PlanStatus } from '../api';
import { AppLogo } from './Connections';

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

// Which AI writes the brief, builds boards and answers Ask. Owner, October 31, 2026; laid out as cards on three tabs on
// November 19, 2026 ("make it just cards sectioned off by plan or api u click a tab at the top then u can just do it from
// there"): plans you already pay for, API keys (Taurus's free models through OpenRouter first), and who answers what.
type Tab = 'plans' | 'keys' | 'route';
const tabNames: Record<Tab, string> = { plans: 'Plans', keys: 'API keys', route: 'Who answers' };
const shortName = (name: string) => name.replace(/ \(.*\)$/, '').replace(/ plan$/, '');
const logoId = (id: string) => id === 'glm-plan' ? 'glm' : id.replace(/-plan$/, '');
const planWho: Record<string, string> = { 'claude-plan': 'Claude', 'chatgpt-plan': 'ChatGPT', 'gemini-plan': 'Google' };
const readTab = (): Tab | null => { try { const v = localStorage.getItem('taurus-ai-tab'); return v === 'plans' || v === 'keys' || v === 'route' ? v : null; } catch { return null; } };

export function AI() {
  const [info, setInfo] = useState<AiInfo | null>(null);
  const [list, setList] = useState<ConnectorInfo[]>([]);
  const [status, setStatus] = useState<PlanStatus[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTabState] = useState<Tab | null>(readTab);
  const [open, setOpen] = useState<string | null>(null);
  const setTab = (t: Tab) => { setTabState(t); try { localStorage.setItem('taurus-ai-tab', t); } catch { /* storage blocked: the tab lasts this visit */ } };
  const load = useCallback(async (fresh = false) => {
    try {
      const [a, c] = await Promise.all([api.ai(), api.connectors()]);
      setInfo(a); setList(c.connectors);
      setStatus((await api.aiPlans(fresh).catch(() => ({ plans: [] }))).plans);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    // Sign-in finishes in the browser: show it when you come back.
    const back = () => void load(true);
    window.addEventListener('focus', back);
    return () => { window.clearTimeout(first); window.removeEventListener('focus', back); };
  }, [load]);

  async function save(next: { provider?: string; freeModel?: string }) {
    setBusy(true); setError('');
    setInfo(i => i && { ...i, chosen: next.provider ?? i.chosen, freeModel: next.freeModel ?? i.freeModel });
    try { setInfo(await api.saveAi(next)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function changed(next: ConnectorInfo[]) { setList(next); setInfo(await api.ai()); setStatus((await api.aiPlans(true).catch(() => ({ plans: [] }))).plans); }

  const providers = info?.providers ?? [];
  const byId = (id: string) => providers.find(p => p.id === id);
  const ai = list.filter(c => c.group === 'AI');
  const plans = ai.filter(c => byId(c.id)?.plan);
  const keys = [...ai.filter(c => c.id === 'openrouter'), ...ai.filter(c => c.id !== 'openrouter' && !byId(c.id)?.plan)];
  const shown: Tab = tab ?? (plans.some(c => byId(c.id)?.connected) || !keys.some(c => byId(c.id)?.connected) ? 'plans' : 'keys');

  // One word for each card: what state it's in, never a code.
  function state(c: ConnectorInfo): { word: string; on?: boolean; bad?: boolean } {
    const p = byId(c.id), s = status.find(x => x.id === c.id);
    if (info?.using?.id === c.id) return { word: 'Answering', on: true };
    if (p?.installed === false) return { word: 'Not on this Mac' };
    if (s?.signedIn === false) return { word: 'Not signed in', bad: Boolean(c.connected) };
    if (p?.connected) return { word: 'Ready', on: true };
    if (c.auth === 'switch') return { word: p?.installed ? 'Off' : 'Not on this Mac' };
    return { word: c.id === 'openrouter' ? 'Free' : c.id === 'ollama' ? 'Add address' : 'Add key' };
  }
  const card = (c: ConnectorInfo) => {
    const st = state(c);
    return <li key={c.id}><button type="button" className={`app-tile ai-tile ${st.on ? 'on' : ''}`} onClick={() => setOpen(c.id)}>
      <AppLogo id={logoId(c.id)} name={c.name} size={44} />
      <span className="app-tile-text">
        <span className="app-name">{c.id === 'openrouter' ? 'OpenRouter' : shortName(c.name)}</span>
        <span className="app-blurb">{c.id === 'openrouter' ? 'Free models' : byId(c.id)?.maker !== shortName(c.name) ? byId(c.id)?.maker : byId(c.id)?.plan ? 'Plan' : 'API'}</span>
        <span className={`app-state ${st.on ? 'on' : ''} ${st.bad ? 'bad' : ''}`}>{st.word}</span>
      </span>
    </button></li>;
  };
  const current = ai.find(c => c.id === open);

  return <main id="main" tabIndex={-1} className="connections directory ai">
    <div className="page-head">
      <h1>AI</h1>
      {info && <p className="ai-using">{info.using ? <>Answering: <strong>{shortName(info.using.name)}</strong></> : 'Nothing connected yet'}</p>}
    </div>
    {error && <p className="problem" role="alert">{error}</p>}

    <div className="ai-tabs" role="tablist" aria-label="AI">
      {(Object.keys(tabNames) as Tab[]).map(t => <button key={t} type="button" role="tab" id={`ai-tab-${t}`} aria-controls={`ai-panel-${t}`} aria-selected={shown === t} tabIndex={shown === t ? 0 : -1}
        onClick={() => setTab(t)} onKeyDown={e => { const all = Object.keys(tabNames) as Tab[]; const i = all.indexOf(t); const next = e.key === 'ArrowRight' ? all[(i + 1) % all.length] : e.key === 'ArrowLeft' ? all[(i + all.length - 1) % all.length] : null; if (next) { setTab(next); document.getElementById(`ai-tab-${next}`)?.focus(); } }}>{tabNames[t]}</button>)}
    </div>

    {info && shown === 'plans' && <section role="tabpanel" id="ai-panel-plans" aria-labelledby="ai-tab-plans" className="ai-panel">
      <p className="ai-intro">Use the subscription you already pay for. No API key.</p>
      <ul className="app-grid">{plans.map(card)}</ul>
    </section>}

    {info && shown === 'keys' && <section role="tabpanel" id="ai-panel-keys" aria-labelledby="ai-tab-keys" className="ai-panel">
      <p className="ai-intro">Paste a key from any lab. You pay them for what you use; keys stay on this Mac.</p>
      <ul className="app-grid">{keys.map(card)}</ul>
    </section>}

    {info && shown === 'route' && <section role="tabpanel" id="ai-panel-route" aria-labelledby="ai-tab-route" className="ai-panel">
      {providers.some(p => p.connected) ? <>
        <Route info={info} onChange={setInfo} />
        {providers.filter(p => p.connected).length > 1 && <fieldset className="ai-pick" disabled={busy}>
          <legend>Which one writes</legend>
          <label className="check"><input type="radio" name="ai" checked={!info.chosen || !providers.some(p => p.connected && p.id === info.chosen)} onChange={() => save({ provider: '' })} /> Whichever is ready, plans first</label>
          {providers.filter(p => p.connected).map(p => <label key={p.id} className="check"><input type="radio" name="ai" checked={info.chosen === p.id} onChange={() => save({ provider: p.id })} /> {shortName(p.name)}{p.maker !== p.name ? ` (${p.maker})` : ''}</label>)}
        </fieldset>}
        <Usage info={info} />
      </> : <p className="ai-intro">Connect a plan or a key first. Then pick who answers what here.</p>}
    </section>}

    {current && info && <AiSheet c={current} info={info} plan={status.find(s => s.id === current.id)} busy={busy} onClose={() => setOpen(null)} onSave={save} onChange={changed} onRefresh={() => load(true)} />}
  </main>;
}

// One AI, opened from its card: sign in or paste the key, try it, make it the one that answers.
function AiSheet({ c, info, plan, busy, onClose, onSave, onChange, onRefresh }: { c: ConnectorInfo; info: AiInfo; plan?: PlanStatus; busy: boolean; onClose: () => void;
  onSave: (next: { provider?: string; freeModel?: string }) => Promise<void>; onChange: (list: ConnectorInfo[]) => Promise<void>; onRefresh: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const p = info.providers.find(x => x.id === c.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [waiting, setWaiting] = useState(false);
  const toggle = c.auth === 'switch' ? c.fields[0] : undefined;
  const isOn = toggle ? toggle.value === '1' || toggle.set : false;
  const onMac = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const name = c.id === 'openrouter' ? 'OpenRouter' : shortName(c.name);
  const answering = info.using?.id === c.id;
  // Signed in while the sheet was open: stop waiting.
  const signingIn = waiting && !plan?.signedIn;
  // While a browser sign-in is open, check every few seconds so the card turns Ready without a reload.
  useEffect(() => {
    if (!signingIn) return;
    const t = window.setInterval(() => void onRefresh(), 3000);
    const stop = window.setTimeout(() => setWaiting(false), 180_000);
    return () => { window.clearInterval(t); window.clearTimeout(stop); };
  }, [signingIn, onRefresh]);

  const saveFields = async (extra: Record<string, string> = {}) => {
    const filled = Object.fromEntries(Object.entries({ ...values, ...extra }).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, v.trim()]));
    if (!Object.keys(filled).length) return;
    setNote('');
    try { await onChange((await api.saveFields(c.id, filled)).connectors); setValues({}); } catch (e) { setNote((e as Error).message); }
  };
  const signIn = async () => {
    setNote('');
    try { await api.aiPlanLogin(c.id); setWaiting(true); setNote(`Finish signing in with ${planWho[c.id] ?? name} in your browser.`); } catch (e) { setNote((e as Error).message); }
  };
  const entry = c.fields.filter(f => f !== toggle);

  return <dialog ref={ref} className="sheet app-sheet ai-sheet" aria-label={name} onClose={onClose} onClick={e => { if (e.target === ref.current) ref.current.close(); }}>
    <div className="sheet-head">
      <span className="ai-sheet-title"><AppLogo id={logoId(c.id)} name={c.name} size={40} /><span><strong>{name}</strong><span className="muted">{p?.maker}</span></span></span>
      <button type="button" className="text-button" onClick={() => ref.current?.close()}>Done</button>
    </div>
    <div className="sheet-body ai-sheet-body">
      {/* Plans that run through the company's own app on this Mac. */}
      {toggle && <>
        {p?.installed === false ? <>
          <p>{name} runs through {c.id === 'claude-plan' ? 'Claude Code' : c.id === 'chatgpt-plan' ? 'Codex' : 'Gemini CLI'}, which isn’t on this Mac yet.</p>
          <div className="actions"><a className="button primary" href={p.keyUrl} target="_blank" rel="noreferrer">Get it</a></div>
        </> : plan?.signedIn === false ? <>
          <p>Not signed in to your {name} plan yet.</p>
          <div className="actions">{c.id === 'gemini-plan'
            ? <p className="muted">Gemini CLI signs in the first time you open it in Terminal.</p>
            : <button type="button" className="primary" disabled={!onMac || signingIn} onClick={signIn}>{signingIn ? 'Waiting for your browser' : `Sign in with ${planWho[c.id]}`}</button>}</div>
        </> : <>
          {plan?.signedIn && <p>Signed in{plan.how ? ` with ${plan.how}` : ''}{plan.plan ? `, ${plan.plan} plan` : ''}.</p>}
          <div className="actions">
            {!isOn ? <button type="button" className="primary" onClick={() => void saveFields({ [toggle.key]: '1' })}>Turn on</button>
              : <>
                {!answering && <button type="button" className="primary" disabled={busy} onClick={() => void onSave({ provider: c.id })}>Use for everything</button>}
                <button type="button" onClick={async () => { await onChange((await api.disconnect(c.id)).connectors); }}>Turn off</button>
              </>}
          </div>
        </>}
      </>}

      {/* OpenRouter: one-click sign-in for the free models, or a key you already have. */}
      {c.id === 'openrouter' && !p?.connected && onMac && <div className="actions"><a className="button primary" href="/api/ai/openrouter/start">Sign in with OpenRouter</a></div>}
      {c.id === 'openrouter' && <p className="muted">Free models are run by companies that may keep what you send to improve their models.</p>}

      {/* Keys and addresses, pasted right here. */}
      {!toggle && <form className="ai-key" onSubmit={e => { e.preventDefault(); void saveFields(); }}>
        {entry.filter(f => !/_MODEL$/.test(f.key)).map(f => <label key={f.key}>{c.id === 'openrouter' ? 'Or paste an OpenRouter key' : f.label}
          <input type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={values[f.key] ?? ''} placeholder={f.set ? (f.secret ? 'Saved. Paste a new one to replace it' : f.value ?? '') : f.placeholder ?? (f.secret ? 'Paste it here' : '')}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} /></label>)}
        <div className="actions">
          <button type="submit" className="primary" disabled={!Object.values(values).some(v => v.trim())}>Save</button>
          {c.setupUrl && <a className="button" href={p?.keyUrl || c.setupUrl} target="_blank" rel="noreferrer">Get a key</a>}
        </div>
      </form>}

      {p?.connected && <>
        {c.id === 'openrouter' && info.free.length > 0 && <label className="ai-model">Model
          <select value={info.freeModel || ''} disabled={busy} onChange={e => void onSave({ freeModel: e.target.value })}>
            <option value="">Fastest for each ask</option>
            {info.free.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            {!info.free.some(m => m.id === 'deepseek/deepseek-v4-flash') && <option value="deepseek/deepseek-v4-flash">DeepSeek V4 Flash (paid, pennies)</option>}
            {info.freeModel && info.freeModel !== 'deepseek/deepseek-v4-flash' && !info.free.some(m => m.id === info.freeModel) && <option value={info.freeModel}>{info.freeModel}</option>}
          </select>
        </label>}
        {c.id !== 'openrouter' && entry.filter(f => /_MODEL$/.test(f.key)).map(f => <form key={f.key} className="ai-key" onSubmit={e => { e.preventDefault(); void saveFields(); }}>
          <label>Model<input type="text" autoComplete="off" spellCheck={false} value={values[f.key] ?? ''} placeholder={f.value || f.placeholder || 'Default'} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} /></label>
        </form>)}
        <div className="actions">
          {!toggle && !answering && <button type="button" className="primary" disabled={busy} onClick={() => void onSave({ provider: c.id })}>Use for everything</button>}
          {!toggle && <button type="button" onClick={async () => { await onChange((await api.disconnect(c.id)).connectors); }}>{c.id === 'openrouter' ? 'Sign out' : 'Remove key'}</button>}
        </div>
        <TestAnswer id={c.id} />
      </>}
      {note && (signingIn || !waiting) && <p className={signingIn ? 'muted' : 'problem'} role="status">{note}</p>}
    </div>
  </dialog>;
}

// How much each plan has been used through Taurus, from what each app reported.
function Usage({ info }: { info: AiInfo }) {
  if (!info.usage?.length) return null;
  const n = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
  const limitLine = (limits: unknown): string => {
    if (!limits || typeof limits !== 'object') return '';
    const l = limits as Record<string, { used_percent?: number; window_minutes?: number } | number | string>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(l)) {
      if (v && typeof v === 'object' && typeof v.used_percent === 'number') parts.push(`${Math.round(v.used_percent)}% of the ${v.window_minutes ? (v.window_minutes >= 1440 ? 'weekly' : `${Math.round(v.window_minutes / 60)}-hour`) : k} limit`);
      else if (k === 'utilization' && typeof v === 'number') parts.push(`${Math.round(v <= 1 ? v * 100 : v)}% of the limit`);
    }
    return parts.join(' · ');
  };
  return <div className="plan-usage">
    <h2>Used through Taurus</h2>
    <table><thead><tr><th scope="col">Plan</th><th scope="col">Today</th><th scope="col">7 days</th><th scope="col">30 days</th><th scope="col">Limits</th></tr></thead>
      <tbody>{info.usage.map(u => <tr key={u.id}>
        <th scope="row">{shortName(info.providers.find(p => p.id === u.id)?.name ?? u.name)}</th>
        <td>{u.today.calls} asks{u.today.input + u.today.output ? `, ${n(u.today.input + u.today.output)} tokens` : ''}</td>
        <td>{u.week.calls} asks</td>
        <td>{u.month.calls} asks{u.month.cost ? `, $${u.month.cost.toFixed(2)} at API prices` : ''}</td>
        <td>{limitLine(u.limits) || '—'}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

// Who answers what (owner, November 17, 2026: "u should be able to set like all free, all claude which ones which").
// Quick asks, everyday asks and big jobs each go to Taurus's free models or to one AI you connected. You can also just
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
    ...(free ? [['all-free', 'All Taurus (free)']] as [string, string][] : []),
    ...(has(/^claude/) ? [['all-claude', 'All Claude'], ...(free ? [['mixed-claude', 'Taurus for quick, Claude for big jobs']] as [string, string][] : [])] as [string, string][] : []),
    // The owner's own setup (November 20, 2026): DeepSeek V4 Flash for everyday, his Claude app for big jobs.
    ...(info.providers.some(p => (p.id === 'deepseek' || p.id === 'openrouter') && p.connected) && has(/^claude/) ? [['deepseek-claude', 'DeepSeek, Claude for big jobs']] as [string, string][] : []),
    ...(has(/^chatgpt/) ? [['all-chatgpt', 'All ChatGPT'], ...(free ? [['mixed-chatgpt', 'Taurus for quick, ChatGPT for big jobs']] as [string, string][] : [])] as [string, string][] : []),
  ];
  const fastest = (info.speeds ?? []).filter(s => /\//.test(s.model) && !s.busy).slice(0, 3);
  return <section aria-labelledby="route-h">
    <h2 id="route-h">Who answers what</h2>
    <p className="muted">Pick one for everything, or a different AI for each kind of ask. You can also just tell Taurus: “use DeepSeek for everything and Claude for big jobs”, “make it all free”.</p>
    {error && <p className="problem" role="alert">{error}</p>}
    {presets.length > 0 && <div className="actions route-presets">{presets.map(([id, label]) => <button key={id} type="button" disabled={busy} onClick={() => void go({ preset: id })}>{label}</button>)}</div>}
    <div className="route-rows">{tierKeys.map(t => <label key={t} className="route-row">
      <span><strong>{names[t]}</strong><span className="muted"> {tierHelp[t]}</span></span>
      <select value={route[t] ?? ''} disabled={busy} onChange={e => void go({ route: { ...route, [t]: e.target.value } })}>
        <option value="">Whichever writes ({info.using?.name ?? 'none yet'})</option>
        {free && <option value="free">{info.freeModel && !info.free.some(m => m.id === info.freeModel) ? `OpenRouter: ${shortModel(info.freeModel)}` : 'Taurus (free, fastest model right now)'}</option>}
        {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>)}</div>
    {fastest.length > 0 && <p className="muted">Taurus’s free models lately, first word in: {fastest.map(s => `${shortModel(s.model)} ${(s.firstWordMs / 1000).toFixed(1)} s`).join(' · ')}. Quick asks go to the fastest, with no thinking first.</p>}
  </section>;
}
