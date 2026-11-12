import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { oxlintFindings, TS_ONLY } from "./support/tools.js";

const SOURCE = "export const title = document.title;\nexport const id = chrome.runtime.id;\n";
const PRESETS = join(TS_ONLY, "node_modules", "oxlint-config-avi12");

function lintWith(preset) {
  const directory = mkdtempSync(join(tmpdir(), "env-"));
  try {
    const config = {
      extends: [join(PRESETS, preset)],
      rules: { "no-undef": "error" }
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

const UNDEFINED_DOCUMENT = "eslint(no-undef)@1";
const UNDEFINED_CHROME = "eslint(no-undef)@2";

test("the base preset knows neither document nor chrome", () => {
  assert.deepEqual(lintWith("oxlint.json").sort(), [UNDEFINED_DOCUMENT, UNDEFINED_CHROME]);
});

test("the browser preset knows document but not chrome", () => {
  assert.deepEqual(lintWith("browser.json"), [UNDEFINED_CHROME]);
});

test("the webextension preset knows both", () => {
  assert.deepEqual(lintWith("webextension.json"), []);
});
