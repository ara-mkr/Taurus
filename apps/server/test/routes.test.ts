// The server's own doors for actions (owner, November 1, 2026): the real server, started on a spare port with an
// empty private folder and nothing connected. Nothing outside this Mac is contacted.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const port = 20_000 + Math.floor(Math.random() * 20_000);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(import.meta.dirname, '../src/index.ts')], {
  env: { ...process.env, TAURUS_HOME: mkdtempSync(join(tmpdir(), 'taurus-routes-')), TAURUS_PORT: String(port), TAURUS_BROKER_URL: '', TAURUS_VOICE_URL: 'https://voice.example.com', TAURUS_WEB_ROOT: tmpdir() },
  stdio: ['ignore', 'pipe', 'pipe'],
});
before(() => new Promise<void>((resolve, reject) => {
  server.stdout.on('data', chunk => { if (String(chunk).includes('Taurus on')) resolve(); });
  server.once('exit', code => reject(new Error(`server exited ${code}`)));
}));
after(() => { server.kill(); });

const call = (path: string, init: RequestInit = {}) => fetch(base + path, init);
// fetch won't send a custom Host header, so the voice address is reached with node:http.
const onVoiceHost = (path: string, method: string, body = '') => new Promise<{ status: number; type: string; text: string }>((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port, path, method, headers: { Host: 'voice.example.com', 'Content-Type': 'application/x-www-form-urlencoded' } }, res => {
    let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), text }));
  });
  req.on('error', reject); req.end(body);
});
const write = { method: 'POST', headers: { 'x-taurus': '1', 'Content-Type': 'application/json' } };

test('approvals are listed, and approving needs the Taurus header and a real action', async () => {
  assert.deepEqual(await (await call('/api/approvals')).json(), { pending: [] });
  assert.equal((await call(`/api/approvals/${crypto.randomUUID()}/approve`, { method: 'POST', body: '{}' })).status, 403);
  const missing = await call(`/api/approvals/${crypto.randomUUID()}/approve`, { ...write, body: JSON.stringify({ digest: 'x' }) });
  assert.equal(missing.status, 404);
});

test('the Actions page lists every write grant, none allowed until you allow it', async () => {
  const info = await (await call('/api/actions')).json() as { grants: { id: string; allowed: boolean }[]; log: unknown[] };
  assert.deepEqual(info.grants.map((g: { id: string }) => g.id), ['gmail-send', 'outlook-send', 'slack-act', 'github-act', 'linear-act', 'twilio-act', 'composio-act', 'spotify-play', 'voice-in', 'home-assistant', 'hue', 'lifx', 'govee', 'switchbot', 'smartthings', 'shelly', 'nanoleaf', 'wiz', 'yeelight', 'mac-control']);
  assert.ok(info.grants.every((g: { allowed: boolean }) => !g.allowed));
  assert.deepEqual(info.log, []);
});

test('anything through a proxy or on the voice address reaches only /api/voice, and only when Twilio signed it', async () => {
  assert.equal((await call('/api/dashboard', { headers: { 'X-Forwarded-For': '203.0.113.9' } })).status, 404);
  assert.equal((await onVoiceHost('/api/connectors', 'GET')).status, 404);
  assert.equal((await onVoiceHost('/', 'GET')).status, 404, 'not even the web app');
  assert.equal((await call('/api/approvals', { headers: { 'Cf-Connecting-Ip': '203.0.113.9' } })).status, 404);
  const unsigned = await onVoiceHost('/api/voice/incoming', 'POST', 'From=%2B15557654321&CallSid=CA1');
  assert.equal(unsigned.status, 403);
  assert.match(unsigned.type, /text\/xml/);
  assert.match(unsigned.text, /Not allowed\.<\/Say><Hangup\/>/);
  const local = await call('/api/voice/incoming', { method: 'POST', body: '' });
  assert.ok([403, 404].includes(local.status), 'on the local address /api/voice is just another write that needs the Taurus header');
});

test('a camera frame that is not an image is refused', async () => {
  const r = await call('/api/ask', { ...write, body: JSON.stringify({ turns: [{ role: 'user', text: 'what is this?' }], image: 'data:text/html;base64,PGgxPg==' }) });
  assert.equal(r.status, 400);
});

test('every response carries the security headers: no framing, no referrer, scripts only from Taurus (November 2, 2026)', async () => {
  for (const path of ['/', '/api/connectors', '/api/nothing-here']) {
    const res = await call(path);
    assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self';.*frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.match(res.headers.get('permissions-policy') ?? '', /geolocation=\(\)/);
  }
});
