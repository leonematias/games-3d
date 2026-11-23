import * as THREE from 'three';

// Build the shell around the existing walk-in cargo volume. Local -Z is forward.
export function dressDropship(ship,{mesh,box,label,armor,dark,white,cyan,environment}){
  const enamel=new THREE.MeshStandardMaterial({color:0xbc4827,roughness:.46,metalness:.38,envMap:environment});
  const glass=new THREE.MeshPhysicalMaterial({color:0x17384d,metalness:.56,roughness:.16,clearcoat:1,envMap:environment,emissive:0x092336});
  const skins=new Map();
  function skin(points,faces,mat){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
    geo.setIndex(faces);const flat=geo.toNonIndexed();geo.dispose();flat.computeVertexNormals();
    if(!skins.has(mat)){const paint=mat.clone();paint.side=THREE.DoubleSide;skins.set(mat,paint);}
    const panel=mesh(ship,flat,skins.get(mat),0,0,0);panel.userData.moving=true;return panel;
  }
  function loft(stations,mat,open=false){
    const points=[],faces=[];
    for(const [z,w,bottom,top] of stations){
      const h=top-bottom;
      for(const [x,y] of [[-.72,0],[.72,0],[1,.22],[1,.66],[.68,1],[-.68,1],[-1,.66],[-1,.22]])points.push([x*w,bottom+y*h,z]);
    }
    for(let i=8;i<points.length;i++){const prev=i-8,next=Math.floor(i/8)*8+(i+1)%8;faces.push(prev,i,next,prev,next,next-8);}
    for(let i=1;i<7;i++){faces.push(0,i+1,i);if(!open){const k=points.length-8;faces.push(k,k+i,k+i+1);}}
    return skin(points,faces,mat);
  }
  function tube(x,y,z,r1,r2,length,mat){
    const m=mesh(ship,new THREE.CylinderGeometry(r1,r2,length,20),mat,x,y,z);m.rotation.x=Math.PI/2;return m;
  }
  loft([[-7.65,.54,.84,1.12],[-6.8,1.38,.57,1.64],[-4.3,2.18,.28,2.9],[-2.1,2.65,.21,3.51],[1.7,2.65,.2,3.51],[3.52,2.5,.18,3.28]],white,true);
  // A narrow orange keel below the panoramic flight deck.
  loft([[-7.69,.48,.86,1.04],[-6.63,1.47,.58,1.28],[-4.15,2.12,.35,1.55]],enamel);
  loft([[-6.77,.91,1.45,1.71],[-5.1,1.56,1.89,2.64],[-3.13,1.6,2.69,3.37],[-2.48,1.33,2.99,3.45]],glass);
  for(const sign of [-1,1]){
    function wing(coords,thickness,mat){
      const points=coords.map(([x,y,z])=>[sign*x,y,z]);points.push(...points.map(([x,y,z])=>[x,y-thickness,z]));
      const n=coords.length,faces=[];for(let i=1;i<n-1;i++)faces.push(0,i,i+1,n,n+i+1,n+i);
      for(let i=0;i<n;i++){const j=(i+1)%n;faces.push(i,j,j+n,i,j+n,i+n);}skin(points,faces,mat);
    }
    wing([[1.8,2.68,-3.9],[3.1,2.35,-2.35],[6.8,1.68,1.36],[6.55,1.7,2.62],[2.1,2.4,1.52]],.36,armor);
    wing([[2.4,2.59,-2.94],[2.95,2.43,-2.46],[6.61,1.76,1.44],[6.02,1.84,1.52]],.055,enamel);
    wing([[2.18,2.18,.5],[3,2.14,1.82],[3.92,4.6,3.65],[3.8,4.65,4.55],[2.24,2.12,3.15]],.23,enamel);
    const x=sign*4.46,y=1.52;
    tube(x,y,-1.56,.92,.72,.72,white);tube(x,y,.22,.97,.92,2.85,enamel);
    tube(x,y,1.86,.78,.97,.68,armor);tube(x,y,2.37,.67,.8,.52,dark);
    for(const z of [-1.25,-.97,.97,1.23,2.47])tube(x,y,z,z>2?.69:.98,z>2?.69:.98,.09,dark);
    tube(x,y,-1.94,.59,.59,.09,dark);tube(x,y,2.65,.5,.58,.1,cyan);
    const tailLight=new THREE.MeshBasicMaterial({color:0x75ddff,transparent:true,opacity:.24,blending:THREE.AdditiveBlending,depthWrite:false});
    for(let k=0;k<3;k++){
      const jet=mesh(ship,new THREE.ConeGeometry(.45-k*.10,1.65-k*.34,20),tailLight,x,y,2.65+(1.65-k*.34)/2);jet.rotation.x=Math.PI/2;
    }
    for(let k=0;k<10;k++){const a=k*.628;const vane=box(ship,armor,x+Math.cos(a)*.34,y+Math.sin(a)*.34,-2,.4,.065,.09);vane.rotation.z=a+.41;}
    for(let k=0;k<4;k++){box(ship,dark,sign*2.655,1.68,-1.72+k*.69,.08,.64,.48);box(ship,cyan,sign*2.703,1.91,-1.72+k*.69,.035,.055,.32);}
    const marking=label(ship,'ARES   /   07',sign*2.68,1.7,1.83,1.94,.44);marking.rotation.y=sign*Math.PI/2;
    for(const z of [-2.55,2.18]){const leg=box(ship,dark,sign*2.42,.52,z,.21,.99,.23);leg.rotation.z=-sign*.32;box(ship,armor,sign*2.58,.1,z,.64,.17,1.08);}
    box(ship,dark,sign*1.39,3.38,.57,.6,.27,2.83);
    for(let k=0;k<8;k++)box(ship,armor,sign*1.39,3.54,-.64+k*.32,.46,.063,.105);
  }
  const badge=label(ship,'07  /  RESCUE',0,3.526,.05,2.12,.52);badge.rotation.x=-Math.PI/2;
  for(const x of [-.88,.88]){
    box(ship,enamel,x,3.524,-.9,.17,.024,1.52);
    box(ship,enamel,x,3.524,.93,.17,.024,.71);
  }
  for(const z of [-3.97,-4.76]){
    const y=2.69+(z+3.13)*.40;
    const bridge=box(ship,dark,0,y+.61,z,3.03,.046,.075);bridge.rotation.x=-.38;
  }
  box(ship,dark,0,.15,0,4.52,.3,7);
  for(const x of [-1.9,1.9])box(ship,cyan,x,.308,.75,.075,.016,5.1);
  box(ship,dark,0,1.58,-3.42,4.3,2.66,.18);label(ship,'MED / EVAC',0,1.68,-3.31,2.3,.56);
  box(ship,armor,0,2.99,3.53,4.15,.44,.23);label(ship,'ARES  07',0,2.99,3.66,1.7,.36);
}
