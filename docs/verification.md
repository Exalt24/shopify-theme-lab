# Verifying it

*The theme check and push commands, the offense counts, and the earlier browser checks. The overview is in the [README](../README.md).*

```bash
shopify theme check                     # none of the default-config offenses on stock Dawn v9.0.0 are in the sale sections' files
shopify theme push --unpublished        # pushed to the dev store
```

`theme check` on the spec table and breadcrumb additions reported 48 remaining offenses across 44 files (an earlier run, configuration not recorded), all pre-existing in the stock
theme. Re-run on 2026-10-12 with every check enabled and the sale sections added, the whole theme reported 495 offenses on the dev store's own theme (the default configuration reports far fewer; an independent overlay on stock Dawn v9.0.0 gave 16 by default and 500 with every check on): 480 are
`MatchingTranslations` (450 are the 15 keys of the sale sections, present only in `en.default.json` and not in the 30 other
locale files, 30 are one key the dev theme's product section uses, `products.product.selling_plans.one_time_purchase`) and the rest are in stock Dawn or in the edited and added files named below. The sale sections' own files report 0. Three of the 16 offenses an overlay on bare Dawn v9.0.0 reports are in the tracked `sections/main-product.liquid` (the dev theme's edited copy, which differs from stock v9.0.0 by a `type="module"` attribute, a render of `snippets/selling-plans.liquid` with its script tag, the structured-data block described below, and a commented-out `selling-plan-docs.js` script tag): the first two come from the selling-plans files that are not tracked here (the dev store has them), and the third, `UndefinedObject 'continue'`, is in stock Dawn's own code. The older `snippets/seo-breadcrumb-jsonld.liquid` reports one `OrphanedSnippet` when the repo is overlaid on stock Dawn, because the layout that would render it is not tracked here: it is rendered from `layout/theme.liquid` (`{% render 'seo-breadcrumb-jsonld' %}` inside `<head>`).

Earlier verification (done on the dev store at the time and not committed; the dev store no longer carries spec metafields): the rendered output was checked in a real browser at 1280px and 390px: the spec
table renders as a `dl` with real metafield values, the breadcrumb emits a valid
two-item trail on a product page and nothing at all on the home page, exactly one
Product node carries the specs, and there is no horizontal overflow or console
error at either width.

It needed the storefront password, entered by hand at the time (the store check later scripted the sign-in), because a development store
gates everything: `theme dev`, `theme share` and the preview URL all sit behind
it and no Admin API mutation exists to lift it.

**A linter is not a validator.** With the `theme check` version I had at the time, it passed a file that `theme push`
then rejected outright, because Liquid does not allow a filter inside an `if`
condition (the current CLI's `theme check` does report that case). The rejected file silently stayed at its previous version on the
store, so the browser check kept showing the old output and it looked like the
fix had not worked.
