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

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.34, metalness: 0.72 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.38, metalness: 0.48 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.16, metalness: 0.92 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.84, metalness: 0.12 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.20, metalness: 0.88 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1b2a, roughness: 0.10, metalness: 0.92 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.68, metalness: 0.22 });
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
    // ⚡ 轩辕·零式 1马赫未来超跑 (Mach-1 Cyber Hypercar)
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x0b101b, roughness: 0.18, metalness: 0.88 });
    const gunmetalMat = new THREE.MeshStandardMaterial({ color: 0x1c2536, roughness: 0.24, metalness: 0.78 });
    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
    const magentaNeonMat = new THREE.MeshBasicMaterial({ color: 0xff2a85 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x081c2e, roughness: 0.06, metalness: 0.94 });

    // Sculpted low-slung supersonic wedge fuselage + carbon front splitter & rear diffuser
    const lowerPan = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.20, 5.06), hullMat);
    lowerPan.position.set(0, 0.25, 0);
    chassis.add(lowerPan);

    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.045, 0.62), carbonMat);
    frontSplitter.position.set(0, 0.16, 2.48);
    chassis.add(frontSplitter);

    // Front supersonic needle nose cone
    const noseGeo = smoothCurved(new THREE.ConeGeometry(1.12, 1.85, 16));
    noseGeo.rotateX(Math.PI * 0.5);
    noseGeo.scale(0.96, 0.24, 1.0);
    const noseMesh = new THREE.Mesh(noseGeo, hullMat);
    noseMesh.position.set(0, 0.36, 2.25);
    chassis.add(noseMesh);

    // Contoured hood power-bulge & NACA duct intake
    const hoodBulge = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.28, 0.42, 1.45, 16)), gunmetalMat);
    hoodBulge.rotation.x = Math.PI * 0.5;
    hoodBulge.scale.set(1.2, 0.34, 1.0);
    hoodBulge.position.set(0, 0.56, 1.32);
    chassis.add(hoodBulge);

    // Central sculpted upper fuselage
    const midDeck = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.28, 3.65), gunmetalMat);
    midDeck.position.set(0, 0.48, -0.15);
    chassis.add(midDeck);

    // Fighter-jet teardrop glass bubble canopy + interior seats & yoke silhouette
    const canopyGeo = smoothCurved(new THREE.SphereGeometry(0.68, 22, 16));
    canopyGeo.scale(0.95, 0.46, 2.15);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.68, 0.10);
    chassis.add(canopy);

    for (const sx of [-0.24, 0.24]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.34), interiorMat);
      seat.position.set(sx, 0.54, -0.05);
      seat.rotation.x = -0.25;
      chassis.add(seat);
    }
    const steeringYoke = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.11, 0.018, 8, 16)), chromeMat);
    steeringYoke.position.set(-0.24, 0.62, 0.38);
    steeringYoke.rotation.x = 0.35;
    chassis.add(steeringYoke);

    // Dorsal spine fin (LMP1 / supersonic stabilizer fin)
    const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 1.95), hullMat);
    dorsalFin.position.set(0, 0.82, -1.25);
    chassis.add(dorsalFin);
    const dorsalEdge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 1.96), cyanNeonMat);
    dorsalEdge.position.set(0, 1.00, -1.25);
    chassis.add(dorsalEdge);

    // Side aerodynamic pontoon fenders, wing mirrors on stalks, side skirts & intake tunnels
    for (const sx of [-0.92, 0.92]) {
      const sign = Math.sign(sx);
      const fender = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 4.55), hullMat);
      fender.position.set(sx, 0.44, 0.05);
      chassis.add(fender);

      // Sculpted wheel-arch flares (front & rear)
      for (const wz of [1.58, -1.56]) {
        const archFlare = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.41, 0.055, 10, 20, Math.PI)), gunmetalMat);
        archFlare.rotation.y = Math.PI * 0.5;
        archFlare.position.set(sx + sign * 0.16, 0.38, wz);
        chassis.add(archFlare);
      }

      // Aerodynamic wing mirror on stalk
      const mirrorStalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.05), carbonMat);
      mirrorStalk.position.set(sx + sign * 0.14, 0.66, 0.78);
      mirrorStalk.rotation.z = -sign * 0.22;
      chassis.add(mirrorStalk);
      const mirrorCap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.065, 0.11), hullMat);
      mirrorCap.position.set(sx + sign * 0.22, 0.68, 0.76);
      chassis.add(mirrorCap);

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

    // Front laser blade headlights + multi-element LED projectors + rear full-width cyber lightbar
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

    group.userData.paintMeshes = [lowerPan, noseMesh, midDeck, dorsalFin];

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
    // 🏎️ 燕京·量子矢量方程式 (Quantum Formula Aero)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.20, metalness: 0.68 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.22, metalness: 0.86 });

    // Narrow formula monocoque tub & sculpted needle nose cone
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.36, 4.1), bodyMat);
    tub.position.set(0, 0.38, -0.05);
    chassis.add(tub);

    const noseCone = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.36, 1.35, 16)), bodyMat);
    noseCone.rotation.x = Math.PI * 0.5;
    noseCone.scale.set(1.0, 0.62, 1.0);
    noseCone.position.set(0, 0.32, 2.15);
    chassis.add(noseCone);

    // Sidepods with ground-effect radiator inlets & bargeboards
    for (const sx of [-0.62, 0.62]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 2.15), carbonMat);
      pod.position.set(sx, 0.36, -0.25);
      chassis.add(pod);
      const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.04, 2.16), goldMat);
      goldTrim.position.set(sx, 0.54, -0.25);
      chassis.add(goldTrim);
    }

    // Multi-element front wing with endplates
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.05, 0.52), carbonMat);
    frontWing.position.set(0, 0.16, 2.34);
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

    // Halo cockpit titanium protection + driver seat + steering wheel + airbox intake
    const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 1.35), bodyMat);
    airbox.position.set(0, 0.72, -0.55);
    chassis.add(airbox);

    const haloArch = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.34, 0.028, 10, 20, Math.PI)), carbonMat);
    haloArch.rotation.x = Math.PI * 0.45;
    haloArch.position.set(0, 0.68, 0.12);
    chassis.add(haloArch);

    // High-downforce swan-neck rear wing + rear Venturi diffuser
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.07, 0.46), carbonMat);
    rearWing.position.set(0, 0.92, -2.18);
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
    // Fine-Detail Sports / Grand-Tourer Car, City Taxi & Police Interceptor
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
      lowerCol = 0x1b263b;
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

    // Metallic clearcoat PBR finish (roughness 0.18..0.24, metalness 0.48..0.62)
    const lowerMat = new THREE.MeshStandardMaterial({ color: lowerCol, roughness: 0.22, metalness: 0.54 });
    const upperMat = new THREE.MeshStandardMaterial({ color: upperCol, roughness: 0.19, metalness: 0.50 });

    // 1. Lower & Upper Sculpted Body Shells
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH * 0.55, bodyL), lowerMat);
    lowerBody.position.set(0, 0.35 + bodyH * 0.25, 0);
    chassis.add(lowerBody);

    const upperBody = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.98, bodyH * 0.55, bodyL * 0.98), upperMat);
    upperBody.position.set(0, 0.35 + bodyH * 0.72, 0);
    chassis.add(upperBody);

    // 2. Contoured Hood Power-Bulge & Twin Heat-Extractor Louvers
    const hoodBulgeGeo = smoothCurved(new THREE.CylinderGeometry(bodyW * 0.24, bodyW * 0.32, bodyL * 0.32, 16));
    hoodBulgeGeo.rotateX(Math.PI * 0.5);
    hoodBulgeGeo.scale(1.15, 0.22, 1.0);
    const hoodBulge = new THREE.Mesh(hoodBulgeGeo, upperMat);
    hoodBulge.position.set(0, 0.35 + bodyH * 0.98, bodyL * 0.27);
    chassis.add(hoodBulge);

    for (const sx of [-bodyW * 0.22, bodyW * 0.22]) {
      const hoodVent = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.34), carbonMat);
      hoodVent.position.set(sx, 0.35 + bodyH * 1.00, bodyL * 0.28);
      chassis.add(hoodVent);
    }

    // 3. Sculpted Aerodynamic Front Splitter + Honeycomb Radiator Grille
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.03, 0.055, 0.36), carbonMat);
    frontSplitter.position.set(0, 0.26, bodyL * 0.50 + 0.08);
    chassis.add(frontSplitter);

    for (const sx of [-bodyW * 0.50, bodyW * 0.50]) {
      const diveCanard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.24), carbonMat);
      diveCanard.position.set(sx, 0.32, bodyL * 0.50 + 0.06);
      chassis.add(diveCanard);
    }

    const grilleFrame = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.58, bodyH * 0.42, 0.09), carbonMat);
    grilleFrame.position.set(0, 0.35 + bodyH * 0.38, bodyL * 0.50 + 0.01);
    chassis.add(grilleFrame);

    // Honeycomb radiator grille mesh bars + chrome center badge
    for (let g = -3; g <= 3; g++) {
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.018, bodyH * 0.36, 0.10), darkMetal);
      vBar.position.set(g * (bodyW * 0.075), 0.35 + bodyH * 0.38, bodyL * 0.50 + 0.015);
      chassis.add(vBar);
    }
    for (const gy of [-0.05, 0.05]) {
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.54, 0.016, 0.105), darkMetal);
      hBar.position.set(0, 0.35 + bodyH * 0.38 + gy, bodyL * 0.50 + 0.018);
      chassis.add(hBar);
    }
    const badge = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 16)), chromeMat);
    badge.rotation.x = Math.PI * 0.5;
    badge.position.set(0, 0.35 + bodyH * 0.42, bodyL * 0.50 + 0.058);
    chassis.add(badge);

    // 4. Sculpted Fender Flares, Carbon Side Skirts, Aerodynamic Wing Mirrors on Stalks & Door Handles
    const wxOff = bodyW * 0.48;
    const wzOff = bodyL * 0.33;
    for (const sx of [-1, 1]) {
      // Carbon aerodynamic side rocker skirt
      const sideSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.085, bodyL * 0.58), carbonMat);
      sideSkirt.position.set(sx * (bodyW * 0.50), 0.28, 0);
      chassis.add(sideSkirt);

      // Sculpted front & rear fender flares over wheel arches
      for (const wz of [wzOff, -wzOff]) {
        const flareGeo = smoothCurved(new THREE.TorusGeometry(0.39, 0.052, 10, 20, Math.PI));
        const flare = new THREE.Mesh(flareGeo, upperMat);
        flare.rotation.y = Math.PI * 0.5;
        flare.position.set(sx * (bodyW * 0.49), 0.38, wz);
        chassis.add(flare);
      }

      // Aerodynamic wing mirror on stalk
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.032, 0.045), darkMetal);
      stalk.position.set(sx * (bodyW * 0.47), 0.35 + bodyH + 0.04, bodyL * 0.14);
      stalk.rotation.z = -sx * 0.26;
      chassis.add(stalk);

      const mirrorCap = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.075, 12, 10)), upperMat);
      mirrorCap.scale.set(1.25, 0.65, 0.85);
      mirrorCap.position.set(sx * (bodyW * 0.54), 0.35 + bodyH + 0.07, bodyL * 0.13);
      chassis.add(mirrorCap);

      // Flush chrome/body door handles
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.032, 0.16), chromeMat);
      handle.position.set(sx * (bodyW * 0.50), 0.35 + bodyH * 0.78, -0.08);
      chassis.add(handle);
    }

    // 5. A / B / C Roof Pillars + Flush Dark Glass Cabin + Interior Seats & Steering Wheel Silhouette
    const cabinBaseY = 0.35 + bodyH;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.82, cabinH * 0.94, bodyL * 0.50), glassMat);
    cabin.position.set(0, cabinBaseY + cabinH * 0.42, -0.15);
    chassis.add(cabin);

    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.78, 0.075, bodyL * 0.46), upperMat);
    cabinRoof.position.set(0, cabinBaseY + cabinH * 0.90, -0.15);
    chassis.add(cabinRoof);

    // A, B, and C Roof Pillars
    for (const sx of [-bodyW * 0.39, bodyW * 0.39]) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.055, cabinH * 1.05, 0.065), upperMat);
      aPillar.position.set(sx, cabinBaseY + cabinH * 0.45, bodyL * 0.09);
      aPillar.rotation.x = -0.52;
      chassis.add(aPillar);

      const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.048, cabinH * 0.92, 0.085), darkMetal);
      bPillar.position.set(sx * 1.03, cabinBaseY + cabinH * 0.44, -0.12);
      chassis.add(bPillar);

      const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.065, cabinH * 1.08, 0.11), upperMat);
      cPillar.position.set(sx, cabinBaseY + cabinH * 0.44, -bodyL * 0.36);
      cPillar.rotation.x = 0.58;
      chassis.add(cPillar);
    }

    // Interior sport bucket seats with headrests & steering wheel silhouette
    for (const sx of [-bodyW * 0.20, bodyW * 0.20]) {
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.36, cabinH * 0.72, 0.10), interiorMat);
      seatBack.position.set(sx, cabinBaseY + cabinH * 0.26, -0.22);
      seatBack.rotation.x = -0.22;
      chassis.add(seatBack);
      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.08), interiorMat);
      headrest.position.set(sx, cabinBaseY + cabinH * 0.66, -0.26);
      chassis.add(headrest);
    }
    const steeringWheel = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.13, 0.020, 8, 16)), darkMetal);
    steeringWheel.position.set(-bodyW * 0.20, cabinBaseY + cabinH * 0.28, 0.14);
    steeringWheel.rotation.x = 0.38;
    chassis.add(steeringWheel);

    // 6. Front & Rear Bumpers + Rear Carbon Diffuser + Quad Chrome Exhaust Tips
    const fBumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.01, 0.22, 0.20), darkMetal);
    fBumper.position.set(0, 0.40, bodyL * 0.50);
    chassis.add(fBumper);

    const rBumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.01, 0.22, 0.20), darkMetal);
    rBumper.position.set(0, 0.40, -bodyL * 0.50);
    chassis.add(rBumper);

    // Rear carbon diffuser with 4 vertical Venturi fins
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.88, 0.15, 0.26), carbonMat);
    diffuser.position.set(0, 0.28, -bodyL * 0.50 - 0.02);
    chassis.add(diffuser);
    for (const fx of [-0.48, -0.16, 0.16, 0.48]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.16, 0.28), carbonMat);
      fin.position.set(fx, 0.26, -bodyL * 0.50 - 0.04);
      chassis.add(fin);
    }

    // Quad Chrome Exhaust Tips (dual twin pipes at rear corners)
    const pipeGeo = smoothCurved(new THREE.CylinderGeometry(0.052, 0.052, 0.22, 16));
    pipeGeo.rotateX(Math.PI * 0.5);
    const boreGeo = smoothCurved(new THREE.CircleGeometry(0.038, 14));
    boreGeo.rotateY(Math.PI);
    for (const ex of [-bodyW * 0.34, -bodyW * 0.26, bodyW * 0.26, bodyW * 0.34]) {
      const tip = new THREE.Mesh(pipeGeo, chromeMat);
      tip.position.set(ex, 0.30, -bodyL * 0.50 - 0.06);
      chassis.add(tip);
      const bore = new THREE.Mesh(boreGeo, carbonMat);
      bore.position.set(ex, 0.30, -bodyL * 0.50 - 0.172);
      chassis.add(bore);
    }

    // 7. Type-specific Roof & Active Rear Wing Spoiler
    const roofY = cabinBaseY + cabinH * 0.92;
    if (typeId === 'taxi' && !options.hideTaxiSign) {
      const signMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
      const taxiSign = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.24), signMat);
      taxiSign.position.set(0, roofY + 0.11, 0.05);
      chassis.add(taxiSign);
    } else if (typeId === 'police') {
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.10, 0.26), darkMetal);
      barBase.position.set(0, roofY + 0.06, -0.05);
      chassis.add(barBase);
      const redBeacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.14, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xff1e1e })
      );
      redBeacon.userData = { emitCode: 4 };
      redBeacon.position.set(-0.3, roofY + 0.12, -0.05);
      chassis.add(redBeacon);
      const blueBeacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.14, 0.22),
        new THREE.MeshBasicMaterial({ color: 0x1e88ff })
      );
      blueBeacon.userData = { emitCode: 5 };
      blueBeacon.position.set(0.3, roofY + 0.12, -0.05);
      chassis.add(blueBeacon);
      group.userData.lightbarParts = {
        typeId: 'police',
        phaseAMeshes: [redBeacon],
        phaseBMeshes: [blueBeacon],
      };
    }

    // Active Rear Wing Spoiler (prominent swan-neck GT wing on supercar, sleek decklid wing on sedans)
    const wingHeight = typeId === 'supercar' ? 0.28 : 0.12;
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.94, 0.055, 0.32), carbonMat);
    wingBlade.position.set(0, 0.35 + bodyH + wingHeight, -bodyL * 0.45);
    chassis.add(wingBlade);
    vfxParts.aeroFlaps.push(wingBlade);
    for (const sx of [-0.54, 0.54]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, wingHeight, 0.18), carbonMat);
      strut.position.set(sx, 0.35 + bodyH + wingHeight * 0.48, -bodyL * 0.44);
      chassis.add(strut);
    }
    for (const sx of [-bodyW * 0.47, bodyW * 0.47]) {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.36), upperMat);
      endplate.position.set(sx, 0.35 + bodyH + wingHeight, -bodyL * 0.45);
      chassis.add(endplate);
    }

    group.userData.paintMeshes = [lowerBody, upperBody, hoodBulge, cabinRoof];

    // 8. Multi-Element LED Projector Headlights + DRL Light Strips + Full-Width LED Taillight Bar
    const fullTailBar = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.92, 0.055, 0.06), tailLightMat);
    fullTailBar.position.set(0, 0.35 + bodyH * 0.72, -bodyL * 0.50 - 0.02);
    chassis.add(fullTailBar);

    for (const sx of [-bodyW * 0.36, bodyW * 0.36]) {
      const hlHousing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.10), darkMetal);
      hlHousing.position.set(sx, 0.35 + bodyH * 0.62, bodyL * 0.50 + 0.01);
      chassis.add(hlHousing);

      // Dual LED crystal projector lenses inside headlight housing
      for (const lx of [-0.08, 0.08]) {
        const lens = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.048, 0.048, 0.04, 14)), headLightMat);
        lens.rotation.x = Math.PI * 0.5;
        lens.position.set(sx + lx, 0.35 + bodyH * 0.60, bodyL * 0.50 + 0.05);
        chassis.add(lens);
      }

      // Angled LED Daytime Running Light (DRL) brow strip
      const drlStrip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.028, 0.05), drlLightMat);
      drlStrip.position.set(sx, 0.35 + bodyH * 0.71, bodyL * 0.50 + 0.045);
      drlStrip.rotation.z = sx > 0 ? -0.12 : 0.12;
      chassis.add(drlStrip);

      // Outer sculpted LED taillight clusters
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.08), tailLightMat);
      tl.position.set(sx, 0.35 + bodyH * 0.66, -bodyL * 0.50 - 0.02);
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
      plume.position.set(sx, 0.38, -bodyL * 0.5 - 0.08);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);

      const trail = createSpeedTrailRibbon(0.16, 9.5, trailCol, 0.72);
      trail.position.set(sx, 0.35 + bodyH * 0.65, -bodyL * 0.5 - 0.1);
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
 * 19-tube Hydra faceplate bores, FLIR turret lenses, boarding step bars) onto a hero helicopter if needed.
 */
function attachHeliFineDetails(root) {
  if (!root || !root.userData || root.userData._fineDetailsAttached) return root;
  root.userData._fineDetailsAttached = true;
  const fuselage = root.userData.fuselage || root;
  const mainRotor = root.userData.mainRotor;

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 0.28, metalness: 0.80 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8e2ec, roughness: 0.18, metalness: 0.90 });
  const missileMat = new THREE.MeshStandardMaterial({ color: 0x12161d, roughness: 0.20, metalness: 0.72 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xd49b35, roughness: 0.22, metalness: 0.86 });
  const seekerGlass = new THREE.MeshStandardMaterial({ color: 0x0b3848, roughness: 0.06, metalness: 0.94 });

  // Swashplate & 4 vertical pitch-control links on mainRotor
  if (mainRotor) {
    const swashUpper = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.32, 0.34, 0.05, 18)), darkMetal);
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
    const stepBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 1.65), darkMetal);
    stepBar.position.set(sx * 1.02, 0.46, 0.15);
    fuselage.add(stepBar);

    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.20, 0.54), darkMetal);
    rack.position.set(sx * 1.98, 1.04, -0.05);
    fuselage.add(rack);

    for (const mx of [-0.09, 0.09]) {
      const mGrp = new THREE.Group();
      mGrp.position.set(sx * 1.98 + mx, 0.88, 0.02);
      mGrp.add(new THREE.Mesh(hellfireBodyGeo, missileMat));
      const nose = new THREE.Mesh(hellfireNoseGeo, seekerGlass);
      nose.position.z = 0.59;
      mGrp.add(nose);
      const band = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.064, 0.064, 0.06, 12)), copperMat);
      band.rotation.x = Math.PI * 0.5;
      band.position.z = 0.28;
      mGrp.add(band);
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.18, 0.18), darkMetal);
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

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x16202e, roughness: 0.22, metalness: 0.72 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x00b4d8, roughness: 0.20, metalness: 0.65 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.32, metalness: 0.78 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdce4ec, roughness: 0.18, metalness: 0.90 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xd49b35, roughness: 0.22, metalness: 0.86 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1e36, roughness: 0.08, metalness: 0.92 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.36, metalness: 0.55 });
  const flirLensMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });
  const tipGlowMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a55 });

  // 1. Tubular Landing Skids with Curved Ski Tips, Oleo Struts & Pilot Boarding Step Bars
  const skidCylinderGeo = smoothCurved(new THREE.CylinderGeometry(0.055, 0.055, 4.15, 16));
  skidCylinderGeo.rotateX(Math.PI * 0.5);
  for (const sx of [-1.15, 1.15]) {
    const skidTube = new THREE.Mesh(skidCylinderGeo, darkMetal);
    skidTube.position.set(sx, 0.08, 0.15);
    fuselage.add(skidTube);

    const skiTip = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.22, 0.052, 10, 16, Math.PI * 0.55)), darkMetal);
    skiTip.rotation.y = Math.PI * 0.5;
    skiTip.position.set(sx, 0.30, 2.22);
    fuselage.add(skiTip);

    // Pilot boarding step bar along skid struts
    const stepBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 1.65), darkMetal);
    stepBar.position.set(sx * 0.92, 0.48, 0.20);
    fuselage.add(stepBar);

    for (const sz of [-0.95, 1.15]) {
      const strut = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.042, 0.048, 0.82, 12)), darkMetal);
      strut.position.set(sx * 0.82, 0.42, sz);
      strut.rotation.z = sx > 0 ? 0.32 : -0.32;
      fuselage.add(strut);
    }
  }

  // 2. Contoured Aerodynamic Fuselage Hull + Stepped Armoured Glass Canopy with Frame Ribs
  const mainHull = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.42, 4.4), bodyMat);
  mainHull.position.set(0, 1.38, 0.15);
  fuselage.add(mainHull);

  const bellyChine = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.24, 4.65), darkMetal);
  bellyChine.position.set(0, 0.72, 0.22);
  fuselage.add(bellyChine);

  const accentStripe = new THREE.Mesh(new THREE.BoxGeometry(2.09, 0.16, 4.42), accentMat);
  accentStripe.position.set(0, 1.25, 0.15);
  fuselage.add(accentStripe);

  // Sculpted aerodynamic nose cone + stepped armoured glass cockpit canopy with blast-proof frame ribs
  const noseGeo = smoothCurved(new THREE.SphereGeometry(1.02, 22, 16));
  noseGeo.scale(0.98, 0.68, 1.55);
  const noseGlass = new THREE.Mesh(noseGeo, glassMat);
  noseGlass.position.set(0, 1.35, 1.65);
  fuselage.add(noseGlass);

  const noseRadome = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.56, 18, 14)), bodyMat);
  noseRadome.scale.set(1.12, 0.62, 1.35);
  noseRadome.position.set(0, 1.05, 2.55);
  fuselage.add(noseRadome);

  // Blast-proof armoured canopy frame ribs & interior tandem pilot seats
  for (const rx of [-0.42, 0.0, 0.42]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.68, 1.45), darkMetal);
    rib.position.set(rx, 1.55, 1.72);
    rib.rotation.x = 0.36;
    fuselage.add(rib);
  }
  const crossRib = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.05, 0.06), darkMetal);
  crossRib.position.set(0, 1.58, 1.85);
  fuselage.add(crossRib);

  for (const sz of [1.15, 1.95]) {
    const pilotSeat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.42), darkMetal);
    pilotSeat.position.set(0, 1.22, sz);
    fuselage.add(pilotSeat);
  }

  // 3. Chin-Mounted FLIR Electro-Optical Sensor Ball & Under-Nose 30mm M230 Chain Gun Turret
  const flirYoke = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.32), darkMetal);
  flirYoke.position.set(0, 0.88, 2.98);
  fuselage.add(flirYoke);

  const flirBall = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.24, 18, 14)), darkMetal);
  flirBall.position.set(0, 0.82, 3.12);
  fuselage.add(flirBall);

  const flirEye = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14)), flirLensMat);
  flirEye.rotation.x = Math.PI * 0.5;
  flirEye.position.set(0, 0.82, 3.34);
  fuselage.add(flirEye);

  // Under-nose 30mm M230 chain gun turret with recoil cradle, perforated cooling shroud & muzzle brake
  const chinTurret = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.26, 16, 12)), darkMetal);
  chinTurret.position.set(0, 0.72, 2.25);
  fuselage.add(chinTurret);

  const gunShroud = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.075, 0.085, 0.62, 14)), darkMetal);
  gunShroud.rotation.x = Math.PI * 0.5;
  gunShroud.position.set(0, 0.68, 2.52);
  fuselage.add(gunShroud);

  const cannonBarrel = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.042, 0.052, 1.22, 14)), chromeMat);
  cannonBarrel.rotation.x = Math.PI * 0.5;
  cannonBarrel.position.set(0, 0.68, 2.82);
  fuselage.add(cannonBarrel);

  const muzzleBrake = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.062, 0.058, 0.14, 14)), darkMetal);
  muzzleBrake.rotation.x = Math.PI * 0.5;
  muzzleBrake.position.set(0, 0.68, 3.42);
  fuselage.add(muzzleBrake);

  // 4. Stub Wings Carrying 19-Tube Hydra 70 Rocket Pods + 4 AGM-114 Hellfire Missiles
  const stubWing = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.14, 0.88), bodyMat);
  stubWing.position.set(0, 1.18, -0.15);
  fuselage.add(stubWing);

  const tubeBoreGeo = smoothCurved(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 8));
  tubeBoreGeo.rotateX(Math.PI * 0.5);
  const hellfireBodyGeo = smoothCurved(new THREE.CylinderGeometry(0.062, 0.062, 1.18, 14));
  hellfireBodyGeo.rotateX(Math.PI * 0.5);
  const hellfireNoseGeo = smoothCurved(new THREE.SphereGeometry(0.062, 12, 10));
  hellfireNoseGeo.scale(1, 1, 1.6);

  for (const sx of [-1, 1]) {
    const wingPod = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 1.18), accentMat);
    wingPod.position.set(sx * 2.25, 1.18, -0.10);
    fuselage.add(wingPod);

    // Inboard Pylon + 19-Tube M261 Hydra 70 Rocket Pod (±1.52m)
    const inPylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.20, 0.62), darkMetal);
    inPylon.position.set(sx * 1.52, 1.06, 0.02);
    fuselage.add(inPylon);

    const rocketPod = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.21, 0.21, 1.38, 18)), darkMetal);
    rocketPod.rotation.x = Math.PI * 0.5;
    rocketPod.position.set(sx * 1.52, 0.90, 0.05);
    fuselage.add(rocketPod);

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
      bore.position.set(sx * 1.52 + tx, 0.90 + ty, 0.74);
      fuselage.add(bore);
    }

    // Outboard Pylon + M299 Launcher Carrying 2 AGM-114 Hellfire Missiles per Wing (4 Total)
    const outPylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.56), darkMetal);
    outPylon.position.set(sx * 1.96, 1.05, -0.05);
    fuselage.add(outPylon);

    for (const mx of [-0.09, 0.09]) {
      const mGrp = new THREE.Group();
      mGrp.position.set(sx * 1.96 + mx, 0.88, 0.02);
      mGrp.add(new THREE.Mesh(hellfireBodyGeo, bladeMat));
      const nose = new THREE.Mesh(hellfireNoseGeo, glassMat);
      nose.position.z = 0.59;
      mGrp.add(nose);
      const band = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 12)), copperMat);
      band.rotation.x = Math.PI * 0.5;
      band.position.z = 0.28;
      mGrp.add(band);
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.18, 0.18), darkMetal);
        fin.position.z = -0.45;
        fin.rotation.z = f * Math.PI * 0.5 + Math.PI * 0.25;
        mGrp.add(fin);
      }
      fuselage.add(mGrp);
    }
  }

  // 5. Twin Turboshaft Engine Nacelles with Side Compressor Intakes & IR-Suppressed Exhaust Cowlings
  for (const sx of [-0.62, 0.62]) {
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.54, 2.48), darkMetal);
    nacelle.position.set(sx, 2.28, -0.35);
    fuselage.add(nacelle);

    const intakeRing = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.22, 0.25, 0.34, 16)), bodyMat);
    intakeRing.rotation.x = Math.PI * 0.5;
    intakeRing.position.set(sx, 2.28, 0.96);
    fuselage.add(intakeRing);

    const spinnerCone = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.11, 0.24, 14)), chromeMat);
    spinnerCone.rotation.x = Math.PI * 0.5;
    spinnerCone.position.set(sx, 2.28, 1.06);
    fuselage.add(spinnerCone);

    const exhaustCowl = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.20, 0.24, 0.42, 16)), darkMetal);
    exhaustCowl.rotation.x = -Math.PI * 0.42;
    exhaustCowl.position.set(sx, 2.34, -1.68);
    fuselage.add(exhaustCowl);
  }

  // 6. Tail Boom + Swept Vertical Fin + Horizontal Stabilator (-Z)
  const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 5.2), bodyMat);
  tailBoom.position.set(0, 1.62, -4.25);
  fuselage.add(tailBoom);

  const tailStripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 4.8), tipGlowMat);
  tailStripe.position.set(0, 1.64, -4.15);
  fuselage.add(tailStripe);

  const vertFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.68, 1.08), accentMat);
  vertFin.position.set(0, 2.25, -6.55);
  vertFin.rotation.x = -0.22;
  fuselage.add(vertFin);

  const horizStab = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.08, 0.56), bodyMat);
  horizStab.position.set(0, 1.52, -6.42);
  fuselage.add(horizStab);

  const tailBeacon = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.12, 12, 10)), beaconMat);
  tailBeacon.position.set(0, 3.14, -6.72);
  fuselage.add(tailBeacon);

  // 7. 4-Blade Articulated Main Rotor Head (`mainRotor`) with Swashplate & Pitch Links + Blur Disc
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.78, -0.10);
  fuselage.add(mainRotor);

  const mast = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.16, 0.22, 0.48, 16)), darkMetal);
  mast.position.set(0, 2.55, -0.10);
  fuselage.add(mast);

  // Stationary lower & rotating upper swashplate assembly + 4 vertical pitch links
  const swashLower = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.36, 0.38, 0.05, 18)), darkMetal);
  swashLower.position.set(0, 2.52, -0.10);
  fuselage.add(swashLower);

  const swashUpper = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 18)), chromeMat);
  swashUpper.position.set(0, -0.16, 0);
  mainRotor.add(swashUpper);

  const hubCap = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.38, 0.44, 0.18, 18)), darkMetal);
  mainRotor.add(hubCap);

  const ROTOR_RADIUS = 5.4;
  for (let b = 0; b < 4; b++) {
    const bGroup = new THREE.Group();
    bGroup.rotation.y = (b * Math.PI) * 0.5;

    // Pitch control link rod & elastomeric damper grip
    const pitchLink = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8)), chromeMat);
    pitchLink.position.set(0.12, -0.08, 0.28);
    bGroup.add(pitchLink);

    const bladeGrip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.42), darkMetal);
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

  // 8. 4-Blade Scimitar Tail Rotor (`tailRotor`) with Gearbox Hub
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.18, 2.25, -6.58);
  fuselage.add(tailRotor);
  const tailHub = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 12)), chromeMat);
  tailHub.rotation.z = Math.PI * 0.5;
  tailRotor.add(tailHub);
  for (let b = 0; b < 4; b++) {
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 1.65), bladeMat);
    tb.rotation.x = (b * Math.PI) * 0.5;
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

  for (const sx of [-0.58, 0.58]) {
    const plume = createThrusterFlameCone(0.32, 5.4, 0xffffff, 0x00f5ff);
    plume.position.set(sx, 2.28, -1.62);
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

  for (const sx of [-2.22, 2.22]) {
    const trail = createSpeedTrailRibbon(0.22, 14.0, 0x00f5ff, 0.78);
    trail.position.set(sx, 1.18, -0.65);
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
 * Includes:
 * - Sleek blended-wing-body chine nose radome + pitot tube
 * - Tinted polycarbonate bubble canopy over a detailed cockpit tub (ACES-II ejection seat + holographic HUD glass)
 * - Twin canted vertical stabilizers + all-moving horizontal tailerons
 * - Caret supersonic air intakes with splitter plates & compressor fan faces
 * - Contoured airfoil wings with aileron & flap control seams + navigation strobes
 * - Under-wing AIM-120 AMRAAM & AIM-9X Sidewinder air-to-air missiles on pylons
 * - Multi-petal serrated metallic afterburner exhaust nozzles (12 radial titanium petals per nozzle)
 */
export function createPlaneModel(variant = 'fighter_jet', options = {}) {
  const root = new THREE.Group();
  const fuselage = new THREE.Group();
  root.add(fuselage);

  const isProp = variant === 'propeller_plane' || variant === 'prop';
  const airframeMat = new THREE.MeshStandardMaterial({
    color: options.paintColor != null ? options.paintColor : (isProp ? 0x223854 : 0x262e3b),
    roughness: 0.22,
    metalness: 0.65,
  });
  const radomeMat = new THREE.MeshStandardMaterial({ color: 0x161b24, roughness: 0.28, metalness: 0.45 });
  const titaniumMat = new THREE.MeshStandardMaterial({ color: 0x454f5e, roughness: 0.20, metalness: 0.88 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x151920, roughness: 0.36, metalness: 0.78 });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x1b3a4b,
    roughness: 0.06,
    metalness: 0.92,
    transparent: true,
    opacity: 0.74,
  });
  const hudMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
  const missileWhiteMat = new THREE.MeshStandardMaterial({ color: 0xedf2f7, roughness: 0.24, metalness: 0.35 });
  const seekerMat = new THREE.MeshStandardMaterial({ color: 0x112233, roughness: 0.08, metalness: 0.92 });
  const burnerCoreMat = new THREE.MeshBasicMaterial({ color: 0xff8c1a });
  const navRedMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
  const navGreenMat = new THREE.MeshBasicMaterial({ color: 0x11ff66 });

  // 1. Blended-Wing-Body Fuselage Spine & Chine Nose Radome (+Z forward)
  const mainBody = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.78, 7.6), airframeMat);
  mainBody.position.set(0, 1.38, -0.2);
  fuselage.add(mainBody);

  // Stealth lateral chine strakes along fuselage
  const chinePlate = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.10, 7.2), airframeMat);
  chinePlate.position.set(0, 1.36, 0.15);
  fuselage.add(chinePlate);

  // Sculpted ogive nose radome cone + supersonic pitot tube needle
  const noseTransition = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.52, 0.86, 1.65, 22)), airframeMat);
  noseTransition.rotation.x = Math.PI * 0.5;
  noseTransition.scale.set(1.12, 0.65, 1.0);
  noseTransition.position.set(0, 1.34, 4.35);
  fuselage.add(noseTransition);

  const radomeCone = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.52, 2.35, 22)), radomeMat);
  radomeCone.rotation.x = Math.PI * 0.5;
  radomeCone.scale.set(1.12, 0.65, 1.0);
  radomeCone.position.set(0, 1.32, 6.32);
  fuselage.add(radomeCone);

  const pitotNeedle = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.008, 0.022, 0.72, 10)), titaniumMat);
  pitotNeedle.rotation.x = Math.PI * 0.5;
  pitotNeedle.position.set(0, 1.31, 7.75);
  fuselage.add(pitotNeedle);

  // 2. Detailed Cockpit Tub (ACES-II Ejection Seat + Holographic HUD Glass) + Tinted Bubble Canopy
  const cockpitTub = new THREE.Group();
  cockpitTub.position.set(0, 1.68, 2.15);
  fuselage.add(cockpitTub);

  const tubFloor = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 2.25), darkMetal);
  tubFloor.position.set(0, -0.08, 0);
  cockpitTub.add(tubFloor);

  // ACES-II Ejection Seat with twin parachute headbox & instrument glareshield
  const ejectionSeat = new THREE.Group();
  ejectionSeat.position.set(0, 0.08, -0.15);
  const seatPan = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.10, 0.44), darkMetal);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.64, 0.10), darkMetal);
  seatBack.position.set(0, 0.30, -0.18);
  seatBack.rotation.x = -0.22;
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.14), titaniumMat);
  headBox.position.set(0, 0.66, -0.26);
  ejectionSeat.add(seatPan, seatBack, headBox);
  cockpitTub.add(ejectionSeat);

  // Inclined Holographic HUD Combiner Glass
  const glareshield = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.18, 0.52), darkMetal);
  glareshield.position.set(0, 0.16, 0.68);
  cockpitTub.add(glareshield);

  const hudGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.22), hudMat);
  hudGlass.position.set(0, 0.34, 0.62);
  hudGlass.rotation.x = -0.48;
  cockpitTub.add(hudGlass);

  // Tinted Polycarbonate Teardrop Bubble Canopy + Arch Frame
  const canopyGeo = smoothCurved(new THREE.SphereGeometry(0.62, 24, 16));
  canopyGeo.scale(0.82, 0.66, 2.65);
  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.position.set(0, 1.92, 1.95);
  fuselage.add(canopyMesh);

  const canopyBow = new THREE.Mesh(smoothCurved(new THREE.TorusGeometry(0.49, 0.025, 10, 20, Math.PI)), darkMetal);
  canopyBow.position.set(0, 1.78, 2.38);
  canopyBow.rotation.x = -0.18;
  fuselage.add(canopyBow);

  // 3. Caret Supersonic Air Intakes with Splitter Plates & Compressor Fan Faces
  const intakes = [];
  for (const sx of [-1.18, 1.18]) {
    const intakeGroup = new THREE.Group();
    intakeGroup.position.set(sx, 1.18, 1.15);

    const duct = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.56, 3.65), airframeMat);
    duct.rotation.z = sx > 0 ? -0.18 : 0.18;
    intakeGroup.add(duct);

    // Boundary-layer splitter plate
    const splitterPlate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.58, 1.25), titaniumMat);
    splitterPlate.position.set(sx > 0 ? -0.32 : 0.32, 0, 1.48);
    intakeGroup.add(splitterPlate);

    // Dark recessed intake throat & turbine compressor face
    const fanFace = new THREE.Mesh(smoothCurved(new THREE.CircleGeometry(0.24, 16)), darkMetal);
    fanFace.position.set(0, 0, 1.83);
    intakeGroup.add(fanFace);

    fuselage.add(intakeGroup);
    intakes.push(intakeGroup);
  }

  // 4. Contoured Airfoil Wings with Aileron / Flap Seams & Navigation Strobes
  const wings = new THREE.Group();
  fuselage.add(wings);

  for (const sx of [-1, 1]) {
    const mainWing = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.11, 2.45), airframeMat);
    mainWing.position.set(sx * 3.15, 1.34, -0.65);
    mainWing.rotation.y = sx * -0.28;
    wings.add(mainWing);

    // Leading-edge root extension (LERX)
    const lerx = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 2.35), airframeMat);
    lerx.position.set(sx * 1.45, 1.38, 1.25);
    lerx.rotation.y = sx * -0.45;
    wings.add(lerx);

    // Trailing-edge flaperon & outboard aileron control seams
    const flapSeam = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.09, 0.42), titaniumMat);
    flapSeam.position.set(sx * 2.25, 1.32, -1.78);
    wings.add(flapSeam);

    const aileronSeam = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.36), titaniumMat);
    aileronSeam.position.set(sx * 4.05, 1.32, -2.12);
    wings.add(aileronSeam);

    // Wingtip missile rail + navigation strobe (red port / green starboard)
    const tipRail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, 1.85), titaniumMat);
    tipRail.position.set(sx * 5.22, 1.34, -1.45);
    wings.add(tipRail);

    const navLight = new THREE.Mesh(smoothCurved(new THREE.SphereGeometry(0.065, 10, 8)), sx < 0 ? navRedMat : navGreenMat);
    navLight.position.set(sx * 5.28, 1.36, -0.62);
    wings.add(navLight);
  }

  // 5. Twin Canted Vertical Stabilizers + All-Moving Horizontal Tailerons
  const verticalTails = [];
  for (const sx of [-0.95, 0.95]) {
    const vTail = new THREE.Group();
    vTail.position.set(sx, 2.18, -3.15);
    vTail.rotation.z = sx > 0 ? -0.32 : 0.32;

    const finBlade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.65, 1.55), airframeMat);
    finBlade.rotation.x = -0.26;
    vTail.add(finBlade);

    const rudderSeam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.34), titaniumMat);
    rudderSeam.position.set(0, -0.05, -0.68);
    rudderSeam.rotation.x = -0.26;
    vTail.add(rudderSeam);

    fuselage.add(vTail);
    verticalTails.push(vTail);

    // Horizontal all-moving taileron
    const taileron = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 1.25), airframeMat);
    taileron.position.set(sx * 2.15, 1.28, -3.55);
    taileron.rotation.y = Math.sign(sx) * -0.32;
    fuselage.add(taileron);
  }

  // 6. Under-Wing AIM-120 AMRAAM & AIM-9X Sidewinder Air-to-Air Missiles on Pylons
  const missiles = [];
  const buildMissile = (radius, length, isAmraam) => {
    const mGrp = new THREE.Group();
    const mBody = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(radius, radius, length, 14)), missileWhiteMat);
    mBody.rotation.x = Math.PI * 0.5;
    mGrp.add(mBody);
    const mNose = new THREE.Mesh(
      smoothCurved(new THREE.ConeGeometry(radius, radius * 3.8, 14)),
      isAmraam ? radomeMat : seekerMat
    );
    mNose.rotation.x = Math.PI * 0.5;
    mNose.position.z = length * 0.5 + radius * 1.9;
    mGrp.add(mNose);
    for (let f = 0; f < 4; f++) {
      const rotZ = f * Math.PI * 0.5 + Math.PI * 0.25;
      const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.012, radius * 3.6, 0.24), titaniumMat);
      tailFin.position.z = -length * 0.42;
      tailFin.rotation.z = rotZ;
      mGrp.add(tailFin);
      const midFin = new THREE.Mesh(new THREE.BoxGeometry(0.012, radius * 2.8, 0.18), titaniumMat);
      midFin.position.z = isAmraam ? 0.05 : length * 0.34;
      midFin.rotation.z = rotZ;
      mGrp.add(midFin);
    }
    return mGrp;
  };

  for (const sx of [-1, 1]) {
    // Inboard pylon + AIM-120C AMRAAM medium-range radar missile
    const inPylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 1.15), darkMetal);
    inPylon.position.set(sx * 2.35, 1.14, -0.55);
    wings.add(inPylon);
    const amraam = buildMissile(0.068, 1.85, true);
    amraam.position.set(sx * 2.35, 0.96, -0.45);
    wings.add(amraam);
    missiles.push(amraam);

    // Outboard pylon + AIM-9X Sidewinder infrared dogfight missile
    const outPylon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.95), darkMetal);
    outPylon.position.set(sx * 3.65, 1.15, -0.85);
    wings.add(outPylon);
    const sidewinder = buildMissile(0.054, 1.52, false);
    sidewinder.position.set(sx * 3.65, 0.98, -0.78);
    wings.add(sidewinder);
    missiles.push(sidewinder);
  }

  // 7. Multi-Petal Serrated Metallic Afterburner Exhaust Nozzles (or 4-Blade Propeller on Prop Variant)
  const nozzles = [];
  for (const sx of [-0.52, 0.52]) {
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(sx, 1.36, -4.05);

    const shroud = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.38, 0.42, 0.55, 20)), titaniumMat);
    shroud.rotation.x = Math.PI * 0.5;
    nozzleGroup.add(shroud);

    // 12 Radial Serrated Titanium Turkey-Feather Exhaust Petals
    for (let p = 0; p < 12; p++) {
      const ang = (p / 12) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.032, 0.44), darkMetal);
      petal.position.set(Math.cos(ang) * 0.34, Math.sin(ang) * 0.34, -0.35);
      petal.rotation.z = ang + Math.PI * 0.5;
      petal.rotation.x = -0.16;
      nozzleGroup.add(petal);
    }

    const coreDisc = new THREE.Mesh(smoothCurved(new THREE.CircleGeometry(0.29, 18)), burnerCoreMat);
    coreDisc.rotation.y = Math.PI;
    coreDisc.position.z = -0.52;
    nozzleGroup.add(coreDisc);

    fuselage.add(nozzleGroup);
    nozzles.push(nozzleGroup);
  }

  let propeller = null;
  if (isProp) {
    propeller = new THREE.Group();
    propeller.position.set(0, 1.32, 7.55);
    const spinner = new THREE.Mesh(smoothCurved(new THREE.ConeGeometry(0.24, 0.52, 18)), titaniumMat);
    spinner.rotation.x = Math.PI * 0.5;
    propeller.add(spinner);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.65, 0.025), darkMetal);
      blade.rotation.z = (b * Math.PI) * 0.5;
      propeller.add(blade);
    }
    fuselage.add(propeller);
  }

  // 8. Tricycle Landing Gear with 24-Segment Tires & Brake Discs
  const wheels = [];
  const frontSteerPivots = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.84, metalness: 0.12 });
  for (const [wx, wz, r, isFront] of [
    [0, 3.65, 0.26, true],
    [-1.45, -0.85, 0.34, false],
    [1.45, -0.85, 0.34, false],
  ]) {
    const strut = new THREE.Mesh(smoothCurved(new THREE.CylinderGeometry(0.045, 0.045, 0.88, 12)), titaniumMat);
    strut.position.set(wx, 0.68, wz);
    fuselage.add(strut);
    const { pivot, wheelMesh } = buildWheelAssembly(r, 0.18, tireMat, titaniumMat, 0xe6192e);
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
  for (const sx of [-5.22, 5.22]) {
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
