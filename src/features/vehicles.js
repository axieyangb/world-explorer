import * as THREE from '../../vendor/three.module.js';

const HEAD_HEX = 0xfff3c4;
const TAIL_HEX = 0xff2a2a;

export const TESLA_PAINTS = [
  0xf4f6f9, // Pearl White Multi-Coat
  0x4a525d, // Midnight Silver Metallic
  0xc8102e, // Ultra Red
  0x1b3b73, // Deep Blue Metallic
].map((h) => new THREE.Color(h));

export const TOW_TRUCK_PAINTS = [
  0xf59f00, // Industrial Amber-Gold
  0xd90429, // Heavy Wrecker Crimson
  0x1d4e89, // Utility Cobalt Blue
  0xe85d04, // Safety Orange
].map((h) => new THREE.Color(h));

export const NEW_VEHICLE_SPECS = [
  {
    id: 'tesla',
    name: 'Tesla Model S',
    massKg: 2100,
    height: 1.44,
    maxSpeed: 68.0,      // ~245 km/h -> 404 km/h on Nitro (instant electric torque)
    nitroMult: 1.65,
    accel: 54.0,
    brake: 64.0,
    steerLow: 0.56,
    steerHigh: 0.14,
    length: 4.97,
    width: 1.96,
  },
  {
    id: 'cybertruck',
    name: 'Tesla Cybertruck',
    massKg: 3100,
    height: 1.79,
    maxSpeed: 62.0,      // ~223 km/h -> 357 km/h on Nitro
    nitroMult: 1.60,
    accel: 46.0,
    brake: 58.0,
    steerLow: 0.52,
    steerHigh: 0.13,
    length: 5.68,
    width: 2.20,
  },
  {
    id: 'ambulance',
    name: 'Ambulance',
    massKg: 4500,
    height: 2.70,
    maxSpeed: 52.0,      // ~187 km/h emergency response speed
    nitroMult: 1.55,
    accel: 30.0,
    brake: 48.0,
    steerLow: 0.50,
    steerHigh: 0.13,
    length: 6.10,
    width: 2.26,
    hasSiren: true,
  },
  {
    id: 'tow_truck',
    name: 'Tow Truck',
    massKg: 6200,
    height: 2.80,
    maxSpeed: 46.0,      // ~166 km/h heavy recovery truck
    nitroMult: 1.55,
    accel: 26.0,
    brake: 45.0,
    steerLow: 0.48,
    steerHigh: 0.13,
    length: 6.40,
    width: 2.32,
    hasSiren: true,
  },
];

const FLEET_IDS = new Set(NEW_VEHICLE_SPECS.map((s) => s.id));

export function isCustomFleetVehicle(typeId) {
  return FLEET_IDS.has(typeId);
}

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
  group.add(new THREE.Mesh(outerGeo, outerMat));

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
  group.add(new THREE.Mesh(innerGeo, innerMat));
  return group;
}

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

function buildDetailedWheel(radius, width, tireMat, rimMat, style = 'standard') {
  const pivot = new THREE.Group();
  const wheelMesh = new THREE.Group();

  const segs = style === 'cyber' ? 8 : 16;
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, segs);
  tireGeo.rotateZ(Math.PI * 0.5);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  wheelMesh.add(tire);

  const rimGeo = new THREE.CylinderGeometry(radius * 0.64, radius * 0.64, width + 0.02, style === 'cyber' ? 8 : 12);
  rimGeo.rotateZ(Math.PI * 0.5);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  wheelMesh.add(rim);

  if (style === 'turbine') {
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.2, metalness: 0.9 });
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, radius * 1.12, 0.045), hubMat);
      spoke.rotation.x = (s * Math.PI) / 5;
      wheelMesh.add(spoke);
    }
  } else if (style === 'cyber') {
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1e222a, roughness: 0.45, metalness: 0.65 });
    const capGeo = new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, width + 0.035, 8);
    capGeo.rotateZ(Math.PI * 0.5);
    wheelMesh.add(new THREE.Mesh(capGeo, capMat));
  }

  pivot.add(wheelMesh);
  return { pivot, wheelMesh };
}

function tagStrobe(mesh, phaseCode) {
  mesh.userData = { ...(mesh.userData || {}), emitCode: phaseCode };
  return mesh;
}

/**
 * Builds high-detail procedural 3D meshes for tesla, cybertruck, ambulance, and tow_truck.
 * Local forward is +Z, right is +X, up is +Y, tire contact at Y = 0.
 */
export function buildFleetVehicleModel(typeId, options = {}) {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.50, metalness: 0.68 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.92 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.82, metalness: 0.15 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.25, metalness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c1928, roughness: 0.08, metalness: 0.92 });
  const headLightMat = new THREE.MeshBasicMaterial({ color: HEAD_HEX });
  const tailLightMat = new THREE.MeshBasicMaterial({ color: TAIL_HEX });

  const wheels = [];
  const frontSteerPivots = [];
  const paintMeshes = [];
  const lightbarParts = {
    phaseAMeshes: [],
    phaseBMeshes: [],
    pointLight: null,
    towHookPivot: null,
    typeId,
  };

  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  chassis.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [], aeroFlaps: [] };

  if (typeId === 'tesla') {
    // =========================================================================
    // 1. TESLA MODEL S PLAID — Aerodynamic Fastback, Panoramic Glass Roof,
    //    Flush Door Handles, Turbine Wheels, Full-Width Cyan-White LED Bar
    // =========================================================================
    const paintHex = options.paintColor != null ? options.paintColor : 0xf4f6f9;
    const bodyMat = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.18, metalness: 0.58 });
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.35, metalness: 0.55 });
    const panoGlassMat = new THREE.MeshStandardMaterial({ color: 0x09131f, roughness: 0.05, metalness: 0.95 });
    const drlCyanMat = new THREE.MeshBasicMaterial({ color: 0xd8f8ff });
    const turbineRimMat = new THREE.MeshStandardMaterial({ color: 0x262b34, roughness: 0.30, metalness: 0.80 });

    // Skateboard battery floor & carbon aero side skirts
    const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.15, 4.78), carbonMat);
    floorPan.position.set(0, 0.23, 0);
    chassis.add(floorPan);

    // Main sculpted lower fastback body
    const mainHull = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.42, 4.82), bodyMat);
    mainHull.position.set(0, 0.48, 0);
    chassis.add(mainHull);
    paintMeshes.push(mainHull);

    // Sculpted wide rear haunches & shoulder beltline
    const beltHull = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.24, 3.65), bodyMat);
    beltHull.position.set(0, 0.74, -0.32);
    chassis.add(beltHull);
    paintMeshes.push(beltHull);

    // Low-drag sloping front frunk hood
    const frunkHood = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.20, 1.48), bodyMat);
    frunkHood.position.set(0, 0.66, 1.62);
    frunkHood.rotation.x = 0.13;
    chassis.add(frunkHood);
    paintMeshes.push(frunkHood);

    // Front aero fascia & lower splitter
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.10, 0.28), carbonMat);
    frontSplitter.position.set(0, 0.22, 2.38);
    chassis.add(frontSplitter);

    // Continuous Tinted Panoramic Glass Roof (windshield -> roof dome -> fastback hatch)
    const cabinCore = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.42, 2.55), panoGlassMat);
    cabinCore.position.set(0, 1.00, -0.22);
    chassis.add(cabinCore);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.07, 1.24), panoGlassMat);
    windshield.position.set(0, 1.02, 0.76);
    windshield.rotation.x = 0.44;
    chassis.add(windshield);

    const panoRoof = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.07, 1.42), panoGlassMat);
    panoRoof.position.set(0, 1.23, -0.22);
    chassis.add(panoRoof);

    const fastbackGlass = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.07, 1.38), panoGlassMat);
    fastbackGlass.position.set(0, 1.04, -1.36);
    fastbackGlass.rotation.x = -0.32;
    chassis.add(fastbackGlass);

    // Painted cant-rail roof arches on left and right of panoramic glass
    for (const sx of [-0.79, 0.79]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 2.35), bodyMat);
      rail.position.set(sx, 1.19, -0.24);
      chassis.add(rail);
      paintMeshes.push(rail);

      // Aerodynamic side mirrors
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.22), bodyMat);
      mirror.position.set(sx * 1.28, 0.88, 0.72);
      chassis.add(mirror);
      paintMeshes.push(mirror);

      // Flush Pop-Out Door Handles (Front & Rear doors)
      for (const dz of [0.32, -0.58]) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.22), carbonMat);
        handle.position.set(sx > 0 ? 0.975 : -0.975, 0.74, dz);
        chassis.add(handle);
      }
    }

    // Full-width futuristic cyan-white LED front lightbar + matrix headlights
    const frontLedBar = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.055, 0.08), headLightMat);
    frontLedBar.position.set(0, 0.58, 2.43);
    chassis.add(frontLedBar);

    const frontCyanAccent = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.035, 0.09), drlCyanMat);
    frontCyanAccent.position.set(0, 0.62, 2.42);
    chassis.add(frontCyanAccent);

    // Full-width crimson rear LED lightbar + Plaid carbon ducktail spoiler + rear diffuser
    const rearLedBar = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.075, 0.08), tailLightMat);
    rearLedBar.position.set(0, 0.74, -2.42);
    chassis.add(rearLedBar);

    const ducktailSpoiler = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.055, 0.18), carbonMat);
    ducktailSpoiler.position.set(0, 0.87, -2.36);
    ducktailSpoiler.rotation.x = 0.24;
    chassis.add(ducktailSpoiler);

    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.18, 0.18), carbonMat);
    rearDiffuser.position.set(0, 0.28, -2.40);
    chassis.add(rearDiffuser);

    // 4 Aero Turbine Wheels
    const wheelCoords = [
      [-0.92, 1.54, true],
      [0.92, 1.54, true],
      [-0.92, -1.52, false],
      [0.92, -1.52, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildDetailedWheel(0.37, 0.27, tireMat, turbineRimMat, 'turbine');
      pivot.position.set(wx, 0.37, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // Plaid Electric Plasma Nitro VFX
    for (const sx of [-0.52, 0.52]) {
      const plume = createThrusterFlameCone(0.24, 3.8, 0xffffff, 0x00f5ff);
      plume.position.set(sx, 0.36, -2.48);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);

      const trail = createSpeedTrailRibbon(0.16, 10.5, 0x00f5ff, 0.76);
      trail.position.set(sx, 0.74, -2.45);
      nitroVfx.add(trail);
      vfxParts.trails.push(trail);
    }
  } else if (typeId === 'cybertruck') {
    // =========================================================================
    // 2. TESLA CYBERTRUCK — Brushed Stainless-Steel Exoskeleton Wedge,
    //    Flat Sloped Windshield, Front Laser Strip, Vault Bed, Off-Road Tires
    // =========================================================================
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xc4ccd4,
      roughness: 0.24,
      metalness: 0.84,
    });
    const armorBlackMat = new THREE.MeshStandardMaterial({
      color: 0x161920,
      roughness: 0.62,
      metalness: 0.35,
    });
    const vaultMat = new THREE.MeshStandardMaterial({
      color: 0x222730,
      roughness: 0.48,
      metalness: 0.52,
    });
    const armorGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0b1520,
      roughness: 0.08,
      metalness: 0.92,
    });
    const laserFrontMat = new THREE.MeshBasicMaterial({ color: 0xe6fbff });

    // Rugged matte-black lower chassis rock slider & skidplate
    const underFrame = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.28, 5.42), armorBlackMat);
    underFrame.position.set(0, 0.42, 0);
    chassis.add(underFrame);

    // Main angular stainless-steel exoskeleton lower slab
    const lowerExoskeleton = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.54, 5.58), steelMat);
    lowerExoskeleton.position.set(0, 0.80, 0);
    chassis.add(lowerExoskeleton);

    // Front planar sloped frunk hood + continuous Armor Glass windshield up to apex (z = 0.18, y = 1.82)
    const frunkPlane = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.12, 1.38), steelMat);
    frunkPlane.position.set(0, 1.15, 2.12);
    frunkPlane.rotation.x = 0.32;
    chassis.add(frunkPlane);

    const armorWindshield = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.09, 1.62), armorGlassMat);
    armorWindshield.position.set(0, 1.54, 0.86);
    armorWindshield.rotation.x = 0.32;
    chassis.add(armorWindshield);

    // Stainless A-pillar wedge rails flanking the windshield
    for (const sx of [-1.01, 1.01]) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.64), steelMat);
      aPillar.position.set(sx, 1.54, 0.86);
      aPillar.rotation.x = 0.32;
      chassis.add(aPillar);
    }

    // Triangular wedge cabin core + angular side windows
    const cabinWedge = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.56, 2.35), armorGlassMat);
    cabinWedge.position.set(0, 1.32, -0.05);
    chassis.add(cabinWedge);

    // Apex roof ridge cap
    const apexRidge = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.10, 0.46), steelMat);
    apexRidge.position.set(0, 1.78, 0.12);
    chassis.add(apexRidge);

    // Sloping rear Vault Tonneau cover + stainless sail panels from apex (z = 0.18) to tailgate (z = -2.78)
    const vaultCover = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.10, 3.04), vaultMat);
    vaultCover.position.set(0, 1.44, -1.30);
    vaultCover.rotation.x = -0.22;
    chassis.add(vaultCover);

    for (const sx of [-1.01, 1.01]) {
      const sailPanel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 3.06), steelMat);
      sailPanel.position.set(sx, 1.42, -1.30);
      sailPanel.rotation.x = -0.22;
      chassis.add(sailPanel);
    }

    // Sharp vertical stainless tailgate + heavy rear bumper
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.62, 0.12), steelMat);
    tailgate.position.set(0, 0.88, -2.76);
    chassis.add(tailgate);

    const fBumper = new THREE.Mesh(new THREE.BoxGeometry(2.20, 0.26, 0.24), armorBlackMat);
    fBumper.position.set(0, 0.44, 2.78);
    chassis.add(fBumper);

    const rBumper = new THREE.Mesh(new THREE.BoxGeometry(2.20, 0.26, 0.24), armorBlackMat);
    rBumper.position.set(0, 0.44, -2.80);
    chassis.add(rBumper);

    // Full-width front laser LED headlight strip + crimson rear lightbar
    const frontLaser = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.065, 0.09), headLightMat);
    frontLaser.position.set(0, 1.02, 2.80);
    chassis.add(frontLaser);

    const frontLaserCore = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.035, 0.10), laserFrontMat);
    frontLaserCore.position.set(0, 1.05, 2.80);
    chassis.add(frontLaserCore);

    const rearLaser = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.08, 0.09), tailLightMat);
    rearLaser.position.set(0, 1.12, -2.82);
    chassis.add(rearLaser);

    // Geometric trapezoidal off-road fender flares + 4 chunky off-road Cyber wheels
    const wheelCoords = [
      [-1.04, 1.82, true],
      [1.04, 1.82, true],
      [-1.04, -1.78, false],
      [1.04, -1.78, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const flare = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.46, 1.12), armorBlackMat);
      flare.position.set(wx > 0 ? 1.06 : -1.06, 0.72, wz);
      chassis.add(flare);

      const { pivot, wheelMesh } = buildDetailedWheel(0.46, 0.34, tireMat, armorBlackMat, 'cyber');
      pivot.position.set(wx, 0.46, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // Cyberbeast Nitro VFX
    for (const sx of [-0.62, 0.62]) {
      const plume = createThrusterFlameCone(0.28, 4.2, 0xffffff, 0x00f5ff);
      plume.position.set(sx, 0.48, -2.88);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);

      const trail = createSpeedTrailRibbon(0.18, 11.0, 0xff2a2a, 0.78);
      trail.position.set(sx, 1.12, -2.85);
      nitroVfx.add(trail);
      vfxParts.trails.push(trail);
    }
  } else if (typeId === 'ambulance') {
    // =========================================================================
    // 3. EMERGENCY AMBULANCE — Cab-Forward Van + Tall Paramedic Box Module,
    //    Bold Red Stripe, Medical Cross / Star of Life Emblems, Twin Rear Doors,
    //    Roof-Mounted Flashing Red/White LED Emergency Lightbar + Side Strobes
    // =========================================================================
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.30, metalness: 0.22 });
    const redEmergencyMat = new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.32, metalness: 0.28 });
    const goldReflectMat = new THREE.MeshBasicMaterial({ color: 0xffbe0b });
    const starBlueMat = new THREE.MeshStandardMaterial({ color: 0x0077b6, roughness: 0.30, metalness: 0.35 });
    const strobeRedAMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });
    const strobeRedBMat = new THREE.MeshBasicMaterial({ color: 0xff2233 });
    const strobeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // 1. Cab-Forward Emergency Van Chassis (z = +0.92 to +3.00)
    const cabLower = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.42, 1.98), redEmergencyMat);
    cabLower.position.set(0, 0.56, 1.92);
    chassis.add(cabLower);

    const cabUpper = new THREE.Mesh(new THREE.BoxGeometry(2.04, 1.18, 1.86), whiteMat);
    cabUpper.position.set(0, 1.32, 1.86);
    chassis.add(cabUpper);

    const cabHood = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.44, 0.86), whiteMat);
    cabHood.position.set(0, 0.92, 2.52);
    cabHood.rotation.x = 0.22;
    chassis.add(cabHood);

    const cabWindshield = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.72, 0.10), glassMat);
    cabWindshield.position.set(0, 1.48, 2.26);
    cabWindshield.rotation.x = 0.36;
    chassis.add(cabWindshield);

    const cabSideWin = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.58, 1.02), glassMat);
    cabSideWin.position.set(0, 1.48, 1.65);
    chassis.add(cabSideWin);

    // Front push bumper, radiator grille & emergency grille strobes
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.32, 0.24), darkMetal);
    frontBumper.position.set(0, 0.42, 2.98);
    chassis.add(frontBumper);

    const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.36, 0.08), darkMetal);
    frontGrille.position.set(0, 0.76, 2.96);
    chassis.add(frontGrille);

    for (const sx of [-0.76, 0.76]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.20, 0.08), headLightMat);
      hl.position.set(sx, 0.78, 2.97);
      chassis.add(hl);
    }
    for (const [sx, isA] of [[-0.36, true], [0.36, false]]) {
      const gStrobe = tagStrobe(
        new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.09), isA ? strobeRedAMat : strobeWhiteMat),
        isA ? 4 : 5
      );
      gStrobe.position.set(sx, 0.76, 2.98);
      chassis.add(gStrobe);
      (isA ? lightbarParts.phaseAMeshes : lightbarParts.phaseBMeshes).push(gStrobe);
    }

    // 2. Tall White/Red Paramedic Box Module Behind Cab (z = -3.02 to +0.94)
    const boxBody = new THREE.Mesh(new THREE.BoxGeometry(2.26, 2.12, 3.96), whiteMat);
    boxBody.position.set(0, 1.44, -1.04);
    chassis.add(boxBody);

    // Bold Red Emergency Waist Stripe + Reflective Gold Pinstripe + Upper Red Roof Band
    const redWaistBand = new THREE.Mesh(new THREE.BoxGeometry(2.29, 0.46, 3.98), redEmergencyMat);
    redWaistBand.position.set(0, 0.86, -1.04);
    chassis.add(redWaistBand);

    const goldStripe = new THREE.Mesh(new THREE.BoxGeometry(2.30, 0.07, 4.00), goldReflectMat);
    goldStripe.position.set(0, 1.12, -1.04);
    chassis.add(goldStripe);

    const upperRedBand = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.18, 3.98), redEmergencyMat);
    upperRedBand.position.set(0, 2.38, -1.04);
    chassis.add(upperRedBand);

    // 3. Medical Cross & Star of Life Emblems on Both Sides (x = +-1.145)
    for (const sx of [-1.145, 1.145]) {
      const badgeBacking = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.82, 0.82), whiteMat);
      badgeBacking.position.set(sx, 1.68, -0.88);
      chassis.add(badgeBacking);

      // Red Medical Cross vertical & horizontal bars
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.66, 0.22), redEmergencyMat);
      crossV.position.set(sx, 1.68, -0.88);
      chassis.add(crossV);

      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.66), redEmergencyMat);
      crossH.position.set(sx, 1.68, -0.88);
      chassis.add(crossH);

      // Star of Life diagonal blue cross-bars
      for (const ang of [Math.PI / 4, -Math.PI / 4]) {
        const starBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.58, 0.14), starBlueMat);
        starBar.position.set(sx, 1.68, -0.88);
        starBar.rotation.x = ang;
        chassis.add(starBar);
      }

      // Side paramedic window on forward right/left of box
      const sideBoxWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.52, 0.86), glassMat);
      sideBoxWin.position.set(sx, 1.72, 0.22);
      chassis.add(sideBoxWin);

      // Side Upper Emergency Strobe Lights (Front & Rear of Box)
      for (const [sz, isA] of [[0.45, sx < 0], [-2.45, sx > 0]]) {
        const sLight = tagStrobe(
          new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.28), isA ? strobeRedAMat : strobeWhiteMat),
          isA ? 4 : 5
        );
        sLight.position.set(sx, 2.38, sz);
        chassis.add(sLight);
        (isA ? lightbarParts.phaseAMeshes : lightbarParts.phaseBMeshes).push(sLight);
      }
    }

    // 4. Twin Rear Paramedic Doors with Windows & Rear Medical Crosses (z = -3.03)
    const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.98, 0.04), darkMetal);
    doorSeam.position.set(0, 1.44, -3.03);
    chassis.add(doorSeam);

    for (const sx of [-0.54, 0.54]) {
      const rearWin = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.56, 0.04), glassMat);
      rearWin.position.set(sx, 1.84, -3.03);
      chassis.add(rearWin);

      // Rear door medical cross emblem
      const rCrossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.04), whiteMat);
      rCrossV.position.set(sx, 1.28, -3.03);
      chassis.add(rCrossV);
      const rCrossH = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.04), whiteMat);
      rCrossH.position.set(sx, 1.28, -3.03);
      chassis.add(rCrossH);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.08), tailLightMat);
      tl.position.set(sx * 1.45, 0.66, -3.03);
      chassis.add(tl);
    }

    const rearStepBumper = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.22, 0.26), darkMetal);
    rearStepBumper.position.set(0, 0.38, -3.10);
    chassis.add(rearStepBumper);

    // 5. Roof-Mounted Flashing Red/White LED Emergency Lightbar (Front Box Brow & Rear Roof Beacons)
    const barMount = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.10, 0.36), darkMetal);
    barMount.position.set(0, 2.54, 0.72);
    chassis.add(barMount);

    const leftRedPod = tagStrobe(
      new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.20, 0.30), strobeRedAMat),
      4
    );
    leftRedPod.position.set(-0.58, 2.64, 0.72);
    chassis.add(leftRedPod);
    lightbarParts.phaseAMeshes.push(leftRedPod);

    const centerWhitePod = tagStrobe(
      new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.20, 0.30), strobeWhiteMat),
      5
    );
    centerWhitePod.position.set(0, 2.64, 0.72);
    chassis.add(centerWhitePod);
    lightbarParts.phaseBMeshes.push(centerWhitePod);

    const rightRedPod = tagStrobe(
      new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.20, 0.30), strobeRedBMat),
      5
    );
    rightRedPod.position.set(0.58, 2.64, 0.72);
    chassis.add(rightRedPod);
    lightbarParts.phaseBMeshes.push(rightRedPod);

    // Rear Roof Emergency Beacons
    for (const [sx, isA] of [[-0.84, false], [0.84, true]]) {
      const rBeacon = tagStrobe(
        new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), isA ? strobeRedAMat : strobeWhiteMat),
        isA ? 4 : 5
      );
      rBeacon.position.set(sx, 2.58, -2.86);
      chassis.add(rBeacon);
      (isA ? lightbarParts.phaseAMeshes : lightbarParts.phaseBMeshes).push(rBeacon);
    }

    // Dynamic Emergency Roof PointLight for Player Ambulance
    const emergLight = new THREE.PointLight(0xff1e2e, 0.0, 26, 1.5);
    emergLight.position.set(0, 3.05, 0.2);
    chassis.add(emergLight);
    lightbarParts.pointLight = emergLight;

    // 4 Heavy-Duty Ambulance Wheels
    const wheelCoords = [
      [-1.02, 1.98, true],
      [1.02, 1.98, true],
      [-1.04, -1.78, false],
      [1.04, -1.78, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildDetailedWheel(0.42, 0.30, tireMat, rimMat, 'standard');
      pivot.position.set(wx, 0.42, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // Emergency Overdrive Nitro VFX
    for (const sx of [-0.72, 0.72]) {
      const plume = createThrusterFlameCone(0.28, 4.2, 0xffffff, 0xff1e2e);
      plume.position.set(sx, 0.42, -3.15);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);

      const trail = createSpeedTrailRibbon(0.18, 10.5, 0xff1e2e, 0.76);
      trail.position.set(sx, 2.58, -3.05);
      nitroVfx.add(trail);
      vfxParts.trails.push(trail);
    }
  } else if (typeId === 'tow_truck') {
    // =========================================================================
    // 4. HEAVY TOW TRUCK — Rugged Utility Cab + Flatbed/Wrecker Rear Deck,
    //    Diagonal Black/Yellow Hazard Stripes, Angled Steel Recovery Boom Crane
    //    + Winch Cable & Tow Hook, Rear Wheel-Lift Cradle, Amber Lightbar
    // =========================================================================
    const paintHex = options.paintColor != null ? options.paintColor : 0xf59f00;
    const cabMat = new THREE.MeshStandardMaterial({ color: paintHex, roughness: 0.28, metalness: 0.42 });
    const bedSteelMat = new THREE.MeshStandardMaterial({ color: 0x222730, roughness: 0.55, metalness: 0.62 });
    const boomRedMat = new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.35, metalness: 0.52 });
    const hazardYellowMat = new THREE.MeshStandardMaterial({ color: 0xffd100, roughness: 0.35, metalness: 0.25 });
    const hazardBlackMat = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.65, metalness: 0.25 });
    const amberStrobeAMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const amberStrobeBMat = new THREE.MeshBasicMaterial({ color: 0xffe042 });

    // 1. Heavy-Duty Utility Cab (+0.45 to +3.12)
    const chassisRails = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.28, 6.18), darkMetal);
    chassisRails.position.set(0, 0.44, -0.02);
    chassis.add(chassisRails);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.88, 1.36), cabMat);
    hood.position.set(0, 0.94, 2.38);
    chassis.add(hood);
    paintMeshes.push(hood);

    // Massive Chrome Radiator Grille + Bull-Bar Front Bumper
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.72, 0.10), chromeMat);
    grille.position.set(0, 0.94, 3.06);
    chassis.add(grille);

    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.36, 0.28), darkMetal);
    bullBar.position.set(0, 0.46, 3.12);
    chassis.add(bullBar);

    for (const sx of [-0.62, 0.62]) {
      const pushPost = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.68, 0.12), darkMetal);
      pushPost.position.set(sx, 0.74, 3.20);
      chassis.add(pushPost);

      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.08), headLightMat);
      hl.position.set(sx * 1.24, 0.84, 3.07);
      chassis.add(hl);
    }

    // Crew Cabin + Windshield + Dual Chrome Exhaust Stacks
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.10, 1.32, 1.40), cabMat);
    cabin.position.set(0, 1.44, 1.04);
    chassis.add(cabin);
    paintMeshes.push(cabin);

    const cabWindshield = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.62, 0.10), glassMat);
    cabWindshield.position.set(0, 1.66, 1.72);
    cabWindshield.rotation.x = 0.18;
    chassis.add(cabWindshield);

    const cabSideWin = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.56, 0.96), glassMat);
    cabSideWin.position.set(0, 1.64, 1.04);
    chassis.add(cabSideWin);

    const exhaustGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.95, 10);
    for (const sx of [-1.04, 1.04]) {
      const stack = new THREE.Mesh(exhaustGeo, chromeMat);
      stack.position.set(sx, 1.54, 0.24);
      chassis.add(stack);

      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.10), chromeMat);
      mirror.position.set(sx * 1.12, 1.62, 1.48);
      chassis.add(mirror);
    }

    // 2. Wrecker Flatbed Rear Deck + Side Toolboxes (-3.08 to +0.28)
    const wreckerBed = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.36, 3.38), bedSteelMat);
    wreckerBed.position.set(0, 0.68, -1.40);
    chassis.add(wreckerBed);

    for (const sx of [-1.06, 1.06]) {
      const bedRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 3.34), cabMat);
      bedRail.position.set(sx, 0.98, -1.40);
      chassis.add(bedRail);
      paintMeshes.push(bedRail);

      // Side Steel Utility Toolboxes with Chrome Latches
      const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.44, 1.45), darkMetal);
      toolbox.position.set(sx * 1.02, 0.56, -0.58);
      chassis.add(toolbox);

      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 0.32), chromeMat);
      latch.position.set(sx * 1.02, 0.60, -0.58);
      chassis.add(latch);
    }

    // 3. Diagonal Black/Yellow Hazard Chevron Stripes along Rear Tailboard & Side Skirts
    const numStripes = 9;
    const stripeW = 2.24 / numStripes;
    for (let i = 0; i < numStripes; i++) {
      const isYellow = i % 2 === 0;
      const sMesh = new THREE.Mesh(
        new THREE.BoxGeometry(stripeW * 0.96, 0.30, 0.08),
        isYellow ? hazardYellowMat : hazardBlackMat
      );
      sMesh.position.set(-1.12 + (i + 0.5) * stripeW, 0.66, -3.09);
      chassis.add(sMesh);
    }
    for (const sx of [-1.15, 1.15]) {
      for (let k = 0; k < 4; k++) {
        const sSide = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.24, 0.28),
          k % 2 === 0 ? hazardYellowMat : hazardBlackMat
        );
        sSide.position.set(sx, 0.68, -2.05 - k * 0.28);
        chassis.add(sSide);
      }
    }

    // 4. Heavy Steel Angled Recovery Boom Crane + Hydraulic Cylinders + Winch Cable & Tow Hook
    const winchTurret = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.52, 0.78), darkMetal);
    winchTurret.position.set(0, 1.06, -0.32);
    chassis.add(winchTurret);

    // Dual hydraulic lift rams supporting the crane boom
    const ramGeo = new THREE.CylinderGeometry(0.075, 0.085, 1.42, 10);
    for (const sx of [-0.26, 0.26]) {
      const ram = new THREE.Mesh(ramGeo, chromeMat);
      ram.position.set(sx, 1.32, -1.18);
      ram.rotation.x = -0.62;
      chassis.add(ram);
    }

    // Main Angled Steel Recovery Boom extending up and back at ~30 deg
    const boomGroup = new THREE.Group();
    boomGroup.position.set(0, 1.15, -0.35);
    boomGroup.rotation.x = 0.50; // tilts +Y as it goes toward -Z
    chassis.add(boomGroup);

    const outerBoom = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 2.35), boomRedMat);
    outerBoom.position.set(0, 0, -1.12);
    boomGroup.add(outerBoom);

    const innerStinger = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.20, 1.35), darkMetal);
    innerStinger.position.set(0, 0, -2.25);
    boomGroup.add(innerStinger);

    const boomHead = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.22, 0.26), hazardYellowMat);
    boomHead.position.set(0, 0.04, -2.86);
    boomGroup.add(boomHead);

    // Boom-tip Amber Caution Beacons
    for (const [sx, isA] of [[-0.32, true], [0.32, false]]) {
      const tipStrobe = tagStrobe(
        new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), isA ? amberStrobeAMat : amberStrobeBMat),
        isA ? 4 : 5
      );
      tipStrobe.position.set(sx, 0.18, -2.86);
      boomGroup.add(tipStrobe);
      (isA ? lightbarParts.phaseAMeshes : lightbarParts.phaseBMeshes).push(tipStrobe);
    }

    // Dangling Steel Winch Cable + Heavy Yellow/Steel Tow Hook (pivoted at boom tip in world-upright space)
    const hookPivot = new THREE.Group();
    hookPivot.position.set(0, 2.48, -2.86);
    chassis.add(hookPivot);
    lightbarParts.towHookPivot = hookPivot;

    const cableGeo = new THREE.CylinderGeometry(0.024, 0.024, 1.18, 8);
    const cableMesh = new THREE.Mesh(cableGeo, darkMetal);
    cableMesh.position.set(0, -0.59, 0);
    hookPivot.add(cableMesh);

    const pulleyBlock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.16), hazardYellowMat);
    pulleyBlock.position.set(0, -1.18, 0);
    hookPivot.add(pulleyBlock);

    const hookShank = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), chromeMat);
    hookShank.position.set(0, -1.36, 0);
    hookPivot.add(hookShank);

    const hookBottom = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.22), chromeMat);
    hookBottom.position.set(0, -1.46, -0.06);
    hookPivot.add(hookBottom);

    const hookTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.07), chromeMat);
    hookTip.position.set(0, -1.41, -0.14);
    hookPivot.add(hookTip);

    // 5. Rear Hydraulic Wheel-Lift Cradle (Under-Lift Stinger & Crossbar)
    const underLiftBeam = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.86), darkMetal);
    underLiftBeam.position.set(0, 0.34, -3.32);
    chassis.add(underLiftBeam);

    const wheelCradleBar = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.14, 0.22), hazardYellowMat);
    wheelCradleBar.position.set(0, 0.34, -3.68);
    chassis.add(wheelCradleBar);

    for (const sx of [-0.78, 0.78]) {
      const cradleArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.48), darkMetal);
      cradleArm.position.set(sx, 0.34, -3.86);
      chassis.add(cradleArm);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.08), tailLightMat);
      tl.position.set(sx, 0.48, -3.10);
      chassis.add(tl);
    }

    // 6. Roof-Mounted Flashing Amber Caution Lightbar
    const lightbarBase = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.10, 0.34), darkMetal);
    lightbarBase.position.set(0, 2.15, 1.04);
    chassis.add(lightbarBase);

    const amberLeft = tagStrobe(
      new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.28), amberStrobeAMat),
      4
    );
    amberLeft.position.set(-0.54, 2.25, 1.04);
    chassis.add(amberLeft);
    lightbarParts.phaseAMeshes.push(amberLeft);

    const amberCenter = tagStrobe(
      new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.28), amberStrobeBMat),
      5
    );
    amberCenter.position.set(0, 2.25, 1.04);
    chassis.add(amberCenter);
    lightbarParts.phaseBMeshes.push(amberCenter);

    const amberRight = tagStrobe(
      new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.28), amberStrobeBMat),
      5
    );
    amberRight.position.set(0.54, 2.25, 1.04);
    chassis.add(amberRight);
    lightbarParts.phaseBMeshes.push(amberRight);

    const amberLight = new THREE.PointLight(0xffaa00, 0.0, 24, 1.5);
    amberLight.position.set(0, 2.75, 0.8);
    chassis.add(amberLight);
    lightbarParts.pointLight = amberLight;

    // 4 Heavy-Duty Wrecker Wheels
    const wheelCoords = [
      [-1.06, 2.16, true],
      [1.06, 2.16, true],
      [-1.08, -1.86, false],
      [1.08, -1.86, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildDetailedWheel(0.44, 0.32, tireMat, rimMat, 'standard');
      pivot.position.set(wx, 0.44, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // Heavy Wrecker Nitro VFX
    for (const sx of [-0.72, 0.72]) {
      const plume = createThrusterFlameCone(0.30, 4.4, 0xfff3b0, 0xff8800);
      plume.position.set(sx, 0.48, -3.20);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);

      const trail = createSpeedTrailRibbon(0.20, 10.0, 0xffaa00, 0.75);
      trail.position.set(sx, 2.25, -3.05);
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
    typeId,
    chassis,
    wheels,
    frontSteerPivots,
    nitroVfx,
    vfxParts,
    lightbarParts,
    paintMeshes,
    sirenActive: false,
  };
  return group;
}

/**
 * Applies a custom body paint color (hex number or THREE.Color) to a vehicle THREE.Group.
 */
export function applyVehiclePaint(vehicleGroup, colorInput) {
  if (!vehicleGroup || !vehicleGroup.userData || !colorInput) return;
  const col = colorInput instanceof THREE.Color ? colorInput : new THREE.Color(colorInput);
  const meshes = vehicleGroup.userData.paintMeshes || [];
  for (const m of meshes) {
    if (m.material && m.material.color) {
      m.material.color.copy(col);
    }
  }
  vehicleGroup.userData.customPaint = col.clone();
}

/**
 * Animates emergency lightbars (Ambulance Red/White strobe, Tow Truck Amber caution bar,
 * Police Red/Blue bar) and Tow Truck crane hook pendulum sway each frame.
 */
export function updateVehicleEffects(vehicleGroup, timeSec, sirenActive = false) {
  if (!vehicleGroup || !vehicleGroup.userData) return;
  const lb = vehicleGroup.userData.lightbarParts;
  if (!lb) return;

  const rate = sirenActive ? 22.0 : 12.5;
  const wave = Math.sin(timeSec * rate);
  const phaseAOn = wave >= 0;
  const phaseBOn = wave < 0;

  if (lb.typeId === 'ambulance') {
    for (const m of lb.phaseAMeshes || []) {
      if (m.material && m.material.color) {
        m.material.color.setHex(phaseAOn ? 0xff1122 : 0x4a0810);
      }
      m.scale.y = phaseAOn ? 1.18 : 0.92;
    }
    for (const m of lb.phaseBMeshes || []) {
      if (m.material && m.material.color) {
        m.material.color.setHex(phaseBOn ? 0xffffff : 0x451218);
      }
      m.scale.y = phaseBOn ? 1.18 : 0.92;
    }
    if (lb.pointLight) {
      lb.pointLight.color.setHex(phaseAOn ? 0xff1828 : 0xffeef2);
      lb.pointLight.intensity = sirenActive ? 8.5 : 3.2;
    }
  } else if (lb.typeId === 'tow_truck') {
    for (const m of lb.phaseAMeshes || []) {
      if (m.material && m.material.color) {
        m.material.color.setHex(phaseAOn ? 0xffbb00 : 0x4d3300);
      }
      m.scale.y = phaseAOn ? 1.16 : 0.94;
    }
    for (const m of lb.phaseBMeshes || []) {
      if (m.material && m.material.color) {
        m.material.color.setHex(phaseBOn ? 0xffe84a : 0x4d3300);
      }
      m.scale.y = phaseBOn ? 1.16 : 0.94;
    }
    if (lb.pointLight) {
      lb.pointLight.color.setHex(phaseAOn ? 0xffaa00 : 0xffdd33);
      lb.pointLight.intensity = sirenActive ? 7.0 : 2.8;
    }
    if (lb.towHookPivot) {
      lb.towHookPivot.rotation.z = Math.sin(timeSec * 3.4) * 0.08;
      lb.towHookPivot.rotation.x = Math.cos(timeSec * 2.7) * 0.06;
    }
  } else if (lb.typeId === 'police') {
    for (const m of lb.phaseAMeshes || []) {
      if (m.material && m.material.color) {
        m.material.color.setHex(phaseAOn ? 0xff1e1e : 0x3b0a0a);
      }
    }
    for (const m of lb.phaseBMeshes || []) {
      if (m.material && m.material.color) {
        m.material.color.setHex(phaseBOn ? 0x1e88ff : 0x0a1e3b);
      }
    }
  }
}

// ============================================================================
// WebAudio Synthesizer for Emergency Siren / Air-Horn / Electric Horn (Key H)
// ============================================================================
let audioCtx = null;
let sirenTimer = null;

function ensureAudioCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function stopVehicleSirenAudio() {
  if (sirenTimer) {
    clearInterval(sirenTimer);
    sirenTimer = null;
  }
}

export function playVehicleHornOrSiren(typeId, sirenActive) {
  stopVehicleSirenAudio();
  if (true) return; // Vehicle audio muted by default
  try {
    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const pulseTone = (f0, f1, durSec, waveType = 'sawtooth', gainVal = 0.08) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = waveType;
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.linearRampToValueAtTime(f1, now + durSec * 0.6);
      osc.frequency.linearRampToValueAtTime(f0, now + durSec);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(gainVal, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durSec + 0.02);
    };

    if ((typeId === 'ambulance' || typeId === 'police') && sirenActive) {
      pulseTone(660, 1180, 0.55, 'triangle', 0.07);
      sirenTimer = setInterval(() => {
        try {
          pulseTone(660, 1180, 0.55, 'triangle', 0.06);
        } catch (_) {}
      }, 600);
    } else if (typeId === 'tow_truck' && sirenActive) {
      // Deep heavy-duty truck air horn
      pulseTone(185, 220, 0.42, 'sawtooth', 0.09);
      pulseTone(233, 277, 0.42, 'sawtooth', 0.07);
    } else if (!sirenActive && (typeId === 'ambulance' || typeId === 'police' || typeId === 'tow_truck')) {
      // Short chirp when turning off siren
      pulseTone(880, 520, 0.12, 'sine', 0.05);
    } else {
      // Clean dual-tone automotive horn
      pulseTone(420, 425, 0.24, 'triangle', 0.07);
      pulseTone(525, 530, 0.24, 'triangle', 0.06);
    }
  } catch (_) {
    // Ignore audio context restrictions in headless browsers
  }
}

// ============================================================================
// Minimal Quiet HUD Vehicle Toast (Radical Simplicity)
// ============================================================================
let toastTimer = null;

export function showVehicleToast(title, subtitle = '') {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('vehicle-fleet-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vehicle-fleet-toast';
    el.style.cssText = [
      'position:fixed',
      'top:68px',
      'left:50%',
      'transform:translateX(-50%)',
      'padding:6px 14px',
      'border-radius:999px',
      'background:rgba(15,20,28,0.82)',
      'backdrop-filter:blur(10px)',
      'border:1px solid rgba(255,255,255,0.14)',
      'color:#f8fafc',
      'font:600 12px/1.3 system-ui,-apple-system,sans-serif',
      'letter-spacing:0.04em',
      'pointer-events:none',
      'z-index:90',
      'transition:opacity 0.22s ease',
      'opacity:0',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = subtitle ? title + ' · ' + subtitle : title;
  el.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (el) el.style.opacity = '0';
  }, 1800);
}
