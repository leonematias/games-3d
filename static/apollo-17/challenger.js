// Challenger's angular ascent cabin, foil-covered descent stage and four landing legs.
import * as T from 'three';
import {V,mesh,rod,box,surface,random,shadow} from '../field-narratives/landscape.js';
export function challenger(){
  const g=new T.Group(),canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),rand=random(1972);ctx.fillStyle='#a87d42';ctx.fillRect(0,0,256,256);
  for(let i=0;i<2100;i++){const x=rand()*256,y=rand()*256;
    ctx.fillStyle=['#f0ca7a','#b9884e','#765233','#e2ad62','#d3a05c'][i%5];
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand()*26,y+rand()*17);ctx.lineTo(x+rand()*7,y+rand()*23);ctx.fill();}
  const foilTex=new T.CanvasTexture(canvas);foilTex.colorSpace=T.SRGBColorSpace;foilTex.wrapS=foilTex.wrapT=T.RepeatWrapping;
  const foil=surface('#f4d6a0',{map:foilTex,metalness:.28,roughness:.52}), metal=surface('#c7c6c0',{metalness:.28}),dark=surface('#393a3b'),black=surface('#14171c'),glass=surface('#203c4c',{metalness:.55}),silver=surface('#aaaeb0');
  mesh(g,new T.CylinderGeometry(1.95,1.98,1.65,8,1,false,Math.PI/8),foil,0,1.96,0);
  const engine=mesh(g,new T.ConeGeometry(.69,.85,16),dark,0,.96,0);engine.rotation.z=Math.PI;
  for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const bx=3.65*x,bz=3.65*z;
    mesh(g,new T.CylinderGeometry(.32,.54,.13,12),foil,bx,.10,bz);
    rod(g,silver,[1.44*x,2.25,1.44*z],[bx,.18,bz],.086);
    for(const sign of [-1,1])rod(g,foil,[1.55*x+z*.72*sign,1.22,1.55*z+x*.72*sign],[bx*.84,.76,bz*.84],.068);
    box(g,black,1.88*x,1.96,1.88*z,z?.98:.07,1.39,x?.98:.07);
  }
  const pod=mesh(g,new T.CylinderGeometry(1.26,1.51,1.46,8,1,false,.22),metal,0,3.48,-.2);pod.scale.z=1.03;
  box(g,dark,0,3.52,-1.0,2.3,1.35,1.04);box(g,metal,0,3.3,-1.59,.8,1.13,.18);
  for(const x of [-.85,.85]){
    const shape=new T.Shape();shape.moveTo(-.38,0);shape.lineTo(.38,0);shape.lineTo(x<0?.32:-.32,.56);shape.closePath();
    mesh(g,new T.ShapeGeometry(shape),new T.MeshStandardMaterial({color:glass.color,side:T.DoubleSide}),x,3.77,-1.55);
    const tank=mesh(g,new T.SphereGeometry(.73,12,10),silver,x*1.52,3.52,.35);tank.scale.y=1.08;
    box(g,black,x*1.6,4.02,-.66,.4,.27,.27);for(const z of [-.86,-.45])rod(g,dark,[x*1.63,4,z],[x*1.85,4,z],.055,.10);
  }
  box(g,metal,0,4.34,-.22,1.95,.36,1.8);
  box(g,foil,0,3.57,1.16,1.73,1.5,.8);
  rod(g,metal,[-.69,4.48,.22],[-.69,5.63,.22],.04);
  const dish=mesh(g,new T.SphereGeometry(.62,18,8,0,Math.PI*2,0,.98),silver,-.69,5.56,.22);dish.rotation.x=1.0;
  rod(g,metal,[.66,4.4,-.38],[.67,5.51,-.42],.022);
  for(const x of [-.25,.25])rod(g,silver,[x,.26,-3.51],[x,2.97,-1.82],.031);
  for(let i=0;i<10;i++){const f=i/9;rod(g,silver,[-.25,.36+f*2.55,-3.46+f*1.58],[.25,.36+f*2.55,-3.46+f*1.58],.027);}
  shadow(g,8.2,8.2);return g;
}
