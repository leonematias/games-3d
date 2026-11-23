import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

export async function outfitCrew(stations,environment){
  const asset=await new GLTFLoader().loadAsync('/games-3d/character/api/characters/line-trooper/glb');
  for(const s of stations){
    for(const group of [s.base,s.pivot])group.traverse(n=>{if(n.material?.isMeshStandardMaterial){n.material.envMap=environment;n.material.envMapIntensity=.9;}});
    const model=clone(asset.scene),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    model.scale.setScalar(1.85/size.y);model.position.y=-bounds.min.y*model.scale.y;
    model.traverse(n=>{if(n.isMesh){n.castShadow=true;for(const m of [n.material].flat()){m.envMap=environment;m.envMapIntensity=.65;}}});
    const rifle=model.getObjectByName('equip_energy_rifle');if(rifle)rifle.visible=false;
    s.soldier.add(model);s.mixer=new THREE.AnimationMixer(model);
    const idle=asset.animations.find(c=>c.name==='aim')||asset.animations.find(c=>c.name==='idle'),run=asset.animations.find(c=>/run/i.test(c.name))||asset.animations.find(c=>/walk/i.test(c.name));
    if(idle)s.idleClip=s.mixer.clipAction(idle).play();if(run)s.runClip=s.mixer.clipAction(run);
  }
}

export function emplacement(scene,x,y,z,index){
  const flame=index%2===1,base=new THREE.Group(),pivot=new THREE.Group(),rotor=new THREE.Group();
  base.position.set(x,y,z);pivot.position.set(x,y+1.48,z);scene.add(base,pivot);
  const material=color=>new THREE.MeshStandardMaterial({color,metalness:.56,roughness:.42});
  const steel=material(0x788993),dark=material(0x26313a),brass=material(flame?0xe98637:0xc6ac76);
  function part(parent,geometry,mat,x,y,z){const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);parent.add(m);m.castShadow=true;return m;}
  function drum(parent,x,y,z,r,tip,len,mat,horizontal=false){
    const m=part(parent,new THREE.CylinderGeometry(r,tip,len,16),mat,x,y,z);
    if(horizontal)m.rotation.x=Math.PI/2;return m;
  }
  drum(base,0,.12,0,.84,.99,.24,dark);drum(base,0,.49,0,.43,.7,.55,steel);
  drum(base,0,.85,0,.56,.49,.17,brass);drum(base,0,1.12,0,.32,.42,.48,dark);
  const enamel=material(flame?0xa74a25:0x485e60),ceramic=material(0xcccac0);
  // Split cheeks, a bearing race and a pair of hydraulic recoil struts.
  function plate(parent,outline,depth,mat,x,y,z){
    const shape=new THREE.Shape();outline.forEach(([u,v],i)=>i?shape.lineTo(u,v):shape.moveTo(u,v));shape.closePath();
    return part(parent,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.045,bevelThickness:.045}),mat,x,y,z);
  }
  for(const sign of [-1,1]){
    const cheek=plate(base,[[-.48,0],[.48,0],[.36,.73],[.1,1.02],[-.32,.86]],.10,enamel,sign*.62,.52,0);cheek.rotation.y=Math.PI/2;
    const disk=drum(base,sign*.67,1.37,0,.24,.24,.18,brass);disk.rotation.z=Math.PI/2;
    const strut=drum(base,sign*.43,.62,.35,.085,.12,.86,steel);strut.rotation.x=.42;
  }
  const casing=part(pivot,new THREE.SphereGeometry(1,16,10),steel,0,0,0);casing.scale.set(.55,.4,.88);
  let readyLamp;
  if(flame){
    for(const side of [-1,1]){
      const tank=part(pivot,new THREE.CapsuleGeometry(.24,.78,5,12),brass,side*.55,.05,.12);tank.rotation.x=Math.PI/2;
      const hose=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.55,0,.7),new THREE.Vector3(side*.82,-.29,0),new THREE.Vector3(side*.18,-.12,-1.48)]);
      part(pivot,new THREE.TubeGeometry(hose,16,.07,7,false),dark,0,0,0);
    }
    for(const side of [-1,1]){
      for(const z of [-.28,.5])drum(pivot,side*.55,.05,z,.253,.253,.08,dark,true);
      drum(pivot,side*.55,.05,-.55,.13,.17,.15,steel,true);
    }
    for(let j=0;j<8;j++){
      const a=j*Math.PI/4;
      const shield=part(pivot,new THREE.CapsuleGeometry(.068,.63,3,8),ceramic,.29*Math.cos(a),.29*Math.sin(a),-1.59);shield.rotation.x=Math.PI/2;
    }
    drum(pivot,0,0,-2.09,.16,.21,.13,dark,true);
    readyLamp=drum(pivot,0,-.27,-2.07,.075,.06,.22,new THREE.MeshBasicMaterial({color:0x7edbff}),true);
    drum(pivot,0,0,-1.22,.2,.24,1.4,steel,true);drum(pivot,0,0,-1.89,.22,.35,.48,brass,true);
  }else{
    pivot.add(rotor);
    const body=plate(pivot,[[-.43,-.26],[.34,-.26],[.48,-.06],[.34,.32],[-.26,.38],[-.46,.16]],1.32,enamel,0,0,-.65);
    drum(pivot,.24,.47,-.1,.105,.16,.53,dark,true);
    readyLamp=drum(pivot,.24,.47,-.39,.08,.10,.04,new THREE.MeshBasicMaterial({color:0x67cccd}),true);
    for(const sign of [-1,1]){
      const vent=plate(pivot,[[-.36,-.15],[.31,-.15],[.43,.04],[.31,.19],[-.32,.19]],.045,dark,sign*.48,0,-.02);vent.rotation.y=Math.PI/2;
      for(let k=0;k<5;k++){const fin=part(pivot,new THREE.BoxGeometry(.06,.19,.046),steel,sign*.51,.01,-.29+k*.13);fin.rotation.x=-.42;}
    }
    for(let k=0;k<7;k++)part(body,new THREE.BoxGeometry(.48,.035,.065),dark,0,.37,.14*k+.16);
    drum(pivot,0,0,-.75,.37,.44,.48,steel,true);
    // Visible linked belt bends from the drum into the breech.
    for(let k=0;k<11;k++){const a=k/10*Math.PI*.8;
      const x=-.41-.32*Math.sin(a),y=.08-.32*(1-Math.cos(a));
      drum(pivot,x,y,.32-k*.036,.035,.045,.23,brass,true);
    }
    for(const x of [-.24,.24])drum(pivot,x,-.12,.86,.085,.085,.45,dark,true);
    part(pivot,new THREE.BoxGeometry(.17,.13,.22),ceramic,0,.46,-.19);
    for(let k=0;k<6;k++){const a=k*Math.PI/3;drum(rotor,.2*Math.cos(a),.2*Math.sin(a),-1.24,.065,.065,1.9,dark,true);}
    for(const z of [-.73,-1.6,-2])drum(rotor,0,0,z,.31,.31,.13,steel,true);
    drum(pivot,-.53,-.07,.18,.42,.42,.52,brass,true);
  }
  const muzzle=new THREE.Object3D();muzzle.position.z=-2.22;pivot.add(muzzle);
  const soldier=new THREE.Group();const inward=new THREE.Vector3(-x,0,-z);if(index%2===0)inward.x=0;else inward.z=0;inward.normalize();
  soldier.position.copy(base.position).addScaledVector(inward,1.4);soldier.rotation.y=Math.atan2(-inward.x,-inward.z);scene.add(soldier);
  const bar=new THREE.Sprite(new THREE.SpriteMaterial({color:0x83f2bd,depthTest:false}));bar.scale.set(1.45,.13,1);scene.add(bar);bar.position.copy(soldier.position);bar.position.y+=2.15;
  const cargo=part(soldier,new THREE.BoxGeometry(.44,.31,.28),enamel,.36,.88,.19);cargo.visible=false;
  const home=soldier.position.clone(),capacity=flame?60:84;
  pivot.rotation.order='YXZ';pivot.rotation.y=-index*Math.PI/2;
  return {readyLamp,index,flame,base,pivot,rotor,muzzle,soldier,bar,cargo,home,homeYaw:soldier.rotation.y,capacity,stock:capacity,route:null,trips:0,hp:100,cooldown:0,flash:0,audioTimer:0};
}
