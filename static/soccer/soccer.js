import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildBall, buildPlayer, loadPlayers, posePlayer, repaintPlayer } from './actors.js';
import { createFx } from './fx.js';
import {
  PITCH, createMatch, forwardFromYaw, homeWingSpot, idleInput, kickIntent, rollAxis, scoreFor, shotPreview, starsFor, stepMatch, yawToward,
} from './logic.js';
import { MARKS, createPitch } from './pitch.js';
import { createSky } from './sky.js';
import { formatTime, loadProgress, recordClear } from './progress.js';
import { createSounds } from './sounds.js';
import { createGameMusic } from '../music/music-player.js';
import { createPenalties, penaltyShotPreview, stepPenalties } from './penalties.js';
import { createTouchControls } from './touch-controls.js';
import {
  NATIONS, KNOCKOUT_ROUNDS, advanceBracket, bracketTable, createBracket, jerseyBackground,
  knockedOutView, nationById, playerOpponent, rosterFor, roundCup, scoreColor,
} from './teams.js';

const $ = (id) => document.getElementById(id);
const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _look = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _nose = new THREE.Vector3();
const _head = new THREE.Vector3();
const _moved = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _roll = new THREE.Vector3();

const keys = new Set();
const touchControls = createTouchControls();
let passEdge = false;
let slideEdge = false;
let elasticoEdge = false;
let giroEdge = false;
let shootEdge = false;
let shootUpEdge = false;

window.addEventListener('keydown', (event) => {
  if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT')) return;
  if (event.code === 'Space' || event.code.startsWith('Arrow') || event.code === 'KeyZ' || event.code === 'KeyX' || event.code === 'KeyC' || event.code === 'KeyV' || event.code === 'KeyB') event.preventDefault();
  if (!event.repeat) {
    if (event.code === 'KeyC') passEdge = true;
    if (event.code === 'KeyZ') slideEdge = true;
    if (event.code === 'KeyV') elasticoEdge = true;
    if (event.code === 'KeyB') giroEdge = true;
    if (event.code === 'Space') shootEdge = true;
  }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Space') shootUpEdge = true;
});
window.addEventListener('blur', () => {
  keys.clear();
  shootUpEdge = true;
});

function sampleInput() {
  const input = idleInput();
  input.forward = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
  input.turn = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  input.sprint = keys.has('KeyX');
  input.shootHeld = keys.has('Space');
  input.passDown = passEdge;
  input.slideDown = slideEdge;
  input.elasticoDown = elasticoEdge;
  input.giroDown = giroEdge;
  input.shootDown = shootEdge;
  input.shootUp = shootUpEdge;
  passEdge = false;
  slideEdge = false;
  elasticoEdge = false;
  giroEdge = false;
  shootEdge = false;
  shootUpEdge = false;
  return touchControls.sample(input);
}

function clearEdges() {
  passEdge = false;
  slideEdge = false;
  elasticoEdge = false;
  giroEdge = false;
  shootEdge = false;
  shootUpEdge = false;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const loading = $('loading');
  try {
    const cups = await fetch('/games-3d/soccer-player/api/cups').then((res) => {
      if (!res.ok) throw new Error('Could not list cups');
      return res.json();
    });
    const cup = cups.find((item) => item.id === 'harbor-friendly') || cups[0];
    await loadPlayers();
    start(cup, cups, params);
    loading.classList.add('hide');
  } catch (err) {
    console.error(err);
    loading.textContent = err.message || 'The match failed to start';
  }
}

const BRACKET_KEY = 'soccer-world-bracket';

function loadBracket(teamId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(BRACKET_KEY) || 'null');
    if (!saved || saved.teamId !== teamId || saved.champion || saved.round > 2) return null;
    if (!Array.isArray(saved.slots) || saved.slots.length !== 8) return null;
    return saved;
  } catch {
    return null;
  }
}

function saveBracket(bracket) {
  sessionStorage.setItem(BRACKET_KEY, JSON.stringify(bracket));
}

function freshBracket(teamId, roundValue) {
  const bracket = createBracket(teamId, Math.random);
  const asked = Number(roundValue);
  const steps = Number.isFinite(asked) ? Math.max(0, Math.min(2, asked)) : 0;
  for (let i = 0; i < steps; i++) advanceBracket(bracket, Math.random);
  saveBracket(bracket);
  return bracket;
}

function cloneBracket(bracket) {
  return {
    teamId: bracket.teamId,
    slots: bracket.slots.slice(),
    qf: bracket.qf.slice(),
    sf: bracket.sf.slice(),
    champion: bracket.champion,
    round: bracket.round,
  };
}

function start(initialCup, cups, params) {
  const worldMode = params.get('test') !== '1';
  const initialMode = !worldMode ? 'match' : params.get('mode') === 'penalties' ? 'penalties' : params.get('team') || params.get('practice') ? 'tournament' : null;
  let cup = initialCup;
  let roster = null;
  let world = null;
  if (initialMode === 'tournament') {
    const home = nationById(params.get('team'));
    if (home) {
      const bracket = loadBracket(home.id) || freshBracket(home.id, params.get('round'));
      const away = nationById(playerOpponent(bracket));
      cup = roundCup(bracket.round, cups, home, away);
      roster = rosterFor(home, away);
      world = { teamId: home.id, bracket };
    } else {
      world = { teamId: null, bracket: null };
    }
  }
  const lite = params.get('lite') === '1';
  const debug = params.get('debug') === '1';
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(lite || touchControls.enabled ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !lite && !touchControls.enabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#c9e8f8', 48, 130);
  const sky = createSky(scene);
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.15, 400);
  const composer = lite ? null : new EffectComposer(renderer);
  if (composer) {
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.18, 0.22, 0.94));
    composer.addPass(new OutputPass());
  }
  const hemi = new THREE.HemisphereLight('#d7eeff', '#3c8a40', 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6e4', 1.35);
  sun.position.set(16, 28, 14);
  sun.castShadow = !lite && !touchControls.enabled;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const floodlights = [
    new THREE.PointLight('#d9e9ff', 0, 62, 2),
    new THREE.PointLight('#d9e9ff', 0, 62, 2),
  ];
  floodlights[0].position.set(-14, 17, -16);
  floodlights[1].position.set(14, 17, 16);
  for (const light of floodlights) scene.add(light);

  const pitch = createPitch();
  scene.add(pitch.group);
  const views = {};
  const state = {
    match: createMatch(cup, Number(params.get('seed')) || ((Math.random() * 1e9) | 0), roster),
    roster,
    world,
    mode: initialMode,
    penaltyPractice: params.get('practice-kicks') === '1',
    champion: false,
    draw: false,
    paused: worldMode && !roster,
    shown: false,
    helpOn: false,
    shake: 0,
    driveReady: false,
    heardOwner: null,
    heardPhase: 'kickoff',
    heardSaves: 0,
    camReady: false,
    penaltyCameraSide: null,
    practice: null,
    practiceRestore: null,
    replayHistory: [],
    replay: null,
    roundIntroT: 0,
  };
  function setStadiumRound() {
    const round = state.mode === 'penalties' ? 2 : state.world?.bracket?.round || 0;
    const themes = [
      { horizon: '#c9e8f8', zenith: '#1a6fce', cloud: '#fffdf8', shade: '#6a90ae', sun: '#fff6e4', sunPower: 1.35, hemi: 0.85, sunPos: [16, 28, 14], lamps: 0 },
      { horizon: '#f1c49b', zenith: '#488ac5', cloud: '#fff2d9', shade: '#9d8e9a', sun: '#ffddb0', sunPower: 1.6, hemi: 0.72, sunPos: [-20, 16, 11], lamps: 1 },
      { horizon: '#546d98', zenith: '#081b43', cloud: '#b5bfd0', shade: '#344e70', sun: '#bfd9ff', sunPower: 0.62, hemi: 0.52, sunPos: [-9, 22, 18], lamps: 2 },
    ];
    const theme = themes[Math.min(2, round)];
    sun.color.set(theme.sun);
    sun.intensity = theme.sunPower;
    sun.position.set(...theme.sunPos);
    hemi.intensity = theme.hemi;
    floodlights.forEach((light) => { light.intensity = theme.lamps === 2 ? 520 : theme.lamps === 1 ? 85 : 0; });
    sky.setPalette({ ...theme, sunDirection: sun.position });
    pitch.setAtmosphere(round, state.mode);
  }
  setStadiumRound();
  for (const player of state.match.players) {
    const view = buildPlayer(player);
    views[player.id] = view;
    scene.add(view.root);
  }
  if (roster) pitch.setEnds(roster.homeKit, roster.awayKit);
  const ballMesh = buildBall();
  scene.add(ballMesh);
  const aimLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: '#ffe08a', dashSize: 0.38, gapSize: 0.24, depthTest: false })
  );
  aimLine.renderOrder = 10;
  aimLine.visible = false;
  scene.add(aimLine);
  const aimMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#ffe08a', depthTest: false })
  );
  aimMarker.renderOrder = 11;
  aimMarker.visible = false;
  scene.add(aimMarker);
  const penaltyAimArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.16, -PITCH.halfL + 8),
    5.6, '#ffe08a', 0.8, 0.55
  );
  penaltyAimArrow.visible = false;
  scene.add(penaltyAimArrow);
  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 14),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false })
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.03;
  scene.add(ballShadow);
  const footShadows = [];
  for (let n = 0; n < state.match.players.length * 2; n++) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 16),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.42, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    shadow.renderOrder = 3;
    shadow.frustumCulled = false;
    scene.add(shadow);
    footShadows.push(shadow);
  }
  const fx = createFx(scene);
  const sounds = createSounds();
  const music = createGameMusic({ track: initialMode === 'penalties' ? 'soccer/spotlight' : 'soccer/kickoff', volume: 0.35 });
  music.startOnInput();
  let musicDipped = false;

  const debugGroup = new THREE.Group();
  debugGroup.visible = debug;
  scene.add(debugGroup);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', wireframe: true });
  const rings = state.match.players.map(() => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 18), ringMat);
    ring.rotation.x = -Math.PI / 2;
    debugGroup.add(ring);
    return ring;
  });
  const passRing = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.96, 32),
    new THREE.MeshBasicMaterial({ color: '#ffd000', transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide })
  );
  passRing.rotation.x = -Math.PI / 2;
  passRing.position.y = 0.07;
  passRing.renderOrder = 2;
  passRing.visible = false;
  passRing.name = 'passRing';
  scene.add(passRing);

  const goalMat = new THREE.MeshBasicMaterial({ color: '#ffcc33', wireframe: true });
  for (const sign of [-1, 1]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(PITCH.goalHalf * 2, PITCH.goalH, 1.2), goalMat);
    box.position.set(0, PITCH.goalH / 2, sign * PITCH.halfL);
    debugGroup.add(box);
  }

  const map = $('map').getContext('2d');
  const homeScore = $('homeScore');
  const awayScore = $('awayScore');
  const homeName = $('homeName');
  const awayName = $('awayName');
  const cupName = $('cupName');
  const pick = $('pick');
  const modePick = $('modePick');
  const practicePick = $('practicePick');
  const scoreSub = $('scoreSub');
  const staminaFill = $('staminaFill');
  const flairFill = $('flairFill');
  const staminaBox = $('stamina');
  const staminaLabel = staminaBox.querySelector('span');
  const power = $('power');
  const powerFill = $('powerFill');
  const powerLabel = $('powerLabel');
  const banner = $('banner');
  const replayTag = $('replayTag');
  const roundIntro = $('roundIntro');
  function showFixtureIntro() {
    const round = state.world?.bracket?.round;
    if (state.mode === 'tournament' && Number.isInteger(round) && state.roster) {
      $('roundIntroTitle').textContent = KNOCKOUT_ROUNDS[round].toUpperCase();
      $('roundIntroTeams').textContent = `${state.roster.homeName}  VS  ${state.roster.awayName}`;
      state.roundIntroT = 2.6;
      roundIntro.hidden = false;
    } else {
      state.roundIntroT = 0;
      roundIntro.hidden = true;
    }
  }
  if (!state.paused) showFixtureIntro();
  const help = $('help');
  const helpBtn = $('helpToggle');
  const toast = $('toast');
  const card = $('card');
  cupName.textContent = state.mode === 'penalties' ? 'PENALTY SHOWDOWN' : worldMode ? 'WORLD CUP' : cup.name.toUpperCase();
  const pickGrid = $('pickGrid');
  for (const nation of NATIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.team = nation.id;
    button.innerHTML = `<b class="star"></b><span class="jersey" style="background:${jerseyBackground(nation.kit)}"><i style="background:${nation.kit.short}"></i></span><strong></strong><small></small>`;
    button.querySelector('.star').textContent = nation.squad.ace.lead ? nation.squad.ace.name : '';
    button.querySelector('strong').textContent = nation.name;
    button.querySelector('small').textContent = `#${nation.squad.ace.number}`;
    button.addEventListener('click', () => {
      button.blur();
      chooseTeam(nation.id);
    });
    pickGrid.appendChild(button);
  }
  pick.hidden = !(worldMode && !roster && !!state.mode);
  modePick.hidden = !!state.mode;
  document.body.classList.toggle('penalties', state.mode === 'penalties');
  if (state.mode === 'penalties') {
    $('pickDescription').textContent = 'Choose a team for five kicks each. Shoot, then dive to stop your rival.';
    $('practiceOpenPick').hidden = true;
  }

  function present(dt = 0) {
    const match = state.match;
    for (const player of match.players) posePlayer(views[player.id], player, match.time, dt);
    for (const view of Object.values(views)) view.root.updateMatrixWorld(true);
    let footIndex = 0;
    for (const player of match.players) {
      const view = views[player.id];
      for (const foot of [view.footL, view.footR]) {
        foot.getWorldPosition(_foot);
        const shadow = footShadows[footIndex];
        footIndex += 1;
        const height = Math.max(0, _foot.y);
        const spread = 1 + height * 0.85;
        shadow.position.set(_foot.x, 0.025, _foot.z);
        // Circle is long on local Y. rotX -90 then rotY yaw lays that along the facing (-Z at yaw 0).
        shadow.rotation.set(-Math.PI / 2, player.yaw, 0);
        shadow.scale.set(0.8 * spread, 1.4 * spread, 1);
        shadow.material.opacity = Math.max(0.04, 0.42 - height * 0.55);
      }
    }
    const ball = match.ball;
    ballMesh.position.set(ball.x, ball.y, ball.z);
    const hot = ball.kind === 'drive' && !ball.owner;
    ballMesh.material.emissive.set(hot ? '#ff6a12' : '#000000');
    ballMesh.material.emissiveIntensity = hot ? 0.9 : 0;
    fx.fire.position.set(ball.x, ball.y, ball.z);
    fx.fire.intensity = hot ? 2.4 : 0;
    const lift = Math.min(1, Math.max(0, ball.y - PITCH.ballR) / 2);
    ballShadow.position.set(ball.x, 0.03, ball.z);
    ballShadow.scale.setScalar(0.88 - lift * 0.34);
    ballShadow.material.opacity = 0.32 - lift * 0.18;
    if (debug) {
      match.players.forEach((player, i) => rings[i].position.set(player.x, 0.08, player.z));
    }
    const ren = match.players.find((p) => p.id === 'ren');
    const penaltyAim = state.mode === 'penalties' && match.penalty?.side === 'home' && match.phase === 'penalty-ready';
    penaltyAimArrow.visible = !!penaltyAim;
    if (penaltyAim) {
      penaltyAimArrow.setDirection(new THREE.Vector3(match.penalty.aim, 0, -8).normalize());
    }
    const holder = match.ball.owner ? match.players.find((p) => p.id === match.ball.owner) : null;
    const calling = !!(match.callPass && ren && holder && holder.team === 'home' && holder.id !== 'ren');
    const aimed = ren && match.ball.owner === 'ren' ? kickIntent(match, ren) : null;
    const chargingShot = ren?.action?.name === 'charge' && (state.mode === 'penalties' || aimed?.mode === 'shot');
    aimLine.visible = !!chargingShot;
    aimMarker.visible = !!chargingShot;
    if (chargingShot) {
      const preview = state.mode === 'penalties'
        ? penaltyShotPreview(ren, Math.max(0.28, ren.action.power), match.penalty.aimY)
        : shotPreview(ren, Math.max(0.08, ren.action.power), ren.action.lean || 0, ren.action.overcharge || 0);
      const color = preview.crossing?.onTarget ? '#ffe08a' : '#ff6464';
      aimLine.material.color.set(color);
      aimMarker.material.color.set(color);
      aimLine.geometry.dispose();
      aimLine.geometry = new THREE.BufferGeometry().setFromPoints(
        preview.points.map((p) => new THREE.Vector3(p.x, p.y, p.z))
      );
      aimLine.computeLineDistances();
      if (preview.crossing) aimMarker.position.set(preview.crossing.x, preview.crossing.y, -PITCH.halfL);
      else aimMarker.visible = false;
      state.aimPreview = preview;
    } else state.aimPreview = null;
    if (aimed && aimed.mode === 'pass' && aimed.mate) {
      passRing.visible = true;
      passRing.position.set(aimed.mate.x, 0.07, aimed.mate.z);
      const pulse = 1 + Math.sin(match.time * 7) * 0.08;
      passRing.scale.setScalar(pulse);
    } else if (calling) {
      passRing.visible = true;
      passRing.position.set(ren.x, 0.07, ren.z);
      const pulse = 1 + Math.sin(match.time * 12) * 0.14;
      passRing.scale.setScalar(pulse);
    } else {
      passRing.visible = false;
    }
  }

  function captureReplayFrame() {
    const match = state.match;
    state.replayHistory.push({
      ball: { x: match.ball.x, y: match.ball.y, z: match.ball.z },
      players: match.players.map((p) => ({ id: p.id, x: p.x, z: p.z, yaw: p.yaw })),
    });
    if (state.replayHistory.length > 150) state.replayHistory.shift();
  }

  function startReplay(kind) {
    if (state.paused) return;
    if (state.replayHistory.length < 2) return;
    const frames = state.replayHistory.slice();
    state.replay = {
      kind, frames, elapsed: 0, duration: kind === 'goal' ? 1.85 : 1.5,
      pausePlay: state.match.phase === 'play',
      goalZ: Math.sign(frames.at(-1).ball.z) * PITCH.halfL || -PITCH.halfL,
      visualBall: null,
      replayNetHit: false,
    };
    if (state.match.phase === 'goal') state.match.phaseTime = Math.max(state.match.phaseTime, 2.8);
    replayTag.textContent = kind === 'goal' ? 'REPLAY · GOAL' : 'REPLAY · SAVE';
    replayTag.hidden = false;
    state.roundIntroT = 0;
    roundIntro.hidden = true;
    document.body.classList.add('replaying');
  }

  function showReplayFrame(dt) {
    const replay = state.replay;
    if (!replay) return;
    replay.elapsed += state.paused ? 0 : dt;
    if (replay.elapsed >= replay.duration) {
      state.replay = null;
      replayTag.hidden = true;
      document.body.classList.remove('replaying');
      return;
    }
    const position = (replay.elapsed / replay.duration) * (replay.frames.length - 1);
    const index = Math.floor(position);
    const blend = position - index;
    const a = replay.frames[index];
    const b = replay.frames[Math.min(index + 1, replay.frames.length - 1)];
    const lerp = (x, y) => x + (y - x) * blend;
    const ball = {
      x: lerp(a.ball.x, b.ball.x), y: lerp(a.ball.y, b.ball.y), z: lerp(a.ball.z, b.ball.z),
    };
    replay.visualBall = ball;
    if (replay.kind === 'goal' && !replay.replayNetHit && replay.elapsed / replay.duration > 0.88) {
      pitch.hitNet({ ...ball, z: replay.goalZ });
      replay.replayNetHit = true;
    }
    ballMesh.position.set(ball.x, ball.y, ball.z);
    ballShadow.position.set(ball.x, 0.03, ball.z);
    for (let i = 0; i < a.players.length; i++) {
      const from = a.players[i];
      const to = b.players[i];
      const root = views[from.id].root;
      root.position.set(lerp(from.x, to.x), 0, lerp(from.z, to.z));
      root.rotation.y = from.yaw + Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw)) * blend;
    }
  }

  // Camera sits behind the player's yaw, a bit higher than a shoulder cam.
  // Forward is read from the same quaternion the body uses. Yaw 0 faces -Z,
  // so the camera lands on +Z.
  function updateCamera(dt, snap) {
    if (state.replay?.visualBall) {
      const replay = state.replay;
      const ball = replay.visualBall;
      const progress = replay.elapsed / replay.duration;
      const side = Math.sign(replay.goalZ);
      if (replay.kind === 'goal' && progress > 0.58) {
        _desired.set(ball.x + 3.8, 2.4, replay.goalZ - side * 1.7);
      } else {
        _desired.set(ball.x + (replay.kind === 'save' ? 4.1 : 2.8), 2.3 + ball.y * 0.25, ball.z - side * 5.2);
      }
      _look.set(ball.x, Math.max(0.7, ball.y), ball.z);
      const k = snap || !state.camReady ? 1 : 1 - Math.exp(-12 * dt);
      _camPos.lerp(_desired, k); _camLook.lerp(_look, k);
      state.camReady = true;
      camera.position.copy(_camPos); camera.up.copy(UP); camera.lookAt(_camLook);
      return;
    }
    if (state.mode === 'penalties') {
      const defending = state.match.penalty?.side === 'away';
      const side = defending ? 'away' : 'home';
      if (side !== state.penaltyCameraSide) { snap = true; state.penaltyCameraSide = side; }
      _desired.set(defending ? 0.6 : 0, defending ? 2.5 : 4.4, defending ? PITCH.halfL - 0.1 : -PITCH.halfL + 17);
      _look.set(0, 1.2, defending ? PITCH.halfL - 9 : -PITCH.halfL);
      const k = snap || !state.camReady ? 1 : 1 - Math.exp(-7 * dt);
      _camPos.lerp(_desired, k); _camLook.lerp(_look, k);
      state.camReady = true;
      camera.position.copy(_camPos); camera.up.copy(UP); camera.lookAt(_camLook);
      return;
    }
    const ren = views.ren.root;
    _fwd.set(0, 0, -1).applyQuaternion(ren.quaternion);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _look.copy(ren.position).addScaledVector(_fwd, 5.2);
    _look.y = 1.2;
    if (state.match.phase === 'goal') {
      _look.lerp(new THREE.Vector3(state.match.ball.x, 1.2, state.match.ball.z), 0.55);
    }
    _desired.copy(ren.position).addScaledVector(_fwd, -6.6);
    _desired.y = 5.25;
    const renPlayer = state.match.players.find((p) => p.id === 'ren');
    if (renPlayer.action?.name === 'charge' && renPlayer.action.power > 0.75) {
      _desired.addScaledVector(_fwd, -1.35);
      _desired.y += 0.55;
    }
    const k = snap || !state.camReady ? 1 : 1 - Math.exp(-7 * dt);
    _camPos.lerp(_desired, k);
    _camLook.lerp(_look, k);
    state.camReady = true;
    camera.position.copy(_camPos);
    if (state.shake > 0.01) {
      camera.position.x += Math.sin(state.shake * 48) * state.shake * 0.18;
      camera.position.y += Math.cos(state.shake * 36) * state.shake * 0.1;
      state.shake *= Math.exp(-4 * dt);
    }
    camera.up.copy(UP);
    camera.lookAt(_camLook);
  }

  function drawMap() {
    const match = state.match;
    const w = map.canvas.width;
    const h = map.canvas.height;
    const X = (x) => (x / PITCH.width) * (w - 16) + w / 2;
    const Y = (z) => (z / PITCH.length) * (h - 16) + h / 2;
    map.clearRect(0, 0, w, h);
    map.fillStyle = '#1f8a3a';
    map.fillRect(0, 0, w, h);
    map.strokeStyle = 'rgba(255,255,255,0.8)';
    map.lineWidth = 1;
    map.strokeRect(X(-PITCH.halfW), Y(-PITCH.halfL), X(PITCH.halfW) - X(-PITCH.halfW), Y(PITCH.halfL) - Y(-PITCH.halfL));
    map.beginPath();
    map.moveTo(X(-PITCH.halfW), Y(0));
    map.lineTo(X(PITCH.halfW), Y(0));
    map.stroke();
    const gap = MARKS.boxDepth - MARKS.spot;
    const alpha = Math.acos(Math.min(1, gap / MARKS.arc));
    const arcRx = Math.abs(X(MARKS.arc) - X(0)) || 1;
    const arcRy = Math.abs(Y(MARKS.arc) - Y(0)) || 1;
    for (const zSign of [-1, 1]) {
      const goal = zSign * PITCH.halfL;
      for (const [depth, half] of [[MARKS.boxDepth, MARKS.boxHalf], [MARKS.sixDepth, MARKS.sixHalf]]) {
        const front = goal - zSign * depth;
        const top = Math.min(Y(goal), Y(front));
        map.strokeRect(X(-half), top, X(half) - X(-half), Math.abs(Y(goal) - Y(front)));
      }
      // Canvas Y grows with world +Z, and arc angles run clockwise, so +Z is PI/2.
      const spotZ = goal - zSign * MARKS.spot;
      const mid = zSign < 0 ? Math.PI / 2 : -Math.PI / 2;
      map.save();
      map.translate(X(0), Y(spotZ));
      map.scale(arcRx, arcRy);
      map.lineWidth = 1.5 / arcRx;
      map.beginPath();
      map.arc(0, 0, 1, mid - alpha, mid + alpha);
      map.stroke();
      map.restore();
    }
    for (const player of match.players) {
      const kit = player.kit && typeof player.kit === 'object' ? player.kit : null;
      if (kit) map.fillStyle = scoreColor(kit);
      else if (player.keeper) map.fillStyle = player.team === 'home' ? '#ffd23a' : '#2a303c';
      else map.fillStyle = player.team === 'home' ? '#8eb6ff' : '#ff8d8d';
      map.beginPath();
      map.arc(X(player.x), Y(player.z), player.id === 'ren' ? 4.5 : 3.2, 0, Math.PI * 2);
      map.fill();
    }
    if (match.ball.owner === 'ren') {
      for (const wing of match.players.filter((p) => p.team === 'home' && p.lane)) {
        const offer = homeWingSpot(match, wing);
        if (!offer) continue;
        map.strokeStyle = offer.open ? '#ffe08a' : 'rgba(255,224,138,0.35)';
        map.setLineDash([4, 3]);
        map.beginPath();
        map.moveTo(X(wing.x), Y(wing.z));
        map.lineTo(X(offer.x), Y(offer.z));
        map.stroke();
        map.setLineDash([]);
      }
    }
    const ren = match.players.find((p) => p.id === 'ren');
    const facing = forwardFromYaw(ren.yaw);
    map.strokeStyle = '#ffffff';
    map.lineWidth = 2;
    map.beginPath();
    map.moveTo(X(ren.x), Y(ren.z));
    map.lineTo(X(ren.x + facing.x * 2.2), Y(ren.z + facing.z * 2.2));
    map.stroke();
    map.fillStyle = '#ffffff';
    map.beginPath();
    map.arc(X(match.ball.x), Y(match.ball.z), 2.4, 0, Math.PI * 2);
    map.fill();
  }

  function hud() {
    const match = state.match;
    const ren = match.players.find((p) => p.id === 'ren');
    homeScore.textContent = String(match.scoreHome);
    awayScore.textContent = String(match.scoreAway);
    homeName.textContent = (match.homeName || 'Aozora').toUpperCase();
    awayName.textContent = (match.awayName || 'Akagane').toUpperCase();
    const homeKit = state.roster?.homeKit;
    const awayKit = state.roster?.awayKit;
    homeScore.style.color = homeKit ? scoreColor(homeKit) : '';
    awayScore.style.color = awayKit ? scoreColor(awayKit) : '';
    homeName.style.color = homeKit ? scoreColor(homeKit) : '';
    awayName.style.color = awayKit ? scoreColor(awayKit) : '';
    if (state.mode === 'penalties' && match.penalty) {
      const p = match.penalty;
      const track = $('penaltyTrack');
      track.hidden = false;
      const kicks = (values) => {
        const shown = values.slice(-5);
        return shown.map((value) => `<span class="${value}">${value === 'goal' ? '●' : value === 'save' ? '◆' : '×'}</span>`).join('') + '○'.repeat(Math.max(0, 5 - shown.length));
      };
      $('homeKicks').innerHTML = kicks(p.home);
      $('awayKicks').innerHTML = kicks(p.away);
      scoreSub.textContent = p.practice ? `PRACTICE KICKS · ${p.home.length} SHOTS` : p.home.length >= 5 && p.away.length >= 5 ? 'SUDDEN DEATH' : 'FIVE KICKS EACH';
      const charge = p.side === 'home' && match.phase === 'penalty-ready' && p.charge > 0;
      power.hidden = !charge;
      if (charge) {
        powerFill.style.width = `${Math.round(p.charge * 100)}%`;
        powerLabel.textContent = p.usingSuper ? 'SUPER SHOT!' : 'RELEASE FOR CONTROL · FULL BAR FIRES';
      }
      const aimHud = $('penaltyAim');
      aimHud.hidden = p.side !== 'home' || match.phase !== 'penalty-ready';
      if (!aimHud.hidden) {
        const preview = penaltyShotPreview(ren, p.usingSuper ? 0.93 : Math.max(0.28, p.charge || 0.55), p.aimY);
        const crossing = preview.crossing;
        const dot = $('penaltyAimDot');
        dot.style.left = `${Math.max(3, Math.min(97, 50 + (crossing?.x ?? p.aim) / 4.8 * 50))}%`;
        dot.style.top = `${Math.max(5, Math.min(95, 90 - (crossing?.y ?? 1.2) / 3.2 * 80))}%`;
        dot.classList.toggle('out', !crossing?.onTarget);
      }
      const cue = p.cue < 0 ? 'LEFT' : p.cue > 0 ? 'RIGHT' : 'STAY MIDDLE';
      match.message = match.phase === 'penalty-ready'
        ? p.side === 'home' ? (p.superReady ? 'ARROWS AIM · X + SPACE: SUPER SHOT' : 'ARROWS AIM · HOLD SPACE TO KICK') : `WATCH THE KICKER · ${cue} · ← OR → TO DIVE`
        : match.phase === 'penalty-flight' && p.side === 'away' && !p.dive ? (p.cue ? 'DIVE! ← OR →' : 'HOLD THE MIDDLE!') : '';
      if (touchControls.enabled && match.phase === 'penalty-ready') {
        match.message = p.side === 'home' ? 'LEFT PAD AIMS · HOLD SHOOT, THEN RELEASE' : `WATCH THE KICKER · ${cue} · TAP A DIVE BUTTON`;
      }
    } else {
      $('penaltyTrack').hidden = true;
      $('penaltyAim').hidden = true;
    }
    if (state.mode !== 'penalties') {
      if (state.practice) {
        scoreSub.textContent = `PRACTICE · ${state.practice.label.toUpperCase()}`;
      } else if (state.world && state.world.bracket) {
        const label = KNOCKOUT_ROUNDS[state.world.bracket.round].toUpperCase();
        const cue = ['FIND THE WINGS', 'BEAT THE PAIR', "STOP KAI'S DRIVE"][state.world.bracket.round];
        scoreSub.textContent = match.phase === 'kickoff'
          ? `KICK OFF · ${label} · ${cue}`
          : `${label} · ${cue} · FIRST TO ${match.firstTo}`;
      } else {
        scoreSub.textContent = match.phase === 'kickoff' ? 'KICK OFF' : `FIRST TO ${match.firstTo}`;
      }
    }
    staminaFill.style.width = `${ren.stamina}%`;
    staminaLabel.textContent = ren.stamina <= 0 ? 'TIRED' : 'STAMINA';
    staminaBox.classList.toggle('low', ren.stamina < 28 || ren.sprintLock);
    flairFill.style.width = `${Math.round((match.flair || 0) * 100)}%`;
    staminaBox.classList.toggle('flair-ready', (match.flair || 0) >= 1);
    const charging = ren.action?.name === 'charge';
    power.classList.toggle('overcharge', state.mode !== 'penalties' && charging && ren.action.overcharge > 0);
    if (state.mode !== 'penalties') power.hidden = !charging;
    if (state.mode !== 'penalties' && charging) {
      const amount = Math.round((ren.action.power || 0) * 100);
      powerFill.style.width = `${amount}%`;
      const intent = ren.action.intent || 'kick';
      const drive = intent === 'shot' && (ren.action.power || 0) >= 0.92;
      power.classList.toggle('drive', drive);
      const preview = state.aimPreview;
      powerLabel.textContent = intent === 'shot' && preview
        ? (preview.crossing?.onTarget ? `${drive ? 'DRIVE' : 'SHOT'} · ${Math.round(Math.min(0.96, preview.chance + ((match.oneTwoUntil > match.time || match.flairFollowUntil > match.time) ? 0.16 : 0)) * 100)}% VS KEEPER` : 'WIDE OR HIGH')
        : drive ? 'FULL' : `FORCE ${amount}`;
      if (intent === 'shot' && match.cup.challenge && ren.action.power >= 1) {
        powerLabel.textContent = ren.action.overcharge > 0 ? 'TOO MUCH POWER! RELEASE — SHOT RISING' : 'FULL POWER — RELEASE NOW!';
      }
    }
    if (match.phase === 'goal' && match.banner && !state.replay) {
      banner.hidden = false;
      $('bannerTitle').textContent = match.banner.title;
      $('bannerSub').textContent = match.banner.sub || '';
      banner.classList.toggle('bad', !match.banner.good);
    } else banner.hidden = true;
    if (match.message) {
      toast.hidden = false;
      toast.textContent = match.message;
    } else toast.hidden = true;
    help.hidden = !state.helpOn;
    helpBtn.setAttribute('aria-expanded', state.helpOn ? 'true' : 'false');
  }

  function showPause() {
    card.hidden = false;
    $('cardKicker').textContent = 'Paused';
    $('cardTitle').textContent = 'TIME OUT';
    $('cardStars').textContent = '';
    $('cardBody').textContent = state.mode === 'penalties' ? 'Esc resumes. R starts the shootout over.' : 'Esc resumes. R starts this match over.';
    $('resumeBtn').hidden = false;
    $('modeBack').hidden = false;
  }

  function showEnd() {
    if (state.shown) return;
    state.shown = true;
    const match = state.match;
    if (state.practice) {
      showPracticeResult(match.scoreHome > 0, match.scoreHome > 0 ? 'Goal scored' : 'The drill ended');
      return;
    }
    if (state.mode === 'penalties') {
      const won = match.winner === 'home';
      card.hidden = false;
      $('cardKicker').textContent = 'Penalty Showdown';
      $('cardTitle').textContent = won ? 'YOU WIN!' : 'ONE MORE TRY!';
      $('cardStars').textContent = '';
      $('cardBody').textContent = `${match.scoreHome} – ${match.scoreAway} · ${match.penalty.home.length} kicks taken · ${match.penalty.away.filter((r) => r === 'save').length} saves`;
      $('resumeBtn').hidden = true;
      $('retryBtn').textContent = 'Play again';
      $('modeBack').hidden = false;
      return;
    }
    const won = match.winner === 'home';
    const result = recordClear(loadProgress(), cup.id, {
      time: match.time,
      conceded: match.stats.conceded,
      driveGoals: match.stats.driveGoals,
      parSeconds: match.parSeconds,
      score: scoreFor(match),
      won,
    });
    if (state.world && state.world.bracket) {
      showKnockout(match, won, result);
      return;
    }
    card.hidden = false;
    state.champion = false;
    $('cardKicker').textContent = won ? cup.name : 'Full time';
    $('cardTitle').textContent = won ? 'YOU WIN' : 'THEY TOOK IT';
    const stars = won ? result.stars : 0;
    $('cardStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const bits = [`${match.scoreHome} – ${match.scoreAway}`, formatTime(match.time), `score ${scoreFor(match)}`];
    if (won && match.stats.driveGoals > 0) bits.push('drive shot');
    if (won && match.stats.conceded === 0) bits.push('clean sheet');
    $('cardBody').textContent = bits.join(' · ');
    $('resumeBtn').hidden = true;
    $('retryBtn').textContent = 'Play again';
    $('modeBack').hidden = true;
  }

  function restart() {
    state.match = state.mode === 'penalties'
      ? createPenalties(cup, state.roster, (Math.random() * 1e9) | 0, state.penaltyPractice)
      : createMatch(cup, (Math.random() * 1e9) | 0, state.roster);
    if (state.practice) setupPractice(state.match, state.practice.id);
    state.paused = false;
    state.shown = false;
    state.champion = false;
    state.heardPhase = state.match.phase;
    state.heardOwner = state.match.ball.owner;
    state.heardSaves = 0;
    state.shake = 0;
    state.penaltyCameraSide = null;
    state.replayHistory = [];
    state.replay = null;
    replayTag.hidden = true;
    document.body.classList.remove('replaying');
    setStadiumRound();
    showFixtureIntro();
    card.hidden = true;
    $('modeBack').hidden = true;
    $('practiceBack').hidden = !state.practice;
    clearEdges();
    if (state.roster) {
      for (const player of state.match.players) repaintPlayer(views[player.id], player);
    }
  }

  const DRILLS = {
    finish: { label: 'Finish from an angle', goal: 'Aim inside the posts and score.' },
    'one-two': { label: 'Complete a one-two', goal: 'Pass to a wing, then run for the return.' },
    'stop-drive': { label: 'Stop the drive shot', goal: 'Tackle Kai or block his shot lane.' },
  };

  function setupPractice(match, id) {
    match.phase = 'play';
    match.phaseTime = 0;
    match.firstTo = 1;
    const player = (name) => match.players.find((p) => p.id === name);
    const ren = player('ren');
    for (const p of match.players) {
      if (p.team === 'away' && !p.keeper) { p.x = p.id === 'kai' ? -13 : 13; p.z = 12; }
    }
    if (id === 'finish') {
      ren.x = 8; ren.z = -10; ren.yaw = yawToward(ren, { x: -1.5, z: -PITCH.halfL });
      match.ball.owner = 'ren';
    } else if (id === 'one-two') {
      ren.x = 0; ren.z = 0; ren.yaw = -0.6;
      player('jun').x = 6; player('jun').z = -5;
      player('kei').x = -6; player('kei').z = -5;
      match.ball.owner = 'ren';
    } else {
      const kai = player('kai');
      kai.x = 0; kai.z = 14; kai.yaw = Math.PI;
      kai.action = { name: 'charge', t: 0, dur: 99, power: 0, lean: 0 };
      ren.x = 0; ren.z = 17; ren.yaw = 0;
      match.ball.owner = 'kai';
    }
    const holder = player(match.ball.owner);
    match.ball.x = holder.x; match.ball.z = holder.z;
    match.ball.y = PITCH.ballR;
    match.message = DRILLS[id].goal;
    match.messageT = 4;
  }

  function showPracticeResult(success, reason) {
    state.shown = true;
    state.paused = true;
    card.hidden = false;
    $('cardKicker').textContent = 'Practice';
    $('cardTitle').textContent = success ? 'DRILL COMPLETE' : 'TRY AGAIN';
    $('cardStars').textContent = '';
    $('cardBody').textContent = reason;
    $('resumeBtn').hidden = true;
    $('retryBtn').textContent = 'Retry drill';
    $('practiceBack').hidden = false;
    $('modeBack').hidden = true;
  }

  function leavePractice() {
    state.practice = null;
    practicePick.hidden = true;
    card.hidden = true;
    const saved = state.practiceRestore;
    state.practiceRestore = null;
    if (saved) {
      cup = saved.cup;
      state.match = saved.match;
      state.roster = saved.roster;
      state.world = saved.world;
      state.paused = saved.paused;
      state.shown = saved.shown;
      state.champion = saved.champion;
      for (const p of state.match.players) repaintPlayer(views[p.id], p);
      if (state.roster) pitch.setEnds(state.roster.homeKit, state.roster.awayKit);
      cupName.textContent = state.world ? 'WORLD CUP' : cup.name.toUpperCase();
      pick.hidden = !(state.world && !state.world.bracket);
    } else openPicker();
  }

  function startPractice(id) {
    if (!DRILLS[id]) return;
    if (!state.practiceRestore) state.practiceRestore = {
      cup, match: state.match, roster: state.roster, world: state.world,
      paused: state.paused, shown: state.shown, champion: state.champion,
    };
    state.practice = { id, ...DRILLS[id] };
    state.world = null;
    state.roster = null;
    cup = { ...cups[0], id: `practice-${id}`, name: 'Practice', firstTo: 1,
      opponent: { ...cups[0].opponent, drive: id === 'stop-drive' } };
    practicePick.hidden = true;
    pick.hidden = true;
    bracketEl.hidden = true;
    crownEl.hidden = true;
    cupName.textContent = 'PRACTICE';
    restart();
  }

  function loadFixture(nextCup, nextRoster) {
    cup = nextCup;
    state.roster = nextRoster;
    cupName.textContent = cup.name.toUpperCase();
    pitch.setEnds(nextRoster.homeKit, nextRoster.awayKit);
    restart();
  }

  const bracketEl = $('bracket');
  const crownEl = $('crown');

  const FLAG_SVG = {
    argentina: '<rect width="20" height="14" fill="#74acdf"/><rect y="4.7" width="20" height="4.6" fill="#fff"/><circle cx="10" cy="7" r="1.2" fill="#f6b40e"/>',
    france: '<rect width="6.7" height="14" fill="#0055a4"/><rect x="6.7" width="6.6" height="14" fill="#fff"/><rect x="13.3" width="6.7" height="14" fill="#ef4135"/>',
    germany: '<rect width="20" height="4.67" fill="#000"/><rect y="4.67" width="20" height="4.66" fill="#dd0000"/><rect y="9.33" width="20" height="4.67" fill="#ffce00"/>',
    spain: '<rect width="20" height="14" fill="#c60b1e"/><rect y="3.5" width="20" height="7" fill="#ffc400"/>',
    england: '<rect width="20" height="14" fill="#fff"/><rect x="8" width="4" height="14" fill="#cf142b"/><rect y="5" width="20" height="4" fill="#cf142b"/>',
    norway: '<rect width="20" height="14" fill="#ba0c2f"/><rect x="6" width="4" height="14" fill="#fff"/><rect y="5" width="20" height="4" fill="#fff"/><rect x="7" width="2" height="14" fill="#00205b"/><rect y="6" width="20" height="2" fill="#00205b"/>',
    portugal: '<rect width="8" height="14" fill="#006600"/><rect x="8" width="12" height="14" fill="#ff0000"/>',
    brazil: '<rect width="20" height="14" fill="#009c3b"/><polygon points="10,1.5 18,7 10,12.5 2,7" fill="#ffdf00"/><circle cx="10" cy="7" r="2.2" fill="#002776"/>',
  };

  function flagIcon(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 14');
    svg.setAttribute('class', 'flag');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = FLAG_SVG[id] || '';
    return svg;
  }

  function teamRow(id, label, score, winner) {
    const row = document.createElement('div');
    const known = !!id;
    const decided = !!winner;
    const won = decided && winner === id;
    row.className = `team${decided && known ? (won ? ' win' : ' lose') : ''}${known ? '' : ' wait'}`;
    if (known) row.append(flagIcon(id));
    const name = document.createElement('b');
    name.textContent = known ? nationById(id).name : label;
    row.append(name);
    const goals = document.createElement('span');
    goals.className = 'score';
    goals.textContent = score == null ? '' : String(score);
    const arrow = document.createElement('i');
    arrow.className = won ? 'arrow' : 'arrow spacer';
    row.append(goals, arrow);
    return row;
  }

  function bracketNote(view, info) {
    if (info.draw) {
      const foe = nationById(info.next);
      return `The draw is set. You play ${foe.name} in the quarter-final. Winners move on to the semi-finals, then the final.`;
    }
    const block = bracketTable(view)[info.playedRound];
    const through = [];
    const out = [];
    block.pairs.forEach((pair, index) => {
      const winner = block.winners[index];
      if (!winner) return;
      through.push(nationById(winner).name);
      const loser = pair.find((id) => id !== winner);
      if (loser) out.push(nationById(loser).name);
    });
    if (!info.won) {
      const foe = nationById(playerOpponent(view)).name;
      if (info.playedRound === 2) return `${foe} beat you ${info.score}. You are out. ${foe} are the champions.`;
      const nextRound = KNOCKOUT_ROUNDS[info.playedRound + 1].toLowerCase();
      return `${foe} beat you ${info.score}. You are out. Through to the ${nextRound}: ${through.join(', ')}.`;
    }
    const foe = nationById(info.next).name;
    const nextRound = KNOCKOUT_ROUNDS[view.round].toLowerCase();
    return `You won ${info.score}. Out: ${out.join(', ')}. Through: ${through.join(', ')}. Next is ${foe} in the ${nextRound}.`;
  }

  function matchCard(roundIndex, pair, labels, winner, yours, scoreText) {
    const cardEl = document.createElement('div');
    cardEl.className = `match${yours ? ' yours' : ''}`;
    cardEl.dataset.round = String(roundIndex);
    const head = document.createElement('div');
    head.className = 'head';
    const when = document.createElement('span');
    when.textContent = KNOCKOUT_ROUNDS[roundIndex];
    const marks = document.createElement('span');
    marks.className = 'marks';
    if (yours) {
      const you = document.createElement('small');
      you.className = 'you';
      you.textContent = 'YOU';
      marks.append(you);
    }
    if (winner) {
      const ft = document.createElement('span');
      ft.className = 'ft';
      ft.textContent = 'FT';
      marks.append(ft);
    }
    head.append(when, marks);
    cardEl.append(head);
    const parts = scoreText ? String(scoreText).split(/[–-]/) : null;
    pair.forEach((id, index) => {
      let score = null;
      if (parts && parts.length >= 2 && id) {
        const yoursGoals = parts[0].trim();
        const theirs = parts[1].trim();
        score = id === state.world.bracket.teamId ? yoursGoals : theirs;
      }
      cardEl.append(teamRow(id, labels ? labels[index] : '', score, winner));
    });
    return cardEl;
  }

  function roundMatches(view, info, roundIndex) {
    const block = bracketTable(view)[roundIndex];
    if (block.pairs.length) {
      return block.pairs.map((pair, index) => {
        const yours = pair.includes(view.teamId);
        const played = roundIndex === info.playedRound && yours && !!info.score;
        const focus = info.draw
          ? roundIndex === 0 && yours
          : (info.won ? roundIndex === view.round && yours : played);
        return matchCard(roundIndex, pair, null, block.winners[index] || null, focus, played ? info.score : '');
      });
    }
    const labels = roundIndex === 1
      ? [['Winner QF 1', 'Winner QF 2'], ['Winner QF 3', 'Winner QF 4']]
      : [['Winner SF 1', 'Winner SF 2']];
    return labels.map((names) => matchCard(roundIndex, [null, null], names, null, false, ''));
  }

  function drawWires() {
    const diagram = document.querySelector('#bracketBoard .diagram');
    if (!diagram || bracketEl.hidden) return;
    const old = diagram.querySelector('svg.wires');
    if (old) old.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wires');
    diagram.appendChild(svg);
    const origin = diagram.getBoundingClientRect();
    svg.setAttribute('width', String(diagram.scrollWidth));
    svg.setAttribute('height', String(diagram.scrollHeight));
    const box = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left - origin.left + diagram.scrollLeft,
        y: rect.top - origin.top + diagram.scrollTop,
        w: rect.width,
        h: rect.height,
      };
    };
    const cards = [...diagram.querySelectorAll('.match')];
    const byRound = [[], [], []];
    for (const el of cards) byRound[Number(el.dataset.round)].push(el);
    const link = (aEl, bEl, nextEl) => {
      if (!aEl || !bEl || !nextEl) return;
      const a = box(aEl);
      const b = box(bEl);
      const next = box(nextEl);
      const y1 = a.y + a.h / 2;
      const y2 = b.y + b.h / 2;
      const xFrom = a.x + a.w;
      const xJoin = xFrom + 16;
      const yMid = (y1 + y2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${xFrom} ${y1} H ${xJoin} V ${y2} H ${xFrom} M ${xJoin} ${yMid} H ${next.x}`);
      svg.appendChild(path);
    };
    link(byRound[0][0], byRound[0][1], byRound[1][0]);
    link(byRound[0][2], byRound[0][3], byRound[1][1]);
    link(byRound[1][0], byRound[1][1], byRound[2][0]);
  }

  function paintBracket(view, info) {
    card.hidden = true;
    crownEl.hidden = true;
    bracketEl.hidden = false;
    const titles = ['INTO THE SEMI-FINAL', 'INTO THE FINAL'];
    $('bracketTitle').textContent = info.draw ? 'THE DRAW' : (info.won ? titles[info.playedRound] : 'KNOCKED OUT');
    const stars = $('bracketStars');
    stars.hidden = !info.won;
    stars.textContent = info.won ? `${'★'.repeat(info.stars)}${'☆'.repeat(3 - info.stars)}` : '';
    $('bracketNote').textContent = bracketNote(view, info);
    const board = $('bracketBoard');
    board.replaceChildren();
    const diagram = document.createElement('div');
    diagram.className = 'diagram';
    ['qf', 'sf', 'final'].forEach((name, roundIndex) => {
      const col = document.createElement('div');
      col.className = `col ${name}`;
      for (const match of roundMatches(view, info, roundIndex)) col.append(match);
      diagram.append(col);
    });
    board.append(diagram);
    drawWires();
    $('bracketNext').textContent = info.draw ? 'Kick off' : 'Next match';
    $('bracketNext').hidden = info.draw ? false : !info.won;
    $('bracketRetry').hidden = info.draw || info.won;
    $('bracketFresh').hidden = !!info.won;
  }

  let partyFrame = 0;
  function startParty() {
    sounds.resume();
    sounds.party(true);
    const canvas = $('party');
    const ctx = canvas.getContext('2d');
    const colors = ['#ffd23a', '#ffffff', '#7ec8ea', '#ff5a5a', '#37d67a'];
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    const bits = Array.from({ length: 110 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 3 + Math.random() * 4,
      v: 50 + Math.random() * 90,
      spin: Math.random() * 6,
      a: Math.random() * Math.PI,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let last = performance.now();
    const tick = (now) => {
      if (crownEl.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const bit of bits) {
        bit.y += bit.v * dt;
        bit.x += Math.sin(bit.a) * 12 * dt;
        bit.a += bit.spin * dt;
        if (bit.y > canvas.height + 10) {
          bit.y = -10;
          bit.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(bit.x, bit.y);
        ctx.rotate(bit.a);
        ctx.fillStyle = bit.color;
        ctx.fillRect(-bit.r, -bit.r * 0.35, bit.r * 2, bit.r * 0.7);
        ctx.restore();
      }
      partyFrame = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(partyFrame);
    partyFrame = requestAnimationFrame(tick);
  }

  function stopParty() {
    cancelAnimationFrame(partyFrame);
    sounds.party(false);
    crownEl.hidden = true;
  }

  function showCrown(match) {
    state.champion = true;
    state.paused = true;
    card.hidden = true;
    bracketEl.hidden = true;
    sessionStorage.removeItem(BRACKET_KEY);
    $('crownBody').textContent = `${match.scoreHome} – ${match.scoreAway} in the final. The cup is yours.`;
    crownEl.hidden = false;
    startParty();
  }

  function showKnockout(match, won, result) {
    state.paused = true;
    state.draw = false;
    card.hidden = true;
    const score = `${match.scoreHome}–${match.scoreAway}`;
    if (won) {
      const pending = cloneBracket(state.world.bracket);
      const next = advanceBracket(pending, Math.random);
      if (pending.champion) {
        showCrown(match);
        return;
      }
      state.pending = pending;
      state.draw = false;
      paintBracket(pending, { won: true, draw: false, playedRound: pending.round - 1, score, stars: result.stars, next });
      return;
    }
    state.pending = null;
    state.draw = false;
    paintBracket(knockedOutView(state.world.bracket, Math.random), {
      won: false,
      draw: false,
      playedRound: state.world.bracket.round,
      score,
      stars: 0,
      next: null,
    });
  }

  function confirmNext() {
    const pending = state.pending;
    if (!pending) return;
    state.pending = null;
    state.world.bracket = pending;
    saveBracket(pending);
    bracketEl.hidden = true;
    const home = nationById(pending.teamId);
    const away = nationById(playerOpponent(pending));
    loadFixture(roundCup(pending.round, cups, home, away), rosterFor(home, away));
  }

  function confirmKickoff() {
    const bracket = state.world && state.world.bracket;
    if (!bracket) return;
    state.draw = false;
    state.pending = null;
    saveBracket(bracket);
    bracketEl.hidden = true;
    const home = nationById(bracket.teamId);
    const away = nationById(playerOpponent(bracket));
    loadFixture(roundCup(bracket.round, cups, home, away), rosterFor(home, away));
  }

  function chooseTeam(id) {
    const home = nationById(id);
    if (!home) return;
    if (state.mode === 'penalties') {
      const others = NATIONS.filter((n) => n.id !== id);
      const away = others[Math.floor(Math.random() * others.length)];
      state.world = null;
      state.roster = rosterFor(home, away);
      cup = { ...cups[0], id: 'penalty-showdown', name: 'Penalty Showdown' };
      pitch.setEnds(state.roster.homeKit, state.roster.awayKit);
      pick.hidden = true;
      cupName.textContent = 'PENALTY SHOWDOWN';
      restart();
      return;
    }
    const bracket = createBracket(home.id, Math.random);
    state.world = { teamId: home.id, bracket };
    state.pending = null;
    state.draw = true;
    state.paused = true;
    pick.hidden = true;
    stopParty();
    paintBracket(bracket, {
      draw: true,
      won: false,
      playedRound: -1,
      score: '',
      stars: 0,
      next: playerOpponent(bracket),
    });
  }

  function openPicker() {
    state.paused = true;
    state.replay = null;
    replayTag.hidden = true;
    document.body.classList.remove('replaying');
    state.shown = false;
    state.champion = false;
    state.pending = null;
    state.draw = false;
    card.hidden = true;
    bracketEl.hidden = true;
    stopParty();
    pick.hidden = false;
    sessionStorage.removeItem(BRACKET_KEY);
  }

  function chooseMode(mode, practice = false) {
    state.mode = mode;
    music.selectTrack(mode === 'penalties' ? 'soccer/spotlight' : 'soccer/kickoff');
    state.penaltyPractice = practice;
    state.world = mode === 'tournament' ? { teamId: null, bracket: null } : null;
    modePick.hidden = true;
    pick.hidden = false;
    document.body.classList.toggle('penalties', mode === 'penalties');
    cupName.textContent = mode === 'penalties' ? 'PENALTY SHOWDOWN' : 'WORLD CUP';
    $('pickDescription').textContent = mode === 'penalties'
      ? practice ? 'Pick a team and take as many practice kicks as you like.' : 'Choose a team for five kicks each. Shoot, then dive to stop your rival.'
      : 'Knockout. Pick a side and the draw shows every tie on the way to the final.';
    $('practiceOpenPick').hidden = mode === 'penalties';
    state.paused = true;
  }

  $('modeTournament').addEventListener('click', () => chooseMode('tournament'));
  $('modePenalties').addEventListener('click', () => chooseMode('penalties'));
  $('modePenaltyPractice').addEventListener('click', () => chooseMode('penalties', true));
  const openModePicker = () => {
    state.paused = true;
    state.replay = null;
    replayTag.hidden = true;
    document.body.classList.remove('replaying');
    state.mode = null;
    state.practice = null;
    state.practiceRestore = null;
    state.shown = false;
    card.hidden = true;
    pick.hidden = true;
    bracketEl.hidden = true;
    crownEl.hidden = true;
    practicePick.hidden = true;
    stopParty();
    modePick.hidden = false;
    document.body.classList.remove('penalties');
    clearEdges();
  };
  $('modeOpen').addEventListener('click', openModePicker);
  $('modeBack').addEventListener('click', openModePicker);

  function selfTest() {
    const errors = [];
    const match = state.match;
    match.phase = 'play';
    const ren = match.players.find((p) => p.id === 'ren');
    ren.x = 0; ren.z = 2; ren.yaw = 0; ren.speed = 0; ren.vx = 0; ren.vz = 0; ren.action = null;
    for (const player of match.players) {
      if (player.id === 'ren') continue;
      player.x = 16; player.z = 24; player.action = null; player.vx = 0; player.vz = 0;
    }
    match.ball.owner = null;
    match.ball.x = 0; match.ball.y = PITCH.ballR; match.ball.z = 22;
    match.ball.vx = 0; match.ball.vy = 0; match.ball.vz = 0; match.ball.kind = null;
    present();
    updateCamera(1 / 60, true);
    const parentFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(views.ren.root.quaternion);
    views.ren.nose.getWorldPosition(_nose);
    views.ren.head.getWorldPosition(_head);
    const model = _nose.sub(_head);
    model.y = 0;
    model.normalize();
    const noseDot = model.dot(parentFwd);
    if (noseDot < 0.85) errors.push(`nose faces ${noseDot.toFixed(2)} off the body`);
    const behind = camera.position.clone().sub(views.ren.root.position);
    const camDot = behind.dot(parentFwd);
    if (camDot > -2) errors.push(`camera is not behind (${camDot.toFixed(2)})`);
    if (camera.position.y < 5) errors.push('camera is too low');
    const z0 = ren.z;
    const x0 = ren.x;
    for (let i = 0; i < 30; i++) stepMatch(match, { ...idleInput(), forward: 1 }, 1 / 60);
    present();
    if (!(ren.z < z0 - 1)) errors.push(`forward moved z by ${(ren.z - z0).toFixed(2)}`);
    _moved.set(ren.x - x0, 0, ren.z - z0);
    if (_moved.lengthSq() > 0.01) {
      _moved.normalize();
      const face = new THREE.Vector3(0, 0, -1).applyQuaternion(views.ren.root.quaternion);
      face.y = 0;
      face.normalize();
      views.ren.nose.getWorldPosition(_nose);
      views.ren.head.getWorldPosition(_head);
      const nose = _nose.sub(_head);
      nose.y = 0;
      nose.normalize();
      if (face.dot(_moved) < 0.8) errors.push(`body faces ${face.dot(_moved).toFixed(2)} off the run`);
      if (nose.dot(face) < 0.8) errors.push(`nose after the run ${nose.dot(face).toFixed(2)}`);
    }
    const yaw0 = ren.yaw;
    for (let i = 0; i < 18; i++) stepMatch(match, { ...idleInput(), turn: 1 }, 1 / 60);
    if (!(ren.yaw < yaw0 - 0.25)) errors.push(`arrow right yaw ${ren.yaw.toFixed(2)}`);
    const turned = forwardFromYaw(ren.yaw);
    if (turned.x < 0.2) errors.push('arrow right did not turn toward +X');
    return errors;
  }

  window.__soccer = {
    music,
    get match() { return state.match; },
    camera,
    get player() { return views.ren.root; },
    step(input, dt) { return state.mode === 'penalties' ? stepPenalties(state.match, input, dt) : stepMatch(state.match, input, dt); },
    ballMesh,
    present,
    selfTest,
    hitNet(ball) { pitch.hitNet(ball); },
    PITCH,
  };

  if (params.get('test') === '1') {
    const errors = selfTest();
    const out = $('testOut');
    out.hidden = false;
    out.textContent = errors.length ? `FAIL ${errors.join(' | ')}` : 'PASS controls camera facing';
    console.log(out.textContent);
    state.match = createMatch(cup, Number(params.get('seed')) || 1);
    state.camReady = false;
  }

  $('resumeBtn').addEventListener('click', () => {
    state.paused = false;
    card.hidden = true;
    clearEdges();
  });
  helpBtn.addEventListener('click', () => {
    state.helpOn = !state.helpOn;
    helpBtn.blur();
  });
  $('retryBtn').addEventListener('click', () => {
    if (state.champion) openPicker();
    else restart();
  });
  $('practiceBack').addEventListener('click', leavePractice);
  const openPracticeMenu = () => {
    practicePick.hidden = false;
    state.practiceMenuPaused = state.paused;
    state.paused = true;
    card.hidden = true;
    pick.hidden = true;
  };
  $('practiceOpen').addEventListener('click', openPracticeMenu);
  $('practiceOpenPick').addEventListener('click', openPracticeMenu);
  $('practiceClose').addEventListener('click', () => {
    practicePick.hidden = true;
    if (state.practice) leavePractice();
    else {
      state.paused = state.practiceMenuPaused;
      pick.hidden = !!(state.world && state.world.bracket);
    }
  });
  for (const button of practicePick.querySelectorAll('[data-drill]')) {
    button.addEventListener('click', () => startPractice(button.dataset.drill));
  }
  $('bracketNext').addEventListener('click', () => {
    $('bracketNext').blur();
    if (state.draw) confirmKickoff();
    else confirmNext();
  });
  $('bracketRetry').addEventListener('click', () => {
    $('bracketRetry').blur();
    bracketEl.hidden = true;
    state.pending = null;
    state.shown = false;
    restart();
  });
  $('bracketFresh').addEventListener('click', () => {
    $('bracketFresh').blur();
    openPicker();
  });
  $('crownAgain').addEventListener('click', () => {
    $('crownAgain').blur();
    openPicker();
  });
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (!modePick.hidden || !pick.hidden || !practicePick.hidden || !bracketEl.hidden || !crownEl.hidden) return;
    if (event.code === 'Escape' && state.match.phase !== 'end') {
      state.paused = !state.paused;
      if (state.paused) showPause();
      else card.hidden = true;
      clearEdges();
    }
    if (event.code === 'KeyR' && (state.paused || state.match.phase === 'end')) restart();
    if (event.code === 'KeyM') {
      const muted = sounds.mute();
      music.setMuted(muted);
      state.helpOn = true;
      help.dataset.muted = muted ? '1' : '';
    }
    if (event.code === 'KeyH') state.helpOn = !state.helpOn;
    sounds.resume();
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    if (!bracketEl.hidden) drawWires();
  });

  let last = performance.now();
  let puff = 0;
  let touchQuality = touchControls.enabled;
  function cancelTouchCharge() {
    keys.clear(); clearEdges();
    const ren = state.match.players.find((p) => p.id === 'ren');
    if (ren.action?.name === 'charge') ren.action = null;
    if (state.match.penalty) state.match.penalty.charge = 0;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const match = state.match;
    touchControls.update({
      match, mode: state.mode, blocked: state.paused || !!state.replay || match.phase === 'end',
      onPause() {
        if (!modePick.hidden || !pick.hidden || !practicePick.hidden || !bracketEl.hidden || !crownEl.hidden || match.phase === 'end') return;
        cancelTouchCharge();
        state.paused = !state.paused;
        if (state.paused) showPause(); else card.hidden = true;
      },
      onCancel() {
        cancelTouchCharge();
        if (!state.paused && match.phase !== 'end') { state.paused = true; showPause(); }
      },
    });
    if (touchQuality !== touchControls.enabled) {
      touchQuality = touchControls.enabled;
      renderer.setPixelRatio(lite || touchQuality ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.shadowMap.enabled = !lite && !touchQuality;
      sun.castShadow = !lite && !touchQuality;
      if (composer) composer.setPixelRatio(renderer.getPixelRatio());
    }
    if (state.mode === 'penalties' && match.penalty) {
      music.intensity(match.penalty.home.length >= 5 && match.penalty.away.length >= 5 ? 1 : 0, 0.8);
    }
    const active = !state.paused && match.phase !== 'end';
    const simulating = active && !state.replay?.pausePlay;
    // One page plays a whole cup, so the loop stays on and only dips while play is stopped.
    if (music.started && musicDipped === active) { musicDipped = !active; music.pause(musicDipped); }
    if (simulating) {
      const beforeOwner = match.ball.owner;
      const beforePhase = match.phase;
      const beforeSaves = match.stats.saves;
      const renBefore = match.players.find((p) => p.id === 'ren');
      const beforeSlide = renBefore.action?.name === 'slide';
      if ((beforePhase === 'play' || beforePhase === 'penalty-flight')
        && [match.ball.x, match.ball.y, match.ball.z].every(Number.isFinite)) captureReplayFrame();
      if (state.mode === 'penalties') stepPenalties(match, sampleInput(), dt);
      else stepMatch(match, sampleInput(), dt);
      if ((beforePhase === 'play' || beforePhase === 'penalty-flight')
        && [match.ball.x, match.ball.y, match.ball.z].every(Number.isFinite)) captureReplayFrame();
      if (state.practice && !state.shown) {
        const id = state.practice.id;
        const holder = match.players.find((p) => p.id === match.ball.owner);
        if (id === 'finish' && match.scoreHome > 0) showPracticeResult(true, 'You found the target.');
        else if (id === 'one-two' && holder?.id === 'ren' && match.oneTwoUntil > match.time && match.stats.combo === 'one-two')
          showPracticeResult(true, 'The return pass reached you.');
        else if (id === 'stop-drive' && ((holder?.id === 'ren' && match.time > 0.2) || (match.stats.blocks > 0 && match.ball.from === 'ren')))
          showPracticeResult(true, 'You stopped the drive.');
        else if (match.scoreAway > 0 || match.time > 35) showPracticeResult(false, 'Try the move again.');
      }
      if (beforeOwner && !match.ball.owner) {
        if (match.ball.kind === 'drive') {
          sounds.drive(); state.shake = Math.max(state.shake, 0.55);
          fx.burst(match.ball.x, match.ball.y, match.ball.z);
          fx.flash(match.ball.x, match.ball.y, match.ball.z, true);
          fx.grass(match.ball.x, match.ball.z, 15, match.ball.vx, match.ball.vz);
        }
        else if (match.ball.kind === 'pass') sounds.pass();
        else {
          sounds.kick();
          fx.flash(match.ball.x, match.ball.y, match.ball.z);
          fx.grass(match.ball.x, match.ball.z, 7, match.ball.vx, match.ball.vz);
        }
      }
      if (match.ball.kind === 'drive' && !match.ball.owner) fx.drive(match.ball.x, match.ball.y, match.ball.z);
      const renNow = match.players.find((p) => p.id === 'ren');
      if (!beforeSlide && renNow.action?.name === 'slide') fx.grass(renNow.x, renNow.z, 18, renNow.vx, renNow.vz);
      if (match.phase === 'goal' && beforePhase !== 'goal') {
        if (state.mode === 'penalties' && match.banner?.title !== 'GOAL!') {
          if (match.banner?.title === 'SAVE!') {
            sounds.save();
            fx.grass(match.ball.x, match.ball.z, 14);
            fx.flash(match.ball.x, match.ball.y, match.ball.z);
            startReplay('save');
          }
        } else {
          sounds.goal();
          sounds.swell(true);
          state.shake = 1.1;
          fx.burst(match.ball.x, 1.2, match.ball.z);
          const scored = Math.sign(match.ball.z) || -1;
          fx.confetti(0, 1.15, scored * (PITCH.halfL - 0.8));
          pitch.hitNet(match.ball);
          pitch.cheer(scored);
          startReplay('goal');
        }
      }
      if (match.phase !== 'goal') sounds.swell(false);
      if (beforePhase === 'goal' && match.phase === 'kickoff') sounds.stopGoal();
      if ((match.phase === 'kickoff' && beforePhase !== 'kickoff') || (beforePhase === 'kickoff' && match.phase === 'play')) sounds.whistle();
      if (match.stats.saves > beforeSaves) {
        sounds.save();
        fx.grass(match.ball.x, match.ball.z, 12);
        fx.flash(match.ball.x, match.ball.y, match.ball.z);
        startReplay('save');
      }
      const ren = match.players.find((p) => p.id === 'ren');
      if (ren.speed > 7) {
        puff -= dt;
        if (puff <= 0) { fx.puff(ren.x, ren.z); puff = 0.12; }
      }
      if (ren.action?.name === 'charge' && ren.action.power >= 0.92 && !state.driveReady) {
        state.driveReady = true;
        sounds.charge();
      }
      if (ren.action?.name !== 'charge') state.driveReady = false;
      const spin = rollAxis(match.ball.vx, match.ball.vz);
      if (spin) {
        _roll.set(spin.x, 0, spin.z);
        const radius = PITCH.ballR * ballMesh.scale.x;
        ballMesh.rotateOnWorldAxis(_roll, (spin.speed / radius) * dt);
      }
    } else clearEdges();
    if (match.phase === 'end') showEnd();
    if (active && state.roundIntroT > 0) {
      state.roundIntroT = Math.max(0, state.roundIntroT - dt);
      if (state.roundIntroT === 0) roundIntro.hidden = true;
    }
    present(simulating ? dt : 0);
    showReplayFrame(dt);
    for (const shadow of footShadows) shadow.visible = !state.replay;
    updateCamera(dt, false);
    sky.update(camera, now * 0.001);
    pitch.update(dt);
    fx.update(dt);
    hud();
    drawMap();
    if (composer && !touchControls.enabled) composer.render(dt);
    else renderer.render(scene, camera);
  }
  present();
  updateCamera(1 / 60, true);
  if (params.get('practice') && DRILLS[params.get('practice')]) startPractice(params.get('practice'));
  requestAnimationFrame(frame);
}

window.addEventListener('error', (event) => {
  const out = $('testOut');
  if (!out) return;
  out.hidden = false;
  out.textContent = `ERROR ${event.message}`;
});

boot();
