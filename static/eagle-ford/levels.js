const site=(name,x,z)=>({name,x,z});
export const levels={
  ford:{
    title:'The Eagle at the Ford',seed:5371,goal:'captain',eagle:{x:0,z:-51},
    brief:'Start alone on the southern road. Rescue the scattered Romans, take command of the legion, and reclaim its eagle beyond the ford.',
    road:[site('The broken road',0,44),site('The abandoned camp',-6,25),site('The ford',5,1),site('The northern ridge',0,-20)],
    fights:['Duel the axeman','Help the two Romans','Relieve the five defenders','Lead the charge to the eagle'],
    enemies:[2,3,6],turf:'grass_dry',soil:'ground_dirt',fog:0xc7b39a
  },
  pines:{
    title:'Ambush in the Black Pines',seed:6107,goal:'ambush',eagle:{x:12,z:-50},
    brief:'Rescue a stranded standard-bearer east of the woodcutters’ camp. Leaving troops on the road protects your healing supplies. Rally the lost patrols, then break three ambushes by defeating their leaders on the way to the timber camp.',
    road:[site('The charcoal trail',0,44),site('The eastern clearing',12,24),site('The woodcutters’ camp',-11,1),site('The timber road',0,-19)],
    fights:['Drive off the scouts','Rescue the patrol','Break the clearing ambush','Defeat the ambush leaders'],
    enemies:[2,4,5],turf:'ground_mossy',soil:'ground_forest',fog:0x889e94
  },
  pass:{
    title:'The White Pass',seed:1853,goal:'guards',eagle:{x:0,z:-52},
    brief:'Choose a watchpost from the saddle. The west holds four Roman prisoners. The eastern signal calls reinforcements until its captain falls.',
    road:[site('The snow line',0,44),site('The western shelf',-11,23),site('The cairn',9,0),site('The saddle',0,-20)],
    fights:['Clear the snow line','Free the shelf patrol','Relieve the cairn guard','Defeat both hill captains'],
    enemies:[2,3,7],turf:'snow_clean',soil:'rock_grey',fog:0xc5d3dc
  },
  quarry:{
    title:'The Red Quarry',seed:8121,goal:'hold',eagle:{x:-6,z:-42},
    brief:'March down the terraced quarry and relieve its work parties. Plant your squad banner at the gate with F. You or your squad can hold the ring for twelve seconds while raiders counterattack from the east.',
    road:[site('The wagon track',0,44),site('The stone yard',11,25),site('The lower terrace',-12,1),site('The quarry gate',0,-18)],
    fights:['Clear the wagon track','Rescue the stone cutters','Relieve the lower terrace','Hold the gate standard'],
    enemies:[2,4,6],turf:'sand_dunes',soil:'rock_red',fog:0xc9a885
  },
  stockade:{
    title:'The Cinder Stockade',seed:8723,goal:'stockade',eagle:{x:4,z:-48},
    brief:'Lead the legion through three timber wards. Light a torch at each fire pit, burn the marked gate, and fight alongside the Romans who pour through the breach.',
    road:[site('Loggers’ yard',0,29),site('Shield yard',-7,3),site('Command enclosure',7,-23),site('The command hall',4,-48)],
    pits:[site('Campfire',-7,48),site('Charcoal pit',9,18),site('Barracks hearth',-12,-9)],
    fights:['Take the loggers’ yard','Capture the shield yard','Storm the command enclosure','Recover the eagle'],
    turf:'ground_forest',soil:'ground_dirt',fog:0xa59d86
  },
  siege:{
    title:'Siege of the Three Gates',seed:3817,goal:'siege',eagle:{x:0,z:-48},
    brief:'Light a torch at the campfire and burn the timber palisade. Push a trebuchet with at least two Romans. Smash a passage through three curtains of stone, lead the legion into each ward, and reclaim the eagle in the keep.',
    road:[site('Outer curtain',0,24),site('Barracks wall',-3,0),site('Keep wall',3,-24),site('The keep',0,-48)],
    fights:['Breach the outer curtain','Take the barracks ward','Storm the keep wall','Claim the eagle'],
    turf:'grass_dry',soil:'gravel_ground',fog:0xb7b6a9
  }
};
const requested=new URLSearchParams(globalThis.location?.search).get('level');
export const levelId=Object.hasOwn(levels,requested)?requested:'ford';
export const level=levels[levelId];
