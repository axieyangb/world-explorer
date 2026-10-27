// places-info: one entry point for main.js.
//   - PlacesInfoSystem: civic / transit / parking props + storefront name signs (3D, instanced)
//   - BorderWatch: "Welcome to …" toast when crossing a country / state border
//   - InfoCards: quiet Wikipedia landmark card for the place you're near / looking at
import { PlacesInfoSystem } from './pi_system.js';
import { BorderWatch } from './pi_borders.js';
import { InfoCards } from './pi_cards.js';

const CSS = `
.pi-border-toast {
  position: fixed; left: 50%; top: calc(78px + env(safe-area-inset-top, 0px)); z-index: 35;
  transform: translate(-50%, -6px); opacity: 0; pointer-events: none;
  font: 500 15px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "PingFang SC", sans-serif;
  letter-spacing: 0.4px; color: var(--text-main, #eef0f2); text-shadow: 0 1px 8px rgba(0,0,0,0.55);
  padding: 7px 16px; border-radius: 999px;
  background: var(--glass-bg, rgba(20, 22, 26, 0.38)); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.pi-border-toast.show { opacity: 1; transform: translate(-50%, 0); }
.pi-card {
  position: fixed; left: calc(22px + env(safe-area-inset-left, 0px)); bottom: calc(262px + env(safe-area-inset-bottom, 0px));
  z-index: 21; width: 248px; max-width: calc(100vw - 44px); box-sizing: border-box;
  display: flex; flex-direction: column; overflow: hidden; cursor: default;
  border-radius: 14px; background: var(--glass-bg-elevated, rgba(24, 26, 31, 0.72));
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08)); color: var(--text-main, #eef0f2);
  font: 400 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "PingFang SC", sans-serif;
  opacity: 0; transform: translateY(6px); pointer-events: none; transition: opacity 0.35s ease, transform 0.35s ease;
}
.pi-card.show { opacity: 1; transform: none; pointer-events: auto; }
.pi-card.expandable { cursor: pointer; }
.pi-card-body { padding: 9px 12px 10px; }
.pi-card-title { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pi-card-desc { opacity: 0.66; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pi-card-img, .pi-card-extract, .pi-card-link { display: none; }
.pi-card.expanded .pi-card-img { display: block; width: 100%; max-height: 132px; object-fit: cover; }
.pi-card.expanded .pi-card-desc { white-space: normal; }
.pi-card.expanded .pi-card-extract { display: block; margin-top: 6px; opacity: 0.85; max-height: 9.8em; overflow: hidden; }
.pi-card.expanded .pi-card-link { display: inline-block; margin-top: 6px; font-size: 11px; color: #8cc4ff; text-decoration: none; opacity: 0.8; }
.pi-card-links { display: flex; gap: 12px; align-items: baseline; }
.pi-card-osm { margin-top: 4px; font-size: 11px; color: #8cc4ff; text-decoration: none; opacity: 0.7; }
.pi-card-osm:hover, .pi-card.expanded .pi-card-link:hover { opacity: 1; text-decoration: underline; }
.pi-card.expanded .pi-card-osm { margin-top: 6px; }
`;

export class PlacesInfo {
  constructor(app) {
    this.app = app;
    if (typeof document !== 'undefined' && !document.getElementById('pi-styles')) {
      const st = document.createElement('style');
      st.id = 'pi-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.system = new PlacesInfoSystem(app.scene);
    this.borders = new BorderWatch(app);
    this.cards = new InfoCards(app);
  }

  update(dt) {
    const app = this.app;
    this.system.update(dt, app.camera, app.loadedChunks);
    this.borders.update(dt);
    this.cards.update(dt);
  }
}
