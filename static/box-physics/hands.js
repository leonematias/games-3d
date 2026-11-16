import * as THREE from 'three';

// Compact suit-mounted manipulators. Two articulated steel jaws on each wrist
// read as deliberate grippers without covering the crate or pretending to be skin.
export function createHands(camera) {
  const rig = new THREE.Group();
  camera.add(rig);
  const armor = new THREE.MeshStandardMaterial({ color: 0x607580, metalness: 0.62, roughness: 0.38, emissive: 0x193038, emissiveIntensity: 0.32, depthTest: false, depthWrite: false });
  const edge = new THREE.MeshStandardMaterial({ color: 0x101f27, metalness: 0.65, roughness: 0.42, depthTest: false, depthWrite: false });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8d4d8, metalness: 0.72, roughness: 0.24, emissive: 0x304b52, emissiveIntensity: 0.25, depthTest: false, depthWrite: false });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1b2b2e, metalness: 0.25, roughness: 0.87, depthTest: false, depthWrite: false });
  const light = new THREE.MeshBasicMaterial({ color: 0x76e4df, depthTest: false, depthWrite: false });

  function add(parent, geometry, material, point) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...point);
    mesh.renderOrder = 110;
    parent.add(mesh);
    return mesh;
  }
  function link(parent, a, b, radius, material, sides = 8) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mesh = add(parent, new THREE.CylinderGeometry(radius * 0.9, radius, start.distanceTo(end), sides), material, [0, 0, 0]);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return mesh;
  }
  function plate(parent, a, b, width, height, material) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mesh = add(parent, new THREE.BoxGeometry(width, height, start.distanceTo(end)), material, [0, 0, 0]);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), end.sub(start).normalize());
    return mesh;
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    rig.add(arm);
    const shoulder = [side * 0.82, -0.94, -0.34];
    const elbow = [side * 0.61, -0.76, -0.62];
    const wrist = [side * 0.49, -0.55, -0.98];
    plate(arm, shoulder, elbow, 0.155, 0.12, armor);
    plate(arm, [side * 0.74, -0.88, -0.43], [side * 0.63, -0.78, -0.59], 0.11, 0.012, light);
    add(arm, new THREE.SphereGeometry(0.075, 12, 8), edge, elbow);
    add(arm, new THREE.SphereGeometry(0.045, 10, 8), steel, [elbow[0] - side * 0.025, elbow[1], elbow[2]]);
    link(arm, [elbow[0] - side * 0.02, elbow[1] - 0.02, elbow[2]], [wrist[0], wrist[1] - 0.025, wrist[2] + 0.055], 0.026, steel);
    plate(arm, [side * 0.59, -0.72, -0.67], wrist, 0.105, 0.115, armor);
    add(arm, new THREE.BoxGeometry(0.19, 0.115, 0.2), edge, wrist);
    add(arm, new THREE.BoxGeometry(0.145, 0.025, 0.09), armor, [wrist[0], wrist[1] + 0.065, wrist[2] - 0.025]);
    add(arm, new THREE.BoxGeometry(0.075, 0.012, 0.018), light, [wrist[0], wrist[1] + 0.08, wrist[2] - 0.035]);

    // Two opposed jaws on each hand; each has one visible hinge and a rubber tip.
    for (const jawSide of [-1, 1]) {
      const x = wrist[0] + jawSide * 0.082;
      const hinge = [x, -0.55, -1.07];
      add(arm, new THREE.BoxGeometry(0.043, 0.036, 0.052), steel, hinge);
      const knuckle = [x + jawSide * 0.008, -0.58, -1.17];
      const tip = [x - jawSide * 0.01, -0.66, -1.205];
      link(arm, hinge, knuckle, 0.024, armor, 6);
      link(arm, knuckle, tip, 0.02, steel, 6);
      add(arm, new THREE.BoxGeometry(0.046, 0.045, 0.045), grip, tip);
    }
    arms.push(arm);
  }
  rig.visible = false;
  return {
    update(carrying, climbProgress, time) {
      rig.visible = carrying || climbProgress !== null;
      if (!rig.visible) return;
      const motion = climbProgress === null ? 0 : Math.sin(Math.PI * climbProgress);
      rig.position.y = 0.09 + (climbProgress === null ? Math.sin(time * 3.3) * 0.004 : motion * 0.19);
      rig.position.z = -motion * 0.08;
      for (let i = 0; i < arms.length; i++) {
        arms[i].rotation.x = -motion * 0.35;
        arms[i].rotation.z = (i ? -1 : 1) * motion * 0.09;
      }
    },
  };
}
