import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { oxlintFindings, TS_ONLY } from "./support/tools.js";

const SOURCE = "export const some_value = { x_y: 1 };\n";

function lintWithOptions(options) {
  const directory = mkdtempSync(join(tmpdir(), "naming-"));
  try {
    const config = {
      extends: [join(TS_ONLY, "node_modules", "oxlint-plugin-naming", "preset.json")],
      rules: {
        "naming/convention": ["error", options]
      }
    };
    writeFileSync(join(directory, ".oxlintrc.json"), JSON.stringify(config));
    writeFileSync(join(directory, "sample.ts"), SOURCE);
    return oxlintFindings({
      cwd: directory,
      files: ["sample.ts"]
    });
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
}

test("a name is reported until an allowedNames entry carries it with a reason", () => {
  assert.ok(lintWithOptions({}).length > 0);
  const allowed = {
    allowedNames: [
      {
        reason: "the platform spells it so",
        names: ["some_value", "x_y"]
      }
    ]
  };
  assert.deepEqual(lintWithOptions(allowed), []);
});

test("a fileOverrides entry silences its files", () => {
  const overridden = {
    fileOverrides: [
      {
        reason: "mirrors an external API",
        files: ["sample.ts"]
      }
    ]
  };
  assert.deepEqual(lintWithOptions(overridden), []);
});

test("an entry without a reason makes the rule fail loudly", () => {
  const findings = lintWithOptions({ allowedNames: [{ names: ["some_value", "x_y"] }] });
  assert.deepEqual(findings, ["undefined@0"]);
});
