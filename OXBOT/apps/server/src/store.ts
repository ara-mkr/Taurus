import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { PhoneSettings } from './types.ts';

export const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
try { process.loadEnvFile(join(root, '.env')); } catch { /* .env is optional */ }

// Everything private lives outside the repo, owner-only.
const dir = process.env.OXBOT_HOME ?? join(homedir(), '.oxbot');
mkdirSync(dir, { recursive: true, mode: 0o700 });

function read<T>(name: string, fallback: T): T {
  try { return JSON.parse(readFileSync(join(dir, name), 'utf8')) as T; } catch { return fallback; }
}
function write(name: string, value: unknown) {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

export interface Tokens { access_token: string; refresh_token?: string; expires_at?: number; scope?: string; meta?: Record<string, string> }

const defaults: PhoneSettings = {
  leadMinutes: 10, escalateAfterSeconds: 60, vipSenders: [], quietStart: '22:30', quietEnd: '06:30',
  ringMeetings: true, ringVip: true, aiProvider: '',
};

export const store = {
  dir,
  tokens(id: string): Tokens | undefined { return read<Record<string, Tokens>>('tokens.json', {})[id]; },
  setTokens(id: string, tokens: Tokens) { write('tokens.json', { ...read('tokens.json', {}), [id]: tokens }); },
  removeTokens(id: string) { const all = read<Record<string, Tokens>>('tokens.json', {}); delete all[id]; write('tokens.json', all); },
  // Environment variables win over values saved from the Connections page.
  secret(name: string): string | undefined { return process.env[name] || read<Record<string, string>>('secrets.json', {})[name] || undefined; },
  fromEnv(name: string) { return Boolean(process.env[name]); },
  setSecrets(values: Record<string, string>) {
    const all = read<Record<string, string>>('secrets.json', {});
    for (const [key, value] of Object.entries(values)) { if (value) all[key] = value.trim(); else delete all[key]; }
    write('secrets.json', all);
  },
  settings(): PhoneSettings { return { ...defaults, ...read<Partial<PhoneSettings>>('settings.json', {}) }; },
  saveSettings(next: Partial<PhoneSettings>) { const merged = { ...this.settings(), ...next }; write('settings.json', merged); return merged; },
  // Plain JSON documents in the private folder: board layouts, history.
  doc<T>(name: string, fallback: T): T { return read(name, fallback); },
  saveDoc(name: string, value: unknown) { write(name, value); },
  pairingKey(): string {
    const saved = read<{ key?: string }>('pairing.json', {});
    if (saved.key) return saved.key;
    const key = randomBytes(18).toString('base64url');
    write('pairing.json', { key });
    return key;
  },
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function api<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(12_000) });
  const text = await response.text();
  if (!response.ok) throw new HttpError(response.status, `${new URL(url).host} ${response.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}
