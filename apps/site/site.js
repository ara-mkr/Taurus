// Taurus website. No libraries. Everything here is an extra: with JavaScript off the page still reads top to bottom.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const root = document.documentElement;

  // ---------- Weighted scrolling ----------
  // The wheel moves a target; the page follows it with some mass. Keyboard, scrollbar and touch scrolling stay native,
  // and so does everything under Reduce Motion or on touch screens.
  const scroller = (() => {
    let target = scrollY, current = scrollY, written = scrollY, last = 0, running = false;
    let nativeUntil = 0;
    const max = () => root.scrollHeight - innerHeight;
    const enabled = () => !reduce.matches && fine.matches;
    const stop = () => { running = false; last = 0; target = current = written = scrollY; };
    function frame(now) {
      if (!running) return;
      // Something else moved the page (a key, the scrollbar, find in page): it wins.
      if (Math.abs(scrollY - written) > 2) { stop(); return; }
      const dt = Math.min(64, now - (last || now - 16.7));
      last = now;
      // About 11% of the remaining distance per 60 Hz frame, the same on a 120 Hz screen.
      current += (target - current) * (1 - Math.pow(1 - 0.11, dt / 16.7));
      if (Math.abs(target - current) < 0.4) current = target;
      scrollTo(0, current);
      written = scrollY;
      if (current !== target) requestAnimationFrame(frame); else { running = false; last = 0; }
    }
    const go = () => { if (!running) { running = true; written = scrollY; requestAnimationFrame(frame); } };
    addEventListener('keydown', () => { if (running) stop(); });
    addEventListener('pointerdown', () => { if (running) stop(); });
    addEventListener('wheel', event => {
      if (!enabled() || event.ctrlKey || event.defaultPrevented) return;
      // A mostly sideways gesture stays native for its whole length, so the two modes never fight mid-swipe.
      if (Math.abs(event.deltaX) > 2 * Math.abs(event.deltaY)) nativeUntil = event.timeStamp + 150;
      if (event.timeStamp < nativeUntil) return;
      // Inner scrollable areas keep their own wheel.
      for (let el = event.target; el && el !== document.body; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return;
      }
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? innerHeight : 1;
      if (!running) target = current = scrollY;
      target = clamp(target + event.deltaY * unit, 0, max());
      go();
    }, { passive: false });
    // Anything else that scrolls the page (keys, scrollbar, find in page) wins and resets the target.
    addEventListener('scroll', () => { if (!running) target = current = written = scrollY; }, { passive: true });
    return {
      to(y) {
        if (!enabled()) { scrollTo({ top: y, behavior: reduce.matches ? 'auto' : 'smooth' }); return; }
        if (!running) current = scrollY;
        target = clamp(y, 0, max());
        go();
      },
    };
  })();

  // In-page links travel with the same weight, then move focus for keyboard and screen reader users.
  const barHeight = () => $('.bar').offsetHeight;
  for (const link of $$('a[href^="#"]')) {
    link.addEventListener('click', event => {
      const id = link.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      event.preventDefault();
      const ring = scenes.find(s => s.el === el && s.kind === 'ring');
      scroller.to(id === 'top' ? 0 : ring ? ring.start + 0.6 * ring.len : el.getBoundingClientRect().top + scrollY - barHeight());
      history.replaceState(null, '', `#${id}`);
      const focus = id === 'main' ? el : (el.querySelector('h1, h2') ?? el);
      focus.setAttribute('tabindex', '-1');
      focus.focus({ preventScroll: true });
    });
  }

  // ---------- Taurus ----------
  // He charges: leans back, tucks his horns, bursts forward, eases out. Never side to side.
  const charge = (el, distance = 34) => {
    if (!el || reduce.matches || !el.animate) return;
    el.animate([
      { transform: 'none' },
      { transform: 'translateX(-8px) rotate(-5deg)', offset: 0.22, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: 'translateX(-10px) rotate(7deg)', offset: 0.38, easing: 'cubic-bezier(.5,0,.1,1)' },
      { transform: `translateX(${distance}px) rotate(3deg)`, offset: 0.6, easing: 'cubic-bezier(.22,1,.36,1)' },
      { transform: 'none' },
    ], { duration: 1150 });
  };

  // ---------- Words that light up ----------
  // Each word becomes a span. The text and its reading order stay exactly as written.
  const words = $('.words');
  const wordSpans = [];
  if (words) {
    const walk = node => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.append(part); continue; }
            const w = document.createElement('span');
            w.className = 'w';
            w.textContent = part;
            wordSpans.push(w);
            frag.append(w);
          }
          child.replaceWith(frag);
        } else walk(child);
      }
    };
    walk(words);
  }

  // ---------- The wall of app names ----------
  const rows = window.TAURUS_CONNECTIONS ?? [];
  const sample = ['Gmail', 'Slack', 'Google Calendar', 'Linear', 'WHOOP', 'Stripe', 'Strava', 'Outlook Mail'];
  const wallRows = $$('.wall .row');
  {
    // The apps from the sample day lead, in ink; the rest follow in grey.
    const direct = rows.filter(r => r[3] === 'Direct').map(r => r[0]);
    const names = [...new Set([...sample.filter(n => direct.includes(n)), ...direct])];
    const viaComposio = rows.filter(r => r[3] === 'Composio').map(r => r[0]);
    const lines = [names.filter((_, i) => i % 2 === 0), [...viaComposio, ...names.filter((_, i) => i % 4 === 1)], names.filter((_, i) => i % 2 === 1)];
    wallRows.forEach((row, i) => {
      const list = lines[i] ?? names;
      // Repeat the list so a row is always wider than any screen it drifts across.
      for (let k = 0; k < 3; k++) for (const name of list) {
        const s = document.createElement('span');
        s.textContent = name;
        if (sample.includes(name)) s.className = 'hi';
        row.append(s);
      }
    });
  }

  // ---------- Scenes ----------
  // A scene is a tall section with a sticky pin. Its progress runs from 0 when the pin sticks to 1 when it lets go.
  const scenes = $$('[data-scene]').map(el => ({ el, kind: el.dataset.scene, start: 0, len: 1, last: -1 }));
  const hero = { copy: $('.hero-copy'), shot: $('.hero-shot'), frame: $('.hero-shot .frame'), y0: 0, y1: 0, s0: 1, s1: 1 };
  const line = { parts: $$('.sentence [data-part]'), notes: $$('.note'), coda: $('.coda') };
  const act = { points: $$('.act-points li'), a: $('.card-a'), b: $('.card-b') };
  const narrow = matchMedia('(max-width: 900px)');
  const track = $('.track');
  const flood = $('.flood');
  const ringPre = $('.ring-pre');
  let panMax = 0, charged = false, rowWidths = [];

  function measure() {
    const bar = barHeight();
    const pinH = innerHeight - bar;
    for (const s of scenes) {
      const top = s.el.getBoundingClientRect().top + scrollY;
      if (s.kind === 'drift') { s.start = top - innerHeight; s.len = s.el.offsetHeight + innerHeight; }
      else { s.start = top - bar; s.len = Math.max(1, s.el.offsetHeight - pinH); }
      s.last = -1;
    }
    if (hero.shot) {
      const copyBottom = hero.copy.offsetTop + hero.copy.offsetHeight;
      const frameH = hero.frame.offsetHeight;
      // Room for the caption under the board and some air above it.
      hero.s1 = Math.min(1, (pinH - 110) / frameH);
      hero.y1 = Math.max(16, (pinH - frameH * hero.s1) / 2 - 12);
      hero.y0 = clamp(copyBottom + 40, pinH * 0.5, pinH * 0.8);
      hero.s0 = hero.s1 * 0.9;
    }
    if (track) panMax = Math.max(0, track.scrollWidth - innerWidth);
    rowWidths = wallRows.map(row => row.scrollWidth);
  }

  const handlers = {
    hero(p) {
      const e = ease(span(p, 0.05, 0.7));
      // The words are gone before the board slides over them.
      const fade = span(p, 0, 0.22);
      hero.copy.style.transform = `translateY(${-e * 120}px)`;
      hero.copy.style.opacity = String(1 - fade);
      hero.copy.style.pointerEvents = fade > 0.5 ? 'none' : '';
      hero.shot.style.transform = `translate(-50%, ${lerp(hero.y0, hero.y1, e)}px) perspective(1600px) rotateX(${lerp(20, 0, e)}deg) scale(${lerp(hero.s0, hero.s1, e)})`;
      hero.shot.style.setProperty('--cap', String(span(p, 0.62, 0.75)));
    },
    words(p) {
      const lit = Math.round(span(p, 0.06, 0.78) * wordSpans.length);
      wordSpans.forEach((w, i) => w.classList.toggle('lit', i < lit));
    },
    line(p) {
      line.parts.forEach((part, i) => {
        const a = 0.1 + i * 0.22;
        part.classList.toggle('on', p >= a);
        part.classList.toggle('now', p >= a && p < a + 0.22);
        const note = line.notes[i];
        note.classList.toggle('on', p >= a);
        note.style.setProperty('--f', String(span(p, a, a + 0.22)));
      });
      line.coda.classList.toggle('on', p >= 0.78);
    },
    stack(p) {
      // On narrow screens the cards sit one under the other and nothing moves.
      if (narrow.matches) { act.b.style.removeProperty('--b'); act.b.style.removeProperty('--bo'); act.a.style.removeProperty('--a'); act.a.style.removeProperty('--ao'); act.points.forEach(li => li.classList.add('on')); return; }
      act.points.forEach((li, i) => li.classList.toggle('on', p >= 0.04 + i * 0.12));
      const e = ease(span(p, 0.38, 0.78));
      act.b.style.setProperty('--b', `${(1 - e) * 40}%`);
      act.b.style.setProperty('--bo', String(span(p, 0.38, 0.55)));
      act.a.style.setProperty('--a', String(1 - 0.06 * e));
      act.a.style.setProperty('--ao', String(1 - 0.35 * e));
    },
    pan(p) { track.style.transform = `translateX(${-ease(span(p, 0.04, 0.96)) * panMax}px)`; },
    drift(p) {
      wallRows.forEach((row, i) => {
        const dir = i % 2 ? 1 : -1;
        const base = -((rowWidths[i] ?? 0) - innerWidth) / 2;
        row.style.transform = `translateX(${base + (p - 0.5) * dir * innerWidth * 0.7}px)`;
      });
    },
    ring(p) {
      // The line fades first, then the red rises from the bottom edge and covers the window.
      ringPre.style.opacity = String(1 - span(p, 0, 0.1));
      const r = ease(span(p, 0.08, 0.45));
      flood.style.setProperty('--r', `${r * 150}%`);
      if (r >= 0.98 && !charged) { charged = true; charge($('.taurus', flood), 40); }
      if (r < 0.2) charged = false;
    },
  };

  let queued = false;
  function update() {
    queued = false;
    $('.bar').classList.toggle('lined', scrollY > 8);
    if (!root.classList.contains('live')) return;
    for (const s of scenes) {
      const p = clamp((scrollY - s.start) / s.len);
      if (p === s.last) continue;
      s.last = p;
      handlers[s.kind]?.(p);
    }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

  function setMode() {
    const still = reduce.matches;
    root.classList.toggle('still', still);
    root.classList.toggle('live', !still);
    if (still) {
      // Finished states, nothing tied to the scroll.
      for (const el of [hero.copy, hero.shot, track, ringPre, ...wallRows]) if (el) { el.style.transform = ''; el.style.opacity = ''; el.style.pointerEvents = ''; }
      if (flood) flood.style.removeProperty('--r');
      if (track) { track.tabIndex = 0; track.setAttribute('role', 'region'); track.setAttribute('aria-label', 'Screenshots'); }
    }
    measure();
    update();
  }
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => { measure(); queue(); });
  reduce.addEventListener?.('change', setMode);
  // Fonts and images change heights, so measure again once they are in.
  document.fonts?.ready.then(() => { measure(); queue(); });
  addEventListener('load', () => { measure(); queue(); });
  // Keyboard focus never sits on something hidden: the hero words and the red screen scroll back into full view.
  hero.copy?.addEventListener('focusin', () => { if (scrollY > 4) scroller.to(0); });
  flood?.addEventListener('focusin', () => {
    const s = scenes.find(x => x.kind === 'ring');
    if (s && root.classList.contains('live') && (scrollY < s.start + 0.5 * s.len || scrollY > s.start + s.len)) scroller.to(s.start + 0.6 * s.len);
  });
  // The hero swaps to the phone picture on narrow screens; its height changes when that image arrives.
  if (hero.frame && 'ResizeObserver' in window) new ResizeObserver(() => { measure(); queue(); }).observe(hero.frame);
  setMode();

  // ---------- The ring screen's buttons ----------
  const replies = {
    on: ['Answered', 'Have a good call.'],
    open: ['Opening', 'In the app, Open answers the ring and opens the join link, or the event if there isn’t one.'],
    snooze: ['Snoozed', 'It rings again in 5 minutes.'],
  };
  for (const button of $$('.fb')) {
    button.addEventListener('click', () => {
      const [kind, when] = replies[button.dataset.answer];
      $('#ring-kind').textContent = kind;
      $('#ring-when').textContent = when;
      flood.classList.add('answered');
      $$('.fb').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    });
  }

  // ---------- Connections ----------
  const tbody = $('#ledger-rows');
  const input = $('#find');
  const status = $('#find-status');
  const listWrap = $('#ledger-wrap');
  let catalog = null;
  const counts = { direct: rows.filter(r => r[3] === 'Direct').length, composio: rows.filter(r => r[3] === 'Composio').length, total: rows.length, catalog: window.TAURUS_COMPOSIO_COUNT ?? 0 };
  for (const el of $$('[data-count]')) if (counts[el.dataset.count]) el.textContent = counts[el.dataset.count].toLocaleString('en-US');

  const cell = text => { const td = document.createElement('td'); td.textContent = text; return td; };
  const row = (name, reads, how) => { const tr = document.createElement('tr'); tr.append(cell(name), cell(reads), cell(how)); return tr; };
  const howOf = r => (r[3] === 'Composio' ? 'Through Composio' : 'Direct');

  async function loadCatalog() {
    if (catalog) return catalog;
    try { catalog = await (await fetch('composio-catalog.json')).json(); } catch { catalog = []; }
    return catalog;
  }

  async function render() {
    const q = input.value.trim().toLowerCase();
    let list = rows;
    let extra = [];
    if (q) {
      list = rows.filter(r => `${r[0]} ${r[1]} ${r[2]}`.toLowerCase().includes(q)).sort((a, b) => Number(!a[0].toLowerCase().startsWith(q)) - Number(!b[0].toLowerCase().startsWith(q)));
      const known = new Set(rows.map(r => r[0].toLowerCase()));
      extra = (await loadCatalog()).filter(([name]) => name.toLowerCase().includes(q) && !known.has(name.toLowerCase())).slice(0, 8);
      if (input.value.trim().toLowerCase() !== q) return;
    }
    listWrap.hidden = !q;
    tbody.replaceChildren(...(q ? list : []).map(r => row(r[0], r[1], howOf(r))), ...extra.map(([name]) => row(name, 'Nothing yet. Connect it in Composio and Taurus can use it, with your OK.', 'In Composio')));
    status.textContent = !q ? '' : list.length + extra.length === 0 ? `Nothing matches “${input.value.trim()}”, and Composio doesn’t list it either.`
      : `Taurus reads ${list.length}${extra.length ? `; ${extra.length} more ${extra.length === 1 ? 'is' : 'are'} in Composio` : ''}.`;
    // The page got taller or shorter, so every scene below moved.
    measure();
    queue();
  }
  if (tbody && input) {
    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 90); });
    render();
  }
})();
