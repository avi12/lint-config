import assert from "node:assert/strict";
import { test } from "node:test";
import { eslintFindings, oxlintFindings, TS_ONLY, TS_SVELTE } from "./support/tools.js";

test("ts files report identically with and without the Svelte layer", () => {
  const only = eslintFindings({ cwd: TS_ONLY, files: ["src/bad.ts"] });
  const withSvelte = eslintFindings({ cwd: TS_SVELTE, files: ["src/bad.ts"] });
  assert.ok(only.length > 0);
  assert.deepEqual(withSvelte, only);
});

test("a clean ts file reports nothing in either setup", () => {
  assert.deepEqual(eslintFindings({ cwd: TS_ONLY, files: ["src/good.ts"] }), []);
  assert.deepEqual(eslintFindings({ cwd: TS_SVELTE, files: ["src/good.ts"] }), []);
  assert.deepEqual(oxlintFindings({ cwd: TS_ONLY, files: ["src/good.ts"] }), []);
  assert.deepEqual(oxlintFindings({ cwd: TS_SVELTE, files: ["src/good.ts"] }), []);
});

test("oxlint reports the same on ts files in both setups", () => {
  const only = oxlintFindings({ cwd: TS_ONLY, files: ["src/bad.ts"] });
  assert.ok(only.length > 0);
  assert.deepEqual(oxlintFindings({ cwd: TS_SVELTE, files: ["src/bad.ts"] }), only);
});

test("the Svelte layer lints the template", () => {
  const findings = eslintFindings({ cwd: TS_SVELTE, files: ["src/Bad.svelte"] });
  assert.ok(findings.includes("no-restricted-syntax@7"));
});

test("oxlint bans any in the script of a Svelte file, so ESLint need not", () => {
  const findings = oxlintFindings({ cwd: TS_SVELTE, files: ["src/Bad.svelte"] });
  assert.deepEqual(findings, ["typescript(no-explicit-any)@2"]);
});
