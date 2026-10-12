/*
  <sale-countdown>: a custom element, so the theme editor's section re-render (which replaces the DOM
  without running page-load JavaScript again) calls connectedCallback on the new node and
  disconnectedCallback on the old one. That removes the need for shopify:section:load handlers and means
  an edited section can never leave a second timer running behind it.

  The end is ONE absolute instant. Either an ISO UTC time from a collection metafield (data-ends-at-utc),
  or a wall-clock time typed in the section settings plus the zone offset the merchant picked
  (data-ends-at + data-offset). The device clock only ticks the display; it never decides the zone.
*/
if (!customElements.get('sale-countdown')) {
  class SaleCountdown extends HTMLElement {
    constructor() {
      super();
      this.timer = null;
      this.onVisible = () => {
        if (!document.hidden) this.tick();
      };
    }

    connectedCallback() {
      this.units = {
        d: this.querySelector('[data-unit="d"]'),
        h: this.querySelector('[data-unit="h"]'),
        m: this.querySelector('[data-unit="m"]'),
        s: this.querySelector('[data-unit="s"]'),
      };
      this.endLabel = this.querySelector('[data-ends-label]');
      this.localLabel = this.querySelector('[data-ends-local]');
      this.ended = this.querySelector('[data-ended]');

      const parsed = this.parseEnd();
      if (!parsed) {
        // A bad date must never break the section: fall back to the static text from Liquid.
        this.dataset.state = 'invalid';
        return;
      }
      this.endsAt = parsed.instant;
      this.paintLabels(parsed);
      this.tick();
      if (this.dataset.state !== 'ended') {
        this.timer = window.setInterval(() => this.tick(), 1000);
        document.addEventListener('visibilitychange', this.onVisible);
      }
    }

    disconnectedCallback() {
      window.clearInterval(this.timer);
      this.timer = null;
      document.removeEventListener('visibilitychange', this.onVisible);
    }

    parseEnd() {
      const utc = (this.dataset.endsAtUtc || '').trim();
      if (utc) {
        const instant = Date.parse(utc);
        return Number.isNaN(instant) ? null : { instant, wall: null };
      }
      const raw = (this.dataset.endsAt || '').trim();
      const offset = (this.dataset.offset || '').trim();
      const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
      if (!m || !/^[+-]\d{2}:\d{2}$|^Z$/.test(offset)) return null;
      const [year, month, day, hour, minute] = m.slice(1).map(Number);
      // The wall-clock time as typed, formatted as if it were UTC so no device zone shifts it.
      const wall = Date.UTC(year, month - 1, day, hour, minute);
      // Date.parse rolls impossible dates forward (31 February becomes 3 March, 24:00 becomes tomorrow) in
      // some engines and rejects them in others. Round-trip the typed fields so every browser refuses the same dates.
      const back = new Date(wall);
      if (
        back.getUTCFullYear() !== year ||
        back.getUTCMonth() !== month - 1 ||
        back.getUTCDate() !== day ||
        back.getUTCHours() !== hour ||
        back.getUTCMinutes() !== minute
      ) {
        return null;
      }
      const instant = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${offset}`);
      if (Number.isNaN(instant)) return null;
      return { instant, wall };
    }

    formatter(options) {
      // Use the page's own language so dates match the rest of a localised store; fall back to the browser's.
      try {
        return new Intl.DateTimeFormat(document.documentElement.lang || undefined, options);
      } catch (error) {
        return new Intl.DateTimeFormat(undefined, options);
      }
    }

    paintLabels(parsed) {
      const own = { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
      const local = this.formatter({ ...own, timeZoneName: 'short' });
      if (parsed.wall !== null) {
        const wall = this.formatter({ ...own, timeZone: 'UTC' }).format(parsed.wall);
        // A true minus sign (U+2212) cannot be broken across lines the way a hyphen can.
        const zone = `UTC${this.dataset.offset.replace('-', '−')}`;
        this.setLabel(this.endLabel, this.dataset.endsTemplate, `${wall} (${zone})`);
        // Compare like with like (no zone name on either side), so a visitor already in the sale's zone
        // is not shown a second, identical line.
        const sameClock = this.formatter(own).format(parsed.instant) === wall;
        if (this.localLabel && !sameClock) {
          this.setLabel(this.localLabel, this.dataset.localTemplate, local.format(parsed.instant));
          this.localLabel.hidden = false;
        }
      } else {
        this.setLabel(this.endLabel, this.dataset.endsTemplate, local.format(parsed.instant));
      }
    }

    setLabel(node, template, value) {
      if (node && template) node.textContent = template.replace('__DATE__', value);
    }

    tick() {
      const left = Math.max(0, this.endsAt - Date.now());
      if (left === 0) {
        this.finish();
        return;
      }
      if (this.dataset.state !== 'running') this.dataset.state = 'running';
      const pad = (n) => String(n).padStart(2, '0');
      const day = 86400000;
      const set = (key, value) => {
        const node = this.units[key];
        if (node && node.textContent !== value) node.textContent = value;
      };
      set('d', pad(Math.floor(left / day)));
      set('h', pad(Math.floor((left % day) / 3600000)));
      set('m', pad(Math.floor((left % 3600000) / 60000)));
      set('s', pad(Math.floor((left % 60000) / 1000)));
    }

    finish() {
      window.clearInterval(this.timer);
      this.timer = null;
      document.removeEventListener('visibilitychange', this.onVisible);
      this.dataset.state = 'ended';
      if (this.ended) this.ended.hidden = false;
      if (this.endLabel) this.endLabel.hidden = true;
      if (this.localLabel) this.localLabel.hidden = true;
    }
  }

  customElements.define('sale-countdown', SaleCountdown);
}
