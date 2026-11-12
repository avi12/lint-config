import assert from "node:assert/strict";
import { test } from "node:test";

import { ESLint } from "eslint";
import { base } from "eslint-config-avi12/base";

const TWO_PARAMETERS = "export function mirror(element, options) {\n  return [element, options];\n}\n";

async function lintText({ config, filePath }) {
  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: config
  });
  const [result] = await eslint.lintText(TWO_PARAMETERS, { filePath });
  return result.messages.filter(({ message }) => message.includes("2+ parameters"));
}

test("an empty sourceFiles skips the package-source layer instead of crashing", async () => {
  const config = base({ sourceFiles: [] });
  assert.ok(config.every(entry => entry.files === undefined || entry.files.length > 0));
  const findings = await lintText({
    config,
    filePath: "src/sample.js"
  });
  assert.equal(findings.length, 1);
});

test("allowPositionalParameters exempts only the matching files", async () => {
  const config = base({
    sourceFiles: [],
    allowPositionalParameters: ["vendor/**"]
  });
  assert.deepEqual(
    await lintText({
      config,
      filePath: "vendor/mirror.js"
    }),
    []
  );
  assert.equal(
    (
      await lintText({
        config,
        filePath: "src/mirror.js"
      })
    ).length,
    1
  );
});
