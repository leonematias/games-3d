// Foley for the horse, gate and Paris's shot. Combat uses the arcade's recorded battle takes.
import {createBattleSounds} from '../eagle-ford/battle-sounds.js';

export function createSounds({context:ctx=new AudioContext()}={}){
  const bus=ctx.createDynamicsCompressor(),master=ctx.createGain(),playing=new Set();
  bus.threshold.value=-13;bus.ratio.value=4;
  bus.connect(master).connect(ctx.destination);
  const noise=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
  const samples=noise.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;

  function layer(source,filter,duration,level,attack,delay,pan,endPan=pan){
    const t=ctx.currentTime+delay,env=ctx.createGain(),stereo=ctx.createStereoPanner();
    env.gain.setValueAtTime(.0001,t);
    env.gain.exponentialRampToValueAtTime(level,t+attack);
    env.gain.exponentialRampToValueAtTime(.0001,t+duration);
    stereo.pan.setValueAtTime(pan,t);stereo.pan.linearRampToValueAtTime(endPan,t+duration);
    (filter?source.connect(filter):source).connect(env).connect(stereo).connect(bus);
    source.onended=()=>{playing.delete(source);source.disconnect();filter?.disconnect();env.disconnect();stereo.disconnect();};
    playing.add(source);
    if(source.buffer)source.start(t,Math.random());else source.start(t);
    source.stop(t+duration+.015);
  }
  function rub(from,to,duration,level,attack=.006,delay=0,pan=0,endPan=pan,q=.8){
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),t=ctx.currentTime+delay;
    source.buffer=noise;source.loop=true;filter.type='bandpass';filter.Q.value=q;
    filter.frequency.setValueAtTime(from,t);filter.frequency.exponentialRampToValueAtTime(to,t+duration);
    layer(source,filter,duration,level,attack,delay,pan,endPan);
  }
  function resonator(hz,end,duration,level,delay=0,pan=0){
    const source=ctx.createOscillator(),t=ctx.currentTime+delay;
    source.frequency.setValueAtTime(hz,t);source.frequency.exponentialRampToValueAtTime(end,t+duration);
    layer(source,null,duration,level,.003,delay,pan);
  }
  function thump(hz,level,pan=0,delay=0){
    resonator(hz,hz*.48,.18,level*.72,delay,pan);
    rub(820,120,.14,level,.003,delay,pan);
  }
  function creak(level,duration){
    // The slipping axle grabs in short pulses over the scrape of the timber.
    rub(490,135,duration,level,.035);
    for(let i=0;i<6;i++){
      const f=220+115*Math.sin(i*.66)+Math.random()*35;
      rub(f*2.8,f,.08,level*.48,.009,i*duration/8,-.15,-.15,3);
    }
  }
  return {
    bowRelease(){
      rub(3100,680,.075,.36,.002,0,.3);
      for(const [hz,gain] of [[188,.24],[379,.13],[578,.07],[977,.045]])
        resonator(hz,hz*.88,.21,gain,0,.3);
    },
    arrowFlight(){rub(1350,4300,.38,.48,.29,0,.55,.05,2.1);rub(4200,760,.21,.45,.027,.31,.05,-.22,1.25);},
    arrowImpact(){thump(156,.59,-.12);rub(3300,550,.11,.55,.002,0,-.12);resonator(420,220,.105,.09,.018,-.12);},
    wood(){thump(203,.30);rub(2100,470,.11,.32);},
    wheel(){creak(.32,.48);thump(102,.18,-.2,.20);},
    footstep(){thump(111,.20);rub(1500,470,.15,.20,.012,.025);},
    knock(){thump(205,.30);thump(178,.17,0,.14);},
    gateStrain(){creak(.52,.71);thump(97,.25,.21,.31);},
    gateOpen(){creak(.65,.96);rub(250,80,1.08,.7,.14);thump(83,.56,.24,.82);},
    rattle(){rub(3400,840,.17,.25);resonator(720,711,.21,.10);resonator(1770,1740,.13,.045,.022);},
    record(){rub(1450,500,.10,.34);resonator(485,460,.16,.16);},
    setMuted(flag){master.gain.setTargetAtTime(flag?0:1,ctx.currentTime,.007);},
    reset(){for(const source of playing)source.stop();playing.clear();}
  };
}

export async function loadTroySound(ctx=new AudioContext()){
  const foley=createSounds({context:ctx}),battle=createBattleSounds({bearerCall:false});
  let recorded=true,muted=false;
  try{await battle.start(ctx);}catch(error){recorded=false;console.warn('Troy battle samples:',error);}
  const fallback={swing:'rattle',thrust:'rattle',strike:'wood',steel:'rattle',shield:'knock',
    hurt:'footstep',death:'wood',land:'footstep',horn:'knock'};
  function sample(name,options){
    if(recorded)battle.play(name,options);
    else foley[fallback[name]]?.();
  }
  function play(cue,{pan=0}={}){
    if(muted)return;
    switch(cue){
      case 'strike': sample('swing',{gain:.73});break;
      case 'enemySwing': sample('thrust',{gain:.5,pan,channel:'enemySwing'});break;
      case 'impact': sample('strike',{gain:.85,pan,delay:.05});break;
      case 'wounded':
        sample('strike',{gain:.92,pan,delay:.045});
        sample('hurt',{gain:.47,delay:.09});break;
      case 'shield': sample('shield',{gain:1,pan,delay:.05});break;
      case 'parry': sample('steel',{gain:.95,pan,delay:.05});break;
      case 'fall':
        sample('death',{gain:.59,pan,delay:.09});
        sample('land',{gain:.86,pan,delay:.30});break;
      case 'heroFall': sample('land',{gain:1.05,pan:-.12,pitch:.85});break;
      case 'arrowImpact':
        foley.arrowImpact();
        sample('strike',{gain:.58,pitch:.85,pan:-.12,delay:.012});break;
      case 'ranks':
        sample('steel',{distance:12,pan,local:false,gain:.95});
        sample('shield',{distance:19,pan:-pan,local:false,gain:.83,delay:.26+Math.random()*.15});
        if(Math.random()<.26)sample('hurt',{distance:23,pan:-pan,local:false,gain:.60,delay:.11});
        break;
      case 'advance': sample('horn',{distance:9,pan:-.36,gain:.85,pitch:.93});break;
      case 'muster': sample('horn',{gain:.70});break;
      default: foley[cue]?.();
    }
  }
  play.reset=()=>{battle.reset();foley.reset();};
  play.setMuted=flag=>{muted=flag;battle.mute(flag);foley.setMuted(flag);if(flag)play.reset();};
  return ()=>{
    if(ctx.state==='suspended'&&typeof ctx.startRendering!=='function')ctx.resume().catch(console.warn);
    return play;
  };
}
