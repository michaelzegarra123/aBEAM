// aBeam — main.js
// Page wiring. Reads content.js and hands the 3D boat and the chart to their modules.
import { CONFIG, MARINAS, HOTSPOTS, STATUS_LABELS, COPY_UI } from './content.js';
import { initMap } from './map.js';
import { initVoyage } from './voyage.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function smsHref(body) {
  const text = encodeURIComponent(body || CONFIG.smsBody);
  return `sms:${CONFIG.phoneE164}?body=${text}&body=${text}`;
}

/* ---------- Contact links, price, year ---------- */
$$('a.sms').forEach((a) => { a.href = smsHref(); });
$$('[data-phone]').forEach((el) => { el.textContent = CONFIG.phoneDisplay; });
$$('[data-email]').forEach((el) => {
  el.textContent = CONFIG.email;
  if (el.tagName === 'A') el.href = `mailto:${CONFIG.email}`;
});
const priceEl = $('#price-amount');
if (priceEl) priceEl.textContent = String(CONFIG.startingPrice);
$$('[data-price-low]').forEach((el) => { el.textContent = String(CONFIG.priceRangeLow); });
$$('[data-price-high]').forEach((el) => { el.textContent = String(CONFIG.priceRangeHigh); });
const yearEl = $('#year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ---------- Marina select ---------- */
const marinaSelect = $('#marina');
if (marinaSelect) {
  const keep = Array.from(marinaSelect.options).filter((o) => o.value === '' || o.value === 'other');
  const placeholder = keep.find((o) => o.value === '');
  const other = keep.find((o) => o.value === 'other');
  marinaSelect.innerHTML = '';
  if (placeholder) marinaSelect.appendChild(placeholder);
  MARINAS.forEach((m) => {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.name;
    marinaSelect.appendChild(o);
  });
  if (other) marinaSelect.appendChild(other);
}

/* ---------- Header + sticky CTA ---------- */
const header = $('#site-header');
const onScroll = () => header && header.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const sticky = $('#sticky-cta');
// The hero CTA sits on the pinned stage, so it never leaves the viewport on its own. The
// sentinel is a 1px marker parked one viewport down the voyage: once it has scrolled past the
// top of the window the hero CTA is behind the yacht and the phone bar takes over.
const heroCta = $('#hero-sentinel') || $('#hero-cta-primary');
if (sticky && heroCta && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    const e = entries[0];
    const show = !e.isIntersecting && e.boundingClientRect.top < 0;
    sticky.hidden = !show;
    document.body.classList.toggle('has-sticky', show);
  }, { threshold: 0 });
  io.observe(heroCta);
}

/* ---------- Booking form ---------- */
const form = $('#booking-form');
const status = $('#booking-status');

function setStatus(html, kind) {
  if (!status) return;
  status.innerHTML = html;
  status.classList.remove('is-success', 'is-error');
  if (kind) status.classList.add(kind);
}

function fieldWrap(input) { return input.closest('.field'); }

function clearErrors() {
  $$('.field.is-invalid', form).forEach((f) => f.classList.remove('is-invalid'));
  $$('.field-error', form).forEach((e) => e.remove());
  $$('[aria-invalid]', form).forEach((el) => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  });
}

function fieldLabel(input) {
  const label = form.querySelector(`label[for="${input.id}"]`);
  return label ? label.textContent.replace(/\s+/g, ' ').trim() : input.name;
}

// The error has to reach a screen reader, not just the eye: the field is marked invalid, the
// message is owned by the input through aria-describedby, and the submit handler writes a
// summary into the live region before moving focus.
function markInvalid(input) {
  const wrap = fieldWrap(input);
  if (!wrap) return;
  wrap.classList.add('is-invalid');
  const msg = document.createElement('span');
  msg.className = 'field-error';
  msg.id = `${input.id}-error`;
  msg.textContent = `${fieldLabel(input)}: ${COPY_UI.formErrorRequired}`;
  wrap.appendChild(msg);
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', msg.id);
}

function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function composeMessage(data) {
  const marina = MARINAS.find((m) => m.id === data.marina);
  const marinaName = marina ? marina.name : (data.marina === 'other' ? 'Other / not sure yet' : data.marina);
  const lines = [
    `aBeam request — ${data.name}`,
    `Phone: ${data.phone}`,
    `Marina: ${marinaName}`,
    `Boat / slip: ${data.boat}`,
    `Needed by: ${formatWhen(data.datetime)}`,
  ];
  if (data.notes) lines.push(`Request: ${data.notes}`);
  return lines.join('\n');
}

function showFallback(message) {
  const box = document.createElement('div');
  box.className = 'fallback';
  const intro = document.createElement('span');
  intro.textContent = COPY_UI.formFallbackIntro;
  const ta = document.createElement('textarea');
  ta.readOnly = true;
  ta.value = message;
  ta.setAttribute('aria-label', 'Your message to aBeam');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-accent btn-sm';
  btn.textContent = COPY_UI.formCopy;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(message);
      btn.textContent = COPY_UI.formCopied;
    } catch (err) {
      ta.focus();
      ta.select();
    }
  });
  box.append(intro, ta, btn);
  status.appendChild(box);
}

if (form) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors();
    setStatus('');
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    if (data.hp_token) return;   // honeypot: say and do nothing
    const required = ['name', 'phone', 'marina', 'boat', 'datetime', 'notes'];
    let firstBad = null;
    const missing = [];
    required.forEach((key) => {
      const input = form.elements[key];
      if (!input || !String(data[key] || '').trim()) {
        if (input) { markInvalid(input); missing.push(fieldLabel(input)); }
        firstBad = firstBad || input;
      }
    });
    if (firstBad) {
      setStatus(`${COPY_UI.formErrorSummary} ${missing.join(', ')}.`, 'is-error');
      firstBad.focus();
      return;
    }
    const message = composeMessage(data);
    const submitBtn = $('#booking-submit');
    if (submitBtn) submitBtn.disabled = true;

    if (CONFIG.formEndpoint) {
      try {
        const res = await fetch(CONFIG.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...data, message }),
        });
        if (res.ok) {
          // the only path where the request really reached us
          setStatus(COPY_UI.formSuccess, 'is-success');
          form.reset();
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
      } catch (err) {
        // fall through to the SMS path
      }
    }
    // The sms: navigation may not open anything (desktop) and may unload the page entirely
    // (Android in-app webviews), so the composed message is on screen BEFORE we navigate and
    // the status stays "composing" — we never tell anyone it arrived when it may not have.
    setStatus(COPY_UI.formComposing, 'is-success');
    showFallback(message);
    if (submitBtn) submitBtn.disabled = false;
    window.location.href = smsHref(message);
  });
}

/* ---------- Marina chart ---------- */
try {
  const mapEl = $('#marina-map');
  const listEl = $('#marina-list');
  if (mapEl) {
    initMap({
      mapEl,
      listEl,
      marinas: MARINAS,
      statusLabels: STATUS_LABELS,
      ui: COPY_UI,
      onBook: (id) => {
        if (marinaSelect && MARINAS.some((m) => m.id === id)) marinaSelect.value = id;
      },
    });
  }
} catch (err) {
  console.error('[aBeam] marina chart failed to initialise', err);
}

/* ---------- Section reveals ----------
   `js-reveal` is set on <html> by the inline script in index.html, before the first paint and
   never under reduced motion, so the stylesheet only ever hides a heading when this observer
   is certain to show it again. */
const heads = $$('.section-head');
if (document.documentElement.classList.contains('js-reveal')) {
  if ('IntersectionObserver' in window) {
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        revealIO.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
    heads.forEach((h) => revealIO.observe(h));
  } else {
    heads.forEach((h) => h.classList.add('is-in'));
  }
}

/* ---------- 3D boat + the scroll voyage ---------- */
const voyageEl = $('#voyage');
const stageEl = $('#boat-stage');
const panelEl = $('#boat-panel');
const chipsEl = $('#boat-chips');
let voyage = null;

// Without WebGL the voyage degrades to a normal, stacked section: the CSS silhouette in place
// of the canvas, the five zones as cards, and the chips still driving the panel.
function boatFallback() {
  if (stageEl) stageEl.classList.add('boat-stage--fallback');
  if (voyageEl) voyageEl.classList.add('is-fallback');
  const cards = $('#voyage-fallback');
  if (cards && !cards.children.length) {
    HOTSPOTS.forEach((h) => {
      const card = document.createElement('article');
      card.className = 'voyage-card';
      const eyebrow = document.createElement('p');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = h.eyebrow;
      const title = document.createElement('h3');
      title.textContent = h.title;
      const body = document.createElement('p');
      body.textContent = h.body;
      card.append(eyebrow, title, body);
      cards.appendChild(card);
    });
    cards.hidden = false;
  }
  if (chipsEl && panelEl) {
    chipsEl.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chip');
      if (!chip) return;
      const h = HOTSPOTS.find((x) => x.zone === chip.dataset.zone);
      if (!h) return;
      $$('.chip', chipsEl).forEach((c) => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      $('.panel-eyebrow', panelEl).textContent = h.eyebrow;
      $('.panel-title', panelEl).textContent = h.title;
      $('.panel-body', panelEl).textContent = h.body;
      const cta = $('.panel-cta', panelEl);
      cta.textContent = h.cta.label;
      cta.href = h.cta.href;
    });
  }
}

// Permanent test hook, used by the query reader below and by review scripts.
window.__abeam = {
  setProgress(p) { if (voyage) voyage.setProgress(p); return voyage ? voyage.getProgress() : null; },
  selectZone(zone) {
    const chip = chipsEl && chipsEl.querySelector(`[data-zone="${zone}"]`);
    if (chip) chip.click();
  },
};

if (stageEl && panelEl && chipsEl) {
  import('./boat.js')
    .then(({ initBoat }) => {
      const api = initBoat({
        stageEl, panelEl, chipsEl, hotspots: HOTSPOTS, reducedMotion, ui: COPY_UI,
        // a chip or a marker asks the voyage to scroll; the camera follows the scroll
        onNavigate: (zone) => (voyage ? voyage.goToZone(zone) : false),
      });
      if (!api) { boatFallback(); return; }
      voyage = initVoyage({ sectionEl: voyageEl, api, reducedMotion });
      window.__abeam.info = api.info;
      const p = new URLSearchParams(window.location.search).get('p');
      if (p !== null) window.__abeam.setProgress(parseFloat(p));
    })
    .catch((err) => {
      console.error('[aBeam] 3D boat failed to load', err);
      boatFallback();
    });
}
