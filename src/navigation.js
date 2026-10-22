import * as THREE from '../vendor/three.module.js';

export class RoadNavigator {
  constructor(scene) {
    this.scene = scene;
    this.nodes = null; // idStr -> [x, y, z]
    this.adj = null;   // idStr -> [[nbrId, distM, costSec, roadName], ...]
    this.grid = new Map(); // "gx,gz" -> [idStr, ...]
    this.ready = false;

    this.activeRoute = null; // { points: [[x,y,z], ...], totalDistM, etaSec, roadNames, destName }
    this.routeMesh = null;
  }

  async init() {
    const resp = await fetch('/data/nav_graph.json');
    if (!resp.ok) return;
    const data = await resp.json();
    this.nodes = data.nodes || {};
    this.adj = data.adj || {};

    for (const [idStr, pt] of Object.entries(this.nodes)) {
      const gx = Math.floor(pt[0] / 500);
      const gz = Math.floor(pt[2] / 500);
      const key = `${gx},${gz}`;
      let cell = this.grid.get(key);
      if (!cell) {
        cell = [];
        this.grid.set(key, cell);
      }
      cell.push(idStr);
    }
    this.ready = true;
  }

  findNearestNode(x, z) {
    if (!this.ready) return null;
    const cx = Math.floor(x / 500);
    const cz = Math.floor(z / 500);
    let bestId = null;
    let bestD2 = Infinity;

    for (let r = 0; r <= 6; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const cell = this.grid.get(`${cx + dx},${cz + dz}`);
          if (!cell) continue;
          for (let i = 0; i < cell.length; i++) {
            const idStr = cell[i];
            const pt = this.nodes[idStr];
            const d2 = (pt[0] - x) ** 2 + (pt[2] - z) ** 2;
            if (d2 < bestD2) {
              bestD2 = d2;
              bestId = idStr;
            }
          }
        }
      }
      if (bestId !== null && r >= 1) break;
    }
    return bestId;
  }

  computeRoute(startX, startZ, goalX, goalZ, destName = '自选目的地') {
    if (!this.ready) return null;
    const startId = this.findNearestNode(startX, startZ);
    const goalId = this.findNearestNode(goalX, goalZ);
    if (!startId || !goalId || startId === goalId) return null;

    const goalPt = this.nodes[goalId];
    const gScore = new Map();
    const cameFrom = new Map();
    const cameRoad = new Map();
    const closed = new Set();

    // Binary min-heap priority queue: [fScore, nodeIdStr]
    const heap = [];
    const pushHeap = (f, id) => {
      heap.push([f, id]);
      let idx = heap.length - 1;
      while (idx > 0) {
        const p = (idx - 1) >> 1;
        if (heap[p][0] <= heap[idx][0]) break;
        const tmp = heap[p];
        heap[p] = heap[idx];
        heap[idx] = tmp;
        idx = p;
      }
    };
    const popHeap = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let idx = 0;
        const n = heap.length;
        while (true) {
          let l = idx * 2 + 1;
          let r = l + 1;
          let smallest = idx;
          if (l < n && heap[l][0] < heap[smallest][0]) smallest = l;
          if (r < n && heap[r][0] < heap[smallest][0]) smallest = r;
          if (smallest === idx) break;
          const tmp = heap[idx];
          heap[idx] = heap[smallest];
          heap[smallest] = tmp;
          idx = smallest;
        }
      }
      return top;
    };

    const hFunc = (idStr) => {
      const p = this.nodes[idStr];
      return Math.hypot(p[0] - goalPt[0], p[2] - goalPt[2]) / 26.0;
    };

    gScore.set(startId, 0);
    pushHeap(hFunc(startId), startId);

    let iters = 0;
    let found = false;
    while (heap.length > 0 && iters < 65000) {
      iters++;
      const [, curr] = popHeap();
      if (curr === goalId) {
        found = true;
        break;
      }
      if (closed.has(curr)) continue;
      closed.add(curr);

      const curG = gScore.get(curr);
      const nbrs = this.adj[curr];
      if (!nbrs) continue;

      for (let i = 0; i < nbrs.length; i++) {
        const [nbrNum, , edgeCost, rName] = nbrs[i];
        const nbr = String(nbrNum);
        if (closed.has(nbr)) continue;
        const tentG = curG + edgeCost;
        const prevG = gScore.get(nbr);
        if (prevG === undefined || tentG < prevG) {
          gScore.set(nbr, tentG);
          cameFrom.set(nbr, curr);
          cameRoad.set(nbr, rName);
          pushHeap(tentG + hFunc(nbr), nbr);
        }
      }
    }

    if (!found) return null;

    // Reconstruct path
    const pts = [];
    const roadSeq = [];
    let curr = goalId;
    while (curr) {
      const pt = this.nodes[curr];
      pts.push([pt[0], pt[1], pt[2]]);
      const rn = cameRoad.get(curr);
      if (rn && (roadSeq.length === 0 || roadSeq[roadSeq.length - 1] !== rn)) {
        roadSeq.push(rn);
      }
      curr = cameFrom.get(curr);
    }
    pts.reverse();
    roadSeq.reverse();

    let totalDistM = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      totalDistM += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][2] - pts[i][2]);
    }

    this.activeRoute = {
      points: pts,
      totalDistM,
      etaSec: gScore.get(goalId) || totalDistM / 16.0,
      roadNames: roadSeq.slice(0, 6),
      destName,
      goalX: goalPt[0],
      goalZ: goalPt[2],
    };

    this._rebuild3DRouteRibbon();
    return this.activeRoute;
  }

  clearRoute() {
    this.activeRoute = null;
    if (this.routeMesh) {
      this.scene.remove(this.routeMesh);
      this.routeMesh.geometry.dispose();
      this.routeMesh.material.dispose();
      this.routeMesh = null;
    }
  }

  _rebuild3DRouteRibbon() {
    if (this.routeMesh) {
      this.scene.remove(this.routeMesh);
      this.routeMesh.geometry.dispose();
      this.routeMesh.material.dispose();
      this.routeMesh = null;
    }
    if (!this.activeRoute || this.activeRoute.points.length < 2) return;

    const pts = this.activeRoute.points;
    const pos = [];
    const hw = 2.2;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1, z1] = pts[i];
      const [x2, y2, z2] = pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const nx = (-dz / len) * hw;
      const nz = (dx / len) * hw;
      const ry1 = y1 + 0.55;
      const ry2 = y2 + 0.55;
      pos.push(
        x1 + nx, ry1, z1 + nz,
        x1 - nx, ry1, z1 - nz,
        x2 - nx, ry2, z2 - nz,
        x1 + nx, ry1, z1 + nz,
        x2 - nx, ry2, z2 - nz,
        x2 + nx, ry2, z2 + nz
      );
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthTest: true,
    });
    this.routeMesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.routeMesh);
  }
}
