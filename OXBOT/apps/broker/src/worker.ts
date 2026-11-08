// OXBOT sign-in service. Holds OXBOT's own app keys so anyone can click "Sign in with WHOOP"
// (or Google, Microsoft, Strava, Oura) without registering a developer app. It stores nothing:
// state is an encrypted blob, and tokens are encrypted to a key that only the user's Mac holds.
import { apps, readScopes, tokenRequest, type AppName } from '../../server/src/providers.ts';
import { openState, randomToken, sealFor, sealState, sha256 } from '../../server/src/handoff.ts';
import { home, privacy, terms } from './pages.ts';

export interface Env { STATE_SECRET?: string; BROKER_URL?: string; [key: string]: string | undefined }
interface State { provider: AppName; scopes: string[]; back: string; nonce: string; key: string; verifier: string; exp: number }

const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const reply = (status: number, body: string) => new Response(body, { status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
const redirect = (location: string) => new Response(null, { status: 302, headers: { ...headers, Location: location } });

// Tokens may only be handed to OXBOT on the user's own computer, never to another website.
const onThisComputer = (url: URL) => url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
const configured = (env: Env, provider: AppName) => Boolean(env[apps[provider].id] && env[apps[provider].secret]);
const allowed = (provider: AppName, scopes: string[]) => scopes.length > 0 && scopes.every(s => readScopes[provider].includes(s));

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = (env.BROKER_URL || url.origin).replace(/\/$/, '');
  if (!env.STATE_SECRET || env.STATE_SECRET.length < 32) return reply(500, 'STATE_SECRET must be set to at least 32 random characters.');

  const page = (render: () => string) => new Response(render(), { status: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=300', 'Content-Type': 'text/html; charset=utf-8' } });
  if (request.method === 'GET' && url.pathname === '/') return page(home);
  if (request.method === 'GET' && url.pathname === '/privacy') return page(privacy);
  if (request.method === 'GET' && url.pathname === '/terms') return page(terms);
  // Search Console ownership file, set as a variable so it can change without a code edit.
  if (request.method === 'GET' && env.GOOGLE_SITE_VERIFICATION && url.pathname === `/${env.GOOGLE_SITE_VERIFICATION}.html`) {
    return new Response(`google-site-verification: ${env.GOOGLE_SITE_VERIFICATION}.html`, { headers: { 'Content-Type': 'text/html' } });
  }
  if (request.method === 'GET' && url.pathname === '/providers') {
    return json(200, Object.fromEntries((Object.keys(apps) as AppName[]).map(p => [p, configured(env, p)])));
  }

  if (request.method === 'GET' && url.pathname === '/start') {
    const q = url.searchParams;
    const provider = q.get('provider') as AppName;
    if (!(provider in apps)) return reply(400, 'Unknown provider.');
    if (!configured(env, provider)) return reply(501, `OXBOT's ${apps[provider].name} app is not set up yet. Use your own app keys on the Connections page.`);
    const scopes = (q.get('scopes') ?? '').split(' ').filter(Boolean);
    if (!allowed(provider, scopes)) return reply(400, 'OXBOT only asks for read-only access.');
    let back: URL;
    try { back = new URL(q.get('return_to') ?? ''); } catch { return reply(400, 'Missing return address.'); }
    if (!onThisComputer(back)) return reply(400, 'Sign-in can only return to OXBOT running on your own computer.');
    const nonce = q.get('nonce') ?? '', key = q.get('key') ?? '';
    if (nonce.length < 16 || key.length < 40) return reply(400, 'Missing handoff key.');
    const app = apps[provider], verifier = randomToken(48);
    const state = await sealState(env.STATE_SECRET, { provider, scopes, back: back.href, nonce, key, verifier, exp: Date.now() + 600_000 } satisfies State);
    const params = new URLSearchParams({ client_id: env[app.id]!, redirect_uri: `${origin}/callback`, response_type: 'code', scope: scopes.join(app.sep), state, ...app.extra });
    if (app.pkce) { params.set('code_challenge', await sha256(verifier)); params.set('code_challenge_method', 'S256'); }
    return redirect(`${app.authorize}?${params}`);
  }

  if (request.method === 'GET' && url.pathname === '/callback') {
    let state: State;
    try { state = await openState<State>(env.STATE_SECRET, url.searchParams.get('state') ?? ''); } catch { return reply(400, 'This sign-in link is not valid. Start again from OXBOT.'); }
    if (state.exp < Date.now()) return reply(400, 'This sign-in took too long. Start again from OXBOT.');
    const back = new URL(state.back);
    back.searchParams.set('nonce', state.nonce);
    const providerError = url.searchParams.get('error');
    if (providerError) { back.searchParams.set('error', providerError.slice(0, 100)); return redirect(back.href); }
    const app = apps[state.provider];
    try {
      const tokens = await tokenRequest(app, env[app.id]!, env[app.secret]!, { grant_type: 'authorization_code', code: url.searchParams.get('code') ?? '', redirect_uri: `${origin}/callback`, ...(app.pkce ? { code_verifier: state.verifier } : {}) });
      back.searchParams.set('payload', await sealFor(state.key, tokens));
    } catch (error) {
      console.warn('exchange failed', state.provider, error instanceof Error ? error.message.slice(0, 120) : error);
      back.searchParams.set('error', 'token_exchange_failed');
    }
    return redirect(back.href);
  }

  // Refreshing needs the client secret, so OXBOT asks here. The refresh token passes through, never stored.
  if (request.method === 'POST' && url.pathname === '/refresh') {
    const body = await request.json().catch(() => null) as { provider?: AppName; refresh_token?: string; scopes?: string[] } | null;
    const provider = body?.provider;
    if (!provider || !(provider in apps) || !body?.refresh_token) return json(400, { error: 'provider and refresh_token are required' });
    if (!configured(env, provider)) return json(501, { error: 'not configured' });
    const app = apps[provider];
    const scopes = (body.scopes ?? []).filter(s => readScopes[provider].includes(s));
    try {
      return json(200, await tokenRequest(app, env[app.id]!, env[app.secret]!, { grant_type: 'refresh_token', refresh_token: body.refresh_token, ...(app.refreshScope && scopes.length ? { scope: scopes.join(app.sep) } : {}) }));
    } catch (error) {
      return json(502, { error: error instanceof Error ? error.message.slice(0, 200) : 'refresh failed' });
    }
  }

  return reply(404, 'Not found.');
}

export default { fetch: handle };
