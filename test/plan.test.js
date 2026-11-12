import assert from "node:assert/strict";
import { test } from "node:test";

import { plan } from "avi12-lint/plan";
import { clampConcurrency } from "eslint-config-avi12/defaults";

const ALL_CONFIGS = new Set([".oxlintrc.json", "eslint.config.js", ".oxfmtrc.json", ".stylelintrc.json"]);

test("concurrency is clamped to 1-4 and defaults to 2", () => {
  assert.equal(clampConcurrency(undefined), 2);
  assert.equal(clampConcurrency("0"), 1);
  assert.equal(clampConcurrency("3"), 3);
  assert.equal(clampConcurrency("99"), 4);
});

test("only the tools with a config are planned, with ESLint first", () => {
  const names = plan({ hasFile: file => ALL_CONFIGS.has(file) }).map(({ name }) => name);
  assert.deepEqual(names, ["eslint", "oxlint", "stylelint", "oxfmt"]);
  assert.deepEqual(plan({ hasFile: () => false }), []);
});

test("fix mode swaps the checkers for fixers and the cache flags are always on", () => {
  const steps = plan({
    hasFile: file => ALL_CONFIGS.has(file),
    isFix: true,
    concurrency: "8"
  });
  const eslint = steps.find(({ name }) => name === "eslint").command;
  assert.ok(eslint.includes("--fix") && eslint.includes("--cache"));
  assert.equal(eslint[eslint.indexOf("--concurrency") + 1], "4");
  assert.ok(!steps.find(({ name }) => name === "oxfmt").command.includes("--check"));
});

const FULL = new Set([
  ...ALL_CONFIGS,
  "node_modules/.bin/tsrs",
  "node_modules/.bin/tsrs-lint",
  "node_modules/.bin/fallow"
]);

function find({ steps, name }) {
  return steps.find(step => step.name === name);
}

test("a full run is parallel, type-aware, and ESLint is at 2 with a content cache", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    platform: "win32"
  });
  assert.deepEqual(
    steps.map(({ name }) => name),
    ["eslint", "oxlint", "tsrs", "stylelint", "oxfmt"]
  );
  assert.ok(steps.every(({ isParallel }) => isParallel));
  const { command } = find({
    steps: steps,
    name: "eslint"
  });
  assert.equal(command[command.indexOf("--concurrency") + 1], "2");
  assert.equal(command[command.indexOf("--cache-strategy") + 1], "content");
  assert.ok(command.includes(".verify/eslint-cache/"));
  assert.ok(
    find({
      steps: steps,
      name: "oxlint"
    }).command.includes("--type-aware")
  );
  assert.equal(
    find({
      steps: steps,
      name: "oxlint"
    }).env.OXLINT_TSGOLINT_PATH,
    "node_modules/.bin/tsrs-lint.CMD"
  );
  assert.deepEqual(
    find({
      steps: steps,
      name: "tsrs"
    }).command,
    ["tsrs", "--noEmit"]
  );
});

test("without tsrs the oxlint step is not type-aware and tsrs is absent", () => {
  const steps = plan({ hasFile: file => ALL_CONFIGS.has(file) });
  assert.ok(
    !find({
      steps: steps,
      name: "oxlint"
    }).command.includes("--type-aware")
  );
  assert.equal(
    find({
      steps: steps,
      name: "tsrs"
    }),
    undefined
  );
});

test("fixing is serial", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    isFix: true
  });
  assert.ok(steps.every(({ isParallel }) => !isParallel));
});

test("changed mode narrows to the files, ESLint to 1, tsrs stays whole-project, fallow audits", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    changedFiles: ["src/a.ts", "src/b.svelte", "README.md"]
  });
  const eslint = find({
    steps: steps,
    name: "eslint"
  }).command;
  assert.equal(eslint[eslint.indexOf("--concurrency") + 1], "1");
  assert.deepEqual(eslint.slice(-2), ["src/a.ts", "src/b.svelte"]);
  assert.deepEqual(
    find({
      steps: steps,
      name: "stylelint"
    }).command,
    ["stylelint", "src/b.svelte"]
  );
  assert.deepEqual(
    find({
      steps: steps,
      name: "tsrs"
    }).command,
    ["tsrs", "--noEmit"]
  );
  assert.deepEqual(
    find({
      steps: steps,
      name: "fallow"
    }).command,
    ["fallow", "audit"]
  );
});

test("changed mode skips a tool with no matching file and honours an override", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    changedFiles: ["README.md"],
    concurrency: "3"
  });
  assert.equal(
    find({
      steps: steps,
      name: "eslint"
    }),
    undefined
  );
  assert.equal(
    find({
      steps: steps,
      name: "oxlint"
    }),
    undefined
  );
  assert.equal(
    find({
      steps: steps,
      name: "stylelint"
    }),
    undefined
  );
  const withScript = plan({
    hasFile: file => FULL.has(file),
    changedFiles: ["a.js"],
    concurrency: "3"
  });
  const { command } = find({
    steps: withScript,
    name: "eslint"
  });
  assert.equal(command[command.indexOf("--concurrency") + 1], "3");
});
