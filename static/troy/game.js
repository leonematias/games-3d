import {launch} from '../field-narratives/runner.js';
import {chapters,sites,voices,parts} from './story.js';
import {initial,goal,prompt,interact,update,accept,status,supplies} from './campaign.js';
import {world} from './world.js';
import {loadTroySound} from './sounds.js';

const titleStyle=document.createElement('link');
titleStyle.rel='stylesheet';titleStyle.href='/games-3d/static/troy/troy.css';document.head.appendChild(titleStyle);
document.body.classList.add('troy');
document.querySelector('[data-key=shift]').textContent='Guard';
let startAudio;
async function prepareScene(){
 const [scene,start]=await Promise.all([world(),loadTroySound().catch(error=>console.warn('Troy audio:',error))]);
 startAudio=start;
 return scene;
}
function aftermath(s,st,api){
 accept(s,st);
 if(voices[st.id])api.say(...voices[st.id],st.id);
}
function drawMap(ctx,px,pz,scale,s){
 if(s.chapter===4){
   ctx.fillStyle='#9e8165';ctx.font='11px monospace';ctx.fillText('INSIDE THE HORSE',10,32);return;
 }
 ctx.fillStyle='#658990';ctx.fillRect(px(-85),pz(98),170*scale,45*scale);
 ctx.fillStyle='#ab9472';ctx.fillRect(px(-67),pz(-2),63*scale,3*scale);ctx.fillRect(px(4),pz(-2),63*scale,3*scale);
 if(s.chapter===3){
   for(const key of ['yard',...supplies(s).filter(key=>key!==s.carry)]){
     const [x,z]=sites[key];ctx.fillStyle=key==='yard'?'#fff5cf':'#dcaa6e';
     ctx.fillRect(px(x)-3,pz(z)-3,6,6);
     if(scale>1){ctx.font='10px monospace';ctx.fillText(key==='yard'?'Epeius':parts[key].name,px(x)+5,pz(z)-4);}
   }
 }
}
launch({
 id:'troy',title:'Troy',display:'Troy<em>The Hollow Horse</em>',place:'The Trojan War · A Greek epic',
 start:'Take the gangplank',intro:'Achilles has a beach to win. Odysseus will inherit a war that strength alone cannot end. Their paths meet beneath the walls of Troy.',
 controls:'↑/↓ walk · ←/→ turn · Space strike or perform the scene action · E interact · Shift guard · M map and journal',
 endLabel:'The muster · Dawn over Troy',endTitle:'The open gates',
 ending:s=>'Odysseus answers the muster. Beside him stands the horse that entered Troy on wheels from the carts, cedar from the shore and cloth from the ships. At the beach, one place by the fire belongs to Achilles. Your company fitted all '+s.fitted.length+' parts and opened the gate.',
 chapters,initial,goal,prompt,interact,update,accept:aftermath,world:prepareScene,sound:()=>startAudio?.(),status,
 alt:'Journal',act:'Space',mapSpan:220,center:[0,34],mapColors:['#362e26'],map:drawMap,
 track:s=>s.chapter===4?null:s.chapter===5?'hell-creek/afterlight':s.chapter===3?'voyager/island-morning':'eagle-ford/under-the-eagle',
 recover(s){s.hp=100;s.alarm=0;},
 key(k){if(k==='r')document.getElementById('mapBtn').click();},
 work(id,ui,done){const part=parts[id];ui.select(part.name,part.clue,part.options,i=>{
   if(i===part.answer)done();else ui.hint(part.role+' · '+part.retry);
 });}
});
