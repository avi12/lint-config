const IS_NOT_ELSE_IF = "IfStatement[parent.type!='IfStatement']";
const NAMED_FUNCTION_MESSAGE =
  "Declare a named function instead of assigning an arrow function to a variable - fold the condition inside the function body.";
const IMPORT_WORK_MESSAGE = "Importing a module must do no work: move this inside a function the caller runs.";

export const GOOGLE_SYNTAX = [
  {
    selector: `${IS_NOT_ELSE_IF} > LogicalExpression.test`,
    message: "Extract the condition into a descriptively-named const (is/has/can/should) right before the if."
  },
  {
    selector: `${IS_NOT_ELSE_IF} > BinaryExpression.test`,
    message: "Extract the comparison into a descriptively-named const (is/has/can/should) right before the if."
  },
  {
    selector: "ConditionalExpression > LogicalExpression.test",
    message: "Extract the ternary's condition into a descriptively-named const (is/has/can/should)."
  },
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message: "Use for...of instead of .forEach."
  },
  {
    selector: ":matches(CallExpression[callee.property.name='reduce'], CallExpression[callee.property.name='reduceRight'])",
    message: "Use a plain for loop instead of .reduce."
  },
  {
    selector: "ForInStatement",
    message: "Use for...of over Object.keys/entries instead of for...in (Google style)."
  },
  {
    selector: ":matches(FunctionDeclaration, TSDeclareFunction)[params.length>1]",
    message: "A function with 2+ parameters takes one destructured object parameter."
  },
  {
    selector: "MethodDefinition[kind!='constructor'] > FunctionExpression[params.length>1]",
    message: "A method with 2+ parameters takes one destructured object parameter."
  },
  {
    selector: ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[returnType]:not([returnType.typeAnnotation.type='TSTypePredicate'])",
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
    selector: "Program > ExpressionStatement[directive=undefined]",
    message: IMPORT_WORK_MESSAGE
  },
  {
    selector: "Program > :matches(IfStatement, ForStatement, ForOfStatement, WhileStatement, TryStatement, SwitchStatement)",
    message: IMPORT_WORK_MESSAGE
  }
];

export const SVELTE_TEMPLATE_SYNTAX = [
  {
    selector: "SvelteMustacheTag:not([parent.type='SvelteAttribute']):not([parent.type='SvelteStyleDirective']) > ConditionalExpression",
    message: "Do not use a ternary in a template tag - use an {#if}/{:else} block instead."
  }
];
