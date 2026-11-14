import { clampConcurrency, eslintFlags, MIN_CONCURRENCY } from "./eslint-flags.js";
import { kotlinSteps } from "./kotlin.js";
import { ignoredGlobs, isIgnoredPath, LANGUAGE_PATTERNS } from "./languages.js";
import { isTextChecked as isTextCheckedFile } from "./text-check.js";

const OXLINT_CONFIG = ".oxlintrc.json";
const NESTED_CONFIG_FLAG = "--disable-nested-config";
const OXFMT_CONFIG = ".oxfmtrc.json";
const ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts"];
const STYLELINT_CONFIGS = [".stylelintrc.json", ".stylelintrc", "stylelint.config.js", "stylelint.config.mjs"];
const STYLE_GLOB = "**/*.{css,svelte,vue,html}";
const BIN_DIRECTORY = "node_modules/.bin";
const TSRS_BINARY = `${BIN_DIRECTORY}/tsrs`;
const TSRS_LINT_BINARY = `${BIN_DIRECTORY}/tsrs-lint`;
const OXFMT_BINARY = `${BIN_DIRECTORY}/oxfmt`;
const FALLOW_NODE_OPTIONS = "--max-old-space-size=4096";
const FALLOW_BINARY = `${BIN_DIRECTORY}/fallow`;
const AST_GREP_BINARY = `${BIN_DIRECTORY}/ast-grep`;
const AST_GREP_PACK = "node_modules/ast-grep-rules-avi12";
const TEXT_CHECK_COMMAND = ["avi12-lint", "text-check"];
const WINDOWS_LAUNCHER_EXTENSION = ".CMD";
const IGNORE_FILES = [".gitignore", ".prettierignore"];
const SCRIPT_PATTERN = /\.(?:[cm]?[jt]s|svelte|vue)$/;
const SVELTE_PATTERN = /\.svelte(?:\.[cm]?[jt]s)?$/;
const VUE_PATTERN = /[.]vue$/;
const FORMAT_PATTERN = /\.(?:[cm]?[jt]sx?|jsonc?|json5|md|mdx|svelte|vue|css|scss|less|html|ya?ml|toml)$/;
const STYLE_PATTERN = /\.(?:css|svelte|vue|html)$/;

/**
 * Builds the ordered list of steps to run in a repo: a tool is planned only when its config file or binary exists.
 * Each step is `{ name, command, env, isParallel }`; the parallel steps run together, ESLint first because it is
 * the one that peaks in memory, and the rest start beside it. Fixing is never parallel, since fixers must not
 * race on the same file, and oxlint fixes twice around oxfmt because one pass leaves fixes that overlap; oxfmt runs
 * last so the final oxlint pass leaves no odd indentation or trailing spaces, and fix mode plans oxfmt when only its
 * binary is installed.
 * ESLint is the Svelte and Vue layers only: it is planned when it has a config and `hasSvelte` or `hasVue` (the repo holds Svelte
 * or Vue files) is true, and it is given those template files alone.
 * oxfmt is given the consumer's `.gitignore` and `.prettierignore` plus `oxfmtIgnores` (globs, the preset's default
 * ignore set), because oxfmt has no `extends` and a copied config cannot inherit them.
 * `isFix` turns the checkers into fixers; `concurrency` reaches ESLint clamped to 1-4 (2 when absent).
 * `changedFiles`, when given, narrows oxlint, ESLint, stylelint and oxfmt to those files (a tool with no
 * matching file is skipped) and drops ESLint to concurrency 1 unless `concurrency` says otherwise; tsrs always
 * checks the whole project. fallow has no file list: it is planned only with `fallowBase` (a git ref), through its
 * own changed-files mode `fallow audit --base <ref>`, so a staged run, which has no base, leaves it out.
 * `kotlin` (`{ java, tools, presetDirectory, consumerDetekt }`, see `kotlinSteps`) adds the ktlint and detekt steps; the
 * runner passes it only when Java and the jars are ready.
 * fallow gets `NODE_OPTIONS` capping the Node heap at 4 GB, since a dirty tree once ran it to 38 GB. Pure, so it is
 * testable.
 */
export function plan({
  hasFile,
  hasSvelte = false,
  hasVue = false,
  isFix = false,
  concurrency,
  changedFiles,
  oxfmtIgnores = [],
  fallowBase,
  isFallowFull = false,
  isNestedConfigAllowed = false,
  languages = [],
  kotlin,
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
  function splitOf({ head, files, tail = [] }) {
    return files
      ? {
          head,
          files,
          tail
        }
      : undefined;
  }
  const scripts = only(SCRIPT_PATTERN);
  const svelteFiles = changedFiles?.filter(file => SVELTE_PATTERN.test(file) || VUE_PATTERN.test(file));
  const styles = only(STYLE_PATTERN);
  const formattable = only(FORMAT_PATTERN);
  const steps = [];
  const isEslintPlanned = hasAny(ESLINT_CONFIGS) && (hasSvelte || hasVue) && !isSkipped(svelteFiles);
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
      split: splitOf({
        head: ["eslint", ...eslintFlags(clampConcurrency(requested)), ...(isFix ? ["--fix"] : [])],
        files: svelteFiles
      }),
      env: {},
      isParallel
    });
  }

  const isOxlintPlanned = hasFile(OXLINT_CONFIG) && !isSkipped(scripts);
  const isTypeAware = hasFile(TSRS_LINT_BINARY);
  const extension = platform === "win32" ? WINDOWS_LAUNCHER_EXTENSION : "";
  const oxlintFlags = [
    ...(isTypeAware ? ["--type-aware"] : []),
    ...(isNestedConfigAllowed ? [] : [NESTED_CONFIG_FLAG]),
    ...(isFix ? ["--fix"] : [])
  ];
  const oxlintStep = {
    name: "oxlint",
    command: ["oxlint", ...oxlintFlags, ...(scripts ?? [])],
    split: splitOf({
      head: ["oxlint", ...oxlintFlags],
      files: scripts
    }),
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
      split: splitOf({
        head: ["stylelint"],
        files: styles,
        tail: isFix ? ["--fix"] : []
      }),
      env: {},
      isParallel
    });
  }

  const isOxfmtPlanned = (hasFile(OXFMT_CONFIG) || (isFix && hasFile(OXFMT_BINARY))) && !isSkipped(formattable);
  const oxfmtExcludes = oxfmtIgnores.map(glob => `"!${glob}"`);
  let oxfmtTargets = oxfmtIgnores.length > 0 ? [...oxfmtExcludes, "."] : [];
  if (formattable) {
    oxfmtTargets = [...formattable, ...oxfmtExcludes];
  }

  const oxfmtStep = {
    name: "oxfmt",
    command: [
      "oxfmt",
      ...(isFix ? [] : ["--check"]),
      ...IGNORE_FILES.filter(hasFile).flatMap(file => ["--ignore-path", file]),
      ...oxfmtTargets
    ],
    split: splitOf({
      head: [
        "oxfmt",
        ...(isFix ? [] : ["--check"]),
        ...IGNORE_FILES.filter(hasFile).flatMap(file => ["--ignore-path", file])
      ],
      files: formattable,
      tail: oxfmtExcludes
    }),
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

  const isFallowPlanned = fallowBase !== undefined && changedFiles && hasFile(FALLOW_BINARY);
  if (isFallowPlanned) {
    steps.push({
      name: "fallow",
      command: ["fallow", "audit", "--base", fallowBase],
      env: {
        NODE_OPTIONS: FALLOW_NODE_OPTIONS
      },
      isGuarded: true,
      isParallel
    });
  }

  const isFullFallowPlanned = isFallowFull && !isFallowPlanned && !changedFiles && hasFile(FALLOW_BINARY);
  if (isFullFallowPlanned) {
    steps.push({
      name: "fallow",
      command: ["fallow"],
      env: {
        NODE_OPTIONS: FALLOW_NODE_OPTIONS
      },
      isGuarded: true,
      isParallel
    });
  }

  steps.push(
    ...languageSteps({
      hasFile,
      languages,
      changedFiles,
      isParallel
    })
  );

  if (kotlin) {
    steps.push(
      ...kotlinSteps({
        ...kotlin,
        changedFiles,
        isFix,
        platform
      })
    );
  }

  return steps;
}

/**
 * The steps for the repo's non-TypeScript languages (`languages`, from `detectLanguages`): one `ast-grep <language>`
 * step per language, planned when the `ast-grep` binary and the `ast-grep-rules-avi12` pack are installed, and
 * one `text-check` step (suppress comments and em dashes in any language). With `changedFiles` a step is given
 * that language's changed files outside build, dependency and vendored folders and is skipped when it has none;
 * without them ast-grep walks the project (it honours `.gitignore`) with those folders excluded. Both steps are
 * guarded by the memory and time watchdog.
 */
function languageSteps({ hasFile, languages, changedFiles, isParallel }) {
  const steps = [];
  const isAstGrepInstalled = hasFile(AST_GREP_BINARY);
  for (const language of languages) {
    const config = `${AST_GREP_PACK}/${language}/sgconfig.yml`;
    const isPackInstalled = hasFile(config);
    const files = changedFiles?.filter(file => LANGUAGE_PATTERNS[language].test(file) && !isIgnoredPath(file));
    const isSkipped = files?.length === 0;
    if (!isAstGrepInstalled || !isPackInstalled || isSkipped) {
      continue;
    }

    const head = ["ast-grep", "scan", "-c", config];
    const excludes = ignoredGlobs().map(glob => `"${glob}"`);
    steps.push({
      name: `ast-grep ${language}`,
      command: files ? [...head, ...files] : [...head, ...excludes.flatMap(glob => ["--globs", glob]), "."],
      split: files
        ? {
            head,
            files,
            tail: []
          }
        : undefined,
      env: {},
      isGuarded: true,
      isParallel
    });
  }

  const hasLanguage = languages.length > 0;
  const textFiles = changedFiles?.filter(file => isTextCheckedFile(file));
  if (hasLanguage && textFiles?.length !== 0) {
    steps.push({
      name: "text-check",
      command: [...TEXT_CHECK_COMMAND, ...(textFiles ?? [])],
      split: textFiles
        ? {
            head: TEXT_CHECK_COMMAND,
            files: textFiles,
            tail: []
          }
        : undefined,
      env: {},
      isGuarded: true,
      isParallel
    });
  }

  return steps;
}

/**
 * What `avi12-lint` says when a repo holds a language whose check cannot run: the `ast-grep` binary or a language's
 * rule pack is missing. Pure; the runner prints each message.
 */
export function languageNotices({ hasFile, languages }) {
  const notices = [];
  const isAstGrepMissing = languages.length > 0 && !hasFile(AST_GREP_BINARY);
  if (isAstGrepMissing) {
    notices.push(
      "avi12-lint: ast-grep is not installed, so the Rust, C++, C# and Kotlin rules were skipped; add @ast-grep/cli as a devDependency"
    );
  }

  for (const language of languages) {
    const isPackMissing = hasFile(AST_GREP_BINARY) && !hasFile(`${AST_GREP_PACK}/${language}/sgconfig.yml`);
    if (isPackMissing) {
      notices.push(`avi12-lint: ast-grep-rules-avi12 is not installed, so the ${language} rules were skipped`);
    }
  }

  return notices;
}
