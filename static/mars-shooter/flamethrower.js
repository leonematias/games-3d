import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function createFlamethrower(){
 const gun=new THREE.Group();gun.name='F9Flamethrower';
 const steel=new THREE.MeshStandardMaterial({color:0x67767a,metalness:.85,roughness:.32}),dark=new THREE.MeshStandardMaterial({color:0x18252b,metalness:.6,roughness:.42}),orange=new THREE.MeshStandardMaterial({color:0xbc5129,metalness:.55,roughness:.47}),brass=new THREE.MeshStandardMaterial({color:0xb88a4b,metalness:.8,roughness:.3}),rubber=new THREE.MeshStandardMaterial({color:0x242c2b,roughness:.9});
 const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);gun.add(m);return m;};
 const box=(w,h,d,x,y,z,mat)=>add(new RoundedBoxGeometry(w,h,d,2,.01),mat,x,y,z);
 const tube=(r,len,x,y,z,mat,axis='z')=>{const m=add(new THREE.CylinderGeometry(r,r,len,24),mat,x,y,z);if(axis==='z')m.rotation.x=Math.PI/2;return m;};
 box(.24,.21,.5,0,0,0,dark);box(.25,.075,.46,0,.12,-.03,steel);
 tube(.055,.72,0,.025,-.58,steel);tube(.10,.12,0,.025,-.96,dark);tube(.088,.025,0,.025,-1.025,brass);
 const nozzle=add(new THREE.TorusGeometry(.064,.015,8,32),steel,0,.025,-1.045);tube(.048,.008,0,.025,-1.03,dark);
 for(let i=0;i<9;i++){tube(.078,.014,0,.025,-.4-i*.052,i%2?dark:steel);}
 for(const side of [-1,1]){
  tube(.10,.38,side*.16,-.17,.02,orange,'y');tube(.107,.035,side*.16,-.35,.02,dark,'y');tube(.107,.035,side*.16,.01,.02,steel,'y');
  tube(.033,.08,side*.16,.06,.02,brass,'y');box(.03,.15,.04,side*.26,-.17,.04,steel);
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.16,.08,.02),new THREE.Vector3(side*.19,.15,-.18),new THREE.Vector3(side*.09,.05,-.6)]);add(new THREE.TubeGeometry(curve,16,.017,8,false),rubber,0,0,0);
  for(const z of [-.15,.18])tube(.015,.012,side*.13,.015,z,brass);
 }
 box(.11,.22,.12,.02,-.19,.24,rubber).rotation.x=-.2;box(.12,.18,.13,0,-.17,-.47,rubber);
 box(.09,.06,.3,0,.08,.37,dark);box(.15,.24,.05,0,.02,.53,steel);
 // Pilot igniter and blue flame, separate from the main burn stream.
 tube(.013,.16,.075,-.055,-.93,brass);
 const pilot=add(new THREE.ConeGeometry(.015,.06,8),new THREE.MeshBasicMaterial({color:0x7fcaff}),.075,-.055,-1.04);pilot.rotation.x=-Math.PI/2;
 // Foreground gloves and sleeves.
 box(.10,.09,.13,.03,-.22,.24,rubber);box(.11,.09,.14,-.07,-.19,-.44,rubber);
 for(const side of [-1,1]){const arm=tube(.065,.4,side*.15,-.34,.26,side===1?dark:rubber);arm.rotation.x=.8;arm.rotation.z=side*.3;}
 const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=64;const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#162329';ctx.fillRect(0,0,256,64);ctx.fillStyle='#ffb76c';ctx.font='bold 30px monospace';ctx.textAlign='center';ctx.fillText('F–9 / IGNIS',128,44);const map=new THREE.CanvasTexture(labelCanvas);map.colorSpace=THREE.SRGBColorSpace;
 add(new THREE.PlaneGeometry(.18,.045),new THREE.MeshBasicMaterial({map}),0,.045,.257);
 const groups=new Map();gun.updateMatrixWorld(true);
 for(const child of [...gun.children]){const g=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();g.applyMatrix4(child.matrix);const list=groups.get(child.material)||[];list.push(g);groups.set(child.material,list);gun.remove(child);child.geometry.dispose();}
 for(const [mat,list] of groups){const merged=mergeGeometries(list,false);list.forEach(g=>g.dispose());const m=new THREE.Mesh(merged,mat);m.frustumCulled=false;gun.add(m);}
 const muzzle=new THREE.Object3D();muzzle.position.set(0,.025,-1.07);gun.add(muzzle);
 return {gun,muzzle};
}

export function createFlame({scene,world,enemies,player,damageEnemy,sounds}){
 const particles=[],c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');
 const gradient=ctx.createRadialGradient(32,32,2,32,32,31);gradient.addColorStop(0,'rgba(255,225,150,.6)');gradient.addColorStop(.3,'rgba(255,158,30,.4)');gradient.addColorStop(.62,'rgba(240,55,5,.18)');gradient.addColorStop(1,'rgba(120,8,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
 const flameMaterial=new THREE.SpriteMaterial({map:texture,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,color:0xffffff});
 const light=new THREE.PointLight(0xff8a31,0,19,1.5);scene.add(light);let sound=0,emit=0;
 function update(dt,firing,origin,direction){
  sound-=dt;light.intensity=firing?8+Math.sin(performance.now()*.04)*2:0;
  if(firing){
   const start=world.clearLine(player,origin,0)?origin:player;
   light.position.copy(start).addScaledVector(direction,3);
   if(sound<=0){sounds.flame();sound=.12;}
   emit+=dt*110;
   while(emit>=1){emit--;const sprite=new THREE.Sprite(flameMaterial.clone());sprite.position.copy(start);sprite.material.rotation=Math.random()*6.28;sprite.scale.set(.22,.35,1);scene.add(sprite);
    const velocity=direction.clone().multiplyScalar(23).add(new THREE.Vector3((Math.random()-.5)*2.8,(Math.random()-.5)*2.2,(Math.random()-.5)*2.8));particles.push({sprite,velocity,age:0});
   }
   for(const e of enemies){if(!e.active||e.hp<=0)continue;for(const point of e.hitPoints()){const delta=point.clone().sub(player),along=delta.dot(direction);if(along<0||along>13)continue;const off=delta.addScaledVector(direction,-along).length();if(off<.6+along*.22+e.hitRadius&&world.clearLine(player,point)){damageEnemy(e,170*dt,point);e.burn=2;break;}}}
  }else emit=0;
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;p.velocity.y+=dt*2;p.sprite.position.addScaledVector(p.velocity,dt);const size=.2+p.age*5;p.sprite.scale.set(size,size*1.3,1);p.sprite.material.opacity=Math.max(0,(1-p.age/.6)*.55);p.sprite.material.rotation+=dt*2;
   if(p.age>.6||world.isSolid(p.sprite.position,.04)){scene.remove(p.sprite);p.sprite.material.dispose();particles.splice(i,1);}}
 }
 const warmup=new THREE.Sprite(flameMaterial);
 return {update,particles,warmup};
}
