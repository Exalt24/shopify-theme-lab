# From a Claude-generated page to native sections: what changed and why

Input: `design-source/winter-sale.html` (one HTML file). Output: `sections/sale-event-hero.liquid`,
`sections/bundle-contents.liquid`, their assets, two JSON templates and locale strings.

| # | Problem in the generated page | What the conversion does | Where |
|---|---|---|---|
| 1 | A full HTML document: `doctype`, `html`, `head`, `body`. Pasted into a theme it breaks the layout. | Fragments only. The theme's `layout/theme.liquid` owns the document. | whole of `sections/` |
| 2 | No `{% schema %}`, so nothing is editable and it cannot be added in the theme editor. | A schema with typed settings and a preset so each section appears under "Add section". The hero also has a heading-level choice and renders designed with no content entered; the bundle section renders nothing on the storefront until parts are listed (the editor shows a hint). | `{% schema %}` at the end of each section |
| 3 | Hex colours everywhere. | Colour scheme variables from the theme. Zero hex literals. | `assets/section-*.css` |
| 4 | Global rules (`* { margin: 0 }`, `body { ... }`) that restyle the whole store. | Every selector sits under `.sale-hero` or `.bundle-contents`. | `assets/section-*.css` |
| 5 | English text baked into the markup. | Merchant text is a setting; fixed words go through `t`. | `locales/en.default.json` |
| 6 | Content baked into the markup (product names, prices). | The bundle reads real products from a metafield list and real prices from the variants, formatted with `money` so Markets currency applies. | `sections/bundle-contents.liquid` |
| 7 | `DOMContentLoaded` script. In the theme editor the section is re-rendered into the live page and page-load JavaScript does not run again, so a timer silently stops or doubles. | A custom element: `connectedCallback` and `disconnectedCallback` fire on every insert and removal. | `assets/sale-countdown.js` |
| 8 | A countdown to `new Date('2026-11-27T23:59:59')` is the visitor's own time zone, so the same sale ends at different moments for a US, UK and Australian customer. | One absolute instant. A zone picker, a date-time metafield override (read with the shop's offset), the sale's zone always shown, and the visitor's local time when it differs. | `assets/sale-countdown.js` |
| 9 | No fallback. | With JavaScript off or an unreadable date the static text from Liquid stays and the section still reads correctly. | `sale-event-hero.liquid`, `sale-countdown.js` |
| 10 | Placeholder boxes instead of images. | `image_url` plus `image_tag` with width and height, srcset, `loading=eager` and `fetchpriority=high` only when the hero section is first on the page and lazy otherwise; the bundle section's part images are always lazy. | `sale-event-hero.liquid`, `bundle-contents.liquid` |

## How it is checked

- `shopify theme check --output json`, filtered to the files added here: zero offenses.
- `node tests/countdown.test.cjs`: 22 checks in Chromium with a controlled clock.
  `node tests/countdown_mutants.cjs`: 15 planted defects, all caught.
- `node tests/liquid.test.cjs`: 20 checks that run the section Liquid itself through LiquidJS with Shopify's objects
  stubbed. `node tests/liquid_mutants.cjs`: 16 planted defects, all caught.
- Figures for these runs are in the README.

## What the conversion does not reproduce

- The amber pill button and the gradient hero: the section uses the theme's own button and colour scheme, so the hue
  follows the theme settings. The static preview sets the theme's text colour to the design's navy to show that a
  colour setting carries through; the button stays the theme's.
- The three-card product grid with a red "Sale" tag on each card (the green "You save" figure is on the bundle total, not on the cards): the templates use
  Dawn's own featured-collection and collection grid sections. They render on the real store (`docs/STORE_CHECK.md`
  items 1 and 2) but were not built or customised here, and an automatic discount cannot show a sale price on a
  product card from Liquid.
- The static preview is a copy, not the storefront: its buttons do nothing, and its countdown ends at the fixed
  instant 2026-11-28T04:59:00Z, after which it shows the ended state. The real-store checks are in `docs/STORE_CHECK.md`.
