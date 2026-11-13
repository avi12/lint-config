import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { mergeFallowConfig } from "../packages/avi12-lint/src/fallow-config.js";

const ROOT = join(import.meta.dirname, "..");
const BIN = join(ROOT, "packages", "avi12-lint", "bin", "avi12-lint.js");
const preset = JSON.parse(readFileSync(join(ROOT, "packages", "fallow-config", "fallow.json"), "utf8"));

test("arrays are united, objects merged and scalars taken from the local layer", () => {
  const merged = mergeFallowConfig({
    base: {
      list: ["a", "b"],
      health: {
        maxCrap: 1000,
        other: 1
      },
      flag: false
    },
    local: {
      list: ["b", "c"],
      health: {
        maxCrap: 5
      },
      flag: true
    }
  });
  assert.deepEqual(merged, {
    list: ["a", "b", "c"],
    health: {
      maxCrap: 5,
      other: 1
    },
    flag: true
  });
});

test("fallow-config writes .fallowrc.json keeping the preset list and the local entry", () => {
  const root = mkdtempSync(join(tmpdir(), "fallow-config-"));
  try {
    mkdirSync(join(root, "node_modules", "fallow-config-avi12"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(
      join(root, "node_modules", "fallow-config-avi12", "package.json"),
      JSON.stringify({
        name: "fallow-config-avi12",
        exports: {
          "./fallow.json": "./fallow.json"
        }
      })
    );
    writeFileSync(join(root, "node_modules", "fallow-config-avi12", "fallow.json"), JSON.stringify(preset));
    writeFileSync(join(root, "fallow.local.json"), JSON.stringify({ ignoreDependencies: ["postcss-html"] }));
    const { status } = spawnSync(process.execPath, [BIN, "fallow-config"], { cwd: root });
    assert.equal(status, 0);
    const written = JSON.parse(readFileSync(join(root, ".fallowrc.json"), "utf8"));
    assert.deepEqual(written.ignoreDependencies, [...preset.ignoreDependencies, "postcss-html"]);
    assert.deepEqual(written.ignorePatterns, preset.ignorePatterns);
  } finally {
    rmSync(root, {
      recursive: true,
      force: true
    });
  }
});
