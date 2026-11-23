import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// The outpost grows one module per delivered mission. Modules are styled after
// SpaceX-style Mars base concepts: faceted geodesic domes, stainless-steel
// Starship-like tanks, flat landing pads and solar fields.
const STEEL = new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.35, metalness: 0.45 });
const STEEL_DARK = new THREE.MeshStandardMaterial({ color: 0x6b7077, roughness: 0.5, metalness: 0.5 });
const DOME_PANEL = new THREE.MeshPhysicalMaterial({
  color: 0xf4f7fa, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.72,
  flatShading: true, side: THREE.DoubleSide, clearcoat: 0.6
});
const DOME_GREEN = DOME_PANEL.clone();
DOME_GREEN.color.set(0xbfe8c8);
DOME_GREEN.opacity = 0.68;
const DOME_BLUE = DOME_PANEL.clone();
DOME_BLUE.color.set(0xcfe4ff);
const FRAME = new THREE.LineBasicMaterial({ color: 0x2f3842, transparent: true, opacity: 0.85 });
const PAD = new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.9, metalness: 0.1 });
const PAD_MARK = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8, emissive: 0x444444, emissiveIntensity: 0.3 });
const SOLAR = new THREE.MeshStandardMaterial({ color: 0x14244a, roughness: 0.22, metalness: 0.85, emissive: 0x0b1530, emissiveIntensity: 0.3 });
const BEACON = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff8a4a, emissiveIntensity: 2.5 });
const WARN = new THREE.MeshStandardMaterial({ color: 0xff8a2a, roughness: 0.6 });

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function dome(radius, material = DOME_PANEL, segments = 10) {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(radius, segments, Math.max(4, Math.round(segments * 0.55)), 0, Math.PI * 2, 0, Math.PI / 2);
  group.add(shadowed(new THREE.Mesh(geometry, material)));
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), FRAME));
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.25, radius + 0.45, 0.5, segments * 2), STEEL_DARK);
  ring.position.y = 0.25;
  group.add(shadowed(ring));
  // Airlock tunnel.
  const airlock = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.4, 12), STEEL);
  airlock.rotation.z = Math.PI / 2;
  airlock.position.set(radius + 0.8, 1.0, 0);
  group.add(shadowed(airlock));
  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 12), STEEL_DARK);
  door.rotation.z = Math.PI / 2;
  door.position.set(radius + 2.0, 1.0, 0);
  group.add(shadowed(door));
  return group;
}

function tank(radius, height, withNose = true) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), STEEL);
  body.position.y = height / 2;
  group.add(shadowed(body));
  for (let i = 1; i < 4; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.02, 0.05, 6, 32), STEEL_DARK);
    band.rotation.x = Math.PI / 2;
    band.position.y = (height / 4) * i;
    group.add(band);
  }
  if (withNose) {
    const nose = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 1.6, 24), STEEL);
    nose.position.y = height + radius * 0.8;
    group.add(shadowed(nose));
  }
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.5), STEEL_DARK);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * radius, 0.3, Math.sin(a) * radius);
    leg.rotation.y = -a;
    group.add(shadowed(leg));
  }
  return group;
}

const MODULE_BUILDERS = {
  landing_pad() {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 0.4, 36), PAD);
    pad.position.y = 0.2;
    group.add(shadowed(pad));
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.0, 36), PAD_MARK);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.41;
    group.add(ring);
    for (const [w, d] of [[3.2, 0.5], [0.5, 3.2]]) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), PAD_MARK);
      mark.position.y = 0.41;
      group.add(mark);
    }
    for (let i = 0; i < 8; i++) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), BEACON);
      const a = (i / 8) * Math.PI * 2;
      light.position.set(Math.cos(a) * 6.3, 0.55, Math.sin(a) * 6.3);
      group.add(light);
    }
    return group;
  },
  habitat_dome: () => dome(4.2, DOME_PANEL, 12),
  solar_array() {
    const group = new THREE.Group();
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), STEEL_DARK);
        post.position.set(i * 2.4 - 3.6, 0.6, row * 3.2 - 1.6);
        group.add(shadowed(post));
        const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 2.4), SOLAR);
        panel.position.set(i * 2.4 - 3.6, 1.3, row * 3.2 - 1.6);
        panel.rotation.x = -0.45;
        group.add(shadowed(panel));
      }
    }
    return group;
  },
  water_extractor() {
    const group = new THREE.Group();
    group.add(tank(1.4, 3.2, false));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), DOME_BLUE);
    cap.position.y = 3.2;
    group.add(shadowed(cap));
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 10), STEEL_DARK);
    drill.position.set(2.6, 1.2, 0);
    group.add(shadowed(drill));
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 8), STEEL_DARK);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(1.4, 1.6, 0);
    group.add(pipe);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.4), WARN);
    frame.position.set(2.6, 2.4, 0);
    group.add(shadowed(frame));
    return group;
  },
  greenhouse_dome: () => dome(3.6, DOME_GREEN, 10),
  storage_silo: () => tank(1.6, 5.0, true),
  comms_tower() {
    const group = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 9, 8), STEEL_DARK);
    mast.position.y = 4.5;
    group.add(shadowed(mast));
    for (let i = 0; i < 3; i++) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), STEEL_DARK);
      const a = (i / 3) * Math.PI * 2;
      strut.position.set(Math.cos(a) * 1.1, 1.8, Math.sin(a) * 1.1);
      strut.rotation.z = Math.cos(a) * 0.5;
      strut.rotation.x = -Math.sin(a) * 0.5;
      group.add(strut);
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), STEEL);
    dish.position.y = 8.2;
    dish.rotation.x = -1.1;
    group.add(shadowed(dish));
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), BEACON);
    light.position.y = 9.3;
    group.add(light);
    group.userData.blinker = light;
    return group;
  },
  lab_dome() {
    const group = dome(3.0, DOME_BLUE, 10);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 2.2, 6), STEEL_DARK);
    antenna.position.set(-1.6, 3.6, 1.2);
    group.add(antenna);
    return group;
  },
  fuel_plant() {
    const group = new THREE.Group();
    const a = tank(1.3, 5.5, true);
    a.position.x = -1.8;
    group.add(a);
    const b = tank(1.3, 5.5, true);
    b.position.x = 1.8;
    group.add(b);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.6, 8), STEEL_DARK);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.y = 2.6;
    group.add(pipe);
    const unit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.4), WARN);
    unit.position.set(0, 0.6, 2.4);
    group.add(shadowed(unit));
    return group;
  },
  command_dome() {
    const group = dome(5.2, DOME_PANEL, 14);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.6, 16), STEEL);
    crown.position.y = 5.2;
    group.add(shadowed(crown));
    const windows = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.25, 6, 32), DOME_BLUE);
    windows.rotation.x = Math.PI / 2;
    windows.position.y = 2.2;
    group.add(windows);
    return group;
  }
};

const RED = new THREE.MeshStandardMaterial({ color: 0xd63a3a, roughness: 0.6 });
const GLASS_DARK = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.2, metalness: 0.6 });

Object.assign(MODULE_BUILDERS, {
  electronics_lab() {
    const group = dome(3.2, DOME_BLUE, 10);
    for (let i = 0; i < 3; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 2.2), SOLAR);
      panel.position.set(-4.6 + i * 1.6, 1.0, 3.6);
      panel.rotation.x = -0.4;
      group.add(shadowed(panel));
    }
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.8), STEEL_DARK);
    rack.position.set(-3.2, 0.8, -2.8);
    group.add(shadowed(rack));
    return group;
  },
  alloy_foundry() {
    const group = new THREE.Group();
    const body = tank(2.0, 3.6, false);
    group.add(body);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5.0, 12), STEEL_DARK);
    chimney.position.set(1.4, 2.5, -1.2);
    group.add(shadowed(chimney));
    const furnace = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.8), STEEL_DARK);
    furnace.position.set(-2.6, 0.7, 0.6);
    group.add(shadowed(furnace));
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff5a10, emissiveIntensity: 2 }));
    glow.position.set(-2.6, 0.7, 1.52);
    group.add(glow);
    return group;
  },
  hydroponics_farm() {
    const group = new THREE.Group();
    const house = dome(2.8, DOME_GREEN, 10);
    house.scale.set(1, 0.9, 2.2);
    group.add(house);
    const tankA = tank(0.8, 2.0, false);
    tankA.position.set(4.0, 0, -2.0);
    group.add(tankA);
    return group;
  },
  plastics_plant() {
    const group = new THREE.Group();
    const a = tank(1.1, 3.0, false);
    a.position.x = -2.0;
    group.add(a);
    const b = tank(1.1, 3.0, false);
    b.position.x = 2.0;
    group.add(b);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.2, 8), WARN);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.y = 2.2;
    group.add(pipe);
    const unit = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.2, 1.6), WARN);
    unit.position.set(0, 0.6, 2.4);
    group.add(shadowed(unit));
    return group;
  },
  observatory() {
    const group = dome(2.8, DOME_PANEL, 10);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 3.6, 14), STEEL_DARK);
    tube.position.set(0, 3.2, 0.4);
    tube.rotation.x = -0.9;
    group.add(shadowed(tube));
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.2), GLASS_DARK);
    slit.position.set(0, 1.9, 2.2);
    slit.rotation.x = -0.6;
    group.add(slit);
    return group;
  },
  medical_bay() {
    const group = dome(3.0, DOME_PANEL, 10);
    for (const [w, h] of [[1.6, 0.5], [0.5, 1.6]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), RED);
      bar.position.set(0, 2.2, 2.4);
      bar.rotation.x = -0.5;
      group.add(bar);
    }
    const annex = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 1.8), STEEL);
    annex.position.set(-3.6, 0.7, -0.8);
    group.add(shadowed(annex));
    return group;
  },
  ring_habitat() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.0, 1.3, 12, 40), STEEL);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.6;
    group.add(shadowed(ring));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 8), STEEL_DARK);
      leg.position.set(Math.cos(a) * 5.0, 1.3, Math.sin(a) * 5.0);
      group.add(shadowed(leg));
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.2), DOME_BLUE);
      win.position.set(Math.cos(a + 0.5) * 6.2, 2.7, Math.sin(a + 0.5) * 6.2);
      win.rotation.y = -(a + 0.5) + Math.PI / 2;
      group.add(win);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.4, 16), STEEL_DARK);
    hub.position.y = 1.7;
    group.add(shadowed(hub));
    return group;
  },
  spaceport() {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(8.0, 8.5, 0.5, 40), PAD);
    pad.position.y = 0.25;
    group.add(shadowed(pad));
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.4, 6.0, 40), PAD_MARK);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.51;
    group.add(ring);
    for (let i = 0; i < 12; i++) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), BEACON);
      const a = (i / 12) * Math.PI * 2;
      light.position.set(Math.cos(a) * 7.8, 0.7, Math.sin(a) * 7.8);
      group.add(light);
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7.0, 1.4), STEEL_DARK);
    tower.position.set(9.5, 3.5, -4.0);
    group.add(shadowed(tower));
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.6), DOME_BLUE);
    cab.position.set(9.5, 7.6, -4.0);
    group.add(shadowed(cab));
    return group;
  }
});

// Collision radius per module (the landing pad is flat, so it is drivable).
const MODULE_RADIUS = {
  habitat_dome: 4.6, solar_array: 5.2, water_extractor: 2.6, greenhouse_dome: 4.0,
  storage_silo: 2.0, comms_tower: 1.4, lab_dome: 3.4, fuel_plant: 3.6, command_dome: 5.6,
  electronics_lab: 3.6, alloy_foundry: 3.4, hydroponics_farm: 4.0, plastics_plant: 3.4,
  observatory: 3.2, medical_bay: 3.4, ring_habitat: 6.8, spaceport: 9.0
};

// Where each module sits around the base centre (base-local x/z units).
const MODULE_SLOTS = {
  landing_pad: { x: 15, z: -8 },
  habitat_dome: { x: 0, z: 0 },
  solar_array: { x: -13, z: 6 },
  water_extractor: { x: -9, z: -7 },
  greenhouse_dome: { x: 9, z: 8 },
  storage_silo: { x: -4, z: 13 },
  comms_tower: { x: 13, z: 3 },
  lab_dome: { x: -11, z: 15 },
  fuel_plant: { x: 4, z: -13 },
  command_dome: { x: 6, z: 19 },
  electronics_lab: { x: 24, z: -8 },
  alloy_foundry: { x: -16, z: -22 },
  hydroponics_farm: { x: 22, z: 16 },
  plastics_plant: { x: -26, z: 6 },
  observatory: { x: -24, z: 20 },
  medical_bay: { x: -10, z: 28 },
  ring_habitat: { x: 8, z: 32 },
  spaceport: { x: 36, z: 4 }
};

export function createBase({ scene, terrain, base }) {
  const group = new THREE.Group();
  const heading = THREE.MathUtils.degToRad(base.headingDeg ?? 0);
  group.position.set(base.x, terrain.heightAt(base.x, base.z), base.z);
  group.rotation.y = heading;
  scene.add(group);

  // Survey beacon at the centre so the outpost is visible across the plain.
  const beaconMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), STEEL_DARK);
  beaconMast.position.y = 3;
  group.add(beaconMast);
  const beaconLight = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), BEACON);
  beaconLight.position.y = 6.2;
  group.add(beaconLight);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
  );
  column.position.y = 30;
  group.add(column);
  const deliveryRing = new THREE.Mesh(
    new THREE.RingGeometry((base.deliveryRadius ?? 16) - 0.6, base.deliveryRadius ?? 16, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  deliveryRing.rotation.x = -Math.PI / 2;
  deliveryRing.position.y = 0.15;
  group.add(deliveryRing);

  const built = [];
  const animating = [];
  const obstacles = [];

  function buildModule(type, instant = false) {
    const builder = MODULE_BUILDERS[type];
    if (!builder) return null;
    const slot = MODULE_SLOTS[type] ?? { x: 0, z: 0 };
    const module = builder();
    // Modules follow the terrain under their own slot, not the base centre.
    const worldX = base.x + slot.x * Math.cos(heading) + slot.z * Math.sin(heading);
    const worldZ = base.z - slot.x * Math.sin(heading) + slot.z * Math.cos(heading);
    module.position.set(slot.x, terrain.heightAt(worldX, worldZ) - group.position.y - 0.1, slot.z);
    module.rotation.y = -heading;
    group.add(module);
    built.push({ type, module });
    if (instant) module.scale.setScalar(1);
    else {
      module.scale.setScalar(0.01);
      animating.push({ module, t: 0 });
    }
    if (MODULE_RADIUS[type]) obstacles.push({ x: worldX, z: worldZ, radius: MODULE_RADIUS[type] });
    return module;
  }

  function update(delta, elapsed) {
    const blink = 0.5 + 0.5 * Math.sin(elapsed * 4);
    beaconLight.material.emissiveIntensity = 1.5 + blink * 2;
    for (const { module } of built) {
      if (module.userData.blinker) module.userData.blinker.visible = Math.sin(elapsed * 6) > 0;
    }
    for (let i = animating.length - 1; i >= 0; i--) {
      const anim = animating[i];
      anim.t = Math.min(1, anim.t + delta / 1.1);
      const eased = 1 - Math.pow(1 - anim.t, 3);
      const overshoot = 1 + Math.sin(anim.t * Math.PI) * 0.08;
      anim.module.scale.setScalar(Math.max(0.01, eased * overshoot));
      if (anim.t >= 1) {
        anim.module.scale.setScalar(1);
        animating.splice(i, 1);
      }
    }
  }

  const center = new THREE.Vector3(base.x, group.position.y, base.z);
  obstacles.push({ x: base.x, z: base.z, radius: 0.9 }); // the beacon mast
  return { group, center, deliveryRadius: base.deliveryRadius ?? 16, buildModule, update, built, obstacles };
}

// Exposed for frontend/meshviewer/bake-sources.js, which bakes these into library models.
export { MODULE_BUILDERS };
