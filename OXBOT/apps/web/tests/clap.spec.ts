import { expect, test } from '@playwright/test';
import { clapDetector } from '../src/clap';

// Two claps or snaps start Talk (owner, November 6, 2026). The detector is fed loudness readings every 12 ms, the way
// the microphone gives them; these are made up: a quiet room, sharp bursts, a voice, a long bang.
const quiet = 0.008;
function play(detect: ReturnType<typeof clapDetector>, events: { at: number; ms: number; level: number }[], until: number) {
  const fired: number[] = [];
  for (let t = 0; t <= until; t += 12) {
    const e = events.find(x => t >= x.at && t < x.at + x.ms);
    if (detect.feed(e ? e.level : quiet, t)) fired.push(t);
  }
  return fired;
}
const clap = (at: number, level = 0.5) => ({ at, ms: 36, level });

test('two claps a third of a second apart start Talk once', () => {
  const fired = play(clapDetector(), [clap(1000), clap(1330)], 3000);
  expect(fired).toHaveLength(1);
  expect(fired[0]).toBeGreaterThan(1330);
});

test('two quieter snaps count too', () => {
  expect(play(clapDetector(), [clap(1000, 0.16), clap(1400, 0.15)], 3000)).toHaveLength(1);
});

test('one clap, claps too far apart, and too close together do nothing', () => {
  expect(play(clapDetector(), [clap(1000)], 3000)).toEqual([]);
  expect(play(clapDetector(), [clap(1000), clap(2000)], 3000)).toEqual([]);
  expect(play(clapDetector(), [clap(1000), clap(1100)], 3000)).toEqual([]);
});

test('talking, music and a long bang never count', () => {
  // A voice above the filter: loud for 400 ms at a time, twice.
  expect(play(clapDetector(), [{ at: 1000, ms: 400, level: 0.4 }, { at: 1500, ms: 400, level: 0.4 }], 3000)).toEqual([]);
  // A door slam that rings on for 300 ms, then a clap.
  expect(play(clapDetector(), [{ at: 1000, ms: 300, level: 0.8 }, clap(1500)], 3000)).toEqual([]);
});

// November 19, 2026: "it pops in anytime some noise is made".
test('three or more sharp sounds in a row are a run of noise, not a double', () => {
  expect(play(clapDetector(), [clap(1000), clap(1300), clap(1600), clap(1900)], 3000)).toEqual([]);
  expect(play(clapDetector(), [clap(1000), clap(1300), clap(1600)], 3000)).toEqual([]);
});

test('typing never counts, and a double clap after the typing stops still does', () => {
  const typing = Array.from({ length: 20 }, (_, i) => ({ at: 1000 + i * 180, ms: 24, level: 0.4 }));
  expect(play(clapDetector(), typing, 5000)).toEqual([]);
  const fired = play(clapDetector(), [...typing, clap(6000), clap(6350)], 8000);
  expect(fired).toHaveLength(1);
  expect(fired[0]).toBeGreaterThan(6350);
});

test('a sound straight before the first clap, or two very different sounds, do nothing', () => {
  expect(play(clapDetector(), [{ at: 800, ms: 24, level: 0.4 }, clap(1000), clap(1350)], 3000)).toEqual([]);
  expect(play(clapDetector(), [clap(1000, 0.9), clap(1350, 0.15)], 3000)).toEqual([]);
});

test('a second double a moment later starts it again', () => {
  expect(play(clapDetector(), [clap(1000), clap(1330), clap(4000), clap(4330)], 6000)).toHaveLength(2);
});

test('a noisy room needs a louder clap', () => {
  const noisy = Array.from({ length: 80 }, (_, i) => ({ at: i * 12, ms: 12, level: 0.05 }));
  // Claps at 0.2 sit only four times above a 0.05 room: not enough.
  expect(play(clapDetector(), [...noisy, ...[1000, 1012, 1024, 1036].map(at => ({ at, ms: 12, level: 0.2 }))], 1200)).toEqual([]);
});
