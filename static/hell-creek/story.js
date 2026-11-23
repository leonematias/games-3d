export const channel=z=>54*Math.sin(z/155)+24*Math.cos(z/73);
// Seconds between alternating footfalls on the rex's two-step gait cycle.
export const stepInterval=speed=>Math.max(.33,Math.min(.85,4.5/Math.abs(speed)));
const ford=z=>[channel(z)-10,z];
export const sites={
  nest:[-320,610],drink:ford(460),tracks:[-158,365],calf:[-365,185],cross:ford(60),
  browse:[345,205],ankylosaur:[560,5],scrape:[390,-240],horns:[250,-475],
  north:ford(-550),rival:[-375,-475],rest:[-570,-145],bank:[-245,170],
  split:[-70,395],shelf:[-395,485],island:[channel(550)+4,550],
  snag:[-120,690],pass:[-490,245],hollow:[-590,15],ridge:[-480,-280],shelter:[-695,-440]
};
const beat=(at,type,title,hint,verb,entry,extra={})=>({at,type,title,hint,verb,entry,...extra});
export const chapters=[
 {name:'The drinking bank',speaker:'Narrator',line:'First light reaches the oxbow. At the water’s edge, a small set of tracks breaks away from the herd.',scene:'First light · Floodplain',steps:[
  beat('drink','drink','Drink at the oxbow','Follow the water through the cypress. Lower your head at the muddy edge.','Drink','Water at the oxbow'),
  beat('tracks','track','Find the split trail','Beyond the river bend, three-toed foreprints and broad hindprints cut the bank. Read their direction.','Read the trail','A small animal trails the herd'),
  beat('calf','hunt','Hunt the straggler','Approach the young Triceratops. C toggles stalking. Sprint with Shift to close the gap, then face it and bite with Space.','','First hunt',{animal:'calf'}),
  beat('calf','feed','Feed at the kill','Return to the downed animal. Feeding restores body condition and stamina.','Feed','Fed at the western clearing',{animal:'calf'})]},
 {name:'Under the armour',speaker:'Narrator',line:'Across the gravel bar, fern stems lie crushed in a broad swath. Something heavy passed this way.',scene:'Morning · East bank',steps:[
  beat('cross','drink','Cross at the gravel bar','Sand lies just beneath the surface here. Drink before you leave the open bank.','Drink at the ford','Gravel ford'),
  beat('browse','track','Investigate the broken fronds','Look for the broad trail between the low plants. Examine the marks to locate the animal.','Inspect the fronds','Club drag in the mud'),
  beat('ankylosaur','duel','Face the club-tailed grazer','An injured Ankylosaurus guards its flank. Step away when the tail rises, then bite after the swing.','','Armoured quarry',{animal:'armour'}),
  beat('ankylosaur','feed','Return to the meal','Lower your head to feed. Listen for animals on the other side of the stand.','Feed','Fed at the fern stand',{animal:'armour'})]},
 {name:'A wall of horns',speaker:'Narrator',line:'The bark hangs in strips. Beyond the trees, the herd has turned to face the clearing.',scene:'Midday · Fern prairie',steps:[
  beat('scrape','track','Follow the scraped earth','A herd has rubbed the bark off a tree. Read the scrape at the edge of the clearing.','Examine the scrape','Horn marks at shoulder height'),
  beat('horns','horn','Pass the guarding adult','The adult braces when you approach. Roar with R inside 22 m to draw its charge. Move aside, or take the long way behind its back.','','Passed the herd',{animal:'guard'}),
  beat('north','drink','Find the northern shallows','Follow the animal paths back to the river. Enter the reeds and drink.','Drink','Northern shallows')]},
 {name:'Another mouth',speaker:'Narrator',line:'Flies lift from a carcass on the west bank. Another tyrannosaur is already there.',scene:'Afternoon · West bank',steps:[
  beat('rival','rival','Meet the rival at the carcass','A larger rex is feeding. Stand your ground and roar, or approach carefully and yield the meal.','Yield the carcass','Rival on the west bank',{animal:'rival'}),
  beat('rest','rest','Settle beneath the conifers','The bank is quiet here. Find the open space beneath the old trees.','Settle down','Rested under conifers')]},
 {name:'The far coast',speaker:'Narrator',line:'Far to the south, an asteroid strikes the coast. Here at the old drinking bank, whole branches are turning in the current.',duration:9,scene:'Cutaway · Yucatán, far to the south',steps:[
  beat('bank','track','Find the old drinking bank','The ground moves. A familiar route leads back to the water. Look at what the current is carrying.','Test the bank','The water has left its channel'),
  beat('split','route','Choose a way through','The low trail is filling. The wooded shelf is longer and sheltered. The gravel island offers a shorter crossing.','Choose your route','Chose a crossing'),
  beat('shelf','crossing','Get past the rising water','Follow your chosen route. Watch the floating timber. Slow down and let it pass before crossing.','Reach solid ground','Cleared the crossing')]},
 {name:'Through the dust',speaker:'Narrator',line:'Dust settles in the folds of the ferns. From somewhere behind the trees comes the sound of a herd running.',scene:'Late light · Floodplain',steps:[
  beat('snag','track','Read the fallen trunk','The living scatter in the same direction. Inspect the uprooted tree for a path between its roots.','Pass the roots','Followed the exposed roots'),
  beat('pass','escape','Move through the running herd','Animals are breaking from cover. Keep moving toward the gap. Give stampeding animals room.','Enter the gap','Escaped the stampede'),
  beat('hollow','drink','Find water below the silt','Fresh water seeps from under a sheltered ledge. Drink before the climb.','Drink at the seep','Water below the silt')]},
 {name:'High ground',speaker:'Narrator',line:'There is still water moving in the dark below. Up on the ridge, a shelf of rock breaks the wind.',scene:'Nightfall · Upland',steps:[
  beat('ridge','track','Climb above the channel','Follow the ridge as the light fades. Read the wind from the bank above the trees.','Scent the air','Reached the ridge'),
  beat('shelter','rest','Shelter through the first night','A hollow at the foot of the rock face breaks the wind. Step inside.','Take shelter','Shelter on the high bank')]}
];
export const tracks={
 tracks:['Two trails climb out of the mud. One set of small prints wanders away from the broad herd trail.','Follow the small prints','Follow the deep central rut',0],
 browse:['The lowest fronds are stripped. A blunt groove sweeps through the mud beside four-toed prints.','Look high in the canopy','Follow the low sweeping groove',1],
 scrape:['Bark is scored in pairs. Heavy feet have pivoted beside the trunk and moved north.','Follow the paired gouges','Follow the water line',0],
 bank:['Foam and torn branches lie above the old bank. A new current cuts across yesterday’s path.','Step into the fast channel','Follow the high debris line',1],
 snag:['The trunk lies across the path. Its roots have lifted a dry lip above the water.','Climb around the root plate','Push through the submerged crown',0],
 ridge:['Dust streams along the crest. On the far side of the stone, the ferns barely move.','Take the exposed crest','Follow the still ferns',1]
};

export function logPosition(t){const z=sites.island[1]-14+Math.sin(t*.4)*10;return [channel(z)+Math.sin(t*.29)*15,z];}
