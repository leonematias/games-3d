// Objectives can advance while the cast speaks. Keep captions and playback in one queue.
import {dialogue} from './story.js';

export function createDialogue(caption, onSpeaking){
  const pending=[];
  let active=null,paused=false,muted=false;
  function begin(){
    if(paused||active||!pending.length)return;
    const id=pending.shift(),[speaker,text]=dialogue[id];
    const clip=new Audio('/games-3d/static/fifth-shield/audio/'+id+'.mp3');
    const line={speaker,clip,cursor:0,idle:0,readTime:Math.max(3,text.split(/\s+/).length*.36)};
    active=line;
    caption.querySelector('b').textContent=speaker;
    caption.querySelector('span').textContent=text;
    caption.hidden=false;
    clip.volume=.87;clip.muted=muted;
    clip.onended=()=>{if(active===line)finish();};
    onSpeaking(true);
    clip.play().catch(()=>{}); // The caption clock covers blocked or missing media.
  }
  function finish(){
    if(active){active.clip.onended=null;active.clip.pause();active=null;}
    caption.hidden=true;
    if(pending.length&&!paused)begin();else onSpeaking(false);
  }
  return {
    say(id){if(id){pending.push(id);begin();}},
    clear(){pending.length=0;finish();},
    pause(flag){
      paused=flag;
      if(!active){if(!flag)begin();return;}
      caption.hidden=flag;
      if(flag)active.clip.pause();else active.clip.play().catch(()=>{});
    },
    mute(flag){muted=flag;if(active)active.clip.muted=flag;},
    tick(dt){
      if(!active||paused)return;
      const line=active,position=line.clip.currentTime;
      if(position>line.cursor+.025){line.cursor=position;line.idle=0;}
      else if((line.idle+=dt)>=line.readTime)finish();
    },
    get busy(){return !!active||pending.length>0;},
    get speaker(){return active?.speaker;}
  };
}
