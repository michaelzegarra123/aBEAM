// aBeam — main.js
// Page wiring. Reads content.js and hands the 3D boat and the chart to their modules.
import { CONFIG, MARINAS, HOTSPOTS, STATUS_LABELS, COPY_UI } from './content.js';
import { initMap } from './map.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function smsHref(body) {
  return `sms:${CONFIG.phoneE164}?&body=${encodeURIComponent(body || CONFIG.smsBody)}`;
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
const heroCta = $('#hero-cta-primary');
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
}

function markInvalid(input) {
  const wrap = fieldWrap(input);
  if (!wrap) return;
  wrap.classList.add('is-invalid');
  const msg = document.createElement('span');
  msg.className = 'field-error';
  msg.textContent = COPY_UI.formErrorRequired;
  wrap.appendChild(msg);
}

function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
    if (data.company) { // honeypot
      setStatus(COPY_UI.formSuccess, 'is-success');
      form.reset();
      return;
    }
    const required = ['name', 'phone', 'marina', 'boat', 'datetime', 'notes'];
    let firstBad = null;
    required.forEach((key) => {
      const input = form.elements[key];
      if (!input || !String(data[key] || '').trim()) {
        if (input) markInvalid(input);
        firstBad = firstBad || input;
      }
    });
    if (firstBad) {
      firstBad.focus();
      return;
    }
    const message = composeMessage(data);

    if (CONFIG.formEndpoint) {
      try {
        const res = await fetch(CONFIG.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ ...data, message }),
        });
        if (res.ok) {
          setStatus(COPY_UI.formSuccess, 'is-success');
          form.reset();
          return;
        }
      } catch (err) {
        // fall through to the SMS path
      }
    }
    setStatus(COPY_UI.formComposing, 'is-success');
    const href = smsHref(message);
    window.setTimeout(() => {
      setStatus(COPY_UI.formSuccess, 'is-success');
      showFallback(message);
    }, 900);
    window.location.href = href;
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

/* ---------- 3D boat ---------- */
const stageEl = $('#boat-stage');
const panelEl = $('#boat-panel');
const chipsEl = $('#boat-chips');

function boatFallback() {
  if (stageEl) stageEl.classList.add('boat-stage--fallback');
  // keep the chips + panel working without WebGL
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

if (stageEl && panelEl && chipsEl) {
  import('./boat.js')
    .then(({ initBoat }) => {
      const api = initBoat({ stageEl, panelEl, chipsEl, hotspots: HOTSPOTS, reducedMotion, ui: COPY_UI });
      if (!api) boatFallback();
    })
    .catch((err) => {
      console.error('[aBeam] 3D boat failed to load', err);
      boatFallback();
    });
}
