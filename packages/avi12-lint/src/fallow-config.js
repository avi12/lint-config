function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merges a fallow config layer over a base one. fallow's own `extends` replaces arrays, so here arrays are united
 * (base order first, no duplicates), objects merge recursively and any other value is taken from the layer.
 * Pure.
 */
export function mergeFallowConfig({ base, local }) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(local)) {
    const current = merged[key];
    if (Array.isArray(current) && Array.isArray(value)) {
      merged[key] = [...new Set([...current, ...value])];
    } else if (isRecord(current) && isRecord(value)) {
      merged[key] = mergeFallowConfig({ base: current, local: value });
    } else {
      merged[key] = value;
    }
  }

  return merged;
}
