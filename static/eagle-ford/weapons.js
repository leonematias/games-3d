// Slot order is also the keyboard loadout order.
export const weapons = {
  gladius: {name:'Gladius', note:'Balanced thrust', damage:30, reach:2.25, recovery:.50, swing:.38, stamina:6},
  dagger:  {name:'Dagger', note:'Quick, low stamina', damage:18, reach:2.1, recovery:.28, swing:.24, stamina:3},
  sword:   {name:'Long sword', note:'Longer slashing reach', damage:35, reach:2.85, recovery:.65, swing:.50, stamina:8},
  axe:     {name:'War axe', note:'Heavy, slow blow', damage:54, reach:2.4, recovery:1.04, swing:.78, stamina:13},
  spear:   {name:'Spear', note:'Longest reach', damage:39, reach:3.6, recovery:.76, swing:.59, stamina:8}
};
export const weaponSlots=Object.keys(weapons);
