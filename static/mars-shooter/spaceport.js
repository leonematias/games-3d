import {landmarks} from './bastion-details.js';
import {dressDropship} from './rescue-craft.js';
import {emplacement,outfitCrew} from './emplacements.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const INNER=18, OUTER=22, HEIGHT=5, RAMP_FOOT=8;
export const sides=['NORTH','EAST','SOUTH','WEST'];
export function lanePoint(side,offset,radius){
  return [[offset,-radius],[radius,offset],[-offset,radius],[-radius,-offset]][side];
}

export async function buildSpaceport(scene,terrain,environment){
  const floor=terrain.heightAt(0,0),deck=floor+HEIGHT;
  const root=new THREE.Group(),ship=new THREE.Group(),turrets=[],lockers=[];
  scene.add(root,ship);root.position.y=floor;
  const armor=new THREE.MeshStandardMaterial({color:0x76868c,metalness:.56,roughness:.52});
  const dark=new THREE.MeshStandardMaterial({color:0x283740,metalness:.52,roughness:.6});
  const white=new THREE.MeshStandardMaterial({color:0xd7d7c3,metalness:.3,roughness:.56});
  const amber=new THREE.MeshBasicMaterial({color:0xffba53}),cyan=new THREE.MeshBasicMaterial({color:0x82f8ea});
  function mesh(parent,geo,material,x,y,z){
    const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=!material.isMeshBasicMaterial;m.receiveShadow=true;parent.add(m);return m;
  }
  for(const m of [armor,dark,white]){m.envMap=environment;m.envMapIntensity=.65;}
  function box(parent,mat,x,y,z,w,h,d){return mesh(parent,new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
  function label(parent,str,x,y,z,w,h){
    const c=document.createElement('canvas');c.width=512;c.height=128;
    const ctx=c.getContext('2d');ctx.fillStyle='#14232e';ctx.fillRect(0,0,512,128);ctx.fillStyle='#b5f9ec';ctx.textAlign='center';ctx.font='bold 59px monospace';ctx.fillText(str,256,86);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
    return mesh(parent,new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map}),x,y,z);
  }
  // Bake repeated armor plates and running lights into one draw per material.
  function batch(parent){
    const groups=new Map();
    for(const child of [...parent.children]){
      if(!child.isMesh||child.userData.moving)continue;
      child.updateMatrix();child.geometry.applyMatrix4(child.matrix);
      const list=groups.get(child.material)||[];list.push(child.geometry);groups.set(child.material,list);parent.remove(child);
    }
    for(const [mat,parts] of groups){mesh(parent,mergeGeometries(parts),mat,0,0,0);for(const p of parts)p.dispose();}
  }
  for(let i=0;i<4;i++){
    const side=new THREE.Group();side.rotation.y=-i*Math.PI/2;root.add(side);
    box(side,dark,0,2.5,-20,44,5,4);
    for(let k=-5;k<=5;k++){
      const x=k*4;
      box(side,armor,x,2.5,-22,3.88,4.8,.24);
      box(side,white,x,5.19,-21.85,3.84,.38,.34);
      box(side,amber,x,3.9,-22.14,2.65,.09,.05);
      box(side,armor,x,2.5,-18,3.88,4.9,.1);
      box(side,dark,x,1.07,-17.91,3.88,.38,.12);
      box(side,amber,x-1.22,4.46,-17.88,.85,.09,.15);
      const rib=box(side,dark,x+1.82,2.25,-17.82,.21,4.35,.31);rib.rotation.z=.06;
      box(side,armor,x,5.025,-20,3.88,.05,3.45);
    }
    // The top of this inclined slab follows exactly the support plane below.
    const incline=Math.atan2(HEIGHT,INNER-RAMP_FOOT),length=Math.hypot(HEIGHT,INNER-RAMP_FOOT);
    const ramp=box(side,armor,0,2.5-.09,-13,5,.2,length);ramp.rotation.x=incline;
    for(const x of [-2.35,2.35]){const rail=box(side,cyan,x,2.55,-13,.10,.09,length);rail.rotation.x=incline;}
    for(let k=1;k<10;k++)box(side,dark,0,k*.5+.035,-8-k,4.4,.06,.14);
    for(const x of [-1.95,1.95])for(const k of [3,7]){
      box(side,dark,x,k*.24,-8-k,.32,k*.48,.47);
    }
    label(side,sides[i]+' / 04',6.3,3.2,-17.89,6.4,1.6);
    box(side,dark,20,2.48,-20,7,4.96,7);
    const [tx,tz]=lanePoint(i,7,20.5);turrets.push(emplacement(scene,tx,deck,tz,i));
    landmarks(side,i,{mesh,box,armor,dark,white,cyan,amber});
    batch(side);
  }
  await outfitCrew(turrets,environment);
  const intel=new THREE.Vector3(-10,floor,-5);
  mesh(root,new THREE.CylinderGeometry(1.3,1.55,.42,8),armor,intel.x,.21,intel.z);
  mesh(root,new THREE.CylinderGeometry(.78,1.03,1.3,8),dark,intel.x,1,intel.z);
  for(const y of [.65,1.04,1.44])mesh(root,new THREE.CylinderGeometry(.95,.95,.10,8),cyan,intel.x,y,intel.z);
  const beacon=cyan.clone();
  const crystal=mesh(root,new THREE.OctahedronGeometry(.77),beacon,intel.x,2.22,intel.z);crystal.scale.y=1.38;
  label(root,'INTEL VAULT',intel.x,1.23,intel.z+1.02,2.3,.56);
  mesh(root,new THREE.CylinderGeometry(7.8,8,.16,12),dark,0,0,0);
  for(let i=0;i<12;i++){const angle=i*Math.PI/6;const lamp=box(root,cyan,Math.sin(angle)*7.4,.12,Math.cos(angle)*7.4,1.7,.07,.15);lamp.rotation.y=angle;}
  label(root,'PAD  04',0,.11,0,6,1.5).rotation.x=-Math.PI/2;
  for(const [x,z,turn] of [[-6,-10,0],[6,10,Math.PI]]){
    const locker=new THREE.Group();locker.position.set(x,0,z);locker.rotation.y=turn;root.add(locker);
    box(locker,dark,0,.13,0,4,.26,1.5);
    box(locker,armor,0,.65,-.68,4,1.3,.15);
    for(const end of [-1.94,1.94])box(locker,armor,end,.58,0,.12,1.16,1.5);
    const lid=new THREE.Group();lid.position.set(0,1.17,-.68);locker.add(lid);
    box(lid,dark,0,.05,.68,4,.12,1.5);box(lid,amber,0,.13,.68,2.2,.055,.13);
    for(let j=0;j<4;j++){const pack=box(locker,j%2?armor:dark,2.32,.31+j*.22,.1,.72,.2,.65);box(locker,amber,2.32,pack.position.y,.44,.23,.08,.035);}
    label(locker,'SUIT / AMMO',0,.87,-.58,2.2,.5);batch(lid);batch(locker);lockers.push(lid);
  }
  function updateLockers(available,dt){
    for(const lid of lockers)lid.rotation.x=THREE.MathUtils.damp(lid.rotation.x,available?-1.65:0,5,dt);
  }
  dressDropship(ship,{mesh,box,label,armor,dark,white,cyan,environment});
  const hatch=new THREE.Group();hatch.name="CargoRamp";hatch.position.set(0,.3,3.5);ship.add(hatch);
  box(hatch,armor,0,-.06,1.7,4,.12,3.4);
  for(const x of [-1.78,1.78])box(hatch,cyan,x,.015,1.7,.12,.035,3.25);
  for(let i=0;i<9;i++)box(hatch,dark,0,.012,.22+i*.36,3.32,.035,.11);
  batch(hatch);batch(ship);ship.visible=false;
  const wash=mesh(root,new THREE.RingGeometry(.88,1,48),new THREE.MeshBasicMaterial({color:0xc99370,transparent:true,opacity:0,depthWrite:false}),0,.17,0);
  wash.rotation.x=-Math.PI/2;
  const footprint=mesh(root,new THREE.CircleGeometry(1,40),new THREE.MeshBasicMaterial({color:0x231c20,transparent:true,opacity:.23,depthWrite:false}),0,0,0);
  footprint.rotation.x=-Math.PI/2;footprint.scale.set(3.4,5.7,1);
  const lights=[-1,1].map(sign=>{
    const light=mesh(ship,new THREE.ConeGeometry(1.4,7,24,1,true),new THREE.MeshBasicMaterial({color:0xffe3aa,transparent:true,opacity:.075,depthWrite:false,blending:THREE.AdditiveBlending}),sign*2.1,-2.8,-2);
    light.rotation.z=sign*.23;return light;
  });
  let boarding=false;
  function arrival(t){
    ship.visible=t>=270;
    const u=THREE.MathUtils.smoothstep(t,270,300),down=THREE.MathUtils.smoothstep(t,300,305);
    ship.position.set(30*(1-u),floor+55*(1-u)+9*(1-down),-86*(1-u));
    hatch.rotation.x=THREE.MathUtils.lerp(-Math.PI/2,.085,THREE.MathUtils.smoothstep(t,304,307));
    footprint.visible=ship.visible;footprint.position.set(ship.position.x,surface(ship.position.x,ship.position.z)-floor+.19,ship.position.z);
    for(const light of lights)light.visible=t<306;
    boarding=t>=307;
    wash.scale.setScalar(2+((t*.65)%1)*9);wash.material.opacity=t>=300&&t<307?.28*(1-(t*.65)%1):0;
  }
  function surface(x,z){
    const a=Math.abs(x),b=Math.abs(z),radius=Math.max(a,b);
    if((radius>=INNER&&radius<=OUTER)||(a>=16.5&&b>=16.5&&radius<=23.5))return deck;
    if(radius>=RAMP_FOOT&&radius<INNER&&Math.min(a,b)<=2.5)return floor+(radius-RAMP_FOOT)*.5;
    if(boarding&&a<=2.2&&z>=-3.5&&z<=6.9)return floor+(z<=3.5?.3:Math.max(0,.3-(z-3.5)*.085));
    return terrain.heightAt(x,z);
  }
  function hull(x,z,r){return boarding&&((Math.abs(Math.abs(x)-2.18)<.14+r&&Math.abs(z)<3.5+r)||(Math.abs(x)<2.2+r&&Math.abs(z+3.45)<.25+r));}
  function walkable(x,z,r=.4){return Math.max(Math.abs(x),Math.abs(z))<=OUTER-.18||Math.min(Math.abs(x),Math.abs(z))>16.8&&Math.max(Math.abs(x),Math.abs(z))<23.3;}
  function solidAt(p,r=0){return p.y<=surface(p.x,p.z)+r||hull(p.x,p.z,r)&&p.y<=floor+3.2+r;}
  return {beacon,intel,root,ship,hatch,turrets,floor,deck,surface,solidAt,arrival,updateLockers,walkable:(x,z,r)=>walkable(x,z,r)&&!hull(x,z,r)};
}
