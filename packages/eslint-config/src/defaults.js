export const IGNORES = [
  "**/node_modules/",
  "**/dist/",
  "**/build/",
  "**/coverage/",
  "**/.svelte-kit/",
  "**/.worktrees/",
  "**/.claude/worktrees/",
  "**/.verify/"
];

export const CACHE_LOCATION = "node_modules/.cache/eslint/";
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 4;

/** Parses a requested concurrency and clamps it to 1-4; anything unparsable is 1. */
export function clampConcurrency(requested) {
  const count = Number.parseInt(requested, 10);
  if (Number.isNaN(count)) {
    return MIN_CONCURRENCY;
  }
  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, count));
}

/** The ESLint flags every run gets: cache on, concurrency clamped. */
export function eslintFlags(requested) {
  return ["--cache", "--cache-location", CACHE_LOCATION, "--concurrency", String(clampConcurrency(requested))];
}
