import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { lintSource } from "./support/tools.js";

const GOOGLE = "house(google-syntax)";
const TWO_PARAMETERS = "export function mirror(element: number, options: number) {\n  return [element, options];\n}\n";

function codes({ source, ...rest }) {
  return lintSource({
    source,
    ...rest
  }).map(finding => finding.slice(0, finding.lastIndexOf("@")));
}

test("a lone comparison against a literal, null or undefined stays inline", () => {
  for (const condition of ["value === null", "value === 0", "undefined !== value", "value === 'a'"]) {
    const found = codes({
      source: `export function run(value: unknown) {\n  if (${condition}) {\n    return 1;\n  }\n\n  return 2;\n}\n`
    });
    assert.ok(!found.includes(GOOGLE), condition);
  }
});

test("a comparison of two values and a compound condition still extract", () => {
  const compare =
    "export function run(left: number, other: number) {\n  if (left === other) {\n    return 1;\n  }\n\n  return 2;\n}\n";
  assert.ok(codes({ source: compare }).includes(GOOGLE));
  const compound =
    "export function run(value: number, other: boolean) {\n  if (value === 1 || other) {\n    return 1;\n  }\n\n  return 2;\n}\n";
  assert.ok(codes({ source: compound }).includes(GOOGLE));
});

test("positional parameters are reported until an override turns the group off for the files", () => {
  assert.ok(codes({ source: TWO_PARAMETERS }).includes("house(positional-parameters)"));
  const found = codes({
    source: TWO_PARAMETERS,
    filename: "vendor/mirror.ts",
    overrides: [{
       files: ["vendor/**"],
       rules: {
       "house/positional-parameters": "off" 
    } 
    }]
  });
  assert.ok(!found.includes("house(positional-parameters)"));
});

test("the library preset applies tree-shaking and JSDoc to src only, and not to tests", () => {
  const source = "export function undocumented() {\n  return 1;\n}\n\nrun();\n";
  const options = {
    source,
    extend: ["library.json"]
  };
  const inSource = codes({
    ...options,
    filename: "src/sample.ts"
  });
  assert.ok(inSource.includes("house(tree-shaking)"));
  assert.ok(inSource.includes("jsdoc-js(require-jsdoc)"));
  const inTest = codes({
    ...options,
    filename: "src/sample.test.ts"
  });
  assert.ok(!inTest.includes("house(tree-shaking)"));
  assert.ok(!inTest.includes("jsdoc-js(require-jsdoc)"));
  const elsewhere = codes({
    ...options,
    filename: "scripts/sample.ts"
  });
  assert.ok(!elsewhere.includes("house(tree-shaking)"));
});

test("the former ESLint rules run in oxlint: unused imports, import sorting and spaced comments", () => {
  const found = codes({
    source:
      'import { second, first } from "./elsewhere";\nimport { unused } from "./other";\n\nexport const list = [first, second];\n//bad\n'
  });
  assert.ok(found.includes("unused-imports(no-unused-imports)"));
  assert.ok(found.includes("perfectionist(sort-named-imports)"));
  assert.ok(found.includes("@stylistic(spaced-comment)"));
});

test("the wxt preset allows default exports in entrypoints and declarations only", () => {
  const preset = JSON.parse(readFileSync("packages/oxlint-config/wxt.json", "utf8"));
  assert.deepEqual(preset.extends, ["./webextension.json"]);
  assert.deepEqual(preset.overrides[0].files, ["**/entrypoints/**", "**/*.d.ts"]);
  assert.equal(preset.overrides[0].rules["no-restricted-exports"], "off");
});

test("house/no-magic-numbers exempts numeric literal types anywhere and flags bare numbers", () => {
  const source = [
    "export type Narrowed = Exclude<string, 720 | 480>;",
    "export type Bound = Record<string, 30>;",
    "export const LIMIT = 720;",
    "export const doubled = [LIMIT].map(value => value * 2);",
    "export function bad(value: number) {",
    "  return value + 720;",
    "}",
    ""
  ].join("\n");
  const findings = lintSource({ source }).filter(finding => finding.includes("magic"));
  assert.deepEqual(findings, ["house(no-magic-numbers)@6"]);
});

test("a compound condition made only of narrowing checks is not extracted, any other still is", () => {
  const wrap = condition =>
    `export function run(shape: { kind: "a" | "b" | "c" }, other: boolean, key: string, target: object) {\n  if (${condition}) {\n    return 1;\n  }\n\n  return 2;\n}\n`;
  for (const condition of [
    "shape.kind === 'a' || shape.kind === 'b'",
    "shape.kind !== 'a' && shape.kind !== 'b' && shape.kind !== 'c'",
    "typeof key === 'string' || key in target",
    "target instanceof Date || key in target"
  ]) {
    assert.ok(!codes({ source: wrap(condition) }).includes(GOOGLE), condition);
  }
  for (const condition of ["shape.kind === 'a' || other", "shape.kind === 'a' && (other || shape.kind === 'b')"]) {
    assert.ok(codes({ source: wrap(condition) }).includes(GOOGLE), condition);
  }
});
