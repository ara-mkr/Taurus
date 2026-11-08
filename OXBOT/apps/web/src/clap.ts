import { useEffect, useRef } from 'react';

// Two claps or two snaps start Talk (owner, November 6, 2026: "make it so ox recognizes and enables voice mode and
// starts listening when i double clap or double snap"). Off by default, a switch in Settings, Voice. While it is on
// and this tab is visible, the microphone's loudness is measured here in the browser, a few times a second, above
// the pitch of speech. Nothing is recorded, kept or sent anywhere: no words, no sound, only "two sharp sounds".

// A clap or a snap is a sharp burst well above the room's own noise that dies away within a tenth of a second.
// Two of them between 0.15 and 0.75 seconds apart is a double. Speech and music last too long to count.
export interface Detector { feed(level: number, at: number): boolean }
export function clapDetector(options: { min?: number; over?: number } = {}): Detector {
  const min = options.min ?? 0.12, over = options.over ?? 7;
  let floor = 0.01;
  let burst: { at: number; peak: number } | null = null;
  let first = -Infinity, rest = -Infinity;
  return {
    feed(level, at) {
      // A burst that has gone quiet again within 120 ms is one clap; one still loud after that is a voice or a bang.
      if (burst) {
        if (level < burst.peak * 0.35) {
          const clap = burst.at; burst = null;
          if (at - clap <= 140) {
            if (clap - first >= 150 && clap - first <= 750 && clap > rest) { first = -Infinity; rest = clap + 1200; return true; }
            first = clap;
          }
        } else if (at - burst.at > 140) { burst = null; first = -Infinity; rest = Math.max(rest, at + 250); }
        else burst.peak = Math.max(burst.peak, level);
        return false;
      }
      if (level > Math.max(min, floor * over) && at > rest) { burst = { at, peak: level }; return false; }
      // The room's own level, followed slowly, so a noisy room needs a louder clap.
      floor = floor * 0.97 + Math.min(level, floor * 3) * 0.03;
      return false;
    },
  };
}

export function useDoubleClap(on: boolean, onDouble: () => void) {
  const handler = useRef(onDouble);
  useEffect(() => { handler.current = onDouble; }, [onDouble]);
  useEffect(() => {
    if (!on || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return;
    let alive = true, timer = 0;
    let stream: MediaStream | null = null, ctx: AudioContext | null = null;
    // No noise suppression or gain control: they flatten exactly the sharp sounds this listens for.
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false }).then(s => {
      if (!alive) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s; ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(s);
      // Above most of a voice's energy; claps and snaps are loud up here.
      const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 1800;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      source.connect(high).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const detect = clapDetector();
      timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        if (detect.feed(peak, performance.now())) handler.current();
      }, 12);
    }).catch(() => undefined);
    return () => { alive = false; window.clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); void ctx?.close(); };
  }, [on]);
}
