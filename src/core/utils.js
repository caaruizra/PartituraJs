let uidSequence = 0;

export function uid(prefix = 'n') {
  uidSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidSequence.toString(36)}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function roundToGrid(value, grid) {
  return Math.round(value / grid) * grid;
}

export function clone(data) {
  if (typeof structuredClone === 'function') return structuredClone(data);
  if (Array.isArray(data)) return data.map((item) => clone(item));
  if (data && typeof data === 'object') {
    const copy = {};
    for (const [key, value] of Object.entries(data)) copy[key] = clone(value);
    return copy;
  }
  return data;
}
