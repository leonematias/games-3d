export const chapterNames = ['The broken road', 'The red shields', 'The field hospital', 'The siege of Vella', 'The south curtain'];
export const squadNames = ['Cassian', 'Felix', 'Sabina', 'Titus'];
export const sections = ['Western', 'Middle', 'Eastern'];
export const engine = {x:0, z:8}, quarry = {x:-7.1, z:10}, wallZ = -10;
export const sectionX = [-5.2, 0, 5.2];
export const saveKey = 'fifth-shield-road-v1';
export const gear = ['gladius', 'spear', 'sword'];
export function companionWeapon(name,upgraded){
  if(upgraded&&name==='Sabina')return 'spear';
  if(upgraded&&name==='Titus')return 'sword';
  return 'gladius';
}
export const moments = [
  {id:'sword', chapter:0, kind:'take', title:'Recover the gladius', x:0,z:109, action:'Take the gladius', line:'lost'},
  {id:'scouts', chapter:0, kind:'fight', title:'Get past the scouts', x:-2,z:102, count:2},
  {id:'patrol', chapter:0, kind:'fight', title:'Clear the charcoal track', x:-4,z:93, count:2, line:'tracks'},
  {id:'first', chapter:1, kind:'join', title:'Speak to the two Romans', x:-3,z:83, action:'Call to the Romans', line:'hail'},
  {id:'bend', chapter:1, kind:'fight', title:'Follow Cassian to the bend', x:2,z:75, count:3, line:'guide'},
  {id:'stones', chapter:1, kind:'fight', title:'Break the milestone ambush', x:4,z:66, count:4},
  {id:'second', chapter:1, kind:'join', title:'Reach the two outriders', x:3,z:58, action:'Bring the outriders into line', line:'two'},
  {id:'rackfight', chapter:1, kind:'fight', title:'Recover the baggage train', x:-1,z:52, count:4, line:'five'},
  {id:'weapons', chapter:1, kind:'take', title:'Salvage the weapons', x:-3,z:47, action:'Take spear and long sword', line:'rack'},
  {id:'rear', chapter:2, kind:'fight', title:'Defend the hospital track', x:0,z:41, count:5},
  {id:'doctor', chapter:2, kind:'heal', title:'Find the field doctor', x:4,z:36, action:'Have the unit treated', line:'doctor'},
  {id:'ridge', chapter:2, kind:'travel', title:'Climb to the ridge', x:2,z:30, line:'ridge'},
  {id:'reveal', chapter:3, kind:'film', title:'The siege of Vella', line:'fort'},
  {id:'ditch', chapter:3, kind:'fight', title:'Cross the outer ditch', x:0,z:24, count:4, line:'ditch'},
  {id:'flags', chapter:3, kind:'fight', title:'Fight to the red standard', x:-4,z:18, count:5},
  {id:'battery', chapter:3, kind:'fight', title:'Retake the battery', x:1,z:12, count:6, line:'battery'},
  {id:'claim', chapter:4, kind:'claim', title:'Claim the catapult', ...engine, action:'Claim the catapult', line:'engine'},
  {id:'breach', chapter:4, kind:'siege', title:'Open the south curtain', line:'stone'},
  {id:'march', chapter:4, kind:'film', title:'Through the breach', line:'march'},
  {id:'won', chapter:4, kind:'end', title:'Five at muster'}
];

export const dialogue = {
  lost:['You','The column left before dawn. My sword must be here by the wagon.'],
  tracks:['You','Fresh tracks. They doubled back along the charcoal road.'],
  hail:['Felix','Cassian, look! That shield is one of ours.'],
  guide:['Cassian','We heard the legion horn over the ridge. Stay with me.'],
  two:['Sabina','Felix? We counted you among the dead.'],
  five:['Titus','Five shields, then. Enough to get our baggage back.'],
  rack:['Cassian','There’s your pick of the baggage. Take a longer blade.'],
  doctor:['Doctor','Sit them here in the shade. Let me see those cuts.'],
  ridge:['Doctor','I can dress a wound. You can carry my greetings to the legion.'],
  fort:['You','There. The eagle, under the south wall. We found them.'],
  ditch:['Cassian','Our men are pinned at the ditch. The five of us can get across.'],
  battery:['Sabina','The battery crew has fallen back. We can reach their engine.'],
  engine:['Titus','I hauled stones for this crew. Give me a hand with the sling.'],
  stone:['Titus','Stones on the sled. Keep hitting the same stretch of wall.'],
  march:['Cassian','Through the gap! Make way for the eagle!'],
  home:['You','Cassian. Felix. Sabina. Titus. All five present.']
};
