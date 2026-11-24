// The service bench and geology instruments share the episode's normal input panel.
const questions={
 brief:['Surface traverse','Schmitt has the geology tools. You will drive the open rover. Where should the geological record begin?',['At the outcrop, before lifting the rock','After the bags reach Earth','At the next parking stop'],0,'A context photograph ties a specimen to its surroundings.'],
 damage:['Rear wheel inspection','Fresh dust reaches the back of the seats. The wheel and suspension are intact. Which part is missing?',['Steering link','Right rear fender extension','Battery cover'],1,'The exposed tread can throw dust back over the seats.'],
 basalt:['Basalt sample','One fragment is dark and fine-grained. A second is a loose mixture of unrelated chips. Select the material described in your field notes.',['Mixed chips','Loose surface dust','Dark coherent fragment'],2,'The intact fragment retains the texture of its parent rock.'],
 breccia:['Nansen boulder','Light-colored fragments sit inside a darker matrix. How should the bag record describe the specimen?',['Uniform glass','Breccia with visible clasts','Loose orange grains'],1,'The contrasting fragments are the useful observation.'],
 orange:['Color contact','Jack has pointed out an orange band crossing the gray rim. What should the first entry record?',['Observed color and position','A proven mineral identification','A settled eruption date'],0,'Color and location are observations the crew can establish here.'],
 label:['Core orientation','What information will let the laboratory reconstruct the order of the layers?',['The rover odometer only','Bag weight only','Which end was at the surface'],2,'The upper end and the station identify the layer sequence.'],
 audit:['Sample register','A tube with an orange horizon and its original vertical orientation needs a station label.',['Steno','Shorty','Camelot'],1,'Station 4 is the color deposit. The register and sample now agree.']
};
const retryClues={
  brief:'Once a rock moves, the photograph can no longer show its original position.',
  damage:'The wheels still turn. Look over the exposed tread for the part that should catch the dust.',
  basalt:'Loose chips can come from different rocks. Look for one intact, fine-grained fragment.',
  breccia:'Trace the edges of the pale pieces inside the dark matrix.',
  orange:'The crew can describe the color band from here. Identifying the grains will take laboratory work.',
  label:'Imagine opening the tube back on Earth. Which end of the column was uppermost?',
  audit:'Check the site where Jack first saw the orange band.'
};
const plates=new Image();plates.src='/games-3d/static/apollo-17/field-plates.jpg';
function exposure(ctx,w,h,column,x=0,y=0,zoom=1){
 if(!plates.naturalWidth)return;
 const width=plates.naturalWidth/3,sw=width*.76/zoom,sh=sw*h/w;
 ctx.drawImage(plates,width*column+(width-sw)/2-x,plates.naturalHeight*.54-sh/2-y,sw,sh,0,0,w,h);
}
export function openWork(id,ui,done,state){
  const q=questions[id];
  if(q){const column={basalt:0,breccia:1,orange:2}[id];
    const show=column===undefined?ui.select:(title,desc,options,choose)=>ui.instrument(title,desc,(ctx,w,h)=>exposure(ctx,w,h,column),options,choose);
    show(q[0],q[1],q[2],i=>{
    if(i===q[3])done(q[4]);else ui.hint(retryClues[id]);
  });return;}
  if(id==='compare'){
    ui.instrument('Camelot comparison','Compare the Camelot block at right with the two earlier field plates. Which station offers the closer texture match?',(ctx,w,h)=>{
      const names=['STENO','NANSEN','CAMELOT'];
      for(let i=0;i<3;i++){
        ctx.save();ctx.translate(i*w/3,0);
        // Crop the final view from another area of the illustrative basalt plate.
        exposure(ctx,w/3,h,i===1?1:0,i===2?25:0,0,2.8);
        ctx.fillStyle='#10161d';ctx.fillRect(0,h-24,w/3,24);
        ctx.fillStyle='#fff4d5';ctx.font='13px monospace';ctx.fillText(names[i],8,h-8);
        ctx.restore();
      }
    },['Nansen · pale clasts in a matrix','Steno · coherent fine-grained rock'],i=>{
      if(i===1)done('Camelot bagged beside the Steno comparison in the register.');
      else ui.hint('Look for the pale clasts in the middle plate. Does the Camelot face show those boundaries?');
    });
    return;
  }
  if(id==='charts'){chartBench(ui,done);return;}
  if(id==='clamp'||id==='tape'){
    const tape=id==='tape',order=tape?['Brush the joint','Seat the extension','Press the tape']:['Set forward clamp','Seat aft clamp','Spin wheel by hand'];
    let n=0;const draw=()=>ui.select(tape?'Temporary repair':'Clearance check',
      (tape?'Clear the dust, fit the loose section, then press down the tape.':'Hold the panel at the front, secure the back, then verify wheel clearance.')+' '+n+' of 3 complete.',
      [order[2],order[0],order[1]],i=>{
        if([order[2],order[0],order[1]][i]!==order[n]){ui.hint('Next step: '+order[n]+'.');return;}
        n++;if(n===3){done(tape?'Extension seated. Check it on the traverse.':'Both clamps hold and the wheel turns freely.');return;}
        draw();ui.hint(order[n-1]+' · completed');});
    draw();return;
  }
  const configs={
   photo:['Context photograph','Center the outcrop and its scale cross in the viewfinder.',1.6],
   core:['Core tube','Align the tip with the guide, then press Space to drive the tube into the deposit.',1],
   bearing:['Navigation sight','Use the controls to center the massif notch in the sight.',1.3],
   level:['Instrument level','Bring the bubble inside the central ring. Confirm the reading on two axes.',1]
  };
  const [title,desc,tolerance]=configs[id];let pass=0;
  function align(){let x=pass?4:-5,y=pass?-3:4;
    function draw(){
      const station=['Challenger','Steno','Challenger','Nansen','Shorty','Camelot'][state.chapter];
      const subject=state.chapter===4?'orange band':state.chapter===3?'fractured boulder':'basalt outcrop';
      const instruction=id==='photo'?(pass?'Frame the scale cross beside the '+subject+' for a detail exposure.':'Center the '+subject+' for a context exposure at '+station+'.'):desc;
      ui.instrument(title,instruction,(ctx,w,h)=>{
        const ox=w/2,oy=h/2;ctx.fillStyle='#283233';ctx.fillRect(0,0,w,h);
        if(id==='photo'||id==='core')exposure(ctx,w,h,id==='core'||state.chapter===4?2:state.chapter===3?1:0,x*7,y*7,id==='photo'&&pass?1.5:1);
        if(id==='bearing'){ctx.fillStyle='#0c1015';ctx.fillRect(0,0,w,h);ctx.fillStyle='#918a80';ctx.beginPath();ctx.moveTo(0,h);
          for(let i=0;i<=w;i+=3){const r=i-ox-x*12;ctx.lineTo(i,oy+y*12+Math.min(0,21-Math.abs(r)*.55)+Math.sin(r*.08)*3);}ctx.lineTo(w,h);ctx.fill();}
        if(id==='level'){const rim=ctx.createRadialGradient(ox,oy,8,ox,oy,112);rim.addColorStop(0,'#6e8067');rim.addColorStop(.82,'#455247');rim.addColorStop(.86,'#1e2420');rim.addColorStop(1,'#525c58');ctx.fillStyle=rim;ctx.beginPath();ctx.arc(ox,oy,98,0,7);ctx.fill();}
        ctx.strokeStyle=id==='level'?'#839483':'#e1ddcd4f';ctx.lineWidth=1;
        for(let i=-8;i<=8;i++){const k=i*14;ctx.beginPath();ctx.moveTo(ox+k,0);ctx.lineTo(ox+k,h);ctx.moveTo(0,oy+k);ctx.lineTo(w,oy+k);ctx.stroke();}
        ctx.strokeStyle='#e8c47b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(ox,oy,tolerance*12,0,Math.PI*2);ctx.stroke();
        const px=ox+x*12,py=oy+y*12;
        ctx.strokeStyle='#fff4d5';ctx.fillStyle='#d7ebc8';ctx.beginPath();
        if(id==='core'){ctx.moveTo(px-6,py-65);ctx.lineTo(px-4,py);ctx.lineTo(px+4,py);ctx.lineTo(px+9,py-65);ctx.stroke();}
        else if(id==='level'){ctx.arc(px,py,7,0,Math.PI*2);ctx.fill();}else{ctx.moveTo(px-8,py);ctx.lineTo(px+8,py);ctx.moveTo(px,py-8);ctx.lineTo(px,py+8);ctx.stroke();}
        ctx.fillStyle='#f2e6cd';ctx.font='12px monospace';ctx.fillText(id==='core'?'CORE · VERTICAL GUIDE':id==='photo'?(pass?'DETAIL':'CONTEXT')+' EXPOSURE':'READING '+(pass+1)+' / 2',12,19);
      },['←','↑','↓','→','Confirm'],i=>{
        if(i===4){if(Math.hypot(x,y)>tolerance){ui.hint('Outside tolerance. Bring the pale mark inside the brass ring.');return;}
          if(id==='core'){
            ui.select('Recover the core','The tube is full and still upright. Preserve the order of the gray and orange layers for the trip to the rack.',
              ['Tip the contents into a sample bag','Cap the tube and mark the surface end'],choice=>{
                if(choice===1)done('Shorty core capped upright. Surface end marked.');
                else ui.hint('Loose grains would mix. Keep the column inside its tube.');
              });
            return;
          }
          if(++pass===2){done(id==='photo'?station+' context and detail photographs logged.':'Both readings recorded.');return;}
          align();if(id==='photo')ui.hint('Context exposure recorded. Move in for the detail.');return;}
        x=Math.max(-8,Math.min(8,x+[-1,0,0,1][i]));y=Math.max(-6,Math.min(6,y+[0,-1,1,0][i]));draw();
      },{arrowleft:0,arrowup:1,arrowdown:2,arrowright:3});}
    draw();
  }align();
}
function chartBench(ui,done){
  const rot=[1,3,2,1];let selected=0;
  function draw(){
    const directions=['north','east','south','west'];
    const aligned=rot.filter(turns=>turns===0).length;
    const reading='Sheet '+(selected+1)+' points '+directions[rot[selected]]+'. '+aligned+' of 4 face north.';
    ui.instrument('Four maps, one fender','Turn all north arrows up, then tape the seams. '+reading,(ctx,w,h)=>{
      const size=Math.min(h*.46,w*.235);
      for(let i=0;i<4;i++){
        const x=w/2+(i%2-.5)*(size+3),y=h/2+(Math.floor(i/2)-.5)*(size+3);
        ctx.save();ctx.translate(x,y);ctx.rotate(rot[i]*Math.PI/2);ctx.fillStyle=['#dac594','#d2ba87','#dbcba9','#cbb690'][i];ctx.fillRect(-size/2,-size/2,size,size);
        ctx.strokeStyle='#8d785a';for(let j=0;j<4;j++){ctx.beginPath();ctx.ellipse(-size*.3,size*.24,size*(.18+j*.10),size*(.13+j*.07),-.4,0,Math.PI*2);ctx.stroke();}
        ctx.fillStyle='#333c3b';ctx.font='bold 21px monospace';ctx.textAlign='center';ctx.fillText('↑',0,2);ctx.restore();
        if(i===selected){ctx.strokeStyle='#fff5cd';ctx.lineWidth=3;ctx.strokeRect(x-size/2,y-size/2,size,size);ctx.lineWidth=1;}
      }
    },['Select sheet','Rotate clockwise','Tape seams'],i=>{
      if(i===0)selected=(selected+1)%4;
      if(i===1)rot[selected]=(rot[selected]+1)%4;
      if(i===2){if(rot.every(n=>n===0)){done('Four sheets form a continuous panel.');return;}ui.hint('Check sheet '+(rot.findIndex(turns=>turns!==0)+1)+'. Its north arrow still points away from the top edge.');return;}
      draw();
    });
  }draw();
}
