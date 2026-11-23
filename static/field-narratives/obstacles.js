// Traverse props are static. Only inspect colliders in the tiles touched by this step.
export function obstacles(tileSize=18){
 const tiles=new Map();
 function key(x,z){return Math.floor(x/tileSize)+','+Math.floor(z/tileSize);}
 return {
  add(x,z,r){
   const id=key(x,z);if(!tiles.has(id))tiles.set(id,[]);tiles.get(id).push({x,z,r});
  },
  deflect(s,r){
   let bumped=false;
   for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
    const list=tiles.get(key(s.x+i*tileSize,s.z+j*tileSize));if(!list)continue;
    for(const tree of list){
     const dx=s.x-tree.x,dz=s.z-tree.z,d=Math.hypot(dx,dz),margin=r+tree.r;
     if(d>=margin)continue;
     const angle=d>.001?Math.atan2(dx,-dz):s.yaw+Math.PI;
     s.x=tree.x+Math.sin(angle)*margin;s.z=tree.z-Math.cos(angle)*margin;bumped=true;
    }
   }
   return bumped;
  }
 };
}
