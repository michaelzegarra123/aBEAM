// aBeam — content.js
// THE ONE FILE TO EDIT. Everything below is read by main.js, boat.js and map.js.
// Nothing here needs a build step: save the file, reload the page.

export const CONFIG = {
  brand: 'aBeam',
  tagline: 'By your side, Beyond the shore',

  // PLACEHOLDER — replace with the real business mobile number (both lines).
  // phoneE164 is the international form the "Text us" links dial: +1 then the 10 digits.
  phoneDisplay: '(415) 555-0123',
  phoneE164: '+14155550123',

  // PLACEHOLDER — replace with the real inbox.
  email: 'hello@abeam.example',

  // The message that is pre-filled when someone taps "Text us".
  smsBody: "Hi aBeam, it's [name]. Ready & Go for [boat name] at [marina], slip [slip]. Off the dock at [date/time]. Please load: [ice, drinks, groceries].",

  // Pricing. The page renders "Starting at $<startingPrice> per outing".
  // The brief's anchor range is $75–150 depending on boat length.
  startingPrice: 75,
  priceRangeLow: 75,
  priceRangeHigh: 150,

  // Optional. Paste a Formspree / Basin / Getform-style endpoint URL to receive the
  // booking form by email. Leave empty and the form composes a text message instead.
  formEndpoint: '',

  serviceArea: 'South Beach Harbor · Pier 39 Marina · San Francisco Marina (Marina Green)',

  // PLACEHOLDERS — point these at real profiles when they exist.
  social: [
    { label: 'Instagram', href: '#' },
    { label: 'LinkedIn', href: '#' },
    { label: 'Nextdoor', href: '#' },
  ],
};

export const STATUS_LABELS = {
  serving: 'Currently serving',
  soon: 'Coming soon',
};

// RULE (from the client): a marina may ONLY be marked status: 'serving' once
// vendor / dock-access approval has been confirmed for it. Until then it is 'soon'.
// Flipping one word here updates the pin colour, the popup and the list.
// x / y are the pin positions in the chart's own coordinate space (0–1000 × 0–736).
export const MARINAS = [
  {
    id: 'sf-marina',
    name: 'San Francisco Marina',
    short: 'SF Marina',
    sub: 'Marina Green · East & West Harbors',
    status: 'soon',
    berths: '727',
    x: 325.0, y: 323.8, lat: 37.8072, lon: -122.4390,
  },
  {
    id: 'pier39',
    name: 'Pier 39 Marina',
    short: 'Pier 39',
    sub: 'The Embarcadero at Beach St · Fisherman’s Wharf',
    status: 'soon',
    berths: '300',
    x: 569.2, y: 301.8, lat: 37.8093, lon: -122.4097,
  },
  {
    id: 'south-beach',
    name: 'South Beach Harbor',
    short: 'South Beach',
    sub: 'Pier 40 · The Embarcadero, beside Oracle Park',
    status: 'soon',
    berths: '~700',
    x: 756.7, y: 601.4, lat: 37.7808, lon: -122.3872,
  },
];

// The five zones of the 3D boat. Order = order of the chips under the boat.
// tooltip = the hover text on the marker (concierge voice). body = the panel text.
export const HOTSPOTS = [
  {
    zone: 'whole',
    label: 'Whole boat',
    service: 'Full Management',
    eyebrow: 'Full Management',
    title: 'The whole boat, off your calendar.',
    tooltip: 'The calendar, the vendors, the upkeep. We’ll keep it all in hand.',
    body: 'Haul-out dates, bottom paint, the canvas shop, the rigger, the slip paperwork. We keep the calendar, coordinate the vendors and log every visit. The boat stays ready; you stay informed, without chasing anyone.',
    cta: { label: 'Ask about management', href: '#book' },
  },
  {
    zone: 'hull',
    label: 'Hull & exterior',
    service: 'Detailing',
    eyebrow: 'Detailing',
    title: 'Washed, polished, and the brightwork seen to.',
    tooltip: 'Salt haze on the gelcoat again. Leave it with us.',
    body: 'A season of westerlies leaves salt in every seam and a grey film on the gelcoat. We wash and wax the topsides, bring the brightwork back and detail the interior down to the lockers. On its own, or with your next Ready & Go.',
    cta: { label: 'Book detailing', href: '#book' },
  },
  {
    zone: 'deck',
    label: 'Deck',
    service: 'Ready & Go prep',
    eyebrow: 'Ready & Go prep',
    title: 'Lines flaked, fenders set, deck wiped.',
    tooltip: 'Deck wiped, lines flaked, trash ashore. Nothing for you to step over.',
    body: 'Before every outing we set fenders and dock lines for your slip, wipe the deck and cockpit, take the trash off and run through the safety gear: life jackets, flares, extinguisher, propane. Then we text you it’s ready and step off the dock.',
    cta: { label: 'Book Ready & Go', href: '#book' },
  },
  {
    zone: 'cabin',
    label: 'Cabin',
    service: 'Ready & Go prep',
    eyebrow: 'Ready & Go prep',
    title: 'Ice in, water topped, galley stocked.',
    tooltip: 'Ice in the box, drinks cold, groceries stowed. Nothing to carry down.',
    body: 'Text us a list the morning of and it’s aboard before you are: ice in the cooler, drinks cold, groceries stowed, fresh water topped off, cabin aired and wiped down.',
    cta: { label: 'Book Ready & Go', href: '#book' },
  },
  {
    zone: 'engine',
    label: 'Engine room',
    service: 'Repairs & Maintenance',
    eyebrow: 'Repairs & Maintenance',
    title: 'We look first. We fix if asked.',
    tooltip: 'Oil’s a shade dark. Noted. Say the word and we’ll see to it.',
    body: 'During Ready & Go we check oil level and color, battery reading and bilge. If anything looks off we tell you at once and stop there. Repairs happen only when you ask: our own repair team, or a trusted local marine mechanic we know.',
    cta: { label: 'Ask about repairs', href: '#services' },
  },
];

// Small runtime strings used by main.js, map.js and boat.js.
export const COPY_UI = {
  activateTouch: 'Tap to explore',
  activateDesktop: 'Click to zoom',
  activateDone: 'Done',
  popupCtaSoon: 'Get on the list',
  popupCtaServing: 'Book Ready & Go',
  berthsSuffix: 'berths',
  formSuccess: 'Got it. We’ll text you back with a ready-by time. If anything needs a decision, we’ll ask before we act. Finish your coffee. The dock is handled.',
  formComposing: 'Opening your messages with the details filled in. Just hit send.',
  formErrorRequired: 'We’ll need this to get started.',
  formCopy: 'Copy message',
  formCopied: 'Copied',
  formFallbackIntro: 'If your messages app didn’t open, copy this and text it to us:',
};
