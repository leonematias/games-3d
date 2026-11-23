import * as T from 'three';
import {box,mesh,rod,surface,random} from '../field-narratives/landscape.js';

function grain(){
  const c=document.createElement('canvas');c.width=256;c.height=128;
  const ctx=c.getContext('2d'),rand=random(312);
  ctx.fillStyle='#b99064';ctx.fillRect(0,0,256,128);
  for(let i=0;i<360;i++){
    const y=rand()*128,x=rand()*256;ctx.strokeStyle=i%2?'#70492d55':'#e5c59e55';
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+12,y-2,x+29,y+2,x+35+rand()*56,y);ctx.stroke();
  }
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;return t;
}
const boardMap=grain();
const wood=tint=>surface(tint,{map:boardMap});
export const planks=[wood('#916440'),wood('#be9468'),wood('#d3b58d'),wood('#a57c51')];
const iron=surface('#655549'),rope=surface('#c6af7b'),linen=surface('#dac8a4',{side:T.DoubleSide});
function wheel(g,x,y,z){
 const rim=mesh(g,new T.TorusGeometry(.72,.16,8,18),planks[0],x,y,z);rim.rotation.y=Math.PI/2;
 for(let i=0;i<4;i++){const a=i*Math.PI/4,dy=Math.sin(a)*.66,dz=Math.cos(a)*.66;rod(g,planks[2],[x,y-dy,z-dz],[x,y+dy,z+dz],.09);}
 rod(g,iron,[x-.18,y,z],[x+.18,y,z],.18);
}
function silhouette(g,outline,width,mat){
 const shape=new T.Shape();outline.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
 const geometry=new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSize:.08,bevelThickness:.07,bevelSegments:1});
 geometry.rotateY(Math.PI/2);geometry.translate(-width/2,0,0);return mesh(g,geometry,mat);
}
export function woodenHorse(){
 const root=new T.Group(),ribs=new T.Group(),wheels=new T.Group(),cloth=new T.Group();
 root.add(ribs,wheels,cloth);
 box(root,planks[0],0,1.25,0,3.7,.32,7.8);
 for(const x of [-1.12,1.12])for(const z of [-2.1,2.1]){
   rod(root,planks[1],[x,1.4,z*1.13],[x*.88,4.5,z*.85],.32,.43);
   wheel(wheels,x*1.65,.82,z*1.25);
 }
 for(const z of [-2.5,-1.7,-.85,0,.85,1.7,2.5]){
   const rad=1.48-.05*z*z;
   const ring=mesh(root,new T.TorusGeometry(rad,.093,6,12),planks[0],0,5.15,z);
   ring.scale.y=1.06;
 }
 for(let i=0;i<18;i++){
   const a=i*Math.PI*2/18;
   for(let j=0;j<6;j++){
     const z=-2.7+j*.9;
     const pt=k=>{const r=1.51-.051*k*k;return [Math.cos(a)*r,5.15+Math.sin(a)*r*1.06,k];};
     const beam=rod(ribs,planks[(i+j)%4],pt(z),pt(z+.92),.26,.25);beam.geometry.computeVertexNormals();
   }
 }
 silhouette(ribs,[[-.9,5.9],[-2.3,8.45],[-2.65,9.05],[-3.9,8.85],[-5,7.96],[-4.88,7.52],[-3.53,7.84],[-3.23,6.1],[-2.63,4.96]],1.2,planks[1]);
 for(const x of [-.4,.4]){
   const ear=mesh(ribs,new T.ConeGeometry(.25,.93,4),planks[2],x,9.18,-2.96);ear.rotation.x=-.22;
   mesh(ribs,new T.SphereGeometry(.13,10,7),iron,x*1.65,8.42,-3.63);
 }
 for(let i=0;i<9;i++)box(ribs,planks[0],0,6.68+i*.26,-1.38-i*.15,.44,.38,.4);
 for(let i=0;i<5;i++)rod(ribs,rope,[(i-2)*.12,5.65,2.5],[(i-2)*.13,2.8,3.28],.1,.055);
 box(cloth,linen,1.46,5.02,.15,.09,1.22,1.27);
 for(const z of [-.6,.75])rod(cloth,rope,[1.54,4.6,z],[1.72,1.51,z],.045);
 for(let i=0;i<9;i++)rod(cloth,planks[2],[1.6,1.75+i*.31,-.6],[1.6,1.75+i*.31,.75],.065);
 return {root,fit(fitted,finished){ribs.visible=finished||fitted.includes('timber');wheels.visible=finished||fitted.includes('wheels');cloth.visible=finished||fitted.includes('sail');}};
}
export function galley(){
 const g=new T.Group(),blue=surface('#275a65');
 for(let i=0;i<22;i++){
   const z=-9.5+i*.9,w=.45+2.02*Math.sin(i/21*Math.PI);
   box(g,planks[i%4],0,1.22,z,w*2,.21,.91);
   for(const side of [-1,1]){
    box(g,i%5===0?blue:planks[0],w*side,.96,z,.22,1.18,.96);
    if(i%3===0)rod(g,planks[2],[w*side,1.4,z],[(w+2.4)*side,.22,z+1.6],.081);
   }
 }
 const mast=new T.Group();g.add(mast);mast.position.z=6.7;
 rod(mast,planks[1],[0,1.3,.5],[0,8,.5],.19,.1);
 rod(mast,planks[0],[-3.6,7,.5],[3.6,7,.5],.1);
 box(mast,linen,0,6.68,.52,6.9,.49,.53);
 for(const side of [-1,1])rod(mast,rope,[side*1.92,1.52,-6],[0,7.7,.48],.033);
 return g;
}
export function horseInterior(){
 const g=new T.Group();
 for(let i=-5;i<6;i++)box(g,planks[(i+5)%4],i*.41,-.2,0,.402,.2,7.8);
 for(const side of [-1,1]){
  for(let j=0;j<9;j++){
   const p=box(g,planks[j%4],side*(2.12+.16*Math.sin(j*.4)),j*.37,0,.18,.347,8.1);
   p.rotation.z=side*(j-4)*.012;
  }
  for(const z of [-3.3,-1.3,.9,3.1])rod(g,planks[0],[side*1.97,-.1,z],[side*1.95,3.2,z],.16);
 }
 for(let j=0;j<9;j++)box(g,planks[j%4],0,j*.37,-3.8,4.3,.338,.18);
 for(let i=0;i<6;i++)box(g,planks[1],0,3.15,-3+i*1.25,4.55,.21,.42);
 const flap=box(g,planks[2],0,.87,-3.62,1.16,1.5,.11);
 const shield=mesh(g,new T.CylinderGeometry(.53,.53,.12,24),surface('#ad8759'),.88,.68,-2.04);shield.rotation.x=Math.PI/2.7;
 return {group:g,flap,shield};
}
