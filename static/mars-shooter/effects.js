import * as THREE from 'three';
import {createDeaths} from './deaths.js';

export function createEffects(scene) {
  const particles=[],marks=[],deaths=createDeaths(scene);
  const geometries={blood:new THREE.IcosahedronGeometry(.055,0),spark:new THREE.BoxGeometry(.022,.022,.16),casing:new THREE.CylinderGeometry(.008,.008,.05,6)};
  const materials={blood:new THREE.MeshStandardMaterial({color:0x85dc18,emissive:0x315600,roughness:.3}),spark:new THREE.MeshBasicMaterial({color:0xffdc78}),casing:new THREE.MeshStandardMaterial({color:0xc3954c,metalness:.75,roughness:.3})};
  function burst(position,count,kind='blood',direction=null) {
    for(let i=0;i<count;i++){
      if(particles.length>=440){const old=particles.shift();scene.remove(old.mesh);}
      const mesh=new THREE.Mesh(geometries[kind],materials[kind]);mesh.position.copy(position);
      const velocity=new THREE.Vector3((Math.random()-.5)*5,Math.random()*4+1,(Math.random()-.5)*5);
      if(direction)velocity.addScaledVector(direction,kind==='spark'?12:3);
      const ttl=kind==='spark'?.15+Math.random()*.12:1+Math.random();
      mesh.scale.setScalar(kind==='blood'?.6+Math.random()*1.9:1);scene.add(mesh);particles.push({mesh,velocity,ttl,kind});
    }
  }
  const stainMaterial=new THREE.MeshBasicMaterial({color:0x567d0f,transparent:true,opacity:.72,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  function stain(position,terrain,size=1,color=0x567d0f) {
    const mesh=new THREE.Mesh(new THREE.CircleGeometry(size,12),stainMaterial.clone());
    mesh.material.color.setHex(color);mesh.rotation.x=-Math.PI/2;mesh.position.set(position.x,terrain.heightAt(position.x,position.z)+.045,position.z);mesh.scale.y=.6+Math.random()*.6;scene.add(mesh);marks.push(mesh);
    if(marks.length>70){const old=marks.shift();scene.remove(old);old.geometry.dispose();old.material.dispose();}
  }
  const tracerGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
  const tracer=new THREE.Line(tracerGeometry,new THREE.LineBasicMaterial({color:0xffd176,transparent:true,opacity:.75}));tracer.visible=false;scene.add(tracer);let tracerLife=0;
  function trace(start,end){const p=tracer.geometry.attributes.position;p.setXYZ(0,start.x,start.y,start.z);p.setXYZ(1,end.x,end.y,end.z);p.needsUpdate=true;tracer.geometry.computeBoundingSphere();tracer.visible=true;tracerLife=.04;}
  function update(dt,terrain){deaths.update(dt,terrain);tracerLife-=dt;tracer.visible=tracerLife>0;for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.ttl-=dt;p.velocity.y-=9*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*8;p.mesh.rotation.z+=dt*3;if(p.ttl<0||p.mesh.position.y<terrain.heightAt(p.mesh.position.x,p.mesh.position.z)){scene.remove(p.mesh);particles.splice(i,1);}}}
  const warmup=new THREE.Group();for(const kind of Object.keys(materials))warmup.add(new THREE.Mesh(geometries[kind],materials[kind]));warmup.add(new THREE.Mesh(new THREE.CircleGeometry(1,12),stainMaterial));
  warmup.add(deaths.warmup);
  function death(enemy,terrain){burst(enemy.aimPoint(),enemy.type==='boss'?90:50,'blood');deaths.burst(enemy,terrain);}
  return {burst,stain,trace,update,particles,warmup,death,deaths};
}
