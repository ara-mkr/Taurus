import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { store } from './store.ts';
import type { Turn } from './ai.ts';

// Your own subscriptions (owner, November 6, 2026: "allow it so u can directly use ur existing claude, openai, or gemini,
// kimi, glm subscription with this not just api key and if u do that u can see how much of ur usage u have"). Claude,
// ChatGPT and Gemini plans are used through each company's own command-line app on this Mac (Claude Code, Codex and
// Gemini CLI), signed in with your plan: OXBOT runs that one fixed program with fixed arguments, the question on its
// input, never through a shell, with its tools switched off (Claude), its sandbox read-only (Codex) or in plan mode
// (Gemini), in an empty folder. Kimi and GLM coding plans give you a plan key instead; those are in ai.ts. Usage is
// counted here from what each app reports back, and any plan limits they report are shown as they came.

export type CliId = 'claude-plan' | 'chatgpt-plan' | 'gemini-plan';
const bins: Record<CliId, string> = { 'claude-plan': 'claude', 'chatgpt-plan': 'codex', 'gemini-plan': 'gemini' };
export const cliNames: Record<string, string> = { 'claude-plan': 'Claude Code', 'chatgpt-plan': 'Codex', 'gemini-plan': 'Gemini CLI', 'kimi-plan': 'Kimi plan', 'glm-plan': 'GLM plan' };

// Where these apps install themselves. A test can point OXBOT_CLI_DIR at fakes.
function binary(id: CliId): string | undefined {
  const name = bins[id];
  const dirs = process.env.OXBOT_CLI_DIR ? [process.env.OXBOT_CLI_DIR]
    : [join(homedir(), '.local/bin'), join(homedir(), '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.npm-global/bin'), join(homedir(), '.bun/bin')];
  return dirs.map(d => join(d, name)).find(p => existsSync(p));
}
export const cliFound = (id: CliId) => Boolean(binary(id));

const work = () => { const d = join(store.dir, 'cli-work'); mkdirSync(d, { recursive: true, mode: 0o700 }); return d; };

function runCli(file: string, args: string[], input: string, timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: work(), env: { ...process.env, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Your plan’s app took too long to answer.')); }, timeoutMs);
    child.stdout.on('data', d => { out += d; if (out.length > 4_000_000) child.kill('SIGTERM'); });
    child.stderr.on('data', d => { err += d; if (err.length > 200_000) err = err.slice(-100_000); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 || out.trim()) resolve(out);
      else reject(new Error(/log ?in|auth|sign ?in|credential|unauthori[sz]ed/i.test(err) ? 'That app isn’t signed in. Open Terminal, run it once and sign in with your plan.' : `It stopped: ${err.trim().split('\n').at(-1)?.slice(0, 200) || `exit ${code}`}`));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

// The conversation as one prompt, for apps that take one message.
const transcript = (turns: Turn[]) => turns.map(t => `${t.role === 'user' ? 'Owner' : 'Ox'}: ${t.text}`).join('\n\n');

// ---------- Usage ----------

interface Day { calls: number; input: number; output: number; cost: number }
interface Usage { days: Record<string, Day>; limits?: unknown; seen?: string }
const USAGE = 'ai-usage.json';
const dayKey = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA');
export function countUsage(id: string, input = 0, output = 0, cost = 0, limits?: unknown) {
  const all = store.doc<Record<string, Usage>>(USAGE, {});
  const u = all[id] ?? { days: {} };
  const d = u.days[dayKey()] ?? { calls: 0, input: 0, output: 0, cost: 0 };
  u.days[dayKey()] = { calls: d.calls + 1, input: d.input + input, output: d.output + output, cost: Math.round((d.cost + cost) * 10_000) / 10_000 };
  // Thirty days is plenty to show a week and a month.
  for (const k of Object.keys(u.days).sort().slice(0, -30)) delete u.days[k];
  if (limits && typeof limits === 'object') u.limits = limits;
  u.seen = new Date().toISOString();
  all[id] = u; store.saveDoc(USAGE, all);
}
export interface UsageInfo { id: string; name: string; today: Day; week: Day; month: Day; limits?: unknown; seen?: string }
export function usage(): UsageInfo[] {
  const all = store.doc<Record<string, Usage>>(USAGE, {});
  const sum = (u: Usage, days: number) => {
    const from = dayKey(Date.now() - (days - 1) * 86_400_000);
    return Object.entries(u.days).filter(([k]) => k >= from).reduce((a, [, d]) => ({ calls: a.calls + d.calls, input: a.input + d.input, output: a.output + d.output, cost: Math.round((a.cost + d.cost) * 100) / 100 }), { calls: 0, input: 0, output: 0, cost: 0 });
  };
  return Object.entries(all).map(([id, u]) => ({ id, name: cliNames[id] ?? id, today: sum(u, 1), week: sum(u, 7), month: sum(u, 30), limits: u.limits, seen: u.seen }));
}

// ---------- Asking ----------

/* eslint-disable @typescript-eslint/no-explicit-any -- the apps' JSON events are untyped */
const events = (out: string) => out.split('\n').flatMap(l => { try { const v = JSON.parse(l); return v && typeof v === 'object' ? [v] : []; } catch { return []; } });

async function askClaudeCode(file: string, system: string, turns: Turn[]): Promise<string> {
  const last = turns.at(-1)!;
  const earlier = turns.slice(0, -1);
  const image = last.image?.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  const text = `${earlier.length ? `The conversation so far:\n\n${transcript(earlier)}\n\nThe owner now says:\n` : ''}${last.text}`;
  const message = { type: 'user', message: { role: 'user', content: [...(image ? [{ type: 'image', source: { type: 'base64', media_type: image[1], data: image[2] } }] : []), { type: 'text', text }] } };
  const out = await runCli(file, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', system], JSON.stringify(message) + '\n');
  const ev = events(out);
  const result = ev.findLast(e => e.type === 'result');
  const limitEvent = ev.findLast(e => /rate_limit/.test(String(e.type)));
  countUsage('claude-plan', result?.usage?.input_tokens ?? 0, result?.usage?.output_tokens ?? 0, result?.total_cost_usd ?? 0, limitEvent?.rate_limit_info ?? limitEvent);
  if (result?.is_error) throw new Error(String(result.result ?? 'Claude Code stopped.').slice(0, 300));
  return String(result?.result ?? ev.filter(e => e.type === 'assistant').flatMap(e => e.message?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')).trim();
}

async function askCodex(file: string, system: string, turns: Turn[]): Promise<string> {
  const last = turns.at(-1)!;
  const image = last.image?.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  let picture: string | undefined;
  if (image) { picture = join(work(), `${randomBytes(6).toString('hex')}.${image[1] === 'jpeg' ? 'jpg' : image[1]}`); writeFileSync(picture, Buffer.from(image[2], 'base64'), { mode: 0o600 }); }
  try {
    const prompt = `${system}\n\n---\n\n${transcript(turns)}\n\nOx:`;
    const out = await runCli(file, ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', ...(picture ? ['-i', picture] : []), '-'], prompt);
    const ev = events(out);
    const text = ev.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').map(e => e.item.text).join('\n')
      || ev.filter(e => e.msg?.type === 'agent_message').map(e => e.msg.message).join('\n');
    const turn = ev.findLast(e => e.type === 'turn.completed');
    const limits = ev.map(e => e.rate_limits ?? e.msg?.rate_limits ?? e.info?.rate_limits).findLast(Boolean);
    countUsage('chatgpt-plan', turn?.usage?.input_tokens ?? 0, turn?.usage?.output_tokens ?? 0, 0, limits);
    const failed = ev.findLast(e => e.type === 'turn.failed' || e.type === 'error');
    if (!text && failed) throw new Error(String(failed.error?.message ?? failed.message ?? 'Codex stopped.').slice(0, 300));
    return text.trim();
  } finally { if (picture) rmSync(picture, { force: true }); }
}

async function askGeminiCli(file: string, system: string, turns: Turn[]): Promise<string> {
  const prompt = `${system}\n\n---\n\n${transcript(turns)}\n\nOx:`;
  const out = await runCli(file, ['-p', '', '--output-format', 'json', '--approval-mode', 'plan'], prompt);
  const start = out.indexOf('{');
  let data: any = {};
  try { data = start >= 0 ? JSON.parse(out.slice(start)) : {}; } catch { data = { response: out }; }
  const models = Object.values<any>(data.stats?.models ?? {});
  countUsage('gemini-plan', models.reduce((a, m) => a + (m.tokens?.prompt ?? 0), 0), models.reduce((a, m) => a + (m.tokens?.candidates ?? 0), 0));
  if (data.error) throw new Error(String(data.error.message ?? 'Gemini CLI stopped.').slice(0, 300));
  return String(data.response ?? '').trim();
}

export async function askPlan(id: CliId, system: string, turns: Turn[]): Promise<string> {
  const file = binary(id);
  if (!file) throw new Error(`${cliNames[id]} isn’t installed on this Mac. Install it and sign in with your plan, then try again.`);
  if (id === 'gemini-plan' && turns.at(-1)?.image) throw new Error('Gemini CLI can’t take a picture from OXBOT yet. Use your Claude or ChatGPT plan for pictures.');
  return id === 'claude-plan' ? askClaudeCode(file, system, turns) : id === 'chatgpt-plan' ? askCodex(file, system, turns) : askGeminiCli(file, system, turns);
}
