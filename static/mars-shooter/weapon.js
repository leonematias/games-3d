// M-41 Expedition LMG. Metres, Y up, muzzle along -Z.
// Purpose-built FPS mesh: chamfered armour, ventilated barrel shroud,
// linked ammunition, drum, optic and tactile rubber furniture.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function surfaceTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),data=ctx.createImageData(256,256);
  let seed=4107;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<data.data.length;i+=4){const v=223+rand()*29;data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;}
  ctx.putImageData(data,0,0);
  for(let i=0;i<180;i++){const x=rand()*256,y=rand()*256;ctx.strokeStyle=rand()>.5?'#ffffff38':'#1c24291b';ctx.lineWidth=rand()*.55+.2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand()*18+2,y+rand()*2);ctx.stroke();}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;return map;
}

export function createMachineGun({hands=true}={}) {
  const gun=new THREE.Group();gun.name='M41ExpeditionLMG';
  const staticParts=new THREE.Group();staticParts.name='Housing';gun.add(staticParts);
  const texture=surfaceTexture();
  const finish=(color,metalness,roughness)=>new THREE.MeshStandardMaterial({color,metalness,roughness,map:texture,envMapIntensity:.65});
  const metal=finish(0x747e80,.84,.34),edge=finish(0xa5acad,.9,.26),dark=finish(0x262e32,.72,.39),black=finish(0x10181d,.3,.47),rubber=finish(0x202528,.03,.92),brass=finish(0xba9146,.82,.27),copper=finish(0x896042,.8,.36),red=finish(0x913b2c,.45,.45);
  const glass=new THREE.MeshPhysicalMaterial({color:0x438785,metalness:.3,roughness:.16,transparent:true,opacity:.48,side:THREE.DoubleSide,envMapIntensity:1.5});
  const amber=new THREE.MeshStandardMaterial({color:0xffbe69,emissive:0xff7c25,emissiveIntensity:.6,roughness:.4});
  function part(geometry,material,at=[0,0,0],rotation=[0,0,0],parent=staticParts,name=''){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...at);mesh.rotation.set(...rotation);mesh.name=name;mesh.frustumCulled=false;parent.add(mesh);return mesh;
  }
  function box(size,at,material=metal,r=.009,rotation=[0,0,0],parent=staticParts){return part(new RoundedBoxGeometry(...size,2,Math.min(r,...size.map(v=>v*.24))),material,at,rotation,parent);}
  function cyl(radius,length,at,material=metal,axis='z',parent=staticParts,segments=24){return part(new THREE.CylinderGeometry(radius,radius,length,segments),material,at,axis==='z'?[Math.PI/2,0,0]:axis==='x'?[0,0,Math.PI/2]:[0,0,0],parent);}
  function ring(radius,tube,at,material=edge,axis='z',parent=staticParts){return part(new THREE.TorusGeometry(radius,tube,8,32),material,at,axis==='x'?[0,Math.PI/2,0]:axis==='y'?[Math.PI/2,0,0]:[0,0,0],parent);}
  function rod(a,b,r,material,parent=staticParts){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),mesh=part(new THREE.CylinderGeometry(r,r,start.distanceTo(end),12),material,[...start.clone().add(end).multiplyScalar(.5)], [0,0,0],parent);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return mesh;}
  function bolt(x,y,z,axis='x',parent=staticParts){cyl(.012,.008,[x,y,z],edge,axis,parent,12);cyl(.005,.009,[x,y,z],black,axis,parent,6);}
  function profile(points,width,at,material,parent=staticParts){
    const shape=new THREE.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.007,bevelThickness:.007,curveSegments:1});
    geometry.translate(0,0,-width/2);geometry.rotateY(Math.PI/2);return part(geometry,material,at,[0,0,0],parent);
  }
  // Silhouette: long barrel, compact receiver, lower drum and stepped shoulder stock.
  box([.235,.215,.49],[0,0,.015],dark,.025);
  box([.20,.07,.54],[0,.12,-.015],metal,.015);
  box([.16,.055,.42],[0,-.125,.04],black,.01);
  for(const side of [-1,1]){
    box([.025,.15,.37],[side*.124,.005,.035],metal,.012);
    box([.016,.07,.25],[side*.142,-.01,.025],dark,.006);
    box([.007,.016,.27],[side*.151,.047,.015],edge,.002);
    for(const z of [-.135,.19])for(const y of [-.046,.071])bolt(side*.145,y,z);
    box([.008,.05,.10],[side*.146,.002,.165],black,.003);
    for(let j=0;j<4;j++)box([.009,.03,.009],[side*.152,0,.13+j*.02],edge,.001);
    box([.014,.014,.11],[side*.143,-.073,-.095],red,.003);
  }
  // A real opening in the front brake, with a recessed bore and individual vent ribs.
  cyl(.042,.64,[0,.035,-.585],dark);
  for(const z of [-.34,-.48,-.65,-.79])cyl(.057,.028,[0,.035,z],edge);
  cyl(.075,.095,[0,.035,-.868],dark);
  cyl(.079,.025,[0,.035,-.924],metal);
  ring(.052,.015,[0,.035,-.942],edge);
  cyl(.037,.009,[0,.035,-.932],black);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;box([.018,.019,.056],[Math.sin(a)*.074,.035+Math.cos(a)*.074,-.869],black,.003,[0,0,-a]);}
  // Segmented shroud with shadowed ventilation slots instead of a solid box barrel.
  box([.145,.055,.42],[0,.113,-.53],metal,.012);
  box([.15,.045,.41],[0,-.052,-.52],black,.009);
  for(const side of [-1,1]){
    box([.025,.105,.43],[side*.073,.027,-.53],dark,.009);
    for(let i=0;i<9;i++){const z=-.72+i*.044;box([.012,.067,.019],[side*.09,.031,z],black,.003);box([.016,.075,.014],[side*.094,.033,z+.018],metal,.003);}
    box([.03,.028,.37],[side*.09,-.067,-.51],metal,.005);
    for(const z of [-.71,-.35])bolt(side*.1,.078,z);
  }
  // Gas piston above the barrel, ribbed collars and split front sight ears.
  cyl(.022,.49,[0,.153,-.53],dark);
  for(const z of [-.77,-.70,-.32])cyl(.032,.025,[0,.153,z],edge);
  box([.11,.045,.065],[0,.16,-.792],metal,.007);
  for(const side of [-1,1])box([.018,.08,.037],[side*.046,.206,-.792],dark,.004);
  box([.008,.045,.012],[0,.203,-.792],edge,.002);
  // Picatinny rail and a low, open reflex sight that does not hide the crosshair.
  box([.085,.025,.42],[0,.172,-.015],black,.003);
  for(let i=0;i<17;i++)box([.112,.018,.014],[0,.192,-.21+i*.025],metal,.002);
  box([.104,.022,.11],[0,.213,.06],dark,.005);
  for(const side of [-1,1])box([.016,.087,.045],[side*.049,.264,.06],metal,.004,[0,0,side*-.13]);
  box([.108,.017,.045],[0,.307,.06],dark,.003);
  part(new THREE.PlaneGeometry(.078,.064),glass,[0,.265,.061]);
  cyl(.022,.025,[.068,.234,.07],black,'x');bolt(.084,.234,.07);
  box([.018,.012,.03],[0,.319,.075],red,.002);
  // Rear receiver and skeleton stock with a cheek rest and ribbed shoulder pad.
  box([.155,.145,.12],[0,.006,.305],metal,.02);
  profile([[.3,.07],[.47,.08],[.57,.04],[.57,-.17],[.49,-.16],[.43,-.065],[.3,-.055]],.115,[0,0,0],dark);
  box([.155,.052,.20],[0,.105,.435],rubber,.014);
  box([.17,.255,.055],[0,-.034,.583],rubber,.015,[.06,0,0]);
  for(let i=0;i<8;i++)box([.175,.011,.012],[0,-.137+i*.029,.616],black,.002);
  for(const side of [-1,1]){box([.012,.047,.13],[side*.066,.008,.43],metal,.004);bolt(side*.071,.005,.365);}
  // Pistol grip, trigger and a three-sided guard, all independently readable.
  box([.085,.20,.075],[0,-.224,.184],rubber,.014,[-.26,0,0]);
  for(let i=0;i<6;i++)box([.088,.012,.078],[0,-.15-i*.026,.166+i*.007],black,.002,[-.26,0,0]);
  rod([0,-.12,.09],[0,-.19,.075],.008,edge);rod([0,-.125,.025],[0,-.21,.025],.012,dark);rod([0,-.21,.025],[0,-.23,.16],.012,dark);
  // Drum axes run across the gun; stepped end caps and ribs avoid a flat disc.
  const drum=new THREE.Group();drum.name='AmmoDrum';drum.position.set(-.045,-.225,-.1);gun.add(drum);
  cyl(.147,.225,[0,0,0],dark,'x',drum,40);
  for(const side of [-1,1]){
    cyl(.15,.023,[side*.11,0,0],metal,'x',drum,40);
    cyl(.12,.026,[side*.126,0,0],dark,'x',drum,32);
    ring(.103,.008,[side*.142,0,0],edge,'x',drum);
    cyl(.045,.032,[side*.139,0,0],metal,'x',drum);bolt(side*.16,0,0,'x',drum);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;box([.012,.014,.058],[side*.143,Math.sin(a)*.074,Math.cos(a)*.074],metal,.003,[a,0,0],drum);}
  }
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2;box([.19,.015,.014],[0,Math.sin(a)*.147,Math.cos(a)*.147],black,.003,[a,0,0],drum);}
  box([.11,.09,.10],[-.045,-.115,-.1],dark,.008);
  // Visible brass belt curls up the camera-facing side into the feed cover.
  const belt=new THREE.Group();belt.name='LinkedRounds';gun.add(belt);
  for(let i=0;i<9;i++){
    const t=i/8,a=t*1.3,x=-.15-Math.sin(a)*.083,y=.09-t*.25,z=-.12;
    cyl(.014,.088,[x,y,z],brass,'z',belt,12);
    part(new THREE.CylinderGeometry(.002,.014,.031,12),copper,[x,y,z-.059],[-Math.PI/2,0,0],belt);
    ring(.014,.003,[x,y,z+.028],dark,'z',belt);
    box([.034,.014,.024],[x,y,z+.018],dark,.002,[0,0,-a],belt);
  }
  box([.075,.045,.16],[-.15,.112,-.12],metal,.008);
  // Charging handle and ejection port have proper recesses and an animated bolt.
  box([.014,.045,.15],[.14,.045,-.025],black,.003);
  const action=new THREE.Group();action.name='BoltCarrier';gun.add(action);
  box([.014,.026,.075],[.15,.045,-.002],edge,.004,[0,0,0],action);
  cyl(.013,.06,[.175,.04,.04],dark,'x',action);cyl(.021,.024,[.208,.04,.04],metal,'x',action);
  const eject=new THREE.Object3D();eject.position.set(.17,.045,-.02);gun.add(eject);
  // Small surface markings give close-up scale without busy paintwork.
  function label(text,sub,w,h,position,rotation){
    const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');
    ctx.fillStyle='#d8d9ce';ctx.font='600 46px monospace';ctx.fillText(text,18,55);ctx.fillStyle='#9ca8a7';ctx.font='20px monospace';ctx.fillText(sub,18,94);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
    part(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:.65,polygonOffset:true,polygonOffsetFactor:-1}),position,rotation);
  }
  label('ARES / M–41','7.62  •  EXPEDITION SYSTEMS',.27,.068,[-.152,.018,.005],[0,-Math.PI/2,0]);
  label('CAUTION','BARREL MAY BE HOT',.18,.043,[.089,.105,-.52],[-Math.PI/2,0,0]);
  for(let i=0;i<3;i++)box([.022,.003,.047],[-.045+i*.036,.159,-.25],i===1?black:red,.001);
  // Rear-facing digital round counter is legible from the actual FPS camera.
  const counterCanvas=document.createElement('canvas');counterCanvas.width=128;counterCanvas.height=64;
  const counterMap=new THREE.CanvasTexture(counterCanvas);counterMap.colorSpace=THREE.SRGBColorSpace;
  box([.085,.048,.022],[-.10,.085,.272],black,.005);
  part(new THREE.PlaneGeometry(.071,.034),new THREE.MeshBasicMaterial({map:counterMap}),[-.10,.085,.285],[0,0,0]);
  let lastMag=-1;
  const muzzle=new THREE.Object3D();muzzle.name='Muzzle';muzzle.position.set(0,.035,-.968);gun.add(muzzle);

  // Integrated 40 mm launcher: separate bore, sliding breech, heat ribs and latch.
  const launcher=new THREE.Group();launcher.name='UnderbarrelGrenadeLauncher';gun.add(launcher);
  box([.15,.035,.45],[0,-.085,-.52],dark,.006,[0,0,0],launcher);
  cyl(.072,.46,[0,-.155,-.57],dark,'z',launcher);
  for(let i=0;i<6;i++)ring(.071,.009,[0,-.155,-.38-i*.055],metal,'z',launcher);
  cyl(.083,.035,[0,-.155,-.807],metal,'z',launcher);
  ring(.062,.012,[0,-.155,-.828],edge,'z',launcher);
  cyl(.052,.01,[0,-.155,-.815],black,'z',launcher);
  box([.025,.055,.13],[.088,-.15,-.41],amber,.005,[0,0,0],launcher);
  box([.03,.028,.07],[.11,-.12,-.36],dark,.004,[0,0,.18],launcher);
  const grenadeMuzzle=new THREE.Object3D();grenadeMuzzle.name='GrenadeMuzzle';grenadeMuzzle.position.set(0,-.155,-.85);launcher.add(grenadeMuzzle);

  let supportHand;
  if(hands){
    const cloth=finish(0x48483d,.02,.96),glove=finish(0x303737,.02,.88),knuckle=finish(0x4c5351,.1,.67);
    const arms=new THREE.Group();arms.name='OperatorHands';gun.add(arms);
    function hand(position,rotation,parent){
      const root=new THREE.Group();root.position.set(...position);root.rotation.set(...rotation);parent.add(root);
      box([.09,.085,.12],[0,0,0],glove,.022,[0,0,0],root);
      for(let i=0;i<4;i++){
        box([.022,.04,.059],[-.034+i*.023,-.034,-.028],glove,.01,[.4,0,0],root);
        box([.018,.017,.025],[-.034+i*.023,.038,-.024],knuckle,.006,[0,0,0],root);
      }
      box([.033,.063,.039],[-.05,-.012,.012],glove,.012,[0,0,-.45],root);
      return root;
    }
    hand([.017,-.208,.205],[-.2,0,0],arms);
    rod([.027,-.27,.26],[.12,-.43,.58],.07,cloth,arms);cyl(.076,.045,[.025,-.28,.29],black,'z',arms);
    supportHand=new THREE.Group();supportHand.name='SupportHand';arms.add(supportHand);
    hand([-.1,-.15,-.38],[.45,0,-.65],supportHand);
    rod([-.13,-.19,-.33],[-.26,-.42,.23],.065,cloth,supportHand);
    box([.09,.032,.10],[-.11,-.095,-.38],knuckle,.012,[0,0,-.4],supportHand);
    cyl(.072,.038,[-.16,-.23,-.28],rubber,'z',supportHand);
  }
  // Batch static geometry by finish. Hundreds of details cost a handful of draws.
  function batch(root){
    const groups=new Map();root.updateMatrixWorld(true);
    for(const child of [...root.children]){
      if(!child.isMesh)continue;
      const geometry=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();geometry.applyMatrix4(child.matrix);
      const list=groups.get(child.material)||[];list.push(geometry);groups.set(child.material,list);root.remove(child);child.geometry.dispose();
    }
    for(const [material,geometries] of groups){const merged=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();const mesh=new THREE.Mesh(merged,material);mesh.frustumCulled=false;root.add(mesh);}
  }
  batch(staticParts);batch(drum);batch(belt);batch(action);batch(launcher);
  function update({mag=60,recoil=0,reload=0,time=0,grenadeCooldown=0}={}){
    launcher.position.z=grenadeCooldown>1.35?(grenadeCooldown-1.35)*.28:0;
    action.position.z=recoil*.65;
    belt.position.y=Math.sin(time*70)*Math.min(recoil,.045)*.25;
    const phase=reload>0?1-reload/1.8:0,drop=reload>0?Math.sin(Math.PI*phase)**2:0;
    drum.position.set(-.045-drop*.12,-.225-drop*.21,-.1+drop*.08);drum.rotation.z=drop*.28;
    if(supportHand){supportHand.position.set(-drop*.05,-drop*.13,drop*.18);supportHand.rotation.z=-drop*.12;}
    if(lastMag!==mag){
      lastMag=mag;const ctx=counterCanvas.getContext('2d');ctx.fillStyle='#08161b';ctx.fillRect(0,0,128,64);ctx.fillStyle=mag<12?'#ff9260':'#8fe2d9';ctx.font='bold 52px monospace';ctx.textAlign='center';ctx.fillText(String(mag).padStart(2,'0'),64,51);counterMap.needsUpdate=true;
    }
  }
  update();return {gun,muzzle,grenadeMuzzle,eject,update};
}
