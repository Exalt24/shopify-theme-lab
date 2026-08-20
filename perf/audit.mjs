/**
 * Lighthouse against a PASSWORD-GATED Shopify development store.
 *
 * WHY THIS IS NOT JUST `npx lighthouse <url>`. A dev store 302s every request to
 * /password, so a plain Lighthouse run audits the password page and reports a
 * beautiful score for a form with no content on it. That is worse than no
 * measurement, because it looks like data.
 *
 * The fix: log in with Playwright, take the `storefront_digest` cookie the password
 * form sets, and hand it to Lighthouse as a request header. Lighthouse then loads
 * the real storefront.
 *
 * It also runs the audit N times and reports the MEDIAN. A single Lighthouse run on
 * a shared laptop varies by several points between identical runs, so a before and
 * after built from one run each can show an improvement that is entirely noise.
 * Comparing medians is the cheapest defence against reporting a win that is not
 * there.
 *
 *   node perf/audit.mjs <url> <password> <label> [runs]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Dax/AppData/Roaming/npm/node_modules/playwright');
const lighthouse = (await import('lighthouse')).default;

const [, , URL_ARG, PASSWORD, LABEL, RUNS_ARG] = process.argv;
const RUNS = Number(RUNS_ARG || 3);

if (!URL_ARG || !LABEL) {
  console.error('usage: node perf/audit.mjs <url> <password> <label> [runs]');
  process.exit(1);
}

async function storefrontCookie() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const origin = new URL(URL_ARG).origin;
  await page.goto(`${origin}/password`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.$('input[type="password"]')) {
    await page.fill('input[type="password"]', PASSWORD);
    await page.press('input[type="password"]', 'Enter');
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  const cookies = await ctx.cookies();
  await browser.close();
  // Send the WHOLE jar, not one named cookie. Shopify used to gate the storefront
  // with storefront_digest and now carries the session in _shopify_essential, so
  // hunting a specific name breaks silently the next time they rename it: the
  // audit then runs against the password page and reports a lovely score for a
  // form with nothing on it.
  if (!cookies.length) throw new Error('no cookies at all; the password did not take');
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

function metrics(lhr) {
  const a = lhr.audits;
  return {
    score: Math.round(lhr.categories.performance.score * 100),
    lcp_ms: Math.round(a['largest-contentful-paint'].numericValue),
    fcp_ms: Math.round(a['first-contentful-paint'].numericValue),
    tbt_ms: Math.round(a['total-blocking-time'].numericValue),
    cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
    si_ms: Math.round(a['speed-index'].numericValue),
    requests: (a['network-requests'].details?.items ?? []).length,
    transfer_kb: Math.round(
      (a['network-requests'].details?.items ?? [])
        .reduce((n, i) => n + (i.transferSize ?? 0), 0) / 1024,
    ),
    script_eval_ms: Math.round(
      (a['mainthread-work-breakdown'].details?.items ?? [])
        .filter((i) => /script/i.test(i.groupLabel ?? ''))
        .reduce((n, i) => n + i.duration, 0),
    ),
    unused_js_kb: Math.round(
      (a['unused-javascript']?.details?.overallSavingsBytes ?? 0) / 1024,
    ),
  };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const cookie = await storefrontCookie();
console.log('logged in, auditing', URL_ARG);

const browser = await chromium.launch({
  headless: true,
  args: ['--remote-debugging-port=9222', '--no-sandbox'],
});

const runs = [];
for (let i = 0; i < RUNS; i += 1) {
  const result = await lighthouse(URL_ARG, {
    port: 9222,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2 },
    throttlingMethod: 'simulate',
    extraHeaders: { Cookie: cookie },
  });
  const m = metrics(result.lhr);
  runs.push(m);
  console.log(`  run ${i + 1}: score ${m.score}  lcp ${m.lcp_ms}ms  tbt ${m.tbt_ms}ms  ${m.transfer_kb}KB`);
}

await browser.close();

const summary = {};
for (const key of Object.keys(runs[0])) {
  summary[key] = median(runs.map((r) => r[key]));
}

mkdirSync('perf', { recursive: true });
const out = `perf/${LABEL}.json`;
writeFileSync(out, JSON.stringify({ url: URL_ARG, label: LABEL, runs, median: summary }, null, 2));

console.log('\nMEDIAN of', RUNS, 'runs');
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(16)} ${v}`);
console.log('written to', out);
