import * as THREE from 'three';
import {createPlainsWorld} from './field.js';
import {createRoverController} from '../mars/rover.js';
import {MODULE_BUILDERS} from '../mars/base.js';

import {fixes} from './crossing.js';
import {createRoverCombat} from './rover-combat.js';
import {createRadar} from './radar.js';

import {createDialogue} from './dialogue.js';
import {loadSoldiers} from './soldiers.js';
import {createTransmitterStop} from './transmitter.js';

function bearingCallout(position,heading,target){
  const bearing=Math.atan2(target.x-position.x,target.z-position.z)-heading;
  const turn=Math.atan2(Math.sin(bearing),Math.cos(bearing));
  if(Math.abs(turn)<.22)return 'drive_ahead';
  if(Math.abs(turn)>2.55)return 'drive_back';
  return 'drive_'+(Math.abs(turn)<.75?'bear_':'')+(turn>0?'left':'right');
}

const $=id=>document.getElementById(id);
async function startDrive(){
  document.body.classList.add('rover-chapter');
  document.title='Canyon Patrol · The Long Drive';
  $('sectorNumber').textContent='03';$('sectorName').textContent='THE LONG DRIVE';
  $('missionNumber').textContent='MISSION / 003';$('missionTitle').textContent='Cross the mountain passes';
  const navigationHint='Steer until the green radar contact is ahead, then close the range.';
  $('objective').textContent=navigationHint;
  $('kills').textContent='SURVEY ROVER';
  document.querySelector('.footerCenter small').textContent='↑ ↓ DRIVE   ← → STEER   SPACE FIRE   ESC PAUSE';
  $('panelTitle').textContent='THE LONG DRIVE';$('panelText').textContent='Dust has closed the pass. Follow each transmitter on the rover radar. The top of the scope is straight ahead.';
  $('brief').hidden=true;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,130);
  const renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true});
  function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();addEventListener('resize',resize);
  const level=await fetch(new URL('./plains.json',import.meta.url)).then(r=>r.json());
  const world=await createPlainsWorld(scene,{...level,kind:"drive"}),start=world.rover.position;
  scene.background=scene.fog.color;
  renderer.shadowMap.enabled=true;
  const contacts=fixes.map(([x,z],i)=>{
    const point=new THREE.Vector3(x,world.terrain.heightAt(x,z),z);
    const mast=MODULE_BUILDERS.comms_tower();mast.name='Survey transmitter';mast.position.copy(point);
    if(i<fixes.length-1)mast.scale.setScalar(.55);
    scene.add(mast);return point;
  });
  const goal=contacts.at(-1);
  let fix=0;
  const heading=Math.atan2(contacts[0].x-start.x,contacts[0].z-start.z);
  const driver=createRoverController({terrain:world.terrain,mesh:world.roverMesh,start:{x:start.x,z:start.z,headingDeg:heading*180/Math.PI}});
  const legs=contacts.map((p,i)=>{const from=i?contacts[i-1]:start;return Math.hypot(p.x-from.x,p.z-from.z);});
  const total=legs.reduce((sum,d)=>sum+d,0);
  let remaining=total;
  const drawRadar=createRadar();
  const keys=new Set();
  let mode='ready';
  let entry={};
  try{entry=JSON.parse(sessionStorage.getItem('patrol-entry-drive'))||{};}catch{}
  const audioState={time:0,muted:Boolean(entry.muted),get mode(){return mode;}};
  const [lines,soldiers,combat]=await Promise.all([
    fetch(new URL('./dialogue.json',import.meta.url)).then(r=>{
      if(!r.ok)throw Error('Drive dialogue could not load');return r.json();
    }),loadSoldiers(scene),createRoverCombat(scene,world,driver)
  ]);
  combat.sounds.setMuted(audioState.muted);
  const dialogue=createDialogue(Object.fromEntries(Object.entries(lines).filter(([id])=>id.startsWith('drive_'))),audioState);
  const faultIndex=Math.floor(contacts.length/2);
  const repair=createTransmitterStop({scene,world,driver,soldiers,dialogue,audioState,point:contacts[faultIndex]});
  const controls=document.querySelector('.footerCenter small');
  const driveControls=controls.textContent+'   M AUDIO';
  controls.textContent=driveControls;
  const saveKey='patrol-drive-contact-v1';
  let restored=false,service='pending';
  function saveContact(){
    try{sessionStorage.setItem(saveKey,JSON.stringify({fix,service,position:driver.state.position.toArray(),heading:driver.state.heading,combat:combat.progress}));}catch{}
  }
  try{
    const data=JSON.parse(sessionStorage.getItem(saveKey));
    if(data&&Number.isInteger(data.fix)&&data.fix>=0&&data.fix<contacts.length&&data.position?.length===3&&data.position.every(Number.isFinite)&&Number.isFinite(data.heading)){
      fix=data.fix;remaining=legs.slice(fix).reduce((a,b)=>a+b,0);
      driver.state.position.fromArray(data.position);driver.state.heading=data.heading;
      combat.restore(data.combat||{kills:data.kills});service=data.service;restored=true;
      if(fix>faultIndex)repair.restoreDone();
    }
  }catch{}
  function acquire(){
    remaining-=legs[fix];fix++;service=fix>faultIndex?'done':'pending';saveContact();
    dialogue.say(bearingCallout(driver.state.position,driver.state.heading,contacts[fix]));
  }
  function play(){
    if(mode==='parked'){try{sessionStorage.removeItem(saveKey);}catch{}const url=new URL(location.href);url.searchParams.set('chapter','repeater');location.assign(url);return;}
    combat.sounds.unlock();
    const starting=mode==='ready';
    keys.clear();mode='playing';$('overlay').hidden=true;
    if(starting&&restored&&service==='return'){
      repair.restoreReturn();$('driveRadar').hidden=true;controls.textContent='↑ ↓ WALK   ← → TURN   E BOARD   ESC PAUSE   M AUDIO';
    }else if(starting&&restored&&service==='stop')repair.stop();
    else if(starting)dialogue.say(restored?bearingCallout(driver.state.position,driver.state.heading,contacts[fix]):'drive_start');else dialogue.pause(false);
  }
  function pause(){
    if(mode!=='playing')return;
    keys.clear();mode='paused';dialogue.pause(true);$('overlay').hidden=false;$('panelTitle').textContent='ON HOLD';$('primary').textContent='RESUME DRIVE';
  }
  $('primary').disabled=false;$('primary').textContent='START ENGINE';$('loadStatus').textContent='';
  $('primary').onclick=play;$('pause').onclick=()=>mode==='paused'?play():pause();
  addEventListener('keydown',e=>{
    if(e.code==='Enter' && e.target.closest?.('a, button'))return;
    if(e.repeat&&['Escape','KeyM','KeyE','Enter'].includes(e.code))return;
    if(e.code==='KeyM'){
      audioState.muted=!audioState.muted;dialogue.mute(audioState.muted);combat.sounds.setMuted(audioState.muted);
      try{sessionStorage.setItem('patrol-entry-drive',JSON.stringify({...entry,muted:audioState.muted}));}catch{}
      return;
    }
    if(e.code==='KeyE'&&mode==='playing'){
      if(repair.interact()){acquire();$('objective').textContent=navigationHint;}
      controls.textContent=repair.onFoot?'↑ ↓ WALK   ← → TURN   E INTERACT   ESC PAUSE   M AUDIO':driveControls;
      $('driveRadar').hidden=repair.onFoot;
      keys.clear();return;
    }
    if(mode==='playing'&&e.code==='Space'){e.preventDefault();if(!e.repeat)combat.sounds.unlock();}
    if(e.code.startsWith('Arrow'))e.preventDefault();
    if(e.code==='Escape'&&!e.repeat){if(mode==='paused')play();else pause();return;}
    if(mode==='parked'&&e.code==='KeyE')play();
    else if(mode==='playing')keys.add(e.code);else if(e.code==='Enter')play();
  });
  addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',pause);
  const follow=new THREE.Vector3(),aim=new THREE.Vector3();
  function step(dt){
    const active=mode==='playing';
    if(active){audioState.time+=dt;dialogue.tick();}
    const stopped=repair.phase!=='pending'&&repair.phase!=='done';
    driver.update(active&&!stopped?dt:0,{forward:keys.has('ArrowUp'),backward:keys.has('ArrowDown'),left:keys.has('ArrowLeft'),right:keys.has('ArrowRight')});
    const pos=driver.state.position;
    let target=contacts[fix],dist=Math.hypot(target.x-pos.x,target.z-pos.z);
    if(active&&!stopped&&fix<contacts.length-1&&dist<13){
      if(fix===faultIndex){keys.clear();combat.clear();service='stop';saveContact();repair.stop();}
      else acquire();
      target=contacts[fix];dist=Math.hypot(target.x-pos.x,target.z-pos.z);
    }
    if(repair.phase!=='pending'&&repair.phase!=='done')$('objective').textContent=repair.objective();
    if(repair.onFoot){
      repair.update(active?dt:0,keys,camera);
      if(repair.phase==='return'&&service!=='return'){service='return';saveContact();}world.update(repair.foot,active?dt:0);
      const seekingRover=repair.phase==='return';
      const p=seekingRover?pos:repair.panel;
      $('distance').textContent=(seekingRover?'ROVER':'TRANSMITTER 5')+' · '+Math.ceil(Math.hypot(repair.foot.x-p.x,repair.foot.z-p.z))+' M';
      return;
    }
    if(active&&!stopped&&repair.phase!=='stopped'){
      combat.update(dt,fix,target,dist,legs[fix],keys.has('Space'));
      $('kills').textContent='ROVER MG · '+combat.kills+' SPIDERS DOWN';
    }
    drawRadar(pos,driver.state.heading,target,active?dt:0);
    follow.copy(pos).addScaledVector(driver.forwardVector(),-10);follow.y=Math.max(pos.y+5,world.terrain.heightAt(follow.x,follow.z)+2);
    camera.position.lerp(follow,active?1-Math.exp(-dt*8):1);
    aim.copy(pos).y+=1.3;camera.lookAt(aim);world.update(pos,active?dt:0);
    $('distance').textContent=(fix===contacts.length-1?'REPEATER':'SIGNAL '+(fix+1)+' / '+contacts.length)+' · '+Math.ceil(dist)+' M';$('progress').style.width=(100*(1-(remaining-legs[fix]+Math.min(dist,legs[fix]))/total))+'%';
    if(active&&fix===contacts.length-1&&dist<5){
      service='parked';saveContact();
      mode='parked';keys.clear();combat.clear();dialogue.pause(true);$('overlay').hidden=false;$('panelTitle').textContent='REPEATER REACHED';
      $('panelText').textContent='You and Vale reach the repeater. The field station is still silent.';$('primary').textContent='DISEMBARK WITH VALE';
    }
  }
  let last=performance.now();step(0);
  if(restored&&service==='parked'){mode='playing';step(0);}
  else if(document.referrer.startsWith(location.origin+'/games-3d/canyon-patrol')&&performance.getEntriesByType('navigation')[0]?.type!=='reload')play();
  if(new URLSearchParams(location.search).has('review'))window.__patrolDrive={driver,step,keys,goal,contacts,total,repair,camera,combat,get fix(){return fix;},get mode(){return mode;}};
  if(new URLSearchParams(location.search).has('review'))window.__narrativeMeshReview={
    scene,camera,renderer,terrain:world.terrain,walkable:world.walkable,exclude:[...world.skyRoots,...combat.reviewExcluded,repair.companion]
  };
  function frame(now){step(Math.min(.05,(now-last)/1000));last=now;renderer.render(scene,camera);requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
}
startDrive().catch(error=>{$('panelText').textContent=error.message;$('primary').disabled=false;$('primary').textContent='RETRY';$('primary').onclick=()=>location.reload();});
