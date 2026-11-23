import * as THREE from 'three';

export function createBlastEffects(scene,terrain,glowMap){
  const blasts=[],embers=[];
  // Soft overlapping lobes give smoke and flame irregular, volumetric silhouettes.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const context=canvas.getContext('2d');
  for(let i=0;i<28;i++){
    const a=i*2.4,r=10+(i%5)*5,x=64+Math.cos(a)*r,y=64+Math.sin(a)*r;
    const gradient=context.createRadialGradient(x,y,2,x,y,28);
    gradient.addColorStop(0,'rgba(255,255,255,.48)');gradient.addColorStop(.55,'rgba(255,255,255,.3)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    context.fillStyle=gradient;context.fillRect(0,0,128,128);
  }
  const cloud=new THREE.CanvasTexture(canvas);
  const emberGeometry=new THREE.BoxGeometry(.035,.035,.15),emberMaterial=new THREE.MeshBasicMaterial({color:0xffbf51});
  const glowMaterial=new THREE.SpriteMaterial({map:glowMap || cloud,color:0xffc168,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  const fireMaterial=new THREE.SpriteMaterial({map:cloud,color:0xff6a18,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  const smokeMaterial=new THREE.SpriteMaterial({map:cloud,color:0x393632,transparent:true,opacity:0,depthWrite:false});
  const ringMaterial=new THREE.MeshBasicMaterial({color:0xffd391,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false});
  // Permanent light slots: explosions change uniforms, never the shader light count.
  const blastLights=Array.from({length:2},()=>{const light=new THREE.PointLight(0xff9c32,0,24,1.5);scene.add(light);return light;});
  const warmup=new THREE.Group();warmup.add(new THREE.Mesh(emberGeometry,emberMaterial),new THREE.Sprite(glowMaterial),new THREE.Sprite(fireMaterial),new THREE.Sprite(smokeMaterial),new THREE.Mesh(new THREE.RingGeometry(.92,1,48),ringMaterial));
  function burst(position){
    const root=new THREE.Group();root.position.copy(position);scene.add(root);
    const fire=new THREE.Group();root.add(fire);
    for(let i=0;i<8;i++){
      const puff=new THREE.Sprite(fireMaterial.clone());
      puff.material.color.setHex(i%3===0?0xffd076:0xff6a18);const a=i*2.4;puff.position.set(Math.cos(a)*.55,Math.sin(a)*.4+.25,Math.sin(a)*.55);puff.scale.setScalar(1.5);puff.material.rotation=a;fire.add(puff);
    }
    const flash=new THREE.Sprite(glowMaterial.clone());flash.material.color.setHex(0xffe1a2);root.add(flash);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.92,1,48),ringMaterial.clone());ring.rotation.x=-Math.PI/2;ring.position.y=.15;root.add(ring);

    const smoke=[];
    for(let i=0;i<10;i++){
      const puff=new THREE.Sprite(smokeMaterial.clone());
      puff.material.color.setHex(i%2?0x61574b:0x393632);const a=i*2.4,r=.4+Math.random()*1.3;puff.position.set(Math.cos(a)*r,Math.random()*.8,Math.sin(a)*r);root.add(puff);smoke.push(puff);
    }
    blasts.push({root,fire,flash,ring,smoke,age:0});
    if(blasts.length>8)removeBlast(blasts.shift());
    for(let i=0;i<55;i++){
      const mesh=new THREE.Mesh(emberGeometry,emberMaterial);mesh.position.copy(position);scene.add(mesh);
      const velocity=new THREE.Vector3(Math.random()-.5,Math.random()*.8+.2,Math.random()-.5).normalize().multiplyScalar(5+Math.random()*13);
      embers.push({mesh,velocity,ttl:.5+Math.random()*.8});
    }
    while(embers.length>250)scene.remove(embers.shift().mesh);
  }
  function removeBlast(b){scene.remove(b.root);for(const part of [...b.fire.children,b.flash,b.ring,...b.smoke])part.material.dispose();b.ring.geometry.dispose();}
  function update(dt){
    for(let i=blasts.length-1;i>=0;i--){
      const b=blasts[i],t=b.age+=dt;
      b.fire.scale.setScalar(.35+Math.min(t,.5)*6);b.fire.children.forEach((p,j)=>{p.material.opacity=Math.max(0,1-t*(1.8+j*.12));});b.fire.rotation.y+=dt;
      b.flash.scale.setScalar(3+Math.min(t,.3)*28);b.flash.material.opacity=Math.max(0,1-t*3);
      b.ring.scale.setScalar(.4+t*13);b.ring.material.opacity=Math.max(0,.75-t);
      b.smoke.forEach((p,j)=>{p.position.y+=dt*(.7+j*.08);p.scale.setScalar(1.2+t*(2.5+j*.1));p.material.opacity=Math.min(.7,Math.max(0,t-.1)*3)*Math.max(0,1-t/2.7);});
      if(t>2.7){removeBlast(b);blasts.splice(i,1);}
    }
    const lit=blasts.filter(b=>b.age<1/2.8).sort((a,b)=>a.age-b.age);
    blastLights.forEach((light,i)=>{const b=lit[i];light.intensity=b?45*(1-b.age*2.8):0;if(b)light.position.copy(b.root.position);});
    for(let i=embers.length-1;i>=0;i--){const p=embers[i];p.ttl-=dt;p.velocity.y-=7*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*8;if(p.ttl<=0||p.mesh.position.y<=terrain.heightAt(p.mesh.position.x,p.mesh.position.z)){scene.remove(p.mesh);embers.splice(i,1);}}
  }
  return {burst,update,blasts,warmup};
}
