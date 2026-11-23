import * as THREE from 'three';

export function createEscort({world,player,state,fx,sounds,damageEnemy,squad,pose,face}){
  const vale=squad[0];
  let shot=0;
  function distanceTo(object){return Math.hypot(player.x-object.position.x,player.z-object.position.z);}
  function follow(dt){
    const pos=vale.root.position;
    const distance=Math.hypot(player.x-pos.x,player.z-pos.z);
    if(distance<3.8){pose(vale,'idle');face(vale.root,player);return;}
    const delta=player.clone().sub(pos);delta.y=0;delta.normalize();
    const speed=distance>8?8:4.7;
    const step=dt*speed;
    // Slide round station fixtures instead of walking through the dish or habitat.
    for(const turn of [0,.75,-.75,1.45,-1.45]){
      const dx=delta.x*Math.cos(turn)-delta.z*Math.sin(turn),dz=delta.z*Math.cos(turn)+delta.x*Math.sin(turn);
      const x=pos.x+dx*step,z=pos.z+dz*step;
      if(!world.walkable(x,z))continue;
      pos.set(x,world.terrain.heightAt(x,z),z);vale.root.rotation.y=Math.atan2(dx,dz);break;
    }
    pose(vale,speed>5?'run':'walk');
  }
  function cover(dt,target){
    const muzzle=vale.root.position.clone().add(new THREE.Vector3(0,1.35,0));
    if(distanceTo(vale.root)>10)follow(dt);
    else {face(vale.root,target.root.position);pose(vale,'aim');}
    if(state.time>=shot && world.clearLine(muzzle,target.aimPoint())){
      pose(vale,'shoot');fx.trace(muzzle,target.aimPoint());sounds.shot();
      damageEnemy(target,12,target.aimPoint());shot=state.time+1;
    }
  }
  return {follow,cover,distanceTo};
}
