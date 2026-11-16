import { allRecords, clearedIds } from './progress.js';
const records=allRecords(), cleared=clearedIds();let hand='right';
try{hand=localStorage.getItem('nuclear-tank-mobile-hand')||'right';}catch{}
const handButton=document.getElementById('menuHand');
function renderHand(){handButton.textContent=`${hand==='left'?'Left':'Right'} hand`;}
handButton.addEventListener('click',()=>{hand=hand==='right'?'left':'right';try{localStorage.setItem('nuclear-tank-mobile-hand',hand);}catch{}renderHand();});renderHand();
try{
 const levels=await fetch('./levels/catalog.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();});
 const next=levels.find(l=>!cleared.has(l.id))||levels[0];let chapter='';
 const stars=levels.reduce((sum,l)=>sum+(records[l.id]?.stars||0),0), completed=levels.filter(l=>cleared.has(l.id)).length;
 document.getElementById('campaignProgress').textContent=`${completed} / 10 secured · ${stars} / 30 stars`;
 const start=document.getElementById('continueMission');start.href=`./game.html?level=${next.id}`;start.textContent=completed===10?'Campaign complete · play again →':`${completed?'Continue':'Start'} · ${next.name} →`;
 for(const [i,level] of levels.entries()){
   if(chapter!==level.chapter){chapter=level.chapter;const h=document.createElement('h3');h.className='chapter';h.textContent=chapter;document.getElementById('missionList').append(h);}
   const row=document.createElement('a');row.className=`mission${next.id===level.id?' current':''}`;row.href=`./game.html?level=${level.id}`;
   row.innerHTML=`<span class="mission-number">${String(i+1).padStart(2,'0')}</span><span class="mission-text"><span class="mission-title"></span><span class="mission-brief"></span></span><span class="mission-stars">${records[level.id]?'★'.repeat(records[level.id].stars)+'☆'.repeat(3-records[level.id].stars):'↗'}</span>`;
   row.querySelector('.mission-title').textContent=level.name;row.querySelector('.mission-brief').textContent=level.brief;document.getElementById('missionList').append(row);
 }
}catch{document.getElementById('missionList').textContent='Missions could not load. Refresh to try again.';}
if('serviceWorker' in navigator && ['http:','https:'].includes(location.protocol)){
 navigator.serviceWorker.register('./sw.js').then(async registration=>{
   const worker=registration.installing||registration.waiting||registration.active;
   const ready=()=>{if(registration.active)document.getElementById('offlineStatus').textContent='OFFLINE READY';};ready();worker?.addEventListener('statechange',ready);
 }).catch(()=>{});
}
