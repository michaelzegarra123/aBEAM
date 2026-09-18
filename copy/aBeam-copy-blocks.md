# aBeam — Copy Blocks

Approved copy for the aBeam single-page site and reusable marketing blocks. Strings below are final and match `final-copy.json` exactly; the site build uses them verbatim. Every section is in page order. Copy-paste from the headings you need.

**Business name:** aBeam (one word, lowercase a, capital B). Never "BEAM." or "Beam".

**Official slogan (verbatim, no period, exact capitalization):** By your side, Beyond the shore

**Placeholders, marked plainly throughout:** `{{price}}` is rendered by the page from the starting-price setting and appears only in the Pricing section. Square-bracket slots such as `[boat name]`, `[marina]`, `[slip]`, `[time]`, `[date]`, `[name]`, `[phone]` and `[amount]` are filled in by hand before sending. The site's phone number and email are placeholders in `content.js` and are set there, so no copy block hardcodes a number.


## Voice guide

- **Confident, premium, approachable.** Short sentences. Concrete nouns. Second person. Warm, never gushing. No exclamation marks anywhere.
- **Real nautical words, no cheese.** Slip, berth, lines, fenders, ebb, flood, westerlies, brightwork, bilge, the Slot, the Gate are all fine because they are specific. Never: ship-shape, anchors aweigh, smooth sailing, all hands on deck, knot puns, ahoy, captain-speak.
- **Only claims the brief supports.** Fast; same-morning; flat fee per outing; fully insured for boat access; a logged record of who was aboard and what was done; small, local, vetted team; we check and alert, we don't repair during Ready & Go; we can connect you with a trusted local marine mechanic or handle it through our own repair team if asked. Never: response times in minutes or hours, star ratings, customer counts, 24/7, licensed or certified, guarantees, awards, years in business, invented team names. Never say in prose that we are "currently serving" a marina; that label lives only in the chart's data-driven status pills. Use "launching at", "built for boats at", "for owners at".
- **Butler voice for the 3D boat tooltips and panels.** Attentive, discreet, first-person plural, quietly formal, a touch of dry warmth. "Oil's a shade dark. Noted. Say the word and we'll see to it." Never sir/madam, never servile, never Jeeves cosplay.
- **Banned filler:** seamless, elevate, unlock, hassle-free, effortless, game-changer, "we've got you covered", "experience" as a noun, "premium" or "luxury" as self-description, best-in-class. **The brand hook** (abeam = alongside, right beside the boat) is used once site-wide, in the footer blurb, and is never explained.

## Meta

- **SEO title (≤60 chars):** aBeam — On-Demand Boat Concierge, San Francisco
- **SEO description (≤155 chars):** Text aBeam the morning you want to go out. Your boat is fueled, provisioned, checked and ready at your San Francisco slip. Flat fee per outing.
- **Tagline (official slogan, verbatim):** By your side, Beyond the shore

Build note: the tagline renders as `.tagline` under the wordmark in the hero and again in the footer next to the wordmark, per the build contract.


## Navigation

- **Three steps:** `#how`
- **Services:** `#services`
- **Marinas:** `#marinas`
- **Pricing:** `#pricing`
- **Book:** `#book`
- **Header button:** Text us

## 1. Hero

- **Eyebrow:** Boat concierge · San Francisco
- **Headline:** Text us this morning. Sail this afternoon.  (the word "afternoon" is set in italic; the build wraps it in `<em>`, the string itself carries no markup)
- **Subhead:** One text, the morning of. When you reach the dock, your boat is fueled, provisioned, checked and ready, with a conditions brief already on your phone.
- **Primary button:** Text us
- **Secondary button:** Book an outing
- **Micro line under the buttons:** Same-morning texts welcome. Launching at South Beach, Pier 39 and Marina Green.

## 2. Interactive 3D boat showcase

- **Eyebrow:** Around the boat
- **Headline:** One text covers the whole boat.
- **Intro:** Orbit the boat and open a zone. Hull, deck, cabin, engine room: each has a service behind it, and the same small local team handles all of them.
- **Interaction hint:** Drag to orbit · Tap a marker or a chip
- **Activation pill, touch:** Tap to explore
- **Activation pill, desktop:** Click to zoom
- **Activation pill, done state:** Done

### Hotspot: Whole boat (whole) → Full Management

- **Chip label:** Whole boat
- **Panel eyebrow:** Full Management
- **Panel title:** The whole boat, off your calendar.
- **Hover tooltip (butler voice):** The calendar, the vendors, the upkeep. We'll keep it all in hand.
- **Panel body:** Haul-out dates, bottom paint, the canvas shop, the rigger, the slip paperwork. We keep the calendar, coordinate the vendors and log every visit. The boat stays ready; you stay informed, without chasing anyone.
- **Panel button:** Ask about management

### Hotspot: Hull & exterior (hull) → Detailing

- **Chip label:** Hull & exterior
- **Panel eyebrow:** Detailing
- **Panel title:** Washed, polished, and the brightwork seen to.
- **Hover tooltip (butler voice):** Salt haze on the gelcoat again. Leave it with us.
- **Panel body:** A season of westerlies leaves salt in every seam and a grey film on the gelcoat. We wash and wax the topsides, bring the brightwork back and detail the interior down to the lockers. On its own, or with your next Ready & Go.
- **Panel button:** Book detailing

### Hotspot: Deck (deck) → Ready & Go prep

- **Chip label:** Deck
- **Panel eyebrow:** Ready & Go prep
- **Panel title:** Lines flaked, fenders set, deck wiped.
- **Hover tooltip (butler voice):** Deck wiped, lines flaked, trash ashore. Nothing for you to step over.
- **Panel body:** Before every outing we set fenders and dock lines for your slip, wipe the deck and cockpit, take the trash off and run through the safety gear: life jackets, flares, extinguisher, propane. Then we text you it's ready and step off the dock.
- **Panel button:** Book Ready & Go

### Hotspot: Cabin (cabin) → Ready & Go prep

- **Chip label:** Cabin
- **Panel eyebrow:** Ready & Go prep
- **Panel title:** Ice in, water topped, galley stocked.
- **Hover tooltip (butler voice):** Ice in the box, drinks cold, groceries stowed. Nothing to carry down.
- **Panel body:** Text us a list the morning of and it's aboard before you are: ice in the cooler, drinks cold, groceries stowed, fresh water topped off, cabin aired and wiped down.
- **Panel button:** Book Ready & Go

### Hotspot: Engine room (engine) → Repairs & Maintenance

- **Chip label:** Engine room
- **Panel eyebrow:** Repairs & Maintenance
- **Panel title:** We look first. We fix if asked.
- **Hover tooltip (butler voice):** Oil's a shade dark. Noted. Say the word and we'll see to it.
- **Panel body:** During Ready & Go we check oil level and color, battery reading and bilge. If anything looks off we tell you at once and stop there. Repairs happen only when you ask: our own repair team, or a trusted local marine mechanic we know.
- **Panel button:** Ask about repairs

## 3. How it works

- **Eyebrow:** How Ready & Go works
- **Headline:** Three steps. One text starts it.
- **Intro:** Built for the morning-of decision: the fog forecast looks kind, you have the afternoon, and you'd rather not spend an hour prepping. Decide late, still go.

### Step 1: Text us the morning of

Boat name, marina, slip, when you'd like to be off the dock, anything you want aboard. A text is fastest; the short form below works too.


### Step 2: We confirm a ready-by time

One reply, with the time your boat will be ready. Then we go to work, and you go back to yours.


### Step 3: Show up and go

Your conditions brief lands before you do. Fuel and water topped, ice in, engine checked, fenders set. Lines are ready to slip. Step aboard.


## 4. What's included

- **Eyebrow:** What's included
- **Headline:** The hour at the dock, itemized.
- **Intro:** Every Ready & Go covers the same six jobs, in the same order, logged the same way. One flat fee, no menu to build.

- **Systems check:** Oil level and color, battery reading, bilge. Noted, not guessed.
- **Fuel & water:** Fuel topped off, fresh water filled. Tanks full when you step aboard.
- **Provisioning:** Ice, drinks and whatever groceries you texted, loaded and stowed.
- **Propane & safety:** Propane level, life jackets, flares, extinguisher: checked, expiry dates read.
- **Deck prep:** Fenders and lines set for your slip, quick wipe-down, trash off.
- **Conditions brief:** Wind, tide and weather for your route, texted before you arrive.

- **Footnote:** During Ready & Go we check and alert; we don't repair. If a fluid looks off or a flare's expired, you hear first, then choose: a trusted local mechanic or our repair team.

### Sample conditions brief (text bubble)

- **Sender:** aBeam
- **Message:** For your 1pm: fog lifting off Alcatraz, sun by noon. Westerly 12 kts now, 20+ in the Slot by 3. Max ebb 2:40 at the Gate, so expect chop past Crissy. Halcyon ready by 12:30.
- **Caption:** The brief that lands before you've left the office.

## 5. Full-service menu

- **Eyebrow:** Beyond prep
- **Headline:** When the boat needs more than prep.
- **Intro:** Ready & Go is the front door. Behind it is the same small team for the jobs that don't fit into a morning.

### Detailing

Exterior wash and wax, brightwork, interior detailing down to the lockers. Salt, sun and pelicans are hard on a boat. We undo it, on a schedule or on request.

- **Link:** Ask about detailing

### Repairs & Maintenance

Oil changes, impellers, batteries, winch service, the leak you keep meaning to chase. Our own repair team handles it, or we connect you with a trusted local marine mechanic.

- **Link:** Ask about repairs

### Full Management

Upkeep, scheduling, storage and vendor coordination for owners who'd rather read one update than field a dozen calls. One point of contact, every visit logged.

- **Link:** Ask about management

- **Anything-else line:** A diver booked, a part collected, a surveyor met. Text us and ask. If it's not something we do, we'll tell you who does.

## 6. San Francisco marina chart

- **Eyebrow:** Where we work
- **Headline:** Built for boats at three city marinas.
- **Intro:** South Beach Harbor beside the ballpark, Pier 39 in the thick of the Wharf, and the San Francisco Marina off Marina Green, nearest the Gate. Tap a pin for status and berths.
- **Legend, serving (data-driven status label):** Currently serving
- **Legend, coming soon (data-driven status label):** Coming soon
- **Popup button when coming soon:** Get on the list
- **Popup button when serving:** Book Ready & Go
- **Footnote:** A marina shows as serving only once we've confirmed dock access there. Not listed, or still coming soon? Text us and we'll tell you where things stand.
- **Form option for other marinas:** Other / not sure yet

Status rule: a marina may only show "Currently serving" once vendor-access approval is confirmed with that harbormaster. All three ship as "Coming soon" until then. Change status in `content.js`, never in copy.


## 7. Trust & safety

- **Eyebrow:** Trust & safety
- **Headline:** Who was aboard, and what was done.
- **Intro:** Handing over the companionway key to someone you haven't met takes trust. We've arranged things so you never have to take our word for it.

### Fully insured for boat access

We're fully insured for boat access. Marinas require it, and so should you. Ask us for the insurance certificate any time. We work within your marina's vendor rules, not around them.


### Every visit logged

Who was aboard, when, and what was done, written down every time. A fluid looked off, a flare expired, a fender moved: it's in the record and in your text.


### Small, local, vetted team

Not a franchise, not a rotating roster of contractors. A few people we've vetted ourselves, who know these docks and know each other. You'll know their names.


### We check. We don't tinker.

During Ready & Go we look and report; we never start a repair you haven't asked for. If something's off, you choose: our repair team, or a trusted local marine mechanic we'll introduce.


## 8. Pricing

- **Eyebrow:** Pricing
- **Headline:** One fee per outing, agreed up front.
- **Price line:** Starting at ${{price}} per outing  (`{{price}}` is the editable starting price, set in `content.js`)
- **Price note:** A flat fee per Ready & Go, set by your boat's length, typically $75–150. Fuel, ice and provisions are added at cost. No hourly clock.
- **Includes line:** Every outing includes all six Ready & Go items, the conditions brief and a logged record of the visit.

### Membership, coming soon

For owners who go out often. We're working out the terms now. Leave your number and you'll hear when it's ready, and not before.

- **Button:** Join the waitlist

## 9. Booking form

- **Eyebrow:** Book an outing
- **Headline:** Tell us when you want to go.
- **Intro:** Texting is fastest. If you'd rather use the form, it reaches the same people. Either way, you get a ready-by time back.

### Field labels

- **Name:** Your name
- **Phone:** Mobile number
- **Marina:** Marina
- **Boat:** Boat name & slip
- **Date and time:** Off the dock at
- **Notes:** Provisions, route, anything else

### Placeholders

- **Name:** First and last name
- **Phone:** Best number for the ready-by text
- **Boat:** Halcyon · slip C-14
- **Notes:** Ice, sparkling water, sandwiches for four. Thinking Angel Island and back.
- **Marina select, last option:** Other / not sure yet

### Buttons and messages

- **Submit button:** Request a ready-by time
- **Alternative line under the form:** Or skip the form and just text us.
- **Success message:** Got it. We'll text you back with a ready-by time. If anything needs a decision, we'll ask before we act. Finish your coffee. The dock is handled.
- **Shown while opening the SMS app:** Opening your messages with the details filled in. Just hit send.
- **Required-field error:** We'll need this to get started.
- **Privacy line:** Your details go to us and no one else. We text about your booking, not marketing.

## 10. Footer

- **Blurb:** aBeam is a small San Francisco team working alongside owners at the city marinas: your boat ready before you reach the dock, and looked after between outings.
- **Area label:** Service area
- **Area:** South Beach Harbor · Pier 39 Marina · San Francisco Marina (Marina Green)
- **Contact label:** Text or call  (phone and email come from `content.js`: `[phone]`, `[email]`)
- **Social label:** Follow
- **Legal:** © [year] aBeam · San Francisco, California · All rights reserved.
- **Tagline (repeated next to the wordmark):** By your side, Beyond the shore

## Sticky phone bar

- **Label:** Text us
- **Sublabel:** Same-morning prep · flat fee

## Prefilled text message (what the customer sends us)

Hi aBeam, it's [name]. Ready & Go for [boat name] at [marina], slip [slip]. Off the dock at [date/time]. Please load: [ice, drinks, groceries].

Slots in square brackets are for the customer to fill in. This string goes into `CONFIG.smsBody` in `content.js`.


## Extras


### Alternative hero headlines

Use the first if the client prefers to include powerboat owners rather than lead with "Sail". Italicise "ready" if the italic treatment is wanted.

- Text us. Your boat is ready when you arrive.
- The hour at the dock, returned to you.
- Show up. Step aboard. Cast off.


### Elevator pitch

aBeam is an on-demand boat concierge for San Francisco's city marinas. Text us the morning you want to go out; by the time you reach your slip, the boat is fueled, iced, checked and set up, with a conditions brief on your phone. One flat fee per outing, set by boat length. Detailing, repairs and management when you want more.


### One-liner

Text aBeam the morning you want to go out. Your boat is fueled, provisioned and checked when you arrive.


### Google Business Profile description

aBeam is an on-demand boat and yacht concierge for owners at San Francisco's city marinas: South Beach Harbor, Pier 39 Marina and the San Francisco Marina at Marina Green. Ready & Go, our flagship, is same-morning pre-departure prep for a flat fee per outing: fuel and water topped off, ice and provisions loaded, engine oil, battery, bilge, propane and safety gear checked, fenders and lines set, and a conditions brief texted before you arrive. We check and alert; we don't repair during prep unless you ask. Fully insured for boat access, with a logged record of every visit. Small, local, vetted team. Detailing, repairs and full boat management for owners who want more handled.

Note: the external-facing blocks above deliberately do not contain `{{price}}`. If you want to quote the starting price on Google, Instagram or a flyer, type the dollar figure in by hand.


### Instagram bio (≤150 characters)

SF boat concierge. Text us the morning you want to go out; your boat is fueled, checked and ready at the slip. Ready & Go · Detailing · Repairs


### Marina flyer

- **Headline:** Your boat, ready before you reach the dock.
- **Body:** aBeam is a small San Francisco team that preps your boat the morning you want to go out: fuel and water topped, ice and provisions aboard, engine oil, battery and bilge checked, propane and safety gear checked, fenders and lines set, and a conditions brief texted ahead. One flat fee per outing, set by boat length. Fully insured for boat access, every visit logged. Detailing, repairs and full management too.
- **Call to action:** Text aBeam the morning you want to go out.  (add `[phone]` beneath it once the number is live)

### SMS templates (we send these)

- **Auto-reply:** aBeam here. Thanks, we have your message and will text back with a ready-by time. If you haven't yet, send your boat name, marina, slip and when you'd like to leave.
- **Confirm ready-by time:** aBeam here. [Boat name] at [marina], slip [slip], will be ready by [time]. Fuel, water, ice and [provisions] are on the list. Your conditions brief follows before you head down. Anything to add, just reply.
- **Boat is ready:** [Boat name] is ready at [slip]. Fuel and water full, ice in, lines and fenders set, systems checked and logged. Your brief is above. Step aboard whenever you like.
- **Flag an issue:** aBeam here. Checking [boat name], we found [issue]. Noted in your log, not touched; we don't repair during Ready & Go. [Everything else is ready.] Two options: a trusted local marine mechanic we can connect you with, or our own repair team. Just reply.
- **Conditions brief:** Brief for your [time]: [fog/sun] now, [clearing by noon]. Westerly [xx] kts, building to [xx] in the Slot by [time]. [Ebb/flood] at the Gate, max [time], so expect [chop/smooth water] off [Crissy/Alcatraz]. [Out on the ebb, home on the flood.] [Boat name] ready by [time].

### Confirmation email

- **Subject:** Ready & Go confirmed: [boat name], [date], ready by [time]

```
Hi [name],

Your Ready & Go is booked.

Boat: [boat name], slip [slip], [marina]
Ready by: [time] on [date]
Provisions: [list]

Before you arrive we'll text a conditions brief with wind, tide and weather for your route. During the visit we check and alert; if anything looks off, you'll hear from us before anything is done about it. We don't repair during prep unless you ask.

Flat fee: $[amount], with fuel, ice and provisions added at cost. A record of who was aboard and what was done follows the visit.

Change of plans? Reply here or text us.

aBeam
```


### FAQ

**How far ahead do I need to text?**

The morning you want to go out is fine; that's what Ready & Go is built for. Earlier is welcome, especially for a busy Saturday or a long provisions list, and we'll confirm a ready-by time either way.

**What does it cost?**

A flat fee per outing, set by your boat's length, typically $75–150. Fuel, ice and provisions are added at cost, and that's the whole bill. You'll know the fee before we step aboard. Membership pricing is coming; join the waitlist to hear first.

**What if you find something wrong?**

We tell you straight away and stop there. During Ready & Go we check and alert; we don't repair. From there it's your choice: we can connect you with a trusted local marine mechanic, or our own repair team can handle it.

**Do you have access to my marina yet?**

We're launching at South Beach Harbor, Pier 39 Marina and the San Francisco Marina at Marina Green. A marina shows as serving on our chart only once dock access there is confirmed, never before. Text us your marina and slip and we'll tell you where things stand.
