# Storefront check and static preview

*What was read on the real Shopify storefront and theme editor, and how the static copy is built. The overview is in the [README](../README.md).*

**Checked on the real Shopify storefront and theme editor (2026-10-12).** The files of this repo were pushed to a
development store's unpublished theme and read there in a real browser; the record, with screenshots, is
[`docs/STORE_CHECK.md`](STORE_CHECK.md). Short version: the landing page renders with
no missing translations or overflow and the collection template renders; Shopify prints the `date_time` metafield in the shop's zone and `%:z` gives its
offset (`23:59:00-05:00`), so the end moment is right; a Manila browser reads "Sat, Nov 28, 12:59 PM GMT+8" and a Sydney
one "3:59 PM GMT+11"; with JavaScript off the static label and the bundle still read correctly; a real cart shows the
10% automatic discount on the sale board ($749.95 to $674.96) and none on the bundle or its parts; with every variant of
the wax at zero stock the button reads Sold out, and the inventory was restored exactly; a theme colour change
carries through to the hero and the bundle heading; the theme editor lists both sections, shows their settings, and
offers them in the Add section list; a theme font change carries through to both sections; Lighthouse (mobile, cold, five
runs) has a median of 91, and the weight is Shopify's and Dawn's own (scripts, stylesheets, fonts, the preview bar and other platform requests; the three files these sections
add transfer 5.2 KB); axe finds nothing inside either section at 390px and 1280px.

![The sale landing page on the real storefront](store-check/landing-desktop-manila.png)
![The hero's settings in the theme editor](store-check/editor-hero-settings.png)

**A static copy anyone can open (the dev store itself is behind its password).** `npm run preview` renders both sections from those real files, fed
with the dev store's own product titles, prices and images read from its public Storefront API, styled with the theme's
own `base.css` and colour settings, and screenshots them at 390px and 1280px with a fixed clock. The result is
`preview/index.html` (open it in a browser) with `preview/phone-390.png` and `preview/laptop-1280.png`. In the run of
2026-10-12 the sale zone and a visitor's own time both show (a Manila browser reads "That is Sat, Nov 28, 12:59 PM
GMT+8 where you are."), the saving reads "You save $44.95 (6.2%)" against the parts' list prices, and there is no
horizontal overflow at either width.

The preview needs the stock Dawn files this repo overlays (`assets/base.css`, `config/settings_data.json`), so run it
from a checkout of [Shopify's Dawn](https://github.com/Shopify/dawn) (MIT with Shopify's added condition that it is used to develop Shopify themes, see `LICENSE`) with this repo's files copied over it, then
`npm install` there. Use Dawn v9.0.0 or earlier: later Dawn replaced the flat colour settings this repo's sections and
the preview builder read (`colors_text`, `colors_accent_1`, ...) with colour-scheme groups, and on such a checkout the
builder warns and falls back to a plain palette (the section schemas also reference `sections.all.colors.*.label` locale keys that later Dawn versions do not have). It
stops without changing anything if the two Dawn files are missing. It reads the dev store's public Storefront token from
`SHOPIFY_STOREFRONT_TOKEN` (or a file named by `SHOPIFY_STOREFRONT_TOKEN_FILE`) and falls back to stub products
without one; Node 20 or newer is needed for the tests and the preview (Playwright 1.64), Node 20.19 or newer for `npm run css` (Sass), Node 22.19 or newer for `perf/audit.mjs` (Lighthouse), Python 3 only for the seed script and `perf/read_report.py`.
Its buttons and product links are inert, its product images are hot-linked from the dev store's CDN, its countdown
ends at the fixed instant 2026-11-28T04:59:00Z (after which it shows the ended state), and the theme's text colour is
set to the source design's navy to show that a colour setting carries through. It is deployed to Cloudflare Pages
as the project `sale-sections-preview`.

![Laptop width](../preview/laptop-1280.png)
![Phone width](../preview/phone-390.png)
