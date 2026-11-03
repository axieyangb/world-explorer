/**
 * [roofs] Regional facade layers, drawn procedurally and appended to the facade texture array after the 24 photo
 * layers of assets/facades/facade_strip.jpg (layers 24..). Same layout contract as the strip: a 512 x 512 tile is
 * 4 floors x 4 bays (so the night window-light grid in the building shader applies unchanged), RGB = albedo,
 * A = window mask (>= 0.56 glass) — plus one extension for these layers only: A ~0.12 marks paintable wall (the
 * per-building wall tint applies there; A = 0 trim / shutters / stone keep their own colour).
 *
 * The catalog entries are plain data (worker-safe); `drawExtraFacadeLayers` needs a DOM canvas (main thread).
 * Layer L >= 24 is addressed as uv = (u, 999 + (L - 24) * 200 + v) (facadeV in wfc_mesh_builder.js): the u range
 * 24000..35999 is the door atlas and float32 uv that large is too coarse for 512 px tiles.
 */

export const EXTRA_FACADE_BASE = 24;
export const EXTRA_FACADES = [
  { id: 'sf_victorian', index: 24, floors: 4, bays: 4, metersPerFloor: 3.5, metersPerBay: 2.6, isCurtainWall: false, avgColor: [0.70, 0.69, 0.66], paint: true },
  { id: 'stucco_spanish', index: 25, floors: 4, bays: 4, metersPerFloor: 3.3, metersPerBay: 3.2, isCurtainWall: false, avgColor: [0.76, 0.73, 0.68], paint: true },
  { id: 'med_shutters', index: 26, floors: 4, bays: 4, metersPerFloor: 3.6, metersPerBay: 3.3, isCurtainWall: false, avgColor: [0.70, 0.66, 0.58], paint: true },
  { id: 'latam_colour', index: 27, floors: 4, bays: 4, metersPerFloor: 3.0, metersPerBay: 3.4, isCurtainWall: false, avgColor: [0.72, 0.70, 0.66], paint: true },
  { id: 'mideast_sand', index: 28, floors: 4, bays: 4, metersPerFloor: 3.6, metersPerBay: 3.6, isCurtainWall: false, avgColor: [0.74, 0.64, 0.50] },
  { id: 'nordic_wood', index: 29, floors: 4, bays: 4, metersPerFloor: 3.0, metersPerBay: 2.9, isCurtainWall: false, avgColor: [0.72, 0.71, 0.69], paint: true },
  { id: 'asia_dense', index: 30, floors: 4, bays: 4, metersPerFloor: 3.0, metersPerBay: 3.2, isCurtainWall: false, avgColor: [0.66, 0.66, 0.64] },
  { id: 'dubai_tower', index: 31, floors: 4, bays: 4, metersPerFloor: 3.8, metersPerBay: 3.4, isCurtainWall: true, avgColor: [0.56, 0.58, 0.58] },
  { id: 'jp_house', index: 32, floors: 4, bays: 4, metersPerFloor: 2.9, metersPerBay: 2.9, isCurtainWall: false, avgColor: [0.74, 0.72, 0.68] },
  { id: 'us_brick_house', index: 33, floors: 4, bays: 4, metersPerFloor: 3.0, metersPerBay: 3.0, isCurtainWall: false, avgColor: [0.52, 0.38, 0.32] },
  { id: 'art_deco_terracotta', index: 34, floors: 4, bays: 4, metersPerFloor: 3.7, metersPerBay: 3.5, isCurtainWall: false, avgColor: [0.68, 0.58, 0.46], paint: true },
  { id: 'haussmann_limestone', index: 35, floors: 4, bays: 4, metersPerFloor: 3.6, metersPerBay: 3.4, isCurtainWall: false, avgColor: [0.78, 0.74, 0.66], paint: true },
  { id: 'brutalist_coffered', index: 36, floors: 4, bays: 4, metersPerFloor: 3.7, metersPerBay: 3.8, isCurtainWall: false, avgColor: [0.58, 0.57, 0.54] },
  { id: 'tudor_half_timber', index: 37, floors: 4, bays: 4, metersPerFloor: 3.1, metersPerBay: 3.0, isCurtainWall: false, avgColor: [0.72, 0.66, 0.56], paint: true },
  { id: 'modern_timber_louvre', index: 38, floors: 4, bays: 4, metersPerFloor: 3.5, metersPerBay: 3.6, isCurtainWall: true, avgColor: [0.64, 0.48, 0.34] },
  { id: 'neoclassical_ashlar', index: 39, floors: 4, bays: 4, metersPerFloor: 3.8, metersPerBay: 3.6, isCurtainWall: false, avgColor: [0.76, 0.73, 0.67], paint: true },
  { id: 'venetian_gothic', index: 40, floors: 4, bays: 4, metersPerFloor: 3.6, metersPerBay: 3.3, isCurtainWall: false, avgColor: [0.72, 0.54, 0.46], paint: true },
  { id: 'high_tech_diagrid', index: 41, floors: 4, bays: 4, metersPerFloor: 3.9, metersPerBay: 3.8, isCurtainWall: true, avgColor: [0.42, 0.54, 0.64] },
];

/** Paint palettes for the paintable layers, by arch region (rgb multipliers on the light neutral wall). */
export const PAINT_PALETTES = {
  sf_victorian: [[0.62, 0.76, 0.92], [1.0, 0.86, 0.52], [0.68, 0.86, 0.66], [0.98, 0.70, 0.64], [0.80, 0.72, 0.94], [1.0, 0.97, 0.88], [0.52, 0.64, 0.80], [0.94, 0.68, 0.46], [0.60, 0.82, 0.80]],
  stucco_spanish: [[1.0, 0.97, 0.90], [0.98, 0.90, 0.78], [0.96, 0.86, 0.76], [1.0, 0.98, 0.95], [0.94, 0.88, 0.80], [0.92, 0.84, 0.72]],
  med_shutters: [[0.96, 0.78, 0.52], [0.92, 0.68, 0.46], [0.98, 0.86, 0.62], [0.90, 0.62, 0.48], [0.96, 0.90, 0.78], [0.86, 0.56, 0.40], [0.98, 0.82, 0.70]],
  latam_colour: [[1.0, 0.82, 0.42], [0.55, 0.80, 0.92], [0.98, 0.64, 0.56], [0.66, 0.88, 0.62], [1.0, 0.98, 0.94], [0.96, 0.70, 0.82], [0.98, 0.90, 0.74], [0.90, 0.95, 0.98]],
  nordic_wood: [[0.66, 0.26, 0.20], [0.96, 0.84, 0.52], [1.0, 1.0, 0.98], [0.64, 0.76, 0.84], [0.84, 0.86, 0.80], [0.40, 0.42, 0.40], [0.94, 0.90, 0.80], [0.72, 0.36, 0.26]],
  art_deco_terracotta: [[0.98, 0.90, 0.78], [0.92, 0.76, 0.58], [0.84, 0.88, 0.82], [0.95, 0.82, 0.68], [0.88, 0.84, 0.78]],
  haussmann_limestone: [[1.0, 0.97, 0.90], [0.96, 0.92, 0.84], [0.92, 0.89, 0.82], [0.98, 0.95, 0.88]],
  tudor_half_timber: [[1.0, 0.97, 0.90], [0.98, 0.92, 0.80], [0.95, 0.88, 0.76], [0.96, 0.94, 0.88]],
  neoclassical_ashlar: [[0.98, 0.95, 0.88], [0.94, 0.88, 0.76], [0.90, 0.92, 0.94], [0.96, 0.86, 0.74]],
  venetian_gothic: [[0.96, 0.72, 0.58], [0.98, 0.84, 0.64], [0.90, 0.60, 0.50], [0.94, 0.88, 0.78], [0.88, 0.66, 0.52]],
};

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

const css = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
const shade = (c, s) => [Math.min(1, c[0] * s), Math.min(1, c[1] * s), Math.min(1, c[2] * s)];
const PAINT = 31, TRIM = 0, GLASS = 255;

/** Painter over an RGB canvas and its mask twin. */
function painter(S) {
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const mk = document.createElement('canvas');
  mk.width = S; mk.height = S;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const m = mk.getContext('2d', { willReadFrequently: true });
  const P = {
    cv, mk, c, m,
    rect(x, y, w, h, rgb, mask) {
      c.fillStyle = css(rgb); c.fillRect(x, y, w, h);
      if (mask !== undefined) { m.fillStyle = `rgb(${mask},${mask},${mask})`; m.fillRect(x, y, w, h); }
    },
    path(fn, rgb, mask) {
      c.beginPath(); fn(c); c.fillStyle = css(rgb); c.fill();
      if (mask !== undefined) { m.beginPath(); fn(m); m.fillStyle = `rgb(${mask},${mask},${mask})`; m.fill(); }
    },
    line(x1, y1, x2, y2, rgb, w) {
      c.strokeStyle = css(rgb); c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    },
    noise(rng, amt, cell = 2, mono = true) {
      const img = c.getImageData(0, 0, S, S);
      const d = img.data;
      for (let y = 0; y < S; y += cell) {
        for (let x = 0; x < S; x += cell) {
          const n = (rng() - 0.5) * 2 * amt;
          const n2 = mono ? n : (rng() - 0.5) * 2 * amt;
          for (let yy = y; yy < Math.min(S, y + cell); yy++) {
            for (let xx = x; xx < Math.min(S, x + cell); xx++) {
              const o = (yy * S + xx) * 4;
              d[o] = Math.max(0, Math.min(255, d[o] * (1 + n)));
              d[o + 1] = Math.max(0, Math.min(255, d[o + 1] * (1 + n2)));
              d[o + 2] = Math.max(0, Math.min(255, d[o + 2] * (1 + n)));
            }
          }
        }
      }
      c.putImageData(img, 0, 0);
    },
  };
  return P;
}

/** Glazing: dark glass with a soft sky gradient and a frame; mask 255 inside. */
function glazing(P, x, y, w, h, frame, glassTop = [0.42, 0.50, 0.58], glassBot = [0.16, 0.19, 0.23], fw = 4, muntins = 0) {
  P.rect(x - fw, y - fw, w + fw * 2, h + fw * 2, frame, TRIM);
  const g = P.c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(glassTop)); g.addColorStop(1, css(glassBot));
  P.c.fillStyle = g; P.c.fillRect(x, y, w, h);
  P.m.fillStyle = `rgb(${GLASS},${GLASS},${GLASS})`; P.m.fillRect(x, y, w, h);
  // curtain hint in the lower half (reads as an inhabited room)
  P.c.fillStyle = 'rgba(235,228,210,0.18)'; P.c.fillRect(x + w * 0.06, y + h * 0.1, w * 0.3, h * 0.85);
  if (muntins === 1) {
    P.rect(x, y + h * 0.5 - fw * 0.5, w, fw, frame);
  } else if (muntins === 2) {
    P.rect(x, y + h * 0.5 - fw * 0.5, w, fw, frame);
    P.rect(x + w * 0.5 - fw * 0.5, y, fw, h, frame);
  } else if (muntins === 3) { // 2-over-2 sash
    P.rect(x, y + h * 0.5 - fw * 0.5, w, fw, frame);
    P.rect(x + w * 0.5 - fw * 0.35, y, fw * 0.7, h, frame);
  }
}

// ---------------------------------------------------------------------------------------------------------------
const STYLES = {
  // SF Victorian / Edwardian: painted clapboard, tall narrow 2-over-2 sashes with white trim, bracketed cornices.
  sf_victorian(P, S, rng) {
    const wall = [0.86, 0.85, 0.82], trim = [0.95, 0.95, 0.93], dark = [0.16, 0.18, 0.2];
    P.rect(0, 0, S, S, wall, PAINT);
    for (let y = 0; y < S; y += 9) P.line(0, y + 8.5, S, y + 8.5, shade(wall, 0.72), 1.4); // clapboard shadows
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128;
      P.rect(0, y0, S, 7, trim, TRIM); // floor band / frieze
      for (let k = 0; k < S; k += 16) P.rect(k + 4, y0 + 7, 5, 6, shade(trim, 0.86), TRIM); // dentils
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128;
        const w = 40, h = 82, x = x0 + 44, y = y0 + 26;
        P.rect(x - 9, y - 16, w + 18, 12, trim, TRIM); // pediment hood
        P.path((c) => { c.moveTo(x - 9, y - 16); c.lineTo(x + w / 2, y - 26); c.lineTo(x + w + 9, y - 16); }, trim, TRIM);
        P.rect(x - 7, y - 4, 5, h + 8, trim, TRIM); P.rect(x + w + 2, y - 4, 5, h + 8, trim, TRIM); // casings
        glazing(P, x, y, w, h, trim, [0.46, 0.53, 0.6], [0.14, 0.16, 0.2], 3, 3);
        P.rect(x - 10, y + h + 2, w + 20, 7, trim, TRIM); // sill
        P.rect(x - 4, y + h + 9, w + 8, 4, shade(trim, 0.7), TRIM);
      }
    }
    P.noise(rng, 0.035, 2);
    void dark;
  },

  // Spanish Colonial / Mission revival stucco: few deep windows, arched heads, dark wood and wrought iron.
  stucco_spanish(P, S, rng) {
    const wall = [0.9, 0.88, 0.84], wood = [0.30, 0.20, 0.14], iron = [0.12, 0.12, 0.12];
    P.rect(0, 0, S, S, wall, PAINT);
    for (let f = 0; f < 4; f++) {
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128, y0 = f * 128;
        if ((b + f) % 4 === 3) continue; // blank stucco bay
        const arched = (b + f) % 2 === 0;
        const w = arched ? 50 : 62, h = 70, x = x0 + (128 - w) / 2, y = y0 + 32;
        P.rect(x - 6, y - 6, w + 12, h + 12, shade(wall, 0.7), TRIM); // reveal shadow
        if (arched) P.path((c) => { c.arc(x + w / 2, y, w / 2 + 6, Math.PI, 0); }, shade(wall, 0.7), TRIM);
        glazing(P, x, y, w, h, wood, [0.36, 0.40, 0.44], [0.10, 0.11, 0.12], 4, 2);
        if (arched) {
          P.path((c) => { c.arc(x + w / 2, y, w / 2, Math.PI, 0); }, [0.3, 0.33, 0.36], GLASS);
        } else {
          for (let k = 0; k < 6; k++) P.rect(x + 4 + k * (w - 8) / 5, y, 3, h, iron); // grille bars
          P.rect(x - 2, y + h * 0.5, w + 4, 3, iron);
        }
        P.rect(x - 8, y + h + 4, w + 16, 6, [0.66, 0.40, 0.30], TRIM); // tile sill
      }
    }
    P.noise(rng, 0.05, 3);
  },

  // Mediterranean (Rome / Barcelona): ochre stucco, tall windows with green louvred shutters, stone sills and courses.
  med_shutters(P, S, rng) {
    const wall = [0.88, 0.84, 0.76], stone = [0.84, 0.80, 0.72], shut = rng() < 0.5 ? [0.24, 0.36, 0.26] : [0.34, 0.26, 0.18];
    P.rect(0, 0, S, S, wall, PAINT);
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128;
      P.rect(0, y0 + 118, S, 8, stone, TRIM); // string course
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128;
        const w = 40, h = 78, x = x0 + 44, y = y0 + 26;
        P.rect(x - 8, y - 8, w + 16, h + 12, stone, TRIM); // stone surround
        P.rect(x - 12, y - 14, w + 24, 8, shade(stone, 0.95), TRIM); // cornice hood
        const open = (b * 7 + f * 3) % 5;
        if (open === 0) {
          // shutters closed
          P.rect(x, y, w, h, shut, TRIM);
          for (let k = y + 4; k < y + h; k += 6) P.rect(x + 2, k, w - 4, 2, shade(shut, 0.6));
          P.rect(x + w / 2 - 1, y, 2, h, shade(shut, 0.5));
        } else {
          glazing(P, x, y, w, h, [0.92, 0.9, 0.86], [0.34, 0.36, 0.38], [0.10, 0.10, 0.11], 3, 1);
          // open shutters folded against the wall
          for (const sx of [x - 8 - 20, x + w + 8]) {
            P.rect(sx, y, 20, h, shut, TRIM);
            for (let k = y + 4; k < y + h; k += 6) P.rect(sx + 2, k, 16, 2, shade(shut, 0.62));
          }
        }
        if (f === 1 && b % 2 === 0) { // small iron balcony
          P.rect(x - 10, y + h, w + 20, 5, stone, TRIM);
          for (let k = x - 8; k < x + w + 10; k += 5) P.rect(k, y + h - 22, 1.6, 22, [0.1, 0.1, 0.1]);
          P.rect(x - 10, y + h - 24, w + 20, 3, [0.1, 0.1, 0.1]);
        }
      }
    }
    P.noise(rng, 0.045, 4, false);
  },

  // Latin America (Rio): bright painted stucco, aluminium windows with grilles, small balconies with white rails, AC boxes.
  latam_colour(P, S, rng) {
    const wall = [0.9, 0.89, 0.86], rail = [0.95, 0.95, 0.94], alu = [0.7, 0.72, 0.74];
    P.rect(0, 0, S, S, wall, PAINT);
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128;
      P.rect(0, y0 + 120, S, 8, shade(wall, 0.8), TRIM); // slab edge
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128;
        const balcony = b % 2 === 0;
        const w = balcony ? 76 : 60, h = balcony ? 92 : 56, x = x0 + (128 - w) / 2, y = y0 + (balcony ? 22 : 36);
        glazing(P, x, y, w, h, alu, [0.5, 0.58, 0.64], [0.14, 0.17, 0.2], 3, 2);
        if (balcony) {
          P.rect(x - 14, y + h - 30, w + 28, 32, shade(wall, 0.86), TRIM); // balcony slab front
          P.rect(x - 14, y + h - 36, w + 28, 5, rail, TRIM);
          for (let k = x - 12; k < x + w + 14; k += 6) P.rect(k, y + h - 36, 2, 8, rail);
        } else {
          for (let k = x; k < x + w; k += 6) P.rect(k, y, 1.5, h, [0.2, 0.2, 0.22]);
          if ((f + b) % 3 === 0) P.rect(x + w + 6, y + h - 26, 26, 20, [0.86, 0.86, 0.84], TRIM); // AC box
        }
      }
    }
    P.noise(rng, 0.035, 3, false);
  },

  // Gulf modern: sand limestone panels, deep-set dark windows, mashrabiya lattice screens.
  mideast_sand(P, S, rng) {
    const stone = [0.84, 0.74, 0.58], joint = [0.7, 0.6, 0.46], lattice = [0.52, 0.36, 0.22];
    P.rect(0, 0, S, S, stone, TRIM);
    for (let y = 0; y < S; y += 32) P.rect(0, y, S, 2, joint);
    for (let x = 0; x < S; x += 64) for (let y = 0; y < S; y += 32) P.rect(x + ((y / 32) % 2) * 32, y, 2, 32, joint);
    for (let f = 0; f < 4; f++) {
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128, y0 = f * 128;
        const w = 70, h = 84, x = x0 + 29, y = y0 + 22;
        P.rect(x - 8, y - 8, w + 16, h + 16, shade(stone, 0.62), TRIM); // deep reveal
        if ((b === 1 || b === 2) && f % 2 === 1) {
          // mashrabiya: wooden lattice in front of the glass
          glazing(P, x, y, w, h, shade(stone, 0.62), [0.2, 0.18, 0.16], [0.08, 0.07, 0.06], 1, 0);
          P.c.fillStyle = css(lattice);
          for (let yy = y; yy < y + h; yy += 10) for (let xx = x; xx < x + w; xx += 10) {
            P.c.beginPath(); P.c.moveTo(xx + 5, yy); P.c.lineTo(xx + 10, yy + 5); P.c.lineTo(xx + 5, yy + 10); P.c.lineTo(xx, yy + 5); P.c.closePath();
            P.c.lineWidth = 2.2; P.c.strokeStyle = css(lattice); P.c.stroke();
          }
          P.m.fillStyle = 'rgb(150,150,150)'; P.m.fillRect(x, y, w, h); // half-transparent: dim lights behind screens
        } else {
          glazing(P, x, y, w, h, [0.62, 0.6, 0.56], [0.40, 0.50, 0.56], [0.12, 0.15, 0.18], 3, 1);
        }
      }
    }
    P.noise(rng, 0.045, 3);
  },

  // Scandinavian timber: vertical board-and-batten, white window frames with crossbars, white corner boards.
  nordic_wood(P, S, rng) {
    const wall = [0.86, 0.86, 0.84], white = [0.96, 0.96, 0.95];
    P.rect(0, 0, S, S, wall, PAINT);
    for (let x = 0; x < S; x += 12) { P.line(x + 11, 0, x + 11, S, shade(wall, 0.66), 2); P.line(x + 9, 0, x + 9, S, shade(wall, 1.1), 1); }
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128;
      P.rect(0, y0 + 122, S, 6, white, TRIM);
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128;
        if ((b + f * 3) % 5 === 4) continue;
        const w = 56, h = 64, x = x0 + 36, y = y0 + 34;
        P.rect(x - 10, y - 12, w + 20, 10, white, TRIM);
        P.rect(x - 8, y - 2, w + 16, h + 4, white, TRIM);
        glazing(P, x, y, w, h, white, [0.5, 0.58, 0.66], [0.15, 0.18, 0.22], 4, 2);
        P.rect(x - 10, y + h + 2, w + 20, 6, white, TRIM);
      }
    }
    P.noise(rng, 0.04, 2);
  },

  // Dense Tokyo / Hong Kong mid-rise: small tiles, balconies with rails, AC units, laundry, vertical shop signs.
  asia_dense(P, S, rng) {
    const tile = [0.82, 0.81, 0.78];
    P.rect(0, 0, S, S, tile, TRIM);
    for (let y = 0; y < S; y += 8) P.rect(0, y, S, 1, shade(tile, 0.86));
    for (let x = 0; x < S; x += 8) P.rect(x, 0, 1, S, shade(tile, 0.9));
    const signs = [[0.80, 0.16, 0.14], [0.95, 0.78, 0.12], [0.16, 0.4, 0.7], [0.9, 0.9, 0.88], [0.2, 0.55, 0.3]];
    for (let f = 0; f < 4; f++) {
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128, y0 = f * 128;
        const balc = b % 2 === 1;
        const w = balc ? 92 : 56, h = balc ? 84 : 48, x = x0 + (128 - w) / 2, y = y0 + (balc ? 20 : 38);
        glazing(P, x, y, w, h, [0.6, 0.62, 0.64], [0.44, 0.5, 0.56], [0.13, 0.15, 0.18], 3, balc ? 2 : 1);
        if (balc) {
          P.rect(x - 8, y + h - 34, w + 16, 36, [0.74, 0.74, 0.72], TRIM);
          for (let k = x - 6; k < x + w + 8; k += 5) P.rect(k, y + h - 34, 1.5, 10, [0.3, 0.32, 0.34]);
          if (rng() < 0.6) P.rect(x + 8, y + h - 30, 22, 16, [0.92, 0.92, 0.9], TRIM); // AC unit
          if (rng() < 0.4) for (let k = 0; k < 4; k++) P.rect(x + 40 + k * 10, y + 8, 8, 24, signs[(k + f) % 5].map((v) => v * 0.6 + 0.35)); // laundry
        } else if (rng() < 0.35) {
          const s = signs[Math.floor(rng() * signs.length)];
          P.rect(x0 + 6, y0 + 12, 22, 100, s, TRIM); // vertical sign
          P.c.fillStyle = 'rgba(255,255,255,0.75)';
          for (let k = 0; k < 4; k++) P.c.fillRect(x0 + 10, y0 + 18 + k * 23, 14, 14);
        }
      }
    }
    P.noise(rng, 0.04, 2);
  },

  // Gulf glass tower: blue-green glazing between sand spandrels and vertical fins.
  dubai_tower(P, S, rng) {
    const sand = [0.80, 0.72, 0.6], fin = [0.86, 0.8, 0.7];
    const g = P.c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, css([0.46, 0.6, 0.66])); g.addColorStop(1, css([0.26, 0.38, 0.44]));
    P.c.fillStyle = g; P.c.fillRect(0, 0, S, S);
    P.m.fillStyle = `rgb(${GLASS},${GLASS},${GLASS})`; P.m.fillRect(0, 0, S, S);
    for (let f = 0; f < 4; f++) P.rect(0, f * 128 + 100, S, 28, sand, TRIM);
    for (let x = 0; x < S; x += 32) P.rect(x, 0, 4, S, shade(sand, 0.8), TRIM);
    for (let b = 0; b < 4; b++) P.rect(b * 128 + 60, 0, 8, S, fin, TRIM);
    for (let i = 0; i < 40; i++) { // reflections
      const x = Math.floor(rng() * 16) * 32, y = Math.floor(rng() * 4) * 128;
      P.c.fillStyle = `rgba(255,255,255,${0.05 + rng() * 0.08})`; P.c.fillRect(x + 4, y, 28, 100);
    }
  },

  // Japanese detached house: ceramic siding with fine grooves, small aluminium windows, frosted glass.
  jp_house(P, S, rng) {
    const wall = [0.86, 0.84, 0.8], alu = [0.62, 0.62, 0.6];
    P.rect(0, 0, S, S, wall, TRIM);
    for (let y = 0; y < S; y += 16) P.rect(0, y, S, 1.5, shade(wall, 0.84));
    for (let x = 0; x < S; x += 96) P.rect(x, 0, 1.5, S, shade(wall, 0.88));
    for (let f = 0; f < 4; f++) {
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128, y0 = f * 128;
        const r = (b * 5 + f * 3) % 4;
        if (r === 3) continue;
        const big = r === 0;
        const w = big ? 80 : 44, h = big ? 72 : 36, x = x0 + (128 - w) / 2, y = y0 + (big ? 30 : 40);
        glazing(P, x, y, w, h, alu, big ? [0.48, 0.55, 0.6] : [0.78, 0.8, 0.8], big ? [0.16, 0.19, 0.22] : [0.66, 0.68, 0.68], 3, big ? 2 : 0);
        if (big && f % 2 === 1) for (let k = x; k < x + w; k += 4) P.rect(k, y + h - 24, 1.4, 24, [0.3, 0.3, 0.3]);
      }
    }
    P.noise(rng, 0.03, 2);
  },

  // US brick-veneer house (Houston / Texas / Midwest): running-bond brick, white-trim windows, black shutters.
  us_brick_house(P, S, rng) {
    const mortar = [0.74, 0.7, 0.64], white = [0.95, 0.95, 0.93], shutter = [0.12, 0.13, 0.14];
    P.rect(0, 0, S, S, mortar, TRIM);
    for (let y = 0; y < S; y += 8) {
      const off = (y / 8) % 2 ? 0 : 12;
      for (let x = -24; x < S; x += 24) {
        const v = 0.85 + rng() * 0.3;
        P.rect(x + off + 1, y + 1, 22, 6, [0.56 * v, 0.33 * v, 0.26 * v]);
      }
    }
    for (let f = 0; f < 4; f++) {
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128, y0 = f * 128;
        if ((b + f) % 4 === 2) continue;
        const w = 46, h = 66, x = x0 + 41, y = y0 + 32;
        P.rect(x - 22, y, 16, h, shutter, TRIM); P.rect(x + w + 6, y, 16, h, shutter, TRIM);
        glazing(P, x, y, w, h, white, [0.48, 0.55, 0.62], [0.15, 0.17, 0.2], 4, 3);
        P.rect(x - 6, y + h + 3, w + 12, 6, [0.82, 0.8, 0.76], TRIM);
        P.rect(x - 4, y - 10, w + 8, 8, [0.6, 0.36, 0.28], TRIM); // soldier course
      }
    }
    P.noise(rng, 0.03, 2);
  },

  // 34: Art Deco Terracotta & Brass: Fluted limestone/terracotta vertical piers, geometric brass chevron spandrel panels, and stepped-arch casement windows.
  art_deco_terracotta(P, S, rng) {
    const stone = [0.82, 0.72, 0.58], terra = [0.76, 0.56, 0.42], brass = [0.82, 0.66, 0.28], bronzeDk = [0.22, 0.18, 0.12];
    P.rect(0, 0, S, S, stone, PAINT);
    for (let b = 0; b < 4; b++) {
      const x0 = b * 128;
      // Fluted vertical terracotta piers flanking each bay
      for (const px of [x0, x0 + 104]) {
        P.rect(px, 0, 24, S, terra, TRIM);
        for (let fl = 3; fl < 22; fl += 5) {
          P.rect(px + fl, 0, 2, S, shade(terra, 0.74), TRIM);
          P.rect(px + fl + 2, 0, 1.5, S, shade(terra, 1.12), TRIM);
        }
      }
      for (let f = 0; f < 4; f++) {
        const y0 = f * 128;
        // Geometric brass chevron spandrel panel between floors
        const sx = x0 + 24, sw = 80, sy = y0 + 96, sh = 32;
        P.rect(sx, sy, sw, sh, bronzeDk, TRIM);
        P.rect(sx + 3, sy + 3, sw - 6, sh - 6, shade(bronzeDk, 1.25), TRIM);
        for (let k = -2; k < 6; k++) {
          const cx = sx + sw / 2, cy = sy + k * 7;
          P.path((c) => {
            c.moveTo(sx + 6, cy + 12);
            c.lineTo(cx, cy);
            c.lineTo(sx + sw - 6, cy + 12);
            c.lineTo(sx + sw - 6, cy + 15);
            c.lineTo(cx, cy + 3);
            c.lineTo(sx + 6, cy + 15);
            c.closePath();
          }, brass, TRIM);
        }
        // Sunburst stepped-arch crown + bronze casement window with Art Deco ziggurat mullions
        const wx = x0 + 30, wy = y0 + 18, ww = 68, wh = 74;
        P.rect(wx - 4, wy - 6, ww + 8, 8, brass, TRIM);
        P.rect(wx + 6, wy - 12, ww - 12, 6, brass, TRIM);
        P.rect(wx + 16, wy - 16, ww - 32, 4, shade(brass, 1.12), TRIM);
        glazing(P, wx, wy, ww, wh, bronzeDk, [0.46, 0.56, 0.62], [0.14, 0.18, 0.22], 3, 2);
        P.rect(wx + 16, wy, 2.5, wh, brass, TRIM);
        P.rect(wx + ww - 18.5, wy, 2.5, wh, brass, TRIM);
        P.rect(wx, wy + 18, ww, 2.5, brass, TRIM);
      }
    }
    P.noise(rng, 0.035, 2);
  },

  // 35: Haussmann Limestone: Warm Parisian dressed ashlar stone courses, tall French windows with transoms, molded stone lintels, and continuous wrought-iron fretwork balcony railings.
  haussmann_limestone(P, S, rng) {
    const stone = [0.88, 0.84, 0.76], joint = [0.74, 0.70, 0.62], iron = [0.11, 0.12, 0.13], frame = [0.94, 0.92, 0.88];
    P.rect(0, 0, S, S, stone, PAINT);
    for (let y = 0; y < S; y += 16) P.rect(0, y, S, 1.5, joint, TRIM);
    for (let y = 0; y < S; y += 16) {
      const off = ((y / 16) % 2) * 32;
      for (let x = off; x < S; x += 64) P.rect(x, y, 1.2, 16, shade(stone, 0.9), TRIM);
    }
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128;
      // Molded stone cornice / string course at each floor
      P.rect(0, y0 + 114, S, 10, shade(stone, 0.94), TRIM);
      P.rect(0, y0 + 124, S, 4, shade(stone, 0.72), TRIM);
      const contBalc = f === 0 || f === 2; // 2nd and 5th floor continuous balconies
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128;
        const wx = x0 + 34, wy = y0 + 20, ww = 60, wh = 92;
        // Molded stone architrave, keystone & corbelled pediment lintel
        P.rect(wx - 8, wy - 10, ww + 16, wh + 12, shade(stone, 0.96), TRIM);
        P.rect(wx - 12, wy - 15, ww + 24, 6, shade(stone, 0.82), TRIM);
        P.rect(wx + ww / 2 - 6, wy - 16, 12, 9, shade(stone, 1.04), TRIM);
        // Tall French double casement window + upper transom bar
        glazing(P, wx, wy, ww, wh, frame, [0.46, 0.54, 0.62], [0.13, 0.16, 0.21], 3, 0);
        P.rect(wx, wy + 22, ww, 3.5, frame, TRIM);
        P.rect(wx + ww / 2 - 2, wy + 22, 4, wh - 22, frame, TRIM);
        P.rect(wx, wy + 56, ww, 2, frame, TRIM);
        // Wrought-iron fretwork balcony railing (continuous or Juliet)
        const bx = contBalc ? x0 : wx - 10, bw = contBalc ? 128 : ww + 20, by = y0 + 88, bh = 26;
        P.rect(bx, by, bw, 3, iron, TRIM);
        P.rect(bx, by + bh - 2, bw, 2.5, iron, TRIM);
        for (let rx = bx + 3; rx < bx + bw - 3; rx += 8) {
          P.rect(rx, by + 2, 1.6, bh - 4, iron, TRIM);
          P.path((c) => { c.arc(rx + 4, by + bh / 2, 3.2, 0, Math.PI * 2); }, iron, TRIM);
        }
      }
    }
    P.noise(rng, 0.03, 2);
  },

  // 36: Brutalist Coffered Concrete: Deep architectural precast concrete waffle/coffered grid with recessed bronze-tinted ribbon glazing and bevelled shadow chamfers.
  brutalist_coffered(P, S, rng) {
    const conc = [0.64, 0.63, 0.60], concLt = [0.74, 0.73, 0.70], concDk = [0.36, 0.35, 0.34], bronze = [0.26, 0.21, 0.16];
    P.rect(0, 0, S, S, conc, TRIM);
    // Board-formed horizontal tie lines & tie-rod form holes
    for (let y = 0; y < S; y += 16) P.rect(0, y, S, 1, shade(conc, 0.88), TRIM);
    for (let f = 0; f < 4; f++) {
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128, y0 = f * 128;
        // Deep bevelled coffer chamfers: top/left cast shadow, bottom/right catch light
        P.path((c) => {
          c.moveTo(x0 + 6, y0 + 8); c.lineTo(x0 + 122, y0 + 8);
          c.lineTo(x0 + 104, y0 + 26); c.lineTo(x0 + 24, y0 + 26); c.closePath();
        }, concDk, TRIM);
        P.path((c) => {
          c.moveTo(x0 + 6, y0 + 8); c.lineTo(x0 + 24, y0 + 26);
          c.lineTo(x0 + 24, y0 + 98); c.lineTo(x0 + 6, y0 + 116); c.closePath();
        }, shade(conc, 0.72), TRIM);
        P.path((c) => {
          c.moveTo(x0 + 122, y0 + 8); c.lineTo(x0 + 122, y0 + 116);
          c.lineTo(x0 + 104, y0 + 98); c.lineTo(x0 + 104, y0 + 26); c.closePath();
        }, shade(conc, 0.84), TRIM);
        P.path((c) => {
          c.moveTo(x0 + 24, y0 + 98); c.lineTo(x0 + 104, y0 + 98);
          c.lineTo(x0 + 122, y0 + 116); c.lineTo(x0 + 6, y0 + 116); c.closePath();
        }, concLt, TRIM);
        // Formwork tie holes on concrete pier corners
        for (const [tx, ty] of [[x0 + 12, y0 + 4], [x0 + 116, y0 + 4], [x0 + 12, y0 + 121], [x0 + 116, y0 + 121]]) {
          P.rect(tx - 2, ty - 2, 4, 4, concDk, TRIM);
        }
        // Recessed bronze-tinted ribbon glazing inside coffer well
        glazing(P, x0 + 24, y0 + 26, 80, 72, bronze, [0.42, 0.36, 0.28], [0.16, 0.13, 0.10], 3, 2);
      }
    }
    P.noise(rng, 0.05, 2);
  },

  // 37: Tudor Half-Timber: Historic English/German half-timbered plaster & herringbone brick nogging with dark oak structural posts, diagonal braces, and leaded diamond-mullion casements.
  tudor_half_timber(P, S, rng) {
    const plaster = [0.92, 0.89, 0.82], oak = [0.20, 0.13, 0.09], oakHi = [0.28, 0.19, 0.13], lead = [0.26, 0.28, 0.30];
    P.rect(0, 0, S, S, plaster, PAINT);
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128;
      // Heavy horizontal oak bressummer beams & jetty shadow
      P.rect(0, y0, S, 11, oak, TRIM);
      P.rect(0, y0 + 11, S, 3, shade(plaster, 0.68), TRIM);
      P.rect(0, y0 + 116, S, 12, oak, TRIM);
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128;
        // Vertical oak corner posts & intermediate studs
        P.rect(x0, y0, 10, 128, oak, TRIM);
        P.rect(x0 + 118, y0, 10, 128, oak, TRIM);
        // Herringbone red-brick nogging in select lower apron panels
        if ((b + f) % 3 === 0) {
          P.rect(x0 + 10, y0 + 88, 108, 28, [0.58, 0.30, 0.22], TRIM);
          for (let hx = x0 + 12; hx < x0 + 114; hx += 12) {
            P.line(hx, y0 + 90, hx + 6, y0 + 102, [0.76, 0.70, 0.62], 1.5);
            P.line(hx + 6, y0 + 102, hx + 12, y0 + 90, [0.76, 0.70, 0.62], 1.5);
          }
        }
        // Diagonal oak wind-braces & Saint Andrew's crosses in side panels and apron
        P.line(x0 + 8, y0 + 10, x0 + 34, y0 + 86, oak, 8);
        P.line(x0 + 120, y0 + 10, x0 + 94, y0 + 86, oak, 8);
        P.line(x0 + 12, y0 + 88, x0 + 64, y0 + 116, oak, 7);
        P.line(x0 + 116, y0 + 88, x0 + 64, y0 + 116, oak, 7);
        P.rect(x0 + 10, y0 + 84, 108, 7, oakHi, TRIM);
        // Paired leaded casement windows with diamond quarrel mullions
        const wx = x0 + 30, wy = y0 + 22, ww = 68, wh = 60;
        glazing(P, wx, wy, ww, wh, oak, [0.44, 0.52, 0.58], [0.15, 0.18, 0.22], 4, 2);
        P.c.strokeStyle = css(lead); P.c.lineWidth = 1.2;
        for (let d = -wh; d < ww + wh; d += 12) {
          P.c.beginPath();
          P.c.moveTo(Math.max(wx, wx + d), wy + Math.max(0, -d));
          P.c.lineTo(Math.min(wx + ww, wx + d + wh), wy + Math.min(wh, ww - d));
          P.c.stroke();
          P.c.beginPath();
          P.c.moveTo(Math.max(wx, wx + d), wy + wh - Math.max(0, -d));
          P.c.lineTo(Math.min(wx + ww, wx + d + wh), wy + wh - Math.min(wh, ww - d));
          P.c.stroke();
        }
        // Re-assert oak casement frame over diamond lattice edges
        P.rect(wx - 4, wy - 4, ww + 8, 4, oak, TRIM);
        P.rect(wx - 4, wy + wh, ww + 8, 4, oak, TRIM);
        P.rect(wx + ww / 2 - 2.5, wy, 5, wh, oak, TRIM);
      }
    }
    P.noise(rng, 0.04, 2);
  },

  // 38: Modern Timber Louvre: Contemporary warm cedar vertical sun-louvre screens alternating with floor-to-ceiling low-iron architectural glass and charcoal steel spandrel I-beams.
  modern_timber_louvre(P, S, rng) {
    const cedar = [0.74, 0.48, 0.28], cedarDk = [0.42, 0.25, 0.14], steel = [0.16, 0.18, 0.20], steelHi = [0.30, 0.33, 0.36];
    P.rect(0, 0, S, S, steel, TRIM);
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128;
      // Charcoal steel I-beam spandrel with top/bottom flange highlights
      P.rect(0, y0 + 104, S, 24, steel, TRIM);
      P.rect(0, y0 + 104, S, 3, steelHi, TRIM);
      P.rect(0, y0 + 125, S, 3, steelHi, TRIM);
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128;
        P.rect(x0, y0, 6, 128, steel, TRIM);
        // Full-height low-iron architectural glazing
        glazing(P, x0 + 6, y0 + 4, 116, 98, steel, [0.50, 0.64, 0.72], [0.16, 0.24, 0.30], 2, 1);
        // Alternating warm Western Red Cedar vertical sun-louvre screens over half of each bay
        const louvreLeft = (b + f) % 2 === 0;
        const lx = louvreLeft ? x0 + 8 : x0 + 64, lw = 56;
        for (let sx = lx; sx < lx + lw; sx += 6) {
          P.rect(sx, y0 + 4, 3.5, 98, cedar, TRIM);
          P.rect(sx + 3.5, y0 + 4, 1.5, 98, cedarDk, TRIM);
        }
        // Horizontal stainless tie-rods through timber fins
        P.rect(lx, y0 + 34, lw, 2, steelHi, TRIM);
        P.rect(lx, y0 + 70, lw, 2, steelHi, TRIM);
      }
    }
    P.noise(rng, 0.03, 2);
  },

  // 39: Neoclassical Ashlar: Rusticated stone blocks, Corinthian/Doric fluted pilaster strips, pedimented window headers, and classical balustrade apron panels.
  neoclassical_ashlar(P, S, rng) {
    const stone = [0.86, 0.83, 0.76], shadow = [0.62, 0.59, 0.53], hi = [0.95, 0.93, 0.88];
    P.rect(0, 0, S, S, stone, PAINT);
    // Rusticated V-groove ashlar block courses
    for (let y = 0; y < S; y += 16) {
      P.rect(0, y, S, 1.5, shadow, TRIM);
      P.rect(0, y + 1.5, S, 1, hi, TRIM);
      const off = ((y / 16) % 2) * 32;
      for (let x = off; x < S; x += 64) P.rect(x, y, 1.5, 16, shadow, TRIM);
    }
    for (let b = 0; b < 4; b++) {
      const x0 = b * 128;
      // Fluted classical pilaster strips between bays
      for (const px of [x0, x0 + 108]) {
        P.rect(px, 0, 20, S, shade(stone, 1.03), TRIM);
        for (let fx = 3; fx < 18; fx += 4) P.rect(px + fx, 0, 2, S, shadow, TRIM);
      }
      for (let f = 0; f < 4; f++) {
        const y0 = f * 128;
        // Classical entablature frieze & dentil band
        P.rect(x0, y0, 128, 10, hi, TRIM);
        for (let dx = x0 + 4; dx < x0 + 124; dx += 10) P.rect(dx, y0 + 10, 5, 5, shadow, TRIM);
        // Pedimented window header (alternating triangular & segmental pediments)
        const wx = x0 + 34, wy = y0 + 32, ww = 60, wh = 68;
        if ((b + f) % 2 === 0) {
          P.path((c) => {
            c.moveTo(wx - 10, wy - 6); c.lineTo(wx + ww / 2, wy - 20); c.lineTo(wx + ww + 10, wy - 6); c.closePath();
          }, hi, TRIM);
          P.path((c) => {
            c.moveTo(wx - 5, wy - 8); c.lineTo(wx + ww / 2, wy - 16); c.lineTo(wx + ww + 5, wy - 8); c.closePath();
          }, shadow, TRIM);
        } else {
          P.path((c) => { c.arc(wx + ww / 2, wy - 4, ww / 2 + 8, Math.PI, 0); }, hi, TRIM);
        }
        P.rect(wx - 8, wy - 6, ww + 16, 6, hi, TRIM);
        glazing(P, wx, wy, ww, wh, hi, [0.44, 0.52, 0.60], [0.14, 0.17, 0.22], 4, 3);
        // Classical carved stone balustrade apron panel below sill
        P.rect(wx - 8, wy + wh + 2, ww + 16, 22, shadow, TRIM);
        P.rect(wx - 10, wy + wh + 2, ww + 20, 4, hi, TRIM);
        P.rect(wx - 10, wy + wh + 20, ww + 20, 4, hi, TRIM);
        for (let bx = wx - 2; bx < wx + ww + 2; bx += 9) {
          P.rect(bx, wy + wh + 6, 5, 14, hi, TRIM);
        }
      }
    }
    P.noise(rng, 0.03, 2);
  },

  // 40: Venetian Gothic: Polychrome Istrian stone & terracotta brickwork with trefoil/quatrefoil pointed-arch colonnade windows and carved stone balconies.
  venetian_gothic(P, S, rng) {
    const terra = [0.80, 0.52, 0.42], istrian = [0.94, 0.92, 0.86], darkGlass = [0.12, 0.15, 0.18];
    P.rect(0, 0, S, S, terra, PAINT);
    // Subtle diaper/brick pattern on terracotta stucco wall
    for (let y = 0; y < S; y += 16) {
      for (let x = ((y / 16) % 2) * 16; x < S; x += 32) {
        P.rect(x, y, 14, 7, shade(terra, 0.93));
      }
    }
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128;
      // Istrian stone rope-molded string course
      P.rect(0, y0 + 116, S, 8, istrian, TRIM);
      P.rect(0, y0 + 124, S, 4, shade(istrian, 0.72), TRIM);
      for (let b = 0; b < 4; b++) {
        const x0 = b * 128;
        // Quoined Istrian stone corner blocks
        P.rect(x0, y0 + ((f % 2) * 16), 10, 16, istrian, TRIM);
        P.rect(x0, y0 + 48, 14, 16, istrian, TRIM);
        const wx = x0 + 24, wy = y0 + 36, ww = 80, wh = 66;
        // Pointed Gothic ogee arch surround & quatrefoil tracery drum
        P.rect(wx - 6, wy - 22, ww + 12, wh + 26, istrian, TRIM);
        P.path((c) => {
          c.moveTo(wx, wy);
          c.quadraticCurveTo(wx + ww * 0.25, wy - 20, wx + ww * 0.5, wy - 24);
          c.quadraticCurveTo(wx + ww * 0.75, wy - 20, wx + ww, wy);
          c.closePath();
        }, darkGlass, GLASS);
        glazing(P, wx, wy, ww, wh, istrian, [0.38, 0.48, 0.54], darkGlass, 3, 0);
        // Bifora / Trifora slender marble colonnettes + trefoil arches + carved quatrefoil oculus
        for (const cx of [wx + ww / 3, wx + (2 * ww) / 3]) {
          P.rect(cx - 2.5, wy, 5, wh, istrian, TRIM);
          P.rect(cx - 5, wy, 10, 4, istrian, TRIM);
          P.rect(cx - 5, wy + wh - 4, 10, 4, istrian, TRIM);
        }
        for (const qx of [wx + ww * 0.25, wx + ww * 0.5, wx + ww * 0.75]) {
          P.path((c) => { c.arc(qx, wy - 10, 6.5, 0, Math.PI * 2); }, istrian, TRIM);
          P.path((c) => { c.arc(qx, wy - 10, 4, 0, Math.PI * 2); }, darkGlass, GLASS);
        }
        // Carved Istrian stone balcony with miniature colonnade balusters
        P.rect(wx - 10, wy + wh, ww + 20, 6, istrian, TRIM);
        for (let bx = wx - 6; bx <= wx + ww + 4; bx += 8) {
          P.rect(bx, wy + wh - 16, 3.5, 16, istrian, TRIM);
        }
        P.rect(wx - 10, wy + wh - 19, ww + 20, 3.5, istrian, TRIM);
      }
    }
    P.noise(rng, 0.035, 2);
  },

  // 41: High-Tech Diagrid: Structural steel exterior diagrid bracing over reflective sapphire/teal curtain-wall glazing with mechanical louvre spandrel bands.
  high_tech_diagrid(P, S, rng) {
    const steel = [0.76, 0.80, 0.84], steelDk = [0.22, 0.26, 0.30], nodeCol = [0.90, 0.93, 0.96];
    // Sapphire/teal reflective curtain wall gradient
    const g = P.c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, css([0.36, 0.58, 0.72]));
    g.addColorStop(0.5, css([0.22, 0.42, 0.56]));
    g.addColorStop(1, css([0.14, 0.28, 0.40]));
    P.c.fillStyle = g; P.c.fillRect(0, 0, S, S);
    P.m.fillStyle = `rgb(${GLASS},${GLASS},${GLASS})`; P.m.fillRect(0, 0, S, S);
    // Fine curtain-wall unitized sub-mullions
    for (let x = 0; x < S; x += 32) P.rect(x, 0, 2.5, S, steelDk, TRIM);
    for (let y = 0; y < S; y += 64) P.rect(0, y, S, 2, steelDk, TRIM);
    // Mechanical louvre spandrel bands at each floor slab
    for (let f = 0; f < 4; f++) {
      const y0 = f * 128 + 102;
      P.rect(0, y0, S, 26, steelDk, TRIM);
      for (let ly = y0 + 3; ly < y0 + 23; ly += 4) {
        P.rect(0, ly, S, 2, [0.46, 0.50, 0.54], TRIM);
      }
    }
    // Exterior structural steel diagrid X-bracing across 2x2 bay modules + gusset node plates
    const drawBrace = (x1, y1, x2, y2) => {
      P.path((c) => {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * 7, ny = (dx / len) * 7;
        c.moveTo(x1 - nx, y1 - ny); c.lineTo(x2 - nx, y2 - ny);
        c.lineTo(x2 + nx, y2 + ny); c.lineTo(x1 + nx, y1 + ny); c.closePath();
      }, steelDk, TRIM);
      P.path((c) => {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * 4.5, ny = (dx / len) * 4.5;
        c.moveTo(x1 - nx, y1 - ny); c.lineTo(x2 - nx, y2 - ny);
        c.lineTo(x2 + nx, y2 + ny); c.lineTo(x1 + nx, y1 + ny); c.closePath();
      }, steel, TRIM);
    };
    for (let gy = 0; gy < S; gy += 256) {
      for (let gx = 0; gx < S; gx += 256) {
        drawBrace(gx, gy, gx + 256, gy + 256);
        drawBrace(gx + 256, gy, gx, gy + 256);
        for (const [nx, ny] of [[gx, gy], [gx + 128, gy + 128], [gx + 256, gy], [gx, gy + 256], [gx + 256, gy + 256]]) {
          P.path((c) => { c.arc(nx, ny, 11, 0, Math.PI * 2); }, steelDk, TRIM);
          P.path((c) => { c.arc(nx, ny, 7.5, 0, Math.PI * 2); }, nodeCol, TRIM);
        }
      }
    }
    // Diagonal sky reflection streaks on glass panes
    for (let i = 0; i < 36; i++) {
      const rx = Math.floor(rng() * 16) * 32 + 3, ry = Math.floor(rng() * 4) * 128 + 4;
      P.c.fillStyle = `rgba(220,245,255,${0.05 + rng() * 0.08})`;
      P.c.fillRect(rx, ry, 26, 94);
    }
  },
};

/**
 * Draws all extra layers. Returns [{ rgba: Uint8ClampedArray (S*S*4, image rows top-down, A = mask) }] in index order.
 */
export function drawExtraFacadeLayers(S = 512) {
  if (typeof document === 'undefined') return [];
  const out = [];
  for (const spec of EXTRA_FACADES) {
    const P = painter(S);
    const rng = mulberry(spec.index * 7919 + 13);
    try {
      STYLES[spec.id](P, S, rng);
    } catch (e) {
      P.rect(0, 0, S, S, spec.avgColor, PAINT);
    }
    // soften hard vector edges (the shader's luminance bump turns them into sparkle at grazing angles)
    const tmp = document.createElement('canvas');
    tmp.width = S; tmp.height = S;
    const tc = tmp.getContext('2d');
    tc.filter = 'blur(0.5px)';
    tc.drawImage(P.cv, 0, 0);
    P.c.clearRect(0, 0, S, S);
    P.c.drawImage(tmp, 0, 0);
    const rgb = P.c.getImageData(0, 0, S, S).data;
    const msk = P.m.getImageData(0, 0, S, S).data;
    for (let i = 0; i < rgb.length; i += 4) rgb[i + 3] = msk[i];
    out.push(rgb);
  }
  return out;
}
