// Touch input stays separate from keyboard state; combine only when sampling.
export function createTouchControls({ onPause, onReverse, onTarget, onEject, onInput }) {
  const root = document.createElement('div');
  root.id = 'touchControls'; root.hidden = true;
  root.innerHTML = `<div id="flightStick" aria-label="Flight joystick"><span>▲</span><b id="flightKnob"></b><small id="stickLabel">STEER</small></div>
    <div id="flightActions"><button data-action="target">Target</button><button data-action="reverse">Turn 180°</button><button data-action="eject">Eject</button><button data-action="boost">Boost</button><button data-action="brake">Brake</button><button data-action="fire" class="fire-button">Fire</button><button data-action="interact" hidden>Hold: board</button><button data-action="rescue" hidden>Hold: rescue</button></div>`;
  document.body.append(root);
  const pause = document.createElement('button'); pause.id = 'touchPause'; pause.textContent = 'Pause'; pause.hidden = true;
  document.getElementById('topBar').append(pause);
  pause.addEventListener('click', onPause);
  const coarse = matchMedia('(pointer: coarse)');
  let preference = 'auto', touched = false, enabled = false, allowed = false, recovery = false;
  try { preference = localStorage.getItem('fighter-touch') || 'auto'; } catch {}
  if (!['auto', 'on', 'off'].includes(preference)) preference = 'auto';
  const selectors = ['touchSettings', 'briefingTouchSettings'].map(id => {
    const label = document.createElement('label'); label.textContent = 'Touch controls ';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Touch controls');
    select.innerHTML = '<option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option>';
    select.value = preference; label.append(select); document.getElementById(id).append(label);
    select.addEventListener('change', () => {
      preference = select.value; try { localStorage.setItem('fighter-touch', preference); } catch {}
      selectors.forEach(s => { s.value = preference; }); refresh();
    });
    return select;
  });
  let stickId = null, x = 0, y = 0, firePressed = false;
  const held = new Map(), stick = root.querySelector('#flightStick'), knob = root.querySelector('#flightKnob');
  function center() { x = y = 0; knob.style.transform = 'translate(-50%, -50%)'; }
  function clear() {
    const captures = [...held.entries()].map(([id, b]) => [id, b]);
    if (stickId !== null) captures.push([stickId, stick]);
    stickId = null; held.clear(); firePressed = false; center();
    root.querySelectorAll('.pressed').forEach(b => b.classList.remove('pressed'));
    for (const [id, el] of captures) if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
  }
  function refresh() {
    const next = preference === 'on' || preference === 'auto' && (coarse.matches || touched);
    if (next !== enabled) clear();
    enabled = next; pause.hidden = !enabled;
    document.body.classList.toggle('touch-flight', enabled);
  }
  coarse.addEventListener('change', refresh);
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !touched) { touched = true; refresh(); } }, { passive: true });
  function move(e) {
    const r = stick.getBoundingClientRect(), radius = r.width * .34;
    let dx = (e.clientX - r.left - r.width / 2) / radius, dy = (e.clientY - r.top - r.height / 2) / radius;
    const length = Math.hypot(dx, dy); if (length > 1) { dx /= length; dy /= length; }
    x = Math.abs(dx) < .12 ? 0 : dx; y = Math.abs(dy) < .12 ? 0 : -dy;
    knob.style.transform = `translate(calc(-50% + ${dx * radius}px), calc(-50% + ${dy * radius}px))`;
  }
  stick.addEventListener('pointerdown', e => {
    if (!allowed || stickId !== null) return;
    e.preventDefault(); onInput(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); move(e);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) { e.preventDefault(); move(e); } });
  stick.addEventListener('pointerup', e => { if (e.pointerId === stickId) { stickId = null; center(); } });
  const actions = [...root.querySelectorAll('button')];
  for (const button of actions) {
    button.addEventListener('pointerdown', e => {
      if (!allowed || button.hidden || [...held.values()].includes(button)) return;
      e.preventDefault(); onInput(); button.setPointerCapture(e.pointerId); held.set(e.pointerId, button); button.classList.add('pressed');
      const action = button.dataset.action;
      if (action === 'fire') firePressed = true;
      if (action === 'target') onTarget();
      if (action === 'reverse') onReverse();
      if (action === 'eject') onEject();
    });
    button.addEventListener('pointerup', e => { if (held.get(e.pointerId) === button) { held.delete(e.pointerId); button.classList.remove('pressed'); } });
  }
  root.addEventListener('pointercancel', clear);
  root.addEventListener('lostpointercapture', e => { if (e.pointerId === stickId || held.has(e.pointerId)) clear(); });
  root.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', clear);
  window.addEventListener('resize', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  refresh();
  return {
    clear, get enabled() { return enabled; },
    update(context) {
      const next = enabled && !context.blocked;
      if ((!next && allowed) || recovery !== context.recovery) clear();
      allowed = next; recovery = context.recovery; root.hidden = !allowed;
      pause.hidden = !enabled || context.blocked;
      root.querySelector('#stickLabel').textContent = recovery ? 'MOVE' : 'STEER';
      for (const b of actions) {
        const a = b.dataset.action;
        b.hidden = recovery ? !['interact', 'rescue', 'boost'].includes(a) : ['interact', 'rescue'].includes(a);
        if (a === 'boost') b.textContent = recovery ? 'Run' : 'Boost';
        if (a === 'fire') b.textContent = [0, 4].includes(context.weapon) ? 'Hold fire' : 'Fire';
      }
    },
    sample(input, invert) {
      if (!allowed) return;
      const clamp = n => Math.max(-1, Math.min(1, n));
      input.roll = clamp(input.roll + x); input.walk = clamp(input.walk + y);
      input.pitch = clamp(input.pitch + (invert ? -y : y));
      for (const b of held.values()) if (['fire', 'boost', 'brake', 'interact', 'rescue'].includes(b.dataset.action)) input[b.dataset.action] = true;
      input.firePressed ||= firePressed; firePressed = false;
    }
  };
}
