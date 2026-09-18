# aBeam — Copy Blocks

Approved copy for the aBeam single-page site and reusable marketing blocks. Strings below match `final-copy.json` and the live page (`index.html` and `content.js`) as of 18 September 2026, with the review fixes from that day applied; if a page string ever differs from this file, the page is the source of truth. Every section is in page order. Copy-paste from the headings you need.

**The model, in one line:** captains, crews and owners text aBeam what the boat needs; aBeam replies with what it can do, by when, and the fee, then does it on land so the crew can stay aboard, one request at a time. aBeam does not offer outings or charters, sells no packages, and does not repair: anything that looks off is flagged to the captain, and a trusted local marine mechanic is lined up only if asked.

**Business name:** aBeam (one word, lowercase a, capital B). Never "BEAM." or "Beam".

**Official slogan (verbatim, no period, exact capitalization):** By your side, Beyond the shore

**Placeholders, marked plainly throughout:** `{{price}}` is rendered by the page from the starting-price setting and appears only in the Pricing section; the typical range in the price note (`$75–150`) is rendered the same way from `priceRangeLow` and `priceRangeHigh`. Square-bracket slots such as `[boat name]`, `[marina]`, `[slip]`, `[time]`, `[date]`, `[name]`, `[phone]` and `[amount]` are filled in by hand before sending; a bracketed sentence is optional and is deleted if it does not apply. The site's phone number and email are placeholders in `content.js` and are set there, so no copy block hardcodes a number.


## Voice guide

- **Reliable, plain, restrained.** The client's words: looks reliable, they know what they're doing, don't do too much. Short sentences. Concrete nouns. Second person. Warm, never gushing. No exclamation marks anywhere. When a line could be shorter, it is; when a line is a flourish after the sentence that already did the work, it goes.
- **Request-driven, one client at a time.** Every request is handled individually and quoted up front: what we can do, by when, and the fee. There are no fixed packages, menus or standing schedules; repeat requests are welcome, a schedule is a package. If a request is outside what aBeam does, we say so and point to someone who does it well. What we handle is described by the request (provisions, parts, returns, errands, a berth at the next stop), never by a product name.
- **Shore-side, so the crew stays aboard.** The work is done on land, from the dock, and mostly without going aboard; "who came aboard, if anyone did" is the honest phrasing. "Trip management" on the page means the logistics around the captain's own passage (berths at the next stop, fuel and pump-out timing, vendors); aBeam never sells or runs a trip, and nothing may imply an outing.
- **Three audiences, one reader.** Write to captains, crews and owners together. Say "the boat", not "your boat", unless the line is plainly addressed to an owner; "your slip", "your route" and "your marina" are fine, since captain and crew have those too. Flag things "to the captain". No office-worker persona, no leaving-the-office lines.
- **Words we don't use.** Outing, charter, cruise, "Ready & Go", package, menu, "what's included", "on a schedule" as an offer, "most common request" or any other count we cannot show. Clients do not "book" aBeam; they send a request. (aBeam booking a yard slot or a diver on a client's behalf is ordinary usage and stays.)
- **Real nautical words, no cheese.** Slip, berth, lines, fenders, ebb, flood, westerlies, brightwork, bilge, chandlery, pump-out, the Slot, the Gate are all fine because they are specific. Never: ship-shape, anchors aweigh, smooth sailing, all hands on deck, knot puns, ahoy, captain-speak, wildlife jokes, travel-writing colour about the waterfront.
- **Only claims the page can support.** Quoted per request, agreed up front; same-day requests welcome; fully insured for boat access; every request logged, with a note of what was done and who came aboard; small, local, vetted team; we flag, we don't fix; a trusted local marine mechanic, rigger or canvas shop lined up and coordinated when asked. Never: response times in minutes or hours, star ratings, customer or request counts, 24/7, licensed or certified, guarantees, awards, years in business, invented team names. Never say in prose that we are "currently serving" a marina; that label lives only in the chart's data-driven status pills. Use "launching at", "built for boats at", "for captains, crews and owners at".
- **Butler voice for the 3D boat tooltips and panels, nowhere else.** Attentive, discreet, first-person plural, quietly formal, a touch of dry warmth. "Oil's a shade dark. Noted, and the mechanic's number is ready." Never sir/madam, never servile, never Jeeves cosplay. The hero, the steps and the trust section stay in the plain voice; "we'll see to it" is butler register and does not belong in the headline.
- **Banned filler:** seamless, elevate, unlock, hassle-free, effortless, game-changer, "we've got you covered", "experience" as a noun, "premium" or "luxury" as self-description, best-in-class. **The brand hook** (abeam = alongside, right beside the boat) is used once site-wide, in the footer blurb ("working alongside"), and is never explained.

## Meta

- **SEO title (≤60 chars):** aBeam — On-Demand Boat Concierge, San Francisco
- **SEO description (≤155 chars):** Shore-side concierge and trip management for captains, crews and owners at San Francisco’s city marinas. Text us what the boat needs.
- **Tagline (official slogan, verbatim):** By your side, Beyond the shore

Build note: the tagline renders as `.tagline` at the top of the hero and again in the footer next to the wordmark. The same description string is used for `og:description`.


## Navigation

- **How it works:** `#how`
- **Services:** `#services`
- **Marinas:** `#marinas`
- **Pricing:** `#pricing`
- **Request:** `#book`
- **Header button:** Text us

## 1. Hero

- **Header note (renders beside the wordmark; the hero itself opens with the tagline):** Boat concierge · San Francisco
- **Headline:** Text us what the boat needs. We’ll handle it.  (the second sentence is set in italic; the build wraps it in `<em>`, the string itself carries no markup)
- **Subhead:** aBeam is a shore-side concierge for captains, crews and owners at San Francisco’s city marinas. Text us what the boat needs, from provisions and parts to a return chased or a slip at the next stop, and we do it on land so the crew can stay aboard.
- **Primary button:** Text us
- **Secondary button:** Send a request
- **Micro line under the buttons:** Same-day requests welcome. Launching at South Beach, Pier 39 and Marina Green.

## 2. Interactive 3D boat showcase

- **Eyebrow:** Around the boat
- **Headline:** One text covers the whole boat.
- **Intro:** Orbit the boat and open a zone. Deck, cabin, engine room, hull: each is something you can ask us for, most of it handled from the dock.
- **Interaction hint:** Drag to orbit · Tap a marker or a chip
- **Activation pill, touch:** Tap to explore
- **Activation pill, desktop:** Click to zoom
- **Activation pill, done state:** Done

Every panel button links to the request form (`#book`).

### Hotspot: Whole boat (whole) → Trip management

- **Chip label:** Whole boat
- **Panel eyebrow:** Trip management
- **Panel title:** The whole trip, coordinated.
- **Hover tooltip (butler voice):** Slips, fuel, provisions, vendors. We’ll keep the list; you keep the boat.
- **Panel body:** Berths at the next stop, fuel and pump-out timing, provisioning by the day, vendors booked before you leave and chased while you’re out. One point of contact, every request logged.
- **Panel button:** Ask about trip management

### Hotspot: Hull & exterior (hull) → Yard & vendor coordination

- **Chip label:** Hull & exterior
- **Panel eyebrow:** Yard & vendor coordination
- **Panel title:** Haul-out, bottom, rigging: booked and chased.
- **Hover tooltip (butler voice):** The yard wants a date. We’ll get one, and hold them to it.
- **Panel body:** When the hull needs the yard, we get the quotes, book the slot and keep you posted until she’s back in the water. We coordinate; the yard does the work.
- **Panel button:** Ask about coordination

### Hotspot: Deck (deck) → Provisioning & deliveries

- **Chip label:** Deck
- **Panel eyebrow:** Provisioning & deliveries
- **Panel title:** Ice in, provisions handed aboard.
- **Hover tooltip (butler voice):** Ice, drinks, groceries, the part you’re waiting on. Handed over at the dock.
- **Panel body:** Text a list and it arrives at the dock when you said: ice, drinks, groceries, parts, packages. We hand it aboard, and take the trash and empties off.
- **Panel button:** Request provisioning

### Hotspot: Cabin (cabin) → Crew concierge

- **Chip label:** Cabin
- **Panel eyebrow:** Crew concierge
- **Panel title:** The errands ashore, so the crew stays aboard.
- **Hover tooltip (butler voice):** Laundry out, a refund chased, a package collected. Nothing to leave the boat for.
- **Panel body:** Returns and refunds, laundry, pickups, the small jobs ashore that would otherwise take a crew member off the boat for an afternoon. Text it, we do it, you get a note when it’s done.
- **Panel button:** Request an errand

### Hotspot: Engine room (engine) → Repairs & Maintenance

- **Chip label:** Engine room
- **Panel eyebrow:** Repairs & Maintenance
- **Panel title:** We flag it. We don’t fix it.
- **Hover tooltip (butler voice):** Oil’s a shade dark. Noted, and the mechanic’s number is ready.
- **Panel body:** Anything we notice that looks off, you hear at once, and we stop there. If you want it fixed, we line up a trusted local marine mechanic and coordinate the visit.
- **Panel button:** Ask about maintenance

## 3. How it works

- **Eyebrow:** How it works
- **Headline:** Three steps. One text starts it.
- **Intro:** Built for the specific ask: fuel and ice by 1pm, a diver next week, a part picked up before the weekend. Text it and we take it from there.

### Step 1: Text us what you need

Boat name, marina, slip, what needs doing and by when. A text is fastest; the short form below reaches the same people.


### Step 2: We confirm what we can do, and when

One reply: what we’ll handle, a ready-by time, and the fee. If it’s outside what we do, we say so and point you to someone who does it well.


### Step 3: It’s handled

You get a text when it’s done, with a note of what was done and who came aboard, if anyone did.


## 4. What we handle

- **Eyebrow:** What we handle
- **Headline:** The land-side list, handled.
- **Intro:** The requests we’re built around. Ask for any of it, and it’s done the same way every time and logged the same way.

- **Provisioning:** Ice, drinks and groceries bought and brought to the dock at the time you said.
- **Parts & pickups:** Chandlery runs, parts collected, packages received and met at the gate.
- **Returns & refunds:** Wrong part, wrong size, changed plans: we take it back and chase the refund.
- **Fuel, water & propane:** Jerry cans filled and returned, fresh water topped off, propane exchanged.
- **Errands ashore:** Trash off, laundry out and back, the small jobs that would take a crew member off the boat.
- **Conditions brief:** Wind, tide and weather for your route, texted before you leave.

- **Footnote:** Anything we notice aboard, we flag to the captain. We don’t repair. If you want it fixed, we line up a trusted local marine mechanic and coordinate the visit.

### Sample conditions brief (text bubble)

- **Sender:** aBeam
- **Message:** For your 1pm: fog lifting off Alcatraz, sun by noon. Westerly 12 kts now, 20+ in the Slot by 3. Max ebb 2:40 at the Gate, so expect chop past Crissy. Provisions at the dock by 12:30.
- **Caption:** The brief that lands before you’ve left for the dock.

## 5. Services

- **Eyebrow:** Services
- **Headline:** Ask for what the boat needs.
- **Intro:** Three ways we work. All of them start with a text, and most of them are handled from the dock.

### Concierge

Provisions, parts, returns and refunds, pickups, deliveries, errands. The land-side list, handled so the crew stays with the boat.

- **Link:** Send a request

### Trip management

Berths at the next stop, fuel and pump-out timing, provisioning by the day, vendors booked before you leave and chased while you’re away. One point of contact, every request logged.

- **Link:** Ask about trip management

### Repairs & Maintenance

We flag, we don’t fix. Anything that looks off goes to the captain at once, and if you want it handled we line up a trusted local marine mechanic, rigger or canvas shop and see the job through.

- **Link:** Ask about maintenance

- **Anything-else line:** A diver arranged, a part collected, a refund chased, a surveyor met. Text us and ask. If it’s not something we do, we’ll tell you who does.

## 6. San Francisco marina chart

- **Eyebrow:** Where we work
- **Headline:** Built for boats at three city marinas.
- **Intro:** South Beach Harbor beside Oracle Park, Pier 39 at Fisherman’s Wharf, and the San Francisco Marina at Marina Green. Tap a pin for status and berths.
- **Legend, serving (data-driven status label):** Currently serving
- **Legend, coming soon (data-driven status label):** Coming soon
- **Popup button when coming soon:** Ask about timing
- **Popup button when serving:** Send a request
- **Footnote:** A marina shows as serving only once we’ve confirmed dock access there. Not listed, or still coming soon? Text us and we’ll tell you where things stand.
- **Form option for other marinas:** Other / not sure yet

Status rule: a marina may only show "Currently serving" once vendor-access approval is confirmed with that harbormaster. All three ship as "Coming soon" until then. Change status in `content.js`, never in copy.


## 7. Trust & safety

- **Eyebrow:** Trust & safety
- **Headline:** Who was aboard, and what was done.
- **Intro:** Handing your keys to someone you haven’t met takes trust. Here is what we can show for it.

### Fully insured for boat access

Marinas require it; ask us for the certificate any time. We work within your marina’s vendor rules, not around them.


### Every request logged

What was asked, what was done, when, and who came aboard if anyone did. Written down every time, and in your text.


### Small, local, vetted team

Not a franchise, not a rotating roster of contractors. A few people we’ve vetted ourselves, who know these docks and know each other. You’ll know their names.


### We flag. We don’t fix.

Anything we notice aboard goes to the captain at once, and we stop there. If you want it handled, we line up a trusted local marine mechanic and coordinate the visit.


## 8. Pricing

- **Eyebrow:** Pricing
- **Headline:** Quoted per request, agreed up front.
- **Card kicker:** Concierge requests
- **Price line:** Starting at ${{price}} per request  (`{{price}}` is the editable starting price, set in `content.js`)
- **Price note:** Every request is quoted before we start, typically $75–150 depending on scope. Purchases, fuel and provisions are added at cost, receipts included. No hourly clock.
- **Includes line:** Quote by text before we start. Receipts with the note when it’s done.
- **Card button:** Text us

### Membership, coming soon

For boats that need us often. We’re working out the terms now. Leave your number and you’ll hear when it’s ready, and not before.

- **Eyebrow above the title:** Coming soon
- **Button:** Join the waitlist

## 9. Request form

- **Eyebrow:** Send a request
- **Headline:** Tell us what the boat needs.
- **Intro:** Texting is fastest. If you’d rather use the form, it reaches the same people. Either way, you get a reply with what we can do and when.

### Field labels

- **Name:** Your name
- **Phone:** Mobile number
- **Marina:** Marina
- **Boat:** Boat name & slip
- **Date and time:** Needed by
- **Notes:** What does the boat need?

### Placeholders

- **Name:** First and last name
- **Phone:** Best number to text back
- **Boat:** Halcyon · slip C-14
- **Notes:** Ice and groceries to the dock by 1pm Saturday. Return the wrong impeller to the chandlery and chase the refund.
- **Marina select, first option:** Choose a marina
- **Marina select, last option:** Other / not sure yet

### Buttons and messages

- **Submit button:** Send request
- **Alternative line under the intro:** Or skip the form and just text us.
- **Success message:** Got it. We’ll text you back with what we can do, by when, and the fee. If anything needs a decision, we’ll ask before we act.
- **Shown while opening the SMS app:** Opening your messages with the details filled in. Just hit send.
- **Required-field error:** We’ll need this to get started.
- **Privacy line:** Your details go to us and no one else. We text about your request, not marketing.

## 10. Footer

- **Blurb:** aBeam is a small San Francisco team working alongside captains, crews and owners at the city marinas: the land-side list handled, one text at a time, so the crew can stay with the boat.
- **Area label:** Service area
- **Area:** South Beach Harbor · Pier 39 Marina · San Francisco Marina (Marina Green)
- **Contact label:** Text or call  (phone and email come from `content.js`: `[phone]`, `[email]`)
- **Social label:** Follow
- **Legal:** © [year] aBeam · San Francisco, California · All rights reserved.
- **Tagline (repeated next to the wordmark):** By your side, Beyond the shore

## Sticky phone bar

- **Label:** Text us
- **Sublabel:** Same-day requests · quoted up front

## Prefilled text message (what the client sends us)

Hi aBeam, it's [name]. [Boat name] at [marina], slip [slip]. We need: [what the boat needs]. By [date/time].

Slots in square brackets are for the client to fill in. This string goes into `CONFIG.smsBody` in `content.js`.


## Extras


### Alternative hero headlines

Each keeps the request model in the first line. Italicise the second sentence where the page's italic treatment is wanted.

- The land-side list, handled one text at a time.
- Text us the errand. The crew stays aboard.
- What the boat needs ashore, quoted up front and done.


### Elevator pitch

aBeam is a shore-side concierge for captains, crews and owners at San Francisco’s city marinas. Text us what the boat needs: provisions to the dock, a part collected, a return chased, jerry cans filled, laundry out and back, a berth at the next stop. We reply with what we can do, by when, and the fee, then do it on land so the crew can stay with the boat. Each request is quoted on its own; no packages, no hourly clock. Anything we notice aboard, we flag to the captain and stop there. If it’s outside what we do, we say so and point you to someone who does it well.


### One-liner

Text aBeam what the boat needs ashore. You get a reply with what we can do, by when, and the fee.


### Google Business Profile description (≤750 characters)

aBeam is a shore-side concierge for captains, crews and owners at San Francisco’s city marinas: South Beach Harbor, Pier 39 Marina and the San Francisco Marina at Marina Green. Text us what the boat needs and we reply with what we can do, by when, and the fee. No packages, no hourly clock. Provisions to the dock, parts and packages collected, returns and refunds chased, jerry cans filled, propane exchanged, laundry and errands ashore, a conditions brief before you leave. For boats on the move, berths at the next stop and vendors booked and chased. We flag, we don’t fix; if you want it handled, we line up a trusted local marine mechanic. Fully insured for boat access, every request logged. Small, local, vetted team.

Note: the external-facing blocks above deliberately do not contain `{{price}}`. If you want to quote the starting price on Google, Instagram or a flyer, type the dollar figure in by hand, and keep it "per request", never per outing.


### Instagram bio (≤150 characters)

SF shore-side boat concierge. Captains, crews and owners text us what the boat needs; we do it ashore. Provisions · Parts · Returns · Errands


### Marina flyer

- **Headline:** The land-side list, handled.
- **Body:** aBeam is a small San Francisco team for captains, crews and owners at the city marinas. Text us what the boat needs and we reply with what we can do, by when, and the fee. Provisions to the dock, parts and packages collected, returns and refunds chased, jerry cans filled, propane exchanged, laundry and errands ashore, a conditions brief before you leave. Berths at the next stop and vendors coordinated for boats on the move. We flag, we don’t fix. Each request quoted on its own; no packages, no hourly clock. Fully insured for boat access, every request logged.
- **Call to action:** Text aBeam what the boat needs.  (add `[phone]` beneath it once the number is live)

### SMS templates (we send these)

- **Auto-reply:** aBeam here. Thanks, we have your message and will text back with what we can do, by when, and the fee. If you haven’t yet, send the boat name, marina, slip, what you need and by when.
- **Confirm the request (what, by when, fee):** aBeam here. [Boat name] at [marina], slip [slip]. We can handle [what we’ll do], at the dock by [time] on [date]. Fee: $[amount], plus [purchases and provisions] with receipts. Reply yes to confirm. Anything to add, send it now.
- **Done:** aBeam here. [Boat name], slip [slip]: done. [What was done]. [Handed aboard at [time] / Left with [name] at the gate / No one came aboard.] Receipts and the note are in your log. Anything else, just text.
- **Flag an issue:** aBeam here. While aboard [boat name] we noticed [issue]. Flagged to you, not touched; we don’t fix. If you want it handled, we can line up a trusted local marine mechanic and coordinate the visit. Just reply.
- **Conditions brief:** Brief for your [time]: [fog/sun] now, [clearing by noon]. Westerly [xx] kts, building to [xx] in the Slot by [time]. [Ebb/flood] at the Gate, max [time], so expect [chop/smooth water] off [Crissy/Alcatraz]. [Provisions at the dock by [time].]

Usage note (not a template): when a request is outside what we do, the reply keeps the same shape minus the fee: say plainly that it is not something we do, name who does it well, and give a number. One text, no apology paragraph.

### Confirmation email

- **Subject:** aBeam: [request] for [boat name], by [time] on [date]

```
Hi [name],

Confirming your request.

Boat: [boat name], slip [slip], [marina]
Request: [what we’ll handle]
By: [time] on [date]
Fee: $[amount], quoted for this request. [Purchases, fuel and provisions are itemized on top, receipts included.]

If we come aboard and notice anything that looks off, you’ll hear from us at once; we flag, we don’t fix. If you want it handled, we line up a trusted local marine mechanic and coordinate the visit.

When it’s done you’ll get a text with a note of what was done and who came aboard, if anyone did.

Change of plans? Reply here or text us.

aBeam
```


### FAQ

**What can I ask for?**

The land-side list: provisions bought and brought to the dock, parts and packages collected, returns and refunds chased, jerry cans filled and propane exchanged, laundry and errands ashore, a conditions brief before you leave. For boats on the move, berths at the next stop and vendors booked and chased. Same-day requests are welcome. If it’s outside what we do, we say so and point you to someone who does it well.

**What does it cost?**

Each request is quoted before we start; no hourly clock. Typically $75–150 depending on scope, with purchases, fuel and provisions itemized on top, receipts included. You’ll know the fee before we do anything. Membership for boats that need us often is coming; join the waitlist to hear first.

**Do you do repairs?**

No. We flag, we don’t fix. Anything we notice aboard goes to the captain at once, and we stop there. If you want it handled, we line up a trusted local marine mechanic, rigger or canvas shop and see the job through.

**Do you have access to my marina yet?**

We’re launching at South Beach Harbor, Pier 39 Marina and the San Francisco Marina at Marina Green. A marina shows as serving on our chart only once dock access there is confirmed, never before. Text us the marina and slip and we’ll tell you where things stand.
