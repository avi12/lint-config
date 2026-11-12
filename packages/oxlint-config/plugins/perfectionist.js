import plugin from "eslint-plugin-perfectionist";

export default {
  ...plugin,
  meta: {
    ...plugin.meta,
    name: "perfectionist"
  }
};
