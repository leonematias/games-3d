import * as T from 'three';
import {romanRig,equipRoman} from '../eagle-ford/roman-rig.js';
import {squadNames,companionWeapon} from './story.js';
import {height} from './land.js';

// Painted devices identify the squad when faces are turned away. The ordinary
// ranks keep their shared materials and instanced animation.
const kit=[
  {ground:'#773426',device:'wings'},
  {ground:'#444f57',device:'chevrons'},
  {ground:'#326761',device:'bolt'},
  {ground:'#985b30',device:'bars'}
];
function paintShield(rig,{ground,device}){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=192;
  const c=canvas.getContext('2d');
  c.fillStyle=ground;c.fillRect(0,0,128,192);c.strokeStyle='#dcc48a';c.lineWidth=3;c.strokeRect(6,6,116,180);
  c.fillStyle='#e8d59e';
  function shape(points){
    c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();
  }
  if(device==='bolt')shape([[78,20],[40,102],[61,99],[49,171],[93,78],[69,85]]);
  else if(device==='bars'){for(const y of [48,75,108,135])c.fillRect(22,y,84,7);}
  else for(const side of [-1,1]){
    c.save();c.translate(64,96);c.scale(side,1);
    for(const y of [-32,5,42]){
      if(device==='wings')shape([[4,y],[47,y-22],[39,y-3],[6,y+8]]);
      else shape([[0,y],[41,y+26],[41,y+36],[0,y+11]]);
    }c.restore();
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  rig.shieldHolder.traverse(mesh=>{
    if(mesh.material?.name!=='eq_scutum_face')return;
    mesh.material=mesh.material.clone();mesh.material.color.set(0xffffff);mesh.material.map=map;
    const geo=mesh.geometry.clone();geo.computeBoundingBox();
    const pos=geo.attributes.position,uv=new Float32Array(pos.count*2),{min,max}=geo.boundingBox;
    for(let i=0;i<pos.count;i++){
      uv[i*2]=(pos.getZ(i)-min.z)/(max.z-min.z);uv[i*2+1]=(pos.getX(i)-min.x)/(max.x-min.x);
    }
    geo.setAttribute('uv',new T.BufferAttribute(uv,2));mesh.geometry=geo;
  });
}
function nameplate(name){
  const c=document.createElement('canvas');c.width=256;c.height=64;
  const pen=c.getContext('2d');pen.fillStyle='#142326ec';pen.fillRect(0,0,c.width,c.height);
  pen.fillStyle='#dbc289';pen.fillRect(0,61,256,3);pen.fillStyle='#fff4db';pen.font='600 36px Georgia';pen.textAlign='center';pen.fillText(name,128,43);
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
  const plate=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false}));
  plate.scale.set(.94,.235,1);return plate;
}
export function createCompanions(scene,templates){
  const cast=templates.map((template,i)=>{
    const rig=romanRig(template),plate=nameplate(squadNames[i]);
    paintShield(rig,kit[i]);scene.add(rig.model,plate);return {rig,plate};
  });
  return function draw(i,{p,clip,phase,listener,label,upgraded,dt}){
    const {rig,plate}=cast[i];
    rig.model.visible=!!p;plate.visible=!!p&&label;
    if(!p)return;
    const y=height(p.x,p.z);rig.model.position.set(p.x,y,p.z);plate.position.set(p.x,y+2.18,p.z);
    const yaw=listener?Math.atan2(listener.x-p.x,listener.z-p.z):p.yaw;
    const turn=yaw-rig.model.rotation.y;
    rig.model.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*(1-Math.exp(-dt*9));
    equipRoman(rig,companionWeapon(squadNames[i],upgraded));
    const animated=clip==='walk'||clip==='attack';
    const action=rig.play(clip,{once:clip==='death',speed:animated?0:1,fade:.12});
    if(animated&&action)action.time=action.getClip().duration*phase;
    rig.update(dt);rig.settle();
  };
}
