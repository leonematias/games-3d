// Tuning constants for the Mars rover game. Level placement lives in
// backend/mars/config/level.json; this file holds physics and camera defaults.
export const THREE_URL = 'https://unpkg.com/three@0.158.0/build/three.module.js';

export const ROVER = {
  wheelRadius: 0.62,
  wheelWidth: 0.5,
  track: 2.35,        // distance between left and right wheel centres
  wheelbase: 2.7,     // distance between front and rear axles
  clearance: 0.42,    // body underside above the wheel hubs
  acceleration: 5.4,  // units/s^2 while holding forward
  maxSpeed: 19,
  reverseMaxSpeed: 5.5,
  coastDecel: 3.2,    // slowdown when no key is held
  brakeDecel: 11,     // slowdown when the opposite key is held
  turnSpeed: 1.7,     // rad/s while nearly stopped
  turnSpeedAtMax: 0.75, // rad/s at max speed (wider arcs when fast)
  maxSlopeDeg: 38,    // overridden by level.json rover.maxSlopeDeg when present
  pickupRadius: 2.6,   // auto-pickup distance from the rover centre
  edgeMargin: 6
};

export const CAMERA = {
  offset: [0, 5.2, -11],
  lookAtHeight: 1.2,
  minGroundClearance: 1.6,
  lerp: 0.085
};

// Resource catalogue. `foundOn` is shown in the mission panel when a type is
// not available on the current world, so players know where to fly.
export const RESOURCE_TYPES = {
  ice: { label: 'Ice', color: 0xbfe8ff, accent: '#9fdcff', foundOn: 'every world' },
  iron: { label: 'Iron', color: 0x6b3f2f, accent: '#e08a5b', foundOn: 'every world' },
  rocks: { label: 'Rocks', color: 0x8a6a56, accent: '#cdb49b', foundOn: 'every world' },
  silicon: { label: 'Silicon', color: 0xdfe8f2, accent: '#d4e0ec', foundOn: 'Luna, Ceres, Ganymede' },
  titanium: { label: 'Titanium', color: 0xb9b4dc, accent: '#bdb6ea', foundOn: 'Luna, Eros, Callisto' },
  salt: { label: 'Salt', color: 0xfff6cc, accent: '#fff0b8', foundOn: 'Europa, Enceladus, Ceres' },
  organics: { label: 'Organics', color: 0x9fcf5a, accent: '#a6d96a', foundOn: 'Titan, Pluto' }
};

export const FUEL = {
  capacity: 14,          // tank size in fuel units
  perIce: 2,             // fuel units gained per ice converted at the ship
  unitsPerDistance: 10,  // orbital-map distance per fuel unit (cost = round(dist / this), min 1)
  plantSeconds: 45,      // a built fuel plant adds 1 unit every N real seconds while the ship is here
  refuelRange: 40        // distance from the ship at which refuelling works
};

export const FLIGHT = {
  // Transit: a Newtonian flight in the plane of the ecliptic, seen from a chase
  // camera above and behind the ship. Thrust along the heading, turn, flip and
  // burn to brake. The route length scales with the fuel cost of the trip.
  baseSeconds: 30,        // nominal seconds = baseSeconds + fuel cost * secondsPerFuel (capped at maxSeconds)
  secondsPerFuel: 4,
  maxSeconds: 67,
  routePerSecond: 80,     // route length in units per nominal second (Mars→Ceres 3040, Pluto 4960)
  thrust: 50,             // main engine acceleration (units/s²)
  maxSpeed: 120,          // the engine fades out as the speed along the heading reaches this
  turnRate: 3.2,          // radians per second
  flightAssist: 1.6,      // rad/s at which the velocity swings towards the nose while the ship faces forward (0 = pure Newtonian)
  retroAlign: 0.35,       // the flip-and-burn (Down) fires the engine once within this angle of retrograde
  shipRadius: 3.4,
  fieldRadius: 540,       // rocks live within this distance of the ship and recycle beyond it
  asteroidsMin: 16,       // active rocks near departure
  asteroidsMax: 28,       // active rocks near the destination (none inside the gravity ring)
  rockSpeed: [3, 16],     // drift speed of a rock
  seekerChance: 0.08,     // share of rocks that drift towards the ship
  seekerSpeed: 9,
  dangerSeconds: 3.6,     // rocks that come within the hull + dangerMargin in this time get a red ring
  dangerRange: 540,       // and only when closer than this
  dangerMargin: 9,
  graceSeconds: 2,        // no collisions right after departure / restart
  shieldFirstAt: 6,       // seconds until the first shield orb appears
  shieldEvery: [10, 18],  // seconds between orbs after that (random in range)
  shieldPickupRadius: 9,
  destination: {
    captureRadius: 150,   // inside this ring, below arriveSpeed, the ship is captured into orbit
    arriveSpeed: 30,      // speed limit for capture
    bodyRadius: 55,       // hitting the planet faster than arriveSpeed burns the ship up
    gravityRadius: 520,   // the planet pulls on the ship inside this distance
    gravity: 7            // pull at the surface (units/s²), fading to zero at gravityRadius
  },
  boost: {
    multiplier: 2.4,        // thrust (and speed cap) while boosting
    duration: 2.6,          // seconds of boost from a full charge
    recharge: 9,            // seconds to refill an empty charge (while not boosting)
    rechargeDelay: 1.2,     // pause before recharging starts after boosting
    minCharge: 0.25         // charge needed to start a boost
  },
  laser: {
    fireRate: 7,            // shots per second while the trigger is held
    speed: 380,             // bolt speed relative to the ship
    range: 520,             // units a bolt travels before it fades
    radius: 1.6,            // hit radius of a bolt
    heatPerShot: 0.075,     // heat added per shot; at 1.0 the cannons overheat
    coolRate: 0.5,          // heat removed per second (slower while firing)
    overheatLock: 1.6,      // seconds the cannons stay locked after overheating
    rockHpPerRadius: 2.6,   // hits to break a rock = ceil(radius / this): 1 to 3
    skiffHp: 4              // hits to destroy a pirate skiff
  },
  pirates: {
    firstAtProgress: 0.3,   // share of the nominal trip time before the first skiff shows up
    every: [28, 46],        // seconds between skiffs after one leaves
    lifetime: 16,           // seconds a skiff harasses you before peeling off
    fireEvery: [2.6, 4.0],  // seconds between bolts
    boltSpeed: 80,          // absolute bolt speed
    boltLife: 6,            // seconds before a bolt fizzles
    boltRadius: 1.4,
    skiffRadius: 3.2,
    standoff: 150           // how far from the ship the skiff circles
  },
  // Descent onto the base pad after capture: side view, Lunar Lander style.
  landing: {
    startAltitude: 150,     // height above the pad at the start of the descent
    startOffset: [40, 110], // horizontal distance from the pad (random in range, random side)
    startSpeed: 8,          // initial sideways speed towards the pad
    gravityScale: 16,       // surface gravity = world gravity (in g) * this, clamped to [2.5, 7] units/s²
    thrustFactor: 2.4,      // main engine = gravity * thrustFactor + 5
    turnRate: 2.0,          // tilt rate (radians/s), tilt is clamped to maxTilt
    maxTilt: 1.0,
    autoLevel: 1.4,         // the hull drifts back upright at this rate when not turning
    horizontalDrag: 0.35,   // sideways speed fades at this rate per second (RCS trim)
    autoDescent: 4,         // holding Down throttles the engine to sink at this speed
    burnSeconds: 30,        // full propellant lasts this long at full throttle
    padHalfWidth: 28,
    maxVertical: 10,        // touchdown limits
    maxHorizontal: 8,
    maxTiltDeg: 20
  }
};

// Settlement economy. Every settler uses one unit of each need; buildings
// below add capacity, producers add to the world's stockpile over real time,
// and base modules from the mission chain count too (moduleProvides).
export const COLONY = {
  needs: ['housing', 'water', 'power', 'food'],
  needLabels: { housing: 'Housing', water: 'Water', power: 'Power', food: 'Food' },
  lotsPerRow: 5,          // lots opened by each road
  maxRows: 7,
  stockCap: 99,           // per resource type in a world's stockpile
  buildings: {
    road: { label: 'Road', icon: '🛣', desc: 'Opens the next row of five lots', cost: { rocks: 2, iron: 1 }, radius: 0 },
    hab_block: { label: 'Hab Block', icon: '🏢', desc: 'Pressurised apartments', provides: { housing: 12 }, cost: { iron: 3, rocks: 2, ice: 1 }, radius: 4.4 },
    water_plant: { label: 'Water Plant', icon: '💧', desc: 'Melts ice into water and oxygen', provides: { water: 24 }, cost: { ice: 3, iron: 2 }, radius: 3.6 },
    solar_farm: { label: 'Solar Farm', icon: '☀', desc: 'Weaker far from the Sun', provides: { power: 16 }, cost: { silicon: 2, iron: 2 }, radius: 4.6 },
    reactor: { label: 'Fusion Reactor', icon: '⚛', desc: 'Power anywhere, even at Pluto', provides: { power: 40 }, cost: { titanium: 3, iron: 3, ice: 2 }, radius: 3.8 },
    farm_dome: { label: 'Farm Dome', icon: '🌱', desc: 'Crops under glass', provides: { food: 20 }, cost: { ice: 3, iron: 2, organics: 1 }, radius: 4.2 },
    algae_vats: { label: 'Algae Vats', icon: '🧪', desc: 'Protein from brine', provides: { food: 12 }, cost: { ice: 2, salt: 1, iron: 1 }, radius: 3.2 },
    mine: { label: 'Mine', icon: '⛏', desc: 'Digs iron and rock into the stockpile', produces: { iron: 1.5, rocks: 1.5 }, cost: { iron: 2, rocks: 3 }, radius: 3.8 },
    ice_drill: { label: 'Ice Drill', icon: '🧊', desc: 'Drills ice into the stockpile', produces: { ice: 2 }, cost: { iron: 3, rocks: 1 }, radius: 2.6 },
    refinery: { label: 'Refinery', icon: '🏭', desc: 'Refines this world\'s speciality', producesSpecialty: 1, cost: { iron: 4, rocks: 2, ice: 1 }, radius: 3.8 }
  },
  // Outpost / expedition modules that also serve the colony.
  moduleProvides: {
    habitat_dome: { housing: 4 }, command_dome: { housing: 4 }, ring_habitat: { housing: 20 },
    water_extractor: { water: 6 }, solar_array: { power: 6 }, greenhouse_dome: { food: 6 },
    hydroponics_farm: { food: 10 }, algae_vats: {}, spaceport: { batchBonus: 4 }, landing_pad: { batchBonus: 2 }
  },
  transportNames: [
    'Canterbury', 'Rocinante', 'Nauvoo', 'Tycho', 'Donnager', 'Barbapiccola', 'Pella', 'Razorback', 'Scopuli', 'Anubis',
    'Guanshiyin', 'Chetzemoka', 'Weeping Somnambulist', 'Tachi', 'Agatha King', 'Behemoth', 'Edward Israel', 'Zhang Fei', 'Giambattista', 'Ravi'
  ],
  settlerOrigins: ['Earth', 'Luna', 'Mars', 'the Belt', 'Ceres', 'the Jovian moons']
};
