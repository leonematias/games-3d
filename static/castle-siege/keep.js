import {mission,lastRing} from './campaign.js';
import * as T from 'three';
import {TgcLoader} from '../meshviewer/tgc-loader.js';
import {createWall} from '../destructable-meshes/fracture.js';

function texture(w,h,draw){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  draw(canvas.getContext('2d'));const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;return t;
}
export function masonry(cols,rows,cracked=false){
  return texture(768,384,c=>{
    const w=768/cols,h=384/rows;c.fillStyle='#776c5e';c.fillRect(0,0,768,384);
    for(let j=0;j<rows;j++)for(let i=-1;i<cols;i++){
      const x=(i+(j%2)*.5)*w,y=j*h,shade=Math.floor(154+Math.random()*32);
      c.fillStyle='rgb('+shade+','+(shade-10)+','+(shade-28)+')';c.fillRect(x+1,y+2,w-2,h-3);
      c.fillStyle='#dfd4b899';c.fillRect(x+2,y+2,w-4,2);
    }
    if(cracked){
      c.strokeStyle='#483c32';c.lineWidth=5;c.lineJoin='round';
      for(const line of [[[370,0],[405,74],[369,101],[392,142],[342,200],[365,241],[312,304]],[[392,142],[436,150],[457,183]],[[342,200],[295,210],[270,255]]]){
        c.beginPath();line.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();
      }
    }
    for(let i=0;i<36000;i++){c.fillStyle=i%2?'#fff9d914':'#4239281e';c.fillRect(Math.random()*768,Math.random()*384,2,2);}
  });
}
export async function model(path,height){
  const dir='Meshes/'+path,name=path.split('/').pop(),url='/games-3d/meshes/files/'+dir+'/'+name+'-TgcScene.xml';
  const response=await fetch(url);if(!response.ok)throw Error('Missing '+name);
  const {object}=await new TgcLoader({fileRoot:'/games-3d/meshes/files/'}).load(await response.text(),{xmlDir:dir});
  const bounds=new T.Box3().setFromObject(object),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  object.position.set(-center.x,-bounds.min.y,-center.z);object.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  const group=new T.Group();group.add(object);group.scale.setScalar(height/size.y);return group;
}
export function buildKeep(scene,physics,trees){
  scene.background=new T.Color(0xe3cfac);scene.fog=new T.FogExp2(0xd9c8aa,.017);
  const sky=new T.Mesh(new T.SphereGeometry(102,40,20),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,
    vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 d;void main(){vec3 n=normalize(d);float t=smoothstep(-.04,.60,n.y);vec3 c=mix(vec3(.87,.78,.64),vec3(.34,.56,.68),t);float sun=max(dot(n,normalize(vec3(-.48,.27,-.7))),0.);gl_FragColor=vec4(c+vec3(.28,.20,.10)*pow(sun,65.),1.);}'
  }));scene.add(sky);
  scene.add(new T.HemisphereLight(0xfff0cf,0x989479,2));
  const sun=new T.DirectionalLight(0xffe2ae,2.35);sun.position.set(-16,30,15);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-27,right:27,top:28,bottom:-28,far:90});sun.shadow.mapSize.set(1024,1024);sun.shadow.normalBias=.04;
  if(mission.rings.length>1){
    const depth=12-lastRing.z;
    sun.target.position.z=12-depth/2;sun.position.z+=sun.target.position.z;
    Object.assign(sun.shadow.camera,{left:-depth*.6,right:depth*.6,top:depth*.6,bottom:-depth*.6,far:130});
    scene.add(sun.target);
  }
  scene.add(sun);
  const stone=new T.MeshStandardMaterial({map:masonry(7,9)}),wood=new T.MeshStandardMaterial({color:0x67503b}),iron=new T.MeshStandardMaterial({color:0x3d4039}),cloth=new T.MeshStandardMaterial({color:mission.color,side:T.DoubleSide});
  function mesh(geo,mat,x,y,z,parent=scene){
    const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;parent.add(o);return o;
  }
  function box(w,h,d,x,y,z,mat=stone,parent=scene){return mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,parent);}
  const groundMap=texture(768,768,c=>{
    c.fillStyle='#78804e';c.fillRect(0,0,768,768);
    for(let i=0;i<55000;i++){c.fillStyle=i%2?'#d4bd7c38':'#3f513c24';c.fillRect(Math.random()*768,Math.random()*768,4,2);}
    c.lineCap='round';for(const [x,z,x2,z2] of [[310,760,310,280],[300,580,510,520],[510,520,490,290],[300,330,390,100]]){
      c.strokeStyle='#aa976b';c.lineWidth=45;c.beginPath();c.moveTo(x,z);c.lineTo(x2,z2);c.stroke();}
    for(let i=0;i<23000;i++){
      c.fillStyle=i%2?'#ead19d26':'#574c3028';c.fillRect(Math.random()*768,Math.random()*768,2,1);
    }
  });
  const ground=mesh(new T.PlaneGeometry(85,Math.max(85,36-lastRing.z)),new T.MeshStandardMaterial({map:groundMap}),0,-.025, Math.min(0,(lastRing.z+15)/2));ground.rotation.x=-Math.PI/2;
  const fixed=[];
  function obstacle(x,z,w,d,h,material=stone){
    const o=box(w,h,d,x,h/2,z,material);fixed.push({x,z,w,d,o});return o;
  }
  function tower(x,z,h){
    const radius=1.7;
    const o=mesh(new T.CylinderGeometry(radius,radius*1.13,h,12),stone,x,h/2,z);
    fixed.push({x,z,w:3.15,d:3.15,o});
    mesh(new T.CylinderGeometry(1.98,1.76,.6,12),stone,x,h-.1,z);
    for(let n=0;n<10;n++){const a=n*.628;box(.57,.67,.52,x+1.65*Math.cos(a),h+.43,z+1.65*Math.sin(a)).rotation.y=-a;}
    box(.23,.95,.1,x,h-1,z+radius,iron);
    box(.64,2.3,.08,x+.7,h-1.6,z+radius*.86,cloth);
  }
  const back=lastRing.z-11;
  for(const x of [-13,13]){
    obstacle(x,back/2,.85,2-back,4);tower(x<0?-13.9:x,0,6.2);
    for(const ring of mission.rings)tower(x,ring.z,ring.height+1.9);
    tower(x,back,6.5);
  }
  obstacle(0,back,26,.9,5.8);
  for(const [x,w] of [[-9.1,1.4],[11.5,2.8]])obstacle(x,0,w,.8,4.9);
  for(const ring of mission.rings){
    const left=ring.x-ring.width/2,right=ring.x+ring.width/2;
    let start=-13;
    if(ring.postern!==undefined){
      const edge=ring.postern-2;
      obstacle((start+edge)/2,ring.z,edge-start,.9,ring.height+.1);
      start=edge+4;
    }
    obstacle((left+start)/2,ring.z,left-start,.9,ring.height+.1);
    obstacle((right+13)/2,ring.z,13-right,.9,ring.height+.1);
    if(ring.battery){
      // A pair of tall standards frames the next breakable section.
      for(const x of [left-.48,right+.48]){
        box(.12,2.6,.12,x,ring.height+.8,ring.z,wood);
        box(.75,1.3,.1,x+.35,ring.height+1.25,ring.z,cloth);
      }
    }
  }
  const ringPanel=r=>[r.x,r.z,r.width,r.height,r.seed];
  const walls=[[-4.2,0,8.4,4.7,113],[6.5,0,7.2,4.3,728],ringPanel(mission.rings[0]),[1.45,0,2.9,3.2,824],...mission.rings.slice(1).map(ringPanel),...mission.rings.filter(r=>r.postern!==undefined).map(r=>[r.postern,r.z,4,3.6,r.seed+1])].map(([x,z,width,height,seed])=>{
    const wall=createWall(scene,physics,{x,z,width,height,seed,cols:width<3?5:11,rows:6,faceMap:masonry(Math.round(width*1.35),Math.round(height*2),seed===113)});
    // Attach each merlon to the top fragment beneath it so the skyline
    // crumbles with the wall when its supports fall.
    for(let px=x-width/2+.42;px<x+width/2-.2;px+=1.05){
      const probe=new T.Raycaster(new T.Vector3(px,height+1,z),new T.Vector3(0,-1,0));
      for(const c of wall.cells)c.mesh.updateMatrixWorld(true);
      const support=probe.intersectObjects(wall.cells.map(c=>c.mesh),false)[0]?.object;
      if(support)box(.54,.58,.57,px-support.position.x,height+.28-support.position.y,0,stone,support);
    }
    return {...wall,x,z,width,height};
  });
  // A hinged service bridge seals the narrow western postern until the courtyard winch is reached.
  const bridge=new T.Group();bridge.position.set(-10.75,.04,0);scene.add(bridge);
  for(let i=0;i<6;i++)box(.34,3.25,.2,-.88+i*.35,1.63,0,wood,bridge);
  for(const y of [.6,2.5])box(2.12,.12,.23,0,y,0,iron,bridge);
  const stairs=[];
  for(let i=0;i<5;i++)stairs.push(box(2,.23*(i+1),.52,-9.8,.115*(i+1),-6+i*.5,stone));
  box(.33,.8,.45,-9.8,1.5,-4,wood);box(1.1,.16,.18,-9.8,1.85,-4,iron);
  const flag=new T.Group();flag.position.set(mission.flagX,0,lastRing.z-7);scene.add(flag);
  mesh(new T.CylinderGeometry(.07,.10,7,10),wood,0,3.5,0,flag);
  const banner=mesh(new T.PlaneGeometry(2.65,1.53,12,1),cloth,1.32,6.1,0,flag);
  box(.85,.85,.08,1.3,6.1,.05,new T.MeshStandardMaterial({color:0xe3b969}),flag).rotation.z=.785;
  const rockMat=new T.MeshStandardMaterial({color:0x66675d,flatShading:true});
  const boulder=new T.IcosahedronGeometry(1,1);
  function rock(r){const o=new T.Mesh(boulder,rockMat);o.scale.setScalar(r);return o;}
  const quarry=new T.Vector3(-8,0,8.5);
  for(let i=0;i<12;i++){const o=rock(.36+i%3*.055);o.position.set(quarry.x+(i%4)*.46-.7,.25+Math.floor(i/8)*.45,quarry.z+Math.floor(i/4)*.42);scene.add(o);}
  // A closed ammunition bay can only be entered through its street-facing wall.
  for(const x of [.04,2.86])obstacle(x,-1.75,.24,3.5,3.35,wood);
  obstacle(1.45,-3.45,3.05,.24,3.35,wood);
  box(3.3,.18,3.9,1.45,3.55,-1.55,wood).rotation.x=.07;
  const stores=new T.Group();stores.position.set(1.45,0,-1.9);scene.add(stores);
  for(let i=0;i<3;i++){const stone=rock(.32);stone.position.set((i-1)*.49,.34,0);stores.add(stone);}
  for(const x of [3.2,9.8])box(.42,5.1,1.1,x,2.55,-.1,stone);
  box(7,.46,1.15,6.5,5.15,-.1,wood);
  for(const x of [3.2,9.8])box(.7,1.4,.1,x,4.25,.56,cloth);
  const gallery=new T.Group();gallery.position.set(mission.gallery,2.85,1.1);scene.add(gallery);
  for(let i=0;i<7;i++)box(.46,.2,2.1,(i-3)*.48,0,0,wood,gallery);
  for(const x of [-1.42,1.42]){
    box(.18,1.75,.18,x,-.65,-.28,wood,gallery).rotation.x=-.55;
    box(.13,.8,.13,x,.45,.88,wood,gallery);
  }
  box(3.15,.14,.13,0,.82,.88,wood,gallery);
  const galleryWall=walls.find(w=>w.z===0&&Math.abs(w.x-mission.gallery)<w.width/2);
  const supports=galleryWall.cells.filter(c=>Math.abs(c.mesh.position.x-gallery.position.x)<1.6&&Math.abs(c.mesh.position.y-2.8)<.55);
  const depots=[];
  for(const ring of mission.rings.filter(r=>r.battery)){
    const [x,z]=ring.battery,cache=new T.Group();cache.position.set(x+(x>0?-3:3),0,z);scene.add(cache);
    box(1.75,.15,1,0,.14,0,wood,cache);
    for(let i=0;i<3;i++){const ball=rock(.29);ball.position.set((i-1)*.48,.42,0);cache.add(ball);}
    depots.push(cache);
  }
  const leaf=new T.MeshStandardMaterial({color:0x445b42,flatShading:true});
  for(let i=0;i<48;i++){
    const a=i*2.4,r=29+7*Math.sin(i);
    const tree=trees[i%trees.length].clone(true);
    const x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(Math.abs(x)<15&&z>back-3&&z<21)continue;
    tree.position.set(x,0,z);tree.rotation.y=i*1.83;
    tree.scale.multiplyScalar(.82+(i%7)*.067);scene.add(tree);
  }
  for(let i=0;i<20;i++){const a=i*.69;const hill=mesh(new T.IcosahedronGeometry(1,0),leaf,Math.cos(a)*50,-2,Math.sin(a)*50);hill.scale.set(13,7+i%5,11);if(Math.abs(hill.position.x)<23&&hill.position.z<0)hill.position.z+=back+26;}
  if(mission.landmark==='orchard'){
    for(let row=0;row<2;row++)for(let i=0;i<7;i++){
      const tree=trees[0].clone(true);tree.scale.multiplyScalar(.5+(i%3)*.06);
      tree.position.set(-16-row*4,0,-5-i*5);tree.rotation.y=i*1.51;scene.add(tree);
    }
    // Bottle kilns rise above the eastern wall of the lime yard.
    for(const z of [-21,-26]){
      mesh(new T.CylinderGeometry(1,2.6,6,14),stone,16,3,z);
      mesh(new T.CylinderGeometry(.75,1,3,14),stone,16,7.5,z);
      mesh(new T.CylinderGeometry(.91,.91,.32,14),iron,16,9,z);
    }
  }
  if(mission.landmark==='foundry'){
    for(const z of [-8,-14,-20]){
      box(4,4,5,16,2,z,stone);
      mesh(new T.CylinderGeometry(.65,1.15,8,10),iron,16,7,z);
      box(2,.48,.14,15,3.2,z+2.55,new T.MeshBasicMaterial({color:0xf59a42}));
    }
    const bronze=new T.MeshStandardMaterial({color:0x957036,metalness:.55,roughness:.45});
    for(const x of [-17,-14])for(const z of [-46,-49])box(.45,12,.45,x,6,z,wood);
    box(4.4,.4,4.4,-15.5,11.8,-47.5,wood);
    mesh(new T.CylinderGeometry(.64,1.35,1.8,16),bronze,-15.5,10.4,-47.5);
    mesh(new T.ConeGeometry(3.4,3.2,4),iron,-15.5,13.4,-47.5).rotation.y=Math.PI/4;
  }
  const ram=new T.Group();
  for(const x of [-.74,.74]){
    box(.14,.18,2.5,x,.42,0,wood,ram);
    for(const z of [-.84,.84]){
      box(.14,1.45,.15,x,1,z,wood,ram);
      const wheel=mesh(new T.CylinderGeometry(.36,.36,.18,12),wood,x*1.15,.36,z,ram);wheel.rotation.z=Math.PI/2;
    }
  }
  for(const z of [-.84,.84]){box(1.7,.15,.19,0,1.75,z,wood,ram);box(.07,.7,.08,0,1.35,z,iron,ram);}
  const log=mesh(new T.CylinderGeometry(.28,.31,3.2,12),wood,0,.99,-.25,ram);log.rotation.x=Math.PI/2;
  const head=mesh(new T.CylinderGeometry(.31,.31,.4,10),iron,0,.99,-1.78,ram);head.rotation.x=Math.PI/2;
  return {depots,gallery,galleryWall,supports,stores,walls,fixed,bridge,flag,banner,quarry,rock,ram,log,head};
}
