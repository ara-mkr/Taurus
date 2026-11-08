import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { api, HttpError } from '../store.ts';
import type { Need, Update } from '../types.ts';
import { appFields, DAY, decode, iso, list, startOfToday, toggleField, type Def } from './kit.ts';

// Files, music, feeds and weather connectors added October 31, 2026 (owner's yes, docs/decision-log.md).
// All read-only. Built from each provider's documented API and tested only against mocked responses
// (apps/server/test/connectors.test.ts); none has been tried with a real account yet.

/* eslint-disable @typescript-eslint/no-explicit-any -- provider payloads are untyped JSON */
const ago = (days: number) => iso(Date.now() - days * DAY);

// Obsidian is a folder of Markdown files on this Mac: open tasks with a due date (the Tasks plugin's "📅 2026-10-31")
// and the notes you touched most recently. Nothing leaves the Mac.
function readVault(vault: string) {
  const notes: { path: string; mtime: number }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || notes.length > 5000) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith('.md')) notes.push({ path: full, mtime: statSync(full).mtimeMs });
    }
  };
  walk(vault, 0);
  const name = basename(vault);
  const link = (path: string) => `obsidian://open?vault=${encodeURIComponent(name)}&file=${encodeURIComponent(relative(vault, path).replace(/\.md$/, ''))}`;
  const due: Need[] = [];
  const today = new Date(startOfToday()).toLocaleDateString('en-CA');
  for (const note of notes.filter(n => n.mtime > Date.now() - 90 * DAY)) {
    for (const line of readFileSync(note.path, 'utf8').split('\n')) {
      const m = line.match(/^\s*[-*] \[ \] (.+?)\s*📅\s*(\d{4}-\d{2}-\d{2})/u);
      if (m && m[2] <= today) due.push({ id: `obsidian:${relative(vault, note.path)}:${m[1]}`, title: m[1].replace(/[⏫🔼🔽⏬]/gu, '').trim(), detail: m[2] < today ? `Overdue · ${basename(note.path, '.md')}` : `Due today · ${basename(note.path, '.md')}`, source: 'Obsidian', at: iso(note.mtime), url: link(note.path) });
    }
  }
  const updates: Update[] = notes.sort((a, b) => b.mtime - a.mtime).slice(0, 5).map(n => ({ id: `obsidian:${relative(vault, n.path)}`, title: basename(n.path, '.md'), detail: 'Note edited', source: 'Obsidian', at: iso(n.mtime), url: link(n.path) }));
  return { needs: due.slice(0, 8), updates };
}

// RSS 2.0 <item> and Atom <entry>, enough of each to list headlines.
function parseFeed(xml: string, source: string): Update[] {
  const tag = (block: string, name: string) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, '').trim() : undefined; };
  const feedTitle = tag(xml.replace(/<(item|entry)[\s>][\s\S]*$/i, ''), 'title') || source;
  return [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map(([block]) => {
    const link = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? tag(block, 'link');
    const when = tag(block, 'pubDate') ?? tag(block, 'updated') ?? tag(block, 'published') ?? tag(block, 'dc:date');
    return { id: `rss:${link ?? tag(block, 'title')}`, title: tag(block, 'title') ?? '(untitled)', detail: feedTitle, source: 'RSS', at: when && !Number.isNaN(Date.parse(when)) ? iso(Date.parse(when)) : undefined, url: link };
  });
}

// WMO weather codes, as Open-Meteo returns them.
const sky = (code: number) => code === 0 ? 'Clear' : code <= 2 ? 'Partly cloudy' : code === 3 ? 'Overcast' : code <= 48 ? 'Fog' : code <= 57 ? 'Drizzle' : code <= 67 ? 'Rain' : code <= 77 ? 'Snow' : code <= 82 ? 'Rain showers' : code <= 86 ? 'Snow showers' : 'Thunderstorm';

export const filesFeedsDefs: Def[] = [
  {
    id: 'google-drive', name: 'Google Drive and Docs', group: 'Files', mockOnly: true,
    reads: 'Names of files changed in the last three days and who changed them. File contents are never read.',
    oauth: { app: 'google', scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'] }, fields: appFields('google'),
    setup: 'Same Google OAuth client as Gmail. Enable the Google Drive API. OXBOT asks only for drive.metadata.readonly.', setupUrl: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
    async pull({ token }) {
      const q = encodeURIComponent(`modifiedTime > '${ago(3)}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
      const data = await api<any>(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=8&fields=${encodeURIComponent('files(id,name,modifiedTime,webViewLink,lastModifyingUser(displayName,me))')}`, { token: await token() });
      return {
        updates: (data.files ?? []).map((f: any) => ({ id: `drive:${f.id}`, title: f.name, detail: f.lastModifyingUser?.me ? 'Edited by you' : `Edited by ${f.lastModifyingUser?.displayName ?? 'someone'}`, source: 'Google Drive', at: f.modifiedTime, url: f.webViewLink })),
      };
    },
  },
  {
    id: 'dropbox', name: 'Dropbox', group: 'Files', mockOnly: true,
    reads: 'Names of the files most recently changed in one folder you choose. File contents are never read.',
    oauth: { app: 'dropbox', scopes: ['account_info.read', 'files.metadata.read'] },
    fields: [...appFields('dropbox'), { key: 'DROPBOX_FOLDER', label: 'Folder', optional: true, placeholder: '/Work (blank for the top level)' }],
    setup: 'Dropbox App Console → Create app → Scoped access → Full Dropbox. On Permissions tick only account_info.read and files.metadata.read. Add the redirect URL.', setupUrl: 'https://www.dropbox.com/developers/apps',
    async pull({ token, field }) {
      // Dropbox's API is all POST; list_folder only reads names and dates.
      const data = await api<any>('https://api.dropboxapi.com/2/files/list_folder', { method: 'POST', token: await token(), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: field('DROPBOX_FOLDER')?.replace(/\/$/, '') ?? '', limit: 200 }) });
      return {
        updates: (data.entries ?? []).filter((e: any) => e['.tag'] === 'file').sort((a: any, b: any) => Date.parse(b.server_modified) - Date.parse(a.server_modified)).slice(0, 8)
          .map((e: any) => ({ id: `dropbox:${e.id}`, title: e.name, detail: e.path_display, source: 'Dropbox', at: e.server_modified, url: `https://www.dropbox.com/home${encodeURI(e.path_display.replace(/\/[^/]*$/, ''))}` })),
      };
    },
  },
  {
    id: 'box', name: 'Box', group: 'Files', mockOnly: true,
    reads: 'Names of files you opened or changed recently. File contents are never read.',
    oauth: { app: 'box', scopes: ['root_readonly'] }, fields: appFields('box'),
    setup: 'Box Developer Console → Create Platform App → Custom App → User Authentication (OAuth 2.0). Under scopes keep only "Read all files and folders". Add the redirect URL.', setupUrl: 'https://app.box.com/developers/console',
    async pull({ token }) {
      const data = await api<any>('https://api.box.com/2.0/recent_items?limit=8&fields=name,modified_at,modified_by', { token: await token() });
      return {
        updates: (data.entries ?? []).filter((e: any) => e.item?.type === 'file').map((e: any) => ({ id: `box:${e.item.id}`, title: e.item.name, detail: e.item.modified_by?.name ? `Changed by ${e.item.modified_by.name}` : 'Recent', source: 'Box', at: e.item.modified_at ?? e.interacted_at, url: `https://app.box.com/file/${e.item.id}` })),
      };
    },
  },
  {
    id: 'onedrive', name: 'OneDrive and SharePoint files', group: 'Files', mockOnly: true,
    reads: 'Names of your recent files and who changed them. File contents are never read.',
    oauth: { app: 'microsoft', scopes: ['offline_access', 'User.Read', 'Files.Read'] }, fields: appFields('microsoft'),
    setup: 'Same Microsoft app as Outlook. Add the delegated permission Files.Read.', setupUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    async pull({ token }) {
      const data = await api<any>('https://graph.microsoft.com/v1.0/me/drive/recent?$top=8', { token: await token() });
      return {
        updates: (data.value ?? []).map((f: any) => ({ id: `onedrive:${f.id}`, title: f.name, detail: f.lastModifiedBy?.user?.displayName ? `Changed by ${f.lastModifiedBy.user.displayName}` : 'Recent', source: 'OneDrive', at: f.lastModifiedDateTime, url: f.webUrl })),
      };
    },
  },
  {
    id: 'obsidian', name: 'Obsidian', group: 'Files', mockOnly: true,
    reads: 'Open tasks with a due date of today or earlier (📅 date), and the notes you edited last. Read from the vault folder on this Mac; nothing leaves it.',
    fields: [{ key: 'OBSIDIAN_VAULT', label: 'Vault folder', placeholder: '~/Documents/Obsidian/My vault' }],
    setup: 'Paste the path of your vault folder. Tasks need a due date in the Tasks plugin format, for example "- [ ] Send deck 📅 2026-11-02".', setupUrl: 'https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data',
    async pull({ field }) {
      const vault = field('OBSIDIAN_VAULT')!.replace(/^~(?=\/)/, process.env.HOME ?? '~');
      if (!existsSync(vault) || !statSync(vault).isDirectory()) throw new Error(`Obsidian: no folder at ${vault}`);
      return readVault(vault);
    },
  },
  {
    id: 'spotify', name: 'Spotify', group: 'Media', mockOnly: true,
    reads: 'What you’re playing now and the last few tracks you played.',
    oauth: { app: 'spotify', scopes: ['user-read-currently-playing', 'user-read-recently-played'] }, fields: appFields('spotify'),
    setup: 'Spotify for Developers → Create app → Web API. Add the redirect URL. OXBOT asks only for user-read-currently-playing and user-read-recently-played.', setupUrl: 'https://developer.spotify.com/dashboard',
    async pull({ token }) {
      const t = await token();
      const [now, recent] = await Promise.all([
        api<any>('https://api.spotify.com/v1/me/player/currently-playing', { token: t }),
        api<any>('https://api.spotify.com/v1/me/player/recently-played?limit=5', { token: t }),
      ]);
      const track = (t: any) => `${t.name} · ${(t.artists ?? []).map((a: any) => a.name).join(', ')}`;
      const updates: Update[] = [];
      if (now?.item && now.is_playing) updates.push({ id: `spotify:now:${now.item.id}`, title: `Playing: ${track(now.item)}`, source: 'Spotify', at: iso(Date.now()), url: now.item.external_urls?.spotify });
      for (const r of recent.items ?? []) updates.push({ id: `spotify:${r.track.id}:${r.played_at}`, title: track(r.track), detail: 'Played', source: 'Spotify', at: r.played_at, url: r.track.external_urls?.spotify });
      return { updates: updates.slice(0, 6) };
    },
  },
  {
    id: 'rss', name: 'RSS and Atom feeds', group: 'Feeds', mockOnly: true,
    reads: 'The newest posts from the feeds you list: blogs, newsletters, podcasts, release notes. No account needed; only the feed address is requested.',
    fields: [{ key: 'RSS_URLS', label: 'Feed addresses, one per line or comma separated', placeholder: 'https://example.com/feed.xml' }],
    setup: 'Paste feed addresses. Most blogs have one at /feed, /rss or /atom.xml.', setupUrl: 'https://en.wikipedia.org/wiki/RSS',
    async pull({ field }) {
      const feeds = await Promise.all(list(field('RSS_URLS')).slice(0, 12).map(async url => {
        if (!/^https?:\/\//i.test(url)) throw new Error(`RSS: ${url} is not a web address`);
        const response = await fetch(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(12_000) });
        if (!response.ok) throw new HttpError(response.status, `${new URL(url).host} ${response.status}`);
        return parseFeed(await response.text(), new URL(url).host).slice(0, 10);
      }));
      return { updates: feeds.flat().sort((a, b) => Date.parse(b.at ?? '0') - Date.parse(a.at ?? '0')).slice(0, 10) };
    },
  },
  {
    id: 'weather', name: 'Weather (Open-Meteo)', group: 'Feeds', mockOnly: true,
    reads: 'Today’s weather where you are: now, high, low and chance of rain. No account; only the place you type is sent.',
    fields: [{ key: 'WEATHER_PLACE', label: 'City, or latitude,longitude', placeholder: 'Oakland or 37.80,-122.27' }, { key: 'WEATHER_UNITS', label: 'Units', optional: true, placeholder: 'celsius or fahrenheit' }],
    setup: 'Type a city. Open-Meteo is free and needs no account.', setupUrl: 'https://open-meteo.com/',
    async pull({ field }) {
      const place = field('WEATHER_PLACE')!.trim();
      const coords = place.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      let lat: number, lon: number, label = place;
      if (coords) { lat = Number(coords[1]); lon = Number(coords[2]); }
      else {
        const found = await api<any>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
        const hit = found.results?.[0];
        if (!hit) throw new Error(`Weather: can’t find ${place}`);
        lat = hit.latitude; lon = hit.longitude; label = [hit.name, hit.admin1].filter(Boolean).join(', ');
      }
      const f = /^f/i.test(field('WEATHER_UNITS') ?? '');
      const data = await api<any>(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1${f ? '&temperature_unit=fahrenheit' : ''}`);
      const deg = (n: number) => `${Math.round(n)}°${f ? 'F' : 'C'}`;
      // "Now" is Open-Meteo's forecast-model estimate for this spot, not a thermometer reading, so it can sit a few
      // degrees off a phone's weather app or the nearest airport (November 2, 2026: 69°F here, 65°F on the owner's phone,
      // 72°F measured at Logan). Say so, with the model's time.
      const at = String(data.current.time ?? '').slice(11, 16);
      const feels = typeof data.current.apparent_temperature === 'number' ? `, feels like ${deg(data.current.apparent_temperature)}` : '';
      return {
        updates: [{
          id: 'weather:today', title: `${deg(data.current.temperature_2m)}, ${sky(data.current.weather_code).toLowerCase()}${feels}`,
          detail: `High ${deg(data.daily.temperature_2m_max[0])}, low ${deg(data.daily.temperature_2m_min[0])}, rain ${data.daily.precipitation_probability_max[0] ?? 0}% · ${label} · forecast model${at ? ` at ${at}` : ''}`,
          source: 'Weather', at: iso(Date.now()), url: `https://open-meteo.com/en/docs#latitude=${lat}&longitude=${lon}`,
        }],
      };
    },
  },
  {
    id: 'hacker-news', name: 'Hacker News', group: 'Feeds', mockOnly: true, toggle: true,
    reads: 'The top five stories on Hacker News right now. No account; nothing about you is sent.',
    fields: [toggleField('hacker-news')],
    setup: 'Turn it on. It uses Hacker News’ public API.', setupUrl: 'https://github.com/HackerNews/API',
    async pull() {
      const ids = await api<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json');
      const items = await Promise.all(ids.slice(0, 5).map(id => api<any>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)));
      return { updates: items.map(i => ({ id: `hn:${i.id}`, title: i.title, detail: `${i.score} points · ${i.descendants ?? 0} comments`, source: 'Hacker News', at: iso(i.time * 1000), url: `https://news.ycombinator.com/item?id=${i.id}` })) };
    },
  },
];
