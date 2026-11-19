import { useEffect, useRef } from 'react';

// Two claps or two snaps start Talk (owner, November 6, 2026: "make it so ox recognizes and enables voice mode and
// starts listening when i double clap or double snap"). Off by default, a switch in Settings, Voice. While it is on
// and this tab is visible, the microphone's loudness is measured here in the browser, a few times a second, above
// the pitch of speech. Nothing is recorded, kept or sent anywhere: no words, no sound, only "two sharp sounds".

// A clap or a snap is a sharp burst well above the room's own noise that dies away within a tenth of a second.
// Two of them between 0.15 and 0.75 seconds apart, about as loud as each other, with quiet before the first and after
// the second, is a double (owner, November 19, 2026: "it pops in anytime some noise is made ... only when clapping
// happens"). Typing, footsteps and a cup put down are runs of sharp sounds or lone ones, so they never count; speech
// and music last too long to count.
export interface Detector { feed(level: number, at: number): boolean }
const QUIET_BEFORE_MS = 400;
const QUIET_AFTER_MS = 350;
export function clapDetector(options: { min?: number; over?: number } = {}): Detector {
  const min = options.min ?? 0.12, over = options.over ?? 7;
  let floor = 0.01;
  let burst: { at: number; peak: number; alone: boolean } | null = null;
  let first: { at: number; peak: number } | null = null;
  // A double heard, waiting to be sure nothing follows it; when the last sound ended; when to listen again.
  let confirm: number | null = null, ended = -Infinity, rest = -Infinity;
  return {
    feed(level, at) {
      // A burst that has gone quiet again within 140 ms is one clap; one still loud after that is a voice or a bang.
      if (burst) {
        if (level < burst.peak * 0.35) {
          const b = burst; burst = null; ended = at;
          if (at - b.at > 140) { first = null; return false; }
          const gap = first ? b.at - first.at : 0;
          if (first && gap >= 150 && gap <= 750 && Math.max(b.peak, first.peak) <= 3 * Math.min(b.peak, first.peak)) { first = null; confirm = at + QUIET_AFTER_MS; }
          else first = b.alone ? { at: b.at, peak: b.peak } : null;
        } else if (at - burst.at > 140) { burst = null; first = null; ended = at; rest = Math.max(rest, at + 250); }
        else burst.peak = Math.max(burst.peak, level);
        return false;
      }
      if (level > Math.max(min, floor * over)) {
        // More straight after a double makes it a run of sounds, not two claps.
        if (confirm !== null) { confirm = null; first = null; rest = at + 600; }
        if (at > rest) { burst = { at, peak: level, alone: at - ended >= QUIET_BEFORE_MS }; return false; }
        ended = at; first = null;
      } else if (confirm !== null && at >= confirm) { confirm = null; rest = at + 1200; return true; }
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
