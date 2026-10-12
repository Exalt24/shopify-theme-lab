// Executes sections/bundle-contents.liquid and sections/sale-event-hero.liquid (the real files) through LiquidJS with
// Shopify's objects stubbed (tests/render/shopify_liquid.cjs), and asserts on the HTML they produce.
//   node tests/liquid.test.cjs
// LIQUID_DIR=<dir> runs the same tests against a mutated copy of the sections (used by tests/liquid_mutants.cjs).
const assert = require('assert');
const path = require('path');
const { makeEngine, ShopTime, product, bundleProduct, collectionWith, renderSection } = require('./render/shopify_liquid.cjs');

const engine = makeEngine();
if (process.env.LIQUID_DIR) engine.options.root = [process.env.LIQUID_DIR];

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`);
  }
}
const squash = (html) => html.replace(/\s+/g, ' ');
const board = () => product({ title: 'The Complete Snowboard', handle: 'the-complete-snowboard', cents: 69995 });
const wax = () => product({ title: 'Selling Plans Ski Wax', handle: 'selling-plans-ski-wax', cents: 2495 });
const bundleHtml = (b, settings = {}, objects = {}) => squash(renderSection(engine, 'bundle-contents.liquid', { settings: { bundle_product: b, ...settings }, objects }));
const heroHtml = (settings = {}, objects = {}) => squash(renderSection(engine, 'sale-event-hero.liquid', { settings, objects }));
const attr = (html, name) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(html);
  return m ? m[1] : null;
};

// ---- bundle-contents -------------------------------------------------------------------------------------------
check('bundle: lists the parts and shows list-price total, bundle price and the saving worked out from the prices', () => {
  const h = bundleHtml(bundleProduct([board(), wax()], 67995));
  assert.ok(h.includes('The Complete Snowboard') && h.includes('Selling Plans Ski Wax'), 'both parts listed');
  assert.ok(h.includes('<s>$724.90</s>'), 'sum of parts 699.95 + 24.95');
  assert.ok(h.includes('$679.95'), 'bundle price');
  assert.ok(h.includes('You save $44.95 (6.2%)'), `saving line: ${/You save[^<]*/.exec(h)}`);
});

check('bundle: a whole-number percent prints without ".0"', () => {
  const a = product({ title: 'A', handle: 'a', cents: 10000 });
  const b = product({ title: 'B', handle: 'b', cents: 10000 });
  const h = bundleHtml(bundleProduct([a, b], 15000));
  assert.ok(h.includes('You save $50.00 (25%)'), `got: ${/You save[^<]*/.exec(h)}`);
});

check('bundle: no saving row and no "bought separately" when the bundle costs as much as or more than the parts', () => {
  const dearer = bundleHtml(bundleProduct([board(), wax()], 80000));
  assert.ok(!dearer.includes('You save') && !dearer.includes('Bought separately'), 'dearer bundle');
  const equal = bundleHtml(bundleProduct([board(), wax()], 72490));
  assert.ok(!equal.includes('You save') && !equal.includes('Bought separately'), 'equal price');
});

check('bundle: show_savings off hides the saving line but keeps the prices', () => {
  const h = bundleHtml(bundleProduct([board(), wax()], 67995), { show_savings: false });
  assert.ok(!h.includes('You save'), 'saving hidden');
  assert.ok(h.includes('$679.95'), 'bundle price kept');
});

check('bundle: add to cart is off by default and the form posts the bundle variant when on', () => {
  const off = bundleHtml(bundleProduct([board(), wax()], 67995));
  assert.ok(!off.includes('<form') && !off.includes('Add bundle to cart'), 'no form by default');
  const on = bundleHtml(bundleProduct([board(), wax()], 67995), { show_add_to_cart: true });
  assert.ok(on.includes('action="/cart/add"') && on.includes('name="id" value="rider-starter-bundle-v1"'), 'form with the bundle variant id');
  assert.ok(on.includes('Add bundle to cart') && !/<button[^>]*disabled/.test(on), 'enabled button');
});

check('bundle: button is disabled and reads Sold out when any part is sold out', () => {
  const soldOutWax = product({ title: 'Selling Plans Ski Wax', handle: 'selling-plans-ski-wax', cents: 2495, available: false });
  const h = bundleHtml(bundleProduct([board(), soldOutWax], 67995), { show_add_to_cart: true });
  assert.ok(/<button[^>]*disabled/.test(h), 'disabled');
  assert.ok(h.includes('Sold out') && !h.includes('Add bundle to cart'), 'label');
});

check('bundle: button is disabled when the bundle variant itself is unavailable', () => {
  const h = bundleHtml(bundleProduct([board(), wax()], 67995, false), { show_add_to_cart: true });
  assert.ok(/<button[^>]*disabled/.test(h) && h.includes('Sold out'), 'disabled and Sold out');
});

check('bundle: with no parts listed it renders nothing on the storefront and a hint in the editor', () => {
  const empty = bundleProduct([], 67995);
  const store = bundleHtml(empty);
  assert.ok(!store.includes('bundle-contents__card'), 'nothing on the storefront');
  const editor = squash(renderSection(engine, 'bundle-contents.liquid', { settings: { bundle_product: empty }, objects: { request: { design_mode: true } } }));
  assert.ok(editor.includes('bundle-contents__hint'), 'editor hint');
});

check('bundle: a custom heading is escaped and a blank one falls back to the product title', () => {
  const b = bundleProduct([board(), wax()], 67995);
  assert.ok(bundleHtml(b, { heading: '<img src=x onerror=alert(1)>' }).includes('&lt;img src=x onerror=alert(1)&gt;'), 'escaped');
  assert.ok(bundleHtml(b, { heading: '' }).includes('>Rider Starter Bundle</h2>'), 'fallback to the title');
});

check('bundle: a part without an image renders the placeholder instead of an empty image', () => {
  const noImg = product({ title: 'No Image', handle: 'no-image', cents: 1000, image: false });
  const h = bundleHtml(bundleProduct([noImg, wax()], 3000));
  assert.ok(h.includes('placeholder-svg'), 'placeholder');
});

// ---- sale-event-hero -------------------------------------------------------------------------------------------
check('hero: the metafield instant reaches the script as the SAME moment whatever zone Liquid renders it in', () => {
  const expected = Date.parse('2026-11-28T04:59:00Z');
  for (const offset of [-300, 0, 480, 330, -480, 660]) {
    const col = collectionWith(new ShopTime('2026-11-28T04:59:00Z', offset));
    const h = heroHtml({ sale_collection: col }, { collection: col });
    const utc = attr(h, 'data-ends-at-utc');
    assert.strictEqual(Date.parse(utc), expected, `offset ${offset} printed ${utc}`);
    const sign = offset < 0 ? '-' : '+';
    const abs = Math.abs(offset);
    assert.strictEqual(attr(h, 'data-utc-zone'), `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`, `zone for ${offset}`);
  }
});

check('hero: the page\'s own collection wins over the picked one, and the picked one wins over the typed time', () => {
  const own = collectionWith(new ShopTime('2026-12-01T00:00:00Z', 0));
  const picked = collectionWith(new ShopTime('2026-12-25T00:00:00Z', 0));
  const a = heroHtml({ sale_collection: picked, ends_at: '2026-11-27 23:59' }, { collection: own });
  assert.strictEqual(Date.parse(attr(a, 'data-ends-at-utc')), Date.parse('2026-12-01T00:00:00Z'), 'own collection');
  const b = heroHtml({ sale_collection: picked, ends_at: '2026-11-27 23:59' });
  assert.strictEqual(Date.parse(attr(b, 'data-ends-at-utc')), Date.parse('2026-12-25T00:00:00Z'), 'picked collection');
});

check('hero: with no metafield the typed time and offset go through and the no-JS label names the zone', () => {
  const none = collectionWith(null);
  const h = heroHtml({ sale_collection: none, ends_at: '2026-11-27 23:59', utc_offset: '-05:00' }, { collection: none });
  assert.strictEqual(attr(h, 'data-ends-at'), '2026-11-27 23:59');
  assert.strictEqual(attr(h, 'data-offset'), '-05:00');
  assert.strictEqual(attr(h, 'data-ends-at-utc'), '', 'no metafield instant');
  assert.ok(h.includes('Sale ends 2026-11-27 23:59 (UTC-05:00)'), `label: ${/data-ends-label>[^<]*/.exec(h)}`);
});

check('hero: no end time anywhere means no countdown element at all', () => {
  const h = heroHtml({});
  assert.ok(!h.includes('<sale-countdown') && !h.includes('data-ends-label'), 'no countdown');
});

check('hero: no-JS label for a metafield sale reads the sale time with its zone', () => {
  const col = collectionWith(new ShopTime('2026-11-28T04:59:00Z', -300));
  const h = heroHtml({ sale_collection: col }, { collection: col });
  assert.ok(h.includes('Sale ends 27 Nov 2026, 23:59 (UTC-05:00)'), `label: ${/data-ends-label>[^<]*/.exec(h)}`);
});

check('hero: heading level follows the setting and there is one heading', () => {
  const col = collectionWith(new ShopTime('2026-11-28T04:59:00Z', -300));
  const one = heroHtml({ sale_collection: col, heading_tag: 'h1' }, { collection: col });
  assert.strictEqual((one.match(/<h1 /g) || []).length, 1);
  assert.ok(!/<h2 /.test(one));
  const two = heroHtml({ sale_collection: col, heading_tag: 'h2' }, { collection: col });
  assert.ok(two.includes('<h2 ') && !two.includes('<h1 '));
});

check('hero: the button needs both a label and a link', () => {
  const col = collectionWith(new ShopTime('2026-11-28T04:59:00Z', -300));
  assert.ok(heroHtml({ sale_collection: col, button_label: 'Shop', button_link: '/collections/x' }, { collection: col }).includes('sale-hero__button'));
  assert.ok(!heroHtml({ sale_collection: col, button_label: 'Shop', button_link: '' }, { collection: col }).includes('sale-hero__button'), 'no link');
  assert.ok(!heroHtml({ sale_collection: col, button_label: '', button_link: '/collections/x' }, { collection: col }).includes('sale-hero__button'), 'no label');
});

check('hero: a custom ended message is escaped, a blank one uses the translated default', () => {
  const col = collectionWith(new ShopTime('2026-11-28T04:59:00Z', -300));
  const custom = heroHtml({ sale_collection: col, ended_message: '<script>alert(1)</script>' }, { collection: col });
  assert.ok(custom.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !custom.includes('<script>alert'), 'escaped');
  assert.ok(heroHtml({ sale_collection: col, ended_message: '' }, { collection: col }).includes('This sale has ended.'), 'default text');
  assert.ok(!heroHtml({ sale_collection: col }, { collection: col }).includes('Translation missing'), 'no missing translation');
});

check('hero: the eyebrow is escaped and the hero image is eager and high priority only as the first section', () => {
  const col = collectionWith(new ShopTime('2026-11-28T04:59:00Z', -300));
  const img = { src: 'https://cdn.example.test/hero.jpg', alt: '' };
  const first = heroHtml({ sale_collection: col, image: img, eyebrow: '<b>x</b>' }, { collection: col, index: 1 });
  assert.ok(first.includes('&lt;b&gt;x&lt;/b&gt;'), 'eyebrow escaped');
  assert.ok(first.includes('loading="eager"') && first.includes('fetchpriority="high"'), 'first section is eager');
  const later = heroHtml({ sale_collection: col, image: img }, { collection: col, index: 3 });
  assert.ok(later.includes('loading="lazy"') && !later.includes('fetchpriority="high"'), 'later section is lazy');
});

check('hero and bundle: every string they print resolves in the locale file', () => {
  const col = collectionWith(new ShopTime('2026-11-28T04:59:00Z', -300));
  const all = heroHtml({ sale_collection: col, button_label: 'Shop', button_link: '/x' }, { collection: col }) +
    bundleHtml(bundleProduct([board(), wax()], 67995), { show_add_to_cart: true });
  assert.ok(!all.includes('Translation missing'), `missing: ${/Translation missing[^<"]*/.exec(all)}`);
});

console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
