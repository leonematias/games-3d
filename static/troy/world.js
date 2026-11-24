import * as T from 'three';
import {viewport,mountainRing,sky,mesh,box,rod,surface,shadow,random,V,clamp,library,actor,chase} from '../field-narratives/landscape.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {loadTemplate} from '../medieval/rig.js';
import {createPresetRanks} from '../eagle-ford/preset-ranks.js';
import {sites,current,guardPosition,arrowTiming} from './story.js';
import {woodenHorse,galley,horseInterior,planks} from './carpentry.js';

import {land,plain,seaSurface,citadel,dressField,pitchedRoof,batchScenery,tileTexture} from './landscape.js';
import {formations} from './formations.js';

const rng=random(9004),tan=surface('#c3aa82'),red=surface('#953e35'),blue=surface('#285f6c'),bronze=surface('#a88146',{metalness:.35}),cream=surface('#e3ceb1');
function floor(x,z){
 if(z>95&&Math.abs(x)<2)return z>=104?1.73:.1+(z-95)*.181;
 return land(x,z);
}
const standards=new Map();
function flag(group,x,y,z,mat){
 rod(group,planks[1],[x,y,z],[x,y+4.3,z],.065);
 mesh(group,new T.ConeGeometry(.10,.37,8),bronze,x,y+4.43,z);
 if(!standards.has(mat)){
   const c=document.createElement('canvas');c.width=192;c.height=128;
   const ctx=c.getContext('2d');ctx.fillStyle='#'+mat.color.getHexString();ctx.fillRect(0,0,192,128);
   ctx.fillStyle='#d8b16d';ctx.fillRect(0,7,192,4);ctx.fillRect(0,117,192,4);
   ctx.strokeStyle='#edd3a0';ctx.lineWidth=6;ctx.beginPath();ctx.arc(88,64,26,0,Math.PI*2);ctx.stroke();
   for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(88+32*Math.cos(a),64+32*Math.sin(a));ctx.lineTo(88+39*Math.cos(a),64+39*Math.sin(a));ctx.stroke();}
   const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;standards.set(mat,surface('#ffffff',{map,side:T.DoubleSide}));
 }
 const cloth=new T.PlaneGeometry(1.65,1.08,8,3),p=cloth.attributes.position;
 for(let i=0;i<p.count;i++){const u=p.getX(i)+.825;p.setXYZ(i,u,p.getY(i)-u*.12,Math.sin(u*5.5)*u*.16);}
 cloth.computeVertexNormals();mesh(group,cloth,standards.get(mat),x,y+3.47,z);
}
function city(scene){
 const fixed=new T.Group();scene.add(fixed);
 const blocks=tileTexture('stone2.png');blocks.repeat.set(1.35,1.15);
 const stone=surface('#e2c299',{map:blocks,bumpMap:blocks,bumpScale:.14}),base=land(0,0);
 const plaster=surface('#c39c6e',{map:tileTexture('painted_plaster_clean')});
 const roofTile=surface('#ac6446',{map:tileTexture('glazed_terracotta_plain')});
 const rubble=tileTexture('stone3.png',1.6);
 const foundation=surface('#c9af8e',{map:rubble,bumpMap:rubble,bumpScale:.12});
 for(const side of [-1,1]){
  for(let i=0;i<8;i++){
   const x=side*(8.2+i*7.8);box(fixed,stone,x,base+3.6,0,7.85,7.2,3.4);
   const foot=mesh(fixed,new T.CylinderGeometry(1,1.27,3.6,4,1,false,Math.PI/4),foundation,x,base+1.7,.6);
   foot.scale.set(5.54,1,3.35);
   box(fixed,planks[0],x,base+6.65,.03,7.86,.2,3.65);
   for(const dx of [-2.8,0,2.8])box(fixed,tan,x+dx,base+7.6,0,1.3,1,3.15);
  }
  const x=side*6.3;box(fixed,stone,x,base+5,0,4.7,10,5.4);
  box(fixed,tan,x,base+10.15,0,5.15,.45,5.72);
  const low=mesh(fixed,new T.CylinderGeometry(1,1.32,5,4,1,false,Math.PI/4),foundation,x,base+2.4,0);low.scale.set(3.55,1,4.15);
  for(const h of [5.5,9.35])box(fixed,planks[1],x,base+h,.06,4.94,.19,5.62);
  for(const dx of [-1.3,0,1.3])box(fixed,planks[0],x+dx,base+8.3,2.713,.24,1.1,.07);
  box(fixed,red,x,base+6.65,2.84,1.43,2.9,.07);
  const emblem=mesh(fixed,new T.CylinderGeometry(.4,.4,.08,12),bronze,x,base+6.85,2.91);emblem.rotation.x=Math.PI/2;
  for(const dx of [-1.6,0,1.6])box(fixed,stone,x+dx,base+10.84,2.05,.95,.94,1.2);
  flag(fixed,x,base+10.4,.6,red);
 }
 box(fixed,foundation,0,base+10.60,0,8.7,1.15,2.25);
 box(fixed,planks[0],0,base+11.25,0,9.2,.27,2.65);
 for(const x of [-2.8,-1.4,0,1.4,2.8])box(fixed,tan,x,base+11.68,0,.77,.62,1.65);
 const doors=[];
 for(const side of [-1,1]){
  const hinge=new T.Group();hinge.position.set(side*4.06,base,.4);scene.add(hinge);
  for(let i=0;i<7;i++)box(hinge,planks[i%4],-side*(i+.5)*.58,4.96,0,.57,9.92,.3);
  for(const h of [1.1,4.1,8.3])box(hinge,bronze,-side*2.04,h,-.2,4,.18,.12);
  doors.push(hinge);
 }
 const bar=box(scene,planks[0],0,base+1.48,-.18,8.5,.37,.37);
 for(let i=0;i<52;i++){
  const side=i%2?1:-1,streetX=side*(17+(i%5)*8+rng()*5),z=-8-Math.floor(i/5)*5.2-rng()*2;
  // Leave an open court for the horse, the ladder and the watch's patrol.
  const x=streetX>0&&Math.abs(z-sites.courtyard[1])<8?streetX+13:streetX;
  const h=2.6+rng()*2.2,w=4+rng()*2.3,d=3+rng()*2;
  box(fixed,plaster,x,land(x,z)+h/2,z,w,h,d);box(fixed,planks[1],x,land(x,z)+h+.12,z,w+.35,.3,d+.35);
  if(i%3!==0)pitchedRoof(fixed,x,land(x,z)+h+.24,z,w+.68,.72+rng()*.6,d+.68,roofTile);
  box(fixed,planks[0],x+w*.31,land(x,z)+h*.64,z+d*.5+.03,.58,.68,.09);
  box(fixed,planks[0],x,land(x,z)+.95,z+d/2+.02,1.1,1.9,.08);
 }
 for(let i=0;i<6;i++){
  const z=-17-i*3.5;mesh(fixed,new T.CylinderGeometry(.36,.49,3.9,10),cream,11,land(11,z)+1.95,z);
 }
 box(fixed,tan,11,land(11,-24)+4.03,-25.6,1.1,.48,19.2);
 flag(fixed,...[sites.standardHill[0],land(...sites.standardHill),sites.standardHill[1]],blue);
 citadel(fixed);batchScenery(fixed);
 return {doors,bar,base};
}
function pose(rig,x,y,z,yaw,clip,dt){
 rig.model.position.set(x,y,z);rig.model.rotation.y=yaw;
 rig.play(rig.has(clip)?clip:'idle',{once:clip==='death',fade:.12});
 rig.update(dt);
}
function roundShield(model,color){
 const mount=model.getObjectByName('scutum');
 if(!mount)return;
 for(const child of [...mount.children])mount.remove(child);
 const face=mesh(mount,new T.CylinderGeometry(.46,.46,.065,28),surface(color),0,.08,0);
 const rim=mesh(face,new T.TorusGeometry(.444,.027,8,32),bronze,0,.04,0);rim.rotation.x=Math.PI/2;
 const boss=mesh(face,new T.SphereGeometry(.15,16,8),bronze,0,.05,0);boss.scale.y=.61;
 for(const side of [-1,1]){
   const stripe=box(face,bronze,side*.092,.044,-.027,.052,.025,.37);stripe.rotation.y=side*.56;
   box(face,planks[0],side*.17,-.048,.0,.064,.033,.68);
 }
 for(let i=0;i<12;i++){const a=i*Math.PI/6;mesh(face,new T.SphereGeometry(.021,6,4),bronze,Math.cos(a)*.36,.038,Math.sin(a)*.36);}
}
function finishRig(rig,color){
 roundShield(rig.model,color);
 rig.model.traverse(n=>{
  if(!n.isMesh||Array.isArray(n.material))return;
  if(/shirt|skirt|crest|gambeson/.test(n.name)){n.material=n.material.clone();n.material.color.set(color);}
  if(/armor_chest|helmet_visor|helmet_cap|chainmail|pauldron/.test(n.name)){n.material=n.material.clone();n.material.color.set('#b29258');}
 });
 return rig;
}
function equipParisBow(paris){
 const bow=new T.Group();rod(bow,planks[0],[0,-.44,0],[.1,0,.15],.036);rod(bow,planks[0],[.1,0,.15],[0,.44,0],.036);rod(bow,cream,[0,-.44,0],[0,.44,0],.009);
 paris.attach(bow,'leftHandTorch','bow');
}
export const castProfiles={
 achilles:{preset:'legionary',height:1.87,color:'#376672'},
 odysseus:{preset:'ford-roman-veteran',height:1.79,color:'#416a73'},
 hector:{preset:'legionary',height:1.9,color:'#a4473a'},
 paris:{preset:'medieval-archer',height:1.77},
};
export async function makeCastActor(id){
 const profile=castProfiles[id];
 const rig=await actor(profile.preset,profile.height);
 if(profile.color)finishRig(rig,profile.color);
 if(id==='paris')equipParisBow(rig);
 return rig;
}
export async function world(){
 const {renderer,scene,camera}=viewport();
 const canopy=sky(scene,'#729caf','#edcfa3',510);
 scene.fog=new T.FogExp2('#e6c9a4',.005);
 const sun=new T.DirectionalLight('#ffe0af',2.4);sun.position.set(-35,43,22);
 const fill=new T.HemisphereLight('#ffe9c6','#81705d',1.55);scene.add(sun,fill);
 plain(scene);
 mountainRing(scene,177,['#ac9272','#98866a','#8a8274','#a79a87'],-3,58,721);
 const drawSea=seaSurface(scene);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
 Object.assign(sun.shadow.camera,{left:-23,right:23,top:23,bottom:-23,near:1,far:110});sun.shadow.camera.updateProjectionMatrix();
 sun.shadow.normalBias=.035;sun.shadow.bias=-.00045;scene.add(sun.target);
 const dock=galley();batchScenery(dock);dock.position.set(0,.4,114);scene.add(dock);
 for(let i=0;i<16;i++){const z=95+i*.62;box(scene,planks[i%4],0,floor(0,z)-.12,z,3.1,.22,.63);}
 for(const [x,z,a] of [[-22,109,-.18],[23,114,.28],[-39,125,.11],[43,130,-.2]]){
  const ship=dock.clone(true);ship.position.set(x,.35,z);ship.rotation.y=a;scene.add(ship);
 }
 const town=city(scene),horse=woodenHorse();scene.add(horse.root);
 const [tent,cart,pine,log,torch,ach,ody,prince,paris,builder,guardsman,greek,trojan]=await Promise.all([
  library('Camp/AFrameTent',2.9),library('Camp/SupplyWagon',2.4),library('Trees/StonePine',9),library('Camp/LogStack',1.45),library('Camp/TorchTripod',2.1),
  makeCastActor('achilles'),makeCastActor('odysseus'),makeCastActor('hector'),makeCastActor('paris'),actor('sailor-ewa',1.78),actor('ford-gaul-spearman',1.8),
  loadTemplate('ford-roman-recruit'),loadTemplate('ford-roman-veteran'),dressField(scene)]);
 for(const rig of [ach,ody,prince,paris,builder,guardsman])scene.add(rig.model);
 function prop(m,x,z,a=0){const q=m.clone(true);q.position.set(x,land(x,z),z);q.rotation.y=a;scene.add(q);return q;}
 for(let i=0;i<10;i++)prop(tent,-37+(i%5)*6.6,77+Math.floor(i/5)*6.1,.2+i*.1);
 for(let i=0;i<29;i++){const x=(i%2?1:-1)*(34+rng()*23);prop(pine,x,20+rng()*39,rng()*6.28);}
 prop(cart,sites.wheels[0]+1,sites.wheels[1]);prop(log,...sites.timber);prop(torch,...sites.lamp);prop(torch,-5,-5);prop(torch,5,-5);
 for(let i=0;i<4;i++)box(scene,i%2?cream:blue,sites.sail[0]+.3*i,land(...sites.sail)+.10+i*.22,sites.sail[1],2.8,.23,1.4);
 flag(scene,-2,land(0,91),91,blue);flag(scene,13,land(13,68),68,red);
 for(let i=0;i<8;i++){const a=i*2.4,r=i*.17;mesh(scene,new T.IcosahedronGeometry(.85-i*.035,0),tan,sites.cairn[0]+Math.sin(a)*r,land(...sites.cairn)+.3,sites.cairn[1]+Math.cos(a)*r);}
 function armyVariant(base,color){
   const death=ach.template.clips.find(c=>c.name==='death');
   const local={...base,scene:cloneSkeleton(base.scene),clips:[...base.clips,death]};
   finishRig({model:local.scene},color);
   return createPresetRanks(scene,[local],true);
 }
 const greekRank=armyVariant(greek,'#456f82'),trojanRank=armyVariant(trojan,'#a35740');
 const drawArmies=formations(scene);
 const transform=new T.Object3D();
 function soldier(rank,x,z,yaw,clip,cycle,fall=0){
   transform.position.set(x,land(x,z),z);transform.rotation.set(0,Math.PI-yaw,0,'YXZ');transform.scale.setScalar(1);transform.updateMatrix();
   rank.draw({swing:.48*(1-(cycle%1)),step:cycle*5,fallen:fall},0,transform.matrix,fall>0?'death':clip,cycle);
 }
 const tells=Array.from({length:2},()=>{const g=new T.RingGeometry(.53,.72,28,1,0,Math.PI*1.6);
   const m=mesh(scene,g,new T.MeshBasicMaterial({color:'#ffd276',transparent:true,opacity:.87,depthWrite:false,side:T.DoubleSide}));
   m.rotation.x=-Math.PI/2;return m;
 });
 const heroShade=new T.Group();shadow(heroShade,1.3,1.1);scene.add(heroShade);
 const cue=mesh(scene,new T.TorusGeometry(.82,.055,8,48),new T.MeshBasicMaterial({color:'#ffdb85'}));cue.rotation.x=Math.PI/2;
 const patrolLamp=mesh(scene,new T.SphereGeometry(.19,10,8),new T.MeshBasicMaterial({color:'#ffc35c'}));
 const glow=mesh(scene,new T.CircleGeometry(2.15,28),new T.MeshBasicMaterial({color:'#ffbf62',transparent:true,opacity:.29,depthWrite:false}));glow.rotation.x=-Math.PI/2;
 const arrow=rod(scene,planks[0],[0,0,-.55],[0,0,.55],.055);arrow.visible=false;
 const inside=new T.Scene(),interior=horseInterior();inside.add(interior.group);inside.background=new T.Color('#9d7643');
 const lamplight=new T.PointLight('#ffc381',17,12);lamplight.position.set(-.85,1.6,-.9);
 inside.add(lamplight,new T.HemisphereLight('#d3b38f','#493923',1.1));
 const carriers={timber:new T.Group(),wheels:new T.Group(),sail:new T.Group()};
 box(carriers.timber,planks[1],.47,.98,0,.22,.19,1.8);
 const rollingWheel=mesh(carriers.wheels,new T.TorusGeometry(.46,.105,8,20),planks[1],.68,.55,0);rollingWheel.rotation.y=Math.PI/2;
 for(let i=0;i<4;i++){const a=i*Math.PI/4;rod(carriers.wheels,planks[0],[.68,.55-Math.cos(a)*.42,-Math.sin(a)*.42],[.68,.55+Math.cos(a)*.42,Math.sin(a)*.42],.044);}
 const roll=mesh(carriers.sail,new T.CylinderGeometry(.23,.23,.91,12),cream,.49,1.08,0);roll.rotation.x=Math.PI/2;
 for(const g of Object.values(carriers))scene.add(g);
 const helpers=await Promise.all([actor('sailor-ewa',1.8),actor('blacksmith-hilde',1.7),actor('merchant-mara',1.69)]);
 for(const helper of helpers)scene.add(helper.model);
 const companions=await Promise.all([actor('ford-roman-recruit',1.66),actor('sailor-ewa',1.7)]);
 for(const rig of companions)inside.add(rig.model);
 let t=0,last='',gateAngle=0,processionTime=0;
 return {render(s,dt,mode,target){
   t+=dt;const st=current(s),night=s.chapter>=4&&s.chapter<6,death=st.id==='death',handed=s.chapter>=3;
   const procession=s.chapter===4&&mode==='film';
   const descending=st.id==='ladder';
   document.body.classList.toggle('horse-belly',s.chapter===4&&mode==='play');
   if(s.chapter===4&&!procession&&!descending&&mode!=='end'){
     for(const rig of companions)if(rig.model.parent!==inside)inside.add(rig.model);
     const rolling=st.id==='ride',sway=rolling?.058*Math.sin(t*3.2):.008*Math.sin(t);
     pose(companions[0],-1.1,0,-1.05,.7,'idle',dt);pose(companions[1],1.28,0,-1.7,-.8,'crouch',dt);
     interior.shield.rotation.z=rolling?.3*Math.sin(t*6)*(1-s.quiet/3.2):0;
     interior.flap.rotation.x=st.id==='hatch'?-s.work/2.4*1.3:0;
     lamplight.intensity=2.5+1.2*(1+Math.sin(t*(rolling?2.4:.8)));inside.background.set(st.id==='ride'?'#c3ab81':'#304354');
     camera.position.set(sway,1.56+sway*.5,2.2);camera.lookAt(0,1.14,-2.4);renderer.render(inside,camera);last='interior';return;
   }
   const day=s.chapter===6?'#dab29a':'#efd4b2';
   canopy.top.value.set(night?'#23344d':'#779eae');canopy.horizon.value.set(night?'#635b64':day);scene.fog.color.copy(canopy.horizon.value);
   fill.intensity=night?.85:1.16;sun.intensity=night?.70:2.38;
   sun.position.set(s.x-29,land(s.x,s.z)+37,s.z+18);sun.target.position.set(s.x,land(s.x,s.z),s.z);sun.color.set(night?'#c4cbea':'#ffdcac');
   drawSea(t,night);drawArmies(s,st,t);
   if(procession){if(last!=='procession')processionTime=0;processionTime+=dt;}
   const hp=procession?[-3,6-processionTime*2.5]:night||s.chapter===6?sites.courtyard:sites.yard;
   horse.root.visible=handed;horse.root.position.set(hp[0]+3,land(...hp),hp[1]+.8);horse.root.rotation.y=-.4;horse.fit(s.fitted,s.chapter>=4);
   gateAngle+=((s.gate||procession?1.49:0)-gateAngle)*(1-Math.exp(-dt*2.8));
   town.doors.forEach((door,i)=>door.rotation.y=(i?1:-1)*gateAngle);town.bar.visible=!s.gate&&!procession;town.bar.position.y=town.base+1.48+s.bar*1.3;
   const hero=handed?ody:ach;ach.model.visible=!handed;ody.model.visible=handed&&!procession;
   const stepHeight=descending?3.8*(1-clamp(s.work/5.4,0,1)):0;
   pose(hero,s.x,floor(s.x,s.z)+stepHeight,s.z,descending?horse.root.rotation.y-Math.PI/2:Math.PI-s.yaw,descending?(s.speed?'walk':'idle'):death&&s.stepTime>=arrowTiming.impact?'death':s.guard?'block':s.swing>0?'attack':Math.abs(s.speed)>.1?'walk':'idle',dt);
   heroShade.visible=!procession;heroShade.position.set(s.x,floor(s.x,s.z),s.z);
   const named=st.id==='hector'?s.foes[0]:null;prince.model.visible=s.chapter===1&&st.id!=='patroclus';
   if(prince.model.visible){
     const dead=named?.hp===0,px=named?.x,pz=named?.z;
     pose(prince,px??0,land(px??0,pz??13),pz??13,Math.PI-(named?.yaw??Math.PI),dead?'death':named?.phase||'idle',dt);
   }
   paris.model.visible=s.chapter===2;pose(paris,6.2,town.base+10.38,.8,0,death&&s.stepTime>1.6?'shoot':'aim',dt);
   arrow.visible=death&&s.stepTime>=arrowTiming.release;
   if(arrow.visible){const a=V(6.2,town.base+11.6,1.1),b=V(s.x,floor(s.x,s.z)+.4,s.z);arrow.position.copy(a).lerp(b,clamp((s.stepTime-arrowTiming.release)/(arrowTiming.impact-arrowTiming.release),0,1));arrow.lookAt(b.clone().add(b.clone().sub(a)));}
   for(const [key,bundle] of Object.entries(carriers)){
     bundle.visible=s.chapter===3&&s.carry===key;bundle.position.set(s.x,floor(s.x,s.z),s.z);bundle.rotation.y=Math.PI-s.yaw;
   }
   const supplyKeys=['timber','wheels','sail'];
   helpers.forEach((rig,i)=>{const [x,z]=sites[supplyKeys[i]];rig.model.visible=s.chapter===3;
     if(rig.model.visible)pose(rig,x+1.7,land(x+1.7,z),z,Math.atan2(s.x-x-1.7,s.z-z),'idle',dt);});
   builder.model.visible=s.chapter===3;
   if(builder.model.visible){
     const near=Math.hypot(s.x+18,s.z-65)<6;
     const facing=near?Math.atan2(s.x+18,s.z-65):Math.atan2(horse.root.position.x+18,horse.root.position.z-65);
     pose(builder,-18,land(-18,66),65,facing,'idle',dt);
   }
   const gp=guardPosition(s.elapsed);
   let patrolYaw=Math.atan2(10*Math.cos(s.elapsed*.48),-2*Math.sin(s.elapsed*.48));
   if(descending){
     const phase=(s.stepTime-4.2)*Math.PI/3;
     gp[0]=s.x+2.1+3*(1-Math.cos(phase));gp[1]=s.z+1.7+1.1*Math.sin(phase);
     patrolYaw=Math.atan2(3*Math.sin(phase),1.1*Math.cos(phase));
   }
   guardsman.model.visible=patrolLamp.visible=glow.visible=s.chapter===5||descending;
   if(guardsman.model.visible){pose(guardsman,gp[0],land(...gp),gp[1],patrolYaw,'walk',dt);patrolLamp.position.set(gp[0]+.5,land(...gp)+1.2,gp[1]);glow.position.set(gp[0],land(...gp)+.11,gp[1]);}
   greekRank.reset();trojanRank.reset();
   const front=s.foes.filter(n=>n.hp>0).slice(0,2);
   tells.forEach((m,i)=>{const n=front[i];m.visible=!!n&&(n.phase==='block'||n.phase==='attack');
     if(m.visible){m.position.set(n.x,land(n.x,n.z)+.09,n.z);m.material.color.set(n.phase==='attack'?'#df5934':'#ffd276');}
   });
   if(st.id!=='hector')for(const [i,n] of s.foes.entries())if(n.fall<2.3)soldier(trojanRank,n.x,n.z,n.yaw,n.phase==='block'?'attack':n.phase,n.phase==='block'?.10:t*1.6+i,n.fall);
   if(s.chapter===0)for(let i=0;i<12;i++){const x=(i%2?1:-1)*(3+(i%3)*2),z=Math.max(50,s.z+3)+Math.floor(i/4)*2;soldier(greekRank,x,Math.min(92,z),0,s.speed?'walk':'idle',t+i);}
   if(s.chapter===5){
     companions.forEach((rig,i)=>{
       if(rig.model.parent!==scene)scene.add(rig.model);
       const atBeam=st.id==='gate'&&s.bar>0,side=i?1:-1;
       const x=atBeam?side*2:s.x-Math.sin(s.yaw)*2+Math.cos(s.yaw)*side*.94;
       const z=atBeam?-2.5:s.z+Math.cos(s.yaw)*2+Math.sin(s.yaw)*side*.94;
       pose(rig,x,land(x,z),z,atBeam?0:Math.PI-s.yaw,atBeam?'push':s.speed?'walk':'crouch',dt);
     });
   }else for(const rig of companions)if(rig.model.parent===scene)inside.add(rig.model);
   if(procession)for(let i=0;i<12;i++)soldier(trojanRank,(i%2?1:-1)*2.15,hp[1]+Math.floor(i/2)*1.15-3,0,'walk',t*2+i);
   if(s.chapter===6){
     // Rear files march through the opening, then spread into two fighting wings.
     const clock=s.step===0?s.stepTime:30+s.stepTime;
     const push=s.step===0?0:Math.min(8,s.stepTime*1.2);
     const retreat=s.step===2?Math.min(12,s.stepTime*2.5):0;
     for(let i=0;i<38;i++){
       const side=i%2?1:-1,row=Math.floor(i/8),lane=Math.floor(i%8/2),endZ=-7-row*4;
       const q=clamp((clock-i*.11)*2.5,0,21+row*4),z=14-q-push;
       const x=side*(.42+lane*.6+clamp(-z/6,0,1)*(3.1+lane*1.2));
       const advance=z>endZ-push+.1,phase=t*1.3+i*.48;
       soldier(greekRank,x,z,0,retreat>2?'idle':advance?'walk':'attack',phase);
       soldier(trojanRank,side*(3.5+lane*1.8+retreat*.25),endZ-push-1.3+Math.sin(phase)*.25-retreat,retreat?0:Math.PI,retreat?'walk':advance?'idle':'attack',phase+.35);
     }
   }
   greekRank.flush();trojanRank.flush();
   cue.visible=mode==='play'&&!death;
   if(cue.visible)cue.position.set(target[0],floor(...target)+.16,target[1]);
   if(procession){
     camera.position.set(11,town.base+6,-13);camera.lookAt(0,town.base+3.7,hp[1]);
   }else if(descending){
     camera.position.set(s.x+4.7,floor(s.x,s.z)+3.3,s.z+6.3);camera.lookAt(s.x+1.15,floor(s.x,s.z)+1.2+stepHeight*.34,s.z+.65);
   }else if(death){
     if(s.stepTime<1.7){camera.position.set(1,9,13);camera.lookAt(6.2,town.base+11,.8);}
     else{camera.position.set(s.x+4.4,floor(s.x,s.z)+2.2,s.z+4.8);camera.lookAt(s.x,floor(s.x,s.z)+.85,s.z);}
   }else if(s.chapter===1&&mode==='film'){
     camera.position.set(-20+Math.sin(t*.13)*3,land(-20,50)+9,51);camera.lookAt(2,land(0,17)+2.7,13);
   }else if(mode==='film'||mode==='end'){
     const horseShot=s.chapter===3||s.chapter===5,focus=horseShot?hp:[s.x,s.z];
     camera.position.set(focus[0]+(horseShot?11:7),floor(...focus)+(horseShot?6.5:4.4),focus[1]+11);camera.lookAt(focus[0],floor(...focus)+(horseShot?4:1),focus[1]);
   }else if((st.id==='plan'||st.id==='board')&&Math.hypot(s.x-sites.yard[0],s.z-sites.yard[1])<5){
     // Frame both figures from the open side of the carpenter’s platform.
     const height=floor(s.x,s.z);
     camera.position.lerp(V(s.x-4.8,height+3.1,s.z+3.7),1-Math.exp(-dt*6));
     camera.lookAt((s.x-18)/2,height+1.25,(s.z+65)/2);
   }else{chase(camera,s.x,s.z,s.yaw,floor,s.wave?7.35:5.7,s.wave?4.45:3.05,last!=='play'?1:dt,1.4);}
   renderer.render(scene,camera);last=procession?'procession':mode;
 }};
}
