// [feature/street] Main-thread street furniture renderer + road-surface highway shield decals +
// 3D overhead highway gantry signs + roadside traffic signs & street name blades.
import * as THREE from '../../vendor/three.module.js';
import { getSignalPhase } from './signals.js';
import { getDaylight } from './daylight.js';
import { setStreetWorldOrigin, DECAL_CELLS } from './street_worker.js';
import { SURFACE_UNIFORMS } from './surfaces.js'; // [street-props]
import { NEAR_CFG, buildNearModels, busStopGlass, patchFurnitureMaterial, FURNITURE_UNIFORMS, PropDamage, PROP_DAMAGE_CFG } from './street_props.js'; // [street-props]

const STRIDE = 5;
const SIG_STRIDE = 8;
const HEAD_STRIDE = 5;
const REFRESH_MOVE_M = 18;
const DETAIL_CULL_M = 1250; // chunk-center distance beyond which per-chunk road detail meshes are hidden
const GANTRY_CULL_M = 460;
const BLADE_CULL_M = 260;

// ---------- geometry helpers (merged, vertex-colored, non-indexed) ----------
function colored(geom, rgb, tx = 0, ty = 0, tz = 0) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.translate(tx, ty, tz);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = rgb[0];
    c[i * 3 + 1] = rgb[1];
    c[i * 3 + 2] = rgb[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  return g;
}

function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nrm.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

function uvColored(geom, rgb, u0, v0, u1, v1, tx = 0, ty = 0, tz = 0) {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.translate(tx, ty, tz);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const srcUv = g.attributes.uv ? g.attributes.uv.array : null;
  for (let i = 0; i < n; i++) {
    c[i * 3] = rgb[0];
    c[i * 3 + 1] = rgb[1];
    c[i * 3 + 2] = rgb[2];
    const su = srcUv ? srcUv[i * 2] : 0.5;
    const sv = srcUv ? srcUv[i * 2 + 1] : 0.5;
    uv[i * 2] = u0 + (u1 - u0) * su;
    uv[i * 2 + 1] = v0 + (v1 - v0) * sv;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'color' && k !== 'uv') g.deleteAttribute(k);
  }
  return g;
}

function mergeUV(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nrm.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    uv.set(p.attributes.uv.array, o * 2);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

const box = (w, h, d, rgb, x, y, z) => colored(new THREE.BoxGeometry(w, h, d), rgb, x, y, z);
const cyl = (rt, rb, h, rgb, x, y, z, seg = 8) => colored(new THREE.CylinderGeometry(rt, rb, h, seg, 1), rgb, x, y + h / 2, z);
function beam(x0, y0, x1, y1, t, rgb) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const g = new THREE.BoxGeometry(len, t, t);
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
  return colored(g, rgb, (x0 + x1) / 2, (y0 + y1) / 2, 0);
}

const POLE = [0.46, 0.48, 0.5];
const DARK = [0.14, 0.15, 0.16];
const HOUSING = [0.1, 0.11, 0.12];
const LENS_OFF = [0.2, 0.2, 0.2];
const STEEL = [0.58, 0.61, 0.65];
const STEEL_DARK = [0.36, 0.39, 0.43];

// ---------- CanvasTexture Drawing Helpers ----------
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawInterstateShield(ctx, cx, cy, w, h, numStr) {
  const x0 = cx - w * 0.5, y0 = cy - h * 0.5;
  ctx.save();
  // Shield silhouette path
  ctx.beginPath();
  ctx.moveTo(x0 + w * 0.08, y0 + h * 0.06);
  ctx.quadraticCurveTo(x0 + w * 0.28, y0 + h * 0.12, cx, y0 + h * 0.04);
  ctx.quadraticCurveTo(x0 + w * 0.72, y0 + h * 0.12, x0 + w * 0.92, y0 + h * 0.06);
  ctx.bezierCurveTo(x0 + w * 0.98, y0 + h * 0.45, x0 + w * 0.85, y0 + h * 0.82, cx, y0 + h * 0.97);
  ctx.bezierCurveTo(x0 + w * 0.15, y0 + h * 0.82, x0 + w * 0.02, y0 + h * 0.45, x0 + w * 0.08, y0 + h * 0.06);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.clip();

  // Blue lower body
  ctx.fillStyle = '#003f87';
  ctx.fillRect(x0, y0 + h * 0.28, w, h * 0.75);
  // Red crown
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(x0, y0, w, h * 0.30);
  // White divider line
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, y0 + h * 0.28, w, h * 0.04);

  // Header text
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(h * 0.11)}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('INTERSTATE', cx, y0 + h * 0.18);

  // Route number
  const fontSz = numStr.length >= 3 ? Math.round(h * 0.40) : Math.round(h * 0.46);
  ctx.font = `900 ${fontSz}px "Arial Black", Impact, sans-serif`;
  ctx.fillText(numStr, cx, y0 + h * 0.62);
  ctx.restore();

  // Outer crisp white border
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0 + w * 0.08, y0 + h * 0.06);
  ctx.quadraticCurveTo(x0 + w * 0.28, y0 + h * 0.12, cx, y0 + h * 0.04);
  ctx.quadraticCurveTo(x0 + w * 0.72, y0 + h * 0.12, x0 + w * 0.92, y0 + h * 0.06);
  ctx.bezierCurveTo(x0 + w * 0.98, y0 + h * 0.45, x0 + w * 0.85, y0 + h * 0.82, cx, y0 + h * 0.97);
  ctx.bezierCurveTo(x0 + w * 0.15, y0 + h * 0.82, x0 + w * 0.02, y0 + h * 0.45, x0 + w * 0.08, y0 + h * 0.06);
  ctx.closePath();
  ctx.lineWidth = Math.max(4, w * 0.045);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
}

function drawUSRouteShield(ctx, cx, cy, w, h, numStr) {
  const x0 = cx - w * 0.5, y0 = cy - h * 0.5;
  ctx.save();
  roundRectPath(ctx, x0, y0, w, h, w * 0.14);
  ctx.fillStyle = '#181a1e';
  ctx.fill();
  ctx.lineWidth = Math.max(4, w * 0.05);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Inner white shield
  roundRectPath(ctx, x0 + w * 0.08, y0 + h * 0.08, w * 0.84, h * 0.84, w * 0.12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#111315';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(h * 0.22)}px "Arial Black", Impact, sans-serif`;
  ctx.fillText('US', cx, y0 + h * 0.28);
  const fontSz = numStr.length >= 3 ? Math.round(h * 0.38) : Math.round(h * 0.44);
  ctx.font = `900 ${fontSz}px "Arial Black", Impact, sans-serif`;
  ctx.fillText(numStr, cx, y0 + h * 0.65);
  ctx.restore();
}

function drawStateShield(ctx, cx, cy, w, h, label, numStr, bg = '#006b3f') {
  const x0 = cx - w * 0.5, y0 = cy - h * 0.5;
  ctx.save();
  roundRectPath(ctx, x0, y0, w, h, w * 0.22);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = Math.max(5, w * 0.055);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(h * 0.16)}px "Arial Black", sans-serif`;
  ctx.fillText(label, cx, y0 + h * 0.27);
  ctx.font = `900 ${Math.round(h * 0.46)}px "Arial Black", Impact, sans-serif`;
  ctx.fillText(numStr, cx, y0 + h * 0.66);
  ctx.restore();
}

function drawForwardArrow(ctx, cx, yTop, yBot, w, color = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  const headH = (yBot - yTop) * 0.46;
  const shaftW = w * 0.34;
  ctx.beginPath();
  ctx.moveTo(cx, yTop);
  ctx.lineTo(cx + w * 0.5, yTop + headH);
  ctx.lineTo(cx + shaftW * 0.5, yTop + headH);
  ctx.lineTo(cx + shaftW * 0.5, yBot);
  ctx.lineTo(cx - shaftW * 0.5, yBot);
  ctx.lineTo(cx - shaftW * 0.5, yTop + headH);
  ctx.lineTo(cx - w * 0.5, yTop + headH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Builds the 2048x2048 Road-Surface Decal CanvasTexture (4x4 grid of 512x512 cells).
 */
function buildRoadDecalAtlasTexture() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S * 4;
  canvas.height = S * 4;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cellOrigin = (idx) => [(idx & 3) * S, ((idx >> 2) & 3) * S];

  // 0: I-80 Interstate Shield + forward arrow
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.SHIELD_I80);
    drawForwardArrow(ctx, ox + 256, oy + 26, oy + 122, 115, '#f5f7fa');
    drawInterstateShield(ctx, ox + 256, oy + 312, 340, 330, '80');
  }
  // 1: I-280 Interstate Shield + forward arrow
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.SHIELD_I280);
    drawForwardArrow(ctx, ox + 256, oy + 26, oy + 122, 115, '#f5f7fa');
    drawInterstateShield(ctx, ox + 256, oy + 312, 340, 330, '280');
  }
  // 2: US 101 Highway Shield + forward arrow
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.SHIELD_US101);
    drawForwardArrow(ctx, ox + 256, oy + 26, oy + 122, 115, '#f5f7fa');
    drawUSRouteShield(ctx, ox + 256, oy + 312, 336, 320, '101');
  }
  // 3: CA 1 State Shield + forward arrow
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.SHIELD_CA1);
    drawForwardArrow(ctx, ox + 256, oy + 26, oy + 122, 115, '#f5f7fa');
    drawStateShield(ctx, ox + 256, oy + 312, 326, 320, 'CALIFORNIA', '1', '#006b3f');
  }
  // 4: I-95 Interstate Shield + forward arrow
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.SHIELD_I95);
    drawForwardArrow(ctx, ox + 256, oy + 26, oy + 122, 115, '#f5f7fa');
    drawInterstateShield(ctx, ox + 256, oy + 312, 340, 330, '95');
  }
  // 5: European E15 / A1 Shield
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.SHIELD_EU_E15);
    drawForwardArrow(ctx, ox + 256, oy + 24, oy + 118, 110, '#f5f7fa');
    drawStateShield(ctx, ox + 256, oy + 308, 350, 310, 'EUROPE', 'E 15', '#007a3d');
  }
  // 6: Asia G2 / C1 Expressway Shield
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.SHIELD_ASIA_G2);
    drawForwardArrow(ctx, ox + 256, oy + 24, oy + 118, 110, '#f5f7fa');
    drawStateShield(ctx, ox + 256, oy + 308, 340, 310, 'EXPRESSWAY', 'G 2', '#006837');
  }
  // 7 & 8: Speed Limit Roundels 80 & 50
  for (const [cell, txt] of [[DECAL_CELLS.ROUNDEL_80, '80'], [DECAL_CELLS.ROUNDEL_50, '50']]) {
    const [ox, oy] = cellOrigin(cell);
    const cx = ox + 256, cy = oy + 256;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 205, 0, Math.PI * 2);
    ctx.fillStyle = '#d81e28';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 152, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f6f8';
    ctx.fill();

    ctx.fillStyle = '#141619';
    ctx.font = '900 165px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, cx, cy + 8);
    ctx.restore();
  }
  // 9: STENCIL_STOP
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.STENCIL_STOP);
    ctx.save();
    ctx.fillStyle = '#f4f6f9';
    ctx.fillRect(ox + 36, oy + 46, 440, 42);
    ctx.font = '900 156px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.scale(1.0, 1.45);
    ctx.fillText('STOP', ox + 256, (oy + 310) / 1.45);
    ctx.restore();
  }
  // 10: STENCIL_SLOW
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.STENCIL_SLOW);
    ctx.save();
    ctx.fillStyle = '#f7c824';
    ctx.fillRect(ox + 44, oy + 48, 424, 34);
    ctx.fillRect(ox + 44, oy + 430, 424, 34);
    ctx.font = '900 142px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.scale(1.0, 1.38);
    ctx.fillText('SLOW', ox + 256, (oy + 260) / 1.38);
    ctx.restore();
  }
  // 11: STENCIL_SPEED35
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.STENCIL_SPEED35);
    ctx.save();
    ctx.fillStyle = '#f4f6f9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 102px "Arial Black", Impact, sans-serif';
    ctx.fillText('SPEED', ox + 256, oy + 148);
    ctx.fillStyle = '#f7c824';
    ctx.font = '900 205px "Arial Black", Impact, sans-serif';
    ctx.fillText('35', ox + 256, oy + 348);
    ctx.restore();
  }
  // 12 & 13: STENCIL_ONLY_LEFT & STENCIL_ONLY_RIGHT
  for (const [cell, dir] of [[DECAL_CELLS.STENCIL_ONLY_LEFT, -1], [DECAL_CELLS.STENCIL_ONLY_RIGHT, 1]]) {
    const [ox, oy] = cellOrigin(cell);
    ctx.save();
    ctx.fillStyle = '#f4f6f9';
    ctx.strokeStyle = '#f4f6f9';
    const cx = ox + 256;
    // Vertical stem curving into turn arrow
    ctx.lineWidth = 44;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cx - dir * 32, oy + 265);
    ctx.lineTo(cx - dir * 32, oy + 165);
    ctx.quadraticCurveTo(cx - dir * 32, oy + 96, cx + dir * 48, oy + 96);
    ctx.lineTo(cx + dir * 92, oy + 96);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(cx + dir * 185, oy + 96);
    ctx.lineTo(cx + dir * 78, oy + 34);
    ctx.lineTo(cx + dir * 78, oy + 158);
    ctx.closePath();
    ctx.fill();
    // "ONLY" text below
    ctx.font = '900 124px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ONLY', cx, oy + 392);
    ctx.restore();
  }
  // 14: STENCIL_ARROW_STRAIGHT
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.STENCIL_ARROW_STRAIGHT);
    drawForwardArrow(ctx, ox + 256, oy + 42, oy + 468, 195, '#f4f6f9');
  }
  // 15: STENCIL_ARROW_COMBO (Straight + Right Turn Arrow)
  {
    const [ox, oy] = cellOrigin(DECAL_CELLS.STENCIL_ARROW_COMBO);
    drawForwardArrow(ctx, ox + 210, oy + 44, oy + 468, 165, '#f4f6f9');
    ctx.save();
    ctx.fillStyle = '#f4f6f9';
    ctx.strokeStyle = '#f4f6f9';
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.moveTo(ox + 210, oy + 320);
    ctx.quadraticCurveTo(ox + 290, oy + 230, ox + 365, oy + 230);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 455, oy + 230);
    ctx.lineTo(ox + 355, oy + 168);
    ctx.lineTo(ox + 355, oy + 292);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the 2048x1024 Roadside Traffic Sign CanvasTexture Atlas (4x2 grid of 512x512 cells).
 * Cells:
 *   0: Red Octagon STOP
 *   1: US SPEED LIMIT 35 (white rectangle)
 *   2: US SPEED LIMIT 25 (white rectangle)
 *   3: Circular Red-Bordered 50
 *   4: Circular Red-Bordered 60
 *   5: Yellow Diamond Pedestrian Crossing Warning
 *   6: Yellow Diamond Curve Warning
 *   7: Solid White Swatch (for vertex-colored steel posts/brackets)
 */
function buildTrafficSignAtlasTexture() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S * 4;
  canvas.height = S * 2;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cellOrigin = (idx) => [(idx & 3) * S, ((idx >> 2) & 1) * S];

  // Cell 0: Red Octagon STOP Sign
  {
    const [ox, oy] = cellOrigin(0);
    const cx = ox + 256, cy = oy + 256;
    const drawOct = (r) => {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    ctx.save();
    drawOct(242);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    drawOct(224);
    ctx.fillStyle = '#c8102e';
    ctx.fill();
    drawOct(208);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 134px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STOP', cx, cy + 6);
    ctx.restore();
  }

  // Cells 1 & 2: US Rectangular SPEED LIMIT 35 / 25
  for (const [idx, mph] of [[1, '35'], [2, '25']]) {
    const [ox, oy] = cellOrigin(idx);
    ctx.save();
    roundRectPath(ctx, ox + 56, oy + 18, 400, 476, 36);
    ctx.fillStyle = '#f6f7f9';
    ctx.fill();
    roundRectPath(ctx, ox + 72, oy + 34, 368, 444, 26);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#141618';
    ctx.stroke();

    ctx.fillStyle = '#141618';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 72px "Arial Black", sans-serif';
    ctx.fillText('SPEED', ox + 256, oy + 112);
    ctx.font = '900 68px "Arial Black", sans-serif';
    ctx.fillText('LIMIT', ox + 256, oy + 190);
    ctx.font = '900 205px "Arial Black", Impact, sans-serif';
    ctx.fillText(mph, ox + 256, oy + 356);
    ctx.restore();
  }

  // Cells 3 & 4: Intl Circular Red-Bordered Speed Limit 50 & 60
  for (const [idx, kph] of [[3, '50'], [4, '60']]) {
    const [ox, oy] = cellOrigin(idx);
    const cx = ox + 256, cy = oy + 256;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 236, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 226, 0, Math.PI * 2);
    ctx.fillStyle = '#d81920';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 166, 0, Math.PI * 2);
    ctx.fillStyle = '#f8f9fa';
    ctx.fill();

    ctx.fillStyle = '#121417';
    ctx.font = '900 182px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kph, cx, cy + 8);
    ctx.restore();
  }

  // Cells 5 & 6: Yellow Diamond Warning Signs (Pedestrian Crossing & Curve Ahead)
  for (const [idx, kind] of [[5, 'ped'], [6, 'curve']]) {
    const [ox, oy] = cellOrigin(idx);
    const cx = ox + 256, cy = oy + 256;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    roundRectPath(ctx, -168, -168, 336, 336, 26);
    ctx.fillStyle = '#f7b500';
    ctx.fill();
    roundRectPath(ctx, -150, -150, 300, 300, 18);
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#141517';
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#141517';
    ctx.strokeStyle = '#141517';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (kind === 'ped') {
      // Head
      ctx.beginPath();
      ctx.arc(cx, cy - 86, 26, 0, Math.PI * 2);
      ctx.fill();
      // Torso + walking legs + arms
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 52);
      ctx.lineTo(cx - 6, cy + 16);
      ctx.lineTo(cx - 48, cy + 92);
      ctx.moveTo(cx - 6, cy + 16);
      ctx.lineTo(cx + 42, cy + 92);
      ctx.moveTo(cx - 52, cy - 8);
      ctx.lineTo(cx + 48, cy - 24);
      ctx.stroke();
      // Crosswalk dashes
      ctx.lineWidth = 10;
      for (let k = -80; k <= 80; k += 40) {
        ctx.fillRect(cx + k - 12, cy + 108, 24, 12);
      }
    } else {
      // Sweeping curve warning arrow
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(cx - 36, cy + 105);
      ctx.lineTo(cx - 36, cy + 10);
      ctx.quadraticCurveTo(cx - 36, cy - 68, cx + 52, cy - 68);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 112, cy - 68);
      ctx.lineTo(cx + 34, cy - 122);
      ctx.lineTo(cx + 34, cy - 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Cell 7: Solid white swatch (for steel posts / brackets using vertexColors)
  {
    const [ox, oy] = cellOrigin(7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, S, S);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a 512x256 CanvasTexture for an Overhead Highway Gantry Guide Sign Panel.
 */
// Sign textures cached per text (LRU). 64 is ~4x the most seen on screen at once (dense Tokyo/Paris).
const SIGN_MAT_CACHE_MAX = 64;

function buildGantryPanelTexture(region, isMotorway, refStr, mainText, subText, exitStr, isExitPanel = false) {
  const W = 512, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Reflective highway green (or EU motorway blue)
  const bg = (region === 'eu' && isMotorway) ? '#004696' : '#00593f';
  ctx.fillStyle = '#1b2024';
  ctx.fillRect(0, 0, W, H);

  roundRectPath(ctx, 6, 6, W - 12, H - 12, 18);
  ctx.fillStyle = bg;
  ctx.fill();

  roundRectPath(ctx, 14, 14, W - 28, H - 28, 13);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#f4f7f9';
  ctx.stroke();

  if (isExitPanel) {
    // Top exit number tab badge
    roundRectPath(ctx, W - 188, 22, 162, 42, 8);
    ctx.fillStyle = '#00422e';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 24px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(exitStr || 'EXIT 42B', W - 107, 44);

    // Destination text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    const title = String(mainText || 'Downtown').slice(0, 18);
    const fSize = title.length > 13 ? 38 : 44;
    ctx.font = `900 ${fSize}px "Arial Black", sans-serif`;
    ctx.fillText(title, W * 0.5, 112);

    // Yellow EXIT ONLY banner at bottom + diagonal exit arrow
    roundRectPath(ctx, 26, H - 72, W - 52, 48, 8);
    ctx.fillStyle = '#f7b500';
    ctx.fill();
    ctx.fillStyle = '#121417';
    ctx.font = '900 28px "Arial Black", sans-serif';
    ctx.fillText('EXIT   ONLY     ↗', W * 0.5, H - 47);
  } else {
    // Draw authentic Route Shield on the left
    const cleanRef = String(refStr || 'I-80').trim();
    const numOnly = cleanRef.replace(/^[A-Z]+[-\s]*/i, '') || '80';
    if (region === 'us') {
      if (cleanRef.startsWith('I-')) {
        drawInterstateShield(ctx, 84, 88, 108, 108, numOnly);
      } else if (cleanRef.startsWith('US')) {
        drawUSRouteShield(ctx, 84, 88, 106, 102, numOnly);
      } else {
        drawStateShield(ctx, 84, 88, 106, 102, 'CA', numOnly, '#006b3f');
      }
    } else {
      const hdr = region === 'cn' ? 'EXPWY' : region === 'jp' ? 'SHUTO' : 'ROUTE';
      drawStateShield(ctx, 84, 88, 112, 102, hdr, cleanRef, region === 'cn' ? '#c8102e' : '#004696');
    }

    // Primary street / highway destination
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const primary = String(mainText || 'The Embarcadero').slice(0, 22);
    const pFont = primary.length > 17 ? 31 : primary.length > 14 ? 36 : 42;
    ctx.font = `900 ${pFont}px "Arial Black", sans-serif`;
    ctx.fillText(primary, 154, 66);

    // Secondary destination + distance
    ctx.fillStyle = '#d9ece4';
    const secondary = String(subText || 'Downtown').slice(0, 18);
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillText(`${secondary}   1/2 MI`, 154, 122);

    // Divider rule
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(28, 158, W - 56, 3);

    // Crisp downward lane arrows + exit arrow
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↓          ↓          ↗', W * 0.5, 206);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a 512x128 CanvasTexture for a Green Street Name Blade Sign.
 */
function buildStreetBladeTexture(streetName) {
  const W = 512, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  roundRectPath(ctx, 4, 8, W - 8, H - 16, 18);
  ctx.fillStyle = '#006845';
  ctx.fill();

  roundRectPath(ctx, 12, 16, W - 24, H - 32, 12);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  const label = String(streetName || 'MARKET ST').toUpperCase().slice(0, 20);
  const fSize = label.length > 15 ? 40 : label.length > 11 ? 48 : 54;
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${fSize}px "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W * 0.5, H * 0.52);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildModels() {
  const m = {};
  // Generic single-arm light (JP/EU/intl major roads). Bulb at (2.3, 8.35).
  m.lampArm = merge([
    cyl(0.08, 0.12, 8.5, POLE, 0, 0, 0),
    box(0.3, 0.5, 0.3, POLE, 0, 0.25, 0),
    beam(0, 8.2, 2.4, 8.45, 0.08, POLE),
    box(0.75, 0.14, 0.32, DARK, 2.3, 8.46, 0),
  ]);
  // US cobra-head: tall pole, curved mast arm, elongated head. Bulb at (2.6, 8.75).
  m.lampCobra = merge([
    cyl(0.08, 0.13, 8.7, [0.55, 0.56, 0.55], 0, 0, 0),
    beam(0, 8.4, 1.3, 8.95, 0.09, [0.55, 0.56, 0.55]),
    beam(1.25, 8.95, 2.3, 8.95, 0.08, [0.55, 0.56, 0.55]),
    box(1.0, 0.2, 0.42, [0.5, 0.52, 0.5], 2.6, 8.88, 0),
  ]);
  // Chinese boulevard double-arm light. Bulbs at (+-2.4, 9.85).
  m.lampDouble = merge([
    cyl(0.1, 0.16, 10.0, [0.62, 0.64, 0.66], 0, 0, 0),
    box(0.4, 0.8, 0.4, [0.5, 0.52, 0.54], 0, 0.4, 0),
    beam(0, 9.6, 2.5, 9.95, 0.09, [0.62, 0.64, 0.66]),
    beam(0, 9.6, -2.5, 9.95, 0.09, [0.62, 0.64, 0.66]),
    box(0.8, 0.14, 0.34, [0.3, 0.32, 0.34], 2.4, 9.96, 0),
    box(0.8, 0.14, 0.34, [0.3, 0.32, 0.34], -2.4, 9.96, 0),
  ]);
  // European post-top lantern (residential). Glass at y 3.6..4.1.
  m.lampPost = merge([
    cyl(0.05, 0.08, 3.6, [0.07, 0.09, 0.08], 0, 0, 0),
    box(0.22, 0.4, 0.22, [0.07, 0.09, 0.08], 0, 0.2, 0),
    cyl(0.02, 0.3, 0.18, [0.07, 0.09, 0.08], 0, 4.08, 0, 6),
  ]);
  m.bulb = merge([box(0.55, 0.05, 0.26, [1, 1, 1], 0, 0, 0)]);
  m.bulbPost = merge([box(0.34, 0.46, 0.34, [1, 1, 1], 0, 0, 0)]);

  // Traffic signals
  m.tlPole = merge([cyl(0.11, 0.14, 6.1, [0.32, 0.34, 0.36], 0, 0, 0), box(0.4, 0.3, 0.4, [0.3, 0.32, 0.34], 0, 0.15, 0)]);
  m.tlArm = merge([box(1, 0.14, 0.14, [0.32, 0.34, 0.36], 0.5, 5.92, 0)]);
  const vParts = [box(0.3, 1.05, 0.38, HOUSING, 0, 0, 0), box(0.04, 1.25, 0.58, HOUSING, -0.17, 0, 0)];
  const hParts = [box(0.3, 0.38, 1.05, HOUSING, 0, 0, 0), box(0.04, 0.58, 1.25, HOUSING, -0.17, 0, 0)];
  for (const o of [-0.33, 0, 0.33]) {
    vParts.push(box(0.02, 0.24, 0.24, LENS_OFF, 0.155, o, 0), box(0.16, 0.03, 0.28, HOUSING, 0.22, o + 0.14, 0));
    hParts.push(box(0.02, 0.24, 0.24, LENS_OFF, 0.155, 0, o), box(0.16, 0.03, 0.28, HOUSING, 0.22, 0.14, o));
  }
  m.tlHeadV = merge(vParts);
  m.tlHeadH = merge(hParts);
  const lamp = new THREE.CircleGeometry(0.125, 12);
  lamp.rotateY(Math.PI / 2);
  m.tlLamp = merge([colored(lamp, [1, 1, 1])]);

  // 3D Overhead Highway Gantry Support Column (height = 7.45m, concrete pedestal + dual steel column)
  m.gantryLeg = merge([
    box(0.65, 0.65, 0.65, [0.68, 0.69, 0.67], 0, 0.32, 0),
    cyl(0.18, 0.22, 7.45, STEEL, 0, 0, 0, 10),
    box(0.42, 0.24, 0.72, STEEL_DARK, 0, 7.38, 0),
    beam(0, 5.6, 0.95, 6.8, 0.14, STEEL_DARK),
  ]);

  // 3D Overhead Highway Gantry Truss Arch (unit length [-0.5..+0.5] along X, scaled by spanW = roadWidth + 3m, clearance = 6.8m)
  const trussParts = [
    box(1.0, 0.14, 0.14, STEEL, 0, 7.42, 0.28),
    box(1.0, 0.14, 0.14, STEEL, 0, 7.42, -0.28),
    box(1.0, 0.14, 0.14, STEEL, 0, 6.72, 0.28),
    box(1.0, 0.14, 0.14, STEEL, 0, 6.72, -0.28),
    box(1.0, 0.05, 0.62, STEEL_DARK, 0, 6.66, 0),
  ];
  for (let k = -4; k <= 4; k++) {
    const xk = k * 0.11;
    trussParts.push(box(0.025, 0.72, 0.58, STEEL_DARK, xk, 7.07, 0));
  }
  m.gantryTruss = merge(trussParts);

  // Intersection Street Name Blade Sign Post
  m.bladePost = merge([
    cyl(0.048, 0.065, 3.15, STEEL, 0, 0, 0, 8),
    box(0.22, 0.18, 0.22, STEEL_DARK, 0, 0.09, 0),
    cyl(0.07, 0.07, 0.08, STEEL_DARK, 0, 3.15, 0, 8),
  ]);

  // Bus stop shelter: open side faces +X (road), 4.4m long along Z
  const frame = [0.3, 0.32, 0.35];
  const glass = [0.55, 0.68, 0.74];
  m.busStop = merge([
    box(1.7, 0.12, 4.6, [0.85, 0.86, 0.88], 0, 2.5, 0),
    box(0.04, 2.0, 4.2, glass, -0.7, 1.25, 0),
    box(1.2, 2.0, 0.04, glass, -0.1, 1.25, 2.15),
    box(0.08, 2.5, 0.08, frame, -0.72, 1.25, -2.2),
    box(0.08, 2.5, 0.08, frame, -0.72, 1.25, 2.2),
    box(0.08, 2.5, 0.08, frame, 0.6, 1.25, -2.2),
    box(0.08, 2.5, 0.08, frame, 0.6, 1.25, 2.2),
    box(0.06, 1.8, 1.2, [0.95, 0.93, 0.85], -0.66, 1.3, -1.5),
    box(0.4, 0.06, 2.2, [0.45, 0.32, 0.2], -0.45, 0.48, 0.6),
    box(0.06, 2.6, 0.12, [0.2, 0.45, 0.75], 0.75, 1.3, -2.6),
    box(0.06, 0.45, 0.5, [0.2, 0.45, 0.75], 0.75, 2.45, -2.6),
  ]);
  const wood = [0.5, 0.34, 0.2];
  m.bench = merge([
    box(0.45, 0.06, 1.8, wood, 0, 0.45, 0),
    box(0.06, 0.4, 1.8, wood, -0.22, 0.72, 0),
    box(0.4, 0.45, 0.06, DARK, 0, 0.22, -0.8),
    box(0.4, 0.45, 0.06, DARK, 0, 0.22, 0.8),
  ]);
  m.bollard = merge([cyl(0.09, 0.1, 0.9, [0.33, 0.35, 0.36], 0, 0, 0), cyl(0.095, 0.095, 0.12, [0.88, 0.88, 0.85], 0, 0.64, 0)]);
  const red = [0.78, 0.12, 0.1];
  m.hydrant = merge([
    cyl(0.13, 0.15, 0.55, red, 0, 0, 0),
    cyl(0.04, 0.15, 0.14, red, 0, 0.55, 0),
    box(0.34, 0.09, 0.09, red, 0, 0.38, 0),
    box(0.09, 0.09, 0.2, [0.85, 0.82, 0.78], 0.12, 0.38, 0),
  ]);
  m.bin = merge([cyl(0.27, 0.27, 0.86, [0.07, 0.16, 0.11], 0, 0, 0, 10), cyl(0.29, 0.2, 0.16, [0.07, 0.16, 0.11], 0, 0.86, 0, 10)]);
  return m;
}

/**
 * Builds UV-mapped 3D roadside traffic sign geometries (steel post + mounting clasps + double-sided sign face)
 * referencing cells in buildTrafficSignAtlasTexture() (4x2 grid).
 */
function buildSignModels() {
  const sm = {};
  // Swatch UV in Cell 7 (col=3, row=1 -> u in [0.82, 0.94], v in [0.12, 0.38])
  const su0 = 0.82, sv0 = 0.12, su1 = 0.94, sv1 = 0.38;

  const makeRoadsideSign = (cellIdx, boardW, boardH, centerY = 2.55, postH = 2.85) => {
    const col = cellIdx & 3;
    const row = (cellIdx >> 2) & 1;
    const pad = 0.008;
    const u0 = (col + pad) * 0.25;
    const u1 = (col + 1 - pad) * 0.25;
    const v1 = 1.0 - (row + pad) * 0.5;
    const v0 = 1.0 - (row + 1 - pad) * 0.5;

    const frontFace = new THREE.PlaneGeometry(boardW, boardH);
    frontFace.rotateY(Math.PI / 2); // faces +X (approaching traffic)
    const backFace = new THREE.PlaneGeometry(boardW, boardH);
    backFace.rotateY(-Math.PI / 2); // faces -X

    return mergeUV([
      uvColored(new THREE.CylinderGeometry(0.042, 0.055, postH, 8, 1), STEEL, su0, sv0, su1, sv1, 0, postH * 0.5, 0),
      uvColored(new THREE.BoxGeometry(0.18, 0.14, 0.18), STEEL_DARK, su0, sv0, su1, sv1, 0, 0.07, 0),
      uvColored(new THREE.BoxGeometry(0.095, 0.08, 0.18), STEEL_DARK, su0, sv0, su1, sv1, 0, centerY + boardH * 0.28, 0),
      uvColored(new THREE.BoxGeometry(0.095, 0.08, 0.18), STEEL_DARK, su0, sv0, su1, sv1, 0, centerY - boardH * 0.28, 0),
      uvColored(frontFace, [1, 1, 1], u0, v0, u1, v1, 0.048, centerY, 0),
      uvColored(backFace, [0.92, 0.92, 0.92], u0, v0, u1, v1, -0.048, centerY, 0),
    ]);
  };

  sm.signStop = makeRoadsideSign(0, 0.96, 0.96, 2.52, 2.82);
  sm.signSpeed35 = makeRoadsideSign(1, 0.92, 1.12, 2.58, 2.92);
  sm.signSpeed25 = makeRoadsideSign(2, 0.92, 1.12, 2.58, 2.92);
  sm.signSpeed50 = makeRoadsideSign(3, 0.96, 0.96, 2.55, 2.85);
  sm.signSpeed60 = makeRoadsideSign(4, 0.96, 0.96, 2.55, 2.85);
  sm.signWarnPed = makeRoadsideSign(5, 1.02, 1.02, 2.58, 2.88);
  sm.signWarnCurve = makeRoadsideSign(6, 1.02, 1.02, 2.58, 2.88);
  return sm;
}

// Per-type cull radius (m), capacity and whether it casts shadows
const TYPE_CFG = {
  lampArm: [450, 3000, true], lampCobra: [450, 3000, true], lampDouble: [450, 2000, true], lampPost: [300, 2000, true],
  tlPole: [450, 1500, true], tlArm: [450, 1500, true], tlHeadV: [450, 1500, false], tlHeadH: [450, 1500, false],
  gantryLeg: [480, 600, true], gantryTruss: [480, 350, true], bladePost: [280, 1200, false],
  busStop: [350, 400, true], bench: [220, 1000, false], bollard: [180, 3000, false], hydrant: [180, 1500, false],
  bin: [200, 1500, false],
};

const SIGN_TYPE_CFG = {
  signStop: [320, 1500, true],
  signSpeed35: [320, 1500, true],
  signSpeed25: [300, 1500, false],
  signSpeed50: [320, 1500, true],
  signSpeed60: [320, 1200, true],
  signWarnPed: [300, 1500, false],
  signWarnCurve: [300, 1500, false],
};

const HEAD_CULL = 450;
const PAVER_REGIONS = new Set(['eu', 'jp', 'cn', 'kr', 'intl']); // [street-props] block pavers; us / uk / au: concrete flags

const HALO_VS = `
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize;
  gl_Position = projectionMatrix * c;
}`;
const HALO_FS = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.4) * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
}`;
const POOL_VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const POOL_FS = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a = a * a * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
}`;

function makeDoubleSidedSignGeom(w, h) {
  const f = new THREE.PlaneGeometry(w, h);
  f.rotateY(Math.PI / 2);
  f.translate(0.06, 0, 0);
  const b = new THREE.PlaneGeometry(w, h);
  b.rotateY(-Math.PI / 2);
  b.translate(-0.06, 0, 0);
  const g = new THREE.BufferGeometry();
  const n = f.attributes.position.count;
  const pos = new Float32Array(n * 2 * 3);
  const nrm = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx = new Uint16Array(f.index.count * 2);
  pos.set(f.attributes.position.array, 0);
  pos.set(b.attributes.position.array, n * 3);
  nrm.set(f.attributes.normal.array, 0);
  nrm.set(b.attributes.normal.array, n * 3);
  uv.set(f.attributes.uv.array, 0);
  uv.set(b.attributes.uv.array, n * 2);
  idx.set(f.index.array, 0);
  for (let i = 0; i < b.index.count; i++) idx[f.index.count + i] = b.index.array[i] + n;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

export class StreetFeatures {
  /**
   * @param {THREE.Scene} scene
   * @param {object} mats shared chunk materials (street materials are added to it; surfaces.js patches them)
   */
  constructor(scene, mats) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'street_furniture';
    scene.add(this.root);

    // Road detail materials referenced by worker payload matKeys
    this.lineMat = new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6,
    });
    this.lineMat.name = 'streetLineMat';
    this.wearMat = new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.08, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4,
    });
    this.wearMat.name = 'streetWearMat';
    this.curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
    this.curbMat.name = 'streetCurbMat';

    // Road-surface highway shields & stencils decal material (y = roadY + 0.06m, polygonOffset so zero z-fighting)
    this.decalAtlasTex = buildRoadDecalAtlasTexture();
    this.decalMat = new THREE.MeshBasicMaterial({
      map: this.decalAtlasTex,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.06,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -10,
    });
    this.decalMat.name = 'streetDecalMat';

    if (mats) {
      mats.streetLineMat = this.lineMat;
      mats.streetWearMat = this.wearMat;
      mats.streetCurbMat = this.curbMat;
      mats.streetDecalMat = this.decalMat;
      // asphalt / paving / kerb / line-wear detail lives in surfaces.js (installSurfaceShaders) [street-props]
    }
    this.detailMats = new Set([this.lineMat, this.wearMat, this.curbMat, this.decalMat]);

    const models = buildModels();
    const furnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.3 });
    patchFurnitureMaterial(furnMat); // [street-props]
    this.meshes = {};
    for (const [type, [cull, cap, shadow]] of Object.entries(TYPE_CFG)) {
      const mesh = new THREE.InstancedMesh(models[type], furnMat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = false;
      mesh.name = `street_${type}`;
      mesh.userData.cull = cull;
      this.meshes[type] = mesh;
      this.root.add(mesh);
    }

    // [street-props] detailed near-LOD twins (`<type>Near`), filled in _refresh for instances within NEAR_CFG range
    const nearModels = buildNearModels();
    const nearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.3, side: THREE.DoubleSide });
    patchFurnitureMaterial(nearMat);
    this.nearOf = {};
    for (const [type, [dist, cap, shadow]] of Object.entries(NEAR_CFG)) {
      const mesh = new THREE.InstancedMesh(nearModels[type], nearMat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.name = `street_${type}Near`;
      mesh.userData.near2 = dist * dist;
      this.meshes[`${type}Near`] = mesh;
      this.nearOf[type] = mesh;
      this.root.add(mesh);
    }
    // bus shelter glazing: same matrices as busStopNear, written alongside it
    this.glassMesh = new THREE.InstancedMesh(busStopGlass(), new THREE.MeshStandardMaterial({
      color: 0xa9c4cf, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide,
    }), NEAR_CFG.busStop[1]);
    this.glassMesh.instanceMatrix = this.nearOf.busStop.instanceMatrix;
    this.glassMesh.count = 0;
    this.glassMesh.frustumCulled = false;
    this.glassMesh.name = 'street_busStopGlass';
    this.root.add(this.glassMesh); // [/street-props]

    // Roadside Traffic Signs InstancedMeshes (STOP, Speed Limit, Warning Diamonds)
    this.signAtlasTex = buildTrafficSignAtlasTexture();
    this.signAtlasMat = new THREE.MeshStandardMaterial({
      map: this.signAtlasTex,
      vertexColors: true,
      roughness: 0.38,
      metalness: 0.15,
      alphaTest: 0.35,
    });
    const signModels = buildSignModels();
    for (const [type, [cull, cap, shadow]] of Object.entries(SIGN_TYPE_CFG)) {
      const mesh = new THREE.InstancedMesh(signModels[type], this.signAtlasMat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = false;
      mesh.name = `street_${type}`;
      mesh.userData.cull = cull;
      this.meshes[type] = mesh;
      this.root.add(mesh);
    }

    // Dynamic Overhead Highway Gantry Guide Sign Panels & Intersection Street Name Blade Signs
    this.gantrySignGroup = new THREE.Group();
    this.gantrySignGroup.name = 'street_gantry_panels';
    this.root.add(this.gantrySignGroup);

    this.bladeSignGroup = new THREE.Group();
    this.bladeSignGroup.name = 'street_name_blades';
    this.root.add(this.bladeSignGroup);

    this._gantryMainGeom = makeDoubleSidedSignGeom(4.6, 2.25);
    this._gantryMainGeom.rotateY(-Math.PI / 2);
    this._gantryExitGeom = makeDoubleSidedSignGeom(3.3, 2.05);
    this._gantryExitGeom.rotateY(-Math.PI / 2);
    this._gantryBackBoxMain = new THREE.BoxGeometry(4.64, 2.28, 0.11);
    this._gantryBackBoxExit = new THREE.BoxGeometry(3.34, 2.08, 0.11);
    this._gantryBackMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5, metalness: 0.6 });
    this._bladeGeomA = makeDoubleSidedSignGeom(1.36, 0.28);
    this._bladeGeomB = makeDoubleSidedSignGeom(1.36, 0.28);
    this._bladeGeomB.rotateY(Math.PI / 2);

    this._gantryMatCache = new Map();
    this._bladeMatCache = new Map();

    // Night lighting: bulbs (emissive), halos (billboards), pools (ground decals)
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0x8a8a84, toneMapped: false });
    this.bulbs = new THREE.InstancedMesh(models.bulb, this.bulbMat, 6000);
    this.bulbsPost = new THREE.InstancedMesh(models.bulbPost, this.bulbMat, 2000);
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 3.4 }, uColor: { value: new THREE.Color(1.0, 0.78, 0.5) }, uIntensity: { value: 0 } },
      vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.haloMat, 8000);
    const poolGeom = new THREE.PlaneGeometry(1, 1);
    poolGeom.rotateX(-Math.PI / 2);
    this.poolMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.66, 0.34) }, uIntensity: { value: 0 } },
      vertexShader: POOL_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8,
    });
    this.pools = new THREE.InstancedMesh(poolGeom, this.poolMat, 8000);
    for (const m of [this.bulbs, this.bulbsPost, this.halos, this.pools]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      this.root.add(m);
    }
    this.halos.renderOrder = 3;
    this.pools.renderOrder = 2;

    // Signal lamps (per-instance color, updated every frame)
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.lamps = new THREE.InstancedMesh(models.tlLamp, this.lampMat, 1500);
    this.lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lamps.setColorAt(0, new THREE.Color(1, 1, 1));
    this.lamps.count = 0;
    this.lamps.frustumCulled = false;
    this.root.add(this.lamps);

    this.activeSignals = [];
    this.damage = new PropDamage(); // [prop-damage] knocked-over props (persist across refreshes)
    this._hitList = []; // [prop-damage] damageable props near the camera, rebuilt each refresh
    this.lastRefresh = { x: Infinity, z: Infinity, sig: '', vis: true };
    this.stats = { instances: 0, signals: 0, heads: 0, gantries: 0, blades: 0, refreshMs: 0 };
    this._col = { green: new THREE.Color(0.15, 1.0, 0.45), yellow: new THREE.Color(1.0, 0.72, 0.05), red: new THREE.Color(1.0, 0.12, 0.08) };
    this._lightOn = -1;
  }

  _getGantryMat(region, isMotorway, refStr, mainText, subText, exitStr, isExitPanel) {
    const key = `${region}|${isMotorway}|${refStr}|${mainText}|${subText}|${exitStr}|${isExitPanel ? 1 : 0}`;
    let mat = this._gantryMatCache.get(key);
    if (mat) {
      // LRU: move to the newest end, so eviction only hits signs nobody has asked for in a while.
      this._gantryMatCache.delete(key);
      this._gantryMatCache.set(key, mat);
    } else {
      // Each panel is a 512x256 canvas texture (~0.7 MB on the GPU); at most a few are on screen at once.
      if (this._gantryMatCache.size > SIGN_MAT_CACHE_MAX) {
        const firstKey = this._gantryMatCache.keys().next().value;
        const old = this._gantryMatCache.get(firstKey);
        if (old && old.map) old.map.dispose();
        if (old) old.dispose();
        this._gantryMatCache.delete(firstKey);
      }
      const tex = buildGantryPanelTexture(region, isMotorway, refStr, mainText, subText, exitStr, isExitPanel);
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0.12 });
      this._gantryMatCache.set(key, mat);
    }
    return mat;
  }

  _getBladeMat(streetName) {
    const key = String(streetName || 'MAIN ST').toUpperCase();
    let mat = this._bladeMatCache.get(key);
    if (mat) {
      this._bladeMatCache.delete(key); // LRU, as above
      this._bladeMatCache.set(key, mat);
    } else {
      // 512x128 canvas texture each; ~16 street-name blades are in view at most in dense cities.
      if (this._bladeMatCache.size > SIGN_MAT_CACHE_MAX) {
        const firstKey = this._bladeMatCache.keys().next().value;
        const old = this._bladeMatCache.get(firstKey);
        if (old && old.map) old.map.dispose();
        if (old) old.dispose();
        this._bladeMatCache.delete(firstKey);
      }
      const tex = buildStreetBladeTexture(key);
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1, alphaTest: 0.3 });
      this._bladeMatCache.set(key, mat);
    }
    return mat;
  }

  _chunkSignature(loadedChunks) {
    let s = loadedChunks.size * 7919;
    for (const g of loadedChunks.values()) s = (s + g.id * 2654435761) % 4294967296;
    return String(s);
  }

  _refresh(cam, loadedChunks) {
    const t0 = performance.now();
    const counts = {};
    for (const k of Object.keys(this.meshes)) counts[k] = 0;
    let nBulb = 0, nBulbPost = 0, nHalo = 0, nPool = 0;
    this.activeSignals.length = 0;
    const cx = cam.x, cz = cam.z;
    const bulbArr = this.bulbs.instanceMatrix.array, bulbPostArr = this.bulbsPost.instanceMatrix.array;
    const haloArr = this.halos.instanceMatrix.array, poolArr = this.pools.instanceMatrix.array;

    // Clear dynamic sign panel groups
    while (this.gantrySignGroup.children.length > 0) this.gantrySignGroup.remove(this.gantrySignGroup.children[0]);
    while (this.bladeSignGroup.children.length > 0) this.bladeSignGroup.remove(this.bladeSignGroup.children[0]);
    let gantryCount = 0, bladeCount = 0;
    let pavD = Infinity, pavRegion = ''; // [street-props] sidewalk paving style follows the nearest chunk's region
    const dmgList = this.damage.list, hitList = this._hitList; // [prop-damage]
    for (const e of dmgList) e.slots.length = 0;
    hitList.length = 0;

    // [feature/street-detail] real OSM furniture as a pseudo chunk (world coords) + suppression of nearby procedural duplicates
    const sd = this.streetDetail && this.streetDetail.st ? this.streetDetail : null;
    const groups = sd ? [...loadedChunks.values(), sd.pseudo] : loadedChunks.values();
    for (const group of groups) {
      const st = group.userData && group.userData.street;
      const isReal = !!group.userData.realDetail;
      const sup = sd && !isReal ? sd.suppress : null; // [/feature/street-detail]
      const ox = group.userData.ox, oz = group.userData.oz;
      const chunkD = Math.hypot(ox - cx, oz - cz);
      const sg = group.userData.subGroups;
      if (sg && sg.markings) {
        for (const m of sg.markings.children) {
          if (this.detailMats.has(m.material)) m.visible = chunkD < (m.material === this.wearMat ? DETAIL_CULL_M - 350 : DETAIL_CULL_M);
        }
      }
      if (!st || (chunkD > 1300 && !isReal)) continue;
      const region = st.region || 'us';
      if (!isReal && chunkD < pavD) { pavD = chunkD; pavRegion = region; } // [street-props]

      for (const [type, arr] of Object.entries(st.types || {})) {
        const mesh = this.meshes[type];
        if (!mesh) continue;
        const r2 = mesh.userData.cull * mesh.userData.cull;
        const cap = mesh.instanceMatrix.count;
        const out = mesh.instanceMatrix.array;
        const supG = sup && sup[type]; // [feature/street-detail]
        const near = this.nearOf[type], nearKey = `${type}Near`; // [street-props]
        const near2 = near ? near.userData.near2 : -1, nearCap = near ? near.instanceMatrix.count : 0;
        for (let i = 0; i < arr.length; i += STRIDE) {
          const x = arr[i] + ox, z = arr[i + 2] + oz;
          const dx = x - cx, dz = z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 > r2) continue;
          if (supG && supG.near(x, z)) continue; // [feature/street-detail]
          const dmg = dmgList.length ? this.damage.find(type, x, z) : null; // [prop-damage]
          if (!dmg && d2 < 8100 && (PROP_DAMAGE_CFG[type] || type === 'tlArm' || type === 'tlHeadV' || type === 'tlHeadH')) {
            hitList.push({ type, x, y: arr[i + 1], z, rot: arr[i + 3], sx: arr[i + 4] });
          }
          if (d2 < near2 && counts[nearKey] < nearCap) { // [street-props]
            const k = counts[nearKey]++;
            writeMatrix(near.instanceMatrix.array, k * 16, x, arr[i + 1], z, arr[i + 3], arr[i + 4]);
            if (dmg) this.damage.place(dmg, near, k); // [prop-damage]
            continue;
          }
          const n = counts[type];
          if (n >= cap) break;
          writeMatrix(out, n * 16, x, arr[i + 1], z, arr[i + 3], arr[i + 4]);
          if (dmg) this.damage.place(dmg, mesh, n); // [prop-damage]
          counts[type] = n + 1;
        }
      }

      // Dynamic Overhead Highway Gantry Guide Sign Panels
      const gantries = st.gantries;
      if (gantries && gantries.length > 0) {
        const gCull2 = GANTRY_CULL_M * GANTRY_CULL_M;
        for (let i = 0; i < gantries.length; i++) {
          if (gantryCount >= 48) break;
          const g = gantries[i];
          const gx = g[0] + ox, gy = g[1], gz = g[2] + oz;
          const dx = gx - cx, dz = gz - cz;
          if (dx * dx + dz * dz > gCull2) continue;
          const rot = g[3], spanW = g[4], isMoto = g[6], refStr = g[7], nameStr = g[8], dest2Str = g[9], exitStr = g[10];

          const holder = new THREE.Group();
          holder.position.set(gx, gy + 6.85, gz);
          holder.rotation.y = rot;

          const mainMat = this._getGantryMat(region, isMoto, refStr, nameStr, dest2Str, exitStr, false);
          if (spanW >= 11.8) {
            // Two overhead highway guide panels side-by-side along the truss (Main Through Panel + Exit Panel)
            const m1 = new THREE.Mesh(this._gantryMainGeom, mainMat);
            const b1 = new THREE.Mesh(this._gantryBackBoxMain, this._gantryBackMat);
            m1.position.set(-2.05, 0, 0.56);
            b1.position.set(-2.05, 0, 0.48);
            holder.add(m1, b1);

            const exitMat = this._getGantryMat(region, isMoto, refStr, dest2Str, nameStr, exitStr, true);
            const m2 = new THREE.Mesh(this._gantryExitGeom, exitMat);
            const b2 = new THREE.Mesh(this._gantryBackBoxExit, this._gantryBackMat);
            m2.position.set(2.35, 0, 0.56);
            b2.position.set(2.35, 0, 0.48);
            holder.add(m2, b2);
          } else {
            const m1 = new THREE.Mesh(this._gantryMainGeom, mainMat);
            const b1 = new THREE.Mesh(this._gantryBackBoxMain, this._gantryBackMat);
            m1.position.set(0, 0, 0.56);
            b1.position.set(0, 0, 0.48);
            holder.add(m1, b1);
          }
          this.gantrySignGroup.add(holder);
          gantryCount++;
        }
      }

      // Dynamic Intersection Green Street Name Blade Signs
      const blades = st.blades;
      if (blades && blades.length > 0) {
        const bCull2 = BLADE_CULL_M * BLADE_CULL_M;
        for (let i = 0; i < blades.length; i++) {
          if (bladeCount >= 90) break;
          const b = blades[i];
          const bx = b[0] + ox, by = b[1], bz = b[2] + oz;
          const dx = bx - cx, dz = bz - cz;
          if (dx * dx + dz * dz > bCull2) continue;
          const rot = b[3], streetA = b[4], streetB = b[5];

          const holder = new THREE.Group();
          holder.position.set(bx, by, bz);
          holder.rotation.y = rot;

          const matA = this._getBladeMat(streetA);
          const matB = this._getBladeMat(streetB);
          const meshA = new THREE.Mesh(this._bladeGeomA, matA);
          meshA.position.set(0, 0, 0);
          const meshB = new THREE.Mesh(this._bladeGeomB, matB);
          meshB.position.set(0, 0.28, 0);
          holder.add(meshA, meshB);
          this.bladeSignGroup.add(holder);
          bladeCount++;
        }
      }

      const heads = st.heads;
      if (heads) {
        const r2 = HEAD_CULL * HEAD_CULL;
        for (let i = 0; i < heads.length; i += HEAD_STRIDE) {
          const x = heads[i] + ox, y = heads[i + 1], z = heads[i + 2] + oz;
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz > r2) continue;
          if (sup && sup._lamp) { // [feature/street-detail] drop bulbs of suppressed procedural lamps (test the pole position)
            const hh = y - heads[i + 4], ho = hh > 9.5 ? 2.4 : hh > 8.5 ? 2.6 : hh > 8 ? 2.3 : 0;
            if (sup._lamp.near(x - Math.cos(heads[i + 3]) * ho, z + Math.sin(heads[i + 3]) * ho)) continue;
          }
          if (dmgList.length && this.damage.lampDown(x, z, heads[i + 3], y - heads[i + 4])) continue; // [prop-damage] bulb is out
          const isPost = y - heads[i + 4] < 5;
          if (isPost) {
            if (nBulbPost < 2000) writeMatrix(bulbPostArr, nBulbPost++ * 16, x, y, z, heads[i + 3], 1);
          } else if (nBulb < 6000) writeMatrix(bulbArr, nBulb++ * 16, x, y, z, heads[i + 3], 1);
          if (nHalo < 8000) writeMatrix(haloArr, nHalo++ * 16, x, y - (isPost ? 0 : 0.1), z, 0, 1);
          if (nPool < 8000) {
            const sc = isPost ? 8 : 12;
            writeMatrixScaled(poolArr, nPool++ * 16, x, heads[i + 4] + 0.08, z, sc);
          }
        }
      }
      const sig = st.signals;
      if (sig) {
        for (let i = 0; i < sig.length; i += SIG_STRIDE) {
          const x = sig[i] + ox, z = sig[i + 2] + oz;
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz > HEAD_CULL * HEAD_CULL) continue;
          if (dmgList.length && (this.damage.find('tlHeadV', x, z, 0.6) || this.damage.find('tlHeadH', x, z, 0.6))) continue; // [prop-damage]
          const nx = sig[i + 5] + ox, nz = sig[i + 6] + oz;
          this.activeSignals.push({
            x, y: sig[i + 1], z, c: Math.cos(sig[i + 3]), s: Math.sin(sig[i + 3]), axis: sig[i + 4],
            key: `${Math.round(nx)},${Math.round(nz)}`, horiz: sig[i + 7] > 0.5, phase: '',
          });
        }
      }
    }

    let total = 0;
    for (const [type, mesh] of Object.entries(this.meshes)) {
      mesh.count = counts[type];
      mesh.visible = counts[type] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      total += counts[type];
    }
    if (pavRegion) SURFACE_UNIFORMS.uPaving.value = PAVER_REGIONS.has(pavRegion) ? 1 : 0; // [street-props]
    this.glassMesh.count = counts.busStopNear; // [street-props]
    this.glassMesh.visible = counts.busStopNear > 0;
    this.bulbs.count = nBulb;
    this.bulbsPost.count = nBulbPost;
    this.halos.count = nHalo;
    this.pools.count = nPool;
    for (const m of [this.bulbs, this.bulbsPost, this.halos, this.pools]) m.instanceMatrix.needsUpdate = true;
    this.bulbs.visible = nBulb > 0;
    this.bulbsPost.visible = nBulbPost > 0;
    this._lightOn = -1;
    this.stats.instances = total;
    this.stats.heads = nHalo;
    this.stats.signals = this.activeSignals.length;
    this.stats.gantries = gantryCount;
    this.stats.blades = bladeCount;
    this.stats.refreshMs = +(performance.now() - t0).toFixed(2);
  }

  _updateSignals() {
    const sigs = this.activeSignals;
    const n = Math.min(sigs.length, this.lamps.instanceMatrix.count);
    const arr = this.lamps.instanceMatrix.array;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const g = sigs[i];
      const phase = getSignalPhase(g.key, undefined, g.axis ? 'ew' : 'ns') || 'red';
      if (phase === g.phase) continue;
      g.phase = phase;
      changed = true;
      const slot = phase === 'red' ? 0.33 : phase === 'yellow' ? 0 : -0.33;
      const lx = 0.168, ly = g.horiz ? 0 : slot, lz = g.horiz ? -slot : 0;
      const wx = g.x + g.c * lx + g.s * lz;
      const wz = g.z - g.s * lx + g.c * lz;
      writeMatrix(arr, i * 16, wx, g.y + ly, wz, Math.atan2(g.s, g.c), 1);
      this.lamps.setColorAt(i, this._col[phase] || this._col.red);
    }
    if (this.lamps.count !== n) {
      this.lamps.count = n;
      changed = true;
    }
    if (changed) {
      this.lamps.instanceMatrix.needsUpdate = true;
      if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    }
  }

  /** Per-frame update. Cheap unless the camera moved > REFRESH_MOVE_M or the chunk set changed. */
  update(dt, camPos, loadedChunks, layerVisibility, worldOrigin) {
    if (worldOrigin !== this._origin) {
      this._origin = worldOrigin;
      setStreetWorldOrigin(worldOrigin);
      this.damage.clear(); // [prop-damage]
    }
    const vis = !layerVisibility || layerVisibility.facilities !== false;
    this.root.visible = vis && !this._forceHidden;
    if (!vis || !loadedChunks) return;
    const sig = this._chunkSignature(loadedChunks) + (this.streetDetail ? `|sd${this.streetDetail.version}` : ''); // [feature/street-detail]
    const lr = this.lastRefresh;
    this.damage.update(dt); // [prop-damage] falling props
    if (this.damage.dirty) { this.damage.dirty = false; lr.sig = ''; } // bulbs / signal lamps of a downed prop go out
    if (sig !== lr.sig || Math.hypot(camPos.x - lr.x, camPos.z - lr.z) > REFRESH_MOVE_M) {
      lr.sig = sig;
      lr.x = camPos.x;
      lr.z = camPos.z;
      this._refresh(camPos, loadedChunks);
    }
    this._updateSignals();

    const day = getDaylight();
    const on = 1 - smooth(0.15, 0.6, day);
    if (Math.abs(on - this._lightOn) > 0.005) {
      this._lightOn = on;
      this.bulbMat.color.setRGB(0.54 + 0.46 * on, 0.54 + 0.36 * on, 0.5 + 0.2 * on);
      FURNITURE_UNIFORMS.uFurnNight.value = on; // [street-props] lit refractors, LED panels, ad boxes
      this.haloMat.uniforms.uIntensity.value = 1.0 * on;
      this.poolMat.uniforms.uIntensity.value = 0.55 * on;
      this.halos.visible = on > 0.02 && this.halos.count > 0;
      this.pools.visible = on > 0.02 && this.pools.count > 0;
    }
  }

  // ---------- [prop-damage] ----------

  /** Knocks over prop `p` (a _hitList entry) toward (fx, fz); a signal pole takes its arm and head with it. */
  _knock(p, fx, fz) {
    if (p.type === 'tlArm' || p.type === 'tlHeadV' || p.type === 'tlHeadH') {
      // hit the arm / head: find the pole it hangs from
      const pole = this._hitList.find((q) => q.type === 'tlPole' && Math.abs(q.x - p.x) < 8.5 && Math.abs(q.z - p.z) < 8.5 &&
        (p.type === 'tlArm' ? Math.abs(q.x - p.x) < 0.3 && Math.abs(q.z - p.z) < 0.3 : true) && this._headOf(q, p));
      if (!pole) return false;
      p = pole;
    }
    if (p.type === 'tlPole' || p.type === 'lampArm' || p.type === 'lampCobra' || p.type === 'lampDouble') {
      // poles with a mast arm fall sideways to it, so the arm lands flat instead of spearing the road
      const px = Math.sin(p.rot), pz = Math.cos(p.rot), sg = fx * px + fz * pz < 0 ? -1 : 1;
      fx = px * sg; fz = pz * sg;
    }
    const e = this.damage.topple(p.type, p.x, p.y, p.z, fx, fz);
    if (!e) return false;
    if (p.type === 'tlPole') {
      const piv = [p.x + fx * 0.18 / (Math.hypot(fx, fz) || 1), p.y, p.z + fz * 0.18 / (Math.hypot(fx, fz) || 1)];
      for (const q of this._hitList) {
        if (q.type === 'tlArm' && Math.abs(q.x - p.x) < 0.3 && Math.abs(q.z - p.z) < 0.3) this.damage.topple('tlArm', q.x, q.y, q.z, fx, fz, piv, 'tlPole', e);
        else if ((q.type === 'tlHeadV' || q.type === 'tlHeadH') && this._headOf(p, q)) this.damage.topple(q.type, q.x, q.y, q.z, fx, fz, piv, 'tlPole', e);
      }
    }
    return true;
  }

  /** True when signal head h hangs at the end of pole's mast arm. */
  _headOf(pole, h) {
    if (h.type === 'tlArm') return true;
    for (const q of this._hitList) {
      if (q.type !== 'tlArm' || Math.abs(q.x - pole.x) > 0.3 || Math.abs(q.z - pole.z) > 0.3) continue;
      const ex = pole.x + Math.cos(q.rot) * q.sx, ez = pole.z - Math.sin(q.rot) * q.sx;
      if (Math.abs(ex - h.x) < 0.7 && Math.abs(ez - h.z) < 0.7) return true;
    }
    return false;
  }

  /**
   * Weapon impact (walker_weapons _applyImpact): explosions knock over everything in the splash radius; bullets
   * chip hit points off the first prop along the shot (from -> to) or right at the impact point.
   */
  weaponHit(from, to, splash) {
    const L = this._hitList;
    if (!L.length) return 0;
    let n = 0;
    if (splash > 0) {
      for (const p of L) {
        const dx = p.x - to.x, dz = p.z - to.z, d = Math.hypot(dx, dz);
        if (d > splash + 0.5 || to.y > p.y + 12) continue;
        if (this.damage.hit(p.type, p.x, p.z, d < splash * 0.6 ? 99 : 4) && this._knock(p, dx || Math.random() - 0.5, dz || Math.random() - 0.5)) n++;
      }
      return n;
    }
    const ox = from.x, oy = from.y + 1.4, oz = from.z, sx = to.x - ox, sy = to.y - oy, sz = to.z - oz;
    const len2 = sx * sx + sz * sz;
    let best = null, bt = 2;
    for (const p of L) {
      if (p.type === 'tlArm' || p.type === 'tlHeadV' || p.type === 'tlHeadH') continue;
      const c = PROP_DAMAGE_CFG[p.type];
      // closest approach of the shot (2D) to the prop's axis, then height check at that point
      const t = len2 > 1e-6 ? Math.max(0, Math.min(1, ((p.x - ox) * sx + (p.z - oz) * sz) / len2)) : 1;
      const qx = ox + sx * t - p.x, qz = oz + sz * t - p.z, qy = oy + sy * t;
      if (qx * qx + qz * qz > (c[2] + 0.12) * (c[2] + 0.12) || qy < p.y - 0.1 || qy > p.y + c[3]) continue;
      if (t < bt) { bt = t; best = p; }
    }
    if (best && this.damage.hit(best.type, best.x, best.z, 1) && this._knock(best, sx, sz)) n++;
    return n;
  }

  /**
   * Player vehicle sweep (main.js drive step): props inside the car's footprint go over in the travel direction.
   * Returns the factor the car keeps of its speed (1 when nothing was hit).
   */
  collideVehicle(pos, yaw, speed, spec) {
    const L = this._hitList;
    if (!L.length || Math.abs(speed) < 2.5) return 1;
    const sy = Math.sin(yaw), cy = Math.cos(yaw), hl = (spec && spec.length ? spec.length : 4.6) * 0.5, hw = (spec && spec.width ? spec.width : 2.0) * 0.5;
    const dir = Math.sign(speed);
    let keep = 1;
    for (const p of L) {
      if (p.type === 'tlArm' || p.type === 'tlHeadV' || p.type === 'tlHeadH') continue;
      const dx = p.x - pos.x, dz = p.z - pos.z;
      if (dx * dx + dz * dz > 64 || Math.abs(p.y - pos.y) > 3) continue;
      const c = PROP_DAMAGE_CFG[p.type];
      const f = dx * sy + dz * cy, l = dx * cy - dz * sy;
      if (Math.abs(f) > hl + c[2] || Math.abs(l) > hw + c[2]) continue;
      if (this.damage.find(p.type, p.x, p.z)) continue;
      // pushed along the travel direction, a little away from the car's centre line
      const side = Math.sign(l) * 0.35;
      if (this._knock(p, (sy + cy * side) * dir, (cy - sy * side) * dir)) keep *= c[4];
    }
    return keep;
  }

  debugStats() {
    const drawn = Object.values(this.meshes).filter((m) => m.visible).length +
      [this.bulbs, this.bulbsPost, this.halos, this.pools, this.lamps].filter((m) => m.visible && m.count > 0).length;
    return { ...this.stats, drawCalls: drawn, lightOn: +this._lightOn.toFixed(2) };
  }
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Column-major TRS: rotation about Y by `rot`, scale X by `sx`
function writeMatrix(out, o, x, y, z, rot, sx) {
  const c = Math.cos(rot), s = Math.sin(rot);
  out[o] = c * sx; out[o + 1] = 0; out[o + 2] = -s * sx; out[o + 3] = 0;
  out[o + 4] = 0; out[o + 5] = 1; out[o + 6] = 0; out[o + 7] = 0;
  out[o + 8] = s; out[o + 9] = 0; out[o + 10] = c; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}
function writeMatrixScaled(out, o, x, y, z, sc) {
  out[o] = sc; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
  out[o + 4] = 0; out[o + 5] = 1; out[o + 6] = 0; out[o + 7] = 0;
  out[o + 8] = 0; out[o + 9] = 0; out[o + 10] = sc; out[o + 11] = 0;
  out[o + 12] = x; out[o + 13] = y; out[o + 14] = z; out[o + 15] = 1;
}
