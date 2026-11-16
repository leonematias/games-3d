export const WOOD_BOX_TEXTURES = [
  './assets/textures/wood_box.png',
  './assets/textures/wood_box2.png',
  './assets/textures/wood_box3.png'
];

export function woodBoxTextureFor(item) {
  const chosen = item?.tex;
  if (typeof chosen === 'string' && WOOD_BOX_TEXTURES.includes(chosen)) return chosen;
  const x = Number(item?.x) || 0;
  const z = Number(item?.z) || 0;
  return WOOD_BOX_TEXTURES[Math.abs((x + z * 2) % WOOD_BOX_TEXTURES.length)];
}
