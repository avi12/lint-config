import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { oxlintFindings, TS_ONLY } from "./support/tools.js";

const PRESET = join(TS_ONLY, "node_modules", "oxlint-config-avi12", "oxlint.json");
const RULE = "eslint(no-restricted-imports)";

const SOURCE = [
  'import { a } from "../x";',
  'import { b } from "../a/b.ts";',
  'import { c } from "../../x";',
  'import { d } from "./x";',
  'import { e } from "./a/b";',
  'import { f } from "..";',
  'import { g } from "../";',
  'import { h } from "../x.ts";',
  'import type { I } from "../a/b";',
  'export { j } from "../a/b";',
  'export * from "../../x";',
  'export const k = import("../a/b");',
  'export const values = [a, b, c, d, e, f, g, h, j];',
  ""
].join("\n");

test("every ../ import is banned and ./ imports stay allowed", () => {
  const directory = mkdtempSync(join(tmpdir(), "relative-"));
  try {
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, ".oxlintrc.json"), JSON.stringify({ extends: [PRESET], rules: {} }));
    writeFileSync(join(directory, "src", "sample.ts"), SOURCE);
    const lines = oxlintFindings({ cwd: directory, files: ["src/sample.ts"] })
      .filter((finding) => finding.startsWith(RULE))
      .map((finding) => Number(finding.split("@")[1]))
      .sort((first, second) => first - second);
    assert.deepEqual(lines, [1, 2, 3, 6, 7, 8, 9, 10, 11, 12]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
