export const LOCK_COLORS = ['red', 'blue', 'yellow'];

export const LOCK_SWATCH = {
  red: '#ef4444',
  blue: '#38bdf8',
  yellow: '#facc15'
};

export function isColorKey(id) {
  const text = typeof id === 'string' ? id.trim().toLowerCase() : '';
  return text === 'red' || text === 'blue' || text === 'yellow';
}

// Named colors stay themselves. Numbered locks cycle through the same three paints.
export function lockColor(id) {
  const text = typeof id === 'string' ? id.trim().toLowerCase() : '';
  if (text === 'red' || text === 'r' || text === '1') return 'red';
  if (text === 'blue' || text === 'b' || text === '2') return 'blue';
  if (text === 'yellow' || text === 'y' || text === '3') return 'yellow';
  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric > 0) return LOCK_COLORS[(numeric - 1) % LOCK_COLORS.length];
  if (!text) return 'red';
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash += text.charCodeAt(index);
  return LOCK_COLORS[hash % LOCK_COLORS.length];
}
