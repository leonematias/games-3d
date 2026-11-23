import * as T from 'three';
import {level,levelId} from './levels.js';

export const river = x => -1 + Math.sin(x * .07) * 1.7;
export function height(x,z) {
  if(['siege','stockade'].includes(levelId))return 0;
  if(levelId==='pines')return 1.1+.6*Math.sin(x*.13+z*.06)+.4*Math.cos(z*.17);
  if(levelId==='pass')return 1+(60-z)*.095+Math.min(14,Math.max(0,Math.abs(x)-24)*.42)+.65*Math.cos(z*.10+x*.05);
  if(levelId==='quarry')return 1+2*(1+Math.tanh((z-22)/5))+1.6*(1+Math.tanh((z+9)/5))+Math.max(0,Math.abs(x)-30)*.25;
  const bank = Math.min(1, Math.abs(z-river(x))/5);
  return -.5 + bank * (.72 + .28*Math.sin(x*.14+z*.21)) + Math.max(0,z-10)*.084;
}
export function random(seed) {
  return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}
const box = new T.BoxGeometry(1,1,1), cone = new T.ConeGeometry(1,1,7);
const rock = new T.IcosahedronGeometry(1,0);
const log=new T.CylinderGeometry(.5,.54,1,9);log.rotateX(Math.PI/2);
const blade=new T.BufferGeometry();blade.setAttribute('position',new T.Float32BufferAttribute([-.65,-.5,0,.65,-.5,0,.27,.5,0],3));blade.computeVertexNormals();
const material = new T.MeshStandardMaterial({flatShading:true,roughness:.94});
export function part(group,geometry,color,x,y,z,sx,sy,sz,rz=0) {
  const mesh = new T.Mesh(geometry,new T.MeshStandardMaterial({color,flatShading:true}));
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz);mesh.rotation.z=rz;group.add(mesh);return mesh;
}
export function squadBanner(){
  const g=new T.Group();
  part(g,box,0x63452b,0,1.4,0,.07,2.8,.07);
  part(g,box,0xa8322c,0,2.1,0,.85,.85,.075);
  part(g,box,0xf2ca78,0,2.55,0,1,.09,.09);
  part(g,box,0xf2ca78,0,2.1,.043,.14,.42,.025);
  return g;
}
export function standard() {
  const g=new T.Group(), gold=0xf0bb50;
  part(g,box,0x694021,0,1.45,0,.065,2.9,.065);
  part(g,box,0x982d26,0,2.18,0,.55,.59,.06);
  part(g,box,gold,0,2.48,0,.71,.065,.09);
  part(g,rock,gold,0,2.88,0,.13,.21,.12);
  part(g,rock,gold,.1,3.04,0,.11,.09,.1);
  for(const side of [-1,1]) for(let i=0;i<3;i++)
    part(g,rock,gold,side*(.12+i*.11),2.88+i*.105,0,.18,.094,.075,side*(.4+i*.12));
  part(g,rock,gold,0,2.22,.047,.09,.11,.04);
  return g;
}
export function buildField(scene) {
  const rand=random(levelId==='ford'?713:level.seed), dummy=new T.Object3D(), batches=new Map();
  function add(geo,c,x,y,z,sx,sy,sz,ry=0,rz=0){
    if(!batches.has(geo)) batches.set(geo,[]);
    dummy.position.set(x,y,z);dummy.rotation.set(0,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
    batches.get(geo).push([dummy.matrix.clone(),new T.Color(c)]);
  }
  scene.background=new T.Color(0xefc594);scene.fog=new T.FogExp2(level.fog,levelId==='pines'?.021:.012);
  scene.add(new T.HemisphereLight(0xffecd3,0x929d7f,2.05));
  const sun=new T.DirectionalLight(levelId==='pass'?0xebf5ff:0xffdfa7,2.25);sun.position.set(-36,35,-24);scene.add(sun);
  const sky=new T.Mesh(new T.SphereGeometry(210,32,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,
    vertexShader:'varying vec3 dir; void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 dir;void main(){vec3 d=normalize(dir);float t=smoothstep(-.08,.62,d.y);vec3 col=mix(${levelId==='pass'?'vec3(.77,.84,.90),vec3(.29,.42,.61)':levelId==='pines'?'vec3(.54,.64,.60),vec3(.23,.36,.40)':'vec3(.93,.70,.48),vec3(.22,.40,.52)'},t);float s=distance(d,normalize(vec3(-.48,.19,-1.)));col+=vec3(.36,.23,.09)*exp(-s*9.);col=mix(col,vec3(1.,.89,.65),1.-smoothstep(.032,.035,s));gl_FragColor=vec4(col,1.);}`}));
  scene.add(sky);
  const ground=new T.PlaneGeometry(210,165,160,128);
  ground.rotateX(-Math.PI/2);
  const pos=ground.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setY(i,height(pos.getX(i),pos.getZ(i)));
  ground.computeVertexNormals();

  const loader=new T.TextureLoader();
  function groundTile(name){
    const tile=loader.load('/games-3d/textures/'+name+'.jpg');
    tile.wrapS=tile.wrapT=T.RepeatWrapping;
    tile.colorSpace=T.SRGBColorSpace;
    tile.anisotropy=4;
    return tile;
  }
  const dirt=groundTile(level.soil);
  const turf=new T.MeshStandardMaterial({map:groundTile(level.turf),color:levelId==='pines'?0xb4c2a7:0xffffff,roughness:1});
  turf.onBeforeCompile=shader=>{
    shader.uniforms.bankTexture={value:dirt};
    shader.vertexShader='varying vec2 fieldXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfieldXZ=position.xz;');
    shader.fragmentShader='uniform sampler2D bankTexture; varying vec2 fieldXZ;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 uv=fieldXZ*.24;
      vec4 grass=texture2D(map,uv);
      vec4 soil=texture2D(bankTexture,fieldXZ*.31);
      float variation=.55*sin(fieldXZ.x*.8+fieldXZ.y*.41)+.38*cos(fieldXZ.y*1.06);
      float bank=abs(fieldXZ.y+1.-1.7*sin(fieldXZ.x*.07));
      float path=abs(fieldXZ.x-2.*sin(fieldXZ.y*.3));
      float turfWeight=smoothstep(2.,5.8,${levelId==='ford'?'min(bank,path+1.)':'abs(fieldXZ.x-9.*sin(fieldXZ.y*.11))+1.'}+variation);
      diffuseColor*=mix(${levelId==='pass'?'mix(grass,soil,.42)':'soil'},grass,turfWeight);
    `);
  };
  scene.add(new T.Mesh(ground,turf));
  if(levelId==='ford'){
  const water=new T.Mesh(new T.PlaneGeometry(205,13),new T.MeshStandardMaterial({color:0x689d9a,roughness:.44}));water.rotation.x=-Math.PI/2;water.position.set(0,-.20,-1);scene.add(water);
  for(let i=0;i<550;i++){const x=(rand()-.5)*120,z=river(x)+(rand()-.5)*3.9;add(box,rand()<.5?0x91bcb3:0x82afa9,x,-.185,z,.25+rand()*1.4,.015,.04+rand()*.08);}
  }
  if(levelId==='ford'||levelId==='pines')for(let i=0;i<4600;i++){
    const x=(rand()-.5)*146,z=(rand()-.5)*106;
    if(Math.abs(z-river(x))<4.3||Math.abs(x)<3.5)continue;
    const h=.09+rand()*.3;add(blade,levelId==='pines'?0x496749:rand()<.5?0xa9a266:0x818853,x,height(x,z)+h*.42,z,.06,h,.065,rand()*3,-.22);
  }
  if(levelId!=='quarry')for(let i=0;i<(levelId==='pines'?950:310);i++){
    const x=(rand()-.5)*172,z=(rand()-.5)*130;
    if(levelId==='pines'){
      if(Math.hypot(x-7,z-6)<6)continue;
      const markers=[{x:0,z:53},...level.road,level.eagle];
      if(markers.some((p,j)=>{
        const q=markers[j+1]||p,dx=q.x-p.x,dz=q.z-p.z;
        const t=Math.max(0,Math.min(1,((x-p.x)*dx+(z-p.z)*dz)/(dx*dx+dz*dz||1)));
        return Math.hypot(x-p.x-t*dx,z-p.z-t*dz)<8.5;
      }))continue;
    }else if(Math.abs(x)<38&&z>-59&&z<64 || levelId==='ford'&&Math.abs(z-river(x))<6)continue;
    const h=levelId==='pines'?4+rand()*7:2+rand()*5,y=height(x,z);
    add(box,0x675a42,x,y+h*.24,z,h*.08,h*.5,h*.08);
    for(let k=0;k<3;k++)add(cone,levelId==='pass'&&k>0?0xd5e1ea:[0x384e43,0x485e4c,0x576e54][k],x,y+h*(.42+k*.20),z,h*(.31-.065*k),h*.54,h*(.31-.065*k),i);
  }
  if(levelId==='ford')for(let i=0;i<120;i++){
    const x=(rand()-.5)*115,z=river(x)+(rand()-.5)*10,r=.12+rand()*.48;
    add(rock,0x86877a,x,height(x,z)+.09,z,r,r*.56,r*.8,rand()*6);
  }
  for(const [distance,tone,peak] of [[100,0x859393,26],[70,0x677d73,16]]){
    const ridge=new T.PlaneGeometry(240,1,38,4);const v=ridge.attributes.position;
    for(let i=0;i<v.count;i++){
      const x=v.getX(i),t=v.getY(i)+.5;
      const skyline=(levelId==='pass'?peak*1.7:peak)*(.70+.25*Math.sin(x*.067)+.21*Math.cos(x*.13+distance)+.09*Math.sin(x*.37));
      v.setXYZ(i,x,t*skyline-2,-distance+(1-t)*17+2*Math.cos(x*.3+t*6));
    }
    ridge.computeVertexNormals();scene.add(new T.Mesh(ridge,new T.MeshStandardMaterial({color:levelId==='pass'?0xb1c3cf:levelId==='quarry'?0xb68362:tone,flatShading:true,side:T.DoubleSide})));
  }
  if(levelId==='ford'){
  // Cloth tents and paired camp standards mark the rally ridge.
  const tent=new T.ConeGeometry(1,1,4);tent.rotateY(Math.PI/4);
  for(const x of [-11,-6,7,12])for(const z of [20,25]){
    add(tent,0xbfa980,x,height(x,z)+1.2,z,2.5,2.6,3.4);
  }
  for(const [x,z] of [[-2,16],[2,16],[-16,6],[15,5],[-10,-15],[12,-16]]){
    let y=height(x,z);add(box,0x6b4c32,x,y+2,z,.09,4,.09);
    add(box,z<0?0x36515a:0xa62f28,x+.48,y+3.34,z,.97,1.15,.055);
    add(box,0xd7b168,x+.48,y+2.82,z,.97,.09,.06);
  }
  // Scout fire, abandoned camp, and captured standard mark the march north.
  for(const [x,z] of [[-4,45],[-9,26],[7,3],[-4,-20],[0,-51]]){
    const y=height(x,z);
    for(let j=0;j<8;j++){
      const a=j*Math.PI/4;add(rock,0x68604f,x+Math.sin(a)*.6,y+.14,z+Math.cos(a)*.6,.22,.16,.21,a);
    }
    add(cone,0xb65e29,x,y+.34,z,.35,.8,.35);add(cone,0xf2ae51,x+.08,y+.3,z,.19,.63,.18);
  }
  for(const x of [-4,4]){
    const z=-52,y=height(x,z);add(box,0x62482f,x,y+2,z,.11,4,.11);
    add(box,0x394f53,x+.5,y+3.2,z,1.0,1.4,.07);
  }
  // Broken supply cart beside the crossing.
  const wheel=new T.TorusGeometry(.49,.075,5,12);wheel.rotateY(Math.PI/2);
  const cy=height(5,-4);add(box,0x785938,5,cy+.54,-4,1.6,.34,2.2,0,.23);
  for(let i=0;i<3;i++)add(box,0x987045,5.72,cy+.65+i*.19,-4,.1,.16,2.2,0,.23);
  for(const x of [4.1,5.9])add(wheel,0x554535,x,cy+.49,-4,1,1,1);
  }else{
    if(!['siege','stockade'].includes(levelId))for(const [index,site] of [...level.road,level.eagle].entries()){
      const {x,z}=site;
      if(levelId==='pines'){
        // Stacked cut trunks and stump rings mark the clearings.
        for(const side of [-1,1])for(let j=0;j<5;j++){
          const px=x+side*(7+j%3*.62),pz=z+2;
          add(log,0x654a33,px,height(px,pz)+.3+Math.floor(j/3)*.57,pz,.58,.57,3.6);
        }
      }else if(levelId==='pass'){
        for(const side of [-1,1])for(let j=0;j<4;j++){
          const px=x+side*6.5;
          add(rock,j===3?0xe2edf1:0x77838c,px,height(px,z)+.38+j*.61,z,1.4-j*.24,.58,1.3-j*.2,j);
        }
      }else{
        for(const side of [-1,1]){
          const px=x+side*8,y=height(px,z),h=index===4?5:2.8;
          if(index<3){
            for(let row=0;row<2;row++)for(let k=0;k<3-row;k++)
              add(box,k%2?0xaf7954:0xc18b63,px+k*1.8+row*.5,y+.5+row,z,1.7,.94,1.5,side*.09);
            continue;
          }
          add(box,0xaf7353,px,y+h/2,z,1.5,h,1.8);
          add(box,0xd4a67c,px,y+h,z,2.2,.5,2.1);
        }
      }
    }
    if(levelId==='quarry'||levelId==='pass')for(let i=0;i<200;i++){
      const x=(i%2?1:-1)*(34+rand()*38),z=rand()*135-69,r=1+rand()*4;
      add(levelId==='pass'?rock:box,levelId==='pass'?0x8796a2:0xad7356,x,height(x,z)+r*.35,z,r*1.6,r,r*1.3,rand()*.4);
    }
    if(levelId==='pass')for(const x of [-14,14]){
      const z=-42,y=height(x,z);
      for(const dx of [-1.4,1.4])for(const dz of [-1.4,1.4])add(box,0x644d40,x+dx,y+2,z+dz,.32,4,.32);
      add(box,0x806752,x,y+3.6,z,3.6,.55,3.6);
      add(cone,0xdde7e9,x,y+5.3,z,2.8,2,2.8);
    }
  }
  for(const [geo,list] of batches){
    const mesh=new T.InstancedMesh(geo,material,list.length);
    list.forEach(([matrix,color],i)=>{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color);});scene.add(mesh);
  }
}
