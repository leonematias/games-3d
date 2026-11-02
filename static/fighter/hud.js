import * as THREE from 'three';

// Vector-style HUD drawn on a 2D canvas over the scene: reticle, horizon,
// target brackets with range, lock-on diamond, bomb fall line, edge arrows
// to off-screen bandits and incoming missiles, and the radar scope.

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const GREEN = '#5cff7a';
const RED = '#ff4a3a';
const ORANGE = '#ffb347';

export function createHud(canvas, radarCanvas) {
  const ctx = canvas.getContext('2d');
  const rctx = radarCanvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let sweep = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  // Returns { x, y, front, depth } in CSS pixels.
  function project(camera, pos) {
    _c.copy(pos).applyMatrix4(camera.matrixWorldInverse);
    const front = _c.z < 0;
    _v.copy(pos).project(camera);
    return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, front, depth: -_c.z };
  }

  function bracket(x, y, size, color, lineWidth = 1.5) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    const s = size, k = size * 0.35;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s + k); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + k, y - s);
    ctx.moveTo(x + s - k, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + k);
    ctx.moveTo(x + s, y + s - k); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - k, y + s);
    ctx.moveTo(x - s + k, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - k);
    ctx.stroke();
  }

  function diamond(x, y, size, color, lineWidth = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath();
    ctx.stroke();
  }

  function edgeArrow(x, y, color, label) {
    const cx = w / 2, cy = h / 2;
    let dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const margin = 46;
    const ex = cx + dx * Math.min(len, Math.min((w / 2 - margin) / Math.abs(dx || 1e-6), (h / 2 - margin) / Math.abs(dy || 1e-6)));
    const ey = cy + dy * Math.min(len, Math.min((w / 2 - margin) / Math.abs(dx || 1e-6), (h / 2 - margin) / Math.abs(dy || 1e-6)));
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (label) {
      ctx.fillStyle = color;
      ctx.font = '600 11px Rajdhani, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, ex, ey + 22);
    }
  }

  function label(x, y, text, color, size = 12, align = 'left') {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px Rajdhani, Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }

  function clear() { ctx.clearRect(0, 0, w, h); }
  function draw({ camera, player, targets, locked, lockProgress, incoming, bombPoint, weapon, time, nearestBase, gunTarget, hitMarker, popups = [] }) {
    ctx.clearRect(0, 0, w, h);
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 3;
    const cx = w / 2, cy = h / 2;

    // Horizon bar rolls with the wings and slides with the nose.
    ctx.save();
    ctx.translate(cx, cy + player.pitch * 420);
    ctx.rotate(-player.roll);
    ctx.strokeStyle = 'rgba(92,255,122,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-260, 0); ctx.lineTo(-70, 0);
    ctx.moveTo(70, 0); ctx.lineTo(260, 0);
    ctx.stroke();
    for (const step of [-2, -1, 1, 2]) {
      const yy = -step * 110;
      ctx.setLineDash(step < 0 ? [6, 6] : []);
      ctx.beginPath();
      ctx.moveTo(-90, yy); ctx.lineTo(-40, yy);
      ctx.moveTo(40, yy); ctx.lineTo(90, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      label(-100, yy + 4, `${step * 10}`, 'rgba(92,255,122,0.6)', 11, 'right');
    }
    ctx.restore();

    // Reticle: turns orange with a filled centre while the cannon has a target under the aim assist.
    const onTarget = weapon === 0 && gunTarget;
    ctx.strokeStyle = onTarget ? ORANGE : GREEN;
    ctx.lineWidth = onTarget ? 2.4 : 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 20, cy);
    ctx.moveTo(cx + 20, cy); ctx.lineTo(cx + 30, cy);
    ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy - 20);
    ctx.moveTo(cx, cy + 20); ctx.lineTo(cx, cy + 30);
    ctx.stroke();
    ctx.fillStyle = onTarget ? ORANGE : GREEN;
    if (onTarget) { ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    if (hitMarker > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, hitMarker * 4)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy - 14); ctx.lineTo(cx - 6, cy - 6);
      ctx.moveTo(cx + 14, cy - 14); ctx.lineTo(cx + 6, cy - 6);
      ctx.moveTo(cx - 14, cy + 14); ctx.lineTo(cx - 6, cy + 6);
      ctx.moveTo(cx + 14, cy + 14); ctx.lineTo(cx + 6, cy + 6);
      ctx.stroke();
    }
    // Velocity vector / flight path marker.
    const fpm = project(camera, _v.copy(player.pos).addScaledVector(player.vel, 4));
    if (fpm.front) {
      ctx.strokeStyle = 'rgba(92,255,122,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fpm.x, fpm.y, 7, 0, Math.PI * 2);
      ctx.moveTo(fpm.x - 16, fpm.y); ctx.lineTo(fpm.x - 7, fpm.y);
      ctx.moveTo(fpm.x + 7, fpm.y); ctx.lineTo(fpm.x + 16, fpm.y);
      ctx.moveTo(fpm.x, fpm.y - 7); ctx.lineTo(fpm.x, fpm.y - 14);
      ctx.stroke();
    }

    // Targets.
    let nearestPlane = null, nearestPlaneDist = Infinity;
    for (const t of targets) {
      const p = project(camera, t.pos);
      const dist = t.pos.distanceTo(player.pos);
      if (t.kind === 'plane' && dist < nearestPlaneDist) { nearestPlaneDist = dist; nearestPlane = { t, p }; }
      if (!p.front || p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
      if (dist > 4200) continue;
      const size = THREE.MathUtils.clamp((t.radius * 1.6) / p.depth * (h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), 10, 70);
      const color = t === locked ? ORANGE : t.kind === 'plane' ? RED : 'rgba(255,90,60,0.85)';
      if (t.kind === 'plane') bracket(p.x, p.y, size, color, t === locked ? 2.2 : 1.4);
      else diamond(p.x, p.y, size * 0.8, color, t === locked ? 2.2 : 1.2);
      if (t === locked) {
        if (lockProgress < 1) {
          ctx.strokeStyle = ORANGE;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size + 14 + (1 - lockProgress) * 40, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeStyle = ORANGE;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size + 10, 0, Math.PI * 2);
          ctx.stroke();
          label(p.x + size + 16, p.y - 4, 'LOCK', ORANGE, 13);
        }
      }
      if (t === locked || t.kind === 'plane') {
        if (t === locked) label(p.x + size + 6, p.y + size + 2, `${t.name}`, color, 12);
        label(p.x + size + 6, p.y + size + 16, `${Math.round(dist)}m`, color, 12);
        if (t.maxHp && t.hp < t.maxHp) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(p.x - size, p.y + size + 6, size * 2, 4);
          ctx.fillStyle = color;
          ctx.fillRect(p.x - size, p.y + size + 6, size * 2 * Math.max(0, t.hp / t.maxHp), 4);
        }
      }
    }
    if (nearestPlane) {
      const p = nearestPlane.p;
      const off = !p.front || p.x < 0 || p.x > w || p.y < 0 || p.y > h;
      if (off) edgeArrow(p.front ? p.x : w - p.x, p.front ? p.y : h - p.y, RED, `BANDIT ${Math.round(nearestPlaneDist)}m`);
    } else if (nearestBase) {
      const p = project(camera, nearestBase.pos);
      const off = !p.front || p.x < 0 || p.x > w || p.y < 0 || p.y > h;
      if (off) edgeArrow(p.front ? p.x : w - p.x, p.front ? p.y : h - p.y, 'rgba(255,120,80,0.9)', `${nearestBase.name.toUpperCase()} ${Math.round(nearestBase.pos.distanceTo(player.pos))}m`);
    }

    // Incoming missiles.
    for (const m of incoming) {
      const p = project(camera, m.pos);
      const on = p.front && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
      if (on) {
        ctx.strokeStyle = ORANGE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9 + Math.sin(time * 20) * 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        edgeArrow(p.front ? p.x : w - p.x, p.front ? p.y : h - p.y, ORANGE, 'MISSILE');
      }
    }

    // Bomb impact point.
    if (weapon === 2 && bombPoint) {
      const p = project(camera, bombPoint);
      if (p.front) {
        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(cx, cy + 30);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.moveTo(p.x - 22, p.y); ctx.lineTo(p.x + 22, p.y);
        ctx.moveTo(p.x, p.y - 22); ctx.lineTo(p.x, p.y + 22);
        ctx.stroke();
        label(p.x + 20, p.y - 16, 'BOMB', GREEN, 12);
      }
    }
    // Floating score pop-ups.
    for (const pop of popups) {
      const p = project(camera, pop.pos);
      if (!p.front) continue;
      const t = pop.age / pop.life;
      ctx.globalAlpha = 1 - t * t;
      label(p.x, p.y - 20 - t * 60, pop.text, pop.color || '#ffffff', 22 + (1 - t) * 6, 'center');
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  }

  function drawRadar({ player, targets, incoming, bases, range = 3200, dt }) {
    const size = radarCanvas.width;
    const c = size / 2;
    sweep = (sweep + dt * 1.6) % (Math.PI * 2);
    rctx.clearRect(0, 0, size, size);
    rctx.save();
    rctx.beginPath();
    rctx.arc(c, c, c - 2, 0, Math.PI * 2);
    rctx.fillStyle = 'rgba(0, 24, 12, 0.55)';
    rctx.fill();
    rctx.clip();
    // Sweep wedge.
    const grad = rctx.createConicGradient ? rctx.createConicGradient(sweep - Math.PI / 2, c, c) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(92,255,122,0.35)');
      grad.addColorStop(0.18, 'rgba(92,255,122,0)');
      grad.addColorStop(1, 'rgba(92,255,122,0)');
      rctx.fillStyle = grad;
      rctx.fillRect(0, 0, size, size);
    }
    rctx.strokeStyle = 'rgba(92,255,122,0.35)';
    rctx.lineWidth = 1;
    for (const r of [0.33, 0.66]) { rctx.beginPath(); rctx.arc(c, c, (c - 2) * r, 0, Math.PI * 2); rctx.stroke(); }
    rctx.beginPath(); rctx.moveTo(c, 2); rctx.lineTo(c, size - 2); rctx.moveTo(2, c); rctx.lineTo(size - 2, c); rctx.stroke();
    const heading = player.heading;
    const toRadar = (pos) => {
      const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
      // Rotate so the nose points up: heading is the yaw of the forward vector.
      const rx = dx * Math.cos(heading) - dz * Math.sin(heading);
      const rz = dx * Math.sin(heading) + dz * Math.cos(heading);
      const k = (c - 6) / range;
      return { x: c + rx * k, y: c + rz * k, inRange: Math.hypot(dx, dz) < range };
    };
    for (const base of bases) {
      const p = toRadar(base.pos);
      rctx.strokeStyle = base.cleared ? 'rgba(120,120,120,0.6)' : 'rgba(255,110,70,0.9)';
      rctx.lineWidth = 1.5;
      rctx.beginPath();
      rctx.arc(p.x, p.y, base.radius * (c - 6) / range + 2, 0, Math.PI * 2);
      rctx.stroke();
    }
    for (const t of targets) {
      const p = toRadar(t.pos);
      if (!p.inRange) continue;
      rctx.fillStyle = t.kind === 'plane' ? RED : 'rgba(255,110,70,0.9)';
      if (t.kind === 'plane') {
        rctx.beginPath();
        rctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        rctx.fill();
      } else rctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    for (const m of incoming) {
      const p = toRadar(m.pos);
      rctx.fillStyle = ORANGE;
      rctx.beginPath();
      rctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      rctx.fill();
    }
    // Player.
    rctx.fillStyle = GREEN;
    rctx.beginPath();
    rctx.moveTo(c, c - 7); rctx.lineTo(c + 5, c + 6); rctx.lineTo(c, c + 3); rctx.lineTo(c - 5, c + 6); rctx.closePath();
    rctx.fill();
    rctx.restore();
    rctx.strokeStyle = GREEN;
    rctx.lineWidth = 1.5;
    rctx.beginPath();
    rctx.arc(c, c, c - 2, 0, Math.PI * 2);
    rctx.stroke();
  }

  return { resize, draw, drawRadar, project, clear };
}
