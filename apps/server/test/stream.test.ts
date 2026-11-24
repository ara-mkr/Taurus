import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { postStream } from '../src/stream.ts';
import { HttpError } from '../src/store.ts';

// A queued model sends only keep-alive comments. stallMs gives up on it as a 408, so the next free model is tried.
test('a stream that only sends keep-alives gives up after stallMs as a 408', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const keep = setInterval(() => res.write(': PROCESSING\n\n'), 20);
    res.on('close', () => clearInterval(keep));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  const started = Date.now();
  try {
    await assert.rejects(postStream(`http://127.0.0.1:${port}/chat/completions`, { body: {}, stallMs: 300 }, () => {}),
      (e: unknown) => e instanceof HttpError && e.status === 408);
    assert.ok(Date.now() - started < 3000, 'gave up quickly');
  } finally { server.closeAllConnections(); server.close(); }
});

test('real data keeps a slow stream alive past stallMs', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    let n = 0;
    const tick = setInterval(() => {
      if (++n > 5) { clearInterval(tick); res.end('data: [DONE]\n\n'); return; }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: String(n) } }] })}\n\n`);
    }, 150);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  let text = '';
  try {
    await postStream(`http://127.0.0.1:${port}/chat/completions`, { body: {}, stallMs: 400 }, e => { text += e.choices[0].delta.content; });
    assert.equal(text, '12345');
  } finally { server.close(); }
});
