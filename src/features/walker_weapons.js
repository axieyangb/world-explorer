// Walker Weapons System & Military Defense (World Explorer)
import * as THREE from '../../vendor/three.module.js';
import { getWeaponSfx } from './weapon_sfx.js';
import { getBeijingTerrainElevation } from '../environment.js';
import { createVehicleModel, createHelicopterModel } from '../entities.js';
import { createWeaponModel } from './weapon_models.js'; // [weapon-pickups]
import { t as tr } from '../i18n.js'; // [weapon-pickups]
import { startRagdoll, stepRagdoll } from './ped_ragdoll.js'; // [polish] connected soldier ragdoll

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

// [weapon-pickups] On foot the player starts unarmed ('FISTS') and owns only what it picks up. mag = magazine
// size, start = rounds in reserve on the first pickup, add = rounds a repeat pickup / ammo box adds, cap = most
// rounds carried in reserve, reload = seconds.
export const WEAPON_AMMO = {
  RIFLE: { mag: 30, start: 90, add: 60, box: 60, cap: 300, reload: 1.6 },
  RPG: { mag: 1, start: 3, add: 2, box: 2, cap: 10, reload: 2.1 },
  RAILGUN: { mag: 4, start: 8, add: 4, box: 4, cap: 24, reload: 2.0 },
};
const HOLD_FIRE_MS = 170; // a still press held this long starts automatic fire
const DRAG_PX = 6;        // pointer travel that turns a press into a camera drag

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

  // Sculpted anatomical pelvis, ribcage & deltoid shoulders (replaces blocky Lego BoxGeometry)
  const pelvisGeo = new THREE.SphereGeometry(0.165, 10, 8);
  pelvisGeo.scale(1.05, 0.68, 0.68);
  const pelvisMesh = new THREE.Mesh(pelvisGeo, darkFatigueMat);
  pelvisMesh.position.set(0, 0.03, 0);
  hips.add(pelvisMesh);

  const torsoGeo = new THREE.CylinderGeometry(0.185, 0.148, 0.48, 12, 2);
  torsoGeo.scale(1.06, 1.0, 0.68);
  const torso = new THREE.Mesh(torsoGeo, camoUniformMat);
  torso.position.set(0, 0.28, 0);
  hips.add(torso);

  const vestGeo = new THREE.CylinderGeometry(0.198, 0.175, 0.38, 12, 1);
  vestGeo.scale(1.06, 1.0, 0.74);
  const plateCarrier = new THREE.Mesh(vestGeo, tacticalVestMat);
  plateCarrier.position.set(0, 0.29, 0);
  hips.add(plateCarrier);

  for (const sx of [-0.10, 0, 0.10]) {
    const pouchGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.13, 8);
    pouchGeo.scale(1.0, 1.0, 0.72);
    const pouch = new THREE.Mesh(pouchGeo, tacticalVestMat);
    pouch.position.set(sx, 0.22, 0.145);
    hips.add(pouch);
  }

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0);
  hips.add(headGroup);

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.11, 10), skinMat);
  neckMesh.position.set(0, -0.07, -0.005);
  headGroup.add(neckMesh);

  const headGeo = new THREE.SphereGeometry(0.108, 12, 10);
  headGeo.scale(0.88, 1.08, 0.96);
  const head = new THREE.Mesh(headGeo, skinMat);
  headGroup.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.142, 12, 9), helmetMat);
  helmet.scale.set(0.96, 0.92, 1.06);
  helmet.position.set(0, 0.045, -0.005);
  headGroup.add(helmet);

  const goggleGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.046, 10, 1, false, -0.9, 1.8);
  const goggles = new THREE.Mesh(goggleGeo, goggleMat);
  goggles.position.set(0, 0.035, 0.03);
  headGroup.add(goggles);

  const buildSculptedArm = (side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.23, 1.42, 0);
    const shBall = new THREE.Mesh(new THREE.SphereGeometry(0.058, 9, 7), camoUniformMat);
    arm.add(shBall);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.045, 0.26, 10), camoUniformMat);
    upper.position.set(0, -0.13, 0);
    arm.add(upper);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 6), camoUniformMat);
    elbow.position.set(0, -0.26, 0);
    arm.add(elbow);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.033, 0.24, 10), camoUniformMat);
    fore.position.set(0, -0.37, 0.02);
    arm.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), skinMat);
    hand.scale.set(0.8, 1.15, 0.95);
    hand.position.set(0, -0.49, 0.03);
    arm.add(hand);
    return arm;
  };

  const leftArm = buildSculptedArm(-1);
  root.add(leftArm);
  const rightArm = buildSculptedArm(1);
  root.add(rightArm);

  const buildSculptedLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.105, 0.90, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.058, 0.42, 10), darkFatigueMat);
    thigh.position.set(0, -0.21, 0);
    leg.add(thigh);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.056, 9, 7), darkFatigueMat);
    knee.position.set(0, -0.42, 0.005);
    leg.add(knee);
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.040, 0.38, 10), darkFatigueMat);
    calf.position.set(0, -0.61, 0);
    leg.add(calf);
    const bootGeo = new THREE.SphereGeometry(0.065, 10, 8);
    bootGeo.scale(0.82, 0.62, 1.85);
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, -0.84, 0.045);
    leg.add(boot);
    return leg;
  };

  const leftLeg = buildSculptedLeg(-1);
  root.add(leftLeg);
  const rightLeg = buildSculptedLeg(1);
  root.add(rightLeg);

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

// Shared geometries for projectiles and particles to prevent per-frame allocation / memory leak
const SHARED_SMOKE_GEOM = new THREE.SphereGeometry(0.4, 6, 6);
const SHARED_FLASH_GEOM = new THREE.SphereGeometry(1.0, 8, 6);
const SHARED_EXPLOSION_GEOM = new THREE.SphereGeometry(1.0, 10, 8);
const SHARED_TRACER_GEOM = new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6);
SHARED_TRACER_GEOM.rotateX(HALF_PI);
const SHARED_SHELL_GEOM = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8);
SHARED_SHELL_GEOM.rotateX(HALF_PI);

// [polish] Soldier limb groups for the connected ragdoll (origins in the rest pose, root space, unscaled),
// in the order of _detonateSoldierRagdoll's body.groups.
const SOLDIER_RAG_SPECS = [
  { name: 'torso', ox: 0, oy: 0.9, oz: 0 }, { name: 'head', ox: 0, oy: 1.52, oz: 0 },
  { name: 'armL', ox: -0.28, oy: 1.42, oz: 0 }, { name: 'armR', ox: 0.28, oy: 1.42, oz: 0 },
  { name: 'legL', ox: -0.13, oy: 0.9, oz: 0 }, { name: 'legR', ox: 0.13, oy: 0.9, oz: 0 },
];


export class WalkerWeaponsSystem {
  constructor(app) {
    this.app = app;
    this.activeWeapon = 'FISTS'; // [weapon-pickups] unarmed until something is picked up
    this.inventory = {};         // id -> { mag, reserve }
    this.reloadTimer = 0;
    this.reloadWeapon = null;
    this._press = null;
    this._hint = '';
    this._wasUnlimited = false;
    this._badgeKey = '';
    this.fireTimer = 0;
    this.rpgQuickTimer = 0;
    this.tankCannonTimer = 0;
    this.tankRocketTimer = 0;
    this.isFiring = false;
    this.reticleEl = null;
    this.weaponBadgeEl = null;

    this.reticleX = 50;
    this.reticleY = 44;
    this._pointerMoveBound = false;

    this.projectiles = [];
    this.beams = [];
    this.explosions = [];

    this._raycaster = new THREE.Raycaster();

    this.aiSoldiers = [];
    this.aiTanks = [];
    this.aiRagdolls = [];
    this.aiHeli = null;

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
        'top:44%',
        'width:44px',
        'height:44px',
        'transform:translate(-50%,-50%)',
        'pointer-events:none',
        'z-index:22',
        'display:none',
        'transition:none',
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
    this.reticleEl.style.left = `${this.reticleX}%`;
    this.reticleEl.style.top = `${this.reticleY}%`;

    if (typeof window !== 'undefined' && !this._pointerMoveBound) {
      this._pointerMoveBound = true;
      window.addEventListener('pointermove', (e) => {
        if (!this.isAimingMode() || this._civilianWalk()) return;
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        const xPct = (e.clientX / w) * 100;
        const yPct = (e.clientY / h) * 100;
        this.setReticle(xPct, yPct);
      }, { passive: true });
    }

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

  // [weapon-pickups] The pill shows the weapon, the magazine / reserve count (or RELOADING), and the nearest
  // pickup hint. Rebuilt only when its text changes.
  _updateWeaponBadge() {
    if (!this.weaponBadgeEl) return;
    const zh = this.app.getLang ? this.app.getLang() === 'zh' : false;
    let key, html;
    if (!this.isArmed()) {
      key = `F|${zh}|${this._hint}`;
      html = `<span style="color:#ffcc33;margin-right:6px;">[F]</span>${tr('wp_fists')}`;
    } else {
      const w = WALKER_WEAPONS[this.activeWeapon];
      const name = zh ? w.nameZh : w.name.toUpperCase();
      const inv = this.inventory[this.activeWeapon];
      let ammo;
      if (this._unlimited()) ammo = '∞';
      else if (this.reloadTimer > 0) ammo = `<span style="color:#ffcc33">${tr('wp_reloading')}</span>`;
      else if (inv) ammo = `<b style="color:${inv.mag === 0 ? '#ff6b5a' : '#fff'}">${inv.mag}</b><span style="opacity:0.6"> / ${inv.reserve}</span>`;
      else ammo = '';
      key = `${this.activeWeapon}|${zh}|${ammo}|${this._hint}`;
      html = `<span style="color:#ffcc33;margin-right:6px;">[R]</span>${name}<span style="margin-left:10px;font-variant-numeric:tabular-nums;">${ammo}</span>`;
    }
    if (this._hint) html += `<div style="font-weight:500;font-size:11px;letter-spacing:0.3px;opacity:0.85;margin-top:2px;text-align:center;">${this._hint}</div>`;
    if (key === this._badgeKey) return;
    this._badgeKey = key;
    this.weaponBadgeEl.innerHTML = html;
  }

  /** [weapon-pickups] Second line in the weapon pill (nearest pickup); '' clears it. */
  setPickupHint(text) {
    if (text === this._hint) return;
    this._hint = text || '';
    this._updateWeaponBadge();
  }

  /** Kaiju Defense keeps the soldier fully armed with endless ammo. */
  _unlimited() {
    return Boolean(this.app.kaiju && this.app.kaiju.active);
  }

  isArmed() {
    return this.activeWeapon !== 'FISTS';
  }

  // Walking empty-handed (no reticle, no aim pose).
  _civilianWalk() {
    return this.app.mode === 'walk' && !this.isArmed();
  }

  _hasAmmo(id) {
    if (this._unlimited()) return true;
    const inv = this.inventory[id];
    return Boolean(inv && inv.mag + inv.reserve > 0);
  }

  _setWeapon(id) {
    if (id === this.activeWeapon) return;
    this.activeWeapon = id;
    this.reloadTimer = 0;
    this.reloadWeapon = null;
    this.fireTimer = Math.max(this.fireTimer, 0.25); // raise / holster time
    if (id === 'FISTS') {
      // Drop the aim pose; main.js swings the arms from here on.
      const ud = (this.app.avatarMesh || this.app.walker)?.userData;
      for (const arm of [ud?.leftArm, ud?.rightArm]) if (arm) arm.rotation.set(0, 0, 0);
    }
    this._updateRigWeaponVisibility();
    this._updateWeaponBadge();
  }

  /** Back to an empty-handed civilian (new city / new game). */
  resetInventory() {
    this.inventory = {};
    this.isFiring = false;
    this._press = null;
    this._setWeapon('FISTS');
  }

  /**
   * Adds a pickup ('RIFLE' | 'RPG' | 'RAILGUN' | 'AMMO') to the inventory. Returns the toast text, or null
   * when it cannot be taken (ammo with no gun to load, or reserves already full).
   */
  collectPickup(kind) {
    const zh = this.app.getLang ? this.app.getLang() === 'zh' : false;
    const nm = (id) => (zh ? WALKER_WEAPONS[id].nameZh : WALKER_WEAPONS[id].name);
    if (kind === 'AMMO') {
      const parts = [];
      for (const id of WEAPON_KEYS) {
        const inv = this.inventory[id];
        if (!inv) continue;
        const A = WEAPON_AMMO[id];
        const add = Math.min(A.box, A.cap - inv.reserve);
        if (add <= 0) continue;
        inv.reserve += add;
        parts.push(`${nm(id)} +${add}`);
      }
      if (!parts.length) return null;
      if (!this.isArmed() || !this._hasAmmo(this.activeWeapon)) this._autoSwitch(true);
      this._updateWeaponBadge();
      return `${tr('wp_ammo_box')} · ${parts.join(' · ')}`;
    }
    const A = WEAPON_AMMO[kind];
    if (!A) return null;
    let msg;
    const inv = this.inventory[kind];
    if (!inv) {
      this.inventory[kind] = { mag: A.mag, reserve: A.start };
      msg = `${nm(kind)} · ${A.mag}/${A.start}`;
    } else {
      const add = Math.min(A.add, A.cap - inv.reserve);
      if (add <= 0) return null;
      inv.reserve += add;
      msg = tr('wp_plus_rounds', { name: nm(kind), n: add });
    }
    // Pick up and ready a new gun when empty-handed (or holding an empty one).
    if (!this.isArmed() || !this._hasAmmo(this.activeWeapon)) this._setWeapon(kind);
    this._updateWeaponBadge();
    return msg;
  }

  // Next weapon with ammo after the current one (fists close the cycle); `prefer` skips fists if a gun has ammo.
  _nextWeapon(prefer = false) {
    const order = this._unlimited() ? WEAPON_KEYS : ['FISTS', ...WEAPON_KEYS];
    const i0 = order.indexOf(this.activeWeapon);
    for (let k = 1; k <= order.length; k++) {
      const id = order[(Math.max(0, i0) + k) % order.length];
      if (id === 'FISTS') { if (!prefer) return id; continue; }
      if (this._hasAmmo(id)) return id;
    }
    return this._unlimited() ? 'RIFLE' : 'FISTS';
  }

  _autoSwitch(prefer = true) {
    this._setWeapon(this._nextWeapon(prefer));
  }

  /** R: reload when the magazine is not full and rounds are left, otherwise switch weapon. */
  reloadOrCycle() {
    const inv = this.inventory[this.activeWeapon];
    if (this.isArmed() && !this._unlimited() && inv && this.reloadTimer <= 0 && inv.mag < WEAPON_AMMO[this.activeWeapon].mag && inv.reserve > 0) {
      this.startReload();
      return;
    }
    this.cycleWeapon();
  }

  startReload() {
    const id = this.activeWeapon;
    const inv = this.inventory[id];
    if (!inv || this._unlimited() || this.reloadTimer > 0 || inv.reserve <= 0 || inv.mag >= WEAPON_AMMO[id].mag) return false;
    this.reloadTimer = WEAPON_AMMO[id].reload;
    this.reloadWeapon = id;
    getWeaponSfx(this.app).play('spark', { gain: 0.22 });
    this._updateWeaponBadge();
    return true;
  }

  _updateReload(dt) {
    if (this.reloadTimer <= 0) return;
    if (this.reloadWeapon !== this.activeWeapon) { this.reloadTimer = 0; return; }
    this.reloadTimer -= dt;
    if (this.reloadTimer > 0) return;
    this.reloadTimer = 0;
    const inv = this.inventory[this.reloadWeapon];
    if (inv) {
      const n = Math.min(WEAPON_AMMO[this.reloadWeapon].mag - inv.mag, inv.reserve);
      inv.mag += n;
      inv.reserve -= n;
    }
    this.reloadWeapon = null;
    getWeaponSfx(this.app).play('spark', { gain: 0.3 });
    this._updateWeaponBadge();
  }

  // Spends one round of the active weapon; false (and reload / switch) when the magazine is empty.
  _consumeRound() {
    if (this._unlimited()) return true;
    const inv = this.inventory[this.activeWeapon];
    if (!inv) return false;
    if (inv.mag <= 0) {
      if (!this.startReload() && this.reloadTimer <= 0) this._autoSwitch(true);
      return false;
    }
    inv.mag--;
    if (inv.mag === 0) {
      if (inv.reserve > 0) this.startReload();
      else this._autoSwitch(true); // out of everything for this gun: next loaded gun, else fists
    }
    this._updateWeaponBadge();
    return true;
  }

  // ---- [weapon-pickups] deliberate mouse attacks (walk mode, outside Kaiju Defense) ----
  // A press only attacks if the pointer stays still: a quick click fires one shot (or punches when unarmed),
  // holding still for HOLD_FIRE_MS starts automatic fire, and any drag is camera look and never attacks.
  // The first press after the window gains focus (`ignore`) never fires a quick click, but a deliberate still
  // hold does start auto fire. Once auto fire runs, moving the mouse aims (orbits) and keeps firing (GTA).
  beginPress(button, x, y, ignore = false) {
    this._press = { button, x, y, t: performance.now(), ignore, moved: false, holding: false };
  }

  movePress(x, y) {
    const P = this._press;
    if (!P || P.moved || P.holding) return;
    if (Math.abs(x - P.x) + Math.abs(y - P.y) > DRAG_PX) P.moved = true;
  }

  endPress(button) {
    const P = this._press;
    if (!P || P.button !== button) return;
    this._press = null;
    if (P.holding) { this.isFiring = false; return; }
    if (P.ignore || P.moved || performance.now() - P.t > 600) return;
    if (button === 0) {
      if (this.isArmed()) this.fireCurrentWeapon();
      else if (this.app.triggerPlayerPunch) this.app.triggerPlayerPunch();
    } else if (button === 2) {
      this.quickFireRpg();
    }
  }

  cancelPress() {
    if (this._press && this._press.holding) this.isFiring = false;
    this._press = null;
  }

  _updatePress() {
    const P = this._press;
    if (!P || P.moved || P.holding || P.button !== 0) return;
    if (!this.isArmed() || this.app.mode !== 'walk') return;
    if (performance.now() - P.t >= (P.ignore ? HOLD_FIRE_MS * 2 : HOLD_FIRE_MS)) {
      P.holding = true;
      this.isFiring = true;
    }
  }

  /** Kaiju soldier hold-to-fire hooks (kaiju_mode.js calls these when present). */
  startFiring() {
    if (!this.isArmed()) return false;
    this.isFiring = true;
    this.fireCurrentWeapon();
    return true;
  }

  stopFiring() {
    this.isFiring = false;
  }

  _initPlayerWeaponGroup() {
    const avatar = this.app.avatarMesh || this.app.walker;
    if (!avatar) return;

    this.weaponRig = new THREE.Group();
    // Rotate weaponRig so weapon barrel points forward along arm direction
    this.weaponRig.rotation.x = HALF_PI;

    // [weapon-pickups] detailed models (same hand anchors as the old ones; child order rifle/RPG/railgun is
    // what hero_avatar's grip table indexes).
    this.rifleMesh = createWeaponModel('RIFLE');
    this.rpgMesh = createWeaponModel('RPG');
    this.railgunMesh = createWeaponModel('RAILGUN');

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
    this.weaponRig.visible = this.isArmed(); // [weapon-pickups] unarmed: nothing in the hand
    if (this.rifleMesh) this.rifleMesh.visible = this.activeWeapon === 'RIFLE';
    if (this.rpgMesh) this.rpgMesh.visible = this.activeWeapon === 'RPG';
    if (this.railgunMesh) this.railgunMesh.visible = this.activeWeapon === 'RAILGUN';
  }

  // [weapon-pickups] Cycles fists -> owned weapons with ammo (all three, no fists, in Kaiju Defense).
  cycleWeapon() {
    const next = this._nextWeapon(false);
    if (next === this.activeWeapon) return;
    this._setWeapon(next);
    getWeaponSfx(this.app).play('spark', { gain: 0.3 });
  }

  setReticle(xPct, yPct) {
    this.reticleX = THREE.MathUtils.clamp(xPct, 8, 92);
    this.reticleY = THREE.MathUtils.clamp(yPct, 8, 88);
    if (this.reticleEl) {
      this.reticleEl.style.left = `${this.reticleX}%`;
      this.reticleEl.style.top = `${this.reticleY}%`;
    }
  }

  moveReticle(deltaXPct, deltaYPct) {
    this.setReticle(this.reticleX + deltaXPct, this.reticleY + deltaYPct);
  }

  _reticleNdc() {
    const ndcX = (this.reticleX / 100) * 2 - 1;
    const ndcY = -((this.reticleY / 100) * 2 - 1);
    return { x: ndcX, y: ndcY };
  }

  getAimRay() {
    const cam = this.app.camera;
    const ndc = this._reticleNdc();
    this._raycaster.setFromCamera(ndc, cam);
    return this._raycaster.ray;
  }

  _computeAimPoint(maxDist = 1400) {
    const ray = this.getAimRay();
    const hit = this.raycastAim(ray, maxDist);
    return hit.point;
  }

  computeAimPoint(maxDist = 1400) {
    return this._computeAimPoint(maxDist);
  }

  isAimingMode() {
    const isWalk = this.app.mode === 'walk';
    const isTank = typeof this.app.isDrivingTank === 'function'
      ? this.app.isDrivingTank()
      : Boolean(this.app.mode === 'drive' && this.app.vehicleMesh && this.app.vehicleMesh.userData && this.app.vehicleMesh.userData.isTank);
    const isKaijuSoldierOrTank = Boolean(
      this.app.kaiju &&
      this.app.kaiju.active &&
      (this.app.kaiju.activeUnit === 'soldier' || this.app.kaiju.activeUnit === 'tank')
    );
    return isWalk || isTank || isKaijuSoldierOrTank;
  }

  _isTyping() {
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    return Boolean(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT'));
  }

  _canInteractVehicle() {
    if (this.app.mode === 'walk' && this.app.parkedHeli) {
      if (Math.hypot(this.app.pos.x - this.app.parkedHeli.x, this.app.pos.z - this.app.parkedHeli.z) < 12) return true;
    }
    return false;
  }

  _updateAimControls(dt) {
    if (!this.isAimingMode()) return;

    const keys = this.app.keys;
    const isTank = (typeof this.app.isDrivingTank === 'function' && this.app.isDrivingTank()) || (this.app.kaiju && this.app.kaiju.active && this.app.kaiju.activeUnit === 'tank');
    const minPitch = isTank ? -0.65 : -0.85;
    const maxPitch = 0.85;

    // 1. Keyboard target movement: Arrow keys & Q / E
    let reticleDx = 0;
    let reticleDy = 0;

    if (keys) {
      if (keys.has('ArrowLeft')) {
        reticleDx -= 55.0 * dt;
        this.app.camYaw += 1.4 * dt;
      }
      if (keys.has('ArrowRight')) {
        reticleDx += 55.0 * dt;
        this.app.camYaw -= 1.4 * dt;
      }
      if (keys.has('ArrowUp') || (keys.has('KeyQ') && !this._isTyping())) {
        reticleDy -= 48.0 * dt;
        this.app.camPitch = THREE.MathUtils.clamp(this.app.camPitch - 0.75 * dt, minPitch, maxPitch);
      }
      if (keys.has('ArrowDown') || (keys.has('KeyE') && !this._isTyping() && !this._canInteractVehicle())) {
        reticleDy += 48.0 * dt;
        this.app.camPitch = THREE.MathUtils.clamp(this.app.camPitch + 0.75 * dt, minPitch, maxPitch);
      }
    }

    if (reticleDx !== 0 || reticleDy !== 0) {
      this.moveReticle(reticleDx, reticleDy);
    }

    if (this._civilianWalk()) return; // [weapon-pickups] no reticle edge-steering while unarmed

    // 2. Edge camera steering & pitch when mouse reticle is near screen edges
    const leftMargin = 22.0;
    const rightMargin = 78.0;
    const topMargin = 22.0;
    const bottomMargin = 78.0;

    if (this.reticleX < leftMargin) {
      const factor = (leftMargin - this.reticleX) / (leftMargin - 8.0);
      this.app.camYaw += factor * 1.6 * dt;
    } else if (this.reticleX > rightMargin) {
      const factor = (this.reticleX - rightMargin) / (92.0 - rightMargin);
      this.app.camYaw -= factor * 1.6 * dt;
    }

    if (this.reticleY < topMargin) {
      const factor = (topMargin - this.reticleY) / (topMargin - 8.0);
      this.app.camPitch = THREE.MathUtils.clamp(this.app.camPitch - factor * 1.1 * dt, minPitch, maxPitch);
    } else if (this.reticleY > bottomMargin) {
      const factor = (this.reticleY - bottomMargin) / (88.0 - bottomMargin);
      this.app.camPitch = THREE.MathUtils.clamp(this.app.camPitch + factor * 1.1 * dt, minPitch, maxPitch);
    }
  }

  raycastAim(ray, maxDist = 1400) {
    const o = ray.origin;
    const d = ray.direction;
    const AIM_FALLBACK = Math.min(600, maxDist);
    let bestDist = maxDist;
    let hitResult = { dist: AIM_FALLBACK, point: o.clone().addScaledVector(d, AIM_FALLBACK), kind: 'air', ref: null };

    // 1. Kaiju
    const K = this.app.kaiju;
    if (K && K.active) {
      const living = K.getLivingKaijus ? K.getLivingKaijus() : (K.kaiju && K.kaiju.alive ? [K.kaiju] : []);
      for (let kIdx = 0; kIdx < living.length; kIdx++) {
        const mon = living[kIdx];
        if (typeof mon.raycast === "function") {
          const kh = mon.raycast(o, d, bestDist);
          if (kh && kh.dist < bestDist) {
            bestDist = kh.dist;
            hitResult = { dist: bestDist, point: kh.point, kind: "kaiju", ref: kh, weak: kh.weak, monster: mon };
          }
        }
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

    const lh = this.app.landmarks?.damage?.raycast(o, d, bestDist); // [landmark-damage]
    if (lh) { bestDist = lh.dist; hitResult = { dist: bestDist, point: lh.point.clone(), kind: 'landmark', ref: lh.ref }; } // [landmark-damage]

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
        const cy = (c.ry ?? c.y ?? 0) + 0.8;
        const cx = (c.rx ?? c.x) - o.x, cdy = cy - o.y, cz = (c.rz ?? c.z) - o.z;
        const along = cx * d.x + cdy * d.y + cz * d.z;
        if (along <= 1.0 || along >= bestDist) continue;
        const px = cx - d.x * along, py = cdy - d.y * along, pz = cz - d.z * along;
        if (px * px + py * py + pz * pz <= 2.4 * 2.4) {
          bestDist = along;
          hitResult = { dist: bestDist, point: o.clone().addScaledVector(d, bestDist), kind: 'car', car: c };
        }
      }
    }

    const pk = this.app.parkedCars && this.app.parkedCars.raycast(o, d, bestDist); // [parked-cars] the player's parked cars
    if (pk) { bestDist = pk.dist; hitResult = { dist: bestDist, point: o.clone().addScaledVector(d, bestDist), kind: 'parked', ref: null }; }

    // 4b. Airport Airliners (Parked & Active Boeing 787 / Airbus A350)
    if (this.app.airliner && typeof this.app.airliner.raycast === 'function') {
      const ah = this.app.airliner.raycast(o, d, bestDist);
      if (ah && ah.dist < bestDist) {
        bestDist = ah.dist;
        hitResult = { dist: bestDist, point: ah.point.clone(), kind: 'airliner', ref: ah.targetRef };
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
    const th = this.app.vegetation?.raycast?.(o, d, bestDist); // [tree-damage] trees stop bullets / rockets
    if (th) hitResult = { dist: (bestDist = th.dist), point: o.clone().addScaledVector(d, th.dist), kind: 'tree', ref: null }; // [tree-damage]

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
    if (this.fireTimer > 0) return false;
    const w = WALKER_WEAPONS[this.activeWeapon];
    if (!w) return false; // fists
    if (this.reloadTimer > 0) return false;
    if (!this._consumeRound()) return false; // [weapon-pickups] limited ammo

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
    // [weapon-pickups] Only with an RPG in the inventory: spends a rocket from its magazine, else its reserve.
    if (this.activeWeapon === 'RPG') { this.fireCurrentWeapon(); return; }
    if (!this._unlimited()) {
      const inv = this.inventory.RPG;
      if (!inv || inv.mag + inv.reserve <= 0) return;
      if (inv.mag > 0) inv.mag--;
      else inv.reserve--;
      this._updateWeaponBadge();
    }
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
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    const tracerMesh = new THREE.Mesh(SHARED_TRACER_GEOM, tracerMat);
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
      isSharedGeom: true,
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
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xffcc44, roughness: 0.3, metalness: 0.8 });
    const shellMesh = new THREE.Mesh(SHARED_SHELL_GEOM, shellMat);
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
      isSharedGeom: true,
    });
  }

  fireTankRocket() {
    if (this.tankRocketTimer > 0) return;
    const mesh = this.app.vehicleMesh;
    if (!mesh || !mesh.userData || !mesh.userData.isTank) return;

    this.tankRocketTimer = 1.15;
    getWeaponSfx(this.app).play('missileLaunch', { gain: 0.85 });

    const ray = this.getAimRay();
    const hit = this.raycastAim(ray, 1400);

    const podWorld = new THREE.Vector3();
    const turret = mesh.userData.turret;
    if (turret) {
      turret.getWorldPosition(podWorld);
      podWorld.y += 1.15;
      const side = (this._tankRocketSide = (this._tankRocketSide || 1) * -1);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(turret.quaternion);
      podWorld.addScaledVector(right, side * 1.35);
    } else {
      podWorld.copy(this.app.pos).add(new THREE.Vector3(0, 2.1, 0));
    }

    this._spawnMuzzleFlash(podWorld, 0.32, 0xff7722);

    const dir = new THREE.Vector3().subVectors(hit.point, podWorld).normalize();
    const rocketMesh = createRpgModel();
    rocketMesh.scale.setScalar(0.85);
    rocketMesh.position.copy(podWorld);
    rocketMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(rocketMesh);

    this.projectiles.push({
      mesh: rocketMesh,
      pos: podWorld.clone(),
      dir,
      speed: 210,
      distTraveled: 0,
      maxDist: hit.dist,
      damage: 1.2,
      splashRadius: 12.0,
      kaijuDamage: 650,
      hitTarget: hit,
      isRocket: true,
      smokeTimer: 0,
    });
  }

  _applyImpact(hitPos, hit, buildingUnits, splashRadius, kaijuDmg) {
    const K = this.app.kaiju;
    const D = K && K.destruction;

    if (hit && hit.kind === 'kaiju' && K) {
      const targetMonster = hit.monster || K.kaiju;
      targetMonster?.takeDamage?.(kaijuDmg, hitPos, hit.weak);
      this._spawnExplosion(hitPos, 4.2, 0xffaa33);
      getWeaponSfx(this.app).play('spark', { gain: 0.8 });
    }

    if (D && splashRadius > 0 && buildingUnits > 0) {
      if (hit && hit.kind === 'building' && hit.ref && typeof D.applyHeliHit === 'function') {
        D.applyHeliHit(hit.ref, buildingUnits);
      }
      if (typeof D.heliSplash === 'function') {
        D.heliSplash(hitPos.x, hitPos.y, hitPos.z, splashRadius, buildingUnits, hit?.ref);
      }
    }

    this.app.streetFeatures?.weaponHit?.(this.app.pos, hitPos, splashRadius); // [prop-damage] lamps / signals / bins topple
    if (splashRadius > 0 && buildingUnits > 0) {
      this.app.landmarks?.damage?.impact(hitPos, hit, buildingUnits, splashRadius); // [landmark-damage]
    }

    if (hit && hit.kind === 'car' && hit.car) {
      if (this.app.vehicleDamage && typeof this.app.vehicleDamage.hit === 'function') {
        const dmg = splashRadius > 0 ? 6 : 2.5;
        this.app.vehicleDamage.hit(hit.car, dmg, hitPos.x, hitPos.y, hitPos.z, splashRadius > 0 ? 'rocket' : 'walkerWeapon');
      }
    }

    if (this.app.traffic && typeof this.app.traffic.triggerImpactSphere === 'function') {
      const radius = splashRadius > 0 ? splashRadius : 3.6;
      const force = splashRadius > 0 ? 2.4 : 1.2;
      const dmg = splashRadius > 0 ? (splashRadius >= 7 ? 8 : 4) : 1.5;
      const src = splashRadius > 0 ? 'rocket' : 'walkerWeapon';
      this.app.traffic.triggerImpactSphere(hitPos.x, hitPos.y, hitPos.z, radius, {
        vx: 0,
        vy: splashRadius > 0 ? 1.5 : 0.3,
        vz: 0,
        force,
        damage: dmg,
        source: src,
        noPlayer: true, // the player's own shots never damage the player's vehicle
      });
    }

    if (this.app.vehicleDamage) {
      if (typeof this.app.vehicleDamage.applyExplosionSplash === 'function' && splashRadius > 0) {
        this.app.vehicleDamage.applyExplosionSplash(hitPos, splashRadius, splashRadius >= 7 ? 8 : 4, { noPlayer: true });
      }
    }

    if (this.app.maritime) {
      if (typeof this.app.maritime.damageVesselsInRadius === 'function') {
        this.app.maritime.damageVesselsInRadius(hitPos.x, hitPos.z, splashRadius > 0 ? splashRadius : 4.5, splashRadius > 0 ? 180 : 35, hitPos.y);
      } else if (typeof this.app.maritime.applyWeaponImpact === 'function') {
        this.app.maritime.applyWeaponImpact(hitPos, Math.max(18, buildingUnits * 100));
      }
    }
    if (this.app.airliner && typeof this.app.airliner.applyWeaponImpact === 'function') {
      this.app.airliner.applyWeaponImpact(hitPos, splashRadius > 0 ? splashRadius : 4.5, splashRadius > 0 ? 220 : 40);
    }
    if (typeof this.app.damageWorldParkedCarsInRadius === 'function') {
      this.app.damageWorldParkedCarsInRadius(hitPos.x, hitPos.z, splashRadius > 0 ? splashRadius : 3.8, splashRadius > 0 ? 120 : 35, hitPos.y);
    }
    this.app.vegetation?.impact?.(hitPos, splashRadius, buildingUnits); // [tree-damage]
  }

  _spawnExplosion(pos, radius = 5.0, colorHex = 0xff6600) {
    getWeaponSfx(this.app).play('explosion', { gain: 0.85 });

    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(SHARED_EXPLOSION_GEOM, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(radius * 0.35);
    this.app.scene.add(mesh);

    this.explosions.push({
      mesh,
      mat,
      maxRadius: radius,
      age: 0,
      duration: 0.45,
      isSharedGeom: true,
    });
  }

  _spawnMuzzleFlash(pos, scale = 0.15, colorHex = 0xffbb22) {
    const flashMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(SHARED_FLASH_GEOM, flashMat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(scale);
    this.app.scene.add(mesh);

    setTimeout(() => {
      this.app.scene.remove(mesh);
      flashMat.dispose();
    }, 45);
  }

  _initAiDefenseSquad() {
    this.soldierGroup = new THREE.Group();
    this.tankGroup = new THREE.Group();
    this.app.scene.add(this.soldierGroup);
    this.app.scene.add(this.tankGroup);
  }

  /**
   * Removes every AI soldier, tank and support helicopter and frees their GPU resources. Called when a
   * Kaiju battle ends (its 20 soldiers + 3 tanks were otherwise kept and drawn forever, ~700 objects and
   * doubled draw calls per session) and on teleport (their positions belong to the old region).
   */
  clearAiSquad() {
    const free = (root) => root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    for (const sd of this.aiSoldiers) {
      this.soldierGroup.remove(sd.mesh);
      free(sd.mesh);
    }
    for (const t of this.aiTanks) {
      if (!t.mesh) continue;
      this.tankGroup.remove(t.mesh);
      free(t.mesh);
    }
    if (this.aiHeli && this.aiHeli.mesh) {
      this.app.scene.remove(this.aiHeli.mesh);
      free(this.aiHeli.mesh);
    }
    for (const r of this.aiRagdolls) this._freeSoldierBody(r); // [polish] lying bodies
    this.aiRagdolls.length = 0;
    this.aiSoldiers.length = 0;
    this.aiTanks.length = 0;
    this.aiHeli = null;
  }

  _updateAiMilitary(dt) {
    const K = this.app.kaiju;
    const kaijuActive = Boolean(K && K.active && K.kaiju && K.kaiju.alive);
    if (this._aiInBattle && !kaijuActive) this.clearAiSquad(); // battle over: back to a small patrol
    this._aiInBattle = kaijuActive;

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
    if (this.aiHeli && this.aiHeli.mesh) this.aiHeli.mesh.visible = false;
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
        this._detonateSoldierRagdoll(s, chestPos); // [polish] thrown away from the kaiju
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

    // AI Helicopter Gunship support overhead when player is Tank or Soldier
    const K = this.app.kaiju;
    const playerInHeli = !K || !K.active || K.activeUnit === 'heli';
    if (!playerInHeli) {
      if (!this.aiHeli) {
        const heliMesh = createHelicopterModel();
        heliMesh.scale.setScalar(1.0);
        this.app.scene.add(heliMesh);
        this.aiHeli = {
          mesh: heliMesh,
          mainRotor: heliMesh.userData.mainRotor,
          tailRotor: heliMesh.userData.tailRotor,
          angle: 0.8,
          radius: 110,
          alt: 85,
          cannonTimer: 1.2,
          missileTimer: 4.5,
          alive: true,
        };
      }
      const ah = this.aiHeli;
      ah.mesh.visible = true;
      ah.angle += 0.28 * dt;

      const hx = kPos.x + Math.sin(ah.angle) * ah.radius;
      const hz = kPos.z + Math.cos(ah.angle) * ah.radius;
      const hy = Math.max(getBeijingTerrainElevation(hx, hz) + 40, kPos.y + ah.alt);
      ah.mesh.position.set(hx, hy, hz);

      const targetLook = new THREE.Vector3(chestPos.x, chestPos.y, chestPos.z);
      ah.mesh.lookAt(targetLook);
      ah.mesh.rotateZ(-0.16);

      if (ah.mainRotor) ah.mainRotor.rotation.y += 32.0 * dt;
      if (ah.tailRotor) ah.tailRotor.rotation.x += 40.0 * dt;

      ah.cannonTimer -= dt;
      if (ah.cannonTimer <= 0) {
        ah.cannonTimer = 1.6 + Math.random() * 0.8;
        this._aiHeliFireCannon(ah, chestPos, kaiju);
      }

      ah.missileTimer -= dt;
      if (ah.missileTimer <= 0) {
        ah.missileTimer = 5.5 + Math.random() * 2.0;
        this._aiHeliFireMissile(ah, chestPos, kaiju);
      }
    } else if (this.aiHeli && this.aiHeli.mesh) {
      this.aiHeli.mesh.visible = false;
    }
  }

  _aiHeliFireCannon(ah, chestPos, kaiju) {
    const origin = ah.mesh.position.clone().add(new THREE.Vector3(0, -0.6, 1.5));
    const dir = new THREE.Vector3().subVectors(chestPos, origin).normalize();
    this._spawnMuzzleFlash(origin, 0.25, 0xffdd44);
    getWeaponSfx(this.app).play('cannon', { gain: 0.35 });

    const tracerGeom = new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6);
    tracerGeom.rotateX(HALF_PI);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffea55 });
    const tracerMesh = new THREE.Mesh(tracerGeom, tracerMat);
    tracerMesh.position.copy(origin);
    tracerMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(tracerMesh);

    this.projectiles.push({
      mesh: tracerMesh,
      pos: origin.clone(),
      dir,
      speed: 600,
      distTraveled: 0,
      maxDist: origin.distanceTo(chestPos),
      damage: 0,
      kaijuDamage: 12.0,
      hitTarget: { kind: 'kaiju' },
      isRocket: false,
    });
  }

  _aiHeliFireMissile(ah, chestPos, kaiju) {
    const origin = ah.mesh.position.clone().add(new THREE.Vector3(1.4, -0.4, 0));
    const dir = new THREE.Vector3().subVectors(chestPos, origin).normalize();
    this._spawnMuzzleFlash(origin, 0.35, 0xff7722);
    getWeaponSfx(this.app).play('missileLaunch', { gain: 0.65 });

    const rocketMesh = createRpgModel();
    rocketMesh.scale.setScalar(0.75);
    rocketMesh.position.copy(origin);
    rocketMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.app.scene.add(rocketMesh);

    this.projectiles.push({
      mesh: rocketMesh,
      pos: origin.clone(),
      dir,
      speed: 195,
      distTraveled: 0,
      maxDist: origin.distanceTo(chestPos),
      damage: 0.6,
      kaijuDamage: 75.0,
      splashRadius: 8.0,
      hitTarget: { kind: 'kaiju' },
      isRocket: true,
      smokeTimer: 0,
    });
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

  // [polish] A soldier caught by the kaiju dies as ONE body: the connected Verlet ragdoll from ped_ragdoll.js
  // poses his own limb groups (hips + torso, head, arms, legs), thrown away from the kaiju, tumbling and
  // lying where he lands until the body is cleared (it used to burst into six loose boxes).
  _detonateSoldierRagdoll(s, from = null) {
    s.alive = false;
    const ud = s.mesh.userData;
    const root = s.mesh;
    let dx = from ? s.pos.x - from.x : Math.sin(s.yaw || 0), dz = from ? s.pos.z - from.z : Math.cos(s.yaw || 0);
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (!ud.hips || !ud.headGroup || !ud.leftArm || !ud.rightArm || !ud.leftLeg || !ud.rightLeg) {
      this.soldierGroup.remove(root);
      root.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
      return;
    }
    // head: out of the hips group so it gets its own frame (rest position in root space)
    ud.hips.remove(ud.headGroup);
    root.add(ud.headGroup);
    const sc = root.scale.x || 1;
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.set(1, 1, 1);
    root.updateMatrix();
    const body = { x: s.pos.x, z: s.pos.z, ryaw: s.yaw || 0, phase: 0, amp: 0 };
    const sp = 3.2 + Math.random() * 1.8;
    body.parts = startRagdoll(body, { wScale: sc, hScale: sc }, s.pos.y, dx * sp, 1.2 + Math.random() * 0.8, dz * sp, -dx, -dz, 1.1 + Math.random() * 0.5, SOLDIER_RAG_SPECS, true, 'impact');
    body.groups = [ud.hips, ud.headGroup, ud.leftArm, ud.rightArm, ud.leftLeg, ud.rightLeg];
    for (const g of body.groups) { g.rotation.set(0, 0, 0); g.scale.setScalar(sc); }
    this._poseSoldierBody(body);
    this.aiRagdolls.push({ body, mesh: root, life: 0, done: false });
    setTimeout(() => {
      const idx = this.aiSoldiers.indexOf(s);
      if (idx >= 0) this.aiSoldiers.splice(idx, 1);
    }, 4500);
  }

  update(dt) {
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.rpgQuickTimer > 0) this.rpgQuickTimer -= dt;
    if (this.tankCannonTimer > 0) this.tankCannonTimer -= dt;
    if (this.tankRocketTimer > 0) this.tankRocketTimer -= dt;

    const isAiming = this.isAimingMode();
    const isTank = (typeof this.app.isDrivingTank === 'function' && this.app.isDrivingTank()) || (this.app.kaiju && this.app.kaiju.active && this.app.kaiju.activeUnit === 'tank');
    const isWalk = (this.app.mode === 'walk') || (this.app.kaiju && this.app.kaiju.active && this.app.kaiju.activeUnit === 'soldier');

    if (this.reticleEl) {
      this.reticleEl.style.display = isAiming && !this._civilianWalk() ? 'block' : 'none';
    }
    if (this.weaponBadgeEl) {
      this.weaponBadgeEl.style.display = isWalk ? 'block' : 'none';
    }

    this._updateAimControls(dt);

    // [weapon-pickups] Kaiju soldier is always armed; outside it an unowned / empty weapon falls back.
    if (this._unlimited()) {
      if (!this.isArmed()) this._setWeapon('RIFLE');
    } else if (this.isArmed() && !this._hasAmmo(this.activeWeapon) && this.reloadTimer <= 0) {
      this._autoSwitch(true);
    }
    const unl = this._unlimited();
    if (unl !== this._wasUnlimited) { this._wasUnlimited = unl; this._updateWeaponBadge(); }
    this._updateReload(dt);
    this._updatePress();

    if (isWalk && this.isFiring && this.isArmed()) {
      this.fireCurrentWeapon();
    }

    if (isWalk && this.isArmed()) {
      this._updateWalkerAimPose();
    }

    if (isTank) {
      this._updateTankPose(dt);
    }

    this._updateProjectiles(dt);
    this._updateBeams(dt);
    this._updateExplosions(dt);
    this._updateAiMilitary(dt);
    this._updateRagdolls(dt);
  }

  _updateAimPose() {
    this._updateWalkerAimPose();
  }

  _updateWalkerAimPose() {
    const avatar = this.app.avatarMesh || this.app.walker;
    if (!avatar || !avatar.userData) return;
    const { rightArm, leftArm } = avatar.userData;
    if (!rightArm) return;

    if (this.app._punchTimer && this.app._punchTimer > 0) return;

    const hitPoint = this._computeAimPoint(800);
    const localAim = avatar.worldToLocal(hitPoint.clone());
    const distXZ = Math.hypot(localAim.x, localAim.z);
    const aimPitch = -Math.atan2(localAim.y - 1.42, Math.max(1.0, distXZ));
    const armPitch = -HALF_PI + THREE.MathUtils.clamp(aimPitch, -1.0, 1.0);
    const armYaw = THREE.MathUtils.clamp(Math.atan2(localAim.x, localAim.z), -0.45, 0.45);

    rightArm.rotation.x = armPitch;
    rightArm.rotation.y = armYaw;
    rightArm.rotation.z = -0.08;

    if (leftArm) {
      leftArm.rotation.x = armPitch + 0.12;
      leftArm.rotation.y = -0.38 + armYaw * 0.5;
      leftArm.rotation.z = 0.15;
    }
  }

  _updateTankPose(dt) {
    const mesh = this.app.vehicleMesh;
    if (!mesh || !mesh.userData) return;
    const { turret, barrel } = mesh.userData;
    if (!turret) return;

    const hitPoint = this._computeAimPoint(1000);
    const localAim = mesh.worldToLocal(hitPoint.clone());

    const targetTurretYaw = Math.atan2(localAim.x, localAim.z);
    turret.rotation.y = THREE.MathUtils.lerp(turret.rotation.y, targetTurretYaw, Math.min(1, 10.0 * dt));

    if (barrel) {
      const targetPitch = -Math.atan2(localAim.y - 0.35, Math.hypot(localAim.x, localAim.z));
      barrel.rotation.x = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(barrel.rotation.x, targetPitch, Math.min(1, 10.0 * dt)),
        -0.85,
        0.25
      );
    }
  }

  _updateTankTurretAim(dt) {
    this._updateTankPose(dt);
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
        if (p.isSharedGeom) {
          if (p.mesh.material) p.mesh.material.dispose();
        } else {
          // Rockets are groups (createRpgModel): free every part, not just the root, or each shot leaks 8 geometries.
          p.mesh.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
              else obj.material.dispose();
            }
          });
        }

        this._applyImpact(p.pos, p.hitTarget, p.damage, p.splashRadius || 0, p.kaijuDamage || 0);
        const radius = p.isTankShell ? 12.0 : p.isRocket ? 8.5 : 1.2;
        this._spawnExplosion(p.pos, radius, p.isTankShell ? 0xff5500 : p.isRocket ? 0xff7711 : 0xffcc33);

        this.projectiles.splice(i, 1);
      }
    }
  }

  _spawnSmokePuff(pos) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.65 });
    const mesh = new THREE.Mesh(SHARED_SMOKE_GEOM, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.85 + Math.random() * 0.5);
    this.app.scene.add(mesh);

    this.explosions.push({
      mesh,
      mat,
      maxRadius: 1.8,
      age: 0,
      duration: 0.45,
      isSharedGeom: true,
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
        if (!e.isSharedGeom && e.mesh.geometry) e.mesh.geometry.dispose();
        if (e.mat) e.mat.dispose();
        this.explosions.splice(i, 1);
      } else {
        const scale = 1.0 + p * (e.maxRadius || 3.0);
        e.mesh.scale.setScalar(scale);
        e.mat.opacity = (1.0 - p) * 0.85;
      }
    }
  }

  _poseSoldierBody(body) { // [polish] parts are in world space (soldierGroup has no transform)
    for (let k = 0; k < body.groups.length; k++) {
      const pt = body.parts[k], g = body.groups[k];
      g.position.set(pt.x, pt.y, pt.z);
      g.quaternion.copy(pt.q);
    }
  }

  _freeSoldierBody(r) { // [polish]
    this.soldierGroup.remove(r.mesh);
    r.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) { if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose()); else obj.material.dispose(); }
    });
  }

  _updateRagdolls(dt) {
    for (let i = this.aiRagdolls.length - 1; i >= 0; i--) {
      const r = this.aiRagdolls[i];
      r.life += dt;
      // [polish] connected soldier ragdoll: settles, lies for a while, then sinks away
      if (!r.done) { r.done = stepRagdoll(r.body, dt); this._poseSoldierBody(r.body); }
      if (r.life > 9) r.mesh.position.y = -(r.life - 9) * 0.5;
      if (r.life > 11) { this._freeSoldierBody(r); this.aiRagdolls.splice(i, 1); }
    }
  }

  onModeChange(newMode, prevMode) {
    if (this.reticleEl) {
      const isTank = newMode === 'drive' && this.app.vehicleMesh?.userData?.isTank;
      this.reticleEl.style.display = ((newMode === 'walk' && this.isArmed()) || isTank) ? 'block' : 'none';
    }
    if (this.weaponBadgeEl) {
      this.weaponBadgeEl.style.display = newMode === 'walk' ? 'block' : 'none';
    }
    this.isFiring = false;
    this._press = null;
  }
}

export function initWalkerWeapons(app) {
  return new WalkerWeaponsSystem(app);
}
