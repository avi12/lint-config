const IS_LONE_LITERAL_COMPARISON =
  ":matches([left.type='Literal'], [right.type='Literal'], [left.name='undefined'], [right.name='undefined'])";
const IS_NARROWING_CHECK =
  ":matches(BinaryExpression[operator='in'], BinaryExpression[operator='instanceof'], BinaryExpression[operator=/^(===|!==)$/]:matches([left.type='UnaryExpression'][left.operator='typeof'], [right.type='Literal'], [right.name='undefined'], [left.type='Literal']))";
const MAX_LOGICAL_DEPTH = 4;
const NON_NARROWING_OPERANDS = Array.from(
  { length: MAX_LOGICAL_DEPTH },
  (_, depth) => `${"LogicalExpression > ".repeat(depth)}:not(LogicalExpression):not(${IS_NARROWING_CHECK})`
);
const IS_NOT_ELSE_IF = "IfStatement[parent.type!='IfStatement']";
const NAMED_FUNCTION_MESSAGE =
  "Declare a named function instead of assigning an arrow function to a variable - fold the condition inside the function body.";
const IMPORT_WORK_MESSAGE = "Importing a module must do no work: move this inside a function the caller runs.";

export const POSITIONAL_PARAMETER_SYNTAX = [
  {
    selector: ":matches(FunctionDeclaration, TSDeclareFunction)[params.length>1]",
    message: "A function with 2+ parameters takes one destructured object parameter."
  },
  {
    selector: "MethodDefinition[kind!='constructor'] > FunctionExpression[params.length>1]",
    message: "A method with 2+ parameters takes one destructured object parameter."
  }
];

export const GOOGLE_SYNTAX = [
  {
    selector: NON_NARROWING_OPERANDS.map(operand => `${IS_NOT_ELSE_IF} > LogicalExpression.test > ${operand}`).join(", "),
    message: "Extract the condition into a descriptively-named const (is/has/can/should) right before the if."
  },
  {
    selector: `${IS_NOT_ELSE_IF} > BinaryExpression.test:not(${IS_LONE_LITERAL_COMPARISON})`,
    message: "Extract the comparison into a descriptively-named const (is/has/can/should) right before the if."
  },
  {
    selector: NON_NARROWING_OPERANDS.map(operand => `ConditionalExpression > LogicalExpression.test > ${operand}`).join(", "),
    message: "Extract the ternary's condition into a descriptively-named const (is/has/can/should)."
  },
  {
    selector: "ForInStatement",
    message: "Use for...of over Object.keys/entries instead of for...in (Google style)."
  },
  {
    selector:
      ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[returnType]:not([returnType.typeAnnotation.type='TSTypePredicate'])",
    message: "Do not write a return type: let TypeScript infer it."
  }
];

export const HOUSE_SYNTAX = [
  {
    selector: "MemberExpression[object.name='Reflect']",
    message: "Do not use Reflect. Use direct property access instead."
  },
  {
    selector: "VariableDeclarator[init.type='ConditionalExpression'][init.consequent.type='ArrowFunctionExpression']",
    message: NAMED_FUNCTION_MESSAGE
  },
  {
    selector: "VariableDeclarator[init.type='ConditionalExpression'][init.alternate.type='ArrowFunctionExpression']",
    message: NAMED_FUNCTION_MESSAGE
  }
];

export const TREE_SHAKING_SYNTAX = [
  {
    selector: "Program > ExpressionStatement:not([directive])",
    message: IMPORT_WORK_MESSAGE
  },
  {
    selector:
      "Program > :matches(IfStatement, ForStatement, ForOfStatement, WhileStatement, TryStatement, SwitchStatement)",
    message: IMPORT_WORK_MESSAGE
  }
];
