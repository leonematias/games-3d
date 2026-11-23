import * as THREE from 'three';
import {buildShip} from '../solar-system/ship.js';

// The pilot sits in the open dorsal cockpit with one glove on the flight controls.
export function createLanding(scene,world){
  const craft=buildShip(),ship=craft.group;
  const pilot=new THREE.Group();
  ship.add(pilot);pilot.scale.x=-1;pilot.position.set(0,2.08,-13.1);
  const suit=new THREE.MeshStandardMaterial({color:0xed884a});
  const helmet=new THREE.MeshStandardMaterial({color:0xe9e5d9});
  const visor=new THREE.MeshStandardMaterial({color:0x24475a,metalness:.45,roughness:.24});
  function form(material,x,y,z,sx,sy,sz){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),material);
    mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);pilot.add(mesh);return mesh;
  }
  function panel(x,y,z,width,height,depth,material){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
    mesh.position.set(x,y,z);pilot.add(mesh);return mesh;
  }
  const frame=new THREE.MeshStandardMaterial({color:0x45505a,metalness:.5,roughness:.45});
  const indicator=new THREE.MeshBasicMaterial({color:0x82e4d2});
  panel(0,.04,0,1.33,.13,1.37,visor);
  for(const x of [-.64,.64])panel(x,.21,0,.09,.33,1.38,frame);
  panel(0,.39,.42,.76,.84,.14,frame);
  const dash=panel(0,.26,-.51,1.18,.14,.34,frame);dash.rotation.x=-.25;
  for(const x of [-.35,-.12,.13])panel(x,.34,-.48,.15,.025,.12,indicator);
  panel(.32,.24,-.36,.10,.23,.09,visor);
  form(visor,0,.37,.18,.39,.48,.21);form(suit,0,.38,0,.34,.44,.22);
  form(helmet,0,.96,0,.255,.27,.24);form(visor,0,.98,-.16,.236,.15,.13);
  form(suit,.32,.4,-.17,.12,.21,.24);form(helmet,.32,.29,-.35,.095,.09,.13);
  const shoulder=new THREE.Vector3(-.27,.65,0),elbow=new THREE.Vector3(),wrist=new THREE.Vector3();
  const upper=form(suit,0,0,0,1,1,1),lower=form(suit,0,0,0,1,1,1),hand=form(helmet,0,0,0,.105,.06,.10);
  function sleeve(mesh,a,b){
    const dir=b.clone().sub(a);
    mesh.position.copy(a).lerp(b,.5);mesh.scale.set(.105,dir.length()/2+.04,.105);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
  }
  function salute(amount){
    elbow.set(-.36-.25*amount,.31+.39*amount,-.10);
    wrist.set(-.32+.11*amount,.26+.76*amount,-.31+.14*amount);
    sleeve(upper,shoulder,elbow);sleeve(lower,elbow,wrist);hand.position.copy(wrist);
  }
  salute(0);scene.add(ship);ship.visible=false;
  const pad=world.worldPoint(19,0);pad.y+=2.3;
  const start=pad.clone().add(new THREE.Vector3(24,27,66));
  const view=pad.clone().add(new THREE.Vector3(4,1,-19));
  const wide=pad.clone().add(new THREE.Vector3(8,4,-31));
  const close=pad.clone().add(new THREE.Vector3(1.1,3.2,-16.1));
  const cameraPosition=wide.clone();
  function update(t,lower=0){
    cameraPosition.lerpVectors(wide,close,THREE.MathUtils.smoothstep(t,4.5,7.5));
    const u=THREE.MathUtils.smoothstep(t,0,7);
    ship.visible=true;ship.position.lerpVectors(start,pad,u);
    ship.rotation.z=.18*(1-u);craft.plume.material.opacity=.7*(1-u);craft.innerPlume.material.opacity=.8*(1-u);
    salute(THREE.MathUtils.smoothstep(t,7.4,8.3)*(1-THREE.MathUtils.smoothstep(lower,0,1)));
  }
  return {update,view,cameraPosition,focus(){return pilot.localToWorld(new THREE.Vector3(0,.82,0));}};
}
