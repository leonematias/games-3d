// Touch input is adapted to the same input object as the keyboard.
export function createTouchControls() {
  const root = document.createElement('div');
  root.id = 'touchControls';
  root.hidden = true;
  root.innerHTML = `<div id="touchMove"><div id="touchStick" aria-label="Movement and aim pad"><span>▲</span><b id="touchKnob"></b><small id="touchMoveLabel">MOVE</small></div><div id="touchArrows" hidden><button data-pad="up" aria-label="Forward or aim up">▲</button><button data-pad="left" aria-label="Turn or aim left">◀</button><button data-pad="down" aria-label="Backward or aim down">▼</button><button data-pad="right" aria-label="Turn or aim right">▶</button></div></div><div id="touchActions"><button id="touchPass">Pass</button><button id="touchSkill">Skill</button><button id="touchShoot">Shoot</button><button id="touchSuper" hidden>Super shot</button></div><div id="touchDives" hidden><button data-dive="-1">◀ Dive left</button><span>Stay middle: don't dive</span><button data-dive="1">Dive right ▶</button></div>`;
  document.body.append(root);
  const settings = document.createElement('div');
  settings.id = 'touchSettings';
  settings.innerHTML = `<label>Touch controls <select id="touchPreference"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></label><label>Movement pad <select id="touchPadType"><option value="stick">Joystick</option><option value="arrows">Arrows</option></select></label><p>Left thumb: move and steer. Push to the rim to sprint. Right thumb: hold Shoot, release to kick. Pass also calls for the ball. Skill picks a trick for the nearby defender.</p><p>Penalties: aim with the left pad while holding Shoot. Tap Super shot to arm it. When keeping, tap a dive button or stay in the middle.</p>`;
  document.getElementById('help').append(settings);
  const pause = document.createElement('button');
  pause.id = 'touchPause'; pause.textContent = 'Pause';
  document.getElementById('topBar').append(pause);
  const rotate = document.createElement('div');
  rotate.id = 'touchRotate'; rotate.textContent = '↻ Turn your phone sideways for more room'; rotate.hidden = true;
  document.body.append(rotate);
  const $ = (id) => document.getElementById(id);
  const coarse = matchMedia('(pointer: coarse)');
  let touched = false, preference = 'auto', padType = 'stick';
  try { preference = localStorage.getItem('soccer-touch') || 'auto'; padType = localStorage.getItem('soccer-touch-pad') || 'stick'; } catch {}
  if (!['auto', 'on', 'off'].includes(preference)) preference = 'auto';
  if (!['stick', 'arrows'].includes(padType)) padType = 'stick';
  let enabled = false, context = {}, canPlay = false, stickId = null;
  let x = 0, y = 0, shootHeld = false, armed = false;
  let edges = {}, buttons = new Map(), lastMode = '';
  const knob = $('touchKnob');
  const stick = $('touchStick');
  function clear() {
    stickId = null; x = 0; y = 0; shootHeld = false; armed = false;
    edges = {}; buttons.clear(); knob.style.transform = 'translate(-50%, -50%)';
    root.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
    $('touchSuper').classList.remove('armed');
  }
  function cancel() { clear(); if (enabled) context.onCancel?.(); }
  function refresh() {
    const next = preference === 'on' || (preference === 'auto' && (coarse.matches || touched));
    if (next !== enabled) cancel();
    enabled = next;
    document.body.classList.toggle('mobile-controls', enabled);
    document.body.classList.toggle('touch-capable', coarse.matches || touched || enabled);
    $('touchPreference').value = preference;
    $('touchPadType').value = padType;
    stick.hidden = padType !== 'stick'; $('touchArrows').hidden = padType !== 'arrows';
    if (!enabled) { root.hidden = true; rotate.hidden = true; }
  }
  coarse.addEventListener('change', refresh);
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && !touched) { touched = true; refresh(); } }, { passive: true });
  $('touchPreference').addEventListener('change', (e) => { preference = e.target.value; try { localStorage.setItem('soccer-touch', preference); } catch {} refresh(); });
  $('touchPadType').addEventListener('change', (e) => { cancel(); padType = e.target.value; try { localStorage.setItem('soccer-touch-pad', padType); } catch {} refresh(); });
  pause.addEventListener('click', () => { clear(); context.onPause?.(); });
  function move(e) {
    const r = stick.getBoundingClientRect(), radius = r.width * 0.36;
    let dx = (e.clientX - r.left - r.width / 2) / radius;
    let dy = (e.clientY - r.top - r.height / 2) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    x = Math.abs(dx) > 0.16 ? dx : 0; y = Math.abs(dy) > 0.16 ? -dy : 0;
    knob.style.transform = `translate(calc(-50% + ${dx * radius}px), calc(-50% + ${dy * radius}px))`;
  }
  stick.addEventListener('pointerdown', (e) => {
    if (!canPlay || stickId !== null) return;
    e.preventDefault(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); move(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) { e.preventDefault(); move(e); } });
  stick.addEventListener('pointerup', (e) => { if (e.pointerId === stickId) { stickId = null; x = y = 0; knob.style.transform = 'translate(-50%, -50%)'; } });
  function skill() {
    const m = context.match, ren = m.players.find((p) => p.human);
    const rival = m.players.filter((p) => p.team !== ren.team && !p.keeper).sort((a, b) => Math.hypot(a.x-ren.x,a.z-ren.z)-Math.hypot(b.x-ren.x,b.z-ren.z))[0];
    const dot = rival ? ((rival.x-ren.x)*-Math.sin(ren.yaw)+(rival.z-ren.z)*-Math.cos(ren.yaw))/(Math.hypot(rival.x-ren.x,rival.z-ren.z)||1) : 1;
    edges[dot > 0.4 ? 'elasticoDown' : 'giroDown'] = true;
  }
  root.querySelectorAll('button').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      if (!canPlay || button.disabled || [...buttons.values()].includes(button)) return;
      e.preventDefault(); button.setPointerCapture(e.pointerId); buttons.set(e.pointerId, button); button.classList.add('pressed');
      if (button.id === 'touchShoot') {
        if (context.mode !== 'penalties' && context.match.ball.owner !== 'ren') edges.slideDown = true;
        else { shootHeld = true; edges.shootDown = true; }
      } else if (button.id === 'touchPass') edges.passDown = true;
      else if (button.id === 'touchSkill') skill();
      else if (button.id === 'touchSuper') { armed = !armed; button.classList.toggle('armed', armed); }
      else if (button.dataset.dive) edges.dive = Number(button.dataset.dive);
    });
    button.addEventListener('pointerup', (e) => {
      if (buttons.get(e.pointerId) !== button) return;
      buttons.delete(e.pointerId); button.classList.remove('pressed');
      if (button.id === 'touchShoot' && shootHeld) { shootHeld = false; edges.shootUp = true; }
    });
  });
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', (e) => { if (e.pointerId === stickId || buttons.has(e.pointerId)) cancel(); });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => { if (enabled) cancel(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && enabled) cancel(); });
  window.addEventListener('resize', () => { if (enabled && (stickId !== null || buttons.size)) cancel(); });
  refresh();
  return {
    get enabled() { return enabled; }, clear,
    update(next) {
      context = next;
      const m = next.match, p = m.penalty;
      const saving = next.mode === 'penalties' && p?.side === 'away';
      const mode = `${next.mode}:${saving}:${m.phase}`;
      const allowed = enabled && !next.blocked && ['play', 'penalty-ready', 'penalty-flight'].includes(m.phase);
      if ((!allowed && canPlay) || mode !== lastMode) clear();
      lastMode = mode; canPlay = allowed;
      root.hidden = !allowed; rotate.hidden = !enabled || next.blocked;
      $('touchMove').hidden = saving; $('touchActions').hidden = saving; $('touchDives').hidden = !saving;
      $('touchPass').hidden = next.mode === 'penalties'; $('touchSkill').hidden = next.mode === 'penalties';
      $('touchSkill').disabled = m.ball.owner !== 'ren' || m.flair < 1;
      $('touchShoot').textContent = next.mode === 'penalties' || m.ball.owner === 'ren' ? 'Shoot' : 'Tackle';
      $('touchPass').textContent = m.ball.owner === 'ren' ? 'Pass' : 'Call';
      $('touchSuper').hidden = !(next.mode === 'penalties' && p?.superReady && !p.superUsed);
      $('touchMoveLabel').textContent = next.mode === 'penalties' ? 'AIM' : y > 0.2 && Math.hypot(x,y) > 0.82 ? 'SPRINT' : 'MOVE';
    },
    sample(input) {
      if (!canPlay) return input;
      let forward = y, turn = x;
      for (const b of buttons.values()) {
        if (b.dataset.pad === 'up') forward += 1;
        if (b.dataset.pad === 'down') forward -= 1;
        if (b.dataset.pad === 'left') turn -= 1;
        if (b.dataset.pad === 'right') turn += 1;
        if (b.dataset.dive) turn = Number(b.dataset.dive);
      }
      input.forward = Math.max(-1, Math.min(1, input.forward + forward));
      input.turn = edges.dive || Math.max(-1, Math.min(1, input.turn + turn));
      input.sprint ||= context.mode === 'penalties' ? armed : forward > 0.2 && Math.hypot(turn,forward) > 0.82;
      input.shootHeld ||= shootHeld;
      for (const key of ['shootDown','shootUp','passDown','slideDown','elasticoDown','giroDown']) input[key] ||= !!edges[key];
      edges = {};
      return input;
    },
  };
}
