import * as THREE from 'three';
import RAPIER from '../box-physics/vendor/rapier.mjs';

// Keep the half-plane ax + by <= c, interpolating each crossing edge.
function clip(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const d = a*p.x + b*p.y - c, e = a*q.x + b*q.y - c;
    if (d <= 0) out.push(p);
    if ((d <= 0) !== (e <= 0)) out.push(p.clone().lerp(q, d/(d-e)));
  }
  return out;
}

function faceTexture(number, hazardStripes) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = '#aea9a2'; c.fillRect(0,0,1024,512);
  for (let i=0;i<1600;i++) {
    const x=Math.random()*1024,y=Math.random()*512,r=4+Math.random()*24;
    const patch=c.createRadialGradient(x,y,0,x,y,r);
    patch.addColorStop(0,i%2?'#534a4813':'#e5ddd213');patch.addColorStop(1,'transparent');
    c.fillStyle=patch;c.fillRect(x-r,y-r,r*2,r*2);
  }
  for (let i=0;i<58000;i++) {
    c.fillStyle = Math.random()>.5?'#ffffff18':'#3830251c';
    c.fillRect(Math.random()*1024,Math.random()*512,2,2);
  }
  if(hazardStripes){
    c.fillStyle='#e7ae47';c.fillRect(0,312,1024,120);
    c.save();c.beginPath();c.rect(0,312,1024,120);c.clip();c.fillStyle='#273537';
    for(let x=-128;x<1100;x+=150){c.beginPath();c.moveTo(x,432);c.lineTo(x+60,432);c.lineTo(x+180,312);c.lineTo(x+120,312);c.fill();}
    c.restore();
  }else{
  c.fillStyle='#ab582f'; c.fillRect(0,394,1024,20);
  c.fillStyle='#343c39'; c.font='bold 82px Helvetica'; c.fillText(number,40,112);
  c.font='bold 17px monospace'; c.fillText('ARES  /  MATERIALS LAB',44,145);
  c.fillRect(880,65,85,5);
  for(let i=0;i<8;i++) c.fillRect(880+i*12,70,2,i%2?10:18);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}

export function createWall(scene, world, {x,z,width,height,cols,rows,number,seed,hazardStripes,faceMap}) {
  function random() { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }
  const seeds=[], cells=[], edges=new Map(), bonds=[];
  const thickness=.65, texture=faceMap??faceTexture(number,hazardStripes);
  // A second tiled texture keeps fresh aggregate at a consistent scale on cut edges.
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#877d73';ctx.fillRect(0,0,128,128);
  for(let i=0;i<5500;i++){
    const tone=Math.floor(67+random()*127);
    ctx.fillStyle='rgb('+tone+','+(tone-5)+','+(tone-10)+')';
    ctx.fillRect(random()*128,random()*128,1+random()*3,1+random()*2);
  }
  const aggregate=new THREE.CanvasTexture(canvas);aggregate.colorSpace=THREE.SRGBColorSpace;
  aggregate.wrapS=aggregate.wrapT=THREE.RepeatWrapping;
  const core=new THREE.MeshStandardMaterial({map:aggregate,bumpMap:aggregate,bumpScale:.024,roughness:1});
  // Sparse parent sites make broad slabs; satellite sites make pockets of splinters.
  const count=Math.round(cols*rows*.64);
  for(let i=0;i<count;i++){
    const s=new THREE.Vector2(random()*width,random()*height);
    seeds.push(s);
    if(i%3===0)for(let k=0;k<2;k++){
      const a=random()*2*Math.PI,r=.22+random()*.32;
      const t=new THREE.Vector2(s.x+r*Math.cos(a),s.y+r*Math.sin(a));
      if(t.x>.02&&t.x<width-.02&&t.y>.02&&t.y<height-.02)seeds.push(t);
    }
  }
  for(const s of seeds) {
    let poly=[[0,0],[width,0],[width,height],[0,height]].map(([u,v])=>new THREE.Vector2(u,v));
    for(const t of seeds) if(t!==s)
      poly=clip(poly,t.x-s.x,t.y-s.y,(t.lengthSq()-s.lengthSq())/2);
    const center=poly.reduce((sum,p)=>sum.add(p),new THREE.Vector2()).divideScalar(poly.length);
    const shape=new THREE.Shape(poly.map(p=>p.clone().sub(center).multiplyScalar(.995)));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});
    geo.translate(0,0,-thickness/2);
    const {position,uv}=geo.attributes;
    const wallX=x-width/2+center.x;
    const {normal}=geo.attributes;
    for(let i=0;i<position.count;i++){
      const u=position.getX(i)+center.x,v=position.getY(i)+center.y,d=position.getZ(i);
      if(Math.abs(normal.getZ(i))>.95)uv.setXY(i,u/width,v/height);
      else uv.setXY(i,(u*normal.getY(i)-v*normal.getX(i))*1.6,d*1.6);
      // Shared shear keeps neighboring prisms interlocked through the wall depth.
      position.setX(i,position.getX(i)+d*.32);
    }
    geo.computeVertexNormals();
    const face=new THREE.MeshStandardMaterial({map:texture,color:new THREE.Color().setScalar(.93+.06*random()),roughness:1});
    const mesh=new THREE.Mesh(geo,[face,core]);
    mesh.position.set(wallX,center.y,z);
    mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(wallX,center.y,z)
      .setAngularDamping(.22).setLinearDamping(.1));
    const collider=world.createCollider(RAPIER.ColliderDesc.convexHull(position.array)
      .setCollisionGroups(0x00020004).setFriction(.78).setRestitution(.12).setDensity(2),body);
    const area=Math.abs(THREE.ShapeUtils.area(poly));
    const bodySlice=clip(clip(poly,0,1,1.8),0,-1,-.05);
    const cell={mesh,body,collider,hp:Math.min(5,Math.max(2,Math.round(2+area*1.5))),solid:true,bonds:[],base:poly.some(p=>p.y<1e-5),
      left:Math.min(...bodySlice.map(p=>p.x))+x-width/2,right:Math.max(...bodySlice.map(p=>p.x))+x-width/2};
    cell.spanAt = h=>{
      const slice=clip(poly,0,1,h);
      return [Math.min(...slice.map(p=>p.x))+x-width/2-.11,Math.max(...slice.map(p=>p.x))+x-width/2+.11];
    };
    cells.push(cell);
    const key=p=>Math.round(p.x*1e5)+','+Math.round(p.y*1e5);
    for(let i=0;i<poly.length;i++){
      const edge=[key(poly[i]),key(poly[(i+1)%poly.length])].sort().join('|');
      const other=edges.get(edge);
      if(other){
        const a=poly[i],b=poly[(i+1)%poly.length];
        const bond={a:other,b:cell,x:x-width/2+(a.x+b.x)/2,y:(a.y+b.y)/2,
          strength:.4+1.45*a.distanceTo(b)};
        other.bonds.push(bond);cell.bonds.push(bond);bonds.push(bond);
      }else edges.set(edge,cell);
    }
  }
  const byMesh=new Map(cells.map(c=>[c.mesh,c]));
  function strike(mesh, direction, point) {
    const target=byMesh.get(mesh);
    if(!target.solid){
      target.body.applyImpulseAtPoint(direction.clone().multiplyScalar(.85),point,true);
      return 0;
    }
    // A compact strain field weakens bonds near the actual impact. A hit
    // at a narrow joint can start a different break than a hit at its center.
    for(const bond of bonds){
      if(bond.strength<=0||!bond.a.solid||!bond.b.solid)continue;
      const distance=Math.hypot(point.x-bond.x,point.y-bond.y);
      if(distance<1.15)bond.strength-=1.55*(1-distance/1.15);
    }
    target.hp-=2;
    return releaseUnsupported(target,direction);
  }

  function blast(point, power=1, radius=3.6){
    if(Math.abs(point.z-z)<radius+thickness){
      for(const bond of bonds){
        const d=Math.hypot(point.x-bond.x,point.y-bond.y,point.z-z);
        bond.strength-=7*power*Math.max(0,1-d/radius);
      }
      for(const c of cells)if(c.solid){
        const d=c.mesh.position.distanceTo(point);
        c.hp-=11*power*Math.max(0,1-d/radius);
      }
    }
    const released=releaseUnsupported(null,null);
    for(const c of cells)if(!c.solid){
      const delta=c.mesh.position.clone().sub(point);
      const falloff=Math.max(0,1-delta.length()/(radius+1));
      if(falloff){
        delta.y+=.55;
        const impulse=delta.normalize().multiplyScalar(7*falloff*Math.sqrt(c.body.mass()));
        c.body.applyImpulse(impulse,true);
      }
    }
    return released;
  }

  function releaseUnsupported(target,direction){
    const stack=cells.filter(c=>c.solid&&c.base&&c.hp>0);
    const supported=new Set(stack);
    while(stack.length){
      const cell=stack.pop();
      for(const bond of cell.bonds){
        const n=bond.a===cell?bond.b:bond.a;
        if(bond.strength<=0||!n.solid||supported.has(n)||n.hp<=0)continue;
        supported.add(n);stack.push(n);
      }
    }
    let detached=0;
    for(const c of cells){
      if(!c.solid||supported.has(c))continue;
      c.solid=false; detached++;
      c.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);
      // Let freshly separated faces clear the tight fracture seam. During
      // this short interval chunks still collide with the floor and other rubble.
      c.separationTime=.22;
      c.collider.setCollisionGroups(0x00040005);
      const side=c===target?Math.sign(direction.z||-1):(random()>.5?1:-1);
      const speed=c===target?3.5/Math.sqrt(Math.max(.5,c.body.mass())):.75+random();
      c.body.setLinvel({x:side*speed*.32+(random()-.5)*.45,y:random()*.45,z:side*speed},true);
      c.body.setAngvel({x:side*(.55+random()),y:random()-.5,z:random()*.8-.4},true);
    }
    return detached;
  }
  function update(dt){
    for(const c of cells) if(!c.solid){
      if(c.separationTime>0){
        c.separationTime-=dt;
        if(c.separationTime<=0)c.collider.setCollisionGroups(0x00040007);
      }
      c.mesh.position.copy(c.body.translation());
      c.mesh.quaternion.copy(c.body.rotation());
    }
  }
  function blocks(px,pz){
    const dz=Math.max(0,Math.abs(pz-z)-thickness/2);
    return dz<.3&&cells.some(c=>c.solid&&Math.hypot(dz,Math.max(c.left-px-.32*thickness/2,px-c.right-.32*thickness/2,0))<.3);
  }
  return {cells,byMesh,strike,blast,blocks,update};
}
