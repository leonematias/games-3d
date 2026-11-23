import * as THREE from 'three';

// Kestrel 07: an original axial-thrust expedition ship. Nose: -Z, drive: +Z.
// Solid meshes are intentionally separate from the exhaust so the hull can be
// baked into the shared model library without losing animated drive feedback.
const finish = (color, metalness=.55, roughness=.7, emissive=0) =>
  new THREE.MeshStandardMaterial({color, metalness, roughness, emissive,
    emissiveIntensity: emissive ? .25 : 0, flatShading: false});
const armor = finish(0xa1a69a,.48,.72);
const painted = finish(0x68736e,.55,.72);
const shadow = finish(0x182226,.43,.83);
const ribs = finish(0x45514e,.67,.54);
const steel = finish(0x9a9d8f,.72,.44);
const oxide = finish(0xa85435,.52,.73);
const caution = finish(0xc8aa75,.3,.74);
const ceramic = finish(0x171c1d,.2,.91);
const glass = finish(0x102a32,.32,.18,0x153441);
const lamp = finish(0xcee5d8,.25,.3,0x7da7a0);
function exhaustFade(){
  const canvas=document.createElement('canvas');canvas.width=4;canvas.height=128;
  const context=canvas.getContext('2d');
  const gradient=context.createLinearGradient(0,0,0,128);
  gradient.addColorStop(0,'#000');gradient.addColorStop(.55,'#777');gradient.addColorStop(1,'#fff');
  context.fillStyle=gradient;context.fillRect(0,0,4,128);
  return new THREE.CanvasTexture(canvas);
}
const exhaustAlpha=exhaustFade();
const plumeMaterial = new THREE.MeshBasicMaterial({color:0x598fc2,transparent:true,opacity:0,
  alphaMap:exhaustAlpha,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
const coreMaterial = new THREE.MeshBasicMaterial({color:0xb8e9ff,transparent:true,opacity:0,
  alphaMap:exhaustAlpha,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});

function part(group,geometry,material,at=[0,0,0]){
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...at);group.add(mesh);return mesh;
}
function box(group,size,material,at,rotation){
  const mesh=part(group,new THREE.BoxGeometry(...size),material,at);
  if(rotation)mesh.rotation.set(...rotation);
  return mesh;
}
function cylinder(group,lower,upper,length,material,at,segments=16,axis='z'){
  const mesh=part(group,new THREE.CylinderGeometry(upper,lower,length,segments),material,at);
  if(axis==='z')mesh.rotation.x=Math.PI/2;
  if(axis==='x')mesh.rotation.z=Math.PI/2;
  return mesh;
}
function torus(group,radius,tube,material,at,segments=20){
  return part(group,new THREE.TorusGeometry(radius,tube,8,segments),material,at);
}
function beam(group,a,b,radius,material){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
  const mesh=part(group,new THREE.CylinderGeometry(radius,radius,direction.length(),8),material,
    start.add(end).multiplyScalar(.5).toArray());
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  return mesh;
}
function hull(rings,material){
  const vertices=[],uv=[],faces=[],sides=8;
  const first=rings[0][0],last=rings.at(-1)[0];
  for(const [z,halfWidth,halfHeight] of rings){
    for(let k=0;k<sides;k++){
      const angle=(k+.5)*Math.PI*2/sides;
      vertices.push(Math.cos(angle)*halfWidth,Math.sin(angle)*halfHeight,z);
      uv.push(k/sides,(z-first)/(last-first));
    }
  }
  for(let i=0;i<rings.length-1;i++)for(let k=0;k<sides;k++){
    const a=i*sides+k,b=i*sides+(k+1)%sides,c=(i+1)*sides+k,d=(i+1)*sides+(k+1)%sides;
    faces.push(a,b,c,b,d,c);
  }
  for(let k=1;k<sides-1;k++){
    faces.push(0,k+1,k);
    const n=(rings.length-1)*sides;faces.push(n,n+k,n+k+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(faces);geometry.computeVertexNormals();
  return new THREE.Mesh(geometry,material);
}
function stencilTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#d8d6c6';ctx.font='bold 46px monospace';ctx.fillText('KESTREL',12,53);
  ctx.fillStyle='#a85435';ctx.font='bold 38px monospace';ctx.fillText('07  /  EXPEDITION',12,102);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function warningMark(group,x,y,z,side){
  for(let i=0;i<3;i++)box(group,[.055,.1,.24],caution,[x,y,z+i*.31],[0,0,side*.55]);
}
function radiator(group,side){
  // Compact heat exchangers sit parallel to the hull, clear of the exhaust.
  const x=side*3.12;
  box(group,[.19,2.65,5.4],shadow,[x,0,7.3]);
  box(group,[.24,.13,5.6],steel,[x,1.36,7.3]);
  box(group,[.24,.13,5.6],steel,[x,-1.36,7.3]);
  for(let z=4.9;z<10;z+=.58)box(group,[.29,2.45,.065],painted,[x,0,z]);
  box(group,[.32,.18,5.7],oxide,[x,0,7.3]);
}
function maneuveringPod(group,side,z){
  const x=side*1.75;
  box(group,[.85,.65,1.2],painted,[x,.82,z]);
  cylinder(group,.3,.38,.44,ceramic,[side*2.24,.83,z],12,'x');
  cylinder(group,.13,.13,.05,shadow,[side*2.48,.83,z],12,'x');
  box(group,[.6,.11,.18],caution,[x,1.2,z-.33]);
}
function engine(group){
  cylinder(group,1.34,1.34,2.5,ribs,[0,0,12.35],18);
  for(const z of [11.1,12.1,13.1])torus(group,1.54,.17,steel,[0,0,z],24);
  const profile=[new THREE.Vector2(1.2,-1.7),new THREE.Vector2(1.65,-1.2),
    new THREE.Vector2(1.75,-.35),new THREE.Vector2(2.05,.65),
    new THREE.Vector2(2.44,1.75),new THREE.Vector2(2.37,2.3),
    new THREE.Vector2(1.92,2.4)];
  const bell=part(group,new THREE.LatheGeometry(profile,24),steel,[0,0,15.3]);bell.rotation.x=Math.PI/2;
  torus(group,2.25,.18,ribs,[0,0,17.48],28);
  cylinder(group,1.83,1.83,.16,ceramic,[0,0,17.72],24);
  const inner=part(group,new THREE.CircleGeometry(1.44,32),finish(0x0c1a24,.08,.94,0x659fc9),[0,0,17.82]);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,x=Math.cos(a)*2.14,y=Math.sin(a)*2.14;
    beam(group,[x*.78,y*.78,13.7],[x,y,17.45],.13,ribs);
    part(group,new THREE.SphereGeometry(.11,6,4),oxide,[x,y,17.45]);
  }
  const plume=part(group,new THREE.ConeGeometry(.92,7,24,1,true),plumeMaterial,[0,0,21.35]);
  plume.rotation.x=Math.PI/2;
  const innerPlume=part(group,new THREE.ConeGeometry(.33,5.5,16,1,true),coreMaterial,[0,0,20.6]);
  innerPlume.rotation.x=Math.PI/2;
  return {inner,plume,innerPlume};
}
function rcsNozzle(group,at,direction,action){
  const dir=new THREE.Vector3(...direction).normalize();
  const base=new THREE.Vector3(...at);
  const nozzle=part(group,new THREE.CylinderGeometry(.17,.23,.22,10),ceramic,
    base.clone().addScaledVector(dir,.08).toArray());
  nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  const flame=part(group,new THREE.ConeGeometry(.25,2.1,12,1,true),
    new THREE.MeshBasicMaterial({color:0xa6dfff,transparent:true,opacity:0,
      alphaMap:exhaustAlpha,depthWrite:false,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending}),
    base.clone().addScaledVector(dir,1.15).toArray());
  flame.quaternion.copy(nozzle.quaternion);
  flame.visible=false;
  const flash=part(group,new THREE.SphereGeometry(.22,8,6),
    new THREE.MeshBasicMaterial({color:0xd9f6ff,transparent:true,opacity:0,
      depthWrite:false,blending:THREE.AdditiveBlending}),
    base.clone().addScaledVector(dir,.28).toArray());
  flash.visible=false;
  return {flame,flash,actions:[action]};
}
function maneuveringJets(group){
  const jets=[],byLocation=new Map();
  const add=(at,dir,action)=>{
    const key=[...at,...dir].join(',');
    const existing=byLocation.get(key);
    if(existing){existing.actions.push(action);return;}
    const jet=rcsNozzle(group,at,dir,action);
    jets.push(jet);byLocation.set(key,jet);
  };
  for(const z of [-12.6,8.8]){
    add([-2.35,.75,z],[-1,0,0],'strafeRight');
    add([2.35,.75,z],[1,0,0],'strafeLeft');
    add([0,-1.55,z],[0,-1,0],'liftUp');
    add([0,1.82,z],[0,1,0],'liftDown');
  }
  add([-2.35,.75,-12.6],[-1,0,0],'yawRight');
  add([2.35,.75,8.8],[1,0,0],'yawRight');
  add([2.35,.75,-12.6],[1,0,0],'yawLeft');
  add([-2.35,.75,8.8],[-1,0,0],'yawLeft');
  add([0,-1.55,-12.6],[0,-1,0],'pitchUp');
  add([0,1.82,8.8],[0,1,0],'pitchUp');
  add([0,1.82,-12.6],[0,1,0],'pitchDown');
  add([0,-1.55,8.8],[0,-1,0],'pitchDown');
  add([-1.4,1.45,-4.5],[0,1,0],'rollRight');
  add([1.4,-1.45,-4.5],[0,-1,0],'rollRight');
  add([1.4,1.45,-4.5],[0,1,0],'rollLeft');
  add([-1.4,-1.45,-4.5],[0,-1,0],'rollLeft');
  for(const x of [-.75,.75])add([x,0,-16.15],[0,0,-1],'brake');
  return jets;
}
export function buildShip(){
  const ship=new THREE.Group();ship.name='Kestrel 07';
  // Armored pressure vessel: long tapered bow and broad midship habitation drum.
  ship.add(hull([[-18,.08,.1],[-16.2,.76,.68],[-13.5,1.34,1.12],
    [-10.5,1.62,1.3],[-6,1.8,1.42],[-1,1.8,1.42],[3,1.52,1.24],[4.2,1.24,1.08]],armor));
  // Segment lines, keel, weathered armor panels and recessed inter-panel gaps.
  box(ship,[2.1,.17,8.5],painted,[0,1.39,-5.7]);
  box(ship,[1.45,.12,3.8],steel,[0,1.47,-12.3]);
  box(ship,[1.0,.26,14],ribs,[0,-1.24,-5.1]);
  box(ship,[.48,.3,13],oxide,[0,-1.48,-5]);
  for(const z of [-13.2,-10.8,-7.8,-4.8,-1.8,1.2]){
    torus(ship,1.52,.035,shadow,[0,0,z],8);
    for(const side of [-1,1])box(ship,[.08,1.35,.06],shadow,[side*1.71,.02,z]);
  }
  for(const side of [-1,1]){
    // Layered side armor with a distinct dark gap underneath each slab.
    for(const z of [-9.7,-6.6,-3.5,-.4]){
      box(ship,[.17,1.12,2.82],shadow,[side*1.82,.1,z]);
      box(ship,[.16,.87,2.62],z===-6.6?oxide:painted,[side*1.91,.12,z]);
      box(ship,[.19,.11,2.57],steel,[side*1.96,.65,z]);
    }
    // Narrow glazed observation strip, inset into the bow module.
    box(ship,[.1,.17,2.6],glass,[side*1.48,.46,-13.2]);
    box(ship,[.12,.09,2.8],steel,[side*1.49,.58,-13.2]);
    maneuveringPod(ship,side,-12.6);maneuveringPod(ship,side,2.1);
    warningMark(ship,side*2,.74,-8.4,side);
    // Axial propellant tanks are cradled beside an open structural truss.
    cylinder(ship,.75,.75,7.8,painted,[side*2.15,-.58,7.45],16);
    cylinder(ship,.83,.83,.28,oxide,[side*2.15,-.58,3.7],16);
    cylinder(ship,.83,.83,.28,ribs,[side*2.15,-.58,11.2],16);
    for(const z of [5.2,7.5,9.8])torus(ship,.78,.09,steel,[side*2.15,-.58,z],16);
    for(const z of [4.1,8,11]){
      beam(ship,[side*1.1,-.65,z],[side*2.2,-.65,z],.12,steel);
      beam(ship,[side*1.1,.65,z],[side*2.2,-.15,z],.11,ribs);
    }
    // Two coolant pipes and a folded radiator array, with no aerodynamic wing.
    for(const y of [-1.32,-1.12]){
      cylinder(ship,.055,.055,11,oxide,[side*1.35,y,5.2],8);
      torus(ship,.12,.035,steel,[side*1.35,y,10.5],8);
    }
    radiator(ship,side);
    // Docking collar and handhold points along the hab section.
    box(ship,[.24,.85,.92],ribs,[side*1.95,-.5,-2.7]);
    cylinder(ship,.25,.25,.28,steel,[side*2.11,-.48,-2.7],12,'x');
    for(const z of [-11.5,-8.8,-5.9,-3.2,-.3,2.4]){
      part(ship,new THREE.SphereGeometry(.055,6,4),steel,[side*2.01,-.37,z]);
      part(ship,new THREE.SphereGeometry(.07,6,4),lamp,[side*1.87,1.02,z]);
    }
  }
  // Bow sensors, dorsal spine and a small bridge blister under armored brows.
  box(ship,[1.7,.66,2.1],ribs,[0,1.47,-13.1]);
  box(ship,[1.3,.18,1.6],glass,[0,1.86,-13.5]);
  box(ship,[1.85,.17,2.35],steel,[0,2,-13.05]);
  box(ship,[.86,.2,.56],oxide,[0,.2,-15.55]);
  cylinder(ship,.12,.12,1.5,steel,[0,2.6,-8],8,'y');
  part(ship,new THREE.SphereGeometry(.18,8,6),lamp,[0,3.38,-8]);
  box(ship,[.85,.3,2.5],ribs,[0,1.58,-2.7]);
  // Open aft truss: pressure spine, four longerons and diagonal load paths.
  cylinder(ship,.58,.58,8.5,shadow,[0,0,8.2],12);
  const corners=[[-1.2,-.93],[1.2,-.93],[-1.2,.93],[1.2,.93]];
  for(const [x,y] of corners){
    beam(ship,[x,y,3.8],[x,y,12.6],.115,steel);
    for(const z of [4.1,6.7,9.3,11.9])beam(ship,[x,y,z],[0,0,z+.75],.075,ribs);
  }
  for(const z of [4,6.5,9,11.5]){
    box(ship,[3.05,.12,.16],steel,[0,.92,z]);
    box(ship,[3.05,.12,.16],steel,[0,-.92,z]);
    box(ship,[.12,2.05,.16],steel,[-1.2,0,z]);
    box(ship,[.12,2.05,.16],steel,[1.2,0,z]);
  }
  // Small utility modules break the symmetry without hiding core structure.
  box(ship,[.95,.58,1.35],painted,[0,1.47,6.1]);
  box(ship,[.72,.06,1.1],oxide,[0,1.8,6.1]);
  box(ship,[.65,.48,1.1],steel,[-.7,-1.45,9.2]);
  const decal=new THREE.MeshBasicMaterial({map:stencilTexture(),transparent:true,side:THREE.DoubleSide,depthWrite:false});
  for(const side of [-1,1]){
    const marking=part(ship,new THREE.PlaneGeometry(2.35,.58),decal,[side*2.01,.06,-5.05]);
    marking.rotation.y=side*Math.PI/2;
  }
  const drive=engine(ship);
  const rcs=maneuveringJets(ship);
  return {group:ship,...drive,rcs};
}

// Static, reusable form for the mesh library baker. The live game adds exhaust.
export function buildKestrelLibrary(){
  const vessel=buildShip();
  vessel.group.remove(vessel.plume,vessel.innerPlume);
  for(const jet of vessel.rcs)vessel.group.remove(jet.flame,jet.flash);
  return vessel.group;
}
