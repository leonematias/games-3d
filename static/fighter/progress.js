// Cleared theatres, best time and stars. One star for clearing the theatre,
// one for never being shot down, one for beating par.
const KEY = 'fighter-plane-progress-v1';

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

export function recordClear(progress, id, { time, deaths, parSeconds, score }) {
  const stars = 1 + (deaths === 0 ? 1 : 0) + (parSeconds && time <= parSeconds ? 1 : 0);
  const prev = progress.levels[id] || {};
  const bestTime = prev.bestTime == null || time < prev.bestTime ? time : prev.bestTime;
  progress.levels[id] = {
    bestTime,
    bestScore: Math.max(prev.bestScore || 0, score || 0),
    stars: Math.max(prev.stars || 0, stars),
    clears: (prev.clears || 0) + 1
  };
  saveProgress(progress);
  return { stars, bestTime, bestStars: progress.levels[id].stars };
}

export function starTotal(progress) {
  return Object.values(progress.levels).reduce((sum, level) => sum + (level.stars || 0), 0);
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
