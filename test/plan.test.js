import assert from "node:assert/strict";
import { test } from "node:test";
import { clampConcurrency } from "eslint-config-avi12/defaults";
import { plan } from "avi12-lint/plan";

const ALL_CONFIGS = new Set([".oxlintrc.json", "eslint.config.js", ".oxfmtrc.json", ".stylelintrc.json"]);

test("concurrency is clamped to 1-4 and defaults to 1", () => {
  assert.equal(clampConcurrency(undefined), 1);
  assert.equal(clampConcurrency("0"), 1);
  assert.equal(clampConcurrency("3"), 3);
  assert.equal(clampConcurrency("99"), 4);
});

test("only the tools with a config are planned, in order", () => {
  const names = plan({ hasFile: file => ALL_CONFIGS.has(file) }).map(({ name }) => name);
  assert.deepEqual(names, ["oxlint", "eslint", "oxfmt", "stylelint"]);
  assert.deepEqual(plan({ hasFile: () => false }), []);
});

test("fix mode swaps the checkers for fixers and the cache flags are always on", () => {
  const steps = plan({ hasFile: file => ALL_CONFIGS.has(file), isFix: true, concurrency: "8" });
  const eslint = steps.find(({ name }) => name === "eslint").command;
  assert.ok(eslint.includes("--fix") && eslint.includes("--cache"));
  assert.equal(eslint[eslint.indexOf("--concurrency") + 1], "4");
  assert.ok(!steps.find(({ name }) => name === "oxfmt").command.includes("--check"));
});
