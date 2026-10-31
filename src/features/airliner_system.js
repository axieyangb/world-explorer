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
    this.maritime = app.maritime || null;

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
    this.heroYaw = 0;
    this._collisionCooldown = 0;

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
    // Multi-layered procedural GLSL volumetric Perlin-Worley FBM cloud planes (y = 1,560m, 1,820m, 2,080m)
    // Replaces any geometric oval/icosahedron puffs with continuous organic domain-warped cumulus & stratocumulus decks
    const sheetGeo = new THREE.PlaneGeometry(32000, 32000, 1, 1);
    sheetGeo.rotateX(-Math.PI / 2);

    const makeLayerMat = (layerNormY, layerSeed) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector2(0, 0) },
        uSunElev: { value: 0.65 },
        uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
        uCloudCover: { value: 0.28 },
        uLayerY: { value: layerNormY },
        uLayerSeed: { value: layerSeed },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform vec2 uCenter;
        uniform float uSunElev;
        uniform vec3 uSunDir;
        uniform float uCloudCover;
        uniform float uLayerY;
        uniform float uLayerSeed;

        float hash2(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        vec2 hash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.xx + p3.yz) * p3.zy);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash2(i + vec2(0.0, 0.0)), hash2(i + vec2(1.0, 0.0)), u.x),
            mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          for (int i = 0; i < 5; i++) {
            v += a * vnoise(p);
            p = rot * p * 2.04 + vec2(13.7, 29.3);
            a *= 0.5;
          }
          return v;
        }
        float worleyBillow(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float minDist = 1.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 neighbor = vec2(float(x), float(y));
              vec2 pt = hash22(i + neighbor);
              vec2 diff = neighbor + pt - f;
              minDist = min(minDist, dot(diff, diff));
            }
          }
          return 1.0 - sqrt(clamp(minDist, 0.0, 1.0));
        }
        float sampleVolCloud(vec2 p, float cover) {
          vec2 q = p + 0.55 * vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
          vec2 r = p + 0.85 * vec2(fbm(q * 1.9 + vec2(1.7, 9.2)), fbm(q * 1.9 + vec2(2.8, 8.3)));
          float baseFbm = fbm(r);
          float billow = worleyBillow(r * 1.7) * 0.65 + worleyBillow(r * 3.6 + 7.1) * 0.35;
          float pw = mix(baseFbm, billow, 0.38);
          float erode = (1.0 - billow) * 0.22 + (1.0 - abs(vnoise(r * 4.6) * 2.0 - 1.0)) * 0.10;
          float raw = pw - erode * (1.0 - 0.5 * cover);
          // Outer layers (base & anvil top) require higher core density so clouds taper organically in 3D height
          float profileBias = abs(uLayerY - 0.5) * 0.22;
          float thresh = 0.74 - cover * 0.54 + profileBias;
          return smoothstep(thresh, thresh + 0.30, raw);
        }

        void main() {
          vec2 wind = vec2(uTime * 12.0, uTime * 4.5);
          vec2 p = (vWorldPos.xz + wind) * 0.00032 + vec2(uLayerSeed * 3.7, uLayerSeed * 6.1);
          float cov = sampleVolCloud(p, uCloudCover);
          float distFade = 1.0 - smoothstep(8500.0, 15500.0, length(vWorldPos.xz - uCenter));
          // Smooth vertical fade when camera flies right through the plane so there is zero hard plane clipping
          float camVertDist = abs(cameraPosition.y - vWorldPos.y);
          float camFade = smoothstep(18.0, 135.0, camVertDist);
          float alpha = cov * distFade * camFade * (0.34 + 0.22 * uCloudCover);
          if (alpha < 0.012) discard;

          // 2-step Beer-Lambert self-shadowing along the sun direction
          vec2 sunStep = normalize(uSunDir.xz + vec2(1e-4)) * 0.12;
          float sunD1 = sampleVolCloud(p + sunStep * 0.7, uCloudCover);
          float sunD2 = sampleVolCloud(p + sunStep * 1.8, uCloudCover);
          float opticalDepth = (sunD1 * 0.6 + sunD2 * 0.4) * (1.1 + 0.7 * uCloudCover) + (1.0 - uLayerY) * 0.45;
          float beer = exp(-opticalDepth * 1.85);
          float powder = 1.0 - exp(-cov * 3.6);

          vec3 dayTop = vec3(0.98, 0.99, 1.0);
          vec3 dayBase = mix(vec3(0.70, 0.77, 0.86), vec3(0.48, 0.54, 0.63), smoothstep(0.45, 0.88, uCloudCover));
          vec3 duskTop = vec3(0.98, 0.74, 0.58);
          vec3 nightTop = vec3(0.13, 0.17, 0.25);
          float dayFactor = clamp(uSunElev * 1.8, 0.0, 1.0);
          float litMix = clamp(beer * (0.65 + 0.45 * powder) + uLayerY * 0.22, 0.0, 1.0);
          vec3 dayCol = mix(dayBase, dayTop, litMix);
          vec3 col = mix(nightTop, mix(duskTop, dayCol, dayFactor), clamp(uSunElev + 0.35, 0.15, 1.0));

          // Forward-scattered silver-lining glow
          vec3 viewDir = normalize(vWorldPos - cameraPosition);
          float sunDot = max(0.0, dot(viewDir, normalize(uSunDir)));
          float silver = pow(sunDot, 5.0) * beer * (1.0 - cov * 0.55) * clamp(uSunElev + 0.2, 0.0, 1.0);
          col += vec3(1.0, 0.95, 0.84) * silver * 0.45;

          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    this.cloudSheets = [];
    const layerSpec = [
      { y: 1580, normY: 0.2, seed: 1.1 },
      { y: 1820, normY: 0.5, seed: 2.7 },
      { y: 2060, normY: 0.85, seed: 4.3 },
    ];
    for (const spec of layerSpec) {
      const m = new THREE.Mesh(sheetGeo, makeLayerMat(spec.normY, spec.seed));
      m.position.y = spec.y;
      m.frustumCulled = false;
      this.cloudGroup.add(m);
      this.cloudSheets.push(m);
    }
    this.cloudSheet = this.cloudSheets[1];
    this.cloudPuffs = null;
    this.cloudPuffData = [];
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
      if (this.hasSpawnedHero && this.mesh.visible && Math.hypot(this.mesh.position.x - cand.x, this.mesh.position.z - cand.z) > 18) {
        this._saveCurrentHeroAsParked();
      }
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

  _saveCurrentHeroAsParked() {
    if (!this.hasSpawnedHero || !this.mesh.visible) return;
    const hx = this.mesh.position.x;
    const hy = this.mesh.position.y;
    const hz = this.mesh.position.z;
    const key = `hero_${Math.round(hx)}_${Math.round(hz)}`;
    if (this.damagedParked.has(key)) return;
    const parkedMesh = createHeroAirlinerModel(this.liveryIdx);
    parkedMesh.position.set(hx, hy, hz);
    parkedMesh.rotation.y = this.heroYaw || 0;
    if (this.dead) charAirlinerModel(parkedMesh);
    this._updateDamageVisuals(parkedMesh, this.hp);
    this.scene.add(parkedMesh);
    this.damagedParked.set(key, {
      key,
      x: hx,
      y: hy,
      z: hz,
      yaw: this.heroYaw || 0,
      liveryIdx: this.liveryIdx,
      hp: this.hp,
      maxHp: this.maxHp,
      dead: this.dead,
      mesh: parkedMesh,
    });
  }

  _syncOrientation() {
    if (this.app.mode === "airliner") {
      this.heroYaw = this.app.yaw;
    }
    const yaw = this.app.mode === "airliner" ? this.app.yaw : (this.heroYaw ?? this.app.yaw);
    const euler = new THREE.Euler(-this.pitch, yaw, -this.roll, "YXZ");
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

      // Touchdown / Landing or Crash check (including ship decks if over a large vessel)
      const shipDeck = (this.maritime || this.app.maritime)?.getDeckHeightAt?.(pos.x, pos.z, pos.y + 2.5);
      if (shipDeck && shipDeck.y > this.groundY) {
        this.groundY = shipDeck.y;
      }
      if (pos.y <= this.groundY + 0.05) {
        pos.y = this.groundY;
        const hardSink = this.vertSpeed < -18.5;
        const steepNoseDown = this.pitch < -0.28 && this.speed > 75;
        if (hardSink || steepNoseDown) {
          this.applyDamage(MAX_HP + 50, pos);
          return;
        }
        // Smooth touchdown on runway / terrain / deck!
        this.grounded = true;
        this.gearDown = true;
        this.gearAnim = 1.0;
        this.vertSpeed = 0;
        this.pitch = Math.max(0, this.pitch * 0.4);
        this.roll = 0;
      }
    }

    if (this._collisionCooldown > 0) {
      this._collisionCooldown = Math.max(0, this._collisionCooldown - dt);
    }

    // 5. Advance horizontal position along aircraft heading with swept 3D collision sub-steps
    const horizSpeed = this.grounded ? this.speed : (this.speed * Math.cos(this.pitch));
    const totalStepDist = Math.abs(horizSpeed * dt);
    const subSteps = Math.max(1, Math.min(8, Math.ceil(totalStepDist / 3.0)));
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      const curHoriz = this.grounded ? this.speed : (this.speed * Math.cos(this.pitch));
      pos.x += Math.sin(this.app.yaw) * curHoriz * subDt;
      pos.z += Math.cos(this.app.yaw) * curHoriz * subDt;
      this.heroYaw = this.app.yaw;

      // Resolve 3D collisions against all other airliners and all maritime ships/boats
      this._resolveActiveAirlinerCollisions(subDt);
      if (this.dead) break;
    }

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
    if (!focusPos) focusPos = this.app.pos || this.app.camera?.position;

    // 1. Update Multi-Layer 3D Volumetric Cloud Deck around camera / focus position
    if (this.cloudSheets && focusPos) {
      const sunDir = this.app.atmosphere?.sunDir || this.app.sunDir;
      const sunElev = sunDir ? sunDir.y : (this.app.sky?.lastState?.sunElevation ?? 0.65);
      const cloudCover = this.app.atmosphere?.cloud ?? 0.28;
      for (let i = 0; i < this.cloudSheets.length; i++) {
        const sheet = this.cloudSheets[i];
        sheet.position.x = focusPos.x;
        sheet.position.z = focusPos.z;
        const u = sheet.material.uniforms;
        u.uTime.value = now;
        u.uCenter.value.set(focusPos.x, focusPos.z);
        u.uSunElev.value = sunElev;
        u.uCloudCover.value = cloudCover;
        if (sunDir && u.uSunDir) u.uSunDir.value.copy(sunDir);
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

      // Wingtip vortex condensation trails at high altitude (> 2,200m) only when actively moving through space
      if (this.app.mode === "airliner" && !this.dead && this.speed > 95 && this.mesh.position.y > 2200) {
        if (!this._lastContrailPos) this._lastContrailPos = this.mesh.position.clone();
        const movedDist = this.mesh.position.distanceTo(this._lastContrailPos);
        if (movedDist >= 6.0) {
          this._lastContrailPos.copy(this.mesh.position);
          const altBoost = THREE.MathUtils.clamp((this.mesh.position.y - 2200) / 1800, 0.15, 0.65);
          for (const side of [-1, 1]) {
            const p = new THREE.Vector3(side * 22.8, 4.85, -10.8).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
            this._spawnParticle({
              pos: p,
              vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6),
              radius: 0.45,
              growth: 1.2,
              life: 0.9 + altBoost * 0.8,
              color: 0xf8fafc,
              opacity: 0.16 * altBoost
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

    // 6. Keep AI traffic cars from driving through parked or active airliners
    this._resolveTrafficVsAirliners();

    // 7. Update interactive boarding prompt when walking or driving near an airport airliner
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

  /** Active airliner descriptor when spawned. */
  get activeAirliner() {
    if (!this.hasSpawnedHero || !this.mesh.visible) return null;
    const yaw = this.app.mode === "airliner" ? this.app.yaw : (this.heroYaw ?? this.app.yaw);
    return {
      key: "hero",
      type: "hero",
      x: this.mesh.position.x,
      y: this.mesh.position.y,
      z: this.mesh.position.z,
      yaw,
      pitch: this.pitch,
      roll: this.roll,
      speed: this.app.mode === "airliner" ? this.speed : 0,
      scale: 1.35,
      hp: this.hp,
      maxHp: this.maxHp,
      dead: this.dead,
      mesh: this.mesh,
    };
  }

  /** All airliners currently in the world (active/hero, damagedParked, instanced tarmac, runway, sky, liveSky). */
  get airliners() {
    return this.getAllAirlinerColliders(false);
  }

  /**
   * Collects all 3D airliner colliders in the world.
   * If `excludeHero` is true, omits `this.mesh` (used when `this.mesh` is checking against all other planes).
   */
  getAllAirlinerColliders(excludeHero = false, refX = undefined, refZ = undefined, maxRange = 650) {
    const out = [];
    const checkRange = Number.isFinite(refX) && Number.isFinite(refZ);
    const maxR2 = maxRange * maxRange;

    // 1. Hero / player airliner
    if (!excludeHero && this.hasSpawnedHero && this.mesh.visible) {
      const hx = this.mesh.position.x;
      const hz = this.mesh.position.z;
      if (!checkRange || (hx - refX) ** 2 + (hz - refZ) ** 2 <= maxR2) {
        const yaw = this.app.mode === "airliner" ? this.app.yaw : (this.heroYaw ?? this.app.yaw);
        const spd = this.app.mode === "airliner" ? this.speed : 0;
        out.push({
          key: "hero",
          type: "hero",
          x: hx,
          y: this.mesh.position.y,
          z: hz,
          yaw,
          pitch: this.pitch || 0,
          roll: this.roll || 0,
          vx: Math.sin(yaw) * spd,
          vy: this.app.mode === "airliner" ? (this.vertSpeed || 0) : 0,
          vz: Math.cos(yaw) * spd,
          scale: 1.35,
          hp: this.hp,
          dead: this.dead,
          mesh: this.mesh,
        });
      }
    }

    // 2. Promoted / damaged parked airliners
    for (const [key, dp] of this.damagedParked.entries()) {
      if (!dp || !dp.mesh || !dp.mesh.visible) continue;
      if (checkRange && (dp.x - refX) ** 2 + (dp.z - refZ) ** 2 > maxR2) continue;
      out.push({
        key,
        type: "damagedParked",
        x: dp.mesh.position.x,
        y: dp.mesh.position.y,
        z: dp.mesh.position.z,
        yaw: dp.yaw || 0,
        pitch: 0,
        roll: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 1.35,
        hp: dp.hp,
        dead: dp.dead,
        entry: dp,
        mesh: dp.mesh,
      });
    }

    // 3. Instanced airport tarmac airliners (app.places._planes)
    const places = this.app.places;
    if (places && Array.isArray(places._planes)) {
      for (let i = 0; i < places._planes.length; i++) {
        const pl = places._planes[i];
        if (!pl) continue;
        if (checkRange && (pl.x - refX) ** 2 + (pl.z - refZ) ** 2 > maxR2) continue;
        const key = `${Math.round(pl.x)}_${Math.round(pl.z)}`;
        if (places.hiddenPlanes?.has(key) || this.damagedParked.has(key)) continue;
        if (
          this.hasSpawnedHero &&
          this.mesh.visible &&
          Math.hypot(pl.x - this.mesh.position.x, pl.z - this.mesh.position.z) < 12
        ) {
          continue;
        }
        const py = Number.isFinite(pl.y) ? pl.y : this.app.world.getHeightAt(pl.x, pl.z);
        out.push({
          key,
          type: "instanced",
          x: pl.x,
          y: py,
          z: pl.z,
          yaw: pl.yaw || 0,
          pitch: 0,
          roll: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          scale: pl.scale || 1.25,
          pl,
        });
      }
    }

    // 4. Animated runway takeoff/landing airliners (app.places._runwayPlanes)
    if (places && Array.isArray(places._runwayPlanes)) {
      for (let i = 0; i < places._runwayPlanes.length; i++) {
        const rp = places._runwayPlanes[i];
        if (!rp || !rp.mesh || !rp.mesh.visible) continue;
        const rx = rp.mesh.position.x;
        const rz = rp.mesh.position.z;
        if (checkRange && (rx - refX) ** 2 + (rz - refZ) ** 2 > maxR2) continue;
        const yaw = rp.mesh.rotation.y || 0;
        const spd = rp.speed || 0;
        out.push({
          key: `runway_${rp.id || i}`,
          type: "runway",
          x: rx,
          y: rp.mesh.position.y,
          z: rz,
          yaw,
          pitch: rp.pitch || 0,
          roll: rp.roll || 0,
          vx: Math.sin(yaw) * spd,
          vy: 0,
          vz: Math.cos(yaw) * spd,
          scale: 1.15,
          rp,
          mesh: rp.mesh,
        });
      }
    }

    // 5. Ambient sky airliners (app.places._skyPlanes)
    if (places && Array.isArray(places._skyPlanes)) {
      for (let i = 0; i < places._skyPlanes.length; i++) {
        const sp = places._skyPlanes[i];
        if (!sp || !sp.mesh || !sp.mesh.visible) continue;
        const sx = sp.mesh.position.x;
        const sz = sp.mesh.position.z;
        if (checkRange && (sx - refX) ** 2 + (sz - refZ) ** 2 > maxR2) continue;
        const yaw = sp.yaw || sp.mesh.rotation.y || 0;
        const spd = sp.speed || 75;
        out.push({
          key: `sky_${i}`,
          type: "sky",
          x: sx,
          y: sp.mesh.position.y,
          z: sz,
          yaw,
          pitch: sp.pitch || 0,
          roll: sp.roll || 0,
          vx: Math.sin(yaw) * spd,
          vy: 0,
          vz: Math.cos(yaw) * spd,
          scale: sp.mesh.scale?.x || 1.2,
          sp,
          mesh: sp.mesh,
        });
      }
    }

    // 6. LiveSky ADS-B aircraft (app.liveSky.aircraft)
    const liveAc = this.app.liveSky?.aircraft;
    if (liveAc && typeof liveAc.values === "function") {
      for (const ac of liveAc.values()) {
        if (!ac || !Number.isFinite(ac.rx) || !Number.isFinite(ac.rz)) continue;
        if (checkRange && (ac.rx - refX) ** 2 + (ac.rz - refZ) ** 2 > maxR2) continue;
        out.push({
          key: `live_${ac.id}`,
          type: "live",
          x: ac.rx,
          y: ac.ry || 0,
          z: ac.rz,
          yaw: ac.yaw || 0,
          pitch: ac.pitch || 0,
          roll: ac.roll || 0,
          vx: ac.vx || 0,
          vy: ac.vy || 0,
          vz: ac.vz || 0,
          scale: ac.scale || 1.15,
          ac,
        });
      }
    }

    return out;
  }

  /**
   * Promote an instanced airport airliner into an interactive `damagedParked` 3D rig so it can show fire/char/explosion.
   */
  _promoteInstancedAirliner(planeObj) {
    if (!planeObj || planeObj.type !== "instanced") return planeObj?.entry || null;
    const key = planeObj.key || `${Math.round(planeObj.x)}_${Math.round(planeObj.z)}`;
    if (this.damagedParked.has(key)) return this.damagedParked.get(key);
    this.app.places?.hidePlaneAt?.(planeObj.x, planeObj.z);
    const liveryIdx = Math.abs(Math.round(planeObj.x * 0.13 + planeObj.z * 0.07)) % AIRLINER_LIVERIES.length;
    const py = Number.isFinite(planeObj.y) ? planeObj.y : this.app.world.getHeightAt(planeObj.x, planeObj.z);
    const mesh = createHeroAirlinerModel(liveryIdx);
    mesh.position.set(planeObj.x, py, planeObj.z);
    mesh.rotation.y = planeObj.yaw || 0;
    this.scene.add(mesh);
    const entry = {
      key,
      x: planeObj.x,
      y: py,
      z: planeObj.z,
      yaw: planeObj.yaw || 0,
      liveryIdx,
      hp: MAX_HP,
      maxHp: MAX_HP,
      dead: false,
      mesh,
    };
    this.damagedParked.set(key, entry);
    return entry;
  }

  /**
   * 3D sphere vs local box helper: returns { pen, lnx, lny, lnz, topY } in plane-local space or null.
   */
  _sphereVsLocalBox(lx, ly, lz, r, xMin, xMax, yMin, yMax, zMin, zMax) {
    const cx = THREE.MathUtils.clamp(lx, xMin, xMax);
    const cy = THREE.MathUtils.clamp(ly, yMin, yMax);
    const cz = THREE.MathUtils.clamp(lz, zMin, zMax);
    const dx = lx - cx;
    const dy = ly - cy;
    const dz = lz - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) return null;

    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      return {
        pen: r - d,
        lnx: dx / d,
        lny: dy / d,
        lnz: dz / d,
        topY: yMax,
      };
    }

    // Center inside box: push out horizontally unless near the top surface
    const pRight = xMax - lx;
    const pLeft = lx - xMin;
    const pTop = yMax - ly;
    const pFront = zMax - lz;
    const pBack = lz - zMin;

    let minP = pRight, lnx = 1, lny = 0, lnz = 0;
    if (pLeft < minP) { minP = pLeft; lnx = -1; lny = 0; lnz = 0; }
    if (pFront < minP) { minP = pFront; lnx = 0; lny = 0; lnz = 1; }
    if (pBack < minP) { minP = pBack; lnx = 0; lny = 0; lnz = -1; }
    if (pTop <= Math.max(1.8, r * 0.95) && pTop < minP) { minP = pTop; lnx = 0; lny = 1; lnz = 0; }

    return {
      pen: r + minP,
      lnx,
      lny,
      lnz,
      topY: yMax,
    };
  }

  /**
   * Tests a 3D world sphere `(px, py, pz, r)` against a single airliner `plane`'s
   * 3D oriented Fuselage + Swept Wings/Engines + Vertical Tail Fin + Horizontal Tailplane.
   */
  _testSphereVsAirliner3D(px, py, pz, r, plane) {
    const S = plane.scale || 1.25;
    const dx = px - plane.x;
    const dz = pz - plane.z;
    const maxReach = 25.5 * S + r + 2.0;
    if (dx * dx + dz * dz > maxReach * maxReach) return null;

    const dy = py - plane.y;
    if (dy + r < -1.0 || dy - r > 13.2 * S) return null;

    const c = Math.cos(plane.yaw);
    const s = Math.sin(plane.yaw);
    // Transform into target plane's local space (+lz = nose, +lx = port, +ly = up)
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const ly = dy;

    let best = null;
    const pick = (cand, partName) => {
      if (cand && (!best || cand.pen > best.pen)) {
        best = { ...cand, part: partName };
      }
    };

    // 1. Widebody Fuselage OBB/Capsule (z in [-23.8*S, +24.0*S], x in [-2.35*S, +2.35*S], y in [0.4*S, 5.85*S])
    pick(
      this._sphereVsLocalBox(lx, ly, lz, r, -2.35 * S, 2.35 * S, 0.4 * S, 5.85 * S, -23.8 * S, 24.0 * S),
      "fuselage"
    );

    // 2. Swept Supercritical Main Wings + Underwing Turbofan Engine Nacelles (x in [-22.6*S, +22.6*S])
    const absX = Math.abs(lx);
    if (absX <= 22.8 * S + r) {
      const clampedX = THREE.MathUtils.clamp(absX, 1.8 * S, 22.6 * S);
      const u = (clampedX - 1.8 * S) / Math.max(0.01, 20.8 * S);
      const zCenter = (1.65 - 7.45 * u) * S;
      const halfChord = (3.75 - 2.35 * u) * S;
      const yLow = (u < 0.35 ? 1.15 : 2.15 + 1.8 * u) * S; // includes engine pods inboard
      const yHigh = (3.45 + 2.1 * u) * S;
      pick(
        this._sphereVsLocalBox(lx, ly, lz, r, -22.6 * S, 22.6 * S, yLow, yHigh, zCenter - halfChord, zCenter + halfChord),
        "wing"
      );
    }

    // 3. Vertical Stabilizer Tail Fin (up to 12.65*S ~ 17m tall)
    pick(
      this._sphereVsLocalBox(lx, ly, lz, r, -0.85 * S, 0.85 * S, 4.2 * S, 12.65 * S, -22.2 * S, -10.8 * S),
      "tail_fin"
    );

    // 4. Horizontal Stabilizer Tailplane
    pick(
      this._sphereVsLocalBox(lx, ly, lz, r, -7.65 * S, 7.65 * S, 3.55 * S, 4.65 * S, -21.8 * S, -17.5 * S),
      "tailplane"
    );

    if (!best) return null;

    // Convert local normal back to world space
    const wnx = best.lnx * c + best.lnz * s;
    const wny = best.lny;
    const wnz = -best.lnx * s + best.lnz * c;
    const nl = Math.hypot(wnx, wny, wnz) || 1;
    return {
      pen: best.pen,
      nx: wnx / nl,
      ny: wny / nl,
      nz: wnz / nl,
      topY: plane.y + best.topY,
      part: best.part,
    };
  }

  /**
   * Build 3D skeletal sample spheres for an airliner at `(x, y, z, yaw, pitch, roll, scale)`
   * covering nose, forward/mid/aft fuselage, tail cone, vertical fin, engines, and swept wingtips.
   */
  _getAirlinerSampleSpheres(x, y, z, yaw, pitch = 0, roll = 0, scale = 1.35) {
    const S = scale;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw); // right (starboard) vector
    const rz = Math.sin(yaw);
    const sinP = Math.sin(pitch);
    const sinR = Math.sin(roll);
    const yc = y + 3.35 * S;

    return [
      // Fuselage spine stations (nose to tail)
      { px: x + fx * (20.8 * S), py: yc + (20.8 * S) * sinP, pz: z + fz * (20.8 * S), r: 2.15 * S, tag: "nose", side: 0 },
      { px: x + fx * (10.5 * S), py: yc + (10.5 * S) * sinP, pz: z + fz * (10.5 * S), r: 2.38 * S, tag: "fwd_fuse", side: 0 },
      { px: x, py: yc, pz: z, r: 2.55 * S, tag: "mid_fuse", side: 0 },
      { px: x - fx * (10.5 * S), py: yc - (10.5 * S) * sinP, pz: z - fz * (10.5 * S), r: 2.35 * S, tag: "aft_fuse", side: 0 },
      { px: x - fx * (20.5 * S), py: yc - (20.5 * S) * sinP + 0.5 * S, pz: z - fz * (20.5 * S), r: 2.05 * S, tag: "tail_cone", side: 0 },
      // Vertical tail fin upper station
      { px: x - fx * (18.5 * S), py: y + 9.8 * S - (18.5 * S) * sinP, pz: z - fz * (18.5 * S), r: 1.55 * S, tag: "tail_fin", side: 0 },
      // Port (-1) & Starboard (+1) turbofan engines & mid-wings
      { px: x - rx * (7.2 * S) + fx * (1.8 * S), py: y + 2.4 * S + (7.2 * S) * sinR, pz: z - rz * (7.2 * S) + fz * (1.8 * S), r: 2.1 * S, tag: "engine_port", side: -1 },
      { px: x + rx * (7.2 * S) + fx * (1.8 * S), py: y + 2.4 * S - (7.2 * S) * sinR, pz: z + rz * (7.2 * S) + fz * (1.8 * S), r: 2.1 * S, tag: "engine_starboard", side: 1 },
      { px: x - rx * (14.5 * S) - fx * (2.6 * S), py: y + 3.4 * S + (14.5 * S) * sinR, pz: z - rz * (14.5 * S) - fz * (2.6 * S), r: 1.65 * S, tag: "wing_port", side: -1 },
      { px: x + rx * (14.5 * S) - fx * (2.6 * S), py: y + 3.4 * S - (14.5 * S) * sinR, pz: z + rz * (14.5 * S) - fz * (2.6 * S), r: 1.65 * S, tag: "wing_starboard", side: 1 },
      // Swept sharklet wingtips
      { px: x - rx * (21.6 * S) - fx * (5.8 * S), py: y + 4.4 * S + (21.6 * S) * sinR, pz: z - rz * (21.6 * S) - fz * (5.8 * S), r: 1.45 * S, tag: "wingtip_port", side: -1 },
      { px: x + rx * (21.6 * S) - fx * (5.8 * S), py: y + 4.4 * S - (21.6 * S) * sinR, pz: z + rz * (21.6 * S) - fz * (5.8 * S), r: 1.45 * S, tag: "wingtip_starboard", side: 1 },
    ];
  }

  /**
   * Resolve 3D collisions for the player-piloted active airliner (`this.mesh`) against:
   *   1. All other airliners (parked airport planes, damaged planes, runway planes, sky planes, liveSky).
   *   2. All maritime vessels & moored pier boats (`this.maritime` / `this.app.maritime`).
   */
  _resolveActiveAirlinerCollisions(dt) {
    if (this.dead || !this.mesh.visible) return;
    const pos = this.mesh.position;
    const yaw = this.app.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const horizSpd = this.grounded ? this.speed : (this.speed * Math.cos(this.pitch));
    const myVx = fx * horizSpd;
    const myVy = this.grounded ? 0 : this.vertSpeed;
    const myVz = fz * horizSpd;

    // --- PART A: Active Airliner vs. All Other Airliners ---
    const others = this.getAllAirlinerColliders(true, pos.x, pos.z, 180);
    if (others.length > 0) {
      const myPts = this._getAirlinerSampleSpheres(pos.x, pos.y, pos.z, yaw, this.pitch, this.roll, 1.35);
      const myPlaneDesc = { x: pos.x, y: pos.y, z: pos.z, yaw, scale: 1.35 };

      for (let i = 0; i < others.length; i++) {
        const other = others[i];
        const dx0 = pos.x - other.x;
        const dz0 = pos.z - other.z;
        if (dx0 * dx0 + dz0 * dz0 > 95 * 95) continue;

        let bestHit = null;
        let hitSide = 0;

        // Forward check: our fuselage & wing spheres vs other airliner's 3D body
        for (let p = 0; p < myPts.length; p++) {
          const pt = myPts[p];
          const h = this._testSphereVsAirliner3D(pt.px, pt.py, pt.pz, pt.r, other);
          if (h && (!bestHit || h.pen > bestHit.pen)) {
            bestHit = h;
            hitSide = pt.side;
          }
        }

        // Reverse check: other airliner's nose/tail/wingtips vs our 3D body
        const otherPts = this._getAirlinerSampleSpheres(other.x, other.y, other.z, other.yaw, other.pitch, other.roll, other.scale || 1.25);
        for (let p = 0; p < otherPts.length; p++) {
          const opt = otherPts[p];
          const h = this._testSphereVsAirliner3D(opt.px, opt.py, opt.pz, opt.r, myPlaneDesc);
          if (h && (!bestHit || h.pen > bestHit.pen)) {
            bestHit = {
              pen: h.pen,
              nx: -h.nx,
              ny: -h.ny,
              nz: -h.nz,
              topY: other.y + 5.8 * (other.scale || 1.25),
              part: h.part,
            };
          }
        }

        if (!bestHit) continue;

        // 1. Physically push active airliner out of the other airliner's 3D body so they NEVER overlap!
        const pushDist = bestHit.pen + 0.08;
        if (this.grounded || Math.abs(bestHit.ny) < 0.72) {
          const hLen = Math.hypot(bestHit.nx, bestHit.nz) || 1;
          pos.x += (bestHit.nx / hLen) * pushDist;
          pos.z += (bestHit.nz / hLen) * pushDist;
        } else {
          pos.x += bestHit.nx * pushDist;
          pos.y = Math.max(this.groundY, pos.y + bestHit.ny * pushDist);
          pos.z += bestHit.nz * pushDist;
        }

        // 2. Relative velocity & impulse response
        const rvx = myVx - (other.vx || 0);
        const rvy = myVy - (other.vy || 0);
        const rvz = myVz - (other.vz || 0);
        const vn = rvx * bestHit.nx + rvy * bestHit.ny + rvz * bestHit.nz;
        const impactSpd = vn < 0 ? -vn : Math.hypot(rvx, rvy, rvz) * 0.4;

        // Block inward motion & bounce/scrub speed
        const headDot = fx * bestHit.nx + fz * bestHit.nz;
        if (vn < 0) {
          if (this.grounded) {
            if (headDot * this.speed < -0.15) {
              // Head-on or reverse-into-plane: bounce slightly and stop
              this.speed = -Math.sign(this.speed) * Math.min(3.2, impactSpd * 0.18);
              this.throttle = 0;
            } else {
              // Glancing / wingtip scrape: scrub speed and impart yaw torque
              this.speed *= 0.45;
            }
          } else {
            this.speed = Math.max(32, this.speed * 0.65);
            if (bestHit.ny > 0.5 && this.vertSpeed < 0) {
              this.vertSpeed = Math.max(2.5, -this.vertSpeed * 0.35);
            }
          }

          if (hitSide !== 0) {
            // Wingtip clipped another plane -> realistic yaw spin torque
            this.app.yaw += hitSide * THREE.MathUtils.clamp(impactSpd * 0.025, 0.04, 0.32);
          }
        }

        // 3. Apply impact damage to both airliners (with cooldown so low-speed scrape doesn't instant-kill)
        if (impactSpd >= 25.0) {
          // High-speed collision (>= 25 m/s): catastrophic crash & explosion of both planes!
          if (other.type === "instanced") {
            const entry = this._promoteInstancedAirliner(other);
            if (entry) this._damageParkedEntry(entry, MAX_HP + 100);
          } else if (other.type === "damagedParked" && other.entry) {
            this._damageParkedEntry(other.entry, MAX_HP + 100);
          }
          this.applyDamage(MAX_HP + 100, pos);
          return;
        } else if (impactSpd > 2.2 && this._collisionCooldown <= 0) {
          this._collisionCooldown = 0.38;
          const dmg = impactSpd < 12.0
            ? (impactSpd - 1.8) * 4.5
            : 46.0 + (impactSpd - 12.0) * 18.0;
          if (other.type === "instanced") {
            const entry = this._promoteInstancedAirliner(other);
            if (entry) this._damageParkedEntry(entry, dmg);
          } else if (other.type === "damagedParked" && other.entry) {
            this._damageParkedEntry(other.entry, dmg);
          }
          this.applyDamage(dmg, pos);
          try {
            this.app.audio?.playCrash?.(Math.min(1.0, impactSpd / 18));
          } catch (_) {}
        }
      }
    }

    // --- PART B: Active Airliner vs. Maritime Vessels & Moored Boats ---
    const maritime = this.maritime || this.app.maritime;
    if (maritime && typeof maritime.resolveAircraftCollision === "function") {
      const shipCol = maritime.resolveAircraftCollision(
        pos,
        3.35,
        29.8,
        pos.y + 3.2,
        yaw,
        { x: myVx, y: myVy, z: myVz },
        {
          pitch: this.pitch,
          roll: this.roll,
          halfLen: 29.5,
          halfH: 3.4,
          applyPosition: true,
        }
      );

      if (shipCol && shipCol.hit) {
        if (pos.y < this.groundY) pos.y = this.groundY;
        const impactSpd = shipCol.relSpeed || Math.hypot(myVx, myVy, myVz);

        if (shipCol.isDeckContact && !this.grounded && this.vertSpeed < 0 && impactSpd < 35.0) {
          // Descending onto a ship deck: bounce or touch down on top of the vessel
          pos.y = Math.max(pos.y, shipCol.topY);
          this.groundY = Math.max(this.groundY, shipCol.topY);
          if (this.vertSpeed < -16.5) {
            this.applyDamage(MAX_HP + 50, pos);
            return;
          }
          this.vertSpeed = Math.max(0, -this.vertSpeed * 0.25);
        } else {
          // Lateral hull / bridge superstructure / mast collision
          if (impactSpd >= 35.0 || (!this.grounded && this.speed > 45.0)) {
            maritime.damageVessel?.(shipCol.vessel, 12.0, shipCol.contactX, shipCol.contactZ);
            this.applyDamage(MAX_HP + 100, pos);
            return;
          }

          const headDot = fx * shipCol.nx + fz * shipCol.nz;
          if (this.grounded) {
            if (headDot * this.speed < -0.1) {
              this.speed = -Math.sign(this.speed) * Math.min(2.8, impactSpd * 0.18);
              this.throttle = 0;
            } else {
              this.speed *= 0.4;
            }
          } else {
            this.speed = Math.max(30, this.speed * 0.6);
            this.vertSpeed = Math.max(2.0, this.vertSpeed);
          }

          if (shipCol.isWingHit) {
            const wingSign = shipCol.partTag?.includes("port") ? -1 : 1;
            this.app.yaw += wingSign * THREE.MathUtils.clamp(impactSpd * 0.025, 0.05, 0.28);
          }

          if (impactSpd > 2.5 && this._collisionCooldown <= 0) {
            this._collisionCooldown = 0.38;
            const dmg = impactSpd < 14.0
              ? (impactSpd - 2.0) * 5.0
              : 60.0 + (impactSpd - 14.0) * 16.0;
            this.applyDamage(dmg, pos);
          }
        }
      }
    }
  }

  /**
   * Highest surface height on any airliner (fuselage roof or wing upper surface) at `(x, z)` not above `refY + 1.5`.
   * Used by helicopters and walkers so they can land/stand on top of a parked airliner instead of falling through it.
   */
  getSupportHeightAt(x, z, refY = Infinity) {
    const excludeHero = this.app.mode === "airliner";
    const list = this.getAllAirlinerColliders(excludeHero, x, z, 90);
    let bestY = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const pl = list[i];
      const S = pl.scale || 1.25;
      const dx = x - pl.x;
      const dz = z - pl.z;
      if (dx * dx + dz * dz > (34 * S) * (34 * S)) continue;
      const c = Math.cos(pl.yaw);
      const s = Math.sin(pl.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;

      // Fuselage roof
      if (Math.abs(lx) <= 2.25 * S && Math.abs(lz) <= 23.2 * S) {
        const top = pl.y + 5.85 * S;
        if (top <= refY + 1.8 && top > bestY) bestY = top;
      }
      // Swept wing surface
      const absX = Math.abs(lx);
      if (absX >= 1.8 * S && absX <= 22.4 * S) {
        const u = (absX - 1.8 * S) / (20.6 * S);
        const zCenter = (1.65 - 7.45 * u) * S;
        const halfChord = (3.75 - 2.35 * u) * S;
        if (Math.abs(lz - zCenter) <= halfChord) {
          const top = pl.y + (3.45 + 2.0 * u) * S;
          if (top <= refY + 1.8 && top > bestY) bestY = top;
        }
      }
    }
    return bestY;
  }

  /**
   * External 3D collision query & resolution against all airliners in the world.
   * Called by:
   *   - Player Helicopter (`src/features/heli_flight.js`)
   *   - Player Fighter Jet / Propeller Plane / Ground Vehicles (`car`, `tank`) / Walker (`src/main.js`)
   *   - AI Traffic (`_resolveTrafficVsAirliners`)
   * Mutates `pos` to push the caller out of the airliner's 3D fuselage, wings, engines, and tail!
   */
  resolveExternalCollision(pos, yaw = 0, radius = 2.5, wingSpan = 0, velocity = null, isAircraft = false) {
    if (!pos) return null;
    const excludeHero = this.app.mode === "airliner";
    const list = this.getAllAirlinerColliders(excludeHero, pos.x, pos.z, 140);
    if (!list.length) return null;

    const rBody = Math.max(0.45, radius || 2.0);
    const halfSpan = Math.max(0, (wingSpan || 0) * 0.5);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);

    const samplePts = [
      { px: pos.x, py: (pos.y ?? 0) + (isAircraft ? 0 : rBody * 0.65), pz: pos.z, r: rBody, tag: "body" },
    ];
    if (isAircraft && halfSpan > rBody * 1.1) {
      const tipSpan = halfSpan * 0.9;
      const tipR = Math.max(1.0, rBody * 0.45);
      samplePts.push(
        { px: pos.x - rx * tipSpan, py: pos.y ?? 0, pz: pos.z - rz * tipSpan, r: tipR, tag: "wing_port" },
        { px: pos.x + rx * tipSpan, py: pos.y ?? 0, pz: pos.z + rz * tipSpan, r: tipR, tag: "wing_starboard" },
        { px: pos.x + fx * (halfSpan * 0.65), py: pos.y ?? 0, pz: pos.z + fz * (halfSpan * 0.65), r: tipR, tag: "nose" },
        { px: pos.x - fx * (halfSpan * 0.65), py: pos.y ?? 0, pz: pos.z - fz * (halfSpan * 0.65), r: tipR, tag: "tail" }
      );
    }

    let bestHit = null;
    let hitPlane = null;

    for (let i = 0; i < list.length; i++) {
      const pl = list[i];
      for (let p = 0; p < samplePts.length; p++) {
        const pt = samplePts[p];
        const h = this._testSphereVsAirliner3D(pt.px, pt.py, pt.pz, pt.r, pl);
        if (h && (!bestHit || h.pen > bestHit.pen)) {
          bestHit = h;
          hitPlane = pl;
        }
      }
    }

    if (!bestHit || !hitPlane) return null;

    let vx = 0, vy = 0, vz = 0;
    if (velocity && typeof velocity === "object") {
      vx = velocity.x || 0;
      vy = velocity.y || 0;
      vz = velocity.z || 0;
    } else if (typeof velocity === "number") {
      vx = fx * velocity;
      vz = fz * velocity;
    }

    const rvx = vx - (hitPlane.vx || 0);
    const rvy = vy - (hitPlane.vy || 0);
    const rvz = vz - (hitPlane.vz || 0);
    const vn = rvx * bestHit.nx + rvy * bestHit.ny + rvz * bestHit.nz;
    const relSpeed = vn < 0 ? -vn : Math.hypot(rvx, rvy, rvz) * 0.35;

    const pushDist = bestHit.pen + 0.06;
    let pushX = bestHit.nx * pushDist;
    let pushY = bestHit.ny * pushDist;
    let pushZ = bestHit.nz * pushDist;

    if (!isAircraft) {
      // Ground vehicles & walkers: push horizontally so cars don't pop into the air
      const hLen = Math.hypot(bestHit.nx, bestHit.nz) || 1;
      pushX = (bestHit.nx / hLen) * pushDist;
      pushY = 0;
      pushZ = (bestHit.nz / hLen) * pushDist;
    }

    pos.x += pushX;
    if (isAircraft && pos.y !== undefined) {
      pos.y += pushY;
    }
    pos.z += pushZ;

    // Apply impact damage to the hit airliner if collided at high speed
    if (relSpeed > 11.0 && !(this._collisionCooldown > 0)) {
      this._collisionCooldown = 0.35;
      const dmg = (relSpeed - 9.0) * (isAircraft ? 8.5 : 3.5);
      if (hitPlane.type === "hero") {
        this.applyDamage(dmg, pos);
      } else if (hitPlane.type === "instanced") {
        const entry = this._promoteInstancedAirliner(hitPlane);
        if (entry) this._damageParkedEntry(entry, dmg);
      } else if (hitPlane.type === "damagedParked" && hitPlane.entry) {
        this._damageParkedEntry(hitPlane.entry, dmg);
      }
    }

    return {
      hit: true,
      pen: bestHit.pen,
      nx: bestHit.nx,
      ny: bestHit.ny,
      nz: bestHit.nz,
      pushX,
      pushY,
      pushZ,
      topY: bestHit.topY,
      part: bestHit.part,
      airliner: hitPlane,
      relSpeed,
    };
  }

  /**
   * Prevent AI street/airport traffic cars from driving through parked or active airliners.
   */
  _resolveTrafficVsAirliners() {
    const cars = this.app.traffic?.cars;
    if (!Array.isArray(cars) || !cars.length) return;
    const planes = this.getAllAirlinerColliders(false, this.app.pos?.x, this.app.pos?.z, 260);
    if (!planes.length) return;

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (!c || c.dead) continue;
      for (let j = 0; j < planes.length; j++) {
        const pl = planes[j];
        if (Math.abs((c.y || 0) - pl.y) > 8.0) continue;
        const dx = c.x - pl.x;
        const dz = c.z - pl.z;
        if (dx * dx + dz * dz > 42 * 42) continue;
        const h = this._testSphereVsAirliner3D(c.x, (c.y || pl.y) + 1.2, c.z, 2.2, pl);
        if (h) {
          const hl = Math.hypot(h.nx, h.nz) || 1;
          c.x += (h.nx / hl) * (h.pen + 0.1);
          c.z += (h.nz / hl) * (h.pen + 0.1);
          if (typeof c.v === "number") c.v = 0;
          if (typeof c.speed === "number") c.speed = 0;
        }
      }
    }
  }
}
