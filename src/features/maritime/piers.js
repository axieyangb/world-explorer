/**
 * [feature/ferries-ships] Piers from OpenMapTiles `transportation class=pier` (polygons + lines) at Z14:
 * a solid deck slab slightly above the water with cross-braced pilings, creosote fender piles,
 * raised perimeter timber bull-rail curbs, horizontal rub-rails with rubber D-fenders,
 * cast-iron double-bitt mooring bollards on bolted baseplates, safety chain railings,
 * harbor light posts with warm lanterns, red/white lifebuoy ring stations, wooden utility/ticket
 * bollards, and pier-end gangway brows, plus synthetic deck segments so walking / driving uses
 * the existing road-surface sampler (sampleRoadSurfaceIndexed) and water physics treats the deck as support.
 */
import * as THREE from '../../../vendor/three.module.js';
import { fetchDecodedMvtTile, latLonToTileXY } from '../../global_tiles.js';
import { getBeijingTerrainElevation } from '../../environment.js';
import { llToWorld, worldToLl, tileBoxWorld, clipRing, clipLine, ringArea, pointInRing } from './geo.js';

const DECK_ABOVE_WATER = 1.3;  // m, deck top above the water surface
const SLAB = 0.7;              // m, deck thickness
const LINE_PIER_W = 4.0;       // m, width for pier ways mapped as lines
const PILE_STEP = 6.0;         // m, perimeter piling spacing
const FENDER_STEP = 4.5;       // m, outer creosote timber fender pile spacing
const PILE_GRID = 10.0;        // m, interior piling spacing (piers standing in water)
const BOLLARD_STEP = 12.0;     // m, cast-iron double-bitt mooring bollard spacing along pier edges
const LIGHT_STEP = 26.0;       // m, harbor lantern post spacing along pier edges
const LIFEBUOY_STEP = 34.0;    // m, red/white lifebuoy station spacing
const UTILITY_STEP = 42.0;     // m, wooden utility / ticket pedestal spacing
const MAX_PILES = 2400;        // per chunk
const SCAN = 2.4;              // m, spacing of deck support segments

const TOP = new THREE.Color(0x8d8476);
const APRON = new THREE.Color(0x9b9386);
const SIDE = new THREE.Color(0x5a534a);
const CURB = new THREE.Color(0x6e6050);
const TIMBER_BRACE = new THREE.Color(0x4a3f34);
const FENDER_RUBBER = new THREE.Color(0x1b1d20);
const BOLLARD = new THREE.Color(0x202326);
const BOLT_STEEL = new THREE.Color(0x34393e);
const CHAIN_STEEL = new THREE.Color(0x42484f);
const GALV_STEEL = new THREE.Color(0xb8c0c8);
const PILE_CAP = new THREE.Color(0xd8d3c8);
const LANTERN_GLOW = new THREE.Color(0xffdc85);
const LANTERN_HOOD = new THREE.Color(0x252a2e);
const LIFEBUOY_RED = new THREE.Color(0xd93829);
const LIFEBUOY_WHITE = new THREE.Color(0xf2f4f7);
const UTILITY_WOOD = new THREE.Color(0x69543e);
const UTILITY_BLUE = new THREE.Color(0x2f5678);
const BRASS_VALVE = new THREE.Color(0xc89d3c);

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
    deckMat.customProgramCacheKey = () => 'pier-deck-planks-v3';
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
            float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
            float isIron = 1.0 - smoothstep(0.18, 0.29, lum);
            float isLantern = step(0.75, diffuseColor.r) * step(0.55, diffuseColor.g) * step(0.22, sat);
            float isPainted = max(step(0.22, sat), step(0.66, lum));
            vec2 wp = vPierWorld.xz;
            float camD = length(vPierWorld - cameraPosition);
            float fade = 1.0 - smoothstep(95.0, 420.0, camD);
            float fpw = length(fwidth(wp));
            if (isLantern > 0.5) {
              // Warm harbor lantern glass glow
              diffuseColor.rgb *= 1.38;
              pierRoughDelta = -0.68;
            } else if (isPainted > 0.5) {
              // Lifebuoy rings, reflective bands, galvanized gangways & utility stands
              float micro = (pierNoise(wp * 16.0 + vPierWorld.y * 12.0) - 0.5) * 0.06 * fade;
              diffuseColor.rgb *= 1.0 + micro;
              pierRoughDelta = -0.32;
              pierMetalDelta = step(0.66, lum) * 0.45;
            } else if (isIron > 0.5) {
              // Cast-iron mooring bollard, chains & vulcanized rubber D-fenders
              float pit = (pierNoise(wp * 24.0 + vPierWorld.y * 18.0) - 0.5) * 0.14 * fade;
              float capWear = smoothstep(0.45, 0.85, vPierNorm.y) * 0.06;
              diffuseColor.rgb = diffuseColor.rgb * (1.0 + pit) + vec3(capWear);
              pierRoughDelta = -0.44 * isIron;
              pierMetalDelta = 0.62 * isIron;
            } else if (fade > 0.0) {
              // Weathered timber deck planks, structural bent bay joints & perimeter fender/curb beams
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
              // Structural bent / expansion bay seams every 6.0m so piers never look like flat slabs from afar
              float bentSpan = 6.0;
              float bentX = fract(wp.x / bentSpan);
              float bentZ = fract(wp.y / bentSpan);
              float bentSeam = max(
                1.0 - smoothstep(0.0, 0.022, min(bentX, 1.0 - bentX)),
                1.0 - smoothstep(0.0, 0.022, min(bentZ, 1.0 - bentZ))
              ) * topMask * fade;
              // Elongated wood grain + per-plank tone variation
              float grain = pierNoise(vec2(wp.x * 22.0 + pHash * 11.0, wp.y * 1.7 + pHash * 29.0)) * 0.65
                          + pierNoise(vec2(wp.x * 55.0, wp.y * 4.5 + 3.7)) * 0.35;
              float sideGrain = pierNoise(vec2((wp.x + wp.y) * 2.2, vPierWorld.y * 18.0));
              float woodVar = mix(sideGrain - 0.5, (grain - 0.5) * 0.24 + (pHash - 0.5) * 0.18, topMask) * fade;
              diffuseColor.rgb *= 1.0 + woodVar;
              // Salt-bleached plank edges & sun-weathered silvering
              float edgeBleach = smoothstep(0.32, 0.48, abs(pFrac - 0.5)) * (0.5 + 0.5 * pierNoise(wp * 0.8)) * topMask * fade;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.65, 0.60), edgeBleach * 0.28);
              // Darken plank gaps and structural bent seams
              diffuseColor.rgb *= 1.0 - 0.58 * clamp(gap + bentSeam * 0.45, 0.0, 1.0);
              // Damp tidal splash darkening near lower slab face & under-deck braces
              float splash = 1.0 - smoothstep(0.55, 1.15, vPierWorld.y);
              diffuseColor.rgb *= 1.0 - 0.32 * splash;
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
    pileMat.customProgramCacheKey = () => 'pier-pile-tidal-v3';
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
            // Vertical creosote timber grain + iron hoop bands near top
            float vGrain = pierNoise(vec2((vPierWorld.x + vPierWorld.z) * 14.0, wY * 2.4));
            diffuseColor.rgb *= 0.86 + 0.28 * vGrain;
            // Tidal line + greenish-brown barnacle/algae encrustation band (worldY < 1.35m)
            if (wY < 1.35) {
              float nWave = (pierNoise(vPierWorld.xz * 3.2) - 0.5) * 0.16;
              float tideH = wY + nWave;
              // Dark wet tidal zone up to ~1.25m
              pileWet = 1.0 - smoothstep(0.85, 1.25, tideH);
              diffuseColor.rgb *= mix(1.0, 0.50, pileWet);
              // Greenish-brown marine algae band (tideH < 0.95m)
              float algaeMask = (1.0 - smoothstep(0.55, 0.95, tideH)) * smoothstep(-0.2, 0.25, tideH);
              float algaeTex = pierNoise(vec2((vPierWorld.x - vPierWorld.z) * 8.0, wY * 7.5));
              vec3 algaeCol = mix(vec3(0.14, 0.25, 0.10), vec3(0.25, 0.34, 0.15), algaeTex);
              diffuseColor.rgb = mix(diffuseColor.rgb, algaeCol, algaeMask * 0.78);
              // Crusty barnacle & mussel band (tideH < 0.58m)
              float barnMask = 1.0 - smoothstep(0.20, 0.58, tideH);
              float barnSpec = smoothstep(0.48, 0.78, pierNoise(vec2((vPierWorld.x + vPierWorld.z) * 26.0, wY * 28.0)));
              vec3 barnCol = mix(vec3(0.17, 0.16, 0.14), vec3(0.50, 0.47, 0.40), barnSpec);
              diffuseColor.rgb = mix(diffuseColor.rgb, barnCol, barnMask * 0.88);
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
    if (L < 0.08) return;
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
  // Oriented 3D box centered at (cx, y0..y0+h, cz) with local axes (tx, tz) and (nx, nz).
  orientedBox(cx, y0, cz, tx, tz, nx, nz, halfLen, halfWid, h, col) {
    const x1 = cx - tx * halfLen, z1 = cz - tz * halfLen;
    const x2 = cx + tx * halfLen, z2 = cz + tz * halfLen;
    this.beam(x1, z1, x2, z2, y0, y0, halfWid * 2, h, col);
  }
  // Vertical prism / cylinder at (cx, cz) from yb to yt with radius r0 (bottom) and r1 (top).
  prism(cx, cz, yb, yt, r0, r1, sides, col, capTop = true) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const B0 = [cx + c0 * r0, yb, cz + s0 * r0];
      const B1 = [cx + c1 * r0, yb, cz + s1 * r0];
      const T1 = [cx + c1 * r1, yt, cz + s1 * r1];
      const T0 = [cx + c0 * r1, yt, cz + s0 * r1];
      this.tri(B0, B1, T1, col, false);
      this.tri(B0, T1, T0, col, false);
      if (capTop) this.tri([cx, yt, cz], T1, T0, col, true);
    }
  }
  // Under-deck cross-brace X-struts & horizontal bent cap beam between two pile positions.
  underDeckCrossBrace(x1, z1, x2, z2, yLow, yHigh) {
    const span = Math.hypot(x2 - x1, z2 - z1);
    if (span < 1.2 || span > 9.5 || yHigh - yLow < 0.45) return;
    // Horizontal timber pile-cap / bent beam directly under the deck slab
    this.beam(x1, z1, x2, z2, yHigh - 0.22, yHigh - 0.22, 0.34, 0.22, TIMBER_BRACE);
    // Lower horizontal tidal waler tie beam just above water
    this.beam(x1, z1, x2, z2, yLow, yLow, 0.22, 0.16, TIMBER_BRACE);
    // Diagonal X-brace struts crossing between the two piles
    this.beam(x1, z1, x2, z2, yLow + 0.08, yHigh - 0.28, 0.14, 0.14, TIMBER_BRACE);
    this.beam(x1, z1, x2, z2, yHigh - 0.28, yLow + 0.08, 0.14, 0.14, TIMBER_BRACE);
  }
  // Raised perimeter bull-rail curb on riser blocks (scupper gaps) + outer rub-rails & rubber D-fenders.
  berthingEdgeDetail(x1, z1, x2, z2, y1, y2, inNx, inNz) {
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1.0) return;
    const tx = (x2 - x1) / L, tz = (z2 - z1) / L;
    // Inner concrete/stone apron coping band flush with deck edge
    this.beam(
      x1 + inNx * 0.28, z1 + inNz * 0.28,
      x2 + inNx * 0.28, z2 + inNz * 0.28,
      y1, y2, 0.48, 0.035, APRON
    );
    // Raised heavy timber bull-rail supported on riser blocks (leaving 0.07m scupper gaps beneath)
    this.beam(
      x1 + inNx * 0.18, z1 + inNz * 0.18,
      x2 + inNx * 0.18, z2 + inNz * 0.18,
      y1 + 0.07, y2 + 0.07, 0.24, 0.17, CURB
    );
    // Timber riser chock blocks under bull-rail every 2.2m
    const chockStep = 2.2;
    for (let s = 0.4; s < L - 0.3; s += chockStep) {
      const t0 = s / L, t1 = Math.min(L, s + 0.42) / L;
      const cx0 = x1 + (x2 - x1) * t0 + inNx * 0.18, cz0 = z1 + (z2 - z1) * t0 + inNz * 0.18;
      const cx1 = x1 + (x2 - x1) * t1 + inNx * 0.18, cz1 = z1 + (z2 - z1) * t1 + inNz * 0.18;
      const cy0 = y1 + (y2 - y1) * t0, cy1 = y1 + (y2 - y1) * t1;
      this.beam(cx0, cz0, cx1, cz1, cy0, cy1, 0.24, 0.07, SIDE);
    }
    // Upper and lower creosote timber fender rub-rails (walers) along outer slab face
    this.beam(
      x1 - inNx * 0.07, z1 - inNz * 0.07,
      x2 - inNx * 0.07, z2 - inNz * 0.07,
      y1 - 0.22, y2 - 0.22, 0.18, 0.18, SIDE
    );
    this.beam(
      x1 - inNx * 0.07, z1 - inNz * 0.07,
      x2 - inNx * 0.07, z2 - inNz * 0.07,
      y1 - 0.56, y2 - 0.56, 0.18, 0.18, TIMBER_BRACE
    );
    // Black vulcanized rubber D-fender bumpers along the berthing face every ~3.2m
    const dStep = 3.2;
    for (let s = 0.6; s + 1.4 <= L; s += dStep) {
      const t0 = s / L, t1 = (s + 1.35) / L;
      const fx0 = x1 + (x2 - x1) * t0 - inNx * 0.19, fz0 = z1 + (z2 - z1) * t0 - inNz * 0.19;
      const fx1 = x1 + (x2 - x1) * t1 - inNx * 0.19, fz1 = z1 + (z2 - z1) * t1 - inNz * 0.19;
      const fy0 = y1 + (y2 - y1) * t0 - 0.36, fy1 = y1 + (y2 - y1) * t1 - 0.36;
      this.beam(fx0, fz0, fx1, fz1, fy0, fy1, 0.16, 0.24, FENDER_RUBBER);
    }
    // Beveled pile-top caps & iron straps for outer fender piles spaced along edge
    for (let s = FENDER_STEP * 0.5; s < L - 0.8; s += FENDER_STEP) {
      const t = s / L;
      const px = x1 + tx * s - inNx * 0.22;
      const pz = z1 + tz * s - inNz * 0.22;
      const py = y1 + (y2 - y1) * t;
      // Iron hoop collar near top of fender pile
      this.prism(px, pz, py + 0.36, py + 0.44, 0.27, 0.27, 6, BOLLARD, false);
      // Sloped white/weathered cone cap to shed rain and seabird roosting
      this.prism(px, pz, py + 0.52, py + 0.64, 0.26, 0.05, 6, PILE_CAP, true);
    }
  }
  // Cast-iron double-bitt mooring bollard on bolted rectangular baseplate with rope horns.
  bollard(cx, y0, cz, col, tx = 1, tz = 0) {
    const nx = -tz, nz = tx;
    // Heavy cast-iron baseplate (0.74m x 0.36m x 0.06m)
    this.orientedBox(cx, y0, cz, tx, tz, nx, nz, 0.37, 0.18, 0.06, col);
    // 4 corner anchor bolts on baseplate
    for (const sx of [-0.29, 0.29]) {
      for (const sz of [-0.12, 0.12]) {
        const bx = cx + tx * sx + nx * sz;
        const bz = cz + tz * sx + nz * sz;
        this.prism(bx, bz, y0 + 0.06, y0 + 0.095, 0.028, 0.026, 4, BOLT_STEEL, true);
      }
    }
    // Twin cast-iron bitt columns + flared mushroom heads + side mooring horns
    for (const off of [-0.18, 0.18]) {
      const bx = cx + tx * off, bz = cz + tz * off;
      this.prism(bx, bz, y0 + 0.06, y0 + 0.54, 0.115, 0.105, 6, col, false);
      this.prism(bx, bz, y0 + 0.54, y0 + 0.64, 0.155, 0.135, 6, col, true);
      // Horizontal mooring horn (lip) projecting outward from each bitt column
      const hx0 = bx - tx * 0.05 * Math.sign(off) - nx * 0.20;
      const hz0 = bz - tz * 0.05 * Math.sign(off) - nz * 0.20;
      const hx1 = bx + tx * 0.08 * Math.sign(off) + nx * 0.20;
      const hz1 = bz + tz * 0.08 * Math.sign(off) + nz * 0.20;
      this.beam(hx0, hz0, hx1, hz1, y0 + 0.38, y0 + 0.38, 0.075, 0.075, col);
    }
    // Central web gusset between twin bitts
    this.beam(cx - tx * 0.14, cz - tz * 0.14, cx + tx * 0.14, cz + tz * 0.14, y0 + 0.06, y0 + 0.06, 0.09, 0.22, col);
  }
  // Safety chain railing / guard posts along pier heads or walkway edges.
  safetyChainRailing(x1, z1, x2, z2, y1, y2, postStep = 3.0) {
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1.8) return;
    const nPosts = Math.max(2, Math.min(10, Math.round(L / postStep) + 1));
    let prevX = 0, prevY = 0, prevZ = 0;
    for (let i = 0; i < nPosts; i++) {
      const t = i / (nPosts - 1);
      const px = x1 + (x2 - x1) * t;
      const pz = z1 + (z2 - z1) * t;
      const py = y1 + (y2 - y1) * t;
      // Base flange + stanchion post + ball finial
      this.prism(px, pz, py, py + 0.04, 0.09, 0.08, 4, BOLLARD, true);
      this.prism(px, pz, py + 0.04, py + 0.98, 0.042, 0.038, 5, BOLLARD, false);
      this.prism(px, pz, py + 0.98, py + 1.05, 0.06, 0.03, 5, GALV_STEEL, true);
      if (i > 0) {
        const mx = (prevX + px) * 0.5, mz = (prevZ + pz) * 0.5, my = (prevY + py) * 0.5;
        // Upper safety chain with realistic catenary sag
        this.beam(prevX, prevZ, mx, mz, prevY + 0.88, my + 0.74, 0.035, 0.038, CHAIN_STEEL);
        this.beam(mx, mz, px, pz, my + 0.74, py + 0.88, 0.035, 0.038, CHAIN_STEEL);
        // Lower safety chain with catenary sag
        this.beam(prevX, prevZ, mx, mz, prevY + 0.48, my + 0.38, 0.03, 0.032, CHAIN_STEEL);
        this.beam(mx, mz, px, pz, my + 0.38, py + 0.48, 0.03, 0.032, CHAIN_STEEL);
      }
      prevX = px; prevY = py; prevZ = pz;
    }
  }
  // Harbor light post with fluted cast-iron base, cross-arm bracket, and warm glowing lantern.
  harborLight(cx, y0, cz, outNx = 1, outNz = 0) {
    // Octagonal pedestal base + tapered cast-iron lamp post
    this.prism(cx, cz, y0, y0 + 0.14, 0.22, 0.18, 6, BOLLARD, true);
    this.prism(cx, cz, y0 + 0.14, y0 + 0.95, 0.14, 0.10, 6, BOLLARD, true);
    this.prism(cx, cz, y0 + 0.95, y0 + 3.55, 0.075, 0.055, 6, BOLLARD, true);
    // Outward harbor bracket arm toward water
    const lx = cx + outNx * 0.48, lz = cz + outNz * 0.48;
    this.beam(cx, cz, lx, lz, y0 + 3.42, y0 + 3.48, 0.06, 0.06, BOLLARD);
    // Diagonal scroll brace under bracket arm
    this.beam(cx, cz, cx + outNx * 0.32, cz + outNz * 0.32, y0 + 3.05, y0 + 3.42, 0.04, 0.04, BOLLARD);
    // Warm glowing lantern glass cage + dark weather hood
    this.prism(lx, lz, y0 + 3.30, y0 + 3.48, 0.18, 0.06, 6, LANTERN_HOOD, true);
    this.prism(lx, lz, y0 + 3.04, y0 + 3.30, 0.11, 0.15, 6, LANTERN_GLOW, false);
    this.prism(lx, lz, y0 + 2.96, y0 + 3.04, 0.06, 0.11, 6, BOLLARD, true);
  }
  // Red/white lifebuoy ring station mounted on a twin-post harbor safety stand.
  lifebuoyStation(cx, y0, cz, tx, tz, inNx, inNz) {
    // Twin white safety stand posts + red weather hood
    const p1x = cx - tx * 0.28, p1z = cz - tz * 0.28;
    const p2x = cx + tx * 0.28, p2z = cz + tz * 0.28;
    this.prism(p1x, p1z, y0, y0 + 1.38, 0.04, 0.04, 5, LIFEBUOY_WHITE, true);
    this.prism(p2x, p2z, y0, y0 + 1.38, 0.04, 0.04, 5, LIFEBUOY_WHITE, true);
    this.beam(p1x - tx * 0.08, p1z - tz * 0.08, p2x + tx * 0.08, p2z + tz * 0.08, y0 + 1.36, y0 + 1.36, 0.28, 0.08, LIFEBUOY_RED);
    // Backing board
    this.beam(p1x, p1z, p2x, p2z, y0 + 0.65, y0 + 0.65, 0.06, 0.62, LIFEBUOY_WHITE);
    // Vertical 8-segment octagonal torus lifebuoy ring with alternating red body and 4 white reflective bands
    const rOuter = 0.34, rInner = 0.19, rMid = (rOuter + rInner) * 0.5, tubeW = (rOuter - rInner);
    const rcy = y0 + 0.96;
    const rcx = cx + inNx * 0.06, rcz = cz + inNz * 0.06;
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const a1 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
      const sx0 = rcx + tx * Math.cos(a0) * rMid, sy0 = rcy + Math.sin(a0) * rMid, sz0 = rcz + tz * Math.cos(a0) * rMid;
      const sx1 = rcx + tx * Math.cos(a1) * rMid, sy1 = rcy + Math.sin(a1) * rMid, sz1 = rcz + tz * Math.cos(a1) * rMid;
      const col = (i % 2 === 0) ? LIFEBUOY_RED : LIFEBUOY_WHITE;
      this.beam(sx0, sz0, sx1, sz1, sy0 - tubeW * 0.5, sy1 - tubeW * 0.5, 0.11, tubeW, col);
    }
  }
  // Wooden utility / shore-power / ticket bollard with marine outlet hood & brass water valve.
  utilityBollard(cx, y0, cz, tx, tz, inNx, inNz) {
    // Concrete plinth + heavy chamfered timber post + blue marine utility box
    this.orientedBox(cx, y0, cz, tx, tz, inNx, inNz, 0.24, 0.24, 0.08, APRON);
    this.orientedBox(cx, y0 + 0.08, cz, tx, tz, inNx, inNz, 0.17, 0.17, 0.98, UTILITY_WOOD);
    this.orientedBox(cx, y0 + 1.06, cz, tx, tz, inNx, inNz, 0.20, 0.20, 0.07, GALV_STEEL);
    // Blue marine electrical enclosure & slanted ticket/meter panel on inward face
    const bx = cx + inNx * 0.15, bz = cz + inNz * 0.15;
    this.orientedBox(bx, y0 + 0.52, bz, tx, tz, inNx, inNz, 0.13, 0.06, 0.42, UTILITY_BLUE);
    // Brass water standpipe wheel on side
    const vx = cx + tx * 0.20, vz = cz + tz * 0.20;
    this.prism(vx, vz, y0 + 0.42, y0 + 0.54, 0.08, 0.08, 6, BRASS_VALVE, true);
  }
  // Pier-end gangway brow (angled boarding ramp with non-slip cleats & dual handrails).
  gangwayBrow(cx, y0, cz, tx, tz, inNx, inNz) {
    // Extends from outer deck edge slightly over the water for ferry/boat boarding
    const len = 3.2, wid = 1.16;
    const xStart = cx + inNx * 1.8, zStart = cz + inNz * 1.8, yStart = y0 + 0.04;
    const xEnd = cx - inNx * (len - 1.8), zEnd = cz - inNz * (len - 1.8), yEnd = y0 + 0.42;
    // Ramp deck + side aluminum stringer curbs
    this.beam(xStart, zStart, xEnd, zEnd, yStart, yEnd, wid, 0.08, TOP);
    for (const s of [-1, 1]) {
      const off = s * (wid * 0.5 - 0.05);
      const sx0 = xStart + tx * off, sz0 = zStart + tz * off;
      const sx1 = xEnd + tx * off, sz1 = zEnd + tz * off;
      this.beam(sx0, sz0, sx1, sz1, yStart, yEnd, 0.09, 0.18, GALV_STEEL);
      // Top and mid handrails
      this.beam(sx0, sz0, sx1, sz1, yStart + 0.96, yEnd + 0.96, 0.05, 0.05, GALV_STEEL);
      this.beam(sx0, sz0, sx1, sz1, yStart + 0.52, yEnd + 0.52, 0.04, 0.04, GALV_STEEL);
      // 4 handrail stanchions per side
      for (let k = 0; k <= 3; k++) {
        const u = k / 3;
        const px = sx0 + (sx1 - sx0) * u, pz = sz0 + (sz1 - sz0) * u, py = yStart + (yEnd - yStart) * u;
        this.prism(px, pz, py + 0.08, py + 0.98, 0.032, 0.032, 4, GALV_STEEL, true);
      }
    }
    // Non-slip transverse boarding cleats across the ramp
    for (let k = 1; k <= 6; k++) {
      const u = k / 7;
      const rx = xStart + (xEnd - xStart) * u, rz = zStart + (zEnd - zStart) * u, ry = yStart + (yEnd - yStart) * u + 0.08;
      this.beam(rx - tx * (wid * 0.44), rz - tz * (wid * 0.44), rx + tx * (wid * 0.44), rz + tz * (wid * 0.44), ry, ry, 0.06, 0.03, CURB);
    }
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

  const addPile = (x, z, top, depthBelowWater = 3.0) => {
    if (piles.length >= MAX_PILES * 4) return false;
    const wy = waterY(x, z);
    if (top - wy < 0.3) return false;
    piles.push(x, z, wy - depthBelowWater, top);
    return true;
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
    let hasGangway = false;
    // Slab edges + perimeter timber bull-rail curbs + fender piles + rub-rails + D-fenders + bollards + fixtures
    for (const ring of [o, ...hs]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        // Outer rings have positive ringArea and holes negative: built b->a, walls face away from the deck.
        buf.wall(b[0] - ox, b[1] - oz, a[0] - ox, a[1] - oz, yBot, yTop, SIDE);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (ring !== o || L < 0.5) continue;
        const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
        const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L; // one side normal
        const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
        const inSign = pointInRing(mx + nx * 0.8, mz + nz * 0.8, o) ? 1 : -1;
        const inNx = nx * inSign, inNz = nz * inSign;
        const edgeOverWater = inWater(mx - inNx * 3.0, mz - inNz * 3.0) || inWater(mx, mz);

        if (L >= 1.2) {
          buf.berthingEdgeDetail(
            a[0] - ox, a[1] - oz,
            b[0] - ox, b[1] - oz,
            yTop, yTop, inNx, inNz
          );
          // Outer creosote timber fender piles projecting up 0.52m above deck along berthing edges in water
          if (edgeOverWater) {
            for (let s = FENDER_STEP * 0.5; s < L - 0.8; s += FENDER_STEP) {
              const px = a[0] + tx * s - inNx * 0.22;
              const pz = a[1] + tz * s - inNz * 0.22;
              if (inWater(px - inNx * 1.8, pz - inNz * 1.8) || inWater(px, pz)) {
                addPile(px, pz, yTop + 0.52, 2.6);
              }
            }
          }
        }

        // Cast-iron double-bitt mooring bollards spaced every ~12m along pier edges
        for (let s = BOLLARD_STEP * 0.5; s < L - 1.2; s += BOLLARD_STEP) {
          const px = a[0] + tx * s, pz = a[1] + tz * s;
          if (inWater(px - inNx * 3.0, pz - inNz * 3.0) || inWater(px, pz)) {
            buf.bollard(px + inNx * 0.62 - ox, yTop, pz + inNz * 0.62 - oz, BOLLARD, tx, tz);
          }
        }

        // Harbor light posts with warm lanterns spaced along water-facing edges
        for (let s = LIGHT_STEP * 0.45; s < L - 2.0; s += LIGHT_STEP) {
          const px = a[0] + tx * s, pz = a[1] + tz * s;
          if (inWater(px - inNx * 3.0, pz - inNz * 3.0) || inWater(px, pz)) {
            buf.harborLight(px + inNx * 0.95 - ox, yTop, pz + inNz * 0.95 - oz, -inNx, -inNz);
          }
        }

        // Red/white lifebuoy ring stations
        for (let s = LIFEBUOY_STEP * 0.35; s < L - 2.5; s += LIFEBUOY_STEP) {
          const px = a[0] + tx * s, pz = a[1] + tz * s;
          if (inWater(px - inNx * 3.0, pz - inNz * 3.0) || inWater(px, pz)) {
            buf.lifebuoyStation(px + inNx * 0.72 - ox, yTop, pz + inNz * 0.72 - oz, tx, tz, inNx, inNz);
          }
        }

        // Wooden utility / ticket / shore-power bollards
        for (let s = UTILITY_STEP * 0.55; s < L - 3.0; s += UTILITY_STEP) {
          const px = a[0] + tx * s, pz = a[1] + tz * s;
          if (inWater(px - inNx * 3.0, pz - inNz * 3.0) || inWater(px, pz)) {
            buf.utilityBollard(px + inNx * 1.15 - ox, yTop, pz + inNz * 1.15 - oz, tx, tz, inNx, inNz);
          }
        }

        // Safety chain railings & pier-end gangway brow at outer pier head edges
        if (edgeOverWater && L >= 4.0 && L <= 24.0) {
          const rx1 = a[0] + tx * 0.8 + inNx * 0.48 - ox, rz1 = a[1] + tz * 0.8 + inNz * 0.48 - oz;
          const rx2 = b[0] - tx * 0.8 + inNx * 0.48 - ox, rz2 = b[1] - tz * 0.8 + inNz * 0.48 - oz;
          buf.safetyChainRailing(rx1, rz1, rx2, rz2, yTop, yTop, 2.8);
          if (!hasGangway && L >= 5.5) {
            buf.gangwayBrow(mx - ox, yTop, mz - oz, tx, tz, inNx, inNz);
            hasGangway = true;
          }
        }

        // Perimeter support pilings + under-deck cross-bracing between adjacent piles
        let prevPile = null;
        for (let s = PILE_STEP * 0.5; s < L; s += PILE_STEP) {
          const px = a[0] + tx * s, pz = a[1] + tz * s;
          // Inset 0.85 m toward the inside; only where open water lies just outside the edge.
          const qx = px + inNx * 0.85, qz = pz + inNz * 0.85;
          if (inWater(px - inNx * 2.4, pz - inNz * 2.4) || inWater(qx, qz)) {
            if (addPile(qx, qz, yBot)) {
              const wy = waterY(qx, qz);
              // Cross-brace between outer perimeter pile and an interior companion pile (bent pair)
              const ix = px + inNx * 3.6, iz = pz + inNz * 3.6;
              if (pointInRing(ix, iz, o) && !hs.some((h) => pointInRing(ix, iz, h))) {
                addPile(ix, iz, yBot);
                buf.underDeckCrossBrace(qx - ox, qz - oz, ix - ox, iz - oz, wy + 0.18, yBot);
              }
              if (prevPile) {
                buf.underDeckCrossBrace(prevPile[0] - ox, prevPile[1] - oz, qx - ox, qz - oz, wy + 0.18, yBot);
              }
              prevPile = [qx, qz];
            }
          }
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
      const unitNx = -dz, unitNz = dx;
      const nx = unitNx * LINE_PIER_W * 0.5, nz = unitNz * LINE_PIER_W * 0.5;
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
        // Berthing edge detail (bull-rail curb, scupper blocks, rub-rails, rubber D-fenders, fender pile caps)
        buf.berthingEdgeDetail(P[0][0], P[0][2], P[1][0], P[1][2], y1, y2, -unitNx, -unitNz);
        buf.berthingEdgeDetail(P[2][0], P[2][2], P[3][0], P[3][2], y2, y1, unitNx, unitNz);
        for (let s = FENDER_STEP * 0.5; s < L - 0.8; s += FENDER_STEP) {
          const px = a[0] + dx * s, pz = a[1] + dz * s;
          if (!inWater(px, pz)) continue;
          const yf = y1 + (y2 - y1) * (s / L) + 0.52;
          addPile(px + nx * 1.08, pz + nz * 1.08, yf, 2.6);
          addPile(px - nx * 1.08, pz - nz * 1.08, yf, 2.6);
        }
      }
      // Cast-iron double-bitt mooring bollards every ~12m along linear piers
      for (let s = BOLLARD_STEP * 0.5; s < L - 1.0; s += BOLLARD_STEP) {
        const px = a[0] + dx * s, pz = a[1] + dz * s;
        if (!inWater(px, pz)) continue;
        const ybTop = y1 + (y2 - y1) * (s / L);
        buf.bollard(px + nx * 0.76 - ox, ybTop, pz + nz * 0.76 - oz, BOLLARD, dx, dz);
        buf.bollard(px - nx * 0.76 - ox, ybTop, pz - nz * 0.76 - oz, BOLLARD, dx, dz);
      }
      // Harbor lights & lifebuoy stations along linear piers
      for (let s = LIGHT_STEP * 0.5; s < L - 2.0; s += LIGHT_STEP) {
        const px = a[0] + dx * s, pz = a[1] + dz * s;
        if (!inWater(px, pz)) continue;
        const ylTop = y1 + (y2 - y1) * (s / L);
        buf.harborLight(px + nx * 0.82 - ox, ylTop, pz + nz * 0.82 - oz, unitNx, unitNz);
      }
      for (let s = LIFEBUOY_STEP * 0.4; s < L - 2.0; s += LIFEBUOY_STEP) {
        const px = a[0] + dx * s, pz = a[1] + dz * s;
        if (!inWater(px, pz)) continue;
        const ylTop = y1 + (y2 - y1) * (s / L);
        buf.lifebuoyStation(px - nx * 0.78 - ox, ylTop, pz - nz * 0.78 - oz, dx, dz, unitNx, unitNz);
      }
      // Pierhead safety chain railing & gangway brow at outer end of linear pier
      if (i === line.length - 2 && L >= 4.0 && inWater(b[0], b[1])) {
        buf.safetyChainRailing(
          b[0] - nx * 0.85 - ox, b[1] - nz * 0.85 - oz,
          b[0] + nx * 0.85 - ox, b[1] + nz * 0.85 - oz,
          y2, y2, 1.6
        );
        buf.gangwayBrow(b[0] - ox, y2, b[1] - oz, unitNx, unitNz, -dx, -dz);
      }
      for (let s = PILE_STEP * 0.5; s < L; s += PILE_STEP) {
        const px = a[0] + dx * s, pz = a[1] + dz * s;
        if (!inWater(px, pz)) continue;
        const yp = y1 + (y2 - y1) * (s / L) - SLAB;
        const p1x = px + nx * 0.8, p1z = pz + nz * 0.8;
        const p2x = px - nx * 0.8, p2z = pz - nz * 0.8;
        addPile(p1x, p1z, yp);
        addPile(p2x, p2z, yp);
        buf.underDeckCrossBrace(p1x - ox, p1z - oz, p2x - ox, p2z - oz, waterY(px, pz) + 0.18, yp);
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
    const pg = new THREE.CylinderGeometry(0.27, 0.31, 1, 8);
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
