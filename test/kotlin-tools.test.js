import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { kotlinSteps, parseJavaMajor } from "avi12-lint/kotlin";
import { ensureTool } from "avi12-lint/kotlin-tools";

const PRESET = resolve("packages/kotlin-config");
const FIXTURES = join(PRESET, "fixtures");
const CACHE = resolve(".verify/kotlin-tools");
const TOOLS_FILE = join(PRESET, "tools.json");
const MINIMUM_JAVA = 17;
const probe = spawnSync("java", ["-version"], { encoding: "utf8" });
const javaMajor = probe.error ? undefined : parseJavaMajor(`${probe.stderr}${probe.stdout}`);
const isJavaReady = javaMajor !== undefined && javaMajor >= MINIMUM_JAVA;
const skip = isJavaReady ? false : "Java 17 or newer is not installed";

function kotlinFiles(directory) {
  return readdirSync(directory)
    .filter(name => name.endsWith(".kt"))
    .map(name => join(directory, name));
}

function ruleIds(output) {
  return output
    .split("\n")
    .map(line => /^(.+?):\d+:\d+ {2}(?:ktlint|detekt)\/([\w-]+) /.exec(line))
    .filter(Boolean)
    .map(([, file, rule]) => `${file.split(/[\\/]/).pop()}:${rule}`);
}

function execute({ command, cwd }) {
  const [program, ...programArguments] = command;
  const { stdout, stderr } = spawnSync(program, programArguments, {
    encoding: "utf8",
    cwd,
    maxBuffer: 64 * 1024 * 1024
  });
  return `${stdout}${stderr}`;
}

async function jars() {
  const { ktlint, detekt } = JSON.parse(readFileSync(TOOLS_FILE, "utf8"));
  const [ktlintJar, detektJar] = await Promise.all(
    [ktlint, detekt].map(tool =>
      ensureTool({
        tool,
        cacheDirectory: CACHE
      })
    )
  );
  return {
    ktlint: resolve(ktlintJar),
    detekt: resolve(detektJar)
  };
}

async function report({ tool, files, cwd = process.cwd(), isFix = false }) {
  const [ktlint, detekt] = kotlinSteps({
    java: "java",
    tools: await jars(),
    presetDirectory: PRESET,
    changedFiles: files,
    projectFiles: [],
    isFix,
    platform: process.platform
  });
  const step = tool === "ktlint" ? ktlint : detekt;
  const { formatReport } = await import("avi12-lint/kotlin-report");
  return formatReport({
    tool,
    text: execute({
      command: step.commands?.[0] ?? step.command,
      cwd
    })
  });
}

function fileIds(output) {
  return ruleIds(output);
}

test("detekt reports each rule on its must-flag file and nothing on the must-not-flag file", { skip }, async () => {
  const flagFiles = kotlinFiles(join(FIXTURES, "detekt-flag"));
  const okFiles = kotlinFiles(join(FIXTURES, "ok"));
  const found = fileIds(
    await report({
      tool: "detekt",
      files: [...flagFiles, ...okFiles]
    })
  );
  for (const file of flagFiles) {
    const name = file.split(/[\\/]/).pop();
    const rule = name.replace(/\.kt$/, "");
    assert.ok(found.includes(`${name}:${rule}`), `${rule} did not flag ${name}`);
  }

  assert.deepEqual(
    found.filter(entry => entry.startsWith("AllClear.kt")),
    [],
    "the must-not-flag file was flagged"
  );
});

test("ktlint reports each rule on its must-flag file and nothing on the must-not-flag file", { skip }, async () => {
  const flagFiles = kotlinFiles(join(FIXTURES, "ktlint-flag"));
  const okFiles = kotlinFiles(join(FIXTURES, "ok"));
  const found = fileIds(
    await report({
      tool: "ktlint",
      files: [...flagFiles, ...okFiles]
    })
  );
  const expected = {
    "NoWildcardImports.kt": "no-wildcard-imports",
    "ImportOrdering.kt": "import-ordering",
    "NoUnusedImports.kt": "no-unused-imports",
    "Indent.kt": "indent",
    "Filename.kt": "filename"
  };
  for (const [name, rule] of Object.entries(expected)) {
    assert.ok(found.includes(`${name}:${rule}`), `${rule} did not flag ${name}`);
  }

  assert.deepEqual(
    found.filter(entry => entry.startsWith("AllClear.kt")),
    [],
    "the must-not-flag file was flagged"
  );
});

function digest(directory) {
  const hash = createHash("sha256");
  for (const file of kotlinFiles(directory)) {
    hash.update(readFileSync(file));
  }

  return hash.digest("hex");
}

test("ktlint --format is stable and detekt never rewrites a file", { skip }, async () => {
  const work = mkdtempSync(join(tmpdir(), "kotlin-clash-"));
  try {
    const target = join(work, "src");
    cpSync(join(FIXTURES, "ktlint-flag"), target, { recursive: true });
    cpSync(join(FIXTURES, "ok"), target, { recursive: true });
    cpSync(join(FIXTURES, "detekt-flag"), target, { recursive: true });
    const files = kotlinFiles(target);
    await report({
      tool: "ktlint",
      files,
      cwd: work,
      isFix: true
    });
    const once = digest(target);
    await report({
      tool: "ktlint",
      files,
      cwd: work,
      isFix: true
    });
    assert.equal(digest(target), once, "a second ktlint --format changed files");
    await report({
      tool: "detekt",
      files,
      cwd: work
    });
    assert.equal(digest(target), once, "detekt changed files");
  } finally {
    rmSync(work, {
      recursive: true,
      force: true
    });
  }
});
