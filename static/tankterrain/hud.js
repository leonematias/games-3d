import * as THREE from 'three';

// 2D overlays: the reticle at the predicted impact point, lock brackets and
// health bars over enemies, score popups, the flag marker and the minimap.

const _v = new THREE.Vector3();

export function createHud(canvas, mapCanvas) {
  const ctx = canvas.getContext('2d');
  const mctx = mapCanvas.getContext('2d');
  let w = 0, h = 0;
  let mapImage = null;
  let mapBase = null;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();

  function project(camera, pos) {
    _v.copy(pos).project(camera);
    if (_v.z > 1) return null;
    return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, z: _v.z };
  }

  // A world marker: a label above the point when it is on screen, or an arrow at the screen edge.
  function drawMarker(camera, player, pos, label, color, lift = 11, edgeRadius = 0.42) {
    _v.copy(pos);
    _v.y += lift;
    const p = project(camera, _v);
    const dist = Math.round(Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z));
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.font = 'bold 13px "Rajdhani", Arial, sans-serif';
    ctx.textAlign = 'center';
    if (p && p.x > 20 && p.x < w - 20 && p.y > 20 && p.y < h - 20) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 10);
      ctx.lineTo(p.x - 8, p.y - 4);
      ctx.lineTo(p.x + 8, p.y - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillText(`${label} ${dist} m`, p.x, p.y - 10);
    } else {
      let ang;
      if (p) ang = Math.atan2(p.y - h / 2, p.x - w / 2);
      else {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const to = Math.atan2(pos.x - camera.position.x, pos.z - camera.position.z);
        const camA = Math.atan2(camDir.x, camDir.z);
        const rel = Math.atan2(Math.sin(to - camA), Math.cos(to - camA));
        ang = -Math.PI / 2 + rel;
        if (Math.abs(rel) > Math.PI / 2) ang = Math.PI / 2 - (rel > 0 ? -1 : 1) * (Math.PI - Math.abs(rel)) * 0.5;
      }
      const r = Math.min(w, h) * edgeRadius;
      const x = w / 2 + Math.cos(ang) * r;
      const y = h / 2 + Math.sin(ang) * r;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillText(`${label} ${dist} m`, x, y + (Math.sin(ang) > 0 ? -16 : 26));
    }
    ctx.shadowBlur = 0;
  }

  function draw({ camera, player, targets, lock, lockProgress, reticle, flagPos, popups, hitMarker, weapon, incoming, markers = [] }) {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2;
    const green = '#9bff8a';
    // Reticle where the current weapon lands.
    if (reticle && player.alive) {
      const p = project(camera, reticle);
      if (p) {
        ctx.strokeStyle = lock && lockProgress >= 1 ? '#ff6a4a' : green;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(p.x + dx * 7, p.y + dy * 7); ctx.lineTo(p.x + dx * 20, p.y + dy * 20); }
        ctx.stroke();
        if (hitMarker > 0) {
          ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, hitMarker * 4)})`;
          ctx.beginPath();
          for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(p.x + dx * 9, p.y + dy * 9); ctx.lineTo(p.x + dx * 16, p.y + dy * 16); }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
    }
    // Enemies in view: health bars and the lock bracket.
    ctx.font = 'bold 11px "Rajdhani", Arial, sans-serif';
    ctx.textAlign = 'center';
    for (const t of targets) {
      if (!t.alive || t.kind === 'barrel') continue;
      const d = t.pos.distanceTo(player.pos);
      if (d > 320) continue;
      _v.copy(t.pos);
      _v.y += (t.radius || 2) + 1.4;
      const p = project(camera, _v);
      if (!p || p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
      const s = Math.max(14, Math.min(44, 1800 / d));
      if (t === lock) {
        ctx.strokeStyle = lockProgress >= 1 ? '#ff6a4a' : '#ffd24a';
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        const half = s;
        const g = Math.max(0.35, 1 - lockProgress) * half;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          ctx.moveTo(p.x + sx * half, p.y + sy * (half - g) + s * 0.5);
          ctx.lineTo(p.x + sx * half, p.y + sy * half + s * 0.5);
          ctx.lineTo(p.x + sx * (half - g), p.y + sy * half + s * 0.5);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(`${t.kind === 'missile' ? 'MISSILE ' : lockProgress >= 1 ? 'LOCK ' : ''}${Math.round(d)} m`, p.x, p.y - 6);
      }
      if (t.kind === 'missile' || t.kind === 'dome') continue;   // no health bar on a missile or the dome
      // Health bar.
      const bw = t.type === 'boss' ? 70 : 40, bh = t.type === 'boss' ? 6 : 4;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, bh + 2);
      ctx.fillStyle = t.hp / t.maxHp > 0.5 ? '#ff5a3a' : '#ffb03a';
      ctx.fillRect(p.x - bw / 2, p.y, bw * Math.max(0, t.hp / t.maxHp), bh);
    }
    // Flag marker: on screen above the pole, or an arrow at the edge. Other
    // markers (objective targets, the ford) draw the same way, smaller.
    if (flagPos) drawMarker(camera, player, flagPos, 'FLAG', '#ffe060');
    for (const m of markers) if (m.pos) drawMarker(camera, player, m.pos, m.label, m.color || '#ff9ad8', m.lift ?? 8, 0.36);
    // Incoming missile warning arrows.
    if (incoming && incoming.length) {
      ctx.fillStyle = '#ffb347';
      for (const m of incoming) {
        const toM = Math.atan2(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const camA = Math.atan2(camDir.x, camDir.z);
        const rel = Math.atan2(Math.sin(toM - camA), Math.cos(toM - camA));
        const ang = -Math.PI / 2 + rel;
        const r = Math.min(w, h) * 0.3;
        const x = w / 2 + Math.cos(ang) * r;
        const y = h / 2 + Math.sin(ang) * r;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // Popups.
    ctx.font = 'bold 16px "Rajdhani", Arial, sans-serif';
    for (const pop of popups) {
      const p = project(camera, pop.pos);
      if (!p) continue;
      ctx.globalAlpha = Math.max(0, 1 - pop.age / pop.life);
      ctx.fillStyle = pop.color || '#ffd24a';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 4;
      ctx.fillText(pop.text, p.x, p.y);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  // ------------------------------------------------------------- minimap
  function setMap(level) {
    mapImage = new Image();
    mapImage.onload = () => {
      mapBase = document.createElement('canvas');
      mapBase.width = mapCanvas.width;
      mapBase.height = mapCanvas.height;
      const c = mapBase.getContext('2d');
      c.drawImage(mapImage, 0, 0, mapBase.width, mapBase.height);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(0, 0, mapBase.width, mapBase.height);
    };
    mapImage.src = level.terrain.preview;
  }

  // The fort interior is fog of war: enemies inside it only show when they
  // are engaging, close to the player, or revealed by a mortar round.
  function drawMinimap({ level, fort, enemies, pickups, player, flagPos, lock, reveal = 0, bridges = null, targets = null, boss = null, checkpoint = null }) {
    const W = mapCanvas.width, H = mapCanvas.height;
    const size = level.terrain.size;
    const sx = (x) => (x / size + 0.5) * W;
    const sz = (z) => (z / size + 0.5) * H;
    mctx.clearRect(0, 0, W, H);
    if (mapBase) mctx.drawImage(mapBase, 0, 0);
    else { mctx.fillStyle = '#243018'; mctx.fillRect(0, 0, W, H); }
    // Road.
    if (level.road) {
      mctx.strokeStyle = 'rgba(200,170,120,0.55)';
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      level.road.forEach(([x, z], i) => (i ? mctx.lineTo(sx(x), sz(z)) : mctx.moveTo(sx(x), sz(z))));
      mctx.stroke();
    }
    // Fords (dashed light blue) and bridges (grey, red once blown).
    for (const f of level.fords || []) {
      mctx.strokeStyle = 'rgba(120,200,255,0.8)';
      mctx.lineWidth = 2;
      mctx.setLineDash([3, 2]);
      mctx.beginPath();
      mctx.moveTo(sx(f[0][0]), sz(f[0][1]));
      mctx.lineTo(sx(f[1][0]), sz(f[1][1]));
      mctx.stroke();
      mctx.setLineDash([]);
    }
    for (const b of bridges?.list || []) {
      mctx.strokeStyle = b.alive ? '#d8d8d8' : '#ff5040';
      mctx.lineWidth = 3;
      mctx.beginPath();
      mctx.moveTo(sx(b.x1), sz(b.z1));
      mctx.lineTo(sx(b.x2), sz(b.z2));
      mctx.stroke();
    }
    // Off-road targets.
    if (targets) {
      for (const r of targets.radars) { if (!r.alive) continue; mctx.strokeStyle = '#ff9ad8'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(sx(r.pos.x), sz(r.pos.z), 3.5, 0, Math.PI * 2); mctx.stroke(); mctx.fillStyle = '#ff9ad8'; mctx.fillRect(sx(r.pos.x) - 1, sz(r.pos.z) - 1, 2, 2); }
      for (const d of targets.depots) { if (!d.alive) continue; mctx.fillStyle = '#ffa040'; mctx.fillRect(sx(d.pos.x) - 3, sz(d.pos.z) - 3, 6, 6); }
      for (const t of targets.trucks) { if (!t.alive) continue; mctx.fillStyle = '#d8c080'; mctx.fillRect(sx(t.pos.x) - 1.5, sz(t.pos.z) - 1.5, 3, 3); }
      for (const c of targets.camps) { mctx.fillStyle = c.freed ? '#9bff8a' : '#ffffff'; mctx.fillRect(sx(c.pos.x) - 2, sz(c.pos.z) - 4, 2, 8); mctx.fillRect(sx(c.pos.x), sz(c.pos.z) - 4, 5, 3); }
    }
    const shown = (e) => reveal > 0 || e.state === 'engage' || e.onTower || !fort.inside(e.pos.x, e.pos.z, 4) || Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 110;
    // Walls.
    for (const wll of fort.walls) {
      if (!wll.alive) continue;
      mctx.strokeStyle = wll.material === 'steel' ? '#8fa0b4' : wll.material === 'concrete' ? '#c8c4bc' : wll.material === 'brick' ? '#e08060' : '#d0a050';
      mctx.lineWidth = wll.hut ? 3 : 1.6;
      const hx = Math.cos(wll.yaw) * wll.len / 2, hz = Math.sin(wll.yaw) * wll.len / 2;
      mctx.beginPath();
      mctx.moveTo(sx(wll.x - hx), sz(wll.z - hz));
      mctx.lineTo(sx(wll.x + hx), sz(wll.z + hz));
      mctx.stroke();
    }
    mctx.fillStyle = '#c8c4bc';
    for (const t of fort.towers) { mctx.beginPath(); mctx.arc(sx(t.x), sz(t.z), 2.2, 0, Math.PI * 2); mctx.fill(); }
    // Pickups.
    for (const p of pickups) {
      if (!p.alive) continue;
      mctx.fillStyle = `#${p.def.color.toString(16).padStart(6, '0')}`;
      mctx.beginPath();
      mctx.arc(sx(p.pos.x), sz(p.pos.z), 1.8, 0, Math.PI * 2);
      mctx.fill();
    }
    // Boss level: the generator, its pylons and the dome over the keep.
    if (boss?.active) {
      if (boss.generator?.alive) {
        mctx.strokeStyle = '#80e0ff'; mctx.lineWidth = 1.5;
        mctx.beginPath(); mctx.arc(sx(boss.generator.pos.x), sz(boss.generator.pos.z), 4, 0, Math.PI * 2); mctx.stroke();
        mctx.fillStyle = '#80e0ff'; mctx.fillRect(sx(boss.generator.pos.x) - 1.5, sz(boss.generator.pos.z) - 1.5, 3, 3);
        mctx.setLineDash([2, 2]);
        mctx.beginPath();
        mctx.moveTo(sx(boss.generator.pos.x), sz(boss.generator.pos.z));
        mctx.lineTo(sx(boss.dome.x), sz(boss.dome.z));
        mctx.stroke();
        mctx.setLineDash([]);
      }
      if (boss.domeUp) {
        mctx.strokeStyle = 'rgba(128,224,255,0.9)'; mctx.lineWidth = 1.5;
        mctx.beginPath(); mctx.arc(sx(boss.dome.x), sz(boss.dome.z), boss.dome.r / size * W, 0, Math.PI * 2); mctx.stroke();
      }
    }
    // Checkpoint flag.
    if (checkpoint) {
      mctx.fillStyle = '#9bff8a';
      mctx.fillRect(sx(checkpoint.x) - 1, sz(checkpoint.z) - 6, 1.5, 7);
      mctx.beginPath(); mctx.moveTo(sx(checkpoint.x), sz(checkpoint.z) - 6); mctx.lineTo(sx(checkpoint.x) + 5, sz(checkpoint.z) - 4.5); mctx.lineTo(sx(checkpoint.x), sz(checkpoint.z) - 3); mctx.closePath(); mctx.fill();
    }
    // Enemies.
    for (const e of enemies.turrets) {
      if (!e.alive || !shown(e)) continue;
      mctx.fillStyle = e === lock ? '#ffd24a' : '#ff4a3a';
      mctx.fillRect(sx(e.pos.x) - 2, sz(e.pos.z) - 2, 4, 4);
    }
    for (const e of enemies.tanks) {
      if (!e.alive || !shown(e) || e.type === 'boss') continue;
      mctx.fillStyle = e === lock ? '#ffd24a' : e.state === 'engage' ? '#ff6a3a' : '#ff3a3a';
      mctx.save();
      mctx.translate(sx(e.pos.x), sz(e.pos.z));
      mctx.rotate(-e.heading);
      mctx.beginPath();
      mctx.moveTo(0, -4); mctx.lineTo(3, 3); mctx.lineTo(-3, 3); mctx.closePath();
      mctx.fill();
      mctx.restore();
    }
    // Troopers: small dots. Helicopters: a chevron. Command truck: a square with a mast.
    for (const e of enemies.troops || []) {
      if (!e.alive || !shown(e)) continue;
      mctx.fillStyle = e === lock ? '#ffd24a' : '#ff8a6a';
      mctx.fillRect(sx(e.pos.x) - 1, sz(e.pos.z) - 1, 2, 2);
    }
    for (const h of enemies.helis || []) {
      if (!h.alive) continue;
      mctx.strokeStyle = h === lock ? '#ffd24a' : h.state === 'parked' ? '#ff9a7a' : '#ff5a3a';
      mctx.lineWidth = 1.5;
      mctx.save();
      mctx.translate(sx(h.pos.x), sz(h.pos.z));
      mctx.rotate(-h.heading);
      mctx.beginPath(); mctx.moveTo(-4, 3); mctx.lineTo(0, -4); mctx.lineTo(4, 3); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(-3, -3); mctx.lineTo(3, 3); mctx.moveTo(3, -3); mctx.lineTo(-3, 3); mctx.stroke();
      mctx.restore();
    }
    for (const c of enemies.commands || []) {
      if (!c.alive || !shown(c)) continue;
      mctx.fillStyle = c === lock ? '#ffd24a' : c.alerted ? '#40ff60' : '#ff4a3a';
      mctx.fillRect(sx(c.pos.x) - 2.5, sz(c.pos.z) - 2, 5, 4);
      mctx.fillRect(sx(c.pos.x) - 0.5, sz(c.pos.z) - 6, 1, 4);
    }
    const bossTank = enemies.boss;
    if (bossTank?.alive && (bossTank.awake || shown(bossTank))) {
      mctx.fillStyle = bossTank === lock ? '#ffd24a' : '#ff2020';
      mctx.shadowColor = '#ff2020'; mctx.shadowBlur = 6;
      mctx.save();
      mctx.translate(sx(bossTank.pos.x), sz(bossTank.pos.z));
      mctx.rotate(-bossTank.heading);
      mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(5, 5); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill();
      mctx.restore();
      mctx.shadowBlur = 0;
    }
    // Flag.
    if (flagPos) {
      mctx.fillStyle = '#ffe060';
      mctx.shadowColor = '#ffe060';
      mctx.shadowBlur = 6;
      star(mctx, sx(flagPos.x), sz(flagPos.z), 5);
      mctx.shadowBlur = 0;
    }
    // Player.
    mctx.save();
    mctx.translate(sx(player.pos.x), sz(player.pos.z));
    mctx.rotate(-player.heading);
    mctx.fillStyle = '#ffffff';
    mctx.shadowColor = '#9bff8a';
    mctx.shadowBlur = 6;
    mctx.beginPath();
    mctx.moveTo(0, -6); mctx.lineTo(4, 4); mctx.lineTo(0, 2); mctx.lineTo(-4, 4); mctx.closePath();
    mctx.fill();
    mctx.restore();
    if (reveal > 0) {
      // A scan sweep while the mortar reveal is active.
      mctx.strokeStyle = `rgba(255,200,80,${Math.min(0.8, reveal / 4)})`;
      mctx.lineWidth = 1;
      mctx.strokeRect(2.5, 2.5, W - 5, H - 5);
    }
    mctx.strokeStyle = 'rgba(155,255,138,0.6)';
    mctx.lineWidth = 1;
    mctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  function star(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  return { draw, drawMinimap, resize, setMap };
}
