# Sale sections

*Reference for the October 2026 conversion of a Claude-generated landing page into native Shopify sections. The overview is in the [README](../README.md).*

`design-source/winter-sale.html` is a landing page written by Claude (October 2026) as the stand-in for a design handed over: one HTML file, hex colours, English
baked in, a script that runs on `DOMContentLoaded`. It cannot be pasted into a theme. This repo holds its conversion
into editable Online Store 2.0 pieces, and a list of what had to change and why (`docs/CONVERSION.md`).

| Piece | File |
|---|---|
| Sale hero with a countdown, editable in the theme editor | `sections/sale-event-hero.liquid`, `assets/section-sale-event-hero.css`, `assets/sale-countdown.js` |
| "What is in the bundle" block for a real bundle product, saving worked out from the real prices | `sections/bundle-contents.liquid`, `assets/section-bundle-contents.css` |
| A sale landing page and a sale collection template | `templates/page.sale-landing.json`, `templates/collection.sale-event.json` |
| Design intent, colour and token mapping, rules to keep | `DESIGN.md` |
| Dev-store data: bundle product, smart collection, page, metafields, a discount ending when the countdown does | `scripts/seed_sale_demo.py` |

What the sections do that the generated page did not:

- **Colours come from the theme's colour schemes**, so changing a theme colour re-themes them. No hex literals.
- **The countdown ends at one absolute instant.** A sale advertised for a US, UK and Australian audience cannot use
  the visitor's own clock to decide when it ends. The end comes from a collection date-time metafield (best, because
  the collection page and the landing page then agree) or from a typed time plus a chosen zone. The sale's zone is
  shown whenever it is known (from the metafield or the zone picked), plus the visitor's local time when it differs. With JavaScript off or an unreadable date the section
  still reads correctly.
- **`<sale-countdown>` is a custom element**, so a re-render that creates and removes timers is handled (tested by cloning and removing the node in Chromium; the editor itself was not used to exercise it).
  Impossible dates (31 February, 24:00) are refused by a round-trip check that does not depend on the browser's date parser (`Date.parse` alone rolls them forward in some); the tests run in Chromium only.
- **The countdown only counts down.** The seed also creates an automatic discount with the same end instant. The two
  are equal at seed time only: the countdown reads the collection metafield and the discount has its own end date in
  the admin, and Liquid cannot read a discount, so when the sale is moved both must be edited (a Shopify Function
  reading the metafield would tie them).
- **The bundle is its own product with its own price.** The saving is the sum of the parts minus the bundle price,
  shown only when positive. The button is disabled while any listed part is sold out. This is a display guard: a bundle
  product is not stock-linked to its parts the way Shopify's own Bundles app does it (an order contains only the bundle
  line, so the parts' stock does not drop, and a direct cart add or a stale cached page can still sell it), and a
  discount that varies by cart needs a Shopify Function or a bundle app. "Bought separately" is the parts' list
  price, so the parts must stay out of any discounted collection: a review found that tagging the parts into the
  10% sale made the page say "You save" while the parts were cheaper than the bundle, and the seed now keeps them out.

- **The look follows the store's theme, not the original page.** The rebuilt hero takes the theme's colour scheme (black on this store's Dawn colours, navy in the static copy where the text colour is set to the source's navy) and the button is the theme's own button. The original's amber pill button, gradient and three-card product grid are not rebuilt; `docs/CONVERSION.md` lists each difference.


## How it was checked

*Figures from runs on 2026-10-12.*


| Check | Result |
|---|---|
| `shopify theme check --output json`, filtered to the sale sections' own files (sections, CSS, JS, templates, locale keys) | 0 offenses. |
| `node tests/countdown.test.cjs`: Chromium with a controlled clock | 22 of 22. The local-time line's zone-name comparison is one of the planted defects in the mutant suite (a bug of mine, fixed before the first commit). |
| `node tests/countdown_mutants.cjs`: planted defects | 15 of 15 caught (timer leaks, ignored zone offset, wrong day length, no end state, HTML injection, accepted impossible dates, listener leaks, and others) |
| `node tests/liquid.test.cjs`: the real section Liquid executed through LiquidJS with Shopify's objects stubbed | 20 of 20: saving maths, whole-number percent, sold-out part and sold-out bundle, no saving row when the bundle is not cheaper, the metafield instant reaching the script as the same moment in six render zones, collection priority, escaping, heading level, image priority, every string present in the locale file. |
| `node tests/liquid_mutants.cjs`: planted defects in the Liquid | 16 of 16 caught |
| `node tests/spec_table.test.cjs` (`npm run test:spec`): the older spec table's grouping, row and escaping behaviour through LiquidJS | 7 of 7. Its first case failed on the earlier code and found a real bug: a group whose name was a prefix of an earlier group's name (`dim` after `dimension`) was treated as already listed and every row under it vanished, because `contains` on a string is a substring test. Fixed 2026-10-12; the fixed section was uploaded to the dev theme (Shopify accepted its syntax) and four product pages rendered without errors, but the dev store has no spec metafields, so the table itself was only exercised through LiquidJS. |

**What the Liquid tests are and are not.** `tests/render/shopify_liquid.cjs` is my own stand-in for the Shopify
objects, filters and tags the two sections use (`money`, `t`, `image_url`, `{% form %}`, `{% style %}`, a date filter
that prints a time in a given offset). It runs the real `.liquid` files, so the branches and maths are exercised, but
it is not Shopify's renderer. The two things it cannot prove, how Shopify prints a `date_time` metafield and what the
theme editor lists and offers, were read on the real store the same day (below); how the editor re-renders a section was not exercised there. The section prints the offset it was
rendered in precisely so the end moment is right either way, and the tests check that for six zones.
