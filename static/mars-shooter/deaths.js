import * as THREE from 'three';

// Shared shell fragments and an irregular, terrain-conforming blood decal.
// Nothing here adds lights or creates a new material variant during combat.
export function createDeaths(scene){
 const fragments=[],splats=[],warmup=new THREE.Group();
 const shell=new THREE.IcosahedronGeometry(1,0),leg=new THREE.ConeGeometry(.38,2.4,5);
 const colors={small:0x672f1d,medium:0x26342e,large:0x863d28,worm:0x4d4130,spitter:0x48551f,boss:0x713a2f};
 const materials=Object.fromEntries(Object.entries(colors).map(([type,color])=>[type,new THREE.MeshStandardMaterial({color,roughness:.46,metalness:.3,flatShading:true})]));
 for(const material of Object.values(materials))warmup.add(new THREE.Mesh(shell,material),new THREE.Mesh(leg,material));
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
 let seed=731;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 // Thin radial streaks, a ragged pool and satellite droplets, all in one texture.
 ctx.fillStyle='#679c12';
 for(let i=0;i<36;i++){const a=random()*Math.PI*2,r=65+random()*54,w=2+random()*5;ctx.beginPath();ctx.moveTo(128+Math.cos(a-.06)*35,128+Math.sin(a-.06)*35);ctx.lineTo(128+Math.cos(a)*r,128+Math.sin(a)*r);ctx.lineTo(128+Math.cos(a+.06)*35,128+Math.sin(a+.06)*35);ctx.fill();ctx.beginPath();ctx.ellipse(128+Math.cos(a)*r,128+Math.sin(a)*r,w,w*.6,a,0,Math.PI*2);ctx.fill();}
 const gradient=ctx.createRadialGradient(117,119,10,128,128,91);gradient.addColorStop(0,'#29490b');gradient.addColorStop(.55,'#48730c');gradient.addColorStop(1,'#90ba1c');ctx.fillStyle=gradient;ctx.beginPath();
 for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,r=60+random()*27;ctx.lineTo(128+Math.cos(a)*r,128+Math.sin(a)*r);}ctx.closePath();ctx.fill();
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 const bloodMaterial=new THREE.MeshBasicMaterial({map,transparent:true,opacity:.92,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 warmup.add(new THREE.Mesh(new THREE.PlaneGeometry(1,1),bloodMaterial));
 function splat(position,terrain,radius){
  const geometry=new THREE.PlaneGeometry(radius*2,radius*2,12,12);geometry.rotateX(-Math.PI/2);geometry.rotateY(Math.random()*Math.PI*2);
  const points=geometry.attributes.position;
  for(let i=0;i<points.count;i++)points.setY(i,terrain.heightAt(position.x+points.getX(i),position.z+points.getZ(i))+.035-position.y);
  points.needsUpdate=true;geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,bloodMaterial);mesh.position.copy(position);scene.add(mesh);splats.push(mesh);
  if(splats.length>64){const old=splats.shift();scene.remove(old);old.geometry.dispose();}
 }
 function burst(enemy,terrain){
  const center=enemy.aimPoint(),scale=THREE.MathUtils.clamp(Math.sqrt(enemy.span/3),.8,2),count=enemy.type==='boss'?32:enemy.type==='small'?14:20;
  const anchors=enemy.hitPoints();for(const foot of enemy.feet)anchors.push(foot.getWorldPosition(new THREE.Vector3()));
  for(let i=0;i<count;i++){
   const elongated=i%3===0,mesh=new THREE.Mesh(elongated?leg:shell,materials[enemy.type]||materials.medium);
   mesh.position.copy(i<anchors.length?anchors[i]:center);mesh.position.add(new THREE.Vector3((Math.random()-.5)*scale,.15+Math.random()*scale*.35,(Math.random()-.5)*scale));
   const size=(.12+Math.random()*.18)*scale;mesh.scale.set(size,elongated?size*1.6:size*.55,size);mesh.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);
   const outward=mesh.position.clone().sub(center);outward.y=0;if(outward.lengthSq()<.01)outward.set(Math.random()-.5,0,Math.random()-.5);outward.normalize().multiplyScalar((2+Math.random()*4)*scale);outward.y=(3+Math.random()*4)*scale;
   const ttl=1.1+Math.random()*.7;scene.add(mesh);fragments.push({mesh,velocity:outward,spin:new THREE.Vector3(Math.random()*10-5,Math.random()*10-5,Math.random()*10-5),scale:mesh.scale.clone(),ttl,bounced:false});
  }
  while(fragments.length>160)scene.remove(fragments.shift().mesh);
  splat(enemy.root.position,terrain,enemy.type==='boss'?3.8:enemy.type==='worm'?2.4:scale*1.65);
 }
 function update(dt,terrain){
  for(let i=fragments.length-1;i>=0;i--){const p=fragments[i];p.ttl-=dt;p.velocity.y-=13*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=p.spin.x*dt;p.mesh.rotation.y+=p.spin.y*dt;p.mesh.rotation.z+=p.spin.z*dt;
   const floor=terrain.heightAt(p.mesh.position.x,p.mesh.position.z)+.04;
   if(p.mesh.position.y<floor){p.mesh.position.y=floor;if(!p.bounced){p.velocity.y=Math.abs(p.velocity.y)*.22;p.velocity.x*=.35;p.velocity.z*=.35;p.bounced=true;}else{p.velocity.set(0,0,0);p.spin.multiplyScalar(.25);}}
   p.mesh.scale.copy(p.scale).multiplyScalar(Math.min(1,Math.max(0,p.ttl/.4)));
   if(p.ttl<=0){scene.remove(p.mesh);fragments.splice(i,1);}
  }
 }
 return {burst,update,warmup,fragments,splats};
}
