import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { clampConcurrency } from "avi12-lint/eslint-flags";
import { plan } from "avi12-lint/plan";

const ALL_CONFIGS = new Set([".oxlintrc.json", "eslint.config.js", ".oxfmtrc.json", ".stylelintrc.json"]);

test("concurrency is clamped to 1-4 and defaults to 2", () => {
  assert.equal(clampConcurrency(undefined), 2);
  assert.equal(clampConcurrency("0"), 1);
  assert.equal(clampConcurrency("3"), 3);
  assert.equal(clampConcurrency("99"), 4);
});

test("only the tools with a config are planned, with ESLint first", () => {
  const names = plan({
    hasFile: file => ALL_CONFIGS.has(file),
    hasSvelte: true
  }).map(({ name }) => name);
  assert.deepEqual(names, ["eslint", "oxlint", "stylelint", "oxfmt"]);
  const withoutSvelte = plan({ hasFile: file => ALL_CONFIGS.has(file) }).map(({ name }) => name);
  assert.deepEqual(withoutSvelte, ["oxlint", "stylelint", "oxfmt"]);
  assert.deepEqual(plan({ hasFile: () => false }), []);
});

test("fix mode swaps the checkers for fixers and the cache flags are always on", () => {
  const steps = plan({
    hasFile: file => ALL_CONFIGS.has(file),
    hasSvelte: true,
    isFix: true,
    concurrency: "8"
  });
  const eslint = steps.find(({ name }) => name === "eslint").command;
  assert.ok(eslint.includes("--fix") && eslint.includes("--cache"));
  assert.equal(eslint[eslint.indexOf("--concurrency") + 1], "4");
  assert.ok(!steps.find(({ name }) => name === "oxfmt").command.includes("--check"));
});

const FULL = new Set([
  ...ALL_CONFIGS,
  "node_modules/.bin/tsrs",
  "node_modules/.bin/tsrs-lint",
  "node_modules/.bin/fallow"
]);

function find({ steps, name }) {
  return steps.find(step => step.name === name);
}

test("a full run is parallel, type-aware, and ESLint is at 2 with a content cache", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    hasSvelte: true,
    platform: "win32"
  });
  assert.deepEqual(
    steps.map(({ name }) => name),
    ["eslint", "oxlint", "tsrs", "stylelint", "oxfmt"]
  );
  assert.ok(steps.every(({ isParallel }) => isParallel));
  const { command } = find({
    steps,
    name: "eslint"
  });
  assert.equal(command[command.indexOf("--concurrency") + 1], "2");
  assert.equal(command[command.indexOf("--cache-strategy") + 1], "content");
  assert.ok(command.includes(".verify/eslint-cache/"));
  assert.ok(
    find({
      steps,
      name: "oxlint"
    }).command.includes("--type-aware")
  );
  assert.equal(
    find({
      steps,
      name: "oxlint"
    }).env.OXLINT_TSGOLINT_PATH,
    "node_modules/.bin/tsrs-lint.CMD"
  );
  assert.deepEqual(
    find({
      steps,
      name: "tsrs"
    }).command,
    ["tsrs", "--noEmit"]
  );
});

test("without tsrs the oxlint step is not type-aware and tsrs is absent", () => {
  const steps = plan({ hasFile: file => ALL_CONFIGS.has(file) });
  assert.ok(
    !find({
      steps,
      name: "oxlint"
    }).command.includes("--type-aware")
  );
  assert.equal(
    find({
      steps,
      name: "tsrs"
    }),
    undefined
  );
});

test("fixing runs oxlint again after oxfmt, because one pass leaves overlapping fixes", () => {
  const names = plan({
    hasFile: file => ALL_CONFIGS.has(file),
    isFix: true
  }).map(({ name }) => name);
  assert.deepEqual(names, ["oxlint", "stylelint", "oxfmt", "oxlint", "oxfmt"]);
});

test("fixing runs oxfmt when only its binary is installed, and checking does not", () => {
  const hasFile = file => file === ".oxlintrc.json" || file === "node_modules/.bin/oxfmt";
  assert.deepEqual(
    plan({
      hasFile,
      isFix: true
    }).map(({ name }) => name),
    ["oxlint", "oxfmt", "oxlint", "oxfmt"]
  );
  assert.deepEqual(
    plan({ hasFile }).map(({ name }) => name),
    ["oxlint"]
  );
});

test("fixing is serial", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    isFix: true
  });
  assert.ok(steps.every(({ isParallel }) => !isParallel));
});

test("changed mode narrows to the files, ESLint to 1, tsrs stays whole-project, fallow audits", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    hasSvelte: true,
    changedFiles: ["src/a.ts", "src/b.svelte", "README.md"],
    fallowBase: "abc123"
  });
  const eslint = find({
    steps,
    name: "eslint"
  }).command;
  assert.equal(eslint[eslint.indexOf("--concurrency") + 1], "1");
  assert.deepEqual(eslint.slice(-1), ["src/b.svelte"]);
  assert.deepEqual(
    find({
      steps,
      name: "stylelint"
    }).command,
    ["stylelint", "src/b.svelte"]
  );
  assert.deepEqual(
    find({
      steps,
      name: "tsrs"
    }).command,
    ["tsrs", "--noEmit"]
  );
  assert.deepEqual(
    find({
      steps,
      name: "fallow"
    }).command,
    ["fallow", "audit", "--base", "abc123"]
  );
  assert.deepEqual(
    find({
      steps,
      name: "oxfmt"
    }).command,
    ["oxfmt", "--check", "src/a.ts", "src/b.svelte", "README.md"]
  );
});

test("changed mode skips a tool with no matching file and honours an override", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    hasSvelte: true,
    changedFiles: ["README.md"],
    concurrency: "3"
  });
  assert.equal(
    find({
      steps,
      name: "eslint"
    }),
    undefined
  );
  assert.equal(
    find({
      steps,
      name: "oxlint"
    }),
    undefined
  );
  assert.equal(
    find({
      steps,
      name: "stylelint"
    }),
    undefined
  );
  const withScript = plan({
    hasFile: file => FULL.has(file),
    hasSvelte: true,
    changedFiles: ["a.svelte"],
    concurrency: "3"
  });
  const { command } = find({
    steps: withScript,
    name: "eslint"
  });
  assert.equal(command[command.indexOf("--concurrency") + 1], "3");
});

test("oxfmt is given the repo ignore files and the preset ignore globs as exclusions", () => {
  const steps = plan({
    hasFile: file => file === ".oxfmtrc.json" || file === ".gitignore",
    oxfmtIgnores: ["**/.claude/**", "**/_locales/**"]
  });
  assert.deepEqual(steps.find(({ name }) => name === "oxfmt").command, [
    "oxfmt",
    "--check",
    "--ignore-path",
    ".gitignore",
    '"!**/.claude/**"',
    '"!**/_locales/**"',
    "."
  ]);
});

test("the oxfmt preset ignores agent folders, locale data, lock files and generated output", () => {
  const { ignorePatterns } = JSON.parse(readFileSync("packages/oxfmt-config/oxfmt.json", "utf8"));
  for (const glob of ["**/.claude/**", "**/_locales/**", "**/pnpm-lock.yaml", "**/.wxt/**", "**/.output/**"]) {
    assert.ok(ignorePatterns.includes(glob), glob);
  }
});

test("avi12-lint declares no sibling package as a dependency or peer, so a repo without Svelte installs it alone", () => {
  const manifest = JSON.parse(readFileSync(new URL("../packages/avi12-lint/package.json", import.meta.url), "utf8"));
  const declared = Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies
  });
  assert.deepEqual(
    declared.filter(name => name.endsWith("-avi12")),
    []
  );
});

test("fallow runs with a 4 GB Node heap cap", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    changedFiles: ["src/a.ts"],
    fallowBase: "abc123"
  });
  assert.equal(
    find({
      steps,
      name: "fallow"
    }).env.NODE_OPTIONS,
    "--max-old-space-size=4096"
  );
});

test("a run with changed files and no fallow base leaves fallow out, as --staged does", () => {
  const steps = plan({
    hasFile: file => FULL.has(file),
    changedFiles: ["src/a.ts"]
  });
  assert.equal(
    find({
      steps,
      name: "fallow"
    }),
    undefined
  );
});

test("oxfmt gets only the changed files it can format, with the preset exclusions, and is skipped without any", () => {
  const steps = plan({
    hasFile: file => file === ".oxfmtrc.json" || file === ".gitignore",
    changedFiles: ["a.ts", "logo.png", "b.json"],
    oxfmtIgnores: ["**/_locales/**"]
  });
  assert.deepEqual(
    find({
      steps,
      name: "oxfmt"
    }).command,
    ["oxfmt", "--check", "--ignore-path", ".gitignore", "a.ts", "b.json", '"!**/_locales/**"']
  );
  const none = plan({
    hasFile: file => file === ".oxfmtrc.json",
    changedFiles: ["logo.png"]
  });
  assert.deepEqual(none, []);
});

test("no package installs a Git hook: no lifecycle scripts and no hook manager as a dependency", () => {
  const lifecycle = ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepack"];
  for (const name of ["avi12-lint", "eslint-config", "oxlint-config", "oxfmt-config", "stylelint-config"]) {
    const manifest = JSON.parse(readFileSync(new URL(`../packages/${name}/package.json`, import.meta.url), "utf8"));
    assert.deepEqual(
      lifecycle.filter(script => script in (manifest.scripts ?? {})),
      [],
      name
    );
    const declared = Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies
    });
    assert.deepEqual(
      declared.filter(dependency => /husky|simple-git-hooks|lefthook/.test(dependency)),
      [],
      name
    );
  }
});

test("oxlint ignores nested configs unless the consumer opts in", () => {
  const hasFile = file => ALL_CONFIGS.has(file);
  const flagged = plan({ hasFile }).find(({ name }) => name === "oxlint");
  assert.ok(flagged.command.includes("--disable-nested-config"));
  assert.ok(flagged.command.includes("--disable-nested-config"));
  const optedIn = plan({
    hasFile,
    isNestedConfigAllowed: true
  }).find(({ name }) => name === "oxlint");
  assert.ok(!optedIn.command.includes("--disable-nested-config"));
});

test("fallow runs over the full tree only with isFallowFull, and never beside a changed-files run", () => {
  const hasFile = file => ALL_CONFIGS.has(file) || file === "node_modules/.bin/fallow";
  assert.equal(
    plan({ hasFile }).find(({ name }) => name === "fallow"),
    undefined
  );
  const full = plan({
    hasFile,
    isFallowFull: true
  }).find(({ name }) => name === "fallow");
  assert.deepEqual(full.command, ["fallow"]);
  assert.ok(full.env.NODE_OPTIONS.includes("max-old-space-size"));
  const changed = plan({
    hasFile,
    isFallowFull: true,
    changedFiles: ["a.ts"]
  }).find(({ name }) => name === "fallow");
  assert.equal(changed, undefined);
});
