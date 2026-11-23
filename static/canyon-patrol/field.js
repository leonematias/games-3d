import * as THREE from 'three';
import {loadHeightmap, createTerrain} from '../mars/terrain.js';
import {createSky} from '../mars/sky.js';
import {MODULE_BUILDERS} from '../mars/base.js';
import {batteryTrailer} from './battery.js';
import {emplacement} from '../mars-shooter/emplacements.js';
import {createRoverMesh} from '../mars/rover.js';
import {fixes,raiseRanges} from './crossing.js';
import {createRoute} from '../mars-shooter/world.js';

function box(parent, material, width, height, depth, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x,y,z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function freightLift(scene, world) {
  const root = new THREE.Group(), deck = new THREE.Group();
  const p = world.route.at(world.route.length - 1);
  root.position.set(p.x,world.terrain.heightAt(p.x,p.z),p.z);
  root.rotation.y = p.yaw;
  root.add(deck);
  scene.add(root);
  const steel = new THREE.MeshStandardMaterial({color:0x50585b,metalness:.4});
  const yellow = new THREE.MeshStandardMaterial({color:0xf5ac48});
  box(deck,steel,6,.32,5,0,.12,0);
  const lamp = new THREE.MeshBasicMaterial({color:0x87ffac});
  for (const x of [-2.85,2.85]) {
    box(deck,lamp,.3,.3,.3,x,1.3,2);
    box(root,steel,.25,38,.3,x,19,-2);
    box(deck,yellow,.12,.12,4.6,x,1.12,0);
    for (const z of [-2,0,2]) box(deck,steel,.12,1,.12,x,.63,z);
  }
  for(let i=-2;i<=2;i++) box(deck,yellow,.35,.03,.55,i,.3,2.1);
  box(root,yellow,6,.45,.4,0,37,-2);
  return {root,deck};
}

export async function createPlainsWorld(scene, level) {
  const route = createRoute(level.path);
  const station = route.at(route.length - 1);
  const heightmap = await loadHeightmap('/games-3d/mars/assets/heightmap.png');
  const driving=level.kind==='drive'||level.kind==='cable';
  const size=driving?1800:520;
  // Grade a level pad for the station and blend its edges into the surrounding slopes.
  const {width,height,heights} = heightmap;
  const col = Math.round((station.x/size+.5)*(width-1));
  const row = Math.round((station.z/size+.5)*(height-1));
  const padHeight = heights[row*width+col];
  for(let j=0;j<height;j++)for(let i=0;i<width;i++){
    const x=(i/(width-1)-.5)*size,z=(j/(height-1)-.5)*size;
    const distance=Math.hypot(x-station.x,z-station.z);
    if(distance<30)heights[j*width+i]=THREE.MathUtils.lerp(padHeight,heights[j*width+i],THREE.MathUtils.smoothstep(distance,20,30));
  }
  const start=route.at(route.length-1,-8);
  const mountainPass=driving?createRoute([[start.x,start.z],...(level.pass||fixes)]):route;
  raiseRanges(heightmap,size,mountainPass,driving);
  const branches={};
  if(!level.kind){
    for(const [name,side] of [['ridge',1],['wash',-1]]){
      const stops=[[18,side*8],[35,side*26],[68,side*53],[102,side*57],[135,side*32],[155,side*8]];
      const points=stops.map(([s,l])=>route.at(s,l));
      branches[name]=points;
      const trail=createRoute([route.at(6),...points,route.at(167)].map(p=>[p.x,p.z]));
      for(let j=0;j<height;j++)for(let i=0;i<width;i++){
        const x=(i/(width-1)-.5)*size,z=(j/(height-1)-.5)*size;
        const n=trail.nearest(x,z);
        if(n.distance>24)continue;
        const rise=Math.sin(Math.PI*n.s/trail.length)**2;
        const floor=padHeight*11+side*rise*(side>0?10:3);
        heights[j*width+i]=THREE.MathUtils.lerp(floor,heights[j*width+i],THREE.MathUtils.smoothstep(n.distance,8,24));
      }
    }
  }
  const terrain = createTerrain({heightmap,size,maxHeight:1,colorTexture:'/games-3d/mars/assets/terrain_color.jpg'});
  scene.add(terrain.group);
  const sky = createSky(scene,{preset:'mars',startHour:10.5,dayLengthSeconds:3600});
  if(driving){scene.fog.near=10;scene.fog.far=82;}
  const solids = [];
  function place(group,s,lateral=0,radius=0) {
    const p=route.at(s,lateral);
    group.position.set(p.x,terrain.heightAt(p.x,p.z),p.z);
    group.rotation.y=p.yaw;
    scene.add(group);
    if(radius)solids.push({x:p.x,z:p.z,radius});
    return group;
  }
  const end=route.length-1;
  let radio,rover,roverMesh,sites,turret,core,power;
  const steel=new THREE.MeshStandardMaterial({color:0x535d62});
  function post(s,offset,color){
    const node=new THREE.Group();
    box(node,steel,.16,1.4,.16,0,.7,0);
    node.userData.lamp=box(node,new THREE.MeshBasicMaterial({color}),.32,.22,.32,0,1.45,0);
    return place(node,s,offset);
  }
  for(const [name,points] of Object.entries(branches)){
    points.forEach((p,i)=>{
      const stake=new THREE.Group();
      box(stake,steel,.14,1.8,.14,0,.9,0);
      box(stake,new THREE.MeshBasicMaterial({color:name==='wash'?0x60e5ff:0xffaf46}),.32,.24,.32,0,1.8,0);
      if(name==='wash'&&i===2)box(stake,steel,1.5,.65,.8,1,.33,0);
      stake.position.set(p.x,terrain.heightAt(p.x,p.z),p.z);scene.add(stake);
    });
  }
  if(level.kind==='repeater'){
    const {relay,trench,shelter}=level.stops;
    rover=place(createRoverMesh().root,1,-3,1.6);
    radio=place(MODULE_BUILDERS.comms_tower(),relay,2,1);
    sites={relay:post(relay,0,0xffb449),trench:post(trench,0,0xffb449),shelter:post(shelter,0,0x6edfff)};
    box(sites.relay,steel,.85,.85,.45,0,.9,0);
    const breaker=box(sites.relay,new THREE.MeshStandardMaterial({color:0xf49e42}),.14,.34,.14,0,.92,.26);
    breaker.rotation.z=-.55;
    const console=sites.shelter;
    box(console,steel,1.2,.78,.5,0,.94,0);
    box(console,new THREE.MeshBasicMaterial({color:0x78d1b4}),.48,.24,.035,-.17,1.04,.266);
    const rubber=new THREE.MeshStandardMaterial({color:0x25292a});
    box(console,rubber,.10,.29,.11,.34,1.03,.315);
    for(const y of [.86,1.20])box(console,rubber,.19,.1,.15,.34,y,.32);
    for(let s=relay+3;s<trench+3;s+=3){
      const tray=new THREE.Group();
      box(tray,steel,.55,.24,s>trench-5?1.2:3,0,.45,0);
      place(tray,s,2);
    }
    for(let i=0;i<6;i++){
      const shell=new THREE.Mesh(new THREE.SphereGeometry(.38,9,6,0,2*Math.PI,.65,2.4),
        new THREE.MeshStandardMaterial({color:0xbda277,side:THREE.DoubleSide}));
      place(shell,trench-2+i,2+Math.sin(i));shell.scale.y=1.3;
    }
    for(let s=trench+6;s<shelter;s+=7)post(s,-2,0x69dcff);
    place(MODULE_BUILDERS.command_dome(),shelter,7,5);
    const door=new THREE.Group();box(door,steel,2.4,2.5,.45,0,1.25,0);place(door,shelter+2,2);
  }else if(level.kind==='defense'){
    core=post(end-6,0,0x75ffe1);radio=core;
    place(MODULE_BUILDERS.command_dome(),end,5,4);
    place(MODULE_BUILDERS.comms_tower(),end,-6,1);
    place(batteryTrailer(),end-8,6,1.7);
    power={sentry:post(end-9,-3,0xff9a41),approach:post(end-10,3,0x78ddff),last:post(16,0,0xff9a41),rows:[[],[]]};
    for(const side of [-1,1]){
      for(const s of [end-15,end-23]){const wall=new THREE.Group();box(wall,steel,3.8,1,1,0,.5,0);place(wall,s,side*9,1.8);}
      for(const s of [5,12,21,30,39])power.rows[s<20?1:0].push(post(s,side*5,0x49413d).userData.lamp);
    }
    const t=worldPoint(end-9,-5);
    turret=emplacement(scene,t.x,t.y,t.z,0);turret.bar.visible=false;
  }else{
    place(MODULE_BUILDERS.habitat_dome(),end,8,4);
    place(MODULE_BUILDERS.solar_array(),end-5,16,4.8);
    radio=place(MODULE_BUILDERS.comms_tower(),end,0,1);
    place(MODULE_BUILDERS.storage_silo(),end-5,-12,1.5);
    roverMesh=createRoverMesh();rover=place(roverMesh.root,end,-8,1.6);
    const bench=new THREE.Group();
    box(bench,steel,2.5,.15,.7,0,.6,0);
    for(const x of [-1,1])box(bench,steel,.15,.6,.55,x,.3,0);
    place(bench,end-4,3);
  }
  function worldPoint(s,offset){
    const p=route.at(s,offset);
    return new THREE.Vector3(p.x,terrain.heightAt(p.x,p.z),p.z);
  }
  // Low basalt clusters leave room to skirt either side of a charging pack.
  const rocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),
    new THREE.MeshStandardMaterial({color:0x754b39,roughness:1}),950);
  const dummy=new THREE.Object3D();
  let seed=7341;
  const rand=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
  for(let i=0;i<rocks.count;i++){
    const x=(rand()-.5)*(size-10),z=(rand()-.5)*(size-10),scale=.16+rand()**3*1.65;
    dummy.position.set(x,terrain.heightAt(x,z)-scale*.25,z);
    dummy.scale.set(scale*1.3,scale*.65,scale);
    dummy.rotation.set(rand(),rand()*6,rand());dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
  }
  scene.add(rocks);
  function walkable(x,z){
    return Math.abs(x)<253 && Math.abs(z)<253 && solids.every(o=>Math.hypot(x-o.x,z-o.z)>o.radius+.28);
  }
  function isSolid(p,r=0){return p.y<=terrain.heightAt(p.x,p.z)+r;}
  function clearLine(a,b,margin=.15){
    const steps=Math.ceil(a.distanceTo(b)/.6);
    for(let i=1;i<steps;i++){
      const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      if(a.y+(b.y-a.y)*t<=terrain.heightAt(x,z)+margin)return false;
    }
    return true;
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'white');g.addColorStop(.3,'#ffa954');g.addColorStop(1,'transparent');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  return {terrain,route,branches,power,radio,sites,core,turret,worldPoint,rover,roverMesh,walkable,clearLine,isSolid,glow:new THREE.CanvasTexture(canvas),
    sunDirection:sky.sunDir,update(player,dt){sky.followTarget(player);sky.update(dt);}};
}
