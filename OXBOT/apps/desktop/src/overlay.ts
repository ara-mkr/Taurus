export {};

// Draws the helpers working on this screen (owner, November 5, 2026: "travel through the different screens pull up
// tabs"). Each one arrives from the side facing Taurus's own screen, flies to a card showing the picture of its page in
// Taurus's browser, points where it is reading, and heads back the way it came when it is done. Draw only: the window
// can't be clicked and this script reaches nothing; everything comes from the main process.

interface Helper { id: string; n: number; name: string; colour: string; doing: string; state: string; host?: string; title?: string; label?: string; point?: { x: number; y: number }; act?: string; moves: number }
interface Swarm { id: string; state: string; helpers: Helper[]; width: number; height: number }
interface Hello { index: number; others: number; toHome: { dx: number; dy: number }; swarm: Swarm | null; frames: Record<string, string> }
interface Body { x: number; y: number; vx: number; vy: number; o: number; moves: number; loud: number }

const overlay = (window as unknown as { taurusOverlay: { on(cb: (m: { event: string; data: unknown }) => void): void } }).taurusOverlay;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const screenFor = (n: number, others: number) => (others ? ((n - 1) % (others + 1)) - 1 : -1);
const atWork = (s: string) => s === 'opening' || s === 'working';
const WINDOW = 11 / 16;

let me: Omit<Hello, 'swarm' | 'frames'> | null = null;
let swarm: Swarm | null = null;
const frames: Record<string, string> = {};
const cards = new Map<string, HTMLElement>();
const cursors = new Map<string, HTMLElement>();
const bodies = new Map<string, Body>();
let top = 1;

const mine = () => (swarm && me ? swarm.helpers.filter(h => screenFor(h.n, me!.others) === me!.index) : []);
// Just past this screen's edge on the side facing Taurus's screen: where helpers come in and leave.
function door() {
  const { dx, dy } = me?.toHome ?? { dx: -1, dy: 0 };
  const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, cx = innerWidth / 2, cy = innerHeight / 2;
  const tx = ux > 0 ? (innerWidth + 60 - cx) / ux : ux < 0 ? (-60 - cx) / ux : Infinity;
  const ty = uy > 0 ? (innerHeight + 60 - cy) / uy : uy < 0 ? (-60 - cy) / uy : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + ux * t, y: cy + uy * t };
}
const pan = (h: Helper) => {
  const shown = WINDOW / ((swarm?.height ?? 1000) / (swarm?.width ?? 800));
  return Math.max(0, Math.min(1 - shown, (h.point?.y ?? 0) / (swarm?.height ?? 1000) - shown / 2));
};

function text(el: HTMLElement, value: string) { if (el.textContent !== value) el.textContent = value; }

function render() {
  const working = mine().filter(h => atWork(h.state));
  const cols = Math.max(1, Math.ceil(Math.sqrt(working.length)));
  const rows = Math.max(1, Math.ceil(working.length / cols));
  const width = Math.min(440, (innerWidth - 120) / cols - 40);
  const height = width * WINDOW + 58;
  const left = (innerWidth - cols * (width + 40) + 40) / 2, topY = (innerHeight - rows * (height + 40) + 40) / 2;
  // Cards: one per helper at work here, laid out in a grid in the middle of the screen.
  for (const [id, card] of cards) if (!working.some(h => h.id === id)) { card.classList.remove('in'); cards.delete(id); setTimeout(() => card.remove(), 400); }
  working.forEach((h, i) => {
    let card = cards.get(h.id);
    if (!card) {
      const fresh = document.createElement('div');
      fresh.className = 'card';
      fresh.innerHTML = '<div class="page"><span class="wait"></span></div><p><b></b> <span></span></p>';
      document.body.prepend(fresh);
      cards.set(h.id, fresh);
      requestAnimationFrame(() => fresh.classList.add('in'));
      card = fresh;
    }
    card.style.setProperty('--c', h.colour);
    Object.assign(card.style, { left: `${left + (i % cols) * (width + 40)}px`, top: `${topY + Math.floor(i / cols) * (height + 40)}px`, width: `${width}px` });
    text(card.querySelector('b')!, h.name);
    text(card.querySelector<HTMLElement>('p span')!, h.title ? `${h.host} · ${h.title}` : h.host ?? h.label ?? '');
    const page = card.querySelector<HTMLElement>('.page')!;
    const shot = frames[h.id];
    let img = page.querySelector('img');
    if (shot) {
      if (!img) { img = document.createElement('img'); img.alt = ''; page.querySelector('.wait')?.remove(); page.append(img); }
      if (img.src !== shot) img.src = shot;
      img.style.transform = `translateY(${(-pan(h) * 100).toFixed(2)}%)`;
    } else text(page.querySelector<HTMLElement>('.wait') ?? page, h.host ?? 'Opening');
  });
  // Cursors: one per helper that works on this screen.
  for (const h of mine()) {
    let el = cursors.get(h.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'cursor';
      el.innerHTML = '<svg width="22" height="24" viewBox="0 0 22 24"><path d="M3.2 2.4C2.5 1.9 1.7 2.5 1.9 3.3Q3.8 11.3 5.2 19.9C5.4 21 6.8 21.3 7.4 20.3L10.9 14.9C11.3 14.3 11.9 13.9 12.6 13.8L18.6 12.9C19.7 12.7 20 11.3 19 10.7Q10.8 7.1 3.2 2.4Z" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/></svg><span class="tag"><span class="name"></span><span class="doing"></span></span>';
      document.body.append(el);
      cursors.set(h.id, el);
    }
    el.style.setProperty('--c', h.colour);
    el.querySelector('path')!.setAttribute('fill', h.colour);
    text(el.querySelector<HTMLElement>('.name')!, h.name);
    text(el.querySelector<HTMLElement>('.doing')!, ` · ${h.doing}`);
  }
}

let last = performance.now();
function tick(t: number) {
  requestAnimationFrame(tick);
  const elapsed = Math.min(0.25, Math.max(0, (t - last) / 1000));
  last = t;
  if (!swarm) return;
  const exit = door();
  for (const h of mine()) {
    const el = cursors.get(h.id);
    if (!el) continue;
    let b = bodies.get(h.id);
    if (!b) { b = { x: exit.x, y: exit.y, vx: 0, vy: 0, o: 0, moves: h.moves, loud: 0 }; bodies.set(h.id, b); }
    const page = cards.get(h.id)?.querySelector('.page')?.getBoundingClientRect();
    let target = exit;
    if (atWork(h.state) && page?.width) {
      const p = h.point ?? { x: swarm.width / 2, y: swarm.height * 0.3 };
      target = { x: page.left + (p.x / swarm.width) * page.width, y: page.top + (p.y / swarm.height - pan(h)) * page.width * (swarm.height / swarm.width) };
    }
    if (h.moves !== b.moves) { b.moves = h.moves; if (h.act === 'click' || h.state === 'opening') { b.loud = t + 1700; el.style.zIndex = String(++top); } }
    if (reduce) {
      b.x = target.x; b.y = target.y;
      b.o += ((target === exit ? 0 : 1) - b.o) * Math.min(1, elapsed * 6);
    } else {
      for (let left = elapsed; left > 0; left -= 1 / 120) {
        const dt = Math.min(1 / 120, left), k = 120 + (h.n % 5) * 12, c = 2 * Math.sqrt(k) * 0.6;
        b.vx += (k * (target.x - b.x) - c * b.vx) * dt;
        b.vy += (k * (target.y - b.y) - c * b.vy) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
      }
      const inside = b.x > -30 && b.x < innerWidth + 30 && b.y > -30 && b.y < innerHeight + 30;
      b.o += ((inside ? 1 : 0) - b.o) * Math.min(1, elapsed * 8);
    }
    const travelling = Math.hypot(target.x - b.x, target.y - b.y) > 48;
    el.dataset.tag = target === exit ? (travelling ? 'full' : 'none') : travelling || t < b.loud ? 'full' : 'name';
    el.dataset.x = b.x.toFixed(0); el.dataset.y = b.y.toFixed(0);
    el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`;
    el.style.setProperty('--lean', `${reduce ? 0 : Math.max(-16, Math.min(16, b.vx * 0.012)).toFixed(1)}deg`);
    el.style.opacity = b.o.toFixed(3);
  }
}
requestAnimationFrame(tick);

overlay.on(({ event, data }) => {
  if (event === 'hello') {
    const hello = data as Hello;
    me = { index: hello.index, others: hello.others, toHome: hello.toHome };
    swarm = hello.swarm;
    Object.assign(frames, hello.frames);
  } else if (event === 'swarm') {
    const next = data as Swarm | null;
    if (!next || next.id !== swarm?.id) {
      for (const k of Object.keys(frames)) delete frames[k];
      for (const el of [...cursors.values(), ...cards.values()]) el.remove();
      cursors.clear(); cards.clear(); bodies.clear();
    }
    swarm = next;
  } else if (event === 'helper' && swarm) {
    const h = data as Helper;
    swarm.helpers = swarm.helpers.map(x => (x.id === h.id ? h : x));
  } else if (event === 'frame') {
    const f = data as { id: string; frame: string };
    frames[f.id] = f.frame;
  }
  render();
});
