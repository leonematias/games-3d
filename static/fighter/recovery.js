import * as THREE from 'three';
import { buildF16, loadModel, MATERIALS } from './jet.js';
import { createRecoveryNavigation } from './recovery-navigation.js';

// A self-contained recovery sortie. The flight mission resumes only after
// boarding/takeoff or a rescue pickup, never merely because the pilot landed.
export async function createRecovery({ scene, terrain, pilot, jet, enemies, announce, onRecovered }) {
  const parked = buildF16();
  parked.root.visible = false;
  parked.parts.flame.visible = false; parked.parts.glow.intensity = 0;
  for (const part of parked.parts.pilot) part.visible = false;
  const skin = MATERIALS.skin.clone();
  parked.root.traverse(n => { if (n.material === MATERIALS.skin) n.material = skin; });
  scene.add(parked.root);
  const gear = new THREE.Group();
  for (const [x, z] of [[-1.5, 2], [1.5, 2], [0, -4]]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6), MATERIALS.nozzle);
    strut.position.set(x, -1.5, z);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 12), MATERIALS.dark);
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -2.15, z);
    gear.add(strut, wheel);
  }
  parked.root.add(gear);
  const trail = new THREE.Group(); scene.add(trail);
  const markerGeometry = new THREE.RingGeometry(0.35, 0.65, 12);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x70eaff, side: THREE.DoubleSide });
  const markers = Array.from({ length: 64 }, () => {
    const m = new THREE.Mesh(markerGeometry, markerMaterial); m.rotation.x = -Math.PI / 2; m.visible = false; trail.add(m); return m;
  });
  const landingRing = new THREE.Mesh(new THREE.RingGeometry(13, 13.3, 64), markerMaterial);
  landingRing.rotation.x = -Math.PI / 2; landingRing.visible = false; scene.add(landingRing);

  const vehicles = {};
  const models = await Promise.allSettled([loadModel('Watercraft/OutboardBoat'), loadModel('Aircraft/RescueHelicopter')]);
  for (const [i, type] of ['boat', 'helicopter'].entries()) {
    if (models[i].status !== 'fulfilled') continue; // Radio rescue remains available if an optional model fails.
    const model = models[i].value, group = new THREE.Group(), body = model.object.clone();
    const scale = (type === 'boat' ? 8 : 12) / model.size.z;
    body.scale.setScalar(scale); body.position.y = -model.box.min.y * scale;
    group.add(body); group.visible = false; scene.add(group); vehicles[type] = group;
  }
  let active = false, phase = 'idle', site = null, nav = null, timer = 0, board = 0, beacon = 0, landed = false;
  let nextPoint = 0, rescueType = null, rescueStart = null, rescueEnd = null, takeoffStart = null;
  let recoveryTime = 0, takeoffHeight = 0;
  const forward = new THREE.Vector3(0, 0, -1), temp = new THREE.Vector3();

  function navigation() {
    const obstacles = [];
    for (const base of enemies.bases) for (const s of base.structures) {
      if (s.type === 'runway' || s.def.afloat) continue;
      let radius = s.radius;
      if (!radius && ['rock', 'boulder', 'pine', 'palm', 'cactus', 'fence', 'barrier', 'sandbags'].includes(s.type)) {
        const size = new THREE.Box3().setFromObject(s.root).getSize(new THREE.Vector3());
        radius = Math.min(16, Math.max(size.x, size.z) * 0.5);
      }
      if (radius) obstacles.push({ x: s.pos.x, z: s.pos.z, radius });
    }
    return createRecoveryNavigation(terrain, obstacles);
  }
  function placeSite(next) {
    site = next; nextPoint = 0;
    parked.root.visible = landingRing.visible = !!site;
    markers.forEach(m => { m.visible = false; });
    if (!site) return;
    parked.root.position.set(site.x, site.y + 2.6, site.z);
    parked.root.rotation.set(0, 0, 0); gear.visible = true;
    landingRing.position.set(site.x, site.y + 0.12, site.z);
    for (let i = 0; i < site.route.length && i < markers.length; i++) {
      const p = site.route[i]; markers[i].position.set(p.x, p.y + 0.18, p.z); markers[i].visible = true;
    }
  }
  function begin() {
    reset(); active = true; phase = 'parachute';
    nav = navigation();
    jet.root.traverse(n => { if (n.userData.paintable) skin.color.copy(n.material.color); });
    // A suggested landing field. A reachable route is checked again at the
    // actual touchdown because the pilot may steer far from this suggestion.
    const height = Math.max(0, pilot.pos.y - terrain.heightAt(pilot.pos.x, pilot.pos.z));
    temp.copy(pilot.pos).addScaledVector(pilot.forward, Math.min(450, height * 1.2));
    placeSite(nav.findSite(temp));
  }
  function reset() {
    active = false; phase = 'idle'; site = null; timer = board = beacon = recoveryTime = 0; landed = false;
    parked.root.visible = landingRing.visible = false; markers.forEach(m => { m.visible = false; });
    for (const v of Object.values(vehicles)) v.visible = false;
  }
  function startRescue() {
    phase = 'rescue'; timer = 0; board = beacon = 0; pilot.vel.set(0, 0, 0);
    rescueType = 'helicopter'; rescueStart = pilot.pos.clone().addScaledVector(pilot.forward, 70).add(new THREE.Vector3(0, 30, 0));
    rescueEnd = pilot.pos.clone().addScaledVector(pilot.forward, 12).add(new THREE.Vector3(0, 18, 0));
    if (pilot.water && vehicles.boat) {
      for (let i = 0; i < 16; i++) {
        const a = Math.atan2(pilot.forward.x, pilot.forward.z) + i * Math.PI / 8;
        const start = pilot.pos.clone().add(new THREE.Vector3(Math.sin(a) * 70, 0, Math.cos(a) * 70));
        let safe = true;
        for (let j = 0; j <= 14; j++) {
          temp.lerpVectors(pilot.pos, start, j / 14);
          if (!terrain.isWater(temp.x, temp.z) || Math.abs(temp.x) > terrain.half * 0.97 || Math.abs(temp.z) > terrain.half * 0.97) safe = false;
        }
        if (safe) { rescueType = 'boat'; rescueStart = start.setY(terrain.waterLevel - 0.4); rescueEnd = pilot.pos.clone().lerp(start, 0.1).setY(terrain.waterLevel - 0.4); break; }
      }
    }
    if (rescueType === 'helicopter') {
      let high = Math.max(rescueStart.y, rescueEnd.y);
      for (let i = 0; i <= 20; i++) { temp.lerpVectors(rescueStart, rescueEnd, i / 20); high = Math.max(high, terrain.heightAt(temp.x, temp.z) + 22); }
      rescueStart.y = rescueEnd.y = high;
    }
    const craft = vehicles[rescueType];
    if (craft) { craft.visible = true; craft.position.copy(rescueStart); craft.rotation.y = Math.atan2(-(rescueEnd.x - rescueStart.x), -(rescueEnd.z - rescueStart.z)); }
    announce(rescueType === 'boat' ? 'RESCUE BOAT INBOUND — STAY WITH YOUR BEACON' : 'RESCUE CONFIRMED — HOLD YOUR POSITION', 3);
  }
  function startTakeoff() {
    phase = 'takeoff'; timer = board = beacon = 0;
    pilot.reset();
    landingRing.visible = false; markers.forEach(m => { m.visible = false; });
    takeoffStart = parked.root.position.clone();
    // Depart toward the theatre centre, with height sampled along the whole
    // flight corridor so a nearby ridge cannot intersect the assisted climb.
    forward.set(-site.x, 0, -site.z).normalize();
    if (forward.lengthSq() < 0.1) forward.set(0, 0, -1);
    parked.root.rotation.y = Math.atan2(-forward.x, -forward.z);
    takeoffHeight = takeoffStart.y + 210;
    for (let i = 0; i <= 30; i++) {
      temp.copy(takeoffStart).addScaledVector(forward, i * 5);
      takeoffHeight = Math.max(takeoffHeight, terrain.heightAt(temp.x, temp.z) + 100);
    }
    announce('STRAP IN — ASSISTED TAKEOFF', 2.5);
  }
  function finish(position, direction, rescued = false) {
    reset();
    onRecovered({ position, direction, rescued });
  }
  function update(dt, input) {
    if (!active) return;
    recoveryTime += dt;
    if (phase === 'takeoff') {
      timer += dt;
      const t = Math.min(1, timer / 6);
      // Lift vertically before moving forward; this clears the parking area.
      const travel = Math.max(0, (t - 0.35) / 0.65);
      temp.copy(takeoffStart).addScaledVector(forward, travel * travel * 150);
      const lift = Math.min(1, t / 0.35);
      parked.root.position.copy(temp).setY(THREE.MathUtils.lerp(takeoffStart.y, takeoffHeight, lift * lift * (3 - 2 * lift)));
      parked.root.rotation.x = t > 0.35 ? 0.15 : 0;
      gear.visible = t < 0.5;
      if (t === 1) finish(parked.root.position.clone(), forward.clone());
      return;
    }
    if (phase === 'rescue') {
      timer += dt;
      const t = Math.min(1, timer / 7), craft = vehicles[rescueType];
      if (craft) craft.position.lerpVectors(rescueStart, rescueEnd, t * (2 - t));
      if (t === 1) finish(null, null, true);
      return;
    }
    if (!pilot.landed) return;
    if (!landed) {
      landed = true; timer = 0; phase = pilot.water ? 'water' : 'landing';
      if (pilot.water) { placeSite(null); announce('SPLASHDOWN — HOLD F TO CALL RESCUE', 4); }
      else {
        nav = navigation();
        const route = site && nav.routeTo(pilot.pos, site);
        placeSite(route ? { ...site, route } : nav.findSite(pilot.pos));
        announce(site ? 'ON FOOT — FOLLOW THE CYAN TRAIL TO YOUR PLANE' : 'NO SAFE ROUTE — HOLD F FOR RESCUE', 4);
      }
    }
    timer += dt;
    if (phase === 'landing' && timer >= 1.3) {
      phase = 'walking';
      pilot.walk((a, b) => nav.canWalk(a, b) && (!site || Math.hypot(b.x - site.x, b.z - site.z) >= 3.5));
    }
    if (input.rescue) beacon = Math.min(2, beacon + dt); else beacon = 0;
    if (beacon >= 2) { startRescue(); return; }
    if (phase === 'walking' && site) {
      // Keep the next trail marker close enough to navigate around obstacles.
      let nearest = 0, distance = Infinity;
      site.route.forEach((p, i) => { const d = Math.hypot(p.x - pilot.pos.x, p.z - pilot.pos.z); if (d < distance) { distance = d; nearest = i; } });
      nextPoint = Math.min(site.route.length - 1, nearest + 1);
      const near = Math.hypot(pilot.pos.x - site.x, pilot.pos.z - site.z) < 11;
      board = near && input.interact && !input.walk && !input.roll && !input.rescue ? Math.min(2, board + dt) : 0;
      if (board >= 2) startTakeoff();
    }
  }
  function view() {
    const plane = site ? { name: 'Replacement plane', pos: new THREE.Vector3(site.x, site.y + 4, site.z) } : null;
    let target = plane, title = 'Steer toward the recovery field', hint = 'Arrows steer the parachute · a replacement plane is marked below';
    let detail = 'Original mission on hold', progress = 0;
    if (phase === 'landing' || phase === 'walking') {
      title = site ? 'Reach the replacement plane' : 'Call for extraction';
      hint = 'W/S move · A/D turn · Shift runs · Hold F for rescue';
      if (site) {
        const near = Math.hypot(pilot.pos.x - site.x, pilot.pos.z - site.z) < 11;
        if (near) { title = 'Board your plane'; hint = 'Stand still and hold E to board · Hold F for rescue'; progress = board / 2; }
        else if (site.route[nextPoint]) { const p = site.route[nextPoint]; target = { name: 'Recovery trail', pos: new THREE.Vector3(p.x, p.y + 1.5, p.z) }; }
        detail = `${Math.round(Math.hypot(pilot.pos.x - site.x, pilot.pos.z - site.z))}m to plane · Mission on hold`;
      }
    }
    if (phase === 'water') { title = 'Signal a rescue pickup'; hint = 'Hold F to activate your rescue beacon'; target = null; }
    if (phase === 'parachute' && !site) { title = 'Find a landing spot'; hint = 'Steer the parachute · Hold F for rescue after touchdown'; }
    if (beacon > 0) { title = 'Activating rescue beacon'; progress = beacon / 2; }
    if (phase === 'rescue') { title = rescueType === 'boat' ? 'Rescue boat approaching' : 'Rescue helicopter approaching'; hint = 'Stay with your beacon · your mission progress is safe'; detail = `Pickup in ${Math.ceil(Math.max(0, 7 - timer))}s`; progress = timer / 7; target = vehicles[rescueType] ? { name: 'Rescue', pos: vehicles[rescueType].position } : null; }
    if (phase === 'takeoff') { title = 'Getting airborne'; hint = 'Assisted departure · flight controls return once clear'; detail = `Taking off · ${Math.ceil(Math.max(0, 6 - timer))}s`; progress = timer / 6; target = null; }
    return { title, hint, detail, progress, target, plane: ['parachute', 'landing', 'walking'].includes(phase) ? plane : null, step: 1, total: 1 };
  }
  return { begin, reset, update, view, parked, get active() { return active; }, get phase() { return phase; },
    get site() { return site; }, get time() { return recoveryTime; }, get nav() { return nav; },
    get focus() { return phase === 'takeoff' ? parked.root.position : pilot.pos; },
    get forward() { return phase === 'takeoff' ? forward : pilot.forward; } };
}
