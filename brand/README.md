# Potluck Docs

**Name:** Potluck Docs
**Mark:** a coral plate rim, a white well, three lines of text in it

A plate and a page are the same shape problem. The rim is what settles which
one you are looking at.

Wordmark and typography are not decided yet, so nothing in this package sets
type. These are the marks only.

## Files

```
mark/svg/      light, dark, and a filled-background version of each
mark/png/      the same four, at 16 / 32 / 64 / 128 / 256 / 512 / 1024
variants/      two alternate line colorings, see below
favicon/       favicon.ico, favicon PNGs, apple touch icon, maskable icon
color/         tokens.css, tokens.json, swatches.png
```

## Pick a file

| You are doing this | Use |
|---|---|
| Light site, light README, light docs theme | `mark/svg/potluck-mark-light.svg` |
| Dark site, dark README, dark docs theme | `mark/svg/potluck-mark-dark.svg` |
| Browser tab | `favicon/favicon.ico` and the favicon PNGs |
| iOS home screen | `favicon/apple-touch-icon.png` |
| Android or PWA | `favicon/icon-512-maskable.png` |
| Sticker or one-color print | `variants/potluck-mark-all-coral-light.svg` |

Use SVG wherever it is supported. Reach for PNG only when it is not, and pick
a size at or above the display size, never below.

## Transparent vs filled

- **Transparent** (`light`, `dark`): nothing outside the circle. The default.
  Light version on light grounds, dark version on dark.
- **Filled** (`light-bg`, `dark-bg`): a full-bleed square behind the circle.
  Only for platforms that will not honor transparency, or composite it onto
  black, which is why the Apple touch icon is a filled one.

In the dark filled version the well and the background are both ink, so the
mark reads as a coral ring with floating text. That is intended.

## Alternate line colorings

Same geometry, different line colors.

- **ink lines** is the default. At favicon size the contrast between band and
  text matters more than any hierarchy.
- **coral-lead** turns the top line coral, so the mark gains a heading
  hierarchy out of one color. For display sizes.
- **all-coral** is a single ink. Stickers, silkscreen, embroidery, and
  anywhere it sits beside the EkLine mark, since EkLine is one color too.

## Color

| Token | Hex | Where it goes |
|---|---|---|
| Coral | `#FF5656` | The rim band. Mark only. |
| Coral text | `#D03025` | Links and accent text. 5.1:1 on white. |
| Ink | `#231F20` | Text on light, well and ground on dark. |
| Ink dim | `#615B59` | Secondary text. 6.7:1 on white. |
| Paper | `#FFFFFF` | The well on light, text on dark. |
| Ground | `#F2F1F0` | Page background on light. |

Two corals on purpose. `#FF5656` reaches only 3.13:1 against white, so it is a
mark color, not a text color. Anything carrying words uses `#D03025`.

## Construction

Built on a 64 unit grid.

| | |
|---|---|
| Outer radius | 30 |
| Well radius | 22 |
| Band | 8 |
| Bar height | 4.4 |
| Bar corner radius | 2.2 |
| Bar widths | 30 / 25 / 17 |
| Bar origin x | 17, left aligned, ragged right |

The corner radius is exactly half the bar height, so the ends are true half
circles. Change the height and the radius moves with it.

**Clear space:** one quarter of the mark's diameter on all four sides.
**Minimum size:** 16px on screen, 6mm in print. Below that the lines close up.

## Do not

- Recolor the band, or add gradients, shadows, glows, strokes or outlines.
- Rotate, skew, stretch or squash it.
- Change the bar radius independently of the bar height.
- Put a light version on a dark ground, or the reverse.
- Set `#FF5656` as a text or link color.

## Relationship to EkLine

Shared with the parent mark: the coral, the ink, and the concentric circle
construction. Not shared: EkLine's pencil, which is the parent's own object.
Deliberately different: EkLine cuts every terminal flat, Potluck's bar ends are
rounded, because the child brand is the warm one.

---

## Notes added when this package landed in the repo

**Typography is out of scope.** The font tokens that shipped in `color/tokens.css`
and `color/tokens.json` have been removed. Both sites keep Inter (UI and content)
and JetBrains Mono (code), self-hosted via `@fontsource`. The rebrand is carried
by color and the mark; Instrument Sans and Newsreader are not being adopted.

**`derived/` holds files built from this package, ready to copy.**

| File | Where it goes |
|---|---|
| `derived/favicon.svg` | `public/favicon.svg` in each site — one file that swaps the well and bars on `prefers-color-scheme`, so a single favicon covers both themes |
| `derived/accent-ramp.css` | the `@theme` block of each site's `src/styles/global.css` |

**EkLine stays.** Potluck Docs is the product name; EkLine remains the
maintainer. The footer credit, the LICENSE copyright and the `@ekline` npm scope
are unchanged. That matches "Relationship to EkLine" above: this is the child
brand, not a replacement.

## `preview/`

Screenshots from the verification run described in
`docs/superpowers/plans/2026-09-19-potluck-docs-rebrand.md`. Phases 1–2 were
applied to a working copy, built and measured, then reverted; these are what
that build looked like. They are review evidence, not assets — delete them once
the rebrand has actually landed.
