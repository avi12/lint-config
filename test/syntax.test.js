import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ESLint } from "eslint";
import { base } from "eslint-config-avi12/base";

const EXTRACT = "Extract";

async function extractions(source) {
  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: base({ sourceFiles: [] })
  });
  const [result] = await eslint.lintText(source, { filePath: "src/sample.js" });
  return result.messages.filter(({ message }) => message.startsWith(EXTRACT));
}

test("a lone comparison against a literal, null or undefined stays inline", async () => {
  for (const condition of ["value === null", "value === 0", "undefined !== value", "value === 'a'"]) {
    assert.deepEqual(await extractions(`if (${condition}) {\n  run();\n}\n`), []);
  }
});

test("a comparison of two values and a compound condition still extract", async () => {
  assert.equal((await extractions("if (left === right) {\n  run();\n}\n")).length, 1);
  assert.equal((await extractions("if (value === null || other) {\n  run();\n}\n")).length, 1);
});

test("the wxt preset allows default exports in entrypoints and declarations only", () => {
  const preset = JSON.parse(readFileSync("packages/oxlint-config/wxt.json", "utf8"));
  assert.deepEqual(preset.extends, ["./webextension.json"]);
  assert.deepEqual(preset.overrides[0].files, ["**/entrypoints/**", "**/*.d.ts"]);
  assert.equal(preset.overrides[0].rules["no-restricted-exports"], "off");
});
