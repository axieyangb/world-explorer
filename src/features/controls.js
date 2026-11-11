// One table of player actions and their keys, per mode.
// The hint bar, the full key list (press ?), the dock tooltips and the mode-menu key caps are all drawn from
// it, and main.js reads its one-shot key codes from KEY, so a label cannot disagree with its binding.
// Held keys (move, climb, boost, fire) are still read with keys.has("...") in main.js and the feature files;
// when one of those changes, change its row here too.
import { t, getLang, onLanguageChange } from '../i18n.js';

// code: KeyboardEvent.code values (first one is the binding main.js uses); shift: needs Shift;
// show: text for the key cap when the codes do not read well; hint: shown in the short hint bar;
// when: 'armed' / 'unarmed' (on foot), 'tank' / 'car' (driving); list: false keeps a row out of the key list.
// Labels go through t(): the English text is the key, and "Label@mode" can override it for one mode.
export const CONTROLS = {
  helicopter: [
    { id: 'heli_move', code: ['KeyW', 'KeyS'], label: 'Move', hint: true },
    { id: 'heli_turn', code: ['KeyA', 'KeyD'], label: 'Turn', hint: true },
    { id: 'heli_alt', code: ['KeyQ', 'KeyE'], label: 'Down / Up', hint: true },
    { id: 'heli_rockets', code: ['KeyX'], label: 'Rockets', hint: true },
    { id: 'heli_exit', code: ['KeyF'], label: 'Exit', hint: true },
    { id: 'heli_strafe', code: ['ArrowLeft', 'ArrowRight'], label: 'Strafe' },
    { id: 'heli_boost', code: ['ShiftLeft'], label: 'Boost' },
    { id: 'heli_cannon', code: ['Space'], label: 'Cannon' },
    { id: 'heli_land', code: ['KeyL'], label: 'Land' },
  ],
  drive: [
    { id: 'drive_move', code: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], show: 'WASD', label: 'Drive', hint: true },
    { id: 'drive_brake', code: ['Space'], label: 'Brake', hint: true, when: 'car' },
    { id: 'tank_fire', code: ['Space'], label: 'Fire', hint: true, when: 'tank' },
    { id: 'drive_exit', code: ['KeyE'], label: 'Exit', hint: true },
    { id: 'drive_boost', code: ['ShiftLeft'], label: 'Boost' },
    { id: 'drive_vehicle', code: ['KeyV'], label: 'Vehicle' },
    { id: 'drive_horn', code: ['KeyH'], label: 'Horn' },
  ],
  walk: [
    { id: 'walk_move', code: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], show: 'WASD', label: 'Walk', hint: true },
    { id: 'walk_run', code: ['ShiftLeft'], label: 'Run', hint: true, when: 'unarmed' },
    { id: 'walk_jump', code: ['Space'], label: 'Jump', hint: true, when: 'unarmed' },
    { id: 'walk_jump_fire', code: ['Space'], label: 'Jump / Shoot', hint: true, when: 'armed' },
    { id: 'walk_reload', code: ['KeyR'], label: 'Reload', hint: true, when: 'armed' },
    { id: 'walk_enter', code: ['KeyE'], label: 'Enter', hint: true },
    { id: 'walk_run2', code: ['ShiftLeft'], label: 'Run', when: 'armed' },
    { id: 'walk_punch', code: ['KeyF'], label: 'Punch' },
    { id: 'walk_weapon', code: ['Tab'], label: 'Weapon', when: 'armed' },
    { id: 'walk_rpg', code: ['KeyX'], label: 'RPG', when: 'armed' },
  ],
  airliner: [
    { id: 'jet_thrust', code: ['KeyW', 'KeyS'], label: 'Thrust / Brake', hint: true },
    { id: 'jet_steer', code: ['KeyA', 'KeyD'], label: 'Steer', hint: true },
    { id: 'jet_climb', code: ['Space'], label: 'Climb', hint: true },
    { id: 'jet_exit', code: ['KeyE'], label: 'Exit', hint: true },
    { id: 'jet_dive', code: ['KeyC'], label: 'Nose down' },
    { id: 'jet_gear', code: ['KeyG'], label: 'Gear' },
    { id: 'jet_livery', code: ['KeyL'], label: 'Livery' },
  ],
  boat: [
    { id: 'boat_move', code: ['KeyW', 'KeyS'], label: 'Throttle', hint: true },
    { id: 'boat_steer', code: ['KeyA', 'KeyD'], label: 'Steer', hint: true },
    { id: 'boat_exit', code: ['KeyE'], label: 'Exit', hint: true },
    { id: 'boat_boost', code: ['ShiftLeft'], label: 'Boost' },
  ],
  // every mode
  any: [
    { id: 'camera', code: ['KeyV'], label: 'Camera' }, // Shift+V while driving, see keyCaps()
    { id: 'search', code: ['Slash'], label: 'Search' },
    { id: 'map', code: ['KeyM'], label: 'Map' },
    { id: 'fsd', code: ['KeyN'], label: 'Self-drive' },
    { id: 'modes', code: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], show: '1–4', label: 'Mode' },
    { id: 'mode_drive', code: ['Digit1'], list: false },
    { id: 'mode_walk', code: ['Digit2'], list: false },
    { id: 'mode_helicopter', code: ['Digit3'], list: false },
    { id: 'mode_kaiju', code: ['Digit4'], list: false },
    { id: 'vehicle_next', code: ['KeyG'], label: 'Next vehicle' },
    { id: 'fullscreen', code: ['KeyF'], shift: true, label: 'Full screen' },
    { id: 'help', code: ['Slash'], shift: true, show: '?', label: 'Keys', list: false },
  ],
};

const BY_ID = {};
for (const rows of Object.values(CONTROLS)) for (const r of rows) BY_ID[r.id] = r;

/** id -> KeyboardEvent.code of the action's (first) key, for main.js key handling. */
export const KEY = Object.fromEntries(Object.entries(BY_ID).map(([id, r]) => [id, r.code[0]]));

const CAP = { Space: 'Space', Slash: '/', ShiftLeft: 'Shift', Tab: 'Tab', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
const cap = (code) => CAP[code] || code.replace(/^Key|^Digit/, '');

/** Text of the key cap for an action, e.g. "Q/E", "X", "Shift+V". */
export function keyCaps(id, mode = '') {
  const r = BY_ID[id];
  if (!r) return '';
  if (r.show) return r.show;
  const caps = r.code.map(cap).join('/');
  // V alone changes the vehicle while driving, so the camera moves to Shift+V there (main.js keydown).
  const shift = r.shift || (id === 'camera' && mode === 'drive');
  return shift ? `Shift+${caps}` : caps;
}

function rowsFor(mode, ctx) {
  return (CONTROLS[mode] || CONTROLS.drive).filter((r) => {
    if (r.when === 'armed') return ctx.armed;
    if (r.when === 'unarmed') return !ctx.armed;
    if (r.when === 'tank') return ctx.tank;
    if (r.when === 'car') return !ctx.tank;
    return true;
  });
}

function label(r, mode) {
  const k = `${r.label}@${mode}`;
  const v = t(k);
  return v === k ? t(r.label) : v;
}

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const FADE_AFTER_MS = 4000;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The hint bar (a few keys for the current mode, fading once the player moves) and the full list behind "?". */
export class ControlsHint {
  constructor(app) {
    this.app = app;
    this.bar = document.getElementById('hud-controls-hint');
    if (!this.bar) return;
    this.bar.innerHTML = '<span class="hint-items"></span><button type="button" class="hint-more"></button>';
    this.items = this.bar.querySelector('.hint-items');
    this.more = this.bar.querySelector('.hint-more');
    this.panel = document.createElement('div');
    this.panel.id = 'keys-panel';
    this.panel.className = 'keys-panel hidden';
    document.body.appendChild(this.panel);
    this._sig = '';
    this._fadeAt = 0;

    this.more.addEventListener('click', (e) => { e.stopPropagation(); this.more.blur(); this.togglePanel(); });
    this.panel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => this.togglePanel(false));
    window.addEventListener('keydown', (e) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      if (e.code === 'Escape') this.togglePanel(false);
      else if (e.code === KEY.help && e.shiftKey && !e.repeat) { e.preventDefault(); this.togglePanel(); }
    });
    onLanguageChange(() => this.show());
    setInterval(() => this._tick(), 400);
  }

  _ctx() {
    const a = this.app;
    return {
      mode: a.mode,
      tank: a.mode === 'drive' && typeof a.isDrivingTank === 'function' && a.isDrivingTank(),
      armed: a.mode === 'walk' && Boolean(a.walkerWeapons && a.walkerWeapons.isArmed()),
    };
  }

  /** Draw the hint for the current mode and show it in full again. */
  show() {
    if (!this.bar) return;
    const ctx = this._ctx();
    this._sig = `${ctx.mode}|${ctx.tank}|${ctx.armed}|${getLang()}`;
    this.items.innerHTML = rowsFor(ctx.mode, ctx)
      .filter((r) => r.hint)
      .map((r) => `<span class="hint-item"><b>${esc(keyCaps(r.id, ctx.mode))}</b> ${esc(label(r, ctx.mode))}</span>`)
      .join('');
    this.more.innerHTML = `<b>${esc(keyCaps('help'))}</b> ${esc(t('Keys'))}`;
    this.bar.classList.remove('faded');
    this._fadeAt = 0;
    this._syncLabels(ctx.mode);
    if (!this.panel.classList.contains('hidden')) this._renderPanel();
  }

  _tick() {
    if (!this.bar) return;
    const ctx = this._ctx();
    if (`${ctx.mode}|${ctx.tank}|${ctx.armed}|${getLang()}` !== this._sig) { this.show(); return; }
    if (this.bar.classList.contains('faded')) return;
    const now = performance.now();
    if (!this._fadeAt) {
      const keys = this.app.keys;
      if (keys && MOVE_KEYS.some((k) => keys.has(k))) this._fadeAt = now + FADE_AFTER_MS;
    } else if (now >= this._fadeAt && this.panel.classList.contains('hidden')) {
      this.bar.classList.add('faded');
    }
  }

  togglePanel(open = this.panel.classList.contains('hidden')) {
    if (!this.bar) return;
    if (open) this._renderPanel();
    this.panel.classList.toggle('hidden', !open);
  }

  _renderPanel() {
    const ctx = this._ctx();
    const row = (r) => `<div class="keys-row"><kbd>${esc(keyCaps(r.id, ctx.mode))}</kbd><span>${esc(label(r, ctx.mode))}</span></div>`;
    this.panel.innerHTML =
      `<div class="keys-col">${rowsFor(ctx.mode, ctx).map(row).join('')}</div>` +
      `<div class="keys-col">${CONTROLS.any.filter((r) => r.list !== false).map(row).join('')}</div>`;
  }

  // Tooltips and key caps elsewhere in the HUD that name a key.
  _syncLabels(mode) {
    const tip = (id, label, keys) => {
      const el = document.getElementById(id);
      if (el) el.title = `${t(label)} [${keys}]`;
    };
    tip('camera-btn', 'Camera', keyCaps('camera', mode));
    tip('fsd-btn', 'Self-drive', keyCaps('fsd'));
    tip('map-btn', 'Map', keyCaps('map'));
    tip('minimap-container', 'Map', keyCaps('map'));
    const modeBtn = document.getElementById('mode-vehicle-btn');
    if (modeBtn) modeBtn.title = t('Mode');
    for (const btn of document.querySelectorAll('#mode-vehicle-menu .popover-mode-btn[data-mode]')) {
      const id = `mode_${btn.dataset.mode}`;
      let k = btn.querySelector('kbd');
      if (!BY_ID[id]) { if (k) k.remove(); continue; }
      if (!k) { k = document.createElement('kbd'); btn.appendChild(k); }
      k.textContent = keyCaps(id);
    }
    const vk = document.querySelector('#menu-sec-vehicle kbd');
    if (vk) { vk.textContent = keyCaps('vehicle_next'); vk.classList.toggle('hidden', mode !== 'drive'); } // G is the gear in a jet
  }
}
