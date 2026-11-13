/**
 * Forbids every import of a parent directory: `../a/b`, `../../x`, a bare
 * `..`, dynamic `import()` and `export ... from`. A rule of its own, so a
 * consumer's `no-restricted-imports` override cannot replace the ban.
 */

const PARENT_SPECIFIER = /^(\.\.|\.\/\.\.)(\/|$)/u;
const MESSAGE = 'Import from the project root with "@/path", never "../"';

export default {
  meta: {
    type: "problem",
    schema: []
  },
  create(context) {
    function check(source) {
      const isParentImport = typeof source?.value === "string" && PARENT_SPECIFIER.test(source.value);
      if (isParentImport) {
        context.report({
          node: source,
          message: MESSAGE
        });
      }
    }

    function checkDeclaration(node) {
      check(node.source);
    }

    return {
      ImportDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ExportAllDeclaration: checkDeclaration,
      ImportExpression: node => check(node.source)
    };
  }
};
