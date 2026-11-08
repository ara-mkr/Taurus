// November 6, 2026: finding your files, skills, MCP servers, scheduled tasks, your own plans through their apps, and the
// new smart-home brands. Fake files in a temp folder, a fake MCP server, fake plan apps and mocked hubs only: nothing
// leaves this machine, nothing is sent and no light changes.
// Run: pnpm --dir apps/server test
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.env.OXBOT_HOME = mkdtempSync(join(tmpdir(), 'oxbot-nov6-'));
process.env.OXBOT_BROKER_URL = '';
process.env.OXBOT_NO_SCHEDULER = '1';
const filesHome = mkdtempSync(join(tmpdir(), 'oxbot-files-'));
process.env.OXBOT_FILES_HOME = filesHome;
const cliDir = mkdtempSync(join(tmpdir(), 'oxbot-cli-'));
process.env.OXBOT_CLI_DIR = cliDir;
for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'HA_URL', 'HUE_BRIDGE', 'LIFX_TOKEN']) delete process.env[key];

const { findFiles, openFile } = await import('../src/files.ts');
const { saveSkill, skills, skillsText, parseSkill, removeSkill } = await import('../src/skills.ts');
const { addServer, mcpServers, readMcp, mcpText, checkUrl } = await import('../src/mcp.ts');
const { addSchedule, schedules, runDue, removeSchedule } = await import('../src/schedule.ts');
const { askPlan, usage } = await import('../src/subscriptions.ts');
const { store } = await import('../src/store.ts');
const { ready, current } = await import('../src/ai.ts');
const { switchbotHeaders, hostList } = await import('../src/home-more.ts');
const { propose, pending } = await import('../src/actions/index.ts');
const { openWindows } = await import('../src/windows.ts');

/* eslint-disable @typescript-eslint/no-explicit-any -- fake payloads */
const realFetch = globalThis.fetch;

// ---------- Files ----------

mkdirSync(join(filesHome, 'Downloads/brand'), { recursive: true });
mkdirSync(join(filesHome, 'Desktop'), { recursive: true });
mkdirSync(join(filesHome, 'Documents'), { recursive: true });
mkdirSync(join(filesHome, 'Library'), { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
writeFileSync(join(filesHome, 'Downloads/brand/OXBOT-logo-final.png'), png);
writeFileSync(join(filesHome, 'Downloads/notes.txt'), 'Board meeting moved to Thursday.');
writeFileSync(join(filesHome, 'Downloads/passwords-export.csv'), 'site,password');
writeFileSync(join(filesHome, 'Desktop/logo-old.jpg'), png);
writeFileSync(join(filesHome, 'Library/secret-logo.png'), png);
writeFileSync(join(filesHome, 'outside.txt'), 'not in the four folders');
symlinkSync(join(filesHome, 'outside.txt'), join(filesHome, 'Documents/sneaky.txt'));

test('find_file finds a logo by its name in Downloads, and never lists password exports or other folders', () => {
  const found = findFiles('look at this logo in my downloads');
  assert.deepEqual(found.map(f => f.name), ['OXBOT-logo-final.png']);
  assert.equal(found[0].path, 'Downloads/brand/OXBOT-logo-final.png');
  const anywhere = findFiles('logo');
  assert.ok(anywhere.some(f => f.name === 'logo-old.jpg'));
  assert.ok(!anywhere.some(f => f.name === 'secret-logo.png'), 'Library is not one of the four folders');
  assert.deepEqual(findFiles('passwords export'), []);
});

test('open_file shows a picture or text from the four folders, and refuses anything outside, linked or private', () => {
  const pic = openFile('Downloads/brand/OXBOT-logo-final.png') as any;
  assert.match(pic.image, /^data:image\/png;base64,/);
  assert.equal((openFile('Downloads/notes.txt') as any).text, 'Board meeting moved to Thursday.');
  assert.match((openFile('outside.txt') as any).error, /only open files in/);
  assert.match((openFile('Downloads/../outside.txt') as any).error, /only open files in/);
  assert.match((openFile('Documents/sneaky.txt') as any).error, /link/);
  assert.match((openFile('Downloads/passwords-export.csv') as any).error, /private/);
  assert.match((openFile('Library/secret-logo.png') as any).error, /only open files in/);
});

// ---------- Skills ----------

test('a skill pasted as SKILL.md keeps its name and description, is told to the AI while on, and is only words', () => {
  const s = saveSkill({ text: '---\nname: Investor updates\ndescription: When I ask for an investor update\n---\n# Investor updates\nThree bullets: wins, misses, asks.' });
  assert.equal(s.name, 'Investor updates');
  assert.equal(s.description, 'When I ask for an investor update');
  assert.match(skillsText(), /### Investor updates\nUse when: When I ask for an investor update/);
  assert.match(skillsText(), /never allow anything the rules above don't/);
  saveSkill({ id: s.id, on: false });
  assert.equal(skillsText(), '');
  assert.equal(parseSkill('# Plain\nDo it.').name, 'Plain');
  assert.throws(() => saveSkill({ name: '', instructions: '' }));
  removeSkill(s.id);
  assert.deepEqual(skills(), []);
});

// ---------- MCP ----------

function fakeMcp(calls: string[]) {
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input), body = JSON.parse(String(init?.body ?? '{}'));
    calls.push(body.method);
    assert.equal(url, 'https://mcp.example.com/mcp');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer mcp-secret');
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const reply = (result: unknown) => new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`, { headers: { 'Content-Type': 'text/event-stream', 'Mcp-Session-Id': 'sess-1' } });
    if (body.method === 'initialize') return reply({ protocolVersion: '2025-06-18', capabilities: {} });
    if (body.method === 'tools/list') return reply({ tools: [
      { name: 'search_issues', description: 'Find issues', inputSchema: { properties: { q: { type: 'string' } }, required: ['q'] }, annotations: { readOnlyHint: true } },
      { name: 'create_issue', description: 'Make an issue', inputSchema: { properties: { title: { type: 'string' } } } },
    ] });
    if (body.method === 'tools/call') { assert.equal(body.params.name, 'search_issues'); return reply({ content: [{ type: 'text', text: 'OX-1 Login broken' }] }); }
    throw new Error(`unexpected ${body.method}`);
  }) as typeof fetch;
}

test('an MCP server added by address lists its tools; read-only ones run, others only become an approval card', async () => {
  assert.throws(() => checkUrl('http://mcp.example.com/mcp'), /https/);
  assert.equal(checkUrl('http://localhost:3000/mcp'), 'http://localhost:3000/mcp');
  const calls: string[] = [];
  fakeMcp(calls);
  try {
    const s = await addServer({ name: 'Tracker', url: 'https://mcp.example.com/mcp', token: 'mcp-secret' });
    assert.equal(s.error, undefined);
    assert.deepEqual(s.tools.map(t => [t.name, t.readOnly]), [['search_issues', true], ['create_issue', false]]);
    assert.equal(mcpServers()[0].token, true);
    assert.ok(!JSON.stringify(mcpServers()).includes('mcp-secret'), 'the token is never shown back');
    assert.match(mcpText(), /search_issues \[read-only\]/);
    assert.equal(await readMcp(s.id, 'search_issues', { q: 'login' }), 'OX-1 Login broken');
    await assert.rejects(() => readMcp(s.id, 'create_issue', { title: 'x' }), /needs the owner’s approval/);
    const before = calls.filter(c => c === 'tools/call').length;
    const p = await propose('mcp.call', { server: s.id, tool: 'create_issue', arguments: { title: 'Fix login' }, summary: 'Open an issue for the login bug' }, 'ask');
    assert.equal(p.state, 'pending');
    assert.ok(p.lines?.some(l => l.label === 'title' && l.value === 'Fix login'));
    assert.equal(calls.filter(c => c === 'tools/call').length, before, 'proposing runs nothing');
    assert.ok(pending().some(x => x.id === p.id));
  } finally { globalThis.fetch = realFetch; }
});

// ---------- Scheduled tasks ----------

test('a scheduled task runs when due, shows its answer, moves to its next time, and a one-off switches off', async () => {
  const daily = addSchedule('Brief me on the day', 'every day at 8am');
  assert.equal(daily.repeat, 'daily');
  const once = addSchedule('Check the deploy', 'in 5 minutes');
  assert.throws(() => addSchedule('x', 'whenever'), /Say when/);
  store.saveDoc('schedules.json', schedules().map(s => ({ ...s, nextAt: new Date(Date.now() - 1000).toISOString() })));
  const asked: string[] = [];
  await runDue(Date.now(), async task => { asked.push(task); return `Done: ${task}`; });
  assert.deepEqual(asked.sort(), ['Brief me on the day', 'Check the deploy']);
  const after = schedules();
  const d = after.find(s => s.id === daily.id)!, o = after.find(s => s.id === once.id)!;
  assert.ok(Date.parse(d.nextAt) > Date.now() && d.on && d.last === 'Done: Brief me on the day');
  assert.equal(o.on, false);
  assert.ok(openWindows().some(w => w.kind === 'note' && w.text === 'Done: Check the deploy'));
  removeSchedule(daily.id); removeSchedule(once.id);
});

// ---------- Plans through their own apps ----------

function fakeCli(name: string, script: string) {
  const file = join(cliDir, name);
  writeFileSync(file, `#!/usr/bin/env node\n${script}`);
  chmodSync(file, 0o755);
}

test('your Claude plan answers through Claude Code with its tools off, and the usage it reports is counted', async () => {
  fakeCli('claude', `
const args = process.argv.slice(2);
let input = ''; process.stdin.on('data', d => input += d).on('end', () => {
  if (!args.includes('-p') || args[args.indexOf('--tools') + 1] !== '' || !args.includes('--no-session-persistence')) { console.error('bad args ' + JSON.stringify(args)); process.exit(2); }
  const msg = JSON.parse(input.trim());
  const text = msg.message.content.find(c => c.type === 'text').text;
  console.log(JSON.stringify({ type: 'system', subtype: 'init' }));
  console.log(JSON.stringify({ type: 'result', is_error: false, result: 'Plan says: ' + text.split('\\n').pop() + ' / ' + args[args.indexOf('--system-prompt') + 1], usage: { input_tokens: 120, output_tokens: 8 }, total_cost_usd: 0.002 }));
});`);
  store.setSecrets({ CLAUDE_PLAN_ON: '1' });
  assert.equal(ready('claude-plan'), true);
  assert.equal(current()?.id, 'claude-plan', 'a plan you already pay for comes first');
  const reply = await askPlan('claude-plan', 'You are Ox.', [{ role: 'user', text: 'Hello' }]);
  assert.equal(reply, 'Plan says: Hello / You are Ox.');
  const u = usage().find(x => x.id === 'claude-plan')!;
  assert.deepEqual([u.today.calls, u.today.input, u.today.output], [1, 120, 8]);
  store.setSecrets({ CLAUDE_PLAN_ON: '' });
  assert.equal(ready('claude-plan'), false);
});

test('your ChatGPT plan answers through Codex in a read-only sandbox, and its reported limits are kept', async () => {
  fakeCli('codex', `
const args = process.argv.slice(2);
let input = ''; process.stdin.on('data', d => input += d).on('end', () => {
  if (args[0] !== 'exec' || args[args.indexOf('-s') + 1] !== 'read-only' || args.at(-1) !== '-') process.exit(2);
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'From Codex: ' + (input.includes('Owner: Hi') ? 'saw it' : 'missed') } }));
  console.log(JSON.stringify({ type: 'token_count', rate_limits: { primary: { used_percent: 23, window_minutes: 300 } } }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 50, output_tokens: 5 } }));
});`);
  assert.equal(await askPlan('chatgpt-plan', 'System', [{ role: 'user', text: 'Hi' }]), 'From Codex: saw it');
  const u = usage().find(x => x.id === 'chatgpt-plan')!;
  assert.equal((u.limits as any).primary.used_percent, 23);
});

test('a missing or signed-out plan app says what to do instead of failing quietly', async () => {
  await assert.rejects(() => askPlan('gemini-plan', 'S', [{ role: 'user', text: 'Hi' }]), /isn’t installed/);
  fakeCli('gemini', `console.error('Please log in: run gemini and choose Login with Google'); process.exit(1);`);
  await assert.rejects(() => askPlan('gemini-plan', 'S', [{ role: 'user', text: 'Hi' }]), /isn’t signed in/);
});

// ---------- More of the house ----------

test('SwitchBot requests are signed the documented way, and device lists parse names and addresses', () => {
  const h = switchbotHeaders('tok', 'sec', 1700000000000, 'nonce-1');
  // HMAC-SHA256 of "tok" + "1700000000000" + "nonce-1" with "sec", base64, upper case.
  assert.equal(h.sign, 'ZEAC4LZFTZYLUA4RQQNXZTEONBE6ICY2WL5JOBF5WUS=');
  assert.deepEqual(hostList('Desk lamp=192.168.1.40\n192.168.1.41, bad host!'), [{ name: 'Desk lamp', host: '192.168.1.40' }, { name: '192.168.1.41', host: '192.168.1.41' }]);
});

test('Govee and SwitchBot devices show in the House and change on request, curtains in SwitchBot’s direction', async () => {
  const { homeState, change } = await import('../src/home.ts');
  store.setSecrets({ GOVEE_API_KEY: 'gk', SWITCHBOT_TOKEN: 'tok', SWITCHBOT_SECRET: 'sec' });
  const sent: { url: string; body: any }[] = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (body) sent.push({ url, body });
    const json = (x: unknown) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/router/api/v1/user/devices')) return json({ data: [{ sku: 'H6008', device: 'AA:BB', deviceName: 'Desk strip', type: 'devices.types.light' }] });
    if (url.endsWith('/router/api/v1/device/control')) return json({ code: 200 });
    if (url.endsWith('/v1.1/devices')) return json({ statusCode: 100, body: { deviceList: [{ deviceId: 'C1', deviceName: 'Bedroom curtains', deviceType: 'Curtain3' }, { deviceId: 'L1', deviceName: 'Door', deviceType: 'Smart Lock' }] } });
    if (/\/v1\.1\/devices\/C1\/commands$/.test(url)) return json({ statusCode: 100 });
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  try {
    const h = await homeState(true);
    assert.equal(h.sample, false);
    const strip = h.devices.find(d => d.name === 'Desk strip')!, curtains = h.devices.find(d => d.name === 'Bedroom curtains')!, lock = h.devices.find(d => d.name === 'Door')!;
    assert.equal(strip.kind, 'light'); assert.equal(curtains.kind, 'cover'); assert.equal(lock.secure, true);
    await change([strip.id], { brightness: 40 });
    assert.ok(sent.some(s => s.body.payload?.capability?.instance === 'brightness' && s.body.payload.capability.value === 40 && s.body.payload.sku === 'H6008'));
    await change([curtains.id], { position: 100 });
    assert.deepEqual(sent.find(s => s.url.endsWith('/C1/commands'))!.body, { command: 'setPosition', parameter: '0,ff,0', commandType: 'command' });
    await assert.rejects(() => change([lock.id], { lock: false }), /need your OK/);
  } finally { globalThis.fetch = realFetch; store.setSecrets({ GOVEE_API_KEY: '', SWITCHBOT_TOKEN: '', SWITCHBOT_SECRET: '' }); }
});
