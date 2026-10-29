// [hero-vehicles] Detailed models for the car the player drives. Traffic keeps the light box models.
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

// Uniform Catmull-Rom through 2D control points, `k` samples per span; mirrored phantom ends keep the
// tangent horizontal at the centreline so the two halves join smoothly.
export function crPath(pts, k) {
  const ext = [[-pts[1][0], pts[1][1]], ...pts, [-pts[pts.length - 2][0], pts[pts.length - 2][1]]];
  const out = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    for (let s = 0; s < k; s++) {
      const t = s / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, e) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3);
      out.push([Math.max(0, f(p0[0], p1[0], p2[0], p3[0])), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const SPAN = 6;

export function makeBody(spec) {
  const L = spec.length, hl = L / 2;
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
    ], SPAN);
  };

  // Stations: even spacing, dense at the rounded ends, and pairs hugging arch edges and panel gaps.
  const zs = new Set();
  for (let z = -hl; z <= hl + 1e-6; z += 0.035) zs.add(+z.toFixed(4));
  for (let s = 0; s <= 0.6; s += s < 0.12 ? 0.004 : 0.012) { zs.add(+(hl - s).toFixed(4)); zs.add(+(-hl + s).toFixed(4)); }
  for (const a of spec.arches) {
    for (let t = -1; t <= 1.0001; t += 0.05) zs.add(+(a.z + a.r * Math.sin(t * Math.PI / 2)).toFixed(4));
    for (const e of [-1, 1]) for (const o of [-0.004, 0.004]) zs.add(+(a.z + e * a.r + o).toFixed(4));
  }
  for (const gz of spec.gaps || []) for (const o of [-0.009, -0.004, 0.004, 0.009]) zs.add(+(gz + o).toFixed(4));
  const stations = [...zs].filter((z) => z >= -hl && z <= hl).sort((a, b) => a - b);

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
  const sideIdx = 5 * SPAN;
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
  const surfaceZ = (x, y, end) => {
    let lo = end * hl, hi = lo;
    for (let d = 0.01; d < 0.9; d += 0.01) { hi = end * (hl - d); if (widthAt(hi, y) >= Math.abs(x)) break; lo = hi; }
    for (let k = 0; k < 28; k++) {
      const mid = (lo + hi) / 2;
      if (widthAt(mid, y) >= Math.abs(x)) hi = mid; else lo = mid;
    }
    return hi;
  };
  return { geometry, sill, belt, roofOf, halfW, bottom, halfProfile, widthAt, surfaceZ };
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
export function lampPatch(body, end, cx, cy, ax, ay, { p = 4, slant = 0, lift = 0.006 } = {}) {
  const RAD = 6, ANG = 40, pos = [], idx = [];
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
  for (let i = 0; i < pos.length; i += 3) pos[i + 2] = body.surfaceZ(pos[i], pos[i + 1], end) + end * lift;
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
export const blob = (x, y, cx, cy, ax, ay, p = 4) => Math.pow(Math.abs(x - cx) / ax, p) + Math.pow(Math.abs(y - cy) / ay, p) < 1;

export function materials(spec) {
  const envd = (m) => { m.userData.envProbe = true; return m; };
  return {
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
  for (const s of [-1, 1]) {
    const shell = new THREE.SphereGeometry(0.1, 16, 10);
    shell.scale(1.0, 0.62, 0.85);
    const mir = addMesh(chassis, shell, M.paint, s * (wx + 0.13), yt + 0.1, ws - 0.16);
    mir.userData.paint = true;
    addMesh(chassis, new THREE.BoxGeometry(0.11, 0.03, 0.06), M.trim, s * (wx + 0.05), yt + 0.06, ws - 0.14);
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
    extras(chassis, M, b, exhausts, lightbar) {
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
      const dome = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.11, 0.3), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1 }));
      dome.position.set(0, ry + 0.075, 0.15);
      chassis.add(dome);
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
      for (const z of [-0.6, -0.9]) addMesh(chassis, new THREE.CylinderGeometry(0.004, 0.006, 0.5, 5), M.trim, 0.2 * (z < -0.7 ? -1 : 1), b.roofOf(z) + 0.25, z);
      // Twin exhaust
      for (const x of [0.5, 0.62]) {
        const t = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12, 1, true);
        t.rotateX(Math.PI / 2);
        addMesh(chassis, t, M.chrome, x, 0.3, -2.3);
        exhausts.push([x, 0.3, -2.36]);
      }
    },
  },
};

export const HERO_VEHICLE_IDS = new Set(Object.keys(CARS));
const GEO_CACHE = new Map();

/** Returns { group, chassis, wheels, frontSteerPivots, paintMeshes, lightbarParts, exhausts }. */
export function buildHeroVehicle(typeId, options = {}) {
  const spec = CARS[typeId];
  const M = materials(spec);
  if (options.paintColor != null) M.paint.color.set(options.paintColor);
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  const body = makeBody(spec);
  // Lofting and lamp projection take ~90 ms; geometry is shared by every build of the same car.
  let cache = GEO_CACHE.get(typeId);
  if (!cache) {
    cache = { parts: [...splitByMaterial(body, spec.classify)], lamps: lampGeometries(spec, body) };
    GEO_CACHE.set(typeId, cache);
  }
  for (const [key, geo] of cache.parts) {
    const mat = key === 'louvre' ? M.gloss : M[key];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'body-' + key;
    chassis.add(mesh);
  }
  addCommonDetails(spec, body, M, chassis);
  for (const [key, geo] of cache.lamps) chassis.add(new THREE.Mesh(geo, M[key]));
  const exhausts = [];
  const lightbarParts = { typeId, phaseAMeshes: [], phaseBMeshes: [] };
  spec.extras(chassis, M, body, exhausts, lightbarParts);

  // Underbody tray hides the see-through gap between the arches
  const tw = spec.wheel.tw;
  addMesh(chassis, new THREE.BoxGeometry((spec.track - tw / 2 - 0.04) * 2, 0.3, spec.length * 0.86), M.under, 0, 0.36, 0);

  const wheels = [], frontSteerPivots = [];
  for (const [zi, wz] of spec.wheelZ.entries()) {
    for (const s of [-1, 1]) {
      const { pivot, wheelMesh } = buildWheel(spec, M, s);
      pivot.position.set(s * spec.track, spec.wheel.R, wz);
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
  return { group, chassis, wheels, frontSteerPivots, paintMeshes, lightbarParts: typeId === 'police' ? lightbarParts : null, exhausts };
}
