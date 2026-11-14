import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { clippyFindings, FIXTURES, hasCargoTool, materialize } from "./support/rust.js";

const FLAG = /\/\/ flag(-next)?: (.+)$/;
const hasClippy = hasCargoTool("clippy");
const hasFmt = hasCargoTool("fmt");

function expectedFindings(source) {
  return source
    .split("\n")
    .flatMap((line, index) => {
      const match = FLAG.exec(line);
      if (!match) {
        return [];
      }

      const lineNumber = index + (match[1] ? 2 : 1);
      return match[2].split(",").map(id => `${id.trim()}@src/lib.rs:${lineNumber}`);
    })
    .sort();
}

function cargo({ directory, args }) {
  return spawnSync("cargo", args, {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      CARGO_BUILD_JOBS: "2"
    }
  });
}

test("every configured lint fires on the line the fixture marks and nowhere else", { skip: !hasClippy }, () => {
  const { directory, problems } = materialize({ fixture: "flag" });
  assert.deepEqual(problems, []);
  const source = readFileSync(join(FIXTURES, "flag", "src", "lib.rs"), "utf8");
  assert.deepEqual(clippyFindings(directory), expectedFindings(source));
});

test("a clean crate raises nothing, and a test may unwrap", { skip: !hasClippy }, () => {
  const { directory } = materialize({ fixture: "ok" });
  assert.deepEqual(clippyFindings(directory), []);
});

test("a repo's local file changes a lint level", { skip: !hasClippy }, () => {
  const { directory } = materialize({
    fixture: "flag",
    local: '[clippy]\nunwrap_used = "allow"\n'
  });
  const found = clippyFindings(directory);
  assert.equal(
    found.some(item => item.startsWith("clippy::unwrap_used@")),
    false
  );
  assert.ok(found.some(item => item.startsWith("clippy::expect_used@")));
});

test("cargo fmt settles the layout in one pass and a second pass changes nothing", { skip: !hasFmt }, () => {
  const { directory } = materialize({ fixture: "fmt" });
  const lib = join(directory, "src", "lib.rs");
  assert.notEqual(
    cargo({
      directory,
      args: ["fmt", "--check"]
    }).status,
    0
  );
  cargo({
    directory,
    args: ["fmt"]
  });
  const once = readFileSync(lib, "utf8");
  assert.equal(
    cargo({
      directory,
      args: ["fmt", "--check"]
    }).status,
    0
  );
  cargo({
    directory,
    args: ["fmt"]
  });
  assert.equal(readFileSync(lib, "utf8"), once);
  assert.match(once, /Pair \{ left, right \}/);
});

test("clippy --fix then cargo fmt is stable and leaves clippy clean", { skip: !(hasClippy && hasFmt) }, () => {
  const { directory } = materialize({ fixture: "fix" });
  const lib = join(directory, "src", "lib.rs");
  function settle() {
    cargo({
      directory,
      args: ["clippy", "--fix", "--allow-dirty", "--allow-no-vcs", "--all-targets"]
    });
    cargo({
      directory,
      args: ["fmt"]
    });
    return readFileSync(lib, "utf8");
  }

  const once = settle();
  assert.equal(settle(), once);
  assert.equal(
    cargo({
      directory,
      args: ["fmt", "--check"]
    }).status,
    0
  );
  assert.deepEqual(clippyFindings(directory), []);
});

test("cargo deny accepts a crate with no dependencies", { skip: !hasCargoTool("deny") }, () => {
  const { directory } = materialize({ fixture: "ok" });
  cargo({
    directory,
    args: ["generate-lockfile"]
  });
  const result = cargo({
    directory,
    args: ["deny", "--config", "deny.toml", "--offline", "check"]
  });
  assert.equal(result.status, 0, result.stderr);
});

test("cargo machete passes a clean crate", { skip: !hasCargoTool("machete") }, () => {
  const { directory } = materialize({ fixture: "ok" });
  assert.equal(
    cargo({
      directory,
      args: ["machete"]
    }).status,
    0
  );
});
