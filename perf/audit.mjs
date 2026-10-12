/**
 * Lighthouse against a PASSWORD-GATED Shopify development store.
 *
 * WHY THIS IS NOT JUST `npx lighthouse <url>`. A dev store 302s every request to
 * /password, so a plain Lighthouse run audits the password page and reports a
 * beautiful score for a form with no content on it. That is worse than no
 * measurement, because it looks like data.
 *
 * The fix: log in INSIDE the browser Lighthouse drives (a persistent Playwright profile
 * with a debugging port) and tell Lighthouse not to wipe storage, so it loads the real
 * storefront. An earlier version forwarded a cookie header from another browser; Shopify's
 * redirects defeated it and it scored the password page. Each run clears the cache (cookies
 * stay) and any run that does not end on the requested page is refused.
 *
 * It also runs the audit N times and reports the MEDIAN. A single Lighthouse run on
 * a shared laptop varies by several points between identical runs, so a before and
 * after built from one run each can show an improvement that is entirely noise.
 * Comparing medians is the cheapest defence against reporting a win that is not
 * there.
 *
 *   STORE_PASSWORD=<password> node perf/audit.mjs <url> <label> [runs]
 *
 * The password comes from the environment, not an argument, so it is not in the process list. An inline `VAR=value` before the command can still be recorded by a shell's history: export it from a secrets file or a prompt instead.
 */
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const lighthouse = (await import('lighthouse')).default;

const [, , URL_ARG, LABEL, RUNS_ARG] = process.argv;
const PASSWORD = process.env.STORE_PASSWORD;
const RUNS = Number(RUNS_ARG || 3);

if (!URL_ARG || !LABEL || !PASSWORD) {
  console.error('usage: STORE_PASSWORD=<password> node perf/audit.mjs <url> <label> [runs]');
  process.exit(1);
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

// Log in INSIDE the browser Lighthouse will drive, and tell Lighthouse not to wipe storage. Forwarding the cookie as an
// extra header from another browser does not survive Shopify's redirects: the audit then lands on /password and scores
// a form (found 2026-10-12: 7 requests and 82 KB for a page that really makes about 140 requests).
const profile = mkdtempSync(path.join(tmpdir(), 'lh-profile-'));
const browser = await chromium.launchPersistentContext(profile, {
  headless: true,
  args: ['--remote-debugging-port=9222', '--no-sandbox'],
});
let loginPage;
{
  const page = await browser.newPage();
  loginPage = page;
  const origin = new URL(URL_ARG).origin;
  await page.goto(`${origin}/password`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.$('input[type="password"]')) {
    await page.fill('input[type="password"]', PASSWORD);
    await page.press('input[type="password"]', 'Enter');
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  if (new URL(page.url()).pathname.includes('password')) throw new Error('the storefront password was not accepted');
  console.log('logged in, auditing', URL_ARG);
}

const runs = [];
for (let i = 0; i < RUNS; i += 1) {
  // Cold cache every run (cookies stay): a warm second run would report a page nobody sees on a first visit.
  const cdp = await browser.newCDPSession(loginPage);
  await cdp.send('Network.clearBrowserCache');
  await cdp.detach();
  const result = await lighthouse(URL_ARG, {
    port: 9222,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2 },
    throttlingMethod: 'simulate',
    disableStorageReset: true,
  });
  // A score for the password form is worse than no score: refuse a run that did not end on the page asked for.
  const landed = result.lhr.finalDisplayedUrl || result.lhr.finalUrl || '';
  if (/\/password/.test(landed) || !new URL(landed).pathname.startsWith(new URL(URL_ARG).pathname)) {
    throw new Error(`the audit landed on ${landed}, not ${URL_ARG}: the password did not carry into Lighthouse`);
  }
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
