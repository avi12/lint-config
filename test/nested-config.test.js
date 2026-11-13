import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { oxlintFindings } from "./support/tools.js";

const PRESET = join(import.meta.dirname, "..", "packages", "oxlint-config", "oxlint.json").replaceAll("\\", "/");
const DIRECTIVE_SOURCE = "// eslint-disable-next-line no-debugger\nexport const value = 1;\n";

test("an ignored folder with its own oxlint config reports no unused directive", () => {
  const root = mkdtempSync(join(tmpdir(), "nested-config-"));
  try {
    mkdirSync(join(root, "companion", "winui"), { recursive: true });
    writeFileSync(
      join(root, ".oxlintrc.json"),
      JSON.stringify({ extends: [PRESET], ignorePatterns: ["companion/**"] })
    );
    writeFileSync(join(root, "companion", "winui", ".oxlintrc.json"), "{}");
    writeFileSync(join(root, "companion", "winui", "inner.ts"), DIRECTIVE_SOURCE);
    const findings = oxlintFindings({ cwd: root, files: ["."] });
    assert.deepEqual(
      findings.filter(finding => finding.includes("companion")),
      []
    );
    const unused = findings.filter(finding => finding.startsWith("undefined@") || finding.startsWith("@"));
    assert.deepEqual(unused, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
