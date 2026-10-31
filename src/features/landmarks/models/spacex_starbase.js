// feature/famous-landmarks: SpaceX Starbase Launch Complex & Mega Bay, Boca Chica TX — 1:1.
// Iconic 146m black-steel Orbital Launch Integration Tower (Mechazilla) with Chopstick catch arms
// holding a gleaming 121m stainless-steel Super Heavy Booster + Starship stack on the Orbital Launch Mount,
// flanked by the giant vertical Mega Bay assembly buildings and cryo propellant tank farm!

export const lodDist = 3000;
export const fineDist = 750;
export const glowStrength = 2.1;

const TOWER_BLK = 0x1c222a, TOWER_STEEL = 0x323b46, STAINLESS = 0xd8dfe6, STAINLESS_LT = 0xeff4f8;
const HEATSHIELD = 0x181b20, CONCRETE = 0xcac6bc, PAD_DK = 0x525860;
const TANK_W = 0xf2f5f8, GLASS_BAY = 0x3d556c, LIT = 0xfff0cc, BEACON_RED = 0xff2a1c, FLAME_GLOW = 0xff9e3b;

export const colliders = [
  { x: -16, z: -12, hw: 14, hd: 14, h: 146 },
  { x: 0, z: -12, r: 9, h: 142 },
  { x: -64, z: 32, hw: 26, hd: 26, h: 82 },
  { x: 56, z: -18, hw: 34, hd: 16, h: 32 },
];

function mechazillaTower(k, tx, tz) {
  const hi = k.hi;
  const hw = 7.2, H = 146;

  k.glow(false).color(PAD_DK).box(tx, -2.5, tz, 22, 6.5, 22);

  k.color(TOWER_BLK);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(tx + sx * hw, 4.0, tz + sz * hw, 2.2, H - 4.0, 2.2);
    }
  }
  k.color(TOWER_STEEL).box(tx - 1.5, 4.0, tz, 6.5, H - 6.0, 6.5);

  const bays = hi ? 14 : 7;
  const bh = (H - 6.0) / bays;
  k.color(TOWER_BLK);
  for (let b = 0; b <= bays; b++) {
    const y0 = 4.0 + b * bh, y1 = y0 + bh;
    k.box(tx, y0, tz, hw * 2 + 2.2, 1.1, hw * 2 + 2.2);
    if (b < bays && hi) {
      for (const s of [-1, 1]) {
        k.strut([tx - hw, y0, tz + s * hw], [tx + hw, y1, tz + s * hw], 0.65);
        k.strut([tx + hw, y0, tz + s * hw], [tx - hw, y1, tz + s * hw], 0.65);
        k.strut([tx + s * hw, y0, tz - hw], [tx + s * hw, y1, tz + hw], 0.65);
      }
    }
  }

  k.color(TOWER_BLK).box(tx + 4, H, tz, 24, 3.2, 16);
  k.color(STAINLESS).cyl(tx, H + 3.2, tz, 0.35, 0.12, 7.5, 6);
  k.glow(true).color(BEACON_RED).sphere(tx, H + 11.0, tz, 0.85, 6, 4);

  k.color(LIT);
  for (let y = 24; y <= 132; y += 18) {
    k.box(tx + hw + 1.2, y, tz, 0.5, 3.2, 8.0);
  }
  k.glow(false);

  const cy = 84.0;
  k.color(TOWER_STEEL).box(tx + hw + 0.5, cy - 3.5, tz, 4.5, 7.5, 16.5);
  k.color(TOWER_BLK);
  k.strut([tx + hw + 1.5, cy, tz - 6.8], [tx + 24.5, cy, tz - 5.2], 2.2);
  k.strut([tx + hw + 1.5, cy, tz + 6.8], [tx + 24.5, cy, tz + 5.2], 2.2);
  if (hi) {
    // Chopstick catch rails, shock-absorbing tankzilla pads & actuator cylinders
    k.color(STAINLESS);
    k.strut([tx + hw + 2.5, cy + 1.35, tz - 6.6], [tx + 24.2, cy + 1.35, tz - 5.1], 0.45);
    k.strut([tx + hw + 2.5, cy + 1.35, tz + 6.6], [tx + 24.2, cy + 1.35, tz + 5.1], 0.45);
    k.strut([tx + hw, cy + 5.5, tz - 6.8], [tx + 16.0, cy + 0.8, tz - 5.8], 0.42);
    k.strut([tx + hw, cy + 5.5, tz + 6.8], [tx + 16.0, cy + 0.8, tz + 5.8], 0.42);
    // Vertical cryo riser pipes up the tower face
    for (const pz of [-4.2, -1.4, 1.4, 4.2]) {
      k.cyl(tx + hw + 0.4, 4.0, tz + pz, 0.32, 0.32, H - 8.0, 8);
    }
  }

  // Ship Quick Disconnect (SQD) swing arm + cryogenic jumper hoses
  k.color(TOWER_BLK).strut([tx + hw + 1.0, 96.0, tz + 5.5], [tx + 16.5, 96.0, tz + 1.2], 1.6);
  if (hi) {
    k.color(STAINLESS).cable([tx + hw + 1.5, 97.2, tz + 5.2], [tx + 14.5, 95.8, tz + 0.8], 0.24, 1.4, 10, 6);
  }
}

function starshipFullStack(k, sx, sz) {
  const hi = k.hi;
  const seg = hi ? 24 : 12;

  k.glow(false).color(CONCRETE).cyl(sx, -2.5, sz, 16, 17, 3.0, seg);
  k.color(TOWER_STEEL);
  const nLegs = hi ? 12 : 6;
  for (let i = 0; i < nLegs; i++) {
    const a = (i / nLegs) * Math.PI * 2;
    k.strut(
      [sx + Math.cos(a) * 11.5, 0.5, sz + Math.sin(a) * 11.5],
      [sx + Math.cos(a) * 7.2, 17.5, sz + Math.sin(a) * 7.2],
      1.35
    );
  }
  k.color(TOWER_BLK).cyl(sx, 17.0, sz, 8.2, 8.2, 3.8, seg);
  k.glow(true).color(FLAME_GLOW).cyl(sx, 16.2, sz, 6.2, 6.2, 0.8, 12);
  k.glow(false);

  k.color(STAINLESS).cyl(sx, 20.8, sz, 4.5, 4.5, 69.0, seg);
  if (hi) {
    // Super Heavy COPV aerodynamic chines & circumferential barrel weld rings
    k.color(STAINLESS_LT);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      k.box(sx + Math.cos(a) * 4.52, 22.0, sz + Math.sin(a) * 4.52, 0.55, 58.0, 0.55);
    }
    for (let y = 28.0; y <= 84.0; y += 14.0) {
      k.torus(sx, y, sz, 4.52, 0.08, 24, 8);
    }
    // Outer ring of Raptor engine bells beneath the OLM table + water deluge ring manifold
    k.color(TOWER_STEEL).torus(sx, 16.6, sz, 8.6, 0.45, 24, 10);
    k.color(TOWER_BLK);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.cyl(sx + Math.cos(a) * 3.6, 15.2, sz + Math.sin(a) * 3.6, 0.55, 0.32, 1.8, 10);
    }
  }
  k.color(TOWER_STEEL).cyl(sx, 89.8, sz, 4.55, 4.55, 2.0, seg);
  if (hi) {
    // Hot-staging vented interstage ring slots
    k.color(TOWER_BLK);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.box(sx + Math.cos(a) * 4.56, 90.0, sz + Math.sin(a) * 4.56, 0.35, 1.6, 0.35);
    }
  }
  k.color(TOWER_BLK);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.push().translate(sx + Math.cos(a) * 5.8, 88.0, sz + Math.sin(a) * 5.8).rotateY(-a);
    k.box(0, 0, 0, 2.8, 2.6, 0.45);
    if (hi) {
      // Waffle grid fin lattice ribs
      k.color(TOWER_STEEL);
      for (const gx of [-0.8, 0, 0.8]) k.box(gx, 0, 0, 0.14, 2.6, 0.52);
      for (const gy of [0.65, 1.3, 1.95]) k.box(0, gy, 0, 2.8, 0.14, 0.52);
      k.color(TOWER_BLK);
    }
    k.pop();
  }

  k.color(STAINLESS_LT).lathe(
    sx,
    91.8,
    sz,
    [
      [4.5, 0],
      [4.5, 31.0],
      [4.2, 36.5],
      [3.5, 41.5],
      [2.3, 46.0],
      [0.9, 49.2],
      [0.0, 50.4],
    ],
    seg
  );
  k.color(HEATSHIELD).box(sx, 92.2, sz + 3.6, 5.2, 33.0, 2.1);

  for (const s of [-1, 1]) {
    k.color(HEATSHIELD);
    k.box(sx + s * 5.4, 93.0, sz, 2.8, 8.8, 0.45);
    k.box(sx + s * 4.4, 126.5, sz, 2.1, 5.8, 0.4);
  }
}

function megaBay(k, bx, bz) {
  k.push().translate(bx, 0, bz);
  k.glow(false).color(TOWER_BLK).box(0, 0.4, 0, 48, 66.0, 48);
  k.color(STAINLESS).box(0, 0.4, 0, 48.6, 2.5, 48.6).box(0, 66.4, 0, 49.4, 2.2, 49.4);
  k.color(TOWER_STEEL).box(0, 0.4, -24.3, 24, 58.0, 0.6);
  k.glow(true).color(LIT).box(0, 68.6, 0, 46, 10.5, 46);
  k.glow(false).color(GLASS_BAY);
  for (let x = -20; x <= 20; x += 8) {
    k.box(x, 68.6, -23.3, 1.2, 10.5, 0.5).box(x, 68.6, 23.3, 1.2, 10.5, 0.5);
  }
  k.color(TOWER_BLK).box(0, 79.1, 0, 49.0, 2.4, 49.0);
  k.pop();
}

export function build(k) {
  const hi = k.hi;

  k.glow(false).color(CONCRETE).box(0, -2.5, 6, 196, 2.9, 136);

  mechazillaTower(k, -16, -12);
  starshipFullStack(k, 0, -12);

  k.glow(false).color(PAD_DK).box(56, 0.4, -18, 66, 9.5, 34);
  for (let i = 0; i < 6; i++) {
    const tx = 34 + i * 9.0;
    k.color(i % 2 === 0 ? TANK_W : STAINLESS_LT).cyl(tx, 0.4, -18, 3.6, 3.6, 28.5, hi ? 18 : 8);
    k.sphere(tx, 28.9, -18, 3.6, hi ? 16 : 6, 6, 0.65, 0.5);
  }
  if (hi) {
    // Cryogenic subcooler piping manifold bridge connecting tank farm to Orbital Launch Mount
    k.color(STAINLESS).pipe([32, 4.2, -12], [6, 4.2, -12], 0.48, 10);
    k.pipe([32, 5.4, -12], [6, 5.4, -12], 0.42, 10);
    k.pipe([34, 29.8, -18], [79, 29.8, -18], 0.32, 8);
  }

  megaBay(k, -64, 32);

  k.glow(false).color(TOWER_BLK).box(24, 0.4, 52, 54, 7.5, 2.8);
  k.glow(true).color(STAINLESS_LT);
  for (let i = 0; i < 8; i++) {
    k.box(3 + i * 6.0, 2.2, 53.6, 4.2, 4.0, 0.45);
  }
  k.glow(false);
}
