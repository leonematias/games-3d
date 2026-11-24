// Static park geometry is instanced by shape so the whole neighborhood costs
// only a handful of draw calls. Measurements are in metres.
import * as T from 'three';

export const fieldX = x => (x - 455) * .045;
export const fieldZ = y => (y - 255) * .078;
export const mouth = [fieldZ(211),fieldZ(296)];
export const goalX = fieldX(887);

function sign(scene,text,x,y,z,width,height,bg,ink){
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=bg;ctx.fillRect(0,0,1024,128);
  ctx.fillStyle=ink;ctx.fillRect(0,0,1024,5);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 74px Arial';ctx.fillText(text,512,70,975);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const board=new T.Mesh(new T.BoxGeometry(width,height,.08),new T.MeshBasicMaterial({map}));
  board.position.set(x,y,z);scene.add(board);
}

export function buildGrounds(scene){
  const forms={
    block:new T.BoxGeometry(), foliage:new T.IcosahedronGeometry(1,1),
    roof:new T.ConeGeometry(1,1,4).rotateY(Math.PI/4),
    tube:new T.CylinderGeometry(.5,.5,1,12), peak:new T.ConeGeometry(.5,1,16)
  };
  const batches=new Map(),dummy=new T.Object3D();
  function add(form,x,y,z,w,h,d,color,angle=0){
    if(!batches.has(form))batches.set(form,[]);
    dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.set(0,angle,0);dummy.updateMatrix();
    batches.get(form).push([dummy.matrix.clone(),color]);
  }
  const box=(...args)=>add('block',...args);
  const turf=new T.TextureLoader().load('/games-3d/static/soccer/textures/grass-bright.jpg');
  turf.wrapS=turf.wrapT=T.RepeatWrapping;turf.repeat.set(18,14);turf.colorSpace=T.SRGBColorSpace;turf.anisotropy=4;
  const ground=new T.Mesh(new T.PlaneGeometry(73,50),new T.MeshStandardMaterial({map:turf,color:0xbbd896,roughness:1}));
  ground.rotation.x=-Math.PI/2;scene.add(ground);
  for(let i=-4;i<5;i++){
    const stripe=new T.Mesh(new T.PlaneGeometry(3,18),new T.MeshBasicMaterial({color:0x0e4725,transparent:true,opacity:.12,depthWrite:false}));
    stripe.rotation.x=-Math.PI/2;stripe.position.set(i*6,.01,0);scene.add(stripe);
  }
  const chalk=0xf4efce;
  for(const z of [-9,9])box(0,.02,z,goalX*2,.014,.08,chalk);
  for(const x of [0,-goalX,goalX])box(x,.02,0,.08,.014,18,chalk);
  const circle=new T.Mesh(new T.RingGeometry(2.9,2.97,80),new T.MeshBasicMaterial({color:chalk}));
  circle.rotation.x=-Math.PI/2;circle.position.y=.03;scene.add(circle);
  for(const side of [-1,1]){
    const front=side*goalX,back=front+side*1.15;
    box(front-side*4.4,.025,0,.08,.02,11.2,chalk);
    for(const z of [-5.6,5.6])box(front-side*2.2,.025,z,4.4,.02,.08,chalk);
    for(const z of mouth){
      box(front,1.18,z,.105,2.36,.105,0xfff9eb);box(back,.94,z,.065,1.88,.065,0xdde4de);
      box((front+back)/2,.04,z,1.15,.05,.05,0xe9eee5);
    }
    box(front,2.36,(mouth[0]+mouth[1])/2,.105,.105,mouth[1]-mouth[0],0xfffbed);
    const net=[];
    function wire(x,y,z,X,Y,Z){net.push(x,y,z,X,Y,Z)}
    for(let i=0;i<=31;i++){
      const z=mouth[0]+(mouth[1]-mouth[0])*i/31;
      wire(front,2.36,z,back,1.88,z);wire(back,1.88,z,back,0,z);
    }
    for(let i=0;i<=10;i++){
      const f=i/10;
      wire(back,f*1.88,mouth[0],back,f*1.88,mouth[1]);
      for(const z of mouth)wire(front,f*2.36,z,back,f*1.88,z);
    }
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(net,3));
    scene.add(new T.LineSegments(geom,new T.LineBasicMaterial({color:0xe6f2dc,transparent:true,opacity:.56})));
  }
  // The sideline and the houses beyond it remain visible from field level.
  for(let i=-12;i<=12;i++)box(i*2.5,.65,-11,.08,1.3,.08,0xced8c9);
  for(const h of [.38,1.12])box(0,h,-11,62,.065,.06,0xc8d5c8);
  for(let i=-3;i<=3;i++){
    const x=i*8;
    for(let r=0;r<2;r++)box(x,.4+r*.37,-12-r*.8,5.2,.12,.56,0xbb8961);
    for(const dx of [-2,2])box(x+dx,.27,-12.35,.13,.54,1.5,0x536864);
  }
  for(let i=0;i<52;i++){
    const x=-27+(i%26)*2.05+Math.sin(i*4)*.32,z=-12.5-Math.floor(i/26)*.79;
    const base=.55+Math.floor(i/26)*.38;
    const c=[0xd6b150,0x467e73,0xc66f59,0x415f80,0xe9d8b4][i%5];
    box(x,base+.31,z,.29,.5,.22,c);
    add('foliage',x,base+.69,z,.14,.16,.14,i%3?0xc59171:0x98694e);
    box(x,base+.85,z,.22,.065,.22,0x504235);
  }
  sign(scene,'EASTCHESTER   /   YOUTH SOCCER',4,1.05,-11,8,.80,'#163d35','#fff2cd');
  sign(scene,'CHARGERS     ⚡     SOCCER CLUB',18,1.05,-11,7,.80,'#cc9e49','#153c37');
  let seed=548;
  function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}
  for(let i=-7;i<=7;i++){
    const x=i*6,z=-27-rand()*8,h=2.2+rand()*1.4;
    const wall=[0xd6c5a4,0xb4b9a8,0xd6b49a,0xa2bcc0][Math.abs(i)%4];
    box(x,h/2,z,4.3,h,3.4,wall);add('roof',x,h+.8,z,3.4,1.6,2.8,0x886955);
    box(x+1.4,h+1,z-.4,.34,1.3,.43,0xa47865);
    for(const dx of [-1.25,1.25])box(x+dx,h*.65,z+1.71,.74,.83,.04,0x577781);
  }
  for(let i=0;i<75;i++){
    const x=rand()*105-52,z=-16-rand()*29,h=2.8+rand()*3.4,w=1.2+rand()*1.35;
    box(x,h*.36,z,.3,h*.72,.3,0x776446);
    for(let j=0;j<3;j++)add('foliage',x+(j-1)*w*.48,h-Math.abs(j-1)*.75,z+rand()*.5,w*.81,w*(1+rand()*.35),w, [0x577a49,0x408158,0x84954f,0x3f7054][i%4],rand()*5);
  }
  for(let i=-4;i<=4;i++)add('foliage',i*17,-2,-61,19,9+rand()*6,13,0x829884);
  for(const x of [-19,23]){
    add('tube',x,4.5,-14,.15,9,.15,0x697a77);
    box(x,9,-14,2,.19,.23,0x5c6868);
    for(let j=-1;j<=1;j++)box(x+j*.6,8.9,-13.83,.45,.3,.1,0xfff2cd);
  }
  // A wooden bench at the near touchline doubles as the huddle set.
  box(2,.48,10.5,4,.12,.6,0xbb8252);box(2,.93,10.84,4,.35,.1,0xb87f50);
  for(const x of [.5,3.5])box(x,.23,10.5,.14,.46,.68,0x475754);
  for(const [form,items] of batches){
    const mesh=new T.InstancedMesh(forms[form],new T.MeshStandardMaterial({roughness:.95}),items.length);
    items.forEach(([matrix,color],i)=>{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new T.Color(color))});scene.add(mesh);
  }
}
