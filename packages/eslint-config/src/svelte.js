import svelteEslint from "eslint-plugin-svelte";
import globals from "globals";
import svelteParser from "svelte-eslint-parser";
import typescriptEslint from "typescript-eslint";

import { createRules, PLUGINS } from "./base.js";
import { SVELTE_RULES } from "./rules/svelte.js";
import { SVELTE_TEMPLATE_SYNTAX } from "./rules/syntax.js";

/**
 * Svelte layer: add after `base()`. Requires the optional peers eslint-plugin-svelte and svelte-eslint-parser.
 * Options: `formatter`, `overrides`.
 */
export function svelte({ formatter, overrides = {} } = {}) {
  const shared = createRules({ formatter });
  const [severity, ...syntax] = shared["no-restricted-syntax"];
  return [
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
      plugins: PLUGINS,
      rules: {
        ...shared,
        "no-restricted-syntax": [severity, ...syntax, ...SVELTE_TEMPLATE_SYNTAX],
        ...SVELTE_RULES,
        ...overrides
      }
    }
  ];
}
