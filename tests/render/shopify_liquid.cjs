// Runs the REAL section files through LiquidJS with the Shopify objects, filters and tags they use stubbed.
// This is not Shopify's renderer: it executes the Liquid in sections/*.liquid against drops I define here, so the
// maths, branches, escaping and the data attributes the script reads are exercised. What it cannot prove is how
// Shopify's own engine renders a date_time metafield, or how the theme editor behaves; the README says so.
const fs = require('fs');
const path = require('path');
const { Liquid } = require('liquidjs');

const ROOT = path.resolve(__dirname, '..', '..');
const LOCALE = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'en.default.json'), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));

// A point in time with the offset it is "rendered in", which is what Liquid's date filter prints for a date_time metafield.
class ShopTime {
  constructor(iso, offsetMinutes) {
    this.epoch = Date.parse(iso);
    this.offsetMinutes = offsetMinutes;
  }
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function strftime(time, format) {
  const wall = new Date(time.epoch + time.offsetMinutes * 60000);
  const sign = time.offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(time.offsetMinutes);
  const zone = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  const map = {
    Y: wall.getUTCFullYear(), m: pad(wall.getUTCMonth() + 1), d: pad(wall.getUTCDate()),
    H: pad(wall.getUTCHours()), M: pad(wall.getUTCMinutes()), S: pad(wall.getUTCSeconds()),
    b: MONTHS[wall.getUTCMonth()], ':z': zone, z: zone.replace(':', ''),
  };
  return format.replace(/%(:z|[A-Za-z])/g, (all, key) => (key in map ? map[key] : all));
}

function lookup(key) {
  return key.split('.').reduce((node, part) => (node == null ? node : node[part]), LOCALE);
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A paired tag whose body is parsed up to {% endNAME %} and handed to onRender.
const block = (name, onRender) => ({
  parse(token, remaining) {
    this.args = token.args;
    this.tpls = [];
    const stream = this.liquid.parser
      .parseStream(remaining)
      .on('template', (tpl) => this.tpls.push(tpl))
      .on(`tag:end${name}`, () => stream.stop())
      .on('end', () => {
        throw new Error(`{% ${name} %} not closed`);
      });
    stream.start();
  },
  * render(ctx, emitter) {
    yield* onRender.call(this, ctx, emitter);
  },
});

function makeEngine() {
  const engine = new Liquid({ root: ROOT, extname: '.liquid', strictFilters: false, strictVariables: false });

  const dateFilter = engine.filters.date;
  engine.registerFilter('date', function (value, format) {
    if (value instanceof ShopTime) return strftime(value, format);
    return dateFilter.call(this, value, format);
  });
  // Ruby's Float#round(1) keeps the decimal ("25.0"), JavaScript drops it ("25"). The section strips ".0" itself, so
  // the harness has to print the way Ruby does or a test could never see that line go wrong.
  const roundFilter = engine.filters.round;
  engine.registerFilter('round', function (value, digits) {
    const rounded = roundFilter.call(this, value, digits);
    if (!digits || Number(digits) <= 0 || typeof rounded !== 'number') return rounded;
    return { valueOf: () => rounded, toString: () => (Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded)) };
  });
  engine.registerFilter('asset_url', (name) => `assets/${name}`);
  engine.registerFilter('stylesheet_tag', (url) => `<link href="${url}" rel="stylesheet" type="text/css" media="all">`);
  engine.registerFilter('money', (cents) => {
    const n = Number(cents || 0) / 100;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  });
  engine.registerFilter('t', (key, ...pairs) => {
    const raw = lookup(String(key));
    if (typeof raw !== 'string') return `Translation missing: en.${key}`;
    // LiquidJS passes named arguments as [name, value] pairs.
    const values = {};
    for (const p of pairs) if (Array.isArray(p)) values[p[0]] = p[1];
    return escapeHtml(raw).replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name) => (name in values ? escapeHtml(values[name]) : all));
  });
  engine.registerFilter('image_url', (image, ...pairs) => {
    const opts = {};
    for (const p of pairs) if (Array.isArray(p)) opts[p[0]] = p[1];
    return image ? { src: `${image.src}${image.src.includes('?') ? '&' : '?'}width=${opts.width || 0}`, alt: image.alt } : null;
  });
  engine.registerFilter('image_tag', (image, ...pairs) => {
    if (!image) return '';
    const o = {};
    for (const p of pairs) if (Array.isArray(p)) o[p[0]] = p[1];
    const alt = o.alt != null ? o.alt : image.alt || '';
    return `<img src="${image.src}" alt="${escapeHtml(alt)}" loading="${o.loading || 'lazy'}"${o.fetchpriority ? ` fetchpriority="${o.fetchpriority}"` : ''}${o.class ? ` class="${o.class}"` : ''}>`;
  });
  engine.registerFilter('placeholder_svg_tag', (name, cls) => `<svg class="${cls || ''}" role="img" aria-hidden="true" viewBox="0 0 525 525"><title>${name}</title></svg>`);

  engine.registerTag('schema', block('schema', function* () {}));
  engine.registerTag('style', block('style', function* (ctx, emitter) {
    emitter.write('<style data-shopify>');
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    emitter.write('</style>');
  }));
  engine.registerTag('form', block('form', function* (ctx, emitter) {
    const id = /id:\s*([\w.]+)/.exec(this.args);
    const cls = /class:\s*'([^']*)'/.exec(this.args);
    const formId = id ? ctx.get(id[1].split('.')) : '';
    emitter.write(`<form method="post" action="/cart/add" id="${formId}" class="${cls ? cls[1] : ''}" accept-charset="UTF-8" enctype="multipart/form-data">`);
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    emitter.write('</form>');
  }));
  return engine;
}

// ---- drops ---------------------------------------------------------------------------------------------------
function product({ title, handle, cents, available = true, image = true, imageUrl }) {
  const variant = { id: `${handle}-v1`, price: cents, available };
  return {
    title, handle, url: `/products/${handle}`, available,
    featured_media: image ? { alt: title, preview_image: { src: imageUrl || `https://cdn.example.test/${handle}.jpg`, alt: title } } : null,
    selected_or_first_available_variant: variant,
    metafields: { custom: {} },
  };
}

function bundleProduct(parts, bundleCents, bundleAvailable = true) {
  const b = product({ title: 'Rider Starter Bundle', handle: 'rider-starter-bundle', cents: bundleCents, available: bundleAvailable });
  b.metafields = { custom: { bundle_items: { value: parts } } };
  return b;
}

function collectionWith(endTime) {
  return { title: 'Winter Sale', handle: 'winter-sale', metafields: { custom: endTime ? { sale_ends_at: { value: endTime } } : {} } };
}

// Default settings of each section, read from its own schema so the render matches what the editor would start from.
function schemaDefaults(file) {
  const src = fs.readFileSync(path.join(ROOT, 'sections', file), 'utf8');
  const json = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(src)[1]);
  const settings = {};
  for (const s of json.settings) if (s.id) settings[s.id] = s.default !== undefined ? s.default : '';
  return { settings, schema: json };
}

function renderSection(engine, file, { settings = {}, objects = {} } = {}) {
  const defaults = schemaDefaults(file).settings;
  const merged = { ...defaults, ...settings };
  const section = { id: 'test1', index: objects.index === undefined ? 1 : objects.index, settings: merged };
  const ctx = { section, request: { design_mode: false }, ...objects };
  return engine.renderFileSync(`sections/${file}`, ctx);
}

module.exports = { makeEngine, ShopTime, product, bundleProduct, collectionWith, renderSection, schemaDefaults, escapeHtml };
