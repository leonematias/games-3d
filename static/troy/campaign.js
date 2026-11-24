import {current,parts,sites,voices,waves,guardPosition,arrowTiming} from './story.js';

const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const range=(s,p)=>Math.hypot(s.x-p[0],s.z-p[1]);
const aim=(s,p)=>Math.atan2(p[0]-s.x,s.z-p[1]);
const crossed=(now,dt,at)=>now>=at&&now-dt<at;
// Earliest reply after the recorded line, including the one-second lead into the outside voice.
const replyReady={land:5.9,patroclus:7.9,plan:8.6,voices:5.3};
const bearingPan=(s,n)=>clamp(((n.x-s.x)*Math.cos(s.yaw)+(n.z-s.z)*Math.sin(s.yaw))/3,-.85,.85);
export const initial=()=>({chapter:0,step:0,x:0,z:114,yaw:0,speed:0,elapsed:0,stepTime:0,work:0,log:[],
 hp:100,guard:false,swing:0,cooldown:0,foes:[],wave:'',fitted:[],carry:'',quiet:0,alarm:0,heard:false,bar:0,gate:false});
export function supplies(s){return Object.keys(parts).filter(k=>!s.fitted.includes(k));}
function nearestSupply(s){return supplies(s).sort((a,b)=>range(s,sites[a])-range(s,sites[b]))[0];}
export function goal(s,st=current(s)){
 if(st.id==='build')return s.carry?sites.yard:sites[nearestSupply(s)]||sites.yard;
 if(waves[st.id]&&s.wave===st.id){
   const foe=s.foes.filter(n=>n.hp>0).slice(0,2).sort((a,b)=>range(s,[a.x,a.z])-range(s,[b.x,b.z]))[0];
   if(foe)return [foe.x,foe.z];
 }
 return sites[st.at];
}
export function prompt(s,st){
 if(st.id==='listen')return !s.heard?'Listen through the seam':'';
 if(s.stepTime<(replyReady[st.id]??0))return '';
 if(st.id==='voices')return st.verb;
 if(st.id==='hatch')return s.work>=2.4?'Climb down from the horse':'';
 if(st.id==='gate'&&s.bar<1)return '';
 if(range(s,goal(s,st))>2.9)return '';
 if(st.id==='build')return s.carry?'Fit the '+parts[s.carry].name:'Inspect the '+parts[nearestSupply(s)].name;
 return st.verb;
}
function resetPosition(s,[x,z],yaw=0){Object.assign(s,{x,z,yaw,speed:0});}
export function accept(s,st){
 s.foes=[];s.wave='';s.company=0;s.work=0;s.alarm=0;s.swing=0;s.guard=false;
 if(waves[st.id])s.hp=Math.min(100,s.hp+24);
 if(st.id==='death'){resetPosition(s,[-14,74]);s.hp=100;}
 if(st.id==='board'){resetPosition(s,[0,0]);s.quiet=0;}
 if(st.id==='hatch'){resetPosition(s,[sites.courtyard[0]+4.5,sites.courtyard[1]+1.8],Math.PI);}
 if(st.id==='gate'){s.gate=true;s.hp=100;}
}
function startFight(s,id,company=0){
 const [x,z]=sites[current(s).at],n=waves[id].companies[company];
 s.wave=id;s.company=company;
 s.foes=Array.from({length:n},(_,i)=>{
   const duel=id==='hector',veteran=!duel&&i===n-1&&id!=='surf';
   const hp=waves[id].strength+(veteran?1:0);
   const flank=id==='challenge'&&company?(company%2?1:-1)*9:0;
   const offset=(i-(n-1)/2)*(id==='host'?.91:1.65);
   const depth=id==='host'?8:company?4:1.5;
   return {x:duel?x:x+flank+offset,z:duel?z:z-depth-(i%2)*1.6,hp,maxHp:hp,veteran,
     yaw:Math.PI,clock:0,hit:false,phase:'idle',fall:0};
 });
}
function finishCompany(s,id,api){
 const next=(s.company??0)+1;
 if(next>=waves[id].companies.length){api.next('The company regroups.');return;}
 startFight(s,id,next);
 s.hp=Math.min(100,s.hp+8);
 const flank=id==='challenge'?(next%2?'east':'west'):null;
 const arrival=flank?'Shields from the '+flank+' flank':'Fresh shields at the standard';
 api.sfx('advance');api.hint(arrival+' · Company '+(next+1)+' of '+waves[id].companies.length+'.');
 api.bookmark();
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
 // Two warriors take the front. The reserve closes as gaps open.
 const living=s.foes.filter(n=>n.hp>0);
 const front=living.slice(0,2);
 for(const [i,n] of s.foes.entries()){
   if(n.hp<=0){n.fall+=dt;continue;}
   const d=range(s,[n.x,n.z]);n.yaw=aim(n,[s.x,s.z]);
   if(!front.includes(n)){
     const flank=(i%2?1:-1)*(.8+Math.floor(i/2)*.28);
     const a=Math.atan2(s.x-n.x,s.z-n.z)+Math.PI+flank*.22;
     const radius=4.2+Math.floor(i/2)*.62;
     if(Math.abs(d-radius)>.35){
       const factor=Math.min(dt*.8,1);
       n.x+=(s.x+Math.sin(a)*radius-n.x)*factor;n.z+=(s.z+Math.cos(a)*radius-n.z)*factor;
     }
     n.phase='reserve';continue;
   }
   if(d>2.0){
     const v=Math.min((heroDuel?2.35:1.75)*dt,d-1.65);
     n.x+=Math.sin(n.yaw)*v;n.z-=Math.cos(n.yaw)*v;n.phase='walk';continue;
   }
   const cycle=heroDuel?3.05:3.6,phase=(n.clock+=dt)%cycle;
   n.phase=phase<1.1?'block':phase<1.55?'attack':'idle';
   if(phase<1.1)n.hit=false;
   if(n.phase==='attack'&&!n.hit){
     const pan=bearingPan(s,n);
     n.hit=true;
     if(s.guard)n.counterUntil=s.elapsed+.95;
     s.hp-=s.guard?0:heroDuel?25:n.veteran?10:7;
     api.sfx('enemySwing',{pan});api.sfx(s.guard?'shield':'wounded',{pan});
     if(s.hp<=0){api.fail('Your company has fallen back. Regroup at the last completed objective.');return;}
   }
 }
 if(heroDuel&&s.foes[0].hp===0){
   if(s.foes[0].fall>=2.1)api.next('Hector falls outside Troy.');
   return;
 }
 if(s.swing>0||s.cooldown>0||s.guard||!api.held.has('space'))return;
 s.swing=.45;s.cooldown=.61;api.sfx('strike');
 const nearby=front.filter(n=>range(s,[n.x,n.z])<3.45)
   .sort((a,b)=>range(s,[a.x,a.z])-range(s,[b.x,b.z]));
 const target=nearby.find(n=>{
   const dx=n.x-s.x,dz=n.z-s.z,distance=Math.hypot(dx,dz);
   // A 60-degree half-angle gives the sword a broad sweep without turning the camera.
   const forward=dx*Math.sin(s.yaw)-dz*Math.cos(s.yaw);
   return distance<.05||forward>=distance*.5;
 });
 if(!target){
   if(nearby.length)api.hint('Turn toward the nearest shield to strike.',1);
   return;
 }
 if(heroDuel&&target.phase!=='idle'){api.sfx('parry');api.hint('His shield holds. Strike after the blow.',1.5);return;}
 const counter=s.elapsed<(target.counterUntil??0);
 target.hp=Math.max(0,target.hp-(counter?2:1));target.counterUntil=0;api.sfx('impact');
 if(counter)api.hint('Counter landed · double damage',1.2);
 if(target.hp===0)api.sfx('fall');
 if(!heroDuel&&!s.foes.some(n=>n.hp>0))finishCompany(s,id,api);
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
 if(st.id==='gate')api.sfx('gateOpen');
 if(st.id==='dawn')api.sfx('muster');
 api.next();
}
export function update(s,dt,api){
 const st=current(s),id=st.id,k=api.held;
 s.cooldown=Math.max(0,s.cooldown-dt);s.swing=Math.max(0,s.swing-dt);s.guard=!!waves[id]&&k.has('shift');
 if(id==='death'){
   s.speed=0;
   if(crossed(s.stepTime,dt,arrowTiming.release))api.sfx('bowRelease');
   if(crossed(s.stepTime,dt,arrowTiming.impact-.52))api.sfx('arrowFlight');
   if(crossed(s.stepTime,dt,arrowTiming.impact))api.sfx('arrowImpact');
   if(crossed(s.stepTime,dt,arrowTiming.fall))api.sfx('heroFall');
   if(s.stepTime>=6.5)api.next();
   return;
 }
 if(id==='host'&&crossed(s.stepTime,dt,.65))api.sfx('advance');
 if(id==='square'||id==='challenge'||(id==='host'&&s.stepTime>8)){
   const beat=Math.floor(s.stepTime/1.37);
   if(beat>Math.floor((s.stepTime-dt)/1.37))api.sfx('ranks',{pan:Math.sin(beat*2.4)*.85});
 }
 if(s.chapter===4){
   s.speed=0;
   const pulse=(seconds,offset=0)=>Math.floor((s.stepTime-offset)/seconds)>Math.floor((s.stepTime-dt-offset)/seconds);
   if(id==='ladder'){
     const near=s.stepTime%6>3.4&&s.stepTime%6<5;
     s.speed=k.has('arrowdown')&&!near?1:0;
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
     if(crossed(s.stepTime,dt,4))api.sfx('rattle');
     if(s.stepTime<4)return;
     if(k.has('space'))s.quiet=Math.min(3.2,s.quiet+dt);else s.quiet=Math.max(0,s.quiet-dt*.35);
     if(s.quiet>=3.2)api.next('The wheels stop. You are inside Troy.');
   }
   if(id==='voices'&&s.stepTime>=1&&s.stepTime-dt<1)api.say(...voices.outside,'outside');
   if(id==='listen'&&s.heard){
     if(pulse(1.25))api.sfx('footstep');
     if(['arrowup','arrowdown','arrowleft','arrowright','space'].some(key=>k.has(key))){if(s.work>0)api.sfx('wheel');s.work=0;api.hint('A board creaks. The watcher pauses.',1.5);}
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
   if(id==='gate'&&range(s,sites.bar)<2.9&&k.has('space')&&s.bar<1){
     const before=s.bar;s.bar=clamp(s.bar+dt*.45,0,1);
     if(before===0||(before<.55&&s.bar>=.55))api.sfx('gateStrain');
   }
 }
}
export function status(s){
 const id=current(s).id;
 if(id==='ride')return s.stepTime<4?'WHEELS TURNING':'SHIELD SLIPPING  ·  HOLD SPACE   '+Math.round(100*s.quiet/3.2)+'%';
 if(id==='ladder')return (s.stepTime%6>3.4&&s.stepTime%6<5?'LANTERN CLOSE  ·  WAIT':'HOLD ↓ TO DESCEND')+'   '+Math.min(100,Math.round(s.work/5.4*100))+'%';
 if(id==='listen')return s.heard?'WATCH AT THE SEAM  ·  STAY STILL   '+Math.min(100,Math.round(s.work/6.5*100))+'%':'FOOTSTEPS OUTSIDE';
 if(id==='voices')return s.stepTime<replyReady.voices?'A VOICE AT THE SEAM':'YOUR COMPANION STIRS';
 if(id==='hatch')return s.stepTime<5?'FOOTSTEPS NEARBY':'HATCH  ·  HOLD SPACE   '+Math.round(100*s.work/2.4)+'%';
 if(s.chapter===5){
   let watch='IN SHADOW';
   if(s.alarm>.4)watch='STOP · WATCH ALERT '+Math.min(100,Math.ceil(s.alarm/2.3*100))+'%';
   else if(range(s,guardPosition(s.elapsed))<9)watch='WATCH NEAR · HOLD SPACE TO CREEP';
   return 'ODYSSEUS  ·  '+watch+(id==='gate'?'  ·  BEAM '+Math.round(s.bar*100)+'%':'');
 }
 if(s.chapter===3)return 'ODYSSEUS  ·  FITTED '+s.fitted.length+'/3'+(s.carry?'  ·  CARRYING '+parts[s.carry].name.toUpperCase():'');
 const hero=(s.chapter<3?'ACHILLES':'ODYSSEUS')+'  ·  VIGOUR '+Math.max(0,Math.ceil(s.hp));
 if(!s.wave)return hero;
 const living=s.foes.filter(n=>n.hp>0),foe=living.slice(0,2).sort((a,b)=>range(s,[a.x,a.z])-range(s,[b.x,b.z]))[0];
 const threat=living.slice(0,2).some(n=>n.phase==='block'||n.phase==='attack');
 if(id==='hector')return hero+'  ·  HECTOR '+(foe?.hp??0)+'/'+(s.foes[0].maxHp??6)+' · '+(threat?'GUARD':'OPEN');
 const company=(s.company??0)+1;
 return hero+'  ·  COMPANY '+company+'/'+waves[id].companies.length+'  ·  '+living.length+' LEFT'+
   (foe?'\n'+(foe.veteran?'VETERAN':'WARRIOR')+' '+foe.hp+'/'+(foe.maxHp??2)+(threat?'  ·  GUARD':''):'');
}
