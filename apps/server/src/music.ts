import { begin } from './activity.ts';
import { isConnected, tokenFor } from './connectors.ts';
import { mediaControl, mediaNow, openInSpotify, type MediaNow } from './mac.ts';
import { api, HttpError } from './store.ts';
import type { MusicState, Track } from './types.ts';
import { show, shown } from './windows.ts';

// Spotify playback (owner, November 4, 2026: "hey taurus play juice wrld on spotify"). Playing, pausing and skipping on
// your own Spotify are instant: they change nothing anyone else sees and are undone with one word, so they don't
// wait for an approval card. Needs its own sign-in (spotify-play) with the playback scopes; the read-only Spotify
// connection stays as it was. Spotify only lets Premium accounts start playback through its API; otherwise, or with
// no device open, the window shows Spotify's own player to press play on. Built from Spotify's Web API docs and
// tested against mocked responses only.

/* eslint-disable @typescript-eslint/no-explicit-any -- Spotify payloads are untyped JSON */
const BASE = 'https://api.spotify.com/v1';
export const canPlay = () => isConnected('spotify-play');
const canSearch = () => canPlay() || isConnected('spotify');
const token = () => tokenFor(canPlay() ? 'spotify-play' : 'spotify');

type Kind = NonNullable<MusicState['context']>['kind'];
interface Found { kind: Kind; name: string; uri: string; id: string; url?: string; uris?: string[] }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const near = (a: string, b: string) => { const x = norm(a), y = norm(b); return x === y || x.replace(/ /g, '') === y.replace(/ /g, ''); };
const toTrack = (t: any): Track => ({
  title: t.name, artist: (t.artists ?? []).map((a: any) => a.name).join(', '), album: t.album?.name,
  art: t.album?.images?.[0]?.url, url: t.external_urls?.spotify, durationMs: t.duration_ms ?? 0,
});

// "lucid dreams by juice wrld", "the album donda", "my chill playlist", "some lofi", "juice wrld".
export function readQuery(said: string): { q: string; kind?: Kind; by?: string } {
  let q = said.trim().replace(/\s+(on|in|with|using)\s+spotify$/i, '').replace(/^(some|a little|a bit of|me some)\s+/i, '').replace(/\s+(please|for me|now)$/i, '').trim();
  if (/^(my )?(liked|saved|favou?rite) (songs|tracks|music)$|^my (likes|music)$/i.test(q)) return { q: '', kind: 'liked' };
  let kind: Kind | undefined;
  const lead = q.match(/^(?:the\s+)?(song|track|album|record|playlist|artist)\s+(.+)$/i);
  if (lead) { const word = lead[1].toLowerCase(); kind = word === 'song' || word === 'track' ? 'track' : word === 'record' ? 'album' : word as Kind; q = lead[2]; }
  else if (/\s+playlist$/i.test(q)) { kind = 'playlist'; q = q.replace(/^my\s+/i, '').replace(/\s+playlist$/i, ''); }
  const music = q.match(/^(?:music|songs|stuff|tracks)\s+(?:by|from)\s+(.+)$/i);
  if (music) return { q: music[1].trim(), kind: 'artist' };
  const by = q.match(/^(.+?)\s+(?:by|from)\s+(.+)$/i);
  if (by && kind !== 'artist' && kind !== 'playlist') return { q: by[1].trim(), kind: kind ?? 'track', by: by[2].trim() };
  return { q: q.trim(), kind };
}

async function find(said: string): Promise<Found> {
  const { q, kind, by } = readQuery(said);
  const t = await token();
  if (kind === 'liked') {
    const liked = await api<any>(`${BASE}/me/tracks?limit=50`, { token: t });
    const uris = (liked.items ?? []).map((i: any) => i.track?.uri).filter(Boolean);
    if (!uris.length) throw new HttpError(404, 'Your Liked Songs is empty.');
    return { kind: 'liked', name: 'Liked Songs', uri: uris[0], id: '', uris, url: 'https://open.spotify.com/collection/tracks' };
  }
  if (!q) throw new HttpError(400, 'Play what? Say an artist, song, album or playlist.');
  // Your own playlists first when you said "playlist".
  if (kind === 'playlist' && canPlay()) {
    const mine = await api<any>(`${BASE}/me/playlists?limit=50`, { token: t }).catch(() => ({ items: [] }));
    const list = (mine.items ?? []).filter(Boolean);
    const hit = list.find((p: any) => near(p.name, q)) ?? list.find((p: any) => norm(p.name).includes(norm(q)));
    if (hit) return { kind: 'playlist', name: hit.name, uri: hit.uri, id: hit.id, url: hit.external_urls?.spotify };
  }
  const query = by ? `track:${q} artist:${by}` : q;
  const r = await api<any>(`${BASE}/search?${new URLSearchParams({ q: query, type: kind ?? 'artist,track,album,playlist', limit: '5' })}`, { token: t });
  const artists = (r.artists?.items ?? []).filter(Boolean), tracks = (r.tracks?.items ?? []).filter(Boolean);
  const albums = (r.albums?.items ?? []).filter(Boolean), playlists = (r.playlists?.items ?? []).filter(Boolean);
  const pick = (x: any, k: Kind): Found => ({ kind: k, name: k === 'track' ? `${x.name} · ${(x.artists ?? []).map((a: any) => a.name).join(', ')}` : x.name, uri: x.uri, id: x.id, url: x.external_urls?.spotify });
  if (kind === 'artist' && artists[0]) return pick(artists[0], 'artist');
  if (kind === 'track' && tracks[0]) return pick(tracks[0], 'track');
  if (kind === 'album' && albums[0]) return pick(albums[0], 'album');
  if (kind === 'playlist' && playlists[0]) return pick(playlists[0], 'playlist');
  // No hint: an artist whose name you said exactly beats a song with that title, then the top song, then the rest.
  const artist = artists.find((a: any) => near(a.name, q));
  if (artist) return pick(artist, 'artist');
  const song = tracks.find((x: any) => near(x.name, q)) ?? tracks[0];
  if (song) return pick(song, 'track');
  if (albums[0]) return pick(albums[0], 'album');
  if (playlists[0]) return pick(playlists[0], 'playlist');
  throw new HttpError(404, `Spotify found nothing for “${said}”.`);
}

const embedOf = (f: Found) => f.kind === 'liked' ? undefined : `https://open.spotify.com/embed/${f.kind}/${f.id}?utm_source=taurus`;

// The device to play on: the one already playing, else the computer, else whatever is open.
async function device(t: string): Promise<{ id: string; name: string } | undefined> {
  const { devices = [] } = await api<any>(`${BASE}/me/player/devices`, { token: t });
  const usable = devices.filter((d: any) => !d.is_restricted && d.id);
  const d = usable.find((x: any) => x.is_active) ?? usable.find((x: any) => x.type === 'Computer') ?? usable[0];
  return d ? { id: d.id, name: d.name } : undefined;
}

const blank = (extra: Partial<MusicState> = {}): MusicState => ({ playing: false, track: null, progressMs: 0, at: new Date().toISOString(), ...extra });
const needsGrant = 'Allow Spotify playback first: Settings, then Actions.';

// The Spotify or Music app open on this Mac, as a MusicState (November 20, 2026): used whenever there's no Spotify
// playback sign-in, so "skip", "pause" and "what's playing" work with nothing connected (mac.ts, "Music apps already open").
const fromApp = (m: MediaNow): MusicState => ({
  playing: m.playing, at: new Date().toISOString(), progressMs: m.positionMs, device: `${m.app} on this Mac`, volume: m.volume, shuffle: m.shuffle,
  track: m.title ? { title: m.title, artist: m.artist ?? '', album: m.album, art: m.art, durationMs: m.durationMs,
    url: m.uri?.startsWith('spotify:track:') ? `https://open.spotify.com/track/${m.uri.slice(14)}` : undefined } : null,
});

// Several windows ask what's playing every few seconds; each answer from the Mac app costs an osascript process, so
// answers from the last 5 seconds are shared and calls already on their way are joined.
let lastState: { at: number; value: Promise<MusicState> } | undefined;
export function state(): Promise<MusicState> {
  if (lastState && Date.now() - lastState.at < 5_000) return lastState.value;
  const value = readState();
  lastState = { at: Date.now(), value };
  value.catch(() => { if (lastState?.value === value) lastState = undefined; });
  return value;
}
async function readState(): Promise<MusicState> {
  if (!canPlay()) { const m = await mediaNow().catch(() => undefined); return m ? fromApp(m) : blank({ setup: true, problem: needsGrant }); }
  const p = await api<any>(`${BASE}/me/player`, { token: await token() });
  const before = shown('music');
  const kept = before?.kind === 'music' ? before.music : undefined;
  return {
    playing: Boolean(p?.is_playing), track: p?.item ? toTrack(p.item) : null, progressMs: p?.progress_ms ?? 0, at: new Date().toISOString(),
    device: p?.device?.name, volume: p?.device?.volume_percent ?? undefined, shuffle: p?.shuffle_state,
    context: kept?.context, embed: p?.item ? undefined : kept?.embed, problem: p?.item ? undefined : kept?.problem,
  };
}

// Spotify takes a moment to switch tracks; read back once it has.
const settle = () => new Promise(r => setTimeout(r, process.env.TAURUS_FAST ? 0 : 700));
const window = (music: MusicState, said?: string) => show({ id: 'music', kind: 'music', music, said });

export async function play(said: string, heard?: string): Promise<{ text: string; music: MusicState }> {
  lastState = undefined;
  if (!canSearch()) {
    const { q, by } = readQuery(said);
    const name = [q, by].filter(Boolean).join(' by ').replace(/\b\w/g, c => c.toUpperCase()) || 'music';
    // No Spotify sign-in, but the app is on this Mac: its own search opens there, one tap from playing.
    if (await openInSpotify([q, by].filter(Boolean).join(' ')).catch(() => false)) {
      const music = blank({ context: { kind: 'track', name, url: `https://open.spotify.com/search/${encodeURIComponent(name)}` }, device: 'Spotify on this Mac' });
      window(music, heard);
      return { text: `${name} is up in Spotify. Tap play there. To have me start songs myself, allow playback in Settings, then Actions.`, music };
    }
    const music = blank({ setup: true, problem: 'Connect Spotify so I can find it and play it: Settings, then Actions.',
      context: { kind: 'track', name, url: `https://open.spotify.com/search/${encodeURIComponent(name)}` } });
    window(music, heard);
    return { text: 'I need Spotify connected first. The button is on screen.', music };
  }
  const step = begin('action', `Spotify: finding ${said.slice(0, 60)}`, { by: 'taurus' });
  try {
    // The song and the speaker are looked up at the same time (November 7, 2026: "if i said play this song boom 2
    // seconds and its done"); one after the other cost a whole Spotify round trip.
    const t = await token();
    const speaker = canPlay() ? device(t).then(d => ({ d }), (error: unknown) => ({ error })) : null;
    const found = await find(said);
    const context = { kind: found.kind, name: found.name, url: found.url };
    const fallback = (problem: string) => blank({ context, embed: embedOf(found), problem });
    if (!canPlay()) {
      const music = fallback('Spotify is connected read-only, so press play here. To have me start it on your speakers, allow playback in Settings, then Actions.');
      window(music, heard); step.done(`Spotify: found ${found.name}`);
      return { text: `Found ${found.name}. Press play in the window.`, music };
    }
    const looked = await speaker!;
    if ('error' in looked) throw looked.error;
    const d = looked.d;
    if (!d) {
      const music = fallback('No Spotify app is open. Open Spotify on any device, or press play here.');
      window(music, heard); step.done(`Spotify: found ${found.name}, no device open`);
      return { text: `Found ${found.name}, but no Spotify app is open. Press play in the window.`, music };
    }
    const body = found.kind === 'track' ? { uris: [found.uri] } : found.uris ? { uris: found.uris } : { context_uri: found.uri };
    try { await api(`${BASE}/me/player/play?device_id=${encodeURIComponent(d.id)}`, { method: 'PUT', token: t, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (error) {
      // 403 is Spotify's "Premium required" (and "restricted device").
      if (!(error instanceof HttpError) || error.status !== 403) throw error;
      const music = fallback('Spotify only lets Premium accounts start music from another app. Press play here instead.');
      window(music, heard); step.done(`Spotify: found ${found.name}, needs Premium to start it`);
      return { text: `Found ${found.name}. Spotify needs Premium for me to start it, so press play in the window.`, music };
    }
    if (found.kind === 'liked') await api(`${BASE}/me/player/shuffle?state=true&device_id=${encodeURIComponent(d.id)}`, { method: 'PUT', token: t }).catch(() => undefined);
    await settle();
    const music: MusicState = { ...await readState(), context, device: d.name, playing: true, embed: undefined, problem: undefined };
    window(music, heard); step.done(`Spotify: playing ${found.name} on ${d.name}`);
    return { text: `Playing ${found.kind === 'track' ? found.name.split(' · ')[0] : found.name}${found.kind === 'liked' ? ', shuffled' : ''}.`, music };
  } catch (error) { step.fail(error); throw error; }
}

// Pause, skip, volume and the rest on the app that's open, when there's no playback sign-in. Undefined when no music
// app is open, so the caller says how to connect.
async function appControl(what: Control, value?: number, heard?: string): Promise<{ text: string; music: MusicState } | undefined> {
  const before = await mediaNow().catch(() => undefined);
  if (!before) return undefined;
  const vol = (n: number) => mediaControl('volume', n);
  const after = what === 'now' ? before
    : what === 'pause' || what === 'resume' || what === 'next' || what === 'previous' ? await mediaControl(what)
    : what === 'volume' ? await vol(value ?? 50)
    : what === 'louder' || what === 'quieter' ? await vol((before.volume ?? 50) + (what === 'louder' ? 1 : -1) * (value ?? 15))
    : await mediaControl('shuffle', what === 'shuffle');
  const music = fromApp(after ?? before);
  window(music, heard);
  const now = music.track ? `${music.track.title} by ${music.track.artist}` : '';
  const text = what === 'now' ? (now ? `${music.playing ? 'This is' : 'Paused on'} ${now}, in ${before.app}.` : `${before.app} is open, with nothing playing.`)
    : what === 'pause' ? 'Paused.' : what === 'resume' ? 'Playing.' : what === 'next' || what === 'previous' ? (now ? `${now}.` : 'Skipped.')
    : what === 'shuffle' ? 'Shuffle on.' : what === 'unshuffle' ? 'Shuffle off.' : music.volume !== undefined ? `Volume ${music.volume}.` : 'Done.';
  return { text, music };
}

export type Control = 'pause' | 'resume' | 'next' | 'previous' | 'volume' | 'louder' | 'quieter' | 'shuffle' | 'unshuffle' | 'now';
export const controls: Control[] = ['pause', 'resume', 'next', 'previous', 'volume', 'louder', 'quieter', 'shuffle', 'unshuffle', 'now'];

export async function control(what: Control, value?: number, heard?: string): Promise<{ text: string; music: MusicState }> {
  lastState = undefined;
  try { return await controlNow(what, value, heard); } finally { lastState = undefined; }
}
async function controlNow(what: Control, value?: number, heard?: string): Promise<{ text: string; music: MusicState }> {
  if (!canPlay()) {
    const local = await appControl(what, value, heard);
    if (local) return local;
    const music = blank({ setup: true, problem: needsGrant });
    window(music, heard);
    return { text: 'I can’t control Spotify yet. Allow playback in Settings, then Actions.', music };
  }
  const t = await token();
  const step = begin('action', `Spotify: ${what}`, { by: 'taurus' });
  try {
    const p = what === 'now' ? undefined : await api<any>(`${BASE}/me/player`, { token: t });
    if (what !== 'now' && !p?.device) throw new HttpError(409, 'Nothing is open on Spotify right now.');
    const vol = (n: number) => api(`${BASE}/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(n)))}`, { method: 'PUT', token: t });
    if (what === 'pause') await api(`${BASE}/me/player/pause`, { method: 'PUT', token: t });
    if (what === 'resume') await api(`${BASE}/me/player/play`, { method: 'PUT', token: t });
    if (what === 'next') await api(`${BASE}/me/player/next`, { method: 'POST', token: t });
    if (what === 'previous') await api(`${BASE}/me/player/previous`, { method: 'POST', token: t });
    if (what === 'volume') await vol(value ?? 50);
    if (what === 'louder' || what === 'quieter') await vol((p.device.volume_percent ?? 50) + (what === 'louder' ? 1 : -1) * (value ?? 15));
    if (what === 'shuffle' || what === 'unshuffle') await api(`${BASE}/me/player/shuffle?state=${what === 'shuffle'}`, { method: 'PUT', token: t });
    if (what === 'next' || what === 'previous') await settle();
    const music = await readState();
    if (what === 'pause') music.playing = false;
    if (what === 'resume') music.playing = true;
    window(music, heard); step.done();
    const now = music.track ? `${music.track.title} by ${music.track.artist}` : '';
    const text = what === 'now' ? (now ? `${music.playing ? 'This is' : 'Paused on'} ${now}.` : 'Nothing is playing.')
      : what === 'pause' ? 'Paused.' : what === 'resume' ? 'Playing.' : what === 'next' || what === 'previous' ? (now ? `${now}.` : 'Skipped.')
      : what === 'shuffle' ? 'Shuffle on.' : what === 'unshuffle' ? 'Shuffle off.' : music.volume !== undefined ? `Volume ${music.volume}.` : 'Done.';
    return { text, music };
  } catch (error) { step.fail(error); throw error; }
}
