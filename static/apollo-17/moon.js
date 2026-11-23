import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {V,random,clamp,surface,mesh,box,rod,place,actor,scatter,shadow,ground,mountainRing,chase,viewport} from '../field-narratives/landscape.js';
import {challenger} from './challenger.js';
import {sites} from './story.js';

import {obstacles} from '../field-narratives/obstacles.js';
export const boulders=obstacles(22);
const craters=[[-130,-190,76,9],[240,480,124,20],[465,931,116,25],[-1718,738,180,36],[-1335,-691,108,24],[-527,-471,108,18],[-811,16,134,22]];
const rng=random(1747);
for(let i=0;i<150;i++)craters.push([rng()*4200-2400,rng()*2800-1400,14+rng()*63,2+rng()*8]);
export function height(x,z){
  let h=3.3*Math.sin(x*.009+z*.002)+2.9*Math.cos(z*.013)+.87*Math.sin((x-z)*.035)+.6*Math.cos(x*.056);
  for(const [cx,cz,r,d] of craters){const dx=x-cx,dz=z-cz;if(Math.abs(dx)>r*1.28||Math.abs(dz)>r*1.28)continue;
    const n=Math.sqrt(dx*dx+dz*dz)/r;h+=n<1?-d*(1-n*n)+d*.22*Math.exp(-((n-.96)**2)/.013):d*.20*Math.exp(-((n-1)**2)/.012);}
  return h;
}
const steel=surface('#b1aaa0',{metalness:.46}),rubber=surface('#373939'),gold=surface('#bc8947',{metalness:.6}),white=surface('#efe8d5'),red=surface('#a64f31'),black=surface('#353736'),glass=surface('#d29b36',{metalness:.65,roughness:.22});
function rover(){
  const root=new T.Group(),wheels=[],fenders=[];
  box(root,gold,0,.57,0,1.42,.16,2.65);
  for(const x of [-.86,.86])for(const z of [-.99,1.05]){
    const carrier=new T.Group();carrier.position.set(x,.41,z);root.add(carrier);
    const wheel=mesh(carrier,new T.TorusGeometry(.295,.105,10,24),rubber);wheel.rotation.y=Math.PI/2;
    for(let n=0;n<10;n++){const a=n*Math.PI/10;rod(carrier,steel,[0,.30*Math.cos(a),.30*Math.sin(a)],[0,-.30*Math.cos(a),-.30*Math.sin(a)],.016);}
    rod(root,steel,[x*.56,.63,z*.65],[x,.4,z],.042);
    const cover=mesh(root,new T.CylinderGeometry(.47,.47,.3,20,1,true,0,Math.PI*.8),red,x,.43,z);
    cover.rotation.z=Math.PI/2;cover.rotation.x=-.30;wheels.push(carrier);fenders.push(cover);
  }
  for(const x of [-.36,.36]){
    box(root,white,x,.78,.1,.55,.12,.55);const back=box(root,white,x,1.03,.40,.55,.58,.095);back.rotation.x=.14;
    for(const dx of [-.27,.27])rod(root,steel,[x+dx,.73,-.14],[x+dx,1.3,.44],.023);
  }
  box(root,black,0,1.04,-.50,.7,.33,.12);for(const x of [-.19,0,.19])mesh(root,new T.SphereGeometry(.056,9,6),white,x,1.08,-.419);
  box(root,gold,0,.78,.97,1.1,.3,.56);rod(root,steel,[-.55,.65,-.92],[-.55,1.86,-.92],.034);
  const dish=mesh(root,new T.SphereGeometry(.44,18,7,0,Math.PI*2,0,.88),gold,-.55,1.77,-.92);dish.rotation.x=.87;
  for(let i=0;i<2;i++)box(root,white,.27+i*.26,.94,.95,.22,.38,.32);
  const patch=box(root,surface('#d2b985'),.88,.83,1.16,.43,.07,.57);
  const lines=surface('#4e4b3e');for(const z of [1.04,1.32])box(patch,lines,0,.042,z-1.16,.44,.014,.025);
  const riders=new T.Group();root.add(riders);
  for(const x of [-.36,.36]){
    const suit=mesh(riders,new T.CapsuleGeometry(.21,.32,5,10),white,x,1.08,.13);
    mesh(riders,new T.SphereGeometry(.213,14,11),white,x,1.58,.11);
    const visor=mesh(riders,new T.SphereGeometry(.194,14,10),glass,x,1.585,.045);visor.scale.z=.72;
    for(const side of [-1,1]){rod(suit,white,[side*.17,.13,-.07],[side*.26,-.05,-.29],.078);rod(riders,white,[x+side*.13,.85,.08],[x+side*.13,.81,-.34],.09);}
    box(riders,white,x,1.14,.34,.40,.47,.22);
  }
  shadow(root,3,4.4);return {root,wheels,rear:fenders[3],patch,riders};
}
function bench(scene,at,type){
  const g=new T.Group();place(scene,g,...sites[at],height);
  if(type==='orange'){
    for(let i=0;i<80;i++){const radius=.13+rng()*.6;
      const clod=mesh(g,new T.IcosahedronGeometry(radius,0),surface(i%4?'#b55b25':'#df8640'),(rng()-.5)*4,.12,(rng()-.5)*6);clod.scale.y=.4;}
  }else if(type==='block'){
    const b=mesh(g,new T.DodecahedronGeometry(2.8,0),surface('#787369'));b.scale.set(1.5,.77,1);b.rotation.z=.26;
    for(let i=0;i<24;i++)mesh(g,new T.IcosahedronGeometry(.12+rng()*.15,0),white,(rng()-.5)*3,.4+rng()*1.1,1.7+rng()*.45);
  }else{
    box(g,type==='cases'?gold:steel,0,.42,0,1.1,.64,.79);
    for(const x of [-.48,.48])rod(g,black,[x,.05,-.44],[x,.89,-.44],.036);
    if(type==='array'){for(let i=0;i<3;i++)box(g,black,-1.8+i*.46,.60,.1,.43,.055,1.3);rod(g,white,[0,.76,0],[0,2.6,0],.03);}
  }return g;
}
function rockField(scene,rock){
  const patches=new Map(),stations=Object.values(sites);
  for(let i=0;i<14000;i++){
    const x=rng()*4400-2600,z=rng()*2800-1300,s=.15+rng()**3*3.2;
    if(s>1.2&&stations.every(([sx,sz])=>Math.hypot(x-sx,z-sz)>13))boulders.add(x,z,s*.68);
    const tile=Math.floor(x/200)+','+Math.floor(z/200);
    if(!patches.has(tile))patches.set(tile,[]);
    patches.get(tile).push([x,height(x,z)-.1*s,z,s,rng()*6.28]);
  }
  const batches=Array.from(patches.values(),placements=>{
    const batch=scatter(scene,rock.geometry,rock.material,placements);
    batch.computeBoundingSphere();
    return batch;
  });
  return camera=>{
    for(const batch of batches){
      const {center,radius}=batch.boundingSphere;
      batch.visible=camera.position.distanceToSquared(center)<(700+radius)**2;
    }
  };
}
export async function moon(){
  const {renderer,scene,camera}=viewport();scene.background=new T.Color('#080b12');scene.fog=new T.FogExp2('#767071',.000065);
  scene.add(new T.HemisphereLight('#f7f4ed','#797678',1.35));
  const sun=new T.DirectionalLight('#fff3d9',2.65);sun.position.set(-150,75,-70);scene.add(sun);
  ground(scene,3100,420,height,(c,x,z,h)=>{
    const grain=.50+.20*Math.sin(x*.027+Math.sin(z*.019))+.12*Math.cos((z-x)*.095)+.10*Math.sin(z*.22);
    c.setHSL(.09,.055,clamp(.39+grain*.19+h*.002,.28,.72));
  },17);
  mountainRing(scene,3200,['#77716e','#9d9691','#a29e9b','#777476'],-35,1100,359);
  const earth=mesh(scene,new T.SphereGeometry(38,32,20),surface('#578abc'),-1200,920,-2700);
  for(let i=0;i<26;i++){const lat=rng()*Math.PI,lng=rng()*6.28,r=38;
    const cloud=mesh(earth,new T.IcosahedronGeometry(4+rng()*4,0),white,r*Math.sin(lat)*Math.cos(lng),r*Math.cos(lat),r*Math.sin(lat)*Math.sin(lng));cloud.scale.y=.44;}
  const [rock,hero,jack]=await Promise.all([
    new GLTFLoader().loadAsync(new URL('./moon-rock.glb',import.meta.url).href),
    actor('eva-engineer',1.83),actor('astronaut-imani',1.82)
  ]);
  const lander=challenger();lander.rotation.y=.8+Math.PI;place(scene,lander,-7,-4,height);
  for(const rig of [hero,jack])rig.model.traverse(n=>{
    if(n.isMesh&&/space_suit|space_boots|space_gloves|helmet_shell/i.test(n.name)&&!Array.isArray(n.material)){
      n.material=n.material.clone();n.material.color.set('#dddace');
    }
  });
  hero.model.traverse(n=>{if(/wrench|hand_radio|tool_belt/.test(n.name))n.visible=false;});scene.add(hero.model,jack.model);
  const vehicle=rover();scene.add(vehicle.root);
  const showRocks=rockField(scene,rock.scene.getObjectByProperty('isMesh',true));
  bench(scene,'alsep','array');bench(scene,'maps','cases');bench(scene,'clamps','cases');bench(scene,'mast','array');
  for(const at of ['stenoRock','block','blocks'])bench(scene,at,'block');
  bench(scene,'orange','orange');bench(scene,'scarp','block');
  const target=mesh(scene,new T.TorusGeometry(1.4,.038,8,46),new T.MeshBasicMaterial({color:'#ffcf74'}));
  target.rotation.x=Math.PI/2;
  const dustN=150,dustPos=new Float32Array(dustN*3),dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.BufferAttribute(dustPos,3));
  const dust=new T.Points(dustGeo,new T.PointsMaterial({color:'#ada79c',size:.088,transparent:true,opacity:.7}));dust.frustumCulled=false;scene.add(dust);
  let t=0,walkTime=0;
  return {render(s,dt,mode,goal){
    t+=dt;const moving=Math.abs(s.speed)>.12;const seated=s.driving||mode==='title';
    const rx=mode==='title'?4:s.rx,rz=mode==='title'?3:s.rz;
    const roverGround=height(rx,rz);
    vehicle.root.position.set(rx,roverGround+.12,rz);vehicle.root.rotation.order='YXZ';vehicle.root.rotation.y=-s.ry;
    const dx=Math.sin(s.ry),dz=-Math.cos(s.ry);
    vehicle.root.rotation.x=clamp(Math.atan((height(rx+dx,rz+dz)-height(rx-dx,rz-dz))/2),-.35,.35);
    vehicle.riders.visible=seated;vehicle.rear.visible=s.fender==='taped'||s.fender==='broken';vehicle.patch.visible=s.fender==='maps';
    for(const w of vehicle.wheels)if(seated)w.rotation.x-=s.speed*dt*2.5;
    hero.model.visible=!seated;jack.model.visible=!seated;
    hero.model.position.set(s.x,height(s.x,s.z),s.z);hero.model.rotation.y=Math.PI-s.yaw;
    if(!seated){hero.play(moving?'walk':'idle');hero.update(dt);}
    const briefing=s.chapter===0&&s.step===0;
    const nearShorty=s.chapter===4&&s.step>=1&&s.step<=3;
    const jx=briefing?sites.crew[0]:nearShorty?sites.orange[0]-1.7:s.x+2.4*Math.cos(s.yaw)-1.6*Math.sin(s.yaw),jz=briefing?sites.crew[1]:nearShorty?sites.orange[1]-1.1:s.z+2.4*Math.sin(s.yaw)+1.6*Math.cos(s.yaw);
    const jDist=Math.hypot(jx-jack.model.position.x,jz-jack.model.position.z);
    const follow=seated||jDist>45?1:Math.min(1,dt*2.2);
    jack.model.position.lerp(V(jx,height(jx,jz),jz),follow);jack.model.rotation.y=jDist>1?Math.atan2(jx-jack.model.position.x,jz-jack.model.position.z):Math.atan2(s.x-jx,s.z-jz);
    if(!seated){jack.play(jDist>1?'walk':nearShorty?'point':'idle');jack.update(dt);}
    dust.visible=seated&&moving&&mode==='play';if(dust.visible){
      const high=s.fender==='lost'?2.7:.52;
      for(let i=0;i<dustN;i++){const u=(t*1.4+i*.117)%1,side=i%3?1:-1,back=1+u*Math.min(4,Math.abs(s.speed));
        dustPos[i*3]=rx-dx*back+Math.cos(s.ry)*(side*(.83+u*.60)+.13*Math.sin(i*4));
        dustPos[i*3+1]=roverGround+.32+4*u*(1-u)*high*(.45+.55*(i%13)/12);
        dustPos[i*3+2]=rz-dz*back+Math.sin(s.ry)*side*(.83+u*.6);}
      dustGeo.attributes.position.needsUpdate=true;
    }
    target.visible=mode==='play'&&!!goal; if(goal){target.position.set(goal[0],height(...goal)+.21,goal[1]);target.scale.setScalar(1+.08*Math.sin(t*3));}
    if(mode==='title'){
      const a=.68+.035*Math.sin(t*.12);camera.position.set(rx+Math.cos(a)*8.9,height(rx,rz)+2.25,rz+Math.sin(a)*9.5);camera.lookAt(rx-1.7,height(rx,rz)+1.35,rz+.95);
    }else if(mode==='film'||mode==='end'){
      const a=t*.055;camera.position.set(s.x+Math.cos(a)*10,height(s.x,s.z)+3.7,s.z+Math.sin(a)*10);camera.lookAt(s.x,height(s.x,s.z)+1.1,s.z);
    }else{walkTime+=dt*Math.abs(s.speed);chase(camera,s.x,s.z,s.yaw,height,seated?7.6:4.6,seated?3.65:2.7,dt,1.3);}
    showRocks(camera);
    renderer.render(scene,camera);
  }};
}
