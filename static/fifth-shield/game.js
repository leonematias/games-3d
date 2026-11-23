import * as T from 'three';
import R from '../box-physics/vendor/rapier.mjs';
import {createBattleSounds} from '../eagle-ford/battle-sounds.js';
import {createGameMusic} from '../music/music-player.js';
import {createSounds} from '../medieval/sounds.js';
import {weapons} from '../eagle-ford/weapons.js';
import {Campaign,distance} from './campaign.js';
import {loadLand,buildLand,height} from './land.js';
import {loadCast,buildCast} from './cast.js';
import {moments,chapterNames,dialogue,sections,sectionX,saveKey,wallZ} from './story.js';

const $=id=>document.getElementById(id);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(47,1,.08,650);
const renderer=new T.WebGLRenderer({canvas:$('field'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
resize();addEventListener('resize',resize);
const keys=new Set(),sounds=createBattleSounds(),siegeSound=createSounds();
let music,land,cast,b=new Campaign(),mode='loading',muted=false,voice=null,captionTime=0,noticeTime=0,wound=0,clock=0;
let checkpoint=readCheckpoint(),hudTime=0,armySound=0,musterTime=0;
function readCheckpoint(){
  try{const s=JSON.parse(localStorage.getItem(saveKey));
    return s&&Number.isInteger(s.index)&&moments[s.index]&&s.hero?.hp>0&&Array.isArray(s.allies)&&s.hits?.length===3?s:null;
  }catch{return null;}
}
function save(){checkpoint=b.snapshot();try{localStorage.setItem(saveKey,JSON.stringify(checkpoint));}catch{}}
function clearVoice(){if(voice){voice.onended=null;voice.pause();voice=null;}captionTime=0;$('caption').hidden=true;}
function say(id){
  clearVoice();if(!id)return;
  const [name,line]=dialogue[id],cap=$('caption');
  cap.querySelector('b').textContent=name;cap.querySelector('span').textContent=line;cap.hidden=false;
  const clip=new Audio('/games-3d/static/fifth-shield/audio/'+id+'.mp3');voice=clip;clip.volume=.87;clip.muted=muted;
  captionTime=Math.max(3.4,line.split(' ').length*.39);
  clip.onended=()=>{if(voice===clip)clearVoice();};
  clip.play().catch(()=>{});
}
function notice(text){$('notice').textContent=text;noticeTime=3;}
function setupMoment(){
  const m=b.moment;
  if(m.kind==='film'||document.body.classList.contains('film'))keys.clear();
  document.body.classList.toggle('film',m.kind==='film');$('hud').hidden=m.kind==='film'||mode!=='play';
  $('filmTitle').hidden=m.kind!=='film';$('filmName').textContent=m.title;
  $('filmLabel').textContent=m.id==='march'?'The south curtain':'Beyond the ridge';
  say(m.line);
  if(m.kind==='film')sounds.cue('horn');
  if(m.kind==='end'){
    mode='won';music.win();try{localStorage.removeItem(saveKey);localStorage.setItem('fifth-shield-muster','1');}catch{}
    panel('Muster at Vella','Five at muster','The eagle is inside the walls. When the roll is called, you answer with Cassian, Felix, Sabina, and Titus at your side.','March again');
    $('caption').hidden=true;
  }
  hudTime=0;
}
function panel(label,title,brief,button){
  keys.clear();document.body.classList.remove('film');document.body.classList.add('briefing');
  $('hud').hidden=true;$('filmTitle').hidden=true;$('pause').hidden=true;$('controls').hidden=mode==='won'||mode==='lost';
  $('label').textContent=label;$('title').textContent=title;$('brief').textContent=brief;$('start').textContent=button;
  $('panel').hidden=false;$('restart').hidden=true;
}
function start(fresh=false){
  if(mode==='pause'){resume();return;}
  if(mode==='won'||fresh){
    try{localStorage.removeItem(saveKey);}catch{}location.reload();return;
  }
  b=new Campaign(checkpoint);
  for(const [lane,n] of b.hits.entries())if(n)land.damage(lane,n,false);
  mode='play';$('panel').hidden=true;$('pause').hidden=false;document.body.classList.remove('briefing');
  music=createGameMusic({track:'eagle-ford/under-the-eagle',volume:.16,context:music?.music.context});
  music.setMuted(muted);music.start();sounds.start(music.music.context).catch(console.warn);siegeSound.unlock();save();
  setupMoment();cameraShot(1,true);
}
function pause(){
  if(mode!=='play')return;mode='pause';voice?.pause();$('caption').hidden=true;music.pause(true);sounds.reset();
  panel('Campaign paused',chapterNames[b.moment.chapter],'Your last objective is saved. Resume to return to the field.','Resume march');
}
function resume(){
  mode='play';document.body.classList.remove('briefing');document.body.classList.toggle('film',b.moment.kind==='film');
  $('panel').hidden=true;$('hud').hidden=b.moment.kind==='film';$('filmTitle').hidden=b.moment.kind!=='film';$('pause').hidden=false;
  if(voice){$('caption').hidden=false;voice.play().catch(()=>{});}music.pause(false);
}
$('start').onclick=()=>start();$('restart').onclick=()=>start(true);$('pause').onclick=pause;
$('mute').onclick=()=>{muted=!muted;sounds.mute(muted);music?.setMuted(muted);if(siegeSound.muted!==muted)siegeSound.toggleMute();if(voice)voice.muted=muted;
  $('mute').textContent=muted?'Sound off':'Sound on';$('mute').setAttribute('aria-pressed',String(muted));};
addEventListener('blur',pause);
const keyOf=e=>e.key.length===1?e.key.toLowerCase():e.key;
addEventListener('keydown',e=>{
  const k=keyOf(e);if(k==='Escape'&&!e.repeat){if(mode==='pause')resume();else pause();return;}
  if(mode!=='play')return;
  if([' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Shift','e'].includes(k))e.preventDefault();
  if(b.moment.kind==='film')return;
  keys.add(k);if(e.repeat)return;
  if(k==='e')b.interact();
  if(b.mounted){
    if(k==='ArrowLeft')b.adjustAim(-1);
    if(k==='ArrowRight')b.adjustAim(1);
    if(k===' ')b.fire();
  }else if(/^[1-3]$/.test(k))b.equip(Number(k)-1);
});
addEventListener('keyup',e=>keys.delete(keyOf(e)));
function events(){
  for(const e of b.events.splice(0)){
    if(e.type==='moment')setupMoment();
    else if(e.type==='save'&&b.moment.kind!=='end')save();
    else if(e.type==='sound')sounds.cue(e.cue,b.weapon);
    else if(e.type==='hit'){
      sounds.hit(e,b.hero,Math.PI);if(e.hurt)wound=.77;
    }else if(e.type==='notice')notice(e.text);
    else if(e.type==='launch')siegeSound.crossbow();
    else if(e.type==='impact'){
      land.damage(e.lane,e.count);siegeSound.crumble(e.count===5?1.5:.5);
      if(e.count<5)notice(sections[e.lane]+' section · '+e.count+' of 5 impacts');
    }
  }
}
let rosterSize=-1;
function hud(){
  const m=b.moment,t=b.target(),unit=[b.hero,...b.allies];
  $('chapter').textContent='Chapter '+['I','II','III','IV','V'][m.chapter]+'   /   '+chapterNames[m.chapter];
  $('objective').textContent=m.title;
  let hint='';
  if(b.treatment)hint='The doctor is treating your unit…';
  else if(m.kind==='fight'&&b.activeFight)hint=b.enemies.filter(e=>e.hp>0).length+' enemies remaining · Space to strike · Shift to guard';
  else if(m.kind==='siege'){
    hint=b.shot?'Stone in flight':b.mounted?sections[b.aim]+' section · '+b.hits[b.aim]+'/5 hits · ← / → aim · Space fire':b.carried?'Carry the stone back to the catapult':'Fetch a stone from the sled';
    if(!b.mounted&&!b.shot)hint+=' · '+Math.round(distance(b.hero,t))+' m';
  }else if(t&&Number.isFinite(t.x)){
    const dx=t.x-b.hero.x,dz=t.z-b.hero.z;
    const dir=Math.abs(dx)>Math.abs(dz)?(dx>0?'east':'west'):(dz>0?'south':'north');
    hint='Gold marker · '+Math.round(distance(b.hero,t))+' m '+dir;
  }
  $('detail').textContent=hint;
  if(unit.length!==rosterSize){
    $('members').replaceChildren(...unit.map(a=>{
      const el=document.createElement('div');el.className='person';el.textContent=a.name;
      const bar=document.createElement('span');bar.className='bar';bar.append(document.createElement('i'));el.append(bar);return el;
    }));rosterSize=unit.length;
  }
  unit.forEach((a,i)=>{const el=$('members').children[i];el.querySelector('i').style.width=a.hp+'%';el.title=a.name+' · Health '+Math.ceil(a.hp)+'/100';});
  $('unitTitle').textContent='Unit strength · '+unit.filter(a=>a.hp>0).length+' / '+unit.length;
  $('gear').textContent=b.carried?'Carrying a sling stone':b.weapon?weapons[b.weapon].name+(b.upgraded?' · 1 Gladius / 2 Spear / 3 Long sword':' · Scutum'):'Empty hand · Scutum';
  const act=b.interaction();$('prompt').hidden=!act;$('prompt').textContent=act?'E   ·   '+act:'';
}
const eye=new T.Vector3(),look=new T.Vector3(),focus=new T.Vector3();
function cameraShot(dt,snap=false){
  const h=b.hero,m=b.moment,p=b.filmTime;
  if(mode==='ready'||mode==='loading'){
    eye.set(2.7,height(0,113)+1.62,116.1);look.set(-1.5,height(0,113)+.93,112.8);
  }else if(m.id==='reveal'){
    eye.set(11-p*.9,9+p*.35,28-p*2.15);look.set(0,2.6,-7-p*.45);
  }else if(m.id==='march'||m.id==='won'){
    const x=sectionX[b.breachLane];
    if(musterTime||m.id==='won'){eye.set(x-4.8,2.35,wallZ-18.2);look.set(x-2.4,1.25,wallZ-12.3);}
    else if(p<2&&m.id!=='won'){eye.set(x+6,3.1,wallZ+8);look.set(x,2.25,wallZ);}
    else if(p<6.5&&m.id!=='won'){eye.set(x+7.2,4.5,wallZ+7-p*.45);look.set(x,1.15,wallZ+3);}
    else{eye.set(x-6.4,4.25,wallZ-10);look.set(x+.4,1.5,wallZ-1.1-Math.max(0,p-7)*.32);}
  }else if(b.mounted||b.shot){eye.set(2.7,4.4,13.6);look.set(sectionX[b.aim]*.75,2.6,wallZ);}
  else{const y=height(h.x,h.z);eye.set(h.x+.25,Math.max(y+3.35,height(h.x,h.z+5.8)+1.25),h.z+5.8);look.set(h.x,y+1.13,h.z-2.3);}
  const ease=snap?1:1-Math.exp(-dt*(m.kind==='film'?4:7));
  camera.position.lerp(eye,ease);focus.lerp(look,ease);camera.lookAt(focus);
}
async function init(){
  const [assets,templates]=await Promise.all([loadLand(),loadCast(),R.init()]);
  land=buildLand(scene,assets);cast=buildCast(scene,templates);
  mode='ready';cameraShot(1,true);cast.update(b,0,land,true);land.update(b,0);
  $('start').disabled=false;$('start').textContent=checkpoint?'Continue the march':'Begin the march';
  if(checkpoint){
    $('restart').hidden=false;$('brief').textContent='Continue from '+chapterNames[moments[checkpoint.index].chapter]+'. '+moments[checkpoint.index].title+'.';
  }
  let last=performance.now(),slow=0;
  renderer.setAnimationLoop(now=>{
    const frame=(now-last)/1000;last=now;
    const dt=Math.max(0,Math.min(.14,frame));if(mode==='pause')return;
    if(++clock%12===0&&mode==='play'){
      slow=frame>.058?slow+1:Math.max(0,slow-1);
      if(slow>=2&&renderer.getPixelRatio()>.72){renderer.setPixelRatio(Math.max(.72,renderer.getPixelRatio()*.84));resize();slow=0;}
    }
    if(mode==='play'){
      let left=dt;while(left>.00001){const step=Math.min(left,1/30);b.tick(step,keys);events();left-=step;}
      if(b.lost){mode='lost';clearVoice();music.lose();panel('Fallen on the road','Hold the line','Your last checkpoint is ready. Use your shield when an enemy draws back to strike.','Retry checkpoint');}
      if(b.index>=12&&b.index<=16&&(armySound-=dt)<=0){armySound=1.2;sounds.hit({x:b.hero.x+7,z:b.hero.z-12,local:false,weapon:'sword'},b.hero,Math.PI);}
      if(noticeTime>0&&(noticeTime-=dt)<=0)$('notice').textContent='';
      if(voice&&(voice.error||voice.paused)&&(captionTime-=dt)<=0)clearVoice();
      hudTime-=dt;if(hudTime<=0){hud();hudTime=.09;}
    }
    if(mode!=='ready'||clock%2===0){
      land.update(b,dt);cast.update(b,dt,land,mode==='ready');cameraShot(dt);
      if(b.moment.id==='march'&&b.filmTime>3.5&&!musterTime)$('filmTitle').hidden=true;
      if(mode==='play'&&b.moment.id==='march'&&b.filmTime>8&&cast.remaining===0){
        if(!musterTime){say('home');$('filmTitle').hidden=false;$('filmName').textContent='Five at muster';$('filmLabel').textContent='Inside Vella';}
        musterTime+=dt;
        if(musterTime>4.5&&!voice){b.advance();events();}
      }
      wound=Math.max(0,wound-dt*2);$('wound').style.opacity=wound;
      renderer.render(scene,camera);
    }
  });
  window.__fifthShield={get campaign(){return b;},get mode(){return mode;},get outside(){return cast.remaining;},
    get masonry(){return land.panels.map(p=>p.fracture?.cells.filter(c=>!c.solid).length||0);}};
}
init().catch(e=>{console.error(e);$('brief').textContent='The campaign could not load. Reload to try again.';});
