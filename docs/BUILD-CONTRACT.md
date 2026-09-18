# aBeam site — BUILD CONTRACT (all agents build against this; it wins over personal preference)

Read `BRIEF.md` (client brief) first. Copy comes from `beam-copy/final-copy.json` — use it VERBATIM
(fix only obvious typos). Research facts come from `.work/research/marinas.json`.
Chart SVG comes from `.work/research/chart.svg` (+ `.work/research/chart-geo.json`).

## 0. Deliverable layout (working directory root = the folder containing this file)

beam-site/
  index.html     full standalone HTML document (doctype/html/head/body — this is what the client hosts)
  styles.css     tokens + base + every section EXCEPT boat-stage internals and map internals
  boat.css       styles owned by the 3D module (hotspots, tooltips, stage overlays, panel internals)
  map.css        styles owned by the chart module (pins, popup, legend)
  content.js     THE ONE EDITABLE DATA FILE: CONFIG, MARINAS, HOTSPOTS (ES module, exports)
  main.js        page wiring (ES module) — imports content.js, boat.js, map.js
  boat.js        Three.js showcase module — `export function initBoat(opts)`
  map.js         marina chart module — `export function initMap(opts)`
beam-copy/
  final-copy.json   the approved copy deck (structured)
  aBeam-copy-blocks.md  human-readable reusable copy blocks

No build step. No bundler. No npm. Plain ES modules served statically.

## 1. External resources (hard CSP allowlist — anything else silently fails)

- Scripts ONLY from https://cdn.jsdelivr.net/npm/ or https://cdnjs.cloudflare.com. Pin exact versions.
- Stylesheets ONLY from https://fonts.googleapis.com (fonts from fonts.gstatic.com).
- No images, fetches, XHR, websockets to any external host. Everything else inline or data: URI.
- Three.js: use an importmap in index.html:
    <script type="importmap">
    {"imports":{
      "three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js",
      "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }}
    </script>
  boat.js imports: `import * as THREE from 'three'`, `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`,
  `import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'`.
  Add `<link rel="modulepreload" href="https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js">`.
- Google Fonts (one link, display=swap):
  https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Archivo:wdth,wght@75..125,400;75..125,500;75..125,600;75..125,700&display=swap

## 2. Design system (tokens — exact names; every color in every file comes from these)

```css
:root{
  /* brand */
  --navy-950:#071427; --navy-900:#0B1F3A; --navy-800:#10294B; --navy-700:#173B67; --navy-600:#1F4E85;
  --ink:#12233A; --ink-soft:#33465E; --slate:#5A6B80; --line:#D9E1EA; --mist:#EEF2F6; --paper:#F6F8FA; --white:#FFFFFF;
  --teak:#C4884F; --teak-deep:#9E6636; --teak-pale:#EBD3B3; --teak-ghost:#F7EEE2;
  --sea-100:#E4EEF5; --sea-200:#D7E6F0; --sea-300:#BFD5E6; --sea-400:#9FBFD8;
  --sand:#EDE4D2; --sand-deep:#D9CBB0;
  --kelp:#237A57; --kelp-soft:#DDEFE6;
  /* semantic (light) */
  --bg:var(--white); --bg-alt:var(--paper); --fg:var(--ink); --fg-soft:var(--slate);
  --surface:var(--white); --surface-alt:var(--mist); --border:var(--line);
  --accent:var(--teak); --accent-deep:var(--teak-deep); --accent-soft:var(--teak-ghost);
  --stage-bg:var(--navy-900); --stage-bg-deep:var(--navy-950); --stage-fg:#F2F6FA; --stage-muted:#A9BBD1; --stage-line:rgba(255,255,255,.14);
  --chart-water:var(--sea-200); --chart-water-deep:var(--sea-300); --chart-land:var(--sand); --chart-line:var(--sand-deep); --chart-ink:var(--ink-soft);
  --status-serving:var(--kelp); --status-serving-soft:var(--kelp-soft); --status-soon:var(--teak); --status-soon-soft:var(--teak-ghost);
  /* type */
  --font-display:"Fraunces",Georgia,"Times New Roman",serif;
  --font-body:"Archivo","Helvetica Neue",Arial,sans-serif;
  /* shape & motion */
  --radius-sm:6px; --radius:12px; --radius-lg:20px; --radius-pill:999px;
  --shadow-1:0 1px 2px rgba(11,31,58,.06),0 4px 16px rgba(11,31,58,.08);
  --shadow-2:0 12px 40px rgba(11,31,58,.18);
  --container:1120px; --gutter:clamp(16px,4vw,40px);
  --ease:cubic-bezier(.2,.7,.2,1); --dur:.28s;
}
```
Dark theme (styles.css owns it): redefine ONLY tokens under
`@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){...} }` AND again under `:root[data-theme="dark"]{...}`.
Dark values: --bg:#0A1729; --bg-alt:#0E1F36; --fg:#E8EEF5; --fg-soft:#A9BBD1; --surface:#10294B; --surface-alt:#173B67;
--border:rgba(255,255,255,.12); --accent:#D4A06A; --accent-deep:#EBD3B3; --accent-soft:rgba(212,160,106,.14);
--chart-water:#10294B; --chart-water-deep:#0B1F3A; --chart-land:#2A2E36; --chart-line:#4A5261; --chart-ink:#C7D2DF;
--status-serving:#4CC391; --status-serving-soft:rgba(76,195,145,.16); --status-soon:#D4A06A; --status-soon-soft:rgba(212,160,106,.16);
--shadow-1:0 1px 2px rgba(0,0,0,.3),0 4px 16px rgba(0,0,0,.3); --shadow-2:0 12px 40px rgba(0,0,0,.5).
Stage tokens stay the same in both themes (the stage is always navy). `body{background:var(--bg);color:var(--fg)}` explicitly.

OFFICIAL SLOGAN (verbatim): "By your side, Beyond the shore" — render as `.tagline` under the wordmark in the hero eyebrow position and in the footer next to the wordmark.
Wordmark: text "aBeam" set in Archivo, wght 700, wdth 112, letter-spacing .02em; the leading "a" in --accent (teak),
"Beam" in the surrounding text color. Class `.wordmark` with `<span class="wordmark-a">a</span>Beam`. No icon/logo image.

Type scale (Fraunces for display roles; Archivo for everything else):
  h1 hero: clamp(2.4rem, 6.2vw, 4.4rem), wght 500, line-height 1.02, letter-spacing -.015em, `text-wrap:balance`
  h2 section: clamp(1.9rem, 3.6vw, 2.8rem), wght 500, line-height 1.08, letter-spacing -.01em, balance
  h3 card: 1.2rem Archivo 600
  eyebrow: Archivo 600 .75rem uppercase letter-spacing .14em color --accent-deep (on stage: --stage-muted)
  body: 1.0625rem / 1.6 Archivo 400; lead paragraphs 1.2rem; max-width 62ch for running text
  small/meta: .875rem --fg-soft; tabular-nums where digits align.
Motion: transitions on --dur/--ease; honor `@media (prefers-reduced-motion: reduce)` everywhere (no autorotate, no bob, no reveal animations).
Every page section is visible at rest — nothing parked at opacity:0 waiting for an observer.

Layout concept: one continuous NAVY "water" stage across sections 1–2 (hero copy sits on the stage; the 3D boat sits directly
beneath it so its mast/hull rise into the hero — that IS the hero's "glimpse"). Below the stage, white/paper sections
in a 1120px column with a thin teak rule as a recurring "dock line" divider. The marina chart section sits on a pale --sea-100
ground. Phone (<768px): a fixed bottom "Text us" bar (`#sticky-cta`) appears once the hero CTA scrolls out of view.
Hero CTA (`#hero-cta-primary`) is the largest, highest-contrast element above the fold at every width — teak pill button,
white text, min-height 56px, full-width on phones.

## 3. Page structure — section order & required IDs/classes (index.html owns this; JS relies on it)

```
header#site-header.site-header            sticky; contains .wordmark (a[href="#top"]), nav.site-nav (links to #how #services #marinas #pricing #book), a#header-cta.btn.btn-accent.sms
main#top
  section#hero.hero.stage                 h1#hero-headline, p.hero-sub, .hero-actions > a#hero-cta-primary.btn.btn-accent.btn-xl.sms + a#hero-cta-secondary.btn.btn-ghost[href="#book"], p.hero-micro
  section#showcase.showcase.stage         .showcase-head (eyebrow, h2, p.intro) ; div#boat-stage.boat-stage (EMPTY — boat.js fills it) ; p#boat-hint.boat-hint ;
                                          div#boat-chips.boat-chips (5 buttons: button.chip[data-zone="whole|hull|deck|cabin|engine"][aria-pressed]) ;
                                          aside#boat-panel.boat-panel (at rest = the "whole" zone content):
                                             .panel-eyebrow, h3.panel-title, p.panel-body, a.panel-cta.btn.btn-accent-outline[href]
  section#how.how                          eyebrow, h2, p.intro, ol.steps > li.step ×3 (h3 + p) — numbering is real (it's a sequence)
  section#included.included                eyebrow, h2, p.intro, ul.included-grid > li.included-item ×6 (h3 + p) ; figure.brief-sample (a sample "conditions brief" text bubble: .brief-bubble + figcaption)
  section#services.services                eyebrow, h2, p.intro, div.service-grid > article.service-card ×3 (h3 + p + a.text-link) ; p.services-more (the "anything else" line)
  section#marinas.marinas                  eyebrow, h2, p.intro ; div#marina-map.marina-map (contains the INLINE SVG chart from .work/research/chart.svg, with <title>/<desc>) ; div.marina-legend ; ul#marina-list.marina-list (li per marina: name, status pill, berths — static, mirrors the pins) ; p.marinas-footnote
  section#trust.trust                      eyebrow, h2, p.intro, ul.trust-grid > li.trust-point ×4 (h3 + p)
  section#pricing.pricing                  eyebrow, h2, div.price-card ( .price-line: span.price-prefix + span#price-amount + span.price-suffix ; p.price-note ; ul.price-includes? optional ) ; aside#membership.membership (h3, p, a#membership-cta.btn.btn-ghost-dark[href="#book"])
  section#book.book                        eyebrow, h2, p.intro ; form#booking-form (fields below) ; p#booking-status[aria-live="polite"] ; p.book-alt (a#booking-sms-alt.sms)
footer#site-footer.site-footer             .wordmark, p.footer-blurb, address (a.sms phone, a[mailto]), p.footer-area, ul.social-links (3 placeholder links with aria-label, href="#", rel="noopener"), p.footer-legal (© <span id="year"></span>)
div#sticky-cta.sticky-cta[hidden]          a.btn.btn-accent.sms (label + small sublabel)
```
Booking form fields (each `<label for>` + control with stable `id` and `name`):
  name (text, required, autocomplete=name) · phone (tel, required, autocomplete=tel, inputmode=tel) · marina (select#marina, required; options = MARINAS names + "Other / not sure") ·
  boat (text, required, placeholder like "Boat name · slip A-12") · datetime (datetime-local#datetime, required) · notes (textarea, optional — "provisions to bring, route, anything else")
  submit button#booking-submit.btn.btn-accent.btn-xl. Include a honeypot input (name="company", visually hidden, tabindex=-1, autocomplete=off).
Every "text us" link: `<a class="sms" href="sms:+14155550123">` — main.js rewrites hrefs from CONFIG (number + prefilled body). The 555 number is a PLACEHOLDER.

## 4. content.js — the editable data file (exact export names; main.js/boat.js/map.js consume these)

```js
export const CONFIG = {
  brand: 'aBeam',
  phoneDisplay: '(415) 555-0123',           // PLACEHOLDER — client replaces
  phoneE164: '+14155550123',                // PLACEHOLDER — client replaces
  email: 'hello@abeam.example',             // PLACEHOLDER — client replaces
  smsBody: '<from copy.sms_prefill>',       // prefilled text message
  startingPrice: 75,                        // "Starting at $X per outing" — editable; brief anchor range is $75–150 by boat size
  priceRangeLow: 75, priceRangeHigh: 150,
  formEndpoint: '',                         // optional: e.g. a Formspree/Basin URL; empty = fall back to composing an SMS
  serviceArea: 'San Francisco city marinas',
  social: [{label:'Instagram',href:'#'},{label:'LinkedIn',href:'#'},{label:'Nextdoor',href:'#'}]  // placeholders
};
// status: 'serving' | 'soon'.  RULE (client): a marina may ONLY be 'serving' once vendor-access approval is confirmed for it.
export const MARINAS = [
  { id:'sf-marina',   name:'San Francisco Marina', sub:'Marina Green · Marina Yacht Harbor (East & West Harbors)', status:'soon', berths:'~700', berthsNote:'approx.', x:<chart-x>, y:<chart-y>, lat:.., lon:.. },
  { id:'pier39',      name:'Pier 39 Marina',       sub:'Fisherman’s Wharf',                                       status:'soon', berths:'~300', ... },
  { id:'south-beach', name:'South Beach Harbor',   sub:'Pier 40 · The Embarcadero, by Oracle Park',               status:'soon', berths:'~700', ... }
];
export const HOTSPOTS = [  // order = chips order; 'whole' first
  { zone:'whole',  label:'Whole boat',   service:'Full Management',      eyebrow:'..', title:'..', tooltip:'..', body:'..', cta:{label:'..', href:'#book'} },
  { zone:'hull',   label:'Hull & exterior', service:'Detailing', ... },
  { zone:'deck',   label:'Deck',         service:'Ready & Go prep', ... },
  { zone:'cabin',  label:'Cabin',        service:'Ready & Go prep', ... },
  { zone:'engine', label:'Engine room',  service:'Repairs & Maintenance', ... }
];
export const STATUS_LABELS = { serving:'Currently serving', soon:'Coming soon' };
```
(x,y) for pins are in the chart's viewBox units (0..1000 × 0..736) — take them from `.work/research/chart-geo.json`.

## 5. Module interfaces

### boat.js — `export function initBoat({ stageEl, panelEl, chipsEl, hotspots, reducedMotion })`
- Creates inside `stageEl`: `<canvas>` (WebGL), a CSS2DRenderer label layer (`.boat-labels`), an activation pill (`button.boat-activate`), a loading veil (`.boat-veil`) removed after the first rendered frame.
- Returns `{ selectZone(zone), destroy() }`.
- Wires `chipsEl` buttons (`[data-zone]`, `aria-pressed`) and the hotspot markers to `selectZone`. `selectZone` updates `panelEl` internals
  (`.panel-eyebrow`, `.panel-title`, `.panel-body`, `.panel-cta` text+href) from `hotspots`, sets the pressed chip, and flies the camera to frame that zone (~700ms, eased).
- Markers: one `CSS2DObject` per hotspot zone except 'whole' → `<button class="hotspot" data-zone aria-label="…"><span class="hotspot-dot"></span><span class="hotspot-tip" role="tooltip">…tooltip…</span></button>`.
  Tooltip shows on hover AND :focus-visible (butler voice, from `hotspots[].tooltip`). Markers behind the hull (raycast-occluded) get `.is-behind` (opacity .35).
- Procedural boat (no model files, no fetches): ~34 ft sloop. Lofted hull from cross-section stations (BufferGeometry), white/off-white topsides,
  navy boot stripe at waterline, teak toe-rail + rubrail + cockpit sole + hatch trim, white trunk cabin with dark port lights, mast + boom with a NAVY sail cover (sails furled — she's docked),
  stanchions/lifelines (thin cylinders), a stern rail, a cockpit with wheel. Below-waterline hull hidden under an opaque water plane. Total ≤ 40k triangles.
- Water: large disc, --navy-800-ish MeshStandardMaterial, radial alpha fade to the stage background at the edges (canvas alphaMap), FogExp2 matching the stage bg.
  Baked contact shadow (radial-gradient canvas texture on a plane just above the water) — NO shadow maps. Gentle bob/heel animation (disabled under reducedMotion).
- Lighting: HemisphereLight (sky #CFE3F5, ground #0B1F3A), key DirectionalLight warm (#FFF1DC) from upper front-left, cool fill from the right. ACESFilmic tone mapping, exposure ≈1.05.
- Renderer: antialias:true, alpha:false, clearColor = stage bg (#0B1F3A), powerPreference:'high-performance', pixelRatio = min(devicePixelRatio, width<768 ? 1.5 : 2). Resize via ResizeObserver.
- Render loop ONLY while stageEl is intersecting the viewport AND document.visibilityState==='visible'. Slow auto-orbit when idle; pauses for ~6s after user interaction. Occlusion raycast every 3rd frame.
- Input policy (do not hijack page scroll):
  · Desktop: drag to orbit always; wheel-zoom ONLY after the stage was clicked once (`.is-active` on stageEl; removed on mouseleave). Until then show the pill "Click to zoom".
  · Touch: canvas has `touch-action: pan-y`; one-finger drag does NOT orbit until the user taps the pill "Tap to explore" (`.is-active`); a "Done" state on the pill returns to scroll-through. Chips + markers always work regardless.
  · OrbitControls: enablePan=false, enableDamping, minDistance/maxDistance, maxPolarAngle just above the water, autoRotateSpeed low.
- Camera framings per zone: whole (3/4 bow view), hull (low, beam-on, close), deck (high, forward of cockpit), cabin (3/4 from the side, at the companionway), engine (stern quarter, low, at the cockpit sole / engine hatch). Markers anchored at those spots.
- Robustness: if WebGL is unavailable, remove the veil, add `.boat-stage--fallback` (styles.css shows a CSS-only stylized hull silhouette + message) and keep chips/panel fully working.

### map.js — `export function initMap({ mapEl, listEl, marinas, statusLabels, onBook })`
- `mapEl` already contains the inline `<svg class="chart">` (viewBox="0 0 1000 736") from index.html. map.js adds an HTML overlay layer `.chart-overlay` (absolute, inset 0) with one
  `<button class="pin" data-id aria-expanded aria-controls="marina-popup">` per marina positioned at `left:x/10%`, `top:y/7.36%`, plus one `.pin-pulse` ring for 'serving' pins.
- One popup `.chart-popup[id="marina-popup"][role="dialog"]` inside the overlay: `.popup-name`, `.popup-sub`, `.status-pill.is-serving|.is-soon` (text from statusLabels), `.popup-berths` ("≈700 berths" — tabular-nums), `a.popup-cta` (href="#book", sets the select via onBook(id)).
  Positioned near its pin, flipped/clamped so it never leaves the container; at widths < 600px the popup instead docks as a card BELOW the chart (full-width, readable without zoom).
- Desktop: hover/focus opens, mouseleave closes after a short delay; click toggles & pins it. Touch: tap toggles; tap outside or Esc closes. Arrow keys move between pins.
- `listEl` (the static `ul#marina-list`) gets `.is-active` on the matching item when a pin is open; clicking a list item opens its pin.
- No external assets, no map tiles, no libraries.

### main.js
- Imports content + modules. Rewrites every `a.sms` href → `sms:${phoneE164}?&body=${encodeURIComponent(smsBody)}` (iOS/Android-safe form) and sets any `[data-phone]` text to phoneDisplay, `[data-email]` to email.
- Renders `#price-amount` from CONFIG.startingPrice (and `[data-price-low]/[data-price-high]`). Fills `#year`. Fills `select#marina` from MARINAS (keeps "Other / not sure").
- Sticky CTA: IntersectionObserver on `#hero-cta-primary` → `#sticky-cta.hidden = isIntersecting` (only meaningful under 768px; CSS hides it above).
- Booking form: validates; if CONFIG.formEndpoint → POST JSON via fetch (best effort; NOTE fetch to an external host is blocked inside the Artifact preview, so this only works on the client's own hosting); otherwise builds an SMS body from the fields and opens `sms:` (and shows the composed message in `#booking-status` with a copy button as a fallback). Honeypot filled → silently no-op.
- Boat: `initBoat` immediately on module load (module scripts are deferred; the stage is above the fold). Map: `initMap` immediately.
- Reduced motion: `matchMedia('(prefers-reduced-motion: reduce)').matches` passed to initBoat.

## 6. Non-negotiables checklist (reviewers test against this)
1. Sections appear in the exact order 1–10 from the brief; all copy from final-copy.json verbatim.
2. "Text us" is the most prominent element above the fold on a 390×844 phone AND on desktop; sticky bottom bar on phones.
3. All three marinas: status from MARINAS config only; default 'soon'; the label "Currently serving" never appears unless status==='serving'.
4. No external resource outside the allowlist; no fetches at load; page weight excluding Three.js < 300 KB; Three loaded via importmap from jsdelivr, pinned.
5. No horizontal page scroll at 360px. 16px+ side gutters. No text clipped. Popups readable on phones.
6. Dark & light themes both legible (token pattern above). Body has explicit background.
7. Keyboard: every hotspot, chip, pin, and form control reachable and operable; visible focus rings; `aria-pressed`/`aria-expanded` kept in sync; tooltips on focus.
8. 3D: no console errors; first frame < ~1.5 s on broadband; loop stops when off-screen; page scroll never hijacked on touch; wheel-zoom gated behind a click.
9. Placeholders (phone, email, social) are obviously placeholders in content.js comments; price and marina statuses editable in ONE place.
10. Valid, well-formed HTML (every element closed, attributes quoted, one h1, landmarks: header/main/footer, labelled form controls).
