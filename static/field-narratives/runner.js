import {createMusic} from '../music/music-player.js';
export const $=id=>document.getElementById(id);
export const distance=(s,p)=>Math.hypot(s.x-p[0],s.z-p[1]);
export const bearing=(s,p)=>Math.atan2(p[0]-s.x,s.z-p[1]);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export async function launch(spec){
  const key=spec.id+'-campaign-v1',held=new Set();let mode='title',returnMode='play',world,s=spec.initial();
  let clip=null,voiceTime=0,readTime=0,filmTime=0,hintTime=0,last=performance.now(),saveClock=0,uiClock=0,snapshot=null,soundOff=false,musicOn=false;
  const score=createMusic({volume:.19});let sound=null,workId=0,overlayKind='';
  const chapter=()=>spec.chapters[s.chapter],step=()=>chapter()?.steps[s.step],goal=()=>spec.goal(s,step());
  const save=()=>{try{localStorage.setItem(key,JSON.stringify({state:s,checkpoint:snapshot}));}catch{}};
  try{const raw=JSON.parse(localStorage.getItem(key));if(raw?.state&&spec.chapters[raw.state.chapter]?.steps[raw.state.step]){s={...s,...raw.state};snapshot=raw.checkpoint;}}catch{}
  document.body.classList.toggle('creek',spec.id==='hell-creek');document.title=spec.title+' · Game3D';
  $('masthead').textContent=spec.title;$('name').innerHTML=spec.display;$('place').textContent=spec.place;$('lead').textContent=spec.intro;$('keys').textContent=spec.controls;
  $('altKey').textContent=spec.alt;$('actKey').textContent=spec.act;$('lowKey').textContent=spec.low||'Low';$('lowKey').hidden=!spec.low;
  function setMode(next){
    mode=next;document.body.dataset.mode=next;$('hud').hidden=next!=='play';
    $('cover').hidden=!['title','end'].includes(next);$('overlay').hidden=next!=='overlay';$('film').hidden=next!=='film';$('pause').hidden=!['film','play'].includes(next);
    $('caption').hidden=next!=='play'||!readTime;
    if(next!=='play')held.clear();
  }
  function quiet(){if(clip){clip.pause();clip.onended=null;clip=null;}voiceTime=0;readTime=0;$('caption').hidden=true;}
  function say(speaker,words,id){
    quiet();if(!words)return;
    $('caption').firstElementChild.textContent=speaker;$('caption').lastElementChild.textContent=words;
    voiceTime=0;readTime=Math.max(3,words.length/14+1);$('caption').hidden=mode!=='play';
    if(id){const a=new Audio('/games-3d/static/'+spec.id+'/audio/'+id+'.mp3');clip=a;a.muted=soundOff;a.onended=()=>{if(clip===a)quiet();};a.play().catch(()=>{});}
  }
  function hint(msg,time=4){$('notice').textContent=msg;hintTime=time;}
  function sfx(id){if(!soundOff)sound?.(id);}
  function bookmark(){snapshot=structuredClone(s);save();}
  function finish(){
    s.completed=true;bookmark();quiet();setMode('end');
    $('place').textContent=spec.endLabel;$('name').textContent=spec.endTitle;$('lead').textContent=spec.ending(s);
    $('keys').textContent=s.log.slice(-4).join(' · ');$('start').textContent='Replay episode';$('reset').hidden=true;score.stop({fade:3});
  }
  function playChapterMusic(){
    const track=spec.track(s);
    if(track)score.play(track).catch(console.warn);
    else score.stop({fade:1});
    musicOn=!!track;
  }
  function startFilm(){
    quiet();s.filmPending=true;setMode('film');filmTime=0;$('filmLabel').textContent=chapter().scene;
    $('filmTitle').textContent=chapter().name;playChapterMusic();
  }
  function releaseFilm(){s.filmPending=false;save();setMode('play');if(chapter().line)say(chapter().speaker,chapter().line,'chapter-'+(s.chapter+1));}
  function next(msg){
    if(mode!=='play')return;
    const old=step();if(old.entry&&!s.log.includes(old.entry))s.log.push(old.entry);
    spec.accept?.(s,old,api);
    if(s.step+1<chapter().steps.length)s.step++;else if(s.chapter+1<spec.chapters.length){s.chapter++;s.step=0;startFilm();}else{finish();return;}
    s.work=0;s.stepTime=0;s.cruise=false;bookmark();if(msg)hint(msg);sfx('record');refresh();
  }
  let arrowActions=null, selectedOption=0;
  function panel(kind,title,desc){
    selectedOption=mode==='overlay'&&$('overlayTitle').textContent===title?Math.max(0,[...$('choices').children].indexOf(document.activeElement)):0;
    arrowActions=null;
    overlayKind=kind;setMode('overlay');$('overlayType').textContent=kind;$('overlayTitle').textContent=title;
    $('overlayText').textContent=desc;$('result').textContent='';$('choices').replaceChildren();$('tool').hidden=true;
    $('close').hidden=false;$('close').textContent='Return · Esc';
  }
  function buttons(options,choose){
    const list=$('choices');
    options.forEach((label,i)=>{
      const button=document.createElement('button');
      button.textContent=label;
      button.onclick=()=>choose(i);
      list.appendChild(button);
    });
    list.children[Math.min(selectedOption,options.length-1)]?.focus();
    $('choiceKeys').textContent='Arrows choose · E or Space confirm';
  }
  function overlayKey(e,key){
    const list=[...$('choices').children];
    const delta={arrowleft:-1,arrowup:-1,arrowright:1,arrowdown:1}[key];
    if(!delta&&key!=='space'&&key!=='e')return false;
    e.preventDefault();
    if(!list.length||e.repeat)return true;
    if(delta){
      if(arrowActions)list[arrowActions[key]].click();
      else{
        const current=list.indexOf(document.activeElement);
        list[(Math.max(0,current)+delta+list.length)%list.length].focus();
      }
    }else if(document.activeElement===$('close'))resume();
    else (list.includes(document.activeElement)?document.activeElement:list[0]).click();
    return true;
  }
  const ui={
    select(title,desc,options,choose){panel('Field work',title,desc);buttons(options,choose);},
    instrument(title,desc,draw,options,choose,directions){
      panel('Instrument',title,desc);const c=$('tool');c.hidden=false;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);draw(ctx,c.width,c.height);buttons(options,choose);
      if(directions){
        arrowActions=directions;
        $('choices').lastElementChild.focus();
        $('choiceKeys').textContent='Arrows adjust · E or Space confirm';
      }
    },hint(text){$('result').textContent=text;}
  };
  function work(id,onComplete){
    returnMode='play';const token=++workId;quiet();spec.work(id,ui,message=>{
      if(mode!=='overlay'||token!==workId)return;setMode('play');if(onComplete){onComplete(message);refresh();}else next(message);
    },s);
  }
  function fail(text){
    if(mode!=='play')return;quiet();panel('Checkpoint','Recover your footing',text);$('close').hidden=true;
    buttons(['Retry from checkpoint'],()=>{s=structuredClone(snapshot||spec.initial());spec.recover?.(s);setMode('play');save();refresh();});
  }
  const api={next,hint,sfx,say,work,fail,save,bookmark,goal,step,held};
  function interact(){
    if(mode==='film'){releaseFilm();return;}if(mode!=='play')return;
    spec.interact(s,step(),api);refresh();
  }
  function resume(){
    if(mode!=='overlay'||overlayKind==='Checkpoint')return;
    workId++;setMode(returnMode);clip?.play().catch(()=>{});
    if(musicOn)playChapterMusic();refresh();
  }
  function pause(){
    if(mode==='overlay'){resume();return;}if(!['play','film'].includes(mode))return;
    returnMode=mode;save();clip?.pause();score.stop({fade:.3});panel('Paused',chapter().name,'Your position and completed tasks are saved.');buttons(['Resume'],resume);
  }
  function drawMap(canvas,large=false){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,p=goal();
    ctx.clearRect(0,0,w,h);ctx.fillStyle=spec.mapColors[0];ctx.fillRect(0,0,w,h);
    const scale=large?Math.min(w,h)/(spec.mapSpan):Math.min(w,h)/(Math.max(100,Math.min(1200,distance(s,p)*2.25)));
    const center=large?spec.center:[s.x,s.z],px=x=>w/2+(x-center[0])*scale,pz=z=>h/2+(z-center[1])*scale;
    ctx.lineWidth=1;ctx.strokeStyle='#a5ac9950';const grid=large?250:Math.max(25,Math.round(25/scale/25)*25);
    for(let x=center[0]-w/scale;x<center[0]+w/scale;x+=grid){const v=px(Math.floor(x/grid)*grid);ctx.beginPath();ctx.moveTo(v,0);ctx.lineTo(v,h);ctx.stroke();}
    for(let z=center[1]-h/scale;z<center[1]+h/scale;z+=grid){const v=pz(Math.floor(z/grid)*grid);ctx.beginPath();ctx.moveTo(0,v);ctx.lineTo(w,v);ctx.stroke();}
    spec.map?.(ctx,px,pz,scale,s);
    ctx.strokeStyle='#f4d282';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(px(s.x),pz(s.z));ctx.lineTo(px(p[0]),pz(p[1]));ctx.stroke();ctx.setLineDash([]);
    ctx.strokeRect(px(p[0])-3,pz(p[1])-3,6,6);ctx.save();ctx.translate(px(s.x),pz(s.z));ctx.rotate(s.yaw);ctx.fillStyle='#fff3ca';ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,4);ctx.lineTo(-4,4);ctx.fill();ctx.restore();
    ctx.fillStyle='#fff1d0';ctx.font='10px monospace';ctx.fillText('N',7,13);
  }
  function journal(){
    if(mode==='overlay'){resume();return;}if(mode!=='play')return;returnMode='play';clip?.pause();save();
    panel('Field journal',chapter().name,step().hint);const c=$('tool');c.hidden=false;drawMap(c,true);
    $('result').textContent=s.log.length?s.log.join('  ·  '):'The first entry will appear as you explore.';buttons(['Resume'],resume);
  }
  function refresh(){
    if(!step())return;
    const p=goal(),m=distance(s,p),angle=wrap(bearing(s,p)-s.yaw);
    $('chapter').textContent='Part '+(s.chapter+1)+' / '+spec.chapters.length+' · '+chapter().name;
    $('objective').textContent=step().title;$('detail').textContent=step().hint;
    $('progress').style.setProperty('--p',(s.step/chapter().steps.length*100)+'%');
    $('range').textContent=(Math.abs(angle)<.23?'Ahead':angle<0?'← Left':'Right →')+' · '+(m>=1000?(m/1000).toFixed(2)+' km':Math.round(m)+' m');
    const action=spec.prompt(s,step());$('interact').hidden=!action;$('interact').textContent='E · '+(action||'');
    $('instruments').textContent=spec.status(s);drawMap($('mini'));
  }
  function begin(reset){
    if(reset){s=spec.initial();snapshot=null;}
    if(s.completed){finish();return;}
    if(!snapshot)bookmark();
    if(!sound)sound=spec.sound?.();
    score.resume();if(s.filmPending||!s.elapsed||reset)startFilm();else{setMode('play');playChapterMusic();}
    refresh();
  }
  $('start').onclick=()=>begin(mode==='end');$('reset').onclick=()=>begin(true);$('pause').onclick=pause;$('close').onclick=resume;$('mapBtn').onclick=journal;
  $('skip').onclick=releaseFilm;$('interact').onclick=interact;
  $('volume').onclick=()=>{soundOff=!soundOff;score.setMuted(soundOff);if(clip)clip.muted=soundOff;$('volume').textContent=soundOff?'Sound off':'Sound on';};
  function down(k){
    if(k==='escape'){pause();return;}if(k==='m'){journal();return;}
    if(k==='e'){interact();return;}if(mode!=='play')return;
    held.add(k);spec.key?.(k,s,api);refresh();
  }
  const normalize=k=>k===' '?'space':k.toLowerCase();
  addEventListener('keydown',e=>{
    const key=normalize(e.key);
    if(mode==='overlay'&&overlayKey(e,key))return;
    if(['play','film'].includes(mode)&&['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();
    if(!e.repeat)down(key);
  });
  addEventListener('keyup',e=>held.delete(normalize(e.key)));
  for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);down(b.dataset.key);};b.onlostpointercapture=()=>held.delete(b.dataset.key);}
  const canvas=$('world');
  let touchX=null;
  canvas.onpointerdown=e=>{
    if(e.pointerType!=='touch'||mode!=='play')return;
    touchX=e.clientX;canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{
    if(e.pointerType!=='touch'||mode!=='play'||!canvas.hasPointerCapture(e.pointerId)||touchX===null)return;
    s.yaw=wrap(s.yaw+(e.clientX-touchX)*.005);
    touchX=e.clientX;
  };
  canvas.onlostpointercapture=()=>{touchX=null;};
  addEventListener('blur',()=>held.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden&&['play','film'].includes(mode))pause();});addEventListener('pagehide',()=>{if(mode!=='title')save();});
  try{
    world=await spec.world();$('start').disabled=false;$('start').textContent=s.completed?'Read the ending':s.elapsed?'Continue expedition':spec.start;
    $('reset').hidden=!s.elapsed;setMode('title');if(document.activeElement===document.body)$('start').focus();
  }catch(error){console.error(error);$('lead').textContent='The landscape could not load. Reload the episode to try again.';return;}
  function tick(time){
    const dt=Math.min(.12,(time-last)/1000);last=time;
    if(mode==='film'){filmTime+=dt;if(filmTime>(chapter().duration||5.2))releaseFilm();}
    if(mode==='play'){
      s.elapsed+=dt;s.stepTime+=dt;spec.update(s,dt,api);
      if(readTime){voiceTime+=dt;if(voiceTime>Math.max(readTime,Number.isFinite(clip?.duration)?clip.duration+.4:0))quiet();}
      if(hintTime>0&&(hintTime-=dt)<=0)$('notice').textContent='';
      if((saveClock+=dt)>6){save();saveClock=0;}if((uiClock+=dt)>.12){refresh();uiClock=0;}
    }
    if(mode!=='overlay')world.render(s,dt,mode,goal());
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
