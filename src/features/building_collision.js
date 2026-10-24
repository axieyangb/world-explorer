/**
 * Building collision against real footprint polygons (base tier), with a lazily built per-chunk
 * uniform grid and neighbour-chunk lookups. Bodies are circles (the car is three circles along its
 * axis), resolved by pushing out of the polygon along the nearest edge normal.
 */

const GCELL = 32.0;
const GEXT = 560.0; // grid covers [-GEXT, GEXT) around the chunk centre (footprints may overhang the chunk)
const GN = Math.ceil((2 * GEXT) / GCELL);

function buildGrid(ud) {
  const cols = ud.buildingColliders || [];
  const rings = new Array(cols.length);
  const cells = new Array(GN * GN);
  for (let i = 0; i < cols.length; i++) {
    const b = cols[i];
    const f = b.flatOuter;
    if (!f || f.length < 6) { rings[i] = null; continue; }
    const w = new Float64Array(f.length);
    for (let k = 0; k < f.length; k += 2) { w[k] = f[k] + b.ox; w[k + 1] = f[k + 1] + b.oz; }
    rings[i] = w;
    const c0 = Math.max(0, Math.floor((b.minX - ud.ox + GEXT) / GCELL));
    const c1 = Math.min(GN - 1, Math.floor((b.maxX - ud.ox + GEXT) / GCELL));
    const r0 = Math.max(0, Math.floor((b.minZ - ud.oz + GEXT) / GCELL));
    const r1 = Math.min(GN - 1, Math.floor((b.maxZ - ud.oz + GEXT) / GCELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * GN + c;
      (cells[k] || (cells[k] = [])).push(i);
    }
  }
  return { cols, rings, cells, stamp: new Uint32Array(cols.length), src: cols };
}

function pointInRing(px, pz, f) {
  let inside = false;
  const n = f.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const zi = f[i + 1], zj = f[j + 1];
    if ((zi > pz) !== (zj > pz) && px < ((f[j] - f[i]) * (pz - zi)) / (zj - zi + 1e-12) + f[i]) inside = !inside;
  }
  return inside;
}

const _q = { d2: 0, x: 0, z: 0 };
function closestOnRing(px, pz, f) {
  let best = Infinity, bx = 0, bz = 0;
  const n = f.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = f[j], az = f[j + 1];
    const dx = f[i] - ax, dz = f[i + 1] - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t, qz = az + dz * t;
    const d2 = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
    if (d2 < best) { best = d2; bx = qx; bz = qz; }
  }
  _q.d2 = best; _q.x = bx; _q.z = bz;
  return _q;
}

export class BuildingCollision {
  constructor(app) {
    this.app = app;
    this.grids = new WeakMap();
    this.frame = 1;
    this.shake = 0;
    this.stats = { hits: 0, maxImpact: 0 };
  }

  _grid(chunk) {
    const ud = chunk.userData;
    let g = this.grids.get(chunk);
    if (!g || g.src !== ud.buildingColliders) { g = buildGrid(ud); this.grids.set(chunk, g); }
    return g;
  }

  /** Calls fn(ring, collider) for each footprint whose grid cell overlaps the circle (deduplicated). */
  _forNear(x, z, r, fn) {
    const app = this.app;
    const stamp = ++this.frame;
    const [ca, za] = app.worldToChunk(x - r, z - r);
    const [cb, zb] = app.worldToChunk(x + r, z + r);
    for (let cx = ca; cx <= cb; cx++) {
      for (let cz = za; cz <= zb; cz++) {
        const chunk = app.loadedChunks.get(`${cx},${cz}`);
        if (!chunk || !chunk.userData || !chunk.userData.buildingColliders) continue;
        const g = this._grid(chunk);
        const ud = chunk.userData;
        // footprints from the neighbouring chunks overhang into this one, so scan this chunk's grid
        const c0 = Math.max(0, Math.floor((x - r - ud.ox + GEXT) / GCELL));
        const c1 = Math.min(GN - 1, Math.floor((x + r - ud.ox + GEXT) / GCELL));
        const r0 = Math.max(0, Math.floor((z - r - ud.oz + GEXT) / GCELL));
        const r1 = Math.min(GN - 1, Math.floor((z + r - ud.oz + GEXT) / GCELL));
        for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
          const list = g.cells[rr * GN + cc];
          if (!list) continue;
          for (let k = 0; k < list.length; k++) {
            const i = list[k];
            if (g.stamp[i] === stamp) continue;
            g.stamp[i] = stamp;
            const b = g.cols[i];
            if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
            if (g.rings[i]) fn(g.rings[i], b);
          }
        }
      }
    }
    // the neighbour chunk owning a footprint may lie outside the circle's chunk span: also scan
    // the 4-neighbourhood when close to a chunk border (footprints overhang up to ~GEXT-500 m)
    const [pcx, pcz] = app.worldToChunk(x, z);
    const lx = x + 20000 - pcx * 1000, lz = z + 20000 - pcz * 1000;
    const near = 70;
    const extra = [];
    if (lx < near) extra.push([pcx - 1, pcz]);
    if (lx > 1000 - near) extra.push([pcx + 1, pcz]);
    if (lz < near) extra.push([pcx, pcz - 1]);
    if (lz > 1000 - near) extra.push([pcx, pcz + 1]);
    if (lx < near && lz < near) extra.push([pcx - 1, pcz - 1]);
    if (lx > 1000 - near && lz < near) extra.push([pcx + 1, pcz - 1]);
    if (lx < near && lz > 1000 - near) extra.push([pcx - 1, pcz + 1]);
    if (lx > 1000 - near && lz > 1000 - near) extra.push([pcx + 1, pcz + 1]);
    for (const [cx, cz] of extra) {
      if (cx >= ca && cx <= cb && cz >= za && cz <= zb) continue;
      const chunk = app.loadedChunks.get(`${cx},${cz}`);
      if (!chunk || !chunk.userData || !chunk.userData.buildingColliders) continue;
      const g = this._grid(chunk);
      const ud = chunk.userData;
      const c0 = Math.max(0, Math.floor((x - r - ud.ox + GEXT) / GCELL));
      const c1 = Math.min(GN - 1, Math.floor((x + r - ud.ox + GEXT) / GCELL));
      const r0 = Math.max(0, Math.floor((z - r - ud.oz + GEXT) / GCELL));
      const r1 = Math.min(GN - 1, Math.floor((z + r - ud.oz + GEXT) / GCELL));
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        const list = g.cells[rr * GN + cc];
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          if (g.stamp[i] === stamp) continue;
          g.stamp[i] = stamp;
          const b = g.cols[i];
          if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
          if (g.rings[i]) fn(g.rings[i], b);
        }
      }
    }
  }

  /** Push-out vector for one circle (accumulated over all overlapping footprints). */
  _circlePush(x, z, r, wy, out) {
    let px = 0, pz = 0, hit = false, roofMax = -Infinity;
    this._forNear(x, z, r, (ring, b) => {
      if (wy > b.h + 0.5) return; // above the roof (elevated road, landing on top)
      const q = closestOnRing(x + px, z + pz, ring);
      const d = Math.sqrt(q.d2);
      const inside = pointInRing(x + px, z + pz, ring);
      if (inside) {
        const nx = (q.x - (x + px)) / (d || 1), nz = (q.z - (z + pz)) / (d || 1);
        px += nx * (d + r); pz += nz * (d + r);
      } else if (d < r) {
        const nx = (x + px - q.x) / (d || 1), nz = (z + pz - q.z) / (d || 1);
        px += nx * (r - d); pz += nz * (r - d);
      } else return;
      hit = true;
      if (b.h > roofMax) roofMax = b.h;
    });
    out.x = px; out.z = pz; out.hit = hit; out.roof = roofMax;
    return out;
  }

  /**
   * Resolves a body made of circles at offsets along heading `yaw` (offs: metres along the axis).
   * Returns { x, z, hit, nx, nz, roof } where (nx, nz) is the unit contact normal.
   */
  resolve(x, wy, z, yaw, radius, offs, corners = null, prevX = null, prevZ = null) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const tmp = { x: 0, z: 0, hit: false, roof: -Infinity };
    let rx = x, rz = z, hit = false, tx = 0, tz = 0, roof = -Infinity;
    const nOff = offs.length, nAll = nOff + (corners ? corners.length / 2 : 0);
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (let k = 0; k < nAll; k++) {
        // axis circles (radius) then optional body corners [along, lateral] as small circles
        let ox, oz, rr;
        if (k < nOff) { ox = sy * offs[k]; oz = cy * offs[k]; rr = radius; }
        else { const a = corners[(k - nOff) * 2], l = corners[(k - nOff) * 2 + 1]; ox = sy * a + cy * l; oz = cy * a - sy * l; rr = 0.12; }
        this._circlePush(rx + ox, rz + oz, rr, wy, tmp);
        if (!tmp.hit) continue;
        rx += tmp.x; rz += tmp.z; tx += tmp.x; tz += tmp.z;
        if (tmp.roof > roof) roof = tmp.roof;
        hit = true; moved = true;
      }
      if (!moved) break;
    }
    let tl = Math.hypot(tx, tz);
    // Overlapping / wedged footprints can leave the body inside after the push iterations: fall back to
    // the last (collision-free) position so the body never ends a step inside a building.
    if (hit && prevX !== null && this._overlaps(rx, wy, rz, sy, cy, radius, offs) &&
        !this._overlaps(prevX, wy, prevZ, sy, cy, radius, offs)) {
      if (tl < 1e-6) { tx = prevX - x; tz = prevZ - z; tl = Math.hypot(tx, tz); }
      rx = prevX; rz = prevZ;
    }
    return { x: rx, z: rz, hit, nx: tl > 1e-6 ? tx / tl : 0, nz: tl > 1e-6 ? tz / tl : 0, roof };
  }

  _overlaps(x, wy, z, sy, cy, radius, offs) {
    const tmp = { x: 0, z: 0, hit: false, roof: -Infinity };
    for (let k = 0; k < offs.length; k++) {
      this._circlePush(x + sy * offs[k], z + cy * offs[k], radius * 0.8, wy, tmp);
      if (tmp.hit) return true;
    }
    return false;
  }

  /** Car: three circles along the body plus the four body corners. */
  resolveCar(x, wy, z, yaw, spec, prevX = null, prevZ = null) {
    const isTank = spec && (spec.id === 'tank' || spec.isTank);
    const len = isTank ? 6.4 : (spec && spec.length) || 4.6;
    const hw = isTank ? 1.45 : ((spec && spec.width) || 2.0) * 0.5;
    const hl = isTank ? 3.2 : len * 0.5;
    const off = Math.max(0, len * 0.5 - hw);
    return this.resolve(x, wy, z, yaw, hw + (isTank ? 0.04 : 0.08), off > 0.2 ? [off, 0, -off] : [0], [hl, hw, hl, -hw, -hl, hw, -hl, -hw], prevX, prevZ);
  }

  /**
   * Slide response: removes the velocity component into the wall, keeps the tangential part, steers
   * the heading along the wall on glancing hits, and kicks the camera on hard impacts.
   */
  applyImpact(nx, nz) {
    const app = this.app;
    const dx = Math.sin(app.yaw), dz = Math.cos(app.yaw);
    const dn = dx * nx + dz * nz;            // heading . normal
    const vn = app.speed * dn;                // < 0 when moving into the wall
    if (vn >= 0) return;
    const impact = -vn;
    this.stats.hits++;
    if (impact > this.stats.maxImpact) this.stats.maxImpact = impact;
    app.speed *= Math.max(0, 1 - dn * dn) * 0.94;
    if (Math.abs(dn) < 0.85) {
      // tangent in the direction of travel
      const s = Math.sign(app.speed) || 1;
      let tx = dx - dn * nx, tz = dz - dn * nz;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const target = Math.atan2(tx * s, tz * s) + (s < 0 ? Math.PI : 0);
      const diff = Math.atan2(Math.sin(target - app.yaw), Math.cos(target - app.yaw));
      app.yaw += diff * 0.6;
    }
    if (impact > 6) this.shake = Math.min(1, Math.max(this.shake, impact / 45));
  }

  /** Adds a decaying camera shake offset; call after the camera is placed and before rendering. */
  applyCameraShake(camera, dt) {
    if (this.shake <= 0.001) { this.shake = 0; return; }
    const a = this.shake * this.shake * 0.55;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
    camera.position.z += (Math.random() - 0.5) * a;
    this.shake *= Math.exp(-6 * dt);
  }

  /** True if (x, z) lies inside any base footprint (test probe). */
  insideAny(x, z, wy = -Infinity) {
    let found = null;
    this._forNear(x, z, 0.01, (ring, b) => { if (!found && wy <= b.h + 0.5 && pointInRing(x, z, ring)) found = b; });
    return found;
  }
}
