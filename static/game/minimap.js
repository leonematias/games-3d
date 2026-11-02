import { LOCK_SWATCH, lockColor } from './lock-colors.js';
import { lineOfSightClear } from './turret-logic.js';

export const MINIMAP_SIGHT_CELLS = 12;

export function shouldShowMinimap(width, depth) {
  return width >= 22 || depth >= 22;
}

export function floodOpenCells(width, depth, startX, startZ, blocks) {
  if (startX < 0 || startZ < 0 || startX >= width || startZ >= depth) return [];
  if (blocks(startX, startZ)) return [{ x: startX, z: startZ }];
  const cells = [{ x: startX, z: startZ }];
  const seen = new Set([`${startX},${startZ}`]);
  for (let index = 0; index < cells.length; index += 1) {
    const { x, z } = cells[index];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue;
      const key = `${nx},${nz}`;
      if (seen.has(key) || blocks(nx, nz)) continue;
      seen.add(key);
      cells.push({ x: nx, z: nz });
    }
  }
  return cells;
}

export function createMinimapFog() {
  const explored = new Set();
  const seen = new Set();

  function reveal(cells) {
    for (const cell of cells) explored.add(`${cell.x},${cell.z}`);
  }

  function isExplored(x, z) {
    return explored.has(`${x},${z}`);
  }

  function see(kind, x, z) {
    seen.add(`${kind}:${x},${z}`);
  }

  function hasSeen(kind, x, z) {
    return seen.has(`${kind}:${x},${z}`);
  }

  return { reveal, isExplored, see, hasSeen };
}

export function fogWallVisible(x, z, isExplored) {
  return isExplored(x + 1, z) || isExplored(x - 1, z) || isExplored(x, z + 1) || isExplored(x, z - 1);
}

export function canSeeCell(playerX, playerZ, cellX, cellZ, tileSize, isOccluder, sightCells = MINIMAP_SIGHT_CELLS) {
  const targetX = (cellX + 0.5) * tileSize;
  const targetZ = (cellZ + 0.5) * tileSize;
  if (Math.hypot(targetX - playerX, targetZ - playerZ) > sightCells * tileSize) return false;
  return lineOfSightClear(playerX, playerZ, targetX, targetZ, tileSize, isOccluder);
}

function cellOrigin(pixelWidth, pixelHeight, width, depth) {
  const cell = Math.min(pixelWidth / width, pixelHeight / depth);
  return {
    cell,
    originX: (pixelWidth - cell * width) / 2,
    originY: (pixelHeight - cell * depth) / 2
  };
}

function fillCell(ctx, layout, x, z, color, inset = 0.15) {
  const pad = layout.cell * inset;
  ctx.fillStyle = color;
  ctx.fillRect(
    layout.originX + x * layout.cell + pad,
    layout.originY + z * layout.cell + pad,
    Math.max(1, layout.cell - pad * 2),
    Math.max(1, layout.cell - pad * 2)
  );
}

function markerVisible(fog, kind, x, z) {
  if (!fog) return true;
  if (kind === 'key' || kind === 'gate' || kind === 'boss') return fog.hasSeen(kind, x, z);
  return fog.isExplored(Math.floor(x), Math.floor(z));
}

export function drawMinimap(ctx, pixelWidth, pixelHeight, level, actors) {
  const width = level.size.width;
  const depth = level.size.depth;
  const tileSize = level.tileSize || 1;
  const layout = cellOrigin(pixelWidth, pixelHeight, width, depth);
  const fog = actors.fog || null;
  ctx.clearRect(0, 0, pixelWidth, pixelHeight);
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, pixelWidth, pixelHeight);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const floor = level.tiles[z]?.[x]?.floor || 0;
      const wall = floor > 0;
      if (fog) {
        if (wall) {
          if (!fogWallVisible(x, z, fog.isExplored)) continue;
        } else if (!fog.isExplored(x, z)) continue;
      }
      ctx.fillStyle = wall ? '#475569' : '#10241c';
      ctx.fillRect(layout.originX + x * layout.cell, layout.originY + z * layout.cell, layout.cell + 0.5, layout.cell + 0.5);
    }
  }
  for (const item of actors.walls || []) {
    if (!fog || fogWallVisible(item.x, item.z, fog.isExplored)) fillCell(ctx, layout, item.x, item.z, '#64748b', 0);
  }
  for (const item of actors.boxes || []) {
    if (markerVisible(fog, 'box', item.x, item.z)) fillCell(ctx, layout, item.x, item.z, '#a16207');
  }
  for (const item of actors.switches || []) {
    if (markerVisible(fog, 'switch', item.x, item.z)) fillCell(ctx, layout, item.x, item.z, item.on ? '#f8fafc' : LOCK_SWATCH[lockColor(item.id)], 0.28);
  }
  for (const item of actors.shields || []) {
    if (markerVisible(fog, 'shield', item.x, item.z)) fillCell(ctx, layout, item.x, item.z, '#38bdf8', 0.2);
  }
  for (const item of actors.gates || []) {
    if (markerVisible(fog, 'gate', item.x, item.z)) fillCell(ctx, layout, item.x, item.z, LOCK_SWATCH[lockColor(item.id)], 0.08);
  }
  for (const item of actors.keys || []) {
    if (markerVisible(fog, 'key', item.x, item.z)) fillCell(ctx, layout, item.x, item.z, LOCK_SWATCH[lockColor(item.id)], 0.22);
  }
  for (const item of actors.coins || []) {
    if (markerVisible(fog, 'coin', item.x, item.z)) fillCell(ctx, layout, item.x, item.z, '#facc15', 0.32);
  }
  for (const item of actors.bigCoins || []) {
    if (markerVisible(fog, 'bigCoin', item.x, item.z)) fillCell(ctx, layout, item.x, item.z, '#f59e0b', 0.2);
  }
  for (const item of actors.turrets || []) {
    if (markerVisible(fog, 'turret', item.x, item.z)) fillCell(ctx, layout, item.x, item.z, '#fb7185', 0.2);
  }
  for (const item of actors.bosses || []) {
    if (!markerVisible(fog, 'boss', item.origin?.x ?? item.x, item.origin?.z ?? item.z)) continue;
    fillCell(ctx, layout, item.x, item.z, '#e11d48', 0.05);
    fillCell(ctx, layout, item.x + 1, item.z, '#e11d48', 0.05);
    fillCell(ctx, layout, item.x, item.z + 1, '#e11d48', 0.05);
    fillCell(ctx, layout, item.x + 1, item.z + 1, '#e11d48', 0.05);
  }
  for (const item of actors.drones || []) {
    const x = item.worldX / tileSize - 0.5;
    const z = item.worldZ / tileSize - 0.5;
    if (markerVisible(fog, 'drone', x, z)) fillCell(ctx, layout, x, z, '#fb923c', 0.2);
  }
  const player = actors.player;
  if (!player) return;
  const px = layout.originX + (player.x / tileSize) * layout.cell;
  const py = layout.originY + (player.z / tileSize) * layout.cell;
  const radius = Math.max(3, layout.cell * 0.55);
  const rightX = player.fz;
  const rightY = -player.fx;
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(px + player.fx * radius, py + player.fz * radius);
  ctx.lineTo(px - player.fx * radius * 0.65 + rightX * radius * 0.5, py - player.fz * radius * 0.65 + rightY * radius * 0.5);
  ctx.lineTo(px - player.fx * radius * 0.65 - rightX * radius * 0.5, py - player.fz * radius * 0.65 - rightY * radius * 0.5);
  ctx.closePath();
  ctx.fill();
}
