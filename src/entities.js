import * as THREE from '../vendor/three.module.js';

export const VEHICLE_SPECS = [
  {
    id: 'cyber_mach1',
    name: 'Concept Hypercar',
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
    name: 'GT Coupe',
    maxSpeed: 64.0,      // ~230 km/h -> 368 km/h on Nitro
    nitroMult: 1.60,
    accel: 36.0,
    brake: 54.0,
    steerLow: 0.52,
    steerHigh: 0.14,
    length: 4.6,
    width: 2.05,
  },
  {
    id: 'taxi',
    name: 'City Taxi',
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

/**
 * Builds a multi-part 3D vehicle model pivoted at bottom-center (y = 0 at tire contact).
 * Local forward is +Z, right is +X, up is +Y.
 */
export function createVehicleModel(typeId = 'cyber_mach1') {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.52, metalness: 0.65 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.82, metalness: 0.15 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.25, metalness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.10, metalness: 0.90 });
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

  const wheels = [];
  const frontSteerPivots = [];
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  chassis.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [], aeroFlaps: [] };

  if (typeId === 'cyber_mach1') {
    // ⚡ 轩辕·零式 1马赫未来超跑 (Mach-1 Cyber Hypercar)
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x0b101b, roughness: 0.18, metalness: 0.88 });
    const gunmetalMat = new THREE.MeshStandardMaterial({ color: 0x1c2536, roughness: 0.28, metalness: 0.78 });
    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
    const magentaNeonMat = new THREE.MeshBasicMaterial({ color: 0xff2a85 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x081c2e, roughness: 0.06, metalness: 0.94 });

    // Sculpted low-slung supersonic wedge fuselage
    const lowerPan = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.22, 5.05), hullMat);
    lowerPan.position.set(0, 0.26, 0);
    chassis.add(lowerPan);

    // Front supersonic needle nose cone
    const noseGeo = new THREE.ConeGeometry(1.12, 1.85, 4);
    noseGeo.rotateY(Math.PI * 0.25);
    noseGeo.rotateX(Math.PI * 0.5);
    noseGeo.scale(1.0, 0.26, 1.0);
    const noseMesh = new THREE.Mesh(noseGeo, hullMat);
    noseMesh.position.set(0, 0.36, 2.25);
    chassis.add(noseMesh);

    // Central sculpted upper fuselage
    const midDeck = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.28, 3.65), gunmetalMat);
    midDeck.position.set(0, 0.48, -0.15);
    chassis.add(midDeck);

    // Fighter-jet teardrop glass bubble canopy
    const canopyGeo = new THREE.SphereGeometry(0.68, 16, 12);
    canopyGeo.scale(0.95, 0.46, 2.15);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.68, 0.10);
    chassis.add(canopy);

    // Dorsal spine fin (LMP1 / supersonic stabilizer fin)
    const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 1.95), hullMat);
    dorsalFin.position.set(0, 0.82, -1.25);
    chassis.add(dorsalFin);
    const dorsalEdge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 1.96), cyanNeonMat);
    dorsalEdge.position.set(0, 1.00, -1.25);
    chassis.add(dorsalEdge);

    // Side aerodynamic pontoon fenders & intake tunnels
    for (const sx of [-0.92, 0.92]) {
      const fender = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 4.55), hullMat);
      fender.position.set(sx, 0.44, 0.05);
      chassis.add(fender);

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

    // Front laser blade headlights + rear full-width cyber lightbar
    const frontLaserBar = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.045, 0.10), cyanNeonMat);
    frontLaserBar.position.set(0, 0.39, 2.52);
    chassis.add(frontLaserBar);

    const rearLaserBar = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.06, 0.08), magentaNeonMat);
    rearLaserBar.position.set(0, 0.56, -2.54);
    chassis.add(rearLaserBar);

    // Twin rear plasma turbine thruster nozzles
    const nozzleGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.36, 16, 1, false);
    nozzleGeo.rotateX(Math.PI * 0.5);
    for (const sx of [-0.42, 0.42]) {
      const nozzle = new THREE.Mesh(nozzleGeo, darkMetal);
      nozzle.position.set(sx, 0.44, -2.52);
      chassis.add(nozzle);

      const coreGlow = new THREE.Mesh(new THREE.CircleGeometry(0.19, 14), cyanNeonMat);
      coreGlow.rotation.y = Math.PI;
      coreGlow.position.set(sx, 0.44, -2.71);
      chassis.add(coreGlow);
    }

    // 4 Hubless Cyber-Neon Wheels
    const wheelCoords = [
      [-1.02, 1.58, true],
      [1.02, 1.58, true],
      [-1.04, -1.56, false],
      [1.04, -1.56, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildWheelAssembly(0.38, 0.30, tireMat, cyanNeonMat);
      pivot.position.set(wx, 0.38, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // === MACH-1 CYBER HYPERCAR NITRO VFX (Sonic Boom Prandtl-Glauert Shockwave Cone + Twin Plasma Afterburners + Light-Cycle Trails) ===
    for (const sx of [-0.46, 0.46]) {
      const plume = createThrusterFlameCone(0.24, 3.4, 0xffffff, 0x00f5ff);
      plume.position.set(sx, 0.42, -2.58);
      nitroVfx.add(plume);
      vfxParts.plumes.push(plume);

      // Shock diamonds inside plasma jet
      for (let d = 1; d <= 4; d++) {
        const diaGeo = new THREE.OctahedronGeometry(0.12 - d * 0.018, 0);
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

    // Central magenta-cyan hyper-core plume
    const centerPlume = createThrusterFlameCone(0.28, 4.2, 0x80ffdb, 0xff2a85);
    centerPlume.position.set(0, 0.44, -2.60);
    nitroVfx.add(centerPlume);
    vfxParts.plumes.push(centerPlume);

    // Transonic Prandtl-Glauert Mach Shockwave Cone (音爆云激波锥: translucent wireframe shock-cone + 3 concentric Mach rings)
    // Built with open shock-rings & wireframe ribs so the obsidian-cyan hypercar body remains 100% visible inside the cone!
    const machConeGeo = new THREE.ConeGeometry(2.35, 3.6, 20, 2, true);
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
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 32);
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

    // 4 Neon Light-Cycle Speed Ribbons trailing behind the wheels and rear fins
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

    // Ground-effect cyan underglow plane
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
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.22, metalness: 0.68 });
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.42, metalness: 0.55 });
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });

    // Narrow formula monocoque tub & needle nose
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.36, 4.4), bodyMat);
    tub.position.set(0, 0.38, 0.1);
    chassis.add(tub);

    // Sidepods with ground-effect radiator inlets
    for (const sx of [-0.62, 0.62]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 2.15), carbonMat);
      pod.position.set(sx, 0.36, -0.25);
      chassis.add(pod);
      const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.04, 2.16), goldMat);
      goldTrim.position.set(sx, 0.54, -0.25);
      chassis.add(goldTrim);
    }

    // Multi-element front wing
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.06, 0.52), carbonMat);
    frontWing.position.set(0, 0.18, 2.32);
    chassis.add(frontWing);
    const fwStrip = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 0.10), goldMat);
    fwStrip.position.set(0, 0.22, 2.52);
    chassis.add(fwStrip);

    // Halo cockpit protection + airbox intake
    const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 1.35), bodyMat);
    airbox.position.set(0, 0.72, -0.55);
    chassis.add(airbox);

    // High-downforce swan-neck rear wing
    const rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.08, 0.46), carbonMat);
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

    // 4 Exposed Formula Slick Wheels
    const wheelCoords = [
      [-0.96, 1.56, true],
      [0.96, 1.56, true],
      [-0.98, -1.52, false],
      [0.98, -1.52, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildWheelAssembly(0.36, 0.34, tireMat, goldMat);
      pivot.position.set(wx, 0.36, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // Formula Quantum DRS + Emerald-Gold Plasma Plume VFX
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
    const redMat = new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.4, metalness: 0.25 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.45, metalness: 0.15 });

    // Lower & upper body shells
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.35, 10.4), redMat);
    lowerHull.position.set(0, 0.95, 0);
    chassis.add(lowerHull);

    const upperHull = new THREE.Mesh(new THREE.BoxGeometry(2.46, 1.85, 10.3), whiteMat);
    upperHull.position.set(0, 2.55, 0);
    chassis.add(upperHull);

    const roofBand = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.35, 10.35), redMat);
    roofBand.position.set(0, 3.55, 0);
    chassis.add(roofBand);

    // Panoramic window strips
    const winLower = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.65, 9.4), glassMat);
    winLower.position.set(0, 1.75, 0.1);
    chassis.add(winLower);

    const winUpper = new THREE.Mesh(new THREE.BoxGeometry(2.50, 0.72, 9.6), glassMat);
    winUpper.position.set(0, 3.0, 0.05);
    chassis.add(winUpper);

    // LED route display sign on front
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffb703 });
    const routeBoard = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 0.08), signMat);
    routeBoard.position.set(0, 2.3, 5.18);
    chassis.add(routeBoard);

    // Headlights & Taillights
    for (const sx of [-0.9, 0.9]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.08), headLightMat);
      hl.position.set(sx, 0.75, 5.21);
      chassis.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.08), tailLightMat);
      tl.position.set(sx, 0.85, -5.21);
      chassis.add(tl);
    }

    // 6 Bus Wheels
    const wheelOffsets = [
      [-1.22, 3.2, true], [1.22, 3.2, true],
      [-1.22, -1.8, false], [1.22, -1.8, false],
      [-1.22, -3.3, false], [1.22, -3.3, false],
    ];
    for (const [wx, wz, isFront] of wheelOffsets) {
      const { pivot, wheelMesh } = buildWheelAssembly(0.48, 0.32, tireMat, rimMat);
      pivot.position.set(wx, 0.48, wz);
      group.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontSteerPivots.push(pivot);
    }

    // 300路快车 Quad Heavy Booster Rockets VFX!
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
    // Sedan / Supercar / Police Cruiser
    let lowerCol = 0x1d4e89; // Beijing Taxi lower blue band
    let upperCol = 0xf4b942; // Beijing Taxi upper golden-yellow
    let cabinH = 0.58;
    let bodyH = 0.62;
    let bodyW = 1.88;
    let bodyL = 4.45;

    if (typeId === 'supercar') {
      lowerCol = 0xd90429;
      upperCol = 0xd90429;
      cabinH = 0.44;
      bodyH = 0.48;
      bodyW = 2.04;
      bodyL = 4.55;
    } else if (typeId === 'police') {
      lowerCol = 0x1b263b;
      upperCol = 0xf8f9fa;
      cabinH = 0.62;
      bodyH = 0.66;
      bodyW = 1.94;
      bodyL = 4.65;
    }

    const lowerMat = new THREE.MeshStandardMaterial({ color: lowerCol, roughness: 0.32, metalness: 0.45 });
    const upperMat = new THREE.MeshStandardMaterial({ color: upperCol, roughness: 0.28, metalness: 0.4 });

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH * 0.55, bodyL), lowerMat);
    lowerBody.position.set(0, 0.35 + bodyH * 0.25, 0);
    chassis.add(lowerBody);

    const upperBody = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.98, bodyH * 0.55, bodyL * 0.98), upperMat);
    upperBody.position.set(0, 0.35 + bodyH * 0.72, 0);
    chassis.add(upperBody);

    // Cabin greenhouse
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.84, cabinH, bodyL * 0.52), glassMat);
    cabin.position.set(0, 0.35 + bodyH + cabinH * 0.42, -0.15);
    chassis.add(cabin);

    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.80, 0.08, bodyL * 0.48), upperMat);
    cabinRoof.position.set(0, 0.35 + bodyH + cabinH * 0.88, -0.15);
    chassis.add(cabinRoof);

    // Bumpers
    const fBumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.01, 0.24, 0.22), darkMetal);
    fBumper.position.set(0, 0.42, bodyL * 0.5);
    chassis.add(fBumper);

    const rBumper = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.01, 0.24, 0.22), darkMetal);
    rBumper.position.set(0, 0.42, -bodyL * 0.5);
    chassis.add(rBumper);

    // Type-specific roof & aerodynamic accents
    const roofY = 0.35 + bodyH + cabinH * 0.92;
    if (typeId === 'taxi') {
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
      redBeacon.position.set(-0.3, roofY + 0.12, -0.05);
      chassis.add(redBeacon);
      const blueBeacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.14, 0.22),
        new THREE.MeshBasicMaterial({ color: 0x1e88ff })
      );
      blueBeacon.position.set(0.3, roofY + 0.12, -0.05);
      chassis.add(blueBeacon);
    } else if (typeId === 'supercar') {
      // Rear spoiler wing
      const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.94, 0.07, 0.34), darkMetal);
      wingBlade.position.set(0, 0.35 + bodyH + 0.26, -bodyL * 0.45);
      chassis.add(wingBlade);
      for (const sx of [-0.55, 0.55]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.18), darkMetal);
        strut.position.set(sx, 0.35 + bodyH + 0.12, -bodyL * 0.44);
        chassis.add(strut);
      }
    }

    // Headlights & Taillights
    for (const sx of [-bodyW * 0.36, bodyW * 0.36]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headLightMat);
      hl.position.set(sx, 0.35 + bodyH * 0.62, bodyL * 0.5 + 0.02);
      chassis.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.08), tailLightMat);
      tl.position.set(sx, 0.35 + bodyH * 0.65, -bodyL * 0.5 - 0.02);
      chassis.add(tl);
    }

    // 4 Wheels
    const wxOff = bodyW * 0.48;
    const wzOff = bodyL * 0.33;
    const wheelCoords = [
      [-wxOff, wzOff, true],
      [wxOff, wzOff, true],
      [-wxOff, -wzOff, false],
      [wxOff, -wzOff, false],
    ];
    for (const [wx, wz, isFront] of wheelCoords) {
      const { pivot, wheelMesh } = buildWheelAssembly(0.36, 0.26, tireMat, rimMat);
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
    if (obj.isMesh && ! nitroVfx.getObjectById(obj.id)) {
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
  };
  return group;
}

function buildWheelAssembly(radius, width, tireMat, rimMat) {
  const pivot = new THREE.Group();
  const wheelMesh = new THREE.Group();

  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 14);
  tireGeo.rotateZ(Math.PI * 0.5);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  wheelMesh.add(tire);

  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 10);
  rimGeo.rotateZ(Math.PI * 0.5);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  wheelMesh.add(rim);

  pivot.add(wheelMesh);
  return { pivot, wheelMesh };
}

/**
 * Builds an articulated 3D pedestrian/player character model with Cyber-Sprint Nitro VFX (`nitroVfx`).
 */
export function createPlayerAvatarModel() {
  const root = new THREE.Group();

  const jacketMat = new THREE.MeshStandardMaterial({ color: 0x3a86ff, roughness: 0.58 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x22272e, roughness: 0.78 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.65 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.65 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x16191d, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.25), jacketMat);
  torso.position.set(0, 1.11, 0);
  root.add(torso);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.16), skinMat);
  neck.position.set(0, 1.47, 0);
  root.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.set(0, 1.66, 0);
  root.add(head);

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.34), hairMat);
  hair.position.set(0, 1.80, -0.01);
  root.add(hair);

  // Articulated hip pivots at y = 0.76 so legs swing from the hip joint
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.125, 0.76, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.20), pantsMat);
  leftLegMesh.position.set(0, -0.33, 0);
  leftLeg.add(leftLegMesh);
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.26), shoeMat);
  leftShoe.position.set(0, -0.70, 0.03);
  leftLeg.add(leftShoe);
  root.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.125, 0.76, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.20), pantsMat);
  rightLegMesh.position.set(0, -0.33, 0);
  rightLeg.add(rightLegMesh);
  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.26), shoeMat);
  rightShoe.position.set(0, -0.70, 0.03);
  rightLeg.add(rightShoe);
  root.add(rightLeg);

  // Articulated shoulder pivots at y = 1.40 so arms swing from the shoulder joint
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.325, 1.40, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.50, 0.16), jacketMat);
  leftArmMesh.position.set(0, -0.25, 0);
  leftArm.add(leftArmMesh);
  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.14), skinMat);
  leftHand.position.set(0, -0.55, 0);
  leftArm.add(leftHand);
  root.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.325, 1.40, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.50, 0.16), jacketMat);
  rightArmMesh.position.set(0, -0.25, 0);
  rightArm.add(rightArmMesh);
  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.14), skinMat);
  rightHand.position.set(0, -0.55, 0);
  rightArm.add(rightHand);
  root.add(rightArm);

  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  // === PEDESTRIAN CYBER-SPRINT NITRO VFX (Speed-Force Lightning Aura + Heel Jet Plumes + Afterimage Ribbons) ===
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  root.add(nitroVfx);

  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [] };

  // Twin heel micro-jet plumes attached to nitroVfx
  for (const sx of [-0.14, 0.14]) {
    const heelPlume = createThrusterFlameCone(0.14, 1.95, 0xffffff, 0x00f5ff);
    heelPlume.position.set(sx, 0.16, -0.15);
    nitroVfx.add(heelPlume);
    vfxParts.plumes.push(heelPlume);
  }

  // Dorsal cyber-backpack booster plume
  const backPlume = createThrusterFlameCone(0.20, 2.6, 0xffe066, 0x00f5ff);
  backPlume.position.set(0, 1.15, -0.16);
  nitroVfx.add(backPlume);
  vfxParts.plumes.push(backPlume);

  // Orbiting Speed-Force Lightning Rings around runner
  for (const [ry, rRadius, colHex, tilt] of [
    [0.12, 0.95, 0x00f5ff, 0.0],
    [0.95, 0.78, 0xffbe0b, 0.55],
    [1.25, 0.82, 0x00f5ff, -0.55],
  ]) {
    const ringGeo = new THREE.RingGeometry(rRadius * 0.82, rRadius, 18);
    ringGeo.rotateX(Math.PI * 0.5 + tilt);
    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: colHex,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    ringMesh.position.set(0, ry, 0);
    nitroVfx.add(ringMesh);
    vfxParts.rings.push(ringMesh);
  }

  // Golden & Cyan Lightning Afterimage Streamers trailing 5.5m behind shoulders and heels
  for (const [tx, ty, colHex] of [
    [-0.28, 1.32, 0xffbe0b],
    [0.28, 1.32, 0xffbe0b],
    [-0.14, 0.22, 0x00f5ff],
    [0.14, 0.22, 0x00f5ff],
  ]) {
    const ribbon = createSpeedTrailRibbon(0.12, 5.5, colHex, 0.82);
    ribbon.position.set(tx, ty, -0.15);
    nitroVfx.add(ribbon);
    vfxParts.trails.push(ribbon);
  }

  root.userData = { leftLeg, rightLeg, leftArm, rightArm, nitroVfx, vfxParts };
  return root;
}

/**
 * Builds an articulated 3D Executive / Tactical Turbine Helicopter (`createHelicopterModel`)
 * replacing the old disembodied Free-Cam.
 * Local forward is +Z, right is +X, up is +Y. Skids rest on y = 0.
 */
export function createHelicopterModel() {
  const root = new THREE.Group();
  const fuselage = new THREE.Group();
  root.add(fuselage);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x16202e, roughness: 0.26, metalness: 0.76 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x00b4d8, roughness: 0.22, metalness: 0.65 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.55, metalness: 0.65 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a192f, roughness: 0.08, metalness: 0.92 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.4, metalness: 0.5 });
  const tipGlowMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a55 });

  // 1. Landing Skids (Left & Right skids at X = ±1.15, resting at Y = 0.08)
  for (const sx of [-1.15, 1.15]) {
    const skidTube = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 4.2), darkMetal);
    skidTube.position.set(sx, 0.08, 0.2);
    fuselage.add(skidTube);

    for (const sz of [-0.95, 1.15]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.10), darkMetal);
      strut.position.set(sx * 0.82, 0.42, sz);
      strut.rotation.z = sx > 0 ? 0.32 : -0.32;
      fuselage.add(strut);
    }
  }

  // 2. Main Aerodynamic Cabin Hull + Nose Canopy
  const mainHull = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.42, 4.4), bodyMat);
  mainHull.position.set(0, 1.38, 0.15);
  fuselage.add(mainHull);

  const accentStripe = new THREE.Mesh(new THREE.BoxGeometry(2.09, 0.16, 4.42), accentMat);
  accentStripe.position.set(0, 1.25, 0.15);
  fuselage.add(accentStripe);

  // Sculpted glass cockpit nose (+Z)
  const noseGeo = new THREE.SphereGeometry(1.02, 16, 12);
  noseGeo.scale(0.98, 0.68, 1.55);
  const noseGlass = new THREE.Mesh(noseGeo, glassMat);
  noseGlass.position.set(0, 1.35, 1.65);
  fuselage.add(noseGlass);

  // Side stub-wings (for high-speed compound helicopter lift & contrails)
  const stubWing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.85), bodyMat);
  stubWing.position.set(0, 1.18, -0.15);
  fuselage.add(stubWing);
  for (const sx of [-2.22, 2.22]) {
    const wingPod = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 1.15), accentMat);
    wingPod.position.set(sx, 1.18, -0.10);
    fuselage.add(wingPod);
  }

  // 3. Twin Turbine Engine Nacelles on Top Deck
  for (const sx of [-0.58, 0.58]) {
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 2.45), darkMetal);
    nacelle.position.set(sx, 2.28, -0.35);
    fuselage.add(nacelle);
  }

  // 4. Tail Boom + Swept Vertical Fin + Horizontal Stabilizer (-Z)
  const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 5.2), bodyMat);
  tailBoom.position.set(0, 1.62, -4.25);
  fuselage.add(tailBoom);

  const tailStripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 4.8), tipGlowMat);
  tailStripe.position.set(0, 1.64, -4.15);
  fuselage.add(tailStripe);

  const vertFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.65, 1.05), accentMat);
  vertFin.position.set(0, 2.25, -6.55);
  vertFin.rotation.x = -0.22;
  fuselage.add(vertFin);

  const tailBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), beaconMat);
  tailBeacon.position.set(0, 3.12, -6.72);
  fuselage.add(tailBeacon);

  // 5. 4-Blade Articulated Main Rotor (`mainRotor`) + Translucent High-RPM Blur Disc
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 2.78, -0.10);
  fuselage.add(mainRotor);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.48, 12), darkMetal);
  mast.position.set(0, 2.55, -0.10);
  fuselage.add(mast);

  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.18, 14), darkMetal);
  mainRotor.add(hubCap);

  const ROTOR_RADIUS = 5.4;
  for (let b = 0; b < 4; b++) {
    const bGroup = new THREE.Group();
    bGroup.rotation.y = (b * Math.PI) * 0.5;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, ROTOR_RADIUS), bladeMat);
    blade.position.set(0, 0, ROTOR_RADIUS * 0.5);
    bGroup.add(blade);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.42), tipGlowMat);
    tip.position.set(0, 0, ROTOR_RADIUS - 0.21);
    bGroup.add(tip);
    mainRotor.add(bGroup);
  }

  const discGeo = new THREE.RingGeometry(0.55, ROTOR_RADIUS, 32);
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

  // 6. 4-Blade Tail Rotor (`tailRotor`)
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.18, 2.25, -6.58);
  fuselage.add(tailRotor);
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

  // === HELICOPTER NITRO VFX (Twin Turbine Afterburner Cones + Glowing Cyan-Gold Rotor Plasma Halo + Wingtip Contrails) ===
  const nitroVfx = new THREE.Group();
  nitroVfx.visible = false;
  fuselage.add(nitroVfx);
  const vfxParts = { plumes: [], shockCones: [], rings: [], trails: [] };

  // Twin turbine afterburner cones from upper engine nacelles
  for (const sx of [-0.58, 0.58]) {
    const plume = createThrusterFlameCone(0.32, 5.4, 0xffffff, 0x00f5ff);
    plume.position.set(sx, 2.28, -1.62);
    nitroVfx.add(plume);
    vfxParts.plumes.push(plume);
  }

  // Glowing cyan-gold supersonic rotor-tip plasma halo around the 10.8m main rotor disc
  const haloGeo = new THREE.RingGeometry(ROTOR_RADIUS - 0.35, ROTOR_RADIUS + 0.25, 36);
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

  // Inner golden vortex ring beneath main rotor
  const innerVortexGeo = new THREE.RingGeometry(2.6, 3.2, 28);
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

  // Stub-wingtip plasma contrails
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
  };
  return root;
}

/**
 * Animates the mode-specific Nitro Boost visual effects (`nitroVfx`) on any entity
 * (Mach-1 Cyber Hypercar, Standard Vehicles, Pedestrian Cyber-Sprint, or Helicopter).
 */
export function updateEntityNitroVfx(entityRoot, isActive, speedMps, timeSec) {
  if (!entityRoot || !entityRoot.userData) return;
  const { nitroVfx, vfxParts, typeId } = entityRoot.userData;
  if (!nitroVfx || !vfxParts) return;

  const absSpd = Math.abs(speedMps);
  const show = Boolean(isActive && absSpd > 0.8);
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
