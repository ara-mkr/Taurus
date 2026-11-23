// OAuth providers, shared by the local server and the hosted sign-in service (apps/broker).
// No Node-only imports here: this file also runs on Cloudflare Workers.

export type AppName = 'google' | 'microsoft' | 'strava' | 'whoop' | 'oura' | 'todoist' | 'asana' | 'atlassian' | 'monday' | 'dropbox' | 'box' | 'spotify' | 'zoom' | 'xero' | 'withings'
  | 'slack' | 'github' | 'notion' | 'linear';
// basic: the token endpoint wants the client ID and secret in an Authorization: Basic header.
// tokenBody: extra fields every token request needs. unwrap: the tokens arrive inside this key.
// scopeParam: the authorize parameter that carries the scopes (Slack's user token uses user_scope). noScope: the
// provider fixes access in the app's own settings and takes no scope parameter (Notion). json: the token endpoint wants JSON.
export interface App { name: string; authorize: string; token: string; id: string; secret: string; pkce: boolean; sep: string; extra?: Record<string, string>; refreshScope?: boolean; basic?: boolean; tokenBody?: Record<string, string>; unwrap?: string; scopeParam?: string; noScope?: boolean; json?: boolean }

export const apps: Record<AppName, App> = {
  google: { name: 'Google', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET', pkce: true, sep: ' ', extra: { access_type: 'offline', prompt: 'select_account consent', include_granted_scopes: 'true' } },
  // Every sign-in asks which account (November 20, 2026: "i have multipe emails"), so another one can be added.
  microsoft: { name: 'Microsoft', authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', id: 'MICROSOFT_CLIENT_ID', secret: 'MICROSOFT_CLIENT_SECRET', pkce: true, sep: ' ', refreshScope: true, extra: { prompt: 'select_account' } },
  strava: { name: 'Strava', authorize: 'https://www.strava.com/oauth/authorize', token: 'https://www.strava.com/oauth/token', id: 'STRAVA_CLIENT_ID', secret: 'STRAVA_CLIENT_SECRET', pkce: false, sep: ',', extra: { approval_prompt: 'auto' } },
  whoop: { name: 'WHOOP', authorize: 'https://api.prod.whoop.com/oauth/oauth2/auth', token: 'https://api.prod.whoop.com/oauth/oauth2/token', id: 'WHOOP_CLIENT_ID', secret: 'WHOOP_CLIENT_SECRET', pkce: false, sep: ' ', refreshScope: true },
  oura: { name: 'Oura', authorize: 'https://cloud.ouraring.com/oauth/authorize', token: 'https://api.ouraring.com/oauth/token', id: 'OURA_CLIENT_ID', secret: 'OURA_CLIENT_SECRET', pkce: false, sep: ' ' },
  // Added October 31, 2026 with the owner's yes to more read-only connectors. Built from each provider's
  // documentation and tested against mocked responses only.
  todoist: { name: 'Todoist', authorize: 'https://todoist.com/oauth/authorize', token: 'https://todoist.com/oauth/access_token', id: 'TODOIST_CLIENT_ID', secret: 'TODOIST_CLIENT_SECRET', pkce: false, sep: ',' },
  asana: { name: 'Asana', authorize: 'https://app.asana.com/-/oauth_authorize', token: 'https://app.asana.com/-/oauth_token', id: 'ASANA_CLIENT_ID', secret: 'ASANA_CLIENT_SECRET', pkce: true, sep: ' ' },
  atlassian: { name: 'Atlassian', authorize: 'https://auth.atlassian.com/authorize', token: 'https://auth.atlassian.com/oauth/token', id: 'ATLASSIAN_CLIENT_ID', secret: 'ATLASSIAN_CLIENT_SECRET', pkce: false, sep: ' ', extra: { audience: 'api.atlassian.com', prompt: 'consent' } },
  monday: { name: 'monday.com', authorize: 'https://auth.monday.com/oauth2/authorize', token: 'https://auth.monday.com/oauth2/token', id: 'MONDAY_CLIENT_ID', secret: 'MONDAY_CLIENT_SECRET', pkce: false, sep: ' ' },
  dropbox: { name: 'Dropbox', authorize: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', id: 'DROPBOX_CLIENT_ID', secret: 'DROPBOX_CLIENT_SECRET', pkce: true, sep: ' ', extra: { token_access_type: 'offline' } },
  box: { name: 'Box', authorize: 'https://account.box.com/api/oauth2/authorize', token: 'https://api.box.com/oauth2/token', id: 'BOX_CLIENT_ID', secret: 'BOX_CLIENT_SECRET', pkce: false, sep: ' ' },
  spotify: { name: 'Spotify', authorize: 'https://accounts.spotify.com/authorize', token: 'https://accounts.spotify.com/api/token', id: 'SPOTIFY_CLIENT_ID', secret: 'SPOTIFY_CLIENT_SECRET', pkce: true, sep: ' ', basic: true },
  zoom: { name: 'Zoom', authorize: 'https://zoom.us/oauth/authorize', token: 'https://zoom.us/oauth/token', id: 'ZOOM_CLIENT_ID', secret: 'ZOOM_CLIENT_SECRET', pkce: true, sep: ' ', basic: true },
  xero: { name: 'Xero', authorize: 'https://login.xero.com/identity/connect/authorize', token: 'https://identity.xero.com/connect/token', id: 'XERO_CLIENT_ID', secret: 'XERO_CLIENT_SECRET', pkce: true, sep: ' ', basic: true },
  withings: { name: 'Withings', authorize: 'https://account.withings.com/oauth2_user/authorize2', token: 'https://wbsapi.withings.net/v2/oauth2', id: 'WITHINGS_CLIENT_ID', secret: 'WITHINGS_CLIENT_SECRET', pkce: false, sep: ',', tokenBody: { action: 'requesttoken' }, unwrap: 'body' },
  // November 19, 2026 (owner: "make it just bring into the actual companies sign in login page"): the big apps that
  // used to need a pasted key. Built from each provider's OAuth documentation; tested against mocked responses only.
  slack: { name: 'Slack', authorize: 'https://slack.com/oauth/v2/authorize', token: 'https://slack.com/api/oauth.v2.access', id: 'SLACK_CLIENT_ID', secret: 'SLACK_CLIENT_SECRET', pkce: false, sep: ',', scopeParam: 'user_scope', unwrap: 'authed_user' },
  github: { name: 'GitHub', authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', id: 'GITHUB_CLIENT_ID', secret: 'GITHUB_CLIENT_SECRET', pkce: false, sep: ' ' },
  notion: { name: 'Notion', authorize: 'https://api.notion.com/v1/oauth/authorize', token: 'https://api.notion.com/v1/oauth/token', id: 'NOTION_CLIENT_ID', secret: 'NOTION_CLIENT_SECRET', pkce: false, sep: ' ', basic: true, json: true, noScope: true, extra: { owner: 'user' } },
  linear: { name: 'Linear', authorize: 'https://linear.app/oauth/authorize', token: 'https://api.linear.app/oauth/token', id: 'LINEAR_CLIENT_ID', secret: 'LINEAR_CLIENT_SECRET', pkce: false, sep: ',', extra: { prompt: 'consent' } },
};

// The only scopes the sign-in service will ever request: all read-only.
export const readScopes: Record<AppName, string[]> = {
  google: [
    'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/googlehealth.sleep.readonly', 'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
    'https://www.googleapis.com/auth/tasks.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/analytics.readonly',
  ],
  microsoft: ['offline_access', 'User.Read', 'Mail.Read', 'Calendars.Read', 'Chat.Read', 'Tasks.Read', 'Files.Read'],
  strava: ['read', 'activity:read_all'],
  whoop: ['offline', 'read:recovery', 'read:sleep', 'read:cycles'],
  oura: ['daily', 'heartrate'],
  todoist: ['data:read'],
  asana: ['tasks:read', 'projects:read', 'users:read', 'workspaces:read'],
  atlassian: ['read:jira-work', 'read:jira-user', 'offline_access'],
  monday: ['me:read', 'boards:read'],
  dropbox: ['account_info.read', 'files.metadata.read'],
  box: ['root_readonly'],
  spotify: ['user-read-currently-playing', 'user-read-recently-played'],
  zoom: ['meeting:read:list_meetings', 'cloud_recording:read:list_user_recordings', 'user:read:user'],
  xero: ['offline_access', 'accounting.reports.read', 'accounting.settings.read'],
  withings: ['user.metrics', 'user.activity'],
  // Slack: search messages that mention you. GitHub: your notifications (review requests), never code. Notion: no
  // scopes; you pick the pages it may read on Notion's own screen, so 'pages' stands in here. Linear: read only.
  slack: ['search:read'],
  github: ['notifications', 'read:user'],
  notion: ['pages'],
  linear: ['read'],
};

// Write scopes (owner, November 1, 2026), each asked for in its own sign-in with the owner's own app keys, never
// through the sign-in service. Taurus uses them only to run an action the owner approved.
export const writeScopes: Partial<Record<AppName, string[]>> = {
  google: ['https://www.googleapis.com/auth/gmail.send'],
  microsoft: ['offline_access', 'User.Read', 'Mail.Send'],
  // Playback on your own Spotify (owner, November 4, 2026), plus reading your Liked Songs and playlists to find what you asked for.
  spotify: ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing', 'user-library-read', 'playlist-read-private'],
};

export interface TokenSet { access_token: string; refresh_token?: string; expires_at?: number; scope?: string }

// The link to the provider's own sign-in page, for the local server and the sign-in service alike.
export function authorizeUrl(app: App, clientId: string, redirectUri: string, scopes: string[], state: string, challenge?: string) {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state, ...app.extra });
  if (!app.noScope) params.set(app.scopeParam ?? 'scope', scopes.join(app.sep));
  if (app.pkce && challenge) { params.set('code_challenge', challenge); params.set('code_challenge_method', 'S256'); }
  return `${app.authorize}?${params}`;
}

export async function tokenRequest(app: App, clientId: string, clientSecret: string, body: Record<string, string>): Promise<TokenSet> {
  const headers: Record<string, string> = { 'Content-Type': app.json ? 'application/json' : 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (app.basic) headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
  const fields = { ...(app.basic ? {} : { client_id: clientId, client_secret: clientSecret }), ...app.tokenBody, ...body };
  // Basic-auth providers still get the client ID in the form, as most of them document it; JSON ones take only the body.
  if (app.basic && !app.json) Object.assign(fields, { client_id: clientId });
  const response = await fetch(app.token, {
    method: 'POST', headers,
    body: app.json ? JSON.stringify(fields) : new URLSearchParams(fields),
    signal: AbortSignal.timeout(12_000),
  });
  const text = await response.text();
  // Said plainly on the board, never as the provider's raw JSON (owner, November 19, 2026: "don't make it look vibe coded").
  if (!response.ok) throw new Error(/invalid_grant|expired|revoked/i.test(text) || response.status === 401 ? `${app.name} sign-in expired.` : `${app.name} sign-in failed (${response.status}).`);
  const raw = JSON.parse(text);
  if (raw?.ok === false) throw new Error(/invalid_code|expired|revoked/i.test(String(raw.error)) ? `${app.name} sign-in expired.` : `${app.name} sign-in failed.`);
  const data = (app.unwrap ? raw[app.unwrap] : raw) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string } | undefined;
  if (!data?.access_token) throw new Error(`${app.name} sign-in didn’t return access.`);
  return { access_token: data.access_token, refresh_token: data.refresh_token, scope: data.scope, expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined };
}
