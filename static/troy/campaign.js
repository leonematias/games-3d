import {current,parts,sites,voices,waves,guardPosition} from './story.js';

const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const range=(s,p)=>Math.hypot(s.x-p[0],s.z-p[1]);
const aim=(s,p)=>Math.atan2(p[0]-s.x,s.z-p[1]);
export const initial=()=>({chapter:0,step:0,x:0,z:114,yaw:0,speed:0,elapsed:0,stepTime:0,work:0,log:[],
 hp:100,guard:false,swing:0,cooldown:0,foes:[],wave:'',fitted:[],carry:'',quiet:0,alarm:0,heard:false,bar:0,gate:false});
export function supplies(s){return Object.keys(parts).filter(k=>!s.fitted.includes(k));}
function nearestSupply(s){return supplies(s).sort((a,b)=>range(s,sites[a])-range(s,sites[b]))[0];}
export function goal(s,st=current(s)){
 if(st.id==='build')return s.carry?sites.yard:sites[nearestSupply(s)]||sites.yard;
 if(waves[st.id]&&s.wave===st.id){
   const foe=s.foes.filter(n=>n.hp>0).sort((a,b)=>range(s,[a.x,a.z])-range(s,[b.x,b.z]))[0];
   if(foe)return [foe.x,foe.z];
 }
 return sites[st.at];
}
export function prompt(s,st){
 if(st.id==='listen')return !s.heard?'Listen through the seam':'';
 if(st.id==='voices')return s.stepTime>=4?'Signal your companion':'';
 if(st.id==='hatch')return s.work>=2.4?'Climb down from the horse':'';
 if(st.id==='gate'&&s.bar<1)return '';
 if(range(s,goal(s,st))>2.9)return '';
 if(st.id==='build')return s.carry?'Fit the '+parts[s.carry].name:'Inspect the '+parts[nearestSupply(s)].name;
 return st.verb;
}
function resetPosition(s,[x,z],yaw=0){Object.assign(s,{x,z,yaw,speed:0});}
export function accept(s,st){
 s.foes=[];s.wave='';s.work=0;s.alarm=0;s.swing=0;s.guard=false;
 if(waves[st.id])s.hp=Math.min(100,s.hp+24);
 if(st.id==='death'){resetPosition(s,[-14,74]);s.hp=100;}
 if(st.id==='board'){resetPosition(s,[0,0]);s.quiet=0;}
 if(st.id==='hatch'){resetPosition(s,[sites.courtyard[0]+4.5,sites.courtyard[1]+1.8],Math.PI);}
 if(st.id==='gate'){s.gate=true;s.hp=100;}
}
function startFight(s,id){
 const [x,z]=sites[current(s).at],n=waves[id];
 s.wave=id;s.foes=Array.from({length:n},(_,i)=>{
   const angle=(i+.3)*2*Math.PI/n,r=id==='hector'?0:2.5+i%2;
   return {x:x+Math.sin(angle)*r,z:z+Math.cos(angle)*r,hp:id==='hector'?6:2,yaw:Math.PI,clock:i*.64,hit:false,phase:'idle',fall:0};
 });
}
function fight(s,id,dt,api){
 if(s.wave!==id){if(range(s,sites[current(s).at])>10)return;startFight(s,id);}
 // Keep warriors on distinct patches of ground when a company closes around the player.
 for(let i=0;i<s.foes.length;i++){
   const a=s.foes[i];if(a.hp<=0)continue;
   for(const b of s.foes.slice(i+1)){
     if(b.hp<=0)continue;
     const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);
     if(d>=.94||d<.001)continue;
     const push=(.94-d)*.46/d;a.x+=dx*push;a.z+=dz*push;b.x-=dx*push;b.z-=dz*push;
   }
 }
 const heroDuel=id==='hector';
 for(const n of s.foes){
   if(n.hp<=0){n.fall+=dt;continue;}
   const d=range(s,[n.x,n.z]);n.yaw=aim(n,[s.x,s.z]);
   if(d>2.0){
     const v=Math.min((heroDuel?2.35:1.75)*dt,d-1.65);
     n.x+=Math.sin(n.yaw)*v;n.z-=Math.cos(n.yaw)*v;n.phase='walk';continue;
   }
   const cycle=heroDuel?3.45:3.85,phase=(n.clock+=dt)%cycle;
   n.phase=phase<1.1?'block':phase<1.55?'attack':'idle';
   if(phase<1.1)n.hit=false;
   if(n.phase==='attack'&&!n.hit){
     n.hit=true;s.hp-=s.guard?0:heroDuel?23:5;api.sfx(s.guard?'shield':'impact');
     if(s.hp<=0){api.fail('Your company has fallen back. Regroup at the last completed objective.');return;}
   }
 }
 if(heroDuel&&s.foes[0].hp===0){
   if(s.foes[0].fall>=2.1)api.next('Hector falls outside Troy.');
   return;
 }
 if(s.swing>0||s.cooldown>0||s.guard||!api.held.has('space'))return;
 s.swing=.45;s.cooldown=.61;api.sfx('strike');
 const target=s.foes.filter(n=>n.hp>0&&range(s,[n.x,n.z])<3.45).sort((a,b)=>range(s,[a.x,a.z])-range(s,[b.x,b.z]))[0];
 if(!target)return;
 s.yaw=aim(s,[target.x,target.z]);
 if(heroDuel&&target.phase!=='idle'){api.sfx('shield');api.hint('His shield holds. Strike after the blow.',1.5);return;}
 target.hp--;api.sfx('impact');
 if(!heroDuel&&!s.foes.some(n=>n.hp>0))api.next('The company regroups.');
}
export function interact(s,st,api){
 const action=prompt(s,st);
 if(!action){api.hint(st.hint);return;}
 if(st.id==='build'){
   if(!s.carry){
     const k=nearestSupply(s),part=parts[k];
     // This field panel finishes a supply errand, while the chapter advances after all three deliveries.
     api.work(k,()=>{s.carry=k;api.bookmark();api.sfx('wood');api.hint('Bring the '+part.name+' to Epeius.');});
     return;
   }
   const name=parts[s.carry].name;s.fitted.push(s.carry);s.carry='';
   s.log.push('Fitted '+name);api.sfx('wood');
   if(s.fitted.length===3)api.next('Epeius sets the hatch in place.');else{api.bookmark();api.hint('Fitted '+name+'. Choose the next supply on the map.');}return;
 }
 if(st.id==='listen'){s.heard=true;s.work=0;api.sfx('knock');api.hint('A lantern stops beside the horse. Keep still until it passes.',5);return;}
 api.next();
}
export function update(s,dt,api){
 const st=current(s),id=st.id,k=api.held;
 s.cooldown=Math.max(0,s.cooldown-dt);s.swing=Math.max(0,s.swing-dt);s.guard=!!waves[id]&&k.has('shift');
 if(id==='death'){s.speed=0;if(s.stepTime>=6.5)api.next();return;}
 if(s.chapter===4){
   s.speed=0;
   const pulse=(seconds,offset=0)=>Math.floor((s.stepTime-offset)/seconds)>Math.floor((s.stepTime-dt-offset)/seconds);
   if(id==='ladder'){
     const near=s.stepTime%6>3.4&&s.stepTime%6<5;
     if(k.has('arrowdown')){
       if(near){s.alarm+=dt;api.hint('The lantern is close. Release ↓ and wait.',1);}
       else{s.work+=dt;s.alarm=Math.max(0,s.alarm-dt);}
     }else s.alarm=Math.max(0,s.alarm-dt);
     if(s.alarm>1.45){api.fail('A light falls on the ladder. Wait on the rung while the lantern passes.');return;}
     if(s.work>=5.4)api.next('The last foot touches the courtyard.');
     return;
   }
   if(id==='ride'){
     if(pulse(1.1))api.sfx('wheel');
     if(s.stepTime<4)return;
     if(k.has('space'))s.quiet=Math.min(3.2,s.quiet+dt);else s.quiet=Math.max(0,s.quiet-dt*.35);
     if(s.quiet>=3.2)api.next('The wheels stop. You are inside Troy.');
   }
   if(id==='voices'&&s.stepTime>=1&&s.stepTime-dt<1)api.say(...voices.outside,'outside');
   if(id==='listen'&&s.heard){
     if(pulse(1.25))api.sfx('footstep');
     if(['arrowup','arrowdown','arrowleft','arrowright','space'].some(key=>k.has(key))){s.work=0;api.hint('A board creaks. The watcher pauses.',1.5);}
     else s.work+=dt;
     if(s.work>6.5)api.next('The lantern moves on.');
   }
   if(id==='hatch'){
     if(s.stepTime<5&&pulse(1.3))api.sfx('footstep');
     if(s.stepTime>=5&&k.has('space')){
       s.work=Math.min(2.4,s.work+dt);
       if(pulse(.8))api.sfx('wood');
     }
   }
   return;
 }
 const turn=Number(k.has('arrowright'))-Number(k.has('arrowleft'));
 const move=Number(k.has('arrowup'))-Number(k.has('arrowdown'));
 s.yaw+=turn*dt*1.95;
 const creeping=s.chapter===5&&k.has('space');
 s.speed=move*(creeping?1.8:s.guard?1.6:s.carry?3.7:4.55);
 const x=s.x+Math.sin(s.yaw)*s.speed*dt,z=s.z-Math.cos(s.yaw)*s.speed*dt;
 if(s.chapter===0&&s.step===0&&z>95){s.x=clamp(x,-1.42,1.42);s.z=clamp(z,94,119);}
 else{
   s.x=clamp(x,-51,51);
   s.z=clamp(z,s.chapter<5?4:-53,s.chapter===5?-2:s.chapter===6?15:99);
   if(s.gate&&Math.abs(s.z)<2&&Math.abs(s.x)>3.3){s.z=s.z>0?2:-2;}
 }
 if(waves[id]){fight(s,id,dt,api);return;}
 if(s.chapter===5){
   const d=range(s,guardPosition(s.elapsed)),moving=Math.abs(s.speed)>.2;
   if(moving&&d<(creeping?2.3:9))s.alarm+=dt*(creeping?.45:1.25);else s.alarm=Math.max(0,s.alarm-dt*.72);
   if(s.alarm>2.3){api.fail('A lantern turns toward the sound. Return to the last shadow and cross quietly.');return;}
   if(id==='gate'&&range(s,sites.bar)<2.9&&k.has('space'))s.bar=clamp(s.bar+dt*.45,0,1);
 }
}
export function status(s){
 const id=current(s).id;
 if(id==='ride')return s.stepTime<4?'WHEELS TURNING':'SHIELD SLIPPING  ·  HOLD SPACE   '+Math.round(100*s.quiet/3.2)+'%';
 if(id==='ladder')return (s.stepTime%6>3.4&&s.stepTime%6<5?'LANTERN CLOSE  ·  WAIT':'HOLD ↓ TO DESCEND')+'   '+Math.min(100,Math.round(s.work/5.4*100))+'%';
 if(id==='listen')return s.heard?'WATCH AT THE SEAM  ·  STAY STILL   '+Math.min(100,Math.round(s.work/6.5*100))+'%':'FOOTSTEPS OUTSIDE';
 if(id==='voices')return s.stepTime<4?'A VOICE AT THE SEAM':'YOUR COMPANION STIRS';
 if(id==='hatch')return s.stepTime<5?'FOOTSTEPS NEARBY':'HATCH  ·  HOLD SPACE   '+Math.round(100*s.work/2.4)+'%';
 if(s.chapter===5)return 'ODYSSEUS  ·  '+(s.alarm>.4?'LANTERN TURNING':'IN SHADOW')+(id==='gate'?'  ·  BEAM '+Math.round(s.bar*100)+'%':'');
 if(s.chapter===3)return 'ODYSSEUS  ·  FITTED '+s.fitted.length+'/3'+(s.carry?'  ·  CARRYING '+parts[s.carry].name.toUpperCase():'');
 return (s.chapter<3?'ACHILLES':'ODYSSEUS')+'  ·  VIGOUR '+Math.max(0,Math.ceil(s.hp))+(s.wave?'  ·  '+(id==='hector'?'HECTOR '+s.foes[0].hp+'/6 · '+({block:'SHIELD UP',attack:'BLOW',idle:'OPEN',walk:'CLOSING'}[s.foes[0].phase]):s.foes.filter(n=>n.hp>0).length+' OPPONENTS'):'');
}
