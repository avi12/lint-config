const OPEN_TAG_LOOKAHEAD = 80;
const CLOSE_TAG_LENGTH = "{/if}".length;

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "layout",
    fixable: "whitespace",
    schema: [],
    messages: {
      expand: "Svelte block content must start on a new line."
    }
  },
  create(context) {
    const { sourceCode } = context;

    function findOpenTagEnd(expression) {
      const source = sourceCode.text;
      let pos = expression.range[1];
      while (pos < source.length && source[pos] !== "}") {
        pos++;
      }
      return pos + 1;
    }

    function getIndent(node) {
      return sourceCode.lines[node.loc.start.line - 1].match(/^(\s*)/)[1];
    }

    return {
      SvelteIfBlock(node) {
        const isEmpty = !node.children.length;
        if (isEmpty) {
          return;
        }

        const firstChild = node.children[0];
        const isChildOnNewLine = node.loc.start.line !== firstChild.loc.start.line;
        if (isChildOnNewLine) {
          return;
        }

        // A whitespace-only run ending in a newline right after the open tag
        // means the visible content already starts on its own line - reporting
        // here would make the fixer prepend newlines forever
        const contentStart = findOpenTagEnd(node.expression);
        const lookahead = sourceCode.text.slice(contentStart, contentStart + OPEN_TAG_LOOKAHEAD);
        const isContentOnOwnLine = /^[ \t]*\r?\n/.test(lookahead);
        if (isContentOnOwnLine) {
          return;
        }

        context.report({
          node,
          messageId: "expand",
          fix(fixer) {
            const indent = getIndent(node);
            const childIndent = `${indent}  `;
            const openTagEnd = findOpenTagEnd(node.expression);
            const fixes = [fixer.replaceTextRange([openTagEnd, firstChild.range[0]], `\n${childIndent}`)];
            const isLastBranch = !node.else && !node.elseif;
            if (isLastBranch) {
              const lastChild = node.children[node.children.length - 1];
              const isCloseOnChildLine = node.loc.end.line === lastChild.loc.end.line;
              if (isCloseOnChildLine) {
                const closeTagStart = node.range[1] - CLOSE_TAG_LENGTH;
                fixes.push(fixer.replaceTextRange([lastChild.range[1], closeTagStart], `\n${indent}`));
              }
            }

            return fixes;
          }
        });
      }
    };
  }
};
