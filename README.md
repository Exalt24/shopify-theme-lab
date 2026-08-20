# shopify-theme-lab

Liquid work on a real Shopify development store: two additions to a live theme
that fix gaps the stock theme leaves open, plus a measured performance diagnosis
of a public production store.

Store: `dac-dev-store.myshopify.com` (development store, password-protected).
Theme validated with Shopify's own `theme check` and pushed with the Shopify CLI.

---

## What is in here

### 1. `snippets/seo-breadcrumb-jsonld.liquid`

BreadcrumbList structured data, which the theme emits nowhere. Product,
Organization and WebSite schema were already present; BreadcrumbList was missing,
and it is the one Google renders **inside the result**, replacing the raw URL path
with `Store > Collection > Product`.

Three decisions worth reading the file for:

- **The middle crumb comes from `collection`, not from the URL.** Shopify serves
  the same product at `/products/x` and `/collections/y/products/x`, and only the
  second knows which collection the visitor came through. `collection` is set on
  that route and nil on the bare product URL, so the crumb appears exactly when it
  is true. Deriving a category from the handle would produce structured data that
  contradicts the page, which is worse than none.
- **Absolute URLs via `request.origin`.** Google drops a relative `item`, and
  hardcoding a domain rots the moment the theme is previewed elsewhere.
- **Every value goes through `| json`.** A product title containing an inch mark,
  which in a technical catalogue is routine, otherwise produces invalid JSON and
  takes the whole block down.

A bug `theme check` caught in the first version, worth knowing: the home crumb used
`'general.breadcrumbs.home' | t | default: 'Home'`, and that key does not exist in
the theme's locales. **The `default` filter does not save you**, because a missing
translation renders the literal string `Translation missing: en.general...`, which
is not blank, so `default` never fires. Google would have been served that text as
the breadcrumb name on every page. It now uses `shop.name`, which needs no locale
file and matches the Organization node the theme already emits.

### 2. `sections/product-spec-table.liquid`

A metafield-driven specification table for catalogues where the specs matter:
purity, particle size, dimensions, tolerance, connector.

The usual approach pastes specs into the product description as an HTML blob,
which cannot be filtered, compared, exported, or marked up, because it is prose.
This renders whatever lives in a metafield namespace, so **adding a spec needs no
theme change**, and optionally emits the same specs as `additionalProperty` on the
existing Product schema rather than declaring a second Product node, which is a
common way to lose a rich result.

The Liquid detail that bites everyone: iterating a metafield namespace yields
`[key, metafield]` pairs where the second item is a **Metafield drop, not a
string**. Printing it directly works for text fields and prints an object for a
dimension or a rating, so the value goes through a `case` on `field.type`. It looks
correct until the day someone adds a typed field.

Renders nothing at all when the namespace is empty, so it can sit in the default
product template without leaving an orphan heading on products that have no specs.

### 3. `perf/` — a measured diagnosis, not an opinion

Lighthouse against a **public production Shopify store**, mobile emulation,
simulated throttling (150 ms RTT, 1.6 Mbps, 4x CPU slowdown):

| Metric | Value |
|---|---|
| Performance score | 39 |
| LCP | 43.0 s |
| TBT | 870 ms |
| CLS | 0.062 (the one thing that is fine) |
| Requests | 500 |
| Transferred | 5,921 KB |
| Scripts | 135 requests, 3,263 KB |
| Third party | 175 requests, 3,896 KB |
| Unused JavaScript | 1,368 KB, 8.3 s estimated saving |
| Main-thread script evaluation | 5,441 ms |

The diagnosis those numbers support: **two thirds of the transferred weight is
third-party**, and 5.4 seconds of main-thread script evaluation is what pushes LCP
out, so the win is not image compression, it is auditing which apps still earn
their script tag. CLS being fine matters too, because it means the layout is not
the problem and effort spent there would be wasted.

Stated honestly: these are **lab** figures under Lighthouse's mobile preset, not
field data from real users. Field data would come from CrUX or a `web-vitals`
beacon, and lab numbers under 4x CPU throttling are deliberately pessimistic.

---

## Verifying it

```bash
shopify theme check                     # my two files: zero offenses
shopify theme push --unpublished        # pushed to the dev store
```

`theme check` reports 49 remaining offenses across 45 files. **All of them are
pre-existing in the stock theme**, none in the two files added here.

The rendered output on the storefront is not verified here, and that is a real
limitation rather than an omission: the development store is password-protected,
`theme dev` and `theme share` both sit behind that password, and no Admin API
mutation exists to lift it. Rendering verification needs the storefront password
entered by hand.
