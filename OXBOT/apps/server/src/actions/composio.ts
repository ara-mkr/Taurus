import { isConnected } from '../connectors.ts';
import { composioCatalog } from '../connectors/composio.ts';
import { api, HttpError, store } from '../store.ts';
import { register, type Args } from './approvals.ts';

// Composio tools (owner, November 1, 2026): any action in the apps the owner connected in their Composio project,
// out of the 1,694 Composio lists. A tool runs without asking only when Composio tags it read-only and nothing else
// (readOnlyHint, and none of createHint, updateHint, destructiveHint). Every other tool is a proposal that waits
// for the owner's approval. Built from docs.composio.dev (API v3.1), tested only against mocked responses.

/* eslint-disable @typescript-eslint/no-explicit-any -- Composio payloads are untyped JSON */
const BASE = 'https://backend.composio.dev/api/v3.1';
const headers = () => ({ 'x-api-key': store.secret('COMPOSIO_API_KEY') ?? '', 'Content-Type': 'application/json' });
const user = () => store.secret('COMPOSIO_USER_ID') || 'default';
const slugOk = (slug: unknown) => typeof slug === 'string' && /^[A-Z0-9_]{3,120}$/.test(slug);

export const isReadOnly = (tags: string[] = []) => tags.includes('readOnlyHint') && !tags.some(t => t === 'createHint' || t === 'updateHint' || t === 'destructiveHint');

export interface ToolInfo { slug: string; name: string; app: string; appName: string; description: string; tags: string[]; readOnly: boolean; params: string[] }
const toInfo = (t: any): ToolInfo => {
  const props = t.input_parameters?.properties ?? {}, required = new Set<string>(t.input_parameters?.required ?? []);
  return {
    slug: t.slug, name: t.name ?? t.slug, app: String(t.toolkit?.slug ?? '').toLowerCase(), appName: t.toolkit?.name ?? t.toolkit?.slug ?? '',
    description: String(t.human_description || t.description || '').slice(0, 240), tags: t.tags ?? [], readOnly: isReadOnly(t.tags),
    params: Object.entries(props).slice(0, 14).map(([k, v]: [string, any]) => `${k}${required.has(k) ? '' : '?'}: ${v.type ?? 'any'}${v.description ? ` (${String(v.description).slice(0, 80)})` : ''}`),
  };
};

const ready = () => isConnected('composio') ? undefined : 'Connect Composio first: Settings, then Connections, then Composio.';

// What the AI uses to find the right tool: the app's tools that match what you asked for.
export async function findTools(app: string, query: string): Promise<ToolInfo[]> {
  const missing = ready();
  if (missing) throw new HttpError(409, missing);
  const toolkit = String(app ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!composioCatalog.some(([, slug]) => slug === toolkit)) throw new HttpError(400, `Composio has no app called ${app}.`);
  const list = await api<any>(`${BASE}/tools?${new URLSearchParams({ toolkit_slug: toolkit, query: String(query ?? '').slice(0, 120), limit: '8' })}`, { headers: headers() });
  return (list.items ?? []).filter((t: any) => !t.is_deprecated).map(toInfo);
}

export async function toolInfo(slug: string): Promise<ToolInfo> {
  if (!slugOk(slug)) throw new HttpError(400, `${String(slug).slice(0, 60)} isn’t a Composio tool name.`);
  return toInfo(await api<any>(`${BASE}/tools/${slug}`, { headers: headers() }));
}

async function account(app: string) {
  const list = await api<any>(`${BASE}/connected_accounts?${new URLSearchParams({ user_ids: user(), toolkit_slugs: app, statuses: 'ACTIVE', limit: '5' })}`, { headers: headers() });
  const found = (list.items ?? []).find((a: any) => String(a.toolkit?.slug ?? '').toLowerCase() === app);
  if (!found) throw new HttpError(409, `${app} isn’t connected in your Composio project. Connect it at platform.composio.dev, under the same user ID.`);
  return found.id as string;
}

async function execute(slug: string, accountId: string, args: Args) {
  const reply = await api<any>(`${BASE}/tools/execute/${slug}`, { method: 'POST', headers: headers(), signal: AbortSignal.timeout(60_000), body: JSON.stringify({ connected_account_id: accountId, user_id: user(), arguments: args }) });
  if (reply.successful === false) throw new HttpError(400, `${slug}: ${String(reply.error ?? 'failed').slice(0, 300)}`);
  return reply.data;
}

// A read through a read-only tool: runs straight away, because it changes nothing.
export async function readTool(slug: string, args: Args = {}) {
  const missing = ready();
  if (missing) throw new HttpError(409, missing);
  const info = await toolInfo(slug);
  if (!info.readOnly) throw new HttpError(403, `${info.name} can change things in ${info.appName}, so it needs your approval. Propose it as an action instead.`);
  return execute(info.slug, await account(info.app), args);
}

const show = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value);

register({
  kind: 'app.action', app: 'Composio',
  help: 'Run a Composio tool that changes something (create a Canva design, update a HubSpot deal, add a Notion page). Find it first with the apps tool. Args: tool (its slug), arguments (an object, exactly as the tool wants), summary (one plain sentence of what it does).',
  missing: () => ready() ?? (isConnected('composio-act') ? undefined : 'Allow actions in your Composio apps first: Settings, then Actions.'),
  async prepare(args) {
    const info = await toolInfo(args.tool);
    const inputs = args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments) ? args.arguments as Args : {};
    // The card shows every argument whole, so the owner approves exactly what goes out; too much to show is refused.
    const entries = Object.entries(inputs);
    if (entries.length > 30 || entries.some(([, v]) => show(v).length > 2000)) throw new HttpError(400, `That ${info.name} call is too large to show you exactly. Break it into smaller steps.`);
    const accountId = await account(info.app);
    const summary = String(args.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return {
      title: summary || `${info.name} in ${info.appName}`, to: info.appName,
      lines: [{ label: 'App', value: info.appName }, { label: 'Action', value: info.name }, ...entries.map(([label, value]) => ({ label, value: show(value) }))],
      caution: info.tags.includes('destructiveHint') ? `This deletes or replaces something in ${info.appName}.` : undefined,
      payload: { slug: info.slug, accountId, arguments: inputs, app: info.appName },
    };
  },
  async run(p) {
    const data = await execute(p.slug, p.accountId, p.arguments);
    const link = JSON.stringify(data ?? {}).match(/https:\/\/[^"\s]+/)?.[0];
    return `Done in ${p.app}.${link ? ` ${link}` : ''}`;
  },
});
