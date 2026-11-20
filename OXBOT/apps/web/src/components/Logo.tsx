import { OX_PATHS, OX_VIEWBOX } from '../taurus-face';

// Taurus's logo (owner, November 19, 2026: "the taurus logo i made like the eyes and horn"): the horn crescent over two
// eyes, from design/logo/taurus-mascot.svg. The same shape the particle orb rests in (ParticleOrb.tsx) and the app icon
// (design/logo/taurus-mark.svg). Draws in the current text colour.
export function Logo({ height = 22 }: { height?: number }) {
  return <svg className="logo" viewBox={OX_VIEWBOX} height={height} width={Math.round(height * 1138 / 857)} role="img" aria-label="Taurus">
    <g fill="currentColor" stroke="currentColor" strokeWidth="0" strokeLinejoin="round">
      <path d={OX_PATHS.hornL} strokeWidth="24" />
      <path d={OX_PATHS.hornR} strokeWidth="24" />
      <path d={OX_PATHS.eyeL} />
      <path d={OX_PATHS.eyeR} />
    </g>
  </svg>;
}
