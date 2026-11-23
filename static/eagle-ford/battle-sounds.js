// The whole cast shares one decoded sample bank and a bounded effects bus.
export function createBattleSounds(){
  let ctx, bus, output, bank, call, takes, loading, muted=false;
  const playing=new Set(), previous=new Map(), last=new Map();

  async function load(context){
    ctx=context;
    bus=ctx.createDynamicsCompressor();
    bus.threshold.value=-15;bus.knee.value=10;bus.ratio.value=4;
    output=ctx.createGain();output.gain.value=muted?0:.78;
    bus.connect(output).connect(ctx.destination);
    const root='/games-3d/static/eagle-ford/audio/battle-bank.';
    const [index,wav]=await Promise.all(['json','wav'].map(async ext=>{
      const response=await fetch(root+ext);
      if(!response.ok)throw Error('Could not load battle audio '+ext);
      return ext==='json'?response.json():ctx.decodeAudioData(await response.arrayBuffer());
    }));
    takes=index;bank=wav;
    const response=await fetch('/games-3d/static/eagle-ford/audio/bearer-call.wav');
    if(response.ok)call=await ctx.decodeAudioData(await response.arrayBuffer());
  }
  function play(kind,{distance=0,pan=0,gain=1,delay=0,pitch=1,local=true,channel=kind}={}){
    if(!bank||muted||distance>38)return;
    const voice=kind==='death'||kind==='hurt';
    if(playing.size>=(local?16:11))return;
    if(voice&&[...playing].filter(v=>v.voice).length>=(local&&kind==='death'?3:2))return;
    const group=voice?'voice':channel;
    const key=group+(local?'Near':'Field'),now=ctx.currentTime;
    const gap=voice?(kind==='death'&&local?.08:.33):(local?.045:.12);
    if(now-(last.get(key)??-Infinity)<gap)return;
    last.set(key,now);
    const variants=kind==='help'?[[0,call.duration]]:takes[kind],prior=previous.get(kind);
    const i=prior===undefined?Math.floor(Math.random()*variants.length):
      (prior+1+Math.floor(Math.random()*Math.max(1,variants.length-1)))%variants.length;
    previous.set(kind,i);
    const [offset,duration]=variants[i],source=ctx.createBufferSource();
    const filter=ctx.createBiquadFilter(),level=ctx.createGain(),stereo=ctx.createStereoPanner();
    source.buffer=kind==='help'?call:bank;source.playbackRate.value=pitch*(.97+Math.random()*.06);
    filter.type='lowpass';filter.frequency.value=11000/(1+distance*.073);filter.Q.value=.55;
    level.gain.value=gain/(1+.12*distance);stereo.pan.value=pan;
    source.connect(filter).connect(level).connect(stereo).connect(bus);
    const entry={source,voice};playing.add(entry);
    source.onended=()=>{playing.delete(entry);for(const node of [source,filter,level,stereo])node.disconnect();};
    source.start(now+delay,offset,duration);
  }
  return {
    start(context){return loading??=load(context).catch(err=>{loading=null;throw err;});},
    reset(){for(const {source} of playing)source.stop();playing.clear();last.clear();},
    mute(flag){muted=flag;if(output)output.gain.setTargetAtTime(flag?0:.78,ctx.currentTime,.012);},
    cue(event,weapon){
      if(event==='swing'||event==='throw'){
        const thrust=event==='throw'||['spear','gladius','dagger'].includes(weapon);
        play(thrust?'thrust':'swing',{gain:.65,pitch:weapon==='axe'?.82:weapon==='dagger'?1.14:1});
      }else if(event==='engage'){
        play('horn',{channel:'advanceCall',gain:.9,pan:-.32,pitch:.89});
        play('horn',{channel:'answerCall',gain:.65,pan:.48,delay:.84,pitch:1.12});
      }else if(event==='help')play(call?'help':'hurt',{pan:.55,gain:.85});
      else if(event==='block')play('shield');
      else if(event==='horn'||event==='pickup')play(event,{gain:.69});
    },
    hit(e,hero,yaw){
      const dx=e.x-hero.x,dz=e.z-hero.z,distance=Math.hypot(dx,dz);
      const where={distance,pan:Math.max(-.92,Math.min(.92,(-Math.cos(yaw)*dx+Math.sin(yaw)*dz)/9)),local:e.local};
      const metal=!e.fatal&&e.weapon!=='axe'&&Math.random()<.44;
      play(metal?'steel':'strike',{...where,gain:metal?.83:1});
      if(e.fatal){
        play('death',{...where,gain:.88,delay:.045});
        play('land',{...where,gain:.81,delay:.28+Math.random()*.12});
      }else if(Math.random()<(e.local?.48:.24))play('hurt',{...where,gain:.67,delay:.03});
    }
  };
}
