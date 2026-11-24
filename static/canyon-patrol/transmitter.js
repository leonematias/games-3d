import {receiverMesh,createTuner} from './receiver.js';
import * as THREE from 'three';

export function createTransmitterStop({scene,world,point,driver,soldiers,dialogue,audioState}){
  const panel=point.clone();
  panel.x+=1.5;panel.y=world.terrain.heightAt(panel.x,panel.z);
  const cabinet=new THREE.Group();cabinet.name='Transmitter repair cabinet';cabinet.position.copy(panel);scene.add(cabinet);
  function box(color,w,h,d,x,y,z,lit=false){
    const material=lit?new THREE.MeshBasicMaterial({color}):new THREE.MeshStandardMaterial({color});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);cabinet.add(mesh);return mesh;
  }
  box(0x404648,1.05,1.44,.6,0,.72,0);
  const cartridge=box(0xe7a04b,.45,.22,.32,0,1,.37);
  const lamp=box(0xffad41,.68,.09,.07,0,1.27,.33,true);
  const receiver=receiverMesh();receiver.position.set(0,1.62,0);cabinet.add(receiver);
  const tuner=createTuner(receiver);let strong=false,weak=false,climb=0;
  const vale=soldiers.spawn(0,0);vale.root.visible=false;
  const foot=new THREE.Vector3();
  const stationSide=panel.clone();stationSide.x+=1.4;setGround(stationSide);
  let phase='pending',yaw=0,elapsed=0;
  const range=p=>Math.hypot(foot.x-p.x,foot.z-p.z);
  function setGround(p){p.y=world.terrain.heightAt(p.x,p.z);}
  function stop(){
    driver.state.speed=0;phase='stopped';dialogue.say('drive_fault');
  }
  function interact(){
    if(phase==='stopped'&&dialogue.lineFinished()){
      foot.copy(driver.state.position);
      const side=driver.state.heading+Math.PI/2;
      foot.x+=2.3*Math.sin(side);foot.z+=2.3*Math.cos(side);setGround(foot);
      yaw=Math.atan2(foot.x-panel.x,foot.z-panel.z);
      vale.root.position.copy(driver.state.position);
      vale.root.position.x-=2.3*Math.sin(side);vale.root.position.z-=2.3*Math.cos(side);
      setGround(vale.root.position);vale.root.visible=true;soldiers.pose(vale,'walk');
      phase='inspect';dialogue.say('drive_panel');
    }else if(phase==='inspect'&&range(panel)<2.8&&dialogue.lineFinished()){
      phase='align';elapsed=0;dialogue.say('drive_align');
    }else if(phase==='align'&&range(panel)<2.8&&tuner.locked){
      phase='test';elapsed=0;dialogue.say('drive_test');
    }else if(phase==='return'&&range(driver.state.position)<3.6&&dialogue.lineFinished()){
      phase='done';vale.root.visible=false;return true;
    }
    return false;
  }
  function update(dt,keys,camera){
    const turn=Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight'));
    yaw+=turn*1.8*dt;
    const walk=Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown'));
    const x=foot.x-Math.sin(yaw)*walk*4.6*dt,z=foot.z-Math.cos(yaw)*walk*4.6*dt;
    const rover=driver.state.position;
    if(Math.hypot(x-panel.x,z-panel.z)>.8&&Math.hypot(x-rover.x,z-rover.z)>1.7&&Math.hypot(x-point.x,z-point.z)<48){
      foot.x=x;foot.z=z;setGround(foot);
    }
    camera.position.copy(foot);camera.position.y+=1.68;camera.rotation.set(-.09,yaw,0,'YXZ');
    const companion=vale.root.position;
    const dest=phase==='return'?rover:stationSide;
    const dx=dest.x-companion.x,dz=dest.z-companion.z,distance=Math.hypot(dx,dz);
    if(distance>(phase==='return'?2.5:.15)){
      const stride=Math.min(distance,dt*3.6);
      companion.x+=dx/distance*stride;companion.z+=dz/distance*stride;setGround(companion);
      vale.root.rotation.y=Math.atan2(dx,dz);soldiers.pose(vale,'walk');
    }else{
      const facing=phase==='return'?foot:panel;
      vale.root.rotation.y=Math.atan2(facing.x-companion.x,facing.z-companion.z);
      soldiers.pose(vale,phase==='return'?'idle':'point');
    }
    vale.mixer.update(dt);
    if(['align','test','fragment'].includes(phase)){
      climb=Math.min(2.4,climb+dt*.85);
      companion.x=THREE.MathUtils.damp(companion.x,point.x+.35,3,dt);
      companion.z=THREE.MathUtils.damp(companion.z,point.z,3,dt);
      companion.y=world.terrain.heightAt(companion.x,companion.z)+climb;
    }else if(climb>0){climb=Math.max(0,climb-dt);setGround(companion);companion.y+=climb;}
    if(phase==='align'&&range(panel)<2.8){
      tuner.update(dt,keys,audioState.muted);
      if(dialogue.lineFinished()&&tuner.locked&&!strong){strong=true;dialogue.say('drive_strong');}
      else if(dialogue.lineFinished()&&tuner.strength<60&&!weak){weak=true;dialogue.say('drive_weak');}
    }
    if(phase==='fragment'&&dialogue.lineFinished()){phase='return';dialogue.say('drive_fixed');}
    if(phase==='test'){
      elapsed+=dt;cartridge.position.z=.37-.14*Math.min(1,elapsed);
      lamp.visible=Math.floor(elapsed*4)%2===0;
      if(elapsed>=2&&dialogue.lineFinished()){
        lamp.visible=true;lamp.material.color.setHex(0x83ffb6);phase='fragment';
        dialogue.say('drive_fragment');
      }
    }
  }
  function objective(){
    if(phase==='stopped')return dialogue.lineFinished()?'Press E to disembark with Vale.':'Transmitter five is offline. Listen to Vale.';
    if(phase==='align')return range(panel)<2.8?tuner.hint:'Return to the receiver.';
    if(phase==='fragment')return 'Listen to the broken voice transmission.';
    if(phase==='test')return 'Testing the repaired link…';
    if(phase==='return')return range(driver.state.position)<3.6&&dialogue.lineFinished()?'Press E to board the rover.':'Return to the parked rover.';
    return range(panel)<2.8&&dialogue.lineFinished()?'Press E to reseat the amber cartridge.':'Approach the amber cabinet beneath the mast.';
  }
  return {stop,interact,update,objective,restoreReturn(){
    phase='return';foot.copy(panel);foot.z+=2;setGround(foot);
    yaw=Math.atan2(foot.x-driver.state.position.x,foot.z-driver.state.position.z);
    vale.root.position.copy(stationSide);vale.root.visible=true;soldiers.pose(vale,'idle');
    lamp.material.color.setHex(0x83ffb6);cartridge.position.z=.23;dialogue.say('drive_fixed');
  },restoreDone(){phase='done';lamp.material.color.setHex(0x83ffb6);cartridge.position.z=.23;},get phase(){return phase;},foot,panel,companion:vale.root,
    get onFoot(){return ['inspect','align','test','fragment','return'].includes(phase);}};
}
