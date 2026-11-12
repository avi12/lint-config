import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { eslintFix, eslintRules, oxlintFix, oxlintRules, TS_ONLY, TS_SVELTE } from "./support/tools.js";

const RULE_PREFIXES = /^(@typescript-eslint\/|typescript\/|@stylistic\/(js\/|ts\/)?|eslint\/)/;
const LAYOUT = /indent|quotes|semi$|comma-|brace|padding|newline|max-len|object-curly|arrow-parens|space|first-attribute/;
const OPPOSITES = [["func-style", "prefer-arrow-callback"], ["curly", "brace-style"], ["sort-imports", "perfectionist/sort-imports"]];
const FIX_DIRECTORY = "clash-fix-run";
const FIXABLE_SOURCE = `import { second, first, unused } from "./elsewhere";
export const list = [first, second];
export function pick({ flag }: { flag: boolean }) {
  let fixed = 1;
  if (flag) return fixed;
  return list;
}
`;

function normalize(name) {
  return name.replace(RULE_PREFIXES, "");
}

function crossToolOverlaps({ cwd, file }) {
  const eslint = eslintRules({ cwd, file });
  const oxlint = oxlintRules({ cwd });
  const eslintBases = new Map([...eslint].map(([name, options]) => [normalize(name), { name, options }]));
  const overlaps = [];
  for (const [name, options] of oxlint) {
    const other = eslintBases.get(normalize(name));
    if (other !== undefined) {
      const kind = other.options === options ? "duplicate" : "conflict";
      overlaps.push(`${kind} ${normalize(name)}: eslint ${other.name}${other.options} | oxlint ${name}${options}`);
    }
  }
  return overlaps;
}

function oppositesEnabled({ cwd, file }) {
  const enabled = new Set([...eslintRules({ cwd, file }).keys(), ...oxlintRules({ cwd }).keys()].map(normalize));
  return OPPOSITES.filter(([first, second]) => enabled.has(normalize(first)) && enabled.has(normalize(second)));
}

function layoutOwners(file) {
  const owners = new Map();
  for (const name of eslintRules({ cwd: TS_SVELTE, file }).keys()) {
    if (LAYOUT.test(name)) {
      const group = name.split("/").at(-1);
      owners.set(group, [...(owners.get(group) ?? []), name]);
    }
  }
  return [...owners].filter(([, names]) => names.length > 1);
}

function digest(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file).update(readFileSync(file));
  }
  return hash.digest("hex");
}

test("no rule is enforced by both ESLint and oxlint", () => {
  assert.deepEqual(crossToolOverlaps({ cwd: TS_ONLY, file: "src/good.ts" }), []);
  assert.deepEqual(crossToolOverlaps({ cwd: TS_SVELTE, file: "src/good.ts" }), []);
});

test("no pair of opposing rules is enabled together", () => {
  assert.deepEqual(oppositesEnabled({ cwd: TS_ONLY, file: "src/good.ts" }), []);
  assert.deepEqual(oppositesEnabled({ cwd: TS_SVELTE, file: "src/good.ts" }), []);
});

test("one layout rule owns each aspect of a Svelte file", () => {
  assert.deepEqual(layoutOwners("src/Bad.svelte"), []);
});

test("fixing is idempotent and the fixer order does not matter", () => {
  const directory = join(TS_SVELTE, FIX_DIRECTORY);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory);
  try {
    writeFileSync(join(directory, "fixable.ts"), FIXABLE_SOURCE);
    cpSync(join(TS_SVELTE, "src", "Bad.svelte"), join(directory, "Bad.svelte"));
    const files = readdirSync(directory).map(name => join(directory, name));
    const relative = readdirSync(directory).map(name => `${FIX_DIRECTORY}/${name}`);
    const options = { cwd: TS_SVELTE, files: relative };
    eslintFix(options);
    oxlintFix(options);
    const afterOne = digest(files);
    eslintFix(options);
    oxlintFix(options);
    assert.equal(digest(files), afterOne);
    oxlintFix(options);
    eslintFix(options);
    assert.equal(digest(files), afterOne);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
