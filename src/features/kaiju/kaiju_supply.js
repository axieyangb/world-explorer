// Kaiju Defense: tactical supply drops (hovering parachute crate at helicopter altitude, 250m light beacon, magnetic & shoot-to-collect pickup).
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
    this._spawnCount = 0;
    this._initSharedGeo();
  }

  _initSharedGeo() {
    this._boxGeo = new THREE.BoxGeometry(4.2, 3.1, 4.2);
    this._bandGeo = new THREE.BoxGeometry(4.36, 0.55, 4.36);
    this._chuteGeo = new THREE.SphereGeometry(6.2, 14, 8, 0, TAU, 0, Math.PI * 0.52);
    this._beaconGeo = new THREE.CylinderGeometry(1.4, 2.8, CFG.SUPPLY_BEACON_HEIGHT, 16, 1, true);
    this._beaconGeo.translate(0, CFG.SUPPLY_BEACON_HEIGHT * 0.5, 0);
    this._ringGeo = new THREE.RingGeometry(CFG.SUPPLY_PICKUP_RADIUS - 1.2, CFG.SUPPLY_PICKUP_RADIUS, 40);
    this._ringGeo.rotateX(-Math.PI / 2);

    const linePos = [];
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) * (Math.PI / 2);
      linePos.push(Math.cos(a) * 1.8, 1.4, Math.sin(a) * 1.8);
      linePos.push(Math.cos(a) * 5.6, 8.2, Math.sin(a) * 5.6);
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
    const hp = K.getHeliPos?.() || { x: 0, y: 120, z: 0 };
    const kx = k && k.position ? k.position.x : hp.x;
    const kz = k && k.position ? k.position.z : hp.z;

    const danger = Math.random() >= CFG.SUPPLY_SAFE_CHANCE;
    let x = forcedX, z = forcedZ;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      const toKaijuAng = Math.atan2(kx - hp.x, kz - hp.z);
      const heliYaw = K.app?.yaw ?? toKaijuAng;
      if (this._spawnCount === 0) {
        // First drop always spawns ~115m directly ahead of the helicopter so the player sees it immediately
        const fwdAng = Number.isFinite(toKaijuAng) && Math.hypot(kx - hp.x, kz - hp.z) > 30 ? toKaijuAng : heliYaw;
        x = hp.x + Math.sin(fwdAng) * 115;
        z = hp.z + Math.cos(fwdAng) * 115;
      } else {
        for (let attempt = 0; attempt < 8; attempt++) {
          const ang = toKaijuAng + (Math.random() - 0.5) * 1.1;
          const dist = 105 + Math.random() * 115;
          const tx = hp.x + Math.sin(ang) * dist;
          const tz = hp.z + Math.cos(ang) * dist;
          const water = K.app?.water;
          if (attempt < 6 && water && typeof water.isWaterAt === "function" && water.isWaterAt(tx, tz)) continue;
          x = tx;
          z = tz;
          break;
        }
      }
    }
    this._spawnCount++;

    const groundY = this._surfaceAt(x, z) + 1.05;
    const hoverAlt = CFG.SUPPLY_HOVER_ALT || 95;
    const hoverY = Math.max(groundY + 65, Math.min(hp.y || (groundY + hoverAlt), groundY + 115));
    const startY = hoverY + (CFG.SUPPLY_DROP_HEIGHT || 110);
    const colHex = danger ? 0xffb830 : 0x38f2ff;
    const col = new THREE.Color(colHex);

    const group = new THREE.Group();
    group.name = "kaijuSupplyDrop";
    group.position.set(x, startY, z);

    // Crate + glowing band
    const crateGroup = new THREE.Group();
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x1e2631, roughness: 0.35, metalness: 0.65 });
    const bandMat = new THREE.MeshBasicMaterial({ color: colHex });
    const crateMesh = new THREE.Mesh(this._boxGeo, crateMat);
    const bandMesh = new THREE.Mesh(this._bandGeo, bandMat);
    crateGroup.add(crateMesh, bandMesh);
    group.add(crateGroup);

    // Parachute canopy + suspension cords
    const chuteGroup = new THREE.Group();
    const chuteMat = new THREE.MeshStandardMaterial({
      color: danger ? 0xff922b : 0x22b8cf,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const dome = new THREE.Mesh(this._chuteGeo, chuteMat);
    dome.position.y = 8.2;
    const cords = new THREE.LineSegments(this._cordGeo, new THREE.LineBasicMaterial({ color: 0xd0d8e0, transparent: true, opacity: 0.78 }));
    chuteGroup.add(dome, cords);
    group.add(chuteGroup);

    // 250m vertical beacon pillar (anchored at groundY so it stretches from ground through the hovering crate to the sky)
    const beaconMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: col },
        uTime: { value: 0 },
        uAlpha: { value: 0.9 },
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

    // Pickup ring right around the hovering crate at helicopter altitude
    const ringMat = new THREE.MeshBasicMaterial({
      color: colHex,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(this._ringGeo, ringMat);
    ring.position.y = -0.8;
    ring.renderOrder = 9;
    group.add(ring);

    K.scene.add(group);

    const drop = {
      id,
      type: id,
      x,
      y: startY,
      z,
      landingY: groundY,
      hoverY,
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

  _checkShotCollect(d) {
    const K = this.K;
    const w = K?.weapons;
    if (!w) return false;

    // 1. Check active cannon rounds
    if (Array.isArray(w.rounds)) {
      for (const r of w.rounds) {
        if (!r.active || !r.pos) continue;
        if (Math.hypot(r.pos.x - d.x, r.pos.z - d.z) <= 22 && Math.abs(r.pos.y - d.y) <= 85) {
          K.fx?.killTracer?.(r.tracer);
          r.active = false;
          return true;
        }
      }
    }

    // 2. Check active missiles
    if (Array.isArray(w.missiles)) {
      for (const m of w.missiles) {
        if (!m.active || !m.pos) continue;
        if (Math.hypot(m.pos.x - d.x, m.pos.z - d.z) <= 26 && Math.abs(m.pos.y - d.y) <= 95) {
          m.active = false;
          return true;
        }
      }
    }

    // 3. Check live aim ray when player is actively firing Cannon (Space / Left-Click) or Missiles (F)
    const firing = Boolean(w._cannonKey || w._cannonMouse || (w._salvoLeft && w._salvoLeft > 0));
    if (firing && typeof K.getAimRay === "function") {
      const ray = K.getAimRay(0, 0);
      if (ray && ray.origin && ray.dir) {
        const rx = ray.origin.x, rz = ray.origin.z;
        const rdx = ray.dir.x, rdz = ray.dir.z;
        const lenXZ2 = rdx * rdx + rdz * rdz;
        if (lenXZ2 > 1e-4) {
          const tClosest = ((d.x - rx) * rdx + (d.z - rz) * rdz) / lenXZ2;
          if (tClosest > 4 && tClosest < 950) {
            const cx = rx + rdx * tClosest, cz = rz + rdz * tClosest;
            if (Math.hypot(d.x - cx, d.z - cz) <= 24) {
              return true;
            }
          }
        }
      }
    }
    return false;
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
    const pickR = CFG.SUPPLY_PICKUP_RADIUS || 28;
    const magnetR = CFG.SUPPLY_MAGNET_RADIUS || 48;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (!d.landed) {
        d.y -= CFG.SUPPLY_FALL_SPEED * dt;
        const sway = Math.sin(this._time * 2.2 + i) * 0.12;
        d.crateGroup.rotation.z = sway;
        d.chuteGroup.rotation.z = sway * 0.7;
        if (d.y <= d.hoverY) {
          d.y = d.hoverY;
          d.landed = true;
          d.crateGroup.rotation.set(0, 0, 0);
        }
      } else {
        d.life -= dt;
        if (d.life <= 0) {
          this._removeDrop(i);
          continue;
        }
        // Gentle aerial hover bob at helicopter flight altitude
        d.y = d.hoverY + Math.sin(this._time * 2.4 + i) * 2.2;
      }

      if (canPickup) {
        const distXZ = Math.hypot(hp.x - d.x, hp.z - d.z);
        if (distXZ <= magnetR) {
          const pull = Math.min(1, dt * 9.5);
          d.x += (hp.x - d.x) * pull;
          d.y += (hp.y - d.y) * pull;
          d.z += (hp.z - d.z) * pull;
          d.hoverY = d.y;
        }
        if (Math.hypot(hp.x - d.x, hp.z - d.z) <= pickR || this._checkShotCollect(d)) {
          this._pickup(i);
          continue;
        }
      }

      d.group.position.set(d.x, d.y, d.z);
      d.crateGroup.rotation.y += dt * 0.95;
      // Keep beacon anchored on the ground surface while pickup ring stays around the hovering crate
      d.beacon.position.y = d.landingY - d.y;
      d.ring.position.y = -0.8;
      const pulse = 0.88 + 0.14 * Math.sin(this._time * 5.0 + i);
      d.ring.scale.setScalar(pulse);

      let blink = 1;
      if (d.landed && d.life < CFG.SUPPLY_BLINK) {
        blink = Math.sin(this._time * 18.0) > 0 ? 1 : 0.2;
      }
      d.beaconMat.uniforms.uTime.value = this._time;
      d.beaconMat.uniforms.uAlpha.value = 0.85 * blink;
      d.ringMat.opacity = (0.6 + 0.25 * Math.sin(this._time * 4.5)) * blink;
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
    this._spawnCount = 0;
  }
}
