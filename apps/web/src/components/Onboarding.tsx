import { useState, type FormEvent } from 'react';
import { api } from '../api';
import '../styles/onboarding.css';

export const ONBOARDED_KEY = 'taurus-onboarded';
export const wasOnboarded = () => {
  try { return localStorage.getItem(ONBOARDED_KEY) === '1'; }
  catch { return false; }
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { onDone(); return; }

    setSaving(true);
    setProblem('');
    try {
      const prefs = await api.prefs();
      await api.savePrefs({ ...prefs, profile: { ...prefs.profile, name: trimmed } });
      onDone();
    } catch {
      setProblem('Couldn’t save your name. Try again, or skip setup.');
      setSaving(false);
    }
  }

  return <main id="main" className="welcome" aria-labelledby="welcome-title">
    <div className="welcome-titlebar" aria-hidden="true" />
    <section className="welcome-content">
      <img className="welcome-mark" src="/icons/icon-192.png" width={72} height={72} alt="" />
      <h1 id="welcome-title">Welcome to Taurus</h1>
      <form className="welcome-form" onSubmit={finish}>
        <label htmlFor="welcome-name">What should I call you?</label>
        <input id="welcome-name" type="text" autoComplete="given-name" maxLength={60}
          placeholder="Your name" value={name} disabled={saving} onChange={event => setName(event.target.value)} />
        {problem && <p className="welcome-problem" role="alert">{problem}</p>}
        <button className="primary" type="submit" disabled={saving}>{saving ? 'Starting…' : 'Start Taurus'}</button>
        <button className="text-button" type="button" disabled={saving} onClick={onDone}>Skip setup</button>
      </form>
    </section>
  </main>;
}
