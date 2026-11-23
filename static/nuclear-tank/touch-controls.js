// Same opt-in detection as Soccer: coarse pointer or the first actual touch.
// Touch owns its input so lifting one thumb never releases a keyboard key.
export function createTouchControls({ onFireDown, onFireUp, onCancel, onPause }) {
  const root = document.createElement('div');
  root.id = 'touchControls';
  root.hidden = true;
  root.innerHTML = `<div id="touchMove"><div id="touchStick" aria-label="Drive forward or backward and steer"><span>▲</span><b id="touchKnob"></b><small>DRIVE / STEER</small></div><div id="touchArrows" hidden><button data-pad="forward" aria-label="Drive forward">▲</button><button data-pad="left" aria-label="Turn left">◀</button><button data-pad="backward" aria-label="Drive backward">▼</button><button data-pad="right" aria-label="Turn right">▶</button></div></div><div id="touchActions"><span id="touchFireHint">Tap to fire</span><button id="touchFire">Fire</button></div><div id="touchRotate">↻ Turn your phone sideways for more room</div>`;
  document.body.append(root);
  const pause = document.createElement('button');
  pause.id = 'touchPause'; pause.className = 'menu-btn'; pause.textContent = 'Pause';
  document.querySelector('.ui-top').append(pause);
  const panel = document.createElement('div');
  panel.id = 'touchSettings'; panel.hidden = true;
  panel.innerHTML = `<div class="popup-card"><h3>Paused</h3><label>Touch controls <select id="touchPreference"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></label><label>Movement pad <select id="touchPadType"><option value="stick">Joystick</option><option value="arrows">Arrows</option></select></label><p>Left thumb: forward, reverse and steer. Tap Fire for the cannon or specials. Hold for machine-gun fire. Hold and release to lob a grenade. Tap a weapon above to equip it.</p><button id="touchResume" class="menu-btn">Resume</button></div>`;
  document.body.append(panel);
  const $ = (id) => document.getElementById(id);
  const stick = $('touchStick'), knob = $('touchKnob'), fire = $('touchFire');
  const coarse = matchMedia('(pointer: coarse)');
  let preference = 'auto', padType = 'stick', touched = false, enabled = false;
  let playable = false, paused = false, stickId = null, forward = 0, turn = 0;
  const pointers = new Map();
  try {
    preference = localStorage.getItem('nuclear-tank-touch') || 'auto';
    padType = localStorage.getItem('nuclear-tank-touch-pad') || 'stick';
  } catch {}
  if (!['auto', 'on', 'off'].includes(preference)) preference = 'auto';
  if (!['stick', 'arrows'].includes(padType)) padType = 'stick';
  function clear() {
    const wasFiring = [...pointers.values()].includes(fire);
    stickId = null; forward = turn = 0; pointers.clear();
    knob.style.transform = 'translate(-50%, -50%)';
    root.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
    if (wasFiring) onCancel();
  }
  function refresh() {
    const next = preference === 'on' || (preference === 'auto' && (coarse.matches || touched));
    if (next !== enabled) clear();
    enabled = next;
    document.body.classList.toggle('mobile-controls', enabled);
    document.body.classList.toggle('touch-capable', coarse.matches || touched || enabled);
    $('touchPreference').value = preference; $('touchPadType').value = padType;
    stick.hidden = padType !== 'stick'; $('touchArrows').hidden = padType !== 'arrows';
    root.hidden = !enabled || !playable || paused;
  }
  function setPaused(value) {
    clear(); paused = value; panel.hidden = !paused;
    onPause(paused); refresh();
  }
  pause.addEventListener('click', () => setPaused(true));
  $('touchResume').addEventListener('click', () => setPaused(false));
  $('touchPreference').addEventListener('change', (e) => {
    preference = e.target.value;
    try { localStorage.setItem('nuclear-tank-touch', preference); } catch {}
    refresh();
  });
  $('touchPadType').addEventListener('change', (e) => {
    clear(); padType = e.target.value;
    try { localStorage.setItem('nuclear-tank-touch-pad', padType); } catch {}
    refresh();
  });
  coarse.addEventListener('change', refresh);
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && !touched) { touched = true; refresh(); }
  }, { passive: true });
  const allowed = () => enabled && playable && !paused;
  function move(e) {
    const r = stick.getBoundingClientRect(), radius = r.width * 0.36;
    let x = (e.clientX - r.left - r.width / 2) / radius;
    let y = (e.clientY - r.top - r.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    turn = Math.abs(x) > 0.16 ? x : 0;
    forward = Math.abs(y) > 0.16 ? -y : 0;
    knob.style.transform = `translate(calc(-50% + ${x * radius}px), calc(-50% + ${y * radius}px))`;
  }
  stick.addEventListener('pointerdown', (e) => {
    if (!allowed() || stickId !== null || e.button !== 0) return;
    e.preventDefault(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); move(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) move(e); });
  stick.addEventListener('pointerup', (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; forward = turn = 0; knob.style.transform = 'translate(-50%, -50%)';
  });
  root.querySelectorAll('button').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      if (!allowed() || e.button !== 0 || [...pointers.values()].includes(button)) return;
      e.preventDefault(); button.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, button); button.classList.add('pressed');
      if (button === fire) onFireDown();
    });
    button.addEventListener('pointerup', (e) => {
      if (pointers.get(e.pointerId) !== button) return;
      pointers.delete(e.pointerId); button.classList.remove('pressed');
      if (button === fire) onFireUp();
    });
  });
  root.addEventListener('pointercancel', clear);
  root.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId === stickId || pointers.has(e.pointerId)) clear();
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', clear);
  window.addEventListener('resize', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  refresh();
  return {
    get enabled() { return enabled; },
    get fireHeld() { return allowed() && [...pointers.values()].includes(fire); },
    clear,
    update({ blocked, weapon }) {
      if (blocked && playable) clear();
      playable = !blocked;
      root.hidden = !allowed();
      pause.hidden = blocked;
      fire.textContent = weapon === 'shield' ? 'Shield' : weapon === 'emp' ? 'EMP' : 'Fire';
      $('touchFireHint').textContent = weapon === 'grenade' ? 'Hold, release to lob' : weapon === 'machinegun' ? 'Hold to fire' : 'Tap to fire';
    },
    sample() {
      if (!allowed()) return { forward: 0, turn: 0 };
      let f = forward, t = turn;
      for (const button of pointers.values()) {
        if (button.dataset.pad === 'forward') f += 1;
        if (button.dataset.pad === 'backward') f -= 1;
        if (button.dataset.pad === 'left') t -= 1;
        if (button.dataset.pad === 'right') t += 1;
      }
      return { forward: Math.max(-1, Math.min(1, f)), turn: Math.max(-1, Math.min(1, t)) };
    },
  };
}
