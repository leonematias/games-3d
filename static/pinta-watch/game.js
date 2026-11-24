import {makeWorld, stations, widthAt, shoreBearing} from './world.js';

const $=id=>document.getElementById(id);
const touchControls=matchMedia('(pointer: coarse)');
const swellPeriod=4.1, slackDuration=2.55;
const storageKey='pinta-watch-v1';
const initial=()=>({step:'brief',signs:[],report:null,haul:0});
const places={brief:[0,5.55],signs:[0,5.55],report:[0,3.6],bow:[0,5.4],bearing:[0,-7.4],line:[-.2,-6.6]};
const tasks={
  brief:['Take the evening watch','Listen to the watch mate. You can move and look around.'],
  signs:['Examine the two signs','Green cane at the port rail. Cut wood at the starboard rail.'],
  report:['Report what you saw','Speak to the watch mate aft, near the stern.'],
  bow:['Join the night lookout','Rodrigo is waiting at the bow.'],
  bearing:['Confirm the shoreline','From the bow, turn just left of straight ahead. Look for the low, steady outline.'],
  line:['Shorten the mainsail','Work the coil at the foot of the mainmast. Haul on slack and ease when tight.']
};
function readSave(){
  try{
    const s=JSON.parse(localStorage.getItem(storageKey));
    if(s && (s.step in tasks || ['dawn','done'].includes(s.step)) && Array.isArray(s.signs))
      return {...s,haul:Math.min(1,Math.max(0,Number(s.haul)||0))};
  }catch{}
  return initial();
}
let state=readSave(), mode='title', x=0,z=5.55,yaw=0,pitch=-.05;
let world,lines,frameTime=performance.now(),clock=0,filmTime=0,muted=false;
let choiceOpen=false,near=null,activeTargets=[],noticeTime=0,haulHeld=false,needsEase=false;
let speech=null,spokenId=null,queue=[],afterSpeech=null,voiceClock=0,fallback=false;
const held=new Set();
const waves=new Audio('/games-3d/voyager/sounds/waves.wav');waves.loop=true;waves.volume=.18;
const music=new Audio('/games-3d/sounds/music/voyager/island-morning.mp3');music.loop=true;music.volume=.11;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const range=point=>Math.hypot(x-point.x,z-point.z);
function save(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}}
function setMode(next){
  mode=next;document.body.dataset.mode=next;
  $('panel').hidden=next==='play';$('play').hidden=next!=='play'||state.step==='dawn';
  $('pause').hidden=next!=='play';$('controls').hidden=next==='end';
  $('cinema').hidden=next!=='play'||state.step!=='dawn';
  $('caption').hidden=next!=='play'||!speech;
  if(next!=='play'){held.clear();easeLine();speech?.pause();waves.pause();}
  if(next==='pause'){music.pause();$('start').focus();}
}
function ending(){
  state.step='done';save();setMode('end');
  $('kicker').textContent='12 October 1492 · Watch completed';$('title').textContent='Guanahaní';
  $('summary').textContent='The Pinta lay offshore until daylight. The island the crew could now see was home to Lucayan people, whose sea routes linked the Bahamas long before this crossing. The journal names Rodrigo de Triana as lookout. Your deckhand, the dialogue, and the work on deck are dramatized.';
  const first=state.signs[0]==='cane'?'the green cane':'the worked stick';
  const reportNote=state.report==='wood'?'the cuts across the grain':'the green cane joint';
  $('finalEntry').textContent='I examined '+first+' first and told the mate about '+reportNote+'. When Rodrigo called land, I took the bearing. We shortened sail and waited for daylight.';
  $('finalEntry').hidden=false;
  $('start').textContent='Sail again';$('fresh').hidden=true;
}
function stage(step){
  state.step=step;choiceOpen=false;$('choice').hidden=true;$('feedback').textContent='';save();
  if(step==='dawn'){filmTime=0;setMode('play');music.play().catch(()=>{});}
}
function stopSpeech(){
  if(speech){speech.pause();speech.onended=null;speech.onerror=null;}
  speech=null;queue=[];afterSpeech=null;$('caption').hidden=true;
}
function nextLine(){
  const id=queue.shift();spokenId=id;
  if(!id){
    speech=null;$('caption').hidden=true;
    const finish=afterSpeech;afterSpeech=null;finish?.();return;
  }
  const [speaker,words]=lines[id];
  $('caption').firstElementChild.textContent=speaker;$('caption').lastElementChild.textContent=words;
  $('caption').hidden=mode!=='play';
  const clip=new Audio('/games-3d/static/pinta-watch/audio/'+id+'.mp3');speech=clip;clip.muted=muted;
  voiceClock=0;fallback=false;
  clip.onended=()=>{if(speech===clip)nextLine();};
  const failed=()=>{if(speech===clip)fallback=true;};
  clip.onerror=failed;clip.play().catch(failed);
}
function say(ids,finish){
  stopSpeech();queue=[...ids];afterSpeech=finish;nextLine();
}
function notice(message){$('feedback').textContent=message;noticeTime=3;}
function begin(restart){
  $('finalEntry').hidden=true;
  stopSpeech();if(restart){state=initial();save();}
  if(state.step==='done'){ending();return;}
  [x,z]=places[state.step]||[0,-7.4];yaw=state.step==='brief'?Math.atan2(1.2,z-3.75):0;pitch=-.045;filmTime=0;
  setMode('play');waves.play().catch(()=>{});
  if(state.step==='report' && state.report)deliverReport();
  if(state.step==='brief')say(['brief'],()=>stage('signs'));
  if(state.step==='dawn')stage('dawn');
}
function resume(){
  setMode('play');waves.play().catch(()=>{});
  if(state.step==='dawn')music.play().catch(()=>{});
  if(speech&&!fallback)speech.play().catch(()=>{fallback=true;});
}
function pause(){
  if(mode==='pause'){resume();return;}
  if(mode!=='play')return;
  setMode('pause');$('kicker').textContent='The Pinta Watch';$('title').textContent='Watch paused';
  $('summary').textContent='Your place on deck is saved at each completed task.';$('start').textContent='Resume watch';$('fresh').hidden=true;
}
$('pause').onclick=pause;
$('start').onclick=()=>{
  if(mode==='pause')resume();
  else if(mode==='end'){music.pause();music.currentTime=0;begin(true);}
  else begin(false);
};
$('fresh').onclick=()=>begin(true);
$('sound').onclick=()=>{muted=!muted;for(const a of [speech,music,waves])if(a)a.muted=muted;$('sound').textContent=muted?'Sound off':'Sound on';$('sound').setAttribute('aria-pressed',String(muted));};
$('skip').onclick=()=>{if(mode==='play'&&state.step==='dawn')ending();};
function targets(){
  if(state.step==='signs')return ['wood','cane'].filter(id=>!state.signs.includes(id));
  const station={report:'mate',bow:'bow',bearing:'bow',line:'line'}[state.step];
  return station?[station]:[];
}
function report(id){
  if(!choiceOpen||mode!=='play')return;
  state.report=id;save();choiceOpen=false;$('choice').hidden=true;
  deliverReport();
}
function deliverReport(){
  say([state.report==='wood'?'reportWood':'reportCane','night'],()=>stage('bow'));
}
$('reportWood').onclick=()=>report('wood');$('reportCane').onclick=()=>report('cane');
function waitingForLine(){
  return speech && spokenId!=='cane' && spokenId!=='wood';
}
function act(){
  if(mode!=='play'||waitingForLine()||choiceOpen)return;
  if(state.step==='dawn'){ending();return;}
  if(!near || !targets().includes(near)){notice('Walk closer to the marked station.');return;}
  if(state.step==='signs'){
    state.signs.push(near);const observed=near;
    if(state.signs.length===2)stage('report');else save();
    say([observed]);return;
  }
  if(state.step==='report'){held.clear();choiceOpen=true;$('choice').hidden=false;$('reportWood').focus();return;}
  if(state.step==='bow'){say(['sighting'],()=>stage('bearing'));return;}
  if(state.step==='bearing'){
    if(Math.abs(pitch+.01)>.16){
      notice(pitch>0?'Lower your gaze to the horizon.':'Lift your gaze to the horizon.');
      return;
    }
    const offset=wrap(shoreBearing-yaw);
    if(Math.abs(offset)>.13){
      notice(offset>0?'Sweep left along the horizon.':'Sweep right along the horizon.');
      return;
    }
    say(['confirm','line'],()=>stage('line'));return;
  }
}
function press(key){
  if(key==='escape'){pause();return;}
  if(mode!=='play')return;
  if(choiceOpen){
    const choices=[$('reportWood'),$('reportCane')];
    if(['arrowleft','arrowright','arrowup','arrowdown'].includes(key)){
      choices[document.activeElement===choices[0]?1:0].focus();
    }else if(key==='e'||key===' '){
      (choices.includes(document.activeElement)?document.activeElement:choices[0]).click();
    }else if(key==='1'||key==='2')report(key==='1'?'wood':'cane');
    return;
  }
  held.add(key);
  if(key==='e')act();
  if(key===' '){
    if(state.step==='dawn')ending();
    else if(near==='line'&&state.step==='line'&&!waitingForLine())haulHeld=true;
  }
}
function easeLine(){haulHeld=false;needsEase=false;}
function lift(key){held.delete(key);if(key===' ')easeLine();}
addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  if(mode==='play'&&['arrowup','arrowdown','arrowleft','arrowright','pageup','pagedown',' '].includes(key))e.preventDefault();
  if(!e.repeat)press(key);
});
addEventListener('keyup',e=>lift(e.key.toLowerCase()));
for(const b of document.querySelectorAll('#touch button')){
  const key=b.dataset.key;
  b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);press(key);};
  b.onlostpointercapture=()=>lift(key);
}
$('use').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);press(near==='line'?' ':'e');};
$('use').onlostpointercapture=easeLine;
$('use').onclick=e=>{if(e.detail===0&&near!=='line')act();};
const deck=$('sea');
let touchPoint=null;
deck.onpointerdown=e=>{
  if(e.pointerType!=='touch'||mode!=='play'||state.step==='dawn'||choiceOpen)return;
  touchPoint=[e.clientX,e.clientY];deck.setPointerCapture(e.pointerId);
};
deck.onpointermove=e=>{
  if(e.pointerType!=='touch'||mode!=='play'||state.step==='dawn'||choiceOpen||!deck.hasPointerCapture(e.pointerId)||!touchPoint)return;
  yaw=wrap(yaw-(e.clientX-touchPoint[0])*.005);
  pitch=Math.max(-1,Math.min(.95,pitch-(e.clientY-touchPoint[1])*.004));
  touchPoint=[e.clientX,e.clientY];
};
deck.onlostpointercapture=()=>{touchPoint=null;};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='play')pause();});
addEventListener('blur',()=>{held.clear();easeLine();});
function deckDirection(station){
  const angle=wrap(Math.atan2(x-station.x,z-station.z)-yaw);
  if(Math.abs(angle)<.6)return 'ahead';
  if(Math.abs(angle)>2.55)return 'behind you';
  return angle>0?'to your left':'to your right';
}
function move(dt){
  const horizontal=Number(held.has('arrowleft'))-Number(held.has('arrowright'));
  const sidestep=held.has('c');
  if(!sidestep)yaw=wrap(yaw+horizontal*dt*1.38);
  const tilt=Number(held.has('pageup'))-Number(held.has('pagedown'));
  pitch=Math.max(-1,Math.min(.95,pitch+tilt*dt));
  const ahead=Number(held.has('arrowup'))-Number(held.has('arrowdown'));
  const right=sidestep?-horizontal:0;
  const speed=dt*3.15/Math.max(1,Math.hypot(ahead,right));
  z=Math.max(-8.95,Math.min(7.31,z+(-Math.cos(yaw)*ahead-Math.sin(yaw)*right)*speed));
  x=Math.max(.25-widthAt(z),Math.min(widthAt(z)-.25,x+(-Math.sin(yaw)*ahead+Math.cos(yaw)*right)*speed));
  for(const [cx,cz,r] of [[0,.1,.42],[0,-5.1,.4],[0,6,.33],[-1.85,-2.7,.58],[1.85,2.7,.58],[-1.2,7.1,.46],[-.52,-7.8,.44],[2,6.1,.52],[1.65,7.05,.52],[-1.8,1.5,.52],[-1.9,2.45,.52]]){
    const dx=x-cx,dz=z-cz,d=Math.hypot(dx,dz);
    if(d<r){x=cx+(dx||.001)*r/(d||.001);z=cz+dz*r/(d||.001);}
  }
}
function update(dt){
  clock+=dt;if(speech){
    voiceClock+=dt;
    const duration=$('caption').lastElementChild.textContent.length/15+1;
    if((fallback&&voiceClock>duration)||voiceClock>Math.max(duration,Number.isFinite(speech.duration)?speech.duration:0)+4){speech.pause();nextLine();}
  }
  if(state.step==='dawn'){filmTime+=dt;if(filmTime>=7)ending();return;}
  if(!choiceOpen)move(dt);
  activeTargets=targets().sort((a,b)=>range(stations[a])-range(stations[b]));
  const closest=activeTargets[0];near=closest&&range(stations[closest])<2.1?closest:null;
  const slack=clock%swellPeriod<slackDuration;
  if(haulHeld&&near==='line'&&!speech){
    if(!slack && !needsEase){
      needsEase=true;
      notice('The line pulled taut. Release it for the next haul.');
    }
    if(slack && !needsEase)state.haul=Math.min(1,state.haul+dt*.28);
    if(state.haul>=1){haulHeld=false;say(['dawn'],()=>stage('dawn'));}
  }
  if(noticeTime>0){noticeTime-=dt;if(noticeTime<=0)$('feedback').textContent='';}
  const task=tasks[state.step];
  $('goal').textContent=task[0];
  if(state.step==='signs' && state.signs.length===1){
    $('direction').textContent=state.signs.includes('wood')?'Find the cane at the port (left) rail.':'Find the worked wood at the starboard (right) rail.';
  }else if(!near && !speech && ['report','bow','line'].includes(state.step)){
    const subject={report:'Watch mate',bow:'Rodrigo',line:'Mainmast line'}[state.step];
    $('direction').textContent=subject+' · '+deckDirection(stations[closest])+' · '+Math.ceil(range(stations[closest]))+' m';
  }else{
    $('direction').textContent=task[1];
  }
  $('time').textContent=['bow','bearing','line'].includes(state.step)?'12 October · Night watch':'11 October · Evening watch';
  const deg=(270-yaw*180/Math.PI+360)%360;
  $('bearing').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8]+' · '+Math.round(deg)+'°';
  $('entries').textContent=[...state.signs.map(id=>id==='wood'?'Cut marks across the grain':'Cane still green at the joint'),state.report?'Reported '+(state.report==='wood'?'cut marks':'green cane'):null].filter(Boolean).join(' · ');
  const work=near==='line'&&state.step==='line';
  $('use').hidden=!near||!!waitingForLine()||choiceOpen;
  const touch=touchControls.matches;
  if(work){
    const haulPrompt=touch?'Hold to haul':'Hold Space · Haul';
    const easePrompt=touch?'Lift finger · Ease off':'Release Space · Ease off';
    $('use').textContent=slack && !needsEase?haulPrompt:easePrompt;
  }else if(near){
    const label=state.step==='bearing'?'Confirm bearing':stations[near].label;
    $('use').textContent=touch?label:'E · '+label;
  }
  $('gauge').hidden=!work||!!waitingForLine();
  $('gauge').setAttribute('aria-valuenow',Math.round(100*state.haul));
  $('fill').style.width=state.haul*100+'%';
}
function frame(now){
  const dt=Math.min(.085,(now-frameTime)/1000);frameTime=now;
  if(mode==='play')update(dt);
  const phase=clock%swellPeriod;
  const lineSag=Math.max(0,Math.min(1,phase*6,(slackDuration-phase)*6));
  world.render(mode==='pause'?0:dt,{mode,step:state.step,x,z,yaw,pitch,progress:state.haul,lineSag,target:mode==='play'&&activeTargets.length&&!waitingForLine()?stations[activeTargets[0]]:null,filmTime});
  requestAnimationFrame(frame);
}
try{
  [world,lines]=await Promise.all([makeWorld($('sea')),fetch('/games-3d/static/pinta-watch/dialogue.json').then(r=>r.json())]);
  $('start').disabled=false;$('start').textContent=state.step==='brief'?'Take the watch':state.step==='done'?'Read your completed watch':'Resume your watch';
  $('fresh').hidden=state.step==='brief';requestAnimationFrame(frame);
}catch(error){console.error(error);$('summary').textContent='The deck could not load. Reload the page to prepare the ship.';$('start').textContent='Deck unavailable';}
