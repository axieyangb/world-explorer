/**
 * [feature/ferries-ships] Piers from OpenMapTiles `transportation class=pier` (polygons + lines) at Z14:
 * a solid deck slab slightly above the water with pilings, raised perimeter timber curb/fender beams,
 * and cast-iron mooring bollards added to each loaded chunk group, plus synthetic deck segments so
 * walking / driving uses the existing road-surface sampler (sampleRoadSurfaceIndexed) and water physics
 * treats the deck as support.
 */
import * as THREE from '../../../vendor/three.module.js';
import { fetchDecodedMvtTile, latLonToTileXY } from '../../global_tiles.js';
import { getBeijingTerrainElevation } from '../../environment.js';
import { llToWorld, worldToLl, tileBoxWorld, clipRing, clipLine, ringArea, pointInRing } from './geo.js';

const DECK_ABOVE_WATER = 1.3;  // m, deck top above the water surface
const SLAB = 0.7;              // m, deck thickness
const LINE_PIER_W = 4.0;       // m, width for pier ways mapped as lines
const PILE_STEP = 6.0;         // m, perimeter piling spacing
const PILE_GRID = 10.0;        // m, interior piling spacing (piers standing in water)
const BOLLARD_STEP = 12.0;     // m, cast-iron mooring bollard spacing along pier edges
const MAX_PILES = 1800;        // per chunk
const SCAN = 2.4;              // m, spacing of deck support segments

const TOP = new THREE.Color(0x8d8476);
const SIDE = new THREE.Color(0x5a534a);
const CURB = new THREE.Color(0x6e6050);
const BOLLARD = new THREE.Color(0x202326);

const PIER_NOISE_GLSL = `
float pierHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float pierNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(pierHash(i), pierHash(i + vec2(1.0, 0.0)), u.x),
    mix(pierHash(i + vec2(0.0, 1.0)), pierHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
`;

let deckMat = null, pileMat = null;
function mats() {
  if (!deckMat) {
    deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.90, metalness: 0.02 });
    deckMat.customProgramCacheKey = () => 'pier-deck-planks-v2';
    deckMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPierWorld;\nvarying vec3 vPierNorm;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvPierWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvPierNorm = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vPierWorld;\nvarying vec3 vPierNorm;\n${PIER_NOISE_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float pierRoughDelta = 0.0;
          float pierMetalDelta = 0.0;
          {
            float lum = dot(diffuseColor.rgb, vec3(0.3333));
            float isIron = 1.0 - smoothstep(0.20, 0.32, lum);
            vec2 wp = vPierWorld.xz;
            float camD = length(vPierWorld - cameraPosition);
            float fade = 1.0 - smoothstep(45.0, 220.0, camD);
            float fpw = length(fwidth(wp));
            if (isIron > 0.5) {
              // Cast-iron mooring bollard: weathered dark graphite iron with subtle pitting
              float pit = (pierNoise(wp * 24.0 + vPierWorld.y * 18.0) - 0.5) * 0.14 * fade;
              float capWear = smoothstep(0.45, 0.85, vPierNorm.y) * 0.06;
              diffuseColor.rgb = diffuseColor.rgb * (1.0 + pit) + vec3(capWear);
              pierRoughDelta = -0.48 * isIron;
              pierMetalDelta = 0.65 * isIron;
            } else if (fade > 0.0) {
              // Weathered timber deck planks & perimeter fender/curb beams
              float topMask = smoothstep(0.35, 0.75, abs(vPierNorm.y));
              float plankW = 0.24;
              float pCoord = wp.x / plankW;
              float pIdx = floor(pCoord);
              float pFrac = fract(pCoord);
              float buttLen = 3.6;
              float bCoord = (wp.y + mod(pIdx, 2.0) * 1.8) / buttLen;
              float bIdx = floor(bCoord);
              float bFrac = fract(bCoord);
              float pHash = pierHash(vec2(pIdx, bIdx * 3.1 + 0.7));
              // Anti-aliased plank gaps and butt joints
              float aaX = max(0.018, fpw / plankW);
              float aaZ = max(0.004, fpw / buttLen);
              float gapX = 1.0 - smoothstep(0.0, aaX, min(pFrac, 1.0 - pFrac));
              float gapZ = 1.0 - smoothstep(0.0, aaZ, min(bFrac, 1.0 - bFrac));
              float gap = max(gapX * (0.018 / aaX), gapZ * (0.004 / aaZ)) * topMask * fade;
              // Elongated wood grain + per-plank tone variation
              float grain = pierNoise(vec2(wp.x * 22.0 + pHash * 11.0, wp.y * 1.7 + pHash * 29.0)) * 0.65
                          + pierNoise(vec2(wp.x * 55.0, wp.y * 4.5 + 3.7)) * 0.35;
              float sideGrain = pierNoise(vec2((wp.x + wp.y) * 2.2, vPierWorld.y * 18.0));
              float woodVar = mix(sideGrain - 0.5, (grain - 0.5) * 0.22 + (pHash - 0.5) * 0.16, topMask) * fade;
              diffuseColor.rgb *= 1.0 + woodVar;
              // Salt-bleached plank edges & sun-weathered silvering
              float edgeBleach = smoothstep(0.32, 0.48, abs(pFrac - 0.5)) * (0.5 + 0.5 * pierNoise(wp * 0.8)) * topMask * fade;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.65, 0.60), edgeBleach * 0.28);
              // Darken plank gaps
              diffuseColor.rgb *= 1.0 - 0.58 * clamp(gap, 0.0, 1.0);
              // Damp tidal splash darkening near lower slab face
              float splash = 1.0 - smoothstep(0.55, 1.10, vPierWorld.y);
              diffuseColor.rgb *= 1.0 - 0.28 * splash;
              pierRoughDelta = (gap * 0.08 - edgeBleach * 0.05) - splash * 0.25;
            }
          }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + pierRoughDelta, 0.12, 1.0);`
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
          metalnessFactor = clamp(metalnessFactor + pierMetalDelta, 0.0, 0.9);`
        );
    };

    pileMat = new THREE.MeshStandardMaterial({ color: 0x3b332b, roughness: 0.94, metalness: 0.0 });
    pileMat.customProgramCacheKey = () => 'pier-pile-tidal-v2';
    pileMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPierWorld;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 pierPileWp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            pierPileWp = instanceMatrix * pierPileWp;
          #endif
          vPierWorld = (modelMatrix * pierPileWp).xyz;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vPierWorld;\n${PIER_NOISE_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float pileWet = 0.0;
          {
            float wY = vPierWorld.y;
            // Vertical creosote timber grain
            float vGrain = pierNoise(vec2((vPierWorld.x + vPierWorld.z) * 14.0, wY * 2.4));
            diffuseColor.rgb *= 0.88 + 0.24 * vGrain;
            // Tidal line + greenish-brown barnacle/algae encrustation band (worldY < 1.3m)
            if (wY < 1.35) {
              float nWave = (pierNoise(vPierWorld.xz * 3.2) - 0.5) * 0.16;
              float tideH = wY + nWave;
              // Dark wet tidal zone up to ~1.25m
              pileWet = 1.0 - smoothstep(0.85, 1.25, tideH);
              diffuseColor.rgb *= mix(1.0, 0.52, pileWet);
              // Greenish-brown marine algae band (tideH < 0.95m)
              float algaeMask = (1.0 - smoothstep(0.55, 0.95, tideH)) * smoothstep(-0.2, 0.25, tideH);
              float algaeTex = pierNoise(vec2((vPierWorld.x - vPierWorld.z) * 8.0, wY * 7.5));
              vec3 algaeCol = mix(vec3(0.16, 0.24, 0.11), vec3(0.24, 0.32, 0.15), algaeTex);
              diffuseColor.rgb = mix(diffuseColor.rgb, algaeCol, algaeMask * 0.72);
              // Crusty barnacle & mussel band (tideH < 0.55m)
              float barnMask = 1.0 - smoothstep(0.20, 0.58, tideH);
              float barnSpec = smoothstep(0.52, 0.78, pierNoise(vec2((vPierWorld.x + vPierWorld.z) * 26.0, wY * 28.0)));
              vec3 barnCol = mix(vec3(0.17, 0.16, 0.14), vec3(0.46, 0.44, 0.38), barnSpec);
              diffuseColor.rgb = mix(diffuseColor.rgb, barnCol, barnMask * 0.85);
            }
          }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.18, pileWet * 0.85);`
        );
    };
  }
  return { deckMat, pileMat };
}

/** Pier rings / strips (world coords) inside the chunk box, from the cached Z14 tiles. */
async function extractPiers(origin, ox, oz) {
  const pad = 2;
  const box = [ox - 500 - pad, oz - 500 - pad, ox + 500 + pad, oz + 500 + pad];
  const [la0, lo0] = worldToLl(origin, box[0], box[1]);
  const [la1, lo1] = worldToLl(origin, box[2], box[3]);
  const [tx0, ty0] = latLonToTileXY(la0, lo0, 14);
  const [tx1, ty1] = latLonToTileXY(la1, lo1, 14);
  const polys = [];
  const lines = [];
  const jobs = [];
  for (let tx = Math.min(tx0, tx1); tx <= Math.max(tx0, tx1); tx++) {
    for (let ty = Math.min(ty0, ty1); ty <= Math.max(ty0, ty1); ty++) {
      jobs.push(fetchDecodedMvtTile(14, tx, ty).then((t) => ({ t, tb: tileBoxWorld(origin, 14, tx, ty) })));
    }
  }
  const cb = [ox - 500, oz - 500, ox + 500, oz + 500];
  for (const { t, tb } of await Promise.all(jobs)) {
    const b = [Math.max(tb[0], cb[0]), Math.max(tb[1], cb[1]), Math.min(tb[2], cb[2]), Math.min(tb[3], cb[3])];
    if (b[0] >= b[2] || b[1] >= b[3]) continue;
    for (const f of t.transportation || []) {
      if (f.tags.class !== 'pier') continue;
      if (f.type === 3) {
        for (const poly of f.geom) {
          const outer = clipRing(dedupe(poly.outer.map((p) => llToWorld(origin, p[0], p[1]))), b);
          if (!outer || Math.abs(ringArea(outer)) < 6) continue;
          const holes = [];
          for (const h of poly.holes || []) {
            const c = clipRing(dedupe(h.map((p) => llToWorld(origin, p[0], p[1]))), b);
            if (c && Math.abs(ringArea(c)) > 2) holes.push(c);
          }
          polys.push({ outer: dedupe(outer), holes });
        }
      } else if (f.type === 2) {
        for (const line of f.geom) {
          const w = line.map((p) => llToWorld(origin, p[0], p[1]));
          for (const piece of clipLine(w, b)) lines.push(piece);
        }
      }
    }
  }
  return { polys, lines };
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 0.05 || Math.abs(q[1] - p[1]) > 0.05) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], z = out[out.length - 1];
    if (Math.abs(a[0] - z[0]) < 0.05 && Math.abs(a[1] - z[1]) < 0.05) out.pop();
  }
  return out;
}

class Buf {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
    this.deckPos = this.p;
    this.deckNorm = this.n;
    this.deckCol = this.c;
  }
  tri(a, b, c, col, up) {
    // a/b/c: [x, y, z]; orient so the normal points up (top faces) or keep given order.
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (up && ny < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [a, b, c]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nx / l, ny / l, nz / l);
      this.c.push(col.r, col.g, col.b);
    }
  }
  // Vertical quad along edge (x1,z1)->(x2,z2) from yb to yt, facing outward (right-hand side of a CCW ring).
  wall(x1, z1, x2, z2, yb, yt, col) {
    this.tri([x1, yb, z1], [x2, yb, z2], [x2, yt, z2], col, false);
    this.tri([x1, yb, z1], [x2, yt, z2], [x1, yt, z1], col, false);
  }
  // 3D rectangular timber curb / fender beam along (x1,y1,z1)->(x2,y2,z2) of width w and height h.
  beam(x1, z1, x2, z2, y1, y2, w, h, col) {
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 0.2) return;
    const hw = w * 0.5;
    const nx = -(z2 - z1) / L * hw, nz = (x2 - x1) / L * hw;
    const T0 = [x1 + nx, y1 + h, z1 + nz], T1 = [x2 + nx, y2 + h, z2 + nz];
    const T2 = [x2 - nx, y2 + h, z2 - nz], T3 = [x1 - nx, y1 + h, z1 - nz];
    const B0 = [x1 + nx, y1, z1 + nz], B1 = [x2 + nx, y2, z2 + nz];
    const B2 = [x2 - nx, y2, z2 - nz], B3 = [x1 - nx, y1, z1 - nz];
    this.tri(T0, T1, T2, col, true);
    this.tri(T0, T2, T3, col, true);
    this.tri(B0, B1, T1, col, false);
    this.tri(B0, T1, T0, col, false);
    this.tri(B2, B3, T3, col, false);
    this.tri(B2, T3, T2, col, false);
    this.tri(B3, B0, T0, col, false);
    this.tri(B3, T0, T3, col, false);
    this.tri(B1, B2, T2, col, false);
    this.tri(B1, T2, T1, col, false);
  }
  // Cast-iron mooring bollard (base plate + octagonal post + mushroom cap) merged directly into the deck buffer.
  bollard(cx, y0, cz, col) {
    const addPrism = (yb, yt, r, sides) => {
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
        const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
        this.wall(x0, z0, x1, z1, yb, yt, col);
        this.tri([cx, yt, cz], [x1, yt, z1], [x0, yt, z0], col, true);
      }
    };
    addPrism(y0, y0 + 0.07, 0.22, 4);
    addPrism(y0 + 0.07, y0 + 0.52, 0.12, 6);
    addPrism(y0 + 0.52, y0 + 0.62, 0.17, 6);
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Builds pier meshes + deck segments for one loaded chunk group. Returns { stats } or null when the
 * chunk is gone / origin changed by the time tiles arrive.
 */
export async function buildChunkPiers(app, group) {
  const ud = group.userData;
  const origin = app.worldOrigin;
  if (!origin) return null;
  const { polys, lines } = await extractPiers(origin, ud.ox, ud.oz);
  if (app.worldOrigin !== origin || app.loadedChunks.get(`${ud.cx},${ud.cz}`) !== group) return null;
  if (!polys.length && !lines.length) return { piers: 0, segs: 0, piles: 0 };

  const water = app.water;
  const inWater = (x, z) => (water ? water.isPointInWater(x, z) : false);
  const waterY = (x, z) => (water ? water.getWaterSurfaceY(x, z) : getBeijingTerrainElevation(x, z) + 0.28);
  const deckYAt = (x, z) => Math.max(waterY(x, z) + DECK_ABOVE_WATER, getBeijingTerrainElevation(x, z) + 0.15);

  const ox = ud.ox, oz = ud.oz;
  const buf = new Buf();
  const piles = [];
  const segs = [];

  const addPile = (x, z, top) => {
    if (piles.length >= MAX_PILES) return;
    const wy = waterY(x, z);
    if (top - wy < 0.3) return;
    piles.push(x, z, wy - 3.0, top);
  };

  const ref = (s) => ({ ...s, deck: false, bridge: true, ref: '' });

  for (const { outer, holes } of polys) {
    // Orient outer CCW-in-screen (so walls face outward), holes the opposite way.
    const ccw = (r, want) => ((ringArea(r) > 0) === want ? r : r.slice().reverse());
    const o = ccw(outer, true);
    const hs = holes.map((h) => ccw(h, false));
    let cx = 0, cz = 0;
    for (const p of o) { cx += p[0]; cz += p[1]; }
    cx /= o.length; cz /= o.length;
    const yTop = deckYAt(cx, cz);
    const yBot = yTop - SLAB;
    // Top face
    const contour = o.map((p) => new THREE.Vector2(p[0], p[1]));
    const holeV = hs.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    const all = contour.concat(...holeV);
    let faces = [];
    try { faces = THREE.ShapeUtils.triangulateShape(contour, holeV); } catch { faces = []; }
    for (const [a, b, c] of faces) {
      const A = all[a], B = all[b], C = all[c];
      buf.tri([A.x - ox, yTop, A.y - oz], [B.x - ox, yTop, B.y - oz], [C.x - ox, yTop, C.y - oz], TOP, true);
    }
    // Slab edges + perimeter timber curb / fender beams + cast-iron mooring bollards + perimeter piles
    for (const ring of [o, ...hs]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        // Outer rings have positive ringArea and holes negative: built b->a, walls face away from the deck.
        buf.wall(b[0] - ox, b[1] - oz, a[0] - ox, a[1] - oz, yBot, yTop, SIDE);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (ring !== o || L < 0.5) continue;
        const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; // one side normal
        const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
        const inSign = pointInRing(mx + nx * 0.8, mz + nz * 0.8, o) ? 1 : -1;
        const inNx = nx * inSign, inNz = nz * inSign;
        if (L >= 1.2) {
          // Raised perimeter timber curb beam along deck edge + outer timber fender rub-rail
          buf.beam(
            a[0] + inNx * 0.16 - ox, a[1] + inNz * 0.16 - oz,
            b[0] + inNx * 0.16 - ox, b[1] + inNz * 0.16 - oz,
            yTop, yTop, 0.22, 0.18, CURB
          );
          buf.beam(
            a[0] - inNx * 0.06 - ox, a[1] - inNz * 0.06 - oz,
            b[0] - inNx * 0.06 - ox, b[1] - inNz * 0.06 - oz,
            yTop - 0.32, yTop - 0.32, 0.16, 0.20, SIDE
          );
        }
        // Cast-iron mooring bollards spaced every ~12m along pier edges
        for (let s = BOLLARD_STEP * 0.5; s < L - 1.2; s += BOLLARD_STEP) {
          const px = a[0] + (b[0] - a[0]) * (s / L), pz = a[1] + (b[1] - a[1]) * (s / L);
          if (inWater(px - inNx * 3.0, pz - inNz * 3.0) || inWater(px, pz)) {
            buf.bollard(px + inNx * 0.55 - ox, yTop, pz + inNz * 0.55 - oz, BOLLARD);
          }
        }
        for (let s = PILE_STEP * 0.5; s < L; s += PILE_STEP) {
          const px = a[0] + (b[0] - a[0]) * (s / L), pz = a[1] + (b[1] - a[1]) * (s / L);
          // Inset 0.8 m toward the inside; only where open water lies just outside the edge.
          const qx = px + inNx * 0.8, qz = pz + inNz * 0.8;
          if (inWater(px - inNx * 2.4, pz - inNz * 2.4) || inWater(qx, qz)) addPile(qx, qz, yBot);
        }
      }
    }
    // Interior grid of piles when the pier itself stands in water.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of o) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
    for (let x = minX + PILE_GRID * 0.5; x < maxX; x += PILE_GRID) {
      for (let z = minZ + PILE_GRID * 0.5; z < maxZ; z += PILE_GRID) {
        if (!pointInRing(x, z, o) || hs.some((h) => pointInRing(x, z, h))) continue;
        if (inWater(x, z)) addPile(x, z, yBot);
      }
    }
    // Deck support segments: scanlines along the principal axis.
    scanSegments(o, hs, yTop, (s) => { s.ref = ref(s); segs.push(s); });
  }

  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.3) continue;
      const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
      const nx = -dz * LINE_PIER_W * 0.5, nz = dx * LINE_PIER_W * 0.5;
      const y1 = deckYAt(a[0], a[1]), y2 = deckYAt(b[0], b[1]);
      const ext = Math.min(1.0, L * 0.5); // overlap joints
      const ax = a[0] - dx * (i ? ext : 0), az = a[1] - dz * (i ? ext : 0);
      const P = [
        [ax + nx - ox, y1, az + nz - oz], [b[0] + nx - ox, y2, b[1] + nz - oz],
        [b[0] - nx - ox, y2, b[1] - nz - oz], [ax - nx - ox, y1, az - nz - oz],
      ];
      buf.tri(P[0], P[1], P[2], TOP, true);
      buf.tri(P[0], P[2], P[3], TOP, true);
      const yb = Math.min(y1, y2) - SLAB, yt = Math.max(y1, y2);
      buf.wall(P[0][0], P[0][2], P[1][0], P[1][2], yb, yt, SIDE);
      buf.wall(P[2][0], P[2][2], P[3][0], P[3][2], yb, yt, SIDE);
      buf.wall(P[3][0], P[3][2], P[0][0], P[0][2], y1 - SLAB, y1, SIDE);
      buf.wall(P[1][0], P[1][2], P[2][0], P[2][2], y2 - SLAB, y2, SIDE);
      if (L >= 1.0) {
        // Raised perimeter timber curb beams along both sides of the linear pier
        const cOff = 0.92;
        buf.beam(ax + nx * cOff - ox, az + nz * cOff - oz, b[0] + nx * cOff - ox, b[1] + nz * cOff - oz, y1, y2, 0.18, 0.16, CURB);
        buf.beam(ax - nx * cOff - ox, az - nz * cOff - oz, b[0] - nx * cOff - ox, b[1] - nz * cOff - oz, y1, y2, 0.18, 0.16, CURB);
      }
      // Cast-iron mooring bollards every ~12m along linear piers
      for (let s = BOLLARD_STEP * 0.5; s < L - 1.0; s += BOLLARD_STEP) {
        const px = a[0] + dx * s, pz = a[1] + dz * s;
        if (!inWater(px, pz)) continue;
        const ybTop = y1 + (y2 - y1) * (s / L);
        buf.bollard(px + nx * 0.78 - ox, ybTop, pz + nz * 0.78 - oz, BOLLARD);
        buf.bollard(px - nx * 0.78 - ox, ybTop, pz - nz * 0.78 - oz, BOLLARD);
      }
      for (let s = PILE_STEP * 0.5; s < L; s += PILE_STEP) {
        const px = a[0] + dx * s, pz = a[1] + dz * s;
        if (!inWater(px, pz)) continue;
        const yp = y1 + (y2 - y1) * (s / L) - SLAB;
        addPile(px + nx * 0.8, pz + nz * 0.8, yp);
        addPile(px - nx * 0.8, pz - nz * 0.8, yp);
      }
      const s = { x1: a[0], y1, z1: a[1], x2: b[0], y2, z2: b[1], width: LINE_PIER_W - 1.0, layer: 0, bridge: false, tunnel: false, deck: true, cls: 'pier', name: '' };
      s.ref = ref(s);
      segs.push(s);
    }
  }

  const { deckMat, pileMat } = mats();
  const root = new THREE.Group();
  root.name = 'maritime-piers';
  const g = buf.geometry();
  if (g) {
    const mesh = new THREE.Mesh(g, deckMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const nP = piles.length / 4;
  if (nP) {
    const pg = new THREE.CylinderGeometry(0.32, 0.36, 1, 6);
    pg.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(pg, pileMat, nP);
    const m = new THREE.Matrix4();
    for (let i = 0; i < nP; i++) {
      const x = piles[i * 4], z = piles[i * 4 + 1], y0 = piles[i * 4 + 2], y1 = piles[i * 4 + 3];
      m.makeScale(1, Math.max(0.2, y1 - y0), 1);
      m.setPosition(x - ox, y0, z - oz);
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    root.add(im);
  }
  group.add(root);

  // Walk/drive support: append deck segments and force the road grid to rebuild lazily.
  if (segs.length) {
    if (!ud.roadSegments) ud.roadSegments = [];
    ud.deckSegments = (ud.deckSegments || []).concat(segs);
    ud.roadGrid = undefined;
  }
  ud.maritimePiers = { piers: polys.length + lines.length, segs: segs.length, piles: nP };
  return ud.maritimePiers;
}

/** Parallel support segments clipped to the polygon (with holes) along its principal axis. */
function scanSegments(outer, holes, y, emit) {
  let mx = 0, mz = 0;
  for (const p of outer) { mx += p[0]; mz += p[1]; }
  mx /= outer.length; mz /= outer.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of outer) { const dx = p[0] - mx, dz = p[1] - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(ang), uz = Math.sin(ang); // main axis
  const vx = -uz, vz = ux;                       // scan offset axis
  const rings = [outer, ...holes];
  let vMin = Infinity, vMax = -Infinity;
  for (const p of outer) { const v = (p[0] - mx) * vx + (p[1] - mz) * vz; vMin = Math.min(vMin, v); vMax = Math.max(vMax, v); }
  const ts = [];
  let count = 0;
  for (let v = vMin + SCAN * 0.5; v < vMax && count < 600; v += SCAN) {
    ts.length = 0;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const vi = (r[i][0] - mx) * vx + (r[i][1] - mz) * vz;
        const vj = (r[j][0] - mx) * vx + (r[j][1] - mz) * vz;
        if ((vi > v) === (vj > v)) continue;
        const t = (v - vi) / (vj - vi);
        const px = r[i][0] + (r[j][0] - r[i][0]) * t, pz = r[i][1] + (r[j][1] - r[i][1]) * t;
        ts.push((px - mx) * ux + (pz - mz) * uz);
      }
    }
    ts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < ts.length; k += 2) {
      const a = ts[k] + 1.0, b = ts[k + 1] - 1.0;
      if (b - a < 0.5) continue;
      const bx = mx + vx * v, bz = mz + vz * v;
      emit({
        x1: bx + ux * a, y1: y, z1: bz + uz * a, x2: bx + ux * b, y2: y, z2: bz + uz * b,
        width: SCAN, layer: 0, bridge: false, tunnel: false, deck: true, cls: 'pier', name: '',
      });
      count++;
    }
  }
}
