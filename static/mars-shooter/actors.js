import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
export {createEffects} from './effects.js';
import {createFlamethrower} from './flamethrower.js';
import { createMachineGun } from './weapon.js';

const ENEMY_PRESETS = [
  {type:'small',id:'mars-cinder-skitter',name:'Cinder Skitter',span:2.4,hitRadius:.4,hp:60,speed:12,damage:10,reach:1.5},
  {type:'medium',id:'mars-obsidian-reaver',name:'Obsidian Reaver',span:4,hitRadius:.67,hp:156,speed:8.8,damage:18,reach:2.1},
  {type:'large',id:'mars-ares-broodguard',name:'Ares Broodguard',span:6,hitRadius:1,hp:360,speed:5.4,damage:28,reach:2.8},
  {type:'spitter',id:'mars-bile-spitter',name:'Bile Spitter',span:4.8,hitRadius:.8,hp:180,speed:6,damage:18,reach:30},
  {type:'boss',id:'mars-siege-behemoth',name:'Siege Behemoth',span:5.2,hitRadius:2.1,hp:2600,speed:3.8,damage:42,reach:5},
  {type:'worm',id:'mars-rift-worm',name:'Rift Worm',span:6.5,hitRadius:.75,hp:240,speed:7,damage:22,reach:3.6},
];

export async function loadActors(environment,{defense=false}={}) {
  const loader=new GLTFLoader();
  const creatures=await Promise.all(ENEMY_PRESETS.map(p=>(!defense&&['spitter','boss'].includes(p.type))?Promise.resolve(null):loader.loadAsync(`/games-3d/character/api/characters/${p.id}/glb`)));
  for(const creature of creatures.filter(Boolean))creature.scene.traverse(n=>{
    if(!n.isMesh)return;
    n.castShadow=true;n.receiveShadow=true;
    if(n.geometry.index&&n.geometry.attributes.normal&&n.geometry.attributes.uv&&!n.geometry.attributes.tangent)n.geometry.computeTangents();
    // Chitin needs broad reflections to remain legible inside the shaded canyon.
    for(const material of [n.material].flat()){material.envMap=environment;material.envMapIntensity=1.5;}
  });
  function spawnEnemy(type,index,{healthScale=1,speedScale=1}={}) {
    const variant=ENEMY_PRESETS.findIndex(p=>p.type===type),preset=ENEMY_PRESETS[variant],creature=creatures[variant];
    const hp=Math.ceil(preset.hp*healthScale/12)*12;
    const model=clone(creature.scene),root=new THREE.Group();
    model.updateMatrixWorld(true);
    model.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});
    const box=new THREE.Box3().setFromObject(model,true),size=box.getSize(new THREE.Vector3());
    // Normalize leg span, not height: a low arthropod must still fit the canyon.
    const scale=preset.span/(type==='worm'?size.z:type==='boss'?size.y:size.x);model.scale.setScalar(scale);model.position.y=-box.min.y*scale;model.rotation.y=Math.PI;root.add(model);
    const baseY=model.position.y;
    const mixer=new THREE.AnimationMixer(model),actions={};
    for(const clip of creature.animations)actions[clip.name.toLowerCase()]=mixer.clipAction(clip);
    let current='';
    function play(name,once=false,rate=1) {
      if(type==='worm'&&name==='attack')name='strike';
      const key=Object.keys(actions).find(k=>k===name)||Object.keys(actions).find(k=>k.includes(name))||Object.keys(actions).find(k=>k.includes('idle'));
      if(!key)return;
      actions[key].setEffectiveTimeScale(rate);
      if(current===key)return;
      const old=actions[current],action=actions[key];action.reset();action.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);action.clampWhenFinished=once;action.fadeIn(.15).play();if(!once)action.time=(index*.173)%action.getClip().duration;if(old)old.fadeOut(.15);current=key;
    }
    play('idle');
    const feet=[];let thorax,head,tail;
    model.traverse(n=>{if(!n.isBone)return;if(/Leg[1-4](Left|Right)Toe$/.test(n.name)||(type==='boss'&&/(Front|Hind)(Left|Right)Toe$/.test(n.name)))feet.push(n);if(/Hips$/.test(n.name))thorax=n;if(/Head$/.test(n.name))head=n;if(/Tail5$/.test(n.name))tail=n;});
    function aimPoint(){root.updateMatrixWorld(true);return thorax.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.08,0));}
    function hitPoints(){root.updateMatrixWorld(true);return ['worm','boss'].includes(type)?[head,thorax,...(tail?[tail]:[])].map(b=>b.getWorldPosition(new THREE.Vector3())):[aimPoint()];}
    const footPoint=new THREE.Vector3();
    function ground(terrain){
      root.updateMatrixWorld(true);
      if(type==='worm'){
        let rise=-Infinity;
        for(const bone of [head,thorax,tail]){bone.getWorldPosition(footPoint);const delta=terrain.heightAt(footPoint.x,footPoint.z)-root.position.y;if(delta<.8)rise=Math.max(rise,delta);}
        model.position.y=baseY+.06+Math.max(0,Math.min(.6,rise));return;
      }
      if(!feet.length)return;
      let clearance=Infinity;
      for(const foot of feet){
        foot.getWorldPosition(footPoint);
        const sampled=terrain.heightAt(footPoint.x,footPoint.z);
        // A wide leg can overlap a vertical canyon wall. That is an obstacle,
        // not a support surface: never lift the entire bug onto the cliff top.
        const floor=sampled>root.position.y+.8?root.position.y:sampled;
        clearance=Math.min(clearance,footPoint.y-floor);
      }
      // Keep supporting toes on the sampled floor as the gait crosses slopes.
      model.position.y+=.09-clearance;
    }
    return {root,model,mixer,play,ground,aimPoint,hitPoints,preset:preset.id,type,name:preset.name,span:preset.span,hitRadius:preset.hitRadius,damage:preset.damage,reach:preset.reach,feet,hp,maxHp:hp,index,active:false,aware:false,attack:0,cooldown:0,dead:0,s:0,lateral:0,speed:preset.speed*speedScale};
  }
  const weapon=createMachineGun();
  return {spawnEnemy,...weapon,flamer:createFlamethrower(),clips:creatures[0].animations.map(v=>v.name),presets:ENEMY_PRESETS};
}
