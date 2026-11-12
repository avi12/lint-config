import { clampConcurrency, eslintFlags, MIN_CONCURRENCY } from "eslint-config-avi12/defaults";

const OXLINT_CONFIG = ".oxlintrc.json";
const OXFMT_CONFIG = ".oxfmtrc.json";
const ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts"];
const STYLELINT_CONFIGS = [".stylelintrc.json", ".stylelintrc", "stylelint.config.js", "stylelint.config.mjs"];
const STYLE_GLOB = "**/*.{css,svelte,html}";
const BIN_DIRECTORY = "node_modules/.bin";
const TSRS_BINARY = `${BIN_DIRECTORY}/tsrs`;
const TSRS_LINT_BINARY = `${BIN_DIRECTORY}/tsrs-lint`;
const FALLOW_BINARY = `${BIN_DIRECTORY}/fallow`;
const WINDOWS_LAUNCHER_EXTENSION = ".CMD";
const SCRIPT_PATTERN = /\.(?:[cm]?[jt]s|svelte)$/;
const STYLE_PATTERN = /\.(?:css|svelte|html)$/;

/**
 * Builds the ordered list of steps to run in a repo: a tool is planned only when its config file or binary exists.
 * Each step is `{ name, command, env, isParallel }`; the parallel steps run together, ESLint first because it is
 * the one that peaks in memory, and the rest start beside it. Fixing is never parallel, since fixers must not
 * race on the same file.
 * `isFix` turns the checkers into fixers; `concurrency` reaches ESLint clamped to 1-4 (2 when absent).
 * `changedFiles`, when given, narrows oxlint, ESLint, stylelint and fallow to those files and drops ESLint to
 * concurrency 1 unless `concurrency` says otherwise; tsrs always checks the whole project. Pure, so it is testable.
 */
export function plan({ hasFile, isFix = false, concurrency, changedFiles, platform = "linux" }) {
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
  const styles = only(STYLE_PATTERN);
  const steps = [];
  const isEslintPlanned = hasAny(ESLINT_CONFIGS) && !isSkipped(scripts);
  if (isEslintPlanned) {
    const requested = concurrency ?? (changedFiles ? MIN_CONCURRENCY : undefined);
    steps.push({
      name: "eslint",
      command: ["eslint", ...eslintFlags(clampConcurrency(requested)), ...(isFix ? ["--fix"] : []), ...(scripts ?? [])],
      env: {},
      isParallel
    });
  }

  const isOxlintPlanned = hasFile(OXLINT_CONFIG) && !isSkipped(scripts);
  if (isOxlintPlanned) {
    const isTypeAware = hasFile(TSRS_LINT_BINARY);
    const extension = platform === "win32" ? WINDOWS_LAUNCHER_EXTENSION : "";
    steps.push({
      name: "oxlint",
      command: ["oxlint", ...(isTypeAware ? ["--type-aware"] : []), ...(isFix ? ["--fix"] : []), ...(scripts ?? [])],
      env: isTypeAware ? { OXLINT_TSGOLINT_PATH: `${TSRS_LINT_BINARY}${extension}` } : {},
      isParallel
    });
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

  if (hasFile(OXFMT_CONFIG)) {
    steps.push({
      name: "oxfmt",
      command: ["oxfmt", ...(isFix ? [] : ["--check"])],
      env: {},
      isParallel
    });
  }

  const isFallowPlanned = changedFiles && hasFile(FALLOW_BINARY);
  if (isFallowPlanned) {
    steps.push({
      name: "fallow",
      command: ["fallow", "audit"],
      env: {},
      isParallel
    });
  }

  return steps;
}
