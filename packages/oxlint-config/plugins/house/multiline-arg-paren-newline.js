/**
 * Enforces that when a function call receives a multiline non-literal argument
 * (e.g. a callback or a chained call expression), the opening parenthesis must
 * be followed by a newline and the closing parenthesis must be on its own line:
 *
 *   foo(
 *     items.map(item => {
 *       return item;
 *     })
 *   );
 *
 * Direct callbacks, object literals, and array literals are excluded - they
 * conventionally stay inline with the call:
 *
 *   foo({ key: value });        // OK - ObjectExpression
 *   untrack(() => { ... });     // OK - ArrowFunctionExpression
 *   new Promise(resolve => {})  // OK - ArrowFunctionExpression
 */

const inlineArgumentTypes = new Set([
  "ObjectExpression",
  "ArrayExpression",
  "ArrowFunctionExpression",
  "FunctionExpression"
]);

function getEffectiveType(argument) {
  const isWrapped = argument.type === "TSSatisfiesExpression" || argument.type === "TSAsExpression";
  if (isWrapped) {
    return argument.expression.type;
  }

  return argument.type;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "layout",
    fixable: "code",
    schema: [],
    messages: {
      argumentOnNewLine: "When a multiline argument is passed, it must start on a new line after '('.",
      closingParenOnNewLine: "When a multiline argument is passed, ')' must be on its own line.",
      inlineArgumentOnNewLine: "Object/array/function arguments must stay inline with the opening '('."
    }
  },
  create(context) {
    const { sourceCode } = context;

    return {
      CallExpression(node) {
        const hasNoArguments = node.arguments.length === 0;
        if (hasNoArguments) {
          return;
        }

        const hasMultilineNonLiteralArgument = node.arguments.some(
          argument =>
            !inlineArgumentTypes.has(getEffectiveType(argument)) && argument.loc.start.line !== argument.loc.end.line
        );

        const firstArgument = node.arguments[0];
        const openingParenthesis = sourceCode.getTokenBefore(firstArgument);
        const lastArgument = node.arguments[node.arguments.length - 1];
        const closingParenthesis = sourceCode.getLastToken(node);
        if (!hasMultilineNonLiteralArgument) {
          const allInlineTypes = node.arguments.every(argument => inlineArgumentTypes.has(getEffectiveType(argument)));
          const hasAnyMultilineArgument = node.arguments.some(
            argument => argument.loc.start.line !== argument.loc.end.line
          );
          const isFirstArgumentOnNewLine = openingParenthesis.loc.end.line !== firstArgument.loc.start.line;
          const isSingleArgument = node.arguments.length === 1;
          const isInlineArgumentEligible =
            allInlineTypes && !hasAnyMultilineArgument && isFirstArgumentOnNewLine && isSingleArgument;
          if (!isInlineArgumentEligible) {
            return;
          }

          const MAX_LINE_LENGTH = 120;
          const prefixLength = openingParenthesis.loc.end.column;
          const argumentsEndLength =
            lastArgument.loc.end.column + (closingParenthesis.loc.start.line === lastArgument.loc.end.line ? 1 : 0);
          const isSingleLine = firstArgument.loc.start.line === lastArgument.loc.end.line;
          const argumentsWidth = isSingleLine
            ? lastArgument.loc.end.column - firstArgument.loc.start.column + 1
            : argumentsEndLength;
          const resultingLineLength = prefixLength + argumentsWidth;
          const isTooLong = resultingLineLength > MAX_LINE_LENGTH;
          if (isTooLong) {
            return;
          }

          context.report({
            node,
            messageId: "inlineArgumentOnNewLine",
            fix(fixer) {
              return fixer.replaceTextRange([openingParenthesis.range[1], firstArgument.range[0]], "");
            }
          });
          return;
        }

        const baseIndent = " ".repeat(node.loc.start.column);
        const argumentIndent = `${baseIndent}  `;
        const isFirstArgumentInline = openingParenthesis.loc.end.line === firstArgument.loc.start.line;
        if (isFirstArgumentInline) {
          context.report({
            node,
            messageId: "argumentOnNewLine",
            fix: fixer => fixer.insertTextAfter(openingParenthesis, `\n${argumentIndent}`)
          });
        }

        const isClosingInline = closingParenthesis.loc.start.line === lastArgument.loc.end.line;
        if (isClosingInline) {
          context.report({
            node,
            messageId: "closingParenOnNewLine",
            fix: fixer => fixer.insertTextBefore(closingParenthesis, `\n${baseIndent}`)
          });
        }
      }
    };
  }
};
