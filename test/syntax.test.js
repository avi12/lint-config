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

function wrap(condition) {
  return `export function run(a: string | null, b: string | null, left: number, other: number, status: number, node: object) {
  if (${condition}) {
    return 1;
  }

  return 2;
}
`;
}

test("a lone comparison of any kind stays inline", () => {
  for (const condition of ["left === other", "node instanceof Date", "status === Number.MAX_VALUE", "left < other"]) {
    assert.ok(!codes({ source: wrap(condition) }).includes(GOOGLE), condition);
  }
});

test("a truthiness-only compound stays inline", () => {
  for (const condition of ["!a || !b", "a && b", "a && node.constructor", "!a?.length || !b"]) {
    assert.ok(!codes({ source: wrap(condition) }).includes(GOOGLE), condition);
  }
});

test("a compound with a call or several non-narrowing comparisons still extracts", () => {
  for (const condition of [
    "a && b.trim()",
    "left === other || status === Number.MAX_VALUE",
    "left === 1 || a && left > other"
  ]) {
    assert.ok(codes({ source: wrap(condition) }).includes(GOOGLE), condition);
  }
});

test("id-length allows the project idioms and a consumer exception list adds a name", () => {
  const source =
    "export interface FS {\n  readonly name: string;\n}\n\nexport function run(x: number, to: number) {\n  return [x, to];\n}\n";
  const found = lintSource({ source });
  assert.ok(found.some(finding => finding.startsWith("eslint(id-length)")));
  assert.equal(found.filter(finding => finding.startsWith("eslint(id-length)")).length, 1);
  const allowed = lintSource({
    source,
    overrides: [
      {
        files: ["**"],
        rules: {
          "id-length": [
            "error",
            {
              min: 3,
              exceptions: ["_", "i", "j", "x", "y", "id", "to", "on", "ok", "T", "FS"],
              properties: "never"
            }
          ]
        }
      }
    ]
  });
  assert.ok(!allowed.some(finding => finding.startsWith("eslint(id-length)")));
});

test("positional parameters are reported until an override turns the group off for the files", () => {
  assert.ok(codes({ source: TWO_PARAMETERS }).includes("house(positional-parameters)"));
  const found = codes({
    source: TWO_PARAMETERS,
    filename: "vendor/mirror.ts",
    overrides: [
      {
        files: ["vendor/**"],
        rules: {
          "house/positional-parameters": "off"
        }
      }
    ]
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
  for (const condition of [
    "shape.kind === 'a' || other.valueOf()",
    "shape.kind === 'a' && (key.trim() || shape.kind === 'b')"
  ]) {
    assert.ok(codes({ source: wrap(condition) }).includes(GOOGLE), condition);
  }
});

test("a type literal typing a parameter is left to oxfmt in every function-like signature", () => {
  const shapes = [
    "export interface Api {\n  run(options: { first: number; second: number }): void;\n}\n",
    "export type Callback = (options: { first: number; second: number }) => void;\n",
    "export type Factory = new (options: { first: number; second: number }) => object;\n",
    "export interface Call {\n  (options: { first: number; second: number }): void;\n}\n",
    "export interface Make {\n  new (options: { first: number; second: number }): object;\n}\n",
    "export const run = (options: { first: number; second: number }) => options;\n",
    "export class Box {\n  put(options: { first: number; second: number }) {\n    return options;\n  }\n}\n"
  ];
  for (const source of shapes) {
    assert.ok(!codes({ source }).includes("house(expand-nested-type-literal)"), source);
  }
  const property = "export interface Shape {\n  readonly pair: { first: number; second: number };\n}\n";
  assert.ok(codes({ source: property }).includes("house(expand-nested-type-literal)"));
});

test("a written return type of never or an assertion signature is allowed, any other is not", () => {
  const allowed = [
    "export function fail(): never {\n  throw new Error('x');\n}\n",
    "export const fail = (): never => {\n  throw new Error('x');\n};\n",
    "export function check(value: unknown): asserts value is string {\n  if (typeof value !== 'string') {\n    throw new Error('x');\n  }\n}\n",
    "export function isText(value: unknown): value is string {\n  return typeof value === 'string';\n}\n"
  ];
  for (const source of allowed) {
    assert.ok(!codes({ source }).includes(GOOGLE), source);
  }
  assert.ok(codes({ source: "export function size(): number {\n  return 1;\n}\n" }).includes(GOOGLE));
});

function wrapGuard(condition) {
  return `interface Shape { bar: number; y: number; kind: string; size: number }
declare function isShape(value: unknown): value is Shape;
export function run(x: string | Shape | undefined, other: number, flag: boolean) {
  if (${condition}) {
    return 1;
  }

  return other + Number(flag);
}
`;
}

test("a guard and the access that relies on it stay in one condition", () => {
  for (const condition of [
    "typeof x === 'string' && x.length > 0",
    "x !== undefined && typeof x !== 'string' && x.y === 1",
    "isShape(x) && x.bar",
    "isShape(x) && x.bar > other",
    "typeof x === 'object' && x !== null && 'bar' in x && x.bar > 1",
    "x !== undefined && typeof x === 'object' && x.kind === 'a' && x.size > 2",
    "x && typeof x === 'string' && x.trim()",
    "x === undefined || typeof x === 'string' || x.bar > 1"
  ]) {
    assert.ok(!codes({ source: wrapGuard(condition) }).includes(GOOGLE), condition);
  }
});

test("a ternary with a guarded access stays inline too", () => {
  const source = wrapGuard("flag").replace(
    "if (flag) {\n    return 1;\n  }\n\n  return other + Number(flag);",
    "return isShape(x) && x.bar > 1 ? 1 : 2;"
  );
  assert.ok(!codes({ source }).includes(GOOGLE));
});

test("independent compounds still extract", () => {
  for (const condition of [
    "isShape(x) && other > 1",
    "flag && other > 1",
    "typeof x === 'string' && other > 1",
    "isShape(x) && isShape(other)"
  ]) {
    assert.ok(codes({ source: wrapGuard(condition) }).includes(GOOGLE), condition);
  }
});
