// Walker Weapons System & Military Defense (World Explorer)
import * as THREE from '../../vendor/three.module.js';
import { getWeaponSfx } from './weapon_sfx.js';
import { getBeijingTerrainElevation } from '../environment.js';
import { createVehicleModel } from '../entities.js';

const HALF_PI = Math.PI * 0.5;

export const WALKER_WEAPONS = {
  RIFLE: {
    id: 'RIFLE',
    name: 'Assault Rifle',
    nameZh: '突击步枪',
    fireRate: 11.0,         // rounds / s
    cooldown: 0.09,
    buildingDamage: 0.06,   // rocket-equivalent damage units
    buildingSplash: 0,
    kaijuDamage: 25,
    carDamage: 45,
    tracerSpeed: 650,       // m/s
    range: 1200,
    spread: 0.0035,
    sound: 'cannon',
    soundGain: 0.42,
  },
  RPG: {
    id: 'RPG',
    name: 'RPG-7 Rocket Launcher',
    nameZh: 'RPG 火箭筒',
    fireRate: 0.85,
    cooldown: 1.15,
    buildingDamage: 1.0,    // 1.0 rocket building damage
    buildingSplash: 10.0,   // 10m splash
    kaijuDamage: 550,
    carDamage: 180,
    blastRadius: 10.0,
    rocketSpeed: 185,       // m/s
    range: 900,
    spread: 0.002,
    sound: 'missileLaunch',
    soundGain: 0.85,
  },
  RAILGUN: {
    id: 'RAILGUN',
    name: 'Plasma Railgun',
    nameZh: '等离子电磁炮',
    fireRate: 0.95,
    cooldown: 1.05,
    buildingDamage: 2.5,    // 2.5 rocket building damage
    buildingSplash: 12.0,
    kaijuDamage: 1200,
    carDamage: 300,
    blastRadius: 12.0,
    range: 1600,
    beamDuration: 0.28,
    sound: 'railgun',
    soundGain: 0.95,
  },
};

const WEAPON_KEYS = ['RIFLE', 'RPG', 'RAILGUN'];

// -----------------------------------------------------------------------------
// 3D Weapon Models Builder
// -----------------------------------------------------------------------------
export function createRifleModel() {
  const group = new THREE.Group();
  const gunMetalMat = new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.45, metalness: 0.75 });
  const darkPolyMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85, metalness: 0.15 });
  const holoGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.11, 0.32), gunMetalMat);
  group.add(receiver);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.38, 10), gunMetalMat);
  barrel.rotation.x = HALF_PI;
  barrel.position.set(0, 0.02, 0.35);
  group.add(barrel);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.06, 10), gunMetalMat);
  muzzle.rotation.x = HALF_PI;
  muzzle.position.set(0, 0.02, 0.55);
  group.add(muzzle);

  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.085, 0.26), darkPolyMat);
  handguard.position.set(0, 0.015, 0.25);
  group.add(handguard);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.38), gunMetalMat);
  rail.position.set(0, 0.07, 0.08);
  group.add(rail);

  const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.10), darkPolyMat);
  sightBase.position.set(0, 0.10, 0.05);
  group.add(sightBase);
  const sightReticle = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), holoGlowMat);
  sightReticle.position.set(0, 0.105, 0.09);
  group.add(sightReticle);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.065), darkPolyMat);
  grip.position.set(0, -0.10, -0.06);
  grip.rotation.x = 0.28;
  group.add(grip);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.075), darkPolyMat);
  mag.position.set(0, -0.11, 0.09);
  mag.rotation.x = -0.22;
  group.add(mag);

  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.24), darkPolyMat);
  stock.position.set(0, 0, -0.24);
  group.add(stock);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.02, 0.60);
  group.add(muzzlePoint);

  group.userData.muzzlePoint = muzzlePoint;
  return group;
}

export function createRpgModel() {
  const group = new THREE.Group();
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a36, roughness: 0.65, metalness: 0.35 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4324, roughness: 0.80, metalness: 0.10 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.40, metalness: 0.75 });
  const warheadMat = new THREE.MeshStandardMaterial({ color: 0x48583c, roughness: 0.55, metalness: 0.30 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a034, roughness: 0.30, metalness: 0.80 });

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.88, 12), tubeMat);
  tube.rotation.x = HALF_PI;
  group.add(tube);

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 0.18, 12), steelMat);
  exhaust.rotation.x = HALF_PI;
  exhaust.position.set(0, 0, -0.52);
  group.add(exhaust);

  const heatGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.32, 12), woodMat);
  heatGuard.rotation.x = HALF_PI;
  heatGuard.position.set(0, 0, -0.15);
  group.add(heatGuard);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.06), steelMat);
  grip.position.set(0, -0.10, 0.06);
  grip.rotation.x = 0.24;
  group.add(grip);

  const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.18), steelMat);
  scope.position.set(-0.065, 0.06, 0.05);
  group.add(scope);

  const warheadGroup = new THREE.Group();
  warheadGroup.position.set(0, 0, 0.45);

  const booster = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.14, 10), steelMat);
  booster.rotation.x = HALF_PI;
  booster.position.set(0, 0, 0.07);
  warheadGroup.add(booster);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 12), warheadMat);
  cone.rotation.x = -HALF_PI;
  cone.position.set(0, 0, 0.26);
  warheadGroup.add(cone);

  const fuseTip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 10), brassMat);
  fuseTip.rotation.x = -HALF_PI;
  fuseTip.position.set(0, 0, 0.40);
  warheadGroup.add(fuseTip);

  group.add(warheadGroup);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0, 0.90);
  group.add(muzzlePoint);

  group.userData.muzzlePoint = muzzlePoint;
  return group;
}

export function createRailgunModel() {
  const group = new THREE.Group();
  const gunMetalMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.35, metalness: 0.85 });
  const cyanCoreMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const goldAccMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.25, metalness: 0.80 });

  for (const sy of [-0.035, 0.035]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.65), gunMetalMat);
    rail.position.set(0, sy, 0.22);
    group.add(rail);
  }

  const plasmaCore = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.60), cyanCoreMat);
  plasmaCore.position.set(0, 0, 0.22);
  group.add(plasmaCore);

  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.12, 0.04), goldAccMat);
    ring.position.set(0, 0, 0.05 + i * 0.14);
    group.add(ring);
  }

  const capacitor = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.26), gunMetalMat);
  capacitor.position.set(0, 0, -0.18);
  group.add(capacitor);

  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.02, 0.16), cyanCoreMat);
  bar.position.set(0, 0.04, -0.18);
  group.add(bar);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.065), gunMetalMat);
  grip.position.set(0, -0.11, 0.02);
  grip.rotation.x = 0.26;
  group.add(grip);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0, 0.62);
  group.add(muzzlePoint);

  group.userData.muzzlePoint = muzzlePoint;
  return group;
}

export function createArmySoldierModel(weaponType = 'RIFLE') {
  const root = new THREE.Group();
  const camoUniformMat = new THREE.MeshStandardMaterial({ color: 0x48583c, roughness: 0.70, metalness: 0.25 });
  const darkFatigueMat = new THREE.MeshStandardMaterial({ color: 0x36442e, roughness: 0.75, metalness: 0.20 });
  const tacticalVestMat = new THREE.MeshStandardMaterial({ color: 0x2e3826, roughness: 0.80, metalness: 0.20 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.85, metalness: 0.15 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.60, metalness: 0.10 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x3d4a36, roughness: 0.65, metalness: 0.30 });
  const goggleMat = new THREE.MeshStandardMaterial({ color: 0x112233, roughness: 0.10, metalness: 0.90 });

  const hips = new THREE.Group();
  hips.position.set(0, 0.90, 0);
  root.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.24), camoUniformMat);
  torso.position.set(0, 0.28, 0);
  hips.add(torso);

  const plateCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.28), tacticalVestMat);
  plateCarrier.position.set(0, 0.28, 0);
  hips.add(plateCarrier);

  for (const sx of [-0.11, 0, 0.11]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.06), tacticalVestMat);
    pouch.position.set(sx, 0.22, 0.16);
    hips.add(pouch);
  }

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0);
  hips.add(headGroup);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.22, 0.22), skinMat);
  headGroup.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), helmetMat);
  helmet.scale.set(0.95, 0.92, 1.05);
  helmet.position.set(0, 0.05, 0);
  headGroup.add(helmet);

  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.06), goggleMat);
  goggles.position.set(0, 0.06, 0.13);
  headGroup.add(goggles);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.28, 1.42, 0);
  root.add(leftArm);

  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.13), camoUniformMat);
  leftArmMesh.position.set(0, -0.22, 0);
  leftArm.add(leftArmMesh);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.28, 1.42, 0);
  root.add(rightArm);

  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.13), camoUniformMat);
  rightArmMesh.position.set(0, -0.22, 0);
  rightArm.add(rightArmMesh);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.13, 0.90, 0);
  root.add(leftLeg);

  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), darkFatigueMat);
  leftLegMesh.position.set(0, -0.26, 0);
  leftLeg.add(leftLegMesh);

  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.18, 0.24), bootMat);
  bootL.position.set(0, -0.52, 0.03);
  leftLeg.add(bootL);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.13, 0.90, 0);
  root.add(rightLeg);

  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.52, 0.16), darkFatigueMat);
  rightLegMesh.position.set(0, -0.26, 0);
  rightLeg.add(rightLegMesh);

  const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.18, 0.24), bootMat);
  bootR.position.set(0, -0.52, 0.03);
  rightLeg.add(bootR);

  const weaponMesh = weaponType === 'RPG' ? createRpgModel() : createRifleModel();
  weaponMesh.position.set(0, -0.46, 0.22);
  rightArm.add(weaponMesh);

  rightArm.rotation.x = -HALF_PI * 0.92;
  leftArm.rotation.x = -HALF_PI * 0.85;
  leftArm.rotation.y = -0.36;

  root.userData = {
    hips,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMesh,
    weaponType,
    muzzlePoint: weaponMesh.userData.muzzlePoint,
  };

  root.scale.setScalar(1.04);
  return root;
}

export class WalkerWeaponsSystem {
  constructor(app) {
    this.app = app;
    this.activeWeapon = 'RIFLE';
    this.fireTimer = 0;
    this.rpgQuickTimer = 0;
    this.tankCannonTimer = 0;
    this.isFiring = false;
    this.reticleEl = null;
    this.weaponBadgeEl = null;

    this.projectiles = [];
    this.beams = [];
    this.explosions = [];

    this._raycaster = new THREE.Raycaster();

    this.aiSoldiers = [];
    this.aiTanks = [];
    this.aiRagdolls = [];

    this._initReticleUi();
    this._initPlayerWeaponGroup();
    this._initAiDefenseSquad();
  }

  _initReticleUi() {
    if (typeof document === 'undefined') return;

    let ret = document.getElementById('walker-reticle');
    if (!ret) {
      ret = document.createElement('div');
      ret.id = 'walker-reticle';
      ret.style.cssText = [
        'position:fixed',
        'left:50%',
        'top:46%',
        'width:44px',
        'height:44px',
        'transform:translate(-50%,-50%)',
        'pointer-events:none',
        'z-index:22',
        'display:none',
        'transition:transform 0.05s ease-out',
      ].join(';');
      ret.innerHTML = `
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="14" stroke="rgba(255,200,60,0.85)" stroke-width="1.4" stroke-dasharray="6 4"/>
          <circle cx="22" cy="22" r="2.2" fill="rgba(255,80,20,0.95)"/>
          <path d="M22 3v6M22 35v6M3 22h6M35 22h6" stroke="rgba(255,210,80,0.85)" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      `;
      document.body.appendChild(ret);
    }
    this.reticleEl = ret;

    let badge = document.getElementById('walker-weapon-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'walker-weapon-badge';
      badge.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:68px',
        'transform:translateX(-50%)',
        'background:rgba(18,24,32,0.88)',
        'color:#f0f4f8',
        'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
        'font-size:12px',
        'font-weight:600',
        'letter-spacing:0.8px',
        'padding:5px 14px',
        'border-radius:18px',
        'border:1px solid rgba(255,200,60,0.45)',
        'box-shadow:0 4px 14px rgba(0,0,0,0.45)',
        'pointer-events:none',
        'z-index:24',
        'display:none',
      ].join(';');
      document.body.appendChild(badge);
    }
    this.weaponBadgeEl = badge;
    this._updateWeaponBadge();
  }

  _updateWeaponBadge() {
    if (!this.weaponBadgeEl) return;
    const w = WALKER_WEAPONS[this.activeWeapon];
    if (!w) return;
    const zh = this.app.getLang ? this.app.getLang() === 'zh' : false;
    const name = zh ? w.nameZh : w.name.toUpperCase();
    this.weaponBadgeEl.innerHTML = `<span style="color:#ffcc33;margin-right:6px;">[R]</span>${name}`;
  }

  _initPlayerWeaponGroup() {
    const avatar = this.app.avatarMesh || this.app.walker;
    if (!avatar) return;

    this.weaponRig = new THREE.Group();
    // Rotate weaponRig so weapon barrel points forward along arm direction
    this.weaponRig.rotation.x = HALF_PI;

    this.rifleMesh = createRifleModel();
    this.rpgMesh = createRpgModel();
    this.railgunMesh = createRailgunModel();

    this.weaponRig.add(this.rifleMesh);
    this.weaponRig.add(this.rpgMesh);
    this.weaponRig.add(this.railgunMesh);

    const rightArm = avatar.userData && avatar.userData.rightArm;
    if (rightArm) {
      this.weaponRig.position.set(0.265, -0.52, 0.06);
      rightArm.add(this.weaponRig);
    } else {
      this.weaponRig.position.set(0.265, 0.95, 0.35);
      avatar.add(this.weaponRig);
    }

    this._updateRigWeaponVisibility();
  }

  _updateRigWeaponVisibility() {
    if (!this.weaponRig) return;
    if (this.rifleMesh) this.rifleMesh.visible = this.activeWeapon === 'RIFLE';
    if (this.rpgMesh) this.rpgMesh.visible = this.activeWeapon === 'RPG';
    if (this.railgunMesh) this.railgunMesh.visible = this.activeWeapon === 'RAILGUN';
  }

  cycleWeapon() {
    const curIdx = WEAPON_KEYS.indexOf(this.activeWeapon);
    this.activeWeapon = WEAPON_KEYS[(curIdx + 1) % WEAPON_KEYS.length];
    this._updateRigWeaponVisibility();
    this._updateWeaponBadge();
    getWeaponSfx(this.app).play('spark', { gain: 0.3 });
  }

  getAimRay() {
    const cam = this.app.camera;
    const ndcX = 0;
    const ndcY = 0.08;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, cam);
    return this._raycaster.ray;
  }

  raycastAim(ray, maxDist = 1400) {
    const o = ray.origin;
    const d = ray.direction;
    let bestDist = maxDist;
    let hitResult = { dist: maxDist, point: o.clone().addScaledVector(d, maxDist), kind: 'air', ref: null };

    // 1. Kaiju
    const K = this.app.kaiju;
    if (K && K.active && K.kaiju && K.kaiju.alive) {
      const kh = K.kaiju.raycast(o, d, bestDist);
      if (kh && kh.dist < bestDist) {
        bestDist = kh.dist;
        hitResult = { dist: bestDist, point: kh.point, kind: 'kaiju', ref: kh, weak: kh.weak };
      }
    }

    // 2. Destructible Buildings
    const D = K && K.destruction;
    if (D && typeof D.raycast === 'function') {
      const bh = D.raycast(o, d, bestDist);
      if (bh && bh.dist < bestDist) {
        bestDist = bh.dist;
        hitResult = { dist: bestDist, point: o.clone().addScaledVector(d, bestDist), kind: 'building', ref: bh.ref };
      }
    }

    // 3. Terrain Raycast
    const terrDist = this._raycastTerrain(o, d, bestDist);
    if (terrDist < bestDist) {
      bestDist = terrDist;
      hitResult = { dist: bestDist, point: o.clone().addScaledVector(d, bestDist), kind: 'ground', ref: null };
    }

    // 4. Traffic Cars
    const cars = this.app.traffic && this.app.traffic.cars;
    if (cars) {
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c.active) continue;
        const cy = (c.y || 0) + 0.8;
        const cx = c.x - o.x, cdy = cy - o.y, cz = c.z - o.z;
        const along = cx * d.x + cdy * d.y + cz * d.z;
        if (along <= 1.0 || along >= bestDist) continue;
        const px = cx - d.x * along, py = cdy - d.y * along, pz = cz - d.z * along;
        if (px * px + py * py + pz * pz <= 2.4 * 2.4) {
          bestDist = along;
          hitResult = { dist: bestDist, point: o.clone().addScaledVector(d, bestDist), kind: 'car', car: c };
        }
      }
    }

    // 5. Maritime Ships
    const sea = this.app.maritime;
    if (sea && typeof sea.raycast === 'function') {
      const sd = sea.raycast(o, d, bestDist);
      if (sd < bestDist) {
        bestDist = sd;
        hitResult = { dist: bestDist, point: o.clone().addScaledVector(d, bestDist), kind: 'ship', ref: null };
      }
    }

    return hitResult;
  }

  _raycastTerrain(o, d, maxD) {
    if (d.y >= 0 && o.y > 0) return Infinity;
    const step = 8.0;
    let prev = 0;
    for (let t = step; t <= maxD; t += step) {
      const tx = o.x + d.x * t;
      const ty = o.y + d.y * t;
      const tz = o.z + d.z * t;
      const elev = getBeijingTerrainElevation(tx, tz);
      if (ty <= elev) {
        let lo = prev, hi = t;
        for (let i = 0; i < 8; i++) {
          const m = (lo + hi) * 0.5;
          const my = o.y + d.y * m;
          const me = getBeijingTerrainElevation(o.x + d.x * m, o.z + d.z * m);
          if (my <= me) hi = m; else lo = m;
        }
        return hi;
      }
      prev = t;
    }
    return Infinity;
  }

  fireCurrentWeapon() {
    if (this.fireTimer > 0) return;
    const w = WALKER_WEAPONS[this.activeWeapon];
    if (!w) return;

    this.fireTimer = w.cooldown;
    const ray = this.getAimRay();
    const hit = this.raycastAim(ray, w.range);

    const muzzleWorld = new THREE.Vector3();
    const rigMesh = this.activeWeapon === 'RPG' ? this.rpgMesh : this.activeWeapon === 'RAILGUN' ? this.railgunMesh : this.rifleMesh;
    if (rigMesh && rigMesh.userData.muzzlePoint) {
      rigMesh.userData.muzzlePoint.getWorldPosition(muzzleWorld);
    } else {
      muzzleWorld.copy(this.app.pos).add(new THREE.Vector3(0.28, 1.45, 0.45));
    }

    if (this.activeWeapon === 'RIFLE') {
      this._fireRifleBullet(muzzleWorld, hit);
    } else if (this.activeWeapon === 'RPG') {
      this._fireRpgRocket(muzzleWorld, hit);
    } else if (this.activeWeapon === 'RAILGUN') {
      this._fireRailgunBeam(muzzleWorld, hit);
    }

    if (this.reticleEl) {
      this.reticleEl.style.transform = 'translate(-50%,-50%) scale(1.18)';
      setTimeout(() => {
        if (this.reticleEl) this.reticleEl.style.transform = 'translate(-50%,-50%) scale(1.0)';
      }, 70);
    }
  }

  quickFireRpg() {
    if (this.rpgQuickTimer > 0) return;
    this.rpgQuickTimer = WALKER_WEAPONS.RPG.cooldown;
    const ray = this.getAimRay();
    const hit = this.raycastAim(ray, WALKER_WEAPONS.RPG.range);
    const muzzleWorld = new THREE.Vector3().copy(this.app.pos).add(new THREE.Vector3(0.35, 1.55, 0.5));
    this._fireRpgRocket(muzzleWorld, hit);
  }

  _fireRifleBullet(origin, hit) {
    getWeaponSfx(this.app).play('cannon', { gain: WALKER_WEAPONS.RIFLE.soundGain });
    this._spawnMuzzleFlash(origin, 0.08, 0xffbb33);

    const dir = new THREE.Vector3().subVectors(hit.point, origin).normalize();
    const tracerGeom = new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6);
    tracerGeom.rotateX(HALF_PI);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    const tracerMesh = new THREE.Mesh(tracerGeom, tracerMat);
    tracerMesh.position.copy(origin);
    tracerMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(tracerMesh);

    this.projectiles.push({
      mesh: tracerMesh,
      pos: origin.clone(),
      dir,
      speed: WALKER_WEAPONS.RIFLE.tracerSpeed,
      distTraveled: 0,
      maxDist: hit.dist,
      damage: WALKER_WEAPONS.RIFLE.buildingDamage,
      kaijuDamage: WALKER_WEAPONS.RIFLE.kaijuDamage,
      hitTarget: hit,
      isRocket: false,
    });
  }

  _fireRpgRocket(origin, hit) {
    getWeaponSfx(this.app).play('missileLaunch', { gain: WALKER_WEAPONS.RPG.soundGain });
    this._spawnMuzzleFlash(origin, 0.22, 0xff7722);

    const dir = new THREE.Vector3().subVectors(hit.point, origin).normalize();
    const rocketMesh = createRpgModel();
    rocketMesh.scale.setScalar(0.75);
    rocketMesh.position.copy(origin);
    rocketMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(rocketMesh);

    this.projectiles.push({
      mesh: rocketMesh,
      pos: origin.clone(),
      dir,
      speed: WALKER_WEAPONS.RPG.rocketSpeed,
      distTraveled: 0,
      maxDist: hit.dist,
      damage: WALKER_WEAPONS.RPG.buildingDamage,
      kaijuDamage: WALKER_WEAPONS.RPG.kaijuDamage,
      splashRadius: WALKER_WEAPONS.RPG.buildingSplash,
      hitTarget: hit,
      isRocket: true,
      smokeTimer: 0,
    });
  }

  _fireRailgunBeam(origin, hit) {
    getWeaponSfx(this.app).play('railgun', { gain: WALKER_WEAPONS.RAILGUN.soundGain });
    this._spawnMuzzleFlash(origin, 0.35, 0x00ffff);

    const dist = Math.min(hit.dist, WALKER_WEAPONS.RAILGUN.range);
    const dir = new THREE.Vector3().subVectors(hit.point, origin).normalize();
    const beamGeom = new THREE.CylinderGeometry(0.065, 0.065, dist, 8);
    beamGeom.rotateX(HALF_PI);
    beamGeom.translate(0, 0, dist * 0.5);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.95 });
    const beamMesh = new THREE.Mesh(beamGeom, beamMat);
    beamMesh.position.copy(origin);
    beamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(beamMesh);

    this.beams.push({
      mesh: beamMesh,
      mat: beamMat,
      life: WALKER_WEAPONS.RAILGUN.beamDuration,
      maxLife: WALKER_WEAPONS.RAILGUN.beamDuration,
    });

    this._applyImpact(hit.point, hit, WALKER_WEAPONS.RAILGUN.buildingDamage, WALKER_WEAPONS.RAILGUN.buildingSplash, WALKER_WEAPONS.RAILGUN.kaijuDamage);
    this._spawnExplosion(hit.point, 4.5, 0x00ffff);
  }

  fireTankCannon() {
    if (this.tankCannonTimer > 0) return;
    const mesh = this.app.vehicleMesh;
    if (!mesh || !mesh.userData || !mesh.userData.isTank) return;

    this.tankCannonTimer = 1.8;
    getWeaponSfx(this.app).play('cannon', { gain: 1.0 });
    getWeaponSfx(this.app).play('explosion', { gain: 0.85 });

    const ray = this.getAimRay();
    const hit = this.raycastAim(ray, 1500);

    const muzzleWorld = new THREE.Vector3();
    if (mesh.userData.muzzlePoint) {
      mesh.userData.muzzlePoint.getWorldPosition(muzzleWorld);
    } else {
      muzzleWorld.copy(this.app.pos).add(new THREE.Vector3(0, 1.8, 4.2));
    }

    this._spawnMuzzleFlash(muzzleWorld, 0.45, 0xffaa22);

    const dir = new THREE.Vector3().subVectors(hit.point, muzzleWorld).normalize();
    const shellGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8);
    shellGeom.rotateX(HALF_PI);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xffcc44, roughness: 0.3, metalness: 0.8 });
    const shellMesh = new THREE.Mesh(shellGeom, shellMat);
    shellMesh.position.copy(muzzleWorld);
    shellMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(shellMesh);

    this.projectiles.push({
      mesh: shellMesh,
      pos: muzzleWorld.clone(),
      dir,
      speed: 380,
      distTraveled: 0,
      maxDist: hit.dist,
      damage: 1.5,
      splashRadius: 14.0,
      kaijuDamage: 750,
      hitTarget: hit,
      isTankShell: true,
      smokeTimer: 0,
    });
  }

  _applyImpact(hitPos, hit, buildingUnits, splashRadius, kaijuDmg) {
    const K = this.app.kaiju;
    const D = K && K.destruction;

    if (hit && hit.kind === 'kaiju' && K && K.kaiju) {
      K.kaiju.takeDamage?.(kaijuDmg, hitPos, hit.weak);
      this._spawnExplosion(hitPos, 4.2, 0xffaa33);
      getWeaponSfx(this.app).play('spark', { gain: 0.8 });
    }

    if (D) {
      if (hit && hit.kind === 'building' && hit.ref && typeof D.applyHeliHit === 'function') {
        D.applyHeliHit(hit.ref, buildingUnits);
      }
      if (splashRadius > 0 && typeof D.heliSplash === 'function') {
        D.heliSplash(hitPos.x, hitPos.y, hitPos.z, splashRadius, buildingUnits, hit?.ref);
      }
    }

    if (this.app.traffic && typeof this.app.traffic.triggerImpactSphere === 'function') {
      const radius = splashRadius > 0 ? splashRadius : 3.6;
      const force = splashRadius > 0 ? 2.4 : 1.2;
      this.app.traffic.triggerImpactSphere(hitPos.x, hitPos.y, hitPos.z, radius, {
        vx: 0,
        vy: 4.5,
        vz: 0,
        force,
      });
    }

    if (this.app.vehicleDamage) {
      if (typeof this.app.vehicleDamage.applyExplosionSplash === 'function' && splashRadius > 0) {
        this.app.vehicleDamage.applyExplosionSplash(hitPos, splashRadius, 250);
      }
    }

    if (this.app.maritime && typeof this.app.maritime.applyWeaponImpact === 'function') {
      this.app.maritime.applyWeaponImpact(hitPos, buildingUnits * 100);
    }
  }

  _spawnExplosion(pos, radius = 5.0, colorHex = 0xff6600) {
    getWeaponSfx(this.app).play('explosion', { gain: 0.85 });

    const geom = new THREE.SphereGeometry(radius * 0.35, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    this.app.scene.add(mesh);

    this.explosions.push({
      mesh,
      mat,
      maxRadius: radius,
      age: 0,
      duration: 0.45,
    });
  }

  _spawnMuzzleFlash(pos, scale = 0.15, colorHex = 0xffbb22) {
    const flashGeom = new THREE.SphereGeometry(scale, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(flashGeom, flashMat);
    mesh.position.copy(pos);
    this.app.scene.add(mesh);

    setTimeout(() => {
      this.app.scene.remove(mesh);
      flashGeom.dispose();
      flashMat.dispose();
    }, 45);
  }

  _initAiDefenseSquad() {
    this.soldierGroup = new THREE.Group();
    this.tankGroup = new THREE.Group();
    this.app.scene.add(this.soldierGroup);
    this.app.scene.add(this.tankGroup);
  }

  _updateAiMilitary(dt) {
    const K = this.app.kaiju;
    const kaijuActive = Boolean(K && K.active && K.kaiju && K.kaiju.alive);

    if (kaijuActive) {
      this._updateAiKaijuBattle(dt, K.kaiju);
    } else {
      this._updateAiNormalPatrol(dt);
    }
  }

  _updateAiNormalPatrol(dt) {
    const targetCount = 8;
    while (this.aiSoldiers.length < targetCount) {
      const angle = (this.aiSoldiers.length / targetCount) * Math.PI * 2;
      const dist = 18 + (this.aiSoldiers.length % 3) * 6;
      const px = this.app.pos.x + Math.cos(angle) * dist;
      const pz = this.app.pos.z + Math.sin(angle) * dist;
      const py = getBeijingTerrainElevation(px, pz) + 0.12;

      const soldier = {
        mesh: createArmySoldierModel(this.aiSoldiers.length % 4 === 0 ? 'RPG' : 'RIFLE'),
        pos: new THREE.Vector3(px, py, pz),
        yaw: angle + Math.PI,
        fireCooldown: 1.5 + Math.random() * 2,
        state: 'patrol',
        alive: true,
      };
      soldier.mesh.position.copy(soldier.pos);
      soldier.mesh.rotation.y = soldier.yaw;
      this.soldierGroup.add(soldier.mesh);
      this.aiSoldiers.push(soldier);
    }

    for (const t of this.aiTanks) {
      if (t.mesh) t.mesh.visible = false;
    }
  }

  _updateAiKaijuBattle(dt, kaiju) {
    const kPos = kaiju.position;
    const chestPos = kaiju.chestCore ? kaiju.chestCore() : new THREE.Vector3(kPos.x, kPos.y + 45, kPos.z);

    const targetSoldiers = 20;
    while (this.aiSoldiers.length < targetSoldiers) {
      const idx = this.aiSoldiers.length;
      const angle = (idx / targetSoldiers) * Math.PI * 2 + (Math.random() * 0.3 - 0.15);
      const radius = 65 + (idx % 4) * 28;
      const sx = kPos.x + Math.sin(angle) * radius;
      const sz = kPos.z + Math.cos(angle) * radius;
      const sy = getBeijingTerrainElevation(sx, sz) + 0.12;

      const weaponType = idx % 4 === 0 ? 'RPG' : 'RIFLE';
      const soldier = {
        mesh: createArmySoldierModel(weaponType),
        pos: new THREE.Vector3(sx, sy, sz),
        yaw: angle + Math.PI,
        fireCooldown: 0.8 + Math.random() * 1.5,
        weaponType,
        state: 'battle',
        alive: true,
      };
      soldier.mesh.position.copy(soldier.pos);
      this.soldierGroup.add(soldier.mesh);
      this.aiSoldiers.push(soldier);
    }

    const targetTanks = 3;
    while (this.aiTanks.length < targetTanks) {
      const idx = this.aiTanks.length;
      const angle = (idx / targetTanks) * Math.PI * 2 + 0.5;
      const radius = 95 + idx * 30;
      const tx = kPos.x + Math.sin(angle) * radius;
      const tz = kPos.z + Math.cos(angle) * radius;
      const ty = getBeijingTerrainElevation(tx, tz) + 0.15;

      const tankMesh = createVehicleModel('tank');
      if (!tankMesh) break;
      tankMesh.position.set(tx, ty, tz);
      this.tankGroup.add(tankMesh);

      this.aiTanks.push({
        mesh: tankMesh,
        pos: new THREE.Vector3(tx, ty, tz),
        turret: tankMesh.userData.turret,
        barrel: tankMesh.userData.barrel,
        muzzlePoint: tankMesh.userData.muzzlePoint,
        fireCooldown: 2.5 + idx * 1.8,
        alive: true,
      });
    }

    for (let i = this.aiSoldiers.length - 1; i >= 0; i--) {
      const s = this.aiSoldiers[i];
      if (!s.alive) continue;

      const dx = chestPos.x - s.pos.x;
      const dz = chestPos.z - s.pos.z;
      const distToKaiju = Math.hypot(dx, dz);
      s.yaw = Math.atan2(dx, dz);
      s.mesh.rotation.y = s.yaw;

      const dy = chestPos.y - s.pos.y;
      const pitchUp = -Math.atan2(dy, distToKaiju) * 0.85;
      if (s.mesh.userData.rightArm) s.mesh.userData.rightArm.rotation.x = pitchUp - 0.3;
      if (s.mesh.userData.leftArm) s.mesh.userData.leftArm.rotation.x = pitchUp - 0.25;

      if (distToKaiju < 28) {
        this._detonateSoldierRagdoll(s);
        continue;
      }

      s.fireCooldown -= dt;
      if (s.fireCooldown <= 0) {
        if (s.weaponType === 'RPG') {
          s.fireCooldown = 6.5 + Math.random() * 2.0;
          this._aiSoldierFireRpg(s, chestPos, kaiju);
        } else {
          s.fireCooldown = 1.6 + Math.random() * 1.2;
          this._aiSoldierFireRifle(s, chestPos, kaiju);
        }
      }
    }

    for (const t of this.aiTanks) {
      if (!t.alive || !t.mesh) continue;
      t.mesh.visible = true;

      if (t.turret) {
        const localChest = t.mesh.worldToLocal(chestPos.clone());
        const tYaw = Math.atan2(localChest.x, localChest.z);
        t.turret.rotation.y = THREE.MathUtils.lerp(t.turret.rotation.y, tYaw, 4.0 * dt);
        if (t.barrel) {
          const tPitch = -Math.atan2(localChest.y, Math.hypot(localChest.x, localChest.z));
          t.barrel.rotation.x = THREE.MathUtils.clamp(tPitch, -0.42, 0.1);
        }
      }

      t.fireCooldown -= dt;
      if (t.fireCooldown <= 0) {
        t.fireCooldown = 4.8 + Math.random() * 1.6;
        this._aiTankFire(t, chestPos, kaiju);
      }
    }
  }

  _aiSoldierFireRifle(s, chestPos, kaiju) {
    const muzzle = s.mesh.userData.muzzlePoint;
    const origin = new THREE.Vector3();
    if (muzzle) muzzle.getWorldPosition(origin); else origin.copy(s.pos).add(new THREE.Vector3(0, 1.4, 0.3));

    const dir = new THREE.Vector3().subVectors(chestPos, origin).normalize();
    this._spawnMuzzleFlash(origin, 0.08, 0xffcc33);
    getWeaponSfx(this.app).play('cannon', { gain: 0.18 });

    const tracerGeom = new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6);
    tracerGeom.rotateX(HALF_PI);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd044 });
    const tracerMesh = new THREE.Mesh(tracerGeom, tracerMat);
    tracerMesh.position.copy(origin);
    tracerMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(tracerMesh);

    this.projectiles.push({
      mesh: tracerMesh,
      pos: origin.clone(),
      dir,
      speed: 550,
      distTraveled: 0,
      maxDist: origin.distanceTo(chestPos),
      damage: 0,
      kaijuDamage: 2.8,   // ~2.8 dmg chip per burst
      hitTarget: { kind: 'kaiju' },
      isRocket: false,
    });
  }

  _aiSoldierFireRpg(s, chestPos, kaiju) {
    const muzzle = s.mesh.userData.muzzlePoint;
    const origin = new THREE.Vector3();
    if (muzzle) muzzle.getWorldPosition(origin); else origin.copy(s.pos).add(new THREE.Vector3(0, 1.5, 0.3));

    const dir = new THREE.Vector3().subVectors(chestPos, origin).normalize();
    this._spawnMuzzleFlash(origin, 0.22, 0xff6611);
    getWeaponSfx(this.app).play('missileLaunch', { gain: 0.45 });

    const rocketMesh = createRpgModel();
    rocketMesh.scale.setScalar(0.7);
    rocketMesh.position.copy(origin);
    rocketMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(rocketMesh);

    this.projectiles.push({
      mesh: rocketMesh,
      pos: origin.clone(),
      dir,
      speed: 175,
      distTraveled: 0,
      maxDist: origin.distanceTo(chestPos),
      damage: 0.5,
      kaijuDamage: 45.0,  // ~45 dmg chip
      splashRadius: 6.0,
      hitTarget: { kind: 'kaiju' },
      isRocket: true,
      smokeTimer: 0,
    });
  }

  _aiTankFire(t, chestPos, kaiju) {
    const origin = new THREE.Vector3();
    if (t.muzzlePoint) t.muzzlePoint.getWorldPosition(origin); else origin.copy(t.pos).add(new THREE.Vector3(0, 2.0, 3.5));

    const dir = new THREE.Vector3().subVectors(chestPos, origin).normalize();
    this._spawnMuzzleFlash(origin, 0.45, 0xff9900);
    getWeaponSfx(this.app).play('cannon', { gain: 0.65 });
    getWeaponSfx(this.app).play('explosion', { gain: 0.55 });

    const shellGeom = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8);
    shellGeom.rotateX(HALF_PI);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
    const shellMesh = new THREE.Mesh(shellGeom, shellMat);
    shellMesh.position.copy(origin);
    shellMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(shellMesh);

    this.projectiles.push({
      mesh: shellMesh,
      pos: origin.clone(),
      dir,
      speed: 350,
      distTraveled: 0,
      maxDist: origin.distanceTo(chestPos),
      damage: 1.0,
      kaijuDamage: 140.0, // ~140 dmg chip
      splashRadius: 10.0,
      hitTarget: { kind: 'kaiju' },
      isTankShell: true,
      smokeTimer: 0,
    });
  }

  _detonateSoldierRagdoll(s) {
    s.alive = false;
    this.soldierGroup.remove(s.mesh);

    const parts = [
      { geom: new THREE.SphereGeometry(0.14, 8, 6), col: 0x3d4a36, pos: new THREE.Vector3(0, 1.6, 0) },
      { geom: new THREE.BoxGeometry(0.38, 0.45, 0.22), col: 0x48583c, pos: new THREE.Vector3(0, 1.2, 0) },
      { geom: new THREE.BoxGeometry(0.12, 0.44, 0.12), col: 0x36442e, pos: new THREE.Vector3(-0.25, 1.2, 0) },
      { geom: new THREE.BoxGeometry(0.12, 0.44, 0.12), col: 0x36442e, pos: new THREE.Vector3(0.25, 1.2, 0) },
      { geom: new THREE.BoxGeometry(0.14, 0.48, 0.14), col: 0x2e3826, pos: new THREE.Vector3(-0.12, 0.5, 0) },
      { geom: new THREE.BoxGeometry(0.14, 0.48, 0.14), col: 0x2e3826, pos: new THREE.Vector3(0.12, 0.5, 0) },
    ];

    for (const p of parts) {
      const mat = new THREE.MeshStandardMaterial({ color: p.col, roughness: 0.7 });
      const mesh = new THREE.Mesh(p.geom, mat);
      mesh.position.copy(s.pos).add(p.pos);
      this.app.scene.add(mesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8.0,
        4.0 + Math.random() * 5.0,
        (Math.random() - 0.5) * 8.0
      );
      this.aiRagdolls.push({
        mesh,
        geom: p.geom,
        mat,
        pos: mesh.position,
        vel,
        rotVel: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        groundY: s.pos.y,
        life: 0,
      });
    }

    setTimeout(() => {
      const idx = this.aiSoldiers.indexOf(s);
      if (idx >= 0) this.aiSoldiers.splice(idx, 1);
    }, 4500);
  }

  update(dt) {
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.rpgQuickTimer > 0) this.rpgQuickTimer -= dt;
    if (this.tankCannonTimer > 0) this.tankCannonTimer -= dt;

    const isWalk = this.app.mode === 'walk';
    const isDrive = this.app.mode === 'drive';
    const isTank = isDrive && this.app.vehicleMesh && this.app.vehicleMesh.userData && this.app.vehicleMesh.userData.isTank;

    if (this.reticleEl) {
      this.reticleEl.style.display = (isWalk || isTank) ? 'block' : 'none';
    }
    if (this.weaponBadgeEl) {
      this.weaponBadgeEl.style.display = isWalk ? 'block' : 'none';
    }

    if (isWalk && this.isFiring) {
      this.fireCurrentWeapon();
    }

    if (isWalk) {
      this._updateWalkerAimPose();
    }

    if (isTank) {
      this._updateTankTurretAim(dt);
    }

    this._updateProjectiles(dt);
    this._updateBeams(dt);
    this._updateExplosions(dt);
    this._updateAiMilitary(dt);
    this._updateRagdolls(dt);
  }

  _updateWalkerAimPose() {
    const avatar = this.app.avatarMesh || this.app.walker;
    if (!avatar || !avatar.userData) return;
    const { rightArm, leftArm } = avatar.userData;
    if (!rightArm) return;

    const pitch = this.app.camPitch || 0.2;
    const armPitch = -HALF_PI + (pitch - 0.2) * 0.95;

    if (!this.app._punchTimer || this.app._punchTimer <= 0) {
      rightArm.rotation.x = armPitch;
      rightArm.rotation.y = 0;
      rightArm.rotation.z = -0.08;

      if (leftArm) {
        leftArm.rotation.x = armPitch + 0.12;
        leftArm.rotation.y = -0.38;
        leftArm.rotation.z = 0.15;
      }
    }
  }

  _updateTankTurretAim(dt) {
    const mesh = this.app.vehicleMesh;
    if (!mesh || !mesh.userData) return;
    const { turret, barrel } = mesh.userData;
    if (!turret) return;

    const ray = this.getAimRay();
    const hit = this.raycastAim(ray, 1000);
    const localAim = mesh.worldToLocal(hit.point.clone());

    const targetTurretYaw = Math.atan2(localAim.x, localAim.z);
    turret.rotation.y = THREE.MathUtils.lerp(turret.rotation.y, targetTurretYaw, Math.min(1, 8.0 * dt));

    if (barrel) {
      const targetPitch = -Math.atan2(localAim.y - 0.35, Math.hypot(localAim.x, localAim.z));
      barrel.rotation.x = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(barrel.rotation.x, targetPitch, Math.min(1, 8.0 * dt)),
        -0.38,
        0.14
      );
    }
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const step = p.speed * dt;
      p.distTraveled += step;
      p.pos.addScaledVector(p.dir, step);
      p.mesh.position.copy(p.pos);

      if (p.isRocket || p.isTankShell) {
        p.smokeTimer = (p.smokeTimer || 0) + dt;
        if (p.smokeTimer > 0.04) {
          p.smokeTimer = 0;
          this._spawnSmokePuff(p.pos.clone());
        }
      }

      if (p.distTraveled >= p.maxDist) {
        this.app.scene.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();

        this._applyImpact(p.pos, p.hitTarget, p.damage, p.splashRadius || 0, p.kaijuDamage || 0);
        const radius = p.isTankShell ? 12.0 : p.isRocket ? 8.5 : 1.2;
        this._spawnExplosion(p.pos, radius, p.isTankShell ? 0xff5500 : p.isRocket ? 0xff7711 : 0xffcc33);

        this.projectiles.splice(i, 1);
      }
    }
  }

  _spawnSmokePuff(pos) {
    const geom = new THREE.SphereGeometry(0.35 + Math.random() * 0.25, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.65 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    this.app.scene.add(mesh);

    this.explosions.push({
      mesh,
      mat,
      maxRadius: 1.8,
      age: 0,
      duration: 0.45,
    });
  }

  _updateBeams(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      const progress = b.life / b.maxLife;
      b.mat.opacity = progress * 0.95;
      if (b.life <= 0) {
        this.app.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mat.dispose();
        this.beams.splice(i, 1);
      }
    }
  }

  _updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.age += dt;
      const p = e.age / e.duration;
      if (p >= 1.0) {
        this.app.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mat.dispose();
        this.explosions.splice(i, 1);
      } else {
        const scale = 1.0 + p * (e.maxRadius || 3.0);
        e.mesh.scale.setScalar(scale);
        e.mat.opacity = (1.0 - p) * 0.85;
      }
    }
  }

  _updateRagdolls(dt) {
    for (let i = this.aiRagdolls.length - 1; i >= 0; i--) {
      const r = this.aiRagdolls[i];
      r.life += dt;
      if (r.life > 4.5) {
        this.app.scene.remove(r.mesh);
        r.geom.dispose();
        r.mat.dispose();
        this.aiRagdolls.splice(i, 1);
        continue;
      }

      r.vel.y -= 18.0 * dt;
      r.pos.addScaledVector(r.vel, dt);
      if (r.pos.y <= r.groundY + 0.08) {
        r.pos.y = r.groundY + 0.08;
        r.vel.set(0, 0, 0);
      }
      r.mesh.position.copy(r.pos);
      r.mesh.rotation.x += r.rotVel.x * dt;
      r.mesh.rotation.y += r.rotVel.y * dt;
      r.mesh.rotation.z += r.rotVel.z * dt;
    }
  }

  onModeChange(newMode, prevMode) {
    if (this.reticleEl) {
      const isTank = newMode === 'drive' && this.app.vehicleMesh?.userData?.isTank;
      this.reticleEl.style.display = (newMode === 'walk' || isTank) ? 'block' : 'none';
    }
    if (this.weaponBadgeEl) {
      this.weaponBadgeEl.style.display = newMode === 'walk' ? 'block' : 'none';
    }
    this.isFiring = false;
  }
}

export function initWalkerWeapons(app) {
  return new WalkerWeaponsSystem(app);
}
