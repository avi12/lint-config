import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { oxlintFindings, TS_ONLY } from "./support/tools.js";

const SOURCE = "export const some_value = { x_y: 1 };\n";

function lintWithOptions(options, source = SOURCE) {
  const directory = mkdtempSync(join(tmpdir(), "naming-"));
  try {
    const config = {
      extends: [join(TS_ONLY, "node_modules", "oxlint-plugin-naming", "preset.json")],
      rules: {
        "naming/convention": ["error", options]
      }
    };
    writeFileSync(join(directory, ".oxlintrc.json"), JSON.stringify(config));
    writeFileSync(join(directory, "sample.ts"), source);
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

const SELECTOR_SOURCE = [
  "export function Widget_a() {}",
  "export function wrap() {",
  "  const Local_b = 1;",
  "  return Local_b;",
  "}",
  "export function takes(Param_c: number) {",
  "  return Param_c;",
  "}",
  "export class Holder {",
  "  Field_d = 1;",
  "  Method_e() {}",
  "}",
  "export interface Shape_f { Prop_g: number }",
  "export interface IThing_h {}",
  "export type Alias_i = { a: 1 };",
  "export type Generic<Tparam_j> = Tparam_j;",
  "export enum Kind_k { Member_l }",
  "export const holder = { Member_m: 1, Fn_n() {} };",
  ""
].join("\n");

const SELECTOR_NAMES = [
  "Widget_a",
  "Local_b",
  "Param_c",
  "Field_d",
  "Method_e",
  "Prop_g",
  "IThing_h",
  "Alias_i",
  "Tparam_j",
  "Kind_k",
  "Member_l",
  "Member_m",
  "Fn_n",
  "Shape_f"
];

test("allowedNames applies to every selector the rule checks", () => {
  assert.ok(lintWithOptions({}, SELECTOR_SOURCE).length >= SELECTOR_NAMES.length);
  const options = {
    allowedNames: [
      {
        reason: "framework",
        names: SELECTOR_NAMES
      }
    ]
  };
  assert.deepEqual(lintWithOptions(options, SELECTOR_SOURCE), []);
});

test("allowedPatterns applies to every selector the rule checks", () => {
  const options = {
    allowedPatterns: [
      {
        reason: "framework",
        pattern: "_[a-n]$"
      }
    ]
  };
  assert.deepEqual(lintWithOptions(options, SELECTOR_SOURCE), []);
});
