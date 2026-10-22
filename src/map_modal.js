import { t, getBookmarkText, translateStationName } from './i18n.js';

/**
 * Renders both the bottom-left GTA Radar Minimap and the full-screen
 * 40km x 40km Interactive Vector GIS & A* Navigation Map Modal.
 */
export class MapSystem {
  constructor(overview, navigator, onTeleportTo) {
    this.overview = overview;
    this.navigator = navigator;
    this.onTeleportTo = onTeleportTo;

    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.gpsStatusEl = document.getElementById('gps-status');

    this.modalEl = document.getElementById('world-map-modal');
    this.worldCanvas = document.getElementById('world-map-canvas');
    this.worldCtx = this.worldCanvas.getContext('2d');
    this.tooltipEl = document.getElementById('world-map-tooltip');

    this.isOpen = false;
    this.clickMode = 'teleport'; // 'teleport' (left-click teleports to exact point) or 'nav' (left-click computes A* route)
    // Camera state for full-screen map: center (x, z) in world meters, scale in px/meter
    this.camX = 0;
    this.camZ = 0;
    this.scale = 0.022; // 40,000m * 0.022 = 880px full city view
    this.dragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragMoved = false;

    this._bindEvents();
  }

  _bindEvents() {
    const modeBtn = document.getElementById('btn-map-click-mode');
    if (modeBtn) {
      modeBtn.dataset.mode = this.clickMode;
      modeBtn.addEventListener('click', () => {
        this.clickMode = this.clickMode === 'teleport' ? 'nav' : 'teleport';
        modeBtn.dataset.mode = this.clickMode;
        modeBtn.classList.toggle('active', this.clickMode === 'teleport');
        modeBtn.textContent =
          this.clickMode === 'teleport' ? t('btn_map_mode_teleport') : t('btn_map_mode_nav');
      });
    }

    const mmEl = document.getElementById('minimap-container') || document.getElementById('hud-radar');
    if (mmEl) {
      mmEl.addEventListener('click', () => this.toggleModal(true));
    }
    const mapBtn = document.getElementById('map-btn') || document.getElementById('btn-map-open');
    if (mapBtn) {
      mapBtn.addEventListener('click', () => this.toggleModal(true));
    }
    document.getElementById('btn-map-close').addEventListener('click', () => {
      this.toggleModal(false);
    });
    document.getElementById('btn-map-reset-view').addEventListener('click', () => {
      this.camX = 0;
      this.camZ = 0;
      this.scale = Math.min(this.worldCanvas.width, this.worldCanvas.height) / 42000;
      this.renderWorldMap();
    });
    document.getElementById('btn-map-center-player').addEventListener('click', () => {
      if (this.lastPlayerPos) {
        this.camX = this.lastPlayerPos.x;
        this.camZ = this.lastPlayerPos.z;
        this.scale = Math.max(this.scale, 0.14);
        this.renderWorldMap();
      }
    });
    document.getElementById('btn-map-clear-gps').addEventListener('click', () => {
      this.navigator.clearRoute();
      this.renderWorldMap();
    });

    // Continuous deltaMode-normalized cursor-centered wheel zoom
    this.worldCanvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const modeScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
        const normDelta = e.deltaY * modeScale;
        const rawStep = -normDelta * 0.0018;
        const delta = Math.max(-0.3, Math.min(0.3, rawStep));
        if (Math.abs(delta) < 0.002) return;

        const nextScale = Math.max(0.015, Math.min(2.5, this.scale * Math.exp(delta)));
        const rect = this.worldCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const wx = this.screenToWorldX(cx);
        const wz = this.screenToWorldZ(cy);

        this.scale = nextScale;
        this.camX = wx - (cx - this.worldCanvas.width * 0.5) / this.scale;
        this.camZ = wz - (cy - this.worldCanvas.height * 0.5) / this.scale;
        this.renderWorldMap();
      },
      { passive: false }
    );

    this.worldCanvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      this.dragging = true;
      this.dragMoved = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.worldCanvas.setPointerCapture(e.pointerId);
    });

    this.worldCanvas.addEventListener('pointermove', (e) => {
      const rect = this.worldCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (this.dragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (Math.hypot(dx, dy) > 4) this.dragMoved = true;
        this.camX -= dx / this.scale;
        this.camZ -= dy / this.scale;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.renderWorldMap();
        return;
      }

      this._updateHoverTooltip(sx, sy, e.clientX, e.clientY);
    });

    this.worldCanvas.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.worldCanvas.releasePointerCapture(e.pointerId);
      if (!this.dragMoved && e.button === 0) {
        const rect = this.worldCanvas.getBoundingClientRect();
        const wx = this.screenToWorldX(e.clientX - rect.left);
        const wz = this.screenToWorldZ(e.clientY - rect.top);
        if (this.clickMode === 'teleport' || e.shiftKey) {
          this.onTeleportTo(wx, wz, t('map_teleport_label'), false);
          this.toggleModal(false);
        } else if (this.lastPlayerPos) {
          this.navigator.computeRoute(this.lastPlayerPos.x, this.lastPlayerPos.z, wx, wz, t('map_nav_dest'));
          this.renderWorldMap();
        }
      }
    });

    this.worldCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = this.worldCanvas.getBoundingClientRect();
      const wx = this.screenToWorldX(e.clientX - rect.left);
      const wz = this.screenToWorldZ(e.clientY - rect.top);
      this.onTeleportTo(wx, wz, t('map_right_teleport_label'), false);
      this.toggleModal(false);
    });

    window.addEventListener('resize', () => {
      if (this.isOpen) {
        this._resizeWorldCanvas();
        this.renderWorldMap();
      }
    });
  }

  setOverview(overview) {
    this.overview = overview;
    this.camX = 0;
    this.camZ = 0;
    if (this.isOpen) this.renderWorldMap();
  }

  toggleModal(forceState) {
    this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
    this.modalEl.classList.toggle('hidden', !this.isOpen);
    if (this.isOpen) {
      this._resizeWorldCanvas();
      this.renderWorldMap();
    } else {
      this.tooltipEl.classList.add('hidden');
    }
  }

  _resizeWorldCanvas() {
    this.worldCanvas.width = window.innerWidth;
    this.worldCanvas.height = window.innerHeight;
  }

  worldToScreenX(wx) {
    return this.worldCanvas.width * 0.5 + (wx - this.camX) * this.scale;
  }

  worldToScreenY(wz) {
    return this.worldCanvas.height * 0.5 + (wz - this.camZ) * this.scale;
  }

  screenToWorldX(sx) {
    return this.camX + (sx - this.worldCanvas.width * 0.5) / this.scale;
  }

  screenToWorldZ(sy) {
    return this.camZ + (sy - this.worldCanvas.height * 0.5) / this.scale;
  }

  _updateHoverTooltip(sx, sy, clientX, clientY) {
    const wx = this.screenToWorldX(sx);
    const wz = this.screenToWorldZ(sy);
    const meta = this.overview.meta;
    const lat = (meta.centerLat - wz / meta.mPerDegLat).toFixed(5);
    const lon = (meta.centerLon + wx / meta.mPerDegLon).toFixed(5);

    // Check if near any bookmark or station
    let hitLabel = null;
    const snapR = 14 / this.scale;
    for (const bm of this.overview.bookmarks) {
      if (Math.hypot(bm.x - wx, bm.z - wz) < snapR) {
        const bt = getBookmarkText(bm);
        hitLabel = `⭐ ${bt.name}<br/><span style="color:#abb2bf">${bt.desc}</span>`;
        break;
      }
    }
    if (!hitLabel) {
      for (const st of this.overview.stations) {
        if (Math.hypot(st[2] - wx, st[3] - wz) < snapR * 0.8) {
          hitLabel = `${t('station_prefix')}<b>${translateStationName(st[1])}</b>`;
          break;
        }
      }
    }

    const cx = Math.floor((wx + 20000) / 1000);
    const cz = Math.floor((wz + 20000) / 1000);
    const chunkInfo = cx >= 0 && cx < 40 && cz >= 0 && cz < 40 ? `Chunk [${cx}, ${cz}]` : t('out_of_bounds');

    this.tooltipEl.innerHTML =
      (hitLabel ? `<div style="margin-bottom:4px">${hitLabel}</div>` : '') +
      `<div class="mono">${lat}°N, ${lon}°E · (${Math.round(wx)}m, ${Math.round(wz)}m) · ${chunkInfo}</div>`;
    this.tooltipEl.style.left = `${Math.min(window.innerWidth - 280, clientX + 14)}px`;
    this.tooltipEl.style.top = `${Math.min(window.innerHeight - 80, clientY + 14)}px`;
    this.tooltipEl.classList.remove('hidden');
  }

  /**
   * Renders the bottom-left 240x240 GTA Radar Minimap from live loaded chunks.
   */
  updateMinimap(playerPos, playerYaw, loadedChunksMap) {
    this.lastPlayerPos = playerPos;
    this.lastPlayerYaw = playerYaw;
    this.lastLoadedChunks = loadedChunksMap;

    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width || 168;
    const h = this.minimapCanvas.height || 168;
    const scale = w / 900.0;

    ctx.fillStyle = '#181b20';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);

    // Draw local water, buildings & roads from active chunks
    for (const chunk of loadedChunksMap.values()) {
      const ox = chunk.userData.ox - playerPos.x;
      const oz = chunk.userData.oz - playerPos.z;
      if (Math.abs(ox) > 1200 || Math.abs(oz) > 1200) continue;

      const segs = chunk.userData.roadSegments || [];
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const x1 = (s.x1 - playerPos.x) * scale;
        const z1 = (s.z1 - playerPos.z) * scale;
        const x2 = (s.x2 - playerPos.x) * scale;
        const z2 = (s.z2 - playerPos.z) * scale;
        if ((x1 < -130 && x2 < -130) || (x1 > 130 && x2 > 130) || (z1 < -130 && z2 < -130) || (z1 > 130 && z2 > 130)) {
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(x1, z1);
        ctx.lineTo(x2, z2);
        if (s.bridge || s.layer > 0) {
          ctx.strokeStyle = '#e06c75';
          ctx.lineWidth = Math.max(1.5, s.width * scale * 0.85);
        } else if (s.cls === 'motorway' || s.cls === 'trunk') {
          ctx.strokeStyle = '#e5c07b';
          ctx.lineWidth = Math.max(1.8, s.width * scale * 0.85);
        } else if (s.cls === 'primary' || s.cls === 'secondary') {
          ctx.strokeStyle = '#d19a66';
          ctx.lineWidth = Math.max(1.2, s.width * scale * 0.8);
        } else {
          ctx.strokeStyle = '#4b5263';
          ctx.lineWidth = 1.0;
        }
        ctx.stroke();
      }
    }

    // Draw active GPS route on minimap
    const route = this.navigator.activeRoute;
    if (route && route.points.length >= 2) {
      ctx.beginPath();
      for (let i = 0; i < route.points.length; i++) {
        const rx = (route.points[i][0] - playerPos.x) * scale;
        const rz = (route.points[i][2] - playerPos.z) * scale;
        if (i === 0) ctx.moveTo(rx, rz);
        else ctx.lineTo(rx, rz);
      }
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 3.0;
      ctx.stroke();

      const remKm = (Math.hypot(route.goalX - playerPos.x, route.goalZ - playerPos.z) / 1000).toFixed(2);
      this.gpsStatusEl.textContent = `${route.destName} · ${remKm} km`;
      this.gpsStatusEl.classList.remove('hidden');
    } else {
      this.gpsStatusEl.classList.add('hidden');
    }

    // Player heading arrow in center
    ctx.rotate(-playerYaw + Math.PI);
    ctx.fillStyle = '#61afef';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Renders the full-screen 40km x 40km Beijing vector GIS & navigation map.
   */
  renderWorldMap() {
    if (!this.isOpen) return;
    const ctx = this.worldCtx;
    const w = this.worldCanvas.width;
    const h = this.worldCanvas.height;

    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, w, h);

    // 1. Draw 40x40 (1km x 1km) chunk grid & highlight currently loaded 3D chunks
    ctx.lineWidth = 1;
    for (let cx = 0; cx < 40; cx++) {
      for (let cz = 0; cz < 40; cz++) {
        const wx0 = -20000 + cx * 1000;
        const wz0 = -20000 + cz * 1000;
        const sx0 = this.worldToScreenX(wx0);
        const sy0 = this.worldToScreenY(wz0);
        const sz = 1000 * this.scale;
        if (sx0 + sz < 0 || sx0 > w || sy0 + sz < 0 || sy0 > h) continue;

        const key = `${cx},${cz}`;
        if (this.lastLoadedChunks && this.lastLoadedChunks.has(key)) {
          ctx.fillStyle = 'rgba(152, 195, 121, 0.14)';
          ctx.fillRect(sx0, sy0, sz, sz);
          ctx.strokeStyle = 'rgba(152, 195, 121, 0.45)';
          ctx.strokeRect(sx0, sy0, sz, sz);
        } else {
          ctx.strokeStyle = 'rgba(171, 178, 191, 0.05)';
          ctx.strokeRect(sx0, sy0, sz, sz);
        }
      }
    }

    // 2. Draw Water Bodies & Rivers
    ctx.fillStyle = '#1d4e6f';
    ctx.strokeStyle = '#266894';
    for (const wt of this.overview.water) {
      const [, , wkind, widthM, flat] = wt;
      if (!flat || flat.length < 4) continue;
      ctx.beginPath();
      for (let i = 0; i < flat.length; i += 2) {
        const sx = this.worldToScreenX(flat[i]);
        const sy = this.worldToScreenY(flat[i + 1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      if (wkind === 'poly') {
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(1.2, widthM * this.scale);
        ctx.stroke();
      }
    }

    // 3. Draw Beijing Subway Lines
    ctx.lineWidth = Math.max(1.0, 4.0 * this.scale);
    ctx.setLineDash([4, 4]);
    for (const sub of this.overview.subways) {
      const [, , lcol, flat] = sub;
      if (!flat || flat.length < 4) continue;
      ctx.strokeStyle = lcol || '#0092d8';
      ctx.beginPath();
      for (let i = 0; i < flat.length; i += 2) {
        const sx = this.worldToScreenX(flat[i]);
        const sy = this.worldToScreenY(flat[i + 1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 4. Draw 40km x 40km Arterial Road Network (Ring Roads, Expressways, Avenues, Overpasses)
    for (const art of this.overview.arterials) {
      const [, cls, , widthM, isBridge, , layer, flat] = art;
      if (!flat || flat.length < 6) continue;
      ctx.beginPath();
      for (let i = 0; i < flat.length; i += 3) {
        const sx = this.worldToScreenX(flat[i]);
        const sy = this.worldToScreenY(flat[i + 2]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      if (isBridge || layer > 0) {
        ctx.strokeStyle = '#e06c75';
        ctx.lineWidth = Math.max(1.3, widthM * this.scale * 0.9);
      } else if (cls === 'motorway' || cls === 'trunk') {
        ctx.strokeStyle = '#e5c07b';
        ctx.lineWidth = Math.max(1.4, widthM * this.scale * 0.85);
      } else if (cls === 'primary') {
        ctx.strokeStyle = '#d19a66';
        ctx.lineWidth = Math.max(1.0, widthM * this.scale * 0.75);
      } else {
        ctx.strokeStyle = 'rgba(171, 178, 191, 0.45)';
        ctx.lineWidth = Math.max(0.7, widthM * this.scale * 0.6);
      }
      ctx.stroke();
    }

    // 5. Draw Stations when zoomed in
    if (this.scale >= 0.05) {
      ctx.fillStyle = '#61afef';
      ctx.font = '10px sans-serif';
      for (const st of this.overview.stations) {
        const sx = this.worldToScreenX(st[2]);
        const sy = this.worldToScreenY(st[3]);
        if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (this.scale >= 0.11) {
          ctx.fillStyle = '#abb2bf';
          ctx.fillText(translateStationName(st[1]), sx + 5, sy + 3);
          ctx.fillStyle = '#61afef';
        }
      }
    }

    // 6. Draw Active A* GPS Route
    const route = this.navigator.activeRoute;
    if (route && route.points.length >= 2) {
      ctx.beginPath();
      for (let i = 0; i < route.points.length; i++) {
        const sx = this.worldToScreenX(route.points[i][0]);
        const sy = this.worldToScreenY(route.points[i][2]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Goal pin
      const gx = this.worldToScreenX(route.goalX);
      const gy = this.worldToScreenY(route.goalZ);
      ctx.fillStyle = '#00f5d4';
      ctx.beginPath();
      ctx.arc(gx, gy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Draw Curated Bookmarks / Hubs
    ctx.font = 'bold 11px sans-serif';
    for (const bm of this.overview.bookmarks) {
      const sx = this.worldToScreenX(bm.x);
      const sy = this.worldToScreenY(bm.z);
      if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
      ctx.fillStyle = '#e5c07b';
      ctx.beginPath();
      ctx.arc(sx, sy, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#181a1f';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#e6edf3';
      const bt = getBookmarkText(bm);
      ctx.fillText(bt.name.split(' · ')[0], sx + 7, sy + 4);
    }

    // 8. Draw Player Marker
    if (this.lastPlayerPos) {
      const px = this.worldToScreenX(this.lastPlayerPos.x);
      const pz = this.worldToScreenY(this.lastPlayerPos.z);
      ctx.fillStyle = '#98c379';
      ctx.beginPath();
      ctx.arc(px, pz, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
