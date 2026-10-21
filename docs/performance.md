# Performance tooling and the original diagnosis

*Reference for the `perf/` scripts and the Lighthouse diagnosis. The overview is in the [README](../README.md).*

## 3. `perf/`: measurement tooling, and one thing that did not work

**`perf/app-cost.mjs` is the useful one.** It attributes bytes and main-thread time
to each third-party origin on a page, which turns "optimize Core Web Vitals" into a
list sorted by cost. Run against a public Shopify storefront it produced this (the raw
reports are not committed, because they name that store; rerun the script against
any public product page to reproduce the method):

| Origin | KB | CPU ms |
|---|---|---|
| googletagmanager.com | 1,985 | 206 |
| the store itself | 2,119 | 166 |
| scripts.clarity.ms | 73 | 106 |
| powr.io | 50 | 56 |
| klaviyo (5 origins) | 142 | 35 |

Third party came to **3,697 KB and 457 ms of CPU against the store's own 166 ms**,
64% of the bytes on the page. One tag manager container was 1,985 KB.

It separates Shopify's own platform scripts and the store's own files on Shopify's CDN from apps (matched by URL, so they are not counted as a third-party origin), because counting the
platform as app cost inflates every number and points a merchant at savings they
cannot have. The app-cost figures quoted in this section come from the first version of the tool, which grouped requests by origin only and so counted some Shopify CDN requests as third party: read them as an upper bound. It deliberately does not recommend removals: whether a review widget
earns 800 KB is a revenue question, not a bytes question.

**`perf/audit.mjs`** runs Lighthouse against a password-gated development store,
which a plain `npx lighthouse` cannot do: the store 302s to /password and you end
up auditing a login form and reporting a lovely score for it. It logs in INSIDE the
browser Lighthouse drives (an earlier version forwarded a cookie header from another
browser, which Shopify's redirects defeated, and scored the password page: 7 requests and
82 KB for a page that really makes about 140), clears the cache between runs, and refuses
any run that did not end on the page it was asked for. It also runs N times and
reports the median, because a single run varies by several points and a
before/after built from one run each can show a win that is entirely noise.

### What I tried and threw away

I attempted a synthetic before/after: simulate a typical app-laden store, apply
deferral and interaction-loading, measure the difference. **It produced three
mutually inconsistent results and I deleted it**, because a number I cannot account
for is worse than no number.

The three reasons it failed are each worth knowing:

1. **A snippet I had gitignored never reached the store on push.** I did not isolate
   whether `.gitignore` or the CLI's own exclusions did it, and Liquid renders a MISSING
   snippet as empty **with no error**, so the feature silently does not exist while
   the page looks fine.
2. **Theme JS assets came back minified.** A 700 KB payload padded with comments
   arrived as **286 bytes**, so the first run measured nothing at all.
3. **Storefront HTML is CDN-cached and a cache-busting query parameter does not
   reliably bust it.** After pushing a change, the live page still served the old
   markup, so two variants measured the same cached page twice.

Also worth recording: **Liquid cannot read query parameters.** `request` has no
query object, and while `content_for_header` contains the full URL in the served
HTML, matching it at render time did not work either. Both failures were silent.

## 4. The original diagnosis

Lighthouse against a **public Shopify storefront**, mobile emulation,
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
third-party**, and 5.4 seconds of main-thread script evaluation is the largest itemised component of main-thread work in the
table (images are not itemised), so the first job is auditing which apps still earn
their script tag, not image compression. CLS being fine matters too, because it means the layout is not
the problem and effort spent there would be wasted.

Stated honestly: these are **lab** figures under Lighthouse's mobile preset, not
field data from real users. Field data would come from CrUX or a `web-vitals`
beacon, and lab numbers under 4x CPU throttling are deliberately pessimistic.
