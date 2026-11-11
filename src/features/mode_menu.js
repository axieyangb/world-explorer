// Mode menu, one step at a time: the modes first; the vehicle (or aircraft) list and the graphics choices
// each open on click. Picking anything closes the menu (main.js).
export class ModeMenu {
  constructor(app) {
    this.app = app;
    const $ = (id) => document.getElementById(id);
    this.menu = $('mode-vehicle-menu');
    this.vehBtn = $('menu-sec-vehicle');
    this.vehNow = $('menu-vehicle-now');
    this.vehList = $('vehicle-menu-list');
    this.gfxBtn = $('menu-sec-graphics');
    this.gfxNow = $('graphics-now');
    this.gfxRow = $('graphics-row');
    const modeBtn = $('mode-vehicle-btn');
    if (!this.menu || !this.vehBtn || !this.vehList || !this.gfxBtn || !this.gfxRow || !modeBtn) return;
    const fold = (btn, body) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.blur();
      this._set(btn, body, body.classList.contains('hidden'));
    });
    fold(this.vehBtn, this.vehList);
    fold(this.gfxBtn, this.gfxRow);
    // Every time the menu opens it starts folded.
    modeBtn.addEventListener('click', () => {
      this._set(this.vehBtn, this.vehList, false);
      this._set(this.gfxBtn, this.gfxRow, false);
      this.sync();
    });
    this.gfxRow.addEventListener('click', () => setTimeout(() => this.sync(), 0));
    this.sync();
  }

  _set(btn, body, open) {
    body.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  }

  /** Vehicle row only where there is something to pick (driving, or the two airliners); current choices as text. */
  sync() {
    if (!this.menu) return;
    const a = this.app;
    const relevant = (a.mode === 'drive' || a.mode === 'airliner') && !(a.kaiju && a.kaiju.active);
    this.vehBtn.classList.toggle('hidden', !relevant);
    if (!relevant) this._set(this.vehBtn, this.vehList, false);
    const cur = this.vehList.querySelector('.active span');
    if (this.vehNow && cur) this.vehNow.textContent = cur.textContent;
    const gfx = this.gfxRow.querySelector('.active');
    if (this.gfxNow && gfx) this.gfxNow.textContent = gfx.textContent;
  }
}
