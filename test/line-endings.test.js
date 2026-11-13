import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { oxfmtFix } from "./support/tools.js";

test("oxfmt turns CRLF into LF in one run and a second run changes nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "line-endings-"));
  try {
    const file = join(root, "crlf.ts");
    writeFileSync(file, "export const value = 1;\r\nexport const other = 2;\r\n");
    oxfmtFix({
      cwd: root,
      files: [file]
    });
    const first = readFileSync(file, "utf8");
    assert.ok(!first.includes("\r"));
    oxfmtFix({
      cwd: root,
      files: [file]
    });
    assert.equal(readFileSync(file, "utf8"), first);
  } finally {
    rmSync(root, {
      recursive: true,
      force: true
    });
  }
});
