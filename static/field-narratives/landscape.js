import * as T from 'three';
import {loadModel,cloneModel} from '../voyager/models.js';
import {loadTemplate,instantiate} from '../medieval/rig.js';

export const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function surface(color,extra={}){return new T.MeshStandardMaterial({color,roughness:.88,...extra});}
export function mesh(group,geometry,material,x=0,y=0,z=0){
  const m=new T.Mesh(geometry,material);m.position.set(x,y,z);group.add(m);return m;
}
export function box(group,mat,x,y,z,w,h,d){return mesh(group,new T.BoxGeometry(w,h,d),mat,x,y,z);}
export function rod(group,mat,a,b,r,end=r){
  const start=V(...a),finish=V(...b),dir=finish.clone().sub(start);
  const m=mesh(group,new T.CylinderGeometry(end,r,dir.length(),9),mat);
  m.position.copy(start).lerp(finish,.5);m.quaternion.setFromUnitVectors(V(0,1,0),dir.normalize());return m;
}
export function place(group,obj,x,z,height,offset=0){obj.position.set(x,height(x,z)+offset,z);group.add(obj);return obj;}
export async function library(path,height){
  const model=await loadModel('Meshes/'+path);
  return cloneModel(model,height/model.size.y);
}
export async function actor(id,height){
  const template=await loadTemplate(id),rig=instantiate(template);
  rig.model.scale.setScalar(height/template.height);rig.play('idle');return rig;
}
export function scatter(group,geometry,material,placements){
  const result=new T.InstancedMesh(geometry,material,placements.length),dummy=new T.Object3D();
  placements.forEach(([x,y,z,s,angle=0,sy=s,sz=s],i)=>{
    dummy.position.set(x,y,z);dummy.scale.set(s,sy,sz);dummy.rotation.set(0,angle,0);
    dummy.updateMatrix();result.setMatrixAt(i,dummy.matrix);
  });group.add(result);return result;
}
function grain(seed){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),img=ctx.createImageData(256,256),rng=random(seed);
  for(let i=0;i<img.data.length;i+=4){
    const v=188+rng()*66;img.data.set([v,v,v,255],i);
  }ctx.putImageData(img,0,0);const t=new T.CanvasTexture(canvas);
  t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}
export function ground(scene,extent,segments,height,tint,seed){
  const g=new T.PlaneGeometry(extent*2,extent*2,segments,segments);g.rotateX(-Math.PI/2);
  const p=g.attributes.position,uv=g.attributes.uv,colors=new Float32Array(p.count*3),c=new T.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),h=height(x,z);p.setY(i,h);uv.setXY(i,x/9,z/9);tint(c,x,z,h);c.toArray(colors,i*3);}
  g.setAttribute('color',new T.BufferAttribute(colors,3));g.computeVertexNormals();
  return mesh(scene,g,surface('#ffffff',{vertexColors:true,map:grain(seed)}));
}
export function mountainRing(scene,radius,colors,base,relief,seed){
  const rng=random(seed),verts=[],indices=[],col=[];const count=180;
  const ridges=Array.from({length:count},(_,i)=>.50+.21*Math.sin(i*.163)+.12*Math.sin(i*.57)+.07*Math.cos(i*.25)+rng()*.055);
  const c=new T.Color();
  for(let k=0;k<4;k++)for(let i=0;i<=count;i++){
    const a=i/count*Math.PI*2,r=radius*(1+k*.13),y=base+[0,.35,1,.62][k]*relief*ridges[i%count];
    verts.push(Math.cos(a)*r,y,Math.sin(a)*r);c.set(colors[k]).multiplyScalar(.83+rng()*.21);col.push(c.r,c.g,c.b);
    if(k&&i){const n=k*(count+1)+i;indices.push(n,n-1,n-count-1,n-1,n-count-2,n-count-1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setIndex(indices);g.computeVertexNormals();
  return mesh(scene,g,surface(0xffffff,{vertexColors:true,side:T.DoubleSide,flatShading:true}));
}
export function shadow(parent,w,d){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(0,0,0,.72)');gradient.addColorStop(.65,'rgba(0,0,0,.38)');gradient.addColorStop(1,'transparent');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const m=mesh(parent,new T.PlaneGeometry(w,d),new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),0,.045,0);m.rotation.x=-Math.PI/2;
}
export function sky(scene,top,horizon,radius=9200){
  const uniforms={top:{value:new T.Color(top)},horizon:{value:new T.Color(horizon)}};
  const mat=new T.ShaderMaterial({uniforms,side:T.BackSide,depthWrite:false,
    vertexShader:'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 v;uniform vec3 top,horizon;void main(){float a=normalize(v).y;gl_FragColor=vec4(mix(horizon,top,smoothstep(-.03,.63,a)),1.);\n#include <colorspace_fragment>\n}'});
  mesh(scene,new T.SphereGeometry(radius,32,16),mat);return uniforms;
}
export function viewport(){
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('#world'),antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(56,1,.12,14000);
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();addEventListener('resize',resize);return {renderer,scene,camera};
}
export function chase(camera,x,z,yaw,height,distance,lift,dt,lookAhead=3){
  const dx=Math.sin(yaw),dz=-Math.cos(yaw),cx=x-dx*distance,cz=z-dz*distance;
  camera.position.lerp(V(cx,Math.max(height(x,z)+lift,height(cx,cz)+1.4),cz),1-Math.exp(-dt*5));
  camera.lookAt(x+dx*lookAhead,height(x,z)+lift*.32,z+dz*lookAhead);
}
