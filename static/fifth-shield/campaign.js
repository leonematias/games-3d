import {weapons} from '../eagle-ford/weapons.js';
import {moments,squadNames,engine,quarry,sectionX,wallZ,gear,companionWeapon} from './story.js';

const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const dressingTime=.78;
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const nearest=(a,others)=>others.reduce((best,b)=>b.hp>0&&(!best||distance(a,b)<distance(a,best))?b:best,null);
function actor(x,z,name,hp=100){
  return {x,z,name,hp,yaw:Math.PI,step:0,moving:false,swing:0,cool:0,fallen:0,wind:0,stagger:0};
}
function walk(a,p,speed,dt,stop=.15){
  const dx=p.x-a.x,dz=p.z-a.z,d=Math.hypot(dx,dz);
  if(d<=stop)return;
  const k=Math.min(speed*dt,d-stop)/d;
  a.x+=dx*k;a.z+=dz*k;a.yaw=Math.atan2(dx,dz);a.step+=k*d*4;a.moving=true;
}
function patrol(m){
  return Array.from({length:m.count},(_,i)=>{
    const side=i%2?1:-1,rank=Math.floor(i/2);
    const e=actor(m.x+side*(2.6+rank*.75),m.z-2-rank*1.3,'Gaul',m.chapter===0?48:60);
    e.variant=i%2;e.cool=.65+i*.2;e.yaw=-side*.48;return e;
  });
}
export class Campaign{
  constructor(saved){
    this.hero=actor(0,113,'You');this.allies=[];this.enemies=[];this.index=0;
    this.weapon=null;this.upgraded=false;this.hits=[0,0,0];this.aim=1;this.carried=false;
    if(saved){
      this.index=saved.index;Object.assign(this.hero,saved.hero);
      this.allies=saved.allies.map(a=>Object.assign(actor(a.x,a.z,a.name),a));
      this.weapon=saved.weapon;this.upgraded=saved.upgraded;this.hits=[...saved.hits];this.aim=saved.aim;
    }
    this.events=[];this.activeFight=false;this.time=0;this.filmTime=0;this.mounted=false;this.shot=null;
    if(saved&&this.moment.kind==='siege'){
      this.carried=saved.carried===true;
      this.mounted=this.carried&&saved.mounted===true;
    }
    this.patrols=new Map(moments.slice(this.index).filter(m=>m.kind==='fight').map(m=>[m.id,patrol(m)]));
    this.lost=false;this.guard=false;this.guardAge=0;this.counter=0;this.treatment=0;this.breachLane=this.hits.findIndex(h=>h===5);
  }
  get moment(){return moments[this.index];}
  get patient(){
    if(!this.treatment)return null;
    const index=Math.floor(this.treatment/dressingTime);
    return index===0?this.hero:this.allies[index-1]||null;
  }
  snapshot(){
    const copy=({name,x,z,hp,yaw})=>({name,x,z,hp,yaw});
    return {index:this.index,hero:copy(this.hero),allies:this.allies.map(copy),weapon:this.weapon,upgraded:this.upgraded,
      hits:[...this.hits],aim:this.aim,carried:this.carried,mounted:this.mounted};
  }
  advance(){
    this.index++;this.activeFight=false;this.filmTime=0;this.guard=false;
    this.events.push({type:'moment'},{type:'save'});
  }
  target(){
    if(this.moment.kind==='fight'&&this.activeFight)return nearest(this.hero,this.enemies)??this.moment;
    if(this.moment.kind==='siege')return this.mounted?{x:sectionX[this.aim],z:wallZ}:this.carried?engine:quarry;
    return this.moment;
  }
  interaction(){
    const m=this.moment;
    if(this.lost||this.shot||this.treatment||!this.target()||distance(this.hero,this.target())>2.6&&!this.mounted)return '';
    if(m.kind==='siege')return this.mounted?'Leave the engine':this.carried?'Load the sling and aim':'Pick up a stone';
    return m.action||'';
  }
  interact(){
    if(!this.interaction())return;
    const m=this.moment;
    this.events.push({type:'sound',cue:'pickup'});
    switch(m.kind){
      case 'take':
        if(m.id==='sword')this.weapon='gladius';else{
          this.weapon='spear';this.upgraded=true;
          this.events.push({type:'notice',text:'Sabina takes a spear · Titus draws a long sword'});
        }
        break;
      case 'join':
        for(let j=0;j<2;j++){
          const i=this.allies.length;this.allies.push(actor(m.x+(j?1:-1),m.z,squadNames[i],i===3?64:84));
        }
        break;
      case 'heal':
        this.treatment=.001;
        return;
      case 'siege':
        if(this.mounted)this.mounted=false;
        else if(this.carried){this.mounted=true;this.hero.yaw=Math.PI;}
        else this.carried=true;
        this.events.push({type:'save'});
        return;
    }
    this.advance();
  }
  equip(index){if(this.weapon&&(index===0||this.upgraded)&&gear[index])this.weapon=gear[index];}
  adjustAim(delta){
    if(!this.mounted||this.shot)return;
    const next=clamp(this.aim+delta,0,2);
    if(this.aim!==next){this.aim=next;this.events.push({type:'save'});}
  }
  fire(){
    if(!this.mounted||!this.carried||this.shot)return;
    this.shot={t:0,lane:this.aim};this.carried=false;
    this.events.push({type:'launch'});
  }
  spawn(){
    const m=this.moment;this.activeFight=true;
    this.enemies=this.patrols.get(m.id);this.patrols.delete(m.id);
    this.enemies.forEach((e,i)=>{
      e.opponent=i%(this.allies.length+1);
      e.yaw=Math.atan2(this.hero.x-e.x,this.hero.z-e.z);
    });
    this.events.push({type:'notice',text:m.chapter===3?'Defenders are moving in':'The patrol has spotted you'});
  }
  hit(source,target,damage,weapon=source===this.hero?this.weapon:'gladius'){
    const guarded=target===this.hero&&this.guard;
    if(guarded){
      const parry=this.guardAge<=.23;
      if(parry){
        source.stagger=.9;source.swing=0;source.cool=Math.max(source.cool,1);
        this.counter=.9;this.hero.cool=0;damage=0;
      }else damage=Math.max(1,Math.round(damage*.16));
      this.events.push({type:'defense',parry});
    }
    target.hp=Math.max(0,target.hp-damage);
    if(!guarded)this.events.push({type:'hit',x:target.x,z:target.z,fatal:!target.hp,
      local:source===this.hero||target===this.hero,playerStrike:source===this.hero,
      weapon,hurt:target===this.hero});
    if(target===this.hero&&!target.hp)this.lost=true;
  }
  attack(){
    const a=this.hero,w=weapons[this.weapon];
    if(!w||a.cool>0||this.guard||this.moment.kind!=='fight')return;
    a.swing=.48;a.cool=w.recovery;
    this.events.push({type:'sound',cue:'swing'});
    const opening=this.counter>0&&nearest(a,this.enemies.filter(e=>e.stagger>0&&distance(a,e)<=w.reach));
    const e=opening||nearest(a,this.enemies);
    if(e&&distance(a,e)<=w.reach){
      a.yaw=Math.atan2(e.x-a.x,e.z-a.z);
      const riposte=this.counter>0&&e.stagger>0;
      this.hit(a,e,w.damage+(riposte?18:0));
      if(riposte){this.counter=0;this.events.push({type:'riposte'});}
    }
  }
  fight(dt){
    const friends=[this.hero,...this.allies];
    for(const e of this.enemies){
      if(!e.hp)continue;
      const close=nearest(e,friends);if(!close)continue;
      const assigned=friends[e.opponent];
      const a=assigned?.hp>0&&distance(e,assigned)<=distance(e,close)+3.8?assigned:close;
      if(e.stagger>0)continue;
      // A raider commits to one opponent at the start of the tell. Moving clear
      // during the windup makes the blow miss, even if another Roman steps in.
      const heavy=e.variant===1,reach=heavy?2.65:2.3;
      if(e.wind>0){
        e.wind=Math.max(0,e.wind-dt);
        if(e.wind===0){
          e.swing=.26;
          const victim=e.victim;
          if(victim.hp>0&&distance(victim,e)<=reach){this.hit(e,victim,heavy?11:5,heavy?'axe':'gladius');if(this.lost)return;}
        }
      }else if(distance(e,a)>1.65)walk(e,a,heavy?2.15:2.65,dt,1.55);
      else if(e.cool<=0){
        e.victim=a;e.yaw=Math.atan2(a.x-e.x,a.z-e.z);
        e.wind=heavy?.78:.42;e.cool=heavy?2.4:1.65;
      }
    }
    for(const a of this.allies){
      if(!a.hp)continue;
      const e=nearest(a,this.enemies);if(!e)continue;
      const weapon=companionWeapon(a.name,this.upgraded),w=weapons[weapon];
      const reach=w.reach-.1;
      if(distance(a,e)>reach)walk(a,e,4,dt,reach-.1);
      else if(a.cool<=0){
        a.yaw=Math.atan2(e.x-a.x,e.z-a.z);a.swing=.48;a.cool=.75+w.recovery;
        this.hit(a,e,Math.round(w.damage*.44),weapon);
      }
    }
    // Give fighters room to surround a target instead of sharing one position.
    const line=[...friends,...this.enemies].filter(a=>a.hp>0);
    for(let i=0;i<line.length;i++)for(let j=i+1;j<line.length;j++){
      const a=line[i],b=line[j],dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
      if(d>=.86)continue;
      const k=Math.min(.86-d,dt*2)/(d||1);
      if(a!==this.hero){a.x-=dx*k;a.z-=dz*k;}b.x+=(dx||.01)*k;b.z+=dz*k;
    }
    if(this.enemies.every(e=>!e.hp)){
      this.hero.hp=Math.min(100,Math.max(38,this.hero.hp+5));
      for(const a of this.allies)if(!a.hp)a.hp=18;
      this.advance();
    }
  }
  follow(dt){
    const m=this.moment;
    for(const [i,a] of this.allies.entries()){
      let p={x:this.hero.x+(i%2?1:-1)*(1.5+Math.floor(i/2)*.85),z:this.hero.z+.85+Math.floor(i/2)*.75};
      if(this.treatment)p=a===this.patient?{x:4.45,z:37.45}:{x:2.7+(i%2)*1.35,z:38.7+Math.floor(i/2)*1.1};
      if(m.kind==='fight'&&i<2){
        const d=distance(this.hero,m)||1,k=Math.min(d,4)/d;
        p={x:this.hero.x+(m.x-this.hero.x)*k+(i?1:-1),z:this.hero.z+(m.z-this.hero.z)*k};
      }
      walk(a,p,5.5,dt,.35);
    }
  }
  tick(dt,keys){
    if(this.lost||this.moment.kind==='end')return;
    this.time+=dt;
    for(const a of [this.hero,...this.allies,...this.enemies]){
      a.moving=false;a.swing=Math.max(0,a.swing-dt);a.cool-=dt;a.stagger=Math.max(0,a.stagger-dt);if(!a.hp)a.fallen+=dt;
    }
    const m=this.moment;
    if(m.kind==='film'){
      this.filmTime+=dt;
      if(m.id==='reveal'&&this.filmTime>=6)this.advance();
      return;
    }
    if(this.shot){
      this.shot.t+=dt;
      if(this.shot.t>=1.35){
        const lane=this.shot.lane;this.shot=null;this.mounted=false;this.hits[lane]++;
        this.events.push({type:'impact',lane,count:this.hits[lane]});
        if(this.hits[lane]===5){this.breachLane=lane;this.advance();}
        else this.events.push({type:'save'});
      }
      return;
    }
    if(this.mounted)return;
    const h=this.hero;
    const wasGuarding=this.guard;
    this.guard=keys.has('Shift')&&!!this.weapon;
    this.guardAge=this.guard&&wasGuarding?this.guardAge+dt:0;
    this.counter=Math.max(0,this.counter-dt);
    let dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    let dz=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
    const len=Math.hypot(dx,dz);
    if(len){
      const speed=this.guard?2.3:this.carried?3.2:5.2;
      dx/=len;dz/=len;
      h.x=clamp(h.x+dx*speed*dt,-17,17);
      h.z=clamp(h.z+dz*speed*dt,Math.max(-5,(m.z??engine.z)-6),118);
      h.yaw=Math.atan2(dx,dz);h.moving=true;h.step+=speed*dt*4;
    }
    if(m.kind==='fight'&&!this.activeFight&&(distance(h,m)<6.4||this.patrols.get(m.id).some(e=>distance(h,e)<5)))this.spawn();
    if(keys.has(' '))this.attack();
    if(this.activeFight)this.fight(dt);else this.follow(dt);
    if(this.treatment){
      const patient=this.patient;
      this.treatment+=dt;
      if(patient&&patient!==this.patient)patient.hp=100;
      if(!this.patient){
        this.treatment=0;this.events.push({type:'notice',text:'All five are fit to march.'});this.advance();
      }
    }
    if(m.kind==='travel'&&distance(h,m)<2.4)this.advance();
  }
}
