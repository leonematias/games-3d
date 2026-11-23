const STORAGE_KEY = 'nuclear-tank-cleared';
const RECORDS_KEY = 'nuclear-tank-records';

export function parseCleared(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === 'string' && id);
  } catch {
    return [];
  }
}

export function clearedIds() {
  if (typeof localStorage === 'undefined') return new Set();
  return new Set(parseCleared(localStorage.getItem(STORAGE_KEY)));
}

export function markLevelCleared(levelId) {
  if (!levelId || typeof localStorage === 'undefined') return;
  const ids = clearedIds();
  ids.add(levelId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function parseRecords(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function allRecords() {
  if (typeof localStorage === 'undefined') return {};
  return parseRecords(localStorage.getItem(RECORDS_KEY));
}

export function levelRecord(levelId) {
  return allRecords()[levelId] || null;
}

// Best of each: most stars, fastest time, number of clears. Returns the stored record.
export function mergeRecord(previous, result) {
  const best = previous || { stars: 0, bestTime: null, clears: 0 };
  return {
    stars: Math.max(best.stars || 0, result.stars || 0),
    bestTime: best.bestTime == null ? result.time : Math.min(best.bestTime, result.time),
    clears: (best.clears || 0) + 1
  };
}

export function recordResult(levelId, result) {
  if (!levelId || typeof localStorage === 'undefined') return null;
  const records = allRecords();
  records[levelId] = mergeRecord(records[levelId], result);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  return records[levelId];
}
