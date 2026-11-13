import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { oxlintFindings, TS_ONLY } from "./support/tools.js";

const PRESET = join(TS_ONLY, "node_modules", "oxlint-config-avi12", "oxlint.json");
const RULE = "typescript(consistent-type-assertions)";
const FLAGGED = `declare const input: unknown;
export const viaAs = input as string;
export const viaDouble = input as unknown as number;
export const viaObject = {} as Record<string, string>;
export const viaAngle = <string>input;
`;
const ALLOWED = `export const literal = ["a"] as const;
export const checked = { a: 1 } satisfies Record<string, number>;
export const annotated: string = "a";
`;

function lint({ files, config = {} }) {
  const directory = mkdtempSync(join(tmpdir(), "assert-"));
  try {
    writeFileSync(join(directory, ".oxlintrc.json"), JSON.stringify({ extends: [PRESET], ...config }));
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(join(directory, name), text);
    }
    return oxlintFindings({ cwd: directory, files: Object.keys(files) }).filter(finding => finding.startsWith(RULE));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("as, double as, object-literal as and angle assertions are flagged in .ts", () => {
  assert.equal(lint({ files: { "flagged.ts": FLAGGED } }).length, 5);
});

test("as const, satisfies and annotations are not flagged", () => {
  assert.deepEqual(lint({ files: { "allowed.ts": ALLOWED } }), []);
});

test("assertions are flagged in a .svelte script block", () => {
  const svelte = `<script lang="ts">\n  declare const input: unknown;\n  const text = input as string;\n  const list = ["a"] as const;\n</script>\n<p>{text}{list}</p>\n`;
  assert.equal(lint({ files: { "flagged.svelte": svelte } }).length, 1);
});

test("a consumer file-list override turns it off for that file only", () => {
  const config = { overrides: [{ files: ["listed.ts"], rules: { "typescript/consistent-type-assertions": "off" } }] };
  const found = lint({ files: { "listed.ts": FLAGGED, "other.ts": FLAGGED }, config });
  assert.equal(found.length, 5);
});

test("test files are not exempt in the preset", () => {
  assert.equal(lint({ files: { "sample.test.ts": FLAGGED } }).length, 5);
});
