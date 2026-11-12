import plugin from "eslint-plugin-jsdoc";

export default {
  ...plugin,
  meta: {
    ...plugin.meta,
    name: "jsdoc-js"
  }
};
