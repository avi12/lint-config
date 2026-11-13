import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      JSON.stringify({
        extends: [PRESET],
        ignorePatterns: ["companion/**"]
      })
    );
    writeFileSync(join(root, "companion", "winui", ".oxlintrc.json"), "{}");
    writeFileSync(join(root, "companion", "winui", "inner.ts"), DIRECTIVE_SOURCE);
    const findings = oxlintFindings({
      cwd: root,
      files: ["."]
    });
    assert.deepEqual(
      findings.filter(finding => finding.includes("companion")),
      []
    );
    const unused = findings.filter(finding => finding.startsWith("undefined@") || finding.startsWith("@"));
    assert.deepEqual(unused, []);
  } finally {
    rmSync(root, {
      recursive: true,
      force: true
    });
  }
});

const NAMING_PLUGIN = join(import.meta.dirname, "..", "packages", "oxlint-plugin-naming", "naming.js");
const NAMING_PRESET = join(import.meta.dirname, "..", "packages", "oxlint-plugin-naming", "preset.json").replaceAll(
  "\\",
  "/"
);
const OXLINT_BINARY = join(import.meta.dirname, "..", "node_modules", "oxlint", "bin", "oxlint");

function runOxlint({ cwd, extraArgs }) {
  const { stdout, stderr } = spawnSync(process.execPath, [OXLINT_BINARY, ...extraArgs, "."], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "",
      FORCE_COLOR: "0"
    }
  });
  return `${stdout}${stderr}`;
}

test("a nested config that registers the same plugin fails oxlint unless nested configs are disabled", () => {
  const root = mkdtempSync(join(tmpdir(), "nested-plugin-"));
  try {
    mkdirSync(join(root, "submodule"), { recursive: true });
    const config = JSON.stringify({ extends: [NAMING_PRESET] });
    writeFileSync(join(root, ".oxlintrc.json"), config);
    copyFileSync(NAMING_PLUGIN, join(root, "submodule", "naming.js"));
    writeFileSync(
      join(root, "submodule", ".oxlintrc.json"),
      JSON.stringify({
        jsPlugins: ["./naming.js"],
        rules: {
          "naming/convention": "error"
        }
      })
    );
    writeFileSync(join(root, "index.ts"), "export const value = 1;\n");
    writeFileSync(join(root, "submodule", "inner.ts"), "export const inner = 1;\n");
    const failing = runOxlint({
      cwd: root,
      extraArgs: []
    });
    assert.match(failing, /already registered/);
    const passing = runOxlint({
      cwd: root,
      extraArgs: ["--disable-nested-config"]
    });
    assert.doesNotMatch(passing, /already registered/);
  } finally {
    rmSync(root, {
      recursive: true,
      force: true
    });
  }
});
