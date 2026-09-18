# CLIENT BRIEF — aBeam (boat & yacht concierge, San Francisco)

NOTE: The client renamed the business mid-brief. The name is **aBeam** (one word, lowercase "a", capital "B").
Any mention of "BEAM." below is the old name — always use "aBeam". "Abeam" is a real nautical term
(alongside, at right angles to the keel — i.e. right beside the boat). Treat that as a quiet brand hook:
"alongside you / at your side" — never explain it heavy-handedly.

OFFICIAL SLOGAN (client-supplied, use VERBATIM, exact capitalization): "By your side, Beyond the shore"
It is the brand tagline (meta.tagline). Show it in the hero eyebrow or directly under the wordmark, and again in the footer.
Do not paraphrase it, do not add a period, do not invent a competing tagline.

Role for everyone on this job: marketing copywriter + creative director specializing in premium marine/yacht services.
Deliverable: a single-page marketing website (HTML/CSS/JS build) plus reusable copy blocks.

═══════════════════════════════════
BUSINESS NAME: aBeam
LOCATION: San Francisco, CA — serving South Beach Harbor, Pier 39 Marina, and the San Francisco Marina /
Marina Green (Marina Yacht Harbor). Positioned as a hyper-local SF service, not Bay-Area-wide (yet).
═══════════════════════════════════

CORE POSITIONING:
aBeam is a full-service, on-demand boat and yacht concierge — think of us as a "butler on the water."
Whatever a boat needs, we handle it, fast.

ONE-LINE PITCH (flagship service — "Ready & Go"):
Text us before you want to take your boat out, and it's fueled, provisioned, checked, and ready to go
by the time you get to the dock.

WHO THIS IS FOR:
Busy professional boat owners in San Francisco who day-sail or weekend-sail out of city marinas and don't
want to spend an hour prepping the boat every time they want to use it. (Secondary audience: yacht owners
and marina residents wanting broader detailing/repairs/management support.)

═══════════════════════════════════
SERVICES WE OFFER
═══════════════════════════════════

FLAGSHIP — "Ready & Go" (pre-departure prep, flat fee per outing):
- Systems check — engine oil level/color, battery reading, bilge check
- Fuel & water — top off fuel and fresh water tank
- Provisioning — ice, drinks, and any groceries ordered ahead, loaded aboard
- Propane & safety check — propane level, life jackets, flares, fire extinguisher
- Deck prep — fenders and lines set, quick wipe-down, trash off
- Conditions brief — a text with wind, tide, and weather for their route before they arrive

FULL-SERVICE MENU (broader aBeam offering):
- Detailing (interior & exterior)
- Repairs & maintenance
- Full boat/yacht management (upkeep, scheduling, storage, vendor coordination)
- Any other on-demand task a boat or yacht owner needs handled

HOW "READY & GO" WORKS (booking flow to show on site):
1. Text or fill out a short form the morning you want to go out
2. We confirm a ready-by time
3. Your boat is ready when you arrive — just show up and go

═══════════════════════════════════
WHAT SETS US APART
═══════════════════════════════════
- Speed — we respond and turn around jobs faster than typical boatyards or independent contractors
- All-in-one convenience — one call/text covers everything, no juggling multiple vendors
- White-glove, concierge-style service — attentive, discreet, personal
- We check and alert, we don't repair (for Ready & Go specifically) — if something's actually wrong
  (a fluid looks off, a safety item is expired, anything mechanical), we flag it immediately and can
  connect the owner with a trusted local marine mechanic, OR handle it directly via our full-service
  repair team if requested
- Fully insured for boat access, with a logged record of who was aboard and what was done every visit
- Local, vetted, small team — not a franchise, not random contractors

═══════════════════════════════════
TONE & DESIGN
═══════════════════════════════════
Confident and premium, but approachable. Clean, modern, trustworthy, nautical without being cheesy —
navy, white, and warm wood-tone accents, not cartoonish anchors-and-seagulls clip art. Mobile-first:
most Ready & Go bookings happen from someone's phone the morning of, often last-minute, so the
"text us" call-to-action needs to be the most prominent thing on the page, above the fold.

═══════════════════════════════════
SITE SECTIONS, IN ORDER
═══════════════════════════════════
1. Hero — aBeam logo/name, the one-line pitch, a clear "Text us" / "Book now" button, and a glimpse of
   the interactive 3D boat
2. Interactive 3D boat showcase
3. How it works — the 3-step Ready & Go flow
4. What's included — the 6-item Ready & Go service menu, one short line each
5. Full-service menu — brief callout of Detailing / Repairs / Management for owners who want more than prep
6. Interactive San Francisco marina map
7. Trust & safety — insurance / vetted-team / "inspect-not-repair-unless-asked" messaging
8. Pricing — flat-fee starting price ("starting at $[X] per outing," editable, anchor range $75–150
   depending on boat size) + "membership coming soon"
9. Contact/booking form — name, phone, marina, boat name/slip number, desired date/time
10. Footer — contact info, service area, social links placeholder

═══════════════════════════════════
FEATURE SPEC 1: INTERACTIVE 3D BOAT SHOWCASE
═══════════════════════════════════
Purpose: hero-level interactive centerpiece that visually maps aBeam's services onto a real boat.
- User can rotate/orbit and zoom around a 3D boat/yacht model
- Distinct zones are clickable hotspots: hull/exterior, deck, cabin/interior, engine room
- Clicking a hotspot opens a short panel naming the relevant service (hull → "Detailing",
  engine → "Repairs & Maintenance", whole boat → "Full Management", deck/cabin → "Ready & Go prep")
- Must feel premium, smooth, and fast-loading — reinforcing the "speed" differentiator, never laggy
- Hover tooltips written in a concierge/butler voice to reinforce the "butler on the water" concept
- Build with Three.js or an equivalent lightweight 3D library; no paid API dependencies

═══════════════════════════════════
FEATURE SPEC 2: INTERACTIVE SAN FRANCISCO MARINA MAP
═══════════════════════════════════
Purpose: visually answer "do you serve my marina?" at a glance.
- Show three marina locations as clickable/tappable pins or highlighted zones: South Beach Harbor,
  Pier 39 Marina, and the San Francisco Marina/Marina Green (Marina Yacht Harbor)
- Style as a clean, light nautical chart — subtle, semi-transparent map background (muted blues/tans),
  not a busy full-color Google Maps embed — should read as a custom graphic, not an embedded map widget
- On hover/tap, each pin shows a popup/card with: marina name, one-line status ("Currently serving" or
  "Coming soon"), and approximate berth count as a credibility detail (South Beach Harbor: ~700 berths)
- Lightweight and interactive, not a full navigation map — a simple SVG map with hoverable/tappable
  regions; avoid anything requiring a paid API key or that slows page load
- Must degrade gracefully on mobile — tap instead of hover, popup readable on small screens without zooming
- FACTUAL ACCURACY REQUIREMENT: do NOT show a marina as "served" unless vendor-access approval has been
  confirmed for it — use "Coming soon" for anything unconfirmed. (As of this build NO marina has confirmed
  vendor access, so all three ship as "Coming soon" behind a one-line config flag.)

═══════════════════════════════════
TARGET AUDIENCE
═══════════════════════════════════
Primary: Busy professional boat owners in San Francisco (day-sailors, weekend-sailors) who value
convenience and speed over doing it themselves.
Secondary: Yacht owners, marina residents, and charter companies wanting broader detailing/repairs/
management support.

═══════════════════════════════════
ADDENDUM — CLIENT DIRECTION AFTER THE FIRST PREVIEW (2026-09-18)
═══════════════════════════════════
These override anything above where they conflict.
- Look: "reliable, they know what they're doing, don't do too much." Restraint over flourish.
- No outings. aBeam does not sell trips or outings; nothing on the site says "book an outing" or "per outing".
- Request-driven: captains, crews and owners text a specific need; aBeam confirms what it can do, by when, and
  the fee; if it's outside what aBeam does, it says so and points to someone who does it well.
- One client at a time, quoted per request. No fixed packages.
- No detailing (yet).
- Mostly shore-side: aBeam does the land-side work (provisions, parts, returns and refunds, errands, vendor
  coordination) so crews can stay on the boat.
- Repairs & maintenance: aBeam flags what it notices and coordinates a trusted local vendor; it does not repair
  and has no repair team.
- Services on the page: Concierge · Trip management · Repairs & Maintenance (flag and coordinate).
- "Ready & Go" is not used as a name on the page.
