import { clampConcurrency, eslintFlags, MIN_CONCURRENCY } from "./eslint-flags.js";

const OXLINT_CONFIG = ".oxlintrc.json";
const OXFMT_CONFIG = ".oxfmtrc.json";
const ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts"];
const STYLELINT_CONFIGS = [".stylelintrc.json", ".stylelintrc", "stylelint.config.js", "stylelint.config.mjs"];
const STYLE_GLOB = "**/*.{css,svelte,html}";
const BIN_DIRECTORY = "node_modules/.bin";
const TSRS_BINARY = `${BIN_DIRECTORY}/tsrs`;
const TSRS_LINT_BINARY = `${BIN_DIRECTORY}/tsrs-lint`;
const OXFMT_BINARY = `${BIN_DIRECTORY}/oxfmt`;
const FALLOW_NODE_OPTIONS = "--max-old-space-size=4096";
const FALLOW_BINARY = `${BIN_DIRECTORY}/fallow`;
const WINDOWS_LAUNCHER_EXTENSION = ".CMD";
const IGNORE_FILES = [".gitignore", ".prettierignore"];
const SCRIPT_PATTERN = /\.(?:[cm]?[jt]s|svelte)$/;
const SVELTE_PATTERN = /\.svelte(?:\.[cm]?[jt]s)?$/;
const STYLE_PATTERN = /\.(?:css|svelte|html)$/;

/**
 * Builds the ordered list of steps to run in a repo: a tool is planned only when its config file or binary exists.
 * Each step is `{ name, command, env, isParallel }`; the parallel steps run together, ESLint first because it is
 * the one that peaks in memory, and the rest start beside it. Fixing is never parallel, since fixers must not
 * race on the same file, and oxlint fixes twice around oxfmt because one pass leaves fixes that overlap; oxfmt runs
 * last so the final oxlint pass leaves no odd indentation or trailing spaces, and fix mode plans oxfmt when only its
 * binary is installed.
 * ESLint is the Svelte layer only: it is planned when it has a config and `hasSvelte` (the repo holds Svelte
 * files) is true, and it is given the Svelte files alone.
 * oxfmt is given the consumer's `.gitignore` and `.prettierignore` plus `oxfmtIgnores` (globs, the preset's default
 * ignore set), because oxfmt has no `extends` and a copied config cannot inherit them.
 * `isFix` turns the checkers into fixers; `concurrency` reaches ESLint clamped to 1-4 (2 when absent).
 * `changedFiles`, when given, narrows oxlint, ESLint, stylelint and fallow to those files and drops ESLint to
 * concurrency 1 unless `concurrency` says otherwise; tsrs always checks the whole project. fallow gets `NODE_OPTIONS` capping the Node heap at 4 GB, since a dirty tree once ran it to 38 GB. Pure, so it is
 * testable.
 */
export function plan({
  hasFile,
  hasSvelte = false,
  isFix = false,
  concurrency,
  changedFiles,
  oxfmtIgnores = [],
  platform = "linux"
}) {
  function hasAny(names) {
    return names.some(hasFile);
  }
  function only(pattern) {
    return changedFiles?.filter(file => pattern.test(file));
  }
  function isSkipped(files) {
    return files?.length === 0;
  }
  const isParallel = !isFix;
  const scripts = only(SCRIPT_PATTERN);
  const svelteFiles = only(SVELTE_PATTERN);
  const styles = only(STYLE_PATTERN);
  const steps = [];
  const isEslintPlanned = hasAny(ESLINT_CONFIGS) && hasSvelte && !isSkipped(svelteFiles);
  if (isEslintPlanned) {
    const requested = concurrency ?? (changedFiles ? MIN_CONCURRENCY : undefined);
    steps.push({
      name: "eslint",
      command: [
        "eslint",
        ...eslintFlags(clampConcurrency(requested)),
        ...(isFix ? ["--fix"] : []),
        ...(svelteFiles ?? [])
      ],
      env: {},
      isParallel
    });
  }

  const isOxlintPlanned = hasFile(OXLINT_CONFIG) && !isSkipped(scripts);
  const isTypeAware = hasFile(TSRS_LINT_BINARY);
  const extension = platform === "win32" ? WINDOWS_LAUNCHER_EXTENSION : "";
  const oxlintStep = {
    name: "oxlint",
    command: ["oxlint", ...(isTypeAware ? ["--type-aware"] : []), ...(isFix ? ["--fix"] : []), ...(scripts ?? [])],
    env: isTypeAware ? { OXLINT_TSGOLINT_PATH: `${TSRS_LINT_BINARY}${extension}` } : {},
    isParallel
  };
  if (isOxlintPlanned) {
    steps.push(oxlintStep);
  }

  if (hasFile(TSRS_BINARY)) {
    steps.push({
      name: "tsrs",
      command: ["tsrs", "--noEmit"],
      env: {},
      isParallel
    });
  }

  const isStylelintPlanned = hasAny(STYLELINT_CONFIGS) && !isSkipped(styles);
  if (isStylelintPlanned) {
    steps.push({
      name: "stylelint",
      command: ["stylelint", ...(styles ?? [STYLE_GLOB]), ...(isFix ? ["--fix"] : [])],
      env: {},
      isParallel
    });
  }

  const isOxfmtPlanned = hasFile(OXFMT_CONFIG) || (isFix && hasFile(OXFMT_BINARY));
  const oxfmtStep = {
    name: "oxfmt",
    command: [
      "oxfmt",
      ...(isFix ? [] : ["--check"]),
      ...IGNORE_FILES.filter(hasFile).flatMap(file => ["--ignore-path", file]),
      ...(oxfmtIgnores.length > 0 ? [...oxfmtIgnores.map(glob => `"!${glob}"`), "."] : [])
    ],
    env: {},
    isParallel
  };
  if (isOxfmtPlanned) {
    steps.push(oxfmtStep);
  }

  const isSecondOxlintPassPlanned = isFix && isOxlintPlanned && isOxfmtPlanned;
  if (isSecondOxlintPassPlanned) {
    steps.push(oxlintStep, oxfmtStep);
  }

  const isFallowPlanned = changedFiles && hasFile(FALLOW_BINARY);
  if (isFallowPlanned) {
    steps.push({
      name: "fallow",
      command: ["fallow", "audit"],
      env: {
        NODE_OPTIONS: FALLOW_NODE_OPTIONS
      },
      isParallel
    });
  }

  return steps;
}
