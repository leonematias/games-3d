import * as THREE from 'three';
import {createPlainsWorld} from './field.js';
import {createRoverController} from '../mars/rover.js';
import {MODULE_BUILDERS} from '../mars/base.js';
import {batteryTrailer} from './battery.js';
import {createDialogue} from './dialogue.js';
import {createRadar} from './radar.js';
import {createRoverCombat} from './rover-combat.js';

const $=id=>document.getElementById(id);
async function start(){
  document.body.classList.add('rover-chapter');
  document.title='Canyon Patrol · The Cable Run';
  $('sectorNumber').textContent='05';$('sectorName').textContent='THE CABLE RUN';
  $('missionNumber').textContent='MISSION / 005';$('missionTitle').textContent='Bring power to Shelter Two';
  $('panelTitle').textContent='THE CABLE RUN';$('panelText').textContent='Mara has found a charged trailer. Follow her service beacons to the maintenance yard.';
  $('brief').hidden=true;$('kills').textContent='BATTERY RECOVERY';
  document.querySelector('.footerCenter small').textContent='↑ ↓ DRIVE   ← → STEER   E HITCH / CONNECT   ESC PAUSE   M AUDIO';
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(62,1,.1,650);
  const renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true});
  function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();addEventListener('resize',resize);
  const pass=[[-130,-170],[-340,-105],[-492,-292],[-630,-440]];
  const world=await createPlainsWorld(scene,{kind:'cable',path:[[-44,-88],[-46,-49]],pass});
  scene.fog.far=185;
  const home=world.rover.position.clone(),ground=p=>world.terrain.heightAt(p.x,p.z);
  const stops=pass.map(([x,z],i)=>{
    const p=new THREE.Vector3(x,0,z);p.y=ground(p);
    const mesh=i===1?MODULE_BUILDERS.solar_array():MODULE_BUILDERS.comms_tower();
    mesh.name=i===1?'Solar array':'Comms tower';
    mesh.position.copy(p);mesh.position.x+=7;mesh.position.y=ground(mesh.position);scene.add(mesh);return p;
  });
  const trailer=batteryTrailer();trailer.name='Battery trailer';trailer.position.copy(stops.at(-1));scene.add(trailer);
  const route=[...stops,...stops.slice(0,-1).reverse(),home];
  const heading=Math.atan2(route[0].x-home.x,route[0].z-home.z);
  const driver=createRoverController({terrain:world.terrain,mesh:world.roverMesh,start:{x:home.x,z:home.z,headingDeg:heading*180/Math.PI}});
  const [lines,combat]=await Promise.all([fetch(new URL('./dialogue.json',import.meta.url)).then(r=>r.json()),createRoverCombat(scene,world,driver)]);
  let entry={};try{entry=JSON.parse(sessionStorage.getItem('patrol-entry-cable'))||{};}catch{}
  const state={mode:'ready',time:0,muted:!!entry.muted};
  const dialogue=createDialogue(Object.fromEntries(Object.entries(lines).filter(([id])=>id.startsWith('tow_'))),state);
  combat.sounds.setMuted(state.muted);
  const radar=createRadar(),keys=new Set(),pos=driver.state.position;
  const length=(p,q)=>Math.hypot(p.x-q.x,p.z-q.z);
  let index=0,towing=false;
  function play(){
    const fresh=state.mode==='ready';state.mode='playing';keys.clear();$('overlay').hidden=true;
    combat.sounds.unlock();if(fresh)dialogue.say('tow_begin');else dialogue.pause(false);
  }
  function pause(){
    if(state.mode!=='playing')return;state.mode='paused';keys.clear();dialogue.pause(true);
    $('overlay').hidden=false;$('panelTitle').textContent='ON HOLD';$('primary').textContent='RESUME DRIVE';
  }
  function interact(){
    if(index===3&&length(pos,trailer.position)<8){
      towing=true;index++;driver.state.speed=0;dialogue.say('tow_hook');
    }else if(index===7&&length(pos,home)<8){
      state.mode='departing';dialogue.pause(true);
      try{sessionStorage.setItem('patrol-entry-defense',JSON.stringify({...entry,muted:state.muted}));}catch{}
      const url=new URL(location.href);url.searchParams.set('chapter','defense');location.assign(url);
    }
  }
  addEventListener('keydown',e=>{
    if(e.code==='Enter' && e.target.closest?.('a, button'))return;
    if(e.code.startsWith('Arrow'))e.preventDefault();
    if(e.repeat)return;
    if(e.code==='Escape'){if(state.mode==='paused')play();else pause();return;}
    if(e.code==='KeyM'){state.muted=!state.muted;dialogue.mute(state.muted);combat.sounds.setMuted(state.muted);return;}
    if(state.mode==='playing'){keys.add(e.code);if(e.code==='KeyE')interact();}
    else if(e.code==='Enter')play();
  });
  addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',pause);
  $('primary').disabled=false;$('primary').textContent='DRIVE TO THE YARD';$('loadStatus').textContent='';
  $('primary').onclick=play;$('pause').onclick=()=>state.mode==='paused'?play():pause();
  function step(dt){
    const active=state.mode==='playing',sim=active?dt:0;
    state.time+=sim;dialogue.tick();
    driver.update(sim,{forward:keys.has('ArrowUp'),backward:keys.has('ArrowDown'),left:keys.has('ArrowLeft'),right:keys.has('ArrowRight')});
    if(towing){
      driver.state.speed=THREE.MathUtils.clamp(driver.state.speed,-4,10);
      const hitch=pos.clone().addScaledVector(driver.forwardVector(),-2);
      const angle=Math.atan2(hitch.x-trailer.position.x,hitch.z-trailer.position.z);
      trailer.rotation.y+=Math.atan2(Math.sin(angle-trailer.rotation.y),Math.cos(angle-trailer.rotation.y))*(1-Math.exp(-sim*4));
      trailer.position.set(hitch.x-2.8*Math.sin(trailer.rotation.y),0,hitch.z-2.8*Math.cos(trailer.rotation.y));
      trailer.position.y=ground(trailer.position);
    }
    let target=route[index],dist=length(pos,target);
    if(active&&index!==3&&index!==7&&dist<15){
      index++;if(index===2)dialogue.say('tow_yard');if(index===7)dialogue.say('tow_home');
      target=route[index];dist=length(pos,target);
    }
    if(active&&towing){
      combat.update(dt,index-4,target,dist,length(route[index-1],target),'cover');
      $('kills').textContent='VALE ON GUN · '+combat.kills+' SPIDERS DOWN';
    }
    radar(pos,driver.state.heading,target,sim);
    const eye=pos.clone().addScaledVector(driver.forwardVector(),towing?-14:-10);
    eye.y=Math.max(pos.y+(towing?7:5),ground(eye)+2);
    camera.position.lerp(eye,active?1-Math.exp(-dt*7):1);camera.lookAt(pos.x,pos.y+1,pos.z);
    world.update(pos,sim);
    $('objective').textContent=index===3?'Approach the yellow trailer · E hitch':index===7?'Return to the pad junction · E connect':towing?'Tow the battery home. Vale has the gun.':'Follow Mara’s service beacons to the yard.';
    $('distance').textContent=Math.ceil(dist)+' M';$('progress').style.width=(100*(index+Math.max(0,1-dist/length(index?route[index-1]:home,target)))/route.length)+'%';
  }
  step(0);if(document.referrer.startsWith(location.origin+'/games-3d/canyon-patrol'))play();
  if(new URLSearchParams(location.search).has('review'))window.__cableRun={step,driver,keys,route,trailer,get index(){return index;},get towing(){return towing;}};
  if(new URLSearchParams(location.search).has('review'))window.__narrativeMeshReview={
    scene,camera,renderer,terrain:world.terrain,walkable:world.walkable,exclude:[...world.skyRoots,...combat.reviewExcluded]
  };
  let last=performance.now();function frame(now){step(Math.min(.05,(now-last)/1000));last=now;renderer.render(scene,camera);requestAnimationFrame(frame);}requestAnimationFrame(frame);
}
start().catch(e=>{$('panelText').textContent=e.message;$('primary').disabled=false;$('primary').textContent='RETRY';$('primary').onclick=()=>location.reload();});
