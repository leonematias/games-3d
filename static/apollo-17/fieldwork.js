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
const plates=new Image();plates.src='/games-3d/static/apollo-17/field-plates.jpg';
function exposure(ctx,w,h,column,x=0,y=0){
 if(!plates.naturalWidth)return;
 const width=plates.naturalWidth/3,sw=width*.76,sh=sw*h/w;
 ctx.drawImage(plates,width*column+(width-sw)/2-x,plates.naturalHeight*.54-sh/2-y,sw,sh,0,0,w,h);
}
export function openWork(id,ui,done,state){
  const q=questions[id];
  if(q){const column={basalt:0,breccia:1,orange:2}[id];
    const show=column===undefined?ui.select:(title,desc,options,choose)=>ui.instrument(title,desc,(ctx,w,h)=>exposure(ctx,w,h,column),options,choose);
    show(q[0],q[1],q[2],i=>{
    if(i===q[3])done(q[4]);else ui.hint('Compare the observation with the choices and try again.');
  });return;}
  if(id==='charts'){chartBench(ui,done);return;}
  if(id==='clamp'||id==='tape'){
    const tape=id==='tape',order=tape?['Brush the joint','Seat the extension','Press the tape']:['Set forward clamp','Seat aft clamp','Spin wheel by hand'];
    let n=0;const draw=()=>ui.select(tape?'Temporary repair':'Clearance check',
      tape?'Clear the dust, fit the loose section, then press down the tape.':'Hold the panel at the front, secure the back, then verify wheel clearance.',
      [order[2],order[0],order[1]],i=>{
        if([order[2],order[0],order[1]][i]!==order[n]){ui.hint('That operation needs the previous fitting in place.');return;}
        n++;if(n===3){done(tape?'Extension seated. Check it on the traverse.':'Both clamps hold and the wheel turns freely.');return;}
        draw();ui.hint(order[n-1]+' · completed');});
    draw();return;
  }
  const configs={
   photo:['Context photograph','Center the outcrop and its scale cross in the viewfinder.',1.6],
   core:['Core tube','Bring the tilted tube onto the vertical crosshair before taking each section.',1],
   bearing:['Navigation sight','Use the controls to center the massif notch in the sight.',1.3],
   level:['Instrument level','Bring the bubble inside the central ring. Confirm the reading on two axes.',1]
  };
  const [title,desc,tolerance]=configs[id];let pass=0;
  function align(){let x=pass?4:-5,y=pass?-3:4;
    function draw(){
      ui.instrument(title,desc,(ctx,w,h)=>{
        const ox=w/2,oy=h/2;ctx.fillStyle='#283233';ctx.fillRect(0,0,w,h);
        if(id==='photo'||id==='core')exposure(ctx,w,h,id==='core'||state.chapter===4?2:state.chapter===3?1:0,x*7,y*7);
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
        ctx.fillStyle='#f2e6cd';ctx.font='12px monospace';ctx.fillText('READING '+(pass+1)+' / 2',12,19);
      },['←','↑','↓','→','Confirm'],i=>{
        if(i===4){if(Math.hypot(x,y)>tolerance){ui.hint('Outside tolerance. Bring the pale mark inside the brass ring.');return;}
          if(++pass===2){done('Both readings recorded.');return;}align();return;}
        x=Math.max(-8,Math.min(8,x+[-1,0,0,1][i]));y=Math.max(-6,Math.min(6,y+[0,-1,1,0][i]));draw();
      },{arrowleft:0,arrowup:1,arrowdown:2,arrowright:3});}
    draw();
  }align();
}
function chartBench(ui,done){
  const rot=[1,3,2,1];let selected=0;
  function draw(){
    ui.instrument('Four maps, one fender','Turn each sheet until its north arrow points up. Seal the four aligned edges together.',(ctx,w,h)=>{
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
      if(i===2){if(rot.every(n=>n===0)){done('Four sheets form a continuous panel.');return;}ui.hint('One or more north arrows still point across a seam.');return;}
      draw();
    });
  }draw();
}
