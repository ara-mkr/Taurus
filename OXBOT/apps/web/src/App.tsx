import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type Dashboard, type History, type Prefs } from './api';
import { Actions } from './components/Actions';
import { ApprovalTray } from './components/Approval';
import { Ask, type ChatTurn } from './components/Ask';
import { Scans } from './components/Scans';
import { BoardView } from './components/Board';
import { AI } from './components/AI';
import { ChatBar, type Extras } from './components/ChatBar';
import { Connections } from './components/Connections';
import { Dock, useActivity, useBrowser, type DockTab } from './components/Live';
import { Onboarding, wasOnboarded } from './components/Onboarding';
import { cardLine, oxLines, OxBuddy } from './components/Ox';
import { OxWindows, useOxWindows } from './components/OxWindows';
import { Swarm } from './components/Swarm';
import { Phone } from './components/Phone';
import { ProfilePage } from './components/Profile';
import { Schedule, Skills } from './components/Skills';
import { House } from './components/House';
import { BrainPage } from './components/Brain';
import { ProFinderPage } from './components/ProFinder';
import { CloudDashboard, customizeTaurus, Sky, taurusDefaults, useParted } from './components/CloudDashboard';
import { pickCenter, useTick, type Asked } from './components/OxWidget';
import { armAlarm, RingScreen, Standby, Unreachable, useRing } from './components/Ringing';
import { Look, settingsPages, SettingsNav, Tabs, type Appearance } from './components/Settings';
import { Backdrop, daypart, dayLine, nowDoing, PeopleStrip, Rail, TopBar } from './components/Shell';
import { readVoice, saveVoice, useVoice, type VoiceSettings } from './components/Voice';
import { unlockAudio } from './speech';

// Routes: #b/<board id>, #ask, the settings pages, and #ring for a phone on standby.
type Page = { kind: 'board'; id?: string } | { kind: 'ask' | 'ring' | 'house' | 'profile' | 'brain' | 'profinder' } | { kind: 'taurus'; implicit?: boolean } | { kind: 'settings'; page: keyof typeof settingsPages };
function readPage(): Page {
  const hash = location.hash.slice(1);
  if (hash.startsWith('b/')) return { kind: 'board', id: decodeURIComponent(hash.slice(2)) };
  if (hash === 'ask' || hash === 'ring' || hash === 'house' || hash === 'profile' || hash === 'profinder') return { kind: hash };
  // The Brain (November 16, 2026): #brain, or #brain/<note> to open one note.
  if (hash === 'brain' || hash.startsWith('brain/')) return { kind: 'brain' };
  // Taurus (November 5, 2026) is where OXBOT opens, unless you picked the board instead.
  if (hash === 'taurus' || hash === 'sky') return { kind: 'taurus' };
  // The last choice is remembered on this device too, so the right page shows before preferences arrive.
  if (hash === '') { try { if (localStorage.getItem('oxbot-start') === 'board') return { kind: 'board' }; } catch { /* storage blocked */ } return { kind: 'taurus', implicit: true }; }
  // #connections/<id> opens one app's sheet; a QR code from the Mac lands the phone there.
  if (hash.startsWith('connections/')) return { kind: 'settings', page: 'connections' };
  if (hash in settingsPages) return { kind: 'settings', page: hash as keyof typeof settingsPages };
  return { kind: 'board' };
}

const readAppearance = (): Appearance => { try { const v = localStorage.getItem('oxbot-appearance'); return v === 'light' || v === 'auto' ? v : 'dark'; } catch { return 'dark'; } };

// Prefs from a server older than the profile and background fields get the defaults.
const filled = (p: Prefs): Prefs => ({ ...p, profile: { ...offline.profile, ...p.profile }, background: { ...offline.background, ...p.background }, taurus: p.taurus ?? taurusDefaults() });

// Used only when the server can't be reached, so the page still shows the day.
const offline: Prefs = { tint: 'graphite', ambient: true, ox: true, todos: [], people: [], taurus: taurusDefaults(),
  profile: { name: '', tone: 'witty', greet: true, large: false }, background: { kind: 'field', color: '#14161B', dim: 0, blur: 0, daylight: true }, boards: [{ id: 'home', name: 'Home', widgets: [
  { id: 'brief', type: 'brief', size: 'wide' }, { id: 'focus', type: 'focus', size: 'medium' }, { id: 'needs', type: 'needs', size: 'tall' },
  { id: 'schedule', type: 'schedule', size: 'tall' }, { id: 'health', type: 'health', size: 'medium' }, { id: 'inbox', type: 'inbox', size: 'small' }, { id: 'numbers', type: 'numbers', size: 'wide' },
] }] };

export default function App() {
  const [opened, setPage] = useState<Page>(readPage);
  // First launch (owner, November 17, 2026): Ox's calm, voice-guided welcome, shown until it's finished once.
  const [showOnboarding, setShowOnboarding] = useState(() => !wasOnboarded());
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [data, setData] = useState<Dashboard | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [prefs, setPrefsState] = useState<Prefs | null>(null);
  const [saveError, setSaveError] = useState('');
  // Opened with no page named: Taurus, unless the owner picked the board as where OXBOT starts.
  const startOn = prefs?.taurus?.start;
  useEffect(() => { if (startOn) try { localStorage.setItem('oxbot-start', startOn); } catch { /* storage blocked: the server's choice still applies */ } }, [startOn]);
  const page = useMemo<Page>(() => opened.kind === 'taurus' && opened.implicit && startOn === 'board' ? { kind: 'board' } : opened, [opened, startOn]);
  // Where you live: Taurus or the board, whichever you were on last. Settings, Ask and House keep its background, so
  // opening Settings from Taurus no longer swaps the sky for the board's tinted light (November 5, 2026 audit).
  const [homeView, setHomeView] = useState<'taurus' | 'board'>(() => readPage().kind === 'board' ? 'board' : 'taurus');
  if ((page.kind === 'taurus' || page.kind === 'board') && page.kind !== homeView) setHomeView(page.kind);
  const [error, setError] = useState('');
  // True when the server didn't answer at all, as opposed to answering with an error.
  const [unreachable, setUnreachable] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [askError, setAskError] = useState('');
  const [provider, setProvider] = useState('');
  const { ring, listening, clear, proposals, waiting, update } = useRing();
  const dirty = useRef(false);
  const prefsLoaded = useRef(false);
  const turnsRef = useRef(turns);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  const [voiceSettings, setVoiceState] = useState<VoiceSettings>(readVoice);
  const setVoiceSettings = useCallback((v: VoiceSettings) => { setVoiceState(v); saveVoice(v); }, []);
  const [tabsOpen, setTabsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // The panel reopens where you left it on a big screen; on a phone it would cover everything, so it starts closed.
  const [dock, setDockState] = useState<DockTab | null>(() => { if (innerWidth <= 700) return null; try { const v = localStorage.getItem('oxbot-dock'); return v === 'browser' || v === 'activity' ? v : null; } catch { return null; } });
  const setDock = useCallback((t: DockTab | null) => { setDockState(t); try { if (t) localStorage.setItem('oxbot-dock', t); else localStorage.removeItem('oxbot-dock'); } catch { /* storage blocked: the panel stays for this visit */ } }, []);
  const activity = useActivity();
  const browser = useBrowser();
  // Ox windows (November 4, 2026): what Ox just did, popped up on the board.
  const windows = useOxWindows();
  // What you last asked, typed or out loud, so Ox's disc on Taurus can turn into the weather or your recovery.
  const [asked, setAsked] = useState<Asked | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const onTaurus = page.kind === 'taurus';
  const tick = useTick(5000, onTaurus);
  const center = onTaurus ? pickCenter(windows.wins, asked, data, tick, dismissed) : null;
  const { drop } = windows;
  const closeWin = useCallback((id: string) => { drop(id); api.closeWindow(id).catch(() => undefined); }, [drop]);
  const music = useCallback((what: string) => { api.musicControl(what).catch(() => undefined); }, []);
  // When Ox starts browsing, the Browser opens so you watch him do it.
  const shownBrowse = useRef(0);
  useEffect(() => {
    const last = activity.at(-1);
    if (last && last.kind === 'browser' && last.by === 'ox' && last.state === 'running' && last.id > shownBrowse.current) { shownBrowse.current = last.id; setDock('browser'); }
  }, [activity, setDock]);

  useEffect(() => {
    const change = () => { setPage(readPage()); setTabsOpen(false); requestAnimationFrame(() => { document.getElementById('main')?.focus({ preventScroll: true }); window.scrollTo(0, 0); document.getElementById('root')?.scrollTo(0, 0); }); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (appearance === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = appearance;
    try { localStorage.setItem('oxbot-appearance', appearance); } catch { /* storage blocked: appearance still applies for this visit */ }
  }, [appearance]);
  useEffect(() => {
    document.documentElement.dataset.tint = prefs?.tint ?? 'graphite';
    document.documentElement.dataset.ambient = String(prefs?.ambient ?? true);
    document.documentElement.dataset.large = String(prefs?.profile?.large ?? false);
  }, [prefs?.tint, prefs?.ambient, prefs?.profile?.large]);
  // The light follows the time of day: warm at dawn and dusk, cool at night.
  const part = prefs?.background?.daylight === false ? '' : daypart(new Date(now).getHours());
  useEffect(() => { if (part) document.documentElement.dataset.daypart = part; else delete document.documentElement.dataset.daypart; }, [part]);
  // On the phone, a swipe in from the left edge opens the tabs; a swipe back closes them.
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => { const t = e.touches[0]; start = innerWidth <= 700 && (t.clientX < 24 || tabsOpen) ? { x: t.clientX, y: t.clientY } : null; };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0], dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
      if (dy < 60 && dx > 60 && !tabsOpen) setTabsOpen(true);
      if (dy < 60 && dx < -60 && tabsOpen) setTabsOpen(false);
      start = null;
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchend', up, { passive: true });
    return () => { window.removeEventListener('touchstart', down); window.removeEventListener('touchend', up); };
  }, [tabsOpen]);
  useEffect(() => { if (!tabsOpen) return; const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setTabsOpen(false); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [tabsOpen]);
  // Browsers only allow sound after a tap, so the first tap anywhere arms the alarm.
  useEffect(() => { const arm = () => { armAlarm(); unlockAudio(); }; window.addEventListener('pointerdown', arm, { once: true }); return () => window.removeEventListener('pointerdown', arm); }, []);

  const load = useCallback((refresh = false) => api.dashboard(refresh)
    .then(d => { setData(d); setError(''); setUnreachable(false); if (!prefsLoaded.current) api.prefs().then(p => { prefsLoaded.current = true; setPrefsState(filled(p)); }).catch(() => undefined); })
    .catch(e => { setError(e.message); setUnreachable(e instanceof ApiError && e.status === 0); }), []);
  useEffect(() => { if (!unreachable) return; const retry = window.setInterval(() => void load(), 10_000); return () => window.clearInterval(retry); }, [unreachable, load]);
  useEffect(() => {
    void load();
    api.prefs().then(p => { prefsLoaded.current = true; setPrefsState(filled(p)); }).catch(() => setPrefsState(offline));
    const loadHistory = () => api.history().then(setHistory).catch(() => undefined);
    void loadHistory();
    const poll = window.setInterval(() => { setNow(Date.now()); void load(); }, 30_000);
    const slow = window.setInterval(loadHistory, 600_000);
    const focus = () => { setNow(Date.now()); void load(); };
    window.addEventListener('focus', focus);
    return () => { window.clearInterval(poll); window.clearInterval(slow); window.removeEventListener('focus', focus); };
  }, [load]);
  useEffect(() => { if (page.kind === 'ask' || (page.kind === 'settings' && page.page === 'phone')) api.phone().then(p => setProvider(p.ai ?? '')).catch(() => undefined); }, [page]);

  // Every change to tabs, widgets, to-dos or people is saved half a second after the last edit.
  const setPrefs = useCallback((update: (p: Prefs) => Prefs) => { dirty.current = true; setPrefsState(p => p && update(p)); }, []);
  useEffect(() => {
    if (!prefs || !dirty.current) return;
    const timer = window.setTimeout(() => { dirty.current = false; api.savePrefs(prefs).then(() => setSaveError('')).catch(e => setSaveError(`Not saved: ${e.message}`)); }, 500);
    return () => window.clearTimeout(timer);
  }, [prefs]);

  const boards = prefs?.boards ?? [];
  const board = page.kind === 'board' ? boards.find(b => b.id === page.id) ?? boards[0] : undefined;
  useEffect(() => {
    const title = page.kind === 'board' ? board?.name ?? 'Home' : page.kind === 'ask' ? 'Ask' : page.kind === 'house' ? 'House' : page.kind === 'profile' ? 'Profile' : page.kind === 'brain' ? 'Brain' : page.kind === 'profinder' ? 'ProFinder' : page.kind === 'taurus' ? 'Taurus' : page.kind === 'settings' ? settingsPages[page.page] : '';
    document.title = title ? `${title} · OXBOT` : 'OXBOT';
  }, [page, board?.name]);

  // A camera frame goes with this one question only; the conversation keeps just a note that it was there.
  // Asked from the chat bar, a person or a card, the answer opens above the chat bar and you stay where you are.
  async function ask(question: string, frame?: string, extras?: Extras) {
    setAsked({ text: question, at: Date.now() });
    // On Taurus, Ox answers in his own place; the chat panel opens everywhere else.
    if (page.kind !== 'ask') setChatOpen(true);
    const next: ChatTurn[] = [...turns, { role: 'user', text: question, looked: Boolean(frame), attached: extras?.names, screen: extras?.screen, preview: extras?.preview }];
    setTurns(next); setPending(true); setAskError('');
    try {
      // Streamed (November 16, 2026): Ox's words show as they are written.
      let live = '';
      const answer = await api.askStream(next, { image: frame ?? extras?.image, files: extras?.files, via: 'ask' }, {
        text: d => { live += d; setTurns([...next, { role: 'assistant', text: live }]); },
        reset: () => { live = ''; setTurns(next); },
      });
      (answer.proposals ?? []).forEach(update);
      setTurns([...next, { role: 'assistant', text: answer.text, proposals: (answer.proposals ?? []).map(p => p.id) }]); if (answer.provider) setProvider(answer.provider);
    }
    catch (e) { setAskError((e as Error).message); }
    finally { setPending(false); }
  }
  // Questions asked out loud join the same conversation as Ask, so "Open in Ask" carries on from there.
  const askAloud = useCallback(async (question: string) => {
    setAsked({ text: question, at: Date.now() });
    const next: ChatTurn[] = [...turnsRef.current, { role: 'user', text: question }];
    turnsRef.current = next; setTurns(next); setAskError('');
    try {
      let live = '';
      const answer = await api.askStream(next, { via: 'talk' }, {
        text: d => { live += d; setTurns([...next, { role: 'assistant', text: live }]); },
        reset: () => { live = ''; setTurns(next); },
      });
      (answer.proposals ?? []).forEach(update);
      const done: ChatTurn[] = [...next, { role: 'assistant', text: answer.text, proposals: (answer.proposals ?? []).map(p => p.id) }];
      turnsRef.current = done; setTurns(done); if (answer.provider) setProvider(answer.provider);
      return answer.text;
    } catch (e) { setAskError((e as Error).message); throw e; }
  }, [update]);
  const voice = useVoice(voiceSettings, askAloud);
  const parted = useParted(voice);

  async function reset() {
    if (!prefs) return;
    try { const fresh = await api.savePrefs({ ...prefs, boards: undefined } as unknown as Prefs); setPrefsState(filled(fresh)); location.hash = `b/${fresh.boards[0].id}`; }
    catch (e) { setSaveError((e as Error).message); }
  }

  // The Taurus switch: home becomes Taurus or the board, and OXBOT remembers which (owner, November 6, 2026).
  const taurusOn = homeView === 'taurus';
  const toggleTaurus = () => {
    const next = taurusOn ? 'board' : 'taurus';
    setPrefs(p => ({ ...p, taurus: { ...(p.taurus ?? taurusDefaults()), start: next } }));
    try { localStorage.setItem('oxbot-start', next); } catch { /* storage blocked: the server copy still saves */ }
    setHomeView(next);
    location.hash = next === 'taurus' ? 'taurus' : `b/${boards[0]?.id ?? 'home'}`;
  };
  const setLanguage = (code: string) => setPrefs(p => ({ ...p, profile: { ...p.profile, language: code === 'en' ? undefined : code } }));
  useEffect(() => { document.documentElement.lang = prefs?.profile?.language ?? 'en'; }, [prefs?.profile?.language]);
  const ctx = { data, history, prefs: prefs ?? offline, setPrefs, now, onAsk: ask };
  const lineFor = (id: string) => { const w = board?.widgets.find(x => x.id === id); return w && prefs ? cardLine(w, data, prefs, now) : null; };
  // On Taurus, Ox lives in the middle of the page, so the roaming one stays away.
  const showOx = page.kind !== 'taurus' && ((page.kind === 'board' && board && prefs && prefs.ox !== false) || voice.view.phase !== 'idle');
  const background = (prefs ?? offline).background ?? offline.background;
  const tint = prefs?.tint ?? 'graphite';
  if (unreachable && page.kind !== 'ring') return <>
    <Backdrop background={background} tint={tint} />
    <Unreachable onRetry={() => load()} />
    {ring && <RingScreen ring={ring} onDone={clear} waiting={waiting} onUpdate={update} />}
  </>;
  // Cards already shown in the Ask conversation don't repeat in the tray.
  // The ProFinder page shows its own batch card, so the tray leaves it out there.
  const inline = [...(page.kind === 'ask' || chatOpen ? turns.flatMap(t => t.proposals ?? []) : []), ...(page.kind === 'profinder' ? waiting.filter(p => p.kind === 'profinder.batch').map(p => p.id) : [])];
  const shownPrefs = prefs ?? offline;
  const profile = shownPrefs.profile ?? offline.profile;
  if (page.kind === 'ring') return <>
    <Standby data={data} listening={listening} now={now} waiting={waiting} onUpdate={update} />
    {ring && <RingScreen ring={ring} onDone={clear} waiting={waiting} onUpdate={update} />}
  </>;
  return <>
    {page.kind === 'taurus' || (page.kind !== 'board' && homeView === 'taurus') ? <Sky parted={parted} clouds={shownPrefs.taurus.clouds} /> : <Backdrop background={background} tint={tint} />}
    <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
    <div className={`shell ${dock ? 'with-dock' : ''} ${tabsOpen ? 'tabs-open' : ''}`}>
      <Rail boards={boards} current={page.kind === 'board' ? board?.id : undefined} page={page.kind === 'settings' ? 'settings' : page.kind} dock={dock} setDock={setDock} open={tabsOpen} onClose={() => setTabsOpen(false)}
        home={homeView === 'taurus' ? '#taurus' : boards[0] ? `#b/${boards[0].id}` : '#b/home'} onCustomize={customizeTaurus}
        taurusOn={taurusOn} onTaurus={toggleTaurus} brand={profile}
        doing={nowDoing({ entries: activity, browser, wins: windows.wins, now, setDock, music })} />
      <div className="stage">
        <TopBar profile={profile} now={now} line={dayLine(data, now)} onTabs={() => setTabsOpen(o => !o)} tabsOpen={tabsOpen} onLanguage={setLanguage} />
        {(error || saveError) && <p className="banner-problem" role="status">{[error, saveError].filter(Boolean).join(' ')}</p>}
        {page.kind === 'board' && board && board.id === boards[0]?.id && <PeopleStrip data={data} prefs={shownPrefs} now={now} onAsk={ask} />}
        {page.kind === 'board' && (board ? <BoardView key={board.id} board={board} ctx={ctx} /> : <main id="main" tabIndex={-1} className="board"><p className="board-note">Loading.</p></main>)}
        {page.kind === 'house' && <House onProposal={update} />}
        {page.kind === 'brain' && <BrainPage onAsk={ask} />}
        {page.kind === 'profinder' && <ProFinderPage waiting={Object.values(proposals)} onUpdate={update} />}
        {page.kind === 'profile' && prefs && <ProfilePage prefs={prefs} setPrefs={setPrefs} />}
        {page.kind === 'taurus' && <CloudDashboard ctx={ctx} voice={voice} profile={profile} center={center} closeWin={closeWin} onLanguage={setLanguage}
          onBack={key => setDismissed(d => new Set(d).add(key))} />}
        {page.kind === 'ask' && <Ask turns={turns} pending={pending} error={askError} provider={provider} proposals={proposals} onUpdate={update} onAsk={ask} onClear={() => { setTurns([]); setAskError(''); }} />}
        {page.kind === 'settings' && <>
          <SettingsNav page={page.page} />
          {page.page === 'settings' && prefs && <Tabs prefs={prefs} setPrefs={setPrefs} onReset={reset} />}
          {page.page === 'look' && prefs && <Look prefs={prefs} setPrefs={setPrefs} appearance={appearance} setAppearance={setAppearance} voice={voiceSettings} setVoice={setVoiceSettings} />}
          {page.page === 'connections' && <Connections />}
          {page.page === 'ai' && <AI />}
          {page.page === 'skills' && <Skills />}
          {page.page === 'schedule' && <Schedule />}
          {page.page === 'scans' && <Scans />}
          {page.page === 'phone' && <Phone />}
          {page.page === 'actions' && <Actions onChange={update} />}
        </>}
      </div>
      {dock && <Dock tab={dock} setTab={setDock} onClose={() => setDock(null)} entries={activity} browser={browser} />}
    </div>
    <ChatBar turns={turns} pending={pending} error={askError} proposals={proposals} onUpdate={update} onAsk={ask} onClear={() => { setTurns([]); setAskError(''); }}
      voice={voice} open={chatOpen} setOpen={setChatOpen} onAskPage={page.kind === 'ask'} />
    {!ring && <ApprovalTray waiting={waiting} hide={inline} onChange={update} />}
    {!ring && <OxWindows {...windows} hide={center && 'win' in center ? center.win : undefined} />}
    {!ring && <Swarm />}
    {showOx && <OxBuddy lines={oxLines(data, shownPrefs, now)} lineFor={lineFor} voice={voice.view} roam={page.kind === 'board' && prefs?.ox !== false} />}
    {ring && <RingScreen ring={ring} onDone={clear} waiting={waiting} onUpdate={update} />}
    {showOnboarding && prefs && <Onboarding prefs={prefs} setPrefs={setPrefs} onDone={() => { setShowOnboarding(false); location.hash = 'taurus'; }} />}
  </>;
}
