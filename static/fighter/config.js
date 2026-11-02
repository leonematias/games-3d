// Tuning for the Fighter Plane game. Units are metres and seconds.
export const PLANE = {
  minSpeed: 72,
  cruise: 110,
  boostSpeed: 200,
  accel: 38,          // m/s² towards the wanted speed
  pitchRate: 0.65,     // rad/s at full stick
  rollRate: 1.7,      // rad/s at full stick
  maxBank: 1.15,      // rad the bank settles at while the stick is held
  turnRate: 0.6,     // rad/s of heading change at full bank
  autoLevel: 1.6,     // how fast the wings level with no input
  pitchReturn: 0.35,  // how fast the nose drifts back to the horizon
  floor: 28,          // metres over the terrain where the assist pulls up
  ceiling: 1500,
  armor: 100,
  regenDelay: 4,
  regenRate: 6,
  boostSeconds: 3.2,
  boostRecharge: 7,
  respawnSeconds: 3
};

export const CAMERA = {
  back: 27,
  up: 7.5,
  lookAhead: 70,
  lerp: 5.5,
  fov: 62,
  boostFov: 74,
  rollFollow: 0.45
};

export const WEAPONS = {
  gun: { rate: 12, speed: 800, range: 1400, damage: 7, assistDeg: 5, spread: 0.006 },
  missile: { max: 8, rechargeSeconds: 9, speed: 230, turn: 1.8, life: 11, damage: 75, splash: 24, lockDeg: 18, lockRange: 2600, lockSeconds: 0.7 },
  bomb: { max: 6, rechargeSeconds: 11, damage: 200, splash: 70, gravity: 22 },
  emp: { max: 2, rechargeSeconds: 24, radius: 650, damage: 35, stunSeconds: 5 }
};

export const ENEMY = {
  planeSpeed: 100,
  planeTurn: 0.5,
  missileSpeed: 165,
  missileTurn: 1.0,
  missileLife: 11,
  missileDamage: 12,
  missileEvery: 12,
  samRange: 1700,
  samEvery: 11,
  aaRange: 900,
  aaDamage: 3,
  aaSpread: 0.09,
  engageRange: 2400,
  hitRadius: 11
};

export const STRUCTURES = {
  // Built in code (enemies.js BUILDERS).
  hangar: { hp: 160, radius: 24, score: 150, name: 'Hangar' },
  tower: { hp: 90, radius: 9, score: 120, name: 'Control tower' },
  tank: { hp: 60, radius: 10, score: 80, name: 'Fuel tank' },
  radar: { hp: 110, radius: 12, score: 200, name: 'Radar' },
  bunker: { hp: 220, radius: 16, score: 150, name: 'Bunker' },
  sam: { hp: 100, radius: 11, score: 250, name: 'SAM launcher', weapon: 'sam' },
  aa: { hp: 70, radius: 7, score: 150, name: 'AA gun', weapon: 'aa' },
  runway: { hp: 0, radius: 0, score: 0, name: 'Runway' },
  crates: { hp: 30, radius: 8, score: 40, name: 'Supplies' },
  parked: { hp: 70, radius: 12, score: 180, name: 'Parked aircraft' },
  truck: { hp: 40, radius: 6, score: 60, name: 'Fuel truck' },
  armor: { hp: 90, radius: 6, score: 120, name: 'Tank' },
  rig: { hp: 260, radius: 34, score: 400, name: 'Oil platform' },
  // Library models (enemies.js LIBRARY): vehicles, buildings and ships.
  battletank: { hp: 100, radius: 7, score: 130, name: 'Battle tank' },
  heavytank: { hp: 120, radius: 7, score: 140, name: 'Heavy tank' },
  artillery: { hp: 90, radius: 8, score: 140, name: 'Artillery' },
  aatank: { hp: 80, radius: 7, score: 170, name: 'AA tank', weapon: 'aa' },
  mech: { hp: 130, radius: 9, score: 220, name: 'Guard mech', weapon: 'aa' },
  helo: { hp: 60, radius: 10, score: 150, name: 'Parked helicopter' },
  jet: { hp: 70, radius: 10, score: 180, name: 'Parked jet' },
  watertower: { hp: 60, radius: 8, score: 90, name: 'Water tower' },
  turbine: { hp: 50, radius: 8, score: 80, name: 'Wind turbine' },
  antenna: { hp: 80, radius: 7, score: 160, name: 'Comms mast' },
  fuelfarm: { hp: 70, radius: 10, score: 100, name: 'Fuel depot' },
  container: { hp: 40, radius: 7, score: 50, name: 'Containers' },
  barrels: { hp: 20, radius: 4, score: 30, name: 'Fuel drums' },
  keep: { hp: 300, radius: 22, score: 350, name: 'Keep' },
  gatehouse: { hp: 220, radius: 24, score: 250, name: 'Gatehouse' },
  castle: { hp: 420, radius: 50, score: 500, name: 'Citadel' },
  carrier: { hp: 400, radius: 70, score: 600, name: 'Aircraft carrier', afloat: true },
  destroyer: { hp: 200, radius: 32, score: 350, name: 'Destroyer', afloat: true, weapon: 'sam' },
  patrolboat: { hp: 70, radius: 12, score: 120, name: 'Patrol boat', afloat: true, weapon: 'aa' },
  submarine: { hp: 150, radius: 20, score: 250, name: 'Submarine', afloat: true },
  // Decor: not targets, placed by the level generator for the theatre's style.
  rock: { hp: 0, radius: 0, score: 0, name: 'Rocks' },
  boulder: { hp: 0, radius: 0, score: 0, name: 'Boulder' },
  pine: { hp: 0, radius: 0, score: 0, name: 'Pine' },
  deadtree: { hp: 0, radius: 0, score: 0, name: 'Dead tree' },
  palm: { hp: 0, radius: 0, score: 0, name: 'Palm' },
  cactus: { hp: 0, radius: 0, score: 0, name: 'Cactus' },
  lamp: { hp: 0, radius: 0, score: 0, name: 'Lamp post' },
  fence: { hp: 0, radius: 0, score: 0, name: 'Fence' },
  barrier: { hp: 0, radius: 0, score: 0, name: 'Barrier' },
  sandbags: { hp: 0, radius: 0, score: 0, name: 'Sandbags' },
  checkpoint: { hp: 0, radius: 0, score: 0, name: 'Checkpoint' },
  flag: { hp: 0, radius: 0, score: 0, name: 'Flag' },
  approach: { hp: 0, radius: 0, score: 0, name: 'Approach lights' },
  tires: { hp: 0, radius: 0, score: 0, name: 'Tires' }
};

export const SCORE = { plane: 300, baseBonus: 500, waveBonus: 250 };
