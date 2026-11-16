import { GRAVITY, PITCH, createMatch, integrateBall, releaseShot, yawToward } from './logic.js';

const SPOT = PITCH.halfL - 8;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const actor = (match, id) => match.players.find((p) => p.id === id);

export function createPenalties(cup, roster, seed = 1, practice = false) {
  const match = createMatch(cup, seed, roster);
  match.penalty = {
    practice, side: 'home', home: [], away: [], aim: 0, aimY: 0,
    charge: 0, superReady: false, superUsed: false, usingSuper: false,
    shootLatch: false,
    shotTime: 0, resultTime: 0, dive: 0, target: 0, cue: 0,
    keeperGuess: 0,
  };
  placePenalty(match);
  return match;
}

function placePenalty(match) {
  const p = match.penalty;
  const home = p.side === 'home';
  match.phase = 'penalty-ready';
  match.banner = null;
  match.message = '';
  p.aim = 0;
  p.aimY = 0;
  p.charge = 0;
  p.usingSuper = false;
  p.shotTime = 0;
  p.resultTime = 0;
  p.dive = 0;
  p.target = home ? 0 : (match.rng() * 5.8 - 2.9);
  p.keeperGuess = home ? Math.floor(match.rng() * 3) - 1 : 0;
  p.cue = home ? 0 : (p.target < -0.75 ? -1 : p.target > 0.75 ? 1 : 0);
  for (const player of match.players) {
    player.x = player.id === 'ren' || player.id === 'kai' ? 0 : 15;
    player.z = player.id === 'ren' ? -SPOT + 1.2 : player.id === 'kai' ? SPOT - 1.2 : 0;
    player.yaw = player.team === 'away' ? Math.PI : 0;
    player.vx = 0; player.vz = 0; player.speed = 0;
    player.action = null;
    if (player.keeper) {
      player.x = 0;
      player.z = player.team === 'away' ? -PITCH.halfL + 1.25 : PITCH.halfL - 1.25;
    }
  }
  const kicker = actor(match, home ? 'ren' : 'kai');
  const ball = match.ball;
  Object.assign(ball, {
    x: 0, y: PITCH.ballR, z: home ? -SPOT : SPOT,
    vx: 0, vy: 0, vz: 0, ax: 0, az: 0, magnus: 0,
    owner: null, from: null, intended: null, aim: null, kind: null,
    power: 0, grace: 0, blocked: false, shotDist: null, scoreP: null, beaten: null,
  });
  kicker.yaw = yawToward(kicker, { x: 0, z: home ? -PITCH.halfL : PITCH.halfL });
}

function launchPenaltyBall(match, kicker, power, aimY) {
  releaseShot(match, kicker, power, 0);
  const ball = match.ball;
  const goalZ = kicker.team === 'home' ? -PITCH.halfL : PITCH.halfL;
  const flightTime = Math.abs(goalZ - ball.z) / Math.max(1, Math.abs(ball.vz));
  const targetHeight = 0.85 + 1.6 * power * power + 1.35 * aimY;
  ball.vy = (targetHeight - ball.y + 0.5 * GRAVITY * flightTime * flightTime) / flightTime;
}

export function penaltyShotPreview(player, power, aimY) {
  const probe = { ball: {}, stats: { shots: 0 }, time: 0 };
  launchPenaltyBall(probe, player, power, aimY);
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
  return { points, crossing };
}

function shoot(match) {
  const p = match.penalty;
  const home = p.side === 'home';
  const kicker = actor(match, home ? 'ren' : 'kai');
  const goalZ = home ? -PITCH.halfL : PITCH.halfL;
  const target = home ? p.aim : p.target;
  kicker.yaw = yawToward(kicker, { x: target, z: goalZ });
  // The regular shot model supplies the flight and animation. Penalties resolve
  // with the chosen keeper dive rather than the regular match's random save.
  const power = home ? (p.usingSuper ? 0.93 : clamp(p.charge, 0.28, 1)) : 0.58 + match.rng() * 0.22;
  launchPenaltyBall(match, kicker, power, home ? p.aimY : 0);
  kicker.action = { name: 'kick', t: 0, dur: 0.38 };
  if (home) p.shootLatch = true;
  if (!home && p.dive) actor(match, 'tetsu').action = { name: 'dive', t: 0, dur: 0.55, dir: p.dive };
  p.shotTime = 0;
  match.phase = 'penalty-flight';
}

function record(match, outcome) {
  const p = match.penalty;
  const home = p.side === 'home';
  p[home ? 'home' : 'away'].push(outcome);
  if (outcome === 'goal') match[home ? 'scoreHome' : 'scoreAway']++;
  if (!home && outcome === 'save' && !p.superUsed) p.superReady = true;
  if (home && p.usingSuper) { p.superReady = false; p.superUsed = true; }
  const good = home ? outcome === 'goal' : outcome === 'save';
  match.banner = {
    title: outcome === 'goal' ? 'GOAL!' : outcome === 'save' ? 'SAVE!' : 'MISS!',
    sub: home ? (good ? 'What a strike!' : 'Next kick!') : (good ? 'Brilliant dive!' : 'Your turn!'),
    good,
  };
  match.phase = 'goal';
  match.phaseTime = 1.25;
  p.resultTime = 0;
  match.ball.vx = 0; match.ball.vy = 0; match.ball.vz = 0;
  match.ball.ax = 0; match.ball.az = 0;
}

export function penaltyWinner(p) {
  if (p.practice) return null;
  const h = p.home.length, a = p.away.length;
  const hg = p.home.filter((r) => r === 'goal').length;
  const ag = p.away.filter((r) => r === 'goal').length;
  if (h <= 5 && a <= 5) {
    if (hg > ag + (5 - a)) return 'home';
    if (ag > hg + (5 - h)) return 'away';
    if (h === 5 && a === 5 && hg !== ag) return hg > ag ? 'home' : 'away';
  } else if (h === a && hg !== ag) return hg > ag ? 'home' : 'away';
  return null;
}

export function stepPenalties(match, input, dt) {
  const p = match.penalty;
  const step = clamp(dt, 0, 0.05);
  match.time += step;
  if (!input.shootHeld) p.shootLatch = false;
  for (const player of match.players) {
    if (!player.action || player.action.name === 'charge') continue;
    player.action.t += step;
    if (player.action.t >= player.action.dur) player.action = null;
  }
  if (match.phase === 'end') return match;
  if (match.phase === 'goal') {
    p.resultTime += step;
    if (p.resultTime >= 1.25) {
      const winner = penaltyWinner(p);
      if (winner) { match.winner = winner; match.phase = 'end'; }
      else { p.side = p.practice ? 'home' : p.side === 'home' ? 'away' : 'home'; placePenalty(match); }
    }
    return match;
  }
  if (match.phase === 'penalty-ready') {
    if (p.side === 'home') {
      p.aim = clamp(p.aim + (input.turn || 0) * step * 6.5, -4.8, 4.8);
      const ren = actor(match, 'ren');
      ren.yaw = yawToward(ren, { x: p.aim, z: -PITCH.halfL });
      if (input.shootHeld && !p.shootLatch) {
        p.aimY = clamp(p.aimY + (input.forward || 0) * step * 2.4, -1.2, 1.2);
        p.charge = clamp(p.charge + step / 0.72, 0, 1);
        p.usingSuper = !!(p.superReady && input.sprint);
        ren.action = { name: 'charge', t: 0, dur: 99, power: p.usingSuper ? 0.93 : clamp(p.charge, 0.28, 1), intent: 'shot', lean: 0 };
        if (p.charge >= 1) shoot(match);
      }
      if (match.phase === 'penalty-ready' && input.shootUp && p.charge > 0 && !p.shootLatch) shoot(match);
    } else {
      if (Math.abs(input.turn || 0) > 0.2) p.dive = Math.sign(input.turn);
      p.shotTime += step;
      if (p.shotTime >= 1.15) shoot(match);
    }
    return match;
  }
  if (match.phase === 'penalty-flight') {
    p.shotTime += step;
    const home = p.side === 'home';
    const keeper = actor(match, home ? 'goro' : 'tetsu');
    if (!home && !p.dive && Math.abs(input.turn || 0) > 0.2) {
      p.dive = Math.sign(input.turn);
      keeper.action = { name: 'dive', t: 0, dur: 0.55, dir: p.dive };
    }
    if (home) {
      const wanted = p.keeperGuess * 2.6;
      keeper.x += clamp(wanted - keeper.x, -8 * step, 8 * step);
    } else if (p.dive) {
      const correctSide = p.dive === Math.sign(p.target);
      const destination = correctSide ? p.target : p.dive * 3.1;
      keeper.x += clamp(destination - keeper.x, -7.2 * step, 7.2 * step);
    }
    const result = integrateBall(match.ball, step);
    if (result.goal) {
      const reach = home ? (p.usingSuper ? 0.55 : 0.85) : 0.8;
      const saved = Math.abs(match.ball.x - keeper.x) < reach &&
        (!home ? (p.dive !== 0 || Math.abs(match.ball.x) < 0.65) : true);
      record(match, saved ? 'save' : 'goal');
    } else if (result.out || p.shotTime > 2.3 || Math.abs(match.ball.x) > PITCH.goalHalf + 1.4) {
      record(match, 'miss');
    }
  }
  return match;
}
