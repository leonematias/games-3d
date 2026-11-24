import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createWorld,createRoute,makePickup} from '../mars-shooter/world.js';
import {loadActors,createEffects} from '../mars-shooter/actors.js';
import {createSounds} from '../mars-shooter/sounds.js';
import {reviewSounds} from './audio-evidence.js';
import {warmupRenderer} from '../mars-shooter/warmup.js';
import {createPlainsWorld,freightLift} from './field.js';
import {createPatrol} from './patrol.js';
import {createFlame} from '../mars-shooter/flamethrower.js';
import {createGrenades} from '../mars-shooter/grenades.js';
import {createGameMusic} from '../music/music-player.js';

const $=id=>document.getElementById(id),keys=new Set(),params=new URLSearchParams(location.search);
const clamp=THREE.MathUtils.clamp,angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const chapter=params.get('chapter');
const plains=['flats','repeater','defense'].includes(chapter);
let patrol, checkpoint, lift;
function nextChapter(chapter){
  state.mode='departing';
  keys.clear();patrol.pause(true);
  const destination=new URL(location.href);
  destination.searchParams.set('chapter',chapter);
  try {
    if(chapter==='drive')sessionStorage.removeItem('patrol-drive-contact-v1');
    sessionStorage.setItem('patrol-entry-'+chapter,JSON.stringify({
      receiver:state.receiver,hp:state.hp,mag:state.mag,reserve:state.reserve,grenades:state.grenades,
      shells:state.shells,spareShells:state.spareShells,fuel:state.fuel,weapon:state.weapon,muted:state.muted
    }));
  }catch{}
  location.assign(destination);
}
const checkpointKey = 'canyon-patrol-gate-v1';
const checkpointFields = ['hp', 'mag', 'reserve', 'shells', 'spareShells', 'grenades', 'fuel', 'weapon', 'kills', 'time'];
function saveApproach(phase) {
  checkpoint = {
    phase, supplies: Object.fromEntries(checkpointFields.map(key => [key, state[key]])),
    position: player.toArray(), yaw,
    taken: pickups.map(pickup => pickup.taken)
  };
  try{sessionStorage.setItem(checkpointKey,JSON.stringify(checkpoint));}catch{}
}
function resumeApproach() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(checkpointKey));
    if(performance.getEntriesByType('navigation')[0]?.type!=='reload'){sessionStorage.removeItem(checkpointKey);return false;}
  } catch { return false; }
  if (!saved?.supplies || saved.position?.length !== 3 || saved.taken?.length !== pickups.length) return false;
  checkpoint = saved;
  Object.assign(state, saved.supplies);
  player.fromArray(saved.position);
  yaw = saved.yaw;
  pickups.forEach((pickup, i) => {
    pickup.taken = saved.taken[i];
    pickup.mesh.visible = !pickup.taken;
    if (pickup.taken) pickup.light.intensity = 0;
  });
  patrol.resumeAtGateApproach(saved.phase);
  return true;
}
function restorePlayerCamera() {
  keys.clear();
  yaw = world.route.at(state.progress).yaw;
  pitch = 0;
}
const ENEMY_SIGHT=64;
const state={mode:'loading',hp:100,mag:60,reserve:360,reload:0,shot:0,kills:0,time:0,progress:0,damage:0,recoil:0,hit:0,toast:0,steps:0,shots:0,hits:0,muted:false,grenades:6,grenadeCooldown:0,grenadeShots:0,explosions:0,blastShake:0,weapon:'machinegun',fuel:200,slime:0,supplyWave:0,shells:8,spareShells:48};
const player=new THREE.Vector3(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.065,plains?1600:1100);
camera.rotation.order='YXZ';let yaw=0,pitch=0,world,actors,level,grenadeSystem,flameSystem,enemies=[],pickups=[],gun,fx,muzzle,flash,flashLight,totalEnemies=0,lastTime=0,clock=0,target=null;
const sounds=reviewSounds(createSounds()),music=createGameMusic({track:'mars-shooter/rift-signal',volume:.34});
const renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
scene.add(camera);
// A separate camera-attached weapon scene prevents the gun clipping into cliffs.
const weaponScene=new THREE.Scene(),weaponCamera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.01,10);
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
weaponScene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
weaponScene.add(new THREE.HemisphereLight(0xc1d4df,0x6c4c36,2.4));
const keyLight=new THREE.DirectionalLight(0xffd5a7,3.3);keyLight.position.set(-2,3,-4);weaponScene.add(keyLight);
function toast(text){$('toast').textContent=text;state.toast=3;}
function panel(kicker,title,text,button){$('panelKicker').textContent=kicker;$('panelTitle').innerHTML=title;$('panelText').textContent=text;$('primary').textContent=button;$('primary').disabled=false;$('overlay').hidden=false;$('brief').hidden=true;$('loadStatus').textContent='';}
function setPause(paused){if(!['playing','paused'].includes(state.mode))return;keys.clear();state.mode=paused?'paused':'playing';music.pause(paused);patrol?.pause(paused);if(paused){sounds.setMuted(true);panel('TRANSMISSION HELD','ON<br><em>HOLD</em>',state.receiver?'Patrol equipment · Ellis’s survey receiver.':'Catch your breath. Your mission is paused.','RESUME MISSION');}else{$('overlay').hidden=true;sounds.setMuted(state.muted);}}
function start(){sounds.unlock();music.start();if(state.mode==='paused'){setPause(false);return;}if(['won','dead'].includes(state.mode)){
  if (state.mode === 'dead' && checkpoint) {
    try { sessionStorage.setItem(checkpointKey, JSON.stringify(checkpoint)); } catch {}
  }
  if(state.mode==='won'){location.assign('/games-3d/canyon-patrol');return;}
  location.reload();return;
}if(state.mode!=='ready')return;state.mode='playing';keys.clear();$('overlay').hidden=true;if (plains || !resumeApproach()) patrol.begin();}
$('primary').addEventListener('click',start);$('pause').addEventListener('click',()=>setPause(state.mode!=='paused'));
window.addEventListener('keydown',e=>{
  if(e.code==='Enter' && e.target.closest?.('a, button'))return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
  if(e.repeat && ['Escape','KeyM','KeyR','KeyF','Digit1','Digit2','Digit3','KeyE','Enter'].includes(e.code))return;
  if(e.code==='Enter' && state.mode!=='playing'){start();return;}
  if(e.code==='Escape'){setPause(state.mode!=='paused');return;}
  if(e.code==='KeyM'){state.muted=!state.muted;sounds.setMuted(state.muted||state.mode==='paused');music.setMuted(state.muted);patrol?.mute(state.muted);toast(state.muted?'AUDIO OFF':'AUDIO ON');return;}
  if(state.mode==='playing'){
    if(patrol.controlMode === 'static'){
      if(e.code === 'KeyE' && !e.repeat && patrol.phase==='flyby') { patrol.skip();saveApproach('chase');restorePlayerCamera(); }
      return;
    }
    if(e.repeat && !keys.has(e.code)) return;
    if(e.code === 'KeyE') patrol.interact();
    keys.add(e.code);sounds.unlock();
    if(e.code==='KeyR')reload();
    const choice={Digit1:'machinegun',Digit2:'flame',Digit3:'shotgun',KeyF:state.weapon==='machinegun'?'flame':'machinegun'}[e.code];
    if(choice){state.weapon=choice;state.reload=0;toast({flame:'F–9 FLAMETHROWER',machinegun:'M–41 MACHINE GUN',shotgun:'PUMP SHOTGUN · CLOSE RANGE'}[choice]);}
  }
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>setPause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)setPause(true);});
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=weaponCamera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();weaponCamera.updateProjectionMatrix();});

function reload(){if(state.weapon==='shotgun'){if(!state.reload&&state.shells<8&&state.spareShells){state.reload=1.8;sounds.reload();}return;}if(state.weapon==='flame')return;if(state.reload>0||state.mag===60||state.reserve<=0)return;state.reload=1.8;sounds.reload();}
function eyeOf(e){return e.aimPoint();}
function findTarget(){let best=null,bestAngle=.16;for(const e of enemies){if(!e.active||e.hp<=0)continue;const delta=eyeOf(e).sub(player),distance=delta.length();if(distance>68)continue;const a=Math.abs(angle(Math.atan2(-delta.x,-delta.z)-yaw));if(a<bestAngle&&world.clearLine(player,eyeOf(e))){best=e;bestAngle=a;}}return best;}
function hurt(amount){if(state.mode!=='playing')return;state.hp=Math.max(0,state.hp-amount);state.damage=1;sounds.hurt();if(state.hp<=0){state.mode='dead';patrol?.pause(true);keys.clear();music.lose();sounds.death();panel('BIOSIGNAL LOST','SIGNAL<br><em>LOST</em>',`${state.kills} bugs neutralized. Keep your distance during reloads and collect the cyan medical kits.`,checkpoint?(checkpoint.phase==='chase'?'RETRY THE PURSUIT':'RETRY FROM REGROUP'):'REDEPLOY');}}
function damageEnemy(enemy,amount,point){
  if(enemy.hp<=0)return;
  enemy.hp=Math.max(0,enemy.hp-amount);enemy.aware=true;enemy.aggression=3;state.hit=.12;if(amount>=10)fx.burst(point,16,'blood');
  if(enemy.hp===0){state.kills++;enemy.dead=.001;fx.death(enemy,world.terrain);enemy.root.visible=false;enemy.mixer.stopAllAction();}
}
function launchGrenade(){
  if(state.weapon!=='machinegun'||state.grenadeCooldown>0||state.reload>0)return;
  if(state.grenades<=0){state.grenadeCooldown=.4;sounds.empty();toast('NO GRENADES · FIND A VIOLET CACHE');return;}
  state.grenades--;state.grenadeShots++;state.grenadeCooldown=1.6;state.recoil=.14;sounds.grenade();
  gun.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const origin=actors.grenadeMuzzle.getWorldPosition(new THREE.Vector3()).applyQuaternion(camera.quaternion).add(camera.position);
  const direction=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);direction.y+=.12;direction.normalize();
  grenadeSystem.launch(origin,direction);fx.burst(origin,12,'spark',direction);
}
function shoot(){
  if(state.reload>0||state.shot>0)return;
  if(state.mag<=0){if(state.reserve>0)reload();else{sounds.empty();state.shot=.3;toast('OUT OF AMMO · FIND AN AMBER CACHE');}return;}
  state.mag--;state.shots++;state.shot=1/11;state.recoil=Math.min(.09,state.recoil+.033);sounds.shot();
  gun.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion),start=muzzle.getWorldPosition(new THREE.Vector3()).applyQuaternion(camera.quaternion).add(camera.position);
  const end=player.clone().addScaledVector(forward,70);
  let victim=null,nearest=70;
  for(const e of enemies){if(!e.active||e.hp<=0)continue;for(const center of e.hitPoints()){const delta=center.clone().sub(player),along=delta.dot(forward);if(along<.15||along>nearest)continue;const off=delta.clone().addScaledVector(forward,-along);if(off.length()<e.hitRadius&&world.clearLine(player,center)){victim=e;nearest=along;}}}
  // Stop misses on the actual heightfield. No firing through a switchback.
  for(let d=.6;d<nearest;d+=.55){const p=player.clone().addScaledVector(forward,d);if(world.isSolid(p,.05)){end.copy(p);victim=null;nearest=d;break;}}
  if(victim){
    state.hits++;end.copy(player).addScaledVector(forward,nearest);damageEnemy(victim,12,end);sounds.impact();
    if(victim.hp>0&&state.hits%3===0)fx.stain(victim.root.position,world.terrain,.4);
  }else fx.burst(end,7,'spark');
  fx.trace(start,end);fx.burst(start,5,'spark',forward);
  const casing=actors.eject.getWorldPosition(new THREE.Vector3()).applyQuaternion(camera.quaternion).add(camera.position);fx.burst(casing,1,'casing',new THREE.Vector3(1,.4,0).applyQuaternion(camera.quaternion));
  flash.visible=true;flash.rotation.z=Math.random()*Math.PI;flashLight.intensity=5;
  for(const e of enemies)if(e.active&&e.hp>0&&e.root.position.distanceTo(player)<42&&world.clearLine(player,eyeOf(e)))e.aware=true;
}

function fireShotgun(){
  if(state.shot>0||state.reload>0)return;
  if(!state.shells){reload();if(!state.reload){sounds.empty();state.shot=.4;}return;}
  state.shells--;state.shots++;state.shot=.72;state.recoil=.18;sounds.shotgun();
  const start=new THREE.Vector3(.23,-.23,-.8).applyQuaternion(camera.quaternion).add(player);
  // A fixed pellet fan makes range and cover predictable with keyboard aim.
  for(let i=0;i<12;i++){
    const r=.14*Math.sqrt(i/11),a=i*2.4,dir=new THREE.Vector3(r*Math.cos(a),r*Math.sin(a),-1).normalize().applyQuaternion(camera.quaternion);
    let nearest=27,victim=null;
    for(const e of enemies){if(!e.active||e.hp<=0)continue;for(const point of e.hitPoints()){
      const delta=point.clone().sub(player),d=delta.dot(dir);
      if(d>0&&d<nearest&&delta.addScaledVector(dir,-d).length()<e.hitRadius&&world.clearLine(player,point)){victim=e;nearest=d;}
    }}
    if(victim){damageEnemy(victim,Math.max(2,30*(1-nearest/27)),victim.aimPoint());state.hits++;}
    else for(let d=.5;d<nearest;d+=.65){if(world.isSolid(player.clone().addScaledVector(dir,d))){nearest=d;break;}}
    if(i%2===0)fx.trace(start,player.clone().addScaledVector(dir,nearest));
  }
  fx.burst(start,9,'spark');
}
function strike(e){
  e.attack=.55;e.cooldown=1.35;e.play('attack',true);hurt(e.damage);
  if(e.index%2===0)sounds.growl();
}
function updateEnemies(dt){
  if(!patrol.weaponsFree)return;
  for(const e of enemies){
    if(!e.active)continue;
    e.mixer.update(dt);if(e.hp>0)e.ground(world.terrain);if(e.hp>0&&e.burn>0){e.burn-=dt;damageEnemy(e,25*dt,e.aimPoint());}
    if(e.hp<=0){e.dead+=dt;e.root.visible=false;continue;}
    const ep=e.root.position,delta=player.clone().sub(ep),distance=Math.hypot(delta.x,delta.z);
    e.cooldown=Math.max(0,e.cooldown-dt);
    const visible=distance<ENEMY_SIGHT&&world.clearLine(player,eyeOf(e));
    if(!e.aware&&visible){e.aware=true;sounds.growl();}
    if(!e.aware){e.play('idle');continue;}
    e.root.rotation.y=Math.atan2(-delta.x,-delta.z);
    // Damage lands on contact; the animation is follow-through, not a windup.
    if(e.attack>0){e.attack=Math.max(0,e.attack-dt);continue;}
    if(distance<=e.reach&&visible){if(e.cooldown<=0)strike(e);else e.play('idle');continue;}
    e.play('run',false,clamp(e.speed/(e.type==='worm'?5:e.span*1.3),.65,2.8));
    const beacon=patrol.defenseTarget;
    let tx=player.x,tz=player.z;
    if(beacon && distance>e.reach){
      tx=beacon.x;tz=beacon.z;
      if(Math.hypot(ep.x-tx,ep.z-tz)<2.4){
        if(e.cooldown<=0){
          e.cooldown=1.4;e.play('attack',true);
          if(patrol.breach(5)){
            state.mode='dead';keys.clear();patrol.pause(true);music.lose();
            panel('SHELTER SIGNAL LOST','BEACON<br><em>DOWN</em>','The landing beacon went dark. Regroup with Vale and hold the approaches.','RETRY DEFENSE');return;
          }
        }
        continue;
      }
      e.root.rotation.y=Math.atan2(ep.x-tx,ep.z-tz);
    }
    if(!visible&&!beacon){const n=world.route.nearest(ep.x,ep.z),sign=Math.sign(state.progress-n.s),way=world.route.at(n.s+sign*5,e.lateral*.35);tx=way.x;tz=way.z;}
    let dx=tx-ep.x,dz=tz-ep.z,len=Math.hypot(dx,dz);dx/=len||1;dz/=len||1;
    // Separation keeps a pack readable and prevents all claws occupying one point.
    let sx=0,sz=0;
    for(const other of enemies){if(other===e||!other.active||other.hp<=0)continue;const ox=ep.x-other.root.position.x,oz=ep.z-other.root.position.z,d=Math.hypot(ox,oz);if(d<2.3&&d>.01){sx+=ox/d*(2.3-d);sz+=oz/d*(2.3-d);}}
    const nx=ep.x+(dx*e.speed+sx*2.2)*dt,nz=ep.z+(dz*e.speed+sz*2.2)*dt;
    if(world.walkable(nx,nz)){ep.x=nx;ep.z=nz;}
    else if(world.walkable(nx,ep.z)){ep.x=nx;}
    else if(world.walkable(ep.x,nz)){ep.z=nz;}
    else{const n=world.route.nearest(ep.x,ep.z),pull=Math.min(1,dt*e.speed);ep.x+=(n.x-ep.x)*pull;ep.z+=(n.z-ep.z)*pull;}
    ep.y=world.terrain.heightAt(ep.x,ep.z);e.ground(world.terrain);
    // A fast charge can enter range during this frame's movement.
    if(e.cooldown<=0&&Math.hypot(player.x-ep.x,player.z-ep.z)<=e.reach&&world.clearLine(player,eyeOf(e)))strike(e);
  }
}
function support(x,z){return world.terrain.heightAt(x,z);}
function updatePlayer(dt){
  const horizontal=Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight'));
  const sidestepping=keys.has('KeyC');
  const turn=sidestepping?0:horizontal;
  yaw+=turn*1.5*dt;
  const walk=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0),strafe=sidestepping?-horizontal:0,speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?8:5.8;
  const norm=Math.hypot(walk,strafe)||1,dx=(-Math.sin(yaw)*walk+Math.cos(yaw)*strafe)/norm*speed*dt,dz=(-Math.cos(yaw)*walk-Math.sin(yaw)*strafe)/norm*speed*dt;
  let moving=false;
  for(const [x,z] of [[player.x+dx,player.z+dz],[player.x+dx,player.z],[player.x,player.z+dz]]){
    if(!(dx||dz))break;
    if(world.route.nearest(x,z).distance<level.walkWidth&&world.walkable(x,z)&&Math.abs(support(x,z)-support(player.x,player.z))<Math.hypot(x-player.x,z-player.z)*.8+.04){player.x=x;player.z=z;moving=true;break;}
  }
  state.steps+=moving?dt*speed:0;
  if(moving && Math.floor(state.steps/2.4)!==Math.floor((state.steps-dt*speed)/2.4))sounds.step();
  const grounded=support(player.x,player.z)+1.72+(patrol.heightOffset || 0);
  player.y=THREE.MathUtils.lerp(player.y,grounded,1-Math.exp(-dt*20));
  state.progress=world.route.nearest(player.x,player.z).s;
  target=findTarget();
  const ahead=support(player.x-Math.sin(yaw)*4,player.z-Math.cos(yaw)*4);
  let targetPitch=clamp(Math.atan2(ahead-(grounded-1.72),4)*.45,-.16,.16);
  if(target){const delta=eyeOf(target).sub(player);targetPitch=clamp(Math.atan2(delta.y,Math.hypot(delta.x,delta.z)),-.95,.38);}
  if (patrol.lookAt && !turn) {
    const delta = patrol.lookAt.clone().sub(player);
    yaw += angle(Math.atan2(-delta.x, -delta.z) - yaw) * (1 - Math.exp(-dt * 3));
    targetPitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
  }
  pitch=THREE.MathUtils.lerp(pitch,targetPitch,1-Math.exp(-dt*9));
  camera.position.copy(player);camera.position.y+=moving?Math.sin(state.steps*3.4)*.025:Math.sin(clock*1.4)*.008;
  camera.rotation.set(pitch+state.recoil*.12+Math.sin(clock*57)*state.blastShake*.035,yaw+Math.sin(clock*43)*state.blastShake*.025,Math.sin(state.steps*1.7)*(moving?.0015:0),'YXZ');
  actors.gun.visible=state.weapon==='machinegun';actors.flamer.gun.visible=state.weapon==='flame';actors.shotgun.visible=state.weapon==='shotgun';
  gun=state.weapon==='shotgun'?actors.shotgun:state.weapon==='flame'?actors.flamer.gun:actors.gun;
  const reloadPhase=state.reload>0?Math.sin((1-state.reload/1.8)*Math.PI):0;
  gun.position.set(.24-reloadPhase*.1+Math.sin(state.steps*1.7)*(moving?.012:.002),-.31+reloadPhase*.12+Math.abs(Math.sin(state.steps*1.7))*(moving?.012:0),-.76-reloadPhase*.15+state.recoil);
  gun.rotation.set(state.recoil*.9-reloadPhase*.12,.16+reloadPhase*.85-turn*.025,-.025-reloadPhase*.22);
  actors.update({mag:state.mag,recoil:state.recoil,reload:state.reload,time:state.time,grenadeCooldown:state.grenadeCooldown});
  const space=keys.has('Space');
  const firing=space&&patrol.weaponsFree;
  if(firing&&state.weapon==='machinegun')shoot();
  if(firing&&state.weapon==='shotgun')fireShotgun();
  const burning=firing&&state.weapon==='flame'&&state.fuel>0;
  if(burning)state.fuel=Math.max(0,state.fuel-dt*10);
  actors.flamer.gun.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const flameOrigin=actors.flamer.muzzle.getWorldPosition(new THREE.Vector3()).applyQuaternion(camera.quaternion).add(camera.position),flameDirection=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  flameSystem.update(dt,burning,flameOrigin,flameDirection);
  if(patrol.weaponsFree&&keys.has('KeyG'))launchGrenade();
}
function updatePickups(dt){for(const p of pickups){if(p.taken)continue;p.mesh.rotation.y+=dt*.65;p.mesh.position.y=world.terrain.heightAt(p.mesh.position.x,p.mesh.position.z)+Math.sin(clock*2+p.at)*.06+.1;p.light.position.copy(p.mesh.position);p.light.position.y+=.8;
  if(Math.hypot(player.x-p.mesh.position.x,player.z-p.mesh.position.z)>1.8||Math.abs(player.y-1.72-p.mesh.position.y)>1.2)continue;
  if(p.kind==='health'){if(state.hp>=100)continue;state.hp=Math.min(100,state.hp+45);toast('+45 HEALTH · MEDICAL SUPPLY');}else if(p.kind==='fuel'){if(state.fuel>=200)continue;state.fuel=Math.min(200,state.fuel+80);toast('+80 FUEL · FLAMETHROWER CANISTER');}else if(p.kind==='grenade'){if(state.grenades>=18)continue;state.grenades=Math.min(18,state.grenades+3);toast('+3 GRENADES · LAUNCHER AMMUNITION');}else{if(state.reserve>=900&&state.spareShells>=80)continue;state.spareShells=Math.min(80,state.spareShells+24);state.reserve=Math.min(900,state.reserve+180);toast('+180 ROUNDS / +24 SHELLS');}
  p.taken=true;p.mesh.visible=false;p.light.intensity=0;sounds.pickup();}}
function updateHud(){
  $('grenades').textContent=String(state.grenades).padStart(2,'0');$('grenadeReady').textContent=state.grenadeCooldown>0?'CYCLING…':'G · IMPACT GRENADE';$('blastFlash').style.opacity=state.blastShake*.25;
  $('fuel').textContent=Math.ceil(state.fuel);$('weaponLabel').textContent=state.weapon==='flame'?'F–9 / FLAMETHROWER':'M–41 / MACHINE GUN';$('weaponStatus').textContent=state.weapon==='flame'?'13 M FLAME · F TO SWITCH':'11 ROUNDS / SEC · F TO SWITCH';$('slime').style.opacity=state.slime*.7;
  $('health').textContent=Math.ceil(state.hp);$('healthBar').style.width=state.hp+'%';$('healthBar').style.background=state.hp<30?'#ff6155':'#91ddd6';$('status').textContent=state.hp<30?'CRITICAL':state.hp<60?'WOUNDED':'STABLE';$('mag').textContent=state.weapon==='flame'?Math.ceil(state.fuel):String(state.mag).padStart(2,'0');$('reserve').textContent=state.weapon==='flame'?200:state.reserve;$('kills').textContent=`${state.kills} / ${totalEnemies} HOSTILES`;
  $('progress').style.width=(state.progress/world.route.length*100)+'%';$('distance').textContent=`${Math.max(0,Math.ceil(world.route.length-state.progress))} M TO ${chapter==="defense" ? "SHELTER" : chapter==="repeater" ? "HATCH" : plains ? "FIELD STATION" : "FREIGHT LIFT"}`;
  const bearing=((Math.round(-yaw*180/Math.PI)%360)+360)%360;const directions=['N','NE','E','SE','S','SW','W','NW'];document.querySelectorAll('#compass span').forEach((el,i)=>{el.textContent=directions[(Math.round(bearing/45)+[-2,-1,1,2][i]+8)%8];});$('heading').textContent=`${['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing/45)%8]} · ${String(bearing).padStart(3,'0')}°`;
  $('damage').style.opacity=Math.max(state.damage*.8,state.hp<30?.14:0);$('hitmarker').style.opacity=state.hit>0?1:0;$('target').style.opacity=target&&target.hp>0?1:0;if(target){$('targetHp').style.width=(target.hp/target.maxHp*100)+'%';$('targetName').textContent=target.name.toUpperCase();}
  $('reloadNotice').textContent=state.weapon==='flame'?(state.fuel<=0?'NO FUEL · FIND AN ORANGE CANISTER':''):state.reload>0?'RELOADING…':state.mag===0?'R · RELOAD':state.mag<12?'LOW MAGAZINE · R TO RELOAD':'';
  if(state.weapon==='shotgun'){
    $('weaponLabel').textContent='PUMP SHOTGUN';$('weaponStatus').textContent='12 PELLETS · 3 TO EQUIP';$('mag').textContent=state.shells;$('reserve').textContent=state.spareShells;
    $('reloadNotice').textContent=state.reload?'RELOADING…':!state.shells?'R · RELOAD SHOTGUN':'';
  }
  if(state.toast<=0)$('toast').textContent='';
  $('objective').textContent=patrol.objective;
}
function updateSun(){
  const point=camera.position.clone().addScaledVector(world.sunDirection,150),screen=point.clone().project(camera),facing=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).dot(world.sunDirection),visible=facing>.25&&world.clearLine(camera.position,point,0);
  $('sunGlare').style.opacity=visible?Math.pow(Math.max(0,facing),5)*.85:0;$('sunGlare').style.setProperty('--sun-x',`${(screen.x*.5+.5)*100}%`);$('sunGlare').style.setProperty('--sun-y',`${(-screen.y*.5+.5)*100}%`);
}
function step(dt){
  clock+=dt;
  if(state.mode==='playing'){
    state.time+=dt;state.slime=Math.max(0,state.slime-dt*.5);state.grenadeCooldown=Math.max(0,state.grenadeCooldown-dt);state.blastShake=Math.max(0,state.blastShake-dt*2.5);state.shot=Math.max(0,state.shot-dt);state.recoil*=Math.exp(-dt*15);state.damage=Math.max(0,state.damage-dt*.85);state.hit=Math.max(0,state.hit-dt);state.toast-=dt;
    if(state.reload>0){state.reload-=dt;if(state.reload<=0){state.reload=0;if(state.weapon==='shotgun'){const count=Math.min(8-state.shells,state.spareShells);state.shells+=count;state.spareShells-=count;}else{const count=Math.min(60-state.mag,state.reserve);state.mag+=count;state.reserve-=count;}}}
    flash.visible=state.shot>.055;flashLight.intensity=flash.visible?4:0;
    const cinematic = patrol.controlMode === 'static';
    if (cinematic) keys.clear();
    updatePlayer(dt);
    const previousPhase = patrol.phase;
    patrol.update(dt,keys);
    if(patrol.cinematicEye){camera.position.copy(patrol.cinematicEye);camera.lookAt(patrol.lookAt);}
    if(previousPhase!==patrol.phase && ['chase','approach'].includes(patrol.phase))saveApproach(patrol.phase);
    const nowStatic = patrol.controlMode === 'static';
    document.body.classList.toggle('patrol-cutscene', nowStatic);
    $('skipShot').hidden=patrol.phase!=='flyby';
    if (cinematic && !nowStatic) restorePlayerCamera();
    if (!nowStatic) {
      grenadeSystem.update(dt);
      updateEnemies(dt);
      if (state.mode === 'playing') updatePickups(dt);
    }
    fx.update(dt,world.terrain);
    if(patrol.phase==='complete'){
      if(chapter==='defense'){
        state.mode='won';keys.clear();music.pause(true);
        try{localStorage.setItem('canyon-patrol-completed','1');}catch{}
        panel('EVACUATION SECURE','PERIMETER<br><em>HELD</em>','Twelve survivors aboard the Kestrel. Pike and Ellis are in the flight log.','REPLAY PATROL');
      }else nextChapter(chapter==='repeater'?'cable':plains?'drive':'flats');
    }
  }
  world.update(player,dt,clock);updateHud();
}
function render(){flashLight.position.copy(muzzle.getWorldPosition(new THREE.Vector3()));flashLight.intensity=state.weapon==='machinegun'&&flash.visible?4:0;camera.updateMatrixWorld(true);updateSun();renderer.autoClear=true;renderer.render(scene,camera);renderer.autoClear=false;renderer.clearDepth();if(patrol.controlMode !== 'static')renderer.render(weaponScene,weaponCamera);renderer.autoClear=true;}
function frame(time){requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(time-lastTime)/1000));lastTime=time;if(!world||!actors)return;step(dt);render();}

async function main(){
  const response=await fetch(new URL(plains?(chapter==='flats'?'./plains.json':'./'+chapter+'.json'):'./level.json',import.meta.url));
  if(!response.ok)throw new Error('Patrol level could not load');
  level=await response.json();
  [world,actors]=await Promise.all([plains?createPlainsWorld(scene,level):createWorld(scene,level,weaponScene.environment),loadActors(weaponScene.environment)]);
  if(plains)scene.environment=weaponScene.environment;
  if(!plains){
    world.route=createRoute(level.path.slice(0,level.patrolPathPoints));
    lift=freightLift(scene,world);
  }
  const shotgunAsset=await new GLTFLoader().loadAsync('/games-3d/static/cityescape/assets/weapons/shotgun.glb');
  const model=shotgunAsset.scene;model.rotation.y=Math.PI;model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),scale=1.15/bounds.getSize(new THREE.Vector3()).z;
  model.scale.setScalar(scale);model.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
  actors.shotgun=new THREE.Group();actors.shotgun.add(model);actors.shotgun.visible=false;weaponScene.add(actors.shotgun);
  const existingRoots=params.has('review')?new Set(scene.children):null;
  fx=createEffects(scene);flameSystem=createFlame({scene,world,enemies,player,damageEnemy,sounds});grenadeSystem=createGrenades({scene,world,enemies,player,damageEnemy,hurt,sounds,fx,onExplosion(){state.explosions++;state.blastShake=.8;}});gun=actors.gun;muzzle=actors.muzzle;gun.scale.setScalar(.7);weaponScene.add(gun);actors.flamer.gun.scale.setScalar(.7);actors.flamer.gun.visible=false;weaponScene.add(actors.flamer.gun);
  const effectRoots=existingRoots?scene.children.filter(node=>!existingRoots.has(node)):[];
  flash=new THREE.Sprite(new THREE.SpriteMaterial({map:world.glow,color:0xffdc74,transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false}));flash.scale.set(.65,.4,1);flash.visible=false;muzzle.add(flash);flashLight=new THREE.PointLight(0xffbc4f,0,3);weaponScene.add(flashLight);
  const packs = {};
  for (const [name, types] of Object.entries(level.packs)) {
    packs[name] = types.map((type, i) => {
      const enemy = actors.spawnEnemy(type, enemies.length);
      enemy.lateral = i % 2 === 0 ? -3 : 3;
      const p = world.route.at(level.stops[name] + 16 + i * 2, enemy.lateral);
      enemy.root.position.set(p.x, world.terrain.heightAt(p.x, p.z), p.z);
      enemy.root.visible = false;
      scene.add(enemy.root);
      enemies.push(enemy);
      return enemy;
    });
  }
  totalEnemies=enemies.length;
  patrol=await createPatrol({scene,world,packs,stops:level.stops,player,state,fx,sounds,damageEnemy,lift});
  pickups=level.pickups.map(p=>{const pos=p.x!==undefined?p:world.route.at(p.at,p.offset ?? (p.kind==='ammo'?-2.2:0)),mesh=makePickup(p.kind);mesh.name=p.kind+' pickup';mesh.position.set(pos.x,world.terrain.heightAt(pos.x,pos.z),pos.z);scene.add(mesh);const light=mesh.children.find(n=>n.isPointLight);scene.attach(light);return {...p,mesh,light,taken:false};});
  const spawn=world.route.at(world.core?29:2);player.set(spawn.x,world.terrain.heightAt(spawn.x,spawn.z)+1.72,spawn.z);yaw=world.route.at(6).yaw+(world.core?Math.PI:0);camera.position.copy(player);camera.rotation.y=yaw;gun.position.set(.24,-.31,-.76);
  if(plains){
    document.title='Canyon Patrol · The Silent Flats';
    $('sectorNumber').textContent='02';$('sectorName').textContent='THE SILENT FLATS';
    $('missionNumber').textContent='MISSION / 002';$('missionTitle').textContent='Reach the field station';
    $('panelTitle').textContent='THE SILENT FLATS';$('panelText').textContent='Walk the open plain with Vale. Follow the Kestrel to the survey station.';
    $('brief').querySelector('p').textContent='E interacts with the radio and rover.';
    if(level.title){
      document.title='Canyon Patrol · '+level.title;
      $('sectorNumber').textContent=level.number;$('sectorName').textContent=level.title.toUpperCase();
      $('missionNumber').textContent='MISSION / 0'+level.number;$('missionTitle').textContent=level.objective;
      $('panelTitle').textContent=level.title.toUpperCase();$('panelText').textContent=level.brief;
      $('brief').querySelector('p').textContent=level.controls;
    }
    try {
      const entry=JSON.parse(sessionStorage.getItem('patrol-entry-'+(chapter==='repeater'?'drive':chapter)));
      if(entry){Object.assign(state,entry);sounds.setMuted(state.muted);music.setMuted(state.muted);}
    }catch{}
  }
  $('loadStatus').textContent='PREPARING EQUIPMENT & EFFECTS…';
  // Cover the startup-only draws, including enemies that have not spawned yet.
  $('overlay').style.background='#101419';
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const warmupObjects=new THREE.Group();warmupObjects.name='ShaderWarmup';warmupObjects.visible=false;
  warmupObjects.position.copy(player);warmupObjects.position.z-=4;
  for(const preset of actors.presets){if(!enemies.some(enemy=>enemy.type===preset.type))continue;warmupObjects.add(actors.spawnEnemy(preset.type,0).root);}
  for(const system of [fx,grenadeSystem,flameSystem])if(system?.warmup)warmupObjects.add(system.warmup);
  scene.add(warmupObjects);
  // Keep the hidden samples alive so transient effect shaders remain cached.
  const warmup=await warmupRenderer(renderer,[{scene,camera},{scene:weaponScene,camera:weaponCamera}]);
  render();$('overlay').style.background='';
  state.mode='ready';$('loadStatus').textContent='HEADPHONES RECOMMENDED · KEYBOARD ONLY';$('primary').textContent='JOIN THE PATROL';$('primary').disabled=false;
  if(!chapter){
    try{if(localStorage.getItem('canyon-patrol-completed')==='1')$('primary').textContent='REPLAY PATROL';}catch{}
  }
  window.__canyonPatrol={patrol,warmup,state,player,camera,world,enemies,pickups,level,keys,actors,sounds,music,grenadeSystem,flameSystem,get yaw(){return yaw;},get target(){return target;},get stats(){return renderer.info.render;}};
  // Review-only hooks use the same simulation, damage, weapon and input paths as live play.
  if(params.has('review'))Object.assign(window.__canyonPatrol,{step,start,hurt,render,damageEnemy,deathEffects:fx.deaths,setYaw(value){yaw=value;},teleport(s,offset=0){const p=world.route.at(s,offset);player.set(p.x,world.terrain.heightAt(p.x,p.z)+1.72,p.z);yaw=p.yaw;},setPaused:setPause});
  if(params.has('review'))window.__narrativeMeshReview={
    scene, camera, renderer, terrain:world.terrain, walkable:world.walkable,
    assemblies:world.turret?[[world.turret.base,world.turret.pivot]]:[],
    exclude:[world.sky, ...(world.skyRoots||[]), ...effectRoots, warmupObjects, ...enemies.map(e=>e.root), ...patrol.squad.map(member=>member.root)]
  };
  if(plains && document.referrer.startsWith(location.origin+'/games-3d/canyon-patrol') && !performance.getEntriesByType('navigation').some(n=>n.type==='reload')) start();
  requestAnimationFrame(frame);
}
main().catch(error=>{console.error(error);state.mode='error';$('panelTitle').innerHTML='DROP<br><em>FAILED</em>';$('panelText').textContent=error.message;$('loadStatus').textContent='Check the server and connection, then reload.';$('primary').textContent='RETRY';$('primary').disabled=false;$('primary').onclick=()=>location.reload();});
