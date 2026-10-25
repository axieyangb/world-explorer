// places-info: small POI icons on the full 2D map (M), only at street-level zooms. Reads the same
// Z14 OpenMapTiles tiles the game already streams (shared decode cache), one cached icon list per tile.
import { fetchDecodedMvtTile } from '../../global_tiles.js';

const Z = 14;
// class -> [glyph, min zoom, ring colour]
const ICON = {
  school: ['🎓', 15.8, '#e0b84a'], college: ['🎓', 15.4, '#e0b84a'],
  place_of_worship: ['⛪', 16, '#b9a3e3'], museum: ['🏛', 15.4, '#d9c7a0'], stadium: ['🏟', 15, '#7fc98f'],
  police: ['🚓', 15.8, '#6f9bff'], fire_station: ['🚒', 15.8, '#ff7a6b'],
  entrance: ['🚇', 16.2, '#6ad38f'], bus: ['🚌', 17.8, '#6fb3ff'], parking: ['🅿️', 16.8, '#6fa0ff'],
  restaurant: ['🍴', 17, '#ffb36b'], fast_food: ['🍔', 17.4, '#ffb36b'], cafe: ['☕', 17, '#d6a77a'],
  bar: ['🍸', 17.4, '#ff8fb3'], beer: ['🍺', 17.4, '#ff8fb3'], bakery: ['🥐', 17.4, '#d6a77a'],
  shop: ['🛍', 17.4, '#c69cff'], grocery: ['🛒', 17.2, '#8fd18f'], clothing_store: ['🛍', 17.6, '#c69cff'],
};
const MAX_ICONS = 160;
const cache = new Map(); // "x/y" -> [{mx, my, glyph, minZ, ring}] | null

function tileIcons(x, y, onReady) {
  const key = `${x}/${y}`;
  if (cache.has(key)) return cache.get(key);
  cache.set(key, null);
  if (cache.size > 120) cache.delete(cache.keys().next().value);
  const n = 1 << Z;
  fetchDecodedMvtTile(Z, x, y, { cache: false }).then((layers) => { // only the extracted icons are kept
    const out = [];
    for (const f of (layers && layers.poi) || []) {
      if (f.type !== 1 || !f.geom || !f.geom.length) continue;
      const cls = f.tags.class;
      const sub = f.tags.subclass;
      let ic = ICON[cls];
      if (cls === 'entrance' && sub !== 'subway_entrance' && sub !== 'train_station_entrance') ic = null;
      if (cls === 'bus' && sub !== 'bus_stop') ic = null;
      if (cls === 'parking' && sub !== 'parking') ic = null;
      if (!ic) continue;
      const p = Array.isArray(f.geom[0][0]) ? f.geom[0][0] : f.geom[0];
      const s = Math.sin((p[0] * Math.PI) / 180);
      out.push({
        mx: (p[1] + 180) / 360,
        my: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI),
        glyph: ic[0], minZ: ic[1], ring: ic[2], rank: Number(f.tags.rank) || 99,
      });
    }
    out.sort((a, b) => a.minZ - b.minZ || a.rank - b.rank);
    cache.set(key, out);
    if (onReady) onReady();
  }).catch(() => cache.set(key, []));
  return null;
}

/** Draws POI icons on the full map canvas (screen space). `map` is the MapSystem instance. */
export function drawPlaceIcons(ctx, map, W, H) {
  const zoom = map.zoom;
  if (zoom < 15) return;
  const n = 1 << Z;
  const x0 = Math.floor(map._sxToMx(0) * n), x1 = Math.floor(map._sxToMx(W) * n);
  const y0 = Math.floor(map._syToMy(0) * n), y1 = Math.floor(map._syToMy(H) * n);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 36) return;
  const list = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const icons = tileIcons(((tx % n) + n) % n, ty, () => map._requestRender());
      if (icons) for (const ic of icons) if (zoom >= ic.minZ) list.push(ic);
    }
  }
  if (!list.length) return;
  list.sort((a, b) => a.minZ - b.minZ || a.rank - b.rank);
  const cell = 28;
  const used = new Set();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '10px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  let drawn = 0;
  for (const ic of list) {
    if (drawn >= MAX_ICONS) break;
    const sx = map._mxToSx(ic.mx), sy = map._myToSy(ic.my);
    if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
    const k = `${Math.floor(sx / cell)},${Math.floor(sy / cell)}`;
    if (used.has(k)) continue;
    used.add(k);
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(sx, sy, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(22, 25, 30, 0.88)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = ic.ring;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(ic.glyph, sx, sy + 0.5);
    drawn++;
  }
  ctx.restore();
}
