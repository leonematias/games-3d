import * as T from 'three';
import {mergeGeometries} from '../destructable-meshes/vendor/BufferGeometryUtils.js';
import {createWater} from '../voyager/water.js';
import {loadModel, cloneModel} from '../voyager/models.js';
import {loadTemplate, instantiate} from '../medieval/rig.js';

const V = (x,y,z) => new T.Vector3(x,y,z);
function material(color, options={}) {
  return new T.MeshStandardMaterial({color, roughness:.88, ...options});
}
function box(parent, w,h,d, mat, x,y,z) {
  const mesh = new T.Mesh(new T.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z); parent.add(mesh); return mesh;
}
function spar(parent, start, end, radius, mat, topRadius=radius) {
  const direction = end.clone().sub(start);
  const mesh = new T.Mesh(new T.CylinderGeometry(topRadius,radius,direction.length(),8),mat);
  mesh.position.copy(start).lerp(end,.5);
  mesh.quaternion.setFromUnitVectors(V(0,1,0),direction.normalize());
  parent.add(mesh); return mesh;
}
function weave(cloth) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = cloth ? '#eddfbd' : '#a07a56'; ctx.fillRect(0,0,128,256);
  for (let i=0; i<140; i++) {
    const x=(i*73)%128, y=(i*47)%256;
    ctx.fillStyle = cloth ? 'rgba(86,65,42,.08)' : 'rgba(56,34,22,.21)';
    ctx.fillRect(x,y,1,10+i%59);
  }
  if (cloth) {ctx.fillStyle='rgba(80,61,40,.22)';ctx.fillRect(0,0,2,256);}
  const tex=new T.CanvasTexture(canvas); tex.wrapS=tex.wrapT=T.RepeatWrapping;
  tex.repeat.set(cloth?9:1,1);tex.colorSpace=T.SRGBColorSpace;return tex;
}
const timber=material('#aea18e',{map:weave(false)}), dark=material('#573829'), oak=material('#966039'),
      rope=material('#6c563d'), linen=material('#ffefd2',{map:weave(true),side:T.DoubleSide});
export function widthAt(z) {
  const t=Math.min(1, Math.abs(z)/10);
  return 2.82*(1-Math.pow(t,z<0?2:3)*(z<0?.88:.37));
}
function caravel(detailed=true) {
  const root=new T.Group(), points=[], indices=[], colors=[];
  for(let row=0;row<=6;row++){
    const depth=row/6;
    for(let i=0;i<=40;i++){
      const z=i*.5-10;
      for(const sign of [-1,1]){
        points.push(sign*widthAt(z)*(1-.88*depth**1.7),.05-2.7*depth,z*(1-.10*depth));
        const c=new T.Color(row===1||row===4?'#503527':(row%2?'#865438':'#986440'));colors.push(c.r,c.g,c.b);
      }
      if(row && i) for(const side of [0,1]){
        const a=(row*41+i)*2+side;indices.push(a,a-2,a-82,a-2,a-84,a-82);
      }
    }
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
  root.add(new T.Mesh(geo,material('#ffffff',{vertexColors:true,side:T.DoubleSide})));
  const backing=[],triangles=[];
  for(let i=0;i<=40;i++){
    const z=-10+i*.5,w=widthAt(z);
    backing.push(-w,-.016,z,w,-.016,z);
    if(i){const n=i*2;triangles.push(n-2,n,n-1,n-1,n,n+1);}
  }
  const subdeck=new T.BufferGeometry();subdeck.setAttribute('position',new T.Float32BufferAttribute(backing,3));
  subdeck.setIndex(triangles);subdeck.computeVertexNormals();root.add(new T.Mesh(subdeck,material('#403327')));
  // Lay staggered fore-and-aft planks inside the taper of the hull.
  const deckMats=['#b59b7a','#ad916f','#bca27e'].map(c=>material(c,{map:weave(false)}));
  for(let lane=0;lane<17;lane++){
    const left=lane/17*2-1, right=(lane+1)/17*2-1;
    let start=-10;
    while(start<10){
      const end=Math.min(10,start+(start===-10?1.3+lane%3:3.1));
      const plank=new T.BufferGeometry(),v=[],uv=[],idx=[];
      for(let j=0;j<=4;j++){
        const z=T.MathUtils.lerp(start+.009,end-.009,j/4),w=widthAt(z);
        v.push(left*w+.008,.009,z,right*w-.008,.009,z);
        uv.push(0,j/4,1,j/4);
        if(j){const i=j*2;idx.push(i-2,i,i-1,i-1,i,i+1);}
      }
      plank.setAttribute('position',new T.Float32BufferAttribute(v,3));plank.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      plank.setIndex(idx);plank.computeVertexNormals();root.add(new T.Mesh(plank,deckMats[(lane+Math.floor(start+10))%3]));
      start=end;
    }
  }
  // The low aftercastle gives the waist of the caravel a distinct profile.
  for(let i=0;i<10;i++){
    const z=7.75+i*.23,w=widthAt(z);
    box(root,w*2,1.15,.235,dark,0,.50,z);
    box(root,w*2+.18,.12,.235,timber,0,1.12,z);
    for(const side of [-1,1]){
      box(root,.105,.14,.236,oak,side*(w+.04),.68,z);
      if(i%3===0)spar(root,V(side*w,1.17,z),V(side*w,1.8,z),.057,oak);
      spar(root,V(side*w,1.8,z),V(side*widthAt(z+.23),1.8,z+.23),.064,timber);
    }
  }
  for(const x of [-.6,.6])box(root,.75,.68,.09,timber,x,.46,7.6);
  for(const x of [-.86,-.63,-.4,.4,.63,.86])box(root,.038,.51,.08,dark,x,.50,7.53);
  box(root,1.15,.09,1.25,dark,.1,.05,3.4);
  for(let i=0;i<9;i++)box(root,.068,.085,1.22,oak,-.41+i*.125,.11,3.4);
  for(let i=0;i<7;i++)box(root,1.12,.06,.056,oak,.1,.13,2.86+i*.18);
  for(const sign of [-1,1]) for(let i=0;i<20;i++){
    const z=i-10,x=sign*widthAt(z), next=sign*widthAt(z+1);
    spar(root,V(x,.12,z),V(next,.12,z+1),.15,oak);
    spar(root,V(x,.88,z),V(next,.88,z+1),.095,timber);
    if(i%2===0)spar(root,V(x,0,z),V(x,.88,z),.09,oak);
  }
  for(const z of [-10,10]){
    box(root,widthAt(z)*2,.85,.16,oak,0,.38,z);
    const end=new T.BufferGeometry(),v=[],idx=[];
    for(let j=0;j<=6;j++){
      const d=j/6,w=widthAt(z)*(1-.88*d**1.7),pz=z*(1-.1*d);
      v.push(-w,.05-2.7*d,pz,w,.05-2.7*d,pz);
      if(j){const i=j*2;idx.push(i-2,i,i-1,i-1,i,i+1);}
    }
    end.setAttribute('position',new T.Float32BufferAttribute(v,3));end.setIndex(idx);end.computeVertexNormals();
    root.add(new T.Mesh(end,material('#81573c',{side:T.DoubleSide})));
  }
  const sails=[];
  for(const [z,h,w,drop] of [[-5.1,8.4,7.5,4.1],[.1,11.8,10.2,5.9]]){
    spar(root,V(0,0,z),V(0,h+.8,z),.205,oak,.12);
    const yard=new T.Group();yard.position.set(0,h,z);yard.rotation.y=-.22;root.add(yard);
    spar(yard,V(-w*.55,0,0),V(w*.55,0,0),.092,oak);
    const sail=new T.PlaneGeometry(w,drop,16,12),p=sail.attributes.position;
    for(let i=0;i<p.count;i++){
      const u=p.getX(i)/w+.5,v=.5-p.getY(i)/drop;
      p.setXYZ(i,(u-.5)*w*(1-.13*v),-drop*v+.58*Math.sin(u*Math.PI)*v*v,-.76*Math.sin(v*Math.PI)-.18*Math.cos(u*Math.PI*12)*Math.sin(v*Math.PI));
    }
    sail.computeVertexNormals();const sailMesh=new T.Mesh(sail,linen);yard.add(sailMesh);sails.push(sailMesh);
    for(const side of [-1,1]){
      const foot=V(side*widthAt(z+1.6),.4,z+1.6);
      spar(root,foot,V(0,h*.94,z),.029,rope);
      spar(root,V(side*widthAt(z+3),.4,z+3),V(0,h*.94,z),.029,rope);
      spar(root,V(side*widthAt(z+2),.45,z+2),V(side*w*.48,h,z+side*w*.1),.029,rope);
      if(detailed)for(let k=1;k<11;k++){
        const t=k/13,a=foot.clone().lerp(V(0,h*.94,z),t);
        spar(root,a,V(a.x,a.y,a.z+(1-t)*1.45),.016,rope);
      }
    }
  }
  const mizzen=6;
  spar(root,V(0,0,mizzen),V(0,7.6,mizzen),.14,oak,.07);
  spar(root,V(0,4.0,3.2),V(0,9.4,9.2),.09,oak);
  const triangle=new T.BufferGeometry();
  triangle.setAttribute('position',new T.Float32BufferAttribute([0,4,3.2,0,9.35,9.15,.48,3.0,8.8],3));
  triangle.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,1,1,0],2));triangle.computeVertexNormals();
  root.add(new T.Mesh(triangle,linen));
  spar(root,V(0,.2,-8.3),V(0,2.65,-13),.14,oak,.06);
  spar(root,V(0,2.65,-13),V(0,8.8,-5.1),.028,rope);
  spar(root,V(0,12.2,.1),V(0,1,9.6),.033,rope);
  // Hundreds of fixed planks and lines can share a draw call per material.
  root.updateMatrixWorld(true);
  const batches=new Map(),parts=[];
  root.traverse(part=>{
    if(!part.isMesh||sails.includes(part))return;
    const batch=batches.get(part.material)||[];
    const shape=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
    shape.applyMatrix4(part.matrixWorld);
    batch.push(shape);batches.set(part.material,batch);parts.push(part);
  });
  for(const part of parts){part.removeFromParent();part.geometry.dispose();}
  for(const [mat,shapes] of batches){
    const merged=mergeGeometries(shapes);
    root.add(new T.Mesh(merged,mat));
    shapes.forEach(shape=>shape.dispose());
  }
  return {root,sails};
}
function makeSky(scene) {
  const sky=new T.Mesh(new T.SphereGeometry(580,60,32),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{
      top:{value:new T.Color()},edge:{value:new T.Color()},sun:{value:V(0,0,0)},
      dusk:{value:1}
    },vertexShader:'varying vec3 ray; void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 ray; uniform vec3 top,edge,sun; uniform float dusk;
    void main(){vec3 d=normalize(ray);float a=max(d.y,0.);vec3 c=mix(edge,top,pow(smoothstep(-.03,.79,a),.5));
    float h=length(d-sun);c+=vec3(1.,.48,.18)*(.32*exp(-7.*h)+1.2*(1.-smoothstep(.018,.021,h)))*dusk;
    float haze=sin(d.x*19.+d.y*76.+sin(d.z*13.))*sin(d.x*11.-d.y*48.);
    c+=vec3(.08,.046,.04)*smoothstep(.12,.82,haze)*exp(-abs(d.y-.13)*12.)*dusk;
    gl_FragColor=vec4(c,1.);
    #include <colorspace_fragment>
    }`}));
  scene.add(sky);return sky.material.uniforms;
}
export const stations={
  cane:{x:-1.85,z:-2.7,label:'Inspect the cane'}, wood:{x:1.85,z:2.7,label:'Inspect the cut wood'},
  mate:{x:-1.15,z:6.8,label:'Give your report'}, bow:{x:.05,z:-7.7,label:'Join Rodrigo'},
  line:{x:.85,z:.4,label:'Work the mainmast line'}
};
export const shoreBearing=.36;
export async function makeWorld(canvas){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(61,1,.065,740);
  const sky=makeSky(scene),ship=caravel();scene.add(ship.root);
  const hemisphere=new T.HemisphereLight('#fff2d9','#766256',2.1);
  const sun=new T.DirectionalLight('#ffd0a0',2.2);sun.position.set(-50,38,-30);scene.add(hemisphere,sun);
  const water=createWater({level:-1.38,size:1000,segments:155,waves:[[.7,.71,.22,21],[-.85,.53,.1,7],[.2,.98,.07,3],[.88,-.47,.04,1.4]],speed:.75,deep:'#24485b',shallow:'#789fa0',sky:'#b9b1aa',lightDir:[-.5,.15,-.85],lightColor:'#ffbd80',opacity:1,foam:.09,fog:{color:'#c8aaa0',near:75,far:290}});
  water.mesh.material.fragmentShader=water.mesh.material.fragmentShader.replace('gl_FragColor = vec4(col, uOpacity);','gl_FragColor = vec4(col, uOpacity);\n#include <colorspace_fragment>');
  scene.add(water.mesh);
  const others=[[-52,-57,.77],[42,39,.65]].map(([x,z,s])=>{
    const vessel=caravel(false).root;vessel.scale.setScalar(s);vessel.position.set(x,-.42,z);vessel.rotation.y=.12;scene.add(vessel);return vessel;
  });
  const stars=new T.BufferGeometry(),coords=[];
  for(let i=1;i<=620;i++){
    const theta=i*2.399963, y=((i*397)%631)/631, r=Math.sqrt(1-y*y);
    coords.push(390*r*Math.cos(theta),390*y,390*r*Math.sin(theta));
  }
  stars.setAttribute('position',new T.Float32BufferAttribute(coords,3));
  const starlight=new T.PointsMaterial({color:'#f6ead6',size:.48,transparent:true,depthWrite:false});
  scene.add(new T.Points(stars,starlight));
  const island=new T.Group(); island.position.set(-Math.sin(shoreBearing)*180,-1.42,-Math.cos(shoreBearing)*180);
  scene.add(island);
  const landGeometry=new T.SphereGeometry(1,80,14),ap=landGeometry.attributes.position;
  for(let i=0;i<ap.count;i++){
    const x=ap.getX(i),z=ap.getZ(i);
    ap.setY(i,ap.getY(i)*(.54+.26*Math.sin(x*5)+.11*Math.cos(z*11)));
  }
  landGeometry.computeVertexNormals();
  const land=new T.Mesh(landGeometry,material('#42634b'));land.scale.set(42,6.2,16);island.add(land);
  const beach=new T.Mesh(new T.SphereGeometry(1,64,10),material('#ccba91'));beach.scale.set(43,1.1,18);island.add(beach);
  const [barrel,lantern,palm,mateTemplate,rodrigoTemplate]=await Promise.all([
    loadModel('Meshes/Containers/WineBarrel'),loadModel('Meshes/Camp/WoodLantern'),loadModel('Meshes/Trees/BentPalm'),
    loadTemplate('sailor-ewa'),loadTemplate('farmer-aldous')
  ]);
  function prop(parent,model,height,x,y,z){
    const obj=cloneModel(model,height/model.size.y);obj.position.set(x,y-model.box.min.y*obj.scale.y,z);parent.add(obj);return obj;
  }
  for(let i=0;i<30;i++){
    const x=Math.sin(i*8.21)*34,z=Math.cos(i*12.77)*6;
    const tree=prop(island,palm,2.6+(i%4)*.67,x,1,z);tree.rotation.y=i*.88;
  }
  [[2,6.1],[1.65,7.05],[-1.8,1.5],[-1.9,2.45]].forEach(([x,z])=>prop(ship.root,barrel,.87,x,0,z));
  for(const [x,z] of [[-2,5.4],[1.9,-3.8]]){
    spar(ship.root,V(x,0,z),V(x,1.48,z),.065,oak);prop(ship.root,lantern,.43,x,1.48,z);
    const glow=new T.PointLight('#ffab55',13,9);glow.position.set(x,1.8,z);ship.root.add(glow);
  }
  const reedMat=material('#95a65a'), reedJoint=material('#516746');
  for(const [id,mat] of [['wood',oak],['cane',reedMat]]){
    const {x,z}=stations[id];
    box(ship.root,.73,.61,1.35,timber,x,.31,z);
    spar(ship.root,V(x-.16,.72,z-.55),V(x+.14,.71,z+.56),id==='cane'?.058:.085,mat);
    for(let i=0;i<4;i++)box(ship.root,.13,.02,.035,id==='cane'?reedJoint:dark,x-.11+i*.06,.775,z-.42+i*.22);
  }
  for(let i=0;i<6;i++){
    const coil=new T.Mesh(new T.TorusGeometry(.37+i*.018,.033,6,36),rope);
    coil.rotation.x=Math.PI/2;coil.position.set(.91,.05+i*.055,.45);ship.root.add(coil);
  }
  const actors=[mateTemplate,rodrigoTemplate].map((tmpl,i)=>{
    const rig=instantiate(tmpl);rig.model.scale.setScalar(1.74/tmpl.height);
    rig.model.traverse(n=>{if(/^(hoe|wide_brim_hat|climbing_rope)/.test(n.name))n.visible=false;});
    rig.model.position.set(i?-.52:-1.2,0,i?-7.8:3.75);rig.model.rotation.y=i?-.15:Math.PI;
    ship.root.add(rig.model);rig.play('idle');return rig;
  });
  const highlight=new T.Mesh(new T.TorusGeometry(.26,.022,8,38),new T.MeshBasicMaterial({color:'#ffd78d'}));
  highlight.rotation.x=Math.PI/2;ship.root.add(highlight);
  const evening=[0x334c71,0xe7a67d],night=[0x131e3b,0x777e94],dawn=[0x6b99b3,0xeac3ac];
  const color=new T.Color(); let t=0,lightStage=0;
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();window.addEventListener('resize',resize);
  return {camera,render(dt,{mode,step,x,z,yaw,pitch,progress,target,filmTime}){
    t+=dt;const goal=mode==='title'?0:(step==='dawn'||step==='done'?2:['bow','bearing','line'].includes(step)?1:0);
    lightStage=T.MathUtils.damp(lightStage,goal,goal===2?.85:1.35,dt);
    const from=lightStage<=1?evening:night,to=lightStage<=1?night:dawn,k=lightStage<=1?lightStage:lightStage-1;
    sky.top.value.setHex(from[0]).lerp(color.setHex(to[0]),k);sky.edge.value.setHex(from[1]).lerp(color.setHex(to[1]),k);
    sky.sun.value.set(-.66,.095,-.744).normalize();sky.dusk.value=Math.max(0,1-lightStage);
    const daylight=Math.abs(lightStage-1);sun.intensity=.52+1.65*daylight;hemisphere.intensity=1.1+daylight;
    starlight.opacity=.1+.82*(1-daylight);island.visible=goal>0;
    water.uniforms.uFogColor.value.copy(sky.edge.value);water.uniforms.uSky.value.copy(sky.top.value);
    water.uniforms.uLightColor.value.setHex(0x839db9).lerp(color.setHex(0xffbc87),daylight);
    const morning=Math.max(0,lightStage-1);
    sun.position.z=-30+morning*90;water.uniforms.uLightDir.value.set(-.5,.15,-.85+morning*2).normalize();
    const fov=step==='dawn'||step==='done'?44:61;
    if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
    water.update(dt);ship.root.rotation.z=Math.sin(t*.57)*.012;ship.root.position.y=Math.sin(t*.89)*.07;
    others.forEach((o,i)=>{o.rotation.z=.045*Math.sin(t*.62+i);o.position.y=-.4+Math.sin(t*.81+i)*.13;});
    const mate=actors[0],rodrigo=actors[1];
    const mateZ=step==='brief'?3.75:7.1;
    const walking=Math.abs(mate.model.position.z-mateZ)>.04;
    if(walking){
      const direction=Math.sign(mateZ-mate.model.position.z);
      mate.model.position.z+=direction*Math.min(Math.abs(mateZ-mate.model.position.z),dt*1.4);
      mate.model.rotation.y=direction>0?0:Math.PI;
    }else if(Math.hypot(x+1.2,z-mateZ)<4.6){
      mate.model.rotation.y=Math.atan2(x+1.2,z-mateZ);
    }
    mate.play(walking?'walk':step==='brief'&&mode==='play'&&mate.has('talk')?'talk':'idle');
    rodrigo.model.rotation.y=step==='bow'&&Math.hypot(x+.52,z+7.8)<3?Math.atan2(x+.52,z+7.8):Math.PI+shoreBearing;
    actors.forEach(a=>a.update(dt));
    ship.sails[1].scale.y=1-.74*progress;
    highlight.visible=!!target;
    if(target){highlight.position.set(target.x,target===stations.wood||target===stations.cane?.84:.12,target.z);highlight.scale.setScalar(1.08+.14*Math.sin(t*3));}
    if(mode==='title'){
      camera.position.set(-24,6.6,14);camera.lookAt(-5,4.2,-3.5);
    }else if(step==='dawn'||step==='done'){
      camera.position.set(-2.12+Math.min(filmTime,5)*.10,2.4,-6.1);
      camera.lookAt(island.position.x,1.9,island.position.z);
    }else{
      camera.position.set(x,1.73+ship.root.position.y+x*ship.root.rotation.z,z);
      camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,ship.root.rotation.z*.42);
    }
    renderer.render(scene,camera);
  }};
}
