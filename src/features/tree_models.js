/**
 * Detailed procedural tree species for the vegetation system. [tree-detail]
 *
 * Every species is code-generated (no assets):
 *   - trunks/limbs: tapered, curved tubes with root flare, mapped onto tileable bark bands of one canvas atlas;
 *   - canopies: many alpha-tested leaf-card clusters spread over a few lumpy sub-crowns (soft, varied silhouette),
 *     with spherical "canopy" normals and baked ambient occlusion in the vertex colours;
 *   - palms / banana / date palm: V-folded frond strips; conifers: drooping whorls of needle-spray cards.
 *
 * buildTreeGeometry(sp, lod) -> indexed BufferGeometry { position, normal, uv, color, vegSway }
 *   lod 0 = near ring (detailed, ~1-2.5k tris), lod 1 = mid ring (~150-450 tris). Both share the seed, so the mid
 *   tree has the same silhouette (lumps, limbs, frond directions) and the LOD switch barely pops.
 * vegSway: 0 = rigid (cactus), 1 = bends with height, >1.1 = leaf card (extra flutter in the shader).
 * TREE_DIM[sp] = { h, cy, cr, tr } at instance scale 1: height, canopy centre/radius, trunk radius (hit tests).
 */
import * as THREE from '../../vendor/three.module.js';
import {
  SP_BROADLEAF, SP_TALL, SP_CONIFER, SP_PALM, SP_BUSH, SP_COLUMN, SP_UMBRELLA, SP_EUCALYPT, SP_CACTUS, SP_BANANA,
  SP_DATEPALM, SP_BIRCH, SP_BAMBOO, SP_BARE, SPECIES_COUNT,
} from './flora_climate.js';

// ------------------------------------------------------------------------------------------------
// Atlas layout (canvas pixels, 1024 x 1024; y down). Bands span the full width so bark wraps around trunks.
// ------------------------------------------------------------------------------------------------
const AT = 1024;
const BAND = { bark: [0, 96], birch: [96, 192], palm: [192, 256], diamond: [256, 304], plain: [306, 318] };
const CELL = {
  leaf: [0, 320, 256, 256], small: [256, 320, 256, 256], needle: [512, 320, 256, 256], cypress: [768, 320, 256, 256],
  frond: [0, 576, 512, 256], banana: [512, 576, 256, 256], bamboo: [768, 576, 256, 256],
  twig: [0, 832, 256, 192], pleaf: [256, 832, 64, 64], splinter: [320, 832, 64, 64], ember: [384, 832, 64, 64],
};
function cellUV(name) {
  const [x, y, w, h] = CELL[name];
  return [x / AT, 1 - (y + h) / AT, (x + w) / AT, 1 - y / AT]; // u0, v0(bottom), u1, v1(top)
}
function bandV(name) {
  const [y0, y1] = BAND[name];
  return [1 - (y1 - 1.5) / AT, 1 - (y0 + 1.5) / AT]; // bottom, top
}
export const PARTICLE_UV = { leaf: cellUV('pleaf'), splinter: cellUV('splinter'), ember: cellUV('ember') };

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------------
// Atlas painting
// ------------------------------------------------------------------------------------------------
let ATLAS = null;

/** The shared foliage/bark atlas (CanvasTexture, sRGB, mipmapped). Built once. */
export function getFloraAtlas() {
  if (ATLAS) return ATLAS;
  const cv = document.createElement('canvas');
  cv.width = AT;
  cv.height = AT;
  const c = cv.getContext('2d');
  const R = mulberry(911);
  const rr = (a, b) => a + (b - a) * R();
  const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%,${a})`;

  // Tileable band painter: every primitive is drawn at x/y offsets of one band period, clipped to the band.
  const band = (name, base, paint) => {
    const [y0, y1] = BAND[name];
    const H = y1 - y0;
    c.save();
    c.beginPath();
    c.rect(0, y0, AT, H);
    c.clip();
    c.fillStyle = base;
    c.fillRect(0, y0, AT, H);
    const wrap = (fn) => {
      for (const ox of [-AT, 0, AT]) for (const oy of [-H, 0, H]) { c.save(); c.translate(ox, y0 + oy); fn(); c.restore(); }
    };
    paint(wrap, H);
    c.restore();
  };

  // Bark: vertical fissures between flat plates (light neutral; the hue comes from vertex colours)
  band('bark', '#c9bfb4', (wrap, H) => {
    for (let i = 0; i < 260; i++) {
      const x = rr(0, AT), w = rr(6, 26), y = rr(0, H), h = rr(10, 40), l = rr(68, 88);
      wrap(() => { c.fillStyle = `rgb(${l * 2.4},${l * 2.25},${l * 2.1})`; c.fillRect(x, y, w, h); });
    }
    for (let i = 0; i < 170; i++) {
      const x = rr(0, AT), wv = rr(2, 6), lw = rr(1.5, 4.5), a = rr(0.45, 0.85);
      wrap(() => {
        c.strokeStyle = `rgba(52,42,36,${a})`;
        c.lineWidth = lw;
        c.beginPath();
        c.moveTo(x, -2);
        for (let y = 0; y <= H + 2; y += 8) c.lineTo(x + Math.sin(y * 0.11 + x) * wv, y);
        c.stroke();
      });
    }
    for (let i = 0; i < 1400; i++) {
      const x = rr(0, AT), y = rr(0, H), a = rr(0.1, 0.3);
      wrap(() => { c.fillStyle = R() < 0.5 ? `rgba(40,32,28,${a})` : `rgba(255,250,240,${a * 0.6})`; c.fillRect(x, y, 2, 2); });
    }
  });
  // Birch: chalk white with black horizontal lenticels and dark patches
  band('birch', '#efece4', (wrap, H) => {
    for (let i = 0; i < 160; i++) {
      const x = rr(0, AT), y = rr(0, H), w = rr(10, 46), h = rr(1.5, 4);
      wrap(() => { c.fillStyle = `rgba(34,30,28,${rr(0.55, 0.9)})`; c.beginPath(); c.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); c.fill(); });
    }
    for (let i = 0; i < 26; i++) {
      const x = rr(0, AT), y = rr(0, H), w = rr(14, 40), h = rr(6, 16);
      wrap(() => { c.fillStyle = 'rgba(40,36,32,0.75)'; c.beginPath(); c.ellipse(x, y, w / 2, h / 2, rr(-0.2, 0.2), 0, Math.PI * 2); c.fill(); });
    }
    for (let i = 0; i < 900; i++) {
      const x = rr(0, AT), y = rr(0, H);
      wrap(() => { c.fillStyle = `rgba(150,140,125,${rr(0.08, 0.25)})`; c.fillRect(x, y, 3, 1); });
    }
  });
  // Coconut palm: ring scars
  band('palm', '#c4b296', (wrap, H) => {
    for (let k = 0; k < 6; k++) {
      const y = (k + rr(0.1, 0.3)) * (H / 6);
      wrap(() => {
        c.strokeStyle = 'rgba(70,56,40,0.75)';
        c.lineWidth = rr(2, 4);
        c.beginPath();
        c.moveTo(-4, y);
        for (let x = 0; x <= AT + 8; x += 16) c.lineTo(x, y + Math.sin(x * 0.03 + k) * 1.6);
        c.stroke();
        c.fillStyle = 'rgba(230,215,190,0.35)';
        c.fillRect(0, y + 3, AT, 2);
      });
    }
    for (let i = 0; i < 300; i++) {
      const x = rr(0, AT), y = rr(0, H);
      wrap(() => { c.fillStyle = `rgba(80,66,48,${rr(0.15, 0.35)})`; c.fillRect(x, y, 1.5, rr(4, 10)); });
    }
  });
  // Date palm: diamond leaf-base pattern
  band('diamond', '#b39a76', (wrap, H) => {
    const n = 32;
    for (let k = 0; k < n; k++) {
      for (let row = 0; row < 2; row++) {
        const x = (k + row * 0.5) * (AT / n), y = row * (H / 2) + H / 4;
        wrap(() => {
          c.fillStyle = `rgb(${rr(120, 150)},${rr(98, 118)},${rr(66, 82)})`;
          c.strokeStyle = 'rgba(50,38,26,0.85)';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(x, y - H / 4 + 1);
          c.lineTo(x + AT / n / 2 - 1, y);
          c.lineTo(x, y + H / 4 - 1);
          c.lineTo(x - AT / n / 2 + 1, y);
          c.closePath();
          c.fill();
          c.stroke();
        });
      }
    }
  });
  c.fillStyle = '#ffffff';
  c.fillRect(0, BAND.plain[0], AT, BAND.plain[1] - BAND.plain[0]);

  // ---- leaf cells ----
  const leafShape = (x, y, ang, len, wid, fill, rib) => {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(len * 0.25, -wid, len * 0.75, -wid * 0.8, len, 0);
    c.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.25, wid, 0, 0);
    c.fill();
    if (rib) {
      c.strokeStyle = rib;
      c.lineWidth = Math.max(0.8, wid * 0.12);
      c.beginPath();
      c.moveTo(len * 0.05, 0);
      c.lineTo(len * 0.9, 0);
      c.stroke();
    }
    c.restore();
  };
  const inCell = (name, fn) => {
    const [x, y, w, h] = CELL[name];
    c.save();
    c.beginPath();
    c.rect(x + 2, y + 2, w - 4, h - 4);
    c.clip();
    c.translate(x, y);
    fn(w, h);
    c.restore();
  };
  const twigs = (cx, cy, n, r, col, lw) => {
    c.strokeStyle = col;
    c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr(-0.3, 0.3);
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(cx, cy);
      c.quadraticCurveTo(cx + Math.cos(a) * r * 0.5 + rr(-8, 8), cy + Math.sin(a) * r * 0.5 + rr(-8, 8), cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      c.stroke();
    }
  };
  // Broadleaf cluster: ~60 ovate leaves radiating from twigs, darker underneath, sunlit on top
  inCell('leaf', (w, h) => {
    twigs(w / 2 + rr(-20, 20), h / 2 + rr(-20, 20), 4, 80, 'rgba(91,74,54,0.8)', 2);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 70; i++) {
        const a = rr(0, Math.PI * 2), d = Math.sqrt(R()) * 100;
        const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
        const top = 1 - y / h;
        const l = pass === 0 ? rr(20, 30) : pass === 1 ? rr(28, 42) : rr(36, 54) + top * 8;
        leafShape(x, y, rr(0, Math.PI * 2), rr(18, 28), rr(5.5, 8.5), hsl(rr(80, 112), rr(36, 58), l), hsl(80, 40, l + 10, 0.5));
      }
    }
  });
  // Small leaves (birch / eucalyptus / acacia): many narrow leaves on hanging twigs, airy
  inCell('small', (w, h) => {
    c.strokeStyle = '#6a5a48';
    c.lineWidth = 1.5;
    for (let k = 0; k < 9; k++) {
      const x0 = rr(30, w - 30), y0 = rr(14, 60);
      const pts = [];
      c.beginPath();
      c.moveTo(x0, y0);
      let x = x0, y = y0;
      for (let s = 0; s < 6; s++) { x += rr(-12, 12); y += rr(18, 30); c.lineTo(x, y); pts.push([x, y]); }
      c.stroke();
      for (const [px, py] of pts) {
        for (let j = 0; j < 4; j++) {
          const l = rr(30, 52);
          leafShape(px + rr(-5, 5), py + rr(-5, 5), Math.PI / 2 + rr(-1.4, 1.4), rr(14, 22), rr(4, 6.5), hsl(rr(70, 100), rr(35, 55), l), null);
        }
      }
    }
  });
  // Conifer needle spray: twig along +u (base left, tip right) with needles both sides
  inCell('needle', (w, h) => {
    const needles = (x0, y0, x1, y1, len, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const a = Math.atan2(y1 - y0, x1 - x0);
        const L = len * (1 - t * 0.55);
        for (const sgn of [-1, 1]) {
          const aa = a + sgn * rr(0.7, 1.2);
          c.strokeStyle = hsl(rr(110, 140), rr(26, 42), rr(28, 46));
          c.lineWidth = rr(1.6, 2.6);
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + Math.cos(aa) * L, y + Math.sin(aa) * L);
          c.stroke();
        }
      }
    };
    c.lineCap = 'round';
    c.strokeStyle = '#4c3e30';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(6, h / 2);
    c.lineTo(w - 10, h / 2 - 6);
    c.stroke();
    for (let k = 0; k < 12; k++) {
      const t = 0.05 + k * 0.075, x = 6 + (w - 16) * t, y = h / 2 - 6 * t;
      const sgn = k % 2 ? 1 : -1, L = (1 - t) * 120 + 26;
      const ex = x + L * 0.6, ey = y + sgn * Math.min(110, L * 0.85);
      c.strokeStyle = '#4c3e30';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(ex, ey);
      c.stroke();
      needles(x, y, ex, ey, 22, 16);
    }
    needles(6, h / 2, w - 10, h / 2 - 6, 30, 60);
  });
  // Cypress / juniper scale foliage: dense irregular mass of tiny sprigs
  inCell('cypress', (w, h) => {
    for (let i = 0; i < 1100; i++) {
      const a = rr(0, Math.PI * 2), d = Math.pow(R(), 0.6) * 112 * (0.75 + 0.25 * Math.sin(a * 5 + 1));
      const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d * 1.05;
      const top = 1 - y / h;
      c.fillStyle = hsl(rr(105, 135), rr(28, 48), rr(20, 34) + top * 12);
      c.beginPath();
      c.ellipse(x, y, rr(3, 7), rr(2, 4), rr(0, 3.14), 0, Math.PI * 2);
      c.fill();
    }
  });
  // Palm frond: rachis along +u (base left), leaflets angled toward the tip on both sides
  inCell('frond', (w, h) => {
    const cy = h / 2;
    c.lineCap = 'round';
    for (let x = 18; x < w - 8; x += 5.5) {
      const t = x / w;
      const L = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.04)), 0.7) * 116 + 6;
      for (const sgn of [-1, 1]) {
        const a = sgn * rr(0.62, 0.78);
        c.strokeStyle = hsl(rr(86, 108), rr(40, 58), rr(26, 42));
        c.lineWidth = rr(3.5, 5.5) * (1 - t * 0.4);
        c.beginPath();
        c.moveTo(x, cy);
        c.quadraticCurveTo(x + Math.cos(a) * L * 0.5, cy + Math.sin(a) * L * 0.5, x + Math.cos(a) * L * 0.95, cy + Math.sin(a) * L + sgn * 6);
        c.stroke();
      }
    }
    c.strokeStyle = '#7c7448';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(4, cy);
    c.lineTo(w - 4, cy);
    c.stroke();
  });
  // Banana leaf: broad blade along +u with midrib, lateral veins and wind tears
  inCell('banana', (w, h) => {
    const cy = h / 2;
    c.fillStyle = hsl(92, 52, 40);
    c.beginPath();
    c.moveTo(6, cy);
    c.bezierCurveTo(w * 0.2, cy - 112, w * 0.8, cy - 104, w - 6, cy);
    c.bezierCurveTo(w * 0.8, cy + 104, w * 0.2, cy + 112, 6, cy);
    c.fill();
    for (let x = 14; x < w - 10; x += 4) {
      c.strokeStyle = `rgba(30,70,20,${rr(0.12, 0.3)})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, cy);
      c.lineTo(x + 22, cy - 100);
      c.moveTo(x, cy);
      c.lineTo(x + 22, cy + 100);
      c.stroke();
    }
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const x = rr(40, w - 30), sgn = R() < 0.5 ? -1 : 1;
      c.lineWidth = rr(2, 4);
      c.beginPath();
      c.moveTo(x + 26, cy + sgn * 112);
      c.lineTo(x + 4, cy + sgn * rr(18, 50));
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = '#b7c27a';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(4, cy);
    c.lineTo(w - 8, cy);
    c.stroke();
  });
  // Bamboo: drooping lanceolate leaves fanning from thin twigs
  inCell('bamboo', (w, h) => {
    c.strokeStyle = '#7d8a40';
    c.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const x0 = rr(30, w - 30), y0 = rr(20, h - 80);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x0 + rr(-20, 20), y0 + 50);
      c.stroke();
      for (let j = 0; j < 6; j++) leafShape(x0, y0 + j * 8, Math.PI / 2 + rr(-1.1, 1.1), rr(48, 70), rr(5, 8), hsl(rr(78, 100), rr(45, 62), rr(32, 46)), hsl(80, 40, 55, 0.5));
    }
  });
  // Bare twigs: fine recursive branchlets
  inCell('twig', (w, h) => {
    c.lineCap = 'round';
    const tw = (x, y, a, len, lw, d) => {
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      c.strokeStyle = `rgb(${rr(70, 95)},${rr(58, 74)},${rr(48, 60)})`;
      c.lineWidth = lw;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(ex, ey);
      c.stroke();
      if (d > 0) {
        tw(ex, ey, a - rr(0.25, 0.6), len * rr(0.6, 0.8), Math.max(1, lw * 0.7), d - 1);
        tw(ex, ey, a + rr(0.25, 0.6), len * rr(0.6, 0.8), Math.max(1, lw * 0.7), d - 1);
      }
    };
    for (let k = 0; k < 3; k++) tw(w / 2 + rr(-30, 30), h - 4, -Math.PI / 2 + rr(-0.5, 0.5), rr(40, 55), 4, 5);
  });
  // Particles: single leaf, wood splinter, ember
  inCell('pleaf', (w, h) => leafShape(6, h / 2, 0, w - 12, 13, '#eef4e4', '#ffffff'));
  inCell('splinter', (w, h) => {
    c.fillStyle = '#e4cfa8';
    c.beginPath();
    c.moveTo(4, h / 2);
    c.lineTo(w * 0.4, h / 2 - 8);
    c.lineTo(w - 4, h / 2 - 2);
    c.lineTo(w * 0.55, h / 2 + 7);
    c.closePath();
    c.fill();
  });
  inCell('ember', (w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2 - 3);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  ATLAS = tex;
  return tex;
}

// ------------------------------------------------------------------------------------------------
// Geometry builder
// ------------------------------------------------------------------------------------------------
class Geo {
  constructor() {
    this.P = []; this.N = []; this.U = []; this.C = []; this.S = []; this.I = [];
  }
  get n() { return this.P.length / 3; }
  v(x, y, z, nx, ny, nz, u, vv, r, g, b, s) {
    this.P.push(x, y, z);
    this.N.push(nx, ny, nz);
    this.U.push(u, vv);
    this.C.push(r, g, b);
    this.S.push(s);
    return this.n - 1;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('vegSway', new THREE.Float32BufferAttribute(this.S, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Catmull-Rom resample of a control polyline into n+1 points. */
function spline(ctrl, n) {
  const out = [];
  const m = ctrl.length - 1;
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * m, k = Math.min(m - 1, Math.floor(f)), t = f - k;
    const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(m, k + 2)];
    const t2 = t * t, t3 = t2 * t;
    const q = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      q[j] = 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
    }
    out.push(q);
  }
  return out;
}

/**
 * Tapered tube along `pts` (radius r(t), t = 0..1). Each length segment maps the whole bark band once (bands are
 * vertically tileable), u wraps `uRep` times around. `ring(t, a)` optionally modulates the radius (cactus ribs).
 */
function tube(g, pts, r, segs, bandName, col0, col1, uRep = 1, sway = 1, ring = null) {
  const [vb, vt] = bandV(bandName);
  const n = pts.length;
  // parallel-transport frame
  let t0 = norm3([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]);
  let ref = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let n1 = norm3(cross(t0, ref));
  const frames = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const t = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const d = n1[0] * t[0] + n1[1] * t[1] + n1[2] * t[2];
    n1 = norm3([n1[0] - t[0] * d, n1[1] - t[1] * d, n1[2] - t[2] * d]);
    frames.push([n1, cross(t, n1)]);
  }
  const ringAt = (i, vv, base) => {
    const p = pts[i], [a1, a2] = frames[i], tt = i / (n - 1);
    const rad = r(tt);
    const col = lerp3(col0, col1, tt);
    for (let k = 0; k <= segs; k++) {
      const ang = (k / segs) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const rr = ring ? rad * ring(tt, ang) : rad;
      const nx = a1[0] * ca + a2[0] * sa, ny = a1[1] * ca + a2[1] * sa, nz = a1[2] * ca + a2[2] * sa;
      g.v(p[0] + nx * rr, p[1] + ny * rr, p[2] + nz * rr, nx, ny, nz, (k / segs) * uRep, vv, col[0], col[1], col[2], sway);
    }
    return base;
  };
  for (let i = 0; i < n - 1; i++) {
    const b0 = g.n;
    ringAt(i, vb, b0);
    const b1 = g.n;
    ringAt(i + 1, vt, b1);
    for (let k = 0; k < segs; k++) g.I.push(b0 + k, b0 + k + 1, b1 + k + 1, b0 + k, b1 + k + 1, b1 + k);
  }
}

/** Quad card centred at c with half-axes ax (u) / ay (v); normals = canopy-spherical (vertex - nc) bent upward. */
function card(g, c, ax, ay, uv, colFn, nc, sway = 1.3, upBias = 0.35) {
  const [u0, v0, u1, v1] = uv;
  const b = g.n;
  const corners = [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]];
  for (const [sx, sy, u, vv] of corners) {
    const x = c[0] + ax[0] * sx + ay[0] * sy, y = c[1] + ax[1] * sx + ay[1] * sy, z = c[2] + ax[2] * sx + ay[2] * sy;
    let nrm = nc ? norm3([x - nc[0], (y - nc[1]) * 1.2, z - nc[2]]) : norm3(cross(ax, ay));
    nrm = norm3([nrm[0], nrm[1] + upBias, nrm[2]]);
    const col = colFn(x, y, z, nrm);
    g.v(x, y, z, nrm[0], nrm[1], nrm[2], u, vv, col[0], col[1], col[2], sway);
  }
  g.I.push(b, b + 1, b + 2, b, b + 2, b + 3);
}

function randUnit(R) {
  let x, y, z, l;
  do { x = R() * 2 - 1; y = R() * 2 - 1; z = R() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-3);
  l = Math.sqrt(l);
  return [x / l, y / l, z / l];
}

/** Two axes spanning a plane with normal m (random roll). */
function planeAxes(m, R, w, h) {
  const ref = Math.abs(m[1]) < 0.85 ? [0, 1, 0] : [1, 0, 0];
  let a = norm3(cross(m, ref));
  let b = cross(m, a);
  const roll = R() * Math.PI * 2, cr = Math.cos(roll), sr = Math.sin(roll);
  const a2 = [a[0] * cr + b[0] * sr, a[1] * cr + b[1] * sr, a[2] * cr + b[2] * sr];
  const b2 = cross(m, a2);
  return [[a2[0] * w, a2[1] * w, a2[2] * w], [b2[0] * h, b2[1] * h, b2[2] * h]];
}

/** Canopy AO / colour: darker deep inside and underneath, slight sunlit lift on top; `tint` = species leaf multiplier. */
function leafShade(tint, center, rad, R) {
  const k0 = 0.92 + R() * 0.16;
  return (x, y, z, nrm) => {
    const dx = (x - center[0]) / rad[0], dy = (y - center[1]) / rad[1], dz = (z - center[2]) / rad[2];
    const d = Math.min(1.15, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const ao = (0.42 + 0.58 * Math.pow(d / 1.15, 1.3)) * (0.78 + 0.22 * Math.max(0, nrm[1] * 0.5 + 0.5)) * k0;
    return [tint[0] * ao, tint[1] * ao, tint[2] * ao];
  };
}

/**
 * Lumpy deciduous crown: `lumps` sub-crowns on an ellipsoid (centre c, radii rx/ry), `count` leaf clusters on the
 * outer shells. Returns the lump list (for the limbs). Clusters are 2-3 crossed cards of `size` metres.
 */
function crown(g, R, o) {
  const { c, rx, ry, lumps: nl, count, size, cell, tint, quads = 2, flat = 0, droop = 0, hang = 0 } = o;
  const uv = cellUV(cell);
  const lumps = [{ c: [c[0], c[1] + ry * 0.1, c[2]], r: Math.min(rx, ry) * 0.62 }];
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2 + R() * 0.9;
    const el = -0.5 + R() * 1.15;
    const ce = Math.cos(el);
    const k = 0.5 + R() * 0.2;
    lumps.push({ c: [c[0] + Math.cos(a) * ce * rx * k, c[1] + Math.sin(el) * ry * k * (1 - flat), c[2] + Math.sin(a) * ce * rx * k], r: (0.36 + R() * 0.2) * (rx + ry) * 0.5 });
  }
  let wsum = 0;
  for (const l of lumps) wsum += l.r * l.r;
  const shade = leafShade(tint, c, [rx * 1.05, ry * 1.05, rx * 1.05], R);
  for (let i = 0; i < count; i++) {
    let pick = R() * wsum, L = lumps[0];
    for (const l of lumps) { pick -= l.r * l.r; if (pick <= 0) { L = l; break; } }
    const d = randUnit(R);
    d[1] = d[1] * 0.85 + 0.12 - droop * 0.3;
    const sh = 0.72 + 0.28 * Math.sqrt(R());
    const p = [L.c[0] + d[0] * L.r * sh, L.c[1] + d[1] * L.r * sh * (1 - flat * 0.6), L.c[2] + d[2] * L.r * sh];
    // skip clusters buried inside a neighbouring lump (hidden overdraw)
    let buried = false;
    for (const l of lumps) {
      if (l === L) continue;
      const q = Math.hypot(p[0] - l.c[0], p[1] - l.c[1], p[2] - l.c[2]);
      if (q < l.r * 0.55) { buried = true; break; }
    }
    if (buried && R() < 0.75) continue;
    const out = norm3([p[0] - c[0], (p[1] - c[1]) * 0.6, p[2] - c[2]]);
    const sz = size * (0.75 + R() * 0.5);
    for (let q = 0; q < quads; q++) {
      let m;
      if (q === 0) m = norm3([out[0] * 0.7 + (R() - 0.5) * 0.6, out[1] * 0.7 + 0.25 + (R() - 0.5) * 0.6, out[2] * 0.7 + (R() - 0.5) * 0.6]);
      else m = randUnit(R);
      if (hang) m = norm3([m[0], m[1] * (1 - hang), m[2]]);
      const [ax, ay] = planeAxes(m, R, sz * 0.5, sz * 0.5);
      const cc = hang ? [p[0], p[1] - sz * 0.25 * hang, p[2]] : p;
      card(g, cc, ax, ay, uv, shade, c);
    }
  }
  return lumps;
}

/** Limbs from the trunk top into each lump (+ thinner twigs on lod 0). */
function limbs(g, R, base, lumps, r0, lod, bandName, col, maxN = 8, reach = 0.8) {
  const segs = lod === 0 ? 6 : 4;
  let n = 0;
  for (let i = 1; i < lumps.length && n < (lod === 0 ? maxN : Math.min(4, maxN)); i++, n++) {
    const L = lumps[i];
    const e = lerp3(base, L.c, reach);
    const hx = e[0] - base[0], hz = e[2] - base[2], hl = Math.hypot(hx, hz) || 1;
    const b0 = [base[0], base[1] - 0.25 - R() * 0.35, base[2]];
    // leave the trunk at ~40-55 deg, then bend up into the lump
    const out = Math.max(0.7, hl * 0.55);
    const m = [b0[0] + (hx / hl) * out, b0[1] + out * (0.8 + R() * 0.4), b0[2] + (hz / hl) * out];
    const rr = r0 * (0.55 + R() * 0.3);
    tube(g, spline([b0, m, e], lod === 0 ? 5 : 2), (t) => rr * (1 - t * 0.78), segs, bandName, col, col, 1, 1);
    if (lod === 0) {
      for (let k = 0; k < 2; k++) {
        const s0 = lerp3(b0, e, 0.45 + R() * 0.3);
        const d = randUnit(R);
        const s1 = [s0[0] + d[0] * L.r * 0.8, s0[1] + Math.abs(d[1]) * L.r * 0.7, s0[2] + d[2] * L.r * 0.8];
        const r1 = rr * 0.35;
        tube(g, [s0, lerp3(s0, s1, 0.5), s1], (t) => r1 * (1 - t * 0.8), 3, bandName, col, col, 1, 1);
      }
    }
  }
}

/** Main trunk: curved, tapered, with root flare. Returns the top point. */
function trunk(g, R, h, r0, lean, lod, bandName, colBot, colTop, uRep = 2, flare = 1.7, ctrl = 4) {
  const ang = R() * Math.PI * 2;
  const pts = [[0, 0, 0]];
  for (let i = 1; i <= ctrl; i++) {
    const t = i / ctrl;
    const w = (R() - 0.5) * 0.18 * h * 0.1;
    pts.push([Math.cos(ang) * lean * t * t * h + w, t * h, Math.sin(ang) * lean * t * t * h + w]);
  }
  const n = Math.max(3, Math.round(h / (lod === 0 ? 0.9 : 2.2)));
  const sp = spline(pts, n);
  tube(g, sp, (t) => r0 * (1 - t * 0.55) * (1 + (flare - 1) * Math.pow(Math.max(0, 1 - t * n * 0.7), 2)), lod === 0 ? 9 : 5, bandName, colBot, colTop, uRep, 1);
  return sp[sp.length - 1];
}

// ------------------------------------------------------------------------------------------------
// Species
// ------------------------------------------------------------------------------------------------
const BARK_C = [0.52, 0.42, 0.34], BARK_D = [0.36, 0.29, 0.24];
const LEAF_T = [1.0, 1.0, 1.0];

function broadleafLike(g, R, lod, o) {
  const top = trunk(g, R, o.hb + 0.3, o.tr, o.lean ?? 0.04, lod, o.band || 'bark', o.bc0 || BARK_D, o.bc1 || BARK_C, 2);
  const c = [top[0], o.cy, top[2]];
  const L = lod === 0 ? 1 : 0;
  const lumps = crown(g, R, {
    c, rx: o.rx, ry: o.ry, lumps: o.lumps, count: L ? o.count : Math.round(o.count * 0.3), size: L ? o.size : o.size * 1.7,
    cell: o.cell || 'leaf', tint: o.tint || LEAF_T, quads: L ? 3 : 2, flat: o.flat || 0, droop: o.droop || 0, hang: o.hang || 0,
  });
  limbs(g, R, [top[0], o.hb, top[2]], lumps, o.tr * 0.9, lod, o.band || 'bark', o.bc1 || BARK_C, o.maxLimbs || 8, o.reach || 0.8);
}

/** Italian cypress / Lombardy poplar: dense spindle of scale-foliage clusters around a hidden stem. */
function column(g, R, lod) {
  trunk(g, R, 3.0, 0.17, 0.01, lod, 'bark', BARK_D, BARK_C, 2, 1.4, 2);
  const uv = cellUV('cypress');
  const H = 10.6, y0 = 0.9;
  const prof = (f) => 1.25 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + f * 0.9)), 0.8) * (1 - f * 0.25) + 0.1;
  const shade = leafShade([1.12, 1.15, 1.05], [0, 5.4, 0], [1.3, 5.2, 1.3], R);
  const n = lod === 0 ? 230 : 60;
  for (let i = 0; i < n; i++) {
    const f = Math.pow(R(), 0.85), y = y0 + (H - y0) * f;
    const a = R() * Math.PI * 2, rad = prof(f) * (0.65 + 0.35 * Math.sqrt(R()));
    const p = [Math.cos(a) * rad, y, Math.sin(a) * rad];
    const sz = (lod === 0 ? 0.85 : 1.5) * (0.75 + R() * 0.5) * (0.7 + prof(f) * 0.3);
    const m = norm3([Math.cos(a) + (R() - 0.5) * 0.8, (R() - 0.5) * 0.6, Math.sin(a) + (R() - 0.5) * 0.8]);
    const [ax, ay] = planeAxes(m, R, sz * 0.45, sz * 0.6);
    card(g, p, ax, ay, uv, shade, [0, y, 0], 1.3, 0.2);
  }
}

function conifer(g, R, lod, H = 10.4, R0 = 2.5, tint = [1.1, 1.15, 1.08]) {
  const top = trunk(g, R, H, 0.2, 0.01, lod, 'bark', [0.3, 0.23, 0.19], [0.42, 0.32, 0.25], 2, 1.5, 3);
  const uv = cellUV('needle');
  const y0 = 1.5;
  const whorls = lod === 0 ? 20 : 9;
  const per = lod === 0 ? 8 : 6;
  const shade = leafShade(tint, [0, H * 0.45, 0], [R0, H * 0.6, R0], R);
  for (let w = 0; w < whorls; w++) {
    const f = w / (whorls - 1);
    const y = y0 + (H - y0 - 0.4) * f;
    const len = (R0 * Math.pow(1 - f, 0.95) + 0.35) * (0.85 + R() * 0.3);
    const off = R() * Math.PI * 2;
    const k = Math.max(3, Math.round(per * (1 - f * 0.45)));
    for (let b = 0; b < k; b++) {
      const a = off + (b / k) * Math.PI * 2 + (R() - 0.5) * 0.5;
      const droop = 0.18 + (1 - f) * 0.3 + R() * 0.1;
      const dir = [Math.cos(a), -droop, Math.sin(a)];
      const d = norm3(dir);
      const s = [top[0] * f, y, top[2] * f];
      const e = [s[0] + d[0] * len, s[1] + d[1] * len, s[2] + d[2] * len];
      if (lod === 0 && f < 0.75) tube(g, [s, lerp3(s, e, 0.5), [e[0], e[1] + 0.15, e[2]]], (t) => 0.06 * (1 - t * 0.8) * (1.2 - f), 3, 'bark', [0.3, 0.24, 0.2], [0.34, 0.27, 0.22], 1, 1);
      // needle sprays: V pair along the branch (tilted +-35deg around the branch axis), tip curls up
      const nCards = lod === 0 ? (len > 1.2 ? 2 : 1) : 1;
      const side = norm3(cross(d, [0, 1, 0]));
      for (let q = 0; q < nCards; q++) {
        const t0 = nCards === 1 ? 0.5 : q === 0 ? 0.32 : 0.74;
        const cl = len * (nCards === 1 ? 1.05 : 0.6);
        const cc = lerp3(s, e, t0);
        cc[1] += 0.08;
        const ax = [d[0] * cl * 0.5, d[1] * cl * 0.5 + 0.08, d[2] * cl * 0.5];
        for (const tilt of lod === 0 ? [-0.6, 0.6] : [0]) {
          const ct = Math.cos(tilt), st = Math.sin(tilt);
          const wv = [side[0] * ct, st, side[2] * ct];
          const wid = cl * 0.5 * (lod === 0 ? 0.95 : 1.15);
          card(g, cc, ax, [wv[0] * wid, wv[1] * wid, wv[2] * wid], uv, shade, [0, H * 0.35, 0], 1.3, 0.25);
        }
      }
    }
  }
  // inner fill sprays around the stem + leader
  const fills = lod === 0 ? 26 : 8;
  for (let q = 0; q < fills; q++) {
    const f = q / fills, y = y0 + (H - y0) * f, a = q * 2.39996;
    const w = (R0 * (1 - f) * 0.55 + 0.3);
    const d = [Math.cos(a), -0.25, Math.sin(a)];
    card(g, [top[0] * f + d[0] * w * 0.5, y, top[2] * f + d[2] * w * 0.5], [d[0] * w * 0.6, d[1] * w * 0.6, d[2] * w * 0.6], [-d[2] * w * 0.5, 0.25 * w, d[0] * w * 0.5], uv, shade, [0, H * 0.35, 0], 1.3, 0.25);
  }
  card(g, [top[0], H + 0.2, top[2]], [0.35, 0, 0], [0, 0.6, 0], uv, shade, [0, H * 0.4, 0], 1.3, 0.3);
}

/** Palm frond strip: V-folded, arching spine from p0 heading `a` with rise/droop; half of the frond texture per side. */
function frond(g, R, p0, a, L, W, rise, droop, segs, tint, sway = 1.3, dead = false) {
  const [u0, v0, u1, v1] = cellUV('frond');
  const vm = (v0 + v1) * 0.5;
  const dx = Math.cos(a), dz = Math.sin(a);
  const side = [-dz, 0, dx];
  const fold = 0.42;
  const spine = [];
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    spine.push([p0[0] + dx * L * t, p0[1] + rise * t - droop * t * t, p0[2] + dz * L * t, t]);
  }
  const col = dead ? [0.95, 0.72, 0.42] : tint;
  for (const sgn of [-1, 1]) {
    const b = g.n;
    for (let k = 0; k <= segs; k++) {
      const [x, y, z, t] = spine[k];
      const w = W * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.06)));
      const ex = x + side[0] * sgn * w, ey = y - fold * w * (1 + t), ez = z + side[2] * sgn * w;
      const ny = 1;
      const nx = side[0] * sgn * 0.45, nz = side[2] * sgn * 0.45;
      const nn = norm3([nx + dx * 0.1, ny, nz + dz * 0.1]);
      const u = u0 + (u1 - u0) * t;
      const ao = 0.62 + 0.38 * t;
      g.v(x, y, z, nn[0], nn[1], nn[2], u, vm, col[0] * ao, col[1] * ao, col[2] * ao, sway);
      g.v(ex, ey, ez, nn[0], nn[1], nn[2], u, sgn < 0 ? v1 : v0, col[0] * ao, col[1] * ao, col[2] * ao, sway);
    }
    for (let k = 0; k < segs; k++) {
      const i0 = b + k * 2;
      g.I.push(i0, i0 + 2, i0 + 3, i0, i0 + 3, i0 + 1);
    }
  }
}

function ball(g, c, r, col, segs = 5) {
  const [vb, vt] = bandV('plain');
  const b = g.n;
  for (let i = 0; i <= segs; i++) {
    const th = (i / segs) * Math.PI;
    for (let k = 0; k <= segs; k++) {
      const ph = (k / segs) * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
      g.v(c[0] + nx * r, c[1] + ny * r, c[2] + nz * r, nx, ny, nz, k / segs, vb + (vt - vb) * 0.5, col[0], col[1], col[2], 1);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < segs; k++) {
    const a = b + i * (segs + 1) + k, d = a + segs + 1;
    g.I.push(a, d, a + 1, a + 1, d, d + 1);
  }
}

function palm(g, R, lod) {
  // curved, slightly leaning trunk
  const lean = 1.1 + R() * 0.6, a = R() * Math.PI * 2;
  const ctrl = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    ctrl.push([Math.cos(a) * lean * t * t, t * 8.6, Math.sin(a) * lean * t * t]);
  }
  const sp = spline(ctrl, lod === 0 ? 12 : 5);
  tube(g, sp, (t) => 0.21 * (1 - t * 0.32) * (1 + 0.5 * Math.pow(Math.max(0, 1 - t * 6), 2)), lod === 0 ? 8 : 5, 'palm', [0.62, 0.55, 0.46], [0.74, 0.66, 0.54], 2, 1);
  const top = sp[sp.length - 1];
  const n = lod === 0 ? 14 : 9;
  for (let f = 0; f < n; f++) {
    const fa = (f / n) * Math.PI * 2 + R() * 0.3;
    const upper = f % 3 !== 0;
    frond(g, R, [top[0], top[1] + 0.1, top[2]], fa, 3.8 + R() * 0.7, 0.72, upper ? 1.3 : 0.4, upper ? 2.6 : 2.4, lod === 0 ? 6 : 3, [0.95, 1.0, 0.9]);
  }
  if (lod === 0) {
    for (let k = 0; k < 5; k++) {
      const ca = R() * Math.PI * 2;
      ball(g, [top[0] + Math.cos(ca) * 0.28, top[1] - 0.25 - R() * 0.2, top[2] + Math.sin(ca) * 0.28], 0.16, [0.42, 0.4, 0.18], 4);
    }
    ball(g, [top[0], top[1] - 0.05, top[2]], 0.3, [0.45, 0.4, 0.26], 4);
  }
}

function datepalm(g, R, lod) {
  const sp = spline([[0, 0, 0], [0.05, 4, 0.03], [0.1, 8.2, 0.05]], lod === 0 ? 10 : 4);
  tube(g, sp, (t) => 0.33 * (1 - t * 0.12) * (1 + 0.35 * Math.pow(Math.max(0, 1 - t * 5), 2)), lod === 0 ? 9 : 6, 'diamond', [0.78, 0.7, 0.6], [0.88, 0.8, 0.68], 3, 1);
  const top = sp[sp.length - 1];
  const n = lod === 0 ? 24 : 12;
  const tint = [0.86, 0.95, 0.98];
  for (let f = 0; f < n; f++) {
    const fa = f * 2.39996 + R() * 0.2; // golden angle
    const tier = f % 3;
    const rise = tier === 0 ? 2.6 : tier === 1 ? 1.4 : 0.2;
    frond(g, R, [top[0], top[1], top[2]], fa, 3.4 + R() * 0.5, 0.42, rise, tier === 2 ? 2.2 : 1.6, lod === 0 ? 5 : 3, tint);
  }
  // dead brown skirt
  if (lod === 0) for (let f = 0; f < 8; f++) frond(g, R, [top[0], top[1] - 0.4, top[2]], f * 0.785 + R() * 0.3, 2.2, 0.3, -0.6, 0.8, 2, tint, 1, true);
}

function banana(g, R, lod) {
  const sp = spline([[0, 0, 0], [0.03, 1.2, 0], [0.05, 2.4, 0.02]], lod === 0 ? 4 : 2);
  tube(g, sp, (t) => 0.17 * (1 - t * 0.3), lod === 0 ? 7 : 5, 'plain', [0.42, 0.44, 0.24], [0.4, 0.52, 0.26], 1, 1);
  const top = sp[sp.length - 1];
  const [u0, v0, u1, v1] = cellUV('banana');
  const vm = (v0 + v1) / 2;
  const n = lod === 0 ? 10 : 6;
  for (let f = 0; f < n; f++) {
    const a = f * 2.39996 + R() * 0.3;
    const dx = Math.cos(a), dz = Math.sin(a), side = [-dz, 0, dx];
    const L = 2.0 + R() * 0.6, W = 0.62, segs = lod === 0 ? 5 : 3;
    const rise = 2.0 + R() * 0.8, droop = 1.6 + R() * 0.6;
    for (const sgn of [-1, 1]) {
      const b = g.n;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const x = top[0] + dx * L * t * 0.95, y = top[1] - 0.2 + rise * t - droop * t * t, z = top[2] + dz * L * t * 0.95;
        const w = W * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.08));
        const nn = norm3([side[0] * sgn * 0.3, 1, side[2] * sgn * 0.3]);
        const u = u0 + (u1 - u0) * t, ao = 0.7 + 0.3 * t;
        g.v(x, y, z, nn[0], nn[1], nn[2], u, vm, ao, ao, ao * 0.95, 1.3);
        g.v(x + side[0] * sgn * w, y - w * 0.25, z + side[2] * sgn * w, nn[0], nn[1], nn[2], u, sgn < 0 ? v1 : v0, ao, ao, ao * 0.95, 1.3);
      }
      for (let k = 0; k < segs; k++) { const i0 = b + k * 2; g.I.push(i0, i0 + 2, i0 + 3, i0, i0 + 3, i0 + 1); }
    }
  }
}

function cactus(g, R, lod) {
  const C0 = [0.24, 0.42, 0.22], C1 = [0.34, 0.52, 0.3];
  const rib = (t, a) => 1 + 0.09 * Math.cos(a * 12);
  const segs = lod === 0 ? 24 : 10;
  // columns with domed tops: extra rings over the last radius of height
  const domeTube = (x, y0, h, r0, n, s) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push([x, y0 + (h - r0) * (i / n), 0]);
    const k = lod === 0 ? 4 : 2;
    for (let i = 1; i <= k; i++) pts.push([x, y0 + h - r0 + r0 * Math.sin((i / k) * Math.PI / 2), 0]);
    const N = pts.length - 1;
    tube(g, pts, (t) => {
      const i = Math.round(t * N);
      if (i <= n) return r0;
      return Math.max(0.02, r0 * Math.cos(((i - n) / k) * Math.PI / 2));
    }, s, 'plain', C0, C1, 1, 0, rib);
  };
  domeTube(0, 0, 6.4, 0.36, lod === 0 ? 7 : 3, segs);
  for (const [dir, y0, h] of [[1, 2.4, 2.1], [-1, 3.2, 1.7]]) {
    const ctrl = [[dir * 0.2, y0, 0], [dir * 0.85, y0 + 0.05, 0], [dir * 1.05, y0 + 0.45, 0]];
    tube(g, spline(ctrl, lod === 0 ? 5 : 2), () => 0.21, lod === 0 ? 16 : 8, 'plain', C0, C1, 1, 0, rib);
    domeTube(dir * 1.05, y0 + 0.4, h - 0.4, 0.21, lod === 0 ? 4 : 2, lod === 0 ? 16 : 8);
  }
}

function bamboo(g, R, lod) {
  const S0 = [0.5, 0.6, 0.26], S1 = [0.58, 0.68, 0.3];
  const uv = cellUV('bamboo');
  const tint = [1.1, 1.12, 1.0];
  const shade = leafShade(tint, [0, 5.4, 0], [1.6, 3.0, 1.6], R);
  const n = lod === 0 ? 9 : 6;
  for (let k = 0; k < n; k++) {
    const a = k * 2.39996, r = 0.15 + (k % 3) * 0.12;
    const h = 6.2 + R() * 2.2, lean = 0.05 + R() * 0.12;
    const base = [Math.cos(a) * r, 0, Math.sin(a) * r];
    const tip = [base[0] + Math.cos(a) * lean * h, h, base[2] + Math.sin(a) * lean * h];
    const mid = [base[0] + Math.cos(a) * lean * h * 0.35, h * 0.5, base[2] + Math.sin(a) * lean * h * 0.35];
    const pts = spline([base, mid, tip], lod === 0 ? 10 : 3);
    // node rings: alternate segment shade
    tube(g, pts, (t) => 0.06 * (1 - t * 0.4), lod === 0 ? 6 : 4, 'plain', S0, S1, 1, 1);
    const nc = lod === 0 ? 11 : 4;
    for (let q = 0; q < nc; q++) {
      const t = 0.45 + (q / nc) * 0.55;
      const p = pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))];
      const m = randUnit(R);
      const sz = (lod === 0 ? 1.5 : 2.2) * (0.8 + R() * 0.4);
      const [ax, ay] = planeAxes(norm3([m[0], m[1] * 0.4, m[2]]), R, sz * 0.5, sz * 0.5);
      card(g, [p[0] + m[0] * 0.4, p[1] - 0.2, p[2] + m[2] * 0.4], ax, ay, uv, shade, [0, 5, 0]);
    }
  }
}

function bare(g, R, lod) {
  const col0 = [0.34, 0.28, 0.23], col1 = [0.42, 0.35, 0.29];
  const top = trunk(g, R, 3.6, 0.24, 0.04, lod, 'bark', col0, col1, 2);
  const uv = cellUV('twig');
  const shade = () => [0.75, 0.68, 0.6];
  const rec = (p, d, len, r, depth) => {
    const e = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
    const m = lerp3(p, e, 0.5);
    m[1] += len * 0.06;
    tube(g, [p, m, e], (t) => r * (1 - t * 0.45), depth >= 2 ? (lod === 0 ? 5 : 4) : 3, 'bark', col1, col1, 1, 1);
    if (depth === 0 || (lod === 1 && depth === 1)) {
      // twig card at the tip, facing roughly the branch direction
      const [ax, ay] = planeAxes(norm3([d[0], 0.2, d[2]]), R, 0.9, 0.7);
      card(g, [e[0] + d[0] * 0.5, e[1] + 0.4, e[2] + d[2] * 0.5], [ax[0], ax[1] * 0.2, ax[2]], [0, 0.75, 0], uv, shade, null, 1.3, 0.6);
      return;
    }
    const k = depth >= 2 ? 2 : 2 + (R() < 0.4 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const nd = norm3([d[0] + (R() - 0.5) * 1.1, d[1] + 0.25 + R() * 0.4, d[2] + (R() - 0.5) * 1.1]);
      rec(e, nd, len * (0.62 + R() * 0.15), r * 0.62, depth - 1);
    }
  };
  const nLimb = 5;
  for (let i = 0; i < nLimb; i++) {
    const a = (i / nLimb) * Math.PI * 2 + R() * 0.6;
    const el = 0.55 + R() * 0.5;
    const d = norm3([Math.cos(a) * Math.cos(el), Math.sin(el) + 0.2, Math.sin(a) * Math.cos(el)]);
    const y = 2.6 + R() * 1.0;
    rec([top[0] * (y / 3.6), y, top[2] * (y / 3.6)], d, 2.2 + R() * 0.6, 0.12, lod === 0 ? 3 : 1);
  }
}

function bush(g, R, lod) {
  const uv = cellUV('leaf');
  const c = [0, 0.62, 0];
  const shade = leafShade([0.92, 0.96, 0.88], c, [1.1, 0.75, 1.1], R);
  const lumps = [[0, 0.62, 0, 0.75], [0.5, 0.55, 0.3, 0.55], [-0.45, 0.5, -0.25, 0.52], [0.1, 0.5, -0.55, 0.5]];
  const count = lod === 0 ? 46 : 14;
  for (let i = 0; i < count; i++) {
    const L = lumps[i % lumps.length];
    const d = randUnit(R);
    d[1] = Math.abs(d[1]) * 0.9 + 0.05;
    const p = [L[0] + d[0] * L[3] * 0.85, L[1] + d[1] * L[3] * 0.7, L[2] + d[2] * L[3] * 0.85];
    const sz = (lod === 0 ? 0.8 : 1.25) * (0.8 + R() * 0.4);
    const m = norm3([d[0] + (R() - 0.5), d[1] + 0.3, d[2] + (R() - 0.5)]);
    const [ax, ay] = planeAxes(m, R, sz * 0.5, sz * 0.5);
    card(g, p, ax, ay, uv, shade, c, 1.3, 0.3);
  }
}

// Collision / hit-test dims at instance scale 1 (h: top, cy/cr: canopy sphere, tr: trunk radius)
export const TREE_DIM = {
  [SP_BROADLEAF]: { h: 9.0, cy: 5.6, cr: 3.6, tr: 0.3 },
  [SP_TALL]: { h: 10.6, cy: 6.4, cr: 2.9, tr: 0.26 },
  [SP_CONIFER]: { h: 10.6, cy: 4.6, cr: 2.6, tr: 0.22 },
  [SP_PALM]: { h: 9.8, cy: 8.6, cr: 3.4, tr: 0.22 },
  [SP_BUSH]: { h: 1.4, cy: 0.6, cr: 1.1, tr: 0.5 },
  [SP_COLUMN]: { h: 10.8, cy: 5.6, cr: 1.4, tr: 0.18 },
  [SP_UMBRELLA]: { h: 7.6, cy: 6.0, cr: 3.9, tr: 0.28 },
  [SP_EUCALYPT]: { h: 12.8, cy: 8.8, cr: 3.4, tr: 0.28 },
  [SP_CACTUS]: { h: 6.4, cy: 3.4, cr: 1.2, tr: 0.38 },
  [SP_BANANA]: { h: 3.6, cy: 2.8, cr: 2.0, tr: 0.18 },
  [SP_DATEPALM]: { h: 10.6, cy: 8.6, cr: 3.4, tr: 0.33 },
  [SP_BIRCH]: { h: 9.8, cy: 6.4, cr: 2.0, tr: 0.15 },
  [SP_BAMBOO]: { h: 8.6, cy: 5.4, cr: 1.8, tr: 0.35 },
  [SP_BARE]: { h: 8.4, cy: 5.5, cr: 3.2, tr: 0.25 },
};

const SPECIES_BUILD = {
  [SP_BROADLEAF]: (g, R, lod) => broadleafLike(g, R, lod, { hb: 2.8, tr: 0.27, cy: 5.6, rx: 3.3, ry: 2.7, lumps: 6, count: 150, size: 1.45 }),
  [SP_TALL]: (g, R, lod) => broadleafLike(g, R, lod, { hb: 2.6, tr: 0.23, cy: 6.4, rx: 2.3, ry: 3.9, lumps: 6, count: 140, size: 1.3, tint: [0.96, 1.02, 0.94] }),
  [SP_CONIFER]: (g, R, lod) => conifer(g, R, lod),
  [SP_PALM]: (g, R, lod) => palm(g, R, lod),
  [SP_BUSH]: (g, R, lod) => bush(g, R, lod),
  [SP_COLUMN]: (g, R, lod) => column(g, R, lod),
  [SP_UMBRELLA]: (g, R, lod) => broadleafLike(g, R, lod, { hb: 4.4, tr: 0.26, cy: 6.2, rx: 3.8, ry: 1.0, lumps: 7, count: 150, size: 1.4, cell: 'small', tint: [0.82, 0.95, 0.8], flat: 0.75, maxLimbs: 5, reach: 0.9, lean: 0.06 }),
  [SP_EUCALYPT]: (g, R, lod) => broadleafLike(g, R, lod, { hb: 5.6, tr: 0.27, cy: 8.8, rx: 3.0, ry: 2.6, lumps: 5, count: 110, size: 1.5, cell: 'small', tint: [0.86, 0.98, 1.02], band: 'birch', bc0: [0.72, 0.66, 0.58], bc1: [0.86, 0.82, 0.74], hang: 0.6, lean: 0.06 }),
  [SP_CACTUS]: (g, R, lod) => cactus(g, R, lod),
  [SP_BANANA]: (g, R, lod) => banana(g, R, lod),
  [SP_DATEPALM]: (g, R, lod) => datepalm(g, R, lod),
  [SP_BIRCH]: (g, R, lod) => broadleafLike(g, R, lod, { hb: 5.2, tr: 0.15, cy: 6.6, rx: 1.8, ry: 3.1, maxLimbs: 6, reach: 0.65, lumps: 5, count: 120, size: 1.1, cell: 'small', tint: [1.04, 1.08, 0.9], band: 'birch', bc0: [0.62, 0.6, 0.56], bc1: [0.98, 0.97, 0.94], hang: 0.45, lean: 0.07 }),
  [SP_BAMBOO]: (g, R, lod) => bamboo(g, R, lod),
  [SP_BARE]: (g, R, lod) => bare(g, R, lod),
};

const GEO_CACHE = new Map();

/** Cached per (species, lod). Callers must not dispose the result. */
export function buildTreeGeometry(sp, lod) {
  const key = sp * 4 + lod;
  let geo = GEO_CACHE.get(key);
  if (geo) return geo;
  const g = new Geo();
  (SPECIES_BUILD[sp] || SPECIES_BUILD[SP_BROADLEAF])(g, mulberry(1013 + sp * 7919), lod);
  geo = g.build();
  geo.userData.species = sp;
  GEO_CACHE.set(key, geo);
  return geo;
}

/** Stump left by a snapped tree: short flared trunk with a jagged top (unit radius 1 -> scaled per instance). */
let STUMP = null;
export function buildStumpGeometry() {
  if (STUMP) return STUMP;
  const g = new Geo();
  const R = mulberry(77);
  const jag = [];
  for (let k = 0; k <= 9; k++) jag.push(0.75 + R() * 0.5);
  jag[9] = jag[0];
  tube(g, [[0, 0, 0], [0, 0.45, 0], [0, 0.9, 0]], (t) => 1 + 0.5 * Math.pow(1 - t, 3), 9, 'bark', [0.3, 0.24, 0.2], [0.4, 0.32, 0.26], 2, 0);
  // splintered top (pale wood), jagged rim
  const [vb] = bandV('plain');
  const b = g.n;
  g.v(0, 1.05, 0, 0, 1, 0, 0.5, vb, 0.78, 0.66, 0.48, 0);
  for (let k = 0; k <= 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    g.v(Math.cos(a), 0.9 + (jag[k] - 0.75) * 0.6, Math.sin(a), 0, 1, 0, 0.5, vb, 0.62, 0.5, 0.36, 0);
  }
  for (let k = 0; k < 9; k++) g.I.push(b, b + k + 2, b + k + 1);
  STUMP = g.build();
  return STUMP;
}

/** Species bounding box at scale 1 (for impostor framing). */
export function treeExtent(sp) {
  const geo = buildTreeGeometry(sp, 1);
  const bb = geo.boundingBox;
  const w = 2 * Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z));
  return [Math.max(1, w * 1.02), Math.max(1, bb.max.y * 1.02)];
}

export { SPECIES_COUNT };
