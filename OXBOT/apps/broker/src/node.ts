// Runs the sign-in service on any Node 22.18+ host (Render, Fly, a VPS). Cloudflare uses worker.ts directly.
import { createServer } from 'node:http';
import { handle, type Env } from './worker.ts';

const port = Number(process.env.PORT || 8790);
createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => v === undefined ? [] : [[k, Array.isArray(v) ? v.join(', ') : v]]) as [string, string][],
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    });
    const response = await handle(request, process.env as Env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error');
  }
}).listen(port, () => console.log(`OXBOT sign-in service on :${port}`));
