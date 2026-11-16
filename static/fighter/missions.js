import * as THREE from 'three';

const CYAN = 0x70eaff;

// Mission progress is independent of the player's jet, so a respawn never
// brings back completed objectives. Dead future targets also count.
export function createMission({ level, scene, terrain, enemies, player, announce, award, recover }) {
  if (!level.mission) return null;
  const stages = level.mission.stages;
  let index = -1, gateIndex = 0, age = 0, squadron = [], gates = [];
  let reinforcementSent = false, done = false, retry = 0, retries = 0;
  let relay = null;
  const previous = player.pos.clone();
  const closest = new THREE.Vector3(), direction = new THREE.Vector3();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 64),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.8 }));
  ring.visible = false;
  scene.add(ring);
  const beacon = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(3, 6, 55, 8), new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 0.35 }));
  mast.position.y = 27.5;
  beacon.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(15, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe1f8ff }));
  dish.position.y = 55;
  beacon.add(dish);
  beacon.visible = false;
  scene.add(beacon);

  function stageTargets() {
    const ids = new Set(stages[index]?.targets || []);
    return enemies.structures.filter(s => ids.has(s.id));
  }
  function markGate() {
    const gate = gates[gateIndex];
    ring.visible = !!gate;
    if (!gate) return;
    ring.position.copy(gate.pos);
    ring.scale.setScalar(gate.radius);
    const from = gateIndex ? gates[gateIndex - 1].pos : player.pos;
    direction.copy(gate.pos).sub(from).normalize();
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  }
  function enter() {
    age = 0; gateIndex = 0; reinforcementSent = false; retry = 0;
    ring.visible = false; beacon.visible = false; relay = null; squadron = [];
    const stage = stages[index];
    announce(stage.title.toUpperCase(), 3);
    if (stage.type === 'route') {
      gates = stage.gates.map(g => {
        // Use the live terrain, including terrain-editor exports.
        let floor = terrain.heightAt(g.x, g.z);
        for (const dx of [-g.radius, g.radius]) for (const dz of [-g.radius, g.radius]) floor = Math.max(floor, terrain.heightAt(g.x + dx, g.z + dz));
        return { radius: g.radius, pos: new THREE.Vector3(g.x, floor + g.clearance, g.z), name: 'Approach gate' };
      });
      previous.copy(player.pos);
      markGate();
    }
    if (stage.type === 'defend') {
      const { x, z } = stage.position;
      relay = { pos: new THREE.Vector3(x, terrain.heightAt(x, z) + 40, z), hp: stage.health, maxHp: stage.health, name: 'Friendly relay' };
      beacon.position.set(x, terrain.heightAt(x, z), z);
      beacon.visible = true;
    }
    const cfg = stage.squadron || stage.patrol;
    if (cfg) squadron = enemies.spawnSquadron(cfg, player, relay).planes;
  }
  function advance() {
    if (index >= 0) award(250, 'OBJECTIVE COMPLETE');
    index++;
    if (index >= stages.length) { done = true; ring.visible = false; beacon.visible = false; return; }
    enter();
  }
  advance();

  function update(dt) {
    if (done || !player.alive) { previous.copy(player.pos); return; }
    const stage = stages[index];
    if (retry > 0) {
      retry -= dt;
      if (retry <= 0) { enemies.removePlanes(squadron); recover(); enter(); }
      return;
    }
    age += dt;
    if (stage.type === 'route') {
      const gate = gates[gateIndex];
      // Swept distance catches a high-speed crossing, but not a teleport/respawn.
      direction.copy(player.pos).sub(previous);
      const lenSq = direction.lengthSq();
      const k = lenSq > 0 ? THREE.MathUtils.clamp(closest.copy(gate.pos).sub(previous).dot(direction) / lenSq, 0, 1) : 0;
      closest.copy(previous).addScaledVector(direction, k);
      if ((lenSq < 40000 && closest.distanceTo(gate.pos) < gate.radius) || player.pos.distanceTo(gate.pos) < gate.radius) {
        award(100, 'GATE CLEARED');
        gateIndex++;
        if (gateIndex === gates.length) advance();
        else { markGate(); announce(`APPROACH ${gateIndex} / ${gates.length}`); }
      }
    } else if (stage.type === 'strike') {
      const remaining = stageTargets().filter(s => s.alive);
      if (!remaining.length) advance();
      else if (stage.reinforcementSeconds && age >= stage.reinforcementSeconds && !reinforcementSent) {
        reinforcementSent = true;
        if (remaining.some(s => s.reinforcements)) {
          enemies.spawnSquadron({ count: 2, role: 'interceptor', speed: 1.2, hp: 65 }, player);
          announce('HANGAR REINFORCEMENTS AIRBORNE', 3);
        }
      }
    } else if (stage.type === 'defend') {
      if (relay.hp <= 0) {
        retry = 4; retries++;
        announce('RELAY LOST — RETRYING INTERCEPTION', 4);
      } else if (squadron.every(p => !p.alive)) advance();
    } else if (stage.type === 'flight' && squadron.every(p => !p.alive)) advance();
    previous.copy(player.pos);
  }
  function view() {
    if (done) return { title: 'Mission complete', hint: 'All primary objectives complete', step: stages.length, total: stages.length, target: null };
    const stage = stages[index];
    let target = null, detail = '';
    if (stage.type === 'route') { target = gates[gateIndex]; detail = `Gate ${gateIndex + 1} / ${gates.length}`; }
    if (stage.type === 'strike') {
      const remaining = stageTargets().filter(s => s.alive);
      target = remaining.sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos))[0];
      detail = `${stage.targets.length - remaining.length} / ${stage.targets.length} targets`;
      if (stage.reinforcementSeconds && !reinforcementSent) detail += ` · launch in ${Math.ceil(Math.max(0, stage.reinforcementSeconds - age))}s`;
    }
    if (stage.type === 'flight' || stage.type === 'defend') {
      const living = squadron.filter(p => p.alive);
      target = living.sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos))[0];
      detail = `${living.length} aircraft remaining`;
    }
    if (relay) detail += ` · relay ${Math.max(0, Math.ceil(relay.hp))}%`;
    return { title: retry > 0 ? 'Relay lost — regrouping' : stage.title, hint: stage.hint, detail,
      step: index + 1, total: stages.length, target, relay, boss: target?.role === 'ace' ? target : null };
  }
  return { update, view, get done() { return done; }, get index() { return index; }, get retries() { return retries; },
    get gates() { return gates; }, get gateIndex() { return gateIndex; }, get relay() { return relay; } };
}
