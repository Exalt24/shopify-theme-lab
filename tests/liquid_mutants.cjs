// Mutation check for the two sections' Liquid: plant one real defect in a copy of the section, run tests/liquid.test.cjs
// against that copy, and require it to go red. A mutant that survives means a test is missing; a target that is not
// found fails loudly so a refactor cannot make this check pass by testing nothing.
//   node tests/liquid_mutants.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST = path.join(__dirname, 'liquid.test.cjs');

const mutants = [
  ['bundle', 'saving added instead of subtracted', 'assign saving = separate_total | minus: bundle_variant.price', 'assign saving = separate_total | plus: bundle_variant.price'],
  ['bundle', 'a sold-out part does not block the button', 'unless item.available', 'unless true'],
  ['bundle', 'a sold-out bundle variant does not block the button', 'if bundle_variant.available and parts_available', 'if parts_available'],
  ['bundle', 'percent keeps a trailing .0', "| replace: '.0', ''", "| replace: 'zz', ''"],
  ['bundle', 'bought-separately row shown when there is no saving', '{%- if saving > 0 -%}\n            <div class="bundle-contents__row">', '{%- if true -%}\n            <div class="bundle-contents__row">'],
  ['bundle', 'saving shown when show_savings is off', 'if saving > 0 and section.settings.show_savings', 'if saving > 0'],
  ['bundle', 'heading not escaped', '{{ heading | escape }}', '{{ heading }}'],
  ['bundle', 'parts total ignores the second part', 'assign separate_total = separate_total | plus: item.selected_or_first_available_variant.price', 'assign separate_total = item.selected_or_first_available_variant.price'],
  ['hero', 'metafield instant printed without its offset', "date: '%Y-%m-%dT%H:%M:%S%:z'", "date: '%Y-%m-%dT%H:%M:%SZ'"],
  ['hero', 'sale zone attribute left empty', "assign ends_zone = collection_end | date: '%:z'", "assign ends_zone = ''"],
  ['hero', 'the picked collection beats the page\'s own', 'assign source_collection = collection\n', 'assign source_collection = section.settings.sale_collection\n'],
  ['hero', 'custom ended message not escaped', '{{- section.settings.ended_message | escape -}}', '{{- section.settings.ended_message -}}'],
  ['hero', 'every hero image is eager', 'if section.index == 1', 'if true'],
  ['hero', 'eyebrow not escaped', '{{ section.settings.eyebrow | escape }}', '{{ section.settings.eyebrow }}'],
  ['hero', 'heading level ignored', '<{{ heading_tag }} class="sale-hero__heading', '<h2 class="sale-hero__heading'],
  ['hero', 'button shown without a link', 'section.settings.button_label != blank and link != blank', 'section.settings.button_label != blank'],
];

const files = { bundle: 'bundle-contents.liquid', hero: 'sale-event-hero.liquid' };
let survived = 0;
for (const [which, name, from, to] of mutants) {
  const file = files[which];
  const original = fs.readFileSync(path.join(ROOT, 'sections', file), 'utf8').replace(/\r\n/g, '\n');
  if (original.split(from).length !== 2) {
    console.log(`BROKEN MUTANT  ${name}: target text found ${original.split(from).length - 1} times in ${file}, expected once`);
    survived += 1;
    continue;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liquid-mutant-'));
  fs.mkdirSync(path.join(dir, 'sections'));
  for (const f of Object.values(files)) fs.copyFileSync(path.join(ROOT, 'sections', f), path.join(dir, 'sections', f));
  fs.writeFileSync(path.join(dir, 'sections', file), original.replace(from, to));
  const r = spawnSync(process.execPath, [TEST], { env: { ...process.env, LIQUID_DIR: dir }, encoding: 'utf8', timeout: 60000 });
  fs.rmSync(dir, { recursive: true, force: true });
  const caught = r.status !== 0;
  if (!caught) survived += 1;
  const failing = (r.stdout.match(/^FAIL .*/gm) || []).length;
  console.log(`${caught ? 'CAUGHT  ' : 'SURVIVED'}  ${name}${caught ? `  (${failing} test(s) red)` : ''}`);
}
console.log(`${mutants.length - survived}/${mutants.length} mutants caught`);
process.exit(survived ? 1 : 0);
