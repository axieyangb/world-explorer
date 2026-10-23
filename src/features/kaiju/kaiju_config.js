// Kaiju Defense: all balance and tuning numbers in one place.
export const CFG = {
  // Intro / spawn
  SPAWN_HELI_ALT: 200,          // m above terrain when the mode starts
  SPAWN_WATER_SEARCH: 2500,     // m, search radius for a large water body
  SPAWN_DIST: 1500,             // m from the player
  ALERT_SECONDS: 3.0,
  RISE_SECONDS: 7.0,

  // Kaiju
  KAIJU_HEIGHT_MIN: 60,
  KAIJU_HEIGHT_MAX: 80,
  KAIJU_HP: 16000,
  KAIJU_WALK_SPEED: 10.0,        // m/s
  KAIJU_ENRAGE_FRACTION: 0.3,
  KAIJU_ENRAGE_SPEED_MULT: 1.45,
  KAIJU_RETARGET_PLAYER_DMG: 1500, // damage within 10 s that makes it turn on the player
  BREATH_INTERVAL_MIN: 12,
  BREATH_INTERVAL_MAX: 20,
  BREATH_INTERVAL_ENRAGED_MULT: 0.6,
  BREATH_TELEGRAPH: 2.0,
  BREATH_DURATION: 4.0,
  BREATH_RANGE: 400,
  BREATH_HALF_ANGLE_DEG: 12.5,  // 25 deg cone
  BREATH_SWEEP_DEG: 50,         // total yaw sweep while breathing
  BREATH_PLAYER_DPS: 18,        // heli HP per second inside the cone
  BREATH_BUILDING_DPS: 1.6,     // building damage (0..1) per second inside the cone
  TAIL_SWIPE_TRIGGER_DIST: 160, // heli behind kaiju within this => tail swipe
  TAIL_SWIPE_COOLDOWN: 9,
  TAIL_SWIPE_DAMAGE: 55,
  TAIL_SWIPE_RADIUS: 95,
  STOMP_RADIUS: 22,             // per footfall building damage radius (scaled by kaiju size)
  BODY_RADIUS: 18,              // continuous body overlap radius

  // Player
  HELI_HP: 100,
  HELI_SEGMENTS: 10,
  LIVES: 3,
  RESPAWN_DELAY: 3.0,
  RESPAWN_ALT: 250,
  RESPAWN_DIST: 600,
  RESPAWN_INVULN: 3.0,

  // Cannon
  CANNON_RPS: 12,
  CANNON_DAMAGE: 7,
  CANNON_MUZZLE_SPEED: 900,     // m/s
  CANNON_GRAVITY: 9.8 * 0.35,   // slight drop
  CANNON_SPREAD_RAD: 0.0035,
  CANNON_RANGE: 1600,
  CANNON_HEAT_SECONDS: 6.0,     // continuous fire to overheat
  CANNON_COOL_SECONDS: 3.0,     // full cool-down
  CANNON_BUILDING_DAMAGE: 0.012, // building damage (0..1) per round

  // Missiles
  MISSILE_SALVO: 2,
  MISSILE_DAMAGE: 320,
  MISSILE_COOLDOWN: 8.0,
  MISSILE_SPEED: 260,
  MISSILE_TURN_RATE: 2.6,       // rad/s
  MISSILE_LOCK_TIME: 0.8,
  MISSILE_LOCK_RANGE: 1500,
  MISSILE_LOCK_CONE_DEG: 9,     // kaiju lock point within this angle of screen center
  MISSILE_BLAST_RADIUS: 28,
  MISSILE_BUILDING_DAMAGE: 0.7,

  WEAK_POINT_MULT: 3.0,
  AIM_ASSIST_DEG: 2.5,

  // City damage
  CITY_TRACK_RADIUS: 2000,
  CITY_FALL_FRACTION: 0.22,     // City Damage 100% == this fraction of tracked building volume destroyed
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
  DENSEST_CELL: 200,             // m, getDensestTarget cell size

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
  GUNNER_CAM_RIGHT: 6,          // m, camera-space offset so the crosshair ray clears the heli
  GUNNER_CAM_UP: 3,
};
