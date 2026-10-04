/* cravepal.app, the story scenes. The pinned, scroll-scrubbed kitchen: scene A (hungry, ordering, blocked) and
   scene B (cooking and plating), in Adam’s mint kitchen. The rest of the page (hero, the Pause demo,
   money, footer, easter eggs) is home.js. Decoration on a page that works without it; reduced motion gets still panels.

   How it stays smooth:
   - One requestAnimationFrame loop. Geometry is cached on layout changes; frames compute, then write.
   - Scene poses are derived from the current scroll position; easing belongs inside each beat.
   - Motion uses transform and opacity; discrete text and visibility update only when changed. Layers get will-change only while they move.
   - The loop sleeps when nothing is moving. Image decoding never gates layout or rendering. */
(() => {
  'use strict';
  const d = document, root = d.documentElement;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = motionPreference.matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const eOut = t => 1 - (1 - t) ** 3;
  const eIn = t => t * t;
  const eInOut = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const eBack = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  // Finite, seekable spring: exact endpoints, with a soft overshoot and settle.
  const springEnd = 1 - Math.exp(-7) * (Math.cos(11) + 7 / 11 * Math.sin(11));
  const eSpring = t => t === 0 || t === 1 ? t
    : (1 - Math.exp(-7 * t) * (Math.cos(11 * t) + 7 / 11 * Math.sin(11 * t))) / springEnd;
  const recoil = t => Math.sin(t * Math.PI * 4) * Math.exp(-5 * t) * (1 - t);
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];

  /* ---------- layers that are moving right now get will-change; it is dropped when the loop sleeps ---------- */
  const hot = new Set();
  let geometryDirty = true;
  const invalidate = () => { geometryDirty = true; kick(); };
  const heat = els => { if (reduce) return; for (const el of els) if (el && !hot.has(el)) { el.style.willChange = 'transform, opacity'; hot.add(el); } };
  const cool = () => { for (const el of hot) el.style.willChange = ''; hot.clear(); };

  /* ---------- geometry, measured on load and resize, never per frame ---------- */
  const G = { vh: innerHeight, vw: innerWidth, max: 0 };
  const poke = () => kick();

  const seen = new WeakMap();
  const io = new IntersectionObserver(es => {
    es.forEach(e => {
      seen.set(e.target, e.isIntersecting);
      e.target.classList.toggle('motion-paused', !e.isIntersecting);
      if (!e.isIntersecting) {
        for (const el of hot) if (e.target === el || e.target.contains(el)) { el.style.willChange = ''; hot.delete(el); }
      }
    });
    kick();
  }, { rootMargin: '160px 0px' });
  const watch = el => { if (el) { seen.set(el, false); io.observe(el); } return el; };
  const visible = el => !!seen.get(el);

  /* ---------- scroll ownership: native pixel input, a short glide for line/page wheels ---------- */
  const S = { on: !reduce, y: scrollY, target: scrollY, written: scrollY, moving: false, tween: null, focus: null };
  const cancelScroll = () => {
    S.moving = false; S.tween = null; S.focus = null;
    S.y = S.target = S.written = scrollY;
  };
  const nativeWheelTarget = el => {
    if (el.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return true;
    for (; el && el !== d.body && el !== root; el = el.parentElement) {
      const o = getComputedStyle(el).overflowY;
      // Let the browser also own chaining and overscroll-behavior at a nested scroller's edges.
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1) return true;
    }
    return false;
  };
  {
    // Pixel deltas cannot reliably identify a trackpad versus a high-resolution mouse.
    // Preserve their native inertia rather than guessing from delta size or event frequency.
    // Non-passive only here: line/page wheels actually need preventDefault.
    addEventListener('wheel', e => {
      if (!S.on || d.querySelector('dialog[open]') || e.deltaMode === 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey ||
          e.defaultPrevented || !e.cancelable || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY) ||
          geometryDirty || nativeWheelTarget(e.target)) { cancelScroll(); return; }
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : G.vh);
      const sy = scrollY;
      if ((dy < 0 && sy <= 0) || (dy > 0 && sy >= G.max - 1)) { cancelScroll(); return; }
      e.preventDefault();
      if (!S.moving || S.tween || Math.abs(sy - S.written) > 1.5 ||
          Math.sign(dy) !== Math.sign(S.target - S.y)) S.y = S.target = sy;
      S.written = sy; S.tween = null; S.focus = null;
      S.target = clamp(S.target + dy, 0, G.max);
      S.moving = true; poke();
    }, { passive: false });
    addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab', 'Escape'].includes(e.key)) cancelScroll();
    }, { passive: true });
    addEventListener('pointerdown', cancelScroll, { passive: true, capture: true });
    addEventListener('touchstart', cancelScroll, { passive: true, capture: true });
    addEventListener('focusin', cancelScroll, { passive: true });
    addEventListener('resize', cancelScroll, { passive: true });
    addEventListener('hashchange', cancelScroll, { passive: true });
    addEventListener('popstate', cancelScroll, { passive: true });
    // Same-page links glide; the demo's state fragments retain their native hash/focus behavior.
    d.addEventListener('click', e => {
      const a = e.target.closest?.('a[href^="#"]');
      if (!S.on || !a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
          a.hasAttribute('download') || (a.target && a.target !== '_self') || geometryDirty) return;
      let id;
      try { id = decodeURIComponent(a.getAttribute('href').slice(1)); } catch { return; }
      const el = id && d.getElementById(id);
      if (!el || el.classList.contains('tgt')) { cancelScroll(); return; }
      const to = clamp(el.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0), 0, G.max);
      e.preventDefault();
      S.y = S.written = scrollY;
      S.tween = { from: S.y, to, t0: performance.now(), dur: clamp(Math.abs(to - S.y) * .22, 360, 1100) };
      S.target = to; S.moving = true; S.focus = el;
      if (location.hash !== a.hash) history.pushState(null, '', a.hash);
      poke();
    });
  }
  addEventListener('scroll', () => {
    if (S.moving && Math.abs(scrollY - S.written) > 1.5) cancelScroll();
    if (!S.moving) S.y = S.target = scrollY;
    poke();
  }, { passive: true });
  function stepScroll(now, dt, sy) {
    // Check before writing too: native input may arrive before its scroll event is dispatched.
    if (S.moving && Math.abs(sy - S.written) > 1.5) cancelScroll();
    if (!S.moving) return sy;
    if (S.tween) {
      const t = clamp((now - S.tween.t0) / S.tween.dur, 0, 1);
      S.y = lerp(S.tween.from, S.tween.to, eInOut(t));
      if (t >= 1) { S.tween = null; S.moving = false; }
    } else {
      S.y = damp(S.y, S.target, 16, dt);
      if (Math.abs(S.target - S.y) < .25) { S.y = S.target; S.moving = false; }
    }
    return clamp(S.y, 0, G.max);
  }


  /* ---------- the story: pinned scenes scrubbed by scroll ----------
     Each scene has build (find its parts), measure (geometry, on resize) and render(R, p), a pure function of
     progress p, so scrolling back plays it in reverse. With reduced motion the same render paints still panels. */
  const scenes = [], strips = [];
  const boxIn = (el, root) => { let l = 0, t = 0; for (let e = el; e && e !== root; e = e.offsetParent) { l += e.offsetLeft; t += e.offsetTop; } return { l, t, w: el.offsetWidth, h: el.offsetHeight }; };
  const svgBox = (el, root) => { const cs = getComputedStyle(el), b = boxIn(el.parentElement, root); return { l: b.l + (parseFloat(cs.left) || 0), t: b.t + (parseFloat(cs.top) || 0), w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || parseFloat(cs.width) || 0 }; };
  // Fully transparent pieces are hidden too: a near-zero scale on a shadowed element stalls rendering
  const rendered = new WeakMap();
  const set = (el, tf, op = 1) => {
    if (!el) return;
    op = clamp(op, 0, 1);
    const prev = rendered.get(el), shown = op > .002;
    if (prev && prev.tf === tf && prev.op === op) return;
    if (shown) {
      heat([el]);
      if (!prev || prev.tf !== tf || !prev.shown) el.style.transform = tf;
    }
    if (!prev || prev.op !== op) el.style.opacity = op;
    if (!prev || prev.shown !== shown) el.style.visibility = shown ? '' : 'hidden';
    rendered.set(el, { tf, op, shown });
  };
  const cue = el => ({ el, a: +el.dataset.in, b: +el.dataset.out });
  const capsAt = (caps, p) => caps.forEach(({ el: c, a, b }) => {
    const o = seg(p, a, a + .008) * (1 - seg(p, b - .008, b));
    set(c, `translateY(${((1 - eOut(seg(p, a, a + .015))) * 16).toFixed(1)}px) rotate(0deg)`, o);
  });
  function addScene(section, build) {
    if (!section) return;
    const stage = $('[data-stage]', section);
    if (reduce) {                                  // a comic strip: one frozen copy of the stage per chapter
      section.classList.add('is-strip');
      const ps = (section.dataset.stills || '1').split(',').map(Number);
      const copies = ps.map((p, i) => {
        if (i === 0) return stage;
        const c = stage.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
        section.appendChild(c);
        return c;
      });
      copies.forEach((st, i) => strips.push({ R: build(st), p: ps[i] }));
      return;
    }
    section.classList.add('is-pinned');
    watch(stage);
    scenes.push({ section, R: build(stage), p: 0, last: -1, top: 0, h: 0, span: +section.dataset.span || 1 });
  }
  function scenesWrite(y) {
    let changed = false;
    for (const sc of scenes) {
      const total = sc.h - sc.stageH;
      if (total <= 0) continue;                    // not pinned (layout failed): the CSS frame stands
      const pT = clamp((y - sc.top) / total, 0, 1);
      // IntersectionObserver is asynchronous: it may still say "off screen" after a jump.
      // Always derive the pose from scroll, including off-screen endpoints and re-entry.
      sc.p = pT;
      if (sc.p === sc.last) continue;
      sc.R.render(sc.p * sc.span);
      if (!visible(sc.R.st)) for (const el of sc.R.all) {
        if (hot.delete(el)) el.style.willChange = '';
      }
      sc.last = sc.p;
      changed = true;
    }
    return changed;
  }

  /* scene A, chapters 1 to 3: hungry, ordering, blocked */
  function buildA(st) {
    const q = s => $(s, st), qa = s => $$(s, st);
    const R = {
      st, head: q('.n-head'), n1: q('.n-1'), n2: q('.n-2'), grr: q('.n-grr'), caps: qa('.n-caps .cap').map(cue), cap: q('.n-cap'),
      win: q('.nx-win'), scooter: q('.nx-scooter'), clock: q('.nx-clock'), hh: q('.nx-clock__h'), mm: q('.nx-clock__m'),
      lamp: q('.nx-lamp'), cone: q('.nx-lamp__cone'), fridge: q('.nx-fridge'), door: q('.nx-fridge__door'), light: q('.nx-fridge__light'), spill: q('.nx-fridge__spill'),
      glow: q('.nx-glow'), wipe: q('.n-wipe'), phone: q('.n-phone'),
      list: q('.app__list'), labels: qa('.app__item > span, .app__item > em'), view: q('.app__view'), count: q('.app__count'), total: q('.app__total'),
      items: qa('.app__item').map(el => ({ el, at: +el.dataset.at || 0, price: +el.dataset.price || 0, plus: $('em span', el), one: $('em span + span', el) })),
      pause: q('.n-pause'), btn: q('.n-btn'), btnFace: q('.n-btn__face'), hand: q('.n-hand'), tapRing: q('.n-tap'), pal: q('.n-pal'), dust: qa('.n-dust i'), bub: q('.n-bubble'), stk: q('.n-sticker'),
      foods: qa('.food'),
      dirs: [[-1, -.8, -1], [-.6, -1.2, 1], [1, -.6, 1], [1.1, -1, -1], [1, .3, 1]], shown: { n: -1, v: -1 },
      chaps: qa('.sc-chap').map(cue), ticket: q('.cap--ticket')
    };
    R.pal.style.transformOrigin = '50% 100%';
    R.all = [...R.chaps.map(c => c.el), R.head, R.n1, R.n2, R.grr, R.cap, ...R.caps.map(c => c.el), R.win, R.scooter, R.clock, R.hh, R.mm, R.lamp, R.cone, R.fridge, R.door, R.light, R.spill,
      R.glow, R.wipe, R.phone, R.list, ...R.labels, R.pause, R.btn, R.btnFace, R.hand, R.tapRing, R.pal, R.bub, R.stk, ...R.dust, ...R.foods, ...R.items.map(i => i.el)];
    R.measure = () => {
      const W = st.offsetWidth, H = st.offsetHeight, cs = getComputedStyle(R.phone), v = k => parseFloat(cs.getPropertyValue(k));
      const zH = H * v('--zoom-h'), rH = H * v('--room-h');
      R.W = W; R.H = H; R.pw = R.phone.offsetWidth; R.bw = R.btn.offsetWidth;
      // The artwork has a small transparent margin below its contact shadow.
      const button = boxIn(R.btn, R.phone), pal = boxIn(R.pal, R.phone);
      R.contactY = button.t - (pal.t + pal.h) + pal.h * .035;
      // the tap: the fingertip's target is the middle of the order button (phone coordinates, at the zoomed size);
      // it glides in from below the frame and leaves off its right edge
      {
        const b = boxIn(R.btn, R.phone), hw = parseFloat(getComputedStyle(R.hand).width) || .3 * R.pw, hh = hw * 84 / 64;
        const stageBottom = H - R.phone.offsetTop, stageRight = W / 2 + R.pw / 2;
        R.tip = { x: b.l + b.w / 2, y: b.t + b.h / 2 }; R.handW = hw; R.handH = hh;
        R.tapFrom = { x: .5 * R.pw, y: Math.max(.55 * R.pw, stageBottom - R.tip.y + .1 * hh + 12) };   // just out of frame
        R.tapOut = { x: stageRight - R.tip.x + .6 * hw + 20, y: .3 * R.pw };
      }
      R.room = { dx: W * v('--room-l') + rH / 2.11 / 2 - W / 2, dy: H - H * v('--room-b') - rH / 2 - (H * v('--zoom-t') + zH / 2), s: rH / zH };
      R.listMax = Math.max(0, R.list.offsetHeight - R.view.offsetHeight);
      // the clock must not sit under the zoomed phone: slide it left if that clears the ticket, else lift it out with the push-in
      {
        const c = boxIn(R.clock, st), tk = boxIn(R.ticket, st), need = c.l + c.w + 14 - (W / 2 - R.pw / 2);
        const hits = x => x < tk.l + tk.w + 30 && x + c.w > tk.l - 30 && c.t < tk.t + tk.h + 30 && c.t + c.h > tk.t - 30;
        const lift = { x: 0, y: -(c.t + c.h + 16) };
        R.clockOut = W <= 760 ? { x: -(c.l + c.w + 24), y: 0 } : need <= 0 ? (hits(c.l) ? lift : { x: 0, y: 0 }) : c.l - need >= -.15 * c.w && !hits(c.l - need) ? { x: -need, y: 0 } : lift;
      }
      // where each piece of food lands after pal's drop: on the counter, clear of every piece of text and of the phone
      const floor = boxIn(q('.nx-counter'), st).t + 8;
      const pad = b => ({ l: b.l - 34, t: b.t - 34, r: b.l + b.w + 34, b: b.t + b.h + 34 });
      // the phone is centred with translate:-50%, which offsets don't include: shift it, and everything in it, by half its width
      const shift = R.phone.offsetWidth / 2;
      const real = e => { const b = boxIn(e, st); if (e === R.phone || R.phone.contains(e)) b.l -= shift; return b; };
      const words = ['.n-cap', '.n-1', '.n-2', '.n-bubble', '.n-sticker', '.n-phone', '.nx-fridge'].map(s => q(s)).filter(Boolean).map(e => pad(real(e)));
      // food lands in the free gaps along the counter: not on text, the phone, the fridge, or another piece of food
      const lo = W * .02, boxes = R.foods.map(f => svgBox(f, st));
      const maxH = Math.max(...boxes.map(b => b.h));
      const band = { t: floor - maxH * .82 - 2, b: floor + maxH * .2 + 12 };
      let free = [[lo, W * .98]];
      const block = (l, r) => { free = free.flatMap(([a, z]) => (r <= a || l >= z) ? [[a, z]] : [[a, l], [r, z]].filter(([m, n]) => n - m > 4)); };
      words.forEach(w => { if (w.t < band.b && w.b > band.t) block(w.l, w.r); });
      const prefer = matchMedia('(max-width:760px),(max-width:1100px) and (max-aspect-ratio:4/5)').matches ? [.04, .2, .62, .8, .9] : [.3, .34, .66, .76, .88];   // same query as the scene's phone layout in style.css
      R.land = R.foods.map((f, i) => {
        const b = boxes[i], top = floor - b.h * .82 + (i % 2) * 6, want = W * prefer[i];
        const fits = free.filter(([a, z]) => z - a >= b.w);
        let x = want < W / 2 ? -b.w - 60 : W + 60;  // no room on the counter (phones): pal flings it off the screen
        if (fits.length) {
          const [a, z] = fits.reduce((best, iv) => { const d = iv => Math.abs(clamp(want, iv[0], iv[1] - b.w) - want); return d(iv) < d(best) ? iv : best; });
          x = clamp(want, a, z - b.w);
        }
        block(x - 30, x + b.w + 30);              // the next piece lands clear of this one (room for its spin)
        return { x: x - b.l, y: top - b.t };
      });
      R.applyGeometry = () => {};
    };
    R.render = p => {
      const vw = R.W / 100, vh = R.H / 100, pw = R.pw;
      // the page's chapter header changes with the story: 01 hungry, 02 the app, 03 pal
      const headerOut = 1 - eInOut(seg(p, .85, .92));
      set(R.wipe, `translateY(${(100 * (1 - eInOut(seg(p, .88, .99)))).toFixed(2)}%)`);
      R.chaps.forEach(({ el, a, b }) => {
        const enter = eOut(seg(p, a, a + .009)), leave = eInOut(seg(p, b - .009, b));
        set(el, `translateY(${((1 - enter) * 7 - leave * 5).toFixed(2)}px)`, enter * (1 - leave) * headerOut);
      }); // adjacent headers leave before the next arrives; chapter 03's leaves as the try section arrives
      // chapter 1: it's 9pm, you're hungry, the fridge is boring, the stomach rumbles, cravings float in
      set(R.head, 'none', 1 - seg(p, .2, .228));
      let t = eOut(seg(p, 0, .06));
      set(R.n1, `translateX(${(lerp(-70, 0, t) * vw).toFixed(1)}px) rotate(${lerp(-12, 0, t).toFixed(2)}deg)`, t);
      t = eOut(seg(p, .05, .11));
      set(R.n2, `translateY(${lerp(24, 0, t).toFixed(1)}px)`, t);
      const tc = eOut(seg(p, 0, .14));
      R.mm.style.transform = `rotate(${lerp(270, 360, tc).toFixed(2)}deg)`;
      R.hh.style.transform = `rotate(${lerp(262.5, 270, tc).toFixed(2)}deg)`;
      const g = seg(p, .11, .21), gs = Math.sin(g * Math.PI);
      const rattle = (k, a) => (Math.sin(p * k) * a * gs).toFixed(2);
      const par = k => ((p - .3) * k).toFixed(2);
      const zc = eInOut(seg(p, .22, .3)), co = R.clockOut;
      const shock = recoil(seg(p, .56, .625));
      set(R.win, `translate(${(Number(rattle(210, 2)) + shock * 4).toFixed(2)}px,${par(-30)}px)`);
      set(R.clock, `translate(${(Number(rattle(190, 3)) + shock * 3 + co.x * zc).toFixed(2)}px,${(Number(par(-20)) + co.y * zc).toFixed(2)}px) rotate(${(Number(rattle(230, 4)) + recoil(seg(p, .565, .67)) * 12).toFixed(2)}deg)`);
      set(R.lamp, `translate(0,${par(-14)}px) rotate(${(Number(rattle(180, 2)) + recoil(seg(p, .564, .69)) * 7).toFixed(2)}deg)`, 1 - eInOut(seg(p, .22, .27)));
      set(R.fridge, `translate(${(Number(rattle(240, 3)) + shock * 2).toFixed(2)}px,${par(-6)}px)`);
      set(R.grr, `translate(${rattle(170, 6)}px,${rattle(200, 4)}px) rotate(${rattle(140, 4)}deg) scale(${lerp(.6, 1.12, eOut(g)).toFixed(3)})`, gs);
      const open = eOut(seg(p, .06, .13)) * (1 - eInOut(seg(p, .17, .21)));
      set(R.door, `perspective(1200px) rotateY(${(-72 * open).toFixed(2)}deg)`);
      set(R.light, 'none', open); set(R.spill, 'none', open);
      set(R.scooter, `translateX(${lerp(-130, 520, eInOut(seg(p, .08, .22))).toFixed(1)}%) translateY(${(Math.sin(p * 200) * 3).toFixed(1)}%)`);
      // chapter 2: the camera pushes into the phone; the app scrolls, the basket fills, a thumb reaches
      const z = eInOut(seg(p, .22, .3)), Rm = R.room;
      set(R.phone, `translate(${lerp(Rm.dx, 0, z).toFixed(1)}px,${lerp(Rm.dy, 0, z).toFixed(1)}px) scale(${lerp(Rm.s, 1, z).toFixed(4)}) rotate(${lerp(-5, 0, z).toFixed(2)}deg)`);   // solid to the end: the Pause is the last thing you see
      // The window retains its navy sky throughout the push-in.
      // Tiny distant-phone labels become readable only at the full-size close-up.
      const details = seg(p, .29, .31);
      R.labels.forEach(el => set(el, 'none', details));
      if (R.shown.details !== details) { R.shown.details = details; R.phone.style.setProperty('--summary-opacity', 1 - details); }
      const lit = eOut(seg(p, .14, .24)), paused = eOut(seg(p, .61, .66));
      set(R.glow, 'none', lit);
      set(R.pause, `translateY(${((1 - paused) * 100).toFixed(2)}%)`, paused > .001 ? 1 : 0);   // the Pause slides up over the app
      set(R.cone, 'none', .55 + .45 * lit);
      capsAt(R.caps, p);
      R.list.style.transform = `translate3d(0,${(-R.listMax * eInOut(seg(p, .29, .47))).toFixed(1)}px,0)`;
      let n = 0, tot = 0;
      R.items.forEach(it => {
        if (!it.at) return;
        const tap = seg(p, it.at, it.at + .012);
        it.plus.style.opacity = 1 - tap; it.one.style.opacity = tap;
        it.el.style.transform = `scale(${(1 + .06 * Math.sin(seg(p, it.at, it.at + .02) * Math.PI)).toFixed(4)})`;
        if (p >= it.at + .006) n++;
        tot += it.price * eOut(seg(p, it.at, it.at + .03));
      });
      const v = Math.round(tot);
      if (R.shown.n !== n) { R.count.textContent = n; R.shown.n = n; }
      if (R.shown.v !== v) { R.total.textContent = '£' + v; R.shown.v = v; }
      // the tap: the finger glides in on a curve, winds up, presses the order button, lets go, and leaves before pal lands
      const T = R.tip, F = R.tapFrom, O = R.tapOut;
      const glide = eInOut(seg(p, .446, .5)), gi = 1 - glide;
      const wind = eOut(seg(p, .5, .507)) * (1 - eIn(seg(p, .507, .512)));         // a little lift before the press
      const press = eIn(seg(p, .507, .512)) * (1 - eSpring(seg(p, .52, .536)));   // down, hold, and a springy release
      const leave = eIn(seg(p, .536, .552));
      // a quadratic curve from below the frame, sweeping in from the right, ending with the fingertip on the button
      let hx = T.x + gi * gi * F.x + 2 * gi * glide * .62 * pw, hy = T.y + gi * gi * F.y + 2 * gi * glide * .06 * pw;
      hx += wind * .03 * pw + leave * O.x; hy += -wind * .045 * pw + press * 3 + leave * O.y;
      set(R.hand, `translate(${(hx - .46 * R.handW).toFixed(1)}px,${(hy - .06 * R.handH).toFixed(1)}px) rotate(${(-26 * gi + 5 * wind - 2 * press + 22 * leave).toFixed(2)}deg) scale(${(1.06 + .07 * wind - .11 * press).toFixed(4)})`, p >= .446 && leave < 1 ? 1 : 0);
      const ring = seg(p, .511, .545);
      set(R.tapRing, `scale(${lerp(.25, 1.5, eOut(ring)).toFixed(3)})`, ring > 0 && ring < 1 ? (1 - ring) * .9 : 0);
      // chapter 3: pal drops in, squashes the button, the Pause takes over
      const contact = eOut(seg(p, .56, .568)), rebound = seg(p, .568, .635);
      const settleSpring = eSpring(rebound);
      const pulse = 1 + .035 * Math.sin(seg(p, .462, .506) * Math.PI * 2);   // one inviting breath before the tap
      const buttonX = lerp(1, 1.12, contact) - .06 * settleSpring + .05 * press;
      const buttonY = lerp(1, .64, contact) + .14 * settleSpring - .1 * press;
      set(R.btn, `scale(${(pulse * buttonX).toFixed(4)},${(pulse * buttonY).toFixed(4)})`);
      // The face moves over a fixed lip: only composited transforms change during the press.
      set(R.btnFace, `translateY(${(3 * clamp(press, 0, 1)).toFixed(2)}px)`);
      const fall = seg(p, .5, .56);
      const py = p < .56 ? lerp(-1.4 * R.H, 0, eIn(fall)) : -Math.sin(rebound * Math.PI) * Math.exp(-3 * rebound) * .09 * pw;
      const sx = p < .56 ? lerp(1, .88, fall) : lerp(.88, 1.25, contact) - .25 * settleSpring;
      const sy = p < .56 ? lerp(1, 1.16, fall) : lerp(1.16, .76, contact) + .24 * settleSpring;
      const settle = eInOut(seg(p, .583, .639));
      const icon = lerp(1, .56, settle);            // then he hops up to the top of the Pause, where the shield shows its icon
      set(R.pal, `translateY(${(py + lerp(R.contactY, -1 * pw, settle)).toFixed(1)}px) scale(${(sx * icon).toFixed(4)},${(sy * icon).toFixed(4)})`, p < .5 ? 0 : 1);
      const u = seg(p, .563, .663);
      R.dust.forEach((el, i) => {                   // puffs burst out from under the button's edges
        const dir = i % 2 ? 1 : -1, k = (i >> 1) + 1;
        set(el, `translate(${(dir * (R.bw * .5 + k * .07 * pw * eOut(u))).toFixed(1)}px,${(-k * .035 * pw * eOut(u)).toFixed(1)}px) scale(${lerp(.4, 1.2, u).toFixed(3)})`, u > 0 && u < 1 ? 1 - u : 0);
      });
      t = seg(p, .66, .69); set(R.bub, `scale(${Math.max(.05, eBack(t)).toFixed(4)})`, t);
      t = seg(p, .69, .72); set(R.stk, `scale(${lerp(1.4, 1, eOut(t)).toFixed(4)})`, t);
      t = eOut(seg(p, .755, .78)); set(R.cap, `translateY(${lerp(30, 0, t).toFixed(1)}px)`, t * (1 - seg(p, .83, .86)));   // after the thrown food has landed
      // the food: floats in with the craving, thrown onto the counter when pal lands
      R.foods.forEach((f, i) => {
        const blast = seg(p, .564 + i * .003, .72 + i * .006);
        const a = eOut(seg(p, .1 + i * .025, .22 + i * .025)), [dx, , dr] = R.dirs[i], L = R.land[i];
        const bob = Math.sin(p * 40 + i * 1.7) * 9 * (1 - blast), arc = Math.sin(blast * Math.PI) * 18 * vh;
        set(f, `translate3d(${(L.x * eOut(blast)).toFixed(1)}px,${(lerp(6 * vh, 0, a) + bob + L.y * eIn(blast) - arc).toFixed(1)}px,0) rotate(calc(var(--tilt, 0deg) + ${(lerp(dx * 40, 0, a) + dr * eOut(blast) * (200 + i * 40)).toFixed(1)}deg)) scale(${lerp(.6, 1, a).toFixed(3)})`, Math.min(a * 2, 1));
      });

    };
    return R;
  }

  /* Scene B: one planted chef chops, puts down the knife, picks up the spoon,
     stirs below the back rim, lifts spaghetti and flicks it onto the plate.
     Utensils remain solid: the knife parks on the board, the spoon in the pan. All motion is seekable. */
  function buildB(st) {
    const q = s => $(s, st), qa = s => $$(s, st);
    const R = {
      st, caps: qa('.k-caps .cap').map(cue), warm:q('.kx-warm'), win:q('.nx-win'), clock:q('.nx-clock'), hh:q('.nx-clock__h'), mm:q('.nx-clock__m'),
      cone:q('.nx-lamp__cone'), fridge:q('.nx-fridge'), door:q('.nx-fridge__door'), light:q('.nx-fridge__light'), spill:q('.nx-fridge__spill'), fCarrot:q('.nx-fridge__body .nx-carrot'),
      flames:q('.kx-flames'), hob:q('.kx-hob'), pan:q('.kx-pan'), front:q('.kx-pan-front'), pop:q('.kx-pop'), steam:q('.kx-pan .kx-steam'),
      sauce:q('.kx-sauce'), noodles:q('.kx-noodles'), board:q('.kx-board'), carrot:q('.kx-carrot'), carrotShape:q('.k-carrot-shape'),
      ings:qa('.ing'), slices:qa('.slices i'), plate:q('.kx-plate'), meal:q('.kx-meal'), dSteam:q('.kx-plate .kx-steam'), sparks:qa('.kx-spark'), price:q('.k-price'),
      pal:q('.k-pal'), hat:q('.k-pal .k-hat'), face:q('.k-pal .pal__face'), happy:q('.k-happy'), arm:q('.k-arm'), rest:q('.k-rest'),
      spoon:q('.k-spoon'), shaft:q('.k-spoon__shaft'), wood:q('.k-spoon__wood'), bowl:q('.k-spoon__bowl'), knife:q('.k-knife'), food:q('.k-serving'),
      utensils:q('.k-utensils'), hands:qa('.k-hand-left,.k-hand-right'), says:qa('.k-say').map(cue)
    };
    R.flights=[[0,.08,.16,'pan'],[2,.11,.18,'board'],[1,.18,.24,'pan'],[3,.38,.43,'pan'],[4,.43,.48,'pan']];
    R.chops=[.2,.237,.274,.311,.348];
    R.all=[...Object.values(R).filter(v=>v instanceof Element),...R.ings,...R.slices,...R.sparks,...R.says.map(c=>c.el),...R.caps.map(c=>c.el)];
    R.measure=()=>{
      const W=st.offsetWidth,H=st.offsetHeight,b=boxIn(R.board,st),pan=boxIn(R.pan,st),pl=boxIn(R.plate,st),f=boxIn(R.fridge,st),nat=boxIn(R.pal,st);
      const u=b.w/626, cw=b.w*.5,ch=cw*50/160,ct=b.t+b.h*.6-ch;
      const k={l:b.l,t:ct-436*u,w:b.w,h:600*u};
      const hob=boxIn(R.hob,st);
      R.panDrop=Math.max(0,hob.t+hob.h*.88-(pan.t+pan.h*107/110))+1;
      R.W=W; R.H=H; R.u=u; R.k=k; R.b=b; R.panBox=pan; R.pl=pl;
      R.from={x:f.l+f.w*.5,y:f.t+f.h*.5}; R.carrotAt={x:b.l+b.w*.43,y:ct+ch*.5}; R.carrotBox={l:b.l+b.w*.18,t:ct,w:cw,h:ch};
      R.panAt={x:pan.l+pan.w*106/260,y:pan.t+pan.h*40/110};
      R.plateAt={x:pl.l+pl.w*.5,y:pl.t+pl.h*100/150};
      R.grip={x:k.l+78*u,y:k.t+450*u};
      // The spoon is one rigid stick laid over the pan's right lip: handle on the board until pal picks it up,
      // bowl down in the food. Its length puts the bowl near the middle of the pan when pal holds it.
      R.lip={x:pan.l+pan.w*198/260,y:pan.t+pan.h*40/110};
      R.spoonRest={x:b.l+b.w*.05,y:R.grip.y-4*u};   // handle end leans on the board's left edge, at hand height
      const gl=Math.hypot(R.lip.x-R.grip.x,R.lip.y-R.grip.y);
      R.spoonLength=gl+(R.lip.x-(pan.l+pan.w*118/260))*gl/(R.grip.x-R.lip.x);
      R.toward={x:(R.lip.x-R.grip.x)/gl,y:(R.lip.y-R.grip.y)/gl};
      R.push=90*u;
      R.knifePark={x:b.l+b.w*.86,y:b.t+b.h*.67};
      R.plateOff=Math.min(pl.w*.15,Math.max(0,W-pl.l-pl.w-8));
      R.ingW=R.ings.map(el=>svgBox(el,st).w); R.sliceW=R.slices[0].offsetWidth; R.sliceH=R.slices[0].offsetHeight;
      R.applyGeometry=()=>{
        R.utensils.setAttribute('viewBox','0 0 '+W+' '+H);
        Object.assign(R.front.style,{left:pan.l+'px',top:pan.t+'px',width:pan.w+'px',height:pan.h+'px'});
        R.hands.forEach(el=>Object.assign(el.style,{left:k.l+'px',top:k.t+'px',width:k.w+'px',height:k.h+'px'}));
        // Natural pose is moved as a unit; face and hat never change registration.
        R.palTF='translate('+(k.l+k.w/2-nat.l-nat.w/2)+'px,'+(k.t+k.h-nat.t-nat.h)+'px) scale('+(k.w/nat.w)+')';
        R.shaft.setAttribute('d','M0 0H'+R.spoonLength); R.wood.setAttribute('d','M0 0H'+R.spoonLength);
        R.shaft.setAttribute('stroke-width',Math.max(3,14*u)); R.wood.setAttribute('stroke-width',Math.max(1.6,8*u));
        R.bowl.setAttribute('cx',R.spoonLength); R.bowl.setAttribute('cy',0);R.bowl.setAttribute('rx',29*u);R.bowl.setAttribute('ry',17*u);R.bowl.setAttribute('stroke-width',Math.max(2,6*u));
      };
    };
    const mix=(a,b,t)=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
    const tf=(v,angle=0,scale=1)=>'translate('+v.x.toFixed(3)+'px,'+v.y.toFixed(3)+'px) rotate('+angle.toFixed(3)+'deg) scale('+scale.toFixed(5)+')';
    R.render=p=>{
      const {u,k,b}=R,pan=R.panBox;
      capsAt(R.caps,p);
      set(R.warm,'none',eOut(seg(p,0,.08)));set(R.cone,'none',.8);
      R.mm.style.transform='rotate('+lerp(360,510,p)+'deg)';R.hh.style.transform='rotate('+lerp(270,282.5,p)+'deg)';
      set(R.win,'translateY('+((p-.5)*-30).toFixed(2)+'px)');set(R.clock,'none');
      const open=eOut(seg(p,.04,.1))*(1-eInOut(seg(p,.48,.51)));
      set(R.door,'perspective(2400px) rotateY('+(-72*open)+'deg)');set(R.light,'none',open);set(R.spill,'none',open);set(R.fCarrot,'none',p<.115?1:0);
      R.flights.forEach(([i,a,z,to])=>{
        const t=seg(p,a,z),board=to==='board',target=board?R.carrotAt:R.panAt,w=R.ingW[i],h=board?w*50/160:w;
        const at=mix(R.from,target,t),lift=Math.max(R.H*(board?.15:.06),Math.abs(target.y-R.from.y)/4+8),sink=board?0:seg(p,z,z+.014)*pan.h*.48;
        set(R.ings[i],tf({x:at.x-w/2,y:at.y-h/2-4*lift*t*(1-t)+sink},board?0:(i%2?100:-120)*t,lerp(.55,board?R.carrotBox.w/w:.55,t)),p>=a&&p<z+(board?0:.014)?1:0);
      });
      // One set of hands chops and then deliberately parks the knife over .02 progress.
      let chop=0,cutProgress=0;
      R.chops.forEach(c=>{chop+=p<c-.004?eInOut(seg(p,c-.010,c-.004)):1-eInOut(seg(p,c-.004,c+.002));cutProgress+=eInOut(seg(p,c+.006,c+.022));});
      const cuts=R.chops.filter(c=>p>=c+.002).length,remaining=1-.08*cuts;
      R.carrotShape.setAttribute('d',cuts?'M8 26q4-14 20-14h'+(126*remaining-28)+'v28H28Q12 40 8 26z':'M8 26q4-14 20-14h96l30 14-30 14H28Q12 40 8 26z');
      set(R.carrot,'none',p>=.18?1:0);
      R.carrot.style.clipPath=cuts?'inset(0 '+((1-remaining)*100+6.5)+'% 0 0)':'none';
      const putting=seg(p,.416,.436),down=putting*putting*(3-2*putting);
      // A short wrist flick sends the rounds across the board; the hand never scales.
      const flick=Math.sin(seg(p,.366,.400)*Math.PI);
      const cutting={x:k.l+(544-8*cutProgress-12*flick)*u,y:k.t+(450-34*chop+14*flick)*u};
      const knife=mix(cutting,R.knifePark,down),knifeAngle=lerp(-4-2*flick,-4,down);
      set(R.knife,tf(knife,knifeAngle,u));
      const rightHome={x:k.l+556*u,y:k.t+492*u};
      const right=mix({...knife,y:Math.max(knife.y,k.t+450*u)},rightHome,eInOut(seg(p,.436,.456)));
      set(R.rest,'translate('+((right.x-k.l)/u-556).toFixed(3)+'px,'+((right.y-k.t)/u-492).toFixed(3)+'px)');
      // Five readable rounds: cut, collect, scrape, arc, bounce, then simmer.
      // Positions are derived from the measured board and pan, including phone layouts.
      R.slices.forEach((el,i)=>{
        const cut=eOut(seg(p,R.chops[i]+.004,R.chops[i]+.025));
        const from={x:R.carrotBox.l+R.carrotBox.w*(.93-.08*i),y:R.carrotBox.t+R.carrotBox.h*.6};
        const row={x:b.l+b.w*(.28+i*.115),y:b.t+b.h*.70};
        const edge={x:b.l+b.w*(.08+i*.045),y:b.t+b.h*.57};
        let at=mix(from,row,cut);
        const scrape=eInOut(seg(p,.366,.390));
        at=mix(at,edge,scrape);
        const launch=.390+i*.006,land=launch+.052,flight=seg(p,launch,land);
        const target={x:pan.l+pan.w*(.22+i*.082),y:pan.t+pan.h*(.31+(i%2)*.045)};
        let angle=i*13;
        if(p>=launch){
          at=mix(edge,target,flight);
          at.y-=4*Math.max(30,pan.w*.27)*flight*(1-flight);
          const bounce=seg(p,land,land+.018);
          at.y-=Math.sin(bounce*Math.PI)*Math.max(3,pan.w*.025)*(1-bounce);
          angle=lerp(i*13,-180-i*24,flight);
        }
        set(el,tf({x:at.x-R.sliceW/2,y:at.y-R.sliceH/2},angle),p>=R.chops[i]+.004&&p<.684?1:0);
      });
      // Spoon: pal lifts its handle off the board, pushes and pulls it through the food in three strokes
      // (the shaft always crossing the pan's lip), scoops the spaghetti up and flicks it, then lays it back down.
      const cool=eInOut(seg(p,.800,.820)),panDrop=R.panDrop*eInOut(seg(p,.780,.800));
      const spoonPose=q=>{
        const lip={x:R.lip.x,y:R.lip.y+R.panDrop*eInOut(seg(q,.780,.800))};
        const on=seg(q,.490,.506)*(1-seg(q,.668,.684)),th=seg(q,.502,.674)*Math.PI*6;
        const push=R.push*on*(1-Math.cos(th))/2;
        const hold={x:R.grip.x+R.toward.x*push,y:Math.min(R.grip.y+R.toward.y*push+Math.sin(th)*10*u*on,lip.y-3)};
        const lift=eInOut(seg(q,.684,.712))*(1-eInOut(seg(q,.722,.760))),flick=Math.sin(seg(q,.708,.726)*Math.PI);
        hold.x+=lift*10*u; hold.y+=lift*8*u;
        const G=q<.790?mix(R.spoonRest,hold,eInOut(seg(q,.468,.490))):mix(hold,R.spoonRest,eInOut(seg(q,.790,.812)));
        const a=Math.atan2(lip.y-G.y,lip.x-G.x)+lift*.42+flick*.22;
        return {G,a,tip:{x:G.x+Math.cos(a)*R.spoonLength,y:G.y+Math.sin(a)*R.spoonLength}};
      };
      const sp=spoonPose(p),grip=sp.G,angle=sp.a;
      set(R.spoon,tf(grip,angle*180/Math.PI));
      const steady={x:k.l+(96-12*cutProgress)*u,y:k.t+478*u};
      const left=p<.468?mix(steady,R.spoonRest,eInOut(seg(p,.452,.468))):p<.812?grip:mix(R.spoonRest,steady,eInOut(seg(p,.812,.832)));
      set(R.arm,'translate('+((left.x-k.l)/u-96).toFixed(3)+'px,'+((left.y-k.t)/u-474).toFixed(3)+'px)');
      set(R.pan,'translateY('+panDrop+'px)');set(R.front,'translateY('+panDrop+'px)');
      // During stirring, the near wall masks the shaft below the lip.
      R.front.style.zIndex='8';
      set(R.flames,'scaleY('+(1-cool)+')',1-cool);
      set(R.steam,'none',seg(p,.22,.3)*(1-seg(p,.7,.73)));
      let pop=0;R.flights.filter(f=>f[3]==='pan').forEach(f=>{pop=Math.max(pop,Math.sin(seg(p,f[2],f[2]+.026)*Math.PI));});
      R.chops.forEach((_,i)=>{pop=Math.max(pop,Math.sin(seg(p,.442+i*.006,.466+i*.006)*Math.PI));});
      set(R.pop,'scale('+(.5+.7*pop)+')',pop);
      // Solid spaghetti follows the spoon out of the pan, then a ballistic toss clears the hat.
      set(R.noodles,'none',0);set(R.sauce,'none',p>=.16&&p<.24?1:0);
      const foodScale=pan.w/260,carry=seg(p,.684,.716);
      let foodAt={...R.panAt};
      // While stirring, the spaghetti is dragged a little by the bowl.
      if(p<.684)foodAt.x+=(sp.tip.x-spoonPose(.49).tip.x)*.6*seg(p,.490,.506)*(1-seg(p,.668,.684));
      if(p>=.684){foodAt=mix(R.panAt,sp.tip,eInOut(seg(p,.684,.694)));}
      const launch=spoonPose(.716).tip;
      const landAt=.778,flight=seg(p,.716,landAt);
      if(p>=.716){foodAt=mix(launch,R.plateAt,flight);const liftH=Math.max(k.h*.98,(launch.y+R.plateAt.y)/2-(k.t-k.w*.24)+40);foodAt.y-=4*liftH*flight*(1-flight);
        // Give the larger toque its own clearance on the descending half of the toss.
        const hatClear=Math.sin(seg(flight,.40,.84)*Math.PI);
        foodAt.y-=hatClear*k.w*.38;
        if(R.W<=760||(R.W<=1100&&R.H/R.W>=1.25)){
          // Portrait plating curls around the right of the toque before dropping.
          foodAt.x=Math.min(R.W-8,foodAt.x+k.w*.62*Math.sin(seg(flight,.35,1)*Math.PI));
        }}
      const fs=foodScale*lerp(1,.72,carry)*lerp(1,.72,flight);
      set(R.food,'translate('+(foodAt.x-106*fs).toFixed(3)+'px,'+(foodAt.y-40*fs).toFixed(3)+'px) scale('+fs.toFixed(5)+')',p>=.24&&p<landAt?1:0);
      if(p>=.684&&p<landAt)R.slices.forEach((el,i)=>{
        const x=foodAt.x+(pan.w*(.22+i*.082)-pan.w*106/260)*(fs/foodScale);
        const y=foodAt.y+(pan.h*(.31+(i%2)*.045)-pan.h*40/110)*(fs/foodScale);
        set(el,tf({x:x-R.sliceW/2,y:y-R.sliceH/2},-180-i*24,fs/foodScale));
      });
      const plateIn=eOut(seg(p,.62,.68)),impact=Math.sin(seg(p,landAt,landAt+.032)*Math.PI);
      set(R.plate,'translateX('+((1-plateIn)*R.plateOff).toFixed(3)+'px) scale('+(1+.07*impact)+','+(1-.12*impact)+')',plateIn);
      const bloom=seg(p,landAt,landAt+.05);
      set(R.meal,'scale(1,'+Math.max(.05,eSpring(bloom)).toFixed(5)+')',p>=landAt?1:0);
      R.sparks.forEach((el,i)=>{const t=seg(p,.81+i*.008,.846+i*.008),v=Math.sin(t*Math.PI);set(el,'scale('+(.3+v)+') rotate('+(t*90)+'deg)',v);});
      set(R.dSteam,'none',seg(p,.82,.855));set(R.price,'rotate(8deg) scale('+Math.max(.05,eBack(seg(p,.83,.865)))+')',seg(p,.83,.84));
      set(R.pal,R.palTF);set(R.hat,'none');set(R.face,'none',p<.81?1:0);set(R.happy,'none',p>=.81?1:0);
      R.says.forEach(({el,a,b:z})=>{const t=seg(p,a,a+.015),o=t*(1-seg(p,z-.015,z));set(el,'scale('+Math.max(.05,eOut(seg(p,a,a+.025)))+')',o);});
    };
    return R;
  }

  const sceneSources = [[$('[data-night]'), buildA], [$('[data-cook]'), buildB]];
  const buildScenes = () => sceneSources.forEach(([section, build]) => addScene(section, build));
  buildScenes();

  /* ---------- measure (load, resize, layout changes) ---------- */
  const pageTop = el => { let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t; };
  function measure() {
    G.vh = innerHeight; G.vw = innerWidth; G.max = Math.max(0, root.scrollHeight - G.vh);
    for (const sc of scenes) { sc.top = pageTop(sc.section); sc.h = sc.section.offsetHeight; sc.stageH = sc.R.st.offsetHeight; sc.R.measure(); sc.last = -1; }
    for (const k of strips) k.R.measure();
    S.target = clamp(S.target, 0, G.max);
  }

  /* ---------- one loop: read, then compute and write. It sleeps when nothing is moving. ---------- */
  let running = false, ready = false, still = 0, lastT = 0, frameId = 0, ro;
  function kick() { still = 0; if (ready && !running && !d.hidden) { running = true; lastT = performance.now(); frameId = requestAnimationFrame(frame); } }
  function sleep() {
    cancelAnimationFrame(frameId); frameId = 0; running = false; cool();
    for (const sc of scenes) sc.R.st.classList.add('motion-idle');
  }
  function frame(now) {
    if (d.hidden) { sleep(); return; }
    const dt = clamp((now - lastT) / 1000, 1 / 240, 1 / 20); lastT = now;
    // 1. read
    const sy = scrollY;
    const measured = geometryDirty;
    if (measured) { measure(); geometryDirty = false; }
    const y = stepScroll(now, dt, sy);
    // 2. all layout reads are complete before any geometry or animation writes
    if (measured) {
      for (const sc of scenes) sc.R.applyGeometry();
      for (const k of strips) { k.R.applyGeometry(); k.R.render(k.p); }
    }
    let busy = S.moving;
    if (!reduce) busy = scenesWrite(y) || busy;
    // 3. scroll last, so this frame shows the position everything above was computed for
    if (S.on && Math.abs(y - sy) > .01) { scrollTo({ top: y, left: 0, behavior: 'instant' }); S.written = y; }
    if (!S.moving && S.focus) {
      const el = S.focus; S.focus = null;
      const temporaryTabindex = !el.hasAttribute('tabindex');
      if (temporaryTabindex) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      if (temporaryTabindex) el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
    }
    still = busy ? 0 : still + dt;
    if (still >= .08) { sleep(); return; }
    for (const sc of scenes) sc.R.st.classList.toggle('motion-idle', !visible(sc.R.st) || !busy);
    frameId = requestAnimationFrame(frame);
  }

  /* ---------- image warm-up is optional and independent of scene readiness ---------- */
  const idle = f => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 300));
  function warm() {
    for (const img of $$('.night img')) {
      img.loading = 'eager';
      // Do not chain decodes: one pending image must not block the other poses.
      if (img.decode) img.decode().catch(() => {});
    }
  }

  const start = () => {
    ready = true; invalidate();
    ro = new ResizeObserver(invalidate);
    ro.observe(d.body);
    for (const sc of scenes) ro.observe(sc.R.st);
  };
  // Start immediately. A pending decode (especially in a hidden Chrome tab) must
  // never leave both scenes unmeasured and the chopping rig at its CSS zero size.
  start();
  // Font metrics can change after the first frame; remeasure without blocking it.
  d.fonts?.ready.then(invalidate);
  addEventListener('resize', invalidate, { passive: true });
  d.addEventListener('visibilitychange', () => {
    root.classList.toggle('motion-hidden', d.hidden);
    if (d.hidden) { cancelScroll(); sleep(); } else invalidate();
  });
  addEventListener('pagehide', () => { cancelScroll(); sleep(); });
  addEventListener('pageshow', invalidate);
  motionPreference.addEventListener('change', () => {
    cancelScroll(); sleep(); reduce = motionPreference.matches; S.on = !reduce;
    for (const sc of scenes) { io.unobserve(sc.R.st); ro?.unobserve(sc.R.st); }
    for (const [section] of sceneSources) {
      const stages = $$('[data-stage]', section);
      stages.slice(1).forEach(stage => stage.remove());
      stages[0].classList.remove('motion-paused', 'motion-idle');
      section.classList.remove('is-strip', 'is-pinned');
    }
    scenes.length = 0; strips.length = 0; buildScenes();
    for (const sc of scenes) ro?.observe(sc.R.st);
    invalidate();
  });
  if (d.readyState === 'complete') idle(warm); else addEventListener('load', () => idle(warm), { once: true });
})();
