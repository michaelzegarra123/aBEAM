// aBeam — map.js
// Pins and popups layered over the inline SVG chart. No libraries, no tiles, no fetches.

const VIEW_W = 1000;
const VIEW_H = 736;

export function initMap({ mapEl, listEl, marinas, statusLabels, ui, onBook }) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const dockQuery = window.matchMedia('(max-width: 600px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Overlay for pins
  const overlay = document.createElement('div');
  overlay.className = 'chart-overlay';
  mapEl.appendChild(overlay);

  // Decorative frame: a hairline mat and soft edge vignette so the chart reads
  // as a mounted print. Never hit-tested, never announced.
  const vignette = document.createElement('div');
  vignette.className = 'chart-vignette';
  vignette.setAttribute('aria-hidden', 'true');
  overlay.appendChild(vignette);

  // Dock (phone): the popup renders below the chart instead of floating.
  // It sits after the marina list so a docked card follows the button that
  // opened it in both reading and tab order.
  const frame = mapEl.closest('.chart-frame') || mapEl;
  const dock = document.createElement('div');
  dock.className = 'chart-popup-dock';
  (listEl || frame).insertAdjacentElement('afterend', dock);

  // Popup (one, shared). No role="dialog": it opens on hover/focus and never
  // takes focus on its own, so dialog semantics would promise what it does not
  // do. It stays a labelled, programmatically focusable region instead.
  const popup = document.createElement('div');
  popup.className = 'chart-popup';
  popup.id = 'marina-popup';
  popup.tabIndex = -1;
  popup.setAttribute('aria-labelledby', 'marina-popup-name');
  popup.hidden = true;
  popup.innerHTML = `
    <button type="button" class="popup-close" aria-label="Close">×</button>
    <p class="popup-name" id="marina-popup-name"></p>
    <p class="popup-sub"></p>
    <p class="popup-row"><span class="status-pill"></span><span class="popup-berths"></span></p>
    <a class="popup-cta text-link" href="#book"></a>
  `;

  const pins = new Map();
  let openId = null;
  let pinned = false;
  let closeTimer = null;
  let suppressFocusOpen = false;

  marinas.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pin is-${m.status}`;
    btn.dataset.id = m.id;
    btn.style.left = `${(m.x / VIEW_W) * 100}%`;
    btn.style.top = `${(m.y / VIEW_H) * 100}%`;
    btn.style.setProperty('--pin-i', String(i)); // staggers the breathing halo
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'marina-popup');
    btn.setAttribute('aria-describedby', 'marina-popup');
    btn.setAttribute('aria-label', `${m.name}: ${statusLabels[m.status] || m.status}`);
    btn.innerHTML = `<span class="pin-pulse" aria-hidden="true"></span><span class="pin-dot" aria-hidden="true"></span><span class="pin-label" aria-hidden="true">${m.short || m.name}</span>`;
    overlay.appendChild(btn);
    pins.set(m.id, btn);

    if (!coarse) {
      btn.addEventListener('mouseenter', () => { if (!pinned) open(m.id, false); });
      btn.addEventListener('mouseleave', () => { if (!pinned) scheduleClose(); });
    }
    // !suppressFocusOpen: a programmatic focus restore must not re-open what the
    // user just dismissed. Passing `pinned` through keeps the card following the
    // keyboard while preserving the pinned flag, so a lingering mouseleave can
    // no longer close it out from under focus.
    btn.addEventListener('focus', () => { if (!suppressFocusOpen) open(m.id, pinned); });
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (openId === m.id && pinned) close();
      else open(m.id, true);
    });
    btn.addEventListener('keydown', (ev) => {
      const ids = marinas.map((x) => x.id);
      const i = ids.indexOf(m.id);
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { ev.preventDefault(); pins.get(ids[(i + 1) % ids.length]).focus(); }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { ev.preventDefault(); pins.get(ids[(i - 1 + ids.length) % ids.length]).focus(); }
    });
  });

  // After the pins, so Tab reaches the open card from the pin that opened it.
  overlay.appendChild(popup);

  if (!coarse) {
    popup.addEventListener('mouseenter', () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } });
    popup.addEventListener('mouseleave', () => { if (!pinned) scheduleClose(); });
  }
  popup.querySelector('.popup-close').addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = openId;
    close();
    restore(id);
  });
  popup.querySelector('.popup-cta').addEventListener('click', () => { if (openId && onBook) onBook(openId); });
  popup.addEventListener('click', (ev) => ev.stopPropagation());

  document.addEventListener('click', (ev) => {
    if (!openId) return;
    if (ev.target.closest('.pin') || ev.target.closest('.chart-popup')) return;
    close();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && openId) { const id = openId; close(); restore(id); } });

  if (listEl) {
    listEl.querySelectorAll('.marina-item').forEach((li) => {
      const trigger = li.querySelector('.marina-item-btn') || li;
      if (trigger !== li) {
        trigger.setAttribute('aria-controls', 'marina-popup');
        trigger.setAttribute('aria-expanded', 'false');
      }
      trigger.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = li.dataset.id;
        if (openId === id && pinned) { close(); return; }
        open(id, true);
        if (dockQuery.matches) {
          mapEl.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
          // the card now sits below this button — send the reader to it
          popup.focus({ preventScroll: true });
        }
      });
    });
  }

  window.addEventListener('resize', () => { if (openId) position(openId); });
  // Safari/iOS before 14 only has the deprecated addListener on a MediaQueryList;
  // calling addEventListener there throws and would abort the rest of initMap.
  const onDockChange = () => { if (openId) position(openId); };
  if (typeof dockQuery.addEventListener === 'function') dockQuery.addEventListener('change', onDockChange);
  else if (typeof dockQuery.addListener === 'function') dockQuery.addListener(onDockChange);

  // Return focus to a pin without the focus handler re-opening the card the
  // user just dismissed.
  function restore(id) {
    const btn = id && pins.get(id);
    if (!btn) return;
    suppressFocusOpen = true;
    btn.focus();
    suppressFocusOpen = false;
  }

  function syncList(id) {
    if (!listEl) return;
    listEl.querySelectorAll('.marina-item').forEach((li) => {
      const on = li.dataset.id === id;
      li.classList.toggle('is-active', on);
      li.querySelector('.marina-item-btn')?.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
  }

  function scheduleClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => { if (!pinned) close(); }, 260);
  }

  function fill(m) {
    popup.querySelector('.popup-name').textContent = m.name;
    popup.querySelector('.popup-sub').textContent = m.sub || '';
    const pill = popup.querySelector('.status-pill');
    pill.className = `status-pill is-${m.status}`;
    pill.textContent = statusLabels[m.status] || m.status;
    popup.querySelector('.popup-berths').textContent = `${m.berths} ${ui.berthsSuffix || 'berths'}`;
    const cta = popup.querySelector('.popup-cta');
    cta.textContent = m.status === 'serving' ? ui.popupCtaServing : ui.popupCtaSoon;
    cta.href = '#book';
  }

  function position(id) {
    const m = marinas.find((x) => x.id === id);
    if (!m) return;
    if (dockQuery.matches) {
      if (popup.parentElement !== dock) dock.appendChild(popup);
      popup.classList.add('is-docked');
      popup.style.left = '';
      popup.style.top = '';
      popup.classList.remove('is-flip-x', 'is-flip-y');
      return;
    }
    if (popup.parentElement !== overlay) overlay.appendChild(popup);
    popup.classList.remove('is-docked');
    const W = mapEl.clientWidth;
    const H = mapEl.clientHeight;
    const px = (m.x / VIEW_W) * W;
    const py = (m.y / VIEW_H) * H;
    popup.style.visibility = 'hidden';
    popup.hidden = false;
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    const gap = 18;
    let left = px + gap;
    let top = py - ph - gap;
    let flipX = false;
    let flipY = false;
    if (left + pw > W - 8) { left = px - pw - gap; flipX = true; }
    if (left < 8) left = 8;
    if (top < 8) { top = py + gap; flipY = true; }
    if (top + ph > H - 8) top = Math.max(8, H - ph - 8);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.classList.toggle('is-flip-x', flipX);
    popup.classList.toggle('is-flip-y', flipY);
    popup.style.visibility = '';
  }

  function open(id, pin) {
    const m = marinas.find((x) => x.id === id);
    if (!m) return;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    openId = id;
    pinned = !!pin;
    fill(m);
    popup.hidden = false;
    position(id);
    pins.forEach((b, key) => {
      b.setAttribute('aria-expanded', key === id ? 'true' : 'false');
      b.classList.toggle('is-open', key === id);
    });
    syncList(id);
  }

  function close() {
    openId = null;
    pinned = false;
    popup.hidden = true;
    pins.forEach((b) => { b.setAttribute('aria-expanded', 'false'); b.classList.remove('is-open'); });
    syncList(null);
  }

  return { open, close };
}
