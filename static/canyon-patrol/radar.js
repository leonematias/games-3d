export function createRadar(){
  const canvas=document.createElement('canvas');
  canvas.id='driveRadar';canvas.width=canvas.height=256;
  canvas.setAttribute('aria-label','Heading-up survey radar. The bright diamond marks the next transmitter.');
  document.body.append(canvas);
  const ctx=canvas.getContext('2d');
  let scan=0;
  return function draw(position,heading,target,dt){
    scan=(scan+dt*1.7)%(2*Math.PI);
    const dx=target.x-position.x,dz=target.z-position.z,dist=Math.hypot(dx,dz);
    const right=-dx*Math.cos(heading)+dz*Math.sin(heading);
    const ahead=dx*Math.sin(heading)+dz*Math.cos(heading);
    // Contacts beyond 300 m stay on the rim so a lost driver can recover the bearing.
    const scale=99/Math.max(300,dist);
    ctx.clearRect(0,0,256,256);ctx.save();ctx.translate(128,128);
    function circle(r){ctx.beginPath();ctx.arc(0,0,r,0,2*Math.PI);ctx.stroke();}
    ctx.fillStyle='rgba(10,21,22,.91)';ctx.beginPath();ctx.arc(0,0,119,0,2*Math.PI);ctx.fill();
    ctx.strokeStyle='#53726c';ctx.lineWidth=1.5;
    for(const r of [34,68,102,118])circle(r);
    ctx.beginPath();ctx.moveTo(-102,0);ctx.lineTo(102,0);ctx.moveTo(0,-102);ctx.lineTo(0,102);ctx.stroke();
    ctx.save();ctx.rotate(scan);ctx.fillStyle='rgba(94,233,194,.13)';ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,102,-.5,0);ctx.fill();ctx.restore();
    ctx.fillStyle='#fff2c6';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(-6,7);ctx.fill();
    ctx.fillStyle='#7dffcf';ctx.save();ctx.translate(right*scale,-ahead*scale);ctx.rotate(Math.PI/4);ctx.fillRect(-5,-5,10,10);ctx.restore();
    ctx.fillStyle='#cff3e8';ctx.font='bold 13px monospace';ctx.textAlign='center';ctx.fillText('FWD',0,-105);
    ctx.restore();
  };
}
