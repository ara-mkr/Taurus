import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Bundle, type ConnectorInfo, type Prefs, type Profile } from '../api';
import { say, stopSpeaking, unlockAudio, useSpeaking } from '../speech';
import { Ox, type Mood } from './Ox';
import { AppSheet, Connector, FindAccounts, type Found } from './Connections';
import '../styles/onboarding.css';

// Onboarding (owner, November 17, 2026): "right as u download it very simple ox shows up gives u a voice guided every
// soothing and calm tutorial of how everything works." Ox meets you, you set a simple profile, you connect the apps you
// already use, Ox works out where your schedule lives, and then he walks you through the app in his own voice.
//
// What this never does: it never reads, decrypts or stores a password, and never signs in for you behind your back.
// Every account connects the same consent way the rest of OXBOT does — your own one-click sign-in with each service, or
// a key you paste — which is exactly what AGENTS.md requires ("signing in still needs an approval card"; "never into
// password fields"; "never: password managers, Keychain"). "Find the apps you already use" reads only the website
// column of a password export you choose, in this window, to show which apps OXBOT can connect; it keeps no password.

type Step = 'hello' | 'profile' | 'connect' | 'schedule' | 'tour' | 'done';
const ORDER: Step[] = ['hello', 'profile', 'connect', 'schedule', 'tour', 'done'];

export const ONBOARDED_KEY = 'oxbot-onboarded';
export const wasOnboarded = () => { try { return localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { return false; } };

// The calm, plain tour. Each card is one thing OXBOT does, said in a sentence or two, in order of a day.
// Each stop: a title and one short line on screen; Ox says the longer version out loud.
const TOUR: { title: string; line: string; say: string }[] = [
  { title: 'Taurus, your home', line: 'Ox in the middle. Your day around him.', say: 'This is Taurus. I sit in the middle, and the things that matter today float in around me. It is the first thing you see.' },
  { title: 'Just ask', line: 'Type, press Talk, or say “Hey Ox”.', say: 'Type to me, or press Talk and say it out loud. Hey Ox wakes me too. I keep it short, and I never dump a wall of text on you.' },
  { title: 'Helpers for big jobs', line: 'A swarm of helpers reads in parallel.', say: 'For a big job I can send out a swarm of helpers at once. You watch the little cursors fan out, read, and fold back into me with the answer.' },
  { title: 'Nothing without your yes', line: 'You approve the exact words before anything goes out.', say: 'I only ever read, unless you say so. Sending a mail, a reply, an order: each one comes back to you as a card. You approve the exact words. Nothing goes out behind your back.' },
  { title: 'I ring when it matters', line: 'Quiet by default. A ring only when it can’t wait.', say: 'When something truly needs you, I can ring your phone or this screen. The rest of the time I stay quiet. I carry the small stuff so you do not have to.' },
];

export function Onboarding({ prefs, setPrefs, onDone }: { prefs: Prefs; setPrefs: (u: (p: Prefs) => Prefs) => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('hello');
  const [tourAt, setTourAt] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [list, setList] = useState<ConnectorInfo[] | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loadError, setLoadError] = useState('');
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const speaking = useSpeaking();
  const voiceRef = useRef(voiceOn);
  useEffect(() => { voiceRef.current = voiceOn; }, [voiceOn]);

  const profile = prefs.profile;
  const setProfile = useCallback((next: Partial<Profile>) => setPrefs(p => ({ ...p, profile: { ...p.profile, ...next } })), [setPrefs]);

  // Load the real connectors so the connect and schedule steps show your own apps. Degrades quietly if the server is down.
  useEffect(() => {
    let live = true;
    api.connectors().then(r => { if (live) { setList(r.connectors); setBundles(r.bundles ?? []); setLoadError(''); } }).catch(e => { if (live) setLoadError((e as Error).message); });
    const back = () => api.connectors().then(r => { setList(r.connectors); setBundles(r.bundles ?? []); }).catch(() => undefined);
    window.addEventListener('focus', back);
    return () => { live = false; window.removeEventListener('focus', back); };
  }, []);

  // What Ox says when a step opens. Voice only after the first tap (the Begin button unlocks the audio).
  const narrate = useCallback((text: string) => { if (voiceRef.current) void say(text); else stopSpeaking(); }, []);

  const name = profile.name?.trim();
  const connected = useMemo(() => list?.filter(c => c.connected) ?? [], [list]);
  // Where your schedule lives: a connected calendar first, then tasks/notes (Notion, etc.).
  const scheduleSource = useMemo(() => connected.find(c => c.group === 'Calendar') ?? connected.find(c => c.group === 'Tasks'), [connected]);

  // Narrate each non-tour step as it opens. The tour narrates per card in its own effect below.
  useEffect(() => {
    if (step === 'profile') narrate(name ? `Good to meet you, ${name}. This is all I need to start — a name, and how you want me to sound.` : 'First, who are you? Tell me what to call you. That is really all I need to begin.');
    else if (step === 'connect') narrate('Now let us connect the apps you already live in. I only read, and every sign-in is yours — your own account, your own tap. I never touch a password.');
    else if (step === 'schedule') narrate(scheduleSource ? `I can see you use ${scheduleSource.name.split(' (')[0]}. I will read your schedule from there, so I always know what is next.` : 'Once a calendar or your notes are connected, I will read your schedule from there and keep you ahead of what is next.');
    else if (step === 'done') narrate(`That is everything${name ? `, ${name}` : ''}. I am here whenever you need me, and quiet when you do not. Let us begin.`);
    return () => stopSpeaking();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps -- narrate once per step; name/source read at entry
  // The tour: narrate the card you're on, each time it changes.
  useEffect(() => { if (step === 'tour') narrate(`${TOUR[tourAt].title}. ${TOUR[tourAt].say}`); }, [step, tourAt, narrate]);

  const go = (next: Step) => { stopSpeaking(); if (next === 'tour') setTourAt(0); setStep(next); };
  const idx = ORDER.indexOf(step);
  const back = () => { if (step === 'tour' && tourAt > 0) { setTourAt(n => n - 1); return; } if (idx > 0) go(ORDER[idx - 1]); };
  const nextTour = () => { if (tourAt < TOUR.length - 1) setTourAt(n => n + 1); else go('done'); };

  const finish = useCallback(() => { stopSpeaking(); try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* storage blocked: shows again next visit */ } onDone(); }, [onDone]);

  // Esc skips the whole thing (still marks it done, so it does not reappear every launch).
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('dialog.app-sheet[open]')) finish(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [finish]);

  const begin = () => { unlockAudio(); go('profile'); };
  const toggleVoice = () => setVoiceOn(v => { const on = !v; if (!on) stopSpeaking(); return on; });

  // Ox's face: he talks while his own voice plays, otherwise he is happy to see you.
  const mood: Mood = speaking.active ? 'talking' : step === 'hello' ? 'idle' : 'happy';
  const oxSize = step === 'hello' ? 160 : 92;

  // Suggested apps to sign into first: the ones a day runs on, your not-yet-connected ones first.
  const suggested = useMemo(() => {
    if (!list) return [];
    const wanted = new Set(['Mail', 'Calendar', 'Chat', 'Tasks', 'Body']);
    const picks = list.filter(c => wanted.has(c.group) && (c.auth === 'oauth' || c.oneClick));
    const score = (c: ConnectorInfo) => (c.connected ? 10 : 0) + (found?.ids.includes(c.id) ? -5 : 0);
    return [...picks].sort((a, b) => score(a) - score(b)).slice(0, 6);
  }, [list, found]);
  const youUse = useMemo(() => list && found ? list.filter(c => found.ids.includes(c.id)) : [], [list, found]);
  const current = list?.find(c => c.id === open) ?? null;

  const header = <div className="ob-head">
    <div className="ob-progress" aria-hidden="true">{ORDER.slice(1, -1).map((s, i) => <span key={s} className={`ob-dot ${idx - 1 === i ? 'on' : idx - 1 > i ? 'done' : ''}`} />)}</div>
    <div className="ob-head-actions">
      <button type="button" className="text-button" aria-pressed={!voiceOn} onClick={toggleVoice}>{voiceOn ? 'Voice on' : 'Voice off'}</button>
      {step !== 'done' && <button type="button" className="text-button" onClick={finish}>Skip</button>}
    </div>
  </div>;

  return <div className="ob-screen" role="dialog" aria-modal="true" aria-label="Welcome to OXBOT" data-step={step}>
    <div className="ob-ox" data-big={step === 'hello'}><Ox size={oxSize} mood={mood} talk={mood === 'talking' ? speaking.level : undefined} label="Ox" /></div>

    {step === 'hello' ? <div className="ob-body ob-hello">
      <h1>Hi. I’m Ox.</h1>
      <p className="ob-lede">Your chief of staff. I carry the small stuff and ring you only when it matters.</p>
      <div className="ob-actions"><button type="button" className="primary ob-begin" onClick={begin}>Begin</button></div>
    </div> : <>
      {header}

      {step === 'profile' && <div className="ob-body">
        <h2>What should I call you?</h2>
        <div className="ob-form">
          <label>Your name<input type="text" autoFocus defaultValue={profile.name} maxLength={60} placeholder="First name is fine" onBlur={e => setProfile({ name: e.target.value.trim() })} /></label>
          <label>Email<input type="email" defaultValue={profile.email ?? ''} maxLength={254} placeholder="Optional" autoComplete="email"
            onBlur={e => { const v = e.target.value.trim(); if (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) setProfile({ email: v || undefined }); }} /></label>
          <fieldset className="ob-tone">
            <legend>How should I sound?</legend>
            <div className="ob-tone-row" role="radiogroup" aria-label="Tone">
              {([['witty', 'Witty'], ['warm', 'Warm'], ['brief', 'Brief'], ['direct', 'Direct']] as const).map(([key, lbl]) => <button key={key} type="button" role="radio"
                aria-checked={(profile.tone ?? 'witty') === key} className={`ob-chip ${(profile.tone ?? 'witty') === key ? 'on' : ''}`} onClick={() => setProfile({ tone: key })}>{lbl}</button>)}
            </div>
          </fieldset>
          <label className="check"><input type="checkbox" checked={profile.greet !== false} onChange={e => setProfile({ greet: e.target.checked })} />Greet me by name with the time of day</label>
        </div>
        <div className="ob-actions"><button type="button" className="primary" onClick={() => go('connect')}>{name ? 'Continue' : 'Skip for now'}</button></div>
      </div>}

      {step === 'connect' && <div className="ob-body ob-connect">
        <h2>Connect what you already use</h2>
        <p className="ob-lede">Read-only, through each app’s own sign‑in. Acting on anything is always a separate yes.</p>
        {loadError && <p className="muted">I can’t reach OXBOT to list your apps. Connect them later in Settings.</p>}
        {bundles.some(b => b.ready || b.connected) && <section className="ob-group ob-accounts">
          <h3>Start with your main account</h3>
          <div className="ob-account-row">{bundles.filter(b => b.ready || b.connected).map(b => b.connected
            ? <span key={b.provider} className="ob-account on" aria-label={`${b.name} connected`}>{b.name} connected</span>
            : <a key={b.provider} className="button primary ob-account" href={`/api/oauth/start-bundle/${b.provider}`}>Connect {b.name}</a>)}</div>
        </section>}
        <div className="ob-connect-tools">
          <button type="button" className="primary" onClick={() => setFinding(true)} disabled={!list}>Find the apps I already use</button>
        </div>
        {youUse.length > 0 && <section className="ob-group"><h3>You already use these</h3><div className="ob-rows">{youUse.map(c => <Connector key={c.id} c={c} onChange={setList} />)}</div></section>}
        {suggested.length > 0 && <section className="ob-group"><h3>A good place to start</h3>
          <div className="ob-rows">{suggested.map(c => <Connector key={c.id} c={c} onChange={setList} />)}</div>
        </section>}
        <div className="ob-actions">
          <button type="button" className="primary" onClick={() => go('schedule')}>{connected.length ? 'Continue' : 'I’ll do this later'}</button>
        </div>
      </div>}

      {step === 'schedule' && <div className="ob-body">
        <h2>Your schedule</h2>
        {scheduleSource ? <>
          <p className="ob-lede">I’ll read what’s next from <strong>{scheduleSource.name.split(' (')[0]}</strong>.</p>
        </> : <>
          <p className="ob-lede">Connect a calendar and I’ll keep you ahead of what’s next.</p>
          <div className="ob-actions-inline"><button type="button" onClick={() => go('connect')}>Back to connections</button></div>
        </>}
        <div className="ob-actions"><button type="button" className="primary" onClick={() => go('tour')}>Show me around</button></div>
      </div>}

      {step === 'tour' && <div className="ob-body ob-tour">
        <h2>{TOUR[tourAt].title}</h2>
        <p className="ob-lede">{TOUR[tourAt].line}</p>
        <div className="ob-actions">
          <button type="button" onClick={back} disabled={tourAt === 0}>Back</button>
          <button type="button" className="primary" onClick={nextTour}>{tourAt < TOUR.length - 1 ? 'Next' : 'Finish'}</button>
        </div>
      </div>}

      {step === 'done' && <div className="ob-body ob-done">
        <h2>You’re set{name ? `, ${name}` : ''}.</h2>
        <p className="ob-lede">I’ll take it from here.</p>
        <div className="ob-actions"><button type="button" className="primary ob-begin" onClick={finish}>Enter OXBOT</button></div>
      </div>}
    </>}

    {finding && list && <FindAccounts list={list} onFound={setFound} onOpen={id => { setFinding(false); setOpen(id); }} onClose={() => setFinding(false)} />}
    {current && <AppSheet key={current.id} c={current} onChange={setList} onClose={() => setOpen(null)} />}
  </div>;
}
