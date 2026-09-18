# aBeam — marketing site

**By your side, Beyond the shore.**
Single-page marketing site for aBeam, a shore-side concierge and trip-management service for captains, crews and owners at San Francisco's city marinas. Clients text a specific need (provisions, parts, returns and refunds, errands, vendor coordination); aBeam confirms what it can do, by when, and for what fee, and flags rather than fixes anything it notices aboard.

Plain HTML / CSS / JavaScript. No build step, no framework, no backend required.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole page, in the brief's section order (hero → 3D boat → how it works → what's included → full-service menu → marina chart → trust → pricing → booking → footer) |
| `styles.css` | Design tokens (navy / white / teak), light + dark themes, layout for every section |
| `content.js` | **The one file you edit.** Phone number, email, starting price, marina statuses, hotspot copy |
| `main.js` | Page wiring: "Text us" links, sticky mobile CTA, booking form, price rendering |
| `boat.js` / `boat.css` | Interactive 3D boat (Three.js, loaded from jsDelivr, pinned version) |
| `map.js` / `map.css` | Interactive marina chart: pins, popups, keyboard + touch handling. The chart itself is an inline SVG in `index.html` |
| `copy/aBeam-copy-blocks.md` | Reusable copy: every site string plus alt headlines, pitches, SMS templates, flyer, FAQ |
| `copy/final-copy.json` | The same copy, structured |
| `docs/` | The client brief and the build contract the site was built against |

## Things to change before launch (all in `content.js`)

1. **Phone number** — `phoneDisplay` and `phoneE164` (the placeholder is a 555 number). Every "Text us" button opens a prefilled text to this number.
2. **Email** — `email`.
3. **Starting price** — `startingPrice` (default 75). The page renders "Starting at $75 per request"; every request is quoted up front.
4. **Marina status** — each entry in `MARINAS` has `status: 'soon'`. Flip one to `'serving'` **only after vendor/dock access is confirmed at that marina**. That single change updates the pin colour, the popup, and the list.
5. **Social links** — `social` (placeholders point to `#`).
6. **Request form delivery** — by default the form composes a text message and opens the phone's SMS app. To receive submissions by email instead, set `formEndpoint` to a Formspree / Basin / Getform-style URL.

## Run it locally

Any static server works. For example:

```bash
python3 -m http.server 8765
```

then open <http://localhost:8765>. (Opening `index.html` directly from disk will not load the JS modules; use a server.)

## Deploy

The site is static files at the repo root, so it deploys anywhere:

- **GitHub Pages** — Settings → Pages → Deploy from branch → `main` / `/ (root)`. Done.
- **Netlify / Vercel / Cloudflare Pages** — point at the repo, no build command, publish directory `/`.
- **Any web host** — upload the files in this folder.

External dependencies at runtime: Three.js from jsDelivr (pinned) and two Google Fonts. Nothing else.
