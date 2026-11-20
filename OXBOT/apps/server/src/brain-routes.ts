import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { attach, decide, detach, fileText, filePath, fileType, getNote, graph, removeNote, saveNote, search, suggestions, syncMemories } from './brain.ts';
import { ANSWER_KEYS, pipeline, prepare, proposeBatch, readAnswers, readPrefs, resume, runSearch, saveAnswers, savePrefs, setStage, submissions, summary, type Prefs, type Stage } from './profinder.ts';
import { addSchedule, removeSchedule, schedules } from './schedule.ts';
import { core, coreChars, CORE_BUDGET, exportText, memoryReport, pin, pool, recall, RECALL_LIMIT, recallStats, unpin, warmFile } from './recall.ts';
import { HttpError } from './store.ts';

// The Brain's and ProFinder's routes (November 16, 2026), kept out of index.ts. Same walls as every other route:
// loopback or a paired phone, and the x-taurus header on anything that isn't a GET.

interface Kit {
  send: (res: ServerResponse, status: number, body: unknown) => void;
  json: <T>(req: IncomingMessage, limit?: number) => Promise<T>;
  bytes: (req: IncomingMessage, limit: number) => Promise<Buffer>;
}
export const PROFINDER_TASK = 'Run ProFinder';
// What the Brain page's Memory panel shows: core memory against its budget, the pool, and what recall sent.
function memoryPage() {
  const all = pool();
  return { core: core(), used: coreChars(), budget: CORE_BUDGET, facts: all.length, chars: all.reduce((n, f) => n + f.text.length, 0), stats: recallStats(), report: memoryReport() };
}
const scheduled = () => schedules().find(s => s.task === PROFINDER_TASK);

// The jobs as the page shows them: the posting's text cut short, the plan's file paths left on the server.
const forPage = () => pipeline().jobs.map(j => ({ ...j, text: j.text.slice(0, 700), plan: j.plan && { ...j.plan, fields: j.plan.fields.map(({ file: _f, ...f }) => f) } }));
async function profinder() {
  const r = await resume().catch(() => ({ text: '', file: undefined }));
  const s = scheduled();
  return { prefs: readPrefs(), answers: readAnswers(), answerKeys: ANSWER_KEYS, resume: { file: r.file, words: r.text.split(/\s+/).filter(Boolean).length }, jobs: forPage(), ...summary(), log: submissions().slice(-40).reverse(), schedule: s ? { on: s.on, when: s.when } : null };
}
// Long jobs answer at once and report on the page; a failure is shown there too.
let lastError = '';
const background = (work: Promise<unknown>) => { lastError = ''; work.catch(e => { lastError = (e as Error).message; }); };
const busyCheck = () => { const b = summary().busy; if (b) throw new HttpError(409, `ProFinder is busy ${b}.`); };

export async function brainRoute(req: IncomingMessage, res: ServerResponse, url: URL, { send, json, bytes }: Kit): Promise<boolean> {
  const path = url.pathname, method = req.method ?? 'GET', q = (k: string) => url.searchParams.get(k) ?? '';
  try {
    if (path === '/api/brain' && method === 'GET') { const added = syncMemories(); send(res, 200, { graph: graph(), suggestions: suggestions(), added, folder: '~/.taurus/brain' }); return true; }
    if (path === '/api/brain/note') {
      if (method === 'GET') { send(res, 200, { note: getNote(q('title')) }); return true; }
      if (method === 'POST') {
        const b = await json<{ title?: string; body?: string; up?: string; tags?: string[]; was?: string }>(req, 400_000);
        send(res, 200, { note: saveNote({ title: String(b.title ?? ''), body: b.body, up: b.up, tags: Array.isArray(b.tags) ? b.tags.map(String) : undefined, was: b.was, source: 'you' }), graph: graph() });
        return true;
      }
      if (method === 'DELETE') { removeNote(q('title')); send(res, 200, { graph: graph() }); return true; }
    }
    if (path === '/api/brain/search' && method === 'GET') { send(res, 200, { results: search(q('q'), 12) }); return true; }
    if (path === '/api/brain/file') {
      if (method === 'POST') { const r = attach(q('note'), q('name'), await bytes(req, 40_000_000)); warmFile(r.file); send(res, 200, { note: r.note, file: r.file, graph: graph() }); return true; }
      if (method === 'DELETE') { send(res, 200, { note: detach(q('note'), q('name')), graph: graph() }); return true; }
      if (method === 'GET') {
        const file = filePath(q('name'));
        const name = file.split('/').pop()!;
        const view = url.searchParams.has('view') && /^image\//.test(fileType(name) ?? '');
        res.writeHead(200, { 'Content-Type': fileType(name) ?? 'application/octet-stream', 'Content-Disposition': `${view ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`, 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'no-store' });
        res.end(readFileSync(file));
        return true;
      }
    }
    // Core memory and recall (Luke's Day 2, November 20, 2026).
    if (path === '/api/brain/memory' && method === 'GET') { send(res, 200, memoryPage()); return true; }
    if (path === '/api/brain/core') {
      if (method === 'POST') { const b = await json<{ text?: string; kind?: string }>(req); pin(String(b.text ?? ''), b.kind === 'rule' || b.kind === 'fact' ? b.kind : undefined); send(res, 200, memoryPage()); return true; }
      if (method === 'DELETE') { if (!unpin(q('id'))) throw new HttpError(404, 'That’s no longer in core memory.'); send(res, 200, memoryPage()); return true; }
    }
    if (path === '/api/brain/recall' && method === 'GET') { send(res, 200, recall(q('q'), { limit: RECALL_LIMIT })); return true; }
    if (path === '/api/brain/export' && method === 'GET') { send(res, 200, { text: exportText() }); return true; }
    if (path === '/api/brain/file/text' && method === 'GET') { send(res, 200, { name: q('name'), text: await fileText(q('name')) }); return true; }
    const sm = path.match(/^\/api\/brain\/suggestions\/(s-[a-f0-9]{8})$/);
    if (sm && method === 'POST') { const b = await json<{ add?: boolean; note?: string }>(req); decide(sm[1], b.add === true, b.note); send(res, 200, { suggestions: suggestions(), graph: graph() }); return true; }

    if (path === '/api/profinder' && method === 'GET') { send(res, 200, { ...(await profinder()), error: lastError || undefined }); return true; }
    if (path === '/api/profinder/prefs' && method === 'POST') { savePrefs(await json<Partial<Prefs>>(req)); send(res, 200, await profinder()); return true; }
    if (path === '/api/profinder/answers' && method === 'POST') { const b = await json<{ answers?: Record<string, string> }>(req); saveAnswers(b.answers ?? {}); send(res, 200, await profinder()); return true; }
    if (path === '/api/profinder/search' && method === 'POST') { busyCheck(); background(runSearch()); send(res, 202, await profinder()); return true; }
    if (path === '/api/profinder/prepare' && method === 'POST') { const b = await json<{ ids?: string[] }>(req); busyCheck(); background(prepare((b.ids ?? []).map(String))); send(res, 202, await profinder()); return true; }
    if (path === '/api/profinder/batch' && method === 'POST') { const b = await json<{ ids?: string[] }>(req); send(res, 200, { proposal: await proposeBatch(Array.isArray(b.ids) ? b.ids.map(String) : undefined) }); return true; }
    if (path === '/api/profinder/schedule' && method === 'POST') {
      const b = await json<{ on?: boolean; when?: string }>(req);
      const s = scheduled();
      if (b.on) addSchedule(PROFINDER_TASK, String(b.when || 'every day at 8am'), s?.id);
      else if (s) removeSchedule(s.id);
      send(res, 200, await profinder()); return true;
    }
    const jm = path.match(/^\/api\/profinder\/jobs\/([a-f0-9]{12})$/);
    if (jm && method === 'POST') { const b = await json<{ stage?: Stage; response?: string }>(req); setStage(jm[1], String(b.stage) as Stage, b.response); send(res, 200, await profinder()); return true; }
  } catch (error) {
    send(res, error instanceof HttpError ? error.status : 400, { error: (error as Error).message });
    return true;
  }
  return false;
}
