// Tuning for Tank Terrain. Units are metres and seconds.
export const TANK = {
  length: 7.2,
  width: 3.4,
  wheelbase: 5.2,     // distance between the front and rear contact points
  track: 3.0,         // distance between the left and right tracks
  radius: 3.3,        // collision circle
  maxSpeed: 21,
  reverseMaxSpeed: 10,
  acceleration: 9,
  coastDecel: 5,
  brakeDecel: 14,
  turnSpeed: 1.5,     // rad/s while nearly stopped
  turnSpeedAtMax: 0.9,
  maxSlopeDeg: 34,
  hp: 100,
  lives: 3,
  battery: 100,
  batteryRegen: 3,     // per second while the laser and the shield are off
  edgeMargin: 12,
  respawnSeconds: 3,
  turretTurn: 2.6,    // rad/s the turret tracks a target
  turretLimit: 0.6,   // rad the turret swings off the hull on its own
  manualTurret: 1.8,  // rad/s with A / D
  recoilKick: 0.09,   // rad the hull pitches up when the cannon fires
  brakeDip: 0.012     // rad of nose dip per m/s² of deceleration
};

// Shift: an energy shield that drains the battery and soaks most damage.
// X: a smoke canister that breaks every enemy's line of sight for a few seconds.
export const SHIELD = { drain: 22, absorb: 0.85, minBattery: 8 };
export const SMOKE = { charges: 2, max: 3, seconds: 7, recharge: 45, radius: 14 };

export const CAMERA = {
  back: 17,
  up: 7.5,
  lookAhead: 24,
  lookUp: 2.2,
  lerp: 6,
  fov: 60,
  minClearance: 2.2
};

// Weapon slots in key order. `ammo` null means unlimited. `battery` drains per second.
// `wallBonus` multiplies damage against walls, towers and huts (the cannon is the breaching gun);
// the machine gun is the only weapon that shoots down incoming missiles.
export const WEAPONS = {
  cannon: { key: 1, name: 'CANNON', ammo: null, rate: 1.0, speed: 95, gravity: 16, damage: 34, splash: 6, size: 5, recoil: 0.5, wallBonus: 2.4 },
  mg: { key: 2, name: 'MACHINE GUN', ammo: 220, max: 400, pickup: 120, rate: 11, speed: 190, damage: 4, splash: 0, spread: 0.018, range: 220, antiMissile: true },
  missile: { key: 3, name: 'MISSILES', ammo: 6, max: 12, pickup: 4, rate: 0.5, speed: 58, turn: 2.4, life: 7, damage: 50, splash: 7, lockDeg: 32, lockRange: 240, lockSeconds: 0.5, wallBonus: 0.5 },
  laser: { key: 4, name: 'LASER', ammo: null, battery: 30, damage: 70, range: 170, radius: 0.5, light: 0xff5040, wallBonus: 0.35 },
  rocket: { key: 5, name: 'ROCKETS', ammo: 12, max: 24, pickup: 8, rate: 0.22, speed: 78, gravity: 3, damage: 32, splash: 7, salvo: 1, spread: 0.025, wallBonus: 1.0 },
  mortar: { key: 6, name: 'MORTAR', ammo: 6, max: 12, pickup: 4, rate: 1.4, speed: 60, gravity: 24, elevation: 1.05, damage: 55, splash: 11, range: 80, wallBonus: 1.2, revealSeconds: 18 },
  nuke: { key: 7, name: 'NUKE', ammo: 1, max: 2, pickup: 1, rate: 3, speed: 70, gravity: 14, damage: 500, splash: 30, size: 30, wallBonus: 1.0 }
};
export const WEAPON_ORDER = ['cannon', 'mg', 'missile', 'laser', 'rocket', 'mortar', 'nuke'];

export const PICKUPS = {
  ammo: { name: 'AMMO', color: 0xffb640 },
  battery: { name: 'BATTERY', color: 0x40e0ff, amount: 50 },
  repair: { name: 'REPAIR KIT', color: 0x50ff70, amount: 40 },
  weapon: { name: 'WEAPON', color: 0xff60d0 },
  flag: { name: 'FLAG', color: 0xffe040 }
};
export const PICKUP_RADIUS = 4.2;

// Enemy tanks. `behaviour`: scouts flank in pairs (each takes a side), heavies
// hold their post (a chokepoint) and never chase, rocket tanks keep their
// distance and fall back behind cover when the player closes in.
export const ENEMY = {
  scout: { name: 'Scout tank', hp: 45, speed: 13, turn: 1.7, radius: 2.5, sight: 170, standoff: 40, weapon: 'mg', fireEvery: 2.6, burst: 8, damage: 3, score: 100, length: 5.4, color: 0x7a8a62, accent: 0x3f4a35, behaviour: 'flank' },
  heavy: { name: 'Heavy tank', hp: 130, speed: 8, turn: 1.1, radius: 3.4, sight: 200, standoff: 60, weapon: 'cannon', fireEvery: 3.2, damage: 22, score: 250, length: 8.2, color: 0x55524a, accent: 0x2d2b26, behaviour: 'hold', holdRadius: 45 },
  rocket: { name: 'Rocket tank', hp: 80, speed: 10, turn: 1.4, radius: 3.0, sight: 230, standoff: 90, weapon: 'missile', fireEvery: 6, damage: 18, score: 200, length: 6.8, color: 0x6a5a4a, accent: 0x3a2e22, behaviour: 'kite' },
  // The boss: a super-heavy that only takes full damage from behind. It holds in the fort yard until the alarm, then hunts.
  boss: { name: 'Mammoth tank', hp: 900, speed: 7, turn: 0.75, radius: 5.2, sight: 260, standoff: 55, weapon: 'cannon', fireEvery: 2.2, damage: 30, score: 2000, length: 11.5, color: 0x4a3a3a, accent: 0x2a1e1e, behaviour: 'boss', frontArmor: 0.15, rearArc: -0.25, missileEvery: 7, missileDamage: 18 }
};

// Rocket troopers on foot: weak, hard to see, they run for cover and fire unguided rockets.
export const TROOPER = { name: 'Rocket trooper', hp: 14, speed: 4.2, radius: 0.7, sight: 120, range: 95, fireEvery: 5.5, damage: 11, score: 40, coverRadius: 28 };

// Attack helicopter: orbits the player at height, strafes with its chin gun and fires rocket pairs.
export const HELI = {
  name: 'Attack helicopter', hp: 110, radius: 3.6, speed: 30, turn: 1.1, altitude: 26, sight: 320, orbit: 85,
  gunEvery: 3.2, burst: 12, gunDamage: 3, rocketEvery: 6.5, rocketDamage: 16, score: 400, climb: 9, launchSeconds: 4
};

// Command truck: calls reinforcements every `every` seconds while alive and the fort is alerted, up to `max` tanks.
export const COMMAND = { name: 'Command truck', hp: 140, radius: 3.2, score: 350, alertRange: 220 };

// Boss level: the keep's shield dome and the generator that powers it.
export const BOSS = { generatorHp: 320, generatorRadius: 5.5, generatorScore: 800, domeMargin: 6, bossRevealRange: 400 };

// Checkpoints: cleared outposts and the breach. Dying sends you back to the latest one.
export const CHECKPOINT = { breachOffset: 34 };

export const TURRETS = {
  gun: { name: 'Gun turret', hp: 60, range: 150, fireEvery: 2.2, burst: 10, damage: 3, radius: 2.6, score: 120, color: 0x6b7362 },
  cannon: { name: 'Cannon turret', hp: 100, range: 190, fireEvery: 2.8, damage: 20, radius: 3.0, score: 180, color: 0x5a5f58 },
  missile: { name: 'Missile turret', hp: 90, range: 240, fireEvery: 5.5, damage: 16, radius: 3.0, score: 220, color: 0x5e5a6e },
  laser: { name: 'Laser turret', hp: 110, range: 140, fireEvery: 4.5, beamSeconds: 1.6, damage: 14, radius: 3.0, score: 260, color: 0x6e4a4a }
};

// Off-road targets. Killing the radar jams the enemy: turret range is halved
// and their missiles stop homing. A depot drops supplies. The supply convoy's
// last truck drops a weapon crate. The captured convoy's trucks are friendly.
export const TARGETS = {
  radar: { name: 'Radar dish', hp: 140, radius: 4.5, score: 300 },
  depot: { name: 'Fuel depot', hp: 70, radius: 4.0, score: 150, blast: 14, blastDamage: 60 },
  truck: { name: 'Supply truck', hp: 45, radius: 2.4, score: 60, speed: 9 },
  convoyBonus: 250,
  camp: { name: 'Captured convoy', score: 400, radius: 34 }
};

// Wall materials: hit points and look. Infinity means indestructible.
export const WALLS = {
  wood: { hp: 30, name: 'wood', color: 0x9a6e3c, thick: 0.9 },
  gate: { hp: 40, name: 'gate', color: 0x7c5a30, thick: 0.9 },
  brick: { hp: 80, name: 'brick', color: 0xa65a46, thick: 1.1 },
  concrete: { hp: 160, name: 'concrete', color: 0x8f8d86, thick: 1.3 },
  steel: { hp: Infinity, name: 'steel', color: 0x5b6672, thick: 1.5 }
};

export const BRIDGE = { hp: 120, wireRange: 75, fuse: 2.2, score: 0 };

// Upgrades bought in the garage with banked score. `per` is the gain per level.
export const UPGRADES = {
  armor: { name: 'Armour plating', desc: '+25 max armour per level', per: 25, max: 4, cost: [300, 600, 1000, 1500] },
  engine: { name: 'Engine', desc: '+10% top speed and acceleration per level', per: 0.1, max: 4, cost: [300, 600, 1000, 1500] },
  turret: { name: 'Turret drive', desc: '+20% turret and gun speed per level', per: 0.2, max: 3, cost: [250, 500, 900] },
  ammo: { name: 'Ammo racks', desc: '+25% ammo capacity and pickup size per level', per: 0.25, max: 3, cost: [250, 500, 900] },
  battery: { name: 'Battery cells', desc: '+25 battery and faster recharge per level', per: 25, max: 3, cost: [250, 500, 900] }
};

export const SCORE = { wall: 10, barrel: 25, flag: 1000, pickup: 20, objective: 500, missileShot: 40, bridge: 0, checkpoint: 100 };

// Weather per level: particles, fog, how far lock-on and enemy sight reach.
export const WEATHER = {
  clear: { name: 'Clear', lock: 1.0, sight: 1.0 },
  rain: { name: 'Rain', lock: 0.9, sight: 0.9, fog: [70, 720], particles: 'rain' },
  snow: { name: 'Snow', lock: 0.85, sight: 0.85, fog: [60, 650], particles: 'snow' },
  fog: { name: 'Ash fog', lock: 0.55, sight: 0.6, fog: [40, 420] },
  night: { name: 'Night', lock: 0.7, sight: 0.45, sightLit: 0.85, fog: [40, 520], particles: 'rain', night: true }
};
