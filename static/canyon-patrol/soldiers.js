import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';

export async function loadSoldiers(scene){
  const asset=await new GLTFLoader().loadAsync('/games-3d/character/api/characters/line-trooper/glb');
  const clips = Object.fromEntries(asset.animations.map(c => [c.name.toLowerCase(), c]));
  function spawn(start,offset,index=0){
    const model = clone(asset.scene);
    model.updateMatrixWorld(true);
    model.traverse(n => { if (n.isSkinnedMesh) n.skeleton.update(); });
    const bounds = new THREE.Box3().setFromObject(model, true);
    const scale = 1.85 / (bounds.max.y - bounds.min.y);
    model.scale.setScalar(scale);
    // The rig's toes and face point along local +Z. Keep that axis for all poses.
    if (index === 0) model.getObjectByName('helmet_sci_visor').visible = false;
    model.position.y = -bounds.min.y * scale;
    const root = new THREE.Group();
    root.add(model);
    scene.add(root);
    return {root, start, offset, mixer: new THREE.AnimationMixer(model), down: false};
  }

  function pose(member, name) {
    if (member.pose === name) return;
    const action = member.mixer.clipAction(clips[name]);
    action.reset();
    if (name === 'death') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    member.action?.fadeOut(.14);
    action.fadeIn(.14).play();
    member.pose = name;
    member.action = action;
  }

  return {spawn,pose};
}
