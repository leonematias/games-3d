import * as THREE from 'three';
import {createEscort} from './escort.js';
import {receiverMesh} from './receiver.js';
import {createLanding} from './landing.js';

export function createPerimeter(context){
  const {world,scene,packs,state,player,dialogue,squad,damageEnemy,sounds,fx}=context;
  const {follow,cover}=createEscort(context);
  const landing=createLanding(scene,world),core=world.core.position,turret=world.turret;
  const cues=['hold_one','hold_two','hold_three','hold_four','hold_five'];
  const replies=[null,'west_reply','east_reply','pad_reply','final_reply'];
  let wave=0,phase='brief',integrity=100,elapsed=0,saluted=false,replyPending=false;
  const power=world.power,liveCircuits=new Set();
  const tasks=['choose','other','junction','last'];
  let switched=false;
  const radio=receiverMesh();squad[0].root.add(radio);radio.position.set(.24,1.15,.25);radio.visible=false;
  const hand=squad[0].root.getObjectsByProperty('isBone',true).find(b=>b.name.endsWith('LeftHand'));
  if(hand){
    hand.attach(radio);radio.position.set(0,0,0);
  }
  const close=node=>Math.hypot(player.x-node.position.x,player.z-node.position.z)<3.6;
  function switchCircuit(id){
    liveCircuits.add(id);power[id].userData.lamp.material.color.setHex(0x82ffc4);
    if(id!=='sentry')for(const lamp of power.rows[id==='last'?1:0])lamp.material.color.setHex(0xffcf85);
    sounds.pickup();
  }
  function taskForWave(){
    return tasks[wave];
  }
  function interact(){
    if(!tasks.includes(phase)||switched||!dialogue.lineFinished())return;
    if(phase==='choose'||phase==='other'){
      const id=['sentry','approach'].find(k=>!liveCircuits.has(k)&&close(power[k]));
      if(!id)return;switchCircuit(id);
    }else if(phase==='last'){
      if(!close(power.last))return;switchCircuit('last');
    }else if(phase==='junction'){
      if(!close(world.core))return;
      integrity=Math.min(100,integrity+25);sounds.pickup();
    }else return;
    switched=true;
  }
  const bugs=()=>packs['wave'+(wave+1)];
  function briefing(){
    phase='brief';replyPending=Boolean(replies[wave]);dialogue.say(cues[wave]);
    state.mag=60;state.reserve=Math.max(180,state.reserve);state.hp=wave===0?100:Math.min(100,state.hp+35);
    state.grenades=Math.max(2,state.grenades);state.fuel=Math.max(100,state.fuel);state.shells=8;state.spareShells=Math.max(16,state.spareShells);
    integrity=Math.min(100,integrity+12);
  }
  function attack(){
    phase='hold';elapsed=0;sounds.growl();
    bugs().forEach((bug,i)=>{
      const lane=wave===0?0:wave===1?-1:wave===2?1:i%2?1:-1;
      const p=world.worldPoint(2+(i%3)*2,lane*13+(i%3-1)*2.2);
      bug.root.position.copy(p);
      bug.arrivalDelay=wave<2?0:Math.floor(i/3)*2;
    });
  }
  function update(dt){
    dialogue.tick();squad[0].mixer.update(dt);
    if(phase==='brief'){
      follow(dt);
      if(dialogue.lineFinished()){
        if(replyPending){replyPending=false;dialogue.say(replies[wave]);}
        else attack();
      }
    }else if(phase==='hold'){
      elapsed+=dt;
      for(const bug of bugs()){
        if(!bug.active&&elapsed>=bug.arrivalDelay)bug.active=bug.aware=bug.root.visible=true;
      }
      const live=bugs().filter(b=>b.active&&b.hp>0).sort((a,b)=>a.root.position.distanceToSquared(core)-b.root.position.distanceToSquared(core));
      if(!live.length){
        if(bugs().some(b=>!b.active))return;
        if(wave+1<cues.length){
          phase=taskForWave();switched=false;
          const scout=packs.stragglers[wave];scout.root.position.copy(world.worldPoint(1,wave%2?8:-8));
          scout.active=scout.aware=scout.root.visible=true;
          const line={choose:'circuit_pick',other:'circuit_two',last:'circuit_last'}[phase];
          if(line)dialogue.say(line);
        }
        else {phase='landing';elapsed=0;landing.update(0);player.copy(landing.view);player.y=world.terrain.heightAt(player.x,player.z)+1.72;dialogue.say('hold_landing');}
        return;
      }
      cover(dt,live[0]);
      const point=live[0].aimPoint(),muzzle=turret.muzzle.getWorldPosition(new THREE.Vector3());
      turret.pivot.rotation.y=Math.atan2(turret.pivot.position.x-point.x,turret.pivot.position.z-point.z);
      if((wave===0||liveCircuits.has('sentry'))&&state.time>=turret.cooldown && world.clearLine(muzzle,point)){
        turret.rotor.rotation.z+=.65;fx.trace(muzzle,point);damageEnemy(live[0],8,point);turret.cooldown=state.time+.7;
      }
    }else if(tasks.includes(phase)){
      const scout=packs.stragglers[wave];
      if(scout.hp>0){cover(dt,scout);return;}
      if(switched){wave++;briefing();return;}
      context.face(squad[0].root,world.worldPoint(0,0));context.pose(squad[0],'aim');
    }else if(phase==='landing'){
      elapsed+=dt;landing.update(elapsed);
      if(!saluted&&elapsed>=7.4&&dialogue.lineFinished()){saluted=true;dialogue.say('crew_count');}
      if(saluted&&elapsed>=12&&dialogue.lineFinished()){
        phase='names';radio.visible=true;
        squad[0].root.position.copy(player);squad[0].root.position.x+=1.9;
        squad[0].root.position.y=world.terrain.heightAt(squad[0].root.position.x,squad[0].root.position.z);
        context.face(squad[0].root,player);context.pose(squad[0],'talk');dialogue.say('names_log');
      }
    }else if(phase==='names'&&dialogue.lineFinished()){
      phase='reply';elapsed=0;dialogue.say('names_reply');
    }else if(phase==='reply'){
      elapsed+=dt;landing.update(13,elapsed);
      if(elapsed>=1.5&&dialogue.lineFinished())phase='complete';
    }
  }
  return {squad,update,begin:briefing,interact,pause:dialogue.pause,mute:dialogue.mute,
    get phase(){return phase;},get weaponsFree(){return phase==='hold'||tasks.includes(phase);},
    get controlMode(){return ['landing','names','reply'].includes(phase)?'static':phase==='hold'?'play':'interactive';},
    get cinematicEye(){return phase==='names'?player:['landing','reply'].includes(phase)?landing.cameraPosition:null;},
    get lookAt(){return phase==='names'?radio.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.29,0)):['landing','reply'].includes(phase)?landing.focus():null;},
    get defenseTarget(){return phase==='hold'?core:null;},
    breach(amount){integrity=Math.max(0,integrity-amount);return integrity===0;},
    get objective(){
      if(tasks.includes(phase)&&switched)return 'Circuit secure. Help Vale clear the straggler.';
      if(phase==='choose')return 'Route trailer power · E at amber (sentry) or blue (approach lights).';
      if(phase==='other')return 'Close the second circuit · E at '+(liveCircuits.has('sentry')?'the blue approach switch.':'the amber sentry switch.');
      if(phase==='junction')return 'Service the landing beacon · E at the green mast.';
      if(phase==='last')return 'Power the final row · E at the amber switch between the dark lamps.';
      if(phase==='names'||phase==='reply')return 'Listen to Vale.';
      return phase==='complete'?'Evacuation secure.':phase==='landing'?'Watch Kestrel land.':`Wave ${wave+1} / 5 · Beacon ${Math.ceil(integrity)}% · ${phase==='brief'?'Resupply and listen.':'Hold the approach.'}`;}
  };
}
