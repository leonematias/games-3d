import * as T from 'three';
import {height} from './land.js';

export function combatEffects(scene){
  // A second arc distinguishes the longer axe tell even in monochrome.
  const arc=new T.RingGeometry(.53,.59,32,1,-Math.PI*.35,Math.PI*1.7);
  arc.rotateX(-Math.PI/2);
  const tells=new T.InstancedMesh(arc,new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide}),16);
  tells.frustumCulled=false;tells.count=0;scene.add(tells);
  const sparks=new T.InstancedMesh(new T.OctahedronGeometry(.045),new T.MeshBasicMaterial({color:0xffffff}),36);
  sparks.frustumCulled=false;sparks.count=0;scene.add(sparks);
  const local=new T.Object3D(),gold=new T.Color(0xffdb86),white=new T.Color(0xedf9ff),amber=new T.Color(0xffa05e);
  const particles=Array.from({length:36},()=>({life:0}));let slot=0;
  function burst(x,z,shield){
    const y=height(x,z)+1.15;
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3+.25;
      Object.assign(particles[slot],{x,y,z,vx:Math.sin(angle)*1.5,vz:Math.cos(angle)*1.5,vy:.7+i%3*.3,life:.24,shield});
      slot=(slot+1)%particles.length;
    }
  }
  function draw(b,dt){
    tells.count=0;sparks.count=0;
    if(b.activeFight)for(const e of b.enemies){
      if(!e.hp||e.wind<=0)continue;
      const heavy=e.variant===1,ratio=e.wind/(heavy?.78:.42);
      for(let i=0;i<(heavy?2:1);i++){
        local.position.set(e.x,height(e.x,e.z)+.1,e.z);
        local.rotation.set(0,e.yaw,0);local.scale.setScalar(.9+i*.26+ratio*.47);local.updateMatrix();
        tells.setMatrixAt(tells.count,local.matrix);tells.setColorAt(tells.count++,heavy?amber:gold);
      }
    }
    for(const p of particles){
      if(p.life<=0)continue;p.life-=dt;p.vy-=dt*4;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      local.position.set(p.x,p.y,p.z);local.rotation.set(.4,0,.4);local.scale.setScalar(Math.max(.1,p.life/.24));
      local.updateMatrix();sparks.setMatrixAt(sparks.count,local.matrix);sparks.setColorAt(sparks.count++,p.shield?white:gold);
    }
    for(const mesh of [sparks,tells]){
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  }
  return {draw,burst};
}
