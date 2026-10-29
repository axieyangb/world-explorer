// Touch controls for phones and tablets: a left-thumb joystick and right-thumb action buttons that
// change with the mode, plus two-finger pinch zoom on the 3D view.
//
// Every control is turned into the same KeyboardEvent the keyboard would send (dispatched on window),
// so drive / walk / helicopter / Kaiju modes, which all read keys, work unchanged. One-finger drag on
// the view already orbits the camera through the canvas pointer handlers in main.js.
//
// Shown automatically on coarse-pointer (touch-first) devices. ?touch=1 forces it on, ?touch=0 off.

const KEY_NAMES = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyQ: 'q', KeyF: 'f', KeyG: 'g', KeyH: 'h',
  KeyL: 'l', KeyR: 'r', KeyX: 'x', KeyC: 'c', KeyV: 'v', Space: ' ', ShiftLeft: 'Shift', Tab: 'Tab',
};

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  const mm = (s) => window.matchMedia && window.matchMedia(s).matches;
  return mm('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mm('(pointer: fine)'));
}

function sendKey(code, down) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
    code, key: KEY_NAMES[code] || code, bubbles: true, cancelable: true,
  }));
}

// [ui-mobile] Button sets per mode, laid out like GTA-mobile / mobile shooters: one primary button under the
// right thumb (bottom-right corner) and up to four small secondaries on an arc around it, plus an optional
// climb/descend column further left. Only what the current mode can use is shown.
//   code: key sent (or a function of the app); hold: key stays down while pressed, otherwise a tap;
//   action: a local action instead of a key; label may be a function of the app (state-dependent buttons);
//   slot: position on the arc in degrees (180 = left of the primary, 90 = above it); col: 0 = upper, 1 = lower
//   button of the altitude column.
const armed = (app) => Boolean(app.walkerWeapons && app.walkerWeapons.isArmed());
const LAYOUTS = {
  walk: [ // empty-handed
    { code: 'KeyF', label: 'Punch', hold: true, primary: true },
    { code: 'Space', label: 'Jump', hold: true, slot: 180 },
    { code: 'ShiftLeft', label: 'Run', hold: true, slot: 135 },
    { code: 'KeyE', label: 'Enter', slot: 90 },
  ],
  armed: [ // a gun in hand
    { code: 'Space', label: 'Fire', hold: true, primary: true },
    { action: 'aim', label: 'Aim', hold: true, slot: 180 },
    { code: 'KeyR', label: 'Reload', slot: 150 },
    { code: 'Tab', label: 'Weapon', slot: 120 },
    { code: 'KeyE', label: 'Enter', slot: 90 },
  ],
  drive: [
    { code: 'KeyW', label: 'Gas', hold: true, primary: true },
    { code: 'KeyS', label: 'Brake', hold: true, slot: 180 },
    { code: 'ShiftLeft', label: 'Boost', hold: true, slot: 150 },
    { code: 'KeyH', label: 'Horn', slot: 120 },
    { code: 'KeyE', label: 'Exit', slot: 90 },
  ],
  tank: [
    { code: 'Space', label: 'Fire', hold: true, primary: true },
    { code: 'ShiftLeft', label: 'Boost', hold: true, slot: 180 },
    { code: 'KeyE', label: 'Exit', slot: 90 },
  ],
  helicopter: [
    { code: 'Space', label: 'Fire', hold: true, primary: true },
    { code: (app) => (app.heliLanded ? 'KeyF' : 'KeyX'), label: (app) => (app.heliLanded ? 'Exit' : 'Rockets'), slot: 180 },
    { code: 'KeyL', label: 'Land', slot: 120 },
    { code: 'KeyE', label: '▲', title: 'Climb', hold: true, col: 0 },
    { code: 'KeyQ', label: '▼', title: 'Descend', hold: true, col: 1 },
  ],
  kaiju: [ // units are picked on Kaiju's own on-screen unit bar
    { code: 'Space', label: 'Fire', hold: true, primary: true },
    { code: 'KeyF', label: 'Missiles', slot: 180 },
    { code: 'KeyR', label: 'Super', slot: 120 },
    { code: 'KeyE', label: '▲', title: 'Climb', hold: true, col: 0 },
    { code: 'KeyQ', label: '▼', title: 'Descend', hold: true, col: 1 },
  ],
};
// Arc geometry (CSS px): primary diameter, secondary diameter, arc radius, altitude column offset.
const PRI = 62, SEC = 44, ARC = 86, COL_X = 148, COL_GAP = 10;

const CSS = `
body.touch-ui { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
body.touch-ui canvas#webgl-canvas { touch-action: none; }
#touch-controls { position: fixed; inset: 0; z-index: 18; pointer-events: none; }
#touch-controls.tc-hidden { display: none; }
/* Joystick: the whole lower-left area takes a thumb; the stick centres where it lands (dynamic origin).
   Kept below the minimap (top-left) so its taps still open the map. */
.tc-stick-zone {
  position: absolute; left: 0; bottom: 0; width: 46%; max-width: 420px;
  height: calc(100% - 156px - env(safe-area-inset-top, 0px)); pointer-events: auto; touch-action: none;
}
.tc-stick {
  position: absolute; left: calc(26px + env(safe-area-inset-left, 0px)); bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  width: 104px; height: 104px; border-radius: 50%; opacity: 0.45; transition: opacity 0.2s ease;
  background: rgba(10, 14, 20, 0.22); border: 1.5px solid rgba(255, 255, 255, 0.20);
}
.tc-stick.active { opacity: 1; transition: none; background: rgba(10, 14, 20, 0.30); }
.tc-knob {
  position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.50); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.30);
}
/* Action cluster: anchored on the primary button's centre in the bottom-right corner. */
.tc-cluster {
  position: absolute; width: 0; height: 0; pointer-events: none;
  right: calc(16px + ${PRI / 2}px + env(safe-area-inset-right, 0px)); bottom: calc(16px + ${PRI / 2}px + env(safe-area-inset-bottom, 0px));
}
.tc-btn {
  position: absolute; width: ${SEC}px; height: ${SEC}px; margin: -${SEC / 2}px 0 0 -${SEC / 2}px; border-radius: 50%; padding: 0;
  border: 1.5px solid rgba(255, 255, 255, 0.24); background: rgba(12, 16, 22, 0.30); color: rgba(242, 245, 249, 0.92);
  font: 600 10.5px/1.05 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; letter-spacing: 0.2px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55); touch-action: none; pointer-events: auto;
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.tc-btn.tc-primary {
  width: ${PRI}px; height: ${PRI}px; margin: -${PRI / 2}px 0 0 -${PRI / 2}px; font-size: 12.5px;
  background: rgba(58, 141, 255, 0.36); border-color: rgba(150, 200, 255, 0.55);
}
.tc-btn.tc-alt { font-size: 17px; }
.tc-btn.tc-long { font-size: 9px; letter-spacing: 0; }
.tc-btn.pressed { transform: scale(0.92); background: rgba(255, 255, 255, 0.32); }
.tc-rotate {
  position: fixed; left: 50%; top: calc(64px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); z-index: 40;
  padding: 7px 14px; border-radius: 999px; background: rgba(10, 12, 16, 0.75); color: #e8eef5;
  font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; pointer-events: none;
  transition: opacity 0.5s ease;
}
`;

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.enabled = isTouchDevice();
    if (!this.enabled) return;
    document.body.classList.add('touch-ui');
    const style = document.createElement('style');
    style.id = 'touch-controls-styles';
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.innerHTML = `
      <div class="tc-stick-zone"><div class="tc-stick"><div class="tc-knob"></div></div></div>
      <div class="tc-cluster"></div>`;
    document.body.appendChild(this.root);
    this.zone = this.root.querySelector('.tc-stick-zone');
    this.stick = this.root.querySelector('.tc-stick');
    this.knob = this.root.querySelector('.tc-knob');
    this.buttons = this.root.querySelector('.tc-cluster');

    this.held = new Map(); // key code -> controls currently holding it down
    // Touching the controls closes open menus, the same as touching the 3D view does (main.js).
    this.root.addEventListener('pointerdown', () => {
      for (const id of ['mode-vehicle-menu', 'location-search-panel']) {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      }
    }, true);
    this.layoutKey = '';
    this._bindStick();
    this._bindPinch();
    this._showRotateHint();
    // Release everything if the page is backgrounded mid-press (no pointerup arrives then).
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    setInterval(() => this._refresh(), 250);
    this._refresh();
  }

  // A key can be held by several controls at once (the stick and Gas both hold W): it goes up with the last.
  _press(code, src = 'btn') {
    let by = this.held.get(code);
    if (!by) { by = new Set(); this.held.set(code, by); }
    if (by.has(src)) return;
    by.add(src);
    if (by.size === 1) sendKey(code, true);
  }

  _release(code, src = 'btn') {
    const by = this.held.get(code);
    if (!by || !by.delete(src)) return;
    if (by.size) return;
    this.held.delete(code);
    sendKey(code, false);
  }

  releaseAll() {
    for (const code of [...this.held.keys()]) { this.held.delete(code); sendKey(code, false); }
    this._action('aim', false);
    this._resetKnob();
  }

  _tap(code) {
    sendKey(code, true);
    setTimeout(() => sendKey(code, false), 60);
  }

  // ── Joystick → W/A/S/D ────────────────────────────────────────────────────
  // [ui-mobile] Dynamic origin: the stick jumps to where the thumb lands (clamped on-screen) and goes back
  // to its resting spot, dimmed, when released.
  _bindStick() {
    let id = null;
    const radius = 42;
    const dead = 0.32;
    let ox = 0, oy = 0; // stick centre (client px) for the current touch
    const update = (e) => {
      let dx = (e.clientX - ox) / radius;
      let dy = (e.clientY - oy) / radius;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.knob.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
      const want = new Set();
      if (dy < -dead) want.add('KeyW');
      if (dy > dead) want.add('KeyS');
      if (dx < -dead) want.add('KeyA');
      if (dx > dead) want.add('KeyD');
      for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
        if (want.has(c)) this._press(c, 'stick');
        else this._release(c, 'stick');
      }
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) this._release(c, 'stick');
      this._resetKnob();
    };
    this.zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      try { this.zone.setPointerCapture(id); } catch (err) { /* synthetic / already-ended pointer */ }
      const z = this.zone.getBoundingClientRect();
      const half = this.stick.offsetWidth / 2 || 52;
      ox = Math.min(Math.max(e.clientX, z.left + half + 6), z.right - half);
      oy = Math.min(Math.max(e.clientY, z.top + half), z.bottom - half - 6);
      this.stick.style.left = `${ox - z.left - half}px`;
      this.stick.style.bottom = `${z.bottom - oy - half}px`;
      this.stick.classList.add('active');
      update(e);
      e.preventDefault();
    });
    this.zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) update(e); });
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
  }

  _resetKnob() {
    this.knob.style.transform = '';
    this.stick.classList.remove('active');
    this.stick.style.left = '';
    this.stick.style.bottom = '';
  }

  // ── Mode-dependent buttons ────────────────────────────────────────────────
  _modeKey() {
    const app = this.app;
    if (app.kaiju && app.kaiju.active) return 'kaiju';
    if (app.mode === 'drive' && app.isDrivingTank && app.isDrivingTank()) return 'tank';
    if (app.mode === 'walk') return armed(app) ? 'armed' : 'walk';
    return LAYOUTS[app.mode] ? app.mode : 'drive';
  }

  _refresh() {
    // Hide while a modal (world map, search) is up, so it never covers their controls.
    const mapOpen = this.app.mapSystem && this.app.mapSystem.isOpen;
    this.root.classList.toggle('tc-hidden', Boolean(mapOpen));
    const key = this._modeKey();
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.releaseAll();
      this.buttons.innerHTML = '';
      for (const def of LAYOUTS[key]) this.buttons.appendChild(this._makeButton(def));
    }
    for (const btn of this.buttons.children) {
      if (typeof btn._def.label === 'function') {
        btn.textContent = btn._def.label(this.app);
        btn.classList.toggle('tc-long', !btn._def.primary && btn.textContent.length > 5);
      }
    }
  }

  // Centre of a button relative to the primary's centre (the cluster origin).
  static _place(def) {
    if (def.primary) return [0, 0];
    if (def.col !== undefined) return [-COL_X, def.col === 0 ? -(SEC + COL_GAP) : 0];
    const a = (def.slot * Math.PI) / 180;
    return [Math.cos(a) * ARC, -Math.sin(a) * ARC];
  }

  _makeButton(def) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tc-btn${def.primary ? ' tc-primary' : ''}${def.col !== undefined ? ' tc-alt' : ''}`;
    const [x, y] = TouchControls._place(def);
    btn.style.left = `${x}px`;
    btn.style.top = `${y}px`;
    btn._def = def;
    btn.textContent = typeof def.label === 'function' ? def.label(this.app) : def.label;
    if (!def.primary && btn.textContent.length > 5) btn.classList.add('tc-long');
    btn.setAttribute('aria-label', def.title || btn.textContent);
    let id = null, code = null;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      try { btn.setPointerCapture(id); } catch (err) { /* synthetic / already-ended pointer */ }
      btn.classList.add('pressed');
      if (def.action) { this._action(def.action, true); return; }
      code = typeof def.code === 'function' ? def.code(this.app) : def.code; // held key is fixed for this press
      if (def.hold) this._press(code, btn);
      else this._tap(code);
    });
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      btn.classList.remove('pressed');
      if (def.action) { this._action(def.action, false); return; }
      if (def.hold) this._release(code, btn);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    return btn;
  }

  // Aim (held): pull the camera in over the shoulder; release restores the zoom.
  _action(name, down) {
    const app = this.app;
    if (name !== 'aim') return;
    if (down) {
      this._aimZoom = app.camZoom || 1;
      app.camZoom = Math.min(this._aimZoom, 0.55);
    } else if (this._aimZoom !== undefined) {
      app.camZoom = this._aimZoom;
      this._aimZoom = undefined;
    }
  }

  // ── Two-finger pinch on the view → camera zoom ────────────────────────────
  _bindPinch() {
    const canvas = this.app.canvas;
    const pts = new Map();
    let startDist = 0, startZoom = 1, startTop = 0;
    const dist = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        startDist = dist();
        startZoom = this.app.camZoom || 1;
        startTop = this.app.topDownHeight || 0;
        if (this.app.heli) this.app.heli.cancelTrigger(); // a second finger means zoom, not a cannon tap
      }
    }, true);
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size < 2 || startDist < 10) return;
      const ratio = startDist / Math.max(10, dist());
      if (this.app.camMode === 'topdown') {
        this.app.topDownHeight = Math.min(650, Math.max(40, startTop * ratio));
      } else {
        this.app.camZoom = Math.min(3.8, Math.max(0.45, startZoom * ratio));
      }
      e.stopImmediatePropagation(); // don't also orbit the camera while pinching
    }, true);
    const lift = (e) => { pts.delete(e.pointerId); };
    canvas.addEventListener('pointerup', lift, true);
    canvas.addEventListener('pointercancel', lift, true);
  }

  _showRotateHint() {
    const portrait = () => window.innerHeight > window.innerWidth;
    if (!portrait()) return;
    const el = document.createElement('div');
    el.className = 'tc-rotate';
    el.textContent = 'Turn your phone sideways for the best view';
    document.body.appendChild(el);
    const hide = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); };
    setTimeout(hide, 6000);
    window.addEventListener('resize', () => { if (!portrait()) hide(); }, { once: true });
  }
}
