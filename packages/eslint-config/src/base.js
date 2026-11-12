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
import { GOOGLE_SYNTAX, HOUSE_SYNTAX, POSITIONAL_PARAMETER_SYNTAX, TREE_SHAKING_SYNTAX } from "./rules/syntax.js";

export const FORMATTERS = {
  OXFMT: "oxfmt",
  ESLINT: "eslint"
};

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
export function createRules({
  formatter = FORMATTERS.OXFMT,
  isPackageSource = false,
  isPositionalParametersAllowed = false
} = {}) {
  const isEslintFormatter = formatter === FORMATTERS.ESLINT;
  const allSyntax = [...GOOGLE_SYNTAX, ...HOUSE_SYNTAX, ...(isPackageSource ? TREE_SHAKING_SYNTAX : [])];
  const syntax = isPositionalParametersAllowed
    ? allSyntax.filter(entry => !POSITIONAL_PARAMETER_SYNTAX.includes(entry))
    : allSyntax;
  return {
    ...(isEslintFormatter ? FORMATTER_RULES : {}),
    ...KEPT_RULES,
    ...(isPackageSource ? JSDOC_RULES : {}),
    "no-restricted-syntax": ["error", ...syntax]
  };
}

/**
 * Plain TypeScript and JavaScript layer. Needs no Svelte package and no type information.
 * Options: `formatter`, `ignores`, `sourceFiles` and `testFiles` (where the package-source rules apply; an empty
 * `sourceFiles` skips that layer), `overrides`, and `allowPositionalParameters`: globs of files where the
 * "2+ parameters take one destructured object" rule is off, for code that mirrors a third-party signature (only `no-restricted-syntax` is swapped there).
 */
export function base({
  formatter,
  ignores = [],
  sourceFiles = ["src/**/*.ts"],
  testFiles = ["**/*.test.ts", "test/**"],
  overrides = {},
  allowPositionalParameters = []
} = {}) {
  return [
    globalIgnores([...IGNORES, ...ignores]),
    {
      linterOptions: {
        noInlineConfig: true,
        reportUnusedDisableDirectives: "off"
      }
    },
    {
      files: ["**/*.{ts,mts,cts,js,mjs,cjs}"],
      languageOptions: {
        parser: typescriptEslint.parser,
        globals: globals.node
      },
      plugins: PLUGINS,
      rules: {
        ...createRules({ formatter }),
        ...overrides
      }
    },
    ...sourceLayer({
       formatter,
       sourceFiles,
       testFiles,
       overrides 
    }),
    ...positionalLayer({
       formatter,
       allowPositionalParameters 
    })
  ];
}

function sourceLayer({ formatter, sourceFiles, testFiles, overrides }) {
  const hasSourceFiles = sourceFiles.length > 0;
  if (!hasSourceFiles) {
    return [];
  }

  return [
    {
      files: sourceFiles,
      ignores: testFiles,
      rules: {
        ...createRules({
          formatter,
          isPackageSource: true
        }),
        ...overrides
      }
    }
  ];
}

function positionalLayer({ formatter, allowPositionalParameters }) {
  const hasGlobs = allowPositionalParameters.length > 0;
  if (!hasGlobs) {
    return [];
  }

  return [
    {
      files: allowPositionalParameters,
      rules: {
        "no-restricted-syntax": createRules({
          formatter,
          isPositionalParametersAllowed: true
        })["no-restricted-syntax"]
      }
    }
  ];
}
