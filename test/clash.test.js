import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  eslintFix,
  eslintRules,
  oxfmtFix,
  oxlintFindings,
  oxlintFix,
  oxlintRules,
  TS_SVELTE,
  TS_VUE
} from "./support/tools.js";

const RULE_PREFIXES = /^(@typescript-eslint\/|typescript\/|@stylistic\/(js\/|ts\/)?|eslint\/)/;
const LAYOUT =
  /indent|quotes|semi$|comma-|brace|padding|newline|max-len|object-curly|arrow-parens|space|first-attribute/;
const OPPOSITES = [
  ["func-style", "prefer-arrow-callback"],
  ["curly", "brace-style"],
  ["sort-imports", "perfectionist/sort-imports"]
];
const MAX_FIX_CYCLES = 4;
const BACKSLASH = String.fromCharCode(92);
const FIX_DIRECTORY = "clash-fix-run";
const FIXABLE_SOURCE = `import { second, first, unused } from "./elsewhere";
export const list = [first, second];
export interface Options { readonly a: number; readonly b: { readonly c: string; readonly d: string } }
export type Pair = { first: number; second: { deep: string; other: number } };
export function pick({ flag }: { flag: boolean }, extra: { p: number; q: number }) {
  resolve({ key: 1, value: 2 });
  let fixed = 1;
  const text = 'quoted';
  const shape = { alpha: 1, beta: 2 };
  const nested = { outer: { inner: 1, other: 2 }, tail: { deep: { leaf: 1, more: 2 } } };
  if (flag) return nested || fixed + shape.alpha;
  return [list, text];
}
export const mapped = list.map(item =>
  pick(
    { flag: Boolean(item) },
    { p: 1, q: 2 }
  )
);
export const called = resolve({
  key: 1,
  value: 2,
  more: [first, second]
}
);
export const escaped = "a\\u2014b";
export const hooks = { build: arg => { resolve(arg); }, "build:done": async (value: string, count = 1) => { resolve(value, count); }, [escaped]: arg => { resolve(arg); }, uses: () => { this.run(); }, expression: arg => arg + 1, nested: { deep: arg => { resolve(arg); } } };
export const wrapped = list.filter(item => item.startsWith("long-prefix-value") && item.endsWith("long-suffix-value") && item.length > 3);
`;

function normalize(name) {
  return name.replace(RULE_PREFIXES, "");
}

function crossToolOverlaps({ cwd, file }) {
  const eslint = eslintRules({
    cwd,
    file
  });
  const oxlint = oxlintRules({
    cwd,
    file
  });
  const eslintBases = new Map(
    [...eslint].map(([name, options]) => [
      normalize(name),
      {
        name,
        options
      }
    ])
  );
  const overlaps = [];
  for (const [name, options] of oxlint) {
    const other = eslintBases.get(normalize(name));
    const hasOverlap = other !== undefined;
    if (hasOverlap) {
      const kind = other.options === options ? "duplicate" : "conflict";
      overlaps.push(`${kind} ${normalize(name)}: eslint ${other.name}${other.options} | oxlint ${name}${options}`);
    }
  }
  return overlaps;
}

function oppositesEnabled({ cwd, file }) {
  const enabled = new Set(
    [
      ...eslintRules({
        cwd,
        file
      }).keys(),
      ...oxlintRules({ cwd }).keys()
    ].map(normalize)
  );
  return OPPOSITES.filter(([first, second]) => enabled.has(normalize(first)) && enabled.has(normalize(second)));
}

function layoutOwners(file) {
  const owners = new Map();
  for (const name of eslintRules({
    cwd: TS_SVELTE,
    file
  }).keys()) {
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
  assert.deepEqual(
    crossToolOverlaps({
      cwd: TS_SVELTE,
      file: "src/Bad.svelte"
    }),
    []
  );
});

test("no pair of opposing rules is enabled together", () => {
  assert.deepEqual(
    oppositesEnabled({
      cwd: TS_SVELTE,
      file: "src/Bad.svelte"
    }),
    []
  );
});

test("one layout rule owns each aspect of a Svelte file", () => {
  assert.deepEqual(layoutOwners("src/Bad.svelte"), []);
});

function fixAll({ options, order }) {
  const fixers = {
    oxlint: oxlintFix,
    oxfmt: oxfmtFix,
    eslint: eslintFix
  };
  for (const name of order) {
    fixers[name](options);
  }
}

function fixUntilStable({ options, order, files }) {
  let previous = digest(files);
  for (let cycle = 0; cycle < MAX_FIX_CYCLES; cycle++) {
    fixAll({
      options,
      order
    });
    const current = digest(files);
    const isStable = current === previous;
    if (isStable) {
      return current;
    }

    previous = current;
  }
  assert.fail(`the fixers did not settle in ${MAX_FIX_CYCLES} cycles`);
}

test("fixing settles, stays settled and the fixer order does not matter", () => {
  const directory = join(TS_SVELTE, FIX_DIRECTORY);
  rmSync(directory, {
    recursive: true,
    force: true
  });
  mkdirSync(directory);
  try {
    writeFileSync(join(directory, "fixable.ts"), FIXABLE_SOURCE);
    cpSync(join(TS_SVELTE, "src", "Bad.svelte"), join(directory, "Bad.svelte"));
    const files = readdirSync(directory).map(name => join(directory, name));
    const relative = readdirSync(directory).map(name => `${FIX_DIRECTORY}/${name}`);
    const options = {
      cwd: TS_SVELTE,
      files: relative
    };
    const forward = ["oxlint", "oxfmt", "eslint"];
    const settled = fixUntilStable({
      options,
      order: forward,
      files
    });
    fixAll({
      options,
      order: forward
    });
    const fixedNested = readFileSync(join(directory, "fixable.ts"), "utf8");
    assert.doesNotMatch(fixedNested, / +$/m);
    assert.doesNotMatch(fixedNested, /^( {2})* [^ ]/m);
    for (const expected of [
      "  build(arg) {",
      '  async "build:done"(value: string, count = 1) {',
      "  [escaped](arg) {",
      "    deep(arg) {",
      "  uses: () => {",
      "  expression: arg => arg + 1,",
      `a${BACKSLASH}u2014b`
    ]) {
      assert.ok(fixedNested.includes(expected), expected);
    }
    assert.equal(digest(files), settled);
    fixAll({
      options,
      order: [...forward].reverse()
    });
    assert.equal(digest(files), settled);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});

const COMPONENT_USER = `<script lang="ts">
  import Child from "./Child.svelte";
  import Unused from "./Unused.svelte";
</script>

<Child />
`;

test("fixing keeps an import that only the markup uses and drops one nothing uses", () => {
  const directory = join(TS_SVELTE, FIX_DIRECTORY);
  rmSync(directory, {
    recursive: true,
    force: true
  });
  mkdirSync(directory);
  try {
    writeFileSync(join(directory, "User.svelte"), COMPONENT_USER);
    const options = {
      cwd: TS_SVELTE,
      files: [`${FIX_DIRECTORY}/User.svelte`]
    };
    for (const order of [
      ["oxlint", "oxfmt", "eslint"],
      ["eslint", "oxfmt", "oxlint"]
    ]) {
      writeFileSync(join(directory, "User.svelte"), COMPONENT_USER);
      assert.deepEqual(oxlintFindings(options), [], "oxlint must not judge imports of a Svelte file");
      fixAll({
        options,
        order
      });
      const fixed = readFileSync(join(directory, "User.svelte"), "utf8");
      assert.match(fixed, /import Child from/, order.join());
      assert.doesNotMatch(fixed, /Unused/, order.join());
    }
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});

const CODEMOD_SOURCE = `import { call } from "./elsewhere";
export const a = call({
  alpha: 1, beta: 2 });
export const b = call({ alpha: 1, beta: 2
});
export const c = call(
  { alpha: 1, beta: 2 }, { gamma: 3 });
export const d = call({ alpha: 1, beta: 2 }, { gamma: 3, delta: 4 }, { epsilon: 5, zeta: 6 }, { eta: 7, theta: 8 }, { iota: 9, kappa: 10 }, { lambda: 11 });
export const e = call({ alpha: call({ beta: 1, gamma: 2 }, { delta: 3, epsilon: 4 }), zeta: call({ eta: 5, theta: 6 }, { iota: 7, kappa: 8 }) });
export const { f, g } = call({ alpha: 1, beta: 2 }, { gamma: 3, delta: 4 });
export function h({ i, j }: { i: number; j: number }) { return call({ i, j }, { k: 1, l: 2 }); }
export const m = call({ alpha: 1, beta: { gamma: 2,
  delta: 3 } });
`;

test("one planned fix run settles codemod-style one-line object arguments", () => {
  const directory = join(TS_SVELTE, FIX_DIRECTORY);
  rmSync(directory, {
    recursive: true,
    force: true
  });
  mkdirSync(directory);
  try {
    const file = join(directory, "codemod.ts");
    writeFileSync(file, CODEMOD_SOURCE);
    const options = {
      cwd: TS_SVELTE,
      files: [`${FIX_DIRECTORY}/codemod.ts`]
    };
    const plannedRun = ["oxlint", "oxfmt", "oxlint", "oxfmt"];
    fixAll({
      options,
      order: plannedRun
    });
    const afterFirstRun = readFileSync(file, "utf8");
    fixAll({
      options,
      order: plannedRun
    });
    assert.equal(readFileSync(file, "utf8"), afterFirstRun);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});

const VUE_USER = `<script setup lang="ts">
import Child from "./Child.vue";
import Unused from "./Unused.vue";
</script>

<template>
      <div   class="a"   id="b" data-x="1" data-y="2" data-z="3" data-w="4" data-q="5" data-r="6" data-s="7" data-t="8"><h3>hi</h3>
  <Child /></div>
</template>

<style>
p{color:red}
</style>
`;

test("Vue: no rule is enforced by both ESLint and oxlint, none opposes another", () => {
  const options = {
    cwd: TS_VUE,
    file: "src/Bad.vue"
  };
  assert.deepEqual(crossToolOverlaps(options), []);
  assert.deepEqual(oppositesEnabled(options), []);
});

test("Vue: fixing keeps an import only the template uses, drops an unused one, in either order", () => {
  const directory = join(TS_VUE, FIX_DIRECTORY);
  rmSync(directory, {
    recursive: true,
    force: true
  });
  mkdirSync(directory);
  try {
    const file = join(directory, "User.vue");
    const options = {
      cwd: TS_VUE,
      files: [`${FIX_DIRECTORY}/User.vue`]
    };
    for (const order of [
      ["oxlint", "oxfmt", "eslint"],
      ["eslint", "oxfmt", "oxlint"]
    ]) {
      writeFileSync(file, VUE_USER);
      assert.deepEqual(oxlintFindings(options), [], "oxlint must not judge imports of a Vue file");
      fixAll({
        options,
        order
      });
      const fixed = readFileSync(file, "utf8");
      assert.match(fixed, /import Child from/, order.join());
      assert.doesNotMatch(fixed, /Unused/, order.join());
      const settled = digest([file]);
      fixAll({
        options,
        order
      });
      assert.equal(digest([file]), settled, order.join());
    }
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});
