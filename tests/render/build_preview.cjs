// Builds preview/index.html: the landing page's two sections rendered from the REAL section files (LiquidJS with
// Shopify's objects stubbed, see shopify_liquid.cjs), fed with the dev store's real product titles, prices and
// images read from its public Storefront API, and styled with the dev theme's own base.css and colour settings.
// It is a static render, not the Shopify storefront: the dev store sits behind a password.
//   node tests/render/build_preview.cjs           (reads SHOPIFY_STOREFRONT_TOKEN or a secrets folder, falls back to stubs)
const fs = require('fs');
const path = require('path');
const { makeEngine, ShopTime, product, bundleProduct, collectionWith, renderSection } = require('./shopify_liquid.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'preview');
const SHOP = 'dac-dev-store.myshopify.com';

function tokenFromSecrets() {
  if (process.env.SHOPIFY_STOREFRONT_TOKEN) return process.env.SHOPIFY_STOREFRONT_TOKEN;
  const file = process.env.SHOPIFY_STOREFRONT_TOKEN_FILE;
  if (!file || !fs.existsSync(file)) return null;
  const m = /^STOREFRONT_TOKEN=(.+)$/m.exec(fs.readFileSync(file, 'utf8'));
  return m ? m[1].trim() : null;
}

async function storefrontProduct(token, handle) {
  const query = 'query($h:String!){ product(handle:$h){ title handle availableForSale featuredImage{ url altText } variants(first:1){ nodes{ id availableForSale price{ amount } } } } }';
  const res = await fetch(`https://${SHOP}/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token },
    body: JSON.stringify({ query, variables: { h: handle } }),
  });
  const body = await res.json();
  const p = body.data && body.data.product;
  if (!p) throw new Error(`storefront returned no product for ${handle}`);
  const v = p.variants.nodes[0];
  return product({ title: p.title, handle: p.handle, cents: Math.round(Number(v.price.amount) * 100), available: p.availableForSale && v.availableForSale, image: !!p.featuredImage, imageUrl: p.featuredImage && p.featuredImage.url });
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function rootCss() {
  const raw = fs.readFileSync(path.join(ROOT, 'config', 'settings_data.json'), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  const d = JSON.parse(raw);
  const s = typeof d.current === 'object' && d.current ? d.current : d.presets.Default;
  const DESIGN_NAVY = '#0b1b2b'; // the source design's navy, set as the theme's text colour
  const c = (k) => hexToRgb(k === 'colors_text' ? DESIGN_NAVY : s[k]);
  return `:root{--font-body-family:Helvetica,Arial,sans-serif;--font-body-style:normal;--font-body-weight:400;--font-body-weight-bold:700;
--font-heading-family:Helvetica,Arial,sans-serif;--font-heading-style:normal;--font-heading-weight:700;--font-body-scale:1;--font-heading-scale:1;
--color-base-text:${c('colors_text')};--color-shadow:${c('colors_text')};--color-base-background-1:${c('colors_background_1')};--color-base-background-2:${c('colors_background_2')};
--color-base-solid-button-labels:${c('colors_solid_button_labels')};--color-base-outline-button-labels:${c('colors_outline_button_labels')};
--color-base-accent-1:${c('colors_accent_1')};--color-base-accent-2:${c('colors_accent_2')};
--gradient-base-background-1:${s.colors_background_1};--gradient-base-background-2:${s.colors_background_2};--gradient-base-accent-1:${s.colors_accent_1};--gradient-base-accent-2:${s.colors_accent_2};
--media-padding:0px;--media-border-opacity:.1;--media-border-width:1px;--media-radius:0px;--media-shadow-opacity:0;--media-shadow-visible:0;
--page-width:${(s.page_width || 1200) / 10}rem;--page-width-margin:2rem;--buttons-radius:0px;--buttons-radius-outset:0px;--buttons-border-width:1px;--buttons-border-opacity:1;
--buttons-shadow-opacity:0;--buttons-shadow-visible:0;--buttons-border-offset:0px;--inputs-radius:0px;--inputs-border-width:1px;--inputs-border-opacity:.55}
html{font-size:62.5%}body{margin:0;font-size:1.5rem;letter-spacing:.06rem;line-height:calc(1 + .8 / var(--font-body-scale));font-family:var(--font-body-family)}`;
}

(async () => {
  const engine = makeEngine();
  let board, wax, bundle, source;
  const token = tokenFromSecrets();
  try {
    if (!token) throw new Error('no storefront token');
    board = await storefrontProduct(token, 'the-complete-snowboard');
    wax = await storefrontProduct(token, 'selling-plans-ski-wax');
    const b = await storefrontProduct(token, 'rider-starter-bundle');
    bundle = bundleProduct([board, wax], b.selected_or_first_available_variant.price, b.available);
    source = 'dev store products read from its Storefront API';
  } catch (e) {
    board = product({ title: 'The Complete Snowboard', handle: 'the-complete-snowboard', cents: 69995 });
    wax = product({ title: 'Selling Plans Ski Wax', handle: 'selling-plans-ski-wax', cents: 2495 });
    bundle = bundleProduct([board, wax], 67995);
    source = `stub products (${e.message})`;
  }
  const collection = collectionWith(new ShopTime('2026-11-28T04:59:00Z', -300));
  const settings = {
    hero: { color_scheme: 'inverse', eyebrow: 'Winter sale', heading: 'Ride more. Pay less.', heading_tag: 'h1',
      subheading: '<p>10% off selected boards, applied at checkout until the timer ends.</p>', sale_collection: collection,
      button_label: 'Shop the sale', button_link: '#' },
    bundle: { bundle_product: bundle, show_add_to_cart: true },
  };
  const hero = renderSection(engine, 'sale-event-hero.liquid', { settings: settings.hero, objects: { collection: undefined, index: 1 } });
  const bundleHtml = renderSection(engine, 'bundle-contents.liquid', { settings: settings.bundle, objects: { index: 2 } });

  for (const need of ['assets/base.css', 'config/settings_data.json']) {
    if (!fs.existsSync(path.join(ROOT, need))) {
      console.error(`missing ${need}: the preview needs the stock Dawn files of the theme this repo overlays (clone Dawn, copy this repo's files over it, run from there). Nothing was changed.`);
      process.exit(2);
    }
  }
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  for (const f of ['index.html', 'sold-out.html', 'source.html']) fs.rmSync(path.join(OUT, f), { force: true });
  for (const f of ['base.css', 'section-sale-event-hero.css', 'section-bundle-contents.css', 'sale-countdown.js']) {
    fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(OUT, 'assets', f));
  }
  const page = (title, note, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link href="assets/base.css" rel="stylesheet"><style>${rootCss()}
.preview-note{font:13px/1.4 Helvetica,Arial,sans-serif;padding:10px 16px;background:#fff8e1;color:#4a3b00;border-bottom:1px solid #e6d9a8}
.preview-note b{font-weight:700}.preview-note a{color:inherit}</style></head>
<body class="gradient">
<p class="preview-note"><b>Static preview.</b> ${note} Rendered from the real Liquid files of <code>shopify-theme-lab</code> with Shopify's objects stubbed (${source}). It is not the Shopify storefront, which sits behind a password, so the buttons and product links do nothing here. The theme's text colour is set to the source design's navy; that is the only colour change. See also: <a href="source">the original page Claude wrote</a>, <a href="sold-out">the sold-out state</a>, <a href="./">the rebuilt page</a>.</p>
<script>document.addEventListener('submit',function(e){e.preventDefault()});document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(a){var h=a.getAttribute('href');if(h==='#'||h.indexOf('/products')===0||h.indexOf('/collections')===0){e.preventDefault()}}})</script>
<main>
${body}
</main></body></html>
`;
  fs.writeFileSync(path.join(OUT, 'index.html'), page('Sale sections, rendered from the theme files', 'The sale hero and the bundle block.', `${hero}\n${bundleHtml}`));

  // The same bundle section with one part marked unavailable, to show the Sold out state.
  const soldOutWax = { ...wax, available: false, selected_or_first_available_variant: { ...wax.selected_or_first_available_variant, available: false } };
  const soldOutBundle = bundleProduct([board, soldOutWax], bundle.selected_or_first_available_variant.price, true);
  const soldOutHtml = renderSection(engine, 'bundle-contents.liquid', { settings: { bundle_product: soldOutBundle, show_add_to_cart: true }, objects: { index: 2 } });
  // The original Claude-made page, so the before and the after can be opened side by side.
  fs.copyFileSync(path.join(ROOT, 'design-source', 'winter-sale.html'), path.join(OUT, 'source.html'));
  fs.writeFileSync(path.join(OUT, 'sold-out.html'), page('Bundle block with one part sold out', 'The bundle block with the wax marked unavailable.', soldOutHtml));
  console.log('wrote preview/index.html,', source);
})().catch((e) => { console.error(e); process.exit(1); });
