import * as THREE from 'three';

// Small fragments share one draw call. Only the large structural pieces need
// rigid bodies; the chip pool recycles the oldest impacts during long bursts.
export function createConcreteEffects(scene) {
  const capacity = 320, data = [];
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const chips = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xb0a396, flatShading: true, roughness: 1,
  }), capacity);
  chips.count = 0;
  chips.frustumCulled = false;
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(chips);
  const transform = new THREE.Object3D();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 28; i++) {
    const x = 48 + (Math.random()-.5)*46, y = 48 + (Math.random()-.5)*46;
    const radius = 9 + Math.random()*15;
    const mist = ctx.createRadialGradient(x,y,0,x,y,radius);
    mist.addColorStop(0,'rgba(255,255,255,.34)');
    mist.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = mist;
    ctx.fillRect(x-radius,y-radius,2*radius,2*radius);
  }
  const map = new THREE.CanvasTexture(canvas);
  const clouds = [];
  // Reuse a small ragged spall mark in local mesh space so it moves with the slab.
  const markCanvas=document.createElement('canvas');markCanvas.width=markCanvas.height=64;
  const ink=markCanvas.getContext('2d');
  for(const [radius,color] of [[27,'#a49988'],[19,'#605851'],[11,'#3f3d39']]){
    ink.beginPath();
    for(let i=0;i<14;i++){
      const a=i*2*Math.PI/14,r=radius*(.65+.35*Math.random());
      const x=32+Math.cos(a)*r,y=32+Math.sin(a)*r;
      if(i)ink.lineTo(x,y);else ink.moveTo(x,y);
    }
    ink.closePath();ink.fillStyle=color;ink.fill();
  }
  const markMap=new THREE.CanvasTexture(markCanvas);markMap.colorSpace=THREE.SRGBColorSpace;
  const markMaterial=new THREE.MeshStandardMaterial({map:markMap,alphaTest:.4,roughness:1});
  const markGeometry=new THREE.PlaneGeometry(.2,.2),marks=[];
  const forward=new THREE.Vector3(0,0,1);
  function scar(hit){
    const mark=marks.length<96?new THREE.Mesh(markGeometry,markMaterial):marks.shift();
    marks.push(mark);hit.object.add(mark);
    mark.position.copy(hit.object.worldToLocal(hit.point.clone())).addScaledVector(hit.face.normal,.002);
    mark.quaternion.setFromUnitVectors(forward,hit.face.normal);
    mark.rotateZ(Math.random()*Math.PI*2);mark.scale.setScalar(.72+Math.random()*.55);
  }
  let cursor = 0;
  function impact(point, normal, broken) {
    for (let i = 0; i < (broken ? 18 : 6); i++) {
      const size = (.018 + Math.random()**2 * (broken ? .12 : .055));
      const position = point.clone().addScaledVector(normal,.035);
      const velocity = new THREE.Vector3((Math.random()-.5)*3,Math.random()*2,(Math.random()-.5)*3)
        .addScaledVector(normal,1+Math.random()*3);
      data[cursor] = {position,velocity,size,angle:Math.random()*6,atRest:false};
      cursor = (cursor+1)%capacity;
    }
    chips.count = data.length;
    let puff = clouds.find(p=>!p.sprite.visible);
    if (!puff && clouds.length < 36) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map, color:0xb5a598, transparent:true, depthWrite:false,
      }));
      scene.add(sprite);
      puff = {sprite}; clouds.push(puff);
    }
    if (!puff) return;
    puff.sprite.position.copy(point).addScaledVector(normal,.07);
    puff.sprite.visible = true;
    puff.sprite.material.rotation = Math.random()*6;
    puff.age = 0; puff.life = broken ? .75 : .4;
    puff.velocity = normal.clone().multiplyScalar(.65);
    puff.velocity.y += .38;
    puff.width = broken ? 1.35 : .65;
  }
  function update(dt) {
    let dirty = false;
    for (let i=0;i<data.length;i++) {
      const c=data[i];
      if(c.atRest)continue;
      dirty=true;
      c.velocity.y-=9.81*dt;
      c.position.addScaledVector(c.velocity,dt);
      c.angle+=dt*c.velocity.length()*2;
      if(c.position.y<c.size*.6+.02){
        c.position.y=c.size*.6+.02;
        c.velocity.y=Math.abs(c.velocity.y)*.23;
        c.velocity.x*=.58; c.velocity.z*=.58;
        c.atRest=c.velocity.lengthSq()<.10;
      }
      transform.position.copy(c.position);
      transform.rotation.set(c.angle,c.angle*.65,c.angle*.9);
      transform.scale.set(c.size*1.35,c.size*.62,c.size);
      transform.updateMatrix();
      chips.setMatrixAt(i,transform.matrix);
    }
    if(dirty)chips.instanceMatrix.needsUpdate=true;
    for(const p of clouds)if(p.sprite.visible){
      p.age+=dt;
      const t=Math.min(1,p.age/p.life);
      p.sprite.position.addScaledVector(p.velocity,dt);
      p.sprite.scale.setScalar((.2+t)*p.width);
      p.sprite.material.opacity=.64*(1-t)**1.5;
      p.sprite.visible=t<1;
    }
  }
  return {impact,scar,update};
}
