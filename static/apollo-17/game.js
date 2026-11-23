import {launch,distance,bearing} from '../field-narratives/runner.js';
import {wrap,clamp} from '../field-narratives/landscape.js';
import {chapters,sites,outbound,radio} from './story.js';
import {moon,height,boulders} from './moon.js';
import {openWork} from './fieldwork.js';

const initial=()=>({chapter:0,step:0,x:0,z:1,yaw:.8,rx:6,rz:4,ry:.3,speed:0,driving:false,fender:'broken',meters:0,elapsed:0,stepTime:0,log:[],calls:[],work:0,cruise:false});
const mountDistance=s=>distance(s,[s.rx,s.rz]);
function toggle(s,api){
  if(s.driving){s.driving=false;s.speed=0;s.cruise=false;s.x=s.rx-1.8*Math.cos(s.ry);s.z=s.rz-1.8*Math.sin(s.ry);api.sfx('latch');return;}
  if(mountDistance(s)>4.5){api.hint('The rover is '+Math.round(mountDistance(s))+' m away. Walk to a seat to board.');return;}
  if(s.chapter===0&&s.step<3){api.hint('Finish the wheel inspection first.');return;}
  s.driving=true;s.x=s.rx;s.z=s.rz;s.yaw=s.ry;s.speed=0;api.sfx('latch');
}
function wantsSeat(s,st){return !s.driving&&(st.drive||st.park)&&distance(s,sites[st.at])>12;}
function goal(s,st){return wantsSeat(s,st)?[s.rx,s.rz]:sites[st.at];}
function prompt(s,st){
  if(wantsSeat(s,st))return mountDistance(s)<4.5?'Board parked rover':'';
  if(distance(s,sites[st.at])>(s.driving?9:4.2))return '';
  if(s.driving&&!st.drive&&!st.park&&!st.board)return 'Step down to work';
  return st.verb;
}
function interact(s,st,api){
  if(!prompt(s,st)){api.hint('Approach the indicated site. Open M for the route and your journal.');return;}
  if(wantsSeat(s,st)){toggle(s,api);return;}
  if(s.driving&&!st.drive&&!st.park&&!st.board){toggle(s,api);return;}
  if(st.board&&!s.driving)toggle(s,api);
  if(st.park&&s.driving)toggle(s,api);
  if(st.work)api.work(st.work);else api.next(st.entry||'Ready to traverse.');
}
function update(s,dt,api){
  const k=api.held,turn=Number(k.has('arrowright'))-Number(k.has('arrowleft'));
  const forward=s.driving&&k.has('space')?0:Number(k.has('arrowup')||s.cruise)-Number(k.has('arrowdown'));
  const slope=Math.abs(height(s.x+Math.sin(s.yaw),s.z-Math.cos(s.yaw))-height(s.x,s.z));
  const vmax=s.driving?(5.7-Math.min(2.8,slope*5)):(k.has('shift')?2.9:1.85);
  s.yaw=wrap(s.yaw+turn*dt*(s.driving?1.03:1.7));s.speed+=(vmax*forward-s.speed)*(1-Math.exp(-dt*(s.driving?1.6:5)));
  const d=s.speed*dt;s.x=clamp(s.x+Math.sin(s.yaw)*d,-2320,1250);s.z=clamp(s.z-Math.cos(s.yaw)*d,-1250,1350);
  if(boulders.deflect(s,s.driving?.85:.3)&&Math.abs(s.speed)>1.2){
    s.speed*=.65;if(s.elapsed>(s.bumpAt||0)+4){s.bumpAt=s.elapsed;api.sfx('latch');api.hint('Boulder at the wheel. Steer around its shoulder.',2);}
  }
  if(s.driving){s.rx=s.x;s.rz=s.z;s.ry=s.yaw;s.meters+=Math.abs(d);}
  const c=chapters[s.chapter],st=c.steps[s.step],messages=outbound[c.name];
  if(messages&&s.driving&&(st.park||st.drive)&&s.stepTime>25&&distance(s,sites[st.at])>55){
    const index=s.stepTime>80?1:0,tag=c.name+'-'+index;
    if(!s.calls.includes(tag)){s.calls.push(tag);api.say('Schmitt',messages[index],'traverse-'+s.chapter+'-'+index);}
  }
}
function accept(s,st,api){
  if(st.work==='tape')s.fender='taped';
  if(s.chapter===0&&s.step===5)s.fender='lost';
  if(st.work==='clamp')s.fender='maps';
  if(st.voice)api.say(...radio[st.voice],st.voice);
}
function sound(){
  const ctx=new AudioContext();ctx.resume();
  return id=>{const osc=ctx.createOscillator(),g=ctx.createGain(),now=ctx.currentTime;
    osc.type=id==='latch'?'triangle':'sine';osc.frequency.setValueAtTime(id==='latch'?115:820,now);osc.frequency.exponentialRampToValueAtTime(id==='latch'?62:510,now+.12);
    g.gain.setValueAtTime(.038,now);g.gain.exponentialRampToValueAtTime(.0001,now+.13);osc.connect(g).connect(ctx.destination);osc.start();osc.stop(now+.15);};
}
launch({id:'apollo-17',title:'Apollo 17',display:'Apollo 17<em>Dust and Glass</em>',place:'Taurus–Littrow · December 1972',start:'Step onto the Moon',
 intro:'A broken fender, four spare maps, and a valley full of unanswered questions. Join Jack Schmitt for two surface excursions as Commander Gene Cernan.',
 controls:'↑/↓ move or reverse · ←/→ steer · Space brake · E board or work · R board or dismount · Q cruise · Shift jog · M field map · Six parts / about 30 min',
 endLabel:'Surface log closed · EVA 2',endTitle:'Back at Challenger',
 ending:s=>'The crew brought the repaired rover back with the Shorty core and its field record. Your traverse covered '+(s.meters/1000).toFixed(1)+' km. Apollo 17’s orange soil contained volcanic glass. This episode condenses two excursions, with original dialogue and an interpreted landscape.',
 chapters,initial,world:moon,work:openWork,update,goal,prompt,interact,accept,sound,track:()=>'apollo-17/regolith',
 alt:'Rover',act:'Brake',mapSpan:3300,center:[-650,150],mapColors:['#283034'],
 key(k,s,api){if(k==='r')toggle(s,api);if(k==='q'&&s.driving){s.cruise=!s.cruise;api.hint(s.cruise?'Cruise engaged. Steer with ←/→.':'Manual throttle.');}if(k==='space'||k==='arrowdown'){s.cruise=false;if(k==='space')s.speed=0;}},
 status:s=>(s.driving?'LRV  '+Math.abs(s.speed*3.6).toFixed(1)+' km/h':'EVA  ·  ON FOOT')+'\nFENDER  '+s.fender.toUpperCase()+'   '+(s.meters/1000).toFixed(2)+' km',
 map(ctx,px,pz,scale){
   ctx.fillStyle='#c4bba33a';for(const [key,r] of [['steno',90],['nansen',145],['shorty',94],['camelot',100]]){
    const [x,z]=sites[key];ctx.beginPath();ctx.ellipse(px(x),pz(z),Math.max(2,r*scale),Math.max(1,r*scale*.7),-.3,0,Math.PI*2);ctx.fill();}
   ctx.fillStyle='#f4e5c5';ctx.font='9px monospace';for(const key of ['hatch','steno','nansen','lara','shorty','camelot']){
    const [x,z]=sites[key];ctx.fillRect(px(x)-1,pz(z)-1,3,3);if(scale<.14)ctx.fillText(key==='hatch'?'LM':key.toUpperCase(),px(x)+4,pz(z)-4);}
 }});
