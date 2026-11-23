// X points east. The beach is south of the city, with the wall on z = 0.
export const sites={
  deck:[0,114], sand:[0,91], breakers:[-7,84], standard:[12,68], road:[0,48],
  cairn:[4,25], duel:[0,13], arrow:[1,8], yard:[-17,66],
  timber:[-43,46], wheels:[37,57], sail:[24,96], belly:[0,0],
  courtyard:[15,-29], arcade:[9,-19], lamp:[-2,-13], bar:[0,-4],
  threshold:[0,5], square:[0,-25], standardHill:[-5,-46]
};
export const parts={
  timber:{name:'cedar ribs',role:'Shipwright',clue:'The curved pieces were saved from a split hull. Which pile already follows the shape of the horse?',options:['Straight oars','Curved timbers','Mast wedges'],answer:1},
  wheels:{name:'wagon wheels',role:'Carter',clue:'A split hub creaks even under an empty cart. Which pair turns evenly?',options:['The matched pair with sound hubs','The wheel with the chipped rim','Two wheels of different sizes'],answer:0},
  sail:{name:'sailcloth',role:'Sailmaker',clue:'Epeius needs something soft between the hatch and its frame. What can the ship spare?',options:['A bronze fitting','A wooden peg','Folded sailcloth'],answer:2}
};
const beat=(id,at,title,hint,verb='',entry=title)=>({id,at,title,hint,verb,entry});
export const chapters=[
 {name:'The black ships',scene:'First summer · Achilles',speaker:'Achilles',line:'There is sand beneath the bow. Down the plank, Myrmidons. Stay where I can see your shields.',steps:[
  beat('land','sand','Take Achilles down the gangplank','Walk forward from the deck. Meet the first Greek standard on the beach.','Plant the landing standard'),
  beat('surf','breakers','Fight at the waterline','Follow the bronze marker to the warriors. Hold Space to strike nearby opponents. Hold Shift to guard.'),
  beat('banner','standard','Recover the blue standard','Another band has reached the beached ships. Reach the fallen banner and defeat the warriors around it.'),
  beat('rise','road','Break through the last beach guard','Clear the rise above the surf so the rest of the ships can land.')]},
 {name:'The prince outside the walls',scene:'Years later · Achilles',speaker:'Achilles',line:'Once we measured this war in lengths of beach. Now Patroclus is gone, and Hector is waiting outside his own gate.',steps:[
  beat('patroclus','cairn','Visit the cairn of Patroclus','Walk to the stones beneath the road to Troy.','Leave a remembrance'),
  beat('challenge','duel','Answer Hector','The prince waits alone below the ochre walls. Approach the red crest.','Answer the challenge'),
  beat('hector','duel','Duel Hector','Hector lifts his shield before his attack. Guard through the blow, then strike during his recovery.')]},
 {name:'An arrow from the wall',scene:'Later in the war · Achilles',speaker:'Odysseus',line:'Hector is dead. The gates still stand. Achilles has gone back beneath them once more.',steps:[
  beat('paris','arrow','Look up to the gate tower','Walk to the marker below the tower. Paris stands on the parapet.','Look toward Paris'),
  beat('death','arrow','The fall of Achilles','Paris releases an arrow from the wall. Achilles falls beneath the gate.')]},
 {name:'The carpenter’s yard',scene:'The Greek camp · Odysseus',speaker:'Epeius',line:'Odysseus, look at this frame. I can give it the shape of a horse. Bring me the ribs, the wheels and something to hush that hatch.',steps:[
  beat('plan','yard','Meet Epeius at the frame','You now play Odysseus. Hear the carpenter’s plan beside the wooden frame.','Speak to Epeius'),
  beat('build','yard','Outfit the wooden horse','Choose any supply mission on the map. Collect its part, then return to Epeius to fit it.'),
  beat('board','yard','Climb into the horse','The horse is ready. Meet the crew at the belly hatch.','Board the horse')]},
 {name:'Inside the horse',scene:'From daylight to midnight · Odysseus',speaker:'Odysseus',line:'The wheels have started. A voice will carry through these boards. When you see my hand, steady whatever is loose.',steps:[
  beat('ride','belly','Ride through the gates in silence','Listen to the wheels. When the shield slips, hold Space to steady it until the cart stops.'),
  beat('voices','belly','A familiar voice outside','Someone outside is calling the hidden men by name. Listen, then use E to reassure the companion who leans forward.','Signal your companion'),
  beat('listen','belly','Wait while Troy celebrates','Listen at the seam. Stay still while the lantern passes. Wait for the courtyard to grow quiet.','Listen through the seam'),
  beat('hatch','belly','Lower the hatch quietly','Wait for the final footfalls to fade. Hold Space to lower the padded hatch, then use E to climb down.','Ease the hatch open'),
  beat('ladder','courtyard','Descend from the horse','Hold ↓ to climb down from the hatch. Pause on the ladder when the lantern comes close. The crew follows you into the courtyard.')]},
 {name:'The sleeping city',scene:'Moonrise · Odysseus',speaker:'Odysseus',line:'One by one. Keep your feet soft. I can see the gate beam from the colonnade.',steps:[
  beat('slip','arcade','Slip away from the horse','Hold Space while moving to creep. Reach the colonnade quietly. The lantern glow marks the night watch.','Wait by the column'),
  beat('court','lamp','Cross the watch court','Watch the lantern, move quietly past the fountain and reach the shadow at the gate.','Gather the crew'),
  beat('gate','bar','Open the city gate','Reach the inner gate beam. Hold Space to lift it with the crew, then press E to swing the doors.','Open the gate')]},
 {name:'Two armies at dawn',scene:'The open gates · Odysseus',speaker:'Odysseus',line:'The men from the ships are here. I know that blue standard. Bring it through the gate.',steps:[
  beat('host','threshold','Meet the army in the gateway','Join the advancing Greeks and face the first Trojan company. Space strikes. Shift guards.'),
  beat('square','square','Fight for the square','Both armies are engaged. Rally the Greek front in the square and defeat the defending company.'),
  beat('dawn','standardHill','Answer the dawn muster','Find the Greek standard. Give the final report as the fighting ebbs.','Sound the muster')]}
];
export const waves={surf:3,banner:4,rise:5,hector:1,host:6,square:8};
export const current=s=>chapters[s.chapter].steps[s.step];
export const guardPosition=t=>[3+10*Math.sin(t*.48),-15+2*Math.cos(t*.48)];

export const voices={
 outside:['Voice outside','Men from the ships! Does no one remember the sound of home?'],
 voices:['Odysseus','His hand closes over mine. He understands. The voice outside moves away.'],
 land:['Greek sailor','The first ship is clear! Make room for the next!'],
 patroclus:['Achilles','I have carried your name all the way from the ships, Patroclus.'],
 challenge:['Hector','They can see me from the wall. Whatever comes, I will stand here.'],
 plan:['Odysseus','I will find what you need. When it moves, we go inside.'],
 court:['Greek companion','I see the gate beam. My hands are ready when yours are.']
};
