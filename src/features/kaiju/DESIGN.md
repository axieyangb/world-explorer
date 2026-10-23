# Kaiju Defense: module contract

All Kaiju code lives in `src/features/kaiju/`. Shared files get only small hook lines marked `// [kaiju]`.
World units: meters; x/z ground plane, y up. Terrain height: `getBeijingTerrainElevation(x, z)` from `../../environment.js`.
`app` = `WorldExplorerApp` (`src/main.js`). `K` = the `KaijuMode` instance (`app.kaiju`). Every subsystem gets `K` in its constructor
and reaches the others through it: `K.fx`, `K.audio`, `K.destruction`, `K.crowd`, `K.kaiju`, `K.weapons`, `K.hud`.
All balance numbers live in `kaiju_config.js` (`CFG`). Never hard-code them elsewhere.

## Module layout
| File | Area | Purpose |
|---|---|---|
| `kaiju_config.js` | core | balance / tuning constants |
| `kaiju_mode.js` | game | mode controller: enter/exit, intro, lives, win/lose, pause, input routing, shake, stats, aim-ray adapter |
| `kaiju_hud.js`, `kaiju.css` | game | HUD, radar overlay, results card, pause menu, screen effects |
| `kaiju_model.js` | creature | procedural reptile mesh, scale shader, animation rig |
| `kaiju_ai.js` | creature | `Kaiju` class: state machine, movement, attacks, hit volumes, HP |
| `kaiju_spawn.js` | creature | spawn site (nearest big water within 2.5 km, else open map edge) |
| `kaiju_destruction.js` | world | per-building state texture + shader patch, collapse, rubble, colliders, City Damage |
| `kaiju_crowd.js` | world | pedestrian panic / density boost, car swerve + explode (hooks into `city_traffic.js`) |
| `kaiju_fx.js` | combat | pooled GPU particles, emitters, decals |
| `kaiju_weapons.js` | combat | cannon, missiles, lock-on, aim assist, hit resolution |
| `kaiju_audio.js` | combat | Web Audio synth sounds, siren, mute |

Shared-file hooks, by area:
- `src/main.js`, `index.html`, `styles.css` (only a `<link>` to kaiju.css if needed), `src/i18n.js`, `tools/build_release.py`: **game**
- `src/chunk_builder.js`, `src/wfc/wfc_mesh_builder.js`: **world** (per-building id attribute + shader hook)
- `src/features/city_traffic.js`: **world**
Keep hooks in shared files to the lines listed here.

## main.js hooks (game)
1. `import { KaijuMode } from "./features/kaiju/kaiju_mode.js";` and `this.kaiju = new KaijuMode(this);` after `this.traffic`.
2. `_animate`: `const dt = this.kaiju ? this.kaiju.scaleDt(rawDt) : rawDt;` (pause => 0, death slow-mo).
   After `_updatePhysics(dt)`: `this.kaiju.update(dt)` (may override heli pos during crash/respawn).
   After `_updateCamera(dt)`: `this.kaiju.postCamera(dt)` (camera shake).
3. `setMode('kaiju')` => `this.kaiju.enter()`. Any other `setMode` while active => `this.kaiju.exit()` first.
4. Kaiju input: `KaijuMode` installs window capture-phase key/pointer listeners; while active it swallows F/C/G/Space/Escape
   (`stopImmediatePropagation`) and forwards to `K.weapons.onKeyDown/onKeyUp/onPointerDown/onPointerUp`.

## KaijuMode (K): fields other modules may read/call
```
K.app, K.scene, K.camera, K.active (bool), K.state: 'off'|'intro'|'fight'|'dying'|'results'
K.paused, K.time (seconds since enter, fight clock)
K.heli = { health: 0..CFG.HELI_HP, lives, alive: bool, invuln: seconds }
K.stats = { cannonShots, cannonHits, missilesFired, missileHits, weakHits, startTime }
K.getHeliPos() -> THREE.Vector3 (app.pos, do not mutate)
K.getAimRay() -> { origin: Vector3, dir: Vector3 (unit) }   // app.heli?.getAimRay?.() if present, else camera-center ray
K.shake(strength, x, y, z)      // strength ~ 0..1 at source; attenuated by distance to camera
K.damagePlayer(amount, source)  // source: 'breath'|'tail'|'body'|'debris'
K.onKaijuDeath()                // called by Kaiju when death collapse starts
```

## KaijuFx (combat)
```
new KaijuFx(K); update(dt); reset()
spawn(type, pos, opts={})  // type: 'spark'|'debris'|'explosion'|'bigExplosion'|'smoke'|'fire'|'dust'|'dustRing'|'flame'|'muzzle'
   opts: { count, scale, dir: Vector3, speed, color: THREE.Color, life }
addEmitter(type, pos, { rate, life (s, Infinity ok), radius, scale }) -> { stop(), pos: Vector3 }
addDecal(x, z, yaw, scale)   // footprint decal on terrain, fades after ~60 s
addTracer(from, to, life)    // optional, cannon may own its own
```
Everything pooled & instanced with hard caps.

## KaijuAudio (combat)
```
new KaijuAudio(K); resume() (on first user gesture); setMuted(b); muted
play(name, { pos?: Vector3, gain?: number }) -> handle { stop() }
  names: 'cannon' 'missileLaunch' 'explosion' 'bigExplosion' 'footstep' 'roar' 'breath' 'collapse' 'hit' 'hitWeak' 'lock' 'alarm' 'heliHit' 'crash'
startSiren(); stopSiren(); update(dt, listenerPos); stopAll()
```

## KaijuDestruction (world)
```
new KaijuDestruction(K)       // installs the building shader patch at construction (always-on, cheap)
beginTracking(x, z, radius)   // freeze total building volume within radius; City Damage denominator
getCityDamage() -> 0..1       // (destroyed + damage-weighted partial volume) / (total * CFG.CITY_FALL_FRACTION), clamped
damageSphere(x, y, z, r, amount, { fire=false, source }) -> count of buildings destroyed
damageCone(origin, dir, range, halfAngleRad, amount, { fire=true })
raycast(origin, dir, maxDist) -> { dist, point: Vector3, ref } | null   // ref is an opaque building ref
applyHit(ref, amount, { fire, point })
getDensestTarget(fromX, fromZ) -> { x, z } | null  // highest remaining building volume (~200 m cells) in loaded chunks
stats -> { destroyed, damaged, burning }
update(dt); restoreAll()      // restoreAll: un-destroy everything, restore colliders, clear rubble/emitters
onCollapse = (x, z, size) => {}   // K sets this to play rumble + shake
```
Building state persists per chunk key + building index, so unload/reload keeps destruction until `restoreAll()`.

## KaijuCrowd (world)
```
new KaijuCrowd(K); activate(); deactivate() (restore density + traffic); update(dt)
addThreat(x, z, radius, seconds)  // pedestrians flee, cars swerve/stop/reverse
burnZone(x, z, radius)            // cars inside explode -> wreck tint + small fire; pedestrians inside vanish
stats -> { fleeing, carsDestroyed }
```

## Kaiju (creature)
```
new Kaiju(K); spawn({ x, z, fromWater, targetX, targetZ }); update(dt); dispose(); forceHp(v)
position: Vector3 (feet), yaw, hp, maxHp, alive, state, enraged, height
breathCharge 0..1 (telegraph progress), breathActive bool, breathDir: Vector3, breathOrigin: Vector3
rising: bool (intro emergence)
hitSpheres -> [{ center: Vector3, radius, weak: bool, name }]   // world space, updated every frame
raycast(origin, dir, maxDist) -> { dist, point, weak, name } | null
takeDamage(amount, point, weak)   // weak multiplier is applied by caller (weapons); kaiju flinches, may retarget player
getLockPoint() -> Vector3 (chest)
```
The Kaiju itself calls `K.destruction.damageSphere` (feet/tail/body), `K.destruction.damageCone` (breath),
`K.crowd.addThreat/burnZone`, `K.fx`, `K.audio`, `K.shake`, `K.damagePlayer`.
`kaiju_spawn.js`: `pickSpawn(K) -> { x, z, fromWater, targetX, targetZ }`.

## KaijuWeapons (combat)
```
new KaijuWeapons(K); update(dt); reset()
onKeyDown(code) onKeyUp(code) onPointerDown(button) onPointerUp(button)   // Space/LMB cannon, F/RMB missiles
heat 0..1, overheated, missileCooldown 0..1 (1 = just fired), lockProgress 0..1, locked
reticle -> { x, y } screen px of lock target (or null), crosshair always screen center
```
Hits: kaiju first (`K.kaiju.raycast`), then buildings (`K.destruction.raycast` -> `applyHit`, friendly fire).

## KaijuHud (game)
`new KaijuHud(K); show(); hide(); update(dt); showAlert(); showResults({ win, time, cityDamage, accuracy, cannonHits, missileHits }); showPause(); hidePause(); flashHit()`
