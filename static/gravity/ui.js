/** Compact overlays. The viewport underneath stays the whole window. */

import { SPEEDS } from './physics/constants.js';
import { GROUP_FIELDS, GROUP_INFO, GROUP_KINDS } from './physics/groups.js';
import { PRESET_INFO, defaultParams } from './physics/presets.js';

const PARAMS = {
  'random-cloud': [
    ['radius', 'Cloud radius', 0.1],
    ['dispersion', 'Velocity dispersion', 0.01],
    ['spin', 'Spin', 0.01],
    ['minMass', 'Minimum mass', 0.01],
    ['maxMass', 'Maximum mass', 0.01],
    ['radiusDiversity', 'Radius diversity', 0.05],
  ],
  'solar-system': [
    ['centralMass', 'Central mass', 1],
    ['inner', 'Inner radius', 0.1],
    ['outer', 'Outer radius', 0.1],
    ['particleMass', 'Orbiter mass', 0.001],
    ['inclination', 'Inclination', 0.01],
    ['radiusDiversity', 'Radius diversity', 0.05],
  ],
  'binary-stars': [
    ['mass1', 'Star A mass', 1],
    ['mass2', 'Star B mass', 1],
    ['separation', 'Separation', 0.1],
    ['particleMass', 'Orbiter mass', 0.001],
    ['radiusDiversity', 'Radius diversity', 0.05],
  ],
  'rotating-disk': [
    ['centralMass', 'Central mass', 1],
    ['inner', 'Inner radius', 0.1],
    ['outer', 'Outer radius', 0.1],
    ['thickness', 'Thickness', 0.01],
    ['dispersion', 'Dispersion', 0.01],
    ['particleMass', 'Particle mass', 0.001],
    ['spin', 'Spin direction', 1],
    ['radiusDiversity', 'Radius diversity', 0.05],
  ],
  'colliding-disks': [
    ['centralMass', 'Disk center mass', 1],
    ['inner', 'Inner radius', 0.1],
    ['outer', 'Outer radius', 0.1],
    ['thickness', 'Thickness', 0.01],
    ['separation', 'Center separation', 0.1],
    ['impact', 'Impact offset', 0.1],
    ['bulkSpeed', 'Approach speed', 0.01],
    ['tilt', 'Tilt of the second disk', 0.01],
    ['spin1', 'Spin of the first disk', 1],
    ['spin2', 'Spin of the second disk', 1],
    ['particleMass', 'Particle mass', 0.001],
    ['radiusDiversity', 'Radius diversity', 0.05],
  ],
  'black-hole': [
    ['centralMass', 'Central mass', 10],
    ['inner', 'Inner radius', 0.1],
    ['outer', 'Outer radius', 0.1],
    ['thickness', 'Thickness', 0.01],
    ['plunge', 'Orbit fraction', 0.05],
    ['spin', 'Spin direction', 1],
    ['particleMass', 'Star mass', 0.001],
    ['radiusDiversity', 'Radius diversity', 0.05],
  ],
};

export class SimulatorUI {
  constructor() {
    this.els = Object.fromEntries([...document.querySelectorAll('[id]')].map((node) => [node.id, node]));
    this.toastTimer = 0;
    this.scrubbing = false;
    this.exactBody = null;
    this.syncedGeneration = null;
    this.groupKindShown = null;
    this.placeEdited = () => {};
    this.compactLayout = window.matchMedia('(max-width: 700px), (max-height: 500px) and (max-width: 1000px)');
    const positionInspector = () => {
      document.documentElement.style.setProperty('--timeline-height', `${this.els.timeline.getBoundingClientRect().height}px`);
    };
    new ResizeObserver(positionInspector).observe(this.els.timeline);
    positionInspector();
    const kind = this.els.placeKind;
    for (const info of GROUP_KINDS) {
      const option = document.createElement('option');
      option.value = info.id;
      option.textContent = info.name;
      kind.append(option);
    }
    const preset = this.els.preset;
    for (const [id, info] of Object.entries(PRESET_INFO)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = info.name;
      preset.append(option);
    }
    for (const speed of SPEEDS) {
      const option = document.createElement('option');
      option.value = String(speed);
      option.textContent = `${speed}×`;
      if (speed === 1) option.selected = true;
      this.els.speedSelect.append(option);
    }
    this.renderParams('random-cloud');
  }

  bind(actions) {
    const click = (id, fn) => this.els[id].addEventListener('click', () => {
      this.els[id].blur();
      fn();
    });
    click('randomize', actions.randomize);
    click('applyPreset', actions.applyPreset);
    click('resetBtn', actions.reset);
    click('saveBtn', actions.save);
    click('loadBtn', actions.load);
    click('importBtn', () => this.els.importFile.click());
    click('exportCurrent', actions.exportCurrent);
    click('exportInitial', actions.exportInitial);
    click('addBody', actions.beginPlace);
    click('toolbarToggle', () => {
      const expanded = this.els.toolbarToggle.getAttribute('aria-expanded') !== 'true';
      this.els.toolbarToggle.setAttribute('aria-expanded', String(expanded));
    });
    click('inspectorClose', () => this.els.inspector.classList.remove('mobile-open'));
    click('tabPresets', () => this.showTab('presets'));
    click('tabBody', () => this.showTab('body'));
    click('tabSettings', () => this.showTab('settings'));
    this.els.tabPresets.parentElement.addEventListener('keydown', (event) => {
      const order = ['tabPresets', 'tabBody', 'tabSettings'];
      const index = order.indexOf(document.activeElement && document.activeElement.id);
      if (index < 0) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = order[(index + (event.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
      this.showTab(next === 'tabPresets' ? 'presets' : next === 'tabBody' ? 'body' : 'settings');
      this.els[next].focus();
    });
    click('placeConfirm', actions.confirmPlace);
    click('placeCancel', actions.cancelPlace);
    click('placeOrbit', actions.orbitAssist);
    click('placeReseed', () => {
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      this.els.placeSeed.value = String(bytes[0] || 1);
      actions.placeEdited();
    });
    click('applyEdit', actions.applyEdit);
    click('deleteBody', actions.deleteBody);
    click('applyPhysics', actions.applyPhysics);
    click('playBtn', actions.play);
    click('reverseBtn', actions.reverse);
    click('stepBack', () => actions.step(-1));
    click('stepForward', () => actions.step(1));
    click('frameBtn', actions.frame);
    click('topBtn', actions.top);
    click('orbitBtn', actions.orbitView);
    click('saveCancel', () => this.els.saveDialog.close());
    click('loadClose', () => this.els.loadDialog.close());

    this.els.preset.addEventListener('change', () => this.renderParams(this.els.preset.value));
    this.els.importFile.addEventListener('change', () => {
      const file = this.els.importFile.files && this.els.importFile.files[0];
      this.els.importFile.value = '';
      if (file) actions.importFile(file);
    });
    this.els.saveForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.els.saveDialog.close();
      actions.confirmSave(this.els.saveName.value.trim());
    });
    this.els.scrub.addEventListener('pointerdown', () => { this.scrubbing = true; });
    this.els.scrub.addEventListener('pointerup', () => { this.scrubbing = false; });
    this.els.scrub.addEventListener('input', () => actions.seek(Number(this.els.scrub.value)));
    this.els.scrub.addEventListener('change', () => { this.scrubbing = false; });
    this.els.speedSelect.addEventListener('change', () => actions.speed(Number(this.els.speedSelect.value)));

    this.placeEdited = actions.placeEdited;
    const placeInputs = ['placeMass', 'placeRadius', 'placeHeight', 'placeVx', 'placeVy', 'placeVz', 'placeScale', 'placeSeed'];
    for (const id of placeInputs) this.els[id].addEventListener('input', () => actions.placeEdited());
    this.els.placeKind.addEventListener('change', () => actions.placeEdited());
    this.els.placeVySlider.addEventListener('input', () => {
      this.els.placeVy.value = this.els.placeVySlider.value;
      actions.placeEdited();
    });
    this.els.placeColor.addEventListener('input', () => actions.placeEdited());
    this.els.placePause.addEventListener('change', () => actions.placeEdited());
    for (const id of ['colorMode', 'trails', 'trailLength', 'trailMode', 'quality', 'pixelRatio', 'showRadii', 'pointScale', 'followSelect']) {
      this.els[id].addEventListener('change', () => actions.viewEdited());
      this.els[id].addEventListener('input', () => actions.viewEdited());
    }
  }

  renderParams(preset, values) {
    const spec = PARAMS[preset] || [];
    const defaults = defaultParams(preset, Number(this.els.count.value) || 256);
    const source = values || defaults;
    this.els.paramBox.replaceChildren();
    for (const [key, label, step] of spec) {
      const wrap = document.createElement('label');
      wrap.textContent = label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(step);
      input.dataset.key = key;
      input.value = source[key] ?? defaults[key] ?? 0;
      wrap.append(input);
      this.els.paramBox.append(wrap);
    }
    const info = PRESET_INFO[preset];
    this.els.presetNote.textContent = info ? info.blurb : '';
  }

  setPreset(preset, seed, count) {
    this.els.preset.value = preset;
    this.els.seed.value = String(seed);
    this.els.count.value = String(count);
    this.renderParams(preset);
  }

  readPreset() {
    const params = { count: Number(this.els.count.value) };
    for (const input of this.els.paramBox.querySelectorAll('input')) {
      params[input.dataset.key] = Number(input.value);
    }
    return {
      preset: this.els.preset.value,
      seed: Number(this.els.seed.value),
      params,
    };
  }

  readView() {
    return {
      colorMode: this.els.colorMode.value,
      trails: this.els.trails.checked,
      trailLength: Number(this.els.trailLength.value) || 48,
      trailMode: this.els.trailMode.value,
      quality: this.els.quality.value,
      pixelRatioMax: Number(this.els.pixelRatio.value) || 1,
      showRadii: this.els.showRadii.checked,
      follow: this.els.followSelect.value,
      pointScale: Number(this.els.pointScale.value) || 7,
    };
  }

  readPhysics() {
    return {
      G: Number(this.els.physG.value),
      dt: Number(this.els.physDt.value),
      epsilon: Number(this.els.physEps.value),
      collisionMode: this.els.collisionMode.value,
    };
  }

  readPlace(tool) {
    tool.mass = Number(this.els.placeMass.value);
    tool.radius = Number(this.els.placeRadius.value);
    tool.setHeight(Number(this.els.placeHeight.value));
    tool.velocity[0] = Number(this.els.placeVx.value);
    tool.velocity[1] = Number(this.els.placeVy.value);
    tool.velocity[2] = Number(this.els.placeVz.value);
    tool.scale = Number(this.els.placeScale.value) || 1;
    tool.color = hexColor(this.els.placeColor.value);
    tool.pauseWhilePlacing = this.els.placePause.checked;
    this.els.placeVySlider.value = String(Math.max(-4, Math.min(4, tool.velocity[1] || 0)));
    const nextKind = this.els.placeKind.value;
    if (tool.params[nextKind]) {
      tool.seed = Number(this.els.placeSeed.value);
      if (this.groupKindShown === nextKind) {
        const params = tool.params[nextKind];
        for (const input of this.els.placeFields.querySelectorAll('[data-key]')) {
          params[input.dataset.key] = input.value === '' ? NaN : Number(input.value);
        }
      }
    }
    tool.kind = nextKind === 'single' || tool.params[nextKind] ? nextKind : 'single';
    this.syncGroupFields(tool);
  }

  syncGroupFields(tool) {
    const kind = tool.kind || 'single';
    const group = kind !== 'single';
    this.els.placeSingle.hidden = group;
    this.els.placeGroup.hidden = !group;
    if (!group) this.groupKindShown = 'single';
    else if (this.groupKindShown !== kind) {
      this.groupKindShown = kind;
      this.fillGroupFields(kind, tool.params[kind]);
    }
    const info = GROUP_INFO[kind];
    this.els.placeKindNote.textContent = info ? info.blurb : '';
    this.els.placeHeading.textContent = group && info ? info.name : 'Add body';
    const count = group ? Number(tool.params[kind].count) : 1;
    const n = Number.isFinite(count) ? Math.round(count) : 0;
    this.els.placeConfirm.textContent = n > 1 ? `Add ${n} bodies` : 'Add body';
    const speedWord = group ? 'Group velocity' : 'Velocity';
    this.els.placeVxLabel.textContent = `${speedWord} X`;
    this.els.placeVyLabel.textContent = `${speedWord} Y`;
    this.els.placeVzLabel.textContent = `${speedWord} Z`;
    this.els.placeVySliderLabel.textContent = group ? 'Group vertical velocity' : 'Vertical velocity';
    this.els.scaleNote.textContent = group
      ? `A drag of 1 world unit adds ${tool.scale} to the speed of the whole group. A still click leaves that shared speed at zero.`
      : `A drag of 1 world unit sets ${tool.scale} units of speed. A still click leaves the velocity at zero.`;
    this.els.orbitNote.textContent = group
      ? 'Orbit assist sets the shared velocity so the group center would circle the selected body. The motion inside the group stays. Only the selected mass is used.'
      : "Orbit assist uses only the selected mass and the softened force, then adds that body's current velocity. Other bodies are ignored.";
  }

  fillGroupFields(kind, values) {
    const box = this.els.placeFields;
    box.replaceChildren();
    for (const [key, label, step, mode] of GROUP_FIELDS[kind]) {
      const wrap = document.createElement('label');
      wrap.append(document.createTextNode(label));
      let input;
      if (mode === 'sign') {
        input = document.createElement('select');
        for (const [value, text] of [['1', 'Counterclockwise'], ['-1', 'Clockwise']]) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          input.append(option);
        }
        input.value = Number(values[key]) < 0 ? '-1' : '1';
      } else {
        input = document.createElement('input');
        input.type = 'number';
        input.step = String(step);
        if (mode === 'int') {
          input.min = '2';
          input.max = '256';
        }
        input.value = values[key] ?? 0;
      }
      input.dataset.key = key;
      const notify = () => this.placeEdited();
      input.addEventListener('input', notify);
      input.addEventListener('change', notify);
      wrap.append(input);
      box.append(wrap);
    }
  }

  writePlace(tool) {
    const focused = this.focusedIn(this.els.placeBox);
    if (!focused) {
      this.els.placeVx.value = formatNum(tool.velocity[0]);
      this.els.placeVy.value = formatNum(tool.velocity[1]);
      this.els.placeVz.value = formatNum(tool.velocity[2]);
      this.els.placeVySlider.value = String(Math.max(-4, Math.min(4, tool.velocity[1] || 0)));
      this.els.placeHeight.value = formatNum(tool.height);
    }
    if (!tool.active) {
      this.els.placeBox.hidden = true;
      this.els.addBody.hidden = false;
      return;
    }
    const wasHidden = this.els.placeBox.hidden;
    if (wasHidden) this.showTab('body');
    this.els.placeBox.hidden = false;
    this.els.addBody.hidden = true;
    if (wasHidden) this.els.placeHeading.scrollIntoView({ block: 'start' });
    this.syncGroupFields(tool);
    if (tool.seenPointer && !tool.available && tool.phase !== 'locked') {
      this.els.placeStatus.textContent = 'Placement unavailable. The view is edge-on to the plane.';
    } else if (tool.kind !== 'single' && tool.shapeError) {
      this.els.placeStatus.textContent = tool.shapeError;
    } else if (tool.phase === 'locked') {
      this.els.placeStatus.textContent = tool.kind === 'single'
        ? 'Position locked. Drag on the grid to set the horizontal velocity, then Add body.'
        : 'Center locked. Drag to set the velocity of the whole group.';
    } else {
      this.els.placeStatus.textContent = tool.kind === 'single'
        ? 'Move over the grid. Click to lock the position.'
        : 'Move over the grid. Click to lock the center of the group.';
    }
  }

  sync(state) {
    if (!state) return;
    const playingForward = state.playing && !state.reverse;
    const playingBack = state.playing && state.reverse;
    this.els.playBtn.textContent = playingForward ? 'Pause' : 'Play';
    this.els.reverseBtn.textContent = playingBack ? 'Pause' : 'Reverse';
    this.els.reverseBtn.setAttribute('aria-pressed', String(playingBack));
    if (!this.scrubbing) {
      this.els.scrub.min = String(state.oldest);
      this.els.scrub.max = String(Math.max(state.oldest, state.head));
      this.els.scrub.value = String(state.tick);
    }
    const dt = state.physics ? state.physics.dt : 0.01;
    this.els.timeReadout.textContent = `${(state.tick * dt).toFixed(2)} s · tick ${state.tick} · recorded ${state.oldest}–${state.head} · kept ${(state.oldest * dt).toFixed(2)}–${(state.head * dt).toFixed(2)} s`;
    const generationChanged = state.generation !== this.syncedGeneration;
    if (generationChanged) this.syncedGeneration = state.generation;
    const editingPreset = this.focusedIn(this.els.presetBox)
      || document.activeElement === this.els.seed
      || document.activeElement === this.els.count;
    if (generationChanged && state.meta && !editingPreset) {
      if (PRESET_INFO[state.meta.preset]) {
        this.els.preset.value = state.meta.preset;
        this.renderParams(state.meta.preset, state.meta.presetParams);
      }
      if (state.meta.seed != null) this.els.seed.value = String(state.meta.seed >>> 0);
      const storedCount = state.meta.presetParams && state.meta.presetParams.count;
      if (storedCount != null && document.activeElement !== this.els.count) {
        this.els.count.value = String(storedCount);
      }
    }
    if (generationChanged && state.physics && !this.focusedIn(this.els.settings)) {
      this.els.physG.value = String(state.physics.G);
      this.els.physDt.value = String(state.physics.dt);
      this.els.physEps.value = String(state.physics.epsilon);
      this.els.collisionMode.value = state.physics.collisionMode;
    }
  }

  showTab(name) {
    if (this.compactLayout.matches) this.els.inspector.classList.add('mobile-open');
    const panels = { presets: 'presetBox', body: 'bodyPanel', settings: 'settings' };
    const tabs = { presets: 'tabPresets', body: 'tabBody', settings: 'tabSettings' };
    for (const [id, panelId] of Object.entries(panels)) {
      const on = id === name;
      this.els[panelId].hidden = !on;
      this.els[tabs[id]].setAttribute('aria-selected', String(on));
      this.els[tabs[id]].tabIndex = on ? 0 : -1;
    }
  }

  syncInspector(snapshot, selectedId, exact, playing) {
    const empty = this.els.inspectEmpty;
    const readout = this.els.inspectReadout;
    const form = this.els.inspectForm;
    if (selectedId == null || !snapshot || snapshot.indexOf(selectedId) < 0) {
      empty.hidden = false;
      empty.textContent = 'Click a body to inspect it.';
      readout.hidden = true;
      form.hidden = true;
      this.exactBody = null;
      return;
    }
    empty.hidden = true;
    const index = snapshot.indexOf(selectedId);
    const k = index * 3;
    const vx = snapshot.velocities[k];
    const vy = snapshot.velocities[k + 1];
    const vz = snapshot.velocities[k + 2];
    const speed = Math.hypot(vx, vy, vz);
    if (playing || !exact) {
      form.hidden = true;
      readout.hidden = false;
      readout.innerHTML = '';
      const rows = [
        ['ID', selectedId],
        ['Mass', snapshot.masses[index].toPrecision(4)],
        ['Radius', snapshot.radii[index].toPrecision(4)],
        ['Position', `${snapshot.positions[k].toFixed(2)}, ${snapshot.positions[k + 1].toFixed(2)}, ${snapshot.positions[k + 2].toFixed(2)}`],
        ['Velocity', `${vx.toFixed(2)}, ${vy.toFixed(2)}, ${vz.toFixed(2)}`],
        ['Speed', speed.toFixed(3)],
      ];
      for (const [name, value] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = name;
        const dd = document.createElement('dd');
        dd.textContent = value;
        readout.append(dt, dd);
      }
      return;
    }
    readout.hidden = true;
    form.hidden = false;
    this.els.editId.textContent = String(exact.id);
    this.els.editSpeed.textContent = speed.toFixed(3);
    if (this.exactBody !== exact && !this.focusedIn(form)) {
      this.exactBody = exact;
      this.els.editMass.value = formatNum(exact.mass);
      this.els.editRadius.value = formatNum(exact.radius);
      this.els.editX.value = formatNum(exact.position[0]);
      this.els.editY.value = formatNum(exact.position[1]);
      this.els.editZ.value = formatNum(exact.position[2]);
      this.els.editVx.value = formatNum(exact.velocity[0]);
      this.els.editVy.value = formatNum(exact.velocity[1]);
      this.els.editVz.value = formatNum(exact.velocity[2]);
    }
  }

  readEdit() {
    return {
      mass: Number(this.els.editMass.value),
      radius: Number(this.els.editRadius.value),
      position: [Number(this.els.editX.value), Number(this.els.editY.value), Number(this.els.editZ.value)],
      velocity: [Number(this.els.editVx.value), Number(this.els.editVy.value), Number(this.els.editVz.value)],
    };
  }

  syncDiagnostics(snapshot, fps) {
    if (!snapshot) return;
    const diag = snapshot.diagnostics || {};
    const mb = (diag.historyBytes || 0) / (1024 * 1024);
    const budget = (diag.historyBudget || 1) / (1024 * 1024);
    const achieved = diag.achievedSpeed || 0;
    const requested = diag.requestedSpeed || 0;
    this.els.diagnostics.textContent = `${snapshot.count} bodies · ${fps.toFixed(0)} fps · ${(diag.msPerTick || 0).toFixed(2)} ms/tick · ${achieved.toFixed(2)}× of ${requested.toFixed(2)}× · history ${mb.toFixed(1)} / ${budget.toFixed(0)} MB`;
  }

  openSave(name) {
    this.els.saveName.value = name || 'Scenario';
    this.els.saveDialog.showModal();
    this.els.saveName.focus();
  }

  openLoad(scenarios, onOpen, onDelete) {
    const list = this.els.scenarioList;
    list.replaceChildren();
    if (!scenarios.length) {
      const item = document.createElement('li');
      item.textContent = 'No saved scenarios yet.';
      list.append(item);
    }
    for (const scenario of scenarios) {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = scenario.name;
      const small = document.createElement('small');
      small.textContent = `${scenario.bodies} bodies · ${scenario.preset}`;
      label.append(small);
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open';
      open.addEventListener('click', () => onOpen(scenario.id));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => onDelete(scenario.id));
      item.append(label, open, remove);
      list.append(item);
    }
    this.els.loadDialog.showModal();
  }

  closeLoad() {
    this.els.loadDialog.close();
  }

  toast(message) {
    if (!message) return;
    this.els.toast.hidden = false;
    this.els.toast.textContent = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.els.toast.hidden = true; }, 4200);
  }

  focusedIn(node) {
    return Boolean(node && node.contains(document.activeElement) && document.activeElement !== document.body);
  }
}

export function hexColor(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  return channels.map((channel) => (Number.isFinite(channel) ? channel : 1));
}

function formatNum(value) {
  if (!Number.isFinite(value)) return '0';
  const text = value.toPrecision(8);
  if (!text.includes('e')) return String(Number(text));
  return text;
}
