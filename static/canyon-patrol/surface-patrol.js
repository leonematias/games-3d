import {createEscort} from './escort.js';
import * as THREE from 'three';
import {buildShip} from '../solar-system/ship.js';

export function createSurfacePatrol({world,scene,packs,stops,player,state,fx,sounds,damageEnemy,dialogue,squad,pose,face}){
  const vale=squad[0], craft=buildShip(), ship=craft.group;
  ship.name="Kestrel flyby";ship.scale.setScalar(.65);
  craft.plume.material.opacity=.8;
  craft.innerPlume.material.opacity=.9;
  scene.add(ship);
  const start=world.route.at(28,-18),end=world.route.at(world.route.length,0);
  ship.rotation.y=Math.atan2(start.x-end.x,start.z-end.z);
  let phase='spot', elapsed=0, flight=0, waveIndex=0;
  let trail=null,marker=0;
  const near=p=>Math.hypot(player.x-p.x,player.z-p.z);
  const waves=[
    ['scouts','first_pack'],['ridge','second_pack'],['station','third_pack']
  ];
  function enter(next,line){
    phase=next;elapsed=0;
    if(line)dialogue.say(line);
  }
  const {follow,cover,distanceTo}=createEscort({world,player,state,fx,sounds,damageEnemy,squad,pose,face});
  function startWave(){
    const [name,line]=waves[waveIndex],pack=packs[name];
    const yaw=world.route.at(stops[name]).yaw;
    pack.forEach((bug,i)=>{
      const angle=yaw+(i%2?-.6:.65)+i*.12;
      const x=player.x-Math.sin(angle)*(28+2*i),z=player.z-Math.cos(angle)*(28+2*i);
      if(world.walkable(x,z))bug.root.position.set(x,world.terrain.heightAt(x,z),z);
      bug.root.visible=true;bug.root.position.y-=2;
      bug.play('idle');
    });
    sounds.growl();enter('fight',line);
  }
  function update(dt){
    elapsed+=dt;flight+=dt;dialogue.tick();vale.mixer.update(dt);
    const u=Math.min(1,flight/24);
    ship.visible=u<1&&trail!=='wash';
    if(trail!=='ridge'||marker>=world.branches.ridge.length)ship.position.set(THREE.MathUtils.lerp(start.x,end.x,u),world.terrain.heightAt(start.x,start.z)+12+u*12,THREE.MathUtils.lerp(start.z,end.z,u));
    ship.rotation.z=-.12*Math.cos(u*Math.PI);
    if(trail==='ridge'&&marker<world.branches.ridge.length){
      const p=world.branches.ridge[marker];ship.visible=true;
      ship.position.lerp(new THREE.Vector3(p.x+10*Math.sin(flight*.25),world.terrain.heightAt(p.x,p.z)+15,p.z-15+5*Math.cos(flight*.25)),1-Math.exp(-dt*.55));
    }
    if(phase==='spot'){
      face(vale.root,ship.position);pose(vale,'point');
      if(dialogue.lineFinished())enter('fork','flats_fork');
    }else if(phase==='fork'){
      follow(dt);
      const branch=Object.keys(world.branches).find(k=>near(world.branches[k][0])<5);
      if(branch&&dialogue.lineFinished()){
        trail=branch;marker=1;enter('branch',branch==='wash'?'flats_wash':'flats_ridge');flight=0;
      }
    }else if(phase==='branch'){
      follow(dt);
      if(near(world.branches[trail][marker])<6&&dialogue.lineFinished()){
        if(trail==='wash'&&marker===2){state.hp=100;state.grenades+=2;state.reserve+=90;sounds.pickup();}
        marker++;
        if(marker===2||marker===4)startWave();
        else if(marker===world.branches[trail].length)enter('walk');
      }
    }else if(phase==='fight'){
      const pack=packs[waves[waveIndex][0]];
      pack.forEach((bug,i)=>{
        if(bug.active||bug.hp<=0)return;
        const p=bug.root.position, rise=THREE.MathUtils.clamp((elapsed-i*.85)/1.6,0,1);
        p.y=world.terrain.heightAt(p.x,p.z)-2*(1-rise);
        if(elapsed>=2.5+i*1.4){bug.active=bug.aware=true;}
      });
      const target=pack.find(bug=>bug.active&&bug.hp>0);
      if(target){
        cover(dt,target);
      }else if(pack.every(b=>b.hp<=0)&&dialogue.lineFinished()){
        waveIndex++;enter(waveIndex===waves.length?'arrive':marker<world.branches[trail].length?'branch':'walk');
      }
    }else{
      follow(dt);
      if(phase==='walk' && state.progress>=stops[waves[waveIndex][0]])startWave();
      else if(phase==='arrive' && distanceTo(world.radio)<8){
        state.hp=100;state.mag=60;state.reserve=Math.max(state.reserve,180);sounds.pickup();enter('rest','shelter');
      }else if(phase==='rest' && dialogue.lineFinished())enter('radio');
      else if(phase==='call' && dialogue.lineFinished())enter('listen');
      else if(phase==='listen' && elapsed>=3.5)enter('unanswered','silence');
      else if(phase==='unanswered' && dialogue.lineFinished())enter('plan','rover_plan');
      else if(phase==='plan' && dialogue.lineFinished())enter('board');
    }
  }
  function interact(){
    if(phase==='radio' && distanceTo(world.radio)<4.5)enter('call','distress');
    else if(phase==='board' && distanceTo(world.rover)<4.5)enter('complete');
  }
  const goals={spot:'Look up. The Kestrel is crossing the flats.',walk:'Follow the flight path toward the dish to the north.',
    arrive:'Reach the field station and rest by the radio mast.',rest:'Catch your breath. Health and ammunition restored.',
    radio:'Approach the dish and press E to call for help.',call:'Transmit the distress call.',listen:'Keep the channel open…',
    unanswered:'Listen for a reply.',plan:'Listen to Vale.',board:'Approach the parked rover and press E to board.',complete:'Boarding the rover.'};
  return {squad,update,interact,begin(){enter('spot','surface_ship');},
    get phase(){return phase;},get objective(){
      if(phase==='fight'&&elapsed<2.5)return 'Ground moving ahead. Face the rising spiders and ready your weapon.';
      if(phase==='fork')return 'Choose a trail. Walk to the amber ridge pole or the blue wash pole.';
      if(phase==='branch'){
        const p=world.branches[trail][marker],bearing=(Math.round(Math.atan2(p.x-player.x,player.z-p.z)*180/Math.PI)+360)%360;
        return (trail==='ridge'?'Amber ridge':'Blue wash')+' · Follow pole '+(marker+1)+' · '+Math.ceil(near(p))+' m · '+bearing+'°';
      }
      return phase==='fight'?`Repel spider wave ${waveIndex+1} of 3.`:goals[phase];},
    get controlMode(){return phase==='fight'||phase==='walk'?'play':'interactive';},
    get weaponsFree(){return phase==='fight'||phase==='walk';},pause:dialogue.pause,mute:dialogue.mute};
}
