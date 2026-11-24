import * as T from 'three';
import {mergeGeometries} from '/games-3d/static/destructable-meshes/vendor/BufferGeometryUtils.js';
import {box,mesh,rod,ground,scatter,surface,library,random} from '../field-narratives/landscape.js';

const smooth=(a,b,v)=>T.MathUtils.smoothstep(v,a,b);
const coast=x=>95+2.4*Math.sin(x*.075)+1.7*Math.sin(x*.16);
export function land(x,z){
  const inland=coast(x)-z;
  if(inland<0)return Math.max(-4,-.21+inland*.15);
  const wrinkled=Math.sin(x*.105+z*.076)*.44+Math.cos(z*.19-x*.055)*.23;
  const shoulder=smooth(9,30,Math.abs(x));
  const dunes=(1-smooth(24,46,inland))*shoulder*(.7+.5*Math.sin(x*.12-z*.21));
  const banks=shoulder*(.6+1.35*Math.sin(x*.08+z*.043)**2);
  const plain=1.2+smooth(5,82,inland)*(3.5+banks)+wrinkled+dunes;
  const town=T.MathUtils.lerp(plain,4.72,smooth(-3,7,-z));
  return -.21+smooth(0,13,inland)*(town+.21)+smooth(55,83,-z)*10;
}
const textures=new T.TextureLoader();
export function tileTexture(name,repeat=1){
  const t=textures.load('/games-3d/textures/'+(name.includes('.')?name:name+'.jpg'));
  t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;t.repeat.setScalar(repeat);return t;
}
export function plain(scene){
  const soil=ground(scene,190,210,land,(c,x,z)=>{
    const v=Math.sin(x*.23+z*.11)+Math.cos(z*.28-x*.09);
    const road=x-3.2*Math.sin(z*.075);
    const sand=smooth(62,87,z+v*1.9);
    const grass=(1-sand)*smooth(3.7,13,Math.abs(road)+v*2)*(1-smooth(50,67,Math.abs(x))*.34);
    const paving=(1-smooth(4,10,z))* (1-smooth(8,15,Math.abs(x)+v));
    c.setRGB(sand,grass,paving);
  },39);
  const mat=soil.material;mat.map.dispose();mat.map=tileTexture('ground_dirt');
  const sand=tileTexture('sand_dunes'),grass=tileTexture('grass_dry'),stone=tileTexture('paving_cobble');
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{beach:{value:sand},scrub:{value:grass},paving:{value:stone}});
    shader.fragmentShader='uniform sampler2D beach, scrub, paving;\n'+shader.fragmentShader
      .replace('#include <map_fragment>',`
       vec3 dirt=texture2D(map,vMapUv*1.75).rgb*vec3(1.18,.98,.79);
       vec3 earth=mix(dirt,texture2D(scrub,vMapUv*1.22).rgb*vec3(.94,.91,.67),vColor.g*.82);
       earth=mix(earth,texture2D(beach,vMapUv*1.36).rgb*vec3(1.06,1.0,.89),vColor.r);
       diffuseColor.rgb*=mix(earth,texture2D(paving,vMapUv*2.6).rgb*vec3(1.12,.99,.82),vColor.b);
      `).replace('#include <color_fragment>','');
  };
  soil.receiveShadow=true;
}

// Flatten static scenery once. Moving doors, the horse fittings and animated rigs stay separate.
export function batchScenery(group){
  group.updateWorldMatrix(true,true);
  const inverse=group.matrixWorld.clone().invert(),sets=new Map(),transform=new T.Matrix4();
  group.traverse(n=>{
    if(!n.isMesh)return;
    const g=n.geometry.index?n.geometry.toNonIndexed():n.geometry.clone();
    for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
    g.clearGroups();g.applyMatrix4(transform.multiplyMatrices(inverse,n.matrixWorld));
    if(!sets.has(n.material))sets.set(n.material,[]);
    sets.get(n.material).push(g);
  });
  group.clear();
  for(const [mat,geos] of sets){
    const combined=mergeGeometries(geos);const m=mesh(group,combined,mat);
    m.castShadow=m.receiveShadow=true;geos.forEach(g=>g.dispose());
  }
}
export function seaSurface(scene){
  const water=mesh(scene,new T.PlaneGeometry(390,165),new T.ShaderMaterial({
    uniforms:{time:{value:0},dusk:{value:0}},
    vertexShader:'varying vec3 pos;void main(){vec4 p=modelMatrix*vec4(position,1.);pos=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
    fragmentShader:`varying vec3 pos;uniform float time,dusk;void main(){
      float x=pos.x,z=pos.z,shore=z-(95.+2.4*sin(x*.075)+1.7*sin(x*.16));
      float ripple=sin(z*3.4+sin(x*.7+time)*.5-time*2.4)+.5*sin(x*.9+z*2.-time);
      vec3 c=mix(vec3(.11,.27,.24),vec3(.024,.11,.17),smoothstep(-1.,26.,shore));
      c+=.019*sin(z*.63+x*.18+sin(x*.44))*vec3(.8,.9,1.);
      c+=smoothstep(1.18,1.48,ripple)*.065;
      float crest=sin(shore*2.6-time*2.+sin(x*.48)*.4);
      c=mix(c,vec3(.75,.83,.75),smoothstep(.30,1.,crest+.15*sin(x*3.8+z))*clamp(.45+.36*sin(x*2.7+z*4.9)+.24*sin(x*.81-z*2.3),.16,.88)*(1.-smoothstep(.0,5.,abs(shore-1.))));
      gl_FragColor=vec4(mix(c,c*vec3(.20,.23,.37),dusk),1.);
      #include <colorspace_fragment>
    }`
  }),0,-.205,162);water.rotation.x=-Math.PI/2;
  return (t,night)=>{water.material.uniforms.time.value=t;water.material.uniforms.dusk.value=Number(night);};
}
export function pitchedRoof(group,x,y,z,w,h,d,mat){
  const shape=new T.Shape();shape.moveTo(-w/2,0);shape.lineTo(0,h);shape.lineTo(w/2,0);shape.closePath();
  return mesh(group,new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false}),mat,x,y,z-d/2);
}
export function citadel(g){
  const limestone=surface('#aa8665'),plaster=surface('#d3ac7b'),beam=surface('#694836'),roof=surface('#a15740');
  for(let level=0;level<3;level++){
    const z=-73-level*7,w=89-level*15,y=12+level*4;
    box(g,limestone,0,y-4,z,w,8,24);box(g,plaster,0,y+.18,z,w+.65,.48,24.5);
    for(let i=-1;i<=1;i+=2)box(g,limestone,i*(w/2-1.5),y+1,z+10,4,4,4);
  }
  for(const [x,z,w] of [[0,-87,20],[-22,-79,13],[23,-79,14]]){
    const y=x?16.3:20.4;
    box(g,plaster,x,y+2.2,z,w,4.4,9);
    for(let i=-2;i<=2;i++)rod(g,beam,[x+i*w*.18,y,z+5.6],[x+i*w*.18,y+4.2,z+5.6],.3);
    box(g,beam,x,y+4.25,z,w+.7,.45,12);pitchedRoof(g,x,y+4.47,z,w+1.4,2.7,12.6,roof);
  }
}
export async function dressField(scene){
  const rng=random(22541);
  const specs=[
    ['Plants/DuneGrass',.62],['Plants/DryGrass',.46],['Rocks/PropPebbles',.25],['Rocks/ShoreShelf',1.45],
    ['Containers/GrainJars',1.1],['Camp/WeaponRack',1.6],['Camp/FireRing',.46],['Camp/MarketStallCloth',2.55]
  ];
  const models=await Promise.all(specs.map(([name,h])=>library(name,h)));
  const groups=specs.map(()=>[]);
  function add(k,x,z,size=1,angle=rng()*6.28){groups[k].push([x,land(x,z)-size*.025,z,models[k].scale.x*size,angle]);}
  for(let i=0;i<580;i++){
    const x=(rng()-.5)*116,z=6+rng()*85;
    if(Math.abs(x-3.2*Math.sin(z*.075))<5)continue;
    add(z>68?0:1,x,z,.55+rng()*.78);
    if(i%5===0)add(2,x+.8,z+.4,.7+rng()*.8);
  }
  for(let i=0;i<24;i++){const x=(i%2?1:-1)*(27+rng()*49);add(3,x,coast(x)+rng()*5,.53+rng()*.65);}
  for(const [x,z] of [[-29,73],[-19,81],[-39,77],[32,62],[22,90],[15,-18],[-16,-32],[20,-39]]){
    add(4,x,z);add(4,x+.76,z+.7,.71);
  }
  for(const [x,z] of [[-23,74],[-35,82],[32,59]])add(5,x,z,1,.18);
  add(6,-24,78);add(6,-32,74);add(7,-19,-18,1,1.3);add(7,20,-40,1,-.8);
  groups.forEach((rows,k)=>{
    const objects=scatter(scene,models[k].geometry,models[k].material,rows);
    objects.receiveShadow=true;objects.castShadow=k>=3;
  });
}
