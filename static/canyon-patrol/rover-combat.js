import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createMachineGun} from '../mars-shooter/weapon.js';
import {createSounds} from '../mars-shooter/sounds.js';
import {reviewSounds} from './audio-evidence.js';

// Leg numbers are zero-based. Leave the transmitter repair and final approach quiet.
const packs=new Map([[0,2],[2,3],[5,4],[7,5]]);
export async function createRoverCombat(scene,world,driver){
  const sounds=reviewSounds(createSounds({ambient:0}));
  const asset=await new GLTFLoader().loadAsync('/games-3d/character/api/characters/mars-cinder-skitter/glb');
  const bounds=new THREE.Box3().setFromObject(asset.scene,true);
  const scale=3.2/bounds.getSize(new THREE.Vector3()).x;
  const spiders=Array.from({length:5},(_,i)=>{
    const model=clone(asset.scene);
    model.scale.setScalar(scale);model.position.y=-bounds.min.y*scale;
    const root=new THREE.Group();root.add(model);scene.add(root);root.visible=false;
    const mixer=new THREE.AnimationMixer(model);
    const run=mixer.clipAction(THREE.AnimationClip.findByName(asset.animations,'run')||
      asset.animations.find(c=>/run|walk/i.test(c.name)));
    run.play();run.time=i*.14;
    return {root,mixer,hp:0,retreat:0,fall:0};
  });
  const {gun,muzzle,update:cycle}=createMachineGun({hands:false});
  const mount=new THREE.Mesh(new THREE.CylinderGeometry(.23,.36,.36,10),
    new THREE.MeshStandardMaterial({color:0x625b50,metalness:.45}));
  mount.position.set(.50,1.1,.76);world.roverMesh.body.add(mount);
  gun.position.set(.50,1.47,.93);gun.rotation.y=Math.PI;gun.scale.setScalar(1.7);world.roverMesh.body.add(gun);
  const flash=new THREE.Mesh(new THREE.OctahedronGeometry(.14),new THREE.MeshBasicMaterial({color:0xffdb73}));
  flash.scale.z=2.2;flash.visible=false;muzzle.add(flash);
  const trace=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),
    new THREE.LineBasicMaterial({color:0xffdc87}));trace.visible=false;trace.frustumCulled=false;scene.add(trace);
  const triggered=new Set(),pos=driver.state.position;
  let kills=0,shots=0,cooldown=0,time=0,flashTime=0;
  function spawn(fix,target){
    triggered.add(fix);sounds.growl();
    const dx=target.x-pos.x,dz=target.z-pos.z,length=Math.hypot(dx,dz);
    for(let i=0;i<packs.get(fix);i++){
      const spider=spiders[i],across=(i%2?1:-1)*(i?2+i:0),ahead=44+i*3;
      const x=pos.x+(ahead*dx+across*dz)/length,z=pos.z+(ahead*dz-across*dx)/length;
      spider.root.position.set(x,world.terrain.heightAt(x,z),z);
      spider.root.rotation.z=0;spider.root.visible=true;spider.hp=2;spider.retreat=0;spider.fall=0;
    }
  }
  function fire(cover){
    const origin=muzzle.getWorldPosition(new THREE.Vector3()),forward=driver.forwardVector();
    let distance=72,victim=null;
    const end=origin.clone().addScaledVector(forward,distance);
    end.y=world.terrain.heightAt(end.x,end.z)+.4;
    for(const s of spiders){
      if(!s.root.visible||s.hp<=0)continue;
      const point=s.root.position.clone();point.y+=.65;
      const dx=point.x-origin.x,dz=point.z-origin.z,along=dx*forward.x+dz*forward.z;
      if(along<=0||along>=distance||Math.abs(dx*forward.z-dz*forward.x)>1.25+along*.045)continue;
      if(!world.clearLine(origin,point,0))continue;
      victim=s;distance=along;end.copy(point);
    }
    if(cover&&!victim)return;
    shots++;sounds.turretGun(.35);flashTime=.055;cooldown=.105;
    if(victim&&--victim.hp===0){kills++;victim.fall=.4;sounds.impact();}
    const points=trace.geometry.attributes.position;
    points.setXYZ(0,origin.x,origin.y,origin.z);points.setXYZ(1,end.x,end.y,end.z);points.needsUpdate=true;
  }
  function update(dt,fix,target,dist,leg,firing){
    time+=dt;cooldown-=dt;flashTime-=dt;
    if(packs.has(fix)&&!triggered.has(fix)&&dist<leg*.65)spawn(fix,target);
    for(const s of spiders){
      if(!s.root.visible)continue;
      if(s.hp===0){
        s.fall-=dt;s.root.rotation.z+=dt*3;s.root.position.y-=dt;
        if(s.fall<=0)s.root.visible=false;
        continue;
      }
      const p=s.root.position,dx=pos.x-p.x,dz=pos.z-p.z,d=Math.hypot(dx,dz);
      if(d>95){s.root.visible=false;continue;}
      if(d<2.4&&!s.retreat){driver.state.speed*=.55;sounds.hurt();s.retreat=1.3;}
      const retreating=s.retreat>0,speed=retreating?-9:6.5;
      if(retreating){s.retreat-=dt;if(s.retreat<=0){s.root.visible=false;continue;}}
      p.x+=dx/(d||1)*speed*dt;p.z+=dz/(d||1)*speed*dt;
      p.y=world.terrain.heightAt(p.x,p.z);s.root.rotation.y=Math.atan2(dx,dz)+(retreating?Math.PI:0);
      s.mixer.update(dt);
    }
    if(firing&&cooldown<=0)fire(firing==='cover');
    flash.visible=trace.visible=flashTime>0;cycle({time,recoil:Math.max(0,flashTime)});
  }
  function clear(){for(const s of spiders)s.root.visible=false;flash.visible=trace.visible=false;}
  return {update,clear,sounds,reviewExcluded:[...spiders.map(spider=>spider.root),trace,flash],get progress(){return {kills,shots,legs:[...triggered]};},
    restore(progress){
      const count=n=>Number.isInteger(n)&&n>=0?n:0;
      kills=count(progress.kills);shots=count(progress.shots);
      for(const leg of progress.legs||[])if(packs.has(leg))triggered.add(leg);
    },get kills(){return kills;},get shots(){return shots;},get encounters(){return triggered.size;}};
}
