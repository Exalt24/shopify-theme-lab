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
theme change**, and groups rows under headings from a `prefix__key` convention so
an existing catalogue needs no migration to keep working.

The specs reach structured data through the theme's **own** Product node in
`sections/main-product.liquid`, not a second one. The first version emitted its own
`{"@type":"Product","@id":"...#product","additionalProperty":[...]}` on the belief
that Google merges nodes sharing an `@id`. **The theme's real Product node has no
`@id` at all**, so nothing matched and the page shipped two Product entities, the
second with no `name`, which is the single field Product requires. The live page
confirmed it before the fix: `Product nodes on page: 2`.

Two more bugs worth knowing, both of which looked fine until they did not:

- **Liquid compares `false` equal to `blank`.** A `{% if field.value != blank %}`
  guard therefore dropped every boolean spec whose value was false, and the "No"
  branch was unreachable. On a technical catalogue, "Hazardous: No" is the row that
  most needs to be there.
- **The JSON-LD serialised raw values** while the visible HTML went through a type
  switch, so exactly the types the switch existed to protect against reached
  structured data as Shopify objects like `{"value":12.0,"unit":"MILLIMETERS"}`.
  Both paths now share `snippets/spec-value.liquid`, so they cannot disagree again.

### Layout came from reading five real PDPs, not from taste

Captured at 1440px and 390px: DigiKey, Edmund Optics, Fisher Scientific,
McMaster-Carr, and MSE Supplies itself.

- **The pair stays side by side at every width.** McMaster holds a 38/62 split at
  374px. Stacking on mobile, which this did under 480px, turns a 20-spec table into
  a 40-row scroll on the device where scanning is hardest. Measured effect of the
  fix: the block went from 365px tall to 212px at 390px.
- **The value carries the contrast, not the label.** McMaster and Edmund disagree
  about how to treat the label and agree completely on this. Mine was backwards.
  The value now uses the theme's own `--color-foreground` variable rather than a
  hardcoded hex, so a merchant's colour scheme still works.
- **The list is capped to a readable measure.** Fisher runs a 296px label inside a
  651px container. Uncapped, this grid put the value 350px from its own label at
  1280px and read as two unrelated columns.
- **Nothing truncates.** McMaster renders 31 rows with no show-more; Fisher is the
  only site in the set that collapses, and it hides Percent Purity behind a click
  on a purity-driven product.

**Deliberately not copied:** DigiKey's four-column zebra grid. Two independent
pairs per row means a screen reader linearises unrelated specs into one sequence.

**Kept against all five references: the `<dl>`.** Not one of them uses one, and not
one associates a header cell, so a screen reader on DigiKey, Edmund, Fisher and
McMaster hears a value with no idea which column was the name. Being more correct
than the references is the right call when they are all wrong the same way.

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

`theme check` reports 48 remaining offenses across 44 files. **All of them are
pre-existing in the stock theme**, none in the four files added or edited here.

The rendered output IS verified, in a real browser at 1280px and 390px: the spec
table renders as a `dl` with real metafield values, the breadcrumb emits a valid
two-item trail on a product page and nothing at all on the home page, exactly one
Product node carries the specs, and there is no horizontal overflow or console
error at either width.

It needed the storefront password entered by hand, because a development store
gates everything: `theme dev`, `theme share` and the preview URL all sit behind
it and no Admin API mutation exists to lift it.

**A linter is not a validator.** `theme check` passed a file that `theme push`
then rejected outright, because Liquid does not allow a filter inside an `if`
condition. The rejected file silently stayed at its previous version on the
store, so the browser check kept showing the old output and it looked like the
fix had not worked.
