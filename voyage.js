// aBeam — voyage.js
// The scroll voyage. Page scroll is the only input: it sets a target progress, an rAF loop
// eases the displayed progress toward it, and the displayed value drives (a) the 3D camera
// along the path in boat.js and (b) the overlay states on the pinned stage.
//
// Scroll is never hijacked. Nothing here calls preventDefault: the wheel and a one-finger
// drag scroll the page exactly as they always would, and the camera is a consequence.
// Navigation IS scroll — a chip or a hotspot marker scrolls the page to that stop's offset,
// so the camera, the rail and the card can never disagree with the scrollbar.

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

export function initVoyage({ sectionEl, api, reducedMotion }) {
  if (!sectionEl || !api) return null;

  const stage = document.getElementById('voyage-stage');
  const hero = document.getElementById('hero-overlay');
  const intro = document.getElementById('voyage-intro');
  const panel = document.getElementById('boat-panel');
  const hint = document.getElementById('boat-hint');
  const cue = document.getElementById('scroll-cue');
  const rail = document.getElementById('boat-chips');
  const stops = api.stops;

  // the phases of the stage: the hero holds, the chapter opener crosses over, then the voyage
  const P_HERO_OUT = 0.030;
  const P_INTRO_IN = 0.042;
  const P_INTRO_OUT = 0.20;
  const P_CARD_IN = 0.055;
  const P_HINT_IN = 0.19;

  let top = 0, span = 1;
  let target = 0, shown = -1;
  let raf = 0, last = 0, scrollY = 0, needsRead = false;
  let painted = null;
  let zone = null, swap = 0;
  // set by the test hook: hold that progress through layout changes until a real scroll
  let pinned = false;

  function measure() {
    const rect = sectionEl.getBoundingClientRect();
    top = rect.top + window.scrollY;
    span = Math.max(1, sectionEl.offsetHeight - window.innerHeight);
  }

  const progressAt = (y) => clamp((y - top) / span, 0, 1);
  const offsetOf = (p) => Math.round(top + clamp(p, 0, 1) * span);

  function nearestStop(p) {
    let best = stops[0], bd = Infinity;
    for (const s of stops) {
      const d = Math.abs(s.p - p);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /* ---- the stage state for a given progress ----
     Only ever writes a class when the state behind it actually changed: a scroll must not
     cost one style invalidation per element per frame. */
  function paint(p) {
    const stop = nearestStop(p);
    const state = (p > P_HERO_OUT ? 1 : 0) | (p > P_INTRO_IN && p < P_INTRO_OUT ? 2 : 0)
      | (p > P_HINT_IN ? 4 : 0) | (p > P_CARD_IN ? 8 : 0);
    if (state !== painted) {
      painted = state;
      if (hero) hero.classList.toggle('is-out', !!(state & 1));
      if (cue) cue.classList.toggle('is-out', !!(state & 1));
      if (intro) {
        intro.classList.toggle('is-in', !!(state & 2));
        intro.classList.toggle('is-out', !(state & 2));
      }
      if (hint) hint.classList.toggle('is-in', !!(state & 4));
      if (panel) panel.classList.toggle('is-visible', !!(state & 8));
      if (rail) rail.classList.toggle('is-in', !!(state & 8));
    }

    if (stop.zone !== zone) {
      const first = zone === null;
      zone = stop.zone;
      // the card changes side between stops, so fade it out, move it, fade it back in rather
      // than sliding it across the yacht
      const dress = () => {
        api.showZone(stop.zone);
        if (panel) {
          panel.classList.toggle('is-left', stop.card === 'left');
          panel.classList.toggle('is-right', stop.card !== 'left');
        }
      };
      window.clearTimeout(swap);
      if (first || reducedMotion || !panel || !panel.classList.contains('is-visible')) {
        dress();
      } else {
        panel.classList.remove('is-visible');
        swap = window.setTimeout(() => {
          dress();
          if (shown > P_CARD_IN) panel.classList.add('is-visible');
        }, 190);
      }
    }
  }

  /* ---- the loop: ease the displayed progress toward the scroll target ---- */
  function apply(p) {
    shown = p;
    api.setVoyageProgress(p);
    paint(p);
  }

  function tick(now) {
    raf = 0;
    if (needsRead) { needsRead = false; target = progressAt(scrollY); }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    // frame-rate independent damping: cinematic, never stepped
    const k = 1 - Math.exp(-dt * 8.5);
    let next = shown + (target - shown) * k;
    if (Math.abs(target - next) < 0.0004) next = target;
    apply(next);
    if (next !== target) raf = requestAnimationFrame(tick);
  }


  // the listener is passive and records one number; the rAF does the rest
  function onScroll() {
    pinned = false;
    scrollY = window.scrollY;
    needsRead = true;
    if (reducedMotion) { target = progressAt(scrollY); apply(nearestStop(target).p); return; }
    if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
  }

  function onResize() {
    measure();
    scrollY = window.scrollY;
    painted = null;
    if (!pinned) target = progressAt(scrollY);
    apply(reducedMotion ? nearestStop(target).p : target);
  }

  /* ---- navigation: scrolling the page is how you move the camera ---- */
  function scrollToProgress(p, instant) {
    const y = offsetOf(p);
    if (instant || reducedMotion) {
      const html = document.documentElement;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
      html.style.scrollBehavior = prev;
      scrollY = window.scrollY;
      target = progressAt(scrollY);
      apply(reducedMotion ? nearestStop(target).p : target);
      return;
    }
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  function goToZone(z) {
    scrollToProgress(api.stopFor(z));
    return true;
  }

  // The test hook (?p= and window.__abeam.setProgress) places the voyage at a progress without
  // touching the scrollbar: the stage is pinned to the top of the document, so a screenshot of
  // the first viewport is the stop itself. The next real scroll takes over again, as usual.
  function setProgress(p) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    pinned = true;
    target = clamp(Number(p) || 0, 0, 1);
    apply(reducedMotion ? nearestStop(target).p : target);
    return shown;
  }

  const onCue = (ev) => { ev.preventDefault(); scrollToProgress(api.stopFor('whole')); };
  if (cue) cue.addEventListener('click', onCue);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  measure();
  scrollY = window.scrollY;
  target = progressAt(scrollY);
  apply(reducedMotion ? nearestStop(target).p : target);
  if (stage) stage.dataset.voyage = 'on';

  return {
    goToZone,
    setProgress,
    getProgress: () => shown,
    destroy() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (cue) cue.removeEventListener('click', onCue);
      window.clearTimeout(swap);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
