// Survey transmitters follow the saddles around the escarpment, in acquisition order.
export const fixes=[
  [-175,-235],[-410,-180],[-610,-365],[-700,-615],[-464,-710],
  [-215,-606],[-270,-400],[-123,-307],[-88,-143]
];

export function raiseRanges(heightmap,size,route,driving){
  const {width,height,heights}=heightmap;
  const scale=driving?2.9:1;
  for(let j=0;j<height;j++)for(let i=0;i<width;i++){
    const x=(i/(width-1)-.5)*size,z=(j/(height-1)-.5)*size;
    const distance=route.nearest(x,z).distance;
    const shoulder=driving?14:30;
    const t=Math.max(0,Math.min(1,(distance-shoulder)/(driving?90:48)));
    const u=x/scale,v=z/scale;
    // Long folded ridges, with broken summits and shorter overlapping spurs.
    const fold=u+.46*v+19*Math.sin(v/34)+11*Math.sin(u/24);
    const spine=1-Math.abs(Math.sin(fold/32));
    const spur=1-Math.abs(Math.sin((v-.39*u+9*Math.sin(u/17))/24));
    const peaks=(15+51*spine**1.5+27*spur**2)*(.74+.26*Math.cos(v/21));
    const n=j*width+i;
    heights[n]=heights[n]*11+(driving?14+5*Math.sin(x/93)+7*Math.cos(z/126):0)
      +scale*t*t*(3-2*t)*peaks;
  }
}
