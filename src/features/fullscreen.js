// Full screen toggle: dock pill (#fullscreen-btn) + Shift+F.
// Uses the Fullscreen API (webkit-prefixed on Safari). If the page may not go full screen (e.g. an iframe without
// allow="fullscreen"), shows a one-line hint to use the browser shortcut instead.
import { getLang, onLanguageChange } from '../i18n.js';

const doc = typeof document !== 'undefined' ? document : null;

function fsElement() {
  return doc.fullscreenElement || doc.webkitFullscreenElement || null;
}

function fsEnabled() {
  const v = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled;
  return v !== false;
}

function isTyping(e) {
  const t = e.target;
  const tag = t && t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
}

const TEXT = {
  en: { enter: 'Full screen (Shift+F)', exit: 'Exit full screen (Shift+F)', hint: 'Press ⌃⌘F (Mac) or F11 to go full screen' },
  zh: { enter: '全屏 (Shift+F)', exit: '退出全屏 (Shift+F)', hint: '按 ⌃⌘F（Mac）或 F11 进入全屏' },
};
const tx = () => TEXT[getLang() === 'zh' ? 'zh' : 'en'];

export class FullscreenToggle {
  constructor() {
    if (!doc) return;
    this.btn = doc.getElementById('fullscreen-btn');
    this._toastTimer = 0;
    // Capture phase on window, registered before other key handlers (Kaiju swallows F for missiles).
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyF' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.toggle();
    }, true);
    if (this.btn) this.btn.addEventListener('click', () => this.toggle());
    const sync = () => this._sync();
    doc.addEventListener('fullscreenchange', sync);
    doc.addEventListener('webkitfullscreenchange', sync);
    try { onLanguageChange(sync); } catch (_) { /* optional */ }
    this._sync();
  }

  get active() {
    return Boolean(fsElement());
  }

  async toggle() {
    if (this.active) {
      try {
        await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen());
      } catch (_) { /* already out */ }
      return;
    }
    const el = doc.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || !fsEnabled()) { this._hint(); return; }
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && typeof p.then === 'function') await p;
      else setTimeout(() => { if (!this.active) this._hint(); }, 400); // webkit: no promise
    } catch (_) {
      this._hint();
    }
  }

  _sync() {
    const on = this.active;
    if (this.btn) {
      this.btn.classList.toggle('is-fullscreen', on);
      this.btn.title = on ? tx().exit : tx().enter;
      this.btn.setAttribute('aria-label', this.btn.title);
      this.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // Renderer/camera follow the new viewport (the app listens to window resize).
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  _hint() {
    let el = doc.getElementById('hud-toast');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'hud-toast';
      el.className = 'hud-toast';
      el.setAttribute('role', 'status');
      doc.body.appendChild(el);
    }
    el.textContent = tx().hint;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }
}
