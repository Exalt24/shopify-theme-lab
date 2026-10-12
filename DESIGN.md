# Design intent for the sale-event sections

Read this before editing `sections/sale-event-hero.liquid` or `sections/bundle-contents.liquid`.
Shopify's agent tooling reads `DESIGN.md` at the theme root (described at shopify.dev/docs/storefronts/themes/agentic-workflows/design-md), and so does the next developer.

## Where this came from

`design-source/winter-sale.html` is a landing page written by Claude (October 2026) as the stand-in for a design handed over, as a single self-contained HTML file,
with hex colours, English baked into the markup and a script that runs on `DOMContentLoaded`. The two sections
are the conversion of that file into native Online Store 2.0 sections. `docs/CONVERSION.md` lists what had to change and why.

## The rule

Colour and type come from the theme, never from these files (corner radii are fixed in the section CSS, 1rem to 2rem). A merchant who changes the colour
scheme or the theme fonts re-themes the sections without anyone touching Liquid or CSS.

| In the source design | In the theme | Why |
|---|---|---|
| Dark navy hero background | the `inverse` colour scheme: `--color-background`, `--gradient-background` | the merchant picks it in the editor |
| White text, soft blue-grey secondary text | `--color-foreground`, and `--color-foreground` at 0.75 to 0.85 opacity for secondary text | contrast follows whatever scheme is chosen |
| Amber pill button | the theme's own `.button` | one button style across the store; the hue now comes from the theme, which is a deliberate change from the design |
| Timer tiles, borders, card shadow | `rgba(var(--color-foreground), ...)` at 0.06 to 0.3 depending on use (fills, borders, the card shadow and the dashed totals rule) | tints of the text colour stay legible on any scheme |
| Fixed font stack | `--font-heading-family`, `--font-heading-weight` | the theme's own fonts |
| Pixel (`px`) sizes | rem values on the theme's 10px root (`1.3rem` is 13px) | Dawn sets the root size to `calc(var(--font-body-scale) * 62.5%)`, which is 10px at the default scale |

There are no hex literals in the section CSS or Liquid. To check: `grep -E "#[0-9a-fA-F]{3,8}" sections/sale-event-hero.liquid sections/bundle-contents.liquid assets/section-sale-event-hero.css assets/section-bundle-contents.css`.

## Behaviour that must survive an edit

- **One absolute end instant.** The countdown ends at one moment. It comes from the collection's `custom.sale_ends_at`
  date-time metafield (read with the shop's offset, so it is an absolute instant), or from the typed time plus the zone the merchant picked. The visitor's clock only drives
  the display. The sale's own zone is shown whenever it is known (from the metafield or the zone picked), plus the visitor's local time when it differs.
- **It degrades.** With JavaScript off, or with an unreadable date, the static end text from Liquid stays and nothing breaks.
- **`<sale-countdown>` is a custom element**, so a re-render that creates and removes timers is handled (tested by cloning and removing the node; the editor itself was not used to exercise it)
  without `shopify:section:load` handlers. `tests/countdown.test.cjs` pins this.
- **Bundle prices are real.** The bundle is its own product with its own price. The saving shown is
  (sum of the component prices) minus (the bundle price), and it only appears when it is positive.
  Nothing in the theme invents a compare-at price. A discount that changes at checkout needs a Shopify Function or
  a bundle app, and these sections do not pretend otherwise.
- **Heading level is a setting.** One `h1` per page, so the sale landing page template sets the hero to `h1` and everything else stays `h2`.
- **Every sentence the sections print by themselves goes through `locales/en.default.json`.** The default text a merchant can edit (heading, text, button label, bundle subtitle) lives in the section settings and the templates. The one literal in the sections' own output is the abbreviation `UTC` inside the zone label, written by the section and the countdown script.

## What is deliberately not here

No page-builder output and no app embed: native sections only.
