import * as THREE from "../../vendor/three.module.js";
import { createHeroAirlinerModel, charAirlinerModel, AIRLINER_LIVERIES } from "./airliner_models.js";

/**
 * AirlinerSystem — Interactive Commercial Wide-Body Airliner (Boeing 787 / Airbus A350)
 *
 * Features:
 *   1. Board / Drive Any Parked Airport Airliner (`F` or `E` within 45 m, or click prompt)
 *   2. Physically Matched ISA Aerodynamics & 12,500 m (FL410) Service Ceiling:
 *      - Air density ratio sigma(h) = exp(-h / 8500)
 *      - Indicated Airspeed IAS = TAS * sqrt(sigma)
 *      - Lift requires rotation speed Vr ~ 62 m/s IAS (~225 km/h); below Vstall ~ 50 m/s IAS,
 *        nose drops to recover speed.
 *      - Ground taxiing with steerable nosewheel (`A`/`D`), wheel brakes (`S`), and reverse-thrust
 *        gate pushback (`S` when stopped).
 *      - Automatic landing gear retraction above 35 m AGL & extension below 55 m AGL (or `G` key).
 *   3. 3D Volumetric Cloud Deck (y = 1,400 m .. 2,300 m) + Screen Cloud Mist + High-Altitude Contrails
 *   4. Full Weapon Damage System (600 HP) for both Parked & Player Airliners:
 *      - < 70% HP: Engine #2 fire + black smoke trail + asymmetric yaw + -35% thrust
 *      - < 35% HP: Dual engine fire + total flameout (Mayday glide)
 *      - 0 HP or high-speed crash: Multi-fireball explosion + shockwave ring + charred wreck
 */

const MAX_HP = 600;
const GRAVITY = 9.81;
const SERVICE_CEILING = 12500; // 12.5 km (FL410)
const CLOUD_BASE_Y = 1420;
const CLOUD_TOP_Y = 2280;

export class AirlinerSystem {
  constructor(app) {
    this.app = app;
    this.scene = app.scene;

    // Active / player-controlled or parked hero airliner
    this.liveryIdx = 0;
    this.mesh = createHeroAirlinerModel(this.liveryIdx);
    this.mesh.visible = false;
    this.scene.add(this.mesh);

    // State of the hero airliner (persists when player exits on tarmac!)
    this.hasSpawnedHero = false;
    this.grounded = true;
    this.gearDown = true;
    this.gearAnim = 1.0; // 1 = down, 0 = retracted
    this.throttle = 0;   // -0.25 (reverse thrust) .. 1.0 (TOGA)
    this.speed = 0;      // forward speed along heading/flight path (m/s TAS)
    this.ias = 0;        // Indicated Airspeed (m/s)
    this.mach = 0;       // Mach number
    this.vertSpeed = 0;  // vertical speed (m/s)
    this.pitch = 0;      // pitch angle (rad, positive = nose up)
    this.roll = 0;       // bank angle (rad, positive = right wing down)
    this.yawRate = 0;
    this.flaps = 0.5;    // 0 = clean, 0.5 = takeoff, 1.0 = landing
    this.stalling = false;
    this.groundY = 0;

    // Health & damage state for the active/hero airliner
    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.dead = false;
    this.deadTimer = 0;
    this.smokeClock = 0;
    this.contrailClock = 0;

    // Damaged / boarded parked airliners converted from instanced airport planes into interactive 3D rigs
    // Each entry: { key, x, y, z, yaw, liveryIdx, hp, maxHp, dead, mesh, smokeClock }
    this.damagedParked = new Map();

    // Transient explosion fireballs / smoke / contrail particles
    this.fxParticles = [];
    this._initFxPool();

    // 3D Volumetric Cloud Deck (y = 1,420 .. 2,280 m)
    this.cloudGroup = new THREE.Group();
    this.cloudGroup.name = "AirlinerCloudDeck";
    this.scene.add(this.cloudGroup);
    this._initCloudDeck();

    // DOM overlays (boarding prompt + cloud mist veil + airliner status pill)
    this._initDomOverlays();
    this._bindExtraKeys();
  }

  _initDomOverlays() {
    if (typeof document === "undefined") return;

    // 1. Cloud condensation mist overlay when flying through y = 1,400..2,300 m
    let mist = document.getElementById("airliner-cloud-mist");
    if (!mist) {
      mist = document.createElement("div");
      mist.id = "airliner-cloud-mist";
      mist.style.cssText = [
        "position:fixed",
        "inset:0",
        "pointer-events:none",
        "z-index:12",
        "opacity:0",
        "transition:opacity 0.18s linear",
        "background:radial-gradient(circle at 50% 45%, rgba(238,245,255,0.58) 0%, rgba(215,228,245,0.82) 70%, rgba(195,212,235,0.92) 100%)"
      ].join(";");
      document.body.appendChild(mist);
    }
    this.mistEl = mist;

    // 2. Interactive Boarding Prompt ("Press F or E to Board Boeing 787 / Airbus A350")
    let prompt = document.getElementById("airliner-board-prompt");
    if (!prompt) {
      prompt = document.createElement("button");
      prompt.id = "airliner-board-prompt";
      prompt.type = "button";
      prompt.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:112px",
        "transform:translateX(-50%)",
        "z-index:35",
        "display:none",
        "align-items:center",
        "gap:10px",
        "padding:10px 18px",
        "border-radius:999px",
        "border:1px solid rgba(56,189,248,0.55)",
        "background:rgba(10,16,28,0.88)",
        "backdrop-filter:blur(10px)",
        "color:#f8fafc",
        "font:600 13px/1.2 system-ui, -apple-system, sans-serif",
        "letter-spacing:0.02em",
        "box-shadow:0 10px 28px rgba(0,0,0,0.45)",
        "cursor:pointer"
      ].join(";");
      prompt.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const px = this.app.mode === "drive" ? this.app.vehicleMesh.position.x : this.app.pos.x;
        const py = this.app.mode === "drive" ? this.app.vehicleMesh.position.y : this.app.pos.y;
        const pz = this.app.mode === "drive" ? this.app.vehicleMesh.position.z : this.app.pos.z;
        this.tryBoardNearest(px, py, pz, 55);
      });
      document.body.appendChild(prompt);
    }
    this.promptEl = prompt;
  }

  _bindExtraKeys() {
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (this.app.mode !== "airliner") return;
      if (e.code === "KeyG") {
        // Manual landing gear toggle when airborne
        if (!this.grounded) {
          this.gearDown = !this.gearDown;
          this.app._showToast?.(
            this.gearDown ? "Landing Gear Extending" : "Landing Gear Retracted",
            "1800"
          );
        }
      } else if (e.code === "KeyL") {
        // Cycle airline livery on the fly
        this.cycleLivery();
      }
    });
  }

  cycleLivery(nextIdx) {
    this.liveryIdx = typeof nextIdx === "number"
      ? ((nextIdx % AIRLINER_LIVERIES.length) + AIRLINER_LIVERIES.length) % AIRLINER_LIVERIES.length
      : (this.liveryIdx + 1) % AIRLINER_LIVERIES.length;
    const oldPos = this.mesh.position.clone();
    const oldQuat = this.mesh.quaternion.clone();
    const vis = this.mesh.visible;
    this.scene.remove(this.mesh);
    this.mesh = createHeroAirlinerModel(this.liveryIdx);
    this.mesh.position.copy(oldPos);
    this.mesh.quaternion.copy(oldQuat);
    this.mesh.visible = vis;
    this.scene.add(this.mesh);
    this.app.airlinerMesh = this.mesh;
    return AIRLINER_LIVERIES[this.liveryIdx];
  }

  _initCloudDeck() {
    // 1. Procedural Cumulus Cloud Layer Shader Sheet at y = 1,820 m (28 km x 28 km)
    const sheetGeo = new THREE.PlaneGeometry(28000, 28000, 1, 1);
    sheetGeo.rotateX(-Math.PI / 2);
    const sheetMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector2(0, 0) },
        uSunElev: { value: 0.65 }
      },
      vertexShader: `
        varying vec2 vWorldXZ;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldXZ = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec2 vWorldXZ;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uCenter;
        uniform float uSunElev;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.52;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = p * 2.07 + vec2(13.7, 29.3);
            a *= 0.5;
          }
          return v;
        }
        void main() {
          vec2 wind = vec2(uTime * 14.0, uTime * 6.0);
          vec2 uv = (vWorldXZ + wind) * 0.00038;
          float n = fbm(uv);
          float n2 = fbm(uv * 2.4 - wind * 0.0002);
          float density = smoothstep(0.47, 0.76, n * 0.75 + n2 * 0.35);
          float distFade = 1.0 - smoothstep(7500.0, 13500.0, length(vWorldXZ - uCenter));
          float alpha = density * distFade * 0.72;
          if (alpha < 0.015) discard;
          vec3 dayTop = vec3(0.97, 0.98, 1.0);
          vec3 dayBase = vec3(0.76, 0.82, 0.90);
          vec3 duskTop = vec3(0.98, 0.76, 0.62);
          vec3 nightTop = vec3(0.14, 0.18, 0.26);
          float dayFactor = clamp(uSunElev * 1.8, 0.0, 1.0);
          vec3 col = mix(nightTop, mix(duskTop, mix(dayBase, dayTop, smoothstep(0.45, 0.82, n)), dayFactor), clamp(uSunElev + 0.35, 0.15, 1.0));
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.cloudSheet = new THREE.Mesh(sheetGeo, sheetMat);
    this.cloudSheet.position.y = 1820;
    this.cloudSheet.frustumCulled = false;
    this.cloudGroup.add(this.cloudSheet);

    // 2. 3D Volumetric Cumulus Puff Clusters (160 instanced multi-lobe cloud billows between 1,450 and 2,250 m)
    const puffGeo = new THREE.IcosahedronGeometry(1, 2);
    puffGeo.scale(1.6, 0.58, 1.25);
    const puffMat = new THREE.MeshLambertMaterial({
      color: 0xf4f8ff,
      emissive: 0x334155,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.68,
      depthWrite: false
    });
    const puffCount = 160;
    this.cloudPuffs = new THREE.InstancedMesh(puffGeo, puffMat, puffCount);
    this.cloudPuffs.frustumCulled = false;
    this.cloudPuffData = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < puffCount; i++) {
      const ox = (Math.random() - 0.5) * 14000;
      const oz = (Math.random() - 0.5) * 14000;
      const oy = CLOUD_BASE_Y + 60 + Math.random() * (CLOUD_TOP_Y - CLOUD_BASE_Y - 120);
      const sx = 140 + Math.random() * 260;
      const sy = 90 + Math.random() * 140;
      const sz = 130 + Math.random() * 240;
      const rotY = Math.random() * Math.PI * 2;
      this.cloudPuffData.push({ ox, oy, oz, sx, sy, sz, rotY });
      dummy.position.set(ox, oy, oz);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      this.cloudPuffs.setMatrixAt(i, dummy.matrix);
    }
    this.cloudPuffs.instanceMatrix.needsUpdate = true;
    this.cloudGroup.add(this.cloudPuffs);
  }

  _initFxPool() {
    this.fxGroup = new THREE.Group();
    this.fxGroup.name = "AirlinerFX";
    this.scene.add(this.fxGroup);
    this._fxSphereGeo = new THREE.IcosahedronGeometry(1, 1);
    this._fxRingGeo = new THREE.RingGeometry(0.7, 1.0, 24);
    this._fxRingGeo.rotateX(-Math.PI / 2);
  }

  _spawnParticle({ pos, vel, radius = 2.0, growth = 8.0, life = 1.6, color = 0x222226, emissive = 0x000000, opacity = 0.75, isRing = false }) {
    const mat = new THREE.MeshBasicMaterial({
      color: emissive || color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(isRing ? this._fxRingGeo : this._fxSphereGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(radius);
    this.fxGroup.add(mesh);
    this.fxParticles.push({
      mesh,
      vel: vel.clone(),
      radius,
      growth,
      age: 0,
      life,
      startOpacity: opacity,
      isRing
    });
  }

  /**
   * Find the nearest boardable airliner (either the player's previously parked hero airliner
   * or any instanced/damaged parked airport airliner from `app.places._planes` within `maxDist`).
   */
  findNearestBoardable(x, y, z, maxDist = 45) {
    let best = null;
    let bestD2 = maxDist * maxDist;

    // 1. Check active/parked hero airliner if it is in the world and not destroyed
    if (this.hasSpawnedHero && this.mesh.visible && !this.dead && this.app.mode !== "airliner") {
      const dx = this.mesh.position.x - x;
      const dz = this.mesh.position.z - z;
      const dy = (this.mesh.position.y - y) * 0.5;
      const d2 = dx * dx + dz * dz + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = {
          type: "hero",
          x: this.mesh.position.x,
          y: this.mesh.position.y,
          z: this.mesh.position.z,
          yaw: this.app.yaw || 0,
          liveryIdx: this.liveryIdx,
          dist: Math.sqrt(d2)
        };
      }
    }

    // 2. Check damaged parked airliners
    for (const [key, p] of this.damagedParked.entries()) {
      if (p.dead) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = {
          type: "damagedParked",
          key,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
          liveryIdx: p.liveryIdx,
          hp: p.hp,
          dist: Math.sqrt(d2)
        };
      }
    }

    // 3. Check instanced airport parked planes in `app.places._planes`
    const planes = this.app.places?._planes;
    if (Array.isArray(planes)) {
      for (let i = 0; i < planes.length; i++) {
        const pl = planes[i];
        if (!pl) continue;
        const key = `${Math.round(pl.x)}_${Math.round(pl.z)}`;
        if (this.app.places.hiddenPlanes?.has(key)) continue;
        const dx = pl.x - x;
        const dz = pl.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          const liveryIdx = Math.abs(Math.round(pl.x * 0.13 + pl.z * 0.07)) % AIRLINER_LIVERIES.length;
          best = {
            type: "instanced",
            key,
            x: pl.x,
            y: this.app.world.getHeightAt(pl.x, pl.z),
            z: pl.z,
            yaw: pl.yaw || 0,
            liveryIdx,
            dist: Math.sqrt(d2)
          };
        }
      }
    }

    return best;
  }

  /**
   * Attempt to board the nearest parked airliner within `maxDist` meters.
   * Returns true if boarded.
   */
  tryBoardNearest(x, y, z, maxDist = 45) {
    const cand = this.findNearestBoardable(x, y, z, maxDist);
    if (!cand) return false;

    if (cand.type === "instanced") {
      this.app.places?.hidePlaneAt?.(cand.x, cand.z);
      this.cycleLivery(cand.liveryIdx);
      this.hp = MAX_HP;
      this.dead = false;
    } else if (cand.type === "damagedParked") {
      const dp = this.damagedParked.get(cand.key);
      if (dp && dp.mesh) {
        this.scene.remove(dp.mesh);
      }
      this.damagedParked.delete(cand.key);
      this.cycleLivery(cand.liveryIdx);
      this.hp = dp ? dp.hp : MAX_HP;
      this.dead = false;
    }

    const groundH = this.app.world.getHeightAt(cand.x, cand.z);
    this.mesh.position.set(cand.x, groundH, cand.z);
    // Notice: places.js orients plane along local +Z when yaw=0, whereas player vehicle faces -Z when heading=0.
    // Convert instanced yaw to player heading:
    const heading = cand.yaw;
    this.app.yaw = heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.ias = 0;
    this.vertSpeed = 0;
    this.throttle = 0;
    this.grounded = true;
    this.gearDown = true;
    this.gearAnim = 1.0;
    this.hasSpawnedHero = true;
    this.mesh.visible = true;
    this._syncOrientation();

    this.app._enteringAirlinerDirectly = true;
    this.app.setMode("airliner");
    this.app._enteringAirlinerDirectly = false;

    const livery = AIRLINER_LIVERIES[this.liveryIdx] || AIRLINER_LIVERIES[0];
    this.app._showToast?.(`Boarded ${livery.name} — W/Up Thrust • S Brake/Reverse • Space Rotate`, 3200);
    return true;
  }

  /**
   * Called when switching directly into `airliner` mode (e.g. from the top Mode bar or Vehicle menu).
   */
  enterAirlinerMode(fromBoarding = false) {
    if (!fromBoarding) {
      // If we are near a parked airport plane, board it directly!
      const px = this.app.mode === "drive"
        ? this.app.vehicleMesh.position.x
        : (this.app.mode === "heli" && this.app.heliMesh ? this.app.heliMesh.position.x : this.app.pos.x);
      const pz = this.app.mode === "drive"
        ? this.app.vehicleMesh.position.z
        : (this.app.mode === "heli" && this.app.heliMesh ? this.app.heliMesh.position.z : this.app.pos.z);
      const py = this.app.world.getHeightAt(px, pz);

      const cand = this.findNearestBoardable(px, py, pz, 80);
      if (cand) {
        if (cand.type === "instanced") {
          this.app.places?.hidePlaneAt?.(cand.x, cand.z);
          this.cycleLivery(cand.liveryIdx);
          this.hp = MAX_HP;
        }
        const gh = this.app.world.getHeightAt(cand.x, cand.z);
        this.mesh.position.set(cand.x, gh, cand.z);
        this.app.yaw = cand.yaw;
        this.grounded = true;
        this.gearDown = true;
        this.gearAnim = 1.0;
        this.speed = 0;
        this.ias = 0;
        this.vertSpeed = 0;
        this.pitch = 0;
        this.roll = 0;
        this.throttle = 0;
      } else if (!this.hasSpawnedHero || this.dead) {
        // Spawn on the ground right at the player's position so they can taxi & take off
        this.hp = MAX_HP;
        this.dead = false;
        this.cycleLivery(this.liveryIdx);
        const gh = this.app.world.getHeightAt(px, pz);
        this.mesh.position.set(px, gh, pz);
        this.grounded = true;
        this.gearDown = true;
        this.gearAnim = 1.0;
        this.speed = 0;
        this.ias = 0;
        this.vertSpeed = 0;
        this.pitch = 0;
        this.roll = 0;
        this.throttle = 0;
      }
    }
    this.hasSpawnedHero = true;
    this.mesh.visible = true;
    this.app.airlinerMesh = this.mesh;
    this._syncOrientation();
    this._updateDamageVisuals(this.mesh, this.hp);
  }

  /**
   * Exit airliner (`F` or `E`):
   * - If grounded/stopped on tarmac, leaves the airliner parked right where it is and places walker beside the boarding stairs.
   * - If airborne, ejects walker with a parachute/safe drop.
   */
  exitToWalk() {
    const pos = this.mesh.position;
    const rightX = -Math.cos(this.app.yaw);
    const rightZ = Math.sin(this.app.yaw);
    const fwdX = Math.sin(this.app.yaw);
    const fwdZ = Math.cos(this.app.yaw);
    // Disembark beside the forward left passenger door (14 m forward, 9 m left of fuselage centerline)
    const exitX = pos.x + fwdX * 14 - rightX * 9.5;
    const exitZ = pos.z + fwdZ * 14 - rightZ * 9.5;
    const exitY = this.app.world.getHeightAt(exitX, exitZ);

    this.app.pos.set(exitX, exitY, exitZ);
    this.app.walkVelY = 0;
    // Keep the airliner visibly parked on the apron!
    this.mesh.visible = true;
    this.app.setMode("walk");
  }

  _syncOrientation() {
    const euler = new THREE.Euler(-this.pitch, this.app.yaw, -this.roll, "YXZ");
    this.mesh.quaternion.setFromEuler(euler);
  }

  /**
   * Main per-frame update when `app.mode === "airliner"`.
   * Implements physically matched ISA flight dynamics from 0 m to 12,500 m (FL410).
   */
  updateFlight(dt) {
    const k = this.app.keys;
    const pos = this.mesh.position;
    this.groundY = this.app.world.getHeightAt(pos.x, pos.z);
    const agl = Math.max(0, pos.y - this.groundY);

    if (this.dead) {
      this.deadTimer += dt;
      // If destroyed in the air, fall to the ground and explode on impact
      if (pos.y > this.groundY + 0.5) {
        this.vertSpeed -= GRAVITY * 1.4 * dt;
        pos.y = Math.max(this.groundY, pos.y + this.vertSpeed * dt);
        this.pitch = Math.max(-0.65, this.pitch - 0.35 * dt);
        this.roll += 0.9 * dt;
        this._syncOrientation();
      } else if (this.deadTimer > 1.4) {
        this.exitToWalk();
      }
      return;
    }

    // Engine health factor:
    //   hp >= 420 (70%): 100% thrust
    //   210 <= hp < 420: Engine #2 on fire -> 65% thrust + yaw pull
    //   hp < 210 (35%): Dual engine fire / flameout -> 0% thrust (Mayday glide!)
    const hpRatio = this.hp / this.maxHp;
    const engineFactor = hpRatio < 0.35 ? 0 : (hpRatio < 0.70 ? 0.65 : 1.0);

    // Input controls
    const throttleUp = k.has("KeyW") || k.has("ArrowUp");
    const throttleDown = k.has("KeyS") || k.has("ArrowDown");
    const steerLeft = k.has("KeyA") || k.has("ArrowLeft");
    const steerRight = k.has("KeyD") || k.has("ArrowRight");
    const pullUp = k.has("Space") || k.has("KeyQ");
    const pushNoseDown = k.has("ShiftLeft") || k.has("ShiftRight") || k.has("KeyC");
    const yawLeft = k.has("KeyZ");
    const yawRight = k.has("KeyX");

    // 1. ISA Atmosphere at altitude h = max(0, pos.y)
    const alt = Math.max(0, pos.y);
    const sigma = Math.exp(-alt / 8500); // Air density ratio rho / rho_0
    const sqrtSigma = Math.sqrt(sigma);
    const speedOfSound = Math.max(295, 340.3 - 0.004 * Math.min(alt, 11000));

    // 2. Throttle & Braking
    if (this.grounded) {
      if (throttleUp && engineFactor > 0) {
        if (this.speed < -0.5) {
          // Braking from reverse pushback
          this.speed = Math.min(0, this.speed + 12 * dt);
          this.throttle = 0;
        } else {
          this.throttle = Math.min(1.0, Math.max(0.18, this.throttle + 0.55 * dt));
        }
      } else if (throttleDown) {
        if (this.speed > 1.2) {
          // Wheel brakes + spoilers on rollout
          this.throttle = 0;
          this.speed = Math.max(0, this.speed - 24 * dt);
        } else {
          // Reverse thrust gate pushback (up to -9 m/s ~ -32 km/h)
          this.throttle = -0.25;
          this.speed = Math.max(-9.0, this.speed - 5.5 * dt * engineFactor);
        }
      } else {
        this.throttle = Math.max(0, this.throttle - 0.35 * dt);
        // Gentle rolling friction on tarmac
        if (Math.abs(this.speed) < 0.15) this.speed = 0;
        else this.speed -= Math.sign(this.speed) * 2.2 * dt;
      }
    } else {
      // Airborne throttle control
      if (throttleUp && engineFactor > 0) {
        this.throttle = Math.min(1.0, this.throttle + 0.45 * dt);
      } else if (throttleDown) {
        this.throttle = Math.max(0.08, this.throttle - 0.45 * dt);
      } else if (this.throttle < 0.62 && engineFactor > 0) {
        // Maintain cruise power by default unless player throttles back
        this.throttle = Math.min(0.75, Math.max(this.throttle, 0.62));
      }
      if (engineFactor === 0) this.throttle = 0;
    }

    // 3. Thrust & Aerodynamic Drag -> True Airspeed (TAS) and Indicated Airspeed (IAS)
    // High-bypass turbofans produce up to ~32 m/s^2 effective unloaded acceleration on takeoff roll
    // so rotation speed (62 m/s IAS) is reached smoothly within ~350 m of runway.
    const ceilingFactor = THREE.MathUtils.clamp(1.0 - Math.max(0, alt - 10800) / (SERVICE_CEILING - 10800), 0.0, 1.0);
    const maxThrustAccel = 31.0 * engineFactor * (0.45 + 0.55 * Math.pow(sigma, 0.35)) * Math.max(0.15, ceilingFactor);
    const thrustAccel = Math.max(0, this.throttle) * maxThrustAccel;

    // Parasitic + induced drag scales with dynamic pressure q ~ sigma * TAS^2
    const gearDrag = this.gearAnim * 0.00065;
    const flapDrag = this.grounded ? 0.00025 : (agl < 400 ? 0.00035 : 0.00008);
    const cd = 0.00052 + gearDrag + flapDrag + Math.abs(this.pitch) * 0.0009;
    const dragAccel = sigma * this.speed * Math.abs(this.speed) * cd;

    // Gravity component along flight path when airborne
    const gravityAlongPath = this.grounded ? 0 : (GRAVITY * Math.sin(this.pitch) * 0.68);

    if (this.speed >= 0) {
      this.speed += (thrustAccel - dragAccel - gravityAlongPath) * dt;
      if (!this.grounded && throttleDown) {
        // Speedbrakes / spoilers in flight
        this.speed = Math.max(38, this.speed - 14 * dt);
      }
      this.speed = Math.min(272, Math.max(this.grounded ? -9 : 28, this.speed));
    }

    this.ias = Math.max(0, this.speed) * sqrtSigma;
    this.mach = Math.max(0, this.speed) / speedOfSound;

    // Asymmetric thrust yaw when Engine #2 is on fire
    const asymYaw = (hpRatio < 0.70 && hpRatio >= 0.35) ? -0.14 * this.throttle : 0;

    // 4. Ground Taxi vs. Airborne Flight Envelope
    const VR_IAS = pullUp ? 52.0 : 62.0;   // Rotation / liftoff Indicated Airspeed (m/s)
    const VSTALL_IAS = 48.0;               // Stall Indicated Airspeed (m/s)

    if (this.grounded) {
      pos.y = this.groundY;
      this.vertSpeed = 0;
      this.stalling = false;

      // Nosewheel steering on tarmac (effective at taxi speeds, gentler at high takeoff roll speeds)
      const steerInput = (steerLeft ? 1 : 0) - (steerRight ? 1 : 0);
      const speedSign = this.speed >= -0.05 ? 1 : -1;
      const steerAuthority = THREE.MathUtils.clamp(Math.abs(this.speed) / 4.5, 0, 1) *
        THREE.MathUtils.lerp(0.95, 0.28, THREE.MathUtils.clamp(Math.abs(this.speed) / 65, 0, 1));
      this.app.yaw += (steerInput * steerAuthority + asymYaw * 0.4) * speedSign * dt;

      // Animate nose gear steering angle
      if (this.mesh.userData.noseGearPivot) {
        this.mesh.userData.noseGearPivot.rotation.y = steerInput * 0.48;
      }

      // Rotation on takeoff roll:
      // Below 44 m/s IAS, aerodynamic elevator authority cannot lift the nosewheel.
      if (this.ias >= 44 && (pullUp || this.ias >= 64)) {
        const targetPitch = pullUp ? 0.21 : 0.14; // ~8-12 deg rotation attitude
        this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, Math.min(1, dt * 3.5));
      } else {
        this.pitch = THREE.MathUtils.lerp(this.pitch, 0, Math.min(1, dt * 6.0));
      }
      this.roll = THREE.MathUtils.lerp(this.roll, 0, Math.min(1, dt * 8.0));

      // Liftoff condition: IAS >= VR_IAS and positive pitch
      if (this.ias >= VR_IAS && this.pitch > 0.065) {
        this.grounded = false;
        this.vertSpeed = Math.max(4.5, this.speed * Math.sin(this.pitch) * 0.75);
        pos.y += this.vertSpeed * dt + 0.15;
        this.app._showToast?.("Positive Rate — Liftoff! (G to toggle Gear)", 2200);
      }
    } else {
      // AIRBORNE FLIGHT DYNAMICS
      if (this.mesh.userData.noseGearPivot) {
        this.mesh.userData.noseGearPivot.rotation.y = 0;
      }

      // Auto-retract gear passing 38 m AGL climbing, auto-extend below 55 m AGL descending
      if (agl > 38 && this.vertSpeed > 1.5 && this.gearDown) {
        this.gearDown = false;
      } else if (agl < 55 && this.vertSpeed < -0.5 && !this.gearDown) {
        this.gearDown = true;
      }

      // Roll (A/D) and coordinated turn heading rate
      const rollInput = (steerRight ? 1 : 0) - (steerLeft ? 1 : 0);
      const maxBank = 0.62; // ~35 deg bank angle limit (normal law protection)
      if (rollInput !== 0) {
        this.roll = THREE.MathUtils.clamp(this.roll + rollInput * 1.15 * dt, -maxBank, maxBank);
      } else {
        this.roll = THREE.MathUtils.lerp(this.roll, 0, Math.min(1, dt * 2.4));
      }

      const rudderInput = (yawLeft ? 1 : 0) - (yawRight ? 1 : 0);
      // Coordinated turn rate omega = (g * tan(roll)) / V + rudder
      const turnRate = -Math.tan(this.roll) * 0.58 + rudderInput * 0.35 + asymYaw;
      this.app.yaw += turnRate * dt;

      // Pitch control & Stall / Service Ceiling protection
      const pitchInput = (pullUp ? 1 : 0) - (pushNoseDown ? 1 : 0);
      this.stalling = this.ias < VSTALL_IAS;

      if (this.stalling) {
        // Stall recovery: aerodynamic lift < weight, nose drops automatically to regain airspeed
        this.pitch = THREE.MathUtils.lerp(this.pitch, -0.22, Math.min(1, dt * 2.8));
      } else if (alt >= SERVICE_CEILING - 150 && pitchInput > 0) {
        // Service ceiling (12,500 m FL410): level off smoothly
        this.pitch = THREE.MathUtils.lerp(this.pitch, 0.0, Math.min(1, dt * 2.5));
      } else if (pitchInput !== 0) {
        const maxPitchUp = 0.34 * ceilingFactor; // ~19.5 deg max climb pitch
        const maxPitchDown = -0.36;
        this.pitch = THREE.MathUtils.clamp(this.pitch + pitchInput * 0.68 * dt, maxPitchDown, maxPitchUp);
      } else {
        // Fly-by-wire attitude trim: gently return toward level flight at cruise
        this.pitch = THREE.MathUtils.lerp(this.pitch, 0.015, Math.min(1, dt * 1.6));
      }

      // Lift vs. Weight vertical velocity equation:
      // Lift factor scales with (IAS / V_ref)^2 and cos(roll)
      const liftRatio = Math.min(1.35, Math.pow(this.ias / 54.0, 2)) * Math.cos(this.roll * 0.7);
      const stallSink = liftRatio < 1.0 ? (1.0 - liftRatio) * 26.0 : 0.0;
      const targetVertSpeed = this.speed * Math.sin(this.pitch) * Math.min(1.0, liftRatio) - stallSink;
      this.vertSpeed = THREE.MathUtils.lerp(this.vertSpeed, targetVertSpeed, Math.min(1, dt * 4.5));

      pos.y += this.vertSpeed * dt;
      if (pos.y > SERVICE_CEILING) {
        pos.y = SERVICE_CEILING;
        if (this.vertSpeed > 0) this.vertSpeed = 0;
      }

      // Touchdown / Landing or Crash check
      if (pos.y <= this.groundY + 0.05) {
        pos.y = this.groundY;
        const hardSink = this.vertSpeed < -18.5;
        const steepNoseDown = this.pitch < -0.28 && this.speed > 75;
        if (hardSink || steepNoseDown) {
          this.applyDamage(MAX_HP + 50, pos);
          return;
        }
        // Smooth touchdown on runway / terrain!
        this.grounded = true;
        this.gearDown = true;
        this.gearAnim = 1.0;
        this.vertSpeed = 0;
        this.pitch = Math.max(0, this.pitch * 0.4);
        this.roll = 0;
      }
    }

    // 5. Advance horizontal position along aircraft heading
    const horizSpeed = this.grounded ? this.speed : (this.speed * Math.cos(this.pitch));
    pos.x += Math.sin(this.app.yaw) * horizSpeed * dt;
    pos.z += Math.cos(this.app.yaw) * horizSpeed * dt;
    this.app.pos.copy(pos);
    this.app.speed = this.speed;
    const mouseIdleSec = (performance.now() - (this.app.lastMouseOrbitTime || 0)) * 0.001;
    if (mouseIdleSec > 1.8) {
      const diff = Math.atan2(Math.sin(this.app.yaw - this.app.camYaw), Math.cos(this.app.yaw - this.app.camYaw));
      this.app.camYaw += diff * Math.min(1, dt * 3.5);
    }

    this._syncOrientation();
  }

  /**
   * Ambient per-frame update (runs in ALL modes so clouds, contrails, damaged parked planes,
   * boarding prompt, and active airliner animations stay alive).
   */
  updateAmbient(dt, focusPos) {
    const now = performance.now() * 0.001;

    // 1. Update 3D Cloud Deck around camera / focus position
    if (this.cloudSheet && focusPos) {
      this.cloudSheet.position.x = focusPos.x;
      this.cloudSheet.position.z = focusPos.z;
      this.cloudSheet.material.uniforms.uTime.value = now;
      this.cloudSheet.material.uniforms.uCenter.value.set(focusPos.x, focusPos.z);
      const sunElev = this.app.sky?.lastState?.sunElevation ?? 0.65;
      this.cloudSheet.material.uniforms.uSunElev.value = sunElev;

      // Wrap 3D volumetric cloud puffs in a 14 km torus around the player
      if (this.cloudPuffs && this.app.mode === "airliner") {
        const dummy = new THREE.Object3D();
        const span = 14000;
        const half = span * 0.5;
        for (let i = 0; i < this.cloudPuffData.length; i++) {
          const d = this.cloudPuffData[i];
          const wx = focusPos.x + ((((d.ox + now * 12 - focusPos.x) % span) + span) % span) - half;
          const wz = focusPos.z + ((((d.oz + now * 5 - focusPos.z) % span) + span) % span) - half;
          dummy.position.set(wx, d.oy, wz);
          dummy.rotation.set(0, d.rotY, 0);
          dummy.scale.set(d.sx, d.sy, d.sz);
          dummy.updateMatrix();
          this.cloudPuffs.setMatrixAt(i, dummy.matrix);
        }
        this.cloudPuffs.instanceMatrix.needsUpdate = true;
      }
    }

    // 2. Cloud mist screen veil when camera passes through y = 1,400 .. 2,300 m
    if (this.mistEl && this.app.camera) {
      const camY = this.app.camera.position.y;
      let mistAlpha = 0;
      if (camY > CLOUD_BASE_Y - 120 && camY < CLOUD_TOP_Y + 120) {
        const mid = (CLOUD_BASE_Y + CLOUD_TOP_Y) * 0.5;
        const halfThick = (CLOUD_TOP_Y - CLOUD_BASE_Y) * 0.5 + 120;
        const t = 1.0 - Math.abs(camY - mid) / halfThick;
        mistAlpha = THREE.MathUtils.clamp(t * 0.58, 0, 0.52);
      }
      this.mistEl.style.opacity = mistAlpha.toFixed(3);
    }

    // 3. Animate Hero Airliner (turbofan blades, jet plumes, gear retraction, strobes, damage smoke, contrails)
    if (this.mesh.visible) {
      const ud = this.mesh.userData;
      // Landing gear retraction / extension
      const targetGear = (this.grounded || this.gearDown) ? 1.0 : 0.0;
      this.gearAnim = THREE.MathUtils.lerp(this.gearAnim, targetGear, Math.min(1, dt * 3.0));
      if (ud.gearGroup) {
        ud.gearGroup.visible = this.gearAnim > 0.03;
        ud.gearGroup.scale.y = Math.max(0.01, this.gearAnim);
      }

      // Spin turbofan blades
      const spinRate = this.app.mode === "airliner"
        ? (6.0 + Math.abs(this.throttle) * 38.0)
        : 2.5;
      if (ud.fans) {
        for (const fan of ud.fans) fan.rotation.z += spinRate * dt;
      }

      // Jet exhaust plumes
      if (ud.plumes) {
        const showPlume = this.app.mode === "airliner" && this.throttle > 0.22 && !this.dead;
        for (let i = 0; i < ud.plumes.length; i++) {
          const pl = ud.plumes[i];
          const engineDead = (i === 1 && this.hp < this.maxHp * 0.70) || (this.hp < this.maxHp * 0.35);
          pl.visible = showPlume && !engineDead;
          if (pl.visible) {
            const s = 0.65 + this.throttle * 0.75 + Math.sin(now * 28 + i) * 0.12;
            pl.scale.set(1, s, 1);
          }
        }
      }

      // Wingtip strobe & fuselage anti-collision beacon pulse
      const strobeOn = (now % 1.2) < 0.09 || ((now - 0.14) % 1.2) < 0.07;
      if (ud.strobes) {
        for (const st of ud.strobes) st.visible = strobeOn && !this.dead;
      }
      const beaconOn = (now % 1.05) < 0.16;
      if (ud.beacons) {
        for (const bc of ud.beacons) bc.material.opacity = (beaconOn && !this.dead) ? 1.0 : 0.22;
      }

      // Wingtip + engine condensation contrails at high speed / altitude
      if (this.app.mode === "airliner" && !this.dead && this.speed > 75 && this.mesh.position.y > 450) {
        this.contrailClock += dt;
        if (this.contrailClock >= 0.045) {
          this.contrailClock = 0;
          const altBoost = THREE.MathUtils.clamp((this.mesh.position.y - 450) / 1800, 0.25, 1.0);
          for (const side of [-1, 1]) {
            const p = new THREE.Vector3(side * 6.8, 1.35, 2.5).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
            this._spawnParticle({
              pos: p,
              vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.5),
              radius: 1.4,
              growth: 5.5,
              life: 1.4 + altBoost * 1.6,
              color: 0xf1f5f9,
              opacity: 0.28 * altBoost
            });
          }
        }
      }

      // Engine fire flicker & trailing black smoke when damaged (< 70% HP)
      this._animateDamageFiresAndSmoke(this.mesh, this.hp, this.maxHp, dt, now);
    }

    // 4. Animate damaged parked airliners on tarmac
    for (const dp of this.damagedParked.values()) {
      if (dp.mesh) {
        this._animateDamageFiresAndSmoke(dp.mesh, dp.hp, dp.maxHp, dt, now);
      }
    }

    // 5. Update explosion / smoke / contrail particles
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.fxGroup.remove(p.mesh);
        p.mesh.material.dispose();
        this.fxParticles.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.age / p.life;
      p.mesh.scale.setScalar(p.radius + p.growth * p.age);
      p.mesh.material.opacity = p.startOpacity * (1.0 - t);
    }

    // 6. Update interactive boarding prompt when walking or driving near an airport airliner
    this._updateBoardingPrompt();
  }

  _updateBoardingPrompt() {
    if (!this.promptEl) return;
    if (this.app.mode !== "walk" && this.app.mode !== "drive") {
      this.promptEl.style.display = "none";
      return;
    }
    const px = this.app.mode === "drive" ? this.app.vehicleMesh.position.x : this.app.pos.x;
    const py = this.app.mode === "drive" ? this.app.vehicleMesh.position.y : this.app.pos.y;
    const pz = this.app.mode === "drive" ? this.app.vehicleMesh.position.z : this.app.pos.z;

    const cand = this.findNearestBoardable(px, py, pz, 45);
    if (!cand) {
      this.promptEl.style.display = "none";
      return;
    }
    const livery = AIRLINER_LIVERIES[cand.liveryIdx] || AIRLINER_LIVERIES[0];
    this.promptEl.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:6px;background:#38bdf8;color:#020617;font-weight:800">F / E</span><span>Board ${livery.name} (${Math.round(cand.dist)} m)</span>`;
    this.promptEl.style.display = "inline-flex";
  }

  _updateDamageVisuals(mesh, hp) {
    if (!mesh || !mesh.userData.engineFires) return;
    const ratio = hp / MAX_HP;
    const fires = mesh.userData.engineFires;
    // Right engine (#2) catches fire below 70% HP; both engines catch fire below 35% HP
    if (fires[1]) fires[1].visible = ratio < 0.70;
    if (fires[0]) fires[0].visible = ratio < 0.35;
  }

  _animateDamageFiresAndSmoke(mesh, hp, maxHp, dt, now) {
    const ratio = hp / maxHp;
    if (ratio >= 0.70) return;
    const fires = mesh.userData.engineFires || [];
    for (let i = 0; i < fires.length; i++) {
      const fg = fires[i];
      if (!fg || !fg.visible) continue;
      const flicker = 0.82 + Math.sin(now * 34 + i * 3.1) * 0.24;
      fg.scale.set(flicker, 0.85 + Math.cos(now * 27 + i) * 0.25, flicker);
    }

    mesh.userData._smokeAcc = (mesh.userData._smokeAcc || 0) + dt;
    const interval = ratio < 0.35 ? 0.055 : 0.09;
    if (mesh.userData._smokeAcc >= interval) {
      mesh.userData._smokeAcc = 0;
      const fireEngines = ratio < 0.35 ? [-1, 1] : [1];
      for (const side of fireEngines) {
        const wp = new THREE.Vector3(side * 6.8, 1.6, 2.2).applyQuaternion(mesh.quaternion).add(mesh.position);
        this._spawnParticle({
          pos: wp,
          vel: new THREE.Vector3((Math.random() - 0.5) * 3.5, 4.5 + Math.random() * 3.5, (Math.random() - 0.5) * 3.5),
          radius: 1.6,
          growth: 6.5,
          life: 1.8,
          color: ratio <= 0 ? 0x111114 : 0x26262b,
          opacity: 0.65
        });
      }
    }
  }

  /**
   * Raycast helper so firearms (Pistol, Rifle, RPG, Railgun) aim directly at parked or active airliners.
   */
  raycast(origin, dir, maxDist = 260) {
    let bestDist = maxDist;
    let bestHit = null;

    const testSphere = (cx, cy, cz, r, targetRef) => {
      const ocx = cx - origin.x;
      const ocy = cy - origin.y;
      const ocz = cz - origin.z;
      const proj = ocx * dir.x + ocy * dir.y + ocz * dir.z;
      if (proj < 0 || proj > bestDist + r) return;
      const d2 = (ocx * ocx + ocy * ocy + ocz * ocz) - proj * proj;
      if (d2 > r * r) return;
      const thc = Math.sqrt(r * r - d2);
      const t = Math.max(0, proj - thc);
      if (t < bestDist) {
        bestDist = t;
        bestHit = {
          dist: t,
          point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
          targetRef
        };
      }
    };

    // 1. Active / hero airliner
    if (this.mesh.visible && this.app.mode !== "airliner") {
      testSphere(this.mesh.position.x, this.mesh.position.y + 3.2, this.mesh.position.z, 15.0, { type: "hero" });
    }

    // 2. Damaged parked airliners
    for (const [key, dp] of this.damagedParked.entries()) {
      testSphere(dp.x, dp.y + 3.2, dp.z, 15.0, { type: "damagedParked", key });
    }

    // 3. Instanced airport parked planes
    const planes = this.app.places?._planes;
    if (Array.isArray(planes)) {
      for (let i = 0; i < planes.length; i++) {
        const pl = planes[i];
        if (!pl) continue;
        const key = `${Math.round(pl.x)}_${Math.round(pl.z)}`;
        if (this.app.places.hiddenPlanes?.has(key)) continue;
        const py = this.app.world.getHeightAt(pl.x, pl.z);
        testSphere(pl.x, py + 3.2, pl.z, 15.0, { type: "instanced", pl, key });
      }
    }

    return bestHit;
  }

  /**
   * Apply weapon or explosion damage to any airliner (player's airliner or parked airport airliners)
   * within `radius` of `hitPos`.
   */
  applyWeaponImpact(hitPos, radius = 6, dmg = 45) {
    if (!hitPos || dmg <= 0) return false;
    let hitAny = false;
    const hitRadius = Math.max(15.5, radius + 12.0);
    const r2 = hitRadius * hitRadius;

    // 1. Check active / hero airliner
    if (this.mesh.visible) {
      const dx = this.mesh.position.x - hitPos.x;
      const dy = (this.mesh.position.y + 3.0) - hitPos.y;
      const dz = this.mesh.position.z - hitPos.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        this.applyDamage(dmg, hitPos);
        hitAny = true;
      }
    }

    // 2. Check already-damaged parked airliners
    for (const [key, dp] of this.damagedParked.entries()) {
      const dx = dp.x - hitPos.x;
      const dy = (dp.y + 3.0) - hitPos.y;
      const dz = dp.z - hitPos.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        this._damageParkedEntry(dp, dmg);
        hitAny = true;
      }
    }

    // 3. Check instanced airport parked planes -> promote to interactive damaged airliner mesh on first hit!
    const planes = this.app.places?._planes;
    if (Array.isArray(planes)) {
      for (let i = 0; i < planes.length; i++) {
        const pl = planes[i];
        if (!pl) continue;
        const key = `${Math.round(pl.x)}_${Math.round(pl.z)}`;
        if (this.app.places.hiddenPlanes?.has(key) || this.damagedParked.has(key)) continue;
        const py = this.app.world.getHeightAt(pl.x, pl.z);
        const dx = pl.x - hitPos.x;
        const dy = (py + 3.0) - hitPos.y;
        const dz = pl.z - hitPos.z;
        if (dx * dx + dy * dy + dz * dz <= r2) {
          this.app.places?.hidePlaneAt?.(pl.x, pl.z);
          const liveryIdx = Math.abs(Math.round(pl.x * 0.13 + pl.z * 0.07)) % AIRLINER_LIVERIES.length;
          const mesh = createHeroAirlinerModel(liveryIdx);
          mesh.position.set(pl.x, py, pl.z);
          mesh.rotation.y = (pl.yaw || 0);
          this.scene.add(mesh);
          const entry = {
            key,
            x: pl.x,
            y: py,
            z: pl.z,
            yaw: pl.yaw || 0,
            liveryIdx,
            hp: MAX_HP,
            maxHp: MAX_HP,
            dead: false,
            mesh
          };
          this.damagedParked.set(key, entry);
          this._damageParkedEntry(entry, dmg);
          hitAny = true;
        }
      }
    }

    return hitAny;
  }

  _damageParkedEntry(entry, dmg) {
    if (!entry || entry.dead) return;
    entry.hp = Math.max(0, entry.hp - dmg);
    this._updateDamageVisuals(entry.mesh, entry.hp);
    if (entry.hp <= 0) {
      entry.dead = true;
      charAirlinerModel(entry.mesh);
      entry.mesh.rotation.z = 0.14;
      entry.mesh.position.y -= 0.85;
      this._triggerAirlinerExplosion(entry.mesh.position);
    }
  }

  applyDamage(dmg, hitPos) {
    if (this.dead || dmg <= 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this._updateDamageVisuals(this.mesh, this.hp);
    if (this.hp <= 0) {
      this.dead = true;
      this.deadTimer = 0;
      this.throttle = 0;
      charAirlinerModel(this.mesh);
      this._triggerAirlinerExplosion(this.mesh.position);
      if (this.app.mode === "airliner" && this.grounded) {
        setTimeout(() => {
          if (this.app.mode === "airliner" && this.dead) this.exitToWalk();
        }, 1200);
      }
    }
  }

  _triggerAirlinerExplosion(centerPos) {
    // 1. Multi-fireball aviation fuel explosion
    const colors = [0xffef99, 0xff922b, 0xff4500, 0xd9480f, 0x2b2b30];
    for (let i = 0; i < 18; i++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 22,
        1.5 + Math.random() * 8,
        (Math.random() - 0.5) * 26
      );
      this._spawnParticle({
        pos: centerPos.clone().add(offset),
        vel: new THREE.Vector3((Math.random() - 0.5) * 14, 8 + Math.random() * 18, (Math.random() - 0.5) * 14),
        radius: 3.5 + Math.random() * 4.5,
        growth: 14 + Math.random() * 10,
        life: 1.4 + Math.random() * 1.2,
        emissive: colors[i % colors.length],
        opacity: 0.92
      });
    }
    // 2. Ground shockwave ring
    this._spawnParticle({
      pos: centerPos.clone().add(new THREE.Vector3(0, 1.2, 0)),
      vel: new THREE.Vector3(0, 0, 0),
      radius: 4.0,
      growth: 58.0,
      life: 0.95,
      emissive: 0xffb703,
      opacity: 0.85,
      isRing: true
    });
    // 3. Audio boom + camera shake + blast radius on nearby traffic
    try {
      this.app.audio?.playExplosion?.(1.35);
      this.app.traffic?.triggerImpactSphere?.(centerPos, 32, { damage: 240, shoveCars: true });
    } catch (_) {}
  }
}
