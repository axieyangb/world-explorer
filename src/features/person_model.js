// Shared low-poly person model (pedestrians + player walk avatar). Depends only on THREE.
// Local frame: +Z forward (face, shoe toes, cap brim), +Y up, feet at y = 0.
// Every part carries: part (animation group), mat (color slot), opt (optional style bit, 0 = always).
import * as THREE from '../../vendor/three.module.js';

export const PART = { STATIC: 0, LLEG: 1, RLEG: 2, LARM: 3, RARM: 4 };
export const MAT = { SKIN: 0, TOP: 1, PANTS: 2, FIXED: 3, HAIR: 4, ACC: 5 };
// Optional parts; style bitmask bit = 1 << (opt - 1).
export const OPT = {
  HAIR_SHORT: 1, HAIR_LONG: 2, PONYTAIL: 3, CAP: 4, GLASSES: 5, BACKPACK: 6,
  BAG: 7, UMBRELLA: 8, COAT: 9, VNECK: 10, ZIPPER: 11, BEARD: 12,
};
export const bit = (opt) => 1 << (opt - 1);
export const HIP_Y = 0.9;
export const SHOULDER_Y = 1.45;

const HEAD_Y = 1.6;
const DARK = [0.06, 0.05, 0.05];
const WHITE = [0.93, 0.92, 0.9];

function geo(g, x, y, z) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.translate(x, y, z);
  return n;
}
const box = (w, h, d, x, y, z) => geo(new THREE.BoxGeometry(w, h, d), x, y, z);
const quad = (w, h, x, y, z) => geo(new THREE.PlaneGeometry(w, h), x, y, z); // faces +Z

/** Returns [{ geom, part, mat, opt, rgb }] (non-indexed geometries). */
export function personParts() {
  const P = [];
  const add = (geom, part, mat, opt = 0, rgb = DARK) => P.push({ geom, part, mat, opt, rgb });

  // Head: rounded, slightly tall.
  const head = new THREE.SphereGeometry(0.115, 8, 6);
  head.scale(0.9, 1.1, 1.0);
  add(geo(head, 0, HEAD_Y, 0), PART.STATIC, MAT.SKIN);
  // Face (front only): eye whites + pupils, brows, nose, mouth.
  for (const sx of [-0.04, 0.04]) {
    add(quad(0.034, 0.022, sx, HEAD_Y + 0.018, 0.112), PART.STATIC, MAT.FIXED, 0, WHITE);
    add(quad(0.016, 0.019, sx, HEAD_Y + 0.017, 0.1145), PART.STATIC, MAT.FIXED, 0, DARK);
    add(quad(0.038, 0.009, sx, HEAD_Y + 0.046, 0.111), PART.STATIC, MAT.HAIR);
  }
  add(box(0.026, 0.042, 0.032, 0, HEAD_Y - 0.005, 0.108), PART.STATIC, MAT.SKIN);
  add(quad(0.044, 0.01, 0, HEAD_Y - 0.048, 0.107), PART.STATIC, MAT.FIXED, 0, [0.5, 0.2, 0.2]);
  // Glasses (dark lenses + bridge).
  for (const sx of [-0.04, 0.04]) add(quad(0.044, 0.032, sx, HEAD_Y + 0.017, 0.118), PART.STATIC, MAT.FIXED, OPT.GLASSES, [0.08, 0.09, 0.1]);
  add(quad(0.04, 0.007, 0, HEAD_Y + 0.025, 0.118), PART.STATIC, MAT.FIXED, OPT.GLASSES, [0.08, 0.09, 0.1]);
  // Beard.
  add(box(0.15, 0.06, 0.06, 0, HEAD_Y - 0.07, 0.07), PART.STATIC, MAT.HAIR, OPT.BEARD);

  // Hair: top cap + back panel (back of head reads as hair).
  const cap = new THREE.SphereGeometry(0.124, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.4);
  cap.scale(0.94, 1.08, 1.04);
  add(geo(cap, 0, HEAD_Y + 0.006, -0.008), PART.STATIC, MAT.HAIR, OPT.HAIR_SHORT);
  const back = new THREE.SphereGeometry(0.123, 6, 3, Math.PI, Math.PI, Math.PI * 0.32, Math.PI * 0.38);
  back.scale(0.94, 1.1, 1.06);
  add(geo(back, 0, HEAD_Y, -0.004), PART.STATIC, MAT.HAIR, OPT.HAIR_SHORT);
  add(box(0.23, 0.32, 0.07, 0, HEAD_Y - 0.12, -0.085), PART.STATIC, MAT.HAIR, OPT.HAIR_LONG);
  add(box(0.07, 0.22, 0.07, 0, HEAD_Y - 0.06, -0.15), PART.STATIC, MAT.HAIR, OPT.PONYTAIL);
  // Cap with a forward brim.
  add(geo(new THREE.CylinderGeometry(0.122, 0.13, 0.08, 8), 0, HEAD_Y + 0.085, -0.005), PART.STATIC, MAT.ACC, OPT.CAP);
  add(box(0.2, 0.02, 0.13, 0, HEAD_Y + 0.055, 0.15), PART.STATIC, MAT.ACC, OPT.CAP);

  // Torso + front cues.
  add(box(0.4, 0.56, 0.22, 0, 1.18, 0), PART.STATIC, MAT.TOP);
  const v = new THREE.BufferGeometry();
  v.setAttribute('position', new THREE.Float32BufferAttribute([-0.075, 1.455, 0.111, 0, 1.35, 0.111, 0.075, 1.455, 0.111], 3));
  v.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  add(v, PART.STATIC, MAT.SKIN, OPT.VNECK);
  add(quad(0.016, 0.54, 0, 1.18, 0.111), PART.STATIC, MAT.FIXED, OPT.ZIPPER, [0.16, 0.16, 0.18]);
  add(box(0.21, 0.05, 0.16, 0, 1.47, 0.005), PART.STATIC, MAT.TOP, OPT.ZIPPER);
  add(box(0.38, 0.12, 0.21, 0, 0.87, 0), PART.STATIC, MAT.PANTS);
  add(box(0.42, 0.34, 0.235, 0, 0.75, 0), PART.STATIC, MAT.TOP, OPT.COAT);
  // Backpack (back) / shoulder bag (side + diagonal strap).
  add(box(0.3, 0.36, 0.13, 0, 1.2, -0.175), PART.STATIC, MAT.ACC, OPT.BACKPACK);
  add(box(0.07, 0.24, 0.26, -0.3, 0.86, 0.02), PART.STATIC, MAT.ACC, OPT.BAG);
  const strap = new THREE.BoxGeometry(0.035, 0.72, 0.232);
  strap.rotateZ(-0.62);
  add(geo(strap, 0.0, 1.18, 0), PART.STATIC, MAT.ACC, OPT.BAG);
  // Umbrella (held in the raised right hand).
  add(box(0.02, 0.95, 0.02, 0.27, 1.6, 0.42), PART.STATIC, MAT.FIXED, OPT.UMBRELLA, [0.15, 0.15, 0.16]);
  add(geo(new THREE.ConeGeometry(0.62, 0.24, 8), 0.2, 2.15, 0.26), PART.STATIC, MAT.ACC, OPT.UMBRELLA);

  // Legs + shoes (toes forward).
  for (const [sx, part] of [[-0.1, PART.LLEG], [0.1, PART.RLEG]]) {
    add(box(0.145, 0.8, 0.155, sx, 0.47, 0), part, MAT.PANTS);
    add(box(0.13, 0.085, 0.28, sx, 0.0425, 0.06), part, MAT.FIXED, 0, [0.12, 0.12, 0.13]);
  }
  // Arms + hands.
  for (const [sx, part] of [[-0.265, PART.LARM], [0.265, PART.RARM]]) {
    add(box(0.1, 0.5, 0.11, sx, 1.2, 0), part, MAT.TOP);
    add(box(0.085, 0.09, 0.09, sx, 0.91, 0.005), part, MAT.SKIN);
  }
  return P;
}

// ---------------- appearance ----------------
const C = (h) => new THREE.Color(h);
const pick = (a) => a[(Math.random() * a.length) | 0];
const TOPS = {
  cold: [0x1b1f2a, 0x2f3542, 0x4a4e57, 0x6b4f3a, 0xa47148, 0x3b4a3a, 0x7a1f2b, 0x222222, 0x8a8f99, 0x1d3557].map(C),
  mild: [0x2b2d42, 0x8d99ae, 0xedf2f4, 0xd90429, 0x264653, 0x2a9d8f, 0xe9c46a, 0x1d3557, 0x6d597a, 0x3a3a3a, 0xffffff, 0x588157].map(C),
  warm: [0xffffff, 0xf1faee, 0xa8dadc, 0xffd166, 0xef476f, 0x06d6a0, 0x8ecae6, 0xffb4a2, 0xe9edc9, 0x457b9d, 0xf4a261].map(C),
};
const PANTS = [0x1b1b1e, 0x22223b, 0x2f3e46, 0x3d405b, 0x4a4e69, 0x5c4033, 0xa39171, 0x14213d, 0x335c81].map(C);
const PANTS_WARM = [0xe9e4d4, 0xa39171, 0x335c81, 0x2f3e46, 0xc2b280, 0x1b1b1e].map(C);
const HAIR = { asia: [0x0d0b0a, 0x0d0b0a, 0x0d0b0a, 0x1c1410, 0x2a1d15, 0x5a3c26], africa: [0x0b0a09, 0x14100d], any: [0x0d0b0a, 0x2a1d15, 0x4a3020, 0x7a5230, 0xc8a165, 0x8a3b1e] };
const GRAY = [0x9a9a9a, 0xc9c9c9, 0x6e6e6e].map(C);
const SKIN = {
  asia: [0xf1d3b3, 0xeac4a0, 0xe0b48f, 0xf5d7bd],
  africa: [0x8d5524, 0x6b3e1f, 0x5a3418, 0xa0673a],
  south: [0xc68642, 0xa86b3c, 0xd8a26e, 0x8d5524],
  any: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf5cfa0, 0xead0b8],
};
const ACC = [0x111111, 0x2b2d42, 0x1d3557, 0x7a1f2b, 0x3b4a3a, 0x6b4f3a, 0xb3261e, 0xe9c46a, 0x8d99ae].map(C);

function region(lat, lon) {
  if (lat > 18 && lat < 46 && lon > 95 && lon < 146) return 'asia';
  if (lat > -35 && lat < 15 && lon > -18 && lon < 52) return 'africa';
  if (lat > 5 && lat < 35 && lon > 60 && lon < 95) return 'south';
  return 'any';
}

/** Random appearance for a pedestrian at the given world origin. */
export function randomPersonLook(lat = 40, lon = 0) {
  const absLat = Math.abs(Number(lat) || 0);
  const climate = absLat > 45 ? 'cold' : absLat < 26 ? 'warm' : 'mild';
  const reg = region(lat, lon);
  const female = Math.random() < 0.5;
  const older = Math.random() < 0.13;
  let style = 0;
  const r = Math.random();
  if (female) style |= r < 0.45 ? bit(OPT.HAIR_SHORT) | bit(OPT.HAIR_LONG) : r < 0.75 ? bit(OPT.HAIR_SHORT) | bit(OPT.PONYTAIL) : r < 0.95 ? bit(OPT.HAIR_SHORT) : bit(OPT.HAIR_SHORT) | bit(OPT.CAP);
  else style |= r < 0.68 ? bit(OPT.HAIR_SHORT) : r < 0.8 ? 0 : bit(OPT.HAIR_SHORT) | bit(OPT.CAP);
  if (Math.random() < (older ? 0.45 : 0.16)) style |= bit(OPT.GLASSES);
  if (!female && Math.random() < (older ? 0.3 : 0.1)) style |= bit(OPT.BEARD);
  const b = Math.random();
  if (b < 0.22) style |= bit(OPT.BACKPACK);
  else if (b < 0.4) style |= bit(OPT.BAG);
  const coat = Math.random() < (climate === 'cold' ? 0.55 : climate === 'mild' ? 0.2 : 0);
  if (coat) style |= bit(OPT.COAT);
  const t = Math.random();
  if (t < (climate === 'warm' ? 0.15 : 0.45)) style |= bit(OPT.ZIPPER);
  else if (t < 0.8) style |= bit(OPT.VNECK);
  const hairPal = HAIR[reg] || HAIR.any;
  return {
    style,
    top: pick(coat ? TOPS.cold : TOPS[climate]),
    pants: pick(climate === 'warm' ? PANTS_WARM : PANTS),
    skin: C(pick(SKIN[reg] || SKIN.any)),
    hair: older ? pick(GRAY) : C(pick(hairPal)),
    acc: pick(ACC),
    hScale: female ? 0.9 + Math.random() * 0.1 : 0.96 + Math.random() * 0.12,
    wScale: female ? 0.88 + Math.random() * 0.1 : 0.96 + Math.random() * 0.14,
    umbRoll: Math.random(),
    speedMul: older ? 0.8 : 1,
  };
}

// Vertex shader snippets for the instanced pedestrian material.
// Needs: attribute vec3 aInfo (part, mat, opt); attribute vec3 iAnim (phase, amplitude, style bits).
export const PERSON_ANIM_GLSL = `
  int pStyle = int(iAnim.z + 0.5);
  int pOpt = int(aInfo.z + 0.5);
  bool pUmb = ((pStyle >> 7) & 1) == 1;
  float pSw = sin(iAnim.x) * iAnim.y;
  float pPart = aInfo.x;
  float pAng = pPart < 0.5 ? 0.0 : pPart < 1.5 ? pSw : pPart < 2.5 ? -pSw : pPart < 3.5 ? -pSw * 0.9 : (pUmb ? -0.95 : pSw * 0.9);
  float pPivot = pPart < 2.5 ? ${HIP_Y.toFixed(2)} : ${SHOULDER_Y.toFixed(2)};
  float pC = cos(pAng), pS = sin(pAng);
`;
export const PERSON_BEGIN_GLSL = `
  {
    float ry = transformed.y - pPivot;
    transformed.yz = vec2(pPivot + pC * ry - pS * transformed.z, pS * ry + pC * transformed.z);
    // forward lean + small bob while walking
    float pWalk = clamp(iAnim.y * 2.0, 0.0, 1.0);
    transformed.z += max(0.0, transformed.y - ${HIP_Y.toFixed(2)}) * 0.07 * pWalk;
    transformed.y += abs(sin(iAnim.x)) * 0.025 * pWalk;
    if (pOpt > 0 && ((pStyle >> (pOpt - 1)) & 1) == 0) transformed = vec3(0.0, 1.1, 0.0);
  }
`;
