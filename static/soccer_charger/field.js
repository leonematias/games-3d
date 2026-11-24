import * as T from 'three';
import {buildBall, buildPlayer, loadPlayers} from '../soccer/actors.js';
import {createSky} from '../soccer/sky.js';
import {buildGrounds, fieldX, fieldZ, goalX} from './grounds.js';

const gold=0xffcf43;
function solid(geom,color){return new T.Mesh(geom,new T.MeshStandardMaterial({color,roughness:.76}))}
function turfRing(inner,outer,color){
  const mesh=new T.Mesh(new T.RingGeometry(inner,outer,48),new T.MeshBasicMaterial({color,side:T.DoubleSide}));
  mesh.rotation.x=-Math.PI/2;mesh.position.y=.055;return mesh;
}
function kit(shirt,short='#183938',sock='#e4efda'){
  return {shirt,short,sock,boot:'#272d31',trim:'#fff1c9'};
}
function markLine(x1,z1,x2,z2,color,dash,gap){
  const geom=new T.BufferGeometry().setFromPoints([new T.Vector3(x1,.065,z1),new T.Vector3(x2,.065,z2)]);
  const line=new T.Line(geom,new T.LineDashedMaterial({color,dashSize:dash,gapSize:gap}));
  line.computeLineDistances();return line;
}
function tag(text){
  const c=document.createElement('canvas');c.width=256;c.height=64;
  const g=c.getContext('2d');g.fillStyle='#163c34';g.fillRect(0,0,256,64);
  g.fillStyle='#fff0bf';g.font='bold 35px Arial';g.textAlign='center';g.fillText(text,128,44);
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map,depthTest:false}));
  sprite.scale.set(1.5,.375,1);sprite.renderOrder=3;return sprite;
}
function makeBolt(){
  const shape=new T.Shape();
  const outline=[[.16,.50],[-.29,-.03],[-.05,-.03],[-.18,-.48],[.31,.09],[.04,.09]];
  outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  const mesh=solid(new T.ExtrudeGeometry(shape,{depth:.09,bevelEnabled:false}),gold);
  mesh.material.emissive.setHex(0x986000);return mesh;
}

export async function createField(){
  const canvas=document.querySelector('.stadium canvas');
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const world=new T.Scene();world.fog=new T.FogExp2(0xe4e3cd,.013);
  const sky=createSky(world);
  const camera=new T.PerspectiveCamera(43,2.4,.08,220);
  const hemi=new T.HemisphereLight(0xfff3d8,0x839278,1.8);
  const sun=new T.DirectionalLight(0xffe5bd,2.05);sun.position.set(-18,26,13);world.add(hemi,sun);
  buildGrounds(world);
  const cones=new T.Group();world.add(cones);
  for(const y of [229,282]){
    const cone=solid(new T.ConeGeometry(.24,.65,16),0xff7a29);
    cone.position.set(fieldX(536),.33,fieldZ(y));cones.add(cone);
    const band=solid(new T.CylinderGeometry(.092,.125,.095,16),0xffefd2);
    band.position.copy(cone.position);band.position.y+=.056;cones.add(band);
    const foot=solid(new T.BoxGeometry(.51,.05,.51),0xd55f23);
    foot.position.set(cone.position.x,.045,cone.position.z);cones.add(foot);
  }
  const pickup=makeBolt(),boltPad=turfRing(.32,.37,gold);
  pickup.position.set(fieldX(635),1,fieldZ(227));boltPad.position.set(pickup.position.x,.052,pickup.position.z);
  const range=markLine(fieldX(670),-8,fieldX(670),8,0xffe394,.36,.19);
  const duel=markLine(fieldX(790),-8,fieldX(790),8,0xfff1a1,.6,.12);
  const aim=markLine(0,0,1,0,0xffefb7,.22,.14);
  const ring=turfRing(.44,.50,gold), ball=buildBall();ball.scale.setScalar(1.02);
  const flare=solid(new T.ConeGeometry(.16,1.6,8),gold);flare.rotation.z=Math.PI/2;
  flare.material.emissive.setHex(0xf87310);
  world.add(pickup,boltPad,range,duel,aim,ring,ball,flare);

  await loadPlayers();
  function actor(id,number,shirt,skin,hair,scale){
    const view=buildPlayer({id,number,kit:kit(shirt),skin,hair});
    view.root.scale.setScalar(scale);world.add(view.root);
    const shade=new T.Mesh(new T.CircleGeometry(1,28),new T.MeshBasicMaterial({color:0x1c3925,transparent:true,opacity:.23,depthWrite:false}));
    shade.rotation.x=-Math.PI/2;shade.scale.set(.42,.26,1);shade.position.y=.048;world.add(shade);
    const name=tag(id);world.add(name);
    return {view,shade,name,clip:null,heading:0,lastX:null,lastZ:null};
  }
  const thomas=actor('Thomas',10,'#14714f','#deae87','brown',.91);
  const liv=actor('Liv',7,'#14714f','#976a4f','black',.88);
  const sami=actor('Sami',8,'#14714f','#bb855e','navy',.87);
  const dad=actor('Matias','M','#294a60','#c78e65','brown',1.09);
  const defender=actor('Rival',4,'#c46b42','#b87e59','rust',.9);
  const keeper=actor('Keeper',1,'#f3ae38','#deaa83','black',.92);
  // Only active actors advance their skeletal animation.
  function place(a,visible,x,z,yaw,clip,dt,showName=false,y=0){
    const {view,shade,name}=a;
    view.root.visible=shade.visible=visible;name.visible=visible&&showName;
    if(!visible){a.lastX=null;return}
    const first=a.lastX===null;
    view.root.position.set(x,y,z);
    if(yaw===null){
      const dx=x-a.lastX,dz=z-a.lastZ;
      yaw=!first&&Math.hypot(dx,dz)>.004?Math.atan2(-dx,-dz):first?-Math.PI/2:a.heading;
    }
    a.heading=yaw;const diff=Math.atan2(Math.sin(yaw-view.root.rotation.y),Math.cos(yaw-view.root.rotation.y));
    view.root.rotation.y+=diff*(first?1:Math.min(1,dt*16));
    a.lastX=x;a.lastZ=z;
    shade.position.x=x+.06;shade.position.z=z+.07;
    name.position.set(x,y+2.05*view.root.scale.y,z);
    if(a.clip!==clip){
      const next=view.actions[clip]||view.actions.idle;
      next.reset().play();view.clip?.crossFadeTo(next,.11,false);view.clip=next;a.clip=clip;
    }
    view.mixer.update(dt);
  }
  const look=new T.Vector3(),focus=new T.Vector3(),eye=new T.Vector3();
  let w=0,h=0,chapter=-1,cameraMode='',lastBall=null,startX=0,kickUntil=0,kicker=null;
  return function draw(s,chapterData,dt){
    const c=chapterData,live=s.phase==='play'||s.phase==='paused',bench=c.mode==='choice'||s.phase==='end';
    const intro=s.phase==='intro',after=s.phase==='after',win=c.team&&c.start+s.goals>c.away;
    const sizeChanged=canvas.clientWidth!==w||canvas.clientHeight!==h;
    if(sizeChanged){
      w=canvas.clientWidth;h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();
    }
    if(chapter!==s.index){
      chapter=s.index;
      const evening=c.team==='Thunder';
      sky.setPalette({horizon:evening?'#f5d3a7':'#cde8ec',zenith:evening?'#8baacb':'#719fc6',cloud:'#fff5e0',shade:'#c0cbd3',sunDirection:sun.position});
      defender.view.shirtMat?.color.set(c.color||'#e36d44');
      kickUntil=0;lastBall=null;
    }
    const px=fieldX(s.x),pz=fieldZ(s.y),b=s.ball;
    const receiver=s.receiver==='Sami'||bench?sami:liv;
    if(b!==lastBall){
      if(b){startX=fieldX(b.x);kickUntil=s.time+.31;kicker=b.volley?receiver:thomas}
      lastBall=b;
    }
    const striking=s.time<kickUntil;
    const footwork=after?(win?'cheer':c.team==='Metrostarts'?'cry':'nod_yes'):
      striking&&kicker===thomas?'kick':s.charge!==null?'charge':s.moving?'jog':'idle';
    const animDt=s.phase==='paused'?0:dt;
    place(thomas,true,bench?1.25:px,bench?10.20:pz,bench?.22:intro?-1.94:s.moving?null:-Math.PI/2,bench?'sit_idle':footwork,animDt,bench,bench?.43:0);
    for(const mate of [liv,sami]){
      const active=mate===receiver&&(bench||c.mode!=='duel');
      place(mate,active,bench?2.55:fieldX(s.mateX),bench?10.20:fieldZ(s.mateY),bench?-.3:Math.PI*.58,
        bench?'sit_idle':after&&win?'cheer':striking&&kicker===mate?'kick':'ready',animDt,bench,bench?.43:0);
    }
    place(dad,bench||c.mode==='gate'||c.mode==='pass',bench?3.7:2,bench?9.45:-8.3,bench?1.25:Math.PI,
      intro||bench?'talk':'idle',animDt,bench);
    place(defender,!bench&&(c.mode==='duel'||!!c.team),fieldX(s.defX),fieldZ(s.defY),Math.PI/2,live?'jog':'ready',animDt);
    place(keeper,!bench,fieldX(859),fieldZ(s.keeper),Math.PI/2,'ready',animDt);
    cones.visible=!bench&&c.mode==='gate';range.visible=live&&!!c.team&&s.x<670;duel.visible=live&&c.mode==='duel';
    pickup.visible=boltPad.visible=!bench&&!after&&!s.boostUsed;
    pickup.position.y=.78+.12*Math.sin(s.time*3);pickup.rotation.y=s.time*2;
    ring.visible=ball.visible=!bench;ring.position.set(px,.054,pz);
    ring.material.color.setHex(s.boost>0?0x62dfff:s.linked?0xffae15:gold);
    const kickX=b?Math.min(fieldX(b.x),goalX+.55):px+.37;
    let lift=.20;
    if(b?.kind==='shot'){
      const progress=T.MathUtils.clamp((kickX-startX)/Math.max(.1,goalX-startX),0,1);
      lift+=Math.sin(progress*Math.PI)*(b.hot?1.18:.77)+progress*.42;
    }else if(s.moving)lift+=.055*Math.abs(Math.sin(s.time*13));
    ball.position.set(kickX,lift,b?fieldZ(b.y):pz);
    if(b||s.moving)ball.rotation.z-=animDt*(b?17:7);
    flare.visible=!!b?.hot&&live;flare.position.copy(ball.position);flare.position.x-=.87;
    aim.visible=live&&!['pass','duel'].includes(c.mode);
    if(aim.visible){
      const dist=Math.max(.01,goalX-px-.48);
      aim.position.set(px+.48,0,pz);aim.scale.x=dist;aim.material.scale=dist;
      aim.material.color.setHex(s.y<211||s.y>296?0xfd8569:s.linked?gold:0xf5efcb);
    }
    const mode=bench?'bench':intro?'intro':'play';
    if(bench){
      focus.set(2.25,1.12,10.1);eye.set(1.8,2.1,5.7);
    }else if(intro){
      focus.set(px+1.15,1.10,pz);eye.set(px-3.7,2.18,pz+5.3);
    }else{
      const left=Math.min(px,goalX-6),center=(left+goalX)*.5;
      const distance=Math.max(10.8,(goalX-left+4)/(2*Math.tan(T.MathUtils.degToRad(21.5))*camera.aspect));
      focus.set(center,.62,pz*.38);eye.set(center-1.9,distance*.46+1.0,pz*.38+distance);
    }
    if(cameraMode!==mode||sizeChanged){camera.position.copy(eye);look.copy(focus);cameraMode=mode}
    else{const alpha=1-Math.exp(-dt*7);camera.position.lerp(eye,alpha);look.lerp(focus,alpha)}
    camera.lookAt(look);sky.update(camera,s.time);renderer.render(world,camera);
  }
}
