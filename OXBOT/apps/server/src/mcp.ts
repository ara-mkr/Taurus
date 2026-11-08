import { randomBytes } from 'node:crypto';
import { register, type Args } from './actions/approvals.ts';
import { HttpError, store } from './store.ts';

// MCP servers (owner, November 6, 2026: "make it so u can add skills for the ai not just plugins and also mcp servers").
// OXBOT speaks the Model Context Protocol's Streamable HTTP transport to servers the owner adds by address: remote ones
// over https, or one running on this Mac at localhost. It never starts a program to run a server (there is still no
// shell). A tool the server marks read-only (readOnlyHint, and not destructive) runs when Ox asks; every other tool is
// an approval card showing each argument. What tools return is data, not instructions. Saved in ~/.oxbot/mcp.json;
// a server's token is a secret like every other key. Built from the MCP specification (2025-06-18) and tested against
// a mock server only.

/* eslint-disable @typescript-eslint/no-explicit-any -- MCP results are untyped JSON */
export interface McpTool { name: string; description: string; readOnly: boolean; params: string[] }
export interface McpServer { id: string; name: string; url: string; on: boolean; added: string; tools: McpTool[]; checked?: string; error?: string }
const FILE = 'mcp.json';
const VERSION = '2025-06-18';
const list = () => store.doc<McpServer[]>(FILE, []);
const save = (all: McpServer[]) => store.saveDoc(FILE, all);
const tokenKey = (id: string) => `MCP_TOKEN_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

export const mcpServers = () => list().map(s => ({ ...s, token: Boolean(store.secret(tokenKey(s.id))) }));

// https anywhere, or plain http only to this Mac.
export function checkUrl(raw: string): string {
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch { throw new HttpError(400, 'That address isn’t a URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new HttpError(400, 'Use an https address, or http only for a server on this Mac.');
  if (u.username || u.password) throw new HttpError(400, 'Put the token in the token field, not the address.');
  return u.toString();
}

// One JSON-RPC exchange. The answer may come back as JSON or as a server-sent event stream.
class Session {
  id?: string; n = 0;
  url: string; token?: string;
  constructor(url: string, token?: string) { this.url = url; this.token = token; }
  async rpc(method: string, params?: unknown, notify = false): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': VERSION };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.id) headers['Mcp-Session-Id'] = this.id;
    const id = notify ? undefined : ++this.n;
    const res = await fetch(this.url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(id ? { id } : {}) }), signal: AbortSignal.timeout(45_000), redirect: 'error' });
    const sid = res.headers.get('mcp-session-id'); if (sid) this.id = sid;
    if (notify) { await res.text().catch(() => ''); return undefined; }
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new HttpError(409, 'The server turned OXBOT away. Check its token.');
    if (!res.ok) throw new HttpError(502, `The MCP server answered ${res.status}: ${text.slice(0, 160)}`);
    let msg: any;
    if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      for (const block of text.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
        if (!data) continue;
        try { const m = JSON.parse(data); if (m.id === id) { msg = m; break; } } catch { /* not JSON */ }
      }
    } else msg = text ? JSON.parse(text) : {};
    if (!msg) throw new HttpError(502, 'The MCP server sent no answer.');
    if (msg.error) throw new HttpError(502, `MCP: ${String(msg.error.message ?? 'error').slice(0, 200)}`);
    return msg.result;
  }
  async open() {
    await this.rpc('initialize', { protocolVersion: VERSION, capabilities: {}, clientInfo: { name: 'OXBOT', version: '1.0' } });
    await this.rpc('notifications/initialized', undefined, true);
    return this;
  }
}

const session = (s: McpServer) => new Session(s.url, store.secret(tokenKey(s.id))).open();

const toTool = (t: any): McpTool => {
  const props = t.inputSchema?.properties ?? {}, required = new Set<string>(t.inputSchema?.required ?? []);
  return {
    name: String(t.name).slice(0, 120), description: String(t.description ?? t.title ?? '').replace(/\s+/g, ' ').slice(0, 240),
    readOnly: t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint !== true,
    params: Object.entries(props).slice(0, 14).map(([k, v]: [string, any]) => `${k}${required.has(k) ? '' : '?'}: ${v?.type ?? 'any'}${v?.description ? ` (${String(v.description).slice(0, 80)})` : ''}`),
  };
};

// Connects, lists the tools and saves them, so Ox knows what each server offers without asking every time.
export async function refreshServer(id: string): Promise<McpServer> {
  const all = list(); const s = all.find(x => x.id === id);
  if (!s) throw new HttpError(404, 'No such MCP server.');
  try {
    const sess = await session(s);
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await sess.rpc('tools/list', cursor ? { cursor } : {});
      tools.push(...(r?.tools ?? []).map(toTool));
      cursor = r?.nextCursor; if (!cursor) break;
    }
    Object.assign(s, { tools: tools.slice(0, 200), checked: new Date().toISOString(), error: undefined });
  } catch (error) { Object.assign(s, { checked: new Date().toISOString(), error: (error as Error).message.slice(0, 200) }); }
  save(all);
  return s;
}

export async function addServer(input: { name?: string; url?: string; token?: string; id?: string; on?: boolean }): Promise<McpServer> {
  const all = list();
  const existing = input.id ? all.find(s => s.id === input.id) : undefined;
  if (input.id && !existing) throw new HttpError(404, 'No such MCP server.');
  if (!existing && all.length >= 30) throw new HttpError(400, 'Up to 30 MCP servers.');
  const url = input.url !== undefined || !existing ? checkUrl(String(input.url ?? '')) : existing.url;
  const name = String(input.name ?? existing?.name ?? '').trim().slice(0, 60) || new URL(url).hostname;
  const s: McpServer = existing ? { ...existing, name, url, on: typeof input.on === 'boolean' ? input.on : existing.on } : { id: `m-${randomBytes(3).toString('hex')}`, name, url, on: input.on ?? true, added: new Date().toISOString(), tools: [] };
  save(existing ? all.map(x => x.id === s.id ? s : x) : [...all, s]);
  if (input.token !== undefined) store.setSecrets({ [tokenKey(s.id)]: String(input.token) });
  return input.url !== undefined || input.token !== undefined || !existing ? refreshServer(s.id) : s;
}

export function removeServer(id: string) { save(list().filter(s => s.id !== id)); store.setSecrets({ [tokenKey(id)]: '' }); }

const find = (server: string, tool: string) => {
  const s = list().find(x => x.on && (x.id === server || x.name.toLowerCase() === String(server).toLowerCase()));
  if (!s) throw new HttpError(404, `No MCP server called ${server} is on.`);
  const t = s.tools.find(x => x.name === tool);
  if (!t) throw new HttpError(404, `${s.name} has no tool called ${tool}.`);
  return { s, t };
};

const resultText = (r: any) => (r?.content ?? []).map((c: any) => c.type === 'text' ? c.text : c.type === 'resource' ? (c.resource?.text ?? c.resource?.uri ?? '') : `[${c.type}]`).join('\n').slice(0, 8000)
  || (r?.structuredContent ? JSON.stringify(r.structuredContent).slice(0, 8000) : '');

async function call(s: McpServer, tool: string, args: Args) {
  const r = await (await session(s)).rpc('tools/call', { name: tool, arguments: args });
  if (r?.isError) throw new HttpError(400, `${tool}: ${resultText(r).slice(0, 300) || 'failed'}`);
  return resultText(r);
}

// A read-only tool runs straight away; anything else must be proposed as mcp.call.
export async function readMcp(server: string, tool: string, args: Args = {}) {
  const { s, t } = find(server, tool);
  if (!t.readOnly) throw new HttpError(403, `${t.name} on ${s.name} isn’t marked read-only, so it needs the owner’s approval. Propose mcp.call instead.`);
  return call(s, t.name, args);
}

// What the AI is told about the servers that are on.
export function mcpText(): string {
  const on = list().filter(s => s.on && s.tools.length);
  if (!on.length) return '';
  return `MCP servers the owner added (use mcp_read for read-only tools, propose mcp.call for the rest):\n${on.map(s => `${s.name} (server "${s.id}"):\n${s.tools.slice(0, 60).map(t => `  - ${t.name}${t.readOnly ? ' [read-only]' : ''}: ${t.description}${t.params.length ? ` Args: ${t.params.join('; ')}` : ''}`).join('\n')}`).join('\n')}`;
}

const show = (v: unknown) => typeof v === 'string' ? v : JSON.stringify(v);
register({
  kind: 'mcp.call', app: 'MCP',
  help: 'Run a tool on an MCP server the owner added, when it changes something. Args: server (its id), tool (its name), arguments (an object), summary (one plain sentence).',
  missing: () => list().some(s => s.on) ? undefined : 'Add an MCP server first: Settings, then Skills.',
  async prepare(args) {
    const { s, t } = find(String(args.server ?? ''), String(args.tool ?? ''));
    const inputs = args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments) ? args.arguments as Args : {};
    const entries = Object.entries(inputs);
    if (entries.length > 30 || entries.some(([, v]) => show(v).length > 2000)) throw new HttpError(400, 'That call is too large to show you exactly. Break it into smaller steps.');
    return {
      title: String(args.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) || `${t.name} on ${s.name}`, to: s.name,
      lines: [{ label: 'Server', value: s.name }, { label: 'Tool', value: t.name }, ...entries.map(([label, value]) => ({ label, value: show(value) }))],
      payload: { server: s.id, tool: t.name, arguments: inputs, name: s.name },
    };
  },
  async run(p) {
    const { s } = find(p.server, p.tool);
    const text = await call(s, p.tool, p.arguments ?? {});
    return `Done on ${p.name}.${text ? ` ${text.slice(0, 200)}` : ''}`;
  },
});
