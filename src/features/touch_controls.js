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
  KeyL: 'l', KeyR: 'r', KeyX: 'x', KeyC: 'c', KeyV: 'v', Space: ' ', ShiftLeft: 'Shift',
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

// Button sets per mode. hold: key stays down while pressed; otherwise a tap (down + up).
// label may be a function of the app for state-dependent buttons.
const LAYOUTS = {
  helicopter: [
    { code: 'Space', label: 'Fire', hold: true, cls: 'tc-primary' },
    { code: 'KeyE', label: '▲', title: 'Climb', hold: true, cls: 'tc-alt' },
    { code: 'KeyQ', label: '▼', title: 'Descend', hold: true, cls: 'tc-alt' },
    { code: 'KeyF', label: (app) => (app.heliLanded ? 'Exit' : 'Rockets') },
    { code: 'KeyL', label: 'Land' },
  ],
  drive: [
    { code: 'ShiftLeft', label: 'Boost', hold: true, cls: 'tc-primary' },
    { code: 'Space', label: 'Brake', hold: true },
    { code: 'KeyH', label: 'Horn' },
    { code: 'KeyG', label: 'Car' },
    { code: 'KeyE', label: 'Exit' },
  ],
  tank: [
    { code: 'Space', label: 'Fire', hold: true, cls: 'tc-primary' },
    { code: 'ShiftLeft', label: 'Boost', hold: true },
    { code: 'KeyG', label: 'Car' },
    { code: 'KeyE', label: 'Exit' },
  ],
  walk: [
    { code: 'Space', label: 'Fire', hold: true, cls: 'tc-primary' },
    { code: 'ShiftLeft', label: 'Run', hold: true },
    { code: 'KeyX', label: 'RPG' },
    { code: 'KeyR', label: 'Weapon' },
    { code: 'KeyF', label: 'Punch' },
    { code: 'KeyE', label: 'Enter' },
  ],
  kaiju: [
    { code: 'Space', label: 'Fire', hold: true, cls: 'tc-primary' },
    { code: 'KeyE', label: '▲', title: 'Climb', hold: true, cls: 'tc-alt' },
    { code: 'KeyQ', label: '▼', title: 'Descend', hold: true, cls: 'tc-alt' },
    { code: 'KeyF', label: 'Missiles' },
    { code: 'KeyR', label: 'Super' },
  ], // units are picked on Kaiju's own on-screen unit bar
};

const CSS = `
body.touch-ui { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
body.touch-ui canvas#webgl-canvas { touch-action: none; }
#touch-controls { position: fixed; inset: 0; z-index: 18; pointer-events: none; }
#touch-controls.tc-hidden { display: none; }
.tc-stick-zone {
  position: absolute; left: 0; bottom: 0; width: 42%; height: 58%; pointer-events: auto; touch-action: none;
}
.tc-stick {
  position: absolute; left: calc(28px + env(safe-area-inset-left, 0px)); bottom: calc(28px + env(safe-area-inset-bottom, 0px));
  width: 124px; height: 124px; border-radius: 50%;
  background: rgba(10, 14, 20, 0.30); border: 1.5px solid rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.tc-stick.active { background: rgba(10, 14, 20, 0.42); }
.tc-knob {
  position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.55); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
.tc-buttons {
  /* Filled from the bottom-right corner: the first button of a layout sits under the thumb. */
  position: absolute; right: calc(18px + env(safe-area-inset-right, 0px)); bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  width: 206px; display: flex; flex-direction: row-reverse; flex-wrap: wrap-reverse; gap: 10px; align-items: center;
  pointer-events: auto;
}
.tc-altpair {
  /* Climb above descend, just left of the action cluster. */
  position: absolute; right: calc(236px + env(safe-area-inset-right, 0px)); bottom: calc(22px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 10px; pointer-events: auto;
}
.tc-altpair:empty { display: none; }
@media (orientation: portrait) {
  .tc-altpair { right: auto; left: calc(160px + env(safe-area-inset-left, 0px)); }
}
.tc-btn {
  width: 62px; height: 62px; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, 0.28);
  background: rgba(12, 16, 22, 0.46); color: #f2f5f9; font: 600 12px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); touch-action: none; padding: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.30);
}
.tc-btn.tc-primary { width: 74px; height: 74px; background: rgba(58, 141, 255, 0.55); border-color: rgba(150, 200, 255, 0.6); font-size: 14px; }
.tc-btn.tc-alt { font-size: 20px; }
.tc-btn.pressed { transform: scale(0.93); background: rgba(255, 255, 255, 0.35); }
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
      <div class="tc-altpair"></div>
      <div class="tc-buttons"></div>`;
    document.body.appendChild(this.root);
    this.zone = this.root.querySelector('.tc-stick-zone');
    this.stick = this.root.querySelector('.tc-stick');
    this.knob = this.root.querySelector('.tc-knob');
    this.buttons = this.root.querySelector('.tc-buttons');
    this.altPair = this.root.querySelector('.tc-altpair');

    this.held = new Set(); // key codes this module currently holds down
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

  _press(code) {
    if (this.held.has(code)) return;
    this.held.add(code);
    sendKey(code, true);
  }

  _release(code) {
    if (!this.held.delete(code)) return;
    sendKey(code, false);
  }

  releaseAll() {
    for (const code of [...this.held]) this._release(code);
    this._resetKnob();
  }

  _tap(code) {
    sendKey(code, true);
    setTimeout(() => sendKey(code, false), 60);
  }

  // ── Joystick → W/A/S/D ────────────────────────────────────────────────────
  _bindStick() {
    let id = null;
    const radius = 50;
    const dead = 0.32;
    const update = (e) => {
      const r = this.stick.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / radius;
      let dy = (e.clientY - (r.top + r.height / 2)) / radius;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.knob.style.transform = `translate(${dx * radius}px, ${dy * radius}px)`;
      const want = new Set();
      if (dy < -dead) want.add('KeyW');
      if (dy > dead) want.add('KeyS');
      if (dx < -dead) want.add('KeyA');
      if (dx > dead) want.add('KeyD');
      for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
        if (want.has(c)) this._press(c);
        else this._release(c);
      }
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) this._release(c);
      this._resetKnob();
    };
    this.zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      this.zone.setPointerCapture(id);
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
  }

  // ── Mode-dependent buttons ────────────────────────────────────────────────
  _modeKey() {
    const app = this.app;
    if (app.kaiju && app.kaiju.active) return 'kaiju';
    if (app.mode === 'drive' && app.isDrivingTank && app.isDrivingTank()) return 'tank';
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
      this.altPair.innerHTML = '';
      for (const def of LAYOUTS[key]) {
        (def.cls === 'tc-alt' ? this.altPair : this.buttons).appendChild(this._makeButton(def));
      }
    }
    for (const btn of this.buttons.children) {
      if (typeof btn._def.label === 'function') btn.textContent = btn._def.label(this.app);
    }
  }

  _makeButton(def) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tc-btn ${def.cls || ''}`;
    btn._def = def;
    btn.textContent = typeof def.label === 'function' ? def.label(this.app) : def.label;
    btn.setAttribute('aria-label', def.title || btn.textContent);
    let id = null;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      btn.setPointerCapture(id);
      btn.classList.add('pressed');
      if (def.hold) this._press(def.code);
      else this._tap(def.code);
    });
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      btn.classList.remove('pressed');
      if (def.hold) this._release(def.code);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    return btn;
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
