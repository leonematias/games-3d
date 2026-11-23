import * as THREE from 'three';

export function receiverMesh(){
  const group=new THREE.Group();
  function block(w,h,d,x,y,color){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color}));
    m.position.set(x,y,0);group.add(m);return m;
  }
  block(.26,.38,.13,0,0,0x7e724c);
  block(.18,.09,.15,0,.06,0x74f1b5);
  block(.025,.36,.025,.09,.35,0x222929);
  group.name='Ellis survey receiver';return group;
}

export function cue(name){
  const clip=new Audio(new URL(name+'.wav',import.meta.url));
  return muted=>{if(!muted){clip.currentTime=0;clip.play().catch(()=>{});}};
}
export function createTuner(receiver){
  const ping=cue('ping');
  let angle=0,delay=0;
  const strength=()=>Math.round(50+50*Math.cos(angle-2.24));
  return {
    update(dt,keys,muted){
      angle+=dt*(Number(keys.has('KeyX'))-Number(keys.has('KeyQ')))*1.05;
      receiver.rotation.y=angle;
      delay-=dt;
      if(delay<=0){ping(muted);delay=.12+.9*(1-strength()/100);}
    },
    get strength(){return strength();},
    get locked(){return strength()>=97;},
    get hint(){return 'Q / X rotate · Signal '+strength()+'%'+(strength()>=97?' · E lock bearing':'');}
  };
}
