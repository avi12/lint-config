import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const preset = JSON.parse(readFileSync(new URL("../packages/fallow-config/fallow.json", import.meta.url), "utf8"));

test("the fallow preset ignores binaries, minified and vendored code and tool output, which once ran fallow to 38 GB", () => {
  for (const pattern of ["**/*.wasm", "**/*.jsdos", "**/*.min.js", "**/vendor/**", "**/.output/**", "**/.wxt/**"]) {
    assert.ok(preset.ignorePatterns.includes(pattern), pattern);
  }
});
