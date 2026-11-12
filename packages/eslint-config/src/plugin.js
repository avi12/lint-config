import expandNestedObjectExpression from "./local-rules/expand-nested-object-expression.js";
import expandNestedTypeLiteral from "./local-rules/expand-nested-type-literal.js";
import expandSvelteBlock from "./local-rules/expand-svelte-block.js";
import multilineArgumentParenthesisNewline from "./local-rules/multiline-arg-paren-newline.js";
import noEmDash from "./local-rules/no-em-dash.js";
import noPaddedTag from "./local-rules/no-padded-tag.js";

/** The `local/*` rules. */
export const localPlugin = {
  rules: {
    "expand-nested-object-expression": expandNestedObjectExpression,
    "expand-nested-type-literal": expandNestedTypeLiteral,
    "expand-svelte-block": expandSvelteBlock,
    "multiline-arg-paren-newline": multilineArgumentParenthesisNewline,
    "no-em-dash": noEmDash,
    "no-padded-tag": noPaddedTag
  }
};
