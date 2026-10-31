// Instanced render assets for AI traffic & pedestrians.
// Cars: the low-detail build of each player vehicle (hero builders with options.lod) enriched with fine 3D
// exterior details (sculpted wheel arches, 16-segment dark rubber tires, multi-spoke silver alloy wheel hubs,
// recessed radiator grilles, chrome bumper trim, side mirrors, wipers, A/B-pillar frames, roof rails, sunroofs,
// rear license plate recesses, dual exhaust tips, bus LED headers/folding doors/AC pods/mullions, truck vertical
// chrome stacks/sun visors/fuel tanks/ribbed doors/underride guards, and taxi/police/ambulance/firetruck equipment)
// flattened into one merged geometry per type, drawn with one InstancedMesh each; per-instance paint + brake light,
// emissive head/tail lights at night.
// Pedestrians: a sculpted figure (near + far detail), walk/run/idle posed in the vertex shader.
import * as THREE from '../../vendor/three.module.js';
import { buildHeroVehicle } from './hero_vehicles.js';
import { HEAVY_VEHICLE_IDS, buildHeavyVehicle } from './hero_heavy.js';
import { personParts, PERSON_COMMON_GLSL, PERSON_ANIM_GLSL, PERSON_BEGIN_GLSL, PERSON_COLOR_GLSL, RAGDOLL_PART_SPECS, createRagdollPartGeometries } from './person_model.js';

// Headless Node ESM fallback for canvas-based livery/LED helpers inside hero builders.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      width: 64,
      height: 64,
      getContext: () =>
        new Proxy(
          {
            getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
            measureText: () => ({ width: 20 }),
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
          },
          { get: (t, k) => (k in t ? t[k] : () => {}) }
        ),
    }),
  };
}

// Lamp colours in the flat traffic shading (the hero lamp materials rely on reflections and emissive).
const HEAD_HEX = 0xfff3c4;
const TAIL_HEX = 0xc00a0a; // deep red: brighter values tone-map to salmon when braking at night

const uStrobeTime = { value: 0 };

// Shared material factory for fine-detail 3D vehicle parts baked by flattenVehicle.
function makeDetailMats() {
  const mk = (color, { paintWeight = 0, emitCode = 0, lodKind = 0 } = {}) => {
    const m = new THREE.MeshStandardMaterial({ color });
    m.userData = { paintWeight, emitCode, lodKind };
    return m;
  };
  return {
    paint: mk(0xd8dde4, { paintWeight: 1, lodKind: 0 }),
    chrome: mk(0xe4e9ef, { lodKind: 3 }),
    alloy: mk(0xcfd5dd, { lodKind: 3 }),
    disc: mk(0x6e737b, { lodKind: 3 }),
    darkTrim: mk(0x141619, { lodKind: 0 }),
    grille: mk(0x0b0c0e, { lodKind: 0 }),
    rubber: mk(0x16171a, { lodKind: 2 }),
    glass: mk(0x0c1318, { lodKind: 1 }),
    plate: mk(0xf0f2f5, { lodKind: 0 }),
    head: mk(HEAD_HEX, { emitCode: 1 }),
    tail: mk(TAIL_HEX, { emitCode: 2 }),
    glowAmber: mk(0xffb81c, { emitCode: 3 }),
    glowWhite: mk(0xf4fbff, { emitCode: 3 }),
    taxiYellow: mk(0xffcc11, { emitCode: 3 }),
    strobeRed: mk(0xff1e1e, { emitCode: 4 }),
    strobeBlue: mk(0x1e88ff, { emitCode: 5 }),
    fireRed: mk(0xc81018, { paintWeight: 0.35, lodKind: 0 }),
  };
}

function addPart(parent, geom, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (geom.index) geom.computeVertexNormals();
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/**
 * Adds fine 3D exterior details to every vehicle archetype before flattening into the shared InstancedMesh
 * template (0 extra draw calls):
 * - Sculpted wheel arches / fenders + 16-segment dark rubber tires + multi-spoke silver alloy wheel hubs & brake discs
 * - Recessed front radiator grille with slats + chrome/silver front & rear bumper trim
 * - Side-view mirrors with reflective glass & turn indicators + windshield wipers + A/B-pillar window frames
 * - Roof rails (SUVs/vans) + panoramic sunroof glass panel (sedans/SUVs)
 * - Rear license plate recess + dual chrome exhaust tips
 * - Bus destination LED header display, folding double passenger doors, rooftop AC unit pods & side window mullions
 * - Truck/semi vertical chrome exhaust stacks, cab sun visor, side fuel tanks, ribbed cargo doors & rear underride guard
 * - Emergency/service equipment for taxi, police, ambulance, and firetruck / tow_truck
 */
function addFineVehicleDetails(built, typeId, options = {}) {
  const M = makeDetailMats();
  const root = new THREE.Group();
  root.name = 'fine_vehicle_details';
  built.group.add(root);

  built.group.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(built.group);
  const arch = options.archetype || (options.hideTaxiSign ? 'sedan' : typeId);

  // Extract wheel centers from built.wheels
  const wheelCenters = [];
  for (const w of built.wheels || []) {
    const p = new THREE.Vector3();
    w.getWorldPosition(p);
    wheelCenters.push(p);
  }

  const isHeavy = typeId === 'bus' || typeId === 'ambulance' || typeId === 'tow_truck' || typeId === 'cybertruck';
  const numSpokes = typeId === 'bus' || typeId === 'tow_truck' ? 8 : typeId === 'police' || typeId === 'cybertruck' ? 7 : 6;

  // 1. Sculpted wheel arches / fenders + 16-segment dark rubber tires + multi-spoke silver alloy wheel hubs
  for (const wp of wheelCenters) {
    const sx = wp.x >= 0 ? 1 : -1;
    const R = wp.y;
    const tw = isHeavy ? 0.28 : 0.24;
    const rimR = R * 0.65;
    const faceX = wp.x + sx * (tw * 0.38);

    // Sculpted wheel arch flare lip + dark wheel-well liner
    addPart(
      root,
      new THREE.TorusGeometry(R + 0.045, isHeavy ? 0.042 : 0.032, 8, 16, Math.PI),
      isHeavy ? M.darkTrim : M.paint,
      wp.x + sx * (tw * 0.28),
      R,
      wp.z,
      0,
      Math.PI / 2,
      0
    );
    addPart(
      root,
      new THREE.CylinderGeometry(R + 0.02, R + 0.02, tw * 0.92, 16, 1, true, 0, Math.PI),
      M.darkTrim,
      wp.x,
      R,
      wp.z,
      0,
      0,
      Math.PI / 2
    );
    // Deep wheel-well cutout liner & rear splash mudflap
    addPart(
      root,
      new THREE.BoxGeometry(tw * 0.65, R * 1.15, R * 1.65),
      M.grille,
      wp.x - sx * (tw * 0.18),
      R + 0.04,
      wp.z
    );
    addPart(
      root,
      new THREE.BoxGeometry(tw * 0.85, R * 0.62, 0.03),
      M.rubber,
      wp.x,
      R * 0.68,
      wp.z - R * 0.96
    );

    // Smooth 16-segment dark rubber tire tread & sidewall shoulder
    addPart(
      root,
      new THREE.CylinderGeometry(R, R, tw * 0.88, 16, 1, false),
      M.rubber,
      wp.x,
      R,
      wp.z,
      0,
      0,
      Math.PI / 2
    );
    addPart(
      root,
      new THREE.TorusGeometry(R - 0.048, 0.046, 8, 16),
      M.rubber,
      wp.x + sx * (tw * 0.34),
      R,
      wp.z,
      0,
      Math.PI / 2,
      0
    );

    // Recessed brake rotor disc + outer chrome rim lip + central alloy hub cap
    addPart(
      root,
      new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.024, 16),
      M.disc,
      wp.x + sx * (tw * 0.14),
      R,
      wp.z,
      0,
      0,
      Math.PI / 2
    );
    addPart(
      root,
      new THREE.TorusGeometry(rimR, 0.016, 6, 16),
      M.chrome,
      faceX,
      R,
      wp.z,
      0,
      Math.PI / 2,
      0
    );
    addPart(
      root,
      new THREE.CylinderGeometry(rimR * 0.24, rimR * 0.26, 0.036, 12),
      M.chrome,
      faceX + sx * 0.006,
      R,
      wp.z,
      0,
      0,
      Math.PI / 2
    );

    // Multi-spoke silver alloy wheel hub spokes
    const spokeLen = rimR * 0.78;
    for (let s = 0; s < numSpokes; s++) {
      const a = (s / numSpokes) * Math.PI * 2;
      addPart(
        root,
        new THREE.BoxGeometry(0.022, spokeLen, 0.032),
        M.alloy,
        faceX,
        R + Math.cos(a) * (spokeLen * 0.46),
        wp.z + Math.sin(a) * (spokeLen * 0.46),
        -a,
        0,
        0
      );
    }
  }

  const zFront = bbox.max.z;
  const zRear = bbox.min.z;
  const halfW = Math.max(0.88, (bbox.max.x - bbox.min.x) * 0.48);

  // 2. Common Passenger / SUV / Sports / Police / Taxi Details
  if (!isHeavy) {
    const grilleY = typeId === 'supercar' ? 0.38 : 0.56;
    const grilleW = typeId === 'supercar' ? 1.16 : 0.94;
    const grilleH = typeId === 'supercar' ? 0.16 : 0.2;
    // Recessed front radiator grille + chrome surround + horizontal slats
    addPart(root, new THREE.BoxGeometry(grilleW, grilleH, 0.04), M.grille, 0, grilleY, zFront - 0.03);
    addPart(root, new THREE.BoxGeometry(grilleW + 0.05, 0.02, 0.045), M.chrome, 0, grilleY + grilleH * 0.5, zFront - 0.025);
    addPart(root, new THREE.BoxGeometry(grilleW + 0.05, 0.02, 0.045), M.chrome, 0, grilleY - grilleH * 0.5, zFront - 0.025);
    for (let k = -1; k <= 1; k++) {
      addPart(root, new THREE.BoxGeometry(grilleW - 0.04, 0.014, 0.048), M.chrome, 0, grilleY + k * (grilleH * 0.28), zFront - 0.022);
    }
    // Front & rear chrome/silver bumper trim mouldings
    addPart(root, new THREE.BoxGeometry(halfW * 1.68, 0.036, 0.08), M.chrome, 0, 0.34, zFront - 0.03);
    addPart(root, new THREE.BoxGeometry(halfW * 1.68, 0.036, 0.08), M.chrome, 0, 0.36, zRear + 0.03);

    // Side-view mirrors (mirrorglass face + LED turn-signal strip) & A/B-pillar window frames + door handles
    const beltY = typeId === 'supercar' ? 0.84 : 0.96;
    const wsZ = typeId === 'supercar' ? 0.78 : 1.08;
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.CylinderGeometry(0.055, 0.055, 0.012, 12), M.chrome, sx * (halfW + 0.04), beltY + 0.08, wsZ - 0.2, Math.PI / 2, 0, 0);
      addPart(root, new THREE.BoxGeometry(0.08, 0.014, 0.02), M.glowAmber, sx * (halfW + 0.05), beltY + 0.08, wsZ - 0.12);
      // B-pillar gloss black frame + chrome window sill beltline + A-pillar trim
      addPart(root, new THREE.BoxGeometry(0.024, 0.38, 0.085), M.darkTrim, sx * (halfW - 0.12), beltY + 0.18, -0.08);
      addPart(root, new THREE.BoxGeometry(0.022, 0.42, 0.045), M.darkTrim, sx * (halfW - 0.1), beltY + 0.16, wsZ - 0.18, -0.58, 0, 0);
      addPart(root, new THREE.BoxGeometry(0.024, 0.022, 1.96), M.chrome, sx * (halfW - 0.05), beltY - 0.01, -0.1);
      // Door handles
      for (const hz of typeId === 'supercar' ? [-0.28] : [0.16, -0.78]) {
        addPart(root, new THREE.BoxGeometry(0.026, 0.028, 0.16), M.chrome, sx * (halfW - 0.01), beltY - 0.12, hz);
      }
    }
    // Dual articulated front windshield wipers
    for (const wx of [-0.32, 0.22]) {
      addPart(root, new THREE.BoxGeometry(0.46, 0.016, 0.022), M.darkTrim, wx, beltY + 0.02, wsZ - 0.02, 0, 0, 0.12);
    }

    // Rear license plate recess & dual chrome exhaust tips
    addPart(root, new THREE.BoxGeometry(0.48, 0.15, 0.04), M.darkTrim, 0, 0.58, zRear + 0.025);
    addPart(root, new THREE.BoxGeometry(0.4, 0.11, 0.046), M.plate, 0, 0.58, zRear + 0.022);
    addPart(root, new THREE.BoxGeometry(0.44, 0.018, 0.05), M.chrome, 0, 0.655, zRear + 0.02);
    for (const ex of [-0.52, 0.52]) {
      addPart(root, new THREE.CylinderGeometry(0.042, 0.044, 0.16, 14, 1, true), M.chrome, ex, 0.28, zRear + 0.04, Math.PI / 2, 0, 0);
      addPart(root, new THREE.CylinderGeometry(0.034, 0.034, 0.14, 12), M.grille, ex, 0.28, zRear + 0.05, Math.PI / 2, 0, 0);
    }

    // Sunroof glass panel on sedans & SUVs + shark-fin antenna
    if (arch === 'sedan' || arch === 'suv' || typeId === 'tesla') {
      const roofY = bbox.max.y - 0.015;
      addPart(root, new THREE.BoxGeometry(0.92, 0.022, 0.74), M.darkTrim, 0, roofY, 0.08);
      addPart(root, new THREE.BoxGeometry(0.84, 0.026, 0.66), M.glass, 0, roofY + 0.003, 0.08);
      addPart(root, new THREE.BoxGeometry(0.04, 0.075, 0.16), M.darkTrim, 0, roofY + 0.03, -0.88);
    }

    // Raised silver roof rails on SUVs (tesla / suv)
    if (arch === 'suv' || typeId === 'tesla') {
      const roofY = bbox.max.y - 0.02;
      for (const sx of [-1, 1]) {
        addPart(root, new THREE.CylinderGeometry(0.018, 0.018, 1.68, 10), M.chrome, sx * 0.54, roofY + 0.045, -0.12, Math.PI / 2, 0, 0);
        for (const rz of [-0.88, -0.12, 0.64]) {
          addPart(root, new THREE.BoxGeometry(0.028, 0.05, 0.08), M.darkTrim, sx * 0.54, roofY + 0.02, rz);
        }
      }
    }

    // Detailed yellow taxi roof sign dome + roof rack bars
    if (arch === 'taxi' || (typeId === 'taxi' && !options.hideTaxiSign)) {
      const ry = 1.46;
      for (const rz of [-0.08, 0.22]) {
        addPart(root, new THREE.BoxGeometry(1.06, 0.018, 0.035), M.chrome, 0, ry, rz);
      }
      addPart(root, new THREE.BoxGeometry(0.72, 0.03, 0.26), M.darkTrim, 0, ry + 0.02, 0.07);
      addPart(root, new THREE.CylinderGeometry(0.1, 0.12, 0.64, 14), M.taxiYellow, 0, ry + 0.11, 0.07, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) {
        addPart(root, new THREE.SphereGeometry(0.1, 12, 8), M.darkTrim, sx * 0.32, ry + 0.11, 0.07);
      }
    }

    // Police push-bumper + dual-color red/blue aero lightbar + grille strobes + whip antennas
    if (arch === 'police' || typeId === 'police') {
      const ry = 1.52;
      addPart(root, new THREE.BoxGeometry(1.28, 0.045, 0.28), M.chrome, 0, ry, 0.15);
      addPart(root, new THREE.BoxGeometry(0.22, 0.095, 0.28), M.darkTrim, 0, ry + 0.06, 0.15);
      addPart(root, new THREE.BoxGeometry(0.52, 0.085, 0.25), M.strobeRed, -0.37, ry + 0.06, 0.15);
      addPart(root, new THREE.BoxGeometry(0.52, 0.085, 0.25), M.strobeBlue, 0.37, ry + 0.06, 0.15);
      for (const sx of [-1, 1]) {
        addPart(root, new THREE.BoxGeometry(0.05, 0.07, 0.18), M.glowWhite, sx * 0.64, ry + 0.06, 0.15);
        // Heavy push-bumper rubber bash pads & grille strobes
        addPart(root, new THREE.BoxGeometry(0.065, 0.54, 0.09), M.darkTrim, sx * 0.32, 0.6, 2.43);
        addPart(root, new THREE.BoxGeometry(0.12, 0.045, 0.04), sx < 0 ? M.strobeRed : M.strobeBlue, sx * 0.2, 0.66, 2.44);
      }
      // Roof whip antennas & radar pod
      addPart(root, new THREE.CylinderGeometry(0.08, 0.09, 0.05, 12), M.darkTrim, 0, 1.49, -0.45);
      addPart(root, new THREE.CylinderGeometry(0.008, 0.012, 0.42, 6), M.chrome, -0.22, 1.66, -0.75);
      addPart(root, new THREE.CylinderGeometry(0.008, 0.012, 0.42, 6), M.chrome, 0.22, 1.66, -0.75);
    }
  }

  // 3. Bus Details: destination LED header display, folding double passenger doors, rooftop AC unit pods, side window mullions
  if (typeId === 'bus' || arch === 'bus') {
    // Front & curb-side destination LED header display
    addPart(root, new THREE.BoxGeometry(1.88, 0.28, 0.06), M.darkTrim, 0, 2.86, 5.28);
    addPart(root, new THREE.BoxGeometry(1.76, 0.2, 0.07), M.glowAmber, 0, 2.86, 5.29);
    addPart(root, new THREE.BoxGeometry(0.05, 0.22, 1.24), M.darkTrim, -1.27, 2.52, 2.45);
    addPart(root, new THREE.BoxGeometry(0.06, 0.16, 1.14), M.glowAmber, -1.275, 2.52, 2.45);

    // Folding double passenger doors (front & mid curb side) with leaf mullions & grab bars
    for (const dz of [4.15, -0.35]) {
      addPart(root, new THREE.BoxGeometry(0.05, 2.15, 1.16), M.darkTrim, -1.265, 1.42, dz);
      for (const lz of [-0.28, 0.28]) {
        addPart(root, new THREE.BoxGeometry(0.06, 1.88, 0.48), M.glass, -1.27, 1.46, dz + lz);
      }
      addPart(root, new THREE.BoxGeometry(0.07, 2.12, 0.045), M.rubber, -1.275, 1.42, dz);
      addPart(root, new THREE.BoxGeometry(0.07, 0.08, 1.18), M.chrome, -1.275, 2.46, dz);
    }

    // Twin rooftop AC unit pods with louvred condenser grilles
    for (const az of [1.65, -2.05]) {
      addPart(root, new THREE.BoxGeometry(1.68, 0.22, 1.95), M.paint, 0, 3.22, az);
      addPart(root, new THREE.BoxGeometry(1.48, 0.04, 1.65), M.darkTrim, 0, 3.33, az);
      for (const fx of [-0.42, 0.42]) {
        addPart(root, new THREE.CylinderGeometry(0.28, 0.28, 0.05, 14), M.grille, fx, 3.335, az);
      }
    }

    // Side window vertical mullions & upper hopper transom bar along both sides
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.04, 0.035, 8.6), M.darkTrim, sx * 1.27, 2.28, -0.3);
      addPart(root, new THREE.BoxGeometry(0.045, 0.04, 9.8), M.chrome, sx * 1.275, 1.28, -0.2);
      for (let wz = -4.2; wz <= 3.4; wz += 1.26) {
        if (sx < 0 && (Math.abs(wz - 4.15) < 0.7 || Math.abs(wz + 0.35) < 0.7)) continue;
        addPart(root, new THREE.BoxGeometry(0.045, 1.18, 0.055), M.darkTrim, sx * 1.27, 1.88, wz);
      }
      // Extended gantry side-view mirrors on tubular arms
      addPart(root, new THREE.CylinderGeometry(0.02, 0.02, 0.38, 8), M.darkTrim, sx * 1.36, 2.32, 5.18, 0, 0, Math.PI / 2);
      addPart(root, new THREE.BoxGeometry(0.12, 0.38, 0.08), M.darkTrim, sx * 1.48, 2.12, 5.22);
      addPart(root, new THREE.BoxGeometry(0.1, 0.32, 0.02), M.chrome, sx * 1.48, 2.12, 5.175);
    }

    // Front recessed radiator grille, chrome bumper trim, pantograph wipers, rear engine louvres, plate & dual exhausts
    addPart(root, new THREE.BoxGeometry(1.76, 0.36, 0.05), M.grille, 0, 0.72, 5.3);
    for (const gy of [0.62, 0.72, 0.82]) addPart(root, new THREE.BoxGeometry(1.68, 0.022, 0.06), M.chrome, 0, gy, 5.31);
    addPart(root, new THREE.BoxGeometry(2.42, 0.06, 0.12), M.chrome, 0, 0.42, 5.3);
    addPart(root, new THREE.BoxGeometry(2.42, 0.06, 0.12), M.chrome, 0, 0.44, -5.3);
    for (const wx of [-0.52, 0.52]) addPart(root, new THREE.BoxGeometry(0.68, 0.024, 0.03), M.darkTrim, wx, 1.42, 5.31, 0, 0, 0.08);
    for (let ly = 0.85; ly <= 1.65; ly += 0.16) addPart(root, new THREE.BoxGeometry(1.56, 0.03, 0.05), M.grille, 0, ly, -5.31);
    addPart(root, new THREE.BoxGeometry(0.52, 0.16, 0.05), M.plate, 0, 0.62, -5.31);
    for (const ex of [-0.78, 0.78]) {
      addPart(root, new THREE.CylinderGeometry(0.055, 0.055, 0.22, 14, 1, true), M.chrome, ex, 0.34, -5.32, Math.PI / 2, 0, 0);
    }
  }

  // 4. Pickup / Cybertruck Details
  if (typeId === 'cybertruck' || arch === 'pickup') {
    addPart(root, new THREE.BoxGeometry(1.56, 0.22, 0.06), M.grille, 0, 0.56, 2.82);
    for (const gy of [0.5, 0.56, 0.62]) addPart(root, new THREE.BoxGeometry(1.48, 0.02, 0.07), M.chrome, 0, gy, 2.83);
    addPart(root, new THREE.BoxGeometry(2.08, 0.05, 0.12), M.chrome, 0, 0.38, 2.82);
    addPart(root, new THREE.BoxGeometry(2.08, 0.05, 0.12), M.chrome, 0, 0.42, -2.86);
    // Roof rack crossbars + bed side rails + ribbed bed liner slats
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.CylinderGeometry(0.024, 0.024, 2.1, 10), M.chrome, sx * 0.88, 1.32, -1.55, Math.PI / 2, 0, 0);
      addPart(root, new THREE.BoxGeometry(0.14, 0.08, 0.06), M.darkTrim, sx * 1.08, 1.16, 1.15);
      addPart(root, new THREE.BoxGeometry(0.11, 0.06, 0.02), M.chrome, sx * 1.08, 1.16, 1.115);
    }
    for (let bz = -2.6; bz <= -0.6; bz += 0.28) {
      addPart(root, new THREE.BoxGeometry(1.62, 0.02, 0.08), M.darkTrim, 0, 0.88, bz);
    }
    addPart(root, new THREE.BoxGeometry(0.48, 0.15, 0.05), M.plate, 0, 0.58, -2.88);
    for (const ex of [-0.64, 0.64]) {
      addPart(root, new THREE.CylinderGeometry(0.048, 0.048, 0.18, 14, 1, true), M.chrome, ex, 0.34, -2.88, Math.PI / 2, 0, 0);
    }
  }

  // 5. Ambulance / Van Details: rear step bumper, roof emergency beacons & aero lightbar, recessed grille, side lockers
  if (typeId === 'ambulance' || arch === 'ambulance' || arch === 'van') {
    const isAmb = arch !== 'van';
    // Recessed front radiator grille with chrome crossbars & strobe lights
    addPart(root, new THREE.BoxGeometry(1.36, 0.34, 0.06), M.grille, 0, 0.86, 3.04);
    for (const gy of [0.76, 0.86, 0.96]) addPart(root, new THREE.BoxGeometry(1.28, 0.024, 0.07), M.chrome, 0, gy, 3.05);
    addPart(root, new THREE.BoxGeometry(2.12, 0.06, 0.14), M.chrome, 0, 0.46, 3.06);
    if (isAmb) {
      addPart(root, new THREE.BoxGeometry(0.16, 0.06, 0.08), M.strobeRed, -0.42, 0.86, 3.06);
      addPart(root, new THREE.BoxGeometry(0.16, 0.06, 0.08), M.strobeBlue, 0.42, 0.86, 3.06);
      // Front cab aero lightbar + perimeter roof emergency beacons
      addPart(root, new THREE.BoxGeometry(1.56, 0.05, 0.28), M.chrome, 0, 2.38, 1.15);
      addPart(root, new THREE.BoxGeometry(0.72, 0.09, 0.24), M.strobeRed, -0.4, 2.44, 1.15);
      addPart(root, new THREE.BoxGeometry(0.72, 0.09, 0.24), M.strobeBlue, 0.4, 2.44, 1.15);
      for (const bz of [0.2, -1.4, -2.85]) {
        for (const sx of [-1, 1]) {
          addPart(root, new THREE.BoxGeometry(0.06, 0.12, 0.26), sx < 0 ? M.strobeRed : M.strobeBlue, sx * 1.13, 2.62, bz);
          addPart(root, new THREE.CylinderGeometry(0.09, 0.1, 0.12, 12), sx < 0 ? M.strobeRed : M.strobeBlue, sx * 0.86, 2.82, bz);
        }
      }
    } else {
      // Van roof rack rails
      for (const sx of [-1, 1]) {
        addPart(root, new THREE.CylinderGeometry(0.022, 0.022, 3.6, 10), M.chrome, sx * 0.86, 2.82, -1.0, Math.PI / 2, 0, 0);
      }
    }
    // Rooftop AC/ventilator pod
    addPart(root, new THREE.BoxGeometry(0.96, 0.16, 1.18), M.paint, 0, 2.82, -0.8);
    // Cab mirrors, wipers, side equipment locker doors with chrome latches
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.12, 0.34, 0.07), M.darkTrim, sx * 1.18, 1.56, 1.88);
      addPart(root, new THREE.BoxGeometry(0.1, 0.28, 0.02), M.chrome, sx * 1.18, 1.56, 1.84);
      for (const lz of [-0.45, -1.65, -2.55]) {
        addPart(root, new THREE.BoxGeometry(0.03, 0.82, 0.76), M.darkTrim, sx * 1.13, 1.06, lz);
        addPart(root, new THREE.BoxGeometry(0.045, 0.05, 0.12), M.chrome, sx * 1.14, 1.06, lz + 0.24);
      }
    }
    for (const wx of [-0.42, 0.38]) addPart(root, new THREE.BoxGeometry(0.54, 0.02, 0.025), M.darkTrim, wx, 1.48, 2.28, 0, 0, 0.1);
    // Diamond-plate ambulance rear step bumper + rear barn door mullion + license plate recess + dual exhaust tips
    addPart(root, new THREE.BoxGeometry(2.18, 0.09, 0.28), M.chrome, 0, 0.44, -3.18);
    addPart(root, new THREE.BoxGeometry(0.05, 1.88, 0.05), M.darkTrim, 0, 1.58, -3.06);
    addPart(root, new THREE.BoxGeometry(0.48, 0.15, 0.05), M.plate, -0.52, 0.72, -3.06);
    for (const ex of [-0.72, 0.72]) {
      addPart(root, new THREE.CylinderGeometry(0.048, 0.048, 0.2, 14, 1, true), M.chrome, ex, 0.34, -3.14, Math.PI / 2, 0, 0);
    }
  }

  // 6. Truck / Semi / Tow Truck / Firetruck Details:
  // Chrome vertical exhaust stacks, cab sun visor, side fuel tanks, ribbed cargo box doors, rear underride guard,
  // fire engine chrome bumper, rooftop extension ladder & twin hose reels!
  if (typeId === 'tow_truck' || arch === 'truck' || arch === 'firetruck') {
    // Tall recessed vertical-bar chrome radiator grille + heavy chrome front bumper
    addPart(root, new THREE.BoxGeometry(1.42, 0.68, 0.06), M.grille, 0, 1.08, 3.22);
    addPart(root, new THREE.BoxGeometry(1.48, 0.74, 0.04), M.chrome, 0, 1.08, 3.2);
    for (let gx = -0.56; gx <= 0.56; gx += 0.16) {
      addPart(root, new THREE.BoxGeometry(0.024, 0.64, 0.075), M.chrome, gx, 1.08, 3.23);
    }
    addPart(root, new THREE.BoxGeometry(2.34, 0.24, 0.22), M.chrome, 0, 0.52, 3.28);
    addPart(root, new THREE.BoxGeometry(0.18, 0.07, 0.06), M.strobeRed, -0.58, 0.54, 3.38);
    addPart(root, new THREE.BoxGeometry(0.18, 0.07, 0.06), M.strobeBlue, 0.58, 0.54, 3.38);

    // Cab sun visor above windshield with 5 amber clearance LEDs
    addPart(root, new THREE.BoxGeometry(1.94, 0.09, 0.26), M.chrome, 0, 2.48, 1.62, 0.22, 0, 0);
    for (let mx = -0.64; mx <= 0.64; mx += 0.32) {
      addPart(root, new THREE.BoxGeometry(0.08, 0.035, 0.05), M.glowAmber, mx, 2.53, 1.68);
    }

    // Dual vertical chrome exhaust stacks behind cab with perforated heat shields & curved top tips
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.CylinderGeometry(0.062, 0.062, 1.85, 14), M.chrome, sx * 1.02, 1.98, 0.12);
      addPart(root, new THREE.CylinderGeometry(0.082, 0.082, 1.1, 14, 1, true), M.alloy, sx * 1.02, 1.72, 0.12);
      addPart(root, new THREE.TorusGeometry(0.09, 0.055, 8, 12, Math.PI * 0.55), M.chrome, sx * 1.02, 2.9, 0.03, 0, Math.PI / 2, 0);
      // Cylindrical side chrome fuel tanks with mounting straps & cab entry steps
      addPart(root, new THREE.CylinderGeometry(0.24, 0.24, 1.12, 16), M.chrome, sx * 0.98, 0.58, 0.65, Math.PI / 2, 0, 0);
      for (const sz of [0.32, 0.98]) {
        addPart(root, new THREE.TorusGeometry(0.246, 0.014, 6, 16), M.darkTrim, sx * 0.98, 0.58, sz);
      }
      addPart(root, new THREE.BoxGeometry(0.18, 0.035, 0.72), M.alloy, sx * 1.08, 0.42, 1.48);
      // Heavy west-coast gantry side mirrors
      addPart(root, new THREE.BoxGeometry(0.1, 0.44, 0.06), M.chrome, sx * 1.24, 1.92, 1.52);
    }

    // Ribbed side cargo/equipment compartment roll-up doors
    for (const sx of [-1, 1]) {
      for (const dz of [-0.65, -1.65, -2.55]) {
        addPart(root, new THREE.BoxGeometry(0.04, 0.88, 0.78), M.alloy, sx * 1.14, 1.18, dz);
        for (let ry = 0.82; ry <= 1.52; ry += 0.1) {
          addPart(root, new THREE.BoxGeometry(0.052, 0.022, 0.74), M.chrome, sx * 1.145, ry, dz);
        }
      }
    }

    // Dual-color emergency roof lightbar + Rooftop extension ladder + Twin cylindrical hose reels
    addPart(root, new THREE.BoxGeometry(1.68, 0.055, 0.28), M.chrome, 0, 2.66, 0.95);
    addPart(root, new THREE.BoxGeometry(0.76, 0.095, 0.24), M.strobeRed, -0.42, 2.72, 0.95);
    addPart(root, new THREE.BoxGeometry(0.76, 0.095, 0.24), M.strobeBlue, 0.42, 2.72, 0.95);

    // Rooftop aluminium extension ladder rack (side rails + 10 rungs)
    const ladY = 2.42;
    for (const lx of [-0.26, 0.26]) {
      addPart(root, new THREE.BoxGeometry(0.045, 0.09, 3.1), M.chrome, lx, ladY, -1.45);
    }
    for (let lz = -2.85; lz <= -0.05; lz += 0.31) {
      addPart(root, new THREE.CylinderGeometry(0.016, 0.016, 0.52, 8), M.alloy, 0, ladY, lz, 0, 0, Math.PI / 2);
    }

    // Twin cylindrical fire hose reels with red hose coils & chrome end flanges
    for (const hz of [-0.45, -1.15]) {
      addPart(root, new THREE.CylinderGeometry(0.24, 0.24, 0.62, 16), M.fireRed, 0, 1.72, hz, 0, 0, Math.PI / 2);
      for (const fx of [-0.32, 0.32]) {
        addPart(root, new THREE.CylinderGeometry(0.28, 0.28, 0.025, 16), M.chrome, fx, 1.72, hz, 0, 0, Math.PI / 2);
      }
    }

    // Rear underride guard bar (Mansfield bar) + license plate recess + dual low exhaust tips
    addPart(root, new THREE.BoxGeometry(2.16, 0.1, 0.1), M.chrome, 0, 0.38, -3.28);
    for (const ux of [-0.72, 0.72]) {
      addPart(root, new THREE.BoxGeometry(0.08, 0.32, 0.08), M.darkTrim, ux, 0.52, -3.26);
    }
    addPart(root, new THREE.BoxGeometry(0.5, 0.16, 0.05), M.plate, 0, 0.64, -3.26);
  }

  // 7. Recursive Body-Shell & Cabin Sculpting across all 11 Vehicle Archetypes
  // (Sloped windshields & backlights, contoured hood/trunk decks, front/rear aero valances,
  //  roof drip rails, bus panoramic window frames & rear destination boards, truck cab aero
  //  roof fairings & trailer kingpin/landing gear legs, pickup inner bed liners & tailgates)
  if (!isHeavy) {
    const isSports = typeId === 'supercar' || arch === 'sports';
    const isSuv = typeId === 'tesla' || arch === 'suv';
    const hoodY = isSports ? 0.72 : isSuv ? 0.92 : 0.86;
    const roofY = bbox.max.y - 0.02;

    // Contoured hood power-dome & twin aerodynamic crease ridges (+Z nose)
    addPart(root, new THREE.BoxGeometry(halfW * 1.18, 0.045, 1.08), M.paint, 0, hoodY, zFront - 0.74, 0.08, 0, 0);
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.04, 0.032, 1.02), M.paint, sx * (halfW * 0.52), hoodY + 0.015, zFront - 0.72, 0.08, 0, 0);
    }

    // Sloped front windshield glass overlay, cowl vent grille & sloped rear backlight glass
    const wsZ = isSports ? 0.78 : 1.05;
    const blZ = isSports ? -1.05 : isSuv ? -1.55 : -1.22;
    addPart(root, new THREE.BoxGeometry(halfW * 1.48, 0.028, 0.16), M.grille, 0, hoodY + 0.03, wsZ + 0.08);
    addPart(root, new THREE.BoxGeometry(halfW * 1.46, 0.52, 0.035), M.glass, 0, hoodY + 0.26, wsZ - 0.16, -0.56, 0, 0);
    addPart(root, new THREE.BoxGeometry(halfW * 1.42, 0.48, 0.035), M.glass, 0, hoodY + 0.25, blZ + 0.14, 0.54, 0, 0);
    addPart(root, new THREE.BoxGeometry(0.46, 0.026, 0.04), M.tail, 0, roofY - 0.04, blZ + 0.32);

    // Contoured rear trunk decklid bevel & integrated aerodynamic lip spoiler (-Z tail)
    addPart(root, new THREE.BoxGeometry(halfW * 1.38, 0.045, 0.58), M.paint, 0, hoodY + 0.04, zRear + 0.42, -0.06, 0, 0);
    addPart(root, new THREE.BoxGeometry(halfW * 1.52, 0.038, 0.11), isSports ? M.darkTrim : M.paint, 0, hoodY + 0.08, zRear + 0.12, -0.18, 0, 0);
    if (isSports) {
      // Raised rear GT wing spoiler on twin pylons + side air intake scoops
      addPart(root, new THREE.BoxGeometry(halfW * 1.66, 0.035, 0.24), M.darkTrim, 0, hoodY + 0.22, zRear + 0.18, 0.12, 0, 0);
      for (const sx of [-1, 1]) {
        addPart(root, new THREE.BoxGeometry(0.035, 0.16, 0.16), M.darkTrim, sx * 0.48, hoodY + 0.14, zRear + 0.18);
        addPart(root, new THREE.BoxGeometry(0.06, 0.24, 0.42), M.grille, sx * (halfW - 0.02), 0.58, -0.42);
      }
    }

    // Front & rear aerodynamic lower valances, chin splitter, rear diffuser & vertical fins
    addPart(root, new THREE.BoxGeometry(halfW * 1.82, 0.045, 0.22), M.darkTrim, 0, 0.24, zFront - 0.08);
    addPart(root, new THREE.BoxGeometry(halfW * 1.76, 0.065, 0.18), isSuv ? M.alloy : M.darkTrim, 0, 0.25, zRear + 0.08);
    for (let fx = -0.45; fx <= 0.45; fx += 0.3) {
      addPart(root, new THREE.BoxGeometry(0.024, 0.08, 0.16), M.darkTrim, fx, 0.25, zRear + 0.06);
    }

    // Sculpted side rocker sill skirts & roof drip rails along both sides
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.065, 0.085, 1.82), M.paint, sx * (halfW - 0.02), 0.31, -0.02);
      addPart(root, new THREE.BoxGeometry(0.075, 0.032, 1.86), M.darkTrim, sx * (halfW - 0.015), 0.26, -0.02);
      addPart(root, new THREE.BoxGeometry(0.028, 0.024, 1.62), M.chrome, sx * (halfW * 0.72), roofY + 0.008, -0.12);
    }
  }

  // Bus panoramic window frames, contoured front roof brow, roof drip rails & rear destination board
  if (typeId === 'bus' || arch === 'bus') {
    // Contoured front roof brow cap & front/rear lower aerodynamic valances
    addPart(root, new THREE.BoxGeometry(2.38, 0.18, 0.42), M.paint, 0, 3.06, 5.12, 0.24, 0, 0);
    addPart(root, new THREE.BoxGeometry(2.46, 0.12, 0.22), M.darkTrim, 0, 0.32, 5.26);
    addPart(root, new THREE.BoxGeometry(2.46, 0.12, 0.22), M.darkTrim, 0, 0.34, -5.26);
    // Rear LED route / destination board in upper rear window
    addPart(root, new THREE.BoxGeometry(1.42, 0.26, 0.06), M.darkTrim, 0, 2.78, -5.29);
    addPart(root, new THREE.BoxGeometry(1.3, 0.18, 0.07), M.glowAmber, 0, 2.78, -5.3);
    // Full-length roof drip rails & panoramic window surround frames
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.038, 0.032, 10.2), M.chrome, sx * 1.25, 3.1, 0);
      addPart(root, new THREE.BoxGeometry(0.048, 0.045, 9.2), M.darkTrim, sx * 1.272, 2.48, -0.2);
      addPart(root, new THREE.BoxGeometry(0.048, 0.045, 9.2), M.darkTrim, sx * 1.272, 1.32, -0.2);
    }
  }

  // Pickup truck inner bed liner, wheel-well tubs, sculpted tailgate & roof drip rails
  if (typeId === 'cybertruck' || arch === 'pickup') {
    // Inner bed liner floor, front bulkhead wall, side bed walls & interior wheel-well tubs
    addPart(root, new THREE.BoxGeometry(1.74, 0.04, 2.18), M.darkTrim, 0, 0.86, -1.68);
    addPart(root, new THREE.BoxGeometry(1.76, 0.44, 0.06), M.darkTrim, 0, 1.08, -0.58);
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.06, 0.44, 2.18), M.darkTrim, sx * 0.88, 1.08, -1.68);
      addPart(root, new THREE.BoxGeometry(0.28, 0.28, 0.78), M.darkTrim, sx * 0.72, 0.98, -1.78);
      addPart(root, new THREE.BoxGeometry(0.028, 0.024, 1.55), M.chrome, sx * 0.82, 1.78, 0.35);
    }
    // Detailed rear tailgate cap, handle bezel, latch & lower step bumper valance
    addPart(root, new THREE.BoxGeometry(1.88, 0.055, 0.09), M.darkTrim, 0, 1.28, -2.84);
    addPart(root, new THREE.BoxGeometry(0.32, 0.09, 0.05), M.darkTrim, 0, 1.12, -2.86);
    addPart(root, new THREE.BoxGeometry(0.2, 0.035, 0.06), M.chrome, 0, 1.12, -2.87);
    addPart(root, new THREE.BoxGeometry(1.96, 0.09, 0.22), M.alloy, 0, 0.32, 2.78);
    addPart(root, new THREE.BoxGeometry(1.96, 0.09, 0.24), M.alloy, 0, 0.34, -2.84);
  }

  // Van & Ambulance contoured hood slope, windshield cowl, roof drip rails & sliding door track
  if (typeId === 'ambulance' || arch === 'ambulance' || arch === 'van') {
    addPart(root, new THREE.BoxGeometry(1.78, 0.05, 0.78), M.paint, 0, 1.24, 2.58, 0.16, 0, 0);
    addPart(root, new THREE.BoxGeometry(1.72, 0.03, 0.16), M.grille, 0, 1.32, 2.18);
    addPart(root, new THREE.BoxGeometry(2.04, 0.09, 0.2), M.darkTrim, 0, 0.34, 3.02);
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.035, 0.03, 4.1), M.chrome, sx * 1.12, 2.74, -0.95);
    }
    // Curb-side sliding cargo door guide track
    addPart(root, new THREE.BoxGeometry(0.04, 0.035, 1.45), M.darkTrim, -1.135, 1.38, -0.25);
  }

  // Truck & Firetruck cab aero roof fairing, contoured hood louvers & trailer kingpin / landing gear legs
  if (typeId === 'tow_truck' || arch === 'truck' || arch === 'firetruck') {
    // Contoured hood center ridge, side engine louvers & cab roof drip rails
    addPart(root, new THREE.BoxGeometry(1.38, 0.055, 1.12), M.paint, 0, 1.54, 2.55, 0.08, 0, 0);
    addPart(root, new THREE.BoxGeometry(2.26, 0.11, 0.22), M.darkTrim, 0, 0.36, 3.24);
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.04, 0.22, 0.52), M.grille, sx * 0.96, 1.28, 2.45);
      addPart(root, new THREE.BoxGeometry(0.035, 0.03, 1.32), M.chrome, sx * 0.98, 2.52, 0.95);
    }
    // Aerodynamic cab roof wind fairing / deflector on commercial trucks
    if (arch === 'truck') {
      addPart(root, new THREE.BoxGeometry(1.82, 0.06, 0.98), M.paint, 0, 2.86, 1.02, 0.42, 0, 0);
      for (const sx of [-1, 1]) {
        addPart(root, new THREE.BoxGeometry(0.05, 0.42, 0.78), M.paint, sx * 0.9, 2.74, 0.88);
      }
    }
    // Fifth-wheel coupling bolster, kingpin & telescopic trailer landing gear legs with sand shoes
    addPart(root, new THREE.CylinderGeometry(0.38, 0.42, 0.08, 14), M.darkTrim, 0, 0.88, -0.45);
    addPart(root, new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), M.chrome, 0, 0.96, -0.45);
    addPart(root, new THREE.CylinderGeometry(0.025, 0.025, 1.36, 8), M.darkTrim, 0, 0.48, -0.35, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) {
      addPart(root, new THREE.BoxGeometry(0.09, 0.62, 0.09), M.darkTrim, sx * 0.68, 0.52, -0.35);
      addPart(root, new THREE.BoxGeometry(0.22, 0.035, 0.26), M.alloy, sx * 0.68, 0.21, -0.35);
    }
  }
}

// Tags read from mesh.userData, then material.userData (set by the hero builders):
//   paintWeight  0..1 share of the per-instance paint colour (1 = main body paint)
//   emitCode     1 head lamp, 2 tail lamp, 3 always-lit glow, 4 / 5 strobe phase A / B
//   lodColor     flat colour for textured materials (LED signs)
//   lodSkip      leave the mesh out
// A geometry `color` attribute (baked liveries, checker bands) overrides the material colour.
export function flattenVehicle(typeId, options = {}) {
  const lodOpts = { ...options, lod: true };
  const built = HEAVY_VEHICLE_IDS.has(typeId) ? buildHeavyVehicle(typeId, lodOpts) : buildHeroVehicle(typeId, lodOpts);
  const lb = built.lightbarParts;
  if (lb) {
    for (const m of lb.phaseAMeshes) m.userData.emitCode = 4;
    for (const m of lb.phaseBMeshes) m.userData.emitCode = 5;
  }
  addFineVehicleDetails(built, typeId, options);
  const model = built.group;
  model.updateMatrixWorld(true);
  const pos = [], nor = [], col = [], paint = [], emit = [], kind = [], seat = [];
  const gPos = [], gNor = [], gCol = []; // [drivers] glass goes to its own see-through instanced mesh
  const tmpN = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
    const mat = o.material, ud = mat.userData || {};
    if (o.userData.lodSkip || ud.lodSkip) return;
    const em = o.userData.emitCode ?? ud.emitCode ?? (mat.isMeshBasicMaterial ? 3 : 0);
    const pw = o.userData.paintWeight ?? ud.paintWeight ?? 0;
    if (ud.lodColor != null) c.set(ud.lodColor);
    else if (em === 1) c.set(HEAD_HEX);
    else if (em === 2) c.set(TAIL_HEX);
    else if (mat.color) c.copy(mat.color);
    else c.set(0x888888);
    // CRITICAL NORMAL FIX: compute smooth analytical normals on indexed curved geometries BEFORE .toNonIndexed()
    if (o.geometry.index && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, vc = g.attributes.color;
    tmpN.getNormalMatrix(o.matrixWorld);
    const kd = ud.lodKind || 0, st = o.userData.lodSeat ?? -1;
    if (kd === 1) {
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        gPos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(n, i).applyMatrix3(tmpN).normalize();
        gNor.push(v.x, v.y, v.z);
        gCol.push(c.r, c.g, c.b);
      }
      g.dispose();
      return;
    }
    for (let i = 0; i < p.count; i++) {
      kind.push(kd);
      seat.push(st);
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(tmpN).normalize();
      nor.push(v.x, v.y, v.z);
      if (vc) col.push(vc.getX(i), vc.getY(i), vc.getZ(i));
      else col.push(c.r, c.g, c.b);
      paint.push(pw);
      emit.push(em);
    }
    g.dispose();
  });
  // The low-detail build is never cached, so everything it made can go.
  model.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    }
  });
  const geom = indexed(pos, nor, col, paint, emit, kind, seat);
  const glass = new THREE.BufferGeometry();
  glass.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
  glass.setAttribute('normal', new THREE.Float32BufferAttribute(gNor, 3));
  glass.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3));
  glass.computeBoundingSphere();
  return { geom, glass };
}

// Weld identical vertices into an indexed geometry: smooth lofted bodies share most corners, so the
// vertex shader runs far fewer times per instance than on the triangle soup.
function indexed(pos, nor, col, paint, emit, kind, seat) {
  const map = new Map(), index = [];
  const P = [], N = [], C = [], A = [], E = [], K = [], S = [];
  const q = (v, s) => Math.round(v * s);
  for (let i = 0; i < pos.length / 3; i++) {
    const i3 = i * 3;
    const key = `${q(pos[i3], 1e4)},${q(pos[i3 + 1], 1e4)},${q(pos[i3 + 2], 1e4)},${q(nor[i3], 500)},${q(nor[i3 + 1], 500)},${q(nor[i3 + 2], 500)},${q(col[i3], 500)},${q(col[i3 + 1], 500)},${q(col[i3 + 2], 500)},${paint[i]},${emit[i]},${kind[i]},${seat[i]}`;
    let k = map.get(key);
    if (k === undefined) {
      k = P.length / 3;
      map.set(key, k);
      P.push(pos[i3], pos[i3 + 1], pos[i3 + 2]); N.push(nor[i3], nor[i3 + 1], nor[i3 + 2]); C.push(col[i3], col[i3 + 1], col[i3 + 2]);
      A.push(paint[i]); E.push(emit[i]); K.push(kind[i]); S.push(seat[i]);
    }
    index.push(k);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geom.setAttribute('aPaint', new THREE.Float32BufferAttribute(A, 1));
  geom.setAttribute('aEmit', new THREE.Float32BufferAttribute(E, 1));
  geom.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1));
  geom.setAttribute('aSeat', new THREE.Float32BufferAttribute(S, 1));
  geom.setIndex(index);
  geom.computeBoundingSphere();
  return geom;
}

export const CAR_TYPES = [
  { id: 'sedan', base: 'taxi', options: { hideTaxiSign: true, archetype: 'sedan' }, length: 4.5, width: 1.9 },
  { id: 'taxi', base: 'taxi', options: { archetype: 'taxi' }, length: 4.5, width: 1.9 },
  { id: 'coupe', base: 'supercar', options: { archetype: 'sports' }, length: 4.6, width: 2.05 },
  { id: 'police', base: 'police', options: { archetype: 'police' }, length: 4.7, width: 1.96 },
  { id: 'bus', base: 'bus', options: { archetype: 'bus' }, length: 10.6, width: 2.55 },
  { id: 'tesla', base: 'tesla', options: { archetype: 'suv' }, length: 4.97, width: 1.96, roughness: 0.22, metalness: 0.58 },
  { id: 'cybertruck', base: 'cybertruck', options: { archetype: 'pickup' }, length: 5.68, width: 2.20, roughness: 0.24, metalness: 0.84 },
  { id: 'ambulance', base: 'ambulance', options: { archetype: 'ambulance' }, length: 6.10, width: 2.26 },
  { id: 'tow_truck', base: 'tow_truck', options: { archetype: 'firetruck' }, length: 6.40, width: 2.32 },
];

// All 11 canonical vehicle archetypes (sedan, suv, sports, pickup, van, truck, bus, taxi, police, ambulance, firetruck)
export const VEHICLE_ARCHETYPE_SPECS = {
  sedan: { base: 'taxi', options: { hideTaxiSign: true, archetype: 'sedan' } },
  suv: { base: 'tesla', options: { archetype: 'suv' } },
  sports: { base: 'supercar', options: { archetype: 'sports' } },
  pickup: { base: 'cybertruck', options: { archetype: 'pickup' } },
  van: { base: 'ambulance', options: { archetype: 'van' } },
  truck: { base: 'tow_truck', options: { archetype: 'truck' } },
  bus: { base: 'bus', options: { archetype: 'bus' } },
  taxi: { base: 'taxi', options: { archetype: 'taxi' } },
  police: { base: 'police', options: { archetype: 'police' } },
  ambulance: { base: 'ambulance', options: { archetype: 'ambulance' } },
  firetruck: { base: 'tow_truck', options: { archetype: 'firetruck' } },
};

export function buildVehicleArchetype(archetype = 'sedan') {
  const spec = VEHICLE_ARCHETYPE_SPECS[archetype] || VEHICLE_ARCHETYPE_SPECS.sedan;
  const { geom, glass } = flattenVehicle(spec.base, spec.options);
  geom.geom = geom;
  geom.body = geom;
  geom.glass = glass;
  return geom;
}

export const VEHICLE_BUILDERS = {
  sedan: () => buildVehicleArchetype('sedan'),
  suv: () => buildVehicleArchetype('suv'),
  sports: () => buildVehicleArchetype('sports'),
  pickup: () => buildVehicleArchetype('pickup'),
  van: () => buildVehicleArchetype('van'),
  truck: () => buildVehicleArchetype('truck'),
  bus: () => buildVehicleArchetype('bus'),
  taxi: () => buildVehicleArchetype('taxi'),
  police: () => buildVehicleArchetype('police'),
  ambulance: () => buildVehicleArchetype('ambulance'),
  firetruck: () => buildVehicleArchetype('firetruck'),
};

export function buildAllVehicleArchetypes() {
  const out = {};
  for (const [k, fn] of Object.entries(VEHICLE_BUILDERS)) out[k] = fn();
  return out;
}

// [drivers] Per-car / per-seat occupants and burnt wrecks, shared by the car and glass shaders.
// Seed: from the car's paint when it has one (stable per car), else the instance slot (fixed liveries).
const OCC_GLSL = `
float occHash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
float occSeed(vec4 paint, float useId) {
  float s = dot(floor(paint.rgb * 255.0 + 0.5), vec3(1.0, 257.0, 65537.0)) * 0.000123;
  return fract(s * 7.31 + occHash(s) + useId * float(gl_InstanceID) * 0.61803);
}
`;
const BURN_GLSL = `
float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bHash(i), bHash(i + vec3(1, 0, 0)), f.x), mix(bHash(i + vec3(0, 1, 0)), bHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bHash(i + vec3(0, 0, 1)), bHash(i + vec3(1, 0, 1)), f.x), mix(bHash(i + vec3(0, 1, 1)), bHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Burnt-out car: soot-black shell with rust blooms, grey-white ash on the hot upper panels, a scorched trace
// of the paint low on the doors, charred tyres on rusty steel rims, a black gutted cabin.
vec3 burnt(vec3 p, float kind, vec3 paint) {
  float n = bNoise(p * 2.3) * 0.6 + bNoise(p * 6.7 + 3.1) * 0.4;
  float h = clamp((p.y - 0.25) / 1.1, 0.0, 1.0);
  vec3 soot = vec3(0.026, 0.024, 0.022), rustD = vec3(0.1, 0.048, 0.026), rust = vec3(0.27, 0.115, 0.048), ash = vec3(0.34, 0.33, 0.31);
  if (kind > 1.5 && kind < 2.5) return mix(vec3(0.035, 0.03, 0.028), rustD * 0.8, smoothstep(0.55, 0.8, n));
  if (kind > 2.5 && kind < 3.5) return mix(vec3(0.16, 0.14, 0.12), rust * 0.7, smoothstep(0.4, 0.75, n));
  if (kind > 6.5 && kind < 8.5) return soot * (0.8 + 0.6 * n);
  vec3 c = mix(soot, rustD, smoothstep(0.42, 0.66, n));
  c = mix(c, rust, smoothstep(0.64, 0.82, n) * (0.3 + 0.7 * h));
  c = mix(c, ash, smoothstep(0.45, 0.95, h) * smoothstep(0.42, 0.7, bNoise(p * 3.7 + 9.0)) * 0.85);
  c = mix(c, paint * 0.32, (1.0 - smoothstep(0.1, 0.45, h)) * smoothstep(0.45, 0.65, bNoise(p * 2.9 + 17.0)) * 0.8);
  return c;
}
`;

// [drivers] Burnt material for a cloned hero wreck (vehicle_damage.js): same burn shading in mesh space.
// kind: 0 body, 2 tyre, 3 bright metal, 7 interior.
export function createBurntMaterial(kind = 0) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: kind === 3 ? 0.5 : 0.08 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLocal;\n${BURN_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb = burnt(vLocal, ${kind.toFixed(1)}, vec3(0.25));`);
  };
  mat.customProgramCacheKey = () => `we-burnt-v1-${kind}`;
  return mat;
}

export function createCarMaterial(uniforms, matOpts = {}) {
  const roughness = matOpts.roughness != null ? matOpts.roughness : 0.42;
  const metalness = matOpts.metalness != null ? matOpts.metalness : 0.35;
  const useId = matOpts.idSeed ? 1 : 0;
  const parked = matOpts.parked ? 1 : 0; // [drivers] parked cars (venues) are empty
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = uniforms.uLights;
    shader.uniforms.uStrobeTime = uStrobeTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aPaint;
attribute float aEmit;
attribute float aKind;
attribute float aSeat;
attribute vec4 iPaint;
attribute float iBrake;
varying float vEmit;
varying float vBrake;
varying float vChar;
varying float vKind;
varying vec3 vLocal;
varying vec3 vPaint;
${OCC_GLSL}
const vec3 SKINS[6] = vec3[6](vec3(0.86, 0.66, 0.53), vec3(0.78, 0.56, 0.42), vec3(0.62, 0.42, 0.29), vec3(0.45, 0.29, 0.19), vec3(0.3, 0.19, 0.12), vec3(0.9, 0.73, 0.6));
const vec3 HAIRS[5] = vec3[5](vec3(0.05, 0.04, 0.03), vec3(0.12, 0.08, 0.05), vec3(0.3, 0.2, 0.11), vec3(0.6, 0.48, 0.3), vec3(0.5, 0.49, 0.47));
const vec3 SHIRTS[10] = vec3[10](vec3(0.85, 0.85, 0.83), vec3(0.08, 0.08, 0.09), vec3(0.12, 0.17, 0.32), vec3(0.55, 0.1, 0.1), vec3(0.3, 0.42, 0.26), vec3(0.45, 0.47, 0.5), vec3(0.62, 0.72, 0.85), vec3(0.75, 0.6, 0.35), vec3(0.2, 0.45, 0.48), vec3(0.42, 0.25, 0.45));`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vLocal = position;
  vKind = aKind;
  if (aSeat > -0.5) {
    float prob = aSeat < 0.5 ? 1.0 : aSeat < 1.5 ? 0.35 : aSeat < 2.5 ? 0.25 : aSeat < 3.5 ? 0.5 : 1.0;
    if (seatSeed >= prob || iBrake < -0.9 || ${parked} == 1) transformed = vec3(0.0, 0.5, 0.0); // empty seat / wreck / parked
  }`
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  float seed = occSeed(iPaint, ${useId}.0);
  float seatSeed = occHash(seed * 31.7 + aSeat * 7.13);
  vPaint = mix(vColor.rgb, iPaint.rgb, step(0.01, aPaint) * iPaint.a);
  vColor.rgb = mix(vColor.rgb, iPaint.rgb * (aPaint > 0.85 ? 1.0 : 0.8), step(0.01, aPaint) * iPaint.a);
  if (aKind > 3.5 && aKind < 6.5 || aKind > 9.5) {
    float hs = occHash(seatSeed * 91.3);
    vec3 skin = SKINS[int(hs * 5.99)];
    vec3 shirt = SHIRTS[int(occHash(seatSeed * 17.9) * 9.99)];
    vColor.rgb = aKind < 4.5 ? shirt : aKind < 5.5 ? skin : aKind < 6.5 ? HAIRS[int(occHash(seatSeed * 5.3) * 4.99)] : (occHash(seatSeed * 3.7) < 0.55 ? skin : shirt);
  } else if (aKind > 8.5 && aKind < 9.5) {
    vColor.rgb = vec3(0.07, 0.09, 0.16); // police uniform and cap
  }
  vChar = clamp(-iBrake, 0.0, 1.0);
  vEmit = vChar > 0.9 ? 0.0 : aEmit;
  vBrake = max(iBrake, 0.0);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uLights;
uniform float uStrobeTime;
varying float vEmit;
varying float vBrake;
varying float vChar;
varying float vKind;
varying vec3 vLocal;
varying vec3 vPaint;
${BURN_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  if (vChar > 0.01) diffuseColor.rgb = mix(diffuseColor.rgb, burnt(vLocal, vKind, vPaint), smoothstep(0.0, 0.9, vChar));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.93, vChar);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, vKind > 2.5 && vKind < 3.5 ? 0.5 : 0.08, vChar);`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  {
    float eHead = step(0.5, vEmit) * step(vEmit, 1.5);
    float eTail = step(1.5, vEmit) * step(vEmit, 2.5);
    float eGlow = step(2.5, vEmit) * step(vEmit, 3.5);
    float eStrobeA = step(3.5, vEmit) * step(vEmit, 4.5) * (0.25 + 2.2 * step(0.0, sin(uStrobeTime * 14.0)));
    float eStrobeB = step(4.5, vEmit) * (0.25 + 2.2 * step(0.0, -sin(uStrobeTime * 14.0)));
    totalEmissiveRadiance += diffuseColor.rgb * (eHead * (0.3 + uLights * 2.6) + eTail * (0.25 + uLights * 1.1 + vBrake * 1.8) + eGlow * (0.35 + uLights * 0.9) + eStrobeA + eStrobeB);
  }`
      );
  };
  mat.customProgramCacheKey = () => `we-traffic-car-v4-${roughness}-${metalness}-${useId}-${parked}`;
  return mat;
}

// [drivers] See-through tinted glass: dark tint, sky/street reflection by fresnel (dimmer at night), more
// opaque at grazing angles. Burning cars smoke the glass up; wrecks lose it (broken out).
export function createCarGlassMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x0c1318, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.4, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLights = uniforms.uLights;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iBrake;\nvarying float vChar;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vChar = clamp(-iBrake, 0.0, 1.0);\n  if (vChar > 0.9) transformed = vec3(0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying float vChar;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  {
    vec3 V = normalize(vViewPosition);
    float fr = pow(1.0 - abs(dot(normalize(vNormal), V)), 3.0);
    float sky = clamp(0.5 + 0.5 * reflect(-V, normalize(vNormal)).y, 0.0, 1.0);
    vec3 refl = mix(vec3(0.16, 0.17, 0.18), vec3(0.55, 0.66, 0.78), sky) * (1.0 - 0.85 * uLights);
    gl_FragColor.rgb += refl * (0.18 + 0.7 * fr);
    gl_FragColor.a = mix(0.38 + 0.5 * fr, 0.92, vChar);
    gl_FragColor.rgb *= 1.0 - 0.8 * vChar;
  }`
      );
  };
  mat.customProgramCacheKey = () => 'we-traffic-glass-v1';
  return mat;
}

const ID_SEED = new Set(['taxi', 'police', 'bus', 'ambulance', 'tow_truck']);

const GLASS_MATS = new WeakMap();
/**
 * [drivers] Give an instanced car mesh its see-through glass: a child InstancedMesh sharing the car's instance
 * matrices and iBrake (char), drawn after the opaques with the car's instance count.
 */
export function attachCarGlass(mesh, glassGeo, iBrake, uniforms, mat = null) {
  if (!glassGeo || !glassGeo.attributes.position.count) return null;
  if (!mat) {
    mat = GLASS_MATS.get(uniforms);
    if (!mat) { mat = createCarGlassMaterial(uniforms); GLASS_MATS.set(uniforms, mat); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', glassGeo.attributes.position);
  geo.setAttribute('normal', glassGeo.attributes.normal);
  geo.setAttribute('iBrake', iBrake);
  const gm = new THREE.InstancedMesh(geo, mat, mesh.instanceMatrix.count);
  gm.instanceMatrix = mesh.instanceMatrix;
  gm.count = 0;
  gm.frustumCulled = false;
  gm.castShadow = false;
  gm.receiveShadow = false;
  gm.renderOrder = 1;
  gm.name = `${mesh.name}_glass`;
  gm.onBeforeRender = () => { gm.count = mesh.count; };
  mesh.add(gm);
  return gm;
}

export function createCarMeshes(capacity, uniforms) {
  const baseMat = createCarMaterial(uniforms);
  const idMat = createCarMaterial(uniforms, { idSeed: true });
  const glassMat = createCarGlassMaterial(uniforms);
  return CAR_TYPES.map((t) => {
    const { geom, glass } = flattenVehicle(t.base, t.options);
    const iPaint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const iBrake = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    iPaint.setUsage(THREE.DynamicDrawUsage);
    iBrake.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('iPaint', iPaint);
    geom.setAttribute('iBrake', iBrake);
    const mat = t.metalness != null ? createCarMaterial(uniforms, t) : ID_SEED.has(t.id) ? idMat : baseMat;
    const mesh = new THREE.InstancedMesh(geom, mat, capacity);
    mesh.onBeforeRender = () => {
      uStrobeTime.value = performance.now() * 0.001;
    };
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `traffic_${t.id}`;
    attachCarGlass(mesh, glass, iBrake, uniforms, glassMat);
    return { type: t, mesh, iPaint, iBrake, glassGeo: glass };
  });
}

// ---------------- Pedestrians ----------------
// Shared person model (src/features/person_model.js): sculpted head with face, hair grown from the scalp,
// lofted limbs split at knee/elbow, hands, shoes; optional backpack/bag/cap/glasses/coat/skirt/umbrella/
// phone toggled per instance by a style bitmask (disabled parts collapse to a degenerate point). The walk,
// run and idle poses are computed in the vertex shader from iAnim/iGait (see PERSON_ANIM_GLSL).
// lod 0 = near figure, lod 1 = far figure (same shader and instance layout, fewer triangles).
const PED_GEO_CACHE = new Map();
function createPedGeometry(lod) {
  const pos = [], nor = [], col = [], info = [], idx = [];
  for (const pt of personParts({ indexed: true, lod })) {
    const g = pt.geom;
    const p = g.attributes.position, n = g.attributes.normal;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(pt.rgb[0], pt.rgb[1], pt.rgb[2]);
      info.push(pt.part, pt.mat, pt.opt, pt.joint);
    }
    if (g.index) for (const i of g.index.array) idx.push(base + i);
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    g.dispose();
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  geom.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geom.computeBoundingSphere();
  return geom;
}

let pedMaterial = null;
function createPedMaterial() {
  if (pedMaterial) return pedMaterial;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aInfo;
attribute vec3 iAnim;
attribute vec4 iGait;
attribute vec3 iShirt;
attribute vec3 iPants;
attribute vec3 iSkin;
attribute vec3 iHair;
attribute vec3 iAcc;
${PERSON_COMMON_GLSL}`
      )
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${PERSON_ANIM_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PERSON_BEGIN_GLSL}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${PERSON_COLOR_GLSL}`);
  };
  mat.customProgramCacheKey = () => 'we-traffic-ped-v3';
  pedMaterial = mat;
  return mat;
}

export function createPedMesh(capacity, lod = 0) {
  let base = PED_GEO_CACHE.get(lod);
  if (!base) { base = createPedGeometry(lod); PED_GEO_CACHE.set(lod, base); }
  // Per-mesh geometry wrapper sharing the static vertex buffers, with its own instance attributes.
  const geom = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aInfo']) geom.setAttribute(k, base.attributes[k]);
  geom.setIndex(base.index);
  geom.boundingSphere = base.boundingSphere;
  const mk = (n) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  // iAnim = (gait phase, amplitude, style bits); iGait = (stride, arm swing, idle mode + posture, clock)
  const iAnim = mk(3), iGait = mk(4), iShirt = mk(3), iPants = mk(3), iSkin = mk(3), iHair = mk(3), iAcc = mk(3);
  geom.setAttribute('iAnim', iAnim);
  geom.setAttribute('iGait', iGait);
  geom.setAttribute('iShirt', iShirt);
  geom.setAttribute('iPants', iPants);
  geom.setAttribute('iSkin', iSkin);
  geom.setAttribute('iHair', iHair);
  geom.setAttribute('iAcc', iAcc);
  const mesh = new THREE.InstancedMesh(geom, createPedMaterial(), capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = lod ? 'traffic_pedestrians_far' : 'traffic_pedestrians';
  return { mesh, geometry: geom, iAnim, iGait, iShirt, iPants, iSkin, iHair, iAcc, tris: base.index.count / 3 };
}

export const RAGDOLL_PART_NAMES = RAGDOLL_PART_SPECS.map((s) => s.name);

export function createPedPartMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aSlot;\nattribute vec3 iColA;\nattribute vec3 iColB;'
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  {
    vColor.rgb = aSlot < 0.5 ? vColor.rgb : (aSlot < 1.5 ? iColA : iColB);
  }`
      );
  };
  mat.customProgramCacheKey = () => 'we-traffic-ped-ragdoll-part-v1';
  return mat;
}

export function createPedPartMeshes(capacity) {
  const geoms = createRagdollPartGeometries();
  const mat = createPedPartMaterial();
  const out = {};
  for (const spec of RAGDOLL_PART_SPECS) {
    const geom = geoms[spec.name];
    const iColA = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    const iColB = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    iColA.setUsage(THREE.DynamicDrawUsage);
    iColB.setUsage(THREE.DynamicDrawUsage);
    geom.setAttribute('iColA', iColA);
    geom.setAttribute('iColB', iColB);
    const mesh = new THREE.InstancedMesh(geom, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `traffic_ped_part_${spec.name}`;
    mesh.iColA = iColA;
    mesh.iColB = iColB;
    mesh.mesh = mesh;
    mesh.spec = spec;
    out[spec.name] = mesh;
  }
  out.leftArm = out.armL;
  out.rightArm = out.armR;
  out.leftLeg = out.legL;
  out.rightLeg = out.legR;
  return out;
}

export function createImpactPuffMesh(capacity = 128) {
  const geom = new THREE.DodecahedronGeometry(0.16, 0);
  geom.computeVertexNormals();
  const n = geom.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = 0.85; col[i * 3 + 1] = 0.81; col[i * 3 + 2] = 0.76; }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd8cfc2,
    roughness: 0.9,
    metalness: 0.0,
    transparent: true,
    opacity: 0.82,
  });
  const mesh = new THREE.InstancedMesh(geom, mat, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'traffic_ped_impact_puffs';
  return mesh;
}
