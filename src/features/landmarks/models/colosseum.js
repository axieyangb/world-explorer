// feature/famous-landmarks: Colosseum (Flavian Amphitheatre), Rome — 1:1 (outer wall 48 m).
// Elliptical 189 x 156 m, 80 bays. Outer travertine ring: three arcaded storeys (Tuscan / Ionic /
// Corinthian half-columns) + windowed attic; it survives only on the north side, ending in the two
// 19th-c. brick buttresses. Elsewhere the lower second ring is exposed. Ruined cavea terraces step down
// to the 87 x 55 m arena with the open hypogeum and the reconstructed floor at the east end.
// Local: long axis = X, front (-Z) = intact north side.
const TRAV = 0xd6c9ae, TRAV_DK = 0xbfae8f, TRAV_SH = 0xa8977a, BRICK = 0xa86a4c, BRICK_DK = 0x8c563d;
const TUFA = 0xb7a07f, HOLE = 0x5e4632, WOOD = 0xb08a5c, HYPO = 0x6a5644;
const A = 94.5, B = 78, NB = 80;
const Y = [0, 10.5, 22.35, 33.95, 48.0];
const TAU = Math.PI * 2;
const INTACT0 = (197 / 360) * TAU, INTACT1 = (327 / 360) * TAU;

export const lodDist = 1500;
export const fineDist = 320; // [lm-materials] columns, archivolts and the ambulatory only up close
export const glowStrength = 2.2;
export const colliders = [
  { x: 0, z: -40, hw: 70, hd: 30, h: 48 },
  { x: -70, z: 0, hw: 22, hd: 45, h: 30, rot: 0 },
  { x: 70, z: 0, hw: 22, hd: 45, h: 30 },
  { x: 0, z: 52, hw: 62, hd: 18, h: 30 },
];

const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const E = (t, off) => [(A - off) * Math.cos(t), (B - off) * Math.sin(t)];

/** Enter the local frame of bay [t0, t1] on the ellipse offset `off`: x along the chord, -z outward. */
function bayFrame(k, t0, t1, off) {
  const p0 = E(t0, off), p1 = E(t1, off);
  const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const w = Math.hypot(dx, dz);
  let nx = dz / w, nz = -dx / w;
  if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
  k.push().translate(mx, 0, mz).rotateY(Math.atan2(-nx, -nz));
  return w;
}

// faces in the bay frame: F = facing -z (outward) at depth z, G = facing +z (inward)
const F = (k, xa, xb, ya, yb, z) => k.quad([xb, ya, z], [xa, ya, z], [xa, yb, z], [xb, yb, z]);
const G = (k, xa, xb, ya, yb, z) => k.quad([xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z]);

/** Arcaded storey face (one side). face = F or G. */
function arcFace(k, face, w, y0, y1, z, ped, n) {
  const r = Math.min(w * 0.3, 2.2);
  const yb = y0 + ped;
  const spring = y1 - 1.5 - r - 0.5;
  face(k, -w / 2, -r, y0, spring, z);
  face(k, r, w / 2, y0, spring, z);
  if (ped > 0) face(k, -r, r, y0, yb, z);
  face(k, -w / 2, -r, spring, y1, z);
  face(k, r, w / 2, spring, y1, z);
  for (let j = 0; j < n; j++) {
    const a0 = Math.PI * (1 - j / n), a1 = Math.PI * (1 - (j + 1) / n);
    const x0 = Math.cos(a0) * r, x1 = Math.cos(a1) * r;
    const q0 = spring + Math.sin(a0) * r, q1 = spring + Math.sin(a1) * r;
    if (face === F) k.quad([x1, q1, z], [x0, q0, z], [x0, y1, z], [x1, y1, z]);
    else k.quad([x0, q0, z], [x1, q1, z], [x1, y1, z], [x0, y1, z]);
  }
  return { r, yb, spring };
}

/** One arcaded storey of a ring wall in the current bay frame. */
function arcadeBay(k, w, y0, y1, t, ped, opts = {}) {
  const hi = k.hi;
  const n = hi ? 6 : 2;
  k.color(opts.col || TRAV);
  const { r, yb, spring } = arcFace(k, F, w, y0, y1, 0, ped, n);
  if (hi || opts.inner) { k.color(opts.colIn || TRAV_DK); arcFace(k, G, w, y0, y1, t, ped, n); }
  // shadowed vault seen through the arch (warm-lit at night); the outer ring's arches are open onto the
  // ambulatory behind them (opts.open: corridor() builds its vault and floor)
  if (!opts.open || !k.fine) {
    k.glow(true).color(HOLE);
    F(k, -r, r, yb, spring + r, t * 0.45);
    if (hi) G(k, -r, r, yb, spring + r, t * 0.55);
    k.glow(false);
  }
  if (hi) {
    // jambs + soffit
    k.color(TRAV_SH);
    k.quad([-r, yb, t], [-r, yb, 0], [-r, spring, 0], [-r, spring, t]);
    k.quad([r, yb, 0], [r, yb, t], [r, spring, t], [r, spring, 0]);
    for (let j = 0; j < 4; j++) {
      const a0 = Math.PI * (j / 4), a1 = Math.PI * ((j + 1) / 4);
      const p0 = [Math.cos(a0) * r, spring + Math.sin(a0) * r], p1 = [Math.cos(a1) * r, spring + Math.sin(a1) * r];
      k.quad([p0[0], p0[1], 0], [p1[0], p1[1], 0], [p1[0], p1[1], t], [p0[0], p0[1], t]);
    }
  }
  if (opts.orders) {
    // engaged half-column at the bay boundary + entablature
    k.color(TRAV_DK);
    if (k.fine) column(k, -w / 2, y0 + ped, y1 - 1.5, opts.orders);
    else if (hi) k.cyl(-w / 2, y0, -0.15, 0.5, 0.46, y1 - y0 - 1.5, 6);
    else k.box(-w / 2, y0, -0.3, 0.9, y1 - y0 - 1.5, 0.6);
    if (k.fine) {
      // architrave / frieze / projecting cornice
      k.color(TRAV).box(0, y1 - 1.5, -0.5, w + 0.15, 0.5, 1.0);
      k.color(TRAV_DK).box(0, y1 - 1.0, -0.4, w + 0.15, 0.6, 0.8);
      k.color(TRAV).box(0, y1 - 0.4, -0.75, w + 0.15, 0.4, 1.5);
      if (ped > 0) {
        // pedestal course under the order + plinth under each column
        k.color(TRAV_DK).box(0, y0, -0.3, w, ped, 0.6);
        k.color(TRAV).box(0, y0 + ped - 0.25, -0.38, w, 0.25, 0.76);
        k.color(TRAV_DK).box(-w / 2, y0, -0.55, 1.5, ped, 1.1);
      }
      // archivolt (moulded band round the arch), impost blocks and keystone
      k.color(TRAV_SH);
      const ra = r + 0.22, n2 = 8;
      for (let j = 0; j < n2; j++) {
        const a0 = Math.PI * (j / n2), a1 = Math.PI * ((j + 1) / n2);
        k.strut([Math.cos(a0) * ra, spring + Math.sin(a0) * ra, -0.08], [Math.cos(a1) * ra, spring + Math.sin(a1) * ra, -0.08], 0.36);
      }
      k.color(TRAV_DK);
      for (const sx of [-1, 1]) k.box(sx * (r + 0.3), spring - 0.35, -0.1, 0.75, 0.35, 0.2);
      k.color(TRAV).taper(0, spring + ra - 0.35, -0.12, 0.5, 0.3, 0.75, 0.3, 0.75);
    } else {
      k.color(TRAV).box(0, y1 - 1.5, -0.45, w + 0.15, 1.5, 0.9);
      if (hi && ped > 0) k.color(TRAV_DK).box(0, y0, -0.3, w, 0.6, 0.6);
    }
  }
}

/** Engaged column on the bay boundary x: lathed base + shaft + order-specific capital ("tuscan" | "ionic" | "corinthian"). */
function column(k, x, y0, y1, order) {
  const h = y1 - y0, seg = 10, z = -0.05;
  k.push().translate(x, y0, z);
  const prof = [[0.72, 0], [0.72, 0.22], [0.6, 0.3], [0.64, 0.42], [0.54, 0.52], [0.52, 0.7], [0.45, h - 1.6], [0.5, h - 1.5]];
  if (order === "tuscan") prof.push([0.5, h - 0.75], [0.66, h - 0.45], [0.7, h - 0.3], [0.7, h]);
  else if (order === "ionic") prof.push([0.52, h - 0.8], [0.58, h - 0.5], [0.66, h - 0.42], [0.66, h]);
  else prof.push([0.6, h - 0.75], [0.74, h - 0.35], [0.8, h - 0.3], [0.8, h]);
  k.lathe(0, 0, 0, prof, seg, { caps: false });
  if (order === "ionic") {
    // volutes: a scroll either side of the capital
    for (const sx of [-1, 1]) { k.push().translate(sx * 0.6, h - 0.55, -0.62).rotateX(Math.PI / 2); k.cyl(0, 0, 0, 0.22, 0.22, 0.4, 8); k.pop(); }
  } else if (order === "corinthian") {
    // acanthus: two rings of leaves round the bell
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * 0.05 - (i / 5) * Math.PI * 0.9;
      const cx = Math.cos(a) * 0.56, cz = Math.sin(a) * 0.56;
      k.box(cx, h - 1.45, cz, 0.22, 0.6, 0.18).box(cx * 1.08, h - 0.95, cz * 1.08, 0.2, 0.5, 0.16);
    }
  }
  k.box(0, h, 0, 1.6, 0.18, 1.6); // abacus
  k.pop();
}

/** Ambulatory between the outer ring (z = 0..t) and the second ring (z = d) in the bay frame: barrel vault + floor. */
function corridor(k, w, y0, y1, t, d) {
  const zc = (t + d) / 2, rv = (d - t) / 2, ys = y1 - 0.7 - rv, n = 6, x0 = -w / 2 - 0.02, x1 = w / 2 + 0.02;
  k.color(TRAV_SH);
  for (let j = 0; j < n; j++) {
    const a0 = Math.PI * (j / n), a1 = Math.PI * ((j + 1) / n);
    const z0 = zc + Math.cos(a0) * rv, q0 = ys + Math.sin(a0) * rv, z1 = zc + Math.cos(a1) * rv, q1 = ys + Math.sin(a1) * rv;
    k.quad([x1, q0, z0], [x0, q0, z0], [x0, q1, z1], [x1, q1, z1]);
  }
  k.color(HYPO).quad([x0, y0 + 0.03, t], [x0, y0 + 0.03, d + 0.4], [x1, y0 + 0.03, d + 0.4], [x1, y0 + 0.03, t]);
}

function atticBay(k, w, t, i) {
  const hi = k.hi;
  const y0 = Y[3], y1 = Y[4];
  k.color(TRAV).box(0, y0, t / 2, w + 0.05, y1 - y0, t);
  if (!hi) return;
  // Corinthian pilaster (base, capital), windows in alternate bays, three corbels per bay for the velarium masts
  // (with the sockets in the cornice above), stepped cornice
  k.color(TRAV_DK).box(0, y0, -0.25, w + 0.1, 1.6, 0.5);
  k.box(-w / 2, y0 + 1.6, -0.15, 0.9, 10.8, 0.3);
  k.color(TRAV).box(-w / 2, y0 + 1.6, -0.25, 1.2, 0.35, 0.5).box(-w / 2, y0 + 11.3, -0.3, 1.25, 0.8, 0.6);
  if (i % 2 === 0) {
    k.glow(true).color(HOLE); F(k, -0.9, 0.9, y0 + 4.0, y0 + 6.6, -0.03); k.glow(false);
    k.color(TRAV_SH).box(0, y0 + 3.85, -0.12, 2.2, 0.15, 0.24).box(0, y0 + 6.6, -0.12, 2.2, 0.15, 0.24);
  }
  k.color(TRAV_SH);
  for (const cx of [-w * 0.3, 0, w * 0.3]) k.taper(cx, y0 + 9.6, -0.3, 0.5, 0.6, 0.55, 0.75, 0.75, 0, -0.07);
  k.color(TRAV_DK).box(0, y1 - 1.3, -0.35, w + 0.15, 0.7, 0.7);
  k.color(TRAV).box(0, y1 - 0.6, -0.6, w + 0.15, 0.6, 1.2);
  k.glow(true).color(HOLE);
  for (const cx of [-w * 0.3, 0, w * 0.3]) k.box(cx, y1 - 0.02, -0.55, 0.35, 0.03, 0.35);
  k.glow(false);
}

/** Brick buttress closing a broken end of the outer ring; from angle tb sweeping by dt (sign = direction). */
function buttress(k, tb, dt) {
  k.color(BRICK);
  const n = k.hi ? 8 : 3;
  for (let j = 0; j < n; j++) {
    const ta = tb + (dt * j) / n, tc = tb + (dt * (j + 1)) / n;
    const h0 = Y[4] - 2 - (Y[4] - 8) * (j / n), h1 = Y[4] - 2 - (Y[4] - 8) * ((j + 1) / n);
    const [ax, az] = E(ta, -0.6), [bx, bz] = E(tc, -0.6), [cx, cz] = E(ta, 3.4), [dx, dz] = E(tc, 3.4);
    k.quad2([ax, 0, az], [bx, 0, bz], [bx, h1, bz], [ax, h0, az]);
    k.quad2([cx, 0, cz], [dx, 0, dz], [dx, h1, dz], [cx, h0, cz]);
    k.color(BRICK_DK).quad2([ax, h0, az], [bx, h1, bz], [dx, h1, dz], [cx, h0, cz]).color(BRICK);
  }
  // end face
  const [ax, az] = E(tb + dt, -0.6), [cx, cz] = E(tb + dt, 3.4);
  k.quad2([ax, 0, az], [cx, 0, cz], [cx, 6, cz], [ax, 6, az]);
}

function qf(k, a, b, c, d, want) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) k.quad(a, b, c, d); else k.quad(d, c, b, a);
}

export function build(k) {
  const hi = k.hi;
  const T1 = 2.4, T2 = 2.0, OFF2 = 7.0;
  for (let i = 0; i < NB; i++) {
    const t0 = (i / NB) * TAU, t1 = ((i + 1) / NB) * TAU, tm = (t0 + t1) / 2;
    const intact = tm > INTACT0 && tm < INTACT1;
    // ---- outer ring (north side only)
    if (intact) {
      const w = bayFrame(k, t0, t1, 0);
      arcadeBay(k, w, Y[0], Y[1], T1, 0, { orders: "tuscan", open: true });
      arcadeBay(k, w, Y[1], Y[2], T1, 1.6, { orders: "ionic", open: true });
      arcadeBay(k, w, Y[2], Y[3], T1, 1.6, { orders: "corinthian", open: true });
      atticBay(k, w, T1, i);
      if (k.fine) for (let s = 0; s < 3; s++) corridor(k, w, Y[s], Y[s + 1], T1, OFF2 - 0.15);
      k.pop();
    }
    // ---- second ring (exposed where the outer ring fell)
    {
      const w = bayFrame(k, t0, t1, OFF2);
      const exposed = !intact;
      const c = exposed ? TRAV_DK : TUFA;
      if (exposed || hi) {
        arcadeBay(k, w, Y[0], Y[1], T2, 0, { col: c, colIn: TUFA, orders: exposed && hi && "tuscan" });
        arcadeBay(k, w, Y[1], Y[2], T2, 1.2, { col: c, colIn: TUFA, orders: exposed && hi && "ionic" });
      } else {
        k.color(TUFA).box(0, 0, T2 / 2, w, Y[2], T2);
      }
      const third = intact || hash(i) > 0.28;
      if (third) {
        const top = intact ? Y[3] : Y[2] + (Y[3] - Y[2]) * (0.55 + 0.45 * hash(i + 40));
        if (exposed && hi) arcadeBay(k, w, Y[2], top, T2, 1.2, { col: c, colIn: TUFA });
        else k.color(c).box(0, Y[2], T2 / 2, w, top - Y[2], T2);
        if (exposed) k.color(BRICK_DK).box(0, top, T2 / 2, w * 0.98, 0.25, T2 * 0.9);
      } else {
        k.color(BRICK_DK).box(0, Y[2], T2 / 2, w * 0.98, 0.25, T2 * 0.9);
      }
      k.pop();
    }
    // ---- ruined cavea terraces down to the arena podium
    const NT = hi ? 6 : 3;
    for (let j = 0; j < NT; j++) {
      const o0 = 9 + (38 * j) / NT, o1 = 9 + (38 * (j + 1)) / NT;
      const yT = 28 - (24 * j) / NT, yN = j === NT - 1 ? 0 : 28 - (24 * (j + 1)) / NT;
      const hsh = hash(i * 7 + j);
      k.color(hsh < 0.35 ? BRICK : hsh < 0.7 ? TUFA : TRAV_SH);
      const [ax, az] = E(t0, o0), [bx, bz] = E(t1, o0), [cx, cz] = E(t1, o1), [dx, dz] = E(t0, o1);
      qf(k, [ax, yT, az], [bx, yT, bz], [cx, yT, cz], [dx, yT, dz], [0, 1, 0]);
      const mx = (cx + dx) / 2, mz = (cz + dz) / 2;
      qf(k, [dx, yT, dz], [cx, yT, cz], [cx, yN, cz], [dx, yN, dz], [-mx, 0, -mz]);
    }
    // back wall of the cavea against the second ring
    {
      const [ax, az] = E(t0, OFF2 + T2), [bx, bz] = E(t1, OFF2 + T2), [cx, cz] = E(t1, 9), [dx, dz] = E(t0, 9);
      k.color(TUFA);
      qf(k, [ax, 28, az], [bx, 28, bz], [cx, 28, cz], [dx, 28, dz], [0, 1, 0]);
    }
    // radial vault walls poking through the ruined seating
    if (hi && i % 3 === 0) {
      const [ax, az] = E(t0, 9), [bx, bz] = E(t0, 44);
      k.color(BRICK_DK).strut([ax, 29, az], [bx, 5, bz], 1.6);
    }
  }
  // buttresses at both broken ends of the outer ring
  buttress(k, INTACT0 - (0.4 / NB) * TAU * 0, -(2.6 / NB) * TAU);
  buttress(k, INTACT1, (2.6 / NB) * TAU);
  // ---- arena: hypogeum + reconstructed east floor
  const a = A - 47, b = B - 47;
  const ell = [];
  for (let i = 0; i < 40; i++) { const t = (i / 40) * TAU; ell.push([a * Math.cos(t), b * Math.sin(t)]); }
  k.color(HYPO).extrude(ell, 0, 0.15);
  if (hi) {
    k.color(BRICK);
    for (let z = -b + 3; z < b - 2; z += 3.2) {
      const xe = a * Math.sqrt(Math.max(0, 1 - (z / b) ** 2)) - 1.5;
      const xw = Math.min(xe, 18);
      if (xe > 2) k.box((-xe + xw) / 2, 0, z, xe + xw, 3.6, 0.7);
    }
    k.color(BRICK_DK).box(0, 0, 0, a * 1.7, 3.6, 1.2);
  }
  const fl = [];
  for (let i = 0; i <= 16; i++) {
    const t = -Math.acos(18 / a) + (i / 16) * 2 * Math.acos(18 / a);
    fl.push([a * Math.cos(t), b * Math.sin(t)]);
  }
  k.color(WOOD).extrude(fl, 3.4, 0.4);
}
