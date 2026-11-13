import assert from "node:assert/strict";
import { test } from "node:test";

import { argumentBudget, batchCommands, runSequentially } from "../packages/avi12-lint/src/batch.js";
import { plan } from "../packages/avi12-lint/src/plan.js";

const MANY_FILES = Array.from({ length: 400 }, (_, i) => `packages/some/deep/folder/file-${i}.ts`);

test("the budget is small on win32, larger elsewhere, and overridable", () => {
  assert.equal(argumentBudget({ platform: "win32" }), 6000);
  assert.ok(argumentBudget({ platform: "linux" }) > 6000);
  assert.equal(argumentBudget({ platform: "win32", env: { AVI12_LINT_ARG_BUDGET: "50" } }), 50);
  assert.equal(argumentBudget({ platform: "win32", env: { AVI12_LINT_ARG_BUDGET: "x" } }), 6000);
});

test("a long file list is split, every file kept once, head and tail on each batch", () => {
  const commands = batchCommands({
    head: ["oxfmt", "--check"],
    files: MANY_FILES,
    tail: ["!x"],
    budget: 6000
  });
  assert.ok(commands.length > 1);
  for (const command of commands) {
    assert.deepEqual(command.slice(0, 2), ["oxfmt", "--check"]);
    assert.equal(command.at(-1), "!x");
    assert.ok(command.join(" ").length < 6200);
  }

  assert.deepEqual(
    commands.flatMap(command => command.slice(2, -1)),
    MANY_FILES
  );
});

test("a short list stays one command and an empty one still yields one", () => {
  assert.equal(batchCommands({ head: ["a"], files: ["f"], tail: [], budget: 6000 }).length, 1);
  assert.deepEqual(batchCommands({ head: ["a"], files: [], tail: [], budget: 6000 }), [["a"]]);
});

test("the planned oxlint and oxfmt steps expose a split that batches", () => {
  const steps = plan({
    hasFile: file => file === ".oxlintrc.json" || file === ".oxfmtrc.json",
    changedFiles: MANY_FILES
  });
  for (const name of ["oxlint", "oxfmt"]) {
    const { split } = steps.find(step => step.name === name);
    assert.ok(batchCommands({ ...split, budget: 6000 }).length > 1);
  }
});

test("batches run in order with a fake spawner and the exit codes merge", async () => {
  const seen = [];
  const codes = [0, 1, 0];
  const merged = await runSequentially({
    commands: [["a"], ["b"], ["c"]],
    runOne: async ({ command, isFirst }) => {
      seen.push([command[0], isFirst]);
      return codes.shift();
    }
  });
  assert.equal(merged, 1);
  assert.deepEqual(seen, [["a", true], ["b", false], ["c", false]]);
});
