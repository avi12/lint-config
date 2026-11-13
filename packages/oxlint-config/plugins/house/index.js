import expandNestedObjectExpression from "./expand-nested-object-expression.js";
import expandNestedTypeLiteral from "./expand-nested-type-literal.js";
import { extractableOperands } from "./guarded-conditions.js";
import multilineArgumentParenthesisNewline from "./multiline-arg-paren-newline.js";
import noEmDash from "./no-em-dash.js";
import noMagicNumbers from "./no-magic-numbers.js";
import noParentImports from "./no-parent-imports.js";
import {
  EXTRACT_IF_MESSAGE,
  EXTRACT_TERNARY_MESSAGE,
  GOOGLE_SYNTAX,
  HOUSE_SYNTAX,
  POSITIONAL_PARAMETER_SYNTAX,
  TREE_SHAKING_SYNTAX
} from "./syntax.js";

function createGoogleSyntaxRule(entries) {
  const selectorRule = createSyntaxRule(entries);
  return {
    meta: selectorRule.meta,
    create(context) {
      function reportOperands({ condition, message }) {
        for (const operand of extractableOperands(condition)) {
          context.report({
            node: operand,
            message
          });
        }
      }

      return {
        ...selectorRule.create(context),
        "IfStatement > LogicalExpression.test"(condition) {
          const isElseIf = condition.parent.parent.type === "IfStatement";
          if (!isElseIf) {
            reportOperands({
              condition,
              message: EXTRACT_IF_MESSAGE
            });
          }
        },
        "ConditionalExpression > LogicalExpression.test": condition =>
          reportOperands({
            condition,
            message: EXTRACT_TERNARY_MESSAGE
          })
      };
    }
  };
}

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
    "no-magic-numbers": noMagicNumbers,
    "no-parent-imports": noParentImports,
    "google-syntax": createGoogleSyntaxRule(GOOGLE_SYNTAX),
    "house-syntax": createSyntaxRule(HOUSE_SYNTAX),
    "positional-parameters": createSyntaxRule(POSITIONAL_PARAMETER_SYNTAX),
    "tree-shaking": createSyntaxRule(TREE_SHAKING_SYNTAX)
  }
};
