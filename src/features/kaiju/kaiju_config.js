// Kaiju Defense: all balance and tuning numbers in one place.
export const CFG = {
  // Intro / spawn
  SPAWN_HELI_ALT: 200,          // m above terrain when the mode starts
  SPAWN_WATER_SEARCH: 900,     // m, search radius for a large water body
  SPAWN_DIST: 420,             // m from the player
  ALERT_SECONDS: 3.0,
  RISE_SECONDS: 7.0,

  // Kaiju
  KAIJU_HEIGHT_MIN: 60,
  KAIJU_HEIGHT_MAX: 80,
  KAIJU_HP: 6000,
  KAIJU_WALK_SPEED: 13.5,        // m/s
  KAIJU_ENRAGE_FRACTION: 0.3,
  KAIJU_ENRAGE_SPEED_MULT: 1.45,
  KAIJU_RETARGET_PLAYER_DMG: 3000, // damage within 10 s that makes it turn on the player
  BREATH_INTERVAL_MIN: 7,
  BREATH_INTERVAL_MAX: 11,
  BREATH_INTERVAL_ENRAGED_MULT: 0.6,
  BREATH_TELEGRAPH: 2.0,
  BREATH_DURATION: 4.0,
  BREATH_RANGE: 400,
  BREATH_HALF_ANGLE_DEG: 12.5,  // 25 deg cone
  BREATH_SWEEP_DEG: 50,         // total yaw sweep while breathing
  BREATH_PLAYER_DPS: 18,        // heli HP per second inside the cone
  BREATH_BUILDING_DPS: 1.1,     // building damage (0..1) per second inside the cone
  TAIL_SWIPE_TRIGGER_DIST: 160, // heli behind kaiju within this => tail swipe
  TAIL_SWIPE_COOLDOWN: 9,
  TAIL_SWIPE_DAMAGE: 55,
  TAIL_SWIPE_RADIUS: 95,
  STOMP_RADIUS: 28,             // per footfall building damage radius (scaled by kaiju size)
  BODY_RADIUS: 24,              // continuous body overlap radius

  // Player
  HELI_HP: 400,                 // [player] boosted hull durability
  HELI_SEGMENTS: 10,
  LIVES: 3,
  RESPAWN_DELAY: 3.0,
  RESPAWN_ALT: 250,
  RESPAWN_DIST: 600,
  RESPAWN_INVULN: 3.0,

  // Cannon
  CANNON_RPS: 14,
  CANNON_DAMAGE: 75,
  CANNON_MUZZLE_SPEED: 900,     // m/s
  CANNON_GRAVITY: 9.8 * 0.35,   // slight drop
  CANNON_SPREAD_RAD: 0.0035,
  CANNON_RANGE: 1600,
  CANNON_HEAT_SECONDS: 14.0,    // continuous fire to overheat
  CANNON_COOL_SECONDS: 1.8,     // full cool-down
  CANNON_BUILDING_DAMAGE: 0.012, // building damage (0..1) per round (fallback)
  CANNON_BUILDING_UNITS: 0.03,  // per round, in rockets of building HP (KaijuDestruction.heliHp), same as Fly mode

  // Missiles
  MISSILE_SALVO: 4,
  MISSILE_DAMAGE: 450,
  MISSILE_COOLDOWN: 3.0,
  MISSILE_SPEED: 260,
  MISSILE_TURN_RATE: 2.6,       // rad/s
  MISSILE_LOCK_TIME: 0.35,
  MISSILE_LOCK_RANGE: 1600,
  MISSILE_LOCK_CONE_DEG: 18,    // kaiju lock point within this angle of screen center
  MISSILE_BLAST_RADIUS: 28,
  MISSILE_BUILDING_DAMAGE: 0.7,

  WEAK_POINT_MULT: 3.0,
  AIM_ASSIST_DEG: 14.0,

  // City damage
  CITY_TRACK_RADIUS: 1500,
  CITY_FALL_FRACTION: 0.28,     // City Damage 100% == this fraction of tracked building volume destroyed
  HUD_WARN_AMBER: 0.5,
  HUD_WARN_RED: 0.8,

  // City life
  PED_DENSITY_MULT: 2.5,
  PANIC_RUN_SPEED: 4.2,         // m/s

  // Destruction
  COLLAPSE_SECONDS: 2.0,
  BURN_TO_COLLAPSE_MIN: 1.0,
  BURN_TO_COLLAPSE_MAX: 2.0,
  RUBBLE_SMOKE_SECONDS: 45,
  // Destruction (world)
  DESTRUCTION_TOUGHNESS_HEIGHT: 150, // m; building damage is divided by (1 + height / this)
  FIRE_IGNITE_DAMAGE: 0.3,       // fire damage past this ignites a building
  BURN_DAMAGE_PER_SEC: 0.25,     // scorch growth while burning
  CITY_TRACK_GROW_SECONDS: 10,   // chunks registering within this window after beginTracking join the denominator
  DESTRUCTION_MAX_EMITTERS: 36,  // fire/smoke emitters owned by destruction
  DENSEST_CELL: 120,             // m, getDensestTarget cell size

  // Perf caps
  MAX_PARTICLES: 6000,
  MAX_EMITTERS: 96,
  MAX_DECALS: 64,
  MAX_RUBBLE_CHUNKS: 4000,

  DEATH_SLOWMO: 0.35,
  DEATH_SECONDS: 6.0,

  // City life (world)
  CROWD_KAIJU_RADIUS: 320,
  CROWD_REVERSE_SPEED: 5,

  // Game (camera)
  GUNNER_CAM_RIGHT: 0,          // m, camera-space offset so the crosshair ray clears the heli
  GUNNER_CAM_UP: 6.8,
  GUNNER_CAM_DIST: 16.5,
  SOFT_LOCK_WEIGHT: 0,

  // Dodge + feedback (player)
  DASH_DIST: 48,                // m, lateral dodge (double-tap or Shift + Left/Right)
  DASH_VERT_DIST: 20,           // m, vertical dodge (double-tap Q / E)
  DASH_TIME: 0.45,               // s
  DASH_END_SPEED: 18,           // m/s carried after a lateral dodge
  DASH_COOLDOWN: 1.6,
  DASH_IFRAMES: 0.90,
  DASH_DOUBLE_TAP: 0.28,        // s between taps
  DASH_CLEARANCE: 8,            // m above terrain / roofs for a downward dodge
  HELI_REGEN_DELAY: 2.5,        // s without damage before repair starts
  HELI_REGEN_RATE: 8,           // HP/s
  HELI_SMOKE_FRAC: 0.6,         // smoke trail below this hull fraction
  HELI_FIRE_FRAC: 0.3,          // fire + dark smoke below this
  HELI_ALARM_FRAC: 0.25,        // warning chirp below this
  DMG_INDICATOR_SECONDS: 1.0,
  // Laser + aggro (creature)
  LASER_ENABLED: true,
  LASER_FIRST_DELAY: 2.2,         // s after the first hit
  LASER_INTERVAL_MIN: 10.5,
  LASER_INTERVAL_MAX: 14,
  LASER_INTERVAL_ENRAGED_MULT: 0.65,
  LASER_LOCK_SECONDS: 1.8,      // red targeting beam follows the heli
  LASER_FREEZE_BEFORE: 1.50,    // aim freezes this long before firing
  LASER_LEAD: 0.0,              // s of heli velocity lead at freeze
  LASER_AIM_ERROR_DEG: 0.0,
  LASER_FIRE_SECONDS: 1.8,
  LASER_SWEEP_DEG: 0,           // beam drifts toward the heli by at most +-half of this while firing
  LASER_RADIUS: 5.5,              // m, heli hit radius around the beam
  LASER_DPS: 20,
  LASER_RANGE: 1800,
  LASER_BLAST_RADIUS: 14,
  LASER_BUILDING_DAMAGE: 0.5,   // per tick at the beam end
  LASER_TICK: 0.15,
  LASER_AGGRO_DECAY: 25,        // s without hits before aggro ends
  LASER_TURN_SECTOR_DEG: 60,    // aggro: body turns toward the heli when it is outside this
  BREATH_AIM_RANGE: 450,        // breath aims at the heli inside this range ...
  BREATH_AIM_SECTOR_DEG: 120,   // ... and front sector
  BREATH_TELEGRAPH_AIMED: 1.3,
  BREATH_AIMED_SWEEP_DEG: 24,
  BREATH_TRACK_RATE: 0.12,      // rad/s, aimed breath follows the heli
  AGGRO_RADIUS: 250,            // m (3D to the kaiju centre): heli inside => aggro without hits
  AGGRO_RADIUS_ENRAGED: 350,
  LASER_INTERVAL_NEAR_MULT: 0.6, // laser/breath timers run 1/this faster while the heli is inside the radius
  STUN_DAMAGE_MULT: 2,
  KAIJU_STAGGER_DAMAGE: 1500,   // single hit this big cancels a laser lock
  BREATH_HAZARD_RADIUS: 25,     // crate hazard radius along the breath footprint

  // Supply + super weapons (supply)
  SUPPLY_FIRST: 2.5,            // s of fight before the first drop
  SUPPLY_INTERVAL_MIN: 18,
  SUPPLY_INTERVAL_MAX: 26,
  SUPPLY_MAX_LIVE: 3,
  SUPPLY_DROP_HEIGHT: 120,      // m above hover altitude
  SUPPLY_HOVER_ALT: 95,         // m above terrain (helicopter flight level)
  SUPPLY_FALL_SPEED: 28,        // m/s under canopy
  SUPPLY_LIFETIME: 60,          // s after reaching hover altitude
  SUPPLY_BLINK: 10,             // s of blinking before despawn
  SUPPLY_PICKUP_RADIUS: 28,
  SUPPLY_MAGNET_RADIUS: 48,
  SUPPLY_HAZARD_HEIGHT: 100,    // m above terrain; crates higher up survive footfalls / breath
  SUPPLY_DANGER_MIN: 160,       // m from the kaiju
  SUPPLY_DANGER_MAX: 320,
  SUPPLY_SAFE_CHANCE: 0.35,
  SUPPLY_SAFE_MIN: 320,
  SUPPLY_SAFE_MAX: 500,
  SUPPLY_BEACON_HEIGHT: 250,
  SUPPLY_WEIGHTS: { railgun: 3, swarm: 3, emp: 2, orbital: 2 },
  SUPPLY_SAFE_WEIGHTS: { repair: 1, coolant: 1 },
  REPAIR_HP: 60,
  COOLANT_SECONDS: 15,
  RAIL_SHOTS: 3,
  RAIL_CHARGE_TIME: 0.45,
  RAIL_DAMAGE: 2400,            // x WEAK_POINT_MULT on a weak sphere
  RAIL_RANGE: 2200,
  RAIL_PIERCE: 3,               // buildings damaged behind the kaiju
  RAIL_BUILDING_DAMAGE: 0.6,
  SWARM_SALVOS: 2,
  SWARM_COUNT: 12,
  SWARM_STAGGER: 0.06,
  SWARM_DAMAGE: 220,            // per missile, x WEAK_POINT_MULT on a weak sphere
  SWARM_SPEED: 300,
  SWARM_WEAK_CHANCE: 0.3,       // share of missiles aimed at a weak sphere
  EMP_RANGE: 900,
  EMP_CONE_DEG: 35,
  EMP_STUN_SECONDS: 6,
  EMP_DAMAGE: 2000,
  EMP_CHARGES: 2,
  EMP_RADIUS: 140,              // visual shockwave radius
  ORBITAL_RANGE: 2200,
  ORBITAL_COUNTDOWN: 2.2,
  ORBITAL_RADIUS: 75,           // kaiju (horizontal) within this of the mark takes the hit
  ORBITAL_DAMAGE: 2800,
  ORBITAL_CITY_RADIUS: 80,
  ORBITAL_CITY_DAMAGE: 1.0,
};
