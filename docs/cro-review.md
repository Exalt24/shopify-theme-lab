# Conversion review of the sale page

*A review of the sale hero, the bundle block and the performance diagnosis against common conversion rate optimization practice. The overview is in the [README](../README.md).*

This is a review of design choices that are known to affect whether a visitor buys, written from what the repo builds and measures. It is not a result: the store is a development store with no visitors, so no conversion rate, test or uplift was measured, and nothing here says a figure went up.

## What each piece does for conversion

| Practice | What the repo does | How it was checked |
|---|---|---|
| Urgency has to be true | The countdown ends at one absolute instant read from a collection metafield, so a visitor in another time zone sees the same end. With JavaScript off or an unreadable date the section still reads correctly instead of showing a fake clock. | 22 countdown tests in Chromium with a controlled clock, 15 planted defects caught ([sale-sections.md](sale-sections.md#how-it-was-checked)) |
| A saving is shown only when it exists | The bundle block works the saving out from the real prices and prints it only when it is positive. A review found the page saying "You save" while the parts were cheaper than the bundle, and the seed script now keeps the parts out of the discounted collection. | 20 Liquid tests, 16 planted defects caught |
| Remove the dead end | The bundle button is disabled while any listed part is sold out, so the visitor is stopped on the page and not at checkout. It is a display guard: a direct cart add or a stale cached page can still sell it, which the doc says. | Liquid tests for a sold out part and a sold out bundle |
| Speed is a revenue question | `perf/app-cost.mjs` lists third party bytes and main thread time by origin on a public storefront, sorted by cost, and does not recommend removals, because whether a review widget earns its weight is the merchant's call. | A median of several Lighthouse runs, with the store's password page excluded ([performance.md](performance.md)) |
| One clear action | On the sale landing page the hero leads to one bundle block with one add to cart button, and the colours come from the theme's colour schemes so that button looks like the store's own. The collection template has no button of its own: it shows the countdown above the stock product grid. | Both templates rendered on the real storefront and the landing template opened in the theme editor ([STORE_CHECK.md](STORE_CHECK.md)) |

## What was not done

- No A/B test, no heatmap or session recording tool, no analytics funnel and no real traffic: the store is a development store.
- The urgency and saving blocks follow common practice. How much each one moves orders for a given store has to be tested on that store.
- Post purchase offers, checkout changes and email or SMS flows are not part of this repo.
