import * as T from 'three';
import {mergeGeometries} from '/games-3d/static/destructable-meshes/vendor/BufferGeometryUtils.js';
import {instantiate} from '/games-3d/static/medieval/rig.js';

import {romanRig} from './roman-rig.js';

const WALK_POSES = 6;
const ATTACK_POSES = 6;
const DEATH_POSES = 5;
const CYCLE = 2 * Math.PI;

// Sample the Character Creator rig once per pose so the ranks can share
// instanced geometry. Nearby soldiers still use the original textured rig.
function bakePose(rig, parts, clip, phase) {
  const action = rig.play(clip, {fade: 0, restart: true});
  action.stopFading().setEffectiveWeight(1);
  rig.mixer.setTime(action.getClip().duration * phase);
  rig.settle?.();
  rig.model.updateMatrixWorld(true);
  const vertex = new T.Vector3();
  const geometries = parts.map(({mesh, colors, surface}) => {
    const source = mesh.geometry;
    const geometry = new T.BufferGeometry();
    const position = source.getAttribute('position').clone();
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, vertex);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geometry.setAttribute('position', position);
    geometry.setAttribute('color', colors);
    geometry.setAttribute('surface', surface);
    geometry.setIndex(source.index);
    if (mesh.isSkinnedMesh) geometry.computeVertexNormals();
    else geometry.setAttribute('normal', source.getAttribute('normal').clone());
    return geometry.applyMatrix4(mesh.matrixWorld);
  });
  return mergeGeometries(geometries);
}

// The idle clip has a repeating breath and a head turn a quarter-cycle apart.
// Bake both components so each instance can breathe smoothly at its own phase.
function bakeIdle(rig, parts, capacity) {
  const poses = [0, .25, .5, .75].map(phase => bakePose(rig, parts, 'idle', phase));
  const geometry = poses[0];
  for (const attribute of ['position', 'normal']) {
    for (const [suffix, high, low] of [['Breath', 2, 0], ['Sway', 1, 3]]) {
      const values = new Float32Array(geometry.attributes[attribute].array.length);
      const a = poses[high].attributes[attribute].array;
      const b = poses[low].attributes[attribute].array;
      for (let i = 0; i < values.length; i++) values[i] = (a[i] - b[i]) * .5;
      geometry.setAttribute(attribute + suffix, new T.BufferAttribute(values, 3));
    }
  }
  geometry.setAttribute('idleWeights', new T.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(T.DynamicDrawUsage));
  return geometry;
}

export function createPresetRanks(scene, templates, romans=false) {
  const material = new T.MeshStandardMaterial({vertexColors: true, metalness: 1, roughness: 1});
  material.onBeforeCompile = shader => {
    // Preserve the preset's cloth, leather and metal response in one batch.
    shader.vertexShader = 'attribute vec2 surface; varying vec2 vSurface;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = surface;');
    shader.fragmentShader = 'varying vec2 vSurface;\n' + shader.fragmentShader
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vSurface.x;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vSurface.y;');
  };
  const idleMaterial = material.clone();
  idleMaterial.onBeforeCompile = shader => {
    material.onBeforeCompile(shader);
    shader.vertexShader = `
      attribute vec2 idleWeights;
      attribute vec3 positionBreath, positionSway, normalBreath, normalSway;
    ` + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += positionBreath * idleWeights.x + positionSway * idleWeights.y;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal += normalBreath * idleWeights.x + normalSway * idleWeights.y;');
  };
  // Watch captains and ambush leaders can share a preset beyond its usual quota.
  const capacity = Math.ceil(128 / templates.length)+5;
  const idleDurations = templates.map(t => t.clips.find(clip => clip.name === 'idle').duration);
  const variants = templates.map(template => {
    const rig = romans ? romanRig(template,true) : instantiate(template);
    const parts = [];
    rig.model.traverse(mesh => {
      if (!mesh.isMesh || !mesh.visible) return;
      const count = mesh.geometry.getAttribute('position').count;
      const rgb = new Float32Array(count * 3);
      const finish = new Float32Array(count * 2);
      const tint = new T.Color();
      const vertexColors = mesh.geometry.getAttribute('color');
      const {color, metalness, roughness} = mesh.material;
      for (let i = 0; i < count; i++) {
        tint.copy(color);
        if (vertexColors) {
          tint.r *= vertexColors.getX(i);
          tint.g *= vertexColors.getY(i);
          tint.b *= vertexColors.getZ(i);
        }
        tint.toArray(rgb, i * 3);
        finish[i * 2] = metalness;
        finish[i * 2 + 1] = roughness;
      }
      parts.push({mesh, colors: new T.BufferAttribute(rgb, 3), surface: new T.BufferAttribute(finish, 2)});
    });
    const poses = [
      bakeIdle(rig, parts, capacity),
      ...Array.from({length: WALK_POSES}, (_, i) => bakePose(rig, parts, 'walk', i / WALK_POSES)),
      ...Array.from({length: ATTACK_POSES}, (_, i) => bakePose(rig, parts, 'attack', (i + 0.5) / ATTACK_POSES))
    ];
    if(romans)for(let i=0;i<DEATH_POSES;i++)poses.push(bakePose(rig,parts,'death',i/(DEATH_POSES-1)*.999));
    rig.dispose();
    return poses.map((geometry, index) => {
      const mesh = new T.InstancedMesh(geometry, index === 0 ? idleMaterial : material, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    });
  });
  const meshes = variants.flat();
  return {
    reset() {
      for (const mesh of meshes) mesh.count = 0;
    },
    draw(actor, variant, matrix, clip, idleTime) {
      let pose = 0;
      if (clip === 'death' && romans) {
        pose = 1 + WALK_POSES + ATTACK_POSES + Math.min(DEATH_POSES-1,Math.floor(actor.fallen/.85*DEATH_POSES));
      } else if (clip === 'attack') {
        const progress = 1 - actor.swing / 0.48;
        pose = 1 + WALK_POSES + Math.min(ATTACK_POSES - 1, Math.floor(progress * ATTACK_POSES));
      } else if (clip === 'walk') {
        pose = 1 + Math.floor((actor.step % CYCLE) / CYCLE * WALK_POSES);
      }
      const mesh = variants[variant][pose];
      if (pose === 0) {
        const phase = clip === 'idle' ? CYCLE * idleTime / idleDurations[variant] : 0;
        mesh.geometry.attributes.idleWeights.setXY(mesh.count, 1 - Math.cos(phase), Math.sin(phase));
      }
      mesh.setMatrixAt(mesh.count++, matrix);
    },
    flush() {
      for (const mesh of meshes) {
        mesh.visible = mesh.count > 0;
        if (mesh.visible) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.geometry.attributes.idleWeights) mesh.geometry.attributes.idleWeights.needsUpdate = true;
        }
      }
    }
  };
}
