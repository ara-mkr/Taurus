import { useState } from 'react';
import type { Prefs, Profile } from '../api';
import { Logo } from './Logo';
import { Ox } from './Ox';
import { shrink } from './Settings';
import { Avatar, brandColors, languages } from './Shell';

// Your profile, apart from Settings (owner, November 6, 2026: "seperate ur profile from settings so if u click profile it
// brings u to a seperate menu where u choose ur name email profile pic and stuff, make it so u can also choose what icon u
// want like the ox mascot or the O X letter logo and what color u want just simple black white, or certain colors").
export function ProfilePage({ prefs, setPrefs }: { prefs: Prefs; setPrefs: (u: (p: Prefs) => Prefs) => void }) {
  const profile = prefs.profile;
  const [note, setNote] = useState('');
  const setProfile = (next: Partial<Profile>) => setPrefs(p => ({ ...p, profile: { ...p.profile, ...next } }));
  async function photo(file?: File) {
    if (!file) return;
    try { setProfile({ photo: await shrink(file) }); setNote(''); } catch (e) { setNote((e as Error).message); }
  }
  const color = profile.iconColor ?? 'white';
  const hex = brandColors.find(([k]) => k === color)?.[1] ?? '#FFFFFF';
  return <main id="main" tabIndex={-1} className="settings-page profile-page">
    <div className="page-head"><h1>Profile</h1></div>
    <section className="profile-hero">
      <Avatar name={profile.name} photo={profile.photo} size={96} />
      <div className="actions">
        <label className="button file-button">{profile.photo ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*" onChange={e => void photo(e.target.files?.[0])} /></label>
        {profile.photo && <button type="button" onClick={() => setProfile({ photo: undefined })}>Remove</button>}
      </div>
      {note && <p className="problem" role="status">{note}</p>}
    </section>

    <fieldset className="choice">
      <legend>You</legend>
      <label>Name<input type="text" defaultValue={profile.name} maxLength={60} placeholder="What Ox calls you" onBlur={e => setProfile({ name: e.target.value.trim() })} /></label>
      <label>Email<input type="email" defaultValue={profile.email ?? ''} maxLength={254} placeholder="you@example.com" autoComplete="email"
        onBlur={e => { const v = e.target.value.trim(); if (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setProfile({ email: v || undefined }); setNote(''); } else setNote('That email doesn’t look right.'); }} /></label>
      <label>Language
        <select value={profile.language ?? 'en'} onChange={e => setProfile({ language: e.target.value === 'en' ? undefined : e.target.value })}>
          {languages.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>
      <p className="muted">Ox answers in the language you pick.</p>
      <label className="check"><input type="checkbox" checked={profile.greet} onChange={e => setProfile({ greet: e.target.checked })} />Greet me by name with the time of day</label>
    </fieldset>

    <fieldset className="choice">
      <legend>OXBOT’s icon</legend>
      <div className="icon-choices" role="radiogroup" aria-label="Icon">
        {(['letters', 'mascot'] as const).map(kind => <button key={kind} type="button" role="radio" aria-checked={(profile.icon ?? 'letters') === kind} className="icon-choice"
          style={{ color: hex }} onClick={() => setProfile({ icon: kind === 'letters' ? undefined : kind })}>
          {kind === 'letters' ? <Logo height={34} /> : <Ox size={40} label="Ox" />}
          <span>{kind === 'letters' ? 'OX letters' : 'Ox'}</span>
        </button>)}
      </div>
      <div className="icon-colors" role="radiogroup" aria-label="Icon colour">
        {brandColors.map(([name, value]) => <button key={name} type="button" role="radio" aria-checked={color === name} className="icon-color" style={{ background: value }}
          onClick={() => setProfile({ iconColor: name === 'white' ? undefined : name })}><span className="sr-only">{name}</span></button>)}
      </div>
      <p className="muted">Shows at the top of the side bar and on your phone’s tab bar.</p>
    </fieldset>

    <fieldset className="choice">
      <legend>Welcome</legend>
      <p className="muted">Replay Ox’s voice-guided setup and tour, the one from the first launch.</p>
      <div className="actions">
        <button type="button" onClick={() => { try { localStorage.removeItem('oxbot-onboarded'); } catch { /* storage blocked */ } location.reload(); }}>Replay the welcome</button>
      </div>
    </fieldset>
  </main>;
}
