import * as T from 'three';
import {model} from '../castle-siege/keep.js';
import {random,standard,squadBanner} from '../eagle-ford/field.js';
import {engine,quarry,wallZ,sectionX} from './story.js';
import {createWall} from '../destructable-meshes/fracture.js';
import {createConcreteEffects} from '../destructable-meshes/concrete.js';
import R from '../box-physics/vendor/rapier.mjs';

const rand=random(718);
const road=z=>3.4*Math.sin((z-48)*.102);
export function height(x,z){
  const ridge=8.1*Math.exp(-((z-28)**2)/46);
  const woods=Math.min(1,Math.max(0,(z-35)/10));
  const slope=ridge+woods*(1.8+.75*Math.sin(z*.13)+.45*Math.sin(x*.32+z*.07));
  const camp=T.MathUtils.smoothstep(x,2,4)*(1-T.MathUtils.smoothstep(Math.abs(z-36),3.6,7));
  return T.MathUtils.lerp(slope,2.05,camp);
}
const library={
  grass:['Plants/DryGrass',.36],stonePine:['Trees/StonePine',8.6],pine:['Trees/Pino',10],oak:['Trees/ArbolBosque',8],shrub:['Plants/FernClump',.58],
  stone:['Rocks/MossStone',1.4],wagon:['Camp/SupplyWagon',2.1],rack:['Camp/WeaponRack',1.7],
  tent:['Camp/AFrameTent',3.3],lamp:['Camp/TorchTripod',2],sled:['Camp/TimberStoneSled',1],
  keep:['Fort/CastleKeep',12],engine:['Weapons/Catapulta',2.6],log:['Deadwood/FallenLog',1.1]
};
export async function loadLand(){
  return Object.fromEntries(await Promise.all(Object.entries(library).map(async ([id,[path,h]])=>[id,await model(path,h)])));
}
function tile(name){
  const t=new T.TextureLoader().load('/games-3d/textures/'+name+'.jpg');
  t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}
const mat=color=>new T.MeshStandardMaterial({color,roughness:.97});
function box(group,w,h,d,x,y,z,material){
  const o=new T.Mesh(new T.BoxGeometry(w,h,d),material);o.position.set(x,y,z);group.add(o);return o;
}
function brickFace(){
  const c=document.createElement('canvas');c.width=c.height=512;
  const ctx=c.getContext('2d');ctx.fillStyle='#665d50';ctx.fillRect(0,0,512,512);
  for(let j=0;j<14;j++)for(let i=-1;i<8;i++){
    const x=(i+j%2*.5)*68,y=j*38,n=Math.floor(rand()*32)+134;
    ctx.fillStyle='rgb('+n+','+(n-7)+','+(n-23)+')';ctx.fillRect(x+1,y+1,66,36);
    ctx.fillStyle='#e4d7b669';ctx.fillRect(x+2,y+2,64,2);
    ctx.fillStyle='#40362e44';ctx.fillRect(x+3,y+34,63,3);
  }
  for(let i=0;i<14000;i++){ctx.fillStyle=i%2?'#2c261525':'#ffefd82a';ctx.fillRect(rand()*512,rand()*512,3,2);}
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}
export function buildLand(scene,assets){
  scene.fog=new T.FogExp2(0xc0b29a,.014);
  scene.add(new T.HemisphereLight(0xffe5b8,0x8c9f8c,1.9));
  const sun=new T.DirectionalLight(0xffdbad,2.35);sun.position.set(-24,32,15);scene.add(sun);
  const sky=new T.Mesh(new T.SphereGeometry(345,40,24),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,vertexShader:'varying vec3 d; void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 d;void main(){vec3 n=normalize(d);float t=smoothstep(-.06,.68,n.y);
      vec3 col=mix(vec3(.92,.76,.55),vec3(.23,.41,.48),t);
      float s=distance(n,normalize(vec3(-.6,.18,-1.))); col+=vec3(.27,.18,.07)*exp(-s*7.);
      col=mix(col,vec3(1.,.92,.72),1.-smoothstep(.037,.04,s));gl_FragColor=vec4(col,1.);}`}));
  scene.add(sky);
  const terrain=new T.PlaneGeometry(240,245,140,174);terrain.rotateX(-Math.PI/2);terrain.translate(0,0,42);
  const pos=terrain.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setY(i,height(pos.getX(i),pos.getZ(i))-.035);
  terrain.computeVertexNormals();
  const ground=new T.MeshStandardMaterial({map:tile('ground_mossy'),roughness:1});
  const dirt=tile('ground_dirt'),field=tile('grass_dry');
  ground.onBeforeCompile=s=>{
    s.uniforms.dirt={value:dirt};s.uniforms.field={value:field};
    s.vertexShader='varying vec2 earth;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nearth=position.xz;');
    s.fragmentShader='varying vec2 earth;uniform sampler2D dirt;uniform sampler2D field;\n'+s.fragmentShader.replace('#include <map_fragment>',`
      vec2 uv=earth*.19;float center=3.4*sin((earth.y-48.)*.102);
      float noise=sin(earth.x*1.1+earth.y*.7)*.24+sin(earth.y*.32)*.32;
      float trail=1.-smoothstep(2.2,4.3,abs(earth.x-center)+noise);
      float ruts=1.-smoothstep(.08,.22,abs(abs(earth.x-center)-.94));
      vec3 grass=mix(texture2D(field,uv).rgb,texture2D(map,uv).rgb,smoothstep(22.,42.,earth.y));
      vec3 earthColor=texture2D(dirt,uv*.8).rgb*vec3(1.12,1.03,.87);
      diffuseColor.rgb*=mix(grass,earthColor*(1.-.19*ruts),trail*.92);
    `);
  };
  scene.add(new T.Mesh(terrain,ground));
  // Batch repeated library meshes, including their original material and local transforms.
  const lists=new Map();
  function scatter(id,x,z,size=1,yaw=0){
    if(!lists.has(id))lists.set(id,[]);
    const p=new T.Object3D();p.position.set(x,height(x,z),z);p.scale.setScalar(size);p.rotation.y=yaw;p.updateMatrix();
    lists.get(id).push(p.matrix);
  }
  for(let i=0;i<195;i++){
    const z=28+rand()*106,side=rand()>.5?1:-1,x=road(z)+side*(6.1+rand()**1.4*54);
    if(z<42&&Math.abs(x)<10)continue;
    scatter(['stonePine','pine','oak','stonePine'][i%4],x,z,.58+rand()*.6,rand()*6.28);
  }
  for(let i=0;i<190;i++){
    const z=12+rand()*109,x=road(z)+(rand()>.5?1:-1)*(4.9+rand()*26);
    scatter(i%4?'shrub':'stone',x,z,.4+rand()*.85,rand()*6.28);
  }
  for(let i=0;i<630;i++){
    const z=14+rand()*109,x=road(z)+(rand()>.5?1:-1)*(2.9+rand()**1.5*17);
    scatter('grass',x,z,.4+rand()*.95,rand()*6);
  }
  for(let i=0;i<32;i++)scatter('pine',(i%2?1:-1)*(27+rand()*42),-47+rand()*65,.8+rand()*.55,rand()*6);
  scatter('wagon',-2.8,110,.95,-.7);scatter('log',4.5,103,.83,.6);scatter('log',-7.2,89,1.2,-.4);
  scatter('wagon',-6,50,1.1,-1.1);scatter('rack',-4.6,46.6,1,.4);
  scatter('tent',8.7,35.1,.95,-.72);scatter('lamp',6.8,37.6,.85);
  scatter('tent',-21,19,.85,-1.3);scatter('tent',-25,14.8,.95,-.9);
  scatter('sled',quarry.x,quarry.z,1.1,-.35);
  scatter('keep',0,-27,1.15,Math.PI);
  for(const [id,matrices] of lists){
    const src=assets[id];src.updateMatrixWorld(true);
    src.traverse(n=>{if(!n.isMesh)return;
      const mesh=new T.InstancedMesh(n.geometry,n.material,matrices.length);
      matrices.forEach((m,i)=>mesh.setMatrixAt(i,new T.Matrix4().multiplyMatrices(m,n.matrixWorld)));
      mesh.computeBoundingSphere();scene.add(mesh);
    });
  }
  const shadeCanvas=document.createElement('canvas');shadeCanvas.width=shadeCanvas.height=64;
  const pen=shadeCanvas.getContext('2d'),fade=pen.createRadialGradient(32,32,2,32,32,32);
  fade.addColorStop(0,'rgba(29,35,23,.48)');fade.addColorStop(.58,'rgba(29,35,23,.27)');fade.addColorStop(1,'rgba(29,35,23,0)');
  pen.fillStyle=fade;pen.fillRect(0,0,64,64);
  const shadeMaterial=new T.MeshBasicMaterial({map:new T.CanvasTexture(shadeCanvas),transparent:true,depthWrite:false});
  const patches=['pine','oak','stonePine','wagon','tent','stone','rack','log'].flatMap(id=>(lists.get(id)||[]).map(m=>[id,m]));
  const shadeGeo=new T.PlaneGeometry(1,1);shadeGeo.rotateX(-Math.PI/2);
  const shadows=new T.InstancedMesh(shadeGeo,shadeMaterial,patches.length),local=new T.Object3D();
  patches.forEach(([id,m],i)=>{
    const x=m.elements[12],z=m.elements[14],tree=['oak','pine','stonePine'].includes(id);
    const w=tree?6:id==='stone'?1.9:3;
    local.position.set(x+w*.18,height(x+w*.18,z)+.03,z-.12);
    local.rotation.set(-Math.atan2(height(x,z+.3)-height(x,z-.3),.6),0,Math.atan2(height(x+.3,z)-height(x-.3,z),.6));
    local.scale.set(w*1.3,1,w*.8);local.updateMatrix();shadows.setMatrixAt(i,local.matrix);
  });scene.add(shadows);
  const mountains=new T.PlaneGeometry(360,75,74,13);mountains.rotateX(-Math.PI/2);mountains.translate(0,0,-73);
  const mp=mountains.attributes.position;
  for(let i=0;i<mp.count;i++){const x=mp.getX(i),z=mp.getZ(i);
    mp.setY(i,Math.max(0,1-Math.abs(z+72)/35)*(14+7*Math.sin(x*.065)+2.5*Math.sin(x*.29))+rand()*1.1-1);}
  mountains.computeVertexNormals();scene.add(new T.Mesh(mountains,mat(0x617875)));
  for(const [x,z] of [[-7,80],[5,57],[-5,17],[-14,5],[15,3]]){const b=squadBanner();b.position.set(x,height(x,z),z);scene.add(b);}
  const fort=new T.Group();scene.add(fort);
  const stone=new T.MeshStandardMaterial({map:brickFace()}),dark=mat(0x342d27),red=mat(0x752c27),gold=mat(0xd0ac67);
  for(const x of [-15.6,15.6]){
    box(fort,15.6,5.25,1,x,2.625,wallZ,stone);
    for(let i=0;i<12;i++)box(fort,.7,.68,1,x-7.3+i*1.3,5.56,wallZ,stone);
    box(fort,.9,5.25,21,Math.sign(x)*23.2,2.625,wallZ-10.5,stone);
  }
  box(fort,46,5,1,0,2.5,-31,stone);
  for(const x of [-23,-9.3,9.3,23]){
    const tower=new T.Mesh(new T.CylinderGeometry(2.2,2.45,7.4,10),stone);tower.position.set(x,3.7,wallZ);fort.add(tower);
    for(let j=0;j<9;j++){const a=j*2*Math.PI/9;box(fort,.79,1,.55,x+1.96*Math.sin(a),7.8,wallZ+1.96*Math.cos(a),stone).rotation.y=a;}
    box(fort,.25,1.15,.18,x,5.9,wallZ+2.2,dark);box(fort,.9,2.3,.12,x-.8,4.2,wallZ+2.14,red);
    box(fort,1.07,.12,.16,x-.8,5.39,wallZ+2.14,gold);
  }
  const wood=mat(0x73583a);
  for(const x of [-16,14,19]){
    const ladder=new T.Group();ladder.position.set(x,0,wallZ+2.5);ladder.rotation.x=-.34;fort.add(ladder);
    for(const side of [-.38,.38])box(ladder,.11,6.8,.11,side,3.4,0,wood);
    for(let j=1;j<13;j++)box(ladder,.82,.09,.12,0,j*.5,0,wood);
  }
  const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=64;
  const sc=smokeCanvas.getContext('2d'),sg=sc.createRadialGradient(32,32,1,32,32,32);
  sg.addColorStop(0,'#4f443cb0');sg.addColorStop(.55,'#685f554d');sg.addColorStop(1,'#78706500');sc.fillStyle=sg;sc.fillRect(0,0,64,64);
  const smokeMap=new T.CanvasTexture(smokeCanvas),smoke=[];
  for(let i=0;i<24;i++){
    const puff=new T.Sprite(new T.SpriteMaterial({map:smokeMap,transparent:true,depthWrite:false}));
    puff.visible=false;scene.add(puff);smoke.push(puff);
  }
  const volley=new T.InstancedMesh(new T.CylinderGeometry(.022,.026,.88,4),dark,18);
  volley.frustumCulled=false;scene.add(volley);
  const physical=new R.World({x:0,y:-9.81,z:0});
  physical.createCollider(R.ColliderDesc.cuboid(60,.15,60).setTranslation(0,-.15,0).setCollisionGroups(0x00010004));
  const dust=createConcreteEffects(scene),panels=[];
  for(const x of sectionX){
    const map=brickFace(),surface=new T.MeshStandardMaterial({map}),intact=new T.Group();
    fort.add(intact);box(intact,5.2,5.25,.7,x,2.625,wallZ,surface);
    for(let j=0;j<4;j++)box(intact,.67,.65,.7,x-1.97+j*1.3,5.55,wallZ,stone);
    panels.push({map,intact,x,fracture:null,marks:0});
  }
  function damage(lane,count,live=true){
    const p=panels[lane],ctx=p.map.image.getContext('2d'),target=new T.Vector3(p.x,2.05,wallZ+.35);
    while(p.marks<count){
      const n=++p.marks;ctx.strokeStyle='#443a2c';ctx.lineWidth=2+n*.6;ctx.lineJoin='bevel';
      for(let arm=0;arm<5;arm++){const a=arm*1.26+.52;
        ctx.beginPath();for(let j=0;j<=n*2;j++){
          const r=j*10,angle=a+Math.sin(j*2.4+arm)*.14;
          const x=256+Math.cos(angle)*r,y=312+Math.sin(angle)*r;
          if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }ctx.stroke();
      }p.map.needsUpdate=true;
    }
    if(count===5&&!p.fracture){
      p.intact.visible=false;
      p.fracture=createWall(scene,physical,{x:p.x,z:wallZ,width:5.2,height:5.25,cols:8,rows:7,seed:145+lane,faceMap:p.map});
      p.fracture.blast(target,2.8,8);
    }
    if(live)dust.impact(target,new T.Vector3(0,.13,1),true);
  }
  // The Catapulta library mesh contains its timber frame, spoon and arm in one mesh.
  // Separate the narrow central timbers so the loaded stone travels with the spoon.
  let chassis;assets.engine.traverse(o=>{if(o.isMesh)chassis=o;});
  const geometry=chassis.geometry,position=geometry.attributes.position,armFaces=[],frameFaces=[];
  for(let i=0;i<position.count;i+=3){
    const face=[i,i+1,i+2];
    const moving=face.every(j=>Math.abs(position.getX(j))<9.1&&position.getY(j)>22&&position.getZ(j)<23);
    (moving?armFaces:frameFaces).push(...face);
  }
  const armGeometry=geometry.clone();armGeometry.setIndex(armFaces);armGeometry.clearGroups();
  geometry.setIndex(frameFaces);geometry.clearGroups();
  const pivot=new T.Group();pivot.position.set(0,26,18);chassis.add(pivot);
  const arm=new T.Mesh(armGeometry,chassis.material);arm.position.copy(pivot.position).multiplyScalar(-1);pivot.add(arm);
  const cup=new T.Object3D();cup.position.set(0,21,-66);pivot.add(cup);
  const cat=new T.Group();cat.add(assets.engine);assets.engine.rotation.y=Math.PI;cat.position.set(engine.x,0,engine.z);scene.add(cat);
  const rockGeo=new T.IcosahedronGeometry(.38,1),rockMat=mat(0x68685c);
  for(let i=0;i<8;i++){const s=new T.Mesh(rockGeo,rockMat);
    s.position.set(quarry.x+(i%3-1)*.55,.63+Math.floor(i/6)*.5,quarry.z+Math.floor(i%6/3)*.55);scene.add(s);}
  const ball=new T.Mesh(rockGeo,rockMat);scene.add(ball);
  const eagle=standard();eagle.scale.setScalar(1.35);scene.add(eagle);
  const ring=new T.Mesh(new T.RingGeometry(.82,.89,50),new T.MeshBasicMaterial({color:0xfbd483,transparent:true,opacity:.9,side:T.DoubleSide}));
  ring.rotation.x=-Math.PI/2;scene.add(ring);
  const reticle=new T.Mesh(new T.RingGeometry(.45,.5,40),new T.MeshBasicMaterial({color:0xffdf7b,depthTest:false}));reticle.renderOrder=4;scene.add(reticle);
  let physicalTime=0;
  function update(b,dt){
    const m=b.moment,t=b.target();ring.visible=Number.isFinite(t?.x)&&!b.mounted&&!b.shot&&m.kind!=='film'&&m.kind!=='end';
    if(ring.visible){ring.position.set(t.x,height(t.x,t.z)+.07,t.z);ring.scale.setScalar(1+.07*Math.sin(b.time*3));}
    const siege=b.index>=12;scene.fog.density=siege?.014:.022;
    for(const [i,puff] of smoke.entries()){
      puff.visible=siege;if(!siege)continue;
      const t=(b.time*.115+(i%12)/12)%1;
      puff.position.set((i<12?-14:17)+t*2.8+Math.sin(i+2*t)*.38,4.8+t*9,wallZ-2-t*1.4);
      puff.scale.setScalar(1.4+t*5);puff.material.rotation=i*.8+t*.5;puff.material.opacity=Math.sin(t*Math.PI)*.66;
    }
    volley.visible=siege&&b.index<18;
    if(volley.visible)for(let i=0;i<18;i++){
      const t=(b.time*.59+i*.018)%1,side=i%2?1:-1;
      local.position.set(side*(8.5+i%9*1.42)+.6*t,5.8*(1-t)+14*t*(1-t),wallZ+15*t);
      local.rotation.set(Math.atan2(15,8.2-28*t),0,0);local.scale.setScalar(1);local.updateMatrix();volley.setMatrixAt(i,local.matrix);
    }
    volley.instanceMatrix.needsUpdate=true;
    cat.rotation.y=Math.atan2(-sectionX[b.aim],engine.z-wallZ);
    pivot.rotation.x=b.shot?Math.min(1,b.shot.t/.16)*1.04:Math.max(0,pivot.rotation.x-dt*2.7);
    reticle.visible=b.mounted&&!b.shot;reticle.position.set(sectionX[b.aim],2.05,wallZ+.46);
    ball.visible=!!(b.carried||b.shot);
    if(b.shot){
      const k=Math.max(0,(b.shot.t-.16)/1.19);cup.getWorldPosition(ball.position);
      ball.position.lerp(new T.Vector3(sectionX[b.shot.lane],2.05,wallZ+.35),k);ball.position.y+=6*4*k*(1-k);
    }else if(b.mounted)cup.getWorldPosition(ball.position);
    else if(b.carried)ball.position.set(b.hero.x+.32,1+height(b.hero.x,b.hero.z),b.hero.z-.33);
    if(panels.some(p=>p.fracture)&&dt>0){physicalTime+=dt;while(physicalTime>=1/60){physical.step();physicalTime-=1/60;}
      for(const p of panels)p.fracture?.update(dt);}
    dust.update(dt);
  }
  return {damage,update,eagle,panels};
}
