import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type WheelEvent } from 'react';
import { api, type Activity, type BrowserState } from '../api';
import { Ox } from './Ox';

// What Ox is doing, live (owner, November 1, 2026): the Activity terminal, OXBOT's own browser, and the one line in
// rail's quick access to what he is on right now. Both stream from the local server.

export function useActivity() {
  const [entries, setEntries] = useState<Activity[]>([]);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/activity/stream');
    source.addEventListener('hello', e => { try { setEntries(JSON.parse((e as MessageEvent).data)); } catch { /* malformed snapshot: wait for the next line */ } });
    source.onmessage = e => {
      try {
        const entry = JSON.parse(e.data) as Activity;
        setEntries(list => { const at = list.findIndex(x => x.id === entry.id); if (at >= 0) { const next = [...list]; next[at] = entry; return next; } return [...list.slice(-299), entry]; });
      } catch { /* skip a malformed line */ }
    };
    return () => source.close();
  }, []);
  return entries;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const kinds: Record<Activity['kind'], string> = { read: 'read', ai: 'think', tool: 'tool', browser: 'web', action: 'act', ring: 'ring', feed: 'watch', voice: 'voice', home: 'home', mac: 'mac' };
const took = (ms?: number) => ms === undefined ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

export function ActivityLog({ entries }: { entries: Activity[] }) {
  const box = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  useEffect(() => { const el = box.current; if (el && follow.current) el.scrollTop = el.scrollHeight; }, [entries]);
  return <div className="terminal">
    {entries.length === 0 ? <p className="terminal-empty">Nothing yet. Every time Ox reads an app, thinks, browses or acts, a line appears here.</p>
      : <ol ref={box} className="terminal-lines" aria-label="Activity" onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {entries.map(e => <li key={e.id} className={`line ${e.state}`}>
          <time dateTime={e.at}>{time(e.at)}</time>
          <span className="line-kind">{kinds[e.kind]}</span>
          <span className="line-text">{e.text}{e.state === 'running' && <span className="cursor" aria-hidden="true" />}{e.ms !== undefined && <span className="line-ms"> {took(e.ms)}</span>}
            {e.state === 'failed' && <span className="sr-only"> failed</span>}
            {e.detail && <span className="line-detail">{e.detail}</span>}
          </span>
        </li>)}
      </ol>}
  </div>;
}

// One stream for the whole app: the dock shows the page, the rail says what is open.
export function useBrowser() {
  const [state, setState] = useState<BrowserState | null>(null);
  useEffect(() => {
    if (typeof EventSource === 'undefined') { api.browser().then(setState).catch(() => undefined); return; }
    const source = new EventSource('/api/browser/stream');
    // Steps without a picture keep the last one on screen until the next arrives.
    source.onmessage = e => { try { const next = JSON.parse(e.data) as BrowserState; setState(s => ({ ...next, frame: next.frame ?? (next.open ? s?.frame : undefined) })); } catch { /* skip */ } };
    return () => source.close();
  }, []);
  return state;
}

const printable = (e: KeyboardEvent) => e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
const special = new Set(['Enter', 'Backspace', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp']);

export function BrowserPane({ state }: { state: BrowserState | null }) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const typed = useRef('');
  const typeTimer = useRef(0);
  const wheel = useRef(0);
  const wheelTimer = useRef(0);
  const [lastUrl, setLastUrl] = useState('');
  if (state?.url && state.url !== lastUrl) { setLastUrl(state.url); setAddress(state.url); }

  const step = (s: Parameters<typeof api.drive>[0]) => api.drive(s).then(() => setError('')).catch(e => setError((e as Error).message));
  const go = (e: FormEvent) => { e.preventDefault(); if (address.trim()) void step({ do: 'open', url: address.trim() }); };
  const click = (e: MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    void step({ do: 'click', x: Math.round((e.clientX - r.left) * (state?.width ?? 820) / r.width), y: Math.round((e.clientY - r.top) * (state?.height ?? 1060) / r.height) });
    e.currentTarget.parentElement?.focus();
  };
  const scroll = (e: WheelEvent) => {
    wheel.current += e.deltaY;
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => { const dy = wheel.current; wheel.current = 0; if (dy) void step({ do: 'scroll', dy: Math.round(dy * 1.4) }); }, 120);
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (printable(e)) {
      e.preventDefault();
      typed.current += e.key;
      window.clearTimeout(typeTimer.current);
      typeTimer.current = window.setTimeout(() => { const text = typed.current; typed.current = ''; void step({ do: 'type', text }); }, 150);
    } else if (special.has(e.key)) { e.preventDefault(); void step({ do: 'key', key: e.key }); }
  };

  const open = Boolean(state?.open);
  return <div className="browser">
    <form className="browser-bar" onSubmit={go}>
      <button type="button" className="text-button" disabled={!open} onClick={() => step({ do: 'back' })}>Back</button>
      <button type="button" className="text-button" disabled={!open} onClick={() => step({ do: 'forward' })}>Forward</button>
      <label className="sr-only" htmlFor="browser-address">Address or search</label>
      <input id="browser-address" type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Address, or what to search for" autoComplete="off" spellCheck={false} />
      <button type="submit">Go</button>
    </form>
    <p className="browser-who" aria-live="polite">{!open ? 'Read-only. Forms that would send anything are blocked.' : state?.loading ? `Loading ${state.url}` : state?.by === 'ox' ? `Ox is browsing ${state.title || state.url}` : `You’re driving · ${state?.title || state?.url}`}</p>
    {(error || state?.error) && <p className="problem">{error || state?.error}</p>}
    {open && state?.frame ? <div className="browser-view" tabIndex={0} onKeyDown={keys} onWheel={scroll} aria-label="Page in OXBOT’s browser. Click, scroll and type to use it.">
      <img src={state.frame} alt={state.title ? `Page: ${state.title}` : 'The page Ox has open'} onClick={click} draggable={false} />
      {state.loading && <span className="browser-loading" />}
    </div> : <div className="browser-empty">
      <Ox size={64} mood="idle" />
      <p>When Ox looks something up on the web, the page opens here and you watch every step. You can open one yourself too.</p>
    </div>}
    {open && <div className="browser-foot"><span className="muted">Read-only: it can’t sign in, send forms, post or buy.</span><button type="button" className="text-button" onClick={() => step({ do: 'close' })}>Close page</button></div>}
  </div>;
}

export type DockTab = 'browser' | 'activity';

export function Dock({ tab, setTab, onClose, entries, browser }: { tab: DockTab; setTab: (t: DockTab) => void; onClose: () => void; entries: Activity[]; browser: BrowserState | null }) {
  return <aside className="dock" aria-label="Ox at work">
    <div className="dock-head">
      <div className="dock-tabs" role="tablist" aria-label="Ox at work">
        {(['browser', 'activity'] as DockTab[]).map(t => <button key={t} type="button" role="tab" id={`dock-${t}`} aria-selected={tab === t} aria-controls="dock-panel" className="text-button" onClick={() => setTab(t)}>{t === 'browser' ? 'Browser' : 'Activity'}</button>)}
      </div>
      <button type="button" className="text-button" onClick={onClose}>Close</button>
    </div>
    <div id="dock-panel" role="tabpanel" aria-labelledby={`dock-${tab}`} className="dock-body">
      {tab === 'browser' ? <BrowserPane state={browser} /> : <ActivityLog entries={entries} />}
    </div>
  </aside>;
}
