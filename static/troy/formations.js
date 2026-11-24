import * as T from 'three';
import {mergeGeometries} from '/games-3d/static/destructable-meshes/vendor/BufferGeometryUtils.js';
import {mesh,box,rod,surface,clamp,shadow} from '../field-narratives/landscape.js';
import {armySize} from './story.js';
import {land} from './landscape.js';

// At formation distance, one colored mesh carries the helmet, tunic, greaves, round shield and spear.
function rankPose(trojan,forward,standard){
  const g=new T.Group();
  const dye=surface(trojan?'#963c30':'#26556a'),bronze=surface('#ab8148'),light=surface('#debd79'),
    skin=surface('#9e6b49'),leather=surface('#583a2a'),wood=surface('#84623e');
  const body=(x,y,z,top,bottom,height,mat,sides=7)=>mesh(g,new T.CylinderGeometry(top,bottom,height,sides),mat,x,y,z);
  for(const side of [-1,1]){
    const z=side*forward*.22;
    rod(g,skin,[side*.14,.82,0],[side*.17,.46,z],.105);
    rod(g,bronze,[side*.17,.45,z],[side*.16,.12,z],.09,.07);
    box(g,leather,side*.16,.08,z+.045,.16,.13,.27);
  }
  body(0,.80,0,.21,.32,.38,dye);body(0,1.12,0,.31,.22,.43,bronze);
  body(0,1.49,0,.135,.12,.26,skin);body(0,1.67,0,.10,.185,.20,bronze);
  box(g,dye,0,1.77,-.045,.065,.145,.35);box(g,bronze,0,1.55,.125,.042,.15,.048);
  const y=1.10+.09*forward,z=.14+.19*forward;
  rod(g,skin,[.25,1.33,0],[.36,y,z],.083);
  const tipZ=standard?.1:z+.68+forward*.47,tipY=standard?3.8:2.53-.32*forward;
  rod(g,wood,[.36,.31,z-.35],[.36,tipY,tipZ],.025);
  if(standard){box(g,dye,.59,3.25,.1,.52,.86,.04);box(g,light,.59,3.02,.13,.52,.09,.035);}
  else{const tip=mesh(g,new T.ConeGeometry(.055,.23,5),light,.36,tipY+.075,tipZ+.045);tip.rotation.x=.54+forward*.3;}
  const shield=mesh(g,new T.CylinderGeometry(.37,.37,.07,12),bronze,-.24,1.04,.23);shield.rotation.x=Math.PI/2;
  mesh(shield,new T.CylinderGeometry(.32,.32,.035,12),dye,0,.05,0);
  mesh(shield,new T.ConeGeometry(.104,.09,8),light,0,.11,0);
  g.updateMatrixWorld(true);
  const geometries=[];
  g.traverse(n=>{
    if(!n.isMesh)return;
    const geom=n.geometry.toNonIndexed();geom.applyMatrix4(n.matrixWorld);geom.deleteAttribute('uv');
    const colors=new Float32Array(geom.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)n.material.color.toArray(colors,i);
    geom.setAttribute('color',new T.BufferAttribute(colors,3));geometries.push(geom);n.geometry.dispose();
  });
  const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
  for(const mat of [dye,bronze,light,skin,leather,wood])mat.dispose();
  return geometry;
}
export function formations(scene){
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.78});
  const sides=[false,true].map(trojan=>[-1,0,1,0].map((f,i)=>{
    const batch=new T.InstancedMesh(rankPose(trojan,f,i===3),material,armySize);
    batch.frustumCulled=false;batch.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(batch);return batch;
  }));
  const footprint=new T.Group();shadow(footprint,1.28,1.5);
  const patch=footprint.children[0];patch.geometry.rotateX(-Math.PI/2);
  const shadows=new T.InstancedMesh(patch.geometry,patch.material,armySize*2);
  shadows.frustumCulled=false;shadows.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(shadows);
  const dummy=new T.Object3D();
  return (s,st,t)=>{
    const field=s.chapter===1,gate=s.chapter===6;
    shadows.visible=field||gate;shadows.count=0;
    for(const group of sides)for(const batch of group){batch.count=0;batch.visible=field||gate;}
    if(!field&&!gate)return;
    const clash=st.id==='challenge'||st.id==='square',march=st.id==='host';
    for(let team=0;team<2;team++)for(let i=0;i<armySize;i++){
      const block=Math.floor(i/48),file=i%8,row=Math.floor(i/8)%6;
      const phase=t*(clash?4.3:2.95)+i*.47;
      let x,z;
      const gained=st.id==='hector'?3:st.id==='challenge'?(s.company??0):0;
      if(field){
        x=(block<2?-1:1)*(8+(block%2)*15+file*1.39);
        const push=st.id==='challenge'?Math.min(7.2,s.stepTime*.85):st.id==='hector'?6:0;
        z=(team?14+push-row*1.67:30-push+row*1.67)-gained*1.05;
        if(!row&&clash)z+=(team?1:-1)*(.48+.35*Math.sin(phase));
      }else{
        const rank=Math.floor(i/12),lane=i%12-5.5;
        const shift=st.id==='host'?Math.min(14,s.stepTime*1.4):st.id==='square'?16:20;
        const retreat=st.id==='dawn'?Math.min(13,s.stepTime*1.9):0;
        z=team?-23-rank*1.45-(shift-14)*.3-retreat:18+rank*1.55-shift;
        x=lane*(team?1.71:.54+clamp(Math.abs(z)/13,0,1)*1.32);
      }
      const active=(clash&&row<2)||march;
      const pose=i%48===3?3:active?Math.floor((phase%6.28)/6.28*3):1;
      const batch=sides[team][pose];
      const y=land(x,z);
      dummy.position.set(x,y+(active?.036*Math.abs(Math.sin(phase)):0),z);
      dummy.rotation.y=(team?0:Math.PI)+Math.sin(i*13.4)*.09;
      if(st.id==='hector'&&file<3)dummy.rotation.y=Math.atan2(-x,13-z);
      dummy.scale.setScalar(.94+.07*Math.sin(i*14.6));dummy.updateMatrix();batch.setMatrixAt(batch.count++,dummy.matrix);
      dummy.position.set(x+.09,y+.045,z-.09);dummy.updateMatrix();shadows.setMatrixAt(shadows.count++,dummy.matrix);
    }
    shadows.instanceMatrix.needsUpdate=true;
    for(const group of sides)for(const batch of group)batch.instanceMatrix.needsUpdate=true;
  };
}
