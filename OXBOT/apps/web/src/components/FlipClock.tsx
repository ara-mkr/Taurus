import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../styles/flip.css';

// The standby clock (owner, November 6, 2026: "the apple flip clock looking thing like the pic iattatched and like the
// panels that flip r liquid glass things with big bold white text"). Two liquid-glass panels, hours and minutes, over
// Hud's sky blurred soft. When a number changes its panel flips like a split-flap: the old top half falls away and
// the new bottom half swings down into place. Side by side on a wide screen, one above the other on a phone held
// upright. Under Reduce Motion the numbers just change. Revised the same evening ("taller numbers like just like the
// apple one taking up the entire screen"): the panels fill the screen and each number is as tall as its panel allows.

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    // Tick on the second boundary so the minute flips when the Mac's clock does.
    const next = () => { setNow(new Date()); timer = window.setTimeout(next, 1000 - (Date.now() % 1000) + 5); };
    timer = window.setTimeout(next, 1000 - (Date.now() % 1000) + 5);
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

function Leaf({ value, label, corner }: { value: string; label: string; corner?: string }) {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState(value);
  const [flipping, setFlipping] = useState(0);
  // A new number starts a flip right away, during render, so the old half never shows a frame late.
  if (value !== shown) {
    setPrev(shown); setShown(value);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setFlipping(f => f + 1);
  }
  useEffect(() => {
    if (!flipping) return;
    const t = window.setTimeout(() => setFlipping(0), 900);
    return () => window.clearTimeout(t);
  }, [flipping]);
  const digits = (v: string) => <span className="flip-digits"><span>{v}</span></span>;
  return <div className="flip-panel" role="img" aria-label={label}>
    <div className="flip-glass" aria-hidden="true" />
    {corner && <span className="flip-corner" aria-hidden="true">{corner}</span>}
    {/* The resting card: the new top half above, the old bottom half below until the flap covers it. */}
    <div className="flip-half flip-top" aria-hidden="true">{digits(shown)}</div>
    <div className="flip-half flip-bottom" aria-hidden="true">{digits(flipping ? prev : shown)}</div>
    {flipping > 0 && <>
      <div key={`a${flipping}`} className="flip-half flip-top flip-fall" aria-hidden="true">{digits(prev)}</div>
      <div key={`b${flipping}`} className="flip-half flip-bottom flip-land" aria-hidden="true">{digits(shown)}</div>
    </>}
    <span className="flip-hinge" aria-hidden="true" />
  </div>;
}

export function FlipClock() {
  const now = useNow();
  const h24 = now.getHours();
  const hours = String(h24 % 12 || 12);
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const meridiem = h24 < 12 ? 'AM' : 'PM';
  // How wide two digits are in this font, in em. SF Pro draws them narrow (its compressed width) and the numbers grow
  // taller; a font without a narrow width keeps its own, and the numbers shrink to fit instead of spilling out.
  const clockRef = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    // Only a believable reading counts: before the stylesheet arrives the span is as wide as the whole panel, and
    // that once shrank the numbers to a sliver (owner, November 6, 2026: "why r they letters so small").
    const fit = () => {
      const el = measure.current;
      if (!el || getComputedStyle(el).position !== 'absolute') return;
      const two = el.getBoundingClientRect().width / 100;
      if (two > 0.5 && two < 2) clockRef.current?.style.setProperty('--two', two.toFixed(3));
    };
    fit();
    // Again whenever the font settles or changes.
    const watch = new ResizeObserver(fit);
    if (measure.current) watch.observe(measure.current);
    return () => watch.disconnect();
  }, []);
  return <div className="flip-clock" ref={clockRef}>
    <span className="flip-measure" ref={measure} aria-hidden="true">00</span>
    <Leaf value={hours} label={`${hours} ${meridiem}`} corner={meridiem} />
    <Leaf value={minutes} label={`${minutes} minutes`} />
  </div>;
}
