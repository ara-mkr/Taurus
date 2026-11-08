import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';

// Charts in one ink. Lines are 2px, fills are a faint wash of the same ink, the
// grid is recessive and every plotted chart answers on hover with the exact value.

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const extent = (values: number[], pad = 0.08) => {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p] as const;
};

export function Sparkline({ values, height = 32, className = '' }: { values: number[]; height?: number; className?: string }) {
  const gradient = useId();
  if (values.length < 2) return null;
  const [lo, hi] = extent(values, 0.12);
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join('');
  return <svg className={`spark ${className}`} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" height={height} aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".22" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <path d={`${line}L100,${height}L0,${height}Z`} fill={`url(#${gradient})`} />
    <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}

export interface Point { t: number; v: number }

// Area chart with a crosshair and readout. `label` names the series for screen readers.
export function LineChart({ points, label, format, formatT, time = 'date', height = 160 }: { points: Point[]; label: string; format: (v: number) => string; formatT?: (t: number) => string; time?: 'date' | 'time' | 'month'; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradient = useId();
  if (points.length < 2) return <div ref={ref} className="chart-empty">Not enough points yet.</div>;
  const right = 52, bottom = 24, top = 10;
  const w = Math.max(width, 120), plotW = w - right, plotH = height - bottom - top;
  const values = points.map(p => p.v);
  const [lo, hi] = extent(values);
  const t0 = points[0].t, t1 = points.at(-1)!.t;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * plotW;
  const y = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const fmtT = (t: number) => formatT ? formatT(t) : time === 'time' ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : new Date(t).toLocaleDateString('en-US', time === 'month' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' });
  const move = (e: PointerEvent) => {
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    setHover(best);
  };
  const h = hover === null ? null : points[hover];
  const first = points[0].v, last = points.at(-1)!.v;
  return <div ref={ref} className="chart">
    <svg width={w} height={height} role="img" aria-label={`${label}: from ${format(first)} to ${format(last)}, low ${format(Math.min(...values))}, high ${format(Math.max(...values))}`} onPointerMove={move} onPointerLeave={() => setHover(null)}>
      <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".2" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      {ticks.map(v => <g key={v} className="tick"><line x1="0" x2={plotW} y1={y(v)} y2={y(v)} /><text x={plotW + 8} y={y(v) + 4}>{format(v)}</text></g>)}
      <path d={`${line}L${plotW},${top + plotH}L0,${top + plotH}Z`} fill={`url(#${gradient})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text className="axis" x="0" y={height - 6}>{fmtT(t0)}</text>
      <text className="axis" x={plotW} y={height - 6} textAnchor="end">{fmtT(t1)}</text>
      {h && <g className="cross"><line x1={x(h.t)} x2={x(h.t)} y1={top} y2={top + plotH} /><circle cx={x(h.t)} cy={y(h.v)} r="4.5" /></g>}
      <rect x="0" y="0" width={plotW} height={height} fill="transparent" />
    </svg>
    {h && <div className="readout" style={{ left: Math.min(Math.max(x(h.t), 50), plotW - 50) }}><strong>{format(h.v)}</strong><span>{fmtT(h.t)}</span></div>}
  </div>;
}

export function Bars({ items, format = String }: { items: { label: string; value: number; href?: string; note?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return <ul className="bars">
    {items.map(i => <li key={i.label} title={`${i.label}: ${format(i.value)}${i.note ? ` ${i.note}` : ''}`}>
      <span className="bar-label">{i.href ? <a href={i.href} target="_blank" rel="noreferrer">{i.label}</a> : i.label}</span>
      <span className="bar-value">{format(i.value)}{i.note && <span className="unit"> {i.note}</span>}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} /></span>
    </li>)}
  </ul>;
}

// Counts up from where it was to the new value (from zero when the card appears), so a number arrives instead of
// just being there. Under Reduce Motion it is simply the value.
function useCountUp(target: number, ms = 900) {
  const [still] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (still) return;
    const start = performance.now(), a = from.current;
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), eased = 1 - (1 - k) ** 3;
      from.current = a + (target - a) * eased;
      setShown(from.current);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, still]);
  return still ? target : shown;
}

// A gauge for a 0-100 score. The arc carries the value; the number is the label.
export function Ring({ value, size = 132, caption }: { value: number; size?: number; caption: string }) {
  const stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(100, value));
  const v = useCountUp(target);
  return <div className="gauge" style={{ width: size, height: size }} role="img" aria-label={`${caption} ${Math.round(target)} percent`}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="gauge-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      <circle className="gauge-arc" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    <div className="gauge-label"><strong>{Math.round(v)}</strong><span>{caption}</span></div>
  </div>;
}
