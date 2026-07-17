# Capability section — "It watches. Even when you don't."

Date: 2026-07-16
Status: approved, ready to build

## Problem

Verisko's cameras have four capabilities that carry the pitch: AI person
detection, colour night vision, two-way audio, and warning lights. All four
already have finished graphics in `assets/features/`, and all four already
render on the page — but only inside the `#featureModal` dialog, behind a
"See what it does" click on a product card.

Most visitors never open that modal, so the strongest part of the product
story is invisible on the page itself.

## Solution

A new section directly under the hero: hook copy on the left, an asymmetric
image collage on the right. Modelled on the Afterpay "Connect with the
world's best shoppers" layout the user supplied as reference.

The section is a **teaser**, not a replacement. Its CTA opens the existing
modal, which keeps the per-camera detail and the recorder feature set.

## Placement

Between `.hero` and `.payment`, as `<section class="capability" id="capability">`.

Chosen deliberately over placing it below payment: capability earns the
interest that makes payment terms matter. Accepted trade-off — the "two ways
to pay" section moves further down the page. Payment is still stated in the
hero subhead, so the message is not lost.

## Layout

    ┌─────────────────────────┬───────────────────────────┐
    │ EVERY VERISKO CAMERA    │  ┌──────────┬─────┐       │
    │ It watches.             │  │    1     │  2  │       │
    │ Even when you don't.    │  │  (tall)  ├─────┤       │
    │ <sub copy>              │  │          │  3  │       │
    │ See what every camera   │  │          ├─────┤       │
    │ does →                  │  └──────────┴─────┘  4    │
    └─────────────────────────┴───────────────────────────┘

Desktop: two columns. Collage is a CSS grid — one tall cell spanning full
height on the left, three stacked cells on the right.

Mobile (≤900px, the breakpoint already used elsewhere): single column, copy
first, collage below. The collage also flattens to an even 2x2 there — at
phone width the desktop ratio squeezes the three side cells to ~50px, too
small to make out.

## Content

Eyebrow: `EVERY VERISKO CAMERA`

Headline: `It watches. Even when you don't.`

Sub: `Knows a person from a stray dog. Sees in colour at night. Talks back
through your phone. Lights up anyone who gets close.`

CTA: `See what every camera does →`

The sub-line names the four capabilities in the same order as the collage
cells, so copy and image tell one story. Reading level matches the rest of
the site (plain, short sentences — cf. "Sees far, day or night").

## Images

Reuse existing files. No new assets, no new image processing.

| Cell | File                              | Capability          |
|------|-----------------------------------|---------------------|
| 1    | `assets/features/face-detection.jpeg`     | AI person detection |
| 2    | `assets/features/night-vision.jpeg`       | Colour night vision |
| 3    | `assets/features/two-way-audio.jpeg`      | Two-way audio       |
| 4    | `assets/features/active-deterrence.jpeg`  | Warning lights      |

Note: these cover the same four capabilities as the reference images supplied
with the request, but they are **different pictures** — not the same files.
The reference set was cleaner. Swapping them in later is a drop-in change:
replace the files, keep the markup.

`smart-email-alert.jpeg` stays modal-only — it was not part of the requested
set.

All images `loading="lazy"` and `decoding="async"`. They sit below the hero
fold, so they must not compete with the hero image's `fetchpriority="high"`.

### Why the cells letterbox instead of crop

Every one of these graphics has a headline baked into the pixels ("Face
Detection/Face Record", "Day Vision"). Cropping to fill slices that text, so
cells use `object-fit: contain` on a `--cyan-soft` panel.

To stop that leaving wide bands of empty tint, the cells are sized to match
the images' 1:1 shape: `grid-template-columns: 3.17fr 1fr` with
`aspect-ratio: 4/3` lands both the tall cell and the three side cells close to
square.

`.cap-shot` needs `min-width: 0; min-height: 0;` — without it the images'
intrinsic 1000px sets a min-content floor, the rows refuse to shrink, and the
collage silently ignores its `aspect-ratio`.

## Modal integration

The CTA reuses the existing attributes:

    data-feature-open data-feature-set="camera" data-product="Verisko camera"

This is the same contract the product cards and the nav "Features" link
already use, handled by existing code in `app.js`. **No JavaScript changes.**

Consequence: the section and modal cannot drift into two divergent copies of
the capability story — the modal remains the single source of detail.

## Styling

Existing tokens only:

- Container: `max-width: var(--maxw)`, `padding: 0 var(--pad)`
- Type: `.section-title` / `.section-sub` conventions
- Colour: `--navy` headline, `--gray` sub, `--cyan` eyebrow and arrow
- Collage cells: rounded corners matching the reference

## Scope

- `index.html` — new section markup
- `styles.css` — new `.capability` block
- `app.js` — **no change**
- `assets/` — **no change**

## Verification — done 2026-07-16

Served locally, driven in headless Chrome:

- Desktop 1440: collage renders, cells land square, no text sliced.
- Stacked ≤900: copy first, collage 2x2, all four legible.
- Clicked `.cap-cta`: opens `#featureModal` on the camera set, titled
  "Verisko camera". No JS change was needed — `app.js:372` binds
  `[data-feature-open]` globally.
- Overflow measured at 390/768/1440: `scrollWidth == clientWidth` at every
  width. No horizontal scroll.

Gotcha for next time: headless Chrome clamps the viewport to a 500px minimum,
so a `--window-size=390` screenshot is really a 500px page cropped to 390 and
*looks* like a text-clipping bug. Measure `scrollWidth` rather than trusting
the picture.
