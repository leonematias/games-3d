export const DROP_VALUES = { coin: 1, bigCoin: 10 };

export function dropKind(item) {
  return item?.drop === 'coin' || item?.drop === 'bigCoin' ? item.drop : null;
}

export function reservedDropValue(level) {
  let total = 0;
  for (const listName of ['turrets', 'bosses', 'patrols', 'mortars']) {
    const list = level?.[listName];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const kind = dropKind(item);
      if (kind) total += DROP_VALUES[kind];
    }
  }
  return total;
}