// feature/beijing-landmarks: Hall of Prayer for Good Harvests (祈年殿), Temple of Heaven, Beijing — 1:1.
// Fitted to OSM: hall way 439211392 (Ø ≈ 29 m roof outline) and the three ring footways on the altar tiers
// (r ≈ 45.5 / 40 / 34 m); Qinian Gate (祈年门) 104 m south on the axis (OSM 40 x 19 m). The temple axis is
// rotated ~2.5° (footways), heading 177.5. The model origin sits 32 m south of the hall so the rectangular
// suppression box (hw 45, hd 82) covers hall + gate but keeps the Imperial Vault hall to the north and the
// east/west annex halls.
// Altar of Prayer: 3-tier round white-marble Xumizuo terrace (Ø 91 m, 5.7 m) with balustrades, stairways on
// all four sides (south/north: wide flights with the central carved dragon ramp). Hall: Ø 32 m eaves, 38 m
// to the gilded finial, triple-eave conical roof in deep-blue glazed tiles, red columns, red/gold lattice
// doors and windows, painted blue-green brackets. Front = south = local -Z (local +X = west).
// Night: modest floodlight glow on the lattice drums and the altar waists.
import { C, hall, rail, wallRun, TAU } from "../cn_arch.js";

export const lodDist = 1800;
export const glowStrength = 0.45;

const HZ = 32;                    // hall centre, local z (north of the origin)
const GZ = HZ - 104;              // Qinian Gate centre
const TIER_R = [45.5, 40, 34], TH = 1.9, Y0 = TH * 3; // altar tiers (top radii), tier height
const BLUE = 0x1d4a92, BLUE_DK = 0x15376e, BLUE_RIB = 0x2a5aa6;

export const colliders = [
  { x: 0, z: HZ, r: TIER_R[0], h: TH },
  { x: 0, z: HZ, r: TIER_R[1], h: TH * 2 },
  { x: 0, z: HZ, r: TIER_R[2], h: Y0 },
  { x: 0, z: HZ, r: 13, h: 30 },
  { x: 0, z: GZ, hw: 18.5, hd: 9.7, h: 13 },
];

// ------------------------------------------------------------------ helpers (local to the hall frame)
const Y = (y0, H, t) => y0 + H * (0.3 * t + 0.7 * t * t);

/** Concave conical glazed roof: eave radius rb at y0 rising to rt at y0+H; soffit back to rWall. */
function cone(k, y0, rb, rt, H, rWall, seg, ribs) {
  const N = k.hi ? 7 : 3;
  const prof = [];
  for (let i = 0; i <= N; i++) { const t = i / N; prof.push([rb + (rt - rb) * t, Y(0, H, t)]); }
  k.color(BLUE_DK).lathe(0, y0, 0, prof.slice(0, 2), seg, { caps: false });
  k.color(BLUE).lathe(0, y0, 0, prof.slice(1), seg, { caps: false });
  // fascia + painted soffit
  k.color(BLUE_DK).lathe(0, y0 - 0.5, 0, [[rb, 0], [rb, 0.5]], seg, { caps: false });
  k.color(C.BRACKET).lathe(0, y0 - 1.1, 0, [[rWall, 0], [rb, 0.6]], seg, { caps: false });
  if (ribs && k.hi) { // tile ridges (筒瓦)
    k.color(BLUE_RIB);
    const n = Math.round((TAU * rb) / 1.05);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * TAU, c = Math.cos(a), s = Math.sin(a);
      let prev = null;
      for (let i = 0; i <= 5; i++) {
        const t = (i / 5) * ribs;
        const r = rb + (rt - rb) * t, yy = y0 + Y(0, H, t) + 0.12;
        const p = [r * c, yy, r * s];
        if (prev) k.strut(prev, p, 0.2);
        prev = p;
      }
    }
  }
}

/** Painted bracket band: beam ring + flared dougong course with gold / blue blocks. Returns top y. */
function bracketRing(k, r, y, h) {
  const seg = k.hi ? 48 : 16;
  k.color(C.BEAM).lathe(0, y, 0, [[r, 0], [r, h * 0.4]], seg, { caps: false });
  k.color(C.BRACKET).lathe(0, y + h * 0.4, 0, [[r, 0], [r + h * 0.8, h * 0.6]], seg, { caps: false });
  if (k.hi) {
    const n = Math.round((TAU * r) / 1.4);
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU;
      k.push().translate(Math.cos(a) * (r + 0.1), y, Math.sin(a) * (r + 0.1)).rotateY(Math.PI / 2 - a);
      k.color(i % 2 ? C.BRACKET_B : C.GOLD).box(0, h * 0.08, 0, 0.5, h * 0.26, 0.22);
      k.pop();
    }
  }
  return y + h;
}

/** Ring of n red lattice bays (doors / windows) between n columns, radius r, from y0, height h. */
function latticeRing(k, r, y0, h, n, colR, doors) {
  const seg = k.hi ? 40 : 14;
  k.glow(true).color(C.WALL).lathe(0, y0, 0, [[r - 0.25, 0], [r - 0.25, h]], seg, { caps: false });
  const chord = 2 * r * Math.sin(Math.PI / n);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * TAU;
    k.push().translate(Math.cos(a) * r * Math.cos(Math.PI / n), y0, Math.sin(a) * r * Math.cos(Math.PI / n)).rotateY(Math.PI / 2 - a);
    k.glow(true).color(C.DOOR).box(0, 0, 0, chord - colR, h, 0.22);
    if (k.hi) {
      const lw = chord - colR - 0.5, ly = doors ? h * 0.38 : h * 0.18, lh = doors ? h * 0.5 : h * 0.64;
      k.color(C.LATTICE).box(0, ly, 0.08, lw, lh, 0.12);
      k.color(C.RED);
      const nv = doors ? 4 : 3;
      for (let q = 0; q <= nv; q++) k.box(-lw / 2 + (lw * q) / nv, ly - 0.05, 0.16, 0.14, lh + 0.1, 0.06);
      k.box(0, ly - 0.07, 0.16, lw, 0.14, 0.06).box(0, ly + lh - 0.07, 0.16, lw, 0.14, 0.06);
    }
    k.pop();
  }
  k.glow(false);
  if (k.hi) {
    k.color(C.RED);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      k.cyl(Math.cos(a) * r, y0, Math.sin(a) * r, colR, colR * 0.92, h, 8, { caps: false });
    }
  }
}

/** Stair flight on a round tier: outward unit (ux, uz), top edge at radius r, rising h; width w, offset along tangent. */
function flight(k, ux, uz, r, ytop, h, w, carved) {
  const a = Math.atan2(-ux, -uz);
  const run = h * 1.9;
  k.push().translate(ux * r, ytop - h, uz * r).rotateY(a);
  k.color(C.MARBLE);
  if (k.hi) {
    const n = Math.max(3, Math.round(h / 0.16));
    for (let i = 0; i < n; i++) {
      const zs = -run + (run * i) / n;
      k.box(0, 0, (zs + 0.6) / 2, w, (h * (i + 1)) / n, 0.6 - zs);
    }
    if (carved) { // central carved dragon-phoenix ramp
      k.color(C.MARBLE_DK);
      const rw = w * 0.3;
      k.quad([rw / 2, 0.06, -run], [-rw / 2, 0.06, -run], [-rw / 2, h + 0.06, 0], [rw / 2, h + 0.06, 0]);
      k.color(C.MARBLE);
      for (const sx of [-1, 1]) k.taper(sx * rw / 2, 0, -run / 2, 0.25, run, 0.25, 0.25, h + 0.25, 0, run / 2);
    }
    for (const sx of [-1, 1]) k.taper(sx * (w / 2 + 0.3), 0, -run / 2 + 0.3, 0.6, run + 0.6, 0.6, 0.6, h + 0.7, 0, run / 2);
  } else {
    k.taper(0, 0, -run / 2 + 0.3, w, run + 0.6, w, 0.6, h, 0, run / 2);
  }
  k.pop();
}

const SIDES = [[0, -1, 11, true], [0, 1, 11, true], [1, 0, 4.6, false], [-1, 0, 4.6, false]]; // ux, uz, width, carved

function altar(k) {
  const seg = k.hi ? 96 : 24;
  for (let t = 0; t < 3; t++) {
    const r = TIER_R[t], y = t * TH;
    k.glow(false).color(C.MARBLE).lathe(0, y, 0, [[r + 0.3, 0], [r + 0.3, TH * 0.22], [r - 0.1, TH * 0.27]], seg, { caps: false });
    k.glow(true).color(C.MARBLE_DK).lathe(0, y, 0, [[r - 0.1, TH * 0.27], [r - 0.1, TH * 0.73]], seg, { caps: false });
    k.glow(false).color(C.MARBLE).lathe(0, y, 0, [[r - 0.1, TH * 0.73], [r + 0.25, TH * 0.78], [r + 0.25, TH]], seg, { caps: false });
    k.color(0xd8d3c6).lathe(0, y + TH, 0, [[r + 0.25, 0], [0, 0]], seg, { caps: false });
    for (const [ux, uz, w, carved] of SIDES) flight(k, ux, uz, r, y + TH, TH, w, carved && k.hi);
    // balustrade ring with gaps at the four stairways
    const rr = r - 0.35;
    const gaps = SIDES.map(([ux, uz, w]) => [Math.atan2(uz, ux), (w / 2 + 0.9) / rr]);
    const nArc = k.hi ? Math.round((TAU * rr) / 3) : 24;
    for (let i = 0; i < nArc; i++) {
      const a0 = (i / nArc) * TAU, a1 = ((i + 1) / nArc) * TAU, am = (a0 + a1) / 2;
      if (gaps.some(([g, hw]) => Math.abs(Math.atan2(Math.sin(am - g), Math.cos(am - g))) < hw)) continue;
      rail(k, Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(a1) * rr, Math.sin(a1) * rr, y + TH, { spacing: 1.6 });
    }
    if (k.hi) { // dragon-head spouts under the posts of each tier
      k.color(C.MARBLE_DK);
      const n = Math.round((TAU * r) / 3.2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        k.push().translate(Math.cos(a) * (r + 0.55), y + TH * 0.8, Math.sin(a) * (r + 0.55)).rotateY(Math.PI / 2 - a);
        k.box(0, 0, 0, 0.32, 0.3, 0.7);
        k.pop();
      }
    }
  }
}

function hallOfPrayer(k) {
  const hi = k.hi;
  const seg = hi ? 64 : 18;
  // low marble plinth of the hall
  k.color(C.MARBLE).lathe(0, Y0, 0, [[14.4, 0], [14.4, 0.5], [0, 0.5]], seg, { caps: false });
  const yb = Y0 + 0.5;
  // lower storey: 12 eave columns with lattice doors between them
  latticeRing(k, 12.2, yb, 7.0, 12, 0.62, true);
  let y = bracketRing(k, 12.3, yb + 7.0, 1.3);
  cone(k, y, 16.0, 10.0, 2.9, 12.3, seg, 0.95);
  // middle drum
  latticeRing(k, 9.8, y + 2.4, 3.8, 12, 0.45, false);
  y = bracketRing(k, 9.9, y + 6.2, 1.1);
  cone(k, y, 13.4, 7.7, 2.7, 9.9, seg, 0.95);
  // upper drum
  latticeRing(k, 7.4, y + 2.2, 3.6, 12, 0.4, false);
  y = bracketRing(k, 7.5, y + 5.8, 1.0);
  // top roof
  cone(k, y, 10.9, 0.9, 6.6, 7.5, seg, 0.9);
  if (hi) {
    // Imperial blue-and-gold vertical plaque (祈年殿) on the upper south eave
    k.glow(true).color(C.GOLD).box(0, y - 2.2, -7.65, 1.8, 3.1, 0.18);
    k.color(BLUE_DK).box(0, y - 2.1, -7.72, 1.5, 2.8, 0.14);
    k.color(C.GOLD);
    for (const py of [-0.6, 0.2, 1.0]) k.box(0, y - 1.9 + py, -7.8, 0.6, 0.35, 0.08);
    k.glow(false);
    // Ceremonial Bronze Incense Burner (铜鼎炉) & twin carved marble鹤灯/燎炉 on the top altar south overlook
    k.color(C.MARBLE_DK).box(0, Y0, -24.5, 2.6, 0.6, 2.6);
    k.color(0x8c7038).cyl(0, Y0 + 0.6, -24.5, 0.95, 0.75, 1.4, 10);
    k.sphere(0, Y0 + 2.2, -24.5, 0.85, 8, 5);
    for (const sx of [-8.5, 8.5]) {
      k.color(C.MARBLE).box(sx, Y0, -25.5, 1.8, 1.2, 1.8);
      k.color(0x8c7038).cyl(sx, Y0 + 1.2, -25.5, 0.45, 0.38, 1.6, 8);
    }
    // 8 radial Chiwei /仙人走兽 ridge spines along all 3 blue-tile roof cones
    for (let r = 0; r < 8; r++) {
      const ra = (r / 8) * TAU;
      const c = Math.cos(ra), s = Math.sin(ra);
      k.color(BLUE_RIB);
      k.strut([c * 16.0, yb + 8.3, s * 16.0], [c * 10.2, yb + 11.2, s * 10.2], 0.28);
      k.strut([c * 13.4, yb + 15.6, s * 13.4], [c * 7.9, yb + 18.3, s * 7.9], 0.26);
      k.strut([c * 10.9, y, s * 10.9], [c * 1.0, y + 6.6, s * 1.0], 0.25);
    }
  }
  const ty = y + 6.6;
  k.color(BLUE_DK).cyl(0, ty - 0.2, 0, 1.0, 0.6, 0.5, hi ? 16 : 6);
  // gilded finial (鎏金宝顶)
  k.glow(true).color(C.GOLD);
  const fs = hi ? 16 : 6;
  k.lathe(0, ty + 0.2, 0, [[0.75, 0], [1.05, 0.35], [0.7, 0.75], [0.45, 0.9], [0.9, 1.2], [1.15, 1.75], [0.95, 2.3], [0.4, 2.55], [0.3, 2.8], [0.6, 3.0], [0.55, 3.2], [0.08, 3.85]], fs);
  k.glow(false);
}

function qinianGate(k) {
  const z = GZ - HZ;
  hall(k, {
    x: 0, z, w: 28, d: 10.6, bays: 5, baysD: 3, colH: 6.4, roof: "hip", tile: BLUE, tileDk: BLUE_DK,
    base: { h: 1.6, margin: 4.4, stairs: [{ side: "front", x: 0, w: 9 }, { side: "back", x: 0, w: 9 }] },
    doors: "both", glow: true, rise: 6.2, cheap: !k.hi, beasts: 5,
  });
  // courtyard south wall flanking the gate (OSM wall blocks are suppressed)
  for (const sx of [-1, 1]) wallRun(k, [[sx * 18.8, z], [sx * 59, z]], 4.6, 1.3, { tile: C.GREEN_TILE, tileDk: C.GREEN_TILE_DK, cheap: !k.hi });
  if (k.hi) {
    // Imperial Sacred Way (神道 / 丹陛桥) triple-lane white marble pavement connecting Qinian Gate to the South Altar stairway
    k.color(C.MARBLE).box(0, 0, (z + 9.5 - 49) / 2, 9.6, 0.25, (-49) - (z + 9.5));
    k.color(C.MARBLE_DK).box(0, 0.05, (z + 9.5 - 49) / 2, 3.2, 0.26, (-49) - (z + 9.5));
    // Green-glazed Ritual Incinerator Furnace (燔柴炉) in the SE courtyard
    k.color(C.GREEN_TILE).box(-28, 0, z + 22, 4.6, 2.8, 4.6);
    k.color(C.GREEN_TILE_DK).box(-28, 2.8, z + 22, 3.6, 0.9, 3.6);
  }
}

export function build(k) {
  k.push().translate(0, 0, HZ);
  altar(k);
  hallOfPrayer(k);
  qinianGate(k);
  k.pop();
}
