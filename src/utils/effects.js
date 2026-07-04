const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Attaches a Material-style ripple to every .btn within root (event-delegated, safe to call once per render). */
export function initRipples(root = document) {
  root.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn, .ripple-host');
    if (!btn || btn.disabled || prefersReducedMotion()) return;
    btn.classList.add('ripple-host');
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.4;
    const dot = document.createElement('span');
    dot.className = 'ripple-dot';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - rect.left - size / 2}px`;
    dot.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  });
}

/** Animates a number from 0 (or current) to target over duration, writing formatted output via formatFn. */
export function animateCounter(el, target, { duration = 900, formatFn = (n) => Math.round(n).toLocaleString('fa-IR') } = {}) {
  if (!el) return;
  if (prefersReducedMotion()) {
    el.textContent = formatFn(target);
    return;
  }
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
    el.textContent = formatFn(from + (target - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/** Tracks the pointer within any `.spotlight` container and writes --spot-x/--spot-y for the CSS glow. */
export function initSpotlight(root = document) {
  if (prefersReducedMotion()) return;
  root.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.spotlight');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  });
}

/** Subtle magnetic pull toward the pointer for `.btn-magnetic` elements — resets on pointer leave. */
export function initMagnetic(root = document) {
  if (prefersReducedMotion()) return;
  root.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.btn-magnetic');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) * 0.18;
    const dy = (e.clientY - (rect.top + rect.height / 2)) * 0.18;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  root.addEventListener(
    'pointerleave',
    (e) => {
      const el = e.target.closest?.('.btn-magnetic');
      if (el) el.style.transform = '';
    },
    true
  );
}

/** Fills a `.glyph-drift` container with slowly rising coin/hand glyphs for hero backgrounds. */
export function spawnGlyphDrift(container, count = 10) {
  if (!container || prefersReducedMotion()) return;
  const glyphs = ['🪙', '🤲', '✋'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.textContent = glyphs[i % glyphs.length];
    const x = Math.random() * 100;
    const delay = Math.random() * 14;
    const dur = 12 + Math.random() * 10;
    span.style.cssText = `left:${x}%;animation-delay:${delay}s;animation-duration:${dur}s;font-size:${0.9 + Math.random() * 0.8}rem;`;
    frag.appendChild(span);
  }
  container.appendChild(frag);
}
export function spawnParticles(container, count = 18, opts = {}) {
  if (!container || prefersReducedMotion()) return;
  const { className = 'hero-particle', burst = false } = opts;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = className;
    const x = Math.random() * 100;
    const delay = Math.random() * (burst ? 0.4 : 8);
    const dur = burst ? 0.9 + Math.random() * 0.6 : 6 + Math.random() * 8;
    const size = 2 + Math.random() * 3;
    p.style.cssText = `left:${x}%;animation-delay:${delay}s;animation-duration:${dur}s;width:${size}px;height:${size}px;${
      burst ? `--bx:${(Math.random() - 0.5) * 240}px;--by:${-(60 + Math.random() * 160)}px;` : ''
    }`;
    frag.appendChild(p);
    if (burst) p.addEventListener('animationend', () => p.remove(), { once: true });
  }
  container.appendChild(frag);
}
