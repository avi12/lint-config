import plugin from "eslint-plugin-unused-imports";

export default {
  ...plugin,
  meta: {
    ...plugin.meta,
    name: "unused-imports"
  }
};
