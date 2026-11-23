import * as T from 'three';
import {loadTemplate,instantiate} from '../medieval/rig.js';
import {loadArmory,romanRig,equipRoman} from '../eagle-ford/roman-rig.js';
import {createPresetRanks} from '../eagle-ford/preset-ranks.js';
import {height} from './land.js';
import {sectionX,wallZ} from './story.js';

export async function loadCast(){
  return Promise.all([
    loadTemplate('legionary'),loadTemplate('ford-roman-veteran'),loadTemplate('ford-roman-recruit'),
    loadTemplate('ford-gaul-scout'),loadTemplate('ford-gaul-axeman'),loadTemplate('healer-seren'),loadArmory()
  ]);
}
const matrix=new T.Object3D();
const shadowGeo=new T.PlaneGeometry(.95,.69);shadowGeo.rotateX(-Math.PI/2);
function shadowTexture(){
  const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(19,22,15,.58)');g.addColorStop(1,'rgba(19,22,15,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new T.CanvasTexture(c);
}
export function buildCast(scene,[heroTemplate,veteran,recruit,scout,axeman,healer,armory]){
  const death=heroTemplate.clips.find(c=>c.name==='death');
  for(const t of [veteran,recruit])if(!t.clips.some(c=>c.name==='death'))t.clips.push(death);
  const hero=romanRig(heroTemplate),doctor=instantiate(healer);scene.add(hero.model,doctor.model);
  doctor.model.position.set(4.65,height(4.65,36.5),36.5);doctor.model.rotation.y=-.55;doctor.play('idle');
  const romans=createPresetRanks(scene,[veteran,recruit],true),gauls=createPresetRanks(scene,[scout,axeman]);
  const shadows=new T.InstancedMesh(shadowGeo,new T.MeshBasicMaterial({map:shadowTexture(),transparent:true,depthWrite:false}),180);
  shadows.frustumCulled=false;scene.add(shadows);
  function pickup(id,x,z,tilt){
    const obj=armory.get(id).model.clone(true),group=new T.Group();
    group.add(obj);const bounds=new T.Box3().setFromObject(obj),center=bounds.getCenter(new T.Vector3());
    obj.position.sub(center);group.rotation.set(.25,tilt,.92);
    const ext=new T.Box3().setFromObject(group);
    group.position.set(x,height(x,z)-ext.min.y+.09,z);scene.add(group);return group;
  }
  const drops=[pickup('gladius',0,109,.55),pickup('spear',-3.15,47,.2),pickup('sword',-2.65,47.4,-.5)];
  const army=Array.from({length:64},(_,i)=>{
    const side=i%2?1:-1,row=Math.floor(i/16),col=Math.floor(i%16/2);
    return {x:side*(8.5+col*1.42),z:-.5+row*1.48+Math.sin(col)*.5,side,row,i};
  });
  const defenders=Array.from({length:40},(_,i)=>{
    const side=i%2?1:-1,col=Math.floor(i%16/2),row=Math.floor(i/16);
    return {x:side*(8.5+col*1.42),z:-2.8-row*1.32,side,row,i};
  });
  let shadowCount=0,marchers=null,remaining=0;
  function shadow(x,y,z){
    matrix.position.set(x,y+.042,z);matrix.rotation.set(0,0,0);matrix.scale.setScalar(1);matrix.updateMatrix();
    shadows.setMatrixAt(shadowCount++,matrix.matrix);
  }
  function soldier(rank,x,z,yaw,clip,variant,step,t,fallen=0){
    const y=height(x,z);shadow(x,y,z);
    matrix.position.set(x,y,z);matrix.rotation.set(rank===gauls&&clip==='death'?-Math.min(1,fallen*3)*1.5:0,yaw,0,'YXZ');matrix.updateMatrix();
    rank.draw({step:Math.max(0,step),swing:.48*(1-(step%1)),fallen},variant,matrix.matrix,clip,t);
  }
  function ambient(a,roman,t){
    const phase=t*1.6+(a.i>>1)*1.23,front=a.row===0;
    return {x:a.x+.3*Math.sin(phase*.7),z:a.z+(front?(roman?-.55:.55):0)+(front?.24:.18)*Math.sin(phase)*(roman?1:-1),
      yaw:(roman?Math.PI:0)+.16*Math.cos(phase),clip:front||Math.cos(phase)>.65?'attack':'walk',step:(t*2+a.i)};
  }
  function assemble(b){
    const gap=sectionX[b.breachLane];
    const starts=[b.hero,...b.allies,...army.map(a=>ambient(a,true,b.time-b.filmTime))];
    marchers=starts.map((a,i)=>{
      const lane=i%3-1,rank=Math.floor(i/3);
      const pts=[[a.x,a.z],[gap+lane*1.05,wallZ+2.6],[gap+lane*.97,wallZ-2.3],
        [gap+((i%9)-4)*1.5,wallZ-13+Math.floor(i/9)*.96]];
      const legs=pts.slice(1).map((p,j)=>Math.hypot(p[0]-pts[j][0],p[1]-pts[j][1]));
      return {pts,legs,delay:1+rank*.21,length:legs.reduce((s,v)=>s+v,0)};
    });
  }
  function marchPosition(i,time){
    const {pts,legs,delay,length}=marchers[i];let d=Math.min(length,Math.max(0,(time-delay)*4.1));
    const moving=time>delay&&d<length-.001;
    for(let j=0;j<legs.length;j++){
      const a=pts[j],p=pts[j+1];
      if(d<=legs[j]||j===legs.length-1){const k=d/(legs[j]||1);
        return {x:a[0]+(p[0]-a[0])*k,z:a[1]+(p[1]-a[1])*k,yaw:moving?Math.atan2(p[0]-a[0],p[1]-a[1]):Math.PI,moving,arrived:d>=legs[j]-.001&&j===2};}
      d-=legs[j];
    }
  }
  function update(b,dt,land,title){
    romans.reset();gauls.reset();shadowCount=0;
    const id=b.moment.id,film=id==='march'||id==='won';
    if(film&&!marchers)assemble(b);
    const marchTime=id==='won'?40:b.filmTime;
    const h=film?marchPosition(0,marchTime):b.hero;
    if(b.weapon)equipRoman(hero,b.weapon);
    hero.handHolder.visible=!!b.weapon&&!b.carried;hero.shieldHolder.visible=true;
    hero.model.position.set(h.x,height(h.x,h.z),h.z);hero.model.rotation.y=title?.48:h.yaw;
    const clip=b.lost?'death':b.hero.swing&&!film?'attack':b.guard&&!film?'block':h.moving?'run':'idle';
    const action=hero.play(clip,{once:clip==='death',speed:clip==='attack'?0:1,fade:.11});
    if(clip==='attack'&&action)action.time=action.getClip().duration*(1-b.hero.swing/.48);
    hero.update(dt);hero.settle();shadow(h.x,height(h.x,h.z),h.z);
    drops[0].visible=!b.weapon;drops[1].visible=drops[2].visible=!b.upgraded;
    doctor.model.visible=Math.abs(b.hero.z-36)<23&&!film;if(doctor.model.visible)doctor.update(dt);
    for(const [i,a] of b.allies.entries()){
      const p=film?marchPosition(i+1,marchTime):a;
      soldier(romans,p.x,p.z,p.yaw,!a.hp?'death':!film&&a.swing?'attack':p.moving?'walk':'idle',i%2,
        film?b.time*8+i:a.swing?1-a.swing/.48:a.step,b.time+i,a.fallen);
    }
    // Place each pair at its rendezvous before they join the live squad.
    for(const [j,z,x,limit] of [[0,83,-3,3],[2,58,3,6]]){
      if(b.index>limit||Math.abs(h.z-z)>24)continue;
      for(let i=0;i<2;i++)soldier(romans,x+(i?1:-1),z,i?.6:-.6,'idle',(i+j)%2,i,b.time+i);
    }
    for(const [i,e] of b.enemies.entries()){
      if(e.fallen>2.8||film)continue;
      soldier(gauls,e.x,e.z,e.yaw,!e.hp?'death':e.swing?'attack':e.moving?'walk':'idle',e.variant,
        e.swing?1-e.swing/.48:e.step,b.time+i,e.fallen);
    }
    const visible=b.index>=12;
    remaining=film?[0,1,2,3,4].filter(i=>!marchPosition(i,marchTime).arrived).length:0;
    if(visible){
      for(const a of army){
        const p=film?marchPosition(a.i+5,marchTime):ambient(a,true,b.time);
        if(film&&!p.arrived)remaining++;
        soldier(romans,p.x,p.z,p.yaw,film?(p.moving?'walk':'idle'):p.clip,a.i%2,film?b.time*9+a.i:p.step,b.time+a.i);
        if(a.i===0){land.eagle.position.set(p.x+.38,height(p.x,p.z)+.2,p.z);land.eagle.rotation.z=Math.sin(b.time*5)*.04;}
      }
      for(const a of defenders){
        const p=ambient(a,false,b.time);
        const retreat=film?Math.max(0,marchTime-.35):0;if(retreat>4)continue;
        soldier(gauls,p.x+retreat*4*a.side,p.z-retreat*.9,retreat?a.side*1.8:p.yaw,retreat?'walk':p.clip,a.i%2,p.step,b.time+a.i);
      }
    }
    land.eagle.visible=visible;
    romans.flush();gauls.flush();shadows.count=shadowCount;shadows.instanceMatrix.needsUpdate=true;
  }
  return {update,get remaining(){return remaining;},};
}
