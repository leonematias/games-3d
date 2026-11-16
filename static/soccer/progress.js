// Cleared cups, best score and stars. One star for the win, one for a
// clean sheet, one for scoring with a full-power drive shot.
const KEY = 'soccer-player-progress-v1';

function defaults() { return { levels: {} }; }

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return { levels: parsed.levels && typeof parsed.levels === 'object' ? parsed.levels : {} };
  } catch {
    return defaults();
  }
}

export function saveProgress(progress) {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* private mode */ }
}

export function recordClear(progress, id, { time, conceded, driveGoals, parSeconds, score, won }) {
  const stars = won ? 1 + (conceded === 0 ? 1 : 0) + (driveGoals > 0 ? 1 : 0) : 0;
  const prev = progress.levels[id] || {};
  const bestTime = won && (prev.bestTime == null || time < prev.bestTime) ? time : (prev.bestTime ?? null);
  progress.levels[id] = {
    bestTime,
    bestScore: Math.max(prev.bestScore || 0, score || 0),
    stars: Math.max(prev.stars || 0, stars),
    clears: (prev.clears || 0) + (won ? 1 : 0),
  };
  saveProgress(progress);
  return { stars, bestTime, bestStars: progress.levels[id].stars, bestScore: progress.levels[id].bestScore };
}

export function starTotal(progress) {
  return Object.values(progress.levels).reduce((sum, level) => sum + (level.stars || 0), 0);
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
