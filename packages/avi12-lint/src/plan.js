import { eslintFlags } from "eslint-config-avi12/defaults";

const OXLINT_CONFIG = ".oxlintrc.json";
const OXFMT_CONFIG = ".oxfmtrc.json";
const ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts"];
const STYLELINT_CONFIGS = [".stylelintrc.json", ".stylelintrc", "stylelint.config.js", "stylelint.config.mjs"];
const STYLE_GLOB = "**/*.{css,svelte,html}";

/**
 * Builds the ordered list of commands to run in a repo: a tool is planned only when its config file exists.
 * `isFix` turns the checkers into fixers; `concurrency` reaches ESLint clamped to 1-4. Pure, so it is testable.
 */
export function plan({ hasFile, isFix = false, concurrency }) {
  function hasAny(names) {
    return names.some(hasFile);
  }
  const steps = [];
  if (hasFile(OXLINT_CONFIG)) {
    steps.push({
      name: "oxlint",
      command: ["oxlint", ...(isFix ? ["--fix"] : [])]
    });
  }

  if (hasAny(ESLINT_CONFIGS)) {
    steps.push({
      name: "eslint",
      command: ["eslint", ...eslintFlags(concurrency), ...(isFix ? ["--fix"] : [])]
    });
  }

  if (hasFile(OXFMT_CONFIG)) {
    steps.push({
      name: "oxfmt",
      command: ["oxfmt", ...(isFix ? [] : ["--check"])]
    });
  }

  if (hasAny(STYLELINT_CONFIGS)) {
    steps.push({
      name: "stylelint",
      command: ["stylelint", STYLE_GLOB, ...(isFix ? ["--fix"] : [])]
    });
  }

  return steps;
}
