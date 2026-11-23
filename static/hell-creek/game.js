import {launch,distance} from '../field-narratives/runner.js';
import {wrap,clamp} from '../field-narratives/landscape.js';
import {chapters,sites,tracks,channel,logPosition,stepInterval} from './story.js';
import {animals,hit,roar,hurt,updateAnimals,nearbyMeal} from './wildlife.js';
import {floodplain,trunks} from './world.js';
import {createSounds} from '../dinosaurs/sounds.js';
const initial=()=>({chapter:0,step:0,x:-320,z:610,yaw:1.08,speed:0,elapsed:0,stepTime:0,work:0,log:[],animals:animals(),action:'idle',actionTime:0,immunity:0,stamina:100,condition:100,low:false,cruise:false,meters:0,route:'',rivalChoice:'',footfall:0});
function goal(s,st){
 if(st.animal){const n=s.animals[st.animal];return [n.x,n.z];}
 if(st.type==='crossing')return sites[s.route==='island'?'island':'shelf'];
 return sites[st.at];
}
function prompt(s,st){
 const d=distance(s,goal(s,st));if(d>(st.type==='rival'?18:8))return nearbyMeal(s)?'Feed at this carcass':'';
 if(['hunt','duel','horn'].includes(st.type))return '';
 return st.verb;
}
let choice='';
function signs(ui,id,done){
 const clue=tracks[id];const marks=id==='tracks'||id==='browse'||id==='scrape';
 ui.instrument(marks?'Tracks in the clearing':'Read the ground',clue[0],(ctx,w,h)=>{
  const fill=ctx.createLinearGradient(0,0,w,h);fill.addColorStop(0,'#483b29');fill.addColorStop(1,'#232b20');ctx.fillStyle=fill;ctx.fillRect(0,0,w,h);
  for(let i=0;i<480;i++){const x=(i*83.71)%w,y=(i*71.49)%h;ctx.fillStyle=i%3?'#b3986332':'#8e9e6738';ctx.fillRect(x,y,2+i%5,1);}
  ctx.strokeStyle='#c3ab72';ctx.fillStyle='#1c2219';ctx.lineWidth=2;
  for(let i=0;i<8;i++){
   const x=30+i*60,y=100+Math.sin(i*1.7)*35;ctx.save();ctx.translate(x,y);ctx.rotate(-.9);
   if(id==='tracks'){ctx.beginPath();ctx.ellipse(0,0,9,13,0,0,7);ctx.fill();for(let n=-1;n<=1;n++){ctx.beginPath();ctx.ellipse(n*7,-12,3,6,n*.22,0,7);ctx.stroke();}}
   else if(id==='scrape'||id==='browse'){ctx.beginPath();ctx.moveTo(-15,-19);ctx.quadraticCurveTo(0,0,8,22);ctx.moveTo(-7,-19);ctx.quadraticCurveTo(7,0,15,20);ctx.stroke();}
   else{ctx.beginPath();ctx.moveTo(-30,17);ctx.quadraticCurveTo(-3,-24,26,-16);ctx.stroke();ctx.beginPath();ctx.moveTo(14,-22);ctx.lineTo(26,-16);ctx.lineTo(16,-7);ctx.stroke();}
   ctx.restore();
  }
 },[clue[1],clue[2]],i=>{if(i===clue[3])done('You pick up the trail.');else ui.hint('Look again. '+clue[0]);});
}
function work(id,ui,done){
 if(id==='route'){ui.select('Two ways across','The wooded shelf rises west of the channel. The island is closer, but timber is washing over its approach.',['Take the wooded shelf','Cross by the island'],i=>{choice=i?'island':'shelf';done(i?'Follow the gravel spine.':'Keep to the wooded shelf.');});}
 else signs(ui,id,done);
}
function interact(s,st,api){
 const action=prompt(s,st);
 if(action==='Feed at this carcass'){nearbyMeal(s).fed=true;s.condition=clamp(s.condition+25,0,100);s.stamina=100;s.action='eat';s.actionTime=2.6;api.sfx('chomp');api.hint('Fed. Your trail continues.');return;}
 if(!action){api.hint(st.hint);return;}
 if(st.type==='track'){api.work(st.at);return;}if(st.type==='route'){api.work('route');return;}
 if(st.type==='feed'||st.type==='drink'){s.action=st.type==='feed'?'eat':'drink';s.actionTime=2.6;s.condition=clamp(s.condition+32,0,100);s.stamina=100;api.sfx(st.type==='feed'?'chomp':'drink');}
 if(st.type==='rival')s.rivalChoice='yielded';
 api.next(st.entry);
}
function update(s,dt,api){
 const st=api.step(),k=api.held;
 const lastBeat=Math.floor((s.elapsed-dt)/32),beat=Math.floor(s.elapsed/32);
 if(beat>lastBeat){if(s.chapter<4)api.sfx(beat%3?'canopy':'farCall');else api.sfx(beat%2?'wind':'tremor');}
 s.immunity=Math.max(0,s.immunity-dt);s.actionTime=Math.max(0,s.actionTime-dt);
 const turning=Number(k.has('arrowright'))-Number(k.has('arrowleft'));
 const moving=Number(k.has('arrowup')||s.cruise)-Number(k.has('arrowdown'));
 const sprint=k.has('shift')&&moving>0&&!s.low&&s.stamina>5;
 const deep=Math.abs(s.x-channel(s.z))<13;
 const vmax=s.low?3:sprint?15:moving<0?4.5:8.4;
 s.yaw=wrap(s.yaw+turning*dt*(sprint?1.45:1.95));
 s.speed+=(vmax*(deep?.67:1)*moving-s.speed)*(1-Math.exp(-dt*5));
 s.stamina=clamp(s.stamina+dt*(sprint?-4.4:2.9),0,100);
 s.x=clamp(s.x+Math.sin(s.yaw)*s.speed*dt,-850,820);s.z=clamp(s.z-Math.cos(s.yaw)*s.speed*dt,-775,825);s.meters+=Math.abs(s.speed)*dt;
 if(trunks.deflect(s,.65)&&Math.abs(s.speed)>1.2){s.speed*=.8;if(s.elapsed>(s.bumpAt||0)+4){s.bumpAt=s.elapsed;api.hint('Heavy trunk. Turn to follow the edge of the grove.',2);}}
 if(Math.abs(s.speed)>1){s.footfall-=dt;if(s.footfall<=0){api.sfx(deep?'splash':'step');s.footfall=stepInterval(s.speed);}}
 if(k.has('space'))hit(s,st,api);
 if(st.type==='crossing'&&s.route==='island'){
  const [tx,tz]=logPosition(s.elapsed);if(Math.hypot(s.x-tx,s.z-tz)<5.5)hurt(s,15,api,'A drifting trunk knocks you sideways. Cross behind it.');
 }
 updateAnimals(s,api.step(),dt,api);
}

function audio(){
 const a=createSounds();a.unlock();const context=new AudioContext();context.resume();
 return id=>{
  if(id==='step'){a.rexSteps(1,.28);return;}
  if(!['canopy','farCall','wind','tremor'].includes(id)){a[id]?.();return;}
  const now=context.currentTime,low=id==='tremor'||id==='farCall',length=low?1.4:2.1;
  const data=context.createBuffer(1,Math.ceil(context.sampleRate*length),context.sampleRate),samples=data.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
  const src=context.createBufferSource(),f=context.createBiquadFilter(),vol=context.createGain();src.buffer=data;
  f.type=low?'lowpass':'bandpass';f.frequency.setValueAtTime(low?165:id==='wind'?610:3600,now);
  f.frequency.exponentialRampToValueAtTime(low?55:id==='wind'?270:2400,now+length);f.Q.value=low?.7:1.2;
  vol.gain.setValueAtTime(.0001,now);vol.gain.exponentialRampToValueAtTime(low?.16:.028,now+length*.3);vol.gain.exponentialRampToValueAtTime(.0001,now+length);
  src.connect(f).connect(vol).connect(context.destination);src.start(now);
 };
}
launch({id:'hell-creek',title:'Hell Creek',display:'Hell Creek<em>The Last Day</em>',place:'Western North America · Late Cretaceous',
 start:'Enter the floodplain',intro:'You are an adult Tyrannosaurus. The river has dropped overnight. Across the water a herd is already moving.',
 controls:'↑/↓ move · ←/→ turn · Shift sprint · C stalk · Space bite · R roar · E investigate or feed · Q walk continuously · M map · Seven parts · Two escape routes',
 endLabel:'High bank · First night',endTitle:'Still breathing',
 ending:s=>'You crossed '+(s.meters/1000).toFixed(1)+' km and found shelter by the '+(s.route==='island'?'gravel island':'wooded shelf')+' route. This animal’s day is imagined. In the aftermath of Chicxulub, darkness disrupted food webs. No non-avian dinosaur lineage survived the extinction.',
 initial,world:floodplain,chapters,goal,prompt,interact,update,work,sound:audio,track:s=>'hell-creek/'+(s.chapter<4?'oxbow':'afterlight'),
 alt:'Roar',act:'Bite',low:'Stalk',mapColors:['#28372d'],mapSpan:1750,center:[0,0],
 accept(s,st,api){if(st.type==='route')s.route=choice;if(st.at==='rest'){api.sfx('impact');s.condition=Math.max(70,s.condition);}},
 recover(s){s.condition=100;s.stamina=100;s.immunity=4;},
 key(k,s,api){const st=api.step();if(k==='c')s.low=!s.low;if(k==='r')roar(s,st,api);if(k==='space')hit(s,st,api);if(k==='q')s.cruise=!s.cruise;if(k==='arrowdown')s.cruise=false;},
 status:s=>(s.low?'STALKING':s.speed>4?'RUNNING':'TYRANNOSAURUS')+'   '+(s.meters/1000).toFixed(1)+' km\nBODY '+Math.round(s.condition)+'   STAMINA '+Math.round(s.stamina),
 map(ctx,px,pz,scale,s){ctx.beginPath();for(let z=-1050;z<=1050;z+=10){const x=channel(z);if(z===-1050)ctx.moveTo(px(x),pz(z));else ctx.lineTo(px(x),pz(z));}ctx.lineWidth=Math.max(2,scale*(s.chapter>=4?44:28));ctx.strokeStyle=s.chapter>=4?'#8c8364':'#708f89';ctx.stroke();}
});
