// The OX wordmark, traced from design/logo/2.png. Draws in the current text colour.
export function Logo({ height = 22 }: { height?: number }) {
  return <svg className="logo" viewBox="0 0 1006 504" height={height} width={height * 1006 / 504} role="img" aria-label="OXBOT">
    <circle cx="252" cy="252" r="200" fill="none" stroke="currentColor" strokeWidth="103" />
    <g stroke="currentColor" strokeWidth="97" strokeLinecap="round">
      <path d="M573 61 670 158M957 61 860 158M670 346 573 443M860 346 957 443" />
    </g>
  </svg>;
}
