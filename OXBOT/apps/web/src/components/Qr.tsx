import { useMemo } from 'react';
import { encode } from 'uqr';

// A QR code drawn as one SVG path, always dark on white so any phone camera reads it in dark mode too.
export function Qr({ value, label, size = 196 }: { value: string; label: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 3 });
    let path = '';
    qr.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x} ${y}h1v1h-1z`; }));
    return { d: path, n: qr.size };
  }, [value]);
  return <svg className="qr" role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges">
    <rect width={n} height={n} fill="#fff" />
    <path d={d} fill="#111" />
  </svg>;
}
