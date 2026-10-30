// High-detail Commercial Airliner 3D Models (Boeing 787-9 Dreamliner & Airbus A350-1000 XWB)
// Provides:
//   1. buildAirlinerInstancedGeometries() -> { plane, planeTail } for PlacesSystem & LiveSky InstancedMesh pools
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

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function mat(tx, ty, tz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(tx, ty, tz),
    _q.clone(),
    new THREE.Vector3(sx, sy, sz)
  );
}

function mergeParts(parts) {
  const pos = [];
  const nrm = [];
  const col = [];
  for (const [geom, rgb, m] of parts) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) {
      pos.push(p[i]);
      nrm.push(n[i]);
    }
    for (let i = 0; i < p.length / 3; i++) {
      col.push(rgb[0], rgb[1], rgb[2]);
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
const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 16) => new THREE.ConeGeometry(r, h, seg);

/**
 * Builds a swept, tapered 3D airfoil wing panel (port or starboard) from root to tip.
 */
function buildSweptWingGeometry(side, rootX, tipX, rootZ, tipZ, rootChord, tipChord, rootThick, tipThick, yRoot, yTip) {
  const g = new THREE.BufferGeometry();
  const s = side >= 0 ? 1 : -1;
  const x0 = s * rootX;
  const x1 = s * tipX;
  const rzf = rootZ + rootChord * 0.45;
  const rzb = rootZ - rootChord * 0.55;
  const tzf = tipZ + tipChord * 0.45;
  const tzb = tipZ - tipChord * 0.55;

  const rt = rootThick * 0.5;
  const tt = tipThick * 0.5;

  // 8 vertices of the tapered swept wing box
  const v = [
    [x0, yRoot + rt, rzf], // 0: root top leading
    [x0, yRoot + rt, rzb], // 1: root top trailing
    [x0, yRoot - rt * 0.7, rzf], // 2: root bot leading
    [x0, yRoot - rt * 0.7, rzb], // 3: root bot trailing
    [x1, yTip + tt, tzf], // 4: tip top leading
    [x1, yTip + tt, tzb], // 5: tip top trailing
    [x1, yTip - tt * 0.7, tzf], // 6: tip bot leading
    [x1, yTip - tt * 0.7, tzb], // 7: tip bot trailing
  ];

  const tris = s > 0
    ? [
        [0, 1, 5], [0, 5, 4], // top
        [2, 6, 7], [2, 7, 3], // bottom
        [0, 4, 6], [0, 6, 2], // leading edge
        [1, 3, 7], [1, 7, 5], // trailing edge
        [4, 5, 7], [4, 7, 6], // tip cap
      ]
    : [
        [0, 5, 1], [0, 4, 5], // top
        [2, 7, 6], [2, 3, 7], // bottom
        [0, 6, 4], [0, 2, 6], // leading edge
        [1, 7, 3], [1, 5, 7], // trailing edge
        [4, 7, 5], [4, 6, 7], // tip cap
      ];

  const pos = [];
  for (const [a, b, c] of tris) {
    pos.push(v[a][0], v[a][1], v[a][2], v[b][0], v[b][1], v[b][2], v[c][0], v[c][1], v[c][2]);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Builds a swept vertical stabilizer fin (trapezoidal airfoil profile).
 */
function buildSweptTailFinGeometry(baseZFront, baseZRear, topZFront, topZRear, yBase, yTop, thickBase, thickTip) {
  const g = new THREE.BufferGeometry();
  const hb = thickBase * 0.5;
  const ht = thickTip * 0.5;
  const v = [
    [hb, yBase, baseZFront],
    [hb, yBase, baseZRear],
    [-hb, yBase, baseZFront],
    [-hb, yBase, baseZRear],
    [ht, yTop, topZFront],
    [ht, yTop, topZRear],
    [-ht, yTop, topZFront],
    [-ht, yTop, topZRear],
  ];
  const tris = [
    [0, 1, 5], [0, 5, 4], // +X side
    [2, 6, 7], [2, 7, 3], // -X side
    [0, 4, 6], [0, 6, 2], // leading edge
    [1, 3, 7], [1, 7, 5], // trailing rudder edge
    [4, 5, 7], [4, 7, 6], // top cap
  ];
  const pos = [];
  for (const [a, b, c] of tris) {
    pos.push(v[a][0], v[a][1], v[a][2], v[b][0], v[b][1], v[b][2], v[c][0], v[c][1], v[c][2]);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Instanced geometries `{ plane, planeTail }` for PlacesSystem and LiveSky.
 * Represents a sleek Boeing 787 / Airbus A350 wide-body airliner (nose +Z, wheels at y=0).
 */
export function buildAirlinerInstancedGeometries() {
  const white = [0.96, 0.97, 0.99];
  const pearl = [0.89, 0.91, 0.94];
  const wingGrey = [0.82, 0.85, 0.89];
  const chrome = [0.76, 0.80, 0.85];
  const darkGlass = [0.09, 0.12, 0.17];
  const tireDark = [0.11, 0.12, 0.13];
  const strutSteel = [0.58, 0.62, 0.67];
  const exhaustDark = [0.22, 0.24, 0.28];
  const cheatBlue = [0.05, 0.38, 0.72];

  const bodyParts = [];

  // 1. Multi-stage Fuselage (nose +Z, length ~43m at scale=1, ~65m at widebody scale=1.5)
  // Main cylindrical pressurized cabin
  bodyParts.push([cyl(2.18, 2.18, 26.5, 18), white, mat(0, 3.45, 1.0, Math.PI / 2, 0, 0)]);
  // Aerodynamic Belly Wing-to-Body Fairing
  bodyParts.push([cyl(1.95, 2.05, 15.0, 14), pearl, mat(0, 2.35, 0.8, Math.PI / 2, 0, 0, 1.18, 0.65, 1.0)]);
  // Forward tapered nose section + drooped radome cone (Boeing 787 / Airbus A350 profile)
  bodyParts.push([cyl(1.42, 2.18, 4.6, 18), white, mat(0, 3.30, 16.5, Math.PI / 2, 0, 0)]);
  bodyParts.push([cyl(0.68, 1.42, 2.8, 16), white, mat(0, 3.05, 20.1, Math.PI / 2, 0, 0)]);
  bodyParts.push([cone(0.68, 1.7, 16), pearl, mat(0, 2.95, 22.3, Math.PI / 2, 0, 0)]);

  // Cockpit wrap-around "Zorro mask" / Dreamliner 4-panel dark glass visor
  bodyParts.push([cyl(1.48, 1.96, 2.5, 14), darkGlass, mat(0, 3.78, 17.6, Math.PI / 2, 0, 0, 0.96, 0.56, 1.0)]);
  bodyParts.push([box(2.15, 0.52, 1.85), darkGlass, mat(0, 4.18, 17.3, 0.18, 0, 0)]);

  // Airline Cheatline Stripe & Cabin Window Strip along both sides of the fuselage
  for (const s of [-1, 1]) {
    bodyParts.push([box(0.08, 0.34, 26.8), darkGlass, mat(s * 2.16, 3.82, 1.2)]);
    bodyParts.push([box(0.09, 0.22, 27.2), cheatBlue, mat(s * 2.17, 3.35, 1.2)]);
    // Passenger doors (L1, L2, L3)
    for (const dz of [12.5, 2.2, -9.5]) {
      bodyParts.push([box(0.11, 1.05, 0.62), pearl, mat(s * 2.16, 3.65, dz)]);
    }
  }

  // Rear tapered tailcone rising toward APU exhaust
  bodyParts.push([cyl(2.18, 1.25, 7.2, 18), white, mat(0, 3.62, -15.8, Math.PI / 2, 0, 0)]);
  bodyParts.push([cyl(1.25, 0.38, 3.8, 14), white, mat(0, 3.92, -21.2, Math.PI / 2, 0, 0)]);
  bodyParts.push([cyl(0.36, 0.26, 0.8, 12), exhaustDark, mat(0, 4.02, -23.3, Math.PI / 2, 0, 0)]);

  // 2. Swept Supercritical Wings (36-deg sweep, inner + outer sections + flap track fairings)
  for (const s of [-1, 1]) {
    // Inner wing section (root to mid-span)
    bodyParts.push([
      buildSweptWingGeometry(s, 1.9, 10.8, 2.4, -0.8, 6.6, 4.2, 0.58, 0.38, 2.55, 2.95),
      wingGrey,
      null,
    ]);
    // Outer wing section (mid-span to wingtip)
    bodyParts.push([
      buildSweptWingGeometry(s, 10.8, 20.8, -0.8, -5.6, 4.2, 1.65, 0.38, 0.18, 2.95, 3.65),
      wingGrey,
      null,
    ]);
    // Under-wing flap track fairings (3 streamlined canoes per wing)
    for (const [fx, fy, fz, fl] of [
      [5.2, 2.38, -0.8, 2.6],
      [9.4, 2.68, -2.2, 2.2],
      [13.8, 3.05, -4.0, 1.7],
    ]) {
      bodyParts.push([cyl(0.16, 0.08, fl, 8), pearl, mat(s * fx, fy, fz, Math.PI / 2, 0, 0)]);
    }

    // 3. Swept Horizontal Stabilizers (Tailplane)
    bodyParts.push([
      buildSweptWingGeometry(s, 0.8, 7.4, -18.2, -21.4, 3.2, 1.35, 0.28, 0.12, 3.95, 4.35),
      wingGrey,
      null,
    ]);

    // 4. High-Bypass Turbofan Engines (GE GEnx / Trent XWB under-wing pods)
    const ex = s * 6.8;
    const ey = 1.68;
    const ez = 3.4;
    // Aerodynamic engine pylon strut
    bodyParts.push([box(0.32, 0.95, 2.8), pearl, mat(ex, ey + 0.88, ez - 0.5, 0.12, 0, 0)]);
    // Main nacelle cowling
    bodyParts.push([cyl(1.18, 1.12, 3.5, 16), white, mat(ex, ey, ez, Math.PI / 2, 0, 0)]);
    // Silver metallic intake lip ring
    bodyParts.push([cyl(1.18, 1.10, 0.55, 16), chrome, mat(ex, ey, ez + 1.95, Math.PI / 2, 0, 0)]);
    // Dark fan intake throat + spinner cone
    bodyParts.push([cyl(1.02, 1.02, 0.25, 14), darkGlass, mat(ex, ey, ez + 1.85, Math.PI / 2, 0, 0)]);
    bodyParts.push([cone(0.34, 0.75, 12), tireDark, mat(ex, ey, ez + 2.05, Math.PI / 2, 0, 0)]);
    // Rear bypass duct & titanium exhaust nozzle cone
    bodyParts.push([cyl(1.10, 0.78, 1.1, 14), chrome, mat(ex, ey, ez - 2.15, Math.PI / 2, 0, 0)]);
    bodyParts.push([cone(0.55, 1.25, 12), exhaustDark, mat(ex, ey, ez - 2.85, -Math.PI / 2, 0, 0)]);
  }

  // 5. Complete Tricycle Landing Gear (resting at y = 0)
  // Nose landing gear (z = +15.8m)
  bodyParts.push([cyl(0.14, 0.12, 1.65, 10), strutSteel, mat(0, 1.25, 15.8)]);
  bodyParts.push([box(0.28, 0.45, 0.22), strutSteel, mat(0, 1.15, 16.0, 0.35, 0, 0)]);
  for (const s of [-1, 1]) {
    bodyParts.push([cyl(0.44, 0.44, 0.24, 12), tireDark, mat(s * 0.28, 0.44, 15.8, 0, 0, Math.PI / 2)]);
    bodyParts.push([cyl(0.20, 0.20, 0.26, 10), chrome, mat(s * 0.28, 0.44, 15.8, 0, 0, Math.PI / 2)]);
  }
  // Main landing gear 4-wheel bogies (x = ±3.6m, z = -0.4m)
  for (const s of [-1, 1]) {
    const gx = s * 3.65;
    const gz = -0.4;
    // Main oleo strut & side brace
    bodyParts.push([cyl(0.20, 0.18, 2.05, 10), strutSteel, mat(gx, 1.55, gz)]);
    bodyParts.push([box(1.1, 0.14, 0.14), strutSteel, mat(gx - s * 0.45, 1.85, gz, 0, 0, s * 0.55)]);
    // Bogie beam
    bodyParts.push([box(0.26, 0.22, 1.85), strutSteel, mat(gx, 0.58, gz)]);
    // 4 main tires (2x2 tandem bogie)
    for (const wx of [-0.42, 0.42]) {
      for (const wz of [-0.62, 0.62]) {
        bodyParts.push([cyl(0.58, 0.58, 0.34, 12), tireDark, mat(gx + wx, 0.58, gz + wz, 0, 0, Math.PI / 2)]);
        bodyParts.push([cyl(0.26, 0.26, 0.36, 10), chrome, mat(gx + wx, 0.58, gz + wz, 0, 0, Math.PI / 2)]);
      }
    }
  }

  // 6. Tinted Livery Tail Fin + Blended Sharklet Winglets (`planeTail`)
  const tailParts = [
    // Tall swept vertical stabilizer fin
    [buildSweptTailFinGeometry(-12.8, -19.2, -18.2, -21.8, 4.4, 12.2, 0.52, 0.18), [1, 1, 1], null],
    // Dorsal fin fillet
    [buildSweptTailFinGeometry(-9.2, -12.8, -12.8, -14.5, 4.2, 5.8, 0.36, 0.26), [1, 1, 1], null],
  ];
  // Blended upturned Sharklet / Dreamliner raked winglets
  for (const s of [-1, 1]) {
    tailParts.push([
      buildSweptWingGeometry(s, 20.6, 22.1, -5.6, -7.2, 1.65, 0.72, 0.18, 0.10, 3.65, 5.55),
      [1, 1, 1],
      null,
    ]);
    // Engine nacelle accent ring
    tailParts.push([cyl(1.20, 1.16, 1.4, 16), [1, 1, 1], mat(s * 6.8, 1.68, 3.7, Math.PI / 2, 0, 0)]);
  }

  return {
    plane: mergeParts(bodyParts),
    planeTail: mergeParts(tailParts),
  };
}

/**
 * Creates a full articulated Three.js Group for the playable Boeing 787 / Airbus A350 airliner
 * or hero airport gate airliners.
 */
export function createHeroAirlinerModel(liveryOrIdx = 0, scale = 1.35) {
  const livery =
    typeof liveryOrIdx === "object" && liveryOrIdx !== null
      ? liveryOrIdx
      : AIRLINER_LIVERIES[Math.abs(liveryOrIdx | 0) % AIRLINER_LIVERIES.length];

  const group = new THREE.Group();
  group.name = `airliner_${livery.id}`;
  group.rotation.order = "YXZ";

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf7f9fc,
    roughness: 0.26,
    metalness: 0.14,
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: livery.bellyHex || 0xdce3ec,
    roughness: 0.34,
    metalness: 0.22,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xe3e7ee,
    roughness: 0.32,
    metalness: 0.24,
  });
  const liveryMat = new THREE.MeshStandardMaterial({
    color: livery.tailHex,
    roughness: 0.28,
    metalness: 0.22,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: livery.stripeHex,
    roughness: 0.25,
    metalness: 0.3,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd8e0e8,
    roughness: 0.18,
    metalness: 0.82,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0b1320,
    roughness: 0.12,
    metalness: 0.65,
  });
  const cabinWinMat = new THREE.MeshStandardMaterial({
    color: 0x182638,
    emissive: 0xffdfa8,
    emissiveIntensity: 0.35,
    roughness: 0.2,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x17191c,
    roughness: 0.88,
    metalness: 0.05,
  });
  const strutMat = new THREE.MeshStandardMaterial({
    color: 0x9aa2ac,
    roughness: 0.35,
    metalness: 0.68,
  });
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x2c3038,
    roughness: 0.45,
    metalness: 0.65,
  });

  // --- 1. Airframe Group (Fuselage, Wings, Tail, Nacelles) ---
  const airframe = new THREE.Group();
  airframe.name = "airframe";
  group.add(airframe);

  // Main Fuselage & Nose Cone
  const fuseMain = new THREE.Mesh(cyl(2.22, 2.22, 27.0, 24), whiteMat);
  fuseMain.rotation.x = Math.PI / 2;
  fuseMain.position.set(0, 3.45, 1.0);
  fuseMain.castShadow = true;
  fuseMain.receiveShadow = true;
  airframe.add(fuseMain);

  const bellyFairing = new THREE.Mesh(cyl(1.98, 2.08, 15.6, 18), bellyMat);
  bellyFairing.rotation.x = Math.PI / 2;
  bellyFairing.scale.set(1.18, 1.0, 0.68);
  bellyFairing.position.set(0, 2.32, 0.8);
  bellyFairing.castShadow = true;
  airframe.add(bellyFairing);

  const noseMid = new THREE.Mesh(cyl(1.44, 2.22, 4.8, 24), whiteMat);
  noseMid.rotation.x = Math.PI / 2;
  noseMid.position.set(0, 3.30, 16.8);
  noseMid.castShadow = true;
  airframe.add(noseMid);

  const noseFwd = new THREE.Mesh(cyl(0.68, 1.44, 2.8, 20), whiteMat);
  noseFwd.rotation.x = Math.PI / 2;
  noseFwd.position.set(0, 3.05, 20.5);
  noseFwd.castShadow = true;
  airframe.add(noseFwd);

  const radome = new THREE.Mesh(cone(0.68, 1.75, 20), whiteMat);
  radome.rotation.x = Math.PI / 2;
  radome.position.set(0, 2.94, 22.75);
  airframe.add(radome);

  // Cockpit Windshield Mask (Airbus A350 curved mask / Boeing 787 visor)
  const visorMask = new THREE.Mesh(cyl(1.50, 1.98, 2.6, 18), glassMat);
  visorMask.rotation.x = Math.PI / 2;
  visorMask.scale.set(0.97, 1.0, 0.58);
  visorMask.position.set(0, 3.80, 17.8);
  airframe.add(visorMask);

  const visorTop = new THREE.Mesh(box(2.12, 0.52, 1.95), glassMat);
  visorTop.rotation.x = 0.2;
  visorTop.position.set(0, 4.18, 17.45);
  airframe.add(visorTop);

  // Tailcone + APU nozzle
  const tailCone1 = new THREE.Mesh(cyl(2.22, 1.26, 7.4, 22), whiteMat);
  tailCone1.rotation.x = Math.PI / 2;
  tailCone1.position.set(0, 3.62, -16.1);
  tailCone1.castShadow = true;
  airframe.add(tailCone1);

  const tailCone2 = new THREE.Mesh(cyl(1.26, 0.36, 3.9, 18), whiteMat);
  tailCone2.rotation.x = Math.PI / 2;
  tailCone2.position.set(0, 3.92, -21.7);
  tailCone2.castShadow = true;
  airframe.add(tailCone2);

  const apuExhaust = new THREE.Mesh(cyl(0.35, 0.25, 0.85, 14), exhaustMat);
  apuExhaust.rotation.x = Math.PI / 2;
  apuExhaust.position.set(0, 4.02, -23.9);
  airframe.add(apuExhaust);

  // Cheatline stripes, cabin windows & passenger doors
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(box(0.09, 0.26, 28.0), stripeMat);
    stripe.position.set(s * 2.21, 3.35, 1.0);
    airframe.add(stripe);

    const winBand = new THREE.Mesh(box(0.08, 0.32, 26.2), cabinWinMat);
    winBand.position.set(s * 2.20, 3.84, 1.2);
    airframe.add(winBand);

    for (const dz of [13.2, 4.8, -3.5, -11.2]) {
      const door = new THREE.Mesh(box(0.11, 1.12, 0.66), bellyMat);
      door.position.set(s * 2.21, 3.62, dz);
      airframe.add(door);
    }
  }

  // Swept Supercritical Wings + Sharklet Winglets + Horizontal Stabilizers
  for (const s of [-1, 1]) {
    const wingInner = new THREE.Mesh(
      buildSweptWingGeometry(s, 1.9, 11.2, 2.5, -0.9, 6.8, 4.3, 0.60, 0.40, 2.55, 2.98),
      wingMat
    );
    wingInner.castShadow = true;
    wingInner.receiveShadow = true;
    airframe.add(wingInner);

    const wingOuter = new THREE.Mesh(
      buildSweptWingGeometry(s, 11.2, 21.4, -0.9, -5.8, 4.3, 1.65, 0.40, 0.18, 2.98, 3.70),
      wingMat
    );
    wingOuter.castShadow = true;
    wingOuter.receiveShadow = true;
    airframe.add(wingOuter);

    const sharklet = new THREE.Mesh(
      buildSweptWingGeometry(s, 21.2, 22.8, -5.8, -7.6, 1.65, 0.68, 0.18, 0.10, 3.70, 5.75),
      liveryMat
    );
    sharklet.castShadow = true;
    airframe.add(sharklet);

    // Flap track fairings
    for (const [fx, fy, fz, fl] of [
      [5.2, 2.38, -0.8, 2.7],
      [9.6, 2.68, -2.3, 2.3],
      [14.2, 3.05, -4.1, 1.8],
      [17.8, 3.35, -5.2, 1.3],
    ]) {
      const pod = new THREE.Mesh(cyl(0.16, 0.08, fl, 10), bellyMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(s * fx, fy, fz);
      airframe.add(pod);
    }

    // Horizontal stabilizer
    const hStab = new THREE.Mesh(
      buildSweptWingGeometry(s, 0.8, 7.6, -18.4, -21.8, 3.3, 1.35, 0.30, 0.12, 3.96, 4.40),
      wingMat
    );
    hStab.castShadow = true;
    airframe.add(hStab);
  }

  // Swept Vertical Stabilizer Tail Fin + Dorsal Fillet
  const tailFin = new THREE.Mesh(
    buildSweptTailFinGeometry(-12.8, -19.5, -18.5, -22.2, 4.4, 12.6, 0.54, 0.18),
    liveryMat
  );
  tailFin.castShadow = true;
  airframe.add(tailFin);

  const dorsalFin = new THREE.Mesh(
    buildSweptTailFinGeometry(-9.0, -12.8, -12.8, -14.6, 4.2, 5.9, 0.38, 0.26),
    liveryMat
  );
  airframe.add(dorsalFin);

  // Rudder accent stripe on tail fin
  const rudderStripe = new THREE.Mesh(
    buildSweptTailFinGeometry(-18.2, -19.5, -21.2, -22.2, 4.6, 12.4, 0.56, 0.20),
    stripeMat
  );
  airframe.add(rudderStripe);

  // --- 2. Twin Under-Wing High-Bypass Turbofan Engines with Spinning Fans & Plumes ---
  const fans = [];
  const plumes = [];
  const engineFires = [];

  for (const s of [-1, 1]) {
    const ex = s * 7.0;
    const ey = 1.72;
    const ez = 3.5;

    const engGroup = new THREE.Group();
    engGroup.position.set(ex, ey, ez);
    airframe.add(engGroup);

    // Pylon strut
    const pylon = new THREE.Mesh(box(0.34, 1.0, 2.9), bellyMat);
    pylon.position.set(0, 0.90, -0.5);
    pylon.rotation.x = 0.12;
    engGroup.add(pylon);

    // Outer nacelle cowling
    const cowl = new THREE.Mesh(cyl(1.22, 1.15, 3.6, 22), whiteMat);
    cowl.rotation.x = Math.PI / 2;
    cowl.castShadow = true;
    engGroup.add(cowl);

    // Livery band on engine nacelle
    const cowlBand = new THREE.Mesh(cyl(1.23, 1.20, 1.2, 22), liveryMat);
    cowlBand.rotation.x = Math.PI / 2;
    cowlBand.position.z = 0.35;
    engGroup.add(cowlBand);

    // Chrome intake lip
    const lip = new THREE.Mesh(cyl(1.22, 1.12, 0.58, 22), chromeMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.z = 2.02;
    engGroup.add(lip);

    // Spinning Turbofan Rotor Assembly (`fanGroup`)
    const fanGroup = new THREE.Group();
    fanGroup.position.z = 1.92;
    engGroup.add(fanGroup);

    const throatDisc = new THREE.Mesh(cyl(1.08, 1.08, 0.16, 18), glassMat);
    throatDisc.rotation.x = Math.PI / 2;
    fanGroup.add(throatDisc);

    const spinner = new THREE.Mesh(cone(0.36, 0.82, 16), tireMat);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.32;
    fanGroup.add(spinner);

    // 12 radial titanium fan blades
    const bladeGeo = box(0.14, 0.96, 0.04);
    for (let b = 0; b < 12; b++) {
      const ang = (b / 12) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, chromeMat);
      blade.position.set(Math.cos(ang) * 0.54, Math.sin(ang) * 0.54, 0.10);
      blade.rotation.z = ang + 0.35;
      blade.rotation.y = 0.42;
      fanGroup.add(blade);
    }
    fans.push(fanGroup);

    // Rear bypass duct & core exhaust cone
    const nozzle = new THREE.Mesh(cyl(1.12, 0.80, 1.15, 18), chromeMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = -2.25;
    engGroup.add(nozzle);

    const coreCone = new THREE.Mesh(cone(0.56, 1.35, 16), exhaustMat);
    coreCone.rotation.x = -Math.PI / 2;
    coreCone.position.z = -2.95;
    engGroup.add(coreCone);

    // Jet Thrust / Afterburner Plume (`plumeGroup`)
    const plumeGroup = new THREE.Group();
    plumeGroup.position.z = -2.85;
    plumeGroup.visible = false;
    const outerPlumeGeo = cone(0.88, 6.5, 14);
    outerPlumeGeo.rotateX(-Math.PI / 2);
    outerPlumeGeo.translate(0, 0, -3.25);
    const outerPlumeMat = new THREE.MeshBasicMaterial({
      color: 0x3898ff,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerPlumeGeo = cone(0.52, 4.2, 12);
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

  // --- 3. Animated Retractable Tricycle Landing Gear (`gearGroup`) ---
  const gearGroup = new THREE.Group();
  gearGroup.name = "landing_gear";
  group.add(gearGroup);

  // Steerable Nose Gear Pivot at z = +15.8m
  const noseGearPivot = new THREE.Group();
  noseGearPivot.position.set(0, 2.15, 15.8);
  gearGroup.add(noseGearPivot);

  const noseStrut = new THREE.Mesh(cyl(0.15, 0.13, 1.75, 12), strutMat);
  noseStrut.position.set(0, -0.85, 0);
  noseGearPivot.add(noseStrut);

  const noseTorque = new THREE.Mesh(box(0.28, 0.48, 0.24), strutMat);
  noseTorque.position.set(0, -0.95, 0.20);
  noseTorque.rotation.x = 0.35;
  noseGearPivot.add(noseTorque);

  // Twin Nose Tires + Hubs
  const allWheels = [];
  for (const s of [-1, 1]) {
    const nw = new THREE.Mesh(cyl(0.46, 0.46, 0.25, 16), tireMat);
    nw.rotation.z = Math.PI / 2;
    nw.position.set(s * 0.30, -1.69, 0);
    const nh = new THREE.Mesh(cyl(0.22, 0.22, 0.27, 12), chromeMat);
    nh.rotation.z = Math.PI / 2;
    nw.add(nh);
    noseGearPivot.add(nw);
    allWheels.push(nw);
  }

  // Nose-gear taxi/landing spotlight bulb
  const taxiLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff8dc })
  );
  taxiLamp.position.set(0, -0.65, 0.22);
  noseGearPivot.add(taxiLamp);

  // Port & Starboard 4-Wheel Main Landing Gear Bogies (x = ±3.7m, z = -0.4m)
  const mainGearLeft = new THREE.Group();
  const mainGearRight = new THREE.Group();
  for (const [s, mg] of [
    [1, mainGearLeft],
    [-1, mainGearRight],
  ]) {
    mg.position.set(s * 3.7, 2.45, -0.4);
    gearGroup.add(mg);

    const mStrut = new THREE.Mesh(cyl(0.21, 0.19, 1.95, 12), strutMat);
    mStrut.position.set(0, -0.95, 0);
    mg.add(mStrut);

    const sideBrace = new THREE.Mesh(box(1.15, 0.14, 0.14), strutMat);
    sideBrace.position.set(-s * 0.48, -0.55, 0);
    sideBrace.rotation.z = s * 0.55;
    mg.add(sideBrace);

    const bogieBeam = new THREE.Mesh(box(0.28, 0.24, 1.90), strutMat);
    bogieBeam.position.set(0, -1.85, 0);
    mg.add(bogieBeam);

    // Wheel-well door
    const gearDoor = new THREE.Mesh(box(0.10, 1.35, 1.85), bellyMat);
    gearDoor.position.set(s * 0.58, -0.65, 0);
    mg.add(gearDoor);

    for (const wx of [-0.44, 0.44]) {
      for (const wz of [-0.64, 0.64]) {
        const mw = new THREE.Mesh(cyl(0.60, 0.60, 0.36, 16), tireMat);
        mw.rotation.z = Math.PI / 2;
        mw.position.set(wx, -1.85, wz);
        const mh = new THREE.Mesh(cyl(0.28, 0.28, 0.38, 12), chromeMat);
        mh.rotation.z = Math.PI / 2;
        mw.add(mh);
        mg.add(mw);
        allWheels.push(mw);
      }
    }
  }

  // --- 4. Navigation, Strobe & Anti-Collision Beacons ---
  const navPort = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a })
  );
  navPort.position.set(21.6, 3.75, -5.8);

  const navStarboard = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x18e65a })
  );
  navStarboard.position.set(-21.6, 3.75, -5.8);

  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strobePort = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), strobeMat);
  strobePort.position.set(22.8, 5.75, -7.5);
  const strobeStarboard = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), strobeMat);
  strobeStarboard.position.set(-22.8, 5.75, -7.5);
  const strobeTail = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), strobeMat);
  strobeTail.position.set(0, 12.65, -21.8);

  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1e1e });
  const beaconTop = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), beaconMat);
  beaconTop.position.set(0, 5.72, 3.5);
  const beaconBelly = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), beaconMat);
  beaconBelly.position.set(0, 1.55, 2.0);

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
    materials: [whiteMat, bellyMat, wingMat, liveryMat, stripeMat, chromeMat],
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
