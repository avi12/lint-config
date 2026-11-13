import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const preset = JSON.parse(readFileSync(new URL("../packages/fallow-config/fallow.json", import.meta.url), "utf8"));

test("the fallow preset ignores binaries, minified and vendored code and tool output, which once ran fallow to 38 GB", () => {
  for (const pattern of ["**/*.wasm", "**/*.jsdos", "**/*.min.js", "**/vendor/**", "**/.output/**", "**/.wxt/**"]) {
    assert.ok(preset.ignorePatterns.includes(pattern), pattern);
  }
});

test("the fallow preset ignores every lint package that only a config file references", () => {
  for (const name of [
    "oxfmt-config-avi12",
    "oxlint-config-avi12",
    "oxlint-plugin-naming",
    "stylelint-config-avi12",
    "eslint-config-avi12",
    "fallow-config-avi12",
    "oxlint",
    "oxfmt",
    "stylelint",
    "eslint"
  ]) {
    assert.ok(preset.ignoreDependencies.includes(name), name);
  }
});
