export const CACHE_LOCATION = ".verify/eslint-cache/";
export const CACHE_STRATEGY = "content";
export const MIN_CONCURRENCY = 1;
export const DEFAULT_CONCURRENCY = 2;
export const MAX_CONCURRENCY = 4;

/** Parses a requested concurrency and clamps it to 1-4; anything unparsable is the default of 2. */
export function clampConcurrency(requested) {
  const count = Number.parseInt(requested, 10);
  if (Number.isNaN(count)) {
    return DEFAULT_CONCURRENCY;
  }

  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, count));
}

/** The ESLint flags every run gets: a content-hashed cache under `.verify`, concurrency clamped. */
export function eslintFlags(requested) {
  return [
    "--cache",
    "--cache-strategy",
    CACHE_STRATEGY,
    "--cache-location",
    CACHE_LOCATION,
    "--concurrency",
    String(clampConcurrency(requested))
  ];
}
