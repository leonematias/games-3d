// Layered, bounded WebAudio one-shots. OfflineAudioContext compatible for measurement.
export function createSounds({context=null,ambient=1}={}) {
  let ctx=context,master,muted=false,wind,voice;
  function ensure(){
    if(master)return;ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain();master.gain.value=muted?0:.7;
    const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=8;limiter.ratio.value=8;limiter.attack.value=.002;limiter.release.value=.1;master.connect(limiter);limiter.connect(ctx.destination);
    if(ambient){const data=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),d=data.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*.2;wind=ctx.createBufferSource();wind.buffer=data;wind.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=330;const g=ctx.createGain();g.gain.value=.12;wind.connect(filter);filter.connect(g);g.connect(master);wind.start();}
  }
  function noise(seconds,level,frequency,type='lowpass',delay=0,pan=0){ensure();const n=Math.ceil(ctx.sampleRate*seconds),buf=ctx.createBuffer(1,n,ctx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<n;i++)data[i]=Math.random()*2-1;const source=ctx.createBufferSource();source.buffer=buf;const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;const gain=ctx.createGain(),panner=ctx.createStereoPanner();panner.pan.value=pan;const t=ctx.currentTime+delay;gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(level,t+.002);gain.gain.exponentialRampToValueAtTime(.0001,t+seconds);source.connect(filter);filter.connect(gain);gain.connect(panner);panner.connect(master);source.start(t);source.stop(t+seconds+.01);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();};}
  function tone(freq,to,seconds,level,delay=0,pan=0){ensure();const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+delay;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(to,t+seconds);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(level,t+.003);g.gain.exponentialRampToValueAtTime(.0001,t+seconds);const stereo=ctx.createStereoPanner();stereo.pan.value=pan;o.connect(g);g.connect(stereo);stereo.connect(master);o.start(t);o.stop(t+seconds+.01);o.onended=()=>{o.disconnect();g.disconnect();stereo.disconnect();};}
  return {
    unlock(){ensure();if(ctx.state==='suspended')ctx.resume();},
    setMuted(flag){muted=flag;if(flag&&voice){window.speechSynthesis?.cancel();voice=null;}if(master)master.gain.setTargetAtTime(flag?0:.7,ctx.currentTime,.03);},
    coverCall(side){
      noise(.09,.45,2300,'bandpass');noise(.06,.4,1900,'bandpass',.11);
      if(muted||!window.speechSynthesis||window.speechSynthesis.speaking)return;
      voice=new SpeechSynthesisUtterance(side+' wall dry. Cover me.');voice.rate=1.18;voice.volume=.65;
      window.speechSynthesis.speak(voice);
    },
    vaultAlarm(){tone(855,855,.17,.29);tone(560,560,.28,.32,.19);},
    engine(gain,pan){noise(.85,gain,490,'lowpass',0,pan);tone(68,60,.87,gain*.48,0,pan);},
    plasmaWhistle(u,pan){tone(480+u*520,590+u*650,.32,.09+u*.07,0,pan);},
    turretGun(volume=.5,pan=0){
      noise(.045,.94*volume,6800,'highpass',0,pan);noise(.15,.84*volume,1300,'lowpass',.009,pan);
      tone(118,38,.14,.66*volume);noise(.055,.41*volume,3200,'bandpass',.045,pan);noise(.24,.23*volume,780,'lowpass',.085,pan*.55);
    },
    turretFlame(volume=.5,pan=0){
      noise(.08,.62*volume,3700,'bandpass',0,pan);noise(.38,1.15*volume,720,'lowpass',.01,pan);
      noise(.29,.58*volume,1950,'bandpass',.045,pan);tone(80,52,.3,.19*volume);
    },
    shotgun(){noise(.22,.78,2400);tone(100,34,.27,.55);noise(.1,.32,1800,'bandpass',.32);},
    shot(){noise(.065,.75,6200,'highpass');noise(.17,.65,1400);tone(145,46,.14,.5);noise(.028,.25,3200,'bandpass',.045,.25);noise(.27,.16,1300,'lowpass',.09,-.5);noise(.32,.09,900,'lowpass',.18,.5);},
    flame(){noise(.19,.5,950);noise(.12,.16,3500,'bandpass');tone(72,48,.13,.12);},
    spit(){noise(.35,.5,650);tone(230,62,.25,.22);},
    civilianCry(distance=12){
      ensure();
      const t=ctx.currentTime,voice=ctx.createOscillator(),gain=ctx.createGain(),pitch=325+Math.random()*120;
      voice.type='sawtooth';voice.frequency.setValueAtTime(pitch,t);voice.frequency.exponentialRampToValueAtTime(pitch*1.45,t+.13);voice.frequency.exponentialRampToValueAtTime(pitch*.72,t+.67);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.25/(1+distance*.07),t+.085);gain.gain.exponentialRampToValueAtTime(.0001,t+.7);
      const filters=[840,1740].map(hz=>{const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=hz;f.Q.value=4;voice.connect(f);f.connect(gain);return f;});
      gain.connect(master);voice.start();voice.stop(t+.71);voice.onended=()=>{voice.disconnect();filters.forEach(f=>f.disconnect());gain.disconnect();};
    },
    floodSurge(){noise(3.6,.64,1900);noise(4.8,.52,520,'lowpass',.55);tone(75,32,3,.13,.3);noise(2.1,.32,870,'bandpass',3.2);},
    siren(){tone(330,660,.65,.15);tone(660,330,.65,.12,.65);},
    grenade(){tone(170,38,.25,.65);noise(.19,.55,650);noise(.06,.3,2400,'bandpass');},
    explosion(){tone(76,22,.85,.8);noise(.22,.8,4200);noise(1.2,.75,650);noise(.8,.25,1200,'lowpass',.16,-.5);noise(1,.18,700,'lowpass',.3,.5);},
    reload(){noise(.12,.3,1800,'bandpass');noise(.09,.35,2400,'highpass',.65);noise(.12,.35,1200,'bandpass',1.35);tone(180,60,.09,.13,1.4);},
    impact(){noise(.16,.48,850);noise(.05,.25,2400,'bandpass');tone(190,45,.1,.22);},
    hurt(){noise(.26,.5,450);tone(85,32,.3,.35);},
    growl(){noise(.7,.3,320,'bandpass');tone(92,48,.5,.12);tone(138,75,.55,.06);},
    step(){noise(.12,.22,1400);tone(100,40,.07,.08);},
    pickup(){tone(587,587,.32,.1);tone(880,880,.4,.06,.07);noise(.17,.13,2100,'bandpass');},
    empty(){noise(.04,.55,2600,'bandpass');},
    death(){noise(.6,.45,600);tone(100,25,.5,.25);},
  };
}
