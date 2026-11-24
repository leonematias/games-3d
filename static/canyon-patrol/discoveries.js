import * as THREE from 'three';
import {buildShip} from '../solar-system/ship.js';

export function buildDiscoveries(scene, world, stops) {
  const metal = new THREE.MeshStandardMaterial({color: 0x58616a, roughness: .63});
  const blue = new THREE.MeshBasicMaterial({color: 0x65dcff});
  const green = new THREE.MeshBasicMaterial({color: 0x68ffd1});
  const shell = new THREE.MeshStandardMaterial({color: 0x706348, side: THREE.DoubleSide});
  const stake = new THREE.CylinderGeometry(.09, .15, 1.6, 6);
  const bulb = new THREE.SphereGeometry(.19, 8, 6);
  function prop(geometry, material, s, offset, height, name) {
    const p = world.route.at(s, offset);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(p.x, world.terrain.heightAt(p.x, p.z) + height, p.z);
    mesh.name=name;scene.add(mesh);
    return mesh;
  }
  function lamp(s, offset, color) {
    prop(stake, metal, s, offset, .8,"Trail stake");
    return prop(bulb, color, s, offset, 1.66,color===blue?"Blue stake lamp":"Green stake lamp");
  }
  const beacon = lamp(stops.beacon + 7, -2, blue);
  const box = prop(new THREE.BoxGeometry(1.25, .75, .8), metal, stops.beacon + 7, -2, .38,"Survey beacon case");
  box.rotation.y = .4;
  for(const side of [-1,1]){
    for(const step of [0,2,4])lamp(stops.beacon+6+step,side*(2+.65*step),side<0?blue:green);
  }
  for (const s of [30, 40, 52]) lamp(s, -4, blue);
  for (let i = 0; i < 8; i++) {
    const egg = prop(new THREE.SphereGeometry(.6, 7, 5, 0, Math.PI * 2, .83, 2.31),
      shell, stops.nest + 4 + i * 1.1, 2 + Math.sin(i * 3) * 1.3, .42,"Broken shell");
    egg.scale.y = 1.45;
    egg.rotation.z = Math.sin(i) * .65;
  }
  for (const side of [-1, 1]) lamp(stops.gate + 8, side * 3.8, green);

  const craft = buildShip();
  const ship = craft.group;
  ship.name="Kestrel flyby";ship.scale.setScalar(.55);
  ship.visible = false;
  scene.add(ship);
  const origin = world.route.at(stops.flyby);
  const forward = new THREE.Vector3(-Math.sin(origin.yaw), 0, -Math.cos(origin.yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const start = new THREE.Vector3(origin.x, 0, origin.z).addScaledVector(forward, 23).addScaledVector(right, -25);
  const end = start.clone().addScaledVector(forward, 85).addScaledVector(right, 65);
  // Clear the ridge throughout the pass, including the hull and its wingtips.
  let elevation = world.terrain.heightAt(origin.x, origin.z) + 17;
  for (let i = 0; i <= 30; i++) {
    const p = start.clone().lerp(end, i / 30);
    for (const offset of [-5, 0, 5]) elevation = Math.max(elevation, world.terrain.heightAt(p.x + right.x * offset, p.z + right.z * offset) + 6);
  }
  start.y = elevation;
  end.y = elevation + 7;
  ship.rotation.y = Math.atan2(start.x - end.x, start.z - end.z);
  craft.plume.material.opacity = .7;
  craft.innerPlume.material.opacity = .85;
  function fly(time) {
    ship.visible = time < 13;
    ship.position.lerpVectors(start, end, Math.min(1, time / 13));
    ship.rotation.z = -.16 + .09 * Math.sin(time * .5);
  }
  return {beacon, ship, fly};
}
