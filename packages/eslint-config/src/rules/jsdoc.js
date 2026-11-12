export const JSDOC_RULES = {
  "jsdoc/require-jsdoc": [
    "error",
    {
      publicOnly: true,
      require: {
        FunctionDeclaration: true,
        ClassDeclaration: true,
        ArrowFunctionExpression: false,
        FunctionExpression: false,
        MethodDefinition: false
      },
      contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration", "TSEnumDeclaration"]
    }
  ],
  "jsdoc/require-description": ["error", { contexts: ["any"] }],
  "jsdoc/no-types": "error",
  "jsdoc/check-tag-names": ["error", { typed: true }]
};
