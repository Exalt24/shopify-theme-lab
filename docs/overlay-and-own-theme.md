# Overlay on Dawn and using the sections in your own theme

*The overview is in the [README](../README.md).*

This repository is an overlay on Shopify's stock Dawn theme (MIT with Shopify's added condition that it is used to develop themes that work with Shopify; the full text is in `LICENSE`, next to the MIT licence of my additions). Most stock files are git-ignored on
purpose (see `.gitignore`), but a few edited or stock files are tracked because earlier work changed them:
`sections/main-product.liquid` (the dev theme's edited copy of Dawn's product section), `templates/product.json`, the full `locales/en.default.json` and `preview/assets/base.css` (Dawn v9.0.0's, unchanged) (the dev theme's keys plus the
15 I added). To try the sale sections in your own Dawn-based theme, copy only `sections/sale-event-hero.liquid`,
`sections/bundle-contents.liquid`, `assets/sale-countdown.js`, `assets/section-sale-event-hero.css`,
`assets/section-bundle-contents.css` and the two `templates/*sale*.json`, and merge the `sections.sale_event_hero` and
`sections.bundle_contents` keys into your own locale file rather than copying mine over it.
`scripts/seed_sale_demo.py` seeds MY development store only (it refuses any other shop and uses Shopify's sample
product handles), so on another store create the two metafield definitions (`custom.bundle_items`,
`custom.sale_ends_at`) and the discount by hand. The tests need Playwright: `npm install`, `npx playwright install chromium`, then `npm test`
and `npm run test:mutants`.
