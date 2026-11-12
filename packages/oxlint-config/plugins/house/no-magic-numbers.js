/**
 * Bans a bare numeric literal that is neither in the allowed list nor named by a `const`.
 * oxlint's native `no-magic-numbers` ignores a numeric literal type only at the top of a type alias, so
 * `Exclude<T, 720 | 480>` is flagged despite `ignoreNumericLiteralTypes`; this rule exempts every literal type.
 */

const ALLOWED = new Set([0, 1, -1, 2]);
const NAMING_PARENTS = new Set(["TSEnumMember", "PropertyDefinition"]);

function isInsideLiteralType(node) {
  let current = node.parent;
  while (current?.type === "UnaryExpression") {
    current = current.parent;
  }
  return current?.type === "TSLiteralType";
}

function isRadix(node) {
  const parent = node.parent;
  const callee = parent?.type === "CallExpression" ? parent.callee : undefined;
  const name = callee?.type === "MemberExpression" ? callee.property?.name : callee?.name;
  return name === "parseInt" && parent.arguments[1] === node;
}

function isNamed(node) {
  for (let current = node.parent; current; current = current.parent) {
    const isConstDeclarator = current.type === "VariableDeclarator" && current.parent?.kind === "const";
    const isNamingParent = NAMING_PARENTS.has(current.type);
    const isNaming = isConstDeclarator || isNamingParent;
    if (isNaming) {
      return true;
    }
  }
  return false;
}

function readValue(node) {
  const parent = node.parent;
  const isNegated = parent?.type === "UnaryExpression" && parent.operator === "-";
  return {
    value: isNegated ? -node.value : node.value,
    target: isNegated ? parent : node
  };
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      magic: "No magic number: {{value}}. Use a named constant."
    }
  },
  create(context) {
    return {
      Literal(node) {
        const isCountable = typeof node.value === "number" && !isInsideLiteralType(node) && !isRadix(node);
        if (!isCountable) {
          return;
        }

        const { value, target } = readValue(node);
        const isExempt = ALLOWED.has(value) || isNamed(target);
        if (isExempt) {
          return;
        }

        context.report({
          node,
          messageId: "magic",
          data: {
            value: String(value)
          }
        });
      }
    };
  }
};
