export const SVELTE_TEMPLATE_SYNTAX = [
  {
    selector:
      "SvelteMustacheTag:not([parent.type='SvelteAttribute']):not([parent.type='SvelteStyleDirective']) > ConditionalExpression",
    message: "Do not use a ternary in a template tag - use an {#if}/{:else} block instead."
  }
];

export const VUE_TEMPLATE_SYNTAX = [
  {
    selector: "VElement > VExpressionContainer ConditionalExpression",
    message: "Do not use a ternary in a template tag - use v-if/v-else instead."
  }
];
