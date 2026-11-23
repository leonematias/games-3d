import * as THREE from 'three';
import { createTerrain } from '../mars/terrain.js';
import {buildSpaceport} from './spaceport.js';
import { MODULE_BUILDERS } from '../mars/base.js';

export function createRoute(points) {
  let length = 0;
  const segments = points.slice(1).map((b, i) => {
    const a = points[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const seg = { a, b, dx, dz, len, start: length }; length += len; return seg;
  });
  function at(distance, offset = 0) {
    const s = Math.max(0, Math.min(length, distance));
    const seg = segments.find(v => v.start + v.len >= s) || segments.at(-1);
    const t = (s - seg.start) / seg.len;
    return { x: seg.a[0] + seg.dx * t - seg.dz / seg.len * offset, z: seg.a[1] + seg.dz * t + seg.dx / seg.len * offset, yaw: Math.atan2(-seg.dx, -seg.dz) };
  }
  function nearest(x, z) {
    let best = { distance: Infinity, s: 0, x: 0, z: 0 };
    for (const v of segments) {
      const t = THREE.MathUtils.clamp(((x - v.a[0]) * v.dx + (z - v.a[1]) * v.dz) / (v.len * v.len), 0, 1);
      const px = v.a[0] + v.dx * t, pz = v.a[1] + v.dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best.distance) best = { distance: d, s: v.start + v.len * t, x: px, z: pz };
    }
    return best;
  }
  return { length, at, nearest };
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,250,220,1)'); g.addColorStop(.12,'rgba(255,220,150,.9)'); g.addColorStop(.34,'rgba(255,165,80,.2)'); g.addColorStop(1,'rgba(255,130,50,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,128,128); return new THREE.CanvasTexture(c);
}

export async function createWorld(scene, level, environment) {
  const response = await fetch(`/games-3d/mars-shooter/assets/${level.assets}/heightmap.f32`);
  if (!response.ok) throw new Error('Canyon heightmap unavailable');
  const values = new Float32Array(await response.arrayBuffer());
  if (values.length !== level.resolution ** 2) throw new Error('Invalid canyon heightmap');
  const heights = Float32Array.from(values, v => v / level.maxHeight);
  const terrain = createTerrain({ heightmap: {width:level.resolution,height:level.resolution,heights}, size:level.size,maxHeight:level.maxHeight,colorTexture:`/games-3d/mars-shooter/assets/${level.assets}/albedo.jpg`,rockColor:'#77412d',apronColor:'#ae6040' });
  terrain.mesh.castShadow = true;
  terrain.mesh.material.bumpScale = .22;
  // World-space grain and sediment bands keep steep walls detailed instead of stretching a top-down texture.
  terrain.mesh.material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vRockPosition; varying vec3 vRockNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPosition = position; vRockNormal = normal;');
    shader.fragmentShader = 'varying vec3 vRockPosition; varying vec3 vRockNormal;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float grain = fract(sin(dot(floor(vRockPosition * 32.0), vec3(12.9898,78.233,43.212))) * 43758.5453);
      float strata = sin(vRockPosition.y * 3.8 + sin(vRockPosition.x*.27) + sin(vRockPosition.z*.3));
      float fine = sin(vRockPosition.y*22.0+sin(vRockPosition.x*1.3)*2.0);
      float rocky = 1.0 - smoothstep(.45,.88,abs(normalize(vRockNormal).y));
      diffuseColor.rgb *= .94 + grain*.12 + rocky*(strata*.17+fine*.055);
      float mineral = smoothstep(.89,.99,sin(vRockPosition.y*.92+sin(vRockPosition.x*.055)+cos(vRockPosition.z*.065)));
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.43,.28,.17),mineral*rocky*.35);
    `);
  };
  scene.add(terrain.group);
  scene.fog = new THREE.FogExp2(level.fog,level.mode==='defense'?.005:.008+(level.order-1)*.001);
  const hemi = new THREE.HemisphereLight(0xadc8dc, 0x66301c, 2.25); scene.add(hemi);
  const sunDirection = new THREE.Vector3(...level.sun).normalize();
  const sun = new THREE.DirectionalLight(0xffd3a0, 3.6); sun.position.copy(sunDirection).multiplyScalar(110); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:.5,far:240}); sun.shadow.bias=-.00035; sun.shadow.normalBias=.35; scene.add(sun,sun.target);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900,32,20),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{sun:{value:sunDirection}},vertexShader:'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vDirection; uniform vec3 sun;
    void main(){vec3 d=normalize(vDirection);float h=clamp(d.y,0.,1.);vec3 col=mix(vec3(.76,.43,.27),vec3(.14,.23,.31),pow(h,.55));float s=max(0.,dot(d,sun));col+=vec3(1.,.58,.29)*pow(s,35.)*.38;col+=vec3(1.,.89,.66)*pow(s,1500.)*3.;gl_FragColor=vec4(col,1.);}` }));
  scene.add(sky);
  const glow = glowTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({map:glow,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  sunSprite.scale.set(80,80,1); scene.add(sunSprite);
  // Small rocks: one instanced draw, concentrated around the canyon floor.
  const route = createRoute(level.path), rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x88503a,roughness:1,flatShading:true}),1600);
  let seed=70; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; const dummy=new THREE.Object3D();
  for(let i=0;i<1600;i++) {const p=route.at(random()*route.length,(random()-.5)*35),scale=.05+random()**3*.8;dummy.position.set(p.x,terrain.heightAt(p.x,p.z)-scale*.22,p.z);dummy.rotation.set(random()*3,random()*6,random()*3);dummy.scale.set(scale*(1+random()),scale*.7,scale);if(level.mode==='defense'&&(Math.hypot(p.x,p.z)<19||[[-10,-17],[10,-17],[-10,17],[10,17]].some(([x,z])=>Math.hypot(p.x-x,p.z-z)<5.5)))dummy.scale.multiplyScalar(.12);dummy.updateMatrix();rock.setMatrixAt(i,dummy.matrix);}
  rock.receiveShadow=true;rock.castShadow=true;scene.add(rock);
  const dustPositions=new Float32Array(700*3);
  for(let i=0;i<700;i++){dustPositions[i*3]=(random()-.5)*90;dustPositions[i*3+1]=random()*28;dustPositions[i*3+2]=(random()-.5)*90;}
  const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0xf3bd8b,size:.055,transparent:true,opacity:.38,depthWrite:false}));scene.add(dust);
  // Breeding colonies distinguish the deeper sectors without blocking the path.
  if(level.order>1&&level.mode!=='defense'){
    const eggGeo=new THREE.IcosahedronGeometry(1,2),eggMat=new THREE.MeshStandardMaterial({color:0x495530,emissive:0x759526,emissiveIntensity:.35,roughness:.3});
    const eggs=new THREE.InstancedMesh(eggGeo,eggMat,level.waves.length*14),pose=new THREE.Object3D();let index=0;
    for(const wave of level.waves)for(const side of [-1,1])for(let j=0;j<7;j++){
      const p=route.at(wave.at+15+(j%3)*1.2,side*(5.6+Math.floor(j/3)*.6));const scale=.35+random()*.4;
      pose.position.set(p.x,terrain.heightAt(p.x,p.z)+scale*.7,p.z);pose.scale.set(scale*.7,scale,scale*.7);pose.rotation.set(random()*.2,random()*6,random()*.2);pose.updateMatrix();eggs.setMatrixAt(index++,pose.matrix);
    }
    eggs.castShadow=true;eggs.receiveShadow=true;scene.add(eggs);
  }
  const colony=level.mode==='defense'?await buildSpaceport(scene,terrain,environment):null;
  function isSolid(p,r=0){return p.y<=terrain.heightAt(p.x,p.z)+r||!!colony?.solidAt(p,r);}
  function walkable(x,z,r=.4) {
    if(colony)return colony.walkable(x,z,r);
    const n=route.nearest(x,z);
    return n.distance<level.walkWidth && Math.abs(x)<level.size/2-2 && Math.abs(z)<level.size/2-2;
  }
  function clearLine(a,b,margin=.15) {
    const distance=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),steps=Math.ceil(distance/.25);
    for(let i=1;i<steps;i++){const t=i/steps;const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};if(isSolid(p,margin))return false;}
    return true;
  }
  function update(player,dt,time) {
    sky.position.copy(player);sunSprite.position.copy(player).addScaledVector(sunDirection,650);
    sun.position.copy(player).addScaledVector(sunDirection,110);sun.target.position.copy(player);
    dust.position.set(player.x,player.y-4,player.z);dust.rotation.y=time*.008;
  }
  return {terrain,sky,sunSprite,route,walkable,clearLine,isSolid,colony,update,sunDirection,glow};
}

export function makePickup(kind) {
  const root=new THREE.Group(),color=kind==='ammo'?0xffb24f:kind==='grenade'?0xa6b7ff:kind==='fuel'?0xff773c:0x6ee6df;
  const box=new THREE.Mesh(new THREE.BoxGeometry(.85,.52,.62),new THREE.MeshStandardMaterial({color:0x263333,metalness:.6,roughness:.35}));box.position.y=.45;box.castShadow=true;root.add(box);
  const mat=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.6});
  if(kind==='health'){
    for(const [w,h] of [[.32,.09],[.09,.32]]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,.025),mat);mesh.position.set(0,.45,.325);root.add(mesh);const back=mesh.clone();back.position.z=-.325;root.add(back);}
  } else if(kind==='grenade'){
    for(const x of [-.2,.2]){const shell=new THREE.Mesh(new THREE.CapsuleGeometry(.08,.19,4,8),mat);shell.position.set(x,.45,.34);root.add(shell);}
  } else if(kind==='fuel'){const tank=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.48,16),mat);tank.position.set(0,.45,.34);root.add(tank);const cap=new THREE.Mesh(new THREE.BoxGeometry(.12,.09,.12),box.material);cap.position.set(0,.73,.34);root.add(cap);
  } else for(let i=-1;i<=1;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.1,.26,.65),mat);mesh.position.set(i*.2,.45,0);root.add(mesh);}
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.7,.018,6,40),mat);ring.rotation.x=Math.PI/2;ring.position.y=.06;root.add(ring);
  const light=new THREE.PointLight(color,1.8,4);light.position.y=.8;root.add(light);return root;
}

export function makeExit(level) {
  const root=new THREE.Group();root.name='NextSectorOutpost';
  // The very same pole/dish mesh used by Mars Rover's outpost and MarsCommsTower.
  const pole=MODULE_BUILDERS.comms_tower();pole.name='MarsCommsTower';pole.rotation.y=Math.PI;root.add(pole);
  const beacon=pole.userData.blinker;beacon.material=beacon.material.clone();
  const ringMaterial=new THREE.MeshBasicMaterial({color:0xffb070,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.65,2.85,64).rotateX(-Math.PI/2),ringMaterial);root.add(ring);
  const column=new THREE.Mesh(new THREE.CylinderGeometry(.18,.5,18,12,1,true),new THREE.MeshBasicMaterial({color:0xffb070,transparent:true,opacity:.09,side:THREE.DoubleSide,depthWrite:false}));column.position.y=9;root.add(column);
  const c=document.createElement('canvas');c.width=512;c.height=192;const ctx=c.getContext('2d');ctx.fillStyle='#18262e';ctx.fillRect(0,0,512,192);ctx.strokeStyle='#b4d1cd';ctx.lineWidth=6;ctx.strokeRect(5,5,502,182);ctx.fillStyle='#e5ede5';ctx.textAlign='center';ctx.font='bold 46px monospace';ctx.fillText(level.nextLevel?`SECTOR 0${level.nextLevel.order}`:'EXTRACTION',256,78);ctx.font='24px monospace';ctx.fillText(level.nextLevel?`${level.nextLevel.name.toUpperCase()} / TRANSFER`:'HIVE SECURED / HOMEBOUND',256,126);ctx.font='17px monospace';ctx.fillText('OUTPOST RELAY',256,163);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.1,.79),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));sign.position.set(0,2.1,1.2);root.add(sign);
  const lamp=new THREE.PointLight(0xffb070,2,7);lamp.position.y=3;root.add(lamp);
  root.userData.ground=(terrain)=>{
    root.updateMatrixWorld(true);
    const positions=ring.geometry.attributes.position,point=new THREE.Vector3();
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i);ring.localToWorld(point);
      positions.setY(i,terrain.heightAt(point.x,point.z)-root.position.y+.055);
    }
    positions.needsUpdate=true;ring.geometry.computeVertexNormals();
  };
  let lastReady=null;
  root.userData.update=(time,ready)=>{
    beacon.visible=true;beacon.material.emissiveIntensity=1.5+(Math.sin(time*4)*.5+.5)*2;
    ringMaterial.opacity=.42+Math.sin(time*2)*.1;
    if(ready!==lastReady){const color=ready?0x6ee6df:0xffb070;beacon.material.emissive.setHex(color);ringMaterial.color.setHex(color);column.material.color.setHex(color);lamp.color.setHex(color);lastReady=ready;}
  };
  root.userData.update(0,false);
  return root;
}
