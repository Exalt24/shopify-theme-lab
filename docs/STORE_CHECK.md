# Checked on the real Shopify storefront and theme editor (2026-10-12)

Store `dac-dev-store.myshopify.com` (a development store with Shopify's sample data, behind its storefront password),
theme `sale-sections-demo` (#189263937757, unpublished, so every storefront URL carries `?preview_theme_id=`), the files
of this repo pushed with the Shopify CLI. Pages were read in Playwright Chromium after signing in to the storefront with
its password; the theme editor was opened in a signed-in browser. Nothing below is from the static preview.

| # | What was checked | How | Result |
|---|---|---|---|
| 1 | The sale landing page renders | `/pages/winter-sale-landing` | one `h1`, the hero, the bundle block and Dawn's own "Sale picks" grid; no "translation missing" text; no horizontal overflow at 390px or 1280px; a fresh load had zero failed network responses ([desktop](store-check/landing-desktop-manila.png), [phone](store-check/landing-phone-sydney.png)) |
| 2 | The collection template renders | `/collections/winter-sale` | the same hero with the countdown above Dawn's product grid ([screenshot](store-check/collection-desktop-manila.png)) |
| 3 | How Shopify prints a `date_time` metafield | read `data-ends-at-utc` and `data-utc-zone` | `2026-11-27T23:59:00-05:00` and `-05:00`: Shopify renders the metafield in the shop's time zone and `%:z` prints that offset, so the end moment is the seeded `2026-11-28T04:59:00Z` whichever zone Liquid uses (this was the open question before) |
| 4 | The sale's zone and the visitor's own time | browser set to Manila, then Sydney | "Sale ends Fri, Nov 27, 11:59 PM (UTC−05:00)" with "That is Sat, Nov 28, 12:59 PM GMT+8 where you are." and "3:59 PM GMT+11" |
| 5 | JavaScript off | a context with scripts disabled | the static label "Sale ends 27 Nov 2026, 23:59 (UTC-05:00)" and the bundle block still read correctly, the empty timer tiles are hidden |
| 6 | The saving | read the bundle block | "Bought separately $724.90, Bundle price $679.95, You save $44.95 (6.2%)" |
| 7 | The automatic discount | a real cart through the Storefront API with the sale board, the bundle and its two parts | the sale-tagged board went from $749.95 to $674.96 ("Winter sale 10% off", −$74.99); the bundle and both parts carried no discount, which is why the saving line is true |
| 8 | The Sold out guard | set every variant of the wax to 0 stock through the Admin API, read the page, restored | the button read "Sold out" and was disabled ([screenshot](store-check/sold-out-all-wax-variants-zero.png)); after restoring, "Add bundle to cart", and the original inventory state (tracked, DENY, 10 each) was read back identical |
| 9 | A theme colour change carries through | changed `colors_text` in the theme's `config/settings_data.json`, read the computed colours, restored the file | the hero background and the bundle heading went from `rgb(0, 0, 0)` to `rgb(122, 31, 61)`; the file read back byte-identical to the original ([screenshot](store-check/colour-change-carries-through.png)) |
| 10 | The theme editor | opened the template `page.sale-landing` in the editor | the template lists Sale event hero, Bundle contents and Featured collection; clicking the hero shows every setting in the schema (colour scheme, eyebrow, heading, heading level, text, sale collection, typed end time, time zone, ended message, button, image, overlay, spacing, custom CSS); the bundle section shows its settings; the Add section list offers "Bundle contents" and "Sale event hero" ([settings](store-check/editor-hero-settings.png), [Add section](store-check/editor-add-section-list.png)) |
| 11 | Page speed | `perf/audit.mjs`, Lighthouse mobile emulation with simulated throttling, cold cache every run, five runs | median score 91 (runs 97, 86, 92, 91, 91), LCP 2.7 s, total blocking time 6 ms, CLS 0.014, 140 requests and 1.4 MB. That weight is Dawn's own sale-picks grid and product images; the three files these sections add are about 13 KB unzipped (`sale-countdown.js` 6.7 KB, the two CSS files 6.7 KB together). Raw numbers in [`perf/sale-landing-real.json`](../perf/sale-landing-real.json) |
| 12 | Accessibility | axe-core 4.11 on the real page at 390px and 1280px | zero violations inside `.sale-hero` and zero inside `.bundle-contents` at both widths; the whole page has one `frame-title` finding on `#PBarNextFrame`, which is Shopify's own preview-bar iframe and not part of the theme |

A first Lighthouse run on 2026-10-12 reported a score of 100 for "7 requests and 82 KB" and was wrong: the audit had been scoring the password page, because forwarding a cookie header from another browser does not survive the store's redirects. `perf/audit.mjs` now logs in inside the browser Lighthouse drives, clears the cache between runs, and refuses any run that did not end on the page it was asked for.

## Not done

- No section was built from scratch by hand in the editor, and nothing was saved from it: the editor was read, not edited.
- The sale was not taken through Shopify's hosted checkout page; the discount was read from a real cart's line allocations (item 7).
- Only English locale keys exist for the new sections, and the typed-time zone picker has five fixed offsets (a sale between roughly March and October should use the metafield).
- Two colour-scheme options (`accent-2`, `background-2`) fail contrast on the default colours, which the hero section warns about in its settings.

The scripts that drove this live in my private workspace tooling because they sign in with credentials; each step above can be repeated with the store's password.
