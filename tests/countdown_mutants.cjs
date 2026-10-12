// Mutation check for assets/sale-countdown.js: plant one real defect at a time and require the test suite to go red.
//   node tests/countdown_mutants.cjs
// A mutant that survives means a test is missing. A mutation whose target text is not found fails loudly,
// so a refactor of the asset cannot make this check pass by testing nothing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'assets', 'sale-countdown.js');
const TEST = path.join(__dirname, 'countdown.test.cjs');
const source = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

const mutants = [
  ['timer leaks when the node is removed', "disconnectedCallback() {\n      window.clearInterval(this.timer);", 'disconnectedCallback() {\n      '],
  ['zone offset ignored (always Z)', '${m[5]}:00${offset}', '${m[5]}:00Z'],
  ['wrong milliseconds per day', 'const day = 86400000;', 'const day = 8640000;'],
  ['never reaches the ended state', 'if (left === 0) {', 'if (left < 0) {'],
  ['no validation of the typed date or offset', "if (!m || !/^[+-]\\d{2}:\\d{2}$|^Z$/.test(offset)) return null;", 'if (!m) return null;'],
  ['label written as HTML', "node.textContent = template.replace('__DATE__', value);", "node.innerHTML = template.replace('__DATE__', value);"],
  ['local line compares with the zone name', 'this.formatter(own).format(parsed.instant) === wall', "this.formatter({ ...own, timeZoneName: 'short' }).format(parsed.instant) === wall"],
  ['metafield instant ignored', "const utc = (this.dataset.endsAtUtc || '').trim();", "const utc = '';"],
  ['timer never started', 'this.timer = window.setInterval(() => this.tick(), 1000);', 'this.timer = null;'],
  // The five round-trip comparisons overlap on purpose (any impossible date trips at least one), so the
  // mutant removes the whole block: 31 February and 24:00 must then be accepted and the tests must notice.
  ['impossible dates not round-trip checked', 'back.getUTCFullYear() !== year ||\n        back.getUTCMonth() !== month - 1 ||\n        back.getUTCDate() !== day ||\n        back.getUTCHours() !== hour ||\n        back.getUTCMinutes() !== minute', 'false'],
  ['tab-return listener never added', "document.addEventListener('visibilitychange', this.onVisible);\n      }\n    }\n\n    disconnectedCallback", "}\n    }\n\n    disconnectedCallback"],
  ['tab-return listener leaks after removal', "window.clearInterval(this.timer);\n      this.timer = null;\n      document.removeEventListener('visibilitychange', this.onVisible);\n    }\n\n    parseEnd", "window.clearInterval(this.timer);\n      this.timer = null;\n    }\n\n    parseEnd"],
  ['metafield path ignores the zone attribute', "if (!zone) return { instant, wall: null, zone: null };", 'return { instant, wall: null, zone: null };'],
  ['metafield zone sign flipped', "(zone[1] === '-' ? -1 : 1)", "(zone[1] === '-' ? 1 : -1)"],
  ['hyphen instead of a true minus in the zone label', "(parsed.zone === 'Z' ? '+00:00' : parsed.zone).replace('-', '−')", "(parsed.zone === 'Z' ? '+00:00' : parsed.zone)"],
];

let survived = 0;
for (const [name, from, to] of mutants) {
  if (!source.includes(from)) {
    console.log(`BROKEN MUTANT  ${name}: target text not found in the asset`);
    survived += 1;
    continue;
  }
  const file = path.join(os.tmpdir(), `sale-countdown.mutant-${Date.now()}.js`);
  fs.writeFileSync(file, source.replace(from, to));
  const r = spawnSync(process.execPath, [TEST], {
    env: { ...process.env, COUNTDOWN_JS: file },
    encoding: 'utf8',
    timeout: 120000,
  });
  fs.unlinkSync(file);
  const caught = r.status !== 0;
  if (!caught) survived += 1;
  const failing = (r.stdout.match(/^FAIL .*/gm) || []).length;
  console.log(`${caught ? 'CAUGHT  ' : 'SURVIVED'}  ${name}${caught ? `  (${failing} test(s) red)` : ''}`);
}
console.log(`${mutants.length - survived}/${mutants.length} mutants caught`);
process.exit(survived ? 1 : 0);
