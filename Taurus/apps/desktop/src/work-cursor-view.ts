type Point = { x: number; y: number };
type CursorMessage = { kind: 'start' | 'point' | 'finish'; name?: string; colour?: string; app?: string; status?: string; point?: Point; origin?: Point };
const bridge = (window as unknown as { taurusWorkCursor: { on(cb: (data: CursorMessage) => void): void } }).taurusWorkCursor;
const cursor = document.querySelector<HTMLElement>('#cursor')!;
const label = document.querySelector<HTMLElement>('#label')!;
const status = document.querySelector<HTMLElement>('#status')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let origin: Point = { x: 0, y: 0 }, from = origin, at = origin, target = origin;
let phase: 'idle' | 'arriving' | 'working' | 'leaving' = 'idle';
let started = 0, frame = 0;
function tick(t: number) {
  frame = 0;
  if (phase === 'idle') return;
  if (phase === 'arriving' || phase === 'leaving') {
    const progress = Math.min(1, (t - started) / (reduced ? 1 : phase === 'arriving' ? 200 : 420));
    const ease = 1 - (1 - progress) ** 3;
    const dest = phase === 'leaving' ? origin : target;
    at = { x: from.x + (dest.x - from.x) * ease, y: from.y + (dest.y - from.y) * ease };
    cursor.style.opacity = String(phase === 'leaving' ? 1 - progress : Math.min(1, progress * 3));
    if (progress === 1) phase = phase === 'leaving' ? 'idle' : 'working';
  } else at = target;
  cursor.style.transform = `translate3d(${at.x}px,${at.y}px,0)`;
  // Keep the label on screen even for windows against the right or bottom edge.
  label.style.left = at.x > innerWidth - 340 ? '-310px' : '22px';
  label.style.top = at.y > innerHeight - 70 ? '-28px' : '24px';
  cursor.dataset.phase = phase;
  if (phase === 'arriving' || phase === 'leaving') frame = requestAnimationFrame(tick);
}
const draw = () => { if (!frame) frame = requestAnimationFrame(tick); };
bridge.on(data => {
  if (data.kind === 'start' && data.origin && data.point) {
    origin = data.origin; from = origin; at = origin; target = data.point;
    document.querySelector('#name')!.textContent = data.name ?? 'Taurus';
    cursor.style.setProperty('--colour', /^#[a-f0-9]{6}$/i.test(data.colour ?? '') ? data.colour! : '#a9d6ff');
    status.textContent = `Working in ${data.app ?? 'your app'} · Esc to stop`;
    phase = 'arriving'; started = performance.now(); draw();
  } else if (data.kind === 'point' && data.point && phase !== 'idle' && phase !== 'leaving') {
    if (data.origin) origin = data.origin;
    target = data.point; draw();
  } else if (data.kind === 'finish' && phase !== 'idle') {
    status.textContent = data.status ?? 'Finished';
    from = at; phase = 'leaving'; started = performance.now(); draw();
  }
});
export {};
