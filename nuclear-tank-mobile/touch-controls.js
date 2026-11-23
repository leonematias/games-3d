// Touch-only control surface. All gameplay actions fit in one thumb's reach.
export function createTouchControls({ onCancel, onPause }) {
  const $ = id => document.getElementById(id);
  const root=$('handDock'), stick=$('touchStick'), knob=$('touchKnob'), panel=$('pausePanel');
  let hand='right', muted=false, paused=true, ready=false, blocked=true, pointer=null, x=0, y=0;
  try { hand=localStorage.getItem('nuclear-tank-mobile-hand') || 'right'; muted=localStorage.getItem('nuclear-tank-mobile-muted')==='true'; } catch {}
  if(!['left','right'].includes(hand)) hand='right';
  function clear() { pointer=null; x=y=0; knob.style.transform='translate(-50%,-50%)'; stick.classList.remove('held'); onCancel?.(); }
  function layout() {
    document.body.dataset.hand=hand;
    $('handChoice').textContent=`${hand==='right'?'Right':'Left'} hand`;
    $('soundChoice').textContent=muted?'Sound off':'Sound on';
    root.hidden=!ready || blocked || paused;
    panel.hidden=!ready || !paused;
  }
  function setPaused(value) {
    if(!ready) return;
    if(!value && matchMedia('(orientation: landscape)').matches) return;
    clear(); paused=value; onPause(paused); layout();
  }
  function setHand(value) {clear(); hand=value; try { localStorage.setItem('nuclear-tank-mobile-hand',hand); }catch{} layout();}
  function position(e) {
    const r=stick.getBoundingClientRect(), radius=r.width*.32;
    x=(e.clientX-r.left-r.width/2)/radius; y=(e.clientY-r.top-r.height/2)/radius;
    const length=Math.hypot(x,y); if(length>1) {x/=length;y/=length;}
    if(length<.14) x=y=0;
    knob.style.transform=`translate(calc(-50% + ${x*radius}px),calc(-50% + ${y*radius}px))`;
  }
  stick.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch' || paused || blocked || pointer!==null) return;
    e.preventDefault(); pointer=e.pointerId; stick.setPointerCapture(pointer); stick.classList.add('held');position(e);
  });
  stick.addEventListener('pointermove',e=>{if(e.pointerId===pointer)position(e);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(name,e=>{if(e.pointerId===pointer)clear();});
  $('pauseButton').addEventListener('click',()=>setPaused(true));
  $('resumeButton').addEventListener('click',()=>setPaused(false));
  $('handChoice').addEventListener('click',()=>setHand(hand==='right'?'left':'right'));
  $('soundChoice').addEventListener('click',()=>{muted=!muted;try{localStorage.setItem('nuclear-tank-mobile-muted',String(muted));}catch{} onPause(paused);layout();});
  window.addEventListener('blur',()=>setPaused(true));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setPaused(true);});
  window.addEventListener('resize',()=>{clear();if(matchMedia('(orientation: landscape)').matches)setPaused(true);});
  document.addEventListener('contextmenu',e=>e.preventDefault());
  layout();
  return {
    get hand(){return hand;}, get muted(){return muted;}, get paused(){return paused;},
    clear,setPaused,setHand,
    ready(){ready=true;blocked=false;paused=false;onPause(false);if(matchMedia('(orientation: landscape)').matches)setPaused(true);layout();},
    update({blocked: next}){if(next!==blocked){blocked=next;clear();layout();}},
    sample(){return paused || blocked ? {x:0,y:0} : {x,y};},
  };
}
