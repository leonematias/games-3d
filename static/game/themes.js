// Per-theme look: sky, fog, lights, ambient particles, props, decals. Levels carry `theme` (set by
// backend/tools/retexture_levels.py); anything else falls back to `classic`.

const LOOKS = {
  classic: {
    sky: { top: 0x0b1020, horizon: 0x33427a, ground: 0x0a0d18, sun: 0xffffff, sunPos: [0.6, 0.35] },
    fog: { color: 0x1a2240, near: 16, far: 58 },
    hemi: { sky: 0xd8e2ff, ground: 0x222233, intensity: 0.8 },
    sun: { color: 0xffffff, intensity: 1.0, position: [5, 10, 3] },
    exposure: 1.0,
    particles: 'dust',
    props: { wallTop: ['boulder', 'barrel', 'lamp'], floor: ['rubble', 'pebbles'], clutter: ['pebbles'] },
    decals: ['cracks', 'scorch'],
    waterTex: ['water.png', 'water2.png'],
    lavaTex: ['lava.jpg']
  },
  meadow: {
    sky: { top: 0x3f8fe8, horizon: 0xcfe6fb, ground: 0x7a9a5a, sun: 0xfff6d8, sunPos: [0.32, 0.42] },
    fog: { color: 0xcfe3f5, near: 15, far: 50 },
    hemi: { sky: 0xbfdcff, ground: 0x4d6b3a, intensity: 0.75 },
    sun: { color: 0xfff1d6, intensity: 1.25, position: [6, 11, 4] },
    exposure: 1.05,
    particles: 'leaves',
    props: { wallTop: ['tree', 'pine', 'boulder', 'bush'], floor: ['grass', 'pebbles', 'rubble', 'mushroom'], clutter: ['grass', 'pebbles'] },
    decals: ['puddle'],
    foliage: { tuft: 0x5fa83d, leaf: 0x3f8a2e, bark: 0x6b4a2b },
    waterTex: ['water.png'],
    lavaTex: []
  },
  cobble_town: {
    sky: { top: 0x5a8fd0, horizon: 0xe6d8c3, ground: 0x6b5a48, sun: 0xffe9c8, sunPos: [0.7, 0.3] },
    fog: { color: 0xd9d2c5, near: 18, far: 56 },
    hemi: { sky: 0xd9e4f5, ground: 0x4f4538, intensity: 0.7 },
    sun: { color: 0xffe7c4, intensity: 1.2, position: [7, 10, 2] },
    exposure: 1.02,
    particles: 'dust',
    props: { wallTop: ['lamp', 'barrel', 'chimney', 'crate'], floor: ['barrel', 'rubble', 'sandbags'], clutter: ['pebbles'] },
    decals: ['puddle', 'skid', 'cracks'],
    light: { color: 0xffc777 },
    waterTex: ['water.png'],
    lavaTex: []
  },
  dry_steppe: {
    sky: { top: 0x4f93d8, horizon: 0xf1dcb3, ground: 0x8a7a4a, sun: 0xfff0c0, sunPos: [0.75, 0.5] },
    fog: { color: 0xe8d6b0, near: 16, far: 52 },
    hemi: { sky: 0xe6e9f2, ground: 0x6b5a2e, intensity: 0.7 },
    sun: { color: 0xffe7b8, intensity: 1.35, position: [8, 9, -3] },
    exposure: 1.08,
    particles: 'dust',
    props: { wallTop: ['boulder', 'deadTree', 'bush', 'rocks'], floor: ['grass', 'pebbles', 'rocks', 'bones'], clutter: ['grass', 'pebbles'] },
    decals: ['cracks'],
    foliage: { tuft: 0xb8a14a, leaf: 0x8c8a3a, bark: 0x5c4630 },
    waterTex: ['water2.png'],
    lavaTex: []
  },
  mossy_ruins: {
    sky: { top: 0x44625a, horizon: 0xb7c8b0, ground: 0x2f4a3a, sun: 0xdfe9d8, sunPos: [0.4, 0.55] },
    fog: { color: 0x93a89a, near: 9, far: 34 },
    hemi: { sky: 0x9fb8a8, ground: 0x2f4a3a, intensity: 0.7 },
    sun: { color: 0xdfe9d8, intensity: 0.8, position: [4, 10, 5] },
    exposure: 1.0,
    particles: 'rain',
    props: { wallTop: ['column', 'boulder', 'tree', 'bush'], floor: ['rubble', 'mushroom', 'grass', 'column'], clutter: ['grass', 'pebbles'] },
    decals: ['puddle', 'cracks'],
    foliage: { tuft: 0x4f8a3a, leaf: 0x2f6a2e, bark: 0x4a3a2b },
    waterTex: ['water.png'],
    lavaTex: []
  },
  bunker: {
    sky: { top: 0x3b4049, horizon: 0x6f7682, ground: 0x2a2d33, sun: 0xcfd8e3, sunPos: [0.5, 0.5] },
    fog: { color: 0x3b4049, near: 6, far: 28 },
    hemi: { sky: 0x8c96a3, ground: 0x1f232a, intensity: 0.65 },
    sun: { color: 0xcfd8e3, intensity: 0.7, position: [3, 10, 2] },
    exposure: 1.0,
    particles: 'dust',
    props: { wallTop: ['vent', 'pipe', 'lamp', 'sandbags'], floor: ['sandbags', 'barrel', 'rubble', 'pipe'], clutter: [] },
    decals: ['oil', 'skid', 'cracks', 'scorch'],
    light: { color: 0xbfe0ff },
    waterTex: ['water2.png'],
    lavaTex: []
  },
  desert: {
    sky: { top: 0x3f8fe0, horizon: 0xf8e1b0, ground: 0xb8955a, sun: 0xfff6d0, sunPos: [0.65, 0.55] },
    fog: { color: 0xf1d9a8, near: 18, far: 62 },
    hemi: { sky: 0xf4ecd8, ground: 0x7a5a2e, intensity: 0.7 },
    sun: { color: 0xfff0c8, intensity: 1.45, position: [9, 11, -2] },
    exposure: 1.1,
    particles: 'dust',
    props: { wallTop: ['cactus', 'boulder', 'rocks', 'bones'], floor: ['bones', 'pebbles', 'cactus', 'rocks'], clutter: ['pebbles', 'grass'] },
    decals: ['cracks'],
    foliage: { tuft: 0xcfae5a, leaf: 0x4f8a3a, bark: 0x7a5a30 },
    waterTex: ['water.png'],
    lavaTex: []
  },
  lumber: {
    sky: { top: 0x4a8fd8, horizon: 0xd9e6cf, ground: 0x5a4a30, sun: 0xfff2d8, sunPos: [0.3, 0.4] },
    fog: { color: 0xd5e0cc, near: 14, far: 46 },
    hemi: { sky: 0xd4e4f4, ground: 0x4a3a24, intensity: 0.75 },
    sun: { color: 0xffedcc, intensity: 1.15, position: [5, 10, 4] },
    exposure: 1.02,
    particles: 'leaves',
    props: { wallTop: ['pine', 'tree', 'barrel', 'lamp', 'log'], floor: ['log', 'pebbles', 'grass', 'barrel'], clutter: ['grass', 'pebbles'] },
    decals: ['puddle'],
    foliage: { tuft: 0x6aa84a, leaf: 0x2f7a3e, bark: 0x6b4a2b },
    light: { color: 0xffc777 },
    waterTex: ['water.png'],
    lavaTex: []
  },
  frozen: {
    sky: { top: 0x6f9bd6, horizon: 0xe9f1fa, ground: 0xb8c6d6, sun: 0xf0f6ff, sunPos: [0.25, 0.3] },
    fog: { color: 0xdde8f3, near: 10, far: 38 },
    hemi: { sky: 0xd6e6ff, ground: 0x6a7a8a, intensity: 0.8 },
    sun: { color: 0xe3efff, intensity: 1.0, position: [4, 9, 6] },
    exposure: 1.05,
    particles: 'snow',
    props: { wallTop: ['pine', 'boulder', 'deadTree', 'rocks'], floor: ['rocks', 'rubble', 'pine', 'deadTree'], clutter: ['pebbles'] },
    decals: ['cracks'],
    foliage: { tuft: 0x9fb7c6, leaf: 0x2e5a44, bark: 0x4a3a2b },
    palette: { rock: 0x8a94a0, rubble: 0x9aa4b0 },
    waterTex: ['ice.jpg'],
    lavaTex: []
  },
  clinic: {
    sky: { top: 0xdfe6ee, horizon: 0xf2f5f8, ground: 0xc0c8d0, sun: 0xffffff, sunPos: [0.5, 0.5] },
    fog: { color: 0xdfe6ee, near: 9, far: 32 },
    hemi: { sky: 0xffffff, ground: 0x8c96a3, intensity: 0.85 },
    sun: { color: 0xffffff, intensity: 1.05, position: [3, 10, 2] },
    exposure: 1.0,
    particles: null,
    props: { wallTop: ['vent', 'lamp', 'pipe'], floor: ['barrel', 'crate', 'pipe'], clutter: [] },
    decals: ['skid', 'puddle'],
    light: { color: 0xe8f4ff },
    waterTex: ['water2.png'],
    lavaTex: []
  },
  volcano: {
    sky: { top: 0x1a0c0a, horizon: 0x7a2d12, ground: 0x2a1410, sun: 0xff9a5a, sunPos: [0.5, 0.2] },
    fog: { color: 0x3a1a12, near: 9, far: 34 },
    hemi: { sky: 0xa0472a, ground: 0x1a0a08, intensity: 0.95 },
    sun: { color: 0xffa060, intensity: 1.1, position: [4, 9, -4] },
    exposure: 1.0,
    particles: 'embers',
    props: { wallTop: ['boulder', 'spike', 'rocks', 'bones'], floor: ['rubble', 'bones', 'spike', 'rocks'], clutter: ['pebbles'] },
    decals: ['cracks', 'scorch'],
    palette: { rock: 0x3a2f2c, rubble: 0x4a3a34, bone: 0xd8c8b0 },
    waterTex: [],
    lavaTex: ['lava.jpg']
  },
  palace: {
    sky: { top: 0x9fb9e8, horizon: 0xf2e6d2, ground: 0x8a7a66, sun: 0xfff2d6, sunPos: [0.5, 0.4] },
    fog: { color: 0xc9c2b8, near: 10, far: 42 },
    hemi: { sky: 0xe8dcc8, ground: 0x5a4a3a, intensity: 0.75 },
    sun: { color: 0xfff2d6, intensity: 1.0, position: [4, 10, 3] },
    exposure: 1.02,
    particles: 'motes',
    props: { wallTop: ['column', 'torch', 'urn'], floor: ['urn', 'column', 'torch'], clutter: [] },
    decals: [],
    light: { color: 0xffb060 },
    waterTex: ['water2.png'],
    lavaTex: []
  },
  catacomb: {
    sky: { top: 0x0a0908, horizon: 0x2a211c, ground: 0x0a0908, sun: 0x6b5a4a, sunPos: [0.5, 0.5] },
    fog: { color: 0x0f0d0c, near: 5, far: 24 },
    hemi: { sky: 0x6a5f56, ground: 0x0b0908, intensity: 0.7 },
    sun: { color: 0x8a7a6a, intensity: 0.5, position: [3, 10, 2] },
    exposure: 1.0,
    particles: 'dust',
    props: { wallTop: ['torch', 'column', 'urn', 'bones'], floor: ['bones', 'rubble', 'urn', 'mushroom', 'torch'], clutter: ['pebbles'] },
    decals: ['cracks', 'puddle'],
    light: { color: 0xff9a3a },
    waterTex: ['water2.png'],
    lavaTex: []
  },
  factory: {
    sky: { top: 0x1f242c, horizon: 0x4a525e, ground: 0x1a1d22, sun: 0xbfd0e6, sunPos: [0.5, 0.5] },
    fog: { color: 0x2b2f36, near: 8, far: 32 },
    hemi: { sky: 0x8c9aae, ground: 0x1a1d22, intensity: 0.9 },
    sun: { color: 0xd0dcea, intensity: 1.05, position: [3, 10, 2] },
    exposure: 1.0,
    particles: 'sparks',
    props: { wallTop: ['pipe', 'vent', 'lamp', 'barrel'], floor: ['barrel', 'pipe', 'crate', 'sandbags'], clutter: [] },
    decals: ['oil', 'skid', 'scorch', 'cracks'],
    light: { color: 0xffd27a },
    waterTex: [],
    lavaTex: ['lava.jpg']
  }
};

export function lookFor(themeName) {
  return LOOKS[themeName] || LOOKS.classic;
}

export function themeNames() {
  return Object.keys(LOOKS);
}

function baseName(url) {
  return String(url || '').split('/').pop().toLowerCase();
}

export function isWaterTexture(url, look) {
  const name = baseName(url);
  return name.includes('water') || (look?.waterTex || []).includes(name);
}

export function isLavaTexture(url, look) {
  const name = baseName(url);
  return name.includes('lava') || (look?.lavaTex || []).includes(name);
}
