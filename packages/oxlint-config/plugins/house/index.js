import expandNestedObjectExpression from "./expand-nested-object-expression.js";
import expandNestedTypeLiteral from "./expand-nested-type-literal.js";
import multilineArgumentParenthesisNewline from "./multiline-arg-paren-newline.js";
import noEmDash from "./no-em-dash.js";
import { GOOGLE_SYNTAX, HOUSE_SYNTAX, POSITIONAL_PARAMETER_SYNTAX, TREE_SHAKING_SYNTAX } from "./syntax.js";

function createSyntaxRule(entries) {
  return {
    meta: {
      schema: []
    },
    create(context) {
      return Object.fromEntries(
        entries.map(({ selector, message }) => [
          selector,
          node =>
            context.report({
              node,
              message
            })
        ])
      );
    }
  };
}

/** The house rules as an oxlint JS plugin: layout rules and the selector bans, one rule per group so a group can be switched off alone. */
export default {
  meta: {
    name: "house"
  },
  rules: {
    "expand-nested-object-expression": expandNestedObjectExpression,
    "expand-nested-type-literal": expandNestedTypeLiteral,
    "multiline-arg-paren-newline": multilineArgumentParenthesisNewline,
    "no-em-dash": noEmDash,
    "google-syntax": createSyntaxRule(GOOGLE_SYNTAX),
    "house-syntax": createSyntaxRule(HOUSE_SYNTAX),
    "positional-parameters": createSyntaxRule(POSITIONAL_PARAMETER_SYNTAX),
    "tree-shaking": createSyntaxRule(TREE_SHAKING_SYNTAX)
  }
};
