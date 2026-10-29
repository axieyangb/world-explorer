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
];

/** Paint palettes for the paintable layers, by arch region (rgb multipliers on the light neutral wall). */
export const PAINT_PALETTES = {
  sf_victorian: [[0.62, 0.76, 0.92], [1.0, 0.86, 0.52], [0.68, 0.86, 0.66], [0.98, 0.70, 0.64], [0.80, 0.72, 0.94], [1.0, 0.97, 0.88], [0.52, 0.64, 0.80], [0.94, 0.68, 0.46], [0.60, 0.82, 0.80]],
  stucco_spanish: [[1.0, 0.97, 0.90], [0.98, 0.90, 0.78], [0.96, 0.86, 0.76], [1.0, 0.98, 0.95], [0.94, 0.88, 0.80], [0.92, 0.84, 0.72]],
  med_shutters: [[0.96, 0.78, 0.52], [0.92, 0.68, 0.46], [0.98, 0.86, 0.62], [0.90, 0.62, 0.48], [0.96, 0.90, 0.78], [0.86, 0.56, 0.40], [0.98, 0.82, 0.70]],
  latam_colour: [[1.0, 0.82, 0.42], [0.55, 0.80, 0.92], [0.98, 0.64, 0.56], [0.66, 0.88, 0.62], [1.0, 0.98, 0.94], [0.96, 0.70, 0.82], [0.98, 0.90, 0.74], [0.90, 0.95, 0.98]],
  nordic_wood: [[0.66, 0.26, 0.20], [0.96, 0.84, 0.52], [1.0, 1.0, 0.98], [0.64, 0.76, 0.84], [0.84, 0.86, 0.80], [0.40, 0.42, 0.40], [0.94, 0.90, 0.80], [0.72, 0.36, 0.26]],
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
