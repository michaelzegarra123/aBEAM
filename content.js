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
  smsBody: "Hi aBeam, it's [name]. [Boat name] at [marina], slip [slip]. We need: [what the boat needs]. By [date/time].",

  // Pricing. The page renders "Starting at $<startingPrice> per request".
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
    service: 'Trip management',
    eyebrow: 'Trip management',
    title: 'The whole trip, coordinated.',
    tooltip: 'Slips, fuel, provisions, vendors. We’ll keep the list; you keep the boat.',
    body: 'Berths at the next stop, fuel and pump-out timing, provisioning by the day, vendors booked before you leave and chased while you’re out. One point of contact, every request logged.',
    cta: { label: 'Ask about trip management', href: '#book' },
  },
  {
    zone: 'hull',
    label: 'Hull & exterior',
    service: 'Repairs & Maintenance',
    eyebrow: 'Yard & vendor coordination',
    title: 'Haul-out, bottom, rigging: booked and chased.',
    tooltip: 'The yard wants a date. We’ll get one, and hold them to it.',
    body: 'When the hull needs the yard, we get the quotes, book the slot and keep you posted until she’s back in the water. We coordinate; the yard does the work.',
    cta: { label: 'Ask about coordination', href: '#book' },
  },
  {
    zone: 'deck',
    label: 'Deck',
    service: 'Concierge',
    eyebrow: 'Provisioning & deliveries',
    title: 'Ice in, provisions handed aboard.',
    tooltip: 'Ice, drinks, groceries, the part you’re waiting on. Handed over at the dock.',
    body: 'Text a list and it arrives at the dock when you said: ice, drinks, groceries, parts, packages. We hand it aboard, and take the trash and empties off.',
    cta: { label: 'Request provisioning', href: '#book' },
  },
  {
    zone: 'cabin',
    label: 'Cabin',
    service: 'Concierge',
    eyebrow: 'Crew concierge',
    title: 'The errands ashore, so the crew stays aboard.',
    tooltip: 'Laundry out, a refund chased, a package collected. Nothing to leave the boat for.',
    body: 'Returns and refunds, laundry, pickups, the small jobs ashore that would otherwise take a crew member off the boat for an afternoon. Text it, we do it, you get a note when it’s done.',
    cta: { label: 'Request an errand', href: '#book' },
  },
  {
    zone: 'engine',
    label: 'Engine room',
    service: 'Repairs & Maintenance',
    eyebrow: 'Repairs & Maintenance',
    title: 'We flag it. We don’t fix it.',
    tooltip: 'Oil’s a shade dark. Noted, and the mechanic’s number is ready.',
    body: 'Anything we notice that looks off, you hear at once, and we stop there. If you want it fixed, we line up a trusted local marine mechanic and coordinate the visit.',
    cta: { label: 'Ask about maintenance', href: '#book' },
  },
];

// Small runtime strings used by main.js, map.js and boat.js.
export const COPY_UI = {
  activateTouch: 'Tap to explore',
  activateDesktop: 'Click to zoom',
  activateDone: 'Done',
  popupCtaSoon: 'Get on the list',
  popupCtaServing: 'Send a request',
  berthsSuffix: 'berths',
  formSuccess: 'Got it. We’ll text you back with what we can do and when. If anything needs a decision, we’ll ask before we act.',
  formComposing: 'Opening your messages with the details filled in. Just hit send.',
  formErrorRequired: 'We’ll need this to get started.',
  formCopy: 'Copy message',
  formCopied: 'Copied',
  formFallbackIntro: 'If your messages app didn’t open, copy this and text it to us:',
};
