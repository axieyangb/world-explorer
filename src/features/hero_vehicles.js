// [hero-vehicles] Detailed models for the car the player drives. Traffic draws the same bodies through the
// low-detail path (options.lod: coarse loft, no cabin or small parts, cheap wheels).
// A body is lofted from cross-sections along its length: plan-view superellipse, side-view curves for
// sill / beltline / roof, wheel arches cut into the sill. Each triangle is then assigned a material by
// where it sits on the body (glass above the beltline, lamps on the front and rear faces, door gaps,
// underbody), so lamps and windows follow the curved surface exactly.
// Local frame matches entities.js: +Z forward, +X right, +Y up, tyre contact at y = 0.
import * as THREE from '../../vendor/three.module.js';

// Monotone cubic through [z, value] keys (no overshoot between keys).
export function curve(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Uniform Catmull-Rom through 2D control points, `k` samples per span (or an array, one count per span);
// mirrored phantom ends keep the tangent horizontal at the centreline so the two halves join smoothly.
export function crPath(pts, k) {
  const ext = [[-pts[1][0], pts[1][1]], ...pts, [-pts[pts.length - 2][0], pts[pts.length - 2][1]]];
  const out = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    const ks = Array.isArray(k) ? k[i - 1] : k;
    for (let s = 0; s < ks; s++) {
      const t = s / ks, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, e) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3);
      out.push([Math.max(0, f(p0[0], p1[0], p2[0], p3[0])), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const SPAN = 6;

// `lod` builds the coarse traffic version: 2 samples per profile span, sparse stations, no panel-gap pairs.
export function makeBody(spec, lod = false) {
  // Low detail: one sample on the flat underside and the roof centre, two on every other span.
  const L = spec.length, hl = L / 2, span = lod ? [1, 2, 2, 2, 2, 2, 2, 2, 2, 1] : SPAN;
  const sill = curve(spec.sill), belt = curve(spec.belt), roofK = curve(spec.roof);
  const hip = spec.hip ? curve(spec.hip) : () => 1;
  const roofOf = (z) => Math.max(belt(z), roofK(z));
  const halfW = (z) => {
    const u = Math.min(1, Math.abs(z) / hl);
    const p = z >= 0 ? spec.pFront : spec.pRear;
    return (spec.width / 2) * Math.pow(Math.max(0, 1 - Math.pow(u, p)), 1 / p) * hip(z);
  };
  const archY = (z) => {
    let y = -1;
    for (const a of spec.arches) {
      const dz = z - a.z;
      if (Math.abs(dz) < a.r) y = Math.max(y, a.cy + Math.sqrt(a.r * a.r - dz * dz));
    }
    return y;
  };
  const bottom = (z) => Math.max(sill(z), archY(z));
  const halfProfile = (z) => {
    const wb = halfW(z), yb = bottom(z), yt = belt(z), yr = roofOf(z);
    const gh = yr - yt, g = spec.glass;
    const ys = Math.min(yt - 0.05, Math.max(yb + 0.05, yb + (yt - yb) * 0.45));
    return crPath([
      [0, yb],
      [wb * 0.8, yb],
      [wb * 0.97, Math.min(ys - 0.01, yb + 0.04)],
      [wb, ys],
      [wb * 0.985, Math.max(ys + 0.01, yt - 0.06)],
      [wb * 0.93, yt],
      [wb * g.base, yt + 0.004 + gh * 0.04],
      [wb * (g.base + (g.roof - g.base) * 0.75), yt + gh * 0.82],
      [wb * g.roof, yr],
      [wb * g.roof * 0.5, yr + spec.crown],
      [0, yr + spec.crown * 1.15],
    ], span);
  };

  // Stations: even spacing, dense at the rounded ends, and pairs hugging arch edges and panel gaps.
  const zs = new Set();
  if (lod) {
    for (let z = -hl; z <= hl + 1e-6; z += L / 15) zs.add(+z.toFixed(4));
    for (const s of [0, 0.02, 0.06, 0.12, 0.2, 0.32]) { zs.add(+(hl - s).toFixed(4)); zs.add(+(-hl + s).toFixed(4)); }
    for (const a of spec.arches) {
      for (let t = -1; t <= 1.0001; t += 0.25) zs.add(+(a.z + a.r * Math.sin(t * Math.PI / 2)).toFixed(4));
      for (const e of [-1, 1]) zs.add(+(a.z + e * (a.r + 0.006)).toFixed(4));
    }
  } else {
    for (let z = -hl; z <= hl + 1e-6; z += 0.035) zs.add(+z.toFixed(4));
    for (let s = 0; s <= 0.6; s += s < 0.12 ? 0.004 : 0.012) { zs.add(+(hl - s).toFixed(4)); zs.add(+(-hl + s).toFixed(4)); }
    for (const a of spec.arches) {
      for (let t = -1; t <= 1.0001; t += 0.05) zs.add(+(a.z + a.r * Math.sin(t * Math.PI / 2)).toFixed(4));
      for (const e of [-1, 1]) for (const o of [-0.004, 0.004]) zs.add(+(a.z + e * a.r + o).toFixed(4));
    }
    for (const gz of spec.gaps || []) for (const o of [-0.009, -0.004, 0.004, 0.009]) zs.add(+(gz + o).toFixed(4));
  }
  // Drop stations closer than 5 mm (lod sets overlap) so no sliver quads are left.
  const stations = [...zs].filter((z) => z >= -hl && z <= hl).sort((a, b) => a - b).filter((z, i, a) => !lod || i === 0 || z - a[i - 1] > 0.005);

  const geometry = () => {
    const half = halfProfile(0).length; // points per half, centre bottom -> centre top
    const ring = 2 * (half - 1);
    const pos = new Float32Array(stations.length * ring * 3);
    stations.forEach((z, si) => {
      const hp = halfProfile(z);
      for (let j = 0; j < ring; j++) {
        const [x, y] = j < half ? hp[j] : hp[ring - j];
        const o = (si * ring + j) * 3;
        pos[o] = j < half ? x : -x; pos[o + 1] = y; pos[o + 2] = z;
      }
    });
    const index = [];
    for (let si = 0; si < stations.length - 1; si++) {
      for (let j = 0; j < ring; j++) {
        const a = si * ring + j, b = si * ring + ((j + 1) % ring), c = a + ring, d = b + ring;
        index.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    // Normals on the collapsed nose/tail lines average to nothing; point them straight out.
    const nrm = geo.attributes.normal;
    for (const [si, s] of [[0, -1], [stations.length - 1, 1]]) for (let j = 0; j < ring; j++) nrm.setXYZ(si * ring + j, 0, 0, s);
    return geo;
  };

  // Outer half-width of the body at height y on station z (0 when y is outside the side wall).
  const sideIdx = lod ? 9 : 5 * SPAN; // profile index of the shoulder point [0.93 wb, belt]
  const widthAt = (z, y) => {
    const hp = halfProfile(z);
    let best = 0;
    for (let i = 0; i < sideIdx; i++) {
      const [x0, y0] = hp[i], [x1, y1] = hp[i + 1];
      if ((y - y0) * (y - y1) <= 0 && y0 !== y1) best = Math.max(best, x0 + (x1 - x0) * (y - y0) / (y1 - y0));
    }
    return best;
  };
  // z of the body surface at (x, y) seen from the nose (end = 1) or tail (end = -1).
  // `from` (distance from the centre, default the very end) lets a patch land on an inner face such as
  // a sidepod front.
  const surfaceZ = (x, y, end, from = hl) => {
    let lo = end * from, hi = lo;
    for (let d = 0.01; d < 0.9; d += 0.01) { hi = end * (from - d); if (widthAt(hi, y) >= Math.abs(x)) break; lo = hi; }
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      if (widthAt(mid, y) >= Math.abs(x)) hi = mid; else lo = mid;
    }
    return hi;
  };
  return { geometry, sill, belt, roofOf, halfW, bottom, halfProfile, widthAt, surfaceZ, lod };
}

// Split the lofted body into one geometry per material. Classification is per grid quad (centre point,
// summed face normal) so material borders run along grid lines instead of zig-zagging across diagonals.
export function splitByMaterial(body, classify) {
  const geo = body.geometry();
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, I = geo.index.array;
  const buckets = new Map();
  const c = new THREE.Vector3(), n = new THREE.Vector3(), fn = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const tris = [];
  for (let q = 0; q < I.length; q += 6) {
    n.set(0, 0, 0); c.set(0, 0, 0); tris.length = 0;
    for (let t = q; t < q + 6; t += 3) {
      va.fromArray(P, I[t] * 3); vb.fromArray(P, I[t + 1] * 3); vc.fromArray(P, I[t + 2] * 3);
      e1.subVectors(vb, va); e2.subVectors(vc, va); fn.crossVectors(e1, e2);
      if (fn.lengthSq() < 1e-12) continue; // degenerate triangles at the collapsed nose/tail lines
      n.add(fn); c.add(va).add(vb).add(vc); tris.push(t);
    }
    if (!tris.length) continue;
    n.normalize(); c.multiplyScalar(1 / (3 * tris.length));
    const key = classify(c, n, body);
    let bk = buckets.get(key);
    if (!bk) { bk = { p: [], n: [] }; buckets.set(key, bk); }
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const o = I[t + k] * 3;
      bk.p.push(P[o], P[o + 1], P[o + 2]); bk.n.push(N[o], N[o + 1], N[o + 2]);
    }
  }
  const out = new Map();
  for (const [key, bk] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bk.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.n, 3));
    out.set(key, g);
  }
  geo.dispose();
  return out;
}

// A lamp lens: superellipse outline in the (x, y) plane wrapped onto the nose or tail surface, standing
// `lift` metres proud of the paint. `slant` tilts the outline (y offset per metre of x).
export function lampPatch(body, end, cx, cy, ax, ay, { p = 4, slant = 0, lift = 0.006, from } = {}) {
  // Low detail: a small fan, lifted further so it clears the coarser (flatter) facets.
  const RAD = body.lod ? 2 : 6, ANG = body.lod ? 14 : 40, pos = [], idx = [];
  if (body.lod) lift = Math.max(lift, 0.014);
  pos.push(cx, cy, 0);
  for (let r = 1; r <= RAD; r++) {
    const u = r / RAD;
    for (let a = 0; a < ANG; a++) {
      const t = (a / ANG) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      const k = Math.pow(Math.pow(Math.abs(ct), p) + Math.pow(Math.abs(st), p), -1 / p);
      const x = cx + ax * u * k * ct;
      pos.push(x, cy + ay * u * k * st + slant * (x - cx), 0);
    }
  }
  for (let i = 0; i < pos.length; i += 3) pos[i + 2] = body.surfaceZ(pos[i], pos[i + 1], end, from) + end * lift;
  for (let a = 0; a < ANG; a++) idx.push(0, 1 + a, 1 + ((a + 1) % ANG));
  for (let r = 1; r < RAD; r++) {
    for (let a = 0; a < ANG; a++) {
      const i0 = 1 + (r - 1) * ANG + a, i1 = 1 + (r - 1) * ANG + ((a + 1) % ANG);
      idx.push(i0, i0 + ANG, i1, i1, i0 + ANG, i1 + ANG);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(end * (cx >= 0 ? 1 : -1) > 0 ? idx : idx.map((v, i) => idx[i - (i % 3) + (2 - (i % 3))]));
  g.computeVertexNormals();
  // Winding depends on which end and side; make sure normals face out of the body.
  const nz = g.attributes.normal.getZ(0);
  if (nz * end < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

// Lamp geometries (mirrored pairs) from a car's lamp list: [end, cx, cy, ax, ay, matKey, opts]
export function lampGeometries(spec, body) {
  const out = [];
  for (const [end, cx, cy, ax, ay, key, opts] of spec.lamps) {
    for (const s of cx === 0 ? [1] : [-1, 1]) {
      const o = opts ? { ...opts, slant: (opts.slant || 0) * s } : undefined;
      out.push([key, lampPatch(body, end, s * cx, cy, ax, ay, o)]);
    }
  }
  return out;
}

// Superellipse test in the (|x|, y) plane: a lamp/grille outline that follows the curved surface.
// Height of point c as a fraction (0..1) of the lower side wall, measured in the loft's own rows (from
// the sill corner up to the side's widest point). Thresholds on it give borders that follow grid lines.
export function lowerT(b, c) {
  const yb = b.bottom(c.z), yt = b.belt(c.z);
  const ys = Math.min(yt - 0.05, Math.max(yb + 0.05, yb + (yt - yb) * 0.45));
  return (c.y - yb - 0.04) / Math.max(0.01, ys - yb - 0.04);
}

export const blob = (x, y, cx, cy, ax, ay, p = 4) => Math.pow(Math.abs(x - cx) / ax, p) + Math.pow(Math.abs(y - cy) / ay, p) < 1;

// userData tags read by the traffic flattener (traffic_models.js): paintWeight marks the recolourable body
// paint, emitCode the lamps (1 head, 2 tail, 3 always-lit).
export function materials(spec) {
  const envd = (m) => { m.userData.envProbe = true; return m; };
  const M = {
    paint: envd(new THREE.MeshPhysicalMaterial({ color: spec.paint, metalness: spec.paintMetal ?? 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 })),
    paint2: envd(new THREE.MeshPhysicalMaterial({ color: spec.paint2 ?? 0xf4f5f6, metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 })),
    glass: envd(new THREE.MeshPhysicalMaterial({ color: 0x0a0f14, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.84, clearcoat: 1, clearcoatRoughness: 0.02 })),
    trim: envd(new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.3, roughness: 0.55 })),
    gloss: envd(new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0.2, roughness: 0.18, clearcoat: 1 })),
    under: new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0.1, roughness: 0.9 }),
    chrome: envd(new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.12 })),
    head: envd(new THREE.MeshPhysicalMaterial({ color: 0xb8c2cc, metalness: 0.95, roughness: 0.1, emissive: 0xfff1d6, emissiveIntensity: 0.06, clearcoat: 1 })),
    drl: new THREE.MeshBasicMaterial({ color: 0xf2fbff }),
    tail: envd(new THREE.MeshPhysicalMaterial({ color: 0x5a0006, metalness: 0.1, roughness: 0.12, emissive: 0xff1020, emissiveIntensity: 0.55, clearcoat: 1 })),
    plate: new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.5 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.85, side: THREE.BackSide }),
    seat: new THREE.MeshStandardMaterial({ color: spec.seat ?? 0x222326, roughness: 0.8 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.92, metalness: 0 }),
    rim: envd(new THREE.MeshStandardMaterial({ color: spec.rimColor ?? 0xc9ced6, metalness: 0.95, roughness: 0.22 })),
    disc: new THREE.MeshStandardMaterial({ color: 0x6c6f74, metalness: 0.9, roughness: 0.45 }),
    caliper: new THREE.MeshStandardMaterial({ color: spec.caliper ?? 0x2b2d31, roughness: 0.4, metalness: 0.3 }),
  };
  M.paint.userData.paintWeight = 1;
  M.head.userData.emitCode = 1;
  M.tail.userData.emitCode = 2;
  M.drl.userData.emitCode = 3;
  return M;
}

// Low-detail wheel for traffic: short lathed tyre and a flat rim disc with a dark centre; no spokes or caliper.
export function buildWheelLod(spec, M, side) {
  const { R, tw } = spec.wheel;
  const rr = R * spec.wheel.rimFrac, h = tw / 2;
  const pivot = new THREE.Group(), wheelMesh = new THREE.Group(), face = new THREE.Group();
  if (side < 0) face.rotation.y = Math.PI;
  pivot.add(wheelMesh); wheelMesh.add(face);
  const prof = [[rr * 0.96, -h * 0.85], [R - 0.05, -h], [R, -h * 0.6], [R, h * 0.6], [R - 0.05, h], [rr * 0.96, h * 0.85]];
  const tyre = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  tyre.rotateZ(Math.PI / 2);
  face.add(new THREE.Mesh(tyre, M.tyre));
  const disc = new THREE.CircleGeometry(rr, 14);
  disc.rotateY(Math.PI / 2);
  addMesh(face, disc, spec.wheel.style === 'steel' ? M.trim : M.rim, h * 0.72);
  const hub = new THREE.CircleGeometry(rr * 0.3, 8);
  hub.rotateY(Math.PI / 2);
  addMesh(face, hub, M.disc, h * 0.72 + 0.004);
  return { pivot, wheelMesh };
}

// Tyre (lathed sidewalls + tread), spoked rim, brake disc; the caliper stays on the steering pivot.
export function buildWheel(spec, M, side) {
  const { R, tw } = spec.wheel;
  const rr = R * spec.wheel.rimFrac;
  const pivot = new THREE.Group();
  const wheelMesh = new THREE.Group();
  pivot.add(wheelMesh);
  const face = new THREE.Group(); // outward face on +X; mirrored for left wheels
  if (side < 0) face.rotation.y = Math.PI;
  wheelMesh.add(face);

  const h = tw / 2;
  const prof = [[rr * 0.98, -h * 0.9], [R - 0.06, -h], [R - 0.015, -h * 0.94], [R, -h * 0.7], [R, h * 0.7], [R - 0.015, h * 0.94], [R - 0.06, h], [rr * 0.98, h * 0.9]];
  const tyreGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 44);
  tyreGeo.rotateZ(Math.PI / 2);
  face.add(new THREE.Mesh(tyreGeo, M.tyre));

  const barrel = new THREE.CylinderGeometry(rr, rr, tw * 0.86, 36, 1, true);
  barrel.rotateZ(Math.PI / 2);
  face.add(new THREE.Mesh(barrel, new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide })));
  const lip = new THREE.TorusGeometry(rr, 0.012, 6, 36);
  lip.rotateY(Math.PI / 2);
  const lipM = new THREE.Mesh(lip, M.rim);
  lipM.position.x = h * 0.82;
  face.add(lipM);

  const disc = new THREE.CylinderGeometry(rr * 0.8, rr * 0.8, 0.028, 28);
  disc.rotateZ(Math.PI / 2);
  const discM = new THREE.Mesh(disc, M.disc);
  discM.position.x = h * 0.05;
  face.add(discM);

  const faceX = h * 0.62;
  const hub = new THREE.CylinderGeometry(rr * 0.2, rr * 0.24, 0.06, 18);
  hub.rotateZ(Math.PI / 2);
  const hubM = new THREE.Mesh(hub, M.rim);
  hubM.position.x = faceX;
  face.add(hubM);
  const n = spec.wheel.spokes, style = spec.wheel.style;
  const spokeLen = rr * 0.8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const pair = style === 'split' ? [-0.11, 0.11] : [0];
    for (const da of pair) {
      const w = style === 'aero' ? rr * 0.42 : style === 'steel' ? rr * 0.3 : 0.034;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, spokeLen, w), M.rim);
      sp.geometry.translate(0, spokeLen / 2 + rr * 0.18, 0);
      sp.rotation.x = a + da;
      sp.position.x = faceX - 0.01;
      sp.rotation.z = -0.08; // slight dish
      face.add(sp);
    }
  }
  if (style === 'aero' || style === 'steel') {
    const capGeo = new THREE.CylinderGeometry(rr * 0.92, rr * 0.92, 0.012, 36);
    capGeo.rotateZ(Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, style === 'aero' ? M.rim : new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.6, roughness: 0.5 }));
    cap.position.x = faceX - 0.035;
    face.add(cap);
  }

  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, rr * 0.5, rr * 0.34), M.caliper);
  cal.position.set(side * (h * 0.05 + 0.03), rr * 0.48, -rr * 0.36);
  cal.rotation.x = -0.6;
  pivot.add(cal);
  return { pivot, wheelMesh };
}

export function addMesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Side mirrors, door handles, a simple cabin (dashboard, seats, wheel) behind the tinted glass.
export function addCommonDetails(spec, body, M, chassis) {
  const ws = spec.windshieldBase;
  const yt = body.belt(ws - 0.12);
  const wx = body.halfW(ws - 0.12) * spec.glass.base;
  const lod = body.lod;
  for (const s of [-1, 1]) {
    if (spec.mirrors === false) break;
    const shell = lod ? new THREE.SphereGeometry(0.1, 8, 5) : new THREE.SphereGeometry(0.1, 16, 10);
    shell.scale(1.0, 0.62, 0.85);
    const mir = addMesh(chassis, shell, M.paint, s * (wx + 0.13), yt + 0.1, ws - 0.16);
    mir.userData.paint = true;
    addMesh(chassis, new THREE.BoxGeometry(0.11, 0.03, 0.06), M.trim, s * (wx + 0.05), yt + 0.06, ws - 0.14);
    if (lod) continue;
    const glassFace = new THREE.CircleGeometry(0.075, 14);
    glassFace.scale(1, 0.55, 1);
    glassFace.rotateY(Math.PI);
    addMesh(chassis, glassFace, M.chrome, s * (wx + 0.13), yt + 0.1, ws - 0.245);
    for (const hz of spec.handles || []) {
      const hy = body.belt(hz) - 0.1;
      const hx = body.halfW(hz) * 0.995;
      addMesh(chassis, new THREE.BoxGeometry(0.02, 0.028, 0.16), spec.flushHandles ? M.chrome : M.trim, s * hx, hy, hz);
    }
  }
  if (lod) return; // traffic glass is opaque: no cabin
  // Cabin: dark backface shell (reads as interior walls), dash, seats, steering wheel, all kept under the roof
  const c0 = spec.cabin[0], c1 = spec.cabin[1];
  let roofMin = Infinity;
  for (let z = c0; z <= c1; z += 0.05) roofMin = Math.min(roofMin, body.roofOf(z));
  const floorY = body.belt(0) - 0.32, top = roofMin - 0.05;
  const cw = body.halfW(0) * spec.glass.roof * 1.9;
  addMesh(chassis, new THREE.BoxGeometry(cw, top - floorY, c1 - c0), M.interior, 0, (floorY + top) / 2, (c0 + c1) / 2);
  addMesh(chassis, new THREE.BoxGeometry(cw * 0.98, 0.16, 0.36), M.seat, 0, body.belt(c1) - 0.07, c1 - 0.22);
  const backH = Math.min(0.62, top - floorY - 0.12);
  const seatRows = spec.rearSeats ? [c1 - 0.95, c1 - 1.75] : [c1 - 0.95];
  seatRows.forEach((sz, row) => {
    const xs = row === 0 ? [-0.38, 0.38] : [0];
    for (const sx of xs) {
      const w = row === 0 ? 0.5 : cw * 0.9;
      addMesh(chassis, new THREE.BoxGeometry(w, 0.14, 0.5), M.seat, sx, floorY + 0.1, sz + 0.12);
      const back = addMesh(chassis, new THREE.BoxGeometry(w, backH, 0.12), M.seat, sx, floorY + 0.06 + backH / 2, sz - 0.14);
      back.rotation.x = -0.2;
      if (row === 0) addMesh(chassis, new THREE.BoxGeometry(0.26, 0.16, 0.1), M.seat, sx, floorY + 0.1 + backH, sz - 0.2);
    }
  });
  const sw = new THREE.TorusGeometry(0.16, 0.02, 8, 24);
  const swm = addMesh(chassis, sw, M.trim, -0.38, body.belt(c1) - 0.0, c1 - 0.5);
  swm.rotation.x = -0.45;
}

const fnOf = (v) => (typeof v === 'function' ? v : () => v);

// A band hugging one body side (side = -1 / 1) between heights y0..y1 (numbers or z -> y functions) over
// [z0, z1], `lift` metres proud of the paint. u runs along z in metres, v 0..1 bottom to top. Used for
// liveries (checker band) and glowing light lines that follow the sculpted flank.
export function sideStrip(body, z0, z1, y0, y1, side, { lift = 0.003, rows = 3, step = 0.025 } = {}) {
  const f0 = fnOf(y0), f1 = fnOf(y1);
  const pos = [], uv = [], idx = [];
  const nz = Math.max(2, Math.ceil(Math.abs(z1 - z0) / step) + 1);
  for (let i = 0; i < nz; i++) {
    const z = z0 + ((z1 - z0) * i) / (nz - 1);
    const a = f0(z), b = f1(z);
    for (let j = 0; j <= rows; j++) {
      const y = a + ((b - a) * j) / rows;
      pos.push(side * (body.widthAt(z, y) + lift), y, z);
      uv.push(z - z0, j / rows);
    }
  }
  const R = rows + 1;
  for (let i = 0; i < nz - 1; i++) for (let j = 0; j < rows; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Winding depends on side and on the direction of z0 -> z1; make the normals face out of the body.
  if (g.attributes.normal.getX(R + 1) * side < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// Wing element: cambered aerofoil section extruded along X (span centred on x = 0). Leading edge at
// z = 0, trailing edge at z = -chord; positive rotation.x lifts the trailing edge.
export function airfoil(chord, thick, span, camber = 0) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(chord * 0.04, thick * 0.9, chord * 0.35, thick + camber, chord, camber);
  s.bezierCurveTo(chord * 0.5, camber * 0.5 - thick * 0.15, chord * 0.12, -thick * 0.45, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -span / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// Flat plate from a (z, y) outline, `thick` across X and centred on x = 0 (endplates, fins, pylons).
export function plate(pts, thick, bevel = 0) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

// Horizontal slab from an (x, z) outline, top face at y = 0 and `thick` downwards (floors, splitters).
export function slab(pts, thick) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(Math.PI / 2);
  return g;
}

// Round tube from a to b (suspension arms, pushrods, stays).
const _UP = new THREE.Vector3(0, 1, 0), _A = new THREE.Vector3(), _B = new THREE.Vector3();
export function rod(parent, a, b, r, mat, seg = 8) {
  _A.set(a[0], a[1], a[2]); _B.set(b[0], b[1], b[2]);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, _A.distanceTo(_B), seg), mat);
  m.position.copy(_A).add(_B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_UP, _B.sub(_A).normalize());
  parent.add(m);
  return m;
}

// Small CanvasTexture; draw(ctx, w, h) paints it.
export function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------------------------------
// Car definitions. Lengths in metres; z keys run tail (-L/2) to nose (+L/2).
// ---------------------------------------------------------------------------------------------------
const CARS = {
  supercar: {
    length: 4.6, width: 2.05, pFront: 3.2, pRear: 4.2, crown: 0.025,
    paint: 0xc10a1e, paintMetal: 0.55, caliper: 0xffc21a, rimColor: 0xb9bec6,
    glass: { base: 0.84, roof: 0.56 },
    sill: [[-2.3, 0.34], [-2.1, 0.2], [1.95, 0.18], [2.3, 0.26]],
    belt: [[-2.3, 0.7], [-2.22, 0.95], [-1.6, 0.96], [-0.5, 0.92], [0.7, 0.84], [1.7, 0.73], [2.15, 0.6], [2.3, 0.42]],
    roof: [[-1.95, 0.0], [-1.7, 0.98], [-1.0, 1.1], [-0.35, 1.18], [0.15, 1.19], [0.8, 0.86], [1.0, 0.0]],
    hip: [[-2.3, 0.97], [-1.35, 1.0], [-0.4, 0.93], [0.5, 0.94], [1.45, 0.99], [2.3, 0.97]],
    arches: [{ z: 1.42, cy: 0.35, r: 0.42 }, { z: -1.34, cy: 0.35, r: 0.43 }],
    wheel: { R: 0.35, tw: 0.3, rimFrac: 0.72, spokes: 5, style: 'split' },
    track: 0.86, wheelZ: [1.42, -1.34],
    gaps: [0.82, -0.42],
    handles: [-0.3],
    windshieldBase: 0.8,
    lamps: [[1, 0.66, 0.62, 0.25, 0.045, 'head', { slant: 0.18 }], [1, 0.66, 0.6, 0.2, 0.01, 'drl', { slant: 0.18, lift: 0.009, p: 2 }], [-1, 0.68, 0.8, 0.28, 0.03, 'tail', { slant: -0.06 }], [1, 0, 0.34, 0.56, 0.1, 'trim', { p: 6, lift: 0.008 }], [-1, 0, 0.36, 0.62, 0.11, 'trim', { p: 8, lift: 0.008 }]],
    cabin: [-0.65, 0.75],
    seat: 0x2a1a14,
    classify(c, n, b) {
      const ax = Math.abs(c.x), front = c.z > 1.95, rear = c.z < -2.05;
      if (c.y < b.bottom(c.z) + 0.015) return 'under';
      if (c.y > b.belt(c.z) + 0.012 && c.z < 0.86 && c.z > -1.9) {
        if (c.z > -0.7 && c.z < 0.4 && c.y > b.roofOf(c.z) - 0.012) return 'paint';
        return c.z < -0.7 ? (n.y > 0.5 ? 'louvre' : 'glass') : 'glass';
      }
      if (c.z < -0.75 && c.z > -1.85 && n.y > 0.75 && ax < 0.42) return Math.floor(c.z / 0.07) % 2 ? 'gloss' : 'trim';
      if (ax > b.halfW(c.z) * 0.9 && c.y < b.bottom(c.z) + 0.07) return 'trim';
      for (const g of [0.82, -0.42]) if (Math.abs(c.z - g) < 0.006 && Math.abs(n.x) > 0.4 && c.y < b.belt(c.z) - 0.01) return 'under';
      return 'paint';
    },
    extras(chassis, M, b, exhausts) {
      // Rear wing on swan-neck struts
      const wing = new THREE.Shape();
      wing.moveTo(-0.17, 0); wing.quadraticCurveTo(0, 0.05, 0.19, 0.012); wing.lineTo(0.19, 0); wing.quadraticCurveTo(0, 0.02, -0.17, -0.012);
      const wg = new THREE.ExtrudeGeometry(wing, { depth: 1.7, bevelEnabled: false });
      wg.translate(0, 0, -0.85); wg.rotateY(Math.PI / 2);
      const w = addMesh(chassis, wg, M.gloss, 0, b.belt(-2.0) + 0.24, -2.02);
      w.rotation.x = 0;
      for (const s of [-1, 1]) {
        addMesh(chassis, new THREE.BoxGeometry(0.03, 0.26, 0.12), M.gloss, s * 0.5, b.belt(-2.0) + 0.12, -2.0);
        addMesh(chassis, new THREE.BoxGeometry(0.02, 0.12, 0.42), M.gloss, s * 0.86, b.belt(-2.0) + 0.24, -2.02);
      }
      // Quad exhausts in the diffuser
      for (const x of [-0.42, -0.28, 0.28, 0.42]) {
        const t = new THREE.CylinderGeometry(0.045, 0.05, 0.14, 16, 1, true);
        t.rotateX(Math.PI / 2);
        addMesh(chassis, t, M.chrome, x, 0.33, -2.24);
        exhausts.push([x, 0.33, -2.3]);
      }
      // Diffuser fins
      for (const x of [-0.6, -0.15, 0.15, 0.6]) addMesh(chassis, new THREE.BoxGeometry(0.02, 0.12, 0.3), M.trim, x, 0.24, -2.12);
      // Front splitter
      addMesh(chassis, new THREE.BoxGeometry(1.7, 0.025, 0.18), M.gloss, 0, 0.18, 2.12);
    },
  },

  tesla: {
    length: 4.97, width: 1.96, pFront: 3.0, pRear: 3.6, crown: 0.03,
    paint: 0xeef0f3, paintMetal: 0.25, rimColor: 0x9aa0a8,
    glass: { base: 0.86, roof: 0.66 },
    sill: [[-2.485, 0.44], [-2.32, 0.27], [2.28, 0.25], [2.485, 0.34]],
    belt: [[-2.485, 0.8], [-2.4, 0.98], [-2.05, 1.0], [-0.6, 0.98], [0.9, 0.93], [1.9, 0.82], [2.3, 0.7], [2.485, 0.52]],
    roof: [[-2.485, 0.0], [-2.43, 0.99], [-2.15, 1.1], [-1.4, 1.3], [-0.5, 1.41], [0.2, 1.44], [0.95, 1.05], [1.15, 0.0]],
    arches: [{ z: 1.48, cy: 0.36, r: 0.43 }, { z: -1.48, cy: 0.36, r: 0.43 }],
    wheel: { R: 0.36, tw: 0.27, rimFrac: 0.7, spokes: 5, style: 'aero' },
    track: 0.84, wheelZ: [1.48, -1.48],
    gaps: [0.95, -0.12, -1.12],
    handles: [0.2, -0.75], flushHandles: true,
    windshieldBase: 0.98,
    lamps: [[1, 0.66, 0.75, 0.22, 0.04, 'head', { slant: 0.12 }], [1, 0.64, 0.735, 0.19, 0.008, 'drl', { slant: 0.12, lift: 0.009, p: 2 }], [-1, 0.62, 0.9, 0.3, 0.035, 'tail', { slant: -0.08 }], [-1, 0, 0.6, 0.2, 0.06, 'plate', { p: 8 }], [1, 0, 0.37, 0.5, 0.06, 'trim', { p: 6, lift: 0.008 }], [-1, 0, 0.37, 0.58, 0.06, 'trim', { p: 8, lift: 0.008 }]],
    cabin: [-1.75, 0.9], rearSeats: true,
    seat: 0xd8d3c8,
    classify(c, n, b) {
      const ax = Math.abs(c.x), front = c.z > 2.15, rear = c.z < -2.2;
      if (c.y < b.bottom(c.z) + 0.015) return 'under';
      if (c.y > b.belt(c.z) + 0.012 && c.z < 1.12 && c.z > -2.3) {
        if (Math.abs(c.z + 0.12) < 0.03 && Math.abs(n.x) > 0.3) return 'gloss'; // B-pillar
        return 'glass'; // full panoramic roof
      }
      for (const g of [0.95, -0.12, -1.12]) if (Math.abs(c.z - g) < 0.006 && Math.abs(n.x) > 0.4 && c.y < b.belt(c.z) - 0.01) return 'under';
      return 'paint';
    },
    extras(chassis, M, b, exhausts) {
      for (const x of [-0.5, 0.5]) exhausts.push([x, 0.4, -2.45]);
    },
  },

  police: {
    length: 4.7, width: 1.96, pFront: 4.5, pRear: 5.0, crown: 0.03,
    paint: 0x0c0d10, paint2: 0xf3f4f6, paintMetal: 0.3, rimColor: 0x8d9299,
    glass: { base: 0.88, roof: 0.72 },
    sill: [[-2.35, 0.46], [-2.2, 0.31], [2.2, 0.29], [2.35, 0.42]],
    belt: [[-2.35, 0.86], [-2.27, 1.02], [-1.3, 1.04], [0.0, 1.0], [1.2, 0.98], [2.0, 0.9], [2.3, 0.78], [2.35, 0.64]],
    roof: [[-1.45, 0.0], [-1.25, 1.06], [-0.85, 1.43], [0.1, 1.5], [0.55, 1.48], [1.25, 1.02], [1.45, 0.0]],
    arches: [{ z: 1.45, cy: 0.36, r: 0.44 }, { z: -1.4, cy: 0.36, r: 0.44 }],
    wheel: { R: 0.36, tw: 0.26, rimFrac: 0.66, spokes: 8, style: 'steel' },
    track: 0.84, wheelZ: [1.45, -1.4],
    gaps: [0.98, -0.08, -1.0],
    handles: [0.1, -0.85],
    windshieldBase: 1.2,
    lamps: [[1, 0.67, 0.76, 0.19, 0.06, 'head'], [1, 0.73, 0.76, 0.06, 0.035, 'drl', { p: 2, lift: 0.009 }], [1, 0.58, 0.76, 0.05, 0.03, 'drl', { p: 2, lift: 0.009 }], [-1, 0.68, 0.86, 0.2, 0.07, 'tail'], [-1, 0, 0.66, 0.22, 0.07, 'plate', { p: 8 }], [1, 0, 0.67, 0.42, 0.1, 'gloss', { p: 6, lift: 0.006 }], [1, 0, 0.71, 0.4, 0.008, 'chrome', { p: 2, lift: 0.01 }], [1, 0, 0.64, 0.4, 0.008, 'chrome', { p: 2, lift: 0.01 }], [1, 0, 0.4, 0.62, 0.09, 'trim', { p: 8, lift: 0.008 }], [-1, 0, 0.42, 0.62, 0.09, 'trim', { p: 8, lift: 0.008 }]],
    cabin: [-1.2, 1.1], rearSeats: true,
    classify(c, n, b) {
      const ax = Math.abs(c.x), front = c.z > 2.05, rear = c.z < -2.08;
      if (c.y < b.bottom(c.z) + 0.015) return 'under';
      if (c.y > b.belt(c.z) + 0.012 && n.y < 0.8 && c.z < 1.3 && c.z > -1.35) {
        if (Math.abs(c.z + 0.08) < 0.04 && Math.abs(n.x) > 0.3) return 'gloss'; // B-pillar
        return 'glass';
      }
      if (c.y > b.belt(c.z) + 0.2 && c.z < 1.3 && c.z > -1.35) return 'paint2'; // white roof
      for (const g of [0.98, -0.08, -1.0]) if (Math.abs(c.z - g) < 0.006 && Math.abs(n.x) > 0.4 && c.y < b.belt(c.z) - 0.01) return 'under';
      if (c.z < 0.98 && c.z > -1.0 && ax > b.halfW(c.z) * 0.86 && c.y > b.bottom(c.z) + 0.08 && c.y < b.belt(c.z) - 0.02) return 'paint2'; // white doors
      return 'paint';
    },
    extras(chassis, M, b, exhausts, lightbar, ctx) {
      // Light bar: black base, clear outer lenses over red (left) / blue (right) emitters
      const ry = b.roofOf(0.2) + 0.03;
      addMesh(chassis, new THREE.BoxGeometry(1.3, 0.06, 0.3), M.trim, 0, ry, 0.15);
      for (const s of [-1, 1]) addMesh(chassis, new THREE.BoxGeometry(0.06, 0.04, 0.5), M.trim, s * 0.5, ry - 0.03, 0.15);
      for (let i = 0; i < 6; i++) {
        const x = -0.55 + i * 0.22, isA = x < 0;
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.26), new THREE.MeshBasicMaterial({ color: isA ? 0xff1e1e : 0x1e88ff }));
        lens.position.set(x, ry + 0.07, 0.15);
        chassis.add(lens);
        (isA ? lightbar.phaseAMeshes : lightbar.phaseBMeshes).push(lens);
      }
      if (!ctx.lod) { // clear outer dome (an opaque traffic mesh would hide the lenses)
        const dome = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.11, 0.3), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1 }));
        dome.position.set(0, ry + 0.075, 0.15);
        chassis.add(dome);
      }
      // Push bar
      for (const s of [-1, 1]) {
        const up = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 10);
        addMesh(chassis, up, M.trim, s * 0.32, 0.6, 2.42);
      }
      for (const y of [0.45, 0.78]) {
        const bar = new THREE.CylinderGeometry(0.025, 0.025, 0.76, 10);
        bar.rotateZ(Math.PI / 2);
        addMesh(chassis, bar, M.trim, 0, y, 2.43);
      }
      // A-pillar spotlight
      const spot = new THREE.CylinderGeometry(0.06, 0.05, 0.12, 14);
      spot.rotateX(Math.PI / 2);
      addMesh(chassis, spot, M.chrome, -0.86, b.belt(1.1) + 0.1, 1.08);
      // Antennas
      if (!ctx.lod) for (const z of [-0.6, -0.9]) addMesh(chassis, new THREE.CylinderGeometry(0.004, 0.006, 0.5, 5), M.trim, 0.2 * (z < -0.7 ? -1 : 1), b.roofOf(z) + 0.25, z);
      // Twin exhaust
      for (const x of [0.5, 0.62]) {
        const t = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12, 1, true);
        t.rotateX(Math.PI / 2);
        addMesh(chassis, t, M.chrome, x, 0.3, -2.3);
        exhausts.push([x, 0.3, -2.36]);
      }
    },
  },

  // Modern four-door city taxi: solid yellow paint, checker band, black cladding, lit roof sign. A claimed
  // plain traffic sedan reuses it with options.hideTaxiSign (no sign, no livery) and its own paint.
  taxi: {
    length: 4.5, width: 1.9, pFront: 4.2, pRear: 4.8, crown: 0.03,
    paint: 0xf5b800, paintMetal: 0.12, rimColor: 0xb8bdc4,
    glass: { base: 0.88, roof: 0.72 },
    sill: [[-2.25, 0.45], [-2.1, 0.3], [2.1, 0.28], [2.25, 0.41]],
    belt: [[-2.25, 0.84], [-2.17, 1.0], [-1.25, 1.02], [0.0, 0.98], [1.15, 0.95], [1.9, 0.87], [2.2, 0.75], [2.25, 0.6]],
    roof: [[-1.4, 0.0], [-1.2, 1.03], [-0.8, 1.38], [0.05, 1.45], [0.5, 1.43], [1.2, 0.98], [1.4, 0.0]],
    arches: [{ z: 1.4, cy: 0.35, r: 0.43 }, { z: -1.36, cy: 0.35, r: 0.43 }],
    wheel: { R: 0.35, tw: 0.24, rimFrac: 0.66, spokes: 5, style: 'split' },
    track: 0.8, wheelZ: [1.4, -1.36],
    gaps: [0.95, -0.06, -1.0],
    handles: [0.12, -0.9],
    windshieldBase: 1.17,
    lamps: [[1, 0.64, 0.74, 0.2, 0.05, 'head', { slant: 0.1 }], [1, 0.64, 0.705, 0.17, 0.007, 'drl', { slant: 0.1, lift: 0.009, p: 2 }], [-1, 0.66, 0.86, 0.2, 0.06, 'tail', { slant: -0.05 }], [-1, 0, 0.62, 0.22, 0.07, 'plate', { p: 8 }], [-1, 0, 0.86, 0.44, 0.008, 'chrome', { p: 2 }], [1, 0, 0.67, 0.36, 0.07, 'gloss', { p: 6, lift: 0.006 }], [1, 0, 0.67, 0.34, 0.006, 'chrome', { p: 2, lift: 0.01 }], [1, 0, 0.42, 0.2, 0.05, 'plate', { p: 8, lift: 0.008 }]],
    cabin: [-1.15, 1.05], rearSeats: true,
    seat: 0x2b2c30,
    classify(c, n, b) {
      const front = c.z > 1.84, rear = c.z < -1.8; // bumper zone starts at the arch edges
      if (c.y < b.bottom(c.z) + 0.015) return 'under';
      if (c.y > b.belt(c.z) + 0.012 && n.y < 0.8 && c.z < 1.25 && c.z > -1.3) {
        if (Math.abs(c.z + 0.06) < 0.05 && Math.abs(n.x) > 0.3) return 'gloss'; // B-pillar
        if (Math.abs(c.z + 0.98) < 0.035 && Math.abs(n.x) > 0.3) return 'gloss'; // C-pillar divider
        return 'glass';
      }
      for (const g of [0.95, -0.06, -1.0]) if (Math.abs(c.z - g) < 0.006 && Math.abs(n.x) > 0.4 && c.y < b.belt(c.z) - 0.01) return 'under';
      // Black lower bumpers, rocker cladding and arch eyebrows, bordered along loft rows
      if (lowerT(b, c) < (front || rear ? 0.5 : 0.34)) return 'trim';
      return 'paint';
    },
    extras(chassis, M, b, exhausts, lightbar, ctx) {
      for (const x of [0.52]) {
        const t = new THREE.CylinderGeometry(0.03, 0.032, 0.1, 12, 1, true);
        t.rotateX(Math.PI / 2);
        addMesh(chassis, t, M.chrome, x, 0.3, -2.2);
        exhausts.push([x, 0.3, -2.26]);
      }
      // Window surround: thin chrome line along the beltline of the side glass
      for (const s of [-1, 1]) {
        const g = sideStrip(b, -1.28, 1.2, (z) => b.belt(z) - 0.012, (z) => b.belt(z) - 0.002, s, { rows: 1, lift: ctx.lod ? 0.008 : 0.002, step: ctx.lod ? 0.2 : 0.025 });
        chassis.add(new THREE.Mesh(g, M.chrome));
      }
      if (ctx.options.hideTaxiSign) return;
      // Checker band along both flanks (two rows of checks wrapped onto the door skins)
      if (ctx.lod) {
        // Low detail: one strip quad per check, black/white baked into a colour attribute.
        const wht = new THREE.Color(0xf4f2ea), blk = new THREE.Color(0x121214);
        for (const s of [-1, 1]) {
          const g = sideStrip(b, -0.96, 0.93, (z) => b.belt(z) - 0.27, (z) => b.belt(z) - 0.16, s, { rows: 2, step: 0.055, lift: 0.008 }).toNonIndexed();
          const n = g.attributes.position.count, col = new Float32Array(n * 3);
          for (let v = 0; v < n; v++) {
            const q = (v / 6) | 0, c = ((q >> 1) + (q & 1)) & 1 ? blk : wht; // quad q = column * 2 + row
            col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          chassis.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff })));
        }
      } else {
        const chk = canvasTexture(128, 64, (g, w, h) => {
          g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#121214';
          g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
        });
        chk.wrapS = THREE.RepeatWrapping;
        chk.repeat.set(1 / 0.11, 1); // one black+white pair per 11 cm
        const chkMat = new THREE.MeshPhysicalMaterial({ map: chk, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
        for (const s of [-1, 1]) {
          const g = sideStrip(b, -0.96, 0.93, (z) => b.belt(z) - 0.27, (z) => b.belt(z) - 0.16, s, { rows: 4 });
          chassis.add(new THREE.Mesh(g, chkMat));
        }
      }
      // Roof sign: trapezoid lightbox with lettering on both faces, self-lit
      const ry = b.roofOf(0.0) + 0.03 * 1.15;
      const sign = new THREE.Group();
      sign.position.set(0, ry, -0.05);
      chassis.add(sign);
      const D = 0.16, Ht = 0.17, Wd = 0.66;
      const box = new THREE.Shape();
      box.moveTo(-D, 0.0); box.lineTo(D, 0.0); box.lineTo(D * 0.55, Ht); box.lineTo(-D * 0.55, Ht); box.closePath();
      const sg = new THREE.ExtrudeGeometry(box, { depth: Wd, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: ctx.lod ? 1 : 3 });
      sg.translate(0, 0, -Wd / 2); sg.rotateY(-Math.PI / 2);
      const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff3c2, emissive: 0xffd34d, emissiveIntensity: 0.65, roughness: 0.35 });
      lightMat.userData.emitCode = 3;
      addMesh(sign, sg, lightMat, 0, 0.03, 0);
      addMesh(sign, new THREE.BoxGeometry(Wd + 0.06, 0.035, D * 2 + 0.06), M.trim, 0, 0.018, 0);
      for (const x of [-0.24, 0.24]) addMesh(sign, new THREE.BoxGeometry(0.05, 0.03, 0.22), M.trim, x, -0.005, 0);
      if (ctx.lod) return; // no lettering
      const txt = canvasTexture(256, 64, (g, w, h) => {
        g.fillStyle = '#ffe680'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#161616'; g.font = 'bold 50px Arial, Helvetica, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('TAXI', w / 2, h / 2 + 3);
      });
      const txtMat = new THREE.MeshBasicMaterial({ map: txt });
      const slope = Math.atan2(D * 0.45, Ht);
      for (const e of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 0.86, Ht * 0.78), txtMat);
        p.position.set(0, 0.03 + Ht * 0.5, e * (D * 0.775 + 0.0135));
        p.rotation.set(-e * slope, e > 0 ? 0 : Math.PI, 0);
        sign.add(p);
      }
    },
  },
  // Open-wheel single-seater. The loft is the tub, nose, sidepods and engine cover (plan width shaped by
  // `hip`); wings, halo, floor and suspension are separate meshes. Emerald paint, carbon, gold accents.
  aero_formula: {
    length: 4.6, width: 1.5, pFront: 8, pRear: 6, crown: 0.02,
    paint: 0x0b9a68, paintMetal: 0.5, rimColor: 0x24272c, caliper: 0xd9a92b,
    glass: { base: 0.48, roof: 0.22 },
    sill: [[-2.3, 0.3], [-2.0, 0.22], [-1.6, 0.12], [1.05, 0.1], [1.6, 0.2], [2.3, 0.23]],
    belt: [[-2.3, 0.36], [-1.8, 0.42], [-1.2, 0.5], [-0.3, 0.58], [0.3, 0.6], [0.9, 0.64], [1.6, 0.5], [2.3, 0.33]],
    roof: [[-2.0, 0.0], [-1.75, 0.5], [-0.9, 0.7], [-0.3, 0.92], [-0.05, 1.0], [0.06, 0.98], [0.12, 0.0]],
    hip: [[-2.3, 0.16], [-1.8, 0.3], [-1.35, 0.4], [-0.9, 0.72], [-0.2, 1.0], [0.3, 0.98], [0.42, 0.5], [0.9, 0.42], [1.6, 0.25], [2.1, 0.16], [2.3, 0.12]],
    arches: [],
    wheel: { R: 0.36, tw: 0.3, rimFrac: 0.64, spokes: 5, style: 'split' },
    rearWheel: { R: 0.36, tw: 0.38, rimFrac: 0.64, spokes: 5, style: 'split' },
    track: 0.85, trackRear: 0.84, wheelZ: [1.56, -1.52],
    common: false, tray: false,
    lamps: [[-1, 0, 0.33, 0.045, 0.022, 'tail', { p: 2 }], [1, 0.56, 0.43, 0.15, 0.085, 'cockpit', { p: 3, from: 0.75, lift: 0.004 }]],
    mats(M) {
      M.gold = M.paint2;
      M.gold.color.set(0xe0ad35); M.gold.metalness = 0.85; M.gold.roughness = 0.28;
      M.cockpit = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.9 });
      M.trim = new THREE.MeshStandardMaterial({ color: 0x1a1b1f, metalness: 0.15, roughness: 0.42 }); // carbon
    },
    classify(c, n, b) {
      const ax = Math.abs(c.x), yt = b.belt(c.z);
      if (c.y < b.bottom(c.z) + 0.015) return 'trim';
      if (c.z > 0.12 && c.z < 0.9 && ax < 0.2 && n.y > 0.3 && c.y > yt - 0.04) return 'cockpit'; // cockpit opening
      if (lowerT(b, c) < 0.45) return 'trim'; // carbon lower flanks
      if (c.z < 0.4 && c.z > -1.7 && c.y > yt - 0.055 && c.y < yt + 0.002) return 'gold'; // shoulder pinstripe
      if (c.z > 2.08) return 'gold'; // nose tip
      return 'paint';
    },
    extras(chassis, M, b, exhausts, lightbar, ctx) {
      const C = M.trim;
      // Floor plank with the sidepod undercut, diffuser fins at the back
      const fl = [[0.24, 1.05], [0.6, 0.78], [0.8, 0.56], [0.82, -0.7], [0.66, -1.0], [0.46, -1.16], [0.4, -2.0]];
      addMesh(chassis, slab([...fl, ...fl.slice().reverse().map(([x, z]) => [-x, z])], 0.025), C, 0, 0.115, 0);
      for (const x of [-0.3, -0.12, 0.12, 0.3]) addMesh(chassis, plate([[-1.6, 0.1], [-2.1, 0.1], [-2.1, 0.3], [-1.75, 0.16]], 0.012), C, x, 0, 0);
      // Front wing: full-span mainplane, two stacked flaps per side, endplates, nose pylons
      addMesh(chassis, airfoil(0.3, 0.03, 1.86, 0.02), C, 0, 0.09, 2.47).rotation.x = 0.06;
      for (const s of [-1, 1]) {
        addMesh(chassis, airfoil(0.2, 0.022, 0.66, 0.015), C, s * 0.6, 0.145, 2.27).rotation.x = 0.32;
        addMesh(chassis, airfoil(0.15, 0.018, 0.66, 0.01), M.gold, s * 0.6, 0.205, 2.15).rotation.x = 0.56;
        addMesh(chassis, plate([[2.5, 0.04], [2.0, 0.04], [1.96, 0.18], [2.06, 0.3], [2.38, 0.26], [2.5, 0.13]], 0.014), C, s * 0.94, 0, 0);
        addMesh(chassis, plate([[2.34, 0.1], [2.12, 0.1], [2.14, 0.27], [2.3, 0.27]], 0.012), C, s * 0.09, 0, 0);
      }
      // Rear wing: mainplane + DRS flap between tall endplates, beam wing, central swan-neck pylon
      for (const s of [-1, 1]) addMesh(chassis, plate([[-1.97, 0.66], [-2.3, 0.6], [-2.44, 0.72], [-2.45, 1.01], [-2.04, 1.02], [-1.95, 0.9]], 0.014), C, s * 0.53, 0, 0);
      addMesh(chassis, airfoil(0.3, 0.035, 1.05, 0.02), C, 0, 0.84, -2.0).rotation.x = 0.12;
      addMesh(chassis, airfoil(0.18, 0.022, 1.05, 0.01), M.paint, 0, 0.885, -2.25).rotation.x = 0.5;
      addMesh(chassis, new THREE.BoxGeometry(1.05, 0.012, 0.03), M.gold, 0, 0.98, -2.42).rotation.x = 0.5;
      addMesh(chassis, airfoil(0.16, 0.02, 0.8, 0.01), C, 0, 0.5, -2.12).rotation.x = 0.22;
      addMesh(chassis, plate([[-1.9, 0.38], [-2.12, 0.38], [-2.16, 0.85], [-2.02, 0.86]], 0.02), C, 0, 0, 0);
      // Halo: titanium hoop over the cockpit plus its centre pillar
      const halo = new THREE.CatmullRomCurve3([[-0.24, 0.6, -0.02], [-0.27, 0.82, 0.14], [-0.2, 0.9, 0.42], [0, 0.92, 0.6], [0.2, 0.9, 0.42], [0.27, 0.82, 0.14], [0.24, 0.6, -0.02]].map((p) => new THREE.Vector3(...p)));
      addMesh(chassis, new THREE.TubeGeometry(halo, 48, 0.024, 10), C);
      rod(chassis, [0, 0.92, 0.6], [0, 0.63, 0.88], 0.026, C, 10);
      // Airbox intake above the driver's head
      const ab = new THREE.CircleGeometry(0.1, 24); ab.scale(1, 0.75, 1);
      addMesh(chassis, ab, M.cockpit, 0, 0.885, 0.11);
      // Driver: helmet with a dark visor band, steering wheel
      addMesh(chassis, new THREE.SphereGeometry(0.125, 24, 16), M.gold, 0, 0.73, 0.3);
      addMesh(chassis, new THREE.SphereGeometry(0.128, 24, 6, Math.PI / 2 - 0.95, 1.9, 1.25, 0.42), M.glass, 0, 0.73, 0.3);
      addMesh(chassis, new THREE.CylinderGeometry(0.07, 0.07, 0.26, 12), M.cockpit, 0, 0.64, 0.3);
      addMesh(chassis, new THREE.BoxGeometry(0.24, 0.1, 0.03), C, 0, 0.62, 0.62).rotation.x = -0.3;
      // Mirrors on stalks at the front of the sidepods
      for (const s of [-1, 1]) {
        rod(chassis, [s * 0.28, 0.62, 0.52], [s * 0.42, 0.76, 0.5], 0.01, C);
        const mh = new THREE.SphereGeometry(0.07, 16, 10); mh.scale(1, 0.55, 0.6);
        addMesh(chassis, mh, M.paint, s * 0.45, 0.77, 0.5);
        const mg = new THREE.CircleGeometry(0.055, 14); mg.scale(1, 0.5, 1); mg.rotateY(Math.PI);
        addMesh(chassis, mg, M.chrome, s * 0.45, 0.77, 0.455);
      }
      // Double-wishbone suspension: carbon arms from the tub to the uprights, push/pull rods, driveshafts
      const arm = (a, bb, r = 0.014) => { for (const s of [-1, 1]) rod(chassis, [s * a[0], a[1], a[2]], [s * bb[0], bb[1], bb[2]], r, C); };
      arm([0.15, 0.25, 1.8], [0.68, 0.22, 1.56]); arm([0.15, 0.25, 1.32], [0.68, 0.22, 1.56]);
      arm([0.16, 0.44, 1.74], [0.66, 0.5, 1.58]); arm([0.16, 0.44, 1.38], [0.66, 0.5, 1.58]);
      arm([0.66, 0.24, 1.53], [0.17, 0.5, 1.46]); arm([0.15, 0.33, 1.66], [0.68, 0.34, 1.68], 0.012);
      arm([0.24, 0.22, -1.22], [0.62, 0.2, -1.52]); arm([0.2, 0.22, -1.82], [0.62, 0.2, -1.52]);
      arm([0.24, 0.46, -1.28], [0.62, 0.52, -1.5]); arm([0.2, 0.46, -1.76], [0.62, 0.52, -1.5]);
      arm([0.62, 0.5, -1.56], [0.22, 0.24, -1.62]); arm([0.2, 0.36, -1.52], [0.64, 0.36, -1.52], 0.024);
      // Single exhaust under the beam wing
      const ex = new THREE.CylinderGeometry(0.05, 0.055, 0.3, 16, 1, true); ex.rotateX(Math.PI / 2);
      addMesh(chassis, ex, M.disc, 0, 0.44, -2.12);
      exhausts.push([0, 0.44, -2.28]);
      ctx.trails = [[-0.53, 1.0, -2.48], [0.53, 1.0, -2.48]];
      ctx.flameColor = 0x10b981; ctx.trailColor = 0xffd166;
    },
    // Coloured sidewall band on the slicks
    decorWheel(wheelMesh, M, side, front, w) {
      const band = new THREE.TorusGeometry(w.R * 0.83, 0.009, 4, 48);
      band.rotateY(Math.PI / 2);
      addMesh(wheelMesh, band, M.gold, side * (w.tw * 0.5 + 0.002), 0, 0);
    },
  },
  // Sci-fi concept hypercar: long low wedge, narrow bubble canopy, pontoon haunches, dorsal fin, cyan
  // light blades and a magenta tail bar. Two rear aero flaps lift on nitro (vfxParts.aeroFlaps).
  cyber_mach1: {
    length: 5.1, width: 2.16, pFront: 2.4, pRear: 5.5, crown: 0.02,
    paint: 0x151d30, paint2: 0x2c3548, paintMetal: 0.85, rimColor: 0x5a6578, caliper: 0x00d8ea,
    glass: { base: 0.6, roof: 0.3 },
    sill: [[-2.55, 0.3], [-2.3, 0.16], [2.15, 0.13], [2.55, 0.2]],
    belt: [[-2.55, 0.62], [-2.45, 0.83], [-1.6, 0.86], [-0.6, 0.8], [0.6, 0.78], [1.55, 0.8], [2.0, 0.71], [2.3, 0.55], [2.55, 0.3]],
    roof: [[-1.75, 0.0], [-1.5, 0.88], [-0.8, 1.06], [-0.1, 1.15], [0.4, 1.13], [0.95, 0.9], [1.2, 0.0]],
    hip: [[-2.55, 0.92], [-1.56, 1.0], [-0.5, 0.88], [0.5, 0.88], [1.56, 1.0], [2.55, 0.94]],
    arches: [{ z: 1.56, cy: 0.36, r: 0.42 }, { z: -1.56, cy: 0.36, r: 0.42 }],
    wheel: { R: 0.36, tw: 0.28, rimFrac: 0.74, spokes: 6, style: 'aero' },
    rearWheel: { R: 0.36, tw: 0.32, rimFrac: 0.74, spokes: 6, style: 'aero' },
    track: 0.91, trackRear: 0.9, wheelZ: [1.56, -1.56],
    gaps: [0.98],
    handles: [], mirrors: false,
    windshieldBase: 0.98,
    lamps: [
      [1, 0.7, 0.54, 0.2, 0.022, 'head', { slant: 0.2, p: 3 }], [1, 0, 0.47, 0.82, 0.01, 'cyan', { p: 2, lift: 0.008 }],
      [1, 0, 0.27, 0.72, 0.075, 'trim', { p: 6, lift: 0.006 }],
      [-1, 0, 0.7, 0.98, 0.016, 'magenta', { p: 2, lift: 0.016 }], [-1, 0, 0.42, 0.88, 0.16, 'trim', { p: 8, lift: 0.006 }],
    ],
    cabin: [-0.85, 0.95],
    seat: 0x1c2536,
    mats(M) {
      M.cyan = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
      M.magenta = new THREE.MeshBasicMaterial({ color: 0xff2a85 });
      M.glass.color.set(0x06202e);
    },
    classify(c, n, b) {
      const ax = Math.abs(c.x);
      if (c.y < b.bottom(c.z) + 0.015) return 'under';
      if (c.y > b.belt(c.z) + 0.012 && c.z < 1.18 && c.z > -0.7) return 'glass'; // bubble canopy
      // Engine-cover louvres behind the canopy
      if (c.y > b.belt(c.z) + 0.02 && c.z < -0.8 && c.z > -1.75 && ax < 0.42 && n.y > 0.55) return Math.floor(c.z / 0.07) % 2 ? 'gloss' : 'paint2';
      if (Math.abs(c.z - 0.98) < 0.006 && Math.abs(n.x) > 0.4 && c.y < b.belt(c.z) - 0.01) return 'under';
      // Side intake scoop ahead of the rear haunch
      if (c.z < -0.45 && c.z > -1.05 && Math.abs(n.x) > 0.5) { const t = lowerT(b, c); if (t > 0.9 && c.y < b.belt(c.z) - 0.1) return 'gloss'; }
      if (lowerT(b, c) < 0.5) return 'paint2'; // gunmetal lower body
      return 'paint';
    },
    extras(chassis, M, b, exhausts, lightbar, ctx) {
      // Light lines that follow the flanks: cyan along the sill and the shoulder
      for (const s of [-1, 1]) {
        chassis.add(new THREE.Mesh(sideStrip(b, -1.12, 1.12, (z) => b.sill(z) + 0.12, (z) => b.sill(z) + 0.135, s, { rows: 1, lift: 0.004 }), M.cyan));
        chassis.add(new THREE.Mesh(sideStrip(b, -2.42, 2.25, (z) => b.belt(z) - 0.055, (z) => b.belt(z) - 0.043, s, { rows: 1, lift: 0.004 }), M.cyan));
      }
      // Dorsal stabiliser fin from the canopy to the tail, lit along its top edge
      addMesh(chassis, plate([[-0.75, 1.0], [-2.38, 0.82], [-2.44, 1.04], [-2.2, 1.09], [-1.3, 1.08]], 0.026, 0.006), M.paint, 0, 0, 0);
      const fe = new THREE.CatmullRomCurve3([[0, 1.02, -0.85], [0, 1.088, -1.3], [0, 1.094, -2.2], [0, 1.05, -2.44]].map((p) => new THREE.Vector3(...p)));
      addMesh(chassis, new THREE.TubeGeometry(fe, 32, 0.012, 6), M.cyan);
      // Active aero flaps: hinged at their leading edge, trailing edge lifts on nitro
      ctx.aeroFlaps = [];
      for (const s of [-1, 1]) {
        const flap = new THREE.Group();
        flap.position.set(s * 0.5, b.belt(-2.05) + 0.03, -2.0);
        chassis.add(flap);
        addMesh(flap, airfoil(0.42, 0.03, 0.66, 0.012), M.paint2);
        addMesh(flap, new THREE.BoxGeometry(0.66, 0.014, 0.03), M.magenta, 0, 0.01, -0.41);
        for (const e of [-1, 1]) addMesh(flap, plate([[0.02, -0.04], [-0.42, -0.04], [-0.4, 0.04], [0.0, 0.03]], 0.012), M.paint2, e * 0.33, 0, 0);
        ctx.aeroFlaps.push(flap);
      }
      // Twin turbine nozzles with glowing cores in the diffuser
      for (const x of [-0.42, 0.42]) {
        const nz = new THREE.CylinderGeometry(0.17, 0.21, 0.3, 24, 1, true); nz.rotateX(Math.PI / 2);
        addMesh(chassis, nz, M.disc, x, 0.42, -2.5);
        const back = new THREE.CircleGeometry(0.17, 24); back.rotateY(Math.PI);
        addMesh(chassis, back, M.gloss, x, 0.42, -2.55);
        const core = new THREE.CircleGeometry(0.07, 20); core.rotateY(Math.PI);
        addMesh(chassis, core, M.cyan, x, 0.42, -2.555);
        addMesh(chassis, new THREE.TorusGeometry(0.125, 0.008, 6, 32), M.cyan, x, 0.42, -2.555);
        for (let i = 0; i < 8; i++) addMesh(chassis, new THREE.BoxGeometry(0.012, 0.06, 0.01), M.disc, x, 0.42, -2.553).geometry.translate(0, 0.095, 0).rotateZ((i / 8) * Math.PI * 2);
        const ring = new THREE.TorusGeometry(0.17, 0.012, 6, 32);
        addMesh(chassis, ring, M.chrome, x, 0.42, -2.65);
        exhausts.push([x, 0.42, -2.67]);
      }
      // Diffuser fins and a front splitter blade with a cyan edge
      for (const x of [-0.75, -0.2, 0, 0.2, 0.75]) addMesh(chassis, plate([[-2.05, 0.14], [-2.52, 0.14], [-2.5, 0.3], [-2.25, 0.2]], 0.014), M.gloss, x, 0, 0);
      const sp = [];
      for (let z = 1.98; z <= 2.56; z += 0.04) sp.push([b.halfW(z) * 0.94 + 0.02, Math.min(z, 2.58)]);
      addMesh(chassis, slab([[0, 1.98], ...sp, ...sp.slice().reverse().map(([x, z]) => [-x, z])], 0.022), M.gloss, 0, 0.135, 0);
      // Camera pods in place of mirrors
      for (const s of [-1, 1]) {
        const pod = new THREE.CapsuleGeometry(0.028, 0.12, 4, 10); pod.rotateX(Math.PI / 2);
        addMesh(chassis, pod, M.paint2, s * 0.78, b.belt(0.9) + 0.09, 0.86);
        rod(chassis, [s * 0.66, b.belt(0.9) + 0.01, 0.84], [s * 0.78, b.belt(0.9) + 0.09, 0.86], 0.012, M.paint2);
        addMesh(chassis, new THREE.CircleGeometry(0.02, 12).rotateY(Math.PI), M.cyan, s * 0.78, b.belt(0.9) + 0.09, 0.78);
      }
      ctx.trails = [[-0.98, 0.25, -2.5], [0.98, 0.25, -2.5], [-0.5, 1.0, -2.45], [0.5, 1.0, -2.45]];
      ctx.flameColor = 0x00f5ff; ctx.trailColor = 0xff2a85;
    },
    // Neon ring on the face of each wheel (echo of the old hubless rims)
    decorWheel(wheelMesh, M, side, front, w) {
      const ring = new THREE.TorusGeometry(w.R * w.rimFrac * 0.93, 0.009, 6, 48);
      ring.rotateY(Math.PI / 2);
      addMesh(wheelMesh, ring, M.cyan, side * (w.tw * 0.31 + 0.014), 0, 0);
    },
  },
};

export const HERO_VEHICLE_IDS = new Set(Object.keys(CARS));
const GEO_CACHE = new Map();

/**
 * Returns { group, chassis, wheels, frontSteerPivots, paintMeshes, lightbarParts, exhausts } plus, when
 * the car's extras set them, trails / aeroFlaps / flameColor / trailColor.
 * Optional spec hooks: mats(M) adds materials, common:false skips mirrors+cabin, tray:false skips the
 * underbody tray, rearWheel/trackRear override the rear axle, decorWheel(wheelMesh, M, side, front).
 * options.lod builds the low-detail traffic body (not cached: traffic flattens and disposes it once).
 */
export function buildHeroVehicle(typeId, options = {}) {
  const spec = CARS[typeId];
  const M = materials(spec);
  if (spec.mats) spec.mats(M);
  if (options.paintColor != null) M.paint.color.set(options.paintColor);
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  const lod = !!options.lod;
  const body = makeBody(spec, lod);
  // Lofting and lamp projection take ~90 ms; geometry is shared by every build of the same car.
  let cache = lod ? null : GEO_CACHE.get(typeId);
  if (!cache) {
    cache = { parts: [...splitByMaterial(body, spec.classify)], lamps: lampGeometries(spec, body) };
    if (!lod) GEO_CACHE.set(typeId, cache);
  }
  for (const [key, geo] of cache.parts) {
    const mat = key === 'louvre' ? M.gloss : M[key];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'body-' + key;
    chassis.add(mesh);
  }
  if (spec.common !== false) addCommonDetails(spec, body, M, chassis);
  for (const [key, geo] of cache.lamps) chassis.add(new THREE.Mesh(geo, M[key]));
  const exhausts = [];
  const lightbarParts = { typeId, phaseAMeshes: [], phaseBMeshes: [] };
  const ctx = { options, lod };
  spec.extras(chassis, M, body, exhausts, lightbarParts, ctx);

  // Underbody tray hides the see-through gap between the arches
  const tw = spec.wheel.tw;
  if (spec.tray !== false) addMesh(chassis, new THREE.BoxGeometry((spec.track - tw / 2 - 0.04) * 2, 0.3, spec.length * 0.86), M.under, 0, 0.36, 0);

  const wheels = [], frontSteerPivots = [];
  for (const [zi, wz] of spec.wheelZ.entries()) {
    const ws = zi > 0 && spec.rearWheel ? { ...spec, wheel: spec.rearWheel } : spec;
    const track = zi > 0 && spec.trackRear ? spec.trackRear : spec.track;
    for (const s of [-1, 1]) {
      const { pivot, wheelMesh } = lod ? buildWheelLod(ws, M, s) : buildWheel(ws, M, s);
      pivot.position.set(s * track, ws.wheel.R, wz);
      if (spec.decorWheel && !lod) spec.decorWheel(wheelMesh, M, s, zi === 0, ws.wheel);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (zi === 0) frontSteerPivots.push(pivot);
    }
  }

  group.traverse((o) => {
    if (o.isMesh && o.material !== M.glass && o.material !== M.interior) { o.castShadow = true; o.receiveShadow = true; }
  });
  const paintMeshes = [];
  chassis.traverse((o) => { if (o.isMesh && o.material === M.paint) paintMeshes.push(o); });
  // Paint meshes share one material; applyVehiclePaint recolours it via any of them.
  return {
    group, chassis, wheels, frontSteerPivots, paintMeshes, lightbarParts: typeId === 'police' ? lightbarParts : null, exhausts,
    trails: ctx.trails, aeroFlaps: ctx.aeroFlaps, flameColor: ctx.flameColor, trailColor: ctx.trailColor,
  };
}
