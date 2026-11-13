import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STYLELINT = join(ROOT, "node_modules", "stylelint", "bin", "stylelint.mjs");
const PRESET = join(ROOT, "packages", "stylelint-config", "stylelint.mjs");

function warnings(css) {
  const directory = mkdtempSync(join(tmpdir(), "stylelint-"));
  try {
    writeFileSync(
      join(directory, "sample.svelte"),
      `<style>
${css}</style>
`
    );
    const { stdout, stderr } = spawnSync(
      process.execPath,
      [STYLELINT, "--config", PRESET, "-f", "json", "sample.svelte"],
      {
        cwd: directory,
        encoding: "utf8"
      }
    );
    return JSON.parse((stdout || stderr).slice((stdout || stderr).indexOf("[{")))[0].warnings.map(({ rule }) => rule);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a -winui-* property keeps its style key as written", () => {
  assert.deepEqual(warnings("a {\n  -winui-based-on: CaptionTextBlockStyle;\n}\n"), []);
});

test("value-keyword-case still applies to other properties", () => {
  assert.deepEqual(warnings("a {\n  display: BLOCK;\n}\n"), ["value-keyword-case"]);
});

test("the preset sets only rules the installed stylelint knows", async () => {
  const { default: stylelint } = await import("stylelint");
  const { default: preset } = await import(pathToFileURL(PRESET).href);
  const unknown = Object.keys(preset.rules).filter(name => !name.includes("/") && !(name in stylelint.rules));
  assert.deepEqual(unknown, []);
});
