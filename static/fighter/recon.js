import { Vector3 } from 'three';

export function createSightCheck(terrain) {
  const sight = new Vector3(), sample = new Vector3();
  return (player, target, rangeLimit, cosine) => {
    sight.copy(target).sub(player.pos);
    const range = sight.length();
    if (range > rangeLimit || sight.dot(player.forward) < range * cosine) return false;
    const samples = Math.ceil(range / 22);
    for (let i = 1; i < samples; i++) {
      sample.copy(player.pos).addScaledVector(sight, i / samples);
      if (sample.y <= terrain.heightAt(sample.x, sample.z)) return false;
    }
    return true;
  };
}
