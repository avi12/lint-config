import svelteEslint from "eslint-plugin-svelte";
import unusedImports from "eslint-plugin-unused-imports";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import svelteParser from "svelte-eslint-parser";
import typescriptEslint from "typescript-eslint";

import { IGNORES } from "./defaults.js";
import { localPlugin } from "./plugin.js";
import { SVELTE_RULES } from "./rules/svelte.js";
import { SVELTE_TEMPLATE_SYNTAX } from "./rules/template-syntax.js";

/**
 * The Svelte layer, the only thing ESLint still does: what needs the template AST. Everything else (the script of
 * a `.svelte` file included) is oxlint's and oxfmt's. Options: `ignores` (more globs to skip) and `overrides`
 * (rules merged over the Svelte rules).
 */
export function svelte({ ignores = [], overrides = {} } = {}) {
  return [
    globalIgnores([...IGNORES, ...ignores]),
    {
      linterOptions: {
        noInlineConfig: true,
        reportUnusedDisableDirectives: "off"
      }
    },
    ...svelteEslint.configs["flat/recommended"],
    {
      // Svelte's recommended config parses *.svelte.ts with the plain JS parser, which cannot read the types
      files: ["**/*.svelte.ts"],
      languageOptions: {
        parser: typescriptEslint.parser,
        globals: globals.node
      }
    },
    {
      files: ["**/*.svelte"],
      languageOptions: {
        parser: svelteParser,
        parserOptions: {
          parser: typescriptEslint.parser,
          extraFileExtensions: [".svelte"]
        },
        globals: globals.node
      },
      plugins: {
        local: localPlugin,
        "unused-imports": unusedImports
      },
      rules: {
        "no-restricted-syntax": ["error", ...SVELTE_TEMPLATE_SYNTAX],
        ...SVELTE_RULES,
        ...overrides
      }
    }
  ];
}
