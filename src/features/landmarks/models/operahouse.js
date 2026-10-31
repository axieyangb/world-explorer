// feature/famous-landmarks: Sydney Opera House, Bennelong Point — 1:1 (tallest shell 65 m above the forecourt).
// Pink-granite podium (7 m) with the 97 m monumental steps & bronze handrails on the south, Utzon's folded
// concrete concourse beams & broadwalk arches, two side-by-side shell groups (Concert Hall west, Joan Sutherland
// Theatre east): three nested north-facing sails rising toward the south plus one south-facing sail each,
// knuckle-angled bronze-glass mouth walls, Opera Bar umbrellas, and the small Bennelong restaurant shells at SW.
// Front (-Z) = harbour (north) end; the sails' mouths face the harbour.
const TILE = 0xffffff, TILE2 = 0xefece4, RIB = 0xe2dccd, GLASS = 0x5e4c3a, GLASS_DK = 0x4a3c2e;
const POD = 0xc6a385, POD_DK = 0xa9876b, STEP = 0xd3bc9c, PAVE = 0xbfae96, BRONZE = 0x5a4632;
const PT = 7; // podium top
const SKIRT = -22; // podium / steps base below the model origin

export const lodDist = 1500;
export const glowStrength = 0.8;
export const colliders = [
  { x: 0, z: -8, hw: 60, hd: 88, h: PT },
  { x: -22, z: -22, hw: 19, hd: 52, h: 52 },
  { x: 24, z: -14, hw: 17, hd: 46, h: 46 },
  { x: -22, z: -40, hw: 12, hd: 14, h: 62 },
];

/**
 * One sail: mouth (pointed arch, apex H) at z = zm, ridge sweeping down to the podium at zm + dir*len.
 * dir = +1 -> mouth faces -Z (north/harbour); dir = -1 -> mouth faces +Z (south).
 */
function shell(k, xc, zm, dir, H, hw, len, glass = true) {
  const hi = k.hi;
  const nt = hi ? 26 : 8, nv = hi ? 12 : 4;
  const lean = (H - PT) * 0.22;
  const P = (t, v) => {
    const m = Math.pow(Math.max(0, 1 - Math.abs(t)), 0.55);
    const h = (H - PT) * m;
    const zMouth = zm - dir * lean * m;
    const y = PT + h * Math.pow(Math.cos((v * Math.PI) / 2), 0.85);
    const x = xc + t * hw * (1 - 0.78 * v);
    const z = zMouth + (zm + dir * len - zMouth) * v;
    return [x, y, z];
  };
  // grid
  const G = [];
  for (let i = 0; i <= nt; i++) {
    const row = [];
    for (let j = 0; j <= nv; j++) row.push(P(-1 + (2 * i) / nt, j / nv));
    G.push(row);
  }
  k.glow(true);
  for (let i = 0; i < nt; i++) {
    for (let j = 0; j < nv; j++) {
      const a = G[i][j], b = G[i][j + 1], c = G[i + 1][j + 1], d = G[i + 1][j];
      // rib/tile chevrons: alternate strips across the sail
      k.color(hi && (i + (j >> 1)) % 2 ? TILE2 : TILE);
      if (dir > 0) k.quad(a, b, c, d); else k.quad(a, d, c, b);
      if (hi) {
        k.color(RIB);
        if (dir > 0) k.quad(a, d, c, b); else k.quad(a, b, c, d);
      }
    }
  }
  // mouth edge lip & central dorsal ridge spine + precast concrete fan ribs
  if (hi) {
    k.glow(false).color(RIB);
    const pts = [], ridge = [];
    const mid = Math.floor(nt / 2);
    for (let i = 0; i <= nt; i++) pts.push(G[i][0]);
    for (let j = 0; j <= nv; j++) ridge.push(G[mid][j]);
    k.tube(pts, 0.38, 4);
    k.tube(ridge, 0.34, 4);
    // Radial precast concrete fan ribs across the shell surface
    for (let i = 3; i < nt; i += 4) {
      for (let j = 0; j < nv; j++) k.strut(G[i][j], G[i][j + 1], 0.16);
    }
  }
  // bronze glass wall closing the mouth (fan from the podium), with Utzon's knuckle-angled steel mullions
  if (glass) {
    k.glow(true).color(GLASS);
    const base = [xc, PT, zm + dir * 4];
    for (let i = 0; i < nt; i++) {
      const p = G[i][0], q = G[i + 1][0];
      const a = [p[0] * 0.98 + xc * 0.02, p[1], p[2] + dir * 2.2];
      const b = [q[0] * 0.98 + xc * 0.02, q[1], q[2] + dir * 2.2];
      k.tri(base, a, b).tri(base, b, a);
    }
    if (hi) {
      // Knuckle-angled bronze steel mullions & horizontal transom bars
      k.glow(false).color(GLASS_DK);
      for (let i = 2; i < nt; i += 2) {
        const p = G[i][0];
        const topPt = [p[0] * 0.98 + xc * 0.02, p[1], p[2] + dir * 2.3];
        const knkPt = [p[0] * 0.99, PT + (p[1] - PT) * 0.38, p[2] + dir * 0.9];
        const botPt = [p[0], PT, p[2] + dir * 2.3];
        k.strut(botPt, knkPt, 0.24);
        k.strut(knkPt, topPt, 0.24);
      }
      // Horizontal bronze transom ring across the knuckle line
      for (let i = 2; i < nt - 2; i += 2) {
        const p0 = G[i][0], p1 = G[i + 2][0];
        k.strut([p0[0] * 0.99, PT + (p0[1] - PT) * 0.38, p0[2] + dir * 0.9],
                [p1[0] * 0.99, PT + (p1[1] - PT) * 0.38, p1[2] + dir * 0.9], 0.22);
      }
    }
  }
  k.glow(false);
}

export function build(k) {
  const hi = k.hi;
  // podium: rectangle with chamfered harbour corners
  const pod = [[-60, 64], [60, 64], [60, -78], [44, -96], [-44, -96], [-60, -78]];
  // podium walls run down to SKIRT so the coarse DEM never leaves it or the steps standing on air
  k.color(POD).extrude(pod, SKIRT, PT - 0.6 - SKIRT);
  k.color(PAVE).extrude(pod.map(([x, z]) => [x * 1.005, z * 1.005]), PT - 0.6, 0.6);
  if (hi) {
    // Broadwalk colonnade & harbour seawall parapet around the podium base
    k.color(POD_DK).extrude(pod.map(([x, z]) => [x * 1.01, z * 1.01]), 0, 1.2);
    // Western Broadwalk & Northern Harbour promenade arches + harbourside safety railing
    for (let z = -74; z <= 56; z += 8) {
      k.color(GLASS_DK).box(-60.2, 1.2, z, 0.4, 4.2, 5.2).box(60.2, 1.2, z, 0.4, 4.2, 5.2);
    }
    // Opera Bar outdoor market umbrellas along the lower concourse (east/west harbourside apron)
    for (let z = 12; z <= 52; z += 8) {
      k.color(BRONZE).cyl(-56, 1.2, z, 0.1, 0.1, 2.5, 5);
      k.color(TILE2).cyl(-56, 3.6, z, 2.2, 0.2, 0.65, 8);
    }
    // Northern Harbour Lounge viewing terrace balustrade around the chamfered tip (-Z)
    for (let i = 2; i < 5; i++) {
      const a = pod[i], b = pod[i + 1];
      k.color(BRONZE).strut([a[0] * 0.98, PT + 1.0, a[1] * 0.98], [b[0] * 0.98, PT + 1.0, b[1] * 0.98], 0.2);
    }
  }
  // monumental steps descending south to the forecourt (97 m wide)
  const nSt = hi ? 16 : 3;
  const stepD = 30 / nSt, stepH = PT / nSt;
  for (let s = 0; s < nSt; s++) {
    const y = PT - (s + 1) * stepH;
    k.color(s % 2 && hi ? STEP : POD).box(0, SKIRT, 64 + s * stepD + stepD / 2, 97, y + stepH - SKIRT, stepD);
  }
  if (hi) {
    // Bronze handrails dividing the 97 m Monumental Steps + Vehicle Concourse folded-beam portal underneath
    for (const hx of [-48, -24, 0, 24, 48]) {
      k.color(BRONZE).strut([hx, PT + 0.9, 64], [hx, 0.9, 94], 0.18);
      for (let s = 0; s <= 5; s++) {
        const f = s / 5;
        k.box(hx, PT * (1 - f), 64 + 30 * f, 0.16, 0.9, 0.16);
      }
    }
  }
  // shell groups
  // Concert Hall (west, larger)
  const cx = -22;
  shell(k, cx, -82, 1, 46, 20, 40);
  shell(k, cx, -60, 1, 57.5, 22, 48);
  shell(k, cx, -36, 1, 65, 23.5, 56);
  shell(k, cx, 44, -1, 43, 19, 40);
  // Joan Sutherland Theatre (east, slightly smaller, set south)
  const jx = 24;
  shell(k, jx, -72, 1, 41, 17.5, 36);
  shell(k, jx, -52, 1, 51, 19.5, 44);
  shell(k, jx, -30, 1, 58, 21, 50);
  shell(k, jx, 44, -1, 39, 17, 38);
  // Bennelong restaurant (south-west)
  shell(k, -44, 46, 1, 25, 9.5, 18);
  shell(k, -44, 60, -1, 21, 8.5, 14);
  if (hi) {
    // hall masses visible between the sails (pink-granite & bronze-clad acoustic side walls)
    k.color(POD_DK).box(cx, PT, -12, 30, 14, 76).box(jx, PT, -8, 26, 12, 68);
    // forecourt edge lamps (glow)
    k.glow(true).color(0xffe2a8);
    for (let i = -4; i <= 4; i++) k.box(i * 11, 0, 97, 0.6, 3.2, 0.6);
    k.glow(false);
  }
}
