// aBeam — chapters.js
// The voyage is a film, not a timeline. One sticky stage; the track under it is divided
// into equal bands, one per chapter. Crossing into a band is a CUT: the 3D rig eases
// once to that chapter's composed shot and then holds. Nothing is scrubbed, the wheel is
// never captured, and the page scroll stays the only source of truth.
//
// Scroll handling is deliberately thin: a passive listener records scrollY and nothing
// else, one rAF does the work, and every measurement is cached until a resize.

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

// The running order of the film. boat.js keys its shot list off this, and it is the one
// place the sequence is written down.
export const CHAPTER_KEYS = ['hero', 'whole', 'deck', 'cabin', 'engine', 'hull', 'wide'];
export const zoneOfChapter = (key) => (key === 'hero' || key === 'wide' ? null : key);
// which side of the frame the card sits on, per chapter (desktop alternates)
export const CARD_SIDE = { whole: 'right', deck: 'left', cabin: 'right', engine: 'left', hull: 'right' };

/* Put a ?p= still into the DOM before the first paint. A document that is not being
   rendered (a background tab, a headless capture) paints once and then keeps that
   picture for any DOM change that follows, so a deep-linked chapter has to be in the
   markup from the start rather than applied when the 3D module finishes loading. */
export function prepareStill({ voyageEl, panelEl, chipsEl, hotspots, search }) {
  if (!voyageEl) return null;
  if (document.visibilityState !== 'visible') voyageEl.setAttribute('data-still', '');
  const raw = new URLSearchParams(search != null ? search : window.location.search).get('p');
  if (raw === null || raw === '' || !Number.isFinite(Number(raw))) return null;
  const p = clamp(Number(raw), 0, 1);
  const i = clamp(Math.floor(p * CHAPTER_KEYS.length), 0, CHAPTER_KEYS.length - 1);
  const zone = zoneOfChapter(CHAPTER_KEYS[i]);
  voyageEl.setAttribute('data-still', '');
  voyageEl.dataset.chapter = String(i);
  const h = zone && hotspots ? hotspots.find((x) => x.zone === zone) : null;
  if (panelEl) {
    if (h) {
      panelEl.querySelector('.panel-eyebrow').textContent = h.eyebrow;
      panelEl.querySelector('.panel-title').textContent = h.title;
      panelEl.querySelector('.panel-body').textContent = h.body;
      const cta = panelEl.querySelector('.panel-cta');
      cta.textContent = h.cta.label;
      cta.href = h.cta.href;
      panelEl.dataset.zone = zone;
      panelEl.dataset.side = CARD_SIDE[zone] || 'right';
      panelEl.classList.add('is-open');
    } else {
      panelEl.classList.remove('is-open');
    }
  }
  if (chipsEl) {
    chipsEl.querySelectorAll('[data-zone]').forEach((c) => {
      c.setAttribute('aria-pressed', zone && c.dataset.zone === zone ? 'true' : 'false');
    });
  }
  return { progress: p, chapter: i, zone };
}

export function initChapters({ voyageEl, api, reducedMotion = false }) {
  if (!voyageEl) return null;
  const stageBox = voyageEl.querySelector('.voyage-stage');

  /* ---------- no WebGL: unstack into ordinary cards, chips drive the one card ---------- */
  if (!api) {
    voyageEl.classList.add('is-fallback');
    voyageEl.removeAttribute('data-chapter');
    window.__abeam = {
      setProgress() { return 0; },
      selectZone(zone) {
        const chip = voyageEl.querySelector(`.chip[data-zone="${zone}"]`);
        if (chip) chip.click();
        return !!chip;
      },
    };
    return null;
  }

  const N = api.chapters.length;
  let top = 0, range = 1, band = 1;
  let current = -1, queued = 0, scrollY = window.scrollY, forcedUntil = 0;
  // "still" mode: setProgress() / ?p= park the page at the top of the voyage and hold a
  // chosen shot, so a still of any chapter can be taken (and deep-linked) without the
  // sticky stage having scrolled out of the document's first screen. The first real
  // scroll hands control straight back to the bands.
  let pinned = false, pinnedP = 0;

  /* ---------- measurement (cached; only ever read on resize) ---------- */
  function measure() {
    const r = voyageEl.getBoundingClientRect();
    top = Math.max(0, r.top + window.scrollY);
    range = Math.max(1, voyageEl.offsetHeight - (stageBox ? stageBox.offsetHeight : 0));
    band = range / N;
  }

  const progressOf = (y) => clamp((y - top) / range, 0, 1);
  // the scroll position that sits in the middle of chapter i's band
  const anchorOf = (i) => Math.round(top + (i + 0.5) * band);

  // A hidden document (a background tab — and that is what a headless capture is) never
  // advances CSS transitions, so a still has to land on its final styles directly.
  function setStillMode(on) {
    if (on) voyageEl.setAttribute('data-still', '');
    else if (document.visibilityState === 'visible') voyageEl.removeAttribute('data-still');
    api.setStill(on);
  }

  function commit(i, instant) {
    if (i === current && !instant) return;
    current = i;
    voyageEl.dataset.chapter = String(i);
    api.enterChapter(i, { instant });
  }

  /* ---------- the one rAF that does all the work ---------- */
  function tick() {
    queued = 0;
    if (pinned) return;                             // a held still owns the chapter
    const f = progressOf(scrollY) * N;
    const i = clamp(Math.floor(f), 0, N - 1);
    if (i !== current) {
      const frac = f - Math.floor(f);
      // hysteresis: a boundary has to be properly crossed, so a jittery wheel or a
      // rubber-band at the edge of a band cannot flicker two shots against each other
      const settled = i === current + 1 ? frac >= 0.07 : (i === current - 1 ? frac <= 0.93 : true);
      if (settled) commit(i, false);
    }
  }
  function schedule() {
    if (!queued) queued = requestAnimationFrame(tick);
  }
  function onScroll() {
    scrollY = window.scrollY;                       // no layout reads in here
    if (pinned) {
      if (scrollY <= 2) return;                     // our own scrollTo(0)
      pinned = false;                               // a real scroll: resume the film
      setStillMode(false);
    }
    if (performance.now() < forcedUntil) return;
    schedule();
  }
  function onResize() {
    measure();
    api.reframe();
    if (pinned) return;
    scrollY = window.scrollY;
    schedule();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize, { passive: true });

  /* ---------- navigation: chips, markers and the public API all scroll ---------- */
  function goTo(i, smooth = true) {
    measure();
    if (pinned) { pinned = false; setStillMode(false); }
    const n = clamp(Math.round(i), 0, N - 1);
    const y = anchorOf(n);
    scrollY = y;
    // apply the cut immediately and hold off the scroll handler while the smooth scroll
    // runs, so the shot cannot be re-triggered by the bands it travels through
    forcedUntil = performance.now() + (smooth && !reducedMotion ? 900 : 0);
    commit(n, false);
    window.scrollTo({ top: y, behavior: smooth && !reducedMotion ? 'smooth' : 'auto' });
  }
  api.setNavigator((i) => goTo(i, true));

  /* ---------- public hooks: window.__abeam + ?p= ---------- */
  function setProgress(p) {
    const v = clamp(Number(p) || 0, 0, 1);
    measure();
    pinned = true;
    pinnedP = v;
    forcedUntil = 0;
    window.scrollTo({ top: 0, behavior: 'auto' });
    scrollY = 0;
    commit(clamp(Math.floor(v * N), 0, N - 1), true);
    setStillMode(true);
    return v;
  }
  window.__abeam = {
    setProgress,
    selectZone(zone, opts = {}) {
      const i = api.chapterOf(zone);
      if (opts.smooth) goTo(i, true);
      else setProgress((i + 0.5) / N);
      return i;
    },
    chapters: api.chapters.map((c) => c.key),
    get chapter() { return current; },
    get progress() { return pinned ? pinnedP : progressOf(window.scrollY); },
  };

  /* ---------- start ---------- */
  // a page that opens hidden gets its styles applied without transitions, so the first
  // frame it ever shows is already composed
  const onPageVis = () => {
    if (document.visibilityState !== 'visible') return;
    if (pinned) return;
    voyageEl.removeAttribute('data-still');
    // a hidden document runs no rAF, so re-sync the chapter to wherever the page is
    scrollY = window.scrollY;
    measure();
    schedule();
  };
  document.addEventListener('visibilitychange', onPageVis);
  if (document.visibilityState !== 'visible') voyageEl.setAttribute('data-still', '');

  measure();

  const q = new URLSearchParams(window.location.search).get('p');
  if (q !== null && q !== '' && Number.isFinite(Number(q))) {
    // A still never passes through chapter 0 on its way in: prepareStill() has already
    // put the right chapter in the DOM, and it must stay that way from the first paint.
    const apply = () => setProgress(Number(q));
    apply();
    // fonts and the marina chart can still change the page height under us
    window.setTimeout(apply, 60);
    window.addEventListener('load', () => window.setTimeout(apply, 40), { once: true });
  } else {
    commit(clamp(Math.floor(progressOf(window.scrollY) * N), 0, N - 1), true);
  }

  return {
    goTo,
    setProgress,
    destroy() {
      document.removeEventListener('visibilitychange', onPageVis);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', onResize);
      if (queued) cancelAnimationFrame(queued);
      if (window.__abeam && window.__abeam.setProgress === setProgress) delete window.__abeam;
    },
  };
}
