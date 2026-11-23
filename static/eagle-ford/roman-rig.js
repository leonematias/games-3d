import * as T from 'three';
import {instantiate,loadItemFile} from '/games-3d/static/medieval/rig.js';
import {ItemStance} from '/games-3d/static/character/runtime/ItemStance.js';
import {weaponSlots} from './weapons.js';

let armory;
export async function loadArmory(){
  if(armory)return armory;
  const [response,models]=await Promise.all([
    fetch('/games-3d/character/assets/equipment/equipment.json'),Promise.all(weaponSlots.map(loadItemFile))
  ]);
  if(!response.ok)throw Error('Weapon fit data unavailable');
  const defs=await response.json();
  armory=new Map(weaponSlots.map((id,i)=>[id,{model:models[i],fit:defs.find(d=>d.id===id).fit}]));
  return armory;
}

const pose=(grip,aim)=>({grip,aim,square:true});
function stroke(ready,draw,hit){
  return {keys:[[0,ready],[.25,draw],[.54,hit],[.68,hit],[1,ready]]};
}
const ready=pose([.48,.29,-.57],[.16,.65,.74]);
const thrust=stroke(ready,pose([.50,-.02,-.48],[0,.98,.16]),pose([.37,.98,-.28],[0,1,.04]));
const slash=stroke(ready,pose([.86,.08,-.04],[.76,.06,.65]),pose([.14,.94,-.32],[-.72,.66,-.21]));
const chop=stroke(ready,pose([.57,-.02,.18],[.08,-.56,.83]),pose([.43,.93,-.52],[-.04,.85,-.51]));
const cast=stroke(ready,pose([.57,-.39,.11],[0,.97,.23]),pose([.38,.96,.02],[0,.99,.12]));

function stanceSpec(id,base){
  if(id==='scutum')return {...base,clips:{...base.clips,death:null}};
  // The legionary carries the scutum in his other hand throughout a thrust.
  const strike=id==='spear'?base.poses.thrust:id==='axe'?chop:id==='sword'?slash:thrust;
  return {...base,support:null,poses:{...base.poses,ready, strike, cast},
    clips:{...base.clips,'*':id==='spear'?'carry':'ready',attack:'strike',throw:'cast',death:null}};
}

export function romanRig(template,sampling=false){
  const rig=instantiate(template), character=rig.model.getObjectByName('Character');
  const config=character.userData.character;
  const animator={paused:sampling,get currentName(){return rig.throwing?'throw':rig.currentName;},
    duration:()=>rig.current?.getClip().duration||1,get time(){return rig.current?.time||0;}};
  rig.poseContext={model:rig.model,bones:rig.bones,animator,
    restPose:new Map([...rig.bones].map(([name,b])=>[name,{quaternion:b.quaternion.clone()}]))};
  for(const spec of config.stances){
    const left=spec.side==='Left',holder=rig.model.getObjectByName(spec.holder);
    const stance=new ItemStance(rig.poseContext,holder,stanceSpec(left?'scutum':'gladius',spec));
    if(left){rig.shieldStance=stance;rig.shieldHolder=holder;}
    else{rig.handStance=stance;rig.handHolder=holder;}
  }
  rig.weapon='gladius';rig.equipped=new Map([['gladius',rig.handHolder]]);
  rig.settle=()=>{
    if(rig.currentName==='death')return;
    if(rig.handHolder.visible)rig.handStance.settle();
    if(rig.shieldHolder.visible)rig.shieldStance.settle();
  };
  return rig;
}

export function equipRoman(rig,id){
  if(rig.weapon===id)return;
  rig.handStance.dispose();rig.handHolder.visible=false;
  const {fit,model}=armory.get(id);
  let holder=rig.equipped.get(id);
  if(!holder){
    holder=rig.attach(model.clone(true),'rightHandWeapon',id);
    holder.scale.copy(rig.equipped.get('gladius').scale);
    const [x,y,z]=fit.carry.position,[rx,ry,rz]=fit.carry.rotation;
    const deg=T.MathUtils.degToRad;
    holder.rotateX(deg(rx)).rotateY(deg(rz)).rotateZ(deg(-ry));
    holder.translateX(x).translateY(z).translateZ(-y);
    rig.equipped.set(id,holder);
  }
  holder.visible=true;rig.handHolder=holder;rig.weapon=id;
  rig.handStance=new ItemStance(rig.poseContext,holder,stanceSpec(id,{...fit.stance,side:'Right'}));
}

// Keep the locomotion clip on the legs while both empty hands brace the cart.
const armAxis=new T.Vector3(),desired=new T.Vector3(),rotation=new T.Quaternion(),parentRotation=new T.Quaternion();
export function braceCart(rig){
  for(const [side,sign] of [['Left',-1],['Right',1]]){
    for(const [name,child,y,z] of [['Arm','ForeArm',-.32,.43],['ForeArm','Hand',.06,.48]]){
      const joint=rig.bones.get(side+name),end=rig.bones.get(side+child);
      joint.parent.getWorldQuaternion(parentRotation).invert();
      armAxis.copy(end.position).normalize().applyQuaternion(joint.quaternion);
      desired.set(sign*.09,y,z).normalize().applyQuaternion(rig.model.quaternion).applyQuaternion(parentRotation);
      rotation.setFromUnitVectors(armAxis,desired);joint.quaternion.premultiply(rotation);
    }
  }
}
