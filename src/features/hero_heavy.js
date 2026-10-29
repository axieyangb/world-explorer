// [hero-vehicles] Detailed player models for the bus, Cybertruck, ambulance, tow truck and tank.
// Same builder contract as buildHeroVehicle in hero_vehicles.js; ids listed here take over from the
// light models when the player drives them.
export const HEAVY_VEHICLE_IDS = new Set();

export function buildHeavyVehicle(typeId, options = {}) {
  throw new Error(`no heavy hero model for ${typeId}`);
}
