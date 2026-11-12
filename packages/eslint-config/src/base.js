import stylistic from "@stylistic/eslint-plugin";
import importNewlines from "eslint-plugin-import-newlines";
import jsdoc from "eslint-plugin-jsdoc";
import perfectionist from "eslint-plugin-perfectionist";
import unusedImports from "eslint-plugin-unused-imports";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import typescriptEslint from "typescript-eslint";
import { IGNORES } from "./defaults.js";
import { localPlugin } from "./plugin.js";
import { JSDOC_RULES } from "./rules/jsdoc.js";
import { FORMATTER_RULES, KEPT_RULES } from "./rules/layout.js";
import { GOOGLE_SYNTAX, HOUSE_SYNTAX, TREE_SHAKING_SYNTAX } from "./rules/syntax.js";

export const FORMATTERS = { OXFMT: "oxfmt", ESLINT: "eslint" };

export const PLUGINS = {
  "@stylistic": stylistic,
  "import-newlines": importNewlines,
  "unused-imports": unusedImports,
  jsdoc,
  perfectionist,
  local: localPlugin
};

/**
 * The rules ESLint keeps: what oxlint and oxfmt cannot do. `formatter: "eslint"` adds the layout rules oxfmt
 * would own; `isPackageSource` adds the JSDoc and tree-shaking rules that only fit a published package.
 */
export function createRules({ formatter = FORMATTERS.OXFMT, isPackageSource = false } = {}) {
  const isEslintFormatter = formatter === FORMATTERS.ESLINT;
  const syntax = [...GOOGLE_SYNTAX, ...HOUSE_SYNTAX, ...(isPackageSource ? TREE_SHAKING_SYNTAX : [])];
  return {
    ...(isEslintFormatter ? FORMATTER_RULES : {}),
    ...KEPT_RULES,
    ...(isPackageSource ? JSDOC_RULES : {}),
    "no-restricted-syntax": ["error", ...syntax]
  };
}

/**
 * Plain TypeScript and JavaScript layer. Needs no Svelte package and no type information.
 * Options: `formatter`, `ignores`, `sourceFiles` and `testFiles` (where the package-source rules apply), `overrides`.
 */
export function base({ formatter, ignores = [], sourceFiles = ["src/**/*.ts"], testFiles = ["**/*.test.ts", "test/**"], overrides = {} } = {}) {
  return [
    globalIgnores([...IGNORES, ...ignores]),
    {
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" }
    },
    {
      files: ["**/*.{ts,mts,cts,js,mjs,cjs}"],
      languageOptions: { parser: typescriptEslint.parser, globals: globals.node },
      plugins: PLUGINS,
      rules: { ...createRules({ formatter }), ...overrides }
    },
    {
      files: sourceFiles,
      ignores: testFiles,
      rules: { ...createRules({ formatter, isPackageSource: true }), ...overrides }
    }
  ];
}
