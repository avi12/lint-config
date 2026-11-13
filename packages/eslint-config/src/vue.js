import unusedImports from "eslint-plugin-unused-imports";
import vueEslint from "eslint-plugin-vue";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import typescriptEslint from "typescript-eslint";
import vueParser from "vue-eslint-parser";

import { IGNORES } from "./defaults.js";
import { localPlugin } from "./plugin.js";
import { VUE_TEMPLATE_SYNTAX } from "./rules/template-syntax.js";
import { VUE_RULES } from "./rules/vue.js";

/**
 * The Vue layer, the template counterpart of the Svelte layer: ESLint runs only on `.vue` files, for what needs the
 * template AST. The script of a `.vue` file is oxlint's, and oxfmt does not format `.vue` templates, so the layout
 * rules of the template (indent, quotes, self-closing, attribute order) are `eslint-plugin-vue`'s. Options:
 * `ignores` (more globs to skip) and `overrides` (rules merged over the Vue rules).
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
    ...vueEslint.configs["flat/recommended"].map(config => ({
      ...config,
      files: ["**/*.vue"]
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
        ...VUE_RULES,
        ...overrides
      }
    }
  ];
}
