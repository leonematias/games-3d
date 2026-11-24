import * as T from 'three';
import {viewport,sky,ground,mountainRing,actor,library,place,mesh,scatter,surface,shadow,rod,V,chase,clamp,random} from '../field-narratives/landscape.js';
import {channel,sites,logPosition,stepInterval,gait,gravelRise} from './story.js';
import {species} from './wildlife.js';
import {obstacles} from '../field-narratives/obstacles.js';
export const trunks=obstacles();
const ridge=(x,z)=>28*Math.exp(-((x+560)**2+(z+270)**2)/52000)+15*Math.exp(-((x-340)**2+(z+380)**2)/38000);
function elevation(x,z){
 const d=Math.abs(x-channel(z)),bank=clamp((d-11)/33,0,1);
 return -.95+gravelRise(x,z)+1.65*bank+(1-Math.exp(-d/60))*(3.3+1.9*Math.sin(x*.026+z*.009)+1.3*Math.cos(z*.031)+ridge(x,z));
}
function river(scene){
 const v=[],indices=[];
 for(let i=0;i<=400;i++){const z=-1300+i*6.5,x=channel(z);v.push(x-25,0,z,x+25,0,z);if(i){const n=i*2;indices.push(n-2,n-1,n,n,n-1,n+1);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(indices);g.computeVertexNormals();
 const mat=surface('#749b91',{metalness:.15,roughness:.34,side:T.DoubleSide});
 return mesh(scene,g,mat);
}
async function plants(scene,rng){
 const list=[['Trees/BaldCypress',18,600],['Trees/MonkeyPuzzle',16,490],['Trees/GinkgoTree',12,440],['Plants/HorsetailClump',2.2,1050],['Plants/FernClump',1.55,1600]];
 const assets=await Promise.all(list.map(([p,h])=>library(p,h)));
 const centers=[[-320,610],...Object.values(sites)];
 assets.forEach((m,k)=>{
  const pts=[],count=list[k][2];
  for(let i=0;i<count;i++){
   const c=centers[i%centers.length],r=9+Math.pow(rng(),.68)*(k<3?180:105),a=rng()*6.283;
   const x=c[0]+Math.sin(a)*r,z=c[1]+Math.cos(a)*r;
   if(Math.hypot(x-sites.nest[0],z-sites.nest[1])<24||Math.abs(x-channel(z))<19||centers.some(([cx,cz])=>Math.hypot(x-cx,z-cz)<6))continue;
   const size=.55+rng()*.85,sc=m.scale.x*size;
   const angle=rng()*6.28;
   // Leave the chase camera a sightline from the west bank to the fork.
   if(k<3&&Math.hypot(x-sites.drink[0]+15,z-sites.drink[1]-4)<25)continue;
   if(k<3)trunks.add(x,z,.33*size);
   pts.push([x,elevation(x,z),z,sc,angle]);
  }
  // Cluster instance bounds so distant groves are culled as the camera moves.
  const cells=new Map();
  for(const p of pts){const key=Math.floor(p[0]/160)+','+Math.floor(p[2]/160);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}
  for(const ps of cells.values())scatter(scene,m.geometry,m.material,ps);
 });
}
function trail(scene,[x,z],[toX,toZ],rng,size=1){
 const angle=Math.atan2(toX-x,z-toZ);
 const mud=surface('#443729'),pad=new T.SphereGeometry(1,8,4);
 const dots=[];
 for(let i=0;i<14;i++){const ax=x+Math.sin(angle)*i*1.85+Math.cos(angle)*(i%2?.48:-.48),az=z-Math.cos(angle)*i*1.85+Math.sin(angle)*(i%2?.48:-.48);
 dots.push([ax,elevation(ax,az)+.09,az,.36*size,-angle,.08,.43*size]);
 for(let j=-1;j<=1;j++){
  const toe=angle+j*.47,tx=ax+Math.sin(toe)*.42*size,tz=az-Math.cos(toe)*.42*size;
  dots.push([tx,elevation(tx,tz)+.09,tz,.14*size,-toe+rng()*.06,.06,.26*size]);
 }}
 scatter(scene,pad,mud,dots);
}
function distantImpact(){
 const group=new T.Group(),rock=surface('#977f69',{flatShading:true}),water=surface('#32817d'),glow=new T.MeshBasicMaterial({color:'#ffe4a0'});
 mesh(group,new T.CylinderGeometry(78,78,1,64),water,0,-1,0);
 for(let i=0;i<10;i++)mesh(group,new T.IcosahedronGeometry(3+i%4,0),rock,-42+i*8,-2,-15-Math.sin(i)*4);
 const body=mesh(group,new T.SphereGeometry(1.3,14,10),glow);
 const tail=mesh(body,new T.ConeGeometry(1.1,13,12),new T.MeshBasicMaterial({color:'#ed9756'}),0,5.8,0);
 tail.rotation.z=-.51;tail.position.x=-3;
 const plume=mesh(group,new T.IcosahedronGeometry(1,2),new T.MeshBasicMaterial({color:'#ffd394'}));
 const ring=mesh(group,new T.TorusGeometry(1,.038,6,80),glow);ring.rotation.x=Math.PI/2;ring.position.y=.1;
 return {group,pose(t){const a=clamp(t/2.5,0,1);body.visible=a<1;body.position.set(-23*(1-a),33*(1-a),0);const b=clamp((t-2.5)/2.7,0,1);
 plume.visible=ring.visible=b>0;plume.position.y=b*2;plume.scale.set(1+b*12,1+b*20,1+b*12);ring.scale.setScalar(.5+b*53);}};
}
export async function floodplain(){
 const {renderer,scene,camera}=viewport(),rng=random(66017);
 scene.fog=new T.FogExp2('#c5c0a0',.0035);camera.far=4000;camera.updateProjectionMatrix();
 const dome=sky(scene,'#54869a','#dccbac',1600);
 const ambient=new T.HemisphereLight('#ffe4ba','#766e4e',1.55);scene.add(ambient);
 const sun=new T.DirectionalLight('#ffdda5',2.1);sun.position.set(-140,110,-85);scene.add(sun);
 const floodplainGround=ground(scene,1170,310,elevation,(c,x,z,h)=>{
  const t=Math.sin(x*.05+Math.cos(z*.035)*4)*.019+Math.sin(z*.18+x*.21)*.009;
  if(gravelRise(x,z)>1.1){c.setHSL(.098,.17,.68+t);return;}
  c.setHSL(h<.5?.09:.215+t,.14+t,h<.5?.6:.64+t+Math.sin(x*.018)*.045);
 },381);
 const litter=await new T.TextureLoader().loadAsync('/games-3d/static/hell-creek/forest-floor.jpg');litter.colorSpace=T.SRGBColorSpace;
 litter.wrapS=litter.wrapT=T.RepeatWrapping;litter.repeat.set(1.6,1.6);litter.anisotropy=4;
 floodplainGround.material.map.dispose();floodplainGround.material.map=litter;
 mountainRing(scene,1110,['#647657','#788462','#7f836b','#75846c'],-1,175,42);
 const water=river(scene);
 const [player,roster,log,cave]=await Promise.all([actor('tyrannosaurus',4.45),Promise.all(species.map(n=>actor(n.kind,n.height))),library('Deadwood/FallenTrunk',2.6),library('Rocks/CaveMouth',8),plants(scene,rng)]);
 const root=new T.Group();scene.add(root);root.add(player.model);shadow(root,6,12);
 const bones=surface('#b9a68c'),hide=surface('#6a4c35'),remains=new T.Group();place(scene,remains,sites.rival[0]-3,sites.rival[1]+2,elevation);
 const carcass=mesh(remains,new T.IcosahedronGeometry(1,1),hide);carcass.scale.set(2.6,.73,1.05);
 for(let i=0;i<6;i++){const rib=mesh(remains,new T.TorusGeometry(.8,.08,7,20,Math.PI*1.32),bones,i*.55-1.35,.37,0);rib.rotation.y=Math.PI/2;rib.rotation.z=-.45;}
 rod(remains,bones,[-2.8,.5,-.2],[2.9,.75,.18],.15,.21);
 const npcs=roster.map((rig,i)=>{const g=new T.Group();scene.add(g);g.add(rig.model);shadow(g,species[i].height*1.55,species[i].height*2.4);return g;});
 place(scene,cave,...sites.shelter,elevation);cave.rotation.y=-.8;
 for(const key of ['scrape','rest','browse','split','snag','ridge']){const tree=log.clone();place(scene,tree,sites[key][0]+5,sites[key][1]-1,elevation);tree.rotation.y=rng()*6.28;}
 for(const [from,to] of [['tracks','north'],['browse','ankylosaur'],['scrape','horns'],['north','rival'],['pass','hollow'],['ridge','shelter']]){
  trail(scene,sites[from],sites[to],rng);
 }
 trail(scene,sites.tracks,sites.calf,rng,.68);
 // The same pale fork frames the morning drink and the flood inspection.
 const fork=new T.Group(),wood=surface('#9a886d');
 place(scene,fork,sites.drink[0]+6,sites.drink[1]+5,elevation);
 rod(fork,wood,[0,-.4,0],[.5,5.4,-.2],.8,.48);
 rod(fork,wood,[.5,4.8,-.2],[-1.9,8.4,-.4],.49,.19);
 rod(fork,wood,[.5,4.9,-.2],[2.8,7.3,.7],.45,.13);
 rod(fork,wood,[-1.6,7.9,-.4],[-2.9,8.5,.5],.2,.07);
 rod(fork,wood,[.25,3.2,0],[-.8,4.2,1.3],.3,.14);
 rod(fork,wood,[.15,1.2,0],[-1.6,0,-.85],.45,.24);
 trunks.add(fork.position.x,fork.position.z,.8);
 const wrack=new T.Group();fork.add(wrack);
 rod(wrack,wood,[-2.3,2.4,-.6],[2.7,2.9,.2],.18,.09);
 rod(wrack,wood,[.6,2.7,-.1],[1.7,3.6,-.5],.11,.04);
 const tumble=log.clone();scene.add(tumble);const fallen=log.clone();scene.add(fallen);place(scene,fallen,sites.bank[0]+3,sites.bank[1]-8,elevation);
 const snags=[];for(let i=0;i<16;i++){const x=channel(300+i*20)+22+rng()*15,z=300+i*20;
 const a=new T.Group();place(scene,a,x,z,elevation);const bark=surface('#594c37');rod(a,bark,[0,0,0],[1,7,0],.52,.23);rod(a,bark,[.5,4,0],[-2,6,1],.22,.07);a.rotation.z=.12;snags.push(a);}
 const flecks=new T.BufferGeometry(),pos=new Float32Array(200*3);for(let i=0;i<pos.length;i++)pos[i]=(rng()-.5)*52;
 flecks.setAttribute('position',new T.BufferAttribute(pos,3));const dust=new T.Points(flecks,new T.PointsMaterial({color:'#e3c5a0',size:.065,transparent:true,opacity:.6}));scene.add(dust);
 const ripples=[];for(let i=0;i<300;i++){const z=rng()*1780-880;ripples.push([channel(z)+(rng()-.5)*25,.07,z,1+rng()*1.8,rng()*.32,.035,.09]);}
 const lines=scatter(scene,new T.SphereGeometry(1,6,3),surface('#b0c1a7'),ripples);
 const impactScene=new T.Scene(),cut=distantImpact();impactScene.background=new T.Color('#cb9579');impactScene.fog=new T.FogExp2('#cb9579',.011);impactScene.add(cut.group,new T.HemisphereLight('#ffdab3','#927566',2));
 const aftermath=new T.Scene(),plate=await new T.TextureLoader().loadAsync('/games-3d/static/hell-creek/impact.jpg');plate.colorSpace=T.SRGBColorSpace;
 const panel=mesh(aftermath,new T.PlaneGeometry(2*plate.image.width/plate.image.height,2),new T.MeshBasicMaterial({map:plate}));
 const plateCam=new T.OrthographicCamera(-1,1,1,-1,.1,5);plateCam.position.z=1;
 const cutCam=new T.PerspectiveCamera(48,camera.aspect,.1,300);cutCam.position.set(17,7,49);cutCam.lookAt(0,6,0);
 let clock=0,cutTime=0,last='',stage=-1;
 return {render(s,dt,mode){
  clock+=dt;
  if(mode==='film'&&s.chapter===4){if(last!=='impact')cutTime=0;cutTime+=dt;if(cutTime<2.7){cut.pose(cutTime);cutCam.aspect=camera.aspect;cutCam.updateProjectionMatrix();renderer.render(impactScene,cutCam);}else{
    plateCam.left=-camera.aspect;plateCam.right=camera.aspect;plateCam.updateProjectionMatrix();
    panel.scale.setScalar(Math.max(1,camera.aspect/(plate.image.width/plate.image.height))*(1+(cutTime-2.7)*.012));
    renderer.render(aftermath,plateCam);}last='impact';return;}
  const dark=s.chapter>=4,night=s.chapter===6;
  if(stage!==s.chapter){stage=s.chapter;dome.top.value.set(night?'#323d49':dark?'#70695e':s.chapter>=3?'#819491':'#578ca3');dome.horizon.value.set(night?'#ad886d':dark?'#c59670':'#e5d2ab');
   scene.fog.color.copy(dome.horizon.value);scene.fog.density=night?.006:dark?.005:.0032;sun.color.set(dark?'#fbb185':'#ffe0ab');sun.intensity=night?.58:dark?1.25:2;ambient.intensity=night?1.04:1.65;water.material.color.set(dark?'#83745d':'#678e84');}
  water.position.y=dark?.95:0;lines.position.set(0,water.position.y,Math.sin(clock*.6)*.5);
  const [lx,lz]=logPosition(s.elapsed);tumble.position.set(lx,water.position.y+.2,lz);tumble.rotation.y=.6+Math.sin(clock*.32)*.18;tumble.visible=dark;fallen.visible=dark;wrack.visible=dark;
  for(let i=0;i<snags.length;i++)snags[i].rotation.z=dark?1.07+i*.035:.12;
  dust.visible=dark;dust.position.set(s.x,elevation(s.x,s.z)+7+Math.sin(clock*.45),s.z);dust.rotation.y=clock*.035;
  root.position.set(s.x,elevation(s.x,s.z),s.z);root.rotation.y=Math.PI-s.yaw;
  function drape(g){const patch=g.children[1],x=g.position.x,z=g.position.z;
   const nx=elevation(x-1,z)-elevation(x+1,z),nz=elevation(x,z-1)-elevation(x,z+1);
   const normal=V(nx,2,nz).normalize().applyAxisAngle(V(0,1,0),-g.rotation.y);
   patch.quaternion.setFromUnitVectors(V(0,0,1),normal);patch.position.y=.18;
  }drape(root);
  const moving=Math.abs(s.speed)>.3;
  const stride=player.play(s.actionTime>0?s.action:gait(s));
  if(stride&&moving&&s.actionTime<=0)player.setSpeed(stride.getClip().duration/(2*stepInterval(s.speed)));
  player.update(dt);
  roster.forEach((rig,i)=>{const n=s.animals[species[i].id],g=npcs[i];g.visible=Math.hypot(n.x-s.x,n.z-s.z)<260;if(!g.visible)return;
   g.position.set(n.x,elevation(n.x,n.z),n.z);g.rotation.y=Math.PI-n.yaw;drape(g);rig.play(n.mode,{once:n.life<=0});rig.update(dt);});
  if(mode==='title'||mode==='end'){
   const a=s.yaw+(mode==='end'?-1.1:1.12)+Math.sin(clock*.08)*.12;
   camera.position.set(s.x+Math.sin(a)*13,elevation(s.x,s.z)+4.0,s.z-Math.cos(a)*13);
   camera.lookAt(s.x+Math.cos(a)*2.5,elevation(s.x,s.z)+2.4,s.z+Math.sin(a)*2.5);
  }else if(mode==='film'){
   const a=s.yaw-1.8+Math.sin(clock*.15)*.32;camera.position.set(s.x+Math.sin(a)*17,elevation(s.x,s.z)+5.6,s.z-Math.cos(a)*17);camera.lookAt(s.x,elevation(s.x,s.z)+2.5,s.z);
  }else{chase(camera,s.x,s.z,s.yaw,elevation,15,6.1,last==='play'?dt:1,4.6);}
  renderer.render(scene,camera);last=mode;
 }};
}
