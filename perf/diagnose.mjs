/**
 * What is the LCP element, and what is delaying it?
 *
 * Optimising before answering that is guesswork. Lighthouse already knows: it
 * names the element and breaks the LCP into its four phases, and the phase that
 * dominates decides the fix. Time to first byte is a hosting problem, load delay
 * is a discovery problem (the browser found the image late), load time is a size
 * problem, and render delay is a main-thread problem. They have four different
 * remedies and only one of them is "compress the image".
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Dax/AppData/Roaming/npm/node_modules/playwright');
const lighthouse = (await import('lighthouse')).default;

const [, , URL_ARG, PASSWORD] = process.argv;

const b0 = await chromium.launch({ headless: true });
const ctx = await b0.newContext();
const page = await ctx.newPage();
const origin = new URL(URL_ARG).origin;
await page.goto(`${origin}/password`, { waitUntil: 'domcontentloaded', timeout: 60000 });
if (await page.$('input[type="password"]')) {
  await page.fill('input[type="password"]', PASSWORD);
  await page.press('input[type="password"]', 'Enter');
  await page.waitForLoadState('networkidle').catch(() => {});
}
const cookies = await ctx.cookies();
await b0.close();
const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

const browser = await chromium.launch({
  headless: true,
  args: ['--remote-debugging-port=9223', '--no-sandbox'],
});

const { lhr } = await lighthouse(URL_ARG, {
  port: 9223,
  output: 'json',
  logLevel: 'error',
  onlyCategories: ['performance'],
  formFactor: 'mobile',
  screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2 },
  throttlingMethod: 'simulate',
  extraHeaders: { Cookie: cookie },
});
await browser.close();

const a = lhr.audits;

console.log('=== LCP element ===');
for (const item of a['largest-contentful-paint-element']?.details?.items ?? []) {
  for (const sub of item.items ?? []) {
    if (sub.node) console.log('  ', (sub.node.snippet || '').slice(0, 160));
  }
  // The phase table is the second sub-table.
  for (const sub of item.items ?? []) {
    if (sub.phase) console.log(`   phase ${sub.phase}: ${Math.round(sub.timing)} ms`);
  }
}

console.log('\n=== render-blocking resources ===');
for (const i of a['render-blocking-resources']?.details?.items ?? []) {
  console.log(`   ${Math.round(i.wastedMs)} ms  ${Math.round((i.totalBytes || 0) / 1024)} KB  ${String(i.url).slice(0, 90)}`);
}

console.log('\n=== biggest scripts by transfer ===');
const reqs = a['network-requests']?.details?.items ?? [];
reqs.filter((r) => r.resourceType === 'Script')
  .sort((x, y) => (y.transferSize || 0) - (x.transferSize || 0))
  .slice(0, 8)
  .forEach((r) => console.log(`   ${Math.round((r.transferSize || 0) / 1024)} KB  ${String(r.url).slice(0, 90)}`));

console.log('\n=== third party, by main-thread blocking ===');
for (const i of (a['third-party-summary']?.details?.items ?? []).slice(0, 8)) {
  const name = typeof i.entity === 'object' ? i.entity.text : i.entity;
  console.log(`   ${Math.round(i.blockingTime || 0)} ms blocking  ${Math.round((i.transferSize || 0) / 1024)} KB  ${name}`);
}

console.log('\n=== opportunities ===');
for (const [key, audit] of Object.entries(a)) {
  const ms = audit?.details?.overallSavingsMs ?? 0;
  const by = audit?.details?.overallSavingsBytes ?? 0;
  if (ms > 50 || by > 20000) {
    console.log(`   ${Math.round(ms)} ms  ${Math.round(by / 1024)} KB  ${audit.title.slice(0, 70)}`);
  }
}
