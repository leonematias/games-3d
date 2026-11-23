import * as THREE from 'three';

export function batteryTrailer(){
  const root=new THREE.Group();
  const body=new THREE.MeshStandardMaterial({color:0xc3993a,roughness:.67});
  const iron=new THREE.MeshStandardMaterial({color:0x384146});
  function box(x,y,z,w,h,d,mat){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,z);root.add(mesh);
  }
  box(0,.68,0,1.9,.26,3.3,iron);
  for(const z of [-.95,0,.95]){
    box(0,1.13,z,1.7,.78,.82,body);
    box(0,1.58,z,1.44,.12,.62,iron);
  }
  box(0,.55,2,.16,.18,1.6,iron);
  for(const x of [-.98,.98])for(const z of [-.85,.85]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.25,12),iron);
    wheel.rotation.z=Math.PI/2;wheel.position.set(x,.46,z);root.add(wheel);
  }
  return root;
}
