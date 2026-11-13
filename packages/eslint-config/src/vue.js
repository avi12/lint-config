import unusedImports from "eslint-plugin-unused-imports";
import vueEslint from "eslint-plugin-vue";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import typescriptEslint from "typescript-eslint";
import vueParser from "vue-eslint-parser";

import { IGNORES } from "./defaults.js";
import { localPlugin } from "./plugin.js";
import { VUE_TEMPLATE_SYNTAX } from "./rules/template-syntax.js";
import { KEPT_LAYOUT_RULES, VUE_RULES } from "./rules/vue.js";

function oxfmtOwnedLayout() {
  return Object.fromEntries(
    Object.entries(vueEslint.rules)
      .filter(([name, rule]) => rule.meta?.type === "layout" && !KEPT_LAYOUT_RULES.has(name))
      .map(([name]) => [`vue/${name}`, "off"])
  );
}

function asError(level) {
  const severity = Array.isArray(level) ? level[0] : level;
  const isWarning = severity === "warn" || severity === 1;
  if (!isWarning) {
    return level;
  }

  return Array.isArray(level) ? ["error", ...level.slice(1)] : "error";
}

/**
 * The Vue layer, the template counterpart of the Svelte layer: ESLint runs only on `.vue` files, for what needs the
 * template AST. The script and the layout of a `.vue` file are oxlint's and oxfmt's (oxfmt formats templates and
 * styles too), so every layout rule of `eslint-plugin-vue` is off except `KEPT_LAYOUT_RULES`, which oxfmt leaves
 * alone, and the plugin's warnings become errors. Options: `ignores` (more globs to skip) and `overrides` (rules
 * merged over the Vue rules).
 */
export function vue({ ignores = [], overrides = {} } = {}) {
  return [
    globalIgnores([...IGNORES, ...ignores]),
    {
      linterOptions: {
        noInlineConfig: true,
        reportUnusedDisableDirectives: "off"
      }
    },
    ...vueEslint.configs["flat/recommended"].map(({ rules, ...config }) => ({
      ...config,
      files: ["**/*.vue"],
      ...(rules && {
        rules: Object.fromEntries(Object.entries(rules).map(([name, level]) => [name, asError(level)]))
      })
    })),
    {
      files: ["**/*.vue"],
      languageOptions: {
        parser: vueParser,
        parserOptions: {
          parser: typescriptEslint.parser,
          extraFileExtensions: [".vue"],
          sourceType: "module"
        },
        globals: globals.browser
      },
      plugins: {
        local: localPlugin,
        "unused-imports": unusedImports
      },
      rules: {
        "vue/no-restricted-syntax": ["error", ...VUE_TEMPLATE_SYNTAX],
        ...oxfmtOwnedLayout(),
        ...VUE_RULES,
        ...overrides
      }
    }
  ];
}
