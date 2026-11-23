import { useEffect, useRef } from 'react';

// Taurus's orb (owner, November 19, 2026: "instead of the orb in the middle make it an orb of particles but when its at
// rest it forms to the taurus logo when its talking it becomes a ball"). About 1,600 points of light. At rest they draw
// the owner's logo, the horn crescent over two eyes, and sway a little so it reads as 3D. Listening, thinking and talking pull
// them into a turning ball: listening breathes, thinking spins and swirls, talking swells with his voice.
// Plain canvas, no libraries. Stops drawing when the window is hidden or the orb is off screen; with reduced motion it
// still changes shape but hardly moves.

export type OrbState = 'rest' | 'listen' | 'think' | 'talk';

const COUNT = 1600;
const TAU = Math.PI * 2;

interface Dot { x: number; y: number; z: number; sx: number; sy: number; sz: number; ball: [number, number, number]; speed: number; phase: number; size: number }

// The owner's logo (design/logo/taurus-mascot.svg: "the taurus logo i made like the eyes and horn"): points picked
// inside the real horn crescent and the two eyes, then scaled into a box from -1 to 1 (y down). About 62% go to the
// horns and the rest to the eyes, so both read clearly.
const LOGO = {
  horns: { d: 'M477 760A547 547 0 0 0 1571 760L1449 760A425 425 0 0 1 599 760Z', box: [477, 760, 1571, 1307] },
  eyeL: { d: 'M543 1301H647A133 133 0 0 1 780 1434V1525A57 57 0 0 1 683 1563L507 1394A54 54 0 0 1 543 1301Z', box: [500, 1295, 780, 1570] },
  eyeR: { d: 'M1505 1301H1401A133 133 0 0 0 1268 1434V1525A57 57 0 0 0 1365 1563L1541 1394A54 54 0 0 0 1505 1301Z', box: [1268, 1295, 1548, 1570] },
};
const MID_X = 1024, MID_Y = 738 + 857 / 2, HALF = 1138 / 2;

function logoPoints(ctx: CanvasRenderingContext2D, rand: () => number): [number, number, number][] {
  const parts = [{ ...LOGO.horns, n: Math.round(COUNT * 0.62) }, { ...LOGO.eyeL, n: Math.round(COUNT * 0.19) }];
  parts.push({ ...LOGO.eyeR, n: COUNT - parts[0].n - parts[1].n });
  const out: [number, number, number][] = [];
  for (const part of parts) {
    const path = new Path2D(part.d);
    const [x0, y0, x1, y1] = part.box;
    for (let made = 0, tries = 0; made < part.n && tries < part.n * 40; tries++) {
      const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
      if (!ctx.isPointInPath(path, x, y)) continue;
      out.push([(x - MID_X) / HALF, (y - MID_Y) / HALF, (rand() - 0.5) * 0.1]);
      made++;
    }
  }
  while (out.length < COUNT) out.push(out[out.length % Math.max(1, out.length)] ?? [0, 0, 0]);
  return out;
}

// Evenly spread points on a ball (a Fibonacci sphere).
function ballPoint(i: number): [number, number, number] {
  const y = 1 - (i + 0.5) / COUNT * 2, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function ParticleOrb({ state, level = 0, className = '' }: { state: OrbState; level?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, level });
  const restart = useRef<() => void>(() => {});
  useEffect(() => { live.current = { state, level }; restart.current(); }, [state, level]);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const rand = seeded(19);
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const logo = logoPoints(ctx, rand);
    const dots: Dot[] = Array.from({ length: COUNT }, (_, i) => {
      const [sx, sy, sz] = logo[i];
      return { x: sx, y: sy, z: sz, sx, sy, sz, ball: ballPoint(i), speed: 2.2 + rand() * 2.6, phase: rand() * TAU, size: 0.6 + rand() * 0.9 };
    });
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now(), spin = 0, sway = 0, voice = 0, seen = true, flat = false;
    let color = '125, 232, 255';
    // A light page (the Deck, November 22, 2026) sets --orb-glow: 0 and --orb-blend: source-over, so dark dots stay crisp.
    let glowOn = 1, blend: GlobalCompositeOperation = 'lighter';

    const fit = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      const r = el.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
      const c = getComputedStyle(el).getPropertyValue('--orb-rgb').trim();
      if (c) color = c;
      const g = parseFloat(getComputedStyle(el).getPropertyValue('--orb-glow'));
      glowOn = Number.isFinite(g) ? g : 1;
      blend = getComputedStyle(el).getPropertyValue('--orb-blend').trim() === 'source-over' ? 'source-over' : 'lighter';
    };
    fit();
    // Resizing clears the canvas, so a still orb is drawn once more. The colours change with Light and Dark (November 23,
    // 2026: in Light the logo stayed light and vanished), so they are read again, and a still orb redrawn, when the theme does.
    const redraw = () => { fit(); if (el.dataset.still !== undefined) { flat = true; frame(performance.now()); flat = false; } };
    const sizer = new ResizeObserver(redraw); sizer.observe(el);
    const theme = new MutationObserver(redraw); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
    const scheme = matchMedia('(prefers-color-scheme: dark)'); scheme.addEventListener('change', redraw);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const { state: s, level: lv } = live.current;
      const still = calm.matches;
      const ballish = s !== 'rest';
      voice += ((s === 'talk' ? lv : 0) - voice) * Math.min(1, dt * 14);
      spin += dt * (still ? 0.05 : s === 'think' ? 1.5 : s === 'talk' ? 0.55 + voice * 0.8 : s === 'listen' ? 0.35 : 0);
      sway = still || flat ? 0 : Math.sin(now / 2600) * 0.32;
      const breathe = s === 'listen' && !still ? Math.sin(now / 420) * 0.035 : 0;
      const radius = 0.66 + breathe + voice * 0.14;
      const tilt = 0.38, cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const cosS = Math.cos(spin), sinS = Math.sin(spin), cosW = Math.cos(sway), sinW = Math.sin(sway);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const scale = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2;
      // A soft glow behind, brighter while he talks.
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.05);
      glow.addColorStop(0, `rgba(${color}, ${(0.1 + voice * 0.18 + (ballish ? 0.05 : 0)) * glowOn})`);
      glow.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = blend;
      ctx.fillStyle = `rgb(${color})`;

      for (const d of dots) {
        let tx: number, ty: number, tz: number;
        if (ballish) {
          const [ax, by, az] = d.ball;
          let bx = ax, bz = az;
          // Thinking: a band of the ball streams around faster than the rest.
          if (s === 'think' && !still) { const swirl = Math.sin(by * 3 + now / 300) * 0.6; const c = Math.cos(swirl), si = Math.sin(swirl); [bx, bz] = [bx * c - bz * si, bx * si + bz * c]; }
          // Talking: the surface ripples with his voice.
          const ripple = 1 + (still ? 0 : voice * 0.22 * Math.sin(d.phase * 3 + now / 90));
          const r = radius * ripple;
          const x1 = bx * cosS - bz * sinS, z1 = bx * sinS + bz * cosS;
          tx = x1 * r; ty = (by * cosT - z1 * sinT) * r; tz = (by * sinT + z1 * cosT) * r;
        } else {
          const shimmer = still || flat ? 0 : 0.012 * Math.sin(now / 700 + d.phase);
          tx = (d.sx * cosW - d.sz * sinW) * 0.6 + shimmer; ty = d.sy * 0.6 + shimmer; tz = (d.sx * sinW + d.sz * cosW) * 0.6;
        }
        const k = 1 - Math.exp(-dt * (still ? 12 : d.speed));
        d.x += (tx - d.x) * k; d.y += (ty - d.y) * k; d.z += (tz - d.z) * k;
        const persp = 2.6 / (2.6 + d.z);
        const px = cx + d.x * scale * persp, py = cy + d.y * scale * persp;
        const near = Math.max(0.15, Math.min(1, 0.6 - d.z * 0.55));
        const size = d.size * persp * (1.1 + voice * 0.6);
        // One colour for every dot and its strength through globalAlpha: building a colour string per dot per frame
        // was most of the orb's cost (owner, November 20, 2026: "my computer heats up significanrtly").
        ctx.globalAlpha = Math.min(1, near * (0.78 + voice * 0.25));
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    // How often to draw (November 20, 2026, measured on the desktop app: the orb at 60 frames a second was most of the
    // 25-35% CPU Taurus used sitting on Home). Listening, thinking and talking draw every frame. At rest the logo only
    // sways and shimmers slowly, so 20 frames a second looks the same; once the dots have settled into the logo and the
    // app is resting (no touch for 20 seconds, or out of focus), it stops drawing until something changes.
    let settledFor = 0, lastDrawn = 0;
    const loop = () => {
      cancelAnimationFrame(raf);
      const tick = (now: number) => {
        if (!seen || document.hidden) return;
        const active = live.current.state !== 'rest';
        if (active) settledFor = 0;
        // Settled into the logo at rest: one flat drawing, then the CSS sway (hud.css, .particle-orb[data-still]) turns
        // it from the same point in the sway, and nothing is drawn until Taurus listens, thinks or talks.
        if (!active && settledFor > 2.5) {
          flat = true; frame(now); flat = false;
          const at = ((now / 2600) % TAU + TAU) % TAU / TAU * 16.3;
          if (!calm.matches) { el.style.animationDelay = `-${at.toFixed(2)}s`; el.dataset.still = ''; }
          raf = 0; return;
        }
        if (active || now - lastDrawn >= 48) { if (!active) settledFor += Math.min(0.1, (now - lastDrawn) / 1000); frame(now); lastDrawn = now; }
        raf = requestAnimationFrame(tick);
      };
      last = performance.now(); lastDrawn = last - 48;
      raf = requestAnimationFrame(tick);
    };
    // Waking from rest, or a new state, starts drawing again.
    restart.current = () => {
      if (live.current.state === 'rest' && el.dataset.still !== undefined) return;
      delete el.dataset.still; settledFor = 0;
      if (!raf) loop();
    };
    const watcher = new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen && el.dataset.still === undefined) loop(); }); watcher.observe(el);
    const back = () => { if (!document.hidden && el.dataset.still === undefined) loop(); };
    document.addEventListener('visibilitychange', back);
    loop();
    return () => { cancelAnimationFrame(raf); sizer.disconnect(); theme.disconnect(); scheme.removeEventListener('change', redraw); watcher.disconnect(); restart.current = () => {}; document.removeEventListener('visibilitychange', back); };
  }, []);

  return <canvas ref={canvas} className={`particle-orb ${className}`} data-state={state} aria-hidden="true" />;
}
