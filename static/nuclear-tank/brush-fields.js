export function normalizeDrop(value) {
  return value === 'coin' || value === 'bigCoin' ? value : '';
}

export function normalizeLockId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '1';
  const lower = text.toLowerCase();
  if (lower === 'red' || lower === 'blue' || lower === 'yellow') return lower;
  return text;
}

export function lockIdOf(item) {
  return normalizeLockId(item?.id);
}

export function applyBrushFields(listName, item, brush) {
  if (listName === 'turrets' || listName === 'bosses') {
    const drop = normalizeDrop(brush?.drop);
    if (drop) item.drop = drop;
    else delete item.drop;
  }
  if (listName === 'keys' || listName === 'gates' || listName === 'switches' || listName === 'toggleWalls') {
    item.id = normalizeLockId(brush?.lockId);
  }
  if (listName === 'patrols' || listName === 'mortars') {
    const drop = normalizeDrop(brush?.drop);
    if (drop) item.drop = drop;
    else delete item.drop;
  }
  return item;
}

export function brushMatches(listName, item, brush) {
  if (listName === 'turrets' || listName === 'bosses') {
    return (item?.drop || '') === normalizeDrop(brush?.drop);
  }
  if (listName === 'keys' || listName === 'gates' || listName === 'switches' || listName === 'toggleWalls') {
    return lockIdOf(item) === normalizeLockId(brush?.lockId);
  }
  if (listName === 'patrols' || listName === 'mortars') {
    return (item?.drop || '') === normalizeDrop(brush?.drop);
  }
  return true;
}
