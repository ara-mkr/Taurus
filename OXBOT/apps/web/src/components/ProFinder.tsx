import { useCallback, useEffect, useState } from 'react';
import { ago, api, type Job, type JobPrefs, type JobStage, type ProFinderInfo, type Proposal } from '../api';
import { ApprovalCard } from './Approval';
import '../styles/brain.css';

// ProFinder (owner, November 16, 2026: "constantly searching for internships and jobs and applies for u, based on ur
// resume"). The pipeline (found, shortlisted, ready, applied, heard back), the matches with why they scored, and the
// one batch card that sends the ready ones ("One tap per batch"). Profile and answers live in the Brain under Career.

const COLUMNS: { stage: JobStage; title: string }[] = [
  { stage: 'needs-you', title: 'Needs you' }, { stage: 'shortlisted', title: 'Shortlisted' }, { stage: 'ready', title: 'Ready to send' },
  { stage: 'applied', title: 'Applied' }, { stage: 'response', title: 'Heard back' }, { stage: 'found', title: 'Found' },
];
const lines = (v: string) => v.split(/[\n,]/).map(x => x.trim()).filter(Boolean);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function JobRow({ j, act, picked, onPick }: { j: Job; act: (j: Job, stage: JobStage) => void; picked: boolean; onPick: (on: boolean) => void }) {
  return <li className="job">
    <div className="job-top">
      {j.stage === 'shortlisted' && <input type="checkbox" checked={picked} onChange={e => onPick(e.target.checked)} aria-label={`Pick ${j.title} at ${j.company} to prepare`} />}
      <a className="job-title" href={j.url} target="_blank" rel="noreferrer">{j.title}</a>
      <span className="job-score" title="Score out of 100">{j.score}</span>
    </div>
    <p className="job-where">{[j.company, j.location || (j.remote ? 'Remote' : ''), j.pay].filter(Boolean).join(' · ')}</p>
    {j.why.length > 0 && j.stage !== 'needs-you' && <p className="job-why">{j.why.slice(0, 3).join('. ')}.</p>}
    {j.needs && <p className="job-needs">{j.needs}</p>}
    <p className="job-meta">{j.sources.join(', ')}{j.posted ? `, posted ${ago(j.posted)}` : ''}{j.appliedAt ? `, applied ${ago(j.appliedAt)}` : ''}</p>
    <div className="job-do">
      {(j.stage === 'found' || j.stage === 'skipped') && <button type="button" onClick={() => act(j, 'shortlisted')}>Shortlist</button>}
      {(j.stage === 'shortlisted' || j.stage === 'ready') && <button type="button" className="text-button" onClick={() => act(j, 'found')}>Not now</button>}
      {j.stage === 'needs-you' && <><button type="button" onClick={() => act(j, 'applied')}>I applied</button>{!j.unconfirmed && <button type="button" className="text-button" onClick={() => act(j, 'shortlisted')}>Try again</button>}</>}
      {j.stage === 'applied' && <button type="button" className="text-button" onClick={() => act(j, 'response')}>Heard back</button>}
      {j.stage !== 'skipped' && j.stage !== 'applied' && j.stage !== 'response' && <button type="button" className="text-button" onClick={() => act(j, 'skipped')}>Skip</button>}
      <a href={j.applyUrl} target="_blank" rel="noreferrer">Open</a>
    </div>
  </li>;
}

export function ProFinderPage({ waiting, onUpdate }: { waiting: Proposal[]; onUpdate: (p: Proposal) => void }) {
  const [info, setInfo] = useState<ProFinderInfo | null>(null);
  const [problem, setProblem] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [answers, setAnswers] = useState<Record<string, string> | null>(null);
  const [allFound, setAllFound] = useState(false);
  const [saved, setSaved] = useState('');

  const take = useCallback((i: ProFinderInfo) => { setInfo(i); if (i.error) setProblem(i.error); }, []);
  const call = useCallback((work: Promise<ProFinderInfo>) => { setProblem(''); work.then(take).catch(e => setProblem((e as Error).message)); }, [take]);
  useEffect(() => { api.profinder().then(take).catch(e => setProblem((e as Error).message)); }, [take]);
  // While Taurus searches, prepares or sends, the page checks back every few seconds.
  useEffect(() => { if (!info?.busy) return; const t = window.setInterval(() => api.profinder().then(take).catch(() => undefined), 2500); return () => window.clearInterval(t); }, [info?.busy, take]);
  const cards = waiting.filter(p => p.kind === 'profinder.batch' && p.state === 'pending');
  const doneCards = waiting.filter(p => p.kind === 'profinder.batch' && p.state !== 'pending').length;
  // A batch that was just approved shows its outcome on the pipeline.
  useEffect(() => { if (doneCards) api.profinder().then(take).catch(() => undefined); }, [doneCards, take]);

  if (!info) return <main id="main" tabIndex={-1} className="profinder"><div className="page-head"><h1>ProFinder</h1></div><p className="board-note">{problem || 'Loading.'}</p></main>;
  const p = info.prefs, c = info.counts;
  const f = draft ?? { roles: p.roles.join(', '), locations: p.locations.join(', '), boards: p.boards.join('\n'), start: p.start, pay: p.pay, keywords: p.keywords.join(', '), avoid: p.avoid.join(', '), shortlistAt: String(p.shortlistAt) };
  const a = answers ?? Object.fromEntries([...info.answerKeys, ...Object.keys(info.answers)].map(k => [k, info.answers[k] ?? '']));
  const set = (k: string, v: string) => setDraft({ ...f, [k]: v });
  const prefs = (next: Partial<JobPrefs>) => call(api.profinderPrefs(next));
  const act = (j: Job, stage: JobStage) => call(api.profinderStage(j.id, stage));
  const jobs = (stage: JobStage) => info.jobs.filter(j => j.stage === stage).sort((x, y) => y.score - x.score);
  const toPrepare = jobs('shortlisted').filter(j => picked.has(j.id)).map(j => j.id);
  const needs = c['needs-you'];
  const line = [c.shortlisted ? `${plural(c.shortlisted, 'match', 'matches')} shortlisted` : '', c.ready ? `${c.ready} ready to send` : '', needs ? `${needs} need${needs === 1 ? 's' : ''} you` : '', c.applied ? `${c.applied} applied` : ''].filter(Boolean).join('. ');
  const busyWord = info.busy ? `${info.busy.charAt(0).toUpperCase()}${info.busy.slice(1)}` : '';

  return <main id="main" tabIndex={-1} className="profinder">
    <div className="page-head">
      <h1>ProFinder</h1>
      <div className="brain-tools">
        {busyWord && <span className="muted" role="status">{busyWord}</span>}
        <button type="button" className="glass-button" disabled={Boolean(info.busy)} onClick={() => call(api.profinderSearch())}>Search now</button>
      </div>
    </div>
    <p className="house-summary" aria-live="polite">{line ? `${line}.` : info.jobs.length ? 'Nothing shortlisted yet.' : 'No matches yet. Say what you want below, then search.'}</p>
    <p className="muted pf-run">{info.lastRun ? `Last search ${ago(info.lastRun.at)}: ${plural(info.lastRun.seen, 'fitting posting')}, ${info.lastRun.added} new. AI scoring ${info.lastRun.ai}.` : 'Not searched yet.'}{info.schedule?.on ? ` Searches ${info.schedule.when}.` : ''}</p>
    {info.lastRun && info.lastRun.errors.length > 0 && <p className="muted">Didn’t answer: {info.lastRun.errors.join('; ')}</p>}
    {problem && <p className="problem" role="alert">{problem}</p>}

    {cards.length > 0 && <section className="pf-cards" aria-label="Waiting for your OK">{cards.map(card => <ApprovalCard key={card.id} p={card} onChange={onUpdate} level={2} />)}</section>}
    {c.ready > 0 && !cards.length && <div className="pf-send glass">
      <p><span className="strong">{plural(c.ready, 'application')} ready.</span> Put {c.ready === 1 ? 'it' : 'them'} on one card to check and send.</p>
      <button type="button" className="primary" onClick={() => api.profinderBatch().then(r => onUpdate(r.proposal)).catch(e => setProblem((e as Error).message))}>Review and send</button>
    </div>}

    <section className="pf-board" aria-label="Pipeline">
      {COLUMNS.map(col => {
        const list = jobs(col.stage);
        const shown = col.stage === 'found' && !allFound ? list.slice(0, 12) : list;
        return <section key={col.stage} className={`pf-col glass pf-${col.stage}`} aria-labelledby={`pf-${col.stage}`}>
          <h2 id={`pf-${col.stage}`}>{col.title} <span className="count">{list.length}</span></h2>
          {col.stage === 'shortlisted' && list.length > 0 && <div className="pf-col-do">
            <button type="button" className="text-button" onClick={() => setPicked(new Set(list.slice(0, 10).map(j => j.id)))}>Pick top {Math.min(10, list.length)}</button>
            <button type="button" disabled={!toPrepare.length || Boolean(info.busy)} onClick={() => { call(api.profinderPrepare(toPrepare)); setPicked(new Set()); }}>{toPrepare.length ? `Prepare ${toPrepare.length}` : 'Prepare'}</button>
          </div>}
          {shown.length ? <ul className="jobs">{shown.map(j => <JobRow key={j.id} j={j} act={act} picked={picked.has(j.id)} onPick={on => setPicked(s => { const n = new Set(s); if (on) n.add(j.id); else n.delete(j.id); return n; })} />)}</ul> : <p className="muted">None.</p>}
          {col.stage === 'found' && list.length > 12 && <button type="button" className="text-button" onClick={() => setAllFound(!allFound)}>{allFound ? 'Show fewer' : `Show all ${list.length}`}</button>}
        </section>;
      })}
    </section>

    <div className="pf-setup">
      <section className="glass pf-panel" aria-labelledby="pf-want">
        <h2 id="pf-want">What to look for</h2>
        <form className="pf-form" onSubmit={e => { e.preventDefault(); prefs({ roles: lines(f.roles), locations: lines(f.locations), boards: lines(f.boards), start: f.start, pay: f.pay, keywords: lines(f.keywords), avoid: lines(f.avoid), shortlistAt: Number(f.shortlistAt) || 0 }); setDraft(null); setSaved('Saved to Job preferences in the Brain.'); }}>
          <label htmlFor="pf-roles">Roles</label><input id="pf-roles" value={f.roles} onChange={e => set('roles', e.target.value)} placeholder="Software engineer intern, Data analyst intern" />
          <label htmlFor="pf-places">Places</label><input id="pf-places" value={f.locations} onChange={e => set('locations', e.target.value)} placeholder="San Francisco, New York" />
          <label htmlFor="pf-start">Start</label><input id="pf-start" value={f.start} onChange={e => set('start', e.target.value)} placeholder="June 2027" />
          <label htmlFor="pf-pay">Pay</label><input id="pf-pay" value={f.pay} onChange={e => set('pay', e.target.value)} placeholder="$40/hr or more" />
          <label htmlFor="pf-skills">Skills to match</label><input id="pf-skills" value={f.keywords} onChange={e => set('keywords', e.target.value)} placeholder="Words from your resume that matter most" />
          <label htmlFor="pf-avoid">Leave out</label><input id="pf-avoid" value={f.avoid} onChange={e => set('avoid', e.target.value)} placeholder="Clearance, unpaid" />
          <label htmlFor="pf-at">Shortlist from score</label><input id="pf-at" type="number" min={0} max={100} value={f.shortlistAt} onChange={e => set('shortlistAt', e.target.value)} />
          <label htmlFor="pf-boards">Company boards</label>
          <textarea id="pf-boards" rows={5} value={f.boards} onChange={e => set('boards', e.target.value)} aria-describedby="pf-boards-hint" />
          <p id="pf-boards-hint" className="muted pf-hint">One per line: greenhouse:company, lever:company or ashby:company, as in the company’s jobs address.</p>
          <div className="brain-actions"><button type="submit" className="primary">Save</button>{saved && !draft && <span className="muted" role="status">{saved}</span>}</div>
        </form>
        <fieldset className="pf-checks"><legend>Kind and where to look</legend>
          {(['internship', 'full-time'] as const).map(k => <label key={k}><input type="checkbox" checked={p.kinds.includes(k)} onChange={e => prefs({ kinds: e.target.checked ? [...p.kinds, k] : p.kinds.filter(x => x !== k) })} />{k === 'internship' ? 'Internships' : 'Full-time'}</label>)}
          <label className="pf-select">Remote
            <select value={p.remote} onChange={e => prefs({ remote: e.target.value as JobPrefs['remote'] })}><option value="yes">Remote is fine</option><option value="only">Remote only</option><option value="no">In person only</option></select>
          </label>
          <label><input type="checkbox" checked={p.simplify} onChange={e => prefs({ simplify: e.target.checked })} />SimplifyJobs lists on GitHub</label>
          <label><input type="checkbox" checked={p.adzuna} onChange={e => prefs({ adzuna: e.target.checked })} />Adzuna, with your free key</label>
          <label><input type="checkbox" checked={p.aiScoring} onChange={e => prefs({ aiScoring: e.target.checked })} />Score with Taurus Free, contact details left out</label>
          <label><input type="checkbox" checked={Boolean(info.schedule?.on)} onChange={e => call(api.profinderSchedule(e.target.checked))} />Search every day at 8 am</label>
        </fieldset>
      </section>

      <section className="glass pf-panel" aria-labelledby="pf-answers">
        <h2 id="pf-answers">Your answers</h2>
        <p className="muted">{info.resume.file ? `Resume: ${info.resume.file}, ${info.resume.words} words read.` : info.resume.words ? `Resume: ${info.resume.words} words, no PDF yet.` : 'No resume yet.'} <a href="#brain/Resume">Open it in the Brain</a></p>
        <form className="pf-form" onSubmit={e => { e.preventDefault(); call(api.profinderAnswers(a)); setAnswers(null); setSaved('Saved to Application answers in the Brain.'); }}>
          {Object.entries(a).map(([k, v], i) => <div key={k} className="pf-answer"><label htmlFor={`pf-a${i}`}>{k}</label><input id={`pf-a${i}`} value={v} onChange={e => setAnswers({ ...a, [k]: e.target.value })} /></div>)}
          <div className="brain-actions"><button type="submit" className="primary">Save answers</button><button type="button" className="text-button" onClick={() => { const q = prompt('The question, the way forms ask it'); if (q?.trim()) setAnswers({ ...a, [q.trim()]: '' }); }}>Add a question</button></div>
        </form>
      </section>

      <section className="glass pf-panel" aria-labelledby="pf-sent">
        <h2 id="pf-sent">Sent</h2>
        {info.log.length ? <ul className="pf-log">{info.log.map((l, i) => <li key={i}>
          <span>{l.title} at {l.company}</span>
          <span className={l.outcome === 'applied' ? '' : 'problem'}>{l.outcome === 'applied' ? 'Applied' : l.outcome === 'unconfirmed' ? 'Not confirmed' : l.outcome === 'error' ? 'Didn’t finish' : 'Needs you'}</span>
          <span className="muted">{ago(l.at)}</span>
        </li>)}</ul> : <p className="muted">Nothing sent yet. Every application Taurus sends is listed here and kept in ~/.taurus.</p>}
      </section>
    </div>
  </main>;
}
