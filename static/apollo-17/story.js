// Positions in the playable valley are metres east and south of Challenger.
export const sites={
  hatch:[0,0], crew:[8,-4], wheel:[6,4], alsep:[-152,158], steno:[385,823],
  stenoRock:[404,855], stenoCore:[378,873], maps:[-5,1], clamps:[-10,-3], test:[-168,-91],
  saddle:[-860,220], nansen:[-1640,596], block:[-1682,622], fragment:[-1699,605],
  lara:[-1125,270], scarp:[-1096,249], shorty:[-1240,-580], orange:[-1272,-608],
  core:[-1279,-616], camelot:[-390,-397], blocks:[-423,-413], rack:[-3,4], mast:[13,-8]
};
const go=(at,title,hint,verb,work,entry,options={})=>({at,title,hint,verb,work,entry,...options});
export const chapters=[
 {name:'Challenger',line:'Jack, take the instruments. I’ll bring the rover around. Look how sharply our tracks stand out here.',speaker:'Cernan',scene:'11 December 1972 · EVA 1',steps:[
  go('crew','Meet Jack on the surface','Walk around the ladder to your crewmate.','Check the traverse plan','brief','Traverse plan received'),
  go('wheel','Inspect the rear wheel','The hammer in your pocket has caught the right rear extension. Examine the break.','Examine the mount','damage','Broken extension identified'),
  go('wheel','Make a field repair','Dust has coated the mating surface. Prepare the joint before taping it.','Tape the extension','tape','First repair taped'),
  go('wheel','Board the rover','Step to the chassis and take the left seat.','Take the controls',null,null,{board:true}),
  go('alsep','Reach the experiment site','Steer toward the instrument cluster. Keep clear of the darker crater bowls.','Park beside the array',null,'Instruments reached',{park:true}),
  go('alsep','Level the instrument','The reading settles when its level bubble is centered.','Level the sensor','level','Array leveled')
 ]},
 {name:'The dust trail',line:'Houston, the extension has worked loose again. Jack is wearing half the stuff the wheel is throwing up.',speaker:'Cernan',scene:'11 December · Station 1',steps:[
  go('steno','Drive to Steno','Board the parked rover with R. Cross the basin to the Steno rim.','Park at Station 1',null,'Steno reached',{park:true}),
  go('stenoRock','Photograph the outcrop','Walk to the block on the rim. Include the rock and a scale reference.','Frame the exposure','photo','Steno photograph'),
  go('stenoCore','Bag a basalt fragment','Inspect the dark fine-grained material and choose a representative fragment.','Examine the sample','basalt','Steno basalt bagged'),
  go('hatch','Return to Challenger','Return to the rover. The broken extension lets dust arc over the sample rack. Follow the bearing home.','End the first excursion',null,'EVA 1 complete',{park:true})
 ]},
 {name:'Four sheets',line:'Gene, we have a suggestion for that wheel. Four map sheets will span the opening. The utility lamps have clamps you can borrow.',speaker:'Houston',scene:'12 December · EVA 2',steps:[
  go('maps','Collect four map sheets','The spare sheets are at the foot of the ladder.','Pick up the sheets',null,'Four maps collected'),
  go('clamps','Find the lamp clamps','Look on the equipment stand beside the module.','Unclip both clamps',null,'Two clamps collected'),
  go('wheel','Assemble the replacement','Lay out the four charts. Rotate each sheet until its traverse arrow matches the reference.','Open the work surface','charts','Map panel taped'),
  go('wheel','Clamp it over the wheel','Set the forward and aft fasteners before checking the clearance.','Fit the map panel','clamp','Fender installed'),
  go('test','Test the dust shield','Board with E and follow the short test traverse. Watch the dust fall behind the rear wheel.','Check the sample rack',null,'Dust shield verified',{drive:true})
 ]},
 {name:'South Massif',line:'That dust tail is down. Let’s use the valley floor to get to the base of the massif. We have a boulder to read.',speaker:'Schmitt',scene:'12 December · Stations 2 and 3',steps:[
  go('saddle','Cross the valley floor','Take the rover toward the shoulder of the South Massif. Follow the route on your field map.','Take a navigation fix','bearing','South Massif fix',{drive:true}),
  go('nansen','Reach Nansen','Follow the terrace to the boulder field. Brake beside the station marker.','Park at Nansen',null,'Nansen reached',{park:true}),
  go('block','Set the photographic baseline','Walk up to the fractured boulder. Hold the scale reference in frame.','Frame the boulder','photo','Nansen context photographed'),
  go('fragment','Read the broken face','Use the light fragments set in a darker matrix to identify this sample.','Select a specimen','breccia','Nansen breccia bagged'),
  go('lara','Traverse to Lara','Take the rover along the light mantle to the scarp.','Park on the terrace',null,'Lara reached',{park:true}),
  go('scarp','Measure the terrace','Set the instrument on a level patch beside the scarp.','Level the gravimeter','level','Lara measurement logged')
 ]},
 {name:'Orange ground',line:'At the next rim, keep the wheels clear of our work area. I want to see the surface before we put tracks through it.',speaker:'Schmitt',scene:'12 December · Station 4',steps:[
  go('shorty','Find Shorty crater','Return to your vehicle. Follow the bearing north across broken ground.','Park outside the rim',null,'Shorty reached',{park:true,voice:'orange'}),
  go('orange','Follow Jack to the orange ground','Leave the rover behind and walk to the exposed patch.','Inspect the color boundary','orange','Orange horizon recorded'),
  go('orange','Photograph the intact layers','Record the color boundary while the layer is undisturbed.','Frame the contact','photo','Shorty color photograph'),
  go('core','Recover a core','Align the tube over the deposit. Keep the tool within the vertical guide.','Align the core tube','core','Shorty core sealed'),
  go('shorty','Stow the sample upright','Carry the core back to the rack. Select the label that preserves its context.','Label the core','label','Core orientation preserved')
 ]},
 {name:'The way home',line:'We have the color, the depth and the place it came from. One more comparison at Camelot, then we take these bags home.',speaker:'Cernan',scene:'12 December · Station 5 and closeout',steps:[
  go('camelot','Navigate to Camelot','Board the rover and cross to the block field. Choose your line between the craters.','Park at the blocks',null,'Camelot reached',{park:true}),
  go('blocks','Collect a comparison sample','Record the surface texture of the dark block beside the rover site.','Classify the block','basalt','Camelot comparison bagged'),
  go('hatch','Bring the collection home','Follow the heading to Challenger. Its gold descent stage is your last landmark.','Park at Challenger',null,'Crew returned',{park:true}),
  go('rack','Reconcile the sample bags','Match the unusual sample to its observation site.','Close the field register','audit','Sample register closed',{voice:'finish'}),
  go('mast','Transmit the closeout','Walk to the antenna with Jack and send the final field report.','Transmit to Houston',null,'EVA 2 complete')
 ]}
];
export const radio={
 orange:['Schmitt','Gene, look down here. There’s orange in the soil. Let’s get the color boundary in a picture before either of us steps on it.'],
 finish:['Houston','We copy the closeout. Four maps, two clamps, and a full sample rack. Bring those records up the ladder.']
};

export const outbound={
 'The dust trail':['Look behind us. The dust follows a clean arc and falls straight back down. The wheel is throwing it higher than the seat.','Record the condition of the equipment when we park. That gives the ground team a comparison.'],
 'South Massif':['The massif is filling the forward view. Those blocks reached the valley floor from high on its flank.','There is more than one way through these bowls. Keep the big blocks clear of the right rear wheel.'],
 'Orange ground':['We are looking for a low rim, not a mountain. Stay outside the crater until we have our bearings.','Leave us a clean approach on foot. The first photograph needs undisturbed soil.'],
 'The way home':['The bags carry the rocks. The photographs and the field notes carry the places they came from.','I can see Challenger ahead. We have a short walk left after we park.']
};
