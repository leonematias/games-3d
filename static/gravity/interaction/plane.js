/**
 * Placement plane math, independent of Three.js.
 * Y is up. The plane is horizontal: y = height, normal +Y.
 * A ray nearly parallel to the plane is unavailable rather than a distant hit.
 */

const PARALLEL = 1e-4;
const MAX_DISTANCE = 1e5;

export function hitPlacementPlane(origin, direction, height) {
  if (!finite3(origin) || !finite3(direction) || !Number.isFinite(height)) return null;
  if (Math.abs(direction[1]) < PARALLEL) return null;
  const t = (height - origin[1]) / direction[1];
  if (!(t > 0) || t > MAX_DISTANCE) return null;
  const point = [
    origin[0] + t * direction[0],
    height,
    origin[2] + t * direction[2],
  ];
  if (!finite3(point)) return null;
  return point;
}

function finite3(value) {
  return Number.isFinite(value[0]) && Number.isFinite(value[1]) && Number.isFinite(value[2]);
}
