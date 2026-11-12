export const FORMATTER_RULES = {
  "perfectionist/sort-imports": [
    "error",
    {
      type: "alphabetical",
      order: "asc",
      newlinesBetween: "ignore",
      sortSideEffects: true,
      groups: [["side-effect", "builtin", "external", "internal", "parent", "sibling", "index", "unknown"]]
    }
  ],
  "import-newlines/enforce": [
    "error",
    {
      items: 4,
      "max-len": 120,
      forceSingleLine: true
    }
  ],
  "@stylistic/quotes": ["error", "double", { allowTemplateLiterals: "always" }],
  "@stylistic/quote-props": ["error", "as-needed"],
  "@stylistic/semi": "error",
  "@stylistic/indent": ["error", 2],
  "@stylistic/arrow-parens": ["error", "as-needed"],
  "@stylistic/object-curly-spacing": ["error", "always"],
  "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
  "@stylistic/comma-dangle": ["error", "never"],
  "@stylistic/no-trailing-spaces": "error",
  "@stylistic/eol-last": ["error", "always"],
  "@stylistic/no-multiple-empty-lines": [
    "error",
    {
      max: 1,
      maxEOF: 0,
      maxBOF: 0
    }
  ],
  "@stylistic/comma-spacing": [
    "error",
    {
      before: false,
      after: true
    }
  ],
  "@stylistic/key-spacing": [
    "error",
    {
      beforeColon: false,
      afterColon: true
    }
  ],
  "@stylistic/keyword-spacing": [
    "error",
    {
      before: true,
      after: true
    }
  ],
  "@stylistic/space-before-blocks": "error",
  "@stylistic/space-before-function-paren": [
    "error",
    {
      named: "never",
      asyncArrow: "always",
      catch: "always"
    }
  ],
  "@stylistic/space-infix-ops": "error",
  "@stylistic/space-in-parens": ["error", "never"],
  "@stylistic/array-bracket-spacing": ["error", "never"],
  "@stylistic/computed-property-spacing": ["error", "never"],
  "@stylistic/template-curly-spacing": ["error", "never"],
  "@stylistic/block-spacing": ["error", "always"],
  "@stylistic/semi-spacing": [
    "error",
    {
      before: false,
      after: true
    }
  ],
  "@stylistic/type-annotation-spacing": "error",
  "@stylistic/member-delimiter-style": [
    "error",
    {
      multiline: {
        delimiter: "semi",
        requireLast: true
      },
      singleline: {
        delimiter: "semi",
        requireLast: false
      }
    }
  ],
  "@stylistic/no-mixed-spaces-and-tabs": "error",
  "@stylistic/no-tabs": "error",
  "@stylistic/max-len": [
    "error",
    {
      code: 120,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
      ignorePattern: 'd="[^"]*"|[\\w-]+="[^"{}]{40,}"'
    }
  ],
  "@stylistic/padded-blocks": ["error", "never"],
  "@stylistic/rest-spread-spacing": ["error", "never"]
};

export const KEPT_RULES = {
  "unused-imports/no-unused-imports": "error",
  "perfectionist/sort-named-imports": [
    "error",
    {
      type: "alphabetical",
      order: "asc",
      ignoreCase: true
    }
  ],
  "perfectionist/sort-named-exports": [
    "error",
    {
      type: "alphabetical",
      order: "asc",
      ignoreCase: true
    }
  ],
  "perfectionist/sort-objects": [
    "error",
    {
      type: "unsorted",
      newlinesBetween: 0
    }
  ],
  "@stylistic/spaced-comment": ["error", "always"],
  "@stylistic/object-curly-newline": [
    "error",
    {
      ObjectExpression: {
        consistent: true,
        multiline: true
      },
      ObjectPattern: {
        consistent: true,
        multiline: true
      },
      ExportDeclaration: {
        consistent: true,
        multiline: true
      }
    }
  ],
  "@stylistic/object-property-newline": ["error", { allowAllPropertiesOnSameLine: false }],
  "@stylistic/padding-line-between-statements": [
    "error",
    {
      blankLine: "always",
      prev: "import",
      next: ["const", "let", "function", "export", "type"]
    },
    {
      blankLine: "any",
      prev: "import",
      next: "import"
    },
    {
      blankLine: "always",
      prev: "*",
      next: "if"
    },
    {
      blankLine: "never",
      prev: ["const", "let"],
      next: "if"
    },
    {
      blankLine: "always",
      prev: "if",
      next: "*"
    }
  ],
  "@stylistic/function-call-argument-newline": ["error", "consistent"],
  "@stylistic/function-paren-newline": ["error", "consistent"],
  "local/expand-nested-object-expression": "error",
  "local/expand-nested-type-literal": "error",
  "local/multiline-arg-paren-newline": "error",
  "local/no-em-dash": "error"
};
