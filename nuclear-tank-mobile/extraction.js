import * as THREE from './vendor/three.module.js';

// A small, clear floor beacon: cyan when open, amber while the boss is alive.
export function createExtraction(scene, level) {
  const cell=level.extraction, size=level.tileSize || 1;
  const group=new THREE.Group();
  group.position.set((cell.x+.5)*size,.06,(cell.z+.5)*size);
  const color=new THREE.Color(0x70f4df);
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.55*size,.045*size,6,40),material);
  ring.rotation.x=-Math.PI/2;
  const pad=new THREE.Mesh(new THREE.CircleGeometry(.49*size,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}));
  pad.rotation.x=-Math.PI/2;
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.13*size,.33*size,4),material);
  arrow.rotation.x=Math.PI;arrow.position.y=.65;
  group.add(pad,ring,arrow);scene.add(group);
  let time=0;
  return {
    update(delta,locked){time+=delta;const tint=locked?0xffb376:0x70f4df;material.color.setHex(tint);pad.material.color.setHex(tint);arrow.position.y=.65+Math.sin(time*3)*.12;ring.scale.setScalar(1+Math.sin(time*3)*.05);},
    near(position){return Math.hypot(position.x-group.position.x,position.z-group.position.z)<size*.7;},
  };
}
