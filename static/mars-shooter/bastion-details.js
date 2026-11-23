import * as THREE from 'three';

export function landmarks(side,index,{mesh,box,armor,dark,white,cyan,amber}){
  const cylinder=(material,x,y,z,top,bottom,h)=>mesh(side,new THREE.CylinderGeometry(top,bottom,h,16),material,x,y,z);
  // Keep all tall structures in the recessed corners, clear of the ramp axes.
  if(index===0){
    cylinder(dark,-14,3,-16,.55,1.25,6);
    const dish=mesh(side,new THREE.LatheGeometry([new THREE.Vector2(.01,0),new THREE.Vector2(.85,.08),new THREE.Vector2(1.6,.34),new THREE.Vector2(2.35,.9),new THREE.Vector2(2.42,.82),new THREE.Vector2(1.6,.22),new THREE.Vector2(.01,-.12)],32),white,-14,6,-16);
    dish.rotation.z=.65;
    cylinder(armor,-14,7,-16,.09,.14,2);
    cylinder(amber,-14,8,-16,.16,.16,.24);
  }else if(index===1){
    const enamel=new THREE.MeshStandardMaterial({color:0xcf5825,roughness:.58});
    for(const x of [-13,-9]){
      cylinder(enamel,x,3,-15,1.45,1.45,5.6);
      const cap=mesh(side,new THREE.SphereGeometry(1.45,16,8),enamel,x,5.8,-15);cap.scale.y=.48;
      for(const y of [1.2,4.7])cylinder(dark,x,y,-15,1.49,1.49,.25);
    }
  }else if(index===2){
    box(side,dark,-13,4,-15,.9,8,.9);box(side,white,-10,8,-15,8,.48,.8);
    const brace=box(side,armor,-11.5,6.5,-15,.22,4.25,.25);brace.rotation.z=-Math.PI/4;
    cylinder(dark,-7,6.8,-15,.055,.055,2.4);box(side,amber,-7,5.45,-15,.65,.35,.35);
  }else{
    for(const x of [4.6,5,5.4]){
      box(side,dark,x,.17,-13.8,.33,.32,7.8);box(side,cyan,x,.34,-13.8,.12,.045,7.8);
      box(side,cyan,x,2.5,-17.8,.12,4.35,.13);
    }
  }
}

const shell=new THREE.IcosahedronGeometry(1,1);
const chitin=new THREE.MeshStandardMaterial({color:0x434957,metalness:.56,roughness:.38,flatShading:true});
const tissue=new THREE.MeshStandardMaterial({color:0xff9360,emissive:0xfd4c23,emissiveIntensity:1.1});
export function fitArmor(e){
  if(!e.armor){
    const flank=new THREE.Group(),height=e.root.worldToLocal(e.aimPoint()).y;
    for(const side of [-1,1]){
      const seam=new THREE.Mesh(shell,tissue);seam.position.set(side*.82,height,.05);seam.scale.set(.23,.29,.8);e.root.add(seam);
    }
    for(let i=0;i<3;i++){
      const plate=new THREE.Mesh(shell,chitin);plate.position.set(0,height+.16+i*.06,-.85+i*.51);
      plate.scale.set(1.02,.41,.68);plate.rotation.x=-.26;flank.add(plate);
    }
    e.root.add(flank);e.armor={plates:flank};
  }
  e.armor.integrity=84;e.armor.plates.visible=true;
}

export function armorHit(e,source,amount,weapon){
  const local=e.root.worldToLocal(source.clone()).normalize(),front=-local.z>.55;
  if(e.armor.integrity<=0)return amount*(front?1:1.6);
  const closeFlank=!front&&weapon==='shotgun'&&source.distanceToSquared(e.root.position)<144;
  e.armor.integrity-=amount*(closeFlank?3:front?.32:.85);
  if(e.armor.integrity<=0)e.armor.plates.visible=false;
  return amount*(front?.42:closeFlank?1.9:1.2);
}
