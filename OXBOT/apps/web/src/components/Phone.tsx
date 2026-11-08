import { useEffect, useState, type FormEvent } from 'react';
import { api, type PhoneInfo, type PhoneSettings } from '../api';
import { Qr } from './Qr';
import { armAlarm } from './Ringing';

// Android Chrome offers installing once it decides the page qualifies; keep that offer for the button below.
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let offer: InstallPrompt | null = null;
const offerListeners = new Set<() => void>();
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); offer = event as InstallPrompt; offerListeners.forEach(f => f()); });

function Install() {
  const [, refresh] = useState(0);
  const [standalone, setStandalone] = useState(() => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
  useEffect(() => {
    const update = () => refresh(n => n + 1);
    const installed = () => { offer = null; setStandalone(true); };
    offerListeners.add(update);
    window.addEventListener('appinstalled', installed);
    return () => { offerListeners.delete(update); window.removeEventListener('appinstalled', installed); };
  }, []);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (standalone) return <p className="muted">OXBOT is open from the home screen.</p>;
  if (offer) return <p><button className="text-button install" onClick={async () => { const o = offer; offer = null; await o?.prompt(); refresh(n => n + 1); }}>Add OXBOT to your home screen</button></p>;
  if (ios) return <p>To keep OXBOT on this iPhone: tap Share, then Add to Home Screen.</p>;
  return null;
}
// OXBOT's own number as a contact card: an iPhone or Android camera turns this QR code into "Add contact", so OXBOT's
// calls show up by name like any other caller (owner, November 2, 2026).
const vcard = (number: string) => ['BEGIN:VCARD', 'VERSION:3.0', 'N:;OXBOT;;;', 'FN:OXBOT', 'ORG:OXBOT', `TEL;TYPE=CELL,VOICE:${number}`, 'NOTE:Calls only when something needs you now.', 'END:VCARD'].join('\r\n');
const pretty = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '+1 ($1) $2-$3');

function OwnNumber({ number }: { number?: string | null }) {
  if (!number) return <>
    <p>OXBOT calls you from its own phone number, like any other caller. It gets one through Twilio: a trial is free, and a number costs about a dollar a month after that. Buying it is your step.</p>
    <p className="muted">In the <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/search" target="_blank" rel="noreferrer">Twilio console</a>, choose Buy a number, then add it with your Account SID and auth token under <a href="#connections/twilio">Connections, Phone call</a>.</p>
  </>;
  const card = vcard(number);
  return <div className="phone-link">
    <Qr value={card} label={`QR code that adds OXBOT, ${number}, to your contacts`} size={168} />
    <div>
      <p><strong>OXBOT’s number is {pretty(number)}.</strong></p>
      <p className="muted">Point your phone’s camera at the code to save it as a contact named OXBOT, so its calls show up by name. <a href={`data:text/vcard;charset=utf-8,${encodeURIComponent(card)}`} download="OXBOT.vcf">Download the contact card</a> instead.</p>
      <p className="muted">On iPhone, open the contact, tap Ringtone and turn on Emergency Bypass so OXBOT rings through Do Not Disturb and Focus. On Android, star it and allow starred contacts in Do Not Disturb.</p>
    </div>
  </div>;
}

// Phone over HTTPS (owner, November 2, 2026): install OXBOT's own certificate once, check its fingerprint, then pair.
function Secure({ tls, pairing }: { tls: { fingerprint: string; certificate: string[] }; pairing: string[] }) {
  return <>
    <p>Your phone talks to this Mac over HTTPS, so nobody else on the Wi-Fi can read it. It needs OXBOT’s certificate once, then the pairing link.</p>
    <h3 className="phone-step">First, the certificate</h3>
    <div className="phone-link">
      <Qr value={tls.certificate[0]} label="QR code that downloads OXBOT’s certificate to your phone" size={168} />
      <div>
        <p className="muted">On iPhone: scan, tap Allow, then Settings → Profile Downloaded → Install. Then Settings → General → About → Certificate Trust Settings and turn on full trust for OXBOT. On Android: scan, then Settings → Security → Install a certificate → CA certificate.</p>
        <p className="muted">Before trusting it, check its SHA-256 fingerprint matches this one (on iPhone: the profile → More Details):</p>
        <p><code className="copy fingerprint">{tls.fingerprint}</code></p>
        <p className="muted">It can only vouch for addresses on your own network, never for a real website.</p>
      </div>
    </div>
    <h3 className="phone-step">Then, pair</h3>
    <div className="phone-link">
      <Qr value={pairing[0]} label="QR code that pairs your phone with OXBOT over HTTPS" size={168} />
      <div>
        <p className="muted">Scan to open OXBOT on your phone. It remembers the phone after that. Then Share → Add to Home Screen. If the home-screen app asks to be paired, type this key: <code className="copy">{pairingKey(pairing[0])}</code></p>
        <p className="muted">Over HTTPS the phone can use Talk and keep working offline. A home-screen icon from before still points at the old http address: remove it and add OXBOT again.</p>
      </div>
    </div>
  </>;
}

const inDesktop = () => Boolean((window as { oxbotDesktop?: unknown }).oxbotDesktop);
const pairingKey = (url?: string) => { try { return url ? new URL(url).searchParams.get('key') ?? '' : ''; } catch { return ''; } };

export function Phone() {
  const [info, setInfo] = useState<PhoneInfo | null>(null);
  const [form, setForm] = useState<PhoneSettings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [calling, setCalling] = useState(false);
  useEffect(() => { api.phone().then(r => { setInfo(r); setForm(r.settings); }).catch(e => setError(e.message)); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    try { const r = await api.savePhone(form); setForm(r.settings); setMessage('Saved.'); } catch (e) { setMessage((e as Error).message); }
  }
  async function test() {
    armAlarm();
    try { await api.ring(); setMessage(''); } catch (e) { setMessage((e as Error).message); }
  }
  async function callMe() {
    setCalling(true);
    try { setMessage(`${(await api.testCall()).message} Your phone should ring in a few seconds.`); } catch (e) { setMessage((e as Error).message); }
    finally { setCalling(false); setInfo(await api.phone().catch(() => info)); }
  }
  const set = <K extends keyof PhoneSettings>(key: K, value: PhoneSettings[K]) => form && setForm({ ...form, [key]: value });

  return <main id="main" tabIndex={-1} className="phone">
    <div className="page-head"><h1>Phone</h1><button className="button primary" onClick={test}>Ring me now</button></div>
    <p className="lede">When something can’t wait, OXBOT takes over the screen and rings like an alarm on every device that has it open. If you don’t answer in time, it pushes to ntfy and then calls your phone.</p>
    {error && <p className="problem">{error}</p>}
    {message && <p role="status" className="muted">{message}</p>}

    {info && <section aria-labelledby="ladder">
      <h2 id="ladder">How it reaches you</h2>
      <ol className="ladder">
        <li><strong>Open screens ring.</strong> <span className="muted">{info.channels.screens} listening right now, including this one.</span></li>
        <li><strong>Push.</strong> <span className="muted">{info.channels.ntfy ? 'ntfy is connected.' : <>Not set up. <a href="#connections">Add ntfy</a></>}</span></li>
        <li><strong>Phone call after {form?.escalateAfterSeconds ?? 60} seconds.</strong> <span className="muted">{info.channels.call ? <>Twilio is connected. <button type="button" className="text-button" disabled={calling} onClick={callMe}>{calling ? 'Calling…' : 'Call me now'}</button></> : <>Not set up. <a href="#connections">Add Twilio</a></>}</span>
          {info.channels.lastCall && <span className={info.channels.lastCall.ok ? 'muted call-last' : 'problem call-last'}>Last call, {new Date(info.channels.lastCall.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}: {info.channels.lastCall.message}</span>}</li>
      </ol>
    </section>}

    {info && <section aria-labelledby="own-number">
      <h2 id="own-number">OXBOT’s phone number</h2>
      <OwnNumber number={info.channels.number} />
    </section>}

    {info && <section aria-labelledby="pair">
      <h2 id="pair">Use it on your phone</h2>
      {info.pairing.length && info.tls ? <Secure tls={info.tls} pairing={info.pairing} /> : info.pairing.length ? <>
        <p>On your phone, on the same Wi-Fi, open this link once. It remembers the phone after that.</p>
        {info.pairing.map(url => <p key={url}><code className="copy">{url}</code></p>)}
        <p className="muted">Then Share → Add to Home Screen and open it from there. If the home-screen app asks to be paired, type this key: <code className="copy">{pairingKey(info.pairing[0])}</code></p>
        <p className="muted">Tap once to allow sound. For a bedside clock that rings, open Standby and leave it on the charger. Over Wi-Fi the phone has no offline screen and can’t use Talk: browsers keep those for secure pages.</p>
      </> : info.lanReady ? <p className="muted">Open this page on the Mac itself to see the pairing link.</p> : inDesktop() ? <>
        <p>OXBOT is only listening on this Mac. To use it from your phone, turn on Let my phone connect in OXBOT’s menu bar item (the tray on Windows and Linux).</p>
        <p className="muted">Your phone will need a pairing link, shown here once it’s on, so nobody else on the network can open it. macOS may ask whether to allow incoming connections.</p>
      </> : <>
        <p>OXBOT is only listening on this Mac. To use it from your phone, stop it and start it with:</p>
        <p><code className="copy">OXBOT_HOST=0.0.0.0 pnpm start</code></p>
        <p className="muted">Your phone will need a pairing link, shown here after restart, so nobody else on the network can open it.</p>
      </>}
      <Install />
    </section>}

    {form && <section aria-labelledby="rules">
      <h2 id="rules">When to ring</h2>
      <form className="settings" onSubmit={save}>
        <label className="check"><input type="checkbox" checked={form.ringMeetings} onChange={e => set('ringMeetings', e.target.checked)} /> Before meetings</label>
        <label>Minutes before<input type="number" min={0} max={120} value={form.leadMinutes} onChange={e => set('leadMinutes', Number(e.target.value))} /></label>
        <label className="check"><input type="checkbox" checked={form.ringVip} onChange={e => set('ringVip', e.target.checked)} /> When a VIP emails</label>
        <label className="wide">VIP senders, one per line. Use @company.com for a whole domain.
          <textarea rows={4} value={form.vipSenders.join('\n')} onChange={e => set('vipSenders', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} placeholder={'board@example.com\n@northgate.example'} />
        </label>
        <label>Quiet from<input type="time" value={form.quietStart} onChange={e => set('quietStart', e.target.value)} /></label>
        <label>Quiet until<input type="time" value={form.quietEnd} onChange={e => set('quietEnd', e.target.value)} /></label>
        <label>Call after (seconds)<input type="number" min={15} max={600} value={form.escalateAfterSeconds} onChange={e => set('escalateAfterSeconds', Number(e.target.value))} /></label>
        <p className="muted wide">Quiet hours hold back meeting rings. VIP rings still come through.</p>
        <div className="actions wide"><button type="submit">Save</button></div>
      </form>
    </section>}
  </main>;
}
