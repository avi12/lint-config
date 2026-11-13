/**
 * Finds the operands of a compound `if` or ternary condition that must be
 * extracted into a named boolean. An operand stays inline when it is a
 * narrowing check or a truthiness guard, or when it and a neighbour in the
 * same `&&` or `||` chain share a variable: the guard and the access that
 * relies on it cannot be pulled apart without losing TypeScript's narrowing.
 */

const MAX_LOGICAL_DEPTH = 4;
const COMPARISON_OPERATORS = new Set(["===", "!=="]);
const TYPE_TEST_OPERATORS = new Set(["in", "instanceof"]);
const OPAQUE_TYPES = new Set(["CallExpression", "NewExpression", "BinaryExpression", "LogicalExpression"]);
const TRUTHINESS_TYPES = new Set(["Identifier", "MemberExpression", "ChainExpression", "UnaryExpression"]);

function childNodes(node) {
  return Object.entries(node)
    .filter(([key]) => key !== "parent")
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter(value => typeof value?.type === "string");
}

function containsType({ node, types }) {
  return childNodes(node).some(
    child =>
      types.has(child.type) ||
      containsType({
        node: child,
        types
      })
  );
}

function isNarrowingCheck(node) {
  if (node.type !== "BinaryExpression") {
    return false;
  }

  const isTypeTest = TYPE_TEST_OPERATORS.has(node.operator);
  const isComparison = COMPARISON_OPERATORS.has(node.operator);
  const isTypeofLeft = node.left.type === "UnaryExpression" && node.left.operator === "typeof";
  const isLiteralSide = node.right.type === "Literal" || node.left.type === "Literal";
  const isUndefinedRight = node.right.name === "undefined";
  return isTypeTest || (isComparison && (isTypeofLeft || isLiteralSide || isUndefinedRight));
}

function isTruthinessGuard(node) {
  const isGuardType = TRUTHINESS_TYPES.has(node.type) && (node.type !== "UnaryExpression" || node.operator === "!");
  return (
    isGuardType &&
    !containsType({
      node,
      types: OPAQUE_TYPES
    })
  );
}

function variableNames(node) {
  const names = new Set();
  collectNames({
    node,
    names
  });
  return names;
}

function collectNames({ node, names }) {
  if (node.type === "Identifier") {
    names.add(node.name);
    return;
  }

  const isPlainMember = node.type === "MemberExpression" && !node.computed;
  const children = isPlainMember ? [node.object] : childNodes(node);
  for (const child of children) {
    collectNames({
      node: child,
      names
    });
  }
}

function guardSubjects(node) {
  if (node.type === "CallExpression") {
    const names = new Set();
    for (const argument of node.arguments) {
      collectNames({
        node: argument,
        names
      });
    }

    return names;
  }

  const isGuard = isNarrowingCheck(node) || isTruthinessGuard(node);
  return isGuard ? variableNames(node) : new Set();
}

function sharesName({ first, second }) {
  return [...first].some(name => second.has(name));
}

function chainLeaves(node) {
  function isChain(child) {
    return child.type === "LogicalExpression" && child.operator === node.operator;
  }

  return [node.left, node.right].flatMap(child => (isChain(child) ? chainLeaves(child) : [child]));
}

function isGuarded({ leaf, chain }) {
  const index = chain.indexOf(leaf);
  const names = variableNames(leaf);
  const subjects = guardSubjects(leaf);
  const isAfterGuard = chain.slice(0, index).some(earlier =>
    sharesName({
      first: guardSubjects(earlier),
      second: names
    })
  );
  const isGuardOfLater = chain.slice(index + 1).some(later =>
    sharesName({
      first: subjects,
      second: variableNames(later)
    })
  );
  return isAfterGuard || isGuardOfLater;
}

function topChain(node) {
  const isSameChain = node.parent?.type === "LogicalExpression" && node.parent.operator === node.operator;
  return isSameChain ? topChain(node.parent) : node;
}

function leavesOf({ node, depth = 1 }) {
  if (depth > MAX_LOGICAL_DEPTH) {
    return [];
  }

  return [node.left, node.right].flatMap(child =>
    child.type === "LogicalExpression"
      ? leavesOf({
          node: child,
          depth: depth + 1
        })
      : [child]
  );
}

export function extractableOperands(condition) {
  return leavesOf({ node: condition }).filter(leaf => {
    const isInline = isNarrowingCheck(leaf) || isTruthinessGuard(leaf);
    if (isInline) {
      return false;
    }

    const chain = chainLeaves(topChain(leaf.parent));
    return !isGuarded({
      leaf,
      chain
    });
  });
}
