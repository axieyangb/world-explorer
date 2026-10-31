import * as THREE from '../vendor/three.module.js';
import { personParts, PART, MAT, OPT, bit, HIP_Y, SHOULDER_Y } from './features/person_model.js'; // [feature/people]
import { NEW_VEHICLE_SPECS, isCustomFleetVehicle, buildFleetVehicleModel, applyVehiclePaint, updateVehicleEffects } from './features/vehicles.js';
import { HERO_VEHICLE_IDS, buildHeroVehicle } from './features/hero_vehicles.js'; // [hero-vehicles]
import { HEAVY_VEHICLE_IDS, buildHeavyVehicle } from './features/hero_heavy.js'; // [hero-vehicles] bus, trucks, tank
import { buildHeroAvatar } from './features/hero_avatar.js'; // [hero-vehicles] player character
import { buildHeroHelicopter } from './features/hero_heli.js'; // [hero-vehicles] player helicopter
import { createNitroRig, updateNitroRig, nitroStyleFor } from './features/nitro_fx.js'; // [nitro-fx] shader flames + light trails

export const VEHICLE_SPECS = [
  {
    id: 'cyber_mach1',
    name: 'Concept Hypercar',
    massKg: 1520,
    height: 1.18,
    maxSpeed: 145.0,     // ~522 km/h cruise -> 340.3 m/s (1,225 km/h = Mach 1.00) on Shift Nitro!
    nitroMult: 2.347,    // 145.0 * 2.347 = 340.3 m/s (1,225 km/h = 1.00 Mach at sea level)
    accel: 92.0,
    brake: 145.0,
    steerLow: 0.52,
    steerHigh: 0.055,
    length: 5.1,
    width: 2.18,
  },
  {
    id: 'aero_formula',
    name: 'Formula Racer',
    massKg: 920,
    height: 1.05,
    maxSpeed: 96.0,      // ~346 km/h -> 553 km/h on Nitro
    nitroMult: 1.60,
    accel: 64.0,
    brake: 105.0,
    steerLow: 0.58,
    steerHigh: 0.11,
    length: 4.85,
    width: 2.08,
  },
  {
    id: 'supercar',
    name: 'Sports Car',
    massKg: 1450,
    height: 1.24,
    maxSpeed: 64.0,      // ~230 km/h -> 368 km/h on Nitro
    nitroMult: 1.60,
    accel: 36.0,
    brake: 54.0,
    steerLow: 0.52,
    steerHigh: 0.14,
    length: 4.6,
    width: 2.05,
  },
  ...NEW_VEHICLE_SPECS,
  {
    id: 'taxi',
    name: 'City Taxi',
    massKg: 1550,
    height: 1.48,
    maxSpeed: 38.0,      // ~137 km/h -> 212 km/h on Nitro
    nitroMult: 1.55,
    accel: 20.0,
    brake: 35.0,
    steerLow: 0.58,
    steerHigh: 0.16,
    length: 4.5,
    width: 1.9,
  },
  {
    id: 'police',
    name: 'Police Cruiser',
    massKg: 1850,
    height: 1.52,
    maxSpeed: 48.0,      // ~173 km/h -> 268 km/h on Nitro
    nitroMult: 1.55,
    accel: 26.0,
    brake: 42.0,
    steerLow: 0.56,
    steerHigh: 0.15,
    length: 4.7,
    width: 1.96,
  },
  {
    id: 'bus',
    name: 'City Bus',
    massKg: 11000,
    height: 3.70,
    maxSpeed: 28.0,      // ~101 km/h -> 162 km/h on Nitro
    nitroMult: 1.60,
    accel: 14.0,
    brake: 28.0,
    steerLow: 0.44,
    steerHigh: 0.12,
    length: 10.6,
    width: 2.55,
  },
];

/**
 * Helper to create a glowing additive cone plume (for N2O flames, plasma thrusters, or turbine afterburners).
 * Cone tip points toward -Z (rear of vehicle), base is at Z = 0.
 */
function createThrusterFlameCone(radius, length, innerHex, outerHex) {
  const group = new THREE.Group();

  const outerGeo = new THREE.ConeGeometry(radius, length, 14, 1, true);
  outerGeo.rotateX(-Math.PI * 0.5);
  outerGeo.translate(0, 0, -length * 0.5);
  const outerMat = new THREE.MeshBasicMaterial({
    color: outerHex,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  group.add(outerMesh);

  const innerGeo = new THREE.ConeGeometry(radius * 0.55, length * 0.72, 12, 1, true);
  innerGeo.rotateX(-Math.PI * 0.5);
  innerGeo.translate(0, 0, -length * 0.36);
  const innerMat = new THREE.MeshBasicMaterial({
    color: innerHex,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  group.add(innerMesh);

  group.userData = { outerMesh, innerMesh, baseLength: length };
  return group;
}

/**
 * Helper to create a horizontal speed-trail ribbon extending toward -Z.
 */
function createSpeedTrailRibbon(width, length, hexColor, opacity = 0.72) {
  const geo = new THREE.PlaneGeometry(width, length, 1, 6);
  geo.rotateX(-Math.PI * 0.5);
  geo.translate(0, 0, -length * 0.5);
  const mat = new THREE.MeshBasicMaterial({
    color: hexColor,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

function smoothCurved(geo) {
  geo.computeVertexNormals();
  return geo;
}

/**
 * Extrudes a 2D side silhouette `pts = [[z, y], ...]` across vehicle width `width`
 * with smooth 3-segment bevelled body shoulders and smooth vertex normals.
 */
function buildSculptedProfileGeometry(pts, width, bevelSize = 0.055, bevelThickness = 0.075) {
  const shape = new THREE.Shape();
  for (let i = 0; i < pts.length; i++) {
    const [z, y] = pts[i];
    if (i === 0) shape.moveTo(-z, y);
    else shape.lineTo(-z, y);
  }
  shape.closePath();
  const depth = Math.max(0.02, width - bevelThickness * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth,
    bevelEnabled: bevelSize > 0 && bevelThickness > 0,
    bevelThickness,
    bevelSize,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.rotateY(Math.PI * 0.5);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a smooth NACA airfoil surface lofted across `stations = [{ x, y, z, chord, thick }, ...]`.
 * If `isVertical` is true, `thick` expands along X and stations progress along Y/X.
 */
function buildContouredAirfoilGeometry(side, stations, profSegs = 18, isVertical = false) {
  const sSign = side >= 0 ? 1 : -1;
  const nStat = stations.length;
  const stride = profSegs + 1;
  const pos = [];
  const nrm = [];

  for (let is = 0; is < nStat; is++) {
    const st = stations[is];
    const zLE = st.z + st.chord * 0.48;
    const zTE = st.z - st.chord * 0.52;
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
      const camber = isVertical ? 0 : 0.016 * (1.0 - u) * u;
      const offset = (camber + sign * yt * (isVertical ? 0.95 : (s < 0.5 ? 1.05 : 0.85))) * st.thick;
      const z = zLE + (zTE - zLE) * u;

      const nz = -Math.cos(theta * 0.5);
      const nPerp = sign * Math.max(0.24, Math.sin(theta * 0.5));
      const nl = Math.hypot(nPerp, nz) || 1;

      if (isVertical) {
        pos.push(sSign * st.x + offset, st.y, z);
        nrm.push(nPerp / nl, 0.05, nz / nl);
      } else {
        pos.push(sSign * st.x, st.y + offset, z);
        nrm.push(0.04 * sSign, nPerp / nl, nz / nl);
      }
    }
  }

  const indices = [];
  for (let is = 0; is < nStat - 1; is++) {
    for (let ip = 0; ip < profSegs; ip++) {
      const a = is * stride + ip;
      const b = (is + 1) * stride + ip;
      const c = b + 1;
      const d = a + 1;
      if (sSign > 0 || isVertical) {
        indices.push(a, b, d, b, c, d);
      } else {
        indices.push(a, d, b, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/**
 * Builds a multi-part 3D vehicle model pivoted at bottom-center (y = 0 at tire contact).
 * Local forward is +Z, right is +X, up is +Y.
 */
export function createVehicleModel(typeId = 'cyber_mach1', options = {}) {
  if (typeId === 'fighter_jet' || typeId === 'plane' || typeId === 'propeller_plane') {
    return createPlaneModel(typeId === 'propeller_plane' ? 'propeller_plane' : 'fighter_jet', options);
  }
  if (options.hero && !options.standalone && (HERO_VEHICLE_IDS.has(typeId) || HEAVY_VEHICLE_IDS.has(typeId))) {
    return createHeroVehicleModel(typeId, options);
  }
  if (!options.standalone && isCustomFleetVehicle(typeId)) {
    return buildFleetVehicleModel(typeId, options);
  }
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.36, metalness: 0.48 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x262f3d, roughness: 0.40, metalness: 0.35 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.18, metalness: 0.78 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.82, metalness: 0.10 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.22, metalness: 0.75 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a52,
    roughness: 0.08,
    metalness: 0.25,
    transparent: true,
    opacity: 0.46,
  });
  const clearLensMat = new THREE.MeshStandardMaterial({
    color: 0xe2f1ff,
    roughness: 0.06,
    metalness: 0.15,
    transparent: true,
    opacity: 0.38,
  });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x28303d, roughness: 0.62, metalness: 0.18 });
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xfff5d6 });
  const drlLightMat = new THREE.MeshBasicMaterial({ color: 0xe0f7ff });
  const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff1e2e });

  const wheels = [];
  const frontSteerPivots = [];
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  chassis.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [], aeroFlaps: [] };

  if (typeId === 'cyber_mach1') {
    // ⚡ 轩辕·零式 1马赫未来超跑 (Mach-1 Cyber Hypercar — Sleek Metallic Titanium Silver / Gunmetal with Cyan/Magenta Aero)
    const hullColor = options.paintColor != null ? options.paintColor : 0x64748b;
    const hullMat = new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.28, metalness: 0.45 });
    const gunmetalMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.32, metalness: 0.42 });
    const silverAccentMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.24, metalness: 0.48 });
    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
    const magentaNeonMat = new THREE.MeshBasicMaterial({ color: 0xff2a85 });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x16384c,
      roughness: 0.08,
      metalness: 0.22,
      transparent: true,
      opacity: 0.44,
    });

    // 1. Sculpted Multi-Profile Supersonic Wedge Bodywork (extruded contoured side profile with smooth bevels)
    const lowerPanGeo = buildSculptedProfileGeometry([
      [-2.52, 0.20],
      [2.54, 0.18],
      [2.62, 0.34],
      [1.85, 0.52],
      [0.65, 0.56],
      [-1.35, 0.58],
      [-2.48, 0.52],
      [-2.56, 0.32],
    ], 2.08, 0.06, 0.08);
    const lowerPan = new THREE.Mesh(lowerPanGeo, hullMat);
    chassis.add(lowerPan);

    // Sculpted upper fastback monocoque deck
    const midDeckGeo = buildSculptedProfileGeometry([
      [-2.35, 0.50],
      [1.95, 0.46],
      [1.15, 0.68],
      [-0.45, 0.72],
      [-1.85, 0.66],
      [-2.38, 0.56],
    ], 1.78, 0.06, 0.08);
    const midDeck = new THREE.Mesh(midDeckGeo, gunmetalMat);
    chassis.add(midDeck);

    // Carbon aerodynamic front splitter + twin side dive canards + honeycomb intake grille
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.045, 0.62), carbonMat);
    frontSplitter.position.set(0, 0.16, 2.48);
    chassis.add(frontSplitter);
    for (const sx of [-1.04, 1.04]) {
      const canard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.32), cyanNeonMat);
      canard.position.set(sx, 0.26, 2.46);
      canard.rotation.x = 0.18;
      chassis.add(canard);
    }

    // Front supersonic needle nose cone & contoured hood power-dome + NACA extractor vents
    const noseGeo = smoothCurved(new THREE.ConeGeometry(0.96, 1.65, 20));
    noseGeo.rotateX(Math.PI * 0.5);
    noseGeo.scale(1.02, 0.22, 1.0);
    const noseMesh = new THREE.Mesh(noseGeo, silverAccentMat);
    noseMesh.position.set(0, 0.40, 2.05);
    chassis.add(noseMesh);

    const hoodBulge = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.28, 0.44, 1.45, 18)), hullMat);
    hoodBulge.rotation.x = Math.PI * 0.5;
    hoodBulge.scale.set(1.22, 0.32, 1.0);
    hoodBulge.position.set(0, 0.58, 1.32);
    chassis.add(hoodBulge);

    for (const sx of [-0.36, 0.36]) {
      const hoodVent = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.025, 0.38), carbonMat);
      hoodVent.position.set(sx, 0.58, 1.42);
      hoodVent.rotation.y = sx * -0.15;
      chassis.add(hoodVent);
    }

    // Fighter-jet teardrop glass bubble canopy + visible interior bucket seats, dashboard binnacle & steering yoke
    const canopyGeo = smoothCurved(new THREE.SphereGeometry(0.68, 24, 16));
    canopyGeo.scale(0.95, 0.46, 2.15);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.72, 0.10);
    chassis.add(canopy);

    // Raked A-pillar / canopy frame struts
    for (const sx of [-0.52, 0.52]) {
      const aStrut = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.34, 0.055), silverAccentMat);
      aStrut.position.set(sx, 0.74, 0.68);
      aStrut.rotation.x = -0.58;
      aStrut.rotation.z = sx * 0.25;
      chassis.add(aStrut);
    }

    for (const sx of [-0.26, 0.26]) {
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.12), interiorMat);
      seatBack.position.set(sx, 0.60, -0.18);
      seatBack.rotation.x = -0.26;
      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.09), cyanNeonMat);
      headrest.position.set(sx, 0.84, -0.24);
      chassis.add(seatBack, headrest);
    }
    const dashBinnacle = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.16, 0.38), interiorMat);
    dashBinnacle.position.set(0, 0.64, 0.62);
    const hudScreen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.02), cyanNeonMat);
    hudScreen.position.set(-0.26, 0.73, 0.52);
    chassis.add(dashBinnacle, hudScreen);

    const steeringYoke = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.11, 0.018, 8, 16)), chromeMat);
    steeringYoke.position.set(-0.26, 0.66, 0.38);
    steeringYoke.rotation.x = 0.35;
    chassis.add(steeringYoke);

    // Dorsal spine fin (LMP1 / supersonic stabilizer fin)
    const dorsalFinGeo = buildSculptedProfileGeometry([
      [-0.35, 0.68],
      [-0.75, 1.04],
      [-2.25, 0.98],
      [-2.35, 0.62],
    ], 0.07, 0.015, 0.02);
    const dorsalFin = new THREE.Mesh(dorsalFinGeo, hullMat);
    chassis.add(dorsalFin);
    const dorsalEdge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 1.55), cyanNeonMat);
    dorsalEdge.position.set(0, 1.02, -1.48);
    chassis.add(dorsalEdge);

    // Sculpted Rear Wing on Twin Swan-Neck Pylons
    const rearWingBlade = new THREE.Mesh(
      buildContouredAirfoilGeometry(1, [
        { x: -1.04, y: 0.92, z: -2.28, chord: 0.38, thick: 0.06 },
        { x: 1.04, y: 0.92, z: -2.28, chord: 0.38, thick: 0.06 },
      ], 16, false),
      gunmetalMat
    );
    chassis.add(rearWingBlade);
    for (const sx of [-0.52, 0.52]) {
      const swanNeck = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.32, 0.22), silverAccentMat);
      swanNeck.position.set(sx, 0.78, -2.20);
      swanNeck.rotation.x = 0.28;
      chassis.add(swanNeck);
    }

    // Side aerodynamic pontoon fenders, flared 3D wheel arches with inner wheel-well liners, mirrors, door handles
    for (const sx of [-0.92, 0.92]) {
      const sign = Math.sign(sx);
      const fenderGeo = buildSculptedProfileGeometry([
        [-2.28, 0.24],
        [2.22, 0.22],
        [2.05, 0.62],
        [-2.15, 0.66],
      ], 0.38, 0.04, 0.05);
      fenderGeo.translate(sx, 0, 0);
      const fender = new THREE.Mesh(fenderGeo, hullMat);
      chassis.add(fender);

      // Sculpted wheel-arch flares + dark inner wheel-well liners (front & rear)
      for (const wz of [1.58, -1.56]) {
        const archFlare = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.41, 0.058, 12, 22, Math.PI)), silverAccentMat);
        archFlare.rotation.y = Math.PI * 0.5;
        archFlare.position.set(sx + sign * 0.16, 0.38, wz);
        chassis.add(archFlare);

        const wellLiner = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.39, 0.39, 0.36, 18, 1, false, 0, Math.PI)), tireMat);
        wellLiner.rotation.z = Math.PI * 0.5;
        wellLiner.position.set(sx + sign * 0.02, 0.38, wz);
        chassis.add(wellLiner);
      }

      // Aerodynamic wing mirror on stalk + flush door handle
      const mirrorStalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.05), carbonMat);
      mirrorStalk.position.set(sx + sign * 0.14, 0.66, 0.78);
      mirrorStalk.rotation.z = -sign * 0.22;
      chassis.add(mirrorStalk);
      const mirrorCap = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.075, 12, 10)), silverAccentMat);
      mirrorCap.scale.set(1.25, 0.65, 0.85);
      mirrorCap.position.set(sx + sign * 0.22, 0.68, 0.76);
      chassis.add(mirrorCap);

      const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.16), chromeMat);
      doorHandle.position.set(sx + sign * 0.19, 0.56, -0.05);
      chassis.add(doorHandle);

      // Glowing cyan laser trim along full side skirt & fender arch
      const sideStrip = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.035, 4.48), cyanNeonMat);
      sideStrip.position.set(sx, 0.24, 0.05);
      chassis.add(sideStrip);

      const topStrip = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, 4.20), cyanNeonMat);
      topStrip.position.set(sx, 0.66, 0.02);
      chassis.add(topStrip);

      // Active rear delta airbrake / aero-flap
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.52), gunmetalMat);
      flap.position.set(sx * 0.72, 0.76, -2.18);
      chassis.add(flap);
      const flapTip = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.03, 0.08), magentaNeonMat);
      flapTip.position.set(0, 0.02, -0.24);
      flap.add(flapTip);
      vfxParts.aeroFlaps.push(flap);
    }

    // Rear carbon diffuser with 6 vertical Venturi strakes
    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.14, 0.42), carbonMat);
    rearDiffuser.position.set(0, 0.22, -2.42);
    chassis.add(rearDiffuser);
    for (const dx of [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75]) {
      const strake = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.18, 0.44), carbonMat);
      strake.position.set(dx, 0.20, -2.44);
      chassis.add(strake);
    }

    // Front laser blade headlights + multi-element LED projectors under clear covers + rear cyber lightbar
    const frontLaserBar = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.045, 0.10), cyanNeonMat);
    frontLaserBar.position.set(0, 0.39, 2.52);
    chassis.add(frontLaserBar);

    for (const sx of [-0.72, 0.72]) {
      for (const lx of [-0.08, 0.08]) {
        const proj = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 14)), headLightMat);
        proj.rotation.x = Math.PI * 0.5;
        proj.position.set(sx + lx, 0.43, 2.46);
        chassis.add(proj);
      }
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.12), clearLensMat);
      cover.position.set(sx, 0.43, 2.48);
      chassis.add(cover);
    }

    const rearLaserBar = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.06, 0.08), magentaNeonMat);
    rearLaserBar.position.set(0, 0.56, -2.54);
    chassis.add(rearLaserBar);

    // Twin rear plasma turbine thruster nozzles + quad auxiliary chrome exhaust tips
    const nozzleGeo = smoothCurved(new THREE.CylinderGeometry(0.22, 0.28, 0.36, 20, 1, false));
    nozzleGeo.rotateX(Math.PI * 0.5);
    for (const sx of [-0.42, 0.42]) {
      const nozzle = new THREE.Mesh(nozzleGeo, darkMetal);
      nozzle.position.set(sx, 0.44, -2.52);
      chassis.add(nozzle);

      const coreGlow = new THREE.Mesh(smoothCurved(new THREE.CircleGeometry(0.19, 16)), cyanNeonMat);
      coreGlow.rotation.y = Math.PI;
      coreGlow.position.set(sx, 0.44, -2.71);
      chassis.add(coreGlow);
    }
    const quadPipeGeo = smoothCurved(new THREE.CylinderGeometry(0.048, 0.048, 0.22, 14));
    quadPipeGeo.rotateX(Math.PI * 0.5);
    for (const ex of [-0.82, -0.70, 0.70, 0.82]) {
      const tip = new THREE.Mesh(quadPipeGeo, chromeMat);
      tip.position.set(ex, 0.32, -2.52);
      chassis.add(tip);
    }

    group.userData.paintMeshes = [lowerPan, noseMesh, hoodBulge, dorsalFin];

    // 4 Cyber-Performance Wheels with 5-Spoke Alloy Rims, Brake Discs & Red Calipers
    const wheelCoords = [
      [-1.02, 1.58, true],
      [1.02, 1.58, true],
      [-1.04, -1.56, false],
      [1.04, -1.56, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildWheelAssembly(0.38, 0.30, tireMat, rimMat, 0xe6192e);
      pivot.position.set(wx, 0.38, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // === MACH-1 CYBER HYPERCAR NITRO VFX ===
    for (const sx of [-0.46, 0.46]) {
      const plume = createThrusterFlameCone(0.24, 3.4, 0xffffff, 0x00f5ff);
      plume.position.set(sx, 0.42, -2.58);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);

      for (let d = 1; d <= 4; d++) {
        const diaGeo = smoothCurved(new THREE.OctahedronGeometry(0.12 - d * 0.018, 0));
        diaGeo.scale(1.0, 1.0, 1.6);
        const dia = new THREE.Mesh(
          diaGeo,
          new THREE.MeshBasicMaterial({
            color: d % 2 === 0 ? 0xff2a85 : 0x00f5ff,
            transparent: true,
            opacity: 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        dia.position.set(sx, 0.42, -2.62 - d * 0.72);
        nitroVfx.add(dia);
        vfxParts.rings.push(dia);
      }
    }

    const centerPlume = createThrusterFlameCone(0.28, 4.2, 0x80ffdb, 0xff2a85);
    centerPlume.position.set(0, 0.44, -2.60);
    nitroVfx.add(centerPlume);
    vfxParts.plumes.push(centerPlume);

    const machConeGeo = smoothCurved(new THREE.ConeGeometry(2.35, 3.6, 20, 2, true));
    machConeGeo.rotateX(Math.PI * 0.5);
    const machConeMat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const machCone = new THREE.Mesh(machConeGeo, machConeMat);
    machCone.position.set(0, 0.58, 0.15);
    nitroVfx.add(machCone);
    vfxParts.shockCones.push(machCone);

    for (const [rz, innerR, outerR, colHex] of [
      [1.35, 1.05, 1.22, 0x00f5ff],
      [0.10, 1.68, 1.88, 0xff2a85],
      [-1.15, 2.22, 2.46, 0x00f5ff],
    ]) {
      const ringGeo = smoothCurved(new THREE.RingGeometry(innerR, outerR, 32));
      const ringMat = new THREE.MeshBasicMaterial({
        color: colHex,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(0, 0.58, rz);
      nitroVfx.add(ringMesh);
      vfxParts.rings.push(ringMesh);
    }

    for (const [tx, ty, tz, colHex, w] of [
      [-1.02, 0.22, -2.4, 0x00f5ff, 0.20],
      [1.02, 0.22, -2.4, 0x00f5ff, 0.20],
      [-0.72, 0.78, -2.4, 0xff2a85, 0.14],
      [0.72, 0.78, -2.4, 0xff2a85, 0.14],
    ]) {
      const ribbon = createSpeedTrailRibbon(w, 12.0, colHex, 0.78);
      ribbon.position.set(tx, ty, tz);
      nitroVfx.add(ribbon);
      vfxParts.trails.push(ribbon);
    }

    const underGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 5.6),
      new THREE.MeshBasicMaterial({
        color: 0x00f5ff,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    underGlow.rotation.x = -Math.PI * 0.5;
    underGlow.position.set(0, 0.08, 0);
    nitroVfx.add(underGlow);
  } else if (typeId === 'aero_formula') {
    // 🏎️ 燕京·量子矢量方程式 (Quantum Formula Aero — Sculpted Monocoque & Airfoil Wings)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.24, metalness: 0.45 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.24, metalness: 0.68 });

    // Sculpted formula monocoque tub & drooped needle nose cone
    const tubGeo = buildSculptedProfileGeometry([
      [-2.15, 0.20],
      [1.65, 0.22],
      [2.45, 0.26],
      [1.45, 0.58],
      [0.35, 0.62],
      [-0.25, 0.56],
      [-0.65, 0.96],
      [-1.95, 0.56],
    ], 0.78, 0.05, 0.06);
    const tub = new THREE.Mesh(tubGeo, bodyMat);
    chassis.add(tub);

    const noseCone = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.32, 1.45, 18)), bodyMat);
    noseCone.rotation.x = Math.PI * 0.5;
    noseCone.scale.set(1.0, 0.58, 1.0);
    noseCone.position.set(0, 0.30, 2.15);
    chassis.add(noseCone);

    // Sculpted sidepods with ground-effect radiator inlets & bargeboards
    for (const sx of [-0.62, 0.62]) {
      const podGeo = buildSculptedProfileGeometry([
        [-1.45, 0.20],
        [0.85, 0.20],
        [0.72, 0.56],
        [-1.35, 0.46],
      ], 0.48, 0.04, 0.05);
      podGeo.translate(sx, 0, 0);
      const pod = new THREE.Mesh(podGeo, carbonMat);
      chassis.add(pod);
      const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.035, 2.16), goldMat);
      goldTrim.position.set(sx, 0.56, -0.28);
      chassis.add(goldTrim);
    }

    // Multi-element airfoil front wing with endplates
    const frontWing = new THREE.Mesh(
      buildContouredAirfoilGeometry(1, [
        { x: -0.99, y: 0.16, z: 2.34, chord: 0.52, thick: 0.05 },
        { x: 0.99, y: 0.16, z: 2.34, chord: 0.52, thick: 0.05 },
      ], 14, false),
      carbonMat
    );
    chassis.add(frontWing);
    const fwFlap = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.035, 0.22), bodyMat);
    fwFlap.position.set(0, 0.21, 2.24);
    fwFlap.rotation.x = -0.22;
    chassis.add(fwFlap);
    const fwStrip = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.10), goldMat);
    fwStrip.position.set(0, 0.20, 2.54);
    chassis.add(fwStrip);
    for (const sx of [-0.99, 0.99]) {
      const fwEndplate = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.56), carbonMat);
      fwEndplate.position.set(sx, 0.24, 2.34);
      chassis.add(fwEndplate);
    }

    // Halo cockpit titanium protection + visible driver helmet + F1 steering wheel + overhead airbox scoop
    const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 1.15), bodyMat);
    airbox.position.set(0, 0.78, -0.65);
    chassis.add(airbox);

    const driverHelmet = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.13, 14, 12)), goldMat);
    driverHelmet.position.set(0, 0.66, -0.08);
    const f1Wheel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.04), carbonMat);
    f1Wheel.position.set(0, 0.62, 0.28);
    chassis.add(driverHelmet, f1Wheel);

    const haloArch = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.34, 0.028, 10, 20, Math.PI)), carbonMat);
    haloArch.rotation.x = Math.PI * 0.45;
    haloArch.position.set(0, 0.68, 0.12);
    chassis.add(haloArch);

    // High-downforce swan-neck airfoil rear wing + rear Venturi diffuser
    const rearWing = new THREE.Mesh(
      buildContouredAirfoilGeometry(1, [
        { x: -0.92, y: 0.92, z: -2.18, chord: 0.46, thick: 0.07 },
        { x: 0.92, y: 0.92, z: -2.18, chord: 0.46, thick: 0.07 },
      ], 14, false),
      carbonMat
    );
    chassis.add(rearWing);
    const rwEdge = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.04, 0.08), goldMat);
    rwEdge.position.set(0, 0.97, -2.38);
    chassis.add(rwEdge);
    for (const sx of [-0.92, 0.92]) {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.54), carbonMat);
      endplate.position.set(sx, 0.72, -2.18);
      chassis.add(endplate);
    }

    group.userData.paintMeshes = [tub, noseCone, airbox];

    // 4 Exposed Formula Slick Wheels with 5-Spoke Alloy Rims, Brake Discs & Red Calipers
    const wheelCoords = [
      [-0.96, 1.56, true],
      [0.96, 1.56, true],
      [-0.98, -1.52, false],
      [0.98, -1.52, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildWheelAssembly(0.36, 0.34, tireMat, goldMat, 0xe6192e);
      pivot.position.set(wx, 0.36, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    const centerPlume = createThrusterFlameCone(0.30, 5.2, 0xffffff, 0x10b981);
    centerPlume.position.set(0, 0.42, -2.32);
    nitroVfx.add(centerPlume);
    vfxParts.plumes.push(centerPlume);

    for (const sx of [-0.90, 0.90]) {
      const tipTrail = createSpeedTrailRibbon(0.14, 11.0, 0xffd166, 0.75);
      tipTrail.position.set(sx, 0.94, -2.35);
      nitroVfx.add(tipTrail);
      vfxParts.trails.push(tipTrail);
    }
  } else if (typeId === 'bus') {
    const redMat = new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.26, metalness: 0.28 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.28, metalness: 0.18 });

    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.35, 10.4), redMat);
    lowerHull.position.set(0, 0.95, 0);
    chassis.add(lowerHull);

    const upperHull = new THREE.Mesh(new THREE.BoxGeometry(2.46, 1.85, 10.3), whiteMat);
    upperHull.position.set(0, 2.55, 0);
    chassis.add(upperHull);

    const roofBand = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.35, 10.35), redMat);
    roofBand.position.set(0, 3.55, 0);
    chassis.add(roofBand);

    // Roof HVAC air-conditioning pods & side gantry mirrors
    for (const rz of [-2.4, 1.8]) {
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.24, 1.85), whiteMat);
      hvac.position.set(0, 3.82, rz);
      chassis.add(hvac);
    }

    const winLower = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.65, 9.4), glassMat);
    winLower.position.set(0, 1.75, 0.1);
    chassis.add(winLower);

    const winUpper = new THREE.Mesh(new THREE.BoxGeometry(2.50, 0.72, 9.6), glassMat);
    winUpper.position.set(0, 3.0, 0.05);
    chassis.add(winUpper);

    const signMat = new THREE.MeshBasicMaterial({ color: 0xffb703 });
    const routeBoard = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 0.08), signMat);
    routeBoard.position.set(0, 2.3, 5.18);
    chassis.add(routeBoard);

    for (const sx of [-0.9, 0.9]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.08), headLightMat);
      hl.position.set(sx, 0.75, 5.21);
      chassis.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.08), tailLightMat);
      tl.position.set(sx, 0.85, -5.21);
      chassis.add(tl);
    }

    const wheelOffsets = [
      [-1.22, 3.2, true], [1.22, 3.2, true],
      [-1.22, -1.8, false], [1.22, -1.8, false],
      [-1.22, -3.3, false], [1.22, -3.3, false],
    ];
    for (const [wx, wz, isFront] of wheelOffsets) {
      const { pivot, wheelMesh } = buildWheelAssembly(0.48, 0.32, tireMat, rimMat, 0xd90429);
      pivot.position.set(wx, 0.48, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    for (const [bx, by] of [[-0.85, 0.65], [0.85, 0.65], [-0.95, 3.45], [0.95, 3.45]]) {
      const plume = createThrusterFlameCone(0.34, 4.8, 0xfff3b0, 0xff5400);
      plume.position.set(bx, by, -5.25);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);
    }
    for (const sx of [-1.22, 1.22]) {
      const ribbon = createSpeedTrailRibbon(0.22, 10.0, 0xff9e00, 0.68);
      ribbon.position.set(sx, 0.25, -5.2);
      nitroVfx.add(ribbon);
      vfxParts.trails.push(ribbon);
    }
  } else {
    // =========================================================================
    // Sculpted Multi-Profile Sports / GT Coupe, City Taxi & Police Interceptor
    // =========================================================================
    let lowerCol = 0x1d4e89; // Beijing Taxi lower blue band
    let upperCol = 0xf4b942; // Beijing Taxi upper golden-yellow
    let cabinH = 0.56;
    let bodyH = 0.60;
    let bodyW = 1.90;
    let bodyL = 4.50;

    if (typeId === 'supercar') {
      lowerCol = 0xd90429;
      upperCol = 0xd90429;
      cabinH = 0.44;
      bodyH = 0.48;
      bodyW = 2.04;
      bodyL = 4.60;
    } else if (typeId === 'police') {
      lowerCol = 0x1e3a5f;
      upperCol = 0xf8f9fa;
      cabinH = 0.60;
      bodyH = 0.64;
      bodyW = 1.96;
      bodyL = 4.68;
    }

    if (options.paintColor != null) {
      lowerCol = options.paintColor;
      if (typeId === 'supercar') upperCol = options.paintColor;
    }

    const lowerMat = new THREE.MeshStandardMaterial({ color: lowerCol, roughness: 0.24, metalness: 0.42 });
    const upperMat = new THREE.MeshStandardMaterial({ color: upperCol, roughness: 0.20, metalness: 0.38 });

    // 1. Sculpted Multi-Profile Lower & Upper Bodywork (`ExtrudeGeometry` with smooth bevelled shoulders)
    const halfL = bodyL * 0.5;
    const yBase = 0.28;
    const yMid = 0.35 + bodyH * 0.52;
    const yTop = 0.35 + bodyH;

    const lowerBodyGeo = buildSculptedProfileGeometry([
      [-halfL + 0.04, yBase + 0.04],
      [halfL - 0.04, yBase],
      [halfL + 0.04, yBase + 0.16],
      [halfL - 0.08, yMid + 0.04],
      [-halfL + 0.06, yMid + 0.06],
      [-halfL - 0.02, yBase + 0.18],
    ], bodyW, 0.055, 0.075);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, lowerMat);
    chassis.add(lowerBody);

    const upperBodyGeo = buildSculptedProfileGeometry([
      [-halfL + 0.08, yMid],
      [halfL - 0.10, yMid - 0.02],
      [halfL - 0.24, yTop - 0.06],
      [halfL * 0.28, yTop + 0.02],
      [-halfL * 0.52, yTop + 0.04],
      [-halfL + 0.14, yTop - 0.04],
    ], bodyW * 0.96, 0.065, 0.085);
    const upperBody = new THREE.Mesh(upperBodyGeo, upperMat);
    chassis.add(upperBody);

    // 2. Contoured Hood Power-Dome & Twin Heat-Extractor Vents
    const hoodBulgeGeo = smoothCurved(new THREE.CylinderGeometry(bodyW * 0.24, bodyW * 0.32, bodyL * 0.32, 18));
    hoodBulgeGeo.rotateX(Math.PI * 0.5);
    hoodBulgeGeo.scale(1.15, 0.22, 1.0);
    const hoodBulge = new THREE.Mesh(hoodBulgeGeo, upperMat);
    hoodBulge.position.set(0, yTop + 0.01, bodyL * 0.27);
    chassis.add(hoodBulge);

    for (const sx of [-bodyW * 0.22, bodyW * 0.22]) {
      const hoodVent = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.34), carbonMat);
      hoodVent.position.set(sx, yTop + 0.02, bodyL * 0.28);
      hoodVent.rotation.y = sx * -0.12;
      chassis.add(hoodVent);
    }

    // 3. Sculpted Aerodynamic Front Splitter + Dive Canards + Honeycomb Radiator Grille & Emblem
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.03, 0.055, 0.36), carbonMat);
    frontSplitter.position.set(0, 0.26, halfL + 0.08);
    chassis.add(frontSplitter);

    for (const sx of [-bodyW * 0.50, bodyW * 0.50]) {
      const diveCanard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.24), carbonMat);
      diveCanard.position.set(sx, 0.32, halfL + 0.06);
      chassis.add(diveCanard);
    }

    const grilleFrame = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.58, bodyH * 0.42, 0.09), carbonMat);
    grilleFrame.position.set(0, 0.35 + bodyH * 0.38, halfL + 0.01);
    chassis.add(grilleFrame);

    for (let g = -3; g <= 3; g++) {
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.018, bodyH * 0.36, 0.10), darkMetal);
      vBar.position.set(g * (bodyW * 0.075), 0.35 + bodyH * 0.38, halfL + 0.015);
      chassis.add(vBar);
    }
    for (const gy of [-0.05, 0.05]) {
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.54, 0.016, 0.105), darkMetal);
      hBar.position.set(0, 0.35 + bodyH * 0.38 + gy, halfL + 0.018);
      chassis.add(hBar);
    }
    const badge = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.058, 0.058, 0.028, 16)), chromeMat);
    badge.rotation.x = Math.PI * 0.5;
    badge.position.set(0, 0.35 + bodyH * 0.42, halfL + 0.058);
    chassis.add(badge);

    // 4. Flared 3D Wheel Arches with Inner Wheel-Well Liners, Side Skirts, Mirrors & Flush Door Handles
    const wxOff = bodyW * 0.48;
    const wzOff = bodyL * 0.33;
    for (const sx of [-1, 1]) {
      const sideSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.085, bodyL * 0.58), carbonMat);
      sideSkirt.position.set(sx * (bodyW * 0.50), 0.28, 0);
      chassis.add(sideSkirt);

      for (const wz of [wzOff, -wzOff]) {
        const flareGeo = smoothCurved(new THREE.TorusGeometry(0.39, 0.056, 12, 22, Math.PI));
        const flare = new THREE.Mesh(flareGeo, upperMat);
        flare.rotation.y = Math.PI * 0.5;
        flare.position.set(sx * (bodyW * 0.49), 0.38, wz);
        chassis.add(flare);

        // Dark cylindrical inner wheel-well liner
        const wellLiner = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.37, 0.37, 0.32, 18, 1, false, 0, Math.PI)), tireMat);
        wellLiner.rotation.z = Math.PI * 0.5;
        wellLiner.position.set(sx * (bodyW * 0.40), 0.38, wz);
        chassis.add(wellLiner);
      }

      // Aerodynamic wing mirror on stalk
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.032, 0.045), darkMetal);
      stalk.position.set(sx * (bodyW * 0.47), yTop + 0.04, bodyL * 0.14);
      stalk.rotation.z = -sx * 0.26;
      chassis.add(stalk);

      const mirrorCap = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.075, 12, 10)), upperMat);
      mirrorCap.scale.set(1.25, 0.65, 0.85);
      mirrorCap.position.set(sx * (bodyW * 0.54), yTop + 0.07, bodyL * 0.13);
      chassis.add(mirrorCap);

      // Flush chrome door handles
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.032, 0.16), chromeMat);
      handle.position.set(sx * (bodyW * 0.50), 0.35 + bodyH * 0.78, -0.08);
      chassis.add(handle);
    }

    // 5. Sculpted Fastback Cabin Greenhouse + Raked A/B/C Pillars + Visible Bucket Seats, Dashboard & Steering Wheel
    const cabinBaseY = yTop;
    const cabinGeo = buildSculptedProfileGeometry([
      [-bodyL * 0.36, cabinBaseY - 0.02],
      [bodyL * 0.14, cabinBaseY - 0.02],
      [bodyL * 0.02, cabinBaseY + cabinH * 0.88],
      [-bodyL * 0.24, cabinBaseY + cabinH * 0.86],
    ], bodyW * 0.80, 0.045, 0.055);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    chassis.add(cabin);

    const cabinRoofGeo = buildSculptedProfileGeometry([
      [-bodyL * 0.25, cabinBaseY + cabinH * 0.84],
      [bodyL * 0.03, cabinBaseY + cabinH * 0.86],
      [bodyL * 0.01, cabinBaseY + cabinH * 0.95],
      [-bodyL * 0.23, cabinBaseY + cabinH * 0.94],
    ], bodyW * 0.76, 0.03, 0.04);
    const cabinRoof = new THREE.Mesh(cabinRoofGeo, upperMat);
    chassis.add(cabinRoof);

    // Raked A, B, and C Roof Pillars
    for (const sx of [-bodyW * 0.38, bodyW * 0.38]) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.055, cabinH * 1.05, 0.065), upperMat);
      aPillar.position.set(sx, cabinBaseY + cabinH * 0.44, bodyL * 0.08);
      aPillar.rotation.x = -0.52;
      chassis.add(aPillar);

      const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.048, cabinH * 0.90, 0.085), darkMetal);
      bPillar.position.set(sx * 1.02, cabinBaseY + cabinH * 0.42, -0.12);
      chassis.add(bPillar);

      const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.065, cabinH * 1.06, 0.12), upperMat);
      cPillar.position.set(sx, cabinBaseY + cabinH * 0.42, -bodyL * 0.30);
      cPillar.rotation.x = 0.58;
      chassis.add(cPillar);
    }

    // Interior sport bucket seats with headrests, dashboard binnacle & steering wheel
    for (const sx of [-bodyW * 0.20, bodyW * 0.20]) {
      const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.36), interiorMat);
      seatCushion.position.set(sx, cabinBaseY - 0.02, -0.08);
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.36, cabinH * 0.72, 0.10), interiorMat);
      seatBack.position.set(sx, cabinBaseY + cabinH * 0.26, -0.22);
      seatBack.rotation.x = -0.22;
      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.08), interiorMat);
      headrest.position.set(sx, cabinBaseY + cabinH * 0.66, -0.26);
      chassis.add(seatCushion, seatBack, headrest);
    }
    const dashBoard = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.74, 0.16, 0.28), interiorMat);
    dashBoard.position.set(0, cabinBaseY + cabinH * 0.18, 0.22);
    chassis.add(dashBoard);

    const steeringWheel = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.13, 0.020, 8, 16)), darkMetal);
    steeringWheel.position.set(-bodyW * 0.20, cabinBaseY + cabinH * 0.28, 0.12);
    steeringWheel.rotation.x = 0.38;
    chassis.add(steeringWheel);

    // 6. Sculpted Front & Rear Bumpers + Rear Carbon Diffuser + Quad Chrome Exhaust Tips
    const fBumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.01, 0.22, 0.20), darkMetal);
    fBumper.position.set(0, 0.40, halfL);
    chassis.add(fBumper);

    const rBumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.01, 0.22, 0.20), darkMetal);
    rBumper.position.set(0, 0.40, -halfL);
    chassis.add(rBumper);

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.88, 0.15, 0.26), carbonMat);
    diffuser.position.set(0, 0.28, -halfL - 0.02);
    chassis.add(diffuser);
    for (const fx of [-0.48, -0.16, 0.16, 0.48]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.16, 0.28), carbonMat);
      fin.position.set(fx, 0.26, -halfL - 0.04);
      chassis.add(fin);
    }

    const pipeGeo = smoothCurved(new THREE.CylinderGeometry(0.052, 0.052, 0.22, 16));
    pipeGeo.rotateX(Math.PI * 0.5);
    const boreGeo = smoothCurved(new THREE.CircleGeometry(0.038, 14));
    boreGeo.rotateY(Math.PI);
    for (const ex of [-bodyW * 0.34, -bodyW * 0.26, bodyW * 0.26, bodyW * 0.34]) {
      const tip = new THREE.Mesh(pipeGeo, chromeMat);
      tip.position.set(ex, 0.30, -halfL - 0.06);
      chassis.add(tip);
      const bore = new THREE.Mesh(boreGeo, carbonMat);
      bore.position.set(ex, 0.30, -halfL - 0.172);
      chassis.add(bore);
    }

    // 7. Type-specific Roof & Sculpted Airfoil Rear Wing on Twin Swan-Neck Pylons
    const roofY = cabinBaseY + cabinH * 0.92;
    if (typeId === 'taxi' && !options.hideTaxiSign) {
      const signMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
      const taxiSign = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.24), signMat);
      taxiSign.position.set(0, roofY + 0.11, -0.05);
      chassis.add(taxiSign);
    } else if (typeId === 'police') {
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.10, 0.26), darkMetal);
      barBase.position.set(0, roofY + 0.06, -0.08);
      chassis.add(barBase);
      const redBeacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.14, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xff1e1e })
      );
      redBeacon.userData = { emitCode: 4 };
      redBeacon.position.set(-0.3, roofY + 0.12, -0.08);
      chassis.add(redBeacon);
      const blueBeacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.14, 0.22),
        new THREE.MeshBasicMaterial({ color: 0x1e88ff })
      );
      blueBeacon.userData = { emitCode: 5 };
      blueBeacon.position.set(0.3, roofY + 0.12, -0.08);
      chassis.add(blueBeacon);
      group.userData.lightbarParts = {
        typeId: 'police',
        phaseAMeshes: [redBeacon],
        phaseBMeshes: [blueBeacon],
      };
    }

    const wingHeight = typeId === 'supercar' ? 0.28 : 0.14;
    const wingBlade = new THREE.Mesh(
      buildContouredAirfoilGeometry(1, [
        { x: -bodyW * 0.47, y: yTop + wingHeight, z: -bodyL * 0.45, chord: 0.34, thick: 0.055 },
        { x: bodyW * 0.47, y: yTop + wingHeight, z: -bodyL * 0.45, chord: 0.34, thick: 0.055 },
      ], 14, false),
      carbonMat
    );
    chassis.add(wingBlade);
    vfxParts.aeroFlaps.push(wingBlade);
    for (const sx of [-0.52, 0.52]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, wingHeight, 0.18), carbonMat);
      strut.position.set(sx, yTop + wingHeight * 0.50, -bodyL * 0.44);
      strut.rotation.x = 0.22;
      chassis.add(strut);
    }
    for (const sx of [-bodyW * 0.47, bodyW * 0.47]) {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.36), upperMat);
      endplate.position.set(sx, yTop + wingHeight, -bodyL * 0.45);
      chassis.add(endplate);
    }

    group.userData.paintMeshes = [lowerBody, upperBody, hoodBulge, cabinRoof];

    // 8. Multi-Projector LED Headlights under Clear Covers + DRL Strips + Full-Width LED Taillight Bar
    const fullTailBar = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.92, 0.055, 0.06), tailLightMat);
    fullTailBar.position.set(0, 0.35 + bodyH * 0.72, -halfL - 0.02);
    chassis.add(fullTailBar);

    for (const sx of [-bodyW * 0.36, bodyW * 0.36]) {
      const hlHousing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.10), darkMetal);
      hlHousing.position.set(sx, 0.35 + bodyH * 0.62, halfL + 0.01);
      chassis.add(hlHousing);

      for (const lx of [-0.08, 0.08]) {
        const lens = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.048, 0.048, 0.04, 14)), headLightMat);
        lens.rotation.x = Math.PI * 0.5;
        lens.position.set(sx + lx, 0.35 + bodyH * 0.60, halfL + 0.05);
        chassis.add(lens);
      }

      const clearCover = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.17, 0.11), clearLensMat);
      clearCover.position.set(sx, 0.35 + bodyH * 0.62, halfL + 0.02);
      chassis.add(clearCover);

      const drlStrip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.028, 0.05), drlLightMat);
      drlStrip.position.set(sx, 0.35 + bodyH * 0.71, halfL + 0.045);
      drlStrip.rotation.z = sx > 0 ? -0.12 : 0.12;
      chassis.add(drlStrip);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.08), tailLightMat);
      tl.position.set(sx, 0.35 + bodyH * 0.66, -halfL - 0.02);
      chassis.add(tl);
    }

    // 9. 4 Performance Wheels (5-Spoke Alloy Rims + Brake Discs + Red Calipers inside 24-Segment Tires)
    const wheelCoords = [
      [-wxOff, wzOff, true],
      [wxOff, wzOff, true],
      [-wxOff, -wzOff, false],
      [wxOff, -wzOff, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildWheelAssembly(0.36, 0.26, tireMat, rimMat, 0xe6192e);
      pivot.position.set(wx, 0.36, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // Twin Blue-Violet N2O Exhaust Plumes + Taillight Streaks
    const flameOuter = typeId === 'supercar' ? 0xff4d00 : 0x3a86ff;
    const trailCol = typeId === 'supercar' ? 0xff0055 : 0x00e5ff;
    for (const sx of [-bodyW * 0.32, bodyW * 0.32]) {
      const plume = createThrusterFlameCone(0.24, 3.8, 0xffffff, flameOuter);
      plume.position.set(sx, 0.38, -halfL - 0.08);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);

      const trail = createSpeedTrailRibbon(0.16, 9.5, trailCol, 0.72);
      trail.position.set(sx, 0.35 + bodyH * 0.65, -halfL - 0.1);
      nitroVfx.add(trail);
      vfxParts.trails.push(trail);
    }
  }

  group.traverse((obj) => {
    if (obj.isMesh && !nitroVfx.getObjectById(obj.id)) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  group.userData = {
    ...group.userData,
    typeId,
    chassis,
    wheels,
    frontSteerPivots,
    nitroVfx,
    vfxParts,
  };
  if (options.paintColor != null) {
    applyVehiclePaint(group, options.paintColor);
  }
  return group;
}

/**
 * Explicit builder for high-craftsmanship Player Sports / Grand-Tourer Car (`createCarModel`).
 */
export function createCarModel(typeId = 'supercar', options = {}) {
  return createVehicleModel(typeId, { ...options, standalone: true });
}

// [hero-vehicles] Detailed body for the player's own car, with the same userData contract and nitro VFX.
// Builders return { group, chassis, wheels, frontSteerPivots, paintMeshes, lightbarParts, exhausts,
// trails?: [[x, y, z]], userData?: {...extra keys such as isTank/turret/barrel/muzzlePoint} }.
function createHeroVehicleModel(typeId, options) {
  const hero = HEAVY_VEHICLE_IDS.has(typeId) ? buildHeavyVehicle(typeId, options) : buildHeroVehicle(typeId, options);
  const { group, chassis } = hero;
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  chassis.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [], aeroFlaps: [] };
  // [nitro-fx] shader exhaust flames + world-space tail-light trails (NitroFx) instead of cones and ribbons
  const tailZ = -VEHICLE_SPECS.find((s) => s.id === typeId).length / 2 - 0.05;
  const style = nitroStyleFor(typeId);
  const low = hero.exhausts.filter(([, y, z]) => style !== 'diesel' || y < 2.5 || z > tailZ + 1.5); // diesel: no roof "rockets"
  const exhausts = (low.length ? low : hero.exhausts).map(([x, y, z]) => (z > tailZ + 1.5 ? { pos: [x, y + 0.08, z], dir: [0, 1, -0.25] } : [x, y, z])); // stacks point up
  const big = style === 'diesel' && typeId !== 'tank';
  const trailColors = typeId === 'cyber_mach1' ? [0x00f5ff, 0x00f5ff, 0xff2a85, 0xff2a85] : null;
  vfxParts.rig = createNitroRig(nitroVfx, {
    style, exhausts, trails: hero.trails || [[-0.66, 0.85, tailZ], [0.66, 0.85, tailZ]], trailColors,
    radius: big ? 0.34 : hero.exhausts.length > 2 && style !== 'diesel' ? 0.12 : undefined, length: big ? 3.8 : undefined,
    aeroFlaps: vfxParts.aeroFlaps,
  });
  group.userData = {
    ...(hero.userData || {}),
    typeId,
    hero: true,
    chassis,
    wheels: hero.wheels,
    frontSteerPivots: hero.frontSteerPivots,
    nitroVfx,
    vfxParts,
    paintMeshes: hero.paintMeshes,
    sirenActive: false,
  };
  if (hero.lightbarParts) group.userData.lightbarParts = hero.lightbarParts;
  if (options.paintColor != null) applyVehiclePaint(group, options.paintColor);
  return group;
}

/**
 * Builds a high-craftsmanship 24-segment wheel assembly with 5-spoke alloy rims,
 * ventilated steel brake disc rotor, and stationary red Brembo brake caliper.
 */
function buildWheelAssembly(radius, width, tireMat, rimMat, caliperHex = 0xe6192e) {
  const pivot = new THREE.Group();
  const wheelMesh = new THREE.Group();

  // 1. 24-Segment Vulcanized Rubber Tire + Beveled Sidewall Shoulders
  const tireGeo = smoothCurved(new THREE.CylinderGeometry(radius, radius, width, 24));
  tireGeo.rotateZ(Math.PI * 0.5);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  wheelMesh.add(tire);

  const shoulderGeo = smoothCurved(new THREE.TorusGeometry(radius * 0.84, width * 0.15, 10, 24));
  shoulderGeo.rotateY(Math.PI * 0.5);
  for (const sx of [-width * 0.38, width * 0.38]) {
    const sh = new THREE.Mesh(shoulderGeo, tireMat);
    sh.position.x = sx;
    wheelMesh.add(sh);
  }

  // 2. Deep-Dish Alloy Rim Barrel + Lip Flange
  const rimBarrelGeo = smoothCurved(new THREE.CylinderGeometry(radius * 0.68, radius * 0.68, width + 0.012, 24));
  rimBarrelGeo.rotateZ(Math.PI * 0.5);
  const rimBarrel = new THREE.Mesh(rimBarrelGeo, rimMat);
  wheelMesh.add(rimBarrel);

  // 3. 5-Spoke Star Alloy Rim + Central Hub Cap
  const spokeGeo = new THREE.BoxGeometry(width + 0.026, radius * 0.62, radius * 0.11);
  for (let s = 0; s < 5; s++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (s / 5) * Math.PI * 2;
    wheelMesh.add(spoke);
  }

  const hubCapGeo = smoothCurved(new THREE.CylinderGeometry(radius * 0.20, radius * 0.20, width + 0.034, 16));
  hubCapGeo.rotateZ(Math.PI * 0.5);
  wheelMesh.add(new THREE.Mesh(hubCapGeo, rimMat));

  // 4. Ventilated Steel Brake Disc Rotor inside wheel barrel
  const discMat = new THREE.MeshStandardMaterial({ color: 0x9aa5b4, roughness: 0.30, metalness: 0.85 });
  const discGeo = smoothCurved(new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, width * 0.22, 20));
  discGeo.rotateZ(Math.PI * 0.5);
  wheelMesh.add(new THREE.Mesh(discGeo, discMat));

  // 5. Red Brake Caliper mounted on non-rotating steering/axle `pivot`
  const caliperMat = new THREE.MeshStandardMaterial({ color: caliperHex, roughness: 0.22, metalness: 0.55 });
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(width * 0.46, radius * 0.36, radius * 0.22), caliperMat);
  caliper.position.set(0, radius * 0.14, -radius * 0.34);
  pivot.add(caliper);

  pivot.add(wheelMesh);
  return { pivot, wheelMesh };
}

/**
 * Builds an articulated 3D pedestrian/player character model with Cyber-Sprint Nitro VFX (`nitroVfx`).
 */
export function createPlayerAvatarModel() {
  const hero = buildHeroAvatar(); // [hero-vehicles] detailed character when available
  if (hero) return hero;
  // [feature/people] Normal-looking person built from the shared person model (face on the front, hair at
  // the back, toes forward, jacket zipper, backpack). Same userData contract as before for main.js.
  const root = new THREE.Group();
  const style = bit(OPT.HAIR_SHORT) | bit(OPT.ZIPPER) | bit(OPT.BACKPACK);
  const colors = {
    [MAT.SKIN]: 0xe8b88a,
    [MAT.TOP]: 0x48583c,    // Olive drab tactical army combat top
    [MAT.PANTS]: 0x33402c,  // Camo military fatigue combat pants
    [MAT.HAIR]: 0x1b1410,
    [MAT.ACC]: 0x242e20,    // Dark tactical webbing
  };
  const groups = {};
  const mkPivot = (x, y) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    root.add(g);
    return g;
  };
  const leftLeg = mkPivot(0, HIP_Y);
  const rightLeg = mkPivot(0, HIP_Y);
  const leftArm = mkPivot(0, SHOULDER_Y);
  const rightArm = mkPivot(0, SHOULDER_Y);
  const pivots = { [PART.STATIC]: root, [PART.LLEG]: leftLeg, [PART.RLEG]: rightLeg, [PART.LARM]: leftArm, [PART.RARM]: rightArm };
  const pivotY = { [PART.STATIC]: 0, [PART.LLEG]: HIP_Y, [PART.RLEG]: HIP_Y, [PART.LARM]: SHOULDER_Y, [PART.RARM]: SHOULDER_Y };
  for (const pt of personParts()) {
    if (pt.opt && !(style & bit(pt.opt))) { pt.geom.dispose(); continue; }
    const key = `${pt.part}_${pt.mat}`;
    if (!groups[key]) groups[key] = { part: pt.part, mat: pt.mat, pos: [], nor: [], col: [] };
    const G = groups[key];
    const p = pt.geom.attributes.position, n = pt.geom.attributes.normal;
    const oy = pivotY[pt.part];
    for (let i = 0; i < p.count; i++) {
      G.pos.push(p.getX(i), p.getY(i) - oy, p.getZ(i));
      G.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      G.col.push(pt.rgb[0], pt.rgb[1], pt.rgb[2]);
    }
    pt.geom.dispose();
  }
  for (const G of Object.values(groups)) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3));
    const fixed = G.mat === MAT.FIXED;
    if (fixed) geom.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3));
    const mat = new THREE.MeshStandardMaterial({
      color: fixed ? 0xffffff : colors[G.mat],
      vertexColors: fixed,
      roughness: G.mat === MAT.TOP ? 0.6 : 0.78,
      side: fixed ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivots[G.part].add(mesh);
  }
    // Military Combat Helmet (Olive Drab Kevlar + Tactical Goggles)
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x3d4a36, roughness: 0.65, metalness: 0.30 });
  const helmetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), helmetMat);
  helmetMesh.scale.set(0.96, 0.92, 1.06);
  helmetMesh.position.set(0, 1.63, 0);
  root.add(helmetMesh);

  // Tactical Body Armor / Plate Carrier Vest
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x2e3826, roughness: 0.80, metalness: 0.20 });
  const vestGeo = new THREE.CylinderGeometry(0.195, 0.172, 0.40, 12, 1);
  vestGeo.scale(1.05, 1.0, 0.72);
  const vestMesh = new THREE.Mesh(vestGeo, vestMat);
  vestMesh.position.set(0, 1.18, 0);
  root.add(vestMesh);

  root.scale.setScalar(1.04);

  // Kept for API compatibility with updateEntityNitroVfx (no sci-fi effects on a normal person).
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  root.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [] };

  root.userData = { leftLeg, rightLeg, leftArm, rightArm, armL: leftArm, armR: rightArm, legL: leftLeg, legR: rightLeg, nitroVfx, vfxParts };
  return root;
}

/**
 * Attaches fine-detail attack-helicopter sub-assemblies (swashplate, pitch links, 4 Hellfire missiles,
 * 19-tube Hydra faceplate bores, FLIR turret lenses, boarding step bars) onto a hero helicopter if needed,
 * and ensures tactical gunship olive-drab / slate-grey PBR materials never render as a dark silhouette.
 */
function attachHeliFineDetails(root) {
  if (!root || !root.userData || root.userData._fineDetailsAttached) return root;
  root.userData._fineDetailsAttached = true;
  const fuselage = root.userData.fuselage || root;
  const mainRotor = root.userData.mainRotor;

  // Normalize any overly dark high-metalness materials on hero helicopter so every surface is readable in daylight
  root.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.color) {
      const m = obj.material;
      const lum = m.color.r * 0.299 + m.color.g * 0.587 + m.color.b * 0.114;
      if (!m.transparent && lum < 0.16 && (m.metalness ?? 0) > 0.55) {
        m.color.setHex(0x4b5846);
        m.roughness = 0.48;
        m.metalness = 0.32;
      }
    }
  });

  const mechSlateMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.38, metalness: 0.45 });
  const weaponSlateMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.42, metalness: 0.38 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8e2ec, roughness: 0.20, metalness: 0.72 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xd49b35, roughness: 0.24, metalness: 0.68 });
  const seekerGlass = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.08, metalness: 0.35 });

  // Swashplate & 4 vertical pitch-control links on mainRotor
  if (mainRotor) {
    const swashUpper = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.32, 0.34, 0.05, 18)), mechSlateMat);
    swashUpper.position.y = -0.14;
    mainRotor.add(swashUpper);
    for (let b = 0; b < 4; b++) {
      const a = (b * Math.PI) * 0.5 + 0.28;
      const pitchLink = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8)), chromeMat);
      pitchLink.position.set(Math.cos(a) * 0.26, -0.06, Math.sin(a) * 0.26);
      mainRotor.add(pitchLink);
    }
  }

  // Boarding step bars on landing skid struts + 4 AGM-114 Hellfire Missiles on outboard M299 quad-rails
  const hellfireBodyGeo = smoothCurved(new THREE.CylinderGeometry(0.062, 0.062, 1.18, 14));
  hellfireBodyGeo.rotateX(Math.PI * 0.5);
  const hellfireNoseGeo = smoothCurved(new THREE.SphereGeometry(0.062, 12, 10));
  hellfireNoseGeo.scale(1, 1, 1.6);

  for (const sx of [-1, 1]) {
    const stepBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 1.65), mechSlateMat);
    stepBar.position.set(sx * 1.02, 0.46, 0.15);
    fuselage.add(stepBar);

    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.20, 0.54), mechSlateMat);
    rack.position.set(sx * 1.98, 1.04, -0.05);
    fuselage.add(rack);

    for (const mx of [-0.09, 0.09]) {
      const mGrp = new THREE.Group();
      mGrp.position.set(sx * 1.98 + mx, 0.88, 0.02);
      mGrp.add(new THREE.Mesh(hellfireBodyGeo, weaponSlateMat));
      const nose = new THREE.Mesh(hellfireNoseGeo, seekerGlass);
      nose.position.z = 0.59;
      mGrp.add(nose);
      const band = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.064, 0.064, 0.06, 12)), copperMat);
      band.rotation.x = Math.PI * 0.5;
      band.position.z = 0.28;
      mGrp.add(band);
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.18, 0.18), mechSlateMat);
        fin.position.z = -0.45;
        fin.rotation.z = f * Math.PI * 0.5 + Math.PI * 0.25;
        mGrp.add(fin);
      }
      fuselage.add(mGrp);
    }
  }
  return root;
}

/**
 * Builds an articulated 3D Attack / Tactical Turbine Helicopter (`createHelicopterModel` / `createHeliModel`).
 * Uses realistic tactical gunship olive-drab & slate-grey armor plating (`0x4b5846`, `0x374151`, `0x64748b`)
 * so every curved surface, rivet seam, cockpit crew helmet, and weapon pod is clearly visible in daylight.
 * Local forward is +Z, right is +X, up is +Y. Skids rest on y = 0.
 */
export function createHelicopterModel(options = {}) {
  if (!options.standalone && typeof document !== 'undefined') {
    const hero = buildHeroHelicopter(); // [hero-vehicles] detailed helicopter when available
    if (hero) return attachHeliFineDetails(upgradeHeliNitro(hero)); // [nitro-fx]
  }
  const root = new THREE.Group();
  const fuselage = new THREE.Group();
  root.add(fuselage);

  // Tactical Gunship Olive-Drab & Slate-Grey Armor PBR Materials (Daylight-Readable, Non-Black)
  const armorOliveMat = new THREE.MeshStandardMaterial({
    color: options.paintColor != null ? options.paintColor : 0x4b5846,
    roughness: 0.48,
    metalness: 0.32,
  });
  const lowerArmorMat = new THREE.MeshStandardMaterial({ color: 0x5c6b57, roughness: 0.50, metalness: 0.28 });
  const weaponSlateMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.42, metalness: 0.38 });
  const mechSlateMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.36, metalness: 0.48 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdce4ec, roughness: 0.20, metalness: 0.72 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xd49b35, roughness: 0.24, metalness: 0.68 });
  const canopyGlassMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a4c,
    roughness: 0.08,
    metalness: 0.20,
    transparent: true,
    opacity: 0.44,
  });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.40, metalness: 0.38 });
  const helmetOliveMat = new THREE.MeshStandardMaterial({ color: 0x3f4d3a, roughness: 0.35, metalness: 0.28 });
  const flirEmeraldMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });
  const flirAmberMat = new THREE.MeshBasicMaterial({ color: 0xffb703 });
  const tipGlowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a55 });

  // 1. Tubular Landing Skids (`0x64748b`) with Curved Ski Tips, Oleo Shock Struts & Boarding Step Bars
  const skidCylinderGeo = smoothCurved(new THREE.CylinderGeometry(0.058, 0.058, 4.20, 16));
  skidCylinderGeo.rotateX(Math.PI * 0.5);
  for (const sx of [-1.15, 1.15]) {
    const skidTube = new THREE.Mesh(skidCylinderGeo, mechSlateMat);
    skidTube.position.set(sx, 0.08, 0.15);
    fuselage.add(skidTube);

    const skiTip = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.22, 0.055, 10, 16, Math.PI * 0.55)), mechSlateMat);
    skiTip.rotation.y = Math.PI * 0.5;
    skiTip.position.set(sx, 0.30, 2.24);
    fuselage.add(skiTip);

    // Pilot & Gunner boarding step bars along skid struts
    const stepBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.038, 1.75), weaponSlateMat);
    stepBar.position.set(sx * 0.92, 0.48, 0.20);
    fuselage.add(stepBar);

    for (const sz of [-0.95, 1.15]) {
      const strutUpper = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.048, 0.052, 0.52, 12)), mechSlateMat);
      strutUpper.position.set(sx * 0.78, 0.52, sz);
      strutUpper.rotation.z = sx > 0 ? 0.32 : -0.32;
      const oleoPiston = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.034, 0.034, 0.38, 10)), chromeMat);
      oleoPiston.position.set(sx * 0.90, 0.24, sz);
      oleoPiston.rotation.z = sx > 0 ? 0.32 : -0.32;
      fuselage.add(strutUpper, oleoPiston);
    }
  }

  // 2. Sculpted Multi-Profile Armored Fuselage Hull + Raised Armor Panel Seams + Cheek Avionics Bays
  const mainHullGeo = buildSculptedProfileGeometry([
    [-2.35, 0.72],
    [2.35, 0.70],
    [2.85, 1.12],
    [1.65, 1.65],
    [0.45, 2.12],
    [-1.65, 2.08],
    [-2.45, 1.68],
  ], 1.72, 0.08, 0.10);
  const mainHull = new THREE.Mesh(mainHullGeo, armorOliveMat);
  fuselage.add(mainHull);

  // Side cheek Extended Forward Avionics Bays (EFAB sponsons) & raised armor panel seams
  for (const sx of [-1, 1]) {
    const efabGeo = buildSculptedProfileGeometry([
      [-1.55, 0.76],
      [2.15, 0.76],
      [1.85, 1.24],
      [-1.35, 1.28],
    ], 0.32, 0.04, 0.05);
    efabGeo.translate(sx * 0.92, 0, 0);
    const efab = new THREE.Mesh(efabGeo, lowerArmorMat);
    fuselage.add(efab);

    // Raised fuselage armor panel seam strips & chaff/flare dispenser pod
    for (const pz of [-1.2, -0.2, 0.8, 1.7]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.78, 0.04), mechSlateMat);
      seam.position.set(sx * 0.87, 1.52, pz);
      fuselage.add(seam);
    }
    const chaffPod = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.56), weaponSlateMat);
    chaffPod.position.set(sx * 0.88, 1.48, -1.95);
    fuselage.add(chaffPod);
  }

  const bellyChine = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.18, 4.65), lowerArmorMat);
  bellyChine.position.set(0, 0.70, 0.22);
  fuselage.add(bellyChine);

  // Stepped Tandem Armoured Glass Cockpit Canopy + Frame Struts + Twin Windshield Wipers + Tandem Crew
  const canopyGeo = buildSculptedProfileGeometry([
    [0.25, 1.48],
    [2.45, 1.15],
    [2.12, 1.72],
    [1.35, 1.88],
    [0.95, 2.08],
    [0.22, 2.08],
  ], 1.18, 0.05, 0.06);
  const noseGlass = new THREE.Mesh(canopyGeo, canopyGlassMat);
  fuselage.add(noseGlass);

  const noseRadome = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.56, 18, 14)), weaponSlateMat);
  noseRadome.scale.set(1.08, 0.58, 1.35);
  noseRadome.position.set(0, 1.05, 2.62);
  fuselage.add(noseRadome);

  // Armoured canopy frame struts + twin windshield wipers + wire-strike cutter blade
  for (const rx of [-0.56, 0.0, 0.56]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.62, 1.85), weaponSlateMat);
    rib.position.set(rx, 1.76, 1.38);
    rib.rotation.x = 0.34;
    fuselage.add(rib);
  }
  for (const cz of [0.95, 1.68, 2.22]) {
    const crossArch = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.045, 0.05), weaponSlateMat);
    crossArch.position.set(0, cz > 1.8 ? 1.56 : 1.92, cz);
    fuselage.add(crossArch);
  }
  for (const sx of [-0.26, 0.26]) {
    const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.022, 0.028), weaponSlateMat);
    wiper.position.set(sx, 1.52, 2.18);
    wiper.rotation.z = sx > 0 ? -0.22 : 0.22;
    wiper.rotation.x = 0.38;
    fuselage.add(wiper);
  }
  const wireCutter = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.38, 0.14), mechSlateMat);
  wireCutter.position.set(0, 2.22, 0.88);
  wireCutter.rotation.x = -0.35;
  fuselage.add(wireCutter);

  // Tandem Pilot (rear elevated) & CPG Gunner (front lower) Seats, Helmets with Visors & Glowing HUDs
  for (const [sz, sy] of [[0.72, 1.42], [1.62, 1.24]]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.40), weaponSlateMat);
    seat.position.set(0, sy, sz);
    const torso = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.16, 0.19, 0.38, 10)), armorOliveMat);
    torso.position.set(0, sy + 0.16, sz + 0.06);
    const helmet = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.135, 14, 12)), helmetOliveMat);
    helmet.position.set(0, sy + 0.44, sz + 0.08);
    const visor = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI, 0, Math.PI * 0.55)), weaponSlateMat);
    visor.rotation.x = -0.25;
    visor.position.set(0, sy + 0.45, sz + 0.11);
    const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.14), flirEmeraldMat);
    hud.position.set(0, sy + 0.36, sz + 0.38);
    hud.rotation.x = -0.35;
    fuselage.add(seat, torso, helmet, visor, hud);
  }

  // 3. Chin-Mounted Gimballed TADS/PNVS FLIR Turret (Emerald & Amber Lenses) + M230 30mm Chain Gun & Ammo Chute
  const flirYoke = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.24, 0.28, 0.26, 16)), weaponSlateMat);
  flirYoke.position.set(0, 0.96, 2.96);
  fuselage.add(flirYoke);

  const flirBall = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.25, 18, 14)), mechSlateMat);
  flirBall.position.set(0, 0.88, 3.12);
  fuselage.add(flirBall);

  const flirMainLens = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 14)), flirEmeraldMat);
  flirMainLens.rotation.x = Math.PI * 0.5;
  flirMainLens.position.set(-0.06, 0.88, 3.35);
  const flirSubLens = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12)), flirAmberMat);
  flirSubLens.rotation.x = Math.PI * 0.5;
  flirSubLens.position.set(0.08, 0.88, 3.34);
  fuselage.add(flirMainLens, flirSubLens);

  // Under-nose M230 30mm chain gun with recoil cradle, perforated cooling barrel jacket, muzzle brake & ammo chute
  const chinTurret = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.26, 16, 12)), weaponSlateMat);
  chinTurret.position.set(0, 0.68, 2.15);
  fuselage.add(chinTurret);

  const ammoChute = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.45), mechSlateMat);
  ammoChute.position.set(0, 0.72, 1.88);
  ammoChute.rotation.x = 0.35;
  fuselage.add(ammoChute);

  const gunShroud = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.085, 0.095, 0.72, 14)), weaponSlateMat);
  gunShroud.rotation.x = Math.PI * 0.5;
  gunShroud.position.set(0, 0.62, 2.45);
  fuselage.add(gunShroud);
  // Perforated cooling rings along barrel jacket
  for (const rz of [2.25, 2.42, 2.58, 2.74]) {
    const coolRing = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.09, 0.012, 8, 14)), mechSlateMat);
    coolRing.position.set(0, 0.62, rz);
    fuselage.add(coolRing);
  }

  const cannonBarrel = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.042, 0.052, 1.25, 14)), chromeMat);
  cannonBarrel.rotation.x = Math.PI * 0.5;
  cannonBarrel.position.set(0, 0.62, 2.82);
  fuselage.add(cannonBarrel);

  const muzzleBrake = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.065, 0.058, 0.16, 14)), weaponSlateMat);
  muzzleBrake.rotation.x = Math.PI * 0.5;
  muzzleBrake.position.set(0, 0.62, 3.44);
  fuselage.add(muzzleBrake);

  // 4. Contoured Airfoil Stub Wings Carrying 19-Tube Hydra 70 Rocket Pods + Quad AGM-114 Hellfire Missiles
  const stubWing = new THREE.Mesh(
    buildContouredAirfoilGeometry(1, [
      { x: -2.28, y: 1.22, z: -0.15, chord: 0.82, thick: 0.14 },
      { x: -0.82, y: 1.26, z: -0.10, chord: 1.05, thick: 0.18 },
      { x: 0.82, y: 1.26, z: -0.10, chord: 1.05, thick: 0.18 },
      { x: 2.28, y: 1.22, z: -0.15, chord: 0.82, thick: 0.14 },
    ], 16, false),
    armorOliveMat
  );
  fuselage.add(stubWing);

  const tubeBoreGeo = smoothCurved(new THREE.CylinderGeometry(0.024, 0.024, 0.06, 8));
  tubeBoreGeo.rotateX(Math.PI * 0.5);
  const hellfireBodyGeo = smoothCurved(new THREE.CylinderGeometry(0.062, 0.062, 1.18, 14));
  hellfireBodyGeo.rotateX(Math.PI * 0.5);
  const hellfireNoseGeo = smoothCurved(new THREE.SphereGeometry(0.062, 12, 10));
  hellfireNoseGeo.scale(1, 1, 1.6);

  for (const sx of [-1, 1]) {
    const wingPod = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.12, 0.12, 1.24, 14)), mechSlateMat);
    wingPod.rotation.x = Math.PI * 0.5;
    wingPod.position.set(sx * 2.28, 1.22, -0.10);
    fuselage.add(wingPod);

    // Inboard Pylon + 19-Tube M261 Hydra 70 Rocket Pod (±1.48m)
    const inPylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.64), mechSlateMat);
    inPylon.position.set(sx * 1.48, 1.08, 0.02);
    fuselage.add(inPylon);

    const rocketPod = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.21, 0.21, 1.38, 18)), weaponSlateMat);
    rocketPod.rotation.x = Math.PI * 0.5;
    rocketPod.position.set(sx * 1.48, 0.90, 0.05);
    fuselage.add(rocketPod);

    const podFace = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.212, 0.212, 0.04, 18)), chromeMat);
    podFace.rotation.x = Math.PI * 0.5;
    podFace.position.set(sx * 1.48, 0.90, 0.73);
    fuselage.add(podFace);

    // 19-Tube perforated faceplate with visible warhead tips
    for (let r = 0; r < 19; r++) {
      let tx = 0, ty = 0;
      if (r > 0 && r <= 6) {
        const a = ((r - 1) / 6) * Math.PI * 2;
        tx = Math.cos(a) * 0.068; ty = Math.sin(a) * 0.068;
      } else if (r > 6) {
        const a = ((r - 7) / 12) * Math.PI * 2;
        tx = Math.cos(a) * 0.135; ty = Math.sin(a) * 0.135;
      }
      const bore = new THREE.Mesh(tubeBoreGeo, copperMat);
      bore.position.set(sx * 1.48 + tx, 0.90 + ty, 0.75);
      fuselage.add(bore);
    }

    // Outboard Pylon + M299 Quad-Rail Launcher Carrying 4 AGM-114 Hellfire Missiles per Wing (2x2 rack)
    const outPylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.58), mechSlateMat);
    outPylon.position.set(sx * 1.96, 1.06, -0.05);
    fuselage.add(outPylon);

    for (const mx of [-0.095, 0.095]) {
      for (const my of [0.92, 0.76]) {
        const mGrp = new THREE.Group();
        mGrp.position.set(sx * 1.96 + mx, my, 0.02);
        mGrp.add(new THREE.Mesh(hellfireBodyGeo, weaponSlateMat));
        const nose = new THREE.Mesh(hellfireNoseGeo, flirAmberMat);
        nose.position.z = 0.59;
        mGrp.add(nose);
        const band = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 12)), copperMat);
        band.rotation.x = Math.PI * 0.5;
        band.position.z = 0.28;
        mGrp.add(band);
        for (let f = 0; f < 4; f++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.18), mechSlateMat);
          fin.position.z = -0.45;
          fin.rotation.z = f * Math.PI * 0.5 + Math.PI * 0.25;
          mGrp.add(fin);
        }
        fuselage.add(mGrp);
      }
    }
  }

  // 5. Twin Turboshaft Engine Nacelles with Circular Stainless Intake Particle Separators & Upturned IR Exhaust Shrouds
  for (const sx of [-0.66, 0.66]) {
    const nacelleGeo = buildSculptedProfileGeometry([
      [-1.58, 1.98],
      [0.95, 1.98],
      [0.98, 2.52],
      [-1.48, 2.48],
    ], 0.56, 0.05, 0.06);
    nacelleGeo.translate(sx, 0, 0);
    const nacelle = new THREE.Mesh(nacelleGeo, weaponSlateMat);
    fuselage.add(nacelle);

    // Circular stainless intake lip ring + central particle-separator bullet cone
    const intakeLip = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.22, 0.038, 12, 20)), chromeMat);
    intakeLip.position.set(sx, 2.25, 0.98);
    fuselage.add(intakeLip);

    const spinnerCone = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.12, 0.28, 16)), chromeMat);
    spinnerCone.rotation.x = Math.PI * 0.5;
    spinnerCone.position.set(sx, 2.25, 1.06);
    fuselage.add(spinnerCone);

    // Upturned Black-Hole IR-suppressed exhaust shroud
    const exhaustCowl = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.20, 0.25, 0.52, 16)), mechSlateMat);
    exhaustCowl.rotation.x = -Math.PI * 0.36;
    exhaustCowl.position.set(sx, 2.38, -1.68);
    fuselage.add(exhaustCowl);
  }

  // 6. Sculpted Tail Boom + Swept Airfoil Vertical Fin + Horizontal Stabilator (-Z)
  const tailBoomGeo = buildSculptedProfileGeometry([
    [-6.65, 1.62],
    [-1.85, 1.32],
    [-1.85, 1.98],
    [-6.55, 1.88],
  ], 0.52, 0.04, 0.05);
  const tailBoom = new THREE.Mesh(tailBoomGeo, armorOliveMat);
  fuselage.add(tailBoom);

  const vertFin = new THREE.Mesh(
    buildContouredAirfoilGeometry(1, [
      { x: 0, y: 1.72, z: -6.25, chord: 1.18, thick: 0.18 },
      { x: 0, y: 3.18, z: -6.68, chord: 0.72, thick: 0.12 },
    ], 14, true),
    armorOliveMat
  );
  fuselage.add(vertFin);

  const horizStab = new THREE.Mesh(
    buildContouredAirfoilGeometry(1, [
      { x: -1.12, y: 1.68, z: -6.42, chord: 0.54, thick: 0.08 },
      { x: 1.12, y: 1.68, z: -6.42, chord: 0.54, thick: 0.08 },
    ], 14, false),
    lowerArmorMat
  );
  fuselage.add(horizStab);

  const tailBeacon = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.11, 12, 10)), beaconMat);
  tailBeacon.position.set(0, 3.22, -6.72);
  fuselage.add(tailBeacon);

  // 7. 4-Blade Articulated Main Rotor Head (`mainRotor`) with Swashplate, Pitch Links & Longbow Radar Dome
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.78, -0.10);
  fuselage.add(mainRotor);

  const mast = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.16, 0.22, 0.48, 16)), mechSlateMat);
  mast.position.set(0, 2.55, -0.10);
  fuselage.add(mast);

  const swashLower = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.36, 0.38, 0.05, 18)), mechSlateMat);
  swashLower.position.set(0, 2.52, -0.10);
  fuselage.add(swashLower);

  const swashUpper = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 18)), chromeMat);
  swashUpper.position.set(0, -0.16, 0);
  mainRotor.add(swashUpper);

  const hubCap = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.38, 0.44, 0.18, 18)), mechSlateMat);
  mainRotor.add(hubCap);

  // Mast-mounted Longbow millimeter-wave fire-control radar radome
  const longbowRadome = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.52, 20, 14)), weaponSlateMat);
  longbowRadome.scale.set(1.0, 0.42, 1.0);
  longbowRadome.position.set(0, 0.24, 0);
  mainRotor.add(longbowRadome);

  const ROTOR_RADIUS = 5.4;
  for (let b = 0; b < 4; b++) {
    const bGroup = new THREE.Group();
    bGroup.rotation.y = (b * Math.PI) * 0.5;

    const pitchLink = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8)), chromeMat);
    pitchLink.position.set(0.14, -0.08, 0.28);
    bGroup.add(pitchLink);

    const bladeGrip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.44), mechSlateMat);
    bladeGrip.position.set(0, 0, 0.45);
    bGroup.add(bladeGrip);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, ROTOR_RADIUS), bladeMat);
    blade.position.set(0, 0, ROTOR_RADIUS * 0.5);
    bGroup.add(blade);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.42), tipGlowMat);
    tip.position.set(0, 0, ROTOR_RADIUS - 0.21);
    bGroup.add(tip);
    mainRotor.add(bGroup);
  }

  const discGeo = smoothCurved(new THREE.RingGeometry(0.55, ROTOR_RADIUS, 32));
  discGeo.rotateX(-Math.PI * 0.5);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const rotorDisc = new THREE.Mesh(discGeo, discMat);
  rotorDisc.position.y = 0.02;
  mainRotor.add(rotorDisc);

  // 8. 4-Blade Scimitar Tail Rotor (`tailRotor`) with Protective Shroud Ring & Pitch Hub
  const tailShroud = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.92, 0.065, 12, 24)), mechSlateMat);
  tailShroud.rotation.y = Math.PI * 0.5;
  tailShroud.position.set(0.18, 2.32, -6.58);
  fuselage.add(tailShroud);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.18, 2.32, -6.58);
  fuselage.add(tailRotor);
  const tailHub = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 12)), chromeMat);
  tailHub.rotation.z = Math.PI * 0.5;
  tailRotor.add(tailHub);
  for (let b = 0; b < 4; b++) {
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 1.68), bladeMat);
    tb.rotation.x = (b * Math.PI) * 0.5 + 0.18;
    tailRotor.add(tb);
  }

  root.traverse((obj) => {
    obj.frustumCulled = false;
    if (obj.isMesh && obj !== rotorDisc) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  // === HELICOPTER NITRO VFX ===
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  fuselage.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [] };

  for (const sx of [-0.66, 0.66]) {
    const plume = createThrusterFlameCone(0.32, 5.4, 0xffffff, 0x00f5ff);
    plume.position.set(sx, 2.34, -1.68);
    nitroVfx.add(plume);
    vfxParts.plumes.push(plume);
  }

  const haloGeo = smoothCurved(new THREE.RingGeometry(ROTOR_RADIUS - 0.35, ROTOR_RADIUS + 0.25, 36));
  haloGeo.rotateX(-Math.PI * 0.5);
  const haloMesh = new THREE.Mesh(
    haloGeo,
    new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  haloMesh.position.set(0, 2.80, -0.10);
  nitroVfx.add(haloMesh);
  vfxParts.rings.push(haloMesh);

  const innerVortexGeo = smoothCurved(new THREE.RingGeometry(2.6, 3.2, 28));
  innerVortexGeo.rotateX(-Math.PI * 0.5);
  const innerVortex = new THREE.Mesh(
    innerVortexGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffbe0b,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  innerVortex.position.set(0, 2.45, -0.10);
  nitroVfx.add(innerVortex);
  vfxParts.rings.push(innerVortex);

  for (const sx of [-2.28, 2.28]) {
    const trail = createSpeedTrailRibbon(0.22, 14.0, 0x00f5ff, 0.78);
    trail.position.set(sx, 1.22, -0.65);
    nitroVfx.add(trail);
    vfxParts.trails.push(trail);
  }

  root.userData = {
    fuselage,
    mainRotor,
    tailRotor,
    nitroVfx,
    vfxParts,
    _gunshipPodsAttached: true,
    _fineDetailsAttached: true,
  };
  return root;
}

/**
 * Explicit alias for `createHelicopterModel` (`createHeliModel`).
 */
export function createHeliModel(options = {}) {
  return createHelicopterModel({ standalone: true, ...options });
}

// [nitro-fx] Swap the hero helicopter's cone plumes, flat rotor rings and ribbons for turbine shader flames
// (same exhaust transforms) and thin contrails from the pod tips.
function upgradeHeliNitro(root) {
  const { nitroVfx, vfxParts } = root.userData;
  if (!nitroVfx || !vfxParts) return root;
  const dir = new THREE.Vector3();
  const exhausts = vfxParts.plumes.map((p) => {
    dir.set(0, 0, -1).applyEuler(p.rotation);
    return { pos: p.position.toArray(), dir: dir.toArray() };
  });
  const trails = vfxParts.trails.map((t) => t.position.toArray());
  for (const o of [...nitroVfx.children]) {
    nitroVfx.remove(o);
    o.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  }
  root.userData.vfxParts = { plumes: [], shockCones: [], rings: [], trails: [], aeroFlaps: [] };
  root.userData.vfxParts.rig = createNitroRig(nitroVfx, { style: 'turbine', exhausts, trails });
  return root;
}

/**
 * Builds a high-craftsmanship 3D Supersonic Stealth Fighter Jet or Tactical Propeller Plane (`createPlaneModel`).
 * Uses realistic two-tone tactical air-superiority grey PBR materials (`0x64748b` upper, `0x94a3b8` lower,
 * `0x475569` dielectric radome, `0x334155` titanium shroud with 16 variable-geometry nozzle petals)
 * and contoured 3D NACA airfoil wings, LERX, tailerons, and canted vertical stabilizers.
 */
export function createPlaneModel(variant = 'fighter_jet', options = {}) {
  const root = new THREE.Group();
  const fuselage = new THREE.Group();
  root.add(fuselage);

  const isProp = variant === 'propeller_plane' || variant === 'prop';
  // Two-tone tactical air-superiority grey PBR materials (Daylight-Readable, Non-Black)
  const upperAirframeMat = new THREE.MeshStandardMaterial({
    color: options.paintColor != null ? options.paintColor : (isProp ? 0x4b6a88 : 0x64748b),
    roughness: 0.42,
    metalness: 0.35,
  });
  const lowerAirframeMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.45,
    metalness: 0.30,
  });
  const radomeMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.38,
    metalness: 0.15,
  });
  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.35,
    metalness: 0.55,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xdbe4ee,
    roughness: 0.22,
    metalness: 0.68,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x283240,
    roughness: 0.40,
    metalness: 0.45,
  });
  // Transparent golden-tinted bubble canopy (`opacity: 0.42`) clearly showing ejection seat, pilot & HUD
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xd4a338,
    roughness: 0.08,
    metalness: 0.18,
    transparent: true,
    opacity: 0.42,
  });
  const hudMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
  const missileWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.28, metalness: 0.25 });
  const seekerMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.12, metalness: 0.55 });
  const burnerCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  const burnerRingMat = new THREE.MeshBasicMaterial({ color: 0xff7b00 });
  const navRedMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
  const navGreenMat = new THREE.MeshBasicMaterial({ color: 0x11ff66 });

  // 1. Two-Tone Sculpted Blended-Wing-Body Fuselage Spine, Dorsal Spine Fairing & Chine Nose Radome (+Z forward)
  const upperBodyGeo = buildSculptedProfileGeometry([
    [-3.95, 1.36],
    [3.65, 1.34],
    [3.25, 1.76],
    [0.65, 1.84],
    [-2.45, 1.78],
    [-3.95, 1.62],
  ], 1.72, 0.07, 0.09);
  const mainBody = new THREE.Mesh(upperBodyGeo, upperAirframeMat);
  fuselage.add(mainBody);

  const lowerBellyGeo = buildSculptedProfileGeometry([
    [-3.85, 0.98],
    [3.55, 1.02],
    [3.65, 1.36],
    [-3.90, 1.36],
  ], 1.64, 0.06, 0.08);
  const lowerBelly = new THREE.Mesh(lowerBellyGeo, lowerAirframeMat);
  fuselage.add(lowerBelly);

  // Dorsal spine avionics fairing & engraved speed-brake / airbrake panel seam
  const dorsalSpine = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.28, 0.36, 4.45, 16)), upperAirframeMat);
  dorsalSpine.rotation.x = Math.PI * 0.5;
  dorsalSpine.scale.set(1.15, 0.45, 1.0);
  dorsalSpine.position.set(0, 1.82, -0.95);
  fuselage.add(dorsalSpine);

  const airbrakeSeam = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 1.35), titaniumMat);
  airbrakeSeam.position.set(0, 1.94, -2.15);
  fuselage.add(airbrakeSeam);

  // Stealth lateral chine strakes along fuselage
  const chinePlate = new THREE.Mesh(
    buildContouredAirfoilGeometry(1, [
      { x: -1.32, y: 1.36, z: 0.45, chord: 6.8, thick: 0.10 },
      { x: 1.32, y: 1.36, z: 0.45, chord: 6.8, thick: 0.10 },
    ], 14, false),
    upperAirframeMat
  );
  fuselage.add(chinePlate);

  // Sculpted ogive nose radome cone + 6 silver lightning-diverter strips + chrome supersonic pitot needle
  const noseTransition = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.52, 0.86, 1.65, 24)), upperAirframeMat);
  noseTransition.rotation.x = Math.PI * 0.5;
  noseTransition.scale.set(1.12, 0.65, 1.0);
  noseTransition.position.set(0, 1.34, 4.35);
  fuselage.add(noseTransition);

  const radomeCone = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.52, 2.35, 24)), radomeMat);
  radomeCone.rotation.x = Math.PI * 0.5;
  radomeCone.scale.set(1.12, 0.65, 1.0);
  radomeCone.position.set(0, 1.32, 6.32);
  fuselage.add(radomeCone);

  // 6 silver lightning-diverter strips along dielectric nose radome
  for (let d = 0; d < 6; d++) {
    const ang = (d / 6) * Math.PI * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 1.65), chromeMat);
    strip.position.set(Math.cos(ang) * 0.30, 1.32 + Math.sin(ang) * 0.18, 6.05);
    strip.rotation.y = -Math.cos(ang) * 0.22;
    strip.rotation.x = Math.sin(ang) * 0.14;
    fuselage.add(strip);
  }

  const pitotNeedle = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.008, 0.024, 0.78, 12)), chromeMat);
  pitotNeedle.rotation.x = Math.PI * 0.5;
  pitotNeedle.position.set(0, 1.31, 7.78);
  fuselage.add(pitotNeedle);

  // 2. Detailed Cockpit Tub (ACES-II Ejection Seat + Pilot Helmet/Shoulders + Holographic HUD) + Golden Tinted Bubble Canopy
  const cockpitTub = new THREE.Group();
  cockpitTub.position.set(0, 1.68, 2.15);
  fuselage.add(cockpitTub);

  const tubFloor = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 2.25), darkMetal);
  tubFloor.position.set(0, -0.08, 0);
  cockpitTub.add(tubFloor);

  // ACES-II Ejection Seat with twin parachute headbox, side consoles & Pilot Figure (Flight-Suit Shoulders + Helmet)
  const ejectionSeat = new THREE.Group();
  ejectionSeat.position.set(0, 0.08, -0.15);
  const seatPan = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.10, 0.44), darkMetal);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.64, 0.10), darkMetal);
  seatBack.position.set(0, 0.30, -0.18);
  seatBack.rotation.x = -0.22;
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.14), titaniumMat);
  headBox.position.set(0, 0.68, -0.26);
  // Pilot shoulders/torso + white HGU-55/P helmet + dark visor
  const pilotTorso = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.17, 0.20, 0.36, 12)), radomeMat);
  pilotTorso.position.set(0, 0.22, -0.02);
  const pilotHelmet = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.135, 14, 12)), missileWhiteMat);
  pilotHelmet.position.set(0, 0.50, 0.02);
  const pilotVisor = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.126, 12, 8, 0, Math.PI, 0, Math.PI * 0.55)), seekerMat);
  pilotVisor.rotation.x = -0.22;
  pilotVisor.position.set(0, 0.51, 0.05);
  ejectionSeat.add(seatPan, seatBack, headBox, pilotTorso, pilotHelmet, pilotVisor);
  cockpitTub.add(ejectionSeat);

  // Inclined Holographic HUD Combiner Glass
  const glareshield = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.18, 0.52), darkMetal);
  glareshield.position.set(0, 0.16, 0.68);
  cockpitTub.add(glareshield);

  const hudGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.24), hudMat);
  hudGlass.position.set(0, 0.35, 0.62);
  hudGlass.rotation.x = -0.48;
  cockpitTub.add(hudGlass);

  // Transparent Golden-Tinted Polycarbonate Teardrop Bubble Canopy + Arch Frame
  const canopyGeo = smoothCurved(new THREE.SphereGeometry(0.62, 24, 16));
  canopyGeo.scale(0.82, 0.66, 2.65);
  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.position.set(0, 1.92, 1.95);
  fuselage.add(canopyMesh);

  const canopyBow = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.49, 0.028, 10, 20, Math.PI)), titaniumMat);
  canopyBow.position.set(0, 1.78, 2.38);
  canopyBow.rotation.x = -0.18;
  fuselage.add(canopyBow);

  // 3. Caret Supersonic Air Intakes with Splitter Plates & Recessed Multi-Blade Compressor Fan Faces
  const intakes = [];
  for (const sx of [-1.12, 1.12]) {
    const intakeGroup = new THREE.Group();
    intakeGroup.position.set(sx, 1.18, 1.15);

    const ductGeo = buildSculptedProfileGeometry([
      [-1.85, -0.26],
      [1.82, -0.24],
      [1.65, 0.28],
      [-1.85, 0.28],
    ], 0.64, 0.04, 0.05);
    const duct = new THREE.Mesh(ductGeo, lowerAirframeMat);
    duct.rotation.z = sx > 0 ? -0.16 : 0.16;
    intakeGroup.add(duct);

    const splitterPlate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.52, 0.85), titaniumMat);
    splitterPlate.position.set(sx > 0 ? -0.30 : 0.30, 0, 1.48);
    intakeGroup.add(splitterPlate);

    const fanFace = new THREE.Mesh(smoothCurved(new THREE.CircleGeometry(0.24, 18)), darkMetal);
    fanFace.position.set(0, 0, 1.72);
    intakeGroup.add(fanFace);
    const fanCone = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.08, 0.22, 12)), chromeMat);
    fanCone.rotation.x = Math.PI * 0.5;
    fanCone.position.set(0, 0, 1.78);
    intakeGroup.add(fanCone);

    fuselage.add(intakeGroup);
    intakes.push(intakeGroup);
  }

  // 4. Contoured 3D NACA Airfoil Wings with LERX, Engraved Flaperon/Aileron Seams & Wingtip AIM-9X Launch Rails
  const wings = new THREE.Group();
  fuselage.add(wings);

  const fighterWingStations = [
    { x: 0.92, y: 1.38, z: 0.15, chord: 4.10, thick: 0.24 },
    { x: 2.65, y: 1.36, z: -0.55, chord: 2.85, thick: 0.17 },
    { x: 4.25, y: 1.35, z: -1.15, chord: 1.75, thick: 0.11 },
    { x: 5.20, y: 1.34, z: -1.48, chord: 1.05, thick: 0.07 },
  ];
  const lerxStations = [
    { x: 0.85, y: 1.40, z: 2.35, chord: 2.85, thick: 0.12 },
    { x: 1.65, y: 1.38, z: 1.35, chord: 1.85, thick: 0.08 },
  ];

  for (const sx of [-1, 1]) {
    const mainWing = new THREE.Mesh(buildContouredAirfoilGeometry(sx, fighterWingStations, 20, false), upperAirframeMat);
    wings.add(mainWing);

    const lerx = new THREE.Mesh(buildContouredAirfoilGeometry(sx, lerxStations, 14, false), upperAirframeMat);
    wings.add(lerx);

    // Engraved trailing-edge flaperon & outboard aileron hinge seams + actuator fairings
    const flapSeam = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.05, 0.34), lowerAirframeMat);
    flapSeam.position.set(sx * 2.15, 1.35, -1.92);
    flapSeam.rotation.y = sx * -0.14;
    wings.add(flapSeam);

    const aileronSeam = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.045, 0.28), lowerAirframeMat);
    aileronSeam.position.set(sx * 3.95, 1.34, -2.02);
    aileronSeam.rotation.y = sx * -0.14;
    wings.add(aileronSeam);

    // Wingtip LAU-129 AIM-9X launch rail + navigation strobe (red port / green starboard)
    const tipRail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 1.92), lowerAirframeMat);
    tipRail.position.set(sx * 5.24, 1.34, -1.45);
    wings.add(tipRail);

    const navLight = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.068, 10, 8)), sx < 0 ? navRedMat : navGreenMat);
    navLight.position.set(sx * 5.30, 1.36, -0.58);
    wings.add(navLight);
  }

  // 5. Twin Canted Clipped-Diamond Airfoil Vertical Stabilizers + All-Moving Swept Airfoil Tailerons
  const verticalTails = [];
  const vTailStations = [
    { x: 0, y: -0.78, z: 0.15, chord: 1.85, thick: 0.15 },
    { x: 0, y: 0.15, z: -0.22, chord: 1.35, thick: 0.11 },
    { x: 0, y: 0.92, z: -0.55, chord: 0.78, thick: 0.07 },
  ];
  const taileronStations = [
    { x: 0.95, y: 1.30, z: -3.25, chord: 1.65, thick: 0.11 },
    { x: 2.15, y: 1.28, z: -3.72, chord: 1.12, thick: 0.08 },
    { x: 3.05, y: 1.26, z: -4.05, chord: 0.62, thick: 0.05 },
  ];

  for (const sx of [-0.95, 0.95]) {
    const sSign = Math.sign(sx);
    const vTail = new THREE.Group();
    vTail.position.set(sx, 2.18, -2.95);
    vTail.rotation.z = sx > 0 ? -0.30 : 0.30;

    const finBlade = new THREE.Mesh(buildContouredAirfoilGeometry(1, vTailStations, 16, true), upperAirframeMat);
    vTail.add(finBlade);

    const rudderSeam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 0.28), lowerAirframeMat);
    rudderSeam.position.set(0, 0.02, -0.68);
    rudderSeam.rotation.x = -0.32;
    vTail.add(rudderSeam);

    const rwrPod = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.04, 0.04, 0.82, 10)), radomeMat);
    rwrPod.rotation.x = Math.PI * 0.5;
    rwrPod.position.set(0, 0.94, -0.55);
    vTail.add(rwrPod);

    fuselage.add(vTail);
    verticalTails.push(vTail);

    // Swept NACA airfoil all-moving horizontal taileron
    const taileron = new THREE.Mesh(buildContouredAirfoilGeometry(sSign, taileronStations, 16, false), upperAirframeMat);
    fuselage.add(taileron);
  }

  // 6. Under-Wing AIM-120 AMRAAM & AIM-9X Sidewinder Air-to-Air Missiles on Pylons
  const missiles = [];
  const buildMissile = (radius, length, isAmraam) => {
    const mGrp = new THREE.Group();
    const mBody = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(radius, radius, length, 16)), missileWhiteMat);
    mBody.rotation.x = Math.PI * 0.5;
    mGrp.add(mBody);
    const mNose = new THREE.Mesh(
      smoothCurved(new THREE.ConeGeometry(radius, radius * 3.8, 16)),
      isAmraam ? radomeMat : seekerMat
    );
    mNose.rotation.x = Math.PI * 0.5;
    mNose.position.z = length * 0.5 + radius * 1.9;
    mGrp.add(mNose);
    for (let f = 0; f < 4; f++) {
      const rotZ = f * Math.PI * 0.5 + Math.PI * 0.25;
      const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.014, radius * 3.6, 0.24), titaniumMat);
      tailFin.position.z = -length * 0.42;
      tailFin.rotation.z = rotZ;
      mGrp.add(tailFin);
      const midFin = new THREE.Mesh(new THREE.BoxGeometry(0.014, radius * 2.8, 0.18), titaniumMat);
      midFin.position.z = isAmraam ? 0.05 : length * 0.34;
      midFin.rotation.z = rotZ;
      mGrp.add(midFin);
    }
    return mGrp;
  };

  for (const sx of [-1, 1]) {
    // Inboard pylon + AIM-120C AMRAAM medium-range radar missile
    const inPylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 1.15), lowerAirframeMat);
    inPylon.position.set(sx * 2.35, 1.14, -0.55);
    wings.add(inPylon);
    const amraam = buildMissile(0.068, 1.85, true);
    amraam.position.set(sx * 2.35, 0.96, -0.45);
    wings.add(amraam);
    missiles.push(amraam);

    // Outboard pylon + AIM-9X Sidewinder infrared dogfight missile
    const outPylon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.95), lowerAirframeMat);
    outPylon.position.set(sx * 3.65, 1.15, -0.85);
    wings.add(outPylon);
    const sidewinder = buildMissile(0.054, 1.52, false);
    sidewinder.position.set(sx * 3.65, 0.98, -0.78);
    wings.add(sidewinder);
    missiles.push(sidewinder);
  }

  // 7. Twin Variable-Geometry Titanium Exhaust Nozzles (16 Individual Petals + Glowing Amber-White Afterburner Core)
  const nozzles = [];
  for (const sx of [-0.52, 0.52]) {
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(sx, 1.36, -4.05);

    const shroud = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.40, 0.44, 0.58, 24, 1, true)), titaniumMat);
    shroud.rotation.x = Math.PI * 0.5;
    nozzleGroup.add(shroud);

    // 16 Individual Variable-Geometry Titanium Turkey-Feather Exhaust Petals
    for (let p = 0; p < 16; p++) {
      const ang = (p / 16) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.032, 0.48), titaniumMat);
      petal.position.set(Math.cos(ang) * 0.36, Math.sin(ang) * 0.36, -0.38);
      petal.rotation.z = ang + Math.PI * 0.5;
      petal.rotation.x = -0.18;
      nozzleGroup.add(petal);
    }

    // Glowing amber-white inner afterburner core disc + concentric flame-holder rings
    const coreDisc = new THREE.Mesh(smoothCurved(new THREE.CircleGeometry(0.31, 20)), burnerCoreMat);
    coreDisc.rotation.y = Math.PI;
    coreDisc.position.z = -0.44;
    nozzleGroup.add(coreDisc);

    for (const rFlame of [0.14, 0.24]) {
      const flameRing = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(rFlame, 0.022, 8, 20)), burnerRingMat);
      flameRing.position.z = -0.48;
      nozzleGroup.add(flameRing);
    }

    fuselage.add(nozzleGroup);
    nozzles.push(nozzleGroup);
  }

  let propeller = null;
  if (isProp) {
    propeller = new THREE.Group();
    propeller.position.set(0, 1.32, 7.55);
    const spinner = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.24, 0.52, 18)), chromeMat);
    spinner.rotation.x = Math.PI * 0.5;
    propeller.add(spinner);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.65, 0.025), titaniumMat);
      blade.rotation.z = (b * Math.PI) * 0.5;
      propeller.add(blade);
    }
    fuselage.add(propeller);
  }

  // 8. Tricycle Landing Gear with 24-Segment Tires, Strut Doors & Brake Discs
  const wheels = [];
  const frontSteerPivots = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.82, metalness: 0.10 });
  for (const [wx, wz, r, isFront] of [
    [0, 3.65, 0.26, true],
    [-1.45, -0.85, 0.34, false],
    [1.45, -0.85, 0.34, false],
  ]) {
    const strut = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.048, 0.048, 0.88, 12)), chromeMat);
    strut.position.set(wx, 0.68, wz);
    fuselage.add(strut);
    const gearDoor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.52, 0.86), lowerAirframeMat);
    gearDoor.position.set(wx + (wx === 0 ? 0.22 : Math.sign(wx) * 0.24), 0.82, wz);
    fuselage.add(gearDoor);
    const { pivot, wheelMesh } = buildWheelAssembly(r, 0.18, tireMat, chromeMat, 0xe6192e);
    pivot.position.set(wx, r, wz);
    root.add(pivot);
    wheels.push(wheelMesh);
    if (isFront) frontSteerPivots.push(pivot);
  }

  // 9. Supersonic Afterburner Plumes & Wingtip Contrails (`nitroVfx`)
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  fuselage.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [], aeroFlaps: [] };

  for (const sx of [-0.52, 0.52]) {
    const plume = createThrusterFlameCone(0.32, 5.8, 0xffffff, 0xff6b00);
    plume.position.set(sx, 1.36, -4.60);
    nitroVfx.add(plume);
    vfxParts.plumes.push(plume);
  }
  for (const sx of [-5.24, 5.24]) {
    const contrail = createSpeedTrailRibbon(0.18, 16.0, 0xe2e8f0, 0.72);
    contrail.position.set(sx, 1.34, -2.35);
    nitroVfx.add(contrail);
    vfxParts.trails.push(contrail);
  }

  root.traverse((obj) => {
    if (obj.isMesh && !nitroVfx.getObjectById(obj.id)) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  root.userData = {
    typeId: variant,
    variant,
    chassis: fuselage,
    fuselage,
    wings,
    cockpit: cockpitTub,
    ejectionSeat,
    hudGlass,
    intakes,
    verticalTails,
    missiles,
    nozzles,
    propeller,
    wheels,
    frontSteerPivots,
    nitroVfx,
    vfxParts,
  };
  return root;
}

/**
 * Builds a high-craftsmanship 3D Kaiju Boss Monster (`createKaijuModel`).
 * Includes:
 * - Sculpted muscular anatomy with layered armored chest & abdominal scute plates + bioluminescent crystal chest core
 * - Articulated thigh, armored knee, calf & 4-toed clawed feet resting at y = 0 (`leftLeg`, `rightLeg`)
 * - Muscular arms with deltoid shoulder spikes & 4 curved razor talons per hand (`leftArm`, `rightArm`)
 * - Ferocious head & articulated lower jaw with rows of white ivory fangs, glowing eyes & flared nostrils (`headGroup`, `jawGroup`)
 * - 10 progressively tapered articulated whipped tail segments (`tailSegments`)
 * - Jagged bioluminescent dorsal spine fins crowned with multi-faceted crystal shards (`dorsalFins`)
 */
export function createKaijuModel(variant = 'titan', options = {}) {
  const root = new THREE.Group();

  const palettes = {
    titan: { hide: 0x242830, armor: 0x383f4d, crystal: 0x00f0ff, eye: 0xffe066 },
    crimson: { hide: 0x2b1816, armor: 0x4a2822, crystal: 0xff5400, eye: 0xffd166 },
    emerald: { hide: 0x1e2c20, armor: 0x344c36, crystal: 0x22ff99, eye: 0xfff078 },
  };
  const pal = palettes[variant] || palettes.titan;

  const hideMat = new THREE.MeshStandardMaterial({ color: pal.hide, roughness: 0.62, metalness: 0.22 });
  const armorMat = new THREE.MeshStandardMaterial({ color: pal.armor, roughness: 0.42, metalness: 0.46 });
  const fangMat = new THREE.MeshStandardMaterial({ color: 0xf6f4eb, roughness: 0.22, metalness: 0.15 });
  const talonMat = new THREE.MeshStandardMaterial({ color: 0x18191e, roughness: 0.26, metalness: 0.58 });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: pal.crystal,
    emissive: pal.crystal,
    emissiveIntensity: 0.85,
    roughness: 0.14,
    metalness: 0.65,
  });
  const eyeGlowMat = new THREE.MeshBasicMaterial({ color: pal.eye });
  const mawMat = new THREE.MeshStandardMaterial({ color: 0x5c1a24, roughness: 0.55, metalness: 0.10 });

  // 1. Muscular Pelvis & Torso + Layered Armored Chest Scute Plates + Bioluminescent Chest Core
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 2.65, 0);
  root.add(pelvis);

  const pelvisMesh = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(1.28, 18, 14)), hideMat);
  pelvisMesh.scale.set(1.08, 0.88, 1.02);
  pelvis.add(pelvisMesh);

  const torso = new THREE.Group();
  torso.position.set(0, 1.45, 0.35);
  torso.rotation.x = 0.24;
  pelvis.add(torso);

  const ribcage = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(1.48, 1.18, 2.75, 20, 3)), hideMat);
  ribcage.scale.set(1.12, 1.0, 0.92);
  torso.add(ribcage);

  // 6 Layered Armored Pectoral & Abdominal Scute Plates
  for (let row = 0; row < 6; row++) {
    const py = -1.05 + row * 0.42;
    const pw = 1.05 + Math.sin((row / 5) * Math.PI) * 0.55;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.32, 0.28), armorMat);
    plate.position.set(0, py, 1.06 + (row >= 3 ? 0.12 : 0));
    plate.rotation.x = -0.15;
    torso.add(plate);
  }

  // Faceted Bioluminescent Atomic Chest Core (`chestCore`)
  const chestCore = new THREE.Mesh(smoothCurved(new THREE.IcosahedronGeometry(0.46, 2)), crystalMat);
  chestCore.scale.set(1.0, 1.35, 0.65);
  chestCore.position.set(0, 0.42, 1.24);
  torso.add(chestCore);

  // 2. Articulated Muscular Legs (`leftLeg`, `rightLeg`) with Thigh, Knee Armor, Calf & 4 Clawed Talons
  const buildKaijuLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 1.15, 2.65, 0.05);

    const thigh = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.68, 0.52, 1.55, 16)), hideMat);
    thigh.position.set(0, -0.68, 0.12);
    thigh.rotation.x = -0.18;
    leg.add(thigh);

    const kneeArmor = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.42, 0.65, 10)), armorMat);
    kneeArmor.rotation.x = Math.PI * 0.42;
    kneeArmor.position.set(0, -1.32, 0.48);
    leg.add(kneeArmor);

    const calf = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.50, 0.38, 1.35, 16)), hideMat);
    calf.position.set(0, -1.92, -0.05);
    calf.rotation.x = 0.14;
    leg.add(calf);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.32, 1.28), armorMat);
    foot.position.set(0, -2.49, 0.28);
    leg.add(foot);

    // 4 Curved Front Talons + Rear Dewclaw Spur
    for (let t = 0; t < 4; t++) {
      const tx = (t - 1.5) * 0.22;
      const talon = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.11, 0.52, 10)), talonMat);
      talon.rotation.x = Math.PI * 0.44;
      talon.position.set(tx, -2.54, 1.06);
      leg.add(talon);
    }
    const heelSpur = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.10, 0.42, 10)), talonMat);
    heelSpur.rotation.x = -Math.PI * 0.42;
    heelSpur.position.set(0, -2.48, -0.46);
    leg.add(heelSpur);

    return leg;
  };
  const leftLeg = buildKaijuLeg(-1);
  const rightLeg = buildKaijuLeg(1);
  root.add(leftLeg, rightLeg);

  // 3. Muscular Arms (`leftArm`, `rightArm`) with Deltoid Spikes, Bracer Forearms & 4 Curved Talons
  const buildKaijuArm = (side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 1.62, 0.95, 0.15);

    const shoulder = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.54, 14, 12)), armorMat);
    arm.add(shoulder);

    const deltoidSpike = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.22, 0.68, 10)), crystalMat);
    deltoidSpike.position.set(side * 0.42, 0.36, -0.10);
    deltoidSpike.rotation.z = -side * 0.58;
    arm.add(deltoidSpike);

    const bicep = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.44, 0.36, 1.18, 14)), hideMat);
    bicep.position.set(side * 0.18, -0.58, 0.18);
    bicep.rotation.z = side * 0.18;
    bicep.rotation.x = -0.35;
    arm.add(bicep);

    const forearm = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.36, 0.28, 1.15, 14)), armorMat);
    forearm.position.set(side * 0.24, -1.28, 0.72);
    forearm.rotation.x = -0.85;
    arm.add(forearm);

    const hand = new THREE.Group();
    hand.position.set(side * 0.24, -1.65, 1.24);
    arm.add(hand);

    const palm = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.28, 12, 10)), hideMat);
    hand.add(palm);

    // 4 Articulated Curved Razor Talons per hand
    for (let c = 0; c < 4; c++) {
      const cx = (c - 1.5) * 0.13;
      const claw = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.068, 0.48, 10)), talonMat);
      claw.position.set(cx, -0.16, 0.34);
      claw.rotation.x = Math.PI * 0.62;
      hand.add(claw);
    }
    return arm;
  };
  const leftArm = buildKaijuArm(-1);
  const rightArm = buildKaijuArm(1);
  torso.add(leftArm, rightArm);

  // 4. Ferocious Head & Articulated Jaw (`headGroup`, `jawGroup`) with White Fangs, Glowing Eyes & Nostrils
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.85, 0.55);
  torso.add(headGroup);

  const neck = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.76, 1.05, 1.15, 16)), hideMat);
  neck.position.set(0, -0.35, -0.18);
  neck.rotation.x = 0.32;
  headGroup.add(neck);

  const cranium = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.76, 1.55), armorMat);
  cranium.position.set(0, 0.24, 0.42);
  headGroup.add(cranium);

  // Armored brow horns, glowing predator eyes & flared nostrils
  for (const sx of [-1, 1]) {
    const browRidge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.72), armorMat);
    browRidge.position.set(sx * 0.52, 0.52, 0.55);
    browRidge.rotation.z = -sx * 0.25;
    headGroup.add(browRidge);

    const horn = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.16, 0.68, 10)), crystalMat);
    horn.position.set(sx * 0.56, 0.68, -0.22);
    horn.rotation.x = -0.68;
    horn.rotation.z = -sx * 0.32;
    headGroup.add(horn);

    const eye = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.13, 12, 10)), eyeGlowMat);
    eye.position.set(sx * 0.56, 0.34, 0.68);
    headGroup.add(eye);

    const nostrilCavity = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.085, 10, 8)), talonMat);
    nostrilCavity.position.set(sx * 0.28, 0.32, 1.16);
    headGroup.add(nostrilCavity);
  }

  // Upper maxillary fang row (10 sharp white conical fangs + 2 large canine tusks)
  for (let f = 0; f < 10; f++) {
    const side = f < 5 ? -1 : 1;
    const idx = f % 5;
    const isTusk = idx === 1;
    const fang = new THREE.Mesh(
      smoothCurved(new THREE.ConeGeometry(isTusk ? 0.068 : 0.045, isTusk ? 0.28 : 0.18, 8)),
      fangMat
    );
    fang.rotation.x = Math.PI;
    fang.position.set(side * (0.48 - idx * 0.06), -0.18, 0.25 + idx * 0.18);
    headGroup.add(fang);
  }

  // Articulated Lower Jaw (`jawGroup`) with Lower Mandibular Fang Row & Atomic Breath Emitter
  const jawGroup = new THREE.Group();
  jawGroup.position.set(0, -0.12, 0.08);
  jawGroup.rotation.x = 0.34;
  headGroup.add(jawGroup);

  const mandible = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.34, 1.42), armorMat);
  mandible.position.set(0, -0.14, 0.52);
  jawGroup.add(mandible);

  const palate = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.10, 1.24), mawMat);
  palate.position.set(0, 0.02, 0.52);
  jawGroup.add(palate);

  for (let f = 0; f < 10; f++) {
    const side = f < 5 ? -1 : 1;
    const idx = f % 5;
    const isTusk = idx === 0;
    const fang = new THREE.Mesh(
      smoothCurved(new THREE.ConeGeometry(isTusk ? 0.065 : 0.042, isTusk ? 0.26 : 0.16, 8)),
      fangMat
    );
    fang.position.set(side * (0.44 - idx * 0.055), 0.14, 0.28 + idx * 0.17);
    jawGroup.add(fang);
  }

  const mouthPoint = new THREE.Object3D();
  mouthPoint.position.set(0, 0.05, 0.95);
  headGroup.add(mouthPoint);

  // 5. Long Whipped Tail (`tailSegments` — 10 Articulated Segments + Spiked Tail Blade)
  const tailSegments = [];
  let parentTail = pelvis;
  for (let s = 0; s < 10; s++) {
    const segGroup = new THREE.Group();
    const r0 = Math.max(0.14, 0.98 * Math.pow(0.82, s));
    const r1 = Math.max(0.10, 0.98 * Math.pow(0.82, s + 1));
    const segLen = 0.92;
    segGroup.position.set(0, s === 0 ? -0.35 : 0, s === 0 ? -0.85 : -segLen * 0.92);
    segGroup.rotation.x = s < 4 ? -0.12 : 0.08;

    const segCyl = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(r1, r0, segLen, 14)), hideMat);
    segCyl.rotation.x = Math.PI * 0.5;
    segCyl.position.z = -segLen * 0.5;
    segGroup.add(segCyl);

    // Dorsal tail crystal spine on each segment
    const tailSpine = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(r0 * 0.36, r0 * 1.15, 6)), crystalMat);
    tailSpine.position.set(0, r0 * 0.95, -segLen * 0.45);
    tailSpine.rotation.x = -0.35;
    segGroup.add(tailSpine);

    if (s === 9) {
      const thagomizer = new THREE.Mesh(smoothCurved(new THREE.OctahedronGeometry(0.32, 0)), crystalMat);
      thagomizer.scale.set(0.65, 1.2, 2.4);
      thagomizer.position.set(0, 0, -segLen - 0.25);
      segGroup.add(thagomizer);
    }

    parentTail.add(segGroup);
    parentTail = segGroup;
    tailSegments.push(segGroup);
  }

  // 6. Jagged Bioluminescent Dorsal Spine Fins with Crystal Facets (`dorsalFins`)
  const dorsalFins = [];
  for (let d = 0; d < 7; d++) {
    const finGroup = new THREE.Group();
    const t = d / 6;
    const size = 0.55 + Math.sin(t * Math.PI) * 0.85;
    finGroup.position.set(0, -1.05 + d * 0.44, -0.95 - Math.sin(t * Math.PI) * 0.28);
    finGroup.rotation.x = -0.42;

    // Armored basalt dorsal base plate
    const baseFin = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(size * 0.42, size * 0.95, 5)), armorMat);
    baseFin.scale.set(0.38, 1.0, 1.25);
    finGroup.add(baseFin);

    // Center & flanking multi-faceted glowing crystal shards
    const mainShard = new THREE.Mesh(smoothCurved(new THREE.OctahedronGeometry(size * 0.48, 0)), crystalMat);
    mainShard.scale.set(0.35, 1.85, 0.88);
    mainShard.position.set(0, size * 0.55, -0.08);
    finGroup.add(mainShard);

    for (const sx of [-1, 1]) {
      const sideShard = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(size * 0.22, size * 0.85, 5)), crystalMat);
      sideShard.position.set(sx * 0.36, size * 0.25, 0.05);
      sideShard.rotation.z = -sx * 0.38;
      finGroup.add(sideShard);
    }

    torso.add(finGroup);
    dorsalFins.push(finGroup);
  }

  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  root.userData = {
    variant,
    pelvis,
    torso,
    chestCore,
    headGroup,
    jawGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    tailSegments,
    dorsalFins,
    mouthPoint,
  };
  return root;
}

/**
 * Animates the mode-specific Nitro Boost visual effects (`nitroVfx`) on any entity
 * (Mach-1 Cyber Hypercar, Standard Vehicles, Pedestrian Cyber-Sprint, or Helicopter).
 */
export function updateEntityNitroVfx(entityRoot, isActive, speedMps, timeSec) {
  if (!entityRoot || !entityRoot.userData) return;
  updateVehicleEffects(entityRoot, timeSec, Boolean(entityRoot.userData.sirenActive));
  const { nitroVfx, vfxParts, typeId } = entityRoot.userData;
  if (!nitroVfx || !vfxParts) return;

  const absSpd = Math.abs(speedMps);
  const show = Boolean(isActive && absSpd > 0.8);
  if (vfxParts.rig) { updateNitroRig(vfxParts.rig, show, absSpd, timeSec); return; } // [nitro-fx]
  nitroVfx.visible = show;

  // Deploy active aero flaps on cyber_mach1 when boosting
  if (vfxParts.aeroFlaps) {
    for (let i = 0; i < vfxParts.aeroFlaps.length; i++) {
      const flap = vfxParts.aeroFlaps[i];
      flap.rotation.x = show ? 0.32 : 0.0;
    }
  }

  if (!show) return;

  // High-frequency thruster flicker + Mach-scaled stretch
  const pulse = 0.88 + 0.16 * Math.sin(timeSec * 48.0) + 0.08 * Math.cos(timeSec * 83.0);
  const speedScale = typeId === 'cyber_mach1'
    ? Math.min(1.15, 0.72 + (absSpd / 340.3) * 0.43)
    : Math.min(1.22, 0.78 + (absSpd / 80.0) * 0.44);

  for (let i = 0; i < (vfxParts.plumes || []).length; i++) {
    const p = vfxParts.plumes[i];
    p.scale.set(0.92 + 0.14 * Math.sin(timeSec * 36.0 + i), 0.92 + 0.14 * Math.cos(timeSec * 36.0 + i), pulse * speedScale);
  }

  // Transonic Mach vapor cone & shockwave rings (brightest as speed approaches Mach 1 = 340.3 m/s)
  if (vfxParts.shockCones && vfxParts.shockCones.length > 0) {
    const machRatio = Math.min(1.0, absSpd / 280.0);
    for (let i = 0; i < vfxParts.shockCones.length; i++) {
      const sc = vfxParts.shockCones[i];
      const sPulse = 0.94 + 0.10 * Math.sin(timeSec * 28.0 + i * 1.7);
      sc.scale.set(sPulse, sPulse, 0.85 + machRatio * 0.45);
      if (sc.material) {
        sc.material.opacity = (i === 0 ? 0.28 : 0.42) + machRatio * 0.38;
      }
    }
  }

  // Spin energy rings / shock diamonds
  for (let i = 0; i < (vfxParts.rings || []).length; i++) {
    const r = vfxParts.rings[i];
    r.rotation.z += 0.12 * (i % 2 === 0 ? 1 : -1);
    const rScale = 0.92 + 0.12 * Math.sin(timeSec * 32.0 + i * 1.3);
    r.scale.set(rScale, rScale, rScale);
  }

  // Stretch speed ribbons with velocity
  for (let i = 0; i < (vfxParts.trails || []).length; i++) {
    const tr = vfxParts.trails[i];
    tr.scale.z = Math.max(0.45, Math.min(1.65, speedScale * (0.92 + 0.08 * Math.sin(timeSec * 40.0 + i))));
  }
}

/**
 * Simulates ambient AI vehicles moving along real OSM road segments in active chunks.
 */
export class TrafficManager {
  constructor(scene, maxCars = 40) {
    this.scene = scene;
    this.maxCars = maxCars;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.cars = [];

    const types = ['taxi', 'taxi', 'police', 'supercar', 'aero_formula', 'bus'];
    for (let i = 0; i < maxCars; i++) {
      const t = types[i % types.length];
      const mesh = createVehicleModel(t);
      mesh.visible = false;
      this.group.add(mesh);
      this.cars.push({
        active: false,
        mesh,
        seg: null,
        t: 0,
        speed: 14 + (i % 7) * 2.2,
        laneOffset: 0,
      });
    }
  }

  setVisible(v) {
    this.group.visible = Boolean(v);
  }

  update(dt, playerPos, loadedChunksMap) {
    if (!this.group.visible) return;

    // Collect candidate segments from nearby loaded chunks
    const candidates = [];
    for (const chunk of loadedChunksMap.values()) {
      const dx = chunk.userData.ox - playerPos.x;
      const dz = chunk.userData.oz - playerPos.z;
      if (dx * dx + dz * dz > 1600 * 1600) continue;
      const segs = chunk.userData.roadSegments;
      if (segs && segs.length > 0) {
        candidates.push(segs);
      }
    }
    if (candidates.length === 0) return;

    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (!c.active || !c.seg) {
        this._respawnCar(c, candidates, playerPos);
        continue;
      }

      const s = c.seg;
      const dx = s.x2 - s.x1;
      const dz = s.z2 - s.z1;
      const len = Math.hypot(dx, dz);
      if (len < 1.0) {
        c.active = false;
        c.mesh.visible = false;
        continue;
      }

      c.t += (c.speed * dt) / len;
      if (c.t >= 1.0) {
        // Attempt to chain to a connected road segment in the same chunk list
        const endX = s.x2, endY = s.y2, endZ = s.z2;
        let nextSeg = null;
        for (const segList of candidates) {
          for (let k = 0; k < segList.length; k++) {
            const cand = segList[k];
            if (
              Math.abs(cand.x1 - endX) < 1.8 &&
              Math.abs(cand.z1 - endZ) < 1.8 &&
              Math.abs(cand.y1 - endY) < 2.2
            ) {
              nextSeg = cand;
              break;
            }
          }
          if (nextSeg) break;
        }
        if (nextSeg) {
          c.seg = nextSeg;
          c.t = 0.0;
        } else {
          c.active = false;
          c.mesh.visible = false;
          continue;
        }
      }

      const cur = c.seg;
      const cdx = cur.x2 - cur.x1;
      const cdy = cur.y2 - cur.y1;
      const cdz = cur.z2 - cur.z1;
      const clen = Math.hypot(cdx, cdz) || 1;
      const nx = -cdz / clen;
      const nz = cdx / clen;

      const wx = cur.x1 + cdx * c.t + nx * c.laneOffset;
      const wy = cur.y1 + cdy * c.t;
      const wz = cur.z1 + cdz * c.t + nz * c.laneOffset;

      const distSq = (wx - playerPos.x) ** 2 + (wz - playerPos.z) ** 2;
      if (distSq > 950 * 950) {
        c.active = false;
        c.mesh.visible = false;
        continue;
      }

      c.mesh.visible = true;
      c.mesh.position.set(wx, wy, wz);
      c.mesh.rotation.y = Math.atan2(cdx, cdz);
      c.mesh.rotation.x = -Math.atan2(cdy, clen);
    }
  }

  _respawnCar(c, candidates, playerPos) {
    const segList = candidates[Math.floor(Math.random() * candidates.length)];
    if (!segList || segList.length === 0) return;
    for (let tries = 0; tries < 8; tries++) {
      const s = segList[Math.floor(Math.random() * segList.length)];
      if (s.cls === 'service' || s.cls === 'footway' || s.cls === 'cycleway' || s.cls === 'pedestrian') {
        continue;
      }
      const dist = Math.hypot(s.x1 - playerPos.x, s.z1 - playerPos.z);
      if (dist > 45 && dist < 750) {
        c.seg = s;
        c.t = Math.random() * 0.7;
        c.active = true;
        c.laneOffset = s.oneway ? ((Math.random() - 0.5) * Math.max(0, s.width - 3.2)) : -Math.min(3.2, s.width * 0.25);
        c.speed = s.cls === 'motorway' || s.cls === 'trunk' ? 22 + Math.random() * 10 : 12 + Math.random() * 6;
        return;
      }
    }
  }
}
