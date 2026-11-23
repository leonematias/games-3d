// Saved progress: cleared forts with best time and stars, the score bank and
// the upgrades bought with it, the loadout carried from level to level, the
// daily fort results and which onboarding tips have been shown. One star for the flag, one for the secondary
// objective, one for never being destroyed.
import { UPGRADES, WEAPONS } from './config.js';

const KEY = 'tank-terrain-progress-v2';
const OLD_KEY = 'tank-terrain-progress-v1';

function defaults() {
  return { levels: {}, bank: 0, earned: 0, upgrades: { armor: 0, engine: 0, turret: 0, ammo: 0, battery: 0 }, loadout: null, daily: {}, tips: {} };
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const out = defaults();
    if (parsed.levels && typeof parsed.levels === 'object') out.levels = parsed.levels;
    if (typeof parsed.bank === 'number') out.bank = parsed.bank;
    if (typeof parsed.earned === 'number') out.earned = parsed.earned;
    if (parsed.upgrades) for (const k of Object.keys(out.upgrades)) out.upgrades[k] = Math.max(0, Math.min(UPGRADES[k].max, parsed.upgrades[k] | 0));
    if (parsed.loadout && Array.isArray(parsed.loadout.weapons)) out.loadout = parsed.loadout;
    if (parsed.daily && typeof parsed.daily === 'object') out.daily = parsed.daily;
    if (parsed.tips && typeof parsed.tips === 'object') out.tips = parsed.tips;
    return out;
  } catch {
    return defaults();
  }
}

export function saveProgress(progress) {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* private mode */ }
}

export function recordClear(progress, id, { time, deaths, parSeconds, score, objectiveDone = false, daily = false, dateKey = null, loadout = null }) {
  const stars = 1 + (objectiveDone ? 1 : 0) + (deaths === 0 ? 1 : 0);
  const underPar = !!(parSeconds && time <= parSeconds);
  progress.bank += score || 0;
  progress.earned += score || 0;
  if (daily) {
    const key = dateKey || id;
    const prev = progress.daily[key] || { runs: 0 };
    progress.daily[key] = {
      name: prev.name,
      bestScore: Math.max(prev.bestScore || 0, score || 0),
      bestTime: prev.bestTime == null || time < prev.bestTime ? time : prev.bestTime,
      stars: Math.max(prev.stars || 0, stars),
      runs: (prev.runs || 0) + 1
    };
    // Keep the last 14 days only.
    const keys = Object.keys(progress.daily).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 14))) delete progress.daily[k];
  } else {
    const prev = progress.levels[id] || {};
    const bestTime = prev.bestTime == null || time < prev.bestTime ? time : prev.bestTime;
    progress.levels[id] = {
      bestTime,
      bestScore: Math.max(prev.bestScore || 0, score || 0),
      stars: Math.max(prev.stars || 0, stars),
      clears: (prev.clears || 0) + 1,
      underPar: !!(prev.underPar || underPar)
    };
    if (loadout) progress.loadout = loadout;
  }
  saveProgress(progress);
  return { stars, underPar, bestStars: daily ? (progress.daily[dateKey || id] || {}).stars : progress.levels[id].stars };
}

export function buyUpgrade(progress, key) {
  const def = UPGRADES[key];
  if (!def) return false;
  const level = progress.upgrades[key] || 0;
  if (level >= def.max) return false;
  const cost = def.cost[level];
  if (progress.bank < cost) return false;
  progress.bank -= cost;
  progress.upgrades[key] = level + 1;
  saveProgress(progress);
  return true;
}

export function upgradeCost(progress, key) {
  const def = UPGRADES[key];
  const level = progress.upgrades[key] || 0;
  return level >= def.max ? null : def.cost[level];
}

// What the bought upgrades do to the tank.
export function upgradeMods(progress) {
  const u = progress.upgrades || {};
  return {
    hp: (u.armor || 0) * UPGRADES.armor.per,
    speedMul: 1 + (u.engine || 0) * UPGRADES.engine.per,
    turretMul: 1 + (u.turret || 0) * UPGRADES.turret.per,
    ammoMul: 1 + (u.ammo || 0) * UPGRADES.ammo.per,
    battery: (u.battery || 0) * UPGRADES.battery.per
  };
}

// A loadout snapshot to carry into the next level.
export function snapshotLoadout(player) {
  const ammo = {};
  for (const name of player.weapons) ammo[name] = player.ammo[name] === Infinity ? null : player.ammo[name];
  return { weapons: [...player.weapons], ammo };
}

export function applyLoadout(player, loadout, ammoMul = 1) {
  if (!loadout) return [];
  const gained = [];
  for (const name of loadout.weapons) {
    if (!WEAPONS[name]) continue;
    if (!player.weapons.has(name)) { player.weapons.add(name); gained.push(name); }
    const w = WEAPONS[name];
    if (w.ammo == null) { player.ammo[name] = Infinity; continue; }
    const carried = loadout.ammo?.[name] ?? w.ammo;
    player.ammo[name] = Math.max(player.ammo[name] || 0, Math.min(Math.round(w.max * ammoMul), carried));
  }
  return gained;
}

export function starTotal(progress) {
  return Object.values(progress.levels).reduce((sum, level) => sum + (level.stars || 0), 0);
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// Onboarding tips are shown once each, ever. `resetTips` brings them back.
export function tipSeen(progress, name) { return !!progress.tips?.[name]; }
export function markTip(progress, name) {
  progress.tips = progress.tips || {};
  progress.tips[name] = true;
  saveProgress(progress);
}
export function resetTips(progress) { progress.tips = {}; saveProgress(progress); }
