import { CHARGE_IN_MS, CHARGE_OUT_MS, oxFace, oxMarkup, type Expression } from '../../web/src/ox-face';

// Ox anywhere (November 16, 2026; docs/21-ox-anywhere.md): draws Ox over whatever app is in front. His face is the
// same driver as the web app's <Ox> (apps/web/src/ox-face.ts). Draw only: this page reaches nothing; the main process
// tells it when to come and go, what he heard and answered, and where the mouse is.

type Message = { kind: 'summon' } | { kind: 'dismiss' } | { kind: 'look'; x: number; y: number }
  | { kind: 'phase'; phase: 'listening' | 'thinking' | 'answer' | 'error'; said: string; text: string };

const bridge = (window as unknown as { oxAnywhere: { on(cb: (m: Message) => void): void } }).oxAnywhere;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const runner = document.getElementById('runner')!;
const bubble = document.getElementById('bubble')!;
runner.innerHTML = oxMarkup();
const svg = runner.querySelector('svg')!;
// Asleep while the window waits hidden: a listening Ox moved his horns 60 times a second in a window nobody could see
// (owner, November 18, 2026). Summoning wakes him.
const face = oxFace(svg, { expression: 'sleep', reduce });
// Put away, he doesn't even breathe (ox-face.ts rests a calm face on <html data-resting>).
const rest = (on: boolean) => { if (on) document.documentElement.dataset.resting = 'true'; else delete document.documentElement.dataset.resting; };
rest(true);
const ease = { out: 'cubic-bezier(0.23, 1, 0.32, 1)', inOut: 'cubic-bezier(0.77, 0, 0.175, 1)' };

let phase = '';
let travel: Animation | null = null;
let shownText = '';

function expression(next: Expression) { face.set(next); document.body.dataset.expression = next; }

// The words, quickly: each fades in a few milliseconds after the last, the whole answer within half a second.
function say(text: string, muted = false) {
  if (text === shownText && bubble.dataset.muted === String(muted)) return;
  shownText = text;
  bubble.dataset.muted = String(muted);
  bubble.replaceChildren();
  const parts = text.split(/(\s+)/).filter(Boolean);
  const step = Math.min(18, 500 / Math.max(1, parts.length / 2));
  let n = 0;
  for (const w of parts) {
    if (/^\s+$/.test(w)) { bubble.append(w); continue; }
    const span = document.createElement('span');
    span.textContent = w;
    if (!reduce) span.style.animationDelay = `${Math.round(n++ * step)}ms`;
    bubble.append(span);
  }
  bubble.classList.toggle('in', Boolean(text));
}

function summon() {
  document.body.dataset.state = 'in';
  rest(false);
  shownText = ''; bubble.classList.remove('in'); bubble.replaceChildren();
  expression('listening');
  travel?.cancel();
  // He charges in from the screen's right edge, leaning into the run, and eases out to a stop.
  travel = reduce
    ? runner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out', fill: 'both' })
    : runner.animate([{ transform: 'translateX(190px)', opacity: 0 }, { opacity: 1, offset: 0.18 }, { transform: 'translateX(0)', opacity: 1 }], { duration: CHARGE_IN_MS, easing: ease.out, fill: 'both' });
  void face.play('charge-in', -1);
}

function dismiss() {
  document.body.dataset.state = 'out';
  bubble.classList.remove('in');
  travel?.cancel();
  // Out the way he came, quicker than he arrived.
  travel = reduce
    ? runner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'both' })
    : runner.animate([{ transform: 'translateX(0)', opacity: 1 }, { opacity: 1, offset: 0.75 }, { transform: 'translateX(220px)', opacity: 0 }], { duration: CHARGE_OUT_MS, easing: ease.inOut, fill: 'both' });
  void face.play('charge-out', 1).then(() => { if (document.body.dataset.state === 'out') { expression('sleep'); rest(true); } });
  phase = '';
}

bridge.on(m => {
  if (m.kind === 'summon') summon();
  else if (m.kind === 'dismiss') dismiss();
  else if (m.kind === 'look') {
    const r = svg.getBoundingClientRect();
    face.look(m.x - (r.left + r.width / 2), m.y - (r.top + r.height * 0.75));
  } else if (m.kind === 'phase') {
    const was = phase;
    phase = m.phase;
    document.body.dataset.phase = phase;
    if (phase === 'listening') { expression('listening'); say(m.said || m.text || 'Listening.', !m.said && !m.text); }
    else if (phase === 'thinking') {
      say(`“${m.said}”`, true);
      // Understood: a quick nod, then he works on it.
      if (was !== 'thinking') void face.play('nod').then(() => { if (phase === 'thinking') expression('thinking'); });
    } else if (phase === 'answer') { expression('idle'); say(m.text); }
    else if (phase === 'error') { expression('confused'); say(m.text || 'That didn’t work.'); }
  }
});
