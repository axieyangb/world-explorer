// [drivers] The player's own avatar seated in the vehicle being driven / flown: a seated build of the same
// look (hero_avatar.js, seated: true) with hands on the wheel turning with the steering, or on the cyclic and
// collective in the helicopter. Built lazily on the first frame you drive a vehicle and kept on it; it shows
// only while the game keeps calling updateVehicleDriver (so parked cars, wrecks and a parked helicopter are
// empty) and follows the avatar when it is re-rolled.
// Seats come from the builders: chassis.userData.driverSeat = { hip, wheel, tilt, r, foot? } in chassis space
// (hero_vehicles.js addCommonDetails, hero_heavy.js addCabin); the helicopter uses HELI_SEAT on its fuselage.
import * as THREE from '../../vendor/three.module.js';
import { buildHeroAvatar } from './hero_avatar.js';

const HIP_H = 0.93; // hero_avatar hip pivot height (body frame)

// Pilot in the right-hand seat (-X; +X is the pilot's left): right hand on the cyclic grip, left on the
// collective beside the seat, feet on the pedals.
const HELI_SEAT = {
  hip: [-0.42, 1.18, 1.25], foot: [0.6, -0.34], recline: 0.12,
  hands: [[-0.42, 1.25, 1.6], [-0.14, 1.02, 1.36]],
};

function place(d, seat) {
  const h = d.userData.look.height || 1;
  const [hx, hy, hz] = seat.hip;
  d.position.set(hx, hy - HIP_H * h, hz);
  const toBody = (p) => new THREE.Vector3((p[0] - hx) / h, (p[1] - hy) / h + HIP_H, (p[2] - hz) / h);
  const S = d.userData.seat || (d.userData.seat = { steer: 0, seen: -1e9 });
  S.wheel = seat.wheel ? toBody(seat.wheel) : null;
  S.hands = seat.hands ? seat.hands.map(toBody) : null;
  S.r = (seat.r || 0.16) / h;
  S.tilt = seat.tilt || 0;
  S.recline = seat.recline ?? (seat.hip[1] < 0.5 ? 0.3 : 0.18);
  S.foot = seat.foot || [0.72, Math.max(-0.42, -0.3 - (seat.hip[1] > 1.2 ? 0.12 : 0))];
}

/** Call every frame while the player drives / flies `vehicle` (entity root). steer: + = left (main.js). */
export function updateVehicleDriver(vehicle, avatar, steer = 0) {
  const ud = vehicle && vehicle.userData;
  const look = avatar && avatar.userData && avatar.userData.look;
  if (!ud || !look) return;
  let d = ud.driver;
  if (!d) {
    if (ud.noDriver) return;
    const node = ud.fuselage || ud.chassis;
    const seat = node && (ud.fuselage ? HELI_SEAT : node.userData.driverSeat);
    if (!seat) { ud.noDriver = true; return; }
    d = buildHeroAvatar({ seed: look.seed, seated: true });
    d.name = 'driver';
    d.userData.isDriver = true;
    d.userData.seatSpec = seat;
    d.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    place(d, seat);
    node.add(d);
    // not enumerable: Object3D.clone() JSON-copies userData (the wreck clone in vehicle_damage.js)
    Object.defineProperty(ud, 'driver', { value: d, writable: true, enumerable: false, configurable: true });
  } else if (d.userData.look.seed !== look.seed) {
    d.userData.reroll(look.seed);
    d.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    place(d, d.userData.seatSpec);
  }
  const S = d.userData.seat;
  S.steer = steer;
  S.seen = performance.now();
}
