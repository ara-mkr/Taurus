import { HttpError } from './store.ts';

// Streaming replies from AI providers (owner, November 16, 2026: "it should reply fast"). One POST; when the provider
// answers with server-sent events, each event's JSON goes to onEvent as it arrives; when it answers with plain JSON
// (a provider that ignored stream: true, or a test's mock), that JSON is returned whole and onEvent never runs.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider events are untyped JSON */
export async function postStream(url: string, init: { token?: string; headers?: Record<string, string>; body: unknown; timeoutMs?: number }, onEvent: (event: any) => void): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', ...init.headers };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(init.body), signal: AbortSignal.timeout(init.timeoutMs ?? 120_000) });
  if (!response.ok) throw new HttpError(response.status, `${new URL(url).host} ${response.status}: ${(await response.text()).slice(0, 200)}`);
  if (!(response.headers.get('content-type') ?? '').includes('text/event-stream') || !response.body) {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (block: string) => {
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let event: unknown;
    try { event = JSON.parse(data); } catch { return; /* a keep-alive comment or a partial line */ }
    onEvent(event);
  };
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) { flush(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
  }
  if (buffer.trim()) flush(buffer);
  return undefined;
}
