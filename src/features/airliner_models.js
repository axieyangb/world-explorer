// High-detail Commercial Airliner 3D Models (Boeing 787-9 Dreamliner & Airbus A350-1000 XWB)
// Provides:
//   1. buildAirlinerInstancedGeometries() / buildStaticAirlinerGeometries() -> { plane, planeTail } for PlacesSystem & LiveSky InstancedMesh pools
//   2. createHeroAirlinerModel(liveryIdx, scale) -> articulated Three.js Group for player flight & interactive airport gates
//   3. charAirlinerModel(group) -> scorches airliner materials on destruction

import * as THREE from "../../vendor/three.module.js";

export const AIRLINER_LIVERIES = [
  {
    id: "boeing_787",
    variant: "boeing787",
    name: "Boeing 787-9 Dreamliner",
    nameZh: "波音 787-9 梦想客机",
    airline: "Boeing Dreamliner",
    tailHex: 0x00509e,
    stripeHex: 0x00a3e0,
    bellyHex: 0xdce3ec,
    engineHex: 0xf4f7fb,
  },
  {
    id: "airbus_a350",
    variant: "airbusA350",
    name: "Airbus A350-1000 XWB",
    nameZh: "空客 A350-1000 宽体客机",
    airline: "Airbus XWB",
    tailHex: 0x0085ca,
    stripeHex: 0x00b4d8,
    bellyHex: 0xdfe5ee,
    engineHex: 0xf6f8fc,
  },
  {
    id: "boeing_787_crimson",
    variant: "boeing787",
    name: "Boeing 787-9 Dreamliner",
    nameZh: "波音 787-9 梦想客机",
    airline: "Pacific Red",
    tailHex: 0xc8102e,
    stripeHex: 0xc8102e,
    bellyHex: 0xe2e6ec,
    engineHex: 0xf4f6f9,
  },
  {
    id: "airbus_a350_royal",
    variant: "airbusA350",
    name: "Airbus A350-900 XWB",
    nameZh: "空客 A350-900 宽体客机",
    airline: "Atlantic Blue",
    tailHex: 0x003a70,
    stripeHex: 0xd4a017,
    bellyHex: 0xdce2eb,
    engineHex: 0x003a70,
  },
  {
    id: "boeing_787_emerald",
    variant: "boeing787",
    name: "Boeing 787-10 Dreamliner",
    nameZh: "波音 787-10 梦想客机",
    airline: "Cathay Jade",
    tailHex: 0x0b6e4f,
    stripeHex: 0x0b6e4f,
    bellyHex: 0xe3e8ea,
    engineHex: 0xf4f7f6,
  },
  {
    id: "airbus_a350_gold",
    variant: "airbusA350",
    name: "Airbus A350-1000 XWB",
    nameZh: "空客 A350-1000 宽体客机",
    airline: "Imperial Gold",
    tailHex: 0xf2a900,
    stripeHex: 0x102542,
    bellyHex: 0xdfe3ea,
    engineHex: 0xf4f6f9,
  },
  {
    id: "boeing_787_vip",
    variant: "boeing787",
    name: "Boeing 787-9 Executive",
    nameZh: "波音 787-9 旗舰客机",
    airline: "Dynasty Violet",
    tailHex: 0x5c2d91,
    stripeHex: 0xd4af37,
    bellyHex: 0xdfe2e8,
    engineHex: 0xf5f5f8,
  },
];

const _m3 = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

function mat(tx, ty, tz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(tx, ty, tz),
    _q.clone(),
    new THREE.Vector3(sx, sy, sz)
  );
}

/**
 * Merges geometry parts while preserving smooth analytical vertex normals!
 * Never calls computeVertexNormals() AFTER toNonIndexed() (which would destroy smooth normals into flat facets).
 */
function mergeParts(parts) {
  const pos = [];
  const nrm = [];
  const col = [];
  for (const [geom, rgb, m] of parts) {
    if (!geom.attributes.normal) {
      geom.computeVertexNormals();
    }
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (m) {
      g.applyMatrix4(m);
    }
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const cAttr = g.attributes.color ? g.attributes.color.array : null;
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]);
      const nx = n[i], ny = n[i + 1], nz = n[i + 2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm.push(nx / nl, ny / nl, nz / nl);
      if (cAttr) {
        col.push(cAttr[i] * rgb[0], cAttr[i + 1] * rgb[1], cAttr[i + 2] * rgb[2]);
      } else {
        col.push(rgb[0], rgb[1], rgb[2]);
      }
    }
    g.dispose();
    geom.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 24) => new THREE.ConeGeometry(r, h, seg);

/**
 * Evaluates fuselage cross-section parameters at axial coordinate z (nose tip at +24.2m, APU tail tip at -24.2m).
 */
function sampleFuselageStation(z) {
  const R = 2.24;
  let rx = R;
  let ry = R * 1.03;
  let yc = 3.46;

  if (z > 13.0) {
    // Nose section (z = +13.0 .. +24.2m): authentic drooped parabolic Boeing 787 / Airbus A350 nose radome profile
    const t = Math.min(1, Math.max(0, (24.2 - z) / (24.2 - 13.0)));
    const theta = t * (Math.PI * 0.5);
    const prof = Math.pow(Math.max(0, Math.sin(theta)), 0.65);
    rx = R * prof;
    ry = R * 1.03 * prof;
    const u = 1.0 - t;
    yc = 3.46 - 0.62 * Math.pow(u, 1.55);
  } else if (z < -10.5) {
    // Tail section (z = -10.5 .. -24.2m): smooth upturned boat-tail taper toward silver APU exhaust cone
    const u = Math.min(1, Math.max(0, (-10.5 - z) / (24.2 - 10.5)));
    const s = u * u * (3 - 2 * u);
    const taper = 1.0 - 0.88 * Math.pow(u, 1.28);
    rx = R * taper;
    ry = R * 1.03 * (1.0 - 0.85 * Math.pow(u, 1.22));
    yc = 3.46 + 0.66 * s;
  }

  // Wing-to-body aerodynamic belly fairing bulge around wing box (z = -5.5 .. +7.5m)
  const bellyEnv = Math.max(0, 1.0 - Math.pow((z - 1.0) / 7.2, 2));
  return { z, rx, ry, yc, bellyEnv };
}

/**
 * Builds a single continuous smooth lofted widebody fuselage (44 radial segments × 32 axial stations)
 * with analytical smooth normals and vertex-baked cockpit A350/787 visor, cheatline stripe, doors, and cabin windows.
 */
function buildLoftedFuselageGeometry(radSegs = 44, zSegs = 32, colors = null) {
  const pal = colors || {
    white: [0.97, 0.98, 1.0],
    belly: [0.86, 0.89, 0.93],
    stripe: [0.0, 0.64, 0.88],
    glass: [0.06, 0.10, 0.16],
    win: [0.14, 0.22, 0.34],
    chrome: [0.76, 0.80, 0.86],
    apu: [0.24, 0.27, 0.32],
  };

  const zMin = -24.2;
  const zMax = 24.2;
  const stations = [];
  for (let i = 0; i <= zSegs; i++) {
    // Cosine-clustered spacing near nose & tail for ultra-smooth curvature where radius changes rapidly
    const u = i / zSegs;
    const z = zMin + (zMax - zMin) * (0.5 - 0.5 * Math.cos(u * Math.PI));
    stations.push(sampleFuselageStation(z));
  }

  const stride = radSegs + 1;
  const numVerts = (zSegs + 1) * stride;
  const pos = new Float32Array(numVerts * 3);
  const nrm = new Float32Array(numVerts * 3);
  const col = new Float32Array(numVerts * 3);

  for (let iz = 0; iz <= zSegs; iz++) {
    const st = stations[iz];
    const stPrev = stations[Math.max(0, iz - 1)];
    const stNext = stations[Math.min(zSegs, iz + 1)];
    const dz = Math.max(1e-4, stNext.z - stPrev.z);
    const drx_dz = (stNext.rx - stPrev.rx) / dz;
    const dry_dz = (stNext.ry - stPrev.ry) / dz;
    const dyc_dz = (stNext.yc - stPrev.yc) / dz;

    for (let ir = 0; ir <= radSegs; ir++) {
      const phi = (ir / radSegs) * Math.PI * 2;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);

      // Add subtle lower-lobe wing-to-body fairing flare when cp < -0.25
      let rx = st.rx;
      let ry = st.ry;
      if (st.bellyEnv > 0 && cp < -0.15) {
        const bFactor = Math.pow(Math.min(1, (-cp - 0.15) / 0.85), 1.4) * st.bellyEnv;
        rx += 0.26 * bFactor;
        ry += 0.22 * bFactor;
      }

      const x = rx * sp;
      const y = st.yc + ry * cp;
      const z = st.z;

      // Smooth analytical surface normal (handles nose tip & tail cone smoothly)
      let nx = sp / Math.max(0.08, rx);
      let ny = cp / Math.max(0.08, ry);
      let nz = -(drx_dz * sp * nx + (dyc_dz + dry_dz * cp) * ny);
      if (iz === zSegs) {
        nx = sp * 0.15; ny = cp * 0.15; nz = 1.0;
      } else if (iz === 0) {
        nx = sp * 0.25; ny = cp * 0.25; nz = -1.0;
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;

      // Keep fuselage vertex colors strictly aligned to radial rings (cp) or nose/tail tips so zero diagonal quad bleeding occurs
      let rgb = pal.white;
      if (z < -23.1) {
        // Metallic APU tailcone exhaust tip
        rgb = pal.apu;
      } else if (cp < -0.28 && z > -14.5 && z < 15.5) {
        // Pearl-grey aerodynamic belly fairing & lower fuselage
        rgb = pal.belly;
      }

      const idx = (iz * stride + ir) * 3;
      pos[idx] = x;
      pos[idx + 1] = y;
      pos[idx + 2] = z;
      nrm[idx] = nx;
      nrm[idx + 1] = ny;
      nrm[idx + 2] = nz;
      col[idx] = rgb[0];
      col[idx + 1] = rgb[1];
      col[idx + 2] = rgb[2];
    }
  }

  const indices = [];
  for (let iz = 0; iz < zSegs; iz++) {
    for (let ir = 0; ir < radSegs; ir++) {
      const a = iz * stride + ir;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/**
 * Builds a razor-sharp, smooth-normal lofted surface patch conforming directly to the fuselage station profile
 * at a small outward radial offset (`radialOffset = 0.016m`), eliminating any vertex-color stair-stepping.
 */
function buildFuselageConformingPatch(zStart, zEnd, zSteps, phiMin, phiMax, phiSteps, radialOffset = 0.016, mirrorBothSides = true) {
  const parts = [];
  const sides = mirrorBothSides ? [-1, 1] : [1];
  for (const side of sides) {
    const stride = phiSteps + 1;
    const numVerts = (zSteps + 1) * stride;
    const pos = new Float32Array(numVerts * 3);
    const nrm = new Float32Array(numVerts * 3);
    for (let iz = 0; iz <= zSteps; iz++) {
      const uz = iz / zSteps;
      const z = zStart + (zEnd - zStart) * uz;
      const st = sampleFuselageStation(z);
      for (let ip = 0; ip <= phiSteps; ip++) {
        const up = ip / phiSteps;
        const phi = side * (phiMin + (phiMax - phiMin) * up);
        const sp = Math.sin(phi);
        const cp = Math.cos(phi);
        const x = (st.rx + radialOffset) * sp;
        const y = st.yc + (st.ry + radialOffset) * cp;
        const nx = sp;
        const ny = cp;
        const idx = (iz * stride + ip) * 3;
        pos[idx] = x;
        pos[idx + 1] = y;
        pos[idx + 2] = z;
        nrm[idx] = nx;
        nrm[idx + 1] = ny;
        nrm[idx + 2] = 0;
      }
    }
    const indices = [];
    for (let iz = 0; iz < zSteps; iz++) {
      for (let ip = 0; ip < phiSteps; ip++) {
        const a = iz * stride + ip;
        const b = a + stride;
        const c = b + 1;
        const d = a + 1;
        if (side > 0) {
          indices.push(a, b, d, b, c, d);
        } else {
          indices.push(a, d, b, b, d, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    g.setIndex(indices);
    parts.push([g, [1, 1, 1], null]);
  }
  return mergeParts(parts);
}

/**
 * Evaluates a supercritical NACA airfoil profile at parameter s in [0..1] (0 = trailing edge top -> 0.5 = leading edge -> 1.0 = trailing edge bottom).
 * Returns { uChord, yLocal, nyLocal, nzLocal } where uChord in [0 (LE) .. 1 (TE)].
 */
function evalSupercriticalAirfoil(s) {
  const theta = s * Math.PI * 2;
  // u = 0 at leading edge (s = 0.5), u = 1 at trailing edge (s = 0 or 1)
  const u = 0.5 * (1.0 + Math.cos(theta));
  const yt = 5.0 * (
    0.2969 * Math.sqrt(Math.max(1e-5, u)) -
    0.1260 * u -
    0.3516 * u * u +
    0.2843 * u * u * u -
    0.1015 * u * u * u * u
  );
  // Supercritical camber: flatter upper surface, aft reflex camber
  const yc = 0.022 * (1.0 - u) * u * (1.4 - 0.8 * u);
  const sign = s < 0.5 ? 1 : -1;
  const yLocal = yc + sign * yt * (s < 0.5 ? 1.05 : 0.82);

  // Analytical 2D profile normal (pointing outward from airfoil)
  const nzLocal = -Math.cos(theta * 0.5);
  const nyLocal = sign * Math.max(0.25, Math.sin(theta * 0.5));
  const nl = Math.hypot(nyLocal, nzLocal) || 1;
  return { u, yLocal, nyLocal: nyLocal / nl, nzLocal: nzLocal / nl };
}

/**
 * Builds a multi-station lofted supercritical airfoil wing + blended upturned sharklet / raked wingtip
 * with smooth analytical normals across all spanwise stations and airfoil loop vertices.
 * Can build inner+outer wing (startStation..endStation) so main wing and livery sharklet share a seamless boundary!
 */
function buildLoftedAirfoilWingGeometry(side, stationList, profSegs = 22) {
  const sSign = side >= 0 ? 1 : -1;
  const nStat = stationList.length;
  const stride = profSegs + 1;
  const pos = [];
  const nrm = [];

  const profile = [];
  for (let ip = 0; ip <= profSegs; ip++) {
    profile.push(evalSupercriticalAirfoil(ip / profSegs));
  }

  for (let is = 0; is < nStat; is++) {
    const st = stationList[is];
    const stPrev = stationList[Math.max(0, is - 1)];
    const stNext = stationList[Math.min(nStat - 1, is + 1)];
    const dxSpan = (stNext.x - stPrev.x) * sSign;
    const dySpan = stNext.y - stPrev.y;
    const spanLen = Math.hypot(dxSpan, dySpan) || 1;
    // Outward normal rotation in (X, Y) plane for canted sharklet tips
    const upX = (-dySpan / spanLen) * sSign;
    const upY = (dxSpan * sSign) / spanLen;

    const zLE = st.z + st.chord * 0.46;
    const zTE = st.z - st.chord * 0.54;

    for (let ip = 0; ip <= profSegs; ip++) {
      const pf = profile[ip];
      const z = zLE + (zTE - zLE) * pf.u;
      const offsetThick = pf.yLocal * st.thick;
      const x = sSign * st.x + upX * offsetThick;
      const y = st.y + upY * offsetThick;

      const nx = upX * pf.nyLocal;
      const ny = upY * pf.nyLocal;
      const nz = pf.nzLocal;
      const nl = Math.hypot(nx, ny, nz) || 1;

      pos.push(x, y, z);
      nrm.push(nx / nl, ny / nl, nz / nl);
    }
  }

  const indices = [];
  for (let is = 0; is < nStat - 1; is++) {
    for (let ip = 0; ip < profSegs; ip++) {
      const a = is * stride + ip;
      const b = (is + 1) * stride + ip;
      const c = b + 1;
      const d = a + 1;
      if (sSign > 0) {
        indices.push(a, b, d, b, c, d);
      } else {
        indices.push(a, d, b, b, d, c);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

const MAIN_WING_STATIONS = [
  { x: 1.85, y: 2.48, z: 2.65, chord: 7.40, thick: 0.92 },
  { x: 4.20, y: 2.62, z: 1.65, chord: 6.20, thick: 0.76 },
  { x: 7.20, y: 2.82, z: 0.40, chord: 5.10, thick: 0.62 },
  { x: 10.60, y: 3.06, z: -1.05, chord: 4.15, thick: 0.48 },
  { x: 14.20, y: 3.36, z: -2.65, chord: 3.25, thick: 0.36 },
  { x: 17.60, y: 3.70, z: -4.25, chord: 2.40, thick: 0.26 },
  { x: 20.60, y: 4.12, z: -5.75, chord: 1.65, thick: 0.18 },
];

const SHARKLET_STATIONS = [
  { x: 20.60, y: 4.12, z: -5.75, chord: 1.65, thick: 0.18 },
  { x: 21.45, y: 4.58, z: -6.45, chord: 1.28, thick: 0.14 },
  { x: 22.15, y: 5.18, z: -7.12, chord: 0.96, thick: 0.11 },
  { x: 22.65, y: 5.86, z: -7.75, chord: 0.64, thick: 0.08 },
];

const HSTAB_STATIONS = [
  { x: 0.65, y: 3.92, z: -18.10, chord: 3.55, thick: 0.38 },
  { x: 3.20, y: 4.08, z: -19.35, chord: 2.65, thick: 0.28 },
  { x: 5.60, y: 4.25, z: -20.65, chord: 1.85, thick: 0.19 },
  { x: 7.65, y: 4.44, z: -21.85, chord: 1.15, thick: 0.11 },
];

/**
 * Builds a smooth symmetrical-airfoil vertical stabilizer tail fin with curved dorsal fillet and analytical normals.
 */
function buildLoftedVerticalTailFinGeometry(stations, profSegs = 22) {
  const nStat = stations.length;
  const stride = profSegs + 1;
  const pos = [];
  const nrm = [];

  for (let is = 0; is < nStat; is++) {
    const st = stations[is];
    for (let ip = 0; ip <= profSegs; ip++) {
      const s = ip / profSegs;
      const theta = s * Math.PI * 2;
      const u = 0.5 * (1.0 + Math.cos(theta));
      const yt = 5.0 * (
        0.2969 * Math.sqrt(Math.max(1e-5, u)) -
        0.1260 * u -
        0.3516 * u * u +
        0.2843 * u * u * u -
        0.1015 * u * u * u * u
      );
      const sign = s < 0.5 ? 1 : -1;
      const x = sign * yt * st.thick;
      const z = st.zFront + (st.zRear - st.zFront) * u;
      const y = st.y;

      const nx = sign * Math.max(0.25, Math.sin(theta * 0.5));
      const nz = -Math.cos(theta * 0.5);
      const ny = is === nStat - 1 ? 0.25 : 0.04;
      const nl = Math.hypot(nx, ny, nz) || 1;

      pos.push(x, y, z);
      nrm.push(nx / nl, ny / nl, nz / nl);
    }
  }

  const indices = [];
  for (let is = 0; is < nStat - 1; is++) {
    for (let ip = 0; ip < profSegs; ip++) {
      const a = is * stride + ip;
      const b = (is + 1) * stride + ip;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

const VFIN_STATIONS = [
  { y: 4.10, zFront: -9.20, zRear: -19.40, thick: 0.42 },
  { y: 5.05, zFront: -12.60, zRear: -19.75, thick: 0.56 },
  { y: 7.40, zFront: -14.85, zRear: -20.55, thick: 0.46 },
  { y: 10.10, zFront: -16.95, zRear: -21.40, thick: 0.34 },
  { y: 12.65, zFront: -18.75, zRear: -22.25, thick: 0.20 },
];

const RUDDER_STRIPE_STATIONS = [
  { y: 4.50, zFront: -18.20, zRear: -19.55, thick: 0.58 },
  { y: 8.50, zFront: -19.65, zRear: -20.95, thick: 0.42 },
  { y: 12.55, zFront: -21.10, zRear: -22.28, thick: 0.22 },
];

/**
 * Builds a smooth barrel-curved outer engine nacelle cowling (thicker mid-chord, tapered intake & exhaust)
 * with analytical smooth normals.
 */
function buildBarrelNacelleGeometry(rIntake, rMax, rExhaust, length, radSegs = 36, zSegs = 14) {
  const pos = [];
  const nrm = [];
  const stride = radSegs + 1;

  const evalR = (u) => {
    // u = 0 (exhaust rear) .. 1 (intake front)
    const arch = Math.sin(u * Math.PI);
    const base = rExhaust + (rIntake - rExhaust) * u;
    return base + (rMax - Math.max(rIntake, rExhaust)) * Math.pow(arch, 0.85);
  };

  for (let iz = 0; iz <= zSegs; iz++) {
    const u = iz / zSegs;
    const z = (u - 0.5) * length;
    const r = evalR(u);
    const rPrev = evalR(Math.max(0, u - 0.05));
    const rNext = evalR(Math.min(1, u + 0.05));
    const dr_dz = (rNext - rPrev) / (0.10 * length);

    for (let ir = 0; ir <= radSegs; ir++) {
      const phi = (ir / radSegs) * Math.PI * 2;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      const x = r * sp;
      const y = r * cp;

      let nx = sp;
      let ny = cp;
      let nz = -dr_dz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      pos.push(x, y, z);
      nrm.push(nx / nl, ny / nl, nz / nl);
    }
  }

  const indices = [];
  for (let iz = 0; iz < zSegs; iz++) {
    for (let ir = 0; ir < radSegs; ir++) {
      const a = iz * stride + ir;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/**
 * Builds a hollow open-ended cylinder (intake throat / exhaust nozzle) with smooth analytical normals.
 */
function cylOpen(rt, rb, h, seg = 32) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, true);
}

/**
 * Builds a 14-tooth Boeing 787 / GEnx serrated chevron ring at the rear of the nacelle.
 */
function buildChevronNozzleRingGeometry(rFront, rRear, length, teeth = 14) {
  const segs = teeth * 4;
  const pos = [];
  const nrm = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const phi = u * Math.PI * 2;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    const wave = 0.5 * (1 - Math.cos(u * teeth * Math.PI * 2));
    const zBack = -length * (0.45 + 0.55 * wave);
    const rB = rRear + (rFront - rRear) * (0.25 * (1 - wave));
    pos.push(rFront * sp, rFront * cp, 0);
    nrm.push(sp, cp, 0.08);
    pos.push(rB * sp, rB * cp, zBack);
    nrm.push(sp, cp, -0.12);
  }
  const indices = [];
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/**
 * Instanced geometries `{ plane, planeTail }` for PlacesSystem and LiveSky.
 * Represents a sleek Boeing 787 / Airbus A350 wide-body airliner (nose +Z, wheels at y=0).
 */
export function buildAirlinerInstancedGeometries() {
  const white = [0.97, 0.98, 1.0];
  const pearl = [0.88, 0.90, 0.94];
  const wingGrey = [0.84, 0.87, 0.91];
  const chrome = [0.78, 0.82, 0.88];
  const darkGlass = [0.06, 0.10, 0.16];
  const tireDark = [0.11, 0.12, 0.14];
  const strutSteel = [0.62, 0.66, 0.72];
  const exhaustDark = [0.22, 0.25, 0.30];
  const flapRed = [0.82, 0.18, 0.16];

  const bodyParts = [];

  // 1. Continuous Smooth Lofted Widebody Fuselage + Multi-Pane Framed Cockpit Windscreen & Cheatline
  bodyParts.push([buildLoftedFuselageGeometry(40, 28), [1, 1, 1], null]);
  // 6 distinct cockpit window panes separated by crisp white structural mullions
  for (let w = 0; w < 3; w++) {
    const p0 = 0.04 + w * 0.31;
    const p1 = p0 + 0.25;
    const z0 = 20.05 - w * 1.15;
    const z1 = z0 - 0.98;
    bodyParts.push([buildFuselageConformingPatch(z1, z0, 3, p0, p1, 4, 0.020, true), darkGlass, null]);
  }
  bodyParts.push([buildFuselageConformingPatch(-15.8, 15.4, 20, 1.48, 1.62, 3, 0.015, true), [0.0, 0.64, 0.88], null]);

  // 4 Passenger Doors per side with silver frames
  for (const dz of [14.6, 6.5, -4.8, -15.2]) {
    bodyParts.push([buildFuselageConformingPatch(dz - 0.52, dz + 0.52, 2, 1.18, 1.66, 3, 0.019, true), chrome, null]);
    bodyParts.push([buildFuselageConformingPatch(dz - 0.44, dz + 0.44, 2, 1.21, 1.63, 3, 0.022, true), white, null]);
  }

  // Dorsal SATCOM blister & VHF blade antennas + hollow APU exhaust bore
  bodyParts.push([buildBarrelNacelleGeometry(0.12, 0.34, 0.10, 2.2, 14, 6), white, mat(0, 5.74, 4.5, 0, 0, 0, 1.1, 0.42, 1.0)]);
  for (const az of [9.5, -3.5, -11.0]) {
    bodyParts.push([box(0.04, 0.38, 0.52), white, mat(0, 5.82, az, -0.28, 0, 0)]);
  }
  bodyParts.push([cylOpen(0.32, 0.24, 0.65, 20), chrome, mat(0, 4.12, -24.15, Math.PI / 2, 0, 0)]);
  bodyParts.push([cyl(0.23, 0.23, 0.12, 18), tireDark, mat(0, 4.12, -23.95, Math.PI / 2, 0, 0)]);

  // 2. Smooth Lofted Supercritical Airfoil Wings + Horizontal Stabilizers + 5 Flap Fairings + Hollow Turbofan Nacelles
  for (const s of [-1, 1]) {
    bodyParts.push([buildLoftedAirfoilWingGeometry(s, MAIN_WING_STATIONS, 20), wingGrey, null]);
    bodyParts.push([buildLoftedAirfoilWingGeometry(s, HSTAB_STATIONS, 16), wingGrey, null]);

    // 5 Streamlined teardrop flap-track fairing canoes under trailing edge
    for (const [fx, fy, fz, fl] of [
      [4.2, 2.34, -0.3, 2.75],
      [7.4, 2.52, -1.4, 2.45],
      [10.8, 2.76, -2.7, 2.15],
      [14.2, 3.08, -4.1, 1.80],
      [17.6, 3.38, -5.2, 1.35],
    ]) {
      bodyParts.push([buildBarrelNacelleGeometry(0.06, 0.17, 0.04, fl, 14, 6), pearl, mat(s * fx, fy, fz)]);
      bodyParts.push([cone(0.07, 0.28, 12), flapRed, mat(s * fx, fy, fz - fl * 0.52, -Math.PI / 2, 0, 0)]);
    }

    // High-Bypass Turbofan Engine Pods with TRUE HOLLOW INTAKE LIP & 22-Blade Fan
    const ex = s * 6.9;
    const ey = 1.68;
    const ez = 3.45;
    bodyParts.push([box(0.28, 0.96, 2.95), pearl, mat(ex, ey + 0.88, ez - 0.45, 0.12, 0, 0)]);
    bodyParts.push([buildBarrelNacelleGeometry(1.14, 1.28, 1.06, 3.65, 32, 12), white, mat(ex, ey, ez)]);
    // Hollow torus intake lip + open-ended recessed dark throat liner
    bodyParts.push([new THREE.TorusGeometry(1.10, 0.09, 14, 32), chrome, mat(ex, ey, ez + 1.84)]);
    bodyParts.push([cylOpen(1.06, 1.02, 0.58, 28), tireDark, mat(ex, ey, ez + 1.56, Math.PI / 2, 0, 0)]);
    bodyParts.push([cyl(1.02, 1.02, 0.10, 24), tireDark, mat(ex, ey, ez + 1.32, Math.PI / 2, 0, 0)]);
    bodyParts.push([cone(0.36, 0.78, 20), tireDark, mat(ex, ey, ez + 1.62, Math.PI / 2, 0, 0)]);
    bodyParts.push([cone(0.13, 0.28, 14), chrome, mat(ex, ey, ez + 1.90, Math.PI / 2, 0, 0)]);
    for (let b = 0; b < 18; b++) {
      const ang = (b / 18) * Math.PI * 2;
      bodyParts.push([
        box(0.13, 0.92, 0.03),
        chrome,
        mat(ex + Math.cos(ang) * 0.52, ey + Math.sin(ang) * 0.52, ez + 1.48, 0, 0.42, ang + 0.3),
      ]);
    }
    bodyParts.push([buildChevronNozzleRingGeometry(1.06, 0.84, 0.65, 14), white, mat(ex, ey, ez - 1.80)]);
    bodyParts.push([cylOpen(0.96, 0.74, 0.95, 24), chrome, mat(ex, ey, ez - 2.15, Math.PI / 2, 0, 0)]);
    bodyParts.push([cone(0.52, 1.25, 20), exhaustDark, mat(ex, ey, ez - 2.82, -Math.PI / 2, 0, 0)]);
  }

  // 3. Complete Tricycle Landing Gear (resting at y = 0)
  bodyParts.push([cyl(0.14, 0.12, 1.65, 14), strutSteel, mat(0, 1.25, 15.8)]);
  bodyParts.push([box(0.28, 0.45, 0.22), strutSteel, mat(0, 1.15, 16.0, 0.35, 0, 0)]);
  for (const s of [-1, 1]) {
    bodyParts.push([cyl(0.44, 0.44, 0.24, 18), tireDark, mat(s * 0.28, 0.44, 15.8, 0, 0, Math.PI / 2)]);
    bodyParts.push([cyl(0.20, 0.20, 0.26, 14), chrome, mat(s * 0.28, 0.44, 15.8, 0, 0, Math.PI / 2)]);
  }
  for (const s of [-1, 1]) {
    const gx = s * 3.65;
    const gz = -0.4;
    bodyParts.push([cyl(0.20, 0.18, 2.05, 14), strutSteel, mat(gx, 1.55, gz)]);
    bodyParts.push([box(1.1, 0.14, 0.14), strutSteel, mat(gx - s * 0.45, 1.85, gz, 0, 0, s * 0.55)]);
    bodyParts.push([box(0.26, 0.22, 1.85), strutSteel, mat(gx, 0.58, gz)]);
    for (const wx of [-0.42, 0.42]) {
      for (const wz of [-0.62, 0.62]) {
        bodyParts.push([cyl(0.58, 0.58, 0.34, 18), tireDark, mat(gx + wx, 0.58, gz + wz, 0, 0, Math.PI / 2)]);
        bodyParts.push([cyl(0.26, 0.26, 0.36, 14), chrome, mat(gx + wx, 0.58, gz + wz, 0, 0, Math.PI / 2)]);
      }
    }
  }

  // 4. Tinted Livery Tail Fin + Blended Sharklet Winglets (`planeTail`)
  const tailParts = [
    [buildLoftedVerticalTailFinGeometry(VFIN_STATIONS, 22), [1, 1, 1], null],
  ];
  for (const s of [-1, 1]) {
    tailParts.push([buildLoftedAirfoilWingGeometry(s, SHARKLET_STATIONS, 18), [1, 1, 1], null]);
    tailParts.push([buildBarrelNacelleGeometry(1.24, 1.29, 1.22, 1.25, 32, 6), [1, 1, 1], mat(s * 6.9, 1.68, 3.65)]);
  }

  return {
    plane: mergeParts(bodyParts),
    planeTail: mergeParts(tailParts),
  };
}

export const buildStaticAirlinerGeometries = buildAirlinerInstancedGeometries;

/**
 * Creates a full articulated Three.js Group for the playable Boeing 787 / Airbus A350 airliner
 * or hero airport gate airliners.
 */
export function createHeroAirlinerModel(liveryOrIdx = 0, scale = 1.35) {
  const livery =
    typeof liveryOrIdx === "object" && liveryOrIdx !== null
      ? liveryOrIdx
      : AIRLINER_LIVERIES[Math.abs(liveryOrIdx | 0) % AIRLINER_LIVERIES.length];

  const isA350 = livery.variant === "airbusA350";

  const group = new THREE.Group();
  group.name = `airliner_${livery.id}`;
  group.rotation.order = "YXZ";

  const cBelly = new THREE.Color(livery.bellyHex || 0xdce3ec);
  const cStripe = new THREE.Color(livery.stripeHex || 0x00a3e0);

  // Glossy aviation paint materials with envProbe reflections
  const fuseMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.18,
    metalness: 0.14,
  });
  fuseMat.userData = { envProbe: true };

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8faff,
    roughness: 0.18,
    metalness: 0.14,
  });
  whiteMat.userData = { envProbe: true };

  const bellyMat = new THREE.MeshStandardMaterial({
    color: livery.bellyHex || 0xdce3ec,
    roughness: 0.22,
    metalness: 0.18,
  });
  bellyMat.userData = { envProbe: true };

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xe6ebf2,
    roughness: 0.22,
    metalness: 0.22,
  });
  wingMat.userData = { envProbe: true };

  const liveryMat = new THREE.MeshStandardMaterial({
    color: livery.tailHex,
    roughness: 0.18,
    metalness: 0.20,
  });
  liveryMat.userData = { envProbe: true };

  const stripeMat = new THREE.MeshStandardMaterial({
    color: livery.stripeHex,
    roughness: 0.18,
    metalness: 0.24,
  });
  stripeMat.userData = { envProbe: true };

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.16,
    metalness: 0.78,
  });
  chromeMat.userData = { envProbe: true };

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0d1f33,
    roughness: 0.06,
    metalness: 0.38,
    transparent: true,
    opacity: 0.76,
  });
  glassMat.userData = { envProbe: true };

  const maskMat = new THREE.MeshStandardMaterial({
    color: 0x11161f,
    roughness: 0.22,
    metalness: 0.25,
  });

  const cabinWinMat = new THREE.MeshStandardMaterial({
    color: 0x182638,
    emissive: 0xffdfa8,
    emissiveIntensity: 0.35,
    roughness: 0.16,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16191e,
    roughness: 0.82,
    metalness: 0.08,
  });
  const strutMat = new THREE.MeshStandardMaterial({
    color: 0xb0b8c4,
    roughness: 0.26,
    metalness: 0.65,
  });
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x383f4a,
    roughness: 0.36,
    metalness: 0.58,
  });
  const yellowStrapMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const redCanoeMat = new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.28, metalness: 0.22 });

  // --- 1. Airframe Group (Lofted Fuselage, Supercritical Airfoil Wings, Tail, Nacelles) ---
  const airframe = new THREE.Group();
  airframe.name = "airframe";
  group.add(airframe);

  // Continuous Smooth Lofted Fuselage (48 radial segments × 32 axial stations)
  const fuseGeo = buildLoftedFuselageGeometry(48, 32, {
    white: [0.98, 0.99, 1.0],
    belly: [cBelly.r, cBelly.g, cBelly.b],
    stripe: [cStripe.r, cStripe.g, cStripe.b],
    glass: [0.05, 0.09, 0.15],
    win: [0.14, 0.22, 0.34],
    chrome: [0.80, 0.84, 0.90],
    apu: [0.28, 0.32, 0.38],
  });
  const fuseMesh = new THREE.Mesh(fuseGeo, fuseMat);
  fuseMesh.castShadow = true;
  fuseMesh.receiveShadow = true;
  airframe.add(fuseMesh);

  // --- Multi-Pane Framed Cockpit Windscreen + Interior Flight Deck & Pilots ---
  // Signature A350 curved black mask bezel surround (or 787 silver window surround)
  if (isA350) {
    const maskGeo = buildFuselageConformingPatch(16.05, 20.25, 10, -1.04, 1.04, 18, 0.014, false);
    const mPos = maskGeo.attributes.position;
    for (let i = 0; i < mPos.count; i++) {
      const z = mPos.getZ(i);
      const u = (z - 16.05) / (20.25 - 16.05);
      const yCenter = 3.88 - 0.26 * u;
      const halfH = 0.33 * (1.0 - 0.25 * u);
      const curY = mPos.getY(i);
      mPos.setY(i, Math.max(yCenter - halfH, Math.min(yCenter + halfH, curY)));
    }
    airframe.add(new THREE.Mesh(maskGeo, maskMat));
  }

  // 6 distinct angled cockpit glazing panes (3 per side) separated by crisp structural window posts
  const paneSpecs = [
    { z0: 19.05, z1: 20.08, p0: 0.045, p1: 0.33, yOff: 0.0 },
    { z0: 17.80, z1: 18.92, p0: 0.37, p1: 0.66, yOff: 0.02 },
    { z0: 16.48, z1: 17.68, p0: 0.70, p1: 0.98, yOff: 0.03 },
  ];
  const paneParts = [];
  const postParts = [];
  // Center windshield structural divider post
  postParts.push([buildFuselageConformingPatch(18.95, 20.12, 4, -0.042, 0.042, 2, 0.028, false), [1, 1, 1], null]);

  for (const ps of paneSpecs) {
    const gPane = buildFuselageConformingPatch(ps.z0, ps.z1, 4, ps.p0, ps.p1, 5, 0.021, true);
    const pPos = gPane.attributes.position;
    for (let i = 0; i < pPos.count; i++) {
      const z = pPos.getZ(i);
      const u = (z - 16.2) / (20.1 - 16.2);
      const yCenter = 3.88 - 0.26 * u + ps.yOff;
      const halfH = 0.25 * (1.0 - 0.22 * u);
      const curY = pPos.getY(i);
      pPos.setY(i, Math.max(yCenter - halfH, Math.min(yCenter + halfH, curY)));
    }
    paneParts.push([gPane, [1, 1, 1], null]);

    // Structural window post mullion aft of each pane
    const gPost = buildFuselageConformingPatch(ps.z0 - 0.11, ps.z0 + 0.02, 2, ps.p0 - 0.03, ps.p1 + 0.03, 3, 0.028, true);
    const mPos = gPost.attributes.position;
    for (let i = 0; i < mPos.count; i++) {
      const z = mPos.getZ(i);
      const u = (z - 16.2) / (20.1 - 16.2);
      const yCenter = 3.88 - 0.26 * u + ps.yOff;
      const halfH = 0.27 * (1.0 - 0.22 * u);
      const curY = mPos.getY(i);
      mPos.setY(i, Math.max(yCenter - halfH, Math.min(yCenter + halfH, curY)));
    }
    postParts.push([gPost, [1, 1, 1], null]);
  }
  airframe.add(new THREE.Mesh(mergeParts(paneParts), glassMat));
  airframe.add(new THREE.Mesh(mergeParts(postParts), isA350 ? chromeMat : whiteMat));

  // Subtle interior flight-deck glareshield console & twin pilot silhouettes behind cockpit glass
  const flightDeck = new THREE.Group();
  flightDeck.position.set(0, 3.56, 18.55);
  const glareshield = new THREE.Mesh(box(1.55, 0.18, 0.95), maskMat);
  glareshield.position.set(0, 0.04, 0.45);
  flightDeck.add(glareshield);
  for (const sx of [-0.42, 0.42]) {
    const pilotTorso = new THREE.Mesh(cyl(0.16, 0.19, 0.36, 10), maskMat);
    pilotTorso.position.set(sx, 0.02, -0.10);
    const pilotHead = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), strutMat);
    pilotHead.position.set(sx, 0.26, -0.08);
    flightDeck.add(pilotTorso, pilotHead);
  }
  airframe.add(flightDeck);

  // Twin windshield wipers, chrome pitot probes & AOA vane sensors on forward fuselage
  for (const sx of [-1, 1]) {
    const wiperArm = new THREE.Mesh(box(0.34, 0.025, 0.03), maskMat);
    wiperArm.position.set(sx * 0.28, 3.44, 19.95);
    wiperArm.rotation.z = sx * -0.18;
    wiperArm.rotation.y = sx * -0.25;
    airframe.add(wiperArm);

    const pitot = new THREE.Mesh(cyl(0.012, 0.018, 0.38, 8), chromeMat);
    pitot.rotation.x = Math.PI / 2;
    pitot.position.set(sx * 1.18, 3.12, 20.55);
    airframe.add(pitot);

    const aoaVane = new THREE.Mesh(box(0.08, 0.04, 0.14), chromeMat);
    aoaVane.position.set(sx * 1.38, 3.24, 19.15);
    airframe.add(aoaVane);
  }

  // Razor-sharp conforming airline cheatline ribbon along both sides of the fuselage
  const cheatGeo = buildFuselageConformingPatch(-16.0, 15.6, 24, 1.48, 1.62, 4, 0.015, true);
  const cheatMesh = new THREE.Mesh(cheatGeo, stripeMat);
  airframe.add(cheatMesh);

  // --- 4 Passenger Entry Doors per Side + Starboard Cargo Bay Doors ---
  const doorFrameParts = [];
  const doorPanelParts = [];
  const doorWindowParts = [];
  const doorPositions = [14.6, 6.5, -4.8, -15.2];
  for (const dz of doorPositions) {
    doorFrameParts.push([buildFuselageConformingPatch(dz - 0.50, dz + 0.50, 2, 1.18, 1.66, 3, 0.020, true), [1, 1, 1], null]);
    doorPanelParts.push([buildFuselageConformingPatch(dz - 0.43, dz + 0.43, 2, 1.21, 1.63, 3, 0.024, true), [1, 1, 1], null]);
    doorWindowParts.push([buildFuselageConformingPatch(dz - 0.13, dz + 0.13, 2, 1.28, 1.37, 2, 0.028, true), [1, 1, 1], null]);
    for (const sx of [-1, 1]) {
      const st = sampleFuselageStation(dz);
      // Yellow safety strap across door window + exterior door handle/hinge fairing
      const strap = new THREE.Mesh(box(0.02, 0.035, 0.28), yellowStrapMat);
      strap.position.set(sx * (st.rx * Math.sin(1.42) + 0.032), st.yc + st.ry * Math.cos(1.42), dz);
      airframe.add(strap);

      const hinge = new THREE.Mesh(box(0.045, 0.22, 0.12), chromeMat);
      hinge.position.set(sx * (st.rx * Math.sin(1.48) + 0.034), st.yc + st.ry * Math.cos(1.48), dz + 0.44);
      airframe.add(hinge);
    }
  }
  // Forward & Aft Cargo Bay Doors on starboard lower belly (x < 0)
  for (const cz of [10.2, -8.6]) {
    doorFrameParts.push([buildFuselageConformingPatch(cz - 1.15, cz + 1.15, 3, -2.25, -1.78, 3, 0.020, false), [1, 1, 1], null]);
    doorPanelParts.push([buildFuselageConformingPatch(cz - 1.05, cz + 1.05, 3, -2.21, -1.82, 3, 0.024, false), [1, 1, 1], null]);
  }
  airframe.add(new THREE.Mesh(mergeParts(doorFrameParts), chromeMat));
  airframe.add(new THREE.Mesh(mergeParts(doorPanelParts), whiteMat));
  airframe.add(new THREE.Mesh(mergeParts(doorWindowParts), cabinWinMat));

  // Individual conforming dark-glass passenger cabin windows + silver oval window frames
  const winParts = [];
  const winFrameParts = [];
  for (let wz = -13.6; wz <= 13.8; wz += 0.82) {
    if (doorPositions.some((dz) => Math.abs(wz - dz) < 0.75)) continue;
    winFrameParts.push([buildFuselageConformingPatch(wz - 0.23, wz + 0.23, 2, 1.30, 1.43, 2, 0.015, true), [1, 1, 1], null]);
    winParts.push([buildFuselageConformingPatch(wz - 0.18, wz + 0.18, 2, 1.32, 1.41, 2, 0.019, true), [1, 1, 1], null]);
  }
  airframe.add(new THREE.Mesh(mergeParts(winFrameParts), chromeMat));
  airframe.add(new THREE.Mesh(mergeParts(winParts), cabinWinMat));

  // Sculpted Wing-to-Body Belly Fairing Contour + Dorsal SATCOM Blister & VHF Blade Antennas + APU Exhaust Bore
  const bellyFairingGeo = buildBarrelNacelleGeometry(1.45, 2.38, 1.35, 13.8, 28, 12);
  bellyFairingGeo.scale(1.02, 0.42, 1.0);
  const bellyFairing = new THREE.Mesh(bellyFairingGeo, bellyMat);
  bellyFairing.position.set(0, 1.72, 0.8);
  airframe.add(bellyFairing);

  const satcomGeo = buildBarrelNacelleGeometry(0.14, 0.36, 0.12, 2.35, 18, 8);
  satcomGeo.scale(1.15, 0.42, 1.0);
  const satcomMesh = new THREE.Mesh(satcomGeo, whiteMat);
  satcomMesh.position.set(0, 5.74, 4.5);
  airframe.add(satcomMesh);

  for (const [az, ah] of [[9.5, 0.42], [-3.5, 0.38], [-11.0, 0.36]]) {
    const vhf = new THREE.Mesh(box(0.035, ah, 0.54), whiteMat);
    vhf.position.set(0, 5.82, az);
    vhf.rotation.x = -0.32;
    airframe.add(vhf);
  }

  // Hollow stainless APU tailcone exhaust bore at z = -24.2m
  const apuTube = new THREE.Mesh(cylOpen(0.32, 0.24, 0.72, 22), chromeMat);
  apuTube.rotation.x = Math.PI / 2;
  apuTube.position.set(0, 4.12, -24.15);
  const apuBore = new THREE.Mesh(cyl(0.23, 0.23, 0.14, 18), tireMat);
  apuBore.rotation.x = Math.PI / 2;
  apuBore.position.set(0, 4.12, -23.92);
  airframe.add(apuTube, apuBore);

  // Swept Supercritical NACA Airfoil Wings + Blended Sharklets + Horizontal Stabilizers
  const wingGeoPos = buildLoftedAirfoilWingGeometry(1, MAIN_WING_STATIONS, 24);
  const wingGeoNeg = buildLoftedAirfoilWingGeometry(-1, MAIN_WING_STATIONS, 24);
  const sharkGeoPos = buildLoftedAirfoilWingGeometry(1, SHARKLET_STATIONS, 20);
  const sharkGeoNeg = buildLoftedAirfoilWingGeometry(-1, SHARKLET_STATIONS, 20);
  const hStabGeoPos = buildLoftedAirfoilWingGeometry(1, HSTAB_STATIONS, 18);
  const hStabGeoNeg = buildLoftedAirfoilWingGeometry(-1, HSTAB_STATIONS, 18);

  for (const [s, wGeo, shGeo, hsGeo] of [
    [1, wingGeoPos, sharkGeoPos, hStabGeoPos],
    [-1, wingGeoNeg, sharkGeoNeg, hStabGeoNeg],
  ]) {
    const wingMesh = new THREE.Mesh(wGeo, wingMat);
    wingMesh.castShadow = true;
    wingMesh.receiveShadow = true;
    airframe.add(wingMesh);

    const sharkletMesh = new THREE.Mesh(shGeo, liveryMat);
    sharkletMesh.castShadow = true;
    airframe.add(sharkletMesh);

    const hStabMesh = new THREE.Mesh(hsGeo, wingMat);
    hStabMesh.castShadow = true;
    airframe.add(hStabMesh);

    // 5 Aerodynamic Flap-Track Fairing Canoes under each wing trailing edge
    for (const [fx, fy, fz, fl] of [
      [4.2, 2.34, -0.3, 2.85],
      [7.4, 2.52, -1.4, 2.50],
      [10.8, 2.76, -2.7, 2.20],
      [14.2, 3.08, -4.1, 1.85],
      [17.6, 3.38, -5.2, 1.38],
    ]) {
      const pod = new THREE.Mesh(buildBarrelNacelleGeometry(0.06, 0.17, 0.05, fl, 16, 8), bellyMat);
      pod.position.set(s * fx, fy, fz);
      airframe.add(pod);
      const podTip = new THREE.Mesh(cone(0.075, 0.30, 12), redCanoeMat);
      podTip.rotation.x = -Math.PI / 2;
      podTip.position.set(s * fx, fy, fz - fl * 0.52);
      airframe.add(podTip);
    }
  }

  // Smooth Lofted Airfoil Vertical Stabilizer Tail Fin + Rudder Accent Stripe
  const tailFin = new THREE.Mesh(buildLoftedVerticalTailFinGeometry(VFIN_STATIONS, 24), liveryMat);
  tailFin.castShadow = true;
  airframe.add(tailFin);

  const rudderStripe = new THREE.Mesh(buildLoftedVerticalTailFinGeometry(RUDDER_STRIPE_STATIONS, 18), stripeMat);
  airframe.add(rudderStripe);

  // --- 2. Twin Under-Wing High-Bypass Turbofan Engines (Trent XWB / GEnx with True Hollow Intake) ---
  const fans = [];
  const plumes = [];
  const engineFires = [];

  const cowlGeo = buildBarrelNacelleGeometry(1.16, 1.30, 1.08, 3.70, 36, 14);
  const cowlBandGeo = buildBarrelNacelleGeometry(1.26, 1.315, 1.24, 1.25, 36, 6);
  const chevronGeo = buildChevronNozzleRingGeometry(1.08, 0.88, 0.72, 14);

  for (const s of [-1, 1]) {
    const ex = s * 7.0;
    const ey = 1.72;
    const ez = 3.5;

    const engGroup = new THREE.Group();
    engGroup.position.set(ex, ey, ez);
    airframe.add(engGroup);

    // Swept aerodynamic pylon strut + twin vortex-generating nacelle strakes (chine fairings)
    const pylon = new THREE.Mesh(
      buildLoftedVerticalTailFinGeometry([
        { y: 0.45, zFront: 1.55, zRear: -2.05, thick: 0.24 },
        { y: 1.38, zFront: 0.75, zRear: -2.35, thick: 0.18 },
      ], 14),
      bellyMat
    );
    engGroup.add(pylon);

    for (const stSide of [-1, 1]) {
      const strake = new THREE.Mesh(box(0.28, 0.035, 1.15), whiteMat);
      strake.position.set(stSide * 1.12, 0.48, 0.65);
      strake.rotation.z = stSide * -0.42;
      engGroup.add(strake);
    }

    // Barrel-curved outer nacelle cowling
    const cowl = new THREE.Mesh(cowlGeo, whiteMat);
    cowl.castShadow = true;
    engGroup.add(cowl);

    // Livery band on engine nacelle
    const cowlBand = new THREE.Mesh(cowlBandGeo, liveryMat);
    cowlBand.position.z = 0.35;
    engGroup.add(cowlBand);

    // TRUE HOLLOW INTAKE LIP (`TorusGeometry` ring + open-ended recessed dark acoustic intake throat cylinder)
    const lipRing = new THREE.Mesh(new THREE.TorusGeometry(1.11, 0.095, 18, 36), chromeMat);
    lipRing.position.z = 1.86;
    engGroup.add(lipRing);

    const intakeThroat = new THREE.Mesh(cylOpen(1.08, 1.03, 0.68, 36), tireMat);
    intakeThroat.rotation.x = Math.PI / 2;
    intakeThroat.position.z = 1.54;
    engGroup.add(intakeThroat);

    // Recessed Spinning Turbofan Rotor Assembly (`fanGroup` with 22 twisted titanium fan blades + spiral spinner)
    const fanGroup = new THREE.Group();
    fanGroup.position.z = 1.48;
    engGroup.add(fanGroup);

    const throatBackplate = new THREE.Mesh(cyl(1.03, 1.03, 0.10, 32), tireMat);
    throatBackplate.rotation.x = Math.PI / 2;
    throatBackplate.position.z = -0.14;
    fanGroup.add(throatBackplate);

    const spinner = new THREE.Mesh(cone(0.36, 0.78, 24), tireMat);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.24;
    fanGroup.add(spinner);

    const spinnerTip = new THREE.Mesh(cone(0.13, 0.28, 16), chromeMat);
    spinnerTip.rotation.x = Math.PI / 2;
    spinnerTip.position.z = 0.52;
    fanGroup.add(spinnerTip);

    // White spiral swirl stripe on conical turbofan spinner
    for (let sp = 0; sp < 8; sp++) {
      const t = sp / 8;
      const ang = t * Math.PI * 2.2;
      const rSp = (1 - t * 0.78) * 0.29;
      const swirlDot = new THREE.Mesh(box(0.048, 0.025, 0.09), whiteMat);
      swirlDot.position.set(Math.cos(ang) * rSp, Math.sin(ang) * rSp, 0.02 + t * 0.42);
      swirlDot.rotation.z = ang + 0.55;
      fanGroup.add(swirlDot);
    }

    // 22 twisted titanium fan blades with chrome leading-edge sheen
    const bladeGeo = box(0.14, 0.96, 0.032);
    for (let b = 0; b < 22; b++) {
      const ang = (b / 22) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, chromeMat);
      blade.position.set(Math.cos(ang) * 0.53, Math.sin(ang) * 0.53, 0.02);
      blade.rotation.z = ang + 0.34;
      blade.rotation.y = 0.48;
      fanGroup.add(blade);
    }
    fans.push(fanGroup);

    // 787 Serrated Chevron Rear Nacelle Lip + Stepped Bypass Duct & Core Exhaust Nozzle Cone
    const chevronLip = new THREE.Mesh(chevronGeo, isA350 ? chromeMat : whiteMat);
    chevronLip.position.z = -1.80;
    engGroup.add(chevronLip);

    const nozzle = new THREE.Mesh(cylOpen(0.98, 0.76, 1.05, 28), chromeMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -2.25;
    engGroup.add(nozzle);

    const coreCone = new THREE.Mesh(cone(0.54, 1.38, 24), exhaustMat);
    coreCone.rotation.x = -Math.PI / 2;
    coreCone.position.z = -2.95;
    engGroup.add(coreCone);

    // Jet Thrust / Afterburner Plume (`plumeGroup`)
    const plumeGroup = new THREE.Group();
    plumeGroup.position.z = -2.85;
    plumeGroup.visible = false;
    const outerPlumeGeo = cone(0.88, 6.5, 16);
    outerPlumeGeo.rotateX(-Math.PI / 2);
    outerPlumeGeo.translate(0, 0, -3.25);
    const outerPlumeMat = new THREE.MeshBasicMaterial({
      color: 0x3898ff,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerPlumeGeo = cone(0.52, 4.2, 14);
    innerPlumeGeo.rotateX(-Math.PI / 2);
    innerPlumeGeo.translate(0, 0, -2.1);
    const innerPlumeMat = new THREE.MeshBasicMaterial({
      color: 0xe0f4ff,
      transparent: true,
      opacity: 0.80,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    plumeGroup.add(new THREE.Mesh(outerPlumeGeo, outerPlumeMat), new THREE.Mesh(innerPlumeGeo, innerPlumeMat));
    engGroup.add(plumeGroup);
    plumes.push(plumeGroup);

    // Engine Fire & Damage Rig (`fireGroup`, hidden when healthy)
    const fireGroup = new THREE.Group();
    fireGroup.position.set(0, 0.2, -1.2);
    fireGroup.visible = false;
    const fireOuterGeo = cone(1.55, 7.5, 12);
    fireOuterGeo.rotateX(-Math.PI / 2);
    fireOuterGeo.translate(0, 0.3, -3.5);
    const fireOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fireInnerGeo = cone(0.95, 4.6, 10);
    fireInnerGeo.rotateX(-Math.PI / 2);
    fireInnerGeo.translate(0, 0.2, -2.1);
    const fireInnerMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    fireGroup.add(new THREE.Mesh(fireOuterGeo, fireOuterMat), new THREE.Mesh(fireInnerGeo, fireInnerMat));
    engGroup.add(fireGroup);
    engineFires.push(fireGroup);
  }

  // --- 3. Multi-Link Retractable Tricycle Landing Gear (`gearGroup`) ---
  const gearGroup = new THREE.Group();
  gearGroup.name = "landing_gear";
  group.add(gearGroup);

  // Recessed dark Nose Gear-Bay Well Liner
  const noseWell = new THREE.Mesh(box(0.92, 0.18, 1.55), tireMat);
  noseWell.position.set(0, 2.02, 15.8);
  gearGroup.add(noseWell);

  // Steerable Nose Gear Pivot at z = +15.8m
  const noseGearPivot = new THREE.Group();
  noseGearPivot.position.set(0, 2.15, 15.8);
  gearGroup.add(noseGearPivot);

  const noseStrutUpper = new THREE.Mesh(cyl(0.16, 0.15, 1.15, 16), strutMat);
  noseStrutUpper.position.set(0, -0.55, 0);
  const noseStrutPiston = new THREE.Mesh(cyl(0.11, 0.11, 0.72, 14), chromeMat);
  noseStrutPiston.position.set(0, -1.35, 0);
  noseGearPivot.add(noseStrutUpper, noseStrutPiston);

  // Dual hydraulic steering actuator cylinders + scissor torque links + forward drag brace
  for (const s of [-1, 1]) {
    const steerCyl = new THREE.Mesh(cyl(0.045, 0.045, 0.36, 10), chromeMat);
    steerCyl.position.set(s * 0.18, -0.52, 0.12);
    steerCyl.rotation.z = s * 0.35;
    noseGearPivot.add(steerCyl);
  }
  const noseTorqueUpper = new THREE.Mesh(box(0.18, 0.34, 0.08), strutMat);
  noseTorqueUpper.position.set(0, -1.02, -0.18);
  noseTorqueUpper.rotation.x = -0.52;
  const noseTorqueLower = new THREE.Mesh(box(0.18, 0.34, 0.08), strutMat);
  noseTorqueLower.position.set(0, -1.32, -0.18);
  noseTorqueLower.rotation.x = 0.52;
  const noseDragBrace = new THREE.Mesh(cyl(0.05, 0.05, 1.15, 10), strutMat);
  noseDragBrace.position.set(0, -0.52, 0.38);
  noseDragBrace.rotation.x = 0.62;
  noseGearPivot.add(noseTorqueUpper, noseTorqueLower, noseDragBrace);

  // Open nose gear bay doors with actuator struts
  for (const s of [-1, 1]) {
    const nDoor = new THREE.Mesh(box(0.08, 0.72, 1.45), bellyMat);
    nDoor.position.set(s * 0.48, -0.25, 0.05);
    noseGearPivot.add(nDoor);
  }

  // Twin Nose Tires + Alloy Hubs + Brake Discs
  const allWheels = [];
  for (const s of [-1, 1]) {
    const nw = new THREE.Mesh(cyl(0.46, 0.46, 0.25, 22), tireMat);
    nw.rotation.z = Math.PI / 2;
    nw.position.set(s * 0.30, -1.69, 0);
    const nh = new THREE.Mesh(cyl(0.22, 0.22, 0.27, 16), chromeMat);
    nw.add(nh);
    noseGearPivot.add(nw);
    allWheels.push(nw);
  }

  // Nose-gear dual taxi/landing spotlight bulbs
  const taxiLampMat = new THREE.MeshBasicMaterial({ color: 0xfff8dc });
  for (const s of [-0.11, 0.11]) {
    const taxiLamp = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 10), taxiLampMat);
    taxiLamp.position.set(s, -0.68, 0.20);
    noseGearPivot.add(taxiLamp);
  }

  // Port & Starboard Main Landing Gear Bogies (x = ±3.7m, z = -0.4m)
  const mainGearLeft = new THREE.Group();
  const mainGearRight = new THREE.Group();
  for (const [s, mg] of [
    [1, mainGearLeft],
    [-1, mainGearRight],
  ]) {
    // Inner main gear-bay well liner
    const mainWell = new THREE.Mesh(box(1.35, 0.22, 2.35), tireMat);
    mainWell.position.set(s * 3.45, 2.25, -0.4);
    gearGroup.add(mainWell);

    mg.position.set(s * 3.7, 2.45, -0.4);
    gearGroup.add(mg);

    const mStrutUpper = new THREE.Mesh(cyl(0.22, 0.20, 1.32, 16), strutMat);
    mStrutUpper.position.set(0, -0.66, 0);
    const mStrutPiston = new THREE.Mesh(cyl(0.15, 0.15, 0.85, 14), chromeMat);
    mStrutPiston.position.set(0, -1.48, 0);
    mg.add(mStrutUpper, mStrutPiston);

    // Hydraulic brake lines along main strut + folding side brace + scissor torque links
    const hydLine = new THREE.Mesh(cyl(0.025, 0.025, 1.75, 8), maskMat);
    hydLine.position.set(s * 0.18, -0.95, 0.08);
    mg.add(hydLine);

    const sideBrace = new THREE.Mesh(box(1.18, 0.14, 0.14), strutMat);
    sideBrace.position.set(-s * 0.48, -0.55, 0);
    sideBrace.rotation.z = s * 0.55;
    mg.add(sideBrace);

    const mTorqueUpper = new THREE.Mesh(box(0.22, 0.42, 0.10), strutMat);
    mTorqueUpper.position.set(0, -1.15, 0.22);
    mTorqueUpper.rotation.x = 0.52;
    const mTorqueLower = new THREE.Mesh(box(0.22, 0.42, 0.10), strutMat);
    mTorqueLower.position.set(0, -1.52, 0.22);
    mTorqueLower.rotation.x = -0.52;
    mg.add(mTorqueUpper, mTorqueLower);

    const bogieBeam = new THREE.Mesh(box(0.30, 0.24, 2.15), strutMat);
    bogieBeam.position.set(0, -1.85, 0);
    mg.add(bogieBeam);

    // Wheel-well door with inner structural ribs
    const gearDoor = new THREE.Mesh(box(0.10, 1.38, 1.95), bellyMat);
    gearDoor.position.set(s * 0.60, -0.65, 0);
    mg.add(gearDoor);

    const wzList = isA350 ? [-0.78, 0.0, 0.78] : [-0.64, 0.64];
    const wRad = isA350 ? 0.54 : 0.60;
    for (const wx of [-0.46, 0.46]) {
      for (const wz of wzList) {
        const mw = new THREE.Mesh(cyl(wRad, wRad, 0.36, 22), tireMat);
        mw.rotation.z = Math.PI / 2;
        mw.position.set(wx, -1.85, wz);
        const mh = new THREE.Mesh(cyl(wRad * 0.48, wRad * 0.48, 0.38, 16), chromeMat);
        mw.add(mh);
        const brakeDisc = new THREE.Mesh(cyl(wRad * 0.38, wRad * 0.38, 0.40, 14), exhaustMat);
        mw.add(brakeDisc);
        mg.add(mw);
        allWheels.push(mw);
      }
    }
  }

  // --- 4. Navigation, Strobe & Anti-Collision Beacons (flush aerodynamic lenses) ---
  const navPort = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a })
  );
  navPort.position.set(21.6, 4.35, -6.2);

  const navStarboard = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x18e65a })
  );
  navStarboard.position.set(-21.6, 4.35, -6.2);

  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strobePort = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 10), strobeMat);
  strobePort.position.set(22.65, 5.86, -7.75);
  const strobeStarboard = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 10), strobeMat);
  strobeStarboard.position.set(-22.65, 5.86, -7.75);
  const strobeTail = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), strobeMat);
  strobeTail.position.set(0, 12.70, -22.25);

  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1e1e });
  const beaconGeo = new THREE.SphereGeometry(0.09, 10, 8);
  beaconGeo.scale(1.0, 0.45, 1.4);
  const beaconTop = new THREE.Mesh(beaconGeo, beaconMat);
  beaconTop.position.set(0, 5.76, 3.5);
  const beaconBelly = new THREE.Mesh(beaconGeo, beaconMat);
  beaconBelly.position.set(0, 1.18, 2.0);

  airframe.add(navPort, navStarboard, strobePort, strobeStarboard, strobeTail, beaconTop, beaconBelly);

  group.scale.setScalar(scale);

  group.userData = {
    isAirliner: true,
    livery,
    scale,
    airframe,
    gearGroup,
    noseGearPivot,
    mainGearLeft,
    mainGearRight,
    wheels: allWheels,
    fans,
    plumes,
    engineFires,
    strobeMat,
    beaconMat,
    cabinWinMat,
    materials: [fuseMat, whiteMat, bellyMat, wingMat, liveryMat, stripeMat, chromeMat],
    driverSeat: { x: 0, y: 3.4, z: 17.5, scale: 0.01 }, // hidden inside enclosed flight deck
  };

  return group;
}

/**
 * Scorches an airliner Group when destroyed by weapons or crash impact.
 */
export function charAirlinerModel(group) {
  if (!group || !group.userData) return;
  group.userData.charred = true;
  const mats = group.userData.materials || [];
  for (const m of mats) {
    if (m && m.color) {
      m.color.setHex(0x1f2024);
      m.roughness = 0.92;
      m.metalness = 0.08;
    }
  }
}
