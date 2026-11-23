import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { attach, decide, detach, fileText, filePath, fileType, getNote, graph, removeNote, saveNote, search, suggestions, syncMemories } from './brain.ts';
import { setSharing, sharing } from './memory-share.ts';
import { core, coreChars, CORE_BUDGET, exportText, memoryReport, pin, pool, recall, RECALL_LIMIT, recallSettings, recallStats, setPicker, unpin, warmFile } from './recall.ts';
import { HttpError } from './store.ts';

// The Brain's routes (November 16, 2026; ProFinder's were removed November 22, 2026), kept out of index.ts. Same walls as every other route:
// loopback or a paired phone, and the x-taurus header on anything that isn't a GET.

interface Kit {
  send: (res: ServerResponse, status: number, body: unknown) => void;
  json: <T>(req: IncomingMessage, limit?: number) => Promise<T>;
  bytes: (req: IncomingMessage, limit: number) => Promise<Buffer>;
}
// What the Brain page's Memory panel shows: core memory against its budget, the pool, and what recall sent.
function memoryPage() {
  const all = pool();
  const sh = sharing();
  const url = `http://127.0.0.1:${Number(process.env.TAURUS_PORT || 8787)}/mcp`;
  return {
    core: core(), used: coreChars(), budget: CORE_BUDGET, facts: all.length, chars: all.reduce((n, f) => n + f.text.length, 0), stats: recallStats(), report: memoryReport(),
    picker: recallSettings().picker,
    sharing: sh.on ? { on: true, url, key: sh.key, uses: sh.uses.length, lastUse: sh.uses.at(-1) } : { on: false, url, uses: sh.uses.length },
  };
}
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
    if (path === '/api/brain/sharing' && method === 'POST') { const b = await json<{ on?: boolean }>(req); setSharing(b.on === true); send(res, 200, memoryPage()); return true; }
    if (path === '/api/brain/picker' && method === 'POST') { const b = await json<{ on?: boolean }>(req); setPicker(b.on === true); send(res, 200, memoryPage()); return true; }
    if (path === '/api/brain/recall' && method === 'GET') { send(res, 200, recall(q('q'), { limit: RECALL_LIMIT })); return true; }
    if (path === '/api/brain/export' && method === 'GET') { send(res, 200, { text: exportText() }); return true; }
    if (path === '/api/brain/file/text' && method === 'GET') { send(res, 200, { name: q('name'), text: await fileText(q('name')) }); return true; }
    const sm = path.match(/^\/api\/brain\/suggestions\/(s-[a-f0-9]{8})$/);
    if (sm && method === 'POST') { const b = await json<{ add?: boolean; note?: string }>(req); decide(sm[1], b.add === true, b.note); send(res, 200, { suggestions: suggestions(), graph: graph() }); return true; }

  } catch (error) {
    send(res, error instanceof HttpError ? error.status : 400, { error: (error as Error).message });
    return true;
  }
  return false;
}
