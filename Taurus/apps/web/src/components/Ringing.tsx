import { useCallback, useEffect, useRef, useState } from 'react';
import { api, clock, type Dashboard, type Proposal, type Ring } from '../api';
import { ApprovalCard } from './Approval';
import { Taurus } from './Taurus';
import { FlipClock } from './FlipClock';
import { Sky } from './CloudDashboard';

// A two-tone alarm built from oscillators, so there is no audio file to load or block.
const alarm = {
  ctx: null as AudioContext | null,
  timer: 0,
  arm() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx.state !== 'closed';
  },
  get armed() { return this.ctx?.state === 'running'; },
  beep(at: number, frequency: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at); osc.stop(at + 0.18);
  },
  start() {
    this.stop();
    // The desktop app allows sound without a tap, so it can make its own audio context here.
    this.arm();
    const cycle = () => {
      navigator.vibrate?.([500, 200, 500, 200, 500]);
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      [0, 0.2, 0.4, 0.6].forEach((offset, i) => this.beep(t + offset, i % 2 ? 660 : 880));
    };
    cycle();
    this.timer = window.setInterval(cycle, 1600);
  },
  stop() { window.clearInterval(this.timer); navigator.vibrate?.(0); },
};
export const armAlarm = () => alarm.arm();
// A soft three-note chime for a timer or reminder (November 4, 2026): something to notice, not an alarm.
export function chime() {
  const ctx = alarm.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  [784, 988, 1319].forEach((frequency, i) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), at = t + i * 0.16;
    osc.type = 'sine'; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at); osc.stop(at + 1);
  });
}

// One stream for rings and, since November 1, 2026, actions waiting for your approval. Every proposal seen on
// this screen is kept by id with its latest state, so a card can show "Done" after it leaves the waiting list.
export function useRing() {
  const [ring, setRing] = useState<Ring | null>(null);
  const [listening, setListening] = useState(false);
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  useEffect(() => {
    const source = new EventSource('/api/ring/stream', { withCredentials: true });
    source.onopen = () => setListening(true);
    source.onerror = () => setListening(false);
    source.addEventListener('ring', event => {
      const next = JSON.parse((event as MessageEvent).data) as Ring;
      if (next.state === 'ringing' || next.state === 'escalated') setRing(next);
      else setRing(current => current?.id === next.id ? null : current);
    });
    source.addEventListener('approval', event => {
      const next = JSON.parse((event as MessageEvent).data) as Proposal;
      setProposals(all => ({ ...all, [next.id]: next }));
    });
    api.approvals().then(r => setProposals(all => ({ ...Object.fromEntries(r.pending.map(p => [p.id, p])), ...all }))).catch(() => undefined);
    return () => source.close();
  }, []);
  const update = useCallback((p: Proposal) => setProposals(all => ({ ...all, [p.id]: p })), []);
  // The server marks an expired approval and says so on this stream, so state alone is enough here.
  const waiting = Object.values(proposals).filter(p => p.state === 'pending').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return { ring, listening, clear: () => setRing(null), proposals, waiting, update };
}

export function RingScreen({ ring, onDone, waiting = [], onUpdate }: { ring: Ring; onDone: () => void; waiting?: Proposal[]; onUpdate?: (p: Proposal) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [problem, setProblem] = useState('');
  useEffect(() => {
    alarm.start();
    first.current?.focus();
    const title = document.title;
    let flip = false;
    const tick = window.setInterval(() => { setNow(Date.now()); flip = !flip; document.title = flip ? `Ringing: ${ring.title}` : title; }, 1000);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(`Taurus: ${ring.title}`, { body: ring.detail, tag: ring.id, requireInteraction: true });
    return () => { alarm.stop(); window.clearInterval(tick); document.title = title; };
  }, [ring.id, ring.title, ring.detail]);

  async function answer(action: 'ack' | 'snooze') {
    alarm.stop();
    try { await api.answer(ring.id, action); onDone(); } catch (error) { setProblem((error as Error).message); }
  }

  return <div className="ring" role="alertdialog" aria-modal="true" aria-labelledby="ring-title" aria-describedby="ring-detail">
    <div className="ring-top"><span className="wordmark">Taurus</span><span>{clock(new Date(now).toISOString())}</span></div>
    <div className="ring-main">
      <Taurus size={104} mood="alert" className="ring-taurus" />
      <p className="ring-reason">{ring.reason === 'meeting' ? 'Meeting' : ring.reason === 'vip' ? 'From a VIP' : ring.reason === 'test' ? 'Test' : 'Needs you'}</p>
      <h1 id="ring-title">{ring.title}</h1>
      <p id="ring-detail">{ring.detail}</p>
    </div>
    <div className="ring-actions">
      <button ref={first} className="ring-primary" onClick={() => answer('ack')}>I’m on it</button>
      {ring.url && <a className="ring-secondary" href={ring.url} target="_blank" rel="noreferrer" onClick={() => answer('ack')}>Open</a>}
      <button className="ring-secondary" onClick={() => answer('snooze')}>Snooze 5 min</button>
    </div>
    <p className="ring-foot">{ring.state === 'escalated' ? 'Calling your phone now.' : `Ringing ${ring.channels.length ? `on ${ring.channels.join(', ')}` : 'here'}.`}{problem && ` ${problem}`}</p>
    {waiting.length > 0 && <section className="ring-waiting" aria-label="Waiting for your OK">
      <h2>Also waiting for your OK</h2>
      {waiting.slice(0, 2).map(p => <ApprovalCard key={p.id} p={p} via="ring" onChange={onUpdate} />)}
    </section>}
  </div>;
}

// When the Mac doesn't answer at all (off, asleep, other Wi-Fi). The service worker keeps this page on the phone.
export function Unreachable({ onRetry }: { onRetry: () => Promise<unknown> }) {
  const [trying, setTrying] = useState(false);
  const pull = useRef<number | null>(null);
  async function retry() {
    if (trying) return;
    setTrying(true);
    try { await onRetry(); } finally { setTrying(false); }
  }
  const onMac = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return <main id="main" tabIndex={-1} className="unreachable"
    onTouchStart={e => { pull.current = window.scrollY <= 0 && (document.getElementById('root')?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null; }}
    onTouchEnd={e => { if (pull.current !== null && e.changedTouches[0].clientY - pull.current > 80) void retry(); pull.current = null; }}>
    <Taurus size={96} mood="sleep" className="unreachable-taurus" />
    <h1>Can’t reach your Mac.</h1>
    <p>Taurus runs on your Mac; open it there, then pull to retry.</p>
    {onMac && <p className="muted">On this Mac, open the Taurus app or run pnpm start.</p>}
    <p><button className="glass-button" onClick={() => void retry()} disabled={trying}>{trying ? 'Trying' : 'Try again'}</button></p>
  </main>;
}

// What a phone shows while it waits: a bedside clock that turns into the ring screen.
export function Standby({ data, listening, now, waiting = [], onUpdate }: { data: Dashboard | null; listening: boolean; now: number; waiting?: Proposal[]; onUpdate?: (p: Proposal) => void }) {
  const [armed, setArmed] = useState(alarm.armed);
  const lock = useRef<WakeLockSentinel | null>(null);
  useEffect(() => () => { void lock.current?.release(); }, []);
  async function wake() {
    setArmed(alarm.arm());
    try { lock.current = await navigator.wakeLock?.request('screen'); } catch { /* not supported; the screen may sleep */ }
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  }
  const next = data?.schedule.find(e => !e.allDay && Date.parse(e.start) > now);
  // November 6, 2026, revised: just the clock, like Apple's StandBy. A click, tap or key shows the rest for a few
  // seconds; another tap, Escape or the timer hides it again. Moving the mouse never does either.
  const [chrome, setChrome] = useState(false);
  const hideTimer = useRef(0);
  const linger = waiting.length ? 20_000 : 7_000;
  const reveal = useCallback(() => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), linger);
  }, [linger]);
  const hide = useCallback(() => { window.clearTimeout(hideTimer.current); setChrome(false); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) reveal(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); window.clearTimeout(hideTimer.current); };
  }, [hide, reveal]);
  // Touching what's shown keeps it up; tapping anywhere else toggles it.
  const keep = (e: { stopPropagation(): void }) => { e.stopPropagation(); reveal(); };
  return <main id="main" tabIndex={-1} className="standby standby-glass" data-chrome={chrome ? 'on' : 'off'} onClick={() => { void wake(); if (chrome) hide(); else reveal(); }}>
    <Sky parted={0} clouds="calm" />
    <div className="standby-blur" aria-hidden="true" />
    <h1 className="sr-only">{clock(new Date(now).toISOString())}</h1>
    <FlipClock />
    <div className="standby-chrome" aria-hidden={!chrome}>
      <Taurus size={64} mood={!listening ? 'sleep' : armed ? 'idle' : 'sleep'} className="standby-taurus" />
      <div className="standby-gap" />
      <div className="standby-foot" onClick={keep}>
        <p className="standby-next">{next ? `${next.title} at ${clock(next.start)}` : 'Nothing else scheduled'}</p>
        <p className="standby-state">{!listening ? 'Not connected to Taurus. Check that your Mac is awake.' : armed ? 'Listening. Taurus will ring here.' : 'Tap anywhere so Taurus can ring out loud.'}</p>
        {waiting.length > 0 && <section className="standby-waiting" aria-label="Waiting for your OK">
          {waiting.map(p => <ApprovalCard key={p.id} p={p} via="phone" onChange={onUpdate} level={2} />)}
        </section>}
        <a className="standby-exit" href="#" tabIndex={chrome ? 0 : -1}>Open the dashboard</a>
      </div>
    </div>
  </main>;
}
