import {cue} from './receiver.js';
import {createEscort} from './escort.js';

export function createInvestigation(context){
  const {world,packs,dialogue,sounds,squad}=context;
  const {follow,cover,distanceTo}=createEscort(context);
  const beats=[
    {line:'relay_arrival'},
    {site:'relay',action:'Inspect the amber breaker beneath the repeater'},
    {line:'relay_inspect'},{line:'relay_reply'},
    {site:'trench',ambush:'trench',line:'trench_contact',action:'Follow the cable posts to the broken tray'},
    {site:'trench',action:'Examine the exposed cable'},
    {line:'trench_inspect'},{line:'trench_reply'},
    {site:'shelter',ambush:'shelter',line:'shelter_contact',action:'Follow the blue lamps to Shelter Two'},
    {site:'shelter',action:'Play the shift log beside the hatch'},
    {line:'shelter_log'},
    {knocks:'inside'},{site:'shelter',action:'Knock back on the hatch'},
    {knocks:'player'},{knocks:'answer'},{line:'shelter_reply'},
    {site:'shelter',action:'Pick up the hardline receiver'},
    {line:'hardline_call'},{line:'hardline_answer'},{line:'hardline_vale'},{line:'power_reason'}
  ];
  const knock=cue('knock');
  let index=0,fighting=false,elapsed=0,count=0;
  const beat=()=>beats[index];
  function enter(i){
    index=i;fighting=false;elapsed=0;count=0;
    if(beat()?.line&&!beat().site)dialogue.say(beat().line);
  }
  function near(b){return distanceTo(world.sites[b.site]);}
  function update(dt){
    dialogue.tick();squad[0].mixer.update(dt);
    const b=beat();
    if(!b)return;
    if(b.knocks){
      elapsed+=dt;
      if(count<3&&elapsed>=.6+count*.44){knock(context.state.muted);count++;}
      if(elapsed>3.5)enter(index+1);
      return;
    }
    if(fighting){
      const bug=packs[b.ambush].find(e=>e.hp>0);
      if(bug)cover(dt,bug);
      else if(dialogue.lineFinished())enter(index+1);
      return;
    }
    follow(dt);
    if(b.ambush && near(b)<14){
      fighting=true;
      for(const bug of packs[b.ambush])bug.active=bug.aware=bug.root.visible=true;
      sounds.growl();dialogue.say(b.line);
    }else if(!b.site && dialogue.lineFinished())enter(index+1);
  }
  function interact(){
    const b=beat();
    if(b?.site&&!b.ambush&&near(b)<4.5){
      world.sites[b.site].userData.lamp.material.color.setHex(0x87ffac);
      enter(index+1);
    }
  }
  return {squad,begin(){enter(0);},update,interact,pause:dialogue.pause,mute:dialogue.mute,
    get phase(){return !beat()?'complete':fighting?'fight':beat().line||beat().site;},
    get objective(){
      const b=beat();
      if(!b)return 'Contact restored.';
      if(fighting)return 'Protect Vale and clear the spiders.';
      if(b.knocks)return b.knocks==='player'?'You knock three times.':count?'Three knocks from inside the hatch.':'Listen at the hatch.';
      if(!b.site)return b.line.startsWith('hardline')||b.line==='shelter_log'?'Listen to the channel.':'Compare findings with Vale.';
      return b.action+(b.ambush?'.':near(b)<4.5?' · Press E': ' · '+Math.ceil(near(b))+' m');
    },
    get controlMode(){return fighting?'play':'interactive';},get weaponsFree(){return fighting;}
  };
}
