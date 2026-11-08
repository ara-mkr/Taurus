import { useEffect, useState, type FormEvent } from 'react';
import { api, type McpServer, type Scheduled, type Skill } from '../api';

// Skills and MCP servers (owner, November 6, 2026: "make it so u can add skills for the ai not just plugins and also mcp
// servers"). A skill is instructions Ox follows when they fit, written here or dropped in as a SKILL.md. An MCP server
// is added by its address; its read-only tools run when Ox asks, every other tool waits for your OK.
export function Skills() {
  const [list, setList] = useState<Skill[] | null>(null);
  const [mcp, setMcp] = useState<McpServer[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Partial<Skill> | null>(null);
  const [server, setServer] = useState({ name: '', url: '', token: '' });
  const [busy, setBusy] = useState('');
  useEffect(() => { api.skills().then(r => { setList(r.skills); setMcp(r.mcp); }).catch(e => setError(e.message)); }, []);

  const run = async <T,>(what: string, job: () => Promise<T>, done: (r: T) => void) => {
    setBusy(what); setError('');
    try { done(await job()); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 200_000) { setError('That file is too big for a skill.'); return; }
    const text = await file.text();
    await run('import', () => api.saveSkill({ text }), r => setList(r.skills));
  }
  const saveSkill = (e: FormEvent) => { e.preventDefault(); if (editing) void run('skill', () => api.saveSkill(editing), r => { setList(r.skills); setEditing(null); }); };
  const addServer = (e: FormEvent) => { e.preventDefault(); void run('mcp', () => api.saveMcp(server), r => { setMcp(r.mcp); setServer({ name: '', url: '', token: '' }); }); };
  const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };

  return <main id="main" tabIndex={-1} className="settings-page skills-page">
    <div className="page-head"><h1>Skills</h1></div>
    {error && <p className="problem" role="alert">{error}</p>}

    <section aria-labelledby="skills-h">
      <div className="section-row"><h2 id="skills-h">Skills</h2>
        <span className="actions">
          <label className="button file-button">Add a SKILL.md<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <button type="button" className="primary" onClick={() => setEditing({ name: '', description: '', instructions: '' })}>New skill</button>
        </span>
      </div>
      <p className="muted">Teach Ox how you like things done: your investor update format, how to triage your inbox, your hiring scorecard. Skills are instructions only. They can’t run anything, and sending or buying still waits for your OK.</p>
      {editing && <form className="skill-edit" onSubmit={saveSkill}>
        <label>Name<input type="text" required maxLength={80} value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Investor updates" /></label>
        <label>When to use it<input type="text" maxLength={240} value={editing.description ?? ''} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="When I ask for an investor or board update" /></label>
        <label>What Ox should do<textarea required rows={8} maxLength={20000} value={editing.instructions ?? ''} onChange={e => setEditing({ ...editing, instructions: e.target.value })} placeholder={'Three short sections: wins, misses, asks.\nNumbers first, from Stripe and the dashboard.\nUnder 200 words.'} /></label>
        <div className="actions"><button type="submit" className="primary" disabled={busy === 'skill'}>{busy === 'skill' ? 'Saving' : 'Save skill'}</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel</button></div>
      </form>}
      {list && list.length === 0 && !editing && <p className="empty-line muted">No skills yet.</p>}
      <ul className="row-list">{list?.map(s => <li key={s.id} className="row">
        <div className="row-main"><p className="strong">{s.name}</p><p className="muted">{s.description || s.instructions.split('\n')[0].slice(0, 120)}</p></div>
        <label className="switch-label"><input type="checkbox" role="switch" checked={s.on} onChange={e => void run(s.id, () => api.saveSkill({ id: s.id, on: e.target.checked }), r => setList(r.skills))} /><span className="sr-only">{s.name} on</span></label>
        <button type="button" className="text-button" onClick={() => setEditing(s)}>Edit</button>
        <button type="button" className="text-button" onClick={() => void run(s.id, () => api.removeSkill(s.id), r => setList(r.skills))}>Remove</button>
      </li>)}</ul>
    </section>

    <section aria-labelledby="mcp-h">
      <div className="section-row"><h2 id="mcp-h">MCP servers</h2></div>
      <p className="muted">Add any MCP server by its address, the same servers Claude and other AI apps use. Tools the server marks read-only run when Ox needs them; anything else shows you an approval card first. Remote servers need https; a server on this Mac can use http://localhost.</p>
      <form className="mcp-add" onSubmit={addServer}>
        <label>Name<input type="text" maxLength={60} value={server.name} onChange={e => setServer({ ...server, name: e.target.value })} placeholder="Linear" /></label>
        <label>Address<input type="url" required value={server.url} onChange={e => setServer({ ...server, url: e.target.value })} placeholder="https://mcp.example.com/mcp" /></label>
        <label>Token, if it needs one<input type="password" autoComplete="off" value={server.token} onChange={e => setServer({ ...server, token: e.target.value })} placeholder="Optional" /></label>
        <button type="submit" className="primary" disabled={busy === 'mcp' || !server.url}>{busy === 'mcp' ? 'Connecting' : 'Add server'}</button>
      </form>
      {mcp.length === 0 && <p className="empty-line muted">No MCP servers yet.</p>}
      <ul className="row-list">{mcp.map(m => <li key={m.id} className="row">
        <div className="row-main">
          <p className="strong">{m.name}</p>
          <p className="muted">{m.error ? <span className="problem">{m.error}</span> : `${m.tools.length} ${m.tools.length === 1 ? 'tool' : 'tools'}, ${m.tools.filter(t => t.readOnly).length} read-only · ${host(m.url)}`}</p>
          {m.tools.length > 0 && <details><summary>Tools</summary><ul className="mcp-tools">{m.tools.map(t => <li key={t.name}><code>{t.name}</code>{t.readOnly ? ' · reads only' : ' · asks first'}{t.description ? ` · ${t.description}` : ''}</li>)}</ul></details>}
        </div>
        <label className="switch-label"><input type="checkbox" role="switch" checked={m.on} onChange={e => void run(m.id, () => api.saveMcp({ id: m.id, on: e.target.checked }), r => setMcp(r.mcp))} /><span className="sr-only">{m.name} on</span></label>
        <button type="button" className="text-button" disabled={busy === m.id} onClick={() => void run(m.id, () => api.refreshMcp(m.id), r => setMcp(r.mcp))}>{busy === m.id ? 'Checking' : 'Check'}</button>
        <button type="button" className="text-button" onClick={() => void run(m.id, () => api.removeMcp(m.id), r => setMcp(r.mcp))}>Remove</button>
      </li>)}</ul>
    </section>
  </main>;
}

// Scheduled tasks (owner, November 6, 2026: "allow schedhuled tasks for ox to do u csn voice it to it or set it up in
// settings"). Set one here, or just say it: "every weekday at 8, brief me on the day".
export function Schedule() {
  const [list, setList] = useState<Scheduled[] | null>(null);
  const [task, setTask] = useState('');
  const [when, setWhen] = useState('every weekday at 8am');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { api.schedules().then(r => setList(r.schedules)).catch(e => setError(e.message)); }, []);
  const run = async (what: string, job: () => Promise<{ schedules: Scheduled[] }>) => {
    setBusy(what); setError('');
    try { setList((await job()).schedules); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(''); }
  };
  const add = async (e: FormEvent) => { e.preventDefault(); if (await run('add', () => api.saveSchedule({ task, when }))) setTask(''); };
  const ideas: [string, string][] = [['Brief me on the day: meetings, who needs me, and my recovery', 'every weekday at 7:30am'], ['Sum up this week’s numbers and what moved', 'every Friday at 4pm'], ['Check if anyone important emailed while I was out', 'every day at 6pm']];
  return <main id="main" tabIndex={-1} className="settings-page skills-page">
    <div className="page-head"><h1>Scheduled</h1></div>
    <p className="muted">Ox does these by himself at the time you set and shows you the answer. You can also just tell him: “every weekday at 8, brief me on the day.” Anything that sends, posts or buys still waits for your OK.</p>
    {error && <p className="problem" role="alert">{error}</p>}
    <form className="schedule-add" onSubmit={add}>
      <label>What Ox should do<input type="text" required maxLength={600} value={task} onChange={e => setTask(e.target.value)} placeholder="Brief me on the day" /></label>
      <label>When<input type="text" required maxLength={80} value={when} onChange={e => setWhen(e.target.value)} placeholder="every weekday at 8am, tomorrow at 9, every Friday at 4pm" /></label>
      <button type="submit" className="primary" disabled={busy === 'add' || !task.trim()}>{busy === 'add' ? 'Saving' : 'Schedule'}</button>
    </form>
    {list && list.length === 0 && <div className="schedule-ideas"><p className="muted">Ideas</p><ul>{ideas.map(([t, w]) => <li key={t}><button type="button" className="text-button" onClick={() => { setTask(t); setWhen(w); }}>{t}, {w}</button></li>)}</ul></div>}
    <ul className="row-list">{list?.map(s => <li key={s.id} className="row">
      <div className="row-main">
        <p className="strong">{s.task}</p>
        <p className="muted">{s.on ? s.next : 'Off'}{s.lastAt ? ` · last ran ${new Date(s.lastAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</p>
        {s.last && <details><summary>Last answer</summary><p className="schedule-last">{s.last}</p></details>}
      </div>
      <label className="switch-label"><input type="checkbox" role="switch" checked={s.on} onChange={e => void run(s.id, () => api.scheduleDo(s.id, e.target.checked ? 'on' : 'off'))} /><span className="sr-only">{s.task} on</span></label>
      <button type="button" className="text-button" disabled={busy === `run-${s.id}`} onClick={() => void run(`run-${s.id}`, () => api.scheduleDo(s.id, 'run'))}>Run now</button>
      <button type="button" className="text-button" onClick={() => void run(s.id, () => api.removeSchedule(s.id))}>Remove</button>
    </li>)}</ul>
  </main>;
}
