// Pure scoring rules shared by the game and the menu.
const ENEMY_LISTS = ['turrets', 'drones', 'patrols', 'mortars', 'shields'];

export function openCellCount(level) {
  let count = 0;
  for (const row of level?.tiles || []) {
    for (const tile of row) if ((tile?.floor || 0) <= 0) count += 1;
  }
  return count;
}

// Par time grows with map size, enemy count and coins; three stars needs a clean run under par.
export function parSeconds(level) {
  const enemies = ENEMY_LISTS.reduce((sum, name) => sum + (level?.[name]?.length || 0), 0);
  const bosses = level?.bosses?.length || 0;
  const coins = (level?.coins?.length || 0) + (level?.bigCoins?.length || 0);
  return Math.round(40 + 0.1 * openCellCount(level) + 5 * enemies + 15 * bosses + 2 * coins);
}

export function starsFor(seconds, deaths, par) {
  let stars = 1;
  if (deaths === 0) stars += 1;
  if (seconds <= par) stars += 1;
  return stars;
}

export function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function starText(stars, max = 3) {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, max - stars));
}
