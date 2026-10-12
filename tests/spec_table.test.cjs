// Executes sections/product-spec-table.liquid (the real file) through LiquidJS with Shopify's objects stubbed
// (tests/render/shopify_liquid.cjs) and checks the grouping pass.
//   node tests/spec_table.test.cjs
// LIQUID_DIR=<dir> runs the same tests against a mutated copy of the section.
const assert = require('assert');
const { makeEngine, renderSection } = require('./render/shopify_liquid.cjs');

const path = require('path');
const engine = makeEngine();
// the section renders snippets/spec-value.liquid, so the snippets folder is on the lookup path
engine.options.partials = [path.resolve(__dirname, '..', 'snippets')];
if (process.env.LIQUID_DIR) engine.options.root = [process.env.LIQUID_DIR];
for (const [name, fn] of Object.entries({
  asset_url: (v) => `/assets/${v}`,
  stylesheet_tag: (u) => `<link rel="stylesheet" href="${u}">`,
})) {
  try { engine.registerFilter(name, fn); } catch { /* already registered */ }
}

let failed = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`);
  }
}
const text = (value) => ({ type: 'single_line_text_field', value });
const render = (specs, settings = {}) =>
  renderSection(engine, 'product-spec-table.liquid', {
    settings: { namespace: 'specs', heading: '', default_group: 'General', ...settings },
    objects: { product: { metafields: { specs } } },
  }).replace(/\s+/g, ' ');
const headings = (html) => [...html.matchAll(/spec-table__group-heading">([^<]*)</g)].map((m) => m[1]);

check('every group renders when one group name is a prefix of an earlier one (dimension__x, then dim__y)', () => {
  const h = render({ dimension__x: text('X-VALUE'), dim__y: text('Y-VALUE') });
  assert.ok(h.includes('X-VALUE'), 'first row rendered');
  assert.ok(h.includes('Y-VALUE'), `second row dropped: ${h.slice(0, 300)}`);
  assert.deepStrictEqual(headings(h), ['Dimension', 'Dim']);
});

check('every group renders when the longer name comes second (size__a, then sizes__b)', () => {
  const h = render({ size__a: text('A-VALUE'), sizes__b: text('B-VALUE') });
  assert.ok(h.includes('A-VALUE') && h.includes('B-VALUE'), 'both rows rendered');
  assert.deepStrictEqual(headings(h), ['Size', 'Sizes']);
});

check('a repeated group is listed once and keeps all of its rows', () => {
  const h = render({ physical__weight: text('W'), physical__length: text('L'), colour: text('C') });
  assert.deepStrictEqual(headings(h), ['Physical', 'General']);
  assert.ok(h.includes('>W<') || h.includes('W'), 'weight row');
  assert.ok(h.includes('L') && h.includes('C'), 'other rows');
});

check('with no metafield namespace the section renders nothing', () => {
  const h = renderSection(engine, 'product-spec-table.liquid', {
    settings: { namespace: 'specs', heading: '', default_group: 'General' },
    objects: { product: { metafields: {} } },
  }).replace(/\s+/g, '');
  assert.strictEqual(h, '');
});

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
