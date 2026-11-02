const SOUND_FILES = {
  fire: '/games-3d/sounds/projectile_fire.wav',
  break: '/games-3d/sounds/breakable_explosion.wav',
  hit: '/games-3d/sounds/tank_hit.wav',
  key: '/games-3d/sounds/key_pickup.wav',
  gate: '/games-3d/sounds/gate_open.wav',
  coin: '/games-3d/sounds/coin_pickup.wav',
  move: '/games-3d/sounds/tank_move.wav',
  turn: '/games-3d/sounds/tank_turn.wav',
  victory: '/games-3d/sounds/victory.wav',
  transform: '/games-3d/sounds/tank_transform.wav',
  shieldUp: '/games-3d/sounds/shield_up.wav',
  shieldPop: '/games-3d/sounds/shield_pop.wav',
  emp: '/games-3d/sounds/emp_pulse.wav',
  laser: '/games-3d/sounds/laser_zap.wav'
};

export function createSoundManager() {
  const audioCache = new Map();
  let unlocked = false;
  let moveLoop = null;
  let turnLoop = null;

  function ensureAudio(name) {
    if (audioCache.has(name)) return audioCache.get(name);
    const audio = new Audio(SOUND_FILES[name]);
    audio.preload = 'auto';
    audioCache.set(name, audio);
    return audio;
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    for (const name of Object.keys(SOUND_FILES)) {
      const audio = ensureAudio(name);
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(() => {});
      }
    }
  }

  function play(name, volume = 1) {
    const base = ensureAudio(name);
    const instance = base.cloneNode();
    instance.volume = volume;
    instance.play().catch(() => {});
  }

  function setMoving(active) {
    const audio = ensureAudio('move');
    if (active) {
      if (moveLoop === audio && !audio.paused) return;
      moveLoop = audio;
      audio.loop = true;
      audio.volume = 0.2;
      audio.play().catch(() => {});
      return;
    }
    if (!moveLoop) return;
    moveLoop.pause();
    moveLoop.currentTime = 0;
    moveLoop = null;
  }

  function setTurning(active) {
    const audio = ensureAudio('turn');
    if (active) {
      if (turnLoop === audio && !audio.paused) return;
      turnLoop = audio;
      audio.loop = true;
      audio.volume = 0.17;
      audio.play().catch(() => {});
      return;
    }
    if (!turnLoop) return;
    turnLoop.pause();
    turnLoop.currentTime = 0;
    turnLoop = null;
  }

  function attachUnlockListeners() {
    const onFirstInput = () => {
      unlock();
      window.removeEventListener('keydown', onFirstInput);
      window.removeEventListener('pointerdown', onFirstInput);
    };
    window.addEventListener('keydown', onFirstInput);
    window.addEventListener('pointerdown', onFirstInput);
  }

  for (const name of Object.keys(SOUND_FILES)) ensureAudio(name);
  attachUnlockListeners();

  return {
    playFire: () => play('fire', 0.55),
    playBreak: () => play('break', 0.65),
    playHit: () => play('hit', 0.7),
    playKey: () => play('key', 0.5),
    playGate: () => play('gate', 0.62),
    playCoin: () => play('coin', 0.45),
    playVictory: () => play('victory', 0.6),
    playTransform: () => play('transform', 0.7),
    playShieldUp: () => play('shieldUp', 0.6),
    playShieldPop: () => play('shieldPop', 0.6),
    playEmp: () => play('emp', 0.75),
    playLaser: () => play('laser', 0.55),
    setMoving,
    setTurning
  };
}
