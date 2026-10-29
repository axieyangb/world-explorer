// [weapon-pickups] Detailed procedural weapon models for the on-foot player and the world pickups: an assault
// rifle (AR pattern, tan furniture), an RPG launcher with a PG-7 style warhead, a plasma railgun, plus the
// ammo can and the hard case the pickups lie in. Side profiles are extruded Shapes with bevels, round parts
// are lathed, small hardware (rail teeth, slots, latches) is boxes; everything is merged per material and the
// geometry is built once per model and shared by every instance.
//
// Rig frame (matches walker_weapons / hero_avatar): +Z = muzzle direction, +Y = up, the receiver near the
// origin. The hand anchors hero_avatar's IK uses must stay where they are: pistol grip (0,-0.095,-0.06)
// rifle / (0,-0.095,0.06) RPG / (0,-0.105,0.02) railgun, fore-end (0,-0.04,0.21) / (0,-0.05,0.28) /
// (0,-0.06,0.30). userData.muzzlePoint is an Object3D at the muzzle.
import * as THREE from '../../vendor/three.module.js';

const HALF_PI = Math.PI / 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// Bakes position / rotation (XYZ euler) / scale into a geometry.
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
  geo.applyMatrix4(_m);
  return geo;
}

// Concatenate geometries (position, normal) into one non-indexed geometry.
function merge(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    P.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    N.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.computeBoundingSphere();
  return out;
}

// Side profile [(z, y)...] extruded `thick` across X, centred on x = 0, with a rounded bevel.
function profile(pts, thick, bevel = 0, curves = null, holes = null) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const c = curves && curves[i];
    if (c) s.quadraticCurveTo(c[0], c[1], pts[i][0], pts[i][1]);
    else s.lineTo(pts[i][0], pts[i][1]);
  }
  s.closePath();
  if (holes) for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const inner = Math.max(0.001, thick - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: inner, bevelEnabled: bevel > 0, bevelSize: bevel * 0.8, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6,
  });
  g.translate(0, 0, -inner / 2);
  g.rotateY(-HALF_PI); // shape x -> world +Z, extrusion -> world X
  g.computeVertexNormals();
  return g;
}

// Lathe from [(r, z)...] around the Z axis (barrels, tubes, warheads).
function lathe(rz, seg = 16, y = 0) {
  const g = new THREE.LatheGeometry(rz.map(([r, z]) => new THREE.Vector2(r, z)), seg);
  g.rotateX(HALF_PI); // lathe axis Y -> Z
  if (y) g.translate(0, y, 0);
  return g;
}

function tube(r, z0, z1, y = 0, seg = 14, x = 0) {
  const g = new THREE.CylinderGeometry(r, r, z1 - z0, seg);
  g.rotateX(HALF_PI);
  g.translate(x, y, (z0 + z1) / 2);
  return g;
}

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  return xf(new THREE.BoxGeometry(w, h, d), [x, y, z], [rx, ry, rz]);
}

// ---------------------------------------------------------------------------------------------------
// Materials (shared by every weapon instance; reflection_probe adds the sky map where envProbe is set).
let MATS = null;
export function weaponMaterials() {
  if (MATS) return MATS;
  const std = (color, roughness, metalness, probe = false, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    if (probe) m.userData.envProbe = true;
    return m;
  };
  MATS = {
    metal: std(0x1d1f23, 0.42, 0.7, true),      // anodised receiver
    steel: std(0x55595f, 0.3, 0.9, true),       // barrel, pins, muzzle
    polymer: std(0x222326, 0.78, 0.05),         // grip, magazine
    tan: std(0x8d7b5c, 0.72, 0.04),             // furniture
    rubber: std(0x111214, 0.92, 0.0),
    glass: std(0x1a2a30, 0.06, 0.95, true, { emissive: 0x050c10 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    olive: std(0x4c5a3a, 0.6, 0.32, true),      // RPG tube
    wood: std(0x7b4a25, 0.58, 0.05),
    warhead: std(0x53613f, 0.5, 0.35, true),
    brass: std(0xc89a3a, 0.28, 0.85, true),
    gunmetal: std(0x2a2f38, 0.32, 0.85, true),  // railgun shell
    white: std(0xd8dde2, 0.38, 0.25, true),     // railgun panels
    copper: std(0xb8693a, 0.3, 0.9, true),
    glow: new THREE.MeshBasicMaterial({ color: 0x48f2ff }),
    canGreen: std(0x67764a, 0.5, 0.45),        // ammo can / case
    caseBlack: std(0x1e2123, 0.7, 0.15),
    foam: std(0x2a2c2e, 0.95, 0.0),
  };
  return MATS;
}

// ---------------------------------------------------------------------------------------------------
// Assault rifle (~0.96 m). Grip anchor (0,-0.095,-0.06), fore-end (0,-0.04,0.21), muzzle (0,0.025,0.60).
function buildRifle() {
  const P = { metal: [], steel: [], polymer: [], tan: [], rubber: [], glass: [], dot: [] };
  const BY = 0.025; // bore height
  // Upper receiver with forward-assist bump and brass deflector.
  P.metal.push(profile([[-0.135, 0.0], [0.105, 0.0], [0.105, 0.052], [0.07, 0.058], [-0.135, 0.058]], 0.05, 0.004));
  P.metal.push(box(0.012, 0.02, 0.025, -0.028, 0.03, -0.075)); // forward assist
  P.metal.push(box(0.01, 0.018, 0.02, 0.029, 0.04, -0.07));   // brass deflector
  // Lower receiver with flared magwell.
  P.metal.push(profile([[-0.125, 0.0], [0.105, 0.0], [0.105, -0.072], [0.028, -0.078], [0.022, -0.05], [-0.055, -0.056], [-0.125, -0.034]], 0.046, 0.004));
  P.metal.push(profile([[0.02, -0.06], [0.11, -0.06], [0.112, -0.084], [0.018, -0.088]], 0.054, 0.003));
  // Ejection port cover and pins (right side).
  P.polymer.push(box(0.003, 0.026, 0.07, 0.0265, 0.026, 0.015));
  for (const z of [-0.1, 0.07]) P.steel.push(xf(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 8), [0, -0.02, z], [0, 0, HALF_PI]));
  P.steel.push(xf(new THREE.CylinderGeometry(0.006, 0.006, 0.052, 10), [0, -0.035, -0.02], [0, 0, HALF_PI])); // selector
  P.metal.push(box(0.004, 0.006, 0.022, -0.027, -0.035, -0.02, 0, 0, 0)); // selector lever
  // Trigger guard and trigger.
  P.metal.push(box(0.012, 0.006, 0.075, 0, -0.092, -0.017));
  P.metal.push(box(0.012, 0.04, 0.008, 0, -0.072, 0.019));
  P.steel.push(profile([[-0.012, -0.056], [0.0, -0.056], [-0.004, -0.07], [-0.012, -0.082], [-0.016, -0.079], [-0.01, -0.068]], 0.006, 0));
  // Pistol grip (finger grooves on the front edge).
  P.polymer.push(profile([
    [-0.088, -0.05], [-0.025, -0.05], [-0.03, -0.075], [-0.036, -0.1], [-0.044, -0.125], [-0.052, -0.155], [-0.064, -0.185],
    [-0.078, -0.192], [-0.106, -0.186], [-0.1, -0.15], [-0.09, -0.098],
  ], 0.032, 0.007, { 2: [-0.024, -0.088], 3: [-0.044, -0.112], 4: [-0.034, -0.14] }));
  // Curved 30-round magazine with ribs and base plate.
  P.polymer.push(profile([[0.03, -0.07], [0.102, -0.07], [0.142, -0.255], [0.075, -0.262], [0.03, -0.07]], 0.027, 0.004,
    { 2: [0.112, -0.18], 4: [0.042, -0.17] }));
  P.polymer.push(box(0.034, 0.012, 0.075, 0, -0.262, 0.11, -0.12));
  // Buffer tube and adjustable stock with cheek riser and butt pad.
  P.metal.push(tube(0.0165, -0.33, -0.12, 0.034, 16));
  P.tan.push(profile([[-0.2, 0.068], [-0.335, 0.072], [-0.372, 0.07], [-0.375, -0.072], [-0.345, -0.078], [-0.3, -0.03], [-0.25, -0.004], [-0.2, 0.004]], 0.042, 0.007,
    null, [[[-0.3, 0.045], [-0.252, 0.042], [-0.29, 0.012], [-0.33, -0.025], [-0.345, 0.0], [-0.345, 0.045]]]));
  P.rubber.push(profile([[-0.372, 0.074], [-0.392, 0.074], [-0.394, -0.076], [-0.374, -0.078]], 0.046, 0.005));
  P.metal.push(box(0.014, 0.008, 0.03, 0.0, -0.012, -0.225)); // adjustment lever
  // Charging handle.
  P.metal.push(box(0.044, 0.01, 0.022, 0, 0.055, -0.14));
  // Barrel, gas block and muzzle brake.
  P.steel.push(lathe([[0, 0.1], [0.012, 0.1], [0.012, 0.38], [0.0105, 0.38], [0.0105, 0.545], [0, 0.545]], 14, BY));
  P.metal.push(box(0.03, 0.03, 0.026, 0, BY + 0.004, 0.395));
  P.steel.push(lathe([[0, 0.54], [0.0165, 0.54], [0.0175, 0.556], [0.0175, 0.594], [0.0155, 0.602], [0.007, 0.602], [0.007, 0.6], [0, 0.6]], 16, BY));
  for (const sx of [-1, 1]) for (const z of [0.566, 0.582]) P.rubber.push(box(0.006, 0.02, 0.009, sx * 0.0155, BY, z));
  // Free-float handguard (octagonal, tan) with M-LOK slots and an angled fore grip.
  const hg = new THREE.CylinderGeometry(0.034, 0.034, 0.285, 8, 1);
  hg.rotateY(Math.PI / 8);
  hg.rotateX(HALF_PI);
  hg.translate(0, BY, 0.248);
  P.tan.push(hg);
  P.tan.push(lathe([[0.034, 0.1], [0.04, 0.102], [0.04, 0.112], [0.034, 0.114]], 8, BY)); // barrel-nut ring
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) P.rubber.push(box(0.002, 0.011, 0.034, sx * 0.0315, BY, 0.155 + i * 0.05));
  for (let i = 0; i < 4; i++) P.rubber.push(box(0.012, 0.002, 0.034, 0, BY - 0.0315, 0.155 + i * 0.05));
  P.polymer.push(profile([[0.172, -0.006], [0.25, -0.006], [0.238, -0.03], [0.214, -0.05], [0.19, -0.034]], 0.026, 0.005, { 3: [0.232, -0.046] }));
  // Full-length top rail with teeth.
  P.metal.push(box(0.022, 0.009, 0.62, 0, 0.0625, 0.075));
  for (let i = 0; i < 46; i++) P.metal.push(box(0.025, 0.0045, 0.0055, 0, 0.0688, -0.215 + i * 0.0128));
  // Folding sights.
  P.metal.push(profile([[0.335, 0.066], [0.36, 0.066], [0.355, 0.094], [0.345, 0.094]], 0.018, 0.002));
  P.metal.push(profile([[-0.12, 0.066], [-0.09, 0.066], [-0.095, 0.088], [-0.115, 0.088]], 0.024, 0.002));
  // Red-dot optic: mount, tube, flip caps, lens with dot.
  P.metal.push(box(0.026, 0.018, 0.04, 0, 0.078, 0.0));
  P.metal.push(lathe([[0.0, -0.04], [0.019, -0.04], [0.021, -0.034], [0.021, 0.03], [0.023, 0.036], [0.023, 0.042], [0.0185, 0.042], [0.0185, -0.036], [0.0, -0.036]], 20, 0.104));
  P.metal.push(box(0.012, 0.012, 0.016, 0.024, 0.104, 0.0)); // turret
  P.metal.push(box(0.012, 0.012, 0.016, 0, 0.128, 0.0));
  P.glass.push(xf(new THREE.CircleGeometry(0.0185, 20), [0, 0.104, 0.039]));
  P.glass.push(xf(new THREE.CircleGeometry(0.0185, 20), [0, 0.104, -0.035], [0, Math.PI, 0]));
  P.dot.push(xf(new THREE.CircleGeometry(0.0022, 8), [0, 0.104, 0.0395]));
  return { P, muzzle: [0, BY, 0.61] };
}

// RPG launcher (~1.0 m tube + warhead). Grip (0,-0.095,0.06), fore-end (0,-0.05,0.28), muzzle (0,0,0.9).
function buildRpg() {
  const P = { olive: [], wood: [], metal: [], steel: [], polymer: [], warhead: [], brass: [], glass: [], rubber: [] };
  // Launch tube with lip rings; venturi flare at the back (outer + inner skin).
  P.olive.push(lathe([[0.0, -0.42], [0.04, -0.42], [0.04, 0.41], [0.046, 0.415], [0.046, 0.44], [0.034, 0.44], [0.034, 0.43], [0, 0.43]], 20));
  P.steel.push(lathe([[0.034, -0.42], [0.042, -0.425], [0.05, -0.47], [0.074, -0.585], [0.068, -0.59], [0.045, -0.48], [0.034, -0.44]], 20));
  for (const z of [-0.33, 0.04, 0.33]) P.steel.push(lathe([[0.04, z - 0.008], [0.043, z - 0.006], [0.043, z + 0.006], [0.04, z + 0.008]], 20));
  // Wooden heat guards.
  P.wood.push(lathe([[0.04, -0.32], [0.05, -0.315], [0.053, -0.3], [0.053, -0.04], [0.05, -0.025], [0.04, -0.02]], 20));
  P.wood.push(lathe([[0.04, 0.05], [0.049, 0.055], [0.051, 0.07], [0.051, 0.18], [0.048, 0.19], [0.04, 0.195]], 20));
  // Trigger housing, pistol grip, guard; fore grip.
  P.metal.push(profile([[0.0, -0.034], [0.15, -0.034], [0.15, -0.058], [0.11, -0.068], [0.02, -0.068], [0.0, -0.055]], 0.034, 0.004));
  P.polymer.push(profile([[0.03, -0.062], [0.088, -0.062], [0.082, -0.1], [0.07, -0.18], [0.052, -0.192], [0.03, -0.185], [0.036, -0.1]], 0.032, 0.007, { 3: [0.08, -0.15] }));
  P.metal.push(box(0.01, 0.006, 0.06, 0, -0.108, 0.115));
  P.metal.push(box(0.01, 0.04, 0.006, 0, -0.088, 0.145));
  P.steel.push(box(0.006, 0.022, 0.006, 0, -0.078, 0.112, 0.25));
  P.polymer.push(profile([[0.255, -0.036], [0.305, -0.036], [0.3, -0.07], [0.29, -0.11], [0.268, -0.115], [0.262, -0.07]], 0.03, 0.006));
  P.metal.push(box(0.03, 0.012, 0.06, 0, -0.04, 0.28));
  // Iron sights.
  P.metal.push(profile([[0.3, 0.038], [0.33, 0.038], [0.322, 0.085], [0.31, 0.085]], 0.014, 0.002));
  P.metal.push(profile([[0.03, 0.038], [0.07, 0.038], [0.06, 0.07], [0.04, 0.07]], 0.03, 0.002));
  // Optical sight on the left: bracket, body, objective and eyepiece with rubber cup.
  P.metal.push(box(0.04, 0.03, 0.05, -0.045, 0.02, 0.05));
  P.metal.push(profile([[-0.03, 0.0], [0.12, 0.0], [0.12, 0.06], [0.07, 0.07], [-0.03, 0.065]], 0.036, 0.005).translate(-0.078, 0.025, 0));
  P.metal.push(tube(0.017, 0.11, 0.165, 0.065, 16, -0.078));
  P.glass.push(xf(new THREE.CircleGeometry(0.014, 16), [-0.078, 0.065, 0.1655]));
  P.metal.push(tube(0.013, -0.085, -0.03, 0.06, 16, -0.078));
  P.rubber.push(lathe([[0.013, -0.12], [0.02, -0.122], [0.021, -0.1], [0.015, -0.085], [0.012, -0.085]], 16).translate(-0.078, 0.06, 0));
  P.metal.push(box(0.012, 0.014, 0.014, -0.078, 0.104, 0.05)); // adjuster knob
  // PG-7 style rocket: booster, ogive warhead, piezo fuze, ring.
  P.steel.push(tube(0.024, 0.43, 0.58, 0, 14));
  for (let i = 0; i < 4; i++) {
    const a = i * HALF_PI + Math.PI / 4;
    P.steel.push(xf(new THREE.BoxGeometry(0.004, 0.022, 0.1), [Math.cos(a) * 0.027, Math.sin(a) * 0.027, 0.5], [0, 0, a + HALF_PI]));
  }
  P.warhead.push(lathe([[0.0, 0.575], [0.026, 0.575], [0.06, 0.6], [0.083, 0.635], [0.086, 0.66], [0.085, 0.7], [0.075, 0.745], [0.055, 0.8], [0.033, 0.845], [0.017, 0.872], [0.0, 0.872]], 22));
  P.olive.push(lathe([[0.0855, 0.665], [0.089, 0.668], [0.089, 0.685], [0.0855, 0.688]], 22));
  P.brass.push(lathe([[0.0, 0.868], [0.018, 0.868], [0.014, 0.89], [0.009, 0.903], [0.0, 0.906]], 14));
  // Sling swivels.
  for (const z of [-0.36, 0.36]) P.metal.push(xf(new THREE.TorusGeometry(0.012, 0.0025, 6, 12), [0, -0.045, z], [0, HALF_PI, 0]));
  return { P, muzzle: [0, 0, 0.9] };
}

// Plasma railgun (~1.05 m). Grip (0,-0.105,0.02), fore-end (0,-0.06,0.30), muzzle (0,0,0.62).
function buildRailgun() {
  const P = { gunmetal: [], white: [], metal: [], copper: [], glow: [], polymer: [], rubber: [], glass: [] };
  // Main shell: chunky beveled body with a step down to the rail housing.
  P.gunmetal.push(profile([[-0.33, 0.02], [-0.2, 0.06], [0.06, 0.07], [0.12, 0.05], [0.13, -0.045], [0.06, -0.06], [-0.06, -0.06], [-0.25, -0.07], [-0.34, -0.03]], 0.074, 0.01));
  // White armour panels on both flanks with recessed panel lines (dark inset strips).
  for (const sx of [-1, 1]) {
    P.white.push(profile([[-0.2, 0.045], [0.05, 0.052], [0.1, 0.035], [0.1, -0.02], [-0.18, -0.03]], 0.006, 0.0015).translate(sx * 0.038, 0, 0));
    P.polymer.push(box(0.002, 0.003, 0.23, sx * 0.0415, 0.01, -0.05));
    P.polymer.push(box(0.002, 0.06, 0.003, sx * 0.0415, 0.012, 0.03));
    // Capacitor cells: three glowing windows.
    for (let i = 0; i < 3; i++) P.glow.push(box(0.003, 0.014, 0.04, sx * 0.0425, -0.012, -0.15 + i * 0.05));
  }
  // Twin rails (beveled, tapered noses) with the plasma core between them.
  for (const sy of [-1, 1]) {
    P.gunmetal.push(profile([[0.1, sy * 0.028], [0.56, sy * 0.028], [0.62, sy * 0.034], [0.6, sy * 0.06], [0.1, sy * 0.064]], 0.05, 0.006));
    P.copper.push(box(0.014, 0.004, 0.46, 0, sy * 0.026, 0.35));
  }
  P.glow.push(tube(0.009, 0.12, 0.6, 0, 10));
  // Accelerator coils around the rails.
  for (let i = 0; i < 5; i++) {
    const z = 0.17 + i * 0.09;
    P.copper.push(xf(new THREE.TorusGeometry(0.072, 0.011, 8, 24), [0, 0, z]));
    P.metal.push(xf(new THREE.TorusGeometry(0.072, 0.005, 6, 24), [0, 0, z + 0.016]));
  }
  // Grip, trigger guard, fore grip.
  P.polymer.push(profile([[-0.012, -0.055], [0.05, -0.055], [0.045, -0.1], [0.035, -0.17], [0.018, -0.195], [-0.012, -0.19], [-0.008, -0.12]], 0.034, 0.008, { 3: [0.048, -0.14] }));
  P.gunmetal.push(box(0.012, 0.006, 0.07, 0, -0.098, 0.083));
  P.gunmetal.push(box(0.012, 0.042, 0.007, 0, -0.077, 0.116));
  P.polymer.push(profile([[0.27, -0.06], [0.33, -0.06], [0.322, -0.1], [0.31, -0.13], [0.288, -0.13], [0.28, -0.1]], 0.03, 0.006));
  // Skeleton stock with rubber pad.
  P.gunmetal.push(profile([[-0.33, 0.04], [-0.45, 0.05], [-0.46, -0.06], [-0.43, -0.07], [-0.4, -0.02], [-0.34, -0.035]], 0.034, 0.006));
  P.rubber.push(profile([[-0.455, 0.052], [-0.472, 0.05], [-0.474, -0.06], [-0.458, -0.064]], 0.038, 0.004));
  // Long scope on a riser with glowing reticle lens.
  P.metal.push(box(0.022, 0.02, 0.06, 0, 0.08, -0.02));
  P.metal.push(lathe([[0, -0.13], [0.018, -0.13], [0.02, -0.11], [0.016, -0.08], [0.016, 0.06], [0.022, 0.09], [0.022, 0.11], [0, 0.11]], 18, 0.104));
  P.glass.push(xf(new THREE.CircleGeometry(0.019, 18), [0, 0.104, 0.1105]));
  P.glow.push(box(0.03, 0.004, 0.08, 0, 0.0715, -0.15)); // top status strip
  return { P, muzzle: [0, 0, 0.62] };
}

// Ammo can (0.30 x 0.19 x 0.15 m) sitting on y = 0, long side along Z.
function buildAmmoCan() {
  const P = { canGreen: [], metal: [], brass: [], rubber: [] };
  P.canGreen.push(profile([[-0.15, 0.0], [0.15, 0.0], [0.15, 0.165], [-0.15, 0.165]], 0.15, 0.008));
  P.canGreen.push(profile([[-0.155, 0.16], [0.155, 0.16], [0.155, 0.19], [-0.155, 0.19]], 0.158, 0.006)); // lid
  for (const z of [-0.09, 0.0, 0.09]) P.canGreen.push(box(0.152, 0.012, 0.008, 0, 0.08, z)); // pressed ribs
  P.metal.push(xf(new THREE.TorusGeometry(0.045, 0.006, 6, 16, Math.PI), [0, 0.19, 0], [0, HALF_PI, 0]));
  P.metal.push(box(0.016, 0.006, 0.024, 0.0, 0.192, 0.0));
  P.metal.push(box(0.03, 0.06, 0.012, 0.0, 0.15, 0.158)); // latch
  P.rubber.push(box(0.152, 0.004, 0.302, 0, 0.002, 0));
  // A few rounds spilled beside it.
  for (let i = 0; i < 3; i++) P.brass.push(xf(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), [0.11 + i * 0.018, 0.006, -0.12 + i * 0.03], [0, i * 0.7, HALF_PI]));
  return { P, muzzle: [0, 0.1, 0] };
}

// Open hard case (1.1 x 0.36 m, 0.08 m high) the pickups lie in.
function buildCase() {
  const P = { caseBlack: [], foam: [], metal: [] };
  P.caseBlack.push(profile([[-0.56, 0.0], [0.56, 0.0], [0.565, 0.075], [-0.565, 0.075]], 0.37, 0.014));
  P.foam.push(box(0.33, 0.006, 1.06, 0, 0.079, 0));
  for (const z of [-0.3, 0.3]) P.metal.push(box(0.02, 0.03, 0.05, 0.19, 0.045, z)); // latches
  for (const z of [-0.18, 0.18]) P.metal.push(box(0.02, 0.02, 0.05, -0.19, 0.06, z)); // hinges
  return { P, muzzle: [0, 0.1, 0] };
}

const BUILDERS = { RIFLE: buildRifle, RPG: buildRpg, RAILGUN: buildRailgun, AMMO: buildAmmoCan, CASE: buildCase };
const GEO_CACHE = new Map();

function cachedParts(id) {
  let c = GEO_CACHE.get(id);
  if (!c) {
    const { P, muzzle } = BUILDERS[id]();
    const parts = [];
    let tris = 0;
    for (const [key, geos] of Object.entries(P)) {
      if (!geos.length) continue;
      const g = merge(geos);
      for (const s of geos) s.dispose();
      tris += g.attributes.position.count / 3;
      parts.push([key, g]);
    }
    c = { parts, muzzle, tris };
    GEO_CACHE.set(id, c);
  }
  return c;
}

/** New Group for weapon `id` (RIFLE | RPG | RAILGUN | AMMO | CASE); geometry and materials are shared. */
export function createWeaponModel(id, { shadows = true } = {}) {
  const M = weaponMaterials();
  const c = cachedParts(id);
  const group = new THREE.Group();
  for (const [key, geo] of c.parts) {
    const mesh = new THREE.Mesh(geo, M[key]);
    mesh.castShadow = shadows && key !== 'glow' && key !== 'dot';
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(c.muzzle[0], c.muzzle[1], c.muzzle[2]);
  group.add(muzzlePoint);
  group.userData.muzzlePoint = muzzlePoint;
  group.userData.weaponModel = id;
  group.userData.tris = c.tris;
  return group;
}
