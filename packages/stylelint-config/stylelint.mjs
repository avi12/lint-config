import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import stylelint from "stylelint";

const avi12 = JSON.parse(readFileSync(new URL("./stylelint.json", import.meta.url), "utf8"));

function requireFrom({ parent, name }) {
  const fromParent = createRequire(parent);
  const folder = fromParent.resolve
    .paths(name)
    .map(base => join(base, name))
    .find(candidate => existsSync(join(candidate, "package.json")));
  const real = realpathSync(folder);
  const manifest = JSON.parse(readFileSync(join(real, "package.json"), "utf8"));
  const entry = typeof manifest.main === "string" ? manifest.main : "index.js";
  return {
    config: fromParent(join(real, entry)),
    file: join(real, entry)
  };
}

function resolvePlugin({ file, plugin }) {
  const isName = typeof plugin === "string";
  return isName ? createRequire(file).resolve(plugin) : plugin;
}

function flatten({ parent, name }) {
  const { config, file } = requireFrom({
    parent,
    name
  });
  const loaded = config.default ?? config;
  const parents = [loaded.extends ?? []].flat();
  const inherited = parents.map(next =>
    flatten({
      parent: file,
      name: next
    })
  );
  return {
    plugins: [
      ...inherited.flatMap(entry => entry.plugins),
      ...[loaded.plugins ?? []].flat().map(plugin =>
        resolvePlugin({
          file,
          plugin
        })
      )
    ],
    overrides: [...inherited.flatMap(entry => entry.overrides), ...(loaded.overrides ?? [])],
    rules: Object.assign({}, ...inherited.map(entry => entry.rules), loaded.rules)
  };
}

function isKnown(name) {
  const isPluginRule = name.includes("/");
  return isPluginRule || name in stylelint.rules;
}

const base = flatten({
  parent: import.meta.filename,
  name: "stylelint-config-ccb"
});
const rules = {
  ...base.rules,
  ...avi12.rules
};

export default {
  ...avi12,
  extends: [],
  plugins: base.plugins,
  overrides: base.overrides,
  rules: Object.fromEntries(Object.entries(rules).filter(([name]) => isKnown(name)))
};
