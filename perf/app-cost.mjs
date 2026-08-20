/**
 * What does each app on a Shopify store actually COST?
 *
 * "Optimize Core Web Vitals" is not a task anyone can start. "This app costs you
 * 1.2 seconds of main-thread time and 800 KB, and it is a review widget on a page
 * with no reviews" is. This attributes bytes and blocking time to each third-party
 * origin, which turns an app audit from an argument about taste into a list sorted
 * by cost.
 *
 * WHY BY ORIGIN AND NOT BY LIGHTHOUSE'S ENTITY LIST. Lighthouse groups by known
 * entity and lumps everything it does not recognise into nothing at all, and the
 * unrecognised ones are precisely the small Shopify apps that a merchant has
 * accumulated. Grouping by origin catches all of them, at the cost of splitting a
 * vendor across two CDNs, which is the better trade when the question is "what can
 * we remove".
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: recommend removals. Whether a review widget
 * earns 800 KB is a merchant decision about revenue, not a developer decision about
 * bytes. The tool produces the number; the conversation is theirs.
 *
 *   node perf/app-cost.mjs <url> [password]
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Dax/AppData/Roaming/npm/node_modules/playwright');

const [, , URL_ARG, PASSWORD] = process.argv;
if (!URL_ARG) {
  console.error('usage: node perf/app-cost.mjs <url> [password]');
  process.exit(1);
}

const origin = new URL(URL_ARG).origin;
const host = new URL(URL_ARG).hostname;

/** Shopify's own platform code, which a theme developer cannot remove. Separating
 *  it matters: counting it as "app cost" inflates every number and points the
 *  merchant at savings that are not available to them. */
const PLATFORM = [
  /cdn\.shopify\.com\/shopifycloud/,
  /\/cdn\/shopifycloud\//,
  /\/cdn\/wpm\//,
  /trekkie\.storefront/,
  /shopify-perf-kit/,
  /\/cdn\/s\/javascripts\//,
  /monorail-edge\.shopifysvc\.com/,
  /shopifycloud\/portable-wallets/,
  /storefront\/standard-actions/,
];

const isPlatform = (u) => PLATFORM.some((re) => re.test(u));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) '
    + 'Chrome/124.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();

if (PASSWORD) {
  await page.goto(`${origin}/password`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.$('input[type="password"]')) {
    await page.fill('input[type="password"]', PASSWORD);
    await page.press('input[type="password"]', 'Enter');
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}

const byOrigin = new Map();

page.on('response', async (res) => {
  try {
    const url = res.url();
    if (url.startsWith('data:')) return;
    const o = new URL(url).origin;
    const type = res.request().resourceType();
    let size = 0;
    try {
      const h = await res.allHeaders();
      size = Number(h['content-length'] || 0);
      if (!size) size = (await res.body().catch(() => Buffer.alloc(0))).length;
    } catch { /* a redirect or an aborted request has no body */ }

    const rec = byOrigin.get(o) || { origin: o, bytes: 0, requests: 0, scripts: 0, scriptBytes: 0 };
    rec.bytes += size;
    rec.requests += 1;
    if (type === 'script') {
      rec.scripts += 1;
      rec.scriptBytes += size;
    }
    byOrigin.set(o, rec);
  } catch { /* ignore anything unparseable */ }
});

const client = await ctx.newCDPSession(page);
await client.send('Profiler.enable');
await client.send('Profiler.start');

await page.goto(URL_ARG, { waitUntil: 'load', timeout: 120000 });
// Let deferred and idle-loaded app scripts arrive: most apps inject after load,
// which is exactly why a naive measurement at DOMContentLoaded misses them.
await page.waitForTimeout(6000);

const profile = await client.send('Profiler.stop');

/** Attribute self-time to the script URL each frame came from. */
const selfTimeByUrl = new Map();
const nodes = new Map();
for (const n of profile.profile.nodes) nodes.set(n.id, n);
const total = profile.profile.timeDeltas ?? [];
const samples = profile.profile.samples ?? [];
for (let i = 0; i < samples.length; i += 1) {
  const node = nodes.get(samples[i]);
  if (!node) continue;
  const url = node.callFrame?.url || '';
  if (!url || url.startsWith('extensions::')) continue;
  const dt = (total[i] || 0) / 1000; // microseconds to milliseconds
  selfTimeByUrl.set(url, (selfTimeByUrl.get(url) || 0) + dt);
}

const cpuByOrigin = new Map();
for (const [url, ms] of selfTimeByUrl) {
  try {
    const o = new URL(url).origin;
    cpuByOrigin.set(o, (cpuByOrigin.get(o) || 0) + ms);
  } catch { /* inline script, no URL */ }
}

await browser.close();

const rows = [...byOrigin.values()].map((r) => ({
  ...r,
  cpu_ms: Math.round(cpuByOrigin.get(r.origin) || 0),
  kb: Math.round(r.bytes / 1024),
  script_kb: Math.round(r.scriptBytes / 1024),
  kind: r.origin.includes(host) || isPlatform(r.origin) ? 'store/platform' : 'third party',
}));

// Anything served from the shop's own domain still needs splitting: Shopify's
// platform scripts are served from the shop domain too, so a domain check alone
// credits the merchant with cost they cannot remove.
const platformSelf = [...selfTimeByUrl.entries()].filter(([u]) => isPlatform(u));
const platformCpu = Math.round(platformSelf.reduce((n, [, ms]) => n + ms, 0));

rows.sort((a, b) => b.cpu_ms - a.cpu_ms || b.kb - a.kb);

console.log(`\n${URL_ARG}\n`);
console.log('ORIGIN'.padEnd(46), 'REQ'.padStart(5), 'KB'.padStart(8), 'SCRIPT KB'.padStart(10), 'CPU ms'.padStart(8), ' KIND');
for (const r of rows.filter((x) => x.kb > 0 || x.cpu_ms > 0).slice(0, 22)) {
  console.log(
    r.origin.replace('https://', '').slice(0, 46).padEnd(46),
    String(r.requests).padStart(5),
    String(r.kb).padStart(8),
    String(r.script_kb).padStart(10),
    String(r.cpu_ms).padStart(8),
    ' ' + r.kind,
  );
}

const third = rows.filter((r) => r.kind === 'third party');
const own = rows.filter((r) => r.kind !== 'third party');
const sum = (xs, k) => xs.reduce((n, x) => n + x[k], 0);

console.log('\nSUMMARY');
console.log('  store and Shopify platform :', sum(own, 'kb'), 'KB,', sum(own, 'cpu_ms'), 'ms CPU');
console.log('  third-party apps           :', sum(third, 'kb'), 'KB,', sum(third, 'cpu_ms'), 'ms CPU');
console.log('  Shopify platform CPU alone :', platformCpu, 'ms (not removable by a theme change)');
const totalKb = sum(rows, 'kb');
console.log('  third party as a share     :',
  totalKb ? Math.round((100 * sum(third, 'kb')) / totalKb) + '% of bytes' : 'n/a');

writeFileSync(
  `perf/app-cost-${host.replace(/\W+/g, '-')}.json`,
  JSON.stringify({ url: URL_ARG, rows, platformCpu }, null, 2),
);
console.log(`\nwritten to perf/app-cost-${host.replace(/\W+/g, '-')}.json`);
