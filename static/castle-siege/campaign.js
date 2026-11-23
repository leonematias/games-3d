// Ring positions run from the camp toward the banner. Each forward battery
// faces its own breach, so later courtyards can be fought from inside.
export const missions=[
  {name:'The Split Keep', color:0x993b37, gallery:-6.7, flagX:0, rings:[
    {name:'Inner curtain',z:-15,x:0,width:12,height:5.5,seed:346}
  ]},
  {name:'Briarwatch',color:0x325944,gallery:6.7,flagX:6,landmark:"orchard",
    brief:'Four walls guard the green banner. Breach the orchard curtain, then take the courtyard engines. The narrow limekiln gate is on the right. The last battery faces west across the abbey yard.',
    rings:[
      {name:'Orchard curtain',z:-13,x:-3,width:12,height:4.7,seed:418},
      {name:'Limekiln gate',z:-28,x:5,width:8,height:5.6,seed:527,postern:-6,battery:[4,-20],archer:-8},
      {name:'Abbey ward',z:-44,x:-4,width:10,height:6.3,seed:643,battery:[-4,-36],sentry:7}
    ]},
  {name:'Crown of Ash',color:0x473d70,gallery:-7.0,flagX:-7,landmark:"foundry",
    brief:'Five walls seal the violet citadel. Fight east through the foundry, swing west at the arsenal, then cross the bell court. Use the captured batteries or bring your ram all the way to the crown gate.',
    rings:[
      {name:'Foundry wall',z:-16,x:4,width:10,height:5.2,seed:715},
      {name:'Arsenal ward',z:-32,x:-5,width:8,height:6,seed:819,battery:[-4,-24],sentry:7},
      {name:'Bell court',z:-48,x:5,width:9,height:5.8,seed:934,postern:-6,battery:[4,-40],archer:-7},
      {name:'Crown gate',z:-64,x:-3,width:8,height:7,seed:1042,battery:[-3,-56],sentry:8,archer:-9}
    ]}
];
const requested=Number(new URLSearchParams(location.search).get('level'));
export const level=Number.isInteger(requested)&&requested>=1&&requested<=missions.length?requested:1;
export const mission=missions[level-1];
export const lastRing=mission.rings[mission.rings.length-1];
