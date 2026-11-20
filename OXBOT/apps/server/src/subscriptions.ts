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

// The plan's own sign-in, never a key or proxy someone left in the environment (November 16, 2026: on the owner's Mac,
// Claude Code's user settings pointed it at a local proxy that wasn't running, so every plan question failed). The
// variables a parent Claude Code session sets are dropped too, so the app doesn't think it is nested.
const planEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_AGENT_SDK|OPENAI_API_KEY$|OPENAI_BASE_URL$)/.test(k)).concat([['NO_COLOR', '1']]));

function runCli(file: string, args: string[], input: string, timeoutMs = 180_000, onLine?: (line: string) => void, withErr = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: work(), env: planEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', partial = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Your plan’s app took too long to answer.')); }, timeoutMs);
    child.stdout.on('data', d => {
      out += d; if (out.length > 4_000_000) child.kill('SIGTERM');
      if (onLine) { const lines = (partial + d).split('\n'); partial = lines.pop() ?? ''; for (const l of lines) if (l.trim()) onLine(l); }
    });
    child.stderr.on('data', d => { err += d; if (err.length > 200_000) err = err.slice(-100_000); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 || out.trim()) resolve(withErr ? `${out}\n${err}` : out);
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

export interface PlanOptions { onText?: (delta: string) => void; simple?: boolean }

async function askClaudeCode(file: string, system: string, turns: Turn[], o: PlanOptions = {}): Promise<string> {
  const last = turns.at(-1)!;
  const earlier = turns.slice(0, -1);
  const image = last.image?.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  const text = `${earlier.length ? `The conversation so far:\n\n${transcript(earlier)}\n\nThe owner now says:\n` : ''}${last.text}`;
  const message = { type: 'user', message: { role: 'user', content: [...(image ? [{ type: 'image', source: { type: 'base64', media_type: image[1], data: image[2] } }] : []), { type: 'text', text }] } };
  // Only project settings (none, in OXBOT's empty folder): the owner's user settings can route Claude Code somewhere
  // other than the plan. A model the owner picked wins; a simple question goes to the plan's fast model.
  const model = store.secret('CLAUDE_PLAN_MODEL') || (o.simple ? 'haiku' : '');
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', 'project',
    ...(model ? ['--model', model] : []), ...(o.onText ? ['--include-partial-messages'] : []), '--system-prompt', system];
  const onLine = o.onText ? (line: string) => {
    try { const e = JSON.parse(line); if (e.type === 'stream_event' && e.event?.type === 'content_block_delta' && e.event.delta?.type === 'text_delta') o.onText!(String(e.event.delta.text)); } catch { /* not a JSON line */ }
  } : undefined;
  const out = await runCli(file, args, JSON.stringify(message) + '\n', 180_000, onLine);
  const ev = events(out);
  const result = ev.findLast(e => e.type === 'result');
  const limitEvent = ev.findLast(e => /rate_limit/.test(String(e.type)));
  countUsage('claude-plan', result?.usage?.input_tokens ?? 0, result?.usage?.output_tokens ?? 0, result?.total_cost_usd ?? 0, limitEvent?.rate_limit_info ?? limitEvent);
  if (result?.is_error) throw new Error(String(result.result ?? 'Claude Code stopped.').slice(0, 300));
  return String(result?.result ?? ev.filter(e => e.type === 'assistant').flatMap(e => e.message?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')).trim();
}

// Codex takes its model from the owner's ~/.codex/config.toml, which can name a model a ChatGPT sign-in can't use
// (November 16, 2026: "gpt-6.1-sol … is not supported when using Codex with a ChatGPT account"). Then OXBOT tries the
// models that answered through a ChatGPT plan on the owner's Mac that day, and remembers the first one that works.
// A model the owner types on the AI page wins over all of these.
export const codexFallbacks = ['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna'];
const PLAN_MODELS = 'plan-models.json';
const notForPlan = (message: string) => /not supported when using codex with a chatgpt account|model_not_found|model metadata .* not found|does not exist/i.test(message);

async function askCodex(file: string, system: string, turns: Turn[]): Promise<string> {
  const last = turns.at(-1)!;
  const image = last.image?.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  let picture: string | undefined;
  if (image) { picture = join(work(), `${randomBytes(6).toString('hex')}.${image[1] === 'jpeg' ? 'jpg' : image[1]}`); writeFileSync(picture, Buffer.from(image[2], 'base64'), { mode: 0o600 }); }
  const chosen = store.secret('CHATGPT_PLAN_MODEL');
  const remembered = store.doc<Record<string, string>>(PLAN_MODELS, {})['chatgpt-plan'];
  const tries = chosen ? [chosen] : [...new Set([remembered ?? '', ...codexFallbacks.filter(m => m !== remembered)])].slice(0, 4);
  try {
    const prompt = `${system}\n\n---\n\n${transcript(turns)}\n\nOx:`;
    let lastError = '';
    for (const model of tries) {
      // Low reasoning effort: these are conversational answers, and it halves Codex's wait.
      const out = await runCli(file, ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-c', 'model_reasoning_effort="low"', ...(model ? ['-m', model] : []), ...(picture ? ['-i', picture] : []), '-'], prompt);
      const ev = events(out);
      const text = ev.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').map(e => e.item.text).join('\n')
        || ev.filter(e => e.msg?.type === 'agent_message').map(e => e.msg.message).join('\n');
      const turn = ev.findLast(e => e.type === 'turn.completed');
      const limits = ev.map(e => e.rate_limits ?? e.msg?.rate_limits ?? e.info?.rate_limits).findLast(Boolean);
      const failed = ev.findLast(e => e.type === 'turn.failed' || e.type === 'error');
      if (text) {
        countUsage('chatgpt-plan', turn?.usage?.input_tokens ?? 0, turn?.usage?.output_tokens ?? 0, 0, limits);
        if (!chosen && model !== remembered) store.saveDoc(PLAN_MODELS, { ...store.doc<Record<string, string>>(PLAN_MODELS, {}), 'chatgpt-plan': model });
        return text.trim();
      }
      lastError = String(failed?.error?.message ?? failed?.message ?? 'Codex stopped.');
      if (!notForPlan(lastError) || chosen) break;
    }
    const said = lastError.match(/"message":"([^"]+)"/)?.[1] ?? lastError;
    throw new Error(notForPlan(lastError) ? `Codex couldn’t use ${chosen ? `the model ${chosen}` : 'any model OXBOT tried'} with your ChatGPT plan. Pick another on the AI page, under ChatGPT plan, Model.` : said.slice(0, 300));
  } finally { if (picture) rmSync(picture, { force: true }); }
}

// ---------- Is it signed in? ----------
// Each app's own status command, a fixed program with fixed arguments like the questions themselves. Reads nothing else.
export interface PlanStatus { id: CliId; installed: boolean; signedIn?: boolean; plan?: string; how?: string; error?: string }
const statusCache = new Map<CliId, { at: number; s: PlanStatus }>();
export async function planStatus(id: CliId, fresh = false): Promise<PlanStatus> {
  const hit = statusCache.get(id);
  if (!fresh && hit && Date.now() - hit.at < 60_000) return hit.s;
  const file = binary(id);
  let s: PlanStatus = { id, installed: Boolean(file) };
  if (file && id === 'claude-plan') {
    try {
      const j = JSON.parse(await runCli(file, ['auth', 'status'], '', 15_000));
      // Claude Code's status reads its user settings, which OXBOT skips when asking. A token set there (as on the owner's
      // Mac, for a proxy) hides the Claude account underneath, so only "claude.ai" counts as a sure yes; otherwise the
      // AI page says to press Test it, which asks the way OXBOT really does.
      s = { ...s, signedIn: j.authMethod === 'claude.ai' ? true : j.loggedIn === false ? false : undefined, plan: j.subscriptionType ? String(j.subscriptionType) : undefined, how: j.authMethod === 'claude.ai' ? 'your Claude account' : undefined };
    } catch (e) { s = { ...s, signedIn: false, error: (e as Error).message.slice(0, 200) }; }
  } else if (file && id === 'chatgpt-plan') {
    try {
      // Codex prints its status on stderr.
      const said = await runCli(file, ['login', 'status'], '', 15_000, undefined, true).catch((e: Error) => e.message);
      s = { ...s, signedIn: /logged in/i.test(said) && !/not logged in/i.test(said), how: /chatgpt/i.test(said) ? 'your ChatGPT account' : /api key/i.test(said) ? 'an API key' : undefined };
    } catch (e) { s = { ...s, signedIn: false, error: (e as Error).message.slice(0, 200) }; }
  }
  statusCache.set(id, { at: Date.now(), s });
  return s;
}
// A plan whose app says it isn't signed in never gets asks: they'd only fail (owner, November 19, 2026: "chatgpt comes
// preinstalled but like it doesnt do anything").
export const knownSignedOut = (id: string) => statusCache.get(id as CliId)?.s.signedIn === false;

// Sign in with the plan app's own browser sign-in (owner, November 19, 2026: "make it just open up to ur browser"):
// `claude auth login` and `codex login` open the company's login page themselves. A fixed program with fixed arguments.
// Gemini CLI has no sign-in command of its own; it signs in the first time it runs in Terminal.
const logins: Partial<Record<CliId, string[]>> = { 'claude-plan': ['auth', 'login'], 'chatgpt-plan': ['login'] };
const loggingIn = new Map<CliId, ReturnType<typeof spawn>>();
export function startPlanLogin(id: CliId): void {
  const file = binary(id), args = logins[id];
  if (!file) throw new Error(`${id === 'claude-plan' ? 'Claude Code' : id === 'chatgpt-plan' ? 'Codex' : 'Gemini CLI'} isn’t on this Mac yet.`);
  if (!args) throw new Error('Gemini CLI signs in the first time you open it in Terminal.');
  loggingIn.get(id)?.kill();
  const child = spawn(file, args, { cwd: work(), stdio: 'ignore', env: { ...process.env, BROWSER: '' } });
  loggingIn.set(id, child);
  const stop = setTimeout(() => child.kill(), 10 * 60_000);
  child.on('exit', () => { clearTimeout(stop); if (loggingIn.get(id) === child) loggingIn.delete(id); statusCache.delete(id); });
  child.on('error', () => undefined);
  statusCache.delete(id);
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

export async function askPlan(id: CliId, system: string, turns: Turn[], o: PlanOptions = {}): Promise<string> {
  const file = binary(id);
  if (!file) throw new Error(`${cliNames[id]} isn’t installed on this Mac. Install it and sign in with your plan, then try again.`);
  if (id === 'gemini-plan' && turns.at(-1)?.image) throw new Error('Gemini CLI can’t take a picture from OXBOT yet. Use your Claude or ChatGPT plan for pictures.');
  return id === 'claude-plan' ? askClaudeCode(file, system, turns, o) : id === 'chatgpt-plan' ? askCodex(file, system, turns) : askGeminiCli(file, system, turns);
}
