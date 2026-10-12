// Tests for assets/sale-countdown.js, run in a real Chromium with a controlled clock.
//   node tests/countdown.test.cjs                 tests the real asset
//   COUNTDOWN_JS=<path> node tests/countdown.test.cjs   tests another copy (used by countdown_mutants.cjs)
// The markup below is what sections/sale-event-hero.liquid renders for the countdown block.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const JS = path.resolve(process.env.COUNTDOWN_JS || path.join(__dirname, '..', 'assets', 'sale-countdown.js'));

function markup(attrs) {
  const a = Object.entries({
    'data-state': 'pending',
    'data-ends-template': 'Sale ends __DATE__',
    'data-local-template': 'That is __DATE__ where you are.',
    ...attrs,
  })
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ');
  return `<sale-countdown id="c" ${a}>
    <p data-ends-label>static fallback</p>
    <ul role="timer">
      <li><span data-unit="d">00</span></li><li><span data-unit="h">00</span></li>
      <li><span data-unit="m">00</span></li><li><span data-unit="s">00</span></li>
    </ul>
    <p data-ends-local hidden></p>
    <p data-ended hidden>Sale over</p>
  </sale-countdown>`;
}

async function boot(browser, now, attrs, opts = {}) {
  const ctx = await browser.newContext({ timezoneId: opts.tz || 'UTC', locale: 'en-US' });
  const page = await ctx.newPage();
  // install() lets the clock run, so pause it exactly at `now` before anything reads the time.
  await page.clock.install({ time: new Date(new Date(now).getTime() - 5000) });
  await page.clock.pauseAt(new Date(now));
  await page.setContent(`<!doctype html><html><body>${markup(attrs)}</body></html>`);
  await page.evaluate(() => {
    const si = window.setInterval, ci = window.clearInterval;
    window.__active = new Set();
    window.setInterval = (...a) => { const id = si(...a); window.__active.add(id); return id; };
    window.clearInterval = (id) => { window.__active.delete(id); return ci(id); };
  });
  await page.addScriptTag({ path: JS });
  return { ctx, page };
}

const read = (page) =>
  page.evaluate(() => {
    const c = document.getElementById('c');
    const t = (u) => c.querySelector(`[data-unit="${u}"]`).textContent;
    return {
      state: c.dataset.state,
      d: t('d'), h: t('h'), m: t('m'), s: t('s'),
      label: c.querySelector('[data-ends-label]').textContent,
      labelHidden: c.querySelector('[data-ends-label]').hidden,
      local: c.querySelector('[data-ends-local]').textContent,
      localHidden: c.querySelector('[data-ends-local]').hidden,
      endedHidden: c.querySelector('[data-ended]').hidden,
      active: window.__active.size,
    };
  });

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([name, true, '']);
  } catch (e) {
    results.push([name, false, e.message.split('\n')[0]]);
  }
}
const eq = (got, want, what) => {
  if (got !== want) throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const NOV27_END = { 'data-ends-at': '2026-11-27 23:59', 'data-offset': '-05:00' }; // = 2026-11-28T04:59:00Z

  await check('offset maths: 24h before the end reads 01 00 00 00', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', NOV27_END);
    const r = await read(page);
    eq(r.state, 'running', 'state'); eq(r.d + r.h + r.m + r.s, '01000000', 'units');
    await ctx.close();
  });

  await check('a different zone offset moves the end (the offset is not ignored)', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', { ...NOV27_END, 'data-offset': '+08:00' });
    const r = await read(page);
    // 2026-11-27 23:59 at UTC+08:00 is 15:59Z, exactly 11 hours after 04:59Z.
    eq(r.d + r.h + r.m + r.s, '00110000', 'units for UTC+08:00');
    await ctx.close();
  });

  await check('one second later the display ticks to 00 23 59 59', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:01Z', NOV27_END);
    const a = await read(page);
    eq(a.d + a.h + a.m + a.s, '00235959', 'units after 1s');
    await ctx.close();
  });

  await check('the interval keeps ticking: +1s on the fake clock moves seconds down', async () => {
    const { ctx, page } = await boot(browser, '2026-11-28T04:58:00Z', NOV27_END);
    const a = await read(page);
    eq(a.m + a.s, '0100', 'start 1 minute left');
    await page.clock.runFor(1000);
    const b = await read(page);
    eq(b.m + b.s, '0059', 'after 1s');
    await ctx.close();
  });

  await check('at the end the state flips to ended, message shown, labels hidden, timer cleared', async () => {
    const { ctx, page } = await boot(browser, '2026-11-28T04:58:59Z', NOV27_END);
    await page.clock.runFor(2000);
    const r = await read(page);
    eq(r.state, 'ended', 'state'); eq(r.endedHidden, false, 'ended message visible');
    eq(r.labelHidden, true, 'ends label hidden'); eq(r.active, 0, 'active timers');
    await ctx.close();
  });

  await check('already past on load: ended straight away, no timer started', async () => {
    const { ctx, page } = await boot(browser, '2026-12-01T00:00:00Z', NOV27_END);
    const r = await read(page);
    eq(r.state, 'ended', 'state'); eq(r.active, 0, 'active timers');
    await ctx.close();
  });

  await check('a bad date degrades to the static text: state invalid, no timer', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T00:00:00Z', { 'data-ends-at': 'tomorrow evening', 'data-offset': '-05:00' });
    const r = await read(page);
    eq(r.state, 'invalid', 'state'); eq(r.label, 'static fallback', 'label untouched'); eq(r.active, 0, 'active timers');
    await ctx.close();
  });

  await check('a bad offset also degrades instead of guessing a zone', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T00:00:00Z', { 'data-ends-at': '2026-11-27 23:59', 'data-offset': 'EST' });
    eq((await read(page)).state, 'invalid', 'state');
    await ctx.close();
  });

  await check('an offset without the colon is refused, because browsers disagree about parsing it', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T00:00:00Z', { 'data-ends-at': '2026-11-27 23:59', 'data-offset': '-0500' });
    eq((await read(page)).state, 'invalid', 'state');
    await ctx.close();
  });

  await check('the collection metafield instant (UTC) wins over the typed time', async () => {
    const { ctx, page } = await boot(browser, '2026-11-28T03:59:00Z', { ...NOV27_END, 'data-ends-at-utc': '2026-12-25T00:00:00Z' });
    const r = await read(page);
    eq(r.d, '26', 'days to Dec 25 from Nov 28 03:59 UTC rounds down to 26');
    await ctx.close();
  });

  await check('editor re-render: removing the node clears its timer, inserting a copy starts exactly one', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', NOV27_END);
    eq((await read(page)).active, 1, 'one timer after first load');
    await page.evaluate(() => {
      const old = document.getElementById('c');
      const copy = old.cloneNode(true);
      old.remove();
      window.__after_remove = window.__active.size;
      document.body.appendChild(copy);
    });
    eq(await page.evaluate(() => window.__after_remove), 0, 'timers right after the node was removed');
    eq((await read(page)).active, 1, 'timers after the re-inserted copy connects');
    await ctx.close();
  });

  await check('the documented section events change nothing: a load/unload CustomEvent leaves one timer', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', NOV27_END);
    await page.evaluate(() => {
      const c = document.getElementById('c');
      for (const type of ['shopify:section:unload', 'shopify:section:load']) {
        c.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable: false, detail: { sectionId: 'x' } }));
      }
    });
    eq((await read(page)).active, 1, 'timers');
    await ctx.close();
  });

  await check('visitor in Manila sees the sale time in the sale zone AND their own local time', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', NOV27_END, { tz: 'Asia/Manila' });
    const r = await read(page);
    eq(r.localHidden, false, 'local line shown');
    if (!/11:59\s?PM/.test(r.label)) throw new Error('sale-zone label is not 11:59 PM: ' + r.label);
    if (!/12:59\s?PM/.test(r.local)) throw new Error('Manila local time is not 12:59 PM: ' + r.local);
    await ctx.close();
  });

  await check('visitor already in the sale zone sees no redundant local line', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', NOV27_END, { tz: 'America/New_York' });
    eq((await read(page)).localHidden, true, 'local line hidden');
    await ctx.close();
  });

  await check('impossible dates are refused in every browser (31 February, 24:00)', async () => {
    for (const bad of ['2026-02-31 23:59', '2026-04-31 10:00', '2026-11-27 24:00']) {
      const { ctx, page } = await boot(browser, '2026-01-01T00:00:00Z', { 'data-ends-at': bad, 'data-offset': '-05:00' });
      eq((await read(page)).state, 'invalid', `state for ${bad}`);
      await ctx.close();
    }
  });

  await check('a real leap day is accepted', async () => {
    const { ctx, page } = await boot(browser, '2028-02-28T00:00:00Z', { 'data-ends-at': '2028-02-29 12:00', 'data-offset': '+00:00' });
    eq((await read(page)).state, 'running', 'state');
    await ctx.close();
  });

  await check('the zone in the label uses a true minus sign, so it cannot break across lines', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', NOV27_END);
    const r = await read(page);
    if (!r.label.includes('UTC−05:00')) throw new Error('label has no U+2212 minus: ' + r.label);
    await ctx.close();
  });

  await check('coming back to a sleeping tab refreshes the display at once', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', NOV27_END);
    await page.clock.setSystemTime(new Date('2026-11-27T05:59:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const r = await read(page);
    eq(r.d + r.h + r.m + r.s, '00230000', 'units one hour later, with no interval tick');
    await ctx.close();
  });

  await check('a removed countdown stops listening for the tab coming back', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', NOV27_END);
    await page.evaluate(() => {
      window.__old = document.getElementById('c');
      window.__old.remove();
    });
    await page.clock.setSystemTime(new Date('2026-11-27T05:59:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const seconds = await page.evaluate(() => window.__old.querySelector('[data-unit="h"]').textContent);
    eq(seconds, '00', 'hours on the removed node (a leaked listener would have moved it to 23)');
    await ctx.close();
  });

  await check('a template carrying markup is written as text, never parsed as HTML', async () => {
    const { ctx, page } = await boot(browser, '2026-11-27T04:59:00Z', {
      ...NOV27_END,
      'data-ends-template': '<img src=x onerror="window.__pwned=1"> __DATE__',
    });
    const r = await page.evaluate(() => ({ pwned: window.__pwned === 1, imgs: document.querySelectorAll('[data-ends-label] img').length }));
    eq(r.pwned, false, 'script ran'); eq(r.imgs, 0, 'img elements created');
    await ctx.close();
  });

  await browser.close();

  let failed = 0;
  for (const [name, ok, why] of results) {
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  <- ' + why}`);
  }
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
