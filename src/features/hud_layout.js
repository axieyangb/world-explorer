// [ui-mobile] Top-bar fit: the location pill never runs under the mode / vehicle dock, at any width.
// Desktop: centred, shrinking (ellipsis) until it would touch the dock, then left-aligned, then on a
// second row under the dock. Touch: left-aligned in landscape (the minimap sits under it, so it only
// shrinks), second row in portrait (styles.css). Re-fits on resize and whenever the dock changes width
// (mode / vehicle label, language).
const GAP = 10; // px between pill and dock
const MAX_TEXT = 340; // matches .loc-pill-text in styles.css

export class HudLayout {
  constructor() {
    if (typeof document === 'undefined') return;
    this.bar = document.getElementById('location-bar');
    this.pill = document.getElementById('location-pill');
    this.text = document.getElementById('location-pill-text');
    this.dock = document.getElementById('hud-dock');
    if (!this.bar || !this.pill || !this.text || !this.dock) return;
    this._queued = false;
    const fit = () => this.queue();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(fit);
      this._ro.observe(this.dock);
    }
    this.queue();
  }

  queue() {
    if (this._queued) return;
    this._queued = true;
    requestAnimationFrame(() => { this._queued = false; this.fit(); });
  }

  fit() {
    const { bar, pill, text, dock } = this;
    const W = window.innerWidth;
    const touch = document.body.classList.contains('touch-ui');
    const portrait = window.innerHeight > W;
    bar.classList.remove('lb-left', 'lb-row2');
    const chrome = Math.max(0, pill.offsetWidth - text.offsetWidth); // pin icon, padding, "/" badge
    const dockLeft = dock.getBoundingClientRect().left;
    const barLeft = parseFloat(getComputedStyle(bar).getPropertyValue('--lb-margin')) || (touch ? 12 : 16);
    const set = (px) => { text.style.maxWidth = `${Math.max(48, Math.floor(px))}px`; };
    if (touch) {
      // Portrait: own row under the dock; landscape: between the screen edge and the dock.
      set(portrait ? W - 2 * barLeft - chrome : Math.min(MAX_TEXT, dockLeft - GAP - barLeft - chrome));
      return;
    }
    const half = Math.min(W / 2 - barLeft, dockLeft - GAP - W / 2);
    if (2 * half - chrome >= 180) { set(Math.min(MAX_TEXT, 2 * half - chrome)); return; }
    const leftRoom = dockLeft - GAP - barLeft - chrome;
    if (leftRoom >= 150) { bar.classList.add('lb-left'); set(Math.min(MAX_TEXT, leftRoom)); return; }
    bar.classList.add('lb-row2');
    set(Math.min(MAX_TEXT, W - 2 * barLeft - chrome));
  }
}
