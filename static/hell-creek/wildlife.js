import {clamp,wrap} from '../field-narratives/landscape.js';
import {sites} from './story.js';

const templates=[
 ['calf','triceratops',1.75,'calf'],['guard','triceratops',3.45,'horns'],
 ['armour','ankylosaurus',2.3,'ankylosaur'],['rival','tyrannosaurus',4.9,'rival'],
 ['herd1','triceratops',3.05,'calf',32,-18],['herd2','triceratops',2.7,'horns',-18,29],
 ['herd3','ankylosaurus',2.7,'browse',-19,21],['herd4','triceratops',2.2,'drink',33,-24],['herd5','triceratops',2.4,'rest',20,28],['herd6','ankylosaurus',2,'scrape',-18,12]
];
export const species=templates.map(([id,kind,height])=>({id,kind,height}));
export function animals(){
 return Object.fromEntries(templates.map(([id,kind,h,site,dx=0,dz=0],i)=>{
  const x=sites[site][0]+dx,z=sites[site][1]+dz;
  return [id,{x,z,hx:x,hz:z,yaw:i*1.9,phase:i*1.7,mode:'eat',life:id==='armour'?3:2,clock:0,attack:0}];
 }));
}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const aim=(a,b)=>Math.atan2(b.x-a.x,a.z-b.z);
function travel(n,yaw,speed,dt){n.yaw=wrap(n.yaw+clamp(wrap(yaw-n.yaw),-2.2*dt,2.2*dt));n.x+=Math.sin(n.yaw)*speed*dt;n.z-=Math.cos(n.yaw)*speed*dt;}
export function hurt(s,amount,api,text){
 if(s.immunity>0)return;
 s.condition=Math.max(0,s.condition-amount);s.immunity=2.5;api.sfx('impact');api.hint(text);
 if(s.condition<=0)api.fail('You lost your footing. Return to the last completed encounter and try another approach.');
}
export function nearbyMeal(s){
 return Object.entries(s.animals).find(([id,n])=>id.startsWith('herd')&&n.life<=0&&!n.fed&&dist(s,n)<10)?.[1];
}
export function hit(s,st,api){
 if(s.actionTime>.06)return;
 s.action='bite';s.actionTime=.68;api.sfx('bite');
 const facing=n=>n&&n.life>0&&dist(s,n)<10&&Math.abs(wrap(aim(s,n)-s.yaw))<1.25;
 const quarry=s.animals[st.animal];
 const required=['hunt','duel'].includes(st.type)&&facing(quarry);
 const n=required?quarry:Object.entries(s.animals).find(([id,n])=>id.startsWith('herd')&&facing(n))?.[1];
 if(!n){
  if(quarry&&['hunt','duel'].includes(st.type)&&dist(s,quarry)<22)
   api.hint(dist(s,quarry)>=10?'Your jaws close on air. Move within ten metres.':'Turn your snout toward the animal.');
  return;
 }
 if(required&&st.type==='duel'&&n.mode!=='look_around'){api.hint('Its club is up. Back off until the swing passes.');return;}
 n.life--;api.sfx('chomp');
 if(n.life<=0){n.mode='death';if(required)api.next('The animal is down. Approach the body to feed.');else api.hint('The grazer is down. Press E here to feed.');}
 else {api.hint(!required?'The grazer breaks away.':st.type==='duel'?'The grazer shifts its weight. Watch the tail.':'The young animal stumbles. Follow and bite again.');}
}
export function roar(s,st,api){
 if(s.actionTime>0)return;s.action='roar';s.actionTime=1.5;api.sfx('roar');
 const n=s.animals[st.animal];if(!n||dist(s,n)>24)return;
 if(st.type==='rival'){s.rivalChoice='stood ground';n.mode='retreat';api.next('The rival backs away from the carcass.');}
 if(st.type==='horn'&&!n.attack){n.attack=3.4;n.yaw=aim(n,s);n.mode='threat';api.hint('The horns drop. Turn away and run clear of its line.');}
}
export function updateAnimals(s,st,dt,api){
 for(const [id,n] of Object.entries(s.animals)){
  if(n.life<=0)continue;
  const d=dist(s,n);n.clock+=dt;
  if(s.chapter>=4){
   if(id==='rival'||id.startsWith('herd')){
    // Reuse the familiar herd in moving waves along the escape corridor.
    const escape=st.type==='escape',p=sites[escape?'pass':'bank'];
    if(n.hz!==p[1]){n.hx=p[0];n.hz=p[1];n.clock=n.phase;}
    const f=(n.clock*(escape?6.4:3.7)+n.phase*15)%176-88;
    n.x=p[0]+f;n.z=p[1]+Math.sin(n.phase)*25+f*.16;n.yaw=1.73;n.mode='run';
    if(escape&&dist(s,n)<4.5)hurt(s,16,api,'A shoulder clips you. Wait for a gap between the animals.');
   }else {n.mode='look_around';}continue;
  }
  if(id===st.animal&&st.type==='hunt'&&d<(s.low?12:30)){
   const home=dist(n,{x:n.hx,z:n.hz});
   const direction=home>75?aim(n,{x:n.hx,z:n.hz}):aim(s,n);
   if(n.mode!=='run')api.hint(n.life===1?'The calf limps. Close the gap.':'The calf bolts. Hold Shift to run it down.');
   n.mode='run';travel(n,direction,n.life===1?2.8:4.6,dt);continue;
  }
  if(id===st.animal&&st.type==='duel'&&d<16){
   if(!n.defending){n.defending=true;n.clock=0;}
   const f=n.clock%5.2,mode=f<1.6?'threat':f<2.4?'tail_swing':'look_around';
   if(mode!==n.mode){
    if(mode==='threat')api.hint('The club lifts. Back away beyond its reach.',1.6);
    if(mode==='look_around')api.hint('The club settles in the mud. Move in and bite.',2.8);
   }
   n.mode=mode;
   if(f>=1.6&&f<2&&d<8.2)hurt(s,21,api,'The club catches your flank. Back away at the next warning.');continue;
  }
  if(id==='armour')n.defending=false;
  if(id===st.animal&&st.type==='horn'){
   if(n.attack>0){
    n.attack-=dt;n.mode=n.attack>2.5?'threat':'charge';if(n.attack<=2.5){travel(n,n.yaw,7.4,dt);if(d<6)hurt(s,25,api,'The horns graze you. Circle away from its line of travel.');}
    if(n.attack<=0)api.next('The adult runs past. The way to water opens.');continue;
   }
   if(d<24&&!n.braced){
    n.braced=true;n.yaw=aim(n,s);api.hint('The adult plants its feet. Circle behind the horns, or roar to draw it out.');
   }
   if(d>32)n.braced=false;
   if(d<11&&Math.abs(wrap(aim(n,s)-n.yaw))>1.5){api.next('You slip behind the adult while it faces the open ground.');continue;}
   if(n.braced){n.mode='threat';continue;}
  }
  if(id==='rival'&&s.rivalChoice==='stood ground'&&d<35){n.mode='walk';travel(n,aim(s,n),2.4,dt);continue;}
  if(id===st.animal&&st.type==='rival'&&d<30){n.mode='roar';n.yaw=aim(n,s);continue;}
  if(id.startsWith('herd')&&d<(s.low?9:18)&&dist(n,{x:n.hx,z:n.hz})<75){
   n.mode='run';travel(n,aim(s,n),3.5,dt);continue;
  }
  const a=s.elapsed*.043+n.phase;
  const target={x:n.hx+Math.sin(a)*7,z:n.hz+Math.cos(a*.8+n.phase)*5};
  if(dist(n,target)>3.7){n.mode='walk';travel(n,aim(n,target),.75,dt);}else n.mode=Math.sin(a*2)>0?'eat':'idle';
 }
}
