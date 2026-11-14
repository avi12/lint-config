import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { FIXTURES, findingsOf, materialize, runCli, TOOLS } from "./support/cpp.js";

const FLAG = /\/\/ flag(-next)?: (.+)$/;
const SUPPORTED_MAJOR = 22;
const hasTools = Boolean(TOOLS.format && TOOLS.tidy);

function isSupportedVersion() {
  const probe = spawnSync(TOOLS.tidy, ["--version"], { encoding: "utf8" });
  return Number(/version (\d+)\./.exec(probe.stdout)?.[1]) === SUPPORTED_MAJOR;
}

const isRunnable = hasTools && isSupportedVersion();

function expectedFindings(source) {
  return source
    .split("\n")
    .flatMap((line, index) => {
      const match = FLAG.exec(line);
      if (!match) {
        return [];
      }

      const lineNumber = index + (match[1] ? 2 : 1);
      return match[2].split(",").map(id => `${id.trim()}@flag.cpp:${lineNumber}`);
    })
    .sort();
}

test("every configured check fires on the line the fixture marks and nowhere else", { skip: !isRunnable }, () => {
  const { directory, problems } = materialize({ fixture: "flag" });
  assert.deepEqual(problems, []);
  const { output } = runCli({ directory });
  const source = readFileSync(join(FIXTURES, "flag", "src", "flag.cpp"), "utf8");
  assert.deepEqual(findingsOf(output), expectedFindings(source));
});

test(
  "a clean unit passes clang-format and clang-tidy, and the second run is served by the cache",
  { skip: !isRunnable },
  () => {
    const { directory } = materialize({ fixture: "ok" });
    const first = runCli({ directory });
    assert.equal(first.status, 0, first.output);
    assert.match(first.output, /clang-tidy 1 units, 0 cached, 1 analysed/);
    const second = runCli({ directory });
    assert.equal(second.status, 0, second.output);
    assert.match(second.output, /clang-tidy 1 units, 1 cached, 0 analysed/);
  }
);

test(
  "touching a header of the unit invalidates its cache entry, and a finding in it fails the run",
  { skip: !isRunnable },
  () => {
    const { directory } = materialize({ fixture: "ok" });
    runCli({ directory });
    const header = join(directory, "src", "ok.h");
    writeFileSync(header, readFileSync(header, "utf8").replace("int total = 0;", "int Total_ = 0;"));
    const third = runCli({ directory });
    assert.equal(third.status, 1);
    assert.match(third.output, /clang-tidy 1 units, 0 cached, 1 analysed/);
    assert.match(third.output, /readability-identifier-naming/);
  }
);

test(
  "clang-format finds a misformatted file, fixes it in place, and a second pass changes nothing",
  { skip: !isRunnable },
  () => {
    const { directory } = materialize({ fixture: "ok" });
    const source = join(directory, "src", "ok.cpp");
    writeFileSync(source, readFileSync(source, "utf8").replace("total += amount;", "total   +=   amount ;"));
    const checked = runCli({ directory });
    assert.equal(checked.status, 1);
    assert.match(checked.output, /ok\.cpp:\d+:\d+: (?:error|warning): code should be clang-formatted/);
    const fixed = runCli({
      directory,
      args: ["--fix"]
    });
    assert.equal(fixed.status, 0, fixed.output);
    const formatted = readFileSync(source, "utf8");
    const again = runCli({
      directory,
      args: ["--fix"]
    });
    assert.equal(again.status, 0, again.output);
    assert.equal(readFileSync(source, "utf8"), formatted);
  }
);

test("clang-tidy --fix is opt in: a finding stays unless AVI12_LINT_TIDY_FIX is set", { skip: !isRunnable }, () => {
  const { directory } = materialize({ fixture: "ok" });
  const source = join(directory, "src", "ok.cpp");
  const dirty = readFileSync(source, "utf8").replace("return value;", "return value != 0 ? value : 0;");
  writeFileSync(
    source,
    `${dirty.replace("int Clamp(int value, int limit) {", "int Clamp(int value, int limit) {\n  void* none = 0;\n  (void)none;")}`
  );
  const plain = runCli({
    directory,
    args: ["--fix"]
  });
  assert.equal(plain.status, 1);
  assert.match(readFileSync(source, "utf8"), /void\* none = 0;/);
  const fixing = runCli({
    directory,
    args: ["--fix"],
    env: { AVI12_LINT_TIDY_FIX: "1" }
  });
  assert.match(readFileSync(source, "utf8"), /void\* none = nullptr;/, fixing.output);
});

test("--changed analyses only the units whose files changed", { skip: !isRunnable }, () => {
  const { directory } = materialize({ fixture: "ok" });
  spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base"], { cwd: directory });
  const clean = runCli({
    directory,
    args: ["--changed"]
  });
  assert.equal(clean.status, 0, clean.output);
  assert.doesNotMatch(clean.output, /clang-tidy \d+ units/);
});

test("every check the preset names exists in the installed clang-tidy", { skip: !isRunnable }, () => {
  const listing = spawnSync(TOOLS.tidy, ["--list-checks", "-checks=*"], { encoding: "utf8" });
  const known = new Set(listing.stdout.split(/\r?\n/).map(line => line.trim()));
  const preset = JSON.parse(readFileSync(join(FIXTURES, "..", "tidy.json"), "utf8"));
  const named = [
    ...preset.enable,
    ...Object.keys(preset.disable),
    ...Object.keys(preset.options).map(key => key.split(".")[0])
  ];
  const unknown = named.filter(check => !check.includes("*") && !known.has(check));
  assert.deepEqual(unknown, []);
});
