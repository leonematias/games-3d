// Tank and turret fronts are local +Z.
// rotation.y = yaw sends that front to (sin(yaw), 0, cos(yaw)).
// yaw 0 → (0, 0, 1). This is the only yaw-to-direction formula.
export function planarForward(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

// Inverse of planarForward. A +Z front uses rotation.y = yawToward(dx, dz).
export function yawToward(dx, dz) {
  return Math.atan2(dx, dz);
}
