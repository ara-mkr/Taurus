import { useEffect, useState } from 'react';
import { api, type SpeechState } from '../api';
import { readSpeech, saveSpeech, say, stopSpeaking, useSpeaking, type SpeechPrefs } from '../speech';

// Settings, Personalize, Taurus's voice (owner, November 5, 2026: "find a good voice tho no money ... not monotonous and
// roboticy"). Kokoro-82M: free, open source (Apache-2.0), made on this Mac. One download of about 90 MB, then offline.

const sample = 'Hey. Three things need you today, and the first is Sam’s board deck. I’ll keep everything else quiet until you’re done.';
const status = (s: SpeechState | null) => !s ? '' : s.status === 'ready' ? 'Ready' : s.status === 'loading' ? (s.progress > 0 ? `Downloading, ${Math.round(s.progress * 100)}%` : 'Starting') : s.status === 'error' ? 'Problem' : 'Off';

export function TaurusVoice() {
  const [state, setState] = useState<SpeechState | null>(null);
  const [prefs, setPrefs] = useState<SpeechPrefs>(readSpeech);
  const [error, setError] = useState('');
  const [hearing, setHearing] = useState('');
  const speaking = useSpeaking();
  useEffect(() => { api.speech().then(setState).catch(e => setError(e.message)); }, []);
  // While it downloads, check every second.
  useEffect(() => {
    if (state?.status !== 'loading') return;
    const t = window.setInterval(() => api.speech().then(setState).catch(() => undefined), 900);
    return () => window.clearInterval(t);
  }, [state?.status]);

  const set = (next: Partial<SpeechPrefs>) => { const p = { ...prefs, ...next }; setPrefs(p); saveSpeech(p); };
  const turn = (on: boolean) => api.setSpeech(on).then(s => { setState(s); setError(''); }).catch(e => setError(e.message));
  const hear = (voice: string) => {
    if (hearing === voice && speaking.active) { stopSpeaking(); setHearing(''); return; }
    setHearing(voice);
    void say(sample, { ...prefs, voice }).finally(() => setHearing(h => (h === voice ? '' : h)));
  };
  const on = state?.on === true;
  const ready = on && state?.status === 'ready';

  return <fieldset className="choice taurus-voice" aria-describedby="taurus-voice-note">
    <legend>Taurus’s voice</legend>
    <div className="taurus-voice-head">
      <span><strong>Natural voice</strong> <span className={state?.status === 'error' ? 'problem' : 'muted'}>{status(state)}</span></span>
      {on ? <button type="button" className="text-button" onClick={() => void turn(false)}>Turn off</button>
        : <button type="button" className="primary" onClick={() => void turn(true)}>Turn on</button>}
    </div>
    {state?.status === 'loading' && <div className="taurus-voice-bar" role="progressbar" aria-label="Downloading Taurus’s voice" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)}><span style={{ transform: `scaleX(${Math.max(0.03, state.progress)})` }} /></div>}
    {(state?.error || error) && <p className="problem">{state?.error || error}</p>}
    <p className="muted" id="taurus-voice-note">{on ? 'Kokoro, free and open source, speaking on this Mac. Nothing you hear leaves it.' : 'Kokoro is free, open source and sounds like a person. It downloads once (about 90 MB), then speaks offline on this Mac. Until then Taurus uses your browser’s voice.'}</p>
    <ul className="taurus-voices" aria-label="Voices">
      {(state?.voices ?? []).map(v => <li key={v.id} data-on={prefs.voice === v.id}>
        <label className="taurus-voice-pick">
          <input type="radio" name="taurus-voice" checked={prefs.voice === v.id} onChange={() => set({ voice: v.id })} />
          <span className="taurus-voice-name">{v.name}</span>
          <span className="muted">{v.accent} {v.gender.toLowerCase()}. {v.note}</span>
        </label>
        <button type="button" className="text-button" disabled={!ready} onClick={() => hear(v.id)} aria-label={`${hearing === v.id ? 'Stop' : 'Hear'} ${v.name}`}>{hearing === v.id ? 'Stop' : 'Hear'}</button>
      </li>)}
    </ul>
    <label className="taurus-voice-pace">
      <span>Pace</span>
      <input type="range" min={0.8} max={1.3} step={0.05} value={prefs.speed} onChange={e => set({ speed: Number(e.target.value) })} aria-valuetext={`${prefs.speed.toFixed(2)} times normal`} />
      <span className="muted">{prefs.speed === 1 ? 'Normal' : `${prefs.speed.toFixed(2)}×`}</span>
    </label>
  </fieldset>;
}
