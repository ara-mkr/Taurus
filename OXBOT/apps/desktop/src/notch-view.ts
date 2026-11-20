import type { NotchSettings, NotchState } from './notch-settings';

// Taurus in the notch, the page (November 6, 2026). Closed, it is a black pill around the camera with Taurus on one side and
// what he is doing on the other. Hovered (or clicked, by setting), it opens downward into a small assistant. All text
// from Taurus goes in as text, never as markup. Clicks fall through the window everywhere but the pill.

interface Bridge {
  onState(cb: (s: NotchState) => void): void; onCommand(cb: (c: string) => void): void;
  hit(on: boolean): void; focus(): void; openDashboard(): void;
  ask(text: string): Promise<{ text: string } | { error: string }>; say(text: string): Promise<{ text: string } | { error: string }>;
  save(partial: unknown): Promise<NotchSettings>;
}
const bridge = (window as unknown as { taurusNotch: Bridge }).taurusNotch;
const $ = (id: string) => document.getElementById(id)!;
const notch = $('notch'), left = $('left'), right = $('right'), panel = $('panel');
const root = document.documentElement.style;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let state: NotchState | null = null;
let open = false, view: 'main' | 'settings' = 'main', inside = false, asking = false, problem = '';
let hoverTimer = 0, closeTimer = 0, lastAnswerAt = '', lastNewsAt = '';
// Each part is redrawn only when what it shows has changed: nothing is swapped out under a click or a drag, and Taurus's
// listening animation isn't restarted every second.
const drawn = new Map<string, string>();
const changed = (part: string, ...what: unknown[]) => { const sig = JSON.stringify(what); if (drawn.get(part) === sig) return false; drawn.set(part, sig); return true; };

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {}, ...kids: (Node | string | null | false)[]) {
  const el = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(el, rest);
  if (dataset) Object.assign(el.dataset, dataset);
  for (const k of kids) if (k) el.append(k);
  return el;
}

// Taurus: two eyes under the horn crescent, from design/logo/taurus-mascot.svg (Taurus's own mark).
function taurus() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '455 738 1138 857'); svg.setAttribute('class', 'taurus'); svg.setAttribute('aria-hidden', 'true');
  const path = (d: string, cls: string) => { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('class', cls); p.setAttribute('fill', 'currentColor'); return p; };
  svg.append(
    path('M477 760A547 547 0 0 0 1024 1307L1024 1185A425 425 0 0 1 599 760Z', 'horn'),
    path('M1571 760A547 547 0 0 1 1024 1307L1024 1185A425 425 0 0 0 1449 760Z', 'horn'),
    path('M543 1301H647A133 133 0 0 1 780 1434V1525A57 57 0 0 1 683 1563L507 1394A54 54 0 0 1 543 1301Z', 'eye'),
    path('M1505 1301H1401A133 133 0 0 0 1268 1434V1525A57 57 0 0 0 1365 1563L1541 1394A54 54 0 0 0 1505 1301Z', 'eye'),
  );
  return svg;
}

const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const recent = (at?: string, ms = 12_000) => Boolean(at) && Date.now() - Date.parse(at!) < ms;
// Listening and thinking out loud belong to Taurus at the bottom of the screen, not the notch (owner, November 19, 2026:
// "why does it also say listening the taurus is alr chilling at the bottom"). The notch thinks only for a question typed
// into it.
function phase(): 'thinking' | 'answer' | 'error' | 'idle' {
  const v = state?.voice;
  if (asking) return 'thinking';
  if (v && (v.phase === 'answer' || v.phase === 'error') && recent(v.at)) return v.phase;
  return 'idle';
}
// What's new, while it still is.
const news = () => { const n = state?.news; return n && recent(n.at, 120_000) ? n : null; };
// An answer that is a list ("show me my to-do list") is worth popping open for; a plain spoken answer is not.
const listy = (text?: string) => (text ?? '').split('\n').filter(line => /^\s*(?:[-•*]|\d+[.)])\s+\S/.test(line)).length >= 2;
const timers = () => (state?.timers ?? []).filter(t => Date.parse(t.endsAt) > Date.now() - 60_000).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
// The short word beside the camera.
function status(): string {
  if (state && !state.connected) return '';
  if (phase() === 'thinking') return 'Thinking';
  const t = timers()[0];
  if (t && state?.settings.show.timers) return clock(Date.parse(t.endsAt) - Date.now());
  if (state?.music?.playing && state.settings.show.music) return 'Playing';
  return '';
}
function busy() { return phase() !== 'idle' || status() !== ''; }

// ---------- Drawing ----------

function bar() {
  const s = state!.settings;
  const word = open ? (state!.connected ? (status() || 'Ready') : 'Not running') : status();
  const mascot = !open && s.idle === 'nothing' && !busy() ? null : taurus();
  const label = word ? h('span', { className: `status ${phase() !== 'idle' ? 'live' : ''}`, textContent: word }) : null;
  const [a, b] = s.mascotSide === 'left' ? [mascot, label] : [label, mascot];
  if (changed('bar', open, s.mascotSide, Boolean(mascot), word, phase())) {
    left.replaceChildren(...[a].filter(Boolean) as Node[]);
    right.replaceChildren(...[b].filter(Boolean) as Node[]);
  }
  // Both wings as wide as the wider one, so the camera stays in the middle.
  if (!open) {
    const w = Math.max(left.firstElementChild?.getBoundingClientRect().width ?? 0, right.firstElementChild?.getBoundingClientRect().width ?? 0);
    root.setProperty('--wing', w ? `${Math.ceil(w + 26)}px` : '0px');
  }
}

const answerBox = h('div', { className: 'said-box' });
const musicBox = h('div');
const timerBox = h('div');
const input = h('input', { type: 'text', placeholder: 'Ask Taurus', maxLength: 500, ariaLabel: 'Ask Taurus' });
const askForm = h('form', { className: 'ask' }, input);
const foot = h('div', { className: 'foot' },
  h('button', { type: 'button', className: 'link', textContent: 'Open Taurus', onclick: () => bridge.openDashboard() }),
  h('button', { type: 'button', className: 'link', textContent: 'Settings', onclick: () => { view = 'settings'; draw(); } }));
const main = h('div', { className: 'main' });
main.style.display = 'grid'; main.style.gap = '14px';
main.append(answerBox, musicBox, timerBox, askForm, foot);
const settingsBox = h('div');

function drawAnswer() {
  const s = state!.settings, v = state!.voice, p = phase(), n = news();
  // The news, unless an answer came after it.
  const newsFirst = n && !(s.show.answer && v?.text && (v.phase === 'answer' || v.phase === 'error') && Date.parse(v.at) > Date.parse(n.at));
  if (!changed('answer', state!.connected, problem, p, s.show, v, newsFirst ? n : null)) return;
  const kids: Node[] = [];
  if (!state!.connected) kids.push(h('p', { className: 'answer problem', textContent: 'Taurus isn’t running. Open it and Taurus is back.' }));
  else if (problem) kids.push(h('p', { className: 'answer problem', textContent: problem }));
  else if (p === 'thinking') kids.push(h('p', { className: 'answer quiet', textContent: 'Thinking.' }));
  else if (n && newsFirst) {
    kids.push(h('p', { className: 'said', textContent: n.title }));
    if (n.text) kids.push(h('p', { className: 'answer news', textContent: n.text }));
  } else if (s.show.answer && v?.text && (v.phase === 'answer' || v.phase === 'error')) {
    if (v.said) kids.push(h('p', { className: 'said', textContent: `“${v.said}”` }));
    kids.push(h('p', { className: `answer ${v.phase === 'error' ? 'problem' : ''}`, textContent: v.text }));
  }
  // Nothing to say: no filler line, just the Ask box.
  answerBox.replaceChildren(...kids);
}
function drawMusic() {
  const m = state!.music;
  if (!changed('music', m, state!.settings.show.music)) return;
  if (!m || !state!.settings.show.music) { musicBox.replaceChildren(); return; }
  musicBox.replaceChildren(h('div', { className: 'row' },
    h('div', { className: 'what' }, h('b', { textContent: m.title }), m.artist ? h('span', { textContent: ` · ${m.artist}` }) : null),
    h('button', { type: 'button', className: 'word', textContent: m.playing ? 'Pause' : 'Play', onclick: () => void act(m.playing ? 'pause' : 'resume') }),
    h('button', { type: 'button', className: 'word', textContent: 'Next', onclick: () => void act('next') })));
}
// Rows are kept and only their countdown changes each second, so a Cancel button is never swapped out under a click.
const timerRows = new Map<string, { row: HTMLElement; time: HTMLElement }>();
function drawTimers() {
  const list = state!.settings.show.timers ? timers() : [];
  for (const [id, r] of timerRows) if (!list.some(t => t.id === id)) { r.row.remove(); timerRows.delete(id); }
  list.forEach((t, i) => {
    let r = timerRows.get(t.id);
    if (!r) {
      const time = h('span', { className: 'time' });
      const words = `cancel the ${(t.focus ? 'focus' : t.label).toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60) || 'timer'} timer`;
      const row = h('div', { className: 'row', dataset: { timer: t.id } }, h('div', { className: 'what', textContent: t.focus ? 'Focus' : t.label }), time,
        h('button', { type: 'button', className: 'word', textContent: 'Cancel', onclick: () => void act(words) }));
      r = { row, time };
      timerRows.set(t.id, r);
    }
    const left = Date.parse(t.endsAt) - Date.now();
    const text = left <= 0 ? 'Done' : clock(left);
    if (r.time.textContent !== text) r.time.textContent = text;
    if (timerBox.children[i] !== r.row) timerBox.insertBefore(r.row, timerBox.children[i] ?? null);
  });
}

// One control for a setting: a few words to pick from, a switch, or a slider.
function seg<T extends string | boolean>(name: string, value: T, options: [T, string][], set: (v: T) => Partial<NotchSettings>) {
  return h('div', { className: 'setting' }, h('span', { textContent: name }),
    h('span', { className: 'seg', role: 'group', ariaLabel: name }, ...options.map(([v, label]) =>
      h('button', { type: 'button', textContent: label, ariaPressed: String(v === value), onclick: () => void save(set(v)) }))));
}
const onOff = (name: string, value: boolean, set: (v: boolean) => Partial<NotchSettings>) => seg(name, value, [[true, 'On'], [false, 'Off']], set);
function slider(name: string, value: number, min: number, max: number, step: number, unit: string, set: (v: number) => Partial<NotchSettings>) {
  const out = h('span', { className: 'status', textContent: `${value} ${unit}` });
  const range = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), ariaLabel: name });
  range.oninput = () => { out.textContent = `${range.value} ${unit}`; };
  range.onchange = () => void save(set(Number(range.value)));
  const pair = h('span', {}, out, range);
  pair.style.cssText = 'display:flex;align-items:center;gap:10px';
  return h('div', { className: 'setting' }, h('span', { textContent: name }), pair);
}
function drawSettings() {
  const s = state!.settings, show = (k: keyof NotchSettings['show']) => (v: boolean) => ({ show: { ...s.show, [k]: v } });
  if (!changed('settings', s) && settingsBox.firstChild) return;
  const scroll = settingsBox.querySelector('.settings')?.scrollTop ?? 0;
  const list = h('div', { className: 'settings' },
    h('p', { className: 'group', textContent: 'Behaviour' }),
    onOff('Taurus in the notch', s.on, v => ({ on: v })),
    seg('Display', s.display, [['automatic', 'Automatic'], ['builtin', 'Built-in'], ['main', 'Main'], ['all', 'All']], v => ({ display: v })),
    seg('Opens', s.open, [['hover', 'On hover'], ['click', 'On click']], v => ({ open: v })),
    slider('Open after', s.hoverDelay, 0, 1000, 50, 'ms', v => ({ hoverDelay: v })),
    slider('Close after', s.closeDelay, 0, 2000, 50, 'ms', v => ({ closeDelay: v })),
    onOff('Over full-screen apps', s.overFullScreen, v => ({ overFullScreen: v })),
    onOff('In screenshots and recordings', s.inCaptures, v => ({ inCaptures: v })),
    h('p', { className: 'group', textContent: 'Look' }),
    seg('Size', s.size, [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']], v => ({ size: v })),
    seg('Taurus sits', s.mascotSide, [['left', 'Left'], ['right', 'Right']], v => ({ mascotSide: v })),
    seg('While idle', s.idle, [['taurus', 'Show Taurus'], ['nothing', 'Just the notch']], v => ({ idle: v })),
    h('p', { className: 'group', textContent: 'What appears' }),
    onOff('Taurus’s answer', s.show.answer, show('answer')),
    onOff('Now playing', s.show.music, show('music')),
    onOff('Timers', s.show.timers, show('timers')),
    onOff('Ask box', s.show.ask, show('ask')),
    h('p', { className: 'group', textContent: 'Fit' }),
    slider('Notch width', s.fitWidth, 150, 260, 2, 'pt', v => ({ fitWidth: v })),
    seg('Screens without a notch', s.noNotch === 'hidden' ? 'none' : (s.native as { shape?: string } | undefined)?.shape === 'notch' ? 'notch' : 'pill',
      [['pill', 'Pill'], ['notch', 'Notch'], ['none', 'Nothing']],
      v => (v === 'none' ? { noNotch: 'hidden' } : { noNotch: 'pill', native: { ...(s.native ?? {}), shape: v === 'notch' ? 'notch' : 'capsule' } })),
    slider('Distance from top', s.dropFromTop, 0, 24, 1, 'pt', v => ({ dropFromTop: v })));
  settingsBox.replaceChildren(list, h('div', { className: 'foot' },
    h('span', { className: 'status', textContent: 'Saved as you change them.' }),
    h('button', { type: 'button', className: 'link', textContent: 'Done', onclick: () => { view = 'main'; draw(); } })));
  list.scrollTop = scroll;
}

function draw() {
  if (!state) return;
  const g = state.geometry, s = state.settings;
  root.setProperty('--nw', `${g.notch ? g.notchWidth : 64}px`);
  root.setProperty('--nh', `${g.notchHeight}px`);
  root.setProperty('--drop', `${g.drop}px`);
  root.setProperty('--open-w', `${{ compact: 440, comfortable: 520, spacious: 620 }[s.size]}px`);
  notch.classList.toggle('no-notch', !g.notch);
  // A real notch is always drawn as one; a screen without one follows Settings > Notch (Pill or Notch), the same
  // setting the native notch reads.
  notch.dataset.shape = !g.notch && (s.native as { shape?: string } | undefined)?.shape !== 'notch' ? 'pill' : 'notch';
  notch.dataset.open = String(open);
  notch.dataset.phase = phase();
  askForm.hidden = !s.show.ask;
  if (view === 'settings') { drawSettings(); if (panel.firstChild !== settingsBox) panel.replaceChildren(settingsBox); }
  else { drawAnswer(); drawMusic(); drawTimers(); if (panel.firstChild !== main) panel.replaceChildren(main); }
  bar();
  // As tall as what it holds.
  if (open) root.setProperty('--open-h', `${Math.min(innerHeight - 16, g.notchHeight + panel.scrollHeight)}px`);
}

// ---------- Opening, closing and letting the mouse in ----------

const keepOpen = () => view === 'settings' || (document.activeElement === input && input.value.trim() !== '') || asking;
function setOpen(next: boolean) {
  window.clearTimeout(closeTimer); window.clearTimeout(hoverTimer);
  if (open === next) return;
  open = next;
  if (!open) { view = 'main'; problem = ''; input.blur(); drawn.delete('settings'); }
  draw();
}
function rect() {
  const r = notch.getBoundingClientRect();
  return { left: r.left - (open ? 0 : 10), right: r.right + (open ? 0 : 10), top: 0, bottom: r.bottom + 4 };
}
function pointer(x: number, y: number) {
  const r = rect();
  const now = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  if (now === inside) return;
  inside = now;
  bridge.hit(now);
  const s = state?.settings;
  if (!s) return;
  if (now) {
    window.clearTimeout(closeTimer);
    if (!open && s.open === 'hover') hoverTimer = window.setTimeout(() => setOpen(true), s.hoverDelay);
  } else {
    window.clearTimeout(hoverTimer);
    if (open && s.open === 'hover' && !keepOpen()) closeTimer = window.setTimeout(() => { if (!inside && !keepOpen()) setOpen(false); }, s.closeDelay);
  }
}
document.addEventListener('mousemove', e => pointer(e.clientX, e.clientY));
document.addEventListener('mouseleave', () => pointer(-1, -1));
notch.addEventListener('click', e => {
  if (state?.settings.open !== 'click') return;
  const onBar = e.clientY <= (state?.geometry.notchHeight ?? 33) + (state?.geometry.drop ?? 0);
  if (!open) { setOpen(true); bridge.focus(); } else if (onBar) setOpen(false);
});
window.addEventListener('blur', () => { if (open && !inside && (state?.settings.open === 'click' || !keepOpen())) setOpen(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (view === 'settings') { view = 'main'; draw(); } else setOpen(false); } });
input.addEventListener('mousedown', () => bridge.focus());

// ---------- Asking ----------

async function act(words: string) {
  const r = await bridge.say(words);
  problem = 'error' in r ? r.error : '';
  draw();
}
askForm.addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || asking) return;
  asking = true; problem = ''; input.value = ''; input.disabled = true; draw();
  const r = await bridge.ask(text);
  asking = false; input.disabled = false;
  if ('error' in r) problem = r.error;
  else if (state) state = { ...state, voice: { phase: 'answer', said: text, text: r.text, at: new Date().toISOString() } };
  draw();
  input.focus();
});
async function save(partial: Partial<NotchSettings>) {
  const next = await bridge.save(partial);
  if (state) { state = { ...state, settings: next }; draw(); }
}

bridge.onState(next => {
  const before = state;
  state = next;
  // News, or an answer that is a list, opens the notch for a few seconds so you see it, like a Live Activity. Taurus
  // listening, thinking or answering in words never does: he is at the bottom of the screen for that.
  const v = next.voice, n = next.news;
  const newNews = Boolean(n && n.at !== lastNewsAt && recent(n.at, 4000));
  const newList = Boolean(v && v.phase === 'answer' && v.at !== lastAnswerAt && recent(v.at, 4000) && next.settings.show.answer && listy(v.text));
  if (v) lastAnswerAt = v.at;
  if (n) lastNewsAt = n.at;
  const pop = Boolean(before) && (newNews || newList);
  if (pop && !open) { setOpen(true); peeked = true; } else draw();
  // Opened by itself: it goes up again a few seconds later, unless you've moved onto it.
  if (pop && peeked) { window.clearTimeout(closeTimer); closeTimer = window.setTimeout(() => { if (!inside && !keepOpen()) setOpen(false); }, reduce ? 6000 : 5000); }
});
let peeked = false;
document.addEventListener('mousemove', () => { if (inside) peeked = false; });
bridge.onCommand(command => { if (command === 'settings') { view = 'settings'; setOpen(true); draw(); } });
window.setInterval(() => { if (!state) return; if (timers().length || phase() !== 'idle') draw(); }, 1000);
