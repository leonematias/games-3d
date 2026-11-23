import * as THREE from 'three';
import {createBlastEffects} from './blast-effects.js';

// Swept impact projectiles share the same heightfield and enemy aim volumes as bullets.
export function createGrenades({scene,world,enemies,player,damageEnemy,hurt,sounds,fx,onExplosion}) {
  const projectiles=[];
  const shellGeometry=new THREE.CapsuleGeometry(.09,.16,4,8);
  const shellMaterial=new THREE.MeshStandardMaterial({color:0x687847,metalness:.6,roughness:.3,emissive:0xfca746,emissiveIntensity:.35});
  const effects=createBlastEffects(scene,world.terrain,world.glow);
  const glowMaterial=new THREE.SpriteMaterial({map:world.glow,color:0xffc168,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  const {warmup,blasts}=effects;
  warmup.add(new THREE.Mesh(shellGeometry,shellMaterial));
  let lastImpact=null;
  function launch(origin,direction){
    const mesh=new THREE.Mesh(shellGeometry,shellMaterial);mesh.position.copy(origin);scene.add(mesh);
    const glow=new THREE.Sprite(glowMaterial.clone());glow.scale.setScalar(.5);mesh.add(glow);
    const velocity=direction.clone().multiplyScalar(34);
    projectiles.push({mesh,velocity,age:0,glow});
    // The view model can extend into a wall when standing against it.
    const delta=origin.clone().sub(player),steps=Math.max(1,Math.ceil(delta.length()/.12));
    for(let i=0;i<=steps;i++){
      const p=player.clone().addScaledVector(delta,i/steps);
      if((world.isSolid?world.isSolid(p,.12):p.y<=world.terrain.heightAt(p.x,p.z)+.12)){mesh.position.copy(player).addScaledVector(delta,Math.max(0,i-1)/steps);detonate(projectiles.pop(),'terrain');break;}
    }
  }
  function detonate(projectile,kind,direct=null){
    const position=projectile.mesh.position.clone();scene.remove(projectile.mesh);projectile.glow.material.dispose();
    const blastOrigin=position.clone();blastOrigin.y=Math.max(blastOrigin.y,world.terrain.heightAt(position.x,position.z)+.35);
    const hit=[];
    for(const enemy of enemies){
      if(!enemy.active||enemy.hp<=0)continue;
      const aim=enemy.hitPoints().sort((a,b)=>a.distanceToSquared(position)-b.distanceToSquared(position))[0],distance=aim.distanceTo(position);
      if(distance>7.5||(!world.clearLine(blastOrigin,aim,0)&&enemy!==direct))continue;
      const damage=enemy===direct?260:Math.round(260*(1-.65*distance/7.5));
      damageEnemy(enemy,damage,aim);hit.push({index:enemy.index,damage});
    }
    const distance=player.distanceTo(position);
    if(distance<5&&world.clearLine(blastOrigin,player,0))hurt(Math.round(40*(1-distance/5)));
    lastImpact={kind,position:position.toArray(),hit};onExplosion();sounds.explosion();fx.burst(position,36,'spark');
    if(position.y-world.terrain.heightAt(position.x,position.z)<2)fx.stain(position,world.terrain,2.2,0x292019);
    effects.burst(position);
  }
  function update(dt){
    for(let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i];p.age+=dt;
      const steps=Math.max(1,Math.ceil(p.velocity.length()*dt/.12)),sub=dt/steps;
      let kind=null,direct=null;
      for(let n=0;n<steps;n++){
        const before=p.mesh.position.clone();p.velocity.y-=8*sub;p.mesh.position.addScaledVector(p.velocity,sub);
        const pos=p.mesh.position;
        if((world.isSolid?world.isSolid(pos,.12):pos.y<=world.terrain.heightAt(pos.x,pos.z)+.12)){p.mesh.position.copy(before);kind='terrain';break;}
        direct=enemies.find(e=>e.active&&e.hp>0&&e.hitPoints().some(point=>point.distanceTo(pos)<e.hitRadius+.12));
        if(direct){kind='enemy';break;}
      }
      p.mesh.rotation.x+=dt*12;p.mesh.rotation.z+=dt*4;
      if(kind){projectiles.splice(i,1);detonate(p,kind,direct);}
      else if(p.age>8){scene.remove(p.mesh);p.glow.material.dispose();projectiles.splice(i,1);}
    }
    effects.update(dt);
  }
  return {launch,update,projectiles,blasts,warmup,get lastImpact(){return lastImpact;}};
}
