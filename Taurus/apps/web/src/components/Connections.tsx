import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, type ComposioInfo, type ConnectorInfo, type Group, type PhoneInfo } from '../api';
import { drawn } from './brandmarks';
import { connectorsFor, markFor, siteName, websitesIn } from './logos';
import { Qr } from './Qr';
import { inDesktop } from './Voice';

// In the order a day goes: what reaches you, what you owe, what you know, how you are, then Taurus's own plumbing.
const groups: [Group, string][] = [
  ['Mail', 'Mail'], ['Calendar', 'Calendar and meetings'], ['Chat', 'Chat'], ['Tasks', 'Tasks and projects'], ['Code', 'Code and incidents'],
  ['Files', 'Docs and files'], ['Sales', 'Sales and support'], ['Money', 'Money'], ['Numbers', 'Company numbers'], ['Body', 'Health'],
  ['Media', 'Media'], ['Feeds', 'News, feeds and weather'], ['Hub', 'Hundreds more apps, through Composio'], ['AI', 'AI'], ['Phone', 'Ringing'],
];
// Shorter names for the filter row.
const filterNames: Partial<Record<Group, string>> = { Calendar: 'Calendar', Tasks: 'Tasks', Code: 'Code', Files: 'Files', Sales: 'Sales', Numbers: 'Numbers', Feeds: 'News and feeds', Hub: 'Composio' };
const groupLabel = (g: Group) => groups.find(([key]) => key === g)?.[1] ?? g;
const matches = (c: ConnectorInfo, query: string) => !query || `${c.name} ${c.reads} ${groupLabel(c.group)}`.toLowerCase().includes(query.toLowerCase());
const short = (c: ConnectorInfo) => c.name.split(' (')[0];
// The tile line: what it reads, without the AI connectors' leading "Nothing."
const blurb = (c: ConnectorInfo) => c.reads.replace(/^Nothing\.\s*/, '');
// OAuth sends you back to this Mac's own address, so a phone on Wi-Fi can't finish that step.
const onThisMac = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

// Initials go white on dark brand colours and near-black on light ones, whichever reads better.
function inkOn(hex: string) {
  const lin = (i: number) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  const l = .2126 * lin(0) + .7152 * lin(2) + .0722 * lin(4);
  return 1.05 / (l + .05) >= (l + .05) / .0573 ? '#fff' : '#111';
}

// A brand mark: Simple Icons glyph on a white tile, or the brand's initials on its own colour.
export function AppLogo({ id, name, size = 44 }: { id: string; name: string; size?: number }) {
  const mark = markFor(id, name);
  if ('drawn' in mark) return <span className="app-logo" style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 24 24" width={Math.round(size * .6)} height={Math.round(size * .6)}>{drawn[mark.drawn]()}</svg>
  </span>;
  if ('path' in mark) return <span className="app-logo" style={{ width: size, height: size }} aria-hidden="true">
    <svg viewBox="0 0 24 24" width={Math.round(size * .55)} height={Math.round(size * .55)}><path d={mark.path} fill={`#${mark.hex}`} /></svg>
  </span>;
  return <span className="app-logo letters" style={{ width: size, height: size, background: `#${mark.hex}`, color: inkOn(mark.hex), fontSize: Math.max(13, Math.round(size * (mark.letters.length > 2 ? .3 : .42))) }} aria-hidden="true">{mark.letters}</span>;
}

// Composio's own list of apps: what your project has connected, and a search across everything it offers.
function ComposioApps({ connected }: { connected: boolean }) {
  const [info, setInfo] = useState<ComposioInfo | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { api.composio().then(setInfo).catch(() => setInfo(null)); }, [connected]);
  if (!info) return null;
  const mine = new Set(info.apps.map(a => a.slug));
  const q = query.trim().toLowerCase();
  const found = q ? info.catalog.filter(([name, slug]) => name.toLowerCase().includes(q) || slug.includes(q)).sort(([a], [b]) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))).slice(0, 12) : [];
  const readCount = Object.keys(info.readers).length;
  return <div className="composio">
    {connected && <>
      <h3>Your Composio apps</h3>
      {info.apps.length === 0 ? <p className="muted">None yet. Connect apps in Composio under the same user ID; they show here after the next refresh.</p>
        : <ul className="app-rows">{info.apps.map(app => <li key={app.slug}>
          <span>{app.name}</span>
          <span className={app.error ? 'problem' : 'muted'}>{app.error ?? (app.reads ? `Reads: ${app.reads.toLowerCase()}` : 'Connected. Taurus has no reader for it yet')}</span>
        </li>)}</ul>}
    </>}
    <label className="find">
      <span>Look up any of Composio’s {info.catalog.length.toLocaleString('en-US')} apps. Taurus reads {readCount} of them.</span>
      <input type="search" placeholder="Pipedrive, Zendesk, Vercel…" value={query} onChange={e => setQuery(e.target.value)} />
    </label>
    {q && (found.length === 0 ? <p className="muted">Composio doesn’t list “{query}”.</p> : <ul className="app-rows">{found.map(([name, slug]) => <li key={slug}>
      <span>{name}</span>
      <span className="muted">{info.readers[slug] ? `${mine.has(slug) ? 'Connected. ' : ''}Reads: ${info.readers[slug].toLowerCase()}` : mine.has(slug) ? 'Connected. Not read yet' : 'In Composio. Not read yet'}</span>
    </li>)}</ul>)}
  </div>;
}

function status(c: ConnectorInfo, allow: boolean) {
  if (c.lastError) return 'Error';
  if (c.connected) return allow ? 'Allowed' : 'Connected';
  if (c.auth === 'oauth' && c.ready) return allow ? 'Ready to allow' : 'Sign in';
  return allow ? 'Not allowed' : 'Not connected';
}

// What it takes to connect, in words, for a tile that isn't connected yet.
function how(c: ConnectorInfo) {
  if (c.auth === 'switch') return 'No account needed';
  if (c.auth === 'oauth') return c.oneClick || c.ready ? 'Sign in' : c.fields.some(f => f.instead) ? 'Paste a key' : 'Sign-in coming soon';
  return c.fields.some(f => f.secret) ? 'Paste a key' : 'Add an address';
}

// The form and buttons for one connector. allow: the same body on the Actions page, for a write grant (November 1, 2026).
function ConnectorBody({ c, onChange, allow = false }: { c: ConnectorInfo; onChange: (list: ConnectorInfo[]) => void; allow?: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = Object.values(values).some(Boolean);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try { onChange((await api.saveFields(c.id, values)).connectors); setValues({}); setMessage('Saved.'); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  // Google hands out a client_secret_*.json; loading it saves both values without copy and paste.
  async function loadGoogleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMessage('');
    try {
      const data = JSON.parse(await file.text());
      const client = data.web ?? data.installed;
      if (!client?.client_id || !client?.client_secret) throw new Error('That file has no client ID and secret. Use the JSON from Google’s “OAuth client created” box.');
      onChange((await api.saveFields(c.id, { GOOGLE_CLIENT_ID: client.client_id, GOOGLE_CLIENT_SECRET: client.client_secret })).connectors);
      setMessage('Loaded from file.');
    } catch (error) { setMessage(error instanceof SyntaxError ? 'That file is not JSON.' : (error as Error).message); }
    finally { setBusy(false); }
  }
  // Public feeds with no account: one switch.
  async function toggle(on: boolean) {
    setBusy(true); setMessage('');
    try { onChange(on ? (await api.saveFields(c.id, { [c.fields[0].key]: '1' })).connectors : (await api.disconnect(c.id)).connectors); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function removeAccount(key: string, account?: string) {
    if (!confirm(`Remove ${account ?? 'this account'} from Taurus? It forgets that account’s token; the others stay.`)) return;
    setBusy(true);
    try { onChange((await api.disconnect(c.id, key)).connectors); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(allow ? `Stop Taurus acting in ${c.name}? It forgets that permission; reading is not affected.` : `Disconnect ${c.name}? Taurus forgets its token. You can reconnect any time.`)) return;
    setBusy(true);
    try { onChange((await api.disconnect(c.id)).connectors); } finally { setBusy(false); }
  }

  const name = short(c);
  // In the desktop app the company's sign-in page opens in your default browser, where you're already signed in; it
  // ends on a page you can close, and this window catches up when you come back to it.
  const desktop = inDesktop();
  const signIn = c.auth === 'oauth' && (onThisMac()
    ? <a className={`button ${c.ready ? 'primary' : 'disabled'}`} aria-disabled={!c.ready} href={c.ready ? `/api/oauth/start/${c.id}${desktop ? '?outside' : ''}` : undefined} target={desktop ? '_blank' : undefined} rel={desktop ? 'noreferrer' : undefined}>{allow ? (c.connected ? 'Allow again' : `Allow ${name}`) : c.connected ? 'Sign in again' : `Sign in with ${name}`}</a>
    : <span className="muted">Then tap Sign in with {name} on your Mac. {name} sends you back to the Mac’s own address, so that last step can’t finish on a phone.</span>);
  const fieldForm = (fields: ConnectorInfo['fields'], withSignIn: boolean) => <form onSubmit={save} className="fields">
    {fields.map(f => <label key={f.key}>
      <span>{f.label}{f.set && <span className="muted"> · saved</span>}</span>
      <input type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={f.set ? (f.secret ? 'Saved. Type to replace.' : f.value) : f.placeholder ?? ''} value={values[f.key] ?? ''} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />
    </label>)}
    <div className="actions">
      {fields.length > 0 && <button type="submit" disabled={!dirty || busy}>Save</button>}
      {withSignIn && signIn}
      {withSignIn && (c.connected || c.fields.some(f => f.set)) && <button type="button" className="text-button" onClick={remove} disabled={busy}>{allow ? 'Take away' : 'Disconnect'}</button>}
      {message && <span role="status" className="muted">{message}</span>}
    </div>
  </form>;
  const ownKeys = <>
    <p className="muted">{c.setup} <a href={c.setupUrl} target="_blank" rel="noreferrer">Open setup page</a></p>
    {c.redirectUri && <p className="muted">Redirect URL to register: <code>{c.redirectUri}</code></p>}
    {c.fields.some(f => f.key === 'GOOGLE_CLIENT_ID') && <label className="file-load">
      <span>Load the JSON file Google gave you</span>
      <input type="file" accept="application/json,.json" disabled={busy} onChange={e => { void loadGoogleFile(e.target.files?.[0]); e.target.value = ''; }} />
    </label>}
    {c.fields.length > 0 && fieldForm(c.auth === 'oauth' && !allow ? c.fields.filter(f => f.appKey) : c.fields, !(c.auth === 'oauth' && !allow))}
  </>;

  return <>
    {c.mockOnly && <p className="muted">{allow ? 'Built from the provider’s documentation and tested only against sample responses. Not yet tried with a real account.' : `Built from ${name}’s published documentation and tested against sample responses. Not yet tried with a real account.`}</p>}
    {c.lastError && <p className="problem">{c.lastError}</p>}
    {c.id === 'composio' && <ComposioApps connected={c.connected} />}
    {c.auth === 'switch' ? <div className="actions">
      <button type="button" className={c.connected ? '' : 'primary'} onClick={() => toggle(!c.connected)} disabled={busy}>{c.connected ? 'Turn off' : allow ? 'Allow' : 'Turn on'}</button>
      <a href={c.setupUrl} target="_blank" rel="noreferrer">{allow ? 'Setup page' : 'About this source'}</a>
      {message && <span role="status" className="muted">{message}</span>}
    </div> : c.auth === 'oauth' && !allow ? <>
      {/* One button to the company's own sign-in page; keys only if you open the links under it (November 19, 2026). */}
      {fieldForm(c.fields.filter(f => !f.appKey && !f.instead), true)}
      {/* More than one account (November 20, 2026: "i have multipe emails"): each one signed in, and another. */}
      {c.connected && (c.accounts?.length ?? 0) > 0 && <div className="accounts">
        <h3>{(c.accounts?.length ?? 0) > 1 ? `${c.accounts!.length} accounts, all read together` : 'Signed in as'}</h3>
        <ul>{c.accounts!.map(a => <li key={a.key}>
          <span>{a.account ?? (a.primary ? 'Your first account' : a.key)}</span>
          {(c.accounts?.length ?? 0) > 1 && <button type="button" className="text-button" disabled={busy} onClick={() => void removeAccount(a.key, a.account)}>Remove</button>}
        </li>)}</ul>
        {onThisMac() && <a className="button" href={`/api/oauth/start/${c.id}?add${desktop ? '&outside' : ''}`} target={desktop ? '_blank' : undefined} rel={desktop ? 'noreferrer' : undefined}>Add another {name} account</a>}
      </div>}
      {c.oneClick && /^(gmail|google-)/.test(c.id) && <p className="muted">Google lets an address in only once it’s a test user of Taurus’s sign-in app, while that app is in Testing. If Google says access is blocked, add that address under Test users in Google Cloud (project oxbot-513223, Google Auth Platform, Audience), then sign in again.</p>}
      {!c.ready && !c.connected && <p className="muted">Signing in with {name} isn’t ready yet.{c.fields.some(f => f.instead) ? ' You can use a personal key for now.' : ''}</p>}
      {c.fields.some(f => f.instead) && <details className="own-keys" open={c.fields.some(f => f.instead && f.set)}>
        <summary>Use a personal key instead</summary>
        {fieldForm(c.fields.filter(f => f.instead), false)}
      </details>}
      <details className="own-keys">
        <summary>Use your own developer app</summary>
        {ownKeys}
      </details>
    </> : ownKeys}
  </>;
}

// A row that opens in place: the Actions and AI pages list connectors this way.
export function Connector({ c, onChange, allow = false }: { c: ConnectorInfo; onChange: (list: ConnectorInfo[]) => void; allow?: boolean }) {
  return <details className="connector">
    <summary>
      <span className="connector-name">{c.name}</span>
      <span className={`connector-status ${c.connected ? 'on' : ''} ${c.lastError ? 'bad' : ''}`}>{status(c, allow)}</span>
    </summary>
    <div className="connector-body">
      <p>{c.reads}</p>
      <ConnectorBody c={c} onChange={onChange} allow={allow} />
    </div>
  </details>;
}

function Sheet({ label, onClose, head, children, wide = false }: { label: string; onClose: () => void; head: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return <dialog ref={ref} className={`sheet app-sheet${wide ? ' wide' : ''}`} aria-label={label} onClose={onClose} onClick={e => { if (e.target === ref.current) ref.current.close(); }}>
    <div className="sheet-head">{head}<button className="text-button" onClick={() => ref.current?.close()}>Done</button></div>
    <div className="sheet-body">{children}</div>
  </dialog>;
}

// The phone's way in: a QR code holding this Mac's Wi-Fi address and the pairing key, opening straight to one app.
function PhoneLink({ target, name }: { target: string; name?: string }) {
  const [info, setInfo] = useState<PhoneInfo | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.phone().then(setInfo).catch(e => setError((e as Error).message)); }, []);
  if (error) return <p className="problem">{error}</p>;
  if (!info) return <p className="muted">Getting this Mac’s Wi-Fi address…</p>;
  if (!info.pairing.length) return <div className="phone-off">
    <p>Your phone can’t reach Taurus yet: it’s only listening on this Mac.</p>
    <p className="muted">{info.lanReady ? 'Open this page on the Mac itself to see the code.' : <>Turn on “Let my phone connect” in Taurus’s menu bar item, or start it with <code>TAURUS_HOST=0.0.0.0 pnpm start</code>. The steps are on <a href="#phone">Phone</a>.</>}</p>
  </div>;
  const url = `${info.pairing[0]}#connections${target ? `/${target}` : ''}`;
  return <div className="phone-link">
    <Qr value={url} label={`QR code that opens ${name ?? 'Connections'} in Taurus on your phone`} />
    <div>
      <p><strong>Point your phone’s camera at the code.</strong></p>
      <p className="muted">It opens {name ?? 'Connections'} in Taurus on your phone, on the same Wi-Fi, and pairs the phone so nobody else on the network can. Anything you save there lands on this Mac.</p>
      <p className="muted">Easiest for keys: open the app’s key page on your phone, where you’re already signed in, copy the key, and paste it into Taurus right there.</p>
    </div>
  </div>;
}

// One app, like an AI app's connector directory: the mark, what it reads, and the ways to connect it.
export function AppSheet({ c, onChange, onClose }: { c: ConnectorInfo; onChange: (list: ConnectorInfo[]) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'mac' | 'phone'>('mac');
  const [arrived, setArrived] = useState(false);
  const was = useRef(c.connected);
  const phoneUseful = onThisMac() && c.auth !== 'switch' && !(c.auth === 'oauth' && c.oneClick);
  // While the code is up, watch for the phone finishing the job.
  useEffect(() => {
    if (tab !== 'phone') return;
    const timer = setInterval(() => void api.connectors().then(r => onChange(r.connectors)).catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, [tab, onChange]);
  useEffect(() => {
    if (c.connected && !was.current && tab === 'phone') setArrived(true);
    was.current = c.connected;
  }, [c.connected, tab]);

  return <Sheet label={c.name} onClose={onClose} head={<div className="app-sheet-title">
    <AppLogo id={c.id} name={c.name} size={52} />
    <div><h2>{c.name}</h2><span className={`connector-status ${c.connected ? 'on' : ''} ${c.lastError ? 'bad' : ''}`}>{status(c, false)}</span></div>
  </div>}>
    <p className="app-reads">{c.reads}</p>
    <p className="muted">Reading only. Keys stay on this Mac and go only to {short(c)}. To let Taurus act here, see <a href="#actions">Actions</a>.</p>
    {phoneUseful && <div className="seg" role="tablist" aria-label="Where to connect">
      <button type="button" role="tab" aria-selected={tab === 'mac'} onClick={() => setTab('mac')}>On this Mac</button>
      <button type="button" role="tab" aria-selected={tab === 'phone'} onClick={() => setTab('phone')}>With your phone</button>
    </div>}
    {arrived && <p role="status" className="arrived">{short(c)} connected from your phone.</p>}
    <div className="connector-body sheet-connector">
      {tab === 'mac' ? <ConnectorBody c={c} onChange={onChange} /> : <PhoneLink target={c.id} name={short(c)} />}
    </div>
  </Sheet>;
}

// Find the apps you already use from a password-manager export (owner, November 2, 2026). Only the website column is
// read, in this window; only the matching app ids are kept, in this browser.
type Found = { ids: string[]; composio: [string, string][]; sites: number; at: string };
const readFound = (): Found | null => { try { return JSON.parse(localStorage.getItem('taurus-found') ?? 'null'); } catch { return null; } };

export type { Found };
export function FindAccounts({ list, onFound, onOpen, onClose }: { list: ConnectorInfo[]; onFound: (f: Found | null) => void; onOpen: (id: string) => void; onClose: () => void }) {
  const [found, setFound] = useState<Found | null>(readFound);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);

  async function load(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const hosts = websitesIn(await file.text());
      const known = new Set(list.map(c => c.id));
      const ids = new Set<string>();
      const loose = new Set<string>();
      for (const host of hosts) {
        const direct = connectorsFor(host).filter(id => known.has(id));
        if (direct.length) direct.forEach(id => ids.add(id)); else loose.add(siteName(host));
      }
      // Sites Taurus has no reader for may still be in Composio's catalog.
      const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const catalog = await api.composio().then(r => r.catalog).catch(() => [] as [string, string][]);
      const composio = catalog.filter(([name, slug]) => loose.has(plain(slug)) || loose.has(plain(name)));
      const next = { ids: [...ids], composio, sites: hosts.size, at: new Date().toISOString() };
      try { localStorage.setItem('taurus-found', JSON.stringify(next)); } catch { /* storage blocked: results last this visit */ }
      setFound(next); onFound(next); setFresh(true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function forget() {
    try { localStorage.removeItem('taurus-found'); } catch { /* nothing kept */ }
    setFound(null); onFound(null); setFresh(false);
  }
  const apps = found ? list.filter(c => found.ids.includes(c.id)).sort((a, b) => Number(a.connected) - Number(b.connected)) : [];
  const done = apps.filter(c => c.connected).length;
  const chooser = (label: string, big = false) => <label className={`file-load${big ? ' big' : ''}`}>
    <span>{busy ? 'Reading…' : label}</span>
    <input type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
  </label>;

  return <Sheet label="Find the apps you already use" wide onClose={onClose} head={<h2>Find the apps you already use</h2>}>
    {!found ? <>
      <p>Taurus can look through the sites in your saved passwords and show which of them it can connect.</p>
      <ol className="steps">
        <li>In <a href="https://passwords.google.com/options" target="_blank" rel="noreferrer">Google Password Manager settings</a>, choose Export passwords. Chrome, Safari, 1Password, Bitwarden, LastPass and Firefox exports work too.</li>
        <li>Choose that file here.</li>
      </ol>
      {chooser('Choose the exported CSV file', true)}
      <p className="muted">The file is read in this window and nowhere else. Taurus keeps only the website column; it never reads, saves or sends a password, and never signs in with one. Each app still connects through its own sign-in or key.</p>
    </> : <>
      <p className="found-line">You have accounts at {found.sites} sites. {apps.length ? `${apps.length} connect to Taurus directly${done ? `, ${done} already connected` : ''}.` : 'None of them connect to Taurus directly yet.'}{found.composio.length ? ` ${found.composio.length} more are in Composio.` : ''}</p>
      {fresh && <p className="problem">Delete the exported file now. It holds every password in plain text.</p>}
      {apps.length > 0 && <div className="app-grid compact">{apps.map(c => <Tile key={c.id} c={c} onOpen={onOpen} />)}</div>}
      {found.composio.length > 0 && <>
        <h3>Through Composio</h3>
        <p className="muted">Connect these in your Composio project and Taurus lists them: {found.composio.map(([name]) => name).join(', ')}. <button type="button" className="text-button" onClick={() => onOpen('composio')}>Set up Composio</button></p>
      </>}
      <div className="actions">
        {chooser('Use a newer export')}
        <button type="button" className="text-button" onClick={forget}>Forget these results</button>
      </div>
    </>}
    {error && <p className="problem">{error}</p>}
  </Sheet>;
}

function Tile({ c, onOpen, suggested = false }: { c: ConnectorInfo; onOpen: (id: string) => void; suggested?: boolean }) {
  const state = c.lastError ? 'Needs attention' : c.connected ? 'Connected' : suggested ? `You use this · ${how(c)}` : how(c);
  return <button type="button" className={`app-tile${c.connected ? ' on' : ''}`} onClick={() => onOpen(c.id)}>
    <AppLogo id={c.id} name={c.name} />
    <span className="app-tile-text">
      <span className="app-name">{c.name}</span>
      <span className="app-blurb">{blurb(c)}</span>
      <span className={`app-state${c.connected ? ' on' : ''}${c.lastError ? ' bad' : ''}`}>{state}</span>
    </span>
  </button>;
}

type Filter = 'all' | 'connected' | 'suggested' | 'attention' | Group;
const openId = () => location.hash.match(/^#connections\/([a-z-]+)$/)?.[1] ?? null;

export function Connections() {
  const [list, setList] = useState<ConnectorInfo[] | null>(null);
  const [home, setHome] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpenState] = useState<string | null>(openId);
  const [sheet, setSheet] = useState<'find' | 'phone' | null>(null);
  const [found, setFound] = useState<Found | null>(readFound);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => api.connectors().then(r => { setList(r.connectors); setHome(r.home); }).catch(e => setError(e.message));
    void load();
    // Sign-in finishes in another tab (or the browser, from the desktop app): show it when you come back.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);
  // "/" jumps to search.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || document.querySelector('dialog[open]')) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault(); search.current?.focus();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  // The open app lives in the address, so a QR code or a link opens it directly.
  useEffect(() => {
    const follow = () => setOpenState(openId());
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  const setOpen = (id: string | null) => { setOpenState(id); history.replaceState(null, '', id ? `#connections/${id}` : '#connections'); };

  const connected = list?.filter(c => c.connected) ?? [];
  const attention = list?.filter(c => c.lastError) ?? [];
  const suggested = list?.filter(c => found?.ids.includes(c.id) && !c.connected) ?? [];
  const current = list?.find(c => c.id === open);
  const tabs: [Filter, string, number?][] = [
    ['all', 'All', list?.length], ['connected', 'Connected', connected.length],
    ...(found ? [['suggested', 'You use these', suggested.length] as [Filter, string, number]] : []),
    ...(attention.length ? [['attention', 'Needs attention', attention.length] as [Filter, string, number]] : []),
    ...groups.filter(([g]) => list?.some(c => c.group === g)).map(([g, label]) => [g, filterNames[g] ?? label] as [Filter, string]),
  ];
  const pick = (c: ConnectorInfo) => filter === 'all' || (filter === 'connected' ? c.connected : filter === 'suggested' ? suggested.includes(c) : filter === 'attention' ? Boolean(c.lastError) : c.group === filter);
  const shown = list?.filter(c => pick(c) && matches(c, query)) ?? [];
  const grouped = filter === 'all' && !query;
  const tile = (c: ConnectorInfo) => <Tile key={c.id} c={c} onOpen={setOpen} suggested={found?.ids.includes(c.id)} />;

  return <main id="main" tabIndex={-1} className="connections directory">
    <div className="page-head">
      <div className="page-title"><h1>Connections</h1>{list && <span className="muted">{connected.length} of {list.length} connected</span>}</div>
      <div className="head-actions">
        {onThisMac() && <button type="button" onClick={() => setSheet('phone')}>Set up on phone</button>}
        <button type="button" className="primary" onClick={() => setSheet('find')}>Find my apps</button>
      </div>
    </div>
    <p className="lede">Taurus runs on this Mac. Keys and sign-ins are stored in {home ? <code>{home}</code> : 'a private folder'}, readable only by you, and are sent only to the service they belong to. Everything here only reads. To let Taurus send, reply, call or act in your apps, see <a href="#actions">Actions</a>.</p>
    {error && <p className="problem">{error}</p>}

    {list && suggested.length > 0 && grouped && <section aria-labelledby="g-suggested">
      <div className="section-row"><h2 id="g-suggested">You already use these</h2><button type="button" className="text-button" onClick={() => setFilter('suggested')}>See all {suggested.length}</button></div>
      <div className="app-grid">{suggested.slice(0, 6).map(tile)}</div>
    </section>}

    {list && <div className="directory-tools">
      <label className="find">
        <span className="sr-only">Find a connection</span>
        <input ref={search} type="search" placeholder={`Search ${list.length} apps: Notion, Spotify, weather…`} value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      <div className="app-filters" role="toolbar" aria-label="Show">
        {tabs.map(([key, label, count]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}{count !== undefined && <span className="n"> {count}</span>}</button>)}
      </div>
    </div>}

    {list && shown.length === 0 && <p className="muted empty-find">{query ? `Nothing matches “${query}”.` : filter === 'connected' ? 'Nothing connected yet. Pick an app under All, or let Find my apps suggest the ones you use.' : 'Nothing here.'}</p>}
    {list && (grouped ? groups.map(([group, label]) => {
      const inGroup = shown.filter(c => c.group === group);
      return inGroup.length > 0 && <section key={group} aria-labelledby={`g-${group}`}>
        <h2 id={`g-${group}`}>{label}</h2>
        <div className="app-grid">{inGroup.map(tile)}</div>
      </section>;
    }) : shown.length > 0 && <section aria-label="Results"><div className="app-grid">{shown.map(tile)}</div></section>)}

    {current && <AppSheet key={current.id} c={current} onChange={setList} onClose={() => setOpen(null)} />}
    {sheet === 'find' && list && <FindAccounts list={list} onFound={setFound} onOpen={id => { setSheet(null); setOpen(id); }} onClose={() => setSheet(null)} />}
    {sheet === 'phone' && <Sheet label="Set up on your phone" onClose={() => setSheet(null)} head={<h2>Set up on your phone</h2>}><PhoneLink target="" /></Sheet>}
  </main>;
}
