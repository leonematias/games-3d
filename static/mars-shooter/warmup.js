// Compile and draw every material once before input is enabled. Drawing also
// uploads geometry/textures and builds the shadow programs compileAsync omits.
export async function warmupRenderer(renderer,passes){
 const started=performance.now(),saved=[],textures=new Set();
 for(const {scene} of passes)scene.traverse(object=>{
  saved.push([object,object.visible,object.frustumCulled]);object.visible=true;object.frustumCulled=false;
  for(const material of [object.material].flat())if(material){
   for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
   for(const uniform of Object.values(material.uniforms||{}))if(uniform.value?.isTexture)textures.add(uniform.value);
  }
 });
 try{
  for(const texture of textures)renderer.initTexture(texture);
  for(const {scene,camera} of passes){
   scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
   if(renderer.compileAsync)await renderer.compileAsync(scene,camera);else renderer.compile(scene,camera);
   renderer.render(scene,camera);
  }
  // Loading-only GPU fence: don't defer the first warm-up draws until play.
  renderer.getContext().finish();
 }finally{
  for(const [object,visible,frustumCulled] of saved){object.visible=visible;object.frustumCulled=frustumCulled;}
 }
 return {milliseconds:Math.round(performance.now()-started),programs:renderer.info.programs.length,textures:textures.size};
}
