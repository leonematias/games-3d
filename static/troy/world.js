import * as T from 'three';
import {viewport,ground,mountainRing,sky,mesh,box,rod,surface,shadow,random,V,clamp,library,actor,chase} from '../field-narratives/landscape.js';
import {loadTemplate} from '../medieval/rig.js';
import {createPresetRanks} from '../eagle-ford/preset-ranks.js';
import {sites,current,guardPosition} from './story.js';
import {woodenHorse,galley,horseInterior,planks} from './carpentry.js';

const rng=random(9004),tan=surface('#c3aa82'),red=surface('#953e35'),blue=surface('#285f6c'),bronze=surface('#a88146',{metalness:.35}),cream=surface('#e3ceb1');
function land(x,z){
 if(z>=89)return Math.max(-2.9,.64-(z-89)*.145);
 return .65+Math.min(1,(89-z)/20)*(.35+.3*Math.sin(x*.09+z*.05));
}
function floor(x,z){
 if(z>95&&Math.abs(x)<2)return z>=104?1.73:.1+(z-95)*.181;
 return land(x,z);
}
function flag(group,x,y,z,mat){
 rod(group,planks[1],[x,y,z],[x,y+3.8,z],.07);
 box(group,mat,x+.55,y+3.03,z,1.1,1.04,.035);
}
function masonry(){
 const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#806d58';ctx.fillRect(0,0,512,256);
 for(let j=0;j<8;j++)for(let i=-1;i<9;i++){
  const x=i*64+(j%2)*32,y=j*32,light=50+rng()*16;
  ctx.fillStyle='hsl(32,27%,'+light+'%)';ctx.fillRect(x+1,y+1,62,30);ctx.fillStyle='#f4d5a846';ctx.fillRect(x+2,y+2,61,2);
 }
 for(let i=0;i<4800;i++){ctx.fillStyle=i%2?'#d6c6a830':'#4f392721';ctx.fillRect(rng()*512,rng()*256,2,1);}
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;
 return surface('#eedbb8',{map});
}
function city(scene){
 const stone=masonry(),base=land(0,0);
 for(const side of [-1,1]){
  for(let i=0;i<8;i++){
   const x=side*(8.2+i*7.8);box(scene,stone,x,base+3.6,0,7.85,7.2,3.4);
   for(const dx of [-2.8,0,2.8])box(scene,tan,x+dx,base+7.6,0,1.3,1,3.15);
  }
  const x=side*6.3;box(scene,stone,x,base+5,0,4.7,10,5.4);
  box(scene,tan,x,base+10.15,0,5.15,.45,5.72);
  flag(scene,x,base+10.4,.6,red);
 }
 const doors=[];
 for(const side of [-1,1]){
  const hinge=new T.Group();hinge.position.set(side*4.06,base,.4);scene.add(hinge);
  for(let i=0;i<7;i++)box(hinge,planks[i%4],-side*(i+.5)*.58,3,0,.57,6,.3);
  for(const h of [1.1,4.1])box(hinge,bronze,-side*2.04,h,-.2,4,.18,.12);
  doors.push(hinge);
 }
 const bar=box(scene,planks[0],0,base+1.48,-.18,8.5,.37,.37);
 for(let i=0;i<52;i++){
  const side=i%2?1:-1,x=side*(17+(i%5)*8+rng()*5),z=-8-Math.floor(i/5)*5.2-rng()*2;
  const h=2.6+rng()*2.2,w=4+rng()*2.3,d=3+rng()*2;
  box(scene,tan,x,land(x,z)+h/2,z,w,h,d);box(scene,planks[1],x,land(x,z)+h+.12,z,w+.35,.3,d+.35);
  box(scene,planks[0],x,land(x,z)+.95,z+d/2+.02,1.1,1.9,.08);
 }
 for(let i=0;i<6;i++){
  const z=-17-i*3.5;mesh(scene,new T.CylinderGeometry(.36,.49,3.9,10),cream,11,land(11,z)+1.95,z);
 }
 box(scene,tan,11,land(11,-24)+4.03,-25.6,1.1,.48,19.2);
 flag(scene,...[sites.standardHill[0],land(...sites.standardHill),sites.standardHill[1]],blue);
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
 for(let i=0;i<12;i++){const a=i*Math.PI/6;mesh(face,new T.SphereGeometry(.021,6,4),bronze,Math.cos(a)*.36,.038,Math.sin(a)*.36);}
}
function finishRig(rig,color){
 roundShield(rig.model,color);
 rig.model.traverse(n=>{
  if(!n.isMesh||Array.isArray(n.material))return;
  if(/shirt|skirt|crest|gambeson/.test(n.name)){n.material=n.material.clone();n.material.color.set(color);}
  if(/armor_chest|helmet_visor|pauldron/.test(n.name)){n.material=n.material.clone();n.material.color.set('#b29258');}
 });
 return rig;
}
export async function world(){
 const {renderer,scene,camera}=viewport();
 const canopy=sky(scene,'#729caf','#edcfa3',510);
 scene.fog=new T.FogExp2('#e6c9a4',.005);
 const sun=new T.DirectionalLight('#ffe0af',2.4);sun.position.set(-35,43,22);
 const fill=new T.HemisphereLight('#ffe9c6','#81705d',1.55);scene.add(sun,fill);
 ground(scene,190,165,land,(c,x,z)=>{const n=.03*Math.sin(x*.17+z*.25);c.setHSL(.097+n*.2,.27+n,z>65?.64+n:.49+n);},39);
 mountainRing(scene,177,['#ad977f','#9b8a78','#9f9180','#b4a48d'],-3,49,721);
 const sea=mesh(scene,new T.PlaneGeometry(390,130),surface('#477e86',{roughness:.36,metalness:.15}),0,-.21,162);sea.rotation.x=-Math.PI/2;
 const glints=new T.Group();scene.add(glints);
 for(let i=0;i<120;i++)box(glints,cream,(rng()-.5)*160,-.16,97+rng()*64,.5+rng()*2,.018,.065);
 const dock=galley();dock.position.set(0,.4,114);scene.add(dock);
 for(let i=0;i<16;i++){const z=95+i*.62;box(scene,planks[i%4],0,floor(0,z)-.12,z,3.1,.22,.63);}
 for(const [x,z,a] of [[-22,109,-.18],[23,114,.28],[-39,125,.11],[43,130,-.2]]){
  const ship=dock.clone(true);ship.position.set(x,.35,z);ship.rotation.y=a;scene.add(ship);
 }
 const town=city(scene),horse=woodenHorse();scene.add(horse.root);
 const [tent,cart,pine,log,torch,ach,ody,prince,paris,builder,guardsman,greek,trojan]=await Promise.all([
  library('Camp/AFrameTent',2.9),library('Camp/SupplyWagon',2.4),library('Trees/StonePine',9),library('Camp/LogStack',1.45),library('Camp/TorchTripod',2.1),
  actor('legionary',1.87),actor('ford-roman-veteran',1.79),actor('legionary',1.9),actor('medieval-archer',1.77),actor('sailor-ewa',1.78),actor('ford-gaul-spearman',1.8),
  loadTemplate('ford-roman-recruit'),loadTemplate('ford-gaul-spearman')]);
 for(const rig of [ach,ody,prince,paris,builder,guardsman])scene.add(rig.model);
 finishRig(ach,'#376672');finishRig(ody,'#416a73');finishRig(prince,'#a4473a');
 const bow=new T.Group();rod(bow,planks[0],[0,-.44,0],[.1,0,.15],.036);rod(bow,planks[0],[.1,0,.15],[0,.44,0],.036);rod(bow,cream,[0,-.44,0],[0,.44,0],.009);
 paris.attach(bow,'leftHandTorch','bow');
 function prop(m,x,z,a=0){const q=m.clone(true);q.position.set(x,land(x,z),z);q.rotation.y=a;scene.add(q);return q;}
 for(let i=0;i<10;i++)prop(tent,-37+(i%5)*6.6,77+Math.floor(i/5)*6.1,.2+i*.1);
 for(let i=0;i<29;i++){const x=(i%2?1:-1)*(34+rng()*23);prop(pine,x,20+rng()*39,rng()*6.28);}
 prop(cart,sites.wheels[0]+1,sites.wheels[1]);prop(log,...sites.timber);prop(torch,...sites.lamp);prop(torch,-5,-5);prop(torch,5,-5);
 for(let i=0;i<4;i++)box(scene,i%2?cream:blue,sites.sail[0]+.3*i,land(...sites.sail)+.10+i*.22,sites.sail[1],2.8,.23,1.4);
 flag(scene,-2,land(0,91),91,blue);flag(scene,13,land(13,68),68,red);
 for(let i=0;i<8;i++){const a=i*2.4,r=i*.17;mesh(scene,new T.IcosahedronGeometry(.85-i*.035,0),tan,4+Math.sin(a)*r,land(4,25)+.3,25+Math.cos(a)*r);}
 function armyVariant(base,color){
   // Bake the colour and shield into the local rank, then restore the shared template.
   const rigScene=base.scene;
   const original=rigScene.getObjectByName('scutum');
   const saved=original?[...original.children]:[];
   roundShield(rigScene,color);
   const changes=[];
   rigScene.traverse(n=>{if(n.isMesh&&!Array.isArray(n.material)&&/shirt|gambeson|skirt/.test(n.name)){
     changes.push([n,n.material]);n.material=n.material.clone();n.material.color.set(color);
   }});
   const ranks=createPresetRanks(scene,[base]);
   for(const [n,m] of changes)n.material=m;
   if(original){original.clear();original.add(...saved);}
   return ranks;
 }
 const greekRank=armyVariant(greek,'#456f82'),trojanRank=armyVariant(trojan,'#a35740');
 const transform=new T.Object3D();
 function soldier(rank,x,z,yaw,clip,cycle,fall=0){
   transform.position.set(x,land(x,z),z);transform.rotation.set(-Math.min(fall*3,1)*1.48,Math.PI-yaw,0,'YXZ');transform.scale.setScalar(1);transform.updateMatrix();
   rank.draw({swing:.48*(1-(cycle%1)),step:cycle*5},0,transform.matrix,clip,cycle);
 }
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
   fill.intensity=night?1.04:1.7;sun.intensity=night?.69:2.45;sun.color.set(night?'#c4cbea':'#ffdcac');
   glints.position.x=Math.sin(t*.48)*.35;
   if(procession){if(last!=='procession')processionTime=0;processionTime+=dt;}
   const hp=procession?[-3,6-processionTime*2.5]:night||s.chapter===6?sites.courtyard:sites.yard;
   horse.root.visible=handed;horse.root.position.set(hp[0]+3,land(...hp),hp[1]+.8);horse.root.rotation.y=-.4;horse.fit(s.fitted,s.chapter>=4);
   gateAngle+=((s.gate||procession?1.49:0)-gateAngle)*(1-Math.exp(-dt*2.8));
   town.doors.forEach((door,i)=>door.rotation.y=(i?1:-1)*gateAngle);town.bar.visible=!s.gate&&!procession;town.bar.position.y=town.base+1.48+s.bar*1.3;
   const hero=handed?ody:ach;ach.model.visible=!handed;ody.model.visible=handed&&!procession;
   const stepHeight=descending?3.8*(1-clamp(s.work/5.4,0,1)):0;
   pose(hero,s.x,floor(s.x,s.z)+stepHeight,s.z,Math.PI-s.yaw,descending?'walk':death&&s.stepTime>2.35?'death':s.guard?'block':s.swing>0?'attack':Math.abs(s.speed)>.1?'walk':'idle',dt);
   heroShade.visible=!procession;heroShade.position.set(s.x,floor(s.x,s.z),s.z);
   const named=s.foes[0];prince.model.visible=s.chapter===1&&st.id!=='patroclus';
   if(prince.model.visible){
     const dead=named?.hp===0,px=named?.x,pz=named?.z;
     pose(prince,px??0,land(px??0,pz??13),pz??13,Math.PI-(named?.yaw??Math.PI),dead?'death':named?.phase||'idle',dt);
   }
   paris.model.visible=s.chapter===2;pose(paris,6.2,town.base+10.38,.8,0,death&&s.stepTime>1.6?'shoot':'aim',dt);
   arrow.visible=death&&s.stepTime>=1.65;
   if(arrow.visible){const a=V(6.2,town.base+11.6,1.1),b=V(s.x,floor(s.x,s.z)+.4,s.z);arrow.position.copy(a).lerp(b,clamp((s.stepTime-1.65)/.7,0,1));arrow.lookAt(b.clone().add(b.clone().sub(a)));}
   for(const [key,bundle] of Object.entries(carriers)){
     bundle.visible=s.chapter===3&&s.carry===key;bundle.position.set(s.x,floor(s.x,s.z),s.z);bundle.rotation.y=Math.PI-s.yaw;
   }
   const supplyKeys=['timber','wheels','sail'];
   helpers.forEach((rig,i)=>{const [x,z]=sites[supplyKeys[i]];rig.model.visible=s.chapter===3;
     if(rig.model.visible)pose(rig,x+1.7,land(x+1.7,z),z,Math.atan2(s.x-x-1.7,s.z-z),'idle',dt);});
   builder.model.visible=s.chapter===3;pose(builder,-18,land(-18,66),65,.5,'idle',dt);
   const gp=guardPosition(s.elapsed);if(descending){gp[0]=s.x+2.6+5*(1+Math.cos(s.stepTime*Math.PI/3-1.05));gp[1]=s.z+1.7;}
   guardsman.model.visible=patrolLamp.visible=glow.visible=s.chapter===5||descending;
   if(guardsman.model.visible){pose(guardsman,gp[0],land(...gp),gp[1],Math.cos(s.elapsed*.48)>0?1.55:-1.55,'walk',dt);patrolLamp.position.set(gp[0]+.5,land(...gp)+1.2,gp[1]);glow.position.set(gp[0],land(...gp)+.11,gp[1]);}
   greekRank.reset();trojanRank.reset();
   if(st.id!=='hector')for(const [i,n] of s.foes.entries())if(n.fall<2.3)soldier(trojanRank,n.x,n.z,n.yaw,n.phase==='block'?'idle':n.phase,t*1.6+i,n.fall);
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
     camera.position.set(11,7,-13);camera.lookAt(0,4.7,hp[1]);
   }else if(descending){
     camera.position.set(s.x+6.5,floor(s.x,s.z)+2.9,s.z+4);camera.lookAt(s.x,floor(s.x,s.z)+1+stepHeight*.66,s.z);
   }else if(death){
     if(s.stepTime<1.7){camera.position.set(1,9,13);camera.lookAt(6.2,town.base+11,.8);}
     else{camera.position.set(s.x+4.4,floor(s.x,s.z)+2.2,s.z+4.8);camera.lookAt(s.x,floor(s.x,s.z)+.85,s.z);}
   }else if(mode==='film'||mode==='end'){
     const horseShot=s.chapter===3||s.chapter===5,focus=horseShot?hp:[s.x,s.z];
     camera.position.set(focus[0]+(horseShot?11:7),floor(...focus)+(horseShot?6.5:4.4),focus[1]+11);camera.lookAt(focus[0],floor(...focus)+(horseShot?4:1),focus[1]);
   }else{chase(camera,s.x,s.z,s.yaw,floor,5.7,3.05,last!=='play'?1:dt,1.4);}
   renderer.render(scene,camera);last=procession?'procession':mode;
 }};
}
