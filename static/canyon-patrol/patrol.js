import * as THREE from 'three';
import {receiverMesh,createTuner} from './receiver.js';
import {loadSoldiers} from './soldiers.js';
import {buildDiscoveries} from './discoveries.js';
import {createDialogue} from './dialogue.js';
import {createInvestigation} from './investigation.js';
import {createPerimeter} from './perimeter.js';
import {createSurfacePatrol} from './surface-patrol.js';


export async function createPatrol({scene, world, packs, stops, player, state, fx, sounds, damageEnemy, lift}) {
  const [{spawn,pose}, lines] = await Promise.all([
    loadSoldiers(scene),
    fetch(new URL('./dialogue.json', import.meta.url)).then(r => {
      if (!r.ok) throw new Error('Patrol dialogue could not load');
      return r.json();
    })
  ]);
  const slots = world.core ? [[29,2]] : world.radio ? [[4,2]] : [[5,0],[7,-1.9],[8,2]];
  const squad=slots.map(([start,offset],i)=>spawn(start,offset,i));
  function place(root, distance, offset) {
    const p = world.route.at(distance, offset);
    root.position.set(p.x, world.terrain.heightAt(p.x, p.z), p.z);
    return p.yaw;
  }
  function face(root, point) {
    root.rotation.y = Math.atan2(point.x - root.position.x, point.z - root.position.z);
  }
  for (const member of squad) {
    place(member.root, member.start, member.offset);
    const p = world.route.at(2);
    face(member.root, p);
    pose(member, 'idle');
  }

  const dialogue=createDialogue(lines,state);
  const {say,lineFinished}=dialogue;
  if(world.radio){
    const context={world,scene,packs,stops,player,state,fx,sounds,damageEnemy,dialogue,squad,pose,face};
    if(world.sites)return createInvestigation(context);
    if(world.core)return createPerimeter(context);
    return createSurfacePatrol(context);
  }
  const {beacon, ship, fly} = buildDiscoveries(scene, world, stops);
  const receiver=receiverMesh();scene.add(receiver);receiver.position.copy(beacon.position);receiver.position.y-=.55;
  const tuner=createTuner(receiver);
  const [leader, pike, ellis] = squad;
  let phase = 'briefing', elapsed = 0, marched = 0, flyTime = null;
  let shotAt = 0, speakerIndex = 0;
  function enter(next, line) {
    phase = next;
    elapsed = 0;
    shotAt = 0;
    if (line) say(line);
  }
  function begin() {
    pose(leader, 'talk');
    say('brief');
  }
  function moveSquad(dt, destination, run = false) {
    const advance = Math.max(0, Math.min(destination - marched, state.progress + 4 - marched, dt * (run ? 7.4 : 3.6)));
    marched += advance;
    for (const member of squad) {
      if (member.down) continue;
      member.root.rotation.y = place(member.root, member.start + marched, member.offset) + Math.PI;
      pose(member, advance ? (run ? 'run' : 'walk') : 'idle');
    }
    return marched >= destination && Math.abs(state.progress - destination) <= 10;
  }
  function activate(pack) {
    for (const bug of pack) bug.active = bug.aware = bug.root.visible = true;
    sounds.growl();
  }
  function cover(pack) {
    const target = pack.find(bug => bug.active && bug.hp > 0);
    if (!target) return;
    for (const member of squad) {
      if (member.down) continue;
      face(member.root, target.root.position);
      pose(member, 'aim');
    }
    if (elapsed < shotAt) return;
    const living = squad.filter(member => !member.down);
    const gunner = living[speakerIndex++ % living.length];
    const muzzle = gunner.root.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    if (world.clearLine(muzzle, target.aimPoint())) {
      pose(gunner, 'shoot');
      const hit = target.aimPoint();
      fx.trace(muzzle, hit);
      damageEnemy(target, 6, hit);
      sounds.shot();
    }
    shotAt = elapsed + 1.25;
  }
  function finalAttack(dt) {
    for (let i = 0; i < 2; i++) {
      const victim = squad[i + 1], bug = packs.gate[i];
      const approach = THREE.MathUtils.clamp((elapsed - .65 * i) / 1.6, 0, 1);
      bug.root.visible = true;
      place(bug.root, victim.start + marched + 6 * (1 - approach),
        victim.offset + Math.sign(victim.offset) * (3.8 - 3 * approach));
      const delta = victim.root.position.clone().sub(bug.root.position);
      bug.root.rotation.y = Math.atan2(-delta.x, -delta.z);
      bug.play(approach < 1 ? 'run' : 'attack');
      bug.mixer.update(dt);
      bug.ground(world.terrain);
      if (approach === 1 && !victim.down) {
        victim.down = true;
        pose(victim, 'death');
        sounds.impact();
      }
    }
    face(leader.root, packs.gate[0].root.position);
    if (elapsed >= shotAt && elapsed < 2.5) {
      sounds.shot();
      fx.trace(leader.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)), packs.gate[0].aimPoint());
      shotAt = elapsed + .35;
    }
  }
  const objectives = {
    briefing:'Listen to Sergeant Vale.', confirm:'Acknowledge the briefing.', trail:'Find the survey beacon.',
    recorder:'Inspect the blinking beacon.', bearing:'Get a bearing from Vale.',
    stakes:'Follow the blue stakes.', nest:'Inspect the broken shells.',
    hatch:'Clear the hatchlings.', ridge:'Reach the opening in the ridge.',
    flyby:'Look up. Track the Kestrel.', chase:'Chase the ship. Hold Shift to sprint.',
    crossfire:'Face up the trail. Left flank first. Back up and fire.', regroup:'Regroup with Ellis.',
    approach:'Find the two green landing lights.', gate:'Inspect the freight lift.',
    ambush:'Contact at the gate!', combat:'Clear the bugs from the trail.',
    clear:'Step onto the freight lift and press E.', lift:'Riding to the surface.', complete:'Exit onto the flats.'
  };
  function update(dt,keys) {
    elapsed += dt;
    dialogue.tick();
    for (const member of squad) member.mixer.update(dt);
    beacon.scale.setScalar(1 + .18 * Math.sin(state.time * 5));
    if (flyTime !== null) {
      flyTime += dt;
      fly(flyTime);
      if (!ship.visible) flyTime = null;
    }
    switch (phase) {
      case 'briefing':
        for (const member of squad) face(member.root, player);
        if (lineFinished()) {
          pose(leader, 'idle');
          enter('confirm', 'confirm');
        }
        break;
      case 'confirm':
        if (lineFinished()) enter('trail');
        break;
      case 'trail':
        if (moveSquad(dt, stops.beacon)) {
          face(ellis.root, beacon.position);
          pose(ellis, 'crouch');
          enter('recorder', 'recorder');
        }
        break;
      case 'recorder':
        if (lineFinished()) {
          const ridge=world.route.at(stops.beacon+13,6);
          face(pike.root,ridge);pose(pike,'aim');enter('watch','fork_watch');
        }
        break;
      case 'watch':
        if(lineFinished()){pose(ellis,'point');enter('tune','fork_tune');}
        break;
      case 'tune':
        if(Math.hypot(player.x-beacon.position.x,player.z-beacon.position.z)<4)tuner.update(dt,keys,state.muted);
        break;
      case 'keep':
        if(lineFinished())enter('bearing','bearing');
        break;
      case 'bearing':
        face(leader.root, player);
        if (lineFinished()) enter('stakes');
        break;
      case 'stakes':
        if (moveSquad(dt, stops.nest)) {
          pose(pike, 'point');
          enter('nest', 'nest');
        }
        break;
      case 'nest':
        if (lineFinished()) {
          activate(packs.nest);
          enter('hatch', 'hatch');
        }
        break;
      case 'hatch':
        cover(packs.nest);
        if (packs.nest.every(bug => bug.hp <= 0) && lineFinished()) enter('ridge');
        break;
      case 'ridge':
        if (moveSquad(dt, stops.flyby)) {
          flyTime = 0;
          fly(0);
          enter('flyby', 'flyby');
        }
        break;
      case 'flyby':
        for (const member of squad) {
          face(member.root, ship.position);
          pose(member, 'point');
        }
        if (lineFinished()) enter('chase', 'chase');
        break;
      case 'chase':
        if (moveSquad(dt, stops.crossfire, true) && lineFinished()) {
          packs.crossfire.forEach((bug,i)=>{
            place(bug.root,stops.crossfire+20+i*3,i===1?4:-3);
            bug.root.visible=true;
          });
          pose(pike,'point');face(pike.root,packs.crossfire[0].root.position);
          enter('crossfire', 'crossfire');
        }
        break;
      case 'crossfire':
        packs.crossfire.forEach((bug,i)=>{
          if(!bug.active && elapsed>=3+i*3.5){bug.active=bug.aware=true;sounds.growl();}
        });
        cover(packs.crossfire);
        if (packs.crossfire.every(bug => bug.hp <= 0) && lineFinished()) {
          face(ellis.root, player);
          pose(ellis, 'talk');
          enter('regroup', 'breather');
        }
        break;
      case 'regroup':
        face(ellis.root, player);
        if (lineFinished()) enter('approach');
        break;
      case 'approach':
        if (moveSquad(dt, stops.gate)) {
          pose(pike, 'point');
          enter('gate', 'lift_gate');
        }
        break;
      case 'gate':
        if (lineFinished()) {
          pose(leader, 'shoot');
          sounds.growl();
          enter('ambush', 'contact');
        }
        break;
      case 'ambush':
        finalAttack(dt);
        if (lineFinished() && elapsed > 3.4) {
          activate(packs.gate);
          enter('combat', 'loss');
        }
        break;
      case 'combat':
        cover(packs.gate);
        if (packs.gate.every(bug => bug.hp <= 0) && lineFinished()) enter('clear', 'lift_clear');
        break;
      case 'lift': {
        const u = Math.min(1, elapsed / 5.8);
        lift.deck.position.y = 35 * u * u * (3 - 2*u);
        leader.root.position.copy(lift.deck.localToWorld(new THREE.Vector3(-1.35,.32,-.7)));
        face(leader.root, player);
        pose(leader, 'idle');
        if (u === 1 && lineFinished()) enter('complete');
        break;
      }
      case 'clear':
        moveSquad(dt, world.route.length - leader.start - 2);
        break;
    }
  }
  function controlMode() {
    if (phase === 'flyby' || phase === 'lift') return 'static';
    if (['hatch', 'crossfire', 'combat', 'clear'].includes(phase)) return 'play';
    return 'interactive';
  }
  const rendezvous = {trail: stops.beacon, stakes: stops.nest, ridge: stops.flyby,
    chase: stops.crossfire, approach: stops.gate};
  return {begin, update, squad, get phase(){return phase;},
    get objective(){
      if (state.progress > rendezvous[phase] + 10) return 'Turn back and regroup with the patrol.';
      if(phase==='watch')return 'Pike watches the upper fork.';
      if(phase==='tune')return Math.hypot(player.x-beacon.position.x,player.z-beacon.position.z)<4?tuner.hint:'Join Ellis at the blinking receiver.';
      if(phase==='keep')return 'Stow Ellis’s survey receiver.';
      return objectives[phase];
    },
    get controlMode(){return controlMode();},
    skip(){if (phase === 'flyby') enter('chase', 'chase');},
    interact(){
      if(phase==='tune'&&lineFinished()&&tuner.locked&&Math.hypot(player.x-beacon.position.x,player.z-beacon.position.z)<4){
        state.receiver=true;receiver.visible=false;enter('keep','fork_keep');return;
      }
      if(phase !== 'clear' || Math.hypot(player.x-lift.root.position.x,player.z-lift.root.position.z)>2.5)return;
      const seat=lift.deck.localToWorld(new THREE.Vector3(.65,2,1));
      player.copy(seat);
      enter('lift','lift_ride');
    },
    get heightOffset(){return phase === 'lift' ? lift.deck.position.y + .32 : 0;},
    resumeAtGateApproach(phase) {
      const chase=phase==='chase';
      for (const bug of [...packs.nest, ...(chase?[]:packs.crossfire)]) {
        bug.hp = 0;
        bug.active = bug.root.visible = false;
      }
      state.receiver=true;receiver.visible=false;marched = chase?stops.flyby:stops.crossfire;
      for (const member of squad) {
        member.root.rotation.y = place(member.root, member.start + marched, member.offset) + Math.PI;
        pose(member, 'idle');
      }
      if(chase)enter('chase','chase');else enter('approach');
    },
    get lookAt(){
      if(phase==='lift')return leader.root.position.clone().add(new THREE.Vector3(0,1.6,0));
      return phase === 'flyby' && elapsed > .85 ? ship.position : null;
    },
    get weaponsFree(){return controlMode() === 'play';},
    pause:dialogue.pause, mute:dialogue.mute
  };
}
