export const KEPT_LAYOUT_RULES = new Set(["html-self-closing"]);

export const VUE_RULES = {
  "vue/block-order": ["error", { order: ["script", "template", "style"] }],
  "vue/block-lang": [
    "error",
    {
      script: {
        lang: "ts"
      }
    }
  ],
  "vue/component-name-in-template-casing": ["error", "PascalCase"],
  "vue/define-macros-order": ["error", { order: ["defineOptions", "defineProps", "defineEmits", "defineSlots"] }],
  "vue/v-on-event-hyphenation": ["error", "always"],
  "vue/html-self-closing": [
    "error",
    {
      html: {
        void: "always",
        normal: "always",
        component: "always"
      }
    }
  ],
  "vue/multi-word-component-names": "off",
  "vue/no-v-html": "error",
  "vue/no-unused-refs": "error",
  "vue/no-useless-v-bind": "error",
  "vue/prefer-true-attribute-shorthand": "error",
  "vue/prefer-separate-static-class": "error",
  "vue/v-for-delimiter-style": ["error", "of"],
  "vue/v-bind-style": ["error", "shorthand"],
  "vue/v-on-style": ["error", "shorthand"],
  "vue/v-slot-style": ["error", "shorthand"],
  "vue/attributes-order": "error",
  "unused-imports/no-unused-imports": "error",
  "local/no-em-dash": "error",
  "local/no-padded-tag": "error"
};
