/* cravepal.app/privacy: the reading bar, a boop for pal, and the pizza easter egg. Nothing leaves the page. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const bar = document.querySelector('[data-progress]');
  let queued = false;
  const read = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, scrollY / max)).toFixed(4) : 0})`;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(read); } }, { passive: true });
  addEventListener('resize', read, { passive: true });
  read();

  // pal's lines when you boop him
  const lines = ['i read it twice.', 'the short version is the good bit.', 'no snacks were shared in this policy.', 'boop received. not stored.', 'hello@cravepal.app if you have questions.', 'still reading? proud of you.'];
  const bubble = document.querySelector('[data-bubble]');
  let boops = 0, hideTimer, boopAnimation;
  document.querySelectorAll('[data-boop]').forEach(button => button.addEventListener('click', () => {
    boops++;
    bubble.textContent = boops % 10 === 0 ? 'ten boops. that’s not in the policy.' : lines[(boops - 1) % lines.length];
    bubble.hidden = false;
    clearTimeout(hideTimer); hideTimer = setTimeout(() => { bubble.hidden = true; }, 2600);
    boopAnimation?.cancel();
    if (!reduced.matches) boopAnimation = button.animate([
      { transform: 'rotate(0) scale(1)' }, { transform: 'rotate(-7deg) scale(1.05,.94)', offset: .3 },
      { transform: 'rotate(4deg) scale(.98,1.03)', offset: .65 }, { transform: 'rotate(0) scale(1)' }
    ], { duration: 600, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }));

  reduced.addEventListener('change', () => {
    if (reduced.matches) { boopAnimation?.cancel(); document.querySelector('[data-storm-layer]')?.replaceChildren(); }
  });

  // type "pizza": a shower of pals
  const layer = document.querySelector('[data-storm-layer]'), say = document.querySelector('[data-announce]');
  let typed = '', stormTimer;
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    typed = (typed + event.key.toLowerCase()).slice(-5);
    if (typed !== 'pizza') return;
    typed = '';
    if (say) say.textContent = 'A whole storm of pals, all saying we have food at home.';
    if (reduced.matches || !layer) return;
    layer.replaceChildren();
    for (let i = 0; i < 22; i++) {
      const img = document.createElement('img');
      img.src = '../assets/pal/pal-grumpy.webp'; img.alt = '';
      img.style.left = ((i * 37 + 11) % 100) + '%';
      img.style.setProperty('--d', (2 + (i % 7) * .16) + 's');
      img.style.setProperty('--delay', ((i % 9) * .12) + 's');
      img.style.setProperty('--turn', ((i % 2 ? 1 : -1) * (100 + i * 11)) + 'deg');
      layer.append(img);
    }
    clearTimeout(stormTimer); stormTimer = setTimeout(() => layer.replaceChildren(), 4800);
  });
})();
