/* cravepal.app: pal's brain. Plain JavaScript, no libraries, nothing sent anywhere, nothing stored.
   Everything here is decoration on a page that works without it. Reduced motion gets the calm version.

   How it stays smooth:
   - One requestAnimationFrame loop. Each frame reads first (scroll, a few boxes), then computes, then writes.
   - Every scroll-linked value eases toward its target (damped lerp, frame-rate independent), so nothing snaps.
   - Only transform and opacity change per frame. Layers get will-change only while they move.
   - The loop sleeps when nothing is moving. Images are decoded in idle time, not mid-scroll. */
(() => {
  'use strict';
  const d = document, root = d.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const eOut = t => 1 - (1 - t) ** 3;
  const eIn = t => t * t;
  const eInOut = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const eBack = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  const eExpo = t => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
  const rand = (a, b) => a + Math.random() * (b - a);
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  const policy = d.body.classList.contains('policy');
  const base = policy ? '../' : '';

  /* ---------- layers that are moving right now get will-change; it is dropped when the loop sleeps ---------- */
  const hot = new Set();
  const heat = els => { for (const el of els) if (el && !hot.has(el)) { el.style.willChange = 'transform, opacity'; hot.add(el); } };
  const cool = () => { for (const el of hot) el.style.willChange = ''; hot.clear(); };

  /* ---------- geometry, measured on load and resize, never per frame ---------- */
  const G = { vh: innerHeight, vw: innerWidth, max: 0 };
  const hero = $('[data-hero]'), money = $('[data-money]');
  const clip = $('[data-print-clip]'), receipt = $('[data-print]');

  /* ---------- input ---------- */
  const ptr = { x: innerWidth / 2, y: innerHeight / 3, mouse: false, tapAt: 0 };
  let lastActive = performance.now();
  const poke = () => { lastActive = performance.now(); if (asleep) wakeUp(); kick(); };
  addEventListener('pointermove', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.mouse = e.pointerType === 'mouse'; poke(); }, { passive: true });
  addEventListener('pointerdown', e => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.tapAt = performance.now(); poke(); }, { passive: true });

  const seen = new WeakMap();
  const io = new IntersectionObserver(es => { es.forEach(e => seen.set(e.target, e.isIntersecting)); kick(); }, { rootMargin: '160px 0px' });
  const watch = el => { if (el) { seen.set(el, false); io.observe(el); } return el; };
  const visible = el => !!seen.get(el);

  /* ---------- smooth scrolling: wheel and trackpad glide, touch and keyboard stay native ---------- */
  const S = { on: !reduce, y: scrollY, target: scrollY, written: scrollY, moving: false, tween: null, focus: null };
  const canScrollInside = (el, dy) => {
    for (; el && el !== d.body && el !== root; el = el.parentElement) {
      const o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1 &&
          (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0)) return true;
    }
    return false;
  };
  if (S.on) {
    // Not passive: taking over the wheel needs preventDefault. Every other listener is passive.
    addEventListener('wheel', e => {
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // pinch zoom and sideways stay native
      let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? G.vh : 1);
      if (canScrollInside(e.target, dy)) return;
      e.preventDefault();
      if (!S.moving) S.y = S.target = scrollY;
      S.tween = null;
      S.target = clamp(S.target + dy, 0, G.max);
      S.moving = true; poke();
    }, { passive: false });
    // Keys scroll natively; they simply cancel a glide in progress
    addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) { S.moving = false; S.tween = null; }
    }, { passive: true });
    // Same-page links glide (but the Pause demo's own fragments must change the hash as normal)
    d.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      const el = id && d.getElementById(id);
      if (!el || el.classList.contains('tgt')) return;
      e.preventDefault();
      const to = clamp(el.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0), 0, G.max);
      S.y = scrollY;
      S.tween = { from: S.y, to, t0: performance.now(), dur: clamp(Math.abs(to - S.y) * .35, 700, 1600) };
      S.target = to; S.moving = true; S.focus = el;
      history.pushState(null, '', '#' + id);
      poke();
    });
  }
  addEventListener('scroll', () => {
    if (S.moving && Math.abs(scrollY - S.written) > 4) { S.moving = false; S.tween = null; }   // a scrollbar, a key or find-in-page took over
    if (!S.moving) S.y = S.target = scrollY;
    poke();
  }, { passive: true });
  function stepScroll(now, dt) {
    if (!S.moving) return scrollY;
    if (S.tween) {
      const t = clamp((now - S.tween.t0) / S.tween.dur, 0, 1);
      S.y = lerp(S.tween.from, S.tween.to, eExpo(t));
      if (t >= 1) {
        S.tween = null; S.moving = false;
        if (S.focus) { if (!S.focus.hasAttribute('tabindex')) S.focus.setAttribute('tabindex', '-1'); S.focus.focus({ preventScroll: true }); S.focus = null; }
      }
    } else {
      S.y = damp(S.y, S.target, 7, dt);
      if (Math.abs(S.target - S.y) < .5) { S.y = S.target; S.moving = false; }
    }
    return S.y;
  }

  /* ---------- pal's lines ---------- */
  const LINES = policy
    ? ['i read it twice.', 'the short version is the good bit.', 'no snacks were shared in this policy.', 'boop received. not stored.', 'hello@cravepal.app if you have questions.', 'still reading? proud of you.']
    : ['oi.', 'hands off the wallet.', 'i’m a dumpling, not a button.', 'the fridge is that way.', 'nice try.', 'toast exists, you know.', 'pasta takes ten minutes.', 'stop poking. start cooking.', 'rude.', 'beans on toast. trust me.'];
  let lineAt = 0, boops = 0;
  const say = (bubble, text) => {
    if (!bubble) return;
    bubble.hidden = false;
    bubble.textContent = text;
    bubble.classList.remove('is-pop'); void bubble.offsetWidth; bubble.classList.add('is-pop');
    clearTimeout(bubble._t);
    bubble._t = setTimeout(() => { if (!bubble.matches('.bubble--hero')) bubble.hidden = true; }, 2600);
  };

  /* ---------- rigged pals: the face turns toward the cursor, the body leans ---------- */
  const rigs = $$('[data-rig]').map(el => (watch(el), { el, face: $('.pal__face', el), rig: $('.pal__rig', el), fx: 0, fy: 0, lean: 0, wx: 0, wy: 0, wt: 0, box: null }));
  function rigsRead() { for (const r of rigs) r.box = visible(r.el) ? r.el.getBoundingClientRect() : null; }
  function rigsWrite(now, dt) {
    let moving = false;
    for (const r of rigs) {
      if (!r.box) continue;
      const b = r.box, cx = b.left + b.width / 2, cy = b.top + b.height * .45;
      let tx, ty, lean;
      if (ptr.mouse || now - ptr.tapAt < 1800) {
        const dx = ptr.x - cx, dy = ptr.y - cy, dist = Math.hypot(dx, dy) || 1, k = Math.min(1, dist / (b.width * 1.2));
        tx = dx / dist * k * 4.6; ty = dy / dist * k * 3.6; lean = clamp(dx / G.vw * 16, -7, 7);
      } else {                                    // touch: he looks around on his own
        if (now > r.wt) { r.wx = rand(-4, 4); r.wy = rand(-3, 2.5); r.wt = now + rand(2400, 4800); }
        tx = r.wx; ty = r.wy; lean = r.wx * .6;
      }
      ty += clamp(vel * .05, -2.5, 2.5);          // a fast scroll makes him look along with it
      r.fx = damp(r.fx, tx, 9, dt); r.fy = damp(r.fy, ty, 9, dt); r.lean = damp(r.lean, lean, 5, dt);
      if (Math.abs(r.fx - tx) + Math.abs(r.fy - ty) + Math.abs(r.lean - lean) > .02) { moving = true; heat([r.face, r.rig]); }
      r.face.style.transform = `translate(${r.fx.toFixed(2)}%,${r.fy.toFixed(2)}%)`;
      r.rig.style.rotate = `${r.lean.toFixed(2)}deg`;
    }
    return moving;
  }

  /* ---------- boop ---------- */
  $$('[data-boop]').forEach(btn => btn.addEventListener('click', () => {
    boops++;
    const rig = $('.pal__rig', btn), bubble = btn.closest('.hero__pal, .foot__box, .policy-pal-wrap')?.querySelector('[data-bubble]');
    if (boops % 10 === 0) {
      say(bubble, policy ? 'ten boops. that’s not in the policy.' : 'ten boops. go and cook something.');
      if (!reduce) rig.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(180deg) scale(.8)' }, { transform: 'rotate(360deg) scale(1)' }], { duration: 760, easing: 'cubic-bezier(.77,0,.175,1)' });
      return;
    }
    say(bubble, LINES[lineAt++ % LINES.length]);
    if (!reduce) rig.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2,.8)' }, { transform: 'scale(.9,1.12)' }, { transform: 'scale(1.04,.97)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.23,1,.32,1)' });
  }));

  /* ---------- letters: bulge near the cursor; the hero's fly apart as you scroll away ---------- */
  const jellies = $$('[data-jelly]').map(el => {
    watch(el);
    const chs = $$('.ch', el).map(c => ({ c, ox: 0, oy: 0, tx: 0, ty: 0, r: 0, s: 1, sx: rand(-1, 1), sy: rand(-1.4, -.5), sr: rand(-70, 70) }));
    return { el, chs, scatter: el.hasAttribute('data-scatter'), fs: 100, box: null, sp: 0 };
  });
  function jellyRead() { for (const j of jellies) j.box = visible(j.el) ? j.el.getBoundingClientRect() : null; }
  function jellyWrite(y, dy, dt) {
    let moving = false;
    const hpT = hero ? clamp(y / (G.heroH * .85), 0, 1) : 0;
    for (const j of jellies) {
      if (!j.box) continue;
      const R = j.fs * 1.15, top = j.box.top - (j.scatter ? dy : 0), left = j.box.left;   // boxes were read before this frame's scroll
      if (j.scatter) j.sp = damp(j.sp, hpT, 10, dt);
      const s = eIn(j.sp);
      let any = false;
      for (const k of j.chs) {
        let tx = 0, ty = 0, rot = 0, sc = 1;
        if (ptr.mouse) {
          const ddx = ptr.x - (left + k.ox), ddy = ptr.y - (top + k.oy), dist = Math.hypot(ddx, ddy);
          const t = clamp(1 - dist / R, 0, 1), e = t * t * (3 - 2 * t);
          if (e > 0) { tx = -ddx / (dist || 1) * j.fs * .07 * e; ty = -j.fs * .1 * e; rot = (ddx > 0 ? -1 : 1) * 9 * e; sc = 1 + .26 * e; }
        }
        if (s > .0005) { tx += k.sx * s * G.vw * .4; ty += k.sy * s * G.vh * .7; rot += k.sr * s; }
        k.tx = damp(k.tx, tx, 12, dt); k.ty = damp(k.ty, ty, 12, dt); k.r = damp(k.r, rot, 12, dt); k.s = damp(k.s, sc, 12, dt);
        if (Math.abs(k.tx - tx) + Math.abs(k.ty - ty) > .3 || Math.abs(k.r - rot) > .1 || Math.abs(k.s - sc) > .002) any = true;
        const st = k.c.style;
        st.translate = `${k.tx.toFixed(1)}px ${k.ty.toFixed(1)}px`; st.rotate = `${k.r.toFixed(2)}deg`; st.scale = k.s.toFixed(3);
      }
      if (j.scatter && Math.abs(j.sp - hpT) > .0005) any = true;
      if (any) { moving = true; heat(j.chs.map(k => k.c)); }
    }
    return moving;
  }
  jellies.forEach(j => j.el.addEventListener('pointerdown', e => {
    if (reduce || e.pointerType === 'mouse') return;
    const b = j.el.getBoundingClientRect();
    j.chs.forEach(k => {
      const dist = Math.hypot(e.clientX - (b.left + k.ox), e.clientY - (b.top + k.oy));
      k.c.animate([{ transform: 'none' }, { transform: 'translateY(-.18em) scale(1.15,.9)' }, { transform: 'translateY(.03em) scale(.96,1.05)' }, { transform: 'none' }], { duration: 520, delay: dist * .9, easing: 'cubic-bezier(.23,1,.32,1)' });
    });
  }, { passive: true }));

  /* ---------- scroll speed drives the scrolling lines and the badge ---------- */
  let vel = 0, prevY = scrollY, skew = 0, rate = 1;
  const marquee = watch($('[data-marquee]'));
  const rows = marquee ? $$('.marquee__row', marquee) : [];
  const spinners = [...$$('.marquee__track'), ...$$('[data-spin]')].flatMap(el => el.getAnimations ? el.getAnimations() : []);
  function speedWrite(y, dt) {
    const step = (y - prevY) / Math.max(dt * 60, .25); prevY = y;             // pixels per 60th of a second
    vel = damp(vel, step, 10, dt);
    if (reduce) return Math.abs(vel) > .02;
    const rT = 1 + Math.min(5, Math.abs(vel) * .1);
    rate = damp(rate, rT, 4, dt);
    if (spinners.length && Math.abs(spinners[0].playbackRate - rate) > .02) spinners.forEach(a => a.updatePlaybackRate && a.updatePlaybackRate(rate));
    if (marquee && visible(marquee)) {
      const sT = clamp(-vel * .35, -14, 14);
      skew = damp(skew, sT, 8, dt);
      if (Math.abs(skew) > .01 || Math.abs(sT) > .01) heat(rows);
      rows.forEach((r, i) => { r.style.transform = `skewX(${(i ? -skew : skew).toFixed(2)}deg)`; });
    }
    return Math.abs(vel) > .02 || Math.abs(rate - 1) > .01 || Math.abs(skew) > .02;
  }

  /* ---------- the story: pinned scenes scrubbed by scroll ----------
     Each scene has build (find its parts), measure (geometry, on resize) and render(R, p), a pure function of
     progress p, so scrolling back plays it in reverse. With reduced motion the same render paints still panels. */
  const scenes = [], strips = [];
  const boxIn = (el, root) => { let l = 0, t = 0; for (let e = el; e && e !== root; e = e.offsetParent) { l += e.offsetLeft; t += e.offsetTop; } return { l, t, w: el.offsetWidth, h: el.offsetHeight }; };
  const svgBox = (el, root) => { const cs = getComputedStyle(el), b = boxIn(el.parentElement, root); return { l: b.l + (parseFloat(cs.left) || 0), t: b.t + (parseFloat(cs.top) || 0), w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || parseFloat(cs.width) || 0 }; };
  // Fully transparent pieces are hidden too: a near-zero scale on a shadowed element stalls rendering
  const set = (el, tf, op = 1) => { if (!el) return; el.style.transform = tf; el.style.opacity = op; el.style.visibility = op > .002 ? '' : 'hidden'; };
  const capsAt = (caps, p) => caps.forEach(c => {
    const a = +c.dataset.in, b = +c.dataset.out, o = seg(p, a, a + .008) * (1 - seg(p, b - .008, b));
    set(c, `translateY(${((1 - eOut(seg(p, a, a + .015))) * 16).toFixed(1)}px) rotate(-2deg)`, o);
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
    watch(section);
    scenes.push({ section, R: build(stage), p: 0, last: -1, top: 0, h: 0, span: +section.dataset.span || 1 });
  }
  function scenesWrite(y, dt) {
    let moving = false;
    for (const sc of scenes) {
      if (!visible(sc.section)) continue;
      const total = sc.h - G.vh;
      if (total <= 0) continue;                    // not pinned (layout failed): the CSS frame stands
      const pT = clamp((y - sc.top) / total, 0, 1);
      sc.p = damp(sc.p, pT, 9, dt);
      if (Math.abs(sc.p - pT) < .0003) sc.p = pT; else moving = true;
      if (Math.abs(sc.p - sc.last) < .00004) continue;
      heat(sc.R.all);
      sc.R.render(sc.p * sc.span, sc.last * sc.span);
      sc.last = sc.p;
    }
    return moving;
  }

  /* scene A, chapters 1 to 3: hungry, ordering, blocked */
  function buildA(st) {
    const q = s => $(s, st), qa = s => $$(s, st);
    const R = {
      st, head: q('.n-head'), n1: q('.n-1'), n2: q('.n-2'), grr: q('.n-grr'), caps: qa('.n-caps .cap'), cap: q('.n-cap'),
      win: q('.nx-win'), scooter: q('.nx-scooter'), clock: q('.nx-clock'), hh: q('.nx-clock__h'), mm: q('.nx-clock__m'),
      lamp: q('.nx-lamp'), cone: q('.nx-lamp__cone'), fridge: q('.nx-fridge'), door: q('.nx-fridge__door'), light: q('.nx-fridge__light'), spill: q('.nx-fridge__spill'),
      glow: q('.nx-glow:not(.nx-glow--pause)'), glowP: q('.nx-glow--pause'), dim: q('.nx-dim'), phone: q('.n-phone'),
      list: q('.app__list'), view: q('.app__view'), count: q('.app__count'), total: q('.app__total'),
      items: qa('.app__item').map(el => ({ el, at: +el.dataset.at || 0, price: +el.dataset.price || 0, plus: $('em span', el), one: $('em span + span', el) })),
      pause: q('.n-pause'), btn: q('.n-btn'), hand: q('.n-hand'), pal: q('.n-pal'), dust: qa('.n-dust i'), bub: q('.n-bubble'), stk: q('.n-sticker'),
      foods: qa('.food'), flick: q('.nx-flicker'), wipe: q('.n-wipe'), wipeIn: q('.n-wipe__in'), ring: q('.n-wipe__ring'),
      dirs: [[-1, -.8, -1], [-.6, -1.2, 1], [1, -.6, 1], [1.1, -1, -1], [1, .3, 1]], shown: { n: -1, v: -1 }
    };
    R.pal.style.transformOrigin = '50% 100%';
    R.all = [R.head, R.n1, R.n2, R.grr, R.cap, ...R.caps, R.win, R.scooter, R.clock, R.hh, R.mm, R.lamp, R.cone, R.fridge, R.door, R.light, R.spill,
      R.glow, R.glowP, R.dim, R.phone, R.list, R.pause, R.btn, R.hand, R.pal, R.bub, R.stk, R.wipe, R.wipeIn, R.ring, ...R.dust, ...R.foods, ...R.items.map(i => i.el)];
    R.measure = () => {
      const W = st.offsetWidth, H = st.offsetHeight, cs = getComputedStyle(R.phone), v = k => parseFloat(cs.getPropertyValue(k));
      const zH = H * v('--zoom-h'), rH = H * v('--room-h');
      R.W = W; R.H = H; R.pw = R.phone.offsetWidth; R.bw = R.btn.offsetWidth;
      R.room = { dx: W * v('--room-l') + rH / 2.11 / 2 - W / 2, dy: H - H * v('--room-b') - rH / 2 - (H * v('--zoom-t') + zH / 2), s: rH / zH };
      R.listMax = Math.max(0, R.list.offsetHeight - R.view.offsetHeight);
      // where each piece of food lands after pal's drop: on the counter, clear of every piece of text and of the phone
      const floor = boxIn(q('.nx-counter'), st).t + 8;
      const pad = b => ({ l: b.l - 22, t: b.t - 14, r: b.l + b.w + 22, b: b.t + b.h + 14 });
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
      // the wipe grows from the centre of the phone's screen; its inner layer is counter-scaled so the print stays full size
      const cx = W / 2, cy = H * v('--zoom-t') + zH / 2, Rr = R.wipe.offsetWidth / 2;
      R.wipeEnd = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) / Rr + .02; R.wipeR = Rr;
      R.wipe0 = Math.max(.004, (R.pw / 2 - 10) / Rr);   // starts as big as the phone, hidden behind it, so it never reads as a small ring
      for (const el of [R.wipe, R.ring]) { el.style.left = (cx - Rr) + 'px'; el.style.top = (cy - Rr) + 'px'; }
      Object.assign(R.wipeIn.style, { left: (Rr - cx - 6) + 'px', top: (Rr - cy - 6) + 'px', width: (W + 12) + 'px', height: (H + 12) + 'px', transformOrigin: `${cx + 6}px ${cy + 6}px` }); // 6px bleed so the stage edge never shows through
    };
    R.render = (p, last = -1) => {
      const vw = R.W / 100, vh = R.H / 100, pw = R.pw;
      // chapter 1: it's 9pm, the fridge is boring, the stomach rumbles, cravings float in
      set(R.head, 'none', 1 - seg(p, .2, .24));
      let t = eOut(seg(p, 0, .06));
      set(R.n1, `translateX(${(lerp(-70, 0, t) * vw).toFixed(1)}px) rotate(${lerp(-12, 0, t).toFixed(2)}deg)`, t);
      t = eOut(seg(p, .05, .11));
      set(R.n2, `translateX(${(lerp(70, 0, t) * vw).toFixed(1)}px) rotate(-3deg)`, t);
      const tc = eOut(seg(p, 0, .14));
      R.mm.style.transform = `rotate(${lerp(270, 360, tc).toFixed(2)}deg)`;
      R.hh.style.transform = `rotate(${lerp(262.5, 270, tc).toFixed(2)}deg)`;
      const g = seg(p, .11, .21), gs = Math.sin(g * Math.PI);
      const rattle = (k, a) => (Math.sin(p * k) * a * gs).toFixed(2);
      const par = k => ((p - .3) * k).toFixed(2);
      set(R.win, `translate(${rattle(3100, 2)}px,${par(-30)}px)`);
      set(R.clock, `translate(${rattle(2900, 3)}px,${par(-20)}px) rotate(${(rattle(3300, 4) * 1 + Math.sin(seg(p, .56, .66) * Math.PI * 5) * (1 - seg(p, .56, .66)) * 10).toFixed(2)}deg)`);
      set(R.lamp, `translate(0,${par(-14)}px) rotate(${rattle(2600, 2)}deg)`, 1 - eInOut(seg(p, .22, .27)));
      set(R.fridge, `translate(${rattle(3500, 3)}px,${par(-6)}px)`);
      set(R.grr, `translate(${rattle(2400, 9)}px,${rattle(2700, 6)}px) rotate(${rattle(2000, 5)}deg) scale(${lerp(.6, 1.12, eOut(g)).toFixed(3)})`, gs);
      const open = eOut(seg(p, .06, .13)) * (1 - eInOut(seg(p, .17, .21)));
      set(R.door, `perspective(1200px) rotateY(${(-72 * open).toFixed(2)}deg)`);
      set(R.light, 'none', open); set(R.spill, 'none', open);
      set(R.scooter, `translateX(${lerp(-130, 520, eInOut(seg(p, .08, .22))).toFixed(1)}%) translateY(${(Math.sin(p * 200) * 3).toFixed(1)}%)`);
      // chapter 2: the camera pushes into the phone; the app scrolls, the basket fills, a thumb reaches
      const z = eInOut(seg(p, .22, .3)), Rm = R.room;
      const melt = eInOut(seg(p, .92, 1));          // at the very end the phone melts into the tomato behind it
      set(R.phone, `translate(${lerp(Rm.dx, 0, z).toFixed(1)}px,${lerp(Rm.dy, 0, z).toFixed(1)}px) scale(${(lerp(Rm.s, 1, z) * (1 + .06 * melt)).toFixed(4)}) rotate(${lerp(-5, 0, z).toFixed(2)}deg)`, 1 - melt);
      set(R.dim, 'none', .62 * z);
      const lit = eOut(seg(p, .14, .24)), paused = eOut(seg(p, .61, .66));
      set(R.glow, 'none', lit * (1 - paused)); set(R.glowP, 'none', paused);
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
      const tH = eInOut(seg(p, .45, .5)), tF = eOut(seg(p, .56, .62)), tap = Math.sin(seg(p, .5, .54) * Math.PI);
      set(R.hand, `translate(${(lerp(.9 * pw, 0, tH) + tF * .8 * pw).toFixed(1)}px,${(lerp(.9 * pw, 0, tH) - tF * 1.4 * pw).toFixed(1)}px) rotate(${(lerp(-20, 0, tH) + tF * 120).toFixed(1)}deg) scale(${(1 - tap * .12).toFixed(3)})`, seg(p, .45, .47) * (1 - tF));
      // chapter 3: pal drops in, squashes the button, the Pause takes over
      const tS = eOut(seg(p, .56, .6));
      const pulse = 1 + .05 * Math.sin(seg(p, .47, .56) * Math.PI * 4);
      set(R.btn, `scale(${(pulse * lerp(1, 1.06, tS)).toFixed(4)},${(pulse * lerp(1, .78, tS)).toFixed(4)})`);
      const fall = seg(p, .5, .56), imp = seg(p, .56, .64);
      const py = p < .56 ? lerp(-1.4 * R.H, 0, eIn(fall)) : 0;
      const sx = p < .56 ? lerp(1, .9, fall) : lerp(1.24, 1, eOut(imp)), sy = p < .56 ? lerp(1, 1.15, fall) : lerp(.78, 1, eOut(imp));
      const settle = eOut(seg(p, .58, .62));
      set(R.pal, `translateY(${(py + lerp(.048 * pw * tS, .26 * pw, settle)).toFixed(1)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})`, p < .5 ? 0 : 1);
      const u = seg(p, .56, .66);
      R.dust.forEach((el, i) => {                   // puffs burst out from under the button's edges
        const dir = i % 2 ? 1 : -1, k = (i >> 1) + 1;
        set(el, `translate(${(dir * (R.bw * .5 + k * .07 * pw * eOut(u))).toFixed(1)}px,${(-k * .035 * pw * eOut(u)).toFixed(1)}px) scale(${lerp(.4, 1.2, u).toFixed(3)})`, u > 0 && u < 1 ? 1 - u : 0);
      });
      t = seg(p, .66, .69); set(R.bub, `scale(${Math.max(.05, eBack(t)).toFixed(4)})`, t);
      t = seg(p, .69, .72); set(R.stk, `rotate(7deg) scale(${lerp(1.8, 1, eOut(t)).toFixed(4)})`, t);
      t = eOut(seg(p, .66, .72)); set(R.cap, `translateY(${lerp(30, 0, t).toFixed(1)}px)`, t * (1 - seg(p, .8, .84)));
      // the food: floats in with the craving, thrown onto the counter when pal lands
      const blast = seg(p, .56, .72);
      R.foods.forEach((f, i) => {
        const a = eOut(seg(p, .1 + i * .025, .22 + i * .025)), [dx, , dr] = R.dirs[i], L = R.land[i];
        const bob = Math.sin(p * 40 + i * 1.7) * 9 * (1 - blast), arc = Math.sin(blast * Math.PI) * 18 * vh;
        set(f, `translate3d(${(L.x * eOut(blast)).toFixed(1)}px,${(lerp(6 * vh, 0, a) + bob + L.y * eIn(blast) - arc).toFixed(1)}px,0) rotate(calc(var(--tilt, 0deg) + ${(lerp(dx * 40, 0, a) + dr * eOut(blast) * (200 + i * 40)).toFixed(1)}deg)) scale(${lerp(.6, 1, a).toFixed(3)})`, Math.min(a * 2, 1));
      });
      // the hand-off: the Pause's tomato spreads out from behind the phone and fills the room, then the phone melts away
      const w = eIn(seg(p, .84, .97)), sc = lerp(R.wipe0, R.wipeEnd, w), on = p > .84 ? 1 : 0;
      set(R.wipe, `scale(${sc.toFixed(5)})`, on);
      R.wipeIn.style.transform = `scale(${(1 / sc).toFixed(4)})`;
      set(R.ring, `scale(${(sc + 7 / R.wipeR).toFixed(5)})`, on);   // a constant 7px ink edge
      if (last >= 0 && last < .56 && p >= .56) {     // the landing, live only: the room shakes and the lights flicker
        R.st.animate([{ transform: 'none' }, { transform: 'translate(-10px,8px)' }, { transform: 'translate(9px,-7px)' }, { transform: 'translate(-6px,4px)' }, { transform: 'translate(3px,-2px)' }, { transform: 'none' }], { duration: 420 });
        R.flick.animate([{ opacity: 0 }, { opacity: .75 }, { opacity: .05 }, { opacity: .55 }, { opacity: 0 }, { opacity: .35 }, { opacity: 0 }], { duration: 560 });
      }
    };
    return R;
  }

  /* scene B, chapter 4: pal cooks. Beats: the fridge fills the pan, pal chops (each cut throws a slice into the pan),
     walks to the hob and stirs with a long wooden spoon held in his own hand, flips the food twice, spoons dinner onto
     the plate, cheers up. The pan never leaves the hob. */
  function buildB(st) {
    const q = s => $(s, st), qa = s => $$(s, st);
    const R = {
      st, caps: qa('.k-caps .cap'), warm: q('.kx-warm'), win: q('.nx-win'), clock: q('.nx-clock'), hh: q('.nx-clock__h'), mm: q('.nx-clock__m'),
      cone: q('.nx-lamp__cone'), fridge: q('.nx-fridge'), door: q('.nx-fridge__door'), light: q('.nx-fridge__light'), spill: q('.nx-fridge__spill'),
      fCarrot: q('.nx-fridge__body .nx-carrot'), flames: q('.kx-flames'), hob: q('.kx-hob'), pan: q('.kx-pan'), pop: q('.kx-pop'),
      steam: q('.kx-pan .kx-steam'), sauce: q('.kx-sauce'), board: q('.kx-board'), carrot: q('.kx-carrot'), knifeDown: q('.kx-knife-down'),
      ings: qa('.ing'), slices: qa('.slices i'), bits: qa('.bit'), plate: q('.kx-plate'), meal: q('.kx-meal'), dSteam: q('.kx-plate .kx-steam'), sparks: qa('.kx-spark'),
      palWrap: q('.k-pal'), face: q('.k-pal .pal__face'), happy: q('.k-happy'), arm: q('.k-arm'), knife: q('.k-knife'), spoon: q('.k-spoon'),
      shafts: qa('.k-spoon__shaft, .k-spoon__wood'), sBowl: q('.k-spoon__bowl'), says: qa('.k-say')
    };
    // ingredient flights from the fridge: [which, start, end, to] (to: pan or board)
    R.flights = [[0, .08, .16, 'pan'], [2, .11, .18, 'board'], [1, .14, .22, 'pan'], [3, .32, .38, 'pan'], [4, .36, .42, 'pan']];
    R.chops = [.2, .237, .274, .311, .348];                // each cut throws one slice into the pan
    R.flips = [.5, .56];
    R.landings = [...R.flights.filter(f => f[3] === 'pan').map(f => f[2]), ...R.chops.map(c => c + .06)];
    R.all = [...R.caps, R.warm, R.win, R.clock, R.hh, R.mm, R.cone, R.fridge, R.door, R.light, R.spill, R.fCarrot, R.flames, R.pan, R.pop, R.steam,
      R.carrot, R.knifeDown, ...R.ings, ...R.slices, ...R.bits, R.plate, R.meal, R.dSteam, ...R.sparks, R.palWrap, R.face, R.happy, ...R.says];
    R.measure = () => {
      R.W = st.offsetWidth; R.H = st.offsetHeight;
      const f = boxIn(R.fridge, st), pan = boxIn(R.pan, st), b = boxIn(R.board, st), pl = boxIn(R.plate, st), k = boxIn(R.palWrap, st), hob = boxIn(R.hob, st);
      R.panH = pan.h; R.panW = pan.w;
      R.from = { x: f.l + f.w * .5, y: f.t + f.h * .5 };
      R.bowl = { x: pan.l + pan.w * .4, y: pan.t + pan.h * .3 };
      R.lip = { x: pan.l + pan.w * .06, y: pan.t + pan.h * .32 };
      R.boardAt = { x: b.l + b.w * .4, y: b.t + b.h * .45 };
      R.cutAt = x => ({ x: b.l + b.w * (.08 + .62 * x), y: b.t + b.h * .5 });   // the carrot's cut end, x = how much is left
      R.plateAt = { x: pl.l + pl.w * .5, y: pl.t + pl.h * .52 };
      R.plateOff = R.W - pl.l + 30;                 // the plate slides in along the counter from off the right edge
      // pal walks left until he stands just past the hob; his raised hand holds a spoon long enough to reach the pan
      R.walk = (hob.l + hob.w + 6) - (k.l + k.w * .02);
      const u = k.w / 626, hand = { x: k.l + R.walk + 70 * u, y: k.t + 400 * u };
      const aim = (to) => Math.atan2(to.y - hand.y, to.x - hand.x) * 180 / Math.PI - 180;
      const len = Math.hypot(R.bowl.x - hand.x, R.bowl.y - hand.y) / u - 40;
      R.shafts.forEach(el => el.setAttribute('d', `M40 474H${(-len).toFixed(0)}`));
      R.sBowl.setAttribute('cx', (-len - 30).toFixed(0));
      // dinner is tossed from the pan over pal's hat onto the plate behind him: the arc clears his hat with room to spare
      R.arc = Math.max(R.H * .14, ((R.bowl.y + R.plateAt.y) / 2 - (k.t - k.h * .3) + 30) / .8);
      R.stirA = aim(R.bowl); R.serveA = aim({ x: Math.min(R.plateAt.x + pl.w * .3, R.bowl.x), y: pan.t + pan.h * .1 });   // never swing past the pan (on phones the plate is under pal, so that would cross his face)
      R.sz = el => (el.getBoundingClientRect().width || 40);
      R.ingW = R.ings.map(el => svgBox(el, st).w); R.bitW = R.bits.map(el => svgBox(el, st).w); R.sliceW = R.slices[0] ? R.slices[0].offsetWidth : 20;
    };
    const fly = (el, a, b2, t, w, arc, spin, endScale = .55) => {
      const x = lerp(a.x, b2.x, eInOut(t)) - w / 2, y = lerp(a.y, b2.y, eInOut(t)) - Math.sin(t * Math.PI) * arc - w / 2;
      set(el, `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${(spin * t).toFixed(1)}deg) scale(${lerp(1, endScale, t ** 4).toFixed(3)})`, t > 0 && t < 1 ? 1 - seg(t, .88, 1) : 0);
    };
    R.render = p => {
      const vh = R.H / 100;
      capsAt(R.caps, p);
      const warm = eOut(seg(p, 0, .08));
      set(R.warm, 'none', warm); set(R.cone, 'none', .5 + .5 * warm);
      R.mm.style.transform = `rotate(${lerp(360, 510, p).toFixed(2)}deg)`;
      R.hh.style.transform = `rotate(${lerp(270, 282.5, p).toFixed(2)}deg)`;
      set(R.win, `translate(0,${((p - .5) * -30).toFixed(2)}px)`);
      set(R.clock, `translate(0,${((p - .5) * -20).toFixed(2)}px)`);
      const open = eOut(seg(p, .04, .1)) * (1 - eInOut(seg(p, .42, .47)));
      set(R.door, `perspective(1200px) rotateY(${(-72 * open).toFixed(2)}deg)`); set(R.light, 'none', open); set(R.spill, 'none', open);
      set(R.fCarrot, 'none', 1 - seg(p, .11, .115));
      // 1. the fridge empties into the pan (and the carrot onto the board)
      R.flights.forEach(([i, a, b2, to]) => {
        const t = seg(p, a, b2), target = to === 'pan' ? R.bowl : R.boardAt;
        fly(R.ings[i], R.from, target, t, R.ingW[i] || 50, 26 * vh, (i % 2 ? 1 : -1) * 360, to === 'pan' ? .5 : 1);
      });
      // 2. the chop: pal's knife arm drives each cut, every cut throws a slice into the pan
      const chopping = p >= .19 && p < .38;
      let angle = -6;
      if (chopping) {
        const f = ((p - .19) / .037) % 1;
        angle = f < .32 ? lerp(-22, 8, eIn(f / .32)) : lerp(8, -22, eOut((f - .32) / .68));
      }
      if (p < .43) R.arm.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      const cuts = R.chops.filter(c => p >= c + .002).length;
      set(R.carrot, `scaleX(${(1 - .156 * cuts).toFixed(3)})`, seg(p, .175, .18));
      R.slices.forEach((el, k) => {
        const c = R.chops[k], t = seg(p, c + .004, c + .06);
        fly(el, R.cutAt(1 - .156 * k), R.bowl, t, R.sliceW, 16 * vh, 540, .7);
      });
      set(R.knife, 'none', seg(p, .15, .17) * (1 - seg(p, .43, .44)));
      set(R.knifeDown, 'rotate(-4deg)', seg(p, .43, .44));
      // pans jump and the hot oil goes "tss" each time something lands in it
      let pop = 0;
      R.landings.forEach(L => { pop = Math.max(pop, Math.sin(seg(p, L - .004, L + .022) * Math.PI)); });
      set(R.pop, `scale(${(.5 + .7 * eOut(pop)).toFixed(3)}) rotate(${(pop * 12).toFixed(1)}deg)`, pop);
      // 3. pal walks to the hob, swaps the knife for the spoon; 4. two flips; 5. he spoons dinner onto the plate
      const walked = eInOut(seg(p, .43, .48)), raise = eOut(seg(p, .45, .48));
      const holding = seg(p, .46, .47) * (1 - seg(p, .79, .8));
      set(R.spoon, 'none', holding);
      let flick = 0;
      R.flips.forEach(t0 => { flick = Math.max(flick, Math.sin(seg(p, t0, t0 + .045) * Math.PI)); });
      const serve = eInOut(seg(p, .66, .7)) * (1 - eInOut(seg(p, .76, .8)));
      if (holding > 0) {
        const stir = Math.sin(p * 260) * 5 * seg(p, .48, .5) * (1 - seg(p, .62, .64));
        const ang = lerp(R.stirA, R.serveA, serve) + stir + flick * 18;   // a flick lifts the spoon tip (clockwise, as it points left)
        R.arm.style.transform = `translate(${(-26 * raise).toFixed(1)}px,${(-74 * raise).toFixed(1)}px) rotate(${ang.toFixed(2)}deg)`;
      } else if (p >= .43) {
        R.arm.style.transform = `translate(${(-26 * raise).toFixed(1)}px,${(-74 * raise).toFixed(1)}px) rotate(0deg)`;
      }
      const plateIn = eOut(seg(p, .62, .67));
      const jump = pop;
      set(R.pan, `translateY(${(-(jump * .12 + flick * .06) * R.panH).toFixed(1)}px) rotate(${(Math.sin(p * 260) * 1.6 * seg(p, .48, .5) * (1 - seg(p, .62, .64)) - flick * 4).toFixed(2)}deg) scale(${(1 + jump * .04).toFixed(4)},${(1 - jump * .05).toFixed(4)})`);
      set(R.flames, `scale(${(1 + flick * .35).toFixed(3)},${(lerp(.3, 1, eOut(seg(p, .06, .14))) * (1 + flick * .5)).toFixed(3)})`, eOut(seg(p, .06, .14)) * (1 - seg(p, .8, .86)));
      set(R.steam, 'none', seg(p, .22, .3) * (1 - seg(p, .74, .78)));
      R.sauce.style.opacity = 1 - seg(p, .72, .77);
      // the food: in the pan, flipped into the air by the spoon, then spooned across onto the plate
      R.bits.forEach((el, i) => {
        const w = R.bitW[i] || 30, home = { x: R.bowl.x + (i - 1.5) * .12 * R.panW, y: R.bowl.y - .04 * R.panH };
        let x = home.x, y = home.y - jump * .12 * R.panH, rot = (i - 1.5) * 20;
        R.flips.forEach(t0 => { const v = seg(p, t0, t0 + .05); y -= Math.sin(v * Math.PI) * (16 + i * 4) * vh; rot += v * 360 * (i % 2 ? 1 : -1); x += Math.sin(v * Math.PI) * (i - 1.5) * .04 * R.panW; });
        const go = seg(p, .69 + i * .016, .74 + i * .016);
        if (go > 0) {
          const to = { x: R.plateAt.x + (i - 1.5) * .08 * R.panW, y: R.plateAt.y - .1 * R.panH };
          x = lerp(home.x, to.x, eInOut(go)); y = lerp(home.y, to.y, eInOut(go)) - Math.sin(go * Math.PI) * R.arc; rot += go * 260;
        }
        set(el, `translate3d(${(x - w / 2).toFixed(1)}px,${(y - w / 2).toFixed(1)}px,0) rotate(${rot.toFixed(1)}deg)`, seg(p, .45, .5) * (1 - seg(go, .85, 1)));
      });
      // 5. ta-da: the plate squashes as dinner lands, the pile pops up, sparkles, then it steams
      const land = Math.sin(seg(p, .76, .8) * Math.PI);
      set(R.plate, `translateX(${((1 - plateIn) * R.plateOff).toFixed(1)}px) scale(${(1 + .05 * land).toFixed(4)},${(1 - .07 * land).toFixed(4)})`, plateIn);
      const meal = seg(p, .74, .8);
      set(R.meal, `scale(${Math.max(.05, eBack(meal)).toFixed(4)})`, seg(p, .735, .745));
      R.sparks.forEach((el, i) => {
        const t = seg(p, .79 + i * .012, .84 + i * .012), sp = Math.sin(t * Math.PI);
        set(el, `scale(${(.3 + sp).toFixed(3)}) rotate(${(t * 90).toFixed(1)}deg)`, sp);
      });
      set(R.dSteam, 'none', seg(p, .8, .86));
      // pal: looks at what he is doing, walks, leans into the tosses, and cheers up at the end
      const happy = eOut(seg(p, .8, .85));
      const lookX = p < .43 ? -4.6 : p < .66 ? -5 : -3.5, lookY = p < .43 ? 4.2 : p < .66 ? 2.6 : 5;
      R.face.style.transform = `translate(${lookX}%,${lookY}%)`;
      set(R.face, R.face.style.transform, 1 - happy);
      set(R.happy, 'none', happy);
      const hop = Math.abs(Math.sin(seg(p, .43, .48) * Math.PI * 3)) * 2.4 * vh + Math.sin(seg(p, .8, .86) * Math.PI) * 3 * vh;
      set(R.palWrap, `translate(${(R.walk * walked).toFixed(1)}px,${(-hop).toFixed(1)}px) rotate(${(-flick * 3 + (chopping ? -2 : 0)).toFixed(2)}deg)`);
      R.says.forEach(b2 => {
        const a2 = +b2.dataset.in, z2 = +b2.dataset.out, o = seg(p, a2, a2 + .015) * (1 - seg(p, z2 - .015, z2));
        set(b2, `scale(${Math.max(.05, eBack(seg(p, a2, a2 + .025))).toFixed(4)})`, o);
      });
    };
    return R;
  }

  addScene($('[data-night]'), buildA);
  addScene($('[data-cook]'), buildB);

  /* ---------- the money: drifting words, a receipt sliding out of its slot, coins ---------- */
  const drifts = money ? $$('[data-drift]', money).map(el => ({ el, x: 0 })) : [];
  let printP = 0;
  const keptEl = money ? $('.receipt .total dd', money) : null;
  if (money) watch(money);
  function moneyWrite(y, dt) {
    if (!money || reduce || !visible(money)) return false;
    let moving = false;
    const pv = clamp((y + G.vh - G.moneyTop) / (G.vh + G.moneyH), 0, 1);
    drifts.forEach(o => {
      const xT = (+o.el.dataset.drift) * (.45 - pv) * G.vw * .28;
      o.x = damp(o.x, xT, 8, dt);
      if (Math.abs(o.x - xT) > .2) moving = true;
      o.el.style.transform = `translate3d(${o.x.toFixed(1)}px,0,0)`;
    });
    if (receipt) {
      const prT = clamp((y + G.vh * .9 - G.clipTop) / (G.clipH * 1.1), 0, 1);
      printP = damp(printP, prT, 7, dt);
      if (Math.abs(printP - prT) > .0005) moving = true;
      receipt.style.transform = `translate3d(0,${(-(1 - eOut(printP)) * (G.clipH + 24)).toFixed(1)}px,0)`;
      const kept = Math.round(18 * eOut(seg(printP, .5, 1)));
      if (keptEl && keptEl._v !== kept) { keptEl.textContent = '£' + kept; keptEl._v = kept; }
    }
    if (moving) heat([...drifts.map(o => o.el), receipt]);
    return moving;
  }
  const coinTpl = d.getElementById('coin');
  function rain(layer, n, target) {
    if (!coinTpl || reduce) return;
    const L = layer.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = coinTpl.content.firstElementChild.cloneNode(true);
      layer.appendChild(c);
      const x0 = rand(0, L.width), y0 = rand(-L.height * .6, -80);
      const x1 = target.x - L.left + rand(-30, 30), y1 = target.y - L.top + rand(-10, 20), r = rand(-540, 540);
      c.animate([
        { transform: `translate(${x0}px,${y0}px) rotate(0deg)`, opacity: 1, easing: 'cubic-bezier(.55,0,1,.45)' },
        { transform: `translate(${x1}px,${y1}px) rotate(${r}deg)`, opacity: 1, offset: .78, easing: 'cubic-bezier(.23,1,.32,1)' },
        { transform: `translate(${x1}px,${y1 - 24}px) rotate(${r}deg)`, opacity: 1, offset: .88 },
        { transform: `translate(${x1}px,${y1 + 10}px) rotate(${r}deg) scale(.5)`, opacity: 0 }
      ], { duration: rand(1000, 1500), delay: i * rand(40, 90), fill: 'backwards' }).finished.then(() => c.remove());
    }
  }
  if (money) {
    const palBtn = $('[data-coins]', money), layer = $('[data-coin-layer]', money);
    const target = () => { const r = palBtn.getBoundingClientRect(); return { x: r.left + r.width * .52, y: r.top + r.height * .55 }; };
    const bump = () => !reduce && palBtn.animate([{ transform: 'none' }, { transform: 'scale(1.06,.94)' }, { transform: 'none' }], { duration: 300, delay: 1000 });
    new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { rain(layer, 16, target()); bump(); o.disconnect(); } }), { threshold: .45 }).observe(palBtn);
    palBtn.addEventListener('click', () => { rain(layer, 10, target()); bump(); announce('ka-ching.'); });
  }

  /* ---------- the demo: after a choice, keyboard focus lands on the new state's heading ---------- */
  addEventListener('hashchange', () => {
    const id = location.hash.slice(1), tgt = id && d.getElementById(id);
    if (!tgt || !tgt.classList.contains('tgt')) return;
    const h = $(`.st--${id} .cp-title`);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  });

  /* ---------- the demo keeps one height (its tallest state), so choosing never shifts the page below ---------- */
  const demo = $('.try .demo');
  if (demo) {
    const fit = () => {
      const sts = [...demo.querySelectorAll('.st')];
      demo.style.removeProperty('--st-h');
      sts.forEach(s => { s.style.display = 'grid'; });
      const h = Math.max(...sts.map(s => s.offsetHeight));
      sts.forEach(s => { s.style.display = ''; });
      demo.style.setProperty('--st-h', h + 'px');
    };
    fit(); d.fonts && d.fonts.ready.then(fit); addEventListener('load', fit); addEventListener('resize', fit, { passive: true });
  }

  /* ---------- try it: "order anyway" runs away from a mouse, three times ---------- */
  const dodge = $('[data-dodge]');
  if (dodge && fine && !reduce) {
    const bubble = $('[data-dodge-bubble]');
    const lines = ['nope.', 'too slow.', 'fine. go on then.'];
    let n = 0;
    const reset = () => { n = 0; dodge.style.translate = ''; };
    dodge.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse' || n >= 3) return;
      say(bubble, lines[n]); n++;
      if (n === 3) { dodge.style.translate = ''; return; }
      // Jump somewhere that stays inside the section and clear of "i'll cook"
      const box = dodge.closest('.try').getBoundingClientRect(), cur = dodge.style.translate.split(' ').map(parseFloat);
      const b = dodge.getBoundingClientRect(), home = { l: b.left - (cur[0] || 0), t: b.top - (cur[1] || 0), w: b.width, h: b.height };
      const keep = dodge.parentElement.querySelector('.cp-btn--primary').getBoundingClientRect();
      for (let tries = 0; tries < 24; tries++) {
        const dx = rand(-260, 260), dy = rand(-120, 120);
        const l = home.l + dx, t = home.t + dy, r = l + home.w, btm = t + home.h;
        const clearOfKeep = r < keep.left - 12 || l > keep.right + 12 || btm < keep.top - 12 || t > keep.bottom + 12;
        const inside = l > box.left + 16 && r < box.right - 16 && t > box.top + 16 && btm < box.bottom - 16;
        const moved = Math.hypot(dx - (cur[0] || 0), dy - (cur[1] || 0)) > 90;
        if (clearOfKeep && inside && moved) { dodge.style.translate = `${dx.toFixed(0)}px ${dy.toFixed(0)}px`; break; }
      }
    });
    addEventListener('hashchange', () => { if (!location.hash || location.hash === '#pause') reset(); });
  }

  /* ---------- easter eggs ---------- */
  const stormLayer = $('[data-storm-layer]');
  const announcer = $('[data-announce]');
  function announce(t) { if (announcer) { announcer.textContent = ''; setTimeout(() => { announcer.textContent = t; }, 30); } }
  let storming = false, stormImg = null;
  function storm(word) {
    if (!stormLayer || storming) return;
    storming = true;
    const line = word === 'dumplings' || word === 'dumpling' ? 'excuse me. i’m right here.' : 'we have food at home.';
    announce(`pal says ${line}`);
    const b = d.createElement('p'); b.className = 'bubble is-pop'; b.textContent = line; stormLayer.appendChild(b);
    if (!reduce) {
      const H = G.vh, W = G.vw, n = W < 700 ? 9 : 16;
      for (let i = 0; i < n; i++) {
        const img = new Image(); img.decoding = 'async'; img.src = stormImg ? stormImg.src : base + 'assets/pal/pal-grumpy.webp'; img.alt = '';
        stormLayer.appendChild(img);
        const w = clamp(W * .12, 90, 170), x = rand(-20, W - w + 20), floor = H - w * .96 - rand(0, H * .25), r0 = rand(-40, 40);
        img.animate([
          { transform: `translate(${x}px,${-w * 1.4}px) rotate(${r0}deg)`, easing: 'cubic-bezier(.55,0,1,.45)' },
          { transform: `translate(${x}px,${floor}px) rotate(${r0 / 3}deg) scale(1.15,.85)`, offset: .42, easing: 'cubic-bezier(.23,1,.32,1)' },
          { transform: `translate(${x}px,${floor - 70}px) rotate(0deg) scale(.95,1.05)`, offset: .55, easing: 'cubic-bezier(.55,0,1,.45)' },
          { transform: `translate(${x}px,${floor}px) rotate(0deg)`, offset: .66 },
          { transform: `translate(${x}px,${floor}px) rotate(0deg)`, offset: .82, easing: 'cubic-bezier(.55,0,1,.45)' },
          { transform: `translate(${x}px,${H + 40}px) rotate(${-r0}deg)` }
        ], { duration: 2600, delay: i * 70, fill: 'backwards' });
      }
    }
    setTimeout(() => { stormLayer.replaceChildren(); storming = false; }, reduce ? 2200 : 3800);
  }
  function konami() {
    announce('cheat code accepted. still no takeaway.');
    const b = d.createElement('p'); b.className = 'bubble is-pop'; b.textContent = 'cheat code accepted. still no takeaway.'; stormLayer.appendChild(b);
    if (coinTpl && !reduce) rain(stormLayer, 40, { x: G.vw / 2, y: G.vh * .8 });
    setTimeout(() => stormLayer.replaceChildren(), 3600);
  }
  const WORDS = ['pizza', 'burger', 'chips', 'kebab', 'curry', 'sushi', 'fries', 'wings', 'noodles', 'nuggets', 'tacos', 'ramen', 'takeaway', 'chinese', 'indian', 'dumplings', 'dumpling'];
  const KONAMI = 'ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight b a';
  let typed = '', keys = [];
  addEventListener('keydown', e => {
    poke();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    keys = [...keys, e.key].slice(-10);
    if (keys.join(' ') === KONAMI) { keys = []; konami(); return; }
    if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) return;
    typed = (typed + e.key.toLowerCase()).slice(-12);
    const hit = WORDS.find(w => typed.endsWith(w));
    if (hit) { typed = ''; storm(hit); }
  }, { passive: true });
  $$('[data-storm]').forEach(b => b.addEventListener('click', () => storm('pizza')));

  // Leave pal alone for a while and he nods off, dreaming about the money you'd keep
  let asleep = false;
  const heroPal = watch($('.hero__pal .pal'));
  const heroBubble = $('.bubble--hero');
  function fallAsleep() {
    if (!heroPal || asleep || !visible(heroPal)) return;
    const dream = $('.pal__dream', heroPal);
    if (dream && !dream.src) dream.src = dream.dataset.src;
    asleep = true; heroPal.classList.add('is-asleep');
    say(heroBubble, 'z z z. dreaming about the money you’d keep.');
  }
  function wakeUp() { asleep = false; heroPal.classList.remove('is-asleep'); say(heroBubble, 'oh. you’re back.'); }

  // Switch tabs and he guards the fridge
  const title = d.title;
  d.addEventListener('visibilitychange', () => {
    if (d.hidden) d.title = 'pal is guarding the fridge';
    else { d.title = 'welcome back. still not ordering?'; setTimeout(() => { d.title = title; }, 2500); }
  });

  /* ---------- the privacy page's reading bar ---------- */
  const bar = $('[data-progress]');
  let readP = 0;
  function barWrite(y, dt) {
    if (!bar) return false;
    const rT = G.max > 0 ? clamp(y / G.max, 0, 1) : 0;
    readP = reduce ? rT : damp(readP, rT, 10, dt);
    bar.style.transform = `scaleX(${readP.toFixed(4)})`;
    return Math.abs(readP - rT) > .0005;
  }

  /* ---------- measure (load, resize, layout changes) ---------- */
  const pageTop = el => { let t = 0; for (let e = el; e; e = e.offsetParent) t += e.offsetTop; return t; };
  function measure() {
    G.vh = innerHeight; G.vw = innerWidth; G.max = Math.max(0, root.scrollHeight - G.vh);
    if (hero) G.heroH = hero.offsetHeight;
    if (money) { G.moneyTop = pageTop(money); G.moneyH = money.offsetHeight; }
    if (clip) { G.clipTop = pageTop(clip); G.clipH = clip.offsetHeight; }
    for (const sc of scenes) { sc.top = pageTop(sc.section); sc.h = sc.section.offsetHeight; sc.R.measure(); sc.last = -1; }
    for (const k of strips) { k.R.measure(); k.R.render(k.p); }
    S.target = clamp(S.target, 0, G.max);
    // Layout offsets, not screen boxes, so letters still mid-animation measure where they will rest
    for (const j of jellies) {
      j.fs = parseFloat(getComputedStyle(j.el).fontSize);
      const b0 = j.chs[0]?.c.offsetParent === j.el ? { l: 0, t: 0 } : { l: j.el.offsetLeft, t: j.el.offsetTop };
      for (const k of j.chs) { k.ox = k.c.offsetLeft - b0.l + k.c.offsetWidth / 2; k.oy = k.c.offsetTop - b0.t + k.c.offsetHeight / 2; }
    }
  }

  /* ---------- one loop: read, then compute and write. It sleeps when nothing is moving. ---------- */
  let running = false, ready = false, still = 0, lastT = 0;
  function kick() { still = 0; if (ready && !running) { running = true; lastT = performance.now(); requestAnimationFrame(frame); } }
  function frame(now) {
    const dt = clamp((now - lastT) / 1000, 1 / 240, 1 / 20); lastT = now;
    // 1. read
    const sy = scrollY;
    if (!reduce) { rigsRead(); jellyRead(); }
    // 2. compute and write
    const y = stepScroll(now, dt), dy = y - sy;
    let busy = S.moving;
    busy = speedWrite(y, dt) || busy;
    if (!reduce) {
      busy = rigsWrite(now, dt) || busy;
      busy = jellyWrite(y, dy, dt) || busy;
      busy = scenesWrite(y, dt) || busy;
      busy = moneyWrite(y, dt) || busy;
    }
    busy = barWrite(y, dt) || busy;
    // 3. scroll last, so this frame shows the position everything above was computed for
    if (S.on && Math.abs(y - sy) > .01) { scrollTo(0, y); S.written = y; }
    if (busy) still = 0;
    if (++still > 20) { running = false; cool(); return; }
    requestAnimationFrame(frame);
  }
  setInterval(() => {
    if (performance.now() - lastActive > 20000) fallAsleep();
    if (!ptr.mouse && !reduce && rigs.some(r => visible(r.el))) kick();    // touch: let him look around now and then
  }, 2400);

  /* ---------- images: decode the rest in idle time, so nothing decodes mid-scroll ---------- */
  const idle = f => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(f, 300));
  function warm() {
    const queue = $$('img[loading="lazy"]');
    const next = () => {
      const img = queue.shift();
      if (!img) {
        const dream = $('.pal__dream[data-src]');
        if (dream && !dream.src) dream.src = dream.dataset.src;
        stormImg = new Image(); stormImg.src = base + 'assets/pal/pal-grumpy.webp';
        stormImg.decode && stormImg.decode().catch(() => {});
        return;
      }
      img.loading = 'eager';
      (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => idle(next));
    };
    idle(next);
  }

  const start = () => {
    measure(); ready = true; kick();
    new ResizeObserver(() => { measure(); kick(); }).observe(d.body);
  };
  (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(start);
  addEventListener('resize', () => { measure(); kick(); }, { passive: true });
  if (d.readyState === 'complete') idle(warm); else addEventListener('load', () => idle(warm), { once: true });
  console.log('%cpal says hi. now go and cook something.', 'font:700 15px system-ui;color:#F0533A');
})();
