import * as THREE from 'three';
import RAPIER from 'rapier';

export const chapters = [
  { name: 'Cargo Lockdown', color: 0x59d5ee, length: 31, key: 'amber', objectives: ['Release the step box', 'Weight the cargo gate', 'Find amber; open the shortcut', 'Bring the box to the balcony', 'Unlock the departure door'] },
  { name: 'Furnace Works', color: 0xffa34b, length: 44, key: 'cyan', objectives: ['Reach the firing gallery', 'Breach the booth; find cyan', 'Open the return stairs', 'Bring the box up the freight lift', 'Cross the channel; unlock the exit'] },
  { name: 'Evacuation Tower', color: 0xf37865, length: 34, key: 'amber', objectives: ['Reach deck two; recover equipment', 'Extend the bridge', 'Cross to the furnace deck', 'Shut down the jets permanently', 'Find amber; evacuate'] },
];

// Level construction and puzzle state. Physics and player controls remain in game.js.
export function buildCampaign(a, level) {
  const { scene, world, fixed, meshBox, mats, createCrate, createRock, makeKey, makeVentTrap, colliderEntities } = a;
  const spec = chapters[level - 1];
  const surfaces = [], movers = [], switches = [], plates = [], stations = [], hazards = [], enemySpawns = [], solids = [], flags = new Set();
  const checks = [], goals = [], wires = [], stagingPads = [];
  const spawn = { x: 0, y: 0.91, z: 2 };
  let checkpoint = { ...spawn }, checkpointName = 'ENTRY', simTime = 0;
  let stepBox;
  const exit = { x: 0, y: 0, z: spec.length - 1.3, key: spec.key };
  const solid = (x,y,z,w,h,d,material=mats.wall) => {
    const obj = fixed(x,y,z,w,h,d,material);
    solids.push({x,y,z,w,h,d, obj});
    return obj;
  };
  const platform = (x,z,top,width,depth,label='') => {
    solid(x,top-0.14,z,width,0.28,depth,mats.metal);
    const surface = { x,z,top,width,depth };
    surfaces.push(surface);
    meshBox(x,top+0.015,z-depth/2+0.04,width,0.035,0.06,mats.cyan,false);
    if (label) sign(label,x+width/2-1.25,top-0.08,z-depth/2-0.025,Math.min(width,2.4));
    return surface;
  };
  function sign(text,x,y,z,width=3,color='#8de9ed') {
    const canvas = document.createElement('canvas'); canvas.width=1024; canvas.height=160;
    const c=canvas.getContext('2d'); c.fillStyle='#081a22'; c.fillRect(0,0,1024,160);
    c.strokeStyle=color; c.lineWidth=5; c.strokeRect(4,4,1016,152);
    c.fillStyle=color; c.font='bold 40px sans-serif'; c.textAlign='center'; c.textBaseline='middle';
    c.fillText(text,512,80,970);
    const map=new THREE.CanvasTexture(canvas); map.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width*160/1024),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));
    mesh.position.set(x,y,z); mesh.rotation.y=Math.PI; scene.add(mesh); return mesh;
  }
  function wire(points, active) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,24,0.025,5,false),new THREE.MeshBasicMaterial({color:0x37616b}));
    scene.add(mesh); wires.push({mesh,active});
  }
  function gate(id,x,z,width=2.6,base=0,height=3.5) {
    const material=mats.trim.clone();material.color.setHex(0x355761);material.emissive.setHex(0x0c2730);material.emissiveIntensity=0.45;
    const obj=solid(x,base+height/2,z,width,height,0.24,material);
    obj.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);
    const marker=meshBox(x,base+height-0.16,z-0.14,width-0.15,0.09,0.04,mats.amber,false);
    const g={id,...obj,x,z,width,base,height,open:false,t:0,marker,kind:'gate'}; movers.push(g); return g;
  }
  function relay(id,x,y,z,label,action,{manual=false,allowed=()=>true}={}) {
    const obj=solid(x,y,z,0.8,0.8,0.16,mats.trim);
    const face=meshBox(x,y,z-0.1,0.64,0.64,0.04,(manual?mats.amber:mats.cyan).clone(),false);
    const s={id,x,y,z,label,action,manual,allowed,face,used:false}; switches.push(s);
    colliderEntities.set(obj.collider.handle,{kind:'relay',relay:s});
    sign(`${manual?'SPACE':'HIT'} · ${label}`,x,y+0.65,z-0.13,2.7);
    return s;
  }
  function activate(s) {
    if (!s.allowed()) { a.say('CONTROL LOCKED — FOLLOW THE LIT CIRCUIT'); return false; }
    const result=s.action();
    if(result===false)return false;
    s.used=true; s.face.material.color.setHex(0x73e0ab); a.sound('door'); a.say(s.label); return true;
  }
  function plate(id,x,z,top,action) {
    const mesh=meshBox(x,top+0.025,z,1.5,0.05,1.5,mats.cyan.clone(),false);
    const p={id,x,z,top,action,active:false,mesh}; plates.push(p);
    sign('STEP BOX → WEIGHT PLATE',x,top+0.22,z-0.8,2.6); return p;
  }
  function lift(id,x,z,low,high,width=2.5,depth=2.5) {
    const obj=fixed(x,low-0.12,z,width,0.24,depth,mats.special);
    obj.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);
    const surface={x,z,top:low,width,depth}; surfaces.push(surface);
    const m={id,...obj,x,z,low,high,width,depth,top:low,target:low,surface,kind:'lift'}; movers.push(m);
    for(const offset of [-width/2,width/2])solid(x+offset,(low+high)/2,z+depth/2,0.12,high-low+1,0.12,mats.trim);
    return m;
  }
  function stairs(x,z,start,count=8,up=true,width=1.7) {
    for(let i=0;i<count;i++) platform(x,z+i*0.42,start+(up?i+1:count-i)*0.2,width,0.44);
  }
  function staging(x,z,top) {
    stagingPads.push({x,z,top});
    for(const side of [-1,1]) {meshBox(x+side*0.46,top+0.02,z,0.04,0.025,0.96,mats.amber,false);meshBox(x,top+0.02,z+side*0.46,0.96,0.025,0.04,mats.amber,false);}
  }
  function ammo(x,z,y=0) { for(let i=0;i<4;i++) createRock(x+(i%2)*0.35,z+Math.floor(i/2)*0.4,0.18,y+0.2); }
  function station(x,z,top,label,condition=()=>true) {
    const s={x,z,top,label,condition}; stations.push(s);
    meshBox(x,top+0.45,z,0.7,0.9,0.5,mats.trim);
    sign('SPACE · RECOVER BOX / CELLS',x,top+1.1,z-0.28,2.8);
    ammo(x-1,z-0.2,top); return s;
  }
  function check(id,x,z,top,condition=()=>true) { checks.push({id,x,z,top,condition}); }
  function enemy(id,x,z,top,minZ,maxZ,behavior='direct',awake=null) {
    enemySpawns.push({id,x,z,top,zone:{minZ,maxZ,minX:-5.2,maxX:5.2},behavior,awake});
  }
  function fuel(x,z,top=0) { return createCrate(x,z,0.85,'flammable',top+0.425); }
  function wood(x,z,size=1,top=0) { return createCrate(x,z,size,'wood',top+size/2); }
  function floor(z,depth,top=0) { solid(0,top-0.2,z,12,0.4,depth,mats.floor); }
  function partition(z,openings) {
    let left=-6;
    for(const [x,width] of openings.sort((p,q)=>p[0]-q[0])) {
      const edge=x-width/2;
      if(edge>left)solid((edge+left)/2,2.7,z,edge-left,5.4,0.3);
      solid(x,4.65,z,width,1.5,0.3);
      left=x+width/2;
    }
    if(left<6)solid((left+6)/2,2.7,z,6-left,5.4,0.3);
  }

  // A taller shell permits visible destinations and the tower's complete ascent.
  const wallHeight=level===3?12:7;
  solid(-6.15,wallHeight/2,spec.length/2,0.3,wallHeight,spec.length);
  solid(6.15,wallHeight/2,spec.length/2,0.3,wallHeight,spec.length);
  solid(0,wallHeight/2,0,12,wallHeight,0.3);
  solid(0,wallHeight/2,spec.length,12,wallHeight,0.3);
  meshBox(0,wallHeight+0.1,spec.length/2,12,0.2,spec.length,mats.ceiling,false);
  for(let z=3;z<spec.length;z+=6) {
    for(const x of [-5.85,5.85]) {
      meshBox(x,3.6,z,0.09,0.09,3.4,new THREE.MeshBasicMaterial({color:spec.color}),false);
      const light=new THREE.PointLight(spec.color,7,10,2); light.position.set(x*0.75,3.6,z); scene.add(light);
    }
    meshBox(0,wallHeight-0.1,z,11.8,0.22,0.32,mats.trim,false);
  }
  sign(spec.name.toUpperCase(),0,3.5,0.2,5);

  if(level===1) {
    floor(15.5,31);
    partition(10,[[0,3],[4.5,2.2]]);
    const cargo=gate('cargo',0,10,3), shortcut=gate('shortcut',4.5,10,2.2);
    // A small supply cage releases the only movable box after the relay is exposed.
    solid(-4.8,1.5,6.8,0.2,3,3); solid(-2.4,1.5,6.8,0.2,3,3); solid(-3.6,1.5,8.2,2.6,3,0.2);
    const supply=gate('supply',-3.6,5.4,2.2,0,2.8);
    stepBox=createCrate(-3.6,6.7,0.8,'special');
    const release=relay('release',0,1.25,6.3,'01 · RELEASE EQUIPMENT',()=>{supply.open=true;flags.add('release');});
    wood(0,4.8,1.6); ammo(-0.5,3);
    const weight=plate('cargo-weight',0,8.1,0,on=>{cargo.open=on;if(on)flags.add('weighted');});
    const bypass=relay('shortcut',4.5,1.25,13,'03 · UNLOCK RETURN PASSAGE',()=>{shortcut.open=true;flags.add('shortcut');},{manual:true});
    wire([[0,1.25,6.3],[-1.7,0.12,6.3],[-3.6,0.12,5.4]],()=>flags.has('release'));
    wire([[0,0.08,8.1],[1.3,0.08,8.1],[1.3,0.08,10]],()=>weight.active);
    wire([[4.5,1.2,13],[5.7,0.1,13],[5.7,0.1,10]],()=>flags.has('shortcut'));
    wood(-2.8,15,1.15); makeKey('amber',-2.8,15,0);
    fuel(-3.8,17); wood(-3.7,18,1); enemy('scrap-goblin',-2.5,18,0,10.5,20,'climber','amber');
    createCrate(2.2,17,1.2,'metal'); ammo(3.1,14);
    platform(0,22,1,5,3.4,'04 · BRING THE STEP BOX');
    platform(0,27,2.6,8,6,'DEPARTURE BALCONY');
    // Loading platform touches the upper balcony; the 1.6 m rise needs the step box.
    platform(0,23.7,1,5,1);
    exit.y=2.6; staging(0,23.4,1);
    station(-4,3,0,'ENTRY',()=>flags.has('release')); check('CARGO BAY',3.8,14,0,()=>flags.has('shortcut'));
    station(4.6,18.5,0,'CARGO',()=>flags.has('shortcut'));
    goals.push(()=>flags.has('release'),()=>flags.has('weighted'),()=>flags.has('shortcut')&&a.owned.has('amber'),()=>a.feet()>2.4,()=>a.won());
  } else if(level===2) {
    floor(17,34); floor(41,6);
    staging(-3.6,6.3,0); staging(2.7,30.4,1.5);
    stepBox=createCrate(-2,4.6,0.8,'special'); station(3.5,3,0,'ENTRY');
    platform(-3.6,9,1.6,3,4,'01 · FIRING GALLERY');
    platform(-3.6,14.5,1.6,3,7);
    // This low solid shield blocks floor-level shots, while gallery shots clear it.
    solid(-3.6,0.8,12,3.3,1.6,0.35,mats.metal);
    wood(-3.2,13.2,1.5,1.6); fuel(-4.5,14.6,1.6);
    wood(-3.6,17,1,1.6); makeKey('cyan',-3.6,17,1.6); ammo(-4.5,9,1.6);
    platform(-1.5,17,1.6,1.4,2); platform(0,16.7,1.6,1.7,2);
    stairs(0,13,0,8,true);
    const stairGate=gate('stairs',0,16,1.8,1.6,2.8);
    relay('stairs',-1.5,2.85,17.4,'02 · OPEN RETURN STAIRS',()=>{stairGate.open=true;flags.add('stairs');},{manual:true});
    wire([[-1.5,2.85,17.4],[-1.5,1.65,16],[0,1.65,16]],()=>flags.has('stairs'));
    const vent=makeVentTrap({x:0,z:23,top:0,width:4.8,depth:2.6,switchX:3.7,switchY:1.25,switchZ:20.2});
    sign('THROW TO LURE · HIT SWITCH TO IGNITE',1,2.7,20,5);
    enemy('scrap-goblin',-1.2,26,0,20,28,'flanker'); enemy('magma-brute',1.2,26.6,0,20,28);
    fuel(-2.1,23.3); createCrate(3.7,22,1.1,'metal'); ammo(3.2,19);
    check('FURNACE HALL',3.5,19,0,()=>flags.has('stairs')); station(4.7,19,0,'FURNACE',()=>flags.has('stairs'));
    const freight=lift('freight',2.7,29.5,0.05,1.5,3,3);
    relay('freight',3.6,1.25,30.5,'03 · FREIGHT LIFT UP / DOWN',()=>{freight.target=freight.target>0.1?0.05:1.5;flags.add('lift');},{manual:true});
    // A second call control remains usable from the upper landing.
    relay('freight-call',4.8,4.3,32,'CALL FREIGHT LIFT',()=>{freight.target=freight.top>0.8?0.05:1.5;},{manual:true});
    platform(2.7,32.4,3.1,4,2.8,'04 · USE BOX TO REACH WALKWAY');
    for(const z of [34.4,35.7,37,38.3])createCrate(2.7,z,1.25,'metal',2.475);
    wood(2.7,37,1,3.1);
    platform(2.7,40.5,3.1,4,3.2,'CYAN · DEPARTURE');
    hazards.push({x:0,z:36.3,width:12,depth:4.6,top:0,kind:'lava'});
    exit.x=2.7;exit.y=3.1;exit.z=41.7;
    ammo(3.6,32,3.1); enemy('scrap-goblin',3.2,40.5,3.1,39.1,42,'direct');
    check('UPPER WALKWAY',3,32.4,3.1,()=>flags.has('lift')); station(4,32.7,3.1,'WALKWAY',()=>flags.has('lift'));
    goals.push(()=>flags.has('gallery'),()=>a.owned.has('cyan'),()=>flags.has('stairs'),()=>flags.has('lift')&&flags.has('upper'),()=>a.won());
  } else {
    floor(1.75,3.5); floor(32.5,3);
    // No hidden floor under the ascent: missed crossings are actual pits.
    const decks=[{z:6,top:1.5},{z:11,top:3},{z:16,top:4.5},{z:23,top:6},{z:28,top:7.5}];
    for(let i=0;i<decks.length;i++)platform(0,decks[i].z,decks[i].top,10,5,`DECK ${i+1} / ${['ACCESS','EQUIPMENT','BRIDGE','FURNACE','EVACUATION'][i]}`);
    for(const [z,top] of [[2.8,0],[8,1.5],[13,3],[19.9,4.5],[25,6]])staging(0,z,top);
    stepBox=createCrate(0,2.7,0.8,'special'); wood(0,4.6,1,1.5);
    station(-3.5,2,0,'ENTRY'); ammo(-1,2.2);
    const equipment=lift('equipment',-3.6,7.2,1.5,3,2.2,2.4);
    relay('equipment',-3.6,4.2,9.6,'01 · EQUIPMENT LIFT / RETURN STEPS',()=>{equipment.target=equipment.target<2?3:1.5;flags.add('equipment');},{manual:true});
    // Return steps are enabled by the deck-two relay, so they cannot bypass the first climb.
    const returnSteps=[];
    for(let i=0;i<3;i++) {const obj=fixed(4.3,1.5+i*0.4,7.6+i*0.6,1.3,0.2,0.7,mats.metal);obj.collider.setEnabled(false);obj.mesh.visible=false;returnSteps.push({obj,surface:{x:4.3,z:7.6+i*0.6,top:1.6+i*0.4,width:1.3,depth:0.7}});}
    switches.find(s=>s.id==='equipment').action=()=>{equipment.target=equipment.target<2?3:1.5;if(!flags.has('equipment'))for(const s of returnSteps){s.obj.collider.setEnabled(true);s.obj.mesh.visible=true;surfaces.push(s.surface);}flags.add('equipment');};
    station(3.8,11,3,'DECK TWO',()=>flags.has('equipment')); check('DECK TWO',2.5,11,3,()=>flags.has('equipment'));
    ammo(-3.8,16,4.5); createCrate(-2.4,16.5,1.1,'metal',5.05);
    const bridgeObj=fixed(0,4.36,19.5,3.4,0.28,2,mats.special);
    bridgeObj.collider.setEnabled(false);bridgeObj.mesh.scale.z=0.001;
    const bridge={...bridgeObj,kind:'bridge',id:'bridge',open:false,t:0,surface:{x:0,z:19.5,top:4.5,width:3.4,depth:2}};movers.push(bridge);
    relay('bridge',1.25,5.65,20.25,'02 · EXTEND CROSSING',()=>{bridge.open=true;flags.add('bridge');});
    wire([[1.25,5.65,20.25],[1.6,4.6,20.7],[1.6,4.6,18.5]],()=>flags.has('bridge'));
    fuel(2.2,21.6,6); enemy('magma-brute',1.5,22,6,20.7,25);
    const vent=makeVentTrap({x:0,z:23.3,top:6,width:10,depth:1.15,switchX:5.6,switchY:7.3,switchZ:23.3,startsActive:true});
    // The tower furnace is controlled only by the plate and the manual master cut-off.
    vent.campaignControlled=true; vent.switchMesh.visible=false;
    const weight=plate('coolant',-3.5,21.7,6,on=>{vent.active=!(on||flags.has('shutdown'));});
    relay('shutdown',-3.5,7.25,25,'04 · PERMANENT FURNACE SHUTDOWN',()=>{flags.add('shutdown');vent.active=false;},{manual:true,allowed:()=>weight.active||flags.has('shutdown')});
    wire([[-3.5,6.07,21.7],[-4.8,6.07,21.7],[-4.8,6.07,25],[-3.5,7.25,25]],()=>weight.active||flags.has('shutdown'));
    check('FURNACE DECK',3.8,21.6,6,()=>flags.has('bridge')); station(4,21.5,6,'FURNACE DECK',()=>flags.has('bridge'));
    wood(2.2,28,1.1,7.5); makeKey('amber',2.2,28,7.5);
    fuel(-2.8,29,7.5); createCrate(0,28.2,1,'metal',8);
    enemy('horned-brute',-2.1,29,7.5,25.8,30.2,'cautious','amber'); enemy('scrap-goblin',3.7,29.3,7.5,25.8,30.2,'direct','amber');
    ammo(-3.6,27,7.5); exit.y=7.5;exit.z=30;exit.x=0;
    hazards.push({x:0,z:17,width:12,depth:34,top:-0.7,kind:'pit'});
    goals.push(()=>flags.has('equipment'),()=>flags.has('bridge'),()=>flags.has('furnace'),()=>flags.has('shutdown'),()=>a.won());
  }
  // The exit is a real keyed door; transition happens after its lowering animation.
  const departure=gate('departure',exit.x,exit.z,2.3,exit.y,2.6);
  departure.mesh.material=mats[spec.key];
  sign(`${spec.key.toUpperCase()} KEY · ${level===3?'EVACUATE':'NEXT SECTOR'}`,exit.x,exit.y+3,exit.z-0.2,3.7);
  const dropPreview=new THREE.Mesh(new THREE.BoxGeometry(0.82,0.82,0.82),new THREE.MeshBasicMaterial({color:0x67efc6,wireframe:true,transparent:true,opacity:0.65})); scene.add(dropPreview);dropPreview.visible=false;

  function nearControl() {
    const p=a.player(), f=a.forward();
    const facing=(x,z)=> (x-p.x)*f.x+(z-p.z)*f.z > -0.1;
    const s=switches.find(s=>s.manual&&facing(s.x,s.z)&&Math.hypot(p.x-s.x,p.z-s.z)<1.65&&Math.abs(p.y-s.y)<1.5);
    if(s)return {label:s.label,use:()=>activate(s)};
    const station=stations.find(s=>s.condition()&&facing(s.x,s.z)&&Math.hypot(p.x-s.x,p.z-s.z)<1.3&&Math.abs(a.feet()-s.top)<0.5);
    if(station)return {label:'RECOVER EQUIPMENT / REFILL CELLS',use:()=>recover(station)};
    return null;
  }
  function recover(s) {
    if(a.held()) {a.say('SET DOWN YOUR OBJECT FIRST');return;}
    const dest={x:s.x-1.1,y:s.top+0.43,z:s.z-0.6};
    stepBox.body.setTranslation(dest,true);stepBox.body.setLinvel({x:0,y:0,z:0},true);stepBox.body.setAngvel({x:0,y:0,z:0},true);stepBox.body.setRotation({x:0,y:0,z:0,w:1},true);
    const available=a.rocks.filter(r=>r!==a.held()&&(!r.armed||r.spent));
    for(let i=0;i<4;i++) {
      const r=available[i]; const p={x:s.x-0.6+(i%2)*0.4,y:s.top+0.2,z:s.z-1-Math.floor(i/2)*0.4};
      if(r){r.body.setTranslation(p,true);r.body.setLinvel({x:0,y:0,z:0},true);r.spent=false;r.armed=false;} else createRock(p.x,p.z,0.18,p.y);
    }
    a.sound('grab');a.say('EQUIPMENT RECOVERED · CELLS REFILLED');
  }
  function update(dt) {
    simTime+=dt;
    const p=a.player(),held=a.held();
    for(const plate of plates) {
      const q=stepBox.body.translation();
      plate.active=held!==stepBox&&Math.abs(q.x-plate.x)<0.62&&Math.abs(q.z-plate.z)<0.62&&Math.abs(q.y-stepBox.size/2-plate.top)<0.18;
      if(plate.active!==plate.wasActive){if(plate.wasActive!==undefined)a.sound('door');plate.wasActive=plate.active;}
      plate.action(plate.active);plate.mesh.material.color.setHex(plate.active?0x83f4ad:0x28747f);
    }
    for(const m of movers) {
      if(m.kind==='gate') {
        const old=m.t;m.t=THREE.MathUtils.clamp(m.t+(m.open?1:-1)*dt/1.35,0,1);
        // An occupied closing gate waits, preventing trapping or crushing.
        if(m.t<old&&Math.abs(p.x-m.x)<m.width/2+0.4&&Math.abs(p.z-m.z)<0.65){m.t=old;}
        const pos={x:m.x,y:m.base+m.height/2-m.t*(m.height+0.2),z:m.z};
        m.body.setNextKinematicTranslation(pos);m.mesh.position.copy(pos);m.marker.position.y=m.base+m.height-0.16-m.t*(m.height+0.2);
      } else if(m.kind==='lift') {
        const old=m.top;m.top=THREE.MathUtils.damp(m.top,m.target,1.5,dt); if(Math.abs(m.top-m.target)<0.015)m.top=m.target;
        const delta=m.top-old;
        m.surface.top=m.top;m.body.setNextKinematicTranslation({x:m.x,y:m.top-0.12,z:m.z});m.mesh.position.y=m.top-0.12;
        if(Math.abs(p.x-m.x)<m.width/2&&Math.abs(p.z-m.z)<m.depth/2&&Math.abs(a.feet()-old)<0.16&&!a.climbing())a.carryPlayer(delta);
        for(const c of a.crates) {if(c===held||c.type!=='special')continue;const q=c.body.translation();if(Math.abs(q.x-m.x)<m.width/2&&Math.abs(q.z-m.z)<m.depth/2&&Math.abs(q.y-c.size/2-old)<0.18){c.body.setTranslation({x:q.x,y:q.y+delta,z:q.z},true);c.body.setLinvel({x:0,y:0,z:0},true);}}
      } else if(m.kind==='bridge'&&m.open) {
        m.t=Math.min(1,m.t+dt);m.mesh.scale.z=Math.max(0.001,m.t);
        if(m.t===1&&!surfaces.includes(m.surface)){m.collider.setEnabled(true);surfaces.push(m.surface);}
      }
    }
    for(const w of wires)w.mesh.material.color.setHex(w.active()?0x7affc7:0x426974);
    for(const c of checks)if(!flags.has(`checkpoint:${c.id}`)&&c.condition()&&Math.hypot(p.x-c.x,p.z-c.z)<2&&Math.abs(a.feet()-c.top)<0.3){flags.add(`checkpoint:${c.id}`);checkpoint={x:c.x,y:c.top+0.91,z:c.z};checkpointName=c.id;a.heal();a.say(`CHECKPOINT · ${c.id}`);}
    if(level===2){if(p.z>7&&p.z<18&&a.feet()>1.4)flags.add('gallery');if(p.z>31&&a.feet()>2.9)flags.add('upper');}
    if(level===3&&a.feet()>5.8&&p.z>20.5)flags.add('furnace');
    if(stepBox!==held&&stepBox.body.translation().y<-2){stepBox.body.setTranslation({x:checkpoint.x-1,y:checkpoint.y-0.48,z:checkpoint.z},true);stepBox.body.setLinvel({x:0,y:0,z:0},true);a.say('STEP BOX RECOVERED AT CHECKPOINT');}
    for(let i=0;i<goals.length;i++)document.getElementById(`goal-${i}`)?.classList.toggle('done',!!goals[i]());
    dropPreview.visible=held?.type==='special';
    if(dropPreview.visible){const target=placement();dropPreview.visible=!!target;if(target)dropPreview.position.copy(target);}
  }
  function placement() {
    const p=a.player(),f=a.forward(),x=p.x+f.x*1.05,z=p.z+f.z*1.05;
    const plate=plates.find(s=>Math.hypot(s.x-x,s.z-z)<0.85&&Math.abs(a.feet()-s.top)<0.3);
    const lift=movers.find(s=>s.kind==='lift'&&Math.hypot(s.x-x,s.z-z)<1&&Math.abs(a.feet()-s.top)<0.3);
    const pad=stagingPads.find(s=>Math.hypot(s.x-p.x,s.z-p.z)>0.83&&Math.hypot(s.x-x,s.z-z)<0.8&&Math.abs(a.feet()-s.top)<0.3);
    const snap=plate||pad||lift;
    return {x:snap?.x??x,y:(snap?.top??a.feet())+0.43,z:snap?.z??z};
  }
  function blocked(enemy,x,z) {
    const b=enemy.zone;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)return true;
    return solids.some(s=>s.obj.collider.isEnabled()&&s.obj.body.translation().y+s.h/2>enemy.homeElevation+0.2&&s.obj.body.translation().y-s.h/2<enemy.homeElevation+1.7&&Math.abs(s.obj.body.translation().x-x)<s.w/2+0.36&&Math.abs(s.obj.body.translation().z-z)<s.d/2+0.36);
  }
  function hint() {
    const i=goals.findIndex(g=>!g());
    return [
      ['Break the packing crate and hit the cyan relay.','Put the small metal box on the glowing floor plate.','Find amber behind wood. Unlock the side passage from inside.','Recover your box through the shortcut; carry it onto the loading deck.','Use the amber key at the balcony door.'],
      ['Use the step box to climb onto the raised firing gallery.','From above, ignite the fuel behind the barricade. Find cyan in the booth.','Use the booth control to unlock the return stairs; retrieve your box.','Take the box onto the freight lift. Space operates its control.','Clear the wooden landing, cross the metal islands, and use cyan at the exit.'],
      ['Carry your step box upward; use the deck-two equipment relay.','Hit the large bridge relay across the gap. Lure the brute toward fuel.','Carry the box across the bridge to climb onto deck four.','Weight the coolant plate, cross the jets, then use the master shutdown.','Recover the box, reach deck five, break the key enclosure, and evacuate.']
    ][level-1][Math.max(0,i)]||'Proceed to the departure door.';
  }
  return {spec,spawn,exit,departure,surfaces,movers,switches,plates,stations,hazards,enemySpawns,flags,solids,stepBox,activate,nearControl,update,placement,blocked,hint,get checkpoint(){return checkpoint;},get checkpointName(){return checkpointName;}};
}
