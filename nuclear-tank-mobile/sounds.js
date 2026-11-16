const FILES={fire:'projectile_fire',break:'breakable_explosion',hit:'tank_hit',key:'key_pickup',gate:'gate_open',coin:'coin_pickup',move:'tank_move',turn:'tank_turn',victory:'victory',transform:'tank_transform',shieldUp:'shield_up',shieldPop:'shield_pop',emp:'emp_pulse',laser:'laser_zap'};
export function createSoundManager(){
  let ctx, master, muted=false;const buffers=new Map(),loops=new Map();let voices=0;
  function unlock(){
    if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=muted?0:.65;master.connect(ctx.destination);
      for(const [key,file] of Object.entries(FILES))fetch(`./assets/sounds/${file}.wav`).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).then(b=>buffers.set(key,b)).catch(()=>{});
    }
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  }
  window.addEventListener('pointerdown',unlock,{passive:true});
  function play(key,volume=.7,loop=false){if(!ctx||!buffers.has(key)||muted||(!loop&&voices>=8))return null;
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers.get(key);source.loop=loop;gain.gain.value=volume;source.connect(gain).connect(master);voices++;source.onended=()=>{voices--;source.disconnect();gain.disconnect();};source.start();return source;}
  function setLoop(key,active){if(active&&!loops.has(key)){const source=play(key,.14,true);if(source)loops.set(key,source);}else if(!active&&loops.has(key)){loops.get(key).stop();loops.delete(key);}}
  return {setMuted(value){muted=value;if(master)master.gain.value=value?0:.65;},setMoving:v=>setLoop('move',v),setTurning:v=>setLoop('turn',v),
    playFire:()=>play('fire',.35),playBreak:()=>play('break'),playHit:()=>play('hit'),playKey:()=>play('key'),playGate:()=>play('gate'),playCoin:()=>play('coin',.45),playVictory:()=>play('victory'),playTransform:()=>play('transform'),playShieldUp:()=>play('shieldUp'),playShieldPop:()=>play('shieldPop'),playEmp:()=>play('emp'),playLaser:()=>play('laser')};
}
