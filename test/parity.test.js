import assert from "node:assert/strict";
import { test } from "node:test";

import { eslintFindings, oxlintFindings, TS_ONLY, TS_SVELTE, TS_VUE } from "./support/tools.js";

test("ESLint is Svelte-only: a ts file reports nothing to it", () => {
  const findings = eslintFindings({
    cwd: TS_SVELTE,
    files: ["src/bad.ts"]
  });
  assert.ok(findings.every(finding => finding.startsWith("null@")));
});

test("a clean ts file reports nothing to oxlint in either setup", () => {
  for (const cwd of [TS_ONLY, TS_SVELTE]) {
    assert.deepEqual(
      oxlintFindings({
        cwd,
        files: ["src/good.ts"]
      }),
      []
    );
  }
});

test("oxlint reports the same on ts files in both setups", () => {
  const only = oxlintFindings({
    cwd: TS_ONLY,
    files: ["src/bad.ts"]
  });
  assert.ok(only.length > 0);
  assert.deepEqual(
    oxlintFindings({
      cwd: TS_SVELTE,
      files: ["src/bad.ts"]
    }),
    only
  );
});

test("the Svelte layer lints the template", () => {
  const findings = eslintFindings({
    cwd: TS_SVELTE,
    files: ["src/Bad.svelte"]
  });
  assert.ok(findings.includes("no-restricted-syntax@7"));
});

test("oxlint bans any in the script of a Svelte file, so ESLint need not", () => {
  const findings = oxlintFindings({
    cwd: TS_SVELTE,
    files: ["src/Bad.svelte"]
  });
  assert.deepEqual(findings, ["typescript(no-explicit-any)@2"]);
});

test("the Vue layer lints the template and the Svelte-only fixture is untouched", () => {
  const findings = eslintFindings({
    cwd: TS_VUE,
    files: ["src/Bad.vue"]
  });
  for (const expected of ["vue/no-restricted-syntax@3", "vue/no-v-html@5", "vue/block-order@9"]) {
    assert.ok(findings.includes(expected), expected);
  }
});

test("ESLint is template-only in a Vue repo: a ts file reports nothing to it", () => {
  const findings = eslintFindings({
    cwd: TS_VUE,
    files: ["src/bad.ts"]
  });
  assert.ok(findings.every(finding => finding.startsWith("null@")));
});

test("oxlint reports the same on ts files in the Vue and ts-only setups", () => {
  const only = oxlintFindings({
    cwd: TS_ONLY,
    files: ["src/bad.ts"]
  });
  assert.deepEqual(
    oxlintFindings({
      cwd: TS_VUE,
      files: ["src/bad.ts"]
    }),
    only
  );
});

test("oxlint judges the script of a Vue file, so ESLint need not", () => {
  const findings = oxlintFindings({
    cwd: TS_VUE,
    files: ["src/Bad.vue"]
  });
  assert.ok(findings.includes("typescript(no-explicit-any)@10"));
});
