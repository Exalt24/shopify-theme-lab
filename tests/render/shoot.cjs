// Screenshots preview/index.html at phone and laptop widths with a fixed clock, for reading and for the README.
//   PLAYWRIGHT_PATH=... node tests/render/shoot.cjs [outdir]
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'preview'));
const URL = 'file:///' + path.resolve(__dirname, '..', '..', 'preview', 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  for (const [name, width, height] of [['phone-390', 390, 844], ['laptop-1280', 1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'Asia/Manila', locale: 'en-US', deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-11-20T01:00:00Z') });
    await page.goto(URL);
    await page.evaluate(() => document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; }));
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
    await page.clock.runFor(1500);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    const info = await page.evaluate(() => ({
      label: document.querySelector('[data-ends-label]').textContent.trim(),
      local: document.querySelector('[data-ends-local]').hidden ? '(hidden)' : document.querySelector('[data-ends-local]').textContent.trim(),
      timer: ['d', 'h', 'm', 's'].map((u) => document.querySelector(`[data-unit="${u}"]`).textContent).join(':'),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      h1: document.querySelectorAll('h1').length,
    }));
    console.log(name, JSON.stringify(info));
    await ctx.close();
  }
  await browser.close();
})();
