(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const announce = document.querySelector('#announcement');
  const layer = document.querySelector('.effects');
  let effectTimer;
  function celebrate(kind) {
    clearTimeout(effectTimer);
    layer.replaceChildren();
    announce.textContent = kind === 'pal' ? 'A whole storm of pals, all saying we have food at home.' : 'Nice one. pal is celebrating the money you kept.';
    if (reduced.matches) return;
    for (let i = 0; i < 26; i++) {
      const item = document.createElement(kind === 'pal' ? 'img' : 'span');
      item.className = kind === 'pal' ? 'effect-pal' : 'effect-coin';
      if (kind === 'pal') { item.src = 'assets/pal/pal-grumpy.webp'; item.alt = ''; }
      else item.textContent = '£';
      item.style.left = ((i * 37 + 11) % 100) + '%';
      item.style.setProperty('--duration', (2 + (i % 7) * .16) + 's');
      item.style.setProperty('--delay', ((i % 9) * .12) + 's');
      item.style.setProperty('--turn', ((i % 2 ? 1 : -1) * (100 + i * 11)) + 'deg');
      layer.append(item);
    }
    effectTimer = setTimeout(() => layer.replaceChildren(), 4800);
  }
  reduced.addEventListener('change', () => { if (reduced.matches) layer.replaceChildren(); });
  let boops = 0;
  let boopAnimation;
  const remarks = ['hands off the wallet.', 'i said what i said.', 'check. the. fridge.', 'fine. one more boop.', 'not on my watch.'];
  // A tiny, grounded anticipation follows the pointer only while pal is hovered.
  // No idle timer or animation loop; touch and reduced motion keep the still pose.
  const heroPal = document.querySelector('.hero-pal .pal-button');
  heroPal.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType !== 'mouse') return;
    const rect = heroPal.getBoundingClientRect();
    const lean = Math.max(-1.5, Math.min(1.5, (event.clientX - rect.left) / rect.width * 3 - 1.5));
    heroPal.style.setProperty('--pal-lean', lean + 'deg');
  });
  heroPal.addEventListener('pointerleave', () => heroPal.style.removeProperty('--pal-lean'));
  document.querySelectorAll('[data-boop]').forEach(button => button.addEventListener('click', () => {
    document.querySelector('[data-boop-speech]').textContent = remarks[boops++ % remarks.length];
    boopAnimation?.cancel();
    if (!reduced.matches) boopAnimation = button.animate([
      { transform: 'rotate(0) scale(1)' },
      { transform: 'rotate(-7deg) scale(1.05,.94)', offset: .3 },
      { transform: 'rotate(4deg) scale(.98,1.03)', offset: .65 },
      { transform: 'rotate(0) scale(1)' }
    ], { duration: 600, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }));
  reduced.addEventListener('change', () => { if (reduced.matches) boopAnimation?.cancel(); });
  document.querySelector('[data-coins]').addEventListener('click', () => celebrate('coins'));
  document.querySelector('[data-storm]').addEventListener('click', () => celebrate('pal'));
  let typed = '', sequence = [];
  const konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key.length === 1) {
      typed = (typed + event.key.toLowerCase()).slice(-5);
      if (typed === 'pizza') { celebrate('pal'); typed = ''; }
    }
    sequence.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    sequence = sequence.slice(-10);
    if (sequence.join('|') === konami.join('|')) { celebrate('coins'); sequence = []; }
  });
  // "Say hello" opens the visitor's mail app where there is one, and always copies the address with a visible "copied",
  // so the button still does something on a computer with no mail app set up.
  document.querySelectorAll('[data-copy-email]').forEach(link => {
    const label = link.innerHTML, address = link.getAttribute('href').replace('mailto:', '');
    let timer;
    link.addEventListener('click', () => {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(address).then(() => {
        link.textContent = 'Copied ' + address;
        document.querySelector('#announcement').textContent = 'Email address copied: ' + address;
        clearTimeout(timer);
        timer = setTimeout(() => { link.innerHTML = label; }, 2600);
      }).catch(() => {});
    });
  });
  // The three steps rise in, one after another, when the section arrives.
  const how = document.querySelector('.how');
  if (how && 'IntersectionObserver' in window) {
    const seen = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { how.classList.add('is-in'); seen.disconnect(); } }), { threshold: .35 });
    seen.observe(how);
  } else how?.classList.add('is-in');
  const dialog = document.querySelector('.pause-dialog');
  const title = document.querySelector('#demo-title');
  const copy = document.querySelector('#demo-copy');
  const step = document.querySelector('#demo-step');
  const pal = document.querySelector('#demo-pal');
  const cook = document.querySelector('#cook-button');
  const order = document.querySelector('#order-button');
  let state = 'pause', opener;
  const states = {
    pause: ['Before you order…', 'we have food at home.', 'Cooking tonight keeps £18 in your pocket.', 'grumpy', 'I’ll cook', 'Order anyway'],
    sure: ['One more thought from pal.', 'you sure?', 'That’s £22 on a meal you could make for £4.', 'peek', 'Fine, I’ll cook', 'Yes, I’m ordering'],
    cook: ['A different ending.', 'nice one.', 'Dinner at home. +£18 kept. Your wallet says thanks.', 'heart-tight', 'See the good bit ↘', 'Try again'],
    order: ['Your call. Always.', 'off you go.', 'In CravePal, you can choose to carry on. This is only a demo, so no app has been opened.', 'idle', 'Back to the story ↘', 'Try again']
  };
  // Decode each local pose before a choice needs it, so a new line never waits on the previous expression.
  ['peek', 'heart-tight', 'idle'].forEach(pose => { const image = new Image(); image.decoding = 'async'; image.fetchPriority = 'low'; image.src = 'assets/pal/pal-' + pose + '.webp'; image.decode().catch(() => {}); });
  const alt = { grumpy: 'pal holding his wallet tight.', peek: 'pal peeking from his wallet.', 'heart-tight': 'pal happily hugging his wallet.', idle: 'pal standing by, ready when you are.' };
  function show(next, focus = true) {
    state = next;
    const content = states[next];
    step.textContent = content[0]; title.textContent = content[1]; copy.textContent = content[2];
    pal.src = 'assets/pal/pal-' + content[3] + '.webp'; pal.alt = alt[content[3]];
    const label = content[4], arrow = document.createElement('span'), leaves = '↘'.includes(label.slice(-1));   // only buttons that leave the card get an arrow
    arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = label.slice(-1);
    cook.replaceChildren(document.createTextNode(leaves ? label.slice(0, -1).trim() : label), ...(leaves ? [arrow] : []));
    order.textContent = content[5];
    if (focus) title.focus({ preventScroll: true });
  }
  function close() { dialog.close(); }
  document.querySelectorAll('[data-open-pause]').forEach(button => button.addEventListener('click', () => {
    opener = button;
    show('pause', false);
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    title.focus({ preventScroll: true });
  }));
  document.querySelector('.close-dialog').addEventListener('click', close);
  dialog.addEventListener('click', event => {   // a click on the dimmed page around the card closes it
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button, a[href]')].filter(element => !element.disabled);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; opener?.focus({ preventScroll: true }); });
  cook.addEventListener('click', () => {
    if (state === 'cook' || state === 'order') {
      const target = state === 'cook' ? '#money-title' : '#pause-title';
      const heading = document.querySelector(target);
      heading.tabIndex = -1;
      opener = heading;   // the dialog's close handler restores focus to the opener: make that the heading, not the hidden demo button
      close();
      heading.focus({ preventScroll: true });
      heading.closest('section').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth' });
    } else show('cook');
  });
  order.addEventListener('click', () => show(state === 'pause' ? 'sure' : state === 'sure' ? 'order' : 'pause'));
})();


/* BEGIN footer refresh — independent decoration for #privacy and #footer. */
(() => {
  'use strict';
  const privacy = document.querySelector('#privacy .privacy-vignette');
  const kitchen = document.querySelector('#footer .footer-scene');
  if (!privacy || !kitchen) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const tokens = [...privacy.querySelectorAll('[data-privacy-token]')];
  const shackle = privacy.querySelector('.privacy-shackle');
  const lid = kitchen.querySelector('.footer-lid');
  const steam = [...kitchen.querySelectorAll('.footer-steam path')];
  const hand = kitchen.querySelector('.footer-timer-hand');
  const timer = kitchen.querySelector('.footer-timer');
  const line = kitchen.querySelector('.footer-pal-line');
  const clamp = x => Math.max(0, Math.min(1, x));
  const beat = (p, start, end) => clamp((p - start) / (end - start));
  const ease = t => 1 - Math.pow(1 - t, 3);
  let frame = 0;
  // Measure on scroll, so upstream scene/layout changes never leave stale offsets.
  // No idle loop: only props move, and pal's feet never change position.
  function progress(element) {
    const rect = element.getBoundingClientRect();
    const top = rect.top + scrollY;
    const start = top - innerHeight * .95;
    const end = Math.min(top - innerHeight * .25, document.documentElement.scrollHeight - innerHeight);
    return clamp((scrollY - start) / Math.max(1, end - start));
  }
  function paint() {
    frame = 0;
    const p = reduced.matches ? 1 : progress(privacy);
    const f = reduced.matches ? 1 : progress(kitchen);
    tokens.forEach((token, i) => {
      const t = ease(beat(p, .04 + i * .17, .31 + i * .17));
      token.style.transform = 'translate(' + ((1 - t) * -46) + 'px,' + ((1 - t) * -22) + 'px)';
      token.style.opacity = .18 + .82 * t;
    });
    const close = beat(p, .72, .94);
    const settle = Math.sin(close * Math.PI * 3) * (1 - close) * 2;
    shackle.style.transform = 'rotate(' + (30 * (1 - ease(close)) + settle) + 'deg)';
    const simmer = Math.sin(f * Math.PI * 12) * Math.sin(f * Math.PI);
    lid.style.transform = 'translateY(' + (-Math.abs(simmer) * 5) + 'px) rotate(' + simmer * 2.4 + 'deg)';
    steam.forEach((wisp, i) => {
      const t = (f * 2 + i / 3) % 1;
      wisp.style.transform = reduced.matches ? 'none' : 'translateY(' + (-18 * t) + 'px)';
      wisp.style.opacity = reduced.matches ? .5 : .2 + Math.sin(t * Math.PI) * .55;
    });
    hand.style.transform = 'rotate(' + (reduced.matches ? 0 : -100 + 170 * ease(f)) + 'deg)';
    const ring = beat(f, .74, 1);
    timer.style.transform = 'rotate(' + (reduced.matches ? 0 : Math.sin(ring * Math.PI * 6) * (1 - ring) * 5) + 'deg)';
    // The arrival greeting also has a calm, fully visible no-motion version.
    const greeting = f > .78 ? 'oh, hello there.' : 'worth a little wait.';
    if (line.textContent !== greeting) line.textContent = greeting;
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('pageshow', schedule);
  reduced.addEventListener('change', schedule);
  document.fonts.ready.then(schedule);
  paint();
})();
/* END footer refresh */
