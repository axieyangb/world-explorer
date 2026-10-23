// Kaiju Defense: tactical supply drops (parachute crate, 250m light beacon, 18m pickup ring, risk/reward proximity).
import * as THREE from "../../../vendor/three.module.js";
import { CFG } from "./kaiju_config.js";
import { getBeijingTerrainElevation } from "../../environment.js";

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

const BEACON_VS = [
  "varying vec2 vUv;",
  "varying vec3 vN;",
  "varying vec3 vV;",
  "void main() {",
  "  vUv = uv;",
  "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
  "  vN = normalize(normalMatrix * normal);",
  "  vV = -mv.xyz;",
  "  gl_Position = projectionMatrix * mv;",
  "}"
].join("\n");

const BEACON_FS = [
  "uniform vec3 uColor;",
  "uniform float uTime;",
  "uniform float uAlpha;",
  "varying vec2 vUv;",
  "varying vec3 vN;",
  "varying vec3 vV;",
  "void main() {",
  "  float edge = pow(abs(dot(normalize(vN), normalize(vV))), 0.75);",
  "  float vFade = (1.0 - smoothstep(0.15, 1.0, vUv.y)) * smoothstep(0.0, 0.04, vUv.y);",
  "  float wave = 0.72 + 0.28 * sin(vUv.y * 28.0 - uTime * 5.5);",
  "  float a = edge * vFade * wave * uAlpha;",
  "  gl_FragColor = vec4(uColor * a * 1.9, 1.0);",
  "}"
].join("\n");

export class KaijuSupply {
  constructor(K) {
    this.K = K;
    this.drops = [];
    this.nextTimer = CFG.SUPPLY_FIRST;
    this._time = 0;
    this._lastId = "";
    this._initSharedGeo();
  }

  _initSharedGeo() {
    this._boxGeo = new THREE.BoxGeometry(2.8, 2.1, 2.8);
    this._bandGeo = new THREE.BoxGeometry(2.92, 0.34, 2.92);
    this._chuteGeo = new THREE.SphereGeometry(4.4, 14, 8, 0, TAU, 0, Math.PI * 0.52);
    this._beaconGeo = new THREE.CylinderGeometry(1.1, 2.4, CFG.SUPPLY_BEACON_HEIGHT, 16, 1, true);
    this._beaconGeo.translate(0, CFG.SUPPLY_BEACON_HEIGHT * 0.5, 0);
    this._ringGeo = new THREE.RingGeometry(CFG.SUPPLY_PICKUP_RADIUS - 0.85, CFG.SUPPLY_PICKUP_RADIUS, 40);
    this._ringGeo.rotateX(-Math.PI / 2);

    const linePos = [];
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) * (Math.PI / 2);
      linePos.push(Math.cos(a) * 1.2, 1.0, Math.sin(a) * 1.2);
      linePos.push(Math.cos(a) * 4.0, 6.2, Math.sin(a) * 4.0);
    }
    this._cordGeo = new THREE.BufferGeometry();
    this._cordGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
  }

  _pickWeaponId() {
    const weights = CFG.SUPPLY_WEIGHTS || { railgun: 3, swarm: 3, emp: 2, orbital: 2 };
    const entries = Object.entries(weights);
    let total = 0;
    for (const [id, w] of entries) {
      total += id === this._lastId ? w * 0.35 : w;
    }
    let r = Math.random() * total;
    for (const [id, w] of entries) {
      const ew = id === this._lastId ? w * 0.35 : w;
      if ((r -= ew) <= 0) {
        this._lastId = id;
        return id;
      }
    }
    return entries[0][0];
  }

  _surfaceAt(x, z) {
    let y = getBeijingTerrainElevation(x, z);
    const app = this.K?.app;
    if (app && typeof app.getBuildingCeilingAt === "function") {
      const ceil = app.getBuildingCeilingAt(x, y, z, 2.5);
      if (ceil !== null && ceil !== undefined && ceil > y) y = ceil;
    }
    return y;
  }

  spawnDrop(forcedId, forcedX, forcedZ) {
    const K = this.K;
    if (!K || !K.scene) return null;
    if (this.drops.length >= CFG.SUPPLY_MAX_LIVE) {
      this._removeDrop(0);
    }

    const id = forcedId || this._pickWeaponId();
    const k = K.kaiju;
    const hp = K.getHeliPos?.() || { x: 0, y: 150, z: 0 };
    const kx = k && k.position ? k.position.x : hp.x;
    const kz = k && k.position ? k.position.z : hp.z;

    const danger = Math.random() >= CFG.SUPPLY_SAFE_CHANCE;
    const rMin = danger ? CFG.SUPPLY_DANGER_MIN : CFG.SUPPLY_SAFE_MIN;
    const rMax = danger ? CFG.SUPPLY_DANGER_MAX : CFG.SUPPLY_SAFE_MAX;

    let x = forcedX, z = forcedZ;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      const baseAng = Math.atan2(hp.x - kx, hp.z - kz);
      for (let attempt = 0; attempt < 8; attempt++) {
        const ang = baseAng + (Math.random() - 0.5) * Math.PI * 1.35;
        const dist = rMin + Math.random() * (rMax - rMin);
        const tx = kx + Math.sin(ang) * dist;
        const tz = kz + Math.cos(ang) * dist;
        const water = K.app?.water;
        if (attempt < 6 && water && typeof water.isWaterAt === "function" && water.isWaterAt(tx, tz)) continue;
        x = tx;
        z = tz;
        break;
      }
    }

    const landingY = this._surfaceAt(x, z) + 1.05;
    const startY = landingY + CFG.SUPPLY_DROP_HEIGHT;
    const colHex = danger ? 0xffb830 : 0x38f2ff;
    const col = new THREE.Color(colHex);

    const group = new THREE.Group();
    group.name = "kaijuSupplyDrop";
    group.position.set(x, startY, z);

    // Crate + glowing band
    const crateGroup = new THREE.Group();
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x1e2631, roughness: 0.4, metalness: 0.65 });
    const bandMat = new THREE.MeshBasicMaterial({ color: colHex });
    const crateMesh = new THREE.Mesh(this._boxGeo, crateMat);
    const bandMesh = new THREE.Mesh(this._bandGeo, bandMat);
    crateGroup.add(crateMesh, bandMesh);
    group.add(crateGroup);

    // Parachute canopy + suspension cords
    const chuteGroup = new THREE.Group();
    const chuteMat = new THREE.MeshStandardMaterial({
      color: danger ? 0xff922b : 0x22b8cf,
      roughness: 0.65,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const dome = new THREE.Mesh(this._chuteGeo, chuteMat);
    dome.position.y = 6.2;
    const cords = new THREE.LineSegments(this._cordGeo, new THREE.LineBasicMaterial({ color: 0xd0d8e0, transparent: true, opacity: 0.7 }));
    chuteGroup.add(dome, cords);
    group.add(chuteGroup);

    // 250m vertical beacon pillar (anchored at landingY so it stretches from ground to sky)
    const beaconMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: col },
        uTime: { value: 0 },
        uAlpha: { value: 0.85 },
      },
      vertexShader: BEACON_VS,
      fragmentShader: BEACON_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const beacon = new THREE.Mesh(this._beaconGeo, beaconMat);
    beacon.frustumCulled = false;
    beacon.renderOrder = 10;
    group.add(beacon);

    // 18m pickup ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: colHex,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(this._ringGeo, ringMat);
    ring.position.y = -0.85;
    ring.renderOrder = 9;
    group.add(ring);

    K.scene.add(group);

    const drop = {
      id,
      x,
      y: startY,
      z,
      landingY,
      danger,
      landed: false,
      life: CFG.SUPPLY_LIFETIME,
      maxLife: CFG.SUPPLY_LIFETIME,
      group,
      crateGroup,
      chuteGroup,
      beacon,
      beaconMat,
      ring,
      ringMat,
      crateMat,
      bandMat,
      chuteMat,
    };
    this.drops.push(drop);
    K.hud?.announceSupply?.(id, "drop");
    return drop;
  }

  _removeDrop(idx) {
    const d = this.drops[idx];
    if (!d) return;
    this.drops.splice(idx, 1);
    d.group.parent?.remove(d.group);
    d.beaconMat?.dispose?.();
    d.ringMat?.dispose?.();
    d.crateMat?.dispose?.();
    d.bandMat?.dispose?.();
    d.chuteMat?.dispose?.();
  }

  hazard(x, z, r) {
    const r2 = (r + 2.5) * (r + 2.5);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.y - d.landingY > CFG.SUPPLY_HAZARD_HEIGHT) continue;
      const dx = d.x - x, dz = d.z - z;
      if (dx * dx + dz * dz <= r2) {
        _v.set(d.x, d.y, d.z);
        this.K.fx?.spawn?.("explosion", _v, { scale: 1.2 });
        this._removeDrop(i);
      }
    }
  }

  update(dt) {
    const K = this.K;
    if (!K || !(dt > 0)) return;
    if (K.state !== "intro" && K.state !== "fight") return;
    this._time += dt;

    this.nextTimer -= dt;
    if (this.nextTimer <= 0) {
      this.nextTimer = CFG.SUPPLY_INTERVAL_MIN + Math.random() * (CFG.SUPPLY_INTERVAL_MAX - CFG.SUPPLY_INTERVAL_MIN);
      this.spawnDrop();
    }

    const hp = K.getHeliPos?.();
    const canPickup = K.heli?.alive && hp;
    const pickR = CFG.SUPPLY_PICKUP_RADIUS;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (!d.landed) {
        d.y -= CFG.SUPPLY_FALL_SPEED * dt;
        const sway = Math.sin(this._time * 2.2 + i) * 0.12;
        d.crateGroup.rotation.z = sway;
        d.chuteGroup.rotation.z = sway * 0.7;
        if (d.y <= d.landingY) {
          d.y = d.landingY;
          d.landed = true;
          d.chuteGroup.visible = false;
          d.crateGroup.rotation.set(0, 0, 0);
          _v.set(d.x, d.y, d.z);
          K.fx?.spawn?.("dustRing", _v, { scale: 0.35 });
        }
      } else {
        d.life -= dt;
        if (d.life <= 0) {
          this._removeDrop(i);
          continue;
        }
      }

      d.group.position.set(d.x, d.y, d.z);
      d.crateGroup.rotation.y += dt * 0.85;
      // Keep beacon anchored on the landing surface
      d.beacon.position.y = d.landingY - d.y;
      d.ring.position.y = d.landingY - d.y - 0.8;
      const pulse = 0.88 + 0.12 * Math.sin(this._time * 5.0 + i);
      d.ring.scale.setScalar(pulse);

      let blink = 1;
      if (d.landed && d.life < CFG.SUPPLY_BLINK) {
        blink = Math.sin(this._time * 18.0) > 0 ? 1 : 0.2;
      }
      d.beaconMat.uniforms.uTime.value = this._time;
      d.beaconMat.uniforms.uAlpha.value = 0.82 * blink;
      d.ringMat.opacity = (0.55 + 0.25 * Math.sin(this._time * 4.5)) * blink;

      if (canPickup) {
        const dx = hp.x - d.x, dz = hp.z - d.z;
        const dy = Math.abs(hp.y - d.y);
        if (dx * dx + dz * dz <= pickR * pickR && dy <= pickR + 18) {
          this._pickup(i);
        }
      }
    }
  }

  _pickup(idx) {
    const d = this.drops[idx];
    if (!d) return;
    const K = this.K;
    const id = d.id;
    _v.set(d.x, d.y + 1.5, d.z);
    this._removeDrop(idx);

    K.super?.equip?.(id);
    // Bonus field repair + cannon heat reset on supply crate pickup
    if (K.heli && K.heli.alive && K.heli.health < CFG.HELI_HP) {
      K.heli.health = Math.min(CFG.HELI_HP, K.heli.health + (CFG.REPAIR_HP || 60));
    }
    if (K.weapons) {
      K.weapons.heat = 0;
      K.weapons.overheated = false;
    }
    K.audio?.play?.("pickup", { gain: 0.95 });
    K.fx?.spawn?.("spark", _v, { count: 18, scale: 1.8, speed: 35 });
    K.hud?.announceSupply?.(id, "pickup");
  }

  reset() {
    while (this.drops.length > 0) this._removeDrop(this.drops.length - 1);
    this.nextTimer = CFG.SUPPLY_FIRST;
    this._time = 0;
  }
}
