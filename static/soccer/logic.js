// Arcade 4v4 match. Y is up. Yaw 0 faces world -Z (the opponent goal).
// Three.js rotation.y is the same yaw: local forward -Z sweeps toward +X
// when yaw goes negative, which is screen-right with the camera behind.
// input.turn +1 is ArrowRight and decreases yaw.
// right = forward × up = (-fwd.z, fwd.x) on the ground.

export const PITCH = {
  length: 58,
  width: 38,
  halfL: 29,
  halfW: 19,
  goalHalf: 3.66,
  goalH: 2.44,
  boardH: 1.05,
  ballR: 0.18,
};

export const GRAVITY = 14;

const HOME_KEEPER = { speed: 3.5, dive: 6.6, reach: 1.16, shade: 0.32 };

const DEFS = [
  { id: 'ren', team: 'home', role: 'ace', name: 'Ren Kisaragi', number: 10, hair: 'black', kit: 'blue', skin: '#f0c2a0', human: true },
  { id: 'jun', team: 'home', role: 'wing', name: 'Jun Aoi', number: 7, hair: 'brown', kit: 'blue', skin: '#e0aa88', lane: 1 },
  { id: 'kei', team: 'home', role: 'wing', name: 'Kei Asuka', number: 8, hair: 'teal', kit: 'blue', skin: '#e7b898', lane: -1 },
  { id: 'tetsu', team: 'home', role: 'gk', name: 'Tetsu Mori', number: 1, hair: 'orange', kit: 'yellow', skin: '#f3c7a4', keeper: true },
  { id: 'kai', team: 'away', role: 'ace', name: 'Kai Shiranui', number: 9, hair: 'silver', kit: 'red', skin: '#f6d3b0' },
  { id: 'riku', team: 'away', role: 'wing', name: 'Riku Sano', number: 11, hair: 'black', kit: 'red', skin: '#c6865a', lane: -1 },
  { id: 'daichi', team: 'away', role: 'wing', name: 'Daichi Nara', number: 6, hair: 'rust', kit: 'red', skin: '#d7a574', lane: 1 },
  { id: 'goro', team: 'away', role: 'gk', name: 'Goro Ban', number: 1, hair: 'navy', kit: 'black', skin: '#e8b898', keeper: true },
];

const SPOTS = {
  ren: { x: -1.2, z: 5.4, yaw: 0 },
  jun: { x: 5.6, z: 1.6, yaw: 0 },
  kei: { x: -5.6, z: 1.6, yaw: 0 },
  tetsu: { x: 0, z: 27.5, yaw: 0 },
  kai: { x: 0.4, z: -6.8, yaw: Math.PI },
  riku: { x: -7.8, z: -9.2, yaw: Math.PI },
  daichi: { x: 7.8, z: -9.2, yaw: Math.PI },
  goro: { x: 0, z: -27.5, yaw: Math.PI },
};

// Wingers shoot only inside this box in front of the opponent goal.
const AREA_DEPTH = 13.5;
const AREA_HALF = 11.5;

export function idleInput() {
  return {
    forward: 0, turn: 0, sprint: false, passDown: false, slideDown: false,
    elasticoDown: false, giroDown: false,
    shootHeld: false, shootDown: false, shootUp: false,
  };
}

// Axis of a ground roll. Up × v = (vz, 0, -vx). Travel toward +Z rolls about +X,
// so the top of the ball moves toward +Z. Null while the ball is idle.
export function rollAxis(vx, vz) {
  const speed = Math.hypot(vx, vz);
  if (speed < 0.15) return null;
  return { x: vz / speed, y: 0, z: -vx / speed, speed };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(id, extra = 1) {
  let h = extra >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function wrapAngle(a) {
  const t = (a + Math.PI) % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 - Math.PI : t - Math.PI;
}

export function forwardFromYaw(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightFromYaw(yaw) {
  const f = forwardFromYaw(yaw);
  return { x: -f.z, z: f.x };
}

export function yawToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function shotSpec(power) {
  const p = clamp(power, 0, 1);
  if (p < 0.18) return { speed: 19, lift: 1.7, kind: 'snap' };
  if (p < 0.92) return { speed: 18 + p * 8, lift: 3.2 + p * 2.2, kind: 'power' };
  return { speed: 30.5, lift: 5.7, kind: 'drive' };
}

// Chance an on-target shot beats the keeper. Closer, harder, and nearer a post all raise it.
// Wide and over-the-bar shots never reach this. The cap leaves a save and a trickle-in possible.
export function scoreChance(distance, power, place) {
  const near = 1 - distance / (distance + 9);
  const chance = 0.05
    + 0.34 * clamp(near, 0, 1)
    + 0.46 * clamp(power, 0, 1)
    + 0.24 * clamp(place, 0, 1);
  return clamp(chance, 0.04, 0.96);
}

// Uses the real ball integrator; defenders and the keeper are excluded.
export function shotPreview(player, power, lean = 0, overcharge = 0) {
  const probe = { ball: emptyBall(), stats: { shots: 0 } };
  releaseShot(probe, player, power, lean, overcharge);
  const points = [{ x: probe.ball.x, y: probe.ball.y, z: probe.ball.z }];
  let crossing = null;
  for (let i = 0; i < 150; i++) {
    const prev = { ...probe.ball };
    integrateBall(probe.ball, 1 / 60);
    if (i % 4 === 3) points.push({ x: probe.ball.x, y: probe.ball.y, z: probe.ball.z });
    if (prev.z > -PITCH.halfL && probe.ball.z <= -PITCH.halfL) {
      const t = (prev.z + PITCH.halfL) / (prev.z - probe.ball.z);
      const x = prev.x + (probe.ball.x - prev.x) * t;
      const y = prev.y + (probe.ball.y - prev.y) * t;
      crossing = { x, y, onTarget: Math.abs(x) <= PITCH.goalHalf && y <= PITCH.goalH && y >= 0 };
      break;
    }
    if (probe.ball.z < -PITCH.halfL - 2 || Math.hypot(probe.ball.vx, probe.ball.vz) < 1) break;
  }
  const chance = crossing?.onTarget
    ? scoreChance(Math.abs(-PITCH.halfL - player.z), power, Math.abs(crossing.x) / PITCH.goalHalf)
    : 0;
  return { points, crossing, chance };
}

export function stepStamina(p, wantsSprint, running, dt) {
  const sprinting = !!(wantsSprint && !p.sprintLock && p.stamina > 0);
  if (sprinting) p.stamina = Math.max(0, p.stamina - 24 * dt);
  else if (running && p.stamina > 0) p.stamina = Math.max(0, p.stamina - 11 * dt);
  if (p.stamina <= 0) p.sprintLock = true;
  return sprinting;
}

// Off the ball, letting go of sprint brings the bar back. A full bar is about
// five seconds. Sprint stays locked until the bar has climbed out of the red.
function recoverStamina(p, dt) {
  if (p.stamina >= 100) {
    p.sprintLock = false;
    return;
  }
  p.stamina = Math.min(100, p.stamina + 20 * dt);
  if (p.stamina >= 28) p.sprintLock = false;
}

function dist(a, b) { return Math.hypot(a.x - b.x, (a.z ?? 0) - (b.z ?? 0)); }

function byId(match, id) { return match.players.find((p) => p.id === id) || null; }

export function createMatch(cup, seed = 1, roster = null) {
  const players = DEFS.map((def) => {
    const over = roster && roster[def.id] ? roster[def.id] : null;
    return {
      ...def,
      ...(over || {}),
      keeper: !!def.keeper,
      human: !!def.human,
      x: SPOTS[def.id].x,
      z: SPOTS[def.id].z,
      yaw: SPOTS[def.id].yaw,
      vx: 0, vz: 0, speed: 0,
      stamina: 100, sprintLock: false, regenDelay: 0,
      action: null, tackleCd: 0, holdPass: 0, passFrom: null, hold: 0, diveT: 0,
      aiState: null, wrongFoot: 0, wrongX: 0, wrongZ: 0,
    };
  });
  const match = {
    cup,
    homeName: roster?.homeName || 'Aozora',
    awayName: roster?.awayName || 'Akagane',
    firstTo: cup.firstTo || 3,
    parSeconds: cup.parSeconds || 180,
    opp: { ...cup.opponent },
    rng: mulberry32(hashSeed(cup.id || 'cup', seed)),
    time: 0,
    phase: 'kickoff',
    phaseTime: 0.9,
    scoreHome: 0,
    scoreAway: 0,
    kickoff: 'home',
    players,
    ball: emptyBall(),
    banner: null,
    message: '',
    messageT: 0,
    winner: null,
    pendingEnd: null,
    callPass: false,
    callLeft: 0,
    flair: 1,
    flairFollowUntil: 0,
    oneTwoUntil: 0,
    stats: { driveGoals: 0, conceded: 0, oneTwoGoals: 0, saves: 0, shots: 0, blocks: 0, combo: null, comboTime: -99 },
  };
  resetForKickoff(match);
  return match;
}

function emptyBall() {
  return {
    x: 0, y: PITCH.ballR, z: 0,
    vx: 0, vy: 0, vz: 0, ax: 0, az: 0, magnus: 0,
    owner: null, from: null, intended: null, aim: null,
    kind: null, grace: 0, blocked: false,
    shotDist: null, scoreP: null, beaten: null,
  };
}

export function resetForKickoff(match) {
  match.lastPossessionTeam = null;
  match.counterUntil = 0;
  match.counterRunner = null;
  match.oneTwoUntil = 0;
  match.flairFollowUntil = 0;
  for (const p of match.players) {
    const s = SPOTS[p.id];
    p.x = s.x; p.z = s.z; p.yaw = s.yaw;
    p.vx = 0; p.vz = 0; p.speed = 0;
    p.stamina = 100; p.sprintLock = false; p.regenDelay = 0;
    p.action = null; p.tackleCd = 0; p.holdPass = 0; p.passFrom = null; p.hold = 0; p.diveT = 0;
    p.aiState = null; p.wrongFoot = 0; p.wrongX = 0; p.wrongZ = 0;
  }
  match.homePress = null;
  match.homePressUntil = 0;
  match.awayPress = null;
  match.awayPressUntil = 0;
  match.callPass = false;
  match.callLeft = 0;
  const home = match.kickoff !== 'away';
  const kicker = byId(match, home ? 'ren' : 'kai');
  kicker.x = 0;
  kicker.z = home ? 0.9 : -0.9;
  kicker.yaw = home ? 0 : Math.PI;
  const ball = match.ball;
  Object.assign(ball, emptyBall());
  ball.owner = kicker.id;
  placeDribble(match, kicker);
  match.banner = null;
  match.pendingEnd = match.pendingEnd && match.phase === 'end' ? match.pendingEnd : null;
}

export function starsFor(match) {
  if (match.winner !== 'home') return 0;
  return 1 + (match.stats.conceded === 0 ? 1 : 0) + (match.stats.driveGoals > 0 ? 1 : 0);
}

export function scoreFor(match) {
  const timeBonus = Math.max(0, Math.round((match.parSeconds || 180) - match.time));
  return match.scoreHome * 100 + match.stats.driveGoals * 40 + match.stats.oneTwoGoals * 30 + timeBonus;
}

function speedsFor(match, p) {
  if (p.team === 'away') {
    return {
      jog: match.opp.speed, sprint: match.opp.sprint, back: match.opp.speed * 0.62,
      turn: match.opp.turn, turnSprint: match.opp.turn * 0.72,
    };
  }
  if (p.lane) return { jog: 5.25, sprint: 8.25, back: 3.45, turn: 2.9, turnSprint: 1.9 };
  return { jog: 5.55, sprint: 8.95, back: 3.6, turn: 3.2, turnSprint: 2.15 };
}

function face(p, target, dt, turnRate) {
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  if (dx * dx + dz * dz < 0.06) return true;
  const want = Math.atan2(-dx, -dz);
  const diff = wrapAngle(want - p.yaw);
  const max = turnRate * dt;
  p.yaw = wrapAngle(p.yaw + clamp(diff, -max, max));
  return Math.abs(diff) < 0.42;
}

function facingDot(p, target) {
  const f = forwardFromYaw(p.yaw);
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const len = Math.hypot(dx, dz) || 1;
  return (f.x * dx + f.z * dz) / len;
}

function applyMove(p, input, speeds, dt, opts = {}) {
  const wantsSprint = !!(input.sprint && input.forward > 0.2);
  const running = input.forward > 0.2;
  // With the ball, running and sprinting both spend the bar, and standing does not
  // give it back. Off the ball, only sprint spends it. Releasing X refills it slowly.
  let sprinting = wantsSprint;
  if (p.human) {
    if (opts.hasBall) sprinting = stepStamina(p, wantsSprint, running, dt);
    else if (wantsSprint) sprinting = stepStamina(p, true, false, dt);
    else if (!input.sprint) {
      recoverStamina(p, dt);
      sprinting = false;
    } else sprinting = false;
  }
  let rate = sprinting ? speeds.turnSprint : speeds.turn;
  if (opts.charging) rate *= 0.7;
  p.yaw = wrapAngle(p.yaw - (input.turn || 0) * rate * dt);
  let move = 0;
  if (running) move = (sprinting ? speeds.sprint : speeds.jog) * (opts.charging ? 0.42 : 1);
  else if (input.forward < -0.2) move = -speeds.back * (opts.charging ? 0.55 : 1);
  if (p.human && p.stamina <= 0) move = clamp(move, -2.7, 2.7);
  if (opts.kick) move *= 0.25;
  const f = forwardFromYaw(p.yaw);
  p.x += f.x * move * dt;
  p.z += f.z * move * dt;
  p.vx = f.x * move;
  p.vz = f.z * move;
  p.speed = Math.abs(move);
}

function clampPlayer(p) {
  const inset = p.keeper ? 0.45 : 0.75;
  p.x = clamp(p.x, -PITCH.halfW + inset, PITCH.halfW - inset);
  if (p.keeper && p.team === 'home') p.z = clamp(p.z, PITCH.halfL - 7.5, PITCH.halfL - 0.45);
  else if (p.keeper) p.z = clamp(p.z, -PITCH.halfL + 0.45, -PITCH.halfL + 7.5);
  else p.z = clamp(p.z, -PITCH.halfL + inset, PITCH.halfL - inset);
}

export function placeDribble(match, owner) {
  const ball = match.ball;
  if (!owner) return;
  if (owner.action?.name === 'elastico' || owner.action?.name === 'giro') {
    placeSkillBall(match, owner);
    return;
  }
  if (owner.keeper) {
    const fwd = forwardFromYaw(owner.yaw);
    ball.x = owner.x + fwd.x * 0.55;
    ball.z = owner.z + fwd.z * 0.55;
    ball.y = 1.12;
  } else {
    const fwd = forwardFromYaw(owner.yaw);
    const right = rightFromYaw(owner.yaw);
    const phase = match.time * (7.5 + owner.speed * 0.35);
    const side = 0.32 + Math.sin(phase) * 0.14;
    ball.x = owner.x + fwd.x * 0.95 + right.x * side;
    ball.z = owner.z + fwd.z * 0.95 + right.z * side;
    ball.y = PITCH.ballR + Math.abs(Math.sin(phase * 2)) * 0.045;
  }
  ball.vx = owner.vx;
  ball.vz = owner.vz;
  ball.vy = 0;
  ball.ax = 0;
  ball.az = 0;
}

export function kickIntent(match, player) {
  const fwd = forwardFromYaw(player.yaw);
  let mate = null;
  let best = 0.93;
  for (const other of match.players) {
    if (other.team !== player.team || other.keeper || other.id === player.id) continue;
    const dx = other.x - player.x;
    const dz = other.z - player.z;
    const len = Math.hypot(dx, dz);
    if (len < 1.4 || len > 26) continue;
    const dot = (fwd.x * dx + fwd.z * dz) / len;
    if (dot > best) { best = dot; mate = other; }
  }
  if (mate) return { mode: 'pass', mate };
  const goalZ = player.team === 'home' ? -PITCH.halfL : PITCH.halfL;
  if (Math.abs(fwd.z) > 0.05) {
    const t = (goalZ - player.z) / fwd.z;
    if (t > 0.8) {
      const xAt = player.x + fwd.x * t;
      if (Math.abs(xAt) <= PITCH.goalHalf + 0.85) return { mode: 'shot', mate: null };
    }
  }
  return { mode: 'kick', mate: null };
}

export function releaseClearance(match, player, power) {
  const p = clamp(power, 0, 1);
  const fwd = forwardFromYaw(player.yaw);
  const ball = match.ball;
  ball.owner = null;
  ball.from = player.id;
  ball.intended = null;
  ball.aim = null;
  ball.kind = 'kick';
  ball.grace = 0.16;
  ball.blocked = false;
  ball.x = player.x + fwd.x * 0.9;
  ball.z = player.z + fwd.z * 0.9;
  ball.y = 0.28;
  ball.vx = fwd.x * (16 + p * 14);
  ball.vz = fwd.z * (16 + p * 14);
  ball.vy = 0.8 + p * 1.6;
  ball.ax = 0;
  ball.az = 0;
  ball.magnus = 0;
  ball.power = p;
  ball.shotDist = Math.abs((player.team === 'home' ? -PITCH.halfL : PITCH.halfL) - ball.z);
  ball.scoreP = null;
  ball.beaten = null;
  match.stats.shots += 1;
}

export function releaseShot(match, player, power, lean, overcharge = 0) {
  const spec = shotSpec(power);
  const fwd = forwardFromYaw(player.yaw);
  const right = rightFromYaw(player.yaw);
  const curve = lean * (spec.kind === 'drive' ? 16 : spec.kind === 'power' ? 7 : 0);
  const ball = match.ball;
  ball.owner = null;
  ball.from = player.id;
  ball.intended = null;
  ball.aim = null;
  ball.kind = spec.kind;
  ball.grace = 0.2;
  ball.blocked = false;
  ball.x = player.x + fwd.x * 0.92;
  ball.z = player.z + fwd.z * 0.92;
  ball.y = spec.kind === 'drive' ? 0.48 : 0.32;
  ball.vx = fwd.x * spec.speed;
  ball.vz = fwd.z * spec.speed;
  ball.vy = spec.lift + clamp(overcharge, 0, 1) * 5;
  ball.ax = right.x * curve;
  ball.az = right.z * curve;
  ball.magnus = curve === 0 ? 0 : 0.75;
  ball.power = clamp(power, 0, 1);
  ball.setupBonus = player.id === 'ren' && ((match.oneTwoUntil || 0) > (match.time || 0) || (match.flairFollowUntil || 0) > (match.time || 0)) ? 0.16 : 0;
  if (player.id === 'ren') { match.oneTwoUntil = 0; match.flairFollowUntil = 0; }
  ball.shotDist = Math.abs((player.team === 'home' ? -PITCH.halfL : PITCH.halfL) - ball.z);
  ball.scoreP = null;
  ball.beaten = null;
  match.stats.shots += 1;
  return spec;
}

export function launchPass(match, from, target, intended) {
  const ball = match.ball;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  const speed = 20.5;
  ball.owner = null;
  ball.from = from.id;
  ball.intended = intended;
  ball.aim = { x: target.x, z: target.z };
  ball.kind = 'pass';
  ball.power = 0;
  ball.grace = 0.1;
  ball.blocked = false;
  ball.x = from.x + (dx / d) * 0.7;
  ball.z = from.z + (dz / d) * 0.7;
  ball.y = 0.42;
  ball.vx = (dx / d) * speed;
  ball.vz = (dz / d) * speed;
  ball.vy = 4.0;
  ball.ax = 0;
  ball.az = 0;
  ball.magnus = 0;
}

export function leadPoint(mate) {
  const goalZ = mate.team === 'home' ? -PITCH.halfL : PITCH.halfL;
  const dir = Math.sign(goalZ - mate.z) || (mate.team === 'home' ? -1 : 1);
  return {
    x: clamp(mate.x + (mate.vx || 0) * 0.22, -PITCH.halfW + 1.2, PITCH.halfW - 1.2),
    z: clamp(mate.z + dir * 1.7 + (mate.vz || 0) * 0.15, -PITCH.halfL + 2.2, PITCH.halfL - 2.2),
  };
}

export function oneTwoPoint(passer) {
  const f = forwardFromYaw(passer.yaw);
  const lead = 4.3 + Math.min(2.4, (passer.speed || 0) * 0.28);
  return {
    x: clamp(passer.x + f.x * lead, -PITCH.halfW + 1.2, PITCH.halfW - 1.2),
    z: clamp(passer.z + f.z * lead, -PITCH.halfL + 2.2, PITCH.halfL - 2.2),
  };
}

function pointSegDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const ab2 = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / ab2;
  t = clamp(t, 0, 1);
  return Math.hypot(ax + abx * t - px, az + abz * t - pz);
}

export function segmentBlocked(a, b, opponents, radius) {
  for (const o of opponents) {
    if (pointSegDist(o.x, o.z, a.x, a.z, b.x, b.z) < radius) return true;
  }
  return false;
}

export function passAim(from, target, opponents) {
  if (!segmentBlocked(from, target, opponents, 1.15)) return target;
  const options = [];
  for (const side of [1, -1]) {
    const wall = side * (PITCH.halfW - 0.35);
    const mirroredX = wall + (wall - target.x);
    const dx = mirroredX - from.x;
    const dz = target.z - from.z;
    if (Math.abs(dx) < 0.05) continue;
    const t = (wall - from.x) / dx;
    if (t < 0.08 || t > 0.92) continue;
    const hit = { x: wall - side * 0.15, z: clamp(from.z + dz * t, -PITCH.halfL + 2, PITCH.halfL - 2) };
    if (!segmentBlocked(from, hit, opponents, 1.05)) options.push(hit);
  }
  if (!options.length) return target;
  options.sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
  return options[0];
}

function doPass(match, from, to) {
  if (!to) return;
  const enemies = match.players.filter((p) => p.team !== from.team && !p.keeper);
  const aim = passAim(from, leadPoint(to), enemies);
  launchPass(match, from, aim, to.id);
}

export function integrateBall(ball, dt) {
  const prevZ = ball.z;
  if (ball.magnus > 0) {
    ball.vx += ball.ax * dt;
    ball.vz += ball.az * dt;
    ball.magnus -= dt;
    if (ball.y <= PITCH.ballR + 0.04) { ball.ax *= 0.3; ball.az *= 0.3; }
  }
  ball.vy -= GRAVITY * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  const sp = Math.hypot(ball.vx, ball.vz);
  if (sp > 42) { ball.vx *= 42 / sp; ball.vz *= 42 / sp; }

  if (ball.y < PITCH.ballR) {
    ball.y = PITCH.ballR;
    if (ball.vy < 0) ball.vy *= -0.5;
    const f = Math.exp(-1.7 * dt);
    ball.vx *= f;
    ball.vz *= f;
    if (Math.abs(ball.vy) < 0.55) ball.vy = 0;
  }

  if (ball.intended && ball.aim) {
    const dx = ball.aim.x - ball.x;
    const dz = ball.aim.z - ball.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.5) {
      const horiz = Math.hypot(ball.vx, ball.vz) || 1;
      const keep = Math.min(horiz, 2.4 + d * 2.1);
      ball.vx = (ball.vx / horiz) * keep;
      ball.vz = (ball.vz / horiz) * keep;
    }
  }

  const limX = PITCH.halfW - PITCH.ballR;
  if (ball.x > limX) { ball.x = limX; ball.vx = -Math.abs(ball.vx) * 0.84; }
  if (ball.x < -limX) { ball.x = -limX; ball.vx = Math.abs(ball.vx) * 0.84; }

  let goal = null;
  const inMouth = Math.abs(ball.x) <= PITCH.goalHalf && ball.y <= PITCH.goalH && ball.y >= 0;
  if (prevZ > -PITCH.halfL && ball.z <= -PITCH.halfL && inMouth) goal = 'away';
  else if (prevZ < PITCH.halfL && ball.z >= PITCH.halfL && inMouth) goal = 'home';
  else if (ball.y <= PITCH.boardH && Math.abs(ball.x) > PITCH.goalHalf) {
    if (ball.z < -PITCH.halfL + PITCH.ballR) {
      ball.z = -PITCH.halfL + PITCH.ballR;
      ball.vz = Math.abs(ball.vz) * 0.78;
    } else if (ball.z > PITCH.halfL - PITCH.ballR) {
      ball.z = PITCH.halfL - PITCH.ballR;
      ball.vz = -Math.abs(ball.vz) * 0.78;
    }
  }

  let out = null;
  if (!goal && ball.z < -PITCH.halfL - 1.35 && (ball.y > PITCH.goalH || Math.abs(ball.x) > PITCH.goalHalf)) out = 'away';
  if (!goal && ball.z > PITCH.halfL + 1.35 && (ball.y > PITCH.goalH || Math.abs(ball.x) > PITCH.goalHalf)) out = 'home';
  if (ball.grace > 0) ball.grace -= dt;
  return { goal, out };
}

function onGoal(match, which) {
  const homeScored = which === 'away';
  const ball = match.ball;
  if (homeScored) match.scoreHome += 1;
  else {
    match.scoreAway += 1;
    match.stats.conceded += 1;
  }
  const scorer = byId(match, ball.from);
  const combo = homeScored && match.stats.combo === 'one-two' && (match.time - match.stats.comboTime) < 5;
  if (combo) match.stats.oneTwoGoals += 1;
  const drive = homeScored && ball.kind === 'drive' && ball.from === 'ren';
  if (drive) match.stats.driveGoals += 1;
  let title = homeScored ? 'GOAL' : 'SCORED ON';
  let sub = scorer ? scorer.name : '';
  if (drive) {
    title = 'DRIVE SHOT';
    sub = combo ? 'from the one-two' : 'Ren Kisaragi';
  } else if (combo && homeScored) {
    title = 'ONE-TWO';
    sub = scorer ? scorer.name : 'Ren Kisaragi';
  }
  match.banner = { title, sub, good: homeScored };
  match.phase = 'goal';
  match.phaseTime = 1.7;
  match.kickoff = homeScored ? 'away' : 'home';
  if (match.scoreHome >= match.firstTo || match.scoreAway >= match.firstTo) {
    match.pendingEnd = match.scoreHome > match.scoreAway ? 'home' : 'away';
  }
  ball.owner = null;
  ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.ax = 0; ball.az = 0;
  ball.z = which === 'away' ? -PITCH.halfL - 0.65 : PITCH.halfL + 0.65;
  ball.y = clamp(ball.y, PITCH.ballR, 1.5);
}

function onOut(match, which) {
  const gk = match.players.find((p) => p.keeper && p.team === (which === 'home' ? 'home' : 'away'));
  if (!gk) return;
  const ball = match.ball;
  ball.owner = gk.id;
  ball.kind = null;
  ball.intended = null;
  ball.aim = null;
  ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.ax = 0; ball.az = 0;
  ball.grace = 0;
  gk.hold = 0.2;
  match.message = 'GOAL KICK';
  match.messageT = 0.9;
  placeDribble(match, gk);
}

// A barrida only strips an opponent who currently has the ball, and only up close.
function tryBarrida(match, tackler) {
  const ball = match.ball;
  const owner = byId(match, ball.owner);
  if (!owner || owner.team === tackler.team) return false;
  if (ball.grace > 0 && ball.from === tackler.id) return false;
  if (ball.y > 1.5) return false;
  const near = dist(tackler, owner) <= 1.35 || dist(tackler, ball) <= 1.15;
  if (!near) return false;
  if (Math.max(facingDot(tackler, owner), facingDot(tackler, ball)) < 0.05) return false;
  ball.owner = tackler.id;
  ball.kind = null;
  ball.intended = null;
  ball.aim = null;
  ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.ax = 0; ball.az = 0;
  ball.from = tackler.id;
  ball.grace = 0.2;
  match.message = 'BARRIDA';
  match.messageT = 0.7;
  return true;
}

function trySteal(match, tackler) {
  const ball = match.ball;
  if (tackler.wrongFoot > 0) return false;
  if (ball.owner === tackler.id) return false;
  if (ball.grace > 0 && ball.from === tackler.id) return false;
  if (dist(tackler, ball) > 0.98 || ball.y > 1.45) return false;
  if (facingDot(tackler, ball) > 0.12 || !ball.owner) {
    ball.owner = tackler.id;
    ball.kind = null;
    ball.intended = null;
    ball.aim = null;
    ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.ax = 0; ball.az = 0;
    ball.from = tackler.id;
    ball.grace = 0.06;
    return true;
  }
  const f = forwardFromYaw(tackler.yaw);
  ball.owner = null;
  ball.vx = f.x * 7.5;
  ball.vz = f.z * 7.5;
  ball.vy = 1.6;
  ball.kind = null;
  ball.intended = null;
  ball.aim = null;
  ball.from = tackler.id;
  ball.grace = 0.12;
  return true;
}

function nearestOpponentDist(match, p) {
  let best = 99;
  for (const o of match.players) {
    if (o.team === p.team || o.keeper) continue;
    best = Math.min(best, dist(p, o));
  }
  return best;
}

// The presser stays the same player until this window ends, so the role
// does not flicker to whoever happens to be a step closer this frame.
const PRESS_LOCK = 0.55;

function lockedPresserId(match, team) {
  const idKey = team === 'home' ? 'homePress' : 'awayPress';
  const untilKey = team === 'home' ? 'homePressUntil' : 'awayPressUntil';
  const current = match[idKey];
  if (current && match.time < (match[untilKey] || 0)) {
    const holder = byId(match, current);
    const live = holder && holder.team === team && !holder.keeper
      && holder.action?.name !== 'charge' && match.ball.owner !== current;
    if (live) return current;
  }
  let best = null;
  let bd = 1e9;
  for (const p of match.players) {
    if (p.team !== team || p.keeper) continue;
    if (p.action?.name === 'charge') continue;
    const d = dist(p, match.ball);
    if (d < bd) { bd = d; best = p.id; }
  }
  match[idKey] = best;
  match[untilKey] = match.time + PRESS_LOCK;
  return best;
}

function shouldChase(match, p) {
  const d0 = dist(p, match.ball);
  for (const o of match.players) {
    if (o.team !== p.team || o.keeper || o.id === p.id) continue;
    if (dist(o, match.ball) < d0 - 0.35) return false;
  }
  return true;
}

function inTheArea(p, goalZ) {
  return Math.abs(goalZ - p.z) <= AREA_DEPTH && Math.abs(p.x) <= AREA_HALF;
}

function wingSpot(match, p) {
  const ball = match.ball;
  const owner = ball.owner ? byId(match, ball.owner) : null;
  const goalZ = p.team === 'home' ? -PITCH.halfL : PITCH.halfL;
  const ref = owner && owner.team === p.team ? owner : ball;
  const dir = Math.sign(goalZ - ref.z) || (p.team === 'home' ? -1 : 1);
  let z = clamp(ref.z + dir * 5.8, -PITCH.halfL + 7, PITCH.halfL - 7);
  if (owner && owner.id !== p.id && Math.abs(z - owner.z) < 1.8) {
    z = clamp(owner.z + dir * 3.2, -PITCH.halfL + 7, PITCH.halfL - 7);
  }
  let x = p.lane * 8.4;
  if (owner && owner.team === p.team && Math.sign(owner.x) === p.lane && Math.abs(owner.x) > 4.5) {
    x = p.lane * 5.4;
  }
  return { x: clamp(x, -13.4, 13.4), z };
}

// Home wings offer four angles ahead of the teammate who has the ball.
// short checks inside, lane holds the channel, overlap runs in behind,
// wide stretches the touchline. Yaw 0 attacks -Z, so dir -1 puts every
// spot at a smaller z than the owner. Lane +1 is Jun, world +X.
function homeOffers(owner, lane, dir) {
  const spot = (name, x, ahead) => ({
    name,
    x: clamp(x, -13.4, 13.4),
    z: clamp(owner.z + dir * ahead, -PITCH.halfL + 7, PITCH.halfL - 7),
  });
  // Spread the four angles. From a central owner, short is about 30° off
  // the goal, lane about 50°, wide about 80°, overlap almost straight.
  // One defender cannot stand on every pass.
  return [
    spot('short', owner.x + lane * 2.2, 3.6),
    spot('lane', lane * 8.6, 6.4),
    spot('overlap', lane * 1.6, 11),
    spot('wide', lane * 12.2, 2.4),
  ];
}

function offerOpen(from, spot, enemies, other) {
  if (segmentBlocked(from, spot, enemies, 1.15)) return false;
  for (const e of enemies) {
    if (Math.hypot(e.x - spot.x, e.z - spot.z) < 1.8) return false;
  }
  if (other && Math.hypot(other.x - spot.x, other.z - spot.z) < 2.4) return false;
  return true;
}

function pickOffer(spots, order) {
  for (const name of order) {
    const found = spots.find((s) => s.name === name && s.open);
    if (found) return found;
  }
  for (const name of order) {
    const found = spots.find((s) => s.name === name);
    if (found) return found;
  }
  return spots[0];
}

export function homeWingSpot(match, p) {
  if (!p || !p.lane || p.team !== 'home') return null;
  const owner = match.ball.owner ? byId(match, match.ball.owner) : null;
  if (!owner || owner.team !== 'home' || owner.id === p.id) return null;
  const dir = Math.sign(-PITCH.halfL - owner.z) || -1;
  const enemies = match.players.filter((o) => o.team !== 'home' && !o.keeper);
  const other = match.players.find((o) => o.team === 'home' && o.lane && o.id !== p.id);
  const spots = homeOffers(owner, p.lane, dir).map((s) => ({
    ...s,
    open: offerOpen(owner, s, enemies, other),
  }));
  const intent = kickIntent(match, owner);
  const aimed = intent.mode === 'pass' && intent.mate && intent.mate.id === p.id;
  const ownerOnSide = Math.sign(owner.x || 0) === p.lane && Math.abs(owner.x) > 4.5;
  let order;
  if (aimed) order = ['short', 'lane', 'overlap', 'wide'];
  else if (ownerOnSide) order = ['overlap', 'short', 'lane', 'wide'];
  else order = ['wide', 'lane', 'overlap', 'short'];
  return pickOffer(spots, order);
}

function bestPassMate(p, mates, enemies, goalZ) {
  const ranked = mates.slice().sort((a, b) => Math.abs(goalZ - a.z) - Math.abs(goalZ - b.z));
  return ranked.find((m) => !segmentBlocked(p, m, enemies, 1.15)) || ranked[0] || null;
}

function clearerMate(p, mates, enemies, goalZ) {
  const mine = Math.abs(goalZ - p.z);
  let best = null;
  let bestD = 1e9;
  for (const m of mates) {
    if (segmentBlocked(p, m, enemies, 1.15)) continue;
    const d = Math.abs(goalZ - m.z);
    if (d < bestD) { bestD = d; best = m; }
  }
  if (!best) return null;
  const inBox = inTheArea(best, goalZ) && !inTheArea(p, goalZ);
  if (inBox || bestD + 6 <= mine) return best;
  return null;
}

function moveTo(p, to, sprintAt = 3.4) {
  return { to, sprint: dist(p, to) > sprintAt };
}

function carryTarget(p, goalZ, distGoal) {
  if (p.lane) {
    const carry = Math.sign(goalZ - p.z) || (p.team === 'home' ? -1 : 1);
    return {
      to: { x: clamp(p.lane * 8, -12, 12), z: clamp(p.z + carry * 4, -PITCH.halfL + 6, PITCH.halfL - 6) },
      sprint: true,
    };
  }
  return { to: { x: clamp(p.x * 0.35, -8, 8), z: goalZ * 0.9 }, sprint: distGoal > 8 };
}

function shapeTarget(match, p, myGoal) {
  const ball = match.ball;
  if (p.lane) return moveTo(p, wingSpot(match, p));
  return {
    to: {
      x: clamp(ball.x * 0.35, -12, 12),
      z: clamp(ball.z + (myGoal - ball.z) * 0.45, -PITCH.halfL + 6, PITCH.halfL - 6),
    },
    sprint: dist(p, ball) > 6,
  };
}

function challengeRules(match) {
  return match.cup.challenge ? match.opp.challenge : null;
}

// Retain the last team through a pass or shot; loose balls are not turnovers.
function trackPossession(match) {
  const owner = byId(match, match.ball.owner);
  if (!owner) return;
  const rules = challengeRules(match);
  if (rules && owner.team === 'away' && match.lastPossessionTeam === 'home') {
    const runners = match.players.filter((p) => p.team === 'away' && !p.keeper && p.id !== owner.id);
    runners.sort((a, b) => b.z - a.z);
    if (runners.length && match.rng() < rules.counterChance) {
      match.counterRunner = runners[0].id;
      match.counterUntil = match.time + rules.counterDuration;
      match.message = 'COUNTERATTACK!';
      match.messageT = 1;
    }
  }
  if (owner.team === 'home') {
    match.counterUntil = 0;
    match.counterRunner = null;
  }
  match.lastPossessionTeam = owner.team;
}

function supportTarget(match, p, owner, enemies, goalZ) {
  const ref = owner || match.ball;
  const dir = Math.sign(goalZ - ref.z) || (p.team === 'home' ? -1 : 1);
  if (owner && owner.team === 'away' && p.id === match.counterRunner && match.time < match.counterUntil) {
    return { to: { x: clamp((p.lane || -Math.sign(owner.x) || 1) * 8, -12, 12),
      z: clamp(Math.max(p.z + 3, owner.z + 9), -PITCH.halfL + 5, PITCH.halfL - 5) }, sprint: true };
  }
  if (p.lane) {
    if (p.team === 'home' && owner && owner.team === 'home') {
      const spot = homeWingSpot(match, p);
      if (spot) return moveTo(p, spot);
    }
    if (p.team === 'away' && owner) {
      const weak = -(Math.sign(owner.x) || 1);
      if (p.lane === weak) {
        const far = {
          x: clamp(p.lane * 12.2, -13.4, 13.4),
          z: clamp(owner.z + dir * 9.2, -PITCH.halfL + 7, PITCH.halfL - 7),
        };
        if (!segmentBlocked(owner, far, enemies, 1.15)) return moveTo(p, far);
      }
      return moveTo(p, {
        x: clamp(p.lane * 11, -13.4, 13.4),
        z: clamp(owner.z, -PITCH.halfL + 7, PITCH.halfL - 7),
      });
    }
    let spot = wingSpot(match, p);
    if (owner && segmentBlocked(owner, spot, enemies, 1.15)) {
      spot = { x: clamp(p.lane * 12.2, -13.4, 13.4), z: spot.z };
    }
    return moveTo(p, spot);
  }
  if (owner && p.team === 'away') {
    const x = clamp(-owner.x * 0.55, -12, 12);
    const open = {
      x,
      z: clamp(owner.z + dir * 5.5, -PITCH.halfL + 8, PITCH.halfL - 8),
    };
    if (!segmentBlocked(owner, open, enemies, 1.15)) return { to: open, sprint: dist(p, owner) > 6 };
    return {
      to: { x, z: clamp(owner.z + dir * 1.5, -PITCH.halfL + 8, PITCH.halfL - 8) },
      sprint: dist(p, owner) > 6,
    };
  }
  return { to: { x: p.x, z: p.z }, sprint: false };
}

function pressTarget(match, p, owner, myGoal) {
  const rules = p.team === 'away' && challengeRules(match);
  const closingShot = rules && owner.action?.name === 'charge' && owner.action.t >= rules.chargeReaction;
  const side = {
    x: clamp(owner.x * 0.85, -PITCH.halfW + 1, PITCH.halfW - 1),
    z: clamp(owner.z + Math.sign(myGoal - owner.z || 1) * (closingShot ? 0.45 : 1.15), -PITCH.halfL + 1.2, PITCH.halfL - 1.2),
  };
  const range = p.team === 'away' ? match.opp.tackleRange : 1.32;
  if (dist(p, match.ball) < range && facingDot(p, match.ball) > 0.3 && p.tackleCd <= 0) return { tackle: true };
  return { to: closingShot ? { x: match.ball.x, z: side.z } : side, sprint: dist(p, owner) > (closingShot ? 0.8 : 2.4) };
}

function coverTarget(match, p, owner, myGoal) {
  const pressId = lockedPresserId(match, p.team);
  const defenders = match.players
    .filter((o) => o.team === p.team && !o.keeper && !o.human && o.id !== pressId)
    .sort((a, b) => Math.abs(myGoal - a.z) - Math.abs(myGoal - b.z));
  const threats = match.players
    .filter((o) => o.team !== p.team && !o.keeper && o.id !== owner.id)
    .sort((a, b) => Math.abs(myGoal - a.z) - Math.abs(myGoal - b.z));
  const index = defenders.findIndex((d) => d.id === p.id);
  const mark = threats[index] || threats[threats.length - 1] || owner;
  const rules = p.team === 'away' && challengeRules(match);
  if (rules && index === 0 && owner.action?.name === 'charge' && owner.action.t >= rules.chargeReaction) {
    const fwd = forwardFromYaw(owner.yaw);
    return { to: { x: clamp(owner.x + fwd.x * 3.2, -17, 17),
      z: clamp(owner.z + fwd.z * 3.2, -PITCH.halfL + 2, PITCH.halfL - 2) }, sprint: true };
  }
  if (rules?.laneGuard && mark !== owner
    && (index !== 0 || dist(p, owner) > 6 || (mark.human && owner.passFrom === mark.id && owner.holdPass > 0))) {
    const returnRun = mark.human && owner.passFrom === mark.id && owner.holdPass > 0;
    const target = returnRun ? oneTwoPoint(mark) : { x: mark.x + mark.vx * 0.25, z: mark.z + mark.vz * 0.25 };
    return { to: { x: clamp(owner.x + (target.x - owner.x) * 0.7, -16, 16),
      z: clamp(owner.z + (target.z - owner.z) * 0.7, -PITCH.halfL + 3, PITCH.halfL - 3) }, sprint: true };
  }
  if (p.team === 'away' && (match.cup.tactic === 'pair-press' || match.cup.tactic === 'drive-threat') && index === 0 && dist(p, owner) < 11) {
    const target = {
      x: clamp(owner.x + Math.sign(p.x - owner.x || 1) * 2.2, -15, 15),
      z: clamp(owner.z + Math.sign(myGoal - owner.z) * 2.1, -PITCH.halfL + 3, PITCH.halfL - 3),
    };
    return { to: target, sprint: dist(p, target) > 2.5 };
  }
  return {
    to: {
      x: clamp(mark.x * 0.9, -12, 12),
      z: clamp(mark.z + (myGoal - mark.z) * 0.32, -PITCH.halfL + 4, PITCH.halfL - 4),
    },
    sprint: dist(p, mark) > 5,
  };
}

function teammateToPass(match, player) {
  const aimed = kickIntent(match, player);
  if (aimed.mode === 'pass' && aimed.mate) return aimed.mate;
  const fwd = forwardFromYaw(player.yaw);
  let best = null;
  let score = -2;
  for (const other of match.players) {
    if (other.team !== player.team || other.keeper || other.id === player.id) continue;
    const dx = other.x - player.x;
    const dz = other.z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    const dot = (fwd.x * dx + fwd.z * dz) / len;
    const s = dot - len * 0.012;
    if (s > score) { score = s; best = other; }
  }
  return best;
}

function withBall(match, p, goalZ, enemies, mates) {
  const distGoal = Math.abs(goalZ - p.z);
  const nearest = nearestOpponentDist(match, p);
  if (p.team === 'away' && match.time < match.counterUntil && distGoal > 10) {
    const runner = mates.find((m) => m.id === match.counterRunner);
    if (runner && runner.z > p.z + 2 && dist(p, runner) < 22 && !segmentBlocked(p, runner, enemies, 1.15)) {
      p.aiState = 'release';
      return { pass: true, passTo: runner.id };
    }
  }
  // A shout for the ball outranks a finish while the lane back to Ren is open.
  if (p.team === 'home' && match.callPass) {
    const ren = byId(match, 'ren');
    if (ren && !segmentBlocked(p, ren, enemies, 1.15)) {
      p.aiState = 'release';
      return { pass: true, passTo: ren.id };
    }
  }
  if (p.id === 'kai' && match.opp.drive && distGoal < 18 && distGoal > 8.5 && nearest > 1.7) {
    p.aiState = 'finish';
    return { charge: true };
  }
  const close = !!(p.lane && inTheArea(p, goalZ));
  const room = p.aiState === 'finish' ? nearest >= 1.15 : nearest > 1.45;
  if (close && room) {
    p.aiState = 'finish';
    return { shoot: true, power: p.team === 'home' ? 0.7 : 0.55 };
  }
  if (!p.lane && distGoal < match.opp.shootRange && Math.abs(p.x) < 12) {
    p.aiState = 'finish';
    return { shoot: true, power: p.id === 'kai' ? 0.7 : 0.5 };
  }

  const pressedCut = p.aiState === 'carry' ? 1.55 : p.aiState === 'release' ? 2.3 : 2.0;
  const pressed = nearest < pressedCut;
  const better = clearerMate(p, mates, enemies, goalZ);
  if (pressed || better) {
    const passTo = better || bestPassMate(p, mates, enemies, goalZ);
    if (passTo) {
      p.aiState = 'release';
      return { pass: true, passTo: passTo.id };
    }
  }
  if (close) {
    p.aiState = 'finish';
    return { shoot: true, power: 0.55 };
  }
  p.aiState = 'carry';
  return carryTarget(p, goalZ, distGoal);
}

function think(match, p) {
  const ball = match.ball;
  const goalZ = p.team === 'home' ? -PITCH.halfL : PITCH.halfL;
  const myGoal = -goalZ;
  const enemies = match.players.filter((o) => o.team !== p.team && !o.keeper);
  const mates = match.players.filter((o) => o.team === p.team && o.id !== p.id && !o.keeper);

  if (ball.owner === p.id) return withBall(match, p, goalZ, enemies, mates);

  if (!ball.owner) {
    if (shouldChase(match, p)) {
      p.aiState = 'recover';
      return { to: { x: ball.x, z: ball.z }, sprint: true };
    }
    p.aiState = 'shape';
    return shapeTarget(match, p, myGoal);
  }

  const owner = byId(match, ball.owner);
  if (owner && owner.team !== p.team) {
    if (lockedPresserId(match, p.team) === p.id) {
      p.aiState = 'press';
      return pressTarget(match, p, owner, myGoal);
    }
    p.aiState = 'cover';
    return coverTarget(match, p, owner, myGoal);
  }

  p.aiState = 'support';
  return supportTarget(match, p, owner, enemies, goalZ);
}

function renWantsReturn(match, ren) {
  if (!ren) return false;
  const input = match.input;
  if (input && (input.sprint || input.forward > 0.2)) return true;
  return ren.speed > 2.2;
}

function playReturn(match, p, point) {
  launchPass(match, p, point, 'ren');
  match.stats.combo = 'one-two';
  match.stats.comboTime = match.time;
  match.oneTwoUntil = match.time + 3;
  match.message = 'ONE-TWO: SHOOT!';
  match.messageT = 1.1;
  p.holdPass = 0;
  p.aiState = 'release';
  p.action = { name: 'kick', t: 0, dur: 0.28, pass: true };
}

function stepAi(match, p, dt) {
  if (p.wrongFoot > 0) {
    const speeds = speedsFor(match, p);
    p.wrongFoot = Math.max(0, p.wrongFoot - dt);
    const spd = speeds.sprint;
    const wx = p.wrongX || 0;
    const wz = p.wrongZ || 0;
    p.x += wx * spd * dt;
    p.z += wz * spd * dt;
    p.vx = wx * spd;
    p.vz = wz * spd;
    p.speed = spd;
    if (wx || wz) p.yaw = Math.atan2(-wx, -wz);
    return;
  }
  const speeds = speedsFor(match, p);
  const ball = match.ball;
  // A pass from Ren is held for a short beat. If he is moving, or he shouts,
  // it comes back ahead of his facing as long as that lane is open. A defender
  // standing on the receiver does not cancel it. If Ren has stopped, the wing
  // waits instead of shooting or carrying the ball away.
  if (p.team === 'home' && p.lane && ball.owner === p.id && p.passFrom === 'ren' && p.holdPass > 0) {
    const ren = byId(match, 'ren');
    const enemies = match.players.filter((o) => o.team !== p.team && !o.keeper);
    const point = ren ? oneTwoPoint(ren) : null;
    const laneOpen = !!(point && !segmentBlocked(p, point, enemies, 1.15));
    const moving = renWantsReturn(match, ren);
    if ((moving || match.callPass) && laneOpen) {
      playReturn(match, p, point);
      return;
    }
    if (match.callPass && ren && !segmentBlocked(p, ren, enemies, 1.15)) {
      doPass(match, p, ren);
      p.holdPass = 0;
      p.aiState = 'release';
      p.action = { name: 'kick', t: 0, dur: 0.28, pass: true };
      return;
    }
    if (!moving) {
      p.aiState = 'hold';
      if (ren) face(p, point || ren, dt, speeds.turn);
      p.speed = 0;
      p.vx = 0;
      p.vz = 0;
      return;
    }
  }
  if (p.action?.name === 'kick') {
    applyMove(p, { forward: 0.3, turn: 0, sprint: false }, speeds, dt, { kick: true });
    return;
  }
  if (p.action?.name === 'tackle') {
    applyMove(p, { forward: 1, turn: 0, sprint: true }, speeds, dt, {});
    if (p.action.t < 0.2) {
      const f = forwardFromYaw(p.yaw);
      p.x += f.x * 7.2 * dt;
      p.z += f.z * 7.2 * dt;
      p.speed = 7.2;
      trySteal(match, p);
    }
    return;
  }
  if (p.action?.name === 'charge') {
    const goalZ = p.team === 'home' ? -PITCH.halfL : PITCH.halfL;
    face(p, { x: p.x > 0 ? -2.5 : 2.5, z: goalZ }, dt, 1.6);
    if (ball.owner !== p.id) { p.action = null; return; }
    if (p.action.t >= 0.7) {
      releaseShot(match, p, 1, (match.rng() - 0.5) * 0.3);
      p.action = { name: 'kick', t: 0, dur: 0.34 };
    }
    return;
  }

  const wish = think(match, p);
  if (wish.charge && ball.owner === p.id) {
    p.action = { name: 'charge', t: 0, dur: 99, power: 0, lean: 0 };
    return;
  }
  if (wish.pass && ball.owner === p.id) {
    doPass(match, p, byId(match, wish.passTo));
    p.action = { name: 'kick', t: 0, dur: 0.3, pass: true };
    return;
  }
  if (wish.shoot && ball.owner === p.id) {
    const goalZ = p.team === 'home' ? -PITCH.halfL : PITCH.halfL;
    const corner = (p.x >= 0 ? -1 : 1) * (2.15 + match.rng() * 0.7);
    const aligned = face(p, { x: corner, z: goalZ }, dt, speeds.turn);
    applyMove(p, { forward: aligned ? 0.15 : 0, turn: 0, sprint: false }, speeds, dt, {});
    if (aligned) {
      const err = (p.team === 'away' ? match.opp.aimError : 0.18) * (match.rng() - 0.5);
      p.yaw = wrapAngle(p.yaw + err);
      releaseShot(match, p, wish.power || 0.5, 0);
      p.action = { name: 'kick', t: 0, dur: 0.32 };
    }
    return;
  }
  if (wish.tackle && p.tackleCd <= 0) {
    face(p, ball, dt, speeds.turn * 1.5);
    p.action = { name: 'tackle', t: 0, dur: 0.44 };
    p.tackleCd = p.team === 'away' ? 1.08 : 0.9;
    return;
  }
  if (wish.to) {
    const aligned = face(p, wish.to, dt, speeds.turn);
    const far = dist(p, wish.to) > 0.7;
    applyMove(p, { forward: aligned || far ? 1 : 0, turn: 0, sprint: !!(wish.sprint && aligned) }, speeds, dt, {});
    if (!far && aligned) { p.speed = 0; p.vx = 0; p.vz = 0; }
  }
}

function keeperSkill(match, gk) {
  if (gk.team === 'home') return HOME_KEEPER;
  return {
    speed: match.opp.keeperSpeed,
    dive: match.opp.keeperDive,
    reach: match.opp.keeperReach,
    shade: match.opp.shade,
  };
}

function stepKeeper(match, gk, dt) {
  const ball = match.ball;
  const skill = keeperSkill(match, gk);
  const myGoal = gk.team === 'home' ? PITCH.halfL : -PITCH.halfL;
  const sign = gk.team === 'home' ? 1 : -1;
  const shade = clamp(ball.x * skill.shade, -2.35, 2.35);
  const targetZ = myGoal - sign * 1.4;
  const toward = gk.team === 'home' ? ball.vz > 2 : ball.vz < -2;
  const distLine = Math.abs(myGoal - ball.z);
  const fast = Math.hypot(ball.vx, ball.vz) > 11;
  const shot = !ball.owner && toward && fast && distLine < 13 && ball.kind !== 'pass';
  if (shot) {
    if (gk.action?.name !== 'dive') {
      const power = shotPower(ball);
      gk.readErr = (match.rng() - 0.5) * (0.5 + power * 2.3);
    }
    const t = distLine / Math.max(4, Math.abs(ball.vz));
    const predX = ball.x + ball.vx * t + 0.5 * ball.ax * t * t + (gk.readErr || 0);
    gk.x += clamp(predX - gk.x, -skill.dive * dt, skill.dive * dt);
    gk.diveT = 0.32;
    gk.z += clamp(targetZ - gk.z, -skill.speed * dt, skill.speed * dt);
    if (gk.action?.name !== 'dive') gk.action = { name: 'dive', t: 0, dur: 0.48, dir: Math.sign(predX - gk.x) || 1 };
  } else if (ball.owner !== gk.id) {
    gk.x += clamp(shade - gk.x, -skill.speed * dt, skill.speed * dt);
    gk.z += clamp(targetZ - gk.z, -skill.speed * dt, skill.speed * dt);
    gk.diveT = Math.max(0, gk.diveT - dt);
    gk.yaw = gk.team === 'home' ? 0 : Math.PI;
  }
  gk.speed = 0;
  gk.vx = 0;
  gk.vz = 0;

  if (ball.owner === gk.id) {
    gk.hold = (gk.hold || 0) + dt;
    placeDribble(match, gk);
    gk.yaw = gk.team === 'home' ? 0 : Math.PI;
    const shout = gk.team === 'home' && match.callPass;
    if (gk.hold > 0.45 || shout) {
      let mate = null;
      if (gk.team === 'home') mate = byId(match, 'ren');
      else {
        const mates = match.players.filter((p) => p.team === gk.team && !p.keeper);
        const attack = PITCH.halfL;
        mates.sort((a, b) => Math.abs(attack - a.z) - Math.abs(attack - b.z));
        mate = mates[0] || null;
      }
      if (mate) {
        launchPass(match, gk, { x: mate.x, z: mate.z }, mate.id);
        gk.hold = 0;
        gk.action = { name: 'kick', t: 0, dur: 0.28, pass: true };
      }
    }
  } else if (!shot) gk.hold = 0;
}

function shotPower(ball) {
  if (typeof ball.power === 'number') return clamp(ball.power, 0, 1);
  if (ball.kind === 'drive') return 1;
  if (ball.kind === 'power') return 0.55;
  if (ball.kind === 'snap') return 0.12;
  return 0.3;
}

function closestOnSeg(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const ab2 = abx * abx + abz * abz || 1;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / ab2, 0, 1);
  return { t, dist: Math.hypot(ax + abx * t - px, az + abz * t - pz) };
}

function crossingAtGoal(ball, goalZ) {
  const vz = ball.vz;
  if (Math.abs(vz) < 1.5) return null;
  const t = (goalZ - ball.z) / vz;
  if (t < 0 || t > 2.8) return null;
  const x = ball.x + ball.vx * t + 0.5 * (ball.ax || 0) * t * t;
  const y = ball.y + ball.vy * t - 0.5 * GRAVITY * t * t;
  if (y < -0.05 || y > PITCH.goalH) return null;
  if (Math.abs(x) > PITCH.goalHalf) return null;
  return { x, y, t };
}

function tryKeeperSave(match, prev) {
  const ball = match.ball;
  if (ball.owner) return;
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed < 9) return;
  for (const gk of match.players) {
    if (!gk.keeper) continue;
    const myGoal = gk.team === 'home' ? PITCH.halfL : -PITCH.halfL;
    const toward = gk.team === 'home' ? ball.vz > 1.2 : ball.vz < -1.2;
    if (!toward) continue;
    if (ball.kind === 'pass' && ball.from) {
      const from = byId(match, ball.from);
      if (from && from.team === gk.team) continue;
    }
    const skill = keeperSkill(match, gk);
    const power = shotPower(ball);
    const reach = skill.reach * (0.95 - power * 0.5) + (gk.diveT > 0 ? 0.12 : 0);
    const hit = closestOnSeg(gk.x, gk.z, prev.x, prev.z, ball.x, ball.z);
    const aimed = ball.kind !== 'pass' ? crossingAtGoal(ball, myGoal) : null;
    let called = false;
    if (aimed) {
      if (ball.beaten == null) {
        const distance = typeof ball.shotDist === 'number' ? ball.shotDist : Math.abs(myGoal - ball.z);
        const place = Math.abs(aimed.x) / PITCH.goalHalf;
        ball.scoreP = clamp(scoreChance(distance, power, place) + (ball.setupBonus || 0), 0.04, 0.96);
        const shooter = ball.from ? byId(match, ball.from) : null;
        if (shooter && shooter.team === 'away') {
          ball.scoreP = clamp(ball.scoreP + (match.opp.scoreBias || 0), 0.04, 0.96);
        }
        ball.beaten = match.rng() < ball.scoreP;
      }
      if (ball.beaten) continue;
      called = Math.abs(myGoal - ball.z) < 5.2;
    }
    if (!called && hit.dist > reach) continue;
    if (!aimed && match.rng() < power * 0.48) continue;
    const y = prev.y + (ball.y - prev.y) * hit.t;
    if (!called && y > 2.15) continue;
    if (called) gk.x = clamp(aimed.x, -PITCH.goalHalf + 0.2, PITCH.goalHalf - 0.2);
    ball.owner = gk.id;
    ball.kind = null;
    ball.intended = null;
    ball.aim = null;
    ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.ax = 0; ball.az = 0; ball.magnus = 0;
    ball.grace = 0;
    gk.hold = 0.05;
    gk.diveT = 0.2;
    match.stats.saves += 1;
    match.message = gk.team === 'home' ? 'SAVE' : 'SAVED';
    match.messageT = 0.75;
    return;
  }
}

function blocks(match) {
  const ball = match.ball;
  if (ball.owner || ball.blocked || ball.kind === 'pass') return;
  if (ball.grace > 0.04) return;
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed < 8) return;
  for (const p of match.players) {
    if (p.keeper || p.id === ball.from) continue;
    if (ball.y > 1.6) continue;
    const d = dist(p, ball);
    if (d > 0.52 || d < 0.001) continue;
    const sp = speed * 0.4;
    ball.vx = ((ball.x - p.x) / d) * sp;
    ball.vz = ((ball.z - p.z) / d) * sp;
    ball.vy = 3.3;
    ball.ax = 0; ball.az = 0; ball.magnus = 0;
    ball.kind = null;
    ball.intended = null;
    ball.aim = null;
    ball.from = p.id;
    ball.grace = 0.12;
    ball.blocked = true;
    match.stats.blocks += 1;
    return;
  }
}

function interceptPass(match, prev) {
  const ball = match.ball;
  const rules = challengeRules(match);
  const passer = byId(match, ball.from);
  if (!rules || !passer || ball.owner || ball.kind !== 'pass') return;
  let first = null;
  for (const p of match.players) {
    if (p.team === passer.team || p.keeper || p.wrongFoot > 0) continue;
    const hit = closestOnSeg(p.x, p.z, prev.x, prev.z, ball.x, ball.z);
    const y = prev.y + (ball.y - prev.y) * hit.t;
    const reach = p.team === 'away' ? rules.interceptReach : 0.8;
    if (hit.dist <= reach && y <= 1.4 && (!first || hit.t < first.t)) first = { p, t: hit.t };
  }
  if (!first) return;
  Object.assign(ball, emptyBall(), { owner: first.p.id });
  first.p.passFrom = null;
  first.p.holdPass = 0;
  match.message = 'INTERCEPTED!';
  match.messageT = 0.8;
}

function claims(match) {
  const ball = match.ball;
  if (ball.owner) return;
  const order = match.players.slice().sort((a, b) => {
    const ai = ball.intended === a.id ? 0 : 1;
    const bi = ball.intended === b.id ? 0 : 1;
    if (!challengeRules(match) && ai !== bi) return ai - bi;
    return dist(a, ball) - dist(b, ball);
  });
  for (const p of order) {
    if (p.keeper || p.wrongFoot > 0) continue;
    if (ball.grace > 0 && ball.from === p.id) continue;
    const d = dist(p, ball);
    const intended = ball.intended === p.id;
    const contested = intended && challengeRules(match)
      && match.players.some((other) => other.team !== p.team && !other.keeper && dist(other, p) < 2.5);
    const reach = intended ? (contested ? 0.85 : 1.6) : (ball.kind === 'drive' ? 0.58 : ball.kind === 'pass' ? 0.8 : 0.98);
    if (d > reach) continue;
    if (ball.y > (intended ? 1.9 : 1.4)) continue;
    const speed = Math.hypot(ball.vx, ball.vz);
    if (!intended && speed > 12.5 && ball.kind !== 'pass') continue;
    p.passFrom = ball.from;
    if (p.team === 'home' && p.lane && ball.from === 'ren' && ball.kind === 'pass') p.holdPass = 1.15;
    ball.owner = p.id;
    ball.intended = null;
    ball.aim = null;
    ball.kind = null;
    ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.ax = 0; ball.az = 0;
    ball.grace = 0;
    return;
  }
}

function separate(players) {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      const min = (a.keeper || b.keeper) ? 0.8 : 1.05;
      if (d < 0.0001) { dx = 0.02; dz = 0; d = 0.02; }
      if (d >= min) continue;
      const push = (min - d) * 0.5;
      const nx = dx / d;
      const nz = dz / d;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
    }
  }
}

// Later rounds shake off a trick sooner. The quarter (no score bias) stays sold for 0.4s.
function wrongFootDur(match) {
  const bias = match.opp?.scoreBias || 0;
  if (bias >= 0.15) return 0.2;
  if (bias >= 0.05) return 0.3;
  return 0.4;
}

// Ball and body for one frame of a trick. Positions are relative to the spot
// where the move started, so a shove from another player cannot bend it.
// Elástico side +1 exits along right (+X at yaw 0). The fake is the other way.
// Giro spin +1 carries the ball from -Z toward -X at yaw 0. Gameplay yaw stays
// put so the camera does not spin; action.visual is the body's extra turn.
function skillFrame(action) {
  const base = forwardFromYaw(action.yaw);
  const right = rightFromYaw(action.yaw);
  if (action.name === 'elastico') {
    const fakeEnd = 0.12;
    const side = action.side;
    const from = -0.55 * side;
    const to = 1.65 * side;
    let lateral;
    let along;
    let pace;
    if (action.t <= fakeEnd) {
      const u = action.t / fakeEnd;
      lateral = from * u;
      along = 0.12 * u;
      pace = 4.2;
    } else {
      const u = clamp((action.t - fakeEnd) / (action.dur - fakeEnd), 0, 1);
      const e = u * u * (3 - 2 * u);
      lateral = from + (to - from) * e;
      along = 0.12 + 0.5 * e;
      pace = 8.5;
    }
    const renLat = lateral * 0.7;
    const x = action.ox + right.x * renLat + base.x * along;
    const z = action.oz + right.z * renLat + base.z * along;
    const sell = action.t <= fakeEnd ? -side : side;
    const hopU = action.t <= fakeEnd ? 0 : clamp((action.t - fakeEnd) / (action.dur - fakeEnd), 0, 1);
    return {
      x, z, yaw: action.yaw, visual: 0, speed: pace,
      vx: base.x * 1.6 + right.x * sell * pace,
      vz: base.z * 1.6 + right.z * sell * pace,
      ballX: x + base.x * 0.8 + right.x * (lateral - renLat),
      ballZ: z + base.z * 0.8 + right.z * (lateral - renLat),
      ballY: PITCH.ballR + Math.sin(hopU * Math.PI) * 0.1,
      bvx: base.x * 1.6 + right.x * sell * pace,
      bvz: base.z * 1.6 + right.z * sell * pace,
    };
  }
  const u = clamp(action.t / action.dur, 0, 1);
  const visual = action.spin * Math.PI * 2 * u;
  const face = forwardFromYaw(action.yaw + visual);
  const tangent = rightFromYaw(action.yaw + visual);
  const burstU = clamp((u - 0.72) / 0.28, 0, 1);
  const burst = 2 * burstU * burstU;
  const orbit = 0.78 * Math.PI * 2 / action.dur;
  return {
    x: action.ox + base.x * burst,
    z: action.oz + base.z * burst,
    yaw: action.yaw,
    visual,
    speed: 3.2 + burst * 6,
    vx: base.x * burst * 8,
    vz: base.z * burst * 8,
    ballX: action.ox + base.x * burst + face.x * 0.78,
    ballZ: action.oz + base.z * burst + face.z * 0.78,
    ballY: PITCH.ballR,
    bvx: tangent.x * -action.spin * orbit + base.x * burst * 4,
    bvz: tangent.z * -action.spin * orbit + base.z * burst * 4,
  };
}

function stampSkill(p) {
  const frame = skillFrame(p.action);
  p.x = frame.x;
  p.z = frame.z;
  p.yaw = frame.yaw;
  p.action.visual = frame.visual;
  p.vx = frame.vx;
  p.vz = frame.vz;
  p.speed = frame.speed;
}

function placeSkillBall(match, owner) {
  const frame = skillFrame(owner.action);
  const ball = match.ball;
  ball.x = frame.ballX;
  ball.z = frame.ballZ;
  ball.y = frame.ballY;
  ball.vx = frame.bvx;
  ball.vz = frame.bvz;
  ball.vy = 0;
  ball.ax = 0;
  ball.az = 0;
}

function elasticoSide(match, ren, input) {
  if (input.turn > 0.2) return 1;
  if (input.turn < -0.2) return -1;
  const right = rightFromYaw(ren.yaw);
  let nearest = null;
  let bd = 1e9;
  for (const o of match.players) {
    if (o.team === ren.team || o.keeper) continue;
    const d = dist(ren, o);
    if (d < bd) { bd = d; nearest = o; }
  }
  if (!nearest || bd > 4) return 1;
  const onRight = right.x * (nearest.x - ren.x) + right.z * (nearest.z - ren.z);
  return onRight > 0 ? -1 : 1;
}

function giroSpin(match, ren, input) {
  // ArrowRight is turn +1 and decreases yaw, so the ball sweeps toward +X.
  if (input.turn > 0.2) return -1;
  if (input.turn < -0.2) return 1;
  const right = rightFromYaw(ren.yaw);
  let nearest = null;
  let bd = 1e9;
  for (const o of match.players) {
    if (o.team === ren.team || o.keeper) continue;
    const d = dist(ren, o);
    if (d < bd) { bd = d; nearest = o; }
  }
  if (!nearest || bd > 3) return 1;
  const onRight = right.x * (nearest.x - ren.x) + right.z * (nearest.z - ren.z);
  return onRight > 0 ? 1 : -1;
}

function sellDefender(match, ren) {
  const kind = ren.action?.name;
  const limit = kind === 'giro' ? 1.8 : 2.2;
  let best = null;
  let bd = 1e9;
  for (const o of match.players) {
    if (o.team === ren.team || o.keeper) continue;
    const d = dist(ren, o);
    if (d > limit) continue;
    const face = facingDot(ren, o);
    if (kind === 'elastico' && face < 0.15) continue;
    if (kind === 'giro' && face > 0.45) continue;
    if (d < bd) { bd = d; best = o; }
  }
  if (!best) return null;
  const dur = wrongFootDur(match);
  let wx;
  let wz;
  if (kind === 'elastico') {
    const right = rightFromYaw(ren.yaw);
    wx = -ren.action.side * right.x;
    wz = -ren.action.side * right.z;
  } else {
    const fwd = forwardFromYaw(best.yaw);
    wx = fwd.x;
    wz = fwd.z;
  }
  best.wrongFoot = dur;
  best.wrongX = wx;
  best.wrongZ = wz;
  best.tackleCd = Math.max(best.tackleCd || 0, dur + 0.35);
  if (best.action && best.action.name !== 'kick') best.action = null;
  return best;
}

function startElastico(match, ren, input) {
  match.flair = 0;
  match.flairFollowUntil = match.time + 3;
  ren.action = {
    name: 'elastico', t: 0, dur: 0.36, side: elasticoSide(match, ren, input),
    ox: ren.x, oz: ren.z, yaw: ren.yaw, visual: 0,
  };
  match.message = 'ELASTICO';
  match.messageT = 0.8;
  sellDefender(match, ren);
  stampSkill(ren);
}

function startGiro(match, ren, input) {
  match.flair = 0;
  match.flairFollowUntil = match.time + 3;
  ren.action = {
    name: 'giro', t: 0, dur: 0.55, spin: giroSpin(match, ren, input),
    ox: ren.x, oz: ren.z, yaw: ren.yaw, visual: 0,
  };
  match.message = 'GIRO';
  match.messageT = 0.8;
  sellDefender(match, ren);
  stampSkill(ren);
}

function stepHuman(match, ren, input, dt) {
  const ball = match.ball;
  const speeds = speedsFor(match, ren);
  if (ren.action?.name === 'kick') {
    applyMove(ren, input, speeds, dt, { kick: true, hasBall: ball.owner === ren.id });
    return;
  }
  const has = ball.owner === ren.id;
  const tricking = ren.action?.name === 'elastico' || ren.action?.name === 'giro';
  if (!tricking && has && !ren.action && (input.elasticoDown || input.giroDown)) {
    if ((match.flair || 0) < 1) {
      match.message = 'NO FLAIR';
      match.messageT = 0.55;
    } else if (input.elasticoDown) startElastico(match, ren, input);
    else startGiro(match, ren, input);
  }
  if (ren.action?.name === 'elastico' || ren.action?.name === 'giro') {
    stampSkill(ren);
    return;
  }
  const looseClose = !ball.owner && dist(ren, ball) < 1.08 && ball.y < 1.35
    && Math.hypot(ball.vx, ball.vz) < 11 && !(ball.grace > 0 && ball.from === ren.id);

  const sliding = ren.action?.name === 'slide';
  if (input.slideDown && !has && !sliding && ren.action?.name !== 'kick' && ren.action?.name !== 'charge' && ren.action?.name !== 'tackle' && ren.tackleCd <= 0) {
    ren.action = { name: 'slide', t: 0, dur: 0.55 };
    ren.tackleCd = 0.9;
  }
  if (input.shootDown && !has && !looseClose && ren.action?.name !== 'tackle' && ren.action?.name !== 'slide') {
    ren.action = { name: 'tackle', t: 0, dur: 0.46 };
    ren.tackleCd = 0.62;
  }
  if ((has || looseClose) && input.shootHeld && ren.action?.name !== 'tackle' && ren.action?.name !== 'slide') {
    if (!has) ball.owner = ren.id;
    if (ren.action?.name !== 'charge') ren.action = { name: 'charge', t: 0, dur: 99, power: 0, lean: 0, intent: 'kick' };
    ren.action.power = Math.min(1, ren.action.power + dt / 0.62);
    ren.action.intent = kickIntent(match, ren).mode;
    const rules = challengeRules(match);
    if (rules && ren.action.power >= 1 && ren.action.intent === 'shot') {
      ren.action.fullHold = (ren.action.fullHold || 0) + dt;
      ren.action.overcharge = clamp((ren.action.fullHold - rules.shotGrace) / 0.65, 0, 1);
    } else {
      ren.action.fullHold = 0;
      ren.action.overcharge = 0;
    }
  }
  if ((input.shootUp || ren.action?.overcharge >= 1) && ren.action?.name === 'charge' && ball.owner === ren.id) {
    const intent = kickIntent(match, ren);
    const tap = ren.action.t < 0.14;
    const power = tap ? 0.08 : ren.action.power;
    if (intent.mode === 'pass') doPass(match, ren, intent.mate);
    else if (intent.mode === 'shot') releaseShot(match, ren, power, ren.action.lean || 0, ren.action.overcharge || 0);
    else releaseClearance(match, ren, tap ? 0.15 : ren.action.power);
    ren.action = { name: 'kick', t: 0, dur: 0.34, pass: intent.mode === 'pass' };
  }
  if (input.passDown && ball.owner === ren.id && ren.action?.name !== 'kick') {
    doPass(match, ren, teammateToPass(match, ren));
    ren.action = { name: 'kick', t: 0, dur: 0.3, pass: true };
  } else if (input.passDown) {
    const holder = byId(match, ball.owner);
    if (holder && holder.team === 'home' && !holder.human) {
      match.callPass = true;
      match.callLeft = 1.35;
      match.message = 'HEY!';
      match.messageT = 0.9;
    }
  }

  if (ren.action?.name === 'charge') {
    stepStamina(ren, false, false, dt);
    ren.vx = 0;
    ren.vz = 0;
    ren.speed = 0;
  } else {
    applyMove(ren, input, speeds, dt, { hasBall: ball.owner === ren.id });
  }
  if (ren.action?.name === 'tackle' && ren.action.t < 0.22) {
    const f = forwardFromYaw(ren.yaw);
    ren.x += f.x * 8 * dt;
    ren.z += f.z * 8 * dt;
    ren.speed = 8;
    trySteal(match, ren);
  }
  if (ren.action?.name === 'slide' && ren.action.t < 0.32) {
    const f = forwardFromYaw(ren.yaw);
    const slide = 10.5;
    ren.x += f.x * slide * dt;
    ren.z += f.z * slide * dt;
    ren.vx = f.x * slide;
    ren.vz = f.z * slide;
    ren.speed = slide;
    tryBarrida(match, ren);
  }
}

function stepBall(match, dt) {
  const ball = match.ball;
  if (ball.owner) {
    placeDribble(match, byId(match, ball.owner));
    return;
  }
  const prev = { x: ball.x, y: ball.y, z: ball.z };
  const result = integrateBall(ball, dt);
  tryKeeperSave(match, prev);
  if (ball.owner) {
    placeDribble(match, byId(match, ball.owner));
    return;
  }
  if (result.goal) {
    onGoal(match, result.goal);
    return;
  }
  if (result.out) {
    onOut(match, result.out);
    return;
  }
  interceptPass(match, prev);
  blocks(match);
  claims(match);
  if (ball.owner) placeDribble(match, byId(match, ball.owner));
}

function ballNeedsRecovery(match) {
  const ball = match.ball;
  const values = [ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz, ball.ax, ball.az, ball.magnus];
  if (values.some((value) => !Number.isFinite(value))) return true;
  if (ball.owner && !byId(match, ball.owner)) return true;
  // Allow room for dribbling at the boards and for a shot to reach the out-of-bounds rule.
  const maxZ = PITCH.halfL + (ball.owner ? 2 : 1.4);
  return Math.abs(ball.x) > PITCH.halfW + 2
    || Math.abs(ball.z) > maxZ
    || ball.y < -0.5 || ball.y > 12;
}

function recoverBall(match) {
  Object.assign(match.ball, emptyBall());
  match.invalidBallTime = 0;
  match.message = 'BALL BACK IN PLAY';
  match.messageT = 1.5;
}

export function stepMatch(match, input, dt) {
  const step = Math.min(Math.max(dt, 0), 0.05);
  match.input = input || idleInput();
  if (match.messageT > 0) {
    match.messageT -= step;
    if (match.messageT <= 0) match.message = '';
  }
  if (match.phase === 'kickoff' || match.phase === 'goal' || match.phase === 'end') {
    match.invalidBallTime = 0;
    match.callPass = false;
    match.callLeft = 0;
    match.phaseTime -= step;
    match.time += step;
    if (match.phaseTime <= 0 && match.phase !== 'end') {
      if (match.phase === 'goal' && match.pendingEnd) {
        match.phase = 'end';
        match.winner = match.pendingEnd;
        match.phaseTime = 999;
      } else if (match.phase === 'goal' || match.phase === 'kickoff') {
        if (match.phase === 'goal') resetForKickoff(match);
        match.phase = match.phase === 'kickoff' ? 'play' : 'kickoff';
        match.phaseTime = match.phase === 'kickoff' ? 0.75 : 0;
        if (match.phase === 'play') match.phaseTime = 0;
      }
    }
    return match;
  }

  if (ballNeedsRecovery(match)) {
    match.invalidBallTime = (match.invalidBallTime || 0) + step;
    if (match.invalidBallTime < 1) {
      match.time += step;
      return match;
    }
    recoverBall(match);
    match.time += step;
    return match;
  } else {
    match.invalidBallTime = 0;
  }

  match.time += step;
  trackPossession(match);
  for (const p of match.players) {
    if (p.tackleCd > 0) p.tackleCd -= step;
    if (p.holdPass > 0) p.holdPass -= step;
  }
  const ren = byId(match, 'ren');
  stepHuman(match, ren, match.input, step);
  trackPossession(match);
  for (const p of match.players) {
    if (p.human || p.keeper) continue;
    stepAi(match, p, step);
    trackPossession(match);
  }
  for (const p of match.players) {
    if (p.action?.name === 'charge' && match.ball.owner !== p.id) p.action = null;
  }
  for (const p of match.players) if (p.keeper) stepKeeper(match, p, step);
  separate(match.players);
  for (const p of match.players) clampPlayer(p);
  for (const p of match.players) {
    if (p.action?.name === 'elastico' || p.action?.name === 'giro') stampSkill(p);
  }
  stepBall(match, step);
  if (match.phase === 'play') trackPossession(match);
  for (const p of match.players) {
    if (!p.action) continue;
    p.action.t += step;
    if (p.action.name !== 'charge' && p.action.t >= p.action.dur) p.action = null;
  }
  if (match.phase !== 'play') {
    match.callPass = false;
    match.callLeft = 0;
  } else if (match.callLeft > 0) {
    match.callLeft -= step;
    match.callPass = match.callLeft > 0;
  } else {
    match.callPass = false;
  }
  // Flair fills only while the ball is someone else's. Stamina off the ball is
  // handled in applyMove: sprint spends it, and releasing X brings it back.
  if (match.ball.owner !== ren.id) {
    match.flair = Math.min(1, (match.flair || 0) + step / 7);
    if (match.flair > 0.999) match.flair = 1;
  }
  return match;
}
